// Lightweight mapping of ISO 639-1 codes to English language names
// Used to enrich prompts with a readable language name alongside the code.

const LANG_ENGLISH_NAMES: Record<string, string> = {
  ru: 'Russian',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  bn: 'Bengali',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  cs: 'Czech',
  sv: 'Swedish',
  vi: 'Vietnamese',
  th: 'Thai',
  he: 'Hebrew',
  id: 'Indonesian',
  uk: 'Ukrainian',
  el: 'Greek',
  ro: 'Romanian',
  hu: 'Hungarian',
  fi: 'Finnish',
  da: 'Danish',
  no: 'Norwegian',
  sk: 'Slovak',
  lt: 'Lithuanian',
  lv: 'Latvian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  et: 'Estonian',
  sl: 'Slovenian'
};

export function getLanguageEnglishName(code?: string | null): string | null {
  if (!code) return null;
  const norm = code.toLowerCase();
  return LANG_ENGLISH_NAMES[norm] || null;
}

