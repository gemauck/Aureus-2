/**
 * POA Review API helpers (rules meta, org settings, server-aligned pre-flight strength).
 * Loaded after poaAnalyze.js (uses window.analyzePoaRows, etc.).
 */

const SMR_SOURCES_KEY = 'poaReviewSmrSources';

function authHeaders() {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function loadSavedSmrSources() {
    try {
        const raw = localStorage.getItem(SMR_SOURCES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
}

function saveSmrSources(sources) {
    try {
        localStorage.setItem(SMR_SOURCES_KEY, JSON.stringify(sources || []));
    } catch (e) {
        console.warn('Could not save POA SMR sources', e);
    }
}

async function fetchPoaRulesMeta() {
    const res = await fetch('/api/poa-review/rules', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load POA rules metadata');
    const body = await res.json();
    return body.data || body;
}

async function fetchPoaSettings() {
    const res = await fetch('/api/poa-review/settings', { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to load POA settings');
    const body = await res.json();
    return body.data?.settings || body.settings;
}

async function savePoaSettings(settings) {
    const res = await fetch('/api/poa-review/settings', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ settings }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || err?.message || 'Failed to save POA settings');
    }
    const body = await res.json();
    return body.data?.settings || body.settings;
}

async function fetchServerPreflightStrength(rows, { sources, settings, columnMapping }) {
    const res = await fetch('/api/poa-review/preflight-strength', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
            rows,
            sources: sources || [],
            settings: settings || {},
            columnMapping: columnMapping || {},
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || err?.message || 'Server pre-flight failed');
    }
    const body = await res.json();
    return body.data || body;
}

const MAX_SERVER_PREFLIGHT_ROWS = 25000;

async function analyzePoaRowsFull(rows, options = {}) {
    const applyColumnMappingToRows = window.applyColumnMappingToRows || ((r) => r);
    const analyzePoaRows = window.analyzePoaRows;
    const mapping = options.columnMapping || {};
    const mapped = applyColumnMappingToRows(rows, mapping);
    const local = analyzePoaRows
        ? analyzePoaRows(mapped, options)
        : { ok: false, errors: ['POA analyze module not loaded'] };
    const slice = mapped.slice(0, MAX_SERVER_PREFLIGHT_ROWS);

    try {
        const server = await fetchServerPreflightStrength(slice, {
            sources: options.sources,
            settings: options.settings,
            columnMapping: mapping,
        });
        return {
            ...local,
            strengthSummary: server.strengthSummary || local.strengthSummary,
            rulesMeta: server.rulesMeta,
            shiftFallbackBatchCount: server.shiftFallbackBatchCount,
            preflightEngine: server.preflightEngine || 'python',
            preflightNote:
                mapped.length > MAX_SERVER_PREFLIGHT_ROWS
                    ? `Strength tiers from first ${MAX_SERVER_PREFLIGHT_ROWS.toLocaleString()} rows (same rules as report).`
                    : 'Strength tiers use the same server rules as the Excel report.',
        };
    } catch (e) {
        console.warn('POA server pre-flight strength unavailable:', e);
        return {
            ...local,
            preflightEngine: 'client-estimate',
            preflightNote:
                'Strength tiers are a rough client estimate. Process the file for authoritative scoring.',
        };
    }
}

if (typeof window !== 'undefined') {
    window.analyzePoaRowsFull = analyzePoaRowsFull;
    window.fetchPoaRulesMeta = fetchPoaRulesMeta;
    window.fetchPoaSettings = fetchPoaSettings;
    window.savePoaSettings = savePoaSettings;
    window.loadSavedSmrSources = loadSavedSmrSources;
    window.saveSmrSources = saveSmrSources;
}

export const poaReviewApiLoaded = true;
