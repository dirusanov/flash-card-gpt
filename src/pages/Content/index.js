import { printLine } from './modules/print';
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../App';
import { Provider } from 'react-redux';
import { instantiateStore } from '../../store';

import './content.styles.css';

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

// Компонент инициализации хранилища
const StoreInitializer = () => {
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    instantiateStore()
      // @ts-ignore
      .then(resolvedStore => {
        setStore(resolvedStore);
        // Уменьшенная задержка для более быстрого запуска
        setTimeout(() => setIsLoading(false), 100);
      })
      .catch(error => {
        console.error('Error loading state from Chrome storage:', error);
        setIsLoading(false);
      });
  }, []);

  if (isLoading || !store) {
    return React.createElement(LoadingSpinner);
  }

  return (
    <Provider store={store}>
      <App />
    </Provider>
  );
};

// Рендерим React-приложение
const popup = React.createElement(StoreInitializer, {});
root.render(popup);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleSidebar') {
    chrome.storage.local.get(['isSidebarVisible'], (result) => {
      let isVisible = !result.isSidebarVisible;
      chrome.storage.local.set({ isSidebarVisible: isVisible }, () => {
        if (isVisible) {
          newDiv.style.transform = 'translateX(0)'; // Показать боковую панель
          document.body.style.marginRight = '350px'; // Сдвинуть содержимое страницы влево
        } else {
          newDiv.style.transform = 'translateX(100%)'; // Скрыть боковую панель
          document.body.style.marginRight = '0'; // Вернуть содержимое страницы на место
        }
        sendResponse({ status: 'Sidebar toggled', visible: isVisible });
        console.log('Sidebar toggled:', isVisible);
      });
    });
    return true; // Оставляем канал сообщения открытым для sendResponse
  }
});

// Восстановление состояния при загрузке страницы
chrome.storage.local.get(['isSidebarVisible'], (result) => {
  if (result.isSidebarVisible) {
    newDiv.style.transform = 'translateX(0)'; // Показать боковую панель
    document.body.style.marginRight = '350px'; // Сдвинуть содержимое страницы влево
  } else {
    newDiv.style.transform = 'translateX(100%)'; // Скрыть боковую панель
    document.body.style.marginRight = '0'; // Вернуть содержимое страницы на место
  }
});

