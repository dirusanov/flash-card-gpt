#!/usr/bin/env node
// Quick focused check of createOptimizedLinguisticInfo's new word/sentence self-classification,
// without paying for the rest of the card pipeline (translation, examples, image, transcription).
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const COMPILED = path.join(HERE, '.compiled', 'src');

execFileSync(path.join(HERE, '..', '..', 'node_modules', '.bin', 'tsc'), ['-p', path.join(HERE, 'tsconfig.json')], { stdio: 'inherit' });

global.location = { protocol: 'chrome-extension:' };
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  const { setGlobalDispatcher, ProxyAgent } = require('undici');
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const { getAIService, createOptimizedLinguisticInfo } = require(path.join(COMPILED, 'services/aiServiceFactory.js'));
const { ModelProvider } = require(path.join(COMPILED, 'store/reducers/settings.js'));

const apiKey = fs.readFileSync(process.argv[2], 'utf8').trim();
const service = getAIService(ModelProvider.OpenAI);

const CASES = [
  { lang: 'es', text: 'el gato', kind: 'word' },
  { lang: 'es', text: 'Estoy aprendiendo español desde hace un año.', kind: 'sentence' },
  { lang: 'zh', text: '猫', kind: 'word' },
  { lang: 'zh', text: '我正在学习中文。', kind: 'sentence' },
  { lang: 'vi', text: 'con mèo', kind: 'word' },
  { lang: 'vi', text: 'Tôi đang học tiếng Việt.', kind: 'sentence' },
];

(async () => {
  for (const c of CASES) {
    try {
      const result = await createOptimizedLinguisticInfo(service, apiKey, c.text, c.lang, 'ru');
      console.log(`\n[${c.lang}] "${c.text}" (${c.kind}) — attempts=${result.attempts} wasValidated=${result.wasValidated}`);
      console.log(result.linguisticInfo);
    } catch (e) {
      console.log(`\n[${c.lang}] "${c.text}" (${c.kind}) — ERROR: ${e}`);
    }
  }
})();
