import { ModelProvider } from '../store/reducers/settings';
import { AIProviderInterface, createAIProvider } from './aiProviders';

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
    userLanguageTranscription: string | null; // Транскрипция на языке пользователя
    ipaTranscription: string | null; // Транскрипция в IPA
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
    abortSignal?: AbortSignal
  ) => Promise<string>;
  
  getImageUrl?: (
    apiKey: string,
    description: string
  ) => Promise<string | null>;
  
  getOptimizedImageUrl?: (
    apiKey: string,
    word: string,
    customInstructions?: string
  ) => Promise<string | null>;
  
  generateAnkiFront: (
    apiKey: string,
    text: string,
    abortSignal?: AbortSignal
  ) => Promise<string | null>;
  
  extractKeyTerms: (apiKey: string, text: string) => Promise<string[]>;

  createChatCompletion: (
    apiKey: string,
    messages: Array<{role: string, content: string}>
  ) => Promise<{content: string} | null>;

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
      // Делегируем выполнение провайдеру
      return aiProvider.translateText(text, translateToLanguage, customPrompt);
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
      return aiProvider.getExamples(word, translateToLanguage, translate, customPrompt, sourceLanguage);
    },
    
    getDescriptionImage: async (
      apiKey: string,
      word: string,
      customInstructions: string = '',
      abortSignal?: AbortSignal
    ): Promise<string> => {
      // Check if cancelled before starting
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }
      
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getDescriptionImage(word, customInstructions);
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
      customInstructions?: string
    ): Promise<string | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getOptimizedImageUrl ? aiProvider.getOptimizedImageUrl(word, customInstructions) : null;
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
      return aiProvider.generateAnkiFront(text);
    },
    
    extractKeyTerms: async (apiKey: string, text: string): Promise<string[]> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.extractKeyTerms(text);
    },

    createChatCompletion: async (
      apiKey: string,
      messages: Array<{role: string, content: string}>
    ): Promise<{content: string} | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      if (aiProvider.createChatCompletion) {
        return aiProvider.createChatCompletion(apiKey, messages);
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
  openAiKey: string, 
  groqKey: string = ''
): string => {
  switch (provider) {
    case ModelProvider.OpenAI:
      return openAiKey;
    case ModelProvider.Groq:
      return groqKey;
    default:
      return openAiKey;
  }
};

// Универсальные функции-обертки для создания карточек
// Они обеспечивают единый формат данных независимо от провайдера

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

    const translatedText = await service.translateText(
      apiKey,
      text,
      translateToLanguage,
      customPrompt,
      abortSignal
    );
    
    return {
      original: text,
      translated: translatedText
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
    
    return examples.map(([original, translated]) => ({
      original,
      translated
    }));
  } catch (error) {
    console.error('Error in unified examples generation:', error);
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
  imageGenerationMode?: 'off' | 'smart' | 'always'
): Promise<{
  translation?: TranslationResult;
  examples?: ExampleItem[];
  flashcard?: FlashcardContent;
  linguisticInfo?: string;
  imageUrl?: string;
  errors: Array<{component: string; error: string}>;
}> => {
  const startTime = Date.now();
  console.log('🚀 Starting parallel card component creation...');
  
  const errors: Array<{component: string; error: string}> = [];
  
  // Создаем массив промисов для параллельного выполнения
  const promises = [];
  
  // 1. Перевод (всегда выполняется) - с быстрым retry
  promises.push(
    retryWithBackoff(() => 
      createTranslation(service, apiKey, text, translateToLanguage, customPrompt, sourceLanguage, abortSignal)
    )
      .then(result => ({ type: 'translation', result }))
      .catch(error => ({ type: 'translation', error: error.message }))
  );
  
  // 2. Примеры (параллельно с переводом)
  promises.push(
    createExamples(service, apiKey, text, translateToLanguage, true, customPrompt, sourceLanguage, abortSignal)
      .then(result => ({ type: 'examples', result }))
      .catch(error => ({ type: 'examples', error: error.message }))
  );
  
  // 3. Flashcard (параллельно)
  promises.push(
    createFlashcard(service, apiKey, text, abortSignal)
      .then(result => ({ type: 'flashcard', result }))
      .catch(error => ({ type: 'flashcard', error: error.message }))
  );
  
  // 4. Лингвистическая информация (параллельно, быстрая версия)
  if (sourceLanguage) {
    promises.push(
      createFastLinguisticInfo(service, apiKey, text, sourceLanguage, translateToLanguage)
        .then(result => ({ type: 'linguisticInfo', result: result.linguisticInfo }))
        .catch(error => ({ type: 'linguisticInfo', error: error.message }))
    );
  }
  
  // 5. Изображение (только если запрошено) - с поддержкой Smart режима
  if (shouldGenerateImage && imageGenerationMode !== 'off') {
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
      let shouldGenerate = imageGenerationMode === 'always';
      let analysisReason = '';

      // Для Smart режима выполняем анализ
      if (imageGenerationMode === 'smart') {
        try {
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
          return await service.getOptimizedImageUrl(apiKey, text);
        } else if (service.getImageUrl) {
          // Fallback к обычной версии
          return await service.getImageUrl(apiKey, text);
        }
      } else if (imageGenerationMode === 'smart') {
        console.log(`🚫 No image needed for "${text}": ${analysisReason}`);
      }
      
      return null;
    };

    promises.push(
      imagePromise()
        .then(result => ({ type: 'imageUrl', result }))
        .catch(error => ({ type: 'imageUrl', error: error.message }))
    );
  }
  
  // Выполняем все запросы параллельно
  const results = await Promise.all(promises);
  
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

