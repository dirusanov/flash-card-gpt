import { CardSrsState, SrsGrade, toDateString } from './srs';
import { CardsStatsApi } from './cardsSyncApi';

/**
 * Review history + the statistics derived from it.
 *
 * Mirrors vaulto-cards' `review_logs` table and its `useStats` hook, so the numbers shown
 * here mean the same thing as the ones on the phone. Logs live in extension storage
 * (chrome.storage.local, falling back to localStorage) rather than SQLite.
 */

export interface ReviewLogEntry {
    id: string;
    cardId: string;
    grade: SrsGrade;
    reviewedAt: string;      // ISO datetime
    responseTimeMs: number | null;
}

const STORAGE_KEY = 'vaulto_review_logs';
// A year of daily study is far more than any chart here needs, and keeps the blob small.
const MAX_LOGS = 20000;

const canUseExtensionStorage = () =>
    typeof chrome !== 'undefined' && Boolean(chrome?.storage?.local);

const readRaw = async (): Promise<string | null> => {
    if (canUseExtensionStorage()) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([STORAGE_KEY], (result) => {
                    if (chrome.runtime?.lastError) {
                        resolve(null);
                        return;
                    }
                    const value = result?.[STORAGE_KEY];
                    resolve(typeof value === 'string' ? value : null);
                });
            } catch {
                resolve(null);
            }
        });
    }

    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
};

const writeRaw = async (value: string): Promise<void> => {
    if (canUseExtensionStorage()) {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.set({ [STORAGE_KEY]: value }, () => resolve());
            } catch {
                resolve();
            }
        });
    }

    try {
        window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
        // Out of quota — statistics are not worth failing a review over.
    }
};

export const loadReviewLogs = async (): Promise<ReviewLogEntry[]> => {
    const raw = await readRaw();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // An unparseable date would bucket into a "NaN-NaN-NaN" day and quietly corrupt
        // the heatmap and the streak, so entries are dropped rather than trusted.
        return parsed.filter((entry) => (
            entry?.cardId
            && entry?.grade
            && typeof entry.reviewedAt === 'string'
            && !Number.isNaN(Date.parse(entry.reviewedAt))
        ));
    } catch {
        return [];
    }
};

// The id doubles as `client_review_id` on push, and the server parses that with
// `UUID(...)` — anything else raises and the log is dropped without an error. So this
// must be a real UUID, not a timestamp-and-random string.
const newLogId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // RFC 4122 v4 fallback for contexts without randomUUID.
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const appendReviewLog = async (
    entry: Omit<ReviewLogEntry, 'id'>
): Promise<{ entry: ReviewLogEntry; logs: ReviewLogEntry[] }> => {
    const logs = await loadReviewLogs();
    const created: ReviewLogEntry = { ...entry, id: newLogId() };
    const next = [...logs, created];
    const trimmed = next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
    await writeRaw(JSON.stringify(trimmed));
    return { entry: created, logs: trimmed };
};

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface StudyStats {
    today: { due: number; overdue: number; newCards: number; estimatedTimeMin: number; totalStudied: number };
    pipeline: { newCards: number; learning: number; reviewing: number; mature: number; total: number };
    heatmap: Record<string, { count: number; timeMs: number }>;
    retention: { date: string; fullDate: string; goodOrEasy: number; total: number }[];
    forecast: { date: string; due: number }[];
    streak: { current: number; max: number; activeThisWeek: number; bestDay: number };
}

export interface StatsCardInput {
    srsState?: CardSrsState;
}

/**
 * Maps the server's statistics onto the same shape `computeStats` produces.
 *
 * The server aggregates review logs from every device, so these numbers include study
 * done on the phone — the local ones never can, because review logs only travel upwards.
 * Its retention window is the same 30 days ending today, in the same order, which is how
 * the full date is recovered from the compact "MM-DD" labels it returns.
 */
export const serverStatsToStudyStats = (dto: CardsStatsApi, now = new Date()): StudyStats => {
    const retention = dto.retention.map((entry, index) => {
        const day = new Date(now);
        day.setDate(day.getDate() - (dto.retention.length - 1 - index));
        return {
            date: entry.date,
            fullDate: toDateString(day),
            goodOrEasy: entry.good_or_easy,
            total: entry.total,
        };
    });

    const heatmap: StudyStats['heatmap'] = {};
    Object.entries(dto.heatmap ?? {}).forEach(([day, value]) => {
        heatmap[day] = { count: value.count, timeMs: value.time_ms };
    });

    return {
        today: {
            due: dto.today.due,
            overdue: dto.today.overdue,
            newCards: dto.today.new_cards,
            estimatedTimeMin: dto.today.estimated_time_min,
            totalStudied: dto.today.total_studied,
        },
        pipeline: {
            newCards: dto.pipeline.new_cards,
            learning: dto.pipeline.learning,
            reviewing: dto.pipeline.reviewing,
            mature: dto.pipeline.mature,
            total: dto.pipeline.total,
        },
        heatmap,
        retention,
        forecast: dto.forecast.map((entry) => ({ date: entry.date, due: entry.due })),
        streak: {
            current: dto.streak.current,
            max: dto.streak.max,
            activeThisWeek: dto.streak.active_this_week,
            bestDay: dto.streak.best_day,
        },
    };
};

