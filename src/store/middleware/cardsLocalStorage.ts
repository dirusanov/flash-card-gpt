import { Middleware } from 'redux';
import { RootState } from '..';
import { LOAD_STORED_CARDS, SAVE_CARD_TO_STORAGE, DELETE_STORED_CARD, UPDATE_STORED_CARD } from '../actions/cards';
import { StoredCard } from '../reducers/cards';

const LOCAL_STORAGE_KEY = 'anki_stored_cards';

export const cardsLocalStorageMiddleware: Middleware<{}, RootState> = store => next => action => {
    // First pass the action through
    const result = next(action);
    
    // Then handle localStorage operations
    switch (action.type) {
        case LOAD_STORED_CARDS:
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
                    
                    // Dispatch a new action to set the loaded cards in state
                    store.dispatch({
                        type: 'SET_STORED_CARDS',
                        payload: cardsWithDates
                    });
                } else {
                    console.log('No stored cards found in localStorage');
                    // Initialize with empty array if nothing exists
                    store.dispatch({
                        type: 'SET_STORED_CARDS',
                        payload: []
                    });
                }
            } catch (error) {
                console.error('Error loading cards from localStorage:', error);
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
                console.log('Saving cards to localStorage:', storedCards);
                
                // Save to localStorage - ensure we're not trying to save circular structures
                const serializedCards = JSON.stringify(storedCards, (key, value) => {
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
            break;
    }
    
    return result;
};

export default cardsLocalStorageMiddleware; 