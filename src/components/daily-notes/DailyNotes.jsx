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
    const [penSize, setPenSize] = useState(3);
    const [penColor, setPenColor] = useState(isDark ? '#ffffff' : '#000000');
    
    const editorRef = useRef(null);
    const canvasRef = useRef(null);
    const toolbarRef = useRef(null);
    const editorCursorPositionRef = useRef(null); // Track cursor position to restore after updates
    const isUserTypingRef = useRef(false); // Track if user is actively typing to prevent sync interference
    const lastUserInputTimeRef = useRef(0); // Track when user last typed to prevent sync
    const isUpdatingFromUserInputRef = useRef(false); // Track if currentNoteHtml update is from user input
    const justPressedEnterRef = useRef(false); // Track if Enter was just pressed to prevent cursor restoration
    const justUsedFormattingRef = useRef(false); // Track if formatting button was just clicked to prevent cursor restoration
    
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
            
            
            if (note) {
                setCurrentNote(note);
                setCurrentNoteHtml(note);
                
                // Force set editor content immediately
                if (editorRef.current) {
                    setEditorContentSafely(note);
                } else {
                    // If editor not ready, wait and set
                    setTimeout(() => {
                        if (editorRef.current) {
                            setEditorContentSafely(note);
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
            
            // Also try to fetch from server - only fetch the specific date note for performance
            const token = window.storage?.getToken?.();
            if (token) {
                // Fetch only the specific date note instead of all notes
                fetch(`/api/calendar-notes/${dateString}?t=${Date.now()}`, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include'
                })
                .then(res => res.json())
                .then(data => {
                    // Single date endpoint returns { note: "..." } not { notes: { date: "..." } }
                    let serverNote = data?.data?.note || data?.note || '';
                    
                    // Clean &nbsp; entities from server note
                    serverNote = cleanHtmlContent(serverNote);
                    
                    if (serverNote && serverNote !== note) {
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

    // Save note (including handwriting as image) - MUST be defined before useEffects that use it
    const saveNote = useCallback(async () => {
        setIsSaving(true);
        try {
            const dateString = formatDateString(currentDate);
            
            // Get content from editor first (most up-to-date)
            let noteContent = '';
            if (editorRef.current) {
                noteContent = editorRef.current.innerHTML || '';
            } else {
                noteContent = currentNoteHtml || currentNote || '';
            }
            
            // If editor is empty but state has content, use state (editor might not be synced yet)
            if (!noteContent || noteContent.trim().length === 0) {
                if (currentNoteHtml && currentNoteHtml.trim().length > 0) {
                    noteContent = currentNoteHtml;
                } else if (currentNote && currentNote.trim().length > 0) {
                    noteContent = currentNote;
                }
            }
            
            // Always save content, even if empty (user might have cleared it)
            // Only skip if we're in the very first 500ms of initialization to prevent saving initial empty state
            const initTime = window._dailyNotesInitTime || 0;
            if ((!noteContent || noteContent.trim().length === 0) && (Date.now() - initTime < 500)) {
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
                // Improved drawing detection - check for any visible content
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                let hasDrawing = false;
                
                // Check for any non-transparent pixels (more lenient)
                for (let i = 3; i < data.length; i += 4) { // Check alpha channel (every 4th byte starting at index 3)
                    if (data[i] > 10) { // If alpha > 10, there's visible content
                        hasDrawing = true;
                        break;
                    }
                }
                
                if (hasDrawing) {
                    // Convert canvas to data URL
                    const canvasDataUrl = canvas.toDataURL('image/png');
                    // Create image tag
                    const imgTag = `<img src="${canvasDataUrl}" alt="Handwriting" style="max-width: 100%; height: auto; margin: 10px 0;" />`;
                    
                    // Check if image already exists in note content (to avoid duplicates)
                    const existingImgPattern = /<img[^>]*alt="Handwriting"[^>]*>/gi;
                    if (existingImgPattern.test(noteContent)) {
                        // Replace existing handwriting image
                        noteContent = noteContent.replace(existingImgPattern, imgTag);
                    } else {
                        // Append handwriting image to content
                        noteContent = noteContent + (noteContent ? '<br/>' : '') + imgTag;
                    }
                    
                    // Update editor content with image - always ensure it's in the editor
                    if (editorRef.current) {
                        // Check if editor already has this exact image
                        const editorHasImage = editorRef.current.innerHTML.includes(canvasDataUrl.substring(0, 100));
                        if (!editorHasImage) {
                            // Always append to end to ensure it's saved
                            const img = document.createElement('img');
                            img.src = canvasDataUrl;
                            img.alt = 'Handwriting';
                            img.style.maxWidth = '100%';
                            img.style.height = 'auto';
                            img.style.margin = '10px 0';
                            img.setAttribute('data-handwriting', 'true');
                            
                            // Add a line break before the image if there's content
                            if (editorRef.current.innerHTML.trim().length > 0) {
                                const br = document.createElement('br');
                                editorRef.current.appendChild(br);
                            }
                            editorRef.current.appendChild(img);
                            
                            // Update content after inserting image
                            noteContent = editorRef.current.innerHTML;
                        } else {
                            // Image exists, but update noteContent to ensure it's saved
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
                
                // The API wraps response in {data: {saved: true, note: ..., ...}}
                const data = response?.data || response;
                
                // Verify the save was successful
                if (data?.saved === false || (data?.saved === undefined && !data?.note && !data?.id)) {
                    console.error('❌ Server indicated save failed:', data);
                    throw new Error(data?.message || 'Note save failed on server');
                }
                
                
                // Store last saved content to prevent duplicate saves
                sessionStorage.setItem(`last_saved_note_${dateString}`, noteContent);
                
                // Update local notes state immediately - CRITICAL for persistence
                setNotes(prev => {
                    const updated = { ...prev, [dateString]: noteContent };
                    return updated;
                });
                
                // Also save to localStorage - CRITICAL for persistence
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                savedNotes[dateString] = noteContent;
                localStorage.setItem(notesKey, JSON.stringify(savedNotes));
                
                // Verify the save by checking localStorage
                const verify = JSON.parse(localStorage.getItem(notesKey) || '{}');
                if (verify[dateString] === noteContent) {
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

                        // Fetch only the specific date note for verification
                        const verifyRes = await fetch(`/api/calendar-notes/${dateString}?t=${Date.now()}`, {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                'Cache-Control': 'no-cache, no-store, must-revalidate'
                            },
                            credentials: 'include',
                            cache: 'no-store'
                        });
                        if (verifyRes.ok) {
                            const verifyData = await verifyRes.json();
                            // Single date endpoint returns { note: "..." }
                            const serverNote = verifyData?.data?.note || verifyData?.note || '';
                            
                            // Normalize both contents for comparison
                            const normalizedLocal = normalizeHtmlForComparison(noteContent);
                            const normalizedServer = normalizeHtmlForComparison(serverNote);
                            
                            // Also do a direct comparison for exact matches
                            const exactMatch = serverNote === noteContent;
                            // And a normalized comparison for HTML entity differences
                            const normalizedMatch = normalizedLocal === normalizedServer;
                            
                            if (exactMatch || normalizedMatch) {
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
                                    setTimeout(() => {
                                        saveNote().catch(err => console.error('Retry save error:', err));
                                    }, 500);
                                } else {
                                    // Accept the server version if differences are minor
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
            } catch (localError) {
                console.error('Failed to save to localStorage:', localError);
            }
        } finally {
            setIsSaving(false);
        }
    }, [currentDate, currentNoteHtml, currentNote, showHandwriting, isDark]);

    // Set editing date flag when editing starts
    useEffect(() => {
        if (!showListView && currentDate) {
            const dateString = formatDateString(currentDate);
            sessionStorage.setItem('calendar_editing_date', dateString);
        } else {
            sessionStorage.removeItem('calendar_editing_date');
        }
        
        return () => {
            // CRITICAL: Save note before unmounting or navigating away
            if (!showListView && currentDate && editorRef.current) {
                const dateString = formatDateString(currentDate);
                const editorContent = editorRef.current.innerHTML || '';
                const currentNoteContent = currentNoteHtml || currentNote || '';
                
                // Only save if there's content and it's different from last saved
                if (editorContent && editorContent.trim().length > 0) {
                    const lastSaved = sessionStorage.getItem(`last_saved_note_${dateString}`) || '';
                    if (editorContent !== lastSaved) {
                        // Save synchronously if possible, or use a quick save
                        saveNote().catch(err => {
                            console.error('Error saving note before unmount:', err);
                            // Fallback: save to localStorage
                            const user = window.storage?.getUser?.();
                            const userId = user?.id || user?.email || 'default';
                            const notesKey = `user_notes_${userId}`;
                            const savedNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                            savedNotes[dateString] = editorContent;
                            localStorage.setItem(notesKey, JSON.stringify(savedNotes));
                        });
                    }
                }
            }
            // Clear on unmount
            sessionStorage.removeItem('calendar_editing_date');
        };
    }, [currentDate, showListView, currentNoteHtml, currentNote, saveNote]);
    
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
            
            
            if (note) {
                setCurrentNote(note);
                setCurrentNoteHtml(note);
                
                // CRITICAL: Always set editor content when loading note
                // Use multiple attempts to ensure it's set
                const setEditorContent = () => {
                    if (editorRef.current) {
                        setEditorContentSafely(note);
                        return true;
                    }
                    return false;
                };
                
                // Try immediately
                if (!setEditorContent()) {
                    // Try after short delay
                    setTimeout(() => {
                        if (!setEditorContent()) {
                            // Try again after longer delay
                            setTimeout(() => {
                                setEditorContent();
                            }, 200);
                        }
                    }, 100);
                }
            } else {
                // Only clear if we're sure there's no note
                // Check localStorage one more time before clearing
                const user = window.storage?.getUser?.();
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;
                const localNotes = JSON.parse(localStorage.getItem(notesKey) || '{}');
                const localNote = localNotes[dateString] || '';
                
                if (!localNote || localNote.trim().length === 0) {
                    // Clear if no note found
                    setCurrentNote('');
                    setCurrentNoteHtml('');
                    if (editorRef.current) {
                        setEditorContentSafely('');
                    }
                } else {
                    // Found note in localStorage, load it
                    const cleanedNote = cleanHtmlContent(localNote);
                    setCurrentNote(cleanedNote);
                    setCurrentNoteHtml(cleanedNote);
                    if (editorRef.current) {
                        setEditorContentSafely(cleanedNote);
                    }
                }
            }
            
            // Also fetch from server - only fetch the specific date note
            const token = window.storage?.getToken?.();
            if (token) {
                fetch(`/api/calendar-notes/${dateString}?t=${Date.now()}`, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include'
                })
                .then(res => res.json())
                .then(data => {
                    // Single date endpoint returns { note: "..." }
                    let serverNote = data?.data?.note || data?.note || '';
                    serverNote = cleanHtmlContent(serverNote);
                    
                    if (serverNote && serverNote !== note) {
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
                    
                    // Load current note if editing specific date
                    if (!showListView && currentDate) {
                        const dateString = formatDateString(currentDate);
                        const note = cleanedLocalNotes[dateString] || '';
                        const currentEditorContent = editorRef.current?.innerHTML || '';
                        
                        // CRITICAL: Always load note from localStorage if editor is empty
                        // This ensures notes persist when navigating back
                        if (note && note.length > 0) {
                            // Always update state and editor if we have a note
                            if (!currentEditorContent || currentEditorContent.trim().length === 0 || currentEditorContent.trim() !== note.trim()) {
                                setCurrentNote(note);
                                setCurrentNoteHtml(note);
                                
                                // Force set editor content immediately
                                if (editorRef.current) {
                                    setEditorContentSafely(note);
                                } else {
                                    // Wait for editor to be ready
                                    setTimeout(() => {
                                        if (editorRef.current) {
                                            setEditorContentSafely(note);
                                        }
                                    }, 100);
                                }
                            }
                        } else if (!note || note.length === 0) {
                            // Only clear if we're sure there's no note
                            // Don't clear if editor has content (might be unsaved)
                            if (!currentEditorContent || currentEditorContent.trim().length === 0) {
                                setCurrentNote('');
                                setCurrentNoteHtml('');
                                if (editorRef.current) {
                                    setEditorContentSafely('');
                                }
                            }
                        }
                    }
                }
                
                // Then sync from server - only load notes from last 12 months for performance
                if (token) {
                    // Calculate date range: last 12 months to future 3 months
                    const endDate = new Date();
                    endDate.setMonth(endDate.getMonth() + 3); // 3 months in future
                    const startDate = new Date();
                    startDate.setMonth(startDate.getMonth() - 12); // 12 months ago
                    
                    const startDateStr = startDate.toISOString().split('T')[0];
                    const endDateStr = endDate.toISOString().split('T')[0];
                    
                    const res = await fetch(`/api/calendar-notes?startDate=${startDateStr}&endDate=${endDateStr}&t=${Date.now()}`, {
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
                        
                        // CRITICAL: Don't overwrite if there's unsaved content in editor
                        const dateString = formatDateString(currentDate);
                        const editorContent = editorRef.current?.innerHTML || '';
                        const hasUnsavedChanges = editorContent && editorContent.trim().length > 0;
                        
                        // Check if we're currently editing and have unsaved changes
                        if (!showListView && currentDate && hasUnsavedChanges) {
                            const lastSaved = sessionStorage.getItem(`last_saved_note_${dateString}`) || '';
                            // If editor has different content than last saved, don't overwrite
                            if (editorContent !== lastSaved) {
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
                            const editorContent = editorRef.current?.innerHTML || '';
                            
                            
                            // CRITICAL: Always load note if editor is empty or if server has a note
                            // This ensures notes persist when navigating back
                            const shouldUpdate = 
                                // If server has a note and editor is empty, load it
                                (serverNote && serverNote.length > 0 && (!editorContent || editorContent.trim().length === 0)) ||
                                // If server has a note and current state is empty, load it
                                (serverNote && serverNote.length > 0 && (!currentNoteContent || currentNoteContent.length === 0)) ||
                                // If server note is different and longer than current, use server version
                                (serverNote && serverNote.length > 0 && serverNote !== currentNoteContent && serverNote.length >= currentNoteContent.length);
                            
                            if (shouldUpdate) {
                                setCurrentNote(serverNote);
                                setCurrentNoteHtml(serverNote);
                                
                                // CRITICAL: Always set editor content when loading from server
                                if (editorRef.current) {
                                    setEditorContentSafely(serverNote);
                                } else {
                                    // Wait for editor to be ready
                                    setTimeout(() => {
                                        if (editorRef.current) {
                                            setEditorContentSafely(serverNote);
                                        }
                                    }, 100);
                                }
                            } else if (!serverNote || serverNote.length === 0) {
                                // If server is empty but localStorage has content, use localStorage
                                const localNote = cleanedLocalNotes[dateString] || '';
                                if (localNote && localNote.length > 0 && (!editorContent || editorContent.trim().length === 0)) {
                                    setCurrentNote(localNote);
                                    setCurrentNoteHtml(localNote);
                                    if (editorRef.current) {
                                        setEditorContentSafely(localNote);
                                    }
                                } else {
                                }
                            } else {
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
                
                // Setting width/height resets the context, so we need to re-apply styles
                canvas.width = width * dpr;
                canvas.height = height * dpr;
                canvas.style.width = width + 'px';
                canvas.style.height = height + 'px';
                
                // Reset transform and scale context for high DPI displays
                ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
                ctx.scale(dpr, dpr);
                
                // Set drawing styles - will be updated from state
                ctx.strokeStyle = penColor || (isDark ? '#ffffff' : '#000000');
                ctx.lineWidth = penSize || 3;
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
    }, [showHandwriting, isDark, penSize, penColor]);
    
    // Update pen color when dark mode changes (if using default color)
    useEffect(() => {
        if (penColor === '#000000' || penColor === '#ffffff') {
            const defaultColor = isDark ? '#ffffff' : '#000000';
            if (penColor !== defaultColor) {
                setPenColor(defaultColor);
                if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    ctx.strokeStyle = defaultColor;
                }
            }
        }
    }, [isDark]);

    // Handle drawing on canvas
    const startDrawing = (e) => {
        if (!canvasRef.current || !showHandwriting) return;
        
        setIsDrawing(true);
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        
        // Get coordinates relative to canvas (in CSS pixels)
        // The context is already scaled by DPR, so we use CSS pixel coordinates directly
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        
        // Restore drawing styles (in case they were reset)
        ctx.strokeStyle = penColor || (isDark ? '#ffffff' : '#000000');
        ctx.lineWidth = penSize || 3; // Context is already scaled, so use CSS pixel size
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 1.0;
        
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
        
        // Get coordinates relative to canvas (in CSS pixels)
        // The context is already scaled by DPR, so we use CSS pixel coordinates directly
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
            // CRITICAL: Auto-save drawing when drawing stops
            // Small delay to ensure canvas is fully updated
            setTimeout(() => {
                if (canvasRef.current && showHandwriting) {
                    const ctx = canvasRef.current.getContext('2d');
                    // Check entire canvas for drawing
                    const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
                    const hasDrawing = imageData.data.some((channel, index) => {
                        return index % 4 !== 3 && channel !== 0;
                    });
                    
                    if (hasDrawing) {
                        // Force immediate save with canvas content
                        saveNote().catch(err => console.error('Error auto-saving drawing:', err));
                    } else {
                    }
                }
            }, 150);
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
                    saveNote().catch(err => console.error('Error saving after recognition:', err));
                }, 200); // Faster save after recognition
            } else {
                // Even if no text recognized, save the drawing itself
                setTimeout(() => {
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
                        setEditorContentSafely(currentNoteHtml);
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
                return;
            }
            
            // Always sync during initialization to ensure content is loaded
            // After initialization, only sync if not initializing to avoid overwriting user input
            if (shouldUpdate) {
                
                // Use safe wrapper that preserves cursor position
                const wasInitializing = isInitializingRef.current;
                isInitializingRef.current = true;
                setEditorContentSafely(currentNoteHtml);
                
                // Re-enable after editor has time to update
                setTimeout(() => {
                    isInitializingRef.current = wasInitializing;
                }, 300);
            }
        }
    }, [currentNoteHtml, showListView]);
    
    // Auto-save on content change (debounced)
    const saveTimeoutRef = useRef(null);
    const isInitializingRef = useRef(true);
    
    // Mark initialization as complete after editor content is loaded (faster)
    useEffect(() => {
        if (!showListView && currentDate) {
            isInitializingRef.current = true;
            window._dailyNotesInitTime = Date.now();
            
            // Wait for editor to be ready and content to be set (very short delay)
            const checkEditorReady = () => {
                if (editorRef.current) {
                    // Editor is ready - enable auto-save very quickly (300ms)
                    setTimeout(() => {
                        isInitializingRef.current = false;
                    }, 300); // Reduced to 300ms for faster auto-save
                } else {
                    // Fallback: disable initialization after 500ms (very fast)
                    setTimeout(() => {
                        isInitializingRef.current = false;
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
                
                saveNote().then(() => {
                    lastSavedContent = editorContent;
                    sessionStorage.setItem(`last_saved_note_${dateString}`, editorContent);
                    saveInProgress = false;
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
            saveNote().catch(err => console.error('Auto-save error:', err));
        }, 500); // Ultra-fast - 500ms after state change
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [currentNoteHtml, currentDate, showListView, saveNote]);
    
    // Handle checkbox clicks in checkbox lists
    useEffect(() => {
        if (!editorRef.current || showListView) return;
        
        const handleCheckboxClick = (e) => {
            if (e.target.type === 'checkbox' && e.target.classList.contains('list-checkbox')) {
                // Update state and trigger auto-save
                setTimeout(() => {
                    if (editorRef.current) {
                        const newHtml = editorRef.current.innerHTML;
                        const newText = editorRef.current.innerText || editorRef.current.textContent || '';
                        setCurrentNoteHtml(newHtml);
                        setCurrentNote(newText);
                        const dateString = formatDateString(currentDate);
                        setNotes(prev => ({ ...prev, [dateString]: newHtml }));
                        
                        // Trigger input event for auto-save
                        const inputEvent = new Event('input', { bubbles: true });
                        editorRef.current.dispatchEvent(inputEvent);
                    }
                }, 10);
            }
        };
        
        editorRef.current.addEventListener('click', handleCheckboxClick);
        
        return () => {
            if (editorRef.current) {
                editorRef.current.removeEventListener('click', handleCheckboxClick);
            }
        };
    }, [currentDate, showListView]);
    
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
                    saveNote().catch(err => console.error('Error saving after handwriting:', err));
                }, 200); // Faster save - 200ms after disabling handwriting
            } else {
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
            
            // Check entire canvas for drawing (not just a sample)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
                    saveNote().catch(err => console.error('Error saving drawing:', err));
                }, 300); // Faster save for drawings - 300ms after drawing stops
            } else {
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
            
            
            const res = await fetch(`/api/calendar-notes/${dateString}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${token}`
                },
                credentials: 'include'
            });
            
            if (res.ok) {
                
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
        // CRITICAL: Save current note before navigating
        if (editorRef.current && currentDate) {
            const dateString = formatDateString(currentDate);
            const editorContent = editorRef.current.innerHTML || '';
            if (editorContent && editorContent.trim().length > 0) {
                saveNote().catch(err => console.error('Error saving before navigation:', err));
            }
        }
        
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 1);
        const dateString = formatDateString(newDate);
        // Small delay to ensure save completes
        setTimeout(() => {
            openNote(dateString);
        }, 100);
    };
    
    // Navigate to next day
    const goToNextDay = () => {
        // CRITICAL: Save current note before navigating
        if (editorRef.current && currentDate) {
            const dateString = formatDateString(currentDate);
            const editorContent = editorRef.current.innerHTML || '';
            if (editorContent && editorContent.trim().length > 0) {
                saveNote().catch(err => console.error('Error saving before navigation:', err));
            }
        }
        
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 1);
        const dateString = formatDateString(newDate);
        // Small delay to ensure save completes
        setTimeout(() => {
            openNote(dateString);
        }, 100);
    };
    
    // Open note for editing
    const openNote = async (dateString) => {
        // CRITICAL: Save current note before opening a different note
        if (editorRef.current && currentDate) {
            const currentDateString = formatDateString(currentDate);
            if (currentDateString !== dateString) {
                const editorContent = editorRef.current.innerHTML || '';
                if (editorContent && editorContent.trim().length > 0) {
                    await saveNote().catch(err => console.error('Error saving before opening note:', err));
                }
            }
        }
        
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
        
        
        // Set initial content
        setCurrentNote(note);
        setCurrentNoteHtml(note);
        
        // Set editor content immediately if available
        if (note && editorRef.current) {
            // Force set editor content immediately
            setEditorContentSafely(note);
        } else if (note) {
            // If editor not ready yet, wait a bit and try again
            setTimeout(() => {
                if (editorRef.current) {
                    setEditorContentSafely(note);
                }
            }, 100);
        }
        
        // Also try to fetch fresh from server - only fetch the specific date note
        try {
            const token = window.storage?.getToken?.();
            if (token) {
                const res = await fetch(`/api/calendar-notes/${dateString}?t=${Date.now()}`, {
                    headers: { 
                        Authorization: `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include'
                });
                
                if (res.ok) {
                    const data = await res.json();
                    // Single date endpoint returns { note: "..." }
                    const serverNote = data?.data?.note || data?.note || '';
                    
                    
                    if (serverNote && serverNote !== note) {
                        // Always use server version if available and different
                        note = serverNote;
                        setCurrentNote(note);
                        setCurrentNoteHtml(note);
                        // Update notes state and localStorage
                        setNotes(prev => ({ ...prev, [dateString]: note }));
                        localNotes[dateString] = note;
                        localStorage.setItem(notesKey, JSON.stringify(localNotes));
                        
                        // Update editor with server content immediately
                        if (editorRef.current) {
                            setEditorContentSafely(note);
                        } else {
                            // If editor not ready, wait and try again
                            setTimeout(() => {
                                if (editorRef.current) {
                                    setEditorContentSafely(note);
                                }
                            }, 200);
                        }
                    } else if (!serverNote) {
                    } else {
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
        
        // CRITICAL: Save cursor position BEFORE formatting command
        saveCursorPosition();
        
        // CRITICAL: Set flag to prevent cursor restoration in input handler
        justUsedFormattingRef.current = true;
        
        // Ensure editor is focused
        editorRef.current.focus();
        
        // Get current selection
        const selection = window.getSelection();
        let range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        
        // For list commands, use a more reliable approach
        if (command === 'insertUnorderedList' || command === 'insertOrderedList' || command === 'insertCheckboxList') {
            const isCheckboxList = command === 'insertCheckboxList';
            const listType = command === 'insertOrderedList' ? 'ol' : 'ul';
            const selectedText = selection.toString();
            
            // If there's selected text, convert it to a list
            if (selectedText && selectedText.trim()) {
                // Split by lines and create list items
                const lines = selectedText.split('\n').filter(line => line.trim());
                
                if (lines.length > 0) {
                    // Create list element
                    const list = document.createElement(listType);
                    if (isCheckboxList) {
                        list.className = 'checkbox-list';
                    }
                    
                    lines.forEach(line => {
                        const li = document.createElement('li');
                        if (isCheckboxList) {
                            // Create checkbox list item - make entire li editable
                            li.style.display = 'flex';
                            li.style.alignItems = 'flex-start';
                            li.contentEditable = 'true';
                            
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'list-checkbox';
                            checkbox.style.marginRight = '8px';
                            checkbox.style.cursor = 'pointer';
                            checkbox.style.marginTop = '2px';
                            checkbox.style.flexShrink = '0';
                            // Prevent checkbox from being editable
                            checkbox.contentEditable = 'false';
                            li.appendChild(checkbox);
                            
                            // Add text node directly to li
                            const textNode = document.createTextNode(line.trim());
                            li.appendChild(textNode);
                        } else {
                            li.textContent = line.trim();
                        }
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
                if (isCheckboxList) {
                    list.className = 'checkbox-list';
                }
                
                const li = document.createElement('li');
                if (isCheckboxList) {
                    // Create checkbox list item - make entire li editable
                    li.style.display = 'flex';
                    li.style.alignItems = 'flex-start';
                    li.contentEditable = 'true';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'list-checkbox';
                    checkbox.style.marginRight = '8px';
                    checkbox.style.cursor = 'pointer';
                    checkbox.style.marginTop = '2px';
                    checkbox.style.flexShrink = '0';
                    // Prevent checkbox from being editable
                    checkbox.contentEditable = 'false';
                    li.appendChild(checkbox);
                    
                    // Add br for empty item
                    const br = document.createElement('br');
                    li.appendChild(br);
                } else {
                    li.innerHTML = '<br>'; // Use <br> to ensure list item is visible
                }
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
                    if (isCheckboxList) {
                        // For checkbox lists, place cursor after checkbox
                        const textNodes = Array.from(newLi.childNodes).filter(n => n.nodeType === Node.TEXT_NODE || n.nodeName === 'BR');
                        if (textNodes.length > 0) {
                            newRange.setStartBefore(textNodes[0]);
                            newRange.setEndBefore(textNodes[0]);
                        } else {
                            newRange.setStart(newLi, newLi.childNodes.length);
                            newRange.setEnd(newLi, newLi.childNodes.length);
                        }
                    } else {
                        newRange.setStart(newLi, 0);
                        newRange.setEnd(newLi, 0);
                    }
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
        
        // CRITICAL: Restore cursor position after formatting command
        // Use double RAF to ensure DOM is updated
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                restoreCursorPosition();
                // Clear flag after restoration
                setTimeout(() => {
                    justUsedFormattingRef.current = false;
                }, 100);
            });
        });
        
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
        
        // Skip cursor save/restore if Enter was just pressed or formatting was just used
        const skipCursorRestore = justPressedEnterRef.current || justUsedFormattingRef.current;
        
        if (!skipCursorRestore) {
            // Always save cursor position before any innerHTML update
            saveCursorPosition();
        }
        
        // Set the content
        editorRef.current.innerHTML = html;
        
        // Only restore cursor if Enter was NOT just pressed and formatting was NOT just used
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
            // Skip cursor save/restore if Enter was just pressed or formatting button was just clicked
            const skipCursorRestore = justPressedEnterRef.current || justUsedFormattingRef.current;
            if (skipCursorRestore) {
                // Clear the flags after a short delay (but longer than input handler's delay)
                setTimeout(() => {
                    if (justPressedEnterRef.current) {
                        justPressedEnterRef.current = false;
                    }
                    if (justUsedFormattingRef.current) {
                        justUsedFormattingRef.current = false;
                    }
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
            
            // Only restore cursor if Enter was NOT just pressed and formatting was NOT just used
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
                        return;
                    }
                    
                    const editorContent = editorRef.current.innerHTML || '';
                    // Always save if there's any change (even empty content after user clears)
                    saveNote().catch(err => {
                        console.error('❌ Auto-save error from input handler:', err);
                        // Retry once after 300ms
                        setTimeout(() => {
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
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b shadow-sm px-6 py-4 flex items-center justify-between`}>
                    <div className="flex items-center space-x-4">
                        {onClose && (
                            <button
                                onClick={() => {
                                    // CRITICAL: Save note before closing
                                    if (editorRef.current && currentDate) {
                                        const dateString = formatDateString(currentDate);
                                        const editorContent = editorRef.current.innerHTML || '';
                                        if (editorContent && editorContent.trim().length > 0) {
                                            saveNote().catch(err => console.error('Error saving before close:', err));
                                        }
                                    }
                                    // Small delay to ensure save completes
                                    setTimeout(() => {
                                        if (onClose) onClose();
                                    }, 100);
                                }}
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2.5 rounded-lg transition-all duration-200 hover:scale-105`}
                            >
                                <i className="fas fa-arrow-left text-lg"></i>
                            </button>
                        )}
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                Daily Notes
                            </h1>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                                {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
                            </p>
                        </div>
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
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 text-sm font-medium flex items-center space-x-2 shadow-md hover:shadow-lg hover:scale-105"
                    >
                        <i className="fas fa-plus"></i>
                        <span>New Note</span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4`}>
                    <div className="relative max-w-md">
                        <i className={`fas fa-search absolute left-4 top-1/2 transform -translate-y-1/2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search notes..."
                            className={`w-full pl-12 pr-4 py-3 rounded-lg border transition-all duration-200 ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500' 
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500'
                            } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50`}
                        />
                    </div>
                </div>

                {/* Notes List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {filteredNotes.length === 0 ? (
                        <div className={`text-center py-20 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <div className="inline-block p-6 rounded-full bg-gray-100 dark:bg-gray-800 mb-6">
                                <i className="fas fa-sticky-note text-5xl opacity-50"></i>
                            </div>
                            <p className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                {searchQuery ? 'No notes found' : 'No notes yet'}
                            </p>
                            <p className="text-sm">
                                {searchQuery ? 'Try a different search term' : 'Click "New Note" to create your first note'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4 max-w-4xl mx-auto">
                            {filteredNotes.map(({ dateString, date, note, noteHtml }) => (
                                <div
                                    key={dateString}
                                    onClick={() => openNote(dateString)}
                                    className={`
                                        ${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:bg-gray-50'} 
                                        border rounded-xl p-5 
                                        transition-all duration-200 
                                        cursor-pointer
                                        hover:shadow-lg
                                        hover:scale-[1.02]
                                        group
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex-1">
                                            <h3 className={`text-lg font-bold mb-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {formatDateDisplay(dateString)}
                                            </h3>
                                            <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
                                            className={`
                                                ${isDark ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-red-600 hover:text-red-700 hover:bg-red-50'} 
                                                p-2.5 rounded-lg 
                                                transition-all duration-200 
                                                ml-2
                                                opacity-0 group-hover:opacity-100
                                                hover:scale-110
                                            `}
                                            title="Delete note"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                    <div>
                                        <p className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'} line-clamp-3`}>
                                            {note.length > 200 ? note.substring(0, 200) + '...' : note || 'Empty note'}
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
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b shadow-sm px-6 py-4 flex items-center justify-between`}>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={() => setShowListView(true)}
                        className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2.5 rounded-lg transition-all duration-200 hover:scale-105`}
                        title="Back to list"
                    >
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    
                    {/* Date Navigation */}
                    <div className="flex items-center space-x-3 bg-gray-100 dark:bg-gray-700 rounded-lg px-2 py-1">
                        <button
                            onClick={goToPreviousDay}
                            className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'} p-1.5 rounded-md transition-all duration-200 hover:scale-110`}
                            title="Previous day"
                        >
                            <i className="fas fa-chevron-left text-sm"></i>
                        </button>
                        
                        <div className="text-center px-3">
                            <h1 className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {formatDateDisplay(formatDateString(currentDate))}
                            </h1>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} font-medium`}>
                                {formatDateString(currentDate)}
                            </p>
                        </div>
                        
                        <button
                            onClick={goToNextDay}
                            className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'} p-1.5 rounded-md transition-all duration-200 hover:scale-110`}
                            title="Next day"
                        >
                            <i className="fas fa-chevron-right text-sm"></i>
                        </button>
                    </div>
                </div>
                <div className="flex items-center space-x-3">
                    {isSaving && (
                        <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 rounded-lg">
                            <i className="fas fa-spinner fa-spin text-blue-600 dark:text-blue-400"></i>
                            <span className="font-medium">Auto-saving...</span>
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
                        className={`${isDark ? 'text-red-400 hover:text-red-300 hover:bg-red-900/20' : 'text-red-600 hover:text-red-700 hover:bg-red-50'} px-4 py-2 rounded-lg transition-all duration-200 font-medium flex items-center space-x-2 hover:shadow-md`}
                        title="Delete note"
                    >
                        <i className="fas fa-trash"></i>
                        <span className="text-sm">Delete</span>
                    </button>
                </div>
            </div>

            {/* Toolbar - Enhanced Design */}
            <div ref={toolbarRef} className={`${isDark ? 'bg-gray-800/95 border-gray-700' : 'bg-white border-gray-200'} border-b shadow-sm px-6 py-3 flex items-center space-x-1 flex-wrap gap-2`}>
                {/* Text Formatting Group */}
                <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => execCommand('bold')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Bold (Ctrl+B)"
                    >
                        <i className="fas fa-bold"></i>
                    </button>
                    <button
                        onClick={() => execCommand('italic')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Italic (Ctrl+I)"
                    >
                        <i className="fas fa-italic"></i>
                    </button>
                    <button
                        onClick={() => execCommand('underline')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Underline (Ctrl+U)"
                    >
                        <i className="fas fa-underline"></i>
                    </button>
                </div>
                
                {/* Alignment Group */}
                <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => execCommand('justifyLeft')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Align Left"
                    >
                        <i className="fas fa-align-left"></i>
                    </button>
                    <button
                        onClick={() => execCommand('justifyCenter')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Align Center"
                    >
                        <i className="fas fa-align-center"></i>
                    </button>
                    <button
                        onClick={() => execCommand('justifyRight')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Align Right"
                    >
                        <i className="fas fa-align-right"></i>
                    </button>
                </div>
                
                {/* Lists Group */}
                <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                    <button
                        onClick={() => execCommand('insertUnorderedList')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Bullet List"
                    >
                        <i className="fas fa-list-ul"></i>
                    </button>
                    <button
                        onClick={() => execCommand('insertOrderedList')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Numbered List"
                    >
                        <i className="fas fa-list-ol"></i>
                    </button>
                    <button
                        onClick={() => execCommand('insertCheckboxList')}
                        className={`p-2.5 rounded-md transition-all duration-200 hover:scale-110 ${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-600' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-200'}`}
                        title="Checkbox List"
                    >
                        <i className="fas fa-check-square"></i>
                    </button>
                </div>
                
                {/* Handwriting Tool - Always Visible - PROMINENT */}
                <div className="flex items-center space-x-1 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg p-1 border-2 border-blue-300 dark:border-blue-600 shadow-md">
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
                        className={`px-5 py-2.5 rounded-lg transition-all duration-200 font-bold flex items-center space-x-2 hover:shadow-lg hover:scale-105 ${
                            showHandwriting 
                                ? 'bg-blue-600 text-white shadow-lg ring-4 ring-blue-300 dark:ring-blue-500' 
                                : isDark 
                                    ? 'text-white hover:text-white hover:bg-blue-600 bg-blue-700' 
                                    : 'text-white hover:text-white hover:bg-blue-600 bg-blue-500'
                        }`}
                        title={showHandwriting ? 'Disable Handwriting (Click to stop drawing)' : 'Enable Handwriting (Click to start drawing)'}
                        style={{ minWidth: '100px' }}
                    >
                        <i className="fas fa-pen text-lg"></i>
                        <span className="text-sm font-bold">{showHandwriting ? 'Drawing' : 'Draw'}</span>
                    </button>
                </div>
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
                    /* Enhanced editor styling */
                    .daily-notes-editor {
                        caret-color: ${isDark ? '#60a5fa' : '#2563eb'};
                    }
                    .daily-notes-editor:focus {
                        outline: none;
                    }
                    .daily-notes-editor p {
                        margin: 0.75rem 0;
                    }
                    .daily-notes-editor h1, .daily-notes-editor h2, .daily-notes-editor h3 {
                        margin-top: 1.5rem;
                        margin-bottom: 0.75rem;
                        font-weight: 700;
                    }
                    /* Checkbox list styling */
                    .daily-notes-editor ul.checkbox-list {
                        list-style-type: none;
                        padding-left: 0;
                        margin: 1rem 0;
                    }
                    .daily-notes-editor ul.checkbox-list li {
                        display: flex;
                        align-items: flex-start;
                        margin: 0.75rem 0;
                        padding-left: 0;
                        min-height: 1.75rem;
                    }
                    .daily-notes-editor ul.checkbox-list li .list-checkbox {
                        margin-right: 12px;
                        margin-top: 4px;
                        cursor: pointer;
                        flex-shrink: 0;
                        width: 18px;
                        height: 18px;
                        accent-color: ${isDark ? '#60a5fa' : '#2563eb'};
                    }
                    /* Ensure checkbox lists work properly with Enter key */
                    .daily-notes-editor ul.checkbox-list li:empty::before {
                        content: '';
                        display: inline-block;
                    }
                    /* Better list styling */
                    .daily-notes-editor ul,
                    .daily-notes-editor ol {
                        margin: 1rem 0;
                        padding-left: 2.5rem;
                    }
                    .daily-notes-editor li {
                        margin: 0.5rem 0;
                        line-height: 1.75;
                    }
                `}</style>
                {/* Rich Text Editor with handwriting overlay */}
                <div className="flex-1 overflow-y-auto relative">
                    <div
                        ref={(el) => {
                            // CRITICAL: Only set ref, NEVER update content here - ref callback runs on every render!
                            // Updating content here causes cursor to jump because it runs during typing
                            editorRef.current = el;
                        }}
                        contentEditable
                        onInput={handleEditorInput}
                        onPaste={handlePaste}
                        className={`
                            daily-notes-editor
                            ${isDark ? 'bg-gray-900' : 'bg-white'}
                            min-h-full
                            px-8 py-6
                            ${isDark ? 'text-gray-100' : 'text-gray-900'}
                            text-base
                            leading-relaxed
                            focus:outline-none
                            prose prose-lg max-w-none
                            ${isDark ? 'prose-invert' : ''}
                        `}
                        style={{
                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
                            lineHeight: '1.75',
                            minHeight: 'calc(100vh - 200px)'
                        }}
                        onKeyDown={(e) => {
                            // Handle Enter key to ensure it creates a new line or list item
                            if (e.key === 'Enter' || e.keyCode === 13) {
                                const selection = window.getSelection();
                                if (selection.rangeCount > 0) {
                                    const range = selection.getRangeAt(0);
                                    let node = range.startContainer;
                                    
                                    // Check if we're inside a list item or span within checkbox list
                                    while (node && node !== editorRef.current) {
                                        // Check if we're in a checkbox list item (which is contentEditable)
                                        if (node.nodeName === 'LI' && node.contentEditable === 'true') {
                                            const listItem = node;
                                            const parentList = listItem.parentNode;
                                            const isCheckboxList = parentList && parentList.classList && parentList.classList.contains('checkbox-list');
                                            
                                            if (isCheckboxList) {
                                                // Handle Enter in checkbox list item
                                                e.preventDefault();
                                                
                                                // Create new checkbox list item
                                                const newLi = document.createElement('li');
                                                newLi.style.display = 'flex';
                                                newLi.style.alignItems = 'flex-start';
                                                newLi.contentEditable = 'true';
                                                
                                                const checkbox = document.createElement('input');
                                                checkbox.type = 'checkbox';
                                                checkbox.className = 'list-checkbox';
                                                checkbox.style.marginRight = '8px';
                                                checkbox.style.cursor = 'pointer';
                                                checkbox.style.marginTop = '2px';
                                                checkbox.style.flexShrink = '0';
                                                checkbox.contentEditable = 'false';
                                                newLi.appendChild(checkbox);
                                                
                                                const br = document.createElement('br');
                                                newLi.appendChild(br);
                                                
                                                // Insert after current list item
                                                if (listItem.nextSibling) {
                                                    parentList.insertBefore(newLi, listItem.nextSibling);
                                                } else {
                                                    parentList.appendChild(newLi);
                                                }
                                                
                                                // Move cursor to new item (after checkbox)
                                                const newRange = document.createRange();
                                                const textNodes = Array.from(newLi.childNodes).filter(n => n.nodeType === Node.TEXT_NODE || n.nodeName === 'BR');
                                                if (textNodes.length > 0) {
                                                    newRange.setStartBefore(textNodes[0]);
                                                    newRange.setEndBefore(textNodes[0]);
                                                } else {
                                                    newRange.setStart(newLi, newLi.childNodes.length);
                                                    newRange.setEnd(newLi, newLi.childNodes.length);
                                                }
                                                selection.removeAllRanges();
                                                selection.addRange(newRange);
                                                
                                                // Update state
                                                setTimeout(() => {
                                                    if (editorRef.current) {
                                                        const newHtml = editorRef.current.innerHTML;
                                                        const newText = editorRef.current.innerText || editorRef.current.textContent || '';
                                                        setCurrentNoteHtml(newHtml);
                                                        setCurrentNote(newText);
                                                        const dateString = formatDateString(currentDate);
                                                        setNotes(prev => ({ ...prev, [dateString]: newHtml }));
                                                        
                                                        const inputEvent = new Event('input', { bubbles: true });
                                                        editorRef.current.dispatchEvent(inputEvent);
                                                    }
                                                    
                                                    setTimeout(() => {
                                                        isUserTypingRef.current = false;
                                                        isUpdatingFromUserInputRef.current = false;
                                                        justPressedEnterRef.current = false;
                                                    }, 100);
                                                }, 10);
                                                
                                                return;
                                            }
                                        }
                                        
                                        // Check if we're in a span that's part of a checkbox list (legacy support)
                                        if (node.nodeName === 'SPAN' && node.parentNode && node.parentNode.nodeName === 'LI') {
                                            const listItem = node.parentNode;
                                            const parentList = listItem.parentNode;
                                            const isCheckboxList = parentList && parentList.classList && parentList.classList.contains('checkbox-list');
                                            
                                            if (isCheckboxList) {
                                                // Handle Enter in checkbox list span
                                                e.preventDefault();
                                                
                                                // Create new checkbox list item
                                                const newLi = document.createElement('li');
                                                newLi.style.display = 'flex';
                                                newLi.style.alignItems = 'flex-start';
                                                newLi.contentEditable = 'true';
                                                
                                                const checkbox = document.createElement('input');
                                                checkbox.type = 'checkbox';
                                                checkbox.className = 'list-checkbox';
                                                checkbox.style.marginRight = '8px';
                                                checkbox.style.cursor = 'pointer';
                                                checkbox.style.marginTop = '2px';
                                                checkbox.style.flexShrink = '0';
                                                checkbox.contentEditable = 'false';
                                                newLi.appendChild(checkbox);
                                                
                                                const br = document.createElement('br');
                                                newLi.appendChild(br);
                                                
                                                // Insert after current list item
                                                if (listItem.nextSibling) {
                                                    parentList.insertBefore(newLi, listItem.nextSibling);
                                                } else {
                                                    parentList.appendChild(newLi);
                                                }
                                                
                                                // Move cursor to new item
                                                const newRange = document.createRange();
                                                const textNodes = Array.from(newLi.childNodes).filter(n => n.nodeType === Node.TEXT_NODE || n.nodeName === 'BR');
                                                if (textNodes.length > 0) {
                                                    newRange.setStartBefore(textNodes[0]);
                                                    newRange.setEndBefore(textNodes[0]);
                                                } else {
                                                    newRange.setStart(newLi, newLi.childNodes.length);
                                                    newRange.setEnd(newLi, newLi.childNodes.length);
                                                }
                                                selection.removeAllRanges();
                                                selection.addRange(newRange);
                                                
                                                // Update state
                                                setTimeout(() => {
                                                    if (editorRef.current) {
                                                        const newHtml = editorRef.current.innerHTML;
                                                        const newText = editorRef.current.innerText || editorRef.current.textContent || '';
                                                        setCurrentNoteHtml(newHtml);
                                                        setCurrentNote(newText);
                                                        const dateString = formatDateString(currentDate);
                                                        setNotes(prev => ({ ...prev, [dateString]: newHtml }));
                                                        
                                                        const inputEvent = new Event('input', { bubbles: true });
                                                        editorRef.current.dispatchEvent(inputEvent);
                                                    }
                                                    
                                                    setTimeout(() => {
                                                        isUserTypingRef.current = false;
                                                        isUpdatingFromUserInputRef.current = false;
                                                        justPressedEnterRef.current = false;
                                                    }, 100);
                                                }, 10);
                                                
                                                return;
                                            }
                                        }
                                        
                                        if (node.nodeName === 'LI') {
                                            // We're in a regular list item - check if it's a checkbox list
                                            const listItem = node;
                                            const parentList = listItem.parentNode;
                                            const isCheckboxList = parentList && parentList.classList && parentList.classList.contains('checkbox-list');
                                            
                                            // We're in a list item - let browser handle it naturally for proper list behavior
                                            // Don't prevent default - browser will create new list item
                                            // Just update flags and return
                                            isUserTypingRef.current = true;
                                            lastUserInputTimeRef.current = Date.now();
                                            isUpdatingFromUserInputRef.current = true;
                                            justPressedEnterRef.current = true;
                                            
                                            // If it's a checkbox list, we need to handle it specially
                                            if (isCheckboxList) {
                                                e.preventDefault();
                                                
                                                // Create new checkbox list item
                                                const newLi = document.createElement('li');
                                                newLi.style.display = 'flex';
                                                newLi.style.alignItems = 'flex-start';
                                                newLi.contentEditable = 'true';
                                                
                                                const checkbox = document.createElement('input');
                                                checkbox.type = 'checkbox';
                                                checkbox.className = 'list-checkbox';
                                                checkbox.style.marginRight = '8px';
                                                checkbox.style.cursor = 'pointer';
                                                checkbox.style.marginTop = '2px';
                                                checkbox.style.flexShrink = '0';
                                                checkbox.contentEditable = 'false';
                                                newLi.appendChild(checkbox);
                                                
                                                const br = document.createElement('br');
                                                newLi.appendChild(br);
                                                
                                                // Insert after current list item
                                                if (listItem.nextSibling) {
                                                    parentList.insertBefore(newLi, listItem.nextSibling);
                                                } else {
                                                    parentList.appendChild(newLi);
                                                }
                                                
                                                // Move cursor to new item
                                                const newRange = document.createRange();
                                                const textNodes = Array.from(newLi.childNodes).filter(n => n.nodeType === Node.TEXT_NODE || n.nodeName === 'BR');
                                                if (textNodes.length > 0) {
                                                    newRange.setStartBefore(textNodes[0]);
                                                    newRange.setEndBefore(textNodes[0]);
                                                } else {
                                                    newRange.setStart(newLi, newLi.childNodes.length);
                                                    newRange.setEnd(newLi, newLi.childNodes.length);
                                                }
                                                selection.removeAllRanges();
                                                selection.addRange(newRange);
                                                
                                                // Update state
                                                setTimeout(() => {
                                                    if (editorRef.current) {
                                                        const newHtml = editorRef.current.innerHTML;
                                                        const newText = editorRef.current.innerText || editorRef.current.textContent || '';
                                                        setCurrentNoteHtml(newHtml);
                                                        setCurrentNote(newText);
                                                        const dateString = formatDateString(currentDate);
                                                        setNotes(prev => ({ ...prev, [dateString]: newHtml }));
                                                        
                                                        const inputEvent = new Event('input', { bubbles: true });
                                                        editorRef.current.dispatchEvent(inputEvent);
                                                    }
                                                    
                                                    setTimeout(() => {
                                                        isUserTypingRef.current = false;
                                                        isUpdatingFromUserInputRef.current = false;
                                                        justPressedEnterRef.current = false;
                                                    }, 100);
                                                }, 10);
                                                
                                                return;
                                            }
                                            
                                            // Regular list - let browser handle it naturally
                                            // Update state after a short delay to let browser create the list item
                                            setTimeout(() => {
                                                if (editorRef.current) {
                                                    const newHtml = editorRef.current.innerHTML;
                                                    const newText = editorRef.current.innerText || editorRef.current.textContent || '';
                                                    setCurrentNoteHtml(newHtml);
                                                    setCurrentNote(newText);
                                                    const dateString = formatDateString(currentDate);
                                                    setNotes(prev => ({ ...prev, [dateString]: newHtml }));
                                                    
                                                    const inputEvent = new Event('input', { bubbles: true });
                                                    editorRef.current.dispatchEvent(inputEvent);
                                                }
                                                
                                                setTimeout(() => {
                                                    isUserTypingRef.current = false;
                                                    isUpdatingFromUserInputRef.current = false;
                                                    justPressedEnterRef.current = false;
                                                }, 100);
                                            }, 10);
                                            
                                            return; // Let browser handle list item creation
                                        }
                                        node = node.parentNode;
                                    }
                                    
                                    // Not in a list - handle Enter normally
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
                                    
                                    // Clear flags after longer delay to ensure sync doesn't interfere
                                    setTimeout(() => {
                                        isUserTypingRef.current = false;
                                        isUpdatingFromUserInputRef.current = false;
                                        // Clear Enter flag after all operations complete
                                        justPressedEnterRef.current = false;
                                    }, 3000); // Increased to 3 seconds to prevent sync interference
                                }
                                
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
                                    saveNote().catch(err => console.error('Auto-save error on blur:', err));
                                }
                            }
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
                        <div className={`absolute top-6 right-6 flex flex-col items-end space-y-3 z-20`}>
                            {/* Main controls */}
                            <div className={`flex items-center space-x-2 p-3 rounded-lg shadow-lg ${
                                isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                            }`}>
                                {/* Pen Size Control */}
                                <div className="flex items-center space-x-2 px-2">
                                    <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Size:</label>
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        value={penSize}
                                        onChange={(e) => {
                                            const newSize = parseInt(e.target.value);
                                            setPenSize(newSize);
                                            if (canvasRef.current) {
                                                const ctx = canvasRef.current.getContext('2d');
                                                ctx.lineWidth = newSize;
                                            }
                                        }}
                                        className="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                        style={{
                                            background: `linear-gradient(to right, ${isDark ? '#4b5563' : '#e5e7eb'} 0%, ${isDark ? '#4b5563' : '#e5e7eb'} ${(penSize - 1) / 9 * 100}%, ${isDark ? '#6b7280' : '#d1d5db'} ${(penSize - 1) / 9 * 100}%, ${isDark ? '#6b7280' : '#d1d5db'} 100%)`
                                        }}
                                    />
                                    <span className="text-xs text-gray-700 dark:text-gray-300 w-6 text-center">{penSize}</span>
                                </div>
                                
                                {/* Color Picker */}
                                <div className="flex items-center space-x-1">
                                    <label className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">Color:</label>
                                    <div className="flex items-center space-x-1">
                                        {['#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'].map((color) => (
                                            <button
                                                key={color}
                                                onClick={() => {
                                                    setPenColor(color);
                                                    if (canvasRef.current) {
                                                        const ctx = canvasRef.current.getContext('2d');
                                                        ctx.strokeStyle = color;
                                                    }
                                                }}
                                                className={`w-6 h-6 rounded border-2 transition-all ${
                                                    penColor === color 
                                                        ? 'border-blue-500 scale-110 shadow-md' 
                                                        : isDark 
                                                            ? 'border-gray-600 hover:border-gray-500' 
                                                            : 'border-gray-300 hover:border-gray-400'
                                                }`}
                                                style={{ backgroundColor: color }}
                                                title={color}
                                            />
                                        ))}
                                        <input
                                            type="color"
                                            value={penColor}
                                            onChange={(e) => {
                                                const newColor = e.target.value;
                                                setPenColor(newColor);
                                                if (canvasRef.current) {
                                                    const ctx = canvasRef.current.getContext('2d');
                                                    ctx.strokeStyle = newColor;
                                                }
                                            }}
                                            className="w-6 h-6 rounded border border-gray-300 dark:border-gray-600 cursor-pointer"
                                            title="Custom color"
                                        />
                                    </div>
                                </div>
                                
                                <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
                                
                                <button
                                    onClick={() => {
                                        if (canvasRef.current) {
                                            // Always try to save - let saveNote function handle detection
                                            saveNote().catch(err => {
                                                console.error('Error saving drawing:', err);
                                                alert('Error saving drawing. Please try again.');
                                            });
                                        } else {
                                            alert('Canvas not initialized. Please try drawing again.');
                                        }
                                    }}
                                    className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                    title="Save drawing to note"
                                >
                                    <i className="fas fa-save mr-1"></i>
                                    Save
                                </button>
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
                            
                            {/* Info tooltip */}
                            <div className={`text-xs px-3 py-2 rounded-lg shadow-md ${
                                isDark ? 'bg-gray-800 border border-gray-700 text-gray-300' : 'bg-white border border-gray-200 text-gray-600'
                            }`}>
                                <i className="fas fa-info-circle mr-1"></i>
                                Draw with your mouse or touch screen
                            </div>
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

