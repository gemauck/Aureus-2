// Get dependencies from window
const { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } = React;

/** Full document reload (F5) vs navigate. Only Navigation Timing 2 — legacy performance.navigation often mis-reports and blocked auto-scroll on normal loads. */
function isBrowserNavigationReload() {
    if (typeof window === 'undefined' || typeof performance === 'undefined') {
        return false;
    }
    try {
        const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        return Boolean(nav && nav.type === 'reload');
    } catch (e) {
        return false;
    }
}

/** `navigation.type` stays `reload` for the whole document after F5 — only treat first paint as reload for UX. */
function managementMeetingNotesParseLocalDay(value) {
    if (value == null || value === '') {
        return null;
    }
    if (value instanceof Date) {
        const d = value;
        if (Number.isNaN(d.getTime())) {
            return null;
        }
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    const s = String(value);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
        return null;
    }
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function managementMeetingNotesWeekContainsLocalDay(week, day0) {
    if (!week) {
        return false;
    }
    const start = managementMeetingNotesParseLocalDay(week.weekStart || week.week_start);
    if (!start) {
        return false;
    }
    const endRaw = week.weekEnd || week.week_end || week.weekStart || week.week_start;
    const end = managementMeetingNotesParseLocalDay(endRaw) || start;
    const endOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    return day0 >= start && day0 <= endOfDay;
}

function managementMeetingNotesGetWeekIdForList(week, index) {
    if (!week) {
        return null;
    }
    if (week.weekKey) {
        return week.weekKey;
    }
    if (week.id) {
        return week.id;
    }
    return `week-${index}`;
}

function managementMeetingNotesFindWeekIndexInList(weeks, param) {
    if (!Array.isArray(weeks) || weeks.length === 0 || param == null || param === '') {
        return -1;
    }
    const s = String(param);
    return weeks.findIndex((week, index) => {
        if (!week) {
            return false;
        }
        return (
            s === managementMeetingNotesGetWeekIdForList(week, index) ||
            s === String(week.weekKey || '') ||
            s === String(week.week_key || '') ||
            s === String(week.id || '')
        );
    });
}

/** Preferred column index for "today" (Fri–Sun → next week when possible); bracket when no row contains today. */
function managementMeetingNotesPreferredWeekIndex(weeks) {
    if (!Array.isArray(weeks) || weeks.length === 0) {
        return 0;
    }
    const today = new Date();
    const day0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dow = today.getDay();
    const preferNextWeek = dow === 0 || dow === 5 || dow === 6;

    let matchedIdx = -1;
    for (let i = 0; i < weeks.length; i++) {
        if (managementMeetingNotesWeekContainsLocalDay(weeks[i], day0)) {
            matchedIdx = i;
            break;
        }
    }

    let baseIdx;
    if (matchedIdx >= 0) {
        baseIdx = matchedIdx;
    } else {
        let pick = 0;
        let sawAnyStart = false;
        for (let i = 0; i < weeks.length; i++) {
            const s = managementMeetingNotesParseLocalDay(weeks[i].weekStart || weeks[i].week_start);
            if (!s) {
                continue;
            }
            sawAnyStart = true;
            if (s <= day0) {
                pick = i;
            }
        }
        const firstStart = managementMeetingNotesParseLocalDay(weeks[0].weekStart || weeks[0].week_start);
        if (sawAnyStart && firstStart && firstStart > day0) {
            baseIdx = 0;
        } else {
            baseIdx = pick;
        }
    }

    let preferredIdx = baseIdx;
    if (preferNextWeek && preferredIdx >= 0 && preferredIdx < weeks.length - 1) {
        preferredIdx += 1;
    }
    return preferredIdx;
}

const ADMIN_ROLES = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];
const ADMIN_PERMISSION_KEYS = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];

const normalizePermissions = (permissions) => {
    if (!permissions) return [];
    if (Array.isArray(permissions)) return permissions;
    if (typeof permissions === 'string') {
        try {
            const parsed = JSON.parse(permissions);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (error) {
            return permissions
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
        }
    }
    return [];
};

const isAdminFromUser = (user) => {
    if (!user) return false;

    const role = (user.role || '').toString().trim().toLowerCase();
    if (ADMIN_ROLES.includes(role)) {
        return true;
    }

    const normalizedPermissions = normalizePermissions(user.permissions).map((perm) =>
        (perm || '').toString().trim().toLowerCase()
    );

    return normalizedPermissions.some((perm) => ADMIN_PERMISSION_KEYS.includes(perm));
};

// Department definitions - matching API and Teams configuration
const DEPARTMENTS = [
    { id: 'management', name: 'David Buttemer', icon: 'fa-user-tie', color: 'blue' },
    { id: 'compliance', name: 'Compliance', icon: 'fa-shield-alt', color: 'red' },
    { id: 'finance', name: 'Finance', icon: 'fa-coins', color: 'yellow' },
    { id: 'technical', name: 'Technical', icon: 'fa-tools', color: 'primary' },
    { id: 'data', name: 'Data & Analytics', icon: 'fa-chart-line', color: 'sky' },
    { id: 'support', name: 'Support', icon: 'fa-headset', color: 'green' },
    { id: 'commercial', name: 'Commercial', icon: 'fa-handshake', color: 'orange' },
    { id: 'business-development', name: 'Business Development', icon: 'fa-rocket', color: 'pink' },
    { id: 'hr', name: 'HR', icon: 'fa-user-friends', color: 'purple' }
];

const normalizeDepartmentKeyCandidate = (value) => {
    if (!value) return '';
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
};

const DEPARTMENT_KEY_MAP = DEPARTMENTS.reduce((acc, dept) => {
    const id = dept.id || '';
    const name = dept.name || '';
    if (id) {
        acc[id] = id;
        acc[id.toLowerCase()] = id;
        acc[normalizeDepartmentKeyCandidate(id)] = id;
    }
    if (name) {
        acc[name.toLowerCase()] = id;
        acc[normalizeDepartmentKeyCandidate(name)] = id;
    }
    return acc;
}, {});

/** Explicit Tailwind for department cards (dynamic `text-${color}` is unreliable with JIT). */
function meetingNotesDeptSurface(deptId) {
    const map = {
        management: {
            stripe: 'border-l-4 border-l-blue-500',
            chipL: 'bg-blue-50 text-blue-900 ring-1 ring-blue-100/90',
            chipD: 'bg-blue-500/15 text-blue-100 ring-1 ring-blue-400/25'
        },
        compliance: {
            stripe: 'border-l-4 border-l-red-500',
            chipL: 'bg-red-50 text-red-950 ring-1 ring-red-100/90',
            chipD: 'bg-red-500/15 text-red-100 ring-1 ring-red-400/25'
        },
        finance: {
            stripe: 'border-l-4 border-l-amber-500',
            chipL: 'bg-amber-50 text-amber-950 ring-1 ring-amber-100/90',
            chipD: 'bg-amber-500/15 text-amber-100 ring-1 ring-amber-400/25'
        },
        technical: {
            stripe: 'border-l-4 border-l-slate-500',
            chipL: 'bg-slate-100 text-slate-900 ring-1 ring-slate-200/90',
            chipD: 'bg-slate-600/35 text-slate-100 ring-1 ring-slate-400/25'
        },
        data: {
            stripe: 'border-l-4 border-l-sky-500',
            chipL: 'bg-sky-50 text-sky-950 ring-1 ring-sky-100/90',
            chipD: 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-400/25'
        },
        support: {
            stripe: 'border-l-4 border-l-emerald-500',
            chipL: 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100/90',
            chipD: 'bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/25'
        },
        commercial: {
            stripe: 'border-l-4 border-l-orange-500',
            chipL: 'bg-orange-50 text-orange-950 ring-1 ring-orange-100/90',
            chipD: 'bg-orange-500/15 text-orange-100 ring-1 ring-orange-400/25'
        },
        'business-development': {
            stripe: 'border-l-4 border-l-fuchsia-500',
            chipL: 'bg-fuchsia-50 text-fuchsia-950 ring-1 ring-fuchsia-100/90',
            chipD: 'bg-fuchsia-500/15 text-fuchsia-100 ring-1 ring-fuchsia-400/25'
        },
        hr: {
            stripe: 'border-l-4 border-l-violet-500',
            chipL: 'bg-violet-50 text-violet-950 ring-1 ring-violet-100/90',
            chipD: 'bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/25'
        }
    };
    return (
        map[deptId] || {
            stripe: 'border-l-4 border-l-primary-500',
            chipL: 'bg-primary-50 text-primary-900 ring-1 ring-primary-100/90',
            chipD: 'bg-primary-500/15 text-primary-100 ring-1 ring-primary-400/25'
        }
    );
}

const padTwo = (value) => String(value).padStart(2, '0');

const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());

const parseDateInput = (value) => {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
        return isValidDate(value) ? new Date(value.getTime()) : null;
    }

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const sanitized = trimmed.replace(/\//g, '-');
    const isoMatch = sanitized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return isValidDate(parsed) ? parsed : null;
    }

    const parsed = new Date(trimmed);
    return isValidDate(parsed) ? parsed : null;
};

const getMonthKeyFromDate = (date) => {
    if (!isValidDate(date)) return null;
    return `${date.getFullYear()}-${padTwo(date.getMonth() + 1)}`;
};

// Helper function to decode HTML entities and ensure proper HTML rendering
const decodeHtmlContent = (html) => {
    if (!html || typeof html !== 'string') return html || '';
    
    // If the content contains escaped HTML entities, decode them
    // Check if content has escaped HTML tags (like &lt;div&gt; instead of <div>)
    if (html.includes('&lt;') || html.includes('&gt;') || html.includes('&amp;') || html.includes('&quot;') || html.includes('&#39;')) {
        // Create a temporary element to decode HTML entities
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html;
        let decoded = textarea.value;
        
        // If still contains escaped entities, decode again (handles double-encoding)
        if (decoded.includes('&lt;') || decoded.includes('&gt;') || decoded.includes('&amp;')) {
            textarea.innerHTML = decoded;
            decoded = textarea.value;
        }
        
        return decoded;
    }
    
    // If no escaped entities found, return as-is (already valid HTML)
    return html;
};

// Helper function to convert URLs in text to clickable links
const linkifyText = (text) => {
    if (!text || typeof text !== 'string') return text || '';
    
    // URL regex pattern - matches http://, https://, www., and email addresses
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+|www\.[^\s<>"{}|\\^`[\]]+|[\w.-]+@[\w.-]+\.\w+)/gi;
    
    // Check if text already contains HTML links (to avoid double-processing)
    if (text.includes('<a ') || text.includes('<A ')) {
        return text; // Already has links, return as-is
    }
    
    return text.replace(urlPattern, (match) => {
        let url = match;
        
        // Add protocol if missing
        if (match.startsWith('www.')) {
            url = 'https://' + match;
        } else if (match.includes('@') && !match.startsWith('mailto:')) {
            url = 'mailto:' + match;
        }
        
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary-600 hover:text-primary-700 underline">${match}</a>`;
    });
};

const normalizeMonthKeyInput = (value) => {
    if (!value && value !== 0) return null;
    if (value instanceof Date) {
        return getMonthKeyFromDate(value);
    }

    const trimmed = String(value).trim();
    if (!trimmed) return null;

    const sanitized = trimmed.replace(/\//g, '-');
    const hyphenMatch = sanitized.match(/^(\d{4})-(\d{1,2})$/);
    if (hyphenMatch) {
        const [, year, month] = hyphenMatch;
        const monthNumber = Number(month);
        if (monthNumber >= 1 && monthNumber <= 12) {
            return `${year}-${padTwo(monthNumber)}`;
        }
    }

    const compactMatch = sanitized.match(/^(\d{4})(\d{2})$/);
    if (compactMatch) {
        const [, year, month] = compactMatch;
        const monthNumber = Number(month);
        if (monthNumber >= 1 && monthNumber <= 12) {
            return `${year}-${padTwo(monthNumber)}`;
        }
    }

    const parsed = parseDateInput(trimmed);
    return parsed ? getMonthKeyFromDate(parsed) : null;
};

/** Poll interval when SSE is unavailable (ms). */
/** Live refresh while editing; SSE when available — avoid 1s polling (server + browser load). */
const MEETING_NOTES_LIVE_POLL_MS = 10000;

const MEETING_NOTES_DEPT_TEXT_FIELDS = ['successes', 'weekToFollow', 'frustrations'];

function mergeMeetingNotesActionItems(remoteList, localList, editingId) {
    const remote = Array.isArray(remoteList) ? remoteList : [];
    const local = Array.isArray(localList) ? localList : [];
    const localById = new Map(local.filter((i) => i?.id).map((i) => [i.id, i]));
    const merged = remote.map((item) => {
        if (editingId && item?.id === editingId) {
            return localById.get(item.id) || item;
        }
        return item;
    });
    const remoteIds = new Set(remote.map((i) => i?.id).filter(Boolean));
    for (const item of local) {
        const id = item?.id;
        if (id && String(id).startsWith('temp-') && !remoteIds.has(id)) {
            merged.push(item);
        }
    }
    return merged;
}

function meetingNotesPayloadSignature(note) {
    if (!note) {
        return '';
    }
    try {
        return JSON.stringify(note);
    } catch (_) {
        return String(note?.id || '');
    }
}

const normalizeMonthlyGoalsByDepartment = (value) => {
    if (!value) return {};
    if (typeof value === 'object') {
        if (Array.isArray(value)) return {};
        return value || {};
    }
    if (typeof value !== 'string') return {};
    const trimmed = value.trim();
    if (!trimmed) return {};
    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const normalized = {};
            Object.entries(parsed).forEach(([rawKey, rawValue]) => {
                const mappedKey =
                    DEPARTMENT_KEY_MAP[rawKey] ||
                    DEPARTMENT_KEY_MAP[String(rawKey).toLowerCase()] ||
                    DEPARTMENT_KEY_MAP[normalizeDepartmentKeyCandidate(rawKey)];
                if (mappedKey) {
                    normalized[mappedKey] = rawValue;
                } else {
                    normalized[rawKey] = rawValue;
                }
            });
            return normalized;
        }
    } catch (error) {
        // Fall through to legacy fallback
    }
    return { __legacy: value };
};

const deriveWeekDetails = (value) => {
    const baseDate = value ? parseDateInput(value) : null;
    if (!baseDate) return null;

    const weekStart = new Date(baseDate);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekKey = `${weekStart.getFullYear()}-${padTwo(weekStart.getMonth() + 1)}-${padTwo(weekStart.getDate())}`;
    // IMPORTANT:
    // Use the ORIGINAL selected/base date to determine the "month" this week belongs to,
    // not the derived weekStart Sunday. This ensures that when a user selects a date like
    // 1 December, the week is grouped under December (the selected month) instead of
    // November (because the Sunday weekStart might still be in November).
    const monthKey = getMonthKeyFromDate(baseDate);

    return { weekStart, weekEnd, weekKey, monthKey };
};

/** Query params: merge hash (#/teams/management?…) with pathname ?search so /teams/management?month=… is not lost when the hash has no query (same idea as document collection URL sync). Hash wins on duplicate keys. */
function getMeetingNotesRouteSearchParams() {
    const merged = new URLSearchParams();
    const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
    if (hash.indexOf('?') !== -1) {
        const q = hash.slice(hash.indexOf('?') + 1);
        new URLSearchParams(q).forEach((value, key) => {
            merged.set(key, value);
        });
    }
    const search = typeof window !== 'undefined' ? window.location.search || '' : '';
    if (search.length > 1) {
        new URLSearchParams(search.slice(1)).forEach((value, key) => {
            if (!merged.has(key)) {
                merged.set(key, value);
            }
        });
    }
    return merged;
}

function buildMeetingNotesClientDeepLink({ selectedMonth, selectedWeek, commentContext }) {
    const q = new URLSearchParams();
    q.set('tab', 'meeting-notes');
    q.set('team', 'management');
    if (selectedMonth) q.set('month', String(selectedMonth));
    if (selectedWeek) q.set('week', String(selectedWeek));
    if (commentContext?.type === 'department' && commentContext.departmentId) {
        q.set('department', String(commentContext.departmentId));
        q.set('departmentNotesId', String(commentContext.id));
    } else if (commentContext?.type === 'monthly') {
        q.set('monthlyNotesId', String(commentContext.id));
    } else if (commentContext) {
        q.set('actionItemId', String(commentContext.id));
    }
    return `#/teams/management?${q.toString()}`;
}

/**
 * Plain text for GM comment offsets — concatenation of text nodes in document order only.
 * Must match `gmSetSelectionByPlainOffsets` (same walker), not `innerText` (which inserts
 * block breaks and mismatches selection ranges → wrong quotes / wrap targets).
 */
function gmElementPlainTextLinear(root) {
    if (!root) {
        return '';
    }
    try {
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let s = '';
        let n;
        while ((n = w.nextNode())) {
            s += n.nodeValue || '';
        }
        return String(s).replace(/\r\n/g, '\n');
    } catch (_) {
        return '';
    }
}

/** Plain text from stored HTML — same linearization as live editor (thread start/end indices). */
function gmHtmlToPlainText(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }
    try {
        const d = document.createElement('div');
        d.innerHTML = html;
        return gmElementPlainTextLinear(d);
    } catch (_) {
        return '';
    }
}

function gmParseInlineThreadsRaw(raw) {
    if (Array.isArray(raw)) {
        return raw.filter((t) => t && typeof t === 'object' && typeof t.id === 'string');
    }
    if (typeof raw === 'string') {
        try {
            const p = JSON.parse(raw || '[]');
            return Array.isArray(p) ? p.filter((t) => t && typeof t === 'object' && typeof t.id === 'string') : [];
        } catch (_) {
            return [];
        }
    }
    return [];
}

function gmReconcileThreadsWithPlain(threads, plainText) {
    const text = String(plainText || '');
    return threads.map((t) => {
        const quote = String(t.quote || '');
        let start = Number(t.start);
        let end = Number(t.end);
        if (Number.isNaN(start)) start = 0;
        if (Number.isNaN(end)) end = 0;
        if (quote && text.slice(start, end) === quote) {
            return { ...t, start, end, anchorStale: false };
        }
        if (quote) {
            const idx = text.indexOf(quote);
            if (idx !== -1) {
                return { ...t, start: idx, end: idx + quote.length, anchorStale: false };
            }
        }
        return { ...t, start, end, anchorStale: true };
    });
}

function gmGenInlineThreadId() {
    return `gmthr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function gmGenInlineMsgId() {
    return `gmmsg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function gmCaptureSelectionInEditor(editorEl) {
    if (!editorEl) {
        return null;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return null;
    }
    const range = sel.getRangeAt(0);
    if (!editorEl.contains(range.commonAncestorContainer)) {
        return null;
    }
    try {
        const pre = document.createRange();
        pre.selectNodeContents(editorEl);
        pre.setEnd(range.startContainer, range.startOffset);
        const preDiv = document.createElement('div');
        preDiv.appendChild(pre.cloneContents());
        const start = gmElementPlainTextLinear(preDiv);

        const selDiv = document.createElement('div');
        selDiv.appendChild(range.cloneContents());
        const quote = gmElementPlainTextLinear(selDiv);
        if (!String(quote).trim()) {
            return null;
        }
        const end = start + quote.length;
        const rect = range.getBoundingClientRect();
        return { start, end, quote, rect };
    } catch (_) {
        return null;
    }
}

function gmCaptureSelectionTextarea(ta) {
    if (!ta || typeof ta.selectionStart !== 'number' || typeof ta.selectionEnd !== 'number') {
        return null;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (end <= start) {
        return null;
    }
    const quote = String(ta.value.slice(start, end) || '');
    if (!quote.trim()) {
        return null;
    }
    const r = ta.getBoundingClientRect();
    return { start, end, quote, rect: r };
}

/** Build a DOM range from linear text offsets (same walker as `gmElementPlainTextLinear`). */
function gmRangeFromPlainOffsets(editorEl, start, end) {
    if (!editorEl || typeof start !== 'number' || typeof end !== 'number') {
        return null;
    }
    const walk = document.createTreeWalker(editorEl, NodeFilter.SHOW_TEXT, null);
    let pos = 0;
    let startNode = null;
    let startOff = 0;
    let endNode = null;
    let endOff = 0;
    let foundStart = false;
    let n;
    while ((n = walk.nextNode())) {
        const text = n.nodeValue || '';
        const len = text.length;
        if (!foundStart && pos + len >= start) {
            startNode = n;
            startOff = Math.max(0, Math.min(len, start - pos));
            foundStart = true;
        }
        if (foundStart && pos + len >= end) {
            endNode = n;
            endOff = Math.max(0, Math.min(len, end - pos));
            break;
        }
        pos += len;
    }
    if (!startNode || !endNode) {
        return null;
    }
    try {
        const r = document.createRange();
        r.setStart(startNode, startOff);
        r.setEnd(endNode, endOff);
        return r;
    } catch (_) {
        return null;
    }
}

function gmSetSelectionByPlainOffsets(editorEl, start, end) {
    const r = gmRangeFromPlainOffsets(editorEl, start, end);
    if (!r) {
        return false;
    }
    try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
        editorEl.focus();
        return true;
    } catch (_) {
        return false;
    }
}

/** Per-week memo key for injected GM anchors (avoids DOM work every render). */
function gmQuickHash(str) {
    const s = String(str || '');
    let h = 5381;
    const max = Math.min(s.length, 48000);
    for (let i = 0; i < max; i += 1) {
        h = (h * 33) ^ s.charCodeAt(i);
    }
    return `${s.length}:${(h >>> 0).toString(36)}`;
}

function gmStableThreadsAnchorKey(threads) {
    if (!Array.isArray(threads) || threads.length === 0) {
        return '';
    }
    return threads
        .map((t) => `${t.id}:${t.start}:${t.end}:${t.resolved ? 1 : 0}`)
        .sort()
        .join('|');
}

const gmDisplayHtmlCache = new Map();

function getGmRichTextEditorValue(week, editingWeekIdRef, valuesRef) {
    if (!week?.id) {
        return '';
    }
    const isDraft = editingWeekIdRef?.current === week.id && valuesRef?.current[week.id] !== undefined;
    const raw = isDraft ? valuesRef.current[week.id] : week.generalMinutes || '';
    const plain = gmHtmlToPlainText(typeof raw === 'string' ? raw : '');
    const threads = gmReconcileThreadsWithPlain(gmParseInlineThreadsRaw(week.generalMinutesThreads), plain);
    const sig = `${isDraft ? 'd' : 's'}|${gmQuickHash(raw)}|${gmStableThreadsAnchorKey(threads)}`;
    const prev = gmDisplayHtmlCache.get(week.id);
    if (prev && prev.sig === sig) {
        return prev.html;
    }
    const html = gmEnsureThreadAnchorsInHtml(typeof raw === 'string' ? raw : '', threads);
    gmDisplayHtmlCache.set(week.id, { sig, html });
    return html;
}

/**
 * Insert missing `span.gm-thread-anchor` wraps for threads whose HTML has no anchor yet.
 * Uses the same wrap helpers as live commenting; runs in a hidden host on `document.body` briefly for reliable ranges.
 */
function gmEnsureThreadAnchorsInHtml(html, threads) {
    if (typeof document === 'undefined' || !document.body) {
        return typeof html === 'string' ? html : '';
    }
    if (typeof html !== 'string' || !html) {
        return typeof html === 'string' ? html : '';
    }
    const list = Array.isArray(threads)
        ? threads.filter((t) => t && t.id && typeof t.start === 'number' && typeof t.end === 'number' && t.end > t.start)
        : [];
    if (list.length === 0) {
        return html;
    }
    const sorted = [...list].sort((a, b) => a.start - b.start);
    let host = null;
    let appended = false;
    try {
        host = document.createElement('div');
        host.setAttribute('data-gm-anchor-inject', '1');
        host.style.cssText =
            'position:fixed;left:-99999px;top:0;width:min(1600px,100vw);max-height:90vh;overflow:auto;opacity:0;pointer-events:none;visibility:hidden;z-index:-1;';
        host.innerHTML = html;
        document.body.appendChild(host);
        appended = true;

        for (let i = 0; i < sorted.length; i += 1) {
            const t = sorted[i];
            const tid = String(t.id);
            const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(tid) : tid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            if (host.querySelector(`span[data-gm-thread-id="${esc}"]`)) {
                continue;
            }
            const plainNow = gmElementPlainTextLinear(host);
            const start = Math.max(0, Math.min(plainNow.length, t.start));
            const end = Math.max(start, Math.min(plainNow.length, t.end));
            if (end <= start) {
                continue;
            }
            const r = gmRangeFromPlainOffsets(host, start, end);
            if (!r || r.collapsed) {
                continue;
            }
            wrapGmThreadRangeStable(r, tid);
        }

        sorted.forEach((t) => {
            const tid = String(t.id);
            const esc = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(tid) : tid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            host.querySelectorAll(`span[data-gm-thread-id="${esc}"]`).forEach((el) => {
                if (t.resolved) {
                    el.classList.add('gm-thread-resolved');
                } else {
                    el.classList.remove('gm-thread-resolved');
                }
            });
        });

        return host.innerHTML;
    } catch (e) {
        console.warn('gmEnsureThreadAnchorsInHtml:', e);
        return html;
    } finally {
        if (appended && host && host.parentNode) {
            host.parentNode.removeChild(host);
        }
    }
}

/**
 * Unwrap all inline anchor spans for a thread id (mutates container div).
 */
function gmUnwrapThreadSpansInElement(rootEl, threadId) {
    if (!rootEl || !threadId) {
        return;
    }
    const esc =
        typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(threadId)) : String(threadId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    rootEl.querySelectorAll(`span[data-gm-thread-id="${esc}"]`).forEach((el) => {
        const p = el.parentNode;
        if (!p) {
            return;
        }
        while (el.firstChild) {
            p.insertBefore(el.firstChild, el);
        }
        p.removeChild(el);
    });
}

function gmStripThreadSpansFromHtmlString(html, threadId) {
    if (!html || !threadId) {
        return typeof html === 'string' ? html : '';
    }
    try {
        const d = document.createElement('div');
        d.innerHTML = html;
        gmUnwrapThreadSpansInElement(d, threadId);
        return d.innerHTML;
    } catch (_) {
        return typeof html === 'string' ? html : '';
    }
}

/**
 * Wrap selection in gm-thread-anchor span(s). Prefer single surroundContents; if the range
 * spans multiple text nodes, split end text boundaries then wrap each text slice using
 * extractContents on a range confined to one text node (does not hoist block nodes).
 */
function wrapGmThreadPerTextNodeExtract(range, threadId) {
    if (!range || range.collapsed || !threadId) {
        return false;
    }
    const r = range.cloneRange();
    if (r.startContainer.nodeType === 3 && r.startOffset > 0) {
        const tail = r.startContainer.splitText(r.startOffset);
        r.setStart(tail, 0);
    }
    if (r.endContainer.nodeType === 3 && r.endOffset < r.endContainer.length) {
        r.endContainer.splitText(r.endOffset);
    }
    const root = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    if (!root) {
        return false;
    }
    const tuples = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let t;
    while ((t = w.nextNode())) {
        if (!r.intersectsNode(t)) {
            continue;
        }
        const L = t.length;
        let s = 0;
        let e = L;
        if (t === r.startContainer) {
            s = r.startOffset;
        }
        if (t === r.endContainer) {
            e = r.endOffset;
        }
        if (e <= s) {
            continue;
        }
        tuples.push({ t, s, e });
    }
    if (tuples.length === 0) {
        return false;
    }
    for (let i = tuples.length - 1; i >= 0; i -= 1) {
        const { t: tn, s, e } = tuples[i];
        if (!tn.parentNode) {
            continue;
        }
        const sub = document.createRange();
        try {
            sub.setStart(tn, s);
            sub.setEnd(tn, e);
        } catch (err) {
            console.warn('wrapGmThreadPerTextNodeExtract: invalid offsets', err);
            return false;
        }
        const span = document.createElement('span');
        span.setAttribute('data-gm-thread-id', threadId);
        span.className = 'gm-thread-anchor';
        try {
            const frag = sub.extractContents();
            span.appendChild(frag);
            sub.insertNode(span);
        } catch (err) {
            console.warn('wrapGmThreadPerTextNodeExtract: segment failed', err);
            return false;
        }
    }
    return true;
}

function wrapGmThreadRangeStable(range, threadId) {
    if (!range || range.collapsed || !threadId) {
        return false;
    }
    try {
        const span = document.createElement('span');
        span.setAttribute('data-gm-thread-id', threadId);
        span.className = 'gm-thread-anchor';
        const rTry = range.cloneRange();
        rTry.surroundContents(span);
        return true;
    } catch (_) {
        return wrapGmThreadPerTextNodeExtract(range, threadId);
    }
}

function wrapGmThreadRangeFromSelection(threadId) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        return false;
    }
    const range = sel.getRangeAt(0);
    return wrapGmThreadRangeStable(range, threadId);
}

