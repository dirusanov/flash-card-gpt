#!/usr/bin/env node
// Exercises the REAL card-generation pipeline (src/services/aiServiceFactory.ts ->
// createCardComponentsParallel, the same one CreateCard.tsx calls) against a real
// OpenAI API key, outside the Chrome extension shell.
//
// Why this exists instead of driving the extension in a browser: browser automation
// tools cannot navigate to chrome:// or chrome-extension:// pages (they're treated as
// browser-internal), so there is no way to open the side panel, options page, or popup
// via automation. This harness compiles the actual service TypeScript to plain JS and
// runs it directly in Node, which tests identical prompts/parsing/logic.
//
// Usage:
//   OPENAI_API_KEY=sk-... node utils/test-ai-cards/run.js
//   node utils/test-ai-cards/run.js /path/to/keyfile.txt
//   node utils/test-ai-cards/run.js /path/to/keyfile.txt utils/test-ai-cards/cases.custom.json
//
// See TESTING_AI_CARDS.md at the repo root for the full write-up (methodology, known
// sandbox gotchas, what to look for when judging quality).

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const COMPILED = path.join(HERE, '.compiled', 'src');
const RESULTS = path.join(HERE, '.results');

function compile() {
  const tsc = path.join(HERE, '..', '..', 'node_modules', '.bin', 'tsc');
  execFileSync(tsc, ['-p', path.join(HERE, 'tsconfig.json')], { stdio: 'inherit' });
}

// --- Shims so the extension's browser-oriented code runs under plain Node ---

function installShims() {
  // backgroundFetch.ts checks `location.protocol === 'chrome-extension:'` to decide
  // whether it's safe to fetch() directly (true inside an extension page) instead of
  // going through the background service worker via chrome.runtime.sendMessage.
  global.location = { protocol: 'chrome-extension:' };

  // Only the image path needs FileReader (to turn a Blob into a data: URL). Node has no
  // built-in FileReader.
  class NodeFileReader {
    readAsDataURL(blob) {
      (async () => {
        try {
          const buf = Buffer.from(await blob.arrayBuffer());
          const mime = blob.type || 'application/octet-stream';
          this.result = `data:${mime};base64,${buf.toString('base64')}`;
          if (this.onloadend) this.onloadend();
        } catch (err) {
          this.error = err;
          if (this.onerror) this.onerror();
        }
      })();
    }
  }
  global.FileReader = NodeFileReader;

  // Node's built-in fetch (undici) does not honor HTTP_PROXY/HTTPS_PROXY env vars. Some
  // sandboxes only allow outbound network through a local proxy — route global fetch
  // through it explicitly when one is configured. No-op when there's no proxy.
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    const { setGlobalDispatcher, ProxyAgent } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  }
}

function resolveApiKey() {
  const argPath = process.argv[2];
  if (argPath) {
    return fs.readFileSync(argPath, 'utf8').trim();
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY.trim();
  }
  throw new Error(
    'Provide the API key via OPENAI_API_KEY env var, or as a file path argument ' +
    '(so it never ends up in shell history or a chat transcript).'
  );
}

// Default test matrix: 3 source languages -> Russian (adjust to your own interface
// language), 4 items each covering the shapes worth checking separately:
//   noun         - a concrete, image-worthy word/short phrase
//   sentence     - a full sentence (translation must stay one coherent sentence,
//                  grammar brief should describe the whole clause)
//   function-word- an abstract/grammatical word (should NOT get an image)
//   collocation  - a multi-word idiom/expression that is not a full sentence
const DEFAULT_CASES = [
  { lang: 'es', label: 'Spanish', text: 'el gato', kind: 'noun' },
  { lang: 'es', label: 'Spanish', text: 'Estoy aprendiendo español desde hace un año.', kind: 'sentence' },
  { lang: 'es', label: 'Spanish', text: 'aunque', kind: 'function-word' },
  { lang: 'es', label: 'Spanish', text: 'de vez en cuando', kind: 'collocation' },

  { lang: 'zh', label: 'Chinese', text: '猫', kind: 'noun' },
  { lang: 'zh', label: 'Chinese', text: '我正在学习中文。', kind: 'sentence' },
  { lang: 'zh', label: 'Chinese', text: '虽然', kind: 'function-word' },
  { lang: 'zh', label: 'Chinese', text: '马马虎虎', kind: 'collocation' },

  { lang: 'vi', label: 'Vietnamese', text: 'con mèo', kind: 'noun' },
  { lang: 'vi', label: 'Vietnamese', text: 'Tôi đang học tiếng Việt.', kind: 'sentence' },
  { lang: 'vi', label: 'Vietnamese', text: 'mặc dù', kind: 'function-word' },
  { lang: 'vi', label: 'Vietnamese', text: 'từ từ thôi', kind: 'collocation' },
];

