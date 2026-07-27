import {
  cardsSyncApi,
  DeckApi,
  NoteApi,
  isCardsSyncApiError,
} from './cardsSyncApi';
import { StoredCard } from '../store/reducers/cards';
import { Modes } from '../constants';
import { authStorage } from './authStorage';
import { normalizeCardImageFields } from './cardImagePersistence';
import { normalizeSrsState } from './srs';

// Exported so the deck picker can name the deck cards actually land in when the user
// has not chosen one — it used to offer a misleading "(None) — Local Storage Only", then
// briefly "Vaulto Cards", which read as the app's own name rather than "a deck for
// unsorted cards". This is purely an extension-side convenience (quick capture without
// picking a deck first) — the mobile app has no equivalent concept at all; every card
// there requires an explicit deckId (DecksContext.addCard), so there is nothing on that
// side for this name to stay in sync with.
export const DEFAULT_DECK_NAME = 'Unsorted Deck';
const DEFAULT_DECK_COLOR = '#4f46e5';
const DEFAULT_DECK_DESCRIPTION =
  'Cards created from the Vaulto Cards browser extension';
const DEFAULT_SOURCE = 'extension';
const CLOUD_SYNC_LOCK_NAME = 'vaulto-cloud-card-sync';

let deckCache: DeckApi | null = null;
let notesIndexPromise: Promise<NotesIndex> | null = null;
let cloudSyncFallbackQueue: Promise<void> = Promise.resolve();

type NotesIndex = {
  byGuid: Map<string, NoteApi>;
  byId: Map<string, NoteApi>;
};

const buildFieldsJson = (card: StoredCard): Record<string, any> => {
  const front = card.front ?? card.text;
  const fallbackBack = card.back ?? card.translation ?? '';
  return {
    front,
    back: fallbackBack,
    text: card.text,
    translation: card.translation ?? '',
    examples: card.examples ?? [],
    image: card.image ?? null,
    imageUrl: card.imageUrl ?? null,
    linguisticInfo: card.linguisticInfo ?? '',
    transcription: card.transcription ?? '',
    wordAudio: card.wordAudio ?? null,
    examplesAudio: card.examplesAudio ?? [],
    exampleTranscriptions: card.exampleTranscriptions ?? [],
    // Study progress rides along with the note so a reinstall does not reset every
    // card's schedule back to "new".
    srsState: card.srsState ?? null,
  };
};

const buildTags = (card: StoredCard): string[] => {
  const tags = ['vaulto-extension'];
  if (card.mode) {
    tags.push(`mode:${card.mode}`);
  }
  return tags;
};

const buildNotesIndex = (notes: NoteApi[]): NotesIndex => {
  const byGuid = new Map<string, NoteApi>();
  const byId = new Map<string, NoteApi>();

  notes.forEach((note) => {
    if (note?.id) {
      byId.set(note.id, note);
    }

    if (note?.guid) {
      byGuid.set(note.guid, note);
    }
  });

  return { byGuid, byId };
};

const withCloudSyncLock = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  const locksApi = (globalThis as any)?.navigator?.locks;
  if (typeof locksApi?.request === 'function') {
    return locksApi.request(CLOUD_SYNC_LOCK_NAME, operation);
  }

  const run = cloudSyncFallbackQueue.catch(() => undefined).then(operation);

  cloudSyncFallbackQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

const normalizeFieldsJson = (
  fields: Record<string, any> | null | undefined
) => ({
  front: fields?.front ?? fields?.text ?? '',
  back: fields?.back ?? fields?.translation ?? '',
  text: fields?.text ?? fields?.front ?? '',
  translation: fields?.translation ?? '',
  examples: Array.isArray(fields?.examples) ? fields?.examples : [],
  image: fields?.image ?? null,
  imageUrl: fields?.imageUrl ?? null,
  linguisticInfo: fields?.linguisticInfo ?? '',
  transcription: fields?.transcription ?? '',
  wordAudio: fields?.wordAudio ?? null,
  examplesAudio: Array.isArray(fields?.examplesAudio)
    ? fields?.examplesAudio
    : [],
  exampleTranscriptions: Array.isArray(fields?.exampleTranscriptions)
    ? fields?.exampleTranscriptions
    : [],
});

const normalizeTags = (tags: string[] | null | undefined) =>
  Array.isArray(tags)
    ? [...tags].filter((tag): tag is string => typeof tag === 'string').sort()
    : [];

