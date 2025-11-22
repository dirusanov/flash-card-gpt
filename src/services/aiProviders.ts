import { formatErrorMessage } from './errorFormatting';
import { ModelProvider } from '../store/reducers/settings';
import { TranscriptionResult } from './aiServiceFactory';
import { getGlobalApiTracker } from './apiTracker';
import { backgroundFetch } from './backgroundFetch';
import { formatOpenAIErrorMessage, cacheQuotaExceededError } from './openaiApi';
import { getLanguageEnglishName } from './languageNames';
import { getImagePromptCacheKey, loadCachedPrompt, saveCachedPrompt } from './promptCache';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/**
 * Интерфейс для работы с AI-провайдерами
 */
export interface AIProviderInterface {
  translateText: (
    text: string,
    translateToLanguage?: string,
    customPrompt?: string,
    abortSignal?: AbortSignal
  ) => Promise<string | null>;
  
  getExamples: (
    word: string,
    translateToLanguage: string,
    translate?: boolean,
    customPrompt?: string,
    sourceLanguage?: string,
    abortSignal?: AbortSignal
  ) => Promise<Array<[string, string | null]>>;
  
  getDescriptionImage: (
    word: string,
    customInstructions?: string,
    sourceLanguage?: string,
    abortSignal?: AbortSignal
  ) => Promise<string>;
  
  getImageUrl?: (
    description: string
  ) => Promise<string | null>;
  
  getOptimizedImageUrl?: (
    word: string,
    customInstructions?: string,
    sourceLanguage?: string,
    abortSignal?: AbortSignal
  ) => Promise<string | null>;
  
