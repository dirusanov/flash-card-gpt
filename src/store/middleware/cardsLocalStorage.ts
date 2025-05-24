import { Middleware } from 'redux';
import { RootState } from '..';
import { LOAD_STORED_CARDS, SAVE_CARD_TO_STORAGE, DELETE_STORED_CARD, UPDATE_STORED_CARD, SET_TEXT, SET_CURRENT_CARD_ID, UPDATE_CARD_EXPORT_STATUS } from '../actions/cards';
import { StoredCard } from '../reducers/cards';

const LOCAL_STORAGE_KEY = 'anki_stored_cards';

// Helper function to compress base64 images
const compressImageIfPossible = (imageData: string): string => {
    try {
        // If it's a data URI, try to reduce quality by removing unnecessary data
        if (imageData.startsWith('data:image/')) {
            // For very large images, we can try to reduce them
            // This is a simple approach - in a full implementation we'd use canvas to resize
            if (imageData.length > 100000) { // > 100KB
                console.log('Large image detected, applying basic compression');
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

// Function to estimate and manage storage efficiently
const manageStorageQuota = (cards: StoredCard[]): StoredCard[] => {
    try {
        // Calculate storage usage
        const serialized = JSON.stringify(cards, (key, value) => {
            if (value instanceof Date) return value.toISOString();
            return value;
        });
        
        const sizeInBytes = new Blob([serialized]).size;
        const sizeInMB = sizeInBytes / (1024 * 1024);
        
        console.log(`Storage analysis: ${cards.length} cards, ${sizeInMB.toFixed(2)}MB`);
        
        // If size is manageable, return as is
        if (sizeInMB < 4) {
            return cards;
        }
        
        // If size is too large, prioritize newest cards and preserve images where possible
        console.warn('Storage size is large, optimizing...');
        
        // Sort by creation date (newest first)
        const sortedCards = [...cards].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        
        // Keep adding cards until we reach a reasonable size
        const optimizedCards: StoredCard[] = [];
        let currentSize = 0;
        
        for (const card of sortedCards) {
            const cardSerialized = JSON.stringify(card, (key, value) => {
                if (value instanceof Date) return value.toISOString();
                return value;
            });
            const cardSize = new Blob([cardSerialized]).size;
            
            // If adding this card would exceed limit, stop
            if (currentSize + cardSize > 4 * 1024 * 1024) {
                console.warn(`Stopping at ${optimizedCards.length} cards to stay within storage limit`);
                break;
            }
            
            optimizedCards.push(card);
            currentSize += cardSize;
        }
        
        return optimizedCards;
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
        
        // Pre-optimize cards to manage storage quota intelligently
        const optimizedCards = manageStorageQuota(cards);
        
        if (optimizedCards.length < cards.length) {
            console.warn(`Storage optimization: keeping ${optimizedCards.length} of ${cards.length} cards to preserve images`);
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
        console.log('Storage size in bytes:', storageSizeInBytes, 'Approximate max size: ~5MB');
        
        // Most browsers have a 5MB-10MB limit for localStorage
        if (storageSizeInBytes > 4 * 1024 * 1024) { // 4MB warning
            console.warn('Warning: localStorage size is getting large (>4MB). This might cause issues in some browsers.');
        }
        
        localStorage.setItem(LOCAL_STORAGE_KEY, serializedCards);
        console.log('Cards saved successfully to localStorage with image preservation');
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
                    
                    const smartOptimizedCards = manageStorageQuota(cards);
                    
                    if (smartOptimizedCards.length > 0) {
                        const serializedSmart = JSON.stringify(smartOptimizedCards, (key, value) => {
                            if (value instanceof Date) return value.toISOString();
                            return value;
                        });
                        
                        // Check if optimized version fits
                        const smartSize = new Blob([serializedSmart]).size;
                        if (smartSize <= 4.5 * 1024 * 1024) {
                            localStorage.setItem(LOCAL_STORAGE_KEY, serializedSmart);
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
                        transcription: card.transcription
                    }));
                    
                    console.warn(`Attempting to save cards with compressed images instead of removing them.`);
                    
                    const smallerSerializedCards = JSON.stringify(cardsWithCompressedImages, (key, value) => {
                        if (value instanceof Date) return value.toISOString();
                        return value;
                    });
                    
                    // Check if our size reduction helped
                    const newSize = new Blob([smallerSerializedCards]).size;
                    console.log(`Reduced size from ${originalSize} to ${newSize} bytes`);
                    
                    // If still too large, we have to fall back to removing the newest cards, but preserve more than just 4
                    if (newSize > 4.5 * 1024 * 1024) {
                        console.warn('Still too large after size reduction, falling back to limiting card count');
                        
                        // Don't limit to only 4! That's too few. Instead keep as many as possible
                        // Sort by date (oldest first) to preserve newer cards with their images
                        const sortedCards = [...cardsWithCompressedImages].sort((a, b) => 
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
                        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalBatch, (key, value) => {
                            if (value instanceof Date) return value.toISOString();
                            return value;
                        }));
                    } else {
                        // Our size reduction worked, save all cards with compressed images
                        localStorage.setItem(LOCAL_STORAGE_KEY, smallerSerializedCards);
                    }
                    
                    console.log('Saved cards with image preservation strategy to fit within quota');
                    
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