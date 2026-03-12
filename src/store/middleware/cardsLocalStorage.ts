import { Middleware } from 'redux';
import { RootState } from '..';
import { LOAD_STORED_CARDS, SAVE_CARD_TO_STORAGE, DELETE_STORED_CARD, UPDATE_STORED_CARD, SET_TEXT, SET_CURRENT_CARD_ID, UPDATE_CARD_EXPORT_STATUS, SET_STORED_CARDS } from '../actions/cards';
import { SAVE_TAB_CARD, DELETE_TAB_CARD, UPDATE_TAB_STORED_CARD, UPDATE_TAB_CARD_EXPORT_STATUS, SET_CURRENT_TAB_ID } from '../actions/tabState';
import { StoredCard } from '../reducers/cards';

const LOCAL_STORAGE_KEY = 'anki_stored_cards';
const TAB_STORAGE_KEY_PREFIX = 'anki_tab_cards';
const PERSIST_DEBOUNCE_MS = 300;
const CARD_IMAGES_DB_NAME = 'vaulto-card-images';
const CARD_IMAGES_DB_VERSION = 1;
const CARD_IMAGES_STORE = 'images';

const isDev = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
    if (isDev) {
        console.log(...args);
    }
};

const runWhenIdle = (callback: () => void) => {
    const globalScope = globalThis as any;
    if (typeof globalScope.requestIdleCallback === 'function') {
        globalScope.requestIdleCallback(callback, { timeout: 1000 });
        return;
    }
    setTimeout(callback, 0);
};

const hasChromeStorageLocal = () =>
    typeof chrome !== 'undefined' &&
    !!chrome.storage &&
    !!chrome.storage.local;

const readExtensionStorage = async (key: string): Promise<string | null> => {
    if (!hasChromeStorageLocal()) {
        return localStorage.getItem(key);
    }

    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            if (chrome.runtime?.lastError) {
                console.error(`Failed to read ${key} from chrome.storage.local:`, chrome.runtime.lastError.message);
                resolve(localStorage.getItem(key));
                return;
            }

            const value = result?.[key];
            if (typeof value === 'string') {
                resolve(value);
                return;
            }

            resolve(localStorage.getItem(key));
        });
    });
};

const writeExtensionStorage = async (key: string, value: string): Promise<void> => {
    if (!hasChromeStorageLocal()) {
        localStorage.setItem(key, value);
        return;
    }

    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            if (chrome.runtime?.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }

            resolve();
        });
    });
};

const removeLegacyLocalStorageKey = (key: string) => {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.warn(`Failed to remove legacy localStorage key ${key}:`, error);
    }
};

type CardImageRecord = {
    key: string;
    scope: string;
    cardId: string;
    image: string;
    updatedAt: string;
};

const openCardImagesDb = async (): Promise<IDBDatabase | null> => {
    if (typeof indexedDB === 'undefined') {
        return null;
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CARD_IMAGES_DB_NAME, CARD_IMAGES_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            const store = db.objectStoreNames.contains(CARD_IMAGES_STORE)
                ? request.transaction?.objectStore(CARD_IMAGES_STORE)
                : db.createObjectStore(CARD_IMAGES_STORE, { keyPath: 'key' });

            if (store && !store.indexNames.contains('scope')) {
                store.createIndex('scope', 'scope', { unique: false });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open card image database'));
    });
};

const withImagesStore = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => Promise<T>
): Promise<T | null> => {
    const db = await openCardImagesDb();
    if (!db) {
        return null;
    }

    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(CARD_IMAGES_STORE, mode);
        const store = transaction.objectStore(CARD_IMAGES_STORE);

        operation(store)
            .then((result) => {
                transaction.oncomplete = () => {
                    db.close();
                    resolve(result);
                };
                transaction.onerror = () => {
                    db.close();
                    reject(transaction.error ?? new Error('IndexedDB transaction failed'));
                };
                transaction.onabort = () => {
                    db.close();
                    reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
                };
            })
            .catch((error) => {
                try {
                    transaction.abort();
                } catch (_abortError) {
                    // no-op
                }
                db.close();
                reject(error);
            });
    });
};

