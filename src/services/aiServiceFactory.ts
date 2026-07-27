import { ModelProvider } from '../store/reducers/settings';
import {
  AIProviderInterface,
  createAIProvider,
  createTranslationPrompt,
  normalizeTranslationResponse,
} from './aiProviders';
import { validateAndReviseExamples } from './exampleQuality';
import { OPENAI_TEXT_MODEL_ACCURATE } from '../constants';
import {
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  DEFAULT_TRANSCRIPTION_MODE,
  resolveTranscriptionRequest,
  TranscriptionMode,
} from './transcription';

class ApiKeyAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyAuthorizationError';
  }
}

const API_KEY_ERROR_INDICATORS = [
  '401',
  'unauthorized',
  'invalid api key',
  'incorrect api key',
  'authentication failed',
  'api key is missing',
  'api key provided is incorrect',
  'bearer token is invalid',
  'invalid credentials',
  'invalid token',
  'access was denied',
  'invalid api_key'
];

const isApiKeyErrorMessage = (message: string | undefined | null): boolean => {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return API_KEY_ERROR_INDICATORS.some((indicator) => normalized.includes(indicator));
};

const isAbortLikeError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|aborted|cancelled|canceled/i.test(message);
};

const stringifyUnknownError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }

    const maybeNestedError = (error as { error?: unknown }).error;
    if (typeof maybeNestedError === 'string' && maybeNestedError.trim()) {
      return maybeNestedError;
    }

    if (maybeNestedError instanceof Error) {
      return maybeNestedError.message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error';
    }
  }

  return String(error);
};

// Функция для быстрого retry с backoff для критически важных API вызовов
const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Не ретраим для quota ошибок или отмены операции
      if (lastError.message.includes('quota') ||
        lastError.message.includes('cancelled') ||
        lastError.message.includes('aborted')) {
        throw lastError;
      }

      // Если это последняя попытка, бросаем ошибку
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

// Типы данных для унификации ответов от разных провайдеров
export interface FlashcardContent {
  front: string | null;
  // Поле back удалено, теперь его содержимое формируется из примеров и перевода
}

export interface TranslationResult {
  original: string;
  translated: string | null;
}

export interface ExampleItem {
  original: string;
  translated: string | null;
}

// Определяем интерфейс для лингвистической информации
export interface LinguisticInfo {
  info: string;
}

// Определяем интерфейс для транскрипции
export interface TranscriptionResult {
  userLanguageTranscription: string | null; // Фонетическая подсказка на выбранном языке
  ipaTranscription: string | null; // Транскрипция в IPA
}

export interface TranscriptionGenerationOptions {
  mode?: TranscriptionMode;
  language?: string;
  extraLanguages?: string[];
}

// Определяем интерфейс для результата валидации
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  corrections?: string[];
}

// Новые интерфейсы для расширенной валидации
export interface DetailedValidationResult {
  isValid: boolean;
  errors: string[];
  corrections?: string[];
  confidence: number; // Уровень уверенности от 0 до 1
  validatorType: string;
}

export interface MultiValidationResult {
  overallValid: boolean;
  confidence: number;
  validations: DetailedValidationResult[];
  finalErrors: string[];
  finalCorrections: string[];
  attempts: number;
}

// Интерфейс для сервисов AI (обертка вокруг провайдеров)
export interface AIService {
  translateText: (
    apiKey: string,
    text: string,
    translateToLanguage?: string,
    customPrompt?: string,
    abortSignal?: AbortSignal
  ) => Promise<string | null>;

  getExamples: (
    apiKey: string,
    word: string,
    translateToLanguage: string,
    translate?: boolean,
    customPrompt?: string,
    sourceLanguage?: string,
    abortSignal?: AbortSignal
  ) => Promise<Array<[string, string | null]>>;

  getDescriptionImage: (
    apiKey: string,
    word: string,
    customInstructions?: string,
    abortSignal?: AbortSignal,
    sourceLanguage?: string
  ) => Promise<string>;

  getImageUrl?: (
    apiKey: string,
    description: string
  ) => Promise<string | null>;

  getOptimizedImageUrl?: (
    apiKey: string,
    word: string,
    customInstructions?: string,
    sourceLanguage?: string,
    abortSignal?: AbortSignal
  ) => Promise<string | null>;

  generateAnkiFront: (
    apiKey: string,
    text: string,
    abortSignal?: AbortSignal
  ) => Promise<string | null>;

  extractKeyTerms: (apiKey: string, text: string) => Promise<string[]>;

  createChatCompletion: (
    apiKey: string,
    messages: Array<{ role: string, content: string }>,
    trackingInfo?: {
      title?: string;
      subtitle?: string;
      icon?: string;
      color?: string;
    },
    model?: string
  ) => Promise<{ content: string } | null>;

  createTranscription: (
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string
  ) => Promise<TranscriptionResult | null>;
}

// Адаптер для совместимости со старым кодом
// В будущем можно будет полностью перейти на новую архитектуру без адаптера
const createAIServiceAdapter = (provider: ModelProvider): AIService => {
  // Создаем объект-адаптер, который будет выступать в роли старого сервиса
  return {
    translateText: async (
      apiKey: string,
      text: string,
      translateToLanguage: string = 'ru',
      customPrompt: string = '',
      abortSignal?: AbortSignal
    ): Promise<string | null> => {
      // Check if cancelled before starting
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }

      // Создаем провайдер на лету
      const aiProvider = createAIProvider(provider, apiKey);
      // Делегируем выполнение провайдеру (с поддержкой отмены)
      return aiProvider.translateText(text, translateToLanguage, customPrompt, abortSignal);
    },

    getExamples: async (
      apiKey: string,
      word: string,
      translateToLanguage: string,
      translate: boolean = false,
      customPrompt: string = '',
      sourceLanguage?: string,
      abortSignal?: AbortSignal
    ): Promise<Array<[string, string | null]>> => {
      // Check if cancelled before starting
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }

      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getExamples(word, translateToLanguage, translate, customPrompt, sourceLanguage, abortSignal);
    },

    getDescriptionImage: async (
      apiKey: string,
      word: string,
      customInstructions: string = '',
      abortSignal?: AbortSignal,
      sourceLanguage?: string
    ): Promise<string> => {
      // Check if cancelled before starting
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }

      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getDescriptionImage(word, customInstructions, sourceLanguage, abortSignal);
    },

    getImageUrl: async (
      apiKey: string,
      description: string
    ): Promise<string | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getImageUrl ? aiProvider.getImageUrl(description) : null;
    },

    getOptimizedImageUrl: async (
      apiKey: string,
      word: string,
      customInstructions?: string,
      sourceLanguage?: string,
      abortSignal?: AbortSignal
    ): Promise<string | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getOptimizedImageUrl ? aiProvider.getOptimizedImageUrl(word, customInstructions, sourceLanguage, abortSignal) : null;
    },

    generateAnkiFront: async (
      apiKey: string,
      text: string,
      abortSignal?: AbortSignal
    ): Promise<string | null> => {
      // Check if cancelled before starting
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }

      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.generateAnkiFront(text, abortSignal);
    },

    extractKeyTerms: async (apiKey: string, text: string): Promise<string[]> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.extractKeyTerms(text);
    },

    createChatCompletion: async (
      apiKey: string,
      messages: Array<{ role: string, content: string }>,
      trackingInfo?: {
        title?: string;
        subtitle?: string;
        icon?: string;
        color?: string;
      },
      model?: string
    ): Promise<{ content: string } | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      if (aiProvider.createChatCompletion) {
        return aiProvider.createChatCompletion(apiKey, messages, trackingInfo, model);
      }
      console.error("createChatCompletion not implemented in the provider");
      return null;
    },

    createTranscription: async (
      apiKey: string,
      text: string,
      sourceLanguage: string,
      userLanguage: string
    ): Promise<TranscriptionResult | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.createTranscription(text, sourceLanguage, userLanguage);
    },
  };
};

// Получаем сервис AI в зависимости от провайдера (для обратной совместимости)
export const getAIService = (provider: ModelProvider): AIService => {
  return createAIServiceAdapter(provider);
};

// Функция для получения API-ключа в зависимости от провайдера
export const getApiKeyForProvider = (
  provider: ModelProvider,
  openAiKey: string
): string => {
  return openAiKey;
};

// Универсальные функции-обертки для создания карточек
// Они обеспечивают единый формат данных независимо от провайдера

interface TranslationAuditResult {
  status: 'valid' | 'invalid' | 'unavailable';
  issues: string[];
}

const MAX_TRANSLATION_GENERATION_ATTEMPTS = 3;

function createTranslationAuditPrompt(
  studyTarget: string,
  candidateTranslation: string,
  sourceLanguage: string,
  targetLanguage: string,
  customInstruction: string,
): string {
  const extraRequirement = customInstruction.trim()
    ? `\nAdditional user requirement that must also be respected:\n${customInstruction.trim()}\n`
    : '';

  return `You are an independent translation validator for a language-learning flashcard.

<study_target language="${sourceLanguage}">${studyTarget}</study_target>
<candidate_translation language="${targetLanguage}">${candidateTranslation}</candidate_translation>
${extraRequirement}
Independently analyze the exact visible <study_target>, then validate the candidate.
Apply the same method to EVERY language and writing system.

Validation rules:
1. Analyze only <study_target>, in ${sourceLanguage}. Never validate a neighboring word,
   a dictionary lemma with a different form, an example sentence, or a guessed context.
2. If the target is an isolated lexical item, preserve all important common grammatical
   readings of its visible form when ${targetLanguage} distinguishes them. A translation
   of only one reading is incomplete.
3. Several synonyms or paraphrases for the same reading cannot replace an omitted reading.
   Prefer distinct meanings/forms over near-duplicates.
4. Do not demand distinctions that ${targetLanguage} cannot express naturally, and do not
   demand exhaustive gender/person variants when the source itself leaves them unspecified.
5. A required adposition, complement marker, particle, classifier, or other small word may
   be included when the translated lexical item would otherwise be unusable or incomplete.
6. For a complete clause/sentence, require one coherent translation, not a comma-joined
   collection of alternative sentences.
7. Reject incorrect meaning, wrong source language, unnatural morphology, copied source
   capitalization, redundant alternatives that crowd out an important reading, labels,
   explanations, or decorative quotation marks.
8. The candidate may contain at most four compact best-first alternatives.
9. An alternative must represent a distinct common meaning or grammatical reading of the
   exact source form. Reject diminutives, augmentatives, slang, archaic or expressive
   variants when that marked register is not encoded by the source. Do not pad a
   single-sense item with stylistic variants; one precise equivalent is better.

WORKED VALIDATION EXAMPLE — method only, not a language-specific branch:
For English "compared" translated to Russian, the candidate
"по сравнению с, в сравнении с, сравненный" is INVALID: the first two items duplicate
the same comparative/participial use, while the ordinary finite Past Simple reading is
missing. A revision must add a natural finite-past rendering and retain the important
participle/comparative readings. Apply this coverage principle analogously in all languages.

OUTPUT PROTOCOL:
If fully correct:
VERDICT: VALID
ISSUES: NONE

If revision is required:
VERDICT: INVALID
ISSUES:
- <specific actionable problem>
- <another problem if needed>

Do not rewrite the translation yourself. Return only VERDICT and ISSUES.`;
}

