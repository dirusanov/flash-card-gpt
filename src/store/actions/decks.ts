
export const FETCH_DECKS = 'FETCH_DECKS';
export const FETCH_DECKS_SUCCESS = 'FETCH_DECKS_SUCCESS';
export const SET_DECK_ID = 'SET_DECK_ID';

export type Deck = string;


export const fetchDecks = () => {
    return async (dispatch: any) => {
        try {
            const response = await fetch('http://localhost:8765', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deckNames', version: 6 }),
            });
            const decks = await response.json();
            dispatch(fetchDecksSuccess(decks.result));
        } catch (error) {
            console.error('Error fetching decks:', error);
        }
    };
};

export const fetchDecksSuccess = (decks: string[]) => {
    return {
        type: FETCH_DECKS_SUCCESS,
        payload: decks,
    };
};

export const setDeckId = (deckId: string) => ({
    type: SET_DECK_ID,
    payload: deckId,
});