import { printLine } from './modules/print';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import { Provider } from 'react-redux';
import { instantiateStore } from '../../store';

console.log('Content script works!');
console.log('Must reload extension for modifications to take effect.');

printLine("Using the 'printLine' function from the Print Module");

// Создаем контейнер для боковой панели
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
  z-index: 9999;
  background-color: #ffffff;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.15);
  transform: translateX(100%); /* по умолчанию скрыто */
  transition: transform 0.3s ease-in-out;
`);

// Создаем Shadow DOM и добавляем стили
const shadow = newDiv.attachShadow({ mode: "open" });
const linkElem = document.createElement("link");
linkElem.setAttribute("rel", "stylesheet");
const linkUrl = chrome.runtime.getURL("tailwind.css");
linkElem.setAttribute("href", linkUrl);
shadow.appendChild(linkElem);

document.body.appendChild(newDiv);

const root = createRoot(shadow);

// Компонент красивого лоадера
const LoadingSpinner = () => {
  return React.createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#ffffff'
    }
  }, [
    // Логотип/иконка
    React.createElement('div', {
      key: 'logo',
      style: {
        width: '48px',
        height: '48px',
        background: 'rgba(255,255,255,0.2)',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
        animation: 'pulse 2s ease-in-out infinite'
      }
    }, '🧠'),
    // Анимированный спиннер
    React.createElement('div', {
      key: 'spinner',
      style: {
        width: '32px',
        height: '32px',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTop: '2px solid #ffffff',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '20px'
      }
    }),
    // Заголовок
    React.createElement('h2', {
      key: 'title',
      style: {
        color: '#ffffff',
        fontSize: '20px',
        fontWeight: '700',
        marginBottom: '8px',
        textAlign: 'center',
        letterSpacing: '-0.025em'
      }
    }, 'Anki Flash Cards'),
    // Подзаголовок
    React.createElement('p', {
      key: 'subtitle',
      style: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: '14px',
        textAlign: 'center',
        fontWeight: '400'
      }
    }, 'Initializing your learning assistant...'),
    // Прогресс бар
    React.createElement('div', {
      key: 'progress-bar',
      style: {
        width: '200px',
        height: '2px',
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: '1px',
        marginTop: '24px',
        overflow: 'hidden'
      }
    }, React.createElement('div', {
      style: {
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        animation: 'progressBar 2s ease-in-out infinite'
      }
    })),
    // CSS анимации
    React.createElement('style', {
      key: 'styles'
    }, `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.05); opacity: 0.8; }
      }
      @keyframes progressBar {
        0% { transform: translateX(-100%); }
        50% { transform: translateX(0%); }
        100% { transform: translateX(100%); }
      }
    `)
  ]);
};

// Система управления наследованием состояния сайдбара
class SidebarStateManager {
  constructor() {
    this.storageKeys = {
      globalState: 'sidebar_global_state',
      tabPrefix: 'sidebar_tab_'
    };
  }

  // Получить ключ для состояния конкретной вкладки
  getTabKey(tabId) {
    return `${this.storageKeys.tabPrefix}${tabId}`;
  }

  // Получить настройки наследования - всегда используем lastActive режим
  async getInheritanceSettings() {
    return {
      enabled: true,
      mode: 'lastActive'
    };
  }

  // Получить глобальное состояние
  async getGlobalState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([this.storageKeys.globalState], (result) => {
        const defaultGlobal = {
          isVisible: false,
          lastActiveTabId: null,
          lastToggleTime: Date.now()
        };
        resolve(result[this.storageKeys.globalState] || defaultGlobal);
      });
    });
  }

  // Получить состояние конкретной вкладки
  async getTabState(tabId) {
    const tabKey = this.getTabKey(tabId);
    return new Promise((resolve) => {
      chrome.storage.local.get([tabKey], (result) => {
        resolve(result[tabKey] || null);
      });
    });
  }

  // Сохранить глобальное состояние
  async saveGlobalState(globalState) {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        [this.storageKeys.globalState]: globalState
      }, resolve);
    });
  }

  // Сохранить состояние вкладки
  async saveTabState(tabId, tabState) {
    const tabKey = this.getTabKey(tabId);
    return new Promise((resolve) => {
      chrome.storage.local.set({
        [tabKey]: tabState
      }, resolve);
    });
  }

  // Определить начальное состояние для новой вкладки - всегда наследуем от последней активной
  async determineInitialState(tabId) {
    const globalState = await this.getGlobalState();
    
    // Наследуем от последней активной вкладки
    if (globalState.lastActiveTabId) {
      const lastActiveState = await this.getTabState(globalState.lastActiveTabId);
      if (lastActiveState) {
        return {
          isVisible: lastActiveState.isVisible,
          source: 'lastActive',
          inheritedFrom: globalState.lastActiveTabId
        };
      }
    }
    
    // Фолбэк на глобальное состояние
    return {
      isVisible: globalState.isVisible,
      source: 'global_fallback',
      inheritedFrom: null
    };
  }

  // Переключить состояние сайдбара для вкладки
  async toggleSidebar(tabId) {
    const existingTabState = await this.getTabState(tabId);
    const globalState = await this.getGlobalState();
    
    let currentVisibility;
    if (existingTabState) {
      currentVisibility = existingTabState.isVisible;
    } else {
      // Для новой вкладки определяем начальное состояние
      const initialState = await this.determineInitialState(tabId);
      currentVisibility = initialState.isVisible;
    }

    const newVisibility = !currentVisibility;
    const currentTime = Date.now();

    // Обновляем состояние вкладки
    const newTabState = {
      isVisible: newVisibility,
      lastToggleTime: currentTime,
      ...(existingTabState?.inheritedFrom && { inheritedFrom: existingTabState.inheritedFrom })
    };

    // Обновляем глобальное состояние
    const newGlobalState = {
      ...globalState,
      isVisible: newVisibility,
      lastActiveTabId: tabId,
      lastToggleTime: currentTime
    };

    // Сохраняем изменения
    await Promise.all([
      this.saveTabState(tabId, newTabState),
      this.saveGlobalState(newGlobalState)
    ]);

    return { isVisible: newVisibility, wasInherited: !!existingTabState?.inheritedFrom };
  }

  // Получить текущее состояние для вкладки
  async getCurrentState(tabId) {
    const existingTabState = await this.getTabState(tabId);
    
    if (existingTabState) {
      return { 
        isVisible: existingTabState.isVisible, 
        source: 'existing',
        inheritedFrom: existingTabState.inheritedFrom
      };
    }

    // Для новой вкладки определяем состояние через наследование
    return await this.determineInitialState(tabId);
  }
}

// Создаем глобальный экземпляр менеджера состояния
const sidebarManager = new SidebarStateManager();

// Функция для применения состояния к DOM
const applySidebarState = (isVisible, tabId, source = 'unknown') => {
  if (isVisible) {
    newDiv.style.transform = 'translateX(0)';
    document.body.style.marginRight = '350px';
  } else {
    newDiv.style.transform = 'translateX(100%)';
    document.body.style.marginRight = '0';
  }
  
  console.log(`Sidebar state applied for tab ${tabId}: ${isVisible ? 'visible' : 'hidden'} (source: ${source})`);
};

// Компонент инициализации хранилища
const StoreInitializer = () => {
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tabId, setTabId] = useState(null);

  useEffect(() => {
    const initializeStoreWithTabId = async () => {
      try {
        // Получаем tab ID от background script
        chrome.runtime.sendMessage({ action: 'getTabId' }, async (response) => {
          const currentTabId = response?.tabId || Math.floor(Math.random() * 1000000);
          setTabId(currentTabId);
          console.log('Content script initialized with tab ID:', currentTabId);

          // Определяем начальное состояние сайдбара для этой вкладки
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

        // Инициализируем store
        const resolvedStore = await instantiateStore();
        setStore(resolvedStore);
        
        // Уменьшенная задержка для более быстрого запуска
        setTimeout(() => setIsLoading(false), 100);
      } catch (error) {
        console.error('Error loading state from Chrome storage:', error);
        setIsLoading(false);
      }
    };

    initializeStoreWithTabId();
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

// Рендерим React-приложение
const popup = React.createElement(StoreInitializer, {});
root.render(popup);

// Обработчик сообщений с новой логикой наследования
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleSidebar') {
    const currentTabId = message.tabId || 'unknown';
    
    if (currentTabId === 'unknown') {
      console.error('Cannot toggle sidebar: unknown tab ID');
      sendResponse({ 
        status: 'error', 
        message: 'Unknown tab ID' 
      });
      return true;
    }

    // Используем новый менеджер состояния
    sidebarManager.toggleSidebar(currentTabId)
      .then((result) => {
        applySidebarState(result.isVisible, currentTabId, 'toggle');
        
        sendResponse({ 
          status: 'Sidebar toggled', 
          visible: result.isVisible, 
          tabId: currentTabId,
          wasInherited: result.wasInherited
        });
        
        console.log(`Sidebar toggled for tab ${currentTabId}: ${result.isVisible ? 'visible' : 'hidden'}${result.wasInherited ? ' (was inherited)' : ''}`);
      })
      .catch((error) => {
        console.error('Error toggling sidebar:', error);
        sendResponse({ 
          status: 'error', 
          message: error.toString() 
        });
      });

    return true; // Оставляем канал сообщения открытым для sendResponse
  }
});

// Восстановление состояния при загрузке страницы уже обработано в StoreInitializer
