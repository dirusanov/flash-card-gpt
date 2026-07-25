import React, { useMemo, useRef, useState } from 'react';
import { FaCheckCircle } from 'react-icons/fa';
import { StoredCard } from '../../store/reducers/cards';
import { SrsGrade, applyReview, createInitialSrsState, getIntervalPreview } from '../../services/srs';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import StudyCard from './StudyCard';
import RatingButtons from './RatingButtons';

interface StudySessionProps {
    cards: StoredCard[];
    onClose: () => void;
    /** Persists the new schedule and the review log entry. */
    onReview: (card: StoredCard, grade: SrsGrade, responseTimeMs: number) => void;
}

// The panel's counterpart to the mobile StudyScreen: flip the card, grade how well you
// remembered, and the SM-2 engine schedules the next showing. "Again" re-queues the card
// at the end of the session, exactly as on the phone.
const StudySession: React.FC<StudySessionProps> = ({ cards, onClose, onReview }) => {
    const queueRef = useRef<StoredCard[]>([...cards]);
    const [index, setIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [results, setResults] = useState<{ grade: SrsGrade }[]>([]);
    const [done, setDone] = useState(false);
    const shownAtRef = useRef<number>(Date.now());

    const queue = queueRef.current;
    const card = queue[index];

    const intervalPreviews = useMemo(() => {
        const state = card?.srsState ?? createInitialSrsState();
        return {
            again: getIntervalPreview(state, 'again'),
            hard: getIntervalPreview(state, 'hard'),
            good: getIntervalPreview(state, 'good'),
            easy: getIntervalPreview(state, 'easy'),
        } as Record<SrsGrade, string>;
    }, [card]);

    const handleRate = (grade: SrsGrade) => {
        if (!card) return;

        onReview(card, grade, Date.now() - shownAtRef.current);
        setResults((prev) => [...prev, { grade }]);

        if (grade === 'again') {
            // Re-queue with the schedule it just earned, so its previews stay truthful.
            queueRef.current = [
                ...queueRef.current,
                { ...card, srsState: applyReview(card.srsState ?? createInitialSrsState(), grade) },
            ];
        }

        const next = index + 1;
        if (next >= queueRef.current.length) {
            setDone(true);
            return;
        }
        setIndex(next);
        setFlipped(false);
        shownAtRef.current = Date.now();
    };

    if (done || queue.length === 0) {
        const goodCount = results.filter((r) => r.grade === 'good' || r.grade === 'easy').length;
        const againCount = results.filter((r) => r.grade === 'again').length;
        const hardCount = results.filter((r) => r.grade === 'hard').length;

        return (
            <Modal
                open
                onClose={onClose}
                title="Session complete"
                maxWidth={360}
                footer={<Button variant="primary" fullWidth onClick={onClose}>Back to cards</Button>}
            >
                <div className="flex flex-col items-center px-4 py-6 text-center">
                    <FaCheckCircle size={48} className="text-ok" />
                    <p className="m-0 mt-3 text-[17px] font-bold text-gray-900">
                        {queue.length === 0 ? 'All caught up 🎉' : 'Nice work 🎉'}
                    </p>
                    <p className="m-0 mt-1 text-[13px] text-gray-500">
                        {queue.length === 0
                            ? 'No cards are due right now. Come back later.'
                            : `You reviewed ${results.length} ${results.length === 1 ? 'card' : 'cards'}.`}
                    </p>

                    {results.length > 0 && (
                        <div className="mt-4 w-full divide-y divide-line rounded-card border border-line bg-white">
                            {[
                                { label: 'Good / Easy', value: goodCount, tone: 'text-ok-strong' },
                                { label: 'Hard', value: hardCount, tone: 'text-warn-strong' },
                                { label: 'Again', value: againCount, tone: 'text-danger-strong' },
                            ].map((row) => (
                                <div key={row.label} className="flex items-center justify-between px-3 py-2">
                                    <span className="text-[13px] text-gray-500">{row.label}</span>
                                    <span className={`text-[15px] font-bold ${row.tone}`}>{row.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            open
            onClose={onClose}
            title={`${index + 1} / ${queue.length}`}
            maxWidth={360}
            footer={
                <div className="flex flex-col gap-2.5">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
                        <div
                            className="h-full rounded-full bg-accent transition-all duration-300"
                            style={{ width: `${(index / queue.length) * 100}%` }}
                        />
                    </div>

                    {flipped ? (
                        <RatingButtons onRate={handleRate} intervalPreviews={intervalPreviews} />
                    ) : (
                        <Button variant="primary" fullWidth onClick={() => setFlipped(true)}>
                            Show answer
                        </Button>
                    )}
                </div>
            }
        >
            <StudyCard
                card={card}
                resetKey={`${card.id}-${index}`}
                flipped={flipped}
                onFlippedChange={setFlipped}
            />
        </Modal>
    );
};

export default StudySession;
