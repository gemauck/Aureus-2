/**
 * Monthly project progress metrics for dashboard widgets.
 * Logic aligned with src/components/projects/ProjectProgressTracker.jsx
 * (working months = previous calendar month + two months ago; "last" = most recent = previous month).
 */

export const TRACKER_MONTH_NAMES = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
];

/** @returns {{ monthIndex: number, year: number }[]} */
export function getWorkingMonthEntries(now = new Date()) {
    const currentYear = Number(now.getFullYear()) || new Date().getFullYear();
    const currentMonth = Number(now.getMonth()) || 0;
    const previousOne = new Date(currentYear, currentMonth, 1);
    previousOne.setMonth(previousOne.getMonth() - 1);
    const previousTwo = new Date(currentYear, currentMonth, 1);
    previousTwo.setMonth(previousTwo.getMonth() - 2);
    return [
        { monthIndex: Number(previousOne.getMonth()), year: Number(previousOne.getFullYear()) },
        { monthIndex: Number(previousTwo.getMonth()), year: Number(previousTwo.getFullYear()) }
    ];
}

/**
 * Most recent working month (the month immediately before the current calendar month),
 * matching the first highlighted column in Project Progress Tracker.
 */
export function getLastWorkingMonth(now = new Date()) {
    const [first] = getWorkingMonthEntries(now);
    const monthName = TRACKER_MONTH_NAMES[first.monthIndex] || 'January';
    const y = String(first.year).slice(-2);
    const short = `${monthName.slice(0, 3).toUpperCase()} '${y}`;
    return {
        monthIndex: first.monthIndex,
        year: first.year,
        monthName,
        shortLabel: short
    };
}

export function isIncludedInProgressTracker(value) {
    if (value === true || value === 1) return true;
    if (typeof value === 'string') {
        const s = value.trim().toLowerCase();
        return s === 'true' || s === '1';
    }
    return false;
}

export function filterProjectsForProgressTracker(projects) {
    if (!Array.isArray(projects)) return [];
    return projects.filter((p) => p && isIncludedInProgressTracker(p.includeInProgressTracker));
}

export function normalizeProjectMonthlyProgress(project) {
    if (!project || typeof project !== 'object') return { ...project, monthlyProgress: {} };
    let monthlyProgress = project.monthlyProgress;
    if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
        try {
            monthlyProgress = JSON.parse(monthlyProgress);
        } catch {
            monthlyProgress = {};
        }
    }
    if (!monthlyProgress || typeof monthlyProgress !== 'object' || Array.isArray(monthlyProgress)) {
        monthlyProgress = {};
    }
    return { ...project, monthlyProgress };
}

function parseSectionsPayload(rawValue) {
    if (!rawValue) return {};
    if (typeof rawValue === 'object') return rawValue;
    if (typeof rawValue !== 'string') return {};
    let candidate = rawValue;
    for (let i = 0; i < 2; i++) {
        try {
            const parsed = JSON.parse(candidate);
            if (typeof parsed === 'string') {
                candidate = parsed;
                continue;
            }
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            break;
        }
    }
    try {
        return JSON.parse(rawValue);
    } catch {
        return {};
    }
}

function getSectionsForYear(rawSections, year) {
    const parsed = parseSectionsPayload(rawSections);
    if (!parsed) return [];
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object') return [];
    const yearKey = String(year);
    const byYear = parsed[yearKey];
    if (Array.isArray(byYear)) return byYear;

    const matchingYearKey = Object.keys(parsed).find((k) => {
        if (k == null) return false;
        const parsedKeyYear = Number.parseInt(String(k), 10);
        return Number.isFinite(parsedKeyYear) && parsedKeyYear === Number(year);
    });
    if (matchingYearKey && Array.isArray(parsed[matchingYearKey])) {
        return parsed[matchingYearKey];
    }

    const firstNonEmptyYear = Object.keys(parsed).find(
        (k) => Array.isArray(parsed[k]) && parsed[k].length > 0
    );
    if (firstNonEmptyYear) {
        return parsed[firstNonEmptyYear];
    }

    if (Array.isArray(parsed.sections)) return parsed.sections;
    return [];
}

