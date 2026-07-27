#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const COMPILED = path.join(HERE, '.compiled', 'src');

execFileSync(
  path.join(HERE, '..', '..', 'node_modules', '.bin', 'tsc'),
  ['-p', path.join(HERE, 'tsconfig.json')],
  { stdio: 'inherit' },
);

global.location = { protocol: 'chrome-extension:' };

const {
  containsNonLatinOrCyrillicLetters,
  formatTranscriptionHtml,
  isPronunciationGuideScriptCompatible,
  resolveTranscriptionRequest,
  shouldGenerateTranscription,
} = require(path.join(COMPILED, 'services/transcription.js'));
const {
  BaseAIProvider,
} = require(path.join(COMPILED, 'services/aiProviders.js'));
const {
  createCardComponentsParallel,
} = require(path.join(COMPILED, 'services/aiServiceFactory.js'));
const {
  settingsReducer,
} = require(path.join(COMPILED, 'store/reducers/settings.js'));
const {
  setTranscriptionLanguage,
  setTranscriptionExtraLanguages,
  setTranscriptionMode,
  setExampleTranscriptionsEnabled,
} = require(path.join(COMPILED, 'store/actions/settings.js'));
const {
  normalizePersistedSettings,
} = require(path.join(COMPILED, 'services/settingsPersistence.js'));