function createTranslationLexicalAuditPrompt(
  studyTarget: string,
  candidateTranslation: string,
  sourceLanguage: string,
  targetLanguage: string,
): string {
  return `You are the independent lexicographic quality gate for a language-learning card.

<study_target language="${sourceLanguage}">${studyTarget}</study_target>
<candidate_translation language="${targetLanguage}">${candidateTranslation}</candidate_translation>

Independently determine the ordinary dictionary meaning(s) and grammatical readings of
the exact visible study target. Then inspect every comma-separated candidate alternative.

Reject the set if any item is:
- merely a stylistic, diminutive, augmentative, slang, archaic, or expressive version of
  another item without corresponding marking in the source;
- a context-only paraphrase, broad hypernym, explanation, or near-duplicate rather than
  an independently usable translation of the isolated target;
- an invented form, unnatural collocation, wrong grammatical reading, or wrong register;
- included only to fill a list when the target has one ordinary meaning.

Do not invent distinctions based on number, gender, tense, or politeness unless the exact
source form encodes them. Apply the same evidence-based method to every language and
writing system. A concise single translation is fully valid when it covers the target.

OUTPUT PROTOCOL:
If the complete candidate is accurate, compact, and lexicographically useful:
VERDICT: VALID
ISSUES: NONE

If revision is required:
VERDICT: INVALID
ISSUES:
- <specific actionable problem>

Do not rewrite the translation. Return only VERDICT and ISSUES.`;
}

function parseTranslationAuditResponse(response: string): TranslationAuditResult {
  const verdictMatch = response.match(/^VERDICT:\s*(VALID|INVALID)\s*$/im);
  if (!verdictMatch) {
    return { status: 'unavailable', issues: [] };
  }

  if (verdictMatch[1].toUpperCase() === 'VALID') {
    return { status: 'valid', issues: [] };
  }

  const issuesSection = response.match(/^ISSUES:\s*([\s\S]*)$/im)?.[1] || '';
  const issues = issuesSection
    .split('\n')
    .map(line => line.replace(/^[\s•*-]+/, '').trim())
    .filter(line => line && line.toUpperCase() !== 'NONE');

  return {
    status: 'invalid',
    issues: issues.length > 0
      ? issues
      : ['Cover every important common reading of the exact visible study target.'],
  };
}

async function auditTranslation(
  service: AIService,
  apiKey: string,
  studyTarget: string,
  candidateTranslation: string,
  sourceLanguage: string,
  targetLanguage: string,
  customInstruction: string,
  attempt: number,
): Promise<TranslationAuditResult> {
  try {
    const completion = await service.createChatCompletion(apiKey, [{
      role: 'user',
      content: createTranslationAuditPrompt(
        studyTarget,
        candidateTranslation,
        sourceLanguage,
        targetLanguage,
        customInstruction,
      ),
    }], {
      title: 'Validating translation',
      subtitle: `Checking translation version ${attempt}`,
      icon: '🔎',
      color: '#3B82F6',
    }, OPENAI_TEXT_MODEL_ACCURATE);

    if (!completion?.content) {
      return { status: 'unavailable', issues: [] };
    }

    const semanticAudit = parseTranslationAuditResponse(completion.content.trim());
    if (semanticAudit.status !== 'valid') {
      return semanticAudit;
    }

    try {
      const lexicalCompletion = await service.createChatCompletion(apiKey, [{
        role: 'user',
        content: createTranslationLexicalAuditPrompt(
          studyTarget,
          candidateTranslation,
          sourceLanguage,
          targetLanguage,
        ),
      }], {
        title: 'Validating translation',
        subtitle: `Checking lexical quality ${attempt}`,
        icon: '📖',
        color: '#3B82F6',
      }, OPENAI_TEXT_MODEL_ACCURATE);

      const lexicalAudit = parseTranslationAuditResponse(
        lexicalCompletion?.content?.trim() || '',
      );
      return lexicalAudit.status === 'unavailable' ? semanticAudit : lexicalAudit;
    } catch (error) {
      console.debug('Translation lexical validator unavailable:', error);
      return semanticAudit;
    }
  } catch (error) {
    // Validation is an optional quality gate. A provider/network failure is handled by
    // keeping the last usable translation, so it must not surface as an extension error.
    console.debug('Translation validator unavailable:', error);
    return { status: 'unavailable', issues: [] };
  }
}

function createTranslationRevisionPrompt(
  studyTarget: string,
  candidateTranslation: string,
  issues: string[],
  sourceLanguage: string,
  targetLanguage: string,
  customInstruction: string,
): string {
  const feedback = issues.map(issue => `- ${issue}`).join('\n');
  const extraRequirement = customInstruction.trim()
    ? `\nAdditional user requirement:\n${customInstruction.trim()}\n`
    : '';

  return `Revise a rejected flashcard translation.

Source language: ${sourceLanguage}
Exact study target: <study_target>${studyTarget}</study_target>
Current translation: ${candidateTranslation}

Independent validator feedback:
${feedback}
${extraRequirement}
Fix every issue. Do not defend or repeat the rejected version. Then follow the complete
translation task below and return only the new translation:

${createTranslationPrompt(studyTarget, targetLanguage)}`;
}

async function reviseTranslation(
  service: AIService,
  apiKey: string,
  studyTarget: string,
  candidateTranslation: string,
  issues: string[],
  sourceLanguage: string,
  targetLanguage: string,
  customInstruction: string,
  nextAttempt: number,
): Promise<string | null> {
  try {
    const completion = await service.createChatCompletion(apiKey, [{
      role: 'user',
      content: createTranslationRevisionPrompt(
        studyTarget,
        candidateTranslation,
        issues,
        sourceLanguage,
        targetLanguage,
        customInstruction,
      ),
    }], {
      title: 'Revising translation',
      subtitle: `Applying validator feedback (version ${nextAttempt})`,
      icon: '🛠️',
      color: '#3B82F6',
    }, OPENAI_TEXT_MODEL_ACCURATE);
    const revised = normalizeTranslationResponse(completion?.content || '');
    return revised || null;
  } catch (error) {
    console.debug('Translation revision unavailable:', error);
    return null;
  }
}

async function validateAndReviseTranslation(
  service: AIService,
  apiKey: string,
  initialTranslation: string,
  studyTarget: string,
  sourceLanguage: string,
  targetLanguage: string,
  customInstruction: string,
): Promise<string> {
  let candidate = normalizeTranslationResponse(initialTranslation);
  let attempts = 1;

  while (candidate && attempts <= MAX_TRANSLATION_GENERATION_ATTEMPTS) {
    const audit = await auditTranslation(
      service,
      apiKey,
      studyTarget,
      candidate,
      sourceLanguage,
      targetLanguage,
      customInstruction,
      attempts,
    );

    if (audit.status === 'valid') {
      return candidate;
    }

    if (audit.status === 'unavailable') {
      console.debug('Translation validator unavailable; kept the latest non-empty version');
      return candidate;
    }

    if (attempts >= MAX_TRANSLATION_GENERATION_ATTEMPTS) {
      console.debug('Translation revision limit reached; kept the latest non-empty version');
      return candidate;
    }

    console.debug(`Translation version ${attempts} rejected: ${audit.issues.join(' | ')}`);
    const revised = await reviseTranslation(
      service,
      apiKey,
      studyTarget,
      candidate,
      audit.issues,
      sourceLanguage,
      targetLanguage,
      customInstruction,
      attempts + 1,
    );

    if (!revised) {
      console.debug('Translation revision returned no usable content; kept the previous version');
      return candidate;
    }

    candidate = revised;
    attempts += 1;
  }

  return candidate;
}

/**
 * Функция для перевода текста, которая работает одинаково для всех провайдеров
 */
export const createTranslation = async (
  service: AIService,
  apiKey: string,
  text: string,
  translateToLanguage: string,
  customPrompt?: string,
  textLanguage?: string,
  abortSignal?: AbortSignal
): Promise<TranslationResult> => {
  try {
    if (!apiKey) {
      throw new Error("API key is missing. Please check your settings.");
    }

    // An explicit source-language hint prevents a same-spelling word from being
    // interpreted according to another language.
    const languageHint = textLanguage
      ? `Source language identifier: ${textLanguage}. Interpret <study_target> strictly as ${textLanguage}, then translate it to ${translateToLanguage}.`
      : '';
    const translationInstructions = [customPrompt?.trim(), languageHint]
      .filter(Boolean)
      .join('\n');

    const translatedText = await service.translateText(
      apiKey,
      text,
      translateToLanguage,
      translationInstructions,
      abortSignal
    );
    const normalizedInitialTranslation = normalizeTranslationResponse(translatedText || '');
    const validatedTranslation = normalizedInitialTranslation
      ? await validateAndReviseTranslation(
          service,
          apiKey,
          normalizedInitialTranslation,
          text,
          textLanguage?.trim() || 'unknown (infer only from the study target)',
          translateToLanguage,
          customPrompt || '',
        )
      : '';

    return {
      original: text,
      translated: validatedTranslation || null
    };
  } catch (error) {
    console.error('Error in unified translation:', error);
    // Throw error to be handled by the UI instead of returning null
    throw error instanceof Error
      ? error
      : new Error("Failed to translate text. Please check your API key and settings.");
  }
};

/**
 * Функция для получения примеров, которая работает одинаково для всех провайдеров
 */
export const createExamples = async (
  service: AIService,
  apiKey: string,
  word: string,
  translateToLanguage: string,
  translate: boolean = false,
  customPrompt?: string,
  sourceLanguage?: string,
  abortSignal?: AbortSignal
): Promise<ExampleItem[]> => {
  try {
    if (!apiKey) {
      throw new Error("API key is missing. Please check your settings.");
    }

    const examples = await service.getExamples(
      apiKey,
      word,
      translateToLanguage,
      translate,
      customPrompt,
      sourceLanguage,
      abortSignal
    );

    const normalizedExamples = examples.map(([original, translated]) => ({
      original,
      translated
    }));

    if (!translate) {
      return normalizedExamples;
    }

    return validateAndReviseExamples(
      service,
      apiKey,
      normalizedExamples,
      word,
      sourceLanguage?.trim() || 'unknown (infer only from the study target)',
      translateToLanguage,
      customPrompt || '',
    );
  } catch (error) {
    if (!isAbortLikeError(error)) {
      console.error('Error in unified examples generation:', error);
    }
    // Throw error to be handled by the UI instead of returning empty array
    throw error instanceof Error
      ? error
      : new Error("Failed to generate examples. Please check your API key and settings.");
  }
};

