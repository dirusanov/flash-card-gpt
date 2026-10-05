export interface LanguageOption {
    code: string;
    name: string;
    flag: string;
    englishName: string;
}

// Module-level so it is not rebuilt on every CreateCard render, which is where this
// list used to live — inside the component body, defeating the useMemo filters below it.
export const ALL_LANGUAGES: LanguageOption[] = [
    { code: 'ru', name: 'Русский', flag: '🇷🇺', englishName: 'Russian' },
    { code: 'en', name: 'English', flag: '🇬🇧', englishName: 'English' },
    { code: 'es', name: 'Español', flag: '🇪🇸', englishName: 'Spanish' },
    { code: 'fr', name: 'Français', flag: '🇫🇷', englishName: 'French' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪', englishName: 'German' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹', englishName: 'Italian' },
    { code: 'pt', name: 'Português', flag: '🇵🇹', englishName: 'Portuguese' },
    { code: 'ja', name: '日本語', flag: '🇯🇵', englishName: 'Japanese' },
    { code: 'ko', name: '한국어', flag: '🇰🇷', englishName: 'Korean' },
    { code: 'zh', name: '中文', flag: '🇨🇳', englishName: 'Chinese' },
    { code: 'ar', name: 'العربية', flag: '🇦🇪', englishName: 'Arabic' },
    { code: 'hi', name: 'हिंदी', flag: '🇮🇳', englishName: 'Hindi' },
    { code: 'bn', name: 'বাংলা', flag: '🇧🇩', englishName: 'Bengali' },
    { code: 'tr', name: 'Türkçe', flag: '🇹🇷', englishName: 'Turkish' },
    { code: 'pl', name: 'Polski', flag: '🇵🇱', englishName: 'Polish' },
    { code: 'nl', name: 'Nederlands', flag: '🇳🇱', englishName: 'Dutch' },
    { code: 'cs', name: 'Čeština', flag: '🇨🇿', englishName: 'Czech' },
    { code: 'sv', name: 'Svenska', flag: '🇸🇪', englishName: 'Swedish' },
    { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', englishName: 'Vietnamese' },
    { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭', englishName: 'Thai' },
    { code: 'he', name: 'עִבְרִית', flag: '🇮🇱', englishName: 'Hebrew' },
    { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', englishName: 'Indonesian' },
    { code: 'uk', name: 'Українська', flag: '🇺🇦', englishName: 'Ukrainian' },
    { code: 'el', name: 'Ελληνικά', flag: '🇬🇷', englishName: 'Greek' },
    { code: 'ro', name: 'Română', flag: '🇷🇴', englishName: 'Romanian' },
    { code: 'hu', name: 'Magyar', flag: '🇭🇺', englishName: 'Hungarian' },
    { code: 'fi', name: 'Suomi', flag: '🇫🇮', englishName: 'Finnish' },
    { code: 'da', name: 'Dansk', flag: '🇩🇰', englishName: 'Danish' },
    { code: 'no', name: 'Norsk', flag: '🇳🇴', englishName: 'Norwegian' },
    { code: 'sk', name: 'Slovenčina', flag: '🇸🇰', englishName: 'Slovak' },
    { code: 'lt', name: 'Lietuvių', flag: '🇱🇹', englishName: 'Lithuanian' },
    { code: 'lv', name: 'Latviešu', flag: '🇱🇻', englishName: 'Latvian' },
    { code: 'bg', name: 'Български', flag: '🇧🇬', englishName: 'Bulgarian' },
    { code: 'hr', name: 'Hrvatski', flag: '🇭🇷', englishName: 'Croatian' },
    { code: 'sr', name: 'Српски', flag: '🇷🇸', englishName: 'Serbian' },
    { code: 'et', name: 'Eesti', flag: '🇪🇪', englishName: 'Estonian' },
    { code: 'sl', name: 'Slovenščina', flag: '🇸🇮', englishName: 'Slovenian' },
];

export const findLanguage = (code: string | null | undefined): LanguageOption | null =>
    code ? ALL_LANGUAGES.find((lang) => lang.code === code) || null : null;

/** Used only for fresh settings; a saved choice still wins during hydration. */
export const getDefaultTranslationLanguage = (
    locales: readonly string[] = typeof navigator !== 'undefined'
        ? (navigator.languages?.length ? navigator.languages : [navigator.language])
        : ['en'],
): string => {
    for (const locale of locales) {
        const base = locale.toLowerCase().split(/[-_]/)[0];
        const code = ({ nb: 'no', nn: 'no', iw: 'he', in: 'id' } as Record<string, string>)[base] || base;
        if (findLanguage(code)) return code;
    }
    return 'en';
};

export const filterLanguages = (search: string): LanguageOption[] => {
    const query = search.trim().toLowerCase();
    if (!query) return ALL_LANGUAGES;
    return ALL_LANGUAGES.filter(
        (lang) =>
            lang.name.toLowerCase().includes(query) ||
            lang.englishName.toLowerCase().includes(query) ||
            lang.code.toLowerCase().includes(query)
    );
};
