import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { ThunkDispatch } from 'redux-thunk';
import { AnyAction } from 'redux';
import { RootState } from '../store';
import { saveAnkiCards } from '../store/actions/cards';
import { setAnkiAvailability } from '../store/actions/anki';
import { StoredCard } from '../store/reducers/cards';
import { useTabAware } from './TabAwareProvider';
import { Modes } from '../constants';
import { FaDownload, FaTimes, FaEllipsisH, FaSearch, FaCheckSquare, FaCloud, FaCheckCircle, FaChevronRight, FaChevronDown, FaExclamationTriangle, FaDesktop, FaPlay, FaChartBar, FaLayerGroup } from 'react-icons/fa';
import { CardLangLearning, CardGeneral, fetchDecks, createAnkiCards, format_back_lang_learning, getAnkiSaveErrorMessage, getAnkiSaveSuccessMessage, isAnkiDuplicateError } from '../services/ankiService';
import useErrorNotification from './useErrorHandler';
import Menu from './ui/Menu';
import Button from './ui/Button';
import Modal from './ui/Modal';
import InstructionComposer, { InstructionSuggestion } from './StoredCards/InstructionComposer';
import StudyCard from './StoredCards/StudyCard';
import DeckSelector from './CreateCard/DeckSelector';
import { setDeckId } from '../store/actions/decks';
import { createVaultoDeck, renameVaultoDeck, deleteVaultoDeck } from '../store/actions/vaultoDecks';
import Loader from './Loader';
import { formatOpenAIErrorMessage, getDescriptionImage, getFallbackImageModelForError, getOpenAiSpeechAudioDataUrl } from "../services/openaiApi";
import { getAIService, getApiKeyForProvider, createExamples, createTranslation, createCardComponentsParallel, createLinguisticInfo } from '../services/aiServiceFactory';
import { planInstruction, ACTION_STATUS } from '../services/instructionRouter';
import { SrsGrade, applyReview, createInitialSrsState, isDue, srsEquals } from '../services/srs';
import { ReviewLogEntry, StudyStats, appendReviewLog, computeStats, loadReviewLogs, markReviewLogsSynced, pendingReviewLogs, serverStatsToStudyStats } from '../services/reviewLog';
import { flushPendingReviews, pullSrsUpdates, pushReview } from '../services/srsSync';
import StudySession from './StoredCards/StudySession';
import StatsPanel from './StoredCards/StatsPanel';
import DeckSheet, { DeckOption } from './StoredCards/DeckSheet';
import ImportFromAnkiModal from './StoredCards/ImportFromAnkiModal';
import { cardsStatsApi } from '../services/cardsSyncApi';
import { DEFAULT_DECK_NAME } from '../services/cardsSyncService';
import { useAuthenticatedRequest } from '../hooks/useAuthenticatedRequest';
import { ModelProvider } from '../store/reducers/settings';
import { backgroundFetch } from "../services/backgroundFetch";
import { buildSafeImagePrompt, extractOpenAIImagePayload } from '../services/imagePromptSafety';
import {
    formatTranscriptionHtml,
    shouldGenerateTranscription,
} from '../services/transcription';
import { generateAndValidateExampleTranscriptions } from '../services/exampleTranscriptions';
import {
    OPENAI_IMAGE_BACKGROUND,
    OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_QUALITY,
    OPENAI_IMAGE_SIZE,
} from '../constants';

const isDev = process.env.NODE_ENV !== 'production';
const debugLog = (...args: unknown[]) => {
    if (isDev) {
        console.log(...args);
    }
};

interface StoredCardsProps {
    onBackClick: () => void;
    initialFilter?: CardFilterType;
}

// Kept only for the (now ignored) initialFilter prop callers still pass.
type CardFilterType = 'new' | 'all' | 'not_exported' | 'exported';

const RELATIVE_UNITS: [limit: number, divisor: number, unit: Intl.RelativeTimeFormatUnit][] = [
    [60_000, 1_000, 'second'],
    [3_600_000, 60_000, 'minute'],
    [86_400_000, 3_600_000, 'hour'],
    [604_800_000, 86_400_000, 'day'],
    [2_629_800_000, 604_800_000, 'week'],
    [31_557_600_000, 2_629_800_000, 'month'],
];

// A full "24.07.2026, 00:15" per row is noise when scanning; "2 days ago" is what the
// reader actually wants to know.
const formatRelativeDate = (value: Date | string | number): string => {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return '';
    const diff = time - Date.now();
    const abs = Math.abs(diff);
    const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'narrow' });
    for (const [limit, divisor, unit] of RELATIVE_UNITS) {
        if (abs < limit) return formatter.format(Math.round(diff / divisor), unit);
    }
    return formatter.format(Math.round(diff / 31_557_600_000), 'year');
};

