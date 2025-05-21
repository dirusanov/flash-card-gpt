import { formatErrorMessage } from './errorFormatting';
import { ModelProvider } from '../store/reducers/settings';
import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';

/**
 * Интерфейс для работы с AI-провайдерами
 */
export interface AIProviderInterface {
  translateText: (
    text: string,
    translateToLanguage?: string,
    customPrompt?: string
  ) => Promise<string | null>;
  
  getExamples: (
    word: string,
    translateToLanguage: string,
    translate?: boolean,
    customPrompt?: string
  ) => Promise<Array<[string, string | null]>>;
  
  getDescriptionImage: (
    word: string,
    customInstructions?: string
  ) => Promise<string>;
  
  getImageUrl?: (
    description: string
  ) => Promise<string | null>;
  
  generateAnkiFront: (
    text: string
  ) => Promise<string | null>;
  
  // Метод для извлечения ключевых терминов из текста
  extractKeyTerms: (text: string) => Promise<string[]>;
  
  // Method to get grammar/linguistic information for a word or phrase
  getLinguisticInfo?: (
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage?: string
  ) => Promise<string>;
  
  // Method to create chat completion - needed for grammar reference
  createChatCompletion?: (
    apiKey: string,
    messages: Array<{role: string, content: string}>
  ) => Promise<{content: string} | null>;
}

/**
 * Базовый класс для работы с AI
 */
export abstract class BaseAIProvider implements AIProviderInterface {
  protected apiKey: string;
  protected modelName: string;
  
  constructor(apiKey: string, modelName: string = '') {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }
  
  /**
   * Абстрактный метод для отправки запросов к API
   */
  protected abstract sendRequest(prompt: string, options?: any): Promise<string | null>;
  
  /**
   * Абстрактный метод для извлечения ключевых терминов из текста
   */
  public abstract extractKeyTerms(text: string): Promise<string[]>;
  
