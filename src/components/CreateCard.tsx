import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTabAware } from './TabAwareProvider';

import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from "../store";
import { setBack, setExamples, setExamplesAudio, setExampleTranscriptions, setImage, setImageUrl, setTranslation, setText, loadStoredCards, setFront, setCurrentCardId, setLinguisticInfo, setTranscription, setWordAudio, saveAnkiCards } from "../store/actions/cards";
import { getDescriptionImage, isQuotaExceededCached, getCachedQuotaError, cacheQuotaExceededError, shouldShowQuotaNotification, markQuotaNotificationShown, formatOpenAIErrorMessage, getOpenAiSpeechAudioDataUrl } from "../services/openaiApi";
import { setMode, setTranslateToLanguage } from "../store/actions/settings";
import { Modes, OPENAI_TEXT_MODEL } from "../constants";
import DeckSelector from "./CreateCard/DeckSelector";
import LanguagePairBar from "./CreateCard/LanguagePairBar";
import DeckDestination from "./CreateCard/DeckDestination";
import RegenerateControl from "./CreateCard/RegenerateControl";
import GenerationChips from "./CreateCard/GenerationChips";
import StudyCard from "./StoredCards/StudyCard";
import { buildPreviewCard } from "./CreateCard/previewCard";
import CardFrontInput from "./CreateCard/CardFrontInput";
import Button from "./ui/Button";
import Textarea from "./ui/Textarea";
import Modal from "./ui/Modal";
import CardGenerationLoader from "./CreateCard/CardGenerationLoader";
import { ALL_LANGUAGES } from "../data/languages";
import { getPreferredAudioOnMode, getPreferredImageOnMode, setPreferredAudioOnMode, setPreferredImageOnMode } from "../services/generationPreferences";
import { type DetailedLoadingMessage } from '../services/loadingMessages';
import { setGlobalProgressCallback, getGlobalApiTracker, resetGlobalApiTracker } from '../services/apiTracker';
import { getImage } from '../apiUtils';
import { backgroundFetch } from '../services/backgroundFetch';
import useErrorNotification from './useErrorHandler';
import { FaLightbulb, FaMagic, FaTimes, FaList, FaFont, FaCheck, FaRobot, FaSave, FaEdit, FaKey, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { StoredCard } from '../store/reducers/cards';
import Loader from './Loader';
import { getAIService, getApiKeyForProvider, createTranslation, createExamples, createFlashcard, createOptimizedLinguisticInfo, createTranscription, createCardComponentsParallel, createLinguisticInfo } from '../services/aiServiceFactory';
import { planInstruction, CardAction } from '../services/instructionRouter';
import { ModelProvider } from '../store/reducers/settings';
import { createAIAgentService, PageContentContext } from '../services/aiAgentService';
import { imageUrlToBase64, getAnkiSaveErrorMessage, getAnkiSaveSuccessMessage, isAnkiDuplicateError } from '../services/ankiService';
import { requestPageContext, getActiveTabId } from '../services/pageContextBridge';
import { buildSafeImagePrompt } from '../services/imagePromptSafety';
import { consumePendingSelection, subscribeToPendingSelection } from '../services/pendingSelection';
import { SELECTION_CHANGED } from '../services/pageContextBridge';
import {
    formatTranscriptionHtml,
    shouldGenerateTranscription,
} from '../services/transcription';
import { generateAndValidateExampleTranscriptions } from '../services/exampleTranscriptions';

interface GeneralCardTemplate {
    id: string;
    name: string;
    description: string;
    icon: string;
    prompt: string;
}

const isDev = false;
const debugLog = (...args: unknown[]) => {
    if (isDev) {
        console.log(...args);
    }
};
const TEXT_SYNC_DEBOUNCE_MS = 120;
const PROGRESS_UPDATE_INTERVAL_MS = 120;

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
    const tabAware = useTabAware();

    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();

    // Helper function to update source language in Redux
    const updateSourceLanguage = useCallback((language: string) => {
        // Use direct action object instead of the action creator to fix type issues
        dispatch({ type: 'SET_SOURCE_LANGUAGE', payload: language });
        // Also save to localStorage
        localStorage.setItem('source_language', language);
    }, [dispatch]);

    const { text, translation, examples, examplesAudio, exampleTranscriptions, image, imageUrl, wordAudio, front, back, currentCardId, linguisticInfo, transcription, isGeneratingCard, tabId } = tabAware;
    const [textInputValue, setTextInputValue] = useState(text);
    const textInputValueRef = useRef(text);
    const textSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Tab-scoped localStorage helpers to avoid cross-tab leaks
    const getTabScopedLS = useCallback((key: string): string | null => {
        try {
            const tabKey = `${key}_${tabId}`;
            return localStorage.getItem(tabKey);
        } catch {
            return null;
        }
    }, [tabId]);
    const setTabScopedLS = useCallback((key: string, value: string) => {
        try {
            const tabKey = `${key}_${tabId}`;
            localStorage.setItem(tabKey, value);
        } catch { }
    }, [tabId]);
    const removeTabScopedLS = useCallback((key: string) => {
        try {
            localStorage.removeItem(`${key}_${tabId}`);
        } catch { }
    }, [tabId]);

    useEffect(() => {
        textInputValueRef.current = textInputValue;
    }, [textInputValue]);

    useEffect(() => {
        if (text === textInputValueRef.current) {
            return;
        }
        textInputValueRef.current = text;
        setTextInputValue(text);
    }, [text]);

    const flushTextInputSync = useCallback((value?: string) => {
        const nextValue = value ?? textInputValueRef.current;
        if (textSyncTimeoutRef.current) {
            clearTimeout(textSyncTimeoutRef.current);
            textSyncTimeoutRef.current = null;
        }
        if (nextValue !== text) {
            tabAware.setText(nextValue);
        }
    }, [tabAware, text]);

    const scheduleTextInputSync = useCallback((nextValue: string) => {
        textInputValueRef.current = nextValue;
        if (textSyncTimeoutRef.current) {
            clearTimeout(textSyncTimeoutRef.current);
        }
        textSyncTimeoutRef.current = setTimeout(() => {
            textSyncTimeoutRef.current = null;
            if (nextValue !== textInputValueRef.current) {
                return;
            }
            flushTextInputSync(nextValue);
        }, TEXT_SYNC_DEBOUNCE_MS);
    }, [flushTextInputSync]);

    useEffect(() => () => {
        if (textSyncTimeoutRef.current) {
            clearTimeout(textSyncTimeoutRef.current);
            textSyncTimeoutRef.current = null;
        }
        if (progressFlushTimeoutRef.current) {
            clearTimeout(progressFlushTimeoutRef.current);
            progressFlushTimeoutRef.current = null;
        }
    }, []);
    const translateToLanguage = useSelector((state: RootState) => state.settings.translateToLanguage);
    const transcriptionMode = useSelector((state: RootState) => state.settings.transcriptionMode);
    const transcriptionLanguage = useSelector(
        (state: RootState) => state.settings.transcriptionLanguage
    );
    const transcriptionExtraLanguages = useSelector(
        (state: RootState) => state.settings.transcriptionExtraLanguages
    );
    const exampleTranscriptionsEnabled = useSelector(
        (state: RootState) => state.settings.exampleTranscriptionsEnabled
    ) !== false;
    const aiInstructions = useSelector((state: RootState) => state.settings.aiInstructions);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const mode = useSelector((state: RootState) => state.settings.mode);
    const selectedBackendDeckId = useSelector((state: RootState) => state.settings.selectedBackendDeckId);
    const selectedAnkiDeckName = useSelector((state: RootState) => state.settings.selectedAnkiDeckName);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const autoSaveToServer = useSelector((state: RootState) => state.settings.autoSaveToServer);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const auth = useSelector((state: RootState) => state.auth);
    const isLoggedIn = !!auth.accessToken;
    const [originalSelectedText, setOriginalSelectedText] = useState('');
    // Text can arrive from the page without the user touching the panel. Saying so removes
    // the "where did this come from?" beat.
    const [cameFromSelection, setCameFromSelection] = useState(false);

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
        dispatch(setExamplesAudio([]));
        dispatch(setExampleTranscriptions([]));
        dispatch(setImage(null));
        dispatch(setImageUrl(null));
        dispatch(setLinguisticInfo(''));
        dispatch(setTranscription(''));
        dispatch(setWordAudio(null));
        dispatch(setCurrentCardId(null));

        // Reset general card state
        setShowResult(false);
        setIsMultipleCards(false);
        setCreatedCards([]);
        setCurrentCardIndex(0);

        // Clear API tracker state to prevent Language Learning UI from persisting
        resetGlobalApiTracker();
    }, [mode, dispatch]);

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
    const [loadingGetResult, setLoadingGetResult] = useState(false);
    const [loadingNewImage, setLoadingNewImage] = useState(false);
    const [loadingNewExamples, setLoadingNewExamples] = useState(false);
    const [loadingWordAudio, setLoadingWordAudio] = useState(false);
    const [loadingAccept, setLoadingAccept] = useState(false);
    const [currentLoadingMessage, setCurrentLoadingMessage] = useState<DetailedLoadingMessage | null>(null);
    const [currentProgress, setCurrentProgress] = useState({ completed: 0, total: 0 });
    const [isEdited, setIsEdited] = useState(false);
    // The result sheet opens as the card you will see once it is saved; this turns the
    // very same component into its editor rather than swapping in a different screen.
    const [isEditingResult, setIsEditingResult] = useState(false);
    const [elapsedTime, setElapsedTime] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const [forceHideLoader, setForceHideLoader] = useState(false);
    const [isNewSubmission, setIsNewSubmission] = useState(true);
    const [explicitlySaved, setExplicitlySaved] = useState(false);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const modelProvider = useSelector((state: RootState) => state.settings.modelProvider);
    const [shouldGenerateImage, setShouldGenerateImageState] = useState(true);
    const [imageGenerationMode, setImageGenerationModeState] = useState<'off' | 'smart' | 'always'>('smart');
    const [audioGenerationMode, setAudioGenerationModeState] = useState<'off' | 'smart' | 'always'>('smart');
    // Which "on" mode each chip returns to. Kept separate from the live mode so switching
    // a chip off and on again does not quietly demote 'always' to 'smart'.
    const [imageOnMode, setImageOnMode] = useState<'smart' | 'always'>(getPreferredImageOnMode);
    const [audioOnMode, setAudioOnMode] = useState<'smart' | 'always'>(getPreferredAudioOnMode);

    // Keep tab-level generation lock strictly in sync with loader visibility.
    // App uses this flag to hide Cards/Settings during loading overlay.
    useEffect(() => {
        if (loadingGetResult !== isGeneratingCard) {
            tabAware.setIsGeneratingCard(loadingGetResult);
        }
    }, [loadingGetResult, isGeneratingCard, tabAware]);

    const IMAGE_MODE_STORAGE_KEY = `anki_image_generation_mode_${tabId}`;
    const LEGACY_IMAGE_MODE_STORAGE_KEY = 'anki_image_generation_mode';
    const AUDIO_MODE_STORAGE_KEY = `anki_audio_generation_mode_${tabId}`;
    const LEGACY_AUDIO_MODE_STORAGE_KEY = 'anki_audio_generation_mode';
    const loadedImageModeTabsRef = useRef<Set<number>>(new Set());
    const loadedAudioModeTabsRef = useRef<Set<number>>(new Set());

    // Persist image generation mode changes
    useEffect(() => {
        if (!loadedImageModeTabsRef.current.has(tabId)) return;
        try {
            localStorage.setItem(IMAGE_MODE_STORAGE_KEY, imageGenerationMode);
            // Keep legacy key for restore when tab id changes after browser restart.
            localStorage.setItem(LEGACY_IMAGE_MODE_STORAGE_KEY, imageGenerationMode);
        } catch (error) {
            console.warn('Failed to persist image generation mode:', error);
        }
    }, [imageGenerationMode, IMAGE_MODE_STORAGE_KEY, tabId]);

    // Persist audio generation mode changes
    useEffect(() => {
        if (!loadedAudioModeTabsRef.current.has(tabId)) return;
        try {
            localStorage.setItem(AUDIO_MODE_STORAGE_KEY, audioGenerationMode);
            localStorage.setItem(LEGACY_AUDIO_MODE_STORAGE_KEY, audioGenerationMode);
        } catch (error) {
            console.warn('Failed to persist audio generation mode:', error);
        }
    }, [audioGenerationMode, AUDIO_MODE_STORAGE_KEY, tabId]);

    // Restore saved image generation mode on first mount
    useEffect(() => {
        if (loadedImageModeTabsRef.current.has(tabId)) return;
        loadedImageModeTabsRef.current.add(tabId);
        try {
            const savedMode = (
                localStorage.getItem(IMAGE_MODE_STORAGE_KEY) ||
                localStorage.getItem(LEGACY_IMAGE_MODE_STORAGE_KEY)
            ) as 'off' | 'smart' | 'always' | null;
            if (savedMode) {
                setImageGenerationModeState(savedMode);
                setShouldGenerateImageState(savedMode !== 'off');
                // Freeze inherited value for this tab to keep tab-local independence.
                localStorage.setItem(IMAGE_MODE_STORAGE_KEY, savedMode);
                // Adopt an existing choice as the restore point, so someone already on
                // 'always' is not silently moved to 'smart' the first time they toggle.
                if (savedMode !== 'off') {
                    setImageOnMode(savedMode);
                    setPreferredImageOnMode(savedMode);
                }
            }
        } catch (error) {
            console.warn('Failed to restore image generation mode:', error);
        }
    }, [IMAGE_MODE_STORAGE_KEY, tabId]);

    // Restore saved audio generation mode on first mount
    useEffect(() => {
        if (loadedAudioModeTabsRef.current.has(tabId)) return;
        loadedAudioModeTabsRef.current.add(tabId);
        try {
            const savedMode = (
                localStorage.getItem(AUDIO_MODE_STORAGE_KEY) ||
                localStorage.getItem(LEGACY_AUDIO_MODE_STORAGE_KEY)
            ) as 'off' | 'smart' | 'always' | null;
            if (savedMode) {
                setAudioGenerationModeState(savedMode);
                localStorage.setItem(AUDIO_MODE_STORAGE_KEY, savedMode);
                if (savedMode !== 'off') {
                    setAudioOnMode(savedMode);
                    setPreferredAudioOnMode(savedMode);
                }
            }
        } catch (error) {
            console.warn('Failed to restore audio generation mode:', error);
        }
    }, [AUDIO_MODE_STORAGE_KEY, tabId]);
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

    // (moved) Persist/restore of target language is placed after language list
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
    // Bumped at the start of every generation (and on cancel) so delayed loader-hiding
    // setTimeouts can tell whether they still belong to the generation that scheduled them.
    // abortControllerRef alone can't answer that: it gets nulled out synchronously in each
    // generation's own finally block, well before any of its delayed timeouts get a chance
    // to fire, so comparing against it would make those timeouts never fire at all.
    const generationIdRef = useRef(0);
    const criticalApiErrorRef = useRef(false);
    const lastProgressPaintRef = useRef(0);
    const pendingProgressRef = useRef<{ message: DetailedLoadingMessage; completed: number; total: number } | null>(null);
    const progressFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        if (progressFlushTimeoutRef.current) {
            clearTimeout(progressFlushTimeoutRef.current);
            progressFlushTimeoutRef.current = null;
        }
        pendingProgressRef.current = null;
        lastProgressPaintRef.current = 0;

        setGlobalProgressCallback(() => { });
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
            openAiKey
        ),
        [modelProvider, openAiKey]
    );

    const generateExampleTranscriptionsFor = useCallback(async (
        examplesToTranscribe: Array<[string, string | null]>,
        sourceLanguageCode: string | null | undefined,
        abortSignal?: AbortSignal
    ): Promise<Array<string | null>> => {
        const emptyResult = new Array(examplesToTranscribe.length).fill(null);
        if (
            !exampleTranscriptionsEnabled
            || transcriptionMode === 'off'
            || !apiKey
            || examplesToTranscribe.length === 0
        ) {
            return emptyResult;
        }

        const eligibleIndexes = examplesToTranscribe
            .map(([sentence], index) => (
                shouldGenerateTranscription(
                    sentence,
                    transcriptionMode,
                    sourceLanguageCode,
                    transcriptionExtraLanguages,
                )
                    ? index
                    : -1
            ))
            .filter((index) => index >= 0);

        if (eligibleIndexes.length === 0) {
            return emptyResult;
        }

        try {
            const generated = await generateAndValidateExampleTranscriptions(
                aiService,
                apiKey,
                eligibleIndexes.map((index) => examplesToTranscribe[index][0]),
                sourceLanguageCode
                    || 'unknown (infer only from the exact source examples)',
                transcriptionLanguage || 'en',
                abortSignal,
            );

            const result = [...emptyResult];
            eligibleIndexes.forEach((originalIndex, generatedIndex) => {
                result[originalIndex] = generated[generatedIndex] ?? null;
            });
            return result;
        } catch (error) {
            if ((error as Error)?.name === 'AbortError') throw error;
            console.debug('Example pronunciations unavailable:', error);
            return emptyResult;
        }
    }, [
        aiService,
        apiKey,
        exampleTranscriptionsEnabled,
        transcriptionExtraLanguages,
        transcriptionLanguage,
        transcriptionMode,
    ]);

    const providerDisplayName = 'OpenAI';
    const shortcutHint =
        typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
            ? '⌘↵'
            : 'Ctrl+↵';

    const notifyMissingApiKey = useCallback(() => {
        setShowMissingApiKeyNotice(true);
    }, []);

    const flushPendingProgressUpdate = useCallback(() => {
        if (progressFlushTimeoutRef.current) {
            clearTimeout(progressFlushTimeoutRef.current);
            progressFlushTimeoutRef.current = null;
        }

        const pending = pendingProgressRef.current;
        if (!pending) {
            return;
        }

        pendingProgressRef.current = null;
        lastProgressPaintRef.current = Date.now();
        setCurrentLoadingMessage(pending.message);
        setCurrentProgress({ completed: pending.completed, total: pending.total });
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

        const exactMatch = storedCards.find((card: StoredCard) => card.text === textToCheck);

        if (exactMatch) {
            debugLog('Found existing card with matching text:', exactMatch?.text || textToCheck, 'ID:', exactMatch.id);
            debugLog('Evaluating currentCardId sync for existing card:', {
                currentCardId,
                matchedId: exactMatch.id
            });

            // Only set the ID for reference, but DON'T mark as explicitly saved
            // This ensures "Saved to Collection" only appears after user explicitly saves
            if (currentCardId !== exactMatch.id) {
                debugLog('Syncing currentCardId to existing card ID');
                dispatch(setCurrentCardId(exactMatch.id));
            } else {
                debugLog('Skipping setCurrentCardId dispatch to prevent update loop');
            }

            // IMPORTANT: We do NOT set explicitlySaved to true here, as that would cause
            // the "Saved to Collection" message to appear prematurely
            return true;
        }

        return false;
    }, [dispatch, storedCards, currentCardId]);

    // Update the handle text change to check for existing cards
    const handleTextChange = (newText: string) => {
        setTextInputValue(newText);
        scheduleTextInputSync(newText);
        // Once the user types, the text is theirs — drop the "from your selection" badge.
        setCameFromSelection(false);

        // If the card is already marked as saved, check if it's being edited
        if (isSaved) {
            setIsEdited(true);
        } else {
            // Check if this text already exists as a card
            checkExistingCard(newText);
        }
    };

    // The studied word is `front` for language cards and for general ones alike; `text`
    // follows it so the card keeps one headword however it was made.
    const handleFrontUpdate = (newFront: string) => {
        tabAware.setFront(newFront);
        if (mode === Modes.LanguageLearning) {
            tabAware.setText(newFront);
        }
        if (isSaved) {
            setIsEdited(true);
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
        const nextExamplesAudio = normalizeExamplesAudioFor(newExamples, examples, examplesAudio || []);
        const nextExampleTranscriptions = newExamples.map((example, index) =>
            examples[index]?.[0] === example[0]
                ? exampleTranscriptions?.[index] ?? null
                : null
        );
        tabAware.setExamples(newExamples);
        tabAware.setExamplesAudio(nextExamplesAudio);
        tabAware.setExampleTranscriptions(nextExampleTranscriptions);
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

            const descriptionImage = await aiService.getDescriptionImage(
                apiKey,
                text,
                imageInstructions,
                abortControllerRef.current?.signal,
                sourceLanguage || undefined
            );
            const safeDescriptionImage = buildSafeImagePrompt(text, descriptionImage);

            // Image generation is handled via OpenAI even when another provider is used for text.
            if (openAiKey) {
                const { imageUrl, imageBase64 } = await getImage(openAiKey, safeDescriptionImage, imageInstructions, sourceLanguage || undefined);

                if (imageUrl) {
                    tabAware.setImageUrl(imageUrl);
                }
                if (imageBase64) {
                    tabAware.setImage(imageBase64);
                }
            } else {
                showError("OpenAI API key is required for image generation.");
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

    const generateWordAudioData = useCallback(async (studiedWord: string, abortSignal?: AbortSignal): Promise<string | null> => {
        if (!studiedWord.trim() || !openAiKey) return null;
        return getOpenAiSpeechAudioDataUrl(
            openAiKey,
            studiedWord.trim(),
            undefined,
            abortSignal
        );
    }, [openAiKey]);

    const shouldAutoGenerateExamplesAudioForMode = useCallback((
        mode: 'off' | 'smart' | 'always',
        studiedWord: string
    ): boolean => {
        if (mode === 'off') return false;
        if (mode === 'always') return true;
        const normalized = (studiedWord || '').trim();
        if (!normalized) return false;
        if (/[\n\r]/.test(normalized)) return false;
        if (/[{}<>_=^`~\\]/.test(normalized)) return false;
        if (/\d{3,}/.test(normalized)) return false;
        const words = normalized.split(/\s+/).filter(Boolean);
        if (words.length === 0 || words.length > 5) return false;
        return true;
    }, []);

    const generateExamplesAudioBatch = useCallback(async (
        examplesToVoice: Array<[string, string | null]>,
        baseAudio: Array<string | null>,
        abortSignal?: AbortSignal
    ): Promise<Array<string | null>> => {
        const nextAudio = Array.from({ length: examplesToVoice.length }, (_v, i) => baseAudio[i] ?? null);
        const missingIndexes = examplesToVoice
            .map((_example, index) => index)
            .filter((index) => !nextAudio[index] && examplesToVoice[index]?.[0]?.trim());

        if (!missingIndexes.length) {
            return nextAudio;
        }

        const generationResults = await Promise.allSettled(
            missingIndexes.map(async (index) => ({
                index,
                audioDataUrl: await generateWordAudioData(examplesToVoice[index][0], abortSignal),
            }))
        );

        generationResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.audioDataUrl) {
                nextAudio[result.value.index] = result.value.audioDataUrl;
            }
        });

        return nextAudio;
    }, [generateWordAudioData]);

    const normalizeExamplesAudioFor = useCallback((
        nextExamples: Array<[string, string | null]>,
        prevExamples: Array<[string, string | null]>,
        prevAudio: Array<string | null>
    ): Array<string | null> => {
        return nextExamples.map((examplePair, index) => {
            const previousPair = prevExamples[index];
            if (!previousPair) return null;
            if (previousPair[0] !== examplePair[0]) return null;
            return prevAudio[index] ?? null;
        });
    }, []);

    const handleGenerateAudio = async () => {
        const studiedWord = (originalSelectedText || text || front || '').trim();
        const hasWordToGenerate = !!studiedWord && !wordAudio;
        const hasExamplesToGenerate = examples.some((example, index) => !examplesAudio?.[index] && example?.[0]?.trim());

        if (!hasWordToGenerate && !hasExamplesToGenerate) {
            return;
        }

        if (!openAiKey) {
            showError('OpenAI API key is required to generate audio', 'warning');
            return;
        }

        try {
            setLoadingWordAudio(true);
            const tasks: Array<Promise<void>> = [];

            if (hasWordToGenerate) {
                tasks.push((async () => {
                    const audioDataUrl = await generateWordAudioData(studiedWord, abortControllerRef.current?.signal);
                    if (audioDataUrl) {
                        tabAware.setWordAudio(audioDataUrl);
                    }
                })());
            }

            if (hasExamplesToGenerate) {
                tasks.push((async () => {
                    const nextExamplesAudio = await generateExamplesAudioBatch(
                        examples,
                        Array.from({ length: examples.length }, (_v, i) => examplesAudio?.[i] ?? null),
                        abortControllerRef.current?.signal
                    );
                    tabAware.setExamplesAudio(nextExamplesAudio);
                })());
            }

            await Promise.all(tasks);

            if (isSaved) {
                setIsEdited(true);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to generate audio';
            console.error('Error generating audio:', error);
            showError(message, 'error');
            handlePotentialApiKeyIssue(message);
        } finally {
            setLoadingWordAudio(false);
        }
    };

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
                tabAware.setExamplesAudio(new Array(formattedExamples.length).fill(null));
                tabAware.setExampleTranscriptions(
                    await generateExampleTranscriptionsFor(
                        formattedExamples,
                        textLanguage,
                        abortControllerRef.current?.signal,
                    )
                );
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

    const handleApplyCustomInstruction = async (instructionArg?: string) => {
        const instruction = (instructionArg ?? '').trim();
        if (!instruction || isProcessingCustomInstruction) {
            return;
        }

        setIsProcessingCustomInstruction(true);

        try {
            const detectedOrManual = isAutoDetectLanguage ? (detectedLanguage || null) : (sourceLanguage || null);
            // The model works out which parts of the card the request touches. Keyword
            // lists could only ever match the phrasings and languages someone enumerated.
            const plan = await planInstruction(aiService, apiKey, instruction, {
                word: text,
                hasImage: Boolean(imageUrl || image),
                language: translateToLanguage,
            });
            const wants = (action: CardAction) => plan.actions.includes(action);

            if (!wants('rebuild')) {
                if (wants('image')) {
                    const descriptionImage = await getDescriptionImage(openAiKey, text, plan.detail, undefined, sourceLanguage || undefined);
                    const safeDescriptionImage = buildSafeImagePrompt(text, descriptionImage);
                    const { imageUrl: newImageUrl, imageBase64 } = await getImage(openAiKey, safeDescriptionImage, plan.detail, sourceLanguage || undefined);

                    if (newImageUrl) {
                        tabAware.setImageUrl(newImageUrl);
                    }
                    if (imageBase64) {
                        tabAware.setImage(imageBase64);
                    }
                }

                if (wants('examples')) {
                    debugLog('📚 Starting examples generation...');
                    const newExamplesResult = await createExamples(
                        aiService,
                        apiKey,
                        text,
                        translateToLanguage,
                        true,
                        plan.detail,
                        detectedOrManual || undefined,
                        abortControllerRef.current?.signal
                    );
                    const newExamples = newExamplesResult.map(ex => [ex.original, ex.translated] as [string, string | null]);
                    debugLog('📚 Examples generation completed');
                    tabAware.setExamples(newExamples);
                    tabAware.setExamplesAudio(new Array(newExamples.length).fill(null));
                    tabAware.setExampleTranscriptions(
                        await generateExampleTranscriptionsFor(
                            newExamples,
                            detectedOrManual,
                            abortControllerRef.current?.signal,
                        )
                    );
                }

                if (wants('translation')) {
                    const translation = await createTranslation(
                        aiService,
                        apiKey,
                        text,
                        translateToLanguage,
                        plan.detail,
                        detectedOrManual || undefined,
                        abortControllerRef.current?.signal
                    );
                    if (translation && translation.translated) {
                        tabAware.setTranslation(translation.translated);
                    }
                }

                if (wants('grammar')) {
                    const linguisticInfo = await createLinguisticInfo(
                        aiService,
                        apiKey,
                        text,
                        detectedOrManual || '',
                        translateToLanguage
                    );
                    if (linguisticInfo) {
                        tabAware.setLinguisticInfo(linguisticInfo);
                    }
                }

                if (wants('audio') && openAiKey) {
                    const wordAudioData = await generateWordAudioData(text, abortControllerRef.current?.signal);
                    if (wordAudioData) {
                        tabAware.setWordAudio(wordAudioData);
                    }
                    if (examples.length > 0) {
                        const examplesAudioData = await generateExamplesAudioBatch(
                            examples,
                            new Array(examples.length).fill(null),
                            abortControllerRef.current?.signal
                        );
                        tabAware.setExamplesAudio(examplesAudioData);
                    }
                }
            } else {
                // A broad ask ("make it simpler") — rebuild every part in parallel.
                debugLog('🚀 Using parallel update for custom instruction...');

                // A card that already has a picture keeps one after the rebuild; otherwise
                // the user's configured image/audio modes are left exactly as they are.
                const hasPicture = Boolean(imageUrl || image);
                const needsAudio = audioGenerationMode !== 'off';

                const result = await createCardComponentsParallel(
                    aiService,
                    apiKey,
                    text,
                    translateToLanguage,
                    plan.detail,
                    detectedOrManual || undefined,
                    hasPicture || shouldGenerateImage,
                    abortControllerRef.current?.signal,
                    hasPicture ? 'always' : imageGenerationMode,
                    needsAudio,
                    audioGenerationMode,
                    openAiKey,
                    generateWordAudioData,
                    {
                        mode: transcriptionMode,
                        language: transcriptionLanguage,
                        extraLanguages: transcriptionExtraLanguages,
                    }
                );

                if (result.translation?.translated) {
                    tabAware.setTranslation(result.translation.translated);
                }

                let formattedExamples: Array<[string, string | null]> = [];
                if (result.examples) {
                    formattedExamples = result.examples.map(ex => [ex.original, ex.translated] as [string, string | null]);
                    tabAware.setExamples(formattedExamples);
                    tabAware.setExamplesAudio(new Array(formattedExamples.length).fill(null));
                    tabAware.setExampleTranscriptions(
                        await generateExampleTranscriptionsFor(
                            formattedExamples,
                            detectedOrManual,
                            abortControllerRef.current?.signal,
                        )
                    );
                }

                if (result.imageUrl) {
                    tabAware.setImageUrl(result.imageUrl);
                    // Base64 is usually handled by getImage in the UI, but createCardComponentsParallel returns URL
                    // If we need base64, we might need an extra step or integrate into createCardComponentsParallel
                }

                if (result.wordAudio) {
                    tabAware.setWordAudio(result.wordAudio);
                }

                if (formattedExamples.length > 0) {
                    // Respect the configured mode: "smart" must stay smart, not become "always".
                    const studiedWordForAudio = (result.flashcard?.front || text || '').trim();
                    if (openAiKey && shouldAutoGenerateExamplesAudioForMode(audioGenerationMode, studiedWordForAudio)) {
                        try {
                            const examplesAudioData = await generateExamplesAudioBatch(
                                formattedExamples,
                                new Array(formattedExamples.length).fill(null),
                                abortControllerRef.current?.signal
                            );
                            tabAware.setExamplesAudio(examplesAudioData);
                        } catch (examplesAudioError) {
                            console.warn('Examples audio generation skipped due to error:', examplesAudioError);
                        }
                    }
                }

                if (result.linguisticInfo) {
                    tabAware.setLinguisticInfo(result.linguisticInfo);
                }

                if (result.transcription) {
                    const transcriptionHtml = formatTranscriptionHtml(
                        result.transcription,
                        transcriptionLanguage,
                    );

                    if (transcriptionHtml) {
                        tabAware.setTranscription(transcriptionHtml);
                    }
                }

                if (result.flashcard?.front) {
                    tabAware.setFront(result.flashcard.front);
                    if (result.translation?.translated) {
                        tabAware.setBack(result.translation.translated);
                    }
                }
            }

            // Clear the instruction after applying

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
            const instructionError = error instanceof Error ? error.message : "Failed to apply custom instructions";
            showError(instructionError);
            handlePotentialApiKeyIssue(instructionError);
        } finally {
            debugLog('📝 Custom instruction processing completed');
            setIsProcessingCustomInstruction(false);
        }
    };

    // Function to determine if image generation is available for the current provider
    const isImageGenerationAvailable = () => {
        return !!openAiKey;
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
                    transcription: transcription || '',
                    wordAudio: wordAudio || null,
                    examplesAudio: examplesAudio || [],
                    exampleTranscriptions: exampleTranscriptions || [],
                    deckId: selectedBackendDeckId,
                    ankiDeckName: selectedAnkiDeckName
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

                    const normalized = await normalizeImageForStorage(card.image ?? null, card.imageUrl ?? null);
                    const cardToPersist = {
                        ...card,
                        image: normalized.image,
                        imageUrl: normalized.imageUrl
                    };
                    cardsToSave[i] = cardToPersist;

                    // Check if this card already exists in storage by ID only
                    const existingCardIndex = storedCards.findIndex(
                        (storedCard) => storedCard.id === cardToPersist.id
                    );

                    if (existingCardIndex === -1) {
                        // Card is not saved yet
                        tabAware.saveCardToStorage(cardToPersist);
                        savedCards++;

                        // Add to our explicitly saved IDs list
                        newExplicitlySavedIds.push(cardToPersist.id);
                        debugLog(`Card #${i} (${cardToPersist.id}) saved as new`);

                        successCount++;
                    } else {
                        debugLog(`Card #${i} (${cardToPersist.id}) already in storage, updating`);
                        // Update existing card
                        tabAware.updateStoredCard(cardToPersist);
                        updatedCards++;

                        // Add to our explicitly saved IDs list
                        newExplicitlySavedIds.push(cardToPersist.id);

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
            setTabScopedLS('explicitly_saved', 'true');

            // Also update the currentCardId to match current card
            const currentCard = cardsToSave[currentCardIndex];
            if (currentCard && currentCard.id) {
                dispatch(setCurrentCardId(currentCard.id));
                setTabScopedLS('current_card_id', currentCard.id);
            }

            if (errorCount === 0) {
                // Удалили навязчивое success уведомление
            } else {
                showError(`Saved ${successCount} cards, ${errorCount} failed.`, 'warning');
            }

            // Update UI
            setIsEdited(false);
            setIsNewSubmission(false);

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
                    imageUrl: normalizedCurrent.imageUrl,
                    deckId: selectedBackendDeckId,
                    ankiDeckName: selectedAnkiDeckName
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

                // Set current card's ID for reference
                tabAware.setCurrentCardId(cardToPersist.id);
                setTabScopedLS('current_card_id', cardToPersist.id);

                // Update UI state for the current card only
                setExplicitlySaved(true);
                setTabScopedLS('explicitly_saved', 'true');
                setIsEdited(false);
                // showError('Card saved successfully!', 'success'); // Убрали уведомление

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
                    wordAudio: wordAudio || null,
                    examplesAudio: examplesAudio || [],
                    exampleTranscriptions: exampleTranscriptions || [],
                    // ИСПРАВЛЕНО: Сохраняем изображения с приоритетом на base64
                    image: normalizedImage, // base64 данные (постоянные, приоритет)
                    imageUrl: normalizedImageUrl, // URL как резерв
                    createdAt: new Date(),
                    exportStatus: 'not_exported' as const,
                    deckId: selectedBackendDeckId,
                    ankiDeckName: selectedAnkiDeckName
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

                // New logic: Automatic sync to Anki if logged out
                if (useAnkiConnect && selectedAnkiDeckName) {
                    debugLog('Automatic sync to Anki (logged out flow):', selectedAnkiDeckName);
                    try {
                        const cardToSave = cardData as any;
                        const ankiCard = {
                            text: cardToSave.text,
                            translation: cardToSave.translation,
                            examples: cardToSave.examples,
                            image_base64: cardToSave.image,
                            linguisticInfo: cardToSave.linguisticInfo,
                            transcription: cardToSave.transcription,
                            word_audio_base64: cardToSave.wordAudio,
                            examples_audio_base64: cardToSave.examplesAudio,
                            example_transcriptions: cardToSave.exampleTranscriptions,
                        };

                        await dispatch(saveAnkiCards(
                            mode,
                            ankiConnectUrl,
                            ankiConnectApiKey,
                            selectedAnkiDeckName,
                            'Basic', // Fallback model
                            [ankiCard as any]
                        ));
                        // Mark as exported
                        tabAware.updateCardExportStatus(cardId, 'exported');
                        showError(getAnkiSaveSuccessMessage(1), 'success');
                    } catch (ankiErr) {
                        showError(
                            getAnkiSaveErrorMessage(ankiErr),
                            isAnkiDuplicateError(ankiErr) ? 'warning' : 'error'
                        );
                    }
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
                    wordAudio: wordAudio || null,
                    examplesAudio: examplesAudio || [],
                    exampleTranscriptions: exampleTranscriptions || [],
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

                // New logic: Automatic sync to Anki if logged out
                if (useAnkiConnect && selectedAnkiDeckName) {
                    debugLog('Automatic sync to Anki (logged out flow):', selectedAnkiDeckName);
                    try {
                        const cardToSave = cardData as any;
                        const ankiCard = {
                            text: cardToSave.text,
                            front: cardToSave.front,
                            back: cardToSave.back,
                            image_base64: cardToSave.image
                        };

                        await dispatch(saveAnkiCards(
                            mode,
                            ankiConnectUrl,
                            ankiConnectApiKey,
                            selectedAnkiDeckName,
                            'Basic', // Fallback model
                            [ankiCard as any]
                        ));
                        // Mark as exported
                        tabAware.updateCardExportStatus(cardId, 'exported');
                        showError(getAnkiSaveSuccessMessage(1), 'success');
                    } catch (ankiErr) {
                        showError(
                            getAnkiSaveErrorMessage(ankiErr),
                            isAnkiDuplicateError(ankiErr) ? 'warning' : 'error'
                        );
                    }
                }

            }

            // Important: When the user explicitly saves the card, mark it as explicitly saved
            // and store this state in localStorage
            setExplicitlySaved(true);
            setTabScopedLS('explicitly_saved', 'true');

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

    // Используем useCallback для стабильной ссылки на функцию обработки выделения
    const handleTextSelection = useCallback((selectedText: string) => {
        if (!selectedText || selectedText === text) {
            return;
        }

        debugLog('Text selection handled for tab-specific state:', selectedText);

        // Принудительно закрываем модальное окно перед анализом нового текста
        setShowTextOptionsModal(false);

        // Сначала очищаем предыдущие выбранные опции и список опций
        setSelectedOptionsMap({});
        setSelectedTextOptions([]);

        // Устанавливаем выделенный текст через tabAware (tab-specific)
        tabAware.setText(selectedText);
        setCameFromSelection(true);

        // Логируем для отладки
        debugLog('Text set via tabAware.setText:', selectedText);
    }, [tabAware, text]);

    // The panel has no access to the page, so the content script reports selections and the
    // context menu / shortcut park theirs in storage. Both funnel into handleTextSelection.
    useEffect(() => {
        const drain = () => {
            void consumePendingSelection().then((parked) => {
                if (parked) {
                    handleTextSelection(parked);
                }
            });
        };

        drain();
        const unsubscribe = subscribeToPendingSelection(drain);

        const onMessage = (message: any) => {
            if (message?.action === SELECTION_CHANGED && message.text) {
                handleTextSelection(message.text);
            }
        };
        chrome.runtime.onMessage.addListener(onMessage);

        return () => {
            unsubscribe();
            chrome.runtime.onMessage.removeListener(onMessage);
        };
    }, [handleTextSelection]);

    useEffect(() => {
        // Always enforce Language Learning mode and update persisted selection
        localStorage.setItem('selected_mode', Modes.LanguageLearning);
        if (mode !== Modes.LanguageLearning) {
            dispatch(setMode(Modes.LanguageLearning));
        }

        if (text && translation && examples.length > 0) {
            setShowResult(true);
        } else {
            setShowResult(false);
        }

        // Load stored cards from localStorage on initial load
        if (!storedCards.length) {
            dispatch(loadStoredCards(tabId));
        }
    }, [dispatch, mode, storedCards.length, tabId]);

    // Ensure cards load correctly on page refresh, and check saved status before showing UI
    const hasRestoredCardOnMountRef = useRef(false);
    useEffect(() => {
        if (hasRestoredCardOnMountRef.current) {
            return;
        }

        const savedCardId = getTabScopedLS('current_card_id');
        const explicitlySavedFlag = getTabScopedLS('explicitly_saved');

        if (!savedCardId) {
            hasRestoredCardOnMountRef.current = true;
            debugLog('No current card ID in localStorage');
            setIsNewSubmission(true);
            setExplicitlySaved(false);
            return;
        }

        // Wait until stored cards are present in Redux; avoid direct heavy localStorage parse.
        if (!storedCards.length) {
            return;
        }

        const savedCard = storedCards.find((card: StoredCard) => card.id === savedCardId);
        if (savedCard) {
            debugLog('Restoring card from Redux storage:', savedCard.id);
            setIsEdited(false);
            setIsNewSubmission(false);
            setExplicitlySaved(explicitlySavedFlag === 'true');

            tabAware.setCurrentCardId(savedCardId);
            tabAware.setText(savedCard.text);
            if (savedCard.translation) tabAware.setTranslation(savedCard.translation);
            if (savedCard.examples) tabAware.setExamples(savedCard.examples);
            tabAware.setExamplesAudio(savedCard.examplesAudio ?? []);
            tabAware.setExampleTranscriptions(savedCard.exampleTranscriptions ?? []);
            if (savedCard.image) tabAware.setImage(savedCard.image);
            if (savedCard.imageUrl) tabAware.setImageUrl(savedCard.imageUrl);
            if (savedCard.front) tabAware.setFront(savedCard.front);
            if (savedCard.back) tabAware.setBack(savedCard.back);
            if (savedCard.linguisticInfo) tabAware.setLinguisticInfo(savedCard.linguisticInfo);
            if (savedCard.transcription) tabAware.setTranscription(savedCard.transcription);
            tabAware.setWordAudio(savedCard.wordAudio ?? null);
            setOriginalSelectedText(savedCard.text);
            setShowResult(true);
        } else {
            debugLog('Card ID from localStorage not found in Redux storage, resetting');
            removeTabScopedLS('current_card_id');
            removeTabScopedLS('explicitly_saved');
            tabAware.setCurrentCardId(null);
            tabAware.setWordAudio(null);
            tabAware.setExamplesAudio([]);
            tabAware.setExampleTranscriptions([]);
            setIsNewSubmission(true);
            setExplicitlySaved(false);
        }

        hasRestoredCardOnMountRef.current = true;
    }, [storedCards, getTabScopedLS, removeTabScopedLS, tabAware]);

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
            removeTabScopedLS('explicitly_saved');
        }

        // Check if the card already exists in storage
        checkExistingCard(text);

    }, [text, currentCardId, isNewSubmission, showResult, checkExistingCard]);

    // One button drives both modes now, so the composer does not have to know which
    // handler the current mode wants.
    const handlePrimaryAction = () => {
        if (loadingGetResult || textInputValueRef.current.trim() === '') return;
        if (mode === Modes.GeneralTopic) {
            void handleCreateAICards();
            return;
        }
        void handleSubmit();
    };

    // Ctrl/Cmd+Enter submits from inside the textarea; plain Enter still adds a newline.
    const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            handlePrimaryAction();
        }
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const currentText = textInputValueRef.current.trim();
        if (!currentText) return;
        flushTextInputSync(textInputValueRef.current);

        let detectedLanguageForSubmit = detectedLanguage;

        if (isAutoDetectLanguage) {
            try {
                const detectionResult = await detectLanguage(currentText);
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
        // Delayed loader-hiding callbacks below compare against this to tell "cancelled/
        // superseded by a newer generation" apart from "still the active generation".
        generationIdRef.current += 1;
        const myGenerationId = generationIdRef.current;

        // Set card generation state to true to disable navigation buttons
        tabAware.setIsGeneratingCard(true);

        // IMPORTANT: Explicitly clear saved state when creating a new card
        setExplicitlySaved(false);
        removeTabScopedLS('explicitly_saved');

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
        } else if (originalSelectedText !== currentText) {
            // If the text has changed significantly from the original, clear old images
            debugLog('Text has changed, clearing existing images for new generation');
            tabAware.setImage(null);
            tabAware.setImageUrl(null);
        }

        // Only clear linguistic info and transcription as they are text-specific
        tabAware.setLinguisticInfo("");
        tabAware.setTranscription('');
        tabAware.setWordAudio(null);

        setForceHideLoader(false);
        setLoadingGetResult(true);
        setCurrentLoadingMessage(null);

        // Reset global API tracker and set progress callback
        const globalTracker = getGlobalApiTracker();
        globalTracker.reset();
        lastProgressPaintRef.current = 0;
        pendingProgressRef.current = null;

        setGlobalProgressCallback((update) => {
            if (criticalApiErrorRef.current) {
                return;
            }
            pendingProgressRef.current = {
                message: update.message,
                completed: update.completed,
                total: update.total,
            };

            const now = Date.now();
            const elapsed = now - lastProgressPaintRef.current;

            if (elapsed >= PROGRESS_UPDATE_INTERVAL_MS) {
                flushPendingProgressUpdate();
                return;
            }

            if (!progressFlushTimeoutRef.current) {
                progressFlushTimeoutRef.current = setTimeout(
                    flushPendingProgressUpdate,
                    PROGRESS_UPDATE_INTERVAL_MS - elapsed
                );
            }

            // REMOVED: Auto-hide logic moved to finally block to prevent conflicts
            // The loading will be hidden in the finally block of the main function
        });

        setOriginalSelectedText(currentText);

        // Clear any previous errors
        showError(null);

        try {
            // Debug logging
            debugLog("=== DEBUG INFO ===");
            debugLog("Model Provider:", modelProvider);
            debugLog("API Key available:", Boolean(apiKey));
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
                        pageContext = (await requestPageContext(await getActiveTabId(), currentText)) ?? undefined;
                        debugLog(`📋 General mode: Extracted page context with ${pageContext?.pageImages?.length || 0} images`);
                    } catch (extractError) {
                        console.warn('Failed to extract page content for General mode:', extractError);
                        pageContext = undefined;
                    }

                    // Create AI Agent Service instance
                    const aiAgentService = createAIAgentService(aiService, apiKey);

                    // Use fast AI agent workflow for complete cards
                    const createdCards = await aiAgentService.createCardsFromTextFast(currentText, pageContext, abortSignal);

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
                    const flashcardResult = await createFlashcard(aiService, apiKey, currentText, abortSignal);

                    if (flashcardResult && flashcardResult.front) {
                        tabAware.setFront(flashcardResult.front);
                    }
                }

                // For General mode, we're done - return early
                setExplicitlySaved(false);
                removeTabScopedLS('explicitly_saved');
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
                currentText,
                translateToLanguage,
                aiInstructions,
                sourceLanguageForSubmit || undefined,
                shouldGenerateImage,
                abortSignal,
                imageGenerationMode,
                audioGenerationMode !== 'off',
                audioGenerationMode,
                openAiKey,
                generateWordAudioData,
                {
                    mode: transcriptionMode,
                    language: transcriptionLanguage,
                    extraLanguages: transcriptionExtraLanguages,
                }
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
                linguisticInfo: false,
                transcription: false
            };
            let translationErrorMessage: string | null = null;
            let hadCriticalApiKeyError = false;

            // Устанавливаем полученные результаты
            if (result.translation?.translated) {
                tabAware.setTranslation(result.translation.translated);
                completedOperations.translation = true;
            }

            let formattedExamples: Array<[string, string | null]> = [];
            if (result.examples && result.examples.length > 0) {
                formattedExamples = result.examples.map(example =>
                    [example.original, example.translated] as [string, string | null]
                );
                tabAware.setExamples(formattedExamples);
                tabAware.setExamplesAudio(new Array(formattedExamples.length).fill(null));
                tabAware.setExampleTranscriptions(
                    await generateExampleTranscriptionsFor(
                        formattedExamples,
                        sourceLanguageForSubmit,
                        abortSignal,
                    )
                );
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

            if (result.wordAudio) {
                tabAware.setWordAudio(result.wordAudio);
            }

            // Устанавливаем транскрипцию, если доступна
            if (result.transcription) {
                try {
                    const transcriptionHtml = formatTranscriptionHtml(
                        result.transcription,
                        transcriptionLanguage,
                    );

                    if (transcriptionHtml) {
                        tabAware.setTranscription(transcriptionHtml);
                        completedOperations.transcription = true;
                    }
                } catch (e) {
                    console.warn('Failed to format transcription result:', e);
                }
            }

            // Обработка ошибок
            if (result.errors.length > 0) {
                console.warn('Some components failed:', result.errors);

                // Показываем предупреждения для неудачных компонентов
                for (const error of result.errors) {
                    const rawError = error.error as unknown;
                    const detailsMessage = typeof rawError === 'string'
                        ? rawError
                        : rawError
                            ? JSON.stringify(rawError)
                            : '';
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

            // Optional audio generation based on selected audio mode
            if (audioGenerationMode !== 'off' && openAiKey) {
                const studiedWord = (result.flashcard?.front && result.flashcard.front.trim())
                    ? result.flashcard.front.trim()
                    : (text || '').trim();

                if (studiedWord) {
                    const smartAudioDecision = shouldGenerateAudioForText(studiedWord);
                    const shouldGenerateAudioNow = audioGenerationMode === 'always' || smartAudioDecision.shouldGenerate;
                    const audioTasks: Array<Promise<void>> = [];

                    if (shouldGenerateAudioNow && !result.wordAudio) {
                        audioTasks.push((async () => {
                            try {
                                const audioDataUrl = await generateWordAudioData(studiedWord, abortSignal);
                                if (audioDataUrl) {
                                    tabAware.setWordAudio(audioDataUrl);
                                }
                            } catch (audioError) {
                                console.warn('Audio generation skipped due to error:', audioError);
                            }
                        })());
                    }

                    if (formattedExamples.length > 0 && shouldGenerateAudioNow) {
                        audioTasks.push((async () => {
                            try {
                                const examplesAudioData = await generateExamplesAudioBatch(
                                    formattedExamples,
                                    new Array(formattedExamples.length).fill(null),
                                    abortSignal
                                );
                                tabAware.setExamplesAudio(examplesAudioData);
                            } catch (examplesAudioError) {
                                console.warn('Examples audio generation skipped due to error:', examplesAudioError);
                            }
                        })());
                    }

                    await Promise.all(audioTasks);
                }
            }

            // If the parallel pronunciation pass returned no validated fields, retry while
            // the card loader is still visible. Previously this retry ran in the background
            // after the modal opened, so a perfectly valid late result looked like a missing
            // feature (and could be missed entirely if the user saved the card immediately).
            const studiedWordForTranscription =
                (result.flashcard?.front && result.flashcard.front.trim())
                    ? result.flashcard.front.trim()
                    : currentText;
            if (
                !completedOperations.transcription
                && shouldGenerateTranscription(
                    studiedWordForTranscription,
                    transcriptionMode,
                    sourceLanguageForSubmit,
                    transcriptionExtraLanguages,
                )
            ) {
                try {
                    const sourceLangForPron =
                        sourceLanguageForSubmit
                        || 'unknown (infer only from the exact study target)';
                    if (studiedWordForTranscription && transcriptionLanguage) {
                        const aiAgentService = createAIAgentService(aiService, apiKey);
                        debugLog(`🔤 Pronunciation Agent (recovery): generating for "${studiedWordForTranscription}" (${sourceLangForPron} -> ${transcriptionLanguage})`);
                        const pronunciationHtml = await aiAgentService.generatePronunciationHtml(
                            studiedWordForTranscription,
                            sourceLangForPron,
                            transcriptionLanguage,
                        );

                        if (
                            abortSignal.aborted
                            || generationIdRef.current !== myGenerationId
                        ) {
                            debugLog('🔤 Pronunciation Agent (recovery): stale result ignored');
                            return;
                        }

                        if (pronunciationHtml) {
                            tabAware.setTranscription(pronunciationHtml);
                            completedOperations.transcription = true;
                            debugLog('🔤 Pronunciation Agent (recovery): transcription set');
                        } else {
                            console.debug('Pronunciation Agent recovery returned no validated fields');
                        }
                    }
                } catch (error) {
                    if (!abortSignal.aborted) {
                        console.debug('Pronunciation Agent recovery unavailable:', error);
                    }
                }
            }

            debugLog('Parallel card creation completed with:', completedOperations);

            // Clear saved flags BEFORE showing result to prevent UI flicker
            setExplicitlySaved(false);
            removeTabScopedLS('explicitly_saved');
            // Показываем результат только если есть перевод
            setShowResult(true);

            debugLog('Setting showResult to true after successful parallel card creation');

            // Generate a unique ID for this card
            const cardId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            tabAware.setCurrentCardId(cardId);

            debugLog('Created card with ID:', cardId);

            // Show modal if we have at least some data
            if (completedOperations.translation) {
                setShowModal(true);
                setIsNewSubmission(true);

                // Hide loading when content is ready and visible
                setTimeout(() => {
                    // A newer generation may have started (or this one may have been
                    // cancelled) while this delay was pending — don't let a stale timeout
                    // hide the loader out from under a different generation cycle.
                    if (generationIdRef.current !== myGenerationId) return;
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
                setLoadingGetResult(false);
                setCurrentLoadingMessage(null);
                setCurrentProgress({ completed: 0, total: 0 });
                tabAware.setIsGeneratingCard(false);
                return;
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


    // Add a way to cancel the current card and reset to fresh state
    const handleCancel = () => {
        debugLog('Canceling current card, clearing all state');

        // Cancel any ongoing AI requests
        if (abortControllerRef.current) {
            debugLog('Aborting ongoing AI requests');
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }

        // Invalidate this generation's delayed loader-hiding timeouts too, so one firing
        // after cancel can't flip the loader (or the selected-options map) back on.
        generationIdRef.current += 1;

        setShowResult(false);
        setIsEdited(false);
        setIsNewSubmission(true);
        setExplicitlySaved(false); // Reset explicit save
        removeTabScopedLS('explicitly_saved'); // Also remove from localStorage (tab-scoped)
        removeTabScopedLS('current_card_id'); // Clear current card ID too

        // Reset loading state
        setLoadingGetResult(false);
        setCurrentLoadingMessage(null);
        setCurrentProgress({ completed: 0, total: 0 });

        // Сбрасываем историю карточек
        setCreatedCards([]);
        setIsMultipleCards(false);
        setCurrentCardIndex(0);

        // Reset all card fields in tab-aware state so nav lock clears immediately.
        tabAware.updateCard({
            isGeneratingCard: false,
            currentCardId: null,
            text: '',
            translation: '',
            examples: [],
            image: null,
            imageUrl: null,
            front: '',
            back: null,
            linguisticInfo: '',
            transcription: '',
            wordAudio: null,
            examplesAudio: [],
            exampleTranscriptions: []
        });

        setOriginalSelectedText('');

        // Draft shortcut removed: keep flow focused on explicit save operations.
    };


    // Function to handle modal close
    const handleCloseModal = () => {
        debugLog('Modal close handler. Card saved status:', isSaved, 'isEdited:', isEdited);
        // Otherwise the next card opens straight into the editor.
        setIsEditingResult(false);

        // Если карточки созданы с помощью множественного выделения, просто закрываем модальное окно
        // без дополнительных действий, чтобы предотвратить автоматическое сохранение
        if (isMultipleCards) {
            debugLog('Closing modal for multiple cards without automatic saving');
            setShowModal(false);
            return;
        }

        // Close modal immediately for responsive UI.
        setShowModal(false);

        // For unsaved single-card flow, clear editor state in one batched update.
        if (!isSaved) {
            setShowResult(false);
            setOriginalSelectedText('');
            tabAware.updateCard({
                text: '',
                translation: '',
                examples: [],
                image: null,
                imageUrl: null,
                front: '',
                back: null,
                linguisticInfo: '',
                transcription: '',
                wordAudio: null,
                examplesAudio: [],
                exampleTranscriptions: []
            });
        }
    };

    // Render the modal
    const renderModal = () => {
        if (!showModal || !showResult) return null;

        return (
            <Modal
                open
                onClose={handleCloseModal}
                maxWidth={340}
                title={isMultipleCards ? `Card ${currentCardIndex + 1} of ${createdCards.length}` : 'Your card'}
                footer={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsEditingResult((prev) => !prev)}
                            aria-pressed={isEditingResult}
                            title={isEditingResult ? 'Done editing' : 'Edit card'}
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                isEditingResult
                                    ? 'border-accent-border bg-accent-subtle text-accent'
                                    : 'border-line bg-white text-gray-500 hover:bg-surface-sunken'
                            }`}
                        >
                            {isEditingResult ? <FaCheck size={13} /> : <FaEdit size={13} />}
                        </button>
                        <RegenerateControl
                            onNewImage={handleNewImage}
                            onNewExamples={handleNewExamples}
                            onApplyInstruction={(value: string) => { void handleApplyCustomInstruction(value); }}
                            hasImage={Boolean(image || imageUrl)}
                            hasExamples={examples.length > 0}
                            busy={isProcessingCustomInstruction || loadingNewImage || loadingNewExamples}
                        />
                        <Button
                            variant="primary"
                            size="lg"
                            className="flex-1"
                            onClick={isMultipleCards ? handleSaveAllCards : handleAccept}
                            disabled={loadingAccept || (!isMultipleCards && isSaved)}
                        >
                            {loadingAccept ? (
                                <>
                                    <Loader type="spinner" size="small" inline color="#ffffff" />
                                    Saving…
                                </>
                            ) : isMultipleCards ? (
                                `Save all (${createdCards.length - explicitlySavedIds.length})`
                            ) : isSaved ? (
                                <>
                                    <FaCheck size={12} />
                                    Saved
                                </>
                            ) : (
                                'Save card'
                            )}
                        </Button>
                    </div>
                }
            >
                <div className="p-4">


                    {/* Card N of M already sits in the modal title, so this is only the
                        stepper — the old block repeated the count, the saved badge and a
                        Save All button above the card itself. */}
                    {isMultipleCards && (
                        <div className="mb-3 flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={prevCard}
                                disabled={currentCardIndex === 0}
                                icon={<FaChevronLeft size={10} />}
                            >
                                Prev
                            </Button>
                            <span className="flex-1 text-center text-xs text-gray-500">
                                {explicitlySavedIds.length} of {createdCards.length} saved
                            </span>
                            <Button
                                size="sm"
                                onClick={nextCard}
                                disabled={currentCardIndex === createdCards.length - 1}
                            >
                                Next
                                <FaChevronRight size={10} />
                            </Button>
                        </div>
                    )}

                    <div className="mb-3">
                        <DeckDestination />
                    </div>

                    {/* The same component that shows a saved card: a card being made and a
                        card already kept are the same thing at different ages, and seeing
                        one turn into the other is the point. */}
                    <StudyCard
                        card={buildPreviewCard({
                            mode,
                            front,
                            back,
                            text,
                            translation,
                            examples,
                            examplesAudio,
                            exampleTranscriptions,
                            image,
                            imageUrl,
                            linguisticInfo,
                            transcription,
                            wordAudio,
                        })}
                        resetKey={`${currentCardIndex}-${front ?? ''}`}
                        editable={isEditingResult}
                        busy={isProcessingCustomInstruction || loadingNewImage || loadingNewExamples}
                        onWordChange={handleFrontUpdate}
                        onTranslationChange={mode === Modes.LanguageLearning ? handleTranslationUpdate : handleBackUpdate}
                        onExamplesChange={handleExamplesUpdate}
                        onGrammarChange={handleLinguisticInfoUpdate}
                    />
                </div>
            </Modal>
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
        // See the single-card generation function above for why this is captured.
        generationIdRef.current += 1;
        const myGenerationId = generationIdRef.current;

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

            // Each card already fans out into multiple parallel AI/media requests.
            // Keep cross-card concurrency low to avoid extension-wide CPU/memory spikes.
            const BATCH_SIZE = (imageGenerationMode !== 'off' || audioGenerationMode !== 'off') ? 1 : 2;
            for (let i = 0; i < selectedOptions.length; i += BATCH_SIZE) {
                const batch = selectedOptions.slice(i, i + BATCH_SIZE);

                // Process current batch in parallel
                const batchPromises = batch.map(async (option) => {
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

                        const sourceLangForParallel = isAutoDetectLanguage ? detectedLanguageForOption : sourceLanguage;

                        // Use the optimized parallel function for each card in the batch
                        const result = await createCardComponentsParallel(
                            aiService,
                            apiKey,
                            option,
                            translateToLanguage,
                            aiInstructions,
                            sourceLangForParallel || undefined,
                            imageGenerationMode !== 'off',
                            abortSignal,
                            imageGenerationMode,
                            audioGenerationMode !== 'off',
                            audioGenerationMode,
                            openAiKey,
                            generateWordAudioData,
                            {
                                mode: transcriptionMode,
                                language: transcriptionLanguage,
                                extraLanguages: transcriptionExtraLanguages,
                            }
                        );

                        // Check if cancelled after parallel calls
                        if (abortSignal.aborted) {
                            return null;
                        }

                        // Process transcription HTML
                        let transcriptionHtml = "";
                        if (result.transcription) {
                            transcriptionHtml = formatTranscriptionHtml(
                                result.transcription,
                                transcriptionLanguage,
                            );
                        }

                        // Create card object
                        const cardId = `general_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${newCards.length}`;

                        const cardExamples = (result.examples || []).map(example => [example.original, example.translated]) as [string, string | null][];
                        let cardExamplesAudio = new Array(cardExamples.length).fill(null) as Array<string | null>;
                        const cardExampleTranscriptions =
                            await generateExampleTranscriptionsFor(
                                cardExamples,
                                sourceLangForParallel,
                                abortSignal,
                            );
                        const studiedWordForAudio = (result.flashcard?.front || option || '').trim();
                        if (openAiKey && shouldAutoGenerateExamplesAudioForMode(audioGenerationMode, studiedWordForAudio) && cardExamples.length > 0) {
                            cardExamplesAudio = await generateExamplesAudioBatch(cardExamples, cardExamplesAudio, abortSignal);
                        }

                        const cardData: StoredCard = {
                            id: cardId,
                            mode,
                            text: option,
                            translation: result.translation?.translated || '',
                            examples: cardExamples,
                            examplesAudio: cardExamplesAudio,
                            exampleTranscriptions: cardExampleTranscriptions,
                            linguisticInfo: result.linguisticInfo || "",
                            transcription: transcriptionHtml,
                            wordAudio: result.wordAudio || null,
                            front: result.flashcard?.front || option,
                            back: result.translation?.translated || '',
                            image: null, // Base64 image is handled next
                            imageUrl: result.imageUrl || null,
                            createdAt: new Date(),
                            exportStatus: 'not_exported' as const
                        };

                        // Keep remote image URLs during generation and normalize only on explicit save.
                        // Eager base64 conversion here blocks multi-card creation and causes visible UI lag.
                        return cardData;

                    } catch (error) {
                        if (error instanceof Error && isQuotaError(error)) {
                            throw error;
                        }
                        console.error(`Error creating card for "${option}":`, error);
                        return null;
                    }
                });

                const batchResults = await Promise.all(batchPromises);

                // Add valid cards to the list
                for (const card of batchResults) {
                    if (card) {
                        newCards.push(card);
                    }
                }

                // Check if cancelled after batch
                if (abortSignal.aborted) {
                    debugLog('Multiple cards creation cancelled by user after batch');
                    break;
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
                    dispatch(setExamplesAudio(Array.isArray(currentCard.examplesAudio) ? currentCard.examplesAudio : []));
                    dispatch(setExampleTranscriptions(
                        Array.isArray(currentCard.exampleTranscriptions)
                            ? currentCard.exampleTranscriptions
                            : []
                    ));

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
                    dispatch(setWordAudio(currentCard.wordAudio ?? null));

                    debugLog('First card loaded into Redux state successfully');
                }

                // Сброс статуса явного сохранения карточек
                setExplicitlySaved(false);
                setExplicitlySavedIds([]);  // Clear explicitly saved IDs
                removeTabScopedLS('explicitly_saved');
                debugLog('Reset saved status for new multiple cards');

                // Важное обновление: очищаем список сохраненных ID перед показом новых карточек
                setExplicitlySavedIds([]);
                removeTabScopedLS('explicitly_saved');
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
                setLoadingGetResult(false);
                setCurrentLoadingMessage(null);
                setCurrentProgress({ completed: 0, total: 0 });
                tabAware.setIsGeneratingCard(false);
                return;
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

            // Always unlock navigation immediately once the main generation flow ends.
            // Background/fallback requests should not keep Cards/Settings disabled.
            tabAware.setIsGeneratingCard(false);

            if (criticalApiErrorRef.current) {
                debugLog('🚫 Critical API error detected - skipping delayed loader hide');
                criticalApiErrorRef.current = false;
                setLoadingGetResult(false);
                setCurrentLoadingMessage(null);
                setCurrentProgress({ completed: 0, total: 0 });
                setSelectedOptionsMap({});
                abortControllerRef.current = null;
                return;
            }

            // Use the same smart loading management as main function
            setTimeout(() => {
                // A newer generation may have started (or this one may have been cancelled)
                // while this delay was pending — the global tracker's in-progress count by
                // then belongs to whatever generation is running now, not necessarily this one.
                if (generationIdRef.current !== myGenerationId) return;

                debugLog('⏳ Checking for pending operations in multiple cards creation...');

                const tracker = getGlobalApiTracker();
                const trackerStats = tracker.getStats();
                const hasPendingRequests = trackerStats.inProgress > 0;

                debugLog('📊 Multiple cards tracker stats:', trackerStats);

                if (!hasPendingRequests) {
                    debugLog('✅ No pending operations in multiple cards - hiding loader');
                    setLoadingGetResult(false);

                    // Очищаем карту выбранных опций
                    setSelectedOptionsMap({});
                } else {
                    debugLog('⏸️ Keeping loader visible for multiple cards - operations still running');
                    // Wait a bit longer for multiple cards
                    setTimeout(() => {
                        if (generationIdRef.current !== myGenerationId) return;
                        debugLog('⏳ Final check for multiple cards...');
                        const finalCheckStats = tracker.getStats();
                        if (finalCheckStats.inProgress === 0) {
                            debugLog('✅ Multiple cards operations completed - hiding loader');
                            setLoadingGetResult(false);
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
            transcription: transcription || '',
            wordAudio: wordAudio || null,
            examplesAudio: examplesAudio || [],
            exampleTranscriptions: exampleTranscriptions || []
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
        dispatch(setWordAudio(null));
        dispatch(setExamplesAudio([]));
        dispatch(setExampleTranscriptions([]));

        // Затем загружаем данные из карточки

        // Проверяем каждое поле перед установкой
        if (typeof card.text === 'string') {
            dispatch(setText(card.text));
        }

        // Translation может быть null, но не undefined
        dispatch(setTranslation(card.translation === undefined ? null : card.translation));

        // Examples всегда должен быть массивом
        dispatch(setExamples(Array.isArray(card.examples) ? card.examples : []));
        dispatch(setExamplesAudio(Array.isArray(card.examplesAudio) ? card.examplesAudio : []));
        dispatch(setExampleTranscriptions(
            Array.isArray(card.exampleTranscriptions)
                ? card.exampleTranscriptions
                : []
        ));

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

        dispatch(setWordAudio(card.wordAudio ?? null));

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

        // Scripts without spaces between words (Chinese, Japanese, Thai, etc.) always collapse
        // to a single "word" here, so word count alone can't tell a short phrase from a whole
        // paragraph — fall back to character length for those.
        const hasWhitespace = /\s/.test(selectedText.trim());
        const isShortSelection = hasWhitespace ? wordCount <= 3 : selectedText.trim().length <= 6;
        // Also recognize full-width CJK sentence punctuation, not just the ASCII '.'.
        const looksLikeSentence = /[.!?。！？]/.test(selectedText);

        // If text is a short phrase, use it directly without showing modal
        if (isShortSelection && !looksLikeSentence && !selectedText.includes('\n')) {
            debugLog('Using short text directly');
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
    const allLanguages = ALL_LANGUAGES;


    // Persist and restore user-selected target language ("Your Language")
    const TARGET_LANGUAGE_STORAGE_KEY = 'target_language';
    // Restore saved language on first mount if present and valid
    React.useEffect(() => {
        try {
            const saved = localStorage.getItem(TARGET_LANGUAGE_STORAGE_KEY);
            if (saved && saved !== translateToLanguage) {
                const exists = allLanguages.some(l => l.code === saved);
                if (exists) {
                    dispatch(setTranslateToLanguage(saved));
                }
            }
        } catch {
            // Ignore storage errors silently
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Save whenever language changes
    React.useEffect(() => {
        try {
            if (translateToLanguage) {
                localStorage.setItem(TARGET_LANGUAGE_STORAGE_KEY, translateToLanguage);
            }
        } catch {
            // Ignore storage errors silently
        }
    }, [translateToLanguage]);


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
    const [isAutoDetectLanguage, setIsAutoDetectLanguage] = useState(() => {
        // Default to true unless explicitly set to false in localStorage
        return localStorage.getItem('auto_detect_language') !== 'false';
    });



    // Язык страницы из DOM/meta (дешевый хинт)
    const getPageLanguageHint = useCallback((): string | null => {
        try {
            const htmlLang = (document.documentElement.getAttribute('lang') || '').trim();
            if (htmlLang) {
                const norm = htmlLang.toLowerCase().split('-')[0];
                return norm.length === 2 ? norm : null;
            }
            const metaLang = (document.querySelector('meta[http-equiv="Content-Language" i]') as HTMLMetaElement)?.content
                || (document.querySelector('meta[name="language" i]') as HTMLMetaElement)?.content
                || (document.querySelector('meta[property="og:locale" i]') as HTMLMetaElement)?.content;
            if (metaLang) {
                const norm = metaLang.toLowerCase().split('-')[0];
                return norm.length === 2 ? norm : null;
            }
        } catch (_) { /* ignore */ }
        return null;
    }, []);

    // Офлайн определение языка по паттернам (с учетом языка страницы для коротких строк)
    const detectLanguageOffline = useCallback((text: string, pageHint?: string | null): string | null => {
        const cleanText = text.trim().toLowerCase();

        // Скрипты
        if (/[а-яё]/i.test(cleanText)) return 'ru';
        if (/[\u4e00-\u9fff]/.test(cleanText)) return 'zh';
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(cleanText)) return 'ja';
        if (/[\uac00-\ud7af]/.test(cleanText)) return 'ko';
        if (/[\u0600-\u06ff]/.test(cleanText)) return 'ar';

        // Латиница с диакритиками
        if (/[ñáéíóúü]/i.test(cleanText)) return 'es';
        if (/[àâäéèêëïîôöùûüÿç]/i.test(cleanText)) return 'fr';
        if (/[äöüß]/i.test(cleanText)) return 'de';
        if (/[àèéìíîòóù]/i.test(cleanText)) return 'it';

        // Чистая латиница без диакритики
        if (/^[a-z\s\.,!?\-'"]+$/i.test(cleanText)) {
            const englishWords = ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'with', 'on', 'at', 'by', 'from', 'this', 'that', 'it', 'he', 'she', 'they', 'we', 'you', 'was', 'were', 'are', 'have', 'has', 'had', 'can', 'will', 'would', 'could', 'should'];
            const words = cleanText.split(/\s+/);
            const englishMatches = words.filter(word => englishWords.includes(word.replace(/[^\w]/g, ''))).length;
            if (englishMatches > 0) return 'en';
            // Для однословных латинских слов доверимся языку страницы
            if (words.length === 1 && pageHint && pageHint.length === 2) return pageHint;
        }

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

        // 1. ОФЛАЙН определение (быстро и бесплатно) с учетом языка страницы
        const pageHint = getPageLanguageHint();
        const offlineDetected = detectLanguageOffline(text, pageHint);
        if (offlineDetected) {
            debugLog('Language detected offline:', offlineDetected);
            recordDetection(offlineDetected, 'offline detection');
            return detectedResult;
        }

        // 1.1. Если указан язык страницы и текст короткий/неоднозначный — используем хинт без LLM
        const isShortOrAmbiguous = text.trim().split(/\s+/).length <= 2;
        if (!detectedResult && pageHint && isShortOrAmbiguous) {
            debugLog('Using page language hint due to short/ambiguous text:', pageHint);
            recordDetection(pageHint, 'page hint');
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
            // If OpenAI is available, use it for language detection.
            if (openAiKey) {

                let detectedCode: string | undefined;
                // Extra check for quota cache before making OpenAI request
                if (isQuotaExceededCached()) {
                    debugLog('OpenAI language detection skipped due to cached quota error');
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
                                model: OPENAI_TEXT_MODEL,
                                messages: [
                                    {
                                        role: 'system',
                                        content: 'You are a language detection assistant. Respond only with the ISO 639-1 language code.',
                                    },
                                    {
                                        role: 'user',
                                        content: `Detect the language of this text and respond only with the ISO 639-1 language code (e.g. 'en', 'ru', 'fr', etc.): "${text.slice(0, 160)}"`,
                                    },
                                ],
                                max_tokens: 5,
                                temperature: 0.0,
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
                    // For ambiguous Latin-only text in fallback path, prefer page hint over defaulting to English
                    const pageHint = getPageLanguageHint();
                    if (pageHint) {
                        debugLog("Detected Latin script, using page hint:", pageHint);
                        detectedLang = pageHint;
                    } else {
                        debugLog("Detected Latin script, defaulting to English (no hint)");
                        detectedLang = 'en';
                    }
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
                const providerName = 'OpenAI';

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
                    const pageHint = getPageLanguageHint();
                    detectedLang = pageHint || 'en';
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
    }, [openAiKey, modelProvider, detectLanguageOffline, getSmartCacheKey, updateSourceLanguage, detectedLanguage, showError, shouldShowQuotaNotification, getCachedQuotaError, markQuotaNotificationShown, cacheQuotaExceededError, setIsAutoDetectLanguage, allLanguages]);

    // Auto-detect is a value of the source-language picker now ("Detect automatically"),
    // not a separate switch, so both used to be expressed through this one handler.
    // `null` means auto; any code means the user picked a language explicitly.
    const handleSourceLanguageChange = (code: string | null) => {
        const auto = code === null;
        setIsAutoDetectLanguage(auto);
        localStorage.setItem('auto_detect_language', auto ? 'true' : 'false');

        if (auto) {
            updateSourceLanguage('');
            setDetectedLanguage(null);
            localStorage.removeItem('detected_language');
            // Re-run detection right away so the bar does not sit on "Auto-detect" with
            // text already in the box.
            if (text) {
                detectLanguage(text);
            }
            return;
        }

        updateSourceLanguage(code);
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

    const shouldGenerateAudioForText = useCallback((value: string): { shouldGenerate: boolean; reason: string } => {
        const textToCheck = (value || '').trim();
        if (!textToCheck) return { shouldGenerate: false, reason: 'No text provided' };

        // Skip obvious non-pronunciation content
        if (/[\n\r]/.test(textToCheck)) return { shouldGenerate: false, reason: 'Multi-line text' };
        if (/[{}<>_=^`~\\]/.test(textToCheck)) return { shouldGenerate: false, reason: 'Looks like code/formula' };
        if (/\d{3,}/.test(textToCheck)) return { shouldGenerate: false, reason: 'Mostly numeric content' };

        const words = textToCheck.split(/\s+/).filter(Boolean);
        if (words.length === 0) return { shouldGenerate: false, reason: 'No words found' };
        if (words.length > 5) return { shouldGenerate: false, reason: 'Long phrase' };

        return { shouldGenerate: true, reason: words.length === 1 ? 'Single word' : 'Short phrase' };
    }, []);

    // Handle image mode changes
    const handleImageModeChange = (mode: 'off' | 'smart' | 'always') => {
        setImageGenerationModeState(mode);

        // Автоматически включаем shouldGenerateImage для Smart и Always режимов
        if (mode === 'smart' || mode === 'always') {
            debugLog(`🔧 Automatically enabling shouldGenerateImage for ${mode} mode`);
            setShouldGenerateImageState(true);

            // Дополнительная проверка - убеждаемся, что состояние действительно изменилось
            setTimeout(() => {
                debugLog(`🔍 Verification: shouldGenerateImage should now be true for ${mode} mode`);
            }, 100);
        } else if (mode === 'off') {
            // При выключении режима также выключаем общий переключатель
            debugLog('🔧 Disabling shouldGenerateImage for off mode');
            setShouldGenerateImageState(false);
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

    const handleAudioModeChange = (mode: 'off' | 'smart' | 'always') => {
        setAudioGenerationModeState(mode);

        if (mode === 'off') {
            tabAware.setWordAudio(null);
            return;
        }

        // Auto-generate immediately for better UX if possible
        const studiedWord = (originalSelectedText || text || front || '').trim();
        if (!studiedWord || !openAiKey) return;

        if (mode === 'always') {
            handleGenerateAudio();
            return;
        }

        const smart = shouldGenerateAudioForText(studiedWord);
        if (smart.shouldGenerate) {
            handleGenerateAudio();
        }
    };

    // Choosing smart or always from the chip menu also becomes the mode the chip restores
    // next time it is switched back on, so the choice survives an off/on round trip.
    const selectImageMode = (mode: 'off' | 'smart' | 'always') => {
        if (mode !== 'off') {
            setImageOnMode(mode);
            setPreferredImageOnMode(mode);
        }
        handleImageModeChange(mode);
    };

    const selectAudioMode = (mode: 'off' | 'smart' | 'always') => {
        if (mode !== 'off') {
            setAudioOnMode(mode);
            setPreferredAudioOnMode(mode);
        }
        handleAudioModeChange(mode);
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
                    const imageDescription = await aiService.getDescriptionImage(apiKey, inputText, imageInstructions, undefined, sourceLanguage || undefined);
                    if (imageDescription) {
                        const safeImageDescription = buildSafeImagePrompt(inputText, imageDescription);
                        const { imageUrl, imageBase64 } = await getImage(openAiKey, safeImageDescription, imageInstructions, sourceLanguage || undefined);
                        if (imageBase64) {
                            imageData = imageBase64;
                        } else if (imageUrl) {
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
            // Ensure saved flags are cleared before showing result to avoid flicker
            setExplicitlySaved(false);
            removeTabScopedLS('explicitly_saved');
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

    // Function to handle AI agent card creation
    const handleCreateAICards = useCallback(async () => {
        const currentText = textInputValueRef.current.trim();
        if (!currentText) {
            showError('Please enter or select text to create cards', 'error');
            return;
        }
        flushTextInputSync(textInputValueRef.current);

        if (!apiKey) {
            notifyMissingApiKey();
            return;
        }

        criticalApiErrorRef.current = false;

        // Create new AbortController for this generation
        abortControllerRef.current = new AbortController();
        const abortSignal = abortControllerRef.current.signal;
        // See the single-card generation function above for why this is captured.
        generationIdRef.current += 1;
        const myGenerationId = generationIdRef.current;

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
                // The panel cannot read the tab's DOM; the content script locates the
                // selection and extracts the surrounding content on our behalf.
                pageContext = (await requestPageContext(await getActiveTabId(), currentText)) ?? undefined;

                // A tab we cannot reach — chrome:// pages, a tab still loading — is normal, and
                // card creation carries on without page context.
                if (pageContext) {
                debugLog('📄 Extracted page content:', {
                    images: pageContext.pageImages.length,
                    formulas: pageContext.formulas.length,
                    codeBlocks: pageContext.codeBlocks.length,
                    links: pageContext.links.length,
                    metadata: pageContext.metadata,
                    selectedText: currentText.substring(0, 100) + '...'
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
                }

            } catch (extractError) {
                console.warn('Failed to extract page content, proceeding without multimedia:', extractError);
                pageContext = undefined;
            }

            // Всегда используем быстрый режим генерации для максимальной скорости
            const createdCards = await aiAgentService.createCardsFromTextFast(currentText, pageContext, abortSignal);

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
                // A newer generation may have started (or this one may have been cancelled)
                // while this delay was pending — don't let a stale timeout hide the loader
                // out from under a different generation cycle.
                if (generationIdRef.current !== myGenerationId) return;

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
                        if (generationIdRef.current !== myGenerationId) return;
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
    }, [aiService, apiKey, flushTextInputSync, showError, notifyMissingApiKey, handlePotentialApiKeyIssue]);

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
                tabAware.saveCardToStorage(cardToSave);
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
                imageUrl: normalized.imageUrl,
                deckId: selectedBackendDeckId,
                ankiDeckName: selectedAnkiDeckName
            };
            tabAware.saveCardToStorage(cardToSave);

            // Mark this card as saved
            setSavedCardIndices(prev => new Set(prev).add(currentPreviewIndex));

            // New logic: Automatic sync to Anki if deck selected
            if (useAnkiConnect && selectedAnkiDeckName) {
                try {
                    const ankiCard = (currentCard.mode || mode) === Modes.LanguageLearning ? {
                        text: cardToSave.text,
                        translation: (cardToSave as any).translation,
                        examples: (cardToSave as any).examples,
                        image_base64: cardToSave.image,
                        linguisticInfo: (cardToSave as any).linguisticInfo,
                        transcription: (cardToSave as any).transcription,
                        word_audio_base64: (cardToSave as any).wordAudio,
                        examples_audio_base64: (cardToSave as any).examplesAudio,
                        example_transcriptions: (cardToSave as any).exampleTranscriptions,
                    } : {
                        text: cardToSave.text,
                        front: (cardToSave as any).front,
                        back: (cardToSave as any).back,
                        image_base64: cardToSave.image
                    };

                    await dispatch(saveAnkiCards(
                        currentCard.mode || mode,
                        ankiConnectUrl,
                        ankiConnectApiKey,
                        selectedAnkiDeckName,
                        'Basic',
                        [ankiCard as any]
                    ));
                    tabAware.updateCardExportStatus(cardToSave.id, 'exported');
                    showError(getAnkiSaveSuccessMessage(1), 'success');
                } catch (ankiErr) {
                    showError(
                        getAnkiSaveErrorMessage(ankiErr),
                        isAnkiDuplicateError(ankiErr) ? 'warning' : 'error'
                    );
                }
            }

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
                pageContext = (await requestPageContext(await getActiveTabId(), text)) ?? undefined;
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


    // Use tab-specific isGeneratingCard from TabAware context to avoid cross-tab leakage

    return (
        <div className="relative flex h-full w-full flex-1 flex-col">
            {/* General mode has no visual study-card front, so it keeps the compact strip.
                Language cards render progress inside the card itself below. */}
            {loadingGetResult && !forceHideLoader && mode !== Modes.LanguageLearning && (
                <div className="shrink-0 border-b border-line bg-surface-muted" role="status" aria-live="polite">
                    <div className="h-0.5 w-full overflow-hidden bg-line">
                        <div
                            className="h-full bg-accent transition-[width] duration-500 ease-out"
                            style={{
                                width: `${currentProgress.total > 0
                                    ? Math.max(6, (currentProgress.completed / currentProgress.total) * 100)
                                    : 12}%`
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5">
                        <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
                            {currentLoadingMessage?.currentStepTitle ||
                                currentLoadingMessage?.title ||
                                'Starting…'}
                        </span>
                        <span className="shrink-0 font-mono text-xs tabular-nums text-gray-400">
                            {formatElapsedTime(elapsedTime)}
                        </span>
                        <button
                            type="button"
                            onClick={handleCancel}
                            aria-label="Cancel generation"
                            className="shrink-0 rounded-control p-1 text-gray-400 transition-colors hover:bg-line hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaTimes size={11} />
                        </button>
                    </div>
                </div>
            )}

            {textAnalysisLoader && (
                <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-muted px-3 py-2" role="status" aria-live="polite">
                    <Loader type="spinner" size="small" inline color="#6B7280" />
                    <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
                        Analysing the selected text…
                    </span>
                    <button
                        type="button"
                        onClick={() => setTextAnalysisLoader(false)}
                        aria-label="Cancel analysis"
                        className="shrink-0 rounded-control p-1 text-gray-400 transition-colors hover:bg-line hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <FaTimes size={11} />
                    </button>
                </div>
            )}
            {/* The only remaining API-key warning. The image and audio controls used to
                repeat it twice more, in red and amber, right below this one. */}
            {showMissingApiKeyNotice && !apiKey && (
                <div className="flex shrink-0 items-center gap-2.5 border-b border-warn-border bg-warn-subtle px-3 py-2">
                    <FaKey size={12} className="shrink-0 text-warn-strong" />
                    <span className="min-w-0 flex-1 text-xs leading-snug text-warn-strong">
                        Add your {providerDisplayName} key to start creating cards.
                    </span>
                    <button
                        type="button"
                        onClick={handleOpenSettings}
                        className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-warn-strong underline-offset-2 transition-colors hover:bg-warn-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        Settings
                    </button>
                    <button
                        type="button"
                        onClick={handleDismissMissingApiKeyNotice}
                        aria-label="Dismiss"
                        className="shrink-0 rounded-control p-1 text-warn-strong/60 transition-colors hover:bg-warn-border/40 hover:text-warn-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <FaTimes size={10} />
                    </button>
                </div>
            )}
            {/* Composer. The input leads, and it takes whatever height the panel gives it —
                a fixed-height box left a dead gap above the footer on a tall panel. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden bg-white px-3 pb-2 pt-2">
                <div className="mx-auto flex min-h-0 w-full max-w-[340px] flex-1 flex-col gap-2">
                    {mode === Modes.LanguageLearning && (
                        <LanguagePairBar
                            sourceCode={isAutoDetectLanguage ? null : (sourceLanguage || null)}
                            detectedCode={detectedLanguage}
                            isDetecting={isDetectingLanguage}
                            onSourceChange={handleSourceLanguageChange}
                            targetCode={translateToLanguage}
                            onTargetChange={(code) => dispatch(setTranslateToLanguage(code))}
                        />
                    )}

                    {mode === Modes.GeneralTopic && (
                        <div className="flex shrink-0 flex-col gap-1 rounded-card border border-line bg-surface-muted p-3">
                            <h2 className="m-0 flex items-center gap-2 text-sm font-semibold text-gray-900">
                                <FaRobot size={13} className="text-accent" />
                                AI agent card creator
                            </h2>
                            <p className="m-0 text-xs leading-snug text-gray-500">
                                Agents read the text, split it into as many cards as it needs, and
                                check the result before handing it over.
                            </p>
                        </div>
                    )}

                    {/* A language card is its headword, so you type it onto the front you
                        will later flip. General mode takes pasted articles, where a big
                        centred font would be unreadable — it keeps the plain composer.
                        The card input labels itself, so the sr-only label belongs to the
                        textarea branch rather than dangling over both. */}
                    {mode === Modes.LanguageLearning && loadingGetResult && !forceHideLoader ? (
                        <CardGenerationLoader
                            target={textInputValue}
                            title={currentLoadingMessage?.currentStepTitle ||
                                currentLoadingMessage?.title ||
                                'Starting card creation…'}
                            subtitle={currentLoadingMessage?.currentStepSubtitle ||
                                currentLoadingMessage?.subtitle ||
                                'Preparing the answer, examples, and grammar reference'}
                            completed={currentProgress.completed}
                            total={currentProgress.total}
                            elapsed={formatElapsedTime(elapsedTime)}
                            onCancel={handleCancel}
                        />
                    ) : mode === Modes.LanguageLearning ? (
                        <CardFrontInput
                            autoFocus
                            value={textInputValue}
                            onChange={handleTextChange}
                            onKeyDown={handleComposerKeyDown}
                            onBlur={() => flushTextInputSync()}
                            placeholder="Type a word or phrase — or select one on the page"
                        />
                    ) : (
                        <>
                        <label htmlFor="text" className="sr-only">
                            Text for the card
                        </label>
                        <Textarea
                            id="text"
                            fill
                            autoFocus
                            value={textInputValue}
                            onChange={(e) => handleTextChange(e.target.value)}
                            onKeyDown={handleComposerKeyDown}
                            onBlur={() => flushTextInputSync()}
                            placeholder="Paste the text you want cards from — or select it on the page"
                        />
                        </>
                    )}

                    {!loadingGetResult && cameFromSelection && textInputValue.trim() !== '' && (
                        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-accent-subtle px-2.5 py-1 text-[11px] font-medium text-accent">
                            <FaMagic size={9} />
                            From your selection on the page
                        </span>
                    )}

                    {mode === Modes.LanguageLearning && !loadingGetResult && (
                        <div className="shrink-0">
                            <GenerationChips
                                imageMode={imageGenerationMode}
                                audioMode={audioGenerationMode}
                                onImageModeChange={selectImageMode}
                                onAudioModeChange={selectAudioMode}
                                imageOnMode={imageOnMode}
                                audioOnMode={audioOnMode}
                                hasOpenAiKey={Boolean(openAiKey)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Primary action stays put instead of scrolling away below the settings. */}
            <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
                <div className="mx-auto flex w-full max-w-[340px] flex-col gap-1.5">
                    <DeckDestination />
                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        disabled={loadingGetResult || textInputValue.trim() === ''}
                        onClick={handlePrimaryAction}
                    >
                        {loadingGetResult ? (
                            <>
                                Creating card… {formatElapsedTime(elapsedTime)}
                            </>
                        ) : (
                            <>
                                {mode === Modes.GeneralTopic ? 'Create cards' : 'Create card'}
                                <span className="ml-1 text-xs font-normal opacity-70">
                                    {shortcutHint}
                                </span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Add the text options modal */}
            {renderTextOptionsModal()}

            {/* Add the modal */}
            {renderModal()}

            {/* Both language pickers are owned by LanguagePairBar now. */}

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

                        {/* Content */}
                        <div style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '16px',
                            backgroundColor: '#ffffff'
                        }}>
                            {/* The saved-card view, reused */}
                            {previewCards[currentPreviewIndex] && (
                                <div style={{ animation: 'slideIn 0.3s ease-out' }}>
                                    <DeckSelector />
                                    {/* Already a StoredCard, so it needs no adapter —
                                        the same component that shows it once saved. */}
                                    <StudyCard
                                        card={previewCards[currentPreviewIndex]}
                                        resetKey={String(currentPreviewIndex)}
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
