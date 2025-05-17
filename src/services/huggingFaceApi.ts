import axios from 'axios';
import { formatErrorMessage } from './errorFormatting';

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

// Helper function for text generation requests to HuggingFace
const textGenerationRequest = async (
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number = 1000
) => {
  try {
    if (!apiKey) {
      throw new Error("HuggingFace API key is missing. Please check your settings.");
    }

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: maxTokens,
          return_full_text: false
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(formatErrorMessage("HuggingFace API Error", response.status, errorData));
    }

    const data = await response.json();
    return data[0]?.generated_text?.trim() ?? null;
  } catch (error) {
    console.error('Error in HuggingFace API request:', error);
    throw error;
  }
};

// Translation function using HuggingFace models
export const translateText = async (
  apiKey: string,
  text: string,
  translateToLanguage: string = 'ru',
  customPrompt: string = ''
): Promise<string | null> => {
  try {
    // Use Helsinki-NLP translation models when possible
    // Default to a general text generation model for less common languages
    let model = "Helsinki-NLP/opus-mt-en-ru"; // Default for English to Russian
    
    // For other languages, dynamically set the model
    if (translateToLanguage !== 'ru') {
      model = `Helsinki-NLP/opus-mt-en-${translateToLanguage}`;
    }
    
    const basePrompt = `Translate the following text to ${translateToLanguage}: ${text}`;
    const finalPrompt = customPrompt ? `${basePrompt}. ${customPrompt}` : basePrompt;

    return await textGenerationRequest(apiKey, model, finalPrompt);
  } catch (error) {
    console.error('Error during HuggingFace translation:', error);
    
    // Fallback to a general model for translation
    try {
      const fallbackModel = "facebook/mbart-large-50-many-to-many-mmt";
      const promptWithLangCode = `>>>${translateToLanguage}<<< ${text}`;
      return await textGenerationRequest(apiKey, fallbackModel, promptWithLangCode);
    } catch (fallbackError) {
      console.error('Fallback translation also failed:', fallbackError);
      throw error; // Throw the original error
    }
  }
};

// Get examples function using HuggingFace models
export const getExamples = async (
  apiKey: string,
  word: string,
  translateToLanguage: string,
  translate: boolean = false,
  customPrompt: string = ''
): Promise<Array<[string, string | null]>> => {
  try {
    const model = "mistralai/Mistral-7B-Instruct-v0.2";
    
    const basePrompt = `Give me three example sentences using the word '${word}' in its original language.
Each example should show natural usage of '${word}' in its native language context.
Return ONLY the examples, one per line, without any numbering, explanations, or translations.`;
    
    const finalPrompt = customPrompt 
      ? `${basePrompt} ${customPrompt.replace(/\{word\}/g, word)}` 
      : basePrompt;

    const examplesText = await textGenerationRequest(apiKey, model, finalPrompt);
    
    if (!examplesText) {
      throw new Error("Failed to generate examples. Please try again with a different word.");
    }

    const examples = examplesText.split('\n').filter((line: string) => line.trim() !== '');
    const resultExamples: Array<[string, string | null]> = [];

    for (const example of examples) {
      if (!example.trim()) continue;

      let translatedExample: string | null = null;

      if (translate) {
        try {
          translatedExample = await translateText(apiKey, example, translateToLanguage);
        } catch (translationError) {
          console.error('Error translating example:', translationError);
        }
      }

      resultExamples.push([example, translatedExample]);
    }

    if (resultExamples.length === 0) {
      throw new Error("Could not generate examples. Please try again with a different word or check your API key.");
    }

    return resultExamples;
  } catch (error) {
    console.error('Error during getting examples from HuggingFace:', error);
    throw error;
  }
};

// Get image description
export const getDescriptionImage = async (
  apiKey: string,
  word: string,
  customInstructions: string = ''
): Promise<string> => {
  try {
    const model = "mistralai/Mistral-7B-Instruct-v0.2";
    
    const basePrompt = `Create a detailed visual description of the word/concept "${word}" for image generation.
The description should be concrete, visual, and focus on representational elements.
Keep the description under 100 words and make sure it would work well for an image generation system.`;
    
    const finalPrompt = customInstructions 
      ? `${basePrompt} ${customInstructions}` 
      : basePrompt;

    const description = await textGenerationRequest(apiKey, model, finalPrompt);
    
    if (!description) {
      throw new Error("Failed to generate image description. Please try again.");
    }

    return description;
  } catch (error) {
    console.error('Error generating image description with HuggingFace:', error);
    throw error;
  }
};

// Get image URL from HuggingFace's image generation models
export const getImageUrl = async (
  apiKey: string,
  description: string
): Promise<string | null> => {
  try {
    if (!apiKey) {
      throw new Error("HuggingFace API key is missing. Please check your settings.");
    }

    // Use a stable diffusion model from HuggingFace
    const model = "stabilityai/stable-diffusion-2-1";

    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        inputs: description
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(formatErrorMessage("HuggingFace Image API Error", response.status, errorData));
    }

    // The response is the image data as a blob
    const blob = await response.blob();
    
    // Convert blob to base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error generating image with HuggingFace:', error);
    throw error;
  }
};

// Generate front and back card content
export const generateAnkiFront = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  const model = "mistralai/Mistral-7B-Instruct-v0.2";
  
  const prompt = `For the word or phrase "${text}", create the front side of a flashcard.
Format it in HTML with proper styling, including the word in bold and any pronunciations.
Keep it simple and focused on the word itself.`;

  return await textGenerationRequest(apiKey, model, prompt);
};

export const generateAnkiBack = async (
  apiKey: string,
  text: string
): Promise<string | null> => {
  const model = "mistralai/Mistral-7B-Instruct-v0.2";
  
  const prompt = `For the word or phrase "${text}", create the back side of a flashcard.
Format it in HTML with proper styling, including:
- Definition
- Examples of usage
- Any important notes
Make it visually appealing with appropriate spacing and formatting.`;

  return await textGenerationRequest(apiKey, model, prompt);
};

// Export function for image generation for compatibility with apiUtils.ts
export async function generateImageHuggingface(apiKey: string, prompt: string): Promise<ArrayBuffer> {
  if (!apiKey) {
    throw new Error("HuggingFace API key is missing. Please check your settings.");
  }

  // Use stable diffusion model for image generation
  const model = "stabilityai/stable-diffusion-2-1";
  
  try {
    const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
      })
    });

    if (!response.ok) {
      throw new Error(`HuggingFace API Error: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error generating image with HuggingFace:', error);
    throw error;
  }
}
