import React, { useState } from 'react';
import { FaChevronDown, FaRedo } from 'react-icons/fa';
import Menu, { MenuItem } from '../ui/Menu';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';
import Loader from '../Loader';

type Action = 'image' | 'examples' | 'instructions';

interface RegenerateControlProps {
    onNewImage: () => void;
    onNewExamples: () => void;
    /** Applies a free-form comment to the whole card. Omit where it is not supported. */
    onApplyInstruction?: (instruction: string) => void;
    hasImage: boolean;
    hasExamples: boolean;
    busy: boolean;
}

// Replaces two amber "New Image" / "New Examples" buttons competing with the primary
// action, plus the instruction field that used to sit above the card — asking for
// corrections before you had seen what needed correcting.
const RegenerateControl: React.FC<RegenerateControlProps> = ({
    onNewImage,
    onNewExamples,
    onApplyInstruction,
    hasImage,
    hasExamples,
    busy,
}) => {
    const [instructionOpen, setInstructionOpen] = useState(false);
    const [instruction, setInstruction] = useState('');

    const items: MenuItem<Action>[] = [
        ...(hasImage
            ? [{ value: 'image' as const, label: 'New image', description: 'Draw a different picture for the same word' }]
            : []),
        ...(hasExamples
            ? [{ value: 'examples' as const, label: 'New examples', description: 'Write a different set of example sentences' }]
            : []),
        ...(onApplyInstruction
            ? [{
                value: 'instructions' as const,
                label: 'Change with a comment…',
                description: 'Say what to fix and the card is rebuilt around it',
            }]
            : []),
    ];

    const run = (action: Action) => {
        if (action === 'image') return onNewImage();
        if (action === 'examples') return onNewExamples();
        setInstruction('');
        setInstructionOpen(true);
    };

    const apply = () => {
        const value = instruction.trim();
        if (!value || !onApplyInstruction) return;
        onApplyInstruction(value);
        setInstructionOpen(false);
    };

    return (
        <>
            <Menu
                label="Regenerate options"
                items={items}
                value={'' as Action}
                onSelect={run}
                trigger={({ open, toggle }) => (
                    <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={open}
                        disabled={busy}
                        onClick={toggle}
                        className="inline-flex h-11 items-center gap-2 rounded-control border border-line bg-white px-4 text-sm font-semibold text-gray-700 shadow-control transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {busy ? (
                            <Loader type="spinner" size="small" inline color="#6C757D" />
                        ) : (
                            <FaRedo size={12} />
                        )}
                        Redo
                        <FaChevronDown size={8} className="text-gray-400" />
                    </button>
                )}
            />

            <Modal
                open={instructionOpen}
                onClose={() => setInstructionOpen(false)}
                title="What should change?"
                maxWidth={340}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => setInstructionOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={!instruction.trim()}
                            onClick={apply}
                        >
                            Apply
                        </Button>
                    </div>
                }
            >
                <div className="p-4">
                    <Textarea
                        autoFocus
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                apply();
                            }
                        }}
                        minRows={3}
                        placeholder="E.g. make the examples more formal, use a simpler translation, change the image style."
                    />
                </div>
            </Modal>
        </>
    );
};

export default RegenerateControl;
