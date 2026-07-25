import React, { useCallback, useEffect, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    subtitle?: React.ReactNode;
    /** Pinned to the bottom of the sheet, outside the scroll area. */
    footer?: React.ReactNode;
    children: React.ReactNode;
    maxWidth?: number;
}

const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modals stack (the deck picker opens on top of the card editor). Every open modal
// listens on `document`, and stopPropagation does not stop sibling listeners on the same
// node — so without this, one Escape closed the whole stack at once. Only the topmost
// modal reacts to Escape and traps Tab.
const openModals: symbol[] = [];

// Every modal in the panel used to be a hand-rolled fixed div: no Esc, no focus trap,
// and focus left behind on whatever opened it. This centralises all three.
const Modal: React.FC<ModalProps> = ({
    open,
    onClose,
    title,
    subtitle,
    footer,
    children,
    maxWidth = 360,
}) => {
    const sheetRef = useRef<HTMLDivElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    // Keep the latest onClose without making the keydown handler (and therefore the
    // focus effect) change identity on every parent render — otherwise the effect
    // re-ran on each keystroke and stole focus back to the first focusable element,
    // which made the cursor vanish after a single character in any modal field.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });
    const idRef = useRef<symbol>(Symbol('modal'));

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Ignore keys aimed at a modal stacked above this one.
        if (openModals[openModals.length - 1] !== idRef.current) return;

        if (event.key === 'Escape') {
            event.stopPropagation();
            onCloseRef.current();
            return;
        }

        if (event.key !== 'Tab' || !sheetRef.current) return;

        const focusable = Array.from(
            sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }, []);

    useEffect(() => {
        if (!open) return undefined;

        restoreFocusRef.current = document.activeElement as HTMLElement | null;
        const id = idRef.current;
        openModals.push(id);
        document.addEventListener('keydown', handleKeyDown, true);

        // Move focus into the sheet so Tab cycles inside it from the very first press.
        const focusTarget = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
        focusTarget?.focus();

        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            const index = openModals.indexOf(id);
            if (index !== -1) openModals.splice(index, 1);
            restoreFocusRef.current?.focus?.();
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
            onClick={onClose}
        >
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                style={{ maxWidth }}
                className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-sheet bg-white shadow-sheet"
                onClick={(e) => e.stopPropagation()}
            >
                {(title || subtitle) && (
                    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
                        <div className="min-w-0">
                            {title && (
                                <h2 className="m-0 truncate text-[15px] font-semibold text-gray-900">
                                    {title}
                                </h2>
                            )}
                            {subtitle && (
                                <p className="m-0 mt-0.5 text-xs text-gray-500">{subtitle}</p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="-mr-1 -mt-0.5 shrink-0 rounded-control p-2 text-gray-400 transition-colors hover:bg-surface-sunken hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                            <FaTimes size={14} />
                        </button>
                    </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

                {footer && (
                    <div className="border-t border-line bg-surface-muted px-4 py-3">{footer}</div>
                )}
            </div>
        </div>
    );
};

export default Modal;
