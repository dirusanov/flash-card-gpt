import { formatErrorMessage } from './errorFormatting';
import { ModelProvider } from '../store/reducers/settings';
import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { TranscriptionResult } from './aiServiceFactory';
import { getGlobalApiTracker } from './apiTracker';

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
    customPrompt?: string,
    sourceLanguage?: string
  ) => Promise<Array<[string, string | null]>>;
  
  getDescriptionImage: (
    word: string,
    customInstructions?: string
  ) => Promise<string>;
  
  getImageUrl?: (
    description: string
  ) => Promise<string | null>;
  
  getOptimizedImageUrl?: (
    word: string,
    customInstructions?: string
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

  // Method to create transcription in user language and IPA
  createTranscription: (
    text: string,
    sourceLanguage: string,
    userLanguage: string
  ) => Promise<TranscriptionResult | null>;
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
Provide the most common and appropriate translation. Only include multiple meanings if the word has distinctly different translations that are equally common.
If multiple translations are needed, separate them with commas (e.g., "перевод1, перевод2, перевод3").
Do not include definitions, examples, notes, or part of speech information in English like (noun), (verb), (adjective), etc.
Only provide the clean translated word or phrase without any parenthetical information.`,
      
      examples: (word: string, sourceLanguage?: string) => {
        // Если sourceLanguage указан, используем его, иначе позволяем модели определить
        const languageInstruction = sourceLanguage 
          ? `Give me exactly three example sentences using the word '${word}' in the language with code "${sourceLanguage}".`
          : `Give me exactly three example sentences using the word '${word}' in its original language.`;
        
        return `${languageInstruction}
Each sentence should show natural usage of '${word}' in that language.
Format your response as follows:
1. [First example sentence here]
2. [Second example sentence here] 
3. [Third example sentence here]
Do not include definitions, explanations, or translations, ONLY the numbered example sentences as shown above.`;
      },
      
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
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Translating text',
      `Converting your text to ${translateToLanguage}`,
      '🌍',
      '#3B82F6'
    );

    try {
      tracker.setInProgress(requestId);
      const basePrompt = this.getPrompts().translate(text, translateToLanguage);
      const finalPrompt = customPrompt ? `${basePrompt}. ${customPrompt}` : basePrompt;
      
      const response = await this.sendRequest(finalPrompt);
      if (!response) {
        tracker.errorRequest(requestId);
        return null;
      }
      
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
          .replace(/\s*\(adverb\)[\s\S]*$/i, '') // Удаляем "(adverb)" и все после
          .replace(/\s*\(preposition\)[\s\S]*$/i, '') // Удаляем "(preposition)" и все после
          .replace(/\s*\(pronoun\)[\s\S]*$/i, '') // Удаляем "(pronoun)" и все после
          .replace(/\s*\(conjunction\)[\s\S]*$/i, '') // Удаляем "(conjunction)" и все после
          .replace(/\s*\(interjection\)[\s\S]*$/i, '') // Удаляем "(interjection)" и все после
          .replace(/\s*\([^)]*\)[\s\S]*$/i, '')  // Удаляем любые другие части речи в скобках
          .replace(/^the word[\s\S]*translated as[\s:]*/i, '') // Удаляем "The word X translated as:"
          .replace(/^словосочетание[\s\S]*переводится как[\s:]*/i, '') // Удаляем русский эквивалент
          .replace(/^слово[\s\S]*переводится как[\s:]*/i, '') // Удаляем русский эквивалент
          .replace(/^.*?это[\s:]*/i, '')        // Удаляем "X - это:" и подобное
          .replace(/^.*?означает[\s:]*/i, '')   // Удаляем "X означает:"
          .replace(/^.*?means[\s:]*/i, '')      // Удаляем "X means:"
          .replace(/^the translation is[\s:]*/i, '') // Удаляем "The translation is:"
          .split('\n')[0]                        // Берем только первую строку
          .trim();
        
        // Разрешаем больше слов в переводе для фраз и составных слов
        const MAX_TRANSLATION_WORDS = 8; // Увеличиваем максимум слов в переводе
        const words = cleanedTranslation.split(/\s+/);
        
        // Проверяем, есть ли в переводе запятые (несколько значений)
        const hasMultipleTranslations = cleanedTranslation.includes(',');
        
        if (hasMultipleTranslations) {
          // Если есть запятые, это несколько переводов - ограничиваем до 3 переводов
          const translations = cleanedTranslation.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .slice(0, 3); // Максимум 3 перевода
          
          cleanedTranslation = translations.join(', ');
        } else if (words.length > MAX_TRANSLATION_WORDS) {
          // Если это один перевод, но слишком много слов
          const originalWords = text.split(/\s+/).length;
          if (originalWords <= 5 || words.length <= originalWords * 2) {
            // Это нормально, фраза может требовать развернутого перевода
          } else {
            // Слишком много слов, вероятно это предложение - берем только разумное количество слов
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
      
      tracker.completeRequest(requestId);
      return cleanedTranslation;
    } catch (error) {
      console.error('Error during translation:', error);
      tracker.errorRequest(requestId);
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
    customPrompt: string = '',
    sourceLanguage?: string
  ): Promise<Array<[string, string | null]>> {
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating example sentences',
      `Generating helpful examples for "${word}"`,
      '💡',
      '#F59E0B'
    );

    try {
      tracker.setInProgress(requestId);
      const basePrompt = this.getPrompts().examples(word, sourceLanguage);
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
        console.warn("No examples were generated, but continuing with card creation");
        tracker.completeRequest(requestId); // Mark as complete even without examples
        return []; // Return empty array instead of throwing error
      }
      
      tracker.completeRequest(requestId);
      return resultExamples;
    } catch (error) {
      console.error('Error getting examples:', error);
      tracker.errorRequest(requestId);
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
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Crafting image description',
      `Creating detailed prompt for "${word}" visualization`,
      '🎨',
      '#EC4899'
    );

    try {
      tracker.setInProgress(requestId);
      const basePrompt = this.getPrompts().imageDescription(word);
      const finalPrompt = customInstructions 
        ? `${basePrompt} ${customInstructions}` 
        : basePrompt;
      
      const response = await this.sendRequest(finalPrompt);
      
      if (!response) {
        tracker.errorRequest(requestId);
        throw new Error("Failed to generate image description. Please try again.");
      }
      
      const description = this.extractPlainText(response);
      tracker.completeRequest(requestId);
      return description || response;
    } catch (error) {
      console.error('Error generating image description:', error);
      tracker.errorRequest(requestId);
      throw error;
    }
  }
  
  /**
   * Создание лицевой стороны карточки Anki
   */
  public async generateAnkiFront(
    text: string
  ): Promise<string | null> {
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating question',
      'Crafting an effective question for your flashcard',
      '❓',
      '#10B981'
    );

    try {
      tracker.setInProgress(requestId);
      // Теперь возвращаем только само слово, произношение будет в отдельном блоке транскрипции
      const prompt = `For the word or phrase "${text}", provide ONLY the word itself without any pronunciation or additional formatting.
Just return the clean word/phrase as it should appear on the front of an Anki card.
For example: if input is "hello", return "hello"
If input is "beautiful", return "beautiful"
Your response should contain ONLY the word/phrase, no pronunciation, no IPA, no additional text.`;
      
      const response = await this.sendRequest(prompt);
      
      if (!response) {
        tracker.errorRequest(requestId);
        return text; // Fallback to original text
      }
      
      // Очищаем ответ
      let cleanedResponse = this.extractPlainText(response) || response;
      
      // Удаляем любые дополнительные элементы
      cleanedResponse = cleanedResponse
        .split('\n')[0]
        .replace(/^["']|["']$/g, '')       // Удаляем кавычки
        .replace(/\/.*?\//g, '')           // Удаляем произношение в слешах
        .replace(/\[.*?\]/g, '')           // Удаляем IPA в скобках
        .replace(/\(.*?\)/g, '')           // Удаляем любые скобки
        .replace(/^front:[\s:]*/i, '')     // Удаляем "Front:" если есть
        .replace(/^word:[\s:]*/i, '')      // Удаляем "Word:" если есть
        .trim();
      
      console.log('Front card response:', cleanedResponse);
      
      tracker.completeRequest(requestId);
      return cleanedResponse || text; // Fallback to original text if empty
    } catch (error) {
      console.error('Error generating Anki front:', error);
      tracker.errorRequest(requestId);
      return text; // Fallback to original text
    }
  }

  /**
   * Создание транскрипции слова на языке пользователя и в IPA
   */
  public async createTranscription(
    text: string,
    sourceLanguage: string,
    userLanguage: string
  ): Promise<TranscriptionResult | null> {
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating transcription',
      `Generating pronunciation for "${text}"`,
      '🔤',
      '#8B5CF6'
    );

    try {
      tracker.setInProgress(requestId);
      // Создаем промпт для получения транскрипций
      const prompt = this.createTranscriptionPrompt(text, sourceLanguage, userLanguage);
      
      const response = await this.sendRequest(prompt);
      
      if (!response) {
        tracker.errorRequest(requestId);
        return null;
      }
      
      // Парсим ответ для извлечения транскрипций
      const result = this.parseTranscriptionResponse(response);
      tracker.completeRequest(requestId);
      return result;
    } catch (error) {
      console.error('Error creating transcription:', error);
      tracker.errorRequest(requestId);
      return null;
    }
  }

  /**
   * Создание промпта для транскрипции
   */
  protected createTranscriptionPrompt(text: string, sourceLanguage: string, userLanguage: string): string {
    return `Create transcriptions for the word/phrase "${text}" (in ${sourceLanguage}):

1. User language transcription: Show how to pronounce this word using ${userLanguage} phonetics/script
2. IPA transcription: International Phonetic Alphabet notation

IMPORTANT:
- For user language: Write how "${text}" sounds using ${userLanguage} pronunciation system
- For IPA: Use proper IPA symbols [ˈ ˌ ə ɪ ɛ æ ɑ ɔ ʊ ʌ θ ð ʃ ʒ ʧ ʤ ŋ etc.]
- Format exactly as shown below:

USER_LANG: [how the word sounds in ${userLanguage}]
IPA: [ˈaɪ.pi.eɪ notation]

Example for Russian "короткая" with Spanish user language:
USER_LANG: korotkaya
IPA: [kəˈrotkəjə]

Provide ONLY the two lines as shown above, no additional text.`;
  }

  /**
   * Парсинг ответа для извлечения транскрипций
   */
  protected parseTranscriptionResponse(response: string): TranscriptionResult {
    const cleanResponse = this.extractPlainText(response) || response;
    
    let userLanguageTranscription: string | null = null;
    let ipaTranscription: string | null = null;

    // Извлекаем транскрипцию на языке пользователя
    const userLangMatch = cleanResponse.match(/USER_LANG:\s*(.+)/i);
    if (userLangMatch) {
      userLanguageTranscription = userLangMatch[1].trim();
    }

    // Извлекаем IPA транскрипцию
    const ipaMatch = cleanResponse.match(/IPA:\s*(.+)/i);
    if (ipaMatch) {
      ipaTranscription = ipaMatch[1].trim()
        .replace(/^\[|\]$/g, '') // Удаляем квадратные скобки
        .replace(/^\/|\/$/g, ''); // Удаляем прямые скобки
      
      // Добавляем квадратные скобки если их нет
      if (ipaTranscription && !ipaTranscription.startsWith('[')) {
        ipaTranscription = `[${ipaTranscription}]`;
      }
    }

    return {
      userLanguageTranscription,
      ipaTranscription
    };
  }
}

/**
 * Реализация провайдера OpenAI
 */
export class OpenAIProvider extends BaseAIProvider {
  private openai: OpenAI;
  
  constructor(apiKey: string, modelName: string = 'gpt-5-nano') {
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
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Generating image',
      'Creating beautiful illustration with AI',
      '🖼️',
      '#6366F1'
    );

    try {
      tracker.setInProgress(requestId);
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: description,
        n: 1,
        size: "1024x1024",
      });
      
      const imageUrl = response.data?.[0]?.url || null;
      if (imageUrl) {
        tracker.completeRequest(requestId);
      } else {
        tracker.errorRequest(requestId);
      }
      return imageUrl;
    } catch (error) {
      console.error('Error generating image with OpenAI:', error);
      tracker.errorRequest(requestId);
      throw error;
    }
  }

  // НОВАЯ ОПТИМИЗИРОВАННАЯ функция для быстрой генерации изображений
  public async getOptimizedImageUrl(word: string, customInstructions: string = ''): Promise<string | null> {
    const { getOptimizedImageUrl } = await import('./openaiApi');
    
    try {
      return await getOptimizedImageUrl(this.openai, this.apiKey, word, customInstructions);
    } catch (error) {
      console.error('Error generating optimized image:', error);
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
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating grammar reference',
      'Generating detailed grammar and linguistic information',
      '📚',
      '#9C27B0'
    );

    try {
      tracker.setInProgress(requestId);
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
        tracker.errorRequest(requestId);
        return null;
      }
      
      tracker.completeRequest(requestId);
      return { content };
    } catch (error) {
      console.error('Error in OpenAI chat completion:', error);
      tracker.errorRequest(requestId);
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
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating grammar reference',
      'Generating detailed grammar and linguistic information',
      '📚',
      '#9C27B0'
    );

    try {
      tracker.setInProgress(requestId);
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

        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(formatErrorMessage("Groq API Error", response.status, errorData));
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      
      if (!content) {
        tracker.errorRequest(requestId);
        return null;
      }
      
      tracker.completeRequest(requestId);
      return { content };
    } catch (error) {
      console.error('Error in Groq chat completion:', error);
      tracker.errorRequest(requestId);
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
      return new OpenAIProvider(apiKey, modelName || 'gpt-5-nano');
    
    case ModelProvider.Groq:
      return new GroqProvider(apiKey, modelName || 'llama3-8b-8192');
    
    default:
      return new OpenAIProvider(apiKey, modelName || 'gpt-5-nano');
  }
}; 