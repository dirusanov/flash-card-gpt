export const SET_OPEN_AI_KEY = 'SET_OPEN_AI_KEY';
export const SET_SELECTED_MODE = 'SET_SELECTED_MODE';
export const SET_TRANSLATE_TO_LANGUAGE = 'SET_TRANSLATE_TO_LANGUAGE';
export const SET_ANKI_CONNECT_URL = 'SET_ANKI_CONNECT_URL';
export const SET_ANKI_CONNECT_API_KEY = 'SET_ANKI_CONNECT_API_KEY';
export const SET_USE_ANKI_CONNECT = 'SET_USE_ANKI_CONNECT';
export const SET_VISIBLE_SIDEBAR = 'SET_VISIBLE_SIDEBAR';
export const SET_SHOULD_GENERATE_IMAGE = 'SET_SHOULD_GENERATE_IMAGE';
export const SET_TRANSLATION_PROMPT = 'SET_TRANSLATION_PROMPT';
export const SET_EXAMPLES_PROMPT = 'SET_EXAMPLES_PROMPT';
export const SET_AI_INSTRUCTIONS = 'SET_AI_INSTRUCTIONS';
export const SET_IMAGE_INSTRUCTIONS = 'SET_IMAGE_INSTRUCTIONS';
export const SET_MODEL_PROVIDER = 'SET_MODEL_PROVIDER';
export const SET_GROQ_API_KEY = 'SET_GROQ_API_KEY';
export const SET_GROQ_MODEL_NAME = 'SET_GROQ_MODEL_NAME';
export const SET_SOURCE_LANGUAGE = 'SET_SOURCE_LANGUAGE';

export const setOpenAiKey = (openAiKey: string) => ({
    type: SET_OPEN_AI_KEY,
    payload: openAiKey,
});

export const setMode = (mode: string) => ({
    type: SET_SELECTED_MODE,
    payload: mode,
});

export const setTranslateToLanguage = (language: string) => ({
    type: SET_TRANSLATE_TO_LANGUAGE,
    payload: language,
});

export const setAnkiConnectUrl = (url: string) => ({
    type: SET_ANKI_CONNECT_URL,
    payload: url,
});

export const setAnkiConnectApiKey = (apiKey: string | null) => ({
    type: SET_ANKI_CONNECT_API_KEY,
    payload: apiKey,
});

export const setUseAnkiConnect = (use: boolean) => ({
    type: SET_USE_ANKI_CONNECT,
    payload: use,
});

export const setVisibleSidebar = (visible: boolean) => ({
    type: SET_VISIBLE_SIDEBAR,
    visible,
});

export const setShouldGenerateImage = (shouldGenerate: boolean) => ({
    type: SET_SHOULD_GENERATE_IMAGE,
    payload: shouldGenerate,
});

export const setTranslationPrompt = (prompt: string) => ({
    type: SET_TRANSLATION_PROMPT,
    payload: prompt,
});

export const setExamplesPrompt = (prompt: string) => ({
    type: SET_EXAMPLES_PROMPT,
    payload: prompt,
});

export const setAIInstructions = (instructions: string) => ({
    type: SET_AI_INSTRUCTIONS,
    payload: instructions,
});

export const setImageInstructions = (instructions: string) => ({
    type: SET_IMAGE_INSTRUCTIONS,
    payload: instructions,
});

export const setModelProvider = (provider: string) => ({
    type: SET_MODEL_PROVIDER,
    payload: provider,
});

export const setGroqApiKey = (groqApiKey: string) => ({
    type: SET_GROQ_API_KEY,
    payload: groqApiKey,
});

export const setGroqModelName = (modelName: string) => ({
    type: SET_GROQ_MODEL_NAME,
    payload: modelName,
});

export const setSourceLanguage = (language: string) => ({
    type: SET_SOURCE_LANGUAGE,
    payload: language,
});
