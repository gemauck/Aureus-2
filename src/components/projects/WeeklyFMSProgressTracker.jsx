// All-project weekly FMS review progress grid (mirrors ProjectProgressTracker, week columns).
let useState, useEffect, useRef, useMemo, memo, ReactElement;
const getReactHooks = () => {
    if (typeof window !== 'undefined' && window.React) {
        const React = window.React;
        return {
            useState: React.useState,
            useEffect: React.useEffect,
            useRef: React.useRef,
            useMemo: React.useMemo,
            memo: React.memo,
            createElement: React.createElement
        };
    }
    return null;
};

let hooks = getReactHooks();
if (hooks) {
    ({ useState, useEffect, useRef, useMemo, memo } = hooks);
    ReactElement = hooks.createElement;
} else {
    useState = function (initial) {
        return [initial, function () {}];
    };
    useEffect = function () {};
    useRef = function (initial) {
        return { current: initial };
    };
    useMemo = function (fn) {
        return fn();
    };
    memo = function (c) {
        return c;
    };
    ReactElement = function () {
        return null;
    };
}
if (!ReactElement && typeof window !== 'undefined' && window.React && window.React.createElement) {
    ReactElement = window.React.createElement;
}

function isTruthyHasWeeklyFMS(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        return s === 'true' || s === '1';
    }
    return false;
}

function filterProjectsForWeeklyFmsGrid(normalizedProjects) {
    if (!Array.isArray(normalizedProjects)) return [];
    return normalizedProjects.filter(
        (p) => p && typeof p === 'object' && isTruthyHasWeeklyFMS(p.hasWeeklyFMSReviewProcess)
    );
}

function parseSectionsPayload(rawValue) {
    if (!rawValue) return {};
    if (typeof rawValue === 'object' && !Array.isArray(rawValue)) return rawValue;
    if (typeof rawValue === 'string' && rawValue.trim()) {
        try {
            return JSON.parse(rawValue);
        } catch {
            return {};
        }
    }
    return {};
}

function getSectionsForYear(rawSections, year) {
    const parsed = parseSectionsPayload(rawSections);
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object') return [];
    const yearKey = String(year);
    const byYear = parsed[yearKey];
    if (Array.isArray(byYear)) return byYear;
    const matchKey = Object.keys(parsed).find((k) => {
        if (k == null) return false;
        const y = Number.parseInt(String(k), 10);
        return Number.isFinite(y) && y === Number(year);
    });
    if (matchKey && Array.isArray(parsed[matchKey])) return parsed[matchKey];
    const firstNonEmpty = Object.keys(parsed).find((k) => Array.isArray(parsed[k]) && parsed[k].length);
    if (firstNonEmpty) return parsed[firstNonEmpty];
    if (Array.isArray(parsed.sections)) return parsed.sections;
    return [];
}

function generateWeeksForYear(year) {
    const weeks = [];
    const startDate = new Date(year, 0, 1);
    const dayOfWeek = startDate.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startDate.setDate(startDate.getDate() + daysToMonday);
    let currentDate = new Date(startDate);
    let weekNum = 1;
    const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    while (weeks.length < 53) {
        const weekStart = new Date(currentDate);
        const weekEnd = new Date(currentDate);
        weekEnd.setDate(weekEnd.getDate() + 6);
        if (weekStart.getFullYear() > year && weekStart.getMonth() > 0) break;
        const startMonthAbbr = monthAbbreviations[weekStart.getMonth()];
        const startDay = weekStart.getDate();
        const endMonthAbbr = monthAbbreviations[weekEnd.getMonth()];
        const endDay = weekEnd.getDate();
        const dateRange = `${startMonthAbbr} ${startDay} - ${endMonthAbbr} ${endDay}`;
        weeks.push({
            number: weekNum,
            startDate: weekStart,
            endDate: weekEnd,
            label: `Week ${weekNum} (${dateRange})`,
            dateRange: dateRange
        });
        currentDate.setDate(currentDate.getDate() + 7);
        weekNum += 1;
        if (currentDate.getFullYear() > year) break;
    }
    return weeks;
}

