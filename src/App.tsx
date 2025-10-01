import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "./store";
import CreateCard from './components/CreateCard';
import Settings from './components/Settings';
import StoredCards from './components/StoredCards';
import { fetchDecksSuccess } from './store/actions/decks';
import { fetchDecks } from './services/ankiService';
import { setAnkiAvailability } from './store/actions/anki';
import { toggleSidebar } from './store/actions/sidebar';
import GlobalNotifications from './components/GlobalNotifications';
import { FaList, FaCog, FaTimes, FaPlus, FaColumns, FaExpandArrowsAlt } from 'react-icons/fa';
import { loadStoredCards } from './store/actions/cards';
import { setCurrentTabId } from './store/actions/tabState';
import { TabAwareProvider, useTabAware } from './components/TabAwareProvider';

interface AppProps {
  tabId: number;
}

const clamp = (v:number, a:number, b:number) => Math.max(a, Math.min(b, v));
const DEFAULT_FLOAT = { width: 360, height: 560, x: 24, y: 24 };
const floatKey = (tabId: number) => `anki_float_state_v1:${tabId}`;

const ensureFloatingRoot = () => {
  const id = 'anki-floating-root';
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
};

const forceRemoveSidebarGap = (enable: boolean) => {
  const STYLE_ID = 'anki-float-reset-gap';
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (enable) {
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_ID;
      tag.textContent = `
        html, body { margin-right: 0 !important; padding-right: 0 !important; }
        #anki-sidebar-spacer, .anki-sidebar-spacer { display: none !important; width: 0 !important; }
      `;
      document.head.appendChild(tag);
    }
    document.documentElement.style.marginRight = '';
    document.documentElement.style.paddingRight = '';
    document.body.style.marginRight = '';
    document.body.style.paddingRight = '';
  } else {
    if (tag && tag.parentNode) tag.parentNode.removeChild(tag);
  }
};

const setSidebarHostVisible = (visible: boolean) => {
  try {
    const known = document.querySelector('#sidebar') as HTMLElement | null;
    if (known) known.style.display = visible ? '' : 'none';

    const candidates = Array.from(document.querySelectorAll('*')) as HTMLElement[];
    for (const el of candidates) {
      const cs = getComputedStyle(el);
      const isRight = (el.style.right === '0px') || ((cs as any).right === '0px');
      if ((cs.position === 'fixed' || cs.position === 'absolute') && isRight && el.offsetWidth >= 280 && el.offsetWidth <= 520) {
        if (el.id === 'anki-floating-root') continue;
        if (el.querySelector('[data-anki-app-anchor]')) el.style.display = visible ? '' : 'none';
      }
    }
  } catch {}
};

// Жёсткий показ контейнера сайдбара
const hardShowSidebarHost = () => {
  const host = document.querySelector('#sidebar') as HTMLElement | null;
  if (!host) return;
  host.removeAttribute('hidden');
  host.style.removeProperty('display');
  host.style.removeProperty('visibility');
  host.style.removeProperty('opacity');
  host.style.removeProperty('transform');
  host.classList.remove('hidden', 'is-hidden', 'collapsed');
};

