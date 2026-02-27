import { cardsSyncApi, DeckApi, NoteApi } from './cardsSyncApi';
import { StoredCard } from '../store/reducers/cards';
import { authStorage } from './authStorage';

const DEFAULT_DECK_NAME = 'Vaulto Extension';
const DEFAULT_DECK_COLOR = '#4f46e5';
const DEFAULT_DECK_DESCRIPTION = 'Cards created from the browser extension';
const DEFAULT_SOURCE = 'extension';

let deckCache: DeckApi | null = null;
let notesIndexPromise: Promise<Map<string, NoteApi>> | null = null;

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
  };
};

const buildTags = (card: StoredCard): string[] => {
  const tags = ['vaulto-extension'];
  if (card.mode) {
    tags.push(`mode:${card.mode}`);
  }
  return tags;
};

const loadNotesIndex = async (baseUrl: string, accessToken: string): Promise<Map<string, NoteApi>> => {
  if (notesIndexPromise) {
    return notesIndexPromise;
  }

  notesIndexPromise = cardsSyncApi
    .listNotes(baseUrl, accessToken)
    .then((notes) => {
      const map = new Map<string, NoteApi>();
      notes.forEach((note) => {
        if (note.guid) {
          map.set(note.guid, note);
        }
      });
      return map;
    })
    .catch((error) => {
      console.error('Failed to load notes index:', error);
      return new Map();
    });

  return notesIndexPromise;
};

const ensureDefaultDeck = async (baseUrl: string, accessToken: string): Promise<DeckApi> => {
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

export const cardsSyncService = {
  async upsertCard(baseUrl: string, accessToken: string, card: StoredCard): Promise<{ id: string; version: number; source: string; tags: string[] }> {
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
        console.error('Failed to fetch specific deck, falling back to default:', error);
        deck = await ensureDefaultDeck(baseUrl, accessToken);
      }
    } else {
      deck = await ensureDefaultDeck(baseUrl, accessToken);
    }

    const fieldsJson = buildFieldsJson(card);
    const tags = buildTags(card);

    let existingNote: NoteApi | undefined;
    if (card.syncId) {
      existingNote = { id: card.syncId } as NoteApi;
    } else {
      const index = await loadNotesIndex(baseUrl, accessToken);
      existingNote = index.get(card.id);
    }

    if (existingNote?.id) {
      const updated = await cardsSyncApi.updateNote(baseUrl, accessToken, existingNote.id, {
        fields_json: fieldsJson,
        tags,
        source: DEFAULT_SOURCE,
        ...(typeof card.syncVersion === 'number' ? { base_version: card.syncVersion } : {}),
      });
      const index = await loadNotesIndex(baseUrl, accessToken);
      index.set(card.id, updated);
      return {
        id: updated.id,
        version: updated.version,
        source: updated.source,
        tags: updated.tags,
      };
    }

    const created = await cardsSyncApi.createNote(baseUrl, accessToken, {
      deck_id: deck.id,
      guid: card.id,
      fields_json: fieldsJson,
      tags,
      source: DEFAULT_SOURCE,
    });
    const index = await loadNotesIndex(baseUrl, accessToken);
    index.set(card.id, created);

    return {
      id: created.id,
      version: created.version,
      source: created.source,
      tags: created.tags,
    };
  },

  async deleteCard(baseUrl: string, accessToken: string, card: StoredCard): Promise<void> {
    let noteId = card.syncId;
    let baseVersion: number | undefined =
      typeof card.syncVersion === 'number' ? card.syncVersion : undefined;

    if (!noteId) {
      const index = await loadNotesIndex(baseUrl, accessToken);
      const note = index.get(card.id);
      if (note) {
        noteId = note.id;
        baseVersion = note.version;
      }
    }

    if (!noteId) {
      return;
    }

    await cardsSyncApi.deleteNote(baseUrl, accessToken, noteId, baseVersion);
    const index = await loadNotesIndex(baseUrl, accessToken);
    index.delete(card.id);
  },

  async syncAll(baseUrl: string, accessToken: string, cards: StoredCard[]): Promise<void> {
    for (const card of cards) {
      try {
        await this.upsertCard(baseUrl, accessToken, card);
      } catch (error) {
        console.error('Failed to sync card', card.id, error);
      }
    }
  },

  resetCache() {
    deckCache = null;
    notesIndexPromise = null;
  },
};
