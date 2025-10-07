/* eslint-disable no-console */
import { printLine } from './modules/print';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import { Provider } from 'react-redux';
import { instantiateStore } from '../../store';

console.log('Content script works!');
console.log('Must reload extension for modifications to take effect.');
printLine("Using the 'printLine' function from the Print Module");

// ---------- Контейнер сайдбара (id = #sidebar) ----------
const newDiv = document.createElement('div');
newDiv.id = 'sidebar';
newDiv.setAttribute('style', `
  all: initial;
  position: fixed;
  top: 0;
  right: 0;
  width: 350px;
  height: 100%;
  overflow: auto;
  z-index: 2147483645; /* ниже плавающего окна */
  background-color: #ffffff;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.15);
  transform: translateX(100%); /* по умолчанию скрыто */
  transition: transform 0.3s ease-in-out;
`);

const shadow = newDiv.attachShadow({ mode: 'open' });
const linkElem = document.createElement('link');
linkElem.setAttribute('rel', 'stylesheet');
linkElem.setAttribute('href', chrome.runtime.getURL('tailwind.css'));
shadow.appendChild(linkElem);
document.body.appendChild(newDiv);

const root = createRoot(shadow);

// ---------- Красивый лоадер ----------
const LoadingSpinner = () =>
  React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif', color: '#ffffff'
    }
  }, [
    React.createElement('div', {
      key: 'logo',
      style: {
        width: '48px', height: '48px', background: 'rgba(255,255,255,0.2)', borderRadius: '12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px',
        animation: 'pulse 2s ease-in-out infinite'
      }
    }, '🧠'),
    React.createElement('div', {
      key: 'spinner',
      style: {
        width: '32px', height: '32px',
        border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #ffffff', borderRadius: '50%',
        animation: 'spin 1s linear infinite', marginBottom: '20px'
      }
    }),
    React.createElement('h2', { key: 'title', style: { color: '#ffffff', fontSize: 20, fontWeight: 700, marginBottom: 8, textAlign: 'center' } }, 'Anki Flash Cards'),
    React.createElement('p', { key: 'subtitle', style: { color: 'rgba(255,255,255,0.8)', fontSize: 14, textAlign: 'center' } }, 'Initializing your learning assistant...'),
    React.createElement('div', { key: 'progress-bar', style: { width: 200, height: 2, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 1, marginTop: 24, overflow: 'hidden' } },
      React.createElement('div', { style: { width: '100%', height: '100%', backgroundColor: '#ffffff', animation: 'progressBar 2s ease-in-out infinite' } })
    ),
    React.createElement('style', { key: 'styles' }, `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }
      @keyframes progressBar { 0% { transform: translateX(-100%); } 50% { transform: translateX(0%); } 100% { transform: translateX(100%); } }
    `)
  ]);

// ---------- Управление UI-состоянием (chrome.storage) ----------
const VIEW_STORAGE_KEY = 'anki_view_prefs_v1';

const ensureViewDefaults = (prefs) => ({
  preferredModeByTab: { ...(prefs?.preferredModeByTab || {}) },
  visibleByTab: { ...(prefs?.visibleByTab || {}) },
  floatGeometryByTab: { ...(prefs?.floatGeometryByTab || {}) },
  globalMode: prefs?.globalMode === 'float' ? 'float' : 'sidebar',
  globalVisible: typeof prefs?.globalVisible === 'boolean' ? prefs.globalVisible : true,
});

const updateViewPrefs = (mutate) => new Promise((resolve) => {
  chrome.storage.local.get([VIEW_STORAGE_KEY], (res) => {
    const current = ensureViewDefaults(res[VIEW_STORAGE_KEY]);
    const next = mutate(current) || current;
    chrome.storage.local.set({ [VIEW_STORAGE_KEY]: next }, () => resolve(next));
  });
});