const requestToPromise = <T = unknown>(request: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });

const buildImageRecordKey = (scope: string, cardId: string) => `${scope}:${cardId}`;

const getPersistableImage = (card: StoredCard): string | null => {
    if (typeof card.image === 'string' && card.image.startsWith('data:image/')) {
        return card.image;
    }

    if (typeof card.imageUrl === 'string' && card.imageUrl.startsWith('data:image/')) {
        return card.imageUrl;
    }

    return null;
};

const stripLargeImagePayload = (card: StoredCard): StoredCard => {
    const hasEmbeddedImage = Boolean(getPersistableImage(card));
    return {
        ...card,
        image: hasEmbeddedImage ? null : (card.image ?? null),
        imageUrl: typeof card.imageUrl === 'string' && card.imageUrl.startsWith('data:image/')
            ? null
            : (card.imageUrl ?? null),
    };
};

const persistCardImages = async (scope: string, cards: StoredCard[]): Promise<StoredCard[]> => {
    const sanitizedCards = cards.map((card) => stripLargeImagePayload(card));

    try {
        await withImagesStore('readwrite', async (store) => {
            const scopeIndex = store.index('scope');
            const existingKeys = await requestToPromise<IDBValidKey[]>(scopeIndex.getAllKeys(IDBKeyRange.only(scope)));
            const validKeys = new Set<string>();

            for (const card of cards) {
                if (!card.id) {
                    continue;
                }

                const key = buildImageRecordKey(scope, card.id);
                validKeys.add(key);
                const image = getPersistableImage(card);

                if (image) {
                    await requestToPromise(store.put({
                        key,
                        scope,
                        cardId: card.id,
                        image,
                        updatedAt: new Date().toISOString(),
                    } as CardImageRecord));
                } else {
                    await requestToPromise(store.delete(key));
                }
            }

            for (const existingKey of existingKeys) {
                const key = String(existingKey);
                if (!validKeys.has(key)) {
                    await requestToPromise(store.delete(key));
                }
            }
        });
    } catch (error) {
        console.error(`Failed to persist card images for scope ${scope}:`, error);
    }

    return sanitizedCards;
};

const hydrateCardImages = async (scope: string, cards: StoredCard[]): Promise<StoredCard[]> => {
    try {
        const records = await withImagesStore('readonly', async (store) => {
            const scopeIndex = store.index('scope');
            return requestToPromise<CardImageRecord[]>(scopeIndex.getAll(IDBKeyRange.only(scope)));
        });

        const imageMap = new Map<string, string>();
        (records ?? []).forEach((record) => {
            if (record?.cardId && record?.image) {
                imageMap.set(record.cardId, record.image);
            }
        });

        return cards.map((card) => {
            const storedImage = card.id ? imageMap.get(card.id) ?? null : null;
            if (!storedImage) {
                return card;
            }

            return {
                ...card,
                image: storedImage,
                imageUrl: card.imageUrl ?? null,
            };
        });
    } catch (error) {
        console.error(`Failed to hydrate card images for scope ${scope}:`, error);
        return cards;
    }
};

let globalPersistTimer: number | null = null;
let pendingGlobalCards: StoredCard[] | null = null;

let tabPersistTimer: number | null = null;
let pendingTabCards: StoredCard[] | null = null;
let pendingTabId: number | null = null;

const flushPendingGlobalPersistence = () => {
    if (globalPersistTimer !== null) {
        clearTimeout(globalPersistTimer);
        globalPersistTimer = null;
    }

    const cardsToSave = pendingGlobalCards;
    pendingGlobalCards = null;

    if (!cardsToSave) return;
    void saveCardsToStorage(cardsToSave);
};

const flushPendingTabPersistence = () => {
    if (tabPersistTimer !== null) {
        clearTimeout(tabPersistTimer);
        tabPersistTimer = null;
    }

    const nextTabId = pendingTabId;
    const nextCards = pendingTabCards;
    pendingTabId = null;
    pendingTabCards = null;

    if (!nextTabId || !nextCards) return;
    void saveTabCardsToStorage(nextTabId, nextCards);
};

