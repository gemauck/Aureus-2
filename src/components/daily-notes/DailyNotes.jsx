// Daily Notes Component - Full-page editor with handwriting support
const { useState, useEffect, useRef, useCallback } = React;
const { useAuth } = window;

const DailyNotes = ({ initialDate = null, onClose = null }) => {
    const { user } = useAuth();
    const { isDark } = window.useTheme();
    const [currentDate, setCurrentDate] = useState(initialDate || new Date());
    const [notes, setNotes] = useState({});
    const [currentNote, setCurrentNote] = useState('');
    const [currentNoteHtml, setCurrentNoteHtml] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showListView, setShowListView] = useState(!initialDate);
    const [searchQuery, setSearchQuery] = useState('');
    const [filteredNotes, setFilteredNotes] = useState([]);
    const [showHandwriting, setShowHandwriting] = useState(false);
    const [handwritingCanvas, setHandwritingCanvas] = useState(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [recognizedText, setRecognizedText] = useState('');
    const [isRecognizing, setIsRecognizing] = useState(false);
    
    const editorRef = useRef(null);
    const canvasRef = useRef(null);
    const toolbarRef = useRef(null);

    // Format date string helper
    const formatDateString = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Format date for display
    const formatDateDisplay = (dateString) => {
        const date = new Date(dateString + 'T00:00:00Z');
        return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    // Load notes
    useEffect(() => {
        const loadNotes = async () => {
            setIsLoading(true);
            try {
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const token = window.storage?.getToken?.();
                
                if (token) {
                    const res = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
                        headers: { 
                            Authorization: `Bearer ${token}`,
                            'Cache-Control': 'no-cache'
                        },
                        credentials: 'include'
                    });
                    
                    if (res.ok) {
                        const data = await res.json();
                        const serverNotes = data?.data?.notes || data?.notes || {};
                        setNotes(serverNotes);
                        
                        // Load current note if editing specific date
                        if (!showListView && currentDate) {
                            const dateString = formatDateString(currentDate);
                            const note = serverNotes[dateString] || '';
                            setCurrentNote(note);
                            setCurrentNoteHtml(note);
                            if (editorRef.current) {
                                editorRef.current.innerHTML = note;
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading notes:', error);
            } finally {
                setIsLoading(false);
            }
        };
        
        loadNotes();
    }, [currentDate, showListView]);

    // Update filtered notes when search query or notes change
    useEffect(() => {
        if (!searchQuery.trim()) {
            const allNotes = Object.entries(notes)
                .filter(([_, note]) => note && note.trim().length > 0)
                .map(([dateString, note]) => ({
                    dateString,
                    date: new Date(dateString + 'T00:00:00Z'),
                    note: note.replace(/<[^>]*>/g, ''), // Strip HTML for search
                    noteHtml: note
                }))
                .sort((a, b) => b.date - a.date);
            setFilteredNotes(allNotes);
        } else {
            const query = searchQuery.toLowerCase();
            const matching = Object.entries(notes)
                .filter(([_, note]) => {
                    const textContent = note.replace(/<[^>]*>/g, '').toLowerCase();
                    return textContent.includes(query);
                })
                .map(([dateString, note]) => ({
                    dateString,
                    date: new Date(dateString + 'T00:00:00Z'),
                    note: note.replace(/<[^>]*>/g, ''),
                    noteHtml: note
                }))
                .sort((a, b) => b.date - a.date);
            setFilteredNotes(matching);
        }
    }, [searchQuery, notes]);

    // Initialize handwriting canvas
    useEffect(() => {
        if (showHandwriting && canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            const resizeCanvas = () => {
                const rect = canvas.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                ctx.scale(dpr, dpr);
                
                // Set drawing styles
                ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
            };
            
            resizeCanvas();
            setHandwritingCanvas(canvas);
            
            // Handle window resize
            const handleResize = () => resizeCanvas();
            window.addEventListener('resize', handleResize);
            
            return () => {
                window.removeEventListener('resize', handleResize);
            };
        }
    }, [showHandwriting, isDark]);

    // Handle drawing on canvas
    const startDrawing = (e) => {
        setIsDrawing(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        ctx.beginPath();
        ctx.moveTo(x, y);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    // Recognize handwriting using OCR
    const recognizeHandwriting = async () => {
        if (!canvasRef.current) return;
        
        setIsRecognizing(true);
        try {
            // Convert canvas to image
            const imageDataUrl = canvasRef.current.toDataURL('image/png');
            
            // Convert to blob
            const response = await fetch(imageDataUrl);
            const blob = await response.blob();
            
            // Load Tesseract if needed
            if (!window.Tesseract && window.loadTesseract) {
                await window.loadTesseract();
            }
            
            if (!window.Tesseract) {
                throw new Error('Tesseract.js library failed to load');
            }

            // Initialize Tesseract worker
            const worker = await window.Tesseract.createWorker();
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            // Recognize text
            const { data: { text } } = await worker.recognize(blob);
            
            setRecognizedText(text);
            
            // Insert recognized text into editor
            if (editorRef.current && text.trim()) {
                const selection = window.getSelection();
                const range = selection.getRangeAt(0);
                const textNode = document.createTextNode(text);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);
                
                // Update note content
                updateNoteContent();
            }

            await worker.terminate();
        } catch (error) {
            console.error('Error recognizing handwriting:', error);
            alert('Failed to recognize handwriting: ' + error.message);
        } finally {
            setIsRecognizing(false);
        }
    };

    // Clear handwriting canvas
    const clearHandwriting = () => {
        if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };

    // Update note content from editor
    const updateNoteContent = useCallback(() => {
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            setCurrentNoteHtml(html);
            // Strip HTML for plain text version (for search)
            const text = editorRef.current.innerText || editorRef.current.textContent || '';
            setCurrentNote(text);
        }
    }, []);

    // Save note
    const saveNote = async () => {
        setIsSaving(true);
        try {
            const dateString = formatDateString(currentDate);
            const noteContent = currentNoteHtml || currentNote;
            
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Not authenticated. Please log in.');
                return;
            }

            const res = await fetch('/api/calendar-notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    date: dateString,
                    note: noteContent
                })
            });

            if (res.ok) {
                // Update local notes
                setNotes(prev => ({ ...prev, [dateString]: noteContent }));
                
                if (window.showNotification) {
                    window.showNotification('Note saved successfully', 'success');
                }
                
                // If in list view, switch to it
                if (!showListView) {
                    // Optionally close or stay in editor
                }
            } else {
                throw new Error('Failed to save note');
            }
        } catch (error) {
            console.error('Error saving note:', error);
            alert('Failed to save note: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    // Open note for editing
    const openNote = (dateString) => {
        const date = new Date(dateString + 'T00:00:00Z');
        setCurrentDate(date);
        setShowListView(false);
        const note = notes[dateString] || '';
        setCurrentNote(note);
        setCurrentNoteHtml(note);
        if (editorRef.current) {
            editorRef.current.innerHTML = note;
        }
    };

    // Rich text formatting commands
    const execCommand = (command, value = null) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        updateNoteContent();
    };

    // Handle editor input
    const handleEditorInput = () => {
        updateNoteContent();
    };

    // Handle paste to strip unwanted formatting
    const handlePaste = (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, text);
        updateNoteContent();
    };

    if (isLoading && !showListView) {
        return (
            <div className={`fixed inset-0 z-50 ${isDark ? 'bg-gray-900' : 'bg-white'} flex items-center justify-center`}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading note...</p>
                </div>
            </div>
        );
    }

    // List View
    if (showListView) {
        return (
            <div className={`fixed inset-0 z-50 ${isDark ? 'bg-gray-900' : 'bg-gray-50'} flex flex-col`}>
                {/* Header */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3 flex items-center justify-between`}>
                    <div className="flex items-center space-x-4">
                        {onClose && (
                            <button
                                onClick={onClose}
                                className={`${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'} p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                            >
                                <i className="fas fa-arrow-left"></i>
                            </button>
                        )}
                        <h1 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Daily Notes
                        </h1>
                    </div>
                    <button
                        onClick={() => {
                            setCurrentDate(new Date());
                            setShowListView(false);
                            setCurrentNote('');
                            setCurrentNoteHtml('');
                            if (editorRef.current) {
                                editorRef.current.innerHTML = '';
                            }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                        <i className="fas fa-plus mr-2"></i>
                        New Note
                    </button>
                </div>

                {/* Search Bar */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3`}>
                    <div className="relative">
                        <i className={`fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search notes..."
                            className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        />
                    </div>
                </div>

                {/* Notes List */}
                <div className="flex-1 overflow-y-auto p-4">
                    {filteredNotes.length === 0 ? (
                        <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="fas fa-sticky-note text-4xl mb-4 opacity-50"></i>
                            <p className="text-lg mb-2">
                                {searchQuery ? 'No notes found matching your search' : 'No notes yet'}
                            </p>
                            <p className="text-sm">
                                {searchQuery ? 'Try a different search term' : 'Click "New Note" to create your first note'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredNotes.map(({ dateString, date, note, noteHtml }) => (
                                <div
                                    key={dateString}
                                    onClick={() => openNote(dateString)}
                                    className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-lg p-4 cursor-pointer transition-colors`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {formatDateDisplay(dateString)}
                                        </h3>
                                        <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            {dateString}
                                        </span>
                                    </div>
                                    <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'} line-clamp-3`}>
                                        {note.length > 200 ? note.substring(0, 200) + '...' : note}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Editor View
    return (
        <div className={`fixed inset-0 z-50 ${isDark ? 'bg-gray-900' : 'bg-gray-50'} flex flex-col`}>
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3 flex items-center justify-between`}>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => setShowListView(true)}
                        className={`${isDark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'} p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {formatDateDisplay(formatDateString(currentDate))}
                        </h1>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatDateString(currentDate)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={saveNote}
                        disabled={isSaving}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                    >
                        {isSaving ? (
                            <>
                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                Saving...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-save mr-2"></i>
                                Save
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div ref={toolbarRef} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-2 flex items-center space-x-2 flex-wrap`}>
                <button
                    onClick={() => execCommand('bold')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Bold"
                >
                    <i className="fas fa-bold"></i>
                </button>
                <button
                    onClick={() => execCommand('italic')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Italic"
                >
                    <i className="fas fa-italic"></i>
                </button>
                <button
                    onClick={() => execCommand('underline')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Underline"
                >
                    <i className="fas fa-underline"></i>
                </button>
                <div className={`w-px h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                <button
                    onClick={() => execCommand('justifyLeft')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Align Left"
                >
                    <i className="fas fa-align-left"></i>
                </button>
                <button
                    onClick={() => execCommand('justifyCenter')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Align Center"
                >
                    <i className="fas fa-align-center"></i>
                </button>
                <button
                    onClick={() => execCommand('justifyRight')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Align Right"
                >
                    <i className="fas fa-align-right"></i>
                </button>
                <div className={`w-px h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                <button
                    onClick={() => execCommand('insertUnorderedList')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Bullet List"
                >
                    <i className="fas fa-list-ul"></i>
                </button>
                <button
                    onClick={() => execCommand('insertOrderedList')}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Numbered List"
                >
                    <i className="fas fa-list-ol"></i>
                </button>
                <div className={`w-px h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                <button
                    onClick={() => setShowHandwriting(!showHandwriting)}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${showHandwriting ? 'bg-blue-100 text-blue-600' : isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title="Handwriting"
                >
                    <i className="fas fa-pen"></i>
                </button>
            </div>

            {/* Editor Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Rich Text Editor */}
                <div className="flex-1 p-4 overflow-y-auto">
                    <div
                        ref={editorRef}
                        contentEditable
                        onInput={handleEditorInput}
                        onPaste={handlePaste}
                        className={`w-full h-full min-h-[400px] p-4 rounded-lg border ${
                            isDark 
                                ? 'bg-gray-800 border-gray-700 text-gray-100' 
                                : 'bg-white border-gray-300 text-gray-900'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        style={{ minHeight: 'calc(100vh - 200px)' }}
                    />
                </div>

                {/* Handwriting Panel */}
                {showHandwriting && (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t p-4`}>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                Handwriting
                            </h3>
                            <div className="flex items-center space-x-2">
                                <button
                                    onClick={clearHandwriting}
                                    className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                >
                                    <i className="fas fa-eraser mr-1"></i>
                                    Clear
                                </button>
                                <button
                                    onClick={recognizeHandwriting}
                                    disabled={isRecognizing}
                                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isRecognizing ? (
                                        <>
                                            <i className="fas fa-spinner fa-spin mr-1"></i>
                                            Recognizing...
                                        </>
                                    ) : (
                                        <>
                                            <i className="fas fa-magic mr-1"></i>
                                            Recognize Text
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className={`w-full h-64 border-2 rounded-lg cursor-crosshair ${
                                isDark ? 'border-gray-600 bg-gray-900' : 'border-gray-300 bg-white'
                            }`}
                            style={{ touchAction: 'none' }}
                        />
                        {recognizedText && (
                            <div className={`mt-3 p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    <strong>Recognized:</strong> {recognizedText}
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.DailyNotes = DailyNotes;

export default DailyNotes;

