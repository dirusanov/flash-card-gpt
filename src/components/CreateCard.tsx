import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTabAware } from './TabAwareProvider';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from "../store";
import { setDeckId } from "../store/actions/decks";
import { saveCardToStorage, setBack, setExamples, setImage, setImageUrl, setTranslation, setText, loadStoredCards, setFront, updateStoredCard, setCurrentCardId, setLinguisticInfo, setTranscription, setLastDraftCard } from "../store/actions/cards";
import { CardLangLearning, CardGeneral } from '../services/ankiService';
import { getDescriptionImage, getExamples, translateText, isQuotaExceededCached, getCachedQuotaError, cacheQuotaExceededError, shouldShowQuotaNotification, markQuotaNotificationShown, formatOpenAIErrorMessage } from "../services/openaiApi";
import { setMode, setShouldGenerateImage, setTranslateToLanguage, setAIInstructions, setImageInstructions, setImageGenerationMode } from "../store/actions/settings";
import { Modes } from "../constants";
import ResultDisplay from "./ResultDisplay";
import { getLoadingMessage, getDetailedLoadingMessage, type LoadingMessage, type DetailedLoadingMessage } from '../services/loadingMessages';
import { setGlobalProgressCallback, getGlobalApiTracker, resetGlobalApiTracker } from '../services/apiTracker';
import { getImage } from '../apiUtils';
import { backgroundFetch } from '../services/backgroundFetch';
import useErrorNotification from './useErrorHandler';
import { FaCog, FaLightbulb, FaCode, FaImage, FaMagic, FaTimes, FaList, FaFont, FaLanguage, FaCheck, FaExchangeAlt, FaGraduationCap, FaBrain, FaToggleOn, FaToggleOff, FaRobot, FaSave, FaEdit, FaClock, FaChevronRight, FaKey } from 'react-icons/fa';
import { loadCardsFromStorage } from '../store/middleware/cardsLocalStorage';
import { StoredCard } from '../store/reducers/cards';
import Loader from './Loader';
import { getAIService, getApiKeyForProvider, createTranslation, createExamples, createFlashcard, createOptimizedLinguisticInfo, createTranscription } from '../services/aiServiceFactory';
import { ModelProvider } from '../store/reducers/settings';
import UniversalCardCreator from './UniversalCardCreator';
import { createAIAgentService, PageContentContext } from '../services/aiAgentService';
import { imageUrlToBase64 } from '../services/ankiService';
import { PageContentExtractor } from '../services/pageContentExtractor';

// Добавляем интерфейс для типов общих карточек
interface GeneralCardTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    prompt: string;
}

// Шаблоны для создания общих карточек
const GENERAL_CARD_TEMPLATES: GeneralCardTemplate[] = [
    {
        id: 'qa',
        name: 'Q&A',
        description: 'Question and answer format',
        icon: '❓',
        prompt: 'Create a question and answer based on this text. Format as Q: [question] A: [answer]'
    },
    {
        id: 'definition',
        name: 'Definition',
        description: 'Key term and definition',
        icon: '📖',
        prompt: 'Extract the main concept and provide a clear definition'
    },
    {
        id: 'summary',
        name: 'Summary',
        description: 'Key points summary',
        icon: '📝',
        prompt: 'Summarize the key points from this text in bullet points'
    },
    {
        id: 'facts',
        name: 'Facts',
        description: 'Important facts and details',
        icon: '💡',
        prompt: 'Extract the most important facts and details from this text'
    },
    {
        id: 'process',
        name: 'Process',
        description: 'Step-by-step explanation',
        icon: '🔄',
        prompt: 'Break down any process or procedure mentioned in this text into clear steps'
    },
    {
        id: 'concept',
        name: 'Concept',
        description: 'Explain the concept',
        icon: '🧠',
        prompt: 'Explain the main concept from this text in simple terms with examples'
    }
];

const isDev = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
    if (isDev) {
        console.log(...args);
    }
};

