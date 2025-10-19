import type { Store } from 'redux';
import { setOpenAiKey, setGroqApiKey, setAnkiConnectApiKey } from '../store/actions/settings';
import type { RootState } from '../store';

type StoredApiKeys = {
  openai: string;
  groq: string;
  anki: string;
};

const STORAGE_KEY = 'anki_api_keys_v1';
const DEFAULT_KEYS: StoredApiKeys = {
  openai: '',
  groq: '',
  anki: '',
};

let cachedKeys: StoredApiKeys | null = null;

const cloneKeys = (keys: StoredApiKeys): StoredApiKeys => ({ ...keys });

const normalizeKeys = (raw: unknown): StoredApiKeys => {
  if (!raw || typeof raw !== 'object') {
    return cloneKeys(DEFAULT_KEYS);
  }

  const record = raw as Record<string, unknown>;

  return {
    openai: typeof record.openai === 'string' ? record.openai : '',
    groq: typeof record.groq === 'string' ? record.groq : '',
    anki: typeof record.anki === 'string' ? record.anki : '',
  };
};

const getChromeStorage = () => {
  try {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      return chrome.storage.local;
    }
  } catch (error) {
    console.error('Unable to access chrome.storage.local:', error);
  }
  return null;
};

const readFallback = (): StoredApiKeys => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return normalizeKeys(JSON.parse(raw));
      }
    }
  } catch (error) {
    console.error('Failed to read API keys from localStorage:', error);
  }
  return cloneKeys(DEFAULT_KEYS);
};

const writeFallback = (keys: StoredApiKeys) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    }
  } catch (error) {
    console.error('Failed to write API keys to localStorage:', error);
  }
};

export const loadApiKeys = async (): Promise<StoredApiKeys> => {
  if (cachedKeys) {
    return cloneKeys(cachedKeys);
  }

  const storage = getChromeStorage();
  if (!storage) {
    const fallback = readFallback();
    cachedKeys = fallback;
    return cloneKeys(fallback);
  }

  const loaded = await new Promise<StoredApiKeys>((resolve) => {
    try {
      storage.get([STORAGE_KEY], (items) => {
        const lastError = chrome?.runtime?.lastError;
        if (lastError) {
          console.error('Failed to load API keys from chrome storage:', lastError);
          resolve(readFallback());
          return;
        }
        resolve(normalizeKeys(items?.[STORAGE_KEY]));
      });
    } catch (error) {
      console.error('Failed to access chrome storage for API keys:', error);
      resolve(readFallback());
    }
  });

  cachedKeys = loaded;
  writeFallback(loaded);
  return cloneKeys(loaded);
};

const persistToChrome = async (keys: StoredApiKeys) => {
  const storage = getChromeStorage();
  if (!storage) {
    return;
  }

  await new Promise<void>((resolve) => {
    try {
      storage.set({ [STORAGE_KEY]: keys }, () => {
        const lastError = chrome?.runtime?.lastError;
        if (lastError) {
          console.error('Failed to save API keys to chrome storage:', lastError);
        }
        resolve();
      });
    } catch (error) {
      console.error('Failed to access chrome storage while saving API keys:', error);
      resolve();
    }
  });
};

const saveApiKeys = async (keys: StoredApiKeys) => {
  cachedKeys = cloneKeys(keys);
  writeFallback(keys);
  await persistToChrome(keys);
};

const snapshotKeys = (state: RootState): StoredApiKeys => ({
  openai: state.settings.openAiKey || '',
  groq: state.settings.groqApiKey || '',
  anki: state.settings.ankiConnectApiKey ?? '',
});

const snapshotsEqual = (a: StoredApiKeys, b: StoredApiKeys) =>
  a.openai === b.openai && a.groq === b.groq && a.anki === b.anki;

export const initializeApiKeyPersistence = async (store: Store<RootState>) => {
  const storedKeys = await loadApiKeys();
  const state = store.getState();

  if (storedKeys.openai !== state.settings.openAiKey) {
    store.dispatch(setOpenAiKey(storedKeys.openai));
  }

  if (storedKeys.groq !== state.settings.groqApiKey) {
    store.dispatch(setGroqApiKey(storedKeys.groq));
  }

  const stateAnki = state.settings.ankiConnectApiKey ?? '';
  if (storedKeys.anki !== stateAnki) {
    store.dispatch(setAnkiConnectApiKey(storedKeys.anki || null));
  }

  let lastSnapshot = snapshotKeys(store.getState());
  await saveApiKeys(lastSnapshot);

  let pending: Promise<void> = Promise.resolve();

  const queueSave = (snapshot: StoredApiKeys) => {
    pending = pending.then(() => saveApiKeys(snapshot)).catch((error) => {
      console.error('Failed to persist API keys:', error);
    });
  };

  const unsubscribe = store.subscribe(() => {
    const nextSnapshot = snapshotKeys(store.getState());
    if (!snapshotsEqual(nextSnapshot, lastSnapshot)) {
      lastSnapshot = nextSnapshot;
      queueSave(nextSnapshot);
    }
  });

  return () => {
    unsubscribe();
  };
};
