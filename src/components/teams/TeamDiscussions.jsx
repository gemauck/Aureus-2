// Team Discussions - list and detail with replies (rich text + attachments)
const { useState, useEffect, useCallback, useRef } = React;

const TeamDiscussions = ({ team, isDark, searchTerm = '', initialDiscussionId }) => {
    const [discussions, setDiscussions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const hasAppliedInitialRef = useRef(false);
    const [detail, setDetail] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [editingDiscussion, setEditingDiscussion] = useState(null);
    const [replyBody, setReplyBody] = useState('');
    const [replySubmitting, setReplySubmitting] = useState(false);
    const [replyAttachments, setReplyAttachments] = useState([]);
    const replyFileInputRef = useRef(null);
    const [modalInitialType, setModalInitialType] = useState('discussion');
    const ds = window.dataService;

    // @mention picker: users list and suggestion state
    const [mentionUsers, setMentionUsers] = useState([]);
    const [mentionOpen, setMentionOpen] = useState(false);
    const [mentionStart, setMentionStart] = useState(null);
    const [mentionSuggestions, setMentionSuggestions] = useState([]);
    const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
    const replyInputRef = useRef(null);

    const loadDiscussions = useCallback(async () => {
        if (!team?.id || !ds?.getTeamDiscussions) return;
        setLoading(true);
        try {
            const list = await ds.getTeamDiscussions(team.id);
            setDiscussions(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error('TeamDiscussions load:', e);
            setDiscussions([]);
        } finally {
            setLoading(false);
        }
    }, [team?.id]);

    useEffect(() => {
        loadDiscussions();
    }, [loadDiscussions]);

    const loadDetail = useCallback(async (id) => {
        if (!id || !ds?.getDiscussion) return;
        setDetailLoading(true);
        setDetail(null);
        setDetailError(null);
        try {
            const d = await ds.getDiscussion(id);
            setDetail(d);
            if (d == null) setDetailError('Discussion not found or empty.');
        } catch (e) {
            console.error('TeamDiscussions detail:', e);
            setDetail(null);
            setDetailError(e?.message || 'Could not load discussion.');
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selected) loadDetail(selected);
        else { setDetail(null); setDetailError(null); }
    }, [selected, loadDetail]);

    // Open discussion from notification link (e.g. ?discussion=id)
    useEffect(() => {
        if (!team?.id || !initialDiscussionId || hasAppliedInitialRef.current) return;
        hasAppliedInitialRef.current = true;
        setSelected(initialDiscussionId);
    }, [team?.id, initialDiscussionId]);

    const filteredList = React.useMemo(() => {
        if (!searchTerm.trim()) return discussions;
        const q = searchTerm.toLowerCase();
        return discussions.filter(d =>
            (d.title || '').toLowerCase().includes(q) ||
            (d.body || '').toLowerCase().includes(q) ||
            (d.authorName || '').toLowerCase().includes(q)
        );
    }, [discussions, searchTerm]);

    // Load users for @mention picker when reply area is relevant
    useEffect(() => {
        if (!selected || !team?.id) return;
        let cancelled = false;
        const load = async () => {
            try {
                const token = window.storage?.getToken?.() || localStorage.getItem('auth_token');
                if (!token) return;
                const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const users = data.data?.users || data.users || [];
                if (!cancelled) setMentionUsers(Array.isArray(users) ? users : []);
            } catch (e) {
                if (!cancelled) setMentionUsers([]);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [selected, team?.id]);

    const handleReplyChange = (e) => {
        const value = e.target.value;
        const cursorPos = e.target.selectionStart ?? value.length;
        setReplyBody(value);
        const textBefore = value.substring(0, cursorPos);
        const match = textBefore.match(/@([\w.\s'-]*)$/);
        if (match) {
            const query = (match[1] || '').toLowerCase().trim();
            const filtered = mentionUsers.filter(u => {
                const name = (u.name || '').toLowerCase();
                const email = (u.email || '').toLowerCase();
                return name.includes(query) || email.includes(query) || (u.name || u.email || '').toLowerCase().includes(query);
            });
            setMentionStart(match.index);
            setMentionSuggestions(filtered);
            setMentionOpen(filtered.length > 0);
            setMentionSelectedIndex(0);
        } else {
            setMentionOpen(false);
        }
    };
    const insertMention = (user) => {
        const name = user.name || user.email || 'User';
        const current = replyBody || '';
        const start = mentionStart ?? 0;
        const afterMatch = current.slice(start).match(/@[\w.\s'-]*/);
        const end = afterMatch ? start + afterMatch[0].length : start + 1;
        const before = current.slice(0, start);
        const after = current.slice(end);
        const next = before + `@${name} ` + after;
        setReplyBody(next);
        setMentionOpen(false);
        setMentionSuggestions([]);
        setTimeout(() => {
            replyInputRef.current?.focus();
            const pos = start + name.length + 2;
            replyInputRef.current?.setSelectionRange(pos, pos);
        }, 0);
    };
    const handleReplyKeyDown = (e) => {
        if (mentionOpen && mentionSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setMentionSelectedIndex(i => (i < mentionSuggestions.length - 1 ? i + 1 : i));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setMentionSelectedIndex(i => (i > 0 ? i - 1 : 0));
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(mentionSuggestions[mentionSelectedIndex]);
            } else if (e.key === 'Escape') {
                setMentionOpen(false);
            }
        }
    };

    const handleSaveDiscussion = async (payload) => {
        if (!ds) return;
        if (payload.id) {
            await ds.updateDiscussion(payload.id, {
                title: payload.title,
                body: payload.body,
                type: payload.type,
                pinned: payload.pinned
            });
        } else {
            await ds.createDiscussion({
                teamId: payload.teamId,
                title: payload.title,
                body: payload.body,
                type: payload.type,
                pinned: payload.pinned,
                authorId: payload.authorId,
                authorName: payload.authorName
            });
        }
        setShowModal(false);
        setEditingDiscussion(null);
        await loadDiscussions();
        if (selected && detail?.id === payload.id) loadDetail(payload.id);
    };

    const handleDeleteDiscussion = async (id) => {
        if (!ds?.deleteDiscussion || !window.confirm('Delete this discussion? All replies will be removed.')) return;
        try {
            await ds.deleteDiscussion(id);
            if (selected === id) setSelected(null);
            await loadDiscussions();
        } catch (e) {
            window.alert(e.message || 'Delete failed');
        }
    };

    const uploadReplyFiles = async (files) => {
        if (!files?.length) return [];
        const folder = 'discussion-replies';
        const token = window.storage?.getToken?.();
        const results = [];
        for (const file of files) {
            const dataUrl = await new Promise((resolve, reject) => {
                const r = new FileReader();
                r.onload = () => resolve(r.result);
                r.onerror = reject;
                r.readAsDataURL(file);
            });
            const res = await fetch('/api/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ name: file.name, dataUrl, folder })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error?.message || err.message || 'Upload failed');
            }
            const data = await res.json();
            const url = data.data?.url ?? data.url;
            if (url) results.push({ name: file.name, url });
        }
        return results;
    };

    const handleReplyFileSelect = useCallback(async (e) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (!files.length) return;
        setReplySubmitting(true);
        try {
            const uploaded = await uploadReplyFiles(files);
            setReplyAttachments(prev => [...prev, ...uploaded]);
        } catch (err) {
            window.alert(err.message || 'Upload failed');
        } finally {
            setReplySubmitting(false);
            if (replyFileInputRef.current) replyFileInputRef.current.value = '';
        }
    }, []);

    const handleAddReply = async () => {
        const bodyTrim = (replyBody || '').trim();
        if (!selected || (!bodyTrim && replyAttachments.length === 0) || !ds?.addDiscussionReply) return;
        const user = window.storage?.getUser?.() || {};
        setReplySubmitting(true);
        try {
            await ds.addDiscussionReply(
                selected,
                (replyBody || '').trim(),
                user.id || user.userId || '',
                user.name || user.email || 'User',
                replyAttachments
            );
            setReplyBody('');
            setReplyAttachments([]);
            await loadDetail(selected);
        } catch (e) {
            window.alert(e.message || 'Failed to add reply');
        } finally {
            setReplySubmitting(false);
        }
    };

    const bg = isDark ? 'bg-gray-900' : 'bg-white';
    const border = isDark ? 'border-gray-800' : 'border-gray-200';
    const text = isDark ? 'text-gray-100' : 'text-gray-900';
    const textMuted = isDark ? 'text-gray-400' : 'text-gray-600';
    const input = isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-300 text-gray-900';

    if (loading) {
        return (
            <div className={`flex items-center justify-center py-12 ${textMuted}`}>
                <span className="animate-spin mr-2 inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full"></span>
                Loading discussions…
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className={`text-sm font-semibold ${text}`}>Discussions</h3>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => { setEditingDiscussion(null); setModalInitialType('discussion'); setShowModal(true); }}
                        className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                        <i className="fas fa-plus mr-1.5"></i> New discussion
                    </button>
                    <button
                        type="button"
                        onClick={() => { setEditingDiscussion(null); setModalInitialType('notice'); setShowModal(true); }}
                        className="px-3 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700"
                    >
                        <i className="fas fa-bullhorn mr-1.5"></i> New notice
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* List */}
                <div className={`${bg} border ${border} rounded-xl overflow-hidden ${selected ? 'lg:col-span-1' : ''}`}>
                    <ul className="divide-y divide-gray-200 dark:divide-gray-800 max-h-[60vh] overflow-y-auto">
                        {filteredList.length === 0 ? (
                            <li className={`p-4 ${textMuted} text-sm`}>No discussions yet. Create one above.</li>
                        ) : (
                            filteredList.map(d => (
                                <li key={d.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(d.id)}
                                        className={`w-full text-left p-4 hover:opacity-90 ${selected === d.id ? (isDark ? 'bg-gray-800' : 'bg-gray-50') : ''}`}
                                    >
                                        <div className="flex items-start gap-2">
                                            {d.pinned && <i className="fas fa-thumbtack text-amber-500 mt-0.5" title="Pinned"></i>}
                                            <span className={`px-2 py-0.5 text-xs rounded ${d.type === 'notice' ? (isDark ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700') : (isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>
                                                {d.type === 'notice' ? 'Notice' : 'Discussion'}
                                            </span>
                                        </div>
                                        <p className={`font-medium text-sm mt-1 ${text} truncate`}>{d.title}</p>
                                        <p className={`text-xs mt-0.5 ${textMuted}`}>
                                            {d.authorName || 'Unknown'} · {d.createdAt ? new Date(d.createdAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' }) : ''}
                                            {d._count && (d._count.replies > 0) && (
                                                <span> · {d._count.replies || 0} replies</span>
                                            )}
                                        </p>
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                </div>

                {/* Detail */}
                <div className={`lg:col-span-2 ${bg} border ${border} rounded-xl overflow-hidden`}>
                    {!selected ? (
                        <div className={`p-8 text-center ${textMuted} text-sm`}>Select a discussion or create one.</div>
                    ) : detailLoading ? (
                        <div className={`flex items-center justify-center py-12 ${textMuted}`}>
                            <span className="animate-spin mr-2 inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full"></span>
                            Loading…
                        </div>
                    ) : !detail ? (
                        <div className={`p-8 text-center ${textMuted} text-sm`}>
                            {detailError || 'Could not load discussion.'}
                        </div>
                    ) : (
                        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className={`text-lg font-semibold ${text}`}>{detail.title}</h4>
                                        {detail.pinned && <i className="fas fa-thumbtack text-amber-500" title="Pinned"></i>}
                                        <span className={`px-2 py-0.5 text-xs rounded ${detail.type === 'notice' ? (isDark ? 'bg-orange-900/50 text-orange-300' : 'bg-orange-100 text-orange-700') : (isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600')}`}>
                                            {detail.type === 'notice' ? 'Notice' : 'Discussion'}
                                        </span>
                                    </div>
                                    <p className={`text-sm mt-1 ${textMuted}`}>{detail.authorName} · {detail.createdAt ? new Date(detail.createdAt).toLocaleString('en-ZA') : ''}</p>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => { setEditingDiscussion(detail); setShowModal(true); }} className={`p-2 rounded-lg ${textMuted} hover:bg-gray-800`} title="Edit"><i className="fas fa-edit"></i></button>
                                    <button type="button" onClick={() => handleDeleteDiscussion(detail.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-900/20" title="Delete"><i className="fas fa-trash"></i></button>
                                </div>
                            </div>
                            {detail.body && (
                                <div className={`text-sm ${text} prose prose-sm max-w-none dark:prose-invert ${isDark ? 'prose-p:text-gray-200' : ''}`} dangerouslySetInnerHTML={{ __html: detail.body }} />
                            )}

                            {/* Replies */}
                            <section>
                                <h5 className={`text-sm font-semibold ${text} mb-2`}>Replies</h5>
                                <div className="space-y-3">
                                    {(detail.replies || []).map(r => (
                                        <div key={r.id} className={`pl-3 border-l-2 ${isDark ? 'border-gray-700' : 'border-gray-200'} py-1`}>
                                            <p className={`text-xs ${textMuted}`}>{r.authorName} · {r.createdAt ? new Date(r.createdAt).toLocaleString('en-ZA') : ''}</p>
                                            <div className={`text-sm ${text} prose prose-sm max-w-none dark:prose-invert ${isDark ? 'prose-p:text-gray-200' : ''}`}>
                                                {(r.body || '').includes('<') && (r.body || '').includes('>')
                                                    ? <div dangerouslySetInnerHTML={{ __html: r.body || '' }} />
                                                    : <div className="whitespace-pre-wrap break-words">{(r.body || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</div>
                                                }
                                            </div>
                                            {(r.attachments || []).length > 0 && (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {(r.attachments || []).map((att, idx) => (
                                                        <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-800 text-blue-300 hover:underline' : 'bg-gray-100 text-blue-600 hover:underline'}`}>
                                                            <i className="fas fa-paperclip mr-1"></i>{att.name || 'Attachment'}
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 space-y-2">
                                    <div className="relative">
                                        <textarea
                                            ref={replyInputRef}
                                            value={replyBody}
                                            onChange={handleReplyChange}
                                            onKeyDown={handleReplyKeyDown}
                                            placeholder="Write a reply… (type @ to mention someone)"
                                            rows={3}
                                            className={`w-full px-3 py-2 text-sm border rounded-lg ${input}`}
                                        />
                                        {mentionOpen && mentionSuggestions.length > 0 && (
                                            <ul
                                                className={`absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border shadow-lg ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                                                style={{ bottom: '100%' }}
                                            >
                                                {mentionSuggestions.map((user, idx) => (
                                                    <li key={user.id}>
                                                        <button
                                                            type="button"
                                                            onClick={() => insertMention(user)}
                                                            className={`w-full text-left px-3 py-2 flex items-center gap-2 ${idx === mentionSelectedIndex ? (isDark ? 'bg-gray-700' : 'bg-gray-100') : ''} ${isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-900'}`}
                                                        >
                                                            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ${isDark ? 'bg-gray-600 text-gray-200' : 'bg-gray-200 text-gray-700'}`}>
                                                                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                                                            </span>
                                                            <span className="truncate">{user.name || user.email}</span>
                                                            {user.email && user.name && <span className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{user.email}</span>}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    <p className={`text-xs ${textMuted}`}>Type @ to search and select a person to mention.</p>
                                    {replyAttachments.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {replyAttachments.map((att, idx) => (
                                                <span key={idx} className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                                                    {att.name}
                                                    <button type="button" onClick={() => setReplyAttachments(prev => prev.filter((_, i) => i !== idx))} className="opacity-70 hover:opacity-100" aria-label="Remove">×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input type="file" ref={replyFileInputRef} onChange={handleReplyFileSelect} multiple className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,.gif" />
                                        <button type="button" onClick={() => replyFileInputRef.current?.click()} disabled={replySubmitting} className={`px-3 py-2 text-sm rounded-lg ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} disabled:opacity-50`}>
                                            <i className="fas fa-paperclip mr-1"></i> Attach files
                                        </button>
                                        <button type="button" onClick={handleAddReply} disabled={replySubmitting || (!(replyBody || '').trim() && replyAttachments.length === 0)} className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                            {replySubmitting ? '…' : 'Reply'}
                                        </button>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )}
                </div>
            </div>

            {showModal && team && (
                <DiscussionModal
                    isOpen={showModal}
                    onClose={() => { setShowModal(false); setEditingDiscussion(null); }}
                    team={team}
                    discussion={editingDiscussion}
                    onSave={handleSaveDiscussion}
                    isDark={isDark}
                    initialType={modalInitialType}
                />
            )}
        </div>
    );
};

window.TeamDiscussions = TeamDiscussions;
