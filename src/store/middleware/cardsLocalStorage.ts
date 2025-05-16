import { Middleware } from 'redux';
import { RootState } from '..';
import { LOAD_STORED_CARDS, SAVE_CARD_TO_STORAGE, DELETE_STORED_CARD, UPDATE_STORED_CARD, SET_TEXT, SET_CURRENT_CARD_ID } from '../actions/cards';
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
                console.log('Successfully parsed cards from localStorage, count:', storedCards.length);
                
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
        
        // Check if it's a quota error
        if (error instanceof DOMException && (
            error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
        )) {
            console.error('localStorage quota exceeded. Cannot save more cards. Try removing some cards.');
            // We need to handle this gracefully - remove some cards to make space
            if (cards.length > 0) {
                // Emergency solution: keep only the most recent half of the cards
                const reducedCards = cards.sort((a, b) => 
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                ).slice(0, Math.max(4, Math.ceil(cards.length / 2)));
                
                console.warn(`Emergency cleanup: reduced cards from ${cards.length} to ${reducedCards.length}`);
                
                try {
                    const smallerSerializedCards = JSON.stringify(reducedCards, (key, value) => {
                        if (value instanceof Date) return value.toISOString();
                        return value;
                    });
                    
                    localStorage.setItem(LOCAL_STORAGE_KEY, smallerSerializedCards);
                    console.log('Saved reduced card set successfully');
                } catch (innerError) {
                    console.error('Failed to save even reduced card set:', innerError);
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
                localStorage.setItem('current_card_id', action.payload);
            } else {
                localStorage.removeItem('current_card_id');
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