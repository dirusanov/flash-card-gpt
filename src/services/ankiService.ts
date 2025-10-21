import { Modes } from '../constants';

function format_example(
    example: string,
    word: string,
    translation: string | null = null,
    font_size: string = "0.8em"
): string {
    const formatted_example = example.replace(word, `<b>${word}</b>`);
    if (translation) {
        const translated_sentence = translation.split(" ").slice(1).join(" ");
        return `${formatted_example}<br><span style='font-size: ${font_size};'><i>${translated_sentence}</i></span>`;
    } else {
        return formatted_example;
    }
}

export interface CardLangLearning {
    text: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image_base64: string | null;
    linguisticInfo?: string;
    transcription?: string; // HTML with user-language + IPA
}

export interface CardGeneral {
    text: string;
    front: string;
    back: string;
    image_base64?: string | null;
}

function extractTranscriptionParts(transcriptionHtml: string | undefined): { label?: string; user?: string; ipa?: string } {
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

function renderTranscriptionForAnki(card: CardLangLearning): string {
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

function format_back_lang_learning(card: CardLangLearning): string {
    const formatted_examples = card.examples
        .map((ex) => format_example(ex[0], card.text, ex[1]))
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
        const lines = linguisticText.split('\n').filter(line => line.trim());
        let formattedLinguistic = '';
        
        lines.forEach(line => {
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

    return `
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

export const createAnkiCards = async (
  mode: Modes,
  ankiConnectUrl: string,
  ankiConnectApiKey: string | null,
  deckName: string,
  modelName: string,
  cards: CardLangLearning[] | CardGeneral[]
) => {
    try {
        const createDeckPayload = JSON.stringify({
            action: 'createDeck',
            version: 6,
            key: ankiConnectApiKey,
            params: { deck: deckName },
        });

        const createDeckResponse = await fetch(ankiConnectUrl, {
            method: 'POST',
            body: createDeckPayload,
            headers: { 'Content-Type': 'application/json' },
        });

        if (!createDeckResponse.ok) {
            throw new Error('Failed to create deck.');
        }

        const notes = cards.map((card) => {
            let fields;
            if (mode === Modes.LanguageLearning && 'translation' in card && 'examples' in card && 'image_base64' in card) {
                fields = {
                    Front: card.text,
                    Back: format_back_lang_learning(card as CardLangLearning),
                };
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
                modelName,
                fields,
                options: { allowDuplicate: false },
                tags: [],
            };
        });

        const addNotesPayload = JSON.stringify({
            action: 'addNotes',
            version: 6,
            key: ankiConnectApiKey,
            params: { notes },
        });

        const response = await fetch(ankiConnectUrl, {
            method: 'POST',
            body: addNotesPayload,
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            throw new Error('Failed to add notes.');
        }

        const result = await response.json();
        if (result.error) {
            throw new Error(`Anki error: ${result.error}`);
        }
        return result.result;
    } catch (error) {
        throw error; // Пробрасываем ошибку, чтобы вызвать showError в компоненте
    }
};

export async function imageUrlToBase64(url: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            url,
            (response: { status: boolean, data?: string, error?: string }) => {
                if (response.status && response.data !== undefined) {
                    resolve(response.data);
                } else {
                    console.error('Error fetching image:', response.error);
                    reject(null);
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

export const fetchDecks = async (ankiConnectUrl: string, apiKey: string | null): Promise<DeckResponse> => {
    try {
        const endpoint = normalizeAnkiUrl(ankiConnectUrl);
        const response = await fetch(endpoint, {
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
        console.error('Error fetching decks:', error);
        throw error;
    }
};
