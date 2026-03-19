// Create/Edit Discussion or Notice - used by TeamDiscussions
const { useState, useEffect } = React;

const DiscussionModal = ({ isOpen, onClose, team, discussion, onSave, isDark, initialType = 'discussion' }) => {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [type, setType] = useState('discussion');
    const [pinned, setPinned] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (discussion) {
            setTitle(discussion.title || '');
            setBody(discussion.body || '');
            setType(discussion.type || 'discussion');
            setPinned(Boolean(discussion.pinned));
        } else {
            setTitle('');
            setBody('');
            setType(initialType || 'discussion');
            setPinned(false);
        }
        setError('');
    }, [discussion, isOpen, initialType]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!title.trim()) {
            setError('Title is required.');
            return;
        }
        const user = window.storage?.getUser?.() || {};
        const authorId = user.id || user.userId || '';
        const authorName = user.name || user.email || 'User';
        setSaving(true);
        try {
            await onSave({
                id: discussion?.id,
                teamId: team?.id,
                title: title.trim(),
                body: (body || '').trim(),
                type,
                pinned,
                authorId,
                authorName
            });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const bg = isDark ? 'bg-gray-900' : 'bg-white';
    const border = isDark ? 'border-gray-800' : 'border-gray-200';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const textMuted = isDark ? 'text-gray-400' : 'text-gray-600';
    const input = isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className={`modal-panel ${bg} rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border ${border} shadow-lg`}>
                <div className={`sticky top-0 ${bg} border-b ${border} px-4 py-3 flex items-center justify-between`}>
                    <h3 className={`text-lg font-semibold ${text}`}>
                        {discussion ? 'Edit Discussion' : type === 'notice' ? 'New Notice' : 'New Discussion'}
                    </h3>
                    <button type="button" onClick={onClose} className={`${textMuted} hover:opacity-80`} aria-label="Close">
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className={`p-3 rounded-lg text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
                            {error}
                        </div>
                    )}
                    <div>
                        <label className={`block text-sm font-medium ${textMuted} mb-1`}>Title *</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${input}`}
                            placeholder="Topic or notice title"
                        />
                    </div>
                    <div>
                        <label className={`block text-sm font-medium ${textMuted} mb-1`}>Body</label>
                        {typeof window.RichTextEditor === 'function' ? (
                            <window.RichTextEditor
                                value={body}
                                onChange={setBody}
                                placeholder="Details, description, or notice content"
                                rows={5}
                                isDark={isDark}
                                className="min-h-[120px]"
                            />
                        ) : (
                            <textarea
                                value={body}
                                onChange={(e) => setBody(e.target.value)}
                                rows={5}
                                className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${input}`}
                                placeholder="Details, description, or notice content"
                            />
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <div>
                            <label className={`block text-sm font-medium ${textMuted} mb-1`}>Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className={`px-3 py-2 text-sm border rounded-lg ${input}`}
                            >
                                <option value="discussion">Discussion</option>
                                <option value="notice">Notice</option>
                            </select>
                        </div>
                        <label className={`flex items-center gap-2 cursor-pointer ${textMuted}`}>
                            <input
                                type="checkbox"
                                checked={pinned}
                                onChange={(e) => setPinned(e.target.checked)}
                                className="rounded border-gray-300"
                            />
                            <span className="text-sm">Pin to top</span>
                        </label>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className={`px-4 py-2 text-sm rounded-lg ${textMuted} ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                            {saving ? 'Saving…' : discussion ? 'Update' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

window.DiscussionModal = DiscussionModal;
