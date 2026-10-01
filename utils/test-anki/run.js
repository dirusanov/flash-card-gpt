const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
        fileName: filename,
    }).outputText;
    module._compile(output, filename);
};

const backgroundFetchPath = path.resolve(__dirname, '../../src/services/backgroundFetch.ts');
let respond;
const calls = [];
require.cache[backgroundFetchPath] = {
    id: backgroundFetchPath,
    filename: backgroundFetchPath,
    loaded: true,
    exports: {
        backgroundFetch: async (_url, options) => {
            const request = JSON.parse(options.body);
            calls.push(request);
            const response = await respond(request);
            return {
                ok: response.ok ?? true,
                status: response.status ?? 200,
                json: async () => ({ result: response.result ?? null, error: response.error ?? null }),
            };
        },
    },
};

const { Modes } = require('../../src/constants.ts');
const {
    buildClozeText,
    createAnkiCards,
    fetchNotesInDeck,
    ANKI_TEXT_FILE_HEADER,
    formatAnkiTextFileRow,
    format_back_lang_learning,
    formatImageForAnki,
    VAULTO_NOTE_TYPE,
    VAULTO_CLOZE_NOTE_TYPE,
} = require('../../src/services/ankiService.ts');

const card = (text, extra = {}) => ({
    text,
    translation: 'перевод',
    examples: [['Example with ' + text, 'Перевод примера']],
    image_base64: null,
    ...extra,
});
const send = (cards, deck = 'Vaulto QA Connect', options = {}) =>
    createAnkiCards(Modes.LanguageLearning, 'http://127.0.0.1:8765', null, deck, 'Basic', cards, options);

const reset = (handler) => {
    calls.length = 0;
    respond = handler;
};

