import { imageUrlToBase64 } from "./services/ankiService";
// import { getOpenAiImageUrl } from "./services/openaiApi";
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
        // imageUrl = await getOpenAiImageUrl(openai, openAiKey, descriptionImage, imageInstructions);
        console.log('OpenAI returned URL:', imageUrl ? 'success' : 'null');
        
        if (imageUrl) {
            // ВАЖНО: Всегда пытаемся конвертировать в base64 для надежного хранения
            try {
                console.log('Converting image URL to base64 for permanent storage...');
                imageBase64 = await imageUrlToBase64(imageUrl);
                console.log('Image URL converted to base64:', imageBase64 ? 'success' : 'null');
                
                if (imageBase64) {
                    console.log('✅ Image successfully converted to base64 - keeping both URL and base64 for reliability');
                } else {
                    console.warn('⚠️ Failed to convert image to base64 - keeping temporary URL as fallback');
                }
            } catch (base64Error) {
                console.error('❌ Error converting URL to base64:', base64Error);
                console.warn('⚠️ Will use temporary URL as fallback, but it may disappear later');
                // Если ошибка в конвертации - оставляем URL как fallback
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

    // АВТОМАТИЧЕСКАЯ ОПТИМИЗАЦИЯ: Если конвертация в base64 прошла успешно, 
    // убираем временный URL чтобы экономить место и избежать путаницы
    const finalImageUrl = imageBase64 ? null : imageUrl;
    
    console.log('Final result:', {
        hasBase64: !!imageBase64,
        hasUrl: !!finalImageUrl,
        status: imageBase64 ? 'Base64 (permanent)' : finalImageUrl ? 'URL only (temporary)' : 'No image'
    });

    return { imageUrl: finalImageUrl, imageBase64 };
}
