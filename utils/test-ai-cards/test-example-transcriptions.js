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

const {
  generateAndValidateExampleTranscriptions,
  getDeterministicExampleTranscriptionIssues,
  parseExampleTranscriptionsResponse,
} = require(path.join(COMPILED, 'services/exampleTranscriptions.js'));

const sentences = [
  '他把钱放进了钱包。',
  '没钱的时候，我们就先从省吃俭用开始。',
  '钱不是万能的，但没有钱也很难。',
];

const initial = [
  '1 || Tā bǎ qián fàng jìn le qiánbāo.',
  '2 || Méi qián de shíhou, wǒmen jiù xiān cóng shěngchī-jiǎnyòng kāishǐ.',
  '3 || Qián bú shì wànnéng de, dàn méiyǒu qián yě hěn nán.',
].join('\n');

const revisedAllLines = [
  '1 || WRONG REWRITE THAT MUST NOT REPLACE AN ACCEPTED LINE',
  '2 || Méi qián de shíhou, wǒmen jiù xiān cóng shěng chī jiǎn yòng kāishǐ.',
  '3 || ANOTHER WRONG REWRITE THAT MUST STAY OUT',
].join('\n');

const validAudit = {
  content: [
    'VERDICT: VALID',
    'INVALID_EXAMPLES: none',
    'ISSUES: none',
  ].join('\n'),
};

const invalidAudit = (indexes, issue) => ({
  content: [
    'VERDICT: INVALID',
    `INVALID_EXAMPLES: ${indexes}`,
    `ISSUES: ${issue}`,
  ].join('\n'),
});

const createService = (responses) => {
  const prompts = [];
  return {
    prompts,
    service: {
      createChatCompletion: async (_apiKey, messages) => {
        prompts.push(messages[0].content);
        const response = responses.shift();
        if (response instanceof Error) throw response;
        return response ?? null;
      },
    },
  };
};

(async () => {
  assert.deepStrictEqual(
    parseExampleTranscriptionsResponse(initial, 3),
    [
      'Tā bǎ qián fàng jìn le qiánbāo.',
      'Méi qián de shíhou, wǒmen jiù xiān cóng shěngchī-jiǎnyòng kāishǐ.',
      'Qián bú shì wànnéng de, dàn méiyǒu qián yě hěn nán.',
    ],
  );
  assert.strictEqual(
    parseExampleTranscriptionsResponse('1 || one\n3 || three', 3),
    null,
    'Missing indexes must never shift a guide onto the wrong example.',
  );
  assert.ok(
    getDeterministicExampleTranscriptionIssues(
      ['你好'],
      ['你好'],
      'en',
    ).some((issue) => /script requested|repeats the source spelling/i.test(issue.message)),
  );

  const selective = createService([
    { content: initial },
    invalidAudit('2', 'Example 2 has inconsistent word boundaries.'),
    { content: revisedAllLines },
    validAudit,
  ]);
  const selectivelyRevised = await generateAndValidateExampleTranscriptions(
    selective.service,
    'test-key',
    sentences,
    'zh',
    'en',
  );
  assert.deepStrictEqual(selectivelyRevised, [
    'Tā bǎ qián fàng jìn le qiánbāo.',
    'Méi qián de shíhou, wǒmen jiù xiān cóng shěng chī jiǎn yòng kāishǐ.',
    'Qián bú shì wànnéng de, dàn méiyǒu qián yě hěn nán.',
  ]);
  assert.strictEqual(selective.prompts.length, 4);
  assert.match(selective.prompts[0], /Hanyu Pinyin with tone\s+marks/);
  assert.match(selective.prompts[1], /corresponds to the source sentence at the same index/);
  assert.match(selective.prompts[2], /Rejected indexes: 2/);

  const deterministicOverride = createService([
    { content: '1 || 你好' },
    validAudit,
    { content: '1 || nǐ hǎo' },
    validAudit,
  ]);
  assert.deepStrictEqual(
    await generateAndValidateExampleTranscriptions(
      deterministicOverride.service,
      'test-key',
      ['你好'],
      'zh',
      'en',
    ),
    ['nǐ hǎo'],
    'Deterministic script failures must override a mistaken VALID model verdict.',
  );

  const unavailableValidator = createService([
    { content: '1 || nǐ hǎo' },
    new Error('validator unavailable'),
  ]);
  assert.deepStrictEqual(
    await generateAndValidateExampleTranscriptions(
      unavailableValidator.service,
      'test-key',
      ['你好'],
      'zh',
      'en',
    ),
    ['nǐ hǎo'],
    'A structurally safe guide may survive a transient validator outage.',
  );

  const revisionLimit = createService([
    { content: '1 || nǐ hǎo' },
    invalidAudit('1', 'Wrong pronunciation.'),
    { content: '1 || ni hao' },
    invalidAudit('1', 'Tones are missing.'),
    { content: '1 || nii hao' },
    invalidAudit('1', 'Still incorrect.'),
  ]);
  assert.deepStrictEqual(
    await generateAndValidateExampleTranscriptions(
      revisionLimit.service,
      'test-key',
      ['你好'],
      'zh',
      'en',
    ),
    [null],
    'A line explicitly rejected at the retry limit must be hidden.',
  );

  const individualFallback = createService([
    new Error('batch request failed'),
    { content: '1 || nǐ hǎo' },
    validAudit,
    { content: '1 || zài jiàn' },
    validAudit,
  ]);
  assert.deepStrictEqual(
    await generateAndValidateExampleTranscriptions(
      individualFallback.service,
      'test-key',
      ['你好', '再见'],
      'zh',
      'en',
    ),
    ['nǐ hǎo', 'zài jiàn'],
    'A failed batch must retry each missing sentence independently.',
  );
  assert.strictEqual(
    individualFallback.prompts.length,
    5,
    'Fallback should make one failed batch request and one generation/audit pair per line.',
  );

  const independentCalls = [];
  const independentFallback = createService([
    new Error('batch request failed'),
  ]);
  independentFallback.service.createTranscription = async (
    _apiKey,
    text,
    sourceLanguage,
    guideLanguage,
  ) => {
    independentCalls.push({ text, sourceLanguage, guideLanguage });
    return {
      userLanguageTranscription: text === '你好' ? 'nǐ hǎo' : 'zài jiàn',
      ipaTranscription: null,
    };
  };
  assert.deepStrictEqual(
    await generateAndValidateExampleTranscriptions(
      independentFallback.service,
      'test-key',
      ['你好', '再见'],
      'zh',
      'en',
    ),
    ['nǐ hǎo', 'zài jiàn'],
    'Missing lines should use the independent validated transcription pipeline.',
  );
  assert.deepStrictEqual(independentCalls, [
    {
      text: '你好',
      sourceLanguage: 'zh',
      guideLanguage: 'en',
    },
    {
      text: '再见',
      sourceLanguage: 'zh',
      guideLanguage: 'en',
    },
  ]);
  assert.strictEqual(
    independentFallback.prompts.length,
    1,
    'A successful independent fallback must not repeat the failed indexed protocol.',
  );

  console.log('Example transcription tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
