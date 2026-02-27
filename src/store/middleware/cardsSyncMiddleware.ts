import { Middleware } from 'redux';
import { RootState } from '..';
import { SAVE_CARD_TO_STORAGE, UPDATE_STORED_CARD, DELETE_STORED_CARD, UPDATE_CARD_SYNC_META } from '../actions/cards';
import { SET_AUTH_SESSION, CLEAR_AUTH_SESSION } from '../actions/auth';
import { cardsSyncService } from '../../services/cardsSyncService';
import { authApi } from '../../services/authApi';
import { authStorage } from '../../services/authStorage';
import { setAuthSession } from '../actions/auth';

let syncQueue: Promise<void> = Promise.resolve();

const enqueue = (task: () => Promise<void>) => {
  syncQueue = syncQueue.then(task).catch((error) => {
    console.error('Cards sync failed:', error);
  });
};

const isTokenExpired = (expiresAt: number | null): boolean => {
  if (!expiresAt) return false;
  return Date.now() > expiresAt - 60_000;
};

const ensureValidAccessToken = async (state: RootState, dispatch: (action: any) => void): Promise<string | null> => {
  const { accessToken, refreshToken, expiresAt, user } = state.auth;
  if (!accessToken) return null;

  if (!isTokenExpired(expiresAt)) {
    return accessToken;
  }

  if (!refreshToken) {
    return null;
  }

  const refreshed = await authApi.refresh(refreshToken);
  if (!refreshed.access_token) {
    return null;
  }

  const nextSession = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? null,
    expiresAt: refreshed.expires_in ? Date.now() + refreshed.expires_in * 1000 : null,
    tokenType: refreshed.token_type ?? 'bearer',
    user: user ?? null,
  };

  await authStorage.setSession(nextSession);
  dispatch(setAuthSession(nextSession));
  return nextSession.accessToken;
};

export const cardsSyncMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const stateBefore = store.getState();
  let deletedCard = null as any;

  if (action.type === DELETE_STORED_CARD) {
    deletedCard = stateBefore.cards.storedCards.find((card) => card.id === action.payload) ?? null;
  }

  const result = next(action);

  const stateAfter = store.getState();

  if (action.type === SET_AUTH_SESSION) {
    const accessToken = stateAfter.auth.accessToken;
    if (accessToken) {
      const cards = stateAfter.cards.storedCards;
      enqueue(async () => {
        const token = await ensureValidAccessToken(stateAfter, store.dispatch);
        if (!token) return;
        for (const card of cards) {
          try {
            const meta = await cardsSyncService.upsertCard(token, card);
            store.dispatch({
              type: UPDATE_CARD_SYNC_META,
              payload: {
                cardId: card.id,
                syncId: meta.id,
                syncVersion: meta.version,
                syncSource: meta.source,
                syncTags: meta.tags,
              },
            });
          } catch (error) {
            console.error('Failed to sync card', card.id, error);
          }
        }
      });
    }
    return result;
  }

  if (action.type === CLEAR_AUTH_SESSION) {
    cardsSyncService.resetCache();
    return result;
  }

  if (action.type === UPDATE_CARD_SYNC_META) {
    return result;
  }

  const needsSync =
    action.type === SAVE_CARD_TO_STORAGE ||
    action.type === UPDATE_STORED_CARD ||
    action.type === DELETE_STORED_CARD;

  if (!needsSync) {
    return result;
  }

  const run = async () => {
    const token = await ensureValidAccessToken(stateAfter, store.dispatch);
    if (!token) return;

    if (action.type === DELETE_STORED_CARD) {
      if (!deletedCard) return;
      await cardsSyncService.deleteCard(token, deletedCard);
      return;
    }

    const cardId = action.payload?.id;
    if (!cardId) return;

    const card = stateAfter.cards.storedCards.find((item) => item.id === cardId);
    if (!card) return;

    const meta = await cardsSyncService.upsertCard(token, card);
    store.dispatch({
      type: UPDATE_CARD_SYNC_META,
      payload: {
        cardId,
        syncId: meta.id,
        syncVersion: meta.version,
        syncSource: meta.source,
        syncTags: meta.tags,
      },
    });
  };

  enqueue(run);
  return result;
};

export default cardsSyncMiddleware;