const ensureDraftDate = (value: StoredCard['createdAt'] | undefined): Date => {
    if (value instanceof Date) {
        return value;
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return new Date();
};

const normalizeDraftCard = (card: StoredCard): StoredCard => ({
    ...card,
    createdAt: ensureDraftDate(card.createdAt),
    examples: card.examples ?? [],
    image: card.image ?? null,
    imageUrl: card.imageUrl ?? null,
    translation: card.translation ?? null,
    front: card.front ?? card.text,
    back: card.back ?? null,
    linguisticInfo: card.linguisticInfo ?? '',
    transcription: card.transcription ?? '',
});

const serializeDraftForCompare = (card: StoredCard): string => {
    const normalizedExamples = (card.examples ?? []).map(example => ([example[0], example[1] ?? null])) as Array<[string, string | null]>;

    return JSON.stringify({
        id: card.id,
        mode: card.mode,
        text: card.text,
        translation: card.translation ?? null,
        front: card.front ?? '',
        back: card.back ?? null,
        examples: normalizedExamples,
        image: card.image ?? null,
        imageUrl: card.imageUrl ?? null,
        createdAt: ensureDraftDate(card.createdAt).toISOString(),
        linguisticInfo: card.linguisticInfo ?? '',
        transcription: card.transcription ?? '',
    });
};

const getDraftContentHash = (card: StoredCard): string => {
    const normalizedExamples = (card.examples ?? []).map(example => ([example[0], example[1] ?? null])) as Array<[string, string | null]>;

    return JSON.stringify({
        id: card.id,
        mode: card.mode,
        text: card.text,
        translation: card.translation ?? null,
        front: card.front ?? '',
        back: card.back ?? null,
        examples: normalizedExamples,
        image: card.image ?? null,
        imageUrl: card.imageUrl ?? null,
        linguisticInfo: card.linguisticInfo ?? '',
        transcription: card.transcription ?? '',
    });
};

type DraftSnapshot = Omit<StoredCard, 'id' | 'createdAt'> & { id?: string; createdAt?: StoredCard['createdAt'] };

interface CreateCardProps {
    // Пустой интерфейс, так как больше не нужен onSettingsClick
}

const CreateCard: React.FC<CreateCardProps> = () => {
    // Add CSS animations for the preview modal
    React.useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes slideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px) scale(0.95);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateX(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
            @keyframes glowPulse {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
                    transform: scale(1);
                }
                50% {
                    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
                    transform: scale(1.02);
                }
            }
            @keyframes modeSwitch {
                0% {
                    transform: scale(1);
                    opacity: 0.8;
                }
                50% {
                    transform: scale(1.01);
                    opacity: 1;
                }
                100% {
                    transform: scale(1);
                    opacity: 1;
                }
            }
            @keyframes instantSlide {
                0% {
                    transform: translateX(-10px);
                    opacity: 0;
                }
                100% {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes smoothGlow {
                0%, 100% {
                    boxShadow: 0 0 0 0 rgba(59, 130, 246, 0.3);
                }
                50% {
                    boxShadow: 0 0 0 8px rgba(59, 130, 246, 0);
                }
            }
        `;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    const [showResult, setShowResult] = useState(false);
    const deckId = useSelector((state: RootState) => state.deck.deckId);
    const tabAware = useTabAware();

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();

    // Helper function to update source language in Redux
    const updateSourceLanguage = useCallback((language: string) => {
        // Use direct action object instead of the action creator to fix type issues
        dispatch({ type: 'SET_SOURCE_LANGUAGE', payload: language });
        // Also save to localStorage
        localStorage.setItem('source_language', language);
    }, [dispatch]);

    const noop = useCallback(() => {}, []);

    const { text, translation, examples, image, imageUrl, front, back, currentCardId, linguisticInfo, transcription, fieldIdPrefix } = tabAware;
    const lastDraftCard = useSelector((state: RootState) => state.cards.lastDraftCard);
    const translateToLanguage = useSelector((state: RootState) => state.settings.translateToLanguage);
    const aiInstructions = useSelector((state: RootState) => state.settings.aiInstructions);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const mode = useSelector((state: RootState) => state.settings.mode);
    const [originalSelectedText, setOriginalSelectedText] = useState('');
    const latestCardPreview = useMemo(() => {
        if (!lastDraftCard) {
            return null;
        }

        let createdAtValue: Date;
        if (lastDraftCard.createdAt instanceof Date) {
            createdAtValue = lastDraftCard.createdAt;
        } else {
            createdAtValue = new Date(lastDraftCard.createdAt as unknown as string);
        }

        if (Number.isNaN(createdAtValue.getTime())) {
            createdAtValue = new Date();
        }

        const normalizedExamples = Array.isArray(lastDraftCard.examples)
            ? lastDraftCard.examples
            : [];

        const normalizedRaw: StoredCard = {
            ...lastDraftCard,
            createdAt: createdAtValue,
            examples: normalizedExamples
        };

        const hasMeaningfulContent = Boolean(
            (normalizedRaw.text && normalizedRaw.text.trim()) ||
            (normalizedRaw.translation && normalizedRaw.translation.trim()) ||
            (normalizedRaw.front && normalizedRaw.front.trim()) ||
            (normalizedRaw.back && normalizedRaw.back.trim()) ||
            (normalizedRaw.examples && normalizedRaw.examples.length > 0) ||
            normalizedRaw.image ||
            normalizedRaw.imageUrl ||
            (normalizedRaw.linguisticInfo && normalizedRaw.linguisticInfo.trim()) ||
            (normalizedRaw.transcription && normalizedRaw.transcription.trim())
        );

        if (!hasMeaningfulContent) {
            return null;
        }

        const isLanguageMode = lastDraftCard.mode === Modes.LanguageLearning;
        const frontText = isLanguageMode
            ? normalizedRaw.text
            : (normalizedRaw.front || normalizedRaw.text);
        const translationText = isLanguageMode
            ? normalizedRaw.translation || ''
            : (normalizedRaw.back || normalizedRaw.translation || '');

        const snippetSource = (frontText || translationText || normalizedRaw.text || '')
            .replace(/\s+/g, ' ')
            .trim();
        const snippet = snippetSource.length > 0
            ? snippetSource
            : 'Saved card is ready to preview';
        const previewSnippet = snippet.length > 110
            ? `${snippet.slice(0, 107).trim()}…`
            : snippet;

        const englishLocale = 'en-GB';
        const fullTimestampFormatter = new Intl.DateTimeFormat(englishLocale, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        const shortTimeFormatter = new Intl.DateTimeFormat(englishLocale, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const fullTimestampLabel = fullTimestampFormatter.format(createdAtValue);
        const shortTimeLabel = shortTimeFormatter.format(createdAtValue);

        return {
            raw: normalizedRaw,
            front: frontText || '',
            translation: translationText || '',
            examples: normalizedExamples,
            createdAt: createdAtValue,
            snippet,
            previewSnippet,
            timeLabel: fullTimestampLabel,
            shortTimeLabel,
            modeLabel: isLanguageMode ? 'Language Learning' : 'General Topic'
        };
    }, [lastDraftCard]);

    const draftIdRef = useRef<string | null>(lastDraftCard?.id ?? null);
    const lastDraftSerializedRef = useRef<string | null>(lastDraftCard ? serializeDraftForCompare(normalizeDraftCard(lastDraftCard)) : null);
    const lastDraftContentHashRef = useRef<string | null>(lastDraftCard ? getDraftContentHash(normalizeDraftCard(lastDraftCard)) : null);

    useEffect(() => {
        if (lastDraftCard) {
            draftIdRef.current = lastDraftCard.id;
            lastDraftSerializedRef.current = serializeDraftForCompare(normalizeDraftCard(lastDraftCard));
            lastDraftContentHashRef.current = getDraftContentHash(normalizeDraftCard(lastDraftCard));
        }
    }, [lastDraftCard]);

    const enforceLanguageMode = useCallback(() => {
        localStorage.setItem('selected_mode', Modes.LanguageLearning);

        if (mode === Modes.LanguageLearning) {
            return;
        }

        dispatch(setMode(Modes.LanguageLearning));

        // Clear form data when switching modes
        dispatch(setText(''));
        dispatch(setFront(''));
        dispatch(setBack(null));
        dispatch(setTranslation(null));
        dispatch(setExamples([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        dispatch(setLinguisticInfo(''));
        dispatch(setTranscription(''));
        dispatch(setCurrentCardId(null));

        // Reset general card state
        setSelectedTemplate(null);
        setCustomPrompt('');
        setShowTemplateModal(false);
        setShowResult(false);
        setIsMultipleCards(false);
        setCreatedCards([]);
        setCurrentCardIndex(0);

        // Clear API tracker state to prevent Language Learning UI from persisting
        resetGlobalApiTracker();
    }, [mode, dispatch]);

    // Function to toggle between modes (now always enforces Language Learning)
    const toggleMode = useCallback(() => {
        enforceLanguageMode();
    }, [enforceLanguageMode]);

    // Function to switch to specific mode now enforces Language Learning
    const switchToMode = useCallback((_targetMode: string) => {
        enforceLanguageMode();
    }, [enforceLanguageMode]);

    const normalizeImageForStorage = useCallback(async (
        rawImage: string | null | undefined,
        rawImageUrl: string | null | undefined
    ): Promise<{ image: string | null; imageUrl: string | null }> => {
        let normalizedImage = rawImage && rawImage.trim() !== '' ? rawImage : null;
        let normalizedImageUrl = rawImageUrl && rawImageUrl.trim() !== '' ? rawImageUrl : null;

        const isDataUrl = normalizedImage ? normalizedImage.startsWith('data:image') : false;

        if ((!normalizedImage || !isDataUrl) && normalizedImageUrl) {
            try {
                const converted = await imageUrlToBase64(normalizedImageUrl);
                if (converted) {
                    normalizedImage = converted;
                    normalizedImageUrl = null;
                }
            } catch (conversionError) {
                console.error('Failed to convert image URL to base64:', conversionError);
            }
        }

        return {
            image: normalizedImage,
            imageUrl: normalizedImageUrl
        };
    }, []);

    // Keyboard shortcuts handler
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'l' || event.key === 'L') {
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    switchToMode(Modes.LanguageLearning);
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [switchToMode]);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const [loadingGetResult, setLoadingGetResult] = useState(false);
    const [loadingNewImage, setLoadingNewImage] = useState(false);
    const [loadingNewExamples, setLoadingNewExamples] = useState(false);
    const [loadingAccept, setLoadingAccept] = useState(false);
    const [currentLoadingMessage, setCurrentLoadingMessage] = useState<DetailedLoadingMessage | null>(null);
    const [currentProgress, setCurrentProgress] = useState({ completed: 0, total: 0 });
    const [isEdited, setIsEdited] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const [forceHideLoader, setForceHideLoader] = useState(false);
    const [isNewSubmission, setIsNewSubmission] = useState(true);
    const [explicitlySaved, setExplicitlySaved] = useState(false);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const groqApiKey = useSelector((state: RootState) => state.settings.groqApiKey);
    const groqModelName = useSelector((state: RootState) => state.settings.groqModelName);
    const modelProvider = useSelector((state: RootState) => state.settings.modelProvider);
    const shouldGenerateImage = useSelector((state: RootState) => state.settings.shouldGenerateImage);
    const imageGenerationMode = useSelector((state: RootState) => state.settings.imageGenerationMode);
    const [showAISettings, setShowAISettings] = useState(false);

    const IMAGE_MODE_STORAGE_KEY = 'anki_image_generation_mode';
    const hasLoadedImageModeRef = useRef(false);

    // Persist image generation mode changes
    useEffect(() => {
        if (!hasLoadedImageModeRef.current) return;
        try {
            localStorage.setItem(IMAGE_MODE_STORAGE_KEY, imageGenerationMode);
        } catch (error) {
            console.warn('Failed to persist image generation mode:', error);
        }
    }, [imageGenerationMode]);

    // Restore saved image generation mode on first mount
    useEffect(() => {
        if (hasLoadedImageModeRef.current) return;
        hasLoadedImageModeRef.current = true;
        try {
            const savedMode = localStorage.getItem(IMAGE_MODE_STORAGE_KEY) as 'off' | 'smart' | 'always' | null;
            if (savedMode && savedMode !== imageGenerationMode) {
                dispatch(setImageGenerationMode(savedMode));
                if (savedMode === 'off') {
                    dispatch(setShouldGenerateImage(false));
                }
            }
        } catch (error) {
            console.warn('Failed to restore image generation mode:', error);
        }
    }, [dispatch, imageGenerationMode]);

    // Initialize shouldGenerateImage based on current imageGenerationMode
    React.useEffect(() => {
        if (imageGenerationMode === 'smart' || imageGenerationMode === 'always') {
            if (!shouldGenerateImage) {
                debugLog(`🔧 Initializing: Setting shouldGenerateImage=true for ${imageGenerationMode} mode`);
                dispatch(setShouldGenerateImage(true));
            }
        }
    }, [imageGenerationMode, shouldGenerateImage, dispatch]);
    const [showImageSettings, setShowImageSettings] = useState(false);
    const [localAIInstructions, setLocalAIInstructions] = useState(aiInstructions);
    const [localImageInstructions, setLocalImageInstructions] = useState(imageInstructions);
    const { showError, renderErrorNotification } = useErrorNotification()
    
    // Function to check if an error is related to quota exhaustion
    const isQuotaError = (error: Error): boolean => {
        const message = error.message.toLowerCase();
        return message.includes('quota') || 
               message.includes('insufficient_quota') ||
               message.includes('billing') ||
               message.includes('exceeded') ||
               message.includes('429');
    };
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
    
    // State for general card creation
    const [selectedTemplate, setSelectedTemplate] = useState<GeneralCardTemplate | null>(null);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    // Removed isGeneratingGeneralCard - now using unified loadingGetResult
    
    // State for AI cards preview
    const [previewCards, setPreviewCards] = useState<StoredCard[]>([]);
    const [showPreview, setShowPreview] = useState(false);
    const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
    const [savedCardIndices, setSavedCardIndices] = useState<Set<number>>(new Set());
    const [showRecreateModal, setShowRecreateModal] = useState(false);
    const [recreateComments, setRecreateComments] = useState('');
    const [showMissingApiKeyNotice, setShowMissingApiKeyNotice] = useState(false);

    // AbortController for cancelling AI requests
    const abortControllerRef = useRef<AbortController | null>(null);
    const criticalApiErrorRef = useRef(false);

    const stopLoadingImmediately = useCallback(() => {
        debugLog('🚫 Critical API issue detected - stopping loaders instantly');
        criticalApiErrorRef.current = true;
        setForceHideLoader(true);
        setLoadingGetResult(false);
        setIsProcessingCustomInstruction(false);
        setLoadingNewImage(false);
        setLoadingNewExamples(false);
        setCurrentLoadingMessage(null);
        setCurrentProgress({ completed: 0, total: 0 });
        setElapsedTime(0);

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        setGlobalProgressCallback(() => {});
        resetGlobalApiTracker();
        tabAware.setIsGeneratingCard(false);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, [
        tabAware,
        setForceHideLoader,
        setLoadingGetResult,
        setIsProcessingCustomInstruction,
        setLoadingNewImage,
        setLoadingNewExamples,
        setCurrentLoadingMessage,
        setCurrentProgress,
        setElapsedTime
    ]);

    // Получаем сохраненные карточки из tab-aware контекста
    const { storedCards } = tabAware;

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

    const providerDisplayName = useMemo(() => {
        switch (modelProvider) {
            case ModelProvider.Groq:
                return 'Groq';
            case ModelProvider.OpenAI:
            default:
                return 'OpenAI';
        }
    }, [modelProvider]);

    const notifyMissingApiKey = useCallback(() => {
        setShowMissingApiKeyNotice(true);
    }, []);

    useEffect(() => {
        if (apiKey) {
            setShowMissingApiKeyNotice(false);
        }
    }, [apiKey]);

    const handlePotentialApiKeyIssue = useCallback((rawMessage: string | null | undefined) => {
        if (!rawMessage) {
            return false;
        }

        const normalized = rawMessage.toLowerCase();
        const apiKeyIndicators = [
            'invalid api key',
            'incorrect api key',
            'authentication failed',
            'authorization failed',
            'api key is missing',
            'api key provided is incorrect',
            'unauthorized',
            'bearer token is invalid',
            'invalid credentials',
            'invalid token',
            '401',
            'access was denied',
            'forbidden'
        ];

        const hasInvalidKey = !apiKey || apiKeyIndicators.some(indicator => normalized.includes(indicator));

        if (hasInvalidKey) {
            criticalApiErrorRef.current = true;
            stopLoadingImmediately();
            notifyMissingApiKey();
        }

        return hasInvalidKey;
    }, [apiKey, notifyMissingApiKey, stopLoadingImmediately]);

    // Track which card IDs have been explicitly saved by the user
    const [explicitlySavedIds, setExplicitlySavedIds] = useState<string[]>([]);

    // Helper function to check if a specific card is saved
    const isCardExplicitlySaved = useCallback((cardId: string | null) => {
        if (!cardId) return false;
        return explicitlySavedIds.includes(cardId);
    }, [explicitlySavedIds]);

    // Derive isSaved from multiple checks and explicit user actions
    const isSaved = useMemo(() => {
        debugLog('Calculating isSaved:', {
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

    const draftMatchesExplicitlySavedCard = useMemo(() => {
        if (!lastDraftCard || isEdited) {
            return false;
        }

        const savedFlagFromStorage = typeof window !== 'undefined'
            ? localStorage.getItem('explicitly_saved') === 'true'
            : false;

        if (!explicitlySaved && !savedFlagFromStorage) {
            return false;
        }

        const savedId = currentCardId || (typeof window !== 'undefined' ? localStorage.getItem('current_card_id') : null);
        if (!savedId) {
            return false;
        }

        return lastDraftCard.id === savedId;
    }, [lastDraftCard, explicitlySaved, currentCardId, isEdited]);

    useEffect(() => {
        if (!lastDraftCard) {
            return;
        }

        const savedFlagFromStorage = typeof window !== 'undefined'
            ? localStorage.getItem('explicitly_saved') === 'true'
            : false;

        const savedIdFromStorage = typeof window !== 'undefined'
            ? localStorage.getItem('current_card_id')
            : null;

        const effectiveSavedId = currentCardId || savedIdFromStorage;
        const matchesSavedCard = effectiveSavedId ? lastDraftCard.id === effectiveSavedId : false;

        if (!isEdited && (isSaved || explicitlySaved || (savedFlagFromStorage && matchesSavedCard))) {
            dispatch(setLastDraftCard(null));
        }
    }, [lastDraftCard, isSaved, explicitlySaved, isEdited, currentCardId, dispatch]);

    const latestDraftSnapshot = useMemo<DraftSnapshot | null>(() => {
        if (!showResult) {
            return null;
        }

        const trimmedOriginal = (originalSelectedText || '').trim();
        const baseFrontCandidate = (trimmedOriginal || front || '').trim();
        const baseTextCandidate = (trimmedOriginal || text || front || '').trim();
        const hasMeaningfulContent = Boolean(
            baseTextCandidate ||
            (translation && translation.trim()) ||
            (back && back.trim()) ||
            examples.length > 0 ||
            image ||
            imageUrl ||
            (linguisticInfo && linguisticInfo.trim()) ||
            (transcription && transcription.trim())
        );

        if (!hasMeaningfulContent) {
            return null;
        }

        const savedFlagFromStorage = typeof window !== 'undefined'
            ? localStorage.getItem('explicitly_saved') === 'true'
            : false;

        if ((isSaved || savedFlagFromStorage || explicitlySaved) && !isEdited) {
            return null;
        }

        const cardText = baseTextCandidate || text || front || '';
        const draftFront = baseFrontCandidate || front || cardText;
        const draftTranslation = translation || (mode === Modes.GeneralTopic ? (back || '') : translation);

        return {
            id: currentCardId ?? undefined,
            mode,
            text: cardText,
            translation: draftTranslation && draftTranslation.length > 0 ? draftTranslation : null,
            examples: examples.length ? examples : [],
            image: image || null,
            imageUrl: imageUrl || null,
            createdAt: lastDraftCard?.createdAt,
            exportStatus: 'not_exported',
            front: draftFront,
            back: back ?? null,
            linguisticInfo: linguisticInfo || '',
            transcription: transcription || ''
        };
    }, [
        showResult,
        originalSelectedText,
        text,
        front,
        translation,
        back,
        examples,
        image,
        imageUrl,
        linguisticInfo,
        transcription,
        currentCardId,
        mode,
        lastDraftCard,
        isSaved,
        isEdited,
        explicitlySaved
    ]);

    useEffect(() => {
        if (!latestDraftSnapshot) {
            return;
        }

        let candidateId = latestDraftSnapshot.id ?? draftIdRef.current ?? lastDraftCard?.id ?? null;
        if (!candidateId) {
            candidateId = `draft-${Date.now()}`;
        }

        draftIdRef.current = candidateId;

        const draft: StoredCard = {
            ...latestDraftSnapshot,
            id: candidateId,
            createdAt: ensureDraftDate(latestDraftSnapshot.createdAt ?? lastDraftCard?.createdAt),
        } as StoredCard;

        const normalizedDraft = normalizeDraftCard(draft);
        const draftContentHash = getDraftContentHash(normalizedDraft);
        const hasContentChanges = draftContentHash !== lastDraftContentHashRef.current;
        const nextCreatedAt = hasContentChanges
            ? new Date()
            : ensureDraftDate(lastDraftCard?.createdAt);

        const normalizedDraftWithTimestamp: StoredCard = {
            ...normalizedDraft,
            createdAt: nextCreatedAt
        };

        const serializedCandidate = serializeDraftForCompare(normalizedDraftWithTimestamp);

        if (serializedCandidate !== lastDraftSerializedRef.current) {
            lastDraftSerializedRef.current = serializedCandidate;
            lastDraftContentHashRef.current = draftContentHash;
            dispatch(setLastDraftCard(normalizedDraftWithTimestamp));
        }
    }, [latestDraftSnapshot, dispatch, lastDraftCard]);

    // Add more detailed logging to debug the issue
    debugLog('Card state details:', {
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

    // Timer effect for CreateCard
    useEffect(() => {
        debugLog('🔄 Loading state changed:', {
            loadingGetResult,
            isProcessingCustomInstruction,
            loadingNewImage,
            loadingNewExamples
        });

        if (loadingGetResult) {
            debugLog('⏱️ Starting timer for card creation');
            setElapsedTime(0);
            timerRef.current = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                debugLog('⏱️ Stopping timer for card creation');
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [loadingGetResult, isProcessingCustomInstruction, loadingNewImage, loadingNewExamples]);

    // Format elapsed time
    const formatElapsedTime = (seconds: number): string => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

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
            debugLog('Found existing card with matching text:', exactMatch?.text || textToCheck, 'ID:', exactMatch.id);
            debugLog('Setting currentCardId but NOT setting explicitlySaved');

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
        tabAware.setText(newText);

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
        tabAware.setTranslation(newTranslation);
        if (isSaved) {
            setIsEdited(true);
        }
    };

    const handleBackUpdate = (newBack: string | null) => {
        tabAware.setBack(newBack ?? null);
        if (isSaved) {
            setIsEdited(true);
        }
    };

    // Handler for examples update
    const handleExamplesUpdate = (newExamples: Array<[string, string | null]>) => {
        tabAware.setExamples(newExamples);
        if (isSaved) {
            setIsEdited(true);
        }
    };

    const handleNewImage = async () => {
        setLoadingNewImage(true);
        try {
            // Check if there's an ongoing generation that might be cancelled
            if (abortControllerRef.current?.signal.aborted) {
                debugLog('New image generation cancelled');
                return;
            }
            
            const descriptionImage = await aiService.getDescriptionImage(apiKey, text, imageInstructions, abortControllerRef.current?.signal);

            // Use different image generation based on provider
            if (modelProvider === ModelProvider.OpenAI) {
                // Use existing OpenAI implementation
                const { imageUrl, imageBase64 } = await getImage(openAiKey, descriptionImage, imageInstructions);

                if (imageUrl) {
                    tabAware.setImageUrl(imageUrl);
                }
                if (imageBase64) {
                    tabAware.setImage(imageBase64);
                }
            } else {
                // Other models - show error that image generation isn't supported
                showError("Image generation is not supported with the selected provider.");
            }
        } catch (error) {
            // Check if this is a quota error and show appropriate message
            if (error instanceof Error && isQuotaError(error)) {
                console.error('Quota error detected in image generation:', error.message);
                showError(error.message);
                handlePotentialApiKeyIssue(error.message);
                return;
            }
            
            console.error('Error generating image:', error);
            const imageErrorMessage = error instanceof Error ? error.message : "Failed to generate image";
            showError(imageErrorMessage);
            handlePotentialApiKeyIssue(imageErrorMessage);
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
            // Check if there's an ongoing generation that might be cancelled
            if (abortControllerRef.current?.signal.aborted) {
                debugLog('New examples generation cancelled');
                return;
            }
            
            // Определяем исходный язык
            const textLanguage = isAutoDetectLanguage ? detectedLanguage : sourceLanguage;

            const newExamplesResult = await createExamples(
                aiService,
                apiKey,
                text,
                translateToLanguage,
                true,
                aiInstructions,
                textLanguage || undefined, // Передаем исходный язык
                abortControllerRef.current?.signal
            );

            if (newExamplesResult && newExamplesResult.length > 0) {
                // Преобразуем в старый формат для совместимости с существующим кодом
                const formattedExamples = newExamplesResult.map(example =>
                    [example.original, example.translated] as [string, string | null]
                );
                tabAware.setExamples(formattedExamples);
            }
        } catch (error) {
            // Check if this is a quota error and show appropriate message
            if (error instanceof Error && isQuotaError(error)) {
                console.error('Quota error detected in examples generation:', error.message);
                showError(error.message);
                handlePotentialApiKeyIssue(error.message);
                return;
            }
            
            console.error('Error getting examples:', error);
            const examplesErrorMessage = error instanceof Error ? error.message : "Failed to generate examples";
            showError(examplesErrorMessage);
            handlePotentialApiKeyIssue(examplesErrorMessage);
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
                const { imageUrl, imageBase64 } = await getImage(openAiKey, descriptionImage, customInstruction);

                if (imageUrl) {
                    tabAware.setImageUrl(imageUrl);
                }
                if (imageBase64) {
                    tabAware.setImage(imageBase64);
                }
            } else if (customInstruction.toLowerCase().includes('example') ||
                customInstruction.toLowerCase().includes('sentence') ||
                customInstruction.toLowerCase().includes('пример') ||
                customInstruction.toLowerCase().includes('предложение')) {

                // Generate new examples based on instructions
                debugLog('📚 Starting examples generation...');
                const newExamples = await aiService.getExamples(apiKey, text, translateToLanguage, true, customInstruction);
                debugLog('📚 Examples generation completed');
                tabAware.setExamples(newExamples);
            } else if (customInstruction.toLowerCase().includes('translat') ||
                customInstruction.toLowerCase().includes('перевод')) {

                // Update translation based on instructions
                const translatedText = await aiService.translateText(apiKey, text, translateToLanguage, customInstruction);
                if (translatedText) {
                    tabAware.setTranslation(translatedText);
                }
            } else {
                // Apply all updates with custom instructions
                // Always use custom instructions for both translation and examples
                // This should ensure instructions are always applied
                const translatedText = await aiService.translateText(apiKey, text, translateToLanguage, customInstruction);
                debugLog('📚 Starting examples generation (combined)...');
                const newExamples = await aiService.getExamples(apiKey, text, translateToLanguage, true, customInstruction);
                debugLog('📚 Examples generation completed (combined)');

                if (shouldGenerateImage) {
                    const descriptionImage = await aiService.getDescriptionImage(apiKey, text, customInstruction);
                    const imageUrl = await aiService.getImageUrl?.(apiKey, descriptionImage);

                    if (imageUrl) {
                        tabAware.setImageUrl(imageUrl);
                    }
                }

                if (translatedText) {
                    tabAware.setTranslation(translatedText);
                }
                tabAware.setExamples(newExamples);
            }

            // Clear the instruction after applying
            setCustomInstruction('');

            // No notification, the loader UI is enough feedback
        } catch (error) {
            // Check if this is a quota error and show appropriate message
            if (error instanceof Error && isQuotaError(error)) {
                console.error('Quota error detected in custom instructions:', error.message);
                showError(error.message);
                handlePotentialApiKeyIssue(error.message);
                return;
            }
            
            console.error('Error applying custom instructions:', error);
            const customInstructionError = error instanceof Error ? error.message : "Failed to apply custom instructions";
            showError(customInstructionError);
            handlePotentialApiKeyIssue(customInstructionError);
        } finally {
            debugLog('📝 Custom instruction processing completed');
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
        debugLog('*** HANDLE SAVE ALL CARDS: Starting ***');
        debugLog('Current Redux state at save all cards time:', {
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

            // Создаем обновленную копию массива карточек с актуальными данными текущей карточки
            const cardsToSave = [...createdCards];
            if (cardsToSave[currentCardIndex]) {
                // Обновляем текущую карточку актуальными данными из Redux
                cardsToSave[currentCardIndex] = {
                    ...cardsToSave[currentCardIndex],
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
            }

            let successCount = 0;
            let errorCount = 0;
            let savedCards = 0;
            let updatedCards = 0;

            // Keep track of saved card IDs to update our explicit save tracking
            const newExplicitlySavedIds: string[] = [...explicitlySavedIds];

            debugLog('Starting to save cards. Total cards:', cardsToSave.length, 'Already saved:', explicitlySavedIds.length);
            debugLog('Cards to save:', cardsToSave.map(c => ({ id: c.id, text: c.text?.substring(0, 30) })));

            // Save each card in the cardsToSave array
            for (let i = 0; i < cardsToSave.length; i++) {
                const card = cardsToSave[i];

                // Skip cards that are already in our explicitly saved list to avoid double saving
                if (explicitlySavedIds.includes(card.id)) {
                    debugLog(`Card #${i} (${card.id}) already explicitly saved, skipping`);
                    successCount++;
                    continue;
                }

                try {
                    debugLog(`Saving card #${i} (${card.id}) from multi-card set`);

                    // Check if this card already exists in storage by ID only
                    const existingCardIndex = storedCards.findIndex(
                        (storedCard) => storedCard.id === card.id
                    );

                    if (existingCardIndex === -1) {
                        // Card is not saved yet
                        dispatch(saveCardToStorage(card));
                        savedCards++;

                        // Add to our explicitly saved IDs list
                        newExplicitlySavedIds.push(card.id);
                        debugLog(`Card #${i} (${card.id}) saved as new`);

                        successCount++;
                    } else {
                        debugLog(`Card #${i} (${card.id}) already in storage, updating`);
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

            debugLog('Save all complete. Saved:', savedCards, 'Updated:', updatedCards, 'Errors:', errorCount);

            // Update our tracking of explicitly saved cards
            setExplicitlySavedIds(newExplicitlySavedIds);

            // Обновляем состояние карточек с сохраненными данными
            setCreatedCards(cardsToSave);

            // Ensure the current card is marked as explicitly saved
            setExplicitlySaved(true);
            localStorage.setItem('explicitly_saved', 'true');

            // Also update the currentCardId to match current card
            const currentCard = cardsToSave[currentCardIndex];
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

                // Удалили навязчивое success уведомление
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
        debugLog('*** HANDLE ACCEPT: Starting to save card ***');
        debugLog('Current Redux state at save time:', {
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

                debugLog('Saving current card from multi-card set:', currentCard.id);

                const normalizedCurrent = await normalizeImageForStorage(currentCard.image ?? null, currentCard.imageUrl ?? null);
                const cardToPersist = {
                    ...currentCard,
                    image: normalizedCurrent.image,
                    imageUrl: normalizedCurrent.imageUrl
                };

                setCreatedCards(prevCards => {
                    const updatedCards = [...prevCards];
                    updatedCards[currentCardIndex] = cardToPersist;
                    return updatedCards;
                });

                // Check if this card already exists in storage
                const existingCardIndex = storedCards.findIndex(
                    (storedCard) => storedCard.id === cardToPersist.id ||
                        (storedCard.text === cardToPersist.text && storedCard.mode === cardToPersist.mode)
                );

                if (existingCardIndex === -1) {
                    // Card is not saved yet - сохраняем ТОЛЬКО текущую карточку
                    tabAware.saveCardToStorage(cardToPersist);
                    debugLog(`Saved new card: ${cardToPersist.id}`);
                } else {
                    // Update existing card - обновляем ТОЛЬКО текущую карточку
                    tabAware.updateStoredCard(cardToPersist);
                    debugLog(`Updated existing card: ${cardToPersist.id}`);
                }

                // IMPORTANT: Only mark the CURRENT card as explicitly saved
                // This ensures only the current card shows "Saved to Collection"
                setExplicitlySavedIds(prev => {
                    if (prev.includes(cardToPersist.id)) {
                        return prev;
                    }
                    const newIds = [...prev, cardToPersist.id];
                    debugLog('Updated explicitly saved IDs:', newIds);
                    return newIds;
                });

                // Force reload stored cards
                dispatch(loadStoredCards());

                // Set current card's ID for reference
                tabAware.setCurrentCardId(cardToPersist.id);
                localStorage.setItem('current_card_id', cardToPersist.id);

                // Update UI state for the current card only
                setExplicitlySaved(true);
                localStorage.setItem('explicitly_saved', 'true');
                setIsEdited(false);
                // showError('Card saved successfully!', 'success'); // Убрали уведомление

                dispatch(setLastDraftCard(null));

                return; // Exit early for multi-card save
            }

            // Single card saving flow
            const cardId = currentCardId || Date.now().toString();

            // Debug the required fields
            debugLog('Saving card with data:', {
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

                const { image: normalizedImage, imageUrl: normalizedImageUrl } = await normalizeImageForStorage(image, imageUrl);

                if (normalizedImage && normalizedImage !== image) {
                    tabAware.setImage(normalizedImage);
                    tabAware.setImageUrl(null);
                } else if (!normalizedImage && normalizedImageUrl !== imageUrl) {
                    tabAware.setImageUrl(normalizedImageUrl);
                }

                const cardData = {
                    id: cardId,
                    mode,
                    text: cardText,
                    translation,
                    examples,
                    linguisticInfo, // Добавляем лингвистическое описание
                    transcription: transcription || '',
                    // ИСПРАВЛЕНО: Сохраняем изображения с приоритетом на base64
                    image: normalizedImage, // base64 данные (постоянные, приоритет)
                    imageUrl: normalizedImageUrl, // URL как резерв
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const
                };

                debugLog('*** CREATECARD: Preparing to save card to storage ***');
                debugLog('Card data being sent to Redux:', {
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
                    debugLog('Updating existing card by user action:', cardId);
                    tabAware.updateStoredCard(cardData);
                } else {
                    debugLog('Saving new card by user action:', cardId);
                    tabAware.saveCardToStorage(cardData);
                    tabAware.setCurrentCardId(cardId);
                }

                dispatch(setLastDraftCard(null));

            } else if (mode === Modes.GeneralTopic) {
                // Для GeneralTopic будем использовать front вместо back
                if (!front) {
                    console.error('Missing front data for general topic card');
                    showError('Please generate card content before saving.');
                    return;
                }

                // Use text as fallback if originalSelectedText is missing
                const cardText = originalSelectedText || text || '';

                const { image: normalizedImage, imageUrl: normalizedImageUrl } = await normalizeImageForStorage(image, imageUrl);

                if (normalizedImage && normalizedImage !== image) {
                    tabAware.setImage(normalizedImage);
                    tabAware.setImageUrl(null);
                } else if (!normalizedImage && normalizedImageUrl !== imageUrl) {
                    tabAware.setImageUrl(normalizedImageUrl);
                }

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
                    // Сохраняем оба типа изображений для надежности
                    image: normalizedImage,
                    imageUrl: normalizedImageUrl,
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const
                };

                debugLog('Saving general topic card to storage:', cardData);

                // Сохранение происходит только по явному действию пользователя (нажатие кнопки)
                if (currentCardId) {
                    debugLog('Updating existing general topic card by user action:', cardId);
                    tabAware.updateStoredCard(cardData);
                } else {
                    debugLog('Saving new general topic card by user action:', cardId);
                    tabAware.saveCardToStorage(cardData);
                    tabAware.setCurrentCardId(cardId);
                }

                dispatch(setLastDraftCard(null));
            }

            // Important: When the user explicitly saves the card, mark it as explicitly saved
            // and store this state in localStorage
            setExplicitlySaved(true);
            localStorage.setItem('explicitly_saved', 'true');

            // Убрали уведомления при сохранении/обновлении карточек
            // if (isEdited) {
            //     showError('Card updated successfully!', 'success');
            // } else {
            //     showError('Card saved successfully!', 'success');
            // }

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

        debugLog('Creating new card, clearing all state completely');

        // Reset all saved state tracking
        setExplicitlySaved(false);
        setExplicitlySavedIds([]);
        localStorage.removeItem('explicitly_saved');
        localStorage.removeItem('current_card_id');

        // Сбрасываем историю карточек
        setCreatedCards([]);
        setIsMultipleCards(false);
        setCurrentCardIndex(0);

        // Очищаем все поля через tabAware
        tabAware.updateCard({
            text: '',
            translation: '',
            examples: [],
            image: null,
            imageUrl: null,
            front: '',
            back: null,
            linguisticInfo: '',
            transcription: ''
        });
        setOriginalSelectedText('');
    };

    const handleViewSavedCards = useCallback(() => {
        tabAware.setCurrentPage('storedCards');
    }, [tabAware]);

    const handleOpenSettings = useCallback(() => {
        setShowMissingApiKeyNotice(false);
        tabAware.setCurrentPage('settings');
    }, [tabAware]);

    const handleDismissMissingApiKeyNotice = useCallback(() => {
        setShowMissingApiKeyNotice(false);
    }, []);

    const loadLastDraftIntoState = useCallback((card: StoredCard) => {
        const normalized = normalizeDraftCard(card);
        const effectiveTranslation = normalized.mode === Modes.LanguageLearning
            ? (normalized.translation ?? '')
            : ((normalized.back ?? normalized.translation ?? ''));

        tabAware.updateCard({
            text: normalized.text,
            translation: effectiveTranslation,
            examples: normalized.examples ?? [],
            image: normalized.image ?? null,
            imageUrl: normalized.imageUrl ?? null,
            front: normalized.front ?? normalized.text,
            back: normalized.back ?? null,
            linguisticInfo: normalized.linguisticInfo ?? '',
            transcription: normalized.transcription ?? ''
        });

        if (normalized.id) {
            tabAware.setCurrentCardId(normalized.id);
        } else {
            tabAware.setCurrentCardId(null);
        }

        setOriginalSelectedText(normalized.mode === Modes.LanguageLearning ? normalized.text : '');
        tabAware.setIsGeneratingCard(false);
        setShowResult(true);
        setIsEdited(false);
        setIsNewSubmission(false);
        setExplicitlySaved(false);
        setExplicitlySavedIds([]);
        setIsMultipleCards(false);
        setCreatedCards([]);
        setCurrentCardIndex(0);
    }, [tabAware]);

    const handleOpenLatestCard = () => {
        if (!latestCardPreview) {
            return;
        }

        const hasTranslation = Boolean((latestCardPreview.translation ?? '').trim());
        const hasExamples = Array.isArray(latestCardPreview.examples) && latestCardPreview.examples.length > 0;
        if (!hasTranslation || !hasExamples) {
            return;
        }

        loadLastDraftIntoState(latestCardPreview.raw);
        setShowModal(true);
    };

    // Используем useCallback для стабильной ссылки на функцию обработки выделения
    const handleTextSelection = useCallback((selectedText: string) => {
        debugLog('Text selection handled for tab-specific state:', selectedText);
        
        // Принудительно закрываем модальное окно перед анализом нового текста
        setShowTextOptionsModal(false);
        
        // Сначала очищаем предыдущие выбранные опции и список опций
        setSelectedOptionsMap({});
        setSelectedTextOptions([]);
        
        // Устанавливаем выделенный текст через tabAware (tab-specific)
        tabAware.setText(selectedText);
        
        // Логируем для отладки
        debugLog('Text set via tabAware.setText:', selectedText);
    }, [tabAware]);

    useEffect(() => {
        const handleMouseUp = (event: MouseEvent) => {
            // Проверяем, что событие произошло не внутри sidebar расширения
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.contains(event.target as Node)) {
                // Если клик был внутри sidebar, не обрабатываем выделение текста
                return;
            }

            // Дополнительная проверка для Shadow DOM
            if (event.target && event.composedPath) {
                const path = event.composedPath();
                for (const element of path) {
                    if (element instanceof Element && element.id === 'sidebar') {
                        return;
                    }
                    // Также проверяем, не находится ли элемент внутри Shadow Root расширения
                    if (element instanceof ShadowRoot && element.host && element.host.id === 'sidebar') {
                        return;
                    }
                }
            }

            const selectedText = window.getSelection()?.toString().trim();
            if (selectedText && selectedText.length > 0) {
                handleTextSelection(selectedText);
            }
        };

        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleTextSelection]);

    useEffect(() => {
        // Always enforce Language Learning mode and update persisted selection
        localStorage.setItem('selected_mode', Modes.LanguageLearning);
        dispatch(setMode(Modes.LanguageLearning));

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
            debugLog('Running saved cards check on mount');

            // First, ensure stored cards are loaded from localStorage
            dispatch(loadStoredCards());

            // Wait a brief moment to ensure cards are loaded
            setTimeout(() => {
                const savedCards = loadCardsFromStorage();
                debugLog('Loaded cards from storage:', savedCards.length);

                // Get currentCardId from localStorage
                const savedCardId = localStorage.getItem('current_card_id');
                const explicitlySavedFlag = localStorage.getItem('explicitly_saved');

                debugLog('localStorage values on mount:', {
                    savedCardId,
                    explicitlySavedFlag,
                    cardCount: savedCards.length
                });

                if (savedCardId) {
                    debugLog('Found current card ID in localStorage:', savedCardId);
                    // Find the card by ID
                    const savedCard = savedCards.find((card: StoredCard) => card.id === savedCardId);

                    if (savedCard) {
                        debugLog('Restoring card from storage:', savedCard);
                        // If card is found by ID, update the state
                        setIsEdited(false);
                        setIsNewSubmission(false);

                        // Set explicitlySaved based on localStorage flag
                        if (explicitlySavedFlag === 'true') {
                            debugLog('Setting explicitlySaved to TRUE based on localStorage flag');
                            setExplicitlySaved(true);
                        } else {
                            debugLog('Setting explicitlySaved to FALSE based on localStorage flag');
                            setExplicitlySaved(false);
                        }

                        // Restore card data
                        tabAware.setCurrentCardId(savedCardId);
                        tabAware.setText(savedCard.text);
                        if (savedCard.translation) tabAware.setTranslation(savedCard.translation);
                        if (savedCard.examples) tabAware.setExamples(savedCard.examples);
                        if (savedCard.image) tabAware.setImage(savedCard.image);
                        if (savedCard.imageUrl) tabAware.setImageUrl(savedCard.imageUrl);
                        if (savedCard.front) tabAware.setFront(savedCard.front);
                        if (savedCard.back) tabAware.setBack(savedCard.back);
                        if (savedCard.linguisticInfo) tabAware.setLinguisticInfo(savedCard.linguisticInfo);
                        if (savedCard.transcription) tabAware.setTranscription(savedCard.transcription);
                        setOriginalSelectedText(savedCard.text);

                        setShowResult(true);
                    } else {
                        debugLog('Card ID from localStorage not found in storage, resetting');
                        // If card with this ID no longer exists, clear the ID
                        localStorage.removeItem('current_card_id');
                        localStorage.removeItem('explicitly_saved');
                        tabAware.setCurrentCardId(null);
                        setIsNewSubmission(true);
                        setExplicitlySaved(false);
                    }
                } else {
                    debugLog('No current card ID in localStorage');
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
            debugLog('New card being created, skipping automatic saved detection');
            return;
        }

        // If we're actively typing in a new card (not yet saved), make sure it's not marked as saved
        if (!currentCardId) {
            debugLog('Actively typing new card text - ensuring not marked as saved');
            setExplicitlySaved(false);
            localStorage.removeItem('explicitly_saved');
        }

        // Check if the card already exists in storage
        checkExistingCard(text);

    }, [text, currentCardId, isNewSubmission, showResult, checkExistingCard]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!text.trim()) return;

        let detectedLanguageForSubmit = detectedLanguage;

        if (isAutoDetectLanguage) {
            try {
                const detectionResult = await detectLanguage(text);
                if (detectionResult) {
                    detectedLanguageForSubmit = detectionResult;
                }
            } catch (languageError) {
                console.error('Language detection failed before submission:', languageError);
            }
        }

        if (!apiKey) {
            notifyMissingApiKey();
            return;
        }

        criticalApiErrorRef.current = false;

        // Create new AbortController for this generation
        abortControllerRef.current = new AbortController();
        const abortSignal = abortControllerRef.current.signal;

        // Set card generation state to true to disable navigation buttons
        tabAware.setIsGeneratingCard(true);

        // IMPORTANT: Explicitly clear saved state when creating a new card
        setExplicitlySaved(false);
        localStorage.removeItem('explicitly_saved');

        // Сбрасываем предыдущие сохраненные карточки
        setCreatedCards([]);
        setIsMultipleCards(false);

        // Очищаем флаг текущей карточки
        tabAware.setCurrentCardId(null);

        // FIXED: Clear image data if image generation is disabled or if this is a new text
        // This prevents images from previous cards appearing on new cards
        if (!shouldGenerateImage) {
            debugLog('Image generation is disabled, clearing existing images');
            tabAware.setImage(null);
            tabAware.setImageUrl(null);
        } else if (originalSelectedText !== text) {
            // If the text has changed significantly from the original, clear old images
            debugLog('Text has changed, clearing existing images for new generation');
            tabAware.setImage(null);
            tabAware.setImageUrl(null);
        }

        // Only clear linguistic info and transcription as they are text-specific
        tabAware.setLinguisticInfo("");
        tabAware.setTranscription('');

        setForceHideLoader(false);
        setLoadingGetResult(true);
        setCurrentLoadingMessage(null);

        // Reset global API tracker and set progress callback
        const globalTracker = getGlobalApiTracker();
        globalTracker.reset();

        setGlobalProgressCallback((update) => {
            if (criticalApiErrorRef.current) {
                return;
            }
            debugLog(`🔄 Progress update: ${update.completed}/${update.total} - ${update.message.title}`);
            setCurrentLoadingMessage(update.message);
            setCurrentProgress({ completed: update.completed, total: update.total });

            // REMOVED: Auto-hide logic moved to finally block to prevent conflicts
            // The loading will be hidden in the finally block of the main function
        });

        setOriginalSelectedText(text);

        // Clear any previous errors
        showError(null);

        try {
            // Debug logging
            debugLog("=== DEBUG INFO ===");
            debugLog("Model Provider:", modelProvider);
            debugLog("API Key available:", Boolean(apiKey));
            debugLog("Model Name (if Groq):", modelProvider === ModelProvider.Groq ? groqModelName : 'N/A');
            debugLog("AI Service:", Object.keys(aiService));
            debugLog("Source Language:", isAutoDetectLanguage ? detectedLanguageForSubmit : sourceLanguage);

            // Определяем язык исходного текста для API запросов
            const sourceLanguageForSubmit = isAutoDetectLanguage 
                ? detectedLanguageForSubmit
                : sourceLanguage;

            // Check mode before creating components
            if (mode !== Modes.LanguageLearning) {
                // For General mode, use FAST AI agent workflow for complete cards
                debugLog('🚀 General mode - using fast AI agent workflow for complete cards...');
                
                try {
                    // Extract page context for multimedia
                    let pageContext: PageContentContext | undefined;
                    try {
                        const { PageContentExtractor } = await import('../services/pageContentExtractor');
                        pageContext = PageContentExtractor.extractPageContent(text);
                        debugLog(`📋 General mode: Extracted page context with ${pageContext?.pageImages?.length || 0} images`);
                    } catch (extractError) {
                        console.warn('Failed to extract page content for General mode:', extractError);
                        pageContext = undefined;
                    }

                    // Create AI Agent Service instance
                    const aiAgentService = createAIAgentService(aiService, apiKey);
                    
                    // Use fast AI agent workflow for complete cards
                    const createdCards = await aiAgentService.createCardsFromTextFast(text, pageContext, abortSignal);
                    
                    if (createdCards && createdCards.length > 0) {
                        const firstCard = createdCards[0];
                        // Set the first created card data
                        if (firstCard.front) {
                            tabAware.setFront(firstCard.front);
                        }
                        if (firstCard.back) {
                            tabAware.setBack(firstCard.back);
                        }
                        if (firstCard.image) {
                            tabAware.setImage(firstCard.image);
                        }
                        if (firstCard.imageUrl) {
                            tabAware.setImageUrl(firstCard.imageUrl);
                        }
                        
                        debugLog(`✅ General mode: Created ${createdCards.length} cards with fast workflow`);
                    }
                } catch (error) {
                    console.error('❌ Error in General mode fast workflow:', error);
                    // Fallback to simple mode if fast workflow fails
                    debugLog('🔄 Falling back to simple flashcard creation...');
                    const { createFlashcard } = await import('../services/aiServiceFactory');
                    const flashcardResult = await createFlashcard(aiService, apiKey, text, abortSignal);
                    
                    if (flashcardResult && flashcardResult.front) {
                        tabAware.setFront(flashcardResult.front);
                    }
                }
                
                // For General mode, we're done - return early
                setShowResult(true);
                return;
            }
            
            // НОВЫЙ ПАРАЛЛЕЛЬНЫЙ РЕЖИМ - получаем все компоненты карточки одновременно (только для Language Learning)
            debugLog('🚀 Using parallel card creation for Language Learning mode...');
            
            const { createCardComponentsParallel } = await import('../services/aiServiceFactory');
            
            const startTime = Date.now();
            const result = await createCardComponentsParallel(
                aiService,
                apiKey,
                text,
                translateToLanguage,
                aiInstructions,
                sourceLanguageForSubmit || undefined,
                shouldGenerateImage,
                abortSignal,
                imageGenerationMode
            );
            
            const duration = Date.now() - startTime;
            debugLog(`⚡ Parallel card creation completed in ${duration}ms`);

            // Check if cancelled after parallel creation
            if (abortSignal.aborted) {
                throw new Error('Generation cancelled by user');
            }

            // Обработка результатов
            let completedOperations = {
                translation: false,
                examples: false,
                flashcard: false,
                image: false,
                linguisticInfo: false
            };
            let translationErrorMessage: string | null = null;
            let hadCriticalApiKeyError = false;

            // Устанавливаем полученные результаты
            if (result.translation?.translated) {
                tabAware.setTranslation(result.translation.translated);
                completedOperations.translation = true;
            }

            if (result.examples && result.examples.length > 0) {
                const formattedExamples = result.examples.map(example =>
                    [example.original, example.translated] as [string, string | null]
                );
                tabAware.setExamples(formattedExamples);
                completedOperations.examples = true;
            }

            if (result.flashcard?.front) {
                tabAware.setFront(result.flashcard.front);
                completedOperations.flashcard = true;
            }

            if (result.linguisticInfo) {
                tabAware.setLinguisticInfo(result.linguisticInfo);
                completedOperations.linguisticInfo = true;
            }

            if (result.imageUrl) {
                tabAware.setImageUrl(result.imageUrl);
                completedOperations.image = true;
            }

            // Обработка ошибок
            if (result.errors.length > 0) {
                console.warn('Some components failed:', result.errors);
                
                // Показываем предупреждения для неудачных компонентов
                for (const error of result.errors) {
                    const detailsMessage = error.error || '';
                    const normalizedComponent = `${error.component} generation failed: ${detailsMessage}`;
                    if (error.component === 'translation') {
                        // Перевод критичен - показываем ошибку
                        showError(`Translation failed: ${detailsMessage}`, 'error');
                        if (detailsMessage) {
                            translationErrorMessage = detailsMessage;
                        }
                    } else {
                        // Другие компоненты - показываем предупреждения
                        showError(normalizedComponent, 'warning');
                    }

                    if (detailsMessage) {
                        const detectedApiKeyIssue = handlePotentialApiKeyIssue(detailsMessage);
                        if (detectedApiKeyIssue) {
                            hadCriticalApiKeyError = true;
                        }
                    }
                }
                
                // Если перевод не удался, останавливаем создание карточки
                if (!completedOperations.translation) {
                    const errorMessageForThrow = translationErrorMessage
                        || (hadCriticalApiKeyError
                            ? 'Authentication failed: your API key is missing, invalid, or not working. Please update it in Settings.'
                            : 'Translation failed - cannot create card without translation');
                    throw new Error(errorMessageForThrow);
                }
            }

            // Проверяем есть ли критически важные компоненты
            if (!completedOperations.translation) {
                const fallbackMessage = translationErrorMessage
                    || 'Translation failed - cannot create card without translation';
                throw new Error(fallbackMessage);
            }

            debugLog('Parallel card creation completed with:', completedOperations);

            // Показываем результат только если есть перевод
            setShowResult(true);
            
            // IMPORTANT: Only set explicitly saved to false AFTER successful creation
            setExplicitlySaved(false);
            localStorage.removeItem('explicitly_saved');
            
            debugLog('Setting showResult to true after successful parallel card creation');
            
            // Generate a unique ID for this card
            const cardId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            tabAware.setCurrentCardId(cardId);
            
            debugLog('Created card with ID:', cardId);

            // Show modal if we have at least some data
            if (completedOperations.translation) {
                setShowResult(true);
                setShowModal(true);
                setIsNewSubmission(true);
                
                // Hide loading when content is ready and visible
                setTimeout(() => {
                    debugLog('🎯 Parallel content is ready - hiding loading');
                    setLoadingGetResult(false);
                    setCurrentLoadingMessage(null);
                    setCurrentProgress({ completed: 0, total: 0 });
                }, 500); // Short delay to ensure UI updates
            } else {
                throw new Error("Failed to create card: No data was successfully generated. Please check your API key and try again.");
            }
        } catch (error) {
            // Check if this is a cancellation
            if (abortSignal.aborted) {
                debugLog('Card generation was cancelled by user');
                throw new Error('Operation cancelled by user');
            }
            
            // Check if this is a quota error
            if (error instanceof Error && isQuotaError(error)) {
                console.error('Quota error detected in main catch:', error.message);
                showError(error.message);
                // Hide loading on quota errors
                setLoadingGetResult(false);
                setCurrentLoadingMessage(null);
                setCurrentProgress({ completed: 0, total: 0 });
                // Don't close modal for quota errors - user might want to try again
                return;
            }
            
            console.error('Error processing text:', error);
            const errorMessage = error instanceof Error
                ? `${error.message}`
                : "Failed to create card. Please check your API key and try again.";
            showError(errorMessage);
            const isApiKeyError = handlePotentialApiKeyIssue(errorMessage);

            // Hide loading on errors
            setLoadingGetResult(false);
            setCurrentLoadingMessage(null);
            setCurrentProgress({ completed: 0, total: 0 });
            if (isApiKeyError) {
                tabAware.setIsGeneratingCard(false);
            }
            // Don't close modal on errors - keep it open so user can retry
        } finally {
            // Don't force hide loading in finally block - let it complete naturally
            // Only reset card generation state and clear abort controller

            // Reset card generation state to enable navigation buttons
            tabAware.setIsGeneratingCard(false);

            // Clear abort controller
            abortControllerRef.current = null;
            criticalApiErrorRef.current = false;
        }
    };

    const handleSaveAISettings = () => {
        dispatch(setAIInstructions(localAIInstructions));
        setShowAISettings(false);
        // Удалили навязчивое success уведомление
    };

    const handleSaveImageSettings = () => {
        dispatch(setImageInstructions(localImageInstructions));
        setShowImageSettings(false);
        // Удалили навязчивое success уведомление
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

                {/* Simplified interface - removed test buttons and complex validation options */}
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
        debugLog('Canceling current card, clearing all state');
        
        // Cancel any ongoing AI requests
        if (abortControllerRef.current) {
            debugLog('Aborting ongoing AI requests');
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        
        setShowResult(false);
        setIsEdited(false);
        dispatch(setCurrentCardId(null));
        setIsNewSubmission(true);
        setExplicitlySaved(false); // Reset explicit save
        localStorage.removeItem('explicitly_saved'); // Also remove from localStorage
        localStorage.removeItem('current_card_id'); // Clear current card ID too

        // Reset card generation state to enable navigation buttons
        tabAware.setIsGeneratingCard(false);
        
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

        dispatch(setLastDraftCard(null));
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
        debugLog('Modal close handler. Card saved status:', isSaved, 'isEdited:', isEdited);

        // Если карточки созданы с помощью множественного выделения, просто закрываем модальное окно
        // без дополнительных действий, чтобы предотвратить автоматическое сохранение
        if (isMultipleCards) {
            debugLog('Closing modal for multiple cards without automatic saving');
            setShowModal(false);
            return;
        }

        // If the card is not saved but has content, clear data without asking
        // Только для режима одной карточки и только если есть содержимое
        if (showResult && !isSaved && !isEdited && translation && !isMultipleCards) {
            // Clear ALL data including images when closing without saving
            debugLog('Closing without saving, clearing all card data');
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
        } else if (!isSaved) {
            // If not saved, clear ALL data including images when closing
            debugLog('Card not saved, clearing all data');
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
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(2px)',
                padding: '16px',
                overflowY: 'auto',
                overflowX: 'hidden'
            }} onClick={handleCloseModal}>
                <div style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    maxWidth: '340px',
                    width: '100%',
                    maxHeight: 'calc(100% - 32px)',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    position: 'relative',
                    padding: '16px',
                    boxSizing: 'border-box',
                    margin: 'auto'
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
                        maxWidth: '100%',
                        marginBottom: '12px'
                    }}>
                        <div style={{
                            position: 'relative',
                            width: '100%',
                            maxWidth: '100%',
                        }}>
                            <input
                                type="text"
                                value={customInstruction}
                                onChange={(e) => setCustomInstruction(e.target.value)}
                                onKeyDown={handleCustomInstructionKeyDown}
                                placeholder="Enter custom instructions (e.g., 'more formal examples', 'change image style')"
                                style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    padding: '10px 12px',
                                    paddingRight: '44px',
                                    borderRadius: '8px',
                                    border: '1px solid #E5E7EB',
                                    fontSize: '14px',
                                    color: '#374151',
                                    backgroundColor: isProcessingCustomInstruction ? '#F9FAFB' : '#FFFFFF',
                                    transition: 'all 0.2s ease',
                                    boxShadow: isProcessingCustomInstruction ? 'inset 0 1px 2px rgba(0, 0, 0, 0.05)' : 'none',
                                    boxSizing: 'border-box'
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
                                    <Loader type="spinner" size="small" inline color="#4F46E5" />
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
                                        gap: '6px',
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
                                        gap: '6px',
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
                                    gap: '6px',
                                    marginBottom: '12px',
                                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                                }}
                                disabled={loadingAccept}
                            >
                                {loadingAccept ? (
                                    <Loader type="spinner" size="small" inline color="#ffffff" text="Saving" />
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
                                                    fontSize: '11px',
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
                        createdAt={new Date()}
                        loadingAccept={loadingAccept}
                        loadingGetResult={loadingGetResult}
                        shouldGenerateImage={shouldGenerateImage}
                        isSaved={isSaved}
                        isEdited={isEdited}
                        isGeneratingCard={isGeneratingCard}
                        setTranslation={handleTranslationUpdate}
                        setBack={handleBackUpdate}
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

        // Check mode - for General mode, use simpler card creation
        if (mode !== Modes.LanguageLearning) {
            showError("Multiple card creation is only available in Language Learning mode", "warning");
            return;
        }

        if (!apiKey) {
            notifyMissingApiKey();
            return;
        }

        criticalApiErrorRef.current = false;

        // Create new AbortController for this generation
        abortControllerRef.current = new AbortController();
        const abortSignal = abortControllerRef.current.signal;

        debugLog('*** MULTIPLE CARDS CREATION STARTED ***');
        debugLog('Image generation settings:', {
            imageGenerationMode,
            modelProvider,
            isImageGenerationAvailable: isImageGenerationAvailable(),
            selectedOptionsCount: selectedOptions.length
        });

        setShowTextOptionsModal(false);
        setForceHideLoader(false);
        setLoadingGetResult(true);
        
        // Set card generation state to true to disable navigation buttons
        tabAware.setIsGeneratingCard(true);

        try {
            const newCards: StoredCard[] = [];

            // Создаем карточки для каждого выбранного варианта
            for (const option of selectedOptions) {
                // Check if cancelled before processing each option
                if (abortSignal.aborted) {
                    debugLog('Multiple cards creation cancelled by user');
                    return;
                }

                // Очистим только текстовые данные перед созданием новой карточки
                // НЕ очищаем изображения здесь, так как они должны сохраниться в каждой карточке
                dispatch(setText(''));
                dispatch(setTranslation(''));
                dispatch(setExamples([]));
                dispatch(setLinguisticInfo('')); // Важно: очищаем лингвистическое описание

                // Установка текста для текущей карточки (после очистки)
                dispatch(setText(option));
                setOriginalSelectedText(option);

                // Сброс статуса явного сохранения для предотвращения ложного отображения "Saved to Collection"
                setExplicitlySaved(false);
                localStorage.removeItem('explicitly_saved');

                try {
                let detectedLanguageForOption = detectedLanguage;

                if (isAutoDetectLanguage) {
                    try {
                        const detectionResult = await detectLanguage(option);
                        if (detectionResult) {
                            detectedLanguageForOption = detectionResult;
                        }
                    } catch (languageError) {
                        console.error(`Language detection failed for option "${option}":`, languageError);
                    }
                }

                // 1. Получаем перевод
                const translation = await createTranslation(
                    aiService,
                    apiKey,
                        option,
                        translateToLanguage,
                        aiInstructions,
                        undefined, // Передаем undefined как шестой параметр
                        abortSignal
                    );

                    // Check if cancelled after translation
                    if (abortSignal.aborted) {
                        debugLog('Multiple cards creation cancelled by user after translation');
                        return;
                    }

                    if (translation.translated) {
                        dispatch(setTranslation(translation.translated));
                    }


                    // 2. Получаем примеры
                    const sourceLanguageForExamples = isAutoDetectLanguage ? detectedLanguageForOption : sourceLanguage;
                    const examplesResult = await createExamples(
                        aiService,
                        apiKey,
                        option,
                        translateToLanguage,
                        true,
                        aiInstructions,
                        sourceLanguageForExamples || undefined, // Передаем исходный язык
                        abortSignal
                    );

                    // Check if cancelled after examples
                    if (abortSignal.aborted) {
                        debugLog('Multiple cards creation cancelled by user after examples');
                        return;
                    }

                    if (examplesResult && examplesResult.length > 0) {
                        const formattedExamples = examplesResult.map(example =>
                            [example.original, example.translated] as [string, string | null]
                        );
                        dispatch(setExamples(formattedExamples));
                    }

                    // 3. Создаем переднюю часть карточки
                    const flashcard = await createFlashcard(aiService, apiKey, option, abortSignal);
                    
                    // Check if cancelled after flashcard
                    if (abortSignal.aborted) {
                        debugLog('Multiple cards creation cancelled by user after flashcard');
                        return;
                    }
                    
                    if (flashcard.front) {
                        dispatch(setFront(flashcard.front));
                    }

                    // 3.5 Создаем лингвистическое описание конкретно для этого слова/фразы с итеративной валидацией
                    const sourceLanguageForLinguistic = isAutoDetectLanguage ? detectedLanguageForOption : sourceLanguage;
                    let generatedLinguisticInfo = "";
                    
                    // Проверяем настройку множественной валидации
                    if (sourceLanguageForLinguistic) {
                        let result;
                        
                        debugLog(`Using optimized linguistic info creation for "${option}" (max 2 requests)`);
                        result = await createOptimizedLinguisticInfo(
                            aiService,
                            apiKey,
                            option, // Используем текущую опцию, а не глобальный текст
                            sourceLanguageForLinguistic,
                            translateToLanguage
                        );

                        if (result.linguisticInfo) {
                            generatedLinguisticInfo = result.linguisticInfo;
                            dispatch(setLinguisticInfo(result.linguisticInfo));

                            if (result.wasValidated) {
                                debugLog(`Linguistic info for "${option}" created and validated`);
                            } else {
                                console.warn(`Linguistic info for "${option}" created but not fully validated`);
                            }
                        } else {
                            console.warn(`Failed to generate linguistic info for "${option}"`);
                        }
                    }

                    // 3.7 Создание транскрипции для этой опции
                    let generatedTranscription = "";
                    try {
                        const sourceLanguageForTranscription = isAutoDetectLanguage ? detectedLanguageForOption : sourceLanguage;

                        if (sourceLanguageForTranscription) {
                            debugLog(`Creating transcription for "${option}" using source language: ${sourceLanguageForTranscription}, user language: ${translateToLanguage}`);

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
                                    debugLog(`Transcription created successfully for "${option}"`);
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

                    // Используем ту же логику, что и для одиночных карточек
                    if (imageGenerationMode !== 'off' && isImageGenerationAvailable()) {
                        try {
                            let shouldGenerate = imageGenerationMode === 'always';
                            let analysisReason = '';

                            // For smart mode, check if image would be helpful
                            if (imageGenerationMode === 'smart') {
                                const analysis = await shouldGenerateImageForText(option);
                                shouldGenerate = analysis.shouldGenerate;
                                analysisReason = analysis.reason;
                                
                                debugLog(`Smart image analysis for "${option}": ${shouldGenerate ? 'YES' : 'NO'} - ${analysisReason}`);
                            }

                            if (shouldGenerate) {
                                debugLog(`Generating image for "${option}"`);
                                const descriptionImage = await aiService.getDescriptionImage(apiKey, option, imageInstructions);
                                const { imageUrl, imageBase64 } = await getImage(openAiKey, descriptionImage, imageInstructions);

                                if (imageUrl) {
                                    currentImageUrl = imageUrl;
                                    debugLog(`Image URL generated for "${option}": ${imageUrl.substring(0, 50)}...`);
                                }
                                if (imageBase64) {
                                    currentImage = imageBase64;
                                    debugLog(`Image base64 generated for "${option}": ${imageBase64.substring(0, 50)}...`);
                                }
                            } else if (imageGenerationMode === 'smart') {
                                debugLog(`No image needed for "${option}": ${analysisReason}`);
                            }
                        } catch (imageError) {
                            console.error(`Image generation failed for "${option}":`, imageError);
                            // Image errors are not critical - continue with the card creation
                        }
                        
                        // НЕ обновляем глобальное Redux состояние для изображений внутри цикла
                        // Это позволяет каждой карточке сохранить свои изображения
                        // dispatch(setImageUrl(imageUrl)); - УДАЛЕНО
                        // dispatch(setImage(imageBase64)); - УДАЛЕНО
                    }

                    // 5. Сохраняем карточку
                    const cardId = `general_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${newCards.length}`;

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
                        // ИСПРАВЛЕНО: Сохраняем изображения с приоритетом на base64  
                        image: currentImage, // base64 данные (постоянные, приоритет)
                        imageUrl: currentImageUrl, // URL как резерв
                        createdAt: new Date(),
                        exportStatus: 'not_exported' as const
                    };

                    const normalizedCard = await normalizeImageForStorage(cardData.image ?? null, cardData.imageUrl ?? null);
                    const finalizedCard: StoredCard = {
                        ...cardData,
                        image: normalizedCard.image,
                        imageUrl: normalizedCard.imageUrl
                    };

                    // НЕ сохраняем карточку в хранилище здесь, а только добавляем в список для отображения
                    // dispatch(saveCardToStorage(cardData)); - УДАЛЕНО, чтобы предотвратить автоматическое сохранение
                    debugLog(`Created card ${finalizedCard.id} but NOT saving to storage yet. Image info:`, {
                        hasImage: !!finalizedCard.image,
                        hasImageUrl: !!finalizedCard.imageUrl,
                        imageLength: finalizedCard.image?.length,
                        imageUrlLength: finalizedCard.imageUrl?.length
                    });
                    newCards.push(finalizedCard);

                } catch (error) {
                    // Check if this is a quota error and stop immediately
                    if (error instanceof Error && isQuotaError(error)) {
                        console.error('Quota error detected, stopping multiple cards creation:', error.message);
                        showError(error.message);
                        throw error; // Throw to reach finally block
                }
                
                console.error(`Error creating card for "${option}":`, error);
                const singleCardErrorMessage = error instanceof Error ? error.message : 'Unknown error';
                showError(`Failed to create card for "${option.substring(0, 20)}...": ${singleCardErrorMessage}`, "error");
                handlePotentialApiKeyIssue(singleCardErrorMessage);
            }
        }

        if (newCards.length > 0) {
                setCreatedCards(newCards);
                setCurrentCardIndex(0);
                setIsMultipleCards(newCards.length > 1);

                // Устанавливаем текущую карточку в состояние Redux для отображения
                const currentCard = newCards[0];
                if (currentCard) {
                    debugLog('Loading first card into Redux state:', {
                        cardId: currentCard.id,
                        hasImage: !!currentCard.image,
                        hasImageUrl: !!currentCard.imageUrl,
                        imageLength: currentCard.image?.length,
                        imageUrlLength: currentCard.imageUrl?.length
                    });

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
                    
                    debugLog('First card loaded into Redux state successfully');
                }

                // Сброс статуса явного сохранения карточек
                setExplicitlySaved(false);
                setExplicitlySavedIds([]);  // Clear explicitly saved IDs
                localStorage.removeItem('explicitly_saved');
                debugLog('Reset saved status for new multiple cards');

                // Важное обновление: очищаем список сохраненных ID перед показом новых карточек
                setExplicitlySavedIds([]);
                localStorage.removeItem('explicitly_saved');
                setExplicitlySaved(false);

                // Показываем результат
                setShowResult(true);
                setShowModal(true);
                // Удалили навязчивое success уведомление

                debugLog('Created new cards, none saved yet. Card IDs:', newCards.map(card => card.id));
            } else {
                const fallbackMessage = "Failed to create cards. Please try again.";
                showError(fallbackMessage, "error");
                handlePotentialApiKeyIssue(fallbackMessage);
            }

        } catch (error) {
            // Check if this is a cancellation
            if (abortSignal.aborted) {
                debugLog('Multiple cards creation was cancelled by user');
                throw new Error('Operation cancelled by user');
            }
            
            // Check if this is a quota error
            if (error instanceof Error && isQuotaError(error)) {
                console.error('Quota error detected in multiple cards creation:', error.message);
                showError(error.message);
                handlePotentialApiKeyIssue(error.message);
                return;
            }
            
            console.error('Error processing selected options:', error);
            const outerErrorMessage = error instanceof Error ? error.message : "Failed to create cards. Please try again.";
            showError(outerErrorMessage);
            const isApiKeyError = handlePotentialApiKeyIssue(outerErrorMessage);
            setLoadingGetResult(false);
            setCurrentLoadingMessage(null);
            setCurrentProgress({ completed: 0, total: 0 });
            tabAware.setIsGeneratingCard(false);
            if (isApiKeyError && abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        } finally {
            debugLog('🎯 Multiple cards creation finally block reached');

            if (criticalApiErrorRef.current) {
                debugLog('🚫 Critical API error detected - skipping delayed loader hide');
                criticalApiErrorRef.current = false;
                setLoadingGetResult(false);
                setCurrentLoadingMessage(null);
                setCurrentProgress({ completed: 0, total: 0 });
                tabAware.setIsGeneratingCard(false);
                setSelectedOptionsMap({});
                abortControllerRef.current = null;
                return;
            }

            // Use the same smart loading management as main function
            setTimeout(() => {
                debugLog('⏳ Checking for pending operations in multiple cards creation...');

                const tracker = getGlobalApiTracker();
                const trackerStats = tracker.getStats();
                const hasPendingRequests = trackerStats.inProgress > 0;

                debugLog('📊 Multiple cards tracker stats:', trackerStats);

                if (!hasPendingRequests) {
                    debugLog('✅ No pending operations in multiple cards - hiding loader');
                    setLoadingGetResult(false);

                    // Reset card generation state to enable navigation buttons
                    tabAware.setIsGeneratingCard(false);

                    // Очищаем карту выбранных опций
                    setSelectedOptionsMap({});
                } else {
                    debugLog('⏸️ Keeping loader visible for multiple cards - operations still running');
                    // Wait a bit longer for multiple cards
                    setTimeout(() => {
                        debugLog('⏳ Final check for multiple cards...');
                        const finalCheckStats = tracker.getStats();
                        if (finalCheckStats.inProgress === 0) {
                            debugLog('✅ Multiple cards operations completed - hiding loader');
                            setLoadingGetResult(false);
                            tabAware.setIsGeneratingCard(false);
                            setSelectedOptionsMap({});
                        }
                    }, 3000);
                }
            }, 1000);

            // Clear abort controller
            abortControllerRef.current = null;
            criticalApiErrorRef.current = false;
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
        debugLog(`Moving from card ${currentCardIndex} to card ${nextIndex}`);

        // Загружаем данные следующей карточки
        const card = createdCards[nextIndex];
        if (card) {
            debugLog(`Loading next card data: ${card.id}, text: ${card.text}, linguistic info: ${card.linguisticInfo ? 'yes' : 'no'}`);
            loadCardData(card);
            // Обновляем индекс карточки после загрузки данных
            setCurrentCardIndex(nextIndex);
        }
    };

    // Функция для сохранения текущего состояния карточки в массиве createdCards
    const saveCurrentCardState = () => {
        if (!createdCards[currentCardIndex]) return;

        // Логируем состояние перед сохранением для отладки
        debugLog('Saving current card state:', {
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

        debugLog('Updated card saved:', updatedCard.id);
    };

    // Функция для загрузки данных карточки в Redux
    const loadCardData = (card: StoredCard) => {
        debugLog('Loading card data for card:', {
            id: card.id,
            text: card.text,
            hasLinguisticInfo: Boolean(card.linguisticInfo),
            hasImage: !!card.image,
            hasImageUrl: !!card.imageUrl,
            imageLength: card.image?.length,
            imageUrlLength: card.imageUrl?.length
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
            debugLog('Setting linguistic info:', card.linguisticInfo.substring(0, 30) + '...');
            dispatch(setLinguisticInfo(card.linguisticInfo));
        } else {
            debugLog('No linguistic info found for this card');
            dispatch(setLinguisticInfo(''));
        }

        // Transcription может быть строкой или undefined
        if (card.transcription) {
            debugLog('Setting transcription:', card.transcription.substring(0, 30) + '...');
            dispatch(setTranscription(card.transcription));
        } else {
            debugLog('No transcription found for this card');
            dispatch(setTranscription(''));
        }
        
        debugLog('Card data loaded successfully, image status:', {
            hasImage: !!card.image,
            hasImageUrl: !!card.imageUrl
        });
    };

    // Функция для перехода к предыдущей карточке
    const prevCard = () => {
        if (createdCards.length <= 1 || currentCardIndex <= 0) return;

        // Сохраняем текущее состояние карточки перед переключением
        saveCurrentCardState();

        const prevIndex = currentCardIndex - 1;
        debugLog(`Moving from card ${currentCardIndex} to card ${prevIndex}`);

        // Загружаем данные предыдущей карточки
        const card = createdCards[prevIndex];
        if (card) {
            debugLog(`Loading previous card data: ${card.id}, text: ${card.text}, linguistic info: ${card.linguisticInfo ? 'yes' : 'no'}`);
            loadCardData(card);
            // Обновляем индекс карточки после загрузки данных
            setCurrentCardIndex(prevIndex);
        }
    };

    // Анализировать текст и предложить варианты создания карточек
    const analyzeSelectedText = async (selectedText: string) => {
        debugLog('=== ANALYZE SELECTED TEXT ===');
        debugLog('Selected text:', selectedText);
        debugLog('Text length:', selectedText.length);
        
        if (!selectedText || selectedText.length < 3) {
            tabAware.setText(selectedText);
            return;
        }

        // Сначала очищаем ранее выбранные опции
        setSelectedOptionsMap({});
        setSelectedTextOptions([]);

        // Count words in the selected text
        const wordCount = selectedText.trim().split(/\s+/).length;
        debugLog('Word count:', wordCount);

        // If text is a short phrase (3 words or less), use it directly without showing modal
        if (wordCount <= 3 && !selectedText.includes('.') && !selectedText.includes('\n')) {
            debugLog('Using short text directly (≤3 words)');
            // Принудительно закрываем модальное окно
            setShowTextOptionsModal(false);
            
            // Clean the text by removing leading dashes/hyphens and whitespace
            const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
            tabAware.setText(cleanedText);
            return;
        }

        debugLog('Proceeding with text analysis...');
        setTextAnalysisLoader(true);

        try {
            // Extract words using simple approach - split by whitespace and punctuation
            // This works for most languages and avoids complex Unicode regex issues
            const rawWords = selectedText
                .split(/[\s\-–—•.,!?;:()\[\]{}""''«»„"\u2014\u2013\u2026]+/)
                .filter(word => word.length > 1)
                .map(word => word.trim())
                .filter(Boolean);
            
            debugLog('Extracted words from text:', rawWords);

            // Universal word filtering without language-specific stop words
            let words = Array.from(new Set(rawWords)); // Remove duplicates
            debugLog('Filtered words (universal):', words);

            // Initialize array of options to present to the user
            let options: string[] = [];
            let phrasesExtracted = false;

            // For short-medium texts (4-10 words), always include individual words and full phrase
            if (wordCount >= 4 && wordCount <= 10) {
                debugLog('Processing short-medium text (4-10 words)');
                
                // Add the full phrase as an option
                const cleanedFullText = selectedText.replace(/^[-–—•\s]+/, '').trim();
                options.push(cleanedFullText);
                debugLog('Added full phrase:', cleanedFullText);

                // Primary approach: Use AI to identify important words if available
                if (apiKey && aiService) {
                    try {
                        debugLog('Using AI to extract key terms...');
                        const aiResponse = await aiService.extractKeyTerms(apiKey, selectedText);
                        if (aiResponse && aiResponse.length > 0) {
                            aiResponse.forEach((term: string) => {
                                const cleanedTerm = term.replace(/^[-–—•\s]+/, '').trim();
                                if (!options.includes(cleanedTerm) && cleanedTerm.length > 1) {
                                    options.push(cleanedTerm);
                                    debugLog('Added AI-extracted term:', cleanedTerm);
                                }
                            });
                            phrasesExtracted = true; // Mark as processed by AI
                        }
                    } catch (e) {
                        debugLog('AI extraction failed, falling back to word-based approach:', e);
                    }
                }

                // Fallback: Add individual words if AI didn't work or no API key
                if (!phrasesExtracted) {
                    debugLog('Adding individual words (fallback):', words);
                    words.forEach(word => {
                        // Use length as universal indicator of importance
                        if (word.length > 2) {  // Universal minimum length
                            const cleanedWord = word.replace(/^[-–—•\s]+/, '').trim();
                            if (!options.includes(cleanedWord)) {
                                options.push(cleanedWord);
                                debugLog('Added individual word:', cleanedWord);
                            }
                        }
                    });
                }

                // Add 2-word combinations for better coverage
                if (wordCount >= 6) {
                    debugLog('Adding 2-word combinations...');
                    const wordsArray = selectedText.split(/\s+/);
                    for (let i = 0; i < wordsArray.length - 1; i++) {
                        if (wordsArray[i].length > 1 && wordsArray[i + 1].length > 1) {
                            let twoWordPhrase = `${wordsArray[i]} ${wordsArray[i + 1]}`.trim();
                            twoWordPhrase = twoWordPhrase.replace(/^[-–—•\s]+/, '').trim();
                            if (twoWordPhrase.length > 3 && !options.includes(twoWordPhrase)) {
                                options.push(twoWordPhrase);
                                debugLog('Added 2-word phrase:', twoWordPhrase);
                            }
                        }
                    }
                }
                
                // Always mark as processed for short-medium texts
                phrasesExtracted = true;
                debugLog('Short-medium processing complete. Options so far:', options);
            }

            // For longer texts (>100 chars), rely primarily on AI extraction
            if (!phrasesExtracted && selectedText.length > 100 && apiKey) {
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
                debugLog('Processing medium-length text:', selectedText.length, 'chars, words:', wordCount);
                
                // For texts with 4-15 words, also add individual words even in this section
                if (wordCount >= 4 && wordCount <= 15) {
                    // Add individual meaningful words
                    words.forEach(word => {
                        if (word.length > 2) {  // Reduced from 3 to 2 to match filtering criteria
                            const cleanedWord = word.replace(/^[-–—•\s]+/, '').trim();
                            if (!options.includes(cleanedWord)) {
                                options.push(cleanedWord);
                                debugLog('Added individual word:', cleanedWord);
                            }
                        }
                    });
                }
                
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
                        if (!options.includes(cleanedPhrase)) {
                            options.push(cleanedPhrase);
                            debugLog('Added medium phrase:', cleanedPhrase);
                        }
                    }
                });
                
                // Set flag to indicate we processed this text
                phrasesExtracted = true;
            }

            // Add individual important words if we don't have many options yet
            if (options.length < 5 || (wordCount >= 4 && wordCount <= 15 && !phrasesExtracted)) {
                debugLog('Adding individual words, current options count:', options.length, 'wordCount:', wordCount, 'phrasesExtracted:', phrasesExtracted);
                
                // Find potentially important words (longer words are often more significant)
                const importantWords = words
                    .filter(word => word.length > 2)  // Lowered from 5 to 3 to include more words
                    .slice(0, 7);  // Increased limit to 7 important words

                debugLog('Important words found:', importantWords);

                importantWords.forEach(word => {
                    // Clean the word by removing leading dashes/hyphens
                    const cleanedWord = word.replace(/^[-–—•\s]+/, '').trim();
                    if (!options.includes(cleanedWord)) {
                        options.push(cleanedWord);
                        debugLog('Added important word:', cleanedWord);
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
                        tabAware.setText(cleanedSentence + '.');
                    } else {
                        const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
                        tabAware.setText(cleanedText.substring(0, 100).trim() + '...');
                    }
                } else {
                    const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
                    tabAware.setText(cleanedText);
                }
            }
        } catch (e) {
            console.error("Error analyzing text", e);
            // In case of error, use the original selected text but clean it
            const cleanedText = selectedText.replace(/^[-–—•\s]+/, '').trim();
            tabAware.setText(cleanedText);
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
                                <Loader type="spinner" size="large" color="#3B82F6" text="Analyzing selected text..." />
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
                            (translations)
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

    // Офлайн определение языка по паттернам
    const detectLanguageOffline = useCallback((text: string): string | null => {
        const cleanText = text.trim().toLowerCase();
        
        // Русский: кириллица
        if (/[а-яё]/i.test(cleanText)) return 'ru';
        
        // Английский: только латиница + английские слова
        if (/^[a-z\s\.,!?\-'"]+$/i.test(cleanText)) {
            const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'with', 'on', 'at', 'by', 'from', 'this', 'that', 'it', 'he', 'she', 'they', 'we', 'you', 'was', 'were', 'are', 'have', 'has', 'had', 'can', 'will', 'would', 'could', 'should'];
            const words = cleanText.split(/\s+/);
            const englishMatches = words.filter(word => englishWords.includes(word.replace(/[^\w]/g, ''))).length;
            if (englishMatches > 0 || words.length === 1) return 'en';
        }
        
        // Испанский: латиница + специфичные символы
        if (/[ñáéíóúü]/i.test(cleanText)) return 'es';
        
        // Французский: латиница + французские диакритики
        if (/[àâäéèêëïîôöùûüÿç]/i.test(cleanText)) return 'fr';
        
        // Немецкий: латиница + немецкие символы
        if (/[äöüß]/i.test(cleanText)) return 'de';
        
        // Итальянский: латиница + итальянские символы
        if (/[àèéìíîòóù]/i.test(cleanText)) return 'it';
        
        return null;
    }, []);

    // Умное кэширование с паттернами
    const getSmartCacheKey = useCallback((text: string): string => {
        const cleanText = text.trim().toLowerCase();
        // Создаем ключ на основе паттерна текста, а не точного содержания
        const pattern = cleanText
            .replace(/[а-яё]/g, 'C') // кириллица
            .replace(/[a-z]/g, 'L')  // латиница
            .replace(/[0-9]/g, 'N')  // цифры
            .replace(/\s+/g, 'S')    // пробелы
            .replace(/[^\w\s]/g, 'P') // пунктуация
            .slice(0, 50); // первые 50 символов паттерна
        
        return `lang_pattern_${pattern}_${cleanText.length < 20 ? cleanText : cleanText.slice(0, 20)}`;
    }, []);

    // Функция для автоматического определения языка
    const detectLanguage = useCallback(async (text: string): Promise<string | null> => {
        debugLog('=== LANGUAGE DETECTION START ===');
        debugLog('Input text:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));
        debugLog('Text length:', text.length);
        
        // Определяем язык, если есть текст
        if (!text || text.trim().length < 2) {
            debugLog('Text too short for language detection');
            return null;
        }

        let detectedResult: string | null = null;

        const recordDetection = (languageCode: string | null | undefined, context: string) => {
            const normalized = (languageCode || '').trim().toLowerCase();
            if (!normalized) {
                return;
            }

            if (detectedLanguage !== normalized) {
                debugLog(`Setting detected language (${context}):`, normalized);
                setDetectedLanguage(normalized);
            }

            localStorage.setItem('detected_language', normalized);

            const smartCacheKey = getSmartCacheKey(text);
            localStorage.setItem(smartCacheKey, normalized);

            updateSourceLanguage(normalized);
            detectedResult = normalized;
        };

        // 1. ОФЛАЙН определение (быстро и бесплатно)
        const offlineDetected = detectLanguageOffline(text);
        if (offlineDetected) {
            debugLog('Language detected offline:', offlineDetected);
            recordDetection(offlineDetected, 'offline detection');
            return detectedResult;
        }

        // 2. УМНОЕ кэширование: проверяем по паттерну
        const smartCacheKey = getSmartCacheKey(text);
        const cachedResult = localStorage.getItem(smartCacheKey);
        
        if (cachedResult && detectedLanguage !== cachedResult) {
            debugLog('Using smart cached language detection result:', cachedResult);
            recordDetection(cachedResult, 'smart cache');
            return detectedResult;
        }

        // 3. Если язык уже определен для текущего текста, не определяем повторно
        if (detectedLanguage && cachedResult === detectedLanguage) {
            debugLog('Language already detected for this text:', detectedLanguage);
            detectedResult = detectedLanguage;
            return detectedLanguage;
        }

        // 4. Проверяем квоту и только тогда делаем API вызов (ЭКОНОМИЯ!)
        if (isQuotaExceededCached()) {
            debugLog('Language detection skipped due to cached quota error');
            // Only show error if it hasn't been shown yet
            if (shouldShowQuotaNotification()) {
                const cachedError = getCachedQuotaError();
                if (cachedError) {
                    showError(cachedError);
                    markQuotaNotificationShown();
                }
            }
            return detectedLanguage ?? detectedResult;
        }

        // 5. Проверим, не слишком ли часто мы делаем API вызовы (дополнительная защита)
        const lastApiCall = localStorage.getItem('last_language_api_call');
        const now = Date.now();
        if (lastApiCall && (now - parseInt(lastApiCall)) < 2000) { // мин 2 секунды между API вызовами
            debugLog('Language detection API call skipped - too frequent calls');
            return detectedLanguage ?? detectedResult;
        }

        debugLog('Making API call for language detection...');
        localStorage.setItem('last_language_api_call', now.toString());
        setIsDetectingLanguage(true);

        try {
            // Если у нас есть доступ к API OpenAI, используем его для определения языка
            if ((modelProvider === ModelProvider.OpenAI && openAiKey) || 
                (modelProvider === ModelProvider.Groq && groqApiKey)) {
                
                let detectedCode: string | undefined;
                
                if (modelProvider === ModelProvider.OpenAI) {
                    // Extra check for quota cache before making OpenAI request
                    if (isQuotaExceededCached()) {
                        debugLog('OpenAI language detection skipped due to cached quota error');
                        // Only show error if it hasn't been shown yet
                        if (shouldShowQuotaNotification()) {
                            const cachedError = getCachedQuotaError();
                            if (cachedError) {
                                throw new Error(cachedError);
                            }
                        }
                        return detectedLanguage ?? detectedResult;
                    }
                    
                    try {
                        const response = await backgroundFetch(
                            'https://api.openai.com/v1/chat/completions',
                            {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${openAiKey}`,
                                },
                                body: JSON.stringify({
                                    model: 'gpt-5-nano',
                                    messages: [
                                        {
                                            role: 'system',
                                            content: 'You are a language detection assistant. Respond only with the ISO 639-1 language code.',
                                        },
                                        {
                                            role: 'user',
                                            content: `Detect the language of this text and respond only with the ISO 639-1 language code (e.g. 'en', 'ru', 'fr', etc.): "${text}"`,
                                        },
                                    ],
                                }),
                            }
                        );

                        const data = await response.json();

                        if (!response.ok) {
                            if (data?.error) {
                                const formattedError = formatOpenAIErrorMessage(data);
                                if (data.error.code === 'insufficient_quota' || response.status === 429) {
                                    cacheQuotaExceededError(formattedError);
                                    debugLog('Quota error detected and cached in OpenAI language detection');
                                }
                                throw new Error(formattedError);
                            }

                            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
                        }

                        detectedCode = data.choices?.[0]?.message?.content?.trim().toLowerCase();
                        debugLog('Language detected via OpenAI:', detectedCode);
                    } catch (openaiError) {
                        if (openaiError instanceof Error) {
                            const errorMessage = openaiError.message;
                            if (errorMessage.includes('quota') ||
                                errorMessage.includes('insufficient_quota') ||
                                errorMessage.includes('billing') ||
                                errorMessage.includes('exceeded') ||
                                errorMessage.includes('429')) {
                                cacheQuotaExceededError(errorMessage);
                                debugLog('Quota error detected and cached in OpenAI language detection');
                            }
                        }
                        throw openaiError;
                    }
                } else if (modelProvider === ModelProvider.Groq) {
                    // Extra check for quota cache before making Groq request
                    if (isQuotaExceededCached()) {
                        debugLog('Groq language detection skipped due to cached quota error');
                        // Only show error if it hasn't been shown yet
                        if (shouldShowQuotaNotification()) {
                            const cachedError = getCachedQuotaError();
                            if (cachedError) {
                                throw new Error(cachedError);
                            }
                        }
                        return detectedLanguage ?? detectedResult;
                    }
                    
                    const groqResponse = await backgroundFetch(
                        'https://api.groq.com/openai/v1/chat/completions',
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${groqApiKey}`,
                            },
                            body: JSON.stringify({
                                model: groqModelName,
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are a language detection assistant. Respond only with the ISO 639-1 language code.',
                                    },
                                    {
                                        role: 'user',
                                        content: `Detect the language of this text and respond only with the ISO 639-1 language code (e.g. 'en', 'ru', 'fr', etc.): "${text}"`,
                                    },
                                ],
                                max_tokens: 5,
                                temperature: 0.0,
                            }),
                        }
                    );

                    const groqData = await groqResponse.json();

                    if (!groqResponse.ok) {
                        const groqErrorMessage = (groqData && groqData.error && groqData.error.message)
                            ? `Groq API error: ${groqData.error.message}`
                            : `Groq API error: ${groqResponse.status} ${groqResponse.statusText}`;

                        if (groqResponse.status === 429 || groqErrorMessage.toLowerCase().includes('quota')) {
                            cacheQuotaExceededError(groqErrorMessage);
                        }

                        console.error('Groq language detection failed:', groqData || groqResponse.statusText);
                        throw new Error(groqErrorMessage);
                    }

                    detectedCode = groqData.choices?.[0]?.message?.content?.trim().toLowerCase();
                    debugLog('Language detected via Groq:', detectedCode);
                }

                // Проверяем, является ли результат действительным языковым кодом
                if (detectedCode && allLanguages.some(lang => lang.code === detectedCode)) {
                    debugLog('Language successfully detected:', detectedCode);
                    recordDetection(detectedCode, 'API detection');
                    return detectedResult;
                } else {
                    debugLog('Invalid or unrecognized language code:', detectedCode);
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
                    debugLog("Detected Cyrillic script - setting Russian");
                    detectedLang = 'ru';
                } else if (chinesePattern.test(textSample)) {
                    debugLog("Detected Chinese characters");
                    detectedLang = 'zh';
                } else if (japanesePattern.test(textSample)) {
                    debugLog("Detected Japanese characters");
                    detectedLang = 'ja';
                } else if (koreanPattern.test(textSample)) {
                    debugLog("Detected Korean characters");
                    detectedLang = 'ko';
                } else if (arabicPattern.test(textSample)) {
                    debugLog("Detected Arabic script");
                    detectedLang = 'ar';
                } else if (spanishPattern.test(textSample) || isSpanishWord) {
                    debugLog("Detected Spanish text or common Spanish word");
                    detectedLang = 'es';
                } else if (latinPattern.test(textSample)) {
                    debugLog("Detected Latin script, defaulting to English");
                    detectedLang = 'en';
                }

                if (detectedLang) {
                    debugLog('Language detected using fallback method:', detectedLang);
                    recordDetection(detectedLang, 'fallback detection');
                    return detectedResult;
                }
            }
        } catch (error) {
            console.error("Error detecting language:", error);
            
            // Check if this is a quota error first
            if (error instanceof Error && isQuotaError(error)) {
                console.error('Quota error detected in language detection:', error.message);
                showError(error.message);
                markQuotaNotificationShown();
                return detectedLanguage ?? detectedResult;
            }
            
            // Проверяем, связана ли ошибка с API ключом
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isApiKeyError = errorMessage.includes('401') || 
                                errorMessage.includes('Unauthorized') || 
                                errorMessage.includes('Authentication') ||
                                errorMessage.includes('Invalid API key') ||
                                errorMessage.includes('Incorrect API key') ||
                                errorMessage.includes('API key is missing');
            
            if (isApiKeyError) {
                console.warn("API key error detected, disabling auto-detection to prevent infinite retries");
                // Отключаем автоопределение языка при ошибке API ключа
                setIsAutoDetectLanguage(false);
                localStorage.setItem('auto_detect_language', 'false');
                
                // Показываем уведомление пользователю об ошибке API ключа
                // (предполагается, что showError доступна из контекста)
                const providerName = modelProvider === ModelProvider.OpenAI ? 'OpenAI' : 
                                    modelProvider === ModelProvider.Groq ? 'Groq' : 'AI';
                
                if (typeof showError === 'function') {
                    const invalidKeyMessage = `Language detection failed: Invalid ${providerName} API key. Please check your API key in settings.`;
                    showError(invalidKeyMessage, 'error');
                    handlePotentialApiKeyIssue(invalidKeyMessage);
                }
                
                // Возвращаемся к простой эвристике при ошибке API ключа
                const textSample = text.trim().toLowerCase().slice(0, 100);
                const cyrillicPattern = /[а-яё]/gi;
                const latinPattern = /[a-z]/gi;
                const chinesePattern = /[\u4e00-\u9fff]/gi;
                const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff]/gi;
                const koreanPattern = /[\uac00-\ud7af]/gi;
                const arabicPattern = /[\u0600-\u06ff]/gi;
                const spanishPattern = /[áéíóúüñ¿¡]/gi;
                const spanishWords = ['hasta', 'desde', 'como', 'pero', 'porque', 'adonde', 'quien', 'para', 'por'];
                const isSpanishWord = spanishWords.some(word =>
                    textSample === word || textSample.startsWith(word + ' ') || textSample.includes(' ' + word + ' ')
                );

                let detectedLang = '';
                if (cyrillicPattern.test(textSample)) {
                    detectedLang = 'ru';
                } else if (chinesePattern.test(textSample)) {
                    detectedLang = 'zh';
                } else if (japanesePattern.test(textSample)) {
                    detectedLang = 'ja';
                } else if (koreanPattern.test(textSample)) {
                    detectedLang = 'ko';
                } else if (arabicPattern.test(textSample)) {
                    detectedLang = 'ar';
                } else if (spanishPattern.test(textSample) || isSpanishWord) {
                    detectedLang = 'es';
                } else if (latinPattern.test(textSample)) {
                    detectedLang = 'en';
                }

                if (detectedLang) {
                    debugLog("Language detected using fallback method in error handler:", detectedLang);
                    recordDetection(detectedLang, 'fallback method in error handler');
                    return detectedResult;
                }
            }
        } finally {
            setIsDetectingLanguage(false);
            debugLog('=== LANGUAGE DETECTION END ===');
        }

        return detectedResult;
    }, [openAiKey, modelProvider, groqApiKey, groqModelName, detectLanguageOffline, getSmartCacheKey, updateSourceLanguage, detectedLanguage, showError, shouldShowQuotaNotification, getCachedQuotaError, markQuotaNotificationShown, cacheQuotaExceededError, setIsAutoDetectLanguage, allLanguages]);

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
            // If turning on auto-detection, clear manual source language and pending detection value
            updateSourceLanguage('');
            setDetectedLanguage(null);
            localStorage.removeItem('detected_language');
        }
    };

    const renderLatestCardShortcut = () => {
        if (!latestCardPreview || isSaved || draftMatchesExplicitlySavedCard) {
            return null;
        }

        const hasTranslation = Boolean((latestCardPreview.translation ?? '').trim());
        const hasExamples = Array.isArray(latestCardPreview.examples) && latestCardPreview.examples.length > 0;
        if (!hasTranslation || !hasExamples) {
            return null;
        }

        return (
            <button
                type="button"
                onClick={handleOpenLatestCard}
                style={{
                    width: '100%',
                    border: '1px solid #E5E7EB',
                    borderRadius: '10px',
                    padding: '16px',
                    backgroundColor: '#FFFFFF',
                    color: '#1F2937',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '16px',
                    transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                    marginTop: '12px'
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#F9FAFB';
                    e.currentTarget.style.borderColor = '#D1D5DB';
                    e.currentTarget.style.boxShadow = '0 8px 18px -12px rgba(30, 64, 175, 0.35)';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#E5E7EB';
                    e.currentTarget.style.boxShadow = '0 1px 2px rgba(15, 23, 42, 0.04)';
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 1 }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#EEF2FF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#4338CA',
                        fontSize: '13px'
                    }}>
                        <FaClock size={14} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#111827' }}>Latest draft card</span>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>Saved on {latestCardPreview.timeLabel}</span>
                    </div>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flex: 1,
                    justifyContent: 'flex-end'
                }}>
                    <span
                        style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontSize: '12px',
                            fontWeight: 500,
                            color: '#1F2937',
                            textAlign: 'right',
                            maxWidth: '60%'
                        }}
                    >
                        {latestCardPreview.previewSnippet}
                    </span>
                    <FaChevronRight size={14} style={{ color: '#9CA3AF' }} />
                </div>
            </button>
        );
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
                                <Loader type="spinner" size="small" inline color="#6B7280" />
                            ) : currentSourceLanguage ? (
                                <>
                                    <span style={{ fontSize: '18px' }}>{currentSourceLanguage.flag}</span>
                                    <span>{currentSourceLanguage.name}</span>
                                    {isAutoDetectLanguage && (
                                        <span style={{
                                            fontSize: '11px',
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
                                    // Check if quota is exceeded before resetting language detection
                                    if (isQuotaExceededCached()) {
                                        debugLog('Language detection reset skipped due to cached quota error');
                                        // Only show error if it hasn't been shown yet
                                        if (shouldShowQuotaNotification()) {
                                            const cachedError = getCachedQuotaError();
                                            if (cachedError) {
                                                showError(cachedError);
                                                markQuotaNotificationShown();
                                            }
                                        }
                                        return;
                                    }
                                    
                                    // Повторно определяем язык для текущего текста
                                    if (text) {
                                        debugLog('Manually triggering language detection for:', text.substring(0, 50) + '...');
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
    // Removed test functions to simplify interface

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

        debugLog('Initializing language settings from localStorage:', {
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

    }, []);

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
        
        // Автоматически включаем shouldGenerateImage для Smart и Always режимов
        if (mode === 'smart' || mode === 'always') {
            debugLog(`🔧 Automatically enabling shouldGenerateImage for ${mode} mode`);
            dispatch(setShouldGenerateImage(true));
            
            // Дополнительная проверка - убеждаемся, что состояние действительно изменилось
            setTimeout(() => {
                debugLog(`🔍 Verification: shouldGenerateImage should now be true for ${mode} mode`);
            }, 100);
        } else if (mode === 'off') {
            // При выключении режима также выключаем общий переключатель
            debugLog('🔧 Disabling shouldGenerateImage for off mode');
            dispatch(setShouldGenerateImage(false));
        }
        
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

    // Function to generate general cards
    const generateGeneralCard = useCallback(async (template: GeneralCardTemplate, inputText: string, customPrompt?: string) => {
        if (!inputText.trim()) {
            showError('Please enter some text to create a card from', 'error');
            return;
        }

        if (!apiKey) {
            notifyMissingApiKey();
            return;
        }

        // Using unified loadingGetResult instead of separate isGeneratingGeneralCard
        
        try {
            const finalPrompt = customPrompt || template.prompt;
            const fullPrompt = `${finalPrompt}\n\nText: "${inputText}"\n\nProvide a clear, educational response that would work well as flashcard content. Be concise but informative.`;
            
            // Use the AI service to generate the card content
            const response = await aiService.translateText(apiKey, fullPrompt, 'en');
            
            if (!response) {
                throw new Error('Failed to generate card content');
            }

            // Parse the response for Q&A format
            let front = template.name;
            let back = response;
            
            if (template.id === 'qa' && response.includes('Q:') && response.includes('A:')) {
                const qIndex = response.indexOf('Q:');
                const aIndex = response.indexOf('A:');
                if (qIndex !== -1 && aIndex !== -1 && aIndex > qIndex) {
                    front = response.substring(qIndex + 2, aIndex).trim();
                    back = response.substring(aIndex + 2).trim();
                }
            } else if (template.id === 'definition') {
                // For definitions, try to extract the term as front
                const lines = response.split('\n').filter(line => line.trim());
                if (lines.length > 0) {
                    // Look for a pattern like "Term: definition" or just use first line as term
                    const firstLine = lines[0];
                    if (firstLine.includes(':')) {
                        const parts = firstLine.split(':');
                        front = parts[0].trim();
                        back = parts.slice(1).join(':').trim();
                        if (lines.length > 1) {
                            back += '\n' + lines.slice(1).join('\n');
                        }
                    } else {
                        // Extract key terms from the original text
                        const words = inputText.split(' ').filter(word => word.length > 3);
                        front = words.slice(0, 3).join(' ') + (words.length > 3 ? '...' : '');
                        back = response;
                    }
                }
            } else {
                // For other types, use template name + excerpt as front
                const excerpt = inputText.length > 50 ? inputText.substring(0, 50) + '...' : inputText;
                front = `${template.name}: ${excerpt}`;
                back = response;
            }

            // Generate image if enabled
            let imageData = null;
            if (shouldGenerateImage && imageGenerationMode !== 'off' && isImageGenerationAvailable()) {
                try {
                    const imageDescription = await aiService.getDescriptionImage(apiKey, inputText, imageInstructions);
                    if (imageDescription) {
                        const imageUrl = await aiService.getImageUrl?.(apiKey, imageDescription);
                        if (imageUrl) {
                            imageData = imageUrl;
                        }
                    }
                } catch (imageError) {
                    console.warn('Failed to generate image:', imageError);
                    // Continue without image
                }
            }

            // Update Redux state
            dispatch(setFront(front));
            dispatch(setBack(back));
            dispatch(setText(inputText));
            if (imageData) {
                dispatch(setImageUrl(imageData));
            }
            
            setShowResult(true);
            
        } catch (error) {
            console.error('Error generating general card:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showError(`Failed to generate card: ${errorMessage}`, 'error');
            handlePotentialApiKeyIssue(errorMessage);
        } finally {
            // Using unified loadingGetResult instead of separate isGeneratingGeneralCard
        }
    }, [
        aiService,
        showError,
        dispatch,
        shouldGenerateImage,
        imageGenerationMode,
        isImageGenerationAvailable,
        imageInstructions,
        apiKey,
        notifyMissingApiKey,
        handlePotentialApiKeyIssue
    ]);

    // Function to handle template selection
    const handleTemplateSelect = useCallback((template: GeneralCardTemplate) => {
        setSelectedTemplate(template);
        if (text.trim()) {
            generateGeneralCard(template, text);
        }
        setShowTemplateModal(false);
    }, [text, generateGeneralCard]);

    // Function to handle custom prompt submission
    const handleCustomPromptSubmit = useCallback(async () => {
        if (!customPrompt.trim() || !text.trim()) {
            showError('Please enter both text and a custom prompt', 'error');
            return;
        }

        const customTemplate: GeneralCardTemplate = {
            id: 'custom',
            name: 'Custom',
            description: 'Custom prompt',
            icon: '⚡',
            prompt: customPrompt
        };

        await generateGeneralCard(customTemplate, text, customPrompt);
        setCustomPrompt('');
    }, [customPrompt, text, generateGeneralCard, showError]);

    // Function to handle AI agent card creation
    const handleCreateAICards = useCallback(async () => {
        if (!text.trim()) {
            showError('Please enter or select text to create cards', 'error');
            return;
        }

        if (!apiKey) {
            notifyMissingApiKey();
            return;
        }

        criticalApiErrorRef.current = false;

        // Create new AbortController for this generation
        abortControllerRef.current = new AbortController();
        const abortSignal = abortControllerRef.current.signal;

        setForceHideLoader(false);
        setLoadingGetResult(true);

        try {
            // Check if cancelled before starting
            if (abortSignal.aborted) {
                throw new Error('Generation cancelled by user');
            }

            // Создаем AI Agent Service
            const aiAgentService = createAIAgentService(aiService, apiKey);
            
            // Извлекаем контент страницы для анализа
            let pageContext: PageContentContext | undefined;
            
            try {
                // Пытаемся найти элемент с выделенным текстом
                const selection = window.getSelection();
                let selectionElement: Element | undefined;
                
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    selectionElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE 
                        ? range.commonAncestorContainer as Element
                        : range.commonAncestorContainer.parentElement || undefined;
                }
                
                // Извлекаем контент страницы асинхронно для загрузки внешних изображений
                pageContext = await PageContentExtractor.extractPageContentAsync(text, selectionElement);
                
                debugLog('📄 Extracted page content:', {
                    images: pageContext.pageImages.length,
                    formulas: pageContext.formulas.length,
                    codeBlocks: pageContext.codeBlocks.length,
                    links: pageContext.links.length,
                    metadata: pageContext.metadata,
                    selectedText: text.substring(0, 100) + '...'
                });
                
                // Детальное логирование найденных изображений
                pageContext.pageImages.forEach((img, index) => {
                    debugLog(`🖼️ Изображение ${index}:`, {
                        src: img.src,
                        alt: img.alt,
                        relevanceScore: img.relevanceScore,
                        isRelevant: img.relevanceScore > 0.3,
                        hasBase64: !!img.base64
                    });
                });
                
            } catch (extractError) {
                console.warn('Failed to extract page content, proceeding without multimedia:', extractError);
                pageContext = undefined;
            }

            // Всегда используем быстрый режим генерации для максимальной скорости
            const createdCards = await aiAgentService.createCardsFromTextFast(text, pageContext, abortSignal);
            
            // Check if cancelled after creation
            if (abortSignal.aborted) {
                debugLog('AI card creation was cancelled by user');
                return;
            }
            
            debugLog(`🎉 AI Agents created ${createdCards.length} cards successfully`);
            
            // Логируем финальные карточки для отладки
            createdCards.forEach((card: any, index: number) => {
                debugLog(`🃏 Карточка ${index}:`, {
                    front: card.front,
                    backPreview: card.back.substring(0, 200) + '...',
                    hasAttachedImages: !!card.attachedImages && card.attachedImages.length > 0,
                    attachedImagesCount: card.attachedImages?.length || 0,
                    multimedia: card.multimedia,
                    hasImageInBack: card.back.includes('[IMAGE:') || card.back.includes('!['),
                    hasFormulaInBack: card.back.includes('[FORMULA:') || card.back.includes('$$'),
                    hasCodeInBack: card.back.includes('[CODE:') || card.back.includes('```')
                });
                
                // Показываем полный back для первой карточки
                if (index === 0) {
                    debugLog(`🃏 Полный back карточки 0:`, card.back);
                }
            });
            
            // НЕ сохраняем карточки автоматически, а показываем предварительный просмотр
            setPreviewCards(createdCards);
            setCurrentPreviewIndex(0);
            setShowPreview(true);
            
            // Удалили навязчивое success уведомление
            
        } catch (error) {
            if (abortSignal.aborted) {
                debugLog('AI card creation was cancelled by user');
                return;
            }
            console.error('❌ Error in AI agent card creation:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showError(`Card creation error: ${errorMessage}`, 'error');
            const isApiKeyError = handlePotentialApiKeyIssue(errorMessage);
            setLoadingGetResult(false);
            setCurrentLoadingMessage(null);
            setCurrentProgress({ completed: 0, total: 0 });
            if (isApiKeyError && abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        } finally {
            debugLog('🎯 Main card creation function finally block reached');
            if (criticalApiErrorRef.current) {
                debugLog('🚫 Critical API error detected in AI agent flow - stopping loader immediately');
                criticalApiErrorRef.current = false;
                setLoadingGetResult(false);
                setCurrentLoadingMessage(null);
                setCurrentProgress({ completed: 0, total: 0 });
                abortControllerRef.current = null;
                return;
            }
            // Add delay to prevent window disappearing too quickly
            // Use a longer delay and check for any pending operations
            setTimeout(() => {
                debugLog('⏳ Checking for pending operations before hiding loader...');

                // Check if there are any pending operations by looking at API tracker
                const tracker = getGlobalApiTracker();
                const trackerStats = tracker.getStats();
                const hasPendingRequests = trackerStats.inProgress > 0;

                debugLog('📊 Tracker stats:', trackerStats);
                debugLog('🔄 Has pending requests:', hasPendingRequests);

                // Also check local loading states
                const hasLocalOperations = isProcessingCustomInstruction || loadingNewImage || loadingNewExamples;

                debugLog('🏠 Local loading states:', {
                    isProcessingCustomInstruction,
                    loadingNewImage,
                    loadingNewExamples,
                    hasLocalOperations
                });

                // Only hide loader if no operations are running
                if (!hasPendingRequests && !hasLocalOperations) {
                    debugLog('✅ No pending operations - hiding loader');
                    setLoadingGetResult(false);
                    setCurrentLoadingMessage(null);
                    setCurrentProgress({ completed: 0, total: 0 });
                } else {
                    debugLog('⏸️ Keeping loader visible - operations still running');
                    // If there are still pending operations, wait a bit longer
                    setTimeout(() => {
                        debugLog('⏳ Second check after additional delay...');
                        const secondCheckStats = tracker.getStats();
                        const stillHasPending = secondCheckStats.inProgress > 0;

                        if (!stillHasPending && !isProcessingCustomInstruction && !loadingNewImage && !loadingNewExamples) {
                            debugLog('✅ Second check passed - hiding loader');
                            setLoadingGetResult(false);
                            setCurrentLoadingMessage(null);
                            setCurrentProgress({ completed: 0, total: 0 });
                        } else {
                            debugLog('⏸️ Still has pending operations - keeping loader');
                        }
                    }, 2000);
                }
            }, 1500); // Longer initial delay
            abortControllerRef.current = null;
            criticalApiErrorRef.current = false;
        }
    }, [text, aiService, apiKey, showError, notifyMissingApiKey, handlePotentialApiKeyIssue]);

    // Functions for preview management
    const handleAcceptPreviewCards = async () => {
        setLoadingAccept(true);
        try {
            // Сохраняем все карточки в Redux store
            for (const card of previewCards) {
                const normalized = await normalizeImageForStorage(card.image ?? null, card.imageUrl ?? null);
                const cardToSave = {
                    ...card,
                    image: normalized.image,
                    imageUrl: normalized.imageUrl
                };
                dispatch(saveCardToStorage(cardToSave));
            }
            
            // Закрываем предварительный просмотр
            setShowPreview(false);
            setPreviewCards([]);
            setCurrentPreviewIndex(0);
            
            // Удалили навязчивое success уведомление
            
            // Очищаем форму
            dispatch(setText(''));
            
        } catch (error) {
            console.error('Error saving preview cards:', error);
            showError('Error saving cards', 'error');
        } finally {
            setLoadingAccept(false);
        }
    };

    const handleRejectPreviewCards = () => {
        setShowPreview(false);
        setPreviewCards([]);
        setCurrentPreviewIndex(0);
        setSavedCardIndices(new Set());
        setRecreateComments('');
        // showError('Cards rejected', 'info'); // Убрали уведомление об отмене
    };

    const handleRecreateCards = async () => {
        setShowPreview(false);
        setPreviewCards([]);
        setCurrentPreviewIndex(0);
        setSavedCardIndices(new Set());
        setRecreateComments('');
        // Запускаем процесс создания карточек заново
        await handleCreateAICards();
    };

    // New function to save current single card
    const handleSaveCurrentCard = async () => {
        setLoadingAccept(true);
        try {
            const currentCard = previewCards[currentPreviewIndex];
            if (!currentCard) {
                showError('No card to save', 'error');
                return;
            }

            // Save the current card to Redux store
            const normalized = await normalizeImageForStorage(currentCard.image ?? null, currentCard.imageUrl ?? null);
            const cardToSave = {
                ...currentCard,
                image: normalized.image,
                imageUrl: normalized.imageUrl
            };
            dispatch(saveCardToStorage(cardToSave));
            
            // Mark this card as saved
            setSavedCardIndices(prev => new Set(prev).add(currentPreviewIndex));
            
            // Удалили навязчивое success уведомление
            
        } catch (error) {
            console.error('Error saving current card:', error);
            showError('Error saving card', 'error');
        } finally {
            setLoadingAccept(false);
        }
    };

    // New function to recreate only current card
    const handleRecreateCurrentCard = () => {
        setShowRecreateModal(true);
        setRecreateComments('');
    };

    // Function to handle single card recreation with comments
    const handleConfirmRecreateCard = async () => {
        setShowRecreateModal(false);
        setLoadingAccept(true);
        
        try {
            const currentCard = previewCards[currentPreviewIndex];
            if (!currentCard) {
                showError('No card to recreate', 'error');
                return;
            }

            // Create AI Agent Service
            const aiAgentService = createAIAgentService(aiService, apiKey);
            
            // Prepare recreation prompt with user comments
            let recreationPrompt = `Please recreate this card with improvements. Original card:
Question: ${currentCard.front}
Answer: ${currentCard.back}
Original text: ${text}`;

            if (recreateComments.trim()) {
                recreationPrompt += `\n\nUser feedback: ${recreateComments.trim()}`;
            }
            
            recreationPrompt += `\n\nPlease create an improved version based on the feedback.`;

            // Извлекаем контент страницы для анализа (если возможно)
            let pageContext: PageContentContext | undefined;
            try {
                const selection = window.getSelection();
                let selectionElement: Element | undefined;
                
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    selectionElement = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE 
                        ? range.commonAncestorContainer as Element
                        : range.commonAncestorContainer.parentElement || undefined;
                }
                
                pageContext = await PageContentExtractor.extractPageContentAsync(text, selectionElement);
            } catch (extractError) {
                console.warn('Failed to extract page content for recreation:', extractError);
                pageContext = undefined;
            }

            // Recreate single card using fast mode
            const recreatedCards = await aiAgentService.createCardsFromTextFast(recreationPrompt, pageContext);
            
            if (recreatedCards.length > 0) {
                // Replace the current card with the recreated one
                const newPreviewCards = [...previewCards];
                newPreviewCards[currentPreviewIndex] = recreatedCards[0];
                setPreviewCards(newPreviewCards);
                
                // Remove saved status for this card since it's been recreated
                setSavedCardIndices(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(currentPreviewIndex);
                    return newSet;
                });
                
                // Удалили навязчивое success уведомление
            } else {
                showError('Failed to recreate card', 'error');
            }
            
        } catch (error) {
            console.error('Error recreating card:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const formattedMessage = `Card recreation error: ${errorMessage}`;
            showError(formattedMessage, 'error');
            handlePotentialApiKeyIssue(errorMessage);
        } finally {
            setLoadingAccept(false);
            setRecreateComments('');
        }
    };

    const nextPreviewCard = () => {
        if (currentPreviewIndex < previewCards.length - 1) {
            setCurrentPreviewIndex(currentPreviewIndex + 1);
        }
    };

    const prevPreviewCard = () => {
        if (currentPreviewIndex > 0) {
            setCurrentPreviewIndex(currentPreviewIndex - 1);
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
            {loadingGetResult && !forceHideLoader && (
                <div className="loading-overlay" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '20px',
                    padding: '0 20px',
                    borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                    }}>
                        <Loader type="spinner" size="large" color={currentLoadingMessage?.color || '#3B82F6'} />
                        {currentLoadingMessage && (
                            <div style={{
                                fontSize: '20px',
                                opacity: 0.8
                            }}>
                                {currentLoadingMessage.icon}
                            </div>
                        )}
                    </div>
                    <div style={{
                        textAlign: 'center',
                        color: '#374151',
                        maxWidth: '400px'
                    }}>
                        <div style={{
                            fontSize: '18px',
                            fontWeight: '600',
                            marginBottom: '8px',
                            color: currentLoadingMessage?.color || '#1f2937'
                        }}>
                            {currentLoadingMessage?.currentStepTitle || currentLoadingMessage?.title || "Starting..."}
                        </div>
                        <div style={{
                            fontSize: '14px',
                            color: '#6b7280',
                            lineHeight: '1.5'
                        }}>
                            {currentLoadingMessage?.currentStepSubtitle || currentLoadingMessage?.subtitle || "Preparing your request..."}
                        </div>

                    </div>

                    {/* Progress indicator */}
                    <div style={{
                        width: '280px',
                        height: '8px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        marginTop: '12px',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.1)'
                    }}>
                        <div style={{
                            height: '100%',
                            width: `${currentProgress.total > 0 ? Math.max(5, (currentProgress.completed / currentProgress.total) * 100) : 15}%`, // Real progress
                            background: `linear-gradient(90deg, ${currentLoadingMessage?.color || '#3B82F6'} 0%, ${currentLoadingMessage?.color || '#3B82F6'}dd 50%, ${currentLoadingMessage?.color || '#3B82F6'} 100%)`,
                            borderRadius: '4px',
                            transition: 'width 0.6s ease-out, background 0.3s ease-in-out',
                            boxShadow: `0 0 10px ${currentLoadingMessage?.color || '#3B82F6'}40`,
                            position: 'relative' as const,
                            overflow: 'hidden' as const
                        }}>
                            {/* Shimmer effect */}
                            <div style={{
                                position: 'absolute' as const,
                                top: 0,
                                left: '-100%',
                                width: '100%',
                                height: '100%',
                                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                                animation: 'shimmer 2s infinite'
                            }} />
                        </div>
                    </div>

                    {/* Timer display */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        marginTop: '16px',
                        padding: '8px 16px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        border: `1px solid ${currentLoadingMessage?.color || '#3B82F6'}20`,
                        boxShadow: `0 0 15px ${currentLoadingMessage?.color || '#3B82F6'}20`
                    }}>
                        <FaClock style={{
                            color: currentLoadingMessage?.color || '#3B82F6',
                            fontSize: '14px',
                            animation: 'pulse 2s ease-in-out infinite'
                        }} />
                        <span style={{
                            fontSize: '16px',
                            fontWeight: '600',
                            color: currentLoadingMessage?.color || '#3B82F6',
                            fontFamily: 'monospace',
                            letterSpacing: '1px'
                        }}>
                            {formatElapsedTime(elapsedTime)}
                        </span>
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
                    <Loader type="spinner" size="large" color="#3B82F6" text="Analyzing selected text..." />
                    
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
            {showMissingApiKeyNotice && !apiKey && (
                <div
                    style={{
                        margin: '16px',
                        marginBottom: 0,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '16px 18px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #EFF6FF 0%, #FFFFFF 100%)',
                        border: '1px solid #BFDBFE',
                        boxShadow: '0 12px 35px -18px rgba(59, 130, 246, 0.45)',
                        animation: 'slideIn 0.25s ease-out'
                    }}
                >
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            backgroundColor: '#DBEAFE',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#1D4ED8',
                            flexShrink: 0
                        }}
                    >
                        <FaKey size={18} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                        }}>
                            <span style={{
                                fontSize: '15px',
                                fontWeight: 600,
                                color: '#1D4ED8'
                            }}>
                                Add an API key for {providerDisplayName}
                            </span>
                            <span style={{
                                fontSize: '13px',
                                color: '#1F2937',
                                lineHeight: 1.5
                            }}>
                                Add a valid key in Settings to create cards. You can update it anytime.
                            </span>
                        </div>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '8px',
                            marginTop: '10px'
                        }}>
                            <button
                                onClick={handleOpenSettings}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'linear-gradient(135deg, #2563EB, #1D4ED8)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '8px 14px',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    boxShadow: '0 6px 16px -8px rgba(37, 99, 235, 0.6)'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #1D4ED8, #1E3A8A)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.background = 'linear-gradient(135deg, #2563EB, #1D4ED8)';
                                }}
                            >
                                Open settings
                                <FaChevronRight size={12} />
                            </button>
                            <button
                                onClick={handleDismissMissingApiKeyNotice}
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    color: '#1F2937',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '8px',
                                    padding: '8px 14px',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.backgroundColor = '#F3F4F6';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                                }}
                            >
                                Dismiss
                            </button>
                        </div>
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
                overflowX: 'hidden',
                backgroundColor: '#ffffff',
                paddingBottom: '16px',
                boxSizing: 'border-box'
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
                                width: '100%',
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
                                    width: '100%',
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
                                            whiteSpace: 'nowrap',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: imageGenerationMode === 'off' ? '#FFFFFF' : 'transparent',
                                            color: imageGenerationMode === 'off' ? '#111827' : '#6B7280',
                                            fontSize: '11px',
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
                                            whiteSpace: 'nowrap',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: imageGenerationMode === 'smart' ? '#FFFFFF' : 'transparent',
                                            color: imageGenerationMode === 'smart' ? '#111827' : '#6B7280',
                                            fontSize: '11px',
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
                                            whiteSpace: 'nowrap',
                                            padding: '8px 12px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: imageGenerationMode === 'always' ? '#FFFFFF' : 'transparent',
                                            color: imageGenerationMode === 'always' ? '#111827' : '#6B7280',
                                            fontSize: '11px',
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
                                <div style={{ position: 'relative', height: '2.8em', marginTop: '2px' }}>
                                    <div style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        fontSize: '11px',
                                        color: '#6B7280',
                                        lineHeight: '1.4',
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}>
                                        {imageGenerationMode === 'off' && 'No images will be generated'}
                                        {imageGenerationMode === 'smart' && 'AI decides: Images only for concrete objects, places, and visual concepts. Saves API costs by skipping abstract terms.'}
                                        {imageGenerationMode === 'always' && 'Images generated for all cards'}
                                    </div>
                                </div>

                                {!isImageGenerationAvailable() && (
                                    <div style={{
                                        fontSize: '11px',
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

                    {mode === Modes.GeneralTopic && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            padding: '16px',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                marginBottom: '8px'
                            }}>
                                <FaRobot style={{ color: '#6366F1' }} />
                                <h4 style={{
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: '#111827',
                                    margin: 0
                                }}>
                                    AI Agent Card Creator
                                </h4>
                            </div>
                            
                            <p style={{
                                fontSize: '14px',
                                color: '#6B7280',
                                margin: 0,
                                lineHeight: '1.4'
                            }}>
                                Select text on any page and AI agents will automatically create optimal cards for learning. The system analyzes content and creates 1 to several cards with quality validation.
                            </p>

                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: '#FEF3C7',
                                borderRadius: '6px',
                                border: '1px solid #F59E0B'
                            }}>
                                <FaLightbulb style={{ color: '#F59E0B' }} />
                                <span style={{
                                    fontSize: '11px',
                                    color: '#92400E',
                                    fontWeight: '500'
                                }}>
                                    AI analyzes text, creates cards and validates results
                                </span>
                            </div>


                            {!loadingGetResult && (
                                <button
                                    onClick={handleCreateAICards}
                                    disabled={!text.trim() || loadingGetResult}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        width: '100%',
                                        padding: '8px 10px',
                                        backgroundColor: text.trim() && !loadingGetResult ? '#2563EB' : '#E5E7EB',
                                        color: text.trim() && !loadingGetResult ? '#ffffff' : '#9CA3AF',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: text.trim() && !loadingGetResult ? 'pointer' : 'not-allowed',
                                        transition: 'all 0.2s ease',
                                        marginTop: '4px',
                                        opacity: loadingGetResult ? 0.7 : 1
                                    }}
                                    onMouseOver={(e) => {
                                        if (text.trim() && !loadingGetResult) {
                                            e.currentTarget.style.backgroundColor = '#1D4ED8';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (text.trim() && !loadingGetResult) {
                                            e.currentTarget.style.backgroundColor = '#2563EB';
                                        }
                                    }}
                                >
                                    {loadingGetResult ? (
                                        <Loader type="spinner" size="small" inline color="#ffffff" />
                                    ) : (
                                        <FaRobot />
                                    )}
                                    Create Cards with AI
                                </button>
                            )}

                            {/* Removed separate loader - now using unified loadingGetResult loader */}
                        </div>
                    )}

                    {renderAISettings()}

                    {/* Форма для ввода текста - показываем только в режиме Language Learning */}
                    {mode === Modes.LanguageLearning && (
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
                                        <Loader type="spinner" size="small" inline color="#ffffff" text="Creating card" />
                                    </div> : 'Create Card'}
                            </button>
                        </form>
                    )}

                    {/* Простое поле ввода для General Topic режима */}
                    {mode === Modes.GeneralTopic && (
                        <div style={{
                            width: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            marginTop: '4px'
                        }}>
                            <label htmlFor="general-text" style={{
                                color: '#111827',
                                fontWeight: '600',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center'
                            }}>
                                Text for Analysis:
                                {renderProviderBadge()}
                            </label>
                            <textarea
                                id="general-text"
                                value={text}
                                onChange={(e) => handleTextChange(e.target.value)}
                                placeholder="Enter or select text from the page to create cards"
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
                    )}

                    {renderLatestCardShortcut()}
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

            {/* AI Cards Preview Modal - Matching Main Interface Style */}
            {showPreview && previewCards.length > 0 && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    animation: 'fadeIn 0.3s ease-out'
                }}>
                    <div style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        maxWidth: '640px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid #EAEAEA',
                        animation: 'slideUp 0.4s ease-out'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '20px 24px 16px 24px',
                            borderBottom: '1px solid #EAEAEA'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        color: '#000000',
                                        letterSpacing: '-0.025em'
                                    }}>
                                        Review Cards
                                    </h3>
                                    <p style={{
                                        margin: '4px 0 0 0',
                                        fontSize: '14px',
                                        color: '#666666',
                                        fontWeight: '400'
                                    }}>
                                        {previewCards.length} cards generated by AI
                                    </p>
                                </div>
                                <button
                                    onClick={handleRejectPreviewCards}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '16px',
                                        color: '#999999',
                                        cursor: 'pointer',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = '#F5F5F5';
                                        e.currentTarget.style.color = '#666666';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = '#999999';
                                    }}
                                >
                                    <FaTimes />
                                </button>
                            </div>
                        </div>

                        {/* Navigation bar */}
                        {previewCards.length > 1 && (
                            <div style={{
                                padding: '12px 24px',
                                backgroundColor: '#FAFAFA',
                                borderBottom: '1px solid #EAEAEA',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <button
                                        onClick={prevPreviewCard}
                                        disabled={currentPreviewIndex === 0}
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: currentPreviewIndex === 0 ? '#CCCCCC' : '#666666',
                                            border: `1px solid ${currentPreviewIndex === 0 ? '#EAEAEA' : '#DDDDD'}`,
                                            borderRadius: '6px',
                                            padding: '6px 10px',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            cursor: currentPreviewIndex === 0 ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                        onMouseOver={(e) => {
                                            if (currentPreviewIndex !== 0) {
                                                e.currentTarget.style.borderColor = '#999999';
                                                e.currentTarget.style.color = '#333333';
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (currentPreviewIndex !== 0) {
                                                e.currentTarget.style.borderColor = '#DDDDDD';
                                                e.currentTarget.style.color = '#666666';
                                            }
                                        }}
                                    >
                                        ←
                                    </button>
                                    
                                    <div style={{
                                        fontSize: '13px',
                                        color: '#666666',
                                        fontWeight: '500',
                                        padding: '0 8px'
                                    }}>
                                        {currentPreviewIndex + 1} of {previewCards.length}
                                    </div>
                                    
                                    <button
                                        onClick={nextPreviewCard}
                                        disabled={currentPreviewIndex === previewCards.length - 1}
                                        style={{
                                            backgroundColor: 'transparent',
                                            color: currentPreviewIndex === previewCards.length - 1 ? '#CCCCCC' : '#666666',
                                            border: `1px solid ${currentPreviewIndex === previewCards.length - 1 ? '#EAEAEA' : '#DDDDDD'}`,
                                            borderRadius: '6px',
                                            padding: '6px 10px',
                                            fontSize: '13px',
                                            fontWeight: '500',
                                            cursor: currentPreviewIndex === previewCards.length - 1 ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.15s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                        onMouseOver={(e) => {
                                            if (currentPreviewIndex !== previewCards.length - 1) {
                                                e.currentTarget.style.borderColor = '#999999';
                                                e.currentTarget.style.color = '#333333';
                                            }
                                        }}
                                        onMouseOut={(e) => {
                                            if (currentPreviewIndex !== previewCards.length - 1) {
                                                e.currentTarget.style.borderColor = '#DDDDDD';
                                                e.currentTarget.style.color = '#666666';
                                            }
                                        }}
                                    >
                                        →
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Content - Using unified ResultDisplay style */}
                        <div style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '16px',
                            backgroundColor: '#ffffff'
                        }}>
                            {/* Current Card Display using ResultDisplay component style */}
                            {previewCards[currentPreviewIndex] && (
                                <div style={{ animation: 'slideIn 0.3s ease-out' }}>
                                    <ResultDisplay
                                        front={previewCards[currentPreviewIndex].front || null}
                                        back={previewCards[currentPreviewIndex].back || null}
                                        translation={null}
                                        examples={[]}
                                        imageUrl={previewCards[currentPreviewIndex].imageUrl || null}
                                        image={previewCards[currentPreviewIndex].image || null}
                                        linguisticInfo=""
                                        transcription={null}
                                        onNewImage={() => {}}
                                        onNewExamples={() => {}}
                                        onAccept={handleSaveCurrentCard}
                                        onViewSavedCards={() => {}}
                                        loadingNewImage={false}
                                        loadingNewExamples={false}
                                        loadingAccept={loadingAccept}
                                        createdAt={new Date()}
                                        mode={Modes.GeneralTopic}
                                        shouldGenerateImage={false}
                                        isSaved={savedCardIndices.has(currentPreviewIndex)}
                                        isEdited={false}
                                        isGeneratingCard={false}
                                        hideActionButtons={true}
                                        setBack={(newBack) => {
                                            const newPreviewCards = [...previewCards];
                                            newPreviewCards[currentPreviewIndex] = {
                                                ...newPreviewCards[currentPreviewIndex],
                                                back: newBack
                                            };
                                            setPreviewCards(newPreviewCards);
                                        }}
                                    />
                                    
                                    {/* Removed unnecessary card metadata - cleaner interface */}
                                </div>
                            )}
                        </div>

                        {/* Footer with action buttons - Vercel style */}
                        <div style={{
                            padding: '16px 20px',
                            borderTop: '1px solid #EAEAEA',
                            backgroundColor: '#FAFAFA',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            {/* Top row - individual card actions */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                gap: '8px'
                            }}>
                                <button
                                    onClick={handleSaveCurrentCard}
                                    disabled={loadingAccept || savedCardIndices.has(currentPreviewIndex)}
                                    style={{
                                        backgroundColor: savedCardIndices.has(currentPreviewIndex) ? '#10B981' : '#ffffff',
                                        color: savedCardIndices.has(currentPreviewIndex) ? '#ffffff' : '#374151',
                                        border: `1px solid ${savedCardIndices.has(currentPreviewIndex) ? '#10B981' : '#D1D5DB'}`,
                                        borderRadius: '6px',
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: (loadingAccept || savedCardIndices.has(currentPreviewIndex)) ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        minWidth: '100px',
                                        justifyContent: 'center',
                                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                        opacity: (loadingAccept || savedCardIndices.has(currentPreviewIndex)) ? 0.7 : 1
                                    }}
                                    onMouseOver={(e) => {
                                        if (!loadingAccept && !savedCardIndices.has(currentPreviewIndex)) {
                                            e.currentTarget.style.borderColor = '#9CA3AF';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (!loadingAccept && !savedCardIndices.has(currentPreviewIndex)) {
                                            e.currentTarget.style.borderColor = '#D1D5DB';
                                            e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                                        }
                                    }}
                                >
                                    {savedCardIndices.has(currentPreviewIndex) ? (
                                        <>
                                            <FaCheck size={14} />
                                            Saved
                                        </>
                                    ) : (
                                        <>
                                            <FaSave size={14} />
                                            Save
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={handleRecreateCurrentCard}
                                    disabled={loadingAccept}
                                    style={{
                                        backgroundColor: '#ffffff',
                                        color: '#F59E0B',
                                        border: '1px solid #F59E0B',
                                        borderRadius: '6px',
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: loadingAccept ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        minWidth: '100px',
                                        justifyContent: 'center',
                                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                        opacity: loadingAccept ? 0.7 : 1
                                    }}
                                    onMouseOver={(e) => {
                                        if (!loadingAccept) {
                                            e.currentTarget.style.backgroundColor = '#F59E0B';
                                            e.currentTarget.style.color = '#ffffff';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (!loadingAccept) {
                                            e.currentTarget.style.backgroundColor = '#ffffff';
                                            e.currentTarget.style.color = '#F59E0B';
                                            e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                                        }
                                    }}
                                >
                                    <FaEdit size={14} />
                                    Improve
                                </button>
                            </div>

                            {/* Bottom row - main actions */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                gap: '8px'
                            }}>
                                <button
                                    onClick={handleRejectPreviewCards}
                                    disabled={loadingAccept}
                                    style={{
                                        backgroundColor: '#ffffff',
                                        color: '#6B7280',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '6px',
                                        padding: '8px 16px',
                                        fontSize: '14px',
                                        fontWeight: '500',
                                        cursor: loadingAccept ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        minWidth: '100px',
                                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                        opacity: loadingAccept ? 0.7 : 1
                                    }}
                                    onMouseOver={(e) => {
                                        if (!loadingAccept) {
                                            e.currentTarget.style.backgroundColor = '#F3F4F6';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (!loadingAccept) {
                                            e.currentTarget.style.backgroundColor = '#ffffff';
                                            e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                                        }
                                    }}
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={handleAcceptPreviewCards}
                                    disabled={loadingAccept}
                                    style={{
                                        backgroundColor: loadingAccept ? '#9CA3AF' : '#3B82F6',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '8px 20px',
                                        fontSize: '14px',
                                        fontWeight: '600',
                                        cursor: loadingAccept ? 'not-allowed' : 'pointer',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        minWidth: '140px',
                                        justifyContent: 'center',
                                        boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)',
                                        opacity: loadingAccept ? 0.7 : 1
                                    }}
                                    onMouseOver={(e) => {
                                        if (!loadingAccept) {
                                            e.currentTarget.style.backgroundColor = '#2563EB';
                                            e.currentTarget.style.boxShadow = '0 6px 10px -1px rgba(59, 130, 246, 0.4)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }
                                    }}
                                    onMouseOut={(e) => {
                                        if (!loadingAccept) {
                                            e.currentTarget.style.backgroundColor = '#3B82F6';
                                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.3)';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }
                                    }}
                                >
                                    {loadingAccept ? (
                                        <>
                                            <Loader type="spinner" size="small" inline color="#ffffff" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <FaCheck size={14} />
                                            Save All ({previewCards.length})
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Recreate Card Modal */}
            {showRecreateModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 10000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '8px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        maxWidth: '520px',
                        width: '100%',
                        maxHeight: '80vh',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        border: '1px solid #EAEAEA'
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: '20px 24px 16px 24px',
                            borderBottom: '1px solid #EAEAEA'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <h3 style={{
                                        margin: 0,
                                        fontSize: '18px',
                                        fontWeight: '600',
                                        color: '#000000',
                                        letterSpacing: '-0.025em'
                                    }}>
                                        Improve Card
                                    </h3>
                                    <p style={{
                                        margin: '4px 0 0 0',
                                        fontSize: '14px',
                                        color: '#666666',
                                        fontWeight: '400'
                                    }}>
                                        Provide feedback to create a better version
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowRecreateModal(false)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '16px',
                                        color: '#999999',
                                        cursor: 'pointer',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = '#F5F5F5';
                                        e.currentTarget.style.color = '#666666';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.color = '#999999';
                                    }}
                                >
                                    <FaTimes />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{
                            padding: '24px',
                            flex: 1,
                            overflow: 'auto'
                        }}>
                            <textarea
                                value={recreateComments}
                                onChange={(e) => setRecreateComments(e.target.value)}
                                placeholder="Example: Make the question more specific, simplify the answer, add more context, focus on practical examples..."
                                style={{
                                    width: '100%',
                                    minHeight: '140px',
                                    padding: '16px',
                                    borderRadius: '6px',
                                    border: '1px solid #EAEAEA',
                                    backgroundColor: '#FAFAFA',
                                    fontSize: '14px',
                                    lineHeight: '1.6',
                                    resize: 'vertical',
                                    fontFamily: 'inherit',
                                    outline: 'none',
                                    transition: 'all 0.15s ease'
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = '#0070F3';
                                    e.currentTarget.style.backgroundColor = '#ffffff';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = '#EAEAEA';
                                    e.currentTarget.style.backgroundColor = '#FAFAFA';
                                }}
                            />
                            
                            <div style={{
                                marginTop: '16px',
                                padding: '12px 16px',
                                backgroundColor: '#F9F9F9',
                                borderRadius: '6px',
                                border: '1px solid #EAEAEA'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '6px',
                                    fontSize: '13px',
                                    color: '#666666',
                                    lineHeight: '1.5'
                                }}>
                                    <FaLightbulb size={14} style={{ color: '#999999', marginTop: '1px' }} />
                                    <span>Be specific about what you want to change for better results</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '20px 24px',
                            borderTop: '1px solid #EAEAEA',
                            backgroundColor: '#FAFAFA',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '8px'
                        }}>
                            <button
                                onClick={() => setShowRecreateModal(false)}
                                style={{
                                    backgroundColor: 'transparent',
                                    color: '#999999',
                                    border: 'none',
                                    padding: '8px 12px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    borderRadius: '5px'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.color = '#666666';
                                    e.currentTarget.style.backgroundColor = '#F5F5F5';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.color = '#999999';
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmRecreateCard}
                                disabled={loadingAccept}
                                style={{
                                    backgroundColor: loadingAccept ? '#F5F5F5' : '#000000',
                                    color: loadingAccept ? '#999999' : '#ffffff',
                                    border: 'none',
                                    borderRadius: '5px',
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: loadingAccept ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    opacity: loadingAccept ? 0.6 : 1
                                }}
                                onMouseOver={(e) => {
                                    if (!loadingAccept) {
                                        e.currentTarget.style.backgroundColor = '#333333';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (!loadingAccept) {
                                        e.currentTarget.style.backgroundColor = '#000000';
                                    }
                                }}
                            >
                                {loadingAccept ? (
                                    <>
                                        <Loader type="spinner" size="small" inline color="#999999" />
                                        Improving...
                                    </>
                                ) : (
                                    <>
                                        <FaEdit size={11} />
                                        Improve Card
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
            <style>
                {`
                    @keyframes shimmer {
                        0% {
                            left: -100%;
                        }
                        100% {
                            left: 100%;
                        }
                    }
                `}
            </style>
        </div>
    );
};



export default CreateCard;
