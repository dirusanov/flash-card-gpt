import React, { useEffect, useLayoutEffect, useRef } from 'react';

type AutoTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

// A textarea that grows to fit its content, so edited text is never clipped behind a
// fixed one-row height. Edit mode uses these everywhere a value can wrap (translation,
// examples, grammar) so the card shows everything, just like read mode.
const AutoTextarea: React.FC<AutoTextareaProps> = ({ value, className = '', onInput, ...rest }) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = () => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    // Re-fit when the value changes from the outside (e.g. a regeneration) as well as on
    // every keystroke. useLayoutEffect avoids a one-frame flash at the wrong height.
    useLayoutEffect(resize, [value]);
    useEffect(resize, []);

    return (
        <textarea
            ref={ref}
            value={value}
            rows={1}
            onInput={(e) => {
                resize();
                onInput?.(e);
            }}
            className={`resize-none overflow-hidden ${className}`}
            {...rest}
        />
    );
};

export default AutoTextarea;
