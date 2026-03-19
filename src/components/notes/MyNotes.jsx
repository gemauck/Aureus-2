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
            <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen p-4`} aria-busy="true" aria-label="Loading notes">
                <div className="max-w-7xl mx-auto flex gap-4">
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm w-1/3 p-4`}>
                        <div className={`h-6 rounded w-24 mb-4 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                        <NotesListSkeleton isDark={isDark} count={6} />
                    </div>
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm flex-1 p-4`}>
                        <div className={`h-8 rounded w-3/4 mb-4 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                        <div className={`h-4 rounded w-full mb-2 ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                        <div className={`h-64 rounded ${isDark ? 'bg-gray-600' : 'bg-gray-200'}`} />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen p-4`} role="main" aria-label="My Notes">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <header className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm p-6 mb-4`}>
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                        <div>
                            <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                <i className="fas fa-sticky-note mr-2 text-primary-500" aria-hidden="true"></i>
                                My Notes
                            </h1>
                            <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                Personal notes — {notes.length} note{notes.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                type="button"
                                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                                className={`px-4 py-2 rounded-lg ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                                title={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                                aria-label={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                            >
                                <i className={`fas fa-${viewMode === 'list' ? 'th' : 'list'}`} aria-hidden="true"></i>
                            </button>
                            {filteredNotes.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleExportAll}
                                    className={`px-4 py-2 rounded-lg ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                                    aria-label="Export all notes"
                                >
                                    <i className="fas fa-download mr-2" aria-hidden="true"></i>
                                    Export all
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleCreateNote}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                                aria-label="Create new note"
                            >
                                <i className="fas fa-plus mr-2" aria-hidden="true"></i>
                                New Note
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative mb-3">
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" aria-hidden="true"></i>
                        <input
                            type="search"
                            placeholder="Search notes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                            aria-label="Search notes"
                        />
                    </div>

                    {/* Tag filter chips */}
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Filter by tag:</span>
                            <button
                                type="button"
                                onClick={() => setSelectedTagFilter('')}
                                className={`px-2 py-1 rounded text-sm ${!selectedTagFilter ? (isDark ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-800') : (isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200')}`}
                            >
                                All
                            </button>
                            {allTags.map(tag => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setSelectedTagFilter(selectedTagFilter === tag ? '' : tag)}
                                    className={`px-2 py-1 rounded text-sm ${selectedTagFilter === tag ? (isDark ? 'bg-primary-600 text-white' : 'bg-primary-100 text-primary-800') : (isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200')}`}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    )}
                </header>

                <div className="flex flex-col md:flex-row gap-4">
                    {/* Notes List */}
                    <section
                        className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm ${viewMode === 'list' ? 'w-full md:w-1/3 min-w-0' : 'w-full'} transition-all`}
                        aria-label="Notes list"
                    >
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {filteredNotes.length} Note{filteredNotes.length !== 1 ? 's' : ''}
                            </h2>
                        </div>
                        <div className={`overflow-y-auto ${viewMode === 'list' ? 'max-h-[calc(100vh-320px)]' : ''}`}>
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
                    </section>

                    {/* Note Editor */}
                    {viewMode === 'list' && (
                        <section
                            className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm flex-1 min-w-0 ${selectedNote ? 'block' : 'hidden md:block'}`}
                            aria-label="Note editor"
                        >
                            {selectedNote ? (
                                (window.NoteEditor ? (
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
                                ))
                            ) : (
                                <div className="p-8 text-center">
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



















