import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './store';
import CreateCard from './components/CreateCard';
import QuickStart from './components/QuickStart';
import FeatureOverview from './components/FeatureOverview';
import Settings from './components/Settings';
import AuthScreen from './components/AuthScreen';
import StoredCards from './components/StoredCards';
import { fetchDecksSuccess } from './store/actions/decks';
import { fetchDecks } from './services/ankiService';
import { setAnkiAvailability } from './store/actions/anki';
import GlobalNotifications from './components/GlobalNotifications';
import { FaList, FaCog, FaPlus, FaUser } from 'react-icons/fa';
import { loadStoredCards } from './store/actions/cards';
import { loadVaultoDecks, syncVaultoDecksWithServer } from './store/actions/vaultoDecks';
import { setCurrentTabId } from './store/actions/tabState';
import { TabAwareProvider, useTabAware } from './components/TabAwareProvider';
import { subscribeToPendingSelection } from './services/pendingSelection';
import { recordDailyActivity } from './services/usageMetrics';
import { isDue } from './services/srs';

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
  const isLoggedIn = Boolean(auth.accessToken);
  const hasOwnKey = useSelector((s: RootState) => Boolean(s.settings.openAiKey.trim()));
  const useAnkiConnect = useSelector((s: RootState) => s.settings.useAnkiConnect);
  const ankiConnectApiKey = useSelector((s: RootState) => s.settings.ankiConnectApiKey);
  const ankiConnectUrl = useSelector((s: RootState) => s.settings.ankiConnectUrl);
  const [reviewTime, setReviewTime] = useState(() => new Date());
  const dueCount = useMemo(
    () => tabAware.storedCards.filter((card) => isDue(card.srsState, reviewTime)).length,
    [tabAware.storedCards, reviewTime],
  );

  useEffect(() => {
    const timer = setInterval(() => setReviewTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

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
      if (!useAnkiConnect) {
        setIsInitialLoad(false);
        return;
      }
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
  }, [dispatch, ankiConnectUrl, ankiConnectApiKey, isInitialLoad, useAnkiConnect]);

  useEffect(() => {
    dispatch(loadStoredCards(tabId));
  }, [dispatch, tabId]);

  // The panel mounting is the one event common to every way of opening it (toolbar click,
  // context menu, Alt+C) — recordDailyActivity only fired on the context-menu path before this.
  useEffect(() => {
    void recordDailyActivity();
  }, []);

  useEffect(() => {
    dispatch(loadVaultoDecks() as any);
  }, [dispatch]);

  // Local decks work fully offline; when signed in, this additionally pulls decks known
  // to the server and pushes anything created here while offline — see vaultoDecks.ts.
  // Keyed on isLoggedIn rather than the raw token so a silent token refresh (a new string,
  // same session) doesn't re-trigger this — only an actual sign-in/out transition does.
  useEffect(() => {
    if (!isLoggedIn) return;
    dispatch(syncVaultoDecksWithServer() as any);
  }, [dispatch, isLoggedIn]);

  const handlePageChange = useCallback((page: string) => setCurrentPage(page), [setCurrentPage]);

  // A selection sent from the context menu or the shortcut is useless on the settings or the
  // saved-cards screen. Switching here also mounts CreateCard, which is what reads the value.
  useEffect(() => subscribeToPendingSelection(() => setCurrentPage('createCard')), [setCurrentPage]);

  // Every screen now reaches Create through the tab bar, so none of them has to leave
  // room at the top for a button that only existed to get back.
  const sharedContentStyle = useMemo<React.CSSProperties>(() => ({
    width: '100%',
    flex: 1,
    paddingTop: '8px',
    paddingBottom: '58px',
    overflowY: 'auto',
    overflowX: 'hidden',
    boxSizing: 'border-box'
  }), []);

  const cardContentStyle = useMemo<React.CSSProperties>(() => ({
    ...sharedContentStyle,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    // CreateCard scrolls its own composer and pins the primary action below it, so a
    // second scroll container here would let that footer drift out of view.
    overflowY: 'hidden'
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
            <FeatureOverview hasOwnKey={hasOwnKey} signedIn={isLoggedIn}
              disabled={tabAware.isGeneratingCard} onNavigate={handlePageChange} />
            <div className="min-h-0 flex-1">
              <CreateCardErrorBoundary>
                {hasOwnKey ? <CreateCard /> : <QuickStart />}
              </CreateCardErrorBoundary>
            </div>
          </div>
        );
    }
  };

  // Four destinations, four tabs. Create used to be a blue primary-looking button pinned
  // above every other screen, which read as "make something" when its actual job was
  // "go back" — and cost each of those screens 52px of top padding.
  const renderChrome = () => {
    const tabs = [
      { page: 'createCard', icon: <FaPlus size={15} />, label: 'Create', title: 'Create a new card' },
      { page: 'storedCards', icon: <FaList size={15} />, label: 'Cards', title: 'View your saved cards' },
      { page: 'auth', icon: <FaUser size={15} />, label: auth.accessToken ? 'Account' : 'Login', title: auth.accessToken ? 'Account' : 'Sign in to back up your cards' },
      { page: 'settings', icon: <FaCog size={15} />, label: 'Settings', title: 'App settings and API configuration' },
    ] as const;

    return (
      <div className="absolute bottom-2 left-3 right-3 z-20 flex gap-1.5">
        {tabs.map(({ page, icon, label, title }) => {
          const active = currentPage === page;
          // Generation is tab-scoped and cancelling it lives on the create screen, so the
          // other tabs lock rather than the whole bar disappearing mid-run.
          const locked = tabAware.isGeneratingCard && page !== 'createCard';
          return (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              disabled={locked}
              aria-current={active ? 'page' : undefined}
              aria-label={page === 'storedCards' && dueCount > 0 ? `Cards, ${dueCount} ready to review` : label}
              className={[
                'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-card border px-2 py-2 text-[11px]',
                'transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'disabled:cursor-not-allowed disabled:opacity-40',
                active
                  ? 'border-accent-border bg-accent-subtle font-semibold text-accent'
                  : 'border-line bg-surface-muted font-medium text-gray-500 hover:bg-surface-sunken',
              ].join(' ')}
              title={page === 'storedCards' && dueCount > 0 ? `${dueCount} ${dueCount === 1 ? 'card' : 'cards'} ready to review` : title}
            >
              <span className="flex items-center gap-1">
                {icon}
                {page === 'storedCards' && dueCount > 0 && (
                  <span aria-hidden="true" className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-4 text-white">
                    {dueCount > 99 ? '99+' : dueCount}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>
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
