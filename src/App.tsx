import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import { setCurrentPage } from "./store/actions/page";
import CreateCard from './components/CreateCard';
import Settings from "./components/Settings";
import StoredCards from './components/StoredCards';
import { instantiateStore } from './store';
import { ExtendedStore } from 'reduxed-chrome-storage';
import { fetchDecksSuccess } from './store/actions/decks';
import { fetchDecks } from './services/ankiService';
import { setAnkiAvailability } from './store/actions/anki';
import { toggleSidebar } from './store/actions/sidebar'
import useErrorNotification from './components/useErrorHandler';
import { FaList, FaCog, FaTimes, FaPlus } from 'react-icons/fa';
import { loadStoredCards } from './store/actions/cards';
import { loadCardsFromStorage } from './store/middleware/cardsLocalStorage';

function App() {
  const [store, setStore] = useState<ExtendedStore | null>(null);
  const isAnkiAvailable = useSelector((state: RootState) => state.anki.isAnkiAvailable)
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const currentPage = useSelector((state: RootState) => state.currentPage);
  const dispatch = useDispatch();
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
  const { showError, renderErrorNotification } = useErrorNotification();
  const storedCards = useSelector((state: RootState) => state.cards.storedCards);

  useEffect(() => {
    const initializeStore = async () => {
      try {
        const resolvedStore = await instantiateStore();
        setStore(resolvedStore);
        
        // Загружаем сохраненные карточки при запуске приложения
        dispatch(loadStoredCards());
        console.log('Initial card load from App component');

        // Check Anki availability but don't affect the initial page
        try {
          const decks = await fetchDecks(ankiConnectApiKey);

          if (decks.error) {
            console.error('Anki returned an error:', decks.error);
            dispatch(setAnkiAvailability(false));
          } else {
            dispatch(fetchDecksSuccess(decks.result));
            dispatch(setAnkiAvailability(true));
            console.log('Anki is available', currentPage);
          }
        } catch (error) {
          console.error('Anki is unavailable:', error);
          dispatch(setAnkiAvailability(false));
        }
      } catch (error) {
        console.error('Error loading state from Chrome storage:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };

    initializeStore();
  }, [dispatch, ankiConnectApiKey, isInitialLoad, currentPage])

  // Отслеживаем загрузку сохраненных карточек
  useEffect(() => {
    console.log('App: Stored cards count:', storedCards.length);
  }, [storedCards]);

  if (!store) {
    return null;
  }

  const handlePageChange = (page: string) => {
    dispatch(setCurrentPage(page));
  };

  const handleCloseExtension = () => {
    dispatch(toggleSidebar());
    chrome.runtime.sendMessage({ action: 'toggleSidebar' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
      } else {
        console.log('Extension closed:', response);
      }
    });
  };

  const renderMainContent = () => {
    switch(currentPage) {
      case 'settings':
        return <Settings onBackClick={() => handlePageChange('createCard')} popup={false} />;
      case 'storedCards':
        return <StoredCards onBackClick={() => handlePageChange('createCard')} />;
      case 'createCard':
      default:
        return (
          <div style={{ 
            width: '100%', 
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'auto',
            height: '100%',
            position: 'relative',
            marginTop: '20px'
          }}>
            <CreateCard />
          </div>
        );
    }
  };

  const renderHeaderButtons = () => {
    return (
      <div className="header-buttons" style={{
        position: 'absolute',
        top: '10px',
        left: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '6px',
        zIndex: 100
      }}>
        {currentPage !== 'createCard' && (
          <button
            onClick={() => handlePageChange('createCard')}
            className="header-button"
            style={{
              backgroundColor: '#2563EB',
              border: 'none',
              cursor: 'pointer',
              fontSize: '15px',
              padding: '6px 0',
              color: '#FFFFFF',
              borderRadius: '6px',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1.2,
              height: '34px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#1D4ED8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#2563EB';
            }}
            title="Create a new card"
          >
            <FaPlus style={{ marginRight: '4px' }} size={12} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>New Card</span>
          </button>
        )}
        
        <button
          onClick={() => handlePageChange('storedCards')}
          className="header-button"
          style={{
            backgroundColor: currentPage === 'storedCards' ? '#e5e7eb' : '#f3f4f6',
            border: 'none',
            cursor: 'pointer',
            fontSize: '15px',
            padding: '6px 0',
            color: '#4B5563',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            height: '34px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
          onMouseOver={(e) => {
            if (currentPage !== 'storedCards') {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
            }
            e.currentTarget.style.color = '#111827';
          }}
          onMouseOut={(e) => {
            if (currentPage !== 'storedCards') {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
            }
            e.currentTarget.style.color = '#4B5563';
          }}
          title="View Saved Cards"
        >
          <FaList style={{ marginRight: '4px' }} size={14} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Cards</span>
        </button>
        
        <button
          onClick={() => handlePageChange('settings')}
          className="header-button"
          style={{
            backgroundColor: currentPage === 'settings' ? '#e5e7eb' : '#f3f4f6',
            border: 'none',
            cursor: 'pointer',
            fontSize: '15px',
            padding: '6px 0',
            color: '#4B5563',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            height: '34px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
          onMouseOver={(e) => {
            if (currentPage !== 'settings') {
              e.currentTarget.style.backgroundColor = '#e5e7eb';
            }
            e.currentTarget.style.color = '#111827';
          }}
          onMouseOut={(e) => {
            if (currentPage !== 'settings') {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
            }
            e.currentTarget.style.color = '#4B5563';
          }}
          title="Settings"
        >
          <FaCog style={{ marginRight: '4px' }} size={14} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Settings</span>
        </button>
        
        <button
          onClick={handleCloseExtension}
          className="header-button"
          style={{
            backgroundColor: '#f3f4f6',
            border: 'none',
            cursor: 'pointer',
            fontSize: '15px',
            padding: '6px 0',
            color: '#EF4444',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
            height: '34px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#e5e7eb';
            e.currentTarget.style.color = '#B91C1C';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.color = '#EF4444';
          }}
          title="Close"
        >
          <FaTimes style={{ marginRight: '4px' }} size={14} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Close</span>
        </button>
      </div>
    );
  };

  return (
    <div className="App" style={{
      backgroundColor: '#ffffff',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'absolute',
      right: 0,
      top: 0,
      width: '350px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif',
      boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.05), 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    }}>
      <div style={{ 
        flex: 1,
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {renderHeaderButtons()}
        
        <header className="App-header" style={{
          width: '100%',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          marginTop: '34px',
          height: 'calc(100% - 34px)',
          overflow: 'auto'
        }}>
          {renderMainContent()}
          <div style={{
            position: 'absolute',
            top: '8px',
            left: '0',
            right: '0',
            width: '100%',
            zIndex: 60,
            padding: '0 16px'
          }}>
            {renderErrorNotification()}
          </div>
        </header>
      </div>
    </div>
  );
}

export default App;
