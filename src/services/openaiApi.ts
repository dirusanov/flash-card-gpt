import { backgroundFetch } from './backgroundFetch';
import { getGlobalApiTracker } from './apiTracker';
import { getLanguageEnglishName } from './languageNames';
import { getImagePromptCacheKey, loadCachedPrompt, saveCachedPrompt } from './promptCache';

// Image style handling
type ImageStyle = 'photorealistic' | 'painting';
const DEFAULT_IMAGE_STYLE: ImageStyle = 'photorealistic';
const OPENAI_IMAGE_MODEL = 'gpt-image-1';
const OPENAI_IMAGE_SIZE = '1024x1024';

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

const isContentPolicyViolation = (errorPayload: any, messageFallback: string = ''): boolean => {
  const type = (errorPayload?.error?.type || '').toString().toLowerCase();
  const code = (errorPayload?.error?.code || '').toString().toLowerCase();
  const message = ((errorPayload?.error?.message || messageFallback) || '').toString().toLowerCase();

  return (
    code.includes('content_policy_violation') ||
    type.includes('image_generation_user_error') ||
    message.includes('content policy') ||
    message.includes('safety system') ||
    message.includes('policy violation')
  );
};

const buildPolicySafeImagePrompt = (prompt: string): string => {
  const normalized = (prompt || '').trim();
  return `Create a simple, neutral, family-friendly educational illustration of: ${normalized}. Keep it non-graphic, non-sexual, non-violent, and without real persons, minors, hate symbols, weapons, drugs, logos, or brand characters.`;
};

const buildImageDescriptionInstruction = (word: string, sourceLanguage?: string): string => {
  const langName = getLanguageEnglishName(sourceLanguage || null);
  const langHint = sourceLanguage
    ? ` The source word language: code=${sourceLanguage}${langName ? `, name=${langName}` : ''}. Interpret the meaning of "${word}" strictly in this language only.`
    : '';

  return `You write prompts for flashcard illustrations.${langHint}
Convert "${word}" into one short visual scene for a study card.
Return ONLY the visual scene description.
Rules:
- Exactly one sentence
- 8 to 30 words
- If the concept is concrete, show it directly and clearly
- If the concept is abstract, do NOT show the written word itself; instead describe an associative real-world scene with people, objects, actions, facial expressions, lighting, or atmosphere that conveys the meaning
- For abstract concepts, prefer ordinary visual metaphors and emotional context, not fantasy symbols or text
- One clear main subject or one clear scene
- Add only a simple relevant setting if it improves recognition
- Make the scene recognizable instantly at small card size
- Include setting/composition/lighting only if it improves clarity
- No explanations, no apologies, no disclaimers
- No assistant-style phrasing
- Do not mention AI, prompts, policy, or inability
- Never put the target word itself in the image
- No text in image, no letters, no captions, no logos, no watermarks`;
};

const buildAbstractImageAgentInstruction = (word: string, sourceLanguage?: string): string => {
  const langName = getLanguageEnglishName(sourceLanguage || null);
  const langHint = sourceLanguage
    ? ` The source word language: code=${sourceLanguage}${langName ? `, name=${langName}` : ''}. Interpret "${word}" strictly in this language only.`
    : '';

  return `You are a specialized abstract-image prompt agent for flashcards.${langHint}
Task: turn the abstract word or phrase "${word}" into one clear associative real-world scene for image generation.
Return ONLY one final image prompt sentence.
Rules:
- The concept is abstract, so do not depict the written word itself
- Use an everyday real-world scene, not fantasy symbols
- Convey the meaning through people, objects, actions, posture, facial expression, lighting, weather, distance, space, or atmosphere
- Choose one central moment that communicates the concept instantly
- Keep the scene literal enough to understand, but associative rather than dictionary-illustrative
- Prefer emotionally readable situations over decorative imagery
- No text in the image, no letters, no signage, no captions, no logos, no watermarks
- No explanations, no meta text, no labels, no markdown
- One sentence only
- 12 to 32 words
- Optimize for a small study card thumbnail`;
};

