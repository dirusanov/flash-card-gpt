import React from 'react';
import { FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';

export type TestOutcome = { success: boolean; message: string } | null;

const TestResult: React.FC<{ outcome: TestOutcome }> = ({ outcome }) => {
    if (!outcome) return null;

    return (
        <div
            role="status"
            className={`flex items-start gap-2 rounded-control border px-2.5 py-2 text-xs leading-snug ${
                outcome.success
                    ? 'border-ok/40 bg-ok-subtle text-ok-strong'
                    : 'border-danger-border bg-danger-subtle text-danger-strong'
            }`}
        >
            {outcome.success ? (
                <FaCheckCircle size={12} className="mt-px shrink-0" />
            ) : (
                <FaExclamationCircle size={12} className="mt-px shrink-0" />
            )}
            <span className="min-w-0 break-words">{outcome.message}</span>
        </div>
    );
};

export default TestResult;
