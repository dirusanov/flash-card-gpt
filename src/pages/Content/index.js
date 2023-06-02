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

const newDiv = document.createElement('div');
newDiv.setAttribute('style', 'all: initial; position: fixed; top: 0; right: 0; width: 350px; height: 100%; overflow: auto; z-index: 9999;');
const shadow = newDiv.attachShadow({ mode: "open" });
const linkElem = document.createElement("link");
linkElem.setAttribute("rel", "stylesheet");
const linkUrl = chrome.runtime.getURL("tailwind.css");
linkElem.setAttribute("href", linkUrl);
shadow.appendChild(linkElem);

document.body.appendChild(newDiv);

const root = createRoot(shadow);

const StoreInitializer = () => {
    const [store, setStore] = useState(null);
  
    useEffect(() => {
      instantiateStore()
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
  
const popup = React.createElement(StoreInitializer, {});
root.render(popup);