// Оптимизированная функция для создания грамматической справки (макс 2 запроса)
function createQualityLinguisticPrompt(text: string, sourceLanguage: string, userLanguage: string = 'ru'): string {
    return `ЗАДАЧА: Создать КРАТКУЮ грамматическую справку для "${text}" на языке ${userLanguage}.

ТРЕБОВАНИЯ:
- Максимум 2-3 пункта
- Каждый пункт: уникальный эмоджи + 1-2 слова
- Только существенная информация по существу

ОБЯЗАТЕЛЬНО:
1. 📚 Часть речи: [всегда первый пункт]
2. Максимум ОДНА дополнительная характеристика (если релевантна)

ДОСТУПНЫЕ ЭМОДЖИ:
- ⚥ Род | 📋 Число | 🎯 Падеж | ⏰ Время

ПРИМЕРЫ:
"book" → "📚 Часть речи: существительное"
"красивой" → "📚 Часть речи: прилагательное" + "⚥ Род: женский"

ФОРМАТ:
<div class="grammar-item">
  <span class="icon-pos">[эмоджи]</span> <strong>[название]:</strong> <span class="grammar-tag">[значение]</span>
</div>

Создай справку для "${text}":`;
}

// Упрощенный валидатор (менее строгий, только по существу)
function createSimpleValidatorPrompt(originalReference: string, word: string, userLanguage: string): string {
    return `Проверь справку для "${word}" и исправь только существенные ошибки:

СПРАВКА:
${originalReference}

ПРОВЕРЬ ТОЛЬКО:
1. Есть ли повторяющиеся эмоджи? (📚 📚 - плохо)
2. На правильном ли языке термины? (должен быть ${userLanguage})
3. Есть ли лишняя информация? (убери lemma, degree, notes, examples)

Если справка в целом корректна → ответь "СПРАВКА КОРРЕКТНА"
Если есть существенные ошибки → создай исправленную версию

ИСПРАВЬ если нужно:`;
}

