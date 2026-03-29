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

const getAuthHeaders = () => {
    const token = window.storage?.getToken?.();
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
};

const HrPoliciesPanel = ({ isAdmin }) => {
    const [policies, setPolicies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ title: '', slug: '', category: 'general', body: '', status: 'draft' });

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/hr/policies', { headers: getAuthHeaders() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error?.message || json?.message || 'Failed to load policies');
                setPolicies([]);
            } else {
                setPolicies(json?.data?.policies || json?.policies || []);
            }
        } catch (err) {
            setError(err.message || 'Failed to load');
            setPolicies([]);
        } finally {
            setLoading(false);
        }
    }, []);

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
                    <p className="text-sm text-gray-500">Published policies are visible to everyone with Leave & HR access.</p>
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
                            placeholder="Plain text or HTML"
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
                {policies.map((p) => (
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
                            <div className="mt-3 text-sm text-gray-700 border-t border-gray-100 pt-3 prose prose-sm max-w-none whitespace-pre-wrap">
                                {p.body}
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.HrPoliciesPanel = HrPoliciesPanel;
}

export default HrPoliciesPanel;
