import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { FaPlus, FaChevronDown, FaSyncAlt, FaCloud, FaDesktop, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import { RootState } from '../../store';
import { cardsSyncApi, DeckApi } from '../../services/cardsSyncApi';
import { fetchDecks } from '../../services/ankiService';
import { setSelectedBackendDeckId, setSelectedAnkiDeckName } from '../../store/actions/settings';
import { useAuthenticatedRequest } from '../../hooks/useAuthenticatedRequest';

interface DeckSelectorProps {
    onBackendDeckChange?: (id: string | null) => void;
    onAnkiDeckChange?: (name: string | null) => void;
    initialBackendDeckId?: string | null;
    initialAnkiDeckName?: string | null;
}

const DeckSelector: React.FC<DeckSelectorProps> = ({
    onBackendDeckChange,
    onAnkiDeckChange,
    initialBackendDeckId: propInitialBackendDeckId,
    initialAnkiDeckName: propInitialAnkiDeckName
}) => {
    const dispatch = useDispatch();
    const auth = useSelector((state: RootState) => state.auth);
    const settings = useSelector((state: RootState) => state.settings);
    const { syncApiUrl, useAnkiConnect } = settings;
    const executeRequest = useAuthenticatedRequest();

    // Use either props or Redux state
    const currentBackendDeckId = propInitialBackendDeckId !== undefined ? propInitialBackendDeckId : settings.selectedBackendDeckId;
    const currentAnkiDeckName = propInitialAnkiDeckName !== undefined ? propInitialAnkiDeckName : settings.selectedAnkiDeckName;

    const [backendDecks, setBackendDecks] = useState<DeckApi[]>([]);
    const [ankiDecks, setAnkiDecks] = useState<{ name: string }[]>([]);
    const [loadingBackend, setLoadingBackend] = useState(false);
    const [loadingAnki, setLoadingAnki] = useState(false);

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
        if (useAnkiConnect) {
            loadAnkiDecks();
        }
    }, [useAnkiConnect, settings.ankiConnectUrl, settings.ankiConnectApiKey]);

    const loadBackendDecks = async () => {
        if (!auth.accessToken) return;
        setLoadingBackend(true);
        setBackendError(null);
        try {
            const decks = await executeRequest((token) => cardsSyncApi.listDecks(syncApiUrl, token));
            setBackendDecks(decks);
            // If we have a selected ID that isn't in the list anymore (except null), reset it
            if (currentBackendDeckId && !decks.find(d => d.id === currentBackendDeckId)) {
                if (onBackendDeckChange) {
                    onBackendDeckChange(null);
                } else {
                    dispatch(setSelectedBackendDeckId(null));
                }
            }
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
                    const deckObjects = result.map(d => typeof d === 'string' ? { name: d } : d);
                    setAnkiDecks(deckObjects);
                }
            }
        } catch (err: any) {
            setAnkiError('AnkiConnect unreachable');
        } finally {
            setLoadingAnki(false);
        }
    };

    const handleBackendSelect = (id: string | null) => {
        if (onBackendDeckChange) {
            onBackendDeckChange(id);
        } else {
            dispatch(setSelectedBackendDeckId(id));
        }
    };

    const handleAnkiSelect = async (name: string | null) => {
        if (onAnkiDeckChange) {
            onAnkiDeckChange(name);
        } else {
            dispatch(setSelectedAnkiDeckName(name));
        }

        // If logged in and auto sync is on, try to match/create a cloud deck with the same name
        if (name && auth.accessToken && settings.autoSaveToServer) {
            try {
                // Check if a cloud deck with this name already exists
                let existingDeck = backendDecks.find(d => d.name.toLowerCase() === name.toLowerCase());

                if (!existingDeck) {
                    // Refresh backend decks just in case
                    const freshDecks = await executeRequest((token) => cardsSyncApi.listDecks(syncApiUrl, token));
                    setBackendDecks(freshDecks);
                    existingDeck = freshDecks.find(d => d.name.toLowerCase() === name.toLowerCase());
                }

                if (existingDeck) {
                    dispatch(setSelectedBackendDeckId(existingDeck.id));
                } else {
                    // Create it on the server
                    setLoadingBackend(true);
                    const newDeck = await executeRequest((token) => cardsSyncApi.createDeck(syncApiUrl, token, {
                        name: name,
                        description: `Mirrored from Anki: ${name}`,
                        color: '#10B981'
                    }));
                    setBackendDecks(prev => [...prev, newDeck]);
                    if (onBackendDeckChange) {
                        onBackendDeckChange(newDeck.id);
                    } else {
                        dispatch(setSelectedBackendDeckId(newDeck.id));
                    }
                    setLoadingBackend(false);
                }
            } catch (err) {
                console.error('Failed to mirror Anki deck to Cloud:', err);
                setLoadingBackend(false);
            }
        }
    };

    const createBackendDeck = async () => {
        if (!newBackendName || !auth.accessToken) return;
        setLoadingBackend(true);
        try {
            const newDeck = await executeRequest((token) => cardsSyncApi.createDeck(syncApiUrl, token, {
                name: newBackendName,
                description: 'Created from extension',
                color: '#3B82F6'
            }));
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

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginTop: '8px',
            marginBottom: '16px',
            padding: '16px',
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
        }}>
            {/* Header with Refresh */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Deck Selection
                </h3>
                <button
                    onClick={() => { auth.accessToken && loadBackendDecks(); useAnkiConnect && loadAnkiDecks(); }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'none',
                        border: 'none',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        color: '#6B7280',
                        fontSize: '11px',
                        fontWeight: '600',
                        borderRadius: '6px',
                        transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                    <FaSyncAlt size={10} className={loadingBackend || loadingAnki ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
                {/* Vaulto Cloud Selection */}
                {auth.accessToken ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <FaCloud size={12} color="#3B82F6" />
                                Vaulto Cloud
                            </label>
                            <button
                                onClick={() => setIsCreatingBackend(!isCreatingBackend)}
                                style={{
                                    fontSize: '11px',
                                    fontWeight: '600',
                                    color: '#2563EB',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                {isCreatingBackend ? 'Cancel' : <><FaPlus size={8} /> New</>}
                            </button>
                        </div>

                        {isCreatingBackend ? (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                width: '100%',
                                animation: 'fadeIn 0.2s ease-out',
                                boxSizing: 'border-box'
                            }}>
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Enter deck name..."
                                    value={newBackendName}
                                    onChange={(e) => setNewBackendName(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && createBackendDeck()}
                                    style={{
                                        width: '100%',
                                        fontSize: '13px',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #2563EB',
                                        outline: 'none',
                                        boxShadow: '0 0 0 2px rgba(37, 99, 235, 0.1)',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <div style={{ display: 'flex', width: '100%' }}>
                                    <button
                                        onClick={createBackendDeck}
                                        disabled={!newBackendName || loadingBackend}
                                        style={{
                                            width: '100%',
                                            padding: '10px 16px',
                                            backgroundColor: '#2563EB',
                                            color: '#ffffff',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            fontWeight: '600',
                                            border: 'none',
                                            cursor: 'pointer',
                                            opacity: (!newBackendName || loadingBackend) ? 0.6 : 1,
                                            boxSizing: 'border-box',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onMouseOver={(e) => !loadingBackend && newBackendName && (e.currentTarget.style.backgroundColor = '#1D4ED8')}
                                        onMouseOut={(e) => !loadingBackend && newBackendName && (e.currentTarget.style.backgroundColor = '#2563EB')}
                                    >
                                        {loadingBackend ? 'Creating...' : 'Create Deck'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <select
                                    value={currentBackendDeckId || ''}
                                    onChange={(e) => handleBackendSelect(e.target.value || null)}
                                    style={{
                                        width: '100%',
                                        backgroundColor: '#F9FAFB',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        fontSize: '13px',
                                        color: '#111827',
                                        outline: 'none',
                                        appearance: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = '#2563EB'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
                                >
                                    <option value="">(None) — Local Storage Only</option>
                                    {backendDecks.map(deck => (
                                        <option key={deck.id} value={deck.id}>{deck.name}</option>
                                    ))}
                                </select>
                                <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9CA3AF' }}>
                                    <FaChevronDown size={10} />
                                </div>
                            </div>
                        )}
                        {backendError && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#DC2626', marginTop: '2px' }}>
                                <FaExclamationTriangle size={10} />
                                {backendError}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ padding: '12px', backgroundColor: '#F3F4F6', borderRadius: '10px', border: '1px dashed #D1D5DB', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: '12px', color: '#6B7280' }}>
                            Sign in to sync decks with Vaulto Cloud.
                        </p>
                    </div>
                )}

                {/* Anki Desktop Selection */}
                {useAnkiConnect && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '700', color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <FaDesktop size={12} color={ankiError ? "#EF4444" : "#10B981"} />
                                Anki Desktop
                            </label>
                            {loadingAnki && <FaSyncAlt size={10} className="animate-spin" color="#9CA3AF" />}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ position: 'relative' }}>
                                <select
                                    value={currentAnkiDeckName || ''}
                                    onChange={(e) => handleAnkiSelect(e.target.value || null)}
                                    style={{
                                        width: '100%',
                                        backgroundColor: '#F9FAFB',
                                        border: '1px solid #E5E7EB',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        fontSize: '13px',
                                        color: '#111827',
                                        outline: 'none',
                                        appearance: 'none',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
                                    }}
                                    onFocus={(e) => e.currentTarget.style.borderColor = '#10B981'}
                                    onBlur={(e) => e.currentTarget.style.borderColor = '#E5E7EB'}
                                >
                                    <option value="">(None) — Local Storage Only</option>
                                    {ankiDecks.map(deck => (
                                        <option key={deck.name} value={deck.name}>{deck.name}</option>
                                    ))}
                                </select>
                                <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#9CA3AF' }}>
                                    <FaChevronDown size={10} />
                                </div>
                            </div>

                        </div>
                        {ankiError && (
                            <div style={{ padding: '8px 10px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '6px', fontSize: '11px', color: '#92400E', marginTop: '4px' }}>
                                Anki Desktop is offline. Falling back to custom deck name.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Empty State / Prompt */}
            {!auth.accessToken && !useAnkiConnect && (
                <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '12px', color: '#64748B', fontStyle: 'italic' }}>
                        Enable Cloud Sync or Anki Integration in settings to manage decks.
                    </p>
                </div>
            )}
        </div>
    );
};

export default DeckSelector;
