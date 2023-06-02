import { Dispatch } from 'redux';
import {Card, createAnkiCards} from "../../services/ankiService";

export const SAVE_ANKI_CARDS = 'SAVE_ANKI_CARDS';
export const SET_WORD = "SET_WORD";
export const SET_TRANSLATION = "SET_TRANSLATION";
export const SET_EXAMPLES = "SET_EXAMPLES";
export const SET_IMAGE = "SET_IMAGE";
export const SET_IMAGE_URL = 'SET_IMAGE_URL';

export const saveAnkiCards = (ankiConnectUrl: string, ankiConnectApiKey: string, deckName: string, model_name: string, cards: Card[]) => async (dispatch: Dispatch) => {
    try {
        const result = await createAnkiCards(ankiConnectUrl, ankiConnectApiKey, deckName, model_name, cards);
        dispatch({ type: SAVE_ANKI_CARDS, payload: result });
    } catch (error) {
        console.error('Error saving Anki cards:', error);
    }
};

export const setWord = (word: string) => ({
    type: SET_WORD,
    payload: word,
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
