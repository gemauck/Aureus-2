// My Notes Component - Personal notes with sharing functionality
const { useState, useEffect, useRef } = React;
const storage = window.storage;

const MyNotes = () => {
    const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
    const authHook = window.useAuth || (() => ({ user: null }));
    const { user } = authHook();
    const [notes, setNotes] = useState([]);
    const [filteredNotes, setFilteredNotes] = useState([]);
    const [selectedNote, setSelectedNote] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [showShareModal, setShowShareModal] = useState(false);
    const [shareNoteId, setShareNoteId] = useState(null);
    const [sharedWith, setSharedWith] = useState([]);
    const [users, setUsers] = useState([]);
    const [selectedUsersToShare, setSelectedUsersToShare] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const editorRef = useRef(null);

    // Load notes
    useEffect(() => {
        loadNotes();
        loadUsers();
    }, []);

    // Filter notes based on search
    useEffect(() => {
        if (!searchQuery.trim()) {
            setFilteredNotes(notes);
            return;
        }
        
        const query = searchQuery.toLowerCase();
        const filtered = notes.filter(note => 
            note.title?.toLowerCase().includes(query) ||
            note.content?.toLowerCase().includes(query) ||
            note.tags?.some(tag => tag.toLowerCase().includes(query))
        );
        setFilteredNotes(filtered);
    }, [searchQuery, notes]);

    const loadNotes = async () => {
        try {
            setIsLoading(true);
            const token = storage?.getToken?.();
            if (!token) {
                setNotes([]);
                setIsLoading(false);
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
                
                // Sort by updatedAt (most recent first)
                const sorted = notesData.sort((a, b) => 
                    new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
                );
                setNotes(sorted);
            } else {
                console.error('Failed to load notes:', response.statusText);
                setNotes([]);
            }
        } catch (error) {
            console.error('Error loading notes:', error);
            setNotes([]);
        } finally {
            setIsLoading(false);
        }
    };

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
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isNew: true
        };
        setNotes([newNote, ...notes]);
        setSelectedNote(newNote);
    };

    const handleSaveNote = async (note) => {
        try {
            setIsSaving(true);
            const token = storage?.getToken?.();
            if (!token) {
                alert('Please log in to save notes');
                return;
            }

            const noteData = {
                title: note.title || 'Untitled Note',
                content: note.content || '',
                tags: note.tags || []
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
                
                // Reload to get fresh data
                await loadNotes();
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(`Failed to save note: ${errorData.message || response.statusText}`);
            }
        } catch (error) {
            console.error('Error saving note:', error);
            alert(`Error saving note: ${error.message}`);
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
                alert('Please log in to delete notes');
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
            } else {
                alert('Failed to delete note');
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            alert(`Error deleting note: ${error.message}`);
        }
    };

    const handleShareNote = (note) => {
        setShareNoteId(note.id);
        setSharedWith(note.sharedWith || []);
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
                await loadNotes();
            } else {
                alert('Failed to update sharing settings');
            }
        } catch (error) {
            console.error('Error sharing note:', error);
            alert(`Error sharing note: ${error.message}`);
        }
    };

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
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8 text-center`}>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading notes...</p>
            </div>
        );
    }

    return (
        <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} min-h-screen p-4`}>
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm p-6 mb-4`}>
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                <i className="fas fa-sticky-note mr-2 text-primary-500"></i>
                                My Notes
                            </h1>
                            <p className={`text-sm mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                Personal notes - {notes.length} note{notes.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                                className={`px-4 py-2 rounded-lg ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                                title={viewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'}
                            >
                                <i className={`fas fa-${viewMode === 'list' ? 'th' : 'list'}`}></i>
                            </button>
                            <button
                                onClick={handleCreateNote}
                                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                <i className="fas fa-plus mr-2"></i>
                                New Note
                            </button>
                        </div>
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="text"
                            placeholder="Search notes..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            } focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        />
                    </div>
                </div>

                <div className="flex gap-4">
                    {/* Notes List */}
                    <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm ${viewMode === 'list' ? 'w-1/3' : 'w-full'} transition-all`}>
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {filteredNotes.length} Note{filteredNotes.length !== 1 ? 's' : ''}
                            </h2>
                        </div>
                        <div className={`overflow-y-auto ${viewMode === 'list' ? 'max-h-[calc(100vh-300px)]' : ''}`}>
                            {filteredNotes.length === 0 ? (
                                <div className="p-8 text-center">
                                    <i className="fas fa-sticky-note text-4xl text-gray-400 mb-4"></i>
                                    <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                        {searchQuery ? 'No notes found' : 'No notes yet. Create your first note!'}
                                    </p>
                                </div>
                            ) : viewMode === 'list' ? (
                                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredNotes.map(note => (
                                        <div
                                            key={note.id}
                                            onClick={() => setSelectedNote(note)}
                                            className={`p-4 cursor-pointer transition-colors ${
                                                selectedNote?.id === note.id
                                                    ? isDark ? 'bg-primary-900' : 'bg-primary-50'
                                                    : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <h3 className={`font-medium truncate flex-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {note.title || 'Untitled Note'}
                                                </h3>
                                                {note.sharedWith && note.sharedWith.length > 0 && (
                                                    <i className="fas fa-share-alt text-primary-500 ml-2" title="Shared"></i>
                                                )}
                                            </div>
                                            <p className={`text-sm truncate mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {note.content?.replace(/<[^>]*>/g, '').substring(0, 100) || 'No content'}
                                            </p>
                                            <div className="flex items-center justify-between text-xs">
                                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                                                    {formatDate(note.updatedAt || note.createdAt)}
                                                </span>
                                                {note.tags && note.tags.length > 0 && (
                                                    <div className="flex gap-1">
                                                        {note.tags.slice(0, 2).map((tag, idx) => (
                                                            <span
                                                                key={idx}
                                                                className={`px-2 py-0.5 rounded ${
                                                                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                                                                }`}
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredNotes.map(note => (
                                        <div
                                            key={note.id}
                                            onClick={() => setSelectedNote(note)}
                                            className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                                selectedNote?.id === note.id
                                                    ? isDark ? 'bg-primary-900 border-primary-600' : 'bg-primary-50 border-primary-500'
                                                    : isDark ? 'bg-gray-700 border-gray-600 hover:border-gray-500' : 'bg-white border-gray-200 hover:border-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-2">
                                                <h3 className={`font-medium truncate flex-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    {note.title || 'Untitled Note'}
                                                </h3>
                                                {note.sharedWith && note.sharedWith.length > 0 && (
                                                    <i className="fas fa-share-alt text-primary-500 ml-2" title="Shared"></i>
                                                )}
                                            </div>
                                            <p className={`text-sm line-clamp-3 mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {note.content?.replace(/<[^>]*>/g, '').substring(0, 150) || 'No content'}
                                            </p>
                                            <div className="flex items-center justify-between text-xs mt-2">
                                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>
                                                    {formatDate(note.updatedAt || note.createdAt)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Note Editor */}
                    {viewMode === 'list' && (
                        <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-sm flex-1 ${selectedNote ? 'block' : 'hidden'}`}>
                            {selectedNote ? (
                                <NoteEditor
                                    note={selectedNote}
                                    onSave={handleSaveNote}
                                    onDelete={handleDeleteNote}
                                    onShare={handleShareNote}
                                    isSaving={isSaving}
                                    isDark={isDark}
                                />
                            ) : (
                                <div className="p-8 text-center">
                                    <i className="fas fa-sticky-note text-4xl text-gray-400 mb-4"></i>
                                    <p className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                                        Select a note to edit or create a new one
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <ShareModal
                    noteId={shareNoteId}
                    users={users}
                    selectedUsers={selectedUsersToShare}
                    onSelectUsers={setSelectedUsersToShare}
                    onSave={handleSaveShare}
                    onClose={() => setShowShareModal(false)}
                    isDark={isDark}
                />
            )}
        </div>
    );
};

// Note Editor Component
const NoteEditor = ({ note, onSave, onDelete, onShare, isSaving, isDark }) => {
    const [title, setTitle] = useState(note.title || '');
    const [content, setContent] = useState(note.content || '');
    const [tags, setTags] = useState(note.tags || []);
    const [newTag, setNewTag] = useState('');
    const saveTimeoutRef = useRef(null);

    useEffect(() => {
        setTitle(note.title || '');
        setContent(note.content || '');
        setTags(note.tags || []);
    }, [note.id]);

    // Auto-save after 2 seconds of inactivity
    useEffect(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            if (title.trim() || content.trim()) {
                onSave({
                    ...note,
                    title: title.trim() || 'Untitled Note',
                    content,
                    tags
                });
            }
        }, 2000);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [title, content, tags]);

    const handleAddTag = () => {
        if (newTag.trim() && !tags.includes(newTag.trim())) {
            setTags([...tags, newTag.trim()]);
            setNewTag('');
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Note title..."
                    className={`flex-1 text-xl font-semibold bg-transparent border-none outline-none ${
                        isDark ? 'text-gray-100' : 'text-gray-900'
                    }`}
                />
                <div className="flex items-center gap-2">
                    {isSaving && (
                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="fas fa-spinner fa-spin mr-1"></i>
                            Saving...
                        </span>
                    )}
                    <button
                        onClick={() => onShare(note)}
                        className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                        title="Share note"
                    >
                        <i className="fas fa-share-alt text-primary-500"></i>
                    </button>
                    <button
                        onClick={() => onDelete(note.id)}
                        className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-100 text-red-600'} transition-colors`}
                        title="Delete note"
                    >
                        <i className="fas fa-trash"></i>
                    </button>
                </div>
            </div>

            {/* Tags */}
            <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center gap-2 flex-wrap`}>
                {tags.map((tag, idx) => (
                    <span
                        key={idx}
                        className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${
                            isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                        }`}
                    >
                        {tag}
                        <button
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-1 hover:text-red-500"
                        >
                            <i className="fas fa-times text-xs"></i>
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder="Add tag..."
                    className={`px-2 py-1 rounded text-sm border ${
                        isDark 
                            ? 'bg-gray-700 border-gray-600 text-gray-100' 
                            : 'bg-white border-gray-300 text-gray-900'
                    } focus:outline-none focus:ring-1 focus:ring-primary-500`}
                />
            </div>

            {/* Content Editor */}
            <div className="flex-1 p-4 overflow-y-auto">
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Start writing your note..."
                    className={`w-full h-full resize-none bg-transparent border-none outline-none ${
                        isDark ? 'text-gray-100' : 'text-gray-900'
                    }`}
                    style={{ minHeight: '400px' }}
                />
            </div>
        </div>
    );
};

// Share Modal Component
const ShareModal = ({ noteId, users, selectedUsers, onSelectUsers, onSave, onClose, isDark }) => {
    const handleToggleUser = (userId) => {
        if (selectedUsers.includes(userId)) {
            onSelectUsers(selectedUsers.filter(id => id !== userId));
        } else {
            onSelectUsers([...selectedUsers, userId]);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div 
                className="absolute inset-0 bg-black bg-opacity-50"
                onClick={onClose}
            ></div>
            <div className={`relative ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl w-full max-w-md`}>
                <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        Share Note
                    </h3>
                    <button
                        onClick={onClose}
                        className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                <div className="p-4">
                    <p className={`text-sm mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Select users to share this note with:
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-2">
                        {users.length === 0 ? (
                            <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                No other users found
                            </p>
                        ) : (
                            users.map(user => (
                                <label
                                    key={user.id}
                                    className={`flex items-center p-2 rounded-lg cursor-pointer ${
                                        isDark 
                                            ? 'hover:bg-gray-700' 
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.includes(user.id)}
                                        onChange={() => handleToggleUser(user.id)}
                                        className="mr-3"
                                    />
                                    <div className="flex-1">
                                        <p className={isDark ? 'text-gray-100' : 'text-gray-900'}>
                                            {user.name || user.email}
                                        </p>
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {user.email}
                                        </p>
                                    </div>
                                </label>
                            ))
                        )}
                    </div>
                </div>
                <div className={`p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} flex justify-end gap-2`}>
                    <button
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg ${
                            isDark 
                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' 
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                        } transition-colors`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.MyNotes = MyNotes;

// Dispatch ready event for lazy loading
if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('myNotesComponentReady'));
}











