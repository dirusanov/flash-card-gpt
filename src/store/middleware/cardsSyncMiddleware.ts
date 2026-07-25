import { Middleware } from 'redux';
import { RootState } from '..';
import {
  SAVE_CARD_TO_STORAGE,
  UPDATE_STORED_CARD,
  DELETE_STORED_CARD,
  UPDATE_CARD_SYNC_META,
  SET_STORED_CARDS,
} from '../actions/cards';
import { SET_AUTH_SESSION, CLEAR_AUTH_SESSION } from '../actions/auth';
import {
  SET_AUTO_SAVE_TO_SERVER,
  setAutoSaveToServer,
} from '../actions/settings';
import { cardsSyncService } from '../../services/cardsSyncService';
import { authApi } from '../../services/authApi';
import { authStorage } from '../../services/authStorage';
import { setAuthSession } from '../actions/auth';
import { ensureValidAccessToken } from '../utils/auth';
import { loadCardsFromStorage } from './cardsLocalStorage';
import { normalizeCardImageList } from '../../services/cardImagePersistence';

let syncQueue: Promise<void> = Promise.resolve();

const enqueue = (task: () => Promise<void>) => {
  syncQueue = syncQueue.then(task).catch((error) => {
    console.error('Cards sync failed:', error);
  });
};

const shouldBatchSyncCard = (card: any) => {
  if (!card?.id) {
    return false;
  }

  if (card.syncPending) {
    return true;
  }

  if (!card.syncId) {
    return true;
  }

  return typeof card.syncVersion !== 'number';
};

const isPersistentImage = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith('data:image/');

const mergeRemoteImageFields = (local: any, remote: any) => {
  const remoteHasPersistentImage =
    isPersistentImage(remote?.image) || isPersistentImage(remote?.imageUrl);
  const localHasPersistentImage =
    isPersistentImage(local?.image) || isPersistentImage(local?.imageUrl);

  if (remoteHasPersistentImage) {
    return {
      image: remote.image ?? null,
      imageUrl: remote.imageUrl ?? null,
    };
  }

  if (localHasPersistentImage) {
    return {
      image: local.image ?? null,
      imageUrl: local.imageUrl ?? null,
    };
  }

  return {
    image: remote?.image ?? local?.image ?? null,
    imageUrl: remote?.imageUrl ?? local?.imageUrl ?? null,
  };
};

const mergeRemoteCards = (localCards: any[], remoteCards: any[]) => {
  const merged = new Map<string, any>();
  localCards.forEach((card) => {
    if (card?.id) {
      merged.set(card.id, card);
    }
  });

  remoteCards.forEach((remote) => {
    if (!remote?.id) return;
    const local = merged.get(remote.id);
    if (!local) {
      merged.set(remote.id, remote);
      return;
    }

    const localVersion =
      typeof local.syncVersion === 'number' ? local.syncVersion : null;
    const remoteVersion =
      typeof remote.syncVersion === 'number' ? remote.syncVersion : null;
    const localCreatedAt = local?.createdAt
      ? new Date(local.createdAt).getTime()
      : null;
    const remoteCreatedAt = remote?.createdAt
      ? new Date(remote.createdAt).getTime()
      : null;

    if (local.syncPending) {
      merged.set(remote.id, {
        ...local,
        syncId: remote.syncId ?? local.syncId,
        syncVersion: remote.syncVersion ?? local.syncVersion ?? null,
        syncSource: remote.syncSource ?? local.syncSource,
        syncTags: remote.syncTags ?? local.syncTags,
        deckId: local.deckId ?? remote.deckId,
        syncPending: true,
      });
      return;
    }

    if (
      localVersion !== null &&
      remoteVersion !== null &&
      localVersion >= remoteVersion
    ) {
      merged.set(remote.id, {
        ...local,
        syncId: remote.syncId ?? local.syncId,
        syncVersion: Math.max(localVersion, remoteVersion),
        syncSource: remote.syncSource ?? local.syncSource,
        syncTags: remote.syncTags ?? local.syncTags,
        deckId: local.deckId ?? remote.deckId,
        syncPending: false,
      });
      return;
    }

    if (
      localVersion === null &&
      remoteVersion === null &&
      localCreatedAt &&
      remoteCreatedAt &&
      localCreatedAt >= remoteCreatedAt
    ) {
      merged.set(remote.id, {
        ...local,
        syncId: remote.syncId ?? local.syncId,
        syncVersion: remote.syncVersion ?? local.syncVersion ?? null,
        syncSource: remote.syncSource ?? local.syncSource,
        syncTags: remote.syncTags ?? local.syncTags,
        deckId: local.deckId ?? remote.deckId,
        syncPending: false,
      });
      return;
    }

    merged.set(remote.id, {
      ...remote,
      ...mergeRemoteImageFields(local, remote),
      exportStatus: local.exportStatus ?? remote.exportStatus,
      ankiDeckName: local.ankiDeckName ?? remote.ankiDeckName,
      // The schedule comes from /sync, not from the note. `remote.srsState` is only the
      // copy we ourselves wrote into fields_json, which the phone never updates — so a
      // note re-pulled after the phone rescheduled the card would carry a stale value
      // and undo what /sync/pull had just applied. Local wins; the note copy is used
      // only when there is no local schedule at all, i.e. after a reinstall.
      srsState: local.srsState ?? remote.srsState,
      syncPending: false,
    });
  });

  return Array.from(merged.values());
};

