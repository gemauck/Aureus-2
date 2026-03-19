// Shared Note Editor + RichTextToolbar + ShareModal for use in My Notes and Project Detail
const React = window.React;
const { useState, useEffect, useRef, useCallback } = React;

// Formatting toolbar for contentEditable (uses execCommand)
const RichTextToolbar = ({ editorRef, isDark }) => {
    const exec = (cmd, value = null) => (e) => {
        e.preventDefault();
        editorRef.current?.focus();
        if (cmd === 'createLink') {
            const url = window.prompt('Enter URL:', 'https://');
            if (url) document.execCommand(cmd, false, url);
        } else if (cmd === 'formatBlock') {
            document.execCommand('formatBlock', false, value);
        } else {
            document.execCommand(cmd, false, value);
        }
    };
    const btn = (icon, title, cmd, value = null) => (
        <button key={title} type="button" onClick={exec(cmd, value)} title={title} className={`p-2 rounded ${isDark ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-200 text-gray-700'}`} aria-label={title}>
            <i className={`fas fa-${icon}`} aria-hidden="true"></i>
        </button>
    );
    return (
        <div className={`flex items-center gap-0.5 flex-wrap border-b ${isDark ? 'border-gray-600' : 'border-gray-200'} px-2 py-1`}>
            {btn('bold', 'Bold', 'bold')}
            {btn('italic', 'Italic', 'italic')}
            {btn('underline', 'Underline', 'underline')}
            {btn('strikethrough', 'Strikethrough', 'strikeThrough')}
            <span className={`w-px h-5 mx-1 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} aria-hidden="true"></span>
            {btn('list-ul', 'Bullet list', 'insertUnorderedList')}
            {btn('list-ol', 'Numbered list', 'insertOrderedList')}
            <span className={`w-px h-5 mx-1 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} aria-hidden="true"></span>
            {btn('heading', 'Heading 1', 'formatBlock', 'h1')}
            {btn('heading', 'Heading 2', 'formatBlock', 'h2')}
            {btn('heading', 'Heading 3', 'formatBlock', 'h3')}
            {btn('quote-right', 'Blockquote', 'formatBlock', 'blockquote')}
            <span className={`w-px h-5 mx-1 ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} aria-hidden="true"></span>
            {btn('link', 'Insert link', 'createLink')}
            {btn('eraser', 'Clear format', 'removeFormat')}
        </div>
    );
};

// Note Editor Component
// isProjectNote: when true, note is from project notes table (hide Make public, Client/Project, Share, Pin)
const NoteEditor = ({ note, allTags = [], clients = [], projects = [], clientProjects = [], onClientChange, onSave, onDelete, onShare, onTogglePin, onExport, isSaving, lastSavedAt, isDark, isProjectNote = false }) => {
    const [title, setTitle] = useState(note.title || '');
    const [content, setContent] = useState(note.content || '');
    const [tags, setTags] = useState(note.tags || []);
    const [newTag, setNewTag] = useState('');
    const [clientId, setClientId] = useState(note.clientId ?? note.client?.id ?? '');
    const [projectId, setProjectId] = useState(note.projectId ?? note.project?.id ?? '');
    const [isPublic, setIsPublic] = useState(Boolean(note.isPublic));
    const saveTimeoutRef = useRef(null);
    const noteRef = useRef(note);
    const editorRef = useRef(null);
    const canPin = !isProjectNote && note.isOwner !== false && !note.id?.startsWith('temp-');

    noteRef.current = note;

    useEffect(() => {
        setTitle(note.title || '');
        setContent(note.content || '');
        setTags(note.tags || []);
        setClientId(note.clientId ?? note.client?.id ?? '');
        setProjectId(note.projectId ?? note.project?.id ?? '');
        setIsPublic(Boolean(note.isPublic));
    }, [note.id]);

    React.useLayoutEffect(() => {
        if (editorRef.current && note.content !== undefined) {
            editorRef.current.innerHTML = note.content || '';
        }
    }, [note.id]);

    const performSave = useCallback(() => {
        const currentNote = noteRef.current;
        if (!currentNote) return;
        const html = editorRef.current ? editorRef.current.innerHTML : content;
        if (title.trim() || (html && html.trim() !== '' && html !== '<br>')) {
            onSave({
                ...currentNote,
                title: title.trim() || 'Untitled Note',
                content: html || '',
                tags,
                pinned: currentNote.pinned,
                isPublic,
                clientId: clientId && String(clientId).trim() ? clientId : null,
                projectId: projectId && String(projectId).trim() ? projectId : null
            });
        }
    }, [title, content, tags, clientId, projectId, isPublic, onSave]);

    useEffect(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(performSave, 2000);
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [title, content, tags, clientId, projectId, isPublic, performSave]);

    const handleEditorInput = () => {
        if (!editorRef.current) return;
        const html = editorRef.current.innerHTML;
        setContent(html);
    };

    const tagSet = React.useMemo(() => new Set(tags.map(t => String(t).toLowerCase())), [tags]);
    const handleAddTag = () => {
        const trimmed = newTag.trim();
        if (trimmed && !tagSet.has(trimmed.toLowerCase())) {
            setTags([...tags, trimmed]);
            setNewTag('');
        }
    };
    const handleAddExistingTag = (tag) => {
        if (!tagSet.has(String(tag).toLowerCase())) {
            setTags([...tags, tag]);
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const plainText = (content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const wordCount = plainText.split(/\s+/).filter(Boolean).length;

    return (
        <div className="flex flex-col h-full min-h-0">
            <div className={`sticky top-0 z-10 p-4 border-b ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'} flex items-center justify-between gap-2 flex-wrap`}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Note title..."
                    className={`flex-1 min-w-0 text-xl font-semibold bg-transparent border-none outline-none ${
                        isDark ? 'text-gray-100' : 'text-gray-900'
                    }`}
                    aria-label="Note title"
                />
                <div className="flex items-center gap-1 flex-wrap">
                    <button
                        type="button"
                        onClick={() => { if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; } performSave(); }}
                        disabled={isSaving}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium ${isSaving ? 'opacity-50 cursor-not-allowed' : ''} ${isDark ? 'bg-primary-600 hover:bg-primary-700 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'}`}
                        aria-label="Save note now"
                        title="Save"
                    >
                        <i className={`fas ${isSaving ? 'fa-spinner fa-spin' : 'fa-save'} mr-1`} aria-hidden="true"></i>
                        Save
                    </button>
                    {canPin && onTogglePin && (
                        <button
                            type="button"
                            onClick={() => onTogglePin({ ...note, title, content: editorRef.current?.innerHTML ?? content, tags, pinned: note.pinned, isPublic, clientId: clientId || null, projectId: projectId || null })}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                            title={note.pinned ? 'Unpin' : 'Pin note'}
                            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                        >
                            <i className={`fas fa-thumbtack ${note.pinned ? 'text-primary-500' : ''}`} aria-hidden="true"></i>
                        </button>
                    )}
                    {!isProjectNote && (
                        <button
                            type="button"
                            onClick={() => onShare(note)}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                            title="Share note"
                            aria-label="Share note"
                        >
                            <i className="fas fa-share-alt text-primary-500" aria-hidden="true"></i>
                        </button>
                    )}
                    {onExport && (
                        <button
                            type="button"
                            onClick={() => onExport(note)}
                            className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'} transition-colors`}
                            title="Export as Markdown"
                            aria-label="Export note"
                        >
                            <i className="fas fa-download" aria-hidden="true"></i>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onDelete(note.id)}
                        className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-gray-100 text-red-600'} transition-colors`}
                        title="Delete note"
                        aria-label="Delete note"
                    >
                        <i className="fas fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>

            <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Tags</span>
                    {tags.map((tag, idx) => (
                        <span
                            key={idx}
                            className={`px-2 py-1 rounded text-sm flex items-center gap-1 ${
                                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                            {tag}
                            <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}
                                className="ml-1 hover:text-red-500"
                                aria-label={`Remove tag ${tag}`}
                            >
                                <i className="fas fa-times text-xs" aria-hidden="true"></i>
                            </button>
                        </span>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {allTags.filter(t => !tagSet.has(String(t).toLowerCase())).length > 0 && (
                        <>
                            <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>Add from existing:</span>
                            {allTags.filter(t => !tagSet.has(String(t).toLowerCase())).map((tag) => (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => handleAddExistingTag(tag)}
                                    className={`px-2 py-1 rounded text-sm border border-dashed ${
                                        isDark ? 'border-gray-600 text-gray-300 hover:bg-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                                    }`}
                                    aria-label={`Add tag ${tag}`}
                                >
                                    + {tag}
                                </button>
                            ))}
                        </>
                    )}
                    <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                        placeholder="Type a new tag and press Enter or Add"
                        className={`px-2 py-1 rounded text-sm border w-40 ${
                            isDark 
                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                : 'bg-white border-gray-300 text-gray-900'
                        } focus:outline-none focus:ring-1 focus:ring-primary-500`}
                        aria-label="New tag name"
                    />
                    <button
                        type="button"
                        onClick={handleAddTag}
                        disabled={!newTag.trim()}
                        className={`px-2 py-1 rounded text-sm font-medium ${isDark ? 'bg-gray-600 text-gray-200 hover:bg-gray-500 disabled:opacity-50' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50'}`}
                        aria-label="Add tag"
                    >
                        Add
                    </button>
                </div>
            </div>

            {!isProjectNote && (
                <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex flex-wrap items-center gap-4`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={!!isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                            aria-label="Make note public (show in project)"
                        />
                        <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Make public</span>
                    </label>
                    <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>When public and linked to a project, this note appears in the project's Notes tab.</span>
                    <div className="flex items-center gap-2">
                        <label htmlFor="note-client" className={`text-xs font-medium whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Client
                        </label>
                        <select
                            id="note-client"
                            value={clientId}
                            onChange={(e) => {
                                const newClientId = e.target.value;
                                setClientId(newClientId);
                                if (!newClientId) setProjectId('');
                                else {
                                    const proj = (clientProjects?.length ? clientProjects : projects).find(p => p.id === projectId);
                                    if (proj && proj.clientId !== newClientId) setProjectId('');
                                }
                                onClientChange?.(newClientId || null);
                            }}
                            className={`px-2 py-1.5 rounded text-sm border min-w-[140px] ${
                                isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                            } focus:outline-none focus:ring-1 focus:ring-primary-500`}
                            aria-label="Assign note to client"
                        >
                            <option value="">None</option>
                            {clients.map(c => (
                                <option key={c.id} value={c.id}>{c.name || 'Unnamed'}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <label htmlFor="note-project" className={`text-xs font-medium whitespace-nowrap ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Project
                        </label>
                        <select
                            id="note-project"
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
                            className={`px-2 py-1.5 rounded text-sm border min-w-[140px] ${
                                isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                            } focus:outline-none focus:ring-1 focus:ring-primary-500`}
                            aria-label="Assign note to project"
                        >
                            <option value="">None</option>
                            {((clientId && clientProjects?.length > 0) ? clientProjects : (clientId ? projects.filter(p => p.clientId === clientId) : projects)).map(p => (
                                <option key={p.id} value={p.id}>{p.name || 'Unnamed'}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <RichTextToolbar editorRef={editorRef} isDark={isDark} />
                <div className="flex-1 p-4 overflow-y-auto min-h-0">
                    <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={handleEditorInput}
                        data-placeholder="Start writing your note..."
                        {...(isDark ? { 'data-dark': 'true' } : {})}
                        className={`notes-editor w-full min-h-[320px] outline-none ${isDark ? 'text-gray-100' : 'text-gray-900'} [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-bold [&_h3]:text-lg [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_blockquote]:border-l-4 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:opacity-90 ${isDark ? '[&_a]:text-primary-400' : '[&_a]:text-primary-600'} [&_a]:underline`}
                        style={{ minHeight: '400px' }}
                        aria-label="Note content"
                    />
                    <p className={`text-xs mt-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {wordCount} word{wordCount !== 1 ? 's' : ''}
                    </p>
                </div>
            </div>
        </div>
    );
};

// Share Modal Component - with user search and focus trap
const ShareModal = ({ noteId, users, selectedUsers, onSelectUsers, onSave, onClose, isDark }) => {
    const [search, setSearch] = useState('');
    const firstFocusRef = useRef(null);

    const filteredUsers = React.useMemo(() => {
        if (!search.trim()) return users;
        const q = search.toLowerCase();
        return users.filter(u =>
            (u.name || '').toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q)
        );
    }, [users, search]);

    const handleToggleUser = (userId) => {
        if (selectedUsers.includes(userId)) {
            onSelectUsers(selectedUsers.filter(id => id !== userId));
        } else {
            onSelectUsers([...selectedUsers, userId]);
        }
    };

    useEffect(() => {
        firstFocusRef.current?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
            if (e.key !== 'Tab') return;
            const focusables = document.querySelectorAll('[data-share-modal] button, [data-share-modal] input, [data-share-modal] [tabindex="0"]');
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-modal-title"
            data-share-modal
        >
            <div
                className="absolute inset-0 bg-black bg-opacity-50"
                onClick={onClose}
                onKeyDown={(e) => e.key === 'Enter' && onClose()}
                tabIndex={0}
                aria-label="Close overlay"
            />
            <div className={`relative ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col`}>
                <div className={`p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-between`}>
                    <h3 id="share-modal-title" className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        Share Note
                    </h3>
                    <button
                        type="button"
                        ref={firstFocusRef}
                        onClick={onClose}
                        className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
                        aria-label="Close"
                    >
                        <i className="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                <div className="p-4 flex-1 min-h-0 flex flex-col">
                    <p className={`text-sm mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Select users to share this note with:
                    </p>
                    {users.length > 3 && (
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search users..."
                            className={`w-full px-3 py-2 rounded-lg border mb-3 text-sm ${
                                isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
                            }`}
                            aria-label="Search users"
                        />
                    )}
                    <div className="max-h-64 overflow-y-auto space-y-1">
                        {filteredUsers.length === 0 ? (
                            <p className={`text-sm text-center py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                {search ? 'No users match your search.' : 'No other users found.'}
                            </p>
                        ) : (
                            filteredUsers.map(u => (
                                <label
                                    key={u.id}
                                    className={`flex items-center p-2 rounded-lg cursor-pointer ${
                                        isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.includes(u.id)}
                                        onChange={() => handleToggleUser(u.id)}
                                        className="mr-3"
                                        aria-label={`Share with ${u.name || u.email}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className={`truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {u.name || u.email}
                                        </p>
                                        {u.email && (
                                            <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {u.email}
                                            </p>
                                        )}
                                    </div>
                                </label>
                            ))
                        )}
                    </div>
                </div>
                <div className={`p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} flex justify-end gap-2`}>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`px-4 py-2 rounded-lg ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'}`}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        Save sharing
                    </button>
                </div>
            </div>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.NoteEditor = NoteEditor;
    window.ShareModal = ShareModal;
}
