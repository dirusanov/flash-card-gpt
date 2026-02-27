import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { FaPlus, FaChevronDown, FaSyncAlt, FaLayerGroup } from 'react-icons/fa';
import { RootState } from '../../store';
import { cardsSyncApi, DeckApi } from '../../services/cardsSyncApi';
import { fetchDecks } from '../../services/ankiService';

interface DeckSelectorProps {
    onBackendDeckChange: (deckId: string | null) => void;
    onAnkiDeckChange: (deckName: string | null) => void;
    initialBackendDeckId?: string | null;
    initialAnkiDeckName?: string | null;
}

const DeckSelector: React.FC<DeckSelectorProps> = ({
    onBackendDeckChange,
    onAnkiDeckChange,
    initialBackendDeckId,
    initialAnkiDeckName
}) => {
    const auth = useSelector((state: RootState) => state.auth);
    const settings = useSelector((state: RootState) => state.settings);
    const syncApiUrl = settings.syncApiUrl;

    const [backendDecks, setBackendDecks] = useState<DeckApi[]>([]);
    const [ankiDecks, setAnkiDecks] = useState<{ name: string }[]>([]);
    const [loadingBackend, setLoadingBackend] = useState(false);
    const [loadingAnki, setLoadingAnki] = useState(false);

    const [selectedBackendId, setSelectedBackendId] = useState<string | null>(initialBackendDeckId || null);
    const [selectedAnkiName, setSelectedAnkiName] = useState<string | null>(initialAnkiDeckName || null);

    const [isCreatingBackend, setIsCreatingBackend] = useState(false);
    const [newBackendName, setNewBackendName] = useState('');

    const [backendError, setBackendError] = useState<string | null>(null);
    const [ankiError, setAnkiError] = useState<string | null>(null);

    useEffect(() => {
        if (auth.accessToken) {
            loadBackendDecks();
        }
    }, [auth.accessToken]);

    useEffect(() => {
        if (settings.useAnkiConnect) {
            loadAnkiDecks();
        }
    }, [settings.useAnkiConnect, settings.ankiConnectUrl, settings.ankiConnectApiKey]);

    const loadBackendDecks = async () => {
        if (!auth.accessToken) return;
        setLoadingBackend(true);
        setBackendError(null);
        try {
            const decks = await cardsSyncApi.listDecks(syncApiUrl, auth.accessToken);
            setBackendDecks(decks);
        } catch (err: any) {
            setBackendError(err.message || 'Failed to load cloud decks');
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
                setAnkiError(resp.error);
            } else {
                const result = resp.result;
                if (Array.isArray(result)) {
                    setAnkiDecks(result.map(d => typeof d === 'string' ? { name: d } : d));
                }
            }
        } catch (err: any) {
            setAnkiError('AnkiConnect unreachable');
        } finally {
            setLoadingAnki(false);
        }
    };

    const handleBackendSelect = (id: string | null) => {
        setSelectedBackendId(id);
        onBackendDeckChange(id);
    };

    const handleAnkiSelect = (name: string | null) => {
        setSelectedAnkiName(name);
        onAnkiDeckChange(name);
    };

    const createBackendDeck = async () => {
        if (!newBackendName || !auth.accessToken) return;
        setLoadingBackend(true);
        try {
            const newDeck = await cardsSyncApi.createDeck(syncApiUrl, auth.accessToken, {
                name: newBackendName,
                description: 'Created from extension',
                color: '#3B82F6'
            });
            setBackendDecks(prev => [...prev, newDeck]);
            handleBackendSelect(newDeck.id);
            setNewBackendName('');
            setIsCreatingBackend(false);
        } catch (err: any) {
            setBackendError(err.message || 'Failed to create deck');
        } finally {
            setLoadingBackend(false);
        }
    };

    const selectStyle = {
        appearance: 'none' as const,
        WebkitAppearance: 'none' as const,
        MozAppearance: 'none' as const,
        backgroundImage: 'none'
    };

    return (
        <div className="flex flex-col gap-3 mt-4 mb-4 pt-4 border-t border-[#eaeaea]">
            <div className="grid grid-cols-1 gap-4">
                {/* Vaulto Cloud Selection */}
                {auth.accessToken && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-[#666] uppercase tracking-wider">
                                Vaulto Cloud
                            </label>
                            <button
                                onClick={() => setIsCreatingBackend(!isCreatingBackend)}
                                className="text-[10px] font-medium text-[#0070f3] hover:underline flex items-center gap-1"
                            >
                                {isCreatingBackend ? 'Cancel' : <><FaPlus size={7} /> New</>}
                            </button>
                        </div>

                        {isCreatingBackend ? (
                            <div className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Deck name..."
                                    value={newBackendName}
                                    onChange={(e) => setNewBackendName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && createBackendDeck()}
                                    className="flex-1 text-xs px-3 py-2 bg-white border border-[#000] rounded-md outline-none"
                                />
                                <button
                                    onClick={createBackendDeck}
                                    disabled={!newBackendName || loadingBackend}
                                    className="px-4 bg-[#000] text-white rounded-md text-xs font-medium hover:bg-[#333] disabled:opacity-50 transition-colors"
                                >
                                    Create
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <select
                                    style={selectStyle}
                                    value={selectedBackendId || ''}
                                    onChange={(e) => handleBackendSelect(e.target.value || null)}
                                    className="w-full bg-white border border-[#eaeaea] rounded-md px-3 py-2 text-xs font-normal text-[#000] outline-none hover:border-[#000] focus:border-[#000] transition-all cursor-pointer"
                                >
                                    <option value="">Vaulto Extension (Default)</option>
                                    {backendDecks.map(deck => (
                                        <option key={deck.id} value={deck.id}>{deck.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#666]">
                                    <FaChevronDown size={8} />
                                </div>
                            </div>
                        )}
                        {backendError && <div className="text-[10px] text-red-500 mt-0.5">{backendError}</div>}
                    </div>
                )}

                {/* Anki Desktop Selection */}
                {settings.useAnkiConnect && (
                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-medium text-[#666] uppercase tracking-wider">
                                Anki Desktop
                            </label>
                            {loadingAnki && <div className="animate-spin text-[#666]"><FaSyncAlt size={8} /></div>}
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="relative">
                                <select
                                    style={selectStyle}
                                    value={selectedAnkiName || ''}
                                    onChange={(e) => handleAnkiSelect(e.target.value || null)}
                                    className="w-full bg-white border border-[#eaeaea] rounded-md px-3 py-2 text-xs font-normal text-[#000] outline-none hover:border-[#000] focus:border-[#000] transition-all cursor-pointer"
                                >
                                    <option value="">Default Deck</option>
                                    {ankiDecks.map(deck => (
                                        <option key={deck.name} value={deck.name}>{deck.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#666]">
                                    <FaChevronDown size={8} />
                                </div>
                            </div>

                            <input
                                type="text"
                                placeholder="Custom Anki deck..."
                                value={selectedAnkiName || ''}
                                onChange={(e) => handleAnkiSelect(e.target.value)}
                                className="w-full text-xs px-3 py-2 bg-transparent border border-[#eaeaea] border-dashed rounded-md outline-none hover:border-[#000] focus:border-[#000] focus:border-solid transition-all placeholder:text-[#999]"
                            />
                        </div>
                        {ankiError && <div className="text-[9px] text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 mt-1">Anki is offline. Using manual deck entry.</div>}
                    </div>
                )}

                {/* Informative message if nothing is enabled */}
                {!auth.accessToken && !settings.useAnkiConnect && (
                    <div className="text-[11px] text-[#666] italic text-center py-2 border border-dashed border-[#eaeaea] rounded-md">
                        Enable Cloud Sync or AnkiConnect to manage decks.
                    </div>
                )}
            </div>

            <div className="flex justify-center">
                <button
                    onClick={() => { auth.accessToken && loadBackendDecks(); settings.useAnkiConnect && loadAnkiDecks(); }}
                    className="flex items-center gap-1.5 text-[10px] text-[#999] hover:text-[#000] transition-colors"
                >
                    <FaSyncAlt size={8} className={loadingBackend || loadingAnki ? 'animate-spin' : ''} />
                    <span>Refresh Decks</span>
                </button>
            </div>
        </div>
    );
};

export default DeckSelector;
