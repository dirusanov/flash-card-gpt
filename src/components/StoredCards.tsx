import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from '../store';
import { loadStoredCards, deleteStoredCard, saveAnkiCards, updateCardExportStatus, updateStoredCard, setImageUrl, setImage } from '../store/actions/cards';
import { StoredCard, ExportStatus } from '../store/reducers/cards';
import { Modes } from '../constants';
import { FaArrowLeft, FaTrash, FaDownload, FaSync, FaEdit, FaCheck, FaTimes, FaImage } from 'react-icons/fa';
import { CardLangLearning, CardGeneral, fetchDecks } from '../services/ankiService';
import useErrorNotification from './useErrorHandler';
import { Deck, setDeckId } from '../store/actions/decks';
import { getDescriptionImage } from "../services/openaiApi";
import { getImage } from '../apiUtils';
import { OpenAI } from 'openai';

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
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const haggingFaceApiKey = useSelector((state: RootState) => state.settings.huggingFaceApiKey);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingDecks, setLoadingDecks] = useState(false);
    const [activeFilter, setActiveFilter] = useState<CardFilterType>('not_exported');
    const [showDeckSelector, setShowDeckSelector] = useState(false);
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<StoredCard | null>(null);
    const [loadingImage, setLoadingImage] = useState(false);
    const { showError, renderErrorNotification } = useErrorNotification();
    
    // Initialize OpenAI client
    const openai = new OpenAI({
        apiKey: openAiKey,
        dangerouslyAllowBrowser: true,
    });

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
        // Don't allow selection changes when a card is being edited
        if (editingCardId) return;
        
        if (selectedCards.includes(cardId)) {
            setSelectedCards(selectedCards.filter(id => id !== cardId));
        } else {
            setSelectedCards([...selectedCards, cardId]);
        }
    };

    const handleSelectAll = () => {
        // Don't allow selection changes when a card is being edited
        if (editingCardId) return;
        
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
        // If card is in edit mode, don't render normal content
        if (editingCardId === card.id) {
            return null;
        }
        
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
                    borderBottom: editingCardId === card.id ? 'none' : '1px solid #E5E7EB'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            checked={selectedCards.includes(card.id)}
                            onChange={() => handleCardSelect(card.id)}
                            style={{ marginRight: '8px' }}
                            disabled={editingCardId === card.id}
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
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {editingCardId !== card.id && (
                            <>
                                <button
                                    onClick={() => handleStartEditing(card)}
                                    style={{
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#2563EB',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px',
                                        opacity: 0.8,
                                        transition: 'opacity 0.2s'
                                    }}
                                    title="Edit card"
                                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.8'}
                                >
                                    <FaEdit size={14} />
                                </button>
                                <button
                                    onClick={() => handleDelete(card.id)}
                                    style={{
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#EF4444',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '4px',
                                        opacity: 0.8,
                                        transition: 'opacity 0.2s'
                                    }}
                                    title="Delete card"
                                    onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
                                    onMouseOut={(e) => e.currentTarget.style.opacity = '0.8'}
                                >
                                    <FaTrash size={14} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {editingCardId === card.id ? renderCardEditForm() : renderCardContent(card)}
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

    // Start editing a card
    const handleStartEditing = (card: StoredCard) => {
        // Create a copy of the card for editing
        const cardForEdit = { ...card };
        
        // Make sure the examples array is properly initialized
        if (card.mode === Modes.LanguageLearning) {
            cardForEdit.examples = Array.isArray(card.examples) ? [...card.examples] : [];
            
            // Ensure text and translation fields are not null
            cardForEdit.text = cardForEdit.text || '';
            cardForEdit.translation = cardForEdit.translation || '';
        } else {
            // For general topic cards, ensure front and back are not null
            cardForEdit.front = cardForEdit.front || '';
            cardForEdit.back = cardForEdit.back || '';
        }
        
        setEditingCardId(card.id);
        setEditFormData(cardForEdit);
    };
    
    // Cancel editing
    const handleCancelEdit = () => {
        setEditingCardId(null);
        setEditFormData(null);
    };
    
    // Save edited card
    const handleSaveEdit = () => {
        if (!editFormData) return;
        
        try {
            // Prepare the updated card data with deep copy to avoid reference issues
            const updatedCardData = JSON.parse(JSON.stringify(editFormData)) as StoredCard;
            
            console.log('Original editFormData:', editFormData);
            console.log('Deep copied updatedCardData:', updatedCardData);
            
            // Make sure we preserve the ID and other required fields
            updatedCardData.id = editFormData.id;
            updatedCardData.createdAt = editFormData.createdAt;
            updatedCardData.exportStatus = editFormData.exportStatus;
            
            // Clean up any empty examples
            if (Array.isArray(updatedCardData.examples)) {
                updatedCardData.examples = updatedCardData.examples
                    .filter(example => example[0].trim() !== '') // Filter out examples with empty text
                    .map(([text, translation]) => [
                        text.trim(), 
                        translation ? translation.trim() : null
                    ]); // Trim whitespace from all values
            } else {
                // Make sure examples is at least an empty array
                updatedCardData.examples = [];
            }
            
            // Validate form data
            if (updatedCardData.mode === Modes.LanguageLearning) {
                if (!updatedCardData.text || !updatedCardData.translation) {
                    showError('Please provide both text and translation');
                    return;
                }
                
                // Ensure these fields are properly set
                updatedCardData.text = updatedCardData.text.trim();
                updatedCardData.translation = updatedCardData.translation.trim();
            } else {
                if (!updatedCardData.front || !updatedCardData.back) {
                    showError('Please provide both front and back content');
                    return;
                }
                
                // Ensure these fields are properly set
                updatedCardData.front = updatedCardData.front.trim();
                updatedCardData.back = updatedCardData.back?.trim() || null;
            }
            
            console.log('Final data being saved to Redux:', updatedCardData);
            
            // Update the card in the Redux store
            dispatch(updateStoredCard(updatedCardData));
            
            // Reset the editing state
            setEditingCardId(null);
            setEditFormData(null);
            
            showError('Card updated successfully!', 'success');
        } catch (error) {
            console.error('Error saving card:', error);
            showError('Failed to update card. Please try again.');
        }
    };
    
    // Handle form field changes
    const handleEditFormChange = (field: keyof StoredCard, value: any) => {
        if (!editFormData) return;
        setEditFormData({
            ...editFormData,
            [field]: value
        });
    };
    
    // Generate a new image for the card
    const handleGenerateNewImage = async () => {
        if (!editFormData || !editFormData.text) return;
        
        try {
            setLoadingImage(true);
            
            // Check if we have API keys
            if (!openAiKey) {
                throw new Error('OpenAI API key is not configured. Please add it in the settings.');
            }
            
            // We need to add proper error handling and logs to diagnose issues
            console.log('Starting image generation for text:', editFormData.text);
            
            // 1. Get an image description
            const descriptionImage = await getDescriptionImage(openAiKey, editFormData.text, imageInstructions);
            console.log('Description generated:', descriptionImage);
            
            if (!descriptionImage) {
                throw new Error('Failed to generate image description');
            }
            
            // 2. Generate an image URL using the OpenAI client
            // Use direct API calls for better debugging
            try {
                console.log('Attempting to generate image...');
                
                // Try with HuggingFace first if we have an API key
                if (haggingFaceApiKey) {
                    try {
                        console.log('Trying HuggingFace image generation');
                        const result = await getImage(
                            haggingFaceApiKey, 
                            openai, 
                            openAiKey, 
                            descriptionImage, 
                            imageInstructions
                        );
                        
                        console.log('Image generation result:', result);
                        
                        if (result.imageUrl && result.imageBase64) {
                            // Update the form data with new image
                            setEditFormData({
                                ...editFormData,
                                imageUrl: result.imageUrl,
                                image: result.imageBase64
                            });
                            
                            showError('New image generated successfully!', 'success');
                            return;
                        }
                        throw new Error('HuggingFace image generation failed');
                    } catch (huggingFaceError) {
                        console.error('HuggingFace error:', huggingFaceError);
                        // Fall back to direct OpenAI API call
                    }
                }
                
                // Fallback to direct OpenAI API call
                console.log('Trying direct OpenAI image generation');
                
                const finalPrompt = imageInstructions 
                    ? `${descriptionImage}. ${imageInstructions}`
                    : descriptionImage;
                
                // Direct OpenAI API call to get image
                const response = await fetch('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openAiKey}`
                    },
                    body: JSON.stringify({
                        prompt: finalPrompt,
                        n: 1,
                        size: '512x512',
                        response_format: 'url'
                    })
                });
                
                const data = await response.json();
                console.log('OpenAI direct API response:', data);
                
                if (!data.data || !data.data[0] || !data.data[0].url) {
                    throw new Error('OpenAI did not return an image URL');
                }
                
                const imageUrl = data.data[0].url;
                console.log('Image URL generated:', imageUrl);
                
                // 3. Send a message to the background script to fetch the image and convert to base64
                console.log('Sending message to background script to fetch image');
                
                // Create a promise that resolves when the background script sends a response
                const imageData = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage(imageUrl, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('Error sending message:', chrome.runtime.lastError);
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        
                        console.log('Response from background script:', response);
                        
                        if (response && response.status && response.data) {
                            resolve(response.data);
                        } else {
                            reject(new Error('Failed to get image data from background script'));
                        }
                    });
                });
                
                console.log('Image data received from background');
                
                // Update the form data with the new image
                setEditFormData({
                    ...editFormData,
                    imageUrl: imageData as string,
                    image: imageData as string
                });
                
                showError('New image generated successfully!', 'success');
                
            } catch (imageError: any) {
                console.error('Error in image generation:', imageError);
                throw new Error(`Image generation failed: ${imageError?.message || 'Unknown error'}`);
            }
        } catch (error: any) {
            console.error('Error generating image:', error);
            // Show a more detailed error message
            showError(`Failed to generate new image: ${error?.message || 'Unknown error'}`);
        } finally {
            setLoadingImage(false);
        }
    };

    // Handle the addition of a new example for language cards
    const handleAddExample = () => {
        if (!editFormData || editFormData.mode !== Modes.LanguageLearning) {
            console.warn('Cannot add example: form data is null or not in language learning mode');
            return;
        }
        
        try {
            // Make sure we have a valid examples array
            const currentExamples = Array.isArray(editFormData.examples) ? [...editFormData.examples] : [];
            
            // Create a new array with the existing examples plus a new empty one
            const newExamples: [string, string | null][] = [...currentExamples, ['', null]];
            
            console.log('Adding new example, total examples:', newExamples.length);
            
            // Update the form data with the new examples array
            setEditFormData({
                ...editFormData,
                examples: newExamples
            });
        } catch (error) {
            console.error('Error adding example:', error);
        }
    };
    
    // Handle removal of an example
    const handleRemoveExample = (index: number) => {
        if (!editFormData) {
            console.warn('Cannot remove example: form data is null');
            return;
        }
        
        try {
            // Make sure we have a valid examples array
            const currentExamples = Array.isArray(editFormData.examples) ? [...editFormData.examples] : [];
            
            // Check if the index is valid
            if (index < 0 || index >= currentExamples.length) {
                console.warn(`Invalid example index: ${index}, examples length: ${currentExamples.length}`);
                return;
            }
            
            // Create a new array without the example at the specified index
            const newExamples: [string, string | null][] = [
                ...currentExamples.slice(0, index),
                ...currentExamples.slice(index + 1)
            ];
            
            console.log(`Removed example at index ${index}, remaining examples:`, newExamples.length);
            
            // Update the form data with the modified examples
            setEditFormData({
                ...editFormData,
                examples: newExamples
            });
        } catch (error) {
            console.error('Error removing example:', error);
        }
    };
    
    // Handle changes to an example
    const handleExampleChange = (index: number, isExample: boolean, value: string) => {
        if (!editFormData) {
            console.warn('Cannot change example: form data is null');
            return;
        }
        
        try {
            // Make sure we have a valid examples array
            const currentExamples = Array.isArray(editFormData.examples) ? [...editFormData.examples] : [];
            
            // Create a copy of the examples array
            const newExamples: [string, string | null][] = [...currentExamples];
            
            // If the index doesn't exist, add empty examples up to this index
            while (newExamples.length <= index) {
                newExamples.push(['', null]);
            }
            
            // Update the specific example text or translation
            if (isExample) {
                newExamples[index][0] = value;
                console.log(`Updated example text at index ${index}:`, value.substring(0, 20) + (value.length > 20 ? '...' : ''));
            } else {
                newExamples[index][1] = value;
                console.log(`Updated translation at index ${index}:`, value.substring(0, 20) + (value.length > 20 ? '...' : ''));
            }
            
            // Update the form data with the modified examples
            setEditFormData({
                ...editFormData,
                examples: newExamples
            });
        } catch (error) {
            console.error('Error updating example:', error);
        }
    };

    // Render the edit form for a card
    const renderCardEditForm = () => {
        if (!editFormData) return null;
        
        const formStyles = {
            container: {
                display: 'flex' as const,
                flexDirection: 'column' as const,
                gap: '16px',
                padding: '16px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                marginBottom: '16px'
            },
            header: {
                display: 'flex' as const,
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
            },
            title: {
                fontSize: '16px',
                fontWeight: '600' as const,
                color: '#334155'
            },
            buttonGroup: {
                display: 'flex' as const,
                gap: '8px'
            },
            button: {
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: '500' as const,
                cursor: 'pointer',
                display: 'flex' as const,
                alignItems: 'center',
                gap: '4px',
                border: 'none'
            },
            cancelButton: {
                backgroundColor: '#f1f5f9',
                color: '#64748b',
                border: '1px solid #cbd5e1'
            },
            saveButton: {
                backgroundColor: '#2563eb',
                color: '#ffffff'
            },
            fieldGroup: {
                display: 'flex' as const,
                flexDirection: 'column' as const,
                gap: '4px'
            },
            label: {
                fontSize: '13px',
                color: '#475569',
                fontWeight: '500' as const
            },
            input: {
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                color: '#334155',
                backgroundColor: '#ffffff'
            },
            textarea: {
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '14px',
                color: '#334155',
                minHeight: '80px',
                resize: 'vertical' as const,
                backgroundColor: '#ffffff'
            },
            imageContainer: {
                display: 'flex' as const,
                flexDirection: 'column' as const,
                gap: '8px',
                alignItems: 'center'
            },
            image: {
                maxWidth: '100%',
                maxHeight: '200px',
                borderRadius: '6px'
            },
            imageButton: {
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                display: 'flex' as const,
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
            },
            examplesContainer: {
                display: 'flex' as const,
                flexDirection: 'column' as const,
                gap: '8px'
            },
            exampleItem: {
                display: 'flex' as const,
                flexDirection: 'column' as const,
                gap: '4px',
                backgroundColor: '#f1f5f9',
                padding: '8px',
                borderRadius: '6px',
                position: 'relative' as const
            },
            exampleHeader: {
                display: 'flex' as const,
                justifyContent: 'space-between'
            },
            removeButton: {
                backgroundColor: 'transparent',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                padding: '2px',
                position: 'absolute' as const,
                top: '8px',
                right: '8px'
            },
            addButton: {
                backgroundColor: '#f8fafc',
                color: '#2563eb',
                border: '1px dashed #94a3b8',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                display: 'flex' as const,
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                width: '100%',
                marginTop: '8px'
            }
        };
        
        return (
            <div style={formStyles.container}>
                <div style={formStyles.header}>
                    <h3 style={formStyles.title}>Edit Card</h3>
                    <div style={formStyles.buttonGroup}>
                        <button onClick={handleCancelEdit} style={{...formStyles.button, ...formStyles.cancelButton}}>
                            <FaTimes size={12} /> Cancel
                        </button>
                        <button onClick={handleSaveEdit} style={{...formStyles.button, ...formStyles.saveButton}}>
                            <FaCheck size={12} /> Save
                        </button>
                    </div>
                </div>
                
                {editFormData.mode === Modes.LanguageLearning ? (
                    <>
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Text</label>
                            <input 
                                type="text"
                                value={editFormData.text || ''}
                                onChange={(e) => handleEditFormChange('text', e.target.value)}
                                style={formStyles.input}
                            />
                        </div>
                        
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Translation</label>
                            <input 
                                type="text"
                                value={editFormData.translation || ''}
                                onChange={(e) => handleEditFormChange('translation', e.target.value)}
                                style={formStyles.input}
                            />
                        </div>
                        
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Examples</label>
                            <div style={formStyles.examplesContainer}>
                                {Array.isArray(editFormData.examples) && editFormData.examples.length > 0 ? (
                                    editFormData.examples.map((example, index) => (
                                        <div key={index} style={formStyles.exampleItem}>
                                            <button 
                                                onClick={() => handleRemoveExample(index)}
                                                style={formStyles.removeButton}
                                                type="button"
                                            >
                                                <FaTimes size={12} />
                                            </button>
                                            <input 
                                                type="text"
                                                value={example[0] || ''}
                                                onChange={(e) => handleExampleChange(index, true, e.target.value)}
                                                placeholder="Example"
                                                style={formStyles.input}
                                            />
                                            <input 
                                                type="text"
                                                value={example[1] || ''}
                                                onChange={(e) => handleExampleChange(index, false, e.target.value)}
                                                placeholder="Translation (optional)"
                                                style={formStyles.input}
                                            />
                                        </div>
                                    ))
                                ) : (
                                    <div style={{
                                        padding: '12px',
                                        textAlign: 'center',
                                        color: '#64748b',
                                        fontSize: '14px',
                                        backgroundColor: '#f1f5f9',
                                        borderRadius: '6px',
                                        marginBottom: '8px'
                                    }}>
                                        No examples added yet
                                    </div>
                                )}
                                <button 
                                    onClick={handleAddExample} 
                                    style={formStyles.addButton}
                                    type="button"
                                >
                                    + Add Example
                                </button>
                            </div>
                        </div>
                        
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Image</label>
                            <div style={formStyles.imageContainer}>
                                {editFormData.imageUrl ? (
                                    <img src={editFormData.imageUrl} alt="" style={formStyles.image} />
                                ) : (
                                    <div style={{
                                        width: '100%',
                                        height: '100px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        backgroundColor: '#f1f5f9',
                                        borderRadius: '6px',
                                        color: '#64748b',
                                        fontSize: '14px'
                                    }}>
                                        No image available
                                    </div>
                                )}
                                <button 
                                    onClick={handleGenerateNewImage} 
                                    disabled={loadingImage}
                                    style={formStyles.imageButton}
                                >
                                    <FaImage size={14} /> 
                                    {loadingImage ? 'Generating...' : 'Generate New Image'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Front</label>
                            <input 
                                type="text"
                                value={editFormData.front || ''}
                                onChange={(e) => handleEditFormChange('front', e.target.value)}
                                style={formStyles.input}
                            />
                        </div>
                        
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Back</label>
                            <textarea 
                                value={editFormData.back || ''}
                                onChange={(e) => handleEditFormChange('back', e.target.value)}
                                style={formStyles.textarea}
                            />
                        </div>
                    </>
                )}
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
                                disabled={editingCardId !== null}
                            />
                            <label htmlFor="selectAll" style={{ 
                                fontSize: '14px', 
                                cursor: editingCardId !== null ? 'default' : 'pointer',
                                opacity: editingCardId !== null ? 0.6 : 1
                            }}>
                                {selectedCards.length === filteredCards.length && filteredCards.length > 0
                                    ? 'Deselect All'
                                    : 'Select All'}
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                onClick={handleSaveToAnki}
                                disabled={isLoading || selectedCards.length === 0 || !useAnkiConnect || !deckId || editingCardId !== null}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#10B981',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    opacity: (isLoading || selectedCards.length === 0 || !useAnkiConnect || !deckId || editingCardId !== null) ? 0.6 : 1
                                }}
                                title={
                                    editingCardId !== null ? 'Finish editing first' :
                                    !deckId && useAnkiConnect ? 'Please select a deck first' : ''
                                }
                            >
                                {isLoading ? 'Saving...' : 'Save to Anki'}
                            </button>
                            <button
                                onClick={exportCardsAsFile}
                                disabled={isLoading || selectedCards.length === 0 || editingCardId !== null}
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
                                    opacity: (isLoading || selectedCards.length === 0 || editingCardId !== null) ? 0.6 : 1
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