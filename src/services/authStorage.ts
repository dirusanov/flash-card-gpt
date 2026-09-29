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

// Sessions live in chrome.storage.local only. Mirroring them into window.localStorage would
// hand the access and refresh tokens to every script on the page the content script runs in.
export const authStorage = {
  async getSession(): Promise<AuthSession | null> {
    const storage = getChromeStorage();
    if (!storage) {
      return null;
    }

    return new Promise<AuthSession | null>((resolve) => {
      try {
        storage.get([STORAGE_KEY], (items) => {
          const lastError = chrome?.runtime?.lastError;
          if (lastError) {
            console.error('Failed to load auth session from chrome storage:', lastError);
            resolve(null);
            return;
          }
          const session = (items?.[STORAGE_KEY] as AuthSession | undefined) ?? null;
          resolve(session);
        });
      } catch (error) {
        console.error('Failed to access chrome storage for auth session:', error);
        resolve(null);
      }
    });
  },

  async setSession(session: AuthSession | null): Promise<void> {
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
      return null;
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
