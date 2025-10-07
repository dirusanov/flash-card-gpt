// src/pages/Background/index.js
const VIEW_STORAGE_KEY = 'anki_view_prefs_v1';

function getViewPrefs() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([VIEW_STORAGE_KEY], (res) => {
        const stored = res[VIEW_STORAGE_KEY] || {};
        resolve({
          preferredModeByTab: stored.preferredModeByTab || {},
          visibleByTab: stored.visibleByTab || {},
          floatGeometryByTab: stored.floatGeometryByTab || {},
          globalMode: stored.globalMode === 'float' ? 'float' : 'sidebar',
          globalVisible: typeof stored.globalVisible === 'boolean' ? stored.globalVisible : true,
        });
      });
    } catch (e) {
      resolve({
        preferredModeByTab: {},
        visibleByTab: {},
        floatGeometryByTab: {},
        globalMode: 'sidebar',
        globalVisible: true,
      });
    }
  });
}

function configureActionForTab(tab) {
  if (!tab || tab.id == null) return;
  const url = tab.url || '';
  const isHttp = url.startsWith('http://') || url.startsWith('https://');
  if (isHttp) {
    chrome.action.setPopup({ tabId: tab.id, popup: '' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Toggle Sidebar / Floating' });
  } else {
    chrome.action.setPopup({ tabId: tab.id, popup: 'popup.html' });
    chrome.action.setTitle({
      tabId: tab.id,
      title: 'Расширение недоступно на этой странице',
    });
  }
}

chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId, configureActionForTab));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab || !tab.active) return;
  if (changeInfo.status === 'complete' || changeInfo.url) configureActionForTab(tab);
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ currentWindow: true, active: true }, (tabs) => tabs[0] && configureActionForTab(tabs[0]));
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  const tabId = tab.id;

  const view = await getViewPrefs();
  const mode = (view.preferredModeByTab && view.preferredModeByTab[tabId]) || view.globalMode || 'sidebar';
  const visibleMap = view.visibleByTab || {};
  const hasVisibleEntry = Object.prototype.hasOwnProperty.call(visibleMap, tabId);
  const visible = hasVisibleEntry ? !!visibleMap[tabId] : !!view.globalVisible;

  if (mode === 'float') {
    chrome.tabs.sendMessage(tabId, { action: visible ? 'hideFloating' : 'showFloating', tabId });
  } else {
    // режим сайдбара переключаем
    chrome.tabs.sendMessage(tabId, { action: 'toggleSidebar', tabId });
  }
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

  if (msg && msg.action === 'getTabId') {
    sendResponse({ tabId: sender.tab ? sender.tab.id : null });
    return true;
  }
});
