import {Deck, FETCH_DECKS_SUCCESS, SET_DECK_ID} from "../actions/decks";

export interface DeckState {
    decks: Deck[];
    deckId: '',
}

const initialState: DeckState = {
    decks: [],
    deckId: '',
};

export default function decksReducer(
    state = initialState,
    action: any
): DeckState {
    switch (action.type) {
        case FETCH_DECKS_SUCCESS:
            return { ...state, decks: action.payload };
        case SET_DECK_ID:
            return { ...state, deckId: action.payload };
        default:
            return state;
    }
}