// Simple cache to prevent API spam when quota is exceeded
let quotaExceededCache: { timestamp: number; message: string; notificationShown: boolean } | null = null;
const QUOTA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const isAbortLikeError = (error: unknown): boolean => {
  if (!error) return false;
  if (error instanceof DOMException && error.name === 'AbortError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|aborted|cancelled|canceled/i.test(message);
};

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
      model: 'gpt-5-nano',
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
    if (!isAbortLikeError(error)) {
      console.error('Error during translation:', error);
    }
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

export const getOpenAiSpeechAudioDataUrl = async (
  apiKey: string,
  text: string,
  _sourceLanguage?: string,
  abortSignal?: AbortSignal
): Promise<string | null> => {
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Generating pronunciation audio',
    `Creating audio for "${text}"`,
    '🔊',
    '#06B6D4'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error('OpenAI API key is missing. Please check your settings.');
    }

    const normalizedText = (text || '').trim();
    if (!normalizedText) {
      tracker.errorRequest(requestId);
      throw new Error('No text provided for audio generation.');
    }

    tracker.setInProgress(requestId);

    const response = await backgroundFetch(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          voice: 'alloy',
          input: normalizedText,
          response_format: 'mp3',
        }),
        responseType: 'dataUrl',
      },
      abortSignal
    );

    if (!response.ok) {
      let errorData: any = null;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      if (errorData && errorData.error) {
        const errorMessage = formatOpenAIErrorMessage(errorData);
        if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }
        tracker.errorRequest(requestId);
        throw new Error(errorMessage);
      }

      tracker.errorRequest(requestId);
      throw new Error(`OpenAI TTS API error: ${response.status} ${response.statusText}`);
    }

    const audioDataUrl = await response.text();
    if (!audioDataUrl || !audioDataUrl.startsWith('data:audio')) {
      tracker.errorRequest(requestId);
      throw new Error('OpenAI TTS response did not contain audio data.');
    }

    tracker.completeRequest(requestId);
    return audioDataUrl;
  } catch (error) {
    tracker.errorRequest(requestId);
    if (!isAbortLikeError(error)) {
      console.error('Error during speech generation:', error);
    }
    throw error;
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
  
  const basePrompt = translate
    ? `Create exactly 3 natural example sentences using the word '${word}' in its original language.
Then translate each sentence to ${translateToLanguage}.
Return exactly 3 lines in this strict format:
[original sentence] || [translated sentence]
Rules:
- No numbering
- No bullets
- No extra text
- Keep each line as one source sentence and one translated sentence separated by "||"`
    : `Give me three example sentences using the word '${word}' in the original language (the language of this word). 
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
    model: 'gpt-5-nano',
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
    const examples: string[] = resultText?.trim().split('\n') ?? [];
    let resultExamples: Array<[string, string | null]> = [];

    if (translate) {
      const parsedBilingualExamples = examples
        .map((line: string) => line.trim())
        .filter(Boolean)
        .map((line: string) => {
          const normalizedLine = line.replace(/^\d+\s*[\.)-]\s*/, '').trim();
          const separatorIndex = normalizedLine.indexOf('||');
          if (separatorIndex === -1) {
            return null;
          }
          const original = normalizedLine.slice(0, separatorIndex).trim().replace(/^["']|["']$/g, '');
          const translated = normalizedLine.slice(separatorIndex + 2).trim().replace(/^["']|["']$/g, '');
          if (!original || !translated) {
            return null;
          }
          return [original, translated] as [string, string];
        })
        .filter((item): item is [string, string] => item !== null)
        .slice(0, 3);

      if (parsedBilingualExamples.length > 0) {
        resultExamples = parsedBilingualExamples;
      }
    }

    if (resultExamples.length === 0) {
      const cleanedExamples = examples.filter((example: string) => !!example.trim());
      resultExamples = await Promise.all(
        cleanedExamples.map(async (example: string): Promise<[string, string | null]> => {
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

          return [example, translatedExample];
        })
      );
    }

    if (resultExamples.length === 0) {
      tracker.errorRequest(requestId);
      throw new Error("Could not generate examples. Please try again with a different word or check your API key.");
    }

    tracker.completeRequest(requestId);
    return resultExamples;
  } catch (error) {
    if (!isAbortLikeError(error)) {
      console.error('Error during getting examples:', error);
    }
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
    model: 'gpt-5-nano',
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

  const isAbstractWord = await isAbstract(apiKey, word, sourceLanguage);
  const basePrompt = isAbstractWord
    ? buildAbstractImageAgentInstruction(word, sourceLanguage)
    : buildImageDescriptionInstruction(word, sourceLanguage);
  const finalPrompt = customInstructions
    ? `${basePrompt}\nAdditional visual style requirements: ${customInstructions}`
    : basePrompt;

  const promptMessages = [
    {
      role: 'system',
      content: 'Return only a concise visual description suitable for an image model.',
    },
    {
      role: 'user',
      content: finalPrompt,
    },
  ];

  const body = {
    model: 'gpt-5-nano',
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

export const getAbstractImagePromptAgent = async (
  apiKey: string,
  word: string,
  customInstructions: string = '',
  abortSignal?: AbortSignal,
  sourceLanguage?: string
): Promise<string> => {
  const tracker = getGlobalApiTracker();
  const requestId = tracker.startRequest(
    'Abstract image agent',
    `Building associative scene for "${word}"`,
    '🧠',
    '#F59E0B'
  );

  try {
    if (!apiKey) {
      tracker.errorRequest(requestId);
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }

    tracker.setInProgress(requestId);

    if (isQuotaExceededCached()) {
      tracker.errorRequest(requestId);
      throw new Error(quotaExceededCache!.message);
    }

    const basePrompt = buildAbstractImageAgentInstruction(word, sourceLanguage);
    const finalPrompt = customInstructions
      ? `${basePrompt}\nAdditional visual style requirements: ${customInstructions}`
      : basePrompt;

    const response = await backgroundFetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          messages: [
            {
              role: 'system',
              content: 'You return only a final abstract-image prompt sentence for an image model.',
            },
            {
              role: 'user',
              content: finalPrompt,
            },
          ],
        }),
      },
      abortSignal
    );

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        const errorMessage = formatOpenAIErrorMessage(errorData);
        if (errorData.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
        }
        tracker.errorRequest(requestId);
        throw new Error(errorMessage);
      }
      tracker.errorRequest(requestId);
      throw new Error(`Could not generate abstract image prompt. OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const description = data.choices[0]?.message?.content?.trim() ?? '';

    if (!description) {
      tracker.errorRequest(requestId);
      throw new Error('Could not generate a valid abstract image prompt. Please try again.');
    }

    tracker.completeRequest(requestId);
    return description;
  } catch (error) {
    console.error('Error during abstract image prompt generation:', error);
    tracker.errorRequest(requestId);
    throw error;
  }
};

