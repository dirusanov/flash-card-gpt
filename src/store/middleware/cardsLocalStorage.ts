import { Middleware } from 'redux';
import { RootState } from '..';
import { LOAD_STORED_CARDS, SAVE_CARD_TO_STORAGE, DELETE_STORED_CARD, UPDATE_STORED_CARD, SET_TEXT, SET_CURRENT_CARD_ID, UPDATE_CARD_EXPORT_STATUS } from '../actions/cards';
import { StoredCard } from '../reducers/cards';

const LOCAL_STORAGE_KEY = 'anki_stored_cards';

// Вспомогательная функция для загрузки карточек из localStorage
export const loadCardsFromStorage = (): StoredCard[] => {
    try {
        const storedCardsJson = localStorage.getItem(LOCAL_STORAGE_KEY);
        console.log('Loading cards from localStorage. Data exists:', !!storedCardsJson);
        
        if (storedCardsJson) {
            // Try to parse the JSON
            try {
                const storedCards: StoredCard[] = JSON.parse(storedCardsJson);
                console.log('Successfully parsed cards from localStorage, total count:', storedCards.length);
                
                // List first few and last few cards to help diagnose issues
                if (storedCards.length > 0) {
                    const firstFew = storedCards.slice(0, Math.min(3, storedCards.length));
                    const lastFew = storedCards.length > 3 ? storedCards.slice(-3) : [];
                    
                    console.log('First few cards:', firstFew.map(c => ({ id: c.id, text: c.text?.substring(0, 20) })));
                    if (lastFew.length > 0) {
                        console.log('Last few cards:', lastFew.map(c => ({ id: c.id, text: c.text?.substring(0, 20) })));
                    }
                }
                
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
                
                console.log(`Card validation: ${validCards.length} valid out of ${storedCards.length} total`);
                
                // Convert date strings back to Date objects
                const cardsWithDates = validCards.map(card => ({
                    ...card,
                    createdAt: new Date(card.createdAt)
                }));
                
                // Check images in loaded cards
                const loadedCardsWithImages = cardsWithDates.filter(card => card.image || card.imageUrl);
                console.log('Loaded cards with images:', loadedCardsWithImages.length);
                loadedCardsWithImages.forEach(card => {
                    console.log(`Loaded card ${card.id} image data:`, {
                        hasImage: !!card.image,
                        hasImageUrl: !!card.imageUrl,
                        imageLength: card.image?.length,
                        imageUrlLength: card.imageUrl?.length,
                        imagePreview: card.image?.substring(0, 50),
                        imageUrlPreview: card.imageUrl?.substring(0, 50)
                    });
                });
                
                return cardsWithDates;
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

// Вспомогательная функция для сохранения карточек в localStorage
export const saveCardsToStorage = (cards: StoredCard[]): void => {
    try {
        console.log('Saving cards to localStorage:', cards);
        console.log('Total cards count:', cards.length);
        
        // Check images in cards being saved
        const cardsWithImages = cards.filter(card => card.image || card.imageUrl);
        console.log('Cards with images:', cardsWithImages.length);
        cardsWithImages.forEach(card => {
            console.log(`Card ${card.id} image data:`, {
                hasImage: !!card.image,
                hasImageUrl: !!card.imageUrl,
                imageLength: card.image?.length,
                imageUrlLength: card.imageUrl?.length,
                imagePreview: card.image?.substring(0, 50),
                imageUrlPreview: card.imageUrl?.substring(0, 50)
            });
        });
        
        // Save to localStorage - ensure we're not trying to save circular structures
        const serializedCards = JSON.stringify(cards, (key, value) => {
            // Convert Date objects to ISO strings for proper serialization
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        });
        
        // Check localStorage size limit
        const storageSizeInBytes = new Blob([serializedCards]).size;
        console.log('Storage size in bytes:', storageSizeInBytes, 'Approximate max size: ~5MB');
        
        // Most browsers have a 5MB-10MB limit for localStorage
        if (storageSizeInBytes > 4 * 1024 * 1024) { // 4MB warning
            console.warn('Warning: localStorage size is getting large (>4MB). This might cause issues in some browsers.');
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEY, serializedCards);
        console.log('Cards saved successfully to localStorage');
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
            console.error('localStorage quota exceeded. Cannot save more cards. Try removing some cards.');
            // We need to handle this gracefully - remove some cards to make space
            if (cards.length > 0) {
                console.warn('CRITICAL: Storage quota exceeded. Attempting to fix by reducing card data size instead of removing cards.');
                
                try {
                    // Instead of removing cards, try to reduce their size by removing large data
                    const reducedSizeCards = cards.map(card => ({
                        ...card,
                        // Remove images which are the largest data
                        image: null,
                        // Keep other essential fields
                        id: card.id,
                        text: card.text,
                        translation: card.translation,
                        front: card.front,
                        // Trim large text fields
                        back: card.back ? card.back.substring(0, 1000) : null,
                        // Limit examples to first 2
                        examples: card.examples && card.examples.length > 2 ? 
                            card.examples.slice(0, 2) : card.examples,
                        createdAt: card.createdAt,
                        exportStatus: card.exportStatus,
                    }));
                    
                    console.warn(`Attempting to save cards with reduced data instead of limiting to 4 cards.`);
                    
                    const smallerSerializedCards = JSON.stringify(reducedSizeCards, (key, value) => {
                        if (value instanceof Date) return value.toISOString();
                        return value;
                    });
                    
                    // Check if our size reduction helped
                    const newSize = new Blob([smallerSerializedCards]).size;
                    console.log(`Reduced size from ${originalSize} to ${newSize} bytes`);
                    
                    // If still too large, we have to fall back to limiting cards, but preserve more than just 4
                    if (newSize > 4.5 * 1024 * 1024) {
                        console.warn('Still too large after size reduction, falling back to limiting card count');
                        
                        // Don't limit to only 4! That's too few. Instead keep as many as possible
                        // Sort by date (newest first) and keep as many as possible up to storage limit
                        const sortedCards = [...reducedSizeCards].sort((a, b) => 
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
                        
                        console.warn(`Emergency preservation: keeping ${cardsToKeep} newest cards out of ${sortedCards.length} total`);
                        
                        // Use the latest known good batch
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentBatch, (key, value) => {
                            if (value instanceof Date) return value.toISOString();
                            return value;
                        }));
                    } else {
                        // Our size reduction worked, save all cards with reduced data
                        localStorage.setItem(LOCAL_STORAGE_KEY, smallerSerializedCards);
                    }
                    
                    console.log('Saved cards with data reduction to fit within quota');
                    
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
                const cards = loadCardsFromStorage();
                // Dispatch a new action to set the loaded cards in state
                store.dispatch({
                    type: 'SET_STORED_CARDS',
                    payload: cards
                });
            } catch (error) {
                console.error('Error in LOAD_STORED_CARDS middleware:', error);
                // Initialize with empty array on error
                store.dispatch({
                    type: 'SET_STORED_CARDS',
                    payload: []
                });
            }
            break;
            
        case SAVE_CARD_TO_STORAGE:
        case DELETE_STORED_CARD:
        case UPDATE_STORED_CARD:
        case UPDATE_CARD_EXPORT_STATUS:
            try {
                // Get the current state after the action has been processed
                const { cards: { storedCards } } = store.getState();
                saveCardsToStorage(storedCards);
            } catch (error) {
                console.error('Error in card storage middleware:', error);
            }
            break;
            
        // Persist current card ID to localStorage
        case SET_CURRENT_CARD_ID:
            if (action.payload) {
                // Set the current card ID in localStorage
                localStorage.setItem('current_card_id', action.payload);
                
                // We do not automatically set the explicitly saved flag - this will be 
                // set only when a card is actually saved by the user
                // This prevents cards from being marked as "Saved to Collection" prematurely
            } else {
                // When clearing the current card ID, also clear the explicitly saved flag
                localStorage.removeItem('current_card_id');
                localStorage.removeItem('explicitly_saved');
            }
            break;
            
        // Автоматически проверяем сохраненные карточки при изменении текста
        case SET_TEXT:
            // При изменении текста загружаем сохраненные карточки, если они еще не загружены
            const { cards: { storedCards } } = store.getState();
            if (storedCards.length === 0) {
                store.dispatch({
                    type: LOAD_STORED_CARDS
                });
            }
            break;
    }
    
    return result;
};

export default cardsLocalStorageMiddleware; 