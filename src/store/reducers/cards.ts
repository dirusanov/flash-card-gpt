import {SAVE_ANKI_CARDS, SET_EXAMPLES, SET_IMAGE, SET_IMAGE_URL, SET_TRANSLATION, SET_WORD} from '../actions/cards';
import {Card} from "../../services/ankiService";


const initialState: CardState = {
    ...{
        savedCards: [],
        word: "",
        translation: "",
        examples: [],
        image: null,
        imageUrl: null,
        error: undefined,
    },
};

export interface CardState {
    savedCards: Card[];
    word: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image: string | null;
    imageUrl: string | null;
    error: string | undefined
}

const cardsReducer = (state = initialState, action: any): CardState => {
    const newState = { ...state };

    switch (action.type) {
        case SAVE_ANKI_CARDS:
            newState.savedCards = [...state.savedCards, ...action.payload];
            break;
        case SET_WORD:
            newState.word = action.payload;
            break;
        case SET_TRANSLATION:
            newState.translation = action.payload;
            break;
        case SET_EXAMPLES:
            newState.examples = action.payload;
            break;
        case SET_IMAGE:
            newState.image = action.payload;
            break;
        case SET_IMAGE_URL:
            return { ...state, imageUrl: action.payload };
        default:
            return state;
    }

    return newState;
};


export default cardsReducer;
