import { OpenAI } from 'openai';

// Хелпер-функция для форматирования сообщений об ошибках от OpenAI
const formatOpenAIErrorMessage = (errorData: any): string => {
  if (!errorData || !errorData.error) {
    return "Unknown OpenAI API error";
  }
  
  const { message, type, code } = errorData.error;
  
  let formattedMessage = "";
  
  // Основная часть сообщения об ошибке
  if (code === "insufficient_quota") {
    formattedMessage = "Your OpenAI account has exceeded its quota.\n\nPlease check your billing details or use a different API key.";
  } else if (type === "invalid_request_error") {
    formattedMessage = "Invalid request to OpenAI.\n\nPlease check your API key and settings.";
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
  customPrompt: string = ''
): Promise<string | null> => {
  try {
    if (!apiKey) {
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }
    
    const basePrompt = `Translate the following text to ${translateToLanguage}`;
    
    const systemPrompt = customPrompt 
      ? `${basePrompt}. ${customPrompt}`
      : basePrompt;
    
    const body = {
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: `${text}` },
      ],
      max_tokens: 900,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        throw new Error(formatOpenAIErrorMessage(errorData));
      }
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during translation:', error);
    throw error; // Пробрасываем ошибку вверх, чтобы компонент мог ее обработать
  }
};

export const getExamples = async (
  apiKey: string,
  word: string,
  translateToLanguage: string,
  translate: boolean = false,
  customPrompt: string = ''
): Promise<Array<[string, string | null]>> => {
  if (!apiKey) {
    throw new Error("OpenAI API key is missing. Please check your settings.");
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

  try {
    const body = {
      model: 'gpt-4o-mini',
      messages: promptMessages,
      max_tokens: 3500,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        throw new Error(formatOpenAIErrorMessage(errorData));
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
        }
      }

      resultExamples.push([example, translatedExample]);
    }

    if (resultExamples.length === 0) {
      throw new Error("Could not generate examples. Please try again with a different word or check your API key.");
    }

    return resultExamples;
  } catch (error) {
    console.error('Error during getting examples:', error);
    throw error; // Пробрасываем ошибку вверх, чтобы компонент мог ее обработать
  }
};

export const isAbstract = async (
  apiKey: string,
  word: string
): Promise<boolean> => {
  if (!apiKey) {
    throw new Error("OpenAI API key is missing. Please check your settings.");
  }

  const promptMessages = [
    {
      role: 'system',
      content: `Is the word '${word}' an abstract concept or a concrete object? Answer 'abstract' or 'concrete':`,
    },
  ];

  try {
    const body = {
      model: 'gpt-4o-mini',
      messages: promptMessages,
      max_tokens: 900,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        throw new Error(formatOpenAIErrorMessage(errorData));
      }
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const answer =
      data.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    return answer === 'abstract';
  } catch (error) {
    console.error('Error during determining abstractness:', error);
    // Предполагаем, что объект конкретный, если не можем определить
    return false;
  }
};

