#!/usr/bin/env node
'use strict';

const WebSocket = require('ws');

const socketUrl = process.argv[2];
const studyTarget = process.argv[3] || '衣服';
if (!socketUrl) {
  throw new Error('Pass the DevTools page WebSocket URL as the first argument.');
}

const redact = (value) =>
  String(value)
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, 'Bearer [REDACTED]');

const socket = new WebSocket(socketUrl);
let nextId = 0;
const pending = new Map();
const consoleEntries = [];

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

const evaluate = async (expression) => {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || 'Runtime evaluation failed.');
  }
  return response.result?.value;
};

const wait = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const waitFor = async (predicateExpression, timeoutMs) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(predicateExpression)) return true;
    await wait(500);
  }
  return false;
};

socket.on('message', (rawMessage) => {
  const message = JSON.parse(rawMessage.toString());
  if (message.id) {
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result || {});
    return;
  }

  if (message.method === 'Runtime.consoleAPICalled') {
    consoleEntries.push({
      type: message.params.type,
      args: message.params.args || [],
    });
  }

  if (message.method === 'Runtime.exceptionThrown') {
    consoleEntries.push({
      type: 'exception',
      text: redact(message.params.exceptionDetails?.exception?.description
        || message.params.exceptionDetails?.text
        || 'Unknown runtime exception'),
    });
  }

  if (message.method === 'Log.entryAdded') {
    consoleEntries.push({
      type: message.params.entry.level,
      text: redact(message.params.entry.text),
    });
  }
});

socket.on('open', async () => {
  try {
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Page.reload', { ignoreCache: true });

    const ready = await waitFor(
      `Boolean(document.querySelector('textarea[aria-label="Word or phrase for the card"]'))`,
      20_000,
    );
    if (!ready) {
      throw new Error(`Side panel did not become ready. Body: ${await evaluate('document.body.innerText')}`);
    }

    // Runtime diagnostics should exercise the text pipeline without making unrelated,
    // costly image/audio requests or changing the user's persisted generation modes.
    await evaluate(`(() => {
      for (const label of ['Image generation', 'Audio generation']) {
        const button = document.querySelector(\`button[aria-label="\${label}"]\`);
        if (button?.getAttribute('aria-checked') === 'true') button.click();
      }
      return true;
    })()`);

    await evaluate(`(() => {
      const input = document.querySelector('textarea[aria-label="Word or phrase for the card"]');
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set;
      setter.call(input, ${JSON.stringify(studyTarget)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return input.value;
    })()`);

    const createButtonReady = await waitFor(
      `Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent.includes('Create card') && !button.disabled
      )`,
      10_000,
    );
    if (!createButtonReady) {
      throw new Error('Create card button did not become enabled.');
    }

    await evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find(
        (candidate) => candidate.textContent.includes('Create card') && !candidate.disabled
      );
      button.click();
      return true;
    })()`);

    const completed = await waitFor(
      `document.body.innerText.includes('Your card')
        || document.body.innerText.includes('Translation failed')
        || document.body.innerText.includes('API key')`,
      240_000,
    );

    const result = await evaluate(`(() => ({
      completed: ${completed},
      bodyText: document.body.innerText,
      transcriptionHtml: Array.from(
        document.querySelectorAll('.transcription-item')
      ).map((element) => element.outerHTML),
      grammarText: Array.from(document.querySelectorAll('*')).find(
        (element) => element.textContent?.trim() === 'Grammar Reference'
      )?.parentElement?.innerText || '',
    }))()`);

    const renderedConsoleEntries = [];
    for (const entry of consoleEntries) {
      if (!entry.args) {
        renderedConsoleEntries.push(entry);
        continue;
      }

      const values = [];
      for (const argument of entry.args) {
        if (argument.objectId) {
          try {
            const serialized = await send('Runtime.callFunctionOn', {
              objectId: argument.objectId,
              functionDeclaration: `function () {
                try { return JSON.stringify(this); }
                catch (_) { return String(this); }
              }`,
              returnByValue: true,
            });
            values.push(serialized.result?.value ?? argument.description ?? argument.type);
          } catch {
            values.push(argument.description ?? argument.type);
          }
        } else {
          values.push(argument.value ?? argument.description ?? argument.type);
        }
      }
      renderedConsoleEntries.push({
        type: entry.type,
        text: redact(values.map((value) =>
          typeof value === 'string' ? value : JSON.stringify(value)
        ).join(' ')),
      });
    }

    const relevantLogs = renderedConsoleEntries.filter((entry) =>
      /transcri|pronunciation|example|translation|grammar|parallel|衣服|error|invalid|reject|recover/iu
        .test(entry.text)
    );

    process.stdout.write(`${JSON.stringify({
      result,
      logs: relevantLogs,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${redact(error.stack || error.message || error)}\n`);
    process.exitCode = 1;
  } finally {
    socket.close();
  }
});
