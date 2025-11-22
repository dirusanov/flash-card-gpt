import { backgroundFetch } from './backgroundFetch';
import { getGlobalApiTracker } from './apiTracker';
import { getLanguageEnglishName } from './languageNames';
import { getImagePromptCacheKey, loadCachedPrompt, saveCachedPrompt } from './promptCache';

// Image style handling
type ImageStyle = 'photorealistic' | 'painting';
const DEFAULT_IMAGE_STYLE: ImageStyle = 'photorealistic';

// Try to infer style preference from custom instructions (supports EN/RU keywords)
const detectImageStyle = (customInstructions: string | undefined | null): ImageStyle | null => {
  if (!customInstructions) return null;
  const text = customInstructions.toLowerCase();
  // Photorealistic keywords
  const photoMatch = /photoreal(?:istic)?|photo[-\s]?real|realistic|фотореал|фото\s?реал|реалистич/iu.test(text);
  if (photoMatch) return 'photorealistic';
  // Painting keywords (oil, watercolor etc.)
  const paintingMatch = /painting|painted|oil\s?painting|watercolor|brush|canvas|illustration|живопис|картина|маслом|акварел/iu.test(text);
  if (paintingMatch) return 'painting';
  return null;
};

// Simple cache to prevent API spam when quota is exceeded
let quotaExceededCache: { timestamp: number; message: string; notificationShown: boolean } | null = null;
const QUOTA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Check if we recently got a quota exceeded error
export const isQuotaExceededCached = (): boolean => {
  if (!quotaExceededCache) return false;
  
  const now = Date.now();
  if (now - quotaExceededCache.timestamp > QUOTA_CACHE_DURATION) {
    quotaExceededCache = null;
    return false;
  }
  
  return true;
};

// Cache quota exceeded error
export const cacheQuotaExceededError = (message: string): void => {
  quotaExceededCache = {
    timestamp: Date.now(),
    message,
    notificationShown: false
  };
};

export const markQuotaNotificationShown = (): void => {
  if (quotaExceededCache) {
    quotaExceededCache.notificationShown = true;
  }
};

export const shouldShowQuotaNotification = (): boolean => {
  return quotaExceededCache !== null && !quotaExceededCache.notificationShown;
};

// Get cached quota error message
export const getCachedQuotaError = (): string | null => {
  return quotaExceededCache?.message || null;
};

// Хелпер-функция для форматирования сообщений об ошибках от OpenAI
export const formatOpenAIErrorMessage = (errorData: any): string => {
  if (!errorData || !errorData.error) {
    return "Unknown OpenAI API error";
  }
  
  const { message, type, code } = errorData.error;
  const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';

  let formattedMessage = "";

  // Основная часть сообщения об ошибке
  if (code === "insufficient_quota") {
    formattedMessage = "Your OpenAI account has exceeded its quota.\n\nPlease check your billing details or use a different API key.";
  } else if (code === 'invalid_api_key' || normalizedMessage.includes('invalid api key') || normalizedMessage.includes('incorrect api key') || normalizedMessage.includes('api key provided is incorrect') || normalizedMessage.includes('api key is invalid')) {
    formattedMessage = "Authentication failed: Your OpenAI API key is invalid or revoked.\n\nOpen Settings and paste a valid key to continue.";
  } else if (type === "invalid_request_error") {
    formattedMessage = "Invalid request to OpenAI.\n\nPlease review your API key and request settings.";
  } else if (type === "rate_limit_exceeded") {
    formattedMessage = "OpenAI rate limit exceeded.\n\nPlease try again in a few minutes.";
  } else {
    formattedMessage = `OpenAI API Error: ${message || "Unknown error"}`;
  }
  
  // Добавляем технические детали (для разработчиков)
  formattedMessage += `\n\nDetails:\n- Type: ${type || "unknown"}\n- Code: ${code || "none"}`;
  
  return formattedMessage;
};

