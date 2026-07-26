import { ThunkAction } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from '..';
import { VaultoDeck, SET_VAULTO_DECKS, UPSERT_VAULTO_DECK, DELETE_VAULTO_DECK } from '../reducers/vaultoDecks';
import { loadVaultoDecksFromStorage, saveVaultoDecksToStorage } from '../../services/vaultoDecksStorage';
import { cardsSyncApi } from '../../services/cardsSyncApi';
import { updateStoredCard } from './cards';
import { setSelectedBackendDeckId } from './settings';
import { ensureValidAccessToken } from '../utils/auth';

type Thunk<T = void> = ThunkAction<Promise<T>, RootState, void, AnyAction>;
type GetState = () => RootState;
type Dispatch = (action: any) => any;

const generateId = (): string =>
    (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const deckExists = (getState: GetState, id: string): boolean =>
    getState().vaultoDecks.decks.some((d) => d.id === id);

// A card whose deckId still points at a deck's *old* local id (from before that deck
// reached the server) would silently get filed into the default deck by
// cardsSyncService.upsertCard the next time it syncs — that function only recognises a
// real server deck UUID. So every time a deck's id changes (local id -> server id), every
// card pointing at the old id, plus the sticky "current destination" setting, must be
// rewritten in the same step.
const repointCardsAndSelection = (
    dispatch: Dispatch,
    getState: GetState,
    oldId: string,
    newId: string,
    newName: string,
): void => {
    getState().cards.storedCards
        .filter((card) => card.deckId === oldId)
        .forEach((card) => dispatch(updateStoredCard({ ...card, deckId: newId })));

    if (getState().settings.selectedBackendDeckId === oldId) {
        dispatch(setSelectedBackendDeckId({ id: newId, name: newName }));
    }
};

const persist = async (getState: GetState): Promise<void> => {
    await saveVaultoDecksToStorage(getState().vaultoDecks.decks);
};

const requestWithAuth = async <T>(
    dispatch: Dispatch,
    getState: GetState,
    request: (token: string) => Promise<T>
): Promise<T> => {
    let token = await ensureValidAccessToken({ getState, dispatch });
    if (!token) throw new Error('User is not authenticated or session expired');

    try {
        return await request(token);
    } catch (error: any) {
        if (error?.status === 401) {
            token = await ensureValidAccessToken({ getState, dispatch }, true);
            if (token) return await request(token);
        }
        throw error;
    }
};

// Finishes pushing a brand-new deck to the server: repoints cards/selection onto the real
// id, and folds in whatever the deck's *current* name is (not the name it was created
// with) in case it was renamed locally while the request was in flight — a stale spread
// here would silently revert that rename the moment this resolves. If the deck was
// deleted locally in that same window, this bails out instead of resurrecting it.
// Callers are responsible for persisting afterwards — this only touches in-memory state.
const finalizeCreatedDeck = (
    dispatch: Dispatch,
    getState: GetState,
    oldId: string,
    created: { id: string; name: string; version: number }
): void => {
    const current = getState().vaultoDecks.decks.find((d) => d.id === oldId);
    if (!current) return; // deleted locally while the request was in flight

    // The server was told the name at request time; if it's since changed locally, the
    // server copy is now stale — leave it pending so the next sync pass pushes a rename.
    const nameDivergedDuringRequest = current.name !== created.name;

    // Add the new, server-backed entry *before* touching anything that still points at
    // the old id (repointCardsAndSelection, then the delete below). These are three
    // separate dispatches with no `await` between them, but each still triggers its own
    // store update — this order guarantees a re-render caught between any two of them
    // never sees `selectedBackendDeckId`/`activeDeckId` pointing at a deck id that
    // doesn't exist yet, which would otherwise trip the "deck disappeared" reset effects
    // in DeckSelector.tsx and StoredCards.tsx.
    dispatch({
        type: UPSERT_VAULTO_DECK,
        payload: {
            ...current,
            id: created.id,
            syncId: created.id,
            syncVersion: created.version,
            syncPending: nameDivergedDuringRequest,
        } as VaultoDeck,
    });
    repointCardsAndSelection(dispatch, getState, oldId, created.id, created.name);
    dispatch({ type: DELETE_VAULTO_DECK, payload: oldId });
};

export const loadVaultoDecks = (): Thunk => async (dispatch, getState) => {
    const decks = await loadVaultoDecksFromStorage();
    dispatch({ type: SET_VAULTO_DECKS, payload: decks });
};

// Local-first: the deck exists and is usable the instant this returns, logged in or not —
// the Vaulto Cloud push (when signed in) happens in the background and is never awaited
// by the caller, so creating a deck never blocks on the network.
export const createVaultoDeck = (name: string): Thunk<VaultoDeck> => async (dispatch, getState) => {
    const now = new Date().toISOString();
    const deck: VaultoDeck = {
        id: generateId(),
        syncId: null,
        syncVersion: null,
        syncPending: true,
        name,
        createdAt: now,
        updatedAt: now,
    };

    dispatch({ type: UPSERT_VAULTO_DECK, payload: deck });
    await persist(getState);

    const { syncApiUrl } = getState().settings;
    if (getState().auth.accessToken) {
        (async () => {
            try {
                const created = await requestWithAuth(dispatch, getState, (token) =>
                    cardsSyncApi.createDeck(syncApiUrl, token, { name, description: '', color: '#4f46e5' })
                );
                finalizeCreatedDeck(dispatch, getState, deck.id, created);
                await persist(getState);
            } catch (error) {
                console.warn('Could not create deck on Vaulto Cloud yet, keeping it local-only for now:', error);
            }
        })();
    }

    return deck;
};

// Local-first: renames instantly, pushes to Vaulto Cloud in the background when signed in.
export const renameVaultoDeck = (id: string, name: string): Thunk => async (dispatch, getState) => {
    const deck = getState().vaultoDecks.decks.find((d) => d.id === id);
    if (!deck) return;

    const updated: VaultoDeck = { ...deck, name, syncPending: true, updatedAt: new Date().toISOString() };
    dispatch({ type: UPSERT_VAULTO_DECK, payload: updated });
    await persist(getState);

    const { syncApiUrl } = getState().settings;
    if (!getState().auth.accessToken || !deck.syncId) return;

    (async () => {
        try {
            const result = await requestWithAuth(dispatch, getState, (token) =>
                cardsSyncApi.updateDeck(syncApiUrl, token, deck.syncId as string, {
                    name,
                    base_version: deck.syncVersion ?? undefined,
                })
            );
            // The deck may have been deleted, or renamed again, while this was in flight —
            // only settle syncPending if the name this call confirmed is still current.
            const current = getState().vaultoDecks.decks.find((d) => d.id === id);
            if (!current) return;
            dispatch({
                type: UPSERT_VAULTO_DECK,
                payload: {
                    ...current,
                    syncVersion: result.version,
                    syncPending: current.name !== name,
                },
            });
            await persist(getState);
        } catch (error) {
            console.warn('Could not rename deck on Vaulto Cloud yet, will retry on next sync:', error);
        }
    })();
};

// Cards in the deleted deck move to `moveCardsToId` (or become deckless) immediately and
// locally — deleting is not held up waiting on the network. The server delete, when
// reachable, is best-effort and runs in the background: a rare failure here just leaves
// an orphan deck on the server that the phone app can clean up, rather than blocking or
// losing local state.
export const deleteVaultoDeck = (id: string, moveCardsToId: string | null): Thunk => async (dispatch, getState) => {
    const decks = getState().vaultoDecks.decks;
    const deck = decks.find((d) => d.id === id);
    if (!deck) return;

    getState().cards.storedCards
        .filter((card) => card.deckId === id)
        .forEach((card) => dispatch(updateStoredCard({ ...card, deckId: moveCardsToId })));

    dispatch({ type: DELETE_VAULTO_DECK, payload: id });
    await persist(getState);

    const { syncApiUrl } = getState().settings;
    if (!getState().auth.accessToken || !deck.syncId) return;

    const moveToSyncId = moveCardsToId
        ? decks.find((d) => d.id === moveCardsToId)?.syncId ?? undefined
        : undefined;

    (async () => {
        try {
            await requestWithAuth(dispatch, getState, (token) =>
                cardsSyncApi.deleteDeck(syncApiUrl, token, deck.syncId as string, moveToSyncId)
            );
        } catch (error) {
            console.warn('Could not delete deck on Vaulto Cloud (it may still be visible there):', error);
        }
    })();
};

// Runs once per sign-in/session: pulls decks known to the server (so a deck created on
// the phone shows up here too) and pushes anything created here while offline. Deck
// creation is retried through the same finalize path a first attempt uses, so a deck that
// failed to reach the server on `createVaultoDeck` self-heals the next time this runs.
export const syncVaultoDecksWithServer = (): Thunk => async (dispatch, getState) => {
    if (!getState().auth.accessToken) return;

    const { syncApiUrl } = getState().settings;

    try {
        const remoteDecks = await requestWithAuth(dispatch, getState, (token) =>
            cardsSyncApi.listDecks(syncApiUrl, token)
        );

        remoteDecks.forEach((remote) => {
            const local = getState().vaultoDecks.decks.find((d) => d.syncId === remote.id);
            if (!local) {
                dispatch({
                    type: UPSERT_VAULTO_DECK,
                    payload: {
                        id: remote.id,
                        syncId: remote.id,
                        syncVersion: remote.version,
                        syncPending: false,
                        name: remote.name,
                        createdAt: remote.created_at,
                        updatedAt: remote.updated_at,
                    } as VaultoDeck,
                });
            } else if (!local.syncPending && (local.name !== remote.name || local.syncVersion !== remote.version)) {
                // Not overwriting a locally pending rename: it hasn't been confirmed yet,
                // so the server's copy is the stale one here.
                dispatch({
                    type: UPSERT_VAULTO_DECK,
                    payload: { ...local, name: remote.name, syncVersion: remote.version },
                });
            }
        });
        await persist(getState);
    } catch (error) {
        console.warn('Could not pull deck list from Vaulto Cloud:', error);
    }

    // Snapshot names too: a deck can be renamed again (or deleted) by the time its own
    // retry below finishes awaiting the network, and the dispatch at the end must reflect
    // whatever is current then, not this snapshot.
    const pending = getState().vaultoDecks.decks.filter((d) => d.syncPending);
    for (const snapshot of pending) {
        if (!deckExists(getState, snapshot.id)) continue; // deleted by an earlier iteration's side effects

        if (snapshot.syncId) {
            // A rename that failed to reach the server before — retry with whatever name
            // is current right now, not the stale snapshot.
            const nameToSend = getState().vaultoDecks.decks.find((d) => d.id === snapshot.id)?.name ?? snapshot.name;
            try {
                const result = await requestWithAuth(dispatch, getState, (token) =>
                    cardsSyncApi.updateDeck(syncApiUrl, token, snapshot.syncId as string, {
                        name: nameToSend,
                        base_version: snapshot.syncVersion ?? undefined,
                    })
                );
                const current = getState().vaultoDecks.decks.find((d) => d.id === snapshot.id);
                if (current) {
                    dispatch({
                        type: UPSERT_VAULTO_DECK,
                        payload: { ...current, syncVersion: result.version, syncPending: current.name !== nameToSend },
                    });
                    await persist(getState);
                }
            } catch (error) {
                console.warn(`Could not push pending rename for deck "${snapshot.name}":`, error);
            }
            continue;
        }

        try {
            const created = await requestWithAuth(dispatch, getState, (token) =>
                cardsSyncApi.createDeck(syncApiUrl, token, { name: snapshot.name, description: '', color: '#4f46e5' })
            );
            finalizeCreatedDeck(dispatch, getState, snapshot.id, created);
            await persist(getState);
        } catch (error) {
            console.warn(`Could not push pending deck "${snapshot.name}" to Vaulto Cloud yet:`, error);
        }
    }
};