const isNoteEquivalentToCard = (
  note: NoteApi,
  fieldsJson: Record<string, any>,
  tags: string[]
) =>
  JSON.stringify(normalizeFieldsJson(note.fields_json)) ===
    JSON.stringify(normalizeFieldsJson(fieldsJson)) &&
  JSON.stringify(normalizeTags(note.tags)) ===
    JSON.stringify(normalizeTags(tags));

const getNoteMeta = (note: NoteApi) => ({
  id: note.id,
  version: note.version,
  source: note.source,
  tags: note.tags,
  deckId: note.deck_id ?? null,
});

const setNoteInIndex = (index: NotesIndex, note: NoteApi) => {
  if (note?.id) {
    index.byId.set(note.id, note);
  }

  if (note?.guid) {
    index.byGuid.set(note.guid, note);
  }
};

const removeNoteFromIndex = (
  index: NotesIndex,
  card: StoredCard,
  noteId?: string | null
) => {
  if (noteId) {
    index.byId.delete(noteId);
  }

  if (card.id) {
    index.byGuid.delete(card.id);
  }
};

const findExistingNoteForCard = (
  index: NotesIndex,
  card: StoredCard
): NoteApi | undefined => {
  if (card.syncId) {
    const byId = index.byId.get(card.syncId);
    if (byId) {
      return byId;
    }
  }

  if (card.id) {
    return index.byGuid.get(card.id);
  }

  return undefined;
};

const isVersionConflictError = (error: unknown): boolean =>
  isCardsSyncApiError(error) && /version conflict/i.test(error.message || '');

const inferMode = (note: NoteApi): Modes => {
  const modeTag = Array.isArray(note.tags)
    ? note.tags.find(
        (tag) => typeof tag === 'string' && tag.startsWith('mode:')
      )
    : null;
  const modeValue = modeTag ? modeTag.slice('mode:'.length) : null;
  if (
    modeValue === Modes.LanguageLearning ||
    modeValue === Modes.GeneralTopic
  ) {
    return modeValue;
  }

  const fields = note.fields_json || {};
  if (fields.translation || fields.examples) {
    return Modes.LanguageLearning;
  }
  return Modes.GeneralTopic;
};

const noteToStoredCard = (note: NoteApi): StoredCard | null => {
  if (note.is_deleted) {
    return null;
  }

  const fields = note.fields_json || {};
  const mode = inferMode(note);
  const createdAt = note.created_at ? new Date(note.created_at) : new Date();

  return {
    id: note.guid || note.id,
    mode,
    front: fields.front ?? fields.text ?? '',
    back: fields.back ?? fields.translation ?? null,
    text: fields.text ?? fields.front ?? '',
    translation: fields.translation ?? null,
    examples: Array.isArray(fields?.examples) ? fields.examples : [],
    image: fields.image ?? null,
    imageUrl: fields.imageUrl ?? null,
    createdAt,
    exportStatus: 'not_exported',
    linguisticInfo: fields.linguisticInfo ?? '',
    transcription: fields.transcription ?? '',
    wordAudio: fields.wordAudio ?? null,
    examplesAudio: Array.isArray(fields?.examplesAudio)
      ? fields.examplesAudio
      : [],
    exampleTranscriptions: Array.isArray(fields?.exampleTranscriptions)
      ? fields.exampleTranscriptions
      : [],
    syncId: note.id ?? null,
    syncVersion: typeof note.version === 'number' ? note.version : null,
    syncSource: note.source ?? null,
    syncTags: Array.isArray(note.tags) ? note.tags : null,
    syncPending: false,
    deckId: note.deck_id ?? null,
    ankiDeckName: null,
    srsState: fields.srsState ? normalizeSrsState(fields.srsState) : undefined,
  };
};

const loadNotesIndex = async (
  baseUrl: string,
  accessToken: string,
  forceRefresh = false
): Promise<NotesIndex> => {
  if (!forceRefresh && notesIndexPromise) {
    return notesIndexPromise;
  }

  notesIndexPromise = cardsSyncApi
    .listNotes(baseUrl, accessToken)
    .then((notes) => buildNotesIndex(notes))
    .catch((error) => {
      console.error('Failed to load notes index:', error);
      return {
        byGuid: new Map<string, NoteApi>(),
        byId: new Map<string, NoteApi>(),
      };
    });

  return notesIndexPromise;
};

