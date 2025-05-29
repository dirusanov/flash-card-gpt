import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from "../store";
import { setDeckId } from "../store/actions/decks";
import { saveCardToStorage, setBack, setExamples, setImage, setImageUrl, setTranslation, setText, loadStoredCards, setFront, updateStoredCard, setCurrentCardId, setLinguisticInfo, setTranscription, setIsGeneratingCard } from "../store/actions/cards";
import { CardLangLearning, CardGeneral } from '../services/ankiService';
import { generateAnkiBack, generateAnkiFront, getDescriptionImage, getExamples, translateText } from "../services/openaiApi";
import { setMode, setShouldGenerateImage, setTranslateToLanguage, setAIInstructions, setImageInstructions, setImageGenerationMode } from "../store/actions/settings";
import { Modes } from "../constants";
import ResultDisplay from "./ResultDisplay";
import { OpenAI } from 'openai';
import { getImage } from '../apiUtils';
import useErrorNotification from './useErrorHandler';
import { setCurrentPage } from "../store/actions/page";
import { FaCog, FaLightbulb, FaCode, FaImage, FaMagic, FaTimes, FaList, FaFont, FaLanguage, FaCheck, FaExchangeAlt } from 'react-icons/fa';
import { loadCardsFromStorage } from '../store/middleware/cardsLocalStorage';
import { StoredCard } from '../store/reducers/cards';
import Loader from './Loader';
import { getAIService, getApiKeyForProvider, createTranslation, createExamples, createFlashcard, createLinguisticInfo, validateLinguisticInfo, correctLinguisticInfo, createValidatedLinguisticInfo, createTranscription } from '../services/aiServiceFactory';
import { ModelProvider } from '../store/reducers/settings';


interface CreateCardProps {
    // Пустой интерфейс, так как больше не нужен onSettingsClick
}