function UIStateManager() {
  this.prefix = 'anki_ui_tab_'; // anki_ui_tab_<tabId>
}
UIStateManager.prototype.key = function (tabId) {
  return this.prefix + String(tabId);
};
UIStateManager.prototype.get = function (tabId) {
  const k = this.key(tabId);
  return new Promise((resolve) => {
    chrome.storage.local.get([k, VIEW_STORAGE_KEY], (res) => {
      const stored = res[k];
      if (stored) {
        resolve(stored);
        return;
      }

      const viewPrefs = res[VIEW_STORAGE_KEY] || {};
      const globalMode = viewPrefs.globalMode === 'float' ? 'floating' : 'sidebar';
      const globalVisible = typeof viewPrefs.globalVisible === 'boolean' ? viewPrefs.globalVisible : true;
      const def = {
        sidebarVisible: globalMode === 'sidebar' && globalVisible,
        floatingVisible: globalMode === 'floating' && globalVisible,
        preferredMode: globalMode,
      };
      resolve(def);
    });
  });
};
UIStateManager.prototype.set = function (tabId, patch) {
  const k = this.key(tabId);
  return new Promise((resolve) => {
    chrome.storage.local.get([k], (res) => {
      const current = res[k] || {
        sidebarVisible: false,
        floatingVisible: false,
        preferredMode: 'sidebar',
      };
      const next = { ...current, ...patch };
      chrome.storage.local.set({ [k]: next }, () => resolve(next));
    });
  });
};

const uiState = new UIStateManager();

// ---------- Применить состояние сайдбара к DOM ----------
const clearHiddenStyles = () => {
  newDiv.removeAttribute('hidden');
  newDiv.style.removeProperty('display');
  newDiv.style.removeProperty('visibility');
  newDiv.style.removeProperty('opacity');
};
const showSidebar = () => {
  clearHiddenStyles();
  newDiv.style.transform = 'translateX(0)';
  document.body.style.marginRight = '350px';
};
const hideSidebar = () => {
  newDiv.style.transform = 'translateX(100%)';
  document.body.style.marginRight = '0';
};
const applySidebarVisible = (visible) => {
  if (visible) showSidebar(); else hideSidebar();
};

// ---------- Рендер React-приложения ----------
const StoreInitializer = () => {
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tabId, setTabId] = useState(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        chrome.runtime.sendMessage({ action: 'getTabId' }, async (response) => {
          const currentTabId = (response && typeof response.tabId !== 'undefined') ? response.tabId : Math.floor(Math.random() * 1000000);
          setTabId(currentTabId);

          try {
            const state = await uiState.get(currentTabId);
            applySidebarVisible(state.sidebarVisible);
          } catch (error) {
            console.error('Error reading initial UI state:', error);
            applySidebarVisible(false);
          }
        });

        const resolvedStore = await instantiateStore();
        setStore(resolvedStore);
        setTimeout(() => setIsLoading(false), 100);
      } catch (error) {
        console.error('Error initializing store:', error);
        setIsLoading(false);
      }
    };
    initialize();
  }, []);

  if (isLoading || !store || tabId === null) {
    return React.createElement(LoadingSpinner);
  }

  return React.createElement(
    Provider,
    { store },
    React.createElement(App, { tabId })
  );
};

root.render(React.createElement(StoreInitializer));