// Helper function to compress base64 images
const compressImageIfPossible = (imageData: string): string => {
    try {
        // If it's a data URI, try to reduce quality by removing unnecessary data
        if (imageData.startsWith('data:image/')) {
            // For very large images, we can try to reduce them
            // This is a simple approach - in a full implementation we'd use canvas to resize
            if (imageData.length > 100000) { // > 100KB
                debugLog('Large image detected, applying basic compression');
                // Keep the image but warn about size
                console.warn(`Large image (${Math.round(imageData.length/1024)}KB) detected. Consider using smaller images.`);
                
                // Try to compress by changing JPEG quality if possible
                // For now, just return the original, but in production we could:
                // 1. Create a canvas element
                // 2. Draw the image to canvas
                // 3. Export with lower quality
                return imageData;
            }
            return imageData;
        }
        return imageData;
    } catch (error) {
        console.error('Error compressing image:', error);
        return imageData;
    }
};

const estimateSerializedSize = (value: unknown): number => {
    const serialized = JSON.stringify(value, (key, item) => {
        if (item instanceof Date) return item.toISOString();
        return item;
    });

    return new Blob([serialized]).size;
};

// Function to estimate and manage storage efficiently
const manageStorageQuota = (cards: StoredCard[]): StoredCard[] => {
    try {
        const sizeLimitBytes = 4 * 1024 * 1024;
        const sizeInBytes = estimateSerializedSize(cards);
        const sizeInMB = sizeInBytes / (1024 * 1024);
        
        debugLog(`Storage analysis: ${cards.length} cards, ${sizeInMB.toFixed(2)}MB`);
        
        // If size is manageable, return as is
        if (sizeInBytes <= sizeLimitBytes) {
            return cards;
        }
        
        console.warn('Storage size is large, keeping metadata only for storage quota management.');

        return cards.map((card) => stripLargeImagePayload(card));
    } catch (error) {
        console.error('Error managing storage quota:', error);
        return cards;
    }
};

// Show user-friendly quota warning
const showQuotaWarning = () => {
    console.warn('⚠️ Storage quota exceeded! This usually happens when you have many cards with large images.');
    console.warn('💡 To fix this:');
    console.warn('   • Use smaller images');
    console.warn('   • Export older cards and delete them');
    console.warn('   • Consider using image URLs instead of embedded images');
};

