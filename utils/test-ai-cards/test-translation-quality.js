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
  createExamplesPrompt,
  createTranslationPrompt,
  normalizeTranslationResponse,
  removeDecorativeTranslationQuotes,
} = require(path.join(COMPILED, 'services/aiProviders.js'));
const {
  createTranslation,
} = require(path.join(COMPILED, 'services/aiServiceFactory.js'));

const comparedPrompt = createTranslationPrompt('Compared', 'ru');
assert.match(comparedPrompt, /<study_target>Compared<\/study_target>/);
assert.match(comparedPrompt, /every source language and writing system/i);
assert.match(comparedPrompt, /exact visible grammatical form/i);
assert.match(comparedPrompt, /common grammatical readings/i);
assert.match(comparedPrompt, /required complement marker/i);
assert.match(comparedPrompt, /natural capitalization/i);
assert.match(comparedPrompt, /separated\s+EXACTLY by " \| "/i);

const comparedExamplesPrompt = createExamplesPrompt('Compared', 'en');
assert.match(comparedExamplesPrompt, /<study_target language="en">Compared<\/study_target>/);
assert.match(comparedExamplesPrompt, /exact visible study target/i);
assert.match(comparedExamplesPrompt, /multiple common grammatical\s+readings/i);
assert.match(comparedExamplesPrompt, /finite verb form and a non-finite\s+form/i);
assert.match(comparedExamplesPrompt, /Do not spend all three examples on the same construction/i);

assert.strictEqual(
  normalizeTranslationResponse('сравнил | сравнённый | по сравнению с'),
  'сравнил, сравнённый, по сравнению с',
);

assert.strictEqual(
  normalizeTranslationResponse('«Сравненный», «По сравнению с», «Сопоставленный»'),
  'Сравненный, По сравнению с, Сопоставленный',
);

assert.strictEqual(
  normalizeTranslationResponse('“Если пойдёт дождь, мы останемся дома.”'),
  'Если пойдёт дождь, мы останемся дома.',
);

assert.strictEqual(
  normalizeTranslationResponse('длинный вариант | краткий | третий | четвёртый | пятый'),
  'длинный вариант, краткий, третий, четвёртый',
);

assert.strictEqual(
  normalizeTranslationResponse('одежда | Одежда (в целом)'),
  'одежда',
  'A parenthetical gloss must not turn the same translation into a duplicate variant.',
);

assert.strictEqual(
  normalizeTranslationResponse('- первое\n- второе\n- третье'),
  'первое, второе, третье',
);

assert.strictEqual(
  removeDecorativeTranslationQuotes('「第一」, 『第二』, 《第三》'),
  '第一, 第二, 第三',
);

const invalidAudit = (...issues) => ({
  content: [
    'VERDICT: INVALID',
    'ISSUES:',
    ...issues.map(issue => `- ${issue}`),
  ].join('\n'),
});

const validAudit = {
  content: 'VERDICT: VALID\nISSUES: NONE',
};

const createMockService = (initialTranslation, responses) => {
  const prompts = [];
  const service = {
    translateText: async () => initialTranslation,
    createChatCompletion: async (_apiKey, messages) => {
      prompts.push(messages[0].content);
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response ?? null;
    },
  };

  return { service, prompts };
};

(async () => {
  const compared = createMockService(
    'по сравнению с, в сравнении с, сравненный',
    [
      invalidAudit(
        'The first two variants duplicate one reading.',
        'The ordinary finite Past Simple reading is missing.',
      ),
      { content: 'сравнил / сравнивал | сравнённый | по сравнению с' },
      validAudit,
      validAudit,
    ],
  );
  const corrected = await createTranslation(
    compared.service,
    'test-key',
    'Compared',
    'ru',
    '',
    'en',
  );

  assert.deepStrictEqual(corrected, {
    original: 'Compared',
    translated: 'сравнил / сравнивал, сравнённый, по сравнению с',
  });
  assert.match(compared.prompts[0], /<study_target language="en">Compared<\/study_target>/);
  assert.match(compared.prompts[0], /first two items duplicate/i);
  assert.match(compared.prompts[0], /finite Past Simple reading is\s+missing/i);
  assert.match(compared.prompts[1], /ordinary finite Past Simple reading is missing/i);
  assert.match(compared.prompts[1], /Current translation: по сравнению с/);
  assert.match(compared.prompts[3], /lexicographic quality gate/i);

  const unavailable = createMockService(
    '«по сравнению с» | «сравнённый»',
    [null],
  );
  const preserved = await createTranslation(
    unavailable.service,
    'test-key',
    'compared',
    'ru',
    '',
    'en',
  );

  assert.strictEqual(preserved.translated, 'по сравнению с, сравнённый');

  const exhausted = createMockService(
    'по сравнению с',
    [
      invalidAudit('Finite reading is missing.'),
      { content: 'сравнённый | по сравнению с' },
      invalidAudit('Finite reading is still missing.'),
      { content: 'сравнил | сравнённый | по сравнению с' },
      invalidAudit('Further context would be helpful.'),
    ],
  );
  const latest = await createTranslation(
    exhausted.service,
    'test-key',
    'compared',
    'ru',
    '',
    'en',
  );

  assert.strictEqual(latest.translated, 'сравнил, сравнённый, по сравнению с');
  assert.strictEqual(exhausted.prompts.length, 5);

  const clothing = createMockService(
    'одежда | одежонка | одежки',
    [
      validAudit,
      invalidAudit(
        'The diminutives «одежонка» and «одежки» add marked register absent from 衣服.',
      ),
      { content: 'одежда' },
      validAudit,
      validAudit,
    ],
  );
  const correctedClothing = await createTranslation(
    clothing.service,
    'test-key',
    '衣服',
    'ru',
    '',
    'zh',
  );
  assert.strictEqual(correctedClothing.translated, 'одежда');
  assert.match(clothing.prompts[1], /diminutive, augmentative/i);
  assert.match(clothing.prompts[2], /marked register absent from 衣服/u);
  assert.strictEqual(clothing.prompts.length, 5);

  console.log('Translation prompt/validation/revision tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
