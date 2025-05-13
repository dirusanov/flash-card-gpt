import { OpenAI } from 'openai';

export const translateText = async (
  apiKey: string,
  text: string,
  translateToLanguage: string = 'ru',
  customPrompt: string = ''
): Promise<string | null> => {
  try {
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

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? null;
  } catch (error) {
    console.error('Error during translation:', error);
    return null;
  }
};

export const getExamples = async (
  apiKey: string,
  word: string,
  translateToLanguage: string,
  translate: boolean = false,
  customPrompt: string = ''
): Promise<Array<[string, string | null]>> => {
  const processedCustomPrompt = customPrompt.replace(/\{word\}/g, word);
  
  const basePrompt = `Give me three example sentences using the word '${word}'. Using the language of this word ${word}.`;
  
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

    const data = await response.json();
    const resultText = data.choices[0]?.message?.content;
    const examples = resultText?.trim().split('\n') ?? [];

    const resultExamples: Array<[string, string | null]> = [];

    for (const example of examples) {
      if (!example.trim()) continue; // Skip empty lines
      
      let translatedExample: string | null = null;

      if (translate) {
        translatedExample = await translateText(
          apiKey,
          example,
          translateToLanguage
        );
      }

      resultExamples.push([example, translatedExample]);
    }

    return resultExamples;
  } catch (error) {
    console.error('Error during getting examples:', error);
    return [];
  }
};

export const isAbstract = async (
  apiKey: string,
  word: string
): Promise<boolean> => {
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

    const data = await response.json();
    const answer =
      data.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    return answer === 'abstract';
  } catch (error) {
    console.error('Error during determining abstractness:', error);
    return false;
  }
};

export const getDescriptionImage = async (
  apiKey: string,
  word: string,
  customInstructions: string = ''
): Promise<string> => {
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

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? '';
  } catch (error) {
    console.error('Error during getting description image:', error);
    return '';
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

    return response.data[0]?.url ?? null;
  } catch (error) {
    console.error('Error during image generation:', error);
    return null;
  }
};

export const getOpenAiImageUrl = async (
  openai: OpenAI, 
  apiKey: string, 
  word: string,
  customInstructions: string = ''
): Promise<string | null> => {
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
        return null;
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