export const translateText = async (
  apiKey: string,
  text: string,
  translateToLanguage: string = 'ru',
  customPrompt: string = '',
  abortSignal?: AbortSignal
): Promise<string | null> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Translating text',
    `Converting your text to ${translateToLanguage}`,
    '🌍',
    '#3B82F6'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    // Mark as in progress
    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }

    const basePrompt = `Translate the following text to ${translateToLanguage}`;

    const systemPrompt = customPrompt
      ? `${basePrompt}. ${customPrompt}`
      : basePrompt;
    
    const body = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: `${text}` },
      ],

    };

    const response = await backgroundFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      abortSignal
    );

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        const errorMessage = formatOpenAIErrorMessage(errorData);
        
        // Cache quota exceeded errors to prevent spam
        if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }
        
        throw new Error(errorMessage);
      }
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    tracker.completeRequest(requestId);
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during translation:', error);
    tracker.errorRequest(requestId);
    
    // Enhanced error handling to prevent window disappearing
    if (error instanceof Error) {
      // Check for abort signal
      if (abortSignal?.aborted) {
        throw new Error('Translation cancelled by user');
      }
      
      // Check for quota errors
      if (error.message.includes('quota') || error.message.includes('insufficient_quota')) {
        throw new Error(error.message);
      }
      
      // For other errors, add context
      throw new Error(`Translation failed: ${error.message}`);
    }
    
    throw error; // Пробрасываем ошибку вверх, чтобы компонент мог ее обработать
  }
};

export const getExamples = async (
  apiKey: string,
  word: string,
  translateToLanguage: string,
  translate: boolean = false,
  customPrompt: string = '',
  abortSignal?: AbortSignal
): Promise<Array<[string, string | null]>> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Creating example sentences',
    `Generating helpful examples for "${word}"`,
    '💡',
    '#F59E0B'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }

  const processedCustomPrompt = customPrompt.replace(/\{word\}/g, word);
  
  const basePrompt = `Give me three example sentences using the word '${word}' in the original language (the language of this word). 
Each example should show natural usage of '${word}' in its native language context.
Return ONLY the examples, one per line, without any numbering, explanations, or translations.`;
  
  const systemPrompt = customPrompt 
    ? `${basePrompt} ${processedCustomPrompt}` 
    : basePrompt;
  
  const promptMessages = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ];

  const body = {
    model: 'gpt-3.5-turbo',
    messages: promptMessages,

  };

  const response = await backgroundFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    abortSignal
  );

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        const errorMessage = formatOpenAIErrorMessage(errorData);
        
        // Cache quota exceeded errors to prevent spam
        if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }
        
        throw new Error(errorMessage);
      }
      throw new Error(`Could not generate examples. OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const resultText = data.choices[0]?.message?.content;
    const examples = resultText?.trim().split('\n') ?? [];

    const resultExamples: Array<[string, string | null]> = [];

    for (const example of examples) {
      if (!example.trim()) continue; // Skip empty lines
      
      let translatedExample: string | null = null;

      if (translate) {
        try {
          translatedExample = await translateText(
            apiKey,
            example,
            translateToLanguage
          );
        } catch (translationError) {
          console.error('Error translating example:', translationError);
          // Если перевод не удался, оставляем null
        } finally {
          // Ensure we don't break the parsing
        }
      }

      resultExamples.push([example, translatedExample]);
    }

    if (resultExamples.length === 0) {
      tracker.errorRequest(requestId);
      throw new Error("Could not generate examples. Please try again with a different word or check your API key.");
    }

    tracker.completeRequest(requestId);
    return resultExamples;
  } catch (error) {
    console.error('Error during getting examples:', error);
    tracker.errorRequest(requestId);
    throw error; // Пробрасываем ошибку вверх, чтобы компонент мог ее обработать
  }
};

export const isAbstract = async (
  apiKey: string,
  word: string,
  sourceLanguage?: string
): Promise<boolean> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Analyzing word type',
    `Determining if "${word}" can be visualized`,
    '🔍',
    '#8B5CF6'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }

  const langName = getLanguageEnglishName(sourceLanguage || null);
  const langHint = sourceLanguage ? ` The word language: code=${sourceLanguage}${langName ? `, name=${langName}` : ''}. Interpret the word in this language only.` : '';
  const promptMessages = [
    {
      role: 'system',
      content: `Is the word '${word}' an abstract concept or a concrete object? Answer 'abstract' or 'concrete'.${langHint}`,
    },
  ];

  const body = {
    model: 'gpt-3.5-turbo',
    messages: promptMessages,

  };

  const response = await backgroundFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        const errorMessage = formatOpenAIErrorMessage(errorData);
        
        // Cache quota exceeded errors to prevent spam
        if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }
        
        throw new Error(errorMessage);
      }
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const answer =
      data.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    tracker.completeRequest(requestId);
    return answer === 'abstract';
  } catch (error) {
    console.error('Error during determining abstractness:', error);
    tracker.errorRequest(requestId);
    // Предполагаем, что объект конкретный, если не можем определить
    return false;
  }
};

export const getDescriptionImage = async (
  apiKey: string,
  word: string,
  customInstructions: string = '',
  abortSignal?: AbortSignal,
  sourceLanguage?: string
): Promise<string> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Crafting image description',
    `Creating detailed prompt for "${word}" visualization`,
    '🎨',
    '#EC4899'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }

  const langName2 = getLanguageEnglishName(sourceLanguage || null);
  const langHint = sourceLanguage ? ` The source word language: code=${sourceLanguage}${langName2 ? `, name=${langName2}` : ''}. Interpret the meaning of '${word}' strictly in this language; do not use meanings from other languages with similar spelling.` : '';
  const basePrompt = `Provide a detailed description for an image that represents the concept of '${word}'.${langHint}`;
  
  const finalPrompt = customInstructions 
    ? `${basePrompt}. ${customInstructions}`
    : basePrompt;

  const promptMessages = [
    {
      role: 'system',
      content: finalPrompt,
    },
  ];

  const body = {
    model: 'gpt-3.5-turbo',
    messages: promptMessages,

  };

  const response = await backgroundFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    abortSignal
  );

  if (!response.ok) {
    const errorData = await response.json();
    if (errorData && errorData.error) {
      const errorMessage = formatOpenAIErrorMessage(errorData);

      // Cache quota exceeded errors to prevent spam
      if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
        cacheQuotaExceededError(errorMessage);
      }

      tracker.errorRequest(requestId);
      throw new Error(errorMessage);
    }
    tracker.errorRequest(requestId);
    throw new Error(`Could not generate image description. OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const description = data.choices[0]?.message?.content?.trim() ?? '';

  if (!description) {
    tracker.errorRequest(requestId);
    throw new Error("Could not generate a valid image description. Please try again.");
  }

  tracker.completeRequest(requestId);
  return description;
} catch (error) {
  console.error('Error during getting description image:', error);
  tracker.errorRequest(requestId);
  throw error;
}
};