const StoredCards: React.FC<StoredCardsProps> = ({ onBackClick: _onBackClick, initialFilter: _initialFilter = 'new' }) => {
    const dispatch = useDispatch<ThunkDispatch<RootState, void, AnyAction>>();
    const tabAware = useTabAware();
    const { storedCards } = tabAware;
    const deckId = useSelector((state: RootState) => state.deck.deckId);
    const decks = useSelector((state: RootState) => state.deck.decks);
    const useAnkiConnect = useSelector((state: RootState) => state.settings.useAnkiConnect);
    const ankiConnectUrl = useSelector((state: RootState) => state.settings.ankiConnectUrl);
    const ankiConnectApiKey = useSelector((state: RootState) => state.settings.ankiConnectApiKey);
    const isAnkiAvailable = useSelector((state: RootState) => state.anki.isAnkiAvailable);
    const openAiKey = useSelector((state: RootState) => state.settings.openAiKey);
    const imageInstructions = useSelector((state: RootState) => state.settings.imageInstructions);
    const sourceLanguage = useSelector((state: RootState) => state.settings.sourceLanguage);
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
    const modelProvider = useSelector((state: RootState) => state.settings.modelProvider);
    const auth = useSelector((state: RootState) => state.auth);
    // Same generation context CreateCard uses, so instruction-driven regeneration of a
    // stored card runs through the exact same services.
    const aiService = useMemo(() => getAIService(modelProvider as ModelProvider), [modelProvider]);
    const apiKey = useMemo(() => getApiKeyForProvider(modelProvider as ModelProvider, openAiKey), [modelProvider, openAiKey]);
    const generateExampleTranscriptionsFor = useCallback(async (
        examplesToTranscribe: Array<[string, string | null]>
    ): Promise<Array<string | null>> => {
        const result = new Array(examplesToTranscribe.length).fill(null);
        if (
            !exampleTranscriptionsEnabled
            || transcriptionMode === 'off'
            || !apiKey
            || examplesToTranscribe.length === 0
        ) {
            return result;
        }

        const eligibleIndexes = examplesToTranscribe
            .map(([sentence], index) =>
                shouldGenerateTranscription(
                    sentence,
                    transcriptionMode,
                    sourceLanguage,
                    transcriptionExtraLanguages,
                )
                    ? index
                    : -1
            )
            .filter((index) => index >= 0);

        if (!eligibleIndexes.length) return result;

        try {
            const generated = await generateAndValidateExampleTranscriptions(
                aiService,
                apiKey,
                eligibleIndexes.map((index) => examplesToTranscribe[index][0]),
                sourceLanguage || 'unknown (infer only from the exact source examples)',
                transcriptionLanguage || 'en',
            );
            eligibleIndexes.forEach((originalIndex, generatedIndex) => {
                result[originalIndex] = generated[generatedIndex] ?? null;
            });
        } catch (error) {
            console.debug('Stored-card example pronunciations unavailable:', error);
        }

        return result;
    }, [
        aiService,
        apiKey,
        exampleTranscriptionsEnabled,
        sourceLanguage,
        transcriptionExtraLanguages,
        transcriptionLanguage,
        transcriptionMode,
    ]);
    const syncApiUrl = useSelector((state: RootState) => state.settings.syncApiUrl);
    const executeRequest = useAuthenticatedRequest();
    const isLoggedIn = Boolean(auth.accessToken);
    // Cloud sync is a separate axis from Anki/file export: a card can be fully backed up
    // to Vaulto (and its cloud deck) while still being "Not exported" to Anki. This tells
    // whether the latest version of the card has reached the server.
    const isCardSynced = useCallback(
        (card: StoredCard) =>
            Boolean(card.syncId) && typeof card.syncVersion === 'number' && !card.syncPending,
        []
    );

    const [selectedCards, setSelectedCards] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingDecks, setLoadingDecks] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    // null = every deck. Mirrors the mobile app's deck-first navigation.
    const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
    // The queue a study session was started with (null = not studying).
    const [studyCards, setStudyCards] = useState<StoredCard[] | null>(null);
    const [showStats, setShowStats] = useState(false);
    const [reviewLogs, setReviewLogs] = useState<ReviewLogEntry[]>([]);
    // Cross-device statistics from the server; null means "show the local ones".
    const [serverStats, setServerStats] = useState<StudyStats | null>(null);
    // Bulk mode used to be permanently on: a Select All row and two greyed-out buttons
    // greeted you before you had chosen anything.
    const [selectionMode, setSelectionMode] = useState(false);
    // Deleting was instant and final. The row goes immediately, the card is kept here
    // so the toast can put it back.
    const [recentlyDeleted, setRecentlyDeleted] = useState<StoredCard | null>(null);
    // Flip study preview (read/learn view, like the mobile app).
    const [previewCard, setPreviewCard] = useState<StoredCard | null>(null);
    // Modal editing states
    const [editingCard, setEditingCard] = useState<StoredCard | null>(null);
    const [showEditModal, setShowEditModal] = useState(false);

    // Локальное состояние для редактирования карточки (избегаем конфликтов с глобальным Redux)
    const [localEditingCardData, setLocalEditingCardData] = useState<StoredCard | null>(null);

    const [loadingNewExamples, setLoadingNewExamples] = useState(false);
    const [loadingAudio, setLoadingAudio] = useState(false);
    const [loadingSync, setLoadingSync] = useState(false);
    // Free-form "tell it what to change" composer in the edit modal.
    const [instructionText, setInstructionText] = useState('');
    const [loadingInstruction, setLoadingInstruction] = useState(false);
    const [instructionStatus, setInstructionStatus] = useState<string | null>(null);
    // The deck picker serves the editor, the preview and plain "move these cards", so it
    // remembers what opened it rather than being wired to the editor alone.
    type DeckPickerTarget =
        | { kind: 'edit' }
        | { kind: 'preview' }
        | { kind: 'cards'; ids: string[] };
    const [deckPickerFor, setDeckPickerFor] = useState<DeckPickerTarget | null>(null);
    const [showDeckSheet, setShowDeckSheet] = useState(false);
    // Deck being imported into from an existing Anki deck (null = the picker is closed).
    const [importTargetDeck, setImportTargetDeck] = useState<DeckOption | null>(null);
    // The debounced auto-save skips the first change after a card is opened (that first
    // change is just seeding localEditingCardData from the card, not a real edit).
    const skipNextAutoSave = useRef(true);
    const [ankiSettingsPrompt, setAnkiSettingsPrompt] = useState<'disabled' | 'unavailable' | null>(null);
    // Local-first: works without signing in. id → name for every Vaulto deck (local-only
    // or synced), so a card can say which deck it lives in rather than just "in the cloud".
    const vaultoDecks = useSelector((state: RootState) => state.vaultoDecks.decks);
    const backendDeckNames = useMemo(() => {
        const names: Record<string, string> = {};
        vaultoDecks.forEach((deck) => { names[deck.id] = deck.name; });
        return names;
    }, [vaultoDecks]);

    // States for export file modal
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportFileName, setExportFileName] = useState('anki_cards');
    const [isExporting, setIsExporting] = useState(false);
    const selectedCardIds = useMemo(() => new Set(selectedCards), [selectedCards]);


    const { showError, renderErrorNotification } = useErrorNotification();

    useEffect(() => {
        let cancelled = false;
        loadReviewLogs().then((logs) => { if (!cancelled) setReviewLogs(logs); });
        return () => { cancelled = true; };
    }, []);

    // Pull schedules changed elsewhere (most often: studied on the phone) and merge them
    // onto the local cards. The pull payload carries SRS only, so nothing else is touched.
    const storedCardsRef = useRef(storedCards);
    storedCardsRef.current = storedCards;

    // Grows as the login sync uploads cards, which is what re-triggers the flush below.
    const syncedCardCount = useMemo(
        () => storedCards.filter((card) => Boolean(card.syncId)).length,
        [storedCards]
    );

    // Anything studied while offline goes up as soon as there is a connection again.
    useEffect(() => {
        if (!isLoggedIn) return undefined;

        let cancelled = false;
        loadReviewLogs().then((logs) => {
            const pending = pendingReviewLogs(logs);
            if (cancelled || pending.length === 0) return;

            const cardsById = new Map(storedCardsRef.current.map((card) => [card.id, card]));
            executeRequest((token) => flushPendingReviews(syncApiUrl, token, pending, cardsById))
                .then((handled) => {
                    if (!cancelled && handled.length > 0) {
                        markReviewLogsSynced(handled).then(setReviewLogs);
                    }
                })
                .catch((error) => console.warn('Could not send pending reviews yet:', error));
        });

        return () => { cancelled = true; };
        // Re-runs as cards acquire syncIds after signing in — exactly when reviews
        // studied signed out become deliverable. A run with nothing pending sends no
        // request, so this stays quiet.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, syncApiUrl, syncedCardCount]);

    useEffect(() => {
        if (!isLoggedIn) return undefined;

        let cancelled = false;
        executeRequest((token) => pullSrsUpdates(syncApiUrl, token))
            .then(({ byNoteId }) => {
                if (cancelled) return;
                const updates = Object.keys(byNoteId);
                if (updates.length === 0) return;

                storedCardsRef.current.forEach((card) => {
                    const remoteState = card.syncId ? byNoteId[card.syncId] : undefined;
                    if (!remoteState) return;
                    // Our own pushes come back on the next pull, so skipping identical
                    // schedules is what stops each pull from rewriting every card (and
                    // triggering a note sync per card).
                    if (srsEquals(card.srsState, remoteState)) return;
                    tabAware.updateStoredCard({ ...card, srsState: remoteState });
                });
            })
            .catch((error) => console.warn('Failed to pull study progress:', error));

        return () => { cancelled = true; };
        // Runs once per sign-in/session: reviews made here are pushed as they happen.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, syncApiUrl]);

    // Grading a card writes three things: the card's next schedule (SM-2), the review log
    // the statistics are built from, and — when signed in — the same pair pushed to the
    // cloud on the /sync channel the mobile app reads.
    const handleReview = useCallback((card: StoredCard, grade: SrsGrade, responseTimeMs: number) => {
        const nextState = applyReview(card.srsState ?? createInitialSrsState(), grade);
        tabAware.updateStoredCard({ ...card, srsState: nextState });

        appendReviewLog({
            cardId: card.id,
            grade,
            reviewedAt: new Date().toISOString(),
            responseTimeMs,
        }).then(({ entry, logs }) => {
            setReviewLogs(logs);
            if (!isLoggedIn || !card.syncId) return;
            // A failed push must never cost the user their review: it is already saved
            // locally and stays flagged pending, so studying offline just means the
            // reviews go up the next time the panel opens with a connection.
            executeRequest((token) => pushReview(syncApiUrl, token, card, nextState, entry))
                .then((sent) => (sent ? markReviewLogsSynced([entry.id]).then(setReviewLogs) : undefined))
                .catch((error) => console.warn('Review saved locally, will retry sync:', error));
        });
    }, [tabAware, isLoggedIn, executeRequest, syncApiUrl]);

    // Local numbers only ever see this device's reviews. When signed in, the server has
    // every device's, so it is the honest source — with the local computation as the
    // offline/signed-out fallback.
    const localStats = useMemo(
        () => computeStats(storedCards, reviewLogs),
        [storedCards, reviewLogs]
    );
    const stats = serverStats ?? localStats;

    useEffect(() => {
        if (!isLoggedIn || !showStats) return undefined;

        let cancelled = false;
        executeRequest((token) => cardsStatsApi.get(syncApiUrl, token))
            .then((dto) => { if (!cancelled) setServerStats(serverStatsToStudyStats(dto)); })
            .catch((error) => {
                // Keep whatever we can show rather than an empty panel.
                console.warn('Failed to load study statistics from Vaulto Cloud:', error);
            });

        return () => { cancelled = true; };
    }, [isLoggedIn, showStats, syncApiUrl, executeRequest]);

    useEffect(() => {
        if (!isLoggedIn) setServerStats(null);
    }, [isLoggedIn]);

    // The Vaulto deck a card lives in. No explicit deck still means a real deck — the
    // auto-created default one — so it is named rather than shown as "none".
    const vaultoDeckLabel = useCallback(
        (card: StoredCard) => (card.deckId && backendDeckNames[card.deckId]) || DEFAULT_DECK_NAME,
        [backendDeckNames]
    );

    // Load Anki decks when needed
    const loadAnkiDecks = useCallback(async () => {
        if (!useAnkiConnect) {
            dispatch(setAnkiAvailability(false));
            return;
        }

        setLoadingDecks(true);

        try {
            const response = await fetchDecks(ankiConnectUrl, ankiConnectApiKey);

            if (response.error) {
                dispatch(setAnkiAvailability(false));
                dispatch({ type: 'FETCH_DECKS_SUCCESS', payload: [] });
                return;
            }

            const decksResult = Array.isArray(response.result) ? response.result : [];

            dispatch({
                type: 'FETCH_DECKS_SUCCESS',
                payload: decksResult
            });
            dispatch(setAnkiAvailability(true));

            // Select first deck if none is selected
            if (!deckId && decksResult.length > 0) {
                dispatch(setDeckId(decksResult[0].deckId));
            }
        } catch (error) {
            dispatch(setAnkiAvailability(false));
            dispatch({ type: 'FETCH_DECKS_SUCCESS', payload: [] });
        } finally {
            setLoadingDecks(false);
        }
    }, [useAnkiConnect, ankiConnectUrl, ankiConnectApiKey, dispatch, deckId]);

    // Load decks initially if using AnkiConnect
    useEffect(() => {
        if (useAnkiConnect) {
            loadAnkiDecks();
        } else {
            dispatch(setAnkiAvailability(false));
        }
    }, [useAnkiConnect, loadAnkiDecks, dispatch]);

    useEffect(() => {
        if (useAnkiConnect && isAnkiAvailable) {
            setAnkiSettingsPrompt(null);
        }
    }, [useAnkiConnect, isAnkiAvailable]);

    useEffect(() => {
        if (!ankiSettingsPrompt) {
            return undefined;
        }

        const timer = window.setTimeout(() => {
            setAnkiSettingsPrompt(null);
        }, 10000);

        return () => window.clearTimeout(timer);
    }, [ankiSettingsPrompt]);

    const handleOpenSettings = useCallback(() => {
        setAnkiSettingsPrompt(null);
        tabAware.setCurrentPage('settings');
    }, [tabAware]);

    // Cards with no explicit deck live in the auto-created default deck, so that deck's
    // chip has to claim them too — otherwise it would look empty for most people.
    const defaultDeckId = useMemo(
        () => Object.keys(backendDeckNames).find((id) => backendDeckNames[id] === DEFAULT_DECK_NAME) ?? null,
        [backendDeckNames]
    );

    const cardMatchesDeck = useCallback(
        (card: StoredCard, targetDeckId: string | null) => {
            if (!targetDeckId) return true;
            if (card.deckId === targetDeckId) return true;
            return !card.deckId && targetDeckId === defaultDeckId;
        },
        [defaultDeckId]
    );

    // Export to Anki/file is an action, not a saved status to filter by, so the only
    // narrowing is search and the deck. Newest first.
    const filteredCards = useMemo(() => {
        if (!Array.isArray(storedCards) || storedCards.length === 0) {
            return [];
        }

        const query = searchQuery.trim().toLowerCase();
        const candidates = storedCards.filter((card) => {
            if (!cardMatchesDeck(card, activeDeckId)) return false;
            if (!query) return true;
            // Searching both sides of the card: you rarely remember which one you typed.
            return [card.front, card.text, card.back, card.translation]
                .some(field => (field || '').toLowerCase().includes(query));
        });

        return [...candidates].sort((a, b) => (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
    }, [storedCards, searchQuery, activeDeckId, cardMatchesDeck]);

    // How many of the cards in view are ready for review right now.
    const dueCount = useMemo(
        () => filteredCards.filter((card) => isDue(card.srsState)).length,
        [filteredCards]
    );

    // Mobile studies what is due; falling back to the whole selection means the button
    // still does something useful when nothing has come up for review yet.
    const startStudy = useCallback(() => {
        const due = filteredCards.filter((card) => isDue(card.srsState));
        setStudyCards(due.length > 0 ? due : filteredCards);
    }, [filteredCards]);

    // Decks with the two numbers that matter on the mobile deck list: how many cards are
    // in it, and how many of those are ready to review.
    const deckOptions = useMemo(() => {
        // Alphabetical, like the mobile app's deck list — insertion order (creation time)
        // would otherwise reshuffle every time a deck syncs and gets merged in.
        const ids = Object.keys(backendDeckNames).sort((a, b) =>
            backendDeckNames[a].localeCompare(backendDeckNames[b], undefined, { sensitivity: 'base' })
        );

        // "All cards" is a real, always-available option even with zero named decks yet —
        // otherwise a user with no decks (not signed in, or decks not synced/created here
        // yet) never sees the deck picker at all, which is exactly where "create a deck"
        // and "study a deck" both live.
        const options = [{
            id: null as string | null,
            name: 'All cards',
            count: storedCards.length,
            due: storedCards.filter((card) => isDue(card.srsState)).length,
        }];

        ids.forEach((id) => {
            const inDeck = storedCards.filter((card) => cardMatchesDeck(card, id));
            options.push({
                id,
                name: backendDeckNames[id],
                count: inDeck.length,
                due: inDeck.filter((card) => isDue(card.srsState)).length,
            });
        });
        return options;
    }, [backendDeckNames, storedCards, cardMatchesDeck]);

    const activeDeckName = activeDeckId ? backendDeckNames[activeDeckId] : null;
    const [deckActionBusy, setDeckActionBusy] = useState(false);

    // Local-first: works signed out. renameVaultoDeck/deleteVaultoDeck update the local
    // registry (and reassign affected cards) immediately, and push to Vaulto Cloud in the
    // background when signed in — see store/actions/vaultoDecks.ts.
    const handleRenameDeck = useCallback(async (deckId: string, name: string) => {
        setDeckActionBusy(true);
        try {
            await dispatch(renameVaultoDeck(deckId, name) as any);
        } catch (error: any) {
            showError(error?.message || 'Could not rename the deck.');
        } finally {
            setDeckActionBusy(false);
        }
    }, [dispatch, showError]);

    const handleDeleteDeck = useCallback(async (deckId: string) => {
        setDeckActionBusy(true);
        try {
            await dispatch(deleteVaultoDeck(deckId, defaultDeckId) as any);
            if (activeDeckId === deckId) setActiveDeckId(null);
        } catch (error: any) {
            showError(error?.message || 'Could not delete the deck.');
        } finally {
            setDeckActionBusy(false);
        }
    }, [dispatch, defaultDeckId, activeDeckId, showError]);

    const handleCreateDeck = useCallback(async (name: string) => {
        setDeckActionBusy(true);
        try {
            await dispatch(createVaultoDeck(name) as any);
        } catch (error: any) {
            showError(error?.message || 'Could not create the deck.');
        } finally {
            setDeckActionBusy(false);
        }
    }, [dispatch, showError]);

    // Notes already pulled in from Anki, so re-running an import doesn't duplicate them.
    const importedAnkiNoteIds = useMemo(
        () => new Set(storedCards.map((card) => card.ankiImportedNoteId).filter((id): id is number => typeof id === 'number')),
        [storedCards]
    );

    const handleImportedFromAnki = useCallback((notes: Array<{ noteId: number; front: string; back: string }>) => {
        const targetDeckId = importTargetDeck?.id ?? null;
        notes.forEach((note, index) => {
            tabAware.saveCardToStorage({
                // saveCardToStorage falls back to Date.now().toString() for a missing id,
                // which collides across a tight bulk-import loop like this one (multiple
                // notes landing in the same millisecond silently overwrite each other in
                // the reducer). An explicit, distinct id per note avoids that.
                id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
                    ? crypto.randomUUID()
                    : `anki-import-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
                mode: Modes.GeneralTopic,
                front: note.front,
                back: note.back,
                text: note.front,
                createdAt: new Date(),
                deckId: targetDeckId,
                ankiImportedNoteId: note.noteId,
                syncPending: true,
            });
        });
    }, [importTargetDeck, tabAware]);

    // A deck that disappears (renamed or deleted elsewhere) must not leave the list stuck
    // showing nothing with no obvious way back.
    useEffect(() => {
        if (activeDeckId && !backendDeckNames[activeDeckId]) {
            setActiveDeckId(null);
        }
    }, [activeDeckId, backendDeckNames]);
    const allVisibleSelected = filteredCards.length > 0 && selectedCards.length === filteredCards.length;
    // `indeterminate` is not an attribute, so a partial selection has to be set on the node.
    const selectAllRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (selectAllRef.current) {
            selectAllRef.current.indeterminate = selectedCards.length > 0 && !allVisibleSelected;
        }
    }, [selectedCards.length, allVisibleSelected]);



    // The cloud is the status worth showing: how many cards have reached Vaulto and how
    // many are still on their way. Export to Anki is deliberately not counted here.
    const syncSummary = useMemo(() => {
        let synced = 0;
        for (const card of storedCards) {
            if (isCardSynced(card)) synced += 1;
        }
        return {
            total: storedCards.length,
            synced,
            pending: Math.max(storedCards.length - synced, 0),
        };
    }, [storedCards, isCardSynced]);

    const handleCardSelect = useCallback((cardId: string) => {
        if (editingCard) return;

        setSelectedCards(prev => (
            prev.includes(cardId)
                ? prev.filter(id => id !== cardId)
                : [...prev, cardId]
        ));
    }, [editingCard]);

    const handleSelectAll = useCallback(() => {
        if (editingCard) return;

        setSelectedCards(prev => (
            prev.length === filteredCards.length
                ? []
                : filteredCards.map(card => card.id)
        ));
    }, [editingCard, filteredCards]);

    const handleDelete = (card: StoredCard) => {
        tabAware.deleteStoredCard(card.id);
        setSelectedCards(prev => prev.filter(id => id !== card.id));
        setRecentlyDeleted(card);
    };

    // The undo window closes on its own; the card is already out of the store by then.
    useEffect(() => {
        if (!recentlyDeleted) return undefined;
        const timer = setTimeout(() => setRecentlyDeleted(null), 6000);
        return () => clearTimeout(timer);
    }, [recentlyDeleted]);

    // UPDATE_STORED_CARD re-adds a card it cannot find, so restoring is a plain update.
    const handleUndoDelete = () => {
        if (!recentlyDeleted) return;
        tabAware.updateStoredCard(recentlyDeleted);
        setRecentlyDeleted(null);
    };

    const handleSaveToAnki = async () => {
        if (selectedCards.length === 0) {
            showError('Please select at least one card to save');
            return;
        }

        if (!useAnkiConnect) {
            setAnkiSettingsPrompt('disabled');
            return;
        }

        if (!isAnkiAvailable) {
            setAnkiSettingsPrompt('unavailable');
            return;
        }

        if (!deckId) {
            showError('Please select an Anki deck before saving.');
            return;
        }

        setIsLoading(true);
        try {
            const modelName = 'Basic';
            const selectedCardsData = storedCards.filter(card => selectedCardIds.has(card.id));

            // Group cards by target deck and mode. IDs are tracked in parallel arrays (same
            // index as the corresponding card) so a partial AnkiConnect failure — some notes
            // in a batch rejected as duplicates — can be mapped back to the specific cards
            // that did or didn't actually make it into Anki.
            const exportGroups: Record<string, {
                lang: CardLangLearning[];
                langIds: string[];
                general: CardGeneral[];
                generalIds: string[];
            }> = {};

            // Process cards one by one to handle async image processing
            for (const card of selectedCardsData) {
                const targetDeckName = card.ankiDeckName || deckId;
                if (!exportGroups[targetDeckName]) {
                    exportGroups[targetDeckName] = { lang: [], langIds: [], general: [], generalIds: [] };
                }

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
                        text: card.text || card.front || '',
                        translation: card.translation,
                        examples: card.examples || [],
                        image_base64: processedImageBase64,
                        linguisticInfo: card.linguisticInfo,
                        transcription: card.transcription || '',
                        word_audio_base64: card.wordAudio || null,
                        examples_audio_base64: Array.isArray(card.examplesAudio) ? card.examplesAudio : [],
                        example_transcriptions: Array.isArray(card.exampleTranscriptions)
                            ? card.exampleTranscriptions
                            : [],
                    };

                    debugLog(`Adding language learning card to Anki export (Deck: ${targetDeckName}):`, {
                        cardId: card.id,
                        text: card.text
                    });

                    exportGroups[targetDeckName].lang.push(ankiCard);
                    exportGroups[targetDeckName].langIds.push(card.id);
                } else if (card.mode === Modes.GeneralTopic && (card.front || card.text) && (card.back || card.text)) {
                    // Process image data for GeneralTopic cards too
                    let processedImageBase64 = null;

                    // Check both image and imageUrl fields
                    let imageSource = card.image || card.imageUrl;

                    if (imageSource) {
                        if (imageSource.startsWith('data:')) {
                            // Handle data URI format
                            const base64Prefix = 'base64,';
                            const prefixIndex = imageSource.indexOf(base64Prefix);
                            if (prefixIndex !== -1) {
                                processedImageBase64 = imageSource.substring(prefixIndex + base64Prefix.length);
                            } else {
                                processedImageBase64 = imageSource;
                            }
                        } else if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
                            // Handle URL - need to fetch and convert to base64
                            try {
                                debugLog(`Fetching image from URL for card ${card.id}: ${imageSource}`);
                                const response = await fetch(imageSource);
                                if (response.ok) {
                                    const blob = await response.blob();
                                    const base64Data = await new Promise<string>((resolve) => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => {
                                            const result = reader.result as string;
                                            const base64Prefix = 'base64,';
                                            const prefixIndex = result.indexOf(base64Prefix);
                                            if (prefixIndex !== -1) {
                                                resolve(result.substring(prefixIndex + base64Prefix.length));
                                            } else {
                                                resolve(result);
                                            }
                                        };
                                        reader.readAsDataURL(blob);
                                    });
                                    processedImageBase64 = base64Data;
                                }
                            } catch (error) {
                                console.error(`Error fetching image from URL for card ${card.id}:`, error);
                            }
                        } else {
                            processedImageBase64 = imageSource;
                        }
                    }

                    const generalCard = {
                        front: card.front || card.text || 'No content',
                        back: card.back || card.text || 'No content',
                        text: card.text,
                        image_base64: processedImageBase64
                    };

                    debugLog(`Adding general topic card to Anki export (Deck: ${targetDeckName}):`, {
                        cardId: card.id,
                        text: card.text
                    });

                    exportGroups[targetDeckName].general.push(generalCard);
                    exportGroups[targetDeckName].generalIds.push(card.id);
                }
            }

            // Export each group to its respective deck. Each dispatch is wrapped in its own
            // try/catch so a whole-batch failure in one deck's group (e.g. every note in it
            // already exists in Anki) does not abort the groups still waiting to be sent.
            const succeededIds = new Set<string>();
            let lastGroupError: unknown = null;

            for (const [targetDeckName, groups] of Object.entries(exportGroups)) {
                if (groups.lang.length > 0) {
                    try {
                        const langResult = await dispatch(saveAnkiCards(
                            Modes.LanguageLearning,
                            ankiConnectUrl,
                            ankiConnectApiKey,
                            targetDeckName,
                            modelName,
                            groups.lang
                        ));
                        groups.langIds.forEach((cardId, i) => {
                            if (langResult?.[i] != null) succeededIds.add(cardId);
                        });
                    } catch (error) {
                        lastGroupError = error;
                    }
                }
                if (groups.general.length > 0) {
                    try {
                        const generalResult = await dispatch(saveAnkiCards(
                            Modes.GeneralTopic,
                            ankiConnectUrl,
                            ankiConnectApiKey,
                            targetDeckName,
                            modelName,
                            groups.general
                        ));
                        groups.generalIds.forEach((cardId, i) => {
                            if (generalResult?.[i] != null) succeededIds.add(cardId);
                        });
                    } catch (error) {
                        lastGroupError = error;
                    }
                }
            }

            // Only mark the cards Anki actually accepted — a duplicate or other per-note
            // rejection must never be reported back to the user as a successful export.
            succeededIds.forEach(cardId => {
                tabAware.updateCardExportStatus(cardId, 'exported_to_anki');
                debugLog(`Updated card ${cardId} export status to 'exported_to_anki'`);
            });
            setSelectedCards([]);

            const failedCount = selectedCards.length - succeededIds.size;
            if (failedCount === 0) {
                showError(getAnkiSaveSuccessMessage(selectedCards.length), 'success');
            } else if (succeededIds.size === 0) {
                showError(
                    getAnkiSaveErrorMessage(lastGroupError, selectedCards.length),
                    isAnkiDuplicateError(lastGroupError) ? 'warning' : 'error'
                );
            } else {
                showError(
                    `${succeededIds.size} of ${selectedCards.length} cards saved to Anki. ${failedCount} were not added (likely already exist there).`,
                    'warning'
                );
            }

            // Verify export statuses in active tab state after update.
            setTimeout(() => {
                try {
                    debugLog('Verified export statuses after export:',
                        storedCards
                            .filter((c: any) => c.id && selectedCardIds.has(c.id))
                            .map((c: any) => ({ id: c.id, status: c.exportStatus }))
                    );
                } catch (e) {
                    console.error('Error verifying statuses after export:', e);
                }
            }, 500);
        } catch (error) {
            showError(
                getAnkiSaveErrorMessage(error, selectedCards.length),
                isAnkiDuplicateError(error) ? 'warning' : 'error'
            );
        } finally {
            setIsLoading(false);
        }
    };

    const exportCardsAsFile = () => {
        if (selectedCards.length === 0) {
            showError('Please select at least one card to export');
            return;
        }

        // Generate default filename with current date
        const currentDate = new Date();
        const dateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        const defaultName = `anki_cards_${dateStr}`;
        setExportFileName(defaultName);
        setShowExportModal(true);
    };



    // Sync deserves a glance, not a banner: a single icon next to the search field, with
    // the detail (and the on/off switch) one tap away in Settings. Signed out, the same
    // slot becomes the prompt to sign in, since that is the only real risk of data loss.
    const renderCloudStatusIcon = () => {
        if (!isLoggedIn) {
            // Signed out is the one state that can actually lose data, so unlike the quiet
            // signed-in icon it says so in words: an icon alone leaves people guessing,
            // and a struck-through cloud next to "Not backed up" cannot be misread.
            return (
                <button
                    type="button"
                    onClick={() => tabAware.setCurrentPage('auth')}
                    title="Cards are only on this device. Sign in to back them up."
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-warn-border bg-warn-subtle px-2.5 text-warn-strong transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden>
                        <FaCloud size={13} />
                        {/* The slash is drawn rather than imported: Font Awesome 5 free has
                            no cloud-slash, and a plain cloud reads as "fine". */}
                        <span className="absolute h-[1.5px] w-[18px] rotate-45 rounded-full bg-warn-strong" />
                    </span>
                    <span className="text-[11px] font-semibold">Not backed up</span>
                </button>
            );
        }

        const syncing = syncSummary.pending > 0;
        return (
            <button
                type="button"
                onClick={() => tabAware.setCurrentPage('settings')}
                title={
                    syncing
                        ? `Syncing to Vaulto Cloud… (${syncSummary.pending})`
                        : 'All cards backed up to Vaulto Cloud'
                }
                aria-label={syncing ? 'Syncing to Vaulto Cloud' : 'All cards backed up'}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-line bg-surface-muted transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                {syncing ? (
                    <Loader type="spinner" size="small" inline color="#6C757D" />
                ) : (
                    <FaCloud size={13} className="text-ok-strong" />
                )}
            </button>
        );
    };

    // Decks are the mobile app's primary way in, so the same grouping exists here: pick a
    // deck, see just its cards, study them.
    // One control instead of a scrolling chip row: it names the deck in view and opens
    // the full list, where each deck shows its due count and can be studied directly.
    const renderDeckButton = () => {
        return (
            <button
                type="button"
                onClick={() => setShowDeckSheet(true)}
                className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-control border border-line bg-surface-muted px-2.5 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                <FaLayerGroup size={11} className="shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1 truncate">{activeDeckName || 'All cards'}</span>
                <FaChevronDown size={9} className="shrink-0 text-gray-400" />
            </button>
        );
    };

    // A row is the card's two sides and its age. Everything else — the mode label, the
    // status pill, a full timestamp and two labelled buttons — was chrome that made the
    // list unreadable at a glance.
    const renderCards = () => {
        if (filteredCards.length === 0) {
            const message = searchQuery.trim()
                ? `Nothing matches “${searchQuery.trim()}”`
                : 'No saved cards yet';
            return <p className="px-4 py-10 text-center text-sm text-gray-500">{message}</p>;
        }

        return (
            <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
                {filteredCards.map(card => {
                    const selected = selectedCardIds.has(card.id);
                    const front = (card.front || card.text || '').replace(/\s+/g, ' ').trim();
                    const back = (card.translation || card.back || '').replace(/\s+/g, ' ').trim();

                    return (
                        <div
                            key={card.id}
                            className={`flex items-start gap-2.5 px-3 py-2.5 transition-colors ${
                                selected ? 'bg-accent-subtle' : 'bg-white'
                            }`}
                        >
                            {selectionMode && (
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => handleCardSelect(card.id)}
                                    aria-label={`Select ${front}`}
                                    className="mt-1 h-4 w-4 shrink-0 accent-accent"
                                />
                            )}

                            <button
                                type="button"
                                onClick={() => (selectionMode ? handleCardSelect(card.id) : setPreviewCard(card))}
                                className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                                <span className="block truncate text-[13px] font-semibold text-gray-900">
                                    {front || 'Untitled card'}
                                </span>
                                {back && (
                                    <span className="mt-0.5 block truncate text-xs text-gray-500">{back}</span>
                                )}
                            </button>

                            {/* "In Anki" is a quiet, non-filterable hint — export is an action,
                                not a status you navigate by. */}
                            {(card.exportStatus === 'exported_to_anki' || card.exportStatus === 'exported') && (
                                <span
                                    title="Sent to Anki"
                                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-ok-subtle px-1.5 py-0.5 text-[10px] font-semibold text-ok-strong"
                                >
                                    <FaCheckCircle size={9} /> Anki
                                </span>
                            )}

                            {/* Cloud shows only as an exception: a card still on its way up. The
                                normal, synced state is silent, like Drive/Notion. */}
                            {isLoggedIn && !isCardSynced(card) && (
                                <span
                                    title="Waiting to sync to Vaulto Cloud"
                                    aria-label="Waiting to sync"
                                    className="shrink-0 pt-0.5 text-gray-300"
                                >
                                    <FaCloud size={11} />
                                </span>
                            )}

                            <span className="shrink-0 pt-0.5 text-[11px] text-gray-400">
                                {formatRelativeDate(card.createdAt)}
                            </span>

                            {!selectionMode && (
                                <Menu
                                    label={`Actions for ${front}`}
                                    items={[
                                        { value: 'edit', label: 'Edit card' },
                                        { value: 'move', label: 'Move to deck' },
                                        { value: 'delete', label: 'Delete card' },
                                    ]}
                                    value={''}
                                    onSelect={(action) => {
                                        if (action === 'edit') handleStartEditing(card);
                                        else if (action === 'move') setDeckPickerFor({ kind: 'cards', ids: [card.id] });
                                        else handleDelete(card);
                                    }}
                                    trigger={({ open, toggle }) => (
                                        <button
                                            type="button"
                                            aria-haspopup="menu"
                                            aria-expanded={open}
                                            aria-label={`Actions for ${front}`}
                                            onClick={toggle}
                                            className="-mr-1 shrink-0 rounded-control p-1.5 text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                        >
                                            <FaEllipsisH size={12} />
                                        </button>
                                    )}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleDeckChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        dispatch(setDeckId(e.target.value));
    };


    // Render deck selector dropdown or button

    // Start editing a card
    const handleStartEditing = (card: StoredCard) => {
        // НЕ загружаем данные в глобальный Redux state, так как это влияет на статус карточки в CreateCard
        debugLog('Starting to edit card:', card.id);
        debugLog('Card data:', card);

        // Просто устанавливаем локальное состояние для редактирования
        // БЕЗ изменения глобального Redux state
        setEditingCard(card);
        setLocalEditingCardData({ ...card }); // Создаем копию для локального редактирования
        setShowEditModal(true);
        setLoadingNewExamples(false);
        setLoadingAudio(false);
        setInstructionText('');
        setInstructionStatus(null);
        setLoadingInstruction(false);
        skipNextAutoSave.current = true;

        debugLog('Modal state set for editing card:', card.id);
    };

    // Cancel editing
    const handleCancelEdit = () => {
        debugLog('Canceling edit, resetting modal state...');
        setEditingCard(null);
        setLocalEditingCardData(null); // Очищаем локальные данные
        setShowEditModal(false);
        setLoadingNewExamples(false);
        setLoadingAudio(false);
        setInstructionText('');
        setInstructionStatus(null);
        setLoadingInstruction(false);
        // Otherwise the picker would survive the modal that opened it.
        setDeckPickerFor(prev => (prev?.kind === 'edit' ? null : prev));
        skipNextAutoSave.current = true;
        debugLog('Edit canceled, modal should be hidden now.');
    };


    const buildUpdatedCardData = (): StoredCard | null => {
        if (!editingCard || !localEditingCardData) return null;

        const updatedCardData: StoredCard = {
            ...editingCard,
            text: localEditingCardData.text || editingCard.text || '',
            translation: localEditingCardData.translation || editingCard.translation || '',
            examples: Array.isArray(localEditingCardData.examples)
                ? localEditingCardData.examples
                : (Array.isArray(editingCard.examples) ? editingCard.examples : []),
            front: localEditingCardData.front || editingCard.front || '',
            back: localEditingCardData.back || editingCard.back || '',
            image: localEditingCardData.image || editingCard.image || null,
            imageUrl: localEditingCardData.imageUrl || editingCard.imageUrl || null,
            linguisticInfo: localEditingCardData.linguisticInfo || editingCard.linguisticInfo || '',
            transcription: localEditingCardData.transcription || editingCard.transcription || '',
            wordAudio: localEditingCardData.wordAudio || editingCard.wordAudio || null,
            examplesAudio: Array.isArray(localEditingCardData.examplesAudio)
                ? localEditingCardData.examplesAudio
                : (Array.isArray(editingCard.examplesAudio) ? editingCard.examplesAudio : []),
            exampleTranscriptions: Array.isArray(localEditingCardData.exampleTranscriptions)
                ? localEditingCardData.exampleTranscriptions
                : (
                    Array.isArray(editingCard.exampleTranscriptions)
                        ? editingCard.exampleTranscriptions
                        : []
                ),
            ankiDeckName: localEditingCardData.ankiDeckName ?? editingCard.ankiDeckName ?? null,
            deckId: localEditingCardData.deckId ?? editingCard.deckId ?? null,
        };

        if (updatedCardData.mode === Modes.LanguageLearning) {
            if (!updatedCardData.text || !updatedCardData.translation) {
                showError('Please provide both text and translation');
                return null;
            }

            updatedCardData.text = updatedCardData.text.trim();
            updatedCardData.translation = updatedCardData.translation.trim();
        } else {
            if (!updatedCardData.front || !updatedCardData.back) {
                showError('Please provide both front and back content');
                return null;
            }

            updatedCardData.front = updatedCardData.front.trim();
            updatedCardData.back = updatedCardData.back?.trim() || null;
        }

        return updatedCardData;
    };

    // Auto-save: every edit in the modal is persisted on its own (and, when logged in,
    // mirrored to Vaulto Cloud by cardsSyncMiddleware). No "Save" button to press.
    // Transient invalid states (a momentarily empty field) are skipped silently rather
    // than flashing an error toast.
    useEffect(() => {
        if (!showEditModal || !editingCard || !localEditingCardData) return;
        if (skipNextAutoSave.current) {
            skipNextAutoSave.current = false;
            return;
        }

        const isLangLearning = localEditingCardData.mode === Modes.LanguageLearning;
        const valid = isLangLearning
            ? Boolean(localEditingCardData.text?.trim() && localEditingCardData.translation?.trim())
            : Boolean(localEditingCardData.front?.trim() && localEditingCardData.back);
        if (!valid) return;

        const handle = setTimeout(() => {
            tabAware.updateStoredCard({
                ...editingCard,
                ...localEditingCardData,
                text: (localEditingCardData.text || editingCard.text || '').trim(),
            });
        }, 800);
        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [localEditingCardData]);


    const buildAnkiPayload = async (card: StoredCard): Promise<{ mode: Modes; cards: CardLangLearning[] | CardGeneral[] } | null> => {
        if (!card) return null;

        if (card.mode === Modes.LanguageLearning) {
            let processedImageBase64: string | null = null;
            const imageSource = card.image || card.imageUrl;
            if (imageSource) {
                if (imageSource.startsWith('data:')) {
                    const base64Prefix = 'base64,';
                    const prefixIndex = imageSource.indexOf(base64Prefix);
                    processedImageBase64 = prefixIndex !== -1
                        ? imageSource.substring(prefixIndex + base64Prefix.length)
                        : imageSource;
                } else if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
                    const response = await fetch(imageSource);
                    if (response.ok) {
                        const blob = await response.blob();
                        processedImageBase64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                const base64Prefix = 'base64,';
                                const prefixIndex = result.indexOf(base64Prefix);
                                resolve(prefixIndex !== -1 ? result.substring(prefixIndex + base64Prefix.length) : result);
                            };
                            reader.readAsDataURL(blob);
                        });
                    }
                } else {
                    processedImageBase64 = imageSource;
                }
            }

            const ankiCard: CardLangLearning = {
                text: card.text || card.front || '',
                translation: card.translation || '',
                examples: card.examples || [],
                image_base64: processedImageBase64,
                linguisticInfo: card.linguisticInfo,
                transcription: card.transcription || '',
                word_audio_base64: card.wordAudio || null,
                examples_audio_base64: Array.isArray(card.examplesAudio) ? card.examplesAudio : [],
                example_transcriptions: Array.isArray(card.exampleTranscriptions)
                    ? card.exampleTranscriptions
                    : [],
            };

            return { mode: Modes.LanguageLearning, cards: [ankiCard] };
        }

        if (card.mode === Modes.GeneralTopic) {
            let processedImageBase64: string | null = null;
            const imageSource = card.image || card.imageUrl;
            if (imageSource) {
                if (imageSource.startsWith('data:')) {
                    const base64Prefix = 'base64,';
                    const prefixIndex = imageSource.indexOf(base64Prefix);
                    processedImageBase64 = prefixIndex !== -1
                        ? imageSource.substring(prefixIndex + base64Prefix.length)
                        : imageSource;
                } else if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
                    const response = await fetch(imageSource);
                    if (response.ok) {
                        const blob = await response.blob();
                        processedImageBase64 = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                const result = reader.result as string;
                                const base64Prefix = 'base64,';
                                const prefixIndex = result.indexOf(base64Prefix);
                                resolve(prefixIndex !== -1 ? result.substring(prefixIndex + base64Prefix.length) : result);
                            };
                            reader.readAsDataURL(blob);
                        });
                    }
                } else {
                    processedImageBase64 = imageSource;
                }
            }

            const ankiCard: CardGeneral = {
                text: card.text || card.front || '',
                front: card.front || card.text || '',
                back: card.back || card.text || '',
                image_base64: processedImageBase64,
            };

            return { mode: Modes.GeneralTopic, cards: [ankiCard] };
        }

        return null;
    };

    // Local edits auto-save (and, when logged in, auto-sync to Vaulto Cloud via
    // cardsSyncMiddleware). Anki is the one destination that is a deliberate push to an
    // external app, so it keeps an explicit button.
    // Shared by the preview and the editor, so a card can be exported without first
    // having to enter edit mode.
    const sendCardToAnki = async (card: StoredCard): Promise<boolean> => {
        const targetAnkiDeck = card.ankiDeckName || deckId || '';
        if (!targetAnkiDeck) {
            showError('Please select an Anki deck first.');
            return false;
        }

        setLoadingSync(true);
        try {
            // Commit the latest edit up front so what lands in Anki matches the card.
            tabAware.updateStoredCard(card);

            const payload = await buildAnkiPayload(card);
            if (!payload) {
                showError('Unable to build Anki payload for this card.');
                return false;
            }
            await createAnkiCards(payload.mode, ankiConnectUrl, ankiConnectApiKey, targetAnkiDeck, 'Basic', payload.cards);
            tabAware.updateCardExportStatus(card.id, 'exported_to_anki');
            showError(getAnkiSaveSuccessMessage(payload.cards.length), 'success');
            return true;
        } catch (error: any) {
            console.error('Anki export failed:', error);
            showError(
                getAnkiSaveErrorMessage(error),
                isAnkiDuplicateError(error) ? 'warning' : 'error'
            );
            return false;
        } finally {
            setLoadingSync(false);
        }
    };

    const handleSendToAnki = async () => {
        if (!editingCard || !localEditingCardData) return;

        const updatedCardData = buildUpdatedCardData();
        if (!updatedCardData) return;

        if (await sendCardToAnki(updatedCardData)) {
            handleCancelEdit();
        }
    };

    // Anki is optional, so a blocked export must say what to do about it instead of
    // silently sitting there greyed out with a tooltip.
    const getAnkiIssue = (card: StoredCard | null): { text: string; action: 'settings' | 'deck' } | null => {
        if (!useAnkiConnect) return { text: 'Anki export is off.', action: 'settings' };
        if (!isAnkiAvailable) return { text: "Anki isn't responding.", action: 'settings' };
        if (!(card?.ankiDeckName ?? deckId ?? null)) return { text: 'No Anki deck picked yet.', action: 'deck' };
        return null;
    };

    // Handle new image generation in modal. `instructionOverride` lets the instruction
    // composer steer the picture ("watercolour", "flat icon", …) instead of the saved
    // default image style.
    const handleNewImageInModal = async (instructionOverride?: string) => {
        if (!editingCard) return;

        try {
            // Check if we have API keys
            if (!openAiKey) {
                throw new Error('OpenAI API key is not configured. Please add it in the settings.');
            }

            const effectiveImageInstruction = (instructionOverride?.trim() || imageInstructions || '');

            // Используем локальное состояние вместо Redux
            const currentText = localEditingCardData?.text || editingCard.text;

            debugLog('Starting image generation for text:', currentText);

            // 1. Get an image description
            const descriptionImage = await getDescriptionImage(openAiKey, currentText, effectiveImageInstruction, undefined, sourceLanguage || undefined);
            const safeDescriptionImage = buildSafeImagePrompt(currentText, descriptionImage);
            debugLog('Description generated:', safeDescriptionImage);

            if (!safeDescriptionImage) {
                throw new Error('Failed to generate image description');
            }

            // 2. Generate image using OpenAI API
            const noTextRule = ' no text, no letters, no numbers, no captions, no signs, no logos, no watermarks, no typography, no written content.';
            const finalPrompt = (effectiveImageInstruction
                ? `${safeDescriptionImage}. ${effectiveImageInstruction}`
                : safeDescriptionImage) + noTextRule;

            const modelsToTry = [OPENAI_IMAGE_MODEL];
            let imageSource: string | null = null;

            for (let modelIndex = 0; modelIndex < modelsToTry.length; modelIndex++) {
                const currentModel = modelsToTry[modelIndex];
                const response = await backgroundFetch(
                    'https://api.openai.com/v1/images/generations',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openAiKey}`
                        },
                        body: JSON.stringify({
                            model: currentModel,
                            prompt: finalPrompt,
                            n: 1,
                            size: OPENAI_IMAGE_SIZE,
                            quality: OPENAI_IMAGE_QUALITY,
                            background: OPENAI_IMAGE_BACKGROUND
                        })
                    }
                );

                const data = await response.json();
                debugLog('OpenAI direct API response:', data);

                if (!response.ok) {
                    if (data?.error) {
                        const fallbackModel = getFallbackImageModelForError(data, currentModel);
                        if (fallbackModel && !modelsToTry.includes(fallbackModel)) {
                            console.warn(`Falling back from ${currentModel} to ${fallbackModel} because organization verification is required.`);
                            modelsToTry.push(fallbackModel);
                            continue;
                        }

                        throw new Error(formatOpenAIErrorMessage(data));
                    }

                    throw new Error(`OpenAI image API error: ${response.status} ${response.statusText}`);
                }

                const { imageUrl, imageBase64 } = extractOpenAIImagePayload(data);
                imageSource = imageBase64 || imageUrl;
                if (imageSource) {
                    break;
                }
            }

            if (!imageSource) {
                throw new Error('OpenAI did not return image data');
            }

            debugLog('Image payload generated:', imageSource.startsWith('data:image') ? 'base64' : 'url');

            const imageData = imageSource.startsWith('data:image') ? imageSource : await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(imageSource, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending message:', chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                        return;
                    }

                    debugLog('Response from background script:', response);

                    if (response && response.status && response.data) {
                        resolve(response.data);
                    } else {
                        reject(new Error('Failed to get image data from background script'));
                    }
                });
            });

            debugLog('Image data received from background');

            // Обновляем локальное состояние с новым изображением
            if (localEditingCardData) {
                setLocalEditingCardData({
                    ...localEditingCardData,
                    imageUrl: imageData as string,
                    image: imageData as string
                });
            }

            // Удалили навязчивое success уведомление
        } catch (error: any) {
            console.error('Error generating image:', error);
            showError(`Image generation failed: ${error?.message || 'Unknown error'}`);
        }
    };

    // Handle new examples generation in modal — runs through the same createExamples the
    // create screen uses. `instructionOverride` carries free-form asks ("5 examples",
    // "make them formal") straight into the prompt.
    const handleNewExamplesInModal = async (instructionOverride?: string) => {
        if (!editingCard || !localEditingCardData) return;
        if (!apiKey) {
            showError('An AI API key is required to generate examples. Add it in Settings.');
            return;
        }

        try {
            setLoadingNewExamples(true);
            const currentText = localEditingCardData.text || localEditingCardData.front || editingCard.text || '';
            const result = await createExamples(
                aiService,
                apiKey,
                currentText,
                translateToLanguage,
                true,
                instructionOverride?.trim() || undefined,
                sourceLanguage || undefined,
            );
            const newExamples = result.map((ex) => [ex.original, ex.translated] as [string, string | null]);
            const newExampleTranscriptions =
                await generateExampleTranscriptionsFor(newExamples);
            setLocalEditingCardData((prev) => prev ? ({
                ...prev,
                examples: newExamples,
                examplesAudio: new Array(newExamples.length).fill(null),
                exampleTranscriptions: newExampleTranscriptions,
            }) : prev);
        } catch (error: any) {
            console.error('Error generating examples:', error);
            showError(`Examples generation failed: ${error?.message || 'Unknown error'}`);
            throw error;
        } finally {
            setLoadingNewExamples(false);
        }
    };

    // The centrepiece of the redesigned editor: the user types what they want in plain
    // language, the model works out which parts that touches, and only those are redone.
    const handleApplyInstructionInModal = async (rawInstruction: string) => {
        const instruction = rawInstruction.trim();
        if (!instruction || loadingInstruction || !localEditingCardData) return;

        if (!apiKey && !openAiKey) {
            showError('An AI API key is required. Add it in Settings.');
            return;
        }

        setLoadingInstruction(true);
        setInstructionStatus(null);

        try {
            const currentText = localEditingCardData.text || localEditingCardData.front || '';
            const hasImage = Boolean(localEditingCardData.image || localEditingCardData.imageUrl);

            // The model decides which parts of the card the request touches. Matching
            // keywords here could only ever recognise the phrasings someone thought to
            // list, in the languages they thought to list them in.
            setInstructionStatus('Working out what to change…');
            const plan = await planInstruction(aiService, apiKey, instruction, {
                word: currentText,
                hasImage,
                language: translateToLanguage,
            });

            for (const action of plan.actions) {
                setInstructionStatus(ACTION_STATUS[action]);

                if (action === 'audio') {
                    await handleGenerateAudioInModal();
                } else if (action === 'image') {
                    await handleNewImageInModal(plan.detail);
                } else if (action === 'examples') {
                    await handleNewExamplesInModal(plan.detail);
                } else if (action === 'translation') {
                    const translation = await createTranslation(
                        aiService,
                        apiKey,
                        currentText,
                        translateToLanguage,
                        plan.detail,
                        sourceLanguage || undefined,
                    );
                    if (translation?.translated) {
                        setLocalEditingCardData((prev) => prev ? ({ ...prev, translation: translation.translated }) : prev);
                    }
                } else if (action === 'grammar') {
                    // Signature is (…, text, sourceLanguage, interfaceLanguage) — the two
                    // languages are easy to swap by mistake.
                    const linguisticInfo = await createLinguisticInfo(
                        aiService,
                        apiKey,
                        currentText,
                        sourceLanguage || '',
                        translateToLanguage,
                    );
                    if (linguisticInfo) {
                        setLocalEditingCardData((prev) => prev ? ({ ...prev, linguisticInfo }) : prev);
                    }
                } else {
                    const result = await createCardComponentsParallel(
                        aiService,
                        apiKey,
                        currentText,
                        translateToLanguage,
                        plan.detail,
                        sourceLanguage || undefined,
                        hasImage,
                        undefined,
                        hasImage ? 'always' : 'off',
                        false,
                        'off',
                        openAiKey,
                        undefined,
                        {
                            mode: transcriptionMode,
                            language: transcriptionLanguage,
                            extraLanguages: transcriptionExtraLanguages,
                        },
                    );

                    const rebuiltExamples = result.examples
                        ? result.examples.map(
                            (ex) => [ex.original, ex.translated] as [string, string | null]
                        )
                        : null;
                    const rebuiltExampleTranscriptions = rebuiltExamples
                        ? await generateExampleTranscriptionsFor(rebuiltExamples)
                        : null;

                    setLocalEditingCardData((prev) => {
                        if (!prev) return prev;
                        const next = { ...prev };
                        if (result.translation?.translated) next.translation = result.translation.translated;
                        if (rebuiltExamples) {
                            next.examples = rebuiltExamples;
                            next.examplesAudio = new Array(rebuiltExamples.length).fill(null);
                            next.exampleTranscriptions =
                                rebuiltExampleTranscriptions || [];
                        }
                        if (result.imageUrl) {
                            next.imageUrl = result.imageUrl;
                            next.image = result.imageUrl;
                        }
                        if (result.linguisticInfo) next.linguisticInfo = result.linguisticInfo;
                        if (result.transcription) {
                            const transcriptionHtml = formatTranscriptionHtml(
                                result.transcription,
                                transcriptionLanguage,
                            );
                            if (transcriptionHtml) next.transcription = transcriptionHtml;
                        }
                        if (result.flashcard?.front) next.front = result.flashcard.front;
                        if (result.translation?.translated && prev.mode !== Modes.LanguageLearning) {
                            next.back = result.translation.translated;
                        }
                        return next;
                    });
                }
            }

            setInstructionText('');
            setInstructionStatus(null);
        } catch (error: any) {
            console.error('Error applying instruction:', error);
            setInstructionStatus(null);
            showError(error?.message || 'Could not apply that change. Try rephrasing it.');
        } finally {
            setLoadingInstruction(false);
        }
    };

    // The studied word maps to `text` for language cards and to `front` for general ones.
    const handleWordUpdate = (newWord: string) => {
        setLocalEditingCardData((prev) => {
            if (!prev) return prev;
            return prev.mode === Modes.LanguageLearning
                ? { ...prev, text: newWord, front: newWord }
                : { ...prev, front: newWord };
        });
    };

    // Translation edited on the card.
    const handleTranslationUpdate = (newTranslation: string) => {
        // Обновляем локальное состояние вместо глобального Redux
        if (localEditingCardData) {
            setLocalEditingCardData({
                ...localEditingCardData,
                translation: newTranslation
            });
        }
    };

    // From the editor the change joins the debounced auto-save; from the preview there is
    // no draft to fold it into, so it is written straight through.
    const applyDeckChange = (patch: Partial<StoredCard>) => {
        if (deckPickerFor?.kind === 'preview') {
            if (!previewCard) return;
            // Persist outside the state updater: updaters must stay pure (React can run
            // them twice), and a doubled updateStoredCard would fire two syncs.
            const updated = { ...previewCard, ...patch };
            setPreviewCard(updated);
            tabAware.updateStoredCard(updated);
            return;
        }

        if (deckPickerFor?.kind === 'cards') {
            // Moving cards from the list: no draft to fold into, write straight through.
            const ids = new Set(deckPickerFor.ids);
            storedCards
                .filter((card) => ids.has(card.id))
                .forEach((card) => tabAware.updateStoredCard({ ...card, ...patch }));
            return;
        }

        setLocalEditingCardData(prev => prev ? ({ ...prev, ...patch }) : prev);
    };

    const handleAnkiDeckChangeInModal = (deckName: string | null) => {
        applyDeckChange({ ankiDeckName: deckName });
    };

    const handleBackendDeckChangeInModal = (deckIdValue: string | null) => {
        applyDeckChange({ deckId: deckIdValue });
    };

    // Examples edited on the card; audio is dropped for any example whose text changed.
    const handleExamplesUpdate = (newExamples: Array<[string, string | null]>) => {
        // Обновляем локальное состояние вместо глобального Redux
        if (localEditingCardData) {
            const prevExamples = Array.isArray(localEditingCardData.examples) ? localEditingCardData.examples : [];
            const prevExamplesAudio = Array.isArray(localEditingCardData.examplesAudio) ? localEditingCardData.examplesAudio : [];
            const prevExampleTranscriptions =
                Array.isArray(localEditingCardData.exampleTranscriptions)
                    ? localEditingCardData.exampleTranscriptions
                    : [];
            const nextExamplesAudio = newExamples.map((examplePair, index) => {
                const prevPair = prevExamples[index];
                if (!prevPair || prevPair[0] !== examplePair[0]) {
                    return null;
                }
                return prevExamplesAudio[index] ?? null;
            });
            const nextExampleTranscriptions = newExamples.map((examplePair, index) => {
                const prevPair = prevExamples[index];
                if (!prevPair || prevPair[0] !== examplePair[0]) {
                    return null;
                }
                return prevExampleTranscriptions[index] ?? null;
            });
            setLocalEditingCardData({
                ...localEditingCardData,
                examples: newExamples,
                examplesAudio: nextExamplesAudio,
                exampleTranscriptions: nextExampleTranscriptions,
            });
        }
    };

    const handleGenerateAudioInModal = async () => {
        if (!localEditingCardData) return;
        if (!openAiKey) {
            showError('OpenAI API key is required to generate audio');
            return;
        }

        const examples = Array.isArray(localEditingCardData.examples) ? localEditingCardData.examples : [];
        const currentAudio = Array.isArray(localEditingCardData.examplesAudio) ? localEditingCardData.examplesAudio : [];
        const studiedWord = (localEditingCardData.text || localEditingCardData.front || '').trim();
        const hasWordToGenerate = !!studiedWord && !localEditingCardData.wordAudio;
        const missingIndexes = examples
            .map((_example, index) => index)
            .filter((index) => !currentAudio[index] && examples[index]?.[0]?.trim());
        const hasExamplesToGenerate = missingIndexes.length > 0;

        if (!hasWordToGenerate && !hasExamplesToGenerate) {
            return;
        }

        try {
            setLoadingAudio(true);
            if (hasWordToGenerate) {
                const wordAudioDataUrl = await getOpenAiSpeechAudioDataUrl(openAiKey, studiedWord);
                if (wordAudioDataUrl) {
                    setLocalEditingCardData((prev) => prev ? ({ ...prev, wordAudio: wordAudioDataUrl }) : prev);
                }
            }

            const nextAudio = Array.from({ length: examples.length }, (_v, i) => currentAudio[i] ?? null);
            if (hasExamplesToGenerate) {
                const generationResults = await Promise.allSettled(
                    missingIndexes.map(async (index) => ({
                        index,
                        audioDataUrl: await getOpenAiSpeechAudioDataUrl(openAiKey, examples[index][0]),
                    }))
                );

                generationResults.forEach((result) => {
                    if (result.status === 'fulfilled' && result.value.audioDataUrl) {
                        nextAudio[result.value.index] = result.value.audioDataUrl;
                    }
                });

                setLocalEditingCardData((prev) => prev ? ({ ...prev, examplesAudio: [...nextAudio] }) : prev);
            }
        } catch (error: any) {
            console.error('Error generating audio in modal:', error);
            showError(error?.message || 'Failed to generate audio');
        } finally {
            setLoadingAudio(false);
        }
    };

    // Back field edited on the card (general-topic mode).
    const handleBackUpdate = (newBack: string) => {
        // Обновляем локальное состояние вместо глобального Redux
        if (localEditingCardData) {
            setLocalEditingCardData({
                ...localEditingCardData,
                back: newBack
            });
        }
    };

    // Grammar reference edited on the card.
    const handleLinguisticInfoUpdate = (newInfo: string) => {
        // Обновляем локальное состояние вместо глобального Redux
        if (localEditingCardData) {
            setLocalEditingCardData({
                ...localEditingCardData,
                linguisticInfo: newInfo
            });
        }
    };

    // Where a card is saved, as chips — tapping anywhere on the row opens the picker, so
    // the destination can be changed from the preview as well as from the editor.
    const renderDestinationRow = (card: StoredCard, target: DeckPickerTarget) => {
        const effectiveAnkiDeck = card.ankiDeckName ?? deckId ?? null;
        const showAnki = Boolean(useAnkiConnect && isAnkiAvailable && effectiveAnkiDeck);

        return (
            <button
                type="button"
                onClick={() => setDeckPickerFor(target)}
                aria-label="Change where this card is saved"
                className="flex w-full items-center gap-1.5 rounded-control px-1 py-1 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    {/* The Vaulto deck is always the card's home, on this device or not —
                        only the icon's color changes to say whether it's backed up. */}
                    <span className="flex min-w-0 max-w-[60%] items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-2 pr-2">
                        <FaCloud size={10} className={`shrink-0 ${isLoggedIn ? 'text-ok-strong' : 'text-gray-400'}`} />
                        <span className="truncate text-[12px] font-medium text-gray-700">
                            {vaultoDeckLabel(card)}
                        </span>
                    </span>
                    {showAnki && (
                        <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-white py-0.5 pl-2 pr-2">
                            <FaDesktop size={10} className="shrink-0 text-gray-400" />
                            <span className="truncate text-[12px] font-medium text-gray-700">
                                {effectiveAnkiDeck}
                            </span>
                        </span>
                    )}
                </span>
                <FaChevronRight size={9} className="shrink-0 text-gray-400" />
            </button>
        );
    };

    // Rather than a dead greyed-out button, say why export is unavailable and offer the fix.
    const renderAnkiIssue = (
        issue: { text: string; action: 'settings' | 'deck' },
        target: DeckPickerTarget
    ) => (
        <div className="flex items-center gap-2 rounded-control border border-line bg-white px-2.5 py-1.5">
            <FaExclamationTriangle size={10} className="shrink-0 text-warn" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-gray-500">{issue.text}</span>
            <button
                type="button"
                onClick={() => (issue.action === 'settings' ? handleOpenSettings() : setDeckPickerFor(target))}
                className="shrink-0 rounded-control px-1.5 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                {issue.action === 'settings' ? 'Open Settings' : 'Pick deck'}
            </button>
        </div>
    );

    // Render the modal for editing cards
    const renderEditModal = () => {
        if (!showEditModal || !editingCard || !localEditingCardData) {
            return null;
        }

        const { image, imageUrl } = localEditingCardData;
        const hasAiKey = Boolean(apiKey || openAiKey);
        const hasImage = Boolean(image || imageUrl);
        const ankiIssue = getAnkiIssue(localEditingCardData);

        // Audio generation lost its button when the editor moved to the study-card layout;
        // it lives here now, offered only while something is still missing a recording.
        const cardExamples = Array.isArray(localEditingCardData.examples) ? localEditingCardData.examples : [];
        const cardExamplesAudio = Array.isArray(localEditingCardData.examplesAudio) ? localEditingCardData.examplesAudio : [];
        const missingAudio = !localEditingCardData.wordAudio
            || cardExamples.some((example, i) => (example?.[0] || '').trim() && !cardExamplesAudio[i]);

        const suggestions: InstructionSuggestion[] = [
            ...(missingAudio ? [{ label: 'Add audio', instruction: 'Add audio pronunciation' }] : []),
            ...(hasImage ? [{ label: 'New picture', instruction: 'Draw a new picture for this word' }] : []),
            { label: 'New examples', instruction: 'Write a fresh set of example sentences' },
            { label: '5 examples', instruction: 'Give exactly 5 example sentences' },
            { label: 'Simpler translation', instruction: 'Use a simpler, more common translation' },
        ];

        return (
            <Modal
                open
                onClose={handleCancelEdit}
                title="Edit card"
                maxWidth={360}
                footer={
                    <div className="flex flex-col gap-3">
                        <InstructionComposer
                            value={instructionText}
                            onChange={setInstructionText}
                            onSubmit={handleApplyInstructionInModal}
                            loading={loadingInstruction}
                            status={instructionStatus}
                            suggestions={suggestions}
                            disabled={!hasAiKey}
                            disabledHint="Add an AI API key in Settings to change cards with instructions."
                        />

                        <div className="border-t border-line pt-2.5">
                            {renderDestinationRow(localEditingCardData, { kind: 'edit' })}
                        </div>

                        {ankiIssue && renderAnkiIssue(ankiIssue, { kind: 'edit' })}

                        <div className="flex items-center gap-2">
                            {!ankiIssue && (
                                <Button
                                    variant="secondary"
                                    fullWidth
                                    onClick={handleSendToAnki}
                                    disabled={loadingSync}
                                >
                                    {loadingSync ? (
                                        <>
                                            <Loader type="spinner" size="small" inline color="#6C757D" />
                                            Sending…
                                        </>
                                    ) : (
                                        'Send to Anki'
                                    )}
                                </Button>
                            )}
                            {/* Changes auto-save, so this is a plain, unmistakable way out. */}
                            <Button variant="primary" fullWidth onClick={handleCancelEdit}>
                                Done
                            </Button>
                        </div>
                    </div>
                }
            >
                <StudyCard
                    card={localEditingCardData}
                    editable
                    busy={loadingInstruction}
                    onWordChange={handleWordUpdate}
                    onTranslationChange={editingCard.mode === Modes.LanguageLearning ? handleTranslationUpdate : handleBackUpdate}
                    onExamplesChange={handleExamplesUpdate}
                    onGrammarChange={handleLinguisticInfoUpdate}
                />
            </Modal>
        );
    };

    // One picker for both the preview and the editor; the target decides what it writes to.
    const renderDeckPicker = () => {
        if (!deckPickerFor) return null;
        const card = deckPickerFor.kind === 'preview' ? previewCard
            : deckPickerFor.kind === 'cards' ? storedCards.find((c) => c.id === deckPickerFor.ids[0])
            : localEditingCardData;
        if (!card) return null;

        return (
            <Modal
                open
                onClose={() => setDeckPickerFor(null)}
                title={
                    deckPickerFor.kind === 'cards' && deckPickerFor.ids.length > 1
                        ? `Move ${deckPickerFor.ids.length} cards`
                        : 'Where this card is saved'
                }
            >
                <div className="px-3 pb-3">
                    <DeckSelector
                        onBackendDeckChange={handleBackendDeckChangeInModal}
                        onAnkiDeckChange={handleAnkiDeckChangeInModal}
                        initialBackendDeckId={card.deckId ?? null}
                        initialAnkiDeckName={card.ankiDeckName ?? deckId ?? null}
                    />
                </div>
            </Modal>
        );
    };


    const performFileExport = async () => {
        if (selectedCards.length === 0) {
            showError('Please select at least one card to export');
            return;
        }

        try {
            setIsExporting(true);

            const selectedCardsData = storedCards.filter(card => selectedCardIds.has(card.id));

            // Create a simpler format without embedded images, following the exact example format
            let exportContent = "#separator:tab\n#html:true\n";

            selectedCardsData.forEach((card, index) => {
                debugLog(`Processing card ${index} for file export:`, {
                    id: card.id,
                    mode: card.mode,
                    hasImage: !!card.image,
                    hasImageUrl: !!card.imageUrl,
                    imageType: typeof card.image,
                    imageUrlType: typeof card.imageUrl,
                    imageLength: card.image?.length,
                    imageUrlLength: card.imageUrl?.length,
                    imagePreview: card.image?.substring(0, 50),
                    imageUrlPreview: card.imageUrl?.substring(0, 50),
                    hasLinguisticInfo: !!card.linguisticInfo
                });

                if (card.mode === Modes.LanguageLearning) {
                    // Front is the studied word/phrase (fallback to front if text missing)
                    const front = (card.text || card.front || '').trim();

                    // Map StoredCard to a format compatible with ankiService formatting helpers
                    const cardForFormatting = {
                        ...card,
                        image_base64: card.image || card.imageUrl, // Handle both
                        word_audio_base64: card.wordAudio,
                        examples_audio_base64: card.examplesAudio,
                        example_transcriptions: card.exampleTranscriptions,
                        // For file export, we want to embed the audio directly as data URIs
                        ankiAudioTag: card.wordAudio ?
                            (card.wordAudio.startsWith('data:') ? card.wordAudio : `data:audio/mpeg;base64,${card.wordAudio}`) :
                            '',
                        exampleAudioTags: (card.examplesAudio || []).map(audio =>
                            audio ? (audio.startsWith('data:') ? audio : `data:audio/mpeg;base64,${audio}`) : ''
                        )
                    };

                    // Use the shared formatting logic from ankiService
                    const back = format_back_lang_learning(cardForFormatting);

                    // Clean the front and back content to avoid tab/newline issues
                    const cleanFront = front.replace(/\t/g, ' ').replace(/\n/g, ' ').trim();
                    // Keep HTML compact for file export; converting template newlines to <br>
                    // makes pronunciation/grammar blocks artificially tall.
                    const cleanBack = back.replace(/\t/g, ' ').replace(/\r?\n\s*/g, '').trim();

                    // Export the formatted card with proper escaping
                    exportContent += `${cleanFront}\t${cleanBack}\n`;

                    debugLog(`Exported card ${index}:`, {
                        front: cleanFront.substring(0, 50),
                        backLength: cleanBack.length,
                        hasLinguisticInfo: cleanBack.includes('Grammar & Linguistics')
                    });
                }
                else if (card.mode === Modes.GeneralTopic) {
                    const front = (card.front || card.text || 'No content').trim();
                    let back = (card.back || card.text || '').trim();

                    // Add image to back if exists
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
                                // Add image to back content
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
                                // Add image to back content
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

                    // Clean the content to avoid tab/newline issues
                    const cleanFront = front.replace(/\t/g, ' ').replace(/\n/g, ' ').trim();
                    const cleanBack = back.replace(/\t/g, ' ').replace(/\r?\n/g, '<br>').trim();

                    exportContent += `${cleanFront}\t${cleanBack}\n`;

                    debugLog(`Exported General Topic card ${index}:`, {
                        front: cleanFront.substring(0, 50),
                        backLength: cleanBack.length,
                        hasImage: !!(card.image || card.imageUrl),
                        imageSource: card.image ? 'image field' : card.imageUrl ? 'imageUrl field' : 'none'
                    });
                }
            });

            // Sanitize filename - remove invalid characters and ensure .txt extension
            let fileName = exportFileName.trim();
            if (!fileName) {
                fileName = 'anki_cards';
            }

            // Remove invalid filename characters
            fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');

            // Add .txt extension if not present
            if (!fileName.toLowerCase().endsWith('.txt')) {
                fileName += '.txt';
            }

            // Create and download file
            const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Log export summary for debugging
            const totalCards = selectedCardsData.length;
            const cardsWithLinguistics = selectedCardsData.filter(card => card.linguisticInfo && card.linguisticInfo.trim()).length;
            debugLog(`Export complete: ${totalCards} cards exported, ${cardsWithLinguistics} with grammar information`);

            // Show success message
            // Удалили навязчивое success уведомление об экспорте

            // Update export status for selected cards
            selectedCards.forEach(cardId => {
                tabAware.updateCardExportStatus(cardId, 'exported_to_file');
                debugLog(`Updated card ${cardId} export status to 'exported_to_file'`);
            });
            setSelectedCards([]);

            // Close modal
            setShowExportModal(false);

            // Verify export statuses in active tab state after update.
            setTimeout(() => {
                try {
                    debugLog('Verified export statuses after file export:',
                        storedCards
                            .filter((c: any) => c.id && selectedCardIds.has(c.id))
                            .map((c: any) => ({ id: c.id, status: c.exportStatus }))
                    );
                } catch (e) {
                    console.error('Error verifying statuses after file export:', e);
                }
            }, 500);

        } catch (error) {
            console.error('Error during file export:', error);
            showError('Failed to export cards. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };



    return (
        <div className="relative mx-auto flex h-full w-full max-w-[360px] flex-col px-3 pb-2">
            {ankiSettingsPrompt && (
                <div className="mb-3 flex shrink-0 items-center gap-2.5 rounded-card border border-warn-border bg-warn-subtle px-3 py-2">
                    <span className="min-w-0 flex-1 text-xs leading-snug text-warn-strong">
                        {ankiSettingsPrompt === 'disabled'
                            ? 'Turn on AnkiConnect in Settings to save cards to Anki.'
                            : 'Anki is not responding. Check that it is running with the AnkiConnect add-on.'}
                    </span>
                    <button
                        type="button"
                        onClick={handleOpenSettings}
                        className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-warn-strong transition-colors hover:bg-warn-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        Settings
                    </button>
                </div>
            )}

            {storedCards.length === 0 ? (
                <p className="px-4 py-16 text-center text-sm text-gray-500">
                    No saved cards yet. Create one from the Create tab.
                </p>
            ) : (
                <>
                    {/* The deck picker gets its own row, always — it's also the only way to
                        discover "create a deck" and "study a deck" when there are no named
                        decks yet (not signed in, or none created/synced on this device).
                        Cramming it next to search below left the input too narrow to type
                        into. */}
                    <div className="mb-2 flex shrink-0 items-center gap-2">
                        {renderDeckButton()}
                        {renderCloudStatusIcon()}
                    </div>
                    <div className="mb-2 flex shrink-0 items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <FaSearch
                                size={12}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search cards…"
                                aria-label="Search cards"
                                className="h-9 w-full rounded-control border border-line bg-surface-muted pl-9 pr-3 text-sm text-gray-800 transition-colors placeholder:text-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20"
                            />
                        </div>
                    </div>

                    {/* In selection mode this becomes a real select-all checkbox, sitting in
                        the same column as the row checkboxes. It used to be a small "All"
                        text link inside the action bar, two steps away from the list. */}
                    <div className="mb-2 flex shrink-0 items-center gap-2.5">
                        {selectionMode ? (
                            <>
                                <input
                                    type="checkbox"
                                    ref={selectAllRef}
                                    checked={allVisibleSelected}
                                    onChange={handleSelectAll}
                                    aria-label={allVisibleSelected ? 'Clear selection' : 'Select all cards'}
                                    className="h-4 w-4 shrink-0 accent-accent"
                                />
                                <span className="min-w-0 flex-1 text-xs text-gray-500">
                                    {selectedCards.length > 0
                                        ? `${selectedCards.length} of ${filteredCards.length} selected`
                                        : `Select all ${filteredCards.length}`}
                                </span>
                            </>
                        ) : (
                            <span className="min-w-0 flex-1 text-xs text-gray-500">
                                {filteredCards.length} {filteredCards.length === 1 ? 'card' : 'cards'}
                            </span>
                        )}
                        {!selectionMode && (
                            <button
                                type="button"
                                onClick={() => setShowStats(true)}
                                aria-label="Statistics"
                                title="Statistics"
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-surface-sunken hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                                <FaChartBar size={11} />
                                Stats
                            </button>
                        )}
                        {!selectionMode && filteredCards.length > 0 && (
                            <button
                                type="button"
                                onClick={startStudy}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-accent-subtle px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                                <FaPlay size={9} />
                                Study
                                {dueCount > 0 && (
                                    <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
                                        {dueCount}
                                    </span>
                                )}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setSelectionMode(prev => !prev);
                                setSelectedCards([]);
                            }}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-surface-sunken hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaCheckSquare size={11} />
                            {selectionMode ? 'Done' : 'Select'}
                        </button>
                    </div>

                    {/* Plain scrolling. Pagination in a side panel meant two navigation
                        models for one list. */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {renderCards()}
                    </div>

                    {/* Bulk actions appear once something is selected, instead of two
                        permanently greyed-out buttons greeting you on arrival. */}
                    {selectionMode && (
                        <div className="mt-2 flex shrink-0 flex-col gap-2 rounded-card border border-line bg-surface-muted px-2.5 py-2">
                        {/* Anki's target deck lives in the deck slice, not in the settings
                            deck selection the create screen uses, so it keeps its own control. */}
                        {useAnkiConnect && (
                            <label className="flex items-center gap-2 text-xs text-gray-500">
                                <span className="shrink-0">Deck</span>
                                <select
                                    value={deckId || ''}
                                    onChange={handleDeckChange}
                                    className="h-8 min-w-0 flex-1 rounded-control border border-line bg-white px-2 text-xs text-gray-800 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                                >
                                    <option value="">Select a deck…</option>
                                    {decks.map(deck => (
                                        <option key={deck.deckId} value={deck.deckId}>{deck.name}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                onClick={() => setDeckPickerFor({ kind: 'cards', ids: selectedCards })}
                                disabled={selectedCards.length === 0}
                                icon={<FaLayerGroup size={11} />}
                            >
                                Move
                            </Button>
                            <Button
                                size="sm"
                                onClick={exportCardsAsFile}
                                disabled={isLoading || selectedCards.length === 0}
                                icon={<FaDownload size={11} />}
                            >
                                Export
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={handleSaveToAnki}
                                disabled={isLoading || selectedCards.length === 0}
                                title={
                                    !useAnkiConnect ? 'Configure AnkiConnect in Settings' :
                                        !isAnkiAvailable ? 'AnkiConnect is not available' :
                                            !deckId ? 'Please select a deck first' : ''
                                }
                            >
                                {isLoading ? 'Saving…' : 'To Anki'}
                            </Button>
                        </div>
                        </div>
                    )}
                </>
            )}

            {recentlyDeleted && (
                <div
                    role="status"
                    className="absolute bottom-3 left-3 right-3 z-40 flex items-center gap-3 rounded-card bg-gray-900 px-3 py-2.5 shadow-sheet"
                >
                    <span className="min-w-0 flex-1 truncate text-xs text-white">Card deleted</span>
                    <button
                        type="button"
                        onClick={handleUndoDelete}
                        className="shrink-0 text-xs font-semibold text-white underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                        Undo
                    </button>
                </div>
            )}

            {/* Remove the floating action button since we've added a button to the top navigation */}

            {/* Export File Modal */}
            {showExportModal && (
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
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '400px',
                        width: '90%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                        border: '1px solid #E5E7EB'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '20px'
                        }}>
                            <h3 style={{
                                margin: 0,
                                fontSize: '18px',
                                fontWeight: '600',
                                color: '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <FaDownload size={16} style={{ color: '#2563EB' }} />
                                Export Cards
                            </h3>
                            <button
                                onClick={() => setShowExportModal(false)}
                                disabled={isExporting}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    cursor: isExporting ? 'default' : 'pointer',
                                    padding: '4px',
                                    borderRadius: '4px',
                                    color: '#6B7280',
                                    opacity: isExporting ? 0.5 : 1
                                }}
                            >
                                <FaTimes size={16} />
                            </button>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <p style={{
                                margin: '0 0 16px 0',
                                fontSize: '14px',
                                color: '#6B7280',
                                lineHeight: '1.5'
                            }}>
                                Export {selectedCards.length} selected cards to a file. Choose a filename or use the default.
                            </p>

                            <label style={{
                                display: 'block',
                                fontSize: '14px',
                                fontWeight: '500',
                                color: '#374151',
                                marginBottom: '8px'
                            }}>
                                Filename
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    value={exportFileName}
                                    onChange={(e) => setExportFileName(e.target.value)}
                                    placeholder="Enter filename (without extension)"
                                    disabled={isExporting}
                                    style={{
                                        width: '100%',
                                        padding: '10px 12px',
                                        paddingRight: '48px',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '8px',
                                        fontSize: '14px',
                                        outline: 'none',
                                        transition: 'border-color 0.2s ease',
                                        backgroundColor: isExporting ? '#F9FAFB' : '#ffffff',
                                        opacity: isExporting ? 0.7 : 1,
                                        boxSizing: 'border-box'
                                    }}
                                    onFocus={(e) => {
                                        if (!isExporting) {
                                            e.target.style.borderColor = '#2563EB';
                                            e.target.style.boxShadow = '0 0 0 3px rgba(37, 99, 235, 0.1)';
                                        }
                                    }}
                                    onBlur={(e) => {
                                        e.target.style.borderColor = '#D1D5DB';
                                        e.target.style.boxShadow = 'none';
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isExporting) {
                                            performFileExport();
                                        }
                                        if (e.key === 'Escape') {
                                            setShowExportModal(false);
                                        }
                                    }}
                                />
                                <span style={{
                                    position: 'absolute',
                                    right: '12px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '13px',
                                    color: '#9CA3AF',
                                    pointerEvents: 'none'
                                }}>
                                    .txt
                                </span>
                            </div>
                            <p style={{
                                margin: '6px 0 0 0',
                                fontSize: '12px',
                                color: '#6B7280'
                            }}>
                                The .txt extension will be added automatically
                            </p>
                        </div>

                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                onClick={() => setShowExportModal(false)}
                                disabled={isExporting}
                                style={{
                                    padding: '10px 16px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '8px',
                                    backgroundColor: '#ffffff',
                                    color: '#374151',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    cursor: isExporting ? 'default' : 'pointer',
                                    transition: 'all 0.2s ease',
                                    opacity: isExporting ? 0.5 : 1
                                }}
                                onMouseOver={(e) => {
                                    if (!isExporting) {
                                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                                        e.currentTarget.style.borderColor = '#9CA3AF';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (!isExporting) {
                                        e.currentTarget.style.backgroundColor = '#ffffff';
                                        e.currentTarget.style.borderColor = '#D1D5DB';
                                    }
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={performFileExport}
                                disabled={isExporting || !exportFileName.trim()}
                                style={{
                                    padding: '10px 16px',
                                    border: 'none',
                                    borderRadius: '8px',
                                    backgroundColor: (!exportFileName.trim() || isExporting) ? '#9CA3AF' : '#2563EB',
                                    color: '#ffffff',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    cursor: (!exportFileName.trim() || isExporting) ? 'default' : 'pointer',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    minWidth: '100px',
                                    justifyContent: 'center'
                                }}
                                onMouseOver={(e) => {
                                    if (!isExporting && exportFileName.trim()) {
                                        e.currentTarget.style.backgroundColor = '#1D4ED8';
                                    }
                                }}
                                onMouseOut={(e) => {
                                    if (!isExporting && exportFileName.trim()) {
                                        e.currentTarget.style.backgroundColor = '#2563EB';
                                    }
                                }}
                            >
                                {isExporting ? (
                                    <>
                                        <Loader type="spinner" size="small" inline color="#ffffff" />
                                        <span>Exporting...</span>
                                    </>
                                ) : (
                                    <>
                                        <FaDownload size={14} />
                                        <span>Export</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Flip study preview — tap a card to view/learn it like in the mobile app */}
            {previewCard && (
                <Modal
                    open
                    onClose={() => { setPreviewCard(null); setDeckPickerFor(prev => (prev?.kind === 'preview' ? null : prev)); }}
                    title={(previewCard.text || previewCard.front || 'Card').trim() || 'Card'}
                    maxWidth={360}
                    footer={(() => {
                        const previewAnkiIssue = getAnkiIssue(previewCard);
                        return (
                            <div className="flex flex-col gap-2.5">
                                {/* Destination is editable straight from the preview: you no
                                    longer have to enter edit mode just to change a deck. */}
                                {renderDestinationRow(previewCard, { kind: 'preview' })}

                                {previewAnkiIssue && renderAnkiIssue(previewAnkiIssue, { kind: 'preview' })}

                                {/* Equal halves rather than two small buttons huddled in the
                                    corner — the sheet is narrow, so they fill it. */}
                                <div className="flex items-center gap-2">
                                    {!previewAnkiIssue && (
                                        <Button
                                            variant="secondary"
                                            fullWidth
                                            disabled={loadingSync}
                                            onClick={async () => {
                                                if (await sendCardToAnki(previewCard)) {
                                                    setPreviewCard(null);
                                                }
                                            }}
                                        >
                                            {loadingSync ? (
                                                <>
                                                    <Loader type="spinner" size="small" inline color="#6C757D" />
                                                    Sending…
                                                </>
                                            ) : (
                                                'Send to Anki'
                                            )}
                                        </Button>
                                    )}
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        onClick={() => {
                                            const card = previewCard;
                                            setPreviewCard(null);
                                            handleStartEditing(card);
                                        }}
                                    >
                                        Edit card
                                    </Button>
                                </div>
                            </div>
                        );
                    })()}
                >
                    <StudyCard card={previewCard} resetKey={previewCard.id} />
                </Modal>
            )}

            {/* Modal for editing cards */}
            {renderEditModal()}

            {/* Study session — the same SM-2 flow as the mobile app: flip, grade, reschedule. */}
            {studyCards && (
                <StudySession
                    cards={studyCards}
                    deckName={activeDeckName || 'All cards'}
                    onClose={() => setStudyCards(null)}
                    onReview={handleReview}
                />
            )}

            {showStats && (
                <Modal open onClose={() => setShowStats(false)} title="Statistics" maxWidth={360}>
                    <StatsPanel stats={stats} />
                </Modal>
            )}

            {showDeckSheet && (
                <DeckSheet
                    decks={deckOptions}
                    activeDeckId={activeDeckId}
                    defaultDeckName={DEFAULT_DECK_NAME}
                    busy={deckActionBusy}
                    onRename={handleRenameDeck}
                    onDelete={handleDeleteDeck}
                    onCreate={handleCreateDeck}
                    onImportFromAnki={setImportTargetDeck}
                    onSelect={setActiveDeckId}
                    onStudy={(deckId) => {
                        setActiveDeckId(deckId);
                        const inDeck = storedCards.filter((card) => cardMatchesDeck(card, deckId));
                        const due = inDeck.filter((card) => isDue(card.srsState));
                        setStudyCards(due.length > 0 ? due : inDeck);
                    }}
                    onClose={() => setShowDeckSheet(false)}
                />
            )}

            {importTargetDeck && (
                <ImportFromAnkiModal
                    open
                    onClose={() => setImportTargetDeck(null)}
                    targetDeckName={importTargetDeck.name}
                    alreadyImportedNoteIds={importedAnkiNoteIds}
                    onImport={handleImportedFromAnki}
                />
            )}

            {/* Rendered last so it stacks above whichever modal opened it. */}
            {renderDeckPicker()}

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

export default StoredCards;
