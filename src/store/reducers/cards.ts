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
    SET_CURRENT_CARD_ID,
    SET_LINGUISTIC_INFO,
    SET_TRANSCRIPTION,
    SET_IS_GENERATING_CARD,
    SET_LAST_DRAFT_CARD,
} from '../actions/cards';
import {CardLangLearning, CardGeneral} from "../../services/ankiService";
import { Modes } from '../../constants';

export type ExportStatus = 'not_exported' | 'exported_to_file' | 'exported_to_anki' | 'exported' | 'failed';

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
    linguisticInfo?: string;
    transcription?: string;
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
        currentCardId: null,
        linguisticInfo: "",
        transcription: "",
        isGeneratingCard: false,
        lastDraftCard: null
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
    linguisticInfo: string;
    transcription: string;
    isGeneratingCard: boolean;
    lastDraftCard: StoredCard | null;
}

const ensureDate = (value: StoredCard['createdAt'] | string | number | undefined): Date => {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }

    return new Date();
};

const findLatestCard = (cards: StoredCard[]): StoredCard | null => {
    if (!cards.length) {
        return null;
    }

    return cards.reduce<StoredCard>((latest, current) => {
        const latestDate = ensureDate(latest.createdAt);
        const currentDate = ensureDate(current.createdAt);

        if (currentDate.getTime() >= latestDate.getTime()) {
            return { ...current, createdAt: currentDate };
        }

        return latest;
    }, { ...cards[0], createdAt: ensureDate(cards[0].createdAt) });
};

