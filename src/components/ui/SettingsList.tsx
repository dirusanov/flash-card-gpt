import React, { useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';

interface SettingsGroupProps {
    caption: string;
    children: React.ReactNode;
}

// A grouped list rather than a stack of bordered panels. Each panel previously carried a
// title, a description line and an always-open body, which made a short page read long.
export const SettingsGroup: React.FC<SettingsGroupProps> = ({ caption, children }) => (
    <section className="flex flex-col gap-1.5">
        <h2 className="m-0 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {caption}
        </h2>
        <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white shadow-control">
            {children}
        </div>
    </section>
);

interface SettingsRowProps {
    label: string;
    /** Muted text on the right — the current value at a glance. */
    value?: React.ReactNode;
    /** A switch or similar, shown instead of the expand affordance. */
    control?: React.ReactNode;
    /** When present the row expands to reveal this. */
    children?: React.ReactNode;
    defaultOpen?: boolean;
    /** Expanded content shown whenever `control` is on, without a chevron of its own. */
    forceOpen?: boolean;
}

export const SettingsRow: React.FC<SettingsRowProps> = ({
    label,
    value,
    control,
    children,
    defaultOpen = false,
    forceOpen,
}) => {
    const [open, setOpen] = useState(defaultOpen);
    const expandable = Boolean(children) && forceOpen === undefined;
    const expanded = forceOpen !== undefined ? forceOpen : open;

    const header = (
        <>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800">
                {label}
            </span>
            {value && <span className="shrink-0 text-xs text-gray-400">{value}</span>}
            {expandable && (
                <FaChevronDown
                    size={9}
                    className={`shrink-0 text-gray-400 transition-transform duration-150 ${
                        open ? 'rotate-180' : ''
                    }`}
                />
            )}
            {control}
        </>
    );

    return (
        <div>
            {expandable ? (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((prev) => !prev)}
                    className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                    {header}
                </button>
            ) : (
                <div className="flex w-full items-center gap-2.5 px-3 py-2.5">{header}</div>
            )}

            {children && expanded && (
                <div className="border-t border-line bg-surface-muted px-3 py-3">{children}</div>
            )}
        </div>
    );
};
