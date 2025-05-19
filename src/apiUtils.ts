import { imageUrlToBase64 } from "./services/ankiService";
import { getOpenAiImageUrl } from "./services/openaiApi";
import { arrayBufferToBase64 } from "./utils";

export async function getImage(
    unusedParam: string | null,
    openai: any, 
    openAiKey: string,
    descriptionImage: string,
    imageInstructions: string = ''
): Promise<{ imageUrl: string | null, imageBase64: string | null }> {
    console.log('getImage called with description:', descriptionImage);
    let imageUrl: string | null = null;
    let imageBase64: string | null = null;

    if (!descriptionImage) {
        throw new Error("Cannot generate image: missing description");
    }

    if (!openAiKey) {
        throw new Error("Cannot generate image: no OpenAI API key provided. Please check your settings.");
    }

    // Используем только OpenAI для генерации изображений
    try {
        console.log('Using OpenAI with key:', openAiKey ? openAiKey.substring(0, 5) + '...' : 'null');
        imageUrl = await getOpenAiImageUrl(openai, openAiKey, descriptionImage, imageInstructions);
        console.log('OpenAI returned URL:', imageUrl ? 'success' : 'null');
        
        if (imageUrl) {
            try {
                imageBase64 = await imageUrlToBase64(imageUrl);
                console.log('Image URL converted to base64:', imageBase64 ? 'success' : 'null');
            } catch (base64Error) {
                console.error('Error converting URL to base64:', base64Error);
                // Если ошибка в конвертации - оставляем URL, но base64 будет null
            }
        }
    } catch (openaiError) {
        console.error('OpenAI image generation error:', openaiError);
        
        // Пробрасываем ошибку OpenAI, так как она уже содержит информативное сообщение
        if (openaiError instanceof Error) {
            throw openaiError;
        } else {
            throw new Error("Failed to generate image with OpenAI. Please check your API key and try again.");
        }
    }

    // Если метод не сработал или не вернул результат
    if (!imageUrl) {
        throw new Error("Failed to generate image. Please check your API key and try again.");
    }

    return { imageUrl, imageBase64 };
}
