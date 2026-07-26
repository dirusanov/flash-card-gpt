import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { FaPlus, FaCheck, FaChevronRight, FaSyncAlt, FaDesktop, FaExclamationTriangle, FaTimes } from 'react-icons/fa';
import { RootState } from '../../store';
import { DEFAULT_DECK_NAME } from '../../services/cardsSyncService';
import { fetchDecks } from '../../services/ankiService';
import { setSelectedBackendDeckId, setSelectedAnkiDeckName } from '../../store/actions/settings';
import { setAnkiAvailability } from '../../store/actions/anki';
import { createVaultoDeck, syncVaultoDecksWithServer } from '../../store/actions/vaultoDecks';
import { useTabAware } from '../TabAwareProvider';
import brandLogo from '../../assets/img/vaulto-cards-logo.png';

interface DeckSelectorProps {
    onBackendDeckChange?: (id: string | null) => void;
    onAnkiDeckChange?: (name: string | null) => void;
    initialBackendDeckId?: string | null;
    initialAnkiDeckName?: string | null;
}

// A deck is picked from a list of real, tappable rows rather than a native <select>:
// you see every deck and which one is active without opening anything.
const DeckRow: React.FC<{
    label: string;
    hint?: string;
    selected: boolean;
    onSelect: () => void;
    muted?: boolean;
}> = ({ label, hint, selected, onSelect, muted }) => (
    <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className={[
            'flex w-full items-center gap-2.5 rounded-control border px-2.5 py-2 text-left transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            selected
                ? 'border-accent-border bg-accent-subtle'
                : 'border-transparent hover:bg-surface-sunken',
        ].join(' ')}
    >
        <span
            className={[
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-accent bg-accent text-white' : 'border-line-strong bg-white',
            ].join(' ')}
        >
            {selected && <FaCheck size={8} />}
        </span>
        <span
            className={`min-w-0 flex-1 truncate text-[13px] ${
                selected ? 'font-semibold text-gray-900' : muted ? 'text-gray-500' : 'text-gray-700'
            }`}
        >
            {label}
        </span>
        {hint && (
            <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {hint}
            </span>
        )}
    </button>
);

const SectionShell: React.FC<{
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    action?: React.ReactNode;
    tone?: 'primary' | 'muted';
    children: React.ReactNode;
}> = ({ icon, title, subtitle, action, tone = 'primary', children }) => (
    <section
        className={`rounded-card border p-3 ${
            tone === 'primary' ? 'border-line bg-white shadow-control' : 'border-line bg-surface-muted'
        }`}
    >
        <div className="mb-2.5 flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight text-gray-900">{title}</div>
                <p className="m-0 mt-0.5 text-[12px] leading-snug text-gray-500">{subtitle}</p>
            </div>
            {action}
        </div>
        {children}
    </section>
);