const AppContent: React.FC<{ tabId: number }> = ({ tabId }) => {
  const tabAware = useTabAware();
  const { currentPage, setCurrentPage } = tabAware;
  const isAnkiAvailable = useSelector((s: RootState) => s.anki.isAnkiAvailable);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const dispatch = useDispatch();
  const ankiConnectApiKey = useSelector((s: RootState) => s.settings.ankiConnectApiKey);

  // floating
  const [isFloating, setIsFloating] = useState<boolean>(false);
  const [floatPos, setFloatPos] = useState({ x: DEFAULT_FLOAT.x, y: DEFAULT_FLOAT.y });
  const [floatSize, setFloatSize] = useState({ width: DEFAULT_FLOAT.width, height: DEFAULT_FLOAT.height });
  const draggingRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizingRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  // restore/save floating state per tab
  useEffect(() => {
    try {
      const raw = localStorage.getItem(floatKey(tabId));
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.isFloating === 'boolean') setIsFloating(saved.isFloating);
        if (saved.pos) setFloatPos(saved.pos);
        if (saved.size) setFloatSize(saved.size);
      }
    } catch {}
  }, [tabId]);

  useEffect(() => {
    try {
      localStorage.setItem(floatKey(tabId), JSON.stringify({ isFloating, pos: floatPos, size: floatSize }));
    } catch {}
  }, [isFloating, floatPos, floatSize, tabId]);

  // hide/show sidebar host & gap
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const findHost = (): HTMLElement | null => {
      const explicit = document.querySelector('#anki-sidebar-root') as HTMLElement | null;
      if (explicit) return explicit;

      let el: HTMLElement | null = anchor.parentElement;
      while (el && el !== document.body) {
        const cs = getComputedStyle(el);
        const width = el.offsetWidth;
        const isRight = (el.style.right === '0px') || ((cs as any).right === '0px');
        if ((cs.position === 'fixed' || cs.position === 'absolute') && isRight && width >= 280 && width <= 520) return el;
        el = el.parentElement;
      }

      const all = Array.from(document.querySelectorAll('*')) as HTMLElement[];
      for (const n of all) {
        const cs = getComputedStyle(n);
        const isRight = (n.style.right === '0px') || ((cs as any).right === '0px');
        if ((cs.position === 'fixed' || cs.position === 'absolute') && isRight && n.offsetWidth >= 280 && n.offsetWidth <= 520) {
          if (n.contains(anchor)) return n;
        }
      }
      return null;
    };

    const host = findHost();
    if (host) host.style.display = isFloating ? 'none' : '';
    forceRemoveSidebarGap(isFloating);
  }, [isFloating]);

  // init
  useEffect(() => {
    const init = async () => {
      try {
        dispatch(loadStoredCards());
        try {
          const decks = await fetchDecks(ankiConnectApiKey);
          if ((decks as any).error) {
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
  }, [dispatch, ankiConnectApiKey, isInitialLoad]);

  // close
  const handleCloseExtension = useCallback(() => {
    dispatch(toggleSidebar(tabId));
    try { chrome.runtime.sendMessage({ action: 'toggleSidebar', tabId }); } catch {}
  }, [dispatch, tabId]);

  // enable/disable/toggle floating
  const enableFloating = useCallback(() => {
    setIsFloating(true);
    setSidebarHostVisible(false);
    forceRemoveSidebarGap(true);
    try { chrome.runtime.sendMessage({ action: 'syncFloatingState', floatingVisible: true }); } catch {}
  }, []);

  const disableFloating = useCallback(() => {
    setIsFloating(false);
    setSidebarHostVisible(true);
    forceRemoveSidebarGap(false);
    hardShowSidebarHost();

    try { chrome.runtime.sendMessage({ action: 'expandSidebar', tabId }); } catch {}
    try { chrome.runtime.sendMessage({ action: 'syncFloatingState', floatingVisible: false }); } catch {}

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        hardShowSidebarHost();
        setSidebarHostVisible(true);
      });
    });

    const floatRoot = document.getElementById('anki-floating-root');
    if (floatRoot && floatRoot.childElementCount === 0) floatRoot.remove();
  }, [tabId]);

  const toggleFloating = useCallback(() => {
    setIsFloating(prev => {
      const next = !prev;

      if (next) {
        setSidebarHostVisible(false);
        forceRemoveSidebarGap(true);
        try { chrome.runtime.sendMessage({ action: 'collapseSidebar', tabId }); } catch {}
        try { chrome.runtime.sendMessage({ action: 'syncFloatingState', floatingVisible: true }); } catch {}
      } else {
        setSidebarHostVisible(true);
        forceRemoveSidebarGap(false);
        hardShowSidebarHost();
        try { chrome.runtime.sendMessage({ action: 'expandSidebar', tabId }); } catch {}
        try { chrome.runtime.sendMessage({ action: 'syncFloatingState', floatingVisible: false }); } catch {}
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            hardShowSidebarHost();
            setSidebarHostVisible(true);
          });
        });
      }

      return next;
    });
  }, [tabId]);

  // messages
  useEffect(() => {
    const onMessage = (msg: any, _sender: chrome.runtime.MessageSender, sendResponse?: (r?: any) => void) => {
      if (!msg?.action) return;

      if (msg.action === 'toggleFloating') { toggleFloating(); sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'showFloating')   { enableFloating();  sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'hideFloating')   { disableFloating(); sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'collapseSidebar'){ enableFloating();  sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'expandSidebar')  { disableFloating(); sendResponse?.({ ok: true }); return true; }
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [toggleFloating, enableFloating, disableFloating]);

  // drag
  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFloating) return;
    const startX = e.clientX, startY = e.clientY;
    draggingRef.current = { offsetX: startX - floatPos.x, offsetY: startY - floatPos.y };
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  };
  const onDragMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const { innerWidth, innerHeight } = window;
    const x = clamp(e.clientX - draggingRef.current.offsetX, 8, innerWidth - floatSize.width - 8);
    const y = clamp(e.clientY - draggingRef.current.offsetY, 8, innerHeight - floatSize.height - 8);
    setFloatPos({ x, y });
  };
  const onDragEnd = () => {
    draggingRef.current = null;
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  };

  // resize
  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFloating) return;
    e.stopPropagation();
    resizingRef.current = { startX: e.clientX, startY: e.clientY, startW: floatSize.width, startH: floatSize.height };
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  };
  const onResizeMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const dx = e.clientX - resizingRef.current.startX;
    const dy = e.clientY - resizingRef.current.startY;
    const newW = clamp(resizingRef.current.startW + dx, 300, Math.min(window.innerWidth - 16, 720));
    const newH = clamp(resizingRef.current.startH + dy, 340, Math.min(window.innerHeight - 16, 900));
    setFloatSize({ width: newW, height: newH });
  };
  const onResizeEnd = () => {
    resizingRef.current = null;
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  };

  const handlePageChange = useCallback((page: string) => setCurrentPage(page), [setCurrentPage]);

  const renderMainContent = () => {
    const topPadding = currentPage !== 'createCard' ? '46px' : '12px';
    const bottomPadding = '58px';
    const baseStyle: React.CSSProperties = {
      width: '100%', height: '100%', paddingTop: topPadding, paddingBottom: bottomPadding, overflow: 'auto',
      opacity: 1, transform: 'translateX(0)', transition: 'all 0.3s ease-in-out'
    };

    switch (currentPage) {
      case 'settings':
        return <div style={baseStyle}><Settings onBackClick={() => handlePageChange('createCard')} popup={false} /></div>;
      case 'storedCards':
        return <div style={baseStyle}><StoredCards onBackClick={() => handlePageChange('createCard')} /></div>;
      case 'createCard':
      default:
        return (
          <div style={{
            width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', height: '100%', position: 'relative',
            paddingTop: topPadding, paddingBottom: bottomPadding, opacity: 1, transform: 'translateX(0)', transition: 'all 0.3s ease-in-out'
          }}>
            <CreateCard />
          </div>
        );
    }
  };

  const renderHeaderButtons = () => {
    const unsavedCardsCount = tabAware.storedCards.filter(c => c.exportStatus === 'not_exported').length;

    return (
      <>
        {isFloating && (
          <div
            onMouseDown={onDragStart}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 28, cursor: 'move',
              background: 'linear-gradient(to right, rgba(243,244,246,0.95), rgba(255,255,255,0.75))',
              borderTopLeftRadius: 12, borderTopRightRadius: 12,
              borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 250
            }}
            title="Drag to move"
          />
        )}

        <button
          onClick={handleCloseExtension}
          className="close-button"
          style={{
            position: 'absolute', top: '6px', right: '12px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
            padding: '6px', color: '#6B7280', borderRadius: '5px', transition: 'all 0.2s ease', display: 'flex',
            alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', zIndex: 260
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; e.currentTarget.style.color = '#EF4444'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
          title="Close extension"
        >
          <FaTimes size={14} />
        </button>

        <button
          onClick={toggleFloating}
          className="float-toggle-button"
          style={{
            position: 'absolute', top: '6px', right: '46px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '6px',
            color: '#6B7280', borderRadius: '5px', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', zIndex: 260
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; e.currentTarget.style.color = '#111827'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
          title={isFloating ? 'Dock to sidebar' : 'Make window floating'}
        >
          {isFloating ? <FaColumns size={14} /> : <FaExpandArrowsAlt size={14} />}
        </button>

        {currentPage !== 'createCard' && (
          <div style={{ position: 'absolute', top: '6px', left: '12px', right: '80px', zIndex: 200 }}>
            <button
              onClick={() => handlePageChange('createCard')}
              className="new-card-button"
              style={{
                backgroundColor: '#2563EB', border: 'none', cursor: 'pointer', padding: '6px 14px', color: '#FFFFFF',
                borderRadius: '7px', transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', height: '32px', boxShadow: '0 1px 3px rgba(37, 99, 235, 0.2)', fontSize: '13px', fontWeight: 600
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#1D4ED8'; e.currentTarget.style.transform = 'translateY(-0.5px)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.25)'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#2563EB'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.2)'; }}
              title="Create a new card"
            >
              <FaPlus style={{ marginRight: '5px' }} size={13} />
              New Card
            </button>
          </div>
        )}

        <div style={{ position: 'absolute', bottom: '8px', left: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 100 }}>
          <button
            onClick={() => handlePageChange('storedCards')}
            disabled={tabAware.isGeneratingCard}
            className="nav-button"
            style={{
              backgroundColor: currentPage === 'storedCards' ? '#EFF6FF' : '#F9FAFB',
              border: `1px solid ${currentPage === 'storedCards' ? '#BFDBFE' : '#E5E7EB'}`,
              cursor: tabAware.isGeneratingCard ? 'not-allowed' : 'pointer', padding: '10px 14px',
              color: tabAware.isGeneratingCard ? '#9CA3AF' : (currentPage === 'storedCards' ? '#2563EB' : '#6B7280'),
              borderRadius: '10px', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', flex: 1, gap: '3px', fontSize: '11px',
              fontWeight: currentPage === 'storedCards' ? 600 : 500,
              boxShadow: currentPage === 'storedCards' ? '0 2px 4px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
              position: 'relative', opacity: tabAware.isGeneratingCard ? 0.6 : 1
            }}
            title={tabAware.isGeneratingCard ? "Please wait while card is being generated" : "View your saved cards"}
          >
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <FaList size={16} />
              {unsavedCardsCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-6px', right: '-8px', backgroundColor: '#EF4444', color: 'white',
                  borderRadius: '10px', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', minWidth: '16px', height: '16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                }}>
                  {unsavedCardsCount > 99 ? '99+' : unsavedCardsCount}
                </span>
              )}
            </div>
            <span>Cards</span>
          </button>

          <button
            onClick={() => handlePageChange('settings')}
            disabled={tabAware.isGeneratingCard}
            className="nav-button"
            style={{
              backgroundColor: currentPage === 'settings' ? '#EFF6FF' : '#F9FAFB',
              border: `1px solid ${currentPage === 'settings' ? '#BFDBFE' : '#E5E7EB'}`,
              cursor: tabAware.isGeneratingCard ? 'not-allowed' : 'pointer', padding: '10px 14px',
              color: tabAware.isGeneratingCard ? '#9CA3AF' : (currentPage === 'settings' ? '#2563EB' : '#6B7280'),
              borderRadius: '10px', transition: 'all 0.2s ease', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', flex: 1, gap: '3px', fontSize: '11px', fontWeight: currentPage === 'settings' ? 600 : 500,
              boxShadow: currentPage === 'settings' ? '0 2px 4px rgba(37, 99, 235, 0.1)' : '0 1px 2px rgba(0, 0, 0, 0.05)',
              opacity: tabAware.isGeneratingCard ? 0.6 : 1
            }}
            title={tabAware.isGeneratingCard ? "Please wait while card is being generated" : "App settings and API configuration"}
          >
            <FaCog size={16} />
            <span>Settings</span>
          </button>
        </div>

        {isFloating && (
          <div
            onMouseDown={onResizeStart}
            title="Drag to resize"
            style={{
              position: 'absolute', width: 16, height: 16, right: 6, bottom: 6, cursor: 'nwse-resize',
              borderRadius: 4, background: 'linear-gradient(135deg, rgba(203,213,225,0.9), rgba(148,163,184,0.9))',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)', zIndex: 220
            }}
          />
        )}
      </>
    );
  };

  const containerStyle: React.CSSProperties = isFloating ? {
    backgroundColor: '#ffffff',
    position: 'fixed',
    left: floatPos.x,
    top: floatPos.y,
    width: floatSize.width,
    height: floatSize.height,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 2147483646,
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 1px 0 rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.06)'
  } : {
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
  };

  return (
    <>
      {/* якорь для обнаружения исходного сайдбар-хоста */}
      <div ref={anchorRef} data-anki-app-anchor style={{ display: 'none' }} />

      {isFloating
        ? createPortal(
          <div className="App" style={containerStyle}>
            <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {renderHeaderButtons()}
              <header className="App-header" style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', marginTop: '0px', height: '100%', overflow: 'auto' }}>
                {renderMainContent()}
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 9999, maxWidth: '300px', width: 'auto', pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}>
                    <GlobalNotifications />
                  </div>
                </div>
              </header>
            </div>
          </div>,
          ensureFloatingRoot()
        )
        : (
          <div className="App" style={containerStyle}>
            <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {renderHeaderButtons()}
              <header className="App-header" style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', marginTop: '0px', height: '100%', overflow: 'auto' }}>
                {renderMainContent()}
                <div style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 9999, maxWidth: '300px', width: 'auto', pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}>
                    <GlobalNotifications />
                  </div>
                </div>
              </header>
            </div>
          </div>
        )}
    </>
  );
};

function App({ tabId }: AppProps) {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(setCurrentTabId(tabId));
    setSidebarHostVisible(true);
    forceRemoveSidebarGap(false);
  }, [dispatch, tabId]);

  return (
    <TabAwareProvider tabId={tabId}>
      <AppContent tabId={tabId} />
    </TabAwareProvider>
  );
}

export default App;