export const cardsSyncMiddleware: Middleware<{}, RootState> =
  (store) => (next) => (action) => {
    const stateBefore = store.getState();
    let deletedCard = null as any;

    if (action.type === DELETE_STORED_CARD) {
      deletedCard =
        stateBefore.cards.storedCards.find(
          (card) => card.id === action.payload
        ) ?? null;
    }

    const result = next(action);
    const stateAfter = store.getState();
    const autoSaveEnabled = stateAfter.settings.autoSaveToServer;

    // Only run batch sync if we just logged in, avoiding recursive syncs on token refresh.
    if (action.type === SET_AUTH_SESSION && !stateBefore.auth.accessToken) {
      if (!autoSaveEnabled) {
        store.dispatch(setAutoSaveToServer(true));
      }
      const accessToken = stateAfter.auth.accessToken;
      if (accessToken) {
        enqueue(async () => {
          const token = await ensureValidAccessToken(store);
          if (!token) return;
          const { syncApiUrl } = store.getState().settings;
          try {
            const remoteCards = await cardsSyncService.fetchRemoteCards(
              syncApiUrl,
              token
            );
            const currentLocalCards = store.getState().cards.storedCards;
            const localCards =
              currentLocalCards.length > 0
                ? currentLocalCards
                : await loadCardsFromStorage();
            const merged = mergeRemoteCards(localCards, remoteCards);
            const { normalizedValues, errors } = await normalizeCardImageList(
              merged
            );
            errors.forEach((error) => {
              console.warn(
                'Failed to normalize image while merging remote cards:',
                error
              );
            });
            store.dispatch({
              type: SET_STORED_CARDS,
              payload: normalizedValues,
            });
          } catch (error) {
            console.error('Failed to pull cards from server:', error);
          }
        });
      }

      if (!autoSaveEnabled) {
        return result;
      }
      if (accessToken) {
        enqueue(async () => {
          const token = await ensureValidAccessToken(store);
          if (!token) return;
          const { syncApiUrl } = store.getState().settings;
          const cards = store
            .getState()
            .cards.storedCards.filter((card) => shouldBatchSyncCard(card));
          for (const card of cards) {
            try {
              const meta = await cardsSyncService.upsertCard(
                syncApiUrl,
                token,
                card
              );
              store.dispatch({
                type: UPDATE_CARD_SYNC_META,
                payload: {
                  cardId: card.id,
                  syncId: meta.id,
                  syncVersion: meta.version,
                  syncSource: meta.source,
                  syncTags: meta.tags,
                  deckId: meta.deckId,
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

    if (action.type === SET_AUTO_SAVE_TO_SERVER) {
      if (action.payload && stateAfter.auth.accessToken) {
        enqueue(async () => {
          const token = await ensureValidAccessToken(store);
          if (!token) return;
          const { syncApiUrl } = store.getState().settings;
          const cards = store
            .getState()
            .cards.storedCards.filter((card) => shouldBatchSyncCard(card));
          for (const card of cards) {
            try {
              const meta = await cardsSyncService.upsertCard(
                syncApiUrl,
                token,
                card
              );
              store.dispatch({
                type: UPDATE_CARD_SYNC_META,
                payload: {
                  cardId: card.id,
                  syncId: meta.id,
                  syncVersion: meta.version,
                  syncSource: meta.source,
                  syncTags: meta.tags,
                  deckId: meta.deckId,
                },
              });
            } catch (error) {
              console.error(
                'Failed to sync card after enabling auto sync',
                card.id,
                error
              );
            }
          }
        });
      }
      return result;
    }

    if (action.type === UPDATE_CARD_SYNC_META) {
      return result;
    }

    const needsSync =
      action.type === SAVE_CARD_TO_STORAGE ||
      action.type === UPDATE_STORED_CARD ||
      action.type === DELETE_STORED_CARD;

    if (!needsSync || !autoSaveEnabled) {
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

        const card = store
          .getState()
          .cards.storedCards.find((item) => item.id === cardId);
        if (!card) return;

        const meta = await cardsSyncService.upsertCard(
          syncApiUrl,
          tokenStr,
          card
        );
        store.dispatch({
          type: UPDATE_CARD_SYNC_META,
          payload: {
            cardId,
            syncId: meta.id,
            syncVersion: meta.version,
            syncSource: meta.source,
            syncTags: meta.tags,
            deckId: meta.deckId,
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