const DeckSelector: React.FC<DeckSelectorProps> = ({
    onBackendDeckChange,
    onAnkiDeckChange,
    initialBackendDeckId: propInitialBackendDeckId,
    initialAnkiDeckName: propInitialAnkiDeckName
}) => {
    const dispatch = useDispatch<any>();
    const tabAware = useTabAware();
    const auth = useSelector((state: RootState) => state.auth);
    const settings = useSelector((state: RootState) => state.settings);
    const { useAnkiConnect } = settings;
    // Local-first: this list already merges local-only decks with anything synced from
    // Vaulto Cloud (see store/actions/vaultoDecks.ts), so it works signed out too.
    const vaultoDecks = useSelector((state: RootState) => state.vaultoDecks.decks);

    // Use either props or Redux state
    const currentBackendDeckId = propInitialBackendDeckId !== undefined ? propInitialBackendDeckId : settings.selectedBackendDeckId;
    const currentAnkiDeckName = propInitialAnkiDeckName !== undefined ? propInitialAnkiDeckName : settings.selectedAnkiDeckName;

    const [ankiDecks, setAnkiDecks] = useState<{ name: string }[]>([]);
    const [loadingBackend, setLoadingBackend] = useState(false);
    const [loadingAnki, setLoadingAnki] = useState(false);

    const [isCreatingBackend, setIsCreatingBackend] = useState(false);
    const [newBackendName, setNewBackendName] = useState('');

    const [backendError, setBackendError] = useState<string | null>(null);
    const [ankiError, setAnkiError] = useState<string | null>(null);

    const isLoggedIn = Boolean(auth.accessToken);
    const brandLogoUrl =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL(brandLogo)
            : brandLogo;

    // A selected deck that no longer exists (deleted elsewhere) must not leave the picker
    // silently pointing at nothing.
    useEffect(() => {
        if (currentBackendDeckId && !vaultoDecks.find((d) => d.id === currentBackendDeckId)) {
            if (onBackendDeckChange) {
                onBackendDeckChange(null);
            } else {
                dispatch(setSelectedBackendDeckId(null));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vaultoDecks]);

    useEffect(() => {
        if (useAnkiConnect) {
            loadAnkiDecks();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [useAnkiConnect, settings.ankiConnectUrl, settings.ankiConnectApiKey]);

    const refreshBackendDecks = async () => {
        setLoadingBackend(true);
        setBackendError(null);
        try {
            await dispatch(syncVaultoDecksWithServer());
        } catch (err: any) {
            setBackendError(err?.message || 'Failed to load decks');
        } finally {
            setLoadingBackend(false);
        }
    };

    const loadAnkiDecks = async () => {
        setLoadingAnki(true);
        setAnkiError(null);
        try {
            const resp = await fetchDecks(settings.ankiConnectUrl, settings.ankiConnectApiKey);
            if (resp.error) {
                setAnkiDecks([]);
                setAnkiError(resp.error);
                // Keep the global flag honest: other screens (and the destination summary)
                // decide whether to offer Anki at all based on it.
                dispatch(setAnkiAvailability(false));
            } else {
                const result = resp.result;
                if (Array.isArray(result)) {
                    const deckObjects = result.map(d => typeof d === 'string' ? { name: d } : d);
                    setAnkiDecks(deckObjects);
                }
                dispatch(setAnkiAvailability(true));
            }
        } catch (err: any) {
            setAnkiDecks([]);
            setAnkiError('AnkiConnect unreachable');
            dispatch(setAnkiAvailability(false));
        } finally {
            setLoadingAnki(false);
        }
    };

    const handleBackendSelect = (id: string | null) => {
        if (onBackendDeckChange) {
            onBackendDeckChange(id);
            return;
        }
        const deck = id ? vaultoDecks.find((item) => item.id === id) : null;
        dispatch(setSelectedBackendDeckId(deck ? { id: deck.id, name: deck.name } : null));
    };

    // Picking an Anki deck used to silently create a matching cloud deck behind your back,
    // which is where half the unexplained decks came from. The two destinations are now
    // independent: you choose where cards live yourself.
    const handleAnkiSelect = (name: string | null) => {
        if (onAnkiDeckChange) {
            onAnkiDeckChange(name);
        } else {
            dispatch(setSelectedAnkiDeckName(name));
        }
    };

    // "Vaulto Cards" is reserved for cards without an explicit deck (see cardMatchesDeck
    // in StoredCards.tsx, which finds "the" default deck by this exact name) — a second
    // deck sharing it would make that lookup ambiguous.
    const newBackendNameClashesWithDefault =
        newBackendName.trim().toLowerCase() === DEFAULT_DECK_NAME.toLowerCase();

    // Works signed out too: the deck exists locally immediately and, when signed in, is
    // pushed to Vaulto Cloud in the background (see createVaultoDeck).
    const createBackendDeck = async () => {
        if (!newBackendName.trim() || newBackendNameClashesWithDefault) return;
        setLoadingBackend(true);
        try {
            const newDeck = await dispatch(createVaultoDeck(newBackendName.trim()));
            if (onBackendDeckChange) {
                onBackendDeckChange(newDeck.id);
            } else {
                dispatch(setSelectedBackendDeckId({ id: newDeck.id, name: newDeck.name }));
            }
            setNewBackendName('');
            setIsCreatingBackend(false);
        } catch (err: any) {
            setBackendError(err.message || 'Failed to create deck');
        } finally {
            setLoadingBackend(false);
        }
    };

    const refreshButton = (onClick: () => void, spinning: boolean, label: string) => (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="shrink-0 rounded-control p-1.5 text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
            <FaSyncAlt size={10} className={spinning ? 'animate-spin' : ''} />
        </button>
    );

    // The default deck is represented by the "no explicit choice" row, so listing the
    // server-side copy again would show the same deck twice.
    const customDecks = vaultoDecks.filter((deck) => deck.name !== DEFAULT_DECK_NAME);

    return (
        <div className="flex flex-col gap-3">
            {/* ── Vaulto Cloud — where the card lives ─────────────────────────── */}
            <SectionShell
                icon={
                    <img
                        src={brandLogoUrl}
                        alt=""
                        className="h-7 w-7 rounded-control border border-line bg-white object-contain p-0.5"
                    />
                }
                title="Vaulto"
                subtitle={isLoggedIn ? "Saved here automatically and synced to your phone." : "Saved on this device. Sign in to back it up and sync to your phone."}
                action={isLoggedIn ? refreshButton(refreshBackendDecks, loadingBackend, 'Refresh decks') : undefined}
            >
                <div className="flex flex-col gap-0.5">
                    <DeckRow
                        label={DEFAULT_DECK_NAME}
                        hint="Default"
                        selected={!currentBackendDeckId}
                        onSelect={() => handleBackendSelect(null)}
                    />
                    {customDecks.map((deck) => (
                        <DeckRow
                            key={deck.id}
                            label={deck.name}
                            selected={currentBackendDeckId === deck.id}
                            onSelect={() => handleBackendSelect(deck.id)}
                        />
                    ))}

                    {isCreatingBackend ? (
                        <div className="mt-1.5 flex items-center gap-1.5">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Deck name…"
                                value={newBackendName}
                                onChange={(e) => setNewBackendName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') createBackendDeck();
                                    if (e.key === 'Escape') { setIsCreatingBackend(false); setNewBackendName(''); }
                                }}
                                className="h-8 min-w-0 flex-1 rounded-control border border-accent bg-white px-2.5 text-[13px] text-gray-900 outline-none ring-2 ring-accent"
                            />
                            <button
                                type="button"
                                onClick={createBackendDeck}
                                disabled={!newBackendName.trim() || newBackendNameClashesWithDefault || loadingBackend}
                                aria-label="Create deck"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-gray-400"
                            >
                                <FaCheck size={11} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsCreatingBackend(false); setNewBackendName(''); }}
                                aria-label="Cancel"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600"
                            >
                                <FaTimes size={11} />
                            </button>
                        </div>
                    ) : null}

                    {isCreatingBackend && newBackendNameClashesWithDefault && (
                        <p className="m-0 mt-1 px-1 text-[11px] leading-snug text-warn-strong">
                            “{DEFAULT_DECK_NAME}” is reserved for cards without a deck.
                        </p>
                    )}

                    {!isCreatingBackend && (
                        <button
                            type="button"
                            onClick={() => setIsCreatingBackend(true)}
                            className="mt-1 flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px] font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                <FaPlus size={10} />
                            </span>
                            New deck
                        </button>
                    )}

                    {!isLoggedIn && (
                        <button
                            type="button"
                            onClick={() => tabAware.setCurrentPage('auth')}
                            className="mt-1.5 flex w-full items-center gap-2.5 rounded-control border border-accent-border bg-accent-subtle px-3 py-2 text-left transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <span className="min-w-0 flex-1 text-[12px] font-semibold text-gray-900">
                                Sign in so your cards and decks aren&apos;t lost
                            </span>
                            <FaChevronRight size={10} className="shrink-0 text-accent" />
                        </button>
                    )}
                </div>

                {backendError && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-danger-strong">
                        <FaExclamationTriangle size={10} />
                        {backendError}
                    </div>
                )}
            </SectionShell>

            {/* ── Anki — an optional export target ────────────────────────────── */}
            <SectionShell
                tone="muted"
                icon={
                    <span className="flex h-7 w-7 items-center justify-center rounded-control border border-line bg-white text-gray-400">
                        <FaDesktop size={12} />
                    </span>
                }
                title="Anki"
                subtitle="Optional. Where a copy goes when you export."
                action={useAnkiConnect ? refreshButton(loadAnkiDecks, loadingAnki, 'Refresh Anki decks') : undefined}
            >
                {useAnkiConnect ? (
                    <div className="flex flex-col gap-0.5">
                        <DeckRow
                            label="Don't export"
                            muted
                            selected={!currentAnkiDeckName}
                            onSelect={() => handleAnkiSelect(null)}
                        />
                        {/* A deck picked while Anki was running would otherwise vanish from
                            the list once Anki goes away, leaving nothing selected and the
                            stale choice invisible. Show it, flagged as offline. */}
                        {currentAnkiDeckName && !ankiDecks.some((d) => d.name === currentAnkiDeckName) && (
                            <DeckRow
                                label={currentAnkiDeckName}
                                hint="Offline"
                                selected
                                onSelect={() => handleAnkiSelect(currentAnkiDeckName)}
                            />
                        )}
                        {ankiDecks.map((deck) => (
                            <DeckRow
                                key={deck.name}
                                label={deck.name}
                                selected={currentAnkiDeckName === deck.name}
                                onSelect={() => handleAnkiSelect(deck.name)}
                            />
                        ))}
                        {ankiError && (
                            <div className="mt-1.5 rounded-control border border-warn-border bg-warn-subtle px-2.5 py-1.5 text-[11px] leading-snug text-warn-strong">
                                Anki isn&apos;t responding. Check it&apos;s running with the AnkiConnect add-on.
                            </div>
                        )}
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => tabAware.setCurrentPage('settings')}
                        className="flex w-full items-center justify-center gap-1.5 rounded-control border border-line bg-white px-3 py-2 text-[12px] text-gray-500 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        Turn on Anki in Settings
                        <FaChevronRight size={9} className="shrink-0 text-gray-400" />
                    </button>
                )}
            </SectionShell>
        </div>
    );
};

export default DeckSelector;
