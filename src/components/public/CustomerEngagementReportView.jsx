/**
 * Read-only report matching the public questionnaire layout (for CRM “View responses” + print).
 */
const { useEffect } = React;

const FONT = {
    display: "'Outfit', system-ui, sans-serif",
    body: "'DM Sans', system-ui, sans-serif"
};

function SectionBanner({ index, total, title }) {
    return (
        <div className="relative h-28 sm:h-32 overflow-hidden border-b border-slate-200 bg-white">
            <div className="relative flex h-full flex-col justify-end px-5 pb-4 sm:px-7 sm:pb-5">
                <p
                    className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:text-[11px]"
                    style={{ fontFamily: FONT.body }}
                >
                    Section {index + 1} of {total}
                </p>
                <h3 className="text-xl font-bold leading-tight text-slate-900 sm:text-2xl" style={{ fontFamily: FONT.display }}>
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
            <div className="mb-2 text-base font-semibold tracking-tight text-slate-800 dark:text-slate-100 sm:text-lg" style={{ fontFamily: FONT.body }}>
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
                    {f.hint ? <p className="mb-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{f.hint}</p> : null}
                    <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-800 dark:text-slate-200 sm:text-lg">{display}</p>
                </div>
            );
        }

        if (f.type === 'fileList') {
            const items = Array.isArray(val) ? val : [];
            return (
                <div key={f.id} className="mb-6 last:mb-0">
                    {label}
                    {f.hint ? <p className="mb-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{f.hint}</p> : null}
                    {items.length === 0 ? (
                        <p className="text-base text-slate-500">—</p>
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
                {f.hint ? <p className="mb-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{f.hint}</p> : null}
                <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-800 dark:text-slate-200 sm:text-lg">{textDisplay}</p>
            </div>
        );
    };

    if (!formDef?.sections) {
        return <p className="text-sm text-slate-500">Form definition not loaded.</p>;
    }

    const docTitle = titleProp || formDef?.title || 'Questionnaire responses';

    return (
        <div className="ce-report-print-root text-slate-800 dark:text-slate-100" style={{ fontFamily: FONT.body }}>
            <div className="no-print mb-4 flex justify-end">
                <button
                    type="button"
                    onClick={print}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                    Print
                </button>
            </div>

            <article className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl dark:border-slate-700/90 dark:bg-slate-900 sm:rounded-3xl">
                <header className="relative">
                    <div className="relative h-40 overflow-hidden border-b border-slate-200 bg-white sm:h-44">
                        <div className="relative flex h-full flex-col justify-end px-6 pb-6 sm:px-12 sm:pb-9">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                                <div className="flex items-center gap-4">
                                    {letterhead.logoDataUrl ? (
                                        <div className="shrink-0 rounded-xl bg-white p-2.5 shadow-lg ring-1 ring-white/80 dark:bg-white">
                                            <img
                                                src={letterhead.logoDataUrl}
                                                alt=""
                                                className="h-11 w-auto max-w-[150px] object-contain sm:h-12"
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-900 shadow-inner"
                                            style={{ fontFamily: FONT.display }}
                                        >
                                            A
                                        </div>
                                    )}
                                    <div>
                                        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                                            Submitted questionnaire
                                        </p>
                                        <h1
                                            className="inline-block rounded-md bg-white/95 px-2.5 py-0.5 text-3xl font-bold tracking-tight text-slate-900 shadow-sm sm:text-4xl"
                                            style={{ fontFamily: FONT.display }}
                                        >
                                            {companyName}
                                        </h1>
                                    </div>
                                </div>
                                {submittedAt ? (
                                    <p className="text-xs font-medium text-slate-700">Received · {formatSubmittedAt(submittedAt)}</p>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="border-b border-slate-100 bg-white px-6 pb-6 pt-6 dark:border-slate-800 dark:bg-slate-900 sm:px-12 sm:pb-8 sm:pt-9">
                        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                            {(letterhead.addressLines || []).map((line, i) => (
                                <span key={i}>{line}</span>
                            ))}
                            {letterhead.phone ? <span>Tel · {letterhead.phone}</span> : null}
                            {letterhead.email ? <span>Email · {letterhead.email}</span> : null}
                            {letterhead.vatNumber ? <span>VAT · {letterhead.vatNumber}</span> : null}
                        </div>
                        <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl" style={{ fontFamily: FONT.display }}>
                            {docTitle}
                        </h2>
                        <p className="mt-3 max-w-4xl text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">
                            This is how the response appears to your contact. Use Print for a clean copy for the file.
                        </p>
                    </div>
                </header>

                <div className="bg-slate-50/70 px-5 py-8 dark:bg-slate-950/40 sm:px-10 sm:py-10">
                    {sections.map((sec, si) => (
                        <div
                            key={sec.id}
                            className="mb-8 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md ring-1 ring-slate-100/80 last:mb-0 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40 dark:ring-slate-800"
                        >
                            <SectionBanner index={si} total={totalSteps} title={sec.heading} />
                            <div className="border-t border-slate-100 px-6 py-8 dark:border-slate-800 sm:px-10 sm:py-10">
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
