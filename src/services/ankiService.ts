import { Modes } from "../constants";

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
}

export interface CardGeneral {
    text: string;
    front: string;
    back: string;
}

function format_back_lang_learning(card: CardLangLearning): string {
    const formatted_examples = card.examples
        .map((ex) => format_example(ex[0], card.text, ex[1]))
        .join('<br><br>');

    const backgroundImageDiv = card.image_base64
        ? `<div style='background-image: url("${card.image_base64}"); background-size: cover; background-position: center; background-repeat: 
            no-repeat; width: 350px; height: 350px; margin: 0 auto;'></div>`
        : '';

    return `
        <b>${card.translation}</b>
        <br><br>${formatted_examples}<br><br>
        ${backgroundImageDiv}
    `;
}

function format_back_general(back: string): string {
    const points = back.replace("Key points:", "").trim().split("-");
    const htmlPoints = points.map(point => `<li>${point.trim()}</li>`).join("");

    return `
        <b>Key points:</b>
        <ul>
            ${htmlPoints}
        </ul>
    `;
}

export const createAnkiCards = async (
        mode: Modes, ankiConnectUrl: string, ankiConnectApiKey: string | null, deckName: string, modelName: string, cards: CardLangLearning[] | CardGeneral[]
    ) => {
    // Создаем новую колоду, если ее еще нет
    const createDeckPayload = JSON.stringify({
        action: 'createDeck',
        version: 6,
        key: ankiConnectApiKey,
        params: { deck: deckName },
    });

    await fetch(ankiConnectUrl, {
        method: 'POST',
        body: createDeckPayload,
        headers: { 'Content-Type': 'application/json' },
    });
    const notes = cards.map((card) => {
        let fields;
        if (mode === Modes.LanguageLearning && 'translation' in card && 'examples' in card && 'image_base64' in card) {
            fields = {
                Front: card.text,
                Back: format_back_lang_learning(card as CardLangLearning),
            };
        } else if (mode === Modes.GeneralTopic && 'back' in card) {
            fields = {
                Front: card.front,
                Back: format_back_general(card.back),
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

    const result = await response.json();
    return result.result;
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