function getWeekKey(week, year, allWeeks) {
    if (!week || !allWeeks || !allWeeks.length) return null;
    let weekObj = null;
    if (typeof week === 'object' && week.number && week.startDate) {
        weekObj = week;
    } else {
        let weekNum = null;
        if (typeof week === 'string') {
            let m = week.match(/Week\s+(\d+)/i);
            if (m) weekNum = parseInt(m[1], 10);
            else {
                m = week.match(/W?(\d+)/i);
                if (m) weekNum = parseInt(m[1], 10);
                else weekObj = allWeeks.find((w) => w.label === week || w.dateRange === week) || null;
            }
        } else if (typeof week === 'number') {
            weekNum = week;
        }
        if (!weekObj && weekNum != null) {
            weekObj = allWeeks.find((w) => w.number === weekNum) || null;
        }
    }
    if (!weekObj || !weekObj.startDate) return null;
    const resolveMonthForYear = (targetYear) => {
        const base = new Date(weekObj.startDate);
        base.setHours(0, 0, 0, 0);
        for (let i = 0; i < 7; i += 1) {
            const d = new Date(base);
            d.setDate(base.getDate() + i);
            if (d.getFullYear() === targetYear) {
                return d.getMonth() + 1;
            }
        }
        return base.getMonth() + 1;
    };
    const month = resolveMonthForYear(year);
    const weekNumber = weekObj.number;
    const monthStr = String(month).padStart(2, '0');
    const weekStr = String(weekNumber || '').padStart(2, '0');
    if (!weekStr || weekStr === '00') return `${year}-${monthStr}`;
    return `${year}-${monthStr}-W${weekStr}`;
}

function getFmsStatusForWeek(collectionStatus, weekKey) {
    if (!collectionStatus || !weekKey) return null;
    if (Object.prototype.hasOwnProperty.call(collectionStatus, weekKey)) {
        const v = collectionStatus[weekKey];
        if (v === '' || v === null) return null;
        return v;
    }
    const parts = weekKey.split('-');
    if (parts.length >= 2) {
        const monthKey = `${parts[0]}-${parts[1]}`;
        const weeklyPrefix = `${parts[0]}-${parts[1]}-W`;
        const hasWeekly = Object.keys(collectionStatus).some((k) => k.startsWith(weeklyPrefix));
        if (hasWeekly) return null;
        return collectionStatus[monthKey] || null;
    }
    return null;
}

function isFmsLineReviewed(rawStatus) {
    if (rawStatus == null || rawStatus === '') return false;
    const s = String(rawStatus).toLowerCase();
    return s === 'checked' || s === 'issue';
}

function getWorkingWeekNumbers(allWeeks) {
    if (!allWeeks || !allWeeks.length) return [];
    const today = new Date();
    const currentWeekStart = new Date(today);
    const dayOfWeek = currentWeekStart.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    currentWeekStart.setDate(currentWeekStart.getDate() + daysToMonday);
    const oneWeekAgo = new Date(currentWeekStart);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    const out = [];
    allWeeks.forEach((w) => {
        const ws = new Date(w.startDate);
        ws.setHours(0, 0, 0, 0);
        if (ws.getTime() === oneWeekAgo.getTime()) out.push(w.number);
    });
    return out;
}

function computeWeekFmsProgress(project, year, week, allWeeks) {
    const y = Number(year);
    const yearSections = getSectionsForYear(project?.weeklyFMSReviewSections, y);
    const weekKey = getWeekKey(week, y, allWeeks);
    if (!weekKey) {
        return { completed: 0, total: 0, percent: null };
    }
    let total = 0;
    let completed = 0;
    (Array.isArray(yearSections) ? yearSections : []).forEach((section) => {
        const docs = Array.isArray(section?.documents) ? section.documents : Array.isArray(section?.items) ? section.items : [];
        docs.forEach((doc) => {
            total += 1;
            const raw = getFmsStatusForWeek(doc?.collectionStatus, weekKey);
            if (isFmsLineReviewed(raw)) completed += 1;
        });
    });
    const percent = total > 0 ? Math.round((completed / total) * 100) : null;
    return { completed, total, percent };
}

