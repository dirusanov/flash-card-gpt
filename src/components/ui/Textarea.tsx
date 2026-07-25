import React, { useEffect, useRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    /** Grows with the content between these bounds. Ignored when `fill` is set. */
    minRows?: number;
    maxRows?: number;
    /**
     * Stretches to the height of its flex parent instead of tracking the content.
     * Use for the main composer, where a content-sized box would leave the space
     * between it and the footer empty.
     */
    fill?: boolean;
}

const LINE_HEIGHT = 22;
const VERTICAL_PADDING = 20;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    (
        { minRows = 3, maxRows = 10, fill = false, className = '', value, onChange, ...rest },
        forwardedRef
    ) => {
        const innerRef = useRef<HTMLTextAreaElement | null>(null);

        const setRefs = (node: HTMLTextAreaElement | null) => {
            innerRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
        };

        useEffect(() => {
            if (fill) return;
            const el = innerRef.current;
            if (!el) return;
            el.style.height = 'auto';
            const max = maxRows * LINE_HEIGHT + VERTICAL_PADDING;
            el.style.height = `${Math.min(el.scrollHeight, max)}px`;
            el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
        }, [value, maxRows, fill]);

        return (
            <textarea
                ref={setRefs}
                value={value}
                onChange={onChange}
                style={fill ? undefined : { minHeight: minRows * LINE_HEIGHT + VERTICAL_PADDING }}
                className={[
                    'w-full resize-none rounded-card border border-line bg-white px-3 py-2.5',
                    'text-sm leading-[22px] text-gray-800 placeholder:text-gray-400',
                    'transition-colors duration-150',
                    'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
                    fill ? 'min-h-0 flex-1 overflow-y-auto' : '',
                    className,
                ].join(' ')}
                {...rest}
            />
        );
    }
);

Textarea.displayName = 'Textarea';

export default Textarea;
