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
    let basePrompt = `You are a professional linguist creating concise grammar references for language learners.

IMPORTANT: ONLY analyze the SOURCE TERM "${text}" in "${sourceLanguage}" language.
DO NOT analyze any translation - ONLY analyze the ORIGINAL SOURCE TERM.

FORMAT REQUIREMENTS:
1. FOCUS ONLY on grammatical information about "${text}" in "${sourceLanguage}" language
2. Maximum 4-6 short grammatical points
3. Keep each point to 5-8 words maximum
4. Use color-coded tags for grammatical features

USE EMOJI SYMBOLS FOR CATEGORIES:
📚 For part of speech (noun, verb, adjective, etc.)
🏠 For root/base form (ONLY if current word is NOT in its base form)
⚥ For gender (masculine, feminine, neuter)
🕒 For tense/aspect (past, present, future, perfect, etc.)
📋 For form/number (singular, plural, etc.)
✏️ For conjugation patterns
⚠️ For irregular forms or special cases
🔊 For pronunciation notes (only if very important)

HTML STRUCTURE FOR EACH POINT:
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>Part of speech:</strong> <span class="grammar-tag tag-pos">Noun</span>
</div>

CRITICAL: ROOT FORM LOGIC
- 🏠 Include root/base form ONLY if "${text}" is NOT already in its dictionary/base form
- If "${text}" is already the base form (infinitive, nominative singular, etc.), do NOT include root form
- If "${text}" is conjugated/declined (like "running" vs "run", "books" vs "book"), then show base form

INCLUDE AT LEAST:
1. Part of speech (📚) ALWAYS
2. Root form (🏠) ONLY if current word is not in base form
3. Gender (⚥) for nouns if applicable
4. Tense (🕒) for verbs if applicable
5. Only the MOST important grammar points - no extra information

EXAMPLE OUTPUT FOR A CONJUGATED VERB "running":
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>Part of speech:</strong> <span class="grammar-tag tag-pos">Verb</span>
</div>
<div class="grammar-item">
  <span class="icon-root">🏠</span> <strong>Base form:</strong> <span class="grammar-tag tag-root">run</span>
</div>
<div class="grammar-item">
  <span class="icon-tense">🕒</span> <strong>Form:</strong> <span class="grammar-tag tag-tense">Present participle</span>
</div>

EXAMPLE OUTPUT FOR A BASE VERB "run":
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>Part of speech:</strong> <span class="grammar-tag tag-pos">Verb</span>
</div>
<div class="grammar-item">
  <span class="icon-tense">🕒</span> <strong>Form:</strong> <span class="grammar-tag tag-tense">Infinitive</span>
</div>

EXAMPLE OUTPUT FOR PLURAL NOUN "books":
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>Part of speech:</strong> <span class="grammar-tag tag-pos">Noun</span>
</div>
<div class="grammar-item">
  <span class="icon-root">🏠</span> <strong>Base form:</strong> <span class="grammar-tag tag-root">book</span>
</div>
<div class="grammar-item">
  <span class="icon-form">📋</span> <strong>Number:</strong> <span class="grammar-tag tag-form">Plural</span>
</div>

EXAMPLE OUTPUT FOR SINGULAR NOUN "book":
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>Part of speech:</strong> <span class="grammar-tag tag-pos">Noun</span>
</div>
<div class="grammar-item">
  <span class="icon-gender">⚥</span> <strong>Gender:</strong> <span class="grammar-tag tag-gender">Neuter</span>
</div>

REMEMBER:
- Analysis MUST be for the SOURCE WORD "${text}" in ${sourceLanguage} only
- Do NOT analyze the translation
- Keep it very concise and focused
- Response must be in ${userLanguage} language
- Use only the emoji symbols provided above, not FontAwesome icons
- Always include at least the part of speech
- Include base form (🏠) ONLY when the current word is NOT in its base form
- Never duplicate information (if word is "run", don't show "Base form: run")`;

    return basePrompt;
} 