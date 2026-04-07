let ReactHooks = {};
try {
    if (typeof window !== 'undefined' && window.React) {
        const R = window.React;
        ReactHooks = { useState: R.useState, useCallback: R.useCallback };
    }
} catch (e) {
    ReactHooks = { useState: () => [null, () => {}], useCallback: (fn) => fn };
}
const { useState, useCallback } = ReactHooks;

const getAuthHeaders = () => {
    const token = window.storage?.getToken?.();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
};

/**
 * Blocks Leave & HR until the user accepts all published policies (website-style terms).
 * Props: pendingPolicies [{ id, title, body, version, … }], onComplete ()
 */
const HrPolicyAcceptanceModal = ({ pendingPolicies = [], onComplete }) => {
    const [agreed, setAgreed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const formatBody = useCallback((body) => {
        const fn = typeof window !== 'undefined' ? window.policyBodyToDisplayHtml : null;
        return typeof fn === 'function' ? fn(body || '') : '';
    }, []);

    const submit = useCallback(async () => {
        if (!agreed) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/hr/policy-acknowledgments', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ acceptAll: true })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(j?.error?.message || j?.message || 'Could not save your acceptance');
                return;
            }
            onComplete?.();
        } catch (e) {
            setError(e.message || 'Request failed');
        } finally {
            setSubmitting(false);
        }
    }, [agreed, onComplete]);

    if (!pendingPolicies.length) return null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hr-policy-gate-title"
        >
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">
                <div className="px-5 py-4 border-b border-gray-200 shrink-0">
                    <h2 id="hr-policy-gate-title" className="text-lg font-semibold text-gray-900">
                        Company policies — please review and accept
                    </h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Scroll through the documents below, then confirm you agree. This applies to the current published versions (like accepting terms on a website).
                    </p>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-8 bg-gray-50/80">
                    {pendingPolicies.map((p) => (
                        <section key={p.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                            <div className="flex flex-wrap items-baseline gap-2 mb-3">
                                <h3 className="text-base font-semibold text-gray-900">{p.title}</h3>
                                <span className="text-xs text-gray-500">v{p.version}</span>
                                {p.category ? (
                                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">{p.category}</span>
                                ) : null}
                            </div>
                            <div
                                className="policy-rendered-body prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-p:my-2 prose-ul:my-2 border-t border-gray-100 pt-3"
                                dangerouslySetInnerHTML={{ __html: formatBody(p.body) }}
                            />
                        </section>
                    ))}
                </div>

                <div className="px-5 py-4 border-t border-gray-200 bg-white shrink-0 space-y-3">
                    {error ? (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
                    ) : null}
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                        />
                        <span className="text-sm text-gray-800 leading-snug">
                            I have read, understood, and agree to comply with all of the policies shown above.
                        </span>
                    </label>
                    <button
                        type="button"
                        disabled={!agreed || submitting}
                        onClick={submit}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-2" />
                                Saving…
                            </>
                        ) : (
                            'Accept and continue'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.HrPolicyAcceptanceModal = HrPolicyAcceptanceModal;
}

export default HrPolicyAcceptanceModal;