assert.strictEqual(containsNonLatinOrCyrillicLetters('你好'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('こんにちは'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('안녕하세요'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('مرحبا'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('שלום'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('नमस्ते'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('γεια'), true);
assert.strictEqual(containsNonLatinOrCyrillicLetters('hello'), false);
assert.strictEqual(containsNonLatinOrCyrillicLetters('привет'), false);
assert.strictEqual(containsNonLatinOrCyrillicLetters('hello — привет'), false);
assert.strictEqual(isPronunciationGuideScriptCompatible('nǐ hǎo', 'en'), true);
assert.strictEqual(
  isPronunciationGuideScriptCompatible('al-ʿarabiyyah', 'en'),
  true,
  'Standard romanization modifier letters must be accepted.',
);
assert.strictEqual(isPronunciationGuideScriptCompatible('你好', 'en'), false);
assert.strictEqual(isPronunciationGuideScriptCompatible('кэт', 'ru'), true);
assert.strictEqual(isPronunciationGuideScriptCompatible('ket', 'ru'), false);
assert.strictEqual(
  isPronunciationGuideScriptCompatible('ni hao', 'sr'),
  true,
  'Multi-script guide languages must not be rejected by a display-name heuristic.',
);

assert.strictEqual(shouldGenerateTranscription('你好', 'auto'), true);
assert.strictEqual(shouldGenerateTranscription('hello', 'auto'), false);
assert.strictEqual(shouldGenerateTranscription('привет', 'auto'), false);
assert.strictEqual(shouldGenerateTranscription('hello', 'auto', 'en', ['en']), true);
assert.strictEqual(shouldGenerateTranscription('привет', 'auto', 'ru', ['en']), false);
assert.strictEqual(shouldGenerateTranscription('hello', 'always'), true);
assert.strictEqual(shouldGenerateTranscription('你好', 'off'), false);
assert.strictEqual(shouldGenerateTranscription('123 ✨', 'auto'), false);
assert.strictEqual(shouldGenerateTranscription('', 'always'), false);
assert.deepStrictEqual(
  resolveTranscriptionRequest('你好', undefined, 'auto', ''),
  {
    sourceLanguage: 'unknown (infer only from the exact study target)',
    transcriptionLanguage: 'en',
  },
);
assert.strictEqual(resolveTranscriptionRequest('hello', 'en', 'auto', 'ru'), null);
assert.deepStrictEqual(
  resolveTranscriptionRequest('hello', 'en', 'always', 'ru'),
  { sourceLanguage: 'en', transcriptionLanguage: 'ru' },
);
assert.deepStrictEqual(
  resolveTranscriptionRequest('hello', 'en', 'auto', 'en', ['en']),
  { sourceLanguage: 'en', transcriptionLanguage: 'en' },
);

const formatted = formatTranscriptionHtml(
  {
    userLanguageTranscription: 'nǐ hǎo <script>',
    ipaTranscription: '[ni˧˥ xɑʊ˨˩˦]',
  },
  'en',
);
assert.match(formatted, /English:/);
assert.match(formatted, /nǐ hǎo &lt;script&gt;/);
assert.doesNotMatch(formatted, /<script>/);
assert.match(formatted, /IPA:/);
assert.match(formatted, /\[ni˧˥ xɑʊ˨˩˦\]/);

const initialSettings = settingsReducer(undefined, { type: '@@INIT' });
assert.strictEqual(initialSettings.transcriptionMode, 'auto');
assert.strictEqual(initialSettings.transcriptionLanguage, 'en');
assert.deepStrictEqual(initialSettings.transcriptionExtraLanguages, []);
assert.strictEqual(initialSettings.exampleTranscriptionsEnabled, true);
assert.strictEqual(
  settingsReducer(initialSettings, setTranscriptionMode('always')).transcriptionMode,
  'always',
);
assert.strictEqual(
  settingsReducer(initialSettings, setTranscriptionLanguage('ru')).transcriptionLanguage,
  'ru',
);
assert.deepStrictEqual(
  settingsReducer(
    initialSettings,
    setTranscriptionExtraLanguages(['en', 'ru']),
  ).transcriptionExtraLanguages,
  ['en', 'ru'],
);
assert.strictEqual(
  settingsReducer(
    initialSettings,
    setExampleTranscriptionsEnabled(false),
  ).exampleTranscriptionsEnabled,
  false,
);
assert.deepStrictEqual(
  normalizePersistedSettings({
    translateToLanguage: 'de',
  }),
  {
    translateToLanguage: 'de',
  },
  'Old snapshots must leave new transcription defaults untouched during hydration.',
);
assert.deepStrictEqual(
  normalizePersistedSettings({
    transcriptionMode: 'off',
    transcriptionLanguage: 'ru',
    transcriptionExtraLanguages: ['en', 'en', 'xx', 7, null],
    exampleTranscriptionsEnabled: false,
  }),
  {
    transcriptionMode: 'off',
    transcriptionLanguage: 'ru',
    transcriptionExtraLanguages: ['en'],
    exampleTranscriptionsEnabled: false,
  },
);
assert.deepStrictEqual(
  normalizePersistedSettings({
    transcriptionMode: 'sometimes',
    transcriptionLanguage: 'xx',
    transcriptionExtraLanguages: 'en',
  }),
  {},
  'Malformed persisted values must not overwrite safe reducer defaults.',
);

class TranscriptionProvider extends BaseAIProvider {
  constructor() {
    super('test-key', 'test-model');
    this.prompts = [];
    this.options = [];
  }

  async sendRequest(prompt, options) {
    this.prompts.push(prompt);
    this.options.push(options);

    if (prompt.startsWith('Create a pronunciation guide')) {
      return [
        'USER_LANG: 你好',
        'IPA: [ni˨˩˦ xɑʊ˨˩˦]',
      ].join('\n');
    }

    if (prompt.startsWith('Revise rejected pronunciation data')) {
      return [
        'USER_LANG: nǐ hǎo',
        'IPA: [ni˧˥ xɑʊ˨˩˦]',
      ].join('\n');
    }

    if (prompt.startsWith('You are an independent phonetics validator')) {
      if (prompt.includes('<pronunciation_guide language="en">你好</pronunciation_guide>')) {
        return [
          'VERDICT: INVALID',
          'INVALID_FIELDS: USER_LANG, IPA',
          'ISSUES:',
          '- USER_LANG repeats unreadable source characters instead of an English-readable guide.',
          '- IPA misses the ordinary third-tone sandhi in this phrase.',
        ].join('\n');
      }
      return [
        'VERDICT: VALID',
        'INVALID_FIELDS: NONE',
        'ISSUES: NONE',
      ].join('\n');
    }

    if (prompt.startsWith('You are the second independent pronunciation-evidence')) {
      return [
        'VERDICT: VALID',
        'INVALID_FIELDS: NONE',
        'ISSUES: NONE',
      ].join('\n');
    }

    throw new Error(`Unexpected prompt: ${prompt.slice(0, 100)}`);
  }

  async extractKeyTerms() {
    return [];
  }
}

class PartialRevisionTranscriptionProvider extends BaseAIProvider {
  constructor() {
    super('test-key', 'test-model');
    this.prompts = [];
  }

  async sendRequest(prompt) {
    this.prompts.push(prompt);

    if (prompt.startsWith('Create a pronunciation guide')) {
      return [
        'USER_LANG: 你好',
        'IPA: [ni˧˥ xɑʊ˨˩˦]',
      ].join('\n');
    }

    if (prompt.startsWith('Revise rejected pronunciation data')) {
      // Deliberately omit IPA: the already accepted value must survive a partial
      // protocol response instead of disappearing from the card.
      return 'USER_LANG: nǐ hǎo';
    }

    if (prompt.startsWith('You are an independent phonetics validator')) {
      if (prompt.includes('<pronunciation_guide language="en">你好</pronunciation_guide>')) {
        return [
          'VERDICT: INVALID',
          'INVALID_FIELDS: USER_LANG',
          'ISSUES:',
          '- USER_LANG must be readable in the selected guide language.',
        ].join('\n');
      }
      return [
        'VERDICT: VALID',
        'INVALID_FIELDS: NONE',
        'ISSUES: NONE',
      ].join('\n');
    }

    if (prompt.startsWith('You are the second independent pronunciation-evidence')) {
      return [
        'VERDICT: VALID',
        'INVALID_FIELDS: NONE',
        'ISSUES: NONE',
      ].join('\n');
    }

    throw new Error(`Unexpected prompt: ${prompt.slice(0, 100)}`);
  }

  async extractKeyTerms() {
    return [];
  }
}

const validAuditResponse = (title) => {
  if (title === 'Validating translation') {
    return 'VERDICT: VALID\nISSUES: NONE';
  }
  if (title === 'Validating examples') {
    return [
      'VERDICT: VALID',
      'INVALID_EXAMPLES: NONE',
      'SCRIPT_EXCEPTIONS: NONE',
      'ISSUES: NONE',
    ].join('\n');
  }
  if (title === 'Validating grammar reference') {
    return 'VERDICT: VALID\nISSUES: NONE';
  }
  return null;
};

const createCardService = () => {
  const transcriptionCalls = [];
  const service = {
    async translateText(_apiKey, text) {
      if (text === '你好') return 'здравствуйте';
      if (text === '咖啡') return 'кофе';
      return 'приветствие';
    },
    async getExamples(_apiKey, text) {
      if (text === '你好') {
        return [
          ['你好，朋友。', 'Здравствуй, друг.'],
          ['老师说：“你好”。', 'Учитель сказал: «Здравствуйте».'],
          ['见面时我说你好。', 'При встрече я здороваюсь.'],
        ];
      }
      if (text === '咖啡') {
        return [
          ['我每天早上都会喝咖啡。', 'Я каждое утро пью кофе.'],
          ['这家店的咖啡很香。', 'Кофе в этом магазине очень ароматный.'],
          ['咖啡我已经买好了。', 'Кофе я уже купил.'],
        ];
      }
      return [
        [`${text}, my friend.`, 'Привет, мой друг.'],
        [`She said ${text}.`, 'Она поздоровалась.'],
        [`I hear ${text} every morning.`, 'Я слышу приветствие каждое утро.'],
      ];
    },
    async getDescriptionImage() {
      throw new Error('Image generation must remain disabled in this test.');
    },
    async generateAnkiFront(_apiKey, text) {
      return text;
    },
    async extractKeyTerms() {
      return [];
    },
    async createChatCompletion(_apiKey, _messages, trackingInfo) {
      const audit = validAuditResponse(trackingInfo?.title);
      if (audit) return { content: audit };
      if (trackingInfo?.title === 'Creating grammar reference') {
        return {
          content: '📚 Часть речи: междометие',
        };
      }
      throw new Error(`Unexpected card integration request: ${trackingInfo?.title || 'untitled'}`);
    },
    async createTranscription(_apiKey, text, sourceLanguage, guideLanguage) {
      transcriptionCalls.push({ text, sourceLanguage, guideLanguage });
      return {
        userLanguageTranscription:
          text === '你好' ? 'nǐ hǎo' : text === '咖啡' ? 'kāfēi' : 'хэлоу',
        ipaTranscription:
          text === '你好'
            ? '[ni˧˥ xɑʊ˨˩˦]'
            : text === '咖啡'
              ? '[kʰa˥ feɪ̯˥]'
              : '[həˈloʊ]',
      };
    },
  };
  return { service, transcriptionCalls };
};

const runCardTranscriptionCase = async ({
  text,
  sourceLanguage,
  options,
  expectedCalls,
  expectedSourceLanguage,
  expectedGuideLanguage,
}) => {
  const { service, transcriptionCalls } = createCardService();
  const result = await createCardComponentsParallel(
    service,
    'test-key',
    text,
    'ru',
    '',
    sourceLanguage,
    false,
    undefined,
    'off',
    false,
    'off',
    undefined,
    undefined,
    options,
  );

  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(transcriptionCalls.length, expectedCalls);
  assert.strictEqual(Boolean(result.transcription), expectedCalls > 0);
  if (expectedCalls > 0) {
    assert.deepStrictEqual(transcriptionCalls[0], {
      text,
      sourceLanguage: expectedSourceLanguage,
      guideLanguage: expectedGuideLanguage,
    });
  }
  return result;
};

(async () => {
  const provider = new TranscriptionProvider();
  const transcription = await provider.createTranscription('你好', 'zh', 'en');

  assert.deepStrictEqual(transcription, {
    userLanguageTranscription: 'nǐ hǎo',
    ipaTranscription: '[ni˧˥ xɑʊ˨˩˦]',
  });
  assert.strictEqual(provider.prompts.length, 5);
  assert.match(provider.prompts[0], /established learner romanization/i);
  assert.match(provider.prompts[0], /zh \(Standard Chinese \(Mandarin\)\)/i);
  assert.match(provider.prompts[0], /lexical\s+tone/i);
  assert.match(provider.prompts[1], /Apply the phonology of zh/i);
  assert.match(provider.prompts[2], /third-tone sandhi/i);
  assert.match(provider.prompts[3], /<pronunciation_guide language="en">nǐ hǎo/);
  assert.match(provider.prompts[4], /spelling accents or romanization/i);
  assert.ok(
    provider.options.every((options) => options?.model),
    'Pronunciation generation, validation, and revision must use the accurate text model.',
  );

  const partialRevisionProvider = new PartialRevisionTranscriptionProvider();
  const partialRevision = await partialRevisionProvider.createTranscription(
    '你好',
    'zh',
    'en',
  );
  assert.deepStrictEqual(partialRevision, {
    userLanguageTranscription: 'nǐ hǎo',
    ipaTranscription: '[ni˧˥ xɑʊ˨˩˦]',
  });
  assert.strictEqual(partialRevisionProvider.prompts.length, 5);

  await runCardTranscriptionCase({
    text: '你好',
    sourceLanguage: 'zh',
    options: { mode: 'auto', language: 'en', extraLanguages: [] },
    expectedCalls: 1,
    expectedSourceLanguage: 'zh',
    expectedGuideLanguage: 'en',
  });
  const coffeeCard = await runCardTranscriptionCase({
    text: '咖啡',
    sourceLanguage: 'zh',
    options: { mode: 'auto', language: 'en', extraLanguages: [] },
    expectedCalls: 1,
    expectedSourceLanguage: 'zh',
    expectedGuideLanguage: 'en',
  });
  const coffeeHtml = formatTranscriptionHtml(coffeeCard.transcription, 'en');
  assert.match(coffeeHtml, /kāfēi/u);
  assert.match(coffeeHtml, /\[kʰa˥ feɪ̯˥\]/u);
  await runCardTranscriptionCase({
    text: '你好',
    sourceLanguage: 'zh',
    options: { mode: 'off', language: 'en', extraLanguages: [] },
    expectedCalls: 0,
  });
  await runCardTranscriptionCase({
    text: 'hello',
    sourceLanguage: 'en',
    options: { mode: 'auto', language: 'en', extraLanguages: [] },
    expectedCalls: 0,
  });
  await runCardTranscriptionCase({
    text: 'hello',
    sourceLanguage: 'en',
    options: { mode: 'always', language: 'ru', extraLanguages: [] },
    expectedCalls: 1,
    expectedSourceLanguage: 'en',
    expectedGuideLanguage: 'ru',
  });
  await runCardTranscriptionCase({
    text: 'hello',
    sourceLanguage: 'en-US',
    options: { mode: 'auto', language: 'en', extraLanguages: ['en'] },
    expectedCalls: 1,
    expectedSourceLanguage: 'en-US',
    expectedGuideLanguage: 'en',
  });
  await runCardTranscriptionCase({
    text: '你好',
    sourceLanguage: undefined,
    options: { mode: 'auto', language: 'en', extraLanguages: [] },
    expectedCalls: 1,
    expectedSourceLanguage: 'unknown (infer only from the exact study target)',
    expectedGuideLanguage: 'en',
  });

  console.log('Transcription policy/generation/validation tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