function parsePercentValue(rawValue) {
    if (rawValue == null) return null;
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
        return Math.max(0, Math.min(100, Math.round(rawValue)));
    }
    const match = String(rawValue).match(/(\d{1,3})(?:\.\d+)?\s*%?/);
    if (!match) return null;
    const parsed = Number.parseFloat(match[1]);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function getMonthlyProgressPercentFallback(project, monthName, year, reviewType) {
    const monthlyProgress = project?.monthlyProgress;
    if (!monthlyProgress || typeof monthlyProgress !== 'object' || Array.isArray(monthlyProgress)) {
        return null;
    }
    const monthKey = `${String(monthName || '')}-${String(year)}`;
    const monthData = monthlyProgress[monthKey];
    if (!monthData || typeof monthData !== 'object' || Array.isArray(monthData)) {
        return null;
    }

    let candidates;
    if (reviewType === 'complianceReview') {
        candidates = [
            monthData.compliancePercent,
            monthData.compliance_percentage,
            monthData.complianceProgressPercent,
            monthData.complianceProgress,
            monthData.compliance
        ];
    } else if (reviewType === 'documentCollection') {
        candidates = [
            monthData.docCollectionPercent,
            monthData.documentCollectionPercent,
            monthData.docCollectionProgressPercent,
            monthData.docCollection,
            monthData.documentCollection
        ];
    } else {
        candidates = [
            monthData.dataPercent,
            monthData.data_percentage,
            monthData.monthlyDataReviewPercent,
            monthData.dataProgressPercent,
            monthData.dataProgress,
            monthData.data
        ];
    }

    for (let i = 0; i < candidates.length; i += 1) {
        const parsed = parsePercentValue(candidates[i]);
        if (parsed != null) return parsed;
    }
    return null;
}

function resolveMonthlyDataReviewStatusKey(status) {
    if (!status) return '';
    const normalized = String(status).toLowerCase();
    if (normalized === 'in-progress') return 'started-minor-info';
    return normalized;
}

function isCompletedReviewStatus(reviewType, rawStatus) {
    if (!rawStatus) return false;
    const normalized = String(rawStatus).toLowerCase();
    if (reviewType === 'monthlyDataReview') {
        const statusKey = resolveMonthlyDataReviewStatusKey(normalized);
        return statusKey === 'done' || statusKey === 'complete-issues-outstanding' || statusKey === 'complete';
    }
    if (reviewType === 'complianceReview') {
        return normalized === 'reviewed-in-order' || normalized === 'reviewed-issue';
    }
    return false;
}

function shouldExcludeFromMonthlyDataReviewPercent(sectionName, docName) {
    const section = String(sectionName || '').trim().toLowerCase();
    const doc = String(docName || '').trim().toLowerCase();
    return /post\s*processing|post\s*process|prost\s*process/i.test(section) ||
        /post\s*processing|post\s*process|prost\s*process/i.test(doc);
}

function isCompletedDocumentCollectionStatus(rawStatus) {
    if (!rawStatus) return false;
    const normalized = String(rawStatus).toLowerCase();
    return normalized === 'collected' || normalized === 'available-on-request' || normalized === 'not-required';
}

export function getDocumentCollectionProgressForMonth(project, monthName, year) {
    const safeYear = Number(year);
    const monthIdx = TRACKER_MONTH_NAMES.indexOf(monthName);
    const monthNum = monthIdx >= 0 ? monthIdx + 1 : null;
    const isoMonthKey = monthNum != null ? `${safeYear}-${String(monthNum).padStart(2, '0')}` : null;
    const legacyMonthKey = `${String(monthName || '')}-${String(safeYear)}`;
    const yearSections = getSectionsForYear(project?.documentSections, safeYear);

    if (!Array.isArray(yearSections) || yearSections.length === 0) {
        const fallbackPercent = getMonthlyProgressPercentFallback(project, monthName, safeYear, 'documentCollection');
        return {
            completed: 0,
            total: 0,
            percent: fallbackPercent,
            source: fallbackPercent != null ? 'monthlyProgress' : 'sections'
        };
    }

    let total = 0;
    let completed = 0;
    yearSections.forEach((section) => {
        const docs = Array.isArray(section?.documents) ? section.documents : [];
        docs.forEach((doc) => {
            total += 1;
            const rawStatus =
                (isoMonthKey ? doc?.collectionStatus?.[isoMonthKey] : null) ??
                doc?.collectionStatus?.[legacyMonthKey];
            if (isCompletedDocumentCollectionStatus(rawStatus)) {
                completed += 1;
            }
        });
    });

    const sectionPercent = total > 0 ? Math.round((completed / total) * 100) : null;
    const fallbackPercent =
        sectionPercent == null
            ? getMonthlyProgressPercentFallback(project, monthName, safeYear, 'documentCollection')
            : null;

    return {
        completed,
        total,
        percent: sectionPercent != null ? sectionPercent : fallbackPercent,
        source: sectionPercent != null ? 'sections' : (fallbackPercent != null ? 'monthlyProgress' : 'sections')
    };
}

