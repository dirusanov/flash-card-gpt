/* Runs the shipped content bundle in isolated contexts with instrumented browser APIs.
 * This checks background work and debounce behavior, not real browser CPU usage.
 * Usage: node utils/test-content-performance/run.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundle = fs.readFileSync(path.resolve(__dirname, '../../build/contentScript.bundle.js'), 'utf8');

function page() {
  const calls = { intervals: 0, frames: 0, observers: 0, network: 0, messages: 0, storageReads: 0, databaseChecks: 0, domQueries: 0, selectionReads: 0 };
  const timers = new Map();
  const listeners = new Map();
  const messages = [];
  let timerId = 0;
  let messageListener;
  let selected = '';
  const block = { nodeType: 1, tagName: 'P', textContent: 'Resilience means recovering after difficult times.', parentElement: null };
  const selection = {
    get isCollapsed() { return !selected; },
    rangeCount: 1,
    toString: () => selected,
    getRangeAt: () => ({ commonAncestorContainer: block, startContainer: block, startOffset: 0 }),
  };
  const countObserver = function () { calls.observers++; };
  const context = vm.createContext({
    console, Promise,
    Node: { ELEMENT_NODE: 1 },
    window: { getSelection: () => { calls.selectionReads++; return selection; }, localStorage: { getItem: () => { calls.storageReads++; return null; } } },
    document: {
      body: {}, title: 'CPU fixture', documentElement: { getAttribute: () => 'en' },
      querySelector: () => { calls.domQueries++; return null; },
      querySelectorAll: () => { calls.domQueries++; return []; },
      createRange: () => ({ selectNodeContents() {}, setEnd() {}, toString: () => '' }),
      addEventListener: (event, callback) => listeners.set(event, callback),
    },
    getComputedStyle: () => ({ display: 'block' }),
    location: { href: 'https://fixture.invalid/article' },
    indexedDB: { databases: async () => { calls.databaseChecks++; return []; } },
    chrome: { runtime: {
      onMessage: { addListener: callback => { messageListener = callback; } },
      sendMessage: (message, callback) => { calls.messages++; messages.push(message); callback(); },
    } },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval: () => { calls.intervals++; },
    requestAnimationFrame: () => { calls.frames++; },
    MutationObserver: countObserver, ResizeObserver: countObserver,
    fetch: () => { calls.network++; throw new Error('Unexpected network request'); },
  });
  vm.runInContext(bundle, context, { timeout: 1000 });
  return { calls, timers, messages, listeners, select: value => { selected = value; },
    receive: (message, respond) => messageListener(message, {}, respond),
    flush: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(({ callback }) => callback()); },
  };
}

async function main() {
  const pages = Array.from({ length: 20 }, page);
  await Promise.resolve();
  await Promise.resolve();
  for (const p of pages) {
    assert.equal(p.calls.storageReads, 3);
    assert.equal(p.calls.databaseChecks, 1);
    assert.equal(p.timers.size, 0, 'idle page schedules no timers');
    assert.equal(p.calls.selectionReads, 0);
    for (const key of ['intervals', 'frames', 'observers', 'network', 'messages', 'domQueries']) assert.equal(p.calls[key], 0, key);
    assert.deepEqual([...p.listeners.keys()], ['mouseup']);
  }
  console.log('PASS: 20 idle pages — no timers, DOM scans, network, messages or observers; only one-time storage cleanup checks.');

  const p = pages[0];
  for (let i = 0; i < 100; i++) p.listeners.get('mouseup')();
  assert.equal(p.timers.size, 1);
  assert.equal([...p.timers.values()][0].delay, 150);
  p.flush();
  assert.equal(p.calls.selectionReads, 2);
  assert.equal(p.calls.messages, 0);
  console.log('PASS: 100 rapid clicks coalesce into one selection check and zero messages without selected text.');

  p.select('Resilience');
  p.listeners.get('mouseup')(); p.flush();
  assert.equal(p.calls.messages, 1);
  assert.equal(p.messages[0].sentence, 'Resilience means recovering after difficult times.');
  for (let i = 0; i < 100; i++) { p.listeners.get('mouseup')(); p.flush(); }
  assert.equal(p.calls.messages, 1, 'unchanged selection is not rebroadcast');
  assert.equal(p.timers.size, 0);
  assert.equal(p.calls.network, 0);
  let response;
  p.receive({ action: 'vaulto:getPageSelection' }, value => { response = value; });
  assert.equal(response.text, 'Resilience');
  assert.equal(response.ok, true);
  for (const other of pages.slice(1)) assert.equal(other.calls.selectionReads, 0, 'other tabs do no selection work');
  console.log('PASS: selection message is deduplicated, requested selection still works, and 19 other pages remain untouched.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
