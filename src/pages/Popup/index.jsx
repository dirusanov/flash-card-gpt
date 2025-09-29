import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import Popup from './Popup';
import './index.css';
import { instantiateStore } from '../../store';

const container = document.getElementById('app-container');
const root = createRoot(container);

const StoreInitializer = () => {
  const [store, setStore] = useState(null);

  useEffect(() => {
    instantiateStore()
      .then((resolvedStore) => setStore(resolvedStore))
      .catch((error) => console.error('Error loading state from Chrome storage:', error));
  }, []);

  if (!store) {
    return (
      <div className="popup-loading">
        Loading…
      </div>
    );
  }

  return (
    <Provider store={store}>
      <Popup />
    </Provider>
  );
};

root.render(<StoreInitializer />);
