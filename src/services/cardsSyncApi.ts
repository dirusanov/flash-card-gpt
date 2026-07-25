import { backgroundFetch } from './backgroundFetch';

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
  baseUrl: string,
  path: string,
  init: { method: string; body?: string; headers?: Record<string, string> },
  accessToken: string,
): Promise<T> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
    Authorization: `Bearer ${accessToken}`,
  };

  const response = await backgroundFetch(`${baseUrl}${path}`, {
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
  listDecks(baseUrl: string, accessToken: string): Promise<DeckApi[]> {
    return requestJson<DeckApi[]>(baseUrl, '/decks', { method: 'GET' }, accessToken);
  },

  createDeck(
    baseUrl: string,
    accessToken: string,
    payload: { name: string; description: string; color: string },
  ): Promise<DeckApi> {
    return requestJson<DeckApi>(
      baseUrl,
      '/decks',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  updateDeck(
    baseUrl: string,
    accessToken: string,
    deckId: string,
    payload: { name?: string; description?: string; color?: string; base_version?: number },
  ): Promise<DeckApi> {
    return requestJson<DeckApi>(
      baseUrl,
      `/decks/${deckId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  deleteDeck(baseUrl: string, accessToken: string, deckId: string): Promise<DeckApi> {
    return requestJson<DeckApi>(
      baseUrl,
      `/decks/${deckId}`,
      {
        method: 'DELETE',
      },
      accessToken,
    );
  },

  listNotes(baseUrl: string, accessToken: string): Promise<NoteApi[]> {
    return requestJson<NoteApi[]>(baseUrl, '/notes', { method: 'GET' }, accessToken);
  },

  createNote(
    baseUrl: string,
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
      baseUrl,
      '/notes',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  updateNote(
    baseUrl: string,
    accessToken: string,
    noteId: string,
    payload: {
      deck_id?: string;
      fields_json?: Record<string, any>;
      tags?: string[];
      source?: string;
      base_version?: number;
    },
  ): Promise<NoteApi> {
    return requestJson<NoteApi>(
      baseUrl,
      `/notes/${noteId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
      accessToken,
    );
  },

  deleteNote(baseUrl: string, accessToken: string, noteId: string, baseVersion?: number): Promise<{ applied: number }> {
    return requestJson<{ applied: number }>(
      baseUrl,
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

// Server-side study statistics, aggregated over every device's review logs. Review logs
// are pushed up but never come back down (/sync/pull carries no review_log entries), so
// this endpoint is the only way for the numbers to include reviews done on the phone.
export type CardsStatsApi = {
  today: { due: number; overdue: number; new_cards: number; estimated_time_min: number; total_studied: number };
  pipeline: { new_cards: number; learning: number; reviewing: number; mature: number; total: number };
  heatmap: Record<string, { count: number; time_ms: number }>;
  retention: { date: string; good_or_easy: number; total: number }[];
  forecast: { date: string; due: number }[];
  streak: { current: number; max: number; active_this_week: number; best_day: number };
};

export const cardsStatsApi = {
  get(baseUrl: string, accessToken: string): Promise<CardsStatsApi> {
    return requestJson<CardsStatsApi>(baseUrl, '/cards/stats', { method: 'GET' }, accessToken);
  },
};

// ─── /sync protocol ───────────────────────────────────────────────────────────
// The study schedule travels on a different channel from note content: the mobile app
// pushes `card` and `review_log` entities here, with flat SRS columns, and reads them
// back through the cursor-based pull. Matching this exactly is what makes a card
// reviewed in the panel show up already-scheduled on the phone.

export type SyncChange = {
  entity_type: 'card' | 'review_log' | 'note';
  op: 'upsert' | 'delete';
  entity_id?: string;
  payload: Record<string, any>;
};

export type SyncPullChange = {
  cursor: number;
  entity_type: string;
  entity_id: string;
  op: string;
  version: number;
  changed_at: string;
  payload?: Record<string, any>;
};

export type SyncPullResponse = {
  cursor: number;
  next_cursor: number;
  changes: SyncPullChange[];
};

// `platform: 'web'` and this client id are what the extension already sends when it
// deletes a note through /sync/push, so the server is known to accept them.
const SYNC_CLIENT_ID = 'vaulto-extension';
const SYNC_PLATFORM = 'web';

export const srsSyncApi = {
  push(baseUrl: string, accessToken: string, changes: SyncChange[]): Promise<{ applied: number }> {
    return requestJson<{ applied: number }>(
      baseUrl,
      '/sync/push',
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: SYNC_CLIENT_ID,
          platform: SYNC_PLATFORM,
          changes,
        }),
      },
      accessToken,
    );
  },

  pull(baseUrl: string, accessToken: string, cursor: number, limit = 200): Promise<SyncPullResponse> {
    return requestJson<SyncPullResponse>(
      baseUrl,
      `/sync/pull?cursor=${cursor}&limit=${limit}`,
      { method: 'GET' },
      accessToken,
    );
  },
};
