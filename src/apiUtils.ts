import { getOpenAiImageUrl } from "./services/openaiApi";

const isDev = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
    if (isDev) {
        console.log(...args);
    }
};

export async function getImage(
    openAiKey: string,
    descriptionImage: string,
    imageInstructions: string = '',
    sourceLanguage?: string
): Promise<{ imageUrl: string | null, imageBase64: string | null }> {
    debugLog('getImage called with description:', descriptionImage);
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
        debugLog('Using OpenAI with key:', openAiKey ? openAiKey.substring(0, 5) + '...' : 'null');
        imageUrl = await getOpenAiImageUrl(openAiKey, descriptionImage, imageInstructions, sourceLanguage);
        debugLog('OpenAI returned image payload:', imageUrl ? (imageUrl.startsWith('data:image/') ? 'base64-data-url' : 'url') : 'null');
        
        if (imageUrl) {
            if (imageUrl.startsWith('data:image/')) {
                imageBase64 = imageUrl;
                imageUrl = null;
                debugLog('OpenAI returned base64 image directly; skipping URL conversion');
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

    // Если ни метод не сработал или не вернул результат
    if (!imageUrl && !imageBase64) {
        throw new Error("Failed to generate image. Please check your API key and try again.");
    }

    // Keep remote URLs in UI state and normalize to base64 only on explicit save.
    // Eager conversion creates very large strings, spikes memory and can freeze the extension.
    const finalImageUrl = imageBase64 ? null : imageUrl;
    
    debugLog('Final result:', {
        hasBase64: !!imageBase64,
        hasUrl: !!finalImageUrl,
        status: imageBase64 ? 'Base64 (permanent)' : finalImageUrl ? 'URL only (temporary)' : 'No image'
    });

    return { imageUrl: finalImageUrl, imageBase64 };
}
