import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { FaCheck, FaKey, FaMagic } from 'react-icons/fa';
import { RootState } from '../store';
import { setTranslateToLanguage } from '../store/actions/settings';
import { useTabAware } from './TabAwareProvider';
import { findLanguage } from '../data/languages';
import { detectLanguageOffline } from '../services/languageDetection';
import {
    QuickState, TrialStatus, createTrialAudio, createTrialCard, getTrialStatus, loadQuickState,
    saveQuickState, trialErrorMessage,
} from '../services/quickStart';
import { consumePendingSelection, subscribeToPendingSelection } from '../services/pendingSelection';
import { GET_PAGE_SELECTION, SELECTION_CHANGED, getActiveTabId } from '../services/pageContextBridge';
import { SrsGrade, applyReview, createInitialSrsState, getIntervalPreview } from '../services/srs';
import { appendReviewLog } from '../services/reviewLog';
import LanguagePairBar from './CreateCard/LanguagePairBar';
import CardFrontInput from './CreateCard/CardFrontInput';
import CardGenerationLoader from './CreateCard/CardGenerationLoader';
import StudyCard from './StoredCards/StudyCard';
import RatingButtons from './StoredCards/RatingButtons';
import Modal from './ui/Modal';
import Button from './ui/Button';

const MAX_TEXT = 240;

interface PageSelection { text: string; sentence?: string; pageLanguage?: string; }

const readPageSelection = async (): Promise<PageSelection | null> => {
    try {
        const id = await getActiveTabId();
        if (id == null) return null;
        const response = await chrome.tabs.sendMessage(id, { action: GET_PAGE_SELECTION });
        return response?.ok && typeof response.text === 'string' ? response : null;
    } catch {
        return null;
    }
};

/**
 * The first-run composer: the same language bar, card front and study card as the full
 * screen, minus everything that needs an API key. A few cards are built by Vaulto's own
 * server, so the first useful card arrives before any settings are opened.
 *
 * The draft lives in localStorage from the moment the server answers, so closing the
 * panel or the result sheet never loses a card that a free attempt already paid for.
 */
