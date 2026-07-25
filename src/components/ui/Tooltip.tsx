import React from 'react';

interface TooltipProps {
    /** Tooltip body. When empty the trigger renders bare. */
    label?: React.ReactNode;
    children: React.ReactElement;
    className?: string;
}

// Shows on hover *and* on keyboard focus, which is why this exists instead of the
// `title` attribute: explanations that used to sit permanently under every control
// live here now, and they have to stay reachable without a mouse.
const Tooltip: React.FC<TooltipProps> = ({ label, children, className = '' }) => {
    if (!label) return children;

    return (
        <span className={`group/tip relative inline-flex ${className}`}>
            {children}
            <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[240px] -translate-x-1/2
                           rounded-control bg-gray-900 px-2.5 py-1.5 text-left text-xs font-normal leading-snug text-white
                           opacity-0 shadow-sheet transition-opacity duration-150
                           group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
            >
                {label}
            </span>
        </span>
    );
};

export default Tooltip;
