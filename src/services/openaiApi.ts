import { OpenAIApi } from "openai";

export const translateText = async (
    openai: OpenAIApi,
    text: string,
    translateToLanguage: string = 'ru',
): Promise<string | null> => {
    const prompt = `Translate the following text to ${translateToLanguage}: '${text}'`;

    try {
        const completion = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 900,
            n: 1,
            stop: null,
            temperature: 0.5,
        });

        return completion.data.choices[0]?.text?.trim() ?? null
    } catch (error) {
        const err = error as Error
        alert(err.message)
        console.error('Error during translation:', err)
        return null;
    }
};


export const getExamples = async (
    openai: OpenAIApi,
    word: string,
    translateToLanguage: string,
    translate: boolean = false,
): Promise<Array<[string, string | null]>> => {
    const prompt = `Give me three example sentences using the word '${word}'. In the language of this word.`;

    try {
        const completion = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 3500,
            n: 1,
            stop: null,
            temperature: 0.5,
        });

        const resultText = completion.data.choices[0]?.text;
        const examples = resultText?.trim().split('\n') ?? [];

        const resultExamples: Array<[string, string | null]> = [];

        for (const example of examples) {
            let translatedExample: string | null = null;

            if (translate) {
                translatedExample = await translateText(openai, example, translateToLanguage);
            }

            resultExamples.push([example, translatedExample]);
        }

        return resultExamples;
    } catch (error) {
        console.error('Error during getting examples:', error);
        return [];
    }
};

export const isAbstract = async (openai: OpenAIApi, word: string): Promise<boolean> => {
    const prompt = `Is the word '${word}' an abstract concept or a concrete object? Answer 'abstract' or 'concrete':`;

    try {
        const completion = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 900,
            n: 1,
            stop: null,
            temperature: 0.5,
        });

        const answer = completion.data.choices[0]?.text?.trim().toLowerCase() ?? '';
        return answer === 'abstract';
    } catch (error) {
        console.error('Error during determining abstractness:', error);
        return false;
    }
};

export const getDescriptionImage = async (openai: OpenAIApi, word: string): Promise<string> => {
    const prompt = `Provide a detailed description for an image that represents the abstract concept of '${word}'`;

    try {
        const completion = await openai.createCompletion({
            model: 'text-davinci-003',
            prompt: prompt,
            max_tokens: 100,
            n: 1,
            stop: null,
            temperature: 0.5,
        });

        return completion.data.choices[0]?.text?.trim() ?? '';
    } catch (error) {
        console.error('Error during getting description image:', error);
        return '';
    }
};

export const getImageUrlRequest = async (openai: OpenAIApi, description: string): Promise<string | null> => {
    try {
        const response = await openai.createImage({
            prompt: description,
            n: 1,
            size: '512x512',
            response_format: 'url',
        });

        return response.data.data[0]?.url ?? null;
    } catch (error) {
        console.error('Error during image generation:', error);
        return null;
    }
};

export const getImageUrl = async (openai: OpenAIApi, word: string): Promise<string | null> => {
    try {
        const isAbstractWord = await isAbstract(openai, word);

        if (isAbstractWord) {
            const description = await getDescriptionImage(openai, word);
            return await getImageUrlRequest(
                openai, 
                `Create a vivid, high-quality illustration representing the concept of '${description}'`
            );
        } else {
            const photorealisticPrompt = `Create a high-quality, photorealistic image of 
                                          a ${word} with a neutral expression and clear features`;
            return await getImageUrlRequest(openai, photorealisticPrompt);
        }
    } catch (error) {
        console.error('Error during getting image for word:', error);
        return null;
    }
};
