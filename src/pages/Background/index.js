/* eslint-disable no-console */
console.log('I am background script');

// Клик по иконке — пусть контент решит по preferredMode
chrome.action.onClicked.addListener((tab) => {
  if (!tab || tab.id == null) return;
  chrome.tabs.sendMessage(tab.id, { action: 'togglePreferredUI', tabId: tab.id }, (resp) => {
    if (chrome.runtime.lastError) {
      console.error('togglePreferredUI error:', chrome.runtime.lastError.message);
    } else {
      console.log('togglePreferredUI response:', resp);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // image fetch (оставляем как было, если у тебя есть)
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
      return true;
    }

    // вернуть tabId
    if (message && message.action === 'getTabId') {
      const tabId = sender?.tab?.id ?? null;
      sendResponse({ tabId });
      return true;
    }

    // ПРОКСИРУЕМ В ТЕКУЩУЮ ВКЛАДКУ — чтобы App.tsx (и content) получили событие
    const forwardToTab = (actList) => {
      if (!message || !message.action || !actList.includes(message.action)) return false;
      const targetTabId = sender?.tab?.id ?? message.tabId;
      if (targetTabId == null) {
        sendResponse?.({ status: false, error: 'No target tabId' });
        return true;
      }
      chrome.tabs.sendMessage(targetTabId, { ...message, tabId: targetTabId }, (response) => {
        if (chrome.runtime.lastError) sendResponse?.({ status: false, error: chrome.runtime.lastError.message });
        else sendResponse?.(response || { ok: true });
      });
      return true;
    };

    if (forwardToTab(['togglePreferredUI', 'toggleSidebar',
      'forceHideSidebar','forceShowSidebar','collapseSidebar','expandSidebar',
      'showFloating','hideFloating','toggleFloating','syncFloatingState',
      'setPreferredMode'])) return true;

    // сайдбар силовые / тумблер
    if (forwardToTab(['toggleSidebar', 'forceHideSidebar', 'forceShowSidebar', 'collapseSidebar', 'expandSidebar'])) return true;

    // ВАЖНО: проксируем эти события для ПЛАВАЮЩЕГО окна и синхронизации
    if (forwardToTab(['showFloating', 'hideFloating', 'toggleFloating', 'syncFloatingState'])) return true;

    // настроечные (необязательно проксировать, но можно)
    if (forwardToTab(['setPreferredMode'])) return true;

  } catch (err) {
    console.error('onMessage handler error:', err);
    try { sendResponse?.({ status: false, error: String(err) }); } catch {}
  }
  return false;
});

console.log('Background script has been loaded.');
