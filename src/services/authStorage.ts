import { AuthSession } from '../types/auth';

const STORAGE_KEY = 'vaulto_extension_auth_v1';
const DECK_KEY = 'vaulto_extension_cards_deck_v1';

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

const readFallback = (): AuthSession | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as AuthSession;
      }
    }
  } catch (error) {
    console.error('Failed to read auth session from localStorage:', error);
  }
  return null;
};

const writeFallback = (session: AuthSession | null) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (!session) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      }
    }
  } catch (error) {
    console.error('Failed to write auth session to localStorage:', error);
  }
};

export const authStorage = {
  async getSession(): Promise<AuthSession | null> {
    const storage = getChromeStorage();
    if (!storage) {
      return readFallback();
    }

    return new Promise<AuthSession | null>((resolve) => {
      try {
        storage.get([STORAGE_KEY], (items) => {
          const lastError = chrome?.runtime?.lastError;
          if (lastError) {
            console.error('Failed to load auth session from chrome storage:', lastError);
            resolve(readFallback());
            return;
          }
          const session = (items?.[STORAGE_KEY] as AuthSession | undefined) ?? null;
          resolve(session);
        });
      } catch (error) {
        console.error('Failed to access chrome storage for auth session:', error);
        resolve(readFallback());
      }
    });
  },

  async setSession(session: AuthSession | null): Promise<void> {
    writeFallback(session);
    const storage = getChromeStorage();
    if (!storage) return;

    await new Promise<void>((resolve) => {
      try {
        if (!session) {
          storage.remove([STORAGE_KEY], () => resolve());
        } else {
          storage.set({ [STORAGE_KEY]: session }, () => resolve());
        }
      } catch (error) {
        console.error('Failed to save auth session to chrome storage:', error);
        resolve();
      }
    });
  },

  async clearSession(): Promise<void> {
    await this.setSession(null);
  },

  async getDeckId(): Promise<string | null> {
    const storage = getChromeStorage();
    if (!storage) {
      try {
        return window.localStorage.getItem(DECK_KEY);
      } catch {
        return null;
      }
    }

    return new Promise<string | null>((resolve) => {
      try {
        storage.get([DECK_KEY], (items) => {
          const lastError = chrome?.runtime?.lastError;
          if (lastError) {
            console.error('Failed to load deck id from chrome storage:', lastError);
            resolve(null);
            return;
          }
          resolve((items?.[DECK_KEY] as string | undefined) ?? null);
        });
      } catch (error) {
        console.error('Failed to access chrome storage for deck id:', error);
        resolve(null);
      }
    });
  },

  async setDeckId(deckId: string | null): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (!deckId) {
          window.localStorage.removeItem(DECK_KEY);
        } else {
          window.localStorage.setItem(DECK_KEY, deckId);
        }
      }
    } catch (error) {
      console.error('Failed to write deck id to localStorage:', error);
    }

    const storage = getChromeStorage();
    if (!storage) return;

    await new Promise<void>((resolve) => {
      try {
        if (!deckId) {
          storage.remove([DECK_KEY], () => resolve());
        } else {
          storage.set({ [DECK_KEY]: deckId }, () => resolve());
        }
      } catch (error) {
        console.error('Failed to save deck id to chrome storage:', error);
        resolve();
      }
    });
  },
};
