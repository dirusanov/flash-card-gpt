export const SET_OPEN_AI_KEY = 'SET_OPEN_AI_KEY';
export const SET_SELECTED_MODE = 'SET_SELECTED_MODE';
export const SET_TRANSLATE_TO_LANGUAGE = 'SET_SELECTED_LANGUAGE';
export const SET_ANKI_CONNECT_URL = 'SET_ANKI_CONNECT_URL';
export const SET_ANKI_CONNECT_API_KEY = 'SET_ANKI_CONNECT_API_KEY';
export const SET_USE_ANKI_CONNECT = 'SET_USE_ANKI_CONNECT';

export const setOpenAiKey = (openAiKey: string) => ({
    type: SET_OPEN_AI_KEY,
    payload: openAiKey,
});

export const setMode = (selectedMode: string) => ({
    type: SET_SELECTED_MODE,
    payload: selectedMode,
});

export const setTranslateToLanguage = (translateToLanguage: string) => ({
    type: SET_TRANSLATE_TO_LANGUAGE,
    payload: translateToLanguage,
});

export const setAnkiConnectUrl = (ankiConnectUrl: string) => ({
    type: SET_ANKI_CONNECT_URL,
    payload: ankiConnectUrl,
});

export const setAnkiConnectApiKey = (ankiConnectApiKey: string) => ({
    type: SET_ANKI_CONNECT_API_KEY,
    payload: ankiConnectApiKey,
});

export const setUseAnkiConnect = (useAnkiConnect: boolean) => ({
    type: SET_USE_ANKI_CONNECT,
    payload: useAnkiConnect,
});
