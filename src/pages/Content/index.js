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
  z-index: 2147483645; /* ниже плавающего окна (которое у App ~2147483646) */
  background-color: #ffffff;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.15);
  transform: translateX(100%); /* по умолчанию скрыто */
  transition: transform 0.3s ease-in-out;
`);

const shadow = newDiv.attachShadow({ mode: "open" });

const linkElem = document.createElement("link");
linkElem.setAttribute("rel", "stylesheet");
linkElem.setAttribute("href", chrome.runtime.getURL("tailwind.css"));
shadow.appendChild(linkElem);

document.body.appendChild(newDiv);

const root = createRoot(shadow);

// ---------- Красивый лоадер ----------
const LoadingSpinner = () => {
  return React.createElement('div', {
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
    React.createElement('h2', {
      key: 'title',
      style: { color: '#ffffff', fontSize: '20px', fontWeight: 700, marginBottom: '8px', textAlign: 'center', letterSpacing: '-0.025em' }
    }, 'Anki Flash Cards'),
    React.createElement('p', {
      key: 'subtitle',
      style: { color: 'rgba(255,255,255,0.8)', fontSize: '14px', textAlign: 'center', fontWeight: 400 }
    }, 'Initializing your learning assistant...'),
    React.createElement('div', {
      key: 'progress-bar',
      style: { width: '200px', height: '2px', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: '1px', marginTop: '24px', overflow: 'hidden' }
    }, React.createElement('div', { style: { width: '100%', height: '100%', backgroundColor: '#ffffff', animation: 'progressBar 2s ease-in-out infinite' } })),
    React.createElement('style', { key: 'styles' }, `
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.8; } }
      @keyframes progressBar { 0% { transform: translateX(-100%); } 50% { transform: translateX(0%); } 100% { transform: translateX(100%); } }
    `)
  ]);
};

// ---------- Управление состоянием сайдбара (chrome.storage) ----------
class SidebarStateManager {
  constructor() {
    this.storageKeys = {
      globalState: 'sidebar_global_state',
      tabPrefix: 'sidebar_tab_'
    };
  }
  getTabKey(tabId) { return `${this.storageKeys.tabPrefix}${tabId}`; }
  async getGlobalState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKeys.globalState], (result) => {
        const def = { isVisible: false, lastActiveTabId: null, lastToggleTime: Date.now() };
        resolve(result[this.storageKeys.globalState] || def);
      });
    });
  }
  async getTabState(tabId) {
    const tabKey = this.getTabKey(tabId);
    return new Promise((resolve) => {
      chrome.storage.local.get([tabKey], (result) => resolve(result[tabKey] || null));
    });
  }
  async saveGlobalState(globalState) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [this.storageKeys.globalState]: globalState }, resolve);
    });
  }
  async saveTabState(tabId, tabState) {
    const tabKey = this.getTabKey(tabId);
    return new Promise((resolve) => {
      chrome.storage.local.set({ [tabKey]: tabState }, resolve);
    });
  }
  async determineInitialState(tabId) {
    const globalState = await this.getGlobalState();
    if (globalState.lastActiveTabId) {
      const last = await this.getTabState(globalState.lastActiveTabId);
      if (last) {
        return { isVisible: last.isVisible, source: 'lastActive', inheritedFrom: globalState.lastActiveTabId };
      }
    }
    return { isVisible: globalState.isVisible, source: 'global_fallback', inheritedFrom: null };
  }
  async toggleSidebar(tabId) {
    const existingTabState = await this.getTabState(tabId);
    const globalState = await this.getGlobalState();

    let currentVisibility;
    if (existingTabState) {
      currentVisibility = existingTabState.isVisible;
    } else {
      const initialState = await this.determineInitialState(tabId);
      currentVisibility = initialState.isVisible;
    }

    const newVisibility = !currentVisibility;
    const now = Date.now();

    const newTabState = { isVisible: newVisibility, lastToggleTime: now, ...(existingTabState?.inheritedFrom && { inheritedFrom: existingTabState.inheritedFrom }) };
    const newGlobalState = { ...globalState, isVisible: newVisibility, lastActiveTabId: tabId, lastToggleTime: now };

    await Promise.all([ this.saveTabState(tabId, newTabState), this.saveGlobalState(newGlobalState) ]);
    return { isVisible: newVisibility, wasInherited: !!existingTabState?.inheritedFrom };
  }
  async getCurrentState(tabId) {
    const existingTabState = await this.getTabState(tabId);
    if (existingTabState) return { isVisible: existingTabState.isVisible, source: 'existing', inheritedFrom: existingTabState.inheritedFrom };
    return await this.determineInitialState(tabId);
  }
}
const sidebarManager = new SidebarStateManager();

// ---------- Применить состояние к DOM ----------
const applySidebarState = (isVisible, tabId, source = 'unknown') => {
  if (isVisible) {
    // показать
    newDiv.style.transform = 'translateX(0)';
    newDiv.style.display = ''; // на всякий
    document.body.style.marginRight = '350px';
  } else {
    // скрыть
    newDiv.style.transform = 'translateX(100%)';
    document.body.style.marginRight = '0';
  }
  console.log(`Sidebar state applied for tab ${tabId}: ${isVisible ? 'visible' : 'hidden'} (source: ${source})`);
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
          const currentTabId = response?.tabId || Math.floor(Math.random() * 1000000);
          setTabId(currentTabId);

          try {
            const stateInfo = await sidebarManager.getCurrentState(currentTabId);
            applySidebarState(stateInfo.isVisible, currentTabId, stateInfo.source);
            if (stateInfo.inheritedFrom) {
              console.log(`Sidebar state inherited from tab ${stateInfo.inheritedFrom}`);
            }
          } catch (error) {
            console.error('Error determining initial sidebar state:', error);
            applySidebarState(false, currentTabId, 'error_fallback');
          }
        });

        const resolvedStore = await instantiateStore();
        setStore(resolvedStore);
        setTimeout(() => setIsLoading(false), 100);
      } catch (error) {
        console.error('Error loading state from Chrome storage:', error);
        setIsLoading(false);
      }
    };
    initialize();
  }, []);

  if (isLoading || !store || tabId === null) {
    return React.createElement(LoadingSpinner);
  }

  return (
    <Provider store={store}>
      <App tabId={tabId} />
    </Provider>
  );
};

root.render(React.createElement(StoreInitializer));

// ---------- Сообщения от background / App ----------
const hardShowSidebarHost = () => {
  // «жёстко» раскрыть контейнер
  newDiv.removeAttribute('hidden');
  newDiv.style.removeProperty('display');
  newDiv.style.removeProperty('visibility');
  newDiv.style.removeProperty('opacity');
  newDiv.style.removeProperty('transform');
};

const showSidebar = () => {
  hardShowSidebarHost();
  newDiv.style.transform = 'translateX(0)';
  document.body.style.marginRight = '350px';
};

const hideSidebar = () => {
  newDiv.style.transform = 'translateX(100%)';
  document.body.style.marginRight = '0';
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return;

  // Тумблер (кнопка в тулбаре/фон)
  if (message.action === 'toggleSidebar') {
    const currentTabId = message.tabId || 'unknown';
    if (currentTabId === 'unknown') {
      sendResponse?.({ status: 'error', message: 'Unknown tab ID' });
      return true;
    }
    sidebarManager.toggleSidebar(currentTabId)
      .then((result) => {
        applySidebarState(result.isVisible, currentTabId, 'toggle');
        sendResponse?.({ status: 'Sidebar toggled', visible: result.isVisible, tabId: currentTabId, wasInherited: result.wasInherited });
      })
      .catch((error) => {
        console.error('Error toggling sidebar:', error);
        sendResponse?.({ status: 'error', message: String(error) });
      });
    return true;
  }

  // ВКЛ/ВЫКЛ из App: вернуть сайдбар после плавающего окна
  if (message.action === 'expandSidebar') {
    showSidebar();
    sendResponse?.({ ok: true });
    return true;
  }
  if (message.action === 'collapseSidebar') {
    hideSidebar();
    sendResponse?.({ ok: true });
    return true;
  }

  // Может прилететь до монтирования React — просто гарантируем наличие контейнера
  if (message.action === 'toggleFloating') {
    // ничего особо не делаем — App сам обработает
    sendResponse?.({ ok: true });
    return true;
  }
});