// ---------- Сообщения от background / App ----------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  // Тумблер sidebar (и фиксация состояния)
  if (message.action === 'toggleSidebar') {
    const currentTabId = message.tabId;
    if (!currentTabId) {
      sendResponse && sendResponse({ status: 'error', message: 'Unknown tab ID' });
      return true;
    }
    uiState.get(currentTabId).then((st) => {
      const nextVisible = !st.sidebarVisible;
      applySidebarVisible(nextVisible);
      uiState.set(currentTabId, { sidebarVisible: nextVisible }).then(() => {
        updateViewPrefs((prefs) => {
          prefs.visibleByTab[currentTabId] = nextVisible;
          if (nextVisible) {
            prefs.preferredModeByTab[currentTabId] = 'sidebar';
            prefs.globalMode = 'sidebar';
          }
          prefs.globalVisible = nextVisible;
          return prefs;
        }).finally(() => {
          sendResponse && sendResponse({ status: 'Sidebar toggled', visible: nextVisible, tabId: currentTabId });
        });
      });
    });
    return true;
  }

  if (message.action === 'collapseSidebar' || message.action === 'forceHideSidebar') {
    const currentTabId = message.tabId;
    if (currentTabId) {
      uiState.set(currentTabId, { sidebarVisible: false });
      updateViewPrefs((prefs) => {
        prefs.visibleByTab[currentTabId] = false;
        prefs.globalVisible = false;
        return prefs;
      });
    }
    hideSidebar();
    sendResponse && sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'expandSidebar' || message.action === 'forceShowSidebar') {
    const currentTabId = message.tabId;
    if (currentTabId) {
      uiState.set(currentTabId, { sidebarVisible: true });
      updateViewPrefs((prefs) => {
        prefs.visibleByTab[currentTabId] = true;
        prefs.preferredModeByTab[currentTabId] = 'sidebar';
        prefs.globalVisible = true;
        prefs.globalMode = 'sidebar';
        return prefs;
      });
    }
    showSidebar();
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  // Запомнить предпочитаемый режим (floating | sidebar)
  if (message.action === 'setPreferredMode') {
    const currentTabId = message.tabId;
    const mode = message.mode === 'floating' ? 'floating' : 'sidebar';
    if (currentTabId) uiState.set(currentTabId, { preferredMode: mode });
    updateViewPrefs((prefs) => {
      if (currentTabId) {
        prefs.preferredModeByTab[currentTabId] = mode === 'floating' ? 'float' : 'sidebar';
      }
      prefs.globalMode = mode === 'floating' ? 'float' : 'sidebar';
      return prefs;
    }).finally(() => {
      sendResponse && sendResponse({ ok: true, preferredMode: mode });
    });
    return true;
  }

  // Синхронизация видимости плавающего окна
  if (message.action === 'syncFloatingState') {
    const currentTabId = message.tabId;
    const visible = !!message.floatingVisible;
    if (currentTabId) uiState.set(currentTabId, { floatingVisible: visible });
    if (currentTabId) {
      updateViewPrefs((prefs) => {
        prefs.visibleByTab[currentTabId] = visible;
        if (visible) {
          prefs.preferredModeByTab[currentTabId] = 'float';
          prefs.globalMode = 'float';
        }
        prefs.globalVisible = visible;
        return prefs;
      });
    }
    sendResponse && sendResponse({ ok: true });
    return true;
  }

  // Клик по иконке расширения: открыть/закрыть ПРЕДПОЧТИТЕЛЬНЫЙ режим
  if (message.action === 'togglePreferredUI') {
    const currentTabId = message.tabId;
    if (!currentTabId) {
      sendResponse && sendResponse({ status: 'error', message: 'Unknown tab ID' });
      return true;
    }

    uiState.get(currentTabId).then((st) => {
      const preferred = st.preferredMode || 'sidebar';
      if (preferred === 'floating') {
        // Если float открыт — закрыть. Если закрыт — открыть. Сайдбар при этом прячем.
        if (st.floatingVisible) {
          chrome.runtime.sendMessage({ action: 'hideFloating', tabId: currentTabId }, () => {});
          uiState.set(currentTabId, { floatingVisible: false, sidebarVisible: false }).then(() => {
            updateViewPrefs((prefs) => {
              prefs.visibleByTab[currentTabId] = false;
              prefs.globalVisible = false;
              return prefs;
            }).finally(() => {
              applySidebarVisible(false);
              sendResponse && sendResponse({ ok: true, toggled: 'floating:off' });
            });
          });
        } else {
          chrome.runtime.sendMessage({ action: 'showFloating', tabId: currentTabId }, () => {});
          uiState.set(currentTabId, { floatingVisible: true, sidebarVisible: false }).then(() => {
            updateViewPrefs((prefs) => {
              prefs.visibleByTab[currentTabId] = true;
              prefs.preferredModeByTab[currentTabId] = 'float';
              prefs.globalVisible = true;
              prefs.globalMode = 'float';
              return prefs;
            }).finally(() => {
              applySidebarVisible(false);
              sendResponse && sendResponse({ ok: true, toggled: 'floating:on' });
            });
          });
        }
      } else {
        // preferred === 'sidebar' — обычный toggle сайдбара
        const nextVisible = !st.sidebarVisible;
        applySidebarVisible(nextVisible);
        uiState.set(currentTabId, { sidebarVisible: nextVisible, floatingVisible: false }).then(() => {
          updateViewPrefs((prefs) => {
            prefs.visibleByTab[currentTabId] = nextVisible;
            if (nextVisible) {
              prefs.preferredModeByTab[currentTabId] = 'sidebar';
              prefs.globalMode = 'sidebar';
            }
            prefs.globalVisible = nextVisible;
            return prefs;
          }).finally(() => {
            if (nextVisible) {
              // на всякий — попросим App выключить float
              chrome.runtime.sendMessage({ action: 'hideFloating', tabId: currentTabId }, () => {});
            }
            sendResponse && sendResponse({ ok: true, toggled: `sidebar:${nextVisible ? 'on' : 'off'}` });
          });
        });
      }
    });
    return true;
  }

  // Может прилететь до монтирования React — просто отвечаем «ок»
  if (message.action === 'toggleFloating' || message.action === 'showFloating' || message.action === 'hideFloating') {
    sendResponse && sendResponse({ ok: true });
    return true;
  }
});
