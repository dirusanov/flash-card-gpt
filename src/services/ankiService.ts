import { Modes } from '../constants';
import { backgroundFetch } from './backgroundFetch';

const normalizeAnkiErrorText = (error: unknown): string => {
    if (Array.isArray(error)) {
        return error
            .map((item) => normalizeAnkiErrorText(item))
            .filter(Boolean)
            .join(' ')
            .trim();
    }

    if (error instanceof Error) {
        return error.message.trim();
    }

    return String(error || '').trim();
};

export const isAnkiDuplicateError = (error: unknown): boolean => {
    const normalized = normalizeAnkiErrorText(error).toLowerCase();
    return normalized.includes('cannot create note because it is a duplicate')
        || normalized.includes('already exists in anki');
};

export const getAnkiSaveErrorMessage = (error: unknown, cardsCount: number = 1): string => {
    if (isAnkiDuplicateError(error)) {
        return cardsCount > 1
            ? 'Some selected cards already exist in Anki.'
            : 'This card already exists in Anki.';
    }

    const normalized = normalizeAnkiErrorText(error);
    return normalized || 'Failed to save cards to Anki.';
};

export const getAnkiSaveSuccessMessage = (cardsCount: number = 1): string => {
    return cardsCount > 1
        ? 'Cards saved to Anki successfully.'
        : 'Card saved to Anki successfully.';
};

const normalizeExampleTranslation = (translation: string): string => {
    const trimmed = translation.trim();
    if (!trimmed) {
        return '';
    }

    // Remove only explicit list prefixes; preserve the actual first word.
    return trimmed.replace(/^(?:\d+[\).:-]\s+|[-*•]\s+)/, '').trim();
};

export function format_example(
    example: string,
    word: string,
    translation: string | null = null,
    font_size: string = "0.8em",
    audioSource: string = '',
    pronunciation: string | null = null
): string {
    const formatted_example = example.replace(word, `<b>${word}</b>`);

    let audioSrc = '';
    if (audioSource) {
        if (audioSource.startsWith('[sound:')) {
            audioSrc = audioSource.replace('[sound:', '').replace(']', '');
        } else if (audioSource.startsWith('data:audio') || !audioSource.includes(' ')) {
            // It's a data URI or a direct filename
            audioSrc = audioSource;
        }
    }

    const audioPrefix = audioSrc
        ? `<div style="margin-bottom: 8px; padding: 6px; background: #F0F9FF; border-radius: 6px; border: 1px solid #BAE6FD;">
             <audio controls src="${audioSrc}" style="width: 100%; height: 32px;"></audio>
           </div>`
        : '';
    const pronunciationRow = pronunciation?.trim()
        ? `<br><span style="font-family: monospace; font-size: 0.78em; color: #7C3AED;">${pronunciation.trim()}</span>`
        : '';
    if (translation) {
        const translatedSentence = normalizeExampleTranslation(translation);
        return translatedSentence
            ? `${audioPrefix}${formatted_example}${pronunciationRow}<br><span style='font-size: ${font_size};'><i>${translatedSentence}</i></span>`
            : `${audioPrefix}${formatted_example}${pronunciationRow}`;
    } else {
        return `${audioPrefix}${formatted_example}${pronunciationRow}`;
    }
}

export interface CardLangLearning {
    text: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image_base64: string | null;
    linguisticInfo?: string;
    transcription?: string; // HTML with user-language + IPA
    word_audio_base64?: string | null; // base64 audio or data URL
    examples_audio_base64?: Array<string | null>;
    example_transcriptions?: Array<string | null>;
    /** The sentence the word was selected from and the page it was on, if known. */
    sentence?: string | null;
    source_url?: string | null;
    source_title?: string | null;
    ankiAudioTag?: string;
    exampleAudioTags?: Array<string | null>;
}

export interface CardGeneral {
    text: string;
    front: string;
    back: string;
    image_base64?: string | null;
}

