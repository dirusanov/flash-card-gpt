import React, { useState } from 'react';
import { FaChevronRight } from 'react-icons/fa';

interface DisclosureProps {
    summary: string;
    /** One line of context, shown next to the summary while collapsed. */
    hint?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}

// Keeps rarely-touched fields out of the way without hiding that they exist.
const Disclosure: React.FC<DisclosureProps> = ({ summary, hint, defaultOpen = false, children }) => {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="rounded-control border border-line">
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
                <FaChevronRight
                    size={9}
                    className={`shrink-0 text-gray-400 transition-transform duration-150 ${
                        open ? 'rotate-90' : ''
                    }`}
                />
                <span className="shrink-0 text-[13px] font-medium text-gray-800">{summary}</span>
                {hint && !open && (
                    <span className="min-w-0 flex-1 truncate text-right text-xs text-gray-400">
                        {hint}
                    </span>
                )}
            </button>
            {open && <div className="border-t border-line px-3 py-3">{children}</div>}
        </div>
    );
};

export default Disclosure;
