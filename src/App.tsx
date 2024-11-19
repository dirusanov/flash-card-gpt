import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import { setCurrentPage } from "./store/actions/page";
import CreateCard from './components/CreateCard';
import Settings from "./components/Settings";
import { instantiateStore } from './store';
import { ExtendedStore } from 'reduxed-chrome-storage';
import { fetchDecksSuccess } from './store/actions/decks';
import { fetchDecks } from './services/ankiService';
import { setAnkiAvailability } from './store/actions/anki';
import { toggleSidebar } from './store/actions/sidebar'
import useErrorNotification from './components/useErrorHandler';

function App() {
  const [store, setStore] = useState<ExtendedStore | null>(null);
  const isAnkiAvailable = useSelector((state: RootState) => state.anki.isAnkiAvailable)
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Добавляем флаг первоначальной загрузки
  const currentPage = useSelector((state: RootState) => state.currentPage);
  const dispatch = useDispatch();
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
  const { showError, renderErrorNotification } = useErrorNotification()

  useEffect(() => {
    const initializeStoreAndCheckAnki = async () => {
      try {
        const resolvedStore = await instantiateStore();
        setStore(resolvedStore);
        try {
          const decks = await fetchDecks(ankiConnectApiKey);

          if (decks.error) {
            console.error('Anki returned an error:', decks.error);
            showError('Anki is unavailable. Please check your Anki settings.');
            dispatch(setAnkiAvailability(false));
            if (isInitialLoad) {
              dispatch(setCurrentPage('settings'))
            }
          } else {
            dispatch(fetchDecksSuccess(decks.result));
            dispatch(setAnkiAvailability(true));
            console.log('Anki is available', currentPage);
          }
        } catch (error) {
          console.error('Anki is unavailable:', error);
          showError('Anki is unavailable. Please check your Anki settings.');
          dispatch(setAnkiAvailability(false));
          if (isInitialLoad) {
            dispatch(setCurrentPage('settings'))
          }
        } finally {
          setIsInitialLoad(false)
        }
      } catch (error) {
        console.error('Error loading state from Chrome storage:', error);
      }
    };

    initializeStoreAndCheckAnki();
  }, [dispatch, ankiConnectApiKey, isInitialLoad])

  if (!store) {
    return null; // Можно заменить на компонент загрузки
  }

  const handlePageChange = (page: string) => {
    dispatch(setCurrentPage(page));
  };

  return (
    <div className="App" style={{
      backgroundColor: 'white',
      height: '100%',
      display: 'flex',
      flexDirection: 'row',
      position: 'absolute',
      right: 0,
      top: 0,
      width: '350px',
      overflow: 'hidden'
    }}>
      <div style={{ flex: '1 1 auto', maxWidth: '350px', overflow: 'hidden', position: 'relative' }}>
        <button
          onClick={() => {
            dispatch(toggleSidebar());
            chrome.runtime.sendMessage({ action: 'toggleSidebar' }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Error sending message:', chrome.runtime.lastError.message);
              } else {
                console.log('Extension closed:', response);
              }
            });
          }}
          style={{
            position: 'absolute',
            top: '0px',
            right: '30px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '26px',
            fontWeight: 'bold',
            padding: '5px',
            zIndex: 1000
          }}
          title="Close"
        >
          &times;
        </button>
        <header className="App-header">
          {isInitialLoad && !isAnkiAvailable ? (
            <Settings onBackClick={() => handlePageChange('createCard')} popup={false} />
          ) : (
            currentPage === 'settings' ? (
              <Settings onBackClick={() => handlePageChange('createCard')} popup={false} />
            ) : (
              <div style={{ width: '100%', overflow: 'auto' }}>
                <CreateCard onSettingsClick={() => handlePageChange('settings')} />
              </div>
            )
          )}
          <div className="absolute top-2 left-0 right-0 w-full z-60">
            {renderErrorNotification()}
          </div>
        </header>
      </div>
    </div>
  );
}

export default App;
