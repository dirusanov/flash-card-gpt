import { Dispatch } from 'redux';
import {CardLangLearning, CardGeneral, createAnkiCards} from "../../services/ankiService";
import { Modes } from '../../constants';

export const SAVE_ANKI_CARDS = 'SAVE_ANKI_CARDS';
export const SET_TEXT = "SET_TEXT";
export const SET_TRANSLATION = "SET_TRANSLATION";
export const SET_EXAMPLES = "SET_EXAMPLES";
export const SET_IMAGE = "SET_IMAGE";
export const SET_IMAGE_URL = 'SET_IMAGE_URL';
export const SET_BACK = 'SET_BACK';
export const SAVE_CARD_TO_STORAGE = 'SAVE_CARD_TO_STORAGE';
export const LOAD_STORED_CARDS = 'LOAD_STORED_CARDS';
export const DELETE_STORED_CARD = 'DELETE_STORED_CARD';
export const SET_STORED_CARDS = 'SET_STORED_CARDS';

export const saveAnkiCards = (
        mode: Modes, 
        ankiConnectUrl: string, 
        ankiConnectApiKey: string | null = null, 
        deckName: string, 
        model_name: string, 
        cards: CardLangLearning[] | CardGeneral[]
    ) => async (dispatch: Dispatch) => {
    try {
        const result = await createAnkiCards(mode, ankiConnectUrl, ankiConnectApiKey, deckName, model_name, cards);
        dispatch({ type: SAVE_ANKI_CARDS, payload: result });
    } catch (error) {
        console.error('Error saving Anki cards:', error);
        throw error
    }
};

export const saveCardToStorage = (
    card: {
        mode: Modes;
        front?: string;
        back?: string | null;
        text: string;
        translation?: string | null;
        examples?: Array<[string, string | null]>;
        image?: string | null;
        imageUrl?: string | null;
        createdAt: Date;
    }
) => ({
    type: SAVE_CARD_TO_STORAGE,
    payload: card,
});

export const loadStoredCards = () => ({
    type: LOAD_STORED_CARDS,
});

export const setStoredCards = (cards: any[]) => ({
    type: SET_STORED_CARDS,
    payload: cards,
});

export const deleteStoredCard = (cardId: string) => ({
    type: DELETE_STORED_CARD,
    payload: cardId,
});

export const setText = (text: string) => ({
    type: SET_TEXT,
    payload: text,
});

export const setExamples = (examples: [string, string | null][]) => ({
    type: SET_EXAMPLES,
    payload: examples,
});

export const setTranslation = (translation: string | null) => ({
    type: SET_TRANSLATION,
    payload: translation,
});


export const setImage = (image: string | null) => ({
    type: SET_IMAGE,
    payload: image,
});

export const setImageUrl = (url: string | null) => ({
    type: SET_IMAGE_URL,
    payload: url,
});

export const setBack = (back: string | null) => ({
    type: SET_BACK,
    payload: back,
});