import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import Popup from './Popup';
import './index.css';
import '../../assets/styles/tailwind.css';
import { instantiateStore } from '../../store';
import { Provider } from 'react-redux';
import Settings from '../../components/Settings';


chrome.tabs.query({currentWindow: true, active: true}, function (tabs){
    var activeTab = tabs[0];
    chrome.tabs.sendMessage(activeTab.id, {"message": "popup"});
});
const container = document.getElementById('app-container');
const root = createRoot(container); // createRoot(container!) if you use TypeScript


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
        <Settings onBackClick={() => null} popup={true} />
      </Provider>
    );
  };
  

const popup = React.createElement(StoreInitializer, {});
root.render(popup);
