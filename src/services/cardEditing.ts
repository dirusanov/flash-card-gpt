import type { StoredCard } from '../store/reducers/cards';
import { Modes } from '../constants';

/** One validation path for debounced saves and every way out of the editor.
 * Explicit empty/null optional fields are edits too; never revive their old values.
 */
export function prepareCardEdit(
    original: StoredCard, draft: Partial<StoredCard>, latest: StoredCard = original,
): StoredCard | null {
    // Only editor-owned fields changed since opening belong to this save. Preserve
    // concurrent export, sync and review metadata, and untouched media/deck changes.
    const patch: Partial<StoredCard> = {};
    const fields = ['text', 'translation', 'front', 'back', 'examples', 'image', 'imageUrl',
        'linguisticInfo', 'transcription', 'wordAudio', 'examplesAudio',
        'exampleTranscriptions', 'ankiDeckName', 'deckId'] as const;
    for (const key of fields) {
        if (key in draft && !Object.is(draft[key], original[key])) {
            Object.assign(patch, { [key]: draft[key] });
        }
    }
    const card = { ...latest, ...patch };
    if (card.mode === Modes.LanguageLearning) {
        card.text = (card.text || '').trim();
        card.translation = (card.translation || '').trim();
        if (!card.text || !card.translation) return null;
    } else {
        card.front = (card.front || '').trim();
        card.back = (card.back || '').trim();
        if (!card.front || !card.back) return null;
    }
    return card;
}
