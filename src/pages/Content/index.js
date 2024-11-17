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
  background-color: #282c34;
  box-shadow: -2px 0 5px rgba(0, 0, 0, 0.5);
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

// Компонент инициализации хранилища
const StoreInitializer = () => {
  const [store, setStore] = useState(null);

  useEffect(() => {
    instantiateStore()
      // @ts-ignore
      .then(resolvedStore => setStore(resolvedStore))
      .catch(error => console.error('Error loading state from Chrome storage:', error));
  }, []);

  if (!store) {
    // Возвращаем некий компонент "загрузка" или null, пока хранилище не инициализировано
    return null;
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

