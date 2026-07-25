import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FaVolumeUp, FaEyeSlash, FaRegImage, FaTimes, FaPlus } from 'react-icons/fa';
import { StoredCard } from '../../store/reducers/cards';
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
}

// Cards rest at one comfortable size and only grow past it when there is genuinely more
// to show. A question is usually a single word, so sizing purely to content made the
// front a thin strip — the resting height is what makes it read as a card.
const STANDARD_CARD_HEIGHT = 340;
const MAX_CARD_HEIGHT = 600;
/**
 * What the shell must add on top of a face's own content height.
 *
 * Each face is `absolute inset-0` with a 1px border, so its border-box equals the shell
 * while its content box is 2px shorter — and the scroll area inside resolves `h-full`
 * against that content box. Sizing the shell to the bare content therefore left the face
 * 2px short and produced a permanent sliver of a scrollbar. The third pixel absorbs
 * sub-pixel rounding, since `scrollHeight` is an integer approximation of a fractional
 * layout height.
 */
const FACE_CHROME = 3;
const maxCardHeight = () =>
    Math.min(MAX_CARD_HEIGHT, Math.round((typeof window !== 'undefined' ? window.innerHeight : 800) * 0.68));

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
}) => {
    const [internalFlipped, setInternalFlipped] = useState(false);
    const [imageHidden, setImageHidden] = useState(false);
    const [playing, setPlaying] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

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

    // Both faces are absolutely positioned so they can share one 3D box, which means the
    // box has to be told how tall to be. Measure each face's natural height and follow
    // whichever one is showing, so a one-word front is not padded out to the height of a
    // long answer — and neither gets a scrollbar until it genuinely needs one.
    const frontRef = useRef<HTMLDivElement>(null);
    const backRef = useRef<HTMLDivElement>(null);
    const [faceHeights, setFaceHeights] = useState({ front: 0, back: 0 });

    useLayoutEffect(() => {
        if (editable) return undefined;

        const measure = () => {
            const front = frontRef.current?.scrollHeight ?? 0;
            const back = backRef.current?.scrollHeight ?? 0;
            // Only re-render on a real change: a fresh object every observer tick would
            // re-render on every frame of the flip for nothing.
            setFaceHeights((prev) => (prev.front === front && prev.back === back ? prev : { front, back }));
        };

        measure();

        // Images and audio buttons arrive late, and the panel itself can be resized.
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
        if (observer) {
            if (frontRef.current) observer.observe(frontRef.current);
            if (backRef.current) observer.observe(backRef.current);
        }
        window.addEventListener('resize', measure);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [editable, card.id, imageHidden]);

    const faceHeight = flipped ? faceHeights.back : faceHeights.front;
    // The cap is applied last: on a short window it has to win over the resting height,
    // or the card would grow past what the sheet can show.
    const shellHeight = Math.min(
        maxCardHeight(),
        Math.max(STANDARD_CARD_HEIGHT, faceHeight > 0 ? faceHeight + FACE_CHROME : 0)
    );

    useEffect(() => () => {
        audioRef.current?.pause();
        audioRef.current = null;
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

    const word = (card.text || card.front || '').trim();
    const translation = card.translation ?? card.back ?? '';
    const imageUrl = card.image || card.imageUrl || '';
    const rawExamples: ExampleTuple[] = Array.isArray(card.examples) ? card.examples : [];
    const examples = rawExamples.filter((ex) => (ex?.[0] || '').trim().length > 0);
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
            <div className="px-4 pb-4 pt-2">
                <div
                    className={`overflow-y-auto rounded-sheet border border-ok-border bg-ok-subtle p-4 shadow-card ${busy ? 'pointer-events-none opacity-60' : ''}`}
                    style={{ minHeight: Math.min(STANDARD_CARD_HEIGHT, maxCardHeight()), maxHeight: maxCardHeight() }}
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

                    {/* Grammar — same mint box as read mode, fields become inputs */}
                    <div className="mb-3 rounded-card border border-ok-border bg-white/70 p-3">
                        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ok-strong">
                            Grammar Reference
                        </div>
                        <GrammarCard
                            content={card.linguisticInfo || ''}
                            isEditable
                            onChange={(serialized) => onGrammarChange?.(serialized)}
                        />
                    </div>

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
                </div>
            </div>
        );
    }

    // ─── Read mode: the flip study card ────────────────────────────────────────
    return (
        <div className="px-4 pb-4 pt-2" style={{ perspective: 1200 }}>
            <div
                className="relative w-full transition-[transform,height] duration-500"
                style={{
                    height: shellHeight,
                    transformStyle: 'preserve-3d',
                    transform: flipped ? 'rotateY(180deg)' : 'none',
                }}
            >
                {/* Front — the question */}
                <button
                    type="button"
                    onClick={() => setFlipped(true)}
                    aria-label="Reveal answer"
                    className="absolute inset-0 flex overflow-y-auto rounded-sheet border border-line bg-white text-center shadow-card [backface-visibility:hidden] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                    {/* `m-auto` centres the face while there is room and simply stops when
                        there is not — unlike justify-center, which clips overflow. */}
                    <div ref={frontRef} className="m-auto flex w-full flex-col items-center gap-2 p-5">
                        <span className="text-[32px] font-bold leading-tight tracking-tight text-gray-900">
                            {word || 'Untitled card'}
                        </span>
                        {card.transcription && (
                            <span
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
                        <span className="mt-3 text-[11px] font-medium text-gray-400">Tap to reveal answer</span>
                    </div>
                </button>

                {/* Back — the answer */}
                <div
                    className="absolute inset-0 overflow-hidden rounded-sheet border border-ok-border bg-ok-subtle shadow-card [backface-visibility:hidden]"
                    style={{ transform: 'rotateY(180deg)' }}
                >
                    <div
                        className="h-full overflow-y-auto"
                        onClick={() => setFlipped(false)}
                        role="button"
                        aria-label="Back to question"
                    >
                    <div ref={backRef} className="p-4">
                        <div className="mb-2 text-center text-[13px] font-semibold text-gray-500">{word}</div>

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
                            <p className="m-0 mb-3 text-center text-[22px] font-semibold leading-snug text-gray-900">
                                {translation}
                            </p>
                        )}

                        {hasGrammar && (
                            <div className="mb-3 rounded-card border border-ok-border bg-white/70 p-3">
                                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ok-strong">
                                    Grammar Reference
                                </div>
                                <GrammarCard content={card.linguisticInfo || ''} />
                            </div>
                        )}

                        {examples.length > 0 && (
                            <div>
                                <div className="mb-2 text-[13px] font-semibold text-gray-500">Examples</div>
                                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                                    {examples.map(([text, tr], index) => (
                                        <li key={index} className="flex items-start gap-2.5">
                                            {card.examplesAudio?.[index] ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => play(e, card.examplesAudio?.[index])}
                                                    aria-label="Play example"
                                                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent transition-colors hover:bg-accent-border"
                                                >
                                                    <FaVolumeUp size={10} />
                                                </button>
                                            ) : (
                                                <span className="mt-0.5 shrink-0 text-[15px] leading-5 text-ok-strong" aria-hidden>•</span>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="break-words text-[14px] leading-6 text-gray-900">{highlight(text)}</div>
                                                {tr && <div className="mt-0.5 break-words text-[13px] leading-5 text-gray-500">{tr}</div>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudyCard;
