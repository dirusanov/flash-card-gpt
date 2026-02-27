import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import Popup from './Popup';
import './index.css';
import { instantiateStore } from '../../store';
import { initializeApiKeyPersistence } from '../../services/apiKeyStorage';
import { initializeAuthPersistence } from '../../services/authPersistence';

const container = document.getElementById('app-container');
const root = createRoot(container);

const StoreInitializer = () => {
  const [store, setStore] = useState(null);
  const apiKeyUnsubscribeRef = useRef(null);
  const authUnsubscribeRef = useRef(null);

  useEffect(() => {
    let isMounted = true;

    instantiateStore()
      .then(async (resolvedStore) => {
        if (!isMounted) {
          return;
        }

        setStore(resolvedStore);

        try {
          const unsubscribe = await initializeApiKeyPersistence(resolvedStore);
          if (isMounted) {
            apiKeyUnsubscribeRef.current = unsubscribe;
          } else if (typeof unsubscribe === 'function') {
            unsubscribe();
          }
        } catch (error) {
          console.error('Failed to initialize API key persistence:', error);
        }

        try {
          const unsubscribeAuth = await initializeAuthPersistence(resolvedStore);
          if (isMounted) {
            authUnsubscribeRef.current = unsubscribeAuth;
          } else if (typeof unsubscribeAuth === 'function') {
            unsubscribeAuth();
          }
        } catch (error) {
          console.error('Failed to initialize auth persistence:', error);
        }
      })
      .catch((error) => console.error('Error loading state from Chrome storage:', error));

    return () => {
      isMounted = false;
      if (apiKeyUnsubscribeRef.current) {
        apiKeyUnsubscribeRef.current();
        apiKeyUnsubscribeRef.current = null;
      }
      if (authUnsubscribeRef.current) {
        authUnsubscribeRef.current();
        authUnsubscribeRef.current = null;
      }
    };
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
