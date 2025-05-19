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