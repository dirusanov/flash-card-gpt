import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaCheck } from 'react-icons/fa';

export interface MenuItem<T extends string> {
    value: T;
    label: string;
    description?: string;
}

interface MenuProps<T extends string> {
    /** The element that opens the menu. */
    trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
    items: MenuItem<T>[];
    value: T;
    onSelect: (value: T) => void;
    label: string;
}

const PANEL_WIDTH = 224;
const VIEWPORT_MARGIN = 8;
const GAP = 6;

interface Position {
    top: number;
    left: number;
}

// The panel is portalled to its dialog (or body) with fixed viewport coordinates.
// The composer sets overflow-x, which per the overflow spec makes overflow-y compute to
// auto — so an absolutely positioned panel inside it added a scrollbar and had to be
// scrolled to reach the items. Nothing inside the panel can clip it now.
function Menu<T extends string>({ trigger, items, value, onSelect, label }: MenuProps<T>) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<Position | null>(null);
    const anchorRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const reposition = useCallback(() => {
        const anchor = anchorRef.current?.getBoundingClientRect();
        if (!anchor) return;

        const panelHeight = panelRef.current?.offsetHeight ?? 0;
        const spaceBelow = window.innerHeight - anchor.bottom;

        // Flip above the chip when there is no room below — chips sit just above the
        // footer, so downwards is usually the wrong way.
        const openUpwards = panelHeight > 0 && spaceBelow < panelHeight + GAP + VIEWPORT_MARGIN;

        const top = openUpwards ? anchor.top - panelHeight - GAP : anchor.bottom + GAP;
        const maxLeft = window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN;
        const left = Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, maxLeft));

        setPosition({ top, left });
    }, []);

    // Measure after the panel is in the DOM, otherwise its height is unknown and the
    // flip decision cannot be made.
    useLayoutEffect(() => {
        if (open) reposition();
    }, [open, reposition]);

    // The first render is hidden until measured. Browsers ignore focus() on a hidden
    // panel, so move focus only after visible positioning has committed.
    useLayoutEffect(() => {
        if (!open || !position) return;
        const selected = panelRef.current?.querySelector<HTMLElement>('[aria-checked="true"]');
        (selected || panelRef.current?.querySelector<HTMLElement>('button'))?.focus();
    }, [open, position]);

    useEffect(() => {
        if (!open) return undefined;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                anchorRef.current?.querySelector<HTMLElement>('button')?.focus();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
                if (!buttons.length) return;
                event.preventDefault();
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                    : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
                buttons[next].focus();
            } else if (event.key === 'Tab') {
                event.preventDefault();
                setOpen(false);
                const trigger = anchorRef.current?.querySelector<HTMLElement>('button');
                const scope = anchorRef.current?.closest('[role="dialog"]') || document.body;
                const focusable = Array.from(scope.querySelectorAll<HTMLElement>(
                    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
                )).filter(node => !node.closest('[role="menu"]') && node.getClientRects().length > 0);
                const current = trigger ? focusable.indexOf(trigger) : -1;
                const next = (current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
                (focusable[next] || trigger)?.focus();
            }
        };
        const close = () => setOpen(false);

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown, true);
        // Fixed coordinates go stale once anything moves, so dismiss rather than drift.
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);

        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [open]);

    return (
        <div ref={anchorRef} className="inline-flex">
            {trigger({ open, toggle: () => setOpen((prev) => !prev) })}

            {open &&
                createPortal(
                    <div
                        ref={panelRef}
                        role="menu"
                        aria-label={label}
                        style={{
                            position: 'fixed',
                            width: PANEL_WIDTH,
                            top: position?.top ?? 0,
                            left: position?.left ?? 0,
                            visibility: position ? 'visible' : 'hidden',
                        }}
                        className="z-[2000] overflow-hidden rounded-card border border-line bg-white py-1 shadow-sheet"
                    >
                        {items.map((item) => {
                            const selected = item.value === value;
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={selected}
                                    onClick={() => {
                                        onSelect(item.value);
                                        setOpen(false);
                                    }}
                                    className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none"
                                >
                                    <span className="flex w-3.5 shrink-0 justify-center pt-0.5">
                                        {selected && <FaCheck size={10} className="text-accent" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span
                                            className={`block text-[13px] ${
                                                selected
                                                    ? 'font-semibold text-accent'
                                                    : 'text-gray-800'
                                            }`}
                                        >
                                            {item.label}
                                        </span>
                                        {item.description && (
                                            <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">
                                                {item.description}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>,
                    anchorRef.current?.closest('[role="dialog"]') || document.body
                )}
        </div>
    );
}

export default Menu;
