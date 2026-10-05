const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const loadTypescript = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
require.extensions['.ts'] = loadTypescript;
require.extensions['.tsx'] = loadTypescript;

const values = new Map();
global.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const { getDefaultTranslationLanguage } = require('../../src/data/languages.ts');
const { settingsReducer } = require('../../src/store/reducers/settings.ts');
const { hydrateSettings } = require('../../src/store/actions/settings.ts');
const { createTrialCard, getTrialStatus, TrialError, loadQuickState, saveQuickState, emptyQuickState } = require('../../src/services/quickStart.ts');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Provider } = require('react-redux');
const { combineReducers, createStore } = require('redux');
const cardsReducer = require('../../src/store/reducers/cards.ts').default;
const tabStateReducer = require('../../src/store/reducers/tabState.ts').default;
const { setCurrentTabId } = require('../../src/store/actions/tabState.ts');
const { TabAwareProvider, useTabAware } = require('../../src/components/TabAwareProvider.tsx');
const endpoint = 'https://example.com';
const request = { text: 'resilience', source: 'en', target: 'ru' };
const validCard = {
  card: { translation: 'стойкость', source_language: 'en', examples: [{ text: 'She showed resilience.', translation: 'Она проявила стойкость.' }] },
  remaining: 99,
};
const originalFetch = global.fetch;
const originalSetTimeout = global.setTimeout;
const timeouts = [];
global.setTimeout = (callback, delay, ...args) => {
  timeouts.push(delay);
  return originalSetTimeout(callback, delay, ...args);
};
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

(async () => {
  try {
    // Both dispatches come from the render before the async request starts, just as
    // generate() retains them across await. Finishing must unlock the actual store.
    for (const tabScoped of [false, true]) {
      const store = createStore(combineReducers({ cards: cardsReducer, tabState: tabStateReducer, currentPage: () => 'createCard' }));
      if (tabScoped) store.dispatch(setCurrentTabId(7));
      let snapshot;
      const Capture = () => { snapshot = useTabAware(); return null; };
      renderToStaticMarkup(React.createElement(Provider, { store }, React.createElement(TabAwareProvider, { tabId: 7 }, React.createElement(Capture))));
      snapshot.setIsGeneratingCard(true);
      const flag = () => tabScoped ? store.getState().tabState.tabStates[7].cardData.isGeneratingCard : store.getState().cards.isGeneratingCard;
      assert.equal(flag(), true);
      snapshot.setIsGeneratingCard(false);
      assert.equal(flag(), false, 'finishing with an old dispatcher must unlock navigation');
    }

    assert.equal(getDefaultTranslationLanguage(['en-US']), 'en');
    assert.equal(getDefaultTranslationLanguage(['ru-RU']), 'ru');
    assert.equal(getDefaultTranslationLanguage(['pt-BR']), 'pt');
    assert.equal(getDefaultTranslationLanguage(['zh-Hant-TW']), 'zh');
    assert.equal(getDefaultTranslationLanguage(['nb-NO']), 'no');
    assert.equal(getDefaultTranslationLanguage(['unsupported', 'de-DE']), 'de');
    assert.equal(getDefaultTranslationLanguage([]), 'en');
    const initial = settingsReducer(undefined, { type: 'init' });
    assert.equal(settingsReducer(initial, hydrateSettings({ translateToLanguage: 'ja' })).translateToLanguage, 'ja');

    global.fetch = async (_url, options) => {
      assert.equal(options.credentials, 'omit');
      return response({ available: true, remaining: 100, limit: 100 });
    };
    assert.deepEqual(await getTrialStatus(endpoint), { available: true, remaining: 100, limit: 100, imagesAvailable: false });
    assert.equal(timeouts.at(-1), 10000, 'availability checks must not block first use for 90s');

    global.fetch = async () => response({ available: true, remaining: 100, limit: 100, images_available: true });
    assert.equal((await getTrialStatus(endpoint)).imagesAvailable, true);

    global.fetch = async () => response({ available: true, remaining: '100', limit: 100 });
    await assert.rejects(getTrialStatus(endpoint), (error) => error instanceof TrialError && error.code === 'bad_response');

    let cancelledInput;
    const controller = new AbortController();
    global.fetch = async (_url, options) => {
      cancelledInput = JSON.parse(options.body);
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    };
    const cancelled = createTrialCard(endpoint, request, controller.signal);
    controller.abort();
    await assert.rejects(cancelled, (error) => error instanceof TrialError && error.code === 'network');
    assert.equal(timeouts.at(-1), 90000, 'generation keeps its longer server deadline');

    let retryInput;
    global.fetch = async (_url, options) => {
      retryInput = JSON.parse(options.body);
      assert.equal('include_image' in retryInput, false, 'legacy servers must receive their original contract');
      assert.equal(options.credentials, 'omit');
      return response(validCard);
    };
    const retried = await createTrialCard(endpoint, request);
    assert.equal(retryInput.request_id, cancelledInput.request_id, 'retry after cancellation must reuse the server request');
    assert.equal(retried.card.translation, 'стойкость');

    const image = 'data:image/jpeg;base64,/9j/2Q==';
    global.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).include_image, true);
      return response({ ...validCard, card: { ...validCard.card, image, image_status: 'generated' } });
    };
    const illustrated = await createTrialCard(endpoint, { ...request, includeImage: true });
    assert.equal(illustrated.card.image, image);
    assert.equal(illustrated.imageNotice, '');
    assert.equal(timeouts.at(-1), 165000);
    saveQuickState({ ...emptyQuickState(), step: 'result', draft: illustrated.card, includeImage: false });
    const restored = loadQuickState();
    assert.equal(restored.draft.image, image, 'an image must survive closing and reopening the panel');
    assert.equal(restored.includeImage, false);
    assert.ok(restored.draft.createdAt instanceof Date);
    for (const invalidImage of [null, 'https://example.com/expiring-image.jpg', 'data:text/html;base64,WA==', 'data:image/jpeg;base64,' + 'A'.repeat(1200031)]) {
      global.fetch = async () => response({ ...validCard, card: { ...validCard.card, image: invalidImage, image_status: 'failed' } });
      const result = await createTrialCard(endpoint, { ...request, includeImage: true });
      assert.equal(result.card.image, null);
      assert.equal(result.card.translation, 'стойкость', 'image failures must keep the text card');
      assert.ok(result.imageNotice.length > 0, 'requested images must never disappear silently');
    }

    // Headers can arrive before the response body. Cancel must still interrupt that wait.
    const bodyController = new AbortController();
    let bodyReady;
    const waitingForBody = new Promise((resolve) => { bodyReady = resolve; });
    global.fetch = async (_url, options) => ({
      ok: true, status: 200,
      text: () => {
        bodyReady();
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      },
    });
    const bodyRequest = createTrialCard(endpoint, request, bodyController.signal);
    await waitingForBody;
    bodyController.abort();
    await assert.rejects(bodyRequest, (error) => error instanceof TrialError && error.code === 'network');

    global.fetch = async () => response({ detail: { code: 'trial_exhausted' } }, 429);
    await assert.rejects(createTrialCard(endpoint, request), (error) => error instanceof TrialError && error.code === 'trial_exhausted');
    console.log('PASS: navigation, languages, deadlines, abort/retry credits, legacy server compatibility, image capability, image persistence and graceful failure');
  } finally {
    global.fetch = originalFetch;
    global.setTimeout = originalSetTimeout;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
