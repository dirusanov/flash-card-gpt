import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './store';
import CreateCard from './components/CreateCard';
import Settings from './components/Settings';
import AuthScreen from './components/AuthScreen';
import StoredCards from './components/StoredCards';
import { fetchDecksSuccess } from './store/actions/decks';
import { fetchDecks } from './services/ankiService';
import { setAnkiAvailability } from './store/actions/anki';
import GlobalNotifications from './components/GlobalNotifications';
import { FaList, FaCog, FaPlus, FaUser } from 'react-icons/fa';
import { loadStoredCards } from './store/actions/cards';
import { setCurrentTabId } from './store/actions/tabState';
import { TabAwareProvider, useTabAware } from './components/TabAwareProvider';
import { subscribeToPendingSelection } from './services/pendingSelection';

interface AppProps { tabId: number; }

interface CreateCardBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

const getExtensionErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message || '';
  }
  return String(error || '');
};

const isExtensionContextInvalidatedError = (error: unknown): boolean =>
  getExtensionErrorMessage(error).includes('Extension context invalidated');

class CreateCardErrorBoundary extends React.Component<{ children: React.ReactNode }, CreateCardBoundaryState> {
  state: CreateCardBoundaryState = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): CreateCardBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unknown CreateCard render error'
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (isExtensionContextInvalidatedError(error)) {
      console.warn('[CreateCardErrorBoundary] Skipping stale extension context error');
      return;
    }
    console.error('[CreateCardErrorBoundary] CreateCard crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="font-semibold">Create Card crashed</div>
          <div className="mt-1 break-words">{this.state.errorMessage}</div>
          <div className="mt-2 text-xs text-red-700">Open DevTools Console for stack trace.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// The panel fills whatever width Chrome gives it; the user resizes the panel itself.
const CONTAINER_STYLE: React.CSSProperties = {
  backgroundColor: '#ffffff',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative',
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif'
};

const AppContent: React.FC<{ tabId: number }> = ({ tabId }) => {
  const tabAware = useTabAware();
  const { currentPage, setCurrentPage } = tabAware;
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const dispatch = useDispatch();
  const auth = useSelector((s: RootState) => s.auth);
  const ankiConnectApiKey = useSelector((s: RootState) => s.settings.ankiConnectApiKey);
  const ankiConnectUrl = useSelector((s: RootState) => s.settings.ankiConnectUrl);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      const runtimeError = event.error ?? event.message;
      if (!isExtensionContextInvalidatedError(runtimeError)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      console.warn('Ignoring stale extension context error');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (!isExtensionContextInvalidatedError(event.reason)) {
        return;
      }

      event.preventDefault();
      console.warn('Ignoring stale extension context rejection');
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        try {
          const decks = await fetchDecks(ankiConnectUrl, ankiConnectApiKey);
          if ((decks as any).error) {
            dispatch(fetchDecksSuccess([]));
            dispatch(setAnkiAvailability(false));
          } else {
            dispatch(fetchDecksSuccess((decks as any).result));
            dispatch(setAnkiAvailability(true));
          }
        } catch {
          dispatch(setAnkiAvailability(false));
        }
      } finally {
        setIsInitialLoad(false);
      }
    };
    if (isInitialLoad) init();
  }, [dispatch, ankiConnectUrl, ankiConnectApiKey, isInitialLoad]);

  useEffect(() => {
    dispatch(loadStoredCards(tabId));
  }, [dispatch, tabId]);

  const handlePageChange = useCallback((page: string) => setCurrentPage(page), [setCurrentPage]);

  // A selection sent from the context menu or the shortcut is useless on the settings or the
  // saved-cards screen. Switching here also mounts CreateCard, which is what reads the value.
  useEffect(() => subscribeToPendingSelection(() => setCurrentPage('createCard')), [setCurrentPage]);

  const sharedContentStyle = useMemo<React.CSSProperties>(() => ({
    width: '100%',
    flex: 1,
    paddingTop: currentPage !== 'createCard' ? '52px' : '8px',
    paddingBottom: '58px',
    overflowY: 'auto',
    overflowX: 'hidden',
    boxSizing: 'border-box'
  }), [currentPage]);

  const cardContentStyle = useMemo<React.CSSProperties>(() => ({
    ...sharedContentStyle,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative'
  }), [sharedContentStyle]);

  const renderMainContent = () => {
    switch (currentPage) {
      case 'auth':
        return <div style={sharedContentStyle}><AuthScreen onBackClick={() => handlePageChange('createCard')} /></div>;
      case 'settings':
        return <div style={sharedContentStyle}><Settings onBackClick={() => handlePageChange('createCard')} popup={false} /></div>;
      case 'storedCards':
        return <div style={sharedContentStyle}><StoredCards onBackClick={() => handlePageChange('createCard')} initialFilter="new" /></div>;
      case 'createCard':
      default:
        return (
          <div style={cardContentStyle}>
            <CreateCardErrorBoundary>
              <CreateCard />
            </CreateCardErrorBoundary>
          </div>
        );
    }
  };

  const renderChrome = () => {
    const shouldHideBottomNav = tabAware.isGeneratingCard;
    return (
      <>
        {currentPage !== 'createCard' && (
          <div style={{ position: 'absolute', top: '8px', left: '12px', right: '12px', zIndex: 20 }}>
            <button
              onClick={() => handlePageChange('createCard')}
              style={{
                backgroundColor: '#2563EB', border: 'none', cursor: 'pointer', padding: '8px 14px',
                color: '#fff', borderRadius: 8, width: '100%', minHeight: 36, fontSize: 13,
                fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', lineHeight: 1.1, boxShadow: '0 1px 3px rgba(37,99,235,0.2)', transition: 'all .2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#1D4ED8'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#2563EB'; }}
            >
              <FaPlus size={14} />
              <span>New Card</span>
            </button>
          </div>
        )}

        {!shouldHideBottomNav && (
          <div style={{ position: 'absolute', bottom: '8px', left: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 20 }}>
            {([
              { page: 'storedCards', icon: <FaList size={16} />, label: 'Cards', title: 'View your saved cards' },
              { page: 'auth', icon: <FaUser size={16} />, label: auth.accessToken ? 'Account' : 'Login', title: auth.accessToken ? 'Account' : 'Sign in to sync cards' },
              { page: 'settings', icon: <FaCog size={16} />, label: 'Settings', title: 'App settings and API configuration' },
            ] as const).map(({ page, icon, label, title }) => {
              const active = currentPage === page;
              return (
                <button
                  key={page}
                  onClick={() => handlePageChange(page)}
                  className="nav-button"
                  style={{
                    backgroundColor: active ? '#EFF6FF' : '#F9FAFB',
                    border: `1px solid ${active ? '#BFDBFE' : '#E5E7EB'}`,
                    cursor: 'pointer', padding: '10px 14px',
                    color: active ? '#2563EB' : '#6B7280',
                    borderRadius: '10px', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', flex: 1, gap: '3px', fontSize: '11px',
                    fontWeight: active ? 600 : 500,
                    boxShadow: active ? '0 2px 4px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)'
                  }}
                  title={title}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="App" style={CONTAINER_STYLE}>
      {renderChrome()}
      <header className="App-header" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
        {renderMainContent()}
      </header>
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 30, maxWidth: 300, pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}><GlobalNotifications /></div>
      </div>
    </div>
  );
};

function App({ tabId }: AppProps) {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setCurrentTabId(tabId));
  }, [dispatch, tabId]);

  return (
    <TabAwareProvider tabId={tabId}>
      <AppContent tabId={tabId} />
    </TabAwareProvider>
  );
}

export default App;
