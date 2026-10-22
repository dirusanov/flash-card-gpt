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
  createExamples,
} = require(path.join(COMPILED, 'services/aiServiceFactory.js'));
const {
  BaseAIProvider,
} = require(path.join(COMPILED, 'services/aiProviders.js'));
const {
  getDeterministicExampleIssues,
  parseBilingualExamplesResponse,
} = require(path.join(COMPILED, 'services/exampleQuality.js'));

const validAudit = {
  content: [
    'VERDICT: VALID',
    'INVALID_EXAMPLES: NONE',
    'ISSUES: NONE',
  ].join('\n'),
};

const invalidAudit = (indexes, ...issues) => ({
  content: [
    'VERDICT: INVALID',
    `INVALID_EXAMPLES: ${indexes}`,
    'ISSUES:',
    ...issues.map((issue) => `- ${issue}`),
  ].join('\n'),
});

const initialChineseExamples = [
  ['你好，今天天气怎么样？', '你好, как насчет погоды сегодня?'],
  ['我想学习中文，你能帮我吗？', 'Я хочу изучать китайский. Ты можешь мне помочь?'],
  ['你好，认识你很高兴！', 'Здравствуйте! Очень приятно с вами познакомиться!'],
];

const correctedChineseResponse = [
  '1. 你好，今天天气怎么样？ || Привет! Какая сегодня погода?',
  '2. 你好，我想学习中文，你能帮我吗？ || Здравствуйте! Я хочу изучать китайский. Вы можете мне помочь?',
  '3. 你好，认识你很高兴！ || Здравствуйте! Очень приятно с вами познакомиться!',
].join('\n');

