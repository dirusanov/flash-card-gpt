import {
    SET_ANKI_CONNECT_API_KEY,
    SET_ANKI_CONNECT_URL,
    SET_HUGGING_FACE_API_KEY,
    SET_OPEN_AI_KEY,
    SET_SELECTED_MODE,
    SET_SHOULD_GENERATE_IMAGE,
    SET_TRANSLATE_TO_LANGUAGE,
    SET_USE_ANKI_CONNECT,
    SET_VISIBLE_SIDEBAR,
    SET_TRANSLATION_PROMPT,
    SET_EXAMPLES_PROMPT,
    SET_AI_INSTRUCTIONS,
    SET_IMAGE_INSTRUCTIONS,
} from "../actions/settings";
import {Modes} from "../../constants";

interface SettingsState {
    openAiKey: string;
    mode: Modes;
    translateToLanguage: string
    ankiConnectUrl: string
    ankiConnectApiKey: string | null
    useAnkiConnect: boolean
    visibleSideBar: boolean
    huggingFaceApiKey: string
    shouldGenerateImage: boolean
    translationPrompt: string
    examplesPrompt: string
    aiInstructions: string
    imageInstructions: string
}

const initialState: SettingsState = {
    openAiKey: '',
    mode: Modes.LanguageLearning,
    translateToLanguage: 'ru',
    ankiConnectUrl: 'http://127.0.0.1:8765',
    ankiConnectApiKey: null,
    useAnkiConnect: false,
    visibleSideBar: true,
    huggingFaceApiKey: '',
    shouldGenerateImage: true,
    translationPrompt: '',
    examplesPrompt: '',
    aiInstructions: '',
    imageInstructions: ''
};

export const settingsReducer = (state = initialState, action: any): SettingsState => {
    switch (action.type) {
        case SET_OPEN_AI_KEY:
            return {
                ...state,
                openAiKey: action.payload,
            };
        case SET_SELECTED_MODE:
            return {
                ...state,
                mode: action.payload,
            };
        case SET_TRANSLATE_TO_LANGUAGE:
            return {
                ...state,
                translateToLanguage: action.payload,
            };
        case SET_ANKI_CONNECT_URL:
            return {
                ...state,
                ankiConnectUrl: action.payload,
            };
        case SET_ANKI_CONNECT_API_KEY:
            return {
                ...state,
                ankiConnectApiKey: action.payload,
            };
        case SET_USE_ANKI_CONNECT:
            return {
                ...state,
                useAnkiConnect: action.payload,
            };
        case SET_VISIBLE_SIDEBAR:
            return {
                ...state,
                visibleSideBar: action.visible,
            };
        case SET_HUGGING_FACE_API_KEY:
            return {
                ...state,
                huggingFaceApiKey: action.payload,
            };
        case SET_SHOULD_GENERATE_IMAGE:
            return {
                ...state,
                shouldGenerateImage: action.payload,
            };
        case SET_TRANSLATION_PROMPT:
            return {
                ...state,
                translationPrompt: action.payload,
            };
        case SET_EXAMPLES_PROMPT:
            return {
                ...state,
                examplesPrompt: action.payload,
            };
        case SET_AI_INSTRUCTIONS:
            return {
                ...state,
                aiInstructions: action.payload,
            };
        case SET_IMAGE_INSTRUCTIONS:
            return {
                ...state,
                imageInstructions: action.payload,
            };
        default:
            return state;
    }
};
