export const SET_OPEN_AI_KEY = 'SET_OPEN_AI_KEY';
export const SET_SELECTED_MODE = 'SET_SELECTED_MODE';
export const SET_TRANSLATE_TO_LANGUAGE = 'SET_SELECTED_LANGUAGE';
export const SET_ANKI_CONNECT_URL = 'SET_ANKI_CONNECT_URL';
export const SET_ANKI_CONNECT_API_KEY = 'SET_ANKI_CONNECT_API_KEY';
export const SET_USE_ANKI_CONNECT = 'SET_USE_ANKI_CONNECT';
export const SET_VISIBLE_SIDEBAR = 'SET_VISIBLE_SIDEBAR';
export const SET_HUGGING_FACE_API_KEY = 'SET_HUGGING_FACE_API_KEY';
export const SET_SHOULD_GENERATE_IMAGE = 'SET_SHOULD_GENERATE_IMAGE';


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

export const setVisibleSideBar = (visible: boolean) => ({
    type: SET_VISIBLE_SIDEBAR,
    visible,
});

export const setHuggingFaceApiKey = (huggingFaceApiKey: string) => ({
    type: SET_HUGGING_FACE_API_KEY,
    payload: huggingFaceApiKey,
});

export const setShouldGenerateImage = (shouldGenerateImage: boolean) => ({
    type: SET_SHOULD_GENERATE_IMAGE,
    payload: shouldGenerateImage,
});