const ensureDefaultDeck = async (
  baseUrl: string,
  accessToken: string
): Promise<DeckApi> => {
  if (deckCache) {
    return deckCache;
  }

  const storedDeckId = await authStorage.getDeckId();
  if (storedDeckId) {
    try {
      const decks = await cardsSyncApi.listDecks(baseUrl, accessToken);
      const found = decks.find((deck) => deck.id === storedDeckId);
      if (found) {
        deckCache = found;
        return found;
      }
    } catch (error) {
      console.error('Failed to validate cached deck id:', error);
    }
  }

  const decks = await cardsSyncApi.listDecks(baseUrl, accessToken);
  let deck = decks.find((item) => item.name === DEFAULT_DECK_NAME);

  if (!deck) {
    deck = await cardsSyncApi.createDeck(baseUrl, accessToken, {
      name: DEFAULT_DECK_NAME,
      description: DEFAULT_DECK_DESCRIPTION,
      color: DEFAULT_DECK_COLOR,
    });
  }

  deckCache = deck;
  await authStorage.setDeckId(deck.id);
  return deck;
};

const resolveVersionConflict = async (
  baseUrl: string,
  accessToken: string,
  card: StoredCard,
  fieldsJson: Record<string, any>,
  tags: string[],
  /** Null when the card has no explicit deck — see the note in `upsertCard`. */
  deckId: string | null,
  error: unknown
): Promise<{
  id: string;
  version: number;
  source: string;
  tags: string[];
  deckId: string | null;
} | null> => {
  if (!isVersionConflictError(error)) {
    return null;
  }

  const latestIndex = await loadNotesIndex(baseUrl, accessToken, true);
  const latestNote = findExistingNoteForCard(latestIndex, card);
  if (!latestNote?.id) {
    return null;
  }

  if (isNoteEquivalentToCard(latestNote, fieldsJson, tags)) {
    return getNoteMeta(latestNote);
  }

  if (!card.syncPending) {
    return null;
  }

  const updated = await cardsSyncApi.updateNote(
    baseUrl,
    accessToken,
    latestNote.id,
    {
      ...(deckId ? { deck_id: deckId } : {}),
      fields_json: fieldsJson,
      tags,
      source: DEFAULT_SOURCE,
      base_version: latestNote.version,
    }
  );

  setNoteInIndex(latestIndex, updated);
  return getNoteMeta(updated);
};

