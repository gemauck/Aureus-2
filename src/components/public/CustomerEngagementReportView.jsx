/**
 * Read-only report matching the public questionnaire layout (for CRM “View responses” + print).
 */
const { useEffect } = React;

const FONT = {
    display: "'Outfit', system-ui, sans-serif",
    body: "'DM Sans', system-ui, sans-serif"
};

const SECTION_GRADIENTS = [
    'from-blue-950 via-blue-900 to-blue-600',
    'from-slate-950 via-blue-900 to-indigo-700',
    'from-indigo-950 via-blue-800 to-sky-600',
    'from-slate-900 via-blue-950 to-blue-700',
    'from-blue-900 via-indigo-900 to-blue-600'
];

function SectionBanner({ index, total, title }) {
    const g = SECTION_GRADIENTS[index % SECTION_GRADIENTS.length];
    return (
        <div className={`relative h-28 sm:h-32 overflow-hidden bg-gradient-to-br ${g}`}>
            <div
                className="pointer-events-none absolute inset-0 opacity-45 bg-[radial-gradient(ellipse_90%_120%_at_15%_0%,rgba(255,255,255,0.38),transparent_55%)]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(ellipse_70%_80%_at_100%_100%,rgba(56,189,248,0.35),transparent)]"
                aria-hidden
            />
            <div className="relative flex h-full flex-col justify-end px-5 pb-4 sm:px-7 sm:pb-5">
                <p
                    className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75 sm:text-[11px]"
                    style={{ fontFamily: FONT.body }}
                >
                    Section {index + 1} of {total}
                </p>
                <h3 className="text-lg font-bold leading-tight text-white sm:text-xl" style={{ fontFamily: FONT.display }}>
                    {title}
                </h3>
            </div>
        </div>
    );
}

function formatSubmittedAt(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleString('en-ZA');
    } catch {
        return String(iso);
    }
}