/**
 * Функция для создания карточки Anki, которая работает одинаково для всех провайдеров
 */
export const createFlashcard = async (
  service: AIService,
  apiKey: string,
  text: string,
  abortSignal?: AbortSignal
): Promise<FlashcardContent> => {
  try {
    if (!apiKey) {
      throw new Error("API key is missing. Please check your settings.");
    }

    // Получаем только фронт карточки, содержимое для обратной стороны формируется
    // из примеров и перевода в компоненте интерфейса
    const front = await service.generateAnkiFront(apiKey, text, abortSignal);

    if (!front) {
      throw new Error("Failed to generate flashcard content. Please try again or check your API key.");
    }

    return { front };
  } catch (error) {
    console.error('Error in unified flashcard creation:', error);
    // Throw error to be handled by the UI
    throw error instanceof Error
      ? error
      : new Error("Failed to create flashcard. Please check your API key and settings.");
  }
};

/**
 * Функция для создания транскрипции слова, которая работает одинаково для всех провайдеров
 */
export const createTranscription = async (
  service: AIService,
  apiKey: string,
  text: string,
  sourceLanguage: string,
  userLanguage: string = 'ru'
): Promise<TranscriptionResult> => {
  try {
    if (!apiKey) {
      throw new Error("API key is missing. Please check your settings.");
    }

    const transcription = await service.createTranscription(
      apiKey,
      text,
      sourceLanguage,
      userLanguage
    );

    if (!transcription) {
      throw new Error("Failed to generate transcription. Please try again or check your API key.");
    }

    return transcription;
  } catch (error) {
    console.error('Error in unified transcription creation:', error);
    // Throw error to be handled by the UI
    throw error instanceof Error
      ? error
      : new Error("Failed to create transcription. Please check your API key and settings.");
  }
};

/**
 * НОВАЯ ОПТИМИЗИРОВАННАЯ ФУНКЦИЯ: Параллельное создание всех компонентов карточки
 * Значительно ускоряет процесс за счет параллельных API вызовов
 */
export const createCardComponentsParallel = async (
  service: AIService,
  apiKey: string,
  text: string,
  translateToLanguage: string,
  customPrompt?: string,
  sourceLanguage?: string,
  shouldGenerateImage: boolean = false,
  abortSignal?: AbortSignal,
  imageGenerationMode?: 'off' | 'smart' | 'always',
  shouldGenerateAudio: boolean = false,
  audioGenerationMode?: 'off' | 'smart' | 'always',
  openAiKey?: string,
  generateAudioData?: (word: string, abortSignal?: AbortSignal) => Promise<string | null>,
  transcriptionOptions?: TranscriptionGenerationOptions,
): Promise<{
  translation?: TranslationResult;
  examples?: ExampleItem[];
  flashcard?: FlashcardContent;
  linguisticInfo?: string;
  imageUrl?: string;
  wordAudio?: string | null;
  transcription?: TranscriptionResult | null;
  errors: Array<{ component: string; error: string }>;
}> => {
  const startTime = Date.now();
  console.log('🚀 Starting parallel card component creation...');

  const errors: Array<{ component: string; error: string }> = [];
  const componentTimings: Array<{ component: string; durationMs: number; status: 'ok' | 'error' }> = [];
  const timed = <T>(component: string, task: Promise<T>) =>
    (async () => {
      const componentStart = Date.now();
      try {
        const result = await task;
        componentTimings.push({ component, durationMs: Date.now() - componentStart, status: 'ok' });
        return result;
      } catch (error) {
        componentTimings.push({ component, durationMs: Date.now() - componentStart, status: 'error' });
        throw error;
      }
    })();

  // Создаем массив промисов для параллельного выполнения
  const promises = [];

  // 1. Перевод (всегда выполняется) - с быстрым retry
  promises.push(
    timed('translation', retryWithBackoff(() =>
      createTranslation(service, apiKey, text, translateToLanguage, customPrompt, sourceLanguage, abortSignal)
    ))
      .then(result => ({ type: 'translation', result }))
      .catch(error => {
        const message = stringifyUnknownError(error);
        if (isApiKeyErrorMessage(message)) {
          throw new ApiKeyAuthorizationError(message);
        }
        return { type: 'translation', error: message };
      })
  );

  // 2. Примеры (параллельно с переводом)
  promises.push(
    timed('examples', createExamples(service, apiKey, text, translateToLanguage, true, customPrompt, sourceLanguage, abortSignal))
      .then(result => ({ type: 'examples', result }))
      .catch(error => {
        const message = stringifyUnknownError(error);
        if (isApiKeyErrorMessage(message)) {
          throw new ApiKeyAuthorizationError(message);
        }
        return { type: 'examples', error: message };
      })
  );

  // 3. Flashcard (параллельно)
  promises.push(
    timed('flashcard', createFlashcard(service, apiKey, text, abortSignal))
      .then(result => ({ type: 'flashcard', result }))
      .catch(error => {
        const message = stringifyUnknownError(error);
        if (isApiKeyErrorMessage(message)) {
          throw new ApiKeyAuthorizationError(message);
        }
        return { type: 'flashcard', error: message };
      })
  );

  const transcriptionMode =
    transcriptionOptions?.mode || DEFAULT_TRANSCRIPTION_MODE;
  const transcriptionLanguage =
    transcriptionOptions?.language || DEFAULT_TRANSCRIPTION_LANGUAGE;
  const transcriptionRequest = resolveTranscriptionRequest(
    text,
    sourceLanguage,
    transcriptionMode,
    transcriptionLanguage,
    transcriptionOptions?.extraLanguages || [],
  );

  // 4. Pronunciation guide. In automatic mode it is generated only when the actual
  // study text contains letters outside Latin and Cyrillic; "always" and "off" are
  // explicit user overrides.
  if (transcriptionRequest) {
    promises.push(
      timed(
        'transcription',
        service.createTranscription(
          apiKey,
          text,
          transcriptionRequest.sourceLanguage,
          transcriptionRequest.transcriptionLanguage,
        ),
      )
        .then(result => ({ type: 'transcription', result }))
        .catch(error => {
          const message = stringifyUnknownError(error);
          if (isApiKeyErrorMessage(message)) {
            throw new ApiKeyAuthorizationError(message);
          }
          return { type: 'transcription', error: message };
        })
    );
  }

  // 4. Лингвистическая информация (параллельно, с валидацией режима разбора
  // слово/предложение — эта развилка новая и ещё не проверена статистически, в отличие
  // от старого 1-запросного варианта без проверки).
  if (sourceLanguage) {
    promises.push(
      timed('linguisticInfo', createOptimizedLinguisticInfo(service, apiKey, text, sourceLanguage, translateToLanguage))
        .then(result => ({ type: 'linguisticInfo', result: result.linguisticInfo }))
        .catch(error => {
          const message = stringifyUnknownError(error);
          if (isApiKeyErrorMessage(message)) {
            throw new ApiKeyAuthorizationError(message);
          }
          return { type: 'linguisticInfo', error: message };
        })
    );
  }

  // 5. Изображение (только если запрошено) - с поддержкой Smart режима
  if (shouldGenerateImage && imageGenerationMode !== 'off') {
    const openAiImageService = openAiKey
      ? getAIService(ModelProvider.OpenAI)
      : null;

    // Функция для Smart анализа
    const shouldGenerateImageForText = async (textToAnalyze: string): Promise<{ shouldGenerate: boolean; reason: string }> => {
      if (!textToAnalyze || textToAnalyze.trim().length === 0) {
        return { shouldGenerate: false, reason: "No text provided" };
      }

      try {
        const prompt = `Analyze this word/phrase and determine if a visual image would be helpful for language learning: "${textToAnalyze}"

Consider these criteria:
- Concrete objects, animals, places, foods, tools, vehicles = YES
- Abstract concepts, emotions, actions, grammar terms = NO
- People, professions, activities that can be visualized = YES
- Numbers, prepositions, conjunctions, abstract ideas = NO

Respond with ONLY "YES" or "NO" followed by a brief reason (max 10 words).
Format: "YES - concrete object that can be visualized" or "NO - abstract concept"`;

        const response = await service.createChatCompletion(apiKey, [
          { role: "user", content: prompt }
        ]);

        if (response && response.content) {
          const result = response.content.trim();
          const shouldGenerate = result.toUpperCase().startsWith('YES');
          const reason = result.includes(' - ') ? result.split(' - ')[1] : 'AI analysis';

          console.log(`🤖 Smart image analysis for "${textToAnalyze}": ${shouldGenerate ? 'YES' : 'NO'} - ${reason}`);
          return { shouldGenerate, reason };
        }

        return { shouldGenerate: false, reason: "AI analysis failed" };
      } catch (error) {
        console.error('Error analyzing text for image generation:', error);
        return { shouldGenerate: false, reason: "Analysis error" };
      }
    };

    // Создаем промис для генерации изображения с Smart анализом
    const imagePromise = async () => {
      if (abortSignal?.aborted) {
        throw new Error('Card creation was cancelled by user');
      }
      let shouldGenerate = imageGenerationMode === 'always';
      let analysisReason = '';

      // Для Smart режима выполняем анализ
      if (imageGenerationMode === 'smart') {
        try {
          if (abortSignal?.aborted) {
            throw new Error('Card creation was cancelled by user');
          }
          const analysis = await shouldGenerateImageForText(text);
          shouldGenerate = analysis.shouldGenerate;
          analysisReason = analysis.reason;
        } catch (error) {
          console.error('Error in Smart analysis:', error);
          shouldGenerate = false;
          analysisReason = 'Analysis failed';
        }
      }

      if (shouldGenerate) {
        if (service.getOptimizedImageUrl) {
          // Используем быструю оптимизированную версию (1 запрос вместо 3)
          const providerImage = await service.getOptimizedImageUrl(apiKey, text, undefined, sourceLanguage, abortSignal);
          if (providerImage) {
            return providerImage;
          }
        } else if (service.getImageUrl) {
          // Fallback к обычной версии: сначала строим визуальную сцену отдельным агентом
          const scenePrompt = await service.getDescriptionImage(apiKey, text, '', abortSignal, sourceLanguage);
          const providerImage = await service.getImageUrl(apiKey, scenePrompt);
          if (providerImage) {
            return providerImage;
          }
        }

        if (openAiKey && openAiImageService?.getOptimizedImageUrl) {
          return await openAiImageService.getOptimizedImageUrl(
            openAiKey,
            text,
            undefined,
            sourceLanguage,
            abortSignal
          );
        }

        if (openAiKey && openAiImageService?.getImageUrl) {
          const scenePrompt = await openAiImageService.getDescriptionImage(
            openAiKey,
            text,
            '',
            abortSignal,
            sourceLanguage
          );
          return await openAiImageService.getImageUrl(openAiKey, scenePrompt);
        }
      } else if (imageGenerationMode === 'smart') {
        console.log(`🚫 No image needed for "${text}": ${analysisReason}`);
      }

      return null;
    };

    promises.push(
      timed('imageUrl', imagePromise())
        .then(result => ({ type: 'imageUrl', result }))
        .catch(error => {
          const message = stringifyUnknownError(error);
          if (isApiKeyErrorMessage(message)) {
            throw new ApiKeyAuthorizationError(message);
          }
          return { type: 'imageUrl', error: message };
        })
    );
  }

  // 6. Аудио (OpenAI TTS) - параллельно (если переданы функции и ключи)
  if (shouldGenerateAudio && audioGenerationMode !== 'off' && openAiKey && generateAudioData) {
    const audioPromise = async () => {
      if (abortSignal?.aborted) {
        throw new Error('Card creation was cancelled by user');
      }

      let shouldGenAudio = audioGenerationMode === 'always';

      if (audioGenerationMode === 'smart') {
        // Simple heuristic for smart audio: if text is short (1-3 words), generate audio
        const words = text.trim().split(/\s+/).length;
        shouldGenAudio = words >= 1 && words <= 4;
        console.log(`🤖 Smart audio analysis for "${text}": ${shouldGenAudio ? 'YES' : 'NO'}`);
      }

      if (shouldGenAudio) {
        return await generateAudioData(text, abortSignal);
      }
      return null;
    };

    promises.push(
      timed('wordAudio', audioPromise())
        .then(result => ({ type: 'wordAudio', result }))
        .catch(error => {
          const message = stringifyUnknownError(error);
          return { type: 'wordAudio', error: message };
        })
    );
  }

  let results;
  try {
    // Выполняем все запросы параллельно
    results = await Promise.all(promises);
  } catch (error) {
    if (error instanceof ApiKeyAuthorizationError) {
      throw error;
    }
    throw error;
  }

  // Обрабатываем результаты
  const finalResult: any = { errors };

  for (const result of results) {
    if (abortSignal?.aborted) {
      throw new Error('Card creation was cancelled by user');
    }

    if ('error' in result) {
      errors.push({ component: result.type, error: result.error });
    } else {
      finalResult[result.type] = result.result;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`⚡ Parallel card creation completed in ${duration}ms`);
  console.log(`📊 Success: ${Object.keys(finalResult).length - 1}/${promises.length}, Errors: ${errors.length}`);
  if (componentTimings.length > 0) {
    const sortedTimings = [...componentTimings].sort((a, b) => b.durationMs - a.durationMs);
    console.log('⏱️ Component timings (slowest first):', sortedTimings);
  }

  return finalResult;
};

// Создаем функцию для получения качественного лингвистического описания с валидацией
export async function createLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  text: string,
  sourceLanguage: string,
  userLanguage: string = 'ru' // Добавляем параметр языка пользователя
): Promise<string | null> {
  try {
    console.log(`Creating validated linguistic info for "${text}" in ${sourceLanguage}, interface: ${userLanguage}`);

    // Используем новую функцию с валидацией
    const result = await createValidatedLinguisticInfo(
      aiService,
      apiKey,
      text,
      sourceLanguage,
      userLanguage
    );

    if (result) {
      console.log(`Generated and validated linguistic info for "${text}"`);
      return result;
    }

    return null;
  } catch (error) {
    console.error('Error creating linguistic info:', error);
    return null;
  }
}