function buildWeeklyFmsOpenUrl(projectId, year, week) {
    try {
        const base = `${window.location.origin}${window.location.pathname}`;
        const q = new URLSearchParams();
        q.set('tab', 'weeklyFMSReview');
        q.set('docYear', String(year));
        if (week?.label) q.set('docWeek', String(week.label));
        return `${base}#/projects/${encodeURIComponent(String(projectId))}?${q.toString()}`;
    } catch {
        return '#/projects';
    }
}

const WeeklyFMSProgressTracker = function WeeklyFMSProgressTrackerCmp(props) {
    const { onBack: onBackProp } = props || {};
    const onBack = typeof onBackProp === 'function' ? onBackProp : () => {};

    const now = new Date();
    const currentYear = Number(now.getFullYear()) || 2026;

    const TRACK_CELL_WIDTH = 120;
    const TRACK_STICKY_PROJECT_WIDTH = 340;
    const TRACK_PROJECT_ROW_SEPARATOR = '2px solid #94a3b8';

    const [projects, setProjects] = useState(() => []);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [loadError, setLoadError] = useState(null);
    const tableRef = useRef(null);
    const workingWeekScrollDoneRef = useRef(false);
    const weeklyHydrateTriedRef = useRef(new Set());
    const selectedYearRef = useRef(selectedYear);
    useEffect(() => {
        selectedYearRef.current = selectedYear;
    }, [selectedYear]);

    const allWeeks = useMemo(() => generateWeeksForYear(selectedYear), [selectedYear]);
    const workingWeekNums = useMemo(() => getWorkingWeekNumbers(allWeeks), [allWeeks]);
    const workingWeek = useMemo(() => {
        if (!Array.isArray(allWeeks) || allWeeks.length === 0 || workingWeekNums.length === 0) return null;
        return allWeeks.find((w) => workingWeekNums.includes(w.number)) || null;
    }, [allWeeks, workingWeekNums]);
    const displayedWeeks = useMemo(() => {
        if (!Array.isArray(allWeeks) || allWeeks.length === 0) return [];
        // For the current year show a rolling window: working week + previous 4 months.
        if (selectedYear !== currentYear || !workingWeek) return allWeeks;
        const cutoff = new Date(workingWeek.startDate);
        cutoff.setHours(0, 0, 0, 0);
        cutoff.setMonth(cutoff.getMonth() - 4);
        const windowEnd = new Date(workingWeek.endDate || workingWeek.startDate);
        windowEnd.setHours(23, 59, 59, 999);
        const weeksInWindow = allWeeks.filter((week) => {
            const weekStart = new Date(week.startDate);
            return weekStart >= cutoff && weekStart <= windowEnd;
        });
        return weeksInWindow.length > 0 ? weeksInWindow : allWeeks;
    }, [allWeeks, selectedYear, currentYear, workingWeek]);

    useEffect(() => {
        const load = async (retryCount = 0) => {
            try {
                if (!window.DatabaseAPI || !window.DatabaseAPI.getProjects) {
                    if (retryCount < 10) {
                        setTimeout(() => load(retryCount + 1), 200);
                        return;
                    }
                    setLoadError('Database API not available');
                    return;
                }
                const response = await window.DatabaseAPI.getProjects({ forceRefresh: true });
                let projs = [];
                if (response?.data?.projects && Array.isArray(response.data.projects)) projs = response.data.projects;
                else if (response?.data?.data?.projects && Array.isArray(response.data.data.projects))
                    projs = response.data.data.projects;
                else if (response?.projects && Array.isArray(response.projects)) projs = response.projects;
                else if (Array.isArray(response?.data)) projs = response.data;
                else if (Array.isArray(response)) projs = response;
                const normalized = (Array.isArray(projs) ? projs : []).map((p) => ({
                    ...p,
                    client: p.clientName || p.client || ''
                }));
                setProjects(filterProjectsForWeeklyFmsGrid(normalized));
            } catch (e) {
                console.error('WeeklyFMSProgressTracker: load error', e);
                setLoadError(String(e?.message || e || 'Failed to load projects'));
                setProjects([]);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (!Array.isArray(projects) || projects.length === 0) return;
        if (!window.DatabaseAPI || typeof window.DatabaseAPI.getProject !== 'function') return;
        const needs = projects.filter((p) => {
            if (!p?.id) return false;
            const sid = String(p.id);
            if (weeklyHydrateTriedRef.current.has(sid)) return false;
            const w = p.weeklyFMSReviewSections;
            const t = typeof w === 'string' ? w.trim() : w;
            return t == null || t === '' || t === '{}' || t === 'null';
        });
        if (needs.length === 0) return;
        needs.forEach((p) => weeklyHydrateTriedRef.current.add(String(p.id)));
        let cancelled = false;
        (async () => {
            const results = await Promise.allSettled(needs.map((p) => window.DatabaseAPI.getProject(p.id, { forceRefresh: true })));
            if (cancelled) return;
            const map = new Map();
            results.forEach((r) => {
                if (r.status !== 'fulfilled') return;
                const d = r.value?.data?.project || r.value?.project;
                if (d?.id) map.set(String(d.id), d);
            });
            if (map.size === 0) return;
            setProjects((prev) => {
                if (!Array.isArray(prev)) return prev;
                return prev.map((p) => {
                    const d = map.get(String(p.id));
                    if (!d) return p;
                    return { ...p, ...d, client: d.clientName || d.client || p.client };
                });
            });
        })();
        return () => {
            cancelled = true;
        };
    }, [projects]);

    useEffect(() => {
        if (workingWeekScrollDoneRef.current) return;
        try {
            if (!tableRef?.current) return;
            if (!displayedWeeks.length) return;
            const wn = workingWeekNums[0];
            if (wn == null) return;
            const run = () => {
                const el = tableRef.current;
                if (!el) return;
                const cell = el.querySelector(`[data-week-header-num="${String(wn)}"]`);
                if (cell && typeof cell.offsetLeft === 'number') {
                    const left = Math.max((cell.offsetLeft || 0) - TRACK_STICKY_PROJECT_WIDTH, 0);
                    el.scrollTo({ left, behavior: 'smooth' });
                    workingWeekScrollDoneRef.current = true;
                }
            };
            requestAnimationFrame(() => requestAnimationFrame(run));
        } catch (e) {
            console.warn('WeeklyFMSProgressTracker: scroll to working week failed', e);
        }
    }, [projects, selectedYear, displayedWeeks, workingWeekNums]);

    const minYear = 2015;
    const maxYear = currentYear + 5;
    const yearOptions = [];
    for (let y = minYear; y <= maxYear; y += 1) yearOptions.push(y);

    let safeProjects = [];
    try {
        if (Array.isArray(projects) && projects.length) {
            safeProjects = projects
                .filter(
                    (p) =>
                        p &&
                        p.id != null &&
                        typeof p.name === 'string' &&
                        p.name.trim() &&
                        isTruthyHasWeeklyFMS(p.hasWeeklyFMSReviewProcess)
                )
                .map((p) => ({
                    id: String(p.id),
                    name: String(p.name),
                    client: String(p.clientName || p.client || ''),
                    manager: String(p.manager || p.assignedTo || '-'),
                    type: String(p.type || '-'),
                    status: String(p.status || 'Unknown'),
                    weeklyFMSReviewSections: p.weeklyFMSReviewSections,
                    hasWeeklyFMSReviewProcess: p.hasWeeklyFMSReviewProcess
                }));
        }
    } catch (e) {
        console.error('WeeklyFMSProgressTracker: safeProjects', e);
        safeProjects = [];
    }

    const renderCell = (project, week, rowBaseBg) => {
        const { completed, total, percent } = computeWeekFmsProgress(
            project,
            selectedYearRef.current ?? selectedYear,
            week,
            allWeeks
        );
        const isWorking = workingWeekNums.includes(week.number);
        const showPct = percent != null && total > 0;
        const barColor = showPct && percent >= 100 ? '#059669' : showPct && percent > 0 ? '#6366f1' : '#e2e8f0';
        const cellBg = isWorking ? '#eef2ff' : rowBaseBg;
        return ReactElement(
            'td',
            {
                key: `${project.id}-wk-${week.number}`,
                style: {
                    padding: '8px 10px',
                    fontSize: '12px',
                    verticalAlign: 'top',
                    backgroundColor: cellBg,
                    borderBottom: TRACK_PROJECT_ROW_SEPARATOR,
                    borderRight: '1px solid #e5e7eb',
                    minWidth: `${TRACK_CELL_WIDTH}px`,
                    width: `${TRACK_CELL_WIDTH}px`
                }
            },
            ReactElement('div', { className: 'space-y-1' },
                showPct
                    ? ReactElement('div', { className: 'text-sm font-bold text-slate-800' }, `${percent}%`)
                    : ReactElement('div', { className: 'text-sm font-semibold text-slate-400' }, '—'),
                ReactElement('div', {
                    className: 'h-1.5 w-full rounded-full overflow-hidden',
                    style: { background: '#e2e8f0' }
                },
                    ReactElement('div', {
                        className: 'h-full rounded-full transition-all',
                        style: { width: showPct ? `${percent}%` : '0%', background: barColor }
                    })),
                ReactElement('div', { className: 'text-[10px] text-slate-500' }, total > 0 ? `${completed}/${total}` : '0/0'),
                ReactElement(
                    'a',
                    {
                        className: 'inline-flex text-[10px] font-semibold text-indigo-600 hover:underline',
                        href: buildWeeklyFmsOpenUrl(project.id, selectedYear, week),
                        onClick: (e) => {
                            e.preventDefault();
                            const h = buildWeeklyFmsOpenUrl(project.id, selectedYear, week).split('#')[1] || '';
                            if (h) window.location.hash = h;
                        }
                    },
                    'Open review'
                )
            )
        );
    };

    return ReactElement(
        'div',
        { className: 'space-y-4' },
        ReactElement(
            'div',
            { className: 'flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between' },
            ReactElement('div', { className: 'space-y-1' },
                ReactElement('h1', { className: 'text-lg font-semibold text-gray-900' }, 'Weekly FMS review progress'),
                ReactElement('p', { className: 'text-sm text-gray-600' },
                    'Per-project weekly FMS checklist completion for the selected year. The grid auto-focuses the working week and shows the prior 4 months.')),
            ReactElement('div', { className: 'flex flex-wrap items-center gap-2' },
                ReactElement(
                    'label',
                    { className: 'text-xs font-medium text-gray-600' },
                    'Year ',
                    ReactElement(
                        'select',
                        {
                            className: 'ml-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm',
                            value: selectedYear,
                            onChange: (e) => setSelectedYear(Number(e.target.value) || currentYear)
                        },
                        yearOptions.map((y) => ReactElement('option', { key: y, value: y },
                            `${y}${y === currentYear ? ' (Current)' : ''}`))
                    )
                ),
                ReactElement(
                    'button',
                    {
                        type: 'button',
                        className: 'px-3 py-1.5 text-sm font-medium border border-slate-200 rounded-lg text-slate-700 bg-white hover:bg-slate-50',
                        onClick: () => {}
                    },
                    ReactElement('span', { className: 'hidden md:inline' }, 'Export'),
                    ReactElement('i', { className: 'fas fa-file-export md:ml-2' })
                ),
                ReactElement(
                    'button',
                    {
                        type: 'button',
                        onClick: onBack,
                        className: 'px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50'
                    },
                    'Back to list'
                ))
        ),
        ReactElement(
            'div',
            { className: 'flex flex-wrap items-center gap-2 text-xs text-slate-600' },
            ReactElement('span', { className: 'font-semibold' }, 'Legend:'),
            ReactElement('span', { className: 'inline-flex items-center gap-1' },
                ReactElement('span', { className: 'w-2.5 h-2.5 rounded-sm bg-indigo-500' }),
                'FMS line reviewed (checked or issue)'),
            ReactElement('span', { className: 'inline-flex items-center gap-1' },
                ReactElement('span', { className: 'w-2.5 h-2.5 rounded-sm bg-violet-200' }),
                'Working week')
        ),
        ReactElement(
            'div',
            {
                ref: tableRef,
                className: 'overflow-auto min-h-0 bg-white rounded-xl border border-slate-200/90',
                role: 'region',
                'aria-label': 'Weekly FMS review grid',
                style: { maxHeight: 'min(72vh, 900px)' }
            },
            ReactElement(
                'table',
                { className: 'text-left w-full', style: { borderCollapse: 'separate', borderSpacing: 0 } },
                ReactElement(
                    'thead',
                    { className: 'bg-slate-50' },
                    ReactElement(
                        'tr',
                        null,
                        ReactElement(
                            'th',
                            {
                                className: 'text-left sticky left-0',
                                style: {
                                    padding: '12px 14px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                    color: '#f8fafc',
                                    borderRight: '2px solid #334155',
                                    minWidth: `${TRACK_STICKY_PROJECT_WIDTH}px`,
                                    top: 0,
                                    zIndex: 30
                                }
                            },
                            'Project'
                        ),
                        displayedWeeks.map((week) => {
                            const isWorking = workingWeekNums.includes(week.number);
                            return ReactElement(
                                'th',
                                {
                                    key: `wh-${selectedYear}-${week.number}`,
                                    colSpan: 1,
                                    'data-week-header-num': String(week.number),
                                    style: {
                                        padding: '8px 6px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        backgroundColor: isWorking ? '#e0e7ff' : '#f8fafc',
                                        color: isWorking ? '#312e81' : '#334155',
                                        borderLeft: week.number === 1 ? '2px solid #475569' : '1px solid #cbd5e1',
                                        borderBottom: isWorking ? '2px solid #4f46e5' : '1px solid #e5e7eb',
                                        minWidth: `${TRACK_CELL_WIDTH}px`,
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 12
                                    }
                                },
                                ReactElement('div', null, `W${week.number}`),
                                ReactElement('div', { style: { fontWeight: 500, color: '#64748b' } }, week.dateRange || '')
                            );
                        }),
                        ['PM'].map((label) =>
                            ReactElement(
                                'th',
                                {
                                    key: 'meta-' + label,
                                    style: {
                                        padding: '10px 8px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
                                        color: '#f8fafc',
                                        minWidth: '120px',
                                        position: 'sticky',
                                        top: 0,
                                        zIndex: 12
                                    }
                                },
                                label
                            )
                        )
                    )
                ),
                safeProjects.length === 0
                    ? ReactElement(
                          'tbody',
                          null,
                          ReactElement(
                              'tr',
                              null,
                              ReactElement(
                                  'td',
                                  {
                                      colSpan: 1 + displayedWeeks.length + 1,
                                      className: 'px-8 py-12 text-center text-sm text-slate-600'
                                  },
                                  loadError
                                      ? `Error: ${loadError}`
                                      : 'No projects have Weekly FMS Review enabled, or none match the filter. Turn on “Weekly FMS Review” in each project that should appear here.'
                              )
                          )
                      )
                    : ReactElement(
                          'tbody',
                          null,
                          safeProjects.map((pr, rowIdx) => {
                              const rowBg = rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
                              return ReactElement(
                                  'tr',
                                  { key: pr.id },
                                  ReactElement(
                                      'td',
                                      {
                                          style: {
                                              padding: '10px 12px',
                                              background: rowBg,
                                              borderBottom: TRACK_PROJECT_ROW_SEPARATOR,
                                              position: 'sticky',
                                              left: 0,
                                              zIndex: 8,
                                              minWidth: `${TRACK_STICKY_PROJECT_WIDTH}px`,
                                              boxShadow: '4px 0 12px -6px rgba(15, 23, 42, 0.12)'
                                          }
                                      },
                                      ReactElement('div', { className: 'font-bold text-slate-900 text-sm' }, pr.name),
                                      pr.type && pr.type !== '-'
                                          ? ReactElement('div', { className: 'text-[10px] text-slate-500 mt-0.5' }, pr.type)
                                          : null,
                                      ReactElement('div', { className: 'text-xs text-slate-600 mt-0.5' }, pr.client)
                                  ),
                                  displayedWeeks.map((week) =>
                                      renderCell(
                                          { ...pr, weeklyFMSReviewSections: pr.weeklyFMSReviewSections },
                                          week,
                                          rowBg
                                      )
                                  ),
                                  ReactElement(
                                      'td',
                                      {
                                          style: {
                                              padding: '8px',
                                              background: rowBg,
                                              borderBottom: TRACK_PROJECT_ROW_SEPARATOR,
                                              fontSize: '11px'
                                          }
                                      },
                                      pr.manager && pr.manager !== '-' ? pr.manager : '—'
                                  ),
                                  
                              );
                          })
                      )
            )
        )
    );
};

if (typeof window !== 'undefined') {
    window.WeeklyFMSProgressTracker = WeeklyFMSProgressTracker;
}
