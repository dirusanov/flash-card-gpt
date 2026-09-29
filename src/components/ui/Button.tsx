import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    /** Renders a leading icon and reserves its slot so labels stay aligned. */
    icon?: React.ReactNode;
    fullWidth?: boolean;
}

// Hover and focus live in CSS rather than onMouseOver handlers, which is what gives
// these keyboard states at all — the old inline-styled buttons had none.
const VARIANTS: Record<Variant, string> = {
    primary:
        'bg-accent text-white shadow-control hover:bg-accent-hover disabled:bg-line disabled:text-gray-400 disabled:shadow-none',
    secondary:
        'bg-white text-gray-700 border border-line shadow-control hover:bg-surface-sunken disabled:text-gray-400',
    ghost:
        'bg-transparent text-gray-500 hover:bg-surface-sunken hover:text-gray-700 disabled:text-gray-300',
    danger:
        'bg-white text-danger border border-danger-border hover:bg-danger-subtle disabled:text-gray-400',
};

const SIZES: Record<Size, string> = {
    sm: 'h-8 px-3 text-[13px] gap-1.5',
    md: 'h-9 px-4 text-sm gap-2',
    lg: 'h-11 px-5 text-[15px] gap-2',
};

const Button: React.FC<ButtonProps> = ({
    variant = 'secondary',
    size = 'md',
    icon,
    fullWidth,
    className = '',
    children,
    type = 'button',
    ...rest
}) => (
    <button
        type={type}
        className={[
            'inline-flex items-center justify-center rounded-control font-semibold',
            'transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed',
            VARIANTS[variant],
            SIZES[size],
            fullWidth ? 'w-full' : '',
            className,
        ].join(' ')}
        {...rest}
    >
        {icon}
        {children}
    </button>
);

export default Button;
