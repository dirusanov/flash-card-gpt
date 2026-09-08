import React, { useEffect, useLayoutEffect, useRef, useState, useId } from 'react';
import { FaVolumeUp, FaEyeSlash, FaRegImage, FaTimes, FaPlus, FaCopy, FaCheck, FaUndo, FaHandPointer } from 'react-icons/fa';
import { StoredCard } from '../../store/reducers/cards';
import { removeDecorativeTranslationQuotes } from '../../services/aiProviders';
import GrammarCard from '../grammar/GrammarCard';
import AutoTextarea from '../ui/AutoTextarea';

type ExampleTuple = [string, string | null];

interface StudyCardProps {
    card: StoredCard;
    /** Reset to the front (question) side whenever this changes. */
    resetKey?: string;
    /** Controlled flip — pass it when the parent needs to know the answer is showing
     *  (a study session reveals the rating buttons only after the flip). */
    flipped?: boolean;
    onFlippedChange?: (flipped: boolean) => void;
    /** Turns the card into an in-place editor — same layout, fields become inputs. */
    editable?: boolean;
    /** Locks inputs while a regeneration is running. */
    busy?: boolean;
    onWordChange?: (value: string) => void;
    onTranslationChange?: (value: string) => void;
    onExamplesChange?: (examples: ExampleTuple[]) => void;
    onGrammarChange?: (serialized: string) => void;
    /** When given, an example without audio shows a speaker that asks for it on demand. */
    onRequestExampleAudio?: (index: number) => Promise<void>;
}

// A card simply takes the room it is given. Sizing it to its content meant measuring both
// faces, reconciling them so the flip did not jump, and animating between sizes — a lot of
// machinery whose best case still looked like the card growing at you. One size, decided
// once, is steadier to read and to reason about.
const DETAILS_KEY = 'vaulto:study-card:details-expanded';
const MAX_CARD_HEIGHT = 600;
/** `pt-2` + `pb-4` on the card's own wrapper, which eats into the room it is given. */
const ROOT_VERTICAL_PADDING = 24;
const maxCardHeight = () =>
    Math.min(MAX_CARD_HEIGHT, Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.68));

/** The nearest ancestor that scrolls, which is the thing the card must not overflow. */
const findScroller = (root: HTMLElement, sheet: HTMLElement): HTMLElement | null => {
    let node: HTMLElement | null = root.parentElement;
    while (node && node !== sheet.parentElement) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return node;
        node = node.parentElement;
    }
    return null;
};

/**
 * How tall the card may grow inside its sheet.
 *
 * Measuring the container directly is circular — the sheet sizes itself to its content,
 * so the card would be capped by its own current height and could never grow. What is
 * stable is the sheet's *limit* and everything that is not the card: the header and
 * footer outside the scroll area, and whatever shares the scroll area with it. Both are
 * derived as differences, which cancels the card's own height out of the arithmetic.
 *
 * The card is not always the only thing in the scroll area — the create sheet puts card
 * navigation and the deck destination above it — and assuming otherwise handed the card
 * more room than it had, so the sheet scrolled *and* the card scrolled.
 *
 * Returns 0 outside a sheet, where the viewport bound is the answer.
 */
const measureRoom = (root: HTMLElement | null): number => {
    const sheet = root?.closest('[role="dialog"]') as HTMLElement | null;
    if (!root || !sheet) return 0;

    const scroller = findScroller(root, sheet);
    if (!scroller) return 0;

    const limit = parseFloat(getComputedStyle(sheet).maxHeight);
    if (!Number.isFinite(limit) || limit <= 0) return 0;

    const outsideScroller = sheet.clientHeight - scroller.clientHeight;
    const besideCard = scroller.scrollHeight - root.offsetHeight;

    return Math.round(limit - outsideScroller - besideCard - ROOT_VERTICAL_PADDING);
};