const getImageUrlRequest = async (
  apiKey: string,
  description: string,
  customInstructions: string = ''
): Promise<string | null> => {
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Generating image',
    `Creating beautiful illustration with AI`,
    '🖼️',
    '#6366F1'
  );

  try {
    tracker.setInProgress(requestId);

    const finalDescription = customInstructions
      ? `${description}. ${customInstructions}`
      : description;

    const response = await backgroundFetch(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: finalDescription,
          n: 1,
          size: '1024x1024',
          response_format: 'url',
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      if (data && data.error) {
        const errorMessage = formatOpenAIErrorMessage(data);

        if (data.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }

        throw new Error(errorMessage);
      }

      throw new Error(`OpenAI image API error: ${response.status} ${response.statusText}`);
    }

    if (!data?.data?.[0]?.url) {
      tracker.errorRequest(requestId);
      throw new Error('OpenAI did not return an image URL. Please try again.');
    }

    tracker.completeRequest(requestId);
    return data.data[0].url as string;
  } catch (error) {
    console.error('Error during image generation:', error);
    tracker.errorRequest(requestId);

    if (error instanceof Error) {
      const message = error.message || '';
      const normalized = message.toLowerCase();

      if (normalized.includes('quota') || normalized.includes('billing')) {
        const quotaError = "Your OpenAI account has exceeded its quota.\n\nPlease check your billing details or use a different API key.";
        cacheQuotaExceededError(quotaError);
        throw new Error(quotaError);
      }

      if (normalized.includes('rate limit')) {
        throw new Error('OpenAI rate limit exceeded.\n\nPlease try again in a few minutes.');
      }

      if (normalized.includes('invalid api key') || normalized.includes('incorrect api key') || normalized.includes('api key provided is incorrect') || normalized.includes('api key is invalid')) {
        throw new Error('Authentication failed: Your OpenAI API key is invalid or revoked.\n\nOpen Settings and paste a valid key to continue.');
      }

      if (normalized.includes('moderation') || normalized.includes('policy')) {
        throw new Error('OpenAI content policy violation.\n\nThe image request was flagged for content policy violation. Please modify your request.');
      }
    }

    throw error instanceof Error ? error : new Error('Failed to generate image.\n\nPlease check your OpenAI API key and try again.');
  }
};