// Deterministic safety net for createQualityLinguisticPrompt's output. Even with an
// explicit instruction and a validator pass, testing showed the model still
// occasionally (a) prepends a stray header line like "СПРАВКА:" instead of just the
// emoji-tagged lines, (b) leaves a category name from the prompt's own emoji legend
// ("Construction", "Tense marker"...) untranslated as the label, or (c) repeats the
// same emoji twice with two different values (sometimes the whole answer duplicated
// outright) despite the prompt saying "never repeat". Prompting harder didn't get any
// of this to zero, so all three are stripped deterministically: any line not starting
// with one of the known emoji is dropped, any line whose label exactly matches one of
// the English category names is dropped (better one fewer fact than a mixed-language
// card) unless outputLanguage is itself English, and only the first line seen for each
// emoji is kept.
const LINGUISTIC_INFO_EMOJI_PREFIXES = [
  '📚', '⚥', '📋', '🎯', '⏰', '🔀', '🔤',
  '🏷️', '🏷', '🧱', '💬',
  '🧩', '🔗', '📐',
];
const LINGUISTIC_INFO_ENGLISH_CATEGORY_LABELS = [
  'part of speech', 'gender', 'number', 'case', 'tense', 'aspect', 'form',
  'type', 'expression type', 'function', 'structure', 'usage', 'register',
  'construction', 'connector', 'connector role', 'word order', 'tense marker',
];

const isTrivialFormPlaceholder = (line: string): boolean => {
  if (!line.startsWith('🔤')) return false;
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return false;

  let remainder = line.slice(colonIndex + 1).toLocaleLowerCase();
  const genericFormTerms = [
    /\b(?:base|basic|dictionary|initial)\s+form\b/giu,
    /\b(?:single|isolated|standalone|individual)\s+word\b/giu,
    /\bword\s+in\s+isolation\b/giu,
    /базов\p{L}*\s+форм\p{L}*/giu,
    /начальн\p{L}*\s+форм\p{L}*/giu,
    /словарн\p{L}*\s+форм\p{L}*/giu,
    /(?:единичн|отдельн|изолированн)\p{L}*\s+слов\p{L}*/giu,
    /одно\s+слов\p{L}*/giu,
  ];

  genericFormTerms.forEach((pattern) => {
    remainder = remainder.replace(pattern, '');
  });

  // Drop the line only when it contains nothing except these recurring placeholders.
  // A real form combined with an unfortunate extra phrase is left for the AI validator
  // so the useful fact is not discarded deterministically.
  return remainder.replace(/[\s/|,;:.()[\]{}–—-]+/gu, '') === '';
};

function sanitizeLinguisticInfo(raw: string | null, outputLanguage: string): string | null {
  if (!raw) return raw;

  const outputIsEnglish = outputLanguage.trim().toLowerCase().startsWith('en');

  const seenEmoji = new Set<string>();

  const cleanedLines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      const emoji = LINGUISTIC_INFO_EMOJI_PREFIXES.find((e) => line.startsWith(e));
      if (!emoji) return false;
      if (isTrivialFormPlaceholder(line)) return false;
      if (!outputIsEnglish) {
        const colonIndex = line.indexOf(':');
        if (colonIndex !== -1) {
          const label = line.slice(0, colonIndex).replace(/^[^\p{L}]*/u, '').trim().toLowerCase();
          if (LINGUISTIC_INFO_ENGLISH_CATEGORY_LABELS.includes(label)) return false;
        }
      }
      // Testing surfaced the validator occasionally repeating the whole answer twice, or
      // reusing the same emoji with two different values — despite the prompt saying
      // "never repeat". Keep only the first line for each emoji, same as a human skimming
      // would.
      const normalizedEmoji = emoji.replace(/\uFE0F/gu, '');
      if (seenEmoji.has(normalizedEmoji)) return false;
      seenEmoji.add(normalizedEmoji);
      return true;
    });

  return cleanedLines.length > 0 ? cleanedLines.join('\n') : null;
}

/**
 * Create a compact grammar brief prompt for any language.
 * The resulting brief (the model's answer) MUST be written in outputLanguage —
 * the learner's interface language, not the language of "text" being studied.
 */