const QuickStart: React.FC = () => {
    const tab = useTabAware();
    const dispatch = useDispatch();
    const syncApiUrl = useSelector((s: RootState) => s.settings.syncApiUrl);
    const target = useSelector((s: RootState) => s.settings.translateToLanguage);
    const deckId = useSelector((s: RootState) => s.settings.selectedBackendDeckId);
    const signedIn = useSelector((s: RootState) => Boolean(s.auth.accessToken));

    const [state, setState] = useState<QuickState>(loadQuickState);
    const stateRef = useRef(state);
    const [status, setStatus] = useState<TrialStatus | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [elapsed, setElapsed] = useState(0);
    const cancelledRef = useRef(false);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState(false);
    const [flipped, setFlipped] = useState(false);
    const shownAt = useRef(Date.now());

    const update = (patch: Partial<QuickState>) => {
        const next = { ...stateRef.current, ...patch };
        stateRef.current = next;
        setState(next);
        try { saveQuickState(next); } catch { /* the in-memory copy still carries the draft */ }
    };

    // The status check doubles as a connectivity check: if the server cannot be reached or
    // has the trial switched off, that is said up front, not after the first Create.
    useEffect(() => {
        let active = true;
        getTrialStatus(syncApiUrl)
            .then((value) => {
                if (!active) return;
                setStatus(value);
                if (!value.available) {
                    setError(`Free card creation is switched off on ${new URL(syncApiUrl).host}. You can add your own OpenAI key in Settings.`);
                }
            })
            .catch((e) => {
                if (!active) return;
                setStatus({ available: false, remaining: 0, limit: 0 });
                setError(trialErrorMessage(e));
            });
        return () => { active = false; };
    }, [syncApiUrl]);

    // Every new selection on the page replaces the word in the composer, as on the full
    // screen. Only a generation in progress ignores it. An unsaved draft is kept behind
    // the "Unsaved card" strip; a saved one has nothing left to lose.
    useEffect(() => {
        const accept = (raw: string, sentence = '', pageLanguage = '') => {
            const text = raw.trim().slice(0, MAX_TEXT);
            const current = stateRef.current;
            if (busyRef.current || !text) return;
            // The same word in a different sentence is a different card, so re-selecting
            // "bank" from a riverbank paragraph has to get through. A repeat that carries
            // no sentence of its own — the context menu handing over bare text — must not,
            // or it would wipe the sentence the page already gave us.
            if (text === current.text && (!sentence || sentence === current.sentence)) return;
            const patch = { text, sentence, pageLanguage, detected: null, step: 'compose' as const };
            if (current.step === 'compose' || current.step === 'result') {
                update(patch);
            } else {
                update({ ...patch, draft: null, saved: false });
            }
            setEditing(false);
            setError('');
        };
        // The context menu and the shortcut hand over the text only; the page still has
        // the selection, so ask it for the sentence and language while they match.
        const takePending = async () => {
            const selection = await consumePendingSelection();
            if (!selection) return;
            const details = await readPageSelection();
            const matches = details?.text?.trim() === selection.trim();
            accept(selection, matches ? details?.sentence : '', matches ? details?.pageLanguage : '');
        };
        void takePending();
        const unsubscribe = subscribeToPendingSelection(() => { void takePending(); });
        const listener = (message: any) => {
            if (message?.action === SELECTION_CHANGED) accept(message.text || '', message.sentence || '', message.pageLanguage || '');
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => { unsubscribe(); chrome.runtime.onMessage.removeListener(listener); };
    }, []);

    useEffect(() => {
        if (!busy) return;
        const started = Date.now();
        setElapsed(0);
        const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
        return () => clearInterval(timer);
    }, [busy]);

    const detected = state.source ? null : (state.detected || detectLanguageOffline(state.text));
    const exhausted = Boolean(status?.available && status.remaining === 0);
    const canCreate = !busy && state.text.trim() !== '' && !exhausted;

    const generate = async () => {
        if (busyRef.current || !stateRef.current.text.trim()) return;
        busyRef.current = true;
        cancelledRef.current = false;
        setBusy(true);
        setError('');
        tab.setIsGeneratingCard(true);
        try {
            const current = stateRef.current;
            const result = await createTrialCard(syncApiUrl, {
                text: current.text, source: current.source, target,
                sentence: current.sentence, pageLanguage: current.pageLanguage,
            });
            // After a cancel the card still lands, as an "unsaved card" strip rather than a
            // sheet opening on its own: the attempt was already spent, so it is kept.
            update({ draft: result.card, detected: result.sourceLanguage, saved: false,
                step: cancelledRef.current ? 'compose' : 'result' });
            setEditing(false);
            setStatus((prev) => ({ available: true, remaining: result.remaining, limit: prev?.limit || result.remaining }));
        } catch (e) {
            setError(trialErrorMessage(e));
            if (e instanceof Error && (e as { code?: string }).code === 'trial_exhausted') {
                setStatus((prev) => ({ available: true, limit: prev?.limit || 0, remaining: 0 }));
            }
        } finally {
            busyRef.current = false;
            setBusy(false);
            tab.setIsGeneratingCard(false);
        }
    };

    // Stops waiting, not the request: the server finishes and stores the result under the
    // same request id, so the next Create for this text picks it up without a new attempt.
    const cancel = () => {
        cancelledRef.current = true;
        busyRef.current = false;
        setBusy(false);
        tab.setIsGeneratingCard(false);
    };

    const useSelection = async () => {
        try {
            const response = await readPageSelection();
            if (!response?.text?.trim()) throw new Error();
            update({
                text: response.text.trim().slice(0, MAX_TEXT), sentence: response.sentence || '',
                pageLanguage: response.pageLanguage || '', detected: null,
            });
            setError('');
        } catch {
            setError('Select a word on the page first, then press Alt+C or right-click → Create card.');
        }
    };

    const save = () => {
        const draft = stateRef.current.draft;
        if (!draft) return;
        const card = { ...draft, deckId: deckId || undefined };
        tab.saveCardToStorage(card);
        update({ draft: card, saved: true, step: 'review' });
        setEditing(false);
        setFlipped(false);
        shownAt.current = Date.now();
    };

    const intervalPreviews = useMemo(() => {
        const srs = state.draft?.srsState ?? createInitialSrsState();
        return {
            again: getIntervalPreview(srs, 'again'),
            hard: getIntervalPreview(srs, 'hard'),
            good: getIntervalPreview(srs, 'good'),
            easy: getIntervalPreview(srs, 'easy'),
        } as Record<SrsGrade, string>;
    }, [state.draft]);

    const rate = async (grade: SrsGrade) => {
        const draft = stateRef.current.draft;
        if (!draft || busyRef.current) return;
        busyRef.current = true;
        try {
            const card = { ...draft, srsState: applyReview(draft.srsState ?? createInitialSrsState(), grade) };
            tab.updateStoredCard(card);
            await appendReviewLog({
                cardId: card.id, grade, reviewedAt: new Date().toISOString(),
                responseTimeMs: Date.now() - shownAt.current,
            });
            update({ draft: card, step: 'done' });
        } catch {
            setError('Could not save the review. Please try again.');
        } finally {
            busyRef.current = false;
        }
    };

    // Example speech is made when the speaker is pressed and kept with the draft; a card
    // already saved is updated in place so the voice survives into the library.
    const voiceExample = async (index: number) => {
        const draft = stateRef.current.draft;
        const text = draft?.examples?.[index]?.[0];
        if (!draft || !text) return;
        try {
            const audio = await createTrialAudio(syncApiUrl, text);
            const current = stateRef.current.draft;
            if (!current || current.id !== draft.id) return;
            const examplesAudio = (current.examples || []).map((_, i) => current.examplesAudio?.[i] ?? null);
            examplesAudio[index] = audio;
            const card = { ...current, examplesAudio };
            update({ draft: card });
            if (stateRef.current.saved) tab.updateStoredCard(card);
        } catch (e) {
            setError(trialErrorMessage(e));
        }
    };

    const startOver = () => {
        setError('');
        update({ step: 'compose', text: '', detected: null, draft: null, saved: false });
    };

    const draft = state.draft;
    const remainingLine = status?.available
        ? `${status.remaining} of ${status.limit} free cards left`
        : null;

    if (state.step === 'done' && draft) {
        return (
            <div className="flex h-full flex-col bg-white">
                <div className="mx-auto flex w-full max-w-[340px] flex-1 flex-col items-center justify-center px-4 text-center">
                    <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ok-subtle text-ok-strong">
                        <FaCheck size={22} />
                    </span>
                    <h2 className="m-0 text-lg font-bold text-gray-900">
                        “{draft.text}” is in your cards
                    </h2>
                    <p className="m-0 mt-2 text-[13px] leading-snug text-gray-500">
                        It comes back for review when it is due. Next word: select it on any page
                        and press Alt+C, or right-click → Create card.
                    </p>
                </div>
                <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
                    <div className="mx-auto flex w-full max-w-[340px] flex-col gap-1.5">
                        {!signedIn && (
                            <Button fullWidth onClick={() => tab.setCurrentPage('auth')}>
                                Back up and study on your phone
                            </Button>
                        )}
                        <Button variant="primary" fullWidth onClick={startOver}>
                            Create another card
                        </Button>
                        <button
                            type="button"
                            onClick={() => tab.setCurrentPage('storedCards')}
                            className="rounded-control py-1 text-[12px] font-medium text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            View all cards
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-white">
            {exhausted && (
                <div className="mx-3 mt-2 flex items-center gap-2 rounded-card border border-warn-border bg-warn-subtle px-3 py-2">
                    <FaKey size={12} className="shrink-0 text-warn-strong" />
                    <span className="min-w-0 flex-1 text-xs leading-snug text-warn-strong">
                        Your free cards are used up. Add your own OpenAI key to keep creating.
                    </span>
                    <button
                        type="button"
                        onClick={() => tab.setCurrentPage('settings')}
                        className="shrink-0 rounded-control px-2 py-1 text-xs font-semibold text-warn-strong underline-offset-2 transition-colors hover:bg-warn-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        Settings
                    </button>
                </div>
            )}
            {error && (
                <p role="alert" className="mx-3 mt-2 mb-0 rounded-card border border-danger-border bg-danger-subtle px-3 py-2 text-xs leading-snug text-danger-strong">
                    {error}
                </p>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden px-3 pb-2 pt-2">
                <div className="mx-auto flex min-h-0 w-full max-w-[340px] flex-1 flex-col gap-2">
                    <LanguagePairBar
                        sourceCode={state.source}
                        detectedCode={detected}
                        isDetecting={false}
                        onSourceChange={(code) => update({ source: code, detected: null })}
                        targetCode={target}
                        onTargetChange={(code) => dispatch(setTranslateToLanguage(code))}
                    />

                    {busy ? (
                        <CardGenerationLoader
                            target={state.text}
                            title="Translating and writing an example"
                            subtitle="Usually takes a few seconds"
                            completed={0}
                            total={0}
                            elapsed={`${Math.floor(elapsed / 1000)}s`}
                            onCancel={cancel}
                        />
                    ) : (
                        <CardFrontInput
                            autoFocus
                            value={state.text}
                            onChange={(value) => update({
                                text: value.slice(0, MAX_TEXT), detected: null,
                                // Typing over a selection breaks its link to the page sentence.
                                ...(value.trim() !== stateRef.current.text.trim() ? { sentence: '', pageLanguage: '' } : {}),
                            })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void generate(); }
                            }}
                            placeholder="Type a word or phrase — or select one on the page"
                        />
                    )}

                    {!busy && !state.text.trim() && (
                        <button
                            type="button"
                            onClick={() => void useSelection()}
                            className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full bg-accent-subtle px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaMagic size={9} />
                            Use the selection on the page
                        </button>
                    )}

                    {!busy && draft && !state.saved && state.step === 'compose' && (
                        <button
                            type="button"
                            onClick={() => update({ step: 'result' })}
                            className="flex shrink-0 items-center justify-between rounded-card border border-accent-border bg-accent-subtle px-3 py-2 text-left text-xs text-accent hover:bg-accent-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <span className="min-w-0 truncate font-medium">Unsaved card: “{draft.text}”</span>
                            <span className="shrink-0 font-semibold">Open</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="shrink-0 border-t border-line bg-white px-3 py-2.5">
                <div className="mx-auto flex w-full max-w-[340px] flex-col gap-1.5">
                    <Button variant="primary" size="lg" fullWidth disabled={!canCreate} onClick={() => void generate()}>
                        {busy ? 'Creating…' : 'Create card'}
                    </Button>
                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span>{remainingLine ?? (status ? 'Free cards unavailable' : 'Checking free cards…')}</span>
                        <button
                            type="button"
                            onClick={() => tab.setCurrentPage('settings')}
                            className="rounded-control font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            Use your own key
                        </button>
                    </div>
                </div>
            </div>

            {draft && (state.step === 'result' || state.step === 'review') && (
                <Modal
                    open
                    onClose={() => {
                        // Closing keeps the draft; the composer shows a way back to it.
                        if (state.step === 'review') update({ step: 'done' });
                        else { setEditing(false); update({ step: 'compose' }); }
                    }}
                    title={state.step === 'review' ? 'Try to recall it' : 'Your card'}
                    subtitle={state.step === 'review'
                        ? 'Tap the card, then say how well you remembered'
                        : `${findLanguage(state.detected)?.name ?? 'Detected'} → ${findLanguage(target)?.name ?? target}`}
                    maxWidth={360}
                    footer={state.step === 'review' ? (
                        <div className="flex min-h-[74px] flex-col justify-end">
                            {flipped ? (
                                <RatingButtons onRate={(grade) => void rate(grade)} intervalPreviews={intervalPreviews} />
                            ) : (
                                <Button variant="primary" fullWidth onClick={() => setFlipped(true)}>
                                    Show answer
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex gap-1.5">
                                <Button fullWidth onClick={() => setEditing((value) => !value)}>
                                    {editing ? 'Done editing' : 'Edit'}
                                </Button>
                                <Button variant="primary" fullWidth onClick={save} disabled={!draft.translation?.trim()}>
                                    Save card
                                </Button>
                            </div>
                            <button
                                type="button"
                                onClick={startOver}
                                className="rounded-control py-1 text-[12px] font-medium text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            >
                                Discard and start over
                            </button>
                        </div>
                    )}
                >
                    <StudyCard
                        card={draft}
                        resetKey={`${draft.id}-${state.step}`}
                        editable={state.step === 'result' && editing}
                        flipped={state.step === 'review' ? flipped : undefined}
                        onFlippedChange={state.step === 'review' ? setFlipped : undefined}
                        onWordChange={(value) => update({ draft: { ...draft, text: value, front: value } })}
                        onTranslationChange={(value) => update({ draft: { ...draft, translation: value } })}
                        onExamplesChange={(examples) => update({ draft: { ...draft, examples } })}
                        onRequestExampleAudio={voiceExample}
                    />
                </Modal>
            )}
        </div>
    );
};

export default QuickStart;
