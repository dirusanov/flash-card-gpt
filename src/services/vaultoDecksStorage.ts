import { VaultoDeck } from '../store/reducers/vaultoDecks';

// Local-first deck registry, independent of Vaulto Cloud login — mirrors the mobile
// app's "decks work fully offline, cloud is a layered enhancement" model. Decks are tiny
// (no images), so this skips the quota/compression machinery cardsLocalStorage.ts needs
// for cards and just stores the plain array.
const STORAGE_KEY = 'vaulto_local_decks';

const hasChromeStorageLocal = (): boolean => {
    try {
        return typeof chrome !== 'undefined' && !!chrome.storage && !!chrome.storage.local;
    } catch {
        return false;
    }
};

export const loadVaultoDecksFromStorage = async (): Promise<VaultoDeck[]> => {
    if (!hasChromeStorageLocal()) return [];

    return new Promise((resolve) => {
        try {
            chrome.storage.local.get([STORAGE_KEY], (result) => {
                if (chrome.runtime?.lastError) {
                    console.warn('Failed to load local decks:', chrome.runtime.lastError.message);
                    resolve([]);
                    return;
                }
                const raw = result?.[STORAGE_KEY];
                if (!Array.isArray(raw)) {
                    resolve([]);
                    return;
                }
                resolve(raw as VaultoDeck[]);
            });
        } catch (error) {
            console.warn('Failed to load local decks:', error);
            resolve([]);
        }
    });
};

export const saveVaultoDecksToStorage = async (decks: VaultoDeck[]): Promise<void> => {
    if (!hasChromeStorageLocal()) return;

    return new Promise((resolve) => {
        try {
            chrome.storage.local.set({ [STORAGE_KEY]: decks }, () => {
                if (chrome.runtime?.lastError) {
                    console.warn('Failed to save local decks:', chrome.runtime.lastError.message);
                }
                resolve();
            });
        } catch (error) {
            console.warn('Failed to save local decks:', error);
            resolve();
        }
    });
};
