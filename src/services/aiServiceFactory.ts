import { ModelProvider } from '../store/reducers/settings';
import { AIProviderInterface, createAIProvider } from './aiProviders';

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

// Интерфейс для сервисов AI (обертка вокруг провайдеров)
export interface AIService {
  translateText: (
    apiKey: string,
    text: string,
    translateToLanguage?: string,
    customPrompt?: string
  ) => Promise<string | null>;
  
  getExamples: (
    apiKey: string,
    word: string,
    translateToLanguage: string,
    translate?: boolean,
    customPrompt?: string
  ) => Promise<Array<[string, string | null]>>;
  
  getDescriptionImage: (
    apiKey: string,
    word: string,
    customInstructions?: string
  ) => Promise<string>;
  
  getImageUrl?: (
    apiKey: string,
    description: string
  ) => Promise<string | null>;
  
  generateAnkiFront: (
    apiKey: string,
    text: string
  ) => Promise<string | null>;
  
  extractKeyTerms: (apiKey: string, text: string) => Promise<string[]>;
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
      customPrompt: string = ''
    ): Promise<string | null> => {
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
      customPrompt: string = ''
    ): Promise<Array<[string, string | null]>> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getExamples(word, translateToLanguage, translate, customPrompt);
    },
    
    getDescriptionImage: async (
      apiKey: string,
      word: string,
      customInstructions: string = ''
    ): Promise<string> => {
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
    
    generateAnkiFront: async (
      apiKey: string,
      text: string
    ): Promise<string | null> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.generateAnkiFront(text);
    },
    
    extractKeyTerms: async (apiKey: string, text: string): Promise<string[]> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.extractKeyTerms(text);
    }
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
  textLanguage?: string
): Promise<TranslationResult> => {
  try {
    if (!apiKey) {
      throw new Error("API key is missing. Please check your settings.");
    }

    const translatedText = await service.translateText(
      apiKey,
      text,
      translateToLanguage,
      customPrompt
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
  textLanguage?: string
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
      customPrompt
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
  text: string
): Promise<FlashcardContent> => {
  try {
    if (!apiKey) {
      throw new Error("API key is missing. Please check your settings.");
    }
    
    // Получаем только фронт карточки, содержимое для обратной стороны формируется
    // из примеров и перевода в компоненте интерфейса
    const front = await service.generateAnkiFront(apiKey, text);
    
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

// Создаем функцию для получения лингвистического описания
export async function createLinguisticInfo(
    aiService: any,
    apiKey: string,
    text: string,
    sourceLanguage: string
): Promise<string> {
    console.log(`Creating linguistic info for word: "${text}", language: "${sourceLanguage}"`);
    
    try {
        // Проверим наличие API ключа
        if (!apiKey) {
            console.error("API key is missing for linguistic info generation");
            return "";
        }
        
        // Проверим наличие aiService
        if (!aiService) {
            console.error("AI service is missing for linguistic info generation");
            return "";
        }
        
        // Проверим, имеет ли сервис AI метод для получения лингвистической информации
        if (aiService.getLinguisticInfo) {
            console.log("Using direct getLinguisticInfo method from AI service");
            return await aiService.getLinguisticInfo(apiKey, text, sourceLanguage);
        } else {
            // Реализация по умолчанию через общий API сервис
            console.log("Using standard completion API for linguistic info");
            
            // Формируем запрос с учетом особенностей языка
            const prompt = createLinguisticPrompt(text, sourceLanguage);
            console.log("Generated prompt for linguistic info:", prompt.substring(0, 100) + "...");
            
            // Проверим наличие метода createChatCompletion
            if (!aiService.createChatCompletion) {
                console.error("createChatCompletion method not available in AI service");
                return "";
            }
            
            // Отправляем запрос к API
            const completion = await aiService.createChatCompletion(apiKey, [
                {
                    role: "system",
                    content: prompt
                },
                {
                    role: "user",
                    content: `Provide linguistic information for: "${text}"`
                }
            ]);
            
            // Проверяем ответ
            if (!completion || !completion.content) {
                console.error("Linguistic info API returned empty response");
                return "";
            }
            
            console.log("Received linguistic info from API:", completion.content.substring(0, 100) + "...");
            
            // Возвращаем результат
            return completion.content || "";
        }
    } catch (error) {
        console.error("Error creating linguistic info:", error);
        // Возвращаем HTML с сообщением об ошибке для отладки
        return "<p style='color: #b91c1c;'>Failed to generate linguistic information. Please try again.</p>";
    }
}

// Вспомогательная функция для создания промпта с учетом особенностей языка
function createLinguisticPrompt(text: string, sourceLanguage: string): string {
    // Базовый промпт
    let basePrompt = `You are a linguistic expert specializing in providing concise linguistic information. 
Create a short, useful linguistic description for the word or phrase.
The output should be formatted as HTML with minimal styling (use <span>, <strong>, and simple classes).
Keep the description short and focused on the most important linguistic features.
`;

    // Добавляем специфичные для языка инструкции
    switch (sourceLanguage) {
        case 'ru': // Русский
            basePrompt += `For Russian words, include:
- Part of speech (часть речи)
- Gender for nouns (род)
- Declension pattern or case information (склонение)
- Aspect for verbs (вид глагола)
- Conjugation for verbs when applicable (спряжение)`;
            break;
            
        case 'en': // Английский
            basePrompt += `For English words, include:
- Part of speech
- Irregular forms if applicable
- Phrasal verb variations if applicable
- Common usage patterns
- British/American differences if notable`;
            break;
            
        case 'de': // Немецкий
            basePrompt += `For German words, include:
- Part of speech
- Gender for nouns (with article)
- Declension pattern
- Plural form for nouns
- Strong/weak/mixed verb forms if applicable`;
            break;
            
        case 'fr': // Французский
            basePrompt += `For French words, include:
- Part of speech
- Gender for nouns (with article)
- Conjugation pattern for verbs
- Irregular forms if applicable
- Pronunciation notes if tricky`;
            break;
            
        case 'es': // Испанский
            basePrompt += `For Spanish words, include:
- Part of speech (e.g., adverb, preposition, noun, verb)
- Gender for nouns with definite article (el/la)
- For prepositions: common usage patterns and examples
- For adverbs: usage context and common combinations
- For verbs: conjugation pattern, tense forms (present, past, future)
- For adjectives: gender inflection pattern
- Include any special regional usage if applicable
- Note any common expressions or phrases that use this word`;
            break;
            
        case 'it': // Итальянский
            basePrompt += `For Italian words, include:
- Part of speech
- Gender for nouns (with article)
- Conjugation for verbs (regular/irregular)
- Plural forms for nouns`;
            break;
            
        case 'ja': // Японский
            basePrompt += `For Japanese words, include:
- Word type (名詞, 動詞, 形容詞, etc.)
- Verb group for verbs
- Kanji and reading (if applicable)
- Formal/informal usage notes
- Conjugation pattern for verbs`;
            break;
            
        case 'zh': // Китайский
            basePrompt += `For Chinese words, include:
- Word type (noun, verb, etc.)
- Measure word if a noun
- Character composition notes
- Common compounds
- Usage context`;
            break;
            
        default:
            basePrompt += `Include:
- Part of speech
- Gender if applicable
- Conjugation/declension if applicable
- Common forms or variations
- Usage notes`;
    }
    
    basePrompt += `
The output should be structured but concise (max 100 words).
Focus on information a language learner would find most useful.
Use clean, minimal HTML with no unnecessary styling.`;
    
    return basePrompt;
} 