export function createQualityLinguisticPrompt(
  text: string,
  outputLanguage: string,
  sourceLanguage: string = '',
): string {
  const targetLanguage = sourceLanguage.trim() || 'unknown (infer it only from the target text)';

  return `TASK: Produce a VERY SHORT grammar brief for the exact STUDY TARGET below.

<study_target language="${targetLanguage}">${text}</study_target>

The brief MUST be written entirely in: ${outputLanguage}.

TARGET BOUNDARY — CRITICAL:
- Analyze ONLY the exact text inside <study_target>. Its language is ${targetLanguage}.
- Do NOT analyze its translation, a word from the instructions/examples, a neighboring
  word that is not inside <study_target>, or a different word with a similar spelling.
- Every output fact must be true of the study target itself. For an inflected word,
  describe the visible surface form; do not silently replace it with its lemma.
- Orthographic spacing is NOT a universal guide to grammatical units. A target written
  without spaces may still contain several morphemes/words and function as an expression.
- For a multi-part fixed expression, greeting formula, idiom, discourse marker, or
  conventional phrase, classify the WHOLE expression by its function. Do not force the
  entire expression into a single-word part of speech or call its pragmatic type a
  morphological "form". A genuinely single lexical interjection remains a lexical word.
- For a content word accompanied only by a minor grammatical marker, classify its semantic
  head and make every extra feature agree with that head. Never classify an article or
  classifier merely because it comes first.
- If a fact cannot be tied confidently to the exact study target, omit it.
- Never use 🔤 merely to say "base/dictionary/initial form", "single/isolated word",
  or a translation of those phrases. Those describe how the input was presented, not
  a grammatical property. If no pedagogically meaningful morphological form is visible,
  omit the form line entirely.
- Treat the target as isolated unless the text inside <study_target> itself contains
  context. Never invent a surrounding sentence.
- If one visible form has multiple common grammatical readings and the target does not
  disambiguate them, keep all essential readings on one line, separated by " / ".
- Distinguish a real PART-OF-SPEECH ambiguity from multiple FORMS of the same lexeme.
  Different finite/non-finite forms of one verb belong together on 🔤; they must not
  become alternatives such as "participle / verb" on 📚. Use 📚 alternatives only
  when the target genuinely belongs to different word classes under different parses.
- Apply the grammar of ${targetLanguage}; do not transfer categories or rules from
  English, Russian, or any other language. Different languages encode tense, aspect,
  voice, gender, case, and non-finite forms differently.
- Report a context-dependent category only when it is encoded by the visible form or
  proven by context inside <study_target>. A traditional form name containing a word
  such as "past" or "passive" is not by itself proof of finite tense or syntactic voice.

FIRST, decide what the study target is — do not mix the three modes below:
- LEXICAL WORD MODE: one lexical word, including an inflected form or a genuinely
  single-word interjection; a content word plus only a minor marker such as an article
  also stays here → describe its MORPHOLOGY.
- FIXED EXPRESSION MODE: a multi-part greeting/formula, idiom, conventional phrase,
  discourse marker, or other expression whose whole has a communicative/grammatical
  function, but which is not a complete clause → describe the WHOLE expression's
  type/function. This mode also applies when a language does not mark the component
  boundaries with spaces.
- SENTENCE MODE: a full clause or sentence (has its own predication and expresses a
  complete thought) → describe the KEY GRAMMATICAL CONSTRUCTION it demonstrates.
  Do NOT analyze one arbitrary word instead of the whole clause.

CONSTRAINTS (all modes):
- 1–3 lines only (3 max).
- Each line: one emoji + a short label + a concise value (a tag, not a sentence).
- Include ONLY essential information that clearly applies to the exact study target.

LEXICAL WORD MODE — MANDATORY:
1) The FIRST line is ALWAYS part of speech, prefixed with 📚.
2) Add extra lines ONLY when they genuinely apply (skip anything uncertain).
3) Distinguish part of speech from an inflectional/non-finite form according to the
   grammatical tradition appropriate for ${targetLanguage}. If analyses differ,
   choose the least misleading broad class and put form details on 🔤.
4) A form line must name a real morphological, inflectional, non-finite, or otherwise
   established grammatical form. "Base form", "dictionary form", "single word", and
   "isolated word" are not useful answers here and must be omitted.
5) If "${text}" pairs a main content word with a minor grammatical marker attached to
   it (an article like "el"/"la"/"the", a classifier, a preposition showing case) rather
   than being an idiom in its own right, the part-of-speech line describes the MAIN
   content word (usually a noun or verb) — never the marker. Example: for "el gato"
   the part of speech is "noun" (gato), not "article"; the article's own gender is
   already covered by the ⚥ gender line, so it doesn't need its own part-of-speech line.
CHOOSE EMOJIS FROM (one per line, never repeat):
📚 part of speech | ⚥ gender | 📋 number | 🎯 case | ⏰ tense | 🔀 aspect | 🔤 form

FIXED EXPRESSION MODE — MANDATORY:
1) The FIRST line is ALWAYS the whole expression's type/function, prefixed with 🏷️.
2) Do NOT add 📚 merely to assign one part of speech to a multi-part formula.
3) 🧱 may compactly show internal composition only when pedagogically useful.
4) 💬 may show register or usage only when conventional and context-independent.
5) 🔤 is reserved for a true morphological/inflectional form. A value such as
   "greeting formula", "idiom", "polite request", or "discourse marker" is a TYPE or
   FUNCTION and belongs on 🏷️, never on 🔤.
CHOOSE EMOJIS FROM (one per line, never repeat):
🏷️ type/function | 🧱 structure | 💬 usage/register

SENTENCE MODE — MANDATORY:
1) The FIRST line is ALWAYS the grammatical construction, prefixed with 🧩.
2) Add extra lines ONLY for other genuinely notable structural points.
CHOOSE EMOJIS FROM (one per line, never repeat):
🧩 construction | 🔗 connector | 📐 word order | ⏰ tense marker

OUTPUT FORMAT (plain text — NO HTML, NO markdown, NO bullets):
<emoji> <label>: <value>

Example (WORD MODE — shown in Russian; produce your own labels/values in ${outputLanguage}
instead, following the exact same pattern — a real translation, never the English category
names from the lists above):
📚 Часть речи: существительное
⚥ Род: женский

Example (FIXED EXPRESSION MODE — Russian rendering of Chinese 你好; use this as a
classification method, not as a language-specific answer to copy):
🏷️ Тип: приветственная формула
🧱 Структура: 你 (ты) + 好 (хорошо)
💬 Употребление: нейтральное приветствие

Example (SENTENCE MODE — same idea, shown in Russian, produce ${outputLanguage} instead):
🧩 Конструкция: estar + gerundio — настоящее длительное время
⏰ Маркер: «desde hace» — длительность до настоящего момента

RULES:
- All labels and ordinary explanations must be written in ${outputLanguage}.
- Keep established pedagogical names of grammatical forms in their conventional
  notation when translating them would be awkward or less recognizable (for example,
  English "Past Simple / Past Participle"). You may add a short ${outputLanguage}
  clarification in parentheses when useful, but do not replace a familiar standard
  term with a misleading literal translation.
- The English words in the emoji lists above (part of speech, type/function, structure,
  usage/register, construction, connector, word order, tense marker...) are category
  names for you to pick from —
  never output them as-is. The <label> you write must always be its ${outputLanguage}
  translation, exactly like the two Examples above.
- Keep each value to 1–10 words (compact alternatives separated by " / " are allowed).
- One fact per line. No text before or after the lines.
- Pick exactly one mode. Never label a fixed expression's communicative type as a
  morphological form, and never blend word morphology into a sentence construction brief.
- Before answering, silently verify for every line: "Which exact part of the study
  target proves this fact?" Remove the line if there is no direct answer.

UNIVERSAL AMBIGUITY EXAMPLES (illustrate the method; do not copy their language):
- Isolated English "compared" can be Past Simple / Past Participle. Without a sentence,
  both are forms of the SAME verb: 📚 must not say "participle / verb"; put both
  conventional form names together on 🔤. Do not infer a definite tense or inherent passive.
- Isolated Russian "стали" can be a verb form / noun form. Without context, do not
  silently choose one part of speech.
- Chinese "你好" functions as a greeting formula built from 你 + 好. It belongs in
  FIXED EXPRESSION MODE: "greeting formula" is not a value for 🔤 form.
- Apply the same context test to EVERY language and writing system, including languages
  whose ambiguity is not marked by spaces or suffixes.

Create the brief for the exact text inside <study_target>:`;
}

// Валидатор сначала независимо разбирает точный изучаемый текст, а уже затем сверяет
// с ним каждую строку. Это не даёт принять морфологию перевода, соседнего слова или
// первого попавшегося слова внутри предложения.
function createTargetAwareValidatorPrompt(
  originalReference: string,
  studyTarget: string,
  sourceLanguage: string,
  userLanguage: string,
): string {
  const targetLanguage = sourceLanguage.trim() || 'неизвестен — определи только по изучаемому тексту';

  return `Ты независимый эксперт-лингвист. Проверь грамматическую справку для ТОЧНОГО изучаемого текста.

<study_target language="${targetLanguage}">${studyTarget}</study_target>

СПРАВКА:
${originalReference}

ОБЯЗАТЕЛЬНЫЙ ПОРЯДОК ПРОВЕРКИ:
1. Сначала независимо определи грамматику точного текста внутри <study_target> на языке
   ${targetLanguage}. Не опирайся на справку на этом шаге.
2. Затем для КАЖДОЙ строки справки найди конкретное слово/часть внутри <study_target>,
   к которой относится факт. Если такой части нет, справка не проходит проверку.
3. Факт НЕ ОТНОСИТСЯ к изучаемому тексту и должен быть исправлен, если он описывает:
   - перевод изучаемого текста или слово из инструкций;
   - соседнее, подразумеваемое или похожее по написанию слово;
   - лемму, когда характеристика неверна для видимой словоформы;
   - артикль/классификатор вместо смыслового главного слова;
   - случайное отдельное слово внутри предложения вместо конструкции всего предложения.
4. Проверь фактическую правильность части речи и всех признаков именно для
   <study_target>. Нельзя считать справку корректной только потому, что формат выглядит
   правдоподобно.
5. Считай текст изолированным: никакого контекста вне <study_target> нет. Если одна
   видимая форма имеет несколько обычных грамматических разборов, справка обязана
   сохранить их через " / ", а не угадывать один.
6. Отличай настоящую неоднозначность ЧАСТИ РЕЧИ от нескольких ФОРМ одной лексемы.
   Личные/неличные формы одного глагола перечисляй на 🔤 и не превращай их в варианты
   вроде "причастие / глагол" на 📚. Варианты на 📚 допустимы только при реальной
   омографии разных частей речи.
7. Применяй правила именно языка ${targetLanguage}. Не переноси систему частей речи,
   времён, видов, залогов, рода или падежей из другого языка. Отклоняй любую
   характеристику, которая не закодирована в видимой форме и требует отсутствующего
   контекста. Название формы со словами вроде "прошедшее" или "пассивное" само по себе
   не доказывает личное время или синтаксический залог.
8. Проверь режим разбора:
   - Если это одно ЛЕКСИЧЕСКОЕ СЛОВО (в том числе словоформа или настоящее однословное
     междометие), первая строка должна быть 📚, а остальные строки могут описывать
     только его реальную морфологию.
   - Если это СОСТАВНОЕ приветствие, формула, идиома, конвенциональная фраза,
     дискурсивный маркер или другое многокомпонентное выражение без полной предикации,
     первая строка должна быть 🏷️ и классифицировать функцию ВСЕГО выражения.
     Отсутствие пробелов не доказывает, что перед нами одно морфологическое слово.
   - Если <study_target> — целое предложение/клауза, первая строка должна быть 🧩
     (конструкция всего предложения), а не разбор случайного слова внутри него.
9. Проверь соответствие КАТЕГОРИИ и ЗНАЧЕНИЯ, а не только правдивость самого значения:
   - 📚 — только часть речи лексического слова;
   - 🔤 — только реальная морфологическая/инфлекционная форма;
   - 🏷️ — тип или функция целого устойчивого выражения;
   - 🧱 — внутренняя структура выражения;
   - 💬 — регистр или конвенциональное употребление;
   - 🧩 — конструкция целой клаузы/предложения.
   Значения вроде «приветственная формула», «идиома», «вежливая просьба» или
   «дискурсивный маркер» НЕ являются морфологической формой и недопустимы на 🔤.
   Также отклоняй 🔤, если её значение лишь говорит «базовая/словарная/начальная форма»,
   «отдельное/единичное/изолированное слово» или то же самое на ${userLanguage}. Это
   описание подачи текста, а не грамматика. Если реальной формы нет, строку надо убрать.
10. Есть ли повторяющиеся эмоджи? (📚 📚 — ошибка.)
11. Соблюдена ли языковая политика? КАЖДАЯ метка перед двоеточием и обычные пояснения
    должны быть на ${userLanguage}, а не английским названием категории вроде
    "Part of speech", "Type", "Structure", "Usage", "Construction", "Tense marker",
    "Connector" или "Word order".
    При этом общепринятые учебные названия грамматических форм можно оставить в их
    стандартной записи, если перевод хуже узнаётся: например, для английского
    "Past Simple / Past Participle". При необходимости после термина можно дать короткое
    пояснение на ${userLanguage} в скобках.
12. Есть ли лишняя информация? Убери lemma, degree, notes, определения и примеры.
13. Если <study_target> — это главное слово с прилепленным к нему второстепенным маркером
   (артикль вроде "el"/"la", классификатор, предлог падежа), а не идиома сама по себе —
   часть речи должна описывать ГЛАВНОЕ слово (обычно существительное/глагол), а НЕ сам
   артикль/классификатор. Пример ошибки: "el gato" → "Часть речи: артикль" — неверно,
   должно быть "Часть речи: существительное" (род "el" уже отражён в строке ⚥ Род).

ПРИМЕРЫ МЕТОДА, А НЕ ЯЗЫКОВЫЕ ХАРДКОДЫ:
- English "compared" без предложения: Past Simple / Past Participle; нельзя выбрать
  один вариант, приписать определённое время и объявить форму обязательно пассивной.
  Это две формы одного глагола, а не части речи "причастие / глагол". При интерфейсе
  ru итог должен иметь смысл:
  📚 Часть речи: глагол
  🔤 Формы: Past Simple / Past Participle
- Русское "стали" без предложения: форма глагола / форма существительного; нельзя
  молча выбрать только одну часть речи.
- Chinese "你好": это целая приветственная формула из 你 + 好. Корректный режим —
  FIXED EXPRESSION; «приветственная формула» должна быть типом на 🏷️, а не формой
  на 🔤. По-русски допустима компактная справка:
  🏷️ Тип: приветственная формула
  🧱 Структура: 你 (ты) + 好 (хорошо)
  💬 Употребление: нейтральное приветствие
- Chinese "咖啡" как отдельное существительное не получает фиктивную строку
  "базовая форма / единичное слово": если у видимого слова нет полезной маркированной
  формы, справка содержит только действительно применимые признаки.
- Аналогично ищи омографию, синкретизм и контекстную неоднозначность в ЛЮБОМ языке,
  включая языки без пробелов и без флективных окончаний.

ФОРМАТ ОТВЕТА ВАЛИДАТОРА:
Если справка полностью правильная:
VERDICT: VALID
ISSUES: NONE

Если нужна доработка:
VERDICT: INVALID
ISSUES:
- <конкретное замечание для генератора>
- <ещё одно замечание, если нужно>

При INVALID не переписывай справку сам. Дай короткие, конкретные замечания: какой факт
ошибочен, почему он не доказан точным <study_target> и каким должен быть принцип
исправления. Не добавляй текст вне VERDICT и ISSUES.`;
}