export function getReviewProgressForMonth(project, monthName, year, reviewType) {
    const safeYear = Number(year);
    const monthIdx = TRACKER_MONTH_NAMES.indexOf(monthName);
    const monthNum = monthIdx >= 0 ? monthIdx + 1 : null;
    const isoMonthKey = monthNum != null ? `${safeYear}-${String(monthNum).padStart(2, '0')}` : null;
    const legacyMonthKey = `${String(monthName || '')}-${String(safeYear)}`;
    const sectionsField = reviewType === 'complianceReview' ? project?.complianceReviewSections : project?.monthlyDataReviewSections;
    const yearSections = getSectionsForYear(sectionsField, safeYear);

    if (!Array.isArray(yearSections) || yearSections.length === 0) {
        const fallbackPercent = getMonthlyProgressPercentFallback(project, monthName, safeYear, reviewType);
        return { completed: 0, total: 0, percent: fallbackPercent, source: fallbackPercent != null ? 'monthlyProgress' : 'sections' };
    }

    let total = 0;
    let completed = 0;
    yearSections.forEach((section) => {
        const docs = Array.isArray(section?.documents)
            ? section.documents
            : (Array.isArray(section?.items) ? section.items : []);
        docs.forEach((doc) => {
            if (reviewType === 'monthlyDataReview' && shouldExcludeFromMonthlyDataReviewPercent(section?.name, doc?.name)) {
                return;
            }
            total += 1;
            const rawStatus =
                (isoMonthKey ? doc?.collectionStatus?.[isoMonthKey] : null) ??
                doc?.collectionStatus?.[legacyMonthKey];
            if (isCompletedReviewStatus(reviewType, rawStatus)) {
                completed += 1;
            }
        });
    });

    const sectionPercent = total > 0 ? Math.round((completed / total) * 100) : null;
    const fallbackPercent = sectionPercent == null
        ? getMonthlyProgressPercentFallback(project, monthName, safeYear, reviewType)
        : null;

    return {
        completed,
        total,
        percent: sectionPercent != null ? sectionPercent : fallbackPercent,
        source: sectionPercent != null ? 'sections' : (fallbackPercent != null ? 'monthlyProgress' : 'sections')
    };
}

export function getCommentsForMonth(project, monthName, year) {
    try {
        const key = `${String(monthName || '')}-${String(year)}`;
        const progress = project?.monthlyProgress;
        if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return '';
        const fieldData = progress[key]?.comments;
        if (typeof fieldData === 'string') return fieldData;
        if (fieldData && typeof fieldData === 'object' && !Array.isArray(fieldData)) {
            return fieldData.text || fieldData.link || '';
        }
        return '';
    } catch {
        return '';
    }
}

/**
 * Deep link to project with review tab (same query shape as ProjectProgressTracker.buildProjectReviewLink).
 */
export function buildProjectReviewTabLink(projectId, tab, monthName, monthIndex, year) {
    try {
        const basePath = `${window.location.origin}${window.location.pathname}`;
        const query = new URLSearchParams();
        if (tab) query.set('tab', tab);
        if (monthName) query.set('month', String(monthName));
        if (typeof monthIndex === 'number' && monthIndex >= 0) query.set('monthIndex', String(monthIndex));
        if (year) query.set('year', String(year));
        return `${basePath}#/projects/${encodeURIComponent(String(projectId))}?${query.toString()}`;
    } catch {
        return '#/projects';
    }
}

/**
 * Open full progress tracker (aligned with ProjectProgressTracker.buildProgressTrackerLink).
 */
export function buildProgressTrackerLink(projectId, monthName, monthIndex, year, field = 'comments') {
    try {
        const basePath = `${window.location.origin}${window.location.pathname}`;
        const params = new URLSearchParams();
        params.set('progressTracker', '1');
        if (projectId) {
            params.set('projectId', String(projectId));
        }
        if (typeof monthIndex === 'number' && !Number.isNaN(monthIndex) && monthIndex >= 0) {
            params.set('monthIndex', String(monthIndex));
        }
        if (monthName) {
            params.set('month', monthName);
        }
        if (year) {
            params.set('year', String(year));
        }
        if (field) {
            params.set('field', field);
            params.set('focusInput', field);
        }
        return `${basePath}#/projects?${params.toString()}`;
    } catch {
        return '#/projects';
    }
}

export function buildSnapshotRows(projects, lastWorkingMonth) {
    const { monthName, year, monthIndex } = lastWorkingMonth;
    const filtered = filterProjectsForProgressTracker(projects)
        .map(normalizeProjectMonthlyProgress);

    return filtered.map((project) => {
        const doc = getDocumentCollectionProgressForMonth(project, monthName, year);
        const comp = getReviewProgressForMonth(project, monthName, year, 'complianceReview');
        const data = getReviewProgressForMonth(project, monthName, year, 'monthlyDataReview');
        const comments = getCommentsForMonth(project, monthName, year);
        return {
            id: project.id,
            name: project.name || '—',
            client: project.clientName || project.client || '',
            monthIndex,
            year,
            monthName,
            doc,
            compliance: comp,
            data,
            comments
        };
    });
}

const projectProgressMonthMetrics = {
    TRACKER_MONTH_NAMES,
    getWorkingMonthEntries,
    getLastWorkingMonth,
    isIncludedInProgressTracker,
    filterProjectsForProgressTracker,
    normalizeProjectMonthlyProgress,
    getDocumentCollectionProgressForMonth,
    getReviewProgressForMonth,
    getCommentsForMonth,
    buildProjectReviewTabLink,
    buildProgressTrackerLink,
    buildSnapshotRows
};

if (typeof window !== 'undefined') {
    window.projectProgressMonthMetrics = projectProgressMonthMetrics;
}

export default projectProgressMonthMetrics;
