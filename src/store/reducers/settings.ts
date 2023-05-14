import {
    SET_ANKI_CONNECT_API_KEY,
    SET_ANKI_CONNECT_URL,
    SET_OPEN_AI_KEY,
    SET_SELECTED_MODE,
    SET_TRANSLATE_TO_LANGUAGE,
    SET_USE_ANKI_CONNECT,
} from "../actions/settings";

interface SettingsState {
    openAiKey: string;
    mode: string;
    translateToLanguage: string
    ankiConnectUrl: string
    ankiConnectApiKey: string
    useAnkiConnect: boolean
}

const initialState: SettingsState = {
    openAiKey: '',
    mode: '',
    translateToLanguage: 'ru',
    ankiConnectUrl: '',
    ankiConnectApiKey: '',
    useAnkiConnect: false,
};

export const settingsReducer = (state = initialState, action: any): SettingsState => {
    switch (action.type) {
        case SET_OPEN_AI_KEY:
            return {
                ...state,
                openAiKey: action.payload,
            };
        case SET_SELECTED_MODE:
            debugger
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
        default:
            return state;
    }
};
