import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from '../store';
import { loadStoredCards, deleteStoredCard, saveAnkiCards, updateCardExportStatus } from '../store/actions/cards';
import { StoredCard, ExportStatus } from '../store/reducers/cards';
import { Modes } from '../constants';
import { FaArrowLeft, FaTrash, FaDownload, FaSync } from 'react-icons/fa';
import { CardLangLearning, CardGeneral, fetchDecks } from '../services/ankiService';
import useErrorNotification from './useErrorHandler';
import { Deck, setDeckId } from '../store/actions/decks';

interface StoredCardsProps {
    onBackClick: () => void;
}

type CardFilterType = 'all' | 'not_exported' | 'exported';

const StoredCards: React.FC<StoredCardsProps> = ({ onBackClick }) => {
    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const { storedCards } = useSelector((state: RootState) => state.cards);
    const deckId = useSelector((state: RootState) => state.deck.deckId);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingDecks, setLoadingDecks] = useState(false);
    const [activeFilter, setActiveFilter] = useState<CardFilterType>('not_exported');
    const [showDeckSelector, setShowDeckSelector] = useState(false);
    const { showError, renderErrorNotification } = useErrorNotification();

    useEffect(() => {
        dispatch(loadStoredCards());
    }, [dispatch]);

    // Load Anki decks when needed
    const loadAnkiDecks = async () => {
        if (!useAnkiConnect) return;
        
        try {
            setLoadingDecks(true);
            const response = await fetchDecks(ankiConnectApiKey);
            
            if (response.result) {
                dispatch({ 
                    type: 'FETCH_DECKS_SUCCESS', 
                    payload: response.result 
                });
                
                // Select first deck if none is selected
                if (!deckId && response.result.length > 0) {
                    dispatch(setDeckId(response.result[0].deckId));
                }
            }
        } catch (error) {
            console.error('Error loading decks:', error);
            showError('Failed to load Anki decks. Make sure Anki is running with AnkiConnect plugin.');
        } finally {
            setLoadingDecks(false);
        }
    };

    // Load decks initially if using AnkiConnect
    useEffect(() => {
        if (useAnkiConnect && decks.length === 0) {
            loadAnkiDecks();
        }
    }, [useAnkiConnect]);

    // Get filtered cards based on current tab
    const getFilteredCards = () => {
        let cards;
        switch (activeFilter) {
            case 'not_exported':
                cards = storedCards.filter(card => card.exportStatus === 'not_exported');
                break;
            case 'exported':
                cards = storedCards.filter(card => 
                    card.exportStatus === 'exported_to_anki' || card.exportStatus === 'exported_to_file');
                break;
            case 'all':
            default:
                // Sort all cards - put new cards first, then exported
                cards = [...storedCards].sort((a, b) => {
                    // New cards come first
                    if (a.exportStatus === 'not_exported' && b.exportStatus !== 'not_exported') {
                        return -1;
                    }
                    // Exported cards come after
                    if (a.exportStatus !== 'not_exported' && b.exportStatus === 'not_exported') {
                        return 1;
                    }
                    // For cards with same export status, sort by creation date (newest first)
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
                break;
        }
        
        // Sort by creation date within each category (newest first)
        return cards.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    };
    
    const filteredCards = getFilteredCards();
    
    // Count cards by status for the tab counters
    const cardCounts = {
        all: storedCards.length,
        not_exported: storedCards.filter(card => card.exportStatus === 'not_exported').length,
        exported: storedCards.filter(card => 
            card.exportStatus === 'exported_to_anki' || card.exportStatus === 'exported_to_file').length
    };

    const handleCardSelect = (cardId: string) => {
        if (selectedCards.includes(cardId)) {
            setSelectedCards(selectedCards.filter(id => id !== cardId));
        } else {
            setSelectedCards([...selectedCards, cardId]);
        }
    };

    const handleSelectAll = () => {
        if (selectedCards.length === filteredCards.length) {
            setSelectedCards([]);
        } else {
            setSelectedCards(filteredCards.map(card => card.id));
        }
    };

    const handleDelete = (cardId: string) => {
        dispatch(deleteStoredCard(cardId));
    };

    const handleSaveToAnki = async () => {
        if (selectedCards.length === 0) {
            showError('Please select at least one card to save');
            return;
        }

        setIsLoading(true);
        try {
            const modelName = 'Basic';
            const selectedCardsData = storedCards.filter(card => selectedCards.includes(card.id));
            
            // Group cards by mode
            const langLearningCards: CardLangLearning[] = [];
            const generalTopicCards: CardGeneral[] = [];
            
            selectedCardsData.forEach(card => {
                if (card.mode === Modes.LanguageLearning && card.translation) {
                    langLearningCards.push({
                        text: card.text,
                        translation: card.translation,
                        examples: card.examples || [],
                        image_base64: card.image || null
                    });
                } else if (card.mode === Modes.GeneralTopic && card.front && card.back) {
                    generalTopicCards.push({
                        front: card.front,
                        back: card.back,
                        text: card.text
                    });
                }
            });
            
            // Save language learning cards
            if (langLearningCards.length > 0) {
                await dispatch(saveAnkiCards(
                    Modes.LanguageLearning,
                    ankiConnectUrl,
                    ankiConnectApiKey,
                    deckId,
                    modelName,
                    langLearningCards
                ));
            }
            
            // Save general topic cards
            if (generalTopicCards.length > 0) {
                await dispatch(saveAnkiCards(
                    Modes.GeneralTopic,
                    ankiConnectUrl,
                    ankiConnectApiKey,
                    deckId,
                    modelName,
                    generalTopicCards
                ));
            }
            
            // Update export status for selected cards
            selectedCards.forEach(cardId => {
                dispatch(updateCardExportStatus(cardId, 'exported_to_anki'));
            });
            
            // Show success notification with type parameter
            showError('Cards saved to Anki successfully!', 'success');
        } catch (error) {
            showError('Failed to save cards to Anki. Make sure Anki is running and AnkiConnect is properly configured.');
        } finally {
            setIsLoading(false);
        }
    };

    const exportCardsAsFile = () => {
        if (selectedCards.length === 0) {
            showError('Please select at least one card to export');
            return;
        }

        const selectedCardsData = storedCards.filter(card => selectedCards.includes(card.id));
        
        // Format data for export
        const exportData = selectedCardsData.map(card => {
            if (card.mode === Modes.LanguageLearning) {
                return {
                    front: card.text,
                    back: `${card.translation}<br><br>${(card.examples || []).map(([ex, trans]) => 
                        `${ex}${trans ? `<br>${trans}` : ''}`).join('<br><br>')}`
                };
            } else {
                return {
                    front: card.front || '',
                    back: card.back || ''
                };
            }
        });
        
        // Create CSV content (compatible with Anki import)
        let csvContent = "front,back\n";
        exportData.forEach(card => {
            // Replace newlines with <br> and escape quotes
            const front = card.front.replace(/\n/g, '<br>').replace(/"/g, '""');
            const back = card.back.replace(/\n/g, '<br>').replace(/"/g, '""');
            csvContent += `"${front}","${back}"\n`;
        });
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'anki_cards.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Update export status for selected cards
        selectedCards.forEach(cardId => {
            dispatch(updateCardExportStatus(cardId, 'exported_to_file'));
        });
    };

    const formatDate = (dateString: Date) => {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const renderCardStatus = (status: ExportStatus) => {
        switch (status) {
            case 'exported_to_anki':
                return <span style={{ fontSize: '11px', color: '#10B981', marginLeft: '8px' }}>✓ Anki</span>;
            case 'exported_to_file':
                return <span style={{ fontSize: '11px', color: '#2563EB', marginLeft: '8px' }}>✓ File</span>;
            default:
                return null;
        }
    };

    const renderCardContent = (card: StoredCard) => {
        if (card.mode === Modes.LanguageLearning) {
            return (
                <div style={{ padding: '8px' }}>
                    <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{card.text}</p>
                    {card.translation && (
                        <p style={{ color: '#374151', fontSize: '13px', marginBottom: '8px' }}>{card.translation}</p>
                    )}
                    {card.examples && card.examples.length > 0 && (
                        <div style={{ marginTop: '8px' }}>
                            <p style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>Examples:</p>
                            {card.examples.slice(0, 1).map(([example, translation], index) => (
                                <div key={index} style={{ fontSize: '12px', marginBottom: '2px' }}>
                                    <p style={{ color: '#111827', marginBottom: '2px' }}>{example}</p>
                                    {translation && <p style={{ color: '#6B7280', fontStyle: 'italic' }}>{translation}</p>}
                                </div>
                            ))}
                            {card.examples.length > 1 && (
                                <p style={{ fontSize: '11px', color: '#6B7280' }}>+{card.examples.length - 1} more examples</p>
                            )}
                        </div>
                    )}
                    {card.imageUrl && (
                        <div style={{ marginTop: '8px', textAlign: 'center' }}>
                            <img src={card.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '80px', borderRadius: '4px' }} />
                        </div>
                    )}
                </div>
            );
        } else {
            return (
                <div style={{ padding: '8px' }}>
                    {card.front && (
                        <p style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '4px' }}>{card.front}</p>
                    )}
                    {card.back && (
                        <p style={{ color: '#374151', fontSize: '12px' }}>
                            {card.back.length > 100 ? card.back.substring(0, 100) + '...' : card.back}
                        </p>
                    )}
                </div>
            );
        }
    };

    // Modified to render the tab navigation
    const renderTabNavigation = () => {
        const tabStyle = {
            base: {
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: '500',
                borderRadius: '6px 6px 0 0',
                cursor: 'pointer',
                textAlign: 'center' as const,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
            },
            active: {
                backgroundColor: '#ffffff',
                color: '#2563EB',
                borderBottom: '2px solid #2563EB',
            },
            inactive: {
                backgroundColor: '#F3F4F6',
                color: '#6B7280',
                borderBottom: '2px solid transparent',
            }
        };

        return (
            <div style={{ 
                display: 'flex', 
                width: '100%', 
                borderBottom: '1px solid #E5E7EB',
                marginBottom: '16px',
                backgroundColor: '#F3F4F6',
            }}>
                <div 
                    onClick={() => setActiveFilter('not_exported')}
                    style={{
                        ...tabStyle.base,
                        ...(activeFilter === 'not_exported' ? tabStyle.active : tabStyle.inactive),
                        flex: 1
                    }}
                >
                    New
                    <span style={{ 
                        backgroundColor: activeFilter === 'not_exported' ? '#2563EB' : '#9CA3AF',
                        color: 'white',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        padding: '1px 6px',
                        minWidth: '20px',
                    }}>
                        {cardCounts.not_exported}
                    </span>
                </div>
                <div 
                    onClick={() => setActiveFilter('all')}
                    style={{
                        ...tabStyle.base,
                        ...(activeFilter === 'all' ? tabStyle.active : tabStyle.inactive),
                        flex: 1
                    }}
                >
                    All
                    <span style={{ 
                        backgroundColor: activeFilter === 'all' ? '#2563EB' : '#9CA3AF',
                        color: 'white',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        padding: '1px 6px',
                        minWidth: '20px',
                    }}>
                        {cardCounts.all}
                    </span>
                </div>
                <div 
                    onClick={() => setActiveFilter('exported')}
                    style={{
                        ...tabStyle.base,
                        ...(activeFilter === 'exported' ? tabStyle.active : tabStyle.inactive),
                        flex: 1
                    }}
                >
                    Exported
                    <span style={{ 
                        backgroundColor: activeFilter === 'exported' ? '#2563EB' : '#9CA3AF',
                        color: 'white',
                        borderRadius: '9999px',
                        fontSize: '12px',
                        padding: '1px 6px',
                        minWidth: '20px',
                    }}>
                        {cardCounts.exported}
                    </span>
                </div>
            </div>
        );
    };

    // Remove the renderCardsByStatus function and create a new function to render all cards
    const renderCards = () => {
        if (filteredCards.length === 0) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '200px',
                    color: '#6B7280',
                    textAlign: 'center',
                    padding: '20px'
                }}>
                    <p style={{ fontSize: '14px' }}>
                        {activeFilter === 'all' ? 'No cards yet' : 
                         activeFilter === 'not_exported' ? 'No new cards' : 
                         'No exported cards'}
                    </p>
                </div>
            );
        }

        return filteredCards.map(card => (
            <div
                key={card.id}
                style={{
                    border: '1px solid #E5E7EB',
                    borderRadius: '6px',
                    marginBottom: '8px',
                    backgroundColor: selectedCards.includes(card.id) ? '#F3F4F6' : '#ffffff'
                }}
            >
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderBottom: '1px solid #E5E7EB'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            checked={selectedCards.includes(card.id)}
                            onChange={() => handleCardSelect(card.id)}
                            style={{ marginRight: '8px' }}
                        />
                        <div>
                            <span style={{ fontSize: '12px', color: '#6B7280' }}>
                                {card.mode === Modes.LanguageLearning ? 'Language' : 'Topic'}
                            </span>
                            <span style={{ fontSize: '11px', color: '#9CA3AF', marginLeft: '8px' }}>
                                {formatDate(card.createdAt)}
                            </span>
                            {renderCardStatus(card.exportStatus)}
                        </div>
                    </div>
                    <button
                        onClick={() => handleDelete(card.id)}
                        style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#EF4444',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '4px'
                        }}
                        title="Delete card"
                    >
                        <FaTrash size={14} />
                    </button>
                </div>
                {renderCardContent(card)}
            </div>
        ));
    };

    const handleDeckChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        dispatch(setDeckId(e.target.value));
    };

    const toggleDeckSelector = () => {
        setShowDeckSelector(prev => !prev);
    };

    // Render deck selector dropdown or button
    const renderDeckSelector = () => {
        if (!useAnkiConnect) return null;
        
        const deckSelectorStyle = {
            container: {
                display: 'flex',
                flexDirection: 'column' as const,
                gap: '8px',
                marginBottom: '16px',
                backgroundColor: '#F9FAFB',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #E5E7EB'
            },
            header: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%'
            },
            title: {
                fontSize: '14px',
                fontWeight: '600' as const,
                color: '#111827',
            },
            button: {
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
                padding: '0',
                fontSize: '12px'
            },
            selectContainer: {
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%'
            },
            select: {
                flex: 1,
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #E5E7EB',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                cursor: 'pointer'
            },
            refreshButton: {
                backgroundColor: '#F3F4F6',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#6B7280',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                minWidth: '36px',
                height: '38px'
            }
        };

        if (!showDeckSelector) {
            return (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    marginBottom: '12px',
                    padding: '8px 12px',
                    backgroundColor: '#F9FAFB',
                    borderRadius: '6px',
                    border: '1px solid #E5E7EB'
                }}>
                    <div>
                        <span style={{ fontSize: '13px', color: '#6B7280' }}>Anki Deck:</span>
                        <span style={{ fontSize: '14px', fontWeight: '500', marginLeft: '8px', color: '#111827' }}>
                            {decks.find(d => d.deckId === deckId)?.name || 'None selected'}
                        </span>
                    </div>
                    <button
                        onClick={toggleDeckSelector}
                        style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#2563EB',
                            fontSize: '13px'
                        }}
                    >
                        Change
                    </button>
                </div>
            );
        }

        return (
            <div style={deckSelectorStyle.container}>
                <div style={deckSelectorStyle.header}>
                    <span style={deckSelectorStyle.title}>Select Anki Deck</span>
                    <button 
                        onClick={toggleDeckSelector}
                        style={deckSelectorStyle.button}
                    >
                        Hide
                    </button>
                </div>
                
                <div style={deckSelectorStyle.selectContainer}>
                    <select
                        value={deckId}
                        onChange={handleDeckChange}
                        style={deckSelectorStyle.select}
                        disabled={loadingDecks}
                    >
                        {decks.length === 0 && <option value="">No decks available</option>}
                        {decks.map(deck => (
                            <option key={deck.deckId} value={deck.deckId}>
                                {deck.name}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={loadAnkiDecks}
                        disabled={loadingDecks}
                        title="Refresh decks list"
                        style={deckSelectorStyle.refreshButton}
                        aria-label="Refresh decks"
                    >
                        <FaSync 
                            size={14} 
                            style={{ 
                                animation: loadingDecks ? 'spin 1s linear infinite' : 'none' 
                            }} 
                        />
                    </button>
                </div>
                
                <style>
                    {`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    `}
                </style>
            </div>
        );
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '12px',
            overflowY: 'auto',
            width: '100%',
            maxWidth: '320px',
            margin: '0 auto'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <button
                    onClick={onBackClick}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6B7280',
                        padding: '4px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#111827'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#6B7280'}
                >
                    <FaArrowLeft style={{ marginRight: '4px' }} />
                    <span style={{ fontSize: '14px' }}>Back</span>
                </button>
                <span style={{ fontWeight: '600', fontSize: '16px' }}>
                    Saved Cards ({storedCards.length})
                </span>
            </div>

            {renderErrorNotification()}
            
            {storedCards.length > 0 ? (
                <>
                    {renderTabNavigation()}
                    
                    {useAnkiConnect && renderDeckSelector()}
                    
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <input
                                type="checkbox"
                                id="selectAll"
                                checked={selectedCards.length === filteredCards.length && filteredCards.length > 0}
                                onChange={handleSelectAll}
                                style={{ marginRight: '8px' }}
                            />
                            <label htmlFor="selectAll" style={{ fontSize: '14px', cursor: 'pointer' }}>
                                {selectedCards.length === filteredCards.length && filteredCards.length > 0
                                    ? 'Deselect All'
                                    : 'Select All'}
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleSaveToAnki}
                                disabled={isLoading || selectedCards.length === 0 || !useAnkiConnect || !deckId}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#10B981',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    opacity: (isLoading || selectedCards.length === 0 || !useAnkiConnect || !deckId) ? 0.6 : 1
                                }}
                                title={!deckId && useAnkiConnect ? 'Please select a deck first' : ''}
                            >
                                {isLoading ? 'Saving...' : 'Save to Anki'}
                            </button>
                            <button
                                onClick={exportCardsAsFile}
                                disabled={isLoading || selectedCards.length === 0}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#2563EB',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    opacity: (isLoading || selectedCards.length === 0) ? 0.6 : 1
                                }}
                            >
                                <FaDownload size={12} />
                                <span>Export</span>
                            </button>
                        </div>
                    </div>
                    
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {renderCards()}
                    </div>
                </>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: '#6B7280',
                    textAlign: 'center',
                    padding: '20px'
                }}>
                    <p style={{ marginBottom: '16px', fontSize: '15px' }}>No saved cards yet</p>
                    <p style={{ fontSize: '13px' }}>
                        Create cards using the "Create Card" button and save them to view here.
                    </p>
                </div>
            )}
        </div>
    );
};

export default StoredCards; 