import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import { FaChevronDown, FaDesktop } from 'react-icons/fa';
import { RootState } from '../../store';
import { DEFAULT_DECK_NAME } from '../../services/cardsSyncService';
import Modal from '../ui/Modal';
import DeckSelector from './DeckSelector';
import brandLogo from '../../assets/img/vaulto-cards-logo.png';

// The full deck panel is too tall to sit above the primary button, but the destination
// still has to be visible *before* a card is generated — it used to appear only in the
// result modal, after the API call had already been paid for. So: one summary line here,
// the real picker one click away.
const DeckDestination: React.FC = () => {
    const [open, setOpen] = useState(false);
    const isAnkiAvailable = useSelector((state: RootState) => state.anki.isAnkiAvailable);
    const { useAnkiConnect, selectedAnkiDeckName, selectedBackendDeckName } = useSelector(
        (state: RootState) => state.settings
    );
    const brandLogoUrl =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL(brandLogo)
            : brandLogo;

    // Both destinations at a glance, because they are not alternatives: a card lives in
    // Vaulto *and* may additionally be exported to an Anki deck. The service icon carries
    // the "which service" meaning, so the deck name never has to repeat it. Vaulto is the
    // card's local home either way — being signed in only adds cloud backup on top.
    const vaultoDeck = selectedBackendDeckName || DEFAULT_DECK_NAME;
    // A deck chosen while Anki was running is not a destination once Anki is off — showing
    // it implied cards were still going there.
    const ankiDeck =
        useAnkiConnect && isAnkiAvailable && selectedAnkiDeckName ? selectedAnkiDeckName : null;
    const hasDestination = Boolean(vaultoDeck || ankiDeck);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-label="Where cards are saved"
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
                {hasDestination ? (
                    // Each destination is its own chip, so two of them read as two places
                    // rather than one run-on line.
                    <span className="flex min-w-0 flex-1 items-center gap-1.5">
                        {vaultoDeck && (
                            <span className="flex min-w-0 max-w-[60%] items-center gap-1.5 rounded-full border border-line bg-surface-muted py-0.5 pl-1 pr-2">
                                <img src={brandLogoUrl} alt="Vaulto" className="h-4 w-4 shrink-0 object-contain" />
                                <span className="truncate text-[12px] font-medium text-gray-700">{vaultoDeck}</span>
                            </span>
                        )}
                        {ankiDeck && (
                            <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface-muted py-0.5 pl-2 pr-2">
                                <FaDesktop size={10} className="shrink-0 text-gray-400" />
                                <span className="truncate text-[12px] font-medium text-gray-700">{ankiDeck}</span>
                            </span>
                        )}
                    </span>
                ) : (
                    <span className="min-w-0 flex-1 truncate text-[13px] text-gray-400">
                        Choose where cards are saved
                    </span>
                )}
                <FaChevronDown size={9} className="shrink-0 text-gray-400" />
            </button>

            <Modal open={open} onClose={() => setOpen(false)} title="Where cards are saved">
                <div className="px-3 pb-3 pt-1">
                    <DeckSelector />
                </div>
            </Modal>
        </>
    );
};

export default DeckDestination;