function createMorphologyEvidenceValidatorPrompt(
  reference: string,
  studyTarget: string,
  sourceLanguage: string,
  userLanguage: string,
): string {
  const targetLanguage = sourceLanguage.trim() || 'unknown';

  return `You are the second, independent morphology-evidence auditor for a compact
language-learning grammar reference.

<study_target language="${targetLanguage}">${studyTarget}</study_target>
<candidate_reference output_language="${userLanguage}">
${reference}
</candidate_reference>

Audit every displayed field from scratch under the grammar of ${targetLanguage}.
The first validator already checked formatting and broad classification; focus only on
whether the EXACT VISIBLE FORM proves each grammatical feature.

Evidence rules for every language:
- Meaning compatibility is not morphological evidence. A noun that can refer to one or
  many objects does not thereby encode both singular and plural.
- In isolating or analytic languages, omit number, tense, gender, case, voice, aspect, or
  similar fields when they are not overtly marked in the isolated target.
- A slash-separated pair of mutually exclusive feature values is valid only for genuine
  formal ambiguity or syncretism of this exact surface form. It is invalid when it merely
  lists possible interpretations supplied by absent context.
- Do not transfer categories from the output language or from a familiar European
  grammar. Do not describe a translation.
- Keep a feature only when a knowledgeable teacher can point to concrete morphology,
  syntax inside the target, or a conventional whole-expression function that proves it.
- Part of speech or whole-expression type still must describe the exact target and may
  remain as the only line when no additional feature is encoded.

OUTPUT PROTOCOL:
If every retained field is demonstrably correct:
VERDICT: VALID
ISSUES: NONE

If any field is unsupported or wrong:
VERDICT: INVALID
ISSUES:
- <identify the exact field and the evidence problem, then state whether to correct or omit it>

Do not rewrite the reference. Return only VERDICT and ISSUES.`;
}

interface LinguisticAuditResult {
  status: 'valid' | 'invalid' | 'unavailable';
  issues: string[];
}

interface LinguisticRevisionResult {
  linguisticInfo: string | null;
  wasValidated: boolean;
  attempts: number;
}

const MAX_LINGUISTIC_GENERATION_ATTEMPTS = 3;

function parseLinguisticAuditResponse(response: string): LinguisticAuditResult {
  const verdictMatch = response.match(/^VERDICT:\s*(VALID|INVALID)\s*$/im);
  if (!verdictMatch) {
    return { status: 'unavailable', issues: [] };
  }

  if (verdictMatch[1].toUpperCase() === 'VALID') {
    return { status: 'valid', issues: [] };
  }

  const issuesSection = response.match(/^ISSUES:\s*([\s\S]*)$/im)?.[1] || '';
  const issues = issuesSection
    .split('\n')
    .map((line) => line.replace(/^[\s•*-]+/, '').trim())
    .filter((line) => line && line.toUpperCase() !== 'NONE');

  return {
    status: 'invalid',
    issues: issues.length > 0
      ? issues
      : ['Исправь все фактические и контекстные ошибки, найденные валидатором.'],
  };
}

function createLinguisticRevisionPrompt(
  currentReference: string,
  issues: string[],
  studyTarget: string,
  sourceLanguage: string,
  userLanguage: string,
): string {
  const feedback = issues.map((issue) => `- ${issue}`).join('\n');

  return `ДОРАБОТКА ГРАММАТИЧЕСКОЙ СПРАВКИ

Текущая версия:
${currentReference}

Замечания независимого валидатора:
${feedback}

Исправь ВСЕ замечания. Не защищай текущую версию и не повторяй ошибочный разбор.
Верни только новую справку в требуемом формате.

${createQualityLinguisticPrompt(studyTarget, userLanguage, sourceLanguage)}`;
}

async function auditLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  reference: string,
  studyTarget: string,
  sourceLanguage: string,
  userLanguage: string,
  showTracking: boolean,
  generationAttempt: number,
): Promise<LinguisticAuditResult> {
  try {
    const validatorPrompt = createTargetAwareValidatorPrompt(
      reference,
      studyTarget,
      sourceLanguage,
      userLanguage,
    );

    const completion = await aiService.createChatCompletion(apiKey, [
      {
        role: "user",
        content: validatorPrompt
      }
    ], showTracking ? {
      title: 'Validating grammar reference',
      subtitle: `Checking grammar version ${generationAttempt}`,
      icon: '🔍',
      color: '#9C27B0'
    } : undefined, OPENAI_TEXT_MODEL_ACCURATE);

    if (!completion || !completion.content) {
      return { status: 'unavailable', issues: [] };
    }

    const targetAudit = parseLinguisticAuditResponse(completion.content.trim());
    if (targetAudit.status !== 'valid') {
      return targetAudit;
    }

    try {
      const evidenceCompletion = await aiService.createChatCompletion(apiKey, [{
        role: 'user',
        content: createMorphologyEvidenceValidatorPrompt(
          reference,
          studyTarget,
          sourceLanguage,
          userLanguage,
        ),
      }], showTracking ? {
        title: 'Validating grammar reference',
        subtitle: `Checking feature evidence ${generationAttempt}`,
        icon: '🧬',
        color: '#9C27B0',
      } : undefined, OPENAI_TEXT_MODEL_ACCURATE);

      const evidenceAudit = parseLinguisticAuditResponse(
        evidenceCompletion?.content?.trim() || '',
      );
      return evidenceAudit.status === 'unavailable' ? targetAudit : evidenceAudit;
    } catch (error) {
      console.debug('Grammar evidence validator unavailable:', error);
      return targetAudit;
    }
  } catch (error) {
    // The fallback is deliberate: keep the last non-empty grammar reference. Logging at
    // error/warn level makes Chrome list this handled condition as an extension failure.
    console.debug('Grammar validator unavailable:', error);
    return { status: 'unavailable', issues: [] };
  }
}

async function reviseLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  currentReference: string,
  issues: string[],
  studyTarget: string,
  sourceLanguage: string,
  userLanguage: string,
  showTracking: boolean,
  nextAttempt: number,
): Promise<string | null> {
  try {
    const revisionPrompt = createLinguisticRevisionPrompt(
      currentReference,
      issues,
      studyTarget,
      sourceLanguage,
      userLanguage,
    );

    const completion = await aiService.createChatCompletion(apiKey, [
      { role: 'user', content: revisionPrompt }
    ], showTracking ? {
      title: 'Revising grammar reference',
      subtitle: `Applying validator feedback (version ${nextAttempt})`,
      icon: '🛠️',
      color: '#9C27B0'
    } : undefined, OPENAI_TEXT_MODEL_ACCURATE);

    return sanitizeLinguisticInfo(completion?.content?.trim() || null, userLanguage);
  } catch (error) {
    console.debug('Grammar revision unavailable:', error);
    return null;
  }
}

async function validateAndReviseLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  initialReference: string,
  studyTarget: string,
  sourceLanguage: string,
  userLanguage: string,
  showTracking: boolean,
): Promise<LinguisticRevisionResult> {
  const sanitizedInitialReference = sanitizeLinguisticInfo(initialReference, userLanguage);
  let attempts = 1;

  if (!sanitizedInitialReference) {
    return { linguisticInfo: null, wasValidated: false, attempts };
  }

  let candidate: string = sanitizedInitialReference;

  while (attempts <= MAX_LINGUISTIC_GENERATION_ATTEMPTS) {
    console.log(`Validating grammar version ${attempts} for "${studyTarget}"`);
    const audit = await auditLinguisticInfo(
      aiService,
      apiKey,
      candidate,
      studyTarget,
      sourceLanguage,
      userLanguage,
      showTracking,
      attempts,
    );

    if (audit.status === 'valid') {
      return { linguisticInfo: candidate, wasValidated: true, attempts };
    }

    if (audit.status === 'unavailable') {
      console.debug('Grammar validator unavailable; kept the latest non-empty version');
      return { linguisticInfo: candidate, wasValidated: false, attempts };
    }

    if (attempts >= MAX_LINGUISTIC_GENERATION_ATTEMPTS) {
      console.debug('Grammar revision limit reached; kept the latest non-empty version');
      return { linguisticInfo: candidate, wasValidated: false, attempts };
    }

    console.debug(`Grammar version ${attempts} rejected: ${audit.issues.join(' | ')}`);
    const revisedReference: string | null = await reviseLinguisticInfo(
      aiService,
      apiKey,
      candidate,
      audit.issues,
      studyTarget,
      sourceLanguage,
      userLanguage,
      showTracking,
      attempts + 1,
    );

    if (!revisedReference) {
      console.debug('Grammar revision returned no usable content; kept the previous version');
      return { linguisticInfo: candidate, wasValidated: false, attempts };
    }

    candidate = revisedReference;
    attempts += 1;
  }

  return { linguisticInfo: candidate, wasValidated: false, attempts };
}

