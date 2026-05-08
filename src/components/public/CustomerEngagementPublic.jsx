/**
 * Public customer engagement questionnaire (no login).
 * Route: /customer-engagement?token=...
 * Typography: Outfit + DM Sans (loaded in index.html).
 */
const { useState, useEffect, useMemo, useCallback } = React;

const MAX_IMG_BYTES = 700 * 1024;

const FONT = {
    display: "'Outfit', system-ui, sans-serif",
    body: "'DM Sans', system-ui, sans-serif"
};

function apiOrigin() {
    return window.location.origin || '';
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        credentials: 'omit'
    });
    const text = await res.text();
    let body = {};
    try {
        body = text ? JSON.parse(text) : {};
    } catch {
        body = {};
    }
    if (!res.ok) {
        const msg =
            body?.error?.message ||
            body?.message ||
            (typeof body?.error === 'string' ? body.error : null) ||
            `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return body.data !== undefined ? body.data : body;
}

function deepCopyCheckboxDefaults(groupField) {
    const o = {};
    for (const opt of groupField.options || []) {
        o[opt.id] = false;
    }
    return o;
}

const SECTION_GRADIENTS = [
    'from-blue-950 via-blue-900 to-blue-600',
    'from-slate-950 via-blue-900 to-indigo-700',
    'from-indigo-950 via-blue-800 to-sky-600',
    'from-slate-900 via-blue-950 to-blue-700',
    'from-blue-900 via-indigo-900 to-blue-600'
];

function buildInitialResponses(formDef) {
    const out = {};
    if (!formDef?.sections) return out;
    for (const sec of formDef.sections) {
        for (const f of sec.fields) {
            if (f.type === 'checkboxGroup') {
                out[f.id] = deepCopyCheckboxDefaults(f);
            } else if (f.type === 'fileList') {
                out[f.id] = [];
            } else {
                out[f.id] = '';
            }
        }
    }
    return out;
}

function SectionBanner({ index, total, title }) {
    const g = SECTION_GRADIENTS[index % SECTION_GRADIENTS.length];
    return (
        <div className={`relative h-32 sm:h-36 overflow-hidden bg-gradient-to-br ${g}`}>
            <div
                className="pointer-events-none absolute inset-0 opacity-45 bg-[radial-gradient(ellipse_90%_120%_at_15%_0%,rgba(255,255,255,0.38),transparent_55%)]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_70%_80%_at_100%_100%,rgba(56,189,248,0.35),transparent)]"
                aria-hidden
            />
            <div className="relative h-full flex flex-col justify-end px-5 pb-4 sm:px-7 sm:pb-5">
                <p
                    className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 mb-1"
                    style={{ fontFamily: FONT.body }}
                >
                    Step {index + 1} of {total}
                </p>
                <h3 className="text-lg sm:text-xl font-bold text-white leading-tight" style={{ fontFamily: FONT.display }}>
                    {title}
                </h3>
            </div>
        </div>
    );
}

const CustomerEngagementPublic = () => {
    const params = useMemo(() => new URLSearchParams(window.location.search), []);
    const token = (params.get('token') || '').trim();
    const questionnaireId = (params.get('q') || params.get('questionnaireId') || '').trim();

    const [phase, setPhase] = useState(token ? 'loading' : 'missing');
    const [error, setError] = useState('');
    const [branding, setBranding] = useState(null);
    const [formDef, setFormDef] = useState(null);
    const [responses, setResponses] = useState({});
    const [submitted, setSubmitted] = useState(false);
    const [submittedAt, setSubmittedAt] = useState(null);
    const [saving, setSaving] = useState(false);

    const sections = formDef?.sections || [];
    const totalSteps = sections.length;

    const loadBranding = useCallback(async () => {
        try {
            const b = await fetchJson(`${apiOrigin()}/api/public/document-branding`);
            setBranding(b);
        } catch {
            setBranding({
                companyName: 'Abcotronics',
                letterhead: { logoDataUrl: null, addressLines: [], phone: '', email: '', vatNumber: '' }
            });
        }
    }, []);

    useEffect(() => {
        if (!token) {
            setPhase('missing');
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                await loadBranding();
                const query = new URLSearchParams({ token });
                if (questionnaireId) query.set('q', questionnaireId);
                const data = await fetchJson(
                    `${apiOrigin()}/api/public/customer-engagement?${query.toString()}`
                );
                if (cancelled) return;
                setFormDef(data.form);
                if (data.submitted && data.responses) {
                    setSubmitted(true);
                    setSubmittedAt(data.submittedAt || null);
                    setResponses(data.responses);
                } else {
                    setResponses(data.initialResponses || buildInitialResponses(data.form));
                }
                setPhase('ready');
            } catch (e) {
                if (!cancelled) {
                    setError(e.message || 'Failed to load form');
                    setPhase('error');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, questionnaireId, loadBranding]);

    const setField = (id, value) => {
        setResponses((prev) => ({ ...prev, [id]: value }));
    };

    const toggleCheckbox = (fieldId, optionId) => {
        setResponses((prev) => {
            const cur = prev[fieldId] || {};
            return {
                ...prev,
                [fieldId]: { ...cur, [optionId]: !cur[optionId] }
            };
        });
    };

    const onPickPhotos = async (fieldId, files) => {
        const list = Array.from(files || []).filter((f) => /^image\/(png|jpeg|jpg)$/i.test(f.type));
        const out = [];
        for (const file of list.slice(0, 8)) {
            if (file.size > MAX_IMG_BYTES) continue;
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
            out.push({ name: file.name, dataUrl });
        }
        setField(fieldId, out);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token || submitted) return;
        setSaving(true);
        setError('');
        try {
            await fetchJson(`${apiOrigin()}/api/public/customer-engagement`, {
                method: 'POST',
                body: JSON.stringify({ token, questionnaireId, responses })
            });
            setSubmitted(true);
            setSubmittedAt(new Date().toISOString());
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            setError(err.message || 'Submit failed');
        } finally {
            setSaving(false);
        }
    };

    const letterhead = branding?.letterhead || {};
    const companyName = branding?.companyName || 'Abcotronics';

    const shellClass =
        'min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 ' +
        "bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(37,99,235,0.12),transparent),radial-gradient(ellipse_80%_50%_at_100%_50%,rgba(148,163,184,0.08),transparent)] " +
        'dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(59,130,246,0.15),transparent)]';

    if (phase === 'missing') {
        return (
            <div className={`${shellClass} flex items-center justify-center p-6`} style={{ fontFamily: FONT.body }}>
                <div className="max-w-md w-full rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 backdrop-blur shadow-xl shadow-slate-200/50 dark:shadow-black/40 p-8 sm:p-10 text-center">
                    <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
                        <svg className="w-7 h-7 opacity-95" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2" style={{ fontFamily: FONT.display }}>
                        Link incomplete
                    </h1>
                    <p className="text-sm text-slate-600 leading-relaxed dark:text-slate-400">
                        This page needs the full link your Abco contact emailed or messaged you. It should include{' '}
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">
                            ?token=…
                        </code>{' '}
                        at the end.
                    </p>
                </div>
            </div>
        );
    }

    if (phase === 'loading') {
        return (
            <div className={`${shellClass} flex items-center justify-center p-6`} style={{ fontFamily: FONT.body }}>
                <div className="text-center">
                    <div className="relative mx-auto mb-5 h-14 w-14">
                        <div className="absolute inset-0 rounded-2xl bg-blue-500/20 dark:bg-blue-400/20 animate-pulse" />
                        <div className="absolute inset-2 rounded-xl border-2 border-blue-600 border-t-transparent dark:border-blue-400 animate-spin" />
                    </div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading your form…</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">This only takes a moment</p>
                </div>
            </div>
        );
    }

    if (phase === 'error') {
        return (
            <div className={`${shellClass} flex items-center justify-center p-6`} style={{ fontFamily: FONT.body }}>
                <div className="max-w-md w-full rounded-2xl border border-red-200/90 dark:border-red-900/60 bg-white dark:bg-slate-900 shadow-xl p-8">
                    <div className="mb-4 h-12 w-12 rounded-xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-2" style={{ fontFamily: FONT.display }}>
                        We couldn’t open this form
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{error}</p>
                </div>
            </div>
        );
    }

    const inputBase =
        'w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/80 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500/35 focus:border-blue-500 disabled:opacity-60 disabled:bg-slate-50 dark:disabled:bg-slate-800';

    const renderField = (f) => {
        const val = responses[f.id];
        const commonLabel = (
            <label
                className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1.5 tracking-tight"
                style={{ fontFamily: FONT.body }}
            >
                {f.label}
                {f.required ? (
                    <span className="text-red-500 dark:text-red-400 font-bold ml-0.5" aria-hidden>
                        *
                    </span>
                ) : null}
            </label>
        );

        if (f.type === 'checkboxGroup') {
            return (
                <div key={f.id} className="mb-7 last:mb-0">
                    {commonLabel}
                    {f.hint ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{f.hint}</p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                        {(f.options || []).map((opt) => (
                            <label
                                key={opt.id}
                                className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/50 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-600/60 transition has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/80 dark:has-[:checked]:bg-blue-950/40"
                            >
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-500 dark:bg-slate-900"
                                    checked={!!(val && val[opt.id])}
                                    disabled={submitted}
                                    onChange={() => toggleCheckbox(f.id, opt.id)}
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-200 leading-snug">{opt.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            );
        }
        if (f.type === 'textarea') {
            return (
                <div key={f.id} className="mb-7 last:mb-0">
                    {commonLabel}
                    {f.hint ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">{f.hint}</p>
                    ) : null}
                    <textarea
                        className={`${inputBase} min-h-[100px] resize-y`}
                        value={typeof val === 'string' ? val : ''}
                        disabled={submitted}
                        placeholder={f.placeholder || ''}
                        onChange={(e) => setField(f.id, e.target.value)}
                    />
                </div>
            );
        }
        if (f.type === 'date') {
            return (
                <div key={f.id} className="mb-7 last:mb-0">
                    {commonLabel}
                    <input
                        type="date"
                        className={`${inputBase} max-w-xs`}
                        value={typeof val === 'string' ? val : ''}
                        disabled={submitted}
                        onChange={(e) => setField(f.id, e.target.value)}
                    />
                </div>
            );
        }
        if (f.type === 'fileList') {
            const items = Array.isArray(val) ? val : [];
            return (
                <div key={f.id} className="mb-7 last:mb-0">
                    {commonLabel}
                    {f.hint ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{f.hint}</p>
                    ) : null}
                    {!submitted ? (
                        <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 px-4 py-6 text-center hover:border-blue-300 dark:hover:border-blue-600 transition">
                            <svg
                                className="mx-auto h-10 w-10 text-slate-400 dark:text-slate-500 mb-2"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/jpg"
                                multiple
                                className="block w-full text-sm text-slate-600 dark:text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-blue-700 cursor-pointer"
                                onChange={(e) => onPickPhotos(f.id, e.target.files)}
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">PNG or JPEG, up to 8 files</p>
                        </div>
                    ) : null}
                    {items.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                            {items.map((it, i) => (
                                <li
                                    key={i}
                                    className="text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1 bg-white dark:bg-slate-800"
                                >
                                    {it.name || `Image ${i + 1}`}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        }
        return (
            <div key={f.id} className="mb-7 last:mb-0">
                {commonLabel}
                {f.hint ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">{f.hint}</p>
                ) : null}
                <input
                    type="text"
                    className={inputBase}
                    value={typeof val === 'string' ? val : ''}
                    disabled={submitted}
                    placeholder={f.placeholder || ''}
                    onChange={(e) => setField(f.id, e.target.value)}
                />
            </div>
        );
    };

    return (
        <div className={`${shellClass} pb-28 sm:pb-32`} style={{ fontFamily: FONT.body }}>
            <div className="max-w-3xl mx-auto px-4 py-8 sm:py-10 lg:py-12">
                {/* Section quick-nav */}
                {!submitted && totalSteps > 0 ? (
                    <nav
                        className="flex flex-wrap items-center justify-center gap-2 mb-8 sm:mb-10"
                        aria-label="Questionnaire sections"
                    >
                        {sections.map((sec, i) => (
                            <span
                                key={sec.id}
                                className="inline-flex items-center gap-2 rounded-full bg-white/90 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 shadow-sm backdrop-blur-sm"
                            >
                                <span
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white"
                                    style={{ fontFamily: FONT.display }}
                                >
                                    {i + 1}
                                </span>
                                <span className="max-w-[10rem] sm:max-w-xs truncate">{sec.heading}</span>
                            </span>
                        ))}
                    </nav>
                ) : null}

                <article className="rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200/90 dark:border-slate-700/90 bg-white dark:bg-slate-900 shadow-xl shadow-slate-300/30 dark:shadow-black/50">
                    {/* Hero strip + letterhead */}
                    <header className="relative">
                        <div
                            className="relative h-36 sm:h-44 overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700"
                        >
                            <div
                                className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(ellipse_100%_80%_at_20%_-10%,rgba(255,255,255,0.45),transparent_50%)]"
                                aria-hidden
                            />
                            <div
                                className="pointer-events-none absolute inset-0 opacity-35 bg-[radial-gradient(ellipse_80%_60%_at_100%_80%,rgba(56,189,248,0.45),transparent_45%)]"
                                aria-hidden
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" aria-hidden />
                            <div className="relative h-full flex flex-col justify-end px-6 sm:px-10 pb-6 sm:pb-8">
                                <div className="flex flex-col sm:flex-row sm:items-end gap-5 sm:justify-between">
                                    <div className="flex gap-4 items-center">
                                        {letterhead.logoDataUrl ? (
                                            <div className="shrink-0 rounded-xl bg-white/95 dark:bg-white p-2 shadow-lg">
                                                <img src={letterhead.logoDataUrl} alt="" className="h-11 sm:h-12 w-auto max-w-[140px] object-contain" />
                                            </div>
                                        ) : (
                                            <div
                                                className="h-12 w-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center text-white font-bold text-lg shadow-inner"
                                                style={{ fontFamily: FONT.display }}
                                            >
                                                A
                                            </div>
                                        )}
                                        <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70 mb-0.5">
                                                Confidential · Site visit
                                            </p>
                                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight" style={{ fontFamily: FONT.display }}>
                                                {companyName}
                                            </h1>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 sm:px-10 pt-6 sm:pt-8 pb-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                {(letterhead.addressLines || []).map((line, i) => (
                                    <span key={i}>{line}</span>
                                ))}
                                {letterhead.phone ? <span>Tel · {letterhead.phone}</span> : null}
                                {letterhead.email ? <span>Email · {letterhead.email}</span> : null}
                                {letterhead.vatNumber ? <span>VAT · {letterhead.vatNumber}</span> : null}
                            </div>
                            <h2
                                className="mt-6 text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight"
                                style={{ fontFamily: FONT.display }}
                            >
                                {formDef?.title || 'Site visit / Customer engagement questionnaire'}
                            </h2>
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
                                Help us understand your operation, fuel flow, and compliance context. Skip anything that does not apply — estimate where you need to.{' '}
                                <span className="font-medium text-slate-700 dark:text-slate-300">Your answers go straight to our team over a secure connection.</span>
                            </p>
                        </div>
                    </header>

                    <div className="px-4 sm:px-6 py-6 sm:py-8 bg-slate-50/70 dark:bg-slate-950/40">
                        {submitted ? (
                            <div className="rounded-2xl border border-emerald-200/90 dark:border-emerald-800/80 bg-emerald-50/90 dark:bg-emerald-950/40 px-5 py-4 mb-8 flex gap-4 items-start">
                                <div className="shrink-0 rounded-xl bg-emerald-500 text-white p-2 shadow-lg shadow-emerald-500/25">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="font-semibold text-emerald-900 dark:text-emerald-100" style={{ fontFamily: FONT.display }}>
                                        You’re all set
                                    </p>
                                    <p className="text-sm text-emerald-800/90 dark:text-emerald-200/90 mt-1 leading-relaxed">
                                        Thanks for taking the time. We received your questionnaire
                                        {submittedAt ? ` on ${new Date(submittedAt).toLocaleString('en-ZA')}` : ''}. Our team will follow up if anything needs
                                        clarification.
                                    </p>
                                </div>
                            </div>
                        ) : null}

                        {error ? (
                            <div className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200 px-4 py-3 mb-6 text-sm leading-relaxed">
                                {error}
                            </div>
                        ) : null}

                        <form onSubmit={handleSubmit} className="space-y-8">
                            {sections.map((sec, si) => (
                                <div
                                    key={sec.id}
                                    className="rounded-2xl overflow-hidden border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-md shadow-slate-200/50 dark:shadow-black/40 ring-1 ring-slate-100/80 dark:ring-slate-800"
                                >
                                    <SectionBanner index={si} total={totalSteps} title={sec.heading} />
                                    <div className="px-5 sm:px-8 py-6 sm:py-8 border-t border-slate-100 dark:border-slate-800">
                                        <div className="h-px w-12 bg-gradient-to-r from-blue-600 to-transparent rounded-full mb-6 opacity-80" aria-hidden />
                                        {sec.fields.map((f) => renderField(f))}
                                    </div>
                                </div>
                            ))}

                            {!submitted ? (
                                <div className="sticky bottom-0 left-0 right-0 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 pb-2 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent dark:from-slate-950 dark:via-slate-950 dark:to-transparent">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-4 sm:px-6 shadow-lg shadow-slate-300/40 dark:shadow-black/50">
                                        <p className="text-xs text-slate-500 dark:text-slate-400 sm:mr-auto sm:max-w-xs leading-relaxed order-2 sm:order-1">
                                            By submitting, you confirm the information is accurate to the best of your knowledge.
                                        </p>
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="order-1 sm:order-2 w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-sm font-semibold shadow-lg shadow-blue-600/25 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                                            style={{ fontFamily: FONT.display }}
                                        >
                                            {saving ? 'Sending…' : 'Submit questionnaire'}
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </form>
                    </div>
                </article>

                <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-8">
                    © {new Date().getFullYear()} {companyName}. All rights reserved.
                </p>
            </div>
        </div>
    );
};

try {
    window.CustomerEngagementPublic = CustomerEngagementPublic;
} catch (e) {
    console.error('CustomerEngagementPublic register failed', e);
}