/**
 * Same buckets as the mobile Stats screen:
 * new (never reviewed) → learning (≤2 reps) → reviewing (<21d interval) → mature.
 */
export const computeStats = (
    cards: StatsCardInput[],
    logs: ReviewLogEntry[],
    now = new Date()
): StudyStats => {
    const todayStr = toDateString(now);

    let dueCount = 0;
    let overdueCount = 0;
    let newCardsToday = 0;
    let pipeNew = 0;
    let pipeLearning = 0;
    let pipeReviewing = 0;
    let pipeMature = 0;

    const forecastMap: Record<string, number> = {};
    for (let i = 0; i <= 30; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() + i);
        forecastMap[toDateString(d)] = 0;
    }

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const card of cards) {
        const reps = card.srsState?.srs_reps ?? 0;
        const interval = card.srsState?.srs_interval_days ?? 0;
        const dueAt = new Date(card.srsState?.srs_due_at ?? now);

        if (reps === 0) pipeNew++;
        else if (reps <= 2) pipeLearning++;
        else if (interval < 21) pipeReviewing++;
        else pipeMature++;

        if (dueAt <= now) {
            if (reps === 0) newCardsToday++;
            else if (dueAt < startOfToday) overdueCount++;
            else dueCount++;
        } else {
            const dueStr = toDateString(dueAt);
            if (forecastMap[dueStr] !== undefined) forecastMap[dueStr]++;
        }
    }

    const heatmap: Record<string, { count: number; timeMs: number }> = {};
    const uniqueDates = new Set<string>();
    let totalResponseTime = 0;
    let reviewsWithTime = 0;
    let todayStudiedCount = 0;

    for (const log of logs) {
        const dStr = toDateString(new Date(log.reviewedAt));
        uniqueDates.add(dStr);

        if (!heatmap[dStr]) heatmap[dStr] = { count: 0, timeMs: 0 };
        heatmap[dStr].count++;

        if (log.responseTimeMs) {
            heatmap[dStr].timeMs += log.responseTimeMs;
            totalResponseTime += log.responseTimeMs;
            reviewsWithTime++;
        }

        if (dStr === todayStr) todayStudiedCount++;
    }

    // 5s is the mobile app's assumption before there is any timing data to average.
    const avgResponseTimeMs = reviewsWithTime > 0 ? totalResponseTime / reviewsWithTime : 5000;
    const totalDueQueue = dueCount + overdueCount + newCardsToday;
    const estimatedTimeMin = Math.ceil((totalDueQueue * avgResponseTimeMs) / 60000);

    let bestDay = 0;
    Object.values(heatmap).forEach((day) => { if (day.count > bestDay) bestDay = day.count; });

    let currentStreak = 0;
    let maxStreak = 0;
    const sortedDates = Array.from(uniqueDates).sort();
    if (sortedDates.length > 0) {
        let run = 1;
        maxStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
            const diffDays = Math.round(
                (new Date(sortedDates[i]).getTime() - new Date(sortedDates[i - 1]).getTime()) / 86_400_000
            );
            if (diffDays === 1) {
                run++;
                if (run > maxStreak) maxStreak = run;
            } else {
                run = 1;
            }
        }
        // Studying yesterday still counts — the streak only breaks after a full missed day.
        const daysSinceLast = Math.round(
            (now.getTime() - new Date(sortedDates[sortedDates.length - 1]).getTime()) / 86_400_000
        );
        currentStreak = daysSinceLast <= 1 ? run : 0;
    }

    let activeThisWeek = 0;
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        if (uniqueDates.has(toDateString(d))) activeThisWeek++;
    }

    const retention: StudyStats['retention'] = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const full = toDateString(d);
        retention.push({ date: full.slice(5), fullDate: full, goodOrEasy: 0, total: 0 });
    }

    for (const log of logs) {
        const dStr = toDateString(new Date(log.reviewedAt));
        const entry = retention.find((r) => r.fullDate === dStr);
        if (entry) {
            entry.total++;
            if (log.grade === 'good' || log.grade === 'easy') entry.goodOrEasy++;
        }
    }

    const forecast = Object.entries(forecastMap)
        .slice(0, 14)
        .map(([date, due]) => ({ date: date.slice(5), due }));

    return {
        today: {
            due: dueCount,
            overdue: overdueCount,
            newCards: newCardsToday,
            estimatedTimeMin,
            totalStudied: todayStudiedCount,
        },
        pipeline: {
            newCards: pipeNew,
            learning: pipeLearning,
            reviewing: pipeReviewing,
            mature: pipeMature,
            total: cards.length,
        },
        heatmap,
        retention,
        forecast,
        streak: { current: currentStreak, max: maxStreak, activeThisWeek, bestDay },
    };
};
