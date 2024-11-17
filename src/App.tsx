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

function App() {
  const [store, setStore] = useState<ExtendedStore | null>(null);
  const isAnkiAvailable = useSelector((state: RootState) => state.anki.isAnkiAvailable)
  const [isInitialLoad, setIsInitialLoad] = useState(true); // Добавляем флаг первоначальной загрузки
  const currentPage = useSelector((state: RootState) => state.currentPage);
  const dispatch = useDispatch();
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);

  useEffect(() => {
    const initializeStoreAndCheckAnki = async () => {
      try {
        const resolvedStore = await instantiateStore();
        setStore(resolvedStore);
        try {
          const decks = await fetchDecks(ankiConnectApiKey);

          if (decks.error) {
            console.error('Anki returned an error:', decks.error);
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
        {/* Кнопка для скрытия расширения */}
        <button
          onClick={() => {
            dispatch(toggleSidebar()); // Использование Redux-действия для изменения состояния панели
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
            top: '0px', // Положение крестика
            right: '30px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '26px', // Увеличенный размер шрифта
            fontWeight: 'bold', // Жирный шрифт
            padding: '5px',
            zIndex: 1000 // Добавлен z-index для отображения кнопки поверх других элементов
          }}
          title="Close"
        >
          &times; {/* Символ крестика */}
        </button>
        <header className="App-header">
          {/* Показываем Settings при первоначальной загрузке, если Anki недоступен */}
          {isInitialLoad && !isAnkiAvailable ? (
            <Settings onBackClick={() => handlePageChange('createCard')} popup={false} />
          ) : (
            // Иначе показываем либо CreateCard, либо Settings в зависимости от currentPage
            currentPage === 'settings' ? (
              <Settings onBackClick={() => handlePageChange('createCard')} popup={false} />
            ) : (
              <div style={{ width: '100%', overflow: 'auto' }}>
                <CreateCard onSettingsClick={() => handlePageChange('settings')} />
              </div>
            )
          )}
        </header>
      </div>
    </div>
  );
}

export default App;