export const cardsSyncService = {
  async upsertCard(
    baseUrl: string,
    accessToken: string,
    card: StoredCard
  ): Promise<{
    id: string;
    version: number;
    source: string;
    tags: string[];
    deckId: string | null;
  }> {
    return withCloudSyncLock(async () => {
      let deck: DeckApi;
      if (card.deckId) {
        try {
          const decks = await cardsSyncApi.listDecks(baseUrl, accessToken);
          const found = decks.find((d) => d.id === card.deckId);
          if (found) {
            deck = found;
          } else {
            deck = await ensureDefaultDeck(baseUrl, accessToken);
          }
        } catch (error) {
          console.error(
            'Failed to fetch specific deck, falling back to default:',
            error
          );
          deck = await ensureDefaultDeck(baseUrl, accessToken);
        }
      } else {
        deck = await ensureDefaultDeck(baseUrl, accessToken);
      }

      const normalizedCardResult = await normalizeCardImageFields(card);
      if (normalizedCardResult.error) {
        console.warn(
          `Failed to normalize image before cloud sync for card ${card.id}:`,
          normalizedCardResult.error
        );
      }

      const normalizedCard = normalizedCardResult.normalizedValue;
      const fieldsJson = buildFieldsJson(normalizedCard);
      const tags = buildTags(normalizedCard);
      let index = await loadNotesIndex(baseUrl, accessToken);
      let existingNote = findExistingNoteForCard(index, normalizedCard);

      if (existingNote?.id) {
        if (isNoteEquivalentToCard(existingNote, fieldsJson, tags)) {
          if (!normalizedCard.syncPending) {
            return getNoteMeta(existingNote);
          }

          const latestIndex = await loadNotesIndex(baseUrl, accessToken, true);
          const latestNote = findExistingNoteForCard(latestIndex, normalizedCard);
          if (latestNote?.id) {
            if (isNoteEquivalentToCard(latestNote, fieldsJson, tags)) {
              return getNoteMeta(latestNote);
            }

            index = latestIndex;
            existingNote = latestNote;
          }
        }

        try {
          const updated = await cardsSyncApi.updateNote(
            baseUrl,
            accessToken,
            existingNote.id,
            {
              // Only claim a deck when the card actually has one. `deck` falls back to
              // the default deck, and since the server now honours deck_id on update,
              // sending that fallback would drag a card filed elsewhere (on the phone,
              // say) back into the default deck on the next edit. No local deck means
              // "no opinion" — leave the server's.
              ...(normalizedCard.deckId ? { deck_id: deck.id } : {}),
              fields_json: fieldsJson,
              tags,
              source: DEFAULT_SOURCE,
              ...(typeof existingNote.version === 'number'
                ? { base_version: existingNote.version }
                : {}),
            }
          );
          setNoteInIndex(index, updated);
          return getNoteMeta(updated);
        } catch (error) {
          const resolved = await resolveVersionConflict(
            baseUrl,
            accessToken,
            normalizedCard,
            fieldsJson,
            tags,
            normalizedCard.deckId ? deck.id : null,
            error
          );
          if (resolved) {
            return resolved;
          }
          throw error;
        }
      }

      try {
        const created = await cardsSyncApi.createNote(baseUrl, accessToken, {
          deck_id: deck.id,
          guid: normalizedCard.id,
          fields_json: fieldsJson,
          tags,
          source: DEFAULT_SOURCE,
        });
        setNoteInIndex(index, created);
        return getNoteMeta(created);
      } catch (error) {
        const latestIndex = await loadNotesIndex(baseUrl, accessToken, true);
        const latestNote = findExistingNoteForCard(latestIndex, normalizedCard);
        if (!latestNote?.id) {
          throw error;
        }

        if (isNoteEquivalentToCard(latestNote, fieldsJson, tags)) {
          return getNoteMeta(latestNote);
        }

        if (!normalizedCard.syncPending) {
          throw error;
        }

        const updated = await cardsSyncApi.updateNote(
          baseUrl,
          accessToken,
          latestNote.id,
          {
            fields_json: fieldsJson,
            tags,
            source: DEFAULT_SOURCE,
            base_version: latestNote.version,
          }
        );
        setNoteInIndex(latestIndex, updated);
        return getNoteMeta(updated);
      }
    });
  },

  async deleteCard(
    baseUrl: string,
    accessToken: string,
    card: StoredCard
  ): Promise<void> {
    await withCloudSyncLock(async () => {
      let noteId = card.syncId;
      let baseVersion: number | undefined =
        typeof card.syncVersion === 'number' ? card.syncVersion : undefined;

      if (!noteId) {
        const index = await loadNotesIndex(baseUrl, accessToken);
        const note = findExistingNoteForCard(index, card);
        if (note) {
          noteId = note.id;
          baseVersion = note.version;
        }
      }

      if (!noteId) {
        return;
      }

      try {
        await cardsSyncApi.deleteNote(
          baseUrl,
          accessToken,
          noteId,
          baseVersion
        );
      } catch (error) {
        if (!isVersionConflictError(error)) {
          throw error;
        }

        const latestIndex = await loadNotesIndex(baseUrl, accessToken, true);
        const latestNote = findExistingNoteForCard(latestIndex, card);
        if (!latestNote?.id) {
          return;
        }

        noteId = latestNote.id;
        await cardsSyncApi.deleteNote(
          baseUrl,
          accessToken,
          latestNote.id,
          latestNote.version
        );
      }

      const index = await loadNotesIndex(baseUrl, accessToken);
      removeNoteFromIndex(index, card, noteId);
    });
  },

  async syncAll(
    baseUrl: string,
    accessToken: string,
    cards: StoredCard[]
  ): Promise<void> {
    for (const card of cards) {
      try {
        await this.upsertCard(baseUrl, accessToken, card);
      } catch (error) {
        console.error('Failed to sync card', card.id, error);
      }
    }
  },

  async fetchRemoteCards(
    baseUrl: string,
    accessToken: string
  ): Promise<StoredCard[]> {
    const index = await loadNotesIndex(baseUrl, accessToken, true);
    return Array.from(index.byId.values())
      .map((note) => noteToStoredCard(note))
      .filter((card): card is StoredCard => !!card);
  },

  resetCache() {
    deckCache = null;
    notesIndexPromise = null;
  },
};