export const getDescriptionImage = async (
  apiKey: string,
  word: string,
  customInstructions: string = ''
): Promise<string> => {
  if (!apiKey) {
    throw new Error("OpenAI API key is missing. Please check your settings.");
  }

  const basePrompt = `Provide a detailed description for an image that represents the concept of '${word}'`;
  
  const finalPrompt = customInstructions 
    ? `${basePrompt}. ${customInstructions}`
    : basePrompt;

  const promptMessages = [
    {
      role: 'system',
      content: finalPrompt,
    },
  ];

  try {
    const body = {
      model: 'gpt-4o-mini',
      messages: promptMessages,
      max_tokens: 100,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        throw new Error(formatOpenAIErrorMessage(errorData));
      }
      throw new Error(`Could not generate image description. OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const description = data.choices[0]?.message?.content?.trim() ?? '';
    
    if (!description) {
      throw new Error("Could not generate a valid image description. Please try again.");
    }
    
    return description;
  } catch (error) {
    console.error('Error during getting description image:', error);
    throw error; // Пробрасываем ошибку вверх, чтобы компонент мог ее обработать
  }
};

const getImageUrlRequest = async (
  openai: OpenAI,
  description: string,
  customInstructions: string = ''
): Promise<string | null> => {
  try {
    const finalDescription = customInstructions 
      ? `${description}. ${customInstructions}`
      : description;
      
    const response = await openai.images.generate({
      prompt: finalDescription,
      n: 1,
      size: '512x512',
      response_format: 'url',
    });

    if (!response.data || !response.data[0]?.url) {
      throw new Error("OpenAI did not return an image URL. Please try again.");
    }

    return response.data[0].url;
  } catch (error) {
    console.error('Error during image generation:', error);
    
    // Проверяем, есть ли дополнительная информация об ошибке
    if (error instanceof Error) {
      const errorMessage = error.message || '';
      
      // Проверяем типичные ошибки OpenAI
      if (errorMessage.includes('quota') || errorMessage.includes('billing')) {
        throw new Error("Your OpenAI account has exceeded its quota.\n\nPlease check your billing details or use a different API key.");
      }
      
      if (errorMessage.includes('rate limit')) {
        throw new Error("OpenAI rate limit exceeded.\n\nPlease try again in a few minutes.");
      }
      
      if (errorMessage.includes('invalid API key')) {
        throw new Error("Invalid OpenAI API key.\n\nPlease check your API key in settings.");
      }
      
      // Для ошибок, связанных с модерацией контента
      if (errorMessage.includes('moderation') || errorMessage.includes('policy')) {
        throw new Error("OpenAI content policy violation.\n\nThe image request was flagged for content policy violation. Please modify your request.");
      }
      
      // Если ошибка содержит JSON с деталями
      if (errorMessage.includes('{') && errorMessage.includes('}')) {
        try {
          // Пытаемся извлечь JSON из строки ошибки
          const jsonStr = errorMessage.substring(
            errorMessage.indexOf('{'),
            errorMessage.lastIndexOf('}') + 1
          );
          const errorData = JSON.parse(jsonStr);
          if (errorData && errorData.error) {
            return formatOpenAIErrorMessage(errorData);
          }
        } catch (jsonError) {
          // Если не удалось разобрать JSON, просто используем исходное сообщение
        }
      }
      
      throw error; // Пробрасываем оригинальную ошибку, если она не подходит под известные шаблоны
    }
    
    throw new Error("Failed to generate image.\n\nPlease check your OpenAI API key and try again.");
  }
};

export const getOpenAiImageUrl = async (
  openai: OpenAI, 
  apiKey: string, 
  word: string,
  customInstructions: string = ''
): Promise<string | null> => {
    if (!apiKey) {
      throw new Error("OpenAI API key is missing. Please check your settings.");
    }
    
    try {
        const isAbstractWord = await isAbstract(apiKey, word);

        if (isAbstractWord) {
            const description = await getDescriptionImage(apiKey, word, customInstructions);
            return await getImageUrlRequest(
                openai,
                `Create a vivid, high-quality illustration representing the concept of '${description}'`,
                customInstructions
            );
        } else {
            const photorealisticPrompt = `Create a high-quality, photorealistic image of a ${word} with a neutral expression and clear features`;
            return await getImageUrlRequest(openai, photorealisticPrompt, customInstructions); 
        }
    } catch (error) {
        console.error('Error during getting image for word:', error);
        
        // Проверка типичных ошибок OpenAI
        if (error instanceof Error) {
            // Если в сообщении уже содержится пользовательское объяснение, передаем его дальше
            if (error.message.includes("OpenAI API Error") || 
                error.message.includes("exceeded its quota") || 
                error.message.includes("rate limit") || 
                error.message.includes("API key")) {
                throw error;
            }
            
            // Общее сообщение об ошибке
            throw new Error(`Failed to generate image for "${word}". ${error.message}`);
        }
        
        throw new Error(`Failed to generate image for "${word}". Please check your OpenAI API key and try again.`);
    }
};

const getLangaugeNameText = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  try {
    const body = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are langauage expert' },
        {
          role: 'user',
          content: `What is the name of this language: ${text}. Give only name of this language in one word`,
        },
      ],
      max_tokens: 600,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during generating back side of the Anki card:', error);
    return null;
  }
};

export const generateAnkiFront = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  const langauage = await getLangaugeNameText(apiKey, text);

  try {
    const body = {
      model: 'gpt-4o-mini',
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
      max_tokens: 80,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error(
      'Error during generating front side of the Anki card:',
      error
    );
    return null;
  }
};

export const generateAnkiBack = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  const langauage = await getLangaugeNameText(apiKey, text);

  try {
    const body = {
      model: 'gpt-4o-mini',
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
      max_tokens: 1500,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during generating back side of the Anki card:', error);
    return null;
  }
};
