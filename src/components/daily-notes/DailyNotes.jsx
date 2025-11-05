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
    
    // Format date string helper - MUST be defined before useEffects
    const formatDateString = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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
            const note = localNotes[dateString] || notes[dateString] || '';
            
            console.log('📝 Loading initial note for date:', dateString, 'from localStorage length:', note.length);
            
            if (note) {
                setCurrentNote(note);
                setCurrentNoteHtml(note);
                console.log('📝 Set initial note state, length:', note.length);
                
                // Force set editor content immediately
                if (editorRef.current) {
                    editorRef.current.innerHTML = note;
                    console.log('✅ Set initial editor content immediately, length:', note.length);
                } else {
                    // If editor not ready, wait and set
                    setTimeout(() => {
                        if (editorRef.current) {
                            editorRef.current.innerHTML = note;
                            console.log('✅ Set initial editor content (delayed), length:', note.length);
                        }
                    }, 100);
                }
            } else {
                // Even if empty, set it to ensure editor is initialized
                setCurrentNote('');
                setCurrentNoteHtml('');
                if (editorRef.current) {
                    editorRef.current.innerHTML = '';
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
                    const serverNote = serverNotes[dateString] || '';
                    
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
                if (Object.keys(localNotes).length > 0) {
                    setNotes(localNotes);
                    console.log('📝 Loaded notes from localStorage:', Object.keys(localNotes).length);
                    
                    // Load current note if editing specific date
                    if (!showListView && currentDate) {
                        const dateString = formatDateString(currentDate);
                        const note = localNotes[dateString] || '';
                        const currentEditorContent = editorRef.current?.innerHTML || '';
                        
                        // Load note if editor is empty or content is different
                        if (note && (!currentEditorContent || currentEditorContent.trim().length === 0)) {
                            setCurrentNote(note);
                            setCurrentNoteHtml(note);
                            console.log('📝 Loading note for date from localStorage:', dateString, 'length:', note.length);
                            
                            // Force set editor content immediately
                            if (editorRef.current) {
                                editorRef.current.innerHTML = note;
                                console.log('✅ Set editor content from localStorage, length:', note.length);
                            }
                        } else if (note && currentEditorContent.trim() !== note.trim()) {
                            // Update if different
                            setCurrentNote(note);
                            setCurrentNoteHtml(note);
                            console.log('📝 Updating note from localStorage:', dateString, 'length:', note.length);
                            
                            // Force set editor content
                            if (editorRef.current) {
                                editorRef.current.innerHTML = note;
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
                        const serverNotes = data?.data?.notes || data?.notes || {};
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
                                const mergedNotes = { ...localNotes, ...serverNotes };
                                // Preserve current editor content
                                mergedNotes[dateString] = editorContent;
                                setNotes(mergedNotes);
                                localStorage.setItem(notesKey, JSON.stringify(mergedNotes));
                                setIsLoading(false);
                                return;
                            }
                        }
                        
                        // Merge server notes (server takes priority)
                        const mergedNotes = { ...localNotes, ...serverNotes };
                        setNotes(mergedNotes);
                        
                        // Update localStorage with server data
                        localStorage.setItem(notesKey, JSON.stringify(mergedNotes));
                        
                        // Load current note if editing specific date - ONLY if we don't have newer content
                        if (!showListView && currentDate) {
                            const serverNote = serverNotes[dateString] || '';
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
                
                // Save after recognizing
                setTimeout(() => {
                    console.log('💾 Saving after recognition...');
                    saveNote().catch(err => console.error('Error saving after recognition:', err));
                }, 500);
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
        if (!showListView && currentNoteHtml && currentNoteHtml.trim().length > 0) {
            // Use requestAnimationFrame to ensure DOM is ready
            requestAnimationFrame(() => {
                if (editorRef.current) {
                    const currentContent = editorRef.current.innerHTML || '';
                    // Only set if editor is empty or content is different
                    if (currentContent.trim().length === 0 || currentContent.trim() !== currentNoteHtml.trim()) {
                        console.log('🔧 Setting editor content on mount/update - editor:', currentContent.length, 'state:', currentNoteHtml.length);
                        editorRef.current.innerHTML = currentNoteHtml;
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
            
            // Always sync during initialization to ensure content is loaded
            // After initialization, only sync if not initializing to avoid overwriting user input
            if (shouldUpdate) {
                console.log('🔄 Syncing editor - state has content, editor:', currentEditorContent.length, 'state:', currentNoteHtml.length, 'initializing:', isInitializingRef.current);
                // Use requestAnimationFrame to ensure DOM is ready
                requestAnimationFrame(() => {
                    if (editorRef.current && editorRef.current.innerHTML.trim() !== currentNoteHtml.trim()) {
                        // Temporarily disable updateNoteContent to prevent feedback loop
                        const wasInitializing = isInitializingRef.current;
                        isInitializingRef.current = true;
                        editorRef.current.innerHTML = currentNoteHtml;
                        console.log('✅ Editor synced with state, length:', currentNoteHtml.length);
                        // Re-enable after editor has time to update
                        setTimeout(() => {
                            isInitializingRef.current = wasInitializing;
                        }, 300);
                    }
                });
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
            
            // If handwriting canvas has content, save it as an image in the note
            if (showHandwriting && canvasRef.current) {
                const canvas = canvasRef.current;
                // Check if canvas has any drawing (not empty)
                const ctx = canvas.getContext('2d');
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasDrawing = imageData.data.some((channel, index) => {
                    return index % 4 !== 3 && channel !== 0; // Check non-alpha channels for non-zero values
                });
                
                if (hasDrawing) {
                    // Convert canvas to data URL
                    const canvasDataUrl = canvas.toDataURL('image/png');
                    // Insert image into note content
                    const imgTag = `<img src="${canvasDataUrl}" alt="Handwriting" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
                    
                    // Update note content with image
                    if (editorRef.current) {
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
                        }
                        // Update content after inserting image
                        noteContent = editorRef.current.innerHTML;
                    } else {
                        // Fallback: append image to content
                        noteContent = noteContent + imgTag;
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
                
                // Verify the save by fetching from server after a short delay
                setTimeout(async () => {
                    try {
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
                            if (serverNotes[dateString] === noteContent) {
                                console.log('✅ Server verification: Note found on server with matching content');
                                // Update notes state with server data to ensure sync
                                setNotes(prev => ({ ...prev, [dateString]: noteContent }));
                            } else if (serverNotes[dateString]) {
                                console.warn('⚠️ Server verification: Note found but content differs');
                                console.warn('   Expected:', noteContent.substring(0, 50));
                                console.warn('   Got:', serverNotes[dateString].substring(0, 50));
                                // Retry save if content differs
                                console.log('🔄 Retrying save due to content mismatch...');
                                setTimeout(() => {
                                    saveNote().catch(err => console.error('Retry save error:', err));
                                }, 500);
                            } else {
                                console.error('❌ Server verification: Note not found on server!');
                                console.error('   Date:', dateString);
                                console.error('   Server notes keys:', Object.keys(serverNotes));
                                // Retry save if note not found
                                console.log('🔄 Retrying save - note not found on server...');
                                setTimeout(() => {
                                    saveNote().catch(err => console.error('Retry save error:', err));
                                }, 1000);
                            }
                        } else {
                            console.error('❌ Verification request failed:', verifyRes.status);
                        }
                    } catch (verifyError) {
                        console.error('Error verifying save on server:', verifyError);
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
        
        // Debounced save function
        const debouncedSave = () => {
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                checkAndSave();
            }, 500); // Save 500ms after typing stops (faster response)
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
        
        // Also set up interval as backup (every 3 seconds to catch any missed changes)
        const autoSaveInterval = setInterval(() => {
            // Only skip first 500ms of initialization
            const initTime = window._dailyNotesInitTime || 0;
            if (Date.now() - initTime < 500) {
                return;
            }
            
            checkAndSave();
        }, 3000); // Check every 3 seconds as backup
        
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
        
        // Reduced initialization wait - only skip first 500ms
        const initTime = window._dailyNotesInitTime || 0;
        if (Date.now() - initTime < 500) {
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
        
        // Set new timeout for auto-save (1 second after last change for faster saves)
        saveTimeoutRef.current = setTimeout(() => {
            console.log('💾 Auto-saving note (state change backup)...');
            saveNote().catch(err => console.error('Auto-save error:', err));
        }, 1000); // Reduced to 1 second for faster saves
        
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
                // Wait a bit then save
                setTimeout(() => {
                    console.log('💾 Saving after handwriting disabled...', { hasDrawing, hasEditorContent, editorLength: editorContent.length });
                    saveNote().catch(err => console.error('Error saving after handwriting:', err));
                }, 500);
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
                }, 2000);
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
            editorRef.current.innerHTML = note;
            console.log('✅ Set editor content immediately on open, length:', note.length);
        } else if (note) {
            // If editor not ready yet, wait a bit and try again
            setTimeout(() => {
                if (editorRef.current) {
                    editorRef.current.innerHTML = note;
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
                            editorRef.current.innerHTML = note;
                            console.log('✅ Updated editor with server note immediately, length:', note.length);
                        } else {
                            // If editor not ready, wait and try again
                            setTimeout(() => {
                                if (editorRef.current) {
                                    editorRef.current.innerHTML = note;
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
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        updateNoteContent();
    };

    // Handle editor input - always update content and trigger auto-save immediately
    const handleEditorInput = () => {
        // Force update immediately - user typing should always work
        if (editorRef.current) {
            const html = editorRef.current.innerHTML;
            setCurrentNoteHtml(html);
            // Strip HTML for plain text version (for search)
            const text = editorRef.current.innerText || editorRef.current.textContent || '';
            setCurrentNote(text);
            
            // Trigger auto-save more aggressively (500ms debounce for faster saves)
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
            saveTimeoutRef.current = setTimeout(() => {
                if (editorRef.current) {
                    // Check initialization timeout (only skip first 500ms)
                    const initTime = window._dailyNotesInitTime || 0;
                    if (Date.now() - initTime < 500) {
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
                        // Retry once after 1 second
                        setTimeout(() => {
                            console.log('🔄 Retrying auto-save after error...');
                            saveNote().catch(retryErr => console.error('❌ Retry auto-save failed:', retryErr));
                        }, 1000);
                    });
                }
            }, 500); // Reduced to 500ms for faster auto-save
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
                    {isSaving && (
                        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                            <i className="fas fa-spinner fa-spin"></i>
                            <span>Auto-saving...</span>
                        </div>
                    )}
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
            </div>

            {/* Editor Area with integrated handwriting */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Rich Text Editor with handwriting overlay */}
                <div className="flex-1 p-4 overflow-y-auto relative">
                    <div
                        ref={(el) => {
                            editorRef.current = el;
                            // When editor ref is set, immediately set content if we have it
                            if (el && currentNoteHtml && currentNoteHtml.trim().length > 0) {
                                const currentContent = el.innerHTML || '';
                                if (currentContent.trim().length === 0 || currentContent.trim() !== currentNoteHtml.trim()) {
                                    console.log('🔧 Setting editor content via ref callback - editor:', currentContent.length, 'state:', currentNoteHtml.length);
                                    el.innerHTML = currentNoteHtml;
                                    console.log('✅ Editor content set via ref callback, length:', currentNoteHtml.length);
                                }
                            }
                        }}
                        contentEditable
                        onInput={handleEditorInput}
                        onPaste={handlePaste}
                        onBlur={() => {
                            // Save immediately when editor loses focus
                            if (editorRef.current) {
                                const initTime = window._dailyNotesInitTime || 0;
                                if (Date.now() - initTime >= 500) {
                                    console.log('💾 Auto-saving note (editor blur)...');
                                    saveNote().catch(err => console.error('Auto-save error on blur:', err));
                                }
                            }
                        }}
                        className={`w-full h-full min-h-[400px] p-4 rounded-lg border ${
                            isDark 
                                ? 'bg-gray-800 border-gray-700 text-gray-100' 
                                : 'bg-white border-gray-300 text-gray-900'
                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                        style={{ minHeight: 'calc(100vh - 200px)' }}
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

