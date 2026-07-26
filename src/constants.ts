export enum Modes {
    LanguageLearning = 'language-learning',
    GeneralTopic = 'general-topic',
}

export const OPENAI_TEXT_MODEL = 'gpt-5.4-nano';
// Used only for the grammar-note (linguisticInfo) generation and its validator — testing
// showed nano is noticeably less consistent on morphological accuracy (e.g. confusing a
// full-form singular participle with a short-form plural one) than mini, while translation/
// examples/transcription on nano were already solid. Scoped to this one call rather than
// switched globally, since most calls don't need it and mini costs more per request.
export const OPENAI_TEXT_MODEL_ACCURATE = 'gpt-5.4-mini';
export const OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const OPENAI_IMAGE_FALLBACK_MODEL = 'gpt-image-1.5';
// Current API response for gpt-image-* accepts 1024x1024 as the smallest square size.
export const OPENAI_IMAGE_SIZE = '1024x1024';
export const OPENAI_IMAGE_QUALITY = 'low';
export const OPENAI_IMAGE_BACKGROUND = 'auto';
