/**
 * Storage for card images, in the extension's own origin.
 *
 * Images used to live in an IndexedDB opened from the content script, which meant they
 * belonged to whatever website the panel happened to be open on. Cards live in
 * chrome.storage.local and are visible everywhere, so a card created on one site showed no
 * image on any other — and the records sat under that site's storage quota, where the
 * browser is free to evict them and "clear browsing data" wipes them outright.
 *
 * Here every image is a separate key in chrome.storage.local, so writing one image does not
 * rewrite the rest, and the `unlimitedStorage` permission finally applies to them. An index
 * key tracks which cards have an image per scope, which is what makes it possible to drop
 * images whose cards are gone without enumerating the whole storage area.
 */

const IMAGE_KEY_PREFIX = 'vaulto_card_image';
const INDEX_KEY = 'vaulto_card_images_index';

type ScopeIndex = Record<string, string[]>;

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch {
    // Falls through: without extension storage there is nowhere to keep images.
  }
  return null;
};

export const buildCardImageKey = (scope: string, cardId: string): string =>
  `${IMAGE_KEY_PREFIX}:${scope}:${cardId}`;

const readKeys = (keys: string[] | null): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    const storage = getChromeStorage();
    if (!storage) {
      resolve({});
      return;
    }

    try {
      storage.get(keys as never, (items) => {
        resolve(chrome?.runtime?.lastError ? {} : items || {});
      });
    } catch {
      resolve({});
    }
  });

const writeValues = (values: Record<string, unknown>): Promise<boolean> =>
  new Promise((resolve) => {
    const storage = getChromeStorage();
    if (!storage) {
      resolve(false);
      return;
    }

    try {
      storage.set(values, () => resolve(!chrome?.runtime?.lastError));
    } catch {
      resolve(false);
    }
  });

const removeKeys = (keys: string[]): Promise<void> =>
  new Promise((resolve) => {
    const storage = getChromeStorage();
    if (!storage || keys.length === 0) {
      resolve();
      return;
    }

    try {
      storage.remove(keys, () => resolve());
    } catch {
      resolve();
    }
  });

// Index updates are read-modify-write, and the global and per-tab scopes are persisted from
// separate code paths that can overlap. Without this queue two concurrent saves would each
// write back an index built from the same snapshot, dropping the other's scope.
let indexQueue: Promise<unknown> = Promise.resolve();

const serialize = <T>(task: () => Promise<T>): Promise<T> => {
  const run = indexQueue.then(task, task);
  indexQueue = run.catch(() => undefined);
  return run;
};

const readIndex = async (): Promise<ScopeIndex> => {
  const stored = await readKeys([INDEX_KEY]);
  const raw = stored[INDEX_KEY];
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const result: ScopeIndex = {};
  Object.entries(raw as Record<string, unknown>).forEach(([scope, ids]) => {
    if (Array.isArray(ids)) {
      result[scope] = ids.filter((id): id is string => typeof id === 'string');
    }
  });
  return result;
};

const writeScopeIndex = async (scope: string, cardIds: string[]): Promise<void> => {
  const index = await readIndex();
  const previous = index[scope] ?? [];

  // Skipping an unchanged write keeps the index out of the hot path of every card save.
  if (previous.length === cardIds.length && previous.every((id, i) => id === cardIds[i])) {
    return;
  }

  if (cardIds.length === 0) {
    delete index[scope];
  } else {
    index[scope] = cardIds;
  }

  await writeValues({ [INDEX_KEY]: index });
};

/** Images for the given cards, keyed by card id. Cards without a stored image are absent. */
export const readCardImages = async (
  scope: string,
  cardIds: string[],
): Promise<Map<string, string>> => {
  const wanted = cardIds.filter(Boolean);
  const result = new Map<string, string>();
  if (wanted.length === 0) {
    return result;
  }

  const stored = await readKeys(wanted.map((cardId) => buildCardImageKey(scope, cardId)));
  wanted.forEach((cardId) => {
    const value = stored[buildCardImageKey(scope, cardId)];
    if (typeof value === 'string' && value) {
      result.set(cardId, value);
    }
  });

  return result;
};

/**
 * Stores the given images and forgets every other image in the scope. `imagesByCardId` is
 * the complete picture for `scope`, so anything missing from it is an orphan.
 */
export const replaceScopeImages = (
  scope: string,
  imagesByCardId: Map<string, string>,
): Promise<void> =>
  serialize(async () => {
    const index = await readIndex();
    const previousIds = index[scope] ?? [];
    const nextIds = Array.from(imagesByCardId.keys());

    const writes: Record<string, unknown> = {};
    imagesByCardId.forEach((image, cardId) => {
      writes[buildCardImageKey(scope, cardId)] = image;
    });

    if (Object.keys(writes).length > 0 && !(await writeValues(writes))) {
      // Storage refused the images — most likely a quota problem. Leaving the previous state
      // alone keeps the index honest about what is actually stored.
      return;
    }

    const staleKeys = previousIds
      .filter((cardId) => !imagesByCardId.has(cardId))
      .map((cardId) => buildCardImageKey(scope, cardId));

    await removeKeys(staleKeys);
    await writeScopeIndex(scope, nextIds);
  });

/** Applies a partial update without touching images of cards not mentioned. */
export const applyScopeImageMutations = (
  scope: string,
  upserts: Map<string, string>,
  removedCardIds: string[],
): Promise<void> =>
  serialize(async () => {
    if (upserts.size === 0 && removedCardIds.length === 0) {
      return;
    }

    const index = await readIndex();
    const currentIds = new Set(index[scope] ?? []);

    const writes: Record<string, unknown> = {};
    upserts.forEach((image, cardId) => {
      writes[buildCardImageKey(scope, cardId)] = image;
      currentIds.add(cardId);
    });

    if (Object.keys(writes).length > 0 && !(await writeValues(writes))) {
      return;
    }

    const removals: string[] = [];
    removedCardIds.filter(Boolean).forEach((cardId) => {
      removals.push(buildCardImageKey(scope, cardId));
      currentIds.delete(cardId);
    });

    await removeKeys(removals);
    await writeScopeIndex(scope, Array.from(currentIds));
  });
