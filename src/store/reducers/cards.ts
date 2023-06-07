import {SAVE_ANKI_CARDS, SET_EXAMPLES, SET_IMAGE, SET_IMAGE_URL, SET_TRANSLATION, SET_TEXT, SET_BACK} from '../actions/cards';
import {CardLangLearning, CardGeneral} from "../../services/ankiService";


const initialState: CardState = {
    ...{
        savedCards: [],
        text: "",
        translation: "",
        examples: [],
        image: null,
        imageUrl: null,
        error: undefined,
        back: null
    },
};

export interface CardState {
    savedCards: CardLangLearning[] | CardGeneral[];
    text: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image: string | null;
    imageUrl: string | null;
    error: string | undefined
    back: string | null
}

const cardsReducer = (state = initialState, action: any): CardState => {
    const newState = { ...state };

    switch (action.type) {
        case SAVE_ANKI_CARDS:
            newState.savedCards = [...state.savedCards, ...action.payload];
            break;
        case SET_TEXT:
            newState.text = action.payload;
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
        case SET_BACK:
            return { ...state, back: action.payload };
        default:
            return state;
    }

    return newState;
};


export default cardsReducer;
