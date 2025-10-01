/* eslint-disable no-console */
console.log('I am background script');

/**
 * Память по вкладкам: { floatingVisible: boolean }
 */
const tabState = new Map();
const getState = (tabId) => tabState.get(tabId) || { floatingVisible: false };
const setState = (tabId, next) => tabState.set(tabId, { ...getState(tabId), ...next });

/**
 * Кнопка в тулбаре — popup только на http/https.
 */
const configureActionForTab = (tab) => {
  if (!tab || tab.id == null) return;
  const url = tab.url || '';
  const isHttp = url.startsWith('http://') || url.startsWith('https://');

  if (isHttp) {
    chrome.action.setPopup({ tabId: tab.id, popup: '' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Toggle Sidebar / Floating Window' });
  } else {
    chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Расширение недоступно на этой странице' });
  }
};

const refreshActiveTabAction = () => {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => {
    if (chrome.runtime.lastError) return;
    configureActionForTab(tabs[0]);
  });
};

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    configureActionForTab(tab);
  });
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!tab || !tab.active) return;
  if (info.status === 'complete' || info.url) configureActionForTab(tab);
});

chrome.runtime.onInstalled.addListener(() => refreshActiveTabAction());
refreshActiveTabAction();

/**
 * Клик по иконке:
 * - если float включён — выключаем его (шлём 'toggleFloating');
 * - если выключен — пробуем включить float; если страницы-слушателя нет — fallback на 'toggleSidebar'.
 */
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  const { floatingVisible } = getState(tab.id);

  if (floatingVisible) {
    setState(tab.id, { floatingVisible: false });
    chrome.tabs.sendMessage(tab.id, { action: 'toggleFloating' }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('toggleFloating(off) error:', chrome.runtime.lastError.message);
      } else {
        console.log('toggleFloating off response:', res);
      }
    });
    return;
  }

  let responded = false;
  chrome.tabs.sendMessage(tab.id, { action: 'toggleFloating' }, (res) => {
    if (chrome.runtime.lastError) {
      console.warn('toggleFloating error, fallback to sidebar:', chrome.runtime.lastError.message);
      chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar', tabId: tab.id }, (resp2) => {
        if (chrome.runtime.lastError) console.error('toggleSidebar error:', chrome.runtime.lastError.message);
        else console.log('toggleSidebar response:', resp2);
      });
      return;
    }
    responded = true;
    setState(tab.id, { floatingVisible: true });
    console.log('toggleFloating on response:', res);
  });

  // дублируем fallback, если вообще тишина
  setTimeout(() => {
    if (!responded) chrome.tabs.sendMessage(tab.id, { action: 'toggleSidebar', tabId: tab.id }, () => {});
  }, 150);
});

/**
 * Общий onMessage: утилиты, прокси сайдбара, синхронизация.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // image fetch (по URL вернём dataURL)
    if (typeof message === 'string' && message.startsWith('http')) {
      fetch(message, { method: 'GET' })
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onloadend = () => sendResponse({ status: true, data: reader.result });
          reader.onerror = (e) => sendResponse({ status: false, error: String(e) });
          reader.readAsDataURL(blob);
        })
        .catch((e) => sendResponse({ status: false, error: String(e) }));
      return true; // async
    }

    // getTabId
    if (message && message.action === 'getTabId') {
      const tabId = sender?.tab?.id ?? null;
      sendResponse({ tabId });
      return true;
    }

    // Прокси команд сайдбара
    if (message && (message.action === 'toggleSidebar' || message.action === 'collapseSidebar' || message.action === 'expandSidebar')) {
      const targetTabId = sender?.tab?.id ?? message.tabId;
      if (targetTabId == null) {
        sendResponse?.({ status: false, error: 'No target tabId' });
        return false;
      }
      chrome.tabs.sendMessage(targetTabId, { action: message.action, tabId: targetTabId }, (response) => {
        if (chrome.runtime.lastError) sendResponse?.({ status: false, error: chrome.runtime.lastError.message });
        else sendResponse?.({ status: true, response });
      });
      return true;
    }

    // Страница просит переключить float
    if (message && message.action === 'toggleFloatingFromPage') {
      const tabId = sender?.tab?.id;
      if (tabId == null) {
        sendResponse?.({ ok: false, error: 'No sender.tab.id' });
        return false;
      }
      const { floatingVisible } = getState(tabId);
      const next = !floatingVisible;
      setState(tabId, { floatingVisible: next });
      chrome.tabs.sendMessage(tabId, { action: 'toggleFloating' }, () => {});
      sendResponse?.({ ok: true, floatingVisible: next });
      return true;
    }

    // Синхронизация состояния float из страницы
    if (message && message.action === 'syncFloatingState') {
      const tabId = sender?.tab?.id ?? message.tabId;
      if (tabId != null && typeof message.floatingVisible === 'boolean') {
        setState(tabId, { floatingVisible: message.floatingVisible });
      }
      sendResponse?.({ ok: true });
      return true;
    }

  } catch (err) {
    console.error('onMessage handler error:', err);
    try { sendResponse?.({ status: false, error: String(err) }); } catch {}
  }
  return false;
});

console.log('Background script has been loaded.');
