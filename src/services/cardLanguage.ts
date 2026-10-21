import { createLanguageDetector } from './languageDetection';

interface CardStudyText {
    text?: string;
    front?: string;
    sentence?: string | null;
    examples?: Array<[string, string | null]>;
}

/** Resolve the saved card's language independently of composer preferences.
 * Existing examples disambiguate shared words in old/imported/cloud cards too.
 */
export const createCardLanguageResolver = (
    complete: Parameters<typeof createLanguageDetector>[0],
    cache?: Parameters<typeof createLanguageDetector>[1],
) => {
    const detect = createLanguageDetector(complete, cache);
    return (card: CardStudyText) => detect({
        text: card.text || card.front || '',
        sentence: [card.sentence, ...(card.examples || []).map(([sentence]) => sentence)]
            .filter(Boolean).join('\n'),
    });
};