  generateAnkiFront: (
    text: string,
    abortSignal?: AbortSignal
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
    messages: Array<{role: string, content: string}>,
    trackingInfo?: {
      title?: string;
      subtitle?: string; 
      icon?: string;
      color?: string;
    }
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
Output ONLY the translation(s), without any additional text, explanations, quotes, examples, or formatting.
If the word or short phrase commonly has more than one natural translation, provide 2–3 of the most common, separated by commas (e.g., "перевод1, перевод2, перевод3"). If it is clearly unambiguous, return just one.
Do not include definitions, examples, notes, or part of speech information like (noun), (verb), (adjective), etc.
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
      
      imageDescription: (word: string, sourceLanguage?: string) => {
        const langName = getLanguageEnglishName(sourceLanguage || null);
        const langDetails = sourceLanguage
          ? ` The source word language: code=${sourceLanguage}${langName ? `, name=${langName}` : ''}. Interpret the meaning of "${word}" strictly in this language; do not use meanings from other languages with similar spelling.`
          : '';
        return `Create a short visual description of the word/concept "${word}" for image generation.${langDetails}
The description should be concrete, visual, and focus on representational elements.
Keep the description under 50 words and make sure it is purely descriptive without any formatting.`;
      }
    };
  }
  
  /**
   * Перевод текста
   */
  public async translateText(
    text: string, 
    translateToLanguage: string = 'ru',
    customPrompt: string = '',
    abortSignal?: AbortSignal
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
      
      const response = await this.sendRequest(finalPrompt, { signal: abortSignal });
      if (!response) {
        tracker.errorRequest(requestId);
        return null;
      }
      
      // Очистка ответа (с сохранением вариантов, если модель вернула список)
      const raw = this.extractPlainText(response) || response || '';

      // Базовая очистка от служебных префиксов/шумов, но НЕ отбрасываем остальные строки
      let normalized = raw
        .replace(/^translation[:\s-]*/i, '')
        .replace(/^["']|["']$/g, '')
        .replace(/^.*?:\s*/i, '')
        .replace(/^\s*-\s*/, '')
        .replace(/^translated\s*as\s*:?\s*/i, '')
        .replace(/^перевод\s*:?\s*/i, '')
        .replace(/\s*definition:[\s\S]*$/i, '')
        .replace(/\s*examples:[\s\S]*$/i, '')
        .replace(/\s*example:[\s\S]*$/i, '')
        .replace(/\s*example sentences:[\s\S]*$/i, '')
        .replace(/\s*примеры:[\s\S]*$/i, '')
        .replace(/\s*пример:[\s\S]*$/i, '')
        .replace(/\s*notes:[\s\S]*$/i, '')
        .replace(/\s*определение:[\s\S]*$/i, '')
        .replace(/\s*here is the response[\s\S]*$/i, '')
        .replace(/\s*\(adjective\)\s*/ig, '')
        .replace(/\s*\(noun\)\s*/ig, '')
        .replace(/\s*\(verb\)\s*/ig, '')
        .replace(/\s*\(adverb\)\s*/ig, '')
        .replace(/\s*\(preposition\)\s*/ig, '')
        .replace(/\s*\(pronoun\)\s*/ig, '')
        .replace(/\s*\(conjunction\)\s*/ig, '')
        .replace(/\s*\(interjection\)\s*/ig, '')
        // Удаляем любые скобочные пометки, НЕ отбрасывая остальной текст
        .replace(/\s*\([^)]*\)\s*/g, ' ')
        .replace(/^the word[\s\S]*translated as[\s:]*/i, '')
        .replace(/^словосочетание[\s\S]*переводится как[\s:]*/i, '')
        .replace(/^слово[\s\S]*переводится как[\s:]*/i, '')
        .replace(/^.*?это[\s:]*/i, '')
        .replace(/^.*?означает[\s:]*/i, '')
        .replace(/^.*?means[\s:]*/i, '')
        .replace(/^the translation is[\s:]*/i, '')
        .trim();

      // Попытка собрать несколько вариантов, если модель вернула список построчно
      const lines = normalized.split(/\n+/).map(l => l.trim()).filter(Boolean);
      let variants: string[] = [];

      if (lines.length > 1) {
        // Часто модели выдают варианты списком — убираем нумерацию и соединяем
        for (const line of lines) {
          const noIndex = line
            .replace(/^[-–•\u2022\*\u00B7]?\s*/, '') // маркеры буллетов
            .replace(/^\d+\s*[\.)-]\s*/, '')         // 1) 1. 1- и т.п.
            .trim();
          if (noIndex) variants.push(noIndex);
        }
      }

      if (variants.length === 0 && normalized) {
        // Пытаемся разбить по типовым разделителям (/, ;, |, or, или)
        const parts = normalized
          .split(/\s*(?:,|\/|;|\||\bor\b|\bили\b)\s*/i)
          .map(p => p.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          variants = parts;
        } else if (parts.length === 1) {
          variants = [parts[0]];
        }
      }

      // Нормализуем/фильтруем варианты
      variants = Array.from(new Set(variants.map(v => v.replace(/^["']|["']$/g, '').trim())));

      // Ограничиваем длину вариантов для слов/кратких фраз
      const MAX_TRANSLATION_WORDS = 8;
      variants = variants.map(v => {
        const words = v.split(/\s+/);
        const originalWords = text.split(/\s+/).length;
        if (words.length > MAX_TRANSLATION_WORDS && !(originalWords <= 5 || words.length <= originalWords * 2)) {
          return words.slice(0, MAX_TRANSLATION_WORDS).join(' ');
        }
        return v;
      });

      // Максимум 3 наиболее коротких/адекватных варианта
      variants = variants
        .filter(v => v.length > 0)
        .sort((a, b) => a.length - b.length)
        .slice(0, 3);

      // Если ничего не получилось распарсить — вернем первую строку как есть
      let cleanedTranslation = variants.length > 0 ? variants.join(', ') : (normalized.split('\n')[0] || '').trim();

      if (!cleanedTranslation && response) {
        cleanedTranslation = (response.split('\n')[0] || '').trim();
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
    sourceLanguage?: string,
    abortSignal?: AbortSignal
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
      
      const response = await this.sendRequest(finalPrompt, { signal: abortSignal });
      
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
            const hint = sourceLanguage ? ` Source text language (ISO 639-1): ${sourceLanguage}. Translate strictly from ${sourceLanguage} to ${translateToLanguage}.` : '';
            translatedExample = await this.translateText(example, translateToLanguage, hint, abortSignal);
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
    customInstructions: string = '',
    sourceLanguage?: string,
    abortSignal?: AbortSignal
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
      const basePrompt = this.getPrompts().imageDescription(word, sourceLanguage);
      const finalPrompt = customInstructions 
        ? `${basePrompt} ${customInstructions}` 
        : basePrompt;
      
      const response = await this.sendRequest(finalPrompt, { signal: abortSignal });
      
      if (!response) {
        tracker.errorRequest(requestId);
        throw new Error("Failed to generate image description. Please try again.");
      }
      
      let description = this.extractPlainText(response) || response;
      
      // If sourceLanguage provided, translate description and cache it
      if (sourceLanguage) {
        const cacheKey = getImagePromptCacheKey(sourceLanguage, description);
        const cached = loadCachedPrompt(cacheKey);
        if (cached) {
          description = cached;
        } else {
          try {
            const translated = await this.translateText(description, sourceLanguage, '', abortSignal);
            if (translated) {
              description = translated;
              saveCachedPrompt(cacheKey, translated);
            }
          } catch (e) {
            // If translation fails, keep original description
            console.warn('Image prompt translation failed, using original description');
          }
        }
      }
      
      tracker.completeRequest(requestId);
      return description;
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
    text: string,
    abortSignal?: AbortSignal
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
      
      const response = await this.sendRequest(prompt, { signal: abortSignal });
      
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
  private readonly baseUrl: string = 'https://api.openai.com/v1';
  
  constructor(apiKey: string, modelName: string = 'gpt-5-nano') {
    super(apiKey, modelName);
  }
  
  protected async sendRequest(prompt: string, options: any = {}): Promise<string | null> {
    try {
      if (!this.apiKey) {
        throw new Error('OpenAI API key is missing. Please check your settings.');
      }

      const { messages, model, signal, ...restOptions } = options || {};

      const body = {
        model: model || this.modelName,
        messages: (messages as ChatMessage[] | undefined) ?? [
          { role: 'user' as const, content: prompt },
        ],
        ...restOptions,
      };

      const response = await backgroundFetch(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        signal
      );

      const data = await response.json();

      if (!response.ok) {
        if (data?.error) {
          const errorMessage = formatOpenAIErrorMessage(data);

          if (data.error.code === 'insufficient_quota' || response.status === 429) {
            cacheQuotaExceededError(errorMessage);
          }

          throw new Error(errorMessage);
        }

        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      return data.choices?.[0]?.message?.content?.trim() || null;
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

      if (!this.apiKey) {
        throw new Error('OpenAI API key is missing. Please check your settings.');
      }

      const noTextRule = ' no text, no letters, no numbers, no captions, no signs, no logos, no watermarks, no typography, no written content.';
      const finalPrompt = `${description}${noTextRule}`;
      const response = await backgroundFetch(
        `${this.baseUrl}/images/generations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: 'dall-e-3',
            prompt: finalPrompt,
            n: 1,
            size: '1024x1024',
            response_format: 'url',
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data?.error) {
          const errorMessage = formatOpenAIErrorMessage(data);

          if (data.error.code === 'insufficient_quota' || response.status === 429) {
            cacheQuotaExceededError(errorMessage);
          }

          tracker.errorRequest(requestId);
          throw new Error(errorMessage);
        }

        tracker.errorRequest(requestId);
        throw new Error(`OpenAI image API error: ${response.status} ${response.statusText}`);
      }

      const imageUrl = data?.data?.[0]?.url || null;
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
  public async getOptimizedImageUrl(word: string, customInstructions: string = '', sourceLanguage?: string, abortSignal?: AbortSignal): Promise<string | null> {
    const { getOptimizedImageUrl } = await import('./openaiApi');
    
    try {
      return await getOptimizedImageUrl(this.apiKey, word, customInstructions, sourceLanguage, abortSignal);
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
    messages: Array<{role: string, content: string}>,
    trackingInfo?: {
      title?: string;
      subtitle?: string; 
      icon?: string;
      color?: string;
    }
  ): Promise<{content: string} | null> {
    // Track API request with custom or default tracking info
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      trackingInfo?.title || 'Generating content',
      trackingInfo?.subtitle || 'AI is processing your request',
      trackingInfo?.icon || '🤖',
      trackingInfo?.color || '#3B82F6'
    );

    try {
      tracker.setInProgress(requestId);
      if (!this.apiKey) {
        throw new Error('OpenAI API key is missing. Please check your settings.');
      }
      const formattedMessages: ChatMessage[] = messages.map(msg => ({
        role: msg.role as ChatMessage['role'],
        content: msg.content,
      }));

      const response = await backgroundFetch(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            messages: formattedMessages,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        if (data?.error) {
          const errorMessage = formatOpenAIErrorMessage(data);
          if (data.error.code === 'insufficient_quota' || response.status === 429) {
            cacheQuotaExceededError(errorMessage);
          }
          tracker.errorRequest(requestId);
          throw new Error(errorMessage);
        }

        tracker.errorRequest(requestId);
        throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
      }

      const content = data.choices?.[0]?.message?.content?.trim() || '';
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
      
      const response = await backgroundFetch(
        `${this.apiBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
            ...options,
          }),
        },
        options?.signal
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(formatErrorMessage('Groq API Error', response.status, data));
      }

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
    messages: Array<{role: string, content: string}>,
    trackingInfo?: {
      title?: string;
      subtitle?: string; 
      icon?: string;
      color?: string;
    }
  ): Promise<{content: string} | null> {
    // Track API request with custom or default tracking info
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      trackingInfo?.title || 'Generating content',
      trackingInfo?.subtitle || 'AI is processing your request',
      trackingInfo?.icon || '🤖',
      trackingInfo?.color || '#3B82F6'
    );

    try {
      tracker.setInProgress(requestId);
      if (!this.apiKey) {
        throw new Error("Groq API key is missing. Please check your settings.");
      }
      
      const response = await backgroundFetch(
        `${this.apiBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.modelName,
            messages,
          }),
        }
      );

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(formatErrorMessage('Groq API Error', response.status, data));
      }
      
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
