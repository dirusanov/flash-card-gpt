import { fetchDecks } from '../../services/ankiService';

export const FETCH_DECKS = 'FETCH_DECKS';
export const FETCH_DECKS_SUCCESS = 'FETCH_DECKS_SUCCESS';
export const SET_DECK_ID = 'SET_DECK_ID';

export type Deck = string;


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
