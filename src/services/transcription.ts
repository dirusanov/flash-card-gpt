import { findLanguage } from '../data/languages';

export type TranscriptionMode = 'auto' | 'always' | 'off';

export const DEFAULT_TRANSCRIPTION_MODE: TranscriptionMode = 'auto';
export const DEFAULT_TRANSCRIPTION_LANGUAGE = 'en';

interface TranscriptionValues {
  userLanguageTranscription: string | null;
  ipaTranscription: string | null;
}

const LETTER_PATTERN = /\p{L}/u;
const LATIN_PATTERN = /\p{Script=Latin}/u;
const CYRILLIC_PATTERN = /\p{Script=Cyrillic}/u;
// Established romanization systems sometimes use script-neutral modifier letters:
// Arabic ʿ/ʾ, aspiration ʰ, palatalization ʲ, and similar pronunciation marks. They are
// neither foreign-script leakage nor prose in the wrong language.
const PRONUNCIATION_MODIFIER_PATTERN = /[ʰʱʲʷˠˤ˞ʿʾʼˀˁ]/u;

/**
 * Automatic pronunciation guides are useful when the studied spelling cannot be read
 * through either Latin or Cyrillic. Inspecting the actual Unicode letters keeps this
 * universal: newly supported languages and mixed-language snippets do not need a code
 * list or a new release.
 */
export const containsNonLatinOrCyrillicLetters = (text: string): boolean =>
  Array.from(text.normalize('NFC')).some(
    (character) =>
      LETTER_PATTERN.test(character)
      && !LATIN_PATTERN.test(character)
      && !CYRILLIC_PATTERN.test(character),
  );

const getConfiguredGuideScript = (
  languageCode: string,
): 'latin' | 'cyrillic' | 'other' | null => {
  const normalizedLanguage = languageCode
    .trim()
    .toLocaleLowerCase()
    .split(/[-_]/u)[0];

  if (normalizedLanguage === 'en') return 'latin';
  if (normalizedLanguage === 'ru') return 'cyrillic';
  return null;
};

/**
 * A deterministic guard protects the default English guide and the legacy Russian guide.
 * Other languages are left to the phonetics validator: inferring an exclusive writing
 * system from a language's display name is unsafe (Serbian, for example, validly uses
 * both Cyrillic and Latin).
 */
export const isPronunciationGuideScriptCompatible = (
  value: string,
  guideLanguage: string,
): boolean => {
  const expectedScript = getConfiguredGuideScript(guideLanguage);
  if (expectedScript !== 'latin' && expectedScript !== 'cyrillic') {
    return true;
  }

  return Array.from(value.normalize('NFC')).every((character) => {
    if (!LETTER_PATTERN.test(character)) return true;
    if (PRONUNCIATION_MODIFIER_PATTERN.test(character)) return true;
    return expectedScript === 'latin'
      ? LATIN_PATTERN.test(character)
      : CYRILLIC_PATTERN.test(character);
  });
};

export const shouldGenerateTranscription = (
  text: string,
  mode: TranscriptionMode = DEFAULT_TRANSCRIPTION_MODE,
  sourceLanguage?: string | null,
  extraLanguages: string[] = [],
): boolean => {
  if (!text.trim() || mode === 'off') {
    return false;
  }

  if (mode === 'always') {
    return true;
  }

  const normalizedSourceLanguage =
    sourceLanguage?.trim().toLocaleLowerCase().split(/[-_]/u)[0] || '';
  const explicitlyEnabled = extraLanguages.some(
    (language) =>
      language.trim().toLocaleLowerCase().split(/[-_]/u)[0]
      === normalizedSourceLanguage,
  );

  return explicitlyEnabled || containsNonLatinOrCyrillicLetters(text);
};

export interface ResolvedTranscriptionRequest {
  sourceLanguage: string;
  transcriptionLanguage: string;
}

export const resolveTranscriptionRequest = (
  text: string,
  sourceLanguage: string | null | undefined,
  mode: TranscriptionMode = DEFAULT_TRANSCRIPTION_MODE,
  transcriptionLanguage: string = DEFAULT_TRANSCRIPTION_LANGUAGE,
  extraLanguages: string[] = [],
): ResolvedTranscriptionRequest | null => {
  if (!shouldGenerateTranscription(text, mode, sourceLanguage, extraLanguages)) {
    return null;
  }

  return {
    sourceLanguage:
      sourceLanguage?.trim() || 'unknown (infer only from the exact study target)',
    transcriptionLanguage:
      transcriptionLanguage.trim() || DEFAULT_TRANSCRIPTION_LANGUAGE,
  };
};

export const normalizeTranscriptionValue = (
  value: string | null | undefined,
  isIpa: boolean = false,
): string | null => {
  if (!value) {
    return null;
  }

  let cleaned = value
    .trim()
    .replace(/^IPA:\s*/iu, '')
    .replace(/^[\p{L}\p{M}\s-]{2,40}:\s*/u, '')
    .trim();

  if (!cleaned) {
    return null;
  }

  if (isIpa) {
    cleaned = cleaned.replace(/^\[|\]$/gu, '').replace(/^\/|\/$/gu, '').trim();
    return cleaned ? `[${cleaned}]` : null;
  }

  return cleaned;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });

export const getTranscriptionLanguageLabel = (languageCode: string): string => {
  const normalizedLanguage = languageCode
    .trim()
    .toLocaleLowerCase()
    .split(/[-_]/u)[0];
  const language = findLanguage(languageCode) || findLanguage(normalizedLanguage);
  return language?.name || language?.englishName || languageCode.trim().toUpperCase() || 'Transcription';
};

/**
 * Cards historically store pronunciation as a small HTML fragment. Keep that format for
 * backward compatibility, but own and escape the markup here instead of interpolating
 * model output at several call sites.
 */
export const formatTranscriptionHtml = (
  transcription: TranscriptionValues | null | undefined,
  transcriptionLanguage: string,
): string => {
  if (!transcription) {
    return '';
  }

  const guide = normalizeTranscriptionValue(transcription.userLanguageTranscription);
  const ipa = normalizeTranscriptionValue(transcription.ipaTranscription, true);
  const label = escapeHtml(getTranscriptionLanguageLabel(transcriptionLanguage));
  const blocks: string[] = [];

  if (guide) {
    blocks.push(
      `<div class="transcription-item user-lang">
        <span class="transcription-label">${label}:</span>
        <span class="transcription-text">${escapeHtml(guide)}</span>
      </div>`,
    );
  }

  if (ipa) {
    blocks.push(
      `<div class="transcription-item ipa">
        <span class="transcription-label">IPA:</span>
        <span class="transcription-text">${escapeHtml(ipa)}</span>
      </div>`,
    );
  }

  return blocks.join('\n');
};
