// My Notes Component - Personal notes with sharing, pin, tags, export
const { useState, useEffect, useRef, useCallback } = React;
const storage = window.storage;

// Toast: inline banner (no global dependency)
const Toast = ({ message, type = 'info', onDismiss, isDark }) => {
    useEffect(() => {
        const t = setTimeout(onDismiss, 4000);
        return () => clearTimeout(t);
    }, [onDismiss]);
    const bg = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : isDark ? 'bg-gray-700' : 'bg-gray-800';
    return (
        <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] ${bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-md`} role="alert">
            <span>{message}</span>
            <button onClick={onDismiss} className="p-1 hover:opacity-80" aria-label="Dismiss">×</button>
        </div>
    );
};

// Loading skeleton for list and editor
const NotesListSkeleton = ({ isDark, count = 6 }) => (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className={`p-4 animate-pulse ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className={`h-4 rounded w-3/4 mb-2 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                <div className={`h-3 rounded w-full mb-2 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                <div className={`h-3 rounded w-1/3 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
            </div>
        ))}
    </div>
);

const MyNotes = () => {
    const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
    const authHook = window.useAuth || (() => ({ user: null }));
    const { user } = authHook();
    const [notes, setNotes] = useState([]);
    const [filteredNotes, setFilteredNotes] = useState([]);
    const [selectedNote, setSelectedNote] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTagFilter, setSelectedTagFilter] = useState('');
    const [viewMode, setViewMode] = useState('list');
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareNoteId, setShareNoteId] = useState(null);
    const [users, setUsers] = useState([]);
    const [selectedUsersToShare, setSelectedUsersToShare] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSavedAt, setLastSavedAt] = useState(null);
    const [toast, setToast] = useState(null);
    const [clients, setClients] = useState([]);
    const [projects, setProjects] = useState([]);
    const [clientProjects, setClientProjects] = useState([]);
    const [expandedNoteActivityId, setExpandedNoteActivityId] = useState(null);
    const [noteActivityByNoteId, setNoteActivityByNoteId] = useState({});
    const [editorActivityPanelOpen, setEditorActivityPanelOpen] = useState(false);
    const [noteActivityForEditor, setNoteActivityForEditor] = useState([]);

    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
    }, []);

    const loadClients = useCallback(async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;
            const response = await fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                const list = Array.isArray(data?.data?.clients) ? data.data.clients : Array.isArray(data?.clients) ? data.clients : Array.isArray(data?.items) ? data.items : [];
                setClients(list);
            }
        } catch (e) { console.error('Error loading clients:', e); }
    }, []);

    const loadProjects = useCallback(async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) {
                setProjects([]);
                return;
            }
            const response = await fetch('/api/projects?limit=500', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                const list = Array.isArray(data?.data?.projects)
                    ? data.data.projects
                    : Array.isArray(data?.projects)
                        ? data.projects
                        : Array.isArray(data?.data)
                            ? data.data
                            : Array.isArray(data?.items)
                                ? data.items
                                : [];
                setProjects(list);
            } else {
                setProjects([]);
            }
        } catch (e) {
            console.error('Error loading projects:', e);
            setProjects([]);
        }
    }, []);

    const loadProjectsForClient = useCallback(async (clientId) => {
        if (!clientId || !storage?.getToken?.()) {
            setClientProjects([]);
            return;
        }
        try {
            const token = storage.getToken();
            const response = await fetch(`/api/projects?clientId=${encodeURIComponent(clientId)}&limit=500`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok) {
                const list = Array.isArray(data?.data?.projects)
                    ? data.data.projects
                    : Array.isArray(data?.projects)
                        ? data.projects
                        : Array.isArray(data?.data)
                            ? data.data
                            : Array.isArray(data?.items)
                                ? data.items
                                : [];
                setClientProjects(list);
            } else {
                setClientProjects([]);
            }
        } catch (e) {
            console.error('Error loading projects for client:', e);
            setClientProjects([]);
        }
    }, []);

    // Load notes, users, clients, projects
    useEffect(() => {
        loadNotes();
        loadUsers();
        loadClients();
        loadProjects();
    }, []);

    // Open a specific note when navigated from project Notes tab ("Open in My Notes to edit")
    useEffect(() => {
        if (!notes.length || !window.sessionStorage) return;
        const openNoteId = window.sessionStorage.getItem('myNotesOpenNoteId');
        if (!openNoteId) return;
        window.sessionStorage.removeItem('myNotesOpenNoteId');
        const note = notes.find(n => n.id === openNoteId);
        if (note) setSelectedNote(note);
    }, [notes]);

    // When selected note has a client, load that client's projects for the Project dropdown
    useEffect(() => {
        const cid = selectedNote?.clientId ?? selectedNote?.client?.id;
        if (cid) {
            loadProjectsForClient(cid);
        } else {
            setClientProjects([]);
        }
    }, [selectedNote?.id, selectedNote?.clientId, selectedNote?.client?.id, loadProjectsForClient]);

    /** Load activity for a single note (only when note is linked to a project). */
    const loadActivityForNote = useCallback(async (noteId, projectId) => {
        if (!projectId || !noteId) return [];
        try {
            const token = storage?.getToken?.();
            if (!token) return [];
            const url = `/api/project-activity-logs?projectId=${encodeURIComponent(projectId)}&noteId=${encodeURIComponent(noteId)}&limit=50`;
            const base = window.location.origin;
            const response = await fetch(`${base}${url}`, { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) return [];
            const data = await response.json();
            const logs = data?.data?.logs ?? data?.logs ?? (Array.isArray(data) ? data : []);
            return Array.isArray(logs) ? logs : [];
        } catch (err) {
            console.warn('Failed to load note activity:', err?.message);
            return [];
        }
    }, []);

    // Load editor note activity when selected note has projectId
    useEffect(() => {
        if (!selectedNote?.id || !selectedNote?.projectId || !loadActivityForNote) return;
        let cancelled = false;
        loadActivityForNote(selectedNote.id, selectedNote.projectId).then((logs) => {
            if (!cancelled) setNoteActivityForEditor(Array.isArray(logs) ? logs : []);
        });
        return () => { cancelled = true; };
    }, [selectedNote?.id, selectedNote?.projectId, loadActivityForNote]);

    // Filter notes: search + tag, sort pinned first then updatedAt
    useEffect(() => {
        let result = notes;
        const query = (searchQuery || '').trim().toLowerCase();
        if (query) {
            result = result.filter(note =>
                note.title?.toLowerCase().includes(query) ||
                note.content?.toLowerCase().includes(query) ||
                (note.tags && note.tags.some(tag => String(tag).toLowerCase().includes(query)))
            );
        }
        if (selectedTagFilter) {
            result = result.filter(note =>
                note.tags && note.tags.some(t => String(t).toLowerCase() === selectedTagFilter.toLowerCase())
            );
        }
        result = [...result].sort((a, b) => {
            const aP = Boolean(a.pinned);
            const bP = Boolean(b.pinned);
            if (aP !== bP) return aP ? -1 : 1;
            return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        });
        setFilteredNotes(result);
    }, [searchQuery, selectedTagFilter, notes]);

    // All unique tags from notes (for filter chips)
    const allTags = React.useMemo(() => {
        const set = new Set();
        notes.forEach(n => {
            (n.tags || []).forEach(t => set.add(String(t).trim()));
        });
        return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }, [notes]);

    const noteStats = React.useMemo(() => {
        const total = notes.length;
        const pinned = notes.filter((n) => Boolean(n.pinned)).length;
        const shared = notes.filter((n) => n.sharedWith && n.sharedWith.length > 0).length;
        const withTags = notes.filter((n) => n.tags && n.tags.length > 0).length;
        const linked = notes.filter((n) => n.clientId || n.projectId || n.client?.id || n.project?.id).length;
        return { total, pinned, shared, withTags, linked };
    }, [notes]);

    const loadNotes = useCallback(async (opts = {}) => {
        const { silent = false } = opts;
        try {
            if (!silent) setIsLoading(true);
            const token = storage?.getToken?.();
            if (!token) {
                setNotes([]);
                if (!silent) setIsLoading(false);
                return;
            }

            const response = await fetch('/api/user-notes', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const notesData = Array.isArray(data?.data?.notes)
                    ? data.data.notes
                    : Array.isArray(data?.notes)
                        ? data.notes
                        : [];

                const sorted = notesData.sort((a, b) => {
                    const aP = Boolean(a.pinned);
                    const bP = Boolean(b.pinned);
                    if (aP !== bP) return aP ? -1 : 1;
                    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
                });

                if (silent) {
                    setNotes(prev => {
                        const prevIds = (prev || []).map(n => n.id).join(',');
                        const nextIds = sorted.map(n => n.id).join(',');
                        if (prevIds === nextIds && prev.length === sorted.length) return prev;
                        return sorted;
                    });
                } else {
                    setNotes(sorted);
                }
            } else {
                if (!silent) {
                    console.error('Failed to load notes:', response.statusText);
                    setNotes([]);
                    showToast('Failed to load notes', 'error');
                }
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            if (!silent) {
                setNotes([]);
                showToast('Error loading notes', 'error');
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, [showToast]);

    const loadUsers = async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                const usersData = Array.isArray(data?.data?.users)
                    ? data.data.users
                    : Array.isArray(data?.users)
                        ? data.users
                        : [];
                // Filter out current user
                const otherUsers = usersData.filter(u => u.id !== user?.id && u.email !== user?.email);
                setUsers(otherUsers);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    const handleCreateNote = () => {
        const newNote = {
            id: `temp-${Date.now()}`,
            title: 'Untitled Note',
            content: '',
            tags: [],
            sharedWith: [],
            pinned: false,
            clientId: null,
            projectId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isNew: true
        };
        setNotes([newNote, ...notes]);
        setSelectedNote(newNote);
    };

    const handleTogglePin = async (note) => {
        if (!note.id || note.id.startsWith('temp-')) return;
        const newPinned = !Boolean(note.pinned);
        try {
            const token = storage?.getToken?.();
            if (!token) {
                showToast('Please log in to update notes', 'error');
                return;
            }
            const response = await fetch(`/api/user-notes/${note.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: note.title, content: note.content, tags: note.tags || [], pinned: newPinned, isPublic: Boolean(note.isPublic), clientId: note.clientId ?? null, projectId: note.projectId ?? null })
            });
            if (response.ok) {
                const data = await response.json();
                const updated = data?.data?.note || data?.note;
                setNotes(prev => prev.map(n => n.id === note.id ? { ...n, ...updated, pinned: newPinned } : n));
                if (selectedNote?.id === note.id) setSelectedNote(prev => prev ? { ...prev, pinned: newPinned } : null);
                showToast(newPinned ? 'Note pinned' : 'Note unpinned', 'success');
            } else {
                showToast('Failed to update note', 'error');
            }
        } catch (e) {
            showToast('Error updating note', 'error');
        }
    };

    const handleExportNote = (note) => {
        const title = (note.title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-');
        const content = `# ${note.title || 'Untitled Note'}\n\n${(note.content || '').replace(/\r/g, '')}\n\n---\nTags: ${(note.tags || []).join(', ')}`;
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Note exported', 'success');
    };

    const handleExportAll = () => {
        const lines = filteredNotes.map(n => `# ${n.title || 'Untitled'}\n\n${(n.content || '').replace(/\r/g, '')}\n\n---\n`);
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-notes-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('All notes exported', 'success');
    };

    const handleSaveNote = async (note) => {
        try {
            setIsSaving(true);
            const token = storage?.getToken?.();
            if (!token) {
                showToast('Please log in to save notes', 'error');
                return;
            }

            const noteData = {
                title: note.title || 'Untitled Note',
                content: note.content || '',
                tags: note.tags || [],
                pinned: Boolean(note.pinned),
                isPublic: Boolean(note.isPublic),
                clientId: note.clientId && String(note.clientId).trim() ? note.clientId : null,
                projectId: note.projectId && String(note.projectId).trim() ? note.projectId : null
            };

            let response;
            if (note.isNew || !note.id || note.id.startsWith('temp-')) {
                // Create new note
                response = await fetch('/api/user-notes', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(noteData)
                });
            } else {
                // Update existing note
                response = await fetch(`/api/user-notes/${note.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(noteData)
                });
            }

            if (response.ok) {
                const data = await response.json();
                const savedNote = data?.data?.note || data?.note || noteData;
                
                // Update notes list
                setNotes(prevNotes => {
                    const updated = prevNotes.map(n => 
                        n.id === note.id ? { ...savedNote, isNew: false } : n
                    );
                    // If it was a new note, replace it
                    if (note.isNew || note.id.startsWith('temp-')) {
                        return [savedNote, ...updated.filter(n => n.id !== note.id)];
                    }
                    return updated;
                });
                
                if (selectedNote?.id === note.id) {
                    setSelectedNote({ ...savedNote, isNew: false });
                }
                setLastSavedAt(Date.now());
                loadNotes({ silent: true });
                if (savedNote.projectId && (savedNote.id || note.id)) {
                    loadActivityForNote(savedNote.id || note.id, savedNote.projectId).then((logs) => setNoteActivityForEditor(Array.isArray(logs) ? logs : []));
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                showToast(`Failed to save: ${errorData.message || response.statusText}`, 'error');
            }
        } catch (error) {
            console.error('Error saving note:', error);
            showToast(error.message || 'Error saving note', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteNote = async (noteId) => {
        if (!confirm('Are you sure you want to delete this note?')) {
            return;
        }

        try {
            const token = storage?.getToken?.();
            if (!token) {
                showToast('Please log in to delete notes', 'error');
                return;
            }

            const response = await fetch(`/api/user-notes/${noteId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                setNotes(prevNotes => prevNotes.filter(n => n.id !== noteId));
                if (selectedNote?.id === noteId) {
                    setSelectedNote(null);
                }
                showToast('Note deleted', 'success');
            } else {
                showToast('Failed to delete note', 'error');
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            showToast(error.message || 'Error deleting note', 'error');
        }
    };

    const handleShareNote = (note) => {
        setShareNoteId(note.id);
        setSelectedUsersToShare(note.sharedWith?.map(s => s.userId || s.id) || []);
        setShowShareModal(true);
    };

    const handleToggleNoteActivity = useCallback((e, note) => {
        e.stopPropagation();
        e.preventDefault();
        if (expandedNoteActivityId === note.id) {
            setExpandedNoteActivityId(null);
            return;
        }
        setExpandedNoteActivityId(note.id);
        if (note.projectId && !noteActivityByNoteId[note.id]) {
            loadActivityForNote(note.id, note.projectId).then((logs) => {
                setNoteActivityByNoteId(prev => ({ ...prev, [note.id]: Array.isArray(logs) ? logs : [] }));
            });
        } else if (!note.projectId) {
            setNoteActivityByNoteId(prev => ({ ...prev, [note.id]: [] }));
        }
    }, [expandedNoteActivityId, noteActivityByNoteId, loadActivityForNote]);

    const handleSaveShare = async () => {
        try {
            const token = storage?.getToken?.();
            if (!token) return;

            const response = await fetch(`/api/user-notes/${shareNoteId}/share`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sharedWith: selectedUsersToShare
                })
            });

            if (response.ok) {
                const data = await response.json();
                const updatedNote = data?.data?.note || data?.note;
                
                // Update the note in the list
                setNotes(prevNotes => 
                    prevNotes.map(n => n.id === shareNoteId ? updatedNote : n)
                );
                
                if (selectedNote?.id === shareNoteId) {
                    setSelectedNote(updatedNote);
                }
                
                setShowShareModal(false);
                showToast('Sharing updated', 'success');
                loadNotes({ silent: true });
            } else {
                showToast('Failed to update sharing', 'error');
            }
        } catch (error) {
            console.error('Error sharing note:', error);
            showToast(error.message || 'Error sharing note', 'error');
        }
    };

    // Keyboard shortcuts: Ctrl/Cmd+S save, Ctrl/Cmd+N new note, Escape close share modal
    useEffect(() => {
        const onKeyDown = (e) => {
            if (showShareModal && e.key === 'Escape') {
                setShowShareModal(false);
                return;
            }
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 's') {
                    e.preventDefault();
                    if (selectedNote && !selectedNote.id?.startsWith('temp-')) {
                        handleSaveNote(selectedNote);
                    }
                } else if (e.key === 'n') {
                    e.preventDefault();
                    handleCreateNote();
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showShareModal, selectedNote]);

    const formatDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    if (isLoading) {
        return (
            <div className={isDark ? 'min-h-[calc(100vh-4rem)] bg-[#0c0f14]' : 'min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-slate-100'} aria-busy="true" aria-label="Loading notes">
                <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-pulse">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className={`rounded-2xl border p-6 h-40 ${isDark ? 'border-gray-700 bg-gray-900/50' : 'border-slate-200 bg-white'}`}>
                                <div className={`h-4 w-1/3 rounded mb-4 ${isDark ? 'bg-gray-700' : 'bg-slate-200'}`} />
                                <div className={`h-8 w-1/2 rounded ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`} />
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 flex gap-4">
                        <div className={`${isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-white border-slate-200'} rounded-2xl border shadow-sm w-full md:w-1/3 p-4`}>
                            <div className={`h-6 rounded w-24 mb-4 ${isDark ? 'bg-gray-700' : 'bg-slate-200'}`} />
                            <NotesListSkeleton isDark={isDark} count={6} />
                        </div>
                        <div className={`${isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-white border-slate-200'} rounded-2xl border shadow-sm flex-1 p-4 hidden md:block`}>
                            <div className={`h-8 rounded w-3/4 mb-4 ${isDark ? 'bg-gray-700' : 'bg-slate-200'}`} />
                            <div className={`h-64 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-slate-100'}`} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={isDark ? 'min-h-[calc(100vh-4rem)] bg-[#0c0f14]' : 'min-h-[calc(100vh-4rem)] bg-gradient-to-b from-slate-50 via-white to-slate-100'} role="main" aria-label="My Notes">
            {/* Hero — matches Task workspace */}
            <div className={`relative overflow-hidden border-b ${isDark ? 'border-gray-800 bg-gradient-to-br from-slate-900 via-[#111827] to-slate-900' : 'border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-violet-50/30'}`}>
                <div className="absolute inset-0 opacity-[0.07] pointer-events-none text-current" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }} />
                <div className="relative max-w-[1600px] mx-auto px-4 md:px-8 py-8 md:py-10">
                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-3 border bg-white/5 border-white/10 text-violet-200">
                                <i className="fas fa-book-open text-violet-300" />
                                Workspace
                            </div>
                            <h1 className={`text-3xl md:text-4xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Notes workspace</h1>
                            <p className={`mt-2 text-sm md:text-base max-w-xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                Capture ideas, organize with tags, share with your team, and link notes to clients & projects.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <div className={`text-xs px-3 py-1.5 rounded-lg border ${isDark ? 'border-violet-800/50 bg-violet-950/30 text-violet-300' : 'border-violet-200 bg-violet-50 text-violet-800'}`}>
                                    <i className="fas fa-keyboard mr-1.5" />
                                    ⌘/Ctrl+N new · ⌘/Ctrl+S save
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => loadNotes()}
                                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${isDark ? 'border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'}`}
                            >
                                <i className="fas fa-sync-alt" />
                                Refresh
                            </button>
                            {filteredNotes.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleExportAll}
                                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${isDark ? 'border-slate-600 bg-slate-800/80 text-slate-200 hover:bg-slate-700' : 'border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'}`}
                                >
                                    <i className="fas fa-download" />
                                    Export all
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleCreateNote}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-indigo-500/25 hover:from-violet-500 hover:to-indigo-500"
                            >
                                <i className="fas fa-plus" />
                                New note
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-4 md:px-8 py-6 space-y-6">
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {[
                        { key: 'total', label: 'Total', value: noteStats.total, icon: 'fa-sticky-note', grad: 'from-slate-500 to-slate-600' },
                        { key: 'pinned', label: 'Pinned', value: noteStats.pinned, icon: 'fa-thumbtack', grad: 'from-amber-500 to-orange-500' },
                        { key: 'shared', label: 'Shared', value: noteStats.shared, icon: 'fa-share-alt', grad: 'from-sky-500 to-blue-600' },
                        { key: 'tags', label: 'With tags', value: noteStats.withTags, icon: 'fa-tags', grad: 'from-emerald-500 to-teal-500' },
                        { key: 'linked', label: 'Linked', value: noteStats.linked, icon: 'fa-link', grad: 'from-fuchsia-500 to-purple-600' }
                    ].map((card) => (
                        <div key={card.key} className={`relative overflow-hidden rounded-2xl border p-4 ${isDark ? 'border-gray-700/80 bg-gray-900/60' : 'border-slate-200/90 bg-white shadow-sm'}`}>
                            <div className={`absolute -right-4 -top-4 h-16 w-16 rounded-full bg-gradient-to-br ${card.grad} opacity-20`} />
                            <div className="relative flex items-start justify-between gap-2">
                                <div>
                                    <p className={`text-[11px] font-semibold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>{card.label}</p>
                                    <p className={`text-2xl font-bold tabular-nums mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{card.value}</p>
                                </div>
                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${card.grad} text-white shadow-md`}>
                                    <i className={`fas ${card.icon} text-sm`} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Toolbar */}
                <div className={`rounded-2xl border shadow-sm p-4 md:p-5 ${isDark ? 'border-gray-700/80 bg-gray-900/40 backdrop-blur' : 'border-slate-200/90 bg-white/80 backdrop-blur'}`}>
                    <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="relative flex-1 min-w-0">
                            <i className={`fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isDark ? 'text-gray-500' : 'text-slate-400'}`} />
                            <input
                                type="search"
                                placeholder="Search titles, content, tags..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm ${isDark ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
                                aria-label="Search notes"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${viewMode === 'list' ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md' : isDark ? 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80'}`}
                                title="Split view with editor"
                            >
                                <i className="fas fa-columns" />
                                Split
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition ${viewMode === 'grid' ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md' : isDark ? 'bg-gray-800 text-gray-300 border border-gray-600 hover:bg-gray-700' : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200/80'}`}
                                title="Grid only — switch to Split to edit"
                            >
                                <i className="fas fa-th-large" />
                                Grid
                            </button>
                        </div>
                    </div>
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center mt-4 pt-4 border-t border-dashed border-gray-600/40">
                            <span className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-slate-500'}`}>Tags</span>
                            <button
                                type="button"
                                onClick={() => setSelectedTagFilter('')}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium ${!selectedTagFilter ? (isDark ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-900') : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}`}
                            >
                                All
                            </button>
                            {allTags.map((tag) => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? '' : tag)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-medium ${selectedTagFilter === tag ? (isDark ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-900') : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    {/* Notes List + optional right-hand activity panel */}
                    <section
                        className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm flex ${viewMode === 'list' ? 'w-full md:w-1/3 md:min-w-[280px] min-w-0' : 'w-full'} transition-all overflow-hidden`}
                        aria-label="Notes list"
                        style={viewMode === 'list' && expandedNoteActivityId ? { maxWidth: 'none', flex: '1 1 0' } : {}}
                    >
                        <div className="flex flex-col min-w-0 flex-1">
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {filteredNotes.length} Note{filteredNotes.length !== 1 ? 's' : ''}
                            </h2>
                        </div>
                        <div className={`overflow-y-auto flex-1 ${viewMode === 'list' ? 'max-h-[calc(100vh-320px)]' : ''}`}>
                            {filteredNotes.length === 0 ? (
                                <div className="p-8 text-center">
                                    <i className="fas fa-sticky-note text-4xl text-gray-400 mb-4" aria-hidden="true"></i>
                                    <p className={`mb-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        {searchQuery || selectedTagFilter ? 'No notes match your filters.' : 'No notes yet. Create your first note to get started.'}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleCreateNote}
                                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                                        aria-label="Create your first note"
                                    >
                                        <i className="fas fa-plus mr-2" aria-hidden="true"></i>
                                        Create your first note
                                    </button>
                                </div>
                            ) : viewMode === 'list' ? (
                                <ul className="divide-y divide-gray-200 dark:divide-gray-700" role="list">
                                    {filteredNotes.map(note => (
                                        <li key={note.id}>
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => setSelectedNote(note)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedNote(note); } }}
                                                className={`p-4 cursor-pointer transition-colors ${
                                                    selectedNote?.id === note.id
                                                        ? isDark ? 'bg-primary-900' : 'bg-primary-50'
                                                        : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-2 mb-2">
                                                    <h3 className={`font-medium truncate flex-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                        {note.title || 'Untitled Note'}
                                                    </h3>
                                                    <span className="flex items-center gap-1 shrink-0">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleToggleNoteActivity(e, note)}
                                                            className="text-primary-500 hover:text-primary-600 text-xs font-medium"
                                                            title="Activity"
                                                        >
                                                            <i className={`fas fa-history mr-1`} aria-hidden="true"></i>
                                                            {expandedNoteActivityId === note.id ? 'Hide' : 'Activity'}
                                                        </button>
                                                        {note.pinned && (
                                                            <i className="fas fa-thumbtack text-primary-500 text-xs" title="Pinned" aria-label="Pinned"></i>
                                                        )}
                                                        {note.sharedWith && note.sharedWith.length > 0 && (
                                                            <i className="fas fa-share-alt text-primary-500 text-xs" title={`Shared with ${note.sharedWith.length}`} aria-label="Shared"></i>
                                                        )}
                                                    </span>
                                                </div>
                                                <p className={`text-sm truncate mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    {note.content?.replace(/<[^>]*>/g, '').substring(0, 100) || 'No content'}
                                                </p>
                                                <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                                                        {formatDate(note.updatedAt || note.createdAt)}
                                                        {(note.client?.name || note.project?.name) && (
                                                            <span className="ml-1">
                                                                {[note.client?.name, note.project?.name].filter(Boolean).join(' · ')}
                                                            </span>
                                                        )}
                                                    </span>
                                                    {note.tags && note.tags.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap">
                                                            {note.tags.slice(0, 3).map((tag, idx) => (
                                                                <button
                                                                    key={idx}
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setSelectedTagFilter(selectedTagFilter === tag ? '' : tag); }}
                                                                    className={`px-2 py-0.5 rounded text-xs ${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                                                >
                                                                    {tag}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredNotes.map(note => (
                                        <div
                                            key={note.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedNote(note)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedNote(note); } }}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all shadow-sm ${
                                                selectedNote?.id === note.id
                                                    ? isDark ? 'bg-primary-900 border-primary-600 ring-2 ring-primary-500' : 'bg-primary-50 border-primary-500 ring-2 ring-primary-400'
                                                    : isDark ? 'bg-gray-700 border-gray-600 hover:border-gray-500 hover:shadow' : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-2">
                                                <h3 className={`font-medium truncate flex-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {note.title || 'Untitled Note'}
                                                </h3>
                                                <span className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleToggleNoteActivity(e, note); }}
                                                        className="text-primary-500 hover:text-primary-600 text-xs"
                                                        title="Activity"
                                                    >
                                                        <i className="fas fa-history" aria-hidden="true"></i>
                                                    </button>
                                                    {note.pinned && <i className="fas fa-thumbtack text-primary-500 text-xs" aria-label="Pinned"></i>}
                                                    {note.sharedWith && note.sharedWith.length > 0 && <i className="fas fa-share-alt text-primary-500 text-xs" aria-label="Shared"></i>}
                                                </span>
                                            </div>
                                            <p className={`text-sm line-clamp-3 mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {note.content?.replace(/<[^>]*>/g, '').substring(0, 150) || 'No content'}
                                            </p>
                                            <div className="flex items-center justify-between text-xs mt-2 flex-wrap gap-1">
                                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                                                    {formatDate(note.updatedAt || note.createdAt)}
                                                    {(note.client?.name || note.project?.name) && (
                                                        <span className="block mt-0.5">{(note.client?.name && note.project?.name) ? `${note.client.name} · ${note.project.name}` : (note.client?.name || note.project?.name)}</span>
                                                    )}
                                                </span>
                                                {note.tags && note.tags.length > 0 && (
                                                    <div className="flex gap-1 flex-wrap">
                                                        {note.tags.slice(0, 2).map((tag, idx) => (
                                                            <span key={idx} className={`px-2 py-0.5 rounded ${isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{tag}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        </div>
                        {/* Right-hand activity panel (Google Docs style) */}
                        {expandedNoteActivityId && (
                            <div className={`w-80 flex-shrink-0 border-l ${isDark ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'} flex flex-col max-h-[calc(100vh-320px)]`}>
                                <div className={`p-3 border-b ${isDark ? 'border-gray-600' : 'border-gray-200'} flex items-center justify-between`}>
                                    <h4 className={`text-sm font-semibold truncate ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                        {(() => {
                                            const note = filteredNotes.find((n) => n.id === expandedNoteActivityId);
                                            return note ? (note.title || 'Untitled') : 'Note activity';
                                        })()}
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setExpandedNoteActivityId(null); }}
                                        className={`p-1.5 rounded ${isDark ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-200'}`}
                                        aria-label="Close activity panel"
                                    >
                                        <i className="fas fa-times"></i>
                                    </button>
                                </div>
                                <div className="p-3 overflow-y-auto flex-1">
                                    {!filteredNotes.find((n) => n.id === expandedNoteActivityId)?.projectId ? (
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Link this note to a project to see activity here.</p>
                                    ) : noteActivityByNoteId[expandedNoteActivityId] === undefined ? (
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</p>
                                    ) : !noteActivityByNoteId[expandedNoteActivityId]?.length ? (
                                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No activity for this note yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {noteActivityByNoteId[expandedNoteActivityId].map((log) => {
                                                const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                                const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                                const changes = Array.isArray(meta.changes) ? meta.changes : [];
                                                return (
                                                    <div key={log.id} className={`border rounded-lg p-3 text-sm ${isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className={`px-1.5 py-0.5 rounded text-xs ${isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>{String(log.type || '').replace(/_/g, ' ')}</span>
                                                            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{log.userName || 'System'}</span>
                                                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{dateStr}</span>
                                                        </div>
                                                        {changes.length > 0 ? (
                                                            <ul className={`mt-2 list-disc list-inside space-y-0.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                                {changes.map((c, i) => (
                                                                    <li key={i}>{c}</li>
                                                                ))}
                                                            </ul>
                                                        ) : log.description ? (
                                                            <div className={`mt-1.5 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{log.description}</div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {filteredNotes.find((n) => n.id === expandedNoteActivityId)?.projectId && noteActivityByNoteId[expandedNoteActivityId] && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const note = filteredNotes.find((n) => n.id === expandedNoteActivityId);
                                                if (note?.projectId) loadActivityForNote(expandedNoteActivityId, note.projectId).then((logs) => setNoteActivityByNoteId(prev => ({ ...prev, [expandedNoteActivityId]: Array.isArray(logs) ? logs : [] })));
                                            }}
                                            className={`mt-3 px-2 py-1 text-xs rounded ${isDark ? 'text-primary-400 hover:bg-gray-600' : 'text-primary-600 hover:bg-primary-50'}`}
                                        >
                                            <i className="fas fa-sync-alt mr-1"></i> Refresh
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Note Editor */}
                    {viewMode === 'list' && (
                        <section
                            className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm flex-1 min-w-0 flex flex-col ${selectedNote ? 'block' : 'hidden md:block'}`}
                            aria-label="Note editor"
                        >
                            {selectedNote ? (
                                <>
                                    <div className={`flex items-center gap-2 p-3 border-b flex-shrink-0 ${isDark ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                                        <button
                                            type="button"
                                            onClick={() => setEditorActivityPanelOpen(prev => !prev)}
                                            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${editorActivityPanelOpen ? (isDark ? 'bg-primary-700 text-primary-200 border border-primary-500' : 'bg-primary-100 text-primary-800 border border-primary-300') : (isDark ? 'bg-gray-600 hover:bg-gray-500 text-gray-200 border border-gray-500' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50')}`}
                                        >
                                            <i className="fas fa-history"></i>
                                            Activity
                                            <i className={`fas fa-chevron-${editorActivityPanelOpen ? 'right' : 'left'} text-xs`}></i>
                                        </button>
                                    </div>
                                    <div className="flex flex-1 min-h-0">
                                        <div className="flex-1 min-w-0 overflow-hidden">
                                            {window.NoteEditor ? (
                                                React.createElement(window.NoteEditor, {
                                                    note: selectedNote,
                                                    allTags,
                                                    clients,
                                                    projects,
                                                    clientProjects,
                                                    onClientChange: loadProjectsForClient,
                                                    onSave: handleSaveNote,
                                                    onDelete: handleDeleteNote,
                                                    onShare: handleShareNote,
                                                    onTogglePin: handleTogglePin,
                                                    onExport: handleExportNote,
                                                    isSaving,
                                                    lastSavedAt,
                                                    isDark
                                                })
                                            ) : (
                                                <div className="p-8 text-center">
                                                    <i className="fas fa-spinner fa-spin text-2xl text-primary-500 mb-2" aria-hidden="true"></i>
                                                    <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading editor…</p>
                                                </div>
                                            )}
                                        </div>
                                        {editorActivityPanelOpen && (
                                            <div className={`w-80 flex-shrink-0 border-l flex flex-col ${isDark ? 'border-gray-600 bg-gray-700/50' : 'border-gray-200 bg-gray-50'}`}>
                                                <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                                    <h4 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Note activity</h4>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditorActivityPanelOpen(false)}
                                                        className={`p-1.5 rounded ${isDark ? 'text-gray-400 hover:bg-gray-600' : 'text-gray-500 hover:bg-gray-200'}`}
                                                        aria-label="Close activity panel"
                                                    >
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                                <div className="p-3 overflow-y-auto flex-1">
                                                    {!selectedNote.projectId ? (
                                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Link this note to a project to see activity here.</p>
                                                    ) : noteActivityForEditor.length === 0 ? (
                                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No activity recorded for this note yet.</p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {noteActivityForEditor.map((log) => {
                                                                const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                                                const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                                                const changes = Array.isArray(meta.changes) ? meta.changes : [];
                                                                return (
                                                                    <div key={log.id} className={`border rounded-lg p-3 text-xs ${isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'}`}>
                                                                        <div className="flex flex-wrap items-center gap-2">
                                                                            <span className={`px-1.5 py-0.5 rounded bg-gray-200 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{String(log.type || '').replace(/_/g, ' ')}</span>
                                                                            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>{log.userName || 'System'}</span>
                                                                            <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{dateStr}</span>
                                                                        </div>
                                                                        {changes.length > 0 ? (
                                                                            <ul className="mt-2 list-disc list-inside space-y-0.5 text-gray-600 dark:text-gray-400">
                                                                                {changes.map((c, i) => (
                                                                                    <li key={i}>{c}</li>
                                                                                ))}
                                                                            </ul>
                                                                        ) : log.description ? (
                                                                            <div className="mt-1.5 text-gray-600 dark:text-gray-400">{log.description}</div>
                                                                        ) : null}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => selectedNote?.projectId && loadActivityForNote(selectedNote.id, selectedNote.projectId).then(setNoteActivityForEditor)}
                                                        className={`mt-3 px-2 py-1 text-xs rounded ${isDark ? 'text-primary-400 hover:bg-gray-600' : 'text-primary-600 hover:bg-primary-50'}`}
                                                    >
                                                        <i className="fas fa-sync-alt mr-1"></i> Refresh
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="p-8 text-center flex-1 flex items-center justify-center flex-col">
                                    <i className="fas fa-sticky-note text-4xl text-gray-400 mb-4" aria-hidden="true"></i>
                                    <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                        Select a note to edit or create a new one
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleCreateNote}
                                        className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                        aria-label="Create new note"
                                    >
                                        New Note
                                    </button>
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {showShareModal && window.ShareModal && (
                React.createElement(window.ShareModal, {
                    noteId: shareNoteId,
                    users,
                    selectedUsers: selectedUsersToShare,
                    onSelectUsers: setSelectedUsersToShare,
                    onSave: handleSaveShare,
                    onClose: () => setShowShareModal(false),
                    isDark
                })
            )}

            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onDismiss={() => setToast(null)}
                    isDark={isDark}
                />
            )}
        </div>
    );
};

// NoteEditor and ShareModal are in shared NoteEditor.jsx (window.NoteEditor, window.ShareModal)


// Make available globally
window.MyNotes = MyNotes;

// Dispatch ready event for lazy loading
if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('myNotesComponentReady'));
}



















