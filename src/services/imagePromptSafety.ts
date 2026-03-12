const REFUSAL_PATTERNS = [
  /i(?:'|’)m sorry/i,
  /\bi am sorry\b/i,
  /\bas an ai\b/i,
  /text[-\s]?based assistant/i,
  /text[-\s]?based ai/i,
  /\bunable to (?:create|generate) images?\b/i,
  /\bcannot (?:create|generate) images?\b/i,
  /\bcan(?:'|’)t (?:create|generate) images?\b/i,
  /\bi can only assist with text[-\s]?based tasks\b/i,
  /\bhowever,\s*i can help\b/i,
  /\blet me know how i can assist\b/i,
  /\bfeel free to ask\b/i,
];

const normalizePromptText = (value: string | null | undefined): string => (
  (value || '')
    .trim()
    .replace(/\s+/g, ' ')
);

const normalizeForComparison = (value: string | null | undefined): string => (
  normalizePromptText(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

export const isRefusalLikeImagePrompt = (value: string | null | undefined): boolean => {
  const normalized = normalizePromptText(value).toLowerCase();
  if (!normalized) {
    return true;
  }

  return REFUSAL_PATTERNS.some((pattern) => pattern.test(normalized));
};

export const containsSourceTermInImagePrompt = (
  sourceText: string | null | undefined,
  prompt: string | null | undefined
): boolean => {
  const normalizedSource = normalizeForComparison(sourceText);
  const normalizedPrompt = normalizeForComparison(prompt);

  if (!normalizedSource || !normalizedPrompt) {
    return false;
  }

  if (normalizedPrompt.includes(normalizedSource)) {
    return true;
  }

  const sourceTokens = normalizedSource
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);

  return sourceTokens.some((token) => normalizedPrompt.includes(token));
};

export const buildSafeImagePrompt = (
  _sourceText: string,
  generatedPrompt: string | null | undefined
): string => {
  const fallbackPrompt = 'Create a clean educational illustration with one clear main subject, a simple relevant setting, natural lighting, and no text, letters, captions, logos, or watermarks.';

  if (isRefusalLikeImagePrompt(generatedPrompt)) {
    return fallbackPrompt;
  }

  return normalizePromptText(generatedPrompt);
};

export const extractOpenAIImagePayload = (
  data: any
): { imageUrl: string | null; imageBase64: string | null } => {
  const image = Array.isArray(data?.data) ? data.data[0] : null;
  const imageUrl = typeof image?.url === 'string' ? image.url.trim() : '';
  const imageBase64 = typeof image?.b64_json === 'string' ? image.b64_json.trim() : '';

  return {
    imageUrl: imageUrl || null,
    imageBase64: imageBase64 ? `data:image/png;base64,${imageBase64}` : null,
  };
};
