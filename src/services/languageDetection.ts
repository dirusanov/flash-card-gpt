/**
 * Script- and diacritic-based guess at the language of a short text, with no network.
 *
 * Shared by the full composer and the first-run flow so both bars show the same "auto"
 * value for the same word. It is a hint for the UI, not the final answer — the model
 * that builds the card decides for real.
 */
export const detectLanguageOffline = (text: string, pageHint?: string | null): string | null => {
    const cleanText = text.trim().toLowerCase();

    // Scripts
    if (/[а-яё]/i.test(cleanText)) return 'ru';
    if (/[一-鿿]/.test(cleanText)) return 'zh';
    if (/[぀-ゟ゠-ヿ]/.test(cleanText)) return 'ja';
    if (/[가-힯]/.test(cleanText)) return 'ko';
    if (/[؀-ۿ]/.test(cleanText)) return 'ar';

    // Latin with diacritics
    if (/[ñáéíóúü]/i.test(cleanText)) return 'es';
    if (/[àâäéèêëïîôöùûüÿç]/i.test(cleanText)) return 'fr';
    if (/[äöüß]/i.test(cleanText)) return 'de';
    if (/[àèéìíîòóù]/i.test(cleanText)) return 'it';

    // Plain Latin
    if (/^[a-z\s.,!?\-'"]+$/i.test(cleanText)) {
        const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'with', 'on', 'at', 'by', 'from', 'this', 'that', 'it', 'he', 'she', 'they', 'we', 'you', 'was', 'were', 'are', 'have', 'has', 'had', 'can', 'will', 'would', 'could', 'should'];
        const words = cleanText.split(/\s+/);
        const englishMatches = words.filter(word => englishWords.includes(word.replace(/[^\w]/g, ''))).length;
        if (englishMatches > 0) return 'en';
        // A single Latin word carries no signal of its own; trust the page it came from.
        if (words.length === 1 && pageHint && pageHint.length === 2) return pageHint;
    }

    return null;
};