export const getOpenAiImageUrl = async (
  apiKey: string,
  word: string,
  customInstructions: string = '',
  sourceLanguage?: string
): Promise<string | null> => {
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating custom image',
      `Generating visual for "${word}"`,
      '🖼️',
      '#6366F1'
    );

    try {
        if (!apiKey) {
          tracker.errorRequest(requestId);
          throw new Error("OpenAI API key is missing. Please check your settings.");
        }

        tracker.setInProgress(requestId);

        // Check if we recently got a quota exceeded error
        if (isQuotaExceededCached()) {
          tracker.errorRequest(requestId);
          throw new Error(quotaExceededCache!.message);
        }
    
        const isAbstractWord = await isAbstract(apiKey, word, sourceLanguage);
        const resolvedStyle: ImageStyle = detectImageStyle(customInstructions) || DEFAULT_IMAGE_STYLE;

    if (isAbstractWord) {
        // Generate description and ensure it's in sourceLanguage via getDescriptionImage
        const description = await getDescriptionImage(apiKey, word, customInstructions, undefined, sourceLanguage);
        // Build style-consistent prompt when we control the language; otherwise rely on description + custom instructions
        const promptForImage = sourceLanguage
          ? description
          : (
              resolvedStyle === 'painting'
                ? `Create a high-quality painting-style image representing the concept of '${description}', with visible brush strokes and rich textures`
                : `Create a high-quality, photorealistic image that visually represents the concept of '${description}', using real-world objects and natural lighting`
            );
        const result = await getImageUrlRequest(
            apiKey,
            promptForImage,
            customInstructions
        );
        tracker.completeRequest(requestId);
        return result;
    } else {
        const name = getLanguageEnglishName(sourceLanguage || null);
        const langNote = sourceLanguage ? ` The source word language: code=${sourceLanguage}${name ? `, name=${name}` : ''}. Interpret '${word}' in this language only.` : '';
        let styledPrompt = (
          resolvedStyle === 'painting'
            ? `Create a detailed painting-style image of a ${word} with clear composition and visible brush strokes.${langNote}`
            : `Create a high-quality, photorealistic image of a ${word} with natural lighting and clear details on a neutral background.${langNote}`
        );
        // Translate and cache the image prompt if we have a source language
        if (sourceLanguage) {
          const key = getImagePromptCacheKey(sourceLanguage, styledPrompt);
          const cached = loadCachedPrompt(key);
          if (cached) {
            styledPrompt = cached;
          } else {
            try {
              const translated = await translateText(apiKey, styledPrompt, sourceLanguage);
              if (translated) {
                styledPrompt = translated;
                saveCachedPrompt(key, translated);
              }
            } catch (e) {
              console.warn('Image prompt translation failed, using English prompt');
            }
          }
        }
        const result = await getImageUrlRequest(apiKey, styledPrompt, customInstructions);
        tracker.completeRequest(requestId);
        return result;
    }
} catch (error) {
    console.error('Error during getting image for word:', error);
    tracker.errorRequest(requestId);
    throw error;
}
};

