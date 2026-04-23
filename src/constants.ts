export enum Modes {
    LanguageLearning = 'language-learning',
    GeneralTopic = 'general-topic',
}

export const OPENAI_TEXT_MODEL = 'gpt-5.4-nano';
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const OPENAI_IMAGE_FALLBACK_MODEL = 'gpt-image-1.5';
// Current API response for gpt-image-* accepts 1024x1024 as the smallest square size.
export const OPENAI_IMAGE_SIZE = '1024x1024';
export const OPENAI_IMAGE_QUALITY = 'low';
export const OPENAI_IMAGE_BACKGROUND = 'auto';
