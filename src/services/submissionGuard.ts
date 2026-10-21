/** Guards asynchronous preparation before a generation owns the UI's loading lock. */
export const createSubmissionGuard = () => {
    let active = true;
    let current: { identity: string } | null = null;
    return {
        activate: () => { active = true; },
        invalidate: () => { current = null; },
        dispose: () => { active = false; current = null; },
        begin: (identity: string) => {
            if (!active || current) return null;
            current = { identity };
            return current;
        },
        isCurrent: (ticket: { identity: string }, identity: string) =>
            active && current === ticket && ticket.identity === identity,
        finish: (ticket: { identity: string }) => { if (current === ticket) current = null; },
    };
};
