import React, { useEffect, useRef, useState } from 'react';
import { FaPlus, FaTimes } from 'react-icons/fa';
import { GrammarFact, parseGrammar, serializeGrammar } from '../../services/grammar';
import AutoTextarea from '../ui/AutoTextarea';

interface GrammarCardProps {
    /** Stored grammar string — plain "emoji label: value" lines, or legacy HTML. */
    content: string;
    /** When true, the facts become editable rows instead of read-only chips. */
    isEditable?: boolean;
    /** Called with the re-serialised string whenever the facts change. */
    onChange?: (serialized: string) => void;
}

// Grammar used to be a blob of model-authored HTML dropped in via dangerouslySetInnerHTML
// — inconsistent across languages and impossible to edit without hand-writing HTML. Now we
// parse it into structured facts and own the rendering: clean chips to read, labelled
// inputs to edit.
const GrammarCard: React.FC<GrammarCardProps> = ({ content, isEditable = false, onChange }) => {
    const [facts, setFacts] = useState<GrammarFact[]>(() => parseGrammar(content));
    // Tracks the string we last emitted so an echo of our own onChange does not re-seed
    // (and reset) the inputs mid-edit.
    const lastSyncedRef = useRef<string>(content);

    useEffect(() => {
        if (content !== lastSyncedRef.current) {
            setFacts(parseGrammar(content));
            lastSyncedRef.current = content;
        }
    }, [content]);

    const commit = (next: GrammarFact[]) => {
        setFacts(next);
        const serialized = serializeGrammar(next);
        lastSyncedRef.current = serialized;
        onChange?.(serialized);
    };

    const updateFact = (index: number, patch: Partial<GrammarFact>) => {
        commit(facts.map((fact, i) => (i === index ? { ...fact, ...patch } : fact)));
    };

    const removeFact = (index: number) => {
        commit(facts.filter((_, i) => i !== index));
    };

    const addFact = () => {
        commit([...facts, { emoji: '', label: '', value: '' }]);
    };

    if (!isEditable) {
        if (facts.length === 0) return null;
        return (
            <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                {facts.map((fact, index) => (
                    <div key={index} className="flex items-center gap-2 text-[13px] leading-5">
                        {fact.emoji && (
                            <span className="w-5 shrink-0 text-center text-[15px]" aria-hidden>
                                {fact.emoji}
                            </span>
                        )}
                        {fact.label ? (
                            <>
                                <span className="shrink-0 text-gray-500">{fact.label}:</span>
                                {fact.value && (
                                    <span className="min-w-0 font-semibold text-gray-900">{fact.value}</span>
                                )}
                            </>
                        ) : (
                            // A label-less note reads as prose, not a tag.
                            <span className="min-w-0 text-gray-600">{fact.value}</span>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {facts.map((fact, index) => (
                <div key={index} className="flex items-start gap-1.5">
                    <input
                        value={fact.emoji}
                        onChange={(e) => updateFact(index, { emoji: e.target.value })}
                        aria-label="Emoji"
                        maxLength={4}
                        className="h-9 w-10 shrink-0 rounded-control border border-line bg-white text-center text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent"
                    />
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-control border border-line bg-white focus-within:border-accent focus-within:ring-2 focus-within:ring-accent">
                        <input
                            value={fact.label}
                            onChange={(e) => updateFact(index, { label: e.target.value })}
                            placeholder="Label"
                            aria-label="Label"
                            className="w-full bg-transparent px-2 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 outline-none"
                        />
                        <AutoTextarea
                            value={fact.value}
                            onChange={(e) => updateFact(index, { value: e.target.value })}
                            placeholder="Value"
                            aria-label="Value"
                            className="w-full bg-transparent px-2 pb-1.5 text-[13px] font-semibold leading-5 text-gray-900 outline-none"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => removeFact(index)}
                        aria-label="Remove fact"
                        className="mt-0.5 flex h-9 w-8 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-danger-subtle hover:text-danger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                        <FaTimes size={12} />
                    </button>
                </div>
            ))}

            <button
                type="button"
                onClick={addFact}
                className="flex items-center justify-center gap-2 rounded-control border border-dashed border-accent-border bg-accent-subtle px-2.5 py-2 text-[13px] font-medium text-accent transition-colors hover:border-accent hover:bg-accent-subtle/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                <FaPlus size={11} />
                Add grammar fact
            </button>
        </div>
    );
};

export default GrammarCard;