async function gmNotifyInlineCommentMentions(commentText, { contextTitle, contextLink, authorName }) {
    if (!commentText?.trim() || !window.MentionHelper?.hasMentions?.(commentText)) {
        return;
    }
    try {
        const token = window.storage?.getToken?.();
        if (!token) {
            return;
        }
        const response = await fetch('/api/users', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        const allUsers = data.data?.users || data.users || [];
        await window.MentionHelper.processMentions(commentText, contextTitle, contextLink, authorName, allUsers);
    } catch (e) {
        console.error('General minutes inline comment mentions:', e);
    }
}

const ManagementMeetingNotes = () => {
    // Get theme state
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;

    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: currentUser } = authHook();
    const isAdminUser = useMemo(() => isAdminFromUser(currentUser), [currentUser]);
    /** After F5, `performance.navigation.type` stays `reload` forever — capture once per mount. */
    const initialPageWasNavigationReload = useMemo(() => isBrowserNavigationReload(), []);

    useEffect(() => {
        if (!isAdminUser) {
            console.warn('ManagementMeetingNotes: blocked access for non-admin user', {
                userId: currentUser?.id,
                email: currentUser?.email,
                role: currentUser?.role
            });
        }
    }, [isAdminUser, currentUser]);

    // Preserve scroll position on page load/refresh - AGGRESSIVE VERSION
    useEffect(() => {
        // Save scroll position before page unload
        const saveScrollOnUnload = () => {
            const scrollY = window.scrollY || window.pageYOffset;
            if (scrollY > 0) {
                sessionStorage.setItem('managementMeetingNotes_scroll', scrollY.toString());
            }
        };
        
        // Restore scroll position on page load - AGGRESSIVE with multiple attempts
        const restoreScrollOnLoad = () => {
            const savedScroll = sessionStorage.getItem('managementMeetingNotes_scroll');
            if (savedScroll) {
                const scrollY = parseInt(savedScroll, 10);
                if (scrollY > 0) {
                    // Immediate restoration
                    window.scrollTo(0, scrollY);
                    
                    // Multiple restoration attempts to handle React re-renders and DOM updates
                    requestAnimationFrame(() => {
                        window.scrollTo(0, scrollY);
                    });
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 0);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 10);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 50);
                    
                        setTimeout(() => {
                            window.scrollTo(0, scrollY);
                        }, 100);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 200);
                    
                        setTimeout(() => {
                            window.scrollTo(0, scrollY);
                        }, 500);
                    
                    setTimeout(() => {
                        window.scrollTo(0, scrollY);
                    }, 1000);
                }
            }
        };
        
        // Restore scroll on mount - immediate
        restoreScrollOnLoad();
        
        // Also restore on DOMContentLoaded if not already restored
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', restoreScrollOnLoad);
        }
        
        // Save scroll on unload
        window.addEventListener('beforeunload', saveScrollOnUnload);
        
        // Also save scroll periodically
        const scrollSaveInterval = setInterval(() => {
            const scrollY = window.scrollY || window.pageYOffset;
            if (scrollY > 0) {
                sessionStorage.setItem('managementMeetingNotes_scroll', scrollY.toString());
            }
        }, 1000);
        
        return () => {
            window.removeEventListener('beforeunload', saveScrollOnUnload);
            document.removeEventListener('DOMContentLoaded', restoreScrollOnLoad);
            clearInterval(scrollSaveInterval);
        };
    }, []);
    
    // Global scroll preservation - prevent unwanted scroll to top
    useEffect(() => {
        let savedScrollPosition = window.scrollY || window.pageYOffset;
        let isUserScrolling = false;
        
        // Save scroll position periodically
        const saveScroll = () => {
            if (!isUserScrolling) {
                savedScrollPosition = window.scrollY || window.pageYOffset;
            }
        };
        
        // Monitor scroll events
        const handleScroll = () => {
            isUserScrolling = true;
            savedScrollPosition = window.scrollY || window.pageYOffset;
            setTimeout(() => {
                isUserScrolling = false;
            }, 100);
        };
        
        // Prevent scroll to top on focus/click events - AGGRESSIVE VERSION
        const preventScrollToTop = (e) => {
            // Check if the event is on a text input/textarea
            const target = e.target;
            if (!target || typeof target !== 'object') return;
            
            // Check if target is a DOM element
            const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
            const isContentEditable = target.contentEditable === 'true';
            const hasContentEditableParent = target.closest && typeof target.closest === 'function' && target.closest('[contenteditable="true"]');
            
            if (isTextInput || isContentEditable || hasContentEditableParent) {
                // Save current scroll position IMMEDIATELY
                savedScrollPosition = window.scrollY || window.pageYOffset;
                
                // IMMEDIATE restoration - don't wait
                if (savedScrollPosition > 0) {
                    window.scrollTo(0, savedScrollPosition);
                }
                
                // Aggressive restoration with multiple attempts
                requestAnimationFrame(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                });
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 0);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 10);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 50);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 100);
                setTimeout(() => {
                    if (savedScrollPosition > 0) {
                        window.scrollTo(0, savedScrollPosition);
                    }
                }, 200);
            }
        };
        
        // Also prevent on mousedown
        const preventScrollOnMouseDown = (e) => {
            const target = e.target;
            if (!target || typeof target !== 'object') return;
            
            const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
            const isContentEditable = target.contentEditable === 'true';
            const hasContentEditableParent = target.closest && typeof target.closest === 'function' && target.closest('[contenteditable="true"]');
            
            if (isTextInput || isContentEditable || hasContentEditableParent) {
                savedScrollPosition = window.scrollY || window.pageYOffset;
                if (savedScrollPosition > 0) {
                    window.scrollTo(0, savedScrollPosition);
                }
            }
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('focus', preventScrollToTop, true);
        window.addEventListener('click', preventScrollToTop, true);
        window.addEventListener('mousedown', preventScrollOnMouseDown, true);
        
        // Save scroll position more frequently
        const scrollInterval = setInterval(saveScroll, 50);
        
        // Also monitor scroll position continuously for contentEditable elements
        const scrollMonitor = setInterval(() => {
            const activeElement = document.activeElement;
            if (activeElement && (activeElement.contentEditable === 'true' || 
                activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'INPUT')) {
                const currentScroll = window.scrollY || window.pageYOffset;
                if (currentScroll === 0 && savedScrollPosition > 0) {
                    // Scroll was reset to 0, restore it
                    window.scrollTo(0, savedScrollPosition);
                } else if (currentScroll > 0) {
                    // Update saved position
                    savedScrollPosition = currentScroll;
                }
            }
        }, 50);
        
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('focus', preventScrollToTop, true);
            window.removeEventListener('click', preventScrollToTop, true);
            window.removeEventListener('mousedown', preventScrollOnMouseDown, true);
            clearInterval(scrollInterval);
            clearInterval(scrollMonitor);
        };
    }, []);

    const [monthlyNotesList, setMonthlyNotesList] = useState([]);
    const [currentMonthlyNotes, setCurrentMonthlyNotes] = useState(null);
    const [scrollRestoreTrigger, setScrollRestoreTrigger] = useState(0);
    
    // Initialize selectedMonth and selectedWeek from URL or default
    const getMonthFromURL = () => getMeetingNotesRouteSearchParams().get('month') || null;

    const getWeekFromURL = () => getMeetingNotesRouteSearchParams().get('week') || null;
    
    const [selectedMonth, setSelectedMonth] = useState(getMonthFromURL());
    const [selectedWeek, setSelectedWeek] = useState(getWeekFromURL());
    const selectedMonthRef = useRef(selectedMonth);
    selectedMonthRef.current = selectedMonth;
    const [selectedDepartment, setSelectedDepartment] = useState(null);
    const [deepLinkNonce, setDeepLinkNonce] = useState(0);

    useEffect(() => {
        const bump = () => setDeepLinkNonce((n) => n + 1);
        window.addEventListener('hashchange', bump);
        window.addEventListener('popstate', bump);
        return () => {
            window.removeEventListener('hashchange', bump);
            window.removeEventListener('popstate', bump);
        };
    }, []);

    // Hydrate month/week from the merged URL before paint so the pushState effect below does not run with null state and rewrite history (must stay before that effect).
    useLayoutEffect(() => {
        try {
            const p = getMeetingNotesRouteSearchParams();
            const m = normalizeMonthKeyInput(p.get('month'));
            const w = p.get('week');
            if (m) {
                setSelectedMonth((prev) => (prev !== m ? m : prev));
            }
            if (w) {
                setSelectedWeek((prev) => (prev !== w ? w : prev));
            }
        } catch (e) {
            /* ignore */
        }
    }, [deepLinkNonce]);

    // Update URL when month or week changes (merge with existing URL so first paint does not strip ?month=/?week= before state hydrates)
    useEffect(() => {
        const locParams = getMeetingNotesRouteSearchParams();
        const urlMonthRaw = locParams.get('month');
        const urlWeekRaw = locParams.get('week');
        const urlMonthNorm = urlMonthRaw ? normalizeMonthKeyInput(urlMonthRaw) : null;

        const monthForUrl = selectedMonth || urlMonthNorm || '';
        const weekForUrl = selectedWeek || urlWeekRaw || '';

        const sp = new URLSearchParams();
        sp.set('tab', 'meeting-notes');
        sp.set('team', 'management');
        if (monthForUrl) sp.set('month', monthForUrl);
        if (weekForUrl) sp.set('week', weekForUrl);
        const qs = sp.toString();
        const hash = window.location.hash || '';
        if (hash.startsWith('#/teams')) {
            const newHash = `#/teams/management?${qs}`;
            const next = `${window.location.pathname}${window.location.search || ''}${newHash}`;
            window.history.pushState(
                { month: monthForUrl || selectedMonth, week: weekForUrl || selectedWeek, tab: 'meeting-notes' },
                '',
                next
            );
        } else {
            const url = new URL(window.location.href);
            if (monthForUrl) {
                url.searchParams.set('month', monthForUrl);
            } else {
                url.searchParams.delete('month');
            }
            if (weekForUrl) {
                url.searchParams.set('week', weekForUrl);
            } else {
                url.searchParams.delete('week');
            }
            if (url.searchParams.get('tab') !== 'meeting-notes') {
                url.searchParams.set('tab', 'meeting-notes');
            }
            if (url.searchParams.get('team') !== 'management') {
                url.searchParams.set('team', 'management');
            }
            window.history.pushState(
                { month: monthForUrl || selectedMonth, week: weekForUrl || selectedWeek, tab: 'meeting-notes' },
                '',
                url
            );
        }
    }, [selectedMonth, selectedWeek]);
    
    // Listen for browser back/forward
    useEffect(() => {
        const handlePopState = (event) => {
            if (event.state) {
                if (event.state.month) {
                    setSelectedMonth(event.state.month);
                }
                if (event.state.week) {
                    setSelectedWeek(event.state.week);
                }
            } else {
                // Read from URL
                const monthFromURL = getMonthFromURL();
                const weekFromURL = getWeekFromURL();
                if (monthFromURL) setSelectedMonth(monthFromURL);
                if (weekFromURL) setSelectedWeek(weekFromURL);
            }
        };
        
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);
    const [users, setUsers] = useState([]);
    const [isReady, setIsReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false); // Separate state for save operations
    const [newMonthKey, setNewMonthKey] = useState('');
    const [newWeekStartInput, setNewWeekStartInput] = useState('');
    // Modal states
    const [showAllocationModal, setShowAllocationModal] = useState(false);
    const [showActionItemModal, setShowActionItemModal] = useState(false);
    const [showCommentModal, setShowCommentModal] = useState(false);
    const [editingActionItem, setEditingActionItem] = useState(null);
    const [commentContext, setCommentContext] = useState(null); // {type: 'monthly'|'department'|'action', id: string}
    
    // Attachment states
    const [uploadingAttachments, setUploadingAttachments] = useState({}); // { [departmentNotesId]: true/false }
    const [uploadingGeneralMinutesAttachments, setUploadingGeneralMinutesAttachments] = useState({}); // { [weeklyNotesId]: boolean }
    const [attachmentInputs, setAttachmentInputs] = useState({}); // { [departmentNotesId]: FileList }
    
    // State for tracking editing status and temporary values for each field
    const [editingFields, setEditingFields] = useState({}); // { [departmentNotesId-field]: true/false }
    const [tempFieldValues, setTempFieldValues] = useState({}); // { [departmentNotesId-field]: value }
    
    // Auto-save state - tracks save status per department for visual feedback
    // 'idle' = no changes, 'saving' = currently saving, 'saved' = recently saved, 'error' = save failed
    const [autoSaveStatus, setAutoSaveStatus] = useState({}); // { [departmentNotesId]: 'idle' | 'saving' | 'saved' | 'error' }
    const [presenceViewers, setPresenceViewers] = useState([]);
    
    // Refs for auto-save debouncing
    const autoSaveTimers = useRef({}); // { [departmentNotesId]: timeoutId }
    const AUTO_SAVE_DELAY = 1000; // 1 second delay after last keystroke (Google Docs style)
    const savedStatusTimers = useRef({}); // { [departmentNotesId]: timeoutId } - for clearing "Saved" status
    const generalMinutesTimers = useRef({});
    const generalMinutesEditingWeekIdRef = useRef(null);
    const generalMinutesValuesRef = useRef({});
    const monthlyGoalsEditingDeptIdRef = useRef(null);
    const monthlyGoalsSaveTimers = useRef(null);
    /** While set, live poll keeps local values for this department note field. */
    const deptFieldFocusRef = useRef(null);
    const editingActionItemRef = useRef(null);
    const showAllocationModalRef = useRef(false);
    const uploadingAttachmentsRef = useRef({});
    const lastLivePayloadSigRef = useRef('');
    const liveFetchInFlightRef = useRef(false);
    const gmMinuteInlinePopoverRef = useRef(null);
    const uploadingGeneralMinutesAttachmentsRef = useRef({});

    useEffect(() => {
        lastLivePayloadSigRef.current = '';
    }, [selectedMonth]);

    useEffect(() => {
        editingActionItemRef.current = editingActionItem;
    }, [editingActionItem]);

    useEffect(() => {
        showAllocationModalRef.current = showAllocationModal;
    }, [showAllocationModal]);

    useEffect(() => {
        uploadingAttachmentsRef.current = uploadingAttachments;
    }, [uploadingAttachments]);

    const lastSavedGeneralMinutesHash = useRef({});
    /** Google Docs–style: selection in general minutes → floating comment chip + compose. */
    const [gmMinuteInlinePopover, setGmMinuteInlinePopover] = useState(null);

    useEffect(() => {
        gmMinuteInlinePopoverRef.current = gmMinuteInlinePopover;
    }, [gmMinuteInlinePopover]);

    useEffect(() => {
        uploadingGeneralMinutesAttachmentsRef.current = uploadingGeneralMinutesAttachments;
    }, [uploadingGeneralMinutesAttachments]);
    /** Clicking a highlight in the editor focuses that thread in the right sidebar. */
    const [gmSidebarFocusThreadId, setGmSidebarFocusThreadId] = useState(null);
    /** General minutes comment threads panel (xl: right column). Persisted so preference survives reload. */
    const [gmCommentsSidebarVisible, setGmCommentsSidebarVisible] = useState(() => {
        try {
            return typeof localStorage !== 'undefined' && localStorage.getItem('managementMeetingGmCommentsSidebar') !== '0';
        } catch (_) {
            return true;
        }
    });
    const setGmCommentsSidebarVisiblePersisted = useCallback((next) => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('managementMeetingGmCommentsSidebar', next ? '1' : '0');
            }
        } catch (_) {
            /* ignore */
        }
        setGmCommentsSidebarVisible(!!next);
    }, []);
    /** First grid column (monthly goals + per-dept month targets). Persisted. */
    const [meetingNotesMonthlyGoalsColumnVisible, setMeetingNotesMonthlyGoalsColumnVisible] = useState(() => {
        try {
            return typeof localStorage !== 'undefined' && localStorage.getItem('managementMeetingMonthlyGoalsColumn') !== '0';
        } catch (_) {
            return true;
        }
    });
    const setMeetingNotesMonthlyGoalsColumnVisiblePersisted = useCallback((next) => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('managementMeetingMonthlyGoalsColumn', next ? '1' : '0');
            }
        } catch (_) {
            /* ignore */
        }
        setMeetingNotesMonthlyGoalsColumnVisible(!!next);
    }, []);
    const [isMeetingNotesMobile, setIsMeetingNotesMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
    );
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const apply = () => setIsMeetingNotesMobile(mq.matches);
        apply();
        mq.addEventListener('change', apply);
        return () => mq.removeEventListener('change', apply);
    }, []);
    const [mobileActiveDepartmentId, setMobileActiveDepartmentId] = useState(() => {
        try {
            const stored = typeof localStorage !== 'undefined' && localStorage.getItem('managementMeetingMobileDept');
            if (stored && DEPARTMENTS.some((d) => d.id === stored)) {
                return stored;
            }
        } catch (_) {
            /* ignore */
        }
        return DEPARTMENTS[0]?.id || 'management';
    });
    const setMobileActiveDepartmentIdPersisted = useCallback((deptId) => {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('managementMeetingMobileDept', deptId);
            }
        } catch (_) {
            /* ignore */
        }
        setMobileActiveDepartmentId(deptId);
    }, []);
    const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
    useEffect(() => {
        if (!mobileHeaderMenuOpen) {
            return undefined;
        }
        const onDocMouseDown = (e) => {
            if (e.target.closest && !e.target.closest('[data-meeting-notes-mobile-header-menu]')) {
                setMobileHeaderMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocMouseDown, true);
        return () => document.removeEventListener('mousedown', onDocMouseDown, true);
    }, [mobileHeaderMenuOpen]);
    // { weeklyNotesId, weekKey, start, end, quote, phase: 'chip'|'compose', top, left }
    
    // Refs for cursor position preservation
    const savedCursorPositions = useRef({}); // { [fieldKey]: { start: number, end: number, element: HTMLElement } }

    const weekCardRefs = useRef({});
    /** Body grid horizontal scroller (week cells + `data-management-meeting-week` live here). */
    const meetingNotesHorizontalScrollRef = useRef(null);
    /** Header row horizontal scroller — kept in sync with body so dates align while sticky stays viewport-bound. */
    const meetingNotesHeaderScrollRef = useRef(null);
    /** Avoid feedback when programmatically syncing header/body `scrollLeft`. */
    const meetingNotesScrollSyncProgrammaticRef = useRef(false);
    // Ref to store scroll position that needs to be preserved after state updates
    const preservedScrollPosition = useRef(null);
    
    // Ref to track previous weeks array keys to avoid unnecessary validation
    const previousWeekKeysRef = useRef(null);
    /** After auto-week for `month|weeksNavSignature`, skip until that signature changes. */
    const meetingNotesAutoWeekAppliedSigRef = useRef('');
    /** Horizontal scroll-to-week column: only on full document reload (once), or one deep-link when `?week=` matches. Week tabs call scrollToWeekId themselves. */
    const meetingNotesUrlWeekHorizontalScrollDoneRef = useRef(false);
    const meetingNotesReloadWeekScrollConsumedRef = useRef(false);
    
    // Effect to restore scroll position after explicit save operations
    // Only triggers when scrollRestoreTrigger changes (not on every data update)
    useEffect(() => {
        if (preservedScrollPosition.current !== null) {
            const scrollY = preservedScrollPosition.current;
            console.log('🔄 Restoring scroll position:', scrollY);
            
            // Helper to check if scroll is restored and clear if so
            const checkAndClear = () => {
                const currentScroll = window.scrollY || window.pageYOffset;
                // If scroll is within 5px of target, consider it restored
                if (Math.abs(currentScroll - scrollY) < 5) {
                    console.log('✅ Scroll position restored successfully:', currentScroll);
                    preservedScrollPosition.current = null;
                    return true;
                }
                return false;
            };
            
            // Aggressive restoration with multiple attempts using instant behavior
            // Immediate restoration
            window.scrollTo({ top: scrollY, behavior: 'instant' });
            if (checkAndClear()) return;
            
            // Restore after next paint
            requestAnimationFrame(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            });
            
            // Restore after a short delay (for async state updates)
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 0);
            
            // Restore after a longer delay (for DOM updates)
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 10);
            
            // Restore after React has finished rendering
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 50);
            
            // Restore after more time for delayed state updates
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 100);
            
            // Additional restoration attempts for stubborn cases
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 200);
            
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                if (checkAndClear()) return;
            }, 300);
            
            // Final restoration attempt - clear after this regardless
            setTimeout(() => {
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                preservedScrollPosition.current = null;
            }, 500);
        }
    }, [scrollRestoreTrigger]); // Only depend on scrollRestoreTrigger, not on data updates

    const reloadMonthlyNotes = useCallback(async (preferredMonthKey = null, preserveScroll = false) => {
        // Preserve scroll position if requested
        const currentScrollPosition = preserveScroll ? (window.scrollY || window.pageYOffset) : null;
        
        try {
            const response = await window.DatabaseAPI.getMeetingNotes();
            const notes =
                response?.data?.monthlyNotes ||
                response?.monthlyNotes ||
                [];

            setMonthlyNotesList(notes);

            if (!notes.length) {
                setSelectedMonth(null);
                setCurrentMonthlyNotes(null);
                setSelectedWeek(null);
                // Restore scroll position if preserved
                if (preserveScroll && currentScrollPosition !== null) {
                    requestAnimationFrame(() => {
                        window.scrollTo(0, currentScrollPosition);
                    });
                }
                return;
            }

            const urlMonthCandidate = normalizeMonthKeyInput(getMeetingNotesRouteSearchParams().get('month'));
            const calendarMonthKey = getMonthKeyFromDate(new Date());
            const nextMonthKey = (() => {
                if (preferredMonthKey && notes.some((note) => note?.monthKey === preferredMonthKey)) {
                    return preferredMonthKey;
                }
                if (urlMonthCandidate && notes.some((note) => note?.monthKey === urlMonthCandidate)) {
                    return urlMonthCandidate;
                }
                const fromState = selectedMonthRef.current;
                if (fromState && notes.some((note) => note?.monthKey === fromState)) {
                    return fromState;
                }
                if (calendarMonthKey && notes.some((note) => note?.monthKey === calendarMonthKey)) {
                    return calendarMonthKey;
                }
                return notes[0].monthKey;
            })();

            setSelectedMonth(nextMonthKey);
            const nextMonth = notes.find((note) => note?.monthKey === nextMonthKey) || null;
            
            // CRITICAL: If we're reloading the same month that's already loaded with weeks,
            // preserve the existing currentMonthlyNotes to avoid losing weeklyNotes data.
            // Only update if the month changed or if current data doesn't have weeklyNotes
            if (nextMonth) {
                const currentMonthKey = currentMonthlyNotes?.monthKey;
                const hasExistingWeeks = currentMonthlyNotes?.weeklyNotes && 
                    Array.isArray(currentMonthlyNotes.weeklyNotes) && 
                    currentMonthlyNotes.weeklyNotes.length > 0;
                
                if (nextMonthKey === currentMonthKey && hasExistingWeeks) {
                    // Same month and we already have weeks loaded - preserve existing data
                    console.log('🔄 Preserving existing monthly notes with weeks data');
                    // Still update the monthlyNotesList but keep currentMonthlyNotes
                } else {
                    // Different month or no weeks loaded - check if we need to load full data
                    const hasWeeklyNotes = nextMonth.weeklyNotes && 
                        Array.isArray(nextMonth.weeklyNotes) && 
                        nextMonth.weeklyNotes.length > 0;
                    
                    if (!hasWeeklyNotes && nextMonthKey) {
                        // Load full month data to get weeklyNotes
                        console.log(`📥 Loading full month data for ${nextMonthKey} to get weeklyNotes`);
                        try {
                            const fullMonthResponse = await window.DatabaseAPI.getMeetingNotes(nextMonthKey);
                            const fullMonthData = fullMonthResponse?.data?.monthlyNotes || fullMonthResponse?.monthlyNotes;
                            if (fullMonthData) {
                                setCurrentMonthlyNotes(fullMonthData);
                                // Update the monthlyNotesList with the full data too
                                setMonthlyNotesList(prev => {
                                    const list = Array.isArray(prev) ? [...prev] : [];
                                    const existingIndex = list.findIndex(note => note?.monthKey === nextMonthKey);
                                    if (existingIndex >= 0) {
                                        list[existingIndex] = fullMonthData;
                                    } else {
                                        list.push(fullMonthData);
                                    }
                                    return list;
                                });
                            } else {
                                setCurrentMonthlyNotes(nextMonth);
                            }
                        } catch (error) {
                            console.error('Error loading full month data:', error);
                            setCurrentMonthlyNotes(nextMonth);
                        }
                    } else {
                        setCurrentMonthlyNotes(nextMonth);
                    }
                }
            } else {
                setCurrentMonthlyNotes(null);
            }
            setSelectedWeek(null);
            
            // Restore scroll position after state updates if preserved - AGGRESSIVE with multiple attempts
            if (preserveScroll && currentScrollPosition !== null && currentScrollPosition > 0) {
                // Immediate restoration
                window.scrollTo(0, currentScrollPosition);
                
                requestAnimationFrame(() => {
                    window.scrollTo(0, currentScrollPosition);
                });
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 0);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 10);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 50);
                
                    setTimeout(() => {
                        window.scrollTo(0, currentScrollPosition);
                    }, 100);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 200);
                
                setTimeout(() => {
                    window.scrollTo(0, currentScrollPosition);
                }, 500);
            }
        } catch (error) {
            console.error('Error reloading monthly notes:', error);
            // Restore scroll position even on error if preserved
            if (preserveScroll && currentScrollPosition !== null) {
                requestAnimationFrame(() => {
                    window.scrollTo(0, currentScrollPosition);
                });
            }
            if (typeof alert === 'function') {
                console.error('Failed to refresh monthly meeting notes.');
            }
        }
    }, []);

    const updateDepartmentNotesLocal = useCallback(
        (departmentNotesId, field, value, monthlyId) => {
            const applyUpdate = (note) => {
                if (!note) {
                    return note;
                }

                const weeklyNotes = Array.isArray(note.weeklyNotes)
                    ? note.weeklyNotes.map((week) => ({
                          ...week,
                          departmentNotes: Array.isArray(week.departmentNotes)
                              ? week.departmentNotes.map((deptNote) =>
                                    deptNote?.id === departmentNotesId ? { ...deptNote, [field]: value } : deptNote
                                )
                              : week.departmentNotes
                      }))
                    : note.weeklyNotes;
                return { ...note, weeklyNotes };
            };

            setCurrentMonthlyNotes((prev) => (prev ? applyUpdate(prev) : prev));

            if (monthlyId) {
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) {
                        return prev;
                    }
                    return prev.map((note) => (note?.id === monthlyId ? applyUpdate(note) : note));
                });
            }
        },
        []
    );

    // Batched version to update multiple fields at once (prevents multiple re-renders)
    const updateDepartmentNotesLocalBatched = useCallback(
        (departmentNotesId, updates, monthlyId) => {
            const applyUpdates = (note) => {
                if (!note) {
                    return note;
                }

                const weeklyNotes = Array.isArray(note.weeklyNotes)
                    ? note.weeklyNotes.map((week) => ({
                          ...week,
                          departmentNotes: Array.isArray(week.departmentNotes)
                              ? week.departmentNotes.map((deptNote) =>
                                    deptNote?.id === departmentNotesId 
                                        ? { ...deptNote, ...updates } 
                                        : deptNote
                                )
                              : week.departmentNotes
                      }))
                    : note.weeklyNotes;
                return { ...note, weeklyNotes };
            };

            setCurrentMonthlyNotes((prev) => (prev ? applyUpdates(prev) : prev));

            if (monthlyId) {
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) {
                        return prev;
                    }
                    return prev.map((note) => (note?.id === monthlyId ? applyUpdates(note) : note));
                });
            }
        },
        []
    );

    const updateWeeklyNotesLocal = useCallback((weeklyNotesId, partial, monthlyId) => {
        const applyUpdate = (note) => {
            if (!note) {
                return note;
            }
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) =>
                      week?.id === weeklyNotesId ? { ...week, ...partial } : week
                  )
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyUpdate(prev) : prev));

        if (monthlyId) {
            setMonthlyNotesList((prev) => {
                if (!Array.isArray(prev)) {
                    return prev;
                }
                return prev.map((n) => (n?.id === monthlyId ? applyUpdate(n) : n));
            });
        }
    }, []);

    const persistGeneralMinutesThreads = useCallback(
        async (weeklyNotesId, nextThreads) => {
            if (!weeklyNotesId || !window.DatabaseAPI?.updateWeeklyNotes) {
                return;
            }
            const monthlyId = currentMonthlyNotes?.id || null;
            const htmlFromRef = generalMinutesValuesRef.current[weeklyNotesId];
            const weekSnap = currentMonthlyNotes?.weeklyNotes?.find((w) => w.id === weeklyNotesId);
            const html =
                htmlFromRef !== undefined && htmlFromRef !== null ? htmlFromRef : weekSnap?.generalMinutes ?? '';
            const plain = gmHtmlToPlainText(typeof html === 'string' ? html : '');
            const reconciled = gmReconcileThreadsWithPlain(nextThreads, plain).map(({ anchorStale, ...t }) => t);
            await window.DatabaseAPI.updateWeeklyNotes(weeklyNotesId, { generalMinutesThreads: reconciled });
            updateWeeklyNotesLocal(weeklyNotesId, { generalMinutesThreads: reconciled }, monthlyId);
        },
        [currentMonthlyNotes, updateWeeklyNotesLocal]
    );

    const submitGmMinuteInlineComment = useCallback(
        async (commentText) => {
            const pop = gmMinuteInlinePopover;
            if (!pop || pop.phase !== 'compose' || !commentText?.trim()) {
                return;
            }
            const w = currentMonthlyNotes?.weeklyNotes?.find((x) => x.id === pop.weeklyNotesId);
            if (!w) {
                setGmMinuteInlinePopover(null);
                return;
            }
            const wid = pop.weeklyNotesId;
            if (generalMinutesTimers.current[wid]) {
                clearTimeout(generalMinutesTimers.current[wid]);
                delete generalMinutesTimers.current[wid];
            }
            const monthlyId = currentMonthlyNotes?.id || null;
            const existing = gmParseInlineThreadsRaw(w?.generalMinutesThreads);
            const user = window.storage?.getUserInfo?.() || {};
            const msg = {
                id: gmGenInlineMsgId(),
                text: commentText.trim(),
                createdAt: new Date().toISOString(),
                authorId: user.id || user.userId || '',
                authorName: user.name || user.displayName || 'User',
                authorEmail: user.email || ''
            };
            const threadId = gmGenInlineThreadId();
            const next = [
                ...existing,
                {
                    id: threadId,
                    start: pop.start,
                    end: pop.end,
                    quote: pop.quote,
                    resolved: false,
                    messages: [msg]
                }
            ];

            let generalMinutesUpdate;
            const host =
                typeof document !== 'undefined'
                    ? document.querySelector(`[data-gm-editor-host="${String(pop.weeklyNotesId)}"]`)
                    : null;
            const editor = host?.querySelector('[contenteditable="true"]');
            if (editor && pop.editorKind === 'richtext') {
                editor.focus();
                gmSetSelectionByPlainOffsets(editor, pop.start, pop.end);
                if (wrapGmThreadRangeFromSelection(threadId)) {
                    generalMinutesUpdate = editor.innerHTML;
                    generalMinutesValuesRef.current[pop.weeklyNotesId] = generalMinutesUpdate;
                }
            }

            const htmlForPlain =
                generalMinutesUpdate !== undefined
                    ? generalMinutesUpdate
                    : generalMinutesValuesRef.current[pop.weeklyNotesId] !== undefined
                      ? generalMinutesValuesRef.current[pop.weeklyNotesId]
                      : w.generalMinutes ?? '';
            const plain = window.RichTextEditor ? gmHtmlToPlainText(htmlForPlain) : String(htmlForPlain || '');
            const reconciled = gmReconcileThreadsWithPlain(next, plain).map(({ anchorStale, ...t }) => t);

            if (generalMinutesUpdate === undefined && window.RichTextEditor) {
                const baseHtml = typeof htmlForPlain === 'string' ? htmlForPlain : '';
                const mergedHtml = gmEnsureThreadAnchorsInHtml(baseHtml, reconciled);
                if (mergedHtml !== baseHtml) {
                    generalMinutesUpdate = mergedHtml;
                    generalMinutesValuesRef.current[pop.weeklyNotesId] = mergedHtml;
                    if (editor && pop.editorKind === 'richtext') {
                        editor.innerHTML = mergedHtml;
                    }
                    gmDisplayHtmlCache.delete(pop.weeklyNotesId);
                }
            }

            const payload = { generalMinutesThreads: reconciled };
            if (generalMinutesUpdate !== undefined) {
                payload.generalMinutes = generalMinutesUpdate;
            }
            await window.DatabaseAPI.updateWeeklyNotes(pop.weeklyNotesId, payload);
            if (generalMinutesUpdate !== undefined) {
                lastSavedGeneralMinutesHash.current[pop.weeklyNotesId] = generalMinutesUpdate;
            }
            const localPartial = { generalMinutesThreads: reconciled };
            if (generalMinutesUpdate !== undefined) {
                localPartial.generalMinutes = generalMinutesUpdate;
            }
            updateWeeklyNotesLocal(pop.weeklyNotesId, localPartial, monthlyId);

            const title = `General minutes (${selectedMonth || ''} · ${pop.weekKey || 'week'})`;
            const link = `${window.location.origin}${window.location.pathname}${window.location.search}#/teams/management?tab=meeting-notes&team=management&month=${encodeURIComponent(
                selectedMonth || ''
            )}&week=${encodeURIComponent(pop.weekKey || '')}`;
            void gmNotifyInlineCommentMentions(commentText.trim(), {
                contextTitle: title,
                contextLink: link,
                authorName: msg.authorName || msg.authorEmail || 'Someone'
            });
            setGmMinuteInlinePopover(null);
        },
        [gmMinuteInlinePopover, currentMonthlyNotes, selectedMonth, updateWeeklyNotesLocal]
    );

    const replyGmMinuteThread = useCallback(
        async (weeklyNotesId, threadId, commentText, weekKeyForLink) => {
            if (!commentText?.trim()) {
                return;
            }
            const w = currentMonthlyNotes?.weeklyNotes?.find((x) => x.id === weeklyNotesId);
            const existing = gmParseInlineThreadsRaw(w?.generalMinutesThreads);
            const user = window.storage?.getUserInfo?.() || {};
            const msg = {
                id: gmGenInlineMsgId(),
                text: commentText.trim(),
                createdAt: new Date().toISOString(),
                authorId: user.id || user.userId || '',
                authorName: user.name || user.displayName || 'User',
                authorEmail: user.email || ''
            };
            const next = existing.map((t) =>
                t.id === threadId ? { ...t, messages: [...(t.messages || []), msg] } : t
            );
            await persistGeneralMinutesThreads(weeklyNotesId, next);
            const title = `General minutes (${selectedMonth || ''} · ${weekKeyForLink || 'week'})`;
            const link = `${window.location.origin}${window.location.pathname}${window.location.search}#/teams/management?tab=meeting-notes&team=management&month=${encodeURIComponent(
                selectedMonth || ''
            )}&week=${encodeURIComponent(weekKeyForLink || '')}`;
            void gmNotifyInlineCommentMentions(commentText.trim(), {
                contextTitle: title,
                contextLink: link,
                authorName: msg.authorName || msg.authorEmail || 'Someone'
            });
        },
        [currentMonthlyNotes, persistGeneralMinutesThreads, selectedMonth]
    );

    const toggleGmMinuteThreadResolved = useCallback(
        async (weeklyNotesId, threadId, resolved) => {
            const w = currentMonthlyNotes?.weeklyNotes?.find((x) => x.id === weeklyNotesId);
            const existing = gmParseInlineThreadsRaw(w?.generalMinutesThreads);
            const next = existing.map((t) => (t.id === threadId ? { ...t, resolved: !!resolved } : t));

            const monthlyId = currentMonthlyNotes?.id || null;
            const host =
                typeof document !== 'undefined'
                    ? document.querySelector(`[data-gm-editor-host="${String(weeklyNotesId)}"]`)
                    : null;
            const editor = host?.querySelector('[contenteditable="true"]');
            let generalMinutesUpdate;
            if (editor) {
                editor.querySelectorAll(`span[data-gm-thread-id="${String(threadId)}"]`).forEach((el) => {
                    if (resolved) {
                        el.classList.add('gm-thread-resolved');
                    } else {
                        el.classList.remove('gm-thread-resolved');
                    }
                });
                generalMinutesUpdate = editor.innerHTML;
                generalMinutesValuesRef.current[weeklyNotesId] = generalMinutesUpdate;
                lastSavedGeneralMinutesHash.current[weeklyNotesId] = generalMinutesUpdate;
            }

            const htmlForPlain =
                generalMinutesUpdate !== undefined
                    ? generalMinutesUpdate
                    : generalMinutesValuesRef.current[weeklyNotesId] !== undefined
                      ? generalMinutesValuesRef.current[weeklyNotesId]
                      : w?.generalMinutes ?? '';
            const plain = window.RichTextEditor ? gmHtmlToPlainText(htmlForPlain) : String(htmlForPlain || '');
            const reconciled = gmReconcileThreadsWithPlain(next, plain).map(({ anchorStale, ...t }) => t);

            const payload = { generalMinutesThreads: reconciled };
            if (generalMinutesUpdate !== undefined) {
                payload.generalMinutes = generalMinutesUpdate;
            }
            await window.DatabaseAPI.updateWeeklyNotes(weeklyNotesId, payload);
            const localPartial = { generalMinutesThreads: reconciled };
            if (generalMinutesUpdate !== undefined) {
                localPartial.generalMinutes = generalMinutesUpdate;
            }
            updateWeeklyNotesLocal(weeklyNotesId, localPartial, monthlyId);
        },
        [currentMonthlyNotes, updateWeeklyNotesLocal]
    );

    const deleteGmMinuteThread = useCallback(
        async (weeklyNotesId, threadId) => {
            if (!weeklyNotesId || !threadId) {
                return;
            }
            if (!window.confirm('Delete this comment thread and remove its highlight from the minutes?')) {
                return;
            }
            const w = currentMonthlyNotes?.weeklyNotes?.find((x) => x.id === weeklyNotesId);
            if (!w) {
                return;
            }
            const monthlyId = currentMonthlyNotes?.id || null;
            const existing = gmParseInlineThreadsRaw(w?.generalMinutesThreads);
            const next = existing.filter((th) => th.id !== threadId);

            const host =
                typeof document !== 'undefined'
                    ? document.querySelector(`[data-gm-editor-host="${String(weeklyNotesId)}"]`)
                    : null;
            const editor = host?.querySelector('[contenteditable="true"]');
            let generalMinutesUpdate;
            if (editor) {
                gmUnwrapThreadSpansInElement(editor, threadId);
                generalMinutesUpdate = editor.innerHTML;
                generalMinutesValuesRef.current[weeklyNotesId] = generalMinutesUpdate;
                lastSavedGeneralMinutesHash.current[weeklyNotesId] = generalMinutesUpdate;
            } else {
                const htmlFromRef = generalMinutesValuesRef.current[weeklyNotesId];
                const base =
                    htmlFromRef !== undefined && htmlFromRef !== null ? htmlFromRef : String(w.generalMinutes ?? '');
                const stripped = gmStripThreadSpansFromHtmlString(base, threadId);
                if (stripped !== base) {
                    generalMinutesUpdate = stripped;
                    generalMinutesValuesRef.current[weeklyNotesId] = stripped;
                    lastSavedGeneralMinutesHash.current[weeklyNotesId] = stripped;
                }
            }

            const htmlForPlain =
                generalMinutesUpdate !== undefined
                    ? generalMinutesUpdate
                    : generalMinutesValuesRef.current[weeklyNotesId] !== undefined
                      ? generalMinutesValuesRef.current[weeklyNotesId]
                      : w?.generalMinutes ?? '';
            const plain = window.RichTextEditor ? gmHtmlToPlainText(htmlForPlain) : String(htmlForPlain || '');
            const reconciled = gmReconcileThreadsWithPlain(next, plain).map(({ anchorStale, ...th }) => th);

            const payload = { generalMinutesThreads: reconciled };
            if (generalMinutesUpdate !== undefined) {
                payload.generalMinutes = generalMinutesUpdate;
            }
            await window.DatabaseAPI.updateWeeklyNotes(weeklyNotesId, payload);
            const localPartial = { generalMinutesThreads: reconciled };
            if (generalMinutesUpdate !== undefined) {
                localPartial.generalMinutes = generalMinutesUpdate;
            }
            updateWeeklyNotesLocal(weeklyNotesId, localPartial, monthlyId);
            setGmSidebarFocusThreadId((cur) => (cur === threadId ? null : cur));
        },
        [currentMonthlyNotes, updateWeeklyNotesLocal]
    );

    const handleGmEditorHostMouseUp = useCallback((e, week, gmIdentifier) => {
        if (!week?.id) {
            return;
        }
        const host = e.currentTarget;
        requestAnimationFrame(() => {
            const editor = host.querySelector('[contenteditable="true"]');
            if (editor) {
                const cap = gmCaptureSelectionInEditor(editor);
                if (!cap) {
                    setGmMinuteInlinePopover((p) => (p?.weeklyNotesId === week.id ? null : p));
                    return;
                }
                const r = cap.rect;
                setGmMinuteInlinePopover({
                    weeklyNotesId: week.id,
                    weekKey: gmIdentifier,
                    start: cap.start,
                    end: cap.end,
                    quote: cap.quote,
                    phase: 'chip',
                    top: r.bottom + 6,
                    left: Math.min(window.innerWidth - 220, Math.max(8, r.left)),
                    editorKind: 'richtext'
                });
                return;
            }
            const ta = host.querySelector('textarea');
            if (ta) {
                const cap = gmCaptureSelectionTextarea(ta);
                if (!cap) {
                    setGmMinuteInlinePopover((p) => (p?.weeklyNotesId === week.id ? null : p));
                    return;
                }
                const r2 = ta.getBoundingClientRect();
                setGmMinuteInlinePopover({
                    weeklyNotesId: week.id,
                    weekKey: gmIdentifier,
                    start: cap.start,
                    end: cap.end,
                    quote: cap.quote,
                    phase: 'chip',
                    top: r2.bottom + 6,
                    left: Math.min(window.innerWidth - 220, Math.max(8, r2.left)),
                    editorKind: 'textarea'
                });
            }
        });
    }, []);

    useEffect(() => {
        if (!gmMinuteInlinePopover) {
            return undefined;
        }
        const onDocDown = (e) => {
            if (e.target?.closest?.('[data-gm-minute-inline-popover]')) {
                return;
            }
            setGmMinuteInlinePopover(null);
        };
        document.addEventListener('mousedown', onDocDown, true);
        return () => document.removeEventListener('mousedown', onDocDown, true);
    }, [gmMinuteInlinePopover]);

    useEffect(() => {
        setGmMinuteInlinePopover(null);
    }, [selectedMonth]);

    // Initialize selected month:
    // - Respect an explicit month in the URL (for shared links / navigation)
    // - Otherwise, default to the current calendar month (including full reload)
    useEffect(() => {
        try {
            const monthFromURL = getMonthFromURL();
            
            if (monthFromURL) {
                const normalizedFromURL = normalizeMonthKeyInput(monthFromURL);
                if (normalizedFromURL) {
                    setSelectedMonth(normalizedFromURL);
                    return;
                }
            }
            
            const now = new Date();
            const monthKey = getMonthKeyFromDate(now);
            if (monthKey) {
                setSelectedMonth(monthKey);
            }
        } catch (error) {
            console.warn('ManagementMeetingNotes: failed to initialize month, falling back to current month', error);
            const now = new Date();
            const monthKey = getMonthKeyFromDate(now);
            if (monthKey) {
                setSelectedMonth(monthKey);
            }
        }
    }, []);

    // Load users
    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        const loadUsers = async () => {
            try {
                if (window.DatabaseAPI) {
                    const response = await window.DatabaseAPI.getUsers();
                    const usersList = response.data?.users || response.data?.data?.users || [];
                    setUsers(usersList);
                }
            } catch (error) {
                console.error('Error loading users:', error);
            }
        };
        loadUsers();
    }, [isAdminUser]);

    // Load meeting notes
    useEffect(() => {
        if (!isAdminUser) {
            setIsReady(true);
            setLoading(false);
            return;
        }

        const loadMeetingNotes = async () => {
            try {
                setLoading(true);
                if (!window.DatabaseAPI) {
                    console.error('DatabaseAPI not available');
                    setIsReady(true);
                    return;
                }
                
                const response = await window.DatabaseAPI.getMeetingNotes();
                // Handle both response structures: { data: { monthlyNotes: [...] } } and { monthlyNotes: [...] }
                const notes = response?.data?.monthlyNotes || response?.monthlyNotes || [];
                
                console.log('📋 Loaded meeting notes:', {
                    totalMonths: notes.length,
                    monthKeys: notes.map(n => n?.monthKey).filter(Boolean),
                    responseStructure: {
                        hasData: !!response?.data,
                        hasMonthlyNotes: !!response?.data?.monthlyNotes,
                        hasDirectMonthlyNotes: !!response?.monthlyNotes
                    }
                });
                
                setMonthlyNotesList(notes);
                
                // Load current month's notes if selected
                if (selectedMonth) {
                    const currentNotes = notes.find(n => n?.monthKey === selectedMonth);
                    if (currentNotes) {
                        setCurrentMonthlyNotes(currentNotes);
                    } else {
                        setCurrentMonthlyNotes(null);
                    }
                }
                
                setIsReady(true);
            } catch (error) {
                console.error('❌ Error loading meeting notes:', error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    response: error.response
                });
                setIsReady(true);
            } finally {
                setLoading(false);
            }
        };
        loadMeetingNotes();
    }, [isAdminUser]);

    // Load current month's notes when selected month changes
    useEffect(() => {
        if (!isAdminUser) {
            return;
        }

        const loadCurrentMonth = async () => {
            if (!selectedMonth || !window.DatabaseAPI) return;
            
            // Check if we already have data for this month with weeks loaded
            const existingData = currentMonthlyNotes;
            const hasExistingWeeks = existingData?.monthKey === selectedMonth && 
                existingData?.weeklyNotes && 
                Array.isArray(existingData.weeklyNotes) && 
                existingData.weeklyNotes.length > 0;
            
            if (hasExistingWeeks) {
                console.log(`✅ Already have weeks data for ${selectedMonth}, skipping reload`);
                return;
            }
            
            try {
                setLoading(true);
                const response = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
                // Handle both response structures: { data: { monthlyNotes: {...} } } and { monthlyNotes: {...} }
                const notes = response?.data?.monthlyNotes || response?.monthlyNotes;
                
                if (notes) {
                    console.log(`✅ Loaded notes for ${selectedMonth}:`, {
                        monthKey: notes.monthKey,
                        hasWeeklyNotes: !!notes.weeklyNotes,
                        weeklyNotesType: typeof notes.weeklyNotes,
                        weeklyNotesIsArray: Array.isArray(notes.weeklyNotes),
                        weeklyNotesCount: Array.isArray(notes.weeklyNotes) ? notes.weeklyNotes.length : 0,
                        weeklyNotesKeys: Array.isArray(notes.weeklyNotes) 
                            ? notes.weeklyNotes.map(w => ({ 
                                id: w?.id, 
                                weekKey: w?.weekKey, 
                                weekStart: w?.weekStart 
                            }))
                            : 'Not an array',
                        fullWeeklyNotes: notes.weeklyNotes
                    });
                } else {
                    console.log(`ℹ️ No notes found for ${selectedMonth}`);
                }
                
                setCurrentMonthlyNotes(notes || null);
            } catch (error) {
                console.error(`❌ Error loading current month notes for ${selectedMonth}:`, error);
                console.error('Error details:', {
                    message: error.message,
                    stack: error.stack
                });
                setCurrentMonthlyNotes(null);
            } finally {
                setLoading(false);
            }
        };
        loadCurrentMonth();
    }, [selectedMonth, isAdminUser]);

    // Scroll to a comment when opened from a notification/email deep link (?meetingCommentId=)
    useEffect(() => {
        if (!isAdminUser || !currentMonthlyNotes) return undefined;
        const commentId = getMeetingNotesRouteSearchParams().get('meetingCommentId');
        if (!commentId) return undefined;
        const safe = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(commentId) : commentId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const t = window.setTimeout(() => {
            const el = document.querySelector(`[data-meeting-comment-id="${safe}"]`);
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 600);
        return () => clearTimeout(t);
    }, [isAdminUser, currentMonthlyNotes, selectedMonth, selectedWeek, deepLinkNonce, loading]);

    // Get available months
    const availableMonths = useMemo(() => {
        const months = monthlyNotesList.map(note => note.monthKey);
        return months.sort().reverse();
    }, [monthlyNotesList]);

    // Get weeks for selected month
    const weeks = useMemo(() => {
        if (!currentMonthlyNotes) {
            console.log('⚠️ No currentMonthlyNotes found');
            return [];
        }
        
        // Check for weeklyNotes in various possible locations
        let weeklyNotesArray = [];
        
        if (currentMonthlyNotes.weeklyNotes) {
            if (Array.isArray(currentMonthlyNotes.weeklyNotes)) {
                weeklyNotesArray = currentMonthlyNotes.weeklyNotes;
            } else if (typeof currentMonthlyNotes.weeklyNotes === 'object') {
                // If it's an object, try to convert it to an array
                weeklyNotesArray = Object.values(currentMonthlyNotes.weeklyNotes);
            }
        }
        
        // Also check if weeks are stored directly on the monthly notes object
        if (weeklyNotesArray.length === 0 && currentMonthlyNotes.weeks && Array.isArray(currentMonthlyNotes.weeks)) {
            weeklyNotesArray = currentMonthlyNotes.weeks;
        }
        
        console.log('📅 Processing weekly notes:', {
            hasCurrentMonthlyNotes: !!currentMonthlyNotes,
            hasWeeklyNotes: !!currentMonthlyNotes?.weeklyNotes,
            weeklyNotesType: typeof currentMonthlyNotes?.weeklyNotes,
            weeklyNotesIsArray: Array.isArray(currentMonthlyNotes?.weeklyNotes),
            weeklyNotesCount: weeklyNotesArray.length,
            weekKeys: weeklyNotesArray.map(w => w?.weekKey || w?.id || w?.week_key),
            weekStarts: weeklyNotesArray.map(w => w?.weekStart || w?.week_start),
            rawWeeklyNotes: currentMonthlyNotes.weeklyNotes,
            fullCurrentMonthlyNotes: currentMonthlyNotes
        });
        
        if (weeklyNotesArray.length === 0) {
            return [];
        }
        
        // Filter out any null/undefined weeks and ensure they have required fields
        const validWeeks = weeklyNotesArray.filter(week => {
            if (!week) return false;
            // A week is valid if it has either weekKey, id, or week_key
            return !!(week.weekKey || week.id || week.week_key);
        });
        
        // Normalize week data structure
        const normalizedWeeks = validWeeks.map(week => ({
            ...week,
            weekKey: week.weekKey || week.week_key || week.id,
            weekStart: week.weekStart || week.week_start,
            weekEnd: week.weekEnd || week.week_end,
            departmentNotes: week.departmentNotes || week.department_notes || []
        }));
        
        const sorted = [...normalizedWeeks].sort((a, b) => {
            const dateA = a.weekStart ? new Date(a.weekStart) : new Date(0);
            const dateB = b.weekStart ? new Date(b.weekStart) : new Date(0);
            return dateA - dateB;
        });
        
        console.log('✅ Final processed weeks:', {
            count: sorted.length,
            weekKeys: sorted.map(w => w.weekKey),
            weekStarts: sorted.map(w => w.weekStart)
        });
        
        return sorted;
    }, [currentMonthlyNotes]);

    const monthlyGoalsRef = useRef({});
    const monthlyGoalsByDepartment = useMemo(
        () => normalizeMonthlyGoalsByDepartment(currentMonthlyNotes?.monthlyGoals),
        [currentMonthlyNotes?.monthlyGoals]
    );

    useEffect(() => {
        monthlyGoalsRef.current = monthlyGoalsByDepartment;
    }, [monthlyGoalsByDepartment]);

    const updateMonthlyGoalsLocal = useCallback((serializedGoals) => {
        if (!currentMonthlyNotes?.id) return;
        setCurrentMonthlyNotes((prev) =>
            prev ? { ...prev, monthlyGoals: serializedGoals } : prev
        );
        setMonthlyNotesList((prev) =>
            prev.map((note) =>
                note?.id === currentMonthlyNotes.id
                    ? { ...note, monthlyGoals: serializedGoals }
                    : note
            )
        );
    }, [currentMonthlyNotes?.id]);

    const persistMonthlyGoals = useCallback(async (serializedGoals) => {
        if (!currentMonthlyNotes?.id) return;
        if (!window.DatabaseAPI?.updateMonthlyNotes) {
            console.warn('Meeting notes: updateMonthlyNotes API not available.');
            return;
        }
        try {
            await window.DatabaseAPI.updateMonthlyNotes(currentMonthlyNotes.id, { monthlyGoals: serializedGoals });
        } catch (error) {
            console.error('Failed to save monthly goals:', error);
        }
    }, [currentMonthlyNotes?.id]);

    const scheduleMonthlyGoalsPersist = useCallback(
        (serializedGoals) => {
            if (monthlyGoalsSaveTimers.current) {
                clearTimeout(monthlyGoalsSaveTimers.current);
            }
            monthlyGoalsSaveTimers.current = setTimeout(() => {
                void persistMonthlyGoals(serializedGoals);
                monthlyGoalsSaveTimers.current = null;
            }, AUTO_SAVE_DELAY);
        },
        [persistMonthlyGoals]
    );

    const handleMonthlyGoalsChange = useCallback(
        (departmentId, value) => {
            const nextGoals = { ...(monthlyGoalsRef.current || {}) };
            const normalizedValue = typeof value === 'string' ? value : '';
            if (normalizedValue.trim() === '') {
                delete nextGoals[departmentId];
            } else {
                nextGoals[departmentId] = normalizedValue;
            }
            const serialized = JSON.stringify(nextGoals);
            updateMonthlyGoalsLocal(serialized);
            scheduleMonthlyGoalsPersist(serialized);
        },
        [updateMonthlyGoalsLocal, scheduleMonthlyGoalsPersist]
    );

    const handleMonthlyGoalsBlur = useCallback(
        (departmentId, value) => {
            if (monthlyGoalsEditingDeptIdRef.current === departmentId) {
                monthlyGoalsEditingDeptIdRef.current = null;
            }
            if (monthlyGoalsSaveTimers.current) {
                clearTimeout(monthlyGoalsSaveTimers.current);
                monthlyGoalsSaveTimers.current = null;
            }
            const nextGoals = { ...(monthlyGoalsRef.current || {}) };
            const normalizedValue = typeof value === 'string' ? value : '';
            if (normalizedValue.trim() === '') {
                delete nextGoals[departmentId];
            } else {
                nextGoals[departmentId] = normalizedValue;
            }
            const serialized = JSON.stringify(nextGoals);
            updateMonthlyGoalsLocal(serialized);
            persistMonthlyGoals(serialized);
        },
        [persistMonthlyGoals, updateMonthlyGoalsLocal]
    );

    const getWeekIdentifier = (week) => {
        if (!week) {
            return '';
        }
        return week.weekKey || week.id || '';
    };

    /** Stable id list for scroll anchoring — avoids re-scrolling when weeks array reference changes but ids do not. */
    const weeksNavSignature = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            return '';
        }
        return weeks.map((week, index) => getWeekIdentifier(week) || `week-${index}`).join('|');
    }, [weeks]);

    // Before URL pushState + week useEffect: snap week so stale `?week=` cannot overwrite in the same tick.
    useLayoutEffect(() => {
        if (!selectedMonth || !Array.isArray(weeks) || weeks.length === 0 || !weeksNavSignature) {
            return;
        }
        const sig = `${selectedMonth}|${weeksNavSignature}`;
        if (initialPageWasNavigationReload) {
            meetingNotesAutoWeekAppliedSigRef.current = sig;
            return;
        }
        if (meetingNotesAutoWeekAppliedSigRef.current === sig) {
            return;
        }
        const preferredIdx = managementMeetingNotesPreferredWeekIndex(weeks);
        const selectedIdx = managementMeetingNotesFindWeekIndexInList(weeks, selectedWeek);
        const preferredId = managementMeetingNotesGetWeekIdForList(weeks[preferredIdx], preferredIdx);
        if (preferredId != null && selectedIdx !== preferredIdx) {
            setSelectedWeek(preferredId);
        }
        meetingNotesAutoWeekAppliedSigRef.current = sig;
    }, [weeks, selectedMonth, weeksNavSignature, selectedWeek, initialPageWasNavigationReload]);

    const selectedWeekObj = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0 || !selectedWeek) {
            return null;
        }
        const idx = managementMeetingNotesFindWeekIndexInList(weeks, selectedWeek);
        return idx >= 0 ? weeks[idx] : null;
    }, [weeks, selectedWeek]);

    /** Week whose general minutes are shown (falls back to first week when needed) */
    const weekForGeneralMinutes = selectedWeekObj ?? (weeks.length ? weeks[0] : null);

    /** Mobile: one week column + one department row; desktop: full grid. */
    const layoutWeeks = useMemo(() => {
        if (!isMeetingNotesMobile) {
            return weeks;
        }
        if (selectedWeekObj) {
            return [selectedWeekObj];
        }
        return weeks.length ? [weeks[0]] : [];
    }, [isMeetingNotesMobile, weeks, selectedWeekObj]);

    const layoutDepartments = useMemo(() => {
        if (!isMeetingNotesMobile) {
            return DEPARTMENTS;
        }
        const match = DEPARTMENTS.find((d) => d.id === mobileActiveDepartmentId);
        return match ? [match] : DEPARTMENTS.slice(0, 1);
    }, [isMeetingNotesMobile, mobileActiveDepartmentId]);

    const meetingNotesRteMobileProps = isMeetingNotesMobile
        ? { compact: true, autoGrow: true, maxEditorHeight: 'min(60vh, 520px)' }
        : {};

    /**
     * Presence room = whole month (not per selected week). Per-week keys split users who had
     * different week columns focused, so "Viewing now" looked empty even when both were on the page.
     */
    const meetingNotesRoomKey = useMemo(() => {
        if (!selectedMonth) {
            return null;
        }
        return `management-meeting-notes:${selectedMonth}`;
    }, [selectedMonth]);

    /** Presence list may include the signed-in user; facepile shows others only. */
    const presenceOthers = useMemo(() => {
        if (!Array.isArray(presenceViewers)) {
            return [];
        }
        const uid =
            currentUser?.id != null
                ? String(currentUser.id)
                : currentUser?.sub != null
                  ? String(currentUser.sub)
                  : null;
        if (!uid) {
            return presenceViewers;
        }
        return presenceViewers.filter((v) => String(v?.userId || '') !== uid);
    }, [presenceViewers, currentUser?.id, currentUser?.sub]);

    useEffect(() => {
        const id = weekForGeneralMinutes?.id;
        if (!id) {
            return;
        }
        if (generalMinutesEditingWeekIdRef.current === id) {
            return;
        }
        const gm = weekForGeneralMinutes?.generalMinutes ?? '';
        lastSavedGeneralMinutesHash.current[id] = gm;
    }, [weekForGeneralMinutes?.id, weekForGeneralMinutes?.generalMinutes]);

    /** Column 1 = monthly goals when visible; else week 0 starts at column 1. */
    const getWeekGridColumn = (weekIndex) =>
        isMeetingNotesMobile ? 1 : weekIndex + (meetingNotesMonthlyGoalsColumnVisible ? 2 : 1);
    const getMonthlyGoalsGridColumn = () => 1;
    const getDeptMonthlyGoalsGridRow = (deptIndex) =>
        isMeetingNotesMobile && meetingNotesMonthlyGoalsColumnVisible ? deptIndex * 2 + 2 : deptIndex + 2;
    const getDeptWeekNotesGridRow = (deptIndex) =>
        isMeetingNotesMobile
            ? meetingNotesMonthlyGoalsColumnVisible
                ? deptIndex * 2 + 3
                : deptIndex + 2
            : deptIndex + 2;

    /** Column 1 = monthly goals (slightly narrower); week columns stay wide for editors. */
    const meetingNotesMonthlyGoalsColumnWidth = isMeetingNotesMobile
        ? 'minmax(0, 1fr)'
        : 'minmax(400px, 460px)';
    const meetingNotesWeekColumnWidth = isMeetingNotesMobile
        ? 'minmax(0, 1fr)'
        : 'minmax(520px, 560px)';
    const meetingNotesMainGridTemplateColumns = isMeetingNotesMobile
        ? 'minmax(0, 1fr)'
        : meetingNotesMonthlyGoalsColumnVisible
          ? `${meetingNotesMonthlyGoalsColumnWidth} repeat(${layoutWeeks.length}, ${meetingNotesWeekColumnWidth})`
          : `repeat(${layoutWeeks.length}, ${meetingNotesWeekColumnWidth})`;
    const meetingNotesBodyGridTemplateRows = isMeetingNotesMobile
        ? `auto repeat(${layoutDepartments.length * (meetingNotesMonthlyGoalsColumnVisible ? 2 : 1)}, minmax(200px, max-content))`
        : `auto repeat(${layoutDepartments.length}, minmax(200px, max-content))`;
    const stickyMonthlyGoalsHeaderCol = isMeetingNotesMobile
        ? ''
        : isDark
          ? 'sticky left-0 z-[25] bg-slate-800 shadow-[6px_0_16px_-6px_rgba(0,0,0,0.55)]'
          : 'sticky left-0 z-[25] bg-white shadow-[6px_0_16px_-6px_rgba(0,0,0,0.14)]';
    /** Higher z-index than week columns so horizontal scroll slides weeks under this column (no bleed-through). Fully opaque backgrounds — no /opacity or translucent slate. */
    const stickyMonthlyGoalsBodyCol = isMeetingNotesMobile
        ? ''
        : isDark
          ? 'sticky left-0 z-[26] bg-slate-800 shadow-[8px_0_20px_-4px_rgba(0,0,0,0.55)]'
          : 'sticky left-0 z-[26] bg-white shadow-[8px_0_20px_-4px_rgba(0,0,0,0.12)]';

    const scrollToWeekId = useCallback((weekId) => {
        if (!weekId || !Array.isArray(weeks) || weeks.length === 0) {
            return;
        }
        const scroller = meetingNotesHorizontalScrollRef.current;
        if (!scroller) {
            return;
        }

        const escapeWeekAttr = (id) =>
            typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(id)) : String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        const resolveColumnEl = (id) => {
            if (!id) {
                return null;
            }
            const refs = weekCardRefs.current || {};
            if (refs[id]) {
                return refs[id];
            }
            try {
                const escaped = escapeWeekAttr(id);
                return scroller.querySelector(`[data-management-meeting-week="${escaped}"]`);
            } catch (e) {
                return null;
            }
        };

        let node = resolveColumnEl(weekId);
        if (!node) {
            const idx = weeks.findIndex((week, index) => {
                const identifier = getWeekIdentifier(week) || `week-${index}`;
                return identifier === weekId;
            });
            if (idx >= 0) {
                const canon = getWeekIdentifier(weeks[idx]) || `week-${idx}`;
                node = resolveColumnEl(canon);
            }
        }
        if (!node) {
            return;
        }

        const firstWeek = weeks[0];
        const firstId = getWeekIdentifier(firstWeek) || 'week-0';
        const anchor = resolveColumnEl(firstId);

        const headScroller = meetingNotesHeaderScrollRef.current;
        const applyLeft = (left, behavior) => {
            const x = Math.max(0, Math.round(left));
            if (behavior === 'smooth') {
                scroller.scrollTo({ left: x, behavior: 'smooth' });
                if (headScroller) {
                    headScroller.scrollTo({ left: x, behavior: 'smooth' });
                }
            } else {
                scroller.scrollLeft = x;
                if (headScroller) {
                    headScroller.scrollLeft = x;
                }
            }
        };

        try {
            if (anchor && node !== anchor) {
                const targetLeft = node.offsetLeft - anchor.offsetLeft;
                applyLeft(targetLeft, 'smooth');
                return;
            }
            if (!anchor) {
                node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                return;
            }
            applyLeft(0, 'smooth');
        } catch (error) {
            console.warn('ManagementMeetingNotes: Failed to scroll to week', weekId, error);
            try {
                node.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
            } catch (e2) {
                /* ignore */
            }
        }
    }, [weeks]);

    const handleGmEditorHostClick = useCallback(
        (e, week, gmIdentifier) => {
            const t = e.target;
            const anchor = t && typeof t.closest === 'function' ? t.closest('.gm-thread-anchor[data-gm-thread-id]') : null;
            if (!anchor || !week?.id) {
                return;
            }
            const threadId = anchor.getAttribute('data-gm-thread-id');
            if (!threadId) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            setGmCommentsSidebarVisiblePersisted(true);
            setGmSidebarFocusThreadId(threadId);
            setSelectedWeek(gmIdentifier);
            scrollToWeekId(gmIdentifier);
        },
        [scrollToWeekId, setGmCommentsSidebarVisiblePersisted]
    );

    useEffect(() => {
        if (!gmSidebarFocusThreadId) {
            return undefined;
        }
        const id = String(gmSidebarFocusThreadId);
        const esc =
            typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const run = () => {
            const el = document.querySelector(`[data-gm-sidebar-thread="${esc}"]`);
            if (el) {
                el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        };
        const r1 = requestAnimationFrame(() => {
            requestAnimationFrame(run);
        });
        return () => cancelAnimationFrame(r1);
    }, [gmSidebarFocusThreadId]);

    /** Keep header and body horizontal scroll aligned (split scrollers so `sticky top` dates work). */
    useEffect(() => {
        const body = meetingNotesHorizontalScrollRef.current;
        const head = meetingNotesHeaderScrollRef.current;
        if (!body || !head) {
            return undefined;
        }
        const sync = (source, target) => {
            const left = source.scrollLeft;
            if (Math.abs(target.scrollLeft - left) < 0.5) {
                return;
            }
            meetingNotesScrollSyncProgrammaticRef.current = true;
            target.scrollLeft = left;
            requestAnimationFrame(() => {
                meetingNotesScrollSyncProgrammaticRef.current = false;
            });
        };
        const onBody = () => {
            if (meetingNotesScrollSyncProgrammaticRef.current) {
                return;
            }
            sync(body, head);
        };
        const onHead = () => {
            if (meetingNotesScrollSyncProgrammaticRef.current) {
                return;
            }
            sync(head, body);
        };
        const alignFromBody = () => {
            meetingNotesScrollSyncProgrammaticRef.current = true;
            head.scrollLeft = body.scrollLeft;
            requestAnimationFrame(() => {
                meetingNotesScrollSyncProgrammaticRef.current = false;
            });
        };
        alignFromBody();
        body.addEventListener('scroll', onBody, { passive: true });
        head.addEventListener('scroll', onHead, { passive: true });
        const ro =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => {
                      alignFromBody();
                  })
                : null;
        if (ro) {
            ro.observe(body);
            ro.observe(head);
        }
        return () => {
            body.removeEventListener('scroll', onBody);
            head.removeEventListener('scroll', onHead);
            if (ro) {
                ro.disconnect();
            }
        };
    }, [selectedMonth, weeksNavSignature]);

    const selectedWeekIndex = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            return -1;
        }
        return weeks.findIndex((week, index) => {
            const identifier = getWeekIdentifier(week) || `week-${index}`;
            return identifier === selectedWeek;
        });
    }, [weeks, selectedWeek]);

    const resolvedSelectedWeekIndex = selectedWeekIndex >= 0 ? selectedWeekIndex : -1;

    // Calculate actual current week and next week based on today's date
    const currentWeekId = useMemo(() => {
        if (!Array.isArray(weeks) || weeks.length === 0) {
            return null;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const currentWeek = weeks.find((week) => {
            if (!week) return false;
            const start = week.weekStart ? new Date(week.weekStart) : null;
            if (!start || Number.isNaN(start.getTime())) return false;
            const end = week.weekEnd ? new Date(week.weekEnd) : new Date(start);
            if (Number.isNaN(end.getTime())) return false;
            
            const startOfDay = new Date(start);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(end);
            endOfDay.setHours(23, 59, 59, 999);
            
            return today >= startOfDay && today <= endOfDay;
        });
        
        if (!currentWeek) return null;
        const index = weeks.indexOf(currentWeek);
        const rawIdentifier = getWeekIdentifier(currentWeek);
        return rawIdentifier || (index >= 0 ? `week-${index}` : null);
    }, [weeks]);

    const nextWeekId = useMemo(() => {
        if (!currentWeekId || !Array.isArray(weeks) || weeks.length === 0) {
            return null;
        }
        const currentIndex = weeks.findIndex((week, index) => {
            const identifier = getWeekIdentifier(week) || `week-${index}`;
            return identifier === currentWeekId;
        });
        if (currentIndex < 0 || currentIndex >= weeks.length - 1) {
            return null;
        }
        const nextWeek = weeks[currentIndex + 1];
        if (!nextWeek) return null;
        const rawIdentifier = getWeekIdentifier(nextWeek);
        return rawIdentifier || `week-${currentIndex + 1}`;
    }, [weeks, currentWeekId]);

    useEffect(() => {
        const getWeekId = (week, index) => managementMeetingNotesGetWeekIdForList(week, index);

        if (!Array.isArray(weeks) || weeks.length === 0) {
            if (selectedWeek !== null) {
                setSelectedWeek(null);
            }
            return;
        }

        if (!selectedMonth) {
            return;
        }

        const findWeekIndexByParam = (param) => managementMeetingNotesFindWeekIndexInList(weeks, param);

        const currentWeekKeys = weeks
            .map((week, index) => getWeekId(week, index))
            .filter(Boolean)
            .sort()
            .join(',');

        if (previousWeekKeysRef.current === currentWeekKeys && selectedWeek) {
            if (findWeekIndexByParam(selectedWeek) >= 0) {
                return;
            }
        }

        previousWeekKeysRef.current = currentWeekKeys;

        const weekFromURL = getWeekFromURL();
        if (weekFromURL) {
            const hasWeekFromURL = findWeekIndexByParam(weekFromURL) >= 0;
            if (hasWeekFromURL && weekFromURL !== selectedWeek) {
                setSelectedWeek(weekFromURL);
                return;
            }
        }

        if (selectedWeek && findWeekIndexByParam(selectedWeek) >= 0) {
            return;
        }

        const preferredIdx = managementMeetingNotesPreferredWeekIndex(weeks);
        const preferredId = getWeekId(weeks[preferredIdx], preferredIdx);
        if (preferredId && preferredId !== selectedWeek) {
            setSelectedWeek(preferredId);
        }
    }, [weeks, selectedWeek, selectedMonth, weeksNavSignature]);

    useEffect(() => {
        meetingNotesUrlWeekHorizontalScrollDoneRef.current = false;
        setGmSidebarFocusThreadId(null);
    }, [selectedMonth]);

    useEffect(() => {
        if (!selectedWeek || !weeksNavSignature) {
            return;
        }
        let urlWeek = '';
        try {
            urlWeek = getWeekFromURL() || '';
        } catch (_) {
            urlWeek = '';
        }
        const allowDeepLinkOnce =
            Boolean(urlWeek) &&
            String(selectedWeek) === String(urlWeek) &&
            !meetingNotesUrlWeekHorizontalScrollDoneRef.current;
        const allowReloadOnce =
            initialPageWasNavigationReload && !meetingNotesReloadWeekScrollConsumedRef.current;
        const allowHorizontalWeekScroll = allowReloadOnce || allowDeepLinkOnce;
        if (!allowHorizontalWeekScroll) {
            return undefined;
        }
        const didScheduleReloadScroll = allowReloadOnce;
        let cancelled = false;
        let chainRaf = 0;
        let attempts = 0;
        const maxAttempts = 48;

        const columnReady = () => {
            const scroller = meetingNotesHorizontalScrollRef.current;
            if (!scroller) {
                return false;
            }
            const refs = weekCardRefs.current || {};
            if (refs[selectedWeek]) {
                return true;
            }
            try {
                const esc =
                    typeof CSS !== 'undefined' && CSS.escape
                        ? CSS.escape(String(selectedWeek))
                        : String(selectedWeek).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                return Boolean(scroller.querySelector(`[data-management-meeting-week="${esc}"]`));
            } catch (e) {
                return false;
            }
        };

        const tick = () => {
            if (cancelled) {
                return;
            }
            if (columnReady() || attempts >= maxAttempts) {
                if (didScheduleReloadScroll) {
                    meetingNotesReloadWeekScrollConsumedRef.current = true;
                }
                if (allowDeepLinkOnce) {
                    meetingNotesUrlWeekHorizontalScrollDoneRef.current = true;
                }
                scrollToWeekId(selectedWeek);
                return;
            }
            attempts += 1;
            chainRaf = requestAnimationFrame(tick);
        };

        const outerRaf = requestAnimationFrame(() => {
            chainRaf = requestAnimationFrame(tick);
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(outerRaf);
            cancelAnimationFrame(chainRaf);
        };
    }, [selectedWeek, scrollToWeekId, weeksNavSignature, initialPageWasNavigationReload]);

    // Expose functions for parent components (no tracking - always returns false)
    const managementMeetingNotesRef = useRef({
        hasPendingSaves: () => {
            // No tracking - always return false
            return false;
        }
    });
    
    // No tracking - removed all navigation blocking and change tracking code
    // Expose ref to window for Teams component (hasPendingSaves always returns false)
    useEffect(() => {
        window.ManagementMeetingNotesRef = managementMeetingNotesRef;
        return () => {
            delete window.ManagementMeetingNotesRef;
        };
    }, []);
    
    // Cleanup auto-save timers on unmount
    useEffect(() => {
        return () => {
            // Clear all pending auto-save timers
            Object.values(autoSaveTimers.current).forEach(timer => clearTimeout(timer));
            Object.values(savedStatusTimers.current).forEach(timer => clearTimeout(timer));
            Object.values(generalMinutesTimers.current).forEach(timer => clearTimeout(timer));
        };
    }, []);

    // Get all action items for the month
    const allActionItems = useMemo(() => {
        if (!currentMonthlyNotes) return [];
        const items = [];
        
        // Monthly action items
        if (currentMonthlyNotes.actionItems) {
            items.push(...currentMonthlyNotes.actionItems.map(item => ({ ...item, source: 'monthly' })));
        }
        
        // Weekly and department action items
        if (currentMonthlyNotes.weeklyNotes) {
            currentMonthlyNotes.weeklyNotes.forEach(week => {
                if (week.actionItems) {
                    items.push(...week.actionItems.map(item => ({ ...item, source: 'weekly', weekKey: week.weekKey })));
                }
                if (week.departmentNotes) {
                    week.departmentNotes.forEach(dept => {
                        if (dept.actionItems) {
                            items.push(...dept.actionItems.map(item => ({ ...item, source: 'department', weekKey: week.weekKey, departmentId: dept.departmentId })));
                        }
                    });
                }
            });
        }
        
        return items;
    }, [currentMonthlyNotes]);

    // Get action items by status
    const actionItemsByStatus = useMemo(() => {
        const grouped = {
            open: [],
            in_progress: [],
            completed: [],
            cancelled: []
        };
        allActionItems.forEach(item => {
            if (grouped[item.status]) {
                grouped[item.status].push(item);
            }
        });
        return grouped;
    }, [allActionItems]);

    // Create monthly meeting notes
    const handleCreateMonth = async (customMonthValue = null) => {
        try {
            const monthKey =
                normalizeMonthKeyInput(
                    customMonthValue ?? newMonthKey ?? selectedMonth ?? new Date()
                );

            if (!monthKey) {
                // Invalid month - return silently
                return null;
            }

            const triggeredByInput = Boolean((customMonthValue ?? newMonthKey) && (customMonthValue ?? newMonthKey).toString().trim());

            if (!selectedMonth || selectedMonth !== monthKey) {
                setSelectedMonth(monthKey);
            }

            const existingNotes =
                currentMonthlyNotes?.monthKey === monthKey
                    ? currentMonthlyNotes
                    : monthlyNotesList.find(note => note?.monthKey === monthKey);

            if (existingNotes) {
                setCurrentMonthlyNotes(existingNotes);
                setSelectedWeek(null);
                setNewMonthKey('');
                // Existing notes loaded silently
                return existingNotes;
            }

            // Helper function to extract monthlyNotes from any response structure
            const extractMonthlyNotes = (resp) => {
                if (!resp) return null;
                
                // Try response.data.monthlyNotes (most common - API wraps in { data: { monthlyNotes: ... } })
                if (resp?.data?.monthlyNotes && (resp.data.monthlyNotes.monthKey || resp.data.monthlyNotes.id)) {
                    return resp.data.monthlyNotes;
                }
                
                // Try response.monthlyNotes (top-level)
                if (resp?.monthlyNotes && (resp.monthlyNotes.monthKey || resp.monthlyNotes.id)) {
                    return resp.monthlyNotes;
                }
                
                // Try response.data if it has monthKey or id (it IS the monthlyNotes)
                if (resp?.data && (resp.data.monthKey || resp.data.id) && !resp.data.monthlyNotes) {
                    return resp.data;
                }
                
                // Try nested data.data.monthlyNotes
                if (resp?.data?.data?.monthlyNotes && (resp.data.data.monthlyNotes.monthKey || resp.data.data.monthlyNotes.id)) {
                    return resp.data.data.monthlyNotes;
                }
                
                // Try any key in response.data that looks like monthlyNotes
                if (resp?.data && typeof resp.data === 'object') {
                    for (const key of Object.keys(resp.data)) {
                        const value = resp.data[key];
                        if (value && typeof value === 'object' && !Array.isArray(value) && (value.monthKey || value.id)) {
                            return value;
                        }
                    }
                }
                
                // Try response itself if it has monthKey or id
                if (resp && (resp.monthKey || resp.id) && !resp.data) {
                    return resp;
                }
                
                return null;
            };

            try {
                setLoading(true);
                console.log('📝 Attempting to create monthly notes for:', monthKey);
                let response;
                try {
                    response = await window.DatabaseAPI.createMonthlyNotes(monthKey, '');
                } catch (createError) {
                    // If createMonthlyNotes throws "already exist", try to load existing notes
                    const errorMessage = (createError?.message || '').toLowerCase();
                    console.log('⚠️ createMonthlyNotes error caught:', errorMessage, createError);
                    if (errorMessage.includes('already exist') || createError.needsManualLoad) {
                        console.log('🔄 Attempting to load existing notes manually...');
                        try {
                            const monthResponse = await window.DatabaseAPI.getMeetingNotes(monthKey);
                            console.log('📦 getMeetingNotes response:', monthResponse);
                            
                            const duplicateNotes = extractMonthlyNotes(monthResponse);
                            
                            if (duplicateNotes) {
                                console.log('✅ Found existing notes:', duplicateNotes.id, duplicateNotes.monthKey);
                                // Return the existing notes as if they were just created
                                response = { data: { monthlyNotes: duplicateNotes }, monthlyNotes: duplicateNotes };
                            } else {
                                console.warn('⚠️ getMeetingNotes returned but no monthlyNotes found. Response:', monthResponse);
                                // Don't throw - return null to prevent unhandled rejection
                                return null;
                            }
                        } catch (loadError) {
                            console.error('❌ Failed to load existing monthly notes after duplicate warning:', loadError);
                            // Don't re-throw - return null to prevent unhandled rejection
                            return null;
                        }
                    } else {
                        // Re-throw if we couldn't handle it
                        throw createError;
                    }
                }
                
                if (!response) {
                    console.warn('⚠️ createMonthlyNotes returned null or undefined response');
                    return null;
                }
                
                console.log('📦 createMonthlyNotes response:', response);
                
                // Extract monthlyNotes from response
                let newNotes = extractMonthlyNotes(response);
                
                console.log('🔍 Extraction result:', {
                    found: !!newNotes,
                    hasId: !!newNotes?.id,
                    hasMonthKey: !!newNotes?.monthKey,
                    monthKey: newNotes?.monthKey
                });
                
                // Helper function to set notes in state and return them
                const setNotesAndReturn = (notes) => {
                    if (!notes || (!notes.monthKey && !notes.id)) {
                        return null;
                    }
                    
                    console.log('✅ Successfully got notes (new or existing):', notes.id, notes.monthKey);
                    setCurrentMonthlyNotes(notes);
                    setMonthlyNotesList(prev => {
                        const list = Array.isArray(prev) ? [...prev] : [];
                        const existingIndex = list.findIndex(note => {
                            if (!note) return false;
                            return (note.id && notes.id && note.id === notes.id) ||
                                   (note.monthKey && notes.monthKey && note.monthKey === notes.monthKey);
                        });
                        if (existingIndex >= 0) {
                            list[existingIndex] = notes;
                            return list;
                        }
                        list.push(notes);
                        return list;
                    });
                    setSelectedMonth(notes.monthKey || monthKey);
                    setSelectedWeek(null);
                    setNewMonthKey('');
                    return notes;
                };
                
                if (newNotes) {
                    return setNotesAndReturn(newNotes);
                }
                
                // If extraction failed, try loading directly from getMeetingNotes
                console.log('⚠️ Could not extract notes from createMonthlyNotes response, trying getMeetingNotes...');
                try {
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(monthKey);
                    console.log('📦 Fallback getMeetingNotes response:', monthResponse);
                    
                    const fallbackNotes = extractMonthlyNotes(monthResponse);
                    if (fallbackNotes) {
                        console.log('✅ Successfully loaded notes via getMeetingNotes fallback');
                        return setNotesAndReturn(fallbackNotes);
                    } else {
                        console.warn('⚠️ getMeetingNotes returned but could not extract monthlyNotes. Response:', monthResponse);
                    }
                } catch (fallbackError) {
                    console.error('❌ Fallback getMeetingNotes failed:', fallbackError);
                }
                
                // If all attempts failed, return null gracefully (no unhandled rejection)
                console.warn('⚠️ Could not load monthly notes after all attempts. Returning null.');
                return null;
            } catch (error) {
                console.error('❌ Error creating monthly notes:', error);
                const errorMessage = (error?.message || '').toLowerCase();
                if (errorMessage.includes('already exist')) {
                    try {
                        const monthResponse = await window.DatabaseAPI.getMeetingNotes(monthKey);
                        console.log('📦 Outer catch - getMeetingNotes response:', monthResponse);
                        
                        const duplicateNotes = extractMonthlyNotes(monthResponse);
                        if (duplicateNotes) {
                            console.log('✅ Found existing notes in outer catch:', duplicateNotes.id, duplicateNotes.monthKey);
                            setCurrentMonthlyNotes(duplicateNotes);
                            setMonthlyNotesList(prev => {
                                const list = Array.isArray(prev) ? [...prev] : [];
                                const existingIndex = list.findIndex(note => {
                                    if (!note) return false;
                                    return (note.id && duplicateNotes.id && note.id === duplicateNotes.id) ||
                                           (note.monthKey && duplicateNotes.monthKey && note.monthKey === duplicateNotes.monthKey);
                                });
                                if (existingIndex >= 0) {
                                    list[existingIndex] = duplicateNotes;
                                    return list;
                                }
                                list.push(duplicateNotes);
                                return list;
                            });
                            setSelectedMonth(duplicateNotes.monthKey || monthKey);
                            setSelectedWeek(null);
                            setNewMonthKey('');
                            if (triggeredByInput && typeof alert === 'function') {
                                // Existing notes loaded silently
                            }
                            setLoading(false);
                            return duplicateNotes;
                        } else {
                            console.warn('⚠️ Outer catch - could not extract notes from getMeetingNotes response:', monthResponse);
                        }
                    } catch (loadError) {
                        console.error('Failed to load existing monthly notes after duplicate warning:', loadError);
                        if (typeof alert === 'function') {
                            console.error('Monthly notes already exist but could not load automatically.');
                        }
                        // Return null to prevent unhandled promise rejection
                        return null;
                    }
                    // If we get here, loading failed but we didn't return, so return null
                    return null;
                } else if (typeof alert === 'function') {
                    console.error('Failed to create monthly notes');
                }
                // Return null for any other error to prevent unhandled promise rejection
                return null;
            } finally {
                setLoading(false);
            }

            return null;
        } catch (error) {
            // Outer catch to ensure no unhandled promise rejections
            console.error('Unexpected error in handleCreateMonth:', error);
            setLoading(false);
            return null;
        }
    };

    // Generate new monthly plan (copy from previous month)
    const handleGenerateMonth = async () => {
        if (!selectedMonth) return;
        
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
        
        // If a plan already exists for the current month, reuse it instead of calling the API again
        const existingNotes =
            currentMonthlyNotes?.monthKey === currentMonthKey
                ? currentMonthlyNotes
                : monthlyNotesList.find(note => note?.monthKey === currentMonthKey);

        if (existingNotes) {
            setCurrentMonthlyNotes(existingNotes);
            setSelectedMonth(currentMonthKey);
            // Existing notes loaded silently
            return;
        }

        try {
            setLoading(true);
            const response = await window.DatabaseAPI.generateMonthlyPlan(currentMonthKey, prevMonthKey);
            const newNotes = response.data?.monthlyNotes;
            if (newNotes) {
                setCurrentMonthlyNotes(newNotes);
                setMonthlyNotesList(prev => {
                    const list = Array.isArray(prev) ? [...prev] : [];
                    const existingIndex = list.findIndex(note => {
                        if (!note) return false;
                        return (note.id && newNotes.id && note.id === newNotes.id) ||
                               (note.monthKey && newNotes.monthKey && note.monthKey === newNotes.monthKey);
                    });
                    if (existingIndex >= 0) {
                        list[existingIndex] = newNotes;
                        return list;
                    }
                    list.push(newNotes);
                    return list;
                });
                setSelectedMonth(currentMonthKey);
            }
        } catch (error) {
            console.error('Error generating monthly plan:', error);
            const errorMessage = (error?.message || '').toLowerCase();
            
            if (errorMessage.includes('already exist')) {
                console.info('Monthly plan already exists, loading current month instead.');
                try {
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(currentMonthKey);
                    const existingNotes = monthResponse?.data?.monthlyNotes;
                    
                    if (existingNotes) {
                        setCurrentMonthlyNotes(existingNotes);
                        setMonthlyNotesList(prev => {
                            const list = Array.isArray(prev) ? [...prev] : [];
                            const existingIndex = list.findIndex(note => {
                                if (!note) return false;
                                return (note.id && existingNotes.id && note.id === existingNotes.id) ||
                                       (note.monthKey && existingNotes.monthKey && note.monthKey === existingNotes.monthKey);
                            });
                            
                            if (existingIndex >= 0) {
                                list[existingIndex] = existingNotes;
                                return list;
                            }
                            
                            list.push(existingNotes);
                            return list;
                        });
                        setSelectedMonth(currentMonthKey);
                        if (typeof alert === 'function') {
                            // Existing notes loaded silently
                        }
                    } else if (typeof alert === 'function') {
                        // Monthly notes already exist - handled silently
                    }
                } catch (loadError) {
                    console.error('Failed to load existing monthly notes after duplicate warning:', loadError);
                    if (typeof alert === 'function') {
                        console.error('Monthly notes already exist but could not load automatically.');
                    }
                }
            } else {
                if (typeof alert === 'function') {
                    console.error('Failed to generate monthly plan');
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteWeek = async (week) => {
        if (!week?.id) return;
        if (!confirm('Delete the selected week and all associated department notes, action items, and comments? This cannot be undone.')) {
            return;
        }

        try {
            setLoading(true);
            await window.DatabaseAPI.deleteWeeklyNotes(week.id);

            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            const updatedMonth = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes || null;

            if (updatedMonth) {
                setCurrentMonthlyNotes(updatedMonth);
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => (note?.id === updatedMonth.id ? updatedMonth : note));
                });
            } else {
                await reloadMonthlyNotes(selectedMonth);
            }

            if (selectedWeek === week.weekKey) {
                setSelectedWeek(null);
            }
        } catch (error) {
            console.error('Error deleting weekly notes:', error);
            if (typeof alert === 'function') {
                console.error('Failed to delete weekly notes.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Create weekly notes
    const handleCreateWeek = async (customWeekValue = null) => {
        try {
            const weekInputValue = customWeekValue ?? newWeekStartInput;
            let weekDetails = deriveWeekDetails(weekInputValue);

            if (weekInputValue && !weekDetails) {
                if (typeof alert === 'function') {
                    // Invalid week date - return silently
                }
                return null;
            }

            if (!weekDetails) {
                weekDetails = deriveWeekDetails(new Date());
            }

            if (!weekDetails) {
                if (typeof alert === 'function') {
                    // Unable to determine week - return silently
                }
                return null;
            }

            const triggeredByInput = Boolean(weekInputValue && typeof weekInputValue === 'string' && weekInputValue.trim());

            let targetMonth =
                currentMonthlyNotes?.monthKey === weekDetails.monthKey
                    ? currentMonthlyNotes
                    : monthlyNotesList.find(note => note?.monthKey === weekDetails.monthKey) || null;

            if (!targetMonth) {
                console.log('📅 No target month found, creating month:', weekDetails.monthKey);
                try {
                    const createdMonth = await handleCreateMonth(weekDetails.monthKey).catch(error => {
                        // handleCreateMonth should never throw, but catch just in case
                        console.error('❌ Error creating month in handleCreateWeek (from handleCreateMonth):', error);
                        return null;
                    });
                    if (!createdMonth) {
                        console.log('⚠️ Month creation returned null, trying to load existing month...');
                        // Try to load existing month notes if creation failed
                        try {
                            const monthResponse = await window.DatabaseAPI.getMeetingNotes(weekDetails.monthKey);
                            console.log('🔍 handleCreateWeek fallback - monthResponse:', monthResponse);
                            // Try multiple extraction paths
                            const existingMonth = monthResponse?.data?.monthlyNotes || 
                                                monthResponse?.monthlyNotes ||
                                                (monthResponse?.data && (monthResponse.data.monthKey || monthResponse.data.id) ? monthResponse.data : null);
                            if (existingMonth && (existingMonth.monthKey || existingMonth.id)) {
                                console.log('✅ Loaded existing month:', existingMonth.id, existingMonth.monthKey);
                                targetMonth = existingMonth;
                                setCurrentMonthlyNotes(existingMonth);
                                setMonthlyNotesList(prev => {
                                    const list = Array.isArray(prev) ? [...prev] : [];
                                    const existingIndex = list.findIndex(note => {
                                        if (!note) return false;
                                        return (note.id && existingMonth.id && note.id === existingMonth.id) ||
                                               (note.monthKey && existingMonth.monthKey && note.monthKey === existingMonth.monthKey);
                                    });
                                    if (existingIndex >= 0) {
                                        list[existingIndex] = existingMonth;
                                        return list;
                                    }
                                    list.push(existingMonth);
                                    return list;
                                });
                                setSelectedMonth(existingMonth.monthKey);
                            } else {
                                console.error('❌ Could not load existing month either. monthKey:', weekDetails.monthKey);
                                return null;
                            }
                        } catch (loadError) {
                            console.error('❌ Failed to load existing monthly notes:', loadError);
                            return null;
                        }
                    } else {
                        console.log('✅ Month created successfully:', createdMonth.id, createdMonth.monthKey);
                        targetMonth = createdMonth;
                        // Ensure targetMonth has all necessary properties
                        if (!targetMonth.id && createdMonth.id) {
                            targetMonth = { ...targetMonth, id: createdMonth.id };
                        }
                    }
                } catch (error) {
                    console.error('Error creating month in handleCreateWeek:', error);
                    // Try to load existing month notes if creation failed
                    try {
                        const monthResponse = await window.DatabaseAPI.getMeetingNotes(weekDetails.monthKey);
                        console.log('🔍 handleCreateWeek error fallback - monthResponse:', monthResponse);
                        // Try multiple extraction paths
                        const existingMonth = monthResponse?.data?.monthlyNotes || 
                                            monthResponse?.monthlyNotes ||
                                            (monthResponse?.data && (monthResponse.data.monthKey || monthResponse.data.id) ? monthResponse.data : null);
                        if (existingMonth && (existingMonth.monthKey || existingMonth.id)) {
                            targetMonth = existingMonth;
                            setCurrentMonthlyNotes(existingMonth);
                            setMonthlyNotesList(prev => {
                                const list = Array.isArray(prev) ? [...prev] : [];
                                const existingIndex = list.findIndex(note => {
                                    if (!note) return false;
                                    return (note.id && existingMonth.id && note.id === existingMonth.id) ||
                                           (note.monthKey && existingMonth.monthKey && note.monthKey === existingMonth.monthKey);
                                });
                                if (existingIndex >= 0) {
                                    list[existingIndex] = existingMonth;
                                    return list;
                                }
                                list.push(existingMonth);
                                return list;
                            });
                            setSelectedMonth(existingMonth.monthKey);
                        } else {
                            return null;
                        }
                    } catch (loadError) {
                        console.error('Failed to load existing monthly notes:', loadError);
                        return null;
                    }
                }
            }

        if (!targetMonth?.weeklyNotes) {
            console.log('🔄 Refreshing month data to get weeklyNotes. Current targetMonth.id:', targetMonth?.id);
            try {
                const monthResponse = await window.DatabaseAPI.getMeetingNotes(targetMonth.monthKey || weekDetails.monthKey);
                const refreshedMonth = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes || null;
                if (refreshedMonth) {
                    console.log('✅ Refreshed month data. New id:', refreshedMonth.id, 'Has weeklyNotes:', !!refreshedMonth.weeklyNotes);
                    targetMonth = refreshedMonth;
                    setCurrentMonthlyNotes(refreshedMonth);
                    setMonthlyNotesList(prev => {
                        const list = Array.isArray(prev) ? [...prev] : [];
                        const existingIndex = list.findIndex(note => {
                            if (!note) return false;
                            return (note.id && refreshedMonth.id && note.id === refreshedMonth.id) ||
                                   (note.monthKey && refreshedMonth.monthKey && note.monthKey === refreshedMonth.monthKey);
                        });
                        if (existingIndex >= 0) {
                            list[existingIndex] = refreshedMonth;
                            return list;
                        }
                        list.push(refreshedMonth);
                        return list;
                    });
                    setSelectedMonth(refreshedMonth.monthKey);
                } else {
                    console.warn('⚠️ Refreshed month response was null');
                }
            } catch (monthLoadError) {
                console.error('❌ Error refreshing monthly notes before creating week:', monthLoadError);
            }
        }

        // Final check: ensure targetMonth has an id before proceeding
        if (!targetMonth?.id) {
            console.error('❌ targetMonth still missing id after all attempts. targetMonth:', {
                monthKey: targetMonth?.monthKey,
                hasId: !!targetMonth?.id,
                id: targetMonth?.id
            });
            if (typeof alert === 'function') {
                alert('Unable to get monthly notes ID. Please try refreshing the page.');
            }
            return null;
        }

        if (!targetMonth) {
            console.error('❌ No target month found for week creation. weekDetails:', weekDetails);
            if (typeof alert === 'function') {
                alert('Unable to find or create monthly notes for the selected week.');
            }
            return null;
        }

        const existingWeek = targetMonth?.weeklyNotes?.find(week => week?.weekKey === weekDetails.weekKey);
        if (existingWeek) {
            console.log('ℹ️ Week already exists, selecting it:', weekDetails.weekKey);
            setSelectedMonth(targetMonth.monthKey || weekDetails.monthKey);
            setSelectedWeek(weekDetails.weekKey);
            setNewWeekStartInput('');
            if (triggeredByInput && typeof alert === 'function') {
                // Existing weekly notes loaded silently
            }
            return existingWeek;
        }

        try {
            setLoading(true);
            const monthId = targetMonth?.id;
            if (!monthId) {
                console.error('❌ Unable to locate monthly notes ID for the selected week. targetMonth:', {
                    id: targetMonth?.id,
                    monthKey: targetMonth?.monthKey,
                    hasId: !!targetMonth?.id
                });
                if (typeof alert === 'function') {
                    alert('Unable to locate monthly notes for the selected week. Please try creating the month first.');
                }
                return null;
            }

            console.log('📝 Creating weekly notes:', {
                monthId,
                weekKey: weekDetails.weekKey,
                weekStart: weekDetails.weekStart.toISOString(),
                weekEnd: weekDetails.weekEnd.toISOString()
            });

            const createResponse = await window.DatabaseAPI.createWeeklyNotes(
                monthId,
                weekDetails.weekKey,
                weekDetails.weekStart.toISOString(),
                weekDetails.weekEnd.toISOString()
            );

            const isDuplicate = createResponse?.duplicate === true;
            if (isDuplicate) {
                console.log('ℹ️ Weekly notes already exist (duplicate detected):', createResponse);
            } else {
                console.log('✅ Weekly notes created successfully:', createResponse);
            }

            // Send notifications to all users in the monthly notes (only if not a duplicate)
            if (!isDuplicate && window.DatabaseAPI && targetMonth?.userAllocations && targetMonth.userAllocations.length > 0) {
                const currentUser = window.storage?.getUserInfo() || {};
                const authorName = currentUser.name || currentUser.email || 'System';
                const weekStartStr = weekDetails.weekStart.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
                const weekEndStr = weekDetails.weekEnd.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
                
                // Get unique user IDs from allocations
                const userIds = [...new Set(targetMonth.userAllocations.map(a => a.userId))];
                
                // Send notifications asynchronously (don't wait)
                userIds.forEach(userId => {
                    if (userId && userId !== currentUser.id) {
                        const notificationPayload = {
                            userId: userId,
                            type: 'system',
                            title: 'New Week Generated',
                            message: `${authorName} created a new week (${weekStartStr} - ${weekEndStr}) for ${formatMonth(weekDetails.monthKey)}`,
                            link: `#/teams/management?tab=meeting-notes&team=management&month=${encodeURIComponent(weekDetails.monthKey)}&week=${encodeURIComponent(weekDetails.weekKey)}`,
                            metadata: {
                                type: 'week_created',
                                monthKey: weekDetails.monthKey,
                                weekKey: weekDetails.weekKey,
                                weekStart: weekDetails.weekStart.toISOString(),
                                weekEnd: weekDetails.weekEnd.toISOString()
                            }
                        };
                        
                        window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify(notificationPayload)
                        }).catch(err => console.error('Error sending week notification:', err));
                    }
                });
            }

            // CRITICAL: After creating a week, we MUST reload the full month data to get the new week.
            // Don't use reloadMonthlyNotes here because it might preserve old data.
            // Instead, directly load the full month data with the new week.
            console.log(`🔄 Reloading month data after creating week ${weekDetails.weekKey}`);
            try {
                const monthResponse = await window.DatabaseAPI.getMeetingNotes(weekDetails.monthKey);
                const updatedMonth = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes || null;
                if (updatedMonth) {
                    setCurrentMonthlyNotes(updatedMonth);
                    setSelectedMonth(weekDetails.monthKey);
                    // Update monthlyNotesList with the updated month
                    setMonthlyNotesList(prev => {
                        const list = Array.isArray(prev) ? [...prev] : [];
                        const existingIndex = list.findIndex(note => note?.monthKey === weekDetails.monthKey);
                        if (existingIndex >= 0) {
                            list[existingIndex] = updatedMonth;
                        } else {
                            list.push(updatedMonth);
                        }
                        return list;
                    });
                } else {
                    // Fallback to reloadMonthlyNotes if direct load fails
                    await reloadMonthlyNotes(weekDetails.monthKey);
                }
            } catch (reloadError) {
                console.error('Error reloading month after creating week:', reloadError);
                // Fallback to reloadMonthlyNotes if direct load fails
                await reloadMonthlyNotes(weekDetails.monthKey);
            }
            
            setSelectedWeek(weekDetails.weekKey);
            setNewWeekStartInput('');
            return weekDetails.weekKey;
        } catch (error) {
            console.error('Error creating weekly notes:', error);
            const errorMessage = (error?.message || '').toLowerCase();

            if (errorMessage.includes('already exist')) {
                console.info('Weekly notes already exist for the selected week, reloading current month data.');
                try {
                    // Load full month data to ensure we have the existing week
                    const monthResponse = await window.DatabaseAPI.getMeetingNotes(weekDetails.monthKey);
                    const existingMonth = monthResponse?.data?.monthlyNotes || monthResponse?.monthlyNotes || null;
                    if (existingMonth) {
                        setCurrentMonthlyNotes(existingMonth);
                        setSelectedMonth(weekDetails.monthKey);
                        setMonthlyNotesList(prev => {
                            const list = Array.isArray(prev) ? [...prev] : [];
                            const existingIndex = list.findIndex(note => note?.monthKey === weekDetails.monthKey);
                            if (existingIndex >= 0) {
                                list[existingIndex] = existingMonth;
                            } else {
                                list.push(existingMonth);
                            }
                            return list;
                        });
                    } else {
                        await reloadMonthlyNotes(weekDetails.monthKey);
                    }
                    setSelectedWeek(weekDetails.weekKey);
                    setNewWeekStartInput('');
                    if (triggeredByInput && typeof alert === 'function') {
                        // Existing weekly notes loaded silently
                    }
                } catch (loadError) {
                    console.error('Failed to reload monthly notes after duplicate weekly warning:', loadError);
                    if (typeof alert === 'function') {
                        console.error('Weekly notes already exist but could not load automatically.');
                    }
                }
            } else {
                console.error('❌ Failed to create weekly notes. Error:', error);
                if (typeof alert === 'function') {
                    alert(`Failed to create weekly notes: ${error.message || 'Unknown error'}`);
                }
            }
            // Return null for any error to prevent unhandled promise rejection
            return null;
        } finally {
            setLoading(false);
        }
        } catch (error) {
            // Outer catch to ensure no unhandled promise rejections
            console.error('❌ Unexpected error in handleCreateWeek (outer catch):', error);
            setLoading(false);
            return null;
        }
    };

    // Helper function to get field key
    const getFieldKey = (departmentNotesId, field) => {
        return `${departmentNotesId}-${field}`;
    };

    const captureDeptFieldFocus = useCallback((departmentNotesId, field) => {
        deptFieldFocusRef.current = { departmentNotesId, field };
    }, []);

    const releaseDeptFieldFocus = useCallback((departmentNotesId, field) => {
        const focused = deptFieldFocusRef.current;
        if (
            focused &&
            focused.departmentNotesId === departmentNotesId &&
            focused.field === field
        ) {
            deptFieldFocusRef.current = null;
        }
    }, []);
    
    // Helper function to save cursor position for contentEditable elements and textareas
    const saveCursorPositionForField = (departmentNotesId, field) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        
        // Try to find the active element (RichTextEditor contentEditable or textarea)
        const activeElement = document.activeElement;
        if (!activeElement) return;
        
        // Check if it's a textarea first (easier to verify field match)
        if (activeElement.tagName === 'TEXTAREA') {
            const textarea = activeElement;
            const fieldAttr = textarea.getAttribute('data-field');
            const deptId = textarea.getAttribute('data-dept-note-id');
            
            // Verify this is the correct textarea for this field
            if (deptId === String(departmentNotesId) && fieldAttr === field) {
                savedCursorPositions.current[fieldKey] = {
                    start: textarea.selectionStart,
                    end: textarea.selectionEnd,
                    element: textarea,
                    isContentEditable: false,
                    departmentNotesId,
                    field
                };
            }
        }
        // Check if it's a contentEditable div (RichTextEditor)
        else if (activeElement.contentEditable === 'true') {
            // For contentEditable, we need to verify it belongs to the correct field
            // by checking if there's a nearby textarea with matching attributes (fallback)
            // or by checking the DOM structure
            const contentEditable = activeElement;
            
            // Try to find a nearby textarea with the same department note ID and field
            // to verify this is the correct editor
            let isCorrectField = false;
            try {
                // Check if there's a textarea with matching attributes nearby (fallback element)
                const parentSection = contentEditable.closest('[class*="space-y"], [class*="rounded"], div');
                if (parentSection) {
                    const nearbyTextarea = parentSection.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"][data-field="${field}"]`);
                    if (nearbyTextarea) {
                        isCorrectField = true;
                    }
                }
                
                // Also check if this contentEditable is within a section that contains our field label
                // This is a heuristic but should work for most cases
                if (!isCorrectField && parentSection) {
                    const labels = parentSection.querySelectorAll('label');
                    for (const label of labels) {
                        const labelText = label.textContent.trim().toLowerCase();
                        if ((field === 'successes' && labelText.includes("last week's successes")) ||
                            (field === 'weekToFollow' && labelText.includes('weekly plan')) ||
                            (field === 'frustrations' && (labelText.includes('frustrations') || labelText.includes('challenges')))) {
                            // Check if this contentEditable is in the same field group as this label
                            const fieldGroup = label.closest('div')?.parentElement;
                            if (fieldGroup && fieldGroup.contains(contentEditable)) {
                                isCorrectField = true;
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                // If verification fails, don't save (better to not save than save wrong position)
                return;
            }
            
            if (isCorrectField) {
                try {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        
                        // Verify the selection is within our contentEditable element
                        if (!contentEditable.contains(range.commonAncestorContainer)) {
                            return;
                        }
                        
                        // Calculate cursor position relative to editor content
                        const preCaretRange = range.cloneRange();
                        preCaretRange.selectNodeContents(contentEditable);
                        preCaretRange.setEnd(range.startContainer, range.startOffset);
                        const start = preCaretRange.toString().length;
                        
                        preCaretRange.setEnd(range.endContainer, range.endOffset);
                        const end = preCaretRange.toString().length;
                        
                        savedCursorPositions.current[fieldKey] = {
                            start,
                            end,
                            element: contentEditable,
                            isContentEditable: true,
                            departmentNotesId,
                            field
                        };
                    }
                } catch (e) {
                    // Silently fail if we can't save cursor position
                }
            }
        }
    };
    
    // Helper function to restore cursor position for a field
    const restoreCursorPositionForField = (departmentNotesId, field) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        const savedPos = savedCursorPositions.current[fieldKey];
        
        if (!savedPos) return;
        
        // Use multiple requestAnimationFrame calls to ensure React re-render and RichTextEditor's useEffect have completed
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
            try {
                if (savedPos.isContentEditable) {
                    // Restore cursor in contentEditable (RichTextEditor)
                    // First, try to use the saved element reference if it's still valid
                    let editorElement = null;
                    if (savedPos.element && savedPos.element.contentEditable === 'true' && document.body.contains(savedPos.element)) {
                        editorElement = savedPos.element;
                    } else {
                        // Element was recreated, find it by traversing DOM
                        // Find textarea with matching department note ID and field as a reference point
                        const textarea = document.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"][data-field="${field}"]`);
                        if (textarea) {
                            // Find the RichTextEditor contentEditable div near this textarea
                            const parentSection = textarea.closest('[class*="space-y"], [class*="rounded"], div');
                            if (parentSection) {
                                // Look for contentEditable div in the same section (RichTextEditor is usually rendered before textarea fallback)
                                const contentEditable = parentSection.querySelector('[contenteditable="true"]');
                                if (contentEditable) {
                                    editorElement = contentEditable;
                                }
                            }
                        }
                        // If still not found, try finding any contentEditable in the document that might be our field
                        // This is a fallback and less reliable
                        if (!editorElement) {
                            const allContentEditables = document.querySelectorAll('[contenteditable="true"]');
                            // We can't reliably identify which one, so skip restoration for this case
                            delete savedCursorPositions.current[fieldKey];
                            return;
                        }
                    }
                    
                    if (editorElement) {
                        const range = document.createRange();
                        const selection = window.getSelection();
                        
                        let charCount = 0;
                        const walker = document.createTreeWalker(
                            editorElement,
                            NodeFilter.SHOW_TEXT,
                            null
                        );
                        
                        let startNode = null, startOffset = 0;
                        let endNode = null, endOffset = 0;
                        let foundStart = false, foundEnd = false;
                        
                        let node;
                        while (node = walker.nextNode()) {
                            const nodeLength = node.textContent.length;
                            
                            if (!foundStart && charCount + nodeLength >= savedPos.start) {
                                startNode = node;
                                startOffset = savedPos.start - charCount;
                                foundStart = true;
                            }
                            
                            if (!foundEnd && charCount + nodeLength >= savedPos.end) {
                                endNode = node;
                                endOffset = savedPos.end - charCount;
                                foundEnd = true;
                                break;
                            }
                            
                            charCount += nodeLength;
                        }
                        
                        if (foundStart && startNode) {
                            if (!foundEnd) {
                                endNode = startNode;
                                endOffset = startOffset;
                            }
                            
                            try {
                                range.setStart(startNode, Math.min(startOffset, startNode.textContent.length));
                                range.setEnd(endNode, Math.min(endOffset, endNode.textContent.length));
                                selection.removeAllRanges();
                                selection.addRange(range);
                                
                                // Focus the element
                                editorElement.focus();
                            } catch (e) {
                                // Fallback: set cursor to end if range setting fails
                                const lastNode = editorElement.lastChild || editorElement;
                                if (lastNode.nodeType === Node.TEXT_NODE) {
                                    range.setStart(lastNode, lastNode.textContent.length);
                                    range.setEnd(lastNode, lastNode.textContent.length);
                                } else {
                                    range.selectNodeContents(editorElement);
                                    range.collapse(false);
                                }
                                selection.removeAllRanges();
                                selection.addRange(range);
                                editorElement.focus();
                            }
                        }
                    }
                } 
                else if (!savedPos.isContentEditable) {
                    // Restore cursor in textarea
                    let textarea = null;
                    // Try to use saved element if still valid
                    if (savedPos.element && savedPos.element.tagName === 'TEXTAREA' && document.body.contains(savedPos.element)) {
                        textarea = savedPos.element;
                    } else {
                        // Element was recreated, find it by data attributes
                        textarea = document.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"][data-field="${field}"]`);
                    }
                    
                    if (textarea && textarea.selectionStart !== undefined && textarea.selectionEnd !== undefined) {
                        textarea.focus();
                        textarea.setSelectionRange(savedPos.start, savedPos.end);
                    }
                }
            } catch (e) {
                // Silently fail if cursor restoration fails
            } finally {
                // Clean up saved position after attempting restore
                delete savedCursorPositions.current[fieldKey];
            }
            });
        });
    };

    // Start editing a field
    const handleStartEdit = (departmentNotesId, field, currentValue) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        setEditingFields(prev => ({ ...prev, [fieldKey]: true }));
        setTempFieldValues(prev => ({ ...prev, [fieldKey]: currentValue ?? '' }));
    };

    // Cancel editing a field
    const handleCancelEdit = (departmentNotesId, field) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        setEditingFields(prev => {
            const updated = { ...prev };
            delete updated[fieldKey];
            return updated;
        });
        setTempFieldValues(prev => {
            const updated = { ...prev };
            delete updated[fieldKey];
            return updated;
        });
    };

    // Update temporary value while editing
    const handleTempValueChange = (departmentNotesId, field, value) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        setTempFieldValues(prev => ({ ...prev, [fieldKey]: value }));
    };

    // Submit changes to a field
    const handleSubmitField = async (e, departmentNotesId, field) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        
        const fieldKey = getFieldKey(departmentNotesId, field);
        const value = tempFieldValues[fieldKey] ?? '';
        
        // Update local state immediately
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);

        // Save to database
        try {
            await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, { [field]: value });
            // Remove editing state after successful save
            setEditingFields(prev => {
                const updated = { ...prev };
                delete updated[fieldKey];
                return updated;
            });
            setTempFieldValues(prev => {
                const updated = { ...prev };
                delete updated[fieldKey];
                return updated;
            });
            
            // Restore scroll position after state updates
            requestAnimationFrame(() => {
                window.scrollTo(0, currentScrollPosition);
            });
        } catch (error) {
            console.error('Error updating department notes:', error);
            
            // Restore scroll position even on error
            requestAnimationFrame(() => {
                window.scrollTo(0, currentScrollPosition);
            });
            
            // Error logged silently - no popup messages
            console.error('Failed to update department notes.');
            // Reload to revert local changes on error
            if (selectedMonth) {
                await reloadMonthlyNotes(selectedMonth);
            }
            // Keep editing state on error so user can retry
        }
    };

    // Update department notes (kept for backwards compatibility, but no longer used for textareas)
    const handleUpdateDepartmentNotes = async (departmentNotesId, field, value) => {
        if (!departmentNotesId) {
            return;
        }

        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);

        try {
            await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, { [field]: value });
        } catch (error) {
            console.error('Error updating department notes:', error);
            // Error logged silently - no popup messages
            if (selectedMonth) {
                await reloadMonthlyNotes(selectedMonth);
            }
        }
    };

    // Save status refs removed - saves happen silently in background
    
    // Track the last saved value per field to avoid duplicate saves
    const lastSavedValues = useRef({});
    
    // Track current field values for UI responsiveness
    const currentFieldValues = useRef({});
    
    // Track pending values for unsaved changes
    const pendingValues = useRef({});
    
    // Debounce timer refs for field changes
    const fieldChangeDebounceTimers = useRef({});
    const DEBOUNCE_DELAY = 300; // 300ms debounce delay
    
    // Auto-save function - saves department notes after a delay (Google Docs style)
    const triggerAutoSave = useCallback(async (departmentNotesId) => {
        if (!departmentNotesId) return;
        
        // Find the department note to get current values
        const week = currentMonthlyNotes?.weeklyNotes?.find(w => 
            w.departmentNotes?.some(dn => dn.id === departmentNotesId)
        );
        if (!week) return;
        
        const deptNote = week.departmentNotes?.find(dn => dn.id === departmentNotesId);
        if (!deptNote) return;
        
        // Get current values - use ref (latest) with fallback to state
        // Since we debounce state updates, ref has the most recent values
        let attachments = [];
        try {
            if (deptNote.attachments) {
                attachments = typeof deptNote.attachments === 'string' 
                    ? JSON.parse(deptNote.attachments) 
                    : deptNote.attachments;
            }
        } catch (e) {
            console.warn('Error parsing attachments:', e);
        }
        
        // Get latest values from ref (updated immediately on typing) with fallback to state
        const successesKey = getFieldKey(departmentNotesId, 'successes');
        const weekToFollowKey = getFieldKey(departmentNotesId, 'weekToFollow');
        const frustrationsKey = getFieldKey(departmentNotesId, 'frustrations');
        
        const fieldsToSave = {
            successes: (currentFieldValues.current[successesKey] ?? deptNote.successes) || '',
            weekToFollow: (currentFieldValues.current[weekToFollowKey] ?? deptNote.weekToFollow) || '',
            frustrations: (currentFieldValues.current[frustrationsKey] ?? deptNote.frustrations) || '',
            attachments: JSON.stringify(attachments)
        };
        
        // Check if there are actual changes to save
        const lastSavedKey = `${departmentNotesId}`;
        const lastSaved = lastSavedValues.current[lastSavedKey];
        const currentHash = JSON.stringify(fieldsToSave);
        
        if (lastSaved === currentHash) {
            // No changes to save
            return;
        }
        
        try {
            // Set saving status
            setAutoSaveStatus(prev => ({ ...prev, [departmentNotesId]: 'saving' }));
            
            // Validate DatabaseAPI
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.updateDepartmentNotes !== 'function') {
                throw new Error('Database API is not available');
            }
            
            // Save to database
            const response = await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, fieldsToSave);
            
            if (!response) {
                throw new Error('No response from database API');
            }
            
            // Check for errors in response
            if (response.error || (response.message && response.message.toLowerCase().includes('error'))) {
                throw new Error(response.error || response.message);
            }
            
            // Save successful - update last saved hash
            lastSavedValues.current[lastSavedKey] = currentHash;
            
            // CRITICAL: Check if any editor is focused before updating state
            // If focused, delay state update to prevent cursor jumps
            const activeEl = document.activeElement;
            const isAnyEditorFocused = activeEl && (
                activeEl.contentEditable === 'true' || 
                (activeEl.tagName === 'TEXTAREA' && activeEl.getAttribute('data-dept-note-id'))
            );
            
            const monthlyId = currentMonthlyNotes?.id || null;
            
            if (isAnyEditorFocused) {
                // Editor is focused - delay state update to prevent cursor jumps
                // The DOM already has the correct content, we just saved it to DB
                // State update can happen after editor loses focus
                setTimeout(() => {
                    // Check again if still focused before updating
                    const stillFocused = document.activeElement && (
                        document.activeElement.contentEditable === 'true' || 
                        (document.activeElement.tagName === 'TEXTAREA' && 
                         document.activeElement.getAttribute('data-dept-note-id') === String(departmentNotesId))
                    );
                    
                    if (!stillFocused) {
                        updateDepartmentNotesLocalBatched(
                            departmentNotesId,
                            {
                                successes: fieldsToSave.successes,
                                weekToFollow: fieldsToSave.weekToFollow,
                                frustrations: fieldsToSave.frustrations,
                                attachments: fieldsToSave.attachments
                            },
                            monthlyId
                        );
                    }
                }, 1000); // Wait 1 second - user likely moved on
            } else {
                // No editor focused - safe to update state immediately
                updateDepartmentNotesLocalBatched(
                    departmentNotesId,
                    {
                        successes: fieldsToSave.successes,
                        weekToFollow: fieldsToSave.weekToFollow,
                        frustrations: fieldsToSave.frustrations,
                        attachments: fieldsToSave.attachments
                    },
                    monthlyId
                );
            }
            
            // Set saved status
            setAutoSaveStatus(prev => ({ ...prev, [departmentNotesId]: 'saved' }));
            
            // Clear "Saved" status after 2 seconds
            if (savedStatusTimers.current[departmentNotesId]) {
                clearTimeout(savedStatusTimers.current[departmentNotesId]);
            }
            savedStatusTimers.current[departmentNotesId] = setTimeout(() => {
                setAutoSaveStatus(prev => ({ ...prev, [departmentNotesId]: 'idle' }));
            }, 2000);
            
        } catch (error) {
            console.error('Auto-save error:', error);
            setAutoSaveStatus(prev => ({ ...prev, [departmentNotesId]: 'error' }));
            
            // Clear error status after 3 seconds
            setTimeout(() => {
                setAutoSaveStatus(prev => ({ ...prev, [departmentNotesId]: 'idle' }));
            }, 3000);
        }
    }, [currentMonthlyNotes, updateDepartmentNotesLocalBatched]);
    
    // Schedule auto-save with debouncing - called when any field changes
    const scheduleAutoSave = useCallback((departmentNotesId) => {
        // Clear any existing timer for this department
        if (autoSaveTimers.current[departmentNotesId]) {
            clearTimeout(autoSaveTimers.current[departmentNotesId]);
        }
        
        // Set new timer - saves after AUTO_SAVE_DELAY ms of inactivity
        autoSaveTimers.current[departmentNotesId] = setTimeout(() => {
            triggerAutoSave(departmentNotesId);
            delete autoSaveTimers.current[departmentNotesId];
        }, AUTO_SAVE_DELAY);
    }, [triggerAutoSave]);
    
    // Track field changes - with auto-save triggered after typing stops
    const handleFieldChange = (departmentNotesId, field, value) => {
        const fieldKey = getFieldKey(departmentNotesId, field);
        
        // Update ref immediately so auto-save has latest value
        try {
            currentFieldValues.current[fieldKey] = value;
        } catch (error) {
            if (error instanceof ReferenceError && error.message.includes('currentFieldValues')) {
                console.warn('currentFieldValues not accessible in handleFieldChange:', error.message);
            } else {
                throw error;
            }
        }
        
        // CRITICAL: Check if the editor is currently focused before updating React state
        // If focused, delay the state update to prevent cursor jumps
        const activeEl = document.activeElement;
        const isEditorFocused = activeEl && (
            activeEl.contentEditable === 'true' || 
            (activeEl.tagName === 'TEXTAREA' && activeEl.getAttribute('data-dept-note-id') === String(departmentNotesId))
        );
        
        if (isEditorFocused) {
            // Editor is focused - delay state update to prevent cursor jumps
            // Clear any existing timer for this field
            const stateUpdateKey = `stateUpdate_${fieldKey}`;
            if (window[stateUpdateKey]) {
                clearTimeout(window[stateUpdateKey]);
            }
            
            // Update state after user stops typing (500ms delay)
            window[stateUpdateKey] = setTimeout(() => {
                const monthlyId = currentMonthlyNotes?.id || null;
                updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);
                window[stateUpdateKey] = null;
            }, 500);
        } else {
            // Editor is not focused - update state immediately
            const monthlyId = currentMonthlyNotes?.id || null;
            updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);
        }
        
        // Debounce the pendingValues update to reduce excessive save checks
        // Clear existing timer for this field
        if (fieldChangeDebounceTimers.current[fieldKey]) {
            clearTimeout(fieldChangeDebounceTimers.current[fieldKey]);
        }
        
        // Set new timer to update pendingValues after user stops typing
        fieldChangeDebounceTimers.current[fieldKey] = setTimeout(() => {
            // Store the latest value for tracking unsaved changes
            pendingValues.current[fieldKey] = { departmentNotesId, field, value };
            // Clean up timer reference
            delete fieldChangeDebounceTimers.current[fieldKey];
        }, DEBOUNCE_DELAY);
        
        // Schedule auto-save after user stops typing (Google Docs style)
        scheduleAutoSave(departmentNotesId);
    };
    
    // Update field value on blur - triggers immediate save to prevent data loss
    const handleFieldBlur = (departmentNotesId, field, value) => {
        releaseDeptFieldFocus(departmentNotesId, field);
        // Update local state with the value
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, field, value, monthlyId);
        
        // Clear any pending auto-save timer and save immediately on blur
        // This ensures data is saved when user clicks away from the field
        if (autoSaveTimers.current[departmentNotesId]) {
            clearTimeout(autoSaveTimers.current[departmentNotesId]);
            delete autoSaveTimers.current[departmentNotesId];
        }
        
        // Trigger immediate save on blur
        triggerAutoSave(departmentNotesId);
    };

    const triggerGeneralMinutesSave = useCallback(
        async (weeklyNotesId) => {
            if (!weeklyNotesId || !window.DatabaseAPI || typeof window.DatabaseAPI.updateWeeklyNotes !== 'function') {
                return;
            }
            const monthlyId = currentMonthlyNotes?.id || null;
            const weekData = currentMonthlyNotes?.weeklyNotes?.find((w) => w.id === weeklyNotesId);
            const readHtml = () =>
                generalMinutesValuesRef.current[weeklyNotesId] !== undefined
                    ? generalMinutesValuesRef.current[weeklyNotesId]
                    : weekData?.generalMinutes ?? '';
            let hash = typeof readHtml() === 'string' ? readHtml() : '';
            if (lastSavedGeneralMinutesHash.current[weeklyNotesId] === hash) {
                return;
            }
            // Re-read immediately before the network: ref may have advanced (e.g. gm-thread-anchor wrap)
            // while an older save was scheduled or awaited — avoids PUTting stale HTML over newer content.
            const hashFresh = typeof readHtml() === 'string' ? readHtml() : '';
            if (hashFresh !== hash) {
                hash = hashFresh;
                if (lastSavedGeneralMinutesHash.current[weeklyNotesId] === hash) {
                    return;
                }
            }
            try {
                await window.DatabaseAPI.updateWeeklyNotes(weeklyNotesId, { generalMinutes: hash });
                const after = typeof readHtml() === 'string' ? readHtml() : '';
                if (after !== hash) {
                    void triggerGeneralMinutesSave(weeklyNotesId);
                    return;
                }
                lastSavedGeneralMinutesHash.current[weeklyNotesId] = hash;
                updateWeeklyNotesLocal(weeklyNotesId, { generalMinutes: hash }, monthlyId);
            } catch (error) {
                console.error('Error saving weekly general minutes:', error);
            }
        },
        [currentMonthlyNotes, updateWeeklyNotesLocal]
    );

    const scheduleGeneralMinutesSave = useCallback(
        (weeklyNotesId) => {
            if (!weeklyNotesId) {
                return;
            }
            if (generalMinutesTimers.current[weeklyNotesId]) {
                clearTimeout(generalMinutesTimers.current[weeklyNotesId]);
            }
            generalMinutesTimers.current[weeklyNotesId] = setTimeout(() => {
                void triggerGeneralMinutesSave(weeklyNotesId);
                delete generalMinutesTimers.current[weeklyNotesId];
            }, AUTO_SAVE_DELAY);
        },
        [triggerGeneralMinutesSave]
    );

    const handleGeneralMinutesChange = (weeklyNotesId, html) => {
        if (!weeklyNotesId) {
            return;
        }
        generalMinutesValuesRef.current[weeklyNotesId] = html;
        scheduleGeneralMinutesSave(weeklyNotesId);
    };

    const handleGeneralMinutesBlur = (weeklyNotesId, html) => {
        if (!weeklyNotesId) {
            return;
        }
        generalMinutesValuesRef.current[weeklyNotesId] = html;
        if (generalMinutesTimers.current[weeklyNotesId]) {
            clearTimeout(generalMinutesTimers.current[weeklyNotesId]);
            delete generalMinutesTimers.current[weeklyNotesId];
        }
        void triggerGeneralMinutesSave(weeklyNotesId);
    };

    // Live sync: SSE push on any save + 1s poll fallback — merges all month fields for every viewer
    useEffect(() => {
        if (!isAdminUser || !selectedMonth) {
            return undefined;
        }
        let cancelled = false;
        let liveStream = null;

        const mergeDepartmentNoteFromRemote = (remoteDn, localDn, editingActionItemId) => {
            if (!localDn) {
                return remoteDn;
            }
            const focused = deptFieldFocusRef.current;
            const uploading = uploadingAttachmentsRef.current || {};
            const merged = { ...remoteDn };
            for (const field of MEETING_NOTES_DEPT_TEXT_FIELDS) {
                const isFocused =
                    focused &&
                    focused.departmentNotesId === remoteDn.id &&
                    focused.field === field;
                if (!isFocused) {
                    continue;
                }
                const fieldKey = `${remoteDn.id}-${field}`;
                merged[field] =
                    (currentFieldValues.current[fieldKey] ?? localDn[field] ?? remoteDn[field]) || '';
            }
            if (uploading[remoteDn.id]) {
                merged.attachments = localDn.attachments ?? remoteDn.attachments;
            }
            merged.actionItems = mergeMeetingNotesActionItems(
                remoteDn.actionItems,
                localDn.actionItems,
                editingActionItemId
            );
            merged.comments = remoteDn.comments;
            merged.agendaPoints = remoteDn.agendaPoints;
            merged.assignedUserId =
                remoteDn.assignedUserId !== undefined ? remoteDn.assignedUserId : localDn.assignedUserId;
            return merged;
        };

        const mergeMonthNote = (prevNote, remoteNote) => {
            if (!prevNote || !remoteNote || prevNote.id !== remoteNote.id) {
                return prevNote;
            }
            const editingActionItemId = editingActionItemRef.current?.id || null;
            const prevWeekMap = new Map((prevNote.weeklyNotes || []).map((w) => [w.id, w]));
            const lockedGmWeekId = generalMinutesEditingWeekIdRef.current;
            const editingGoalsDeptId = monthlyGoalsEditingDeptIdRef.current;
            const gmPopoverActive = !!gmMinuteInlinePopoverRef.current;

            const mergedWeeks = (remoteNote.weeklyNotes || []).map((rw) => {
                const lw = prevWeekMap.get(rw.id);
                let week = { ...rw };
                const uploadingGm = uploadingGeneralMinutesAttachmentsRef.current || {};
                if (uploadingGm[rw.id] && lw) {
                    week.generalMinutesAttachments = lw.generalMinutesAttachments ?? rw.generalMinutesAttachments;
                }
                if (lockedGmWeekId && rw.id === lockedGmWeekId && lw) {
                    week.generalMinutes = lw.generalMinutes ?? rw.generalMinutes ?? '';
                    if (!uploadingGm[rw.id]) {
                        week.generalMinutesAttachments =
                            lw.generalMinutesAttachments !== undefined && lw.generalMinutesAttachments !== null
                                ? lw.generalMinutesAttachments
                                : rw.generalMinutesAttachments;
                    }
                    if (!gmPopoverActive) {
                        week.generalMinutesThreads =
                            lw.generalMinutesThreads !== undefined && lw.generalMinutesThreads !== null
                                ? lw.generalMinutesThreads
                                : rw.generalMinutesThreads;
                    }
                }
                week.actionItems = mergeMeetingNotesActionItems(
                    rw.actionItems,
                    lw?.actionItems,
                    editingActionItemId
                );
                if (lw && Array.isArray(week.departmentNotes)) {
                    const localDnMap = new Map((lw.departmentNotes || []).map((dn) => [dn.id, dn]));
                    week.departmentNotes = week.departmentNotes.map((rdn) =>
                        mergeDepartmentNoteFromRemote(
                            rdn,
                            localDnMap.get(rdn.id),
                            editingActionItemId
                        )
                    );
                }
                return week;
            });

            let monthlyGoals = remoteNote.monthlyGoals ?? prevNote.monthlyGoals;
            if (editingGoalsDeptId) {
                const remoteGoals = normalizeMonthlyGoalsByDepartment(remoteNote.monthlyGoals);
                const localGoals = normalizeMonthlyGoalsByDepartment(prevNote.monthlyGoals);
                monthlyGoals = JSON.stringify({
                    ...remoteGoals,
                    [editingGoalsDeptId]: localGoals[editingGoalsDeptId] ?? remoteGoals[editingGoalsDeptId] ?? ''
                });
            }

            const userAllocations = showAllocationModalRef.current
                ? prevNote.userAllocations
                : remoteNote.userAllocations ?? prevNote.userAllocations;

            return {
                ...prevNote,
                status: remoteNote.status ?? prevNote.status,
                monthKey: remoteNote.monthKey ?? prevNote.monthKey,
                monthlyGoals,
                userAllocations,
                comments: remoteNote.comments ?? prevNote.comments,
                actionItems: mergeMeetingNotesActionItems(
                    remoteNote.actionItems,
                    prevNote.actionItems,
                    editingActionItemId
                ),
                weeklyNotes: mergedWeeks
            };
        };

        const applyRemoteMonth = (remote) => {
            if (!remote || cancelled) {
                return;
            }
            const sig = meetingNotesPayloadSignature(remote);
            if (sig && sig === lastLivePayloadSigRef.current) {
                return;
            }
            setCurrentMonthlyNotes((prev) => {
                const merged = mergeMonthNote(prev, remote);
                const mergedSig = meetingNotesPayloadSignature(merged);
                if (mergedSig === meetingNotesPayloadSignature(prev)) {
                    return prev;
                }
                lastLivePayloadSigRef.current = meetingNotesPayloadSignature(remote);
                return merged;
            });
            setMonthlyNotesList((prevList) => {
                if (!Array.isArray(prevList)) {
                    return prevList;
                }
                return prevList.map((note) =>
                    note?.monthKey === selectedMonth ? mergeMonthNote(note, remote) : note
                );
            });
        };

        const fetchAndApply = async () => {
            if (cancelled || document.hidden || liveFetchInFlightRef.current) {
                return;
            }
            if (!window.DatabaseAPI?.getMeetingNotes) {
                return;
            }
            liveFetchInFlightRef.current = true;
            try {
                const res = await window.DatabaseAPI.getMeetingNotes(selectedMonth, {
                    bustCache: true,
                    forceRefresh: true
                });
                const remote = res?.data?.monthlyNotes || res?.monthlyNotes;
                applyRemoteMonth(remote);
            } catch (_) {
                /* silent — live sync is best-effort */
            } finally {
                liveFetchInFlightRef.current = false;
            }
        };

        if (typeof window.DatabaseAPI?.openMeetingNotesLiveStream === 'function') {
            liveStream = window.DatabaseAPI.openMeetingNotesLiveStream(selectedMonth, () => {
                void fetchAndApply();
            });
        }

        const pollId = setInterval(() => {
            if (!document.hidden) {
                void fetchAndApply();
            }
        }, MEETING_NOTES_LIVE_POLL_MS);

        void fetchAndApply();

        return () => {
            cancelled = true;
            clearInterval(pollId);
            liveStream?.close?.();
        };
    }, [isAdminUser, selectedMonth]);

    // Presence: who else is on this month’s meeting notes (same server process; in-memory)
    useEffect(() => {
        if (!isAdminUser || !meetingNotesRoomKey || !window.DatabaseAPI?.heartbeatMeetingNotesPresence) {
            return undefined;
        }
        const pulse = () => {
            void window.DatabaseAPI.heartbeatMeetingNotesPresence(meetingNotesRoomKey).catch(() => {});
        };
        pulse();
        const iv = setInterval(pulse, 15000);
        return () => clearInterval(iv);
    }, [isAdminUser, meetingNotesRoomKey]);

    useEffect(() => {
        if (!isAdminUser || !meetingNotesRoomKey || !window.DatabaseAPI?.getMeetingNotesPresence) {
            setPresenceViewers([]);
            return undefined;
        }
        const load = async () => {
            try {
                const res = await window.DatabaseAPI.getMeetingNotesPresence(meetingNotesRoomKey);
                const viewers = res?.data?.viewers ?? res?.viewers ?? [];
                setPresenceViewers(Array.isArray(viewers) ? viewers : []);
            } catch (e) {
                setPresenceViewers([]);
            }
        };
        void load();
        const iv = setInterval(() => {
            if (!document.hidden) {
                void load();
            }
        }, 15000);
        return () => clearInterval(iv);
    }, [isAdminUser, meetingNotesRoomKey]);
    
    // Handle file upload for attachments
    const handleAttachmentUpload = async (departmentNotesId, files) => {
        if (!files || files.length === 0) return;
        
        setUploadingAttachments(prev => ({ ...prev, [departmentNotesId]: true }));
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('Not authenticated');
            }
            
            const uploadedAttachments = [];
            
            // Upload each file
            for (const file of Array.from(files)) {
                // Convert file to base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onload = () => {
                        const dataUrl = reader.result;
                        resolve(dataUrl);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                
                const dataUrl = await base64Promise;
                
                // Upload to server
                const response = await fetch('/api/files', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: file.name,
                        dataUrl: dataUrl,
                        folder: 'meeting-notes'
                    })
                });
                
                if (!response.ok) {
                    throw new Error(`Failed to upload ${file.name}`);
                }
                
                const result = await response.json();
                uploadedAttachments.push({
                    name: file.name,
                    url: result.data?.url || result.url,
                    size: file.size,
                    mimeType: file.type,
                    uploadedAt: new Date().toISOString()
                });
            }
            
            // Get current attachments
            const week = currentMonthlyNotes?.weeklyNotes?.find(w => 
                w.departmentNotes?.some(dn => dn.id === departmentNotesId)
            );
            const deptNote = week?.departmentNotes?.find(dn => dn.id === departmentNotesId);
            
            let currentAttachments = [];
            try {
                if (deptNote?.attachments) {
                    currentAttachments = typeof deptNote.attachments === 'string' 
                        ? JSON.parse(deptNote.attachments) 
                        : deptNote.attachments;
                }
            } catch (e) {
                console.warn('Error parsing attachments:', e);
            }
            
            // Add new attachments
            const updatedAttachments = [...currentAttachments, ...uploadedAttachments];
            
            // Update local state
            const monthlyId = currentMonthlyNotes?.id || null;
            updateDepartmentNotesLocal(departmentNotesId, 'attachments', JSON.stringify(updatedAttachments), monthlyId);
            
            // Trigger auto-save for attachment changes
            triggerAutoSave(departmentNotesId);
            
        } catch (error) {
            console.error('Error uploading attachments:', error);
            alert(`Failed to upload files: ${error.message}`);
        } finally {
            setUploadingAttachments(prev => ({ ...prev, [departmentNotesId]: false }));
            setAttachmentInputs(prev => ({ ...prev, [departmentNotesId]: null }));
        }
    };

    const handleGeneralMinutesAttachmentUpload = async (weeklyNotesId, files) => {
        if (!weeklyNotesId || !files || files.length === 0) return;

        setUploadingGeneralMinutesAttachments((prev) => ({ ...prev, [weeklyNotesId]: true }));

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('Not authenticated');
            }

            const uploadedAttachments = [];

            for (const file of Array.from(files)) {
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const response = await fetch('/api/files', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: file.name,
                        dataUrl,
                        folder: 'meeting-notes-general'
                    })
                });

                if (!response.ok) {
                    throw new Error(`Failed to upload ${file.name}`);
                }

                const result = await response.json();
                uploadedAttachments.push({
                    name: file.name,
                    url: result.data?.url || result.url,
                    size: file.size,
                    mimeType: file.type,
                    uploadedAt: new Date().toISOString()
                });
            }

            const weekData = currentMonthlyNotes?.weeklyNotes?.find((w) => w.id === weeklyNotesId);
            let currentAttachments = [];
            try {
                const raw = weekData?.generalMinutesAttachments;
                if (raw) {
                    currentAttachments = typeof raw === 'string' ? JSON.parse(raw) : raw;
                }
            } catch (e) {
                console.warn('Error parsing general minutes attachments:', e);
            }

            const updatedAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), ...uploadedAttachments];
            const json = JSON.stringify(updatedAttachments);
            const monthlyId = currentMonthlyNotes?.id || null;

            await window.DatabaseAPI.updateWeeklyNotes(weeklyNotesId, { generalMinutesAttachments: json });
            updateWeeklyNotesLocal(weeklyNotesId, { generalMinutesAttachments: json }, monthlyId);
        } catch (error) {
            console.error('Error uploading general minutes attachments:', error);
            alert(`Failed to upload files: ${error.message}`);
        } finally {
            setUploadingGeneralMinutesAttachments((prev) => ({ ...prev, [weeklyNotesId]: false }));
        }
    };

    const handleDeleteGeneralMinutesAttachment = async (weeklyNotesId, attachmentIndex) => {
        const weekData = currentMonthlyNotes?.weeklyNotes?.find((w) => w.id === weeklyNotesId);
        if (!weekData) return;

        let currentAttachments = [];
        try {
            const raw = weekData.generalMinutesAttachments;
            if (raw) {
                currentAttachments = typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
        } catch (e) {
            console.warn('Error parsing general minutes attachments:', e);
        }

        const updatedAttachments = currentAttachments.filter((_, index) => index !== attachmentIndex);
        const json = JSON.stringify(updatedAttachments);
        const monthlyId = currentMonthlyNotes?.id || null;

        try {
            await window.DatabaseAPI.updateWeeklyNotes(weeklyNotesId, { generalMinutesAttachments: json });
            updateWeeklyNotesLocal(weeklyNotesId, { generalMinutesAttachments: json }, monthlyId);
        } catch (error) {
            console.error('Error removing general minutes attachment:', error);
            alert(`Failed to remove attachment: ${error.message}`);
        }
    };
    
    // Handle attachment deletion
    const handleDeleteAttachment = (departmentNotesId, attachmentIndex) => {
        const week = currentMonthlyNotes?.weeklyNotes?.find(w => 
            w.departmentNotes?.some(dn => dn.id === departmentNotesId)
        );
        const deptNote = week?.departmentNotes?.find(dn => dn.id === departmentNotesId);
        
        if (!deptNote) return;
        
        let currentAttachments = [];
        try {
            if (deptNote.attachments) {
                currentAttachments = typeof deptNote.attachments === 'string' 
                    ? JSON.parse(deptNote.attachments) 
                    : deptNote.attachments;
            }
        } catch (e) {
            console.warn('Error parsing attachments:', e);
        }
        
        // Remove attachment at index
        const updatedAttachments = currentAttachments.filter((_, index) => index !== attachmentIndex);
        
        // Update local state
        const monthlyId = currentMonthlyNotes?.id || null;
        updateDepartmentNotesLocal(departmentNotesId, 'attachments', JSON.stringify(updatedAttachments), monthlyId);
        
        // Trigger auto-save for attachment deletion
        triggerAutoSave(departmentNotesId);
    };

    // Save all fields for a department at once
    const handleSaveDepartment = async (departmentNotesId, event = null) => {
        console.log('💾 handleSaveDepartment called:', { departmentNotesId, hasEvent: !!event });
        
        if (!departmentNotesId) {
            console.error('❌ No departmentNotesId provided');
            return;
        }
        
        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before save:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);
        
        // Find the department note
        const week = currentMonthlyNotes?.weeklyNotes?.find(w => 
            w.departmentNotes?.some(dn => dn.id === departmentNotesId)
        );
        if (!week) {
            console.error('Week not found for departmentNotesId:', departmentNotesId);
            return;
        }
        
        const deptNote = week.departmentNotes?.find(dn => dn.id === departmentNotesId);
        if (!deptNote) {
            console.error('Department note not found:', departmentNotesId);
            return;
        }
        
        // CRITICAL: Get field values directly from DOM (RichTextEditor contentEditable divs)
        // This ensures we capture the latest content even if React state hasn't updated yet
        // Strategy: Find the Save button that was clicked, traverse up to find department section,
        // then find all contentEditable divs in order (successes, weekToFollow, frustrations)
        
        // Get the event target (Save button) - prefer event.target if provided
        let saveButtonElement = null;
        try {
            // First try to use the event target if provided
            if (event && event.target) {
                // Find the button element (might be the icon or text node)
                saveButtonElement = event.target.closest('button');
            }
            
            // If not found, try to get the active element
            if (!saveButtonElement) {
                saveButtonElement = document.activeElement;
                // Verify it's actually a button
                if (saveButtonElement && saveButtonElement.tagName !== 'BUTTON') {
                    saveButtonElement = null;
                }
            }
            
            // If still not found, find all Save buttons and match by context
            if (!saveButtonElement || !saveButtonElement.textContent?.includes('Save')) {
                // Find buttons with "Save" text (not just "Save Department")
                const allSaveButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    const text = btn.textContent || '';
                    return text.includes('Save') && !text.includes('Save All');
                });
                
                // Try to find the one in the same department section by traversing from department note data attributes
                // Find textareas with matching department note ID to locate the right section
                const deptTextarea = document.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"]`);
                if (deptTextarea && allSaveButtons.length > 0) {
                    // Find the Save button closest to this textarea
                    const deptSection = deptTextarea.closest('[class*="rounded"], [class*="space-y"]');
                    if (deptSection) {
                        const sectionSaveButton = deptSection.querySelector('button');
                        if (sectionSaveButton && sectionSaveButton.textContent?.includes('Save')) {
                            saveButtonElement = sectionSaveButton;
                        }
                    }
                }
                
                // Fallback to first Save button if still not found
                if (!saveButtonElement && allSaveButtons.length > 0) {
                    saveButtonElement = allSaveButtons[0];
                }
            }
        } catch (e) {
            console.warn('Could not find save button element:', e);
        }
        
        const getCurrentFieldValue = (fieldName) => {
            // Strategy 1: Use React state first (updated immediately by handleFieldChange) - most reliable
            const stateValue = deptNote[fieldName] || '';
            
            // Strategy 2: Try to get from DOM contentEditable (for RichTextEditor)
            // Find department section by traversing from Save button
            let departmentSection = null;
            
            if (saveButtonElement) {
                // Traverse up to find the department container
                let current = saveButtonElement.parentElement;
                let depth = 0;
                while (current && depth < 15) {
                    // Look for contentEditable divs or textareas with our department note ID
                    const hasContentEditable = current.querySelectorAll('[contenteditable="true"]').length >= 3;
                    const hasDeptTextarea = current.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"]`);
                    
                    if (hasContentEditable || hasDeptTextarea) {
                        departmentSection = current;
                        break;
                    }
                    current = current.parentElement;
                    depth++;
                }
            }
            
            // Strategy 3: Find by textarea with department note ID
            if (!departmentSection) {
                const anyDeptTextarea = document.querySelector(`textarea[data-dept-note-id="${departmentNotesId}"]`);
                if (anyDeptTextarea) {
                    departmentSection = anyDeptTextarea.closest('[class*="space-y"], [class*="rounded"], div');
                }
            }
            
            // Strategy 4: If we found the department section, try to get value from DOM
            if (departmentSection) {
                // Try to find by data-field attribute first
                const fieldByAttribute = departmentSection.querySelector(`[data-field="${fieldName}"]`);
                if (fieldByAttribute) {
                    if (fieldByAttribute.tagName === 'TEXTAREA' && fieldByAttribute.value !== undefined) {
                        const domValue = fieldByAttribute.value;
                        // Use DOM value if it's different (more recent) than state
                        if (domValue !== stateValue) {
                            console.log(`📝 Using DOM value for ${fieldName} (more recent than state)`);
                            return domValue;
                        }
                    }
                    if (fieldByAttribute.contentEditable === 'true' && fieldByAttribute.innerHTML !== undefined) {
                        const domValue = fieldByAttribute.innerHTML;
                        // Clean empty HTML
                        if (domValue && domValue.trim() && domValue !== '<br>' && domValue !== '<div><br></div>') {
                            if (domValue !== stateValue) {
                                console.log(`📝 Using DOM value for ${fieldName} (more recent than state)`);
                                return domValue;
                            }
                        }
                    }
                }
                
                // Find all contentEditable divs in this section
                const editors = Array.from(departmentSection.querySelectorAll('[contenteditable="true"]'));
                
                // Match by field order: successes (0), weekToFollow (1), frustrations (2)
                const fieldIndex = fieldName === 'successes' ? 0 : 
                                  fieldName === 'weekToFollow' ? 1 : 
                                  fieldName === 'frustrations' ? 2 : -1;
                
                if (fieldIndex >= 0 && editors[fieldIndex] && editors[fieldIndex].innerHTML !== undefined) {
                    const html = editors[fieldIndex].innerHTML;
                    // Return if it's not just a placeholder or whitespace
                    if (html && html.trim() && html !== '<br>' && html !== '<div><br></div>') {
                        if (html !== stateValue) {
                            console.log(`📝 Using DOM contentEditable value for ${fieldName} (more recent than state)`);
                            return html;
                        }
                    }
                }
                
                // Also try textareas in order
                const textareas = Array.from(departmentSection.querySelectorAll(`textarea[data-dept-note-id="${departmentNotesId}"]`));
                if (fieldIndex >= 0 && textareas[fieldIndex] && textareas[fieldIndex].value !== undefined) {
                    const domValue = textareas[fieldIndex].value;
                    if (domValue !== stateValue) {
                        console.log(`📝 Using DOM textarea value for ${fieldName} (more recent than state)`);
                        return domValue;
                    }
                }
            }
            
            // Strategy 5: Fallback to React state (should be up-to-date from handleFieldChange)
            return stateValue;
        };
        
        // Get current values - prefer React state (updated immediately), fallback to DOM
        // Get attachments from state
        let attachments = [];
        try {
            if (deptNote.attachments) {
                attachments = typeof deptNote.attachments === 'string' 
                    ? JSON.parse(deptNote.attachments) 
                    : deptNote.attachments;
            }
        } catch (e) {
            console.warn('Error parsing attachments:', e);
        }
        
        const fieldsToSave = {
            successes: getCurrentFieldValue('successes'),
            weekToFollow: getCurrentFieldValue('weekToFollow'),
            frustrations: getCurrentFieldValue('frustrations'),
            attachments: JSON.stringify(attachments)
        };
        
        console.log('💾 Captured field values for save:', { 
            departmentNotesId, 
            fieldsToSave,
            stateValues: {
            successes: deptNote.successes || '',
            weekToFollow: deptNote.weekToFollow || '',
            frustrations: deptNote.frustrations || ''
            }
        });
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
            console.log('💾 Saving department notes to DB:', { departmentNotesId, fieldsToSave });
            
            // CRITICAL: Save any unsaved action items for this department before saving department notes
            // Action items with temp IDs (starting with "temp-") haven't been saved yet
            const unsavedActionItems = (deptNote.actionItems || []).filter(item => 
                item.id && typeof item.id === 'string' && item.id.startsWith('temp-')
            );
            
            if (unsavedActionItems.length > 0) {
                console.log(`💾 Saving ${unsavedActionItems.length} unsaved action items before department save...`);
                // Save each unsaved action item
                for (const actionItem of unsavedActionItems) {
                    try {
                        // Prepare action item data for saving (remove temp ID)
                        const actionItemData = {
                            ...actionItem,
                            departmentNotesId: departmentNotesId,
                            monthlyNotesId: currentMonthlyNotes?.id || null,
                            weeklyNotesId: week.id || null
                        };
                        // Remove the temp ID - server will assign a real ID
                        delete actionItemData.id;
                        
                        const response = await window.DatabaseAPI.createActionItem(actionItemData);
                        const savedActionItem = response?.data?.actionItem || response?.actionItem;
                        
                        if (savedActionItem) {
                            // Track temp ID mapping
                            if (actionItem.id) {
                                tempActionItemIds.current[actionItem.id] = savedActionItem.id;
                            }
                            // Update local state with real ID
                            updateActionItemLocal(savedActionItem, false, actionItem.id);
                            console.log(`✅ Saved action item: ${actionItem.title}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error saving action item "${actionItem.title}":`, error);
                        // Continue saving other action items even if one fails
                    }
                }
            }
            
            // Validate that we have a valid departmentNotesId
            if (!departmentNotesId || typeof departmentNotesId !== 'string') {
                throw new Error('Invalid department notes ID');
            }
            
            // Validate that DatabaseAPI is available
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.updateDepartmentNotes !== 'function') {
                throw new Error('Database API is not available. Please refresh the page.');
            }
            
            // Save to database
            console.log('💾 Calling updateDepartmentNotes with:', { departmentNotesId, fieldsToSave });
            const response = await window.DatabaseAPI.updateDepartmentNotes(departmentNotesId, fieldsToSave);
            
            if (!response) {
                throw new Error('No response from database API');
            }
            
            // Check if response indicates an error
            if (response.error || response.message) {
                const errorMsg = response.error || response.message;
                if (errorMsg.toLowerCase().includes('error') || errorMsg.toLowerCase().includes('fail')) {
                    throw new Error(errorMsg);
                }
            }
            
            console.log('✅ Successfully saved to database:', response);
            
            // Update local state immediately with saved values (NO PAGE REFRESH, NO RELOAD)
            // This ensures the saved data appears on screen right away without any reload
            const monthlyId = currentMonthlyNotes?.id || null;
            
            // CRITICAL: Use batched update to prevent multiple re-renders that cause scroll jumps
            // Update all three fields in a single state update instead of three separate updates
            // This prevents the page from jumping to top after save
                    updateDepartmentNotesLocalBatched(
                        departmentNotesId,
                        {
                            successes: fieldsToSave.successes,
                            weekToFollow: fieldsToSave.weekToFollow,
                            frustrations: fieldsToSave.frustrations,
                            attachments: fieldsToSave.attachments
                        },
                        monthlyId
                    );
            
            // No notifications - save happens silently
            
            // CRITICAL: Restore scroll position IMMEDIATELY after batched state update
            // Use synchronous scroll restoration to prevent any jump
            if (preservedScrollPosition.current !== null) {
                const scrollY = preservedScrollPosition.current;
                
                // Immediate synchronous restoration (before React re-renders)
                window.scrollTo({ top: scrollY, behavior: 'instant' });
                
                // Additional restoration attempts to handle any async DOM updates
                requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                });
                
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 0);
                
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 10);
                
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 50);
            }
            
            // DO NOT RELOAD - Just update local state and continue
            // No reloadMonthlyNotes call - data is already updated locally
            
        } catch (error) {
            console.error('❌ Error saving department notes:', error);
            
            // Scroll position is preserved via preservedScrollPosition ref and useEffect
            // No need for manual restoration here - useEffect will handle it
            
            // Error logged silently - no popup messages
        } finally {
            setSaving(false); // Use saving state instead of loading
        }
    };

    // Track temp IDs to prevent duplicates when server responds
    const tempActionItemIds = useRef({}); // { tempId: realId }

    // Helper function to update action items in local state
    const updateActionItemLocal = useCallback((actionItem, isNew = false, tempId = null) => {
        const applyUpdate = (note) => {
            if (!note) return note;

            // Update monthly action items
            if (actionItem.monthlyNotesId && !actionItem.weeklyNotesId && !actionItem.departmentNotesId) {
                const monthlyActionItems = Array.isArray(note.actionItems) ? [...note.actionItems] : [];
                if (isNew) {
                    // Check if this temp item already exists (to prevent duplicates)
                    if (tempId && tempActionItemIds.current[tempId]) {
                        // Replace temp item with real item
                        const tempIndex = monthlyActionItems.findIndex(item => item.id === tempId);
                        if (tempIndex >= 0) {
                            monthlyActionItems[tempIndex] = actionItem;
                        } else {
                            // Check if real item already exists
                            const realIndex = monthlyActionItems.findIndex(item => item.id === actionItem.id);
                            if (realIndex >= 0) {
                                monthlyActionItems[realIndex] = actionItem;
                            } else {
                    monthlyActionItems.push(actionItem);
                            }
                        }
                    } else {
                        // Check if item with same ID already exists
                        const existingIndex = monthlyActionItems.findIndex(item => item.id === actionItem.id);
                        if (existingIndex >= 0) {
                            monthlyActionItems[existingIndex] = actionItem;
                        } else {
                            monthlyActionItems.push(actionItem);
                        }
                    }
                } else {
                    const index = monthlyActionItems.findIndex(item => item.id === actionItem.id);
                    if (index >= 0) {
                        monthlyActionItems[index] = actionItem;
                    } else {
                        // Check if there's a temp version to replace
                        if (tempId && tempActionItemIds.current[tempId]) {
                            const tempIndex = monthlyActionItems.findIndex(item => item.id === tempId);
                            if (tempIndex >= 0) {
                                monthlyActionItems[tempIndex] = actionItem;
                    } else {
                        monthlyActionItems.push(actionItem);
                            }
                        } else {
                            monthlyActionItems.push(actionItem);
                        }
                    }
                }
                return { ...note, actionItems: monthlyActionItems };
            }

            // Update weekly or department action items
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Update weekly-level action items
                      if (actionItem.weeklyNotesId === week.id && !actionItem.departmentNotesId) {
                          const weeklyActionItems = Array.isArray(week.actionItems) ? [...week.actionItems] : [];
                          if (isNew) {
                              if (tempId && tempActionItemIds.current[tempId]) {
                                  const tempIndex = weeklyActionItems.findIndex(item => item.id === tempId);
                                  if (tempIndex >= 0) {
                                      weeklyActionItems[tempIndex] = actionItem;
                                  } else {
                                      const realIndex = weeklyActionItems.findIndex(item => item.id === actionItem.id);
                                      if (realIndex >= 0) {
                                          weeklyActionItems[realIndex] = actionItem;
                                      } else {
                              weeklyActionItems.push(actionItem);
                                      }
                                  }
                              } else {
                                  const existingIndex = weeklyActionItems.findIndex(item => item.id === actionItem.id);
                                  if (existingIndex >= 0) {
                                      weeklyActionItems[existingIndex] = actionItem;
                                  } else {
                                      weeklyActionItems.push(actionItem);
                                  }
                              }
                          } else {
                              const index = weeklyActionItems.findIndex(item => item.id === actionItem.id);
                              if (index >= 0) {
                                  weeklyActionItems[index] = actionItem;
                              } else {
                                  if (tempId && tempActionItemIds.current[tempId]) {
                                      const tempIndex = weeklyActionItems.findIndex(item => item.id === tempId);
                                      if (tempIndex >= 0) {
                                          weeklyActionItems[tempIndex] = actionItem;
                              } else {
                                  weeklyActionItems.push(actionItem);
                                      }
                                  } else {
                                      weeklyActionItems.push(actionItem);
                                  }
                              }
                          }
                          return { ...week, actionItems: weeklyActionItems };
                      }

                      // Update department-level action items
                      if (actionItem.departmentNotesId && week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (deptNote.id === actionItem.departmentNotesId) {
                                  const deptActionItems = Array.isArray(deptNote.actionItems) ? [...deptNote.actionItems] : [];
                                  if (isNew) {
                                      if (tempId && tempActionItemIds.current[tempId]) {
                                          const tempIndex = deptActionItems.findIndex(item => item.id === tempId);
                                          if (tempIndex >= 0) {
                                              deptActionItems[tempIndex] = actionItem;
                                          } else {
                                              const realIndex = deptActionItems.findIndex(item => item.id === actionItem.id);
                                              if (realIndex >= 0) {
                                                  deptActionItems[realIndex] = actionItem;
                                              } else {
                                      deptActionItems.push(actionItem);
                                              }
                                          }
                                      } else {
                                          const existingIndex = deptActionItems.findIndex(item => item.id === actionItem.id);
                                          if (existingIndex >= 0) {
                                              deptActionItems[existingIndex] = actionItem;
                                          } else {
                                              deptActionItems.push(actionItem);
                                          }
                                      }
                                  } else {
                                      const index = deptActionItems.findIndex(item => item.id === actionItem.id);
                                      if (index >= 0) {
                                          deptActionItems[index] = actionItem;
                                      } else {
                                          if (tempId && tempActionItemIds.current[tempId]) {
                                              const tempIndex = deptActionItems.findIndex(item => item.id === tempId);
                                              if (tempIndex >= 0) {
                                                  deptActionItems[tempIndex] = actionItem;
                                      } else {
                                          deptActionItems.push(actionItem);
                                              }
                                          } else {
                                              deptActionItems.push(actionItem);
                                          }
                                      }
                                  }
                                  return { ...deptNote, actionItems: deptActionItems };
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyUpdate(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyUpdate(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Create/Update action item
    const handleSaveActionItem = async (actionItemData) => {
        try {
            // Prevent any default behavior and preserve scroll position
            const currentScrollPosition = window.scrollY || window.pageYOffset;
            preservedScrollPosition.current = currentScrollPosition;
            console.log('💾 Preserving scroll position before action item save:', currentScrollPosition);
            // Trigger scroll restoration effect
            setScrollRestoreTrigger(prev => prev + 1);
            
            // Validate required fields
            if (!actionItemData.title || !actionItemData.title.trim()) {
                // Title required - validation handled silently
                return;
            }

            // Ensure monthlyNotesId is set if not provided
            if (!actionItemData.monthlyNotesId && currentMonthlyNotes?.id) {
                actionItemData.monthlyNotesId = currentMonthlyNotes.id;
            }

            const isUpdate = !!editingActionItem?.id;
            const tempId = isUpdate ? null : `temp-${Date.now()}`;
            const tempActionItem = {
                ...actionItemData,
                id: editingActionItem?.id || tempId,
                createdAt: editingActionItem?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            // Optimistic update - show immediately (only if creating new)
            if (!isUpdate) {
                updateActionItemLocal(tempActionItem, true, tempId);
            }
            setShowActionItemModal(false);
            setEditingActionItem(null);
            
            // Scroll position is preserved via preservedScrollPosition ref and useEffect
            // No need for manual restoration here - useEffect will handle it

            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing

            let response;
            // Check if we're updating (has id) or creating (no id)
            if (isUpdate) {
                // Update existing action item
                response = await window.DatabaseAPI.updateActionItem(editingActionItem.id, actionItemData);
            } else {
                // Create new action item
                response = await window.DatabaseAPI.createActionItem(actionItemData);
            }
            
            
            // Get the actual action item from response
            const savedActionItem = response?.data?.actionItem || response?.actionItem;
            if (savedActionItem) {
                // Track temp ID mapping to prevent duplicates
                if (tempId && !isUpdate) {
                    tempActionItemIds.current[tempId] = savedActionItem.id;
                }
                // Update with server response (includes real ID and timestamps)
                // Replace temp item with real item
                updateActionItemLocal(savedActionItem, false, tempId);
                
                // Aggressively restore scroll position after state update
                if (preservedScrollPosition.current !== null) {
                    const scrollY = preservedScrollPosition.current;
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    });
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 0);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 10);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 50);
                }
                
                // Clean up temp ID mapping after a delay
                if (tempId) {
                    setTimeout(() => {
                        delete tempActionItemIds.current[tempId];
                    }, 5000);
                }
            } else if (response?.success) {
                // If response just indicates success, refresh from server in background
                window.DatabaseAPI.getMeetingNotes(selectedMonth)
                    .then(monthResponse => {
                        if (monthResponse?.data?.monthlyNotes) {
                            setCurrentMonthlyNotes(monthResponse.data.monthlyNotes);
                            setMonthlyNotesList((prev) => {
                                if (!Array.isArray(prev)) return prev;
                                return prev.map((note) => 
                                    (note?.id === monthResponse.data.monthlyNotes.id ? monthResponse.data.monthlyNotes : note)
                                );
                            });
                        }
                    })
                    .catch(err => console.warn('Background refresh failed:', err));
            }
        } catch (error) {
            console.error('❌ Error saving action item:', error);
            // Revert optimistic update on error
            if (selectedMonth) {
                window.DatabaseAPI.getMeetingNotes(selectedMonth)
                    .then(monthResponse => {
                        if (monthResponse?.data?.monthlyNotes) {
                            setCurrentMonthlyNotes(monthResponse.data.monthlyNotes);
                            setMonthlyNotesList((prev) => {
                                if (!Array.isArray(prev)) return prev;
                                return prev.map((note) => 
                                    (note?.id === monthResponse.data.monthlyNotes.id ? monthResponse.data.monthlyNotes : note)
                                );
                            });
                        }
                    })
                    .catch(err => console.error('Error reverting changes:', err));
            }
            console.error('Failed to save action item:', error.message || 'Unknown error');
        } finally {
            setSaving(false); // Use saving state instead of loading
        }
    };

    // Helper function to delete action item from local state
    const deleteActionItemLocal = useCallback((actionItemId) => {
        const applyDelete = (note) => {
            if (!note) return note;

            // Remove from monthly action items
            if (Array.isArray(note.actionItems)) {
                const filtered = note.actionItems.filter(item => item.id !== actionItemId);
                if (filtered.length !== note.actionItems.length) {
                    return { ...note, actionItems: filtered };
                }
            }

            // Remove from weekly or department action items
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Remove from weekly-level action items
                      if (Array.isArray(week.actionItems)) {
                          const filtered = week.actionItems.filter(item => item.id !== actionItemId);
                          if (filtered.length !== week.actionItems.length) {
                              return { ...week, actionItems: filtered };
                          }
                      }

                      // Remove from department-level action items
                      if (week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (Array.isArray(deptNote.actionItems)) {
                                  const filtered = deptNote.actionItems.filter(item => item.id !== actionItemId);
                                  if (filtered.length !== deptNote.actionItems.length) {
                                      return { ...deptNote, actionItems: filtered };
                                  }
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyDelete(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyDelete(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Delete action item
    const handleDeleteActionItem = async (id) => {
        if (!confirm('Are you sure you want to delete this action item?')) return;
        
        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before action item delete:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);
        
        // Store previous state for rollback
        const previousNotes = currentMonthlyNotes;
        
        // Optimistic update - remove immediately
        deleteActionItemLocal(id);
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
            await window.DatabaseAPI.deleteActionItem(id);
            // Success - state already updated
        } catch (error) {
            console.error('Error deleting action item:', error);
            // Revert on error
            if (previousNotes) {
                setCurrentMonthlyNotes(previousNotes);
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => 
                        (note?.id === previousNotes.id ? previousNotes : note)
                    );
                });
            }
            console.error('Failed to delete action item');
        } finally {
            setSaving(false); // Use saving state instead of loading
            
            // Restore scroll position after delete
            if (preservedScrollPosition.current !== null) {
                const scrollY = preservedScrollPosition.current;
                requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                });
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 0);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 10);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 50);
            }
        }
    };

    // Helper function to add comment to local state
    const addCommentLocal = useCallback((comment) => {
        const applyAdd = (note) => {
            if (!note) return note;

            // Add to monthly comments
            if (comment.monthlyNotesId && note.id === comment.monthlyNotesId) {
                const monthlyComments = Array.isArray(note.comments) ? [...note.comments] : [];
                monthlyComments.push(comment);
                return { ...note, comments: monthlyComments };
            }

            // Add to weekly or department comments
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Add to weekly-level comments
                      if (comment.weeklyNotesId === week.id) {
                          const weeklyComments = Array.isArray(week.comments) ? [...week.comments] : [];
                          weeklyComments.push(comment);
                          return { ...week, comments: weeklyComments };
                      }

                      // Add to department-level comments
                      if (comment.departmentNotesId && week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (deptNote.id === comment.departmentNotesId) {
                                  const deptComments = Array.isArray(deptNote.comments) ? [...deptNote.comments] : [];
                                  deptComments.push(comment);
                                  return { ...deptNote, comments: deptComments };
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyAdd(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyAdd(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Helper function to delete comment from local state
    const deleteCommentLocal = useCallback((commentId) => {
        const applyDelete = (note) => {
            if (!note) return note;

            // Remove from monthly comments
            if (Array.isArray(note.comments)) {
                const filtered = note.comments.filter(c => c.id !== commentId);
                if (filtered.length !== note.comments.length) {
                    return { ...note, comments: filtered };
                }
            }

            // Remove from weekly or department comments
            const weeklyNotes = Array.isArray(note.weeklyNotes)
                ? note.weeklyNotes.map((week) => {
                      // Remove from weekly-level comments
                      if (Array.isArray(week.comments)) {
                          const filtered = week.comments.filter(c => c.id !== commentId);
                          if (filtered.length !== week.comments.length) {
                              return { ...week, comments: filtered };
                          }
                      }

                      // Remove from department-level comments
                      if (week.departmentNotes) {
                          const departmentNotes = week.departmentNotes.map((deptNote) => {
                              if (Array.isArray(deptNote.comments)) {
                                  const filtered = deptNote.comments.filter(c => c.id !== commentId);
                                  if (filtered.length !== deptNote.comments.length) {
                                      return { ...deptNote, comments: filtered };
                                  }
                              }
                              return deptNote;
                          });
                          return { ...week, departmentNotes };
                      }

                      return week;
                  })
                : note.weeklyNotes;
            return { ...note, weeklyNotes };
        };

        setCurrentMonthlyNotes((prev) => (prev ? applyDelete(prev) : prev));
        setMonthlyNotesList((prev) => {
            if (!Array.isArray(prev)) return prev;
            return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyDelete(note) : note));
        });
    }, [currentMonthlyNotes?.id]);

    // Create comment with mention processing
    const handleCreateComment = async (content) => {
        if (!commentContext) return;
        
        // Prevent any default behavior
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before comment save:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);
        
        const currentUser = window.storage?.getUserInfo() || {};
        const tempComment = {
            id: `temp-${Date.now()}`,
            content,
            author: { name: currentUser.name || currentUser.email || 'Unknown', email: currentUser.email },
            createdAt: new Date().toISOString(),
            [commentContext.type === 'monthly' ? 'monthlyNotesId' : 
              commentContext.type === 'department' ? 'departmentNotesId' : 
              'actionItemId']: commentContext.id
        };

        // Optimistic update - show immediately
        addCommentLocal(tempComment);
        setShowCommentModal(false);
        setCommentContext(null);
        
        // Scroll position is preserved via preservedScrollPosition ref and useEffect
        // No need for manual restoration here - useEffect will handle it
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
            const commentData = {
                content,
                [commentContext.type === 'monthly' ? 'monthlyNotesId' : 
                  commentContext.type === 'department' ? 'departmentNotesId' : 
                  'actionItemId']: commentContext.id
            };
            // Deep link for email/in-app notifications (Teams → management → meeting-notes)
            commentData.link = buildMeetingNotesClientDeepLink({
                selectedMonth,
                selectedWeek,
                commentContext
            });
            const response = await window.DatabaseAPI.createComment(commentData);
            
            // Get the actual comment from response
            const savedComment = response?.data?.comment || response?.comment;
            if (savedComment) {
                // Replace temp comment with real one
                const applyReplace = (note) => {
                    if (!note) return note;

                    // Replace in monthly comments
                    if (savedComment.monthlyNotesId && note.id === savedComment.monthlyNotesId) {
                        const monthlyComments = Array.isArray(note.comments) ? [...note.comments] : [];
                        const index = monthlyComments.findIndex(c => c.id === tempComment.id);
                        if (index >= 0) {
                            monthlyComments[index] = savedComment;
                        } else {
                            monthlyComments.push(savedComment);
                        }
                        return { ...note, comments: monthlyComments };
                    }

                    // Replace in weekly or department comments
                    const weeklyNotes = Array.isArray(note.weeklyNotes)
                        ? note.weeklyNotes.map((week) => {
                              if (savedComment.weeklyNotesId === week.id) {
                                  const weeklyComments = Array.isArray(week.comments) ? [...week.comments] : [];
                                  const index = weeklyComments.findIndex(c => c.id === tempComment.id);
                                  if (index >= 0) {
                                      weeklyComments[index] = savedComment;
                                  } else {
                                      weeklyComments.push(savedComment);
                                  }
                                  return { ...week, comments: weeklyComments };
                              }

                              if (savedComment.departmentNotesId && week.departmentNotes) {
                                  const departmentNotes = week.departmentNotes.map((deptNote) => {
                                      if (deptNote.id === savedComment.departmentNotesId) {
                                          const deptComments = Array.isArray(deptNote.comments) ? [...deptNote.comments] : [];
                                          const index = deptComments.findIndex(c => c.id === tempComment.id);
                                          if (index >= 0) {
                                              deptComments[index] = savedComment;
                                          } else {
                                              deptComments.push(savedComment);
                                          }
                                          return { ...deptNote, comments: deptComments };
                                      }
                                      return deptNote;
                                  });
                                  return { ...week, departmentNotes };
                              }

                              return week;
                          })
                        : note.weeklyNotes;
                    return { ...note, weeklyNotes };
                };

                setCurrentMonthlyNotes((prev) => (prev ? applyReplace(prev) : prev));
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => (note?.id === currentMonthlyNotes?.id ? applyReplace(note) : note));
                });
                
                // Aggressively restore scroll position after state update
                if (preservedScrollPosition.current !== null) {
                    const scrollY = preservedScrollPosition.current;
                    requestAnimationFrame(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    });
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 0);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 10);
                    setTimeout(() => {
                        window.scrollTo({ top: scrollY, behavior: 'instant' });
                    }, 50);
                }
            }
            
            // Process mentions and send notifications
            if (window.MentionHelper && window.MentionHelper.hasMentions(content)) {
                const authorName = currentUser.name || currentUser.email || 'Unknown';
                
                // Build context title and link
                let contextTitle = 'Meeting Notes';
                let contextLink = '/teams';
                
                if (commentContext.type === 'department') {
                    const department = DEPARTMENTS.find(d => d.id === commentContext.departmentId);
                    contextTitle = `${department?.name || 'Department'} Weekly Notes`;
                    contextLink = `/teams?month=${selectedMonth}&week=${selectedWeek}&department=${commentContext.departmentId}`;
                } else if (commentContext.type === 'monthly') {
                    contextTitle = `Monthly Meeting Notes - ${selectedMonth}`;
                    contextLink = `/teams?month=${selectedMonth}`;
                }
                
                // Process mentions asynchronously (don't wait for notifications)
                window.MentionHelper.processMentions(
                    content,
                    contextTitle,
                    contextLink,
                    authorName,
                    users
                ).catch(err => console.error('Error processing mentions:', err));
            }
        } catch (error) {
            console.error('Error creating comment:', error);
            // Revert optimistic update on error
            if (selectedMonth) {
                window.DatabaseAPI.getMeetingNotes(selectedMonth)
                    .then(monthResponse => {
                        if (monthResponse?.data?.monthlyNotes) {
                            setCurrentMonthlyNotes(monthResponse.data.monthlyNotes);
                            setMonthlyNotesList((prev) => {
                                if (!Array.isArray(prev)) return prev;
                                return prev.map((note) => 
                                    (note?.id === monthResponse.data.monthlyNotes.id ? monthResponse.data.monthlyNotes : note)
                                );
                            });
                        }
                    })
                    .catch(err => console.error('Error reverting changes:', err));
            }
            console.error('Failed to create comment');
        } finally {
            setSaving(false); // Use saving state instead of loading
        }
    };

    // Delete comment
    const handleDeleteComment = async (commentId) => {
        if (!commentId) return;
        if (!confirm('Are you sure you want to delete this comment?')) return;

        // Preserve scroll position to prevent navigation to top
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        preservedScrollPosition.current = currentScrollPosition;
        console.log('💾 Preserving scroll position before comment delete:', currentScrollPosition);
        // Trigger scroll restoration effect
        setScrollRestoreTrigger(prev => prev + 1);

        // Store previous state for rollback
        const previousNotes = currentMonthlyNotes;
        
        // Optimistic update - remove immediately
        deleteCommentLocal(commentId);
        
        try {
            setSaving(true); // Use saving state instead of loading to prevent "Loading meeting notes..." from showing
            // Check if DatabaseAPI has deleteComment method, otherwise use makeRequest
            if (window.DatabaseAPI && typeof window.DatabaseAPI.deleteComment === 'function') {
                await window.DatabaseAPI.deleteComment(commentId);
            } else if (window.DatabaseAPI && typeof window.DatabaseAPI.makeRequest === 'function') {
                await window.DatabaseAPI.makeRequest(`/meeting-notes?action=comment&id=${commentId}`, {
                    method: 'DELETE',
                    body: JSON.stringify({
                        id: commentId,
                        commentId
                    })
                });
            } else {
                throw new Error('DatabaseAPI not available');
            }
            // Success - state already updated
        } catch (error) {
            console.error('Error deleting comment:', error);
            // Revert on error
            if (previousNotes) {
                setCurrentMonthlyNotes(previousNotes);
                setMonthlyNotesList((prev) => {
                    if (!Array.isArray(prev)) return prev;
                    return prev.map((note) => 
                        (note?.id === previousNotes.id ? previousNotes : note)
                    );
                });
            }
            console.error('Failed to delete comment:', error.message || 'Unknown error');
        } finally {
            setSaving(false); // Use saving state instead of loading
            
            // Restore scroll position after delete
            if (preservedScrollPosition.current !== null) {
                const scrollY = preservedScrollPosition.current;
                requestAnimationFrame(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                });
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 0);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 10);
                setTimeout(() => {
                    window.scrollTo({ top: scrollY, behavior: 'instant' });
                }, 50);
            }
        }
    };

    // Update user allocation
    const handleUpdateAllocation = async (departmentId, userId, role) => {
        if (!currentMonthlyNotes) return;
        
        try {
            setLoading(true);
            await window.DatabaseAPI.updateUserAllocation(currentMonthlyNotes.id, departmentId, userId, role);
            // Reload current month's notes
            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
            setShowAllocationModal(false);
        } catch (error) {
            console.error('Error updating allocation:', error);
            console.error('Failed to update allocation');
        } finally {
            setLoading(false);
        }
    };

    // Delete user allocation
    const handleDeleteAllocation = async (departmentId, userId) => {
        if (!currentMonthlyNotes) return;
        
        try {
            setLoading(true);
            await window.DatabaseAPI.deleteUserAllocation(currentMonthlyNotes.id, departmentId, userId);
            // Reload current month's notes
            const monthResponse = await window.DatabaseAPI.getMeetingNotes(selectedMonth);
            setCurrentMonthlyNotes(monthResponse.data?.monthlyNotes);
        } catch (error) {
            console.error('Error deleting allocation:', error);
            console.error('Failed to delete allocation');
        } finally {
            setLoading(false);
        }
    };

    // Format month display
    const formatMonth = (monthKey) => {
        if (!monthKey) return '';
        try {
            const parts = monthKey.split('-');
            if (parts.length < 2) return monthKey; // Return original if format is invalid
            
            const year = parts[0];
            const month = parts[1];
            
            if (!year || !month) return monthKey; // Return original if missing parts
            
            const yearNum = parseInt(year, 10);
            const monthNum = parseInt(month, 10);
            
            if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                return monthKey; // Return original if invalid numbers
            }
            
            const date = new Date(yearNum, monthNum - 1, 1);
            if (isNaN(date.getTime())) {
                return monthKey; // Return original if invalid date
            }
            
            return date.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
        } catch (error) {
            console.error('Error formatting month:', error, monthKey);
            return monthKey; // Return original on any error
        }
    };

    // Format week display
    const formatWeek = (weekKey, weekStart) => {
        if (weekStart) {
            try {
                const start = new Date(weekStart);
                if (isNaN(start.getTime())) {
                    return weekKey || 'Week';
                }
                const end = new Date(start);
                end.setDate(end.getDate() + 6);
                if (isNaN(end.getTime())) {
                    return weekKey || 'Week';
                }
                return `${start.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            } catch (error) {
                console.error('Error formatting week:', error, weekKey, weekStart);
                return weekKey || 'Week';
            }
        }
        return weekKey || 'Week';
    };

    // Get user name by ID
    const getUserName = (userId) => {
        const user = users.find(u => u.id === userId);
        return user?.name || user?.email || 'Unknown';
    };

    // Get department name
    const getDepartmentName = (departmentId) => {
        const dept = DEPARTMENTS.find(d => d.id === departmentId);
        return dept?.name || departmentId;
    };

    if (!isAdminUser) {
        return (
            <div className="p-4">
                <div
                    className={`rounded-lg border p-6 text-center ${
                        isDark ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-gray-200 text-gray-900'
                    }`}
                >
                    <i className={`fas fa-lock text-4xl mb-3 ${isDark ? 'text-slate-400' : 'text-gray-400'}`}></i>
                    <h2 className="text-sm font-semibold mb-2">Access Restricted</h2>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                        Only administrators can view the management meeting notes.
                    </p>
                </div>
            </div>
        );
    }

    // Only show "Loading meeting notes..." during initial load, not during save operations
    if (!isReady || (loading && !saving)) {
        return (
            <div className="p-4">
                <div className="text-center py-12">
                    <i className={`fas fa-clipboard-list text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                    <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>Loading meeting notes...</p>
                </div>
            </div>
        );
    }

    const CommentInpSidebar = window.CommentInputWithMentions;
    const gmScreenSidebarWeeks = (() => {
        const wks = currentMonthlyNotes?.weeklyNotes;
        if (!Array.isArray(wks)) {
            return [];
        }
        return wks
            .filter((week) => week && week.id)
            .map((week) => {
                const rawGmId = getWeekIdentifier(week);
                const gmIdent = rawGmId || week.weekKey || week.id;
                const htmlNow =
                    generalMinutesEditingWeekIdRef.current === week.id &&
                    generalMinutesValuesRef.current[week.id] !== undefined
                        ? generalMinutesValuesRef.current[week.id]
                        : week.generalMinutes || '';
                const plain = window.RichTextEditor ? gmHtmlToPlainText(htmlNow) : String(htmlNow || '');
                const threads = gmReconcileThreadsWithPlain(
                    gmParseInlineThreadsRaw(week.generalMinutesThreads),
                    plain
                ).sort((a, b) => a.start - b.start);
                return {
                    week,
                    gmIdent,
                    weekLabel: formatWeek(week.weekKey, week.weekStart),
                    threads
                };
            })
            .filter((row) => row.threads.length > 0);
    })();

    return (
        <div
            className={`relative flex flex-col xl:flex-row xl:items-start xl:gap-5 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
        >
            <div className="flex-1 min-w-0 w-full space-y-5">
            {/* Blocking Overlay - Prevents all navigation until saves complete */}
            {/* Navigation blocking happens silently - no messages shown */}
            
            {/* Header */}
            <div
                className={`rounded-2xl border p-5 sm:p-6 backdrop-blur-sm ${
                    isDark
                        ? 'border-slate-700/80 bg-slate-900/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                        : 'border-slate-200/90 bg-white/90 shadow-sm shadow-slate-200/30'
                }`}
            >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                    <div className="min-w-0">
                        <div className="flex items-start gap-3">
                            <span
                                className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${
                                    isDark
                                        ? 'bg-primary-500/15 text-primary-300 ring-1 ring-primary-400/25'
                                        : 'bg-primary-50 text-primary-600 ring-1 ring-primary-100'
                                }`}
                                aria-hidden
                            >
                                <i className="fas fa-clipboard-list" />
                            </span>
                            <div className="min-w-0">
                                <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
                                    Management Meeting Notes
                                </h2>
                                <p className={`mt-1 text-sm leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                    Weekly department updates and action tracking
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <select
                            value={selectedMonth || ''}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className={`w-full sm:w-auto min-w-[10rem] px-3.5 py-2.5 text-sm font-medium rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-primary-500/80 focus:ring-offset-2 ${
                                isDark
                                    ? 'border-slate-600 bg-slate-800/80 text-slate-100 hover:border-slate-500 focus:ring-offset-slate-900'
                                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 focus:ring-offset-white shadow-sm'
                            }`}
                        >
                            <option value="">Select Month...</option>
                            {availableMonths.map(month => (
                                <option key={month} value={month}>{formatMonth(month)}</option>
                            ))}
                        </select>
                        {isMeetingNotesMobile ? (
                            <div className="relative w-full sm:w-auto" data-meeting-notes-mobile-header-menu>
                                <button
                                    type="button"
                                    onClick={() => setMobileHeaderMenuOpen((open) => !open)}
                                    className={`inline-flex w-full sm:w-auto items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border transition ${
                                        isDark
                                            ? 'border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-800'
                                            : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 shadow-sm'
                                    }`}
                                    aria-expanded={mobileHeaderMenuOpen}
                                    aria-haspopup="true"
                                >
                                    <i className="fas fa-ellipsis-h text-xs" aria-hidden />
                                    Month actions
                                </button>
                                {mobileHeaderMenuOpen ? (
                                    <div
                                        className={`absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border p-2 shadow-xl ${
                                            isDark ? 'border-slate-600 bg-slate-900' : 'border-slate-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="month"
                                                value={newMonthKey}
                                                onChange={(e) => setNewMonthKey(e.target.value)}
                                                aria-label="Create month"
                                                className={`w-full px-3 py-2.5 text-sm font-medium rounded-xl border ${
                                                    isDark
                                                        ? 'border-slate-600 bg-slate-800/80 text-slate-100'
                                                        : 'border-slate-200 bg-white text-slate-900'
                                                }`}
                                            />
                                            <button
                                                type="button"
                                                onClick={async (e) => {
                                                    e.preventDefault();
                                                    setMobileHeaderMenuOpen(false);
                                                    try {
                                                        await handleCreateMonth();
                                                    } catch (error) {
                                                        console.error('Error creating month from button:', error);
                                                    }
                                                }}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-primary-600 text-white"
                                            >
                                                <i className="fas fa-plus text-xs" />
                                                Create Month
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setMobileHeaderMenuOpen(false);
                                                    handleGenerateMonth();
                                                }}
                                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 text-white"
                                            >
                                                <i className="fas fa-magic text-xs" />
                                                Generate Month
                                            </button>
                                            {currentMonthlyNotes ? (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setMobileHeaderMenuOpen(false);
                                                        setShowAllocationModal(true);
                                                    }}
                                                    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl ${
                                                        isDark ? 'bg-slate-100 text-slate-900' : 'bg-slate-800 text-white'
                                                    }`}
                                                >
                                                    <i className="fas fa-users text-xs" />
                                                    Allocate Users
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                        <>
                        <div className="flex items-center gap-2">
                            <input
                                type="month"
                                value={newMonthKey}
                                onChange={(e) => setNewMonthKey(e.target.value)}
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        try {
                                            await handleCreateMonth(e.currentTarget.value);
                                        } catch (error) {
                                            console.error('Error creating month from input:', error);
                                            // Error is already logged, silently handle
                                        }
                                    }
                                }}
                                aria-label="Create month"
                                title="Pick a month to create meeting notes ahead of time"
                                className={`w-40 px-3 py-2.5 text-sm font-medium rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-primary-500/80 focus:ring-offset-2 ${
                                    isDark
                                        ? 'border-slate-600 bg-slate-800/80 text-slate-100 placeholder-slate-500 focus:ring-offset-slate-900'
                                        : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:ring-offset-white shadow-sm'
                                }`}
                            />
                            <button
                                type="button"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        await handleCreateMonth();
                                    } catch (error) {
                                        console.error('Error creating month from button:', error);
                                        // Error is already logged, silently handle
                                    }
                                }}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-primary-600 text-white shadow-sm shadow-primary-900/20 hover:bg-primary-500 active:scale-[0.98] transition"
                            >
                                <i className="fas fa-plus text-xs" />
                                Create Month
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleGenerateMonth();
                            }}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/20 hover:bg-emerald-500 active:scale-[0.98] transition"
                            title="Generate new month from previous month"
                        >
                            <i className="fas fa-magic text-xs" />
                            Generate Month
                        </button>
                        {currentMonthlyNotes && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowAllocationModal(true);
                                }}
                                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl shadow-sm active:scale-[0.98] transition ${
                                    isDark
                                        ? 'bg-slate-100 text-slate-900 hover:bg-white'
                                        : 'bg-slate-800 text-white hover:bg-slate-700'
                                }`}
                            >
                                <i className="fas fa-users text-xs" />
                                Allocate Users
                            </button>
                        )}
                        </>
                        )}
                    </div>
                </div>
            </div>

            {/* Month Selection Info */}
            {selectedMonth && (
                <div
                    className={`rounded-2xl border p-4 sm:p-5 ${
                        isDark
                            ? 'border-slate-700/80 bg-slate-900/35 ring-1 ring-white/5'
                            : 'border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-primary-50/30 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="min-w-0 flex items-start gap-3">
                            <span
                                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base ${
                                    isDark
                                        ? 'bg-primary-500/15 text-primary-200 ring-1 ring-primary-400/20'
                                        : 'bg-primary-100 text-primary-700 ring-1 ring-primary-200/60'
                                }`}
                                aria-hidden
                            >
                                <i className="fas fa-calendar-alt" />
                            </span>
                            <div className="min-w-0">
                            <h3 className={`text-lg font-bold tracking-tight mb-0.5 ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
                                {formatMonth(selectedMonth)}
                            </h3>
                            <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {currentMonthlyNotes ? (
                                    <>
                                        {weeks.length} {weeks.length === 1 ? 'week' : 'weeks'} available
                                    </>
                                ) : (
                                    <>No meeting notes for this month yet</>
                                )}
                            </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <input
                                type="date"
                                value={newWeekStartInput}
                                onChange={(e) => setNewWeekStartInput(e.target.value)}
                                onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        try {
                                            await handleCreateWeek(e.currentTarget.value);
                                        } catch (error) {
                                            console.error('Error creating week from input:', error);
                                            // Error is already logged, silently handle
                                        }
                                    }
                                }}
                                placeholder="YYYY-MM-DD"
                                aria-label="Week start date"
                                title="Pick a week start date to create notes ahead of time"
                                className={`w-40 px-3 py-2.5 text-sm font-medium rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-primary-500/80 focus:ring-offset-2 ${
                                    isDark
                                        ? 'border-slate-600 bg-slate-800/80 text-slate-100 placeholder-slate-500 focus:ring-offset-slate-900'
                                        : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:ring-offset-white shadow-sm'
                                }`}
                            />
                            <button
                                type="button"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        await handleCreateWeek();
                                    } catch (error) {
                                        console.error('Error creating week from button:', error);
                                        // Error is already logged, silently handle
                                    }
                                }}
                                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-primary-600 text-white shadow-sm hover:bg-primary-500 active:scale-[0.98] transition"
                            >
                                <i className="fas fa-plus text-xs" />
                                Add Week
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Items Summary */}
            {false && selectedMonth && currentMonthlyNotes && allActionItems.length > 0 && (
                <div className={`rounded-xl border p-5 ${isDark ? 'bg-slate-800 border-slate-700 shadow-lg' : 'bg-white border-gray-200 shadow-md'}`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                            <i className="fas fa-tasks mr-2 text-primary-600"></i>
                            Action Items Summary
                        </h3>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingActionItem({ monthlyNotesId: currentMonthlyNotes.id });
                                setShowActionItemModal(true);
                            }}
                            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition shadow-sm hover:shadow-md font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Add Action Item
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-orange-900/30 to-orange-800/20 border-orange-700/50' : 'bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>Open</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-orange-200' : 'text-orange-900'}`}>{actionItemsByStatus.open.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-blue-900/30 to-blue-800/20 border-blue-700/50' : 'bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>In Progress</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>{actionItemsByStatus.in_progress.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-green-900/30 to-green-800/20 border-green-700/50' : 'bg-gradient-to-br from-green-50 to-green-100/50 border-green-200'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-green-300' : 'text-green-700'}`}>Completed</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-green-200' : 'text-green-900'}`}>{actionItemsByStatus.completed.length}</p>
                        </div>
                        <div className={`rounded-lg p-4 border transition hover:scale-105 ${isDark ? 'bg-gradient-to-br from-slate-700 to-slate-800 border-slate-600' : 'bg-gradient-to-br from-gray-100 to-gray-50 border-gray-300'}`}>
                            <p className={`text-xs mb-2 font-medium uppercase tracking-wide ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Total</p>
                            <p className={`text-3xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{allActionItems.length}</p>
                        </div>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {allActionItems.slice(0, 10).map((item) => (
                            <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border transition hover:shadow-sm ${isDark ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium mb-1 truncate ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                        {item.assignedUser ? getUserName(item.assignedUserId) : 'Unassigned'} • <span className="capitalize">{item.status}</span>
                                    </p>
                                </div>
                                <div className="flex gap-2 ml-3">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setEditingActionItem(item);
                                            setShowActionItemModal(true);
                                        }}
                                        className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-primary-400 hover:bg-primary-900/30' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50'}`}
                                        title="Edit"
                                    >
                                        <i className="fas fa-edit text-sm"></i>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleDeleteActionItem(item.id);
                                        }}
                                        className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash text-sm"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Weekly Notes Section */}
            {selectedMonth && currentMonthlyNotes && weeks.length > 0 && (
                <div className="space-y-5">
                    <div
                        className={`rounded-2xl border p-4 sm:p-5 ${
                            isDark
                                ? 'border-slate-700/80 bg-slate-900/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                                : 'border-slate-200/90 bg-white/80 shadow-sm shadow-slate-200/40'
                        }`}
                    >
                        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                            <div>
                                <p className={`text-xs font-semibold uppercase tracking-[0.14em] mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <i className="fas fa-calendar-week mr-2 text-primary-500 opacity-90"></i>
                                    Week navigation
                                </p>
                                <p className={`text-sm font-medium leading-snug max-w-xl ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {isMeetingNotesMobile
                                        ? 'Pick a week, then scroll down to edit notes for that week.'
                                        : 'Pick a week to focus the grid. Scroll sideways when there are many weeks in the month.'}
                                </p>
                            </div>
                        </div>
                        <div className="meeting-notes-week-nav-scroll overflow-x-auto -mx-1">
                            <div
                                role="tablist"
                                aria-label="Weeks in this month"
                                className={`flex gap-2 px-1 pb-1 min-w-min p-1 rounded-2xl ${
                                    isDark ? 'bg-slate-950/50 ring-1 ring-slate-700/60' : 'bg-slate-100/90 ring-1 ring-slate-200/80'
                                }`}
                            >
                                {weeks.map((week, index) => {
                                    const rawId = getWeekIdentifier(week);
                                    const identifier = rawId || `week-${index}`;
                                    const isActualCurrentWeek = identifier === currentWeekId;
                                    const isActualNextWeek = identifier === nextWeekId;
                                    const isSelected = identifier === selectedWeek;
                                    const label = isActualCurrentWeek ? 'This week' : isActualNextWeek ? 'Next' : 'Week';
                                    return (
                                        <button
                                            key={identifier}
                                            type="button"
                                            role="tab"
                                            aria-selected={isSelected}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setSelectedWeek(identifier);
                                                scrollToWeekId(identifier);
                                            }}
                                            className={`relative text-left whitespace-nowrap min-w-[8.5rem] sm:min-w-[9.5rem] px-3.5 py-2.5 rounded-xl text-xs font-medium transition-[box-shadow,transform,border-color,background-color] duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 ${
                                                isDark ? 'focus-visible:ring-offset-slate-900' : 'focus-visible:ring-offset-white'
                                            } ${
                                                isSelected
                                                    ? isDark
                                                        ? 'bg-slate-800 text-slate-100 shadow-md shadow-black/25 ring-1 ring-slate-600/90'
                                                        : 'bg-white text-slate-900 shadow-md shadow-slate-300/50 ring-1 ring-slate-300/90'
                                                    : isDark
                                                      ? 'bg-transparent text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 ring-1 ring-transparent hover:ring-slate-600/50'
                                                      : 'bg-transparent text-slate-600 hover:bg-white/90 hover:text-slate-900 ring-1 ring-transparent hover:ring-slate-300/70'
                                            }`}
                                        >
                                            {(isActualCurrentWeek || isActualNextWeek) && (
                                                <span
                                                    className={`absolute top-2 right-2 h-1.5 w-1.5 rounded-full ${
                                                        isActualCurrentWeek
                                                            ? 'bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
                                                            : 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.2)]'
                                                    }`}
                                                    aria-hidden
                                                />
                                            )}
                                            <span
                                                className={`block text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${
                                                    isSelected
                                                        ? isDark
                                                            ? 'text-primary-300'
                                                            : 'text-primary-600'
                                                        : isDark
                                                          ? 'text-slate-500'
                                                          : 'text-slate-500'
                                                }`}
                                            >
                                                {label}
                                            </span>
                                            <span className={`block text-sm font-semibold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                                {formatWeek(week.weekKey, week.weekStart)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {isMeetingNotesMobile && selectedMonth && currentMonthlyNotes && weeks.length > 0 ? (
                        <div
                            className={`rounded-2xl border p-3 sm:p-4 ${
                                isDark
                                    ? 'border-slate-700/80 bg-slate-900/40'
                                    : 'border-slate-200/90 bg-white shadow-sm'
                            }`}
                        >
                            <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Department
                            </p>
                            <div className="meeting-notes-dept-nav-scroll overflow-x-auto -mx-1 touch-pan-x">
                                <div className="flex gap-2 px-1 pb-1 min-w-min">
                                    {DEPARTMENTS.map((dept) => {
                                        const isActive = dept.id === mobileActiveDepartmentId;
                                        const deptSurface = meetingNotesDeptSurface(dept.id);
                                        return (
                                            <button
                                                key={dept.id}
                                                type="button"
                                                onClick={() => setMobileActiveDepartmentIdPersisted(dept.id)}
                                                className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                                                    isActive
                                                        ? isDark
                                                            ? 'border-primary-500/60 bg-slate-800 text-slate-100 ring-1 ring-primary-500/30'
                                                            : 'border-primary-300 bg-white text-slate-900 ring-1 ring-primary-400/25 shadow-sm'
                                                        : isDark
                                                          ? 'border-slate-700 bg-slate-900/50 text-slate-400 hover:border-slate-600'
                                                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                                                }`}
                                                aria-pressed={isActive}
                                            >
                                                <span
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] ${
                                                        isDark ? deptSurface.chipD : deptSurface.chipL
                                                    }`}
                                                >
                                                    <i className={`fas ${dept.icon}`} aria-hidden />
                                                </span>
                                                <span className="max-w-[9rem] truncate">{dept.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setMeetingNotesMonthlyGoalsColumnVisiblePersisted(!meetingNotesMonthlyGoalsColumnVisible)
                                    }
                                    className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                                        isDark
                                            ? 'border-slate-600 bg-slate-800/80 text-slate-200'
                                            : 'border-slate-200 bg-white text-slate-700 shadow-sm'
                                    }`}
                                >
                                    <i className={`fas mr-1.5 ${meetingNotesMonthlyGoalsColumnVisible ? 'fa-eye-slash' : 'fa-bullseye'}`} aria-hidden />
                                    {meetingNotesMonthlyGoalsColumnVisible ? 'Hide monthly goals' : 'Show monthly goals'}
                                </button>
                            </div>
                        </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-3 px-0.5">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <div
                                className={`inline-flex items-center gap-3 rounded-2xl border px-3 py-2 ${
                                    isDark
                                        ? 'border-slate-700/80 bg-slate-900/35 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]'
                                        : 'border-slate-200/90 bg-slate-50/90 shadow-sm'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                                            isDark ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-500 shadow-sm ring-1 ring-slate-200/80'
                                        }`}
                                        aria-hidden
                                    >
                                        <i className="fas fa-eye text-[11px]" />
                                    </span>
                                    <div className="flex flex-col leading-tight">
                                        <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                            Viewing now
                                        </span>
                                        {presenceOthers.length === 0 ? (
                                            <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Solo session</span>
                                        ) : (
                                            <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                {1 + presenceOthers.length} viewing
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {presenceOthers.length > 0 && (
                                    <div
                                        className={`flex flex-row-reverse items-center pl-3 border-l ${
                                            isDark ? 'border-slate-600/70' : 'border-slate-200/90'
                                        }`}
                                    >
                                        {presenceOthers.map((v, i) => (
                                            <span
                                                key={v.userId}
                                                title={v.name || v.email || 'User'}
                                                style={{ zIndex: presenceOthers.length - i }}
                                                className={`relative -ml-2 first:ml-0 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold overflow-hidden shadow-md ring-2 transition-transform duration-200 hover:z-10 hover:-translate-y-0.5 ${
                                                    isDark
                                                        ? 'ring-slate-900 bg-gradient-to-br from-slate-600 to-slate-700 text-white'
                                                        : 'ring-white bg-gradient-to-br from-slate-600 to-slate-800 text-white'
                                                }`}
                                            >
                                                {v.avatar ? (
                                                    <img src={v.avatar} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    (v.name || v.email || '?')
                                                        .split(/\s+/)
                                                        .map((p) => p[0])
                                                        .join('')
                                                        .slice(0, 2)
                                                        .toUpperCase()
                                                )}
                                                <span
                                                    className={`absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border bg-emerald-400 ${
                                                        isDark ? 'border-slate-900' : 'border-white/90'
                                                    }`}
                                                    aria-hidden
                                                />
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setGmCommentsSidebarVisiblePersisted(!gmCommentsSidebarVisible)}
                                className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                                    isDark
                                        ? 'border-slate-600/80 bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm'
                                }`}
                                aria-expanded={gmCommentsSidebarVisible}
                                aria-controls={gmCommentsSidebarVisible ? 'gm-minutes-comments-aside' : undefined}
                            >
                                <i className={`fas mr-2 ${gmCommentsSidebarVisible ? 'fa-eye-slash' : 'fa-comments'}`} aria-hidden />
                                {gmCommentsSidebarVisible ? 'Hide comments' : 'Show comments'}
                            </button>
                        </div>
                    </div>

                    <div className="min-w-0 pb-2 space-y-4">
                        {/* Offset matches MainLayout main#page-scroll: py-4 sm:p-6 so the bar sits flush under the app header when stuck */}
                        <div
                            className={`${isMeetingNotesMobile ? 'hidden' : ''} sticky z-40 -top-4 sm:-top-6 -mx-0.5 border-b px-0 py-0 shadow-sm backdrop-blur-md ${
                                isDark
                                    ? 'border-slate-800/80 bg-slate-900/95 supports-[backdrop-filter]:bg-slate-900/80'
                                    : 'border-slate-200/90 bg-white/95 supports-[backdrop-filter]:bg-white/85'
                            }`}
                        >
                            <div
                                ref={meetingNotesHeaderScrollRef}
                                className="meeting-notes-grid-h-scroll meeting-notes-grid-h-scroll--header -mx-0.5 overflow-x-auto overflow-y-hidden"
                            >
                            {/* Same column gap as body grid; items-stretch + min-h keeps every date header the same height (no “staircase”). */}
                            <div
                                className="inline-grid items-stretch gap-4 sm:gap-5 pb-1"
                                style={{
                                    gridTemplateColumns: meetingNotesMainGridTemplateColumns,
                                    gridTemplateRows: 'auto'
                                }}
                            >
                                {/* Monthly goals header — column 1 */}
                                {meetingNotesMonthlyGoalsColumnVisible ? (
                                    <div
                                        key="header-monthly-goals"
                                        style={{
                                            gridRow: '1',
                                            gridColumn: `${getMonthlyGoalsGridColumn()}`
                                        }}
                                        className={`min-h-[4.75rem] h-full flex flex-col justify-center rounded-xl border px-2.5 py-2 transition-[border-color,box-shadow] duration-200 ${stickyMonthlyGoalsHeaderCol} ${
                                            isDark
                                                ? 'border-slate-600/90 bg-slate-900/30 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]'
                                                : 'border-slate-200/90 bg-white shadow-sm'
                                        }`}
                                    >
                                        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setMeetingNotesMonthlyGoalsColumnVisiblePersisted(!meetingNotesMonthlyGoalsColumnVisible)
                                                }
                                                className={`self-start rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold leading-snug tracking-tight transition ${
                                                    isDark
                                                        ? 'border-red-900/55 bg-red-950/35 text-red-300/90 hover:border-red-800/60 hover:bg-red-950/50'
                                                        : 'border-red-300/80 bg-red-50/95 text-red-900/85 hover:border-red-400/70 hover:bg-red-100/90'
                                                }`}
                                                aria-expanded={meetingNotesMonthlyGoalsColumnVisible}
                                                aria-label="Hide monthly goals column"
                                            >
                                                <i className="fas mr-1.5 fa-columns opacity-90" aria-hidden />
                                                Hide Monthly Goals
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    Monthly goals
                                                </p>
                                                <h3 className={`text-sm font-bold leading-tight flex items-center gap-1.5 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                                    <i className={`fas fa-bullseye shrink-0 text-xs ${isDark ? 'text-primary-400' : 'text-primary-600'}`}></i>
                                                    <span className="line-clamp-2 break-words">Department focus</span>
                                                </h3>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}

                                {/* Week headers row — columns 2+ */}
                                {layoutWeeks.map((week, index) => {
                                    const rawId = getWeekIdentifier(week);
                                    const identifier = rawId || `week-${index}`;
                                    const isActualCurrentWeek = identifier === currentWeekId;
                                    const isActualNextWeek = identifier === nextWeekId;
                                    const isSelected = identifier === selectedWeek;

                                    return (
                                        <div
                                            key={`header-${identifier}`}
                                            style={{
                                                gridRow: '1',
                                                gridColumn: `${getWeekGridColumn(index)}`
                                            }}
                                            className={`min-h-[4.75rem] h-full flex flex-col justify-center rounded-xl border px-2.5 py-2 transition-[border-color,box-shadow,background-color] duration-200 ${
                                                !meetingNotesMonthlyGoalsColumnVisible && index === 0 ? stickyMonthlyGoalsHeaderCol : ''
                                            } ${
                                                isActualCurrentWeek
                                                    ? isDark
                                                        ? 'border-primary-500/70 ring-1 ring-inset ring-primary-500/20 shadow-sm bg-slate-900/80'
                                                        : 'border-primary-400/80 ring-1 ring-inset ring-primary-400/15 shadow-sm bg-white'
                                                    : isActualNextWeek
                                                        ? isDark
                                                            ? 'border-amber-500/55 ring-1 ring-inset ring-amber-400/15 shadow-sm bg-slate-900/60'
                                                            : 'border-amber-300/90 ring-1 ring-inset ring-amber-200/40 shadow-sm bg-amber-50/50'
                                                        : isSelected
                                                            ? isDark
                                                                ? 'border-slate-600 ring-1 ring-inset ring-white/5 shadow-sm bg-slate-800/90'
                                                                : 'border-slate-300 ring-1 ring-inset ring-slate-200/60 shadow-sm bg-slate-50/90'
                                                            : isDark
                                                                ? 'border-slate-700/90 bg-slate-900/35 hover:border-slate-600'
                                                                : 'border-slate-200/90 bg-white hover:border-slate-300'
                                            }`}
                                        >
                                            <div className="flex min-h-0 flex-1 flex-col gap-2">
                                                {!meetingNotesMonthlyGoalsColumnVisible && index === 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setMeetingNotesMonthlyGoalsColumnVisiblePersisted(!meetingNotesMonthlyGoalsColumnVisible)
                                                        }
                                                        className={`self-start rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold leading-snug tracking-tight transition ${
                                                            isDark
                                                                ? 'border-slate-600/80 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80'
                                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm'
                                                        }`}
                                                        aria-expanded={meetingNotesMonthlyGoalsColumnVisible}
                                                        aria-label="Show monthly goals column"
                                                    >
                                                        <i className="fas mr-1.5 fa-table opacity-90" aria-hidden />
                                                        Show Monthly Goals
                                                    </button>
                                                ) : null}
                                                <div className="flex min-h-0 flex-1 items-center justify-between gap-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className={`text-[10px] uppercase tracking-wider font-semibold mb-0 ${isActualCurrentWeek ? (isDark ? 'text-primary-300' : 'text-primary-600') : isActualNextWeek ? (isDark ? 'text-amber-300' : 'text-amber-600') : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                            Week
                                                        </p>
                                                        <h3 className={`text-sm font-bold leading-tight flex items-start gap-1.5 min-w-0 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                                            <i className={`fas fa-calendar-week mt-0.5 shrink-0 text-xs ${isActualCurrentWeek ? 'text-primary-500' : isActualNextWeek ? 'text-amber-500' : 'text-slate-500'}`}></i>
                                                            <span className="line-clamp-2 min-w-0 break-words">{formatWeek(week.weekKey, week.weekStart)}</span>
                                                        </h3>
                                                    </div>
                                                    <div className="flex shrink-0 items-center self-center">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleDeleteWeek(week);
                                                            }}
                                                            className={`text-[10px] flex items-center gap-1 px-2 py-1 rounded-md font-medium transition shadow-sm hover:shadow-md ${isDark ? 'bg-red-900/50 text-red-200 hover:bg-red-800/50 border border-red-700' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'}`}
                                                        >
                                                            <i className="fas fa-trash text-[9px]" />
                                                            <span className="hidden sm:inline">Delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            </div>
                        </div>

                        {/* Grid layout: General minutes row, then departments as rows, weeks as columns (horizontal scroll synced with header row above) */}
                        <div
                            ref={meetingNotesHorizontalScrollRef}
                            className={`meeting-notes-grid-h-scroll meeting-notes-grid-h-scroll--body ${isMeetingNotesMobile ? 'overflow-x-visible' : 'overflow-x-auto sm:overflow-x-scroll touch-pan-x'}`}
                        >
                        <div
                            className="inline-grid items-stretch gap-4 sm:gap-5"
                            style={{
                                gridTemplateColumns: meetingNotesMainGridTemplateColumns,
                                gridTemplateRows: meetingNotesBodyGridTemplateRows,
                                alignItems: 'stretch',
                                gridAutoFlow: 'row'
                            }}
                        >
                            {meetingNotesMonthlyGoalsColumnVisible && !isMeetingNotesMobile ? (
                                <div
                                    key="general-minutes-monthly-placeholder"
                                    style={{
                                        gridRow: 1,
                                        gridColumn: `${getMonthlyGoalsGridColumn()}`
                                    }}
                                    className={`relative z-[27] isolate flex h-full min-h-[8rem] w-full min-w-0 flex-col justify-start self-stretch overflow-hidden rounded-2xl border border-dashed p-4 sm:p-5 ${stickyMonthlyGoalsBodyCol} ${
                                        isDark
                                            ? 'border-slate-600/70 bg-slate-900/25 text-slate-400'
                                            : 'border-slate-300/90 bg-slate-50/50 text-slate-600'
                                    }`}
                                >
                                    <p className={`text-[10px] font-bold uppercase tracking-[0.14em] mb-2 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        Monthly goals column
                                    </p>
                                    <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                                        Each department row uses this cell for month-level targets; week columns scroll to the right.
                                    </p>
                                </div>
                            ) : null}

                            {layoutWeeks.map((week, gmWeekIndex) => {
                                const rawGmId = getWeekIdentifier(week);
                                const gmIdentifier = rawGmId || `week-${gmWeekIndex}`;
                                const gmSelected = gmIdentifier === selectedWeek;
                                return (
                                    <div
                                        key={`general-minutes-${gmIdentifier}`}
                                        data-management-meeting-week={gmIdentifier}
                                        ref={(node) => {
                                            if (!weekCardRefs.current) {
                                                weekCardRefs.current = {};
                                            }
                                            if (node) {
                                                weekCardRefs.current[gmIdentifier] = node;
                                            } else {
                                                delete weekCardRefs.current[gmIdentifier];
                                            }
                                        }}
                                        style={{
                                            gridRow: 1,
                                            gridColumn: `${getWeekGridColumn(gmWeekIndex)}`
                                        }}
                                        className={`relative z-0 flex h-full min-h-0 w-full min-w-0 flex-col self-stretch overflow-hidden rounded-2xl border p-4 sm:p-5 transition-[box-shadow,border-color,transform] duration-200 ${
                                            !meetingNotesMonthlyGoalsColumnVisible && gmWeekIndex === 0 ? stickyMonthlyGoalsBodyCol : ''
                                        } ${
                                            gmSelected
                                                ? isDark
                                                    ? 'border-primary-500/60 bg-slate-900/60 shadow-lg shadow-black/30 ring-1 ring-primary-500/25'
                                                    : 'border-primary-300 bg-white shadow-lg shadow-primary-500/10 ring-2 ring-primary-400/20'
                                                : isDark
                                                  ? 'border-slate-700/80 bg-slate-900/30 hover:border-slate-600'
                                                  : 'border-slate-200/90 bg-white hover:border-slate-300 shadow-sm'
                                        }`}
                                    >
                                        <div
                                            className={`mb-4 shrink-0 border-b border-dashed pb-3 ${
                                                isDark ? 'border-slate-600/60' : 'border-slate-200/80'
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                    General minutes
                                                </p>
                                                <p className={`text-sm font-semibold tracking-tight mt-0.5 truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                                    {formatWeek(week.weekKey, week.weekStart)}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                                            {week?.id ? (
                                                <div
                                                    data-gm-editor-host={week.id}
                                                    data-gm-week-key={gmIdentifier}
                                                    className="flex min-h-0 min-w-0 flex-1 flex-col gap-2"
                                                    onMouseUp={(e) => handleGmEditorHostMouseUp(e, week, gmIdentifier)}
                                                    onClick={(e) => handleGmEditorHostClick(e, week, gmIdentifier)}
                                                >
                                                    {window.RichTextEditor ? (
                                                        <div
                                                            className="min-h-0 min-w-0 flex-1"
                                                            onFocusCapture={() => {
                                                                generalMinutesEditingWeekIdRef.current = week.id;
                                                            }}
                                                        >
                                                            <window.RichTextEditor
                                                                key={`weekly-gm-col-${week.id}`}
                                                                value={getGmRichTextEditorValue(week, generalMinutesEditingWeekIdRef, generalMinutesValuesRef)}
                                                                onChange={(html) => handleGeneralMinutesChange(week.id, html)}
                                                                onBlur={(html) => {
                                                                    generalMinutesEditingWeekIdRef.current = null;
                                                                    handleGeneralMinutesBlur(week.id, html);
                                                                }}
                                                                placeholder="Weekly minutes — agenda, decisions, shared notes for this week."
                                                                rows={6}
                                                                compact
                                                                autoGrow
                                                                maxEditorHeight={isMeetingNotesMobile ? 'min(60vh, 520px)' : 'min(82vh, 900px)'}
                                                                tableTools
                                                                isDark={isDark}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <textarea
                                                            value={week.generalMinutes || ''}
                                                            onChange={(e) => handleGeneralMinutesChange(week.id, e.target.value)}
                                                            onBlur={(e) => {
                                                                generalMinutesEditingWeekIdRef.current = null;
                                                                handleGeneralMinutesBlur(week.id, e.target.value);
                                                            }}
                                                            onFocus={() => {
                                                                generalMinutesEditingWeekIdRef.current = week.id;
                                                            }}
                                                            placeholder="Weekly minutes..."
                                                            className={`w-full min-h-[6.75rem] max-h-[min(82vh,900px)] resize-y overflow-y-auto p-2 text-xs border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                                            rows={6}
                                                        />
                                                    )}
                                                </div>
                                            ) : (
                                                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                                    Save the week to add minutes.
                                                </p>
                                            )}
                                            {week?.id ? (
                                                <div
                                                    className={`mt-3 pt-2 border-t border-dashed ${isDark ? 'border-slate-600/50' : 'border-gray-200'}`}
                                                >
                                                    <label
                                                        className={`block text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                                                    >
                                                        Attachments
                                                    </label>
                                                    {(() => {
                                                        let gmAttachments = [];
                                                        try {
                                                            const raw = week.generalMinutesAttachments;
                                                            if (raw) {
                                                                gmAttachments =
                                                                    typeof raw === 'string' ? JSON.parse(raw) : raw;
                                                            }
                                                        } catch (e) {
                                                            console.warn('Error parsing general minutes attachments:', e);
                                                        }
                                                        return Array.isArray(gmAttachments) && gmAttachments.length > 0 ? (
                                                            <div className="space-y-1 mb-2">
                                                                {gmAttachments.map((attachment, index) => (
                                                                    <div
                                                                        key={`${attachment.url}-${index}`}
                                                                        className={`flex items-center justify-between p-2 rounded ${
                                                                            isDark
                                                                                ? 'bg-slate-700/80 border border-slate-600'
                                                                                : 'bg-gray-50 border border-gray-200'
                                                                        }`}
                                                                    >
                                                                        <a
                                                                            href={attachment.url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className={`flex items-center gap-2 flex-1 min-w-0 text-xs ${
                                                                                isDark
                                                                                    ? 'text-primary-400 hover:text-primary-300'
                                                                                    : 'text-primary-600 hover:text-primary-700'
                                                                            }`}
                                                                        >
                                                                            <i className="fas fa-file shrink-0"></i>
                                                                            <span className="truncate">{attachment.name}</span>
                                                                            {attachment.size != null ? (
                                                                                <span
                                                                                    className={`text-xs shrink-0 ${isDark ? 'text-slate-400' : 'text-gray-500'}`}
                                                                                >
                                                                                    ({(attachment.size / 1024).toFixed(1)} KB)
                                                                                </span>
                                                                            ) : null}
                                                                        </a>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                handleDeleteGeneralMinutesAttachment(week.id, index);
                                                                            }}
                                                                            className={`p-1 rounded transition ml-2 shrink-0 ${
                                                                                isDark
                                                                                    ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30'
                                                                                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                                                                            }`}
                                                                            title="Remove attachment"
                                                                        >
                                                                            <i className="fas fa-trash text-xs"></i>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                    <div
                                                        className={`border border-dashed rounded-lg p-2 ${isDark ? 'border-slate-600 bg-slate-800/50' : 'border-gray-300 bg-gray-50'}`}
                                                    >
                                                        <input
                                                            type="file"
                                                            id={`general-minutes-attachment-${week.id}`}
                                                            multiple
                                                            onChange={(e) => {
                                                                if (e.target.files && e.target.files.length > 0) {
                                                                    handleGeneralMinutesAttachmentUpload(week.id, e.target.files);
                                                                }
                                                                e.target.value = '';
                                                            }}
                                                            className="hidden"
                                                            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
                                                        />
                                                        <label
                                                            htmlFor={`general-minutes-attachment-${week.id}`}
                                                            className={`cursor-pointer flex items-center gap-2 text-xs ${isDark ? 'text-slate-300 hover:text-slate-200' : 'text-gray-700 hover:text-gray-900'}`}
                                                        >
                                                            <i
                                                                className={`fas ${uploadingGeneralMinutesAttachments[week.id] ? 'fa-spinner fa-spin' : 'fa-paperclip'}`}
                                                            ></i>
                                                            <span>
                                                                {uploadingGeneralMinutesAttachments[week.id]
                                                                    ? 'Uploading...'
                                                                    : 'Attach files'}
                                                            </span>
                                                        </label>
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Department rows - each department spans all weeks */}
                            {layoutDepartments.map((dept, deptIndex) => {
                                const deptMonthlyGoal = monthlyGoalsByDepartment?.[dept.id] || '';
                                const deptSurface = meetingNotesDeptSurface(dept.id);
                                return (
                                    <React.Fragment key={`dept-row-${dept.id}`}>
                                        {meetingNotesMonthlyGoalsColumnVisible ? (
                                            <div
                                                key={`${dept.id}-monthly-goals`}
                                                className={`group relative rounded-2xl border p-4 sm:p-5 transition-[box-shadow,border-color] duration-200 h-full flex flex-col overflow-hidden ${deptSurface.stripe} ${stickyMonthlyGoalsBodyCol} ${
                                                    isDark
                                                        ? 'border-slate-700/80 bg-slate-900/40 shadow-sm hover:border-slate-600'
                                                        : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300'
                                                }`}
                                                style={{
                                                    minHeight: '200px',
                                                    gridRow: `${getDeptMonthlyGoalsGridRow(deptIndex)}`,
                                                    gridColumn: `${getMonthlyGoalsGridColumn()}`
                                                }}
                                            >
                                                <div className="flex items-start justify-between gap-3 mb-4">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <span
                                                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm ${
                                                                isDark ? deptSurface.chipD : deptSurface.chipL
                                                            }`}
                                                        >
                                                            <i className={`fas ${dept.icon}`} />
                                                        </span>
                                                        <div className="min-w-0">
                                                            <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                Monthly goals
                                                            </p>
                                                            <h4 className={`text-sm font-bold tracking-tight truncate ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
                                                                {dept.name}
                                                            </h4>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div
                                                    className={`flex-grow min-h-0 rounded-xl border p-1 ${
                                                        isDark
                                                            ? 'border-slate-700/60 bg-slate-950/30'
                                                            : 'border-slate-200/60 bg-slate-50/50'
                                                    }`}
                                                >
                                                    {window.RichTextEditor ? (
                                                        <window.RichTextEditor
                                                            key={`rich-editor-monthly-goals-${dept.id}`}
                                                            value={deptMonthlyGoal}
                                                            onChange={(html) => handleMonthlyGoalsChange(dept.id, html)}
                                                            onFocus={() => {
                                                                monthlyGoalsEditingDeptIdRef.current = dept.id;
                                                            }}
                                                            onBlur={(html) => handleMonthlyGoalsBlur(dept.id, html)}
                                                            placeholder="Capture the month's goals for this department."
                                                            rows={6}
                                                            isDark={isDark}
                                                            {...meetingNotesRteMobileProps}
                                                        />
                                                    ) : (
                                                        <textarea
                                                            value={deptMonthlyGoal}
                                                            onChange={(e) => handleMonthlyGoalsChange(dept.id, e.target.value)}
                                                            onBlur={(e) => handleMonthlyGoalsBlur(dept.id, e.target.value)}
                                                            placeholder="Capture the month's goals for this department."
                                                            className={`w-full min-h-[160px] p-3 text-sm rounded-lg border-0 bg-transparent focus:ring-0 ${isDark ? 'text-slate-100 placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`}
                                                            rows={6}
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        {layoutWeeks.map((week, weekIndex) => {
                                            const rawId = getWeekIdentifier(week);
                                            const identifier = rawId || `week-${weekIndex}`;
                                            const weekSelected = identifier === selectedWeek;
                                            const deptNote = week.departmentNotes?.find(
                                                (dn) => dn.departmentId === dept.id
                                            );

                                            return (
                                                <div
                                                    key={`${dept.id}-${identifier}`}
                                                    className={`relative z-0 rounded-2xl border p-4 sm:p-5 transition-[box-shadow,border-color,transform] duration-200 h-full flex flex-col overflow-hidden ${deptSurface.stripe} ${
                                                        !meetingNotesMonthlyGoalsColumnVisible && weekIndex === 0 ? stickyMonthlyGoalsBodyCol : ''
                                                    } ${
                                                        !deptNote
                                                            ? `border-dashed ${isDark ? 'border-slate-600/70 bg-slate-900/20 opacity-90' : 'border-slate-300/90 bg-slate-50/60'}`
                                                            : weekSelected
                                                              ? isDark
                                                                  ? 'border-slate-600/90 bg-slate-900/55 shadow-lg shadow-black/25 ring-1 ring-primary-500/30'
                                                                  : 'border-primary-200 bg-white shadow-lg shadow-primary-500/10 ring-2 ring-primary-400/15'
                                                              : isDark
                                                                ? 'border-slate-700/80 bg-slate-900/35 shadow-sm hover:border-slate-600'
                                                                : 'border-slate-200/90 bg-white shadow-sm hover:border-slate-300'
                                                    }`}
                                                    style={{ 
                                                        minHeight: '200px',
                                                        gridRow: `${getDeptWeekNotesGridRow(deptIndex)}`,
                                                        gridColumn: `${getWeekGridColumn(weekIndex)}`
                                                    }}
                                                >
                                                    {!deptNote ? (
                                                        <>
                                                            <div className="flex items-start justify-between gap-3 mb-4">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <span
                                                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm ${
                                                                            isDark ? deptSurface.chipD : deptSurface.chipL
                                                                        }`}
                                                                    >
                                                                        <i className={`fas ${dept.icon}`} />
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                            Weekly notes
                                                                        </p>
                                                                        <h4 className={`text-sm font-bold tracking-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                                                            {dept.name}
                                                                        </h4>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                                                                    {currentMonthlyNotes.userAllocations?.filter((a) => a.departmentId === dept.id).length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 justify-end max-w-[11rem]">
                                                                            {currentMonthlyNotes.userAllocations
                                                                                .filter((a) => a.departmentId === dept.id)
                                                                                .map((allocation) => (
                                                                                    <span
                                                                                        key={allocation.id}
                                                                                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full truncate max-w-full ${
                                                                                            isDark
                                                                                                ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-600/80'
                                                                                                : 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm'
                                                                                        }`}
                                                                                    >
                                                                                        {getUserName(allocation.userId)}
                                                                                    </span>
                                                                                ))}
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setSelectedDepartment(dept.id);
                                                                            setShowAllocationModal(true);
                                                                        }}
                                                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs transition ${
                                                                            isDark
                                                                                ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-600 hover:bg-slate-700'
                                                                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 shadow-sm'
                                                                        }`}
                                                                        title="Allocate users"
                                                                    >
                                                                        <i className="fas fa-user-plus" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            <div
                                                                className={`flex flex-col items-center justify-center rounded-xl border border-dashed py-8 px-4 text-center ${
                                                                    isDark ? 'border-slate-600/60 bg-slate-950/20' : 'border-slate-300/80 bg-white/60'
                                                                }`}
                                                            >
                                                                <span
                                                                    className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full text-sm ${
                                                                        isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
                                                                    }`}
                                                                    aria-hidden
                                                                >
                                                                    <i className="fas fa-file-lines" />
                                                                </span>
                                                                <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                    No notes for this week yet
                                                                </p>
                                                                <p className={`mt-1 text-[11px] leading-snug ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                    Allocate users or add department coverage for this month.
                                                                </p>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div
                                                                className={`flex items-start justify-between gap-3 mb-4 pb-3 border-b border-dashed ${
                                                                    isDark ? 'border-slate-600/50' : 'border-slate-200/80'
                                                                }`}
                                                            >
                                                                <div className="flex items-start gap-3 min-w-0">
                                                                    <span
                                                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm ${
                                                                            isDark ? deptSurface.chipD : deptSurface.chipL
                                                                        }`}
                                                                    >
                                                                        <i className={`fas ${dept.icon}`} />
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                            Department
                                                                        </p>
                                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                                            <h4 className={`text-sm font-bold tracking-tight ${isDark ? 'text-slate-50' : 'text-slate-900'}`}>
                                                                                {dept.name}
                                                                            </h4>
                                                                            {autoSaveStatus[deptNote.id] === 'saving' && (
                                                                                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                                                                    <i className="fas fa-circle-notch fa-spin text-[9px]" />
                                                                                    Saving
                                                                                </span>
                                                                            )}
                                                                            {autoSaveStatus[deptNote.id] === 'saved' && (
                                                                                <span
                                                                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                                                        isDark
                                                                                            ? 'bg-emerald-500/20 text-emerald-300'
                                                                                            : 'bg-emerald-500/15 text-emerald-700'
                                                                                    }`}
                                                                                >
                                                                                    <i className="fas fa-check text-[9px]" />
                                                                                    Saved
                                                                                </span>
                                                                            )}
                                                                            {autoSaveStatus[deptNote.id] === 'error' && (
                                                                                <span
                                                                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                                                                        isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-500/15 text-red-700'
                                                                                    }`}
                                                                                >
                                                                                    <i className="fas fa-exclamation-triangle text-[9px]" />
                                                                                    Error
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                                                                    {currentMonthlyNotes.userAllocations?.filter((a) => a.departmentId === dept.id).length > 0 && (
                                                                        <div className="flex flex-wrap gap-1 justify-end max-w-[14rem]">
                                                                            {currentMonthlyNotes.userAllocations
                                                                                .filter((a) => a.departmentId === dept.id)
                                                                                .map((allocation) => (
                                                                                    <span
                                                                                        key={allocation.id}
                                                                                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full truncate max-w-full ${
                                                                                            isDark
                                                                                                ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-600/80'
                                                                                                : 'bg-white text-slate-700 ring-1 ring-slate-200 shadow-sm'
                                                                                        }`}
                                                                                    >
                                                                                        {getUserName(allocation.userId)}
                                                                                    </span>
                                                                                ))}
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            setSelectedDepartment(dept.id);
                                                                            setShowAllocationModal(true);
                                                                        }}
                                                                        className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-xs transition ${
                                                                            isDark
                                                                                ? 'bg-slate-800 text-slate-200 ring-1 ring-slate-600 hover:bg-slate-700'
                                                                                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 shadow-sm'
                                                                        }`}
                                                                        title="Allocate users"
                                                                    >
                                                                        <i className="fas fa-user-plus" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                            
                                                            <div className="space-y-3 flex-grow min-h-0">
                                                                {/* Successes */}
                                                                <div
                                                                    className={`rounded-xl border p-3 ${
                                                                        isDark
                                                                            ? 'border-slate-700/60 bg-slate-950/25'
                                                                            : 'border-slate-200/90 bg-slate-50/80'
                                                                    }`}
                                                                >
                                                                    <label className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                        <i className="fas fa-arrow-trend-up text-[10px] text-emerald-500" aria-hidden />
                                                                        Last week&apos;s successes
                                                                    </label>
                                                                    {window.RichTextEditor ? (
                                                                        <window.RichTextEditor
                                                                            key={`rich-editor-${deptNote.id}-successes`}
                                                                            value={deptNote.successes || ''}
                                                                            onChange={(html) => handleFieldChange(deptNote.id, 'successes', html)}
                                                                            onBlur={(html) => handleFieldBlur(deptNote.id, 'successes', html)}
                                                                            onFocus={() => {
                                                                                captureDeptFieldFocus(deptNote.id, 'successes');
                                                                                const currentScroll = window.scrollY || window.pageYOffset;
                                                                                requestAnimationFrame(() => {
                                                                                    window.scrollTo(0, currentScroll);
                                                                                    setTimeout(() => {
                                                                                        window.scrollTo(0, currentScroll);
                                                                                    }, 0);
                                                                                    setTimeout(() => {
                                                                                        window.scrollTo(0, currentScroll);
                                                                                    }, 50);
                                                                                });
                                                                            }}
                                placeholder="What went well during the week? (Use formatting toolbar for bullets, bold, etc.)"
                                                                            rows={4}
                                                                            isDark={isDark}
                                                                            {...meetingNotesRteMobileProps}
                                                                        />
                                                                    ) : (
                                                                        <textarea
                                                                            value={deptNote.successes || ''}
                                                                            onChange={(e) => handleFieldChange(deptNote.id, 'successes', e.target.value)}
                                                                            onBlur={(e) => handleFieldBlur(deptNote.id, 'successes', e.target.value)}
                                                                            onFocus={(e) => {
                                                                                // Preserve scroll position when focusing
                                                                                e.preventDefault();
                                                                                const currentScroll = window.scrollY || window.pageYOffset;
                                                                                // Use multiple restoration attempts
                                                                                requestAnimationFrame(() => {
                                                                                    window.scrollTo(0, currentScroll);
                                                                                    setTimeout(() => {
                                                                                        window.scrollTo(0, currentScroll);
                                                                                    }, 0);
                                                                                    setTimeout(() => {
                                                                                        window.scrollTo(0, currentScroll);
                                                                                    }, 50);
                                                                                });
                                                                            }}
                                                                            onClick={(e) => {
                                                                                // Preserve scroll position when clicking
                                                                                const currentScroll = window.scrollY || window.pageYOffset;
                                                                                requestAnimationFrame(() => {
                                                                                    window.scrollTo(0, currentScroll);
                                                                                });
                                                                            }}
                                                                            placeholder="What went well during the week?"
                                                                            className={`w-full min-h-[88px] rounded-lg border p-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                                                                                isDark
                                                                                    ? 'border-slate-600 bg-slate-900/40 text-slate-100 placeholder-slate-500'
                                                                                    : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400'
                                                                            }`}
                                                                            rows={4}
                                                                            data-dept-note-id={deptNote.id}
                                                                            data-field="successes"
                                                                        />
                                                                    )}
                                                                </div>

                                                        {/* Week to Follow */}
                                                        <div
                                                            className={`rounded-xl border p-3 ${
                                                                isDark
                                                                    ? 'border-slate-700/60 bg-slate-950/25'
                                                                    : 'border-slate-200/90 bg-slate-50/80'
                                                            }`}
                                                        >
                                                            <label className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                <i className="fas fa-list-check text-[10px] text-primary-500" aria-hidden />
                                                                Weekly plan
                                                            </label>
                                                            {window.RichTextEditor ? (
                                                                <window.RichTextEditor
                                                                    key={`rich-editor-${deptNote.id}-weekToFollow`}
                                                                    value={deptNote.weekToFollow || ''}
                                                                    onChange={(html) => handleFieldChange(deptNote.id, 'weekToFollow', html)}
                                                                    onBlur={(html) => handleFieldBlur(deptNote.id, 'weekToFollow', html)}
                                                                    onFocus={() => captureDeptFieldFocus(deptNote.id, 'weekToFollow')}
                                                                    placeholder="What's planned for the upcoming week? (Use formatting toolbar for bullets, bold, etc.)"
                                                                    rows={4}
                                                                    isDark={isDark}
                                                                    {...meetingNotesRteMobileProps}
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={deptNote.weekToFollow || ''}
                                                                    onChange={(e) => handleFieldChange(deptNote.id, 'weekToFollow', e.target.value)}
                                                                    onBlur={(e) => handleFieldBlur(deptNote.id, 'weekToFollow', e.target.value)}
                                                                    onFocus={(e) => {
                                                                        // Preserve scroll position when focusing
                                                                        e.preventDefault();
                                                                        const currentScroll = window.scrollY || window.pageYOffset;
                                                                        // Use multiple restoration attempts
                                                                        requestAnimationFrame(() => {
                                                                            window.scrollTo(0, currentScroll);
                                                                            setTimeout(() => {
                                                                                window.scrollTo(0, currentScroll);
                                                                            }, 0);
                                                                            setTimeout(() => {
                                                                                window.scrollTo(0, currentScroll);
                                                                            }, 50);
                                                                        });
                                                                    }}
                                                                    onClick={(e) => {
                                                                        // Preserve scroll position when clicking
                                                                        const currentScroll = window.scrollY || window.pageYOffset;
                                                                        requestAnimationFrame(() => {
                                                                            window.scrollTo(0, currentScroll);
                                                                        });
                                                                    }}
                                                                    placeholder="What's planned for the upcoming week?"
                                                                    className={`w-full min-h-[88px] rounded-lg border p-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                                                                        isDark
                                                                            ? 'border-slate-600 bg-slate-900/40 text-slate-100 placeholder-slate-500'
                                                                            : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400'
                                                                    }`}
                                                                    rows={4}
                                                                    data-dept-note-id={deptNote.id}
                                                                    data-field="weekToFollow"
                                                                />
                                                            )}
                                                        </div>

                                                        {/* Frustrations */}
                                                        <div
                                                            className={`rounded-xl border p-3 ${
                                                                isDark
                                                                    ? 'border-slate-700/60 bg-slate-950/25'
                                                                    : 'border-slate-200/90 bg-slate-50/80'
                                                            }`}
                                                        >
                                                            <label className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                <i className="fas fa-cloud-bolt text-[10px] text-amber-500" aria-hidden />
                                                                Frustrations / challenges
                                                            </label>
                                                            {window.RichTextEditor ? (
                                                                <window.RichTextEditor
                                                                    key={`rich-editor-${deptNote.id}-frustrations`}
                                                                    value={deptNote.frustrations || ''}
                                                                    onChange={(html) => handleFieldChange(deptNote.id, 'frustrations', html)}
                                                                    onBlur={(html) => handleFieldBlur(deptNote.id, 'frustrations', html)}
                                                                    onFocus={() => captureDeptFieldFocus(deptNote.id, 'frustrations')}
                                                                    placeholder="What challenges or blockers are we facing? (Use formatting toolbar for bullets, bold, etc.)"
                                                                    rows={4}
                                                                    isDark={isDark}
                                                                    {...meetingNotesRteMobileProps}
                                                                />
                                                            ) : (
                                                                <textarea
                                                                    value={deptNote.frustrations || ''}
                                                                    onChange={(e) => handleFieldChange(deptNote.id, 'frustrations', e.target.value)}
                                                                    onBlur={(e) => handleFieldBlur(deptNote.id, 'frustrations', e.target.value)}
                                                                    onFocus={(e) => {
                                                                        // Preserve scroll position when focusing
                                                                        e.preventDefault();
                                                                        const currentScroll = window.scrollY || window.pageYOffset;
                                                                        // Use multiple restoration attempts
                                                                        requestAnimationFrame(() => {
                                                                            window.scrollTo(0, currentScroll);
                                                                            setTimeout(() => {
                                                                                window.scrollTo(0, currentScroll);
                                                                            }, 0);
                                                                            setTimeout(() => {
                                                                                window.scrollTo(0, currentScroll);
                                                                            }, 50);
                                                                        });
                                                                    }}
                                                                    onClick={(e) => {
                                                                        // Preserve scroll position when clicking
                                                                        const currentScroll = window.scrollY || window.pageYOffset;
                                                                        requestAnimationFrame(() => {
                                                                            window.scrollTo(0, currentScroll);
                                                                        });
                                                                    }}
                                                                    placeholder="What challenges or blockers are we facing?"
                                                                    className={`w-full min-h-[88px] rounded-lg border p-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-primary-500/40 ${
                                                                        isDark
                                                                            ? 'border-slate-600 bg-slate-900/40 text-slate-100 placeholder-slate-500'
                                                                            : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400'
                                                                    }`}
                                                                    rows={4}
                                                                    data-dept-note-id={deptNote.id}
                                                                    data-field="frustrations"
                                                                />
                                                            )}
                                                    </div>
                                                
                                                    {/* Attachments */}
                                                        <div
                                                            className={`rounded-xl border p-3 ${
                                                                isDark
                                                                    ? 'border-slate-700/60 bg-slate-950/25'
                                                                    : 'border-slate-200/90 bg-slate-50/80'
                                                            }`}
                                                        >
                                                            <label className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                <i className="fas fa-paperclip text-[10px] text-slate-400" aria-hidden />
                                                                Attachments
                                                            </label>
                                                            
                                                            {/* Display existing attachments */}
                                                            {(() => {
                                                                let attachments = [];
                                                                try {
                                                                    if (deptNote.attachments) {
                                                                        attachments = typeof deptNote.attachments === 'string' 
                                                                            ? JSON.parse(deptNote.attachments) 
                                                                            : deptNote.attachments;
                                                                    }
                                                                } catch (e) {
                                                                    console.warn('Error parsing attachments:', e);
                                                                }
                                                                
                                                                return attachments.length > 0 ? (
                                                                    <div className="space-y-1.5 mb-2">
                                                                        {attachments.map((attachment, index) => (
                                                                            <div
                                                                                key={index}
                                                                                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition ${
                                                                                    isDark
                                                                                        ? 'bg-slate-900/50 ring-1 ring-slate-700/80 hover:ring-slate-600'
                                                                                        : 'bg-white ring-1 ring-slate-200/90 shadow-sm hover:ring-slate-300'
                                                                                }`}
                                                                            >
                                                                                <a 
                                                                                    href={attachment.url} 
                                                                                    target="_blank" 
                                                                                    rel="noopener noreferrer"
                                                                                    className={`flex min-w-0 flex-1 items-center gap-2 text-xs font-medium ${isDark ? 'text-primary-300 hover:text-primary-200' : 'text-primary-700 hover:text-primary-800'}`}
                                                                                >
                                                                                    <i className="fas fa-file shrink-0 opacity-80" />
                                                                                    <span className="truncate">{attachment.name}</span>
                                                                                    <span className={`shrink-0 text-[10px] font-normal ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                                        ({(attachment.size / 1024).toFixed(1)} KB)
                                                                                    </span>
                                                                                </a>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleDeleteAttachment(deptNote.id, index);
                                                                                    }}
                                                                                    className={`shrink-0 rounded-lg p-1.5 transition ${isDark ? 'text-slate-500 hover:bg-red-950/40 hover:text-red-300' : 'text-slate-400 hover:bg-red-50 hover:text-red-600'}`}
                                                                                    title="Delete attachment"
                                                                                >
                                                                                    <i className="fas fa-trash text-xs" />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : null;
                                                            })()}
                                                            
                                                            {/* File upload input */}
                                                            <div
                                                                className={`rounded-xl border border-dashed px-3 py-2.5 transition ${
                                                                    isDark
                                                                        ? 'border-slate-600/80 bg-slate-900/30 hover:border-slate-500'
                                                                        : 'border-slate-300/90 bg-white/80 hover:border-slate-400'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="file"
                                                                    id={`attachment-${deptNote.id}`}
                                                                    multiple
                                                                    onChange={(e) => {
                                                                        if (e.target.files && e.target.files.length > 0) {
                                                                            handleAttachmentUpload(deptNote.id, e.target.files);
                                                                        }
                                                                    }}
                                                                    className="hidden"
                                                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.txt,.csv"
                                                                />
                                                                <label
                                                                    htmlFor={`attachment-${deptNote.id}`}
                                                                    className={`flex cursor-pointer items-center gap-2 text-xs font-medium ${isDark ? 'text-slate-300 hover:text-slate-100' : 'text-slate-600 hover:text-slate-900'}`}
                                                                >
                                                                    <i className={`fas ${uploadingAttachments[deptNote.id] ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} />
                                                                    <span>{uploadingAttachments[deptNote.id] ? 'Uploading…' : 'Drop files or click to upload'}</span>
                                                                </label>
                                                            </div>
                                                        </div>

                                                        {/* Action Items */}
                                                        {deptNote.actionItems && deptNote.actionItems.length > 0 && (
                                                            <div
                                                                className={`rounded-xl border p-3 ${
                                                                    isDark
                                                                        ? 'border-slate-700/60 bg-slate-950/25'
                                                                        : 'border-slate-200/90 bg-slate-50/80'
                                                                }`}
                                                            >
                                                                <label className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                    <i className="fas fa-bolt text-[10px] text-amber-500" aria-hidden />
                                                                    Action items
                                                                </label>
                                                                <div className="space-y-2">
                                                                    {deptNote.actionItems.map((item) => (
                                                                        <div
                                                                            key={item.id}
                                                                            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 transition ${
                                                                                isDark
                                                                                    ? 'bg-slate-900/45 ring-1 ring-slate-700/80'
                                                                                    : 'bg-white ring-1 ring-slate-200/90 shadow-sm'
                                                                            }`}
                                                                        >
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</p>
                                                                                {item.description && (
                                                                                    <p className={`mt-0.5 text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.description}</p>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex shrink-0 gap-0.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        setEditingActionItem(item);
                                                                                        setShowActionItemModal(true);
                                                                                    }}
                                                                                    className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-primary-900/40 hover:text-primary-300' : 'text-slate-400 hover:bg-primary-50 hover:text-primary-600'}`}
                                                                                    title="Edit action item"
                                                                                >
                                                                                    <i className="fas fa-edit text-xs" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        handleDeleteActionItem(item.id);
                                                                                    }}
                                                                                    className={`rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-red-950/40 hover:text-red-300' : 'text-slate-400 hover:bg-red-50 hover:text-red-600'}`}
                                                                                    title="Delete action item"
                                                                                >
                                                                                    <i className="fas fa-trash text-xs" />
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Comments */}
                                                        {deptNote.comments && deptNote.comments.length > 0 && (
                                                            <div
                                                                className={`rounded-xl border p-3 ${
                                                                    isDark
                                                                        ? 'border-slate-700/60 bg-slate-950/25'
                                                                        : 'border-slate-200/90 bg-slate-50/80'
                                                                }`}
                                                            >
                                                                <label className={`mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                    <i className="fas fa-comments text-[10px] text-sky-500" aria-hidden />
                                                                    Discussion
                                                                </label>
                                                                <div className="space-y-2">
                                                                    {deptNote.comments.map((comment) => {
                                                                        let displayContent = comment.content || '';
                                                                        if (window.MentionHelper && displayContent) {
                                                                            displayContent = window.MentionHelper.highlightMentions(displayContent, isDark);
                                                                        }
                                                                        // Convert URLs to clickable links
                                                                        displayContent = linkifyText(displayContent);
                                                                        if (window.sanitizeHtml && displayContent) {
                                                                            displayContent = window.sanitizeHtml(displayContent);
                                                                        }
                                                                        
                                                                        return (
                                                                            <div
                                                                                key={comment.id}
                                                                                data-meeting-comment-id={comment.id}
                                                                                className={`rounded-xl p-3 transition ${
                                                                                    isDark
                                                                                        ? 'bg-slate-900/50 ring-1 ring-slate-700/80 hover:ring-slate-600'
                                                                                        : 'bg-white ring-1 ring-slate-200/90 shadow-sm hover:ring-slate-300'
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-start justify-between gap-2">
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <p 
                                                                                            className={`text-xs leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
                                                                                            dangerouslySetInnerHTML={{ __html: displayContent }}
                                                                                        />
                                                                                        <p className={`mt-2 text-[10px] font-medium uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                                                                            {comment.author ? (comment.author.name || comment.author.email) : 'Unknown'} · {new Date(comment.createdAt).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg' })}
                                                                                        </p>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            handleDeleteComment(comment.id);
                                                                                        }}
                                                                                        className={`shrink-0 rounded-lg p-1.5 transition ${isDark ? 'text-slate-500 hover:bg-red-950/40 hover:text-red-300' : 'text-slate-400 hover:bg-red-50 hover:text-red-600'}`}
                                                                                        title="Delete comment"
                                                                                    >
                                                                                        <i className="fas fa-trash text-xs" />
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        {/* Add Comment Button */}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setCommentContext({ 
                                                                    type: 'department', 
                                                                    id: deptNote.id,
                                                                    departmentId: deptNote.departmentId,
                                                                    title: `${DEPARTMENTS.find(d => d.id === deptNote.departmentId)?.name || 'Department'} Weekly Notes`
                                                                });
                                                                setShowCommentModal(true);
                                                            }}
                                                            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                                                                isDark
                                                                    ? 'border-slate-600 bg-slate-900/40 text-slate-200 hover:border-slate-500 hover:bg-slate-800/80'
                                                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-sm'
                                                            }`}
                                                        >
                                                            <i className="fas fa-comment text-[11px]" />
                                                            Add comment
                                                        </button>

                                                        {/* Add Action Item Button */}
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setEditingActionItem({ 
                                                                    monthlyNotesId: currentMonthlyNotes?.id,
                                                                    weeklyNotesId: week.id, 
                                                                    departmentNotesId: deptNote.id 
                                                                });
                                                                setShowActionItemModal(true);
                                                            }}
                                                            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition ${
                                                                isDark
                                                                    ? 'border-primary-500/40 bg-primary-900/25 text-primary-100 hover:border-primary-400/60 hover:bg-primary-900/40'
                                                                    : 'border-primary-200 bg-primary-50/80 text-primary-800 hover:border-primary-300 hover:bg-primary-50'
                                                            }`}
                                                        >
                                                            <i className="fas fa-plus text-[11px]" />
                                                            Add action item
                                                        </button>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty State - No monthly notes */}
            {selectedMonth && !currentMonthlyNotes && (
                <div
                    className={`rounded-2xl border p-10 text-center ${
                        isDark ? 'border-slate-700/80 bg-slate-900/35 ring-1 ring-white/5' : 'border-slate-200/90 bg-white shadow-sm'
                    }`}
                >
                    <span
                        className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                            isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
                        }`}
                        aria-hidden
                    >
                        <i className="fas fa-clipboard-list" />
                    </span>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        No meeting notes for {formatMonth(selectedMonth)} yet.
                    </p>
                    <button
                        type="button"
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                                await handleCreateMonth();
                            } catch (error) {
                                console.error('Error creating month from empty state button:', error);
                                // Error is already logged, silently handle
                            }
                        }}
                        className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-500"
                    >
                        Create month notes
                    </button>
                </div>
            )}

            {/* Empty State - Monthly notes exist but no weeks */}
            {selectedMonth && currentMonthlyNotes && weeks.length === 0 && (
                <div
                    className={`rounded-2xl border p-10 text-center ${
                        isDark ? 'border-slate-700/80 bg-slate-900/35 ring-1 ring-white/5' : 'border-slate-200/90 bg-white shadow-sm'
                    }`}
                >
                    <span
                        className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                            isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
                        }`}
                        aria-hidden
                    >
                        <i className="fas fa-calendar-week" />
                    </span>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        No weeks created for {formatMonth(selectedMonth)} yet.
                    </p>
                    <p className={`mt-2 text-xs leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                        Use the controls above to add a week or generate a month.
                    </p>
                </div>
            )}

            {!selectedMonth && (
                <div
                    className={`rounded-2xl border p-10 text-center ${
                        isDark ? 'border-slate-700/80 bg-slate-900/35 ring-1 ring-white/5' : 'border-slate-200/90 bg-white shadow-sm'
                    }`}
                >
                    <span
                        className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-2xl ${
                            isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
                        }`}
                        aria-hidden
                    >
                        <i className="fas fa-calendar" />
                    </span>
                    <p className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                        Select a month to view or create meeting notes.
                    </p>
                </div>
            )}

            {/* User Allocation Modal */}
            {showAllocationModal && currentMonthlyNotes && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`rounded-lg border p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                Allocate Users to Departments
                            </h3>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowAllocationModal(false);
                                }}
                                className={`p-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <div className="space-y-4">
                            {DEPARTMENTS.map(dept => {
                                                        const allocations = currentMonthlyNotes.userAllocations?.filter(
                                    a => a.departmentId === dept.id
                                                        ) || [];
                                                        return (
                                                            <div key={dept.id} className={`border rounded-lg p-3 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
                                        <h4 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{dept.name}</h4>
                                        <div className="space-y-2">
                                            {allocations.map(allocation => (
                                                <div key={allocation.id} className="flex items-center justify-between">
                                                    <span className={`text-xs ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                                                        {getUserName(allocation.userId)} ({allocation.role})
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            handleDeleteAllocation(dept.id, allocation.userId);
                                                        }}
                                                        className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-red-900 text-red-200 hover:bg-red-800' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ))}
                                            <select
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        handleUpdateAllocation(dept.id, e.target.value, 'contributor');
                                                        e.target.value = '';
                                                    }
                                                }}
                                                className={`w-full text-xs px-2 py-1 border rounded ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                                            >
                                                <option value="">—</option>
                                                {users.filter(u => !allocations.find(a => a.userId === u.id)).map(user => (
                                                    <option key={user.id} value={user.id}>{user.name || user.email}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Action Item Modal */}
            {showActionItemModal && currentMonthlyNotes && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`rounded-lg border p-6 max-w-lg w-full ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                {editingActionItem ? 'Edit Action Item' : 'Add Action Item'}
                            </h3>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentScrollPosition = window.scrollY || window.pageYOffset;
                                    setShowActionItemModal(false);
                                    setEditingActionItem(null);
                                    requestAnimationFrame(() => {
                                        window.scrollTo(0, currentScrollPosition);
                                    });
                                }}
                                className={`p-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <ActionItemForm
                            actionItem={editingActionItem}
                            monthlyNotesId={currentMonthlyNotes.id}
                            users={users}
                            isDark={isDark}
                            onSave={handleSaveActionItem}
                            onCancel={() => {
                                setShowActionItemModal(false);
                                setEditingActionItem(null);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Comment Modal */}
            {showCommentModal && commentContext && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className={`rounded-lg border p-6 max-w-lg w-full ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Add Comment</h3>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const currentScrollPosition = window.scrollY || window.pageYOffset;
                                    setShowCommentModal(false);
                                    setCommentContext(null);
                                    requestAnimationFrame(() => {
                                        window.scrollTo(0, currentScrollPosition);
                                    });
                                }}
                                className={`p-1 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                        <CommentForm
                            isDark={isDark}
                            commentContext={commentContext}
                            users={users}
                            onSubmit={handleCreateComment}
                            onCreateActionItem={(actionItemData) => {
                                // Close comment modal and open action item modal
                                setShowCommentModal(false);
                                setCommentContext(null);
                                
                                // Merge action item data with comment context
                                const newActionItem = {
                                    ...actionItemData,
                                    monthlyNotesId: currentMonthlyNotes?.id,
                                    weeklyNotesId: commentContext.type === 'department' ? selectedWeek : null,
                                    departmentNotesId: commentContext.type === 'department' ? commentContext.id : null
                                };
                                
                                setEditingActionItem(newActionItem);
                                setShowActionItemModal(true);
                            }}
                            onCancel={() => {
                                setShowCommentModal(false);
                                setCommentContext(null);
                            }}
                        />
                    </div>
                </div>
            )}
            {gmMinuteInlinePopover &&
            window.ReactDOM &&
            typeof window.ReactDOM.createPortal === 'function'
                ? window.ReactDOM.createPortal(
                      <div
                          data-gm-minute-inline-popover
                          className={`rounded-xl border shadow-2xl p-3 min-w-[240px] max-w-[min(94vw,340px)] ${
                              isDark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-gray-200 text-gray-900'
                          }`}
                          style={{
                              position: 'fixed',
                              top: `${gmMinuteInlinePopover.top}px`,
                              left: `${gmMinuteInlinePopover.left}px`,
                              zIndex: 400
                          }}
                      >
                          {gmMinuteInlinePopover.phase === 'chip' ? (
                              <>
                                  <p className={`text-[11px] mb-2 max-h-20 overflow-y-auto whitespace-pre-wrap ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                      {gmMinuteInlinePopover.quote}
                                  </p>
                                  <div className="flex flex-wrap gap-2 justify-end">
                                      <button
                                          type="button"
                                          onClick={() => setGmMinuteInlinePopover(null)}
                                          className={`text-xs px-2 py-1 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-gray-600 hover:bg-gray-100'}`}
                                      >
                                          Cancel
                                      </button>
                                      <button
                                          type="button"
                                          onClick={() =>
                                              setGmMinuteInlinePopover((p) => (p ? { ...p, phase: 'compose' } : p))
                                          }
                                          className="text-xs px-3 py-1.5 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-700"
                                      >
                                          Comment
                                      </button>
                                  </div>
                              </>
                          ) : window.CommentInputWithMentions ? (
                              <div className="space-y-2">
                                  <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                      Selected text (others will see this thread on this week’s minutes).
                                  </p>
                                  <window.CommentInputWithMentions
                                      onSubmit={(t) => void submitGmMinuteInlineComment(t)}
                                      placeholder="Comment or add others with @…"
                                      rows={3}
                                      showButton={true}
                                      autoFocus={true}
                                  />
                                  <button
                                      type="button"
                                      onClick={() =>
                                          setGmMinuteInlinePopover((p) => (p ? { ...p, phase: 'chip' } : p))
                                      }
                                      className={`text-xs ${isDark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                                  >
                                      Back
                                  </button>
                              </div>
                          ) : (
                              <p className={`text-xs ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                                  Comment input unavailable.
                              </p>
                          )}
                      </div>,
                      document.body
                  )
                : null}
            </div>
            {currentMonthlyNotes && Array.isArray(weeks) && weeks.length > 0 && gmCommentsSidebarVisible ? (
                <aside
                    id="gm-minutes-comments-aside"
                    className={`mt-4 w-full shrink-0 rounded-2xl border p-4 sm:p-5 xl:mt-0 xl:w-[min(22rem,calc(100vw-2rem))] xl:max-h-[calc(100vh-1.5rem)] xl:overflow-y-auto xl:sticky xl:top-4 ${
                        isDark ? 'border-slate-700/80 bg-slate-900/55' : 'border-slate-200/90 bg-white shadow-sm'
                    }`}
                    aria-label="General minutes text comments"
                >
                    <div className="mb-3 flex items-start justify-between gap-2">
                        <h3
                            className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                        >
                            General minutes comments
                        </h3>
                        <button
                            type="button"
                            onClick={() => setGmCommentsSidebarVisiblePersisted(false)}
                            className={`shrink-0 rounded-lg p-1.5 transition ${isDark ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
                            title="Hide comments sidebar"
                            aria-label="Hide comments sidebar"
                        >
                            <i className="fas fa-times text-xs" aria-hidden />
                        </button>
                    </div>
                    {gmScreenSidebarWeeks.length === 0 ? (
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
                            No threads yet. Select text in a week’s General minutes, then use Comment to start a discussion.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {gmScreenSidebarWeeks.map(({ week, gmIdent, weekLabel, threads }) => (
                                <div key={week.id}>
                                    <p
                                        className={`text-[11px] font-semibold tracking-tight mb-2 ${isDark ? 'text-slate-200' : 'text-slate-900'}`}
                                    >
                                        {weekLabel}
                                    </p>
                                    <ul className="space-y-2">
                                        {threads.map((t) => (
                                            <li
                                                key={t.id}
                                                data-gm-sidebar-thread={t.id}
                                                className={`rounded-lg border px-2.5 py-2 text-[11px] ${
                                                    isDark ? 'border-slate-700 bg-slate-800/80' : 'border-slate-200 bg-slate-50/90'
                                                } ${
                                                    gmSidebarFocusThreadId === t.id
                                                        ? isDark
                                                            ? 'ring-2 ring-primary-400/50 ring-offset-2 ring-offset-slate-900'
                                                            : 'ring-2 ring-primary-500/40 ring-offset-2 ring-offset-white'
                                                        : ''
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-1">
                                                    <span
                                                        className={`italic line-clamp-3 min-w-0 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                                                    >
                                                        {(t.quote || '').slice(0, 160)}
                                                        {(t.quote || '').length > 160 ? '…' : ''}
                                                    </span>
                                                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                                                        <button
                                                            type="button"
                                                            className={`text-[10px] underline ${isDark ? 'text-primary-400' : 'text-primary-600'}`}
                                                            onClick={() => {
                                                                setGmSidebarFocusThreadId(t.id);
                                                                setSelectedWeek(gmIdent);
                                                                scrollToWeekId(gmIdent);
                                                                const run = () => {
                                                                    const host = document.querySelector(
                                                                        `[data-gm-editor-host="${String(week.id)}"]`
                                                                    );
                                                                    if (!host) {
                                                                        return;
                                                                    }
                                                                    const ed = host.querySelector('[contenteditable="true"]');
                                                                    const ta = host.querySelector('textarea');
                                                                    if (ed) {
                                                                        ed.focus();
                                                                        gmSetSelectionByPlainOffsets(ed, t.start, t.end);
                                                                    } else if (ta) {
                                                                        ta.focus();
                                                                        try {
                                                                            ta.setSelectionRange(t.start, t.end);
                                                                        } catch (_) {
                                                                            /* ignore */
                                                                        }
                                                                    }
                                                                };
                                                                requestAnimationFrame(() => requestAnimationFrame(run));
                                                            }}
                                                        >
                                                            Jump
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`text-[10px] underline ${isDark ? 'text-rose-400' : 'text-rose-600'}`}
                                                            onClick={() => void deleteGmMinuteThread(week.id, t.id)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                                {t.anchorStale ? (
                                                    <span
                                                        className={`text-[9px] font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}
                                                    >
                                                        Text may have moved
                                                    </span>
                                                ) : null}
                                                <label
                                                    className={`mt-1 flex items-center gap-1.5 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-600'}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={!!t.resolved}
                                                        onChange={(e) =>
                                                            void toggleGmMinuteThreadResolved(
                                                                week.id,
                                                                t.id,
                                                                e.target.checked
                                                            )
                                                        }
                                                    />
                                                    Resolved
                                                </label>
                                                <div className={`mt-1.5 space-y-0.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                    {(t.messages || []).map((m) => (
                                                        <div key={m.id} className="whitespace-pre-wrap break-words">
                                                            <span className="font-medium">{m.authorName || 'Someone'}:</span>{' '}
                                                            {m.text}
                                                        </div>
                                                    ))}
                                                </div>
                                                {CommentInpSidebar ? (
                                                    <div className="mt-1.5">
                                                        <CommentInpSidebar
                                                            onSubmit={(txt) =>
                                                                void replyGmMinuteThread(week.id, t.id, txt, gmIdent)
                                                            }
                                                            placeholder="Reply… (@mention)"
                                                            rows={2}
                                                            showButton={true}
                                                        />
                                                    </div>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>
            ) : null}
        </div>
    );
};

// Action Item Form Component with rich text support
const ActionItemForm = ({ actionItem, monthlyNotesId, users, isDark, onSave, onCancel }) => {
    const [title, setTitle] = useState(actionItem?.title || '');
    const [description, setDescription] = useState(actionItem?.description || '');
    const [status, setStatus] = useState(actionItem?.status || 'open');
    const [priority, setPriority] = useState(actionItem?.priority || 'medium');
    const [assignedUserId, setAssignedUserId] = useState(actionItem?.assignedUserId || '');
    const [dueDate, setDueDate] = useState(actionItem?.dueDate ? new Date(actionItem.dueDate).toISOString().split('T')[0] : '');

    // Handle initial values from comment
    useEffect(() => {
        if (actionItem?.fromComment && actionItem?.title && actionItem?.description) {
            setTitle(actionItem.title);
            setDescription(actionItem.description);
        }
    }, [actionItem]);

    const handleSubmit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Preserve scroll position before save
        const currentScrollPosition = window.scrollY || window.pageYOffset;
        onSave({
            monthlyNotesId: actionItem?.monthlyNotesId || monthlyNotesId,
            weeklyNotesId: actionItem?.weeklyNotesId || null,
            departmentNotesId: actionItem?.departmentNotesId || null,
            title,
            description,
            status,
            priority,
            assignedUserId: assignedUserId || null,
            dueDate: dueDate || null
        });
        // Immediately restore scroll position
        requestAnimationFrame(() => {
            window.scrollTo({ top: currentScrollPosition, behavior: 'instant' });
        });
        setTimeout(() => {
            window.scrollTo({ top: currentScrollPosition, behavior: 'instant' });
        }, 0);
    };

    const RichTextEditor = window.RichTextEditor || null;

    return (
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); handleSubmit(e); }} className="space-y-4">
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Title *</label>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                />
            </div>
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Description <span className="text-xs opacity-70">(supports rich text formatting)</span>
                </label>
                {RichTextEditor ? (
                    <RichTextEditor
                        value={description}
                        onChange={(html) => setDescription(html)}
                        placeholder="Enter description with formatting (bold, bullets, etc.)"
                        rows={4}
                        isDark={isDark}
                    />
                ) : (
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                        rows="4"
                        placeholder="Enter description..."
                    />
                )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Status</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Priority</label>
                    <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Assigned To</label>
                    <select
                        value={assignedUserId}
                        onChange={(e) => setAssignedUserId(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    >
                        <option value="">Unassigned</option>
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.name || user.email}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>Due Date</label>
                    <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className={`w-full px-3 py-2 text-sm border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    />
                </div>
            </div>
            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentScrollPosition = window.scrollY || window.pageYOffset;
                        onCancel();
                        requestAnimationFrame(() => {
                            window.scrollTo(0, currentScrollPosition);
                        });
                    }}
                    className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSubmit(e);
                    }}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    Save
                </button>
            </div>
        </form>
    );
};

// Comment Form Component with mention support and action item creation
const CommentForm = ({ isDark, onSubmit, onCancel, commentContext, onCreateActionItem, users = [] }) => {
    const [content, setContent] = useState('');
    const textareaRef = useRef(null);

    const handleSubmit = (commentText) => {
        if (commentText && commentText.trim()) {
            // Preserve scroll position before submit
            const currentScrollPosition = window.scrollY || window.pageYOffset;
            onSubmit(commentText);
            setContent('');
            // Immediately restore scroll position
            requestAnimationFrame(() => {
                window.scrollTo({ top: currentScrollPosition, behavior: 'instant' });
            });
            setTimeout(() => {
                window.scrollTo({ top: currentScrollPosition, behavior: 'instant' });
            }, 0);
            setTimeout(() => {
                window.scrollTo({ top: currentScrollPosition, behavior: 'instant' });
            }, 10);
        }
    };

    const handleTextareaChange = (e) => {
        setContent(e.target.value);
    };

    const handleCreateActionItemFromComment = () => {
        const textContent = textareaRef.current?.value || content;
        if (textContent.trim() && onCreateActionItem) {
            // Extract first line as title, rest as description
            const lines = textContent.split('\n').filter(l => l.trim());
            const title = lines[0]?.trim() || 'Action Item from Comment';
            const description = lines.slice(1).join('\n').trim() || textContent.trim();
            
            onCreateActionItem({
                title,
                description,
                fromComment: true,
                commentText: textContent
            });
            setContent('');
        }
    };

    // Use CommentInputWithMentions if available, otherwise fallback to regular textarea
    const CommentInput = window.CommentInputWithMentions || null;

    if (CommentInput) {
        // Use CommentInputWithMentions component
        return (
            <div className="space-y-4">
                <div>
                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                        Comment <span className="text-xs opacity-70">(@mention users to notify them)</span>
                    </label>
                    <CommentInput
                        onSubmit={handleSubmit}
                        placeholder="Add a comment... (@mention users, Shift+Enter for new line, Enter to send)"
                        rows={4}
                        taskTitle={commentContext?.title || 'Meeting Notes'}
                        taskLink="/teams"
                        showButton={true}
                    />
                </div>
                
                <div className="flex gap-2 justify-end">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const currentScrollPosition = window.scrollY || window.pageYOffset;
                            onCancel();
                            requestAnimationFrame(() => {
                                window.scrollTo(0, currentScrollPosition);
                            });
                        }}
                        className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Fallback to regular textarea with action item creation
    return (
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(content); }} className="space-y-4">
            <div>
                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>
                    Comment <span className="text-xs opacity-70">(@mention users to notify them)</span>
                </label>
                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={handleTextareaChange}
                    required
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300'}`}
                    rows="4"
                    placeholder="Add a comment... (@mention users, Shift+Enter for new line, Enter to send)"
                />
            </div>
            <div className="flex gap-2 justify-end">
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const currentScrollPosition = window.scrollY || window.pageYOffset;
                        onCancel();
                        requestAnimationFrame(() => {
                            window.scrollTo(0, currentScrollPosition);
                        });
                    }}
                    className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                    Cancel
                </button>
                {onCreateActionItem && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const currentScrollPosition = window.scrollY || window.pageYOffset;
                            handleCreateActionItemFromComment();
                            requestAnimationFrame(() => {
                                window.scrollTo(0, currentScrollPosition);
                            });
                        }}
                        className={`px-4 py-2 text-sm rounded-lg ${isDark ? 'bg-primary-700 text-primary-200 hover:bg-primary-600' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'}`}
                    >
                        <i className="fas fa-tasks mr-1"></i>
                        Create Action Item
                    </button>
                )}
                <button
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSubmit(content);
                    }}
                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                    Post Comment
                </button>
            </div>
        </form>
    );
};

// Make available globally
window.ManagementMeetingNotes = ManagementMeetingNotes;

