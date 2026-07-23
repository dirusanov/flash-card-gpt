/**
 * Versions up to 5.0.26 mirrored the OpenAI API key and the Vaulto auth session into
 * window.localStorage. A content script shares localStorage with the origin it runs on,
 * so those values were readable by any script on every visited site.
 *
 * The write paths no longer touch localStorage. This module rescues what was already left
 * behind on affected origins: values move into chrome.storage.local (only when it holds
 * nothing for that key yet) and are then deleted from the page.
 */

const LEGACY_API_KEYS = 'anki_api_keys_v1';
const LEGACY_AUTH_SESSION = 'vaulto_extension_auth_v1';
const LEGACY_DECK_ID = 'vaulto_extension_cards_deck_v1';

const LEGACY_MIRRORED_KEYS = [LEGACY_API_KEYS, LEGACY_AUTH_SESSION, LEGACY_DECK_ID] as const;

type LegacyKey = typeof LEGACY_MIRRORED_KEYS[number];

type Leftover = {
  key: LegacyKey;
  raw: string;
};

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch (error) {
    console.error('Unable to access chrome.storage.local during legacy cleanup:', error);
  }
  return null;
};

const readLegacyValue = (key: LegacyKey): string | null => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const removeLegacyValue = (key: LegacyKey) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A page may deny localStorage access entirely; nothing to clean up in that case.
  }
};

// The deck id was mirrored as a bare string, the other two as JSON.
const parseLegacyValue = (key: LegacyKey, raw: string): unknown =>
  key === LEGACY_DECK_ID ? raw : JSON.parse(raw);

const collectLeftovers = (): Leftover[] =>
  LEGACY_MIRRORED_KEYS.reduce<Leftover[]>((acc, key) => {
    const raw = readLegacyValue(key);
    if (raw) {
      acc.push({ key, raw });
    }
    return acc;
  }, []);

const readExtensionStorage = (
  storage: chrome.storage.LocalStorageArea,
  keys: LegacyKey[],
): Promise<Record<string, unknown>> =>
  new Promise((resolve) => {
    try {
      storage.get(keys, (items) => {
        if (chrome?.runtime?.lastError) {
          resolve({});
          return;
        }
        resolve(items || {});
      });
    } catch {
      resolve({});
    }
  });

const writeExtensionStorage = (
  storage: chrome.storage.LocalStorageArea,
  values: Record<string, unknown>,
): Promise<boolean> =>
  new Promise((resolve) => {
    try {
      storage.set(values, () => resolve(!chrome?.runtime?.lastError));
    } catch {
      resolve(false);
    }
  });

/**
 * Runs on every page the content script touches, so the fast path — nothing left to clean —
 * costs three localStorage reads and returns synchronously.
 */
export const migrateAndPurgeLegacyLocalStorage = async (): Promise<void> => {
  const leftovers = collectLeftovers();
  if (leftovers.length === 0) {
    return;
  }

  const storage = getChromeStorage();
  if (!storage) {
    // Without extension storage there is nowhere to move the values to, and deleting them
    // would destroy a key the user may never have entered anywhere else. Leave the mirror
    // for the next page load, which is the common case after an extension context is lost.
    return;
  }

  const existing = await readExtensionStorage(
    storage,
    leftovers.map((leftover) => leftover.key),
  );

  const rescued: Record<string, unknown> = {};
  leftovers.forEach(({ key, raw }) => {
    // Extension storage is the source of truth; never overwrite it with a stale mirror.
    if (existing[key] !== undefined) {
      return;
    }
    try {
      rescued[key] = parseLegacyValue(key, raw);
    } catch {
      // Corrupted mirror — drop it rather than importing garbage.
    }
  });

  if (Object.keys(rescued).length > 0) {
    const written = await writeExtensionStorage(storage, rescued);
    if (!written) {
      // Leave the mirror in place so a later attempt can still rescue it.
      return;
    }
  }

  leftovers.forEach(({ key }) => removeLegacyValue(key));
};