// ОПТИМИЗИРОВАННАЯ ФУНКЦИЯ: Прямая генерация изображения без дополнительных запросов
export const getOptimizedImageUrl = async (
  apiKey: string,
  word: string,
  customInstructions: string = '',
  sourceLanguage?: string
): Promise<string | null> => {
    // Track API request
    const tracker = getGlobalApiTracker();
    const requestId = tracker.startRequest(
      'Creating optimized image',
      `Fast generation for "${word}"`,
      '🖼️',
      '#6366F1'
    );

    try {
        if (!apiKey) {
          tracker.errorRequest(requestId);
          throw new Error("OpenAI API key is missing. Please check your settings.");
        }

        tracker.setInProgress(requestId);

        // Check if we recently got a quota exceeded error
        if (isQuotaExceededCached()) {
          tracker.errorRequest(requestId);
          throw new Error(quotaExceededCache!.message);
        }
    
        // Consistent style prompt for both abstract and concrete concepts
        const langName3 = getLanguageEnglishName(sourceLanguage || null);
        const langNote = sourceLanguage ? ` The source word language: code=${sourceLanguage}${langName3 ? `, name=${langName3}` : ''}. Interpret '${word}' strictly in this language.` : '';
        const resolvedStyle: ImageStyle = detectImageStyle(customInstructions) || DEFAULT_IMAGE_STYLE;

        const likelyAbstract = (/^[A-Z]/.test(word) || word.length > 15);

        let optimizedPrompt = '';
        if (resolvedStyle === 'painting') {
          optimizedPrompt = likelyAbstract
            ? `Create a high-quality painting-style image that clearly represents the concept of "${word}", with visible brush strokes and rich textures.${langNote}`
            : `Create a detailed painting-style image of "${word}" with clear composition and artistic lighting.${langNote}`;
        } else {
          optimizedPrompt = likelyAbstract
            ? `Create a high-quality, photorealistic image that visually represents the concept of "${word}", using real-world objects, natural lighting, and realistic materials.${langNote}`
            : `Create a high-quality, photorealistic image of "${word}" with natural lighting and clear details on a neutral background.${langNote}`;
        }
        
        if (customInstructions) {
          optimizedPrompt += ` ${customInstructions}`;
        }

        // Translate and cache optimized prompt if source language is available
        if (sourceLanguage) {
          const key = getImagePromptCacheKey(sourceLanguage, optimizedPrompt);
          const cached = loadCachedPrompt(key);
          if (cached) {
            optimizedPrompt = cached;
          } else {
            try {
              const translated = await translateText(apiKey, optimizedPrompt, sourceLanguage);
              if (translated) {
                optimizedPrompt = translated;
                saveCachedPrompt(key, translated);
              }
            } catch (e) {
              console.warn('Optimized image prompt translation failed, using English prompt');
            }
          }
        }

        const result = await getImageUrlRequest(apiKey, optimizedPrompt, '');
        tracker.completeRequest(requestId);
        return result;
        
    } catch (error) {
        console.error('Error during optimized image generation:', error);
        tracker.errorRequest(requestId);
        throw error;
    }
};

const getLangaugeNameText = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Detecting language',
    `Identifying the language of your text`,
    '🔤',
    '#8B5CF6'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }
  
  const body = {
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are langauage expert' },
      {
        role: 'user',
        content: `What is the name of this language: ${text}. Give only name of this language in one word`,
      },
    ],

  };

  const response = await backgroundFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        const errorMessage = formatOpenAIErrorMessage(errorData);
        
        // Cache quota exceeded errors to prevent spam
        if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }
        
        throw new Error(errorMessage);
      }
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    tracker.completeRequest(requestId);
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during language name detection:', error);
    tracker.errorRequest(requestId);
    throw error; // Propagate error instead of returning null
  }
};

export const generateAnkiFront = async (
  apiKey: string,
  text: string,
  abortSignal?: AbortSignal
): Promise<string | null> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Creating question',
    `Crafting an effective question for your flashcard`,
    '❓',
    '#10B981'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }
  
  const langauage = await getLangaugeNameText(apiKey, text);

  const body = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You generate a question based on the text entered. You answer should be in ${langauage}`,
      },
      {
        role: 'user',
        content: `Give a main question of this text: ${text}'. You answer should be in ${langauage}`,
      },
    ],

  };

  const response = await backgroundFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    abortSignal
  );

    const data = await response.json();
    tracker.completeRequest(requestId);
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error(
      'Error during generating front side of the Anki card:',
      error
    );
    tracker.errorRequest(requestId);
    return null;
  }
};

export const generateAnkiBack = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  // Track API request
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Creating answer',
    `Developing comprehensive answer for your card`,
    '📖',
    '#F59E0B'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    // Check if we recently got a quota exceeded error
    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }
  
  const langauage = await getLangaugeNameText(apiKey, text);

  const body = {
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You generate a key point based on the text entered. For back of flash card. You answer should be in ${langauage}`,
      },
      {
        role: 'user',
        content: `Anilize text. Highlight the key points from this text. Put them in a list of senteses with dash points.
                                Text: '${text}'. You answer should be in ${langauage}. Key points should be competed and make sence`,
      },
    ],

  };

  const response = await backgroundFetch(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }
  );

    const data = await response.json();
    tracker.completeRequest(requestId);
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during generating back side of the Anki card:', error);
    tracker.errorRequest(requestId);
    return null;
  }
};
