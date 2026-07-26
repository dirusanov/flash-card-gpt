import React from 'react';
import { FaFire, FaRegCalendarAlt, FaTrophy } from 'react-icons/fa';
import { StudyStats } from '../../services/reviewLog';
import { toDateString } from '../../services/srs';

interface StatsPanelProps {
    stats: StudyStats;
}

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="rounded-card border border-line bg-white p-3 shadow-control">
        <h3 className="m-0 mb-2.5 text-[14px] font-bold text-gray-900">{title}</h3>
        {children}
    </section>
);

const Legend: React.FC<{ color: string; label: string; count?: number }> = ({ color, label, count }) => (
    <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] text-gray-500">
            {label}{count !== undefined ? `: ${count}` : ''}
        </span>
    </span>
);

// Heatmap colours match the mobile Stats screen's emerald ramp.
const HEAT_COLORS = ['#D1FAE5', '#34D399', '#059669', '#064E3B'];

const Heatmap: React.FC<{ heatmap: StudyStats['heatmap'] }> = ({ heatmap }) => {
    const NUM_DAYS = 91; // exactly 13 weeks
    const days: string[] = [];
    const today = new Date();
    for (let i = NUM_DAYS - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        days.push(toDateString(d));
    }

    // Scale against a floor of 10 so a single review does not paint the darkest shade.
    const maxCount = Math.max(10, ...days.map((d) => heatmap[d]?.count || 0));

    return (
        <Card title="Activity (last 91 days)">
            <div className="overflow-x-auto">
                {/* `grid-rows-7` isn't a real Tailwind utility (the default scale stops at
                    6), so it silently emitted no `grid-template-rows` at all — with
                    `grid-flow-col` and no row template, the grid never wrapped and instead
                    stacked all 91 cells into one very tall column. The arbitrary-value
                    syntax below sets the row template explicitly to match the 9px cells. */}
                <div className="grid grid-flow-col grid-rows-[repeat(7,9px)] gap-[3px]" style={{ width: 'max-content' }}>
                    {days.map((day) => {
                        const count = heatmap[day]?.count || 0;
                        let background = '#E9ECEF';
                        if (count > 0) {
                            const ratio = count / maxCount;
                            background = ratio <= 0.25 ? HEAT_COLORS[0]
                                : ratio <= 0.5 ? HEAT_COLORS[1]
                                    : ratio <= 0.75 ? HEAT_COLORS[2]
                                        : HEAT_COLORS[3];
                        }
                        return (
                            <span
                                key={day}
                                title={`${day}: ${count} ${count === 1 ? 'review' : 'reviews'}`}
                                className="h-[9px] w-[9px] rounded-[2px]"
                                style={{ backgroundColor: background }}
                            />
                        );
                    })}
                </div>
            </div>
        </Card>
    );
};