// Обновленная функция создания справки с валидацией
export async function createValidatedLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  text: string,
  sourceLanguage: string,
  userLanguage: string = 'ru'
): Promise<string | null> {
  try {
    console.log(`Creating validated linguistic info for "${text}"`);

    // 1. Создаем первоначальную справку
    const prompt = createQualityLinguisticPrompt(text, userLanguage, sourceLanguage);

    const completion = await aiService.createChatCompletion(apiKey, [
      {
        role: "user",
        content: prompt
      }
    ], undefined, OPENAI_TEXT_MODEL_ACCURATE);

    if (!completion || !completion.content) {
      return null;
    }

    const originalReference = completion.content.trim();

    // 2. Проверяем, дорабатываем по замечаниям и повторно валидируем
    const validationResult = await validateAndReviseLinguisticInfo(
      aiService,
      apiKey,
      originalReference,
      text,
      sourceLanguage,
      userLanguage,
      false,
    );

    console.log(`Final linguistic info for "${text}" created`);
    return validationResult.linguisticInfo;

  } catch (error) {
    console.error('Error creating validated linguistic info:', error);
    return null;
  }
}


// Функция для создания универсального промпта валидации
function createValidationPrompt(text: string, linguisticInfo: string, sourceLanguage: string, userLanguage: string): string {
  return `You are an expert linguist specializing in grammar validation. Your task is to verify the grammatical accuracy of a linguistic reference.

ANALYSIS TARGET:
- Word/Phrase: "${text}"
- Source Language: ${sourceLanguage}
- Interface Language: ${userLanguage}

LINGUISTIC REFERENCE TO VALIDATE:
${linguisticInfo}

VALIDATION INSTRUCTIONS:
1. **Analyze the source word "${text}" in ${sourceLanguage} language ONLY**
2. **DO NOT analyze translations** - focus only on the original word
3. **Check grammatical consistency** according to ${sourceLanguage} language rules
4. **Verify logical compatibility** of grammatical characteristics

SPECIFIC CHECKS FOR ${sourceLanguage.toUpperCase()} LANGUAGE:
• **Part of Speech**: Verify the word classification is correct
• **Gender**: Check if gender is appropriate (singular forms only for most languages)
• **Number**: Ensure number is correctly identified
• **Case**: Validate case forms match the language's case system
• **Tense/Aspect**: For verbs, check tense and aspect accuracy
• **Degree**: Comparison degrees should only apply to adjectives/adverbs, NOT nouns
• **Morphological Features**: Verify all features are linguistically valid

COMMON ERRORS TO DETECT:
❌ Gender specified for plural forms (where not applicable)
❌ Comparison degrees assigned to nouns
❌ Incorrect case systems for the language
❌ Wrong tense/aspect combinations
❌ Analysis of translation instead of source word
❌ Inconsistent grammatical categories

RESPONSE FORMAT:
VALIDATION: [VALID/INVALID]

ERRORS:
[List specific errors found, or "None"]

CORRECTIONS:
[Suggest specific corrections, or "None"]

Be thorough and precise. Focus on grammatical accuracy for ${sourceLanguage} language rules.`;
}

// Функция для валидации лингвистической информации
export async function validateLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  text: string,
  linguisticInfo: string,
  sourceLanguage: string,
  userLanguage: string = 'ru'
): Promise<ValidationResult> {
  try {
    console.log(`Validating linguistic info for "${text}" in ${sourceLanguage}`);

    const validationPrompt = createValidationPrompt(text, linguisticInfo, sourceLanguage, userLanguage);

    const completion = await aiService.createChatCompletion(apiKey, [
      {
        role: "user",
        content: validationPrompt
      }
    ]);

    if (!completion || !completion.content) {
      return {
        isValid: false,
        errors: ['Failed to validate linguistic information']
      };
    }

    // Парсим ответ валидатора
    const response = completion.content.trim();
    console.log('Validation response:', response);

    // Ищем маркеры валидации
    const isValid = response.includes('VALIDATION: VALID') || response.includes('✅ VALID');
    const errorSection = response.match(/ERRORS?:([\s\S]*?)(?:CORRECTIONS?:|$)/);
    const correctionSection = response.match(/CORRECTIONS?:([\s\S]*?)$/);

    const errors: string[] = [];
    const corrections: string[] = [];

    if (errorSection && errorSection[1]) {
      const errorText = errorSection[1].trim();
      if (errorText && errorText !== 'None' && errorText !== 'Нет') {
        errors.push(...errorText.split('\n').filter(line => line.trim()).map(line => line.replace(/^[•\-*]\s*/, '').trim()));
      }
    }

    if (correctionSection && correctionSection[1]) {
      const correctionText = correctionSection[1].trim();
      if (correctionText && correctionText !== 'None' && correctionText !== 'Нет') {
        corrections.push(...correctionText.split('\n').filter(line => line.trim()).map(line => line.replace(/^[•\-*]\s*/, '').trim()));
      }
    }

    return {
      isValid,
      errors,
      corrections: corrections.length > 0 ? corrections : undefined
    };

  } catch (error) {
    console.error('Error validating linguistic info:', error);
    return {
      isValid: false,
      errors: ['Validation service unavailable']
    };
  }
}

// Функция для исправления лингвистической информации на основе валидации
export async function correctLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  text: string,
  originalLinguisticInfo: string,
  validationErrors: string[],
  corrections: string[],
  sourceLanguage: string,
  userLanguage: string = 'ru'
): Promise<string | null> {
  try {
    console.log(`Correcting linguistic info for "${text}" based on validation errors`);

    const correctionPrompt = createCorrectionPrompt(
      text,
      originalLinguisticInfo,
      validationErrors,
      corrections,
      sourceLanguage,
      userLanguage
    );

    const completion = await aiService.createChatCompletion(apiKey, [
      {
        role: "user",
        content: correctionPrompt
      }
    ]);

    if (!completion || !completion.content) {
      return null;
    }

    return completion.content.trim();

  } catch (error) {
    console.error('Error correcting linguistic info:', error);
    return null;
  }
}

// Функция для создания промпта исправления
function createCorrectionPrompt(
  text: string,
  originalInfo: string,
  errors: string[],
  corrections: string[],
  sourceLanguage: string,
  userLanguage: string
): string {
  const errorList = errors.map(error => `• ${error}`).join('\n');
  const correctionList = corrections.map(correction => `• ${correction}`).join('\n');

  return `Ты эксперт-лингвист. Исправь грамматическую справку на основе найденных ошибок.

СЛОВО ДЛЯ АНАЛИЗА: "${text}" (язык: ${sourceLanguage})

ИСХОДНАЯ СПРАВКА:
${originalInfo}

НАЙДЕННЫЕ ОШИБКИ:
${errorList}

РЕКОМЕНДАЦИИ ПО ИСПРАВЛЕНИЮ:
${correctionList}

ЗАДАЧА: Создай исправленную версию грамматической справки, устранив все указанные ошибки.

ТРЕБОВАНИЯ:
1. Сохрани исходное HTML-форматирование
2. Исправь только грамматические ошибки
3. Убери неприменимые характеристики (например, род для мн.ч., степени сравнения для существительных)
4. Все термины должны быть на языке "${userLanguage}"
5. Анализируй только исходное слово "${text}", не его перевод

Выведи ТОЛЬКО исправленную справку без дополнительных комментариев:`;
}

