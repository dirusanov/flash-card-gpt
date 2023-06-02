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

export interface Card {
    word: string;
    translation: string;
    examples: Array<[string, string | null]>;
    image_base64: string | null;
}

function format_back(card: Card): string {
    const formatted_examples = card.examples
        .map((ex) => format_example(ex[0], card.word, ex[1]))
        .join('<br><br>');

    const imageTag = card.image_base64
        ? `<img src='${card.image_base64}' alt=''/>`
        : '';

    return `
        <b>${card.translation}</b>
        <br><br>${formatted_examples}<br><br>
        ${imageTag}
    `;
}

export const createAnkiCards = async (ankiConnectUrl: string, ankiConnectApiKey: string, deckName: string, modelName: string, cards: Card[]) => {
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

    // Создаем карточки с заданными данными
    const notes = cards.map((card) => {
        const fields = {
            Front: card.word,
            Back: format_back(card),
        };
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