// Вспомогательная функция для загрузки карточек из localStorage
export const loadCardsFromStorage = async (): Promise<StoredCard[]> => {
    try {
        const storedCardsJson = await readExtensionStorage(LOCAL_STORAGE_KEY);
        debugLog('Loading cards from localStorage. Data exists:', !!storedCardsJson);
        
        if (storedCardsJson) {
            // Try to parse the JSON
            try {
                const storedCards: StoredCard[] = JSON.parse(storedCardsJson);
                debugLog('Successfully parsed cards from localStorage, total count:', storedCards.length);
                
                // Check for data format issues
                if (!Array.isArray(storedCards)) {
                    console.error('Stored cards is not an array!', storedCards);
                    return [];
                }
                
                // Validate each card to make sure it has the required fields
                const validCards = storedCards.filter(card => {
                    // Check for critical fields
                    const hasId = !!card.id;
                    const hasText = !!card.text;
                    const hasCreatedAt = !!card.createdAt;
                    
                    // Log invalid cards
                    if (!hasId || !hasText || !hasCreatedAt) {
                        console.warn('Found invalid card, removing from results:', card);
                        return false;
                    }
                    
                    return true;
                });
                
                debugLog(`Card validation: ${validCards.length} valid out of ${storedCards.length} total`);
                
                // Convert date strings back to Date objects
                const cardsWithDates = validCards.map(card => ({
                    ...card,
                    createdAt: new Date(card.createdAt)
                }));

                // Migrate legacy localStorage data into extension storage on successful read.
                if (storedCardsJson && hasChromeStorageLocal()) {
                    void writeExtensionStorage(LOCAL_STORAGE_KEY, storedCardsJson)
                        .then(() => removeLegacyLocalStorageKey(LOCAL_STORAGE_KEY))
                        .catch((migrationError) => {
                            console.warn('Failed to migrate legacy cards storage:', migrationError);
                        });
                }
                
                return hydrateCardImages('global', cardsWithDates);
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                // Attempt recovery by clearing corrupt data
                localStorage.removeItem(LOCAL_STORAGE_KEY);
                return [];
            }
        }
    } catch (error) {
        console.error('Error loading cards from localStorage:', error);
        // Try to recover by clearing potentially corrupt data
        try {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (cleanupError) {
            console.error('Could not clean up localStorage:', cleanupError);
        }
    }
    
    return [];
};

const scheduleGlobalPersistence = (cards: StoredCard[]) => {
    pendingGlobalCards = cards;

    if (globalPersistTimer !== null) {
        window.clearTimeout(globalPersistTimer);
    }

    globalPersistTimer = window.setTimeout(() => {
        globalPersistTimer = null;
        const cardsToSave = pendingGlobalCards;
        pendingGlobalCards = null;

        if (!cardsToSave) return;
        runWhenIdle(() => {
            void saveCardsToStorage(cardsToSave);
        });
    }, PERSIST_DEBOUNCE_MS);
};

const scheduleTabPersistence = (tabId: number, cards: StoredCard[]) => {
    pendingTabId = tabId;
    pendingTabCards = cards;

    if (tabPersistTimer !== null) {
        window.clearTimeout(tabPersistTimer);
    }

    tabPersistTimer = window.setTimeout(() => {
        tabPersistTimer = null;
        const nextTabId = pendingTabId;
        const nextCards = pendingTabCards;
        pendingTabId = null;
        pendingTabCards = null;

        if (!nextTabId || !nextCards) return;
        runWhenIdle(() => {
            void saveTabCardsToStorage(nextTabId, nextCards);
        });
    }, PERSIST_DEBOUNCE_MS);
};

// Tab-specific functions
export const loadTabCardsFromStorage = async (tabId: number): Promise<StoredCard[]> => {
    try {
        const tabStorageKey = `${TAB_STORAGE_KEY_PREFIX}_${tabId}`;
        const storedCardsJson = await readExtensionStorage(tabStorageKey);
        debugLog(`Loading cards for tab ${tabId}. Data exists:`, !!storedCardsJson);
        
        if (storedCardsJson) {
            const storedCards: StoredCard[] = JSON.parse(storedCardsJson);
            debugLog(`Successfully loaded ${storedCards.length} cards for tab ${tabId}`);

            if (hasChromeStorageLocal()) {
                void writeExtensionStorage(tabStorageKey, storedCardsJson)
                    .then(() => removeLegacyLocalStorageKey(tabStorageKey))
                    .catch((migrationError) => {
                        console.warn(`Failed to migrate legacy tab cards for tab ${tabId}:`, migrationError);
                    });
            }
            
            const cardsWithDates = storedCards.map(card => ({
                ...card,
                createdAt: new Date(card.createdAt)
            }));

            return hydrateCardImages(`tab:${tabId}`, cardsWithDates);
        }
    } catch (error) {
        console.error(`Error loading cards for tab ${tabId}:`, error);
    }
    
    return [];
};

export const saveTabCardsToStorage = async (tabId: number, cards: StoredCard[]): Promise<void> => {
    try {
        const tabStorageKey = `${TAB_STORAGE_KEY_PREFIX}_${tabId}`;
        debugLog(`Saving ${cards.length} cards for tab ${tabId}`);
        
        const cardsWithPersistedImages = await persistCardImages(`tab:${tabId}`, cards);
        const optimizedCards = manageStorageQuota(cardsWithPersistedImages);
        const serializedCards = JSON.stringify(optimizedCards, (key, value) => {
            if (value instanceof Date) return value.toISOString();
            return value;
        });
        
        await writeExtensionStorage(tabStorageKey, serializedCards);
        removeLegacyLocalStorageKey(tabStorageKey);
        debugLog(`Successfully saved ${optimizedCards.length} cards for tab ${tabId}`);
    } catch (error) {
        console.error(`Error saving cards for tab ${tabId}:`, error);
        await saveCardsToStorageWithErrorHandling(tabId, cards, error);
    }
};

const saveCardsToStorageWithErrorHandling = async (tabId: number, cards: StoredCard[], error: any): Promise<void> => {
    const tabStorageKey = `${TAB_STORAGE_KEY_PREFIX}_${tabId}`;
    
    if (error instanceof DOMException && (
        error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )) {
        console.error(`localStorage quota exceeded for tab ${tabId}. Using storage optimization.`);
        showQuotaWarning();
        
        const smartOptimizedCards = manageStorageQuota(cards);
        try {
            const serializedSmart = JSON.stringify(smartOptimizedCards, (key, value) => {
                if (value instanceof Date) return value.toISOString();
                return value;
            });
            
            await writeExtensionStorage(tabStorageKey, serializedSmart);
            removeLegacyLocalStorageKey(tabStorageKey);
            console.warn(`Smart optimization for tab ${tabId}: Saved ${smartOptimizedCards.length} of ${cards.length} cards`);
        } catch (innerError) {
            console.error(`Failed to save optimized cards for tab ${tabId}:`, innerError);
        }
    }
};

// Вспомогательная функция для сохранения карточек в localStorage
export const saveCardsToStorage = async (cards: StoredCard[]): Promise<void> => {
    try {
        debugLog('Saving cards to localStorage. Total cards count:', cards.length);
        
        const cardsWithPersistedImages = await persistCardImages('global', cards);
        const optimizedCards = manageStorageQuota(cardsWithPersistedImages);
        
        if (optimizedCards.length < cards.length) {
            console.warn(`Storage optimization reduced stored card count from ${cards.length} to ${optimizedCards.length}`);
        }
        
        // Save to localStorage - ensure we're not trying to save circular structures
        const serializedCards = JSON.stringify(optimizedCards, (key, value) => {
            // Convert Date objects to ISO strings for proper serialization
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        });
        
        // Check localStorage size limit
        const storageSizeInBytes = new Blob([serializedCards]).size;
        debugLog('Storage size in bytes:', storageSizeInBytes, 'Approximate max size: ~5MB');
        
        // Most browsers have a 5MB-10MB limit for localStorage
        if (storageSizeInBytes > 4 * 1024 * 1024) { // 4MB warning
            console.warn('Warning: localStorage size is getting large (>4MB). This might cause issues in some browsers.');
        }
        
        await writeExtensionStorage(LOCAL_STORAGE_KEY, serializedCards);
        removeLegacyLocalStorageKey(LOCAL_STORAGE_KEY);
        debugLog('Cards saved successfully to localStorage with image preservation');
    } catch (error) {
        console.error('Error saving cards to localStorage:', error);
        
        // Get original size again to use in the error handler
        let originalSize = 0;
        try {
            const tempSerialized = JSON.stringify(cards, (key, value) => {
                if (value instanceof Date) return value.toISOString();
                return value;
            });
            originalSize = new Blob([tempSerialized]).size;
        } catch (e) {
            console.error('Could not determine original size:', e);
        }
        
        // Check if it's a quota error
        if (error instanceof DOMException && (
            error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        )) {
            console.error('localStorage quota exceeded. Cannot save more cards. Trying to preserve images by using other strategies.');
            showQuotaWarning();
            
            // We need to handle this gracefully - preserve images where possible
            if (cards.length > 0) {
                console.warn('CRITICAL: Storage quota exceeded. Attempting to preserve images while managing storage.');
                
                try {
                    // Use intelligent storage management to preserve as many cards with images as possible
                    console.warn('Storage quota exceeded. Using intelligent optimization to preserve images...');
                    
                    const cardsWithPersistedImages = await persistCardImages('global', cards);
                    const smartOptimizedCards = manageStorageQuota(cardsWithPersistedImages);
                    
                    if (smartOptimizedCards.length > 0) {
                        const serializedSmart = JSON.stringify(smartOptimizedCards, (key, value) => {
                            if (value instanceof Date) return value.toISOString();
                            return value;
                        });
                        
                        // Check if optimized version fits
                        const smartSize = new Blob([serializedSmart]).size;
                        if (smartSize <= 4.5 * 1024 * 1024) {
                            await writeExtensionStorage(LOCAL_STORAGE_KEY, serializedSmart);
                            removeLegacyLocalStorageKey(LOCAL_STORAGE_KEY);
                            console.warn(`Smart optimization: Saved ${smartOptimizedCards.length} of ${cards.length} cards with images preserved`);
                            return;
                        }
                    }
                    
                    // If only one card, try to compress images instead of removing them
                    const cardsWithCompressedImages = cards.map(card => ({
                        ...card,
                        // Keep images but try to compress them if they're base64
                        image: card.image ? compressImageIfPossible(card.image) : null,
                        // Keep other essential fields as is
                        id: card.id,
                        text: card.text,
                        translation: card.translation,
                        front: card.front,
                        back: card.back,
                        examples: card.examples,
                        imageUrl: card.imageUrl,
                        createdAt: card.createdAt,
                        exportStatus: card.exportStatus,
                        linguisticInfo: card.linguisticInfo,
                        transcription: card.transcription,
                        wordAudio: card.wordAudio,
                        examplesAudio: card.examplesAudio
                    }));
                    
                    console.warn(`Attempting to save cards with compressed images instead of removing them.`);
                    
                    const cardsWithPersistedCompressedImages = await persistCardImages('global', cardsWithCompressedImages);
                    const smallerSerializedCards = JSON.stringify(cardsWithPersistedCompressedImages.map((card) => stripLargeImagePayload(card)), (key, value) => {
                        if (value instanceof Date) return value.toISOString();
                        return value;
                    });
                    
                    // Check if our size reduction helped
                    const newSize = new Blob([smallerSerializedCards]).size;
                    debugLog(`Reduced size from ${originalSize} to ${newSize} bytes`);
                    
                    // If still too large, we have to fall back to removing the newest cards, but preserve more than just 4
                    if (newSize > 4.5 * 1024 * 1024) {
                        console.warn('Still too large after size reduction, falling back to limiting card count');
                        
                        // Don't limit to only 4! That's too few. Instead keep as many as possible
                        // Sort by date (oldest first) to preserve newer cards with their images
                        const sortedCards = [...cardsWithPersistedCompressedImages].sort((a, b) => 
                            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                        );
                        
                        // Start with at least 10 cards and keep adding until we hit size limit
                        let cardsToKeep = Math.min(10, sortedCards.length);
                        let currentBatch;
                        let currentSize;
                        
                        // Try to add more cards until we're close to limit
                        while (cardsToKeep < sortedCards.length) {
                            currentBatch = sortedCards.slice(0, cardsToKeep);
                            const serialized = JSON.stringify(currentBatch, (key, value) => {
                                if (value instanceof Date) return value.toISOString();
                                return value;
                            });
                            currentSize = new Blob([serialized]).size;
                            
                            // If adding more would exceed limit, stop
                            if (currentSize > 4.5 * 1024 * 1024) {
                                break;
                            }
                            
                            // Otherwise try adding more
                            cardsToKeep += 5;
                        }
                        
                        console.warn(`Emergency preservation: keeping ${cardsToKeep} cards out of ${sortedCards.length} total (removing oldest to preserve newest with images)`);
                        
                        // Use the batch that fits (keep the newest cards, remove oldest)
                        const finalBatch = sortedCards.slice(-cardsToKeep);  // Take from the end (newest)
                        await writeExtensionStorage(LOCAL_STORAGE_KEY, JSON.stringify(finalBatch, (key, value) => {
                            if (value instanceof Date) return value.toISOString();
                            return value;
                        }));
                        removeLegacyLocalStorageKey(LOCAL_STORAGE_KEY);
                    } else {
                        // Our size reduction worked, save all cards with compressed images
                        await writeExtensionStorage(LOCAL_STORAGE_KEY, smallerSerializedCards);
                        removeLegacyLocalStorageKey(LOCAL_STORAGE_KEY);
                    }
                    
                    debugLog('Saved cards with image preservation strategy to fit within quota');
                    
                    // Return true to indicate we handled the error
                    return;
                } catch (innerError) {
                    console.error('Failed to save with data reduction:', innerError);
                }
            }
        }
    }
};

export const cardsLocalStorageMiddleware: Middleware<{}, RootState> = store => next => action => {
    // First pass the action through
    const result = next(action);

    // Then handle localStorage operations
    switch (action.type) {
        case LOAD_STORED_CARDS:
            try {
                // Prevent stale localStorage reads when there is pending debounced persistence.
                flushPendingGlobalPersistence();
                flushPendingTabPersistence();
                void (async () => {
                    const cards = await loadCardsFromStorage();
                    store.dispatch({
                        type: 'SET_STORED_CARDS',
                        payload: cards
                    });
                })();
            } catch (error) {
                console.error('Error in LOAD_STORED_CARDS middleware:', error);
                // Initialize with empty array on error
                store.dispatch({
                    type: 'SET_STORED_CARDS',
                    payload: []
                });
            }
            break;

        case SET_CURRENT_TAB_ID: {
            try {
                flushPendingTabPersistence();
                const nextTabId = action.payload as number | null;
                if (!nextTabId) {
                    break;
                }

            } catch (error) {
                console.error('Error loading tab-specific state on tab switch:', error);
            }
            break;
        }
            
        case SAVE_CARD_TO_STORAGE:
        case DELETE_STORED_CARD:
        case UPDATE_STORED_CARD:
            try {
                const state = store.getState();
                const { cards: { storedCards } } = state;
                flushPendingGlobalPersistence();
                void saveCardsToStorage(storedCards);
            } catch (error) {
                console.error('Error in immediate card storage middleware:', error);
            }
            break;

        case UPDATE_CARD_EXPORT_STATUS:
        case SET_STORED_CARDS:
            try {
                // Get the current state after the action has been processed
                const state = store.getState();
                const { cards: { storedCards } } = state;
                scheduleGlobalPersistence(storedCards);
            } catch (error) {
                console.error('Error in card storage middleware:', error);
            }
            break;
        // Handle tab-specific actions
        case SAVE_TAB_CARD:
        case DELETE_TAB_CARD:
        case UPDATE_TAB_STORED_CARD:
        case UPDATE_TAB_CARD_EXPORT_STATUS:
            try {
                const { tabState: { tabStates } } = store.getState();
                const { tabId } = action.payload;
                
                if (tabId && tabStates[tabId]) {
                    const tabStoredCards = tabStates[tabId].storedCards;
                    scheduleTabPersistence(tabId, tabStoredCards);
                }
            } catch (error) {
                console.error('Error in tab storage middleware:', error);
            }
            break;
            
        // Persist current card ID to localStorage
        case SET_CURRENT_CARD_ID: {
            try {
                const state = store.getState();
                const tabId = state?.tabState?.currentTabId;
                if (!tabId) {
                    break;
                }
                const tabKey = (base: string) => tabId ? `${base}_${tabId}` : base;
                if (action.payload) {
                    // Set current card ID only in tab-scoped localStorage.
                    localStorage.setItem(tabKey('current_card_id'), action.payload);
                } else {
                    // Clear tab-scoped keys
                    localStorage.removeItem(tabKey('current_card_id'));
                    localStorage.removeItem(tabKey('explicitly_saved'));
                }
            } catch (error) {
                console.error('Error updating tab-scoped current_card_id:', error);
            }
            break;
        }
            
        // Автоматически проверяем сохраненные карточки при изменении текста
        case SET_TEXT:
            // При изменении текста загружаем сохраненные карточки, если они еще не загружены
            const state = store.getState();
            const { cards: { storedCards } } = state;
            if (storedCards.length === 0) {
                store.dispatch({
                    type: LOAD_STORED_CARDS,
                    payload: { tabId: state?.tabState?.currentTabId }
                });
            }
            break;
    }
    
    return result;
};

export default cardsLocalStorageMiddleware; 