  /**
   * Очистка текста от HTML и маркировки
   */
  protected extractPlainText(response: string | null): string | null {
    if (!response) return null;
    
    // Удаляем HTML-теги
    let plainText = response.replace(/<\/?[^>]+(>|$)/g, "");
    
    // Удаляем форматирование Markdown
    plainText = plainText
      .replace(/^#+\s+/gm, '')           // Удаляем заголовки
      .replace(/\*\*(.*?)\*\*/g, '$1')   // Удаляем жирный шрифт
      .replace(/\*(.*?)\*/g, '$1')       // Удаляем курсив
      .replace(/`(.*?)`/g, '$1')         // Удаляем код
      .replace(/```[\s\S]*?```/g, '')    // Удаляем блоки кода
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1') // Заменяем ссылки на текст
      .trim();
    
    return plainText;
  }
  
  /**
   * Стандартные промпты для разных типов запросов
   */
  protected getPrompts() {
    return {
      translate: (text: string, language: string) => 
        `Translate the following text to ${language}: "${text}". 
Output ONLY the direct translation, without any additional text, explanations, quotes, examples, or formatting.
Do not include any examples or sentences. Just return the translation of the word in a single line.
Do not include definitions, examples, notes, or part of speech information. Only provide the translated word or phrase.`,
      
      examples: (word: string) => 
        `Give me exactly three example sentences using the word '${word}' in English.
Each sentence should show natural usage of '${word}'.
Format your response as follows:
1. [First example sentence here]
2. [Second example sentence here]
3. [Third example sentence here]
Do not include definitions, explanations, or translations, ONLY the numbered example sentences as shown above.`,
      
      imageDescription: (word: string) => 
        `Create a short visual description of the word/concept "${word}" for image generation.
The description should be concrete, visual, and focus on representational elements.
Keep the description under 50 words and make sure it is purely descriptive without any formatting.`
    };
  }
  
  /**
   * Перевод текста
   */
  public async translateText(
    text: string, 
    translateToLanguage: string = 'ru',
    customPrompt: string = ''
  ): Promise<string | null> {
    try {
      const basePrompt = this.getPrompts().translate(text, translateToLanguage);
      const finalPrompt = customPrompt ? `${basePrompt}. ${customPrompt}` : basePrompt;
      
      const response = await this.sendRequest(finalPrompt);
      if (!response) return null;
      
      // Очистка ответа
      let cleanedTranslation = this.extractPlainText(response);
      
      if (cleanedTranslation) {
        // Более строгая очистка перевода
        cleanedTranslation = cleanedTranslation
          .replace(/^translation[:\s-]*/i, '')    // Удаляем "Translation:" префикс
          .replace(/^["']|["']$/g, '')           // Удаляем кавычки
          .replace(/^.*?:\s*/i, '')              // Удаляем любой префикс с двоеточием
          .replace(/^\s*-\s*/, '')               // Удаляем начальное тире
          .replace(/^translated\s*as\s*:?\s*/i, '') // Удаляем "Translated as:"
          .replace(/^перевод\s*:?\s*/i, '')      // Удаляем "Перевод:"
          .replace(/\s*definition:[\s\S]*$/i, '') // Удаляем все после "Definition:"
          .replace(/\s*examples:[\s\S]*$/i, '')  // Удаляем все после "Examples:"
          .replace(/\s*example:[\s\S]*$/i, '')   // Удаляем все после "Example:"
          .replace(/\s*example sentences:[\s\S]*$/i, '') // Удаляем все после "Example sentences:"
          .replace(/\s*примеры:[\s\S]*$/i, '')   // Удаляем все после "Примеры:" (русский)
          .replace(/\s*пример:[\s\S]*$/i, '')    // Удаляем все после "Пример:" (русский)
          .replace(/\s*notes:[\s\S]*$/i, '')     // Удаляем все после "Notes:"
          .replace(/\s*определение:[\s\S]*$/i, '') // Удаляем все после "Определение:" (русский)
          .replace(/\s*here is the response[\s\S]*$/i, '') // Удаляем "Here is the response" и все после
          .replace(/\s*\(adjective\)[\s\S]*$/i, '') // Удаляем "(adjective)" и все после
          .replace(/\s*\(noun\)[\s\S]*$/i, '')   // Удаляем "(noun)" и все после
          .replace(/\s*\(verb\)[\s\S]*$/i, '')   // Удаляем "(verb)" и все после
          .replace(/^the word[\s\S]*translated as[\s:]*/i, '') // Удаляем "The word X translated as:"
          .replace(/^словосочетание[\s\S]*переводится как[\s:]*/i, '') // Удаляем русский эквивалент
          .replace(/^слово[\s\S]*переводится как[\s:]*/i, '') // Удаляем русский эквивалент
          .replace(/^.*?это[\s:]*/i, '')        // Удаляем "X - это:" и подобное
          .replace(/^.*?означает[\s:]*/i, '')   // Удаляем "X означает:"
          .replace(/^.*?means[\s:]*/i, '')      // Удаляем "X means:"
          .replace(/^the translation is[\s:]*/i, '') // Удаляем "The translation is:"
          .split('\n')[0]                        // Берем только первую строку
          .trim();
        
        // Если перевод содержит слишком много слов, возможно это не просто перевод
        // а полное предложение с примером - в этом случае берем первые несколько слов
        const MAX_TRANSLATION_WORDS = 5; // Максимум слов в переводе
        const words = cleanedTranslation.split(/\s+/);
        if (words.length > MAX_TRANSLATION_WORDS) {
          // Если исходный текст - короткая фраза, то разрешаем больше слов в переводе
          const originalWords = text.split(/\s+/).length;
          if (originalWords <= 3 || words.length <= originalWords + 2) {
            // Это нормально, короткая фраза
          } else {
            // Слишком много слов, вероятно это предложение - берем только первые несколько слов
            console.log('Translation too long, trimming:', cleanedTranslation);
            cleanedTranslation = words.slice(0, MAX_TRANSLATION_WORDS).join(' ');
          }
        }
        
        // Если после всех очисток получился пустой результат, вернуть весь ответ
        if (!cleanedTranslation && response) {
          return response.split('\n')[0].trim();
        }
      }
      
      console.log('Original translation:', response);
      console.log('Cleaned translation:', cleanedTranslation);
      
      return cleanedTranslation;
    } catch (error) {
      console.error('Error during translation:', error);
      throw error;
    }
  }
  
  /**
   * Получение примеров использования слова
   */
  public async getExamples(
    word: string,
    translateToLanguage: string,
    translate: boolean = false,
    customPrompt: string = ''
  ): Promise<Array<[string, string | null]>> {
    try {
      const basePrompt = this.getPrompts().examples(word);
      const finalPrompt = customPrompt 
        ? `${basePrompt} ${customPrompt.replace(/\{word\}/g, word)}` 
        : basePrompt;
      
      const response = await this.sendRequest(finalPrompt);
      
      if (!response) {
        throw new Error("Failed to generate examples. Please try again with a different word.");
      }
      
      console.log('Raw examples response:', response);
      
      // Очистка текста
      const cleanedText = this.extractPlainText(response) || '';
      
      // Удаляем любые заголовки перед первым примером
      const contentWithoutHeaders = cleanedText
        .replace(/^[\s\S]*?((?:\d+\s*\.\s*|•\s*|[\-\*]\s*).+$)/m, '$1')
        .trim();
      
      // Используем регулярное выражение для поиска нумерованных примеров
      const exampleRegex = /(?:^|\n)(?:\d+\s*\.\s*|•\s*|[\-\*]\s*)(.+?)(?=(?:\n+(?:\d+\s*\.\s*|•\s*|[\-\*]\s*)|\n*$))/g;
      
      // Извлекаем примеры
      let examples: string[] = [];
      let match;
      while ((match = exampleRegex.exec(contentWithoutHeaders)) !== null) {
        if (match[1]) {
          examples.push(match[1].trim());
        }
      }
      
      // Запасной вариант, если не найдены примеры
      if (examples.length === 0) {
        examples = contentWithoutHeaders
          .split(/\n+/)
          .map(line => line.replace(/^\d+\s*\.\s*|^\s*•\s*|^\s*[\-\*]\s*/, '').trim())
          .filter(line => line.length > 0 && line.toLowerCase().includes(word.toLowerCase()))
          .slice(0, 3);
      }
      
      // Если все равно нет примеров, берем любые непустые строки
      if (examples.length === 0) {
        examples = contentWithoutHeaders
          .split(/\n+/)
          .map(line => line.replace(/^\d+\s*\.\s*|^\s*•\s*|^\s*[\-\*]\s*/, '').trim())
          .filter(line => line.length > 0)
          .slice(0, 3);
      }
      
      // Удаляем вводные фразы из примеров
      examples = examples.map(example => 
        example
          .replace(/^(example|sentence|пример|предложение)[\s:]*/i, '')
          .replace(/^["']|["']$/g, '')
      );
      
      console.log('Processed examples:', examples);
      
      // Формируем результат
      const resultExamples: Array<[string, string | null]> = [];
      
      for (const example of examples) {
        if (!example.trim()) continue;
        
        let translatedExample: string | null = null;
        
        if (translate) {
          try {
            translatedExample = await this.translateText(example, translateToLanguage);
          } catch (translationError) {
            console.error('Error translating example:', translationError);
          }
        }
        
        resultExamples.push([example, translatedExample]);
        
        // Ограничиваем до 3 примеров
        if (resultExamples.length >= 3) break;
      }
      
      if (resultExamples.length === 0) {
        throw new Error("Could not generate examples. Please try again with a different word or check your API key.");
      }
      
      return resultExamples;
    } catch (error) {
      console.error('Error getting examples:', error);
      throw error;
    }
  }
  
  /**
   * Получение описания для создания изображения
   */
  public async getDescriptionImage(
    word: string,
    customInstructions: string = ''
  ): Promise<string> {
    try {
      const basePrompt = this.getPrompts().imageDescription(word);
      const finalPrompt = customInstructions 
        ? `${basePrompt} ${customInstructions}` 
        : basePrompt;
      
      const response = await this.sendRequest(finalPrompt);
      
      if (!response) {
        throw new Error("Failed to generate image description. Please try again.");
      }
      
      const description = this.extractPlainText(response);
      return description || response;
    } catch (error) {
      console.error('Error generating image description:', error);
      throw error;
    }
  }
  
  /**
   * Создание лицевой стороны карточки Anki
   */
  public async generateAnkiFront(
    text: string
  ): Promise<string | null> {
    try {
      // Use a simpler approach for Anki front
      const prompt = `For the word or phrase "${text}", provide ONLY the word itself and its pronunciation in IPA format.
Format as: word (part of speech) /pronunciation/
For example: "run (verb) /rʌn/"
Your response should contain ONLY this formatted text, WITHOUT any additional information.`;
      
      const response = await this.sendRequest(prompt);
      
      if (!response) {
        return null;
      }
      
      // Очищаем ответ от лишнего
      let cleanedResponse = this.extractPlainText(response) || response;
      
      // Извлекаем только первую строку с форматированием слова и произношения
      cleanedResponse = cleanedResponse
        .split('\n')[0]
        .replace(/^["']|["']$/g, '')       // Удаляем кавычки
        .replace(/^front:[\s:]*/i, '')     // Удаляем "Front:" если есть
        .replace(/^word:[\s:]*/i, '')      // Удаляем "Word:" если есть
        .trim();
      
      console.log('Front card response:', cleanedResponse);
      
      return cleanedResponse;
    } catch (error) {
      console.error('Error generating Anki front:', error);
      throw error;
    }
  }
}

/**
 * Реализация провайдера OpenAI
 */
export class OpenAIProvider extends BaseAIProvider {
  private openai: OpenAI;
  
  constructor(apiKey: string, modelName: string = 'gpt-3.5-turbo') {
    super(apiKey, modelName);
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
  
  protected async sendRequest(prompt: string, options: any = {}): Promise<string | null> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [
          { role: 'user', content: prompt }
        ],
        ...options
      });
      
      return response.choices[0]?.message?.content?.trim() || null;
    } catch (error) {
      console.error('Error in OpenAI request:', error);
      throw error;
    }
  }
  
  // Дополнительный метод для получения изображения, специфичный для OpenAI
  public async getImageUrl(description: string): Promise<string | null> {
    try {
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: description,
        n: 1,
        size: "1024x1024",
      });
      
      return response.data?.[0]?.url || null;
    } catch (error) {
      console.error('Error generating image with OpenAI:', error);
      throw error;
    }
  }
  
  // Обновляем метод extractKeyTerms
  async extractKeyTerms(text: string): Promise<string[]> {
    try {
      const prompt = `You are a helpful language learning assistant. Extract key terms from the text that would be useful to learn as flashcards. Limit to 5 most important terms max. Return only the terms, one per line, without any additional text or formatting.`;
      
      const response = await this.sendRequest(prompt, {
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: text
          }
        ]
      });
      
      const content = response || '';
      if (!content) {
        return [];
      }
      
      // Разбиваем ответ на строки и фильтруем пустые
      return content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    } catch (error) {
      console.error("Error extracting key terms with OpenAI:", error);
      return [];
    }
  }
  
