import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import CreateCard from './components/CreateCard';
import Settings from './components/Settings';
import StoredCards from './components/StoredCards';
import { fetchDecksSuccess } from './store/actions/decks';
import { fetchDecks } from './services/ankiService';
import { setAnkiAvailability } from './store/actions/anki';
import { toggleSidebar } from './store/actions/sidebar'
import GlobalNotifications from './components/GlobalNotifications';
import { FaList, FaCog, FaTimes, FaPlus } from 'react-icons/fa';
import { loadStoredCards } from './store/actions/cards';
import { setCurrentTabId } from './store/actions/tabState';
import { TabAwareProvider, useTabAware } from './components/TabAwareProvider';

interface AppProps {
  tabId: number;
}

// Внутренний компонент, который использует TabAware context
const AppContent: React.FC<{ tabId: number }> = ({ tabId }) => {
  const tabAware = useTabAware();
  const { currentPage, setCurrentPage } = tabAware;
  const isAnkiAvailable = useSelector((state: RootState) => state.anki.isAnkiAvailable);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const dispatch = useDispatch();
  const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);

  // Получаем состояние для текущей вкладки из tabAware
  const { storedCards } = tabAware;
  const isGeneratingCard = tabAware.isGeneratingCard;

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Загружаем сохраненные карточки при запуске приложения (оставляем для обратной совместимости)
        dispatch(loadStoredCards());
        console.log('Initial card load from App component for tab:', tabId);

        // Check Anki availability but don't affect the initial page
        try {
          const decks = await fetchDecks(ankiConnectApiKey);

          if (decks.error) {
            console.error('Anki returned an error:', decks.error);
            dispatch(setAnkiAvailability(false));
          } else {
            dispatch(fetchDecksSuccess(decks.result));
            dispatch(setAnkiAvailability(true));
            console.log('Anki is available');
          }
        } catch (error) {
          console.error('Anki is unavailable:', error);
          dispatch(setAnkiAvailability(false));
        }
      } catch (error) {
        console.error('Error initializing app:', error);
      } finally {
        setIsInitialLoad(false);
      }
    };

    if (isInitialLoad) {
      initializeApp();
    }
  }, [dispatch, ankiConnectApiKey, isInitialLoad, tabId]);

  // Отслеживаем загрузку сохраненных карточек для текущей вкладки
  useEffect(() => {
    console.log(`App: Stored cards count for tab ${tabId}:`, storedCards.length);
  }, [storedCards, tabId]);

  const handlePageChange = useCallback((page: string) => {
    setCurrentPage(page);
  }, [setCurrentPage]);

  const handleCloseExtension = useCallback(() => {
    dispatch(toggleSidebar(tabId));
    chrome.runtime.sendMessage({ action: 'toggleSidebar', tabId }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message:', chrome.runtime.lastError.message);
      } else {
        console.log('Extension closed:', response);
      }
    });
  }, [dispatch, tabId]);

  const renderMainContent = () => {
    // Динамические отступы в зависимости от наличия New Card кнопки
    const topPadding = currentPage !== 'createCard' ? '46px' : '12px'; // компактные отступы
    const bottomPadding = '58px'; // компактнее для bottom navigation

    const baseStyle = {
      width: '100%',
      height: '100%',
      paddingTop: topPadding,
      paddingBottom: bottomPadding,
      overflow: 'auto',
      opacity: 1,
      transform: 'translateX(0)',
      transition: 'all 0.3s ease-in-out'
    };

    switch(currentPage) {
      case 'settings':
        return (
          <div style={baseStyle}>
            <Settings onBackClick={() => handlePageChange('createCard')} popup={false} />
          </div>
        );
      case 'storedCards':
        return (
          <div style={baseStyle}>
            <StoredCards onBackClick={() => handlePageChange('createCard')} />
          </div>
        );
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
            paddingTop: topPadding,
            paddingBottom: bottomPadding,
            opacity: 1,
            transform: 'translateX(0)',
            transition: 'all 0.3s ease-in-out'
          }}>
            <CreateCard />
          </div>
        );
    }
  };

  const renderHeaderButtons = () => {
    // Считаем несохраненные карточки для бейджа
    const unsavedCardsCount = storedCards.filter(card => 
      card.exportStatus === 'not_exported'
    ).length;

    return (
      <>
        {/* Close button - всегда сверху справа */}
        <button
          onClick={handleCloseExtension}
          className="close-button"
          style={{
            position: 'absolute',
            top: '6px',
            right: '12px',
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            color: '#6B7280',
            borderRadius: '5px',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '28px',
            height: '28px',
            zIndex: 200
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#F3F4F6';
            e.currentTarget.style.color = '#EF4444';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#6B7280';
          }}
          title="Close extension"
        >
          <FaTimes size={14} />
        </button>

        {/* New Card button - показывается только когда нужен */}
        {currentPage !== 'createCard' && (
          <div style={{
            position: 'absolute',
            top: '6px',
            left: '12px',
            right: '50px', // отступ для close кнопки
            zIndex: 100
          }}>
            <button
              onClick={() => handlePageChange('createCard')}
              className="new-card-button"
              style={{
                backgroundColor: '#2563EB',
                border: 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                color: '#FFFFFF',
                borderRadius: '7px',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '32px',
                boxShadow: '0 1px 3px rgba(37, 99, 235, 0.2)',
                fontSize: '13px',
                fontWeight: 600
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#1D4ED8';
                e.currentTarget.style.transform = 'translateY(-0.5px)';
                e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.25)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#2563EB';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.2)';
              }}
              title="Create a new card"
            >
              <FaPlus style={{ marginRight: '5px' }} size={13} />
              New Card
            </button>
          </div>
        )}

        {/* Bottom navigation - Cards и Settings */}
        <div style={{
          position: 'absolute',
          bottom: '8px',
          left: '12px',
          right: '12px',
          display: 'flex',
          gap: '6px',
          zIndex: 100
        }}>
          <button
            onClick={() => handlePageChange('storedCards')}
            disabled={isGeneratingCard}
            className="nav-button"
            style={{
              backgroundColor: currentPage === 'storedCards' ? '#EFF6FF' : '#F9FAFB',
              border: `1px solid ${currentPage === 'storedCards' ? '#BFDBFE' : '#E5E7EB'}`,
              cursor: isGeneratingCard ? 'not-allowed' : 'pointer',
              padding: '10px 14px',
              color: isGeneratingCard ? '#9CA3AF' : (currentPage === 'storedCards' ? '#2563EB' : '#6B7280'),
              borderRadius: '10px',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: '3px',
              fontSize: '11px',
              fontWeight: currentPage === 'storedCards' ? 600 : 500,
              boxShadow: currentPage === 'storedCards' ? '0 2px 4px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
              position: 'relative',
              opacity: isGeneratingCard ? 0.6 : 1
            }}
            onMouseOver={(e) => {
              if (currentPage !== 'storedCards' && !isGeneratingCard) {
                e.currentTarget.style.backgroundColor = '#F3F4F6';
                e.currentTarget.style.borderColor = '#D1D5DB';
                e.currentTarget.style.color = '#374151';
              }
            }}
            onMouseOut={(e) => {
              if (currentPage !== 'storedCards' && !isGeneratingCard) {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.color = '#6B7280';
              }
            }}
            title={isGeneratingCard ? "Please wait while card is being generated" : "View your saved cards"}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <FaList size={16} />
              {unsavedCardsCount > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-8px',
                  backgroundColor: '#EF4444',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  padding: '2px 6px',
                  minWidth: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                }}>
                  {unsavedCardsCount > 99 ? '99+' : unsavedCardsCount}
                </span>
              )}
            </div>
            <span>Cards</span>
          </button>
          
          <button
            onClick={() => handlePageChange('settings')}
            disabled={isGeneratingCard}
            className="nav-button"
            style={{
              backgroundColor: currentPage === 'settings' ? '#EFF6FF' : '#F9FAFB',
              border: `1px solid ${currentPage === 'settings' ? '#BFDBFE' : '#E5E7EB'}`,
              cursor: isGeneratingCard ? 'not-allowed' : 'pointer',
              padding: '10px 14px',
              color: isGeneratingCard ? '#9CA3AF' : (currentPage === 'settings' ? '#2563EB' : '#6B7280'),
              borderRadius: '10px',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: '3px',
              fontSize: '11px',
              fontWeight: currentPage === 'settings' ? 600 : 500,
              boxShadow: currentPage === 'settings' ? '0 2px 4px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
              opacity: isGeneratingCard ? 0.6 : 1
            }}
            onMouseOver={(e) => {
              if (currentPage !== 'settings' && !isGeneratingCard) {
                e.currentTarget.style.backgroundColor = '#F3F4F6';
                e.currentTarget.style.borderColor = '#D1D5DB';
                e.currentTarget.style.color = '#374151';
              }
            }}
            onMouseOut={(e) => {
              if (currentPage !== 'settings' && !isGeneratingCard) {
                e.currentTarget.style.backgroundColor = '#F9FAFB';
                e.currentTarget.style.borderColor = '#E5E7EB';
                e.currentTarget.style.color = '#6B7280';
              }
            }}
            title={isGeneratingCard ? "Please wait while card is being generated" : "App settings and API configuration"}
          >
            <FaCog size={16} />
            <span>Settings</span>
          </button>
        </div>
      </>
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
          marginTop: '0px',
          height: '100%',
          overflow: 'auto'
        }}>
          {renderMainContent()}
          
          {/* Toast notifications - absolute positioning в рамках расширения */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 9999,
            maxWidth: '300px',
            width: 'auto',
            pointerEvents: 'none' // пропускаем клики через контейнер
          }}>
            <div style={{ pointerEvents: 'auto' }}> {/* восстанавливаем клики для самих уведомлений */}
              <GlobalNotifications />
            </div>
          </div>
        </header>
      </div>
    </div>
  );
};

function App({ tabId }: AppProps) {
  const dispatch = useDispatch();

  useEffect(() => {
    // Устанавливаем текущий tab ID в store
    dispatch(setCurrentTabId(tabId));
    console.log('App initialized for tab:', tabId);
  }, [dispatch, tabId]);

  return (
    <TabAwareProvider tabId={tabId}>
      <AppContent tabId={tabId} />
    </TabAwareProvider>
  );
}

export default App;
