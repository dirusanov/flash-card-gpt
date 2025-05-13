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
                if (storedCardsJson) {
                    const storedCards: StoredCard[] = JSON.parse(storedCardsJson);
                    
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
                }
            } catch (error) {
                console.error('Error loading cards from localStorage:', error);
            }
            break;
            
        case SAVE_CARD_TO_STORAGE:
        case DELETE_STORED_CARD:
        case UPDATE_STORED_CARD:
            try {
                // Get the current state after the action has been processed
                const { cards: { storedCards } } = store.getState();
                
                // Save to localStorage
                localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(storedCards));
            } catch (error) {
                console.error('Error saving cards to localStorage:', error);
            }
            break;
    }
    
    return result;
};

export default cardsLocalStorageMiddleware; 