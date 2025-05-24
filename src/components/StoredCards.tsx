import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from '../store';
import { loadStoredCards, deleteStoredCard, saveAnkiCards, updateCardExportStatus, updateStoredCard, setImageUrl, setImage } from '../store/actions/cards';
import { StoredCard, ExportStatus } from '../store/reducers/cards';
import { Modes } from '../constants';
import { FaArrowLeft, FaTrash, FaDownload, FaSync, FaEdit, FaCheck, FaTimes, FaImage, FaChevronLeft, FaChevronRight, FaPlus } from 'react-icons/fa';
import { CardLangLearning, CardGeneral, fetchDecks } from '../services/ankiService';
import useErrorNotification from './useErrorHandler';
import { Deck, setDeckId } from '../store/actions/decks';
import Loader from './Loader';
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
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingDecks, setLoadingDecks] = useState(false);
    const [activeFilter, setActiveFilter] = useState<CardFilterType>('not_exported');
    const [showDeckSelector, setShowDeckSelector] = useState(false);
    const [editingCardId, setEditingCardId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<StoredCard | null>(null);
    const [loadingImage, setLoadingImage] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [totalPages, setTotalPages] = useState(1);
    const { showError, renderErrorNotification } = useErrorNotification();

    // Initialize OpenAI client
    const openai = new OpenAI({
        apiKey: openAiKey,
        dangerouslyAllowBrowser: true,
    });

    // Load stored cards when the component mounts
    useEffect(() => {
        const loadAllCards = async () => {
            console.log('StoredCards component mounted, forcing complete reload of cards...');
            
            // First, try to directly access localStorage to see what's there
            try {
                const rawData = localStorage.getItem('anki_stored_cards');
                if (rawData) {
                    try {
                        const directCards = JSON.parse(rawData);
                        console.log('Direct from localStorage, found cards:', directCards.length);
                    } catch (e) {
                        console.error('Failed to parse localStorage data directly:', e);
                    }
                } else {
                    console.log('No cards found directly in localStorage');
                }
            } catch (e) {
                console.error('Error accessing localStorage directly:', e);
            }
            
            // Now load through the Redux action
            dispatch(loadStoredCards());
            
            // Add a small delay to make sure cards are loaded
            const timer = setTimeout(() => {
                console.log('Current stored cards after initial load:', storedCards.length);
                
                // If there are no cards after initial load, try a different approach
                if (storedCards.length === 0) {
                    console.log('No cards loaded, trying to load directly from localStorage...');
                    
                    try {
                        const rawData = localStorage.getItem('anki_stored_cards');
                        if (rawData) {
                            const parsedCards = JSON.parse(rawData);
                            if (Array.isArray(parsedCards) && parsedCards.length > 0) {
                                console.log('Found cards directly in localStorage, manually setting in Redux...');
                                dispatch({ type: 'SET_STORED_CARDS', payload: parsedCards });
                            }
                        }
                    } catch (error) {
                        console.error('Failed to manually load cards:', error);
                    }
                }
                
                // Log card counts by filter type for debugging
                if (storedCards.length > 0) {
                    const notExported = storedCards.filter(card => card.exportStatus === 'not_exported').length;
                    const exported = storedCards.filter(card => 
                        card.exportStatus === 'exported_to_anki' || card.exportStatus === 'exported_to_file'
                    ).length;
                    
                    console.log('Card stats: total=', storedCards.length, 'not_exported=', notExported, 'exported=', exported);
                    
                    // Debug image data in cards
                    storedCards.forEach((card, index) => {
                        if (card.image || card.imageUrl) {
                            console.log(`Card ${index} (${card.id}) has images:`, {
                                hasImage: !!card.image,
                                hasImageUrl: !!card.imageUrl,
                                imageType: typeof card.image,
                                imageUrlType: typeof card.imageUrl,
                                imageLength: card.image?.length,
                                imageUrlLength: card.imageUrl?.length,
                                imageStart: card.image?.substring(0, 30),
                                imageUrlStart: card.imageUrl?.substring(0, 30)
                            });
                        }
                    });
                }
            }, 500);
            
            return () => clearTimeout(timer);
        };
        
        loadAllCards();
    }, [dispatch, storedCards.length]);

    // Check if we have cards after loading
    useEffect(() => {
        console.log('Stored cards updated:', storedCards);
    }, [storedCards]);

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
            // Only show error if useAnkiConnect is enabled
            if (useAnkiConnect) {
                showError('Failed to load Anki decks. Make sure Anki is running with AnkiConnect plugin.');
            }
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

    // Get filtered cards based on current tab with pagination
    const getFilteredCards = () => {
        // Log all cards first to see what we're working with
        console.log('All cards in store:', storedCards.length, 'cards');
        
        // If cards array is empty or invalid, return empty array
        if (!Array.isArray(storedCards) || storedCards.length === 0) {
            console.log('No cards to filter');
            return [];
        }
        
        // Log the exportStatus of each card to help diagnose issues
        const statusCounts = {
            not_exported: 0,
            exported_to_anki: 0,
            exported_to_file: 0,
            unknown: 0
        };
        
        storedCards.forEach(card => {
            if (card.exportStatus === 'not_exported') statusCounts.not_exported++;
            else if (card.exportStatus === 'exported_to_anki') statusCounts.exported_to_anki++;
            else if (card.exportStatus === 'exported_to_file') statusCounts.exported_to_file++;
            else statusCounts.unknown++;
        });
        
        console.log('Card status counts:', statusCounts);
        
        let cards;
        switch (activeFilter) {
            case 'not_exported':
                cards = storedCards.filter(card => card.exportStatus === 'not_exported');
                console.log('Filtered to not_exported cards:', cards.length);
                break;
            case 'exported':
                cards = storedCards.filter(card =>
                    card.exportStatus === 'exported_to_anki' || card.exportStatus === 'exported_to_file');
                console.log('Filtered to exported cards:', cards.length);
                break;
            case 'all':
            default:
                // Just return all cards, don't sort by export status to avoid any issues
                cards = [...storedCards];
                console.log('Using all cards:', cards.length);
                break;
        }

        // Sort by creation date within each category (newest first)
        const sortedCards = cards.sort((a, b) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        
        console.log('Final filtered and sorted cards:', sortedCards.length);
        
        return sortedCards;
    };

    const filteredCards = getFilteredCards();
    
    // Get paginated cards for current page
    const getPaginatedCards = () => {
        if (filteredCards.length === 0) {
            return [];
        }
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        
        // If the startIndex is beyond the available cards (which could happen
        // if we were on page 2 and then filtered to fewer cards), reset to page 1
        if (startIndex >= filteredCards.length) {
            setCurrentPage(1);
            return filteredCards.slice(0, itemsPerPage);
        }
        
        console.log('Pagination debug:', { 
            totalCards: storedCards.length,
            filteredCards: filteredCards.length,
            currentPage,
            itemsPerPage,
            startIndex,
            endIndex,
            cardsOnThisPage: filteredCards.slice(startIndex, endIndex).length
        });
        
        return filteredCards.slice(startIndex, endIndex);
    };
    
    const paginatedCards = getPaginatedCards();
    
    // Update total pages when filtered cards or items per page changes
    useEffect(() => {
        // Ensure we have at least 1 page
        const calculatedTotalPages = Math.max(1, Math.ceil(filteredCards.length / itemsPerPage));
        setTotalPages(calculatedTotalPages);
        
        // If current page is greater than total pages, reset to page 1
        if (currentPage > calculatedTotalPages) {
            setCurrentPage(1);
        }
    }, [filteredCards.length, itemsPerPage]);

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
                    // Process image data for Anki
                    let processedImageBase64 = null;
                    if (card.image) {
                        // Extract the base64 part if it has a data URI prefix
                        if (card.image.startsWith('data:')) {
                            const base64Prefix = 'base64,';
                            const prefixIndex = card.image.indexOf(base64Prefix);
                            if (prefixIndex !== -1) {
                                processedImageBase64 = card.image.substring(prefixIndex + base64Prefix.length);
                            } else {
                                processedImageBase64 = card.image;
                            }
                        } else {
                            processedImageBase64 = card.image;
                        }
                    }
                    
                    const ankiCard = {
                        text: card.text,
                        translation: card.translation,
                        examples: card.examples || [],
                        image_base64: processedImageBase64,
                        linguisticInfo: card.linguisticInfo
                    };
                    
                    console.log(`Adding language learning card to Anki export:`, {
                        cardId: card.id,
                        text: card.text,
                        hasImage: !!processedImageBase64,
                        imageLength: processedImageBase64?.length,
                        imagePreview: processedImageBase64?.substring(0, 30)
                    });
                    
                    langLearningCards.push(ankiCard);
                } else if (card.mode === Modes.GeneralTopic && card.front && card.back) {
                    // Process image data for GeneralTopic cards too
                    let processedImageBase64 = null;
                    if (card.image) {
                        // Extract the base64 part if it has a data URI prefix
                        if (card.image.startsWith('data:')) {
                            const base64Prefix = 'base64,';
                            const prefixIndex = card.image.indexOf(base64Prefix);
                            if (prefixIndex !== -1) {
                                processedImageBase64 = card.image.substring(prefixIndex + base64Prefix.length);
                            } else {
                                processedImageBase64 = card.image;
                            }
                        } else {
                            processedImageBase64 = card.image;
                        }
                    }

                    const generalCard = {
                        front: card.front,
                        back: card.back,
                        text: card.text,
                        image_base64: processedImageBase64
                    };
                    
                    console.log(`Adding general topic card to Anki export:`, {
                        cardId: card.id,
                        text: card.text,
                        hasImage: !!processedImageBase64,
                        imageLength: processedImageBase64?.length,
                        imagePreview: processedImageBase64?.substring(0, 30)
                    });
                    
                    generalTopicCards.push(generalCard);
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
                console.log(`Updated card ${cardId} export status to 'exported_to_anki'`);
            });

            // Show success notification with type parameter
            showError('Cards saved to Anki successfully!', 'success');

            // Add debug check of localStorage after status update
            setTimeout(() => {
                try {
                    const rawData = localStorage.getItem('anki_stored_cards');
                    if (rawData) {
                        const savedCards = JSON.parse(rawData);
                        console.log('Verified localStorage after export:', 
                            savedCards.filter((c: any) => c.id && selectedCards.includes(c.id))
                                .map((c: any) => ({id: c.id, status: c.exportStatus}))
                        );
                    }
                } catch (e) {
                    console.error('Error verifying localStorage after export:', e);
                }
            }, 500);
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
        
        // Create a simpler format without embedded images, following the exact example format
        let exportContent = "#separator:tab\n#html:true\n";
        
        selectedCardsData.forEach((card, index) => {
            console.log(`Processing card ${index} for file export:`, {
                id: card.id,
                mode: card.mode,
                hasImage: !!card.image,
                hasImageUrl: !!card.imageUrl,
                imageType: typeof card.image,
                imageUrlType: typeof card.imageUrl,
                imageLength: card.image?.length,
                imageUrlLength: card.imageUrl?.length,
                imagePreview: card.image?.substring(0, 50),
                imageUrlPreview: card.imageUrl?.substring(0, 50)
            });
            
            if (card.mode === Modes.LanguageLearning) {
                // Front is just the word/phrase
                const front = card.text.trim();
                
                // Start building the back without any images
                let back = '';
                
                // Add translation
                if (card.translation) {
                    back += `<b>${card.translation}</b>`;
                }
                
                // Add examples
                if (card.examples && card.examples.length > 0) {
                    back += "<br><br>";
                    
                    card.examples.forEach(([ex, trans], exIndex) => {
                        back += `${exIndex + 1}. ${ex}`;
                        if (trans) {
                            back += `<br><span style='font-size: 0.8em;'><i>${trans}</i></span>`;
                        }
                        back += "<br><br>";
                    });
                }
                
                // Add the actual image if the card has one
                if (card.image) {
                    // The image is already in base64 format, but may start with data:image/png;base64, or similar prefix
                    let imageData = card.image;
                    
                    // Extract the actual base64 data if it has a prefix
                    if (imageData.startsWith('data:')) {
                        const base64Prefix = 'base64,';
                        const prefixIndex = imageData.indexOf(base64Prefix);
                        if (prefixIndex !== -1) {
                            // Extract just the base64 part without the prefix
                            const rawBase64 = imageData.substring(prefixIndex + base64Prefix.length);
                            // Anki format requires just the raw base64 without data URI
                            back += `<div><img src="data:image/jpeg;base64,${rawBase64}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                        } else {
                            // Fallback if prefix structure is unexpected
                            back += `<div><img src="${imageData}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                        }
                    } else {
                        // If it's already just base64 data, use it directly
                        back += `<div><img src="data:image/jpeg;base64,${imageData}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                    }
                } else if (card.imageUrl) {
                    // ImageUrl might be a base64 string or a URL
                    let imageUrl = card.imageUrl;
                    
                    if (imageUrl.startsWith('data:')) {
                        // Extract the actual base64 data if it has a prefix
                        const base64Prefix = 'base64,';
                        const prefixIndex = imageUrl.indexOf(base64Prefix);
                        if (prefixIndex !== -1) {
                            // Extract just the base64 part without the prefix
                            const rawBase64 = imageUrl.substring(prefixIndex + base64Prefix.length);
                            // Anki format requires just the raw base64 without data URI
                            back += `<div><img src="data:image/jpeg;base64,${rawBase64}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                        } else {
                            // Fallback if prefix structure is unexpected
                            back += `<div><img src="${imageUrl}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                        }
                    } else if (imageUrl.startsWith('http')) {
                        // For remote URLs, just use as is
                        back += `<div><img src="${imageUrl}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                    } else {
                        // If it's already just base64 data, use it directly
                        back += `<div><img src="data:image/jpeg;base64,${imageUrl}" style="max-width: 350px; max-height: 350px; margin: 0 auto;"></div>`;
                    }
                }
                
                // Add linguistic information with beautiful formatting
                if (card.linguisticInfo && card.linguisticInfo.trim()) {
                    const linguisticText = card.linguisticInfo.trim();
                    
                    // Split by lines and format each section
                    const lines = linguisticText.split('\n').filter(line => line.trim());
                    let formattedLinguistic = '';
                    
                    lines.forEach(line => {
                        const trimmedLine = line.trim();
                        
                        // Check if this is a header line (starts with capital letter and ends with colon)
                        if (trimmedLine.match(/^[А-ЯЁA-Z][^:]*:$/)) {
                            formattedLinguistic += `<div style="color: #2563EB; font-weight: bold; margin-top: 12px; margin-bottom: 4px;">${trimmedLine}</div>`;
                        }
                        // Check if this is a bullet point or list item
                        else if (trimmedLine.startsWith('•') || trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
                            const content = trimmedLine.replace(/^[•\-*]\s*/, '');
                            formattedLinguistic += `<div style="margin-left: 16px; margin-bottom: 2px; color: #374151;">• ${content}</div>`;
                        }
                        // Check if this contains label-value pairs (like "Part of speech: Noun")
                        else if (trimmedLine.includes(':') && !trimmedLine.endsWith(':')) {
                            const [label, ...valueParts] = trimmedLine.split(':');
                            const value = valueParts.join(':').trim();
                            formattedLinguistic += `<div style="margin-bottom: 4px;"><span style="color: #6B7280; font-weight: 500;">${label.trim()}:</span> <span style="color: #111827;">${value}</span></div>`;
                        }
                        // Regular text
                        else if (trimmedLine) {
                            formattedLinguistic += `<div style="margin-bottom: 6px; color: #374151; line-height: 1.4;">${trimmedLine}</div>`;
                        }
                    });
                    
                    if (formattedLinguistic) {
                        back += `
                            <div style="margin-top: 20px; padding: 12px; background-color: #F8FAFC; border-left: 4px solid #2563EB; border-radius: 0 6px 6px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                <div style="color: #1E40AF; font-weight: bold; font-size: 14px; margin-bottom: 8px; display: flex; align-items: center;">
                                    <span style="margin-right: 6px;">📚</span>
                                    Grammar & Linguistics
                                </div>
                                ${formattedLinguistic}
                            </div>
                        `;
                    }
                }
                
                // Export the formatted card - remove the outer quotes which cause trailing quote issue
                exportContent += `${front}\t${back}\n`;
            }
            else if (card.mode === Modes.GeneralTopic) {
                const front = (card.front || '').trim();
                const back = (card.back || '').trim();
                
                exportContent += `${front}\t${back}\n`;
            }
        });

        // Create and download file
        const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'anki_cards.txt');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Update export status for selected cards
        selectedCards.forEach(cardId => {
            dispatch(updateCardExportStatus(cardId, 'exported_to_file'));
            console.log(`Updated card ${cardId} export status to 'exported_to_file'`);
        });

        // Add debug check of localStorage after status update
        setTimeout(() => {
            try {
                const rawData = localStorage.getItem('anki_stored_cards');
                if (rawData) {
                    const savedCards = JSON.parse(rawData);
                    console.log('Verified localStorage after file export:', 
                        savedCards.filter((c: any) => c.id && selectedCards.includes(c.id))
                            .map((c: any) => ({id: c.id, status: c.exportStatus}))
                    );
                }
            } catch (e) {
                console.error('Error verifying localStorage after file export:', e);
            }
        }, 500);
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
                                    <p style={{ 
                                        color: '#111827', 
                                        marginBottom: '2px',
                                        lineHeight: '1.4',
                                        wordWrap: 'break-word',
                                        overflow: 'visible',
                                        whiteSpace: 'normal'
                                    }}>{example}</p>
                                    {translation && <p style={{ 
                                        color: '#6B7280', 
                                        fontStyle: 'italic',
                                        lineHeight: '1.4',
                                        wordWrap: 'break-word',
                                        overflow: 'visible',
                                        whiteSpace: 'normal'
                                    }}>{translation}</p>}
                                </div>
                            ))}
                            {card.examples.length > 1 && (
                                <p style={{ fontSize: '11px', color: '#6B7280' }}>+{card.examples.length - 1} more examples</p>
                            )}
                        </div>
                    )}
                    {/* Check for either imageUrl or image to display */}
                    {(card.imageUrl || card.image) && (
                        <div style={{ marginTop: '8px', textAlign: 'center' }}>
                            <img 
                                src={(card.imageUrl || card.image || '') as string} 
                                alt="Card image" 
                                style={{ 
                                    maxWidth: '100%', 
                                    maxHeight: '80px', 
                                    borderRadius: '4px',
                                    border: '1px solid #E5E7EB',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                }} 
                                onError={(e) => {
                                    console.error('Image failed to load for card:', card.id, 'image data:', {
                                        hasImage: !!card.image,
                                        hasImageUrl: !!card.imageUrl,
                                        imageLength: card.image?.length,
                                        imageUrlLength: card.imageUrl?.length,
                                        imagePreview: card.image?.substring(0, 50),
                                        imageUrlPreview: card.imageUrl?.substring(0, 50),
                                        imageSrc: (card.imageUrl || card.image || '').substring(0, 100)
                                    });
                                    
                                    // Replace broken image with placeholder
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    
                                    // Create a placeholder div
                                    const placeholder = document.createElement('div');
                                    placeholder.style.cssText = `
                                        width: 100%;
                                        height: 60px;
                                        background-color: #F3F4F6;
                                        border: 1px dashed #D1D5DB;
                                        border-radius: 4px;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        color: #6B7280;
                                        font-size: 12px;
                                    `;
                                    placeholder.textContent = '🖼️ Image unavailable';
                                    
                                    // Insert placeholder after the failed image
                                    target.parentNode?.insertBefore(placeholder, target.nextSibling);
                                }}
                                onLoad={() => {
                                    console.log('✅ Image loaded successfully for card:', card.id, 'Size:', {
                                        imageLength: card.image?.length,
                                        imageUrlLength: card.imageUrl?.length
                                    });
                                }}
                            />
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

        return paginatedCards.map(card => (
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
                            {(card.image || card.imageUrl) && (
                                <span style={{ 
                                    fontSize: '11px', 
                                    color: '#10B981', 
                                    marginLeft: '8px',
                                    backgroundColor: '#ECFDF5',
                                    padding: '1px 4px',
                                    borderRadius: '3px',
                                    fontWeight: 'bold'
                                }}>
                                    📸 IMG
                                </span>
                            )}
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
                        {loadingDecks ? (
                            <span style={{ marginLeft: '2px' }}>
                                <Loader type="spinner" size="small" color="#4B5563" />
                            </span>
                        ) : (
                            <FaSync size={14} />
                        )}
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

                // Use OpenAI API for image generation
                console.log('Using OpenAI for image generation');

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
                // ONLY update the local editFormData, not the global Redux store
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
                        <button onClick={handleCancelEdit} style={{ ...formStyles.button, ...formStyles.cancelButton }}>
                            <FaTimes size={12} /> Cancel
                        </button>
                        <button onClick={handleSaveEdit} style={{ ...formStyles.button, ...formStyles.saveButton }}>
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
                                            <textarea
                                                value={example[0] || ''}
                                                onChange={(e) => handleExampleChange(index, true, e.target.value)}
                                                placeholder="Example"
                                                style={{
                                                    ...formStyles.input,
                                                    minHeight: '60px',
                                                    resize: 'vertical',
                                                    fontFamily: 'inherit',
                                                    lineHeight: '1.4'
                                                }}
                                            />
                                            <textarea
                                                value={example[1] || ''}
                                                onChange={(e) => handleExampleChange(index, false, e.target.value)}
                                                placeholder="Translation (optional)"
                                                style={{
                                                    ...formStyles.input,
                                                    minHeight: '60px',
                                                    resize: 'vertical',
                                                    fontFamily: 'inherit',
                                                    lineHeight: '1.4'
                                                }}
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
                                {(editFormData.imageUrl || editFormData.image) ? (
                                    <img 
                                        src={(editFormData.imageUrl || editFormData.image || '') as string} 
                                        alt="" 
                                        style={formStyles.image} 
                                    />
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
                                    {loadingImage ? 
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader type="pulse" size="small" inline color="#ffffff" text="Generating" />
    </div> : 'Generate New Image'}
                                </button>
                            </div>
                        </div>
                        
                        <div style={formStyles.fieldGroup}>
                            <label style={formStyles.label}>Grammar & Linguistics</label>
                            <textarea
                                value={editFormData.linguisticInfo || ''}
                                onChange={(e) => handleEditFormChange('linguisticInfo', e.target.value)}
                                placeholder="Enter grammar information, word forms, linguistic details..."
                                style={{
                                    ...formStyles.input,
                                    minHeight: '80px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    lineHeight: '1.4'
                                }}
                            />
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

    // Pagination controls
    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setItemsPerPage(Number(e.target.value));
        setCurrentPage(1); // Reset to first page when changing items per page
    };

    const renderPagination = () => {
        // Always show pagination controls regardless of item count
        // if (filteredCards.length <= itemsPerPage) {
        //     return null;
        // }

        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                marginTop: '16px',
                marginBottom: '16px',
                padding: '12px',
                backgroundColor: '#F9FAFB',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
            }}>
                {/* Top row with cards per page and results count */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <select
                            value={itemsPerPage}
                            onChange={handleItemsPerPageChange}
                            style={{
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid #D1D5DB',
                                fontSize: '13px',
                                backgroundColor: '#FFFFFF',
                                color: '#111827',
                                fontWeight: '500',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                appearance: 'none',
                                backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23424242%22%20d%3D%22M6%2C9L1.2%2C4.2%20c-0.4-0.4-0.4-1%2C0-1.4s1-0.4%2C1.4%2C0L6%2C6.2l3.4-3.4c0.4-0.4%2C1-0.4%2C1.4%2C0s0.4%2C1%2C0%2C1.4L6%2C9z%22%2F%3E%3C%2Fsvg%3E")',
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                                paddingRight: '28px',
                                minWidth: '90px'
                            }}
                            aria-label="Cards per page"
                        >
                            <option value={5}>5 per page</option>
                            <option value={10}>10 per page</option>
                            <option value={20}>20 per page</option>
                            <option value={50}>50 per page</option>
                        </select>
                    </div>
                    
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: '#4B5563',
                    }}>
                        {filteredCards.length > 0 ? 
                            `${Math.min((currentPage - 1) * itemsPerPage + 1, filteredCards.length)}-${Math.min(currentPage * itemsPerPage, filteredCards.length)} of ${filteredCards.length} cards` : 
                            '0 cards'
                        }
                    </div>
                </div>

                {/* Bottom row with page navigation */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}>
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        border: '1px solid #D1D5DB',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        backgroundColor: '#FFFFFF',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                    }}>
                        <button
                            onClick={() => handlePageChange(1)}
                            disabled={currentPage === 1}
                            style={{
                                padding: '8px 10px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderRight: '1px solid #E5E7EB',
                                cursor: currentPage === 1 ? 'default' : 'pointer',
                                color: currentPage === 1 ? '#9CA3AF' : '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => {
                                if (currentPage !== 1) e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Go to first page"
                            title="First page"
                        >
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                        
                        <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            style={{
                                padding: '8px 12px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderRight: '1px solid #E5E7EB',
                                cursor: currentPage === 1 ? 'default' : 'pointer',
                                color: currentPage === 1 ? '#9CA3AF' : '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => {
                                if (currentPage !== 1) e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Previous page"
                            title="Previous page"
                        >
                            <FaChevronLeft size={14} />
                        </button>

                        <div style={{ 
                            padding: '6px 16px',
                            fontSize: '13px',
                            fontWeight: '500',
                            color: '#111827',
                            display: 'flex',
                            alignItems: 'center',
                            backgroundColor: 'transparent',
                            borderRight: '1px solid #E5E7EB',
                            minWidth: '60px',
                            justifyContent: 'center'
                        }}>
                            {currentPage} / {totalPages || 1}
                        </div>

                        <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            style={{
                                padding: '8px 12px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                borderRight: '1px solid #E5E7EB',
                                cursor: (currentPage === totalPages || totalPages === 0) ? 'default' : 'pointer',
                                color: (currentPage === totalPages || totalPages === 0) ? '#9CA3AF' : '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => {
                                if (currentPage !== totalPages && totalPages !== 0) e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Next page"
                            title="Next page"
                        >
                            <FaChevronRight size={14} />
                        </button>
                        
                        <button
                            onClick={() => handlePageChange(totalPages)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            style={{
                                padding: '8px 10px',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: (currentPage === totalPages || totalPages === 0) ? 'default' : 'pointer',
                                color: (currentPage === totalPages || totalPages === 0) ? '#9CA3AF' : '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => {
                                if (currentPage !== totalPages && totalPages !== 0) e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                            aria-label="Go to last page"
                            title="Last page"
                        >
                            <svg width="14" height="14" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 15.707a1 1 0 001.414 0l5-5a1 1 0 000-1.414l-5-5a1 1 0 00-1.414 1.414L8.586 10l-4.293 4.293a1 1 0 000 1.414zm6 0a1 1 0 001.414 0l5-5a1 1 0 000-1.414l-5-5a1 1 0 00-1.414 1.414L14.586 10l-4.293 4.293a1 1 0 000 1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Debug function to reset viewing state and force reload
    const resetViewState = () => {
        console.log('Resetting view state...');
        setActiveFilter('all');
        setCurrentPage(1);
        setItemsPerPage(10);
        
        // Log current state of cards
        console.log('All cards in redux store:', storedCards);
        
        // Force reload cards from storage
        dispatch(loadStoredCards());
    };
    
    // Function to completely clear storage and reset (for emergency use)
    const clearAllCards = () => {
        if (window.confirm('This will delete ALL your cards. Are you sure?')) {
            console.log('Clearing all cards from storage...');
            try {
                localStorage.removeItem('anki_stored_cards');
                dispatch({ type: 'SET_STORED_CARDS', payload: [] });
                showError('All cards have been cleared. Refresh the page to start fresh.', 'info');
            } catch (error) {
                console.error('Error clearing storage:', error);
                showError('Failed to clear storage. Try again.', 'error');
            }
        }
    };

    // Function to fix storage quota issues by optimizing cards
    const fixStorageQuotaIssues = () => {
        console.log('=== STORAGE QUOTA FIX START ===');
        
        try {
            const rawData = localStorage.getItem('anki_stored_cards');
            if (!rawData) {
                showError('No cards found in localStorage.', 'error');
                return;
            }
            
            const sizeInBytes = new Blob([rawData]).size;
            const sizeInMB = sizeInBytes / (1024 * 1024);
            
            console.log(`Current storage size: ${sizeInMB.toFixed(2)}MB`);
            
            if (sizeInMB < 4) {
                showError(`Storage is healthy (${sizeInMB.toFixed(2)}MB). No optimization needed.`, 'success');
                return;
            }
            
            // Ask user if they want to optimize
            const shouldOptimize = window.confirm(
                `Your storage is using ${sizeInMB.toFixed(2)}MB. This may cause issues with saving new cards.\n\n` +
                'Would you like to optimize storage while preserving images? This will:\n' +
                '• Keep your newest cards with images\n' +
                '• Remove only the oldest cards if needed\n' +
                '• NOT remove images from preserved cards\n\n' +
                'Click OK to optimize, or Cancel to keep current state.'
            );
            
            if (!shouldOptimize) {
                return;
            }
            
            // Parse current cards
            const currentCards = JSON.parse(rawData);
            
            // Apply smart optimization
            const optimizedCards = currentCards
                .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) // Sort newest first
                .slice(0, Math.floor(currentCards.length * 0.8)); // Keep 80% of newest cards
            
            // Save optimized cards
            dispatch({ type: 'SET_STORED_CARDS', payload: optimizedCards });
            
            const newSize = new Blob([JSON.stringify(optimizedCards)]).size / (1024 * 1024);
            
            showError(
                `Optimization complete! Reduced from ${sizeInMB.toFixed(2)}MB to ${newSize.toFixed(2)}MB. ` +
                `Kept ${optimizedCards.length} of ${currentCards.length} newest cards with images preserved.`,
                'success'
            );
            
            console.log(`Storage optimization complete: ${currentCards.length} → ${optimizedCards.length} cards`);
            
        } catch (error) {
            console.error('Error fixing storage quota:', error);
            showError('Failed to optimize storage. Please try again.', 'error');
        }
        
        console.log('=== STORAGE QUOTA FIX END ===');
    };

    // Diagnostic function to check storage size and fix quota issues
    const diagnoseImageIssues = () => {
        console.log('=== IMAGE DIAGNOSIS START ===');
        
        // Load cards from localStorage directly
        const rawData = localStorage.getItem('anki_stored_cards');
        if (!rawData) {
            console.log('No cards found in localStorage');
            return;
        }
        
        try {
            const savedCards = JSON.parse(rawData);
            console.log('Total cards in localStorage:', savedCards.length);
            
            const cardsWithImages = savedCards.filter((card: StoredCard) => card.image || card.imageUrl);
            console.log('Cards with images in localStorage:', cardsWithImages.length);
            
            cardsWithImages.forEach((card: StoredCard, index: number) => {
                console.log(`\nCard ${index + 1} (${card.id}):`);
                console.log('- Text:', card.text);
                console.log('- Mode:', card.mode);
                console.log('- Has image?', !!card.image);
                console.log('- Has imageUrl?', !!card.imageUrl);
                
                if (card.image) {
                    console.log('- Image type:', typeof card.image);
                    console.log('- Image length:', card.image.length);
                    console.log('- Image starts with data:?', card.image.startsWith('data:'));
                    console.log('- Image preview:', card.image.substring(0, 100));
                }
                
                if (card.imageUrl) {
                    console.log('- ImageUrl type:', typeof card.imageUrl);
                    console.log('- ImageUrl length:', card.imageUrl.length);
                    console.log('- ImageUrl preview:', card.imageUrl.substring(0, 100));
                }
            });
            
            // Test Redux state
            console.log('\n=== REDUX STATE CHECK ===');
            console.log('Current storedCards length:', storedCards.length);
            const reduxCardsWithImages = storedCards.filter(card => card.image || card.imageUrl);
            console.log('Redux cards with images:', reduxCardsWithImages.length);
            
            reduxCardsWithImages.forEach((card, index) => {
                console.log(`Redux card ${index + 1} (${card.id}):`, {
                    text: card.text,
                    hasImage: !!card.image,
                    hasImageUrl: !!card.imageUrl,
                    imageLength: card.image?.length,
                    imageUrlLength: card.imageUrl?.length
                });
            });
            
            // Test image display
            console.log('\n=== IMAGE DISPLAY TEST ===');
            cardsWithImages.forEach((card: StoredCard) => {
                const imageToDisplay = card.imageUrl || card.image;
                if (imageToDisplay) {
                    console.log(`Card ${card.id} display test:`, {
                        imageSource: imageToDisplay.substring(0, 100),
                        isValidDataUri: imageToDisplay.startsWith('data:'),
                        isUrl: imageToDisplay.startsWith('http'),
                        canBeDisplayed: !!(imageToDisplay && (imageToDisplay.startsWith('data:') || imageToDisplay.startsWith('http')))
                    });
                }
            });
            
        } catch (error) {
            console.error('Error parsing localStorage cards:', error);
        }
        
        console.log('=== IMAGE DIAGNOSIS END ===');
    };

    const diagnosisAndRepair = () => {
        try {
            // First check what's in localStorage
            const rawData = localStorage.getItem('anki_stored_cards');
            if (!rawData) {
                showError('No cards found in localStorage.', 'error');
                return;
            }
            
            // Check storage size
            const storageSizeInBytes = new Blob([rawData]).size;
            const storageSizeInKB = Math.round(storageSizeInBytes / 1024);
            
            console.log(`Storage diagnosis: Size = ${storageSizeInKB}KB, Raw data length = ${rawData.length}`);
            
            try {
                // Parse the data
                const parsedCards = JSON.parse(rawData);
                
                if (!Array.isArray(parsedCards)) {
                    showError('Storage data is not a valid array!', 'error');
                    return;
                }
                
                // Display stats
                showError(`Found ${parsedCards.length} cards in localStorage (${storageSizeInKB}KB). Looking for quota issues...`, 'info');
                
                // Check if emergency quota function was triggered (exactly 4 cards is suspicious)
                if (parsedCards.length === 4) {
                    const shouldFix = window.confirm(
                        'It looks like you hit the storage quota limit, which is why only 4 cards are showing. ' +
                        'Would you like to try to recover your cards by reducing their size?'
                    );
                    
                    if (shouldFix) {
                        // Try to reduce size by removing large fields
                        const trimmedCards = parsedCards.map(card => {
                            // Create a version with smaller data
                            const trimmed = {
                                ...card,
                                // Remove the large image data which takes up most space
                                image: null,
                                // Keep only essential fields for display
                                text: card.text,
                                translation: card.translation,
                                front: card.front,
                                back: card.back ? card.back.substring(0, 500) : null, // Limit back field length
                                // Keep only a few examples
                                examples: card.examples && card.examples.length > 2 ? 
                                    card.examples.slice(0, 2) : card.examples
                            };
                            return trimmed;
                        });
                        
                        // Try to restore using trimmed cards
                        dispatch({ type: 'SET_STORED_CARDS', payload: trimmedCards });
                        
                        // Request backup of full cards for manual restore
                        const saveBackup = window.confirm(
                            'We have temporarily recovered your cards with reduced data. ' +
                            'Would you like to download a backup of your full cards for manual restore later?'
                        );
                        
                        if (saveBackup) {
                            // Create and download backup file
                            const blob = new Blob([rawData], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = 'anki_cards_backup.json';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            showError('Backup file downloaded. You can use this file later to restore your full cards.', 'success');
                        }
                        
                        showError('Your cards have been temporarily recovered with reduced data. Note that images have been removed to save space.', 'warning');
                    }
                } else {
                    showError(`Storage seems healthy. Found ${parsedCards.length} cards.`, 'success');
                }
                
            } catch (error) {
                console.error('Error parsing localStorage data:', error);
                showError('Error parsing localStorage data. Storage may be corrupted.', 'error');
            }
            
        } catch (error) {
            console.error('Error accessing localStorage:', error);
            showError('Error accessing localStorage', 'error');
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '12px',
            paddingBottom: '20px',
            overflowY: 'auto',
            width: '100%',
            maxWidth: '320px',
            margin: '0 auto'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid #E5E7EB',
                marginTop: '20px'
            }}>
                <div style={{ 
                    fontWeight: '600', 
                    fontSize: '16px',
                    color: '#111827',
                    background: 'linear-gradient(to right, #4F46E5, #2563EB)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    padding: '4px 12px',
                    borderRadius: '16px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}>
                    Saved Cards ({storedCards.length})
                </div>
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
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
                                {isLoading ? 
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader type="spinner" size="small" inline color="#ffffff" text="Saving to Anki" />
    </div> : 'Save to Anki'}
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
                            <button
                                onClick={diagnoseImageIssues}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#8B5CF6',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                title="Debug storage and image issues"
                            >
                                🔍
                                <span>Debug</span>
                            </button>
                            <button
                                onClick={fixStorageQuotaIssues}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#F59E0B',
                                    color: '#ffffff',
                                    fontSize: '13px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                title="Optimize storage to preserve images"
                            >
                                🛠️
                                <span>Optimize</span>
                            </button>
                        </div>
                    </div>

                    <div style={{ 
                        flex: 1, 
                        overflow: 'auto',
                        marginBottom: '16px'
                    }}>
                        {renderCards()}
                    </div>
                    
                    {/* Always render pagination outside scrollable area */}
                    {renderPagination()}
                </>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '300px',
                    color: '#6B7280',
                    textAlign: 'center'
                }}>
                    <p>No saved cards yet.</p>
                </div>
            )}
            
            {/* Remove the floating action button since we've added a button to the top navigation */}
        </div>
    );
};

export default StoredCards; 