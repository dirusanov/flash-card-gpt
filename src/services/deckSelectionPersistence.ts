import type { Store } from 'redux';
import type { RootState } from '../store';
import { setDeckId } from '../store/actions/decks';

const STORAGE_KEY = 'vaulto_selected_export_deck_v1';

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch (error) {
    console.error('Unable to access chrome.storage.local for selected deck:', error);
  }
  return null;
};

const readFallback = (): string => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(STORAGE_KEY) || '';
    }
  } catch (error) {
    console.error('Failed to read selected deck from localStorage:', error);
  }
  return '';
};

const writeFallback = (deckId: string) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (deckId) {
        window.localStorage.setItem(STORAGE_KEY, deckId);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch (error) {
    console.error('Failed to write selected deck to localStorage:', error);
  }
};

const loadDeckId = async (): Promise<string> => {
  const storage = getChromeStorage();
  if (!storage) {
    return readFallback();
  }

  const loaded = await new Promise<string>((resolve) => {
    try {
      storage.get([STORAGE_KEY], (items) => {
        const lastError = chrome?.runtime?.lastError;
        if (lastError) {
          console.error('Failed to load selected deck from chrome storage:', lastError);
          resolve(readFallback());
          return;
        }

        const value = items?.[STORAGE_KEY];
        resolve(typeof value === 'string' ? value : '');
      });
    } catch (error) {
      console.error('Failed to access chrome storage for selected deck:', error);
      resolve(readFallback());
    }
  });

  writeFallback(loaded);
  return loaded;
};

const saveDeckId = async (deckId: string) => {
  writeFallback(deckId);

  const storage = getChromeStorage();
  if (!storage) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      if (!deckId) {
        storage.remove([STORAGE_KEY], () => resolve());
      } else {
        storage.set({ [STORAGE_KEY]: deckId }, () => {
          const lastError = chrome?.runtime?.lastError;
          if (lastError) {
            console.error('Failed to save selected deck to chrome storage:', lastError);
          }
          resolve();
        });
      }
    } catch (error) {
      console.error('Failed to access chrome storage while saving selected deck:', error);
      resolve();
    }
  });
};

export const initializeDeckSelectionPersistence = async (store: Store<RootState>) => {
  const storedDeckId = await loadDeckId();
  if (storedDeckId && storedDeckId !== store.getState().deck.deckId) {
    store.dispatch(setDeckId(storedDeckId));
  }

  let lastDeckId = store.getState().deck.deckId || '';
  await saveDeckId(lastDeckId);

  let pending: Promise<void> = Promise.resolve();

  const unsubscribe = store.subscribe(() => {
    const nextDeckId = store.getState().deck.deckId || '';
    if (nextDeckId !== lastDeckId) {
      lastDeckId = nextDeckId;
      pending = pending.then(() => saveDeckId(nextDeckId)).catch((error) => {
        console.error('Failed to persist selected deck:', error);
      });
    }
  });

  return () => {
    unsubscribe();
  };
};
