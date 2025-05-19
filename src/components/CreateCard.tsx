import React, {useEffect, useState, useMemo, useCallback} from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import {RootState} from "../store";
import {setDeckId} from "../store/actions/decks";
import {saveCardToStorage, setBack, setExamples, setImage, setImageUrl, setTranslation, setText, loadStoredCards, setFront, updateStoredCard, setCurrentCardId} from "../store/actions/cards";
import { CardLangLearning, CardGeneral } from '../services/ankiService';
import {generateAnkiBack, generateAnkiFront, getDescriptionImage, getExamples, translateText} from "../services/openaiApi";
import { setMode, setShouldGenerateImage, setTranslateToLanguage, setAIInstructions, setImageInstructions } from "../store/actions/settings";
import {Modes} from "../constants";
import ResultDisplay from "./ResultDisplay";
import { OpenAI } from 'openai';
import { getImage } from '../apiUtils';
import useErrorNotification from './useErrorHandler';
import { setCurrentPage } from "../store/actions/page";
import { FaCog, FaLightbulb, FaCode, FaImage, FaMagic, FaTimes } from 'react-icons/fa';
import { loadCardsFromStorage } from '../store/middleware/cardsLocalStorage';
import { StoredCard } from '../store/reducers/cards';
import Loader from './Loader';
import { getAIService, getApiKeyForProvider, createTranslation, createExamples, createFlashcard } from '../services/aiServiceFactory';
import { ModelProvider } from '../store/reducers/settings';


interface CreateCardProps {
    // Пустой интерфейс, так как больше не нужен onSettingsClick
}