export function extractTranscriptionParts(transcriptionHtml: string | undefined): { label?: string; user?: string; ipa?: string } {
    if (!transcriptionHtml) return {};
    try {
        const userMatch = transcriptionHtml.match(/transcription-item\s+user-lang[\s\S]*?<span\s+class=\"transcription-text\">([\s\S]*?)<\/span>/i);
        const ipaMatch = transcriptionHtml.match(/transcription-item\s+ipa[\s\S]*?<span\s+class=\"transcription-text\">([\s\S]*?)<\/span>/i);
        const labelMatch = transcriptionHtml.match(/transcription-item\s+user-lang[\s\S]*?<span\s+class=\"transcription-label\">([\s\S]*?)<\/span>/i);
        return {
            label: labelMatch ? labelMatch[1].trim() : undefined,
            user: userMatch ? userMatch[1].trim() : undefined,
            ipa: ipaMatch ? ipaMatch[1].trim() : undefined,
        };
    } catch {
        return {};
    }
}

export function renderTranscriptionForAnki(card: any): string {
    const { transcription } = card;
    if (!transcription || !transcription.trim()) return '';

    const parts = extractTranscriptionParts(transcription);
    const label = parts.label || 'Transcription';
    const user = parts.user;
    const ipa = parts.ipa;

    if (!user && !ipa) return '';

    const userRow = user ? `
        <div style="margin:4px 0; text-align:center;">
            <span style="font-weight:600; font-size:12px; color:#64748B;">${label}:</span>
            <span style="font-size:14px; color:#334155; font-weight:600; margin-left:6px;">${user}</span>
        </div>
    ` : '';

    const ipaRow = ipa ? `
        <div style="margin:4px 0; text-align:center;">
            <span style="font-weight:600; font-size:12px; color:#64748B;">IPA:</span>
            <span style="font-family: 'Doulos SIL','Charis SIL','Times New Roman',serif; font-size:14px; color:#0F172A; margin-left:6px;">${ipa}</span>
        </div>
    ` : '';

    return `
        <div style="margin-top: 8px; padding: 10px; background-color:#F8FAFC; border:1px solid #E2E8F0; border-radius:6px; text-align:center;">
            <div style="color:#1E293B; font-weight:700; font-size:13px; margin-bottom:6px; display:inline-flex; align-items:center; gap:6px; justify-content:center;">
                <span>🔤</span>
                <span>Pronunciation</span>
            </div>
            ${userRow}
            ${ipaRow}
        </div>
    `;
}

export const extractRawBase64 = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    const dataPrefixIndex = trimmed.indexOf('base64,');
    if (dataPrefixIndex !== -1) {
        return trimmed.substring(dataPrefixIndex + 'base64,'.length).trim() || null;
    }
    return trimmed || null;
};

export const sanitizeForFilename = (text: string): string => {
    const cleaned = (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return cleaned || 'word';
};

const storeMediaFile = async (
    ankiConnectUrl: string,
    ankiConnectApiKey: string | null,
    filename: string,
    base64Data: string
): Promise<void> => {
    const payload = JSON.stringify({
        action: 'storeMediaFile',
        version: 6,
        key: ankiConnectApiKey,
        params: {
            filename,
            data: base64Data,
        },
    });

    const response = await backgroundFetch(ankiConnectUrl, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        throw new Error('Failed to store audio media file in Anki.');
    }

    const result = await response.json();
    if (result?.error) {
        throw new Error(`Anki error while storing media: ${result.error}`);
    }
};

export function format_back_lang_learning(card: any): string {
    const formatted_examples = (card.examples || [])
        .map((ex: any, index: number) => {
            const audioSource = card.exampleAudioTags?.[index] ||
                (card.examplesAudio ? card.examplesAudio[index] : '') || '';
            const pronunciation = card.example_transcriptions?.[index]
                || card.exampleTranscriptions?.[index]
                || null;
            return format_example(
                ex[0],
                card.text,
                ex[1],
                "0.8em",
                audioSource,
                pronunciation,
            );
        })
        .join('<br><br>');

    let imageHtml = '';
    if (card.image_base64) {
        let imageData = card.image_base64;

        // Extract the actual base64 data if it has a prefix
        if (imageData.startsWith('data:')) {
            const base64Prefix = 'base64,';
            const prefixIndex = imageData.indexOf(base64Prefix);
            if (prefixIndex !== -1) {
                // Extract just the base64 part without the prefix
                const rawBase64 = imageData.substring(prefixIndex + base64Prefix.length);
                // Anki format requires the proper data URI format for HTML
                imageHtml = `<div><img src="data:image/jpeg;base64,${rawBase64}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
            } else {
                // Fallback if prefix structure is unexpected
                imageHtml = `<div><img src="${imageData}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
            }
        } else {
            // If it's already just base64 data, use it directly with proper prefix
            imageHtml = `<div><img src="data:image/jpeg;base64,${imageData}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
        }
    }

    // Format linguistic information with beautiful styling
    let linguisticHtml = '';
    if (card.linguisticInfo && card.linguisticInfo.trim()) {
        // Parse the linguistic info and format it nicely
        const linguisticText = card.linguisticInfo.trim();

        // Split by lines and format each section
        const lines = linguisticText.split('\n').filter((line: string) => line.trim());
        let formattedLinguistic = '';

        lines.forEach((line: string) => {
            const trimmedLine = line.trim();

            // Check if this is a header line (starts with capital letter and ends with colon)
            if (trimmedLine.match(/^[А-ЯЁA-Z][^:]*:$/)) {
                formattedLinguistic += `<div style="color: #2563EB; font-weight: bold; margin-top: 12px; margin-bottom: 4px;">${trimmedLine}</div>`;
            }
            // Check if this is a bullet point or list item
            else if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
                const content = trimmedLine.replace(/^[•\-*]\s*/, '');
                formattedLinguistic += `<div style="margin-left: 16px; margin-bottom: 2px; color: #374151;">• ${content}</div>`;
            }
            // Check if this contains label-value pairs (like "Part of speech: Noun")
            else if (trimmedLine.includes(':') && !trimmedLine.endsWith(':')) {
                const [label, ...valueParts] = trimmedLine.split(':');
                const value = valueParts.join(':').trim();
                formattedLinguistic += `<div style="margin-bottom: 4px;"><span style="color: #6B7280; font-weight: 500;">${label.trim()}:</span> <span style="color: #111827;">${value}</span></div>`;
            }
            // Regular text
            else if (trimmedLine) {
                formattedLinguistic += `<div style="margin-bottom: 6px; color: #374151; line-height: 1.4;">${trimmedLine}</div>`;
            }
        });

        if (formattedLinguistic) {
            linguisticHtml = `
                <div style="margin-top: 20px; padding: 12px; background-color: #F8FAFC; border-left: 4px solid #2563EB; border-radius: 0 6px 6px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                    <div style="color: #1E40AF; font-weight: bold; font-size: 14px; margin-bottom: 8px; display: flex; align-items: center;">
                        <span style="margin-right: 6px;">📚</span>
                        Grammar & Linguistics
                    </div>
                    ${formattedLinguistic}
                </div>
            `;
        }
    }

    // Transcription block (inline-styled for Anki)
    const transcriptionHtml = renderTranscriptionForAnki(card);

    const audioTag = card.ankiAudioTag || '';
    const wordAudioBlock = audioTag
        ? `<div style="margin-bottom: 16px; text-align: center; padding: 10px; background: #F0F9FF; border-radius: 8px; border: 1px solid #BAE6FD;">
             <audio controls src="${audioTag.replace('[sound:', '').replace(']', '')}" style="width: 100%;"></audio>
           </div>`
        : '';

    return `
        ${wordAudioBlock}
        ${transcriptionHtml}
        <div style="margin-top: 10px;"><b>${card.translation}</b></div>
        <br>${formatted_examples}<br><br>
        ${imageHtml}
        ${linguisticHtml}
    `;
}

// Convert $...$ and $$...$$ to MathJax-friendly delimiters for Anki (\(\) and \[\])
function toMathJaxDelimiters(text: string): string {
    if (!text) return text;

    let result = text;

    // Protect code/pre blocks from accidental conversion
    const placeholders: string[] = [];
    result = result.replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, (m) => {
        placeholders.push(m);
        return `__CODE_BLOCK_${placeholders.length - 1}__`;
    });

    // Convert block formulas $$...$$ -> \[...\]
    result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => `\\[${inner}\]`);

    // Convert inline formulas $...$ -> \(...\)
    result = result.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, (_m, inner) => `\\(${inner}\\)`);

    // Restore code/pre blocks
    result = result.replace(/__CODE_BLOCK_(\d+)__/g, (_m, idx) => placeholders[Number(idx)]);

    return result;
}

// Smart list-safe formatter for general back content that preserves math
function format_back_general(back: string, image_base64?: string | null): string {
    const cleaned = back.replace(/^(Key points?:?)/i, '').trim();

    // If content already contains list or KaTeX HTML, keep it as-is (just normalize math delimiters)
    const looksLikeHtmlList = /<\s*(ul|ol|li)\b/i.test(cleaned);
    const looksLikeRenderedMath = /class\s*=\s*"[^"]*katex[^"]*"/i.test(cleaned);

    let bodyHtml = '';
    if (looksLikeHtmlList || looksLikeRenderedMath) {
        bodyHtml = cleaned;
    } else {
        // Split by lines; detect list markers only at line start
        const rawLines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const isListLine = (line: string) => /^(?:[-*•]\s+|\d+\.\s+)/.test(line);
        const listLines = rawLines.filter(isListLine);

        // Build HTML body: list if we have multiple list-like lines, else paragraphs
        if (listLines.length >= Math.max(2, Math.floor(rawLines.length / 2))) {
            const items = rawLines
                .filter(l => l.length > 0)
                .map(l => l.replace(/^(?:[-*•]\s+|\d+\.\s+)/, ''))
                .map(item => `<li>${item}</li>`)
                .join('');
            bodyHtml = `<b>Key points:</b>\n<ul>${items}</ul>`;
        } else {
            // Keep original structure with paragraphs; preserve single-line answers too
            if (rawLines.length <= 1) {
                bodyHtml = `<div>${rawLines[0] || cleaned}</div>`;
            } else {
                bodyHtml = rawLines.map(l => `<p>${l}</p>`).join('\n');
            }
        }
    }

    // Images
    let imageHtml = '';
    if (image_base64) {
        let imageData = image_base64;
        if (imageData.startsWith('data:')) {
            const base64Prefix = 'base64,';
            const prefixIndex = imageData.indexOf(base64Prefix);
            if (prefixIndex !== -1) {
                const rawBase64 = imageData.substring(prefixIndex + base64Prefix.length);
                imageHtml = `<div><img src="data:image/jpeg;base64,${rawBase64}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
            } else {
                imageHtml = `<div><img src="${imageData}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
            }
        } else {
            imageHtml = `<div><img src="data:image/jpeg;base64,${imageData}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
        }
    }

    // Convert math delimiters for Anki MathJax
    const mathReady = toMathJaxDelimiters(bodyHtml);

    return `\n${mathReady}\n${imageHtml}\n`;
}

// A generic AnkiConnect call. AnkiConnect answers HTTP 200 whether or not the action
// worked; failure lives only in the body's `error`.
const ankiInvoke = async (
    ankiConnectUrl: string,
    ankiConnectApiKey: string | null,
    action: string,
    params: Record<string, unknown> = {},
): Promise<any> => {
    const response = await backgroundFetch(ankiConnectUrl, {
        method: 'POST',
        body: JSON.stringify({ action, version: 6, key: ankiConnectApiKey, params }),
        headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
        throw new Error(`AnkiConnect ${action} failed with HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data?.error) {
        throw new Error(String(data.error));
    }
    return data?.result;
};

/**
 * Vaulto's own note types. The stock "Basic" only has Front and Back, so the sentence a
 * word was met in could at best be pasted into the answer; a note type of our own gives
 * it and the page a field each, which is what lets an Anki user search, sort and template
 * on them. The names are ours, so they are the same in every Anki language — the stock
 * names are translated ("Basic" is "Простая" in a Russian profile), which is why sending
 * "Basic" has always been a gamble.
 */
export const VAULTO_NOTE_TYPE = 'Vaulto Basic';
export const VAULTO_CLOZE_NOTE_TYPE = 'Vaulto Cloze';

const CARD_CSS = `.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }
.vaulto-sentence { margin-top: 1em; font-size: 0.9em; color: #333; }
.vaulto-sentence b { color: #1d4ed8; }
.vaulto-source { margin-top: 0.5em; font-size: 0.7em; }
.vaulto-source a { color: #6b7280; }`;

const BASIC_MODEL = {
    modelName: VAULTO_NOTE_TYPE,
    inOrderFields: ['Front', 'Back', 'Sentence', 'Source'],
    css: CARD_CSS,
    cardTemplates: [{
        Name: 'Card 1',
        Front: '{{Front}}',
        Back: '{{FrontSide}}<hr id=answer>{{Back}}'
            + '{{#Sentence}}<div class="vaulto-sentence">{{Sentence}}</div>{{/Sentence}}'
            + '{{#Source}}<div class="vaulto-source">{{Source}}</div>{{/Source}}',
    }],
};

const CLOZE_MODEL = {
    modelName: VAULTO_CLOZE_NOTE_TYPE,
    inOrderFields: ['Text', 'Back Extra', 'Source'],
    css: CARD_CSS + '\n.cloze { font-weight: bold; color: blue; }',
    isCloze: true,
    cardTemplates: [{
        Name: 'Cloze',
        Front: '{{cloze:Text}}',
        Back: '{{cloze:Text}}<br>{{Back Extra}}'
            + '{{#Source}}<div class="vaulto-source">{{Source}}</div>{{/Source}}',
    }],
};

// Creates the note type on first use; on later runs only adds fields a newer version of
// the extension introduced, so a user's own template edits survive. Returns false when
// AnkiConnect refused, in which case the caller falls back to the stock model.
const ensureNoteType = async (
    ankiConnectUrl: string,
    ankiConnectApiKey: string | null,
    model: typeof BASIC_MODEL | typeof CLOZE_MODEL,
): Promise<boolean> => {
    try {
        const names: string[] = await ankiInvoke(ankiConnectUrl, ankiConnectApiKey, 'modelNames');
        if (!names.includes(model.modelName)) {
            await ankiInvoke(ankiConnectUrl, ankiConnectApiKey, 'createModel', model);
            return true;
        }
        const existing: string[] = await ankiInvoke(ankiConnectUrl, ankiConnectApiKey, 'modelFieldNames', {
            modelName: model.modelName,
        });
        for (const fieldName of model.inOrderFields) {
            if (!existing.includes(fieldName)) {
                await ankiInvoke(ankiConnectUrl, ankiConnectApiKey, 'modelFieldAdd', {
                    modelName: model.modelName, fieldName,
                });
            }
        }
        return true;
    } catch (error) {
        console.warn(`Could not prepare the "${model.modelName}" note type:`, error);
        return false;
    }
};

const escapeHtml = (text: string): string =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The first place the word appears in its sentence — the selection came from that very
// sentence, so an exact, case-insensitive match is expected; a miss means the sentence
// was edited out from under the word and nothing should be marked.
const findWordInSentence = (sentence: string, word: string): { start: number; end: number } | null => {
    const needle = word.trim();
    if (!needle || !sentence) return null;
    const match = new RegExp(escapeRegExp(needle), 'i').exec(sentence);
    return match ? { start: match.index, end: match.index + match[0].length } : null;
};

/** The Sentence field: the sentence with the studied word in bold. */
export const formatSentenceField = (sentence: string | null | undefined, word: string): string => {
    const clean = (sentence || '').trim();
    if (!clean) return '';
    const hit = findWordInSentence(clean, word);
    if (!hit) return escapeHtml(clean);
    return `${escapeHtml(clean.slice(0, hit.start))}<b>${escapeHtml(clean.slice(hit.start, hit.end))}</b>${escapeHtml(clean.slice(hit.end))}`;
};

/** The Source field: a link back to the page, labelled with its title or host. */
export const formatSourceField = (url: string | null | undefined, title: string | null | undefined): string => {
    const cleanUrl = (url || '').trim();
    if (!/^https?:\/\//.test(cleanUrl)) return '';
    let label = (title || '').trim();
    if (!label) {
        try { label = new URL(cleanUrl).hostname.replace(/^www\./, ''); } catch { label = cleanUrl; }
    }
    return `<a href="${escapeHtml(cleanUrl)}">${escapeHtml(label)}</a>`;
};

/**
 * The sentence as a cloze deletion: the studied word becomes {{c1::word}}. Null when the
 * word cannot be found in the sentence, or when the sentence *is* the word — a cloze
 * with nothing around the gap tests nothing.
 */
export const buildClozeText = (sentence: string | null | undefined, word: string): string | null => {
    const clean = (sentence || '').trim();
    const hit = findWordInSentence(clean, word);
    if (!hit || hit.end - hit.start >= clean.length) return null;
    const gap = clean.slice(hit.start, hit.end).replace(/::/g, ':\u200b:').replace(/}}/g, '}\u200b}');
    return `${escapeHtml(clean.slice(0, hit.start))}{{c1::${escapeHtml(gap)}}}${escapeHtml(clean.slice(hit.end))}`;
};

export interface AnkiExportOptions {
    /** Also add a cloze note from each card's source sentence, when it has one. */
    clozeFromSentence?: boolean;
}

export const createAnkiCards = async (
    mode: Modes,
    ankiConnectUrl: string,
    ankiConnectApiKey: string | null,
    deckName: string,
    modelName: string,
    cards: CardLangLearning[] | CardGeneral[],
    options: AnkiExportOptions = {},
) => {
    try {
        const createDeckPayload = JSON.stringify({
            action: 'createDeck',
            version: 6,
            key: ankiConnectApiKey,
            params: { deck: deckName },
        });

        const createDeckResponse = await backgroundFetch(ankiConnectUrl, {
            method: 'POST',
            body: createDeckPayload,
            headers: { 'Content-Type': 'application/json' },
        });

        // AnkiConnect always answers with HTTP 200, even on failure — success/failure is
        // only ever signaled through the JSON body's `error` field, never the HTTP status.
        if (!createDeckResponse.ok) {
            throw new Error('Failed to create deck.');
        }
        const createDeckResult = await createDeckResponse.json();
        if (createDeckResult?.error) {
            throw new Error(`Failed to create deck: ${createDeckResult.error}`);
        }

        // Language cards go to Vaulto's own note type so the sentence and the page get
        // fields of their own. If AnkiConnect will not create it (an old add-on, a locked
        // collection), the stock model still gets the card, sentence folded into Back.
        const isLanguage = mode === Modes.LanguageLearning;
        const useVaultoModel = isLanguage
            && await ensureNoteType(ankiConnectUrl, ankiConnectApiKey, BASIC_MODEL);
        const langModelName = useVaultoModel ? VAULTO_NOTE_TYPE : modelName;
        const clozeNotes: Array<Record<string, unknown>> = [];
        const wantCloze = isLanguage && Boolean(options.clozeFromSentence)
            && cards.some((card) => 'sentence' in card && Boolean(card.sentence))
            && await ensureNoteType(ankiConnectUrl, ankiConnectApiKey, CLOZE_MODEL);

        const notes = await Promise.all(cards.map(async (card, index) => {
            let fields;
            let noteModelName = modelName;
            if (mode === Modes.LanguageLearning && 'translation' in card && 'examples' in card && 'image_base64' in card) {
                const langCard = card as CardLangLearning;
                const rawAudioBase64 = extractRawBase64(langCard.word_audio_base64);
                let audioTag = '';
                if (rawAudioBase64) {
                    const filename = `${sanitizeForFilename(langCard.text)}_${Date.now()}_${index}.mp3`;
                    await storeMediaFile(ankiConnectUrl, ankiConnectApiKey, filename, rawAudioBase64);
                    audioTag = `[sound:${filename}]`;
                }
                const exampleAudioTags: Array<string | null> = [];
                const examplesAudio = Array.isArray(langCard.examples_audio_base64) ? langCard.examples_audio_base64 : [];
                for (let exampleIndex = 0; exampleIndex < examplesAudio.length; exampleIndex += 1) {
                    const rawExampleAudio = extractRawBase64(examplesAudio[exampleIndex]);
                    if (!rawExampleAudio) {
                        exampleAudioTags.push(null);
                        continue;
                    }
                    const filename = `${sanitizeForFilename(langCard.text)}_ex_${exampleIndex}_${Date.now()}_${index}.mp3`;
                    await storeMediaFile(ankiConnectUrl, ankiConnectApiKey, filename, rawExampleAudio);
                    exampleAudioTags.push(`[sound:${filename}]`);
                }
                const cardForRender: CardLangLearning = {
                    ...langCard,
                    ankiAudioTag: audioTag,
                    exampleAudioTags
                };
                const back = format_back_lang_learning(cardForRender);
                const sentenceHtml = formatSentenceField(langCard.sentence, langCard.text);
                const sourceHtml = formatSourceField(langCard.source_url, langCard.source_title);
                noteModelName = langModelName;
                fields = useVaultoModel
                    ? { Front: cardForRender.text, Back: back, Sentence: sentenceHtml, Source: sourceHtml }
                    : {
                        Front: cardForRender.text,
                        Back: back
                            + (sentenceHtml ? `<div class="vaulto-sentence">${sentenceHtml}</div>` : '')
                            + (sourceHtml ? `<div class="vaulto-source">${sourceHtml}</div>` : ''),
                    };

                if (wantCloze) {
                    const clozeText = buildClozeText(langCard.sentence, langCard.text);
                    if (clozeText) {
                        clozeNotes.push({
                            deckName,
                            modelName: VAULTO_CLOZE_NOTE_TYPE,
                            fields: { Text: clozeText, 'Back Extra': back, Source: sourceHtml },
                            options: { allowDuplicate: false },
                            tags: [],
                        });
                    }
                }
            } else if (mode === Modes.GeneralTopic && 'back' in card) {
                const generalCard = card as CardGeneral;
                fields = {
                    // Ensure formulas on both sides render well in Anki via MathJax
                    Front: toMathJaxDelimiters(generalCard.front),
                    Back: format_back_general(generalCard.back, generalCard.image_base64),
                };
            }
            return {
                deckName,
                modelName: noteModelName,
                fields,
                options: { allowDuplicate: false },
                tags: [],
            };
        }));

        const addNotesPayload = JSON.stringify({
            action: 'addNotes',
            version: 6,
            key: ankiConnectApiKey,
            params: { notes },
        });

        const response = await backgroundFetch(ankiConnectUrl, {
            method: 'POST',
            body: addNotesPayload,
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error('Failed to add notes.');
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(getAnkiSaveErrorMessage(result.error, cards.length));
        }

        // addNotes returns one entry per input note: the new note ID on success, or null
        // if that specific note was rejected (most commonly a duplicate, since we always
        // send allowDuplicate: false). A null here does NOT populate `result.error` above,
        // so callers that only checked for a thrown error would otherwise treat this as a
        // full success even though nothing was actually saved to Anki for that note.
        const noteResults: Array<number | null> = Array.isArray(result.result) ? result.result : [];
        if (noteResults.length > 0 && noteResults.every((id) => id === null)) {
            throw new Error('cannot create note because it is a duplicate');
        }

        // The cloze notes ride behind the cards they came from. They are an extra, so
        // they never change which cards count as exported: a cloze rejected as a
        // duplicate (the same sentence, exported before) is simply already there.
        if (clozeNotes.length > 0) {
            try {
                await ankiInvoke(ankiConnectUrl, ankiConnectApiKey, 'addNotes', { notes: clozeNotes });
            } catch (error) {
                console.warn('Cloze notes were not added:', error);
            }
        }

        return noteResults;
    } catch (error) {
        throw error; // Пробрасываем ошибку, чтобы вызвать showError в компоненте
    }
};

export async function imageUrlToBase64(url: string): Promise<string | null> {
    if (!url) {
        return null;
    }

    if (url.startsWith('data:image/')) {
        return url;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        throw new Error(`Unsupported image URL for base64 conversion: ${url.slice(0, 32)}`);
    }

    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(new Error('Timed out while converting image to base64'));
        }, 15000);

        chrome.runtime.sendMessage(
            url,
            (response: { status: boolean, data?: string, error?: string }) => {
                window.clearTimeout(timeoutId);

                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                if (response?.status && response.data !== undefined) {
                    resolve(response.data);
                } else {
                    const errorMessage = response?.error || 'Unknown image conversion error';
                    console.error('Error fetching image:', errorMessage);
                    reject(new Error(errorMessage));
                }
            }
        );
    });
}

interface AnkiResponse {
    result: string[];
    error: string | null;
}

interface DeckResponse {
    result: Array<{
        deckId: string;
        name: string;
    }>;
    error: string | null;
}

const getAnkiConnectAvailabilityError = (error: unknown): string | null => {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();

    if (
        normalized.includes('failed to fetch') ||
        normalized.includes('networkerror') ||
        normalized.includes('err_connection_refused') ||
        normalized.includes('err_connection_reset') ||
        normalized.includes('status: 0')
    ) {
        return 'AnkiConnect unavailable';
    }

    return null;
};

const normalizeAnkiUrl = (url: string | null | undefined) => {
    const fallback = 'http://127.0.0.1:8765';
    if (!url) {
        return fallback;
    }

    try {
        const parsed = new URL(url.trim());
        // strip trailing slash to avoid double slashes when we reuse the base
        parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        return parsed.toString();
    } catch (error) {
        console.warn('Invalid AnkiConnect URL provided, falling back to default.', error);
        return fallback;
    }
};

export interface AnkiImportedNote {
    noteId: number;
    front: string;
    back: string;
    tags: string[];
}

// Anki fields carry HTML (and [sound:...] refs for audio) — stripped down to plain text
// since imported notes land as ordinary front/back Vaulto cards, not full Anki renders.
const stripAnkiFieldHtml = (value: string): string =>
    (value || '')
        .replace(/\[sound:[^\]]*\]/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?div[^>]*>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

// Read-only counterpart to createAnkiCards: pulls the notes already sitting in an existing
// Anki deck so they can be imported as Vaulto cards, rather than only ever pushing cards
// out to Anki. Most note types (Basic, Basic and reversed, Cloze's first two fields, …) put
// the prompt in the first field and the answer in the second, which is good enough for a
// plain front/back import — anything richer the user can still edit afterwards.
export const fetchNotesInDeck = async (
    ankiConnectUrl: string,
    apiKey: string | null,
    deckName: string
): Promise<{ notes: AnkiImportedNote[]; error: string | null }> => {
    const endpoint = normalizeAnkiUrl(ankiConnectUrl);
    // A deck name can itself contain a quote or backslash (rare, but Anki allows it) —
    // unescaped, either would break out of the quoted search term below.
    const escapedDeckName = deckName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    try {
        const findResponse = await backgroundFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'findNotes',
                version: 6,
                key: apiKey,
                params: { query: `deck:"${escapedDeckName}"` },
            }),
        });
        if (!findResponse.ok) {
            throw new Error(`HTTP error! Status: ${findResponse.status}`);
        }
        const findData = await findResponse.json();
        if (findData.error) {
            return { notes: [], error: findData.error };
        }

        const noteIds: number[] = Array.isArray(findData.result) ? findData.result : [];
        if (noteIds.length === 0) {
            return { notes: [], error: null };
        }

        const infoResponse = await backgroundFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'notesInfo',
                version: 6,
                key: apiKey,
                params: { notes: noteIds },
            }),
        });
        if (!infoResponse.ok) {
            throw new Error(`HTTP error! Status: ${infoResponse.status}`);
        }
        const infoData = await infoResponse.json();
        if (infoData.error) {
            return { notes: [], error: infoData.error };
        }

        const rawNotes: any[] = Array.isArray(infoData.result) ? infoData.result : [];
        const notes: AnkiImportedNote[] = rawNotes
            .map((note): AnkiImportedNote => {
                const fieldNames = Object.keys(note?.fields || {});
                const frontField = fieldNames[0];
                const backField = fieldNames[1];
                return {
                    noteId: note.noteId,
                    front: stripAnkiFieldHtml(frontField ? note.fields[frontField]?.value : ''),
                    back: stripAnkiFieldHtml(backField ? note.fields[backField]?.value : ''),
                    tags: Array.isArray(note?.tags) ? note.tags : [],
                };
            })
            .filter((note) => note.front || note.back);

        return { notes, error: null };
    } catch (error) {
        return {
            notes: [],
            error: getAnkiConnectAvailabilityError(error) || 'Failed to load notes from Anki',
        };
    }
};

export const fetchDecks = async (ankiConnectUrl: string, apiKey: string | null): Promise<DeckResponse> => {
    try {
        const endpoint = normalizeAnkiUrl(ankiConnectUrl);
        const response = await backgroundFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deckNames', version: 6, key: apiKey }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json() as AnkiResponse;

        // Transform string array into Deck objects
        if (data.result) {
            return {
                result: data.result.map(deckName => ({
                    deckId: deckName,
                    name: deckName
                })),
                error: data.error
            };
        }
        return data as unknown as DeckResponse;
    } catch (error) {
        return {
            result: [],
            error: getAnkiConnectAvailabilityError(error) || 'Failed to load Anki decks'
        };
    }
};
