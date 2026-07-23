// src/pages/Background/index.js
import { recordDailyActivity } from '../../services/usageMetrics';
import { dropScope } from '../../services/cardImageStore';
import { setPendingSelection } from '../../services/pendingSelection';
import { GET_PAGE_SELECTION } from '../../services/pageContextBridge';

function parseStoredCards(value) {
  if (typeof value !== 'string') {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function serializeStoredCards(cards) {
  return JSON.stringify(cards, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });
}

function enqueueStoredCardsMerge(task) {
  storedCardsMergeQueue = storedCardsMergeQueue
    .catch(() => undefined)
    .then(task);

  return storedCardsMergeQueue;
}

function readStoredCardsSnapshot() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([STORED_CARDS_KEY], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(parseStoredCards(result[STORED_CARDS_KEY]));
    });
  });
}

function writeStoredCardsSnapshot(cards) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({
      [STORED_CARDS_KEY]: serializeStoredCards(cards),
    }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve();
    });
  });
}

function configureActionForTab(tab) {
  if (!tab || tab.id == null) return;
  const url = tab.url || '';
  const isHttp = url.startsWith('http://') || url.startsWith('https://');
  if (isHttp) {
    chrome.action.setPopup({ tabId: tab.id, popup: '' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Vaulto Cards' });
  } else {
    chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    chrome.action.setTitle({
      tabId: tab.id,
      title: 'Расширение недоступно на этой странице',
    });
  }
}

function isMissingContentScriptError(errorMessage) {
  if (!errorMessage) return false;
  return errorMessage.includes('Could not establish connection')
    || errorMessage.includes('Receiving end does not exist');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const errorMessage = chrome.runtime.lastError?.message;
        if (errorMessage) {
          reject(new Error(errorMessage));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function sendMessageToTabWithRetry(tabId, message, maxAttempts = CONTENT_SCRIPT_MAX_ATTEMPTS) {
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await sendMessageToTab(tabId, message);
    } catch (error) {
      lastError = error;
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (!isMissingContentScriptError(errorMessage) || attempt === maxAttempts - 1) {
        throw error;
      }
      await sleep(CONTENT_SCRIPT_RETRY_DELAY_MS);
    }
  }

  throw lastError || new Error('Failed to deliver message to content script');
}

const CREATE_CARD_MENU_ID = 'vaulto-create-card-from-selection';
const HTTP_URL_PATTERNS = ['http://*/*', 'https://*/*'];

function registerContextMenu() {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: CREATE_CARD_MENU_ID,
        title: 'Create card from "%s"',
        contexts: ['selection'],
        documentUrlPatterns: HTTP_URL_PATTERNS,
      });
    });
  } catch (error) {
    console.error('Failed to register context menu:', error);
  }
}

// Opens the native side panel and parks the selection for it to pick up. `sidePanel.open`
// must be called while the user gesture is still live, so it goes first and the slower work
// (asking the page for the exact selection) happens after.
function createCardFromSelection(tabId, selectionText) {
  if (tabId == null) return;

  void recordDailyActivity();

  try {
    chrome.sidePanel.open({ tabId }).catch((error) => {
      console.error('Failed to open the side panel:', error);
    });
  } catch (error) {
    console.error('Failed to open the side panel:', error);
  }

  // The menu's selectionText is truncated by Chrome, so prefer the live selection and fall
  // back only when the page cannot answer.
  sendMessageToTabWithRetry(tabId, { action: GET_PAGE_SELECTION })
    .then((response) => (response && response.ok && response.text) || selectionText || '')
    .catch(() => selectionText || '')
    .then((text) => {
      if (text) {
        return setPendingSelection(text);
      }
      return undefined;
    })
    .catch((error) => console.error('Failed to hand the selection to the panel:', error));
}

// Everything keyed by tab id is dead once the tab is gone, and nothing else ever removes it:
// Chrome also reuses tab ids, so leftovers can surface as another tab's draft.
async function cleanupTabData(tabId) {
  try {
    await new Promise((resolve) => {
      chrome.storage.local.remove(
        [`anki_ui_tab_${tabId}`, `${TAB_CARDS_KEY_PREFIX}_${tabId}`],
        () => resolve(),
      );
    });

    await dropScope(`tab:${tabId}`);

  } catch (error) {
    console.error(`Failed to clean up storage for tab ${tabId}:`, error);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void cleanupTabData(tabId);
});

chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId, configureActionForTab));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.active) return;
  if (changeInfo.status === 'complete' || changeInfo.url) configureActionForTab(tab);
});
chrome.runtime.onInstalled.addListener(({ reason }) => {
  registerContextMenu();
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => tabs[0] && configureActionForTab(tabs[0]));

  // A fresh install cannot create a single card until an API key is entered, and nothing in
  // the panel says so until a generation has already failed. Updates stay silent.
  if (reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

// Chrome keeps registered menus across service worker restarts, so onInstalled covers the
// normal case. This re-registration is belt and braces for a profile that somehow lost it;
// removeAll() first keeps it from failing on a duplicate id.
chrome.runtime.onStartup.addListener(registerContextMenu);

// Chrome opens the panel on the toolbar click for us; doing it here would need a user
// gesture we do not have.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Failed to set side panel behavior:', error));
});

// утилита для прокси загрузки картинок по URL -> dataURL
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (typeof msg === 'string' && msg.startsWith('http')) {
    fetch(msg, { method: 'GET' })
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onloadend = () => res(fr.result);
            fr.onerror = rej;
            fr.readAsDataURL(blob);
          }),
      )
      .then((dataUrl) => sendResponse({ status: true, data: dataUrl }))
      .catch((err) => sendResponse({ status: false, error: String(err) }));
    return true;
  }

  if (!msg || typeof msg !== 'object') {
    return undefined;
  }

  if (msg.action === 'proxyFetch') {
    const { requestId, url, options = {} } = msg;
    const controller = new AbortController();
    activeFetchControllers.set(requestId, controller);

    fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null,
      redirect: options.redirect,
      credentials: options.credentials,
      signal: controller.signal,
    })
      .then(async (response) => {
        const headers = {};
        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        let bodyText = '';
        if (options.responseType === 'dataUrl' && response.ok) {
          const blob = await response.blob();
          bodyText = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onloadend = () => resolve(fr.result || '');
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
        } else {
          bodyText = await response.text();
        }

        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers,
          body: bodyText,
        });
      })
      .catch((error) => {
        const isAbort = error && error.name === 'AbortError';
        sendResponse({
          ok: false,
          status: 0,
          statusText: isAbort ? 'Aborted' : 'Error',
          headers: {},
          body: '',
          aborted: isAbort,
          error: isAbort ? 'Request aborted' : String(error),
        });
      })
      .finally(() => {
        activeFetchControllers.delete(requestId);
      });

    return true;
  }

  if (msg.action === MERGE_STORED_CARDS_ACTION) {
    const payload = msg.payload || {};
    const upserts = Array.isArray(payload.upserts) ? payload.upserts : [];
    const deleteIds = Array.isArray(payload.deleteIds) ? payload.deleteIds : [];

    enqueueStoredCardsMerge(async () => {
      const currentCards = await readStoredCardsSnapshot();
      const mergedCards = new Map();

      currentCards.forEach((card) => {
        if (card && card.id) {
          mergedCards.set(card.id, card);
        }
      });

      deleteIds.forEach((cardId) => {
        if (cardId) {
          mergedCards.delete(cardId);
        }
      });

      upserts.forEach((card) => {
        if (card && card.id) {
          mergedCards.set(card.id, card);
        }
      });

      await writeStoredCardsSnapshot(Array.from(mergedCards.values()));
    })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));

    return true;
  }

  if (msg.action === 'proxyFetchAbort') {
    const { requestId } = msg;
    const controller = activeFetchControllers.get(requestId);
    if (controller) {
      controller.abort();
      activeFetchControllers.delete(requestId);
    }
    sendResponse({ ok: false, aborted: true });
    return true;
  }

  if (msg.action === 'googleAuthFlow') {
    const { url } = msg;
    if (!url) {
      sendResponse({ ok: false, error: 'Missing OAuth URL' });
      return true;
    }
    try {
      chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        if (!responseUrl) {
          sendResponse({ ok: false, error: 'Google sign-in was cancelled.' });
          return;
        }
        sendResponse({ ok: true, url: responseUrl });
      });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
    return true;
  }

  if (msg.action === 'getTabId') {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
    return true;
  }

  return undefined;
});
