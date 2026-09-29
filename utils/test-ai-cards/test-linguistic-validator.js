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
  createOptimizedLinguisticInfo,
} = require(path.join(COMPILED, 'services/aiServiceFactory.js'));

const validAudit = () => ({
  content: 'VERDICT: VALID\nISSUES: NONE',
});

const invalidAudit = (...issues) => ({
  content: [
    'VERDICT: INVALID',
    'ISSUES:',
    ...issues.map((issue) => `- ${issue}`),
  ].join('\n'),
});

async function generateWithResponses(
  responses,
  { target = 'el gato', sourceLanguage = 'es' } = {},
) {
  const prompts = [];
  const service = {
    createChatCompletion: async (_apiKey, messages) => {
      prompts.push(messages[0].content);
      const nextResponse = responses.shift();
      if (nextResponse instanceof Error) {
        throw nextResponse;
      }
      return nextResponse ?? null;
    },
  };

  const result = await createOptimizedLinguisticInfo(
    service,
    'test-key',
    target,
    sourceLanguage,
    'ru',
  );

  return { result, prompts };
}

(async () => {
  const nounReference = [
    '📚 Часть речи: существительное',
    '⚥ Род: мужской',
  ].join('\n');

  const valid = await generateWithResponses([
    { content: nounReference },
    validAudit(),
    validAudit(),
  ]);

  assert.deepStrictEqual(valid.result, {
    linguisticInfo: nounReference,
    wasValidated: true,
    attempts: 1,
  });
  assert.match(valid.prompts[0], /<study_target language="es">el gato<\/study_target>/);
  assert.match(valid.prompts[0], /Analyze ONLY the exact text inside <study_target>/);
  assert.match(valid.prompts[1], /VERDICT: INVALID/);
  assert.match(valid.prompts[1], /конкретное замечание для генератора/);

  const corrected = await generateWithResponses([
    { content: '📚 Часть речи: артикль' },
    invalidAudit('Часть речи относится к артиклю, а не к главному слову gato.'),
    { content: nounReference },
    validAudit(),
    validAudit(),
  ]);

  assert.deepStrictEqual(corrected.result, {
    linguisticInfo: nounReference,
    wasValidated: true,
    attempts: 2,
  });
  assert.match(corrected.prompts[2], /Замечания независимого валидатора/);
  assert.match(corrected.prompts[2], /главному слову gato/);

  const unavailable = await generateWithResponses([
    { content: nounReference },
    null,
  ]);

  assert.deepStrictEqual(unavailable.result, {
    linguisticInfo: nounReference,
    wasValidated: false,
    attempts: 1,
  });

  const validatorError = await generateWithResponses([
    { content: nounReference },
    new Error('validator unavailable'),
  ]);

  assert.deepStrictEqual(validatorError.result, {
    linguisticInfo: nounReference,
    wasValidated: false,
    attempts: 1,
  });

  const comparedReference = [
    '📚 Часть речи: глагол',
    '🔤 Формы: Past Simple / Past Participle',
  ].join('\n');
  const compared = await generateWithResponses([
    {
      content: [
        '📚 Часть речи: причастие / глагол',
        '🔤 Форма: Past Simple / Past Participle',
      ].join('\n'),
    },
    invalidAudit(
      '«Причастие / глагол» смешивает форму и часть речи.',
      'Обе позиции Past Simple / Past Participle являются формами одного глагола.',
    ),
    { content: comparedReference },
    validAudit(),
    validAudit(),
  ], { target: 'compared', sourceLanguage: 'en' });

  assert.deepStrictEqual(compared.result, {
    linguisticInfo: comparedReference,
    wasValidated: true,
    attempts: 2,
  });
  assert.match(compared.prompts[0], /EVERY language and writing system/);
  assert.match(compared.prompts[1], /English "compared"/);
  assert.match(compared.prompts[1], /Русское "стали"/);
  assert.ok(compared.prompts[1].includes('не части речи "причастие / глагол"'));
  assert.match(compared.prompts[2], /смешивает форму и часть речи/);
  assert.ok(compared.prompts[2].includes('Past Simple / Past Participle'));

  const nihaoReference = [
    '🏷️ Тип: приветственная формула',
    '🧱 Структура: 你 (ты) + 好 (хорошо)',
    '💬 Употребление: нейтральное приветствие',
  ].join('\n');
  const nihao = await generateWithResponses([
    {
      content: [
        '📚 Часть речи: междометие',
        '🔤 Форма: приветственная формула',
      ].join('\n'),
    },
    invalidAudit(
      '你好 — составная приветственная формула, поэтому нужен режим устойчивого выражения.',
      '«Приветственная формула» является типом выражения, а не морфологической формой.',
    ),
    { content: nihaoReference },
    validAudit(),
    validAudit(),
  ], { target: '你好', sourceLanguage: 'zh' });

  assert.deepStrictEqual(nihao.result, {
    linguisticInfo: nihaoReference,
    wasValidated: true,
    attempts: 2,
  });
  assert.match(nihao.prompts[0], /FIXED EXPRESSION MODE/);
  assert.match(nihao.prompts[0], /greeting formula.*not.*🔤/is);
  assert.match(nihao.prompts[1], /Значения вроде «приветственная формула»/);
  assert.match(nihao.prompts[1], /🏷️ Тип: приветственная формула/);
  assert.match(nihao.prompts[2], /составная приветственная формула/);

  const coffee = await generateWithResponses([
    {
      content: [
        '📚 Часть речи: существительное',
        '🔤 Форма: базовая форма / единичное слово',
      ].join('\n'),
    },
    validAudit(),
    validAudit(),
  ], { target: '咖啡', sourceLanguage: 'zh' });

  assert.deepStrictEqual(coffee.result, {
    linguisticInfo: '📚 Часть речи: существительное',
    wasValidated: true,
    attempts: 1,
  });
  assert.match(coffee.prompts[0], /base\/dictionary\/initial form/i);
  assert.match(coffee.prompts[1], /базовая\/словарная\/начальная форма/i);
  assert.match(coffee.prompts[1], /Chinese "咖啡"/);

  const threeAttempts = await generateWithResponses([
    { content: '📚 Часть речи: глагол' },
    invalidAudit('Не сохранён разбор как существительного.'),
    { content: '📚 Часть речи: существительное' },
    invalidAudit('Потерян разбор как глагола.'),
    { content: '📚 Часть речи: глагол / существительное' },
    validAudit(),
    validAudit(),
  ], { target: 'стали', sourceLanguage: 'ru' });

  assert.deepStrictEqual(threeAttempts.result, {
    linguisticInfo: '📚 Часть речи: глагол / существительное',
    wasValidated: true,
    attempts: 3,
  });
  assert.match(threeAttempts.prompts[4], /Потерян разбор как глагола/);

  const exhausted = await generateWithResponses([
    { content: '📚 Часть речи: наречие' },
    invalidAudit('Не учтён разбор как глагола.'),
    { content: '📚 Часть речи: глагол' },
    invalidAudit('Не учтён разбор как наречия.'),
    { content: '📚 Часть речи: наречие / глагол' },
    invalidAudit('Требуется дополнительный контекст.'),
  ], { target: '还', sourceLanguage: 'zh' });

  assert.deepStrictEqual(exhausted.result, {
    linguisticInfo: '📚 Часть речи: наречие / глагол',
    wasValidated: false,
    attempts: 3,
  });

  const malformedAudit = await generateWithResponses([
    { content: comparedReference },
    { content: 'VALID_TARGET_REFERENCE' },
  ], { target: 'compared', sourceLanguage: 'en' });

  assert.deepStrictEqual(malformedAudit.result, {
    linguisticInfo: comparedReference,
    wasValidated: false,
    attempts: 1,
  });

  const clothing = await generateWithResponses([
    {
      content: [
        '📚 Часть речи: существительное',
        '📋 Число: единственное / множественное',
      ].join('\n'),
    },
    validAudit(),
    invalidAudit(
      'Поле «Число» не доказано: 衣服 не маркирует единственное или множественное число.',
    ),
    { content: '📚 Часть речи: существительное' },
    validAudit(),
    validAudit(),
  ], { target: '衣服', sourceLanguage: 'zh' });

  assert.deepStrictEqual(clothing.result, {
    linguisticInfo: '📚 Часть речи: существительное',
    wasValidated: true,
    attempts: 2,
  });
  assert.match(clothing.prompts[2], /Meaning compatibility is not morphological evidence/i);
  assert.match(clothing.prompts[3], /не маркирует единственное или множественное/u);

  console.log('Linguistic validation/revision tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
