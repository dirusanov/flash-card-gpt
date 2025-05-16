import {
    SAVE_ANKI_CARDS, 
    SET_EXAMPLES, 
    SET_IMAGE, 
    SET_IMAGE_URL, 
    SET_TRANSLATION, 
    SET_TEXT, 
    SET_BACK,
    SET_FRONT,
    SAVE_CARD_TO_STORAGE,
    LOAD_STORED_CARDS,
    DELETE_STORED_CARD,
    SET_STORED_CARDS,
    UPDATE_CARD_EXPORT_STATUS,
    UPDATE_STORED_CARD,
    SET_CURRENT_CARD_ID
} from '../actions/cards';
import {CardLangLearning, CardGeneral} from "../../services/ankiService";
import { Modes } from '../../constants';

export type ExportStatus = 'not_exported' | 'exported_to_file' | 'exported_to_anki';

export interface StoredCard {
    id: string;
    mode: Modes;
    front?: string;
    back?: string | null;
    text: string;
    translation?: string | null;
    examples?: Array<[string, string | null]>;
    image?: string | null;
    imageUrl?: string | null;
    createdAt: Date;
    exportStatus: ExportStatus;
}

const initialState: CardState = {
    ...{
        savedCards: [],
        storedCards: [],
        text: "",
        translation: "",
        examples: [],
        image: null,
        imageUrl: null,
        error: undefined,
        back: null,
        front: "",
        currentCardId: null
    },
};

export interface CardState {
    savedCards: CardLangLearning[] | CardGeneral[];
    storedCards: StoredCard[];
    text: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image: string | null;
    imageUrl: string | null;
    error: string | undefined;
    back: string | null;
    front: string;
    currentCardId: string | null;
}

const cardsReducer = (state = initialState, action: any): CardState => {
    const newState = { ...state };

    switch (action.type) {
        case SAVE_ANKI_CARDS:
            newState.savedCards = [...state.savedCards, ...action.payload];
            break;
        case SAVE_CARD_TO_STORAGE:
            const newCard: StoredCard = {
                ...(action.payload.id ? 
                    action.payload : 
                    { ...action.payload, id: Date.now().toString() }),
                exportStatus: action.payload.exportStatus || 'not_exported'
            };
            
            const existingCard = state.storedCards.find(card => card.text === newCard.text);
            
            if (existingCard) {
                newState.storedCards = state.storedCards.map(card => 
                    card.id === existingCard.id ? 
                        { ...newCard, id: existingCard.id } : 
                        card
                );
                console.log('Updated existing card with text:', newCard.text);
            } else {
                newState.storedCards = [...state.storedCards, newCard];
                console.log('Added new card:', newCard.text);
            }
            break;
        case UPDATE_CARD_EXPORT_STATUS:
            newState.storedCards = state.storedCards.map(card => 
                card.id === action.payload.cardId 
                    ? { ...card, exportStatus: action.payload.status }
                    : card
            );
            break;
        case UPDATE_STORED_CARD:
            if (!action.payload.id) {
                console.error('Cannot update card without ID');
                return state;
            }
            
            const cardExists = state.storedCards.some(card => card.id === action.payload.id);
            
            if (cardExists) {
                newState.storedCards = state.storedCards.map(card =>
                    card.id === action.payload.id
                        ? { 
                            ...action.payload,
                            exportStatus: action.payload.exportStatus || card.exportStatus 
                        }
                        : card
                );
                console.log('Updated card with ID:', action.payload.id);
            } else {
                newState.storedCards = [...state.storedCards, {
                    ...action.payload,
                    exportStatus: action.payload.exportStatus || 'not_exported'
                }];
                console.log('Added new card with ID:', action.payload.id);
            }
            break;
        case LOAD_STORED_CARDS:
            // This will be handled by the persistence middleware
            break;
        case SET_STORED_CARDS:
            newState.storedCards = action.payload;
            break;
        case DELETE_STORED_CARD:
            newState.storedCards = state.storedCards.filter(card => card.id !== action.payload);
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
        case SET_FRONT:
            return { ...state, front: action.payload };
        case SET_CURRENT_CARD_ID:
            return { ...state, currentCardId: action.payload };
        default:
            return state;
    }

    return newState;
};


export default cardsReducer;
