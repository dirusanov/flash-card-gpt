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

  createChatCompletion: (
    apiKey: string,
    messages: Array<{role: string, content: string}>
  ) => Promise<{content: string} | null>;
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
    sourceLanguage: string,
    userLanguage: string = 'ru' // Добавляем параметр языка пользователя
): Promise<string> {
    console.log(`Creating linguistic info for word: "${text}", language: "${sourceLanguage}", user language: "${userLanguage}"`);
    
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
            return await aiService.getLinguisticInfo(apiKey, text, sourceLanguage, userLanguage);
        } else {
            // Реализация по умолчанию через общий API сервис
            console.log("Using standard completion API for linguistic info");
            
            // Формируем запрос с учетом особенностей языка
            const prompt = createLinguisticPrompt(text, sourceLanguage, userLanguage);
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
function createLinguisticPrompt(text: string, sourceLanguage: string, userLanguage: string = 'ru'): string {
    // Базовый промпт
    let basePrompt = `You are a linguistic expert specializing in providing concise grammatical information.
Create a very short grammar reference card for the word or phrase.
The output should be formatted as clean, visually appealing HTML with minimal styling using appropriate Font Awesome icons.
Keep the description extremely concise - MAXIMUM 4 LINES total.
Include ONLY the essential grammatical features (like part of speech, gender, tense, etc.).
Do NOT include examples, usage notes, or definitions.
Use semantic HTML formatting with emphasis on visual structure:
- Use <div> elements with small margins between sections
- Use <i class="fa fa-xxx"></i> icons before important points (choose the most relevant icons)
- Use <strong> for important terms
- Use <span style="color:#4B5563;font-style:italic"> for secondary information
- Format should be clean, modern, and easy to scan visually

IMPORTANT: If the word is in an inflected form, ALWAYS include the base/dictionary form.

Use these icons appropriately:
- <i class="fa fa-book"></i> for part of speech/word class
- <i class="fa fa-font"></i> for base form
- <i class="fa fa-venus-mars"></i> for gender
- <i class="fa fa-clock"></i> for tense/aspect
- <i class="fa fa-exchange-alt"></i> for declension/conjugation
- <i class="fa fa-exclamation-circle"></i> for irregular forms
- <i class="fa fa-info-circle"></i> for general information

VERY IMPORTANT: Respond in the "${userLanguage}" language (the language of the user), not in the source language.
`;

    // Добавляем специфичные для языка инструкции анализа слова
    switch (sourceLanguage) {
        case 'ru': // Русский
            basePrompt += `Analyze Russian words for:
- Part of speech with gender for nouns
- Base/dictionary form if word is inflected
- Declension or case information for nouns
- Aspect and tense for verbs
- But output in ${userLanguage} language`;
            break;
            
        case 'en': // Английский
            basePrompt += `Analyze English words for:
- Part of speech
- Base/dictionary form if word is inflected
- Irregular forms if applicable
- Tense for verbs
- But output in ${userLanguage} language`;
            break;
            
        case 'de': // Немецкий
            basePrompt += `Analyze German words for:
- Part of speech with gender for nouns (with article)
- Base/dictionary form if word is inflected
- Declension or plural form
- Strong/weak/mixed form for verbs
- But output in ${userLanguage} language`;
            break;
            
        case 'fr': // Французский
            basePrompt += `Analyze French words for:
- Part of speech with gender for nouns
- Base/dictionary form if word is inflected
- Conjugation information for verbs
- Irregular forms if notable
- But output in ${userLanguage} language`;
            break;
            
        case 'es': // Испанский
            basePrompt += `Analyze Spanish words for:
- Part of speech with gender for nouns
- Base/dictionary form if word is inflected
- Conjugation pattern for verbs
- Irregular forms if applicable
- But output in ${userLanguage} language`;
            break;
            
        case 'it': // Итальянский
            basePrompt += `Analyze Italian words for:
- Part of speech with gender for nouns
- Base/dictionary form if word is inflected
- Conjugation for verbs
- Plural forms for nouns if irregular
- But output in ${userLanguage} language`;
            break;
            
        case 'ja': // Японский
            basePrompt += `Analyze Japanese words for:
- Word type (名詞, 動詞, etc.)
- Base/dictionary form if word is inflected
- Verb group or conjugation pattern if applicable
- Formal/informal usage
- But output in ${userLanguage} language`;
            break;
            
        case 'zh': // Китайский
            basePrompt += `Analyze Chinese words for:
- Word type with measure word if a noun
- Base/dictionary form if applicable
- Character composition
- But output in ${userLanguage} language`;
            break;
            
        default:
            basePrompt += `Analyze words for:
- Part of speech
- Base/dictionary form if word is inflected
- Gender/case/form if applicable
- Tense for verbs if applicable
- But output in ${userLanguage} language`;
    }
    
    basePrompt += `
IMPORTANT:
1. The output MUST be in the "${userLanguage}" language
2. Must be extremely concise - maximum 4 lines total
3. Focus ONLY on grammatical features
4. No examples, usage notes, or definitions
5. The HTML must be semantically correct and visually appealing
6. Use appropriate Font Awesome icons from the list above
7. ALWAYS include base/dictionary form if the word is not in its basic form`;
    
    return basePrompt;
} 