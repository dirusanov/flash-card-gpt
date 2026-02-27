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

const ensureValidAccessToken = async (store: any, forceRefresh = false): Promise<string | null> => {
  const state: RootState = store.getState();
  const { accessToken, refreshToken, expiresAt, user } = state.auth;
  const { authApiUrl } = state.settings;
  if (!accessToken) return null;

  if (!forceRefresh && !isTokenExpired(expiresAt)) {
    return accessToken;
  }

  if (!refreshToken) {
    return null;
  }

  try {
    const refreshed = await authApi.refresh(authApiUrl, refreshToken);
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
    store.dispatch(setAuthSession(nextSession));
    return nextSession.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    await authStorage.clearSession();
    store.dispatch({ type: CLEAR_AUTH_SESSION });
    return null;
  }
};

export const cardsSyncMiddleware: Middleware<{}, RootState> = (store) => (next) => (action) => {
  const stateBefore = store.getState();
  let deletedCard = null as any;

  if (action.type === DELETE_STORED_CARD) {
    deletedCard = stateBefore.cards.storedCards.find((card) => card.id === action.payload) ?? null;
  }

  const result = next(action);

  const stateAfter = store.getState();

  // Only run batch sync if we just logged in, avoiding recursive syncs on token refresh.
  if (action.type === SET_AUTH_SESSION && !stateBefore.auth.accessToken) {
    const accessToken = stateAfter.auth.accessToken;
    if (accessToken) {
      const cards = stateAfter.cards.storedCards;
      enqueue(async () => {
        const token = await ensureValidAccessToken(store);
        if (!token) return;
        const { syncApiUrl } = store.getState().settings;
        for (const card of cards) {
          try {
            const meta = await cardsSyncService.upsertCard(syncApiUrl, token, card);
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
            console.error('Failed to batch sync card', card.id, error);
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
    let token = await ensureValidAccessToken(store);
    if (!token) return;

    const executeOp = async (tokenStr: string) => {
      const { syncApiUrl } = store.getState().settings;
      if (action.type === DELETE_STORED_CARD) {
        if (!deletedCard) return;
        await cardsSyncService.deleteCard(syncApiUrl, tokenStr, deletedCard);
        return;
      }

      const cardId = action.payload?.id;
      if (!cardId) return;

      const card = store.getState().cards.storedCards.find((item) => item.id === cardId);
      if (!card) return;

      const meta = await cardsSyncService.upsertCard(syncApiUrl, tokenStr, card);
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

    try {
      await executeOp(token);
    } catch (error: any) {
      if (error?.status === 401) {
        // Token might have been rejected (e.g., backend restarted), force a refresh and retry
        token = await ensureValidAccessToken(store, true);
        if (token) {
          await executeOp(token);
        }
      } else {
        console.error('Card sync operation failed:', error);
      }
    }
  };

  enqueue(run);
  return result;
};

export default cardsSyncMiddleware;