const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
    const { today, pipeline, heatmap, retention, forecast, streak } = stats;
    const recentRetention = retention.slice(-14);
    const maxRetentionTotal = Math.max(1, ...recentRetention.map((d) => d.total));
    const maxForecast = Math.max(1, ...forecast.map((f) => f.due));
    const hasReviews = recentRetention.some((r) => r.total > 0);

    return (
        <div className="flex flex-col gap-3 px-3 pb-3 pt-1">
            <Card title="Today's queue">
                <div className="flex items-start justify-between">
                    {[
                        { value: today.due + today.overdue, label: 'Due' },
                        { value: today.newCards, label: 'New' },
                        { value: `${today.estimatedTimeMin}m`, label: 'Est. time' },
                    ].map((metric) => (
                        <div key={metric.label} className="flex flex-1 flex-col items-center">
                            <span className="text-[26px] font-extrabold leading-none tracking-tight text-gray-900">
                                {metric.value}
                            </span>
                            <span className="mt-1 text-[11px] font-medium text-gray-500">{metric.label}</span>
                        </div>
                    ))}
                </div>
                {today.totalStudied > 0 && (
                    <div className="mt-3 rounded-control bg-surface-muted py-1.5 text-center text-[12px] font-semibold text-gray-700">
                        🎯 Reviewed today: {today.totalStudied}
                    </div>
                )}
            </Card>

            <Card title="Consistency">
                <div className="flex items-start justify-around">
                    {[
                        { icon: <FaFire size={16} className="text-danger" />, value: `${streak.current} ${streak.current === 1 ? 'day' : 'days'}`, label: 'Streak' },
                        { icon: <FaRegCalendarAlt size={16} className="text-accent" />, value: `${streak.activeThisWeek}/7`, label: 'This week' },
                        { icon: <FaTrophy size={16} className="text-warn" />, value: String(streak.bestDay), label: 'Best day' },
                    ].map((pill) => (
                        <div key={pill.label} className="flex flex-1 flex-col items-center gap-1">
                            {pill.icon}
                            <span className="text-[14px] font-bold text-gray-900">{pill.value}</span>
                            <span className="text-[10px] uppercase tracking-wide text-gray-400">{pill.label}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card title="Card progress">
                <div className="flex h-3 overflow-hidden rounded-full bg-surface-sunken">
                    {pipeline.total > 0 ? (
                        <>
                            <span style={{ flexGrow: pipeline.newCards, backgroundColor: '#DEE2E6' }} />
                            <span style={{ flexGrow: pipeline.learning, backgroundColor: '#FFB23F' }} />
                            <span style={{ flexGrow: pipeline.reviewing, backgroundColor: '#0066FF' }} />
                            <span style={{ flexGrow: pipeline.mature, backgroundColor: '#4CAF50' }} />
                        </>
                    ) : (
                        <span className="flex-1" />
                    )}
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-x-2 gap-y-1">
                    <Legend color="#DEE2E6" label="New" count={pipeline.newCards} />
                    <Legend color="#FFB23F" label="Learn" count={pipeline.learning} />
                    <Legend color="#0066FF" label="Review" count={pipeline.reviewing} />
                    <Legend color="#4CAF50" label="Mature" count={pipeline.mature} />
                </div>
            </Card>

            <Heatmap heatmap={heatmap} />

            <Card title="Answer quality (last 14 days)">
                {hasReviews ? (
                    <div className="flex h-24 items-end justify-between gap-1">
                        {recentRetention.map((day) => {
                            const heightPct = (day.total / maxRetentionTotal) * 100;
                            const goodPct = day.total > 0 ? (day.goodOrEasy / day.total) * 100 : 0;
                            return (
                                <div key={day.fullDate} className="flex h-full flex-1 flex-col justify-end" title={`${day.fullDate}: ${day.goodOrEasy}/${day.total}`}>
                                    <div className="flex w-full flex-col-reverse overflow-hidden rounded-[3px]" style={{ height: `${heightPct}%` }}>
                                        <span style={{ height: `${goodPct}%`, backgroundColor: '#4CAF50' }} />
                                        <span style={{ height: `${100 - goodPct}%`, backgroundColor: '#FF6B6B' }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="m-0 py-6 text-center text-[12px] text-gray-400">No reviews in the last 14 days.</p>
                )}
                <div className="mt-2 flex gap-3">
                    <Legend color="#4CAF50" label="Good / Easy" />
                    <Legend color="#FF6B6B" label="Hard / Again" />
                </div>
            </Card>

            <Card title="Forecast (next 14 days)">
                <div className="flex h-24 items-end justify-between gap-1">
                    {forecast.map((day) => (
                        <div key={day.date} className="flex h-full flex-1 flex-col justify-end" title={`${day.date}: ${day.due} due`}>
                            <span
                                className="w-full rounded-[3px] bg-accent"
                                style={{ height: `${(day.due / maxForecast) * 100}%`, minHeight: day.due > 0 ? 2 : 0 }}
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-1 flex justify-between text-[9px] text-gray-400">
                    <span>{forecast[0]?.date}</span>
                    <span>{forecast[forecast.length - 1]?.date}</span>
                </div>
            </Card>
        </div>
    );
};

export default StatsPanel;
