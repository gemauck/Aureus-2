let ReactHooks = {};
try {
    if (typeof window !== 'undefined' && window.React) {
        const R = window.React;
        ReactHooks = { useState: R.useState, useEffect: R.useEffect, useCallback: R.useCallback };
    }
} catch (e) {
    ReactHooks = {
        useState: () => [null, () => {}],
        useEffect: () => {},
        useCallback: (fn) => fn
    };
}
const { useState, useEffect, useCallback } = ReactHooks;

const formatAckDate = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getAuthHeaders = () => {
    const token = window.storage?.getToken?.();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
};

const policyHtml = (body) =>
    typeof window !== 'undefined' && typeof window.policyBodyToDisplayHtml === 'function'
        ? window.policyBodyToDisplayHtml(body)
        : '';

const HrPoliciesPanel = ({ isAdmin }) => {
    const [policies, setPolicies] = useState([]);
    /** @type {Array<{ policyId: string, policyVersion: number, acknowledgedAt: string }>} */
    const [myAcknowledgments, setMyAcknowledgments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ title: '', slug: '', category: 'general', body: '', status: 'draft' });
    const [agreeByPolicyId, setAgreeByPolicyId] = useState({});
    const [ackSubmittingId, setAckSubmittingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        const headers = getAuthHeaders();
        try {
            const [polRes, ackRes] = await Promise.all([
                fetch('/api/hr/policies', { headers }),
                fetch('/api/hr/policy-acknowledgments', { headers })
            ]);
            const polJson = await polRes.json().catch(() => ({}));
            const ackJson = await ackRes.json().catch(() => ({}));
            if (!polRes.ok) {
                setError(polJson?.error?.message || polJson?.message || 'Failed to load policies');
                setPolicies([]);
            } else {
                setPolicies(polJson?.data?.policies || polJson?.policies || []);
            }
            if (ackRes.ok) {
                const payload = ackJson.data ?? ackJson;
                const list = payload?.myAcknowledgments;
                setMyAcknowledgments(Array.isArray(list) ? list : []);
            } else {
                setMyAcknowledgments([]);
            }
        } catch (err) {
            setError(err.message || 'Failed to load');
            setPolicies([]);
            setMyAcknowledgments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const ackForPolicyVersion = useCallback(
        (policyId, version) =>
            myAcknowledgments.find((a) => a.policyId === policyId && Number(a.policyVersion) === Number(version)) ||
            null,
        [myAcknowledgments]
    );

    const acknowledgePolicy = async (policyId) => {
        try {
            const headers = getAuthHeaders();
            if (!headers.Authorization) {
                alert('You must be logged in.');
                return;
            }
            setAckSubmittingId(policyId);
            const res = await fetch('/api/hr/policy-acknowledgments', {
                method: 'POST',
                headers,
                body: JSON.stringify({ policyIds: [policyId] })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) {
                alert(j?.error?.message || j?.message || 'Could not record acknowledgment');
                return;
            }
            setAgreeByPolicyId((prev) => ({ ...prev, [policyId]: false }));
            await load();
        } catch (e) {
            alert(e.message || 'Request failed');
        } finally {
            setAckSubmittingId(null);
        }
    };

    useEffect(() => {
        load();
    }, [load]);

    const startCreate = () => {
        setEditing('new');
        setForm({ title: '', slug: '', category: 'general', body: '', status: 'draft' });
    };

    const startEdit = (p) => {
        setEditing(p.id);
        setForm({
            title: p.title || '',
            slug: p.slug || '',
            category: p.category || 'general',
            body: p.body || '',
            status: p.status || 'draft'
        });
    };

    const savePolicy = async () => {
        try {
            const headers = getAuthHeaders();
            if (!headers.Authorization) {
                alert('You must be logged in.');
                return;
            }
            if (editing === 'new') {
                const res = await fetch('/api/hr/policies', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(form)
                });
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    alert(j?.error?.message || j?.message || 'Save failed');
                    return;
                }
            } else if (editing) {
                const res = await fetch(`/api/hr/policies/${editing}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(form)
                });
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    alert(j?.error?.message || j?.message || 'Save failed');
                    return;
                }
            }
            setEditing(null);
            await load();
        } catch (e) {
            alert(e.message || 'Save failed');
        }
    };

    const deletePolicy = async (id) => {
        if (!confirm('Delete this policy?')) return;
        try {
            const res = await fetch(`/api/hr/policies/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error?.message || 'Delete failed');
                return;
            }
            await load();
            if (expandedId === id) setExpandedId(null);
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    };

    if (loading && policies.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500">
                <i className="fas fa-spinner fa-spin text-2xl mb-2" />
                <p>Loading policies…</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">HR policies</h3>
                    <p className="text-sm text-gray-500">
                        Open each published policy, read it, then acknowledge agreement on this page. Your acceptance is recorded per policy version.
                    </p>
                    {isAdmin && (
                        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2 max-w-xl">
                            Changing policy content bumps the version; staff must open the policy and acknowledge again. Report:{' '}
                            <code className="text-[11px]">GET /api/hr/policy-acknowledgments?report=1</code>
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={() => load()} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                        <i className="fas fa-sync-alt mr-1" /> Refresh
                    </button>
                    {isAdmin && (
                        <button type="button" onClick={startCreate} className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">
                            <i className="fas fa-plus mr-1" /> New policy
                        </button>
                    )}
                </div>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</div>}

            {editing && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
                    <h4 className="font-medium text-gray-900">{editing === 'new' ? 'New policy' : 'Edit policy'}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block text-sm">
                            <span className="text-gray-600">Title</span>
                            <input
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={form.title}
                                onChange={(e) => setForm({ ...form, title: e.target.value })}
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="text-gray-600">Slug (optional)</span>
                            <input
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={form.slug}
                                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                placeholder="auto from title"
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="text-gray-600">Category</span>
                            <input
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                            />
                        </label>
                        <label className="block text-sm">
                            <span className="text-gray-600">Status</span>
                            <select
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                                <option value="draft">Draft</option>
                                <option value="published">Published</option>
                            </select>
                        </label>
                    </div>
                    <label className="block text-sm">
                        <span className="text-gray-600">Content</span>
                        <textarea
                            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono min-h-[200px]"
                            value={form.body}
                            onChange={(e) => setForm({ ...form, body: e.target.value })}
                            placeholder="Plain text (blank line = new paragraph; auto headings/lists) or HTML"
                        />
                    </label>
                    <div className="flex gap-2">
                        <button type="button" onClick={savePolicy} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700">
                            Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white">
                {policies.length === 0 && !loading && <li className="p-6 text-center text-gray-500">No policies yet.</li>}
                {policies.map((p) => {
                    const ack = p.status === 'published' ? ackForPolicyVersion(p.id, p.version) : null;
                    const needsAck = p.status === 'published' && !ack;
                    return (
                    <li key={p.id} className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <button
                                type="button"
                                className="text-left flex-1 min-w-0"
                                onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                            >
                                <span className="font-medium text-gray-900">{p.title}</span>
                                <span
                                    className={`ml-2 text-xs px-2 py-0.5 rounded ${
                                        p.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                                    }`}
                                >
                                    {p.status}
                                </span>
                                {p.status === 'published' && (
                                    ack ? (
                                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-medium" title="You agreed to this version">
                                            <i className="fas fa-check-circle mr-1" aria-hidden />
                                            Acknowledged v{p.version}
                                            {ack.acknowledgedAt ? ` · ${formatAckDate(ack.acknowledgedAt)}` : ''}
                                        </span>
                                    ) : (
                                        <span className="ml-2 text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-medium">
                                            Action: open and acknowledge v{p.version}
                                        </span>
                                    )
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                    {p.category} · v{p.version}
                                    {p.updatedBy?.name ? ` · ${p.updatedBy.name}` : ''}
                                </p>
                            </button>
                            {isAdmin && (
                                <div className="flex gap-2 shrink-0">
                                    <button type="button" className="text-sm text-primary-600 hover:underline" onClick={() => startEdit(p)}>
                                        Edit
                                    </button>
                                    <button type="button" className="text-sm text-red-600 hover:underline" onClick={() => deletePolicy(p.id)}>
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                        {expandedId === p.id && p.body && (
                            <>
                            <div
                                className="policy-rendered-body mt-3 border-t border-gray-100 pt-4 prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-p:my-2 prose-p:leading-relaxed prose-ul:my-3 prose-li:my-0.5"
                                dangerouslySetInnerHTML={{ __html: policyHtml(p.body) }}
                            />
                            {needsAck && (
                                <div className="mt-4 border border-amber-200 bg-amber-50/80 rounded-lg p-4 space-y-3">
                                    <p className="text-sm font-medium text-amber-950">Record your agreement</p>
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                            checked={!!agreeByPolicyId[p.id]}
                                            onChange={(e) =>
                                                setAgreeByPolicyId((prev) => ({ ...prev, [p.id]: e.target.checked }))
                                            }
                                        />
                                        <span className="text-sm text-gray-800">
                                            I have read this policy (version {p.version}) and agree to comply.
                                        </span>
                                    </label>
                                    <button
                                        type="button"
                                        disabled={!agreeByPolicyId[p.id] || ackSubmittingId === p.id}
                                        onClick={() => acknowledgePolicy(p.id)}
                                        className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {ackSubmittingId === p.id ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin mr-2" />
                                                Saving…
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-signature mr-2" />
                                                Acknowledge and agree
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                            {p.status === 'published' && ack && (
                                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900">
                                    <i className="fas fa-check-circle mr-2" aria-hidden />
                                    You acknowledged and agreed to this policy on{' '}
                                    <strong>{formatAckDate(ack.acknowledgedAt) || 'recorded date'}</strong> (version {p.version}).
                                </div>
                            )}
                            </>
                        )}
                    </li>
                    );
                })}
            </ul>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.HrPoliciesPanel = HrPoliciesPanel;
}

export default HrPoliciesPanel;