const createMockService = (initialExamples, responses) => {
  const prompts = [];
  const service = {
    getExamples: async () => initialExamples,
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
  class SourceFirstProvider extends BaseAIProvider {
    constructor() {
      super('test-key', 'test-model');
      this.prompts = [];
    }

    async sendRequest(prompt) {
      this.prompts.push(prompt);
      if (prompt.startsWith('Create exactly three natural example sentences')) {
        return [
          '1. 你好，今天天气怎么样？',
          '2. 我想学习中文，你好，你能帮我吗？',
          '3. 你好，认识你很高兴！',
        ].join('\n');
      }
      if (prompt.includes('<study_target>你好，今天天气怎么样？</study_target>')) {
        return 'Привет! Какая сегодня погода?';
      }
      if (prompt.includes('<study_target>我想学习中文，你好，你能帮我吗？</study_target>')) {
        return 'Я хочу изучать китайский. Ты можешь мне помочь?';
      }
      if (prompt.includes('<study_target>你好，认识你很高兴！</study_target>')) {
        return 'Здравствуйте! Очень приятно с вами познакомиться!';
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    }

    async extractKeyTerms() {
      return [];
    }
  }

  const sourceFirstProvider = new SourceFirstProvider();
  const providerExamples = await sourceFirstProvider.getExamples(
    '你好',
    'ru',
    true,
    '',
    'zh',
  );
  assert.strictEqual(providerExamples.length, 3);
  assert.deepStrictEqual(providerExamples[0], [
    '你好，今天天气怎么样？',
    'Привет! Какая сегодня погода?',
  ]);
  assert.match(sourceFirstProvider.prompts[0], /Generate SOURCE sentences only/);
  assert.doesNotMatch(sourceFirstProvider.prompts[0], /Then translate each sentence/i);
  assert.strictEqual(
    sourceFirstProvider.prompts.filter((prompt) => /You are creating the answer side/.test(prompt)).length,
    3,
    'Every source example must be translated by its own translation request.',
  );

  const deterministicIssues = getDeterministicExampleIssues(
    initialChineseExamples.map(([original, translated]) => ({ original, translated })),
    '你好',
    'zh',
    'ru',
  );

  assert.ok(
    deterministicIssues.some(
      (issue) => issue.index === 1 && /unexpected Han script/i.test(issue.message),
    ),
    'A Chinese fragment left inside Russian translation must be caught before AI validation.',
  );
  assert.ok(
    deterministicIssues.some(
      (issue) => issue.index === 2 && /does not contain the exact visible study target/i.test(issue.message),
    ),
    'Every source sentence must actually contain the studied expression.',
  );

  assert.deepStrictEqual(
    parseBilingualExamplesResponse(correctedChineseResponse),
    [
      {
        original: '你好，今天天气怎么样？',
        translated: 'Привет! Какая сегодня погода?',
      },
      {
        original: '你好，我想学习中文，你能帮我吗？',
        translated: 'Здравствуйте! Я хочу изучать китайский. Вы можете мне помочь?',
      },
      {
        original: '你好，认识你很高兴！',
        translated: 'Здравствуйте! Очень приятно с вами познакомиться!',
      },
    ],
  );
  assert.deepStrictEqual(parseBilingualExamplesResponse('one line without protocol'), []);

  /*
   * Even if the model validator mistakenly says VALID, the deterministic script check
   * must force a revision of the mixed Chinese/Russian translation.
   */
  const mixedLanguage = createMockService(
    initialChineseExamples,
    [
      validAudit,
      { content: correctedChineseResponse },
      validAudit,
      validAudit,
    ],
  );
  const corrected = await createExamples(
    mixedLanguage.service,
    'test-key',
    '你好',
    'ru',
    true,
    '',
    'zh',
  );

  assert.strictEqual(corrected.length, 3);
  assert.deepStrictEqual(corrected[0], {
    original: '你好，今天天气怎么样？',
    translated: 'Привет! Какая сегодня погода?',
  });
  assert.match(mixedLanguage.prompts[0], /partially|mixed-language|mixed-language translations/i);
  assert.match(mixedLanguage.prompts[0], /unexpected Han script/i);
  assert.match(mixedLanguage.prompts[1], /Invalid example indexes: 1, 2/);
  assert.match(mixedLanguage.prompts[1], /Translate the whole sentence/i);
  assert.match(mixedLanguage.prompts[3], /native-language fluency validator/i);
  assert.strictEqual(mixedLanguage.prompts.length, 4);

  const safeUnavailable = createMockService(
    corrected.map((example) => [example.original, example.translated]),
    [null],
  );
  await assert.rejects(() => createExamples(
    safeUnavailable.service,
    'test-key',
    '你好',
    'ru',
    true,
    '',
    'zh',
  ), /could not be verified/);


  const properNameExamples = [
    ['「山猫」という店で昼ご飯を食べました。', 'I had lunch at the restaurant 山猫.'],
    ['山猫の看板は青いです。', 'The 山猫 restaurant has a blue sign.'],
    ['友達は山猫で働いています。', 'My friend works at 山猫.'],
  ];
  const properNameException = createMockService(
    properNameExamples,
    [{
      content: [
        'VERDICT: VALID',
        'INVALID_EXAMPLES: NONE',
        'SCRIPT_EXCEPTIONS: 1, 2, 3',
        'ISSUES: NONE',
      ].join('\n'),
    }, validAudit],
  );
  const preservedProperName = await createExamples(
    properNameException.service,
    'test-key',
    '山猫',
    'en',
    true,
    '',
    'ja',
  );
  assert.deepStrictEqual(
    preservedProperName,
    properNameExamples.map(([original, translated]) => ({ original, translated })),
    'The validator must be able to approve a demonstrably unchanged proper name.',
  );

  /*
   * A semantic validator can accept a literal translation because the source makes it
   * understandable. The independent target-language pass must still reject the calque
   * and feed concrete feedback into the normal bounded revision loop.
   */
  const clothingExamples = [
    ['我想买一件新衣服。', 'Я хочу купить новую вещь одежды.'],
    ['洗衣服的时候别忘了分类。', 'Когда стираешь одежду, не забудь рассортировать её.'],
    ['这件衣服穿起来很舒服。', 'Эта вещь одежды очень удобна в носке.'],
  ];
  const correctedClothingResponse = [
    '1. 我想买一件新衣服。 || Я хочу купить новую одежду.',
    '2. 洗衣服的时候别忘了分类。 || Когда стираешь одежду, не забудь рассортировать её.',
    '3. 这件衣服穿起来很舒服。 || Эту одежду очень удобно носить.',
  ].join('\n');
  const clothingCalque = createMockService(
    clothingExamples,
    [
      validAudit,
      invalidAudit(
        '1, 3',
        '[1] «вещь одежды» is an unnatural literal calque; use «одежду».',
        '[3] «вещь одежды» is not an idiomatic Russian noun phrase.',
      ),
      { content: correctedClothingResponse },
      validAudit,
      validAudit,
    ],
  );
  const correctedClothing = await createExamples(
    clothingCalque.service,
    'test-key',
    '衣服',
    'ru',
    true,
    '',
    'zh',
  );
  assert.deepStrictEqual(correctedClothing, [
    { original: '我想买一件新衣服。', translated: 'Я хочу купить новую одежду.' },
    {
      original: '洗衣服的时候别忘了分类。',
      translated: 'Когда стираешь одежду, не забудь рассортировать её.',
    },
    { original: '这件衣服穿起来很舒服。', translated: 'Эту одежду очень удобно носить.' },
  ]);
  assert.match(clothingCalque.prompts[1], /originally been written/i);
  assert.match(clothingCalque.prompts[2], /вещь одежды/u);
  assert.strictEqual(clothingCalque.prompts.length, 5);

  const stablePairs = [
    ['衣服已经洗好了。', 'Одежду уже постирали.'],
    ['这件衣服很舒服。', 'Эта вещь одежды очень удобная.'],
    ['我把衣服放进柜子里。', 'Я положил одежду в шкаф.'],
  ];
  const overRewrittenResponse = [
    '1. 衣服已经洗好了。 || Плохая замена первой строки.',
    '2. 这件衣服很舒服。 || Эту одежду удобно носить.',
    '3. 我把衣服放进柜子里。 || Плохая замена третьей строки.',
  ].join('\n');
  const selectiveRevision = createMockService(
    stablePairs,
    [
      invalidAudit('2', '[2] «вещь одежды» is an unnatural calque.', '[SET] Pair 2 makes the set invalid.'),
      { content: overRewrittenResponse },
      validAudit,
      validAudit,
    ],
  );
  const selectivelyCorrected = await createExamples(
    selectiveRevision.service,
    'test-key',
    '衣服',
    'ru',
    true,
    '',
    'zh',
  );
  assert.deepStrictEqual(selectivelyCorrected, [
    { original: stablePairs[0][0], translated: stablePairs[0][1] },
    { original: stablePairs[1][0], translated: 'Эту одежду удобно носить.' },
    { original: stablePairs[2][0], translated: stablePairs[2][1] },
  ]);

  const exhausted = createMockService(
    initialChineseExamples,
    [
      invalidAudit('1', '[1] The translation is mixed Chinese and Russian.'),
      { content: [
        '1. 你好，今天天气怎么样？ || 你好, какая сегодня погода?',
        correctedChineseResponse.split('\n')[1],
        correctedChineseResponse.split('\n')[2],
      ].join('\n') },
      invalidAudit('1', '[1] Chinese 你好 is still untranslated.'),
      { content: [
        '1. 你好，今天天气怎么样？ || 你好, какая сегодня погода?',
        correctedChineseResponse.split('\n')[1],
        correctedChineseResponse.split('\n')[2],
      ].join('\n') },
      invalidAudit('1', '[1] Chinese 你好 is still untranslated.'),
    ],
  );
  const safeRemainder = await createExamples(
    exhausted.service,
    'test-key',
    '你好',
    'ru',
    true,
    '',
    'zh',
  );

  assert.strictEqual(safeRemainder.length, 2);
  assert.ok(safeRemainder.every((example) => !example.translated.includes('你好')));
  assert.strictEqual(exhausted.prompts.length, 6);

  const refill = createMockService(stablePairs, [
    invalidAudit('2', '[2] Fix this translation.'), {content:overRewrittenResponse},
    invalidAudit('2', '[2] Still not verified.'), {content:overRewrittenResponse},
    invalidAudit('2', '[2] One last slot is incorrect.'), {content:overRewrittenResponse},
    validAudit, validAudit,
  ]);
  const refilled = await createExamples(refill.service, 'test-key', '衣服', 'ru', true, '', 'zh');
  assert.equal(refilled.length, 3);
  assert.equal(refilled[0].translated, stablePairs[0][1]);
  assert.equal(refilled[2].translated, stablePairs[2][1]);
  assert.equal(refill.prompts.length, 8);

  const sentencePairs = [
    ['Junto con Ana, preparo la cena.', 'Вместе с Аной я готовлю ужин.'],
    ['Junto con mi hermano, estudio italiano.', 'Вместе с братом я учу итальянский.'],
    ['Junto con el café, tomo agua.', 'Вместе с кофе я пью воду.'],
  ];
  const stableFocus = createMockService(sentencePairs, [
    {content:'VERDICT: INVALID\nSTUDY_TARGET_KIND: SENTENCE\nPRACTICE_FOCUS: junto con + accompanying noun phrase\nINVALID_EXAMPLES: 2\nISSUES:\n- [2] Correct the translation.'},
    {content:sentencePairs.map(([source, target], i)=>`${i+1}. ${source} || ${target}`).join('\n')},
    {content:'VERDICT: VALID\nSTUDY_TARGET_KIND: EXPRESSION\nPRACTICE_FOCUS: a different topic\nINVALID_EXAMPLES: NONE\nISSUES: NONE'},
    validAudit,
  ]);
  const focused = await createExamples(stableFocus.service,'test-key',
    'Junto con el perro, el gato es el animal doméstico más popular como mascota.','ru',true,'','es');
  assert.equal(focused.length,3,'later audits must not change the agreed kind/focus');
  assert.match(stableFocus.prompts[1],/FIXED PRACTICE PLAN.*junto con \+ accompanying noun phrase/);
  assert.match(stableFocus.prompts[2],/FIXED PRACTICE PLAN.*junto con \+ accompanying noun phrase/);

  // Complete sentences illustrate their construction; forcing the entire input into
  // all three examples made distinct examples impossible (including unspaced scripts).
  for (const [source, target, study, pairs] of [
    ['es', 'ru', 'Junto con el perro, el gato es el animal doméstico más popular como mascota.', [
      ['Junto con Ana, preparo la cena.', 'Вместе с Аной я готовлю ужин.'],
      ['Junto con el café, tomo agua.', 'Вместе с кофе я пью воду.'],
      ['Junto con mi hermano, estudio italiano.', 'Вместе с братом я учу итальянский.'],
    ]],
    ['zh', 'en', '虽然今天下雨，但是我们仍然去散步。', [
      ['虽然很冷，但是他来了。', 'Although it was cold, he came.'],
      ['虽然很累，但是我很开心。', 'Although I am tired, I am happy.'],
      ['虽然下雪，但是火车照常运行。', 'Although it is snowing, the train is running as usual.'],
    ]],
  ]) {
    const mock = createMockService(pairs, [
      {content: 'VERDICT: VALID\nSTUDY_TARGET_KIND: SENTENCE\nINVALID_EXAMPLES: NONE\nSCRIPT_EXCEPTIONS: NONE\nISSUES: NONE'},
      validAudit,
    ]);
    const result = await createExamples(mock.service, 'test-key', study, target, true, '', source);
    assert.equal(result.length, 3);
    assert.deepStrictEqual(result.map(ex => ex.original), pairs.map(ex => ex[0]));
    assert.match(mock.prompts[0], /meaning and syntax/);
  }

  console.log('Example generation/validation/revision tests passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
