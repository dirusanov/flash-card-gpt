
export const FETCH_DECKS = 'FETCH_DECKS';
export const FETCH_DECKS_SUCCESS = 'FETCH_DECKS_SUCCESS';

export type Deck = string;

export interface FetchDecksAction {
    type: typeof FETCH_DECKS;
}

export interface FetchDecksSuccessAction {
    type: typeof FETCH_DECKS_SUCCESS;
    payload: Deck[];
}

export type DecksActionTypes = FetchDecksAction | FetchDecksSuccessAction;

export const fetchDecks = () => {
    return async (dispatch: any) => {
        try {
            const response = await fetch('http://localhost:9090/http://localhost:8765', {
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
