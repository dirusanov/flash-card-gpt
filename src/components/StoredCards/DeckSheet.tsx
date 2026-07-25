import React from 'react';
import { FaLayerGroup, FaPlay, FaCheck } from 'react-icons/fa';
import Modal from '../ui/Modal';

export interface DeckOption {
    id: string | null;
    name: string;
    count: number;
    due: number;
}

interface DeckSheetProps {
    decks: DeckOption[];
    activeDeckId: string | null;
    onSelect: (deckId: string | null) => void;
    onStudy: (deckId: string | null) => void;
    onClose: () => void;
}

// The mobile app's deck list, sized for the panel: each deck says how much is in it and
// how much is ready to review, and can be studied straight from the row. It replaces the
// horizontal chip row, which scrolled out of sight once there were a few decks and had
// nowhere to put a due count.
const DeckSheet: React.FC<DeckSheetProps> = ({ decks, activeDeckId, onSelect, onStudy, onClose }) => (
    <Modal open onClose={onClose} title="Decks" maxWidth={360}>
        <div className="flex flex-col gap-1 px-3 pb-3 pt-1">
            {decks.map((deck) => {
                const active = deck.id === activeDeckId;
                return (
                    <div
                        key={deck.id ?? 'all'}
                        className={`flex items-center gap-2.5 rounded-card border px-2.5 py-2 transition-colors ${
                            active ? 'border-accent-border bg-accent-subtle' : 'border-line bg-white'
                        }`}
                    >
                        <button
                            type="button"
                            onClick={() => { onSelect(deck.id); onClose(); }}
                            className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-control"
                        >
                            <span
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-card ${
                                    active ? 'bg-white text-accent' : 'bg-surface-muted text-gray-400'
                                }`}
                            >
                                {active ? <FaCheck size={12} /> : <FaLayerGroup size={13} />}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-gray-900">
                                    {deck.name}
                                </span>
                                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500">
                                    <span>{deck.count} {deck.count === 1 ? 'card' : 'cards'}</span>
                                    {deck.due > 0 && (
                                        <>
                                            <span className="text-gray-300">·</span>
                                            <span className="font-semibold text-ok-strong">{deck.due} due</span>
                                        </>
                                    )}
                                </span>
                            </span>
                        </button>

                        {deck.count > 0 && (
                            <button
                                type="button"
                                onClick={() => { onStudy(deck.id); onClose(); }}
                                aria-label={`Study ${deck.name}`}
                                title={`Study ${deck.name}`}
                                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                                    deck.due > 0
                                        ? 'bg-accent text-white hover:bg-accent-hover'
                                        : 'bg-surface-muted text-gray-400 hover:bg-surface-sunken'
                                }`}
                            >
                                <FaPlay size={10} />
                            </button>
                        )}
                    </div>
                );
            })}

            <p className="m-0 mt-1.5 px-1 text-[11px] leading-snug text-gray-400">
                Decks come from Vaulto Cloud. To put a card in one, use “Move to deck”.
            </p>
        </div>
    </Modal>
);

export default DeckSheet;
