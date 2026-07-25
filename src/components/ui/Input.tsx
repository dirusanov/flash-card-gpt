import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    /** Rendered inside the field on the right — a Show/Hide toggle, a clear button. */
    trailing?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ trailing, className = '', ...rest }, ref) => (
        <div className="relative w-full">
            <input
                ref={ref}
                className={[
                    'h-9 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-gray-800',
                    'transition-colors duration-150 placeholder:text-gray-400',
                    'focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/20',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    trailing ? 'pr-16' : '',
                    className,
                ].join(' ')}
                {...rest}
            />
            {trailing && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>
            )}
        </div>
    )
);

Input.displayName = 'Input';

export default Input;