const getImageUrlRequest = async (
  apiKey: string,
  description: string,
  customInstructions: string = '',
  abortSignal?: AbortSignal
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
    const retryPrompt = buildPolicySafeImagePrompt(description);
    const prompts = [finalDescription];
    if (retryPrompt && retryPrompt !== finalDescription) {
      prompts.push(retryPrompt);
    }

    let lastPolicyViolation = false;
    let lastErrorMessage = '';

    for (let i = 0; i < prompts.length; i++) {
      const currentPrompt = prompts[i];

      const response = await backgroundFetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: OPENAI_IMAGE_MODEL,
            prompt: currentPrompt,
            n: 1,
            size: OPENAI_IMAGE_SIZE,
          }),
        },
        abortSignal
      );

      const data = await response.json();

      if (response.ok) {
        const image = data?.data?.[0];
        const imageUrl = typeof image?.url === 'string' ? image.url : null;
        const imageBase64 = typeof image?.b64_json === 'string' ? image.b64_json : null;

        if (imageUrl) {
          tracker.completeRequest(requestId);
          return imageUrl as string;
        }

        if (imageBase64) {
          tracker.completeRequest(requestId);
          return `data:image/png;base64,${imageBase64}`;
        }

        if (!imageUrl && !imageBase64) {
          tracker.errorRequest(requestId);
          throw new Error('OpenAI did not return image data. Please try again.');
        }
      }

      if (data && data.error) {
        const errorMessage = formatOpenAIErrorMessage(data);
        lastErrorMessage = errorMessage;

        if (data.error.code === 'insufficient_quota' || response.status === 429) {
          cacheQuotaExceededError(errorMessage);
          throw new Error(errorMessage);
        }

        const isPolicy = isContentPolicyViolation(data, errorMessage);
        if (isPolicy && i < prompts.length - 1) {
          lastPolicyViolation = true;
          continue;
        }

        throw new Error(errorMessage);
      }

      throw new Error(`OpenAI image API error: ${response.status} ${response.statusText}`);
    }

    if (lastPolicyViolation) {
      throw new Error(
        'OpenAI content policy violation.\n\nThe image request was flagged even after safe retry. Try a more neutral prompt without sensitive details.'
      );
    }

    throw new Error(lastErrorMessage || 'Failed to generate image.');
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
  sourceLanguage?: string,
  abortSignal?: AbortSignal
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
        const description = await getAbstractImagePromptAgent(
          apiKey,
          word,
          customInstructions,
          undefined,
          sourceLanguage
        );
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
            customInstructions,
            abortSignal
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
        const result = await getImageUrlRequest(apiKey, styledPrompt, customInstructions, abortSignal);
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
  sourceLanguage?: string,
  abortSignal?: AbortSignal
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
              const translated = await translateText(apiKey, optimizedPrompt, sourceLanguage, '', abortSignal);
              if (translated) {
                optimizedPrompt = translated;
                saveCachedPrompt(key, translated);
              }
            } catch (e) {
              console.warn('Optimized image prompt translation failed, using English prompt');
            }
          }
        }

        const result = await getImageUrlRequest(apiKey, optimizedPrompt, '', abortSignal);
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
    model: 'gpt-5-nano',
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
    model: 'gpt-5-nano',
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
    model: 'gpt-5-nano',
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
