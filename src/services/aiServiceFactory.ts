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
    customPrompt?: string,
    sourceLanguage?: string
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
      customPrompt: string = '',
      sourceLanguage?: string
    ): Promise<Array<[string, string | null]>> => {
      const aiProvider = createAIProvider(provider, apiKey);
      return aiProvider.getExamples(word, translateToLanguage, translate, customPrompt, sourceLanguage);
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
  sourceLanguage?: string
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
      sourceLanguage
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

// Создаем функцию для получения лингвистического описания
export async function createLinguisticInfo(
    aiService: AIService,
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string = 'ru' // Добавляем параметр языка пользователя
): Promise<string | null> {
    try {
        console.log(`Creating linguistic info for "${text}" in ${sourceLanguage}, interface: ${userLanguage}`);
        
        const prompt = createLinguisticPrompt(text, sourceLanguage, userLanguage);
        
        // Используем createChatCompletion вместо sendRequest
        const completion = await aiService.createChatCompletion(apiKey, [
            {
                role: "user",
                content: prompt
            }
        ]);
        
        if (!completion || !completion.content) {
            return null;
        }
        
        // Простая очистка HTML тегов, если нужно
        let cleanedResponse = completion.content;
        if (cleanedResponse.includes('<')) {
            // Базовая очистка HTML, если есть теги
            cleanedResponse = cleanedResponse;
        }
        
        console.log('Generated linguistic info length:', cleanedResponse?.length || 0);
        return cleanedResponse;
    } catch (error) {
        console.error('Error creating linguistic info:', error);
        return null;
    }
}

// Вспомогательная функция для создания промпта с учетом особенностей языка
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
    
    const basePrompt = `You are a professional linguist creating grammar references for language learners.

⚠️ CRITICAL LANGUAGE REQUIREMENTS ⚠️
1. ONLY analyze the SOURCE TERM "${text}" in "${sourceLanguage}" language
2. DO NOT analyze any translation - ONLY the ORIGINAL TERM
3. ALL interface labels and grammatical terms MUST be in ${langConfig.name} ONLY
4. Base forms of words should be in the source language "${sourceLanguage}"
5. NEVER mix languages - use ONLY ${langConfig.name} throughout

${langConfig.name} LANGUAGE REQUIREMENTS:
- Use ONLY ${langConfig.name} grammatical terms: ${langConfig.terms}
- Use ONLY ${langConfig.name} gender terms: ${langConfig.gender}
- Use ONLY ${langConfig.name} number terms: ${langConfig.number}
- Use ONLY ${langConfig.name} tense terms: ${langConfig.tense}
- Use ONLY ${langConfig.name} case terms: ${langConfig.case}
- Use ONLY ${langConfig.name} person terms: ${langConfig.person}

FORBIDDEN TERMS:
❌ Never use: ${langConfig.forbidden}
✅ Always use: ${langConfig.terms}

USE EMOJI SYMBOLS FOR CATEGORIES:
📚 For part of speech
🏠 For root/base form (ONLY if current word is NOT in its base form)
⚥ For gender
📋 For number/form
🎯 For case
🕒 For tense/aspect
👤 For person
🎭 For mood
🔄 For voice
📐 For degree
⚠️ For irregular forms

HTML STRUCTURE:
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>${langConfig.labels.partOfSpeech}:</strong> <span class="grammar-tag tag-pos">[${langConfig.name} term]</span>
</div>

EXAMPLE CORRECT OUTPUT (${langConfig.name} interface):
<div class="grammar-item">
  <span class="icon-pos">📚</span> <strong>${langConfig.labels.partOfSpeech}:</strong> <span class="grammar-tag tag-pos">${langConfig.terms.split(',')[0].trim()}</span>
</div>
<div class="grammar-item">
  <span class="icon-root">🏠</span> <strong>${langConfig.labels.baseForm}:</strong> <span class="grammar-tag tag-root">[word in source language]</span>
</div>
<div class="grammar-item">
  <span class="icon-gender">⚥</span> <strong>${langConfig.labels.gender}:</strong> <span class="grammar-tag tag-gender">${langConfig.gender.split(',')[0].trim()}</span>
</div>

EXAMPLE WRONG OUTPUT (DO NOT DO THIS):
❌ <strong>Part of speech:</strong> <span>Noun</span>
❌ <strong>Gender:</strong> <span>Feminine</span>
❌ <strong>Case:</strong> <span>Nominative</span>
❌ <strong>Number/Form:</strong> <span>Singular</span>

MANDATORY REQUIREMENTS:
1. Maximum 4-6 grammar points
2. Each tag content: maximum 3-4 words
3. Include comprehensive grammatical information
4. Use ONLY ${langConfig.name} language throughout
5. Be thorough but concise
6. Include base form ONLY if current word is NOT in its base form
7. ALL labels and terms must be in ${langConfig.name} consistently

CRITICAL: Your response must be 100% in ${langConfig.name} for all grammatical terms and labels. No mixing of languages allowed.`;

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

// Итеративная функция для создания и валидации лингвистической информации
export async function createValidatedLinguisticInfo(
    aiService: AIService,
    apiKey: string,
    text: string,
    sourceLanguage: string,
    userLanguage: string = 'ru',
    maxAttempts: number = 5
): Promise<{linguisticInfo: string | null; wasValidated: boolean; attempts: number}> {
    let attempts = 0;
    let currentLinguisticInfo: string | null = null;
    
    console.log(`Starting iterative creation of linguistic info for "${text}" (max ${maxAttempts} attempts)`);
    
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
            
            // 2. Валидируем созданную информацию
            const validation = await validateLinguisticInfo(
                aiService,
                apiKey,
                text,
                currentLinguisticInfo,
                sourceLanguage,
                userLanguage
            );
            
            // 3. Если валидация прошла успешно - возвращаем результат
            if (validation.isValid) {
                console.log(`Validation passed on attempt ${attempts}`);
                return {
                    linguisticInfo: currentLinguisticInfo,
                    wasValidated: true,
                    attempts
                };
            }
            
            // 4. Если есть ошибки и рекомендации - пытаемся исправить
            if (validation.errors.length > 0) {
                console.log(`Validation failed on attempt ${attempts}:`, validation.errors);
                
                if (validation.corrections && validation.corrections.length > 0 && attempts < maxAttempts) {
                    console.log(`Attempting correction on attempt ${attempts}...`);
                    
                    const correctedInfo = await correctLinguisticInfo(
                        aiService,
                        apiKey,
                        text,
                        currentLinguisticInfo,
                        validation.errors,
                        validation.corrections,
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
                    attempts
                };
            }
            
        } catch (error) {
            console.error(`Error on attempt ${attempts}:`, error);
            
            // Если это последняя попытка, возвращаем null
            if (attempts >= maxAttempts) {
                return {
                    linguisticInfo: null,
                    wasValidated: false,
                    attempts
                };
            }
        }
    }
    
    // Fallback (не должно достигаться)
    return {
        linguisticInfo: currentLinguisticInfo,
        wasValidated: false,
        attempts
    };
} 