/**
 * SM-2 / forgetting-curve SRS engine.
 *
 * A direct port of vaulto-cards' `src/services/sm2.ts` — the coefficients, the grade
 * effects and the interval previews must stay identical, otherwise a card studied in the
 * extension and the same card studied on the phone would drift onto different schedules.
 * Change this file only together with the mobile one.
 *
 * | Rating | Effect on interval      | Ease delta |
 * |--------|-------------------------|------------|
 * | again  | reset, due in 10 min    |  -0.20     |
 * | hard   | interval *= 1.2         |  -0.15     |
 * | good   | interval *= ease        |   0        |
 * | easy   | interval *= ease * 1.3  |  +0.15     |
 */

export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

export interface CardSrsState {
    srs_due_at: string;        // ISO datetime — when the card is next due
    srs_interval_days: number; // current interval in days (fractional ok)
    srs_ease: number;          // ease factor, min 1.3, starts 2.5
    srs_reps: number;          // consecutive successful reviews
    srs_lapses: number;        // total Again presses
    srs_last_review_at: string | null;
}

const MIN_EASE = 1.3;
const INITIAL_EASE = 2.5;

/** 10-minute "again" delay, expressed in days. */
const AGAIN_DELAY_DAYS = 10 / (60 * 24);

export function createInitialSrsState(): CardSrsState {
    return {
        srs_due_at: new Date().toISOString(),
        srs_interval_days: 0,
        srs_ease: INITIAL_EASE,
        srs_reps: 0,
        srs_lapses: 0,
        srs_last_review_at: null,
    };
}

/** Accepts anything read back from storage/sync and fills in a usable state. */
export function normalizeSrsState(value: unknown): CardSrsState {
    const base = createInitialSrsState();
    if (!value || typeof value !== 'object') return base;
    const raw = value as Partial<CardSrsState>;
    return {
        srs_due_at: typeof raw.srs_due_at === 'string' ? raw.srs_due_at : base.srs_due_at,
        srs_interval_days: typeof raw.srs_interval_days === 'number' ? raw.srs_interval_days : base.srs_interval_days,
        srs_ease: typeof raw.srs_ease === 'number' ? raw.srs_ease : base.srs_ease,
        srs_reps: typeof raw.srs_reps === 'number' ? raw.srs_reps : base.srs_reps,
        srs_lapses: typeof raw.srs_lapses === 'number' ? raw.srs_lapses : base.srs_lapses,
        srs_last_review_at: typeof raw.srs_last_review_at === 'string' ? raw.srs_last_review_at : null,
    };
}

export function applyReview(state: CardSrsState, grade: SrsGrade, now = new Date()): CardSrsState {
    let { srs_interval_days: interval, srs_ease: ease, srs_reps: reps, srs_lapses: lapses } = state;

    switch (grade) {
        case 'again': {
            reps = 0;
            lapses += 1;
            interval = AGAIN_DELAY_DAYS;
            ease = Math.max(MIN_EASE, ease - 0.20);
            break;
        }
        case 'hard': {
            // Interval grows slowly; no rep reset.
            interval = Math.max(1, Math.round(interval * 1.2));
            ease = Math.max(MIN_EASE, ease - 0.15);
            reps += 1;
            break;
        }
        case 'good': {
            if (reps === 0) {
                interval = 1;
            } else if (reps === 1) {
                interval = 6;
            } else {
                interval = Math.max(1, Math.round(interval * ease));
            }
            reps += 1;
            break;
        }
        case 'easy': {
            if (reps === 0) {
                interval = 4;
            } else if (reps === 1) {
                interval = 8;
            } else {
                interval = Math.max(1, Math.round(interval * ease * 1.3));
            }
            ease = Math.min(4.0, ease + 0.15);
            reps += 1;
            break;
        }
    }

    const dueAt = new Date(now);
    dueAt.setTime(dueAt.getTime() + interval * 24 * 60 * 60 * 1000);

    return {
        srs_due_at: dueAt.toISOString(),
        srs_interval_days: interval,
        srs_ease: ease,
        srs_reps: reps,
        srs_lapses: lapses,
        srs_last_review_at: now.toISOString(),
    };
}

/** Human-readable next interval for a grade — the sub-label on each rating button. */
export function getIntervalPreview(state: CardSrsState, grade: SrsGrade): string {
    const { srs_interval_days: intervalDays } = applyReview(state, grade);

    if (intervalDays < 1 / (24 * 60)) return '<1 min';
    if (intervalDays < 1) return `${Math.round(intervalDays * 24 * 60)} min`;
    if (intervalDays < 30) {
        const days = Math.round(intervalDays);
        return days === 1 ? '1 day' : `${days} days`;
    }
    if (intervalDays < 365) {
        const months = Math.round(intervalDays / 30);
        return months === 1 ? '1 mo' : `${months} mo`;
    }
    return `${(intervalDays / 365).toFixed(1)} yr`;
}

export function isDue(state: CardSrsState | undefined, now = new Date()): boolean {
    // A card that has never been reviewed is due immediately, like a new card on mobile.
    if (!state) return true;
    return new Date(state.srs_due_at) <= now;
}

/** Local YYYY-MM-DD, matching the mobile app's bucketing for heatmaps and streaks. */
export function toDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