  // Added createChatCompletion implementation
  public async createChatCompletion(
    apiKey: string, 
    messages: Array<{role: string, content: string}>
  ): Promise<{content: string} | null> {
    try {
      const formattedMessages: ChatCompletionMessageParam[] = messages.map(msg => ({
        role: msg.role as 'user' | 'system' | 'assistant',
        content: msg.content
      }));
      
      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: formattedMessages,
      });
      
      const content = response.choices[0]?.message?.content?.trim() || '';
      if (!content) {
        return null;
      }
      
      return { content };
    } catch (error) {
      console.error('Error in OpenAI chat completion:', error);
      throw error;
    }
  }
}

/**
 * Реализация провайдера Groq
 */
export class GroqProvider extends BaseAIProvider {
  private apiBaseUrl: string = 'https://api.groq.com/openai/v1';
  
  constructor(apiKey: string, modelName: string = 'llama3-8b-8192') {
    super(apiKey, modelName);
  }
  
  protected async sendRequest(prompt: string, options: any = {}): Promise<string | null> {
    try {
      if (!this.apiKey) {
        throw new Error("Groq API key is missing. Please check your settings.");
      }
      
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ],
          max_tokens: options.max_tokens || 1000
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(formatErrorMessage("Groq API Error", response.status, errorData));
      }
      
