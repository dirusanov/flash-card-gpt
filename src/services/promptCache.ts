// Simple localStorage-based cache for translated image prompts

const PREFIX = 'img_prompt_cache:';

function hashString(str: string): string {
  // djb2 simple hash
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  // Convert to unsigned hex
  return (hash >>> 0).toString(16);
}

export function getImagePromptCacheKey(sourceLanguage: string, basePrompt: string): string {
  const baseHash = hashString(basePrompt);
  return `${PREFIX}${sourceLanguage}:${baseHash}`;
}

export function loadCachedPrompt(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveCachedPrompt(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota/storage errors silently
  }
}

