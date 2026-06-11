/**
 * Shared layout and status styling for project review trackers
 * (Weekly/Monthly FMS, Document Collection, Data Review, Compliance).
 */
const { memo } = React;

const TRACKER_CELL_CV_STYLE = { contentVisibility: 'auto', containIntrinsicSize: '0 88px' };
const TRACKER_PAGE_SHELL_CLASS = 'space-y-4 rounded-2xl bg-slate-50/60 p-1 sm:p-2 dark:bg-slate-950/40';
const TRACKER_HEADER_CLASS = 'rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-indigo-50 p-4 shadow-sm md:p-5 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30';
const TRACKER_STATUS_SELECT_DEFAULT = 'bg-white border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-600';

const POSITIVE_STATUS = /^(checked|collected|done|reviewed-in-order|not-required|available-on-request|available)$/;
const NEGATIVE_STATUS = /^(issue|not-collected|not-checked|no-reviewed|reviewed-issue|started-incomplete-major|complete-issues-outstanding|unavailable)$/;
const PROGRESS_STATUS = /^(ongoing|in-progress|started-|requested)/;

const softenCellColor = (cellColor) => {
    if (!cellColor || typeof cellColor !== 'string') return 'bg-slate-50/90 dark:bg-slate-800/50';
    return cellColor
        .replace(/border-l-4\s+border-[^\s]+/g, '')
        .replace(/shadow-sm/g, '')
        .replace(/\bborder\s+border-[^\s]+/g, '')
        .trim() || 'bg-slate-50/90 dark:bg-slate-800/50';
};

const inferSelectWrap = (value) => {
    const v = String(value || '').toLowerCase();
    if (v === 'sent') {
        return 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/50 dark:border-indigo-700 dark:text-indigo-200';
    }
    if (POSITIVE_STATUS.test(v)) {
        return 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/50 dark:border-emerald-700 dark:text-emerald-200';
    }
    if (NEGATIVE_STATUS.test(v)) {
        return 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/50 dark:border-rose-800 dark:text-rose-200';
    }
    if (PROGRESS_STATUS.test(v)) {
        return 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200';
    }
    return TRACKER_STATUS_SELECT_DEFAULT;
};

const normalizeStatusOptions = (options) => {
    if (!Array.isArray(options)) return [];
    return options.map((opt) => ({
        ...opt,
        cellColor: softenCellColor(opt.cellColor),
        selectWrap: opt.selectWrap || inferSelectWrap(opt.value)
    }));
};

const getStatusSelectWrap = (status, options) => {
    if (!status) return TRACKER_STATUS_SELECT_DEFAULT;
    const lookupKey = String(status);
    const cfg = (options || []).find((o) => o.value === lookupKey);
    return cfg?.selectWrap || inferSelectWrap(lookupKey);
};

const legendDotClass = (value) => {
    const v = String(value || '').toLowerCase();
    if (POSITIVE_STATUS.test(v)) return 'bg-emerald-500';
    if (NEGATIVE_STATUS.test(v)) return 'bg-rose-500';
    if (PROGRESS_STATUS.test(v)) return 'bg-amber-500';
    return 'bg-slate-300';
};

const workingMonthCellBg = (isWorking) => (
    isWorking ? 'bg-indigo-50/50 dark:bg-indigo-950/25' : 'bg-white dark:bg-slate-900'
);

const selectedCellBg = 'bg-indigo-100 ring-2 ring-inset ring-indigo-400 dark:bg-indigo-900/50 dark:ring-indigo-500';

const TrackerLoadingScreen = ({ message = 'Loading tracker…', submessage, slowHint }) => (
    <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-indigo-50/30 p-8 dark:border-slate-700 dark:from-slate-900 dark:to-indigo-950/20">
        <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-600">
                <i className="fas fa-spinner fa-spin text-2xl text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{message}</p>
            {submessage && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{submessage}</p>}
            {slowHint && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{slowHint}</p>}
        </div>
    </div>
);

const TrackerPageShell = ({ children, className = '' }) => (
    <div className={`${TRACKER_PAGE_SHELL_CLASS} ${className}`.trim()}>{children}</div>
);

const TrackerHeader = ({
    badgeLabel,
    badgeIcon = 'fa-calendar',
    title = 'Review Tracker',
    selectedYear,
    projectName,
    client,
    facilities,
    onBack,
    exportButton,
    toolbar
}) => (
    <div className={TRACKER_HEADER_CLASS}>
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                        >
                            <i className="fas fa-arrow-left text-sm" />
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                                <i className={`fas ${badgeIcon} text-[9px]`} aria-hidden="true" />
                                {badgeLabel}
                            </span>
                            {selectedYear != null && (
                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{selectedYear}</span>
                            )}
                        </div>
                        <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{title}</h1>
                        {projectName && (
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                <span className="font-medium text-slate-800 dark:text-slate-100">{projectName}</span>
                                {client && <span className="text-slate-400 dark:text-slate-500"> · {client}</span>}
                            </p>
                        )}
                        {facilities != null && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Facilities: <span className="font-medium text-slate-700 dark:text-slate-300">{facilities || 'Not specified'}</span>
                            </p>
                        )}
                    </div>
                </div>
                {exportButton}
            </div>
            {toolbar && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-4 dark:border-slate-700">
                    {toolbar}
                </div>
            )}
        </div>
    </div>
);

const TrackerLegend = ({ statusOptions, collapsible = false, collapsed = false, onToggleCollapsed, hint }) => {
    const chips = (
        <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</span>
            {(statusOptions || []).map((option) => (
                <div
                    key={option.value}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm ${option.selectWrap || inferSelectWrap(option.value)}`}
                >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${legendDotClass(option.value)}`} />
                    {option.label}
                </div>
            ))}
            {hint && <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline dark:text-slate-500">{hint}</span>}
        </div>
    );

    if (!collapsible) {
        return (
            <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {chips}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <button
                type="button"
                onClick={onToggleCollapsed}
                className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30"
                aria-expanded={!collapsed}
            >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Status legend</span>
                <i className={`fas fa-chevron-${collapsed ? 'down' : 'up'} text-xs text-slate-400`} />
            </button>
            {!collapsed && <div className="border-t border-slate-100 px-4 pb-3 pt-2 dark:border-slate-800">{chips}</div>}
        </div>
    );
};

const TrackerSectionBadge = ({ index }) => (
    <span className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg bg-indigo-600 px-2 text-xs font-bold text-white shadow-sm">
        {index}
    </span>
);

const TrackerUIShared = {
    TRACKER_CELL_CV_STYLE,
    TRACKER_PAGE_SHELL_CLASS,
    TRACKER_STATUS_SELECT_DEFAULT,
    normalizeStatusOptions,
    getStatusSelectWrap,
    legendDotClass,
    workingMonthCellBg,
    selectedCellBg,
    TrackerLoadingScreen,
    TrackerPageShell,
    TrackerHeader,
    TrackerLegend,
    TrackerSectionBadge
};

window.TrackerUIShared = TrackerUIShared;
