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

const HrDocumentsPanel = ({ isAdmin, employees = [] }) => {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState({
        title: '',
        category: 'handbook',
        visibility: 'company',
        userId: ''
    });
    const [file, setFile] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/hr/documents', { headers: getAuthHeaders() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(json?.error?.message || json?.message || 'Failed to load documents');
                setDocuments([]);
            } else {
                setDocuments(json?.data?.documents || json?.documents || []);
            }
        } catch (err) {
            setError(err.message || 'Failed to load');
            setDocuments([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const upload = async () => {
        if (!file || !form.title.trim()) {
            alert('Choose a file and enter a title.');
            return;
        }
        if (form.visibility === 'employee' && !form.userId) {
            alert('Select an employee for employee-scoped documents.');
            return;
        }
        setUploading(true);
        try {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const dataUrl = reader.result;
                    const fileRes = await fetch('/api/files', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            folder: 'hr',
                            name: file.name,
                            dataUrl
                        })
                    });
                    const fileJson = await fileRes.json().catch(() => ({}));
                    if (!fileRes.ok) {
                        alert(fileJson?.error?.message || fileJson?.message || 'File upload failed');
                        setUploading(false);
                        return;
                    }
                    const url = fileJson?.data?.url || fileJson?.url;
                    if (!url) {
                        alert('Upload did not return a URL');
                        setUploading(false);
                        return;
                    }
                    const res = await fetch('/api/hr/documents', {
                        method: 'POST',
                        headers: getAuthHeaders(),
                        body: JSON.stringify({
                            title: form.title.trim(),
                            category: form.category,
                            fileUrl: url,
                            mimeType: file.type || null,
                            visibility: form.visibility,
                            userId: form.visibility === 'employee' ? form.userId : null
                        })
                    });
                    const j = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        alert(j?.error?.message || j?.message || 'Failed to save document');
                        setUploading(false);
                        return;
                    }
                    setFile(null);
                    setForm({ title: '', category: 'handbook', visibility: 'company', userId: '' });
                    await load();
                } catch (e) {
                    alert(e.message || 'Upload failed');
                } finally {
                    setUploading(false);
                }
            };
            reader.onerror = () => {
                setUploading(false);
                alert('Could not read file');
            };
            reader.readAsDataURL(file);
        } catch (e) {
            setUploading(false);
            alert(e.message || 'Upload failed');
        }
    };

    const remove = async (id) => {
        if (!confirm('Remove this document record?')) return;
        try {
            const res = await fetch(`/api/hr/documents/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
            if (!res.ok) {
                const j = await res.json().catch(() => ({}));
                alert(j?.error?.message || 'Delete failed');
                return;
            }
            await load();
        } catch (e) {
            alert(e.message || 'Delete failed');
        }
    };

    if (loading && documents.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500">
                <i className="fas fa-spinner fa-spin text-2xl mb-2" />
                <p>Loading documents…</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900">HR documents</h3>
                    <p className="text-sm text-gray-500">Company-wide files and documents assigned to specific employees.</p>
                </div>
                <button type="button" onClick={() => load()} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                    <i className="fas fa-sync-alt mr-1" /> Refresh
                </button>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{error}</div>}

            {isAdmin && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
                    <h4 className="font-medium text-gray-900">Upload document</h4>
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
                            <span className="text-gray-600">Category</span>
                            <select
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                            >
                                <option value="handbook">Handbook</option>
                                <option value="template">Template</option>
                                <option value="contract">Contract</option>
                                <option value="other">Other</option>
                            </select>
                        </label>
                        <label className="block text-sm">
                            <span className="text-gray-600">Visibility</span>
                            <select
                                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                value={form.visibility}
                                onChange={(e) => setForm({ ...form, visibility: e.target.value, userId: '' })}
                            >
                                <option value="company">Company-wide</option>
                                <option value="employee">Specific employee</option>
                            </select>
                        </label>
                        {form.visibility === 'employee' && (
                            <label className="block text-sm sm:col-span-2">
                                <span className="text-gray-600">Employee</span>
                                <select
                                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                                    value={form.userId}
                                    onChange={(e) => setForm({ ...form, userId: e.target.value })}
                                >
                                    <option value="">Select…</option>
                                    {employees.map((emp) => (
                                        <option key={emp.id} value={emp.id}>
                                            {emp.name || emp.email || emp.id}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <label className="block text-sm sm:col-span-2">
                            <span className="text-gray-600">File</span>
                            <input
                                type="file"
                                className="mt-1 w-full text-sm"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={upload}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
                    >
                        {uploading ? 'Uploading…' : 'Upload'}
                    </button>
                </div>
            )}

            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg bg-white">
                {documents.length === 0 && !loading && <li className="p-6 text-center text-gray-500">No documents.</li>}
                {documents.map((d) => (
                    <li key={d.id} className="p-4 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                            <a
                                href={d.fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary-600 hover:underline break-all"
                            >
                                {d.title}
                            </a>
                            <p className="text-xs text-gray-500 mt-1">
                                {d.category} · {d.visibility}
                                {d.user ? ` · ${d.user.name || d.user.email}` : ''}
                                {d.uploadedBy?.name ? ` · uploaded by ${d.uploadedBy.name}` : ''}
                            </p>
                        </div>
                        {isAdmin && (
                            <button type="button" className="text-sm text-red-600 hover:underline shrink-0" onClick={() => remove(d.id)}>
                                Remove
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.HrDocumentsPanel = HrDocumentsPanel;
}

export default HrDocumentsPanel;
