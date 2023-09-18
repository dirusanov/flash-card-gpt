import { imageUrlToBase64 } from "./services/ankiService";
import { generateImageHuggingface } from "./services/huggingFaceApi";
import { getOpenAiImageUrl } from "./services/openaiApi";
import { arrayBufferToBase64 } from "./utils";

export async function getImage(
    haggingFaceApiKey: string | null,
    openai: any, 
    openAiKey: string,
    descriptionImage: string
): Promise<{ imageUrl: string | null, imageBase64: string | null }> {
    let arrayBuffer: ArrayBuffer;
    let imageUrl: string | null = null;
    let imageBase64: string | null = null;

    if (haggingFaceApiKey) {
        try {
            arrayBuffer = await generateImageHuggingface(haggingFaceApiKey, descriptionImage);
            const base64 = arrayBufferToBase64(arrayBuffer);
            imageUrl = 'data:image/jpeg;base64,' + base64;
            imageBase64 = imageUrl
        } catch (error) {
            console.error('Error with Hugging Face:', error);
            imageUrl = await getOpenAiImageUrl(openai, openAiKey, descriptionImage);
            if (imageUrl) {
                imageBase64 = await imageUrlToBase64(imageUrl);
            }
        }
    } else {
        imageUrl = await getOpenAiImageUrl(openai, openAiKey, descriptionImage);
        if (imageUrl) {
            imageBase64 = await imageUrlToBase64(imageUrl);
        }
    }

    return { imageUrl, imageBase64 };
}