function CustomerEngagementReportView({ formDef, responses, branding, submittedAt, title: titleProp }) {
    const sections = formDef?.sections || [];
    const totalSteps = sections.length;
    const letterhead = branding?.letterhead || {};
    const companyName = branding?.companyName || 'Abcotronics';

    useEffect(() => {
        const id = 'ce-report-print-styles-v1';
        if (document.getElementById(id)) return;
        const s = document.createElement('style');
        s.id = id;
        s.textContent = `
@media print {
  body.ce-report-printing * { visibility: hidden !important; }
  body.ce-report-printing .no-print { display: none !important; visibility: hidden !important; }
  body.ce-report-printing .ce-report-print-root,
  body.ce-report-printing .ce-report-print-root * { visibility: visible !important; }
  body.ce-report-printing .ce-report-print-root {
    position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
    background: white !important;
  }
}`;
        document.head.appendChild(s);
    }, []);

    const print = () => {
        document.body.classList.add('ce-report-printing');
        const done = () => document.body.classList.remove('ce-report-printing');
        window.addEventListener('afterprint', done, { once: true });
        setTimeout(done, 2500);
        window.print();
    };

    const renderReadonlyField = (f) => {
        const val = responses ? responses[f.id] : undefined;
        const label = (
            <div className="mb-1.5 text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100" style={{ fontFamily: FONT.body }}>
                {f.label}
            </div>
        );

        if (f.type === 'checkboxGroup') {
            const opts = f.options || [];
            const on = opts.filter((opt) => val && val[opt.id]).map((opt) => opt.label);
            const display = on.length ? on.join(', ') : '—';
            return (
                <div key={f.id} className="mb-6 last:mb-0">
                    {label}
                    {f.hint ? <p className="mb-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.hint}</p> : null}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">{display}</p>
                </div>
            );
        }

        if (f.type === 'fileList') {
            const items = Array.isArray(val) ? val : [];
            return (
                <div key={f.id} className="mb-6 last:mb-0">
                    {label}
                    {f.hint ? <p className="mb-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.hint}</p> : null}
                    {items.length === 0 ? (
                        <p className="text-sm text-slate-500">—</p>
                    ) : (
                        <ul className="mt-2 flex list-none flex-wrap gap-4 p-0">
                            {items.map((it, i) => (
                                <li
                                    key={i}
                                    className="max-w-full rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-600 dark:bg-slate-800"
                                >
                                    {it?.dataUrl ? (
                                        <img
                                            src={it.dataUrl}
                                            alt={it.name || `Attachment ${i + 1}`}
                                            className="max-h-56 max-w-full rounded-lg object-contain sm:max-h-72"
                                        />
                                    ) : null}
                                    <p className="mt-1.5 text-center text-xs font-medium text-slate-600 dark:text-slate-300">
                                        {it?.name || `Image ${i + 1}`}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            );
        }

        const textDisplay =
            typeof val === 'string' ? val.trim() || '—' : val === undefined || val === null ? '—' : String(val);

        return (
            <div key={f.id} className="mb-6 last:mb-0">
                {label}
                {f.hint ? <p className="mb-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{f.hint}</p> : null}
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">{textDisplay}</p>
            </div>
        );
    };

    if (!formDef?.sections) {
        return <p className="text-sm text-slate-500">Form definition not loaded.</p>;
    }

    const docTitle = titleProp || formDef?.title || 'Questionnaire responses';

    return (
        <div className="ce-report-print-root text-slate-800 dark:text-slate-100" style={{ fontFamily: FONT.body }}>
            <div className="no-print mb-3 flex justify-end">
                <button
                    type="button"
                    onClick={print}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                    Print
                </button>
            </div>

            <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl dark:border-slate-700/90 dark:bg-slate-900 sm:rounded-3xl">
                <header className="relative">
                    <div className="relative h-36 overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 sm:h-40">
                        <div
                            className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(ellipse_100%_80%_at_20%_-10%,rgba(255,255,255,0.45),transparent_50%)]"
                            aria-hidden
                        />
                        <div
                            className="pointer-events-none absolute inset-0 opacity-35 bg-[radial-gradient(ellipse_80%_60%_at_100%_80%,rgba(56,189,248,0.45),transparent_45%)]"
                            aria-hidden
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" aria-hidden />
                        <div className="relative flex h-full flex-col justify-end px-6 pb-6 sm:px-10 sm:pb-8">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                                <div className="flex items-center gap-4">
                                    {letterhead.logoDataUrl ? (
                                        <div className="shrink-0 rounded-xl bg-white/95 p-2 shadow-lg dark:bg-white">
                                            <img
                                                src={letterhead.logoDataUrl}
                                                alt=""
                                                className="h-11 w-auto max-w-[140px] object-contain sm:h-12"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg font-bold text-white shadow-inner backdrop-blur"
                                            style={{ fontFamily: FONT.display }}
                                        >
                                            A
                                        </div>
                                    )}
                                    <div>
                                        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                                            Submitted questionnaire
                                        </p>
                                        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl" style={{ fontFamily: FONT.display }}>
                                            {companyName}
                                        </h1>
                                    </div>
                                </div>
                                {submittedAt ? (
                                    <p className="text-xs font-medium text-white/85">Received · {formatSubmittedAt(submittedAt)}</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="border-b border-slate-100 bg-white px-6 pb-6 pt-6 dark:border-slate-800 dark:bg-slate-900 sm:px-10 sm:pt-8">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            {(letterhead.addressLines || []).map((line, i) => (
                                <span key={i}>{line}</span>
                            ))}
                            {letterhead.phone ? <span>Tel · {letterhead.phone}</span> : null}
                            {letterhead.email ? <span>Email · {letterhead.email}</span> : null}
                            {letterhead.vatNumber ? <span>VAT · {letterhead.vatNumber}</span> : null}
                        </div>
                        <h2 className="mt-6 text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl" style={{ fontFamily: FONT.display }}>
                            {docTitle}
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                            This is how the response appears to your contact. Use Print for a clean copy for the file.
                        </p>
                    </div>
                </header>

                <div className="bg-slate-50/70 px-4 py-6 dark:bg-slate-950/40 sm:px-6 sm:py-8">
                    {sections.map((sec, si) => (
                        <div
                            key={sec.id}
                            className="mb-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-100/80 last:mb-0 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 dark:ring-slate-800"
                        >
                            <SectionBanner index={si} total={totalSteps} title={sec.heading} />
                            <div className="border-t border-slate-100 px-5 py-6 dark:border-slate-800 sm:px-8 sm:py-8">
                                <div className="mb-6 h-px w-12 rounded-full bg-gradient-to-r from-blue-600 to-transparent opacity-80" aria-hidden />
                                {sec.fields.map((f) => renderReadonlyField(f))}
                            </div>
                        </div>
                    ))}
                </div>
            </article>
        </div>
    );
}

try {
    window.CustomerEngagementReportView = CustomerEngagementReportView;
} catch (e) {
    console.error('CustomerEngagementReportView register failed', e);
}
