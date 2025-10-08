import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from './store';
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
import { selectPreferredMode, selectVisible, selectFloatGeometry } from './store/reducers/view';
import { hydrateView, setPreferredMode, setVisible, setFloatGeometry } from './store/actions/view';

interface AppProps { tabId: number; }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const DEFAULT_FLOAT = { width: 360, height: 660, x: 24, y: 24 };
const MAX_FLOAT_WIDTH = DEFAULT_FLOAT.width + 48; // allow only slight horizontal growth (~1 cm)

const DRAG_BAR_H = 32;                 // высота зоны перетаскивания
const SAFE_TOP = DRAG_BAR_H + 8;       // общий внутренний верхний отступ в float
const FLOAT_Z = 2147483646;            // z-index окна
const ensureFloatingRoot = () => {
  const id = 'anki-floating-root';
  let el = document.getElementById(id);
  if (!el) { el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
  return el;
};

const forceRemoveSidebarGap = (enable: boolean) => {
  const STYLE_ID = 'anki-float-reset-gap';
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (enable) {
    if (!tag) {
      tag = document.createElement('style'); tag.id = STYLE_ID;
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
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [viewHydrated, setViewHydrated] = useState(false);
  const dispatch = useDispatch();
  const ankiConnectApiKey = useSelector((s: RootState) => s.settings.ankiConnectApiKey);

  const [isFloating, setIsFloating] = useState<boolean>(false);
  const [floatPos, setFloatPos] = useState({ x: DEFAULT_FLOAT.x, y: DEFAULT_FLOAT.y });
  const [floatSize, setFloatSize] = useState({ width: DEFAULT_FLOAT.width, height: DEFAULT_FLOAT.height });
  const draggingRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const resizingRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const uiStateKey = useCallback(() => `anki_ui_tab_${tabId}`, [tabId]);

  const updateUiState = useCallback((patch: Partial<{ sidebarVisible: boolean; floatingVisible: boolean; preferredMode: 'sidebar' | 'floating' }>) => {
    try {
      const key = uiStateKey();
      chrome.storage?.local.get([key], (res) => {
        const current = res?.[key] ?? { sidebarVisible: false, floatingVisible: false, preferredMode: 'sidebar' };
        const next = { ...current, ...patch };
        try {
          chrome.storage?.local.set({ [key]: next });
        } catch {}
      });
    } catch {}
  }, [uiStateKey]);

  const setSidebarDomVisible = useCallback((visible: boolean) => {
    try {
      const sidebarEl = document.getElementById('sidebar') as HTMLElement | null;
      if (sidebarEl) {
        sidebarEl.style.transform = visible ? 'translateX(0)' : 'translateX(100%)';
        sidebarEl.style.display = visible ? '' : 'none';
      }
      if (!visible) {
        document.body.style.marginRight = '0';
      } else {
        document.body.style.marginRight = '350px';
      }
    } catch {}
  }, []);

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

  useEffect(() => {
    const init = async () => {
      try {
        dispatch(loadStoredCards());
        try {
          const decks = await fetchDecks(ankiConnectApiKey);
          if ((decks as any).error) dispatch(setAnkiAvailability(false));
          else {
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

  useEffect(() => {
    dispatch<any>(hydrateView()).finally(() => setViewHydrated(true));
  }, [dispatch]);

// брать режим/видимость из Redux
  const preferredMode = useSelector((s: RootState) => selectPreferredMode(s as any, tabId));
  const preferredVisible = useSelector((s: RootState) => selectVisible(s as any, tabId));
  const storedGeometry = useSelector((s: RootState) => selectFloatGeometry(s as any, tabId));

  const ensureInitialFloatPlacement = useCallback(() => {
    if (storedGeometry) return;
    try {
      const width = DEFAULT_FLOAT.width;
      const height = Math.min(DEFAULT_FLOAT.height, Math.max(340, window.innerHeight - 48));
      const x = Math.max(8, window.innerWidth - width - 24);
      const y = Math.max(8, Math.min(DEFAULT_FLOAT.y, window.innerHeight - height - 8));
      setFloatPos({ x, y });
      setFloatSize({ width, height });
    } catch {}
  }, [storedGeometry]);

// локальный isFloating синхронизируем с Redux режимом/видимостью
  useEffect(() => {
    const shouldFloat = preferredMode === 'float';
    const shouldBeVisible = preferredVisible !== false;
    setIsFloating(shouldFloat && shouldBeVisible);
  }, [preferredMode, preferredVisible]);

  useEffect(() => {
    if (!viewHydrated) return;
    if (preferredMode === 'float') {
      updateUiState({ preferredMode: 'floating', floatingVisible: preferredVisible !== false, sidebarVisible: false });
      if (preferredVisible !== false) setSidebarDomVisible(false);
    } else {
      updateUiState({ preferredMode: 'sidebar', floatingVisible: false, sidebarVisible: preferredVisible !== false });
      setSidebarDomVisible(preferredVisible !== false);
    }
  }, [preferredMode, preferredVisible, viewHydrated, updateUiState, setSidebarDomVisible]);

  useEffect(() => {
    if (!storedGeometry) {
      ensureInitialFloatPlacement();
      return;
    }
    const { x, y, width, height } = storedGeometry;
    setFloatPos((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
    setFloatSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, [storedGeometry, ensureInitialFloatPlacement]);


  const hideFloatingWindow = useCallback(() => {
    dispatch<any>(setVisible(tabId, false));
    setIsFloating(false);
    updateUiState({ preferredMode: 'floating', floatingVisible: false, sidebarVisible: false });
    setSidebarDomVisible(false);
    const floatRoot = document.getElementById('anki-floating-root');
    if (floatRoot) floatRoot.remove();
    try { (disablePageSelection as any)?.(false); } catch {}
  }, [dispatch, tabId, updateUiState, setSidebarDomVisible]);

  const handleCloseExtension = useCallback(() => {
    if (isFloating) {
      hideFloatingWindow();
      return;
    }

    // сайдбар скрываем
    dispatch<any>(setPreferredMode(tabId, 'sidebar'));
    dispatch<any>(setVisible(tabId, false));
    dispatch(toggleSidebar(tabId));
    updateUiState({ preferredMode: 'sidebar', floatingVisible: false, sidebarVisible: false });
    try { chrome.runtime.sendMessage({ action: 'toggleSidebar', tabId }); } catch {}
  }, [dispatch, tabId, isFloating, updateUiState, hideFloatingWindow]);

  const enableFloating = useCallback(() => {
    ensureInitialFloatPlacement();
    dispatch<any>(setPreferredMode(tabId, 'float'));
    dispatch<any>(setVisible(tabId, true));
    setIsFloating(true);
    forceRemoveSidebarGap(true);
    updateUiState({ preferredMode: 'floating', floatingVisible: true, sidebarVisible: false });
    setSidebarDomVisible(false);
  }, [dispatch, tabId, updateUiState, setSidebarDomVisible, ensureInitialFloatPlacement]);

  const disableFloating = useCallback(() => {
    dispatch<any>(setPreferredMode(tabId, 'sidebar'));
    dispatch<any>(setVisible(tabId, true));
    setIsFloating(false);
    forceRemoveSidebarGap(false);
    updateUiState({ preferredMode: 'sidebar', floatingVisible: false, sidebarVisible: true });
    setSidebarDomVisible(true);
    const host = document.querySelector('#sidebar') as HTMLElement | null;
    if (host) {
      host.removeAttribute('hidden');
      host.style.removeProperty('display');
      host.style.removeProperty('visibility');
      host.style.removeProperty('opacity');
    }
    const floatRoot = document.getElementById('anki-floating-root');
    if (floatRoot && floatRoot.childElementCount === 0) floatRoot.remove();
  }, [dispatch, tabId, updateUiState, setSidebarDomVisible]);


  const toggleFloating = useCallback(() => {
    setIsFloating((prev) => {
      const next = !prev;
      const nextMode = next ? 'float' : 'sidebar';
      dispatch<any>(setPreferredMode(tabId, nextMode));
      dispatch<any>(setVisible(tabId, true));
      if (next) {
        ensureInitialFloatPlacement();
        forceRemoveSidebarGap(true);
        setSidebarHostVisible(false);
        updateUiState({ preferredMode: 'floating', floatingVisible: true, sidebarVisible: false });
        setSidebarDomVisible(false);
      } else {
        forceRemoveSidebarGap(false);
        setSidebarHostVisible(true);
        hardShowSidebarHost();
        updateUiState({ preferredMode: 'sidebar', floatingVisible: false, sidebarVisible: true });
        setSidebarDomVisible(true);
      }
      return next;
    });
  }, [dispatch, tabId, updateUiState, setSidebarDomVisible, ensureInitialFloatPlacement]);

  useEffect(() => {
    const onMessage = (msg: any, _sender: chrome.runtime.MessageSender, sendResponse?: (r?: any) => void) => {
      if (!msg?.action) return;
      if (msg.action === 'toggleFloating') { toggleFloating(); sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'showFloating')   { enableFloating();  sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'hideFloating')   { hideFloatingWindow(); sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'collapseSidebar'){ enableFloating();  sendResponse?.({ ok: true }); return true; }
      if (msg.action === 'expandSidebar')  { disableFloating(); sendResponse?.({ ok: true }); return true; }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [toggleFloating, enableFloating, disableFloating, hideFloatingWindow]);

  // drag
  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFloating) return;
    e.preventDefault(); disablePageSelection(true);
    const startX = e.clientX, startY = e.clientY;
    draggingRef.current = { offsetX: startX - floatPos.x, offsetY: startY - floatPos.y };
    window.addEventListener('mousemove', onDragMove); window.addEventListener('mouseup', onDragEnd);
  };
  const onDragEnd = () => {
    draggingRef.current = null;
    window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd);
    disablePageSelection(false);
  };
  const onDragMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    const { innerWidth, innerHeight } = window;
    const x = clamp(e.clientX - draggingRef.current.offsetX, 8, innerWidth - floatSize.width - 8);
    const y = clamp(e.clientY - draggingRef.current.offsetY, 8, innerHeight - floatSize.height - 8);
    setFloatPos({ x, y });
  };

  // resize
  const onResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFloating) return; e.preventDefault(); e.stopPropagation(); disablePageSelection(true);
    resizingRef.current = { startX: e.clientX, startY: e.clientY, startW: floatSize.width, startH: floatSize.height };
    window.addEventListener('mousemove', onResizeMove); window.addEventListener('mouseup', onResizeEnd);
  };
  const onResizeEnd = () => {
    resizingRef.current = null;
    window.removeEventListener('mousemove', onResizeMove); window.removeEventListener('mouseup', onResizeEnd);
    disablePageSelection(false);
  };
  const onResizeMove = (e: MouseEvent) => {
    if (!resizingRef.current) return;
    const dx = e.clientX - resizingRef.current.startX;
    const dy = e.clientY - resizingRef.current.startY;
    const newW = clamp(resizingRef.current.startW + dx, 340, Math.min(window.innerWidth - 16, MAX_FLOAT_WIDTH));
    const newH = clamp(resizingRef.current.startH + dy, 340, Math.min(window.innerHeight - 16, 900));
    setFloatSize({ width: newW, height: newH });
  };

  const lastSavedGeometryRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (viewHydrated) {
      lastSavedGeometryRef.current = null;
    }
  }, [viewHydrated]);

  useEffect(() => {
    const geometry = { x: floatPos.x, y: floatPos.y, width: floatSize.width, height: floatSize.height };
    if (!viewHydrated) {
      lastSavedGeometryRef.current = geometry;
      return;
    }
    const prev = lastSavedGeometryRef.current;
    if (prev && prev.x === geometry.x && prev.y === geometry.y && prev.width === geometry.width && prev.height === geometry.height) {
      return;
    }
    lastSavedGeometryRef.current = geometry;
    dispatch<any>(setFloatGeometry(tabId, geometry));
  }, [dispatch, tabId, floatPos, floatSize, storedGeometry, viewHydrated]);

  const handlePageChange = useCallback((page: string) => setCurrentPage(page), [setCurrentPage]);

  // Контент страниц (без safeTop — он теперь у контейнера header)
  const renderMainContent = () => {
    const topPadding = currentPage !== 'createCard' ? '46px' : '12px';
    const bottomPadding = '58px';
    const horizontalPadding = isFloating ? '12px' : '0px';
    const baseStyle: React.CSSProperties = {
      width: '100%', height: '100%', paddingTop: topPadding, paddingBottom: bottomPadding,
      paddingLeft: horizontalPadding, paddingRight: horizontalPadding,
      overflowY: 'auto', overflowX: 'hidden', opacity: 1, transform: 'translateX(0)', transition: 'all 0.3s ease-in-out',
      boxSizing: 'border-box'
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
            width: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', height: '100%', position: 'relative',
            paddingTop: topPadding, paddingBottom: bottomPadding, paddingLeft: horizontalPadding, paddingRight: horizontalPadding,
            opacity: 1, transform: 'translateX(0)', transition: 'all 0.3s ease-in-out', boxSizing: 'border-box'
          }}>
            <CreateCard />
          </div>
        );
    }
  };

  // Шапка (кнопки + хэндл)
  const renderHeaderButtons = () => {
    const unsavedCardsCount = tabAware.storedCards.filter(c => c.exportStatus === 'not_exported').length;
    return (
      <>
        {isFloating && (
          <>
            {/* Визуальная панель */}
            <div
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: DRAG_BAR_H,
                pointerEvents: 'none',
                background: 'linear-gradient(to right, rgba(243,244,246,0.96), rgba(255,255,255,0.84))',
                borderTopLeftRadius: 12, borderTopRightRadius: 12,
                borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: FLOAT_Z + 0
              }}
            />
            {/* Ловец drag (оставляем справа место под кнопки) */}
            <div
              onMouseDown={onDragStart}
              style={{ position: 'absolute', top: 0, left: 0, right: 96, height: DRAG_BAR_H, cursor: 'move', zIndex: FLOAT_Z + 1 }}
              title="Drag to move"
            />
          </>
        )}

        {/* Close */}
        <button
          onClick={handleCloseExtension}
          style={{
            position: 'absolute', top: '6px', right: '12px', background: 'transparent', border: 'none',
            cursor: 'pointer', padding: '6px', color: '#6B7280', borderRadius: 5, width: 28, height: 28, zIndex: FLOAT_Z + 2
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; e.currentTarget.style.color = '#EF4444'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
          title="Close extension"
        >
          <FaTimes size={14} />
        </button>

        {/* Toggle float/dock */}
        <button
          onClick={toggleFloating}
          style={{
            position: 'absolute', top: '6px', right: '46px', background: 'transparent', border: 'none',
            cursor: 'pointer', padding: '6px', color: '#6B7280', borderRadius: 5, width: 28, height: 28, zIndex: FLOAT_Z + 2
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#F3F4F6'; e.currentTarget.style.color = '#111827'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#6B7280'; }}
          title={isFloating ? 'Dock to sidebar' : 'Make window floating'}
        >
          {isFloating ? <FaColumns size={14} /> : <FaExpandArrowsAlt size={14} />}
        </button>

        {/* New Card (когда не на createCard) */}
        {currentPage !== 'createCard' && (
          <div
            style={{
              position: 'absolute',
              top: isFloating ? `${DRAG_BAR_H + 8}px` : '6px',
              left: '12px',
              right: '80px',
              zIndex: FLOAT_Z + 2
            }}
          >
            <button
              onClick={() => handlePageChange('createCard')}
              style={{
                backgroundColor: '#2563EB',
                border: 'none',
                cursor: 'pointer',
                padding: '8px 14px',
                color: '#fff',
                borderRadius: 8,
                width: '100%',
                minHeight: 36,
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                lineHeight: 1.1,
                boxShadow: '0 1px 3px rgba(37,99,235,0.2)',
                transition: 'all .2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#1D4ED8'; e.currentTarget.style.transform = 'translateY(-0.5px)'; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#2563EB'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <FaPlus size={14} style={{ transform: 'translateY(-0.5px)' }} />
              <span style={{ transform: 'translateY(-0.5px)' }}>New Card</span>
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

        {/* Ручка ресайза */}
        {isFloating && (
          <div
            onMouseDown={onResizeStart}
            title="Drag to resize"
            style={{
              position: 'absolute', width: 16, height: 16, right: 6, bottom: 6, cursor: 'nwse-resize',
              borderRadius: 4, background: 'linear-gradient(135deg, rgba(203,213,225,.9), rgba(148,163,184,.9))',
              boxShadow: '0 1px 2px rgba(0,0,0,.08)', zIndex: FLOAT_Z + 2
            }}
          />
        )}
      </>
    );
  };

  // Блокировка выделения/drag страницы на время перетаскивания/ресайза
  const disablePageSelection = (on: boolean) => {
    const STYLE_ID = 'anki-disable-user-select';
    const OVERLAY_ID = 'anki-drag-overlay';
    let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    const anyFn = disablePageSelection as any;

    if (on) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ID;
        styleEl.textContent = `
          html, body, * { user-select: none !important; -webkit-user-select: none !important; }
          body { cursor: grabbing !important; }
        `;
        document.head.appendChild(styleEl);
      }
      if (!document.getElementById(OVERLAY_ID)) {
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = String(FLOAT_Z - 1);
        overlay.style.cursor = 'grabbing';
        overlay.style.background = 'transparent';
        document.body.appendChild(overlay);
      }
      const prevent = (e: Event) => e.preventDefault();
      anyFn._preventHandler = prevent;
      document.addEventListener('selectstart', prevent, true);
      document.addEventListener('dragstart', prevent, true);
    } else {
      if (styleEl) styleEl.remove();
      const overlay = document.getElementById(OVERLAY_ID); if (overlay) overlay.remove();
      const prevent = anyFn._preventHandler as ((e: Event) => void) | undefined;
      if (prevent) {
        document.removeEventListener('selectstart', prevent, true);
        document.removeEventListener('dragstart', prevent, true);
        anyFn._preventHandler = undefined;
      }
      try { window.getSelection()?.removeAllRanges?.(); } catch {}
    }
  };

  const containerStyle: React.CSSProperties = isFloating
    ? {
      backgroundColor: '#ffffff',
      position: 'fixed',
      left: floatPos.x,
      top: floatPos.y,
      width: floatSize.width,
      height: floatSize.height,
      display: 'flex',
      flexDirection: 'column',
      zIndex: FLOAT_Z,
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 1px 0 rgba(0,0,0,0.08)',
      border: '1px solid rgba(0,0,0,0.06)'
    }
    : {
      backgroundColor: '#ffffff',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'absolute',
      right: 0,
      top: 0,
      width: '350px',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif',
      boxShadow: '0 0 0 1px rgba(0,0,0,0.05), 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)'
    };

  // Общий контейнер-контент с паддингом под хэндл (теперь именно здесь)
  const headerInnerStyle: React.CSSProperties = {
    width: '100%',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    marginTop: 0,
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    boxSizing: 'border-box',
    paddingTop: isFloating ? SAFE_TOP : 0,
    paddingRight: isFloating ? 12 : 0,
    paddingLeft: isFloating ? 8 : 0,
    scrollPaddingTop: isFloating ? SAFE_TOP : 0
  } as React.CSSProperties;

  return (
    <>
      <div ref={anchorRef} data-anki-app-anchor style={{ display: 'none' }} />

      {isFloating
        ? createPortal(
          <div className="App" style={containerStyle}>
            <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              {renderHeaderButtons()}
              <header className="App-header" style={headerInnerStyle}>
                {renderMainContent()}
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: FLOAT_Z + 2, maxWidth: 300, width: 'auto', pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}><GlobalNotifications /></div>
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
              <header className="App-header" style={headerInnerStyle}>
                {renderMainContent()}
                <div style={{ position: 'absolute', top: 16, right: 16, zIndex: FLOAT_Z + 2, maxWidth: 300, width: 'auto', pointerEvents: 'none' }}>
                  <div style={{ pointerEvents: 'auto' }}><GlobalNotifications /></div>
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