// A flip study card that mirrors vaulto-cards' FlashCard: white "question" side with the
// word, tap to flip to the mint "answer" side with the translation, image, grammar and
// examples. With `editable`, the very same card becomes the editor — the fields turn into
// inputs in place, so editing never drops you into a different-looking screen.
const StudyCard: React.FC<StudyCardProps> = ({
    card,
    resetKey,
    editable = false,
    busy = false,
    flipped: flippedProp,
    onFlippedChange,
    onWordChange,
    onTranslationChange,
    onExamplesChange,
    onGrammarChange,
    onRequestExampleAudio,
}) => {
    const [internalFlipped, setInternalFlipped] = useState(false);
    const detailsId = useId();
    const [detailsExpanded, setDetailsExpanded] = useState(() => {
        try { return localStorage.getItem(DETAILS_KEY) === 'true'; } catch { return false; }
    });
    const toggleDetails = () => {
        const next = !detailsExpanded;
        setDetailsExpanded(next);
        try { localStorage.setItem(DETAILS_KEY, String(next)); } catch { /* Session preference still works. */ }
    };
    const [voicing, setVoicing] = useState<number | null>(null);
    const [imageHidden, setImageHidden] = useState(false);
    const [playing, setPlaying] = useState<string | null>(null);
    const [copiedField, setCopiedField] = useState<'word' | 'translation' | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const copyTimerRef = useRef<number | null>(null);

    const isControlled = flippedProp !== undefined;
    const flipped = isControlled ? flippedProp : internalFlipped;
    const setFlipped = (next: boolean) => {
        if (!isControlled) setInternalFlipped(next);
        onFlippedChange?.(next);
    };

    useEffect(() => {
        setInternalFlipped(false);
        setImageHidden(false);
    }, [resetKey, card.id]);

    const rootRef = useRef<HTMLDivElement>(null);
    // How much room the sheet gives the card. Bounding by the viewport alone let the card
    // grow taller than the modal body, so the body scrolled *and* the card scrolled — two
    // scrollbars for one overflow.
    const [availableHeight, setAvailableHeight] = useState(0);

    useLayoutEffect(() => {
        const measure = () => setAvailableHeight((prev) => {
            const room = measureRoom(rootRef.current);
            return prev === room ? prev : room;
        });

        measure();

        // The panel can be resized, the footer changes height with its state, and what
        // shares the scroll area with the card can appear and disappear.
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
        if (observer) {
            const sheet = rootRef.current?.closest('[role="dialog"]');
            if (sheet) observer.observe(sheet);
            else if (rootRef.current?.parentElement) observer.observe(rootRef.current.parentElement);
        }
        window.addEventListener('resize', measure);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [editable, card.id]);

    // One height for everything: both faces, every card, from the first frame.
    const shellHeight = availableHeight > 0
        ? Math.min(maxCardHeight(), availableHeight)
        : maxCardHeight();

    useEffect(() => () => {
        audioRef.current?.pause();
        audioRef.current = null;
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    }, []);

    const play = (e: React.MouseEvent, url?: string | null) => {
        e.stopPropagation();
        if (!url) return;
        audioRef.current?.pause();
        if (playing === url) {
            setPlaying(null);
            return;
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        setPlaying(url);
        audio.onended = () => setPlaying(null);
        audio.play().catch(() => setPlaying(null));
    };

    // A drag that ends on the card face still fires a click on mouseup — without this,
    // finishing a text selection (to copy it) immediately flips the card and the
    // selection goes with it. Guarding both flip directions on "was something just
    // selected" lets a select-and-copy gesture land without being swallowed.
    const hasActiveSelection = (): boolean => {
        const selection = typeof window !== 'undefined' ? window.getSelection() : null;
        return Boolean(selection && selection.toString().length > 0);
    };

    // A double-click fires two separate `click` events (mousedown/up twice) before the
    // single `dblclick` — without this, the first click flips the card and the second
    // immediately flips it right back, which just looks like the tap did nothing.
    // `event.detail` is the click's position in that sequence (2 on the second click),
    // so only reacting to the first collapses a double-click into a single, clean flip.
    const isRepeatClick = (e?: React.MouseEvent): boolean => Boolean(e && e.detail > 1);

    const flipToFront = (e?: React.MouseEvent) => {
        if (isRepeatClick(e)) return;
        if (!hasActiveSelection()) setFlipped(true);
    };
    const flipToBack = (e?: React.MouseEvent) => {
        if (isRepeatClick(e)) return;
        if (!hasActiveSelection()) setFlipped(false);
    };

    // A tap-to-flip surface can't rely on native drag-select alone (see above), so word
    // and translation each get an explicit, guaranteed one-tap way to grab their text.
    const copyText = async (e: React.MouseEvent, field: 'word' | 'translation', text: string) => {
        e.stopPropagation();
        if (!text) return;

        let succeeded = false;
        try {
            if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
            await navigator.clipboard.writeText(text);
            succeeded = true;
        } catch {
            // Fallback for contexts where the async Clipboard API is blocked/unavailable.
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                succeeded = document.execCommand('copy');
            } catch {
                succeeded = false;
            }
            document.body.removeChild(textarea);
        }

        // Both paths failing (clipboard permission denied, execCommand unsupported) should
        // not still claim success — the checkmark is a promise the text is on the clipboard.
        if (!succeeded) return;

        setCopiedField(field);
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopiedField(null), 1500);
    };

    const renderCopyButton = (field: 'word' | 'translation', text: string) => (
        <button
            type="button"
            onClick={(e) => void copyText(e, field, text)}
            onDoubleClick={(e) => e.stopPropagation()}
            aria-label={field === 'word' ? 'Copy word' : 'Copy translation'}
            title="Copy"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
            {copiedField === field ? <FaCheck size={11} className="text-ok-strong" /> : <FaCopy size={11} />}
        </button>
    );

    const word = (card.text || card.front || '').trim();
    const translation = removeDecorativeTranslationQuotes(card.translation ?? card.back ?? '');
    const imageUrl = card.image || card.imageUrl || '';
    const rawExamples: ExampleTuple[] = Array.isArray(card.examples) ? card.examples : [];
    const examples = rawExamples.map((example, index) => ({ example, index }))
        .filter(({ example }) => (example?.[0] || '').trim().length > 0);
    const hasGrammar = Boolean((card.linguisticInfo || '').trim());

    const highlight = (text: string): React.ReactNode => {
        if (!word) return text;
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, i) =>
            part.toLowerCase() === word.toLowerCase()
                ? <strong key={i} className="font-bold text-gray-900">{part}</strong>
                : <React.Fragment key={i}>{part}</React.Fragment>
        );
    };

    const renderExample = ({ example: [text, tr], index }: { example: ExampleTuple; index: number }) => (
        <li key={index} className="flex items-start gap-2.5">
            {card.examplesAudio?.[index] ? (
                <button
                    type="button"
                    onClick={(e) => play(e, card.examplesAudio?.[index])}
                    onDoubleClick={(e) => e.stopPropagation()}
                    aria-label="Play example"
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent-border"
                >
                    <FaVolumeUp size={10} />
                </button>
            ) : onRequestExampleAudio ? (
                // Quiet until asked: a grey speaker that becomes the blue one above
                // once the voice has been made, so speech is only paid for when played.
                <button
                    type="button"
                    disabled={voicing !== null}
                    onClick={(e) => {
                        e.stopPropagation();
                        setVoicing(index);
                        onRequestExampleAudio(index).finally(() => setVoicing(null));
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    aria-label="Voice this example"
                    title="Voice this example"
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line text-gray-400 transition-colors hover:border-accent-border hover:bg-accent-subtle hover:text-accent disabled:cursor-wait disabled:opacity-60"
                >
                    <FaVolumeUp size={10} className={voicing === index ? 'animate-pulse' : ''} />
                </button>
            ) : (
                <span className="mt-0.5 shrink-0 text-[15px] leading-5 text-ok-strong" aria-hidden>•</span>
            )}
            <div className="min-w-0 flex-1">
                <div className="break-words text-[14px] leading-6 text-gray-900">{highlight(text)}</div>
                {card.exampleTranscriptions?.[index] && (
                    <div className="mt-0.5 break-words font-mono text-[12px] leading-5 text-accent">
                        {card.exampleTranscriptions[index]}
                    </div>
                )}
                {tr && <div className="mt-0.5 break-words text-[13px] leading-5 text-gray-500">{tr}</div>}
            </div>
        </li>
    );

    // ─── Edit mode: the same card, fields become inputs ────────────────────────
    if (editable) {
        const setExampleAt = (index: number, next: ExampleTuple) => {
            onExamplesChange?.(rawExamples.map((ex, i) => (i === index ? next : ex)));
        };
        const removeExampleAt = (index: number) => {
            onExamplesChange?.(rawExamples.filter((_, i) => i !== index));
        };
        const addExample = () => {
            onExamplesChange?.([...rawExamples, ['', null]]);
        };

        return (
            <div ref={rootRef} className="px-4 pb-4 pt-2">
                <div
                    className={`overflow-y-auto rounded-sheet border border-ok-border bg-ok-subtle p-4 shadow-card ${busy ? 'pointer-events-none opacity-60' : ''}`}
                    style={{ height: shellHeight }}
                >
                    {/* Word — the card's title, edited in place */}
                    <input
                        value={card.text || card.front || ''}
                        onChange={(e) => onWordChange?.(e.target.value)}
                        placeholder="Word"
                        aria-label="Word"
                        className="mb-3 w-full rounded-control bg-transparent px-2 py-1.5 text-center text-[26px] font-bold tracking-tight text-gray-900 outline-none transition-colors hover:bg-white/60 focus:bg-white focus-visible:ring-2 focus-visible:ring-accent"
                    />

                    {imageUrl && (
                        <div className="mb-3 flex justify-center">
                            <img src={imageUrl} alt="" className="max-h-52 w-full rounded-card border border-line bg-white object-contain" />
                        </div>
                    )}

                    {/* Translation / answer */}
                    <AutoTextarea
                        value={translation}
                        onChange={(e) => onTranslationChange?.(e.target.value)}
                        placeholder="Translation"
                        aria-label="Translation"
                        className="mb-3 w-full rounded-control bg-transparent px-2 py-1.5 text-center text-[22px] font-semibold leading-snug text-gray-900 outline-none transition-colors hover:bg-white/60 focus:bg-white focus-visible:ring-2 focus-visible:ring-accent"
                    />

                    {/* Examples — green bullet like read mode, text auto-grows so nothing clips */}
                    <div>
                        <div className="mb-2 text-[13px] font-semibold text-gray-500">Examples</div>
                        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                            {rawExamples.map(([text, tr], index) => (
                                <li key={index} className="flex items-start gap-2.5">
                                    <span className="mt-2 shrink-0 text-[15px] leading-5 text-ok-strong" aria-hidden>•</span>
                                    <div className="flex min-w-0 flex-1 flex-col rounded-control border border-line bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
                                        <AutoTextarea
                                            value={text}
                                            onChange={(e) => setExampleAt(index, [e.target.value, tr])}
                                            placeholder="Example sentence"
                                            className="w-full bg-transparent px-2.5 py-2 text-[14px] font-medium leading-6 text-gray-900 outline-none"
                                        />
                                        <AutoTextarea
                                            value={tr || ''}
                                            onChange={(e) => setExampleAt(index, [text, e.target.value])}
                                            placeholder="Translation (optional)"
                                            className="w-full border-t border-line/70 bg-transparent px-2.5 py-1.5 text-[13px] leading-5 text-gray-500 outline-none"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeExampleAt(index)}
                                        aria-label="Remove example"
                                        className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-danger-subtle hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                    >
                                        <FaTimes size={12} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            onClick={addExample}
                            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-control border border-dashed border-accent-border bg-white px-2.5 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaPlus size={11} />
                            Add example
                        </button>
                    </div>

                    {/* Grammar comes last: long facts stay inside the card's own scroller
                        instead of splitting the answer from its examples. */}
                    <div className="mt-3 min-w-0 overflow-hidden rounded-card border border-line/70 bg-white p-3">
                        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                            Grammar
                        </div>
                        <GrammarCard
                            content={card.linguisticInfo || ''}
                            isEditable
                            onChange={(serialized) => onGrammarChange?.(serialized)}
                        />
                    </div>
                </div>
            </div>
        );
    }

    // ─── Read mode: the flip study card ────────────────────────────────────────
    return (
        <div ref={rootRef} className="px-4 pb-4 pt-2" style={{ perspective: 1200 }}>
            <div
                className="relative w-full transition-transform duration-500"
                style={{
                    height: shellHeight,
                    transformStyle: 'preserve-3d',
                    transform: flipped ? 'rotateY(180deg)' : 'none',
                }}
            >
                {/* Front — the question. A plain div rather than a <button>: browsers
                    routinely block text selection inside button elements, which is
                    exactly what made the word uncopyable here before. */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={flipToFront}
                    onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setFlipped(true);
                        }
                    }}
                    aria-label="Reveal answer"
                    className="absolute inset-0 flex cursor-pointer overflow-y-auto rounded-sheet border border-line bg-white text-center shadow-card [backface-visibility:hidden] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                    {/* `m-auto` centres the face while there is room and simply stops when
                        there is not — unlike justify-center, which clips overflow. */}
                    <div className="m-auto flex w-full flex-col items-center gap-2 p-5">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[32px] font-bold leading-tight tracking-tight text-gray-900">
                                {word || 'Untitled card'}
                            </span>
                            {word && renderCopyButton('word', word)}
                        </div>
                        {card.transcription && (
                            <div
                                className="font-mono text-sm text-gray-500"
                                dangerouslySetInnerHTML={{ __html: card.transcription }}
                            />
                        )}
                        {card.wordAudio && (
                            <span
                                onClick={(e) => play(e, card.wordAudio)}
                                role="button"
                                aria-label="Play pronunciation"
                                className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent-border"
                            >
                                <FaVolumeUp size={16} />
                            </span>
                        )}
                        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-muted px-3 py-1 text-[11px] font-semibold text-gray-500">
                            <FaHandPointer size={10} className="shrink-0" />
                            Tap to reveal answer
                        </span>
                    </div>
                </div>

                {/* Back — the answer. Works like the front now: tap (almost) anywhere to
                    flip. The translation, grammar and each example stop the click from
                    reaching this handler at all — not just when a selection happened — so
                    a double-click to select a single word can't get flipped away mid-gesture
                    the way a plain "was there a selection?" check alone would still allow
                    (the first click of a double-click has no selection yet to detect). The
                    selection guard stays as a backstop for a drag that starts on text but
                    ends outside it. */}
                <div
                    role="button"
                    tabIndex={0}
                    onClick={flipToBack}
                    onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            flipToBack();
                        }
                    }}
                    aria-label="Back to question"
                    className="absolute inset-0 flex cursor-pointer flex-col overflow-hidden rounded-sheet border border-ok-border bg-ok-subtle shadow-card [backface-visibility:hidden]"
                    style={{ transform: 'rotateY(180deg)' }}
                >
                    {/* Scrolls on its own so the "Tap to go back" hint below stays pinned at
                        the card's bottom instead of drifting away under a long examples
                        list. Still part of the same click target: nothing here stops the
                        click, only the text blocks below do. */}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="p-4">
                        <div className="mb-1 text-center text-[13px] font-semibold text-gray-500">{word}</div>

                        {/* Pronunciation belongs to the studied expression, so keep it
                            visible on the answer side too. Previously it existed only on
                            the front and looked as if it had disappeared after the flip. */}
                        {card.transcription && (
                            <div
                                className="mb-3 text-center font-mono text-sm text-gray-500"
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => { e.stopPropagation(); setFlipped(false); }}
                                dangerouslySetInnerHTML={{ __html: card.transcription }}
                            />
                        )}

                        {imageUrl && (
                            <div className="mb-3 flex justify-center">
                                {imageHidden ? (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setImageHidden(false); }}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-gray-500 shadow-control"
                                    >
                                        <FaRegImage size={11} /> Show image
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setImageHidden(true); }}
                                        className="relative block w-full"
                                        aria-label="Hide image"
                                    >
                                        <img src={imageUrl} alt="" className="max-h-52 w-full rounded-card border border-line bg-white object-contain" />
                                        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900/40 text-white">
                                            <FaEyeSlash size={12} />
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}

                        {translation && (
                            <div
                                className="mb-3 flex items-center justify-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => { e.stopPropagation(); setFlipped(false); }}
                            >
                                <p className="m-0 text-center text-[22px] font-semibold leading-snug text-gray-900">
                                    {translation}
                                </p>
                                {renderCopyButton('translation', translation)}
                            </div>
                        )}

                        {examples.length > 0 && (
                            <div
                                onClick={(e) => e.stopPropagation()}
                                onDoubleClick={(e) => { e.stopPropagation(); setFlipped(false); }}
                            >
                                <div className="mb-2 text-[13px] font-semibold text-gray-500">Examples</div>
                                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                                    {examples.slice(0, 1).map(renderExample)}
                                </ul>
                            </div>
                        )}

                        {(examples.length > 1 || hasGrammar) && (
                            <div className="mt-3" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    aria-expanded={detailsExpanded}
                                    aria-controls={detailsId}
                                    onClick={toggleDetails}
                                    className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-2 text-left text-[13px] font-medium text-gray-500 transition-colors hover:bg-white/60 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                >
                                    <span>{[
                                        examples.length > 1 ? `${examples.length - 1} more ${examples.length === 2 ? 'example' : 'examples'}` : '',
                                        hasGrammar ? 'Grammar' : '',
                                    ].filter(Boolean).join(' · ')}</span>
                                    <span aria-hidden="true">{detailsExpanded ? '−' : '+'}</span>
                                </button>
                                <div id={detailsId} hidden={!detailsExpanded}>
                                    {examples.length > 1 && (
                                        <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
                                            {examples.slice(1).map(renderExample)}
                                        </ul>
                                    )}
                                    {hasGrammar && (
                                        <div
                                            className="mt-3 min-w-0 overflow-hidden rounded-card border border-line/70 bg-white"
                                            onClick={(e) => e.stopPropagation()}
                                            onDoubleClick={(e) => { e.stopPropagation(); setFlipped(false); }}
                                        >
                                            <div className="border-b border-line/60 bg-surface-muted/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                                                Grammar
                                            </div>
                                            <GrammarCard content={card.linguisticInfo || ''} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    </div>

                    {/* Pinned outside the scroller, so it's always visible at the card's
                        bottom regardless of how long the examples list is or how far the
                        content has been scrolled. Still just a plain child of the click
                        target above — nothing here stops the click. */}
                    <div className="flex shrink-0 justify-center border-t border-ok-border/60 bg-white/50 py-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-ok-border bg-white/80 px-3 py-1 text-[11px] font-semibold text-ok-strong">
                            <FaUndo size={9} className="shrink-0" />
                            Tap to go back
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudyCard;
