import React from 'react';
import { FaMagic, FaTimes } from 'react-icons/fa';

interface CardGenerationLoaderProps {
    target: string;
    title: string;
    subtitle?: string;
    completed: number;
    total: number;
    elapsed: string;
    onCancel: () => void;
}

/**
 * The loading state occupies the same visual card that the user has just filled in.
 * This keeps attention in one place and makes the transition from a word to a completed
 * study card feel continuous instead of moving progress into a detached status strip.
 */
const CardGenerationLoader: React.FC<CardGenerationLoaderProps> = ({
    target,
    title,
    subtitle,
    completed,
    total,
    elapsed,
    onCancel,
}) => {
    const hasMeasuredProgress = total > 0;
    const [displayedProgress, setDisplayedProgress] = React.useState(6);

    React.useEffect(() => {
        if (!hasMeasuredProgress) {
            return;
        }

        /*
         * Requests are discovered while the card is being built. A ratio such as 2/3
         * can therefore become 2/6 when validation adds more work, even though nothing
         * actually went backwards. Base the visual target on completed work instead,
         * leave headroom for unknown requests, and never reduce an already shown value.
         */
        const completedSteps = Math.max(0, completed);
        const nextProgress = Math.min(
            92,
            8 + 84 * (1 - Math.exp(-completedSteps / 5))
        );

        setDisplayedProgress((currentProgress) =>
            Math.max(currentProgress, nextProgress)
        );
    }, [completed, hasMeasuredProgress]);

    return (
        <div
            className="relative flex min-h-[240px] flex-1 overflow-x-hidden overflow-y-auto rounded-sheet border border-accent-border bg-white shadow-card"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        'radial-gradient(circle at 18% 15%, rgba(0,102,255,0.10), transparent 34%), radial-gradient(circle at 85% 88%, rgba(16,185,129,0.11), transparent 38%)',
                }}
                aria-hidden
            />

            <div className="relative m-auto flex w-full max-w-[320px] flex-col items-center px-5 py-6 text-center">
                <span className="mb-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-accent-border bg-accent-subtle px-2.5 py-1 text-[11px] font-semibold text-accent">
                    <FaMagic size={9} className="shrink-0" />
                    Building your card
                </span>

                <div className="relative mb-4 flex h-16 w-16 items-center justify-center" aria-hidden>
                    <span className="absolute inset-0 rounded-full border-2 border-accent-border" />
                    <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
                    <span className="absolute inset-2 animate-pulse rounded-full bg-accent-subtle" />
                    <FaMagic size={17} className="relative text-accent" />
                </div>

                <div
                    className="max-w-full break-words text-[21px] font-bold leading-tight tracking-tight text-gray-900"
                    style={{ overflowWrap: 'anywhere' }}
                >
                    {target.trim() || 'Your new card'}
                </div>
                <div className="mt-2 text-[13px] font-semibold leading-snug text-gray-700">
                    {title}
                </div>
                {subtitle && (
                    <div className="mt-1 max-w-[280px] text-[11px] leading-snug text-gray-500">
                        {subtitle}
                    </div>
                )}

                <div className="mt-5 w-full">
                    <div className="h-1.5 overflow-hidden rounded-full bg-line">
                        <div
                            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                            style={{ width: `${displayedProgress}%` }}
                        />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] font-medium text-gray-400">
                        <span>
                            {hasMeasuredProgress
                                ? `${Math.min(completed, total)} of ${total} steps`
                                : 'Preparing the first step'}
                        </span>
                        <span className="font-mono tabular-nums">{elapsed}</span>
                    </div>
                </div>

                <div className="mt-4 grid w-full grid-cols-3 gap-2" aria-hidden>
                    {['Answer', 'Examples', 'Grammar'].map((label) => (
                        <div key={label} className="rounded-control border border-line bg-white/80 px-2 py-2 shadow-control">
                            <div className="mx-auto mb-1.5 h-1.5 w-8 animate-pulse rounded-full bg-accent-border" />
                            <div className="text-[9px] font-semibold text-gray-500">{label}</div>
                        </div>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onCancel}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-surface-sunken hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                    <FaTimes size={9} />
                    Cancel
                </button>
            </div>
        </div>
    );
};

export default CardGenerationLoader;
