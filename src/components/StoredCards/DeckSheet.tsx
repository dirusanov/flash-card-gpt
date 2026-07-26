import React, { useState } from 'react';
import { FaLayerGroup, FaPlay, FaCheck, FaEllipsisH, FaTimes, FaExclamationTriangle, FaPlus } from 'react-icons/fa';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Menu from '../ui/Menu';

export interface DeckOption {
    id: string | null;
    name: string;
    count: number;
    due: number;
}

// Decks aren't given an explicit color to store or pick — mobile's DeckCard does, but
// adding a color picker here for a side panel this size would be more chrome than the
// win is worth. Deriving one from the id gives every deck a stable, distinct accent (the
// same deck always lands on the same color) without any extra state or UI.
const DECK_COLORS = ['#4f46e5', '#0891b2', '#d97706', '#be185d', '#059669', '#7c3aed', '#dc2626', '#0284c7'];
const colorForDeck = (id: string): string => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return DECK_COLORS[Math.abs(hash) % DECK_COLORS.length];
};

interface DeckSheetProps {
    decks: DeckOption[];
    activeDeckId: string | null;
    /** Name of the auto-created fallback deck; it cannot be renamed away or deleted. */
    defaultDeckName: string;
    busy?: boolean;
    onSelect: (deckId: string | null) => void;
    onStudy: (deckId: string | null) => void;
    onRename: (deckId: string, name: string) => Promise<void>;
    onDelete: (deckId: string) => Promise<void>;
    onCreate: (name: string) => Promise<void>;
    onImportFromAnki: (deck: DeckOption) => void;
    onClose: () => void;
}

