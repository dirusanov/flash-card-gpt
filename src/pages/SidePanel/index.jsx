import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import App from '../../App';
// These used to be <link>ed into the in-page shadow root. The panel is a plain extension page,
// so they have to be bundled — tailwind first, because its preflight sets box-sizing on
// everything and the layout of the forms depends on it.
import '../../assets/styles/tailwind.css';
import '../../assets/styles/grammarStyles.css';
import '../../assets/styles/richMarkdownStyles.css';
import '../../assets/styles/prism-theme.css';
import '../../assets/styles/transcriptionStyles.css';
import './index.css';
import { instantiateStore } from '../../store';
import { initializeApiKeyPersistence } from '../../services/apiKeyStorage';
import { initializeAuthPersistence } from '../../services/authPersistence';
import { initializeSettingsPersistence } from '../../services/settingsPersistence';
import { initializeDeckSelectionPersistence } from '../../services/deckSelectionPersistence';
import { setCurrentTabId } from '../../store/actions/tabState';
import { getActiveTabId } from '../../services/pageContextBridge';

const container = document.getElementById('app-container');
const root = createRoot(container);

const StoreInitializer = () => {
  const [store, setStore] = useState(null);
  const [tabId, setTabId] = useState(null);
  const unsubscribersRef = useRef([]);

  useEffect(() => {
    let isMounted = true;

    const register = (unsubscribe) => {
      if (typeof unsubscribe !== 'function') return;
      if (isMounted) {
        unsubscribersRef.current.push(unsubscribe);
      } else {
        unsubscribe();
      }
    };

    const initialize = async () => {
      const activeTabId = await getActiveTabId();
      const resolvedStore = await instantiateStore();

      // Tab-scoped state has to exist before the first render, or the app falls back to the
      // global scope and shows another tab's draft.
      if (activeTabId != null) {
        resolvedStore.dispatch(setCurrentTabId(activeTabId));
      }

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

      if (!isMounted) return;
      setTabId(activeTabId);
      setStore(resolvedStore);
    };

    initialize().catch((error) => console.error('Failed to start side panel:', error));

    return () => {
      isMounted = false;
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current = [];
    };
  }, []);

  // The panel outlives tab switches, so it has to re-target rather than assume the tab it
  // opened on. Each tab keeps its own draft, which is what the user expects when switching back.
  useEffect(() => {
    if (!store) return undefined;

    const retarget = (nextTabId) => {
      if (nextTabId == null) return;
      setTabId((current) => (current === nextTabId ? current : nextTabId));
      store.dispatch(setCurrentTabId(nextTabId));
    };

    const onActivated = ({ tabId: nextTabId }) => retarget(nextTabId);
    const onUpdated = (updatedTabId, changeInfo, tab) => {
      if (tab?.active && changeInfo.status === 'complete') {
        retarget(updatedTabId);
      }
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [store]);

  if (!store || tabId === null) {
    return <div className="sidepanel-loading">Loading…</div>;
  }

  return (
    <Provider store={store}>
      <App tabId={tabId} />
    </Provider>
  );
};

root.render(<StoreInitializer />);
