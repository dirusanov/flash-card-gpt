// Opt-in integration check against a running Anki + AnkiConnect. This creates
// only clearly named QA notes; it never deletes or changes existing notes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

if (process.argv[2] !== '--run' && process.argv[2] !== '--check-deck') {
    console.error('Run with --run to create QA notes, or --check-deck "Deck Name" for a read-only check.');
    process.exit(2);
}
if (process.argv[2] === '--check-deck' && !process.argv[3]) {
    console.error('--check-deck requires a deck name.');
    process.exit(2);
}

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: filename,
    }).outputText;
    module._compile(output, filename);
};

const backgroundFetchPath = path.resolve(__dirname, '../../src/services/backgroundFetch.ts');
require.cache[backgroundFetchPath] = {
    id: backgroundFetchPath,
    filename: backgroundFetchPath,
    loaded: true,
    exports: { backgroundFetch: (url, options) => fetch(url, options) },
};

const { Modes } = require('../../src/constants.ts');
const { createAnkiCards, fetchNotesInDeck, ANKI_TEXT_FILE_HEADER, formatAnkiTextFileRow, VAULTO_CLOZE_NOTE_TYPE } = require('../../src/services/ankiService.ts');
const endpoint = 'http://127.0.0.1:8765';
const deck = `Vaulto QA Integration ${new Date().toISOString().replace(/[:.]/g, '-')}`;
const pngBase64 = fs.readFileSync(path.resolve(__dirname, '../../src/assets/img/logo-128.png')).toString('base64');

const call = async (action, params = {}) => {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: 6, params }),
    });
    assert.equal(response.ok, true, `${action}: HTTP ${response.status}`);
    const data = await response.json();
    assert.equal(data.error, null, `${action}: ${data.error}`);
    return data.result;
};

const languageCard = (text, extra = {}) => ({
    text,
    translation: 'Тестовый перевод',
    examples: [[`Example for ${text}`, 'Тестовый пример']],
    image_base64: null,
    ...extra,
});

(async () => {
    assert.equal(await call('version'), 6);
    if (process.argv[2] === '--check-deck') {
        const imported = await fetchNotesInDeck(endpoint, null, process.argv[3]);
        assert.equal(imported.error, null);
        assert.ok(imported.notes.some((note) => note.front === 'Dogs have sensory capabilities.'));
        console.log(JSON.stringify({ deck: process.argv[3], imported: imported.notes.length, clozePlainText: true }));
        return;
    }
    const crossDeck = await createAnkiCards(Modes.LanguageLearning, endpoint, null, deck, 'Basic', [
        languageCard('sensory', {
            sentence: 'Dogs have sensory capabilities.',
            source_url: 'https://example.com/qa',
            source_title: 'QA source',
            image_base64: pngBase64,
        }),
    ], { clozeFromSentence: true });
    assert.equal(crossDeck.length, 1);
    assert.ok(crossDeck[0], 'same word in a different deck must be allowed');

    await assert.rejects(
        createAnkiCards(Modes.LanguageLearning, endpoint, null, deck, 'Basic', [languageCard('sensory')]),
        /duplicate/,
    );

    const batch = await createAnkiCards(Modes.LanguageLearning, endpoint, null, deck, 'Basic', [
        languageCard('serendipity'),
        languageCard('capabilities'),
        languageCard('sensory'),
    ]);
    assert.ok(batch[0] && batch[1]);
    assert.equal(batch[2], null);

    const general = await createAnkiCards(Modes.GeneralTopic, endpoint, null, deck, 'Basic', [{
        text: 'Vaulto QA image',
        front: 'Vaulto QA image',
        back: 'PNG should appear below.',
        image_base64: `data:image/png;base64,${pngBase64}`,
    }]);
    assert.ok(general[0]);

    const info = await call('notesInfo', { notes: [crossDeck[0], batch[0], batch[1], general[0]] });
    assert.equal(info.length, 4);
    for (const imageNote of [info[0], info[3]]) {
        const filename = /<img src="([^"]+\.png)"/.exec(imageNote.fields.Back.value)?.[1];
        assert.ok(filename, 'Anki note should refer to a stored PNG media file');
        assert.equal(await call('retrieveMediaFile', { filename }), pngBase64);
    }
    assert.match(info[0].fields.Sentence.value, /<b>sensory<\/b>/);
    assert.match(info[0].fields.Source.value, /example\.com\/qa/);

    const ids = await call('findNotes', { query: `deck:"${deck}" note:"${VAULTO_CLOZE_NOTE_TYPE}"` });
    assert.equal(ids.length, 1, 'one cloze note should be created');
    const clozeInfo = await call('notesInfo', { notes: ids });
    assert.match(clozeInfo[0].fields.Text.value, /{{c1::sensory}}/);

    const imported = await fetchNotesInDeck(endpoint, null, deck);
    assert.equal(imported.error, null);
    assert.equal(imported.notes.length, 5);
    assert.ok(imported.notes.some((note) => note.front === 'sensory'));
    assert.ok(imported.notes.some((note) => note.front === 'Vaulto QA image'));
    assert.ok(imported.notes.some((note) => note.front === 'Dogs have sensory capabilities.'));

    const fileFixture = path.join(fs.mkdtempSync('/private/tmp/vaulto-anki-import-'), 'cards.txt');
    fs.writeFileSync(fileFixture,
        ANKI_TEXT_FILE_HEADER + formatAnkiTextFileRow(Modes.GeneralTopic, {
            text: 'Vaulto QA PNG import',
            front: 'Vaulto QA PNG import',
            back: 'PNG import check',
            image_base64: `data:image/png;base64,${pngBase64}`,
        }),
        'utf8');

    console.log(JSON.stringify({ deck, crossDeck, batch, general, cloze: ids, imported: imported.notes.length, fileFixture }, null, 2));
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
