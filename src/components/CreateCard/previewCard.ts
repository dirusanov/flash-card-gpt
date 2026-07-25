import { StoredCard } from '../../store/reducers/cards';
import { Modes } from '../../constants';

interface PreviewCardInput {
    mode: Modes;
    front: string | null;
    back?: string | null;
    text?: string | null;
    translation: string | null;
    examples: Array<[string, string | null]>;
    examplesAudio?: Array<string | null>;
    image?: string | null;
    imageUrl?: string | null;
    linguisticInfo?: string | null;
    transcription?: string | null;
    wordAudio?: string | null;
}

/**
 * Shapes the create screen's loose state into the card model the rest of the app uses.
 *
 * A card being made and a card already saved are the same thing at different ages, so they
 * are shown by the same component (`StoredCards/StudyCard`). This adapter is what lets
 * that happen without the create screen having to hold a real `StoredCard` — it exists
 * once here rather than being inlined at each render site.
 *
 * The id and timestamp are placeholders: nothing persists a preview, and `StudyCard` uses
 * the id only to reset the flip when the card changes.
 */
export const buildPreviewCard = (input: PreviewCardInput): StoredCard => ({
    id: `preview-${input.front ?? ''}`,
    mode: input.mode,
    front: input.front ?? '',
    back: input.back ?? null,
    text: input.text ?? input.front ?? '',
    translation: input.translation ?? null,
    examples: Array.isArray(input.examples) ? input.examples : [],
    examplesAudio: Array.isArray(input.examplesAudio) ? input.examplesAudio : [],
    image: input.image ?? null,
    imageUrl: input.imageUrl ?? null,
    linguisticInfo: input.linguisticInfo ?? '',
    transcription: input.transcription ?? '',
    wordAudio: input.wordAudio ?? null,
    createdAt: new Date(),
    exportStatus: 'not_exported',
});
