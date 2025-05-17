import { imageUrlToBase64 } from "./services/ankiService";
import { getOpenAiImageUrl } from "./services/openaiApi";
import { arrayBufferToBase64 } from "./utils";
import { HuggingFaceProvider } from "./services/aiProviders";

export async function getImage(
    huggingFaceApiKey: string | null,
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

    if (!huggingFaceApiKey && !openAiKey) {
        throw new Error("Cannot generate image: no API keys provided. Please check your settings and add either OpenAI or HuggingFace API key.");
    }

    // Сначала пробуем HuggingFace, если есть API ключ
    if (huggingFaceApiKey) {
        try {
            console.log('Trying HuggingFace with API key:', huggingFaceApiKey ? huggingFaceApiKey.substring(0, 5) + '...' : 'null');
            
            // Use HuggingFaceProvider from aiProviders.ts instead of the standalone function
            const huggingFaceProvider = new HuggingFaceProvider(huggingFaceApiKey);
            const imageData = await huggingFaceProvider.getImageUrl?.(descriptionImage);
            
            if (imageData) {
                // The URL could be a blob URL or a data URL
                imageUrl = imageData;
                imageBase64 = imageData;
                console.log('HuggingFace image processed successfully');
                return { imageUrl, imageBase64 };
            } else {
                throw new Error("HuggingFace did not return an image");
            }
        } catch (error) {
            console.error('Error with Hugging Face:', error);
            // Если HuggingFace не работает, не выбрасываем ошибку, а продолжаем с OpenAI
        }
    }

    // Если HuggingFace не сработал или не используется, пробуем OpenAI
    if (openAiKey) {
        try {
            console.log('Trying OpenAI with key:', openAiKey ? openAiKey.substring(0, 5) + '...' : 'null');
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
    }

    // Если ни один из методов не сработал или не вернул результат
    if (!imageUrl) {
        throw new Error("Failed to generate image. Please check your API keys and try again.");
    }

    return { imageUrl, imageBase64 };
}