      const data = await response.json();
      return data.choices?.[0]?.message?.content?.trim() ?? null;
    } catch (error) {
      console.error('Error in Groq API request:', error);
      throw error;
    }
  }
  
  // Explicitly state that image generation is not supported
  public getImageUrl(): Promise<string | null> {
    throw new Error("Image generation is not supported by Groq.");
  }
  
  // Добавьте метод extractKeyTerms
  async extractKeyTerms(text: string): Promise<string[]> {
    try {
      const prompt = `You are a helpful language learning assistant. Extract key terms from the text that would be useful to learn as flashcards. Limit to 5 most important terms max. Return only the terms, one per line, without any additional text or formatting.`;
      
      const response = await this.sendRequest(prompt, {
        messages: [
          {
            role: "system",
            content: prompt
          },
          {
            role: "user",
            content: text
          }
        ]
      });
      
      const content = response || '';
      if (!content) {
        return [];
      }
      
      // Разбиваем ответ на строки и фильтруем пустые
      return content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0);
    } catch (error) {
      console.error("Error extracting key terms with Groq:", error);
      return [];
    }
  }
  
  // Added createChatCompletion implementation for Groq
  public async createChatCompletion(
    apiKey: string,
    messages: Array<{role: string, content: string}>
  ): Promise<{content: string} | null> {
    try {
      if (!this.apiKey) {
        throw new Error("Groq API key is missing. Please check your settings.");
      }
      
      const response = await fetch(`${this.apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: messages,
          max_tokens: 1000
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(formatErrorMessage("Groq API Error", response.status, errorData));
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      
      if (!content) {
        return null;
      }
      
      return { content };
    } catch (error) {
      console.error('Error in Groq chat completion:', error);
      throw error;
    }
  }
}

/**
 * Фабрика для создания провайдеров
 */
export const createAIProvider = (
  provider: ModelProvider, 
  apiKey: string,
  modelName: string = ''
): AIProviderInterface => {
  switch (provider) {
    case ModelProvider.OpenAI:
      return new OpenAIProvider(apiKey, modelName || 'gpt-3.5-turbo');
    
    case ModelProvider.Groq:
      return new GroqProvider(apiKey, modelName || 'llama3-8b-8192');
    
    default:
      return new OpenAIProvider(apiKey, modelName || 'gpt-3.5-turbo');
  }
}; 