// Агент-валидатор грамматической справки
async function validateAndCorrectLinguisticInfo(
    aiService: AIService,
    apiKey: string,
    originalReference: string,
    word: string,
    userLanguage: string = 'ru'
): Promise<string> {
    try {
        console.log(`Validating linguistic reference for "${word}"`);
        
        const validatorPrompt = createSimpleValidatorPrompt(originalReference, word, userLanguage);
        
        const completion = await aiService.createChatCompletion(apiKey, [
            {
                role: "user",
                content: validatorPrompt
            }
        ]);
        
        if (!completion || !completion.content) {
            console.log('Validator failed, returning original reference');
            return originalReference;
        }
        
        const response = completion.content.trim();
        
        // Если агент сказал что справка корректна, возвращаем оригинал
        if (response.includes('СПРАВКА КОРРЕКТНА') || response.includes('КОРРЕКТНА')) {
            console.log('Reference validated as correct');
            return originalReference;
        }
        
        // Если агент предложил исправления, возвращаем их
        console.log('Reference corrected by validator');
        return response;
        
    } catch (error) {
        console.error('Error in validator:', error);
        return originalReference; // В случае ошибки возвращаем оригинал
    }
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
        const prompt = createQualityLinguisticPrompt(text, sourceLanguage, userLanguage);
        
        const completion = await aiService.createChatCompletion(apiKey, [
            {
                role: "user",
                content: prompt
            }
        ]);
        
        if (!completion || !completion.content) {
            return null;
        }
        
        const originalReference = completion.content.trim();
        
        // 2. Проверяем и исправляем справку через валидатора
        const validatedReference = await validateAndCorrectLinguisticInfo(
            aiService,
            apiKey,
            originalReference,
            text,
            userLanguage
        );
        
        console.log(`Final linguistic info for "${text}" created`);
        return validatedReference;
        
    } catch (error) {
        console.error('Error creating validated linguistic info:', error);
        return null;
    }
}

