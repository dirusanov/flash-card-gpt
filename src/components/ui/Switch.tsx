import React from 'react';

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    /** Announced to screen readers; the visible label sits next to the switch. */
    label: string;
    disabled?: boolean;
}

// One switch, one size, one colour. The page previously hand-rolled three of these at
// 42x24, 40x22 and 36x20, each with its own green and its own shadow.
const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
            'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-accent' : 'bg-line-strong',
        ].join(' ')}
    >
        <span
            className={[
                'inline-block h-[18px] w-[18px] rounded-full bg-white shadow-control transition-transform duration-150',
                checked ? 'translate-x-[19px]' : 'translate-x-[3px]',
            ].join(' ')}
        />
    </button>
);

export default Switch;
