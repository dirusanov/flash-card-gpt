import {Deck, DecksActionTypes, FETCH_DECKS_SUCCESS} from "../actions/decks";

export interface DeckState {
    decks: Deck[];
}

const initialState: DeckState = {
    decks: [],
};

export default function decksReducer(
    state = initialState,
    action: DecksActionTypes
): DeckState {
    switch (action.type) {
        case FETCH_DECKS_SUCCESS:
            return { ...state, decks: action.payload };
        default:
            return state;
    }
}