// Старая вспомогательная функция для создания промпта с учетом особенностей языка  
function createLinguisticPrompt(text: string, sourceLanguage: string, userLanguage: string = 'ru'): string {
    // Определяем язык интерфейса
    const getLanguageInstructions = (lang: string) => {
        switch (lang) {
            case 'ru':
                return {
                    name: 'RUSSIAN',
                    terms: 'Глагол, Существительное, Прилагательное, Наречие',
                    gender: 'Мужской, Женский, Средний',
                    number: 'Единственное число, Множественное число',
                    tense: 'Настоящее время, Прошедшее время, Будущее время',
                    case: 'Именительный, Родительный, Дательный, Винительный, Творительный, Предложный',
                    person: '1-е лицо, 2-е лицо, 3-е лицо',
                    labels: {
                        partOfSpeech: 'Часть речи',
                        baseForm: 'Основная форма',
                        gender: 'Род',
                        number: 'Число',
                        case: 'Падеж',
                        tense: 'Время/Вид',
                        person: 'Лицо/Число'
                    },
                    forbidden: 'Verb, Noun, Adjective, Present, Past, Masculine, Feminine, Singular, Plural'
                };
            case 'es':
                return {
                    name: 'SPANISH',
                    terms: 'Verbo, Sustantivo, Adjetivo, Adverbio',
                    gender: 'Masculino, Femenino, Neutro',
                    number: 'Singular, Plural',
                    tense: 'Presente, Pasado, Futuro',
                    case: 'Nominativo, Genitivo, Dativo, Acusativo',
                    person: '1ª persona, 2ª persona, 3ª persona',
                    labels: {
                        partOfSpeech: 'Categoría gramatical',
                        baseForm: 'Forma base',
                        gender: 'Género',
                        number: 'Número',
                        case: 'Caso',
                        tense: 'Tiempo/Aspecto',
                        person: 'Persona/Número'
                    },
                    forbidden: 'Verb, Noun, Adjective, Present, Past, Masculine, Feminine, Singular, Plural'
                };
            case 'fr':
                return {
                    name: 'FRENCH',
                    terms: 'Verbe, Nom, Adjectif, Adverbe',
                    gender: 'Masculin, Féminin, Neutre',
                    number: 'Singulier, Pluriel',
                    tense: 'Présent, Passé, Futur',
                    case: 'Nominatif, Génitif, Datif, Accusatif',
                    person: '1ère personne, 2ème personne, 3ème personne',
                    labels: {
                        partOfSpeech: 'Catégorie grammaticale',
                        baseForm: 'Forme de base',
                        gender: 'Genre',
                        number: 'Nombre',
                        case: 'Cas',
                        tense: 'Temps/Aspect',
                        person: 'Personne/Nombre'
                    },
                    forbidden: 'Verb, Noun, Adjective, Present, Past, Masculine, Feminine, Singular, Plural'
                };
            case 'de':
                return {
                    name: 'GERMAN',
                    terms: 'Verb, Substantiv, Adjektiv, Adverb',
                    gender: 'Maskulin, Feminin, Neutrum',
                    number: 'Singular, Plural',
                    tense: 'Präsens, Präteritum, Futur',
                    case: 'Nominativ, Genitiv, Dativ, Akkusativ',
                    person: '1. Person, 2. Person, 3. Person',
                    labels: {
                        partOfSpeech: 'Wortart',
                        baseForm: 'Grundform',
                        gender: 'Geschlecht',
                        number: 'Numerus',
                        case: 'Kasus',
                        tense: 'Tempus/Aspekt',
                        person: 'Person/Numerus'
                    },
                    forbidden: 'English terms like Verb, Noun, Present, Past, Masculine, Feminine'
                };
            case 'it':
                return {
                    name: 'ITALIAN',
                    terms: 'Verbo, Sostantivo, Aggettivo, Avverbio',
                    gender: 'Maschile, Femminile, Neutro',
                    number: 'Singolare, Plurale',
                    tense: 'Presente, Passato, Futuro',
                    case: 'Nominativo, Genitivo, Dativo, Accusativo',
                    person: '1ª persona, 2ª persona, 3ª persona',
                    labels: {
                        partOfSpeech: 'Categoria grammaticale',
                        baseForm: 'Forma base',
                        gender: 'Genere',
                        number: 'Numero',
                        case: 'Caso',
                        tense: 'Tempo/Aspetto',
                        person: 'Persona/Numero'
                    },
                    forbidden: 'Verb, Noun, Adjective, Present, Past, Masculine, Feminine, Singular, Plural'
                };
            default:
                return {
                    name: 'ENGLISH',
                    terms: 'Verb, Noun, Adjective, Adverb',
                    gender: 'Masculine, Feminine, Neuter',
                    number: 'Singular, Plural',
                    tense: 'Present, Past, Future',
                    case: 'Nominative, Genitive, Dative, Accusative',
                    person: '1st person, 2nd person, 3rd person',
                    labels: {
                        partOfSpeech: 'Part of speech',
                        baseForm: 'Base form',
                        gender: 'Gender',
                        number: 'Number',
                        case: 'Case',
                        tense: 'Tense/Aspect',
                        person: 'Person/Number'
                    },
                    forbidden: 'Russian, Spanish, French, German terms'
                };
        }
    };
    
    const langConfig = getLanguageInstructions(userLanguage);
    
    const basePrompt = `Create a VERY BRIEF grammar reference for language learners.

⚠️ REQUIREMENTS ⚠️
1. Analyze ONLY the word "${text}" in ${sourceLanguage} language
2. ALL labels must be in ${langConfig.name} language
3. Maximum 2-3 essential grammar points only
4. Keep each point to 1-2 words maximum

ALLOWED CATEGORIES (choose only most important):
📚 ${langConfig.labels.partOfSpeech} (essential)
⚥ ${langConfig.labels.gender} (only if significant)  
📋 ${langConfig.labels.number} (only if not obvious)

HTML FORMAT:
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>${langConfig.labels.partOfSpeech}:</strong> <span class="grammar-tag">[brief term]</span>
</div>

RULES:
- Gender only for singular nouns/adjectives when relevant
- Skip obvious information (e.g., don't mention "singular" for clearly singular words)
- Use shortest possible terms in ${langConfig.name}
- Maximum 3 items total

CRITICAL: Response must be in ${langConfig.name} language and extremely concise.`;

    return basePrompt;
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

// Улучшенная функция создания и валидации с множественными агентами
export async function createValidatedLinguisticInfoAdvanced(
    aiService: AIService,
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string = 'ru',
    maxAttempts: number = 5,
    useMultipleValidators: boolean = true
): Promise<{linguisticInfo: string | null; wasValidated: boolean; attempts: number; confidence?: number; validationDetails?: MultiValidationResult}> {
    let attempts = 0;
    let currentLinguisticInfo: string | null = null;
    let lastValidationDetails: MultiValidationResult | undefined;
    
    console.log(`Starting advanced iterative creation of linguistic info for "${text}" (max ${maxAttempts} attempts, multiple validators: ${useMultipleValidators})`);
    
    while (attempts < maxAttempts) {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts}`);
        
        try {
            // 1. Создаем лингвистическую информацию
            if (!currentLinguisticInfo) {
                currentLinguisticInfo = await createLinguisticInfo(
                    aiService,
                    apiKey,
                    text,
                    sourceLanguage,
                    userLanguage
                );
                
                if (!currentLinguisticInfo) {
                    console.log(`Failed to generate linguistic info on attempt ${attempts}`);
                    continue;
                }
            }
            
            // 2. Выбираем тип валидации
            let validationResult: MultiValidationResult;
            
            if (useMultipleValidators) {
                // Используем множественную валидацию
                validationResult = await runMultipleValidation(
                    aiService,
                    apiKey,
                    text,
                    currentLinguisticInfo,
                    sourceLanguage,
                    userLanguage
                );
            } else {
                // Используем стандартную валидацию
                const singleValidation = await validateLinguisticInfo(
                    aiService,
                    apiKey,
                    text,
                    currentLinguisticInfo,
                    sourceLanguage,
                    userLanguage
                );
                
                validationResult = {
                    overallValid: singleValidation.isValid,
                    confidence: 0.7, // Фиксированная уверенность для обратной совместимости
                    validations: [{
                        isValid: singleValidation.isValid,
                        errors: singleValidation.errors,
                        corrections: singleValidation.corrections,
                        confidence: 0.7,
                        validatorType: 'general'
                    }],
                    finalErrors: singleValidation.errors,
                    finalCorrections: singleValidation.corrections || [],
                    attempts: 1
                };
            }
            
            lastValidationDetails = validationResult;
            
            // 3. Если валидация прошла успешно - возвращаем результат
            if (validationResult.overallValid) {
                console.log(`Validation passed on attempt ${attempts} with confidence ${validationResult.confidence.toFixed(2)}`);
                return {
                    linguisticInfo: currentLinguisticInfo,
                    wasValidated: true,
                    attempts,
                    confidence: validationResult.confidence,
                    validationDetails: validationResult
                };
            }
            
            // 4. Если есть ошибки и рекомендации - пытаемся исправить
            if (validationResult.finalErrors.length > 0) {
                console.log(`Validation failed on attempt ${attempts}:`, validationResult.finalErrors);
                
                if (validationResult.finalCorrections.length > 0 && attempts < maxAttempts) {
                    console.log(`Attempting correction on attempt ${attempts}...`);
                    
                    const correctedInfo = await correctLinguisticInfo(
                        aiService,
                        apiKey,
                        text,
                        currentLinguisticInfo,
                        validationResult.finalErrors,
                        validationResult.finalCorrections,
                        sourceLanguage,
                        userLanguage
                    );
                    
                    if (correctedInfo) {
                        currentLinguisticInfo = correctedInfo;
                        console.log(`Correction completed on attempt ${attempts}`);
                        // Продолжаем цикл для повторной валидации
                        continue;
                    } else {
                        console.log(`Correction failed on attempt ${attempts}`);
                    }
                } else {
                    console.log(`No corrections available or max attempts reached`);
                }
            }
            
            // Если это последняя попытка, возвращаем что есть
            if (attempts >= maxAttempts) {
                console.log(`Max attempts reached (${maxAttempts}), returning current result`);
                return {
                    linguisticInfo: currentLinguisticInfo,
                    wasValidated: false,
                    attempts,
                    confidence: validationResult.confidence,
                    validationDetails: validationResult
                };
            }
            
        } catch (error) {
            console.error(`Error on attempt ${attempts}:`, error);
            
            // Если это последняя попытка, возвращаем null
            if (attempts >= maxAttempts) {
                return {
                    linguisticInfo: null,
                    wasValidated: false,
                    attempts,
                    confidence: 0,
                    validationDetails: lastValidationDetails
                };
            }
        }
    }
    
    // Fallback (не должно достигаться)
    return {
        linguisticInfo: currentLinguisticInfo,
        wasValidated: false,
        attempts,
        confidence: lastValidationDetails?.confidence || 0,
        validationDetails: lastValidationDetails
    };
}



// Новая функция с расширенной валидацией для опциональногоиспользования
export async function createValidatedLinguisticInfoEnhanced(
    aiService: AIService,
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string = 'ru',
    maxAttempts: number = 5,
    useMultipleValidators: boolean = true
): Promise<{linguisticInfo: string | null; wasValidated: boolean; attempts: number; confidence?: number; validationDetails?: MultiValidationResult}> {
    return createValidatedLinguisticInfoAdvanced(
        aiService,
        apiKey,
        text,
        sourceLanguage,
        userLanguage,
        maxAttempts,
        useMultipleValidators
    );
}

// СУПЕР-БЫСТРАЯ ФУНКЦИЯ: только 1 запрос, без валидации
export async function createFastLinguisticInfo(
    aiService: AIService,
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string = 'ru'
): Promise<{linguisticInfo: string | null; wasValidated: boolean; attempts: number}> {
    try {
        console.log(`Creating fast linguistic info for "${text}" (1 request only)`);

        // Создаем улучшенный промпт, который сразу выдает качественную справку
        const prompt = createQualityLinguisticPrompt(text, sourceLanguage, userLanguage);

        const completion = await aiService.createChatCompletion(apiKey, [
            {
                role: "user",
                content: prompt
            }
        ]);

        if (!completion || !completion.content) {
            console.log('Failed to generate linguistic info');
            return { linguisticInfo: null, wasValidated: false, attempts: 1 };
        }

        const linguisticInfo = completion.content.trim();
        console.log('Fast linguistic info created successfully');

        return { linguisticInfo, wasValidated: false, attempts: 1 };
    } catch (error) {
        console.error('Error creating fast linguistic info:', error);
        return { linguisticInfo: null, wasValidated: false, attempts: 1 };
    }
}

// ОПТИМИЗИРОВАННАЯ ФУНКЦИЯ: максимум 2 запроса, менее строгий валидатор
export async function createOptimizedLinguisticInfo(
    aiService: AIService,
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string = 'ru'
): Promise<{linguisticInfo: string | null; wasValidated: boolean; attempts: number}> {
    try {
        console.log(`Creating optimized linguistic info for "${text}" (max 2 requests)`);

        // ШАГ 1: Создаем первоначальную справку
        const prompt = createQualityLinguisticPrompt(text, sourceLanguage, userLanguage);

        const completion = await aiService.createChatCompletion(apiKey, [
            {
                role: "user",
                content: prompt
            }
        ]);

        if (!completion || !completion.content) {
            console.log('Failed to generate initial linguistic info');
            return { linguisticInfo: null, wasValidated: false, attempts: 1 };
        }

        const initialReference = completion.content.trim();
        console.log('Initial reference created');

        // ШАГ 2: Быстрая проверка и исправление (только если есть явные ошибки)
        const validatorPrompt = createSimpleValidatorPrompt(initialReference, text, userLanguage);

        const validatorCompletion = await aiService.createChatCompletion(apiKey, [
            {
                role: "user",
                content: validatorPrompt
            }
        ]);

        if (!validatorCompletion || !validatorCompletion.content) {
            console.log('Validator failed, returning initial reference');
            return { linguisticInfo: initialReference, wasValidated: false, attempts: 2 };
        }

        const validatorResponse = validatorCompletion.content.trim();

        // Если валидатор говорит что справка корректна - возвращаем исходную
        if (validatorResponse.includes('СПРАВКА КОРРЕКТНА') || validatorResponse.includes('КОРРЕКТНА')) {
            console.log('Reference validated as correct');
            return { linguisticInfo: initialReference, wasValidated: true, attempts: 2 };
        }

        // Если есть исправления - возвращаем исправленную версию
        console.log('Reference was corrected by validator');
        return { linguisticInfo: validatorResponse, wasValidated: true, attempts: 2 };

    } catch (error) {
        console.error('Error in optimized linguistic info creation:', error);
        return { linguisticInfo: null, wasValidated: false, attempts: 1 };
    }
} 