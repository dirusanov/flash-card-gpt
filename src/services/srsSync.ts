import { srsSyncApi, SyncChange } from './cardsSyncApi';
import { CardSrsState, SrsGrade, normalizeSrsState } from './srs';
import { ReviewLogEntry } from './reviewLog';
import { StoredCard } from '../store/reducers/cards';

/**
 * Study-schedule sync, speaking the same protocol as the mobile app.
 *
 * Note *content* travels over /notes with `fields_json`; the *schedule* travels over
 * /sync/push and /sync/pull as `card` and `review_log` entities with flat SRS columns.
 * The mobile app's `noteToCard` ignores `fields_json.srsState` entirely, so this channel
 * is the only way a card reviewed here arrives on the phone already scheduled.
 *
 * Identity: the server keys cards by the note id. Locally that is `StoredCard.syncId`
 * (`StoredCard.id` is our own guid), so a card that has never reached the cloud has
 * nothing to sync yet.
 */

const CURSOR_KEY = 'vaulto_srs_sync_cursor';

const canUseExtensionStorage = () =>
    typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);

const readStored = async (key: string): Promise<string | null> => {
    if (canUseExtensionStorage()) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([key], (result) => {
                    if (chrome.runtime?.lastError) {
                        resolve(null);
                        return;
                    }
                    const value = result?.[key];
                    resolve(typeof value === 'string' ? value : null);
                });
            } catch {
                resolve(null);
            }
        });
    }
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeStored = async (key: string, value: string): Promise<void> => {
    if (canUseExtensionStorage()) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.set({ [key]: value }, () => resolve());
            } catch {
                resolve();
            }
        });
    }
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Losing the cursor only costs a re-pull of already-applied changes.
    }
};

export const getSrsCursor = async (): Promise<number> => {
    const raw = await readStored(CURSOR_KEY);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const setSrsCursor = (cursor: number): Promise<void> =>
    writeStored(CURSOR_KEY, String(cursor));

/**
 * The card half of a review, in the shape the mobile app pushes.
 *
 * `_apply_card_change` on the server reads only the five SRS fields; `front`/`back` are
 * ignored (the card row has no such columns — content lives on the note). They are sent
 * anyway purely to stay byte-compatible with the mobile client.
 */
export const buildCardChange = (
    noteId: string,
    card: Pick<StoredCard, 'deckId' | 'front' | 'back' | 'text' | 'translation'>,
    state: CardSrsState
): SyncChange => ({
    entity_type: 'card',
    op: 'upsert',
    entity_id: noteId,
    payload: {
        ...(card.deckId ? { deck_id: card.deckId } : {}),
        front: card.front || card.text || '',
        back: card.back || card.translation || '',
        due_at: state.srs_due_at,
        // The server column counts whole days; a sub-day "again" delay rounds to 0 here
        // while `due_at` keeps the real 10-minute time. Mobile rounds identically.
        interval_days: Math.max(0, Math.round(state.srs_interval_days)),
        ease_factor: state.srs_ease,
        repetitions: state.srs_reps,
        lapses: state.srs_lapses,
    },
});

/** The log half, so the phone's statistics include reviews done in the panel. */
export const buildReviewLogChange = (
    noteId: string,
    log: { id: string; grade: SrsGrade; reviewedAt: string; responseTimeMs: number | null }
): SyncChange => ({
    entity_type: 'review_log',
    op: 'upsert',
    payload: {
        card_id: noteId,
        client_review_id: log.id,
        grade: log.grade,
        reviewed_at: log.reviewedAt,
        response_time_ms: log.responseTimeMs,
    },
});

/**
 * Pushes one graded review. Silently does nothing for a card that has no `syncId` yet —
 * it has never been uploaded, so the server has no row to attach a schedule to.
 */
export const pushReview = async (
    baseUrl: string,
    accessToken: string,
    card: StoredCard,
    state: CardSrsState,
    log: ReviewLogEntry
): Promise<boolean> => {
    if (!card.syncId) return false;

    await srsSyncApi.push(baseUrl, accessToken, [
        buildCardChange(card.syncId, card, state),
        buildReviewLogChange(card.syncId, log),
    ]);
    return true;
};

export interface PulledSrs {
    /** Keyed by note id (`StoredCard.syncId`). */
    byNoteId: Record<string, CardSrsState>;
    cursor: number;
}

/**
 * Reads every schedule change since the stored cursor. The pull payload carries only SRS
 * columns — content stays with /notes — so this is merged onto existing cards rather than
 * creating any.
 */
export const pullSrsUpdates = async (
    baseUrl: string,
    accessToken: string
): Promise<PulledSrs> => {
    let cursor = await getSrsCursor();
    const byNoteId: Record<string, CardSrsState> = {};
    let hasMore = true;
    // A corrupt or never-advancing cursor must not spin forever.
    let pages = 0;

    while (hasMore && pages < 50) {
        pages += 1;
        const data = await srsSyncApi.pull(baseUrl, accessToken, cursor, 200);

        for (const change of data.changes) {
            if (change.entity_type !== 'card' || change.op === 'delete') continue;
            const payload = change.payload ?? {};
            byNoteId[change.entity_id] = normalizeSrsState({
                srs_due_at: payload.due_at,
                srs_interval_days: payload.interval_days,
                srs_ease: payload.ease_factor,
                srs_reps: payload.repetitions,
                srs_lapses: payload.lapses,
                srs_last_review_at: payload.last_reviewed_at ?? null,
            });
        }

        if (data.next_cursor > cursor) {
            cursor = data.next_cursor;
        }
        hasMore = data.changes.length >= 200 && data.next_cursor > data.cursor;
    }

    await setSrsCursor(cursor);
    return { byNoteId, cursor };
};
