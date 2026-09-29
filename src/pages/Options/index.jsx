import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import Options from './Options';
// Settings relies on Tailwind's preflight for box-sizing on its inputs.
import '../../assets/styles/tailwind.css';
import './index.css';
import { instantiateStore } from '../../store';
import { initializeApiKeyPersistence } from '../../services/apiKeyStorage';
import { initializeAuthPersistence } from '../../services/authPersistence';
import { initializeSettingsPersistence } from '../../services/settingsPersistence';
import { initializeDeckSelectionPersistence } from '../../services/deckSelectionPersistence';

const container = document.getElementById('app-container');
const root = createRoot(container);

const StoreInitializer = () => {
  const [store, setStore] = useState(null);
  const unsubscribersRef = useRef([]);

  useEffect(() => {
    let isMounted = true;

    const register = (unsubscribe) => {
      if (typeof unsubscribe !== 'function') {
        return;
      }
      if (isMounted) {
        unsubscribersRef.current.push(unsubscribe);
      } else {
        unsubscribe();
      }
    };

    const initialize = async () => {
      const resolvedStore = await instantiateStore();

      // Each persistence layer is independent; one failing must not stop the page from opening,
      // since this is where a user goes to fix a broken configuration.
      const initializers = [
        initializeSettingsPersistence,
        initializeApiKeyPersistence,
        initializeDeckSelectionPersistence,
        initializeAuthPersistence,
      ];

      for (const initializePersistence of initializers) {
        try {
          register(await initializePersistence(resolvedStore));
        } catch (error) {
          console.error(`Failed to initialize ${initializePersistence.name}:`, error);
        }
      }

      if (isMounted) {
        setStore(resolvedStore);
      }
    };

    initialize().catch((error) => console.error('Error loading state from Chrome storage:', error));

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current = [];
    };
  }, []);

  if (!store) {
    return <div className="options-loading">Loading…</div>;
  }

  return (
    <Provider store={store}>
      <Options />
    </Provider>
  );
};

root.render(<StoreInitializer />);
