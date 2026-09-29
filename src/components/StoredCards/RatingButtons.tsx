import React from 'react';
import { SrsGrade } from '../../services/srs';

interface RatingButtonsProps {
    onRate: (grade: SrsGrade) => void;
    intervalPreviews?: Record<SrsGrade, string>;
    disabled?: boolean;
}

// Same four grades, order and colour language as the mobile app's RatingButtons, so the
// muscle memory carries over between studying on the phone and in the panel.
const BUTTONS: { label: string; grade: SrsGrade; className: string }[] = [
    { label: 'Again', grade: 'again', className: 'border-danger-border bg-danger-subtle text-danger-strong hover:bg-danger-subtle/70' },
    { label: 'Hard', grade: 'hard', className: 'border-warn-border bg-warn-subtle text-warn-strong hover:bg-warn-subtle/70' },
    { label: 'Good', grade: 'good', className: 'border-ok-border bg-ok-subtle text-ok-strong hover:bg-ok-subtle/70' },
    { label: 'Easy', grade: 'easy', className: 'border-accent-border bg-accent-subtle text-accent hover:bg-accent-subtle/70' },
];

const RatingButtons: React.FC<RatingButtonsProps> = ({ onRate, intervalPreviews, disabled }) => (
    <div className="flex flex-col gap-2">
        <span className="text-center text-[12px] text-gray-500">How well did you remember?</span>
        <div className="flex gap-1.5">
            {BUTTONS.map((button) => (
                <button
                    key={button.grade}
                    type="button"
                    disabled={disabled}
                    onClick={() => onRate(button.grade)}
                    className={[
                        'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-card border px-1 py-2',
                        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                        button.className,
                    ].join(' ')}
                >
                    <span className="text-[13px] font-bold">{button.label}</span>
                    <span className="text-[10px] font-medium opacity-80">
                        {intervalPreviews?.[button.grade] ?? '—'}
                    </span>
                </button>
            ))}
        </div>
    </div>
);

export default RatingButtons;