const CreateCard: React.FC<CreateCardProps> = () => {
    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const { text, translation, examples, image, imageUrl, front, back, currentCardId } = useSelector((state: RootState) => state.cards);
    const translateToLanguage = useSelector((state: RootState) => state.settings.translateToLanguage);
    const aiInstructions = useSelector((state: RootState) => state.settings.aiInstructions);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const mode = useSelector((state: RootState) => state.settings.mode);
    const [originalSelectedText, setOriginalSelectedText] = useState('');
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const [loadingGetResult, setLoadingGetResult] = useState(false);
    const [loadingNewImage, setLoadingNewImage] = useState(false);
    const [loadingNewExamples, setLoadingNewExamples] = useState(false);
    const [loadingAccept, setLoadingAccept] = useState(false);
    const [isEdited, setIsEdited] = useState(false);
    const [isNewSubmission, setIsNewSubmission] = useState(true);
    const [explicitlySaved, setExplicitlySaved] = useState(false);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const groqApiKey = useSelector((state: RootState) => state.settings.groqApiKey);
    const groqModelName = useSelector((state: RootState) => state.settings.groqModelName);
    const modelProvider = useSelector((state: RootState) => state.settings.modelProvider);
    const shouldGenerateImage = useSelector((state: RootState) => state.settings.shouldGenerateImage);
    const [showAISettings, setShowAISettings] = useState(false);
    const [showImageSettings, setShowImageSettings] = useState(false);
    const [localAIInstructions, setLocalAIInstructions] = useState(aiInstructions);
    const [localImageInstructions, setLocalImageInstructions] = useState(imageInstructions);
    const { showError, renderErrorNotification } = useErrorNotification()
    const openai = new OpenAI({
        apiKey: openAiKey,
        dangerouslyAllowBrowser: true,
    });
    const [customInstruction, setCustomInstruction] = useState('');
    const [isProcessingCustomInstruction, setIsProcessingCustomInstruction] = useState(false);
    const [showModal, setShowModal] = useState(false);
    
    // Selector для получения всех сохраненных карточек
    const storedCards = useSelector((state: RootState) => state.cards.storedCards);
    
    // Get the appropriate AI service based on the selected provider
    const aiService = useMemo(() => getAIService(modelProvider as ModelProvider), [modelProvider]);
    
    // Get the appropriate API key based on the selected provider
    const apiKey = useMemo(() => 
        getApiKeyForProvider(
            modelProvider as ModelProvider, 
            openAiKey, 
            groqApiKey
        ), 
        [modelProvider, openAiKey, groqApiKey]
    );
    
    // Derive isSaved from both currentCardId AND storage check
    const isSaved = useMemo(() => {
        console.log('Calculating isSaved:', { currentCardId, explicitlySaved });
        
        // Only consider a card saved if it has been explicitly saved by the user in this session
        if (currentCardId && explicitlySaved) {
            return true;
        }
        
        // No longer automatically marking cards as saved just because text matches something in storage
        // This was causing the "Saved to Collection" message to appear prematurely
        
        return false;
    }, [currentCardId, explicitlySaved]);

    // Add more detailed logging to debug the issue
    console.log('Card state details:', { 
        isNewSubmission, 
        explicitlySaved,
        isSaved, 
        currentCardId, 
        text: text.substring(0, 20) + (text.length > 20 ? '...' : ''),
        localStorage_explicitly_saved: localStorage.getItem('explicitly_saved')
    });

    const popularLanguages = [
        { code: 'ru', name: 'Русский' },
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Español' },
        { code: 'fr', name: 'Français' },
        { code: 'de', name: 'Deutsch' },
        { code: 'it', name: 'Italiano' },
        { code: 'pt', name: 'Português' },
        { code: 'ja', name: '日本語' },
        { code: 'ko', name: '한국어' },
        { code: 'zh', name: '中文' },
        { code: 'ar', name: 'العربية' },
    ];

    // Track changes to card data
    useEffect(() => {
        if (isSaved) {
            setIsEdited(true);
        }
    }, [text, translation, examples, image, imageUrl, front, isSaved]);

    // Add a function to check if a card with this text already exists in storage
    const checkExistingCard = useCallback((textToCheck: string) => {
        if (!textToCheck || textToCheck.trim() === '') {
            return;
        }
        
        // Load cards directly from storage to ensure we have the latest data
        const storedCards = loadCardsFromStorage();
        const exactMatch = storedCards.find((card: StoredCard) => card.text === textToCheck);
        
        if (exactMatch) {
            console.log('Found existing card with matching text:', exactMatch?.text || textToCheck, 'ID:', exactMatch.id);
            console.log('Setting currentCardId but NOT setting explicitlySaved');
            
            // Only set the ID for reference, but DON'T mark as explicitly saved
            // This ensures "Saved to Collection" only appears after user explicitly saves
            dispatch(setCurrentCardId(exactMatch.id));
            
            // IMPORTANT: We do NOT set explicitlySaved to true here, as that would cause
            // the "Saved to Collection" message to appear prematurely
            return true;
        }
        
        return false;
    }, [dispatch]);
    
    // Update the handle text change to check for existing cards
    const handleTextChange = (newText: string) => {
        dispatch(setText(newText));
        
        // If the card is already marked as saved, check if it's being edited
        if (isSaved) {
            setIsEdited(true);
        } else {
            // Check if this text already exists as a card
            checkExistingCard(newText);
        }
    };

    // Handler for translation update
    const handleTranslationUpdate = (newTranslation: string) => {
        dispatch(setTranslation(newTranslation));
        if (isSaved) {
            setIsEdited(true);
        }
    };

    // Handler for examples update
    const handleExamplesUpdate = (newExamples: Array<[string, string | null]>) => {
        dispatch(setExamples(newExamples));
        if (isSaved) {
            setIsEdited(true);
        }
    };

    const handleNewImage = async () => {
        setLoadingNewImage(true);
        try {
            const descriptionImage = await aiService.getDescriptionImage(apiKey, text, imageInstructions);
            
            // Use different image generation based on provider
            if (modelProvider === ModelProvider.OpenAI) {
                // Use existing OpenAI implementation
                const { imageUrl, imageBase64 } = await getImage(null, openai, openAiKey, descriptionImage, imageInstructions);
                
                if (imageUrl) {
                    dispatch(setImageUrl(imageUrl));
                }
                if (imageBase64) {
                    dispatch(setImage(imageBase64));
                }
            } else {
                // Other models - show error that image generation isn't supported
                showError("Image generation is not supported with the selected provider.");
            }
        } catch (error) {
            console.error('Error generating image:', error);
            showError(error instanceof Error ? error.message : "Failed to generate image");
        } finally {
            setLoadingNewImage(false);
        }
        
        if (isSaved) {
            setIsEdited(true);
        }
    }

    const handleNewExamples = async () => {
        setLoadingNewExamples(true);
        try {
            const newExamplesResult = await createExamples(
                aiService,
                apiKey,
                text,
                translateToLanguage,
                true,
                aiInstructions
            );
            
            if (newExamplesResult && newExamplesResult.length > 0) {
                // Преобразуем в старый формат для совместимости с существующим кодом
                const formattedExamples = newExamplesResult.map(example => 
                    [example.original, example.translated] as [string, string | null]
                );
                dispatch(setExamples(formattedExamples));
            }
        } catch (error) {
            console.error('Error getting examples:', error);
            showError(error instanceof Error ? error.message : "Failed to generate examples");
        } finally {
            setLoadingNewExamples(false);
        }
        
        if (isSaved) {
            setIsEdited(true);
        }
    };

    const handleApplyCustomInstruction = async () => {
        if (!customInstruction.trim() || isProcessingCustomInstruction) {
            return;
        }
        
        setIsProcessingCustomInstruction(true);
        
        try {
            // Apply different actions based on content analysis
            if (customInstruction.toLowerCase().includes('image') || 
                customInstruction.toLowerCase().includes('picture') ||
                customInstruction.toLowerCase().includes('изображени') ||
                customInstruction.toLowerCase().includes('картин')) {
                
                // Generate new image based on instructions
                const descriptionImage = await getDescriptionImage(openAiKey, text, customInstruction);
                const { imageUrl, imageBase64 } = await getImage(null, openai, openAiKey, descriptionImage, customInstruction);
                
                if (imageUrl) {
                    dispatch(setImageUrl(imageUrl));
                }
                if (imageBase64) {
                    dispatch(setImage(imageBase64));
                }
                
                showError('Image updated with your instructions!', 'success');
                
            } else if (customInstruction.toLowerCase().includes('example') || 
                      customInstruction.toLowerCase().includes('sentence') || 
                      customInstruction.toLowerCase().includes('пример') || 
                      customInstruction.toLowerCase().includes('предложени')) {
                
                // Generate new examples based on instructions
                const newExamples = await getExamples(openAiKey, text, translateToLanguage, true, customInstruction);
                dispatch(setExamples(newExamples));
                
                showError('Examples updated with your instructions!', 'success');
                
            } else if (customInstruction.toLowerCase().includes('translat') || 
                      customInstruction.toLowerCase().includes('перевод')) {
                
                // Update translation based on instructions
                const translatedText = await translateText(openAiKey, text, translateToLanguage, customInstruction);
                dispatch(setTranslation(translatedText));
                
                showError('Translation updated with your instructions!', 'success');
                
            } else {
                // Apply all updates if the intent is not clear
                const translatedText = await translateText(openAiKey, text, translateToLanguage, customInstruction);
                const newExamples = await getExamples(openAiKey, text, translateToLanguage, true, customInstruction);
                
                if (shouldGenerateImage) {
                    const descriptionImage = await getDescriptionImage(openAiKey, text, customInstruction);
                    const { imageUrl, imageBase64 } = await getImage(null, openai, openAiKey, descriptionImage, customInstruction);
                    
                    if (imageUrl) {
                        dispatch(setImageUrl(imageUrl));
                    }
                    if (imageBase64) {
                        dispatch(setImage(imageBase64));
                    }
                }
                
                dispatch(setTranslation(translatedText));
                dispatch(setExamples(newExamples));
                
                showError('Content updated with your instructions!', 'success');
            }
            
            // Clear the instruction after applying
            setCustomInstruction('');
            
        } catch (error) {
            showError('Error applying your instructions. Please try again.');
            console.error('Error applying custom instructions:', error);
        } finally {
            setIsProcessingCustomInstruction(false);
        }
    };

    const handleCustomInstructionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleApplyCustomInstruction();
        }
    };

    const handleSettingsClick = () => {
        // Эта функция больше не нужна, но оставим ее пустой, чтобы не рефакторить весь код
    };

    // Function to determine if image generation is available for the current provider
    const isImageGenerationAvailable = () => {
        return modelProvider !== ModelProvider.Groq;
    };

    const handleImageToggle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        
        // Don't allow toggling on if image generation is not available
        if (isChecked && !isImageGenerationAvailable()) {
            return;
        }
        
        dispatch(setShouldGenerateImage(isChecked));
        
        // If toggling on, try to generate an image
        if (isChecked && text) {
            try {
                await handleNewImage();
            } catch (error) {
                console.error("Failed to generate image on toggle:", error);
            }
        }
    };

    const handleAccept = async () => {
        showError(null);
        try {
            setLoadingAccept(true);
            
            const cardId = currentCardId || Date.now().toString();
            
            // Debug the required fields
            console.log('Saving card with data:', {
                originalSelectedText,
                text,
                translation,
                examples: examples.length,
                mode,
                currentCardId
            });
            
            if (mode === Modes.LanguageLearning) {
                // Allow saving if we have at least a text to save
                if (!text && !originalSelectedText) {
                    console.error('Missing text data for card');
                    showError('Please enter or select some text for your card before saving.');
                    return;
                }
                
                // Use text as fallback if originalSelectedText is missing
                const cardText = originalSelectedText || text;
                
                const cardData = {
                    id: cardId,
                    mode,
                    text: cardText,
                    translation,
                    examples,
                    image,
                    imageUrl,
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const
                };
                
                console.log('Saving card to storage:', cardData);
                
                if (currentCardId) {
                    dispatch(updateStoredCard(cardData));
                } else {
                    dispatch(saveCardToStorage(cardData));
                    dispatch(setCurrentCardId(cardId));
                }
                
            } else if (mode === Modes.GeneralTopic) {
                // Для GeneralTopic будем использовать front вместо back
                if (!front) {
                    console.error('Missing front data for general topic card');
                    showError('Please generate card content before saving.');
                    return;
                }
                
                // Use text as fallback if originalSelectedText is missing
                const cardText = originalSelectedText || text || '';
                
                const cardData = {
                    id: cardId,
                    mode,
                    front,
                    // Вместо back будем использовать комбинацию перевода и примеров
                    // или front в случае их отсутствия
                    back: translation || front,
                    text: cardText,
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const
                };
                
                console.log('Saving general topic card to storage:', cardData);
                
                if (currentCardId) {
                    dispatch(updateStoredCard(cardData));
                } else {
                    dispatch(saveCardToStorage(cardData));
                    dispatch(setCurrentCardId(cardId));
                }
            }
            
            // Important: When the user explicitly saves the card, mark it as explicitly saved
            // and store this state in localStorage
            setExplicitlySaved(true);
            localStorage.setItem('explicitly_saved', 'true');
            
            if (isEdited) {
                showError('Card updated successfully!', 'success');
            } else {
                showError('Card saved successfully!', 'success');
            }
            
            setIsEdited(false);
            setIsNewSubmission(false); // Reset the new submission flag after explicitly saving
            
        } catch (error) {
            console.error('Error saving card:', error);
            showError('Error saving card. Please try again.');
        } finally {
            setLoadingAccept(false);
        }
    };
    
    // Add a function to create a new card after saving
    const handleCreateNew = () => {
        setShowResult(false);
        setIsEdited(false);
        dispatch(setCurrentCardId(null));
        setIsNewSubmission(true);
        setExplicitlySaved(false); // Reset explicit save
        localStorage.removeItem('explicitly_saved'); // Also remove from localStorage
        
        dispatch(setText(''));
        dispatch(setTranslation(''));
        dispatch(setExamples([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        setOriginalSelectedText('');
    };

    const handleViewSavedCards = () => {
        dispatch(setCurrentPage('storedCards'));
    };

    useEffect(() => {
        const handleMouseUp = () => {
            const selectedText = window.getSelection()?.toString().trim();
            if (selectedText) {
                dispatch(setText(selectedText));
            }
        };
    
        document.addEventListener('mouseup', handleMouseUp);
    
        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dispatch]);    

    useEffect(() => {
        // Пока по дефолту ставим LanguageLearning
        dispatch(setMode(Modes.LanguageLearning))

        if (text && translation && examples.length > 0) {
            setShowResult(true);
        } else {
            setShowResult(false);
        }
        
        // Load stored cards from localStorage on initial load
        dispatch(loadStoredCards());
    }, [dispatch]);

    // Ensure cards load correctly on page refresh, and check saved status before showing UI
    useEffect(() => {
        // Only run once on component mount
        const checkSavedCardsOnMount = async () => {
            console.log('Running saved cards check on mount');
            
            // First, ensure stored cards are loaded from localStorage
            dispatch(loadStoredCards());
            
            // Wait a brief moment to ensure cards are loaded
            setTimeout(() => {
                const savedCards = loadCardsFromStorage();
                console.log('Loaded cards from storage:', savedCards.length);
                
                // Get currentCardId from localStorage
                const savedCardId = localStorage.getItem('current_card_id');
                const explicitlySavedFlag = localStorage.getItem('explicitly_saved');
                
                console.log('localStorage values on mount:', { 
                    savedCardId, 
                    explicitlySavedFlag,
                    cardCount: savedCards.length
                });
                
                if (savedCardId) {
                    console.log('Found current card ID in localStorage:', savedCardId);
                    // Find the card by ID
                    const savedCard = savedCards.find((card: StoredCard) => card.id === savedCardId);
                    
                    if (savedCard) {
                        console.log('Restoring card from storage:', savedCard);
                        // If card is found by ID, update the state
                        setIsEdited(false);
                        setIsNewSubmission(false);
                        
                        // Set explicitlySaved based on localStorage flag
                        if (explicitlySavedFlag === 'true') {
                            console.log('Setting explicitlySaved to TRUE based on localStorage flag');
                            setExplicitlySaved(true);
                        } else {
                            console.log('Setting explicitlySaved to FALSE based on localStorage flag');
                            setExplicitlySaved(false);
                        }
                        
                        // Restore card data
                        dispatch(setCurrentCardId(savedCardId));
                        dispatch(setText(savedCard.text));
                        if (savedCard.translation) dispatch(setTranslation(savedCard.translation));
                        if (savedCard.examples) dispatch(setExamples(savedCard.examples));
                        if (savedCard.image) dispatch(setImage(savedCard.image));
                        if (savedCard.imageUrl) dispatch(setImageUrl(savedCard.imageUrl));
                        if (savedCard.front) dispatch(setFront(savedCard.front));
                        if (savedCard.back) dispatch(setBack(savedCard.back));
                        setOriginalSelectedText(savedCard.text);
                        
                        setShowResult(true);
                    } else {
                        console.log('Card ID from localStorage not found in storage, resetting');
                        // If card with this ID no longer exists, clear the ID
                        localStorage.removeItem('current_card_id');
                        localStorage.removeItem('explicitly_saved');
                        dispatch(setCurrentCardId(null));
                        setIsNewSubmission(true);
                        setExplicitlySaved(false);
                    }
                } else {
                    console.log('No current card ID in localStorage');
                    setIsNewSubmission(true);
                    setExplicitlySaved(false);
                }
            }, 200); // Increased timeout to ensure cards are loaded
        };
        
        checkSavedCardsOnMount();
        // This effect should only run once on mount, so empty dependency array
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
        
    // Проверка при загрузке или изменении текста, была ли карточка уже сохранена
    useEffect(() => {
        // Skip this check entirely for new submissions or if text is empty
        if (!text || isNewSubmission || text.trim() === '') {
            return;
        }
        
        // Check if this is a new card being created (don't interfere with the creation flow)
        if (showResult && !currentCardId) {
            console.log('New card being created, skipping automatic saved detection');
            return;
        }
        
        // If we're actively typing in a new card (not yet saved), make sure it's not marked as saved
        if (!currentCardId) {
            console.log('Actively typing new card text - ensuring not marked as saved');
            setExplicitlySaved(false);
            localStorage.removeItem('explicitly_saved');
        }
        
        // Check if the card already exists in storage
        checkExistingCard(text);
        
    }, [text, currentCardId, isNewSubmission, showResult, checkExistingCard]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;
        
        // IMPORTANT: Explicitly clear saved state when creating a new card
        setExplicitlySaved(false);
        localStorage.removeItem('explicitly_saved');
        
        setLoadingGetResult(true);
        setOriginalSelectedText(text);
        
        // Clear any previous errors
        showError(null);
        
        try {
            // Debug logging
            console.log("=== DEBUG INFO ===");
            console.log("Model Provider:", modelProvider);
            console.log("API Key available:", Boolean(apiKey));
            console.log("Model Name (if Groq):", modelProvider === ModelProvider.Groq ? groqModelName : 'N/A');
            console.log("AI Service:", Object.keys(aiService));
            
            if (!apiKey) {
                throw new Error(`API key for ${modelProvider} is missing. Please go to settings and add your API key.`);
            }
            
            // Track which operations completed successfully to give better error messages
            let completedOperations = {
                translation: false,
                examples: false,
                flashcard: false,
                image: false
            };
            
            try {
                // 1. Get translation
                const translation = await createTranslation(
                    aiService, 
                    apiKey, 
                    text, 
                    translateToLanguage, 
                    aiInstructions
                );
                
                if (translation.translated) {
                    dispatch(setTranslation(translation.translated));
                    completedOperations.translation = true;
                }
            } catch (translationError) {
                console.error('Translation failed:', translationError);
                throw new Error(`Translation failed: ${translationError instanceof Error ? translationError.message : "Unknown error"}`);
            }
            
            try {
                // 2. Get examples
                const examplesResult = await createExamples(
                    aiService, 
                    apiKey, 
                    text, 
                    translateToLanguage, 
                    true, 
                    aiInstructions
                );
                
                if (examplesResult && examplesResult.length > 0) {
                    // Convert to old format for compatibility with existing code
                    const formattedExamples = examplesResult.map(example => 
                        [example.original, example.translated] as [string, string | null]
                    );
                    dispatch(setExamples(formattedExamples));
                    completedOperations.examples = true;
                }
            } catch (examplesError) {
                console.error('Examples generation failed:', examplesError);
                // Continue if translation worked but examples failed
                if (completedOperations.translation) {
                    showError(`Examples generation failed: ${examplesError instanceof Error ? examplesError.message : "Unknown error"}. Continuing with translation only.`, 'warning');
                } else {
                    throw new Error(`Examples generation failed: ${examplesError instanceof Error ? examplesError.message : "Unknown error"}`);
                }
            }
            
            try {
                // 3. Create flashcard
                const flashcard = await createFlashcard(aiService, apiKey, text);
                
                if (flashcard.front) {
                    dispatch(setFront(flashcard.front));
                    completedOperations.flashcard = true;
                }
            } catch (flashcardError) {
                console.error('Flashcard creation failed:', flashcardError);
                // Continue if at least translation worked
                if (completedOperations.translation) {
                    showError(`Flashcard creation failed: ${flashcardError instanceof Error ? flashcardError.message : "Unknown error"}. Continuing with available data.`, 'warning');
                } else {
                    throw new Error(`Flashcard creation failed: ${flashcardError instanceof Error ? flashcardError.message : "Unknown error"}`);
                }
            }
            
            // 4. Generate image if needed and supported
            if (shouldGenerateImage) {
                try {
                    const descriptionImage = await aiService.getDescriptionImage(apiKey, text, imageInstructions);
                    
                    if (modelProvider === ModelProvider.OpenAI) {
                        const { imageUrl, imageBase64 } = await getImage(null, openai, openAiKey, descriptionImage, imageInstructions);
                        
                        if (imageUrl) {
                            dispatch(setImageUrl(imageUrl));
                        }
                        if (imageBase64) {
                            dispatch(setImage(imageBase64));
                        }
                        completedOperations.image = true;
                    } else {
                        // Skip image for providers that don't support it
                        console.log('Image generation not supported for this provider');
                    }
                } catch (imageError) {
                    console.error('Image generation failed:', imageError);
                    // Image errors are not critical - continue with the card creation
                    if (completedOperations.translation || completedOperations.examples) {
                        showError(`Image generation failed: ${imageError instanceof Error ? imageError.message : "Unknown error"}. Continuing without image.`, 'warning');
                    }
                }
            }
            
            // Ensure this is treated as a brand new card
            dispatch(setCurrentCardId(null));
            
            // Show modal if we have at least some data
            if (completedOperations.translation || completedOperations.examples || completedOperations.flashcard) {
                setShowResult(true);
                setShowModal(true);
                setIsNewSubmission(true);
            } else {
                throw new Error("Failed to create card: No data was successfully generated. Please check your API key and try again.");
            }
        } catch (error) {
            console.error('Error processing text:', error);
            showError(error instanceof Error 
                ? `${error.message}` 
                : "Failed to create card. Please check your API key and try again.");
            setShowResult(false);
            setShowModal(false);
        } finally {
            setLoadingGetResult(false);
        }
    };

    const handleSaveAISettings = () => {
        dispatch(setAIInstructions(localAIInstructions));
        setShowAISettings(false);
        showError('AI settings saved successfully!', 'success');
    };

    const handleSaveImageSettings = () => {
        dispatch(setImageInstructions(localImageInstructions));
        setShowImageSettings(false);
        showError('Image instructions saved successfully!', 'success');
    };
    
    // Render AI Settings Panel
    const renderAISettings = () => {
        if (!showAISettings) {
            return (
                <button
                    onClick={() => setShowAISettings(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        color: '#4B5563',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'center'
                    }}
                >
                    <FaCog size={14} />
                    Customize AI behavior
                </button>
            );
        }
        
        return (
            <div style={{
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '16px',
                width: '100%',
                marginBottom: '12px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <FaLightbulb size={14} color="#2563EB" />
                        AI Instructions
                    </h3>
                    <button
                        onClick={() => setShowAISettings(false)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6B7280',
                            fontSize: '13px'
                        }}
                    >
                        Cancel
                    </button>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151'
                    }}>
                        Additional instructions for AI
                    </label>
                    <textarea
                        value={localAIInstructions}
                        onChange={(e) => setLocalAIInstructions(e.target.value)}
                        placeholder="E.g., Keep specialized terms untranslated. Make examples more advanced. Use formal language."
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            fontSize: '14px',
                            minHeight: '100px',
                            resize: 'vertical'
                        }}
                    />
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px', lineHeight: '1.4' }}>
                        <p style={{ margin: '0 0 6px 0', fontWeight: '500' }}>How to use:</p>
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            <li>These are <strong>additional</strong> instructions that supplement the basic AI behavior</li>
                            <li>The original word will always be used (no need to specify it)</li>
                            <li>Examples will always be generated for the word you're learning</li>
                            <li>Use this for style guidance, preferences, or special requirements</li>
                        </ul>
                    </div>
                </div>
                
                <button
                    onClick={handleSaveAISettings}
                    style={{
                        backgroundColor: '#2563EB',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    <FaCode size={14} />
                    Save Instructions
                </button>
            </div>
        );
    };

    // Render Image Settings Panel
    const renderImageSettings = () => {
        if (!shouldGenerateImage) return null;
        
        if (!showImageSettings) {
            return (
                <button
                    onClick={() => setShowImageSettings(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F3F4F6',
                        border: '1px solid #E5E7EB',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '13px',
                        color: '#4B5563',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'center',
                        marginTop: '8px'
                    }}
                >
                    <FaImage size={14} />
                    Customize image generation
                </button>
            );
        }
        
        return (
            <div style={{
                backgroundColor: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '16px',
                width: '100%',
                marginBottom: '12px',
                marginTop: '8px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '16px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <FaImage size={14} color="#10B981" />
                        Image Instructions
                    </h3>
                    <button
                        onClick={() => setShowImageSettings(false)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6B7280',
                            fontSize: '13px'
                        }}
                    >
                        Cancel
                    </button>
                </div>
                
                <div style={{ marginBottom: '16px' }}>
                    <label style={{
                        display: 'block',
                        marginBottom: '4px',
                        fontSize: '14px',
                        fontWeight: 500,
                        color: '#374151'
                    }}>
                        Image generation style
                    </label>
                    <textarea
                        value={localImageInstructions}
                        onChange={(e) => setLocalImageInstructions(e.target.value)}
                        placeholder="E.g., use anime style, make it minimalist, use pastel colors, make it black and white"
                        style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            fontSize: '14px',
                            minHeight: '100px',
                            resize: 'vertical'
                        }}
                    />
                    <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '8px', lineHeight: '1.4' }}>
                        <p style={{ margin: '0 0 6px 0', fontWeight: '500' }}>How to use:</p>
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            <li>These are <strong>style instructions</strong> for image generation</li>
                            <li>The image will still be related to the word you're learning</li>
                            <li>Focus on artistic style, mood, colors, composition, etc.</li>
                            <li>Examples: "watercolor style", "dark background", "realistic rendering"</li>
                        </ul>
                    </div>
                </div>
                
                <button
                    onClick={handleSaveImageSettings}
                    style={{
                        backgroundColor: '#10B981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}
                >
                    <FaImage size={14} />
                    Save Image Instructions
                </button>
            </div>
        );
    };

    // Add a way to cancel the current card and reset to fresh state
    const handleCancel = () => {
        setShowResult(false);
        setIsEdited(false);
        dispatch(setCurrentCardId(null));
        setIsNewSubmission(true);
        setExplicitlySaved(false); // Reset explicit save
        localStorage.removeItem('explicitly_saved'); // Also remove from localStorage
        
        // Reset all form fields
        dispatch(setText(''));
        dispatch(setTranslation(''));
        dispatch(setExamples([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        dispatch(setFront(''));
        dispatch(setBack(null));
        setOriginalSelectedText('');
    };

    // Add a function to render the AI provider badge
    const renderProviderBadge = () => {
        switch (modelProvider) {
            case ModelProvider.OpenAI:
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginLeft: '8px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#10a37f',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: '600'
                    }}>
                        OpenAI
                    </span>
                );
            case ModelProvider.Groq:
                return (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        marginLeft: '8px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: '#7c3aed',
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: '600'
                    }}>
                        Groq
                    </span>
                );
            default:
                return null;
        }
    };

    // Function to handle modal close
    const handleCloseModal = () => {
        // If the card is not saved but has content, offer to save it
        if (showResult && !isSaved && !isEdited && translation) {
            const shouldSave = window.confirm('Would you like to save this card to your collection?');
            if (shouldSave) {
                handleAccept();
            }
        }
        setShowModal(false);
    };

    // Render the modal
    const renderModal = () => {
        if (!showModal || !showResult) return null;
        
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(2px)',
                padding: '16px'
            }} onClick={handleCloseModal}>
                <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    maxWidth: '340px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    position: 'relative',
                    padding: '16px'
                }} onClick={(e) => e.stopPropagation()}>
                    <div style={{
                        position: 'sticky',
                        top: 0,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: '1px solid #E5E7EB',
                        paddingBottom: '12px',
                        marginBottom: '16px',
                        backgroundColor: '#ffffff',
                        zIndex: 2
                    }}>
                        <h3 style={{
                            margin: 0,
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#111827'
                        }}>
                            Your Card
                        </h3>
                        <button 
                            onClick={handleCloseModal}
                            style={{
                                background: 'none',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '8px',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            aria-label="Close"
                        >
                            <FaTimes size={16} color="#6B7280" />
                        </button>
                    </div>
                    
                    {/* Add error notification in modal */}
                    <div style={{ marginBottom: '12px' }}>
                        {renderErrorNotification()}
                    </div>
                    
                    <div style={{
                        width: '100%',
                        marginBottom: '12px'
                    }}>
                        <div style={{
                            position: 'relative',
                            width: '100%',
                        }}>
                            <input
                                type="text"
                                value={customInstruction}
                                onChange={(e) => setCustomInstruction(e.target.value)}
                                onKeyDown={handleCustomInstructionKeyDown}
                                placeholder="Enter custom instructions (e.g., 'more formal examples', 'change image style')"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    paddingRight: '40px',
                                    borderRadius: '6px',
                                    border: '1px solid #E5E7EB',
                                    fontSize: '14px',
                                    color: '#374151',
                                }}
                                disabled={isProcessingCustomInstruction}
                            />
                            <button
                                onClick={handleApplyCustomInstruction}
                                disabled={!customInstruction.trim() || isProcessingCustomInstruction}
                                style={{
                                    position: 'absolute',
                                    right: '8px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'none',
                                    border: 'none',
                                    color: customInstruction.trim() && !isProcessingCustomInstruction ? '#2563EB' : '#9CA3AF',
                                    cursor: customInstruction.trim() && !isProcessingCustomInstruction ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '4px'
                                }}
                            >
                                <FaMagic size={16} />
                            </button>
                        </div>
                        <div style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            marginTop: '4px',
                        }}>
                            {isProcessingCustomInstruction ? 'Applying your instructions...' : 'Type instructions and press Enter or click the magic wand'}
                        </div>
                    </div>
                    
                    <ResultDisplay
                        mode={mode}
                        front={front}
                        translation={translation}
                        examples={examples}
                        imageUrl={imageUrl}
                        image={image}
                        onNewImage={handleNewImage}
                        onNewExamples={handleNewExamples}
                        onAccept={handleAccept}
                        onViewSavedCards={handleViewSavedCards}
                        onCancel={handleCancel}
                        loadingNewImage={loadingNewImage}
                        loadingNewExamples={loadingNewExamples}
                        loadingAccept={loadingAccept}
                        shouldGenerateImage={shouldGenerateImage}
                        isSaved={isSaved}
                        isEdited={isEdited}
                        setTranslation={handleTranslationUpdate}
                        setExamples={handleExamplesUpdate}
                    />
                </div>
            </div>
        );
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            width: '100%',
            height: '100%',
            position: 'relative'
        }}>
            {loadingGetResult && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    padding: '0 20px'
                }}>
                    <Loader type="spinner" size="large" color="#3B82F6" text="Creating your Anki card..." />
                    <div style={{ 
                        backgroundColor: '#F3F4F6', 
                        padding: '10px 16px', 
                        borderRadius: '8px', 
                        fontSize: '13px',
                        color: '#4B5563',
                        maxWidth: '90%',
                        textAlign: 'center',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                    }}>
                        We're analyzing your text and generating learning materials
                    </div>
                </div>
            )}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: '12px',
                width: '100%',
                padding: '12px',
                paddingTop: '16px',
                height: '100%',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                paddingBottom: '16px'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    maxWidth: '320px'
                }}>
                    {mode === Modes.LanguageLearning && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            width: '100%',
                            gap: '8px'
                        }}>
                            <div style={{
                                position: 'relative',
                                width: '100%',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <label htmlFor="language" style={{
                                    color: '#111827',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    margin: 0
                                }}>Translate to:</label>
                            </div>
                            <select
                                id="language"
                                value={translateToLanguage}
                                onChange={(e) => dispatch(setTranslateToLanguage(e.target.value))}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #E5E7EB',
                                    backgroundColor: '#ffffff',
                                    color: '#374151',
                                    fontSize: '14px',
                                    outline: 'none',
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            >
                                {popularLanguages.map(({ code, name }) => (
                                    <option key={code} value={code}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginTop: '4px'
                            }}>
                                <label htmlFor="generateImage" style={{
                                    color: '#111827',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    margin: 0
                                }}>Image:</label>
                                <div style={{
                                    position: 'relative',
                                    display: 'inline-block',
                                    width: '40px',
                                    height: '22px',
                                    opacity: isImageGenerationAvailable() ? 1 : 0.5
                                }}>
                                    <input
                                        type="checkbox"
                                        id="generateImage"
                                        checked={shouldGenerateImage}
                                        onChange={handleImageToggle}
                                        disabled={!isImageGenerationAvailable()}
                                        style={{
                                            opacity: 0,
                                            width: 0,
                                            height: 0
                                        }}
                                    />
                                    <label
                                        htmlFor="generateImage"
                                        style={{
                                            position: 'absolute',
                                            cursor: isImageGenerationAvailable() ? 'pointer' : 'not-allowed',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            backgroundColor: shouldGenerateImage ? '#2563EB' : '#E5E7EB',
                                            transition: '.3s',
                                            borderRadius: '22px'
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute',
                                            content: '""',
                                            height: '18px',
                                            width: '18px',
                                            left: '2px',
                                            bottom: '2px',
                                            backgroundColor: 'white',
                                            transition: '.3s',
                                            borderRadius: '50%',
                                            transform: shouldGenerateImage ? 'translateX(18px)' : 'translateX(0)'
                                        }} />
                                    </label>
                                </div>
                                {!isImageGenerationAvailable() && shouldGenerateImage && (
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#EF4444',
                                        marginLeft: '4px'
                                    }}>
                                        Not available with Groq
                                    </span>
                                )}
                            </div>
                            {shouldGenerateImage && isImageGenerationAvailable() && renderImageSettings()}
                        </div>
                    )}
                    
                    {renderAISettings()}
                    
                    <form onSubmit={handleSubmit} style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginTop: '4px',
                        marginBottom: '0'
                    }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            width: '100%'
                        }}>
                            <label htmlFor="text" style={{
                                color: '#111827',
                                fontWeight: '600',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                Text:
                                {renderProviderBadge()}
                            </label>
                            <textarea
                                id="text"
                                value={text}
                                onChange={(e) => handleTextChange(e.target.value)}
                                placeholder="Enter text to translate or select text from a webpage"
                                style={{
                                    width: '100%',
                                    minHeight: '80px',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #E5E7EB',
                                    backgroundColor: '#ffffff',
                                    color: '#374151',
                                    fontSize: '14px',
                                    resize: 'vertical',
                                    outline: 'none',
                                    transition: 'all 0.2s ease'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loadingGetResult}
                            style={{
                                width: '100%',
                                padding: '8px 10px',
                                marginTop: '4px',
                                borderRadius: '6px',
                                backgroundColor: '#2563EB',
                                color: '#ffffff',
                                fontWeight: '600',
                                fontSize: '14px',
                                border: 'none',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                opacity: loadingGetResult ? 0.7 : 1
                            }}
                            onMouseOver={(e) => !loadingGetResult && (e.currentTarget.style.backgroundColor = '#1D4ED8')}
                            onMouseOut={(e) => !loadingGetResult && (e.currentTarget.style.backgroundColor = '#2563EB')}
                        >
                            {loadingGetResult ? 
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Loader type="dots" size="small" inline color="#ffffff" text="Creating card" />
                                </div> : 'Create Card'}
                        </button>
                    </form>
                    <div style={{
                        width: '100%',
                        margin: '4px 0 0 0'
                    }}>
                        {renderErrorNotification()}
                    </div>
                </div>
            </div>
            
            {/* Add the modal */}
            {renderModal()}
        </div>
    );
};

export default CreateCard;
