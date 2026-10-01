import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { FaCheck, FaDesktop, FaExclamationTriangle } from 'react-icons/fa';
import { RootState } from '../../store';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Loader from '../Loader';
import { fetchDecks, fetchNotesInDeck } from '../../services/ankiService';

interface ImportFromAnkiModalProps {
    open: boolean;
    onClose: () => void;
    targetDeckName: string;
    /** Notes already imported into Vaulto, so re-running this doesn't duplicate them. */
    alreadyImportedNoteIds: Set<number>;
    onImport: (notes: Array<{ noteId: number; front: string; back: string }>) => void;
}

// The read-only counterpart to "Send to Anki": pulls the notes already sitting in an
// existing Anki deck in as ordinary Vaulto cards, so a deck you already built in Anki
// becomes studyable here too. One-directional and on-demand — not a live sync with Anki's
// own scheduler (see the note in store/actions/vaultoDecks.ts for why).
const ImportFromAnkiModal: React.FC<ImportFromAnkiModalProps> = ({
    open,
    onClose,
    targetDeckName,
    alreadyImportedNoteIds,
    onImport,
}) => {
    const { ankiConnectUrl, ankiConnectApiKey, useAnkiConnect } = useSelector(
        (state: RootState) => state.settings
    );

    const [ankiDecks, setAnkiDecks] = useState<{ name: string }[]>([]);
    const [loadingDecks, setLoadingDecks] = useState(false);
    const [selectedDeck, setSelectedDeck] = useState<string | null>(null);
    const [importing, setImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

    useEffect(() => {
        if (!open) {
            setSelectedDeck(null);
            setError(null);
            setResult(null);
            return;
        }
        if (!useAnkiConnect) return;

        setLoadingDecks(true);
        setError(null);
        fetchDecks(ankiConnectUrl, ankiConnectApiKey)
            .then((resp) => {
                if (resp.error) {
                    setError(resp.error);
                    setAnkiDecks([]);
                    return;
                }
                setAnkiDecks((resp.result || []).map((d) => ({ name: d.name })));
            })
            .catch(() => setError('AnkiConnect unreachable'))
            .finally(() => setLoadingDecks(false));
    }, [open, useAnkiConnect, ankiConnectUrl, ankiConnectApiKey]);

    const handleImport = async () => {
        if (!selectedDeck) return;
        setImporting(true);
        setError(null);
        setResult(null);
        try {
            const { notes, error: fetchError } = await fetchNotesInDeck(ankiConnectUrl, ankiConnectApiKey, selectedDeck);
            if (fetchError) {
                setError(fetchError);
                return;
            }

            const fresh = notes.filter((note) => !alreadyImportedNoteIds.has(note.noteId));
            if (fresh.length > 0) {
                onImport(fresh);
            }
            setResult({ imported: fresh.length, skipped: notes.length - fresh.length });
        } catch (err: any) {
            setError(err?.message || 'Failed to import from Anki.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <Modal open={open} onClose={onClose} title="Import from Anki" maxWidth={360}>
            <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
                <p className="m-0 text-[12px] leading-snug text-gray-500">
                    Pulls the notes already in an Anki deck into <span className="font-semibold text-gray-700">{targetDeckName}</span>,
                    so you can study them here too. This is a one-time copy, not a live sync — editing a card
                    afterwards here or in Anki doesn&apos;t affect the other. Only plain-text fronts and backs
                    are copied; Anki audio, images and scheduling are not imported.
                </p>

                {!useAnkiConnect ? (
                    <div className="flex items-center gap-2 rounded-control border border-line bg-surface-muted px-2.5 py-2 text-[12px] text-gray-500">
                        <FaExclamationTriangle size={11} className="shrink-0 text-warn" />
                        Turn on Anki in Settings first.
                    </div>
                ) : loadingDecks ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader type="spinner" size="small" inline color="#6C757D" />
                    </div>
                ) : (
                    <div className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto">
                        {ankiDecks.length === 0 && !error && (
                            <p className="m-0 px-1 text-[12px] text-gray-400">No Anki decks found.</p>
                        )}
                        {ankiDecks.map((deck) => (
                            <button
                                key={deck.name}
                                type="button"
                                onClick={() => setSelectedDeck(deck.name)}
                                aria-pressed={selectedDeck === deck.name}
                                className={[
                                    'flex w-full items-center gap-2.5 rounded-control border px-2.5 py-2 text-left transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                                    selectedDeck === deck.name
                                        ? 'border-accent-border bg-accent-subtle'
                                        : 'border-transparent hover:bg-surface-sunken',
                                ].join(' ')}
                            >
                                <span
                                    className={[
                                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                                        selectedDeck === deck.name ? 'border-accent bg-accent text-white' : 'border-line-strong bg-white',
                                    ].join(' ')}
                                >
                                    {selectedDeck === deck.name && <FaCheck size={8} />}
                                </span>
                                <FaDesktop size={11} className="shrink-0 text-gray-400" />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-gray-700">{deck.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-1.5 text-[11px] text-danger-strong">
                        <FaExclamationTriangle size={10} />
                        {error}
                    </div>
                )}

                {result && (
                    <div className="rounded-control border border-ok-border bg-ok-subtle px-2.5 py-2 text-[12px] text-ok-strong">
                        Imported {result.imported} {result.imported === 1 ? 'card' : 'cards'}.
                        {result.skipped > 0 && ` ${result.skipped} already imported, skipped.`}
                        {result.imported === 0 && result.skipped === 0 && ' Nothing to import.'}
                    </div>
                )}

                <div className="flex gap-2.5">
                    <Button variant="secondary" fullWidth onClick={onClose}>
                        {result ? 'Done' : 'Cancel'}
                    </Button>
                    {!result && (
                        <Button
                            variant="primary"
                            fullWidth
                            onClick={handleImport}
                            disabled={!selectedDeck || importing || !useAnkiConnect}
                        >
                            {importing ? 'Importing…' : 'Import'}
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ImportFromAnkiModal;