const CreateCard: React.FC<CreateCardProps> = () => {
    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();

    // Helper function to update source language in Redux
    const updateSourceLanguage = useCallback((language: string) => {
        // Use direct action object instead of the action creator to fix type issues
        dispatch({ type: 'SET_SOURCE_LANGUAGE', payload: language });
        // Also save to localStorage
        localStorage.setItem('source_language', language);
    }, [dispatch]);

    const { text, translation, examples, image, imageUrl, front, back, currentCardId, linguisticInfo, transcription } = useSelector((state: RootState) => state.cards);
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
    const imageGenerationMode = useSelector((state: RootState) => state.settings.imageGenerationMode);
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
    const [selectedTextOptions, setSelectedTextOptions] = useState<string[]>([]);
    const [showTextOptionsModal, setShowTextOptionsModal] = useState(false);
    const [textAnalysisLoader, setTextAnalysisLoader] = useState(false);
    const [selectedOptionsMap, setSelectedOptionsMap] = useState<{ [key: string]: boolean }>({});
    const [createdCards, setCreatedCards] = useState<StoredCard[]>([]);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [isMultipleCards, setIsMultipleCards] = useState(false);

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

    // Track which card IDs have been explicitly saved by the user
    const [explicitlySavedIds, setExplicitlySavedIds] = useState<string[]>([]);

    // Helper function to check if a specific card is saved
    const isCardExplicitlySaved = useCallback((cardId: string | null) => {
        if (!cardId) return false;
        return explicitlySavedIds.includes(cardId);
    }, [explicitlySavedIds]);

    // Derive isSaved from multiple checks and explicit user actions
    const isSaved = useMemo(() => {
        console.log('Calculating isSaved:', {
            currentCardId,
            explicitlySaved,
            isMultipleCards,
            currentCardIndex,
            createdCardsLength: createdCards.length,
            explicitlySavedIds
        });

        // For multiple cards scenario - ONLY consider saved if user explicitly saved it
        if (isMultipleCards && createdCards.length > 0) {
            const currentCard = createdCards[currentCardIndex];
            if (!currentCard) return false;

            // Only consider saved if it's in our explicitly saved list
            return isCardExplicitlySaved(currentCard.id);
        }

        // For single card - only consider a card saved if it has been explicitly saved by the user
        if (currentCardId && explicitlySaved) {
            return true;
        }

        // Never automatically mark cards as saved just because they exist in storage
        return false;
    }, [currentCardId, explicitlySaved, isMultipleCards, currentCardIndex, createdCards, isCardExplicitlySaved]);

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
            // Определяем исходный язык
            const textLanguage = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;

            const newExamplesResult = await createExamples(
                aiService,
                apiKey,
                text,
                translateToLanguage,
                true,
                aiInstructions,
                textLanguage || undefined // Передаем исходный язык
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
            } else if (customInstruction.toLowerCase().includes('example') ||
                customInstruction.toLowerCase().includes('sentence') ||
                customInstruction.toLowerCase().includes('пример') ||
                customInstruction.toLowerCase().includes('предложение')) {

                // Generate new examples based on instructions
                const newExamples = await getExamples(openAiKey, text, translateToLanguage, true, customInstruction);
                dispatch(setExamples(newExamples));
            } else if (customInstruction.toLowerCase().includes('translat') ||
                customInstruction.toLowerCase().includes('перевод')) {

                // Update translation based on instructions
                const translatedText = await translateText(openAiKey, text, translateToLanguage, customInstruction);
                dispatch(setTranslation(translatedText));
            } else {
                // Apply all updates with custom instructions
                // Always use custom instructions for both translation and examples
                // This should ensure instructions are always applied
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
            }

            // Clear the instruction after applying
            setCustomInstruction('');

            // No notification, the loader UI is enough feedback
        } catch (error) {
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

    // Save All function for multiple cards
    const handleSaveAllCards = async () => {
        console.log('*** HANDLE SAVE ALL CARDS: Starting ***');
        console.log('Current Redux state at save all cards time:', {
            text,
            translation,
            image,
            imageUrl,
            hasImage: !!image,
            hasImageUrl: !!imageUrl,
            imageType: typeof image,
            imageUrlType: typeof imageUrl,
            shouldGenerateImage,
            mode,
            createdCardsCount: createdCards.length
        });

        showError(null);
        try {
            setLoadingAccept(true);

            // Перед сохранением всех карточек, сохраняем текущее состояние текущей карточки
            saveCurrentCardState();

            let successCount = 0;
            let errorCount = 0;
            let savedCards = 0;
            let updatedCards = 0;

            // Keep track of saved card IDs to update our explicit save tracking
            const newExplicitlySavedIds: string[] = [...explicitlySavedIds];

            console.log('Starting to save cards. Total cards:', createdCards.length, 'Already saved:', explicitlySavedIds.length);

            // Save each card in the createdCards array
            for (let i = 0; i < createdCards.length; i++) {
                const card = createdCards[i];

                // Skip cards that are already in our explicitly saved list to avoid double saving
                if (explicitlySavedIds.includes(card.id)) {
                    console.log(`Card #${i} (${card.id}) already explicitly saved, skipping`);
                    successCount++;
                    continue;
                }

                try {
                    console.log(`Saving card #${i} (${card.id}) from multi-card set`);

                    // Check if this card already exists in storage
                    const existingCardIndex = storedCards.findIndex(
                        (storedCard) => storedCard.id === card.id ||
                            (storedCard.text === card.text && storedCard.mode === card.mode)
                    );

                    if (existingCardIndex === -1) {
                        // Card is not saved yet
                        dispatch(saveCardToStorage(card));
                        savedCards++;

                        // Add to our explicitly saved IDs list
                        newExplicitlySavedIds.push(card.id);
                        console.log(`Card #${i} (${card.id}) saved as new`);

                        successCount++;
                    } else {
                        console.log(`Card #${i} (${card.id}) already in storage, updating`);
                        // Update existing card
                        dispatch(updateStoredCard(card));
                        updatedCards++;

                        // Add to our explicitly saved IDs list
                        newExplicitlySavedIds.push(card.id);

                        successCount++;
                    }
                } catch (cardError) {
                    console.error(`Error saving card #${i} (${card.id}):`, cardError);
                    errorCount++;
                }
            }

            console.log('Save all complete. Saved:', savedCards, 'Updated:', updatedCards, 'Errors:', errorCount);

            // Update our tracking of explicitly saved cards
            setExplicitlySavedIds(newExplicitlySavedIds);

            // Ensure the current card is marked as explicitly saved
            setExplicitlySaved(true);
            localStorage.setItem('explicitly_saved', 'true');

            // Also update the currentCardId to match current card
            const currentCard = createdCards[currentCardIndex];
            if (currentCard && currentCard.id) {
                dispatch(setCurrentCardId(currentCard.id));
                localStorage.setItem('current_card_id', currentCard.id);
            }

            // Show detailed success message
            if (errorCount === 0) {
                const successMessage =
                    savedCards > 0 && updatedCards > 0
                        ? `Saved ${savedCards} new cards and updated ${updatedCards} existing cards.`
                        : savedCards > 0
                            ? `Saved ${savedCards} cards successfully!`
                            : updatedCards > 0
                                ? `Updated ${updatedCards} cards successfully!`
                                : `All ${successCount} cards are now saved!`;

                showError(successMessage, 'success');
            } else {
                showError(`Saved ${successCount} cards, ${errorCount} failed.`, 'warning');
            }

            // Update UI
            setIsEdited(false);
            setIsNewSubmission(false);

            // Force Redux to refresh stored cards
            dispatch(loadStoredCards());

        } catch (error) {
            console.error('Error in save all cards operation:', error);
            showError('Error saving cards. Please try again.');
        } finally {
            setLoadingAccept(false);
        }
    };

    const handleAccept = async () => {
        console.log('*** HANDLE ACCEPT: Starting to save card ***');
        console.log('Current Redux state at save time:', {
            text,
            translation,
            image,
            imageUrl,
            hasImage: !!image,
            hasImageUrl: !!imageUrl,
            imageType: typeof image,
            imageUrlType: typeof imageUrl,
            imageLength: image?.length,
            imageUrlLength: imageUrl?.length,
            shouldGenerateImage,
            mode
        });

        showError(null);
        try {
            setLoadingAccept(true);

            // Handle saving for multiple cards mode or single card mode
            if (isMultipleCards && createdCards.length > 0) {
                // Сначала сохраняем текущее состояние карточки в массив
                saveCurrentCardState();

                // Получаем обновленную текущую карточку после сохранения состояния
                const currentCard = createdCards[currentCardIndex];
                if (!currentCard) {
                    showError('Card data not found');
                    return;
                }

                console.log('Saving current card from multi-card set:', currentCard.id);

                // Check if this card already exists in storage
                const existingCardIndex = storedCards.findIndex(
                    (storedCard) => storedCard.id === currentCard.id ||
                        (storedCard.text === currentCard.text && storedCard.mode === currentCard.mode)
                );

                if (existingCardIndex === -1) {
                    // Card is not saved yet - сохраняем ТОЛЬКО текущую карточку
                    dispatch(saveCardToStorage(currentCard));
                    console.log(`Saved new card: ${currentCard.id}`);
                } else {
                    // Update existing card - обновляем ТОЛЬКО текущую карточку
                    dispatch(updateStoredCard(currentCard));
                    console.log(`Updated existing card: ${currentCard.id}`);
                }

                // IMPORTANT: Only mark the CURRENT card as explicitly saved
                // This ensures only the current card shows "Saved to Collection"
                setExplicitlySavedIds(prev => {
                    if (prev.includes(currentCard.id)) {
                        return prev;
                    }
                    const newIds = [...prev, currentCard.id];
                    console.log('Updated explicitly saved IDs:', newIds);
                    return newIds;
                });

                // Force reload stored cards
                dispatch(loadStoredCards());

                // Set current card's ID for reference
                dispatch(setCurrentCardId(currentCard.id));
                localStorage.setItem('current_card_id', currentCard.id);

                // Update UI state for the current card only
                setExplicitlySaved(true);
                localStorage.setItem('explicitly_saved', 'true');
                setIsEdited(false);
                showError('Card saved successfully!', 'success');

                return; // Exit early for multi-card save
            }

            // Single card saving flow
            const cardId = currentCardId || Date.now().toString();

            // Debug the required fields
            console.log('Saving card with data:', {
                originalSelectedText,
                text,
                translation,
                examples: examples.length,
                mode,
                currentCardId,
                linguisticInfo: linguisticInfo ? 'present' : 'absent'
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
                    linguisticInfo, // Добавляем лингвистическое описание
                    transcription: transcription || '',
                    // Include image and imageUrl if they exist, regardless of shouldGenerateImage setting
                    // This ensures existing images are preserved when saving cards
                    image: image,
                    imageUrl: imageUrl,
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const
                };

                console.log('*** CREATECARD: Preparing to save card to storage ***');
                console.log('Card data being sent to Redux:', {
                    id: cardData.id,
                    text: cardData.text,
                    mode: cardData.mode,
                    hasImage: !!cardData.image,
                    hasImageUrl: !!cardData.imageUrl,
                    imageType: typeof cardData.image,
                    imageUrlType: typeof cardData.imageUrl,
                    imageLength: cardData.image?.length,
                    imageUrlLength: cardData.imageUrl?.length,
                    imageActualValue: cardData.image,
                    imageUrlActualValue: cardData.imageUrl,
                    imagePreview: cardData.image?.substring(0, 50),
                    imageUrlPreview: cardData.imageUrl?.substring(0, 50)
                });

                // Сохранение карточки происходит только по явному действию пользователя (кнопка "Accept")
                if (currentCardId) {
                    console.log('Updating existing card by user action:', cardId);
                    dispatch(updateStoredCard(cardData));
                } else {
                    console.log('Saving new card by user action:', cardId);
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
                    linguisticInfo, // Добавляем лингвистическое описание
                    transcription: transcription || '',
                    // Include image and imageUrl if they exist (general topic cards can have images too)
                    image: image,
                    imageUrl: imageUrl,
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const
                };

                console.log('Saving general topic card to storage:', cardData);

                // Сохранение происходит только по явному действию пользователя (нажатие кнопки)
                if (currentCardId) {
                    console.log('Updating existing general topic card by user action:', cardId);
                    dispatch(updateStoredCard(cardData));
                } else {
                    console.log('Saving new general topic card by user action:', cardId);
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
        // Always clear all data when creating a new card to prevent confusion
        // This ensures a clean slate for each new card
        setShowResult(false);
        setIsEdited(false);
        dispatch(setCurrentCardId(null));
        setIsNewSubmission(true);

        console.log('Creating new card, clearing all state completely');

        // Reset all saved state tracking
        setExplicitlySaved(false);
        setExplicitlySavedIds([]);
        localStorage.removeItem('explicitly_saved');
        localStorage.removeItem('current_card_id');

        // Сбрасываем историю карточек
        setCreatedCards([]);
        setIsMultipleCards(false);
        setCurrentCardIndex(0);

        // Очищаем все поля Redux полностью
        dispatch(setText(''));
        dispatch(setTranslation(''));
        dispatch(setExamples([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        dispatch(setFront(''));
        dispatch(setBack(null));
        dispatch(setLinguisticInfo('')); // Очищаем лингвистическое описание
        dispatch(setTranscription('')); // Очищаем транскрипцию
        setOriginalSelectedText('');
    };

    const handleViewSavedCards = () => {
        dispatch(setCurrentPage('storedCards'));
    };

    useEffect(() => {
        const handleMouseUp = () => {
            const selectedText = window.getSelection()?.toString().trim();
            if (selectedText && selectedText.length > 0) {
                // Сначала очищаем предыдущие выбранные опции и список опций
                setSelectedOptionsMap({});
                setSelectedTextOptions([]);
                // Затем анализируем новый текст и предлагаем варианты
                analyzeSelectedText(selectedText);
            }
        };

        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dispatch, apiKey]);

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
                        if (savedCard.linguisticInfo) dispatch(setLinguisticInfo(savedCard.linguisticInfo));
                        if (savedCard.transcription) dispatch(setTranscription(savedCard.transcription));
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

        // Установить флаг, что кнопка Create Card была нажата
        setCreateCardClicked(true);

        // Set card generation state to true to disable navigation buttons
        dispatch(setIsGeneratingCard(true));

        // IMPORTANT: Explicitly clear saved state when creating a new card
        setExplicitlySaved(false);
        localStorage.removeItem('explicitly_saved');

        // Сбрасываем предыдущие сохраненные карточки
        setCreatedCards([]);
        setIsMultipleCards(false);

        // Очищаем флаг текущей карточки
        dispatch(setCurrentCardId(null));

        // FIXED: Clear image data if image generation is disabled or if this is a new text
        // This prevents images from previous cards appearing on new cards
        if (!shouldGenerateImage) {
            console.log('Image generation is disabled, clearing existing images');
            dispatch(setImage(null));
            dispatch(setImageUrl(null));
        } else if (originalSelectedText !== text) {
            // If the text has changed significantly from the original, clear old images
            console.log('Text has changed, clearing existing images for new generation');
            dispatch(setImage(null));
            dispatch(setImageUrl(null));
        }

        // Only clear linguistic info and transcription as they are text-specific
        dispatch(setLinguisticInfo(""));
        dispatch(setTranscription(''));

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
            console.log("Source Language:", isAutoDetectLanguage ? detectedLanguage : sourceLanguage);

            if (!apiKey) {
                throw new Error(`API key for ${modelProvider} is missing. Please go to settings and add your API key.`);
            }

            // Определяем язык исходного текста для API запросов
            const sourceLanguageForSubmit = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;

            // Track which operations completed successfully to give better error messages
            let completedOperations = {
                translation: false,
                examples: false,
                flashcard: false,
                image: false,
                linguisticInfo: false
            };

            try {
                // 1. Get translation
                const translation = await createTranslation(
                    aiService,
                    apiKey,
                    text,
                    translateToLanguage,
                    aiInstructions,
                    sourceLanguageForSubmit || undefined // Передаем информацию о языке исходного текста или undefined
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
                    aiInstructions,
                    sourceLanguageForSubmit || undefined // Преобразуем string | null в string | undefined
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

            try {
                // 3.5 Создание лингвистической информации с итеративной валидацией
                // Определяем язык источника: автоопределенный или выбранный вручную
                const wordLanguage = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;

                console.log(`Creating validated linguistic info using source language: ${wordLanguage || 'unknown'} for text: "${text.substring(0, 20)}...", user language: ${translateToLanguage}`);

                // Если есть язык источника - используем его
                if (wordLanguage) {
                    const result = await createValidatedLinguisticInfo(
                        aiService,
                        apiKey,
                        text,
                        wordLanguage,
                        translateToLanguage,
                        5 // максимум 5 попыток
                    );

                    if (result.linguisticInfo) {
                        dispatch(setLinguisticInfo(result.linguisticInfo));
                        completedOperations.linguisticInfo = true;

                        // Показываем уведомления пользователю с небольшой задержкой
                        // setTimeout(() => {
                        //     if (result.wasValidated) {
                        //         if (result.attempts > 1) {
                        //             showError(`Grammar reference validated and corrected (${result.attempts} attempts)`, 'success');
                        //         } else {
                        //             showError('Grammar reference created successfully', 'success');
                        //         }
                        //     } else {
                        //         showError(`Grammar reference may contain inaccuracies (${result.attempts} attempts)`, 'warning');
                        //     }
                        // }, 1000);
                    } else {
                        console.warn(`Failed to generate linguistic info after ${result.attempts} attempts`);
                        showError('Failed to generate grammar reference', 'warning');
                    }
                } else {
                    // Используем язык перевода как запасной вариант для источника
                    console.warn(`No source language detected. Using target language (${translateToLanguage}) as fallback for source`);
                    const result = await createValidatedLinguisticInfo(
                        aiService,
                        apiKey,
                        text,
                        translateToLanguage, // В качестве исходного языка используем язык перевода
                        translateToLanguage, // Для интерфейса тоже используем язык перевода
                        3 // меньше попыток для fallback
                    );

                    if (result.linguisticInfo) {
                        dispatch(setLinguisticInfo(result.linguisticInfo));
                        completedOperations.linguisticInfo = true;

                        if (result.wasValidated && result.attempts > 1) {
                            showError(`✅ Grammar reference corrected (fallback mode)`, 'success');
                        } else if (!result.wasValidated) {
                            showError('⚠️ Grammar reference may contain inaccuracies (fallback mode)', 'warning');
                        }
                    }
                }
            } catch (linguisticError) {
                console.error('Linguistic info generation failed:', linguisticError);
                // Это не критическая ошибка, продолжаем с доступными данными
                if (completedOperations.translation) {
                    console.log(`Linguistic info generation failed: ${linguisticError instanceof Error ? linguisticError.message : "Unknown error"}. Continuing with available data.`);
                }
            }

            // 3.7 Создание транскрипции
            try {
                const sourceLanguageForTranscription = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;

                if (sourceLanguageForTranscription) {
                    console.log(`Creating transcription using source language: ${sourceLanguageForTranscription}, user language: ${translateToLanguage}`);

                    const transcriptionResult = await createTranscription(
                        aiService,
                        apiKey,
                        text,
                        sourceLanguageForTranscription,
                        translateToLanguage
                    );

                    if (transcriptionResult) {
                        // Получаем название языка пользователя через AI
                        const languageName = await getLanguageName(translateToLanguage);

                        // Создаем красивую HTML-разметку для транскрипции
                        const transcriptionHtml = [
                            transcriptionResult.userLanguageTranscription &&
                            `<div class="transcription-item user-lang">
                                    <span class="transcription-label">${languageName}:</span>
                                    <span class="transcription-text">${transcriptionResult.userLanguageTranscription}</span>
                                </div>`,
                            transcriptionResult.ipaTranscription &&
                            `<div class="transcription-item ipa">
                                    <span class="transcription-label">IPA:</span>
                                    <span class="transcription-text">${transcriptionResult.ipaTranscription}</span>
                                </div>`
                        ].filter(Boolean).join('\n');

                        if (transcriptionHtml) {
                            dispatch(setTranscription(transcriptionHtml));
                            console.log('Transcription created successfully');
                        }
                    }
                } else {
                    console.warn('No source language available for transcription');
                }
            } catch (transcriptionError) {
                console.error('Transcription generation failed:', transcriptionError);
                // Transcription is not critical - continue with the card creation
            }

            // 4. Generate image if needed and supported
            if (imageGenerationMode !== 'off' && isImageGenerationAvailable()) {
                try {
                    let shouldGenerate = imageGenerationMode === 'always';
                    let analysisReason = '';

                    // For smart mode, check if image would be helpful
                    if (imageGenerationMode === 'smart') {
                        const analysis = await shouldGenerateImageForText(text);
                        shouldGenerate = analysis.shouldGenerate;
                        analysisReason = analysis.reason;
                        
                        console.log(`Smart image analysis for "${text}": ${shouldGenerate ? 'YES' : 'NO'} - ${analysisReason}`);
                    }

                    if (shouldGenerate) {
                        const descriptionImage = await aiService.getDescriptionImage(apiKey, text, imageInstructions);

                        if (modelProvider === ModelProvider.OpenAI) {
                            const { imageUrl, imageBase64 } = await getImage(null, openai, openAiKey, descriptionImage, imageInstructions);

                            if (imageUrl) {
                                console.log('*** HANDLE SUBMIT: Setting imageUrl in Redux:', imageUrl.substring(0, 50));
                                dispatch(setImageUrl(imageUrl));
                            }
                            if (imageBase64) {
                                console.log('*** HANDLE SUBMIT: Setting image (base64) in Redux:', imageBase64.substring(0, 50));
                                dispatch(setImage(imageBase64));
                            }
                            completedOperations.image = true;
                            
                            if (imageGenerationMode === 'smart') {
                                showError(`Image generated: ${analysisReason}`, 'info');
                            }
                        } else {
                            // Skip image for providers that don't support it
                            console.log('Image generation not supported for this provider');
                        }
                    } else if (imageGenerationMode === 'smart') {
                        // Show why image wasn't generated in smart mode
                        showError(`No image needed: ${analysisReason}`, 'info');
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

            // Важно: очищаем статус сохранения для новой карточки
            setExplicitlySaved(false);
            setExplicitlySavedIds([]);
            localStorage.removeItem('explicitly_saved');
            localStorage.removeItem('current_card_id');
            console.log('Created new single card - reset all saved statuses');

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
            
            // Reset card generation state to enable navigation buttons
            dispatch(setIsGeneratingCard(false));
        }
    };

    const handleSaveAISettings = () => {
        dispatch(setAIInstructions(localAIInstructions));
        setShowAISettings(false);
        showError('AI settings saved successfully', 'success');
    };

    const handleSaveImageSettings = () => {
        dispatch(setImageInstructions(localImageInstructions));
        setShowImageSettings(false);
        showError('Image instructions saved successfully', 'success');
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
                        gap: '8px',
                        marginBottom: '8px'
                    }}
                >
                    <FaCode size={14} />
                    Save Instructions
                </button>

                {/* Кнопка для тестирования валидации */}
                <button
                    onClick={testLinguisticValidation}
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
                    🧪 Test Grammar Validation
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
        console.log('Canceling current card, clearing all state');
        setShowResult(false);
        setIsEdited(false);
        dispatch(setCurrentCardId(null));
        setIsNewSubmission(true);
        setExplicitlySaved(false); // Reset explicit save
        localStorage.removeItem('explicitly_saved'); // Also remove from localStorage
        localStorage.removeItem('current_card_id'); // Clear current card ID too

        // Reset card generation state to enable navigation buttons
        dispatch(setIsGeneratingCard(false));
        
        // Reset loading state
        setLoadingGetResult(false);

        // Сбрасываем историю карточек
        setCreatedCards([]);
        setIsMultipleCards(false);
        setCurrentCardIndex(0);

        // Reset all form fields completely
        dispatch(setText(''));
        dispatch(setTranslation(''));
        dispatch(setExamples([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        dispatch(setFront(''));
        dispatch(setBack(null));
        dispatch(setLinguisticInfo('')); // Очищаем лингвистическое описание
        dispatch(setTranscription('')); // Очищаем транскрипцию
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
        console.log('Modal close handler. Card saved status:', isSaved, 'isEdited:', isEdited);

        // Если карточки созданы с помощью множественного выделения, просто закрываем модальное окно
        // без дополнительных действий, чтобы предотвратить автоматическое сохранение
        if (isMultipleCards) {
            console.log('Closing modal for multiple cards without automatic saving');
            setShowModal(false);
            return;
        }

        // If the card is not saved but has content, offer to save it
        // Только для режима одной карточки и только если есть содержимое
        if (showResult && !isSaved && !isEdited && translation && !isMultipleCards) {
            const shouldSave = window.confirm('Would you like to save this card to your collection?');
            if (shouldSave) {
                handleAccept();
            } else {
                // If user decides not to save, clear ALL data including images
                console.log('User chose not to save, clearing all card data');
                dispatch(setText(''));
                dispatch(setTranslation(''));
                dispatch(setExamples([]));
                dispatch(setImage(null));
                dispatch(setImageUrl(null));
                dispatch(setFront(''));
                dispatch(setBack(null));
                dispatch(setLinguisticInfo(''));
                dispatch(setTranscription(''));
                setShowResult(false);
            }
        } else if (!isSaved) {
            // If not saved, clear ALL data including images when closing
            console.log('Card not saved, clearing all data');
            dispatch(setText(''));
            dispatch(setTranslation(''));
            dispatch(setExamples([]));
            dispatch(setImage(null));
            dispatch(setImageUrl(null));
            dispatch(setFront(''));
            dispatch(setBack(null));
            dispatch(setLinguisticInfo(''));
            dispatch(setTranscription(''));
            setShowResult(false);
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
                            {isMultipleCards
                                ? `Card ${currentCardIndex + 1} of ${createdCards.length}`
                                : 'Your Card'}
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

                    {/* Error notifications now appear as toast in top-right corner */}

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
                                    padding: '10px 12px',
                                    paddingRight: '44px',
                                    borderRadius: '8px',
                                    border: '1px solid #E5E7EB',
                                    fontSize: '14px',
                                    color: '#374151',
                                    backgroundColor: isProcessingCustomInstruction ? '#F9FAFB' : '#FFFFFF',
                                    transition: 'all 0.2s ease',
                                    boxShadow: isProcessingCustomInstruction ? 'inset 0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                                }}
                                disabled={isProcessingCustomInstruction}
                            />
                            {isProcessingCustomInstruction ? (
                                <div style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '6px',
                                    borderRadius: '50%',
                                    color: '#4F46E5'
                                }}>
                                    <Loader type="pulse" size="small" inline color="#4F46E5" />
                                </div>
                            ) : (
                                <button
                                    onClick={handleApplyCustomInstruction}
                                    disabled={!customInstruction.trim() || isProcessingCustomInstruction}
                                    style={{
                                        position: 'absolute',
                                        right: '8px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: customInstruction.trim() ? 'linear-gradient(to right, #4F46E5, #6366F1)' : 'none',
                                        border: 'none',
                                        color: customInstruction.trim() ? '#FFFFFF' : '#9CA3AF',
                                        cursor: customInstruction.trim() ? 'pointer' : 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '6px',
                                        borderRadius: '50%',
                                        width: '28px',
                                        height: '28px',
                                        boxShadow: customInstruction.trim() ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none',
                                        transition: 'all 0.2s ease'
                                    }}
                                    title="Apply instructions"
                                >
                                    <FaMagic size={14} />
                                </button>
                            )}
                        </div>
                        <div style={{
                            fontSize: '12px',
                            color: isProcessingCustomInstruction ? '#4F46E5' : '#6B7280',
                            marginTop: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: isProcessingCustomInstruction ? '500' : 'normal',
                        }}>
                            {isProcessingCustomInstruction && (
                                <span style={{
                                    display: 'inline-block',
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: '#4F46E5',
                                    animation: 'pulse 1.5s infinite',
                                }}></span>
                            )}
                            {isProcessingCustomInstruction ? 'Applying your instructions...' : 'Type instructions and press Enter or click the magic wand'}
                        </div>
                        <style>{`
                            @keyframes pulse {
                                0% { opacity: 1; }
                                50% { opacity: 0.4; }
                                100% { opacity: 1; }
                            }
                        `}</style>
                    </div>

                    {/* Добавляем навигацию для множественных карточек */}
                    {isMultipleCards && (
                        <>
                            <div style={{
                                marginBottom: '8px',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center'
                            }}>
                                <div style={{
                                    fontSize: '13px',
                                    color: '#4B5563',
                                    backgroundColor: '#F9FAFB',
                                    padding: '4px 10px',
                                    borderRadius: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    Card {currentCardIndex + 1} of {createdCards.length}
                                    {createdCards[currentCardIndex] && isCardExplicitlySaved(createdCards[currentCardIndex].id) && (
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            backgroundColor: '#ECFDF5',
                                            color: '#10B981',
                                            padding: '2px 6px',
                                            borderRadius: '10px',
                                            fontSize: '11px',
                                            fontWeight: 'bold'
                                        }}>
                                            <FaCheck size={8} />
                                            SAVED
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '8px',
                                marginBottom: '12px'
                            }}>
                                <button
                                    onClick={prevCard}
                                    disabled={currentCardIndex === 0}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: currentCardIndex === 0 ? '#F3F4F6' : '#EFF6FF',
                                        color: currentCardIndex === 0 ? '#9CA3AF' : '#2563EB',
                                        border: `1px solid ${currentCardIndex === 0 ? '#E5E7EB' : '#BFDBFE'}`,
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        cursor: currentCardIndex === 0 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flex: 1
                                    }}
                                >
                                    ← Prev
                                    {currentCardIndex > 0 && createdCards[currentCardIndex - 1] && (
                                        isCardExplicitlySaved(createdCards[currentCardIndex - 1].id) ? (
                                            <span style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                backgroundColor: '#10B981',
                                                marginLeft: 'auto'
                                            }}></span>
                                        ) : null
                                    )}
                                </button>

                                <button
                                    onClick={nextCard}
                                    disabled={currentCardIndex === createdCards.length - 1}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: currentCardIndex === createdCards.length - 1 ? '#F3F4F6' : '#EFF6FF',
                                        color: currentCardIndex === createdCards.length - 1 ? '#9CA3AF' : '#2563EB',
                                        border: `1px solid ${currentCardIndex === createdCards.length - 1 ? '#E5E7EB' : '#BFDBFE'}`,
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        cursor: currentCardIndex === createdCards.length - 1 ? 'not-allowed' : 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        flex: 1,
                                        justifyContent: 'flex-end'
                                    }}
                                >
                                    {currentCardIndex < createdCards.length - 1 && createdCards[currentCardIndex + 1] && (
                                        isCardExplicitlySaved(createdCards[currentCardIndex + 1].id) ? (
                                            <span style={{
                                                width: '6px',
                                                height: '6px',
                                                borderRadius: '50%',
                                                backgroundColor: '#10B981',
                                                marginRight: 'auto'
                                            }}></span>
                                        ) : null
                                    )}
                                    Next →
                                </button>
                            </div>

                            {/* Save All button */}
                            <button
                                onClick={handleSaveAllCards}
                                style={{
                                    width: '100%',
                                    padding: '10px 12px',
                                    backgroundColor: '#10B981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    marginBottom: '12px',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                }}
                                disabled={loadingAccept}
                            >
                                {loadingAccept ? (
                                    <Loader type="dots" size="small" inline color="#ffffff" text="Saving" />
                                ) : (
                                    <>
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            fill="currentColor"
                                            viewBox="0 0 16 16"
                                        >
                                            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z" />
                                        </svg>
                                        {explicitlySavedIds.length > 0 ? (
                                            <>
                                                Save {createdCards.length - explicitlySavedIds.length} Remaining Cards
                                                <span style={{
                                                    fontSize: '12px',
                                                    backgroundColor: 'rgba(255,255,255,0.25)',
                                                    borderRadius: '4px',
                                                    padding: '1px 6px',
                                                    marginLeft: '4px'
                                                }}>
                                                    {explicitlySavedIds.length} saved
                                                </span>
                                            </>
                                        ) : (
                                            <>Save All Cards ({createdCards.length})</>
                                        )}
                                    </>
                                )}
                            </button>
                        </>
                    )}

                    <ResultDisplay
                        mode={mode}
                        front={front}
                        translation={translation}
                        examples={examples}
                        imageUrl={imageUrl}
                        image={image}
                        linguisticInfo={linguisticInfo}
                        transcription={transcription}
                        onNewImage={handleNewImage}
                        onNewExamples={handleNewExamples}
                        onAccept={handleAccept}
                        onViewSavedCards={handleViewSavedCards}
                        onCancel={handleCancel}
                        loadingNewImage={loadingNewImage}
                        loadingNewExamples={loadingNewExamples}
                        loadingAccept={loadingAccept}
                        loadingGetResult={loadingGetResult}
                        shouldGenerateImage={shouldGenerateImage}
                        isSaved={isSaved}
                        isEdited={isEdited}
                        isGeneratingCard={isGeneratingCard}
                        setTranslation={handleTranslationUpdate}
                        setExamples={handleExamplesUpdate}
                        setLinguisticInfo={handleLinguisticInfoUpdate}
                    />
                </div>
            </div>
        );
    };

    // Функция для выбора/отмены выбора опции
    const toggleOptionSelection = (option: string) => {
        setSelectedOptionsMap(prev => ({
            ...prev,
            [option]: !prev[option]
        }));
    };

    // Функция для создания карточек из выбранных опций
    const createCardsFromSelectedOptions = async () => {
        const selectedOptions = Object.keys(selectedOptionsMap).filter(key => selectedOptionsMap[key]);

        if (selectedOptions.length === 0) {
            showError("Please select at least one text option", "warning");
            return;
        }

        setShowTextOptionsModal(false);
        setLoadingGetResult(true);
        
        // Set card generation state to true to disable navigation buttons
        dispatch(setIsGeneratingCard(true));

        try {
            const newCards: StoredCard[] = [];

            // Создаем карточки для каждого выбранного варианта
            for (const option of selectedOptions) {
                // Очистим предыдущие данные перед созданием новой карточки
                dispatch(setText(''));
                dispatch(setTranslation(''));
                dispatch(setExamples([]));
                dispatch(setImage(null));
                dispatch(setImageUrl(null));
                dispatch(setLinguisticInfo('')); // Важно: очищаем лингвистическое описание

                // Установка текста для текущей карточки (после очистки)
                dispatch(setText(option));
                setOriginalSelectedText(option);

                // Сброс статуса явного сохранения для предотвращения ложного отображения "Saved to Collection"
                setExplicitlySaved(false);
                localStorage.removeItem('explicitly_saved');

                try {
                    // 1. Получаем перевод
                    const translation = await createTranslation(
                        aiService,
                        apiKey,
                        option,
                        translateToLanguage,
                        aiInstructions,
                        undefined // Передаем undefined как шестой параметр
                    );

                    if (translation.translated) {
                        dispatch(setTranslation(translation.translated));
                    }


                    // 2. Получаем примеры
                    const sourceLanguageForExamples = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;
                    const examplesResult = await createExamples(
                        aiService,
                        apiKey,
                        option,
                        translateToLanguage,
                        true,
                        aiInstructions,
                        sourceLanguageForExamples || undefined // Передаем исходный язык
                    );

                    if (examplesResult && examplesResult.length > 0) {
                        const formattedExamples = examplesResult.map(example =>
                            [example.original, example.translated] as [string, string | null]
                        );
                        dispatch(setExamples(formattedExamples));
                    }

                    // 3. Создаем переднюю часть карточки
                    const flashcard = await createFlashcard(aiService, apiKey, option);
                    if (flashcard.front) {
                        dispatch(setFront(flashcard.front));
                    }

                    // 3.5 Создаем лингвистическое описание конкретно для этого слова/фразы с итеративной валидацией
                    const sourceLanguageForLinguistic = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;
                    let generatedLinguisticInfo = "";

                    if (sourceLanguageForLinguistic) {
                        const result = await createValidatedLinguisticInfo(
                            aiService,
                            apiKey,
                            option, // Используем текущую опцию, а не глобальный текст
                            sourceLanguageForLinguistic,
                            translateToLanguage,
                            3 // меньше попыток для множественных карточек
                        );

                        if (result.linguisticInfo) {
                            generatedLinguisticInfo = result.linguisticInfo;
                            dispatch(setLinguisticInfo(result.linguisticInfo));

                            if (result.wasValidated && result.attempts > 1) {
                                console.log(`Corrected linguistic info for "${option}" after ${result.attempts} attempts`);
                            } else if (!result.wasValidated) {
                                console.warn(`Linguistic info for "${option}" may contain inaccuracies`);
                            }
                        } else {
                            console.warn(`Failed to generate linguistic info for "${option}"`);
                        }
                    }

                    // 3.7 Создание транскрипции для этой опции
                    let generatedTranscription = "";
                    try {
                        const sourceLanguageForTranscription = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;

                        if (sourceLanguageForTranscription) {
                            console.log(`Creating transcription for "${option}" using source language: ${sourceLanguageForTranscription}, user language: ${translateToLanguage}`);

                            const transcriptionResult = await createTranscription(
                                aiService,
                                apiKey,
                                option, // Используем текущую опцию
                                sourceLanguageForTranscription,
                                translateToLanguage
                            );

                            if (transcriptionResult) {
                                // Получаем название языка пользователя через AI
                                const languageName = await getLanguageName(translateToLanguage);

                                // Создаем красивую HTML-разметку для транскрипции
                                const transcriptionHtml = [
                                    transcriptionResult.userLanguageTranscription &&
                                    `<div class="transcription-item user-lang">
                                            <span class="transcription-label">${languageName}:</span>
                                            <span class="transcription-text">${transcriptionResult.userLanguageTranscription}</span>
                                        </div>`,
                                    transcriptionResult.ipaTranscription &&
                                    `<div class="transcription-item ipa">
                                            <span class="transcription-label">IPA:</span>
                                            <span class="transcription-text">${transcriptionResult.ipaTranscription}</span>
                                        </div>`
                                ].filter(Boolean).join('\n');

                                if (transcriptionHtml) {
                                    generatedTranscription = transcriptionHtml;
                                    dispatch(setTranscription(transcriptionHtml));
                                    console.log(`Transcription created successfully for "${option}"`);
                                }
                            }
                        } else {
                            console.warn(`No source language available for transcription of "${option}"`);
                        }
                    } catch (transcriptionError) {
                        console.error(`Transcription generation failed for "${option}":`, transcriptionError);
                        // Transcription is not critical - continue with the card creation
                    }

                    // 4. Генерируем изображение, если нужно
                    let currentImageUrl = null;
                    let currentImage = null;

                    if (shouldGenerateImage && modelProvider === ModelProvider.OpenAI) {
                        const descriptionImage = await aiService.getDescriptionImage(apiKey, option, imageInstructions);
                        const { imageUrl, imageBase64 } = await getImage(null, openai, openAiKey, descriptionImage, imageInstructions);

                        if (imageUrl) {
                            currentImageUrl = imageUrl;
                            dispatch(setImageUrl(imageUrl));
                        }
                        if (imageBase64) {
                            currentImage = imageBase64;
                            dispatch(setImage(imageBase64));
                        }
                    }

                    // 5. Сохраняем карточку
                    const cardId = Date.now().toString() + '_' + newCards.length;

                    const cardData: StoredCard = {
                        id: cardId,
                        mode,
                        text: option,
                        translation: translation.translated || '',
                        examples: examplesResult.map(example => [example.original, example.translated]) as [string, string | null][],
                        linguisticInfo: generatedLinguisticInfo, // Используем локальную переменную
                        transcription: generatedTranscription, // Добавляем транскрипцию
                        front: flashcard.front || '',
                        back: translation.translated || '',
                        image: currentImage, // Используем локальную переменную
                        imageUrl: currentImageUrl, // Используем локальную переменную
                        createdAt: new Date(),
                        exportStatus: 'not_exported' as const
                    };

                    // НЕ сохраняем карточку в хранилище здесь, а только добавляем в список для отображения
                    // dispatch(saveCardToStorage(cardData)); - УДАЛЕНО, чтобы предотвратить автоматическое сохранение
                    console.log(`Created card ${cardData.id} but NOT saving to storage yet. Image info:`, {
                        hasImage: !!cardData.image,
                        hasImageUrl: !!cardData.imageUrl,
                        imageLength: cardData.image?.length,
                        imageUrlLength: cardData.imageUrl?.length
                    });
                    newCards.push(cardData);

                } catch (error) {
                    console.error(`Error creating card for "${option}":`, error);
                    showError(`Failed to create card for "${option.substring(0, 20)}...": ${error instanceof Error ? error.message : "Unknown error"}`, "error");
                }
            }

            if (newCards.length > 0) {
                setCreatedCards(newCards);
                setCurrentCardIndex(0);
                setIsMultipleCards(newCards.length > 1);

                // Устанавливаем текущую карточку в состояние Redux для отображения
                const currentCard = newCards[0];
                if (currentCard) {
                    // Проверяем каждое поле перед установкой
                    if (typeof currentCard.text === 'string') {
                        dispatch(setText(currentCard.text));
                    }

                    // Translation может быть null, но не undefined
                    dispatch(setTranslation(currentCard.translation === undefined ? null : currentCard.translation));

                    // Examples всегда должен быть массивом
                    dispatch(setExamples(Array.isArray(currentCard.examples) ? currentCard.examples : []));

                    // Image может быть null, но не undefined
                    dispatch(setImage(currentCard.image === undefined ? null : currentCard.image));

                    // ImageUrl может быть null, но не undefined
                    dispatch(setImageUrl(currentCard.imageUrl === undefined ? null : currentCard.imageUrl));

                    // Front должен быть строкой
                    if (typeof currentCard.front === 'string') {
                        dispatch(setFront(currentCard.front));
                    }

                    // Back может быть null, но не undefined
                    dispatch(setBack(currentCard.back === undefined ? null : currentCard.back));

                    // LinguisticInfo может быть строкой или undefined
                    dispatch(setLinguisticInfo(currentCard.linguisticInfo || ''));

                    // Transcription может быть строкой или undefined
                    if (currentCard.transcription) {
                        dispatch(setTranscription(currentCard.transcription));
                    } else {
                        dispatch(setTranscription(''));
                    }
                }

                // Сброс статуса явного сохранения карточек
                setExplicitlySaved(false);
                setExplicitlySavedIds([]);  // Clear explicitly saved IDs
                localStorage.removeItem('explicitly_saved');
                console.log('Reset saved status for new multiple cards');

                // Важное обновление: очищаем список сохраненных ID перед показом новых карточек
                setExplicitlySavedIds([]);
                localStorage.removeItem('explicitly_saved');
                setExplicitlySaved(false);

                // Показываем результат
                setShowResult(true);
                setShowModal(true);
                showError(`Created ${newCards.length} cards!`, "success");

                console.log('Created new cards, none saved yet. Card IDs:', newCards.map(card => card.id));
            } else {
                showError("Failed to create cards. Please try again.", "error");
            }

        } catch (error) {
            console.error('Error processing selected options:', error);
            showError(error instanceof Error ? error.message : "Failed to create cards. Please try again.");
        } finally {
            setLoadingGetResult(false);
            
            // Reset card generation state to enable navigation buttons  
            dispatch(setIsGeneratingCard(false));
            
            // Очищаем карту выбранных опций
            setSelectedOptionsMap({});
        }
    };

    // Обновляем handleTextOptionSelect для поддержки множественного выбора
    const handleTextOptionSelect = (option: string) => {
        toggleOptionSelection(option);
    };

    // Функция для перехода к следующей карточке
    const nextCard = () => {
        if (createdCards.length <= 1 || currentCardIndex >= createdCards.length - 1) return;

        // Важно: сохраняем измененные данные текущей карточки перед переходом к следующей
        saveCurrentCardState();

        const nextIndex = currentCardIndex + 1;
        console.log(`Moving from card ${currentCardIndex} to card ${nextIndex}`);

        // Загружаем данные следующей карточки
        const card = createdCards[nextIndex];
        if (card) {
            console.log(`Loading next card data: ${card.id}, text: ${card.text}, linguistic info: ${card.linguisticInfo ? 'yes' : 'no'}`);
            loadCardData(card);
            // Обновляем индекс карточки после загрузки данных
            setCurrentCardIndex(nextIndex);
        }
    };

    // Функция для сохранения текущего состояния карточки в массиве createdCards
    const saveCurrentCardState = () => {
        if (!createdCards[currentCardIndex]) return;

        // Логируем состояние перед сохранением для отладки
        console.log('Saving current card state:', {
            index: currentCardIndex,
            text,
            linguisticInfo: linguisticInfo ? linguisticInfo.substring(0, 30) + '...' : 'empty'
        });

        // Создаем обновленную копию текущей карточки с актуальными данными из Redux
        const updatedCard = {
            ...createdCards[currentCardIndex],
            text,
            translation,
            examples,
            image,
            imageUrl,
            front,
            back: back || null,
            linguisticInfo: linguisticInfo || '',
            transcription: transcription || ''
        };

        // Обновляем массив карточек, заменяя текущую карточку на обновленную
        const updatedCards = [...createdCards];
        updatedCards[currentCardIndex] = updatedCard;
        setCreatedCards(updatedCards);

        console.log('Updated card saved:', updatedCard.id);
    };

    // Функция для загрузки данных карточки в Redux
    const loadCardData = (card: StoredCard) => {
        console.log('Loading card data for card:', {
            id: card.id,
            text: card.text,
            hasLinguisticInfo: Boolean(card.linguisticInfo)
        });

        // Сначала очищаем все данные
        dispatch(setText(''));
        dispatch(setTranslation(null));
        dispatch(setExamples([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        dispatch(setFront(''));
        dispatch(setBack(null));
        dispatch(setLinguisticInfo(''));
        dispatch(setTranscription(''));

        // Затем загружаем данные из карточки

        // Проверяем каждое поле перед установкой
        if (typeof card.text === 'string') {
            dispatch(setText(card.text));
        }

        // Translation может быть null, но не undefined
        dispatch(setTranslation(card.translation === undefined ? null : card.translation));

        // Examples всегда должен быть массивом
        dispatch(setExamples(Array.isArray(card.examples) ? card.examples : []));

        // Image может быть null, но не undefined
        dispatch(setImage(card.image === undefined ? null : card.image));

        // ImageUrl может быть null, но не undefined
        dispatch(setImageUrl(card.imageUrl === undefined ? null : card.imageUrl));

        // Front должен быть строкой
        if (typeof card.front === 'string') {
            dispatch(setFront(card.front));
        }

        // Back может быть null, но не undefined
        dispatch(setBack(card.back === undefined ? null : card.back));

        // LinguisticInfo может быть строкой или undefined
        if (card.linguisticInfo) {
            console.log('Setting linguistic info:', card.linguisticInfo.substring(0, 30) + '...');
            dispatch(setLinguisticInfo(card.linguisticInfo));
        } else {
            console.log('No linguistic info found for this card');
            dispatch(setLinguisticInfo(''));
        }

        // Transcription может быть строкой или undefined
        if (card.transcription) {
            console.log('Setting transcription:', card.transcription.substring(0, 30) + '...');
            dispatch(setTranscription(card.transcription));
        } else {
            console.log('No transcription found for this card');
            dispatch(setTranscription(''));
        }
    };

    // Функция для перехода к предыдущей карточке
    const prevCard = () => {
        if (createdCards.length <= 1 || currentCardIndex <= 0) return;

        // Сохраняем текущее состояние карточки перед переключением
        saveCurrentCardState();

        const prevIndex = currentCardIndex - 1;
        console.log(`Moving from card ${currentCardIndex} to card ${prevIndex}`);

        // Загружаем данные предыдущей карточки
        const card = createdCards[prevIndex];
        if (card) {
            console.log(`Loading previous card data: ${card.id}, text: ${card.text}, linguistic info: ${card.linguisticInfo ? 'yes' : 'no'}`);
            loadCardData(card);
            // Обновляем индекс карточки после загрузки данных
            setCurrentCardIndex(prevIndex);
        }
    };

    // Анализировать текст и предложить варианты создания карточек
    const analyzeSelectedText = async (selectedText: string) => {
        if (!selectedText || selectedText.length < 3) {
            dispatch(setText(selectedText));
            return;
        }

        // Сначала очищаем ранее выбранные опции
        setSelectedOptionsMap({});
        setSelectedTextOptions([]);

        // If text is a single word or very short phrase (less than 20 chars)
        // use it directly without showing options
        if (selectedText.length < 20 && !selectedText.includes('.') && !selectedText.includes('\n')) {
            // Clean the text by removing leading dashes/hyphens and whitespace
            const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
            dispatch(setText(cleanedText));
            return;
        }

        setTextAnalysisLoader(true);

        try {
            // Extract words more intelligently
            // Use a regex that properly separates words while preserving their form
            // This regex splits by spaces and punctuation but keeps the words intact
            const wordRegex = /[a-zA-Z\u00C0-\u017F]+(?:'[a-zA-Z\u00C0-\u017F]+)*/g;
            const extractedWords = selectedText.match(wordRegex) || [];

            // Filter and clean words
            let words = extractedWords
                .filter(word => word.length > 3)  // Only words longer than 3 chars
                .filter(word => !['the', 'and', 'that', 'this', 'with', 'from', 'have', 'are', 'for'].includes(word.toLowerCase()))  // Filter common stop words
                .map(word => word.trim())
                .filter(Boolean);

            // Limit to unique words to prevent duplicates
            words = Array.from(new Set(words));

            // Initialize array of options to present to the user
            let options: string[] = [];
            let phrasesExtracted = false;

            // For longer texts (>100 chars), rely primarily on AI extraction
            if (selectedText.length > 100 && apiKey) {
                try {
                    setTextAnalysisLoader(true);
                    // Prioritize AI extraction for longer text
                    const response = await aiService.extractKeyTerms(apiKey, selectedText);

                    if (response && response.length > 0) {
                        // Take up to 7 AI-selected terms for longer texts
                        const aiTerms = response.slice(0, 7);

                        aiTerms.forEach((term: string) => {
                            // Clean each term by removing leading dashes/hyphens
                            const cleanedTerm = term.replace(/^[-–—•\s]+/, '').trim();
                            if (!options.includes(cleanedTerm)) {
                                options.push(cleanedTerm);
                            }
                        });

                        phrasesExtracted = true;
                    }
                } catch (e) {
                    console.error("Failed to extract key terms with AI", e);
                }
            }

            // For medium-length selections, try to extract meaningful phrases
            if (!phrasesExtracted && selectedText.length > 30 && selectedText.length <= 200) {
                // Split text into sentences
                const sentences = selectedText.split(/[.!?]+/).filter(s => s.trim().length > 0);

                // For each short sentence or segment, add as potential phrase
                sentences.forEach(sentence => {
                    const trimmed = sentence.trim();
                    // Only add reasonably sized phrases (2-8 words) and clean them
                    if (trimmed.length > 10 && trimmed.length < 80 &&
                        trimmed.split(/\s+/).length >= 2 &&
                        trimmed.split(/\s+/).length <= 8) {
                        // Clean the phrase by removing leading dashes/hyphens
                        const cleanedPhrase = trimmed.replace(/^[-–—•\s]+/, '').trim();
                        options.push(cleanedPhrase);
                    }
                });
            }

            // Add individual important words if we don't have many options yet
            if (options.length < 5) {
                // Find potentially important words (longer words are often more significant)
                const importantWords = words
                    .filter(word => word.length > 5)  // Prefer longer words
                    .slice(0, 5);  // Limit to 5 important words

                importantWords.forEach(word => {
                    // Clean the word by removing leading dashes/hyphens
                    const cleanedWord = word.replace(/^[-–—•\s]+/, '').trim();
                    if (!options.includes(cleanedWord)) {
                        options.push(cleanedWord);
                    }
                });
            }

            // Find potential multi-word terms (2-3 words together)
            if (options.length < 7) {
                const wordsArray = selectedText.split(/\s+/);

                if (wordsArray.length >= 2) {
                    for (let i = 0; i < wordsArray.length - 1; i++) {
                        // Get potential 2-word phrases
                        if (wordsArray[i].length > 3 && wordsArray[i + 1].length > 3) {
                            let twoWordPhrase = `${wordsArray[i]} ${wordsArray[i + 1]}`.trim();
                            // Clean the phrase by removing leading dashes/hyphens
                            twoWordPhrase = twoWordPhrase.replace(/^[-–—•\s]+/, '').trim();
                            if (twoWordPhrase.length > 7 && !options.includes(twoWordPhrase)) {
                                options.push(twoWordPhrase);
                            }
                        }

                        // Get potential 3-word phrases
                        if (i < wordsArray.length - 2 &&
                            wordsArray[i].length > 2 &&
                            wordsArray[i + 1].length > 2 &&
                            wordsArray[i + 2].length > 2) {
                            let threeWordPhrase = `${wordsArray[i]} ${wordsArray[i + 1]} ${wordsArray[i + 2]}`.trim();
                            // Clean the phrase by removing leading dashes/hyphens
                            threeWordPhrase = threeWordPhrase.replace(/^[-–—•\s]+/, '').trim();
                            if (threeWordPhrase.length > 10 && !options.includes(threeWordPhrase)) {
                                options.push(threeWordPhrase);
                            }
                        }
                    }
                }
            }

            // Also process the original selected text for list items
            // Extract items that might be in list format (starting with dash, bullet, etc)
            const listItemRegex = /(?:^|\n)[-–—•*]\s*(.*?)(?=\n[-–—•*]|\n\n|$)/g;
            let match;
            const listRegexString = selectedText.toString(); // Ensure it's a string
            while ((match = listItemRegex.exec(listRegexString)) !== null) {
                if (match[1] && match[1].trim().length > 3) {
                    const cleanedItem = match[1].trim();
                    if (!options.includes(cleanedItem)) {
                        options.push(cleanedItem);
                    }
                }
            }

            // Final cleanup and limiting
            options = Array.from(new Set(options))
                .filter(opt => opt.length > 2)
                .map(opt => opt.replace(/^[-–—•\s]+/, '').trim()) // One final cleaning pass
                .slice(0, 8);  // Limit to max 8 options for better UX

            // If we have options, show selection modal
            if (options.length > 0) {
                setSelectedTextOptions(options);
                setShowTextOptionsModal(true);
            } else {
                // If no good options extracted, use the original selected text
                // but only if it's not too long
                if (selectedText.length > 500) {
                    // Too long, extract first sentence or first 100 chars
                    const firstSentence = selectedText.split(/[.!?]/)[0];
                    if (firstSentence && firstSentence.length < 100) {
                        const cleanedSentence = firstSentence.replace(/^[-–—•\s]+/, '').trim();
                        dispatch(setText(cleanedSentence + '.'));
                    } else {
                        const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
                        dispatch(setText(cleanedText.substring(0, 100).trim() + '...'));
                    }
                } else {
                    const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
                    dispatch(setText(cleanedText));
                }
            }
        } catch (e) {
            console.error("Error analyzing text", e);
            // In case of error, use the original selected text but clean it
            const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
            dispatch(setText(cleanedText));
        } finally {
            setTextAnalysisLoader(false);
        }
    };

    // Обновляем renderTextOptionsModal с улучшенным UI/UX
    const renderTextOptionsModal = () => {
        if (!showTextOptionsModal) return null;

        // Calculate how many options are selected
        const selectedCount = Object.values(selectedOptionsMap).filter(Boolean).length;

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
            }} onClick={() => {
                // Очищаем выбранные опции при закрытии модального окна
                setSelectedOptionsMap({});
                setShowTextOptionsModal(false);
            }}>
                <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    maxWidth: '360px',
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
                            color: '#111827',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <FaFont size={14} color="#2563EB" />
                            Select Terms for Cards
                        </h3>
                        <button
                            onClick={() => {
                                // Очищаем выбранные опции и сам список опций
                                setSelectedOptionsMap({});
                                setSelectedTextOptions([]);
                                setShowTextOptionsModal(false);
                            }}
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

                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '14px'
                    }}>
                        <p style={{
                            fontSize: '14px',
                            color: '#4B5563',
                            margin: 0,
                            lineHeight: '1.4'
                        }}>
                            Found {selectedTextOptions.length} key terms
                        </p>

                        {selectedCount > 0 && (
                            <span style={{
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#2563EB',
                                padding: '3px 8px',
                                backgroundColor: '#EFF6FF',
                                borderRadius: '6px'
                            }}>
                                {selectedCount} selected
                            </span>
                        )}
                    </div>

                    {/* Option to select/deselect all */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 4px',
                        marginBottom: '12px'
                    }}>
                        <button
                            onClick={() => {
                                // Select all if none or some are selected, otherwise deselect all
                                const shouldSelectAll = selectedCount < selectedTextOptions.length;
                                const newMap: Record<string, boolean> = {};
                                selectedTextOptions.forEach(option => {
                                    newMap[option] = shouldSelectAll;
                                });
                                setSelectedOptionsMap(newMap);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                background: 'none',
                                border: 'none',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                color: '#4B5563',
                                cursor: 'pointer'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            {selectedCount === selectedTextOptions.length ? (
                                <>
                                    <span style={{ fontSize: '13px' }}>✓</span> Deselect all
                                </>
                            ) : (
                                <>
                                    <span style={{ fontSize: '13px' }}>☐</span> Select all
                                </>
                            )}
                        </button>

                        <span style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            fontStyle: 'italic'
                        }}>
                            Tap to select
                        </span>
                    </div>

                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        marginBottom: '16px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        padding: '4px',
                        listStyle: 'none'
                    }}>
                        {textAnalysisLoader ? (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                padding: '20px'
                            }}>
                                <Loader type="pulse" size="small" color="#4F46E5" text="Analyzing selected text..." />
                            </div>
                        ) : (
                            selectedTextOptions.map((option, index) => (
                                <div
                                    key={index}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        backgroundColor: selectedOptionsMap[option] ? '#EFF6FF' : '#F9FAFB',
                                        border: `1px solid ${selectedOptionsMap[option] ? '#BFDBFE' : '#E5E7EB'}`,
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        position: 'relative',
                                        listStyleType: 'none'
                                    }}
                                    onClick={() => handleTextOptionSelect(option)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!!selectedOptionsMap[option]}
                                        onChange={() => handleTextOptionSelect(option)}
                                        style={{
                                            marginRight: '12px',
                                            width: '16px',
                                            height: '16px',
                                            accentColor: '#2563EB',
                                            minWidth: '16px'
                                        }}
                                        id={`option-${index}`}
                                    />
                                    <span
                                        style={{
                                            fontSize: '14px',
                                            color: '#374151',
                                            flex: 1,
                                            cursor: 'pointer',
                                            wordBreak: 'break-word',
                                            textAlign: 'left',
                                            paddingLeft: '0',
                                            marginLeft: '0',
                                            display: 'inline-block'
                                        }}
                                    >
                                        {/* Clean any leading hyphens or dashes that might be in the text */}
                                        {option.replace(/^[-–—•\s]+/, '')}
                                    </span>

                                    {/* Word length indicator tag */}
                                    <span style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '10px',
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        borderRadius: '10px',
                                        backgroundColor: option.split(/\s+/).length > 1 ? '#DBEAFE' : '#F3F4F6',
                                        color: option.split(/\s+/).length > 1 ? '#1E40AF' : '#6B7280',
                                        fontWeight: option.split(/\s+/).length > 1 ? '500' : 'normal'
                                    }}>
                                        {option.split(/\s+/).length > 1 ? 'phrase' : 'word'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>

                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        marginTop: '12px'
                    }}>
                        <button
                            onClick={() => {
                                // При отмене очищаем выбранные опции
                                setSelectedOptionsMap({});
                                setShowTextOptionsModal(false);
                            }}
                            style={{
                                flex: '1',
                                padding: '10px 12px',
                                backgroundColor: '#F9FAFB',
                                color: '#4B5563',
                                border: '1px solid #E5E7EB',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = '#F3F4F6';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = '#F9FAFB';
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            onClick={createCardsFromSelectedOptions}
                            disabled={selectedCount === 0}
                            style={{
                                flex: '2',
                                padding: '10px 12px',
                                backgroundColor: selectedCount === 0 ? '#E5E7EB' : '#2563EB',
                                color: selectedCount === 0 ? '#9CA3AF' : '#FFFFFF',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                            }}
                            onMouseOver={(e) => {
                                if (selectedCount > 0) {
                                    e.currentTarget.style.backgroundColor = '#1D4ED8';
                                }
                            }}
                            onMouseOut={(e) => {
                                if (selectedCount > 0) {
                                    e.currentTarget.style.backgroundColor = '#2563EB';
                                }
                            }}
                        >
                            <FaList size={14} />
                            Create {selectedCount > 0 ? `${selectedCount} Card${selectedCount > 1 ? 's' : ''}` : 'Cards'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // Расширенный список языков с флагами и локализованными названиями
    const allLanguages = [
        { code: 'ru', name: 'Русский', flag: '🇷🇺', englishName: 'Russian' },
        { code: 'en', name: 'English', flag: '🇬🇧', englishName: 'English' },
        { code: 'es', name: 'Español', flag: '🇪🇸', englishName: 'Spanish' },
        { code: 'fr', name: 'Français', flag: '🇫🇷', englishName: 'French' },
        { code: 'de', name: 'Deutsch', flag: '🇩🇪', englishName: 'German' },
        { code: 'it', name: 'Italiano', flag: '🇮🇹', englishName: 'Italian' },
        { code: 'pt', name: 'Português', flag: '🇵🇹', englishName: 'Portuguese' },
        { code: 'ja', name: '日本語', flag: '🇯🇵', englishName: 'Japanese' },
        { code: 'ko', name: '한국어', flag: '🇰🇷', englishName: 'Korean' },
        { code: 'zh', name: '中文', flag: '🇨🇳', englishName: 'Chinese' },
        { code: 'ar', name: 'العربية', flag: '🇦🇪', englishName: 'Arabic' },
        { code: 'hi', name: 'हिंदी', flag: '🇮🇳', englishName: 'Hindi' },
        { code: 'bn', name: 'বাংলা', flag: '🇧🇩', englishName: 'Bengali' },
        { code: 'tr', name: 'Türkçe', flag: '🇹🇷', englishName: 'Turkish' },
        { code: 'pl', name: 'Polski', flag: '🇵🇱', englishName: 'Polish' },
        { code: 'nl', name: 'Nederlands', flag: '🇳🇱', englishName: 'Dutch' },
        { code: 'cs', name: 'Čeština', flag: '🇨🇿', englishName: 'Czech' },
        { code: 'sv', name: 'Svenska', flag: '🇸🇪', englishName: 'Swedish' },
        { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', englishName: 'Vietnamese' },
        { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭', englishName: 'Thai' },
        { code: 'he', name: 'עִבְרִית', flag: '🇮🇱', englishName: 'Hebrew' },
        { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', englishName: 'Indonesian' },
        { code: 'uk', name: 'Українська', flag: '🇺🇦', englishName: 'Ukrainian' },
        { code: 'el', name: 'Ελληνικά', flag: '🇬🇷', englishName: 'Greek' },
        { code: 'ro', name: 'Română', flag: '🇷🇴', englishName: 'Romanian' },
        { code: 'hu', name: 'Magyar', flag: '🇭🇺', englishName: 'Hungarian' },
        { code: 'fi', name: 'Suomi', flag: '🇫🇮', englishName: 'Finnish' },
        { code: 'da', name: 'Dansk', flag: '🇩🇰', englishName: 'Danish' },
        { code: 'no', name: 'Norsk', flag: '🇳🇴', englishName: 'Norwegian' },
        { code: 'sk', name: 'Slovenčina', flag: '🇸🇰', englishName: 'Slovak' },
        { code: 'lt', name: 'Lietuvių', flag: '🇱🇹', englishName: 'Lithuanian' },
        { code: 'lv', name: 'Latviešu', flag: '🇱🇻', englishName: 'Latvian' },
        { code: 'bg', name: 'Български', flag: '🇧🇬', englishName: 'Bulgarian' },
        { code: 'hr', name: 'Hrvatski', flag: '🇭🇷', englishName: 'Croatian' },
        { code: 'sr', name: 'Српски', flag: '🇷🇸', englishName: 'Serbian' },
        { code: 'et', name: 'Eesti', flag: '🇪🇪', englishName: 'Estonian' },
        { code: 'sl', name: 'Slovenščina', flag: '🇸🇮', englishName: 'Slovenian' },
    ];

    // Состояние для модального окна выбора языка
    const [showLanguageSelector, setShowLanguageSelector] = useState(false);
    const [languageSearch, setLanguageSearch] = useState('');

    // Фильтрация языков по поисковому запросу
    const filteredLanguages = useMemo(() => {
        if (!languageSearch) return allLanguages;
        const search = languageSearch.toLowerCase();
        return allLanguages.filter(lang =>
            lang.name.toLowerCase().includes(search) ||
            lang.englishName.toLowerCase().includes(search) ||
            lang.code.toLowerCase().includes(search)
        );
    }, [languageSearch]);

    // Получение данных о текущем языке
    const currentLanguage = useMemo(() => {
        return allLanguages.find(lang => lang.code === translateToLanguage) || allLanguages[0];
    }, [translateToLanguage]);

    // Компонент выбора языка
    const renderLanguageSelector = () => {
        // Если модальное окно не открыто, показываем кнопку выбора
        if (!showLanguageSelector) {
            return (
                <div style={{
                    position: 'relative',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <label style={{
                        color: '#111827',
                        fontWeight: '600',
                        fontSize: '14px',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        Your Language
                        <span style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            fontWeight: 'normal',
                            fontStyle: 'italic'
                        }}>
                            (UI & translations)
                        </span>
                    </label>
                    <button
                        onClick={() => setShowLanguageSelector(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            backgroundColor: '#F9FAFB',
                            color: '#374151',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '18px' }}>{currentLanguage.flag}</span>
                            <span>{currentLanguage.name}</span>
                        </span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
                        </svg>
                    </button>
                </div>
            );
        }

        // Если модальное окно открыто, показываем полный селектор языков
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '16px'
            }} onClick={() => setShowLanguageSelector(false)}>
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '360px',
                    maxHeight: '80vh',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }} onClick={(e) => e.stopPropagation()}>
                    <div style={{
                        padding: '16px',
                        borderBottom: '1px solid #E5E7EB',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{
                                margin: 0,
                                fontSize: '16px',
                                fontWeight: 600,
                                color: '#111827'
                            }}>
                                Select Your Language
                            </h3>
                            <button
                                onClick={() => setShowLanguageSelector(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '6px'
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#6B7280" viewBox="0 0 16 16">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                                </svg>
                            </button>
                        </div>
                        <div style={{
                            position: 'relative',
                            width: '100%'
                        }}>
                            <input
                                type="text"
                                value={languageSearch}
                                onChange={(e) => setLanguageSearch(e.target.value)}
                                placeholder="Search languages..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 36px',
                                    borderRadius: '6px',
                                    border: '1px solid #E5E7EB',
                                    backgroundColor: '#F9FAFB',
                                    fontSize: '14px',
                                    color: '#374151',
                                    outline: 'none'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            />
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="#9CA3AF"
                                viewBox="0 0 16 16"
                                style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)'
                                }}
                            >
                                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
                            </svg>
                            {languageSearch && (
                                <button
                                    onClick={() => setLanguageSearch('')}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        backgroundColor: '#E5E7EB'
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#6B7280" viewBox="0 0 16 16">
                                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <p style={{
                            margin: 0,
                            fontSize: '12px',
                            color: '#6B7280',
                            lineHeight: 1.5
                        }}>
                            This will be used for both the interface language and translations. Your cards will be created in this language.
                        </p>
                    </div>
                    <div style={{
                        overflowY: 'auto',
                        maxHeight: 'calc(80vh - 135px)',
                        padding: '8px 0'
                    }}>
                        {filteredLanguages.length === 0 ? (
                            <div style={{
                                padding: '16px',
                                textAlign: 'center',
                                color: '#6B7280',
                                fontSize: '14px'
                            }}>
                                No languages found matching "{languageSearch}"
                            </div>
                        ) : (
                            filteredLanguages.map(language => (
                                <button
                                    key={language.code}
                                    onClick={() => {
                                        dispatch(setTranslateToLanguage(language.code));
                                        setShowLanguageSelector(false);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        width: '100%',
                                        padding: '12px 16px',
                                        backgroundColor: language.code === translateToLanguage ? '#EFF6FF' : 'transparent',
                                        border: 'none',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        if (language.code !== translateToLanguage) {
                                            e.currentTarget.style.backgroundColor = '#F3F4F6';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (language.code !== translateToLanguage) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    <span style={{
                                        fontSize: '22px',
                                        marginRight: '12px',
                                        width: '28px',
                                        textAlign: 'center'
                                    }}>
                                        {language.flag}
                                    </span>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start'
                                    }}>
                                        <span style={{
                                            color: language.code === translateToLanguage ? '#2563EB' : '#111827',
                                            fontWeight: language.code === translateToLanguage ? '600' : 'normal',
                                            fontSize: '14px'
                                        }}>
                                            {language.name}
                                        </span>
                                        {language.englishName !== language.name && (
                                            <span style={{
                                                color: '#6B7280',
                                                fontSize: '12px'
                                            }}>
                                                {language.englishName}
                                            </span>
                                        )}
                                    </div>
                                    {language.code === translateToLanguage && (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            fill="#2563EB"
                                            viewBox="0 0 16 16"
                                            style={{ marginLeft: 'auto' }}
                                        >
                                            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                        </svg>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Добавим состояние для изучаемого языка (язык исходного текста)
    const [sourceLanguage, setSourceLanguage] = useState<string>(() => {
        // Load from localStorage on initialization
        return localStorage.getItem('source_language') || '';
    });
    const [detectedLanguage, setDetectedLanguage] = useState<string | null>(() => {
        // Load detected language from localStorage
        return localStorage.getItem('detected_language') || null;
    });
    const [isDetectingLanguage, setIsDetectingLanguage] = useState(false);
    const [showSourceLanguageSelector, setShowSourceLanguageSelector] = useState(false);
    const [sourceLanguageSearch, setSourceLanguageSearch] = useState('');
    const [isAutoDetectLanguage, setIsAutoDetectLanguage] = useState(() => {
        // Default to true unless explicitly set to false in localStorage
        return localStorage.getItem('auto_detect_language') !== 'false';
    });

    // Фильтрация языков для изучаемого языка
    const filteredSourceLanguages = useMemo(() => {
        if (!sourceLanguageSearch) return allLanguages;
        const search = sourceLanguageSearch.toLowerCase();
        return allLanguages.filter(lang =>
            lang.name.toLowerCase().includes(search) ||
            lang.englishName.toLowerCase().includes(search) ||
            lang.code.toLowerCase().includes(search)
        );
    }, [sourceLanguageSearch]);

    // Получение данных о текущем изучаемом языке
    const currentSourceLanguage = useMemo(() => {
        if (sourceLanguage) {
            return allLanguages.find(lang => lang.code === sourceLanguage) || null;
        }
        if (detectedLanguage) {
            return allLanguages.find(lang => lang.code === detectedLanguage) || null;
        }
        return null;
    }, [sourceLanguage, detectedLanguage]);

    // Добавим состояние для отслеживания нажатия кнопки Create Card
    const [createCardClicked, setCreateCardClicked] = useState(false);

    // Функция для автоматического определения языка
    const detectLanguage = useCallback(async (text: string) => {
        // Определяем язык, если есть текст
        if (!text || text.trim().length < 2) return;

        setIsDetectingLanguage(true);

        try {
            // Если у нас есть доступ к API OpenAI, используем его для определения языка
            if (modelProvider === ModelProvider.OpenAI && openAiKey) {
                const response = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        {
                            role: "system",
                            content: "You are a language detection assistant. Respond only with the ISO 639-1 language code."
                        },
                        {
                            role: "user",
                            content: `Detect the language of this text and respond only with the ISO 639-1 language code (e.g. 'en', 'ru', 'fr', etc.): "${text}"`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 10
                });

                const detectedCode = response.choices[0].message.content?.trim().toLowerCase();

                // Проверяем, является ли результат действительным языковым кодом
                if (detectedCode && allLanguages.some(lang => lang.code === detectedCode)) {
                    setDetectedLanguage(detectedCode);
                    localStorage.setItem('detected_language', detectedCode);
                    console.log("Language detected:", detectedCode);
                    // Сбрасываем флаг нажатия кнопки, так как язык определен
                    setCreateCardClicked(false);
                    // Сохраняем в localStorage, что язык был определен
                    localStorage.setItem('language_already_detected', 'true');

                    // Сохраняем определенный язык в Redux
                    updateSourceLanguage(detectedCode);
                }
            } else {
                // Если OpenAI недоступен, используем более простую эвристику
                // Это упрощенная версия, в реальном приложении можно использовать 
                // библиотеки вроде franc.js или langdetect
                const textSample = text.trim().toLowerCase().slice(0, 100);

                // Единый блок определения языка
                const cyrillicPattern = /[а-яё]/gi;
                const latinPattern = /[a-z]/gi;
                const chinesePattern = /[\u4e00-\u9fff]/gi;
                const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/gi;
                const koreanPattern = /[\uac00-\ud7af]/gi;
                const arabicPattern = /[\u0600-\u06ff]/gi;

                // Паттерны для испанского языка
                const spanishPattern = /[áéíóúüñ¿¡]/gi;
                const spanishWords = ['hasta', 'desde', 'como', 'pero', 'porque', 'adonde', 'quien', 'para', 'por'];

                // Проверяем испанские слова
                const isSpanishWord = spanishWords.some(word =>
                    textSample === word || textSample.startsWith(word + ' ') || textSample.includes(' ' + word + ' ')
                );

                // Определяем язык
                let detectedLang = '';

                if (cyrillicPattern.test(textSample)) {
                    console.log("Detected Cyrillic script - setting Russian");
                    detectedLang = 'ru';
                } else if (chinesePattern.test(textSample)) {
                    console.log("Detected Chinese characters");
                    detectedLang = 'zh';
                } else if (japanesePattern.test(textSample)) {
                    console.log("Detected Japanese characters");
                    detectedLang = 'ja';
                } else if (koreanPattern.test(textSample)) {
                    console.log("Detected Korean characters");
                    detectedLang = 'ko';
                } else if (arabicPattern.test(textSample)) {
                    console.log("Detected Arabic script");
                    detectedLang = 'ar';
                } else if (spanishPattern.test(textSample) || isSpanishWord) {
                    console.log("Detected Spanish text or common Spanish word");
                    detectedLang = 'es';
                } else if (latinPattern.test(textSample)) {
                    console.log("Detected Latin script, defaulting to English");
                    detectedLang = 'en';
                }

                if (detectedLang) {
                    setDetectedLanguage(detectedLang);

                    // Сохраняем определенный язык в Redux
                    updateSourceLanguage(detectedLang);

                    // Сбрасываем флаг нажатия кнопки, так как язык определен
                    setCreateCardClicked(false);
                    // Сохраняем в localStorage, что язык был определен
                    localStorage.setItem('language_already_detected', 'true');
                }
            }
        } catch (error) {
            console.error("Error detecting language:", error);
        } finally {
            setIsDetectingLanguage(false);
        }
    }, [openai, openAiKey, modelProvider, dispatch, allLanguages, updateSourceLanguage]);

    // Обновление определения языка при изменении текста
    useEffect(() => {
        // Проверяем, был ли язык уже определен ранее
        const languageAlreadyDetected = localStorage.getItem('language_already_detected') === 'true';

        // Определяем язык только в следующих случаях:
        // 1. Режим автоопределения включен
        // 2. Есть текст для анализа
        // 3. И ЛИБО это первый запуск (язык еще не определен), 
        //    ЛИБО была нажата кнопка Create Card и язык не был определен
        if (text && text.trim().length > 2 && isAutoDetectLanguage &&
            ((!languageAlreadyDetected && !detectedLanguage) || createCardClicked)) {

            // Используем debounce, чтобы не определять язык при каждом нажатии клавиши
            const timer = setTimeout(() => {
                detectLanguage(text);
            }, 500);

            return () => clearTimeout(timer);
        }
    }, [text, detectLanguage, isAutoDetectLanguage, detectedLanguage, createCardClicked, updateSourceLanguage]);

    // Обработчик переключения между автоопределением и ручным выбором
    const toggleAutoDetect = () => {
        const newAutoDetectValue = !isAutoDetectLanguage;
        setIsAutoDetectLanguage(newAutoDetectValue);
        // Save to localStorage
        localStorage.setItem('auto_detect_language', newAutoDetectValue ? 'true' : 'false');

        if (isAutoDetectLanguage) {
            // If turning off auto-detection, set source language to detected language (if available)
            if (detectedLanguage) {
                updateSourceLanguage(detectedLanguage);
            }
        } else {
            // If turning on auto-detection, clear manual source language
            updateSourceLanguage('');
            if (text) {
                // And re-detect language of text
                detectLanguage(text);
            }
        }
    };

    // Компонент выбора изучаемого языка
    const renderSourceLanguageSelector = () => {
        // Если модальное окно не открыто, показываем кнопку выбора
        if (!showSourceLanguageSelector) {
            return (
                <div style={{
                    position: 'relative',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%'
                    }}>
                        <label style={{
                            color: '#111827',
                            fontWeight: '600',
                            fontSize: '14px',
                            margin: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <span>Source Language</span>
                            <span style={{
                                fontSize: '12px',
                                color: '#6B7280',
                                fontWeight: 'normal',
                                fontStyle: 'italic'
                            }}>
                                (of your text)
                            </span>
                        </label>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            <span style={{
                                fontSize: '12px',
                                color: isAutoDetectLanguage ? '#10B981' : '#9CA3AF',
                                transition: 'color 0.2s ease'
                            }}>
                                Auto
                            </span>
                            <button
                                onClick={toggleAutoDetect}
                                style={{
                                    width: '36px',
                                    height: '20px',
                                    backgroundColor: isAutoDetectLanguage ? '#10B981' : '#E5E7EB',
                                    border: 'none',
                                    borderRadius: '10px',
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s ease'
                                }}
                            >
                                <span style={{
                                    position: 'absolute',
                                    width: '16px',
                                    height: '16px',
                                    backgroundColor: 'white',
                                    borderRadius: '50%',
                                    top: '2px',
                                    left: isAutoDetectLanguage ? '18px' : '2px',
                                    transition: 'left 0.2s ease',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                                }}></span>
                            </button>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSourceLanguageSelector(true)}
                        disabled={isAutoDetectLanguage}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px solid #E5E7EB',
                            backgroundColor: isAutoDetectLanguage ? '#F3F4F6' : '#F9FAFB',
                            color: '#374151',
                            fontSize: '14px',
                            cursor: isAutoDetectLanguage ? 'not-allowed' : 'pointer',
                            opacity: isAutoDetectLanguage ? 0.7 : 1,
                            transition: 'all 0.2s ease',
                            textAlign: 'left'
                        }}
                        onMouseOver={(e) => !isAutoDetectLanguage && (e.currentTarget.style.backgroundColor = '#F3F4F6')}
                        onMouseOut={(e) => !isAutoDetectLanguage && (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isDetectingLanguage ? (
                                <Loader type="pulse" size="small" inline color="#6B7280" />
                            ) : currentSourceLanguage ? (
                                <>
                                    <span style={{ fontSize: '18px' }}>{currentSourceLanguage.flag}</span>
                                    <span>{currentSourceLanguage.name}</span>
                                    {isAutoDetectLanguage && (
                                        <span style={{
                                            fontSize: '12px',
                                            color: '#10B981',
                                            backgroundColor: '#ECFDF5',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            marginLeft: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}>
                                            <FaCheck size={10} />
                                            <span>Detected</span>
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span style={{ color: '#9CA3AF' }}>
                                    {isAutoDetectLanguage ? 'Detecting language...' : 'Select source language'}
                                </span>
                            )}
                        </span>
                        {!isAutoDetectLanguage && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
                            </svg>
                        )}
                    </button>

                    {/* Язык перевода */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 8px',
                        backgroundColor: '#F3F4F6',
                        borderRadius: '6px',
                        marginTop: '4px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            <span style={{ fontSize: '14px' }}>
                                {currentSourceLanguage ? currentSourceLanguage.flag : '🌐'}
                            </span>
                            <FaExchangeAlt size={12} color="#6B7280" />
                            <span style={{ fontSize: '14px' }}>{currentLanguage.flag}</span>
                        </div>
                        <span style={{
                            fontSize: '12px',
                            color: '#4B5563'
                        }}>
                            Translating {currentSourceLanguage ? `from ${currentSourceLanguage.englishName}` : ''} to {currentLanguage.englishName}
                        </span>
                        {isAutoDetectLanguage && (
                            <button
                                onClick={() => {
                                    // Сбрасываем флаг определения языка и повторно определяем
                                    localStorage.removeItem('language_already_detected');
                                    if (text) {
                                        detectLanguage(text);
                                    }
                                }}
                                title="Reset language detection"
                                style={{
                                    marginLeft: 'auto',
                                    background: 'none',
                                    border: 'none',
                                    display: 'flex',
                                    padding: '2px',
                                    cursor: 'pointer',
                                    color: '#6B7280'
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z" />
                                    <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            );
        }

        // Если модальное окно открыто, показываем полный селектор языков
        return (
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '16px'
            }} onClick={() => setShowSourceLanguageSelector(false)}>
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    width: '90%',
                    maxWidth: '360px',
                    maxHeight: '80vh',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }} onClick={(e) => e.stopPropagation()}>
                    <div style={{
                        padding: '16px',
                        borderBottom: '1px solid #E5E7EB',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <h3 style={{
                                margin: 0,
                                fontSize: '16px',
                                fontWeight: 600,
                                color: '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <FaLanguage color="#6366F1" size={18} />
                                <span>Select Source Language</span>
                            </h3>
                            <button
                                onClick={() => setShowSourceLanguageSelector(false)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '6px'
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#6B7280" viewBox="0 0 16 16">
                                    <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                                </svg>
                            </button>
                        </div>
                        <div style={{
                            position: 'relative',
                            width: '100%'
                        }}>
                            <input
                                type="text"
                                value={sourceLanguageSearch}
                                onChange={(e) => setSourceLanguageSearch(e.target.value)}
                                placeholder="Search languages..."
                                style={{
                                    width: '100%',
                                    padding: '10px 12px 10px 36px',
                                    borderRadius: '6px',
                                    border: '1px solid #E5E7EB',
                                    backgroundColor: '#F9FAFB',
                                    fontSize: '14px',
                                    color: '#374151',
                                    outline: 'none'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                                onBlur={(e) => e.target.style.borderColor = '#E5E7EB'}
                            />
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                fill="#9CA3AF"
                                viewBox="0 0 16 16"
                                style={{
                                    position: 'absolute',
                                    left: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)'
                                }}
                            >
                                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
                            </svg>
                            {sourceLanguageSearch && (
                                <button
                                    onClick={() => setSourceLanguageSearch('')}
                                    style={{
                                        position: 'absolute',
                                        right: '12px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        backgroundColor: '#E5E7EB'
                                    }}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="#6B7280" viewBox="0 0 16 16">
                                        <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                                    </svg>
                                </button>
                            )}
                        </div>
                        <p style={{
                            margin: 0,
                            fontSize: '12px',
                            color: '#6B7280',
                            lineHeight: 1.5
                        }}>
                            Select the language of your text. This helps generate more accurate translations and examples.
                        </p>
                    </div>
                    <div style={{
                        overflowY: 'auto',
                        maxHeight: 'calc(80vh - 135px)',
                        padding: '8px 0'
                    }}>
                        {filteredSourceLanguages.length === 0 ? (
                            <div style={{
                                padding: '16px',
                                textAlign: 'center',
                                color: '#6B7280',
                                fontSize: '14px'
                            }}>
                                No languages found matching "{sourceLanguageSearch}"
                            </div>
                        ) : (
                            filteredSourceLanguages.map(language => (
                                <button
                                    key={language.code}
                                    onClick={() => {
                                        setSourceLanguage(language.code);
                                        setShowSourceLanguageSelector(false);
                                        setIsAutoDetectLanguage(false);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        width: '100%',
                                        padding: '12px 16px',
                                        backgroundColor: language.code === sourceLanguage ? '#EFF6FF' : 'transparent',
                                        border: 'none',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                        if (language.code !== sourceLanguage) {
                                            e.currentTarget.style.backgroundColor = '#F3F4F6';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (language.code !== sourceLanguage) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                        }
                                    }}
                                >
                                    <span style={{
                                        fontSize: '22px',
                                        marginRight: '12px',
                                        width: '28px',
                                        textAlign: 'center'
                                    }}>
                                        {language.flag}
                                    </span>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'flex-start'
                                    }}>
                                        <span style={{
                                            color: language.code === sourceLanguage ? '#2563EB' : '#111827',
                                            fontWeight: language.code === sourceLanguage ? '600' : 'normal',
                                            fontSize: '14px'
                                        }}>
                                            {language.name}
                                        </span>
                                        {language.englishName !== language.name && (
                                            <span style={{
                                                color: '#6B7280',
                                                fontSize: '12px'
                                            }}>
                                                {language.englishName}
                                            </span>
                                        )}
                                    </div>
                                    {language.code === sourceLanguage && (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            fill="#2563EB"
                                            viewBox="0 0 16 16"
                                            style={{ marginLeft: 'auto' }}
                                        >
                                            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
                                        </svg>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Тестовая функция для проверки новой итеративной валидации
    const testLinguisticValidation = async () => {
        if (!apiKey) {
            showError('API key is required for testing', 'error');
            return;
        }

        // Тест с проблемным словом "млекопитающими"
        const testText = "млекопитающими";

        console.log('Testing new iterative validation system...');
        showError('Testing iterative validation system...', 'info');

        try {
            const result = await createValidatedLinguisticInfo(
                aiService,
                apiKey,
                testText,
                'ru', // source language
                'ru', // user language
                3 // максимум 3 попытки для теста
            );

            console.log('Test result:', result);

            if (result.linguisticInfo) {
                if (result.wasValidated) {
                    if (result.attempts > 1) {
                        showError(`✅ Test passed: Grammar reference created and validated after ${result.attempts} attempts`, 'success');
                    } else {
                        showError(`✅ Test passed: Grammar reference validated on first attempt`, 'success');
                    }
                } else {
                    showError(`⚠️ Test completed: Grammar reference created but validation failed after ${result.attempts} attempts`, 'warning');
                }

                // Показываем созданную справку в консоли для проверки
                console.log('Generated linguistic info:', result.linguisticInfo);
            } else {
                showError(`❌ Test failed: Could not generate grammar reference after ${result.attempts} attempts`, 'error');
            }
        } catch (error) {
            console.error('Test error:', error);
            showError('❌ Test failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
        }
    };

    // Handler для обновления лингвистической информации
    const handleLinguisticInfoUpdate = (newInfo: string) => {
        dispatch(setLinguisticInfo(newInfo));
        if (isSaved) {
            setIsEdited(true);
        }
    };

    // Add this to the component mount effect to ensure source language is properly initialized
    useEffect(() => {
        // Get source language and auto-detect preference from localStorage
        const savedSourceLanguage = localStorage.getItem('source_language');
        const savedDetectedLanguage = localStorage.getItem('detected_language');
        const savedAutoDetect = localStorage.getItem('auto_detect_language');

        console.log('Initializing language settings from localStorage:', {
            savedSourceLanguage,
            savedDetectedLanguage,
            savedAutoDetect
        });

        // Update Redux store with saved source language
        if (savedSourceLanguage) {
            updateSourceLanguage(savedSourceLanguage);
        } else if (savedDetectedLanguage && (savedAutoDetect !== 'false')) {
            // If auto-detect is enabled and we have a previously detected language
            updateSourceLanguage(savedDetectedLanguage);
        }

        // Set auto-detect preference
        if (savedAutoDetect === 'false') {
            setIsAutoDetectLanguage(false);
        }

    }, [updateSourceLanguage]);

    // AI-powered функция для получения названия языка
    const getLanguageNameFromAI = useCallback(async (languageCode: string): Promise<string> => {
        try {
            if (!apiKey) {
                return languageCode.toUpperCase(); // Fallback if no API key
            }

            const prompt = `Return only the native name of the language with ISO 639-1 code "${languageCode}".
Examples: 
- "en" -> "English"
- "ru" -> "Русский" 
- "es" -> "Español"
- "fr" -> "Français"
- "de" -> "Deutsch"
- "zh" -> "中文"
- "ja" -> "日本語"
- "ar" -> "العربية"

Respond with ONLY the native language name, no additional text.`;

            const response = await aiService.createChatCompletion(apiKey, [
                { role: "user", content: prompt }
            ]);

            if (response && response.content) {
                const languageName = response.content.trim();
                // Cache the result in localStorage to avoid repeated API calls
                localStorage.setItem(`language_name_${languageCode}`, languageName);
                return languageName;
            }

            return languageCode.toUpperCase(); // Fallback
        } catch (error) {
            console.error('Error getting language name from AI:', error);
            return languageCode.toUpperCase(); // Fallback
        }
    }, [apiKey, aiService]);

    // Функция с кешированием для получения названия языка
    const getLanguageName = useCallback(async (languageCode: string): Promise<string> => {
        // Сначала проверяем кеш
        const cached = localStorage.getItem(`language_name_${languageCode}`);
        if (cached) {
            return cached;
        }

        // Если нет в кеше, запрашиваем у AI
        return await getLanguageNameFromAI(languageCode);
    }, [getLanguageNameFromAI]);

    // Smart image generation function
    const shouldGenerateImageForText = useCallback(async (text: string): Promise<{ shouldGenerate: boolean; reason: string }> => {
        if (!text || text.trim().length === 0) {
            return { shouldGenerate: false, reason: "No text provided" };
        }

        try {
            const prompt = `Analyze this word/phrase and determine if a visual image would be helpful for language learning: "${text}"

Consider these criteria:
- Concrete objects, animals, places, foods, tools, vehicles = YES
- Abstract concepts, emotions, actions, grammar terms = NO
- People, professions, activities that can be visualized = YES
- Numbers, prepositions, conjunctions, abstract ideas = NO

Respond with ONLY "YES" or "NO" followed by a brief reason (max 10 words).
Format: "YES - concrete object that can be visualized" or "NO - abstract concept"`;

            const response = await aiService.createChatCompletion(apiKey, [
                { role: "user", content: prompt }
            ]);

            if (response && response.content) {
                const result = response.content.trim();
                const shouldGenerate = result.toUpperCase().startsWith('YES');
                const reason = result.includes(' - ') ? result.split(' - ')[1] : 'AI analysis';
                
                return { shouldGenerate, reason };
            }

            return { shouldGenerate: false, reason: "AI analysis failed" };
        } catch (error) {
            console.error('Error analyzing text for image generation:', error);
            return { shouldGenerate: false, reason: "Analysis error" };
        }
    }, [aiService, apiKey]);

    // Handle image mode changes
    const handleImageModeChange = (mode: 'off' | 'smart' | 'always') => {
        dispatch(setImageGenerationMode(mode));
        
        // If switching to 'always' mode and we have text, try to generate an image
        if (mode === 'always' && text && isImageGenerationAvailable()) {
            handleNewImage();
        }
        
        // If switching to 'off' mode, clear existing images
        if (mode === 'off') {
            dispatch(setImage(null));
            dispatch(setImageUrl(null));
        }
    };

    const isGeneratingCard = useSelector((state: RootState) => state.cards.isGeneratingCard);

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
                        {isMultipleCards
                            ? "We're creating multiple cards from your selected options..."
                            : "We're analyzing your text and generating learning materials"}
                    </div>
                    
                    {/* Cancel button in the loader */}
                    <button
                        onClick={handleCancel}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            backgroundColor: '#F3F4F6',
                            color: '#4B5563',
                            border: '1px solid #E5E7EB',
                            borderRadius: '6px',
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            marginTop: '10px'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#E5E7EB';
                            e.currentTarget.style.color = '#374151';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#F3F4F6';
                            e.currentTarget.style.color = '#4B5563';
                        }}
                        title="Cancel card generation"
                    >
                        <FaTimes />
                        Cancel Generation
                    </button>
                </div>
            )}
            {textAnalysisLoader && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    zIndex: 5,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    padding: '0 20px'
                }}>
                    <Loader type="pulse" size="medium" color="#3B82F6" text="Analyzing selected text..." />
                    
                    {/* Cancel button in the text analysis loader */}
                    <button
                        onClick={() => setTextAnalysisLoader(false)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            backgroundColor: '#F3F4F6',
                            color: '#4B5563',
                            border: '1px solid #E5E7EB',
                            borderRadius: '6px',
                            padding: '10px 16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            marginTop: '10px'
                        }}
                        onMouseOver={(e) => {
                            e.currentTarget.style.backgroundColor = '#E5E7EB';
                            e.currentTarget.style.color = '#374151';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = '#F3F4F6';
                            e.currentTarget.style.color = '#4B5563';
                        }}
                        title="Cancel text analysis"
                    >
                        <FaTimes />
                        Cancel Analysis
                    </button>
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
                            {/* Компонент выбора языка интерфейса/перевода */}
                            {renderLanguageSelector()}

                            {/* Добавляем компонент выбора изучаемого языка */}
                            {renderSourceLanguageSelector()}

                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px',
                                marginTop: '4px'
                            }}>
                                <label style={{
                                    color: '#111827',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    margin: 0
                                }}>Image Generation:</label>
                                
                                {/* Smart Image Generation Mode Selector */}
                                <div style={{
                                    display: 'flex',
                                    backgroundColor: '#F3F4F6',
                                    borderRadius: '8px',
                                    padding: '4px',
                                    gap: '2px',
                                    opacity: isImageGenerationAvailable() ? 1 : 0.5
                                }}>
                                    {/* Off Mode */}
                                    <button
                                        type="button"
                                        onClick={() => handleImageModeChange('off')}
                                        disabled={!isImageGenerationAvailable()}
                                        style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: imageGenerationMode === 'off' ? '#FFFFFF' : 'transparent',
                                            color: imageGenerationMode === 'off' ? '#111827' : '#6B7280',
                                            fontSize: '12px',
                                            fontWeight: imageGenerationMode === 'off' ? '600' : '500',
                                            cursor: isImageGenerationAvailable() ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            boxShadow: imageGenerationMode === 'off' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                                        }}
                                    >
                                        🚫 Off
                                    </button>

                                    {/* Smart Mode */}
                                    <button
                                        type="button"
                                        onClick={() => handleImageModeChange('smart')}
                                        disabled={!isImageGenerationAvailable()}
                                        style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: imageGenerationMode === 'smart' ? '#FFFFFF' : 'transparent',
                                            color: imageGenerationMode === 'smart' ? '#111827' : '#6B7280',
                                            fontSize: '12px',
                                            fontWeight: imageGenerationMode === 'smart' ? '600' : '500',
                                            cursor: isImageGenerationAvailable() ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            boxShadow: imageGenerationMode === 'smart' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                                        }}
                                    >
                                        🧠 Smart
                                    </button>

                                    {/* Always Mode */}
                                    <button
                                        type="button"
                                        onClick={() => handleImageModeChange('always')}
                                        disabled={!isImageGenerationAvailable()}
                                        style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: imageGenerationMode === 'always' ? '#FFFFFF' : 'transparent',
                                            color: imageGenerationMode === 'always' ? '#111827' : '#6B7280',
                                            fontSize: '12px',
                                            fontWeight: imageGenerationMode === 'always' ? '600' : '500',
                                            cursor: isImageGenerationAvailable() ? 'pointer' : 'not-allowed',
                                            transition: 'all 0.2s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            boxShadow: imageGenerationMode === 'always' ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                                        }}
                                    >
                                        🎨 Always
                                    </button>
                                </div>

                                {/* Description text */}
                                <div style={{
                                    fontSize: '11px',
                                    color: '#6B7280',
                                    lineHeight: '1.4',
                                    marginTop: '2px'
                                }}>
                                    {imageGenerationMode === 'off' && 'No images will be generated'}
                                    {imageGenerationMode === 'smart' && 'AI decides: Images only for concrete objects, places, and visual concepts. Saves API costs by skipping abstract terms.'}
                                    {imageGenerationMode === 'always' && 'Images generated for all cards'}
                                </div>

                                {!isImageGenerationAvailable() && (
                                    <div style={{
                                        fontSize: '12px',
                                        color: '#EF4444',
                                        backgroundColor: '#FEF2F2',
                                        padding: '6px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #FECACA'
                                    }}>
                                        Image generation not available with Groq provider
                                    </div>
                                )}
                            </div>
                            {imageGenerationMode !== 'off' && isImageGenerationAvailable() && renderImageSettings()}
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
                </div>
            </div>

            {/* Add the text options modal */}
            {renderTextOptionsModal()}

            {/* Add the modal */}
            {renderModal()}

            {/* Добавляем модальное окно для выбора изучаемого языка */}
            {showSourceLanguageSelector && renderSourceLanguageSelector()}

            {/* Не забываем добавить модальное окно для выбора языка в список отображаемых модальных окон */}
            {showLanguageSelector && renderLanguageSelector()}

            {/* Error notifications displayed as toast notifications */}
            <div style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                zIndex: 9999,
                pointerEvents: 'none'
            }}>
                <div style={{ pointerEvents: 'auto' }}>
                    {renderErrorNotification()}
                </div>
            </div>
        </div>
    );
};

export default CreateCard;
