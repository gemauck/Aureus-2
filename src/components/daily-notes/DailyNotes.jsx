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
    const editorCursorPositionRef = useRef(null); // Track cursor position to restore after updates
    const isUserTypingRef = useRef(false); // Track if user is actively typing to prevent sync interference
    const lastUserInputTimeRef = useRef(0); // Track when user last typed to prevent sync
    const isUpdatingFromUserInputRef = useRef(false); // Track if currentNoteHtml update is from user input
    const justPressedEnterRef = useRef(false); // Track if Enter was just pressed to prevent cursor restoration
    
    // Format date string helper - MUST be defined before useEffects
    const formatDateString = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Clean HTML content - remove &nbsp; entities and replace with regular spaces
    const cleanHtmlContent = (html) => {
        if (!html || typeof html !== 'string') return html;
        // Replace &nbsp; with regular spaces (both with and without semicolon)
        return html.replace(/&nbsp;/g, ' ').replace(/&nbsp/g, ' ');
    };
    
    // Load note when date changes or component mounts with initial date
    useEffect(() => {
        if (initialDate && !showListView) {
            const dateString = formatDateString(initialDate);
            // Load from localStorage first
            const user = window.storage?.getUser?.();
            const userId = user?.id || user?.email || 'default';
            const notesKey = `user_notes_${userId}`;
            const localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
            let note = localNotes[dateString] || notes[dateString] || '';
            
            // Clean &nbsp; entities from loaded note
            note = cleanHtmlContent(note);
            
            console.log('📝 Loading initial note for date:', dateString, 'from localStorage length:', note.length);
            
            if (note) {
                setCurrentNote(note);
                setCurrentNoteHtml(note);
                console.log('📝 Set initial note state, length:', note.length);
                
                // Force set editor content immediately
                if (editorRef.current) {
                    setEditorContentSafely(note);
                    console.log('✅ Set initial editor content immediately, length:', note.length);
                } else {
                    // If editor not ready, wait and set
                    setTimeout(() => {
                        if (editorRef.current) {
                            setEditorContentSafely(note);
                            console.log('✅ Set initial editor content (delayed), length:', note.length);
                        }
                    }, 100);
                }
            } else {
                // Even if empty, set it to ensure editor is initialized
                setCurrentNote('');
                setCurrentNoteHtml('');
                if (editorRef.current) {
                    setEditorContentSafely('');
                }
            }
            
            // Also try to fetch from server
            const token = window.storage?.getToken?.();
            if (token) {
                fetch(`/api/calendar-notes?t=${Date.now()}`, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include'
                })
                .then(res => res.json())
                .then(data => {
                    const serverNotes = data?.data?.notes || data?.notes || {};
                    let serverNote = serverNotes[dateString] || '';
                    
                    // Clean &nbsp; entities from server note
                    serverNote = cleanHtmlContent(serverNote);
                    
                    if (serverNote && serverNote !== note) {
                        console.log('📝 Found server note, length:', serverNote.length);
                        setCurrentNote(serverNote);
                        setCurrentNoteHtml(serverNote);
                        // Update notes state and localStorage
                        setNotes(prev => ({ ...prev, [dateString]: serverNote }));
                        localNotes[dateString] = serverNote;
                        localStorage.setItem(notesKey, JSON.stringify(localNotes));
                    }
                })
                .catch(err => console.error('Error fetching initial note:', err));
            }
        }
    }, [initialDate, showListView]);

    // Format date for display
    const formatDateDisplay = (dateString) => {
        const date = new Date(dateString + 'T00:00:00Z');
        return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    };

    // Set editing date flag when editing starts
    useEffect(() => {
        if (!showListView && currentDate) {
            const dateString = formatDateString(currentDate);
            sessionStorage.setItem('calendar_editing_date', dateString);
            console.log('📝 Set editing date flag:', dateString);
        } else {
            sessionStorage.removeItem('calendar_editing_date');
        }
        
        return () => {
            // Clear on unmount
            sessionStorage.removeItem('calendar_editing_date');
        };
    }, [currentDate, showListView]);
    
    // Load note when currentDate changes (when navigating back to a date)
    useEffect(() => {
        if (currentDate && !showListView) {
            const dateString = formatDateString(currentDate);
            const user = window.storage?.getUser?.();
            const userId = user?.id || user?.email || 'default';
            const notesKey = `user_notes_${userId}`;
            const localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
            let note = localNotes[dateString] || notes[dateString] || '';
            
            // Clean &nbsp; entities from loaded note
            note = cleanHtmlContent(note);
            
            console.log('📝 Loading note for currentDate:', dateString, 'from localStorage length:', note.length);
            
            if (note) {
                setCurrentNote(note);
                setCurrentNoteHtml(note);
                console.log('📝 Set note state for currentDate, length:', note.length);
                
                // Set editor content if available
                if (editorRef.current) {
                    setEditorContentSafely(note);
                    console.log('✅ Set editor content for currentDate, length:', note.length);
                } else {
                    setTimeout(() => {
                        if (editorRef.current) {
                            setEditorContentSafely(note);
                            console.log('✅ Set editor content for currentDate (delayed), length:', note.length);
                        }
                    }, 100);
                }
            } else {
                // Clear if no note found
                setCurrentNote('');
                setCurrentNoteHtml('');
                if (editorRef.current) {
                    setEditorContentSafely('');
                }
            }
            
            // Also fetch from server
            const token = window.storage?.getToken?.();
            if (token) {
                fetch(`/api/calendar-notes?t=${Date.now()}`, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include'
                })
                .then(res => res.json())
                .then(data => {
                    const serverNotes = data?.data?.notes || data?.notes || {};
                    let serverNote = serverNotes[dateString] || '';
                    serverNote = cleanHtmlContent(serverNote);
                    
                    if (serverNote && serverNote !== note) {
                        console.log('📝 Found server note for currentDate, length:', serverNote.length);
                        setCurrentNote(serverNote);
                        setCurrentNoteHtml(serverNote);
                        setNotes(prev => ({ ...prev, [dateString]: serverNote }));
                        localNotes[dateString] = serverNote;
                        localStorage.setItem(notesKey, JSON.stringify(localNotes));
                        
                        if (editorRef.current) {
                            setEditorContentSafely(serverNote);
                        }
                    }
                })
                .catch(err => console.error('Error fetching note for currentDate:', err));
            }
        }
    }, [currentDate, showListView]);
    
    // Load notes
    useEffect(() => {
        const loadNotes = async () => {
            setIsLoading(true);
            try {
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const token = window.storage?.getToken?.();
                
                // First load from localStorage for instant display
                const localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                // Clean &nbsp; entities from all notes in localStorage
                const cleanedLocalNotes = {};
                Object.keys(localNotes).forEach(key => {
                    cleanedLocalNotes[key] = cleanHtmlContent(localNotes[key]);
                });
                
                if (Object.keys(cleanedLocalNotes).length > 0) {
                    setNotes(cleanedLocalNotes);
                    console.log('📝 Loaded notes from localStorage:', Object.keys(cleanedLocalNotes).length);
                    
                    // Load current note if editing specific date
                    if (!showListView && currentDate) {
                        const dateString = formatDateString(currentDate);
                        const note = cleanedLocalNotes[dateString] || '';
                        const currentEditorContent = editorRef.current?.innerHTML || '';
                        
                        // Load note if editor is empty or content is different
                        if (note && (!currentEditorContent || currentEditorContent.trim().length === 0)) {
                            setCurrentNote(note);
                            setCurrentNoteHtml(note);
                            console.log('📝 Loading note for date from localStorage:', dateString, 'length:', note.length);
                            
                            // Force set editor content immediately
                            if (editorRef.current) {
                                setEditorContentSafely(note);
                                console.log('✅ Set editor content from localStorage, length:', note.length);
                            }
                        } else if (note && currentEditorContent.trim() !== note.trim()) {
                            // Update if different
                            setCurrentNote(note);
                            setCurrentNoteHtml(note);
                            console.log('📝 Updating note from localStorage:', dateString, 'length:', note.length);
                            
                            // Force set editor content
                            if (editorRef.current) {
                                setEditorContentSafely(note);
                                console.log('✅ Updated editor content from localStorage, length:', note.length);
                            }
                        }
                    }
                }
                
                // Then sync from server
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
                        const rawServerNotes = data?.data?.notes || data?.notes || {};
                        // Clean &nbsp; entities from all server notes
                        const serverNotes = {};
                        Object.keys(rawServerNotes).forEach(key => {
                            serverNotes[key] = cleanHtmlContent(rawServerNotes[key]);
                        });
                        console.log('📝 Loaded notes from server:', Object.keys(serverNotes).length);
                        console.log('📝 Server notes keys:', Object.keys(serverNotes));
                        
                        // CRITICAL: Don't overwrite if there's unsaved content in editor
                        const dateString = formatDateString(currentDate);
                        const editorContent = editorRef.current?.innerHTML || '';
                        const hasUnsavedChanges = editorContent && editorContent.trim().length > 0;
                        
                        // Check if we're currently editing and have unsaved changes
                        if (!showListView && currentDate && hasUnsavedChanges) {
                            const lastSaved = sessionStorage.getItem(`last_saved_note_${dateString}`) || '';
                            // If editor has different content than last saved, don't overwrite
                            if (editorContent !== lastSaved) {
                                console.log('⚠️ Skipping server sync - unsaved changes in editor', {
                                    editorLength: editorContent.length,
                                    lastSavedLength: lastSaved.length,
                                    dateString
                                });
                                // Still update other dates, just not the current one
                                const mergedNotes = { ...cleanedLocalNotes, ...serverNotes };
                                // Preserve current editor content
                                mergedNotes[dateString] = editorContent;
                                setNotes(mergedNotes);
                                localStorage.setItem(notesKey, JSON.stringify(mergedNotes));
                                setIsLoading(false);
                                return;
                            }
                        }
                        
                        // Merge server notes (server takes priority)
                        const mergedNotes = { ...cleanedLocalNotes, ...serverNotes };
                        setNotes(mergedNotes);
                        
                        // Update localStorage with server data
                        localStorage.setItem(notesKey, JSON.stringify(mergedNotes));
                        
                        // Load current note if editing specific date - ONLY if we don't have newer content
                        if (!showListView && currentDate) {
                            let serverNote = serverNotes[dateString] || '';
                            const currentNoteContent = currentNoteHtml || currentNote;
                            
                            console.log('📝 Comparing notes for date:', dateString, {
                                serverLength: serverNote.length,
                                currentLength: currentNoteContent.length,
                                editorLength: editorContent.length,
                                areEqual: serverNote === currentNoteContent
                            });
                            
                            // Only update if server note exists and is different from current, or if current is empty
                            const shouldUpdate = serverNote && serverNote.length > 0 && 
                                (serverNote !== currentNoteContent || !currentNoteContent || currentNoteContent.length === 0) &&
                                (serverNote !== editorContent || !editorContent || editorContent.trim().length === 0);
                            
                            if (shouldUpdate) {
                                console.log('📝 Updating note from server, server length:', serverNote.length);
                                setCurrentNote(serverNote);
                                setCurrentNoteHtml(serverNote);
                            } else if (!serverNote || serverNote.length === 0) {
                                console.log('⚠️ Server note is empty for date:', dateString);
                            } else {
                                console.log('📝 Skipping update - current note is already set or editor has content');
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

    // Initialize handwriting canvas - overlay on editor
    useEffect(() => {
        if (showHandwriting && canvasRef.current && editorRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            const resizeCanvas = () => {
                if (!editorRef.current || !canvas) return;
                
                // Match editor dimensions exactly
                const editorRect = editorRef.current.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                
                // Set canvas size to match editor
                const width = editorRect.width;
                const height = editorRect.height;
                
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                canvas.style.width = width + 'px';
                canvas.style.height = height + 'px';
                
                // Scale context for high DPI displays
                ctx.scale(dpr, dpr);
                
                // Set drawing styles
                ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.globalAlpha = 1.0;
            };
            
            // Wait for editor to be positioned
            const initTimeout = setTimeout(() => {
                resizeCanvas();
                setHandwritingCanvas(canvas);
            }, 150);
            
            // Handle window resize and scroll
            const handleResize = () => {
                setTimeout(resizeCanvas, 50);
            };
            
            window.addEventListener('resize', handleResize);
            window.addEventListener('scroll', handleResize, true);
            
            return () => {
                clearTimeout(initTimeout);
                window.removeEventListener('resize', handleResize);
                window.removeEventListener('scroll', handleResize, true);
            };
        } else if (!showHandwriting && canvasRef.current) {
            // Clear canvas when handwriting is disabled
            const ctx = canvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }, [showHandwriting, isDark]);

    // Handle drawing on canvas
    const startDrawing = (e) => {
        if (!canvasRef.current || !showHandwriting) return;
        
        setIsDrawing(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        
        // Get coordinates relative to canvas
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Restore drawing styles (in case they were reset)
        ctx.strokeStyle = isDark ? '#ffffff' : '#000000';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        ctx.beginPath();
        ctx.moveTo(x, y);
        
        e.preventDefault();
        e.stopPropagation();
    };

    const draw = (e) => {
        if (!isDrawing || !canvasRef.current || !showHandwriting) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        
        // Get coordinates relative to canvas
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = (e) => {
        if (isDrawing) {
            setIsDrawing(false);
        }
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    // Recognize handwriting using OCR
    const recognizeHandwriting = async () => {
        if (!canvasRef.current) return;
        
        setIsRecognizing(true);
        try {
            // Convert canvas directly to blob (avoid CSP issues with data URIs)
            const blob = await new Promise((resolve, reject) => {
                canvasRef.current.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to convert canvas to blob'));
                    }
                }, 'image/png');
            });
            
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
                // Re-enable editor temporarily
                editorRef.current.contentEditable = 'true';
                editorRef.current.style.pointerEvents = 'auto';
                
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const textNode = document.createTextNode(text + ' ');
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    selection.removeAllRanges();
                    selection.addRange(range);
                } else {
                    // Fallback: append to end
                    const textNode = document.createTextNode(' ' + text);
                    editorRef.current.appendChild(textNode);
                }
                
                // Update note content and save
                updateNoteContent();
                
                // Save immediately after recognizing (also saves canvas drawing)
                setTimeout(() => {
                    console.log('💾 Saving after recognition (includes drawing)...');
                    saveNote().catch(err => console.error('Error saving after recognition:', err));
                }, 200); // Faster save after recognition
            } else {
                // Even if no text recognized, save the drawing itself
                setTimeout(() => {
                    console.log('💾 Saving drawing after recognition attempt...');
                    saveNote().catch(err => console.error('Error saving drawing:', err));
                }, 200);
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
        // Always allow updates - user typing should always work
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            setCurrentNoteHtml(html);
            // Strip HTML for plain text version (for search)
            const text = editorRef.current.innerText || editorRef.current.textContent || '';
            setCurrentNote(text);
        }
    }, []);
    
    // CRITICAL: Set editor content when editor ref becomes available or content changes
    useEffect(() => {
        // NEVER run this if user is typing - it will reset cursor
        const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
        if (isUserTypingRef.current || isUpdatingFromUserInputRef.current || timeSinceLastInput < 2000) {
            return;
        }
        
        if (!showListView && currentNoteHtml && currentNoteHtml.trim().length > 0) {
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
                if (editorRef.current) {
                    const currentContent = editorRef.current.innerHTML || '';
                    // Only set if editor is empty or content is different
                    if (currentContent.trim().length === 0 || currentContent.trim() !== currentNoteHtml.trim()) {
                        console.log('🔧 Setting editor content on mount/update - editor:', currentContent.length, 'state:', currentNoteHtml.length);
                        setEditorContentSafely(currentNoteHtml);
                        console.log('✅ Editor content set successfully, length:', currentNoteHtml.length);
                    }
                }
            });
        }
    }, [currentNoteHtml, showListView]);
    
    // Sync editor content with currentNoteHtml state (ensures editor displays saved content)
    useEffect(() => {
        if (!showListView && editorRef.current && currentNoteHtml !== undefined && currentNoteHtml !== null) {
            const currentEditorContent = editorRef.current.innerHTML || '';
            // Update if state has content and editor doesn't match, OR if editor is empty and state has content
            const shouldUpdate = (currentNoteHtml && currentNoteHtml.trim().length > 0) && 
                                (currentEditorContent.trim() !== currentNoteHtml.trim() || 
                                 (currentEditorContent.trim().length === 0 && currentNoteHtml.trim().length > 0));
            
            // CRITICAL: Don't sync if user is currently typing or just typed - preserve their input
            const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
            // Increased threshold to 4000ms to prevent sync interference after Enter key
            if (isUserTypingRef.current || isUpdatingFromUserInputRef.current || timeSinceLastInput < 4000) {
                console.log('⚠️ Skipping editor sync - user is actively typing or just typed', {
                    isTyping: isUserTypingRef.current,
                    isFromInput: isUpdatingFromUserInputRef.current,
                    timeSinceInput: timeSinceLastInput
                });
                return;
            }
            
            // Always sync during initialization to ensure content is loaded
            // After initialization, only sync if not initializing to avoid overwriting user input
            if (shouldUpdate) {
                console.log('🔄 Syncing editor - state has content, editor:', currentEditorContent.length, 'state:', currentNoteHtml.length, 'initializing:', isInitializingRef.current);
                
                // Use safe wrapper that preserves cursor position
                const wasInitializing = isInitializingRef.current;
                isInitializingRef.current = true;
                setEditorContentSafely(currentNoteHtml);
                console.log('✅ Editor synced with state, length:', currentNoteHtml.length);
                
                // Re-enable after editor has time to update
                setTimeout(() => {
                    isInitializingRef.current = wasInitializing;
                }, 300);
            }
        }
    }, [currentNoteHtml, showListView]);

    // Save note (including handwriting as image) - MUST be defined before useEffects that use it
    const saveNote = useCallback(async () => {
        setIsSaving(true);
        try {
            const dateString = formatDateString(currentDate);
            
            // Get content from editor first (most up-to-date)
            let noteContent = '';
            if (editorRef.current) {
                noteContent = editorRef.current.innerHTML || '';
                console.log('📝 Reading from editor for save, length:', noteContent.length);
            } else {
                noteContent = currentNoteHtml || currentNote || '';
                console.log('📝 Reading from state for save (editor not available), length:', noteContent.length);
            }
            
            // If editor is empty but state has content, use state (editor might not be synced yet)
            if (!noteContent || noteContent.trim().length === 0) {
                if (currentNoteHtml && currentNoteHtml.trim().length > 0) {
                    console.log('⚠️ Editor empty but state has content, using state for save, length:', currentNoteHtml.length);
                    noteContent = currentNoteHtml;
                } else if (currentNote && currentNote.trim().length > 0) {
                    console.log('⚠️ Editor empty but currentNote has content, using currentNote for save, length:', currentNote.length);
                    noteContent = currentNote;
                }
            }
            
            // Always save content, even if empty (user might have cleared it)
            // Only skip if we're in the very first 500ms of initialization to prevent saving initial empty state
            const initTime = window._dailyNotesInitTime || 0;
            if ((!noteContent || noteContent.trim().length === 0) && (Date.now() - initTime < 500)) {
                console.log('⚠️ Skipping save during first 500ms - content is empty (initialization)');
                setIsSaving(false);
                return;
            }
            
            // If content is empty, that means user cleared it - save it
            if (!noteContent) {
                noteContent = '';
            }
            
            // ALWAYS check for handwriting canvas content and save it
            // Check both when handwriting is enabled AND when disabled (to catch all drawings)
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                // Check if canvas has any drawing (more thorough check)
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasDrawing = imageData.data.some((channel, index) => {
                    return index % 4 !== 3 && channel !== 0; // Check non-alpha channels for non-zero values
                });
                
                if (hasDrawing) {
                    console.log('🎨 Found handwriting/drawing content, saving to note...');
                    // Convert canvas to data URL
                    const canvasDataUrl = canvas.toDataURL('image/png');
                    // Create image tag
                    const imgTag = `<img src="${canvasDataUrl}" alt="Handwriting" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
                    
                    // Check if image already exists in note content (to avoid duplicates)
                    const existingImgPattern = /<img[^>]*alt="Handwriting"[^>]*>/gi;
                    if (existingImgPattern.test(noteContent)) {
                        // Replace existing handwriting image
                        noteContent = noteContent.replace(existingImgPattern, imgTag);
                        console.log('🔄 Replaced existing handwriting image');
                    } else {
                        // Append handwriting image to content
                        noteContent = noteContent + (noteContent ? '<br/>' : '') + imgTag;
                        console.log('➕ Added handwriting image to note');
                    }
                    
                    // Update editor content with image
                    if (editorRef.current) {
                        // Check if editor already has the image
                        const editorHasImage = editorRef.current.innerHTML.includes(canvasDataUrl.substring(0, 50));
                        if (!editorHasImage) {
                            // Insert image at cursor position or append
                            const selection = window.getSelection();
                            if (selection.rangeCount > 0) {
                                const range = selection.getRangeAt(0);
                                const img = document.createElement('img');
                                img.src = canvasDataUrl;
                                img.alt = 'Handwriting';
                                img.style.maxWidth = '100%';
                                img.style.height = 'auto';
                                img.style.margin = '10px 0';
                                range.insertNode(img);
                                range.setStartAfter(img);
                                selection.removeAllRanges();
                                selection.addRange(range);
                            } else {
                                // Append to end
                                const img = document.createElement('img');
                                img.src = canvasDataUrl;
                                img.alt = 'Handwriting';
                                img.style.maxWidth = '100%';
                                img.style.height = 'auto';
                                img.style.margin = '10px 0';
                                editorRef.current.appendChild(img);
                            }
                            // Update content after inserting image
                            noteContent = editorRef.current.innerHTML;
                        }
                    }
                }
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('Not authenticated - saving locally only');
                // Save to localStorage as fallback
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                savedNotes[dateString] = noteContent;
                localStorage.setItem(notesKey, JSON.stringify(savedNotes));
                setIsSaving(false);
                return;
            }

            console.log('💾 Saving note:', { dateString, contentLength: noteContent.length });
            
            // Set save flag to prevent Calendar component from refreshing during save
            sessionStorage.setItem('calendar_is_saving', 'true');
            
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
                const response = await res.json();
                console.log('✅ Note save response received:', response);
                
                // The API wraps response in {data: {saved: true, note: ..., ...}}
                const data = response?.data || response;
                console.log('📋 Parsed response data:', data);
                
                // Verify the save was successful
                if (data?.saved === false || (data?.saved === undefined && !data?.note && !data?.id)) {
                    console.error('❌ Server indicated save failed:', data);
                    throw new Error(data?.message || 'Note save failed on server');
                }
                
                console.log('✅ Note saved successfully to server:', { 
                    dateString, 
                    contentLength: noteContent.length,
                    savedNoteId: data?.id,
                    saved: data?.saved
                });
                
                // Store last saved content to prevent duplicate saves
                sessionStorage.setItem(`last_saved_note_${dateString}`, noteContent);
                
                // Update local notes state immediately - CRITICAL for persistence
                setNotes(prev => {
                    const updated = { ...prev, [dateString]: noteContent };
                    console.log('📝 Updated notes state after save, date:', dateString, 'length:', noteContent.length);
                    return updated;
                });
                
                // Also save to localStorage - CRITICAL for persistence
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                savedNotes[dateString] = noteContent;
                localStorage.setItem(notesKey, JSON.stringify(savedNotes));
                console.log('💾 Saved to localStorage after server save, date:', dateString, 'length:', noteContent.length);
                
                // Verify the save by checking localStorage
                const verify = JSON.parse(localStorage.getItem(notesKey) || '{}');
                if (verify[dateString] === noteContent) {
                    console.log('✅ Verified: Note persisted to localStorage correctly');
                } else {
                    console.error('❌ Verification failed: localStorage content mismatch');
                }
                
                // Helper function to normalize HTML content for comparison
                // This handles HTML entity differences (like &nbsp; vs space) and whitespace
                const normalizeHtmlForComparison = (html) => {
                    if (!html) return '';
                    // Normalize HTML entities first
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = html;
                    // Get innerHTML which will have normalized entities
                    let normalized = tempDiv.innerHTML;
                    // Replace common HTML entities with their text equivalents
                    normalized = normalized.replace(/&nbsp;/g, ' ');
                    normalized = normalized.replace(/&amp;/g, '&');
                    normalized = normalized.replace(/&lt;/g, '<');
                    normalized = normalized.replace(/&gt;/g, '>');
                    normalized = normalized.replace(/&quot;/g, '"');
                    normalized = normalized.replace(/&#39;/g, "'");
                    // Normalize whitespace (multiple spaces/tabs/newlines to single space)
                    normalized = normalized.replace(/\s+/g, ' ');
                    // Trim leading/trailing whitespace
                    return normalized.trim();
                };

                // Verify the save by fetching from server after a short delay
                setTimeout(async () => {
                    try {
                        // Track retry attempts to prevent infinite loops
                        const retryKey = `note_verify_retry_${dateString}`;
                        const retryCount = parseInt(sessionStorage.getItem(retryKey) || '0', 10);
                        
                        if (retryCount >= 3) {
                            console.warn('⚠️ Max retry attempts reached for verification, accepting save as successful');
                            sessionStorage.removeItem(retryKey);
                            setIsSaving(false);
                            sessionStorage.removeItem('calendar_is_saving');
                            return;
                        }

                        const verifyRes = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                'Cache-Control': 'no-cache, no-store, must-revalidate'
                            },
                            credentials: 'include',
                            cache: 'no-store'
                        });
                        if (verifyRes.ok) {
                            const verifyData = await verifyRes.json();
                            const serverNotes = verifyData?.data?.notes || verifyData?.notes || {};
                            const serverNote = serverNotes[dateString] || '';
                            
                            // Normalize both contents for comparison
                            const normalizedLocal = normalizeHtmlForComparison(noteContent);
                            const normalizedServer = normalizeHtmlForComparison(serverNote);
                            
                            // Also do a direct comparison for exact matches
                            const exactMatch = serverNote === noteContent;
                            // And a normalized comparison for HTML entity differences
                            const normalizedMatch = normalizedLocal === normalizedServer;
                            
                            if (exactMatch || normalizedMatch) {
                                console.log('✅ Server verification: Note found on server with matching content');
                                sessionStorage.removeItem(retryKey);
                                // Update notes state with server data to ensure sync
                                setNotes(prev => ({ ...prev, [dateString]: serverNote || noteContent }));
                                setIsSaving(false);
                                sessionStorage.removeItem('calendar_is_saving');
                            } else if (serverNote) {
                                console.warn('⚠️ Server verification: Note found but content differs');
                                console.warn('   Expected (normalized):', normalizedLocal.substring(0, 50));
                                console.warn('   Got (normalized):', normalizedServer.substring(0, 50));
                                
                                // Only retry if content is significantly different (more than just whitespace/entities)
                                const significantDiff = Math.abs(normalizedLocal.length - normalizedServer.length) > 5 ||
                                                       normalizedLocal.substring(0, 20) !== normalizedServer.substring(0, 20);
                                
                                if (significantDiff && retryCount < 2) {
                                    sessionStorage.setItem(retryKey, String(retryCount + 1));
                                    console.log(`🔄 Retrying save due to content mismatch (attempt ${retryCount + 1}/3)...`);
                                    setTimeout(() => {
                                        saveNote().catch(err => console.error('Retry save error:', err));
                                    }, 500);
                                } else {
                                    // Accept the server version if differences are minor
                                    console.log('✅ Accepting server version (differences are minor)');
                                    setNotes(prev => ({ ...prev, [dateString]: serverNote }));
                                    sessionStorage.removeItem(retryKey);
                                    setIsSaving(false);
                                    sessionStorage.removeItem('calendar_is_saving');
                                }
                            } else {
                                console.error('❌ Server verification: Note not found on server!');
                                console.error('   Date:', dateString);
                                console.error('   Server notes keys:', Object.keys(serverNotes));
                                
                                // Only retry if we haven't exceeded retry limit
                                if (retryCount < 2) {
                                    sessionStorage.setItem(retryKey, String(retryCount + 1));
                                    console.log(`🔄 Retrying save - note not found on server (attempt ${retryCount + 1}/3)...`);
                                    setTimeout(() => {
                                        saveNote().catch(err => console.error('Retry save error:', err));
                                    }, 1000);
                                } else {
                                    console.warn('⚠️ Max retries reached, accepting save as successful');
                                    sessionStorage.removeItem(retryKey);
                                    setIsSaving(false);
                                    sessionStorage.removeItem('calendar_is_saving');
                                }
                            }
                        } else {
                            console.error('❌ Verification request failed:', verifyRes.status);
                            setIsSaving(false);
                            sessionStorage.removeItem('calendar_is_saving');
                        }
                    } catch (verifyError) {
                        console.error('Error verifying save on server:', verifyError);
                        setIsSaving(false);
                        sessionStorage.removeItem('calendar_is_saving');
                    }
                }, 2000); // Increased delay to 2 seconds to ensure database write completes
                
                // Clear handwriting canvas after saving
                if (showHandwriting && canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                }
                
                // Clear save flag after a delay to allow server to process
                setTimeout(() => {
                    sessionStorage.removeItem('calendar_is_saving');
                    console.log('✅ Save flag cleared - Calendar refresh can resume');
                }, 3000); // Wait 3 seconds before allowing refresh
            } else {
                const errorText = await res.text();
                console.error('❌ Failed to save note:', res.status, errorText);
                sessionStorage.removeItem('calendar_is_saving');
                throw new Error(`Failed to save note: ${res.status}`);
            }
        } catch (error) {
            console.error('Error saving note:', error);
            sessionStorage.removeItem('calendar_is_saving');
            // Try to save to localStorage as fallback
            try {
                const dateString = formatDateString(currentDate);
                const noteContent = currentNoteHtml || currentNote;
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                savedNotes[dateString] = noteContent;
                localStorage.setItem(notesKey, JSON.stringify(savedNotes));
                console.log('💾 Saved to localStorage as fallback');
            } catch (localError) {
                console.error('Failed to save to localStorage:', localError);
            }
        } finally {
            setIsSaving(false);
        }
    }, [currentDate, currentNoteHtml, currentNote, showHandwriting, isDark]);
    
    // Auto-save on content change (debounced)
    const saveTimeoutRef = useRef(null);
    const isInitializingRef = useRef(true);
    
    // Mark initialization as complete after editor content is loaded (faster)
    useEffect(() => {
        if (!showListView && currentDate) {
            isInitializingRef.current = true;
            window._dailyNotesInitTime = Date.now();
            console.log('🔒 Initialization started - auto-save will enable quickly');
            
            // Wait for editor to be ready and content to be set (very short delay)
            const checkEditorReady = () => {
                if (editorRef.current) {
                    // Editor is ready - enable auto-save very quickly (300ms)
                    setTimeout(() => {
                        isInitializingRef.current = false;
                        console.log('✅ Initialization complete - editor ready, auto-save enabled');
                    }, 300); // Reduced to 300ms for faster auto-save
                } else {
                    // Fallback: disable initialization after 500ms (very fast)
                    setTimeout(() => {
                        isInitializingRef.current = false;
                        console.log('✅ Initialization timeout - auto-save enabled');
                    }, 500); // Reduced to 500ms
                }
            };
            
            const timer = setTimeout(checkEditorReady, 100); // Reduced to 100ms
            return () => clearTimeout(timer);
        } else {
            // If switching to list view, reset initialization flag
            isInitializingRef.current = false;
        }
    }, [currentDate, showListView]);
    
    // Auto-save: Watch for editor content changes directly with interval + MutationObserver
    useEffect(() => {
        if (!currentDate || showListView || !editorRef.current) {
            return;
        }
        
        const dateString = formatDateString(currentDate);
        let lastSavedContent = sessionStorage.getItem(`last_saved_note_${dateString}`) || '';
        let lastCheckedContent = '';
        let saveInProgress = false;
        let debounceTimer = null;
        
        // Function to check and save if needed
        const checkAndSave = () => {
            if (!editorRef.current || saveInProgress) {
                return;
            }
            
            // Check if we're still initializing (with shorter timeout)
            const initTime = window._dailyNotesInitTime || 0;
            if (Date.now() - initTime < 500) {
                // Only skip during first 500ms of initialization
                return;
            }
            
            const editorContent = editorRef.current.innerHTML || '';
            
            // Save if content has changed (even if empty - user might have cleared it)
            if (editorContent !== lastSavedContent && editorContent !== lastCheckedContent) {
                lastCheckedContent = editorContent;
                saveInProgress = true;
                
                console.log('💾 Auto-saving note (detected change)...', { 
                    contentLength: editorContent.length, 
                    dateString,
                    isEmpty: !editorContent || editorContent.trim().length === 0
                });
                saveNote().then(() => {
                    lastSavedContent = editorContent;
                    sessionStorage.setItem(`last_saved_note_${dateString}`, editorContent);
                    saveInProgress = false;
                    console.log('✅ Auto-save completed successfully');
                }).catch(err => {
                    console.error('❌ Auto-save error:', err);
                    saveInProgress = false;
                });
            }
        };
        
        // Debounced save function - ultra instant
        const debouncedSave = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                checkAndSave();
            }, 100); // Save 100ms after typing stops (ultra instant, nearly real-time)
        };
        
        // Set up MutationObserver to watch for editor changes
        const observer = new MutationObserver(() => {
            // Trigger debounced save on any change
            debouncedSave();
        });
        
        // Observe the editor for changes
        observer.observe(editorRef.current, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: false
        });
        
        // Also set up interval as backup (every 1 second to catch any missed changes)
        const autoSaveInterval = setInterval(() => {
            // Only skip first 300ms of initialization
            const initTime = window._dailyNotesInitTime || 0;
            if (Date.now() - initTime < 300) {
                return;
            }
            
            checkAndSave();
        }, 1000); // Check every 1 second as backup (very frequent)
        
        return () => {
            observer.disconnect();
            clearInterval(autoSaveInterval);
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
        };
    }, [currentDate, showListView, saveNote]);
    
    // Also auto-save on state changes (backup mechanism)
    useEffect(() => {
        if (!currentDate || showListView) {
            return;
        }
        
        // Reduced initialization wait - only skip first 200ms
        const initTime = window._dailyNotesInitTime || 0;
        if (Date.now() - initTime < 200) {
            return;
        }
        
        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        // Get content from editor (most current)
        const editorContent = editorRef.current?.innerHTML || '';
        const hasContent = (editorContent && editorContent.trim().length > 0) || 
                          (currentNoteHtml && currentNoteHtml.trim().length > 0);
        
        if (!hasContent) {
            return;
        }
        
        // Set new timeout for auto-save (500ms after last change for ultra-fast saves)
        saveTimeoutRef.current = setTimeout(() => {
            console.log('💾 Auto-saving note (state change backup)...');
            saveNote().catch(err => console.error('Auto-save error:', err));
        }, 500); // Ultra-fast - 500ms after state change
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [currentNoteHtml, currentDate, showListView, saveNote]);
    
    // Save drawing when handwriting is disabled or when drawing stops
    useEffect(() => {
        // Allow auto-save immediately - user actions should always save
        if (!showHandwriting && canvasRef.current) {
            // If we just disabled handwriting, check if there was drawing
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            // Check a larger sample to see if there's actual drawing
            const sampleWidth = Math.min(canvas.width, 200);
            const sampleHeight = Math.min(canvas.height, 200);
            const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
            const hasDrawing = imageData.data.some((channel, index) => {
                return index % 4 !== 3 && channel !== 0;
            });
            
            // Also check if editor has content
            const editorContent = editorRef.current?.innerHTML || '';
            const hasEditorContent = editorContent && editorContent.trim().length > 0;
            
            if (hasDrawing || hasEditorContent) {
                // Save immediately when handwriting is disabled (if there was drawing)
                setTimeout(() => {
                    console.log('💾 Saving after handwriting disabled...', { hasDrawing, hasEditorContent, editorLength: editorContent.length });
                    saveNote().catch(err => console.error('Error saving after handwriting:', err));
                }, 200); // Faster save - 200ms after disabling handwriting
            } else {
                console.log('⚠️ Skipping save after handwriting disabled - no drawing or editor content');
            }
        }
    }, [showHandwriting, saveNote]);
    
    // Save when drawing stops (after a delay)
    const drawingTimeoutRef = useRef(null);
    useEffect(() => {
        // Allow auto-save immediately - user drawing should always save
        if (!isDrawing && showHandwriting && canvasRef.current) {
            // Drawing just stopped - check if there's actual drawing content
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            
            // Check a larger sample to see if there's actual drawing
            const sampleWidth = Math.min(canvas.width, 200);
            const sampleHeight = Math.min(canvas.height, 200);
            const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
            const hasDrawing = imageData.data.some((channel, index) => {
                return index % 4 !== 3 && channel !== 0;
            });
            
            // Also check if editor has content
            const editorContent = editorRef.current?.innerHTML || '';
            const hasEditorContent = editorContent && editorContent.trim().length > 0;
            
            if (hasDrawing || hasEditorContent) {
                // Drawing or editor content exists - save after a short delay
                if (drawingTimeoutRef.current) {
                    clearTimeout(drawingTimeoutRef.current);
                }
                drawingTimeoutRef.current = setTimeout(() => {
                    console.log('💾 Auto-saving drawing...', { hasDrawing, hasEditorContent, editorLength: editorContent.length });
                    saveNote().catch(err => console.error('Error saving drawing:', err));
                }, 300); // Faster save for drawings - 300ms after drawing stops
            } else {
                console.log('⚠️ Skipping drawing auto-save - no drawing or editor content');
            }
        }
        
        return () => {
            if (drawingTimeoutRef.current) {
                clearTimeout(drawingTimeoutRef.current);
            }
        };
    }, [isDrawing, showHandwriting, saveNote]);
    
    // Save on page unload (using visibilitychange for better reliability)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && currentNoteHtml && !showListView) {
                // Page is being hidden - save immediately
                const dateString = formatDateString(currentDate);
                const noteContent = currentNoteHtml || currentNote;
                const token = window.storage?.getToken?.();
                
                if (token && noteContent) {
                    // Use fetch with keepalive for reliable save
                    fetch('/api/calendar-notes', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            date: dateString,
                            note: noteContent
                        }),
                        keepalive: true
                    }).catch(err => console.error('Error saving on page hide:', err));
                }
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [currentNoteHtml, currentDate, showListView, currentNote]);

    // Delete note function - can accept optional dateString parameter for list view
    const deleteNote = async (dateStringParam = null) => {
        const dateString = dateStringParam || formatDateString(currentDate);
        const confirmDelete = window.confirm(`Are you sure you want to delete the note for ${formatDateDisplay(dateString)}?`);
        
        if (!confirmDelete) {
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('Not authenticated - cannot delete note');
                return;
            }
            
            console.log('🗑️ Deleting note for date:', dateString);
            
            const res = await fetch(`/api/calendar-notes/${dateString}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                credentials: 'include'
            });
            
            if (res.ok) {
                console.log('✅ Note deleted successfully');
                
                // Update local state
                setNotes(prev => {
                    const updated = { ...prev };
                    delete updated[dateString];
                    return updated;
                });
                
                // Update localStorage
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                delete savedNotes[dateString];
                localStorage.setItem(notesKey, JSON.stringify(savedNotes));
                
                // Clear editor only if deleting current note
                if (!dateStringParam || dateString === formatDateString(currentDate)) {
                    setCurrentNote('');
                    setCurrentNoteHtml('');
                    if (editorRef.current) {
                        setEditorContentSafely('');
                    }
                }
                
                // Show notification
                if (window.showNotification) {
                    window.showNotification('Note deleted successfully', 'success');
                }
            } else {
                const errorText = await res.text();
                console.error('❌ Failed to delete note:', res.status, errorText);
                alert('Failed to delete note. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            alert('Error deleting note: ' + error.message);
        }
    };
    
    // Navigate to previous day
    const goToPreviousDay = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 1);
        const dateString = formatDateString(newDate);
        openNote(dateString);
    };
    
    // Navigate to next day
    const goToNextDay = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 1);
        const dateString = formatDateString(newDate);
        openNote(dateString);
    };
    
    // Open note for editing
    const openNote = async (dateString) => {
        const date = new Date(dateString + 'T00:00:00Z');
        setCurrentDate(date);
        setShowListView(false);
        
        // Reset initialization flag for new note
        isInitializingRef.current = true;
        
        // First check localStorage for instant display
        const user = window.storage?.getUser?.();
        const userId = user?.id || user?.email || 'default';
        const notesKey = `user_notes_${userId}`;
        const localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
        let note = localNotes[dateString] || notes[dateString] || '';
        
        console.log('📝 Opening note for date:', dateString, 'from localStorage length:', note.length);
        
        // Set initial content
        setCurrentNote(note);
        setCurrentNoteHtml(note);
        console.log('📝 Set note state for openNote, length:', note.length);
        
        // Set editor content immediately if available
        if (note && editorRef.current) {
            // Force set editor content immediately
            setEditorContentSafely(note);
            console.log('✅ Set editor content immediately on open, length:', note.length);
        } else if (note) {
            // If editor not ready yet, wait a bit and try again
            setTimeout(() => {
                if (editorRef.current) {
                    setEditorContentSafely(note);
                    console.log('✅ Set editor content on open (delayed), length:', note.length);
                }
            }, 100);
        }
        
        // Also try to fetch fresh from server
        try {
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
                    const serverNote = serverNotes[dateString] || '';
                    
                    console.log('📝 Server note for date:', dateString, 'length:', serverNote.length);
                    
                    if (serverNote && serverNote !== note) {
                        // Always use server version if available and different
                        note = serverNote;
                        setCurrentNote(note);
                        setCurrentNoteHtml(note);
                        // Update notes state and localStorage
                        setNotes(prev => ({ ...prev, [dateString]: note }));
                        localNotes[dateString] = note;
                        localStorage.setItem(notesKey, JSON.stringify(localNotes));
                        console.log('📝 Loaded fresh note from server:', dateString, 'length:', note.length);
                        
                        // Update editor with server content immediately
                        if (editorRef.current) {
                            setEditorContentSafely(note);
                            console.log('✅ Updated editor with server note immediately, length:', note.length);
                        } else {
                            // If editor not ready, wait and try again
                            setTimeout(() => {
                                if (editorRef.current) {
                                    setEditorContentSafely(note);
                                    console.log('✅ Updated editor with server note (delayed), length:', note.length);
                                }
                            }, 200);
                        }
                    } else if (!serverNote) {
                        console.log('⚠️ No server note found for date:', dateString);
                    } else {
                        console.log('✅ Server note matches local note');
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching note:', error);
        }
    };

    // Rich text formatting commands
    const execCommand = (command, value = null) => {
        if (!editorRef.current) return;
        
        // Ensure editor is focused
        editorRef.current.focus();
        
        // Get current selection
        const selection = window.getSelection();
        let range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        
        // For list commands, use a more reliable approach
        if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
            const listType = command === 'insertUnorderedList' ? 'ul' : 'ol';
            const selectedText = selection.toString();
            
            // If there's selected text, convert it to a list
            if (selectedText && selectedText.trim()) {
                // Split by lines and create list items
                const lines = selectedText.split('\n').filter(line => line.trim());
                
                if (lines.length > 0) {
                    // Create list element
                    const list = document.createElement(listType);
                    
                    lines.forEach(line => {
                        const li = document.createElement('li');
                        li.textContent = line.trim();
                        list.appendChild(li);
                    });
                    
                    // Delete selected content and insert list
                    if (range) {
                        range.deleteContents();
                        range.insertNode(list);
                    } else {
                        // No range - insert at cursor position
                        const currentRange = window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0) : null;
                        if (currentRange) {
                            currentRange.insertNode(list);
                        } else {
                            // Fallback: append to editor
                            editorRef.current.appendChild(list);
                        }
                    }
                    
                    // Move cursor after the list
                    const newRange = document.createRange();
                    newRange.setStartAfter(list);
                    newRange.setEndAfter(list);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                    
                    // Update content
                    updateNoteContent();
                    editorRef.current.focus();
                    
                    // Trigger input event for auto-save
                    const inputEvent = new Event('input', { bubbles: true });
                    editorRef.current.dispatchEvent(inputEvent);
                    return;
                }
            } else {
                // No selection - create empty list item at cursor
                const list = document.createElement(listType);
                const li = document.createElement('li');
                li.innerHTML = '<br>'; // Use <br> to ensure list item is visible
                list.appendChild(li);
                
                // Insert at cursor position
                if (range) {
                    if (!range.collapsed) {
                        range.deleteContents();
                    }
                    range.insertNode(list);
                } else {
                    // No range - try to get current selection
                    const currentRange = window.getSelection().rangeCount > 0 ? window.getSelection().getRangeAt(0) : null;
                    if (currentRange) {
                        currentRange.insertNode(list);
                    } else {
                        // Fallback: append to editor
                        editorRef.current.appendChild(list);
                    }
                }
                
                // Move cursor into the list item
                const newRange = document.createRange();
                const newLi = list.querySelector('li');
                if (newLi) {
                    newRange.setStart(newLi, 0);
                    newRange.setEnd(newLi, 0);
                    selection.removeAllRanges();
                    selection.addRange(newRange);
                }
                
                // Update content
                updateNoteContent();
                editorRef.current.focus();
                
                // Trigger input event for auto-save
                const inputEvent = new Event('input', { bubbles: true });
                editorRef.current.dispatchEvent(inputEvent);
                return;
            }
        }
        
        // For other commands, use execCommand
        try {
            const success = document.execCommand(command, false, value);
            if (!success) {
                console.warn(`Command ${command} failed`);
            }
        } catch (error) {
            console.error(`Error executing command ${command}:`, error);
        }
        
        // Update content after command
        editorRef.current.focus();
        updateNoteContent();
        
        // Trigger input event to ensure auto-save
        const inputEvent = new Event('input', { bubbles: true });
        editorRef.current.dispatchEvent(inputEvent);
    };

    // Save cursor position in contentEditable using text offset (more reliable than node references)
    const saveCursorPosition = () => {
        if (!editorRef.current) return;
        const selection = window.getSelection();
        if (selection.rangeCount > 0 && editorRef.current.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            // Create a range from start of editor to cursor position to count characters
            const preCaretRange = range.cloneRange();
            preCaretRange.selectNodeContents(editorRef.current);
            preCaretRange.setEnd(range.endContainer, range.endOffset);
            const offset = preCaretRange.toString().length;
            
            editorCursorPositionRef.current = offset;
            console.log('💾 Saved cursor position:', offset, 'editor length:', editorRef.current.innerText.length);
        } else {
            console.warn('⚠️ Could not save cursor position - no selection or selection outside editor');
        }
    };
    
    // Restore cursor position in contentEditable using text offset
    const restoreCursorPosition = () => {
        if (!editorRef.current || editorCursorPositionRef.current === null || editorCursorPositionRef.current === undefined) {
            console.warn('⚠️ Cannot restore cursor - no ref or position:', {
                hasRef: !!editorRef.current,
                position: editorCursorPositionRef.current
            });
            return;
        }
        
        try {
            const selection = window.getSelection();
            const range = document.createRange();
            const textOffset = editorCursorPositionRef.current;
            const editorLength = editorRef.current.innerText.length;
            
            console.log('🔄 Attempting to restore cursor:', {
                savedOffset: textOffset,
                editorLength: editorLength,
                canRestore: textOffset <= editorLength
            });
            
            // Find the text node and offset that corresponds to the saved character position
            let currentOffset = 0;
            const walker = document.createTreeWalker(
                editorRef.current,
                NodeFilter.SHOW_TEXT,
                null
            );
            
            let node;
            let targetNode = null;
            let targetOffset = 0;
            
            while (node = walker.nextNode()) {
                const nodeLength = node.textContent.length;
                if (currentOffset + nodeLength >= textOffset) {
                    targetNode = node;
                    targetOffset = textOffset - currentOffset;
                    break;
                }
                currentOffset += nodeLength;
            }
            
            if (targetNode) {
                range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
                range.setEnd(targetNode, Math.min(targetOffset, targetNode.textContent.length));
                selection.removeAllRanges();
                selection.addRange(range);
                editorRef.current.focus();
                console.log('✅ Cursor restored to position:', textOffset);
            } else {
                // Fallback: place cursor at end
                console.warn('⚠️ Target node not found, placing cursor at end');
                range.selectNodeContents(editorRef.current);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
                editorRef.current.focus();
            }
        } catch (error) {
            console.error('❌ Error restoring cursor position:', error);
            // If restoration fails, just focus the editor
            if (editorRef.current) {
                editorRef.current.focus();
            }
        }
    };
    
    // Safe wrapper to set innerHTML while preserving cursor position
    const setEditorContentSafely = (html) => {
        if (!editorRef.current) return;
        
        // Skip cursor save/restore if Enter was just pressed (cursor is already in correct position)
        const skipCursorRestore = justPressedEnterRef.current;
        
        if (!skipCursorRestore) {
            // Always save cursor position before any innerHTML update
            saveCursorPosition();
        }
        
        // Set the content
        editorRef.current.innerHTML = html;
        
        // Only restore cursor if Enter was NOT just pressed
        if (!skipCursorRestore) {
            // Always restore cursor position after innerHTML update
            // Use double RAF to ensure DOM is fully updated
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    restoreCursorPosition();
                });
            });
        }
    };
    
    // Handle editor input - always update content and trigger auto-save immediately
    const handleEditorInput = () => {
        // Mark that user is actively typing - this prevents sync useEffect from interfering
        isUserTypingRef.current = true;
        lastUserInputTimeRef.current = Date.now();
        isUpdatingFromUserInputRef.current = true;
        
        // Clear typing flag after a longer delay to ensure sync doesn't interfere
        setTimeout(() => {
            isUserTypingRef.current = false;
            isUpdatingFromUserInputRef.current = false;
        }, 3000);
        
        // Force update immediately - user typing should always work
        if (editorRef.current) {
            // Skip cursor save/restore if Enter was just pressed (cursor is already in correct position)
            const skipCursorRestore = justPressedEnterRef.current;
            if (skipCursorRestore) {
                // Clear the flag after a short delay (but longer than input handler's delay)
                setTimeout(() => {
                    justPressedEnterRef.current = false;
                }, 200);
            } else {
                // Save cursor position BEFORE reading innerHTML (which might trigger re-render)
                saveCursorPosition();
            }
            
            let html = editorRef.current.innerHTML;
            // Clean &nbsp; entities from editor content
            html = cleanHtmlContent(html);
            
            // Update state - mark that this is from user input
            setCurrentNoteHtml(html);
            // Strip HTML for plain text version (for search)
            const text = editorRef.current.innerText || editorRef.current.textContent || '';
            setCurrentNote(text);
            
            // Only restore cursor if Enter was NOT just pressed
            if (!skipCursorRestore) {
                // Restore cursor position after state update - use multiple attempts
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        restoreCursorPosition();
                        // Try again after a short delay to ensure it sticks
                        setTimeout(() => {
                            restoreCursorPosition();
                        }, 10);
                    });
                });
            }
            
            // Trigger auto-save ultra instantly (100ms debounce for nearly real-time saves)
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(() => {
                if (editorRef.current) {
                    // Check initialization timeout (only skip first 200ms)
                    const initTime = window._dailyNotesInitTime || 0;
                    if (Date.now() - initTime < 200) {
                        console.log('⏸️ Input handler auto-save skipped - still initializing');
                        return;
                    }
                    
                    const editorContent = editorRef.current.innerHTML || '';
                    // Always save if there's any change (even empty content after user clears)
                    console.log('💾 Auto-saving note (from input handler)...', { 
                        contentLength: editorContent.length,
                        isEmpty: !editorContent || editorContent.trim().length === 0
                    });
                    saveNote().catch(err => {
                        console.error('❌ Auto-save error from input handler:', err);
                        // Retry once after 300ms
                        setTimeout(() => {
                            console.log('🔄 Retrying auto-save after error...');
                            saveNote().catch(retryErr => console.error('❌ Retry auto-save failed:', retryErr));
                        }, 300);
                    });
                }
            }, 100); // Ultra instant auto-save - 100ms after typing stops (nearly real-time)
        }
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
                                setEditorContentSafely('');
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
                                    className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-lg p-4 transition-colors`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div 
                                            onClick={() => openNote(dateString)}
                                            className="flex-1 cursor-pointer"
                                        >
                                            <h3 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {formatDateDisplay(dateString)}
                                            </h3>
                                            <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                {dateString}
                                            </span>
                                        </div>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(`Delete note for ${formatDateDisplay(dateString)}?`)) {
                                                    deleteNote(dateString);
                                                }
                                            }}
                                            className={`${isDark ? 'text-red-400 hover:text-red-300 hover:bg-gray-700' : 'text-red-600 hover:text-red-700 hover:bg-red-50'} p-2 rounded-lg transition-colors ml-2`}
                                            title="Delete note"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                    <div 
                                        onClick={() => openNote(dateString)}
                                        className="cursor-pointer"
                                    >
                                        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'} line-clamp-3`}>
                                            {note.length > 200 ? note.substring(0, 200) + '...' : note}
                                        </p>
                                    </div>
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
                        title="Back to list"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    
                    {/* Date Navigation */}
                    <button
                        onClick={goToPreviousDay}
                        className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded-lg transition-colors`}
                        title="Previous day"
                    >
                        <i className="fas fa-chevron-left"></i>
                    </button>
                    
                    <div className="text-center">
                        <h1 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            {formatDateDisplay(formatDateString(currentDate))}
                        </h1>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {formatDateString(currentDate)}
                        </p>
                    </div>
                    
                    <button
                        onClick={goToNextDay}
                        className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded-lg transition-colors`}
                        title="Next day"
                    >
                        <i className="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div className="flex items-center space-x-2">
                    {isSaving && (
                        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>Auto-saving...</span>
                        </div>
                    )}
                    <button
                        onClick={() => {
                            const dateString = formatDateString(currentDate);
                            const hasNote = notes[dateString] && notes[dateString].trim().length > 0;
                            if (hasNote || currentNoteHtml || (editorRef.current && editorRef.current.innerHTML.trim().length > 0)) {
                                deleteNote();
                            } else {
                                alert('No note to delete for this date.');
                            }
                        }}
                        className={`${isDark ? 'text-red-400 hover:text-red-300 hover:bg-gray-700' : 'text-red-600 hover:text-red-700 hover:bg-red-50'} px-3 py-2 rounded-lg transition-colors font-medium flex items-center space-x-2`}
                        title="Delete note"
                    >
                        <i className="fas fa-trash"></i>
                        <span className="text-sm">Delete</span>
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
                    onClick={() => {
                        const newHandwritingState = !showHandwriting;
                        setShowHandwriting(newHandwritingState);
                        // When enabling handwriting, disable contentEditable temporarily
                        if (editorRef.current) {
                            if (newHandwritingState) {
                                editorRef.current.style.pointerEvents = 'none';
                                editorRef.current.contentEditable = 'false';
                            } else {
                                editorRef.current.style.pointerEvents = 'auto';
                                editorRef.current.contentEditable = 'true';
                            }
                        }
                    }}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${showHandwriting ? 'bg-blue-100 text-blue-600' : isDark ? 'text-gray-300' : 'text-gray-700'}`}
                    title={showHandwriting ? 'Disable Handwriting' : 'Enable Handwriting'}
                >
                    <i className="fas fa-pen"></i>
                </button>
                <div className={`w-px h-6 ${isDark ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                <button
                    onClick={() => {
                        const dateString = formatDateString(currentDate);
                        const hasNote = notes[dateString] && notes[dateString].trim().length > 0;
                        if (hasNote || currentNoteHtml || (editorRef.current && editorRef.current.innerHTML.trim().length > 0)) {
                            deleteNote();
                        } else {
                            alert('No note to delete for this date.');
                        }
                    }}
                    className={`p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 ${isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700'}`}
                    title="Delete note"
                >
                    <i className="fas fa-trash"></i>
                </button>
            </div>

            {/* Editor Area with integrated handwriting */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Add CSS for list styling */}
                <style>{`
                    .daily-notes-editor ul,
                    .daily-notes-editor ol {
                        margin: 0.5rem 0;
                        padding-left: 2rem;
                        list-style-position: outside;
                    }
                    .daily-notes-editor ul {
                        list-style-type: disc;
                    }
                    .daily-notes-editor ol {
                        list-style-type: decimal;
                    }
                    .daily-notes-editor li {
                        margin: 0.25rem 0;
                        padding-left: 0.5rem;
                    }
                    .daily-notes-editor ul ul,
                    .daily-notes-editor ol ol,
                    .daily-notes-editor ul ol,
                    .daily-notes-editor ol ul {
                        margin-top: 0.25rem;
                        margin-bottom: 0.25rem;
                    }
                `}</style>
                {/* Rich Text Editor with handwriting overlay */}
                <div className="flex-1 p-4 overflow-y-auto relative">
                    <div
                        ref={(el) => {
                            // CRITICAL: Only set ref, NEVER update content here - ref callback runs on every render!
                            // Updating content here causes cursor to jump because it runs during typing
                            editorRef.current = el;
                        }}
                        contentEditable
                        onInput={handleEditorInput}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                            // Handle Enter key to ensure it creates a new line
                            if (e.key === 'Enter' || e.keyCode === 13) {
                                // Prevent default to handle Enter ourselves
                                e.preventDefault();
                                
                                // CRITICAL: Set typing flags BEFORE any operations to prevent sync interference
                                isUserTypingRef.current = true;
                                lastUserInputTimeRef.current = Date.now();
                                isUpdatingFromUserInputRef.current = true;
                                
                                // CRITICAL: Set flag to prevent cursor restoration in input handler
                                justPressedEnterRef.current = true;
                                
                                // Save cursor position before Enter key
                                saveCursorPosition();
                                
                                // Insert a line break
                                const selection = window.getSelection();
                                if (selection.rangeCount > 0) {
                                    const range = selection.getRangeAt(0);
                                    
                                    // Try execCommand first (most compatible)
                                    try {
                                        const success = document.execCommand('insertLineBreak', false, null);
                                        if (!success) {
                                            // Fallback: insert a <br> tag
                                            const br = document.createElement('br');
                                            if (!range.collapsed) {
                                                range.deleteContents();
                                            }
                                            range.insertNode(br);
                                            // Move cursor after the <br>
                                            range.setStartAfter(br);
                                            range.collapse(true);
                                            selection.removeAllRanges();
                                            selection.addRange(range);
                                        }
                                    } catch (err) {
                                        // Fallback: insert a <br> tag
                                        const br = document.createElement('br');
                                        if (!range.collapsed) {
                                            range.deleteContents();
                                        }
                                        range.insertNode(br);
                                        // Move cursor after the <br>
                                        range.setStartAfter(br);
                                        range.collapse(true);
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                    }
                                    
                                    // CRITICAL: Update state IMMEDIATELY after inserting line break
                                    // This prevents the sync effect from overwriting with old content
                                    if (editorRef.current) {
                                        const newHtml = editorRef.current.innerHTML;
                                        const newText = editorRef.current.innerText || editorRef.current.textContent || '';
                                        
                                        // Update state synchronously to prevent sync effect from interfering
                                        setCurrentNoteHtml(newHtml);
                                        setCurrentNote(newText);
                                        
                                        // Also update notes state immediately
                                        const dateString = formatDateString(currentDate);
                                        setNotes(prev => ({ ...prev, [dateString]: newHtml }));
                                        
                                        // CRITICAL: Clear saved cursor position so restoreCursorPosition doesn't interfere
                                        // The cursor is already in the correct position after inserting the line break
                                        editorCursorPositionRef.current = null;
                                    }
                                    
                                    // Trigger input event for auto-save (this will also call updateNoteContent)
                                    const inputEvent = new Event('input', { bubbles: true });
                                    editorRef.current.dispatchEvent(inputEvent);
                                }
                                
                                // Clear flags after longer delay to ensure sync doesn't interfere
                                setTimeout(() => {
                                    isUserTypingRef.current = false;
                                    isUpdatingFromUserInputRef.current = false;
                                    // Clear Enter flag after all operations complete
                                    justPressedEnterRef.current = false;
                                }, 3000); // Increased to 3 seconds to prevent sync interference
                                
                                return;
                            }
                            
                            // Handle spacebar
                            if (e.key === ' ' || e.keyCode === 32) {
                                // Save cursor position before spacebar
                                saveCursorPosition();
                                
                                // Mark user as typing to prevent sync interference
                                isUserTypingRef.current = true;
                                lastUserInputTimeRef.current = Date.now();
                                isUpdatingFromUserInputRef.current = true;
                                
                                // Clear flags after delay to allow sync after typing stops
                                setTimeout(() => {
                                    isUserTypingRef.current = false;
                                    isUpdatingFromUserInputRef.current = false;
                                }, 2000);
                                
                                // Let the default behavior happen (spacebar inserts space)
                            }
                        }}
                        onBlur={() => {
                            // Clear cursor position tracking when user leaves field
                            editorCursorPositionRef.current = null;
                            
                            // Save immediately when editor loses focus
                            if (editorRef.current) {
                                const initTime = window._dailyNotesInitTime || 0;
                                if (Date.now() - initTime >= 500) {
                                    console.log('💾 Auto-saving note (editor blur)...');
                                    saveNote().catch(err => console.error('Auto-save error on blur:', err));
                                }
                            }
                        }}
                        className={`daily-notes-editor w-full h-full min-h-[400px] p-4 rounded-lg border ${
                            isDark 
                                ? 'bg-gray-800 border-gray-700 text-gray-100' 
                                : 'bg-white border-gray-300 text-gray-900'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        style={{ 
                            minHeight: 'calc(100vh - 200px)',
                            // Ensure lists are properly styled
                        }}
                        suppressContentEditableWarning={true}
                    />
                    
                    {/* Handwriting canvas overlay - directly on editor */}
                    {showHandwriting && (
                        <canvas
                            ref={canvasRef}
                            onMouseDown={startDrawing}
                            onMouseMove={draw}
                            onMouseUp={stopDrawing}
                            onMouseLeave={stopDrawing}
                            onTouchStart={startDrawing}
                            onTouchMove={draw}
                            onTouchEnd={stopDrawing}
                            className="absolute inset-0 cursor-crosshair"
                            style={{ 
                                touchAction: 'none',
                                pointerEvents: 'auto',
                                zIndex: 10
                            }}
                        />
                    )}
                    
                    {/* Handwriting controls overlay */}
                    {showHandwriting && (
                        <div className={`absolute top-6 right-6 flex items-center space-x-2 p-2 rounded-lg shadow-lg ${
                            isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                        }`}>
                            <button
                                onClick={clearHandwriting}
                                className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                title="Clear handwriting"
                            >
                                <i className="fas fa-eraser"></i>
                            </button>
                            <button
                                onClick={recognizeHandwriting}
                                disabled={isRecognizing}
                                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Recognize handwriting as text"
                            >
                                {isRecognizing ? (
                                    <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                    <i className="fas fa-magic"></i>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.DailyNotes = DailyNotes;

export default DailyNotes;

