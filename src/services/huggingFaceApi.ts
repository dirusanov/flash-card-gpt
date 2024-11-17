import axios from 'axios';

import { delay } from '../utils'

const HUGGINGFACE_API_URLS = [
    // "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
    // "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-refiner-1.0",
    // "https://api-inference.huggingface.co/models/stabilityai/sdxl-vae",
    "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-v1-5",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-4",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-1",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-2",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v1-3",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v-1-1-original",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v-1-2-original",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v-1-3-original",
    "https://api-inference.huggingface.co/models/CompVis/stable-diffusion-v-1-4-original",
];


export async function generateImageHuggingface(apiKey: string, prompt: string): Promise<ArrayBuffer> {
    let apiUrlsIterator = HUGGINGFACE_API_URLS[Symbol.iterator]();
    
    while (true) {
        const { value: currentApiUrl, done } = apiUrlsIterator.next();
        
        if (done) {
            apiUrlsIterator = HUGGINGFACE_API_URLS[Symbol.iterator]();
            continue;
        }
        
        console.log('Trying using this:', currentApiUrl);
        
        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        };
        
        const data = {
            inputs: prompt,
            options: {
                num_images: 1,
                image_size: 512,
                samples_per_image: 50,
                timesteps_each: 5,
                init_scale: 1e-3,
                refine_scale: 1e-4,
            },
        };

        try {
            const response = await axios.post(currentApiUrl, data, { headers, responseType: 'arraybuffer' });
            if (response.status === 503) {
                console.log(`Model is currently loading at ${currentApiUrl}. Switching API version...`);
                await delay(15000);  // Pause for 15 seconds
                continue;
            } else if (response.status !== 200) {
                await delay(15000);  // Pause for 15 seconds
                throw new Error(`Request failed with status code ${response.status}: ${response.statusText}`);
            }

            return response.data as ArrayBuffer
        } catch (error) {
            console.error('Error:', error);
            break; // Это завершит выполнение цикла
        }
    }

    throw new Error("Failed to generate image after multiple attempts.");
}
