import { backgroundFetch } from './backgroundFetch';

const CARDS_SYNC_API_URL = 'https://api-cards.vaultonote.com';

class CardsSyncApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export type DeckApi = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_deleted: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type NoteApi = {
  id: string;
  deck_id: string;
  note_type_id: string | null;
  fields_json: Record<string, any>;
  tags: string[];
  guid: string;
  source: string;
  is_deleted: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

const parseErrorMessage = async (response: { json: <T>() => Promise<T> } & { status: number }): Promise<string> => {
  try {
    const data = (await response.json()) as Record<string, any>;
    return data?.detail?.message ?? data?.detail ?? data?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const requestJson = async <T>(
  path: string,
  init: { method: string; body?: string; headers?: Record<string, string> },
  accessToken: string,
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
    Authorization: `Bearer ${accessToken}`,
  };

  const response = await backgroundFetch(`${CARDS_SYNC_API_URL}${path}`, {
    method: init.method,
    headers,
    body: init.body,
  });

  if (!response.ok) {
    const message = await parseErrorMessage({ json: () => response.json(), status: response.status });
    throw new CardsSyncApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const cardsSyncApi = {
  listDecks(accessToken: string): Promise<DeckApi[]> {
    return requestJson<DeckApi[]>('/decks', { method: 'GET' }, accessToken);
  },

  createDeck(
    accessToken: string,
    payload: { name: string; description: string; color: string },
  ): Promise<DeckApi> {
    return requestJson<DeckApi>(
      '/decks',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  updateDeck(
    accessToken: string,
    deckId: string,
    payload: { name?: string; description?: string; color?: string; base_version?: number },
  ): Promise<DeckApi> {
    return requestJson<DeckApi>(
      `/decks/${deckId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  deleteDeck(accessToken: string, deckId: string): Promise<DeckApi> {
    return requestJson<DeckApi>(
      `/decks/${deckId}`,
      {
        method: 'DELETE',
      },
      accessToken,
    );
  },

  listNotes(accessToken: string): Promise<NoteApi[]> {
    return requestJson<NoteApi[]>('/notes', { method: 'GET' }, accessToken);
  },

  createNote(
    accessToken: string,
    payload: {
      deck_id: string;
      fields_json: Record<string, any>;
      tags: string[];
      guid: string;
      source: string;
      note_type_id?: string | null;
    },
  ): Promise<NoteApi> {
    return requestJson<NoteApi>(
      '/notes',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  updateNote(
    accessToken: string,
    noteId: string,
    payload: {
      fields_json?: Record<string, any>;
      tags?: string[];
      source?: string;
      base_version?: number;
    },
  ): Promise<NoteApi> {
    return requestJson<NoteApi>(
      `/notes/${noteId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  deleteNote(accessToken: string, noteId: string, baseVersion?: number): Promise<{ applied: number }> {
    return requestJson<{ applied: number }>(
      '/sync/push',
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: 'vaulto-extension',
          platform: 'web',
          changes: [
            {
              entity_type: 'note',
              op: 'delete',
              entity_id: noteId,
              ...(typeof baseVersion === 'number' ? { base_version: baseVersion } : {}),
              payload: {},
            },
          ],
        }),
      },
      accessToken,
    );
  },
};

export const isCardsSyncApiError = (error: unknown): error is CardsSyncApiError =>
  error instanceof CardsSyncApiError;