const TARGET_LANGUAGE = process.env.TARGET_LANGUAGE || 'ru'; // interface/native language

function loadCases() {
  const customPath = process.argv[3];
  if (customPath) {
    return JSON.parse(fs.readFileSync(customPath, 'utf8'));
  }
  return DEFAULT_CASES;
}

async function runCase(service, apiKey, testCase) {
  const { lang, text, kind } = testCase;
  const start = Date.now();
  const { createCardComponentsParallel } = require(path.join(COMPILED, 'services/aiServiceFactory.js'));
  try {
    const result = await createCardComponentsParallel(
      service,
      apiKey,
      text,
      TARGET_LANGUAGE,
      undefined, // customPrompt
      lang, // sourceLanguage
      true, // shouldGenerateImage
      undefined, // abortSignal
      'smart', // imageGenerationMode
      false, // shouldGenerateAudio
      'off', // audioGenerationMode
      apiKey // openAiKey (fallback image provider key)
    );

    return {
      ...testCase,
      durationMs: Date.now() - start,
      translation: result.translation,
      examples: result.examples,
      linguisticInfo: result.linguisticInfo,
      transcription: result.transcription,
      hasImage: !!result.imageUrl,
      imageUrl: result.imageUrl || null,
      errors: result.errors,
    };
  } catch (error) {
    return {
      ...testCase,
      durationMs: Date.now() - start,
      fatalError: error instanceof Error ? error.message : String(error),
    };
  }
}

(async () => {
  console.error('Compiling service sources...');
  compile();
  installShims();

  const { getAIService } = require(path.join(COMPILED, 'services/aiServiceFactory.js'));
  const { ModelProvider } = require(path.join(COMPILED, 'store/reducers/settings.js'));

  const apiKey = resolveApiKey();
  const service = getAIService(ModelProvider.OpenAI);
  const cases = loadCases();

  fs.mkdirSync(RESULTS, { recursive: true });

  for (const testCase of cases) {
    process.stderr.write(`Running: [${testCase.label || testCase.lang}] "${testCase.text}" (${testCase.kind})...\n`);
    const result = await runCase(service, apiKey, testCase);
    const safeName = `${testCase.lang}_${testCase.kind}`.replace(/[^a-z0-9_]/gi, '_');

    // Pull the (potentially huge) base64 image out of the JSON and onto disk as a real file.
    let imageFile = null;
    if (result.imageUrl && typeof result.imageUrl === 'string' && result.imageUrl.startsWith('data:')) {
      const match = result.imageUrl.match(/^data:(.+);base64,(.*)$/s);
      if (match) {
        const ext = match[1].includes('png') ? 'png' : match[1].includes('jpeg') ? 'jpg' : 'bin';
        imageFile = path.join(RESULTS, `${safeName}.${ext}`);
        fs.writeFileSync(imageFile, Buffer.from(match[2], 'base64'));
      }
    }
    delete result.imageUrl;
    result.imageFile = imageFile;

    const outFile = path.join(RESULTS, `${safeName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
    process.stderr.write(`  -> ${outFile} (${result.durationMs}ms, image=${imageFile ? 'yes' : 'no'})\n`);
  }

  process.stderr.write(`\nAll cases done. See ${RESULTS}\n`);
})();
