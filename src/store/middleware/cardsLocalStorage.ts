import { Middleware } from 'redux';
import { RootState } from '..';
import { LOAD_STORED_CARDS, SAVE_CARD_TO_STORAGE, DELETE_STORED_CARD, UPDATE_STORED_CARD, SET_TEXT } from '../actions/cards';
import { StoredCard } from '../reducers/cards';

const LOCAL_STORAGE_KEY = 'anki_stored_cards';

// Вспомогательная функция для загрузки карточек из localStorage
export const loadCardsFromStorage = (): StoredCard[] => {
    try {
        const storedCardsJson = localStorage.getItem(LOCAL_STORAGE_KEY);
        console.log('Loading cards from localStorage:', storedCardsJson);
        
        if (storedCardsJson) {
            const storedCards: StoredCard[] = JSON.parse(storedCardsJson);
            console.log('Parsed cards:', storedCards);
            
            // Convert date strings back to Date objects
            const cardsWithDates = storedCards.map(card => ({
                ...card,
                createdAt: new Date(card.createdAt)
            }));
            
            return cardsWithDates;
        }
    } catch (error) {
        console.error('Error loading cards from localStorage:', error);
    }
    
    return [];
};

// Вспомогательная функция для сохранения карточек в localStorage
export const saveCardsToStorage = (cards: StoredCard[]): void => {
    try {
        console.log('Saving cards to localStorage:', cards);
        
        // Save to localStorage - ensure we're not trying to save circular structures
        const serializedCards = JSON.stringify(cards, (key, value) => {
            // Convert Date objects to ISO strings for proper serialization
            if (value instanceof Date) {
                return value.toISOString();
            }
            return value;
        });
        
        localStorage.setItem(LOCAL_STORAGE_KEY, serializedCards);
        console.log('Cards saved successfully to localStorage');
    } catch (error) {
        console.error('Error saving cards to localStorage:', error);
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