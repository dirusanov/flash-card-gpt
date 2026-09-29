import React from 'react';
import { FaArrowUp } from 'react-icons/fa';
import Loader from '../Loader';

export interface InstructionSuggestion {
    label: string;
    instruction: string;
}

interface InstructionComposerProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (instruction: string) => void;
    loading: boolean;
    status?: string | null;
    suggestions: InstructionSuggestion[];
    disabled?: boolean;
    disabledHint?: string;
    placeholder?: string;
}

// A ChatGPT-style "tell it what to change" box. You describe the change in plain words
// ("5 examples", "watercolour picture", "simpler translation") and the card is rebuilt
// around it — replacing the old grid of amber "New image / New examples" buttons and the
// mode toggle that made editing feel like a separate place.
const InstructionComposer: React.FC<InstructionComposerProps> = ({
    value,
    onChange,
    onSubmit,
    loading,
    status,
    suggestions,
    disabled = false,
    disabledHint,
    placeholder = 'Describe a change…',
}) => {
    const canSend = value.trim().length > 0 && !loading && !disabled;

    const submit = () => {
        const trimmed = value.trim();
        if (!trimmed || loading || disabled) return;
        onSubmit(trimmed);
    };

    return (
        <div className="flex flex-col gap-2">
            {loading ? (
                <div className="flex items-center gap-2 px-1 text-[13px] text-accent">
                    <Loader type="spinner" size="small" inline color="#0066FF" />
                    <span>{status || 'Working on it…'}</span>
                </div>
            ) : (
                suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                            <button
                                key={s.label}
                                type="button"
                                disabled={disabled}
                                onClick={() => onSubmit(s.instruction)}
                                className="rounded-full border border-line bg-white px-3 py-1 text-[12px] font-medium text-gray-600 transition-colors hover:border-accent-border hover:bg-accent-subtle hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>
                )
            )}

            <div
                className={`flex items-end gap-2 rounded-sheet border bg-white p-2 transition-colors ${
                    disabled ? 'border-line opacity-60' : 'border-line focus-within:border-accent focus-within:ring-2 focus-within:ring-accent'
                }`}
            >
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled || loading}
                    rows={1}
                    placeholder={disabled ? (disabledHint || placeholder) : placeholder}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    className="max-h-28 min-h-[24px] flex-1 resize-none bg-transparent px-1 py-1 text-[13px] leading-6 text-gray-900 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
                />
                <button
                    type="button"
                    onClick={submit}
                    disabled={!canSend}
                    aria-label="Apply change"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-gray-400"
                >
                    <FaArrowUp size={13} />
                </button>
            </div>
        </div>
    );
};

export default InstructionComposer;