const cardsReducer = (state = initialState, action: any): CardState => {
    const newState = { ...state };

    switch (action.type) {
        case SAVE_ANKI_CARDS:
            newState.savedCards = [...state.savedCards, ...action.payload];
            break;
        case SAVE_CARD_TO_STORAGE:
            console.log('*** REDUCER: SAVE_CARD_TO_STORAGE action received ***');
            console.log('Action payload raw:', action.payload);
            console.log('Action payload image data:', {
                hasImage: !!action.payload.image,
                hasImageUrl: !!action.payload.imageUrl,
                imageType: typeof action.payload.image,
                imageUrlType: typeof action.payload.imageUrl,
                imageValue: action.payload.image,
                imageUrlValue: action.payload.imageUrl,
                imageUndefinedCheck: action.payload.image !== undefined,
                imageUrlUndefinedCheck: action.payload.imageUrl !== undefined
            });
            
            const newCardData: StoredCard = {
                ...(action.payload.id ? 
                    action.payload : 
                    { ...action.payload, id: Date.now().toString() }),
                image: action.payload.image !== undefined ? action.payload.image : null,
                imageUrl: action.payload.imageUrl !== undefined ? action.payload.imageUrl : null,
                exportStatus: action.payload.exportStatus || 'not_exported',
                linguisticInfo: action.payload.linguisticInfo || "",
                transcription: action.payload.transcription || ""
            };
            const newCard: StoredCard = {
                ...newCardData,
                createdAt: ensureDate(newCardData.createdAt)
            };
            
            console.log('REDUCER: Final card object created:', {
                cardId: newCard.id,
                hasImage: !!newCard.image,
                hasImageUrl: !!newCard.imageUrl,
                imageType: typeof newCard.image,
                imageUrlType: typeof newCard.imageUrl,
                imageLength: newCard.image?.length,
                imageUrlLength: newCard.imageUrl?.length,
                imageActualValue: newCard.image,
                imageUrlActualValue: newCard.imageUrl,
                imagePreview: newCard.image?.substring(0, 50),
                imageUrlPreview: newCard.imageUrl?.substring(0, 50)
            });
            
            // Check for existing card by ID only, not by text
            const existingCard = state.storedCards.find(card => card.id === newCard.id);
            
            if (existingCard) {
                newState.storedCards = state.storedCards.map(card => 
                    card.id === existingCard.id ? 
                        { ...newCard, id: existingCard.id } : 
                        card
                );
                console.log('Updated existing card with ID:', newCard.id, 'text:', newCard.text);
            } else {
                newState.storedCards = [...state.storedCards, newCard];
                console.log('Added new card with ID:', newCard.id, 'text:', newCard.text);
                console.log('Total stored cards after addition:', newState.storedCards.length);
            }
            newState.lastDraftCard = newCard;
            break;
        case UPDATE_CARD_EXPORT_STATUS:
            newState.storedCards = state.storedCards.map(card => 
                card.id === action.payload.cardId 
                    ? { ...card, exportStatus: action.payload.status }
                    : card
            );
            break;
        case UPDATE_STORED_CARD:
            console.log('*** REDUCER: UPDATE_STORED_CARD action received ***');
            console.log('Update payload image info:', {
                cardId: action.payload.id,
                hasImage: !!action.payload.image,
                hasImageUrl: !!action.payload.imageUrl,
                imageType: typeof action.payload.image,
                imageUrlType: typeof action.payload.imageUrl,
                imageValue: action.payload.image,
                imageUrlValue: action.payload.imageUrl,
                imageLength: action.payload.image?.length,
                imageUrlLength: action.payload.imageUrl?.length
            });
            
            if (!action.payload.id) {
                console.error('Cannot update card without ID');
                return state;
            }
            
            const cardExists = state.storedCards.some(card => card.id === action.payload.id);
            
            if (cardExists) {
                newState.storedCards = state.storedCards.map(card =>
                    card.id === action.payload.id
                        ? { 
                            ...card,
                            ...action.payload,
                            createdAt: ensureDate(action.payload.createdAt ?? card.createdAt),
                            exportStatus: action.payload.exportStatus || card.exportStatus,
                            linguisticInfo: action.payload.linguisticInfo || card.linguisticInfo,
                            transcription: action.payload.transcription || card.transcription
                        }
                        : card
                );
                console.log('UPDATE_STORED_CARD: Updated existing card with ID:', action.payload.id, 'image:', !!action.payload.image);
            } else {
                const newCardToAdd = {
                    ...action.payload,
                    createdAt: ensureDate(action.payload.createdAt),
                    exportStatus: action.payload.exportStatus || 'not_exported',
                    linguisticInfo: action.payload.linguisticInfo || "",
                    transcription: action.payload.transcription || ""
                };
                newState.storedCards = [...state.storedCards, newCardToAdd];
                console.log('UPDATE_STORED_CARD: Added new card with ID:', action.payload.id, 'image:', !!newCardToAdd.image);
            }
            newState.lastDraftCard = findLatestCard(newState.storedCards);
            break;
        case LOAD_STORED_CARDS:
            // This will be handled by the persistence middleware
            break;
        case SET_STORED_CARDS:
            const normalizedCards = (action.payload || []).map((card: StoredCard) => ({
                ...card,
                createdAt: ensureDate(card.createdAt)
            }));
            newState.storedCards = normalizedCards;
            break;
        case DELETE_STORED_CARD:
            newState.storedCards = state.storedCards.filter(card => card.id !== action.payload);
            newState.lastDraftCard = findLatestCard(newState.storedCards);
            break;
        case SET_TEXT:
            newState.text = action.payload;
            // SPECIAL CASE: If text is being completely cleared (empty string), 
            // also clear images to prevent them from appearing on the next card
            if (action.payload === '' || action.payload.trim() === '') {
                console.log('Text cleared completely, also clearing images');
                newState.image = null;
                newState.imageUrl = null;
            }
            // Otherwise, preserve images for text changes (editing existing cards)
            break;
        case SET_TRANSLATION:
            newState.translation = action.payload;
            break;
        case SET_EXAMPLES:
            newState.examples = action.payload;
            break;
        case SET_IMAGE:
            console.log('*** REDUCER: SET_IMAGE called with:', {
                hasPayload: !!action.payload,
                payloadType: typeof action.payload,
                payloadLength: action.payload?.length,
                payloadPreview: action.payload?.substring(0, 50)
            });
            newState.image = action.payload;
            break;
        case SET_IMAGE_URL:
            console.log('*** REDUCER: SET_IMAGE_URL called with:', {
                hasPayload: !!action.payload,
                payloadType: typeof action.payload,
                payloadLength: action.payload?.length,
                payloadPreview: action.payload?.substring(0, 50)
            });
            return { ...state, imageUrl: action.payload };
        case SET_BACK:
            return { ...state, back: action.payload };
        case SET_FRONT:
            return { ...state, front: action.payload };
        case SET_CURRENT_CARD_ID:
            return { ...state, currentCardId: action.payload };
        case SET_LINGUISTIC_INFO:
            return { ...state, linguisticInfo: action.payload };
        case SET_TRANSCRIPTION:
            return { ...state, transcription: action.payload };
        case SET_IS_GENERATING_CARD:
            return { ...state, isGeneratingCard: action.payload };
        case SET_LAST_DRAFT_CARD:
            return { ...state, lastDraftCard: action.payload ? { ...action.payload, createdAt: ensureDate(action.payload.createdAt) } : null };
        default:
            return state;
    }

    return newState;
};


export default cardsReducer;