// Новая функция для создания специализированных промптов валидации
function createSpecializedValidationPrompt(
  text: string,
  linguisticInfo: string,
  sourceLanguage: string,
  userLanguage: string,
  validatorType: 'morphology' | 'syntax' | 'semantics' | 'consistency' | 'completeness'
): string {
  const baseInfo = `
ANALYSIS TARGET:
- Word/Phrase: "${text}"
- Source Language: ${sourceLanguage}
- Interface Language: ${userLanguage}

LINGUISTIC REFERENCE TO VALIDATE:
${linguisticInfo}`;

  switch (validatorType) {
    case 'morphology':
      return `${baseInfo}

🔬 MORPHOLOGY SPECIALIST VALIDATION

You are a specialist in morphological analysis. Focus EXCLUSIVELY on word formation and morphological features:

PRIMARY CHECKS:
• **Part of Speech**: Is the word classification accurate?
• **Morphological Form**: Are inflectional forms correctly identified?
• **Gender/Number/Case**: Are these consistent with ${sourceLanguage} morphology?
• **Base Form**: Is the root/lemma correctly identified?
• **Morphological Categories**: Do the features match the word class?

CRITICAL ERROR DETECTION for ${sourceLanguage.toUpperCase()}:
❌ **Gender for plural forms**: In most languages (Russian, English, etc.), gender should NOT be specified for plural forms
❌ **Impossible morphological combinations**: Check if all features can coexist
❌ **Missing essential features**: Ensure number, case (where applicable) are present
❌ **Wrong part of speech**: Verify the word actually belongs to the stated category

SPECIFIC ${sourceLanguage.toUpperCase()} RULES:
• If word ends in -и, -ы, -а (plural markers), check if it's truly plural
• Plural nouns typically don't have gender specification
• Adjectives in plural may have gender only in specific contexts
• Verify case markers match the word form

IGNORE: Syntax, semantics, context - focus ONLY on morphology.

RESPONSE FORMAT:
VALIDATION: [VALID/INVALID]
CONFIDENCE: [0.0-1.0]
ERRORS: [morphological errors only, or "None"]
CORRECTIONS: [morphological corrections only, or "None"]`;

    case 'syntax':
      return `${baseInfo}

🏗️ SYNTAX SPECIALIST VALIDATION

You are a specialist in syntactic analysis. Focus EXCLUSIVELY on grammatical structure:

PRIMARY CHECKS:
• **Grammatical Role**: Does the word fit its syntactic position?
• **Agreement**: Are agreement patterns consistent?
• **Case Assignment**: Is case marking appropriate for syntax?
• **Tense/Aspect**: Are verbal categories syntactically coherent?
• **Syntactic Features**: Do features match syntactic requirements?

CRITICAL SYNTAX VALIDATION for ${sourceLanguage.toUpperCase()}:
❌ **Agreement violations**: Check subject-verb, noun-adjective agreement
❌ **Case mismatches**: Ensure case reflects syntactic role
❌ **Tense inconsistencies**: Verify temporal features make syntactic sense
❌ **Feature conflicts**: Look for syntactically impossible combinations

IGNORE: Word-internal morphology, meaning - focus ONLY on syntax.

RESPONSE FORMAT:
VALIDATION: [VALID/INVALID]
CONFIDENCE: [0.0-1.0]
ERRORS: [syntactic errors only, or "None"]
CORRECTIONS: [syntactic corrections only, or "None"]`;

    case 'semantics':
      return `${baseInfo}

💭 SEMANTICS SPECIALIST VALIDATION

You are a specialist in semantic analysis. Focus EXCLUSIVELY on meaning and usage:

PRIMARY CHECKS:
• **Semantic Category**: Does the classification match the word's meaning?
• **Usage Context**: Are grammatical features appropriate for the word's usage?
• **Semantic Agreement**: Do features align with semantic properties?
• **Register/Style**: Are formal features appropriate for the word type?
• **Semantic Coherence**: Do all features make sense together semantically?

SEMANTIC VALIDATION PRIORITIES:
❌ **Meaning mismatches**: Ensure part of speech matches actual meaning
❌ **Register conflicts**: Check if formality level matches word type
❌ **Usage inconsistencies**: Verify features match how word is actually used
❌ **Semantic impossibilities**: Look for logically impossible feature combinations

IGNORE: Pure morphological/syntactic technicalities - focus on meaning-based validation.

RESPONSE FORMAT:
VALIDATION: [VALID/INVALID]
CONFIDENCE: [0.0-1.0]
ERRORS: [semantic errors only, or "None"]
CORRECTIONS: [semantic corrections only, or "None"]`;

    case 'consistency':
      return `${baseInfo}

⚖️ CONSISTENCY SPECIALIST VALIDATION

You are a specialist in logical consistency. Focus EXCLUSIVELY on internal coherence:

PRIMARY CHECKS:
• **Feature Compatibility**: Are all features mutually compatible?
• **Language Rules**: Does everything follow ${sourceLanguage} rules?
• **Logical Contradictions**: Are there any impossible combinations?
• **Completeness**: Are required features present/absent appropriately?
• **Cross-feature Validation**: Do different features support each other?

CONSISTENCY CRITICAL CHECKS for ${sourceLanguage.toUpperCase()}:
❌ **GENDER + PLURAL**: Major error - gender should NOT be specified for plural forms in ${sourceLanguage}
❌ **Part of speech conflicts**: Ensure all features match the stated part of speech
❌ **Missing essential info**: Check if number, case, or other required features are missing
❌ **Redundant information**: Remove features that don't apply to this word form
❌ **Language-specific violations**: Apply ${sourceLanguage} grammatical rules strictly

EXAMPLE VIOLATIONS TO CATCH:
• "заслуги" (plural) + "Gender: Masculine" → INVALID (plural has no gender)
• "Noun" + "Degree of comparison" → INVALID (nouns don't have degrees)
• "Singular" + plural word ending → INVALID (form/feature mismatch)

IGNORE: Individual feature accuracy - focus ONLY on overall consistency.

RESPONSE FORMAT:
VALIDATION: [VALID/INVALID]
CONFIDENCE: [0.0-1.0]
ERRORS: [consistency errors only, or "None"]
CORRECTIONS: [consistency corrections only, or "None"]`;

    case 'completeness':
      return `${baseInfo}

📋 COMPLETENESS SPECIALIST VALIDATION

You are a specialist in checking completeness of grammar information. Focus EXCLUSIVELY on whether essential information is provided:

PRIMARY CHECKS:
• **Essential Categories**: Are the most important grammatical features included?
• **Missing Information**: What crucial details are missing for learners?
• **Usefulness**: Is this enough for language learners to understand the word?
• **Context Appropriateness**: Does this match the learner's needs?

COMPLETENESS REQUIREMENTS for ${sourceLanguage.toUpperCase()}:
• Part of Speech: MANDATORY for all words
• For Nouns: Gender (if applicable), number if not obvious
• For Verbs: Tense/form if not infinitive  
• For Adjectives: Degree if comparative/superlative
• For English: Usually part of speech is sufficient
• For inflected languages: More morphological detail needed

SPECIFIC CHECKS:
✅ "another" (English) + "определитель" → INCOMPLETE (should add "неопределенный" or usage info)
✅ "book" (English) + "существительное" → COMPLETE (sufficient for English)
✅ "красивый" (Russian) + "прилагательное, мужской род" → COMPLETE
❌ "books" (English) + "существительное" → INCOMPLETE (missing plural form info)

CRITICAL EVALUATION:
• Is this TOO brief to be helpful?
• Are learners missing crucial information?
• Should additional categories be included?

IGNORE: Technical accuracy of provided info - focus ONLY on completeness.

RESPONSE FORMAT:
VALIDATION: [VALID/INVALID]
CONFIDENCE: [0.0-1.0]
ERRORS: [completeness issues only, or "None"]
CORRECTIONS: [suggestions for missing info, or "None"]`;

    default:
      return createValidationPrompt(text, linguisticInfo, sourceLanguage, userLanguage);
  }
}

// Функция для запуска одного специализированного валидатора
async function runSpecializedValidator(
  aiService: AIService,
  apiKey: string,
  text: string,
  linguisticInfo: string,
  sourceLanguage: string,
  userLanguage: string,
  validatorType: 'morphology' | 'syntax' | 'semantics' | 'consistency' | 'completeness'
): Promise<DetailedValidationResult> {
  try {
    console.log(`Running ${validatorType} validator for "${text}"`);

    const prompt = createSpecializedValidationPrompt(
      text,
      linguisticInfo,
      sourceLanguage,
      userLanguage,
      validatorType
    );

    const completion = await aiService.createChatCompletion(apiKey, [
      {
        role: "user",
        content: prompt
      }
    ]);

    if (!completion || !completion.content) {
      return {
        isValid: false,
        errors: [`${validatorType} validation failed - no response`],
        confidence: 0,
        validatorType
      };
    }

    const response = completion.content.trim();
    console.log(`${validatorType} validator response:`, response);

    // Парсим ответ
    const isValid = response.includes('VALIDATION: VALID');
    const confidenceMatch = response.match(/CONFIDENCE:\s*([\d.]+)/);
    const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

    const errorSection = response.match(/ERRORS?:([\s\S]*?)(?:CORRECTIONS?:|$)/);
    const correctionSection = response.match(/CORRECTIONS?:([\s\S]*?)$/);

    const errors: string[] = [];
    const corrections: string[] = [];

    if (errorSection && errorSection[1]) {
      const errorText = errorSection[1].trim();
      if (errorText && errorText !== 'None' && errorText !== 'Нет') {
        errors.push(...errorText.split('\n')
          .filter(line => line.trim())
          .map(line => line.replace(/^[•\-*]\s*/, '').trim())
          .filter(line => line.length > 0));
      }
    }

    if (correctionSection && correctionSection[1]) {
      const correctionText = correctionSection[1].trim();
      if (correctionText && correctionText !== 'None' && correctionText !== 'Нет') {
        corrections.push(...correctionText.split('\n')
          .filter(line => line.trim())
          .map(line => line.replace(/^[•\-*]\s*/, '').trim())
          .filter(line => line.length > 0));
      }
    }

    return {
      isValid,
      errors,
      corrections: corrections.length > 0 ? corrections : undefined,
      confidence,
      validatorType
    };

  } catch (error) {
    console.error(`Error in ${validatorType} validator:`, error);
    return {
      isValid: false,
      errors: [`${validatorType} validator error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      confidence: 0,
      validatorType
    };
  }
}

// Функция для запуска множественной валидации
export async function runMultipleValidation(
  aiService: AIService,
  apiKey: string,
  text: string,
  linguisticInfo: string,
  sourceLanguage: string,
  userLanguage: string = 'ru'
): Promise<MultiValidationResult> {
  console.log(`Running multiple validation for "${text}"`);

  const validators: Array<'morphology' | 'syntax' | 'semantics' | 'consistency' | 'completeness'> = [
    'morphology',
    'syntax',
    'semantics',
    'consistency',
    'completeness'
  ];

  // Запускаем всех валидаторов параллельно
  const validationPromises = validators.map(validator =>
    runSpecializedValidator(
      aiService,
      apiKey,
      text,
      linguisticInfo,
      sourceLanguage,
      userLanguage,
      validator
    )
  );

  const validations = await Promise.all(validationPromises);

  // Анализируем результаты
  const validValidations = validations.filter(v => v.isValid);
  const invalidValidations = validations.filter(v => !v.isValid);

  // Вычисляем общую уверенность
  const averageConfidence = validations.reduce((sum, v) => sum + v.confidence, 0) / validations.length;

  // Определяем общую валидность
  const validationRatio = validValidations.length / validations.length;
  const overallValid = validationRatio >= 0.75; // 75% валидаторов должны согласиться

  // Собираем финальные ошибки и исправления
  const finalErrors: string[] = [];
  const finalCorrections: string[] = [];

  invalidValidations.forEach(validation => {
    validation.errors.forEach(error => {
      if (!finalErrors.includes(error)) {
        finalErrors.push(`[${validation.validatorType}] ${error}`);
      }
    });

    if (validation.corrections) {
      validation.corrections.forEach(correction => {
        if (!finalCorrections.includes(correction)) {
          finalCorrections.push(`[${validation.validatorType}] ${correction}`);
        }
      });
    }
  });

  console.log(`Multiple validation complete: ${validValidations.length}/${validations.length} passed, confidence: ${averageConfidence.toFixed(2)}`);

  return {
    overallValid,
    confidence: averageConfidence,
    validations,
    finalErrors,
    finalCorrections,
    attempts: 1
  };
}

// Генерация с циклом: валидация → замечания → доработка → повторная валидация.
export async function createOptimizedLinguisticInfo(
  aiService: AIService,
  apiKey: string,
  text: string,
  sourceLanguage: string,
  userLanguage: string = 'ru'
): Promise<{ linguisticInfo: string | null; wasValidated: boolean; attempts: number }> {
  let initialReference: string | null = null;

  try {
    console.log(
      `Creating linguistic info for "${text}" `
      + `(up to ${MAX_LINGUISTIC_GENERATION_ATTEMPTS} generated versions)`
    );

    // ШАГ 1: Создаем первоначальную справку
    const prompt = createQualityLinguisticPrompt(text, userLanguage, sourceLanguage);

    const completion = await aiService.createChatCompletion(apiKey, [
      {
        role: "user",
        content: prompt
      }
    ], {
      title: 'Creating grammar reference',
      subtitle: 'Generating detailed grammar and linguistic information',
      icon: '📚',
      color: '#9C27B0'
    }, OPENAI_TEXT_MODEL_ACCURATE);

    if (!completion || !completion.content) {
      console.log('Failed to generate initial linguistic info');
      return { linguisticInfo: null, wasValidated: false, attempts: 1 };
    }

    initialReference = completion.content.trim();
    console.log('Initial reference created');

    // ШАГ 2: Проверка и до двух доработок по конкретным замечаниям валидатора.
    const revisionResult = await validateAndReviseLinguisticInfo(
      aiService,
      apiKey,
      initialReference,
      text,
      sourceLanguage,
      userLanguage,
      true,
    );

    return revisionResult;

  } catch (error) {
    console.error('Error in optimized linguistic info creation:', error);
    return {
      linguisticInfo: sanitizeLinguisticInfo(initialReference, userLanguage),
      wasValidated: false,
      attempts: 1,
    };
  }
} 
