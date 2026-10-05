import React, { useLayoutEffect, useRef } from 'react';

interface CardFrontInputProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
    onBlur?: () => void;
    placeholder?: string;
    autoFocus?: boolean;
    /** Small caption in the study card's "Tap to reveal answer" position. */
    hint?: string;
    /** Leave room for first-run guidance and generation options in a short panel. */
    compact?: boolean;
}

/**
 * The word you are studying, typed straight onto the front of the card.
 *
 * A card starts life as its question, so the composer shows the same face you will later
 * flip: white sheet, one big centred word. A plain textarea gave no hint that what you
 * type becomes the front and everything else is generated onto the back.
 *
 * Only for language cards — the general mode takes pasted articles, where a 30px centred
 * font would be unreadable.
 */
const CardFrontInput: React.FC<CardFrontInputProps> = ({
    value,
    onChange,
    onKeyDown,
    onBlur,
    placeholder,
    autoFocus,
    hint = 'The back is generated for you',
    compact = false,
}) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    // The field grows with the word rather than scrolling inside itself; the card around
    // it takes over scrolling once there is genuinely too much.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [value]);

    // `flex-1` lets the card take the space the panel has, so it reads generously on a
    // normal window without a fixed height leaving a gap above the footer. The floor is
    // deliberately well under the resting size: a hard 340px minimum overflowed a short
    // panel by a few pixels and put a scrollbar on the column.
    return (
        <div className={`${compact ? 'min-h-[120px]' : 'min-h-[240px]'} flex flex-1 overflow-y-auto rounded-sheet border border-line bg-white shadow-card transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20`}>
            {/* `m-auto` centres the content while there is room and stops when there is
                not — justify-center would clip the top once the word wraps. */}
            <div className="m-auto flex w-full flex-col items-center gap-3 p-5">
                <textarea
                    ref={ref}
                    rows={1}
                    autoFocus={autoFocus}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    aria-label="Word or phrase for the card"
                    className={[
                        'w-full resize-none overflow-hidden bg-transparent text-center outline-none',
                        'text-[30px] font-bold leading-tight tracking-tight text-gray-900',
                        // The placeholder is a sentence, not a headword, so it drops back to
                        // body size instead of shouting at 30px.
                        'placeholder:text-[14px] placeholder:font-medium placeholder:leading-snug placeholder:tracking-normal placeholder:text-gray-400',
                    ].join(' ')}
                />
                {hint && value.trim() !== '' && (
                    <span className="text-[11px] font-medium text-gray-400">{hint}</span>
                )}
            </div>
        </div>
    );
};

export default CardFrontInput;