// The mobile app's deck list, sized for the panel: each deck says how much is in it and
// how much is ready to review, and can be studied straight from the row. It replaces the
// horizontal chip row, which scrolled out of sight once there were a few decks and had
// nowhere to put a due count.
const DeckSheet: React.FC<DeckSheetProps> = ({
    decks,
    activeDeckId,
    defaultDeckName,
    busy = false,
    onSelect,
    onStudy,
    onRename,
    onDelete,
    onCreate,
    onImportFromAnki,
    onClose,
}) => {
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [confirmDelete, setConfirmDelete] = useState<DeckOption | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createValue, setCreateValue] = useState('');

    // Reserved for cards without an explicit deck (see cardMatchesDeck in StoredCards.tsx,
    // which finds "the" default deck by this exact name) — a second deck sharing it would
    // make that lookup ambiguous and effectively hide one of the two.
    const createClashesWithDefault =
        createValue.trim().toLowerCase() === defaultDeckName.toLowerCase();
    const canCreate = Boolean(createValue.trim()) && !createClashesWithDefault;

    const commitCreate = async () => {
        const name = createValue.trim();
        if (!name || createClashesWithDefault) return;
        await onCreate(name);
        setCreateValue('');
        setIsCreating(false);
    };

    const startRename = (deck: DeckOption) => {
        setRenamingId(deck.id);
        setRenameValue(deck.name);
    };

    // The default deck is found by name, so letting another deck take that name would
    // leave two candidates and make "where do deckless cards go" ambiguous.
    const renameClashesWithDefault =
        renameValue.trim().toLowerCase() === defaultDeckName.toLowerCase();
    const canSaveRename = Boolean(renameValue.trim()) && !renameClashesWithDefault;

    const commitRename = async () => {
        const name = renameValue.trim();
        if (!renamingId || !canSaveRename) return;
        await onRename(renamingId, name);
        setRenamingId(null);
    };

    // The aggregate view mobile's Today tab covers on its own: everything due, across
    // every deck, is exactly the "All cards" row's due count — surfaced here as a banner
    // so it reads as a proper entry point rather than something to notice in the list.
    const totalDue = decks.find((deck) => deck.id === null)?.due ?? 0;

    return (
        <>
            <Modal open onClose={onClose} title="Decks" maxWidth={360}>
                <div className={`flex flex-col gap-1 px-3 pb-3 pt-1 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
                    {totalDue > 0 && (
                        <button
                            type="button"
                            onClick={() => { onStudy(null); onClose(); }}
                            className="mb-1 flex items-center gap-2.5 rounded-card border border-accent-border bg-accent-subtle px-3 py-2.5 text-left transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-card bg-accent text-white">
                                <FaPlay size={11} />
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] font-semibold text-gray-900">
                                {totalDue} {totalDue === 1 ? 'card' : 'cards'} due across all decks
                            </span>
                        </button>
                    )}

                    {decks.map((deck) => {
                        const active = deck.id === activeDeckId;
                        const isAll = deck.id === null;
                        const isDefault = deck.name === defaultDeckName;

                        if (renamingId && renamingId === deck.id) {
                            return (
                                <div key={deck.id} className="rounded-card border border-accent-border bg-white p-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            autoFocus
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') void commitRename();
                                                if (e.key === 'Escape') setRenamingId(null);
                                            }}
                                            aria-label="Deck name"
                                            className="h-8 min-w-0 flex-1 rounded-control border border-accent bg-white px-2.5 text-[13px] text-gray-900 outline-none ring-2 ring-accent"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => void commitRename()}
                                            disabled={!canSaveRename}
                                            aria-label="Save name"
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-gray-400"
                                        >
                                            <FaCheck size={11} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRenamingId(null)}
                                            aria-label="Cancel"
                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600"
                                        >
                                            <FaTimes size={11} />
                                        </button>
                                    </div>
                                    {renameClashesWithDefault && (
                                        <p className="m-0 mt-1.5 px-1 text-[11px] leading-snug text-warn-strong">
                                            “{defaultDeckName}” is reserved for cards without a deck.
                                        </p>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <div
                                key={deck.id ?? 'all'}
                                className={`flex items-center gap-2 rounded-card border px-2.5 py-2 transition-colors ${
                                    active ? 'border-accent-border bg-accent-subtle' : 'border-line bg-white'
                                }`}
                            >
                                <button
                                    type="button"
                                    onClick={() => { onSelect(deck.id); onClose(); }}
                                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                >
                                    <span
                                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-card ${
                                            active ? 'bg-white text-accent' : isAll ? 'bg-surface-muted text-gray-400' : ''
                                        }`}
                                        style={
                                            !active && !isAll
                                                ? { backgroundColor: `${colorForDeck(deck.id as string)}1a`, color: colorForDeck(deck.id as string) }
                                                : undefined
                                        }
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

                                {/* "All cards" is a view, not a deck. The default deck is
                                    identified by its name — renaming it would make the next
                                    deckless card create a second one — so rename/delete stay
                                    off it, but it can still receive an Anki import like any
                                    other deck. */}
                                {!isAll && deck.id && (
                                    <Menu
                                        label={`Actions for ${deck.name}`}
                                        items={[
                                            { value: 'import', label: 'Import from Anki…' },
                                            ...(isDefault ? [] : [
                                                { value: 'rename', label: 'Rename deck' },
                                                { value: 'delete', label: 'Delete deck' },
                                            ]),
                                        ]}
                                        value=""
                                        onSelect={(action) => {
                                            if (action === 'rename') startRename(deck);
                                            else if (action === 'delete') setConfirmDelete(deck);
                                            else if (action === 'import') { onImportFromAnki(deck); onClose(); }
                                        }}
                                        trigger={({ open, toggle }) => (
                                            <button
                                                type="button"
                                                aria-haspopup="menu"
                                                aria-expanded={open}
                                                aria-label={`Actions for ${deck.name}`}
                                                onClick={toggle}
                                                className="flex h-8 w-7 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                                            >
                                                <FaEllipsisH size={12} />
                                            </button>
                                        )}
                                    />
                                )}
                            </div>
                        );
                    })}

                    {isCreating ? (
                        <div className="mt-1 flex items-center gap-1.5">
                            <input
                                autoFocus
                                value={createValue}
                                onChange={(e) => setCreateValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void commitCreate();
                                    if (e.key === 'Escape') { setIsCreating(false); setCreateValue(''); }
                                }}
                                placeholder="Deck name…"
                                aria-label="New deck name"
                                className="h-8 min-w-0 flex-1 rounded-control border border-accent bg-white px-2.5 text-[13px] text-gray-900 outline-none ring-2 ring-accent"
                            />
                            <button
                                type="button"
                                onClick={() => void commitCreate()}
                                disabled={!canCreate}
                                aria-label="Create deck"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-accent text-white transition-colors hover:bg-accent-hover disabled:bg-surface-sunken disabled:text-gray-400"
                            >
                                <FaCheck size={11} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setIsCreating(false); setCreateValue(''); }}
                                aria-label="Cancel"
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600"
                            >
                                <FaTimes size={11} />
                            </button>
                        </div>
                    ) : null}

                    {isCreating && createClashesWithDefault && (
                        <p className="m-0 px-1 text-[11px] leading-snug text-warn-strong">
                            “{defaultDeckName}” is reserved for cards without a deck.
                        </p>
                    )}

                    {!isCreating && (
                        <button
                            type="button"
                            onClick={() => setIsCreating(true)}
                            className="mt-1 flex w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px] font-medium text-accent transition-colors hover:bg-accent-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                <FaPlus size={10} />
                            </span>
                            New deck
                        </button>
                    )}

                    <p className="m-0 mt-1.5 px-1 text-[11px] leading-snug text-gray-400">
                        Decks are saved on this device and sync to your phone once you sign in.
                    </p>
                </div>
            </Modal>

            {confirmDelete && confirmDelete.id && (
                <Modal open onClose={() => setConfirmDelete(null)} title="Delete deck?" maxWidth={340}>
                    <div className="px-4 py-4">
                        <p className="m-0 text-[13px] leading-relaxed text-gray-600">
                            <span className="font-semibold text-gray-900">{confirmDelete.name}</span> will be removed.
                        </p>
                        {confirmDelete.count > 0 && (
                            <div className="mt-3 flex items-start gap-2 rounded-card border border-warn-border bg-warn-subtle px-3 py-2">
                                <FaExclamationTriangle size={11} className="mt-0.5 shrink-0 text-warn" />
                                <span className="text-[12px] leading-snug text-warn-strong">
                                    Its {confirmDelete.count} {confirmDelete.count === 1 ? 'card' : 'cards'}{' '}
                                    {/* The default deck may not exist yet (e.g. a brand-new local-only
                                        account) — cards can only "move to" it if it's actually there. */}
                                    {decks.some((d) => d.name === defaultDeckName)
                                        ? <>{confirmDelete.count === 1 ? 'moves' : 'move'} to “{defaultDeckName}”.</>
                                        : <>{confirmDelete.count === 1 ? 'becomes' : 'become'} deckless.</>}
                                    {' '}No cards are deleted.
                                </span>
                            </div>
                        )}
                        <div className="mt-4 flex gap-2.5">
                            <Button variant="secondary" fullWidth onClick={() => setConfirmDelete(null)}>
                                Cancel
                            </Button>
                            <Button
                                variant="danger"
                                fullWidth
                                onClick={async () => {
                                    const target = confirmDelete.id as string;
                                    setConfirmDelete(null);
                                    await onDelete(target);
                                }}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};

export default DeckSheet;