(async () => {
    reset((request) => {
        if (request.action === 'modelNames' || request.action === 'findNotes') return { result: [] };
        if (request.action === 'addNotes') return { result: [101, 102] };
        return { result: null };
    });
    assert.deepEqual(await send([card('sensory'), card('serendipity')]), [101, 102]);
    const lookup = calls.find((request) => request.action === 'findNotes');
    assert.match(lookup.params.query, /^deck:"Vaulto QA Connect" \(/);
    const add = calls.find((request) => request.action === 'addNotes');
    assert.equal(add.params.notes.length, 2);
    assert.equal(add.params.notes[0].modelName, VAULTO_NOTE_TYPE);
    assert.deepEqual(add.params.notes[0].options, {
        allowDuplicate: false,
        duplicateScope: 'deck',
        duplicateScopeOptions: { checkAllModels: true },
    });

    reset((request) => {
        if (request.action === 'modelNames') return { result: [VAULTO_NOTE_TYPE] };
        if (request.action === 'modelFieldNames') return { result: ['Front', 'Back', 'Sentence', 'Source'] };
        if (request.action === 'findNotes') return { result: [99] };
        if (request.action === 'notesInfo') return { result: [{ fields: { Front: { value: 'sensory' } } }] };
        if (request.action === 'addNotes') return { result: [] };
        return { result: null };
    });
    await assert.rejects(send([card('sensory', { word_audio_base64: 'dGVzdA==' })]), /duplicate/);
    assert.equal(calls.some((request) => request.action === 'storeMediaFile'), false);

    reset((request) => {
        if (request.action === 'modelNames' || request.action === 'findNotes') return { result: [] };
        if (request.action === 'addNotes') return { result: [103, null] };
        return { result: null };
    });
    assert.deepEqual(await send([card('one'), card('two')]), [103, null]);

    reset((request) => {
        if (request.action === 'modelNames' || request.action === 'findNotes') return { result: [] };
        if (request.action === 'addNotes') return { result: [104] };
        return { result: null };
    });
    const sentence = 'She showed resilience after the setback.';
    assert.deepEqual(await send([card('resilience', { sentence, source_url: 'https://example.com', source_title: 'Example' })], 'Vaulto QA Connect', { clozeFromSentence: true }), [104]);
    const addCalls = calls.filter((request) => request.action === 'addNotes');
    assert.equal(addCalls.length, 2);
    assert.equal(addCalls[1].params.notes[0].modelName, VAULTO_CLOZE_NOTE_TYPE);
    assert.equal(addCalls[1].params.notes[0].fields.Text, buildClozeText(sentence, 'resilience'));
    assert.match(addCalls[0].params.notes[0].fields.Source, /example\.com/);

    const pngBase64 = fs.readFileSync(path.resolve(__dirname, '../../src/assets/img/logo-128.png')).toString('base64');
    assert.match(format_back_lang_learning(card('image fixture', { image_base64: pngBase64 })), /data:image\/png;base64,/);
    assert.match(formatImageForAnki(`data:image/png;base64,${pngBase64}`), /data:image\/png;base64,/);
    assert.match(formatImageForAnki('https://example.com/a.png?x=1&y=2'), /x=1&amp;y=2/);
    assert.equal(formatImageForAnki('data:text/html;base64,dGVzdA=='), '');
    const languageRow = formatAnkiTextFileRow(Modes.LanguageLearning, card('A & B', {
        sentence: 'A & B appear together.',
        source_url: 'https://example.com/qa?a=1&b=2',
        source_title: 'QA page',
        image_base64: `data:image/png;base64,${pngBase64}`,
        ankiAudioTag: 'data:audio/mpeg;base64,dGVzdA==',
    }));
    assert.equal(ANKI_TEXT_FILE_HEADER, '#separator:tab\n#html:true\n');
    assert.match(languageRow, /^A &amp; B\t/);
    assert.match(languageRow, /data:image\/png;base64,/);
    assert.match(languageRow, /data:audio\/mpeg;base64,/);
    assert.match(languageRow, /vaulto-sentence/);
    assert.match(languageRow, /example\.com\/qa\?a=1&amp;b=2/);
    assert.equal(languageRow.split('\t').length, 2);
    assert.equal(languageRow.trimEnd().split('\n').length, 1);
    const generalRow = formatAnkiTextFileRow(Modes.GeneralTopic, {
        text: 'What <x>?', front: 'What <x>?', back: 'Line one\nLine two', image_base64: pngBase64,
    });
    assert.match(generalRow, /^What &lt;x&gt;\?\tLine one<br>Line two/);
    assert.match(generalRow, /data:image\/png;base64,/);

    reset((request) => {
        if (request.action === 'modelNames' || request.action === 'findNotes') return { result: [] };
        if (request.action === 'addNotes') return { result: [106] };
        return { result: null };
    });
    await send([card('language image fixture', { image_base64: `data:image/png;base64,${pngBase64}` })]);
    const languageMedia = calls.find((request) => request.action === 'storeMediaFile');
    assert.match(languageMedia.params.filename, /\.png$/);
    assert.equal(languageMedia.params.data, pngBase64);
    const languageAdd = calls.find((request) => request.action === 'addNotes');
    assert.match(languageAdd.params.notes[0].fields.Back, new RegExp(`src="${languageMedia.params.filename}"`));
    assert.doesNotMatch(languageAdd.params.notes[0].fields.Back, /data:image/);

    reset((request) => {
        if (request.action === 'addNotes') return { result: [105] };
        return { result: null };
    });
    await createAnkiCards(Modes.GeneralTopic, 'http://127.0.0.1:8765', null, 'Vaulto QA Connect', 'Basic', [{
        text: 'general image fixture', front: 'general image fixture', back: 'Image answer', image_base64: pngBase64,
    }]);
    const generalAdd = calls.find((request) => request.action === 'addNotes');
    const generalMedia = calls.find((request) => request.action === 'storeMediaFile');
    assert.match(generalMedia.params.filename, /\.png$/);
    assert.match(generalAdd.params.notes[0].fields.Back, new RegExp(`src="${generalMedia.params.filename}"`));

    reset((request) => {
        if (request.action === 'modelNames' || request.action === 'findNotes') return { result: [] };
        if (request.action === 'storeMediaFile') return { error: 'media directory unavailable' };
        return { result: null };
    });
    await assert.rejects(send([card('image upload failure', { image_base64: pngBase64 })]), /media directory unavailable/);
    assert.equal(calls.some((request) => request.action === 'addNotes'), false);

    reset((request) => {
        if (request.action === 'findNotes') return { result: [501, 502] };
        if (request.action === 'notesInfo') return {
            result: [
                { noteId: 501, fields: { Front: { value: 'hello' }, Back: { value: '<b>привет</b><br>world [sound:a.mp3]' } }, tags: ['qa'] },
                { noteId: 502, fields: { Text: { value: 'Tom &amp; Sue showed {{c1::resilience::hint}}.' }, 'Back Extra': { value: 'стойкость &lt;сила&gt;' } }, tags: [] },
            ],
        };
        return { result: null };
    });
    const imported = await fetchNotesInDeck('http://127.0.0.1:8765', null, 'Vaulto QA Connect');
    assert.equal(imported.error, null);
    assert.deepEqual(imported.notes, [
        { noteId: 501, front: 'hello', back: 'привет\nworld', tags: ['qa'] },
        { noteId: 502, front: 'Tom & Sue showed resilience.', back: 'стойкость <сила>', tags: [] },
    ]);

    console.log('Anki tests passed: duplicates, batches, media, TXT formatting, cloze and reverse import.');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
