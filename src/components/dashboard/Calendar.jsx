// Calendar Component for Dashboard
const { useState, useEffect } = React;

const Calendar = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [showDailyNotes, setShowDailyNotes] = useState(false);
    const [dailyNotesDate, setDailyNotesDate] = useState(null);
    const [notes, setNotes] = useState({}); // { '2024-01-15': 'note text' }
    
    // Use theme hook properly - it must be called unconditionally
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        // Fallback: check localStorage
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            // Only check localStorage, NOT system preference - respect user's explicit theme choice
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;
    
    const [isSaving, setIsSaving] = useState(false); // Prevent refresh during save
    
    // Load notes (load ALL notes, not just current month) - localStorage first for instant display, then sync from server
    useEffect(() => {
        const loadNotes = async (forceRefresh = false) => {
            try {
                const user = window.storage?.getUser?.();
                // Use user.id (from JWT sub) - this should match req.user.sub in API
                const userId = user?.id || user?.email || 'default';
                const notesKey = `user_notes_${userId}`;

                // STEP 1: Load from localStorage first for instant display (unless forcing refresh)
                if (!forceRefresh) {
                    const savedNotes = localStorage.getItem(notesKey);
                    if (savedNotes) {
                        try {
                            const parsedNotes = JSON.parse(savedNotes);
                            setNotes(parsedNotes);
                            console.log('📝 Loaded notes from localStorage:', Object.keys(parsedNotes).length);
                        } catch (e) {
                            console.error('Error parsing localStorage notes:', e);
                        }
                    }
                }

                // STEP 2: Fetch ALL notes from server (no date filter = all notes)
                // Server data ALWAYS takes priority to ensure cross-device sync
                const token = window.storage?.getToken?.();
                if (token) {
                    try {
                        // Add timestamp to prevent caching
                        const res = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
                            headers: { 
                                Authorization: `Bearer ${token}`,
                                'Cache-Control': 'no-cache, no-store, must-revalidate',
                                'Pragma': 'no-cache'
                            },
                            credentials: 'include',
                            cache: 'no-store' // Prevent browser caching
                        });
                        if (res.ok) {
                            const data = await res.json();
                            console.log('📋 Raw API response:', data);
                            console.log('📋 Response structure:', {
                                hasData: !!data,
                                hasNotes: !!data.notes,
                                notesType: typeof data.notes,
                                notesKeys: data.notes ? Object.keys(data.notes) : [],
                                dataKeys: Object.keys(data || {}),
                                fullResponse: JSON.stringify(data, null, 2)
                            });
                            // The API wraps response in {data: {notes: {...}}}
                            // So we need to access data.data.notes, not data.notes
                            const serverNotes = data?.data?.notes || data?.notes || {};
                            console.log('📝 Loaded notes from server:', Object.keys(serverNotes).length, 'dates');
                            if (Object.keys(serverNotes).length > 0) {
                                console.log('📅 Note dates found:', Object.keys(serverNotes));
                            }
                            
                            // CRITICAL: Don't overwrite if DailyNotes component is actively editing
                            // Check if there's a note being edited in DailyNotes
                            const editingDate = sessionStorage.getItem('calendar_editing_date');
                            const isSaving = sessionStorage.getItem('calendar_is_saving') === 'true';
                            
                            if (editingDate && (isSaving || document.querySelector('.daily-notes-container'))) {
                                console.log('⚠️ Skipping Calendar refresh - note being edited for date:', editingDate);
                                // Keep existing notes but merge other dates from server
                                // Read current notes from localStorage (most up-to-date source)
                                const currentNotesStr = localStorage.getItem(notesKey);
                                const currentNotes = currentNotesStr ? JSON.parse(currentNotesStr) : {};
                                const mergedNotes = { ...currentNotes };
                                // Only update dates that aren't being edited
                                Object.keys(serverNotes).forEach(date => {
                                    if (date !== editingDate) {
                                        mergedNotes[date] = serverNotes[date];
                                    }
                                });
                                setNotes(mergedNotes);
                                localStorage.setItem(notesKey, JSON.stringify(mergedNotes));
                                return true;
                            }
                            
                            // SERVER DATA ALWAYS TAKES PRIORITY - replace entirely, not merge
                            // This ensures cross-device synchronization
                            setNotes(serverNotes);
                            
                            // REPLACE localStorage entirely with server data (not merge)
                            // This ensures phone gets PC's data and vice versa
                            localStorage.setItem(notesKey, JSON.stringify(serverNotes));
                            console.log('✅ Calendar notes synchronized with server');
                            return true;
                        } else {
                            const errorText = await res.text();
                            // Suppress error logs for database connection errors and server errors (500, 502, 503, 504)
                            const isServerError = res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504;
                            const isDatabaseError = errorText.includes('DATABASE_CONNECTION_ERROR') ||
                                                   errorText.includes('Database connection failed') ||
                                                   errorText.includes('unreachable');
                            
                            if (!isDatabaseError && !isServerError) {
                                console.warn('Failed to load notes from server:', res.status, errorText);
                            }
                            return false;
                        }
                    } catch (error) {
                        // Suppress error logs for database connection errors and server errors
                        const errorMessage = error?.message || String(error);
                        const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                              errorMessage.includes('unreachable') ||
                                              errorMessage.includes('ECONNREFUSED') ||
                                              errorMessage.includes('ETIMEDOUT');
                        const isServerError = errorMessage.includes('500') || 
                                             errorMessage.includes('502') || 
                                             errorMessage.includes('503') || 
                                             errorMessage.includes('504');
                        
                        if (!isDatabaseError && !isServerError) {
                            console.error('Error fetching notes from server:', error);
                        }
                        return false;
                    }
                }
                return false;
            } catch (error) {
                // Suppress error logs for database connection errors and server errors
                const errorMessage = error?.message || String(error);
                const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                      errorMessage.includes('unreachable') ||
                                      errorMessage.includes('ECONNREFUSED') ||
                                      errorMessage.includes('ETIMEDOUT');
                const isServerError = errorMessage.includes('500') || 
                                     errorMessage.includes('502') || 
                                     errorMessage.includes('503') || 
                                     errorMessage.includes('504');
                
                if (!isDatabaseError && !isServerError) {
                    console.error('Error loading notes:', error);
                }
                return false;
            }
        };
        
        // Initial load
        loadNotes();
        
        // Refresh when page becomes visible again (user switches back to tab/window)
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                console.log('📝 Page visible - refreshing calendar notes from server');
                loadNotes(true); // Force refresh from server
            }
        };
        
        // Refresh when window regains focus (better for cross-device sync)
        const handleFocus = () => {
            console.log('📝 Window focused - refreshing calendar notes from server');
            loadNotes(true); // Force refresh from server
        };
        
        // Periodic refresh when page is visible (every 30 seconds)
        // But skip refresh if we're currently saving
        let refreshInterval = null;
        const startPeriodicRefresh = () => {
            if (refreshInterval) clearInterval(refreshInterval);
            refreshInterval = setInterval(() => {
                // Skip refresh if saving is in progress (check via closure)
                const checkSaving = () => {
                    // We'll use a ref-like pattern or check localStorage flag
                    const savingFlag = sessionStorage.getItem('calendar_is_saving');
                    return savingFlag === 'true';
                };
                
                if (!document.hidden && !checkSaving()) {
                    console.log('📝 Periodic refresh - syncing calendar notes from server');
                    loadNotes(true);
                } else if (checkSaving()) {
                    console.log('⏸️ Skipping periodic refresh - save in progress');
                }
            }, 30000); // Refresh every 30 seconds when visible
        };
        
        startPeriodicRefresh();
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            if (refreshInterval) clearInterval(refreshInterval);
        };
    }, []); // Only load once on mount, not when month changes
    
    // Save notes to server if authenticated, always cache in localStorage
    const saveNotes = async (dateString, noteText) => {
        setIsSaving(true);
        sessionStorage.setItem('calendar_is_saving', 'true');
        
        try {
            const user = window.storage?.getUser?.();
            // Use user.id (from JWT sub) - this should match req.user.sub in API
            const userId = user?.id || user?.email || 'default';
            const notesKey = `user_notes_${userId}`;
            
            // Store previous state in case we need to revert
            const previousNotes = { ...notes };
            const updatedNotes = { ...notes, [dateString]: noteText };

            // Optimistic update - show immediately
            setNotes(updatedNotes);
            
            // Save to localStorage immediately for instant feedback
            try {
                localStorage.setItem(notesKey, JSON.stringify(updatedNotes));
                console.log('✅ Saved note to localStorage:', dateString);
            } catch (e) {
                console.error('Error saving to localStorage:', e);
            }

            // Save to server - this ensures cross-device sync
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No authentication token - note saved locally only');
                setIsSaving(false);
                sessionStorage.removeItem('calendar_is_saving');
                return;
            }
            
            try {
                // Validate dateString format before sending
                if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                    console.error('❌ Invalid date format:', dateString);
                    setIsSaving(false);
                    sessionStorage.removeItem('calendar_is_saving');
                    return;
                }
                
                const requestBody = { 
                    date: dateString, 
                    note: noteText || '' 
                };
                
                console.log('📤 Sending calendar note to server:', requestBody);
                
                const res = await fetch('/api/calendar-notes', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        Authorization: `Bearer ${token}`,
                        'Cache-Control': 'no-cache'
                    },
                    credentials: 'include',
                    body: JSON.stringify(requestBody)
                });
                
                if (res.ok) {
                    const response = await res.json();
                    console.log('✅ Saved note to server successfully:', dateString, response);
                    
                    // The API wraps response in {data: {saved: true, ...}}
                    const data = response?.data || response;
                    console.log('📋 Parsed response data:', data);
                    
                    // Verify the save was successful
                    if (data?.saved !== false) {
                        // Wait longer before refresh to ensure server has fully processed
                        // Also retry if note isn't found immediately
                        let retryCount = 0;
                        const maxRetries = 3;
                        
                        const verifyAndRefresh = async () => {
                            try {
                                const refreshRes = await fetch(`/api/calendar-notes?t=${Date.now()}`, {
                                    headers: { 
                                        Authorization: `Bearer ${token}`,
                                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                                        'Pragma': 'no-cache'
                                    },
                                    credentials: 'include',
                                    cache: 'no-store'
                                });
                                
                                if (refreshRes.ok) {
                                    const refreshData = await refreshRes.json();
                                    console.log('📋 Refresh response:', refreshData);
                                    console.log('📋 Refresh response structure:', {
                                        hasData: !!refreshData,
                                        hasNotes: !!refreshData.notes,
                                        notesType: typeof refreshData.notes,
                                        dataKeys: Object.keys(refreshData || {}),
                                        fullResponse: JSON.stringify(refreshData, null, 2)
                                    });
                                    // The API wraps response in {data: {notes: {...}}}
                                    // So we need to access data.data.notes, not data.notes
                                    const serverNotes = refreshData?.data?.notes || refreshData?.notes || {};
                                    
                                    console.log('📋 Server notes keys:', Object.keys(serverNotes));
                                    console.log('📋 Server notes object:', serverNotes);
                                    console.log('🔍 Looking for note on date:', dateString);
                                    console.log('✅ Note found on server:', serverNotes[dateString] ? 'YES' : 'NO');
                                    if (serverNotes[dateString]) {
                                        console.log('📝 Note content:', serverNotes[dateString]);
                                    }
                                    
                                    if (serverNotes[dateString]) {
                                        // Note is confirmed on server - update state
                                        setNotes(serverNotes);
                                        localStorage.setItem(notesKey, JSON.stringify(serverNotes));
                                        console.log('✅ Calendar notes refreshed after save - verified saved:', dateString, 'YES');
                                        
                                        setIsSaving(false);
                                        sessionStorage.removeItem('calendar_is_saving');
                                        
                                        // Show success message to user
                                        if (window.showNotification) {
                                            window.showNotification('Calendar note saved successfully', 'success');
                                        }
                                    } else if (retryCount < maxRetries) {
                                        // Note not found yet, retry after delay
                                        retryCount++;
                                        console.log(`⏳ Note not found yet, retrying (${retryCount}/${maxRetries})...`);
                                        setTimeout(verifyAndRefresh, 1000 * retryCount); // Exponential backoff
                                    } else {
                                        // Max retries reached, but still update with what server has
                                        console.warn('⚠️ Note not found after max retries, but updating with server data anyway');
                                        setNotes(serverNotes);
                                        localStorage.setItem(notesKey, JSON.stringify(serverNotes));
                                        setIsSaving(false);
                                        sessionStorage.removeItem('calendar_is_saving');
                                    }
                                } else {
                                    console.error('❌ Failed to refresh after save:', refreshRes.status);
                                    setIsSaving(false);
                                    sessionStorage.removeItem('calendar_is_saving');
                                }
                            } catch (refreshError) {
                                console.error('Error refreshing after save:', refreshError);
                                if (retryCount < maxRetries) {
                                    retryCount++;
                                    setTimeout(verifyAndRefresh, 1000 * retryCount);
                                } else {
                                    setIsSaving(false);
                                    sessionStorage.removeItem('calendar_is_saving');
                                }
                            }
                        };
                        
                        // Start verification after initial delay
                        setTimeout(verifyAndRefresh, 1500); // Longer delay to ensure server processing
                    } else {
                        console.error('❌ Server returned saved=false:', data);
                        alert('Failed to save calendar note. Please try again.');
                        setNotes(previousNotes);
                        localStorage.setItem(notesKey, JSON.stringify(previousNotes));
                        setIsSaving(false);
                        sessionStorage.removeItem('calendar_is_saving');
                    }
                } else {
                    const errorText = await res.text();
                    let errorData;
                    try {
                        errorData = JSON.parse(errorText);
                    } catch (e) {
                        errorData = { message: errorText };
                    }
                    console.error('❌ Failed to save note to server:', res.status, errorData);
                    console.error('Request body was:', requestBody);
                    console.error('User ID from storage:', userId);
                    
                    // Show error to user
                    const errorMessage = errorData?.error?.message || errorData?.message || `Failed to save: ${res.status}`;
                    alert(`Failed to save calendar note: ${errorMessage}`);
                    
                    // Revert optimistic update on error - restore previous state
                    setNotes(previousNotes);
                    localStorage.setItem(notesKey, JSON.stringify(previousNotes));
                    console.warn('⚠️ Reverted note due to server error');
                    setIsSaving(false);
                    sessionStorage.removeItem('calendar_is_saving');
                }
            } catch (error) {
                console.error('❌ Error saving note to server:', error);
                console.error('Error details:', {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                });
                
                // Show error to user
                alert(`Network error saving calendar note: ${error.message}. The note may still be saved - please refresh to check.`);
                
                // Don't revert on network errors - the note might have been saved
                // The periodic refresh will sync the correct state
                // Try to verify by refreshing after a delay
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
                            const serverNotes = verifyData?.notes || {};
                            setNotes(serverNotes);
                            localStorage.setItem(notesKey, JSON.stringify(serverNotes));
                            console.log('✅ Calendar notes synced after network error');
                        }
                        } catch (verifyError) {
                            console.error('Error verifying save:', verifyError);
                        } finally {
                            setIsSaving(false);
                            sessionStorage.removeItem('calendar_is_saving');
                        }
                    }, 1000);
            }
        } catch (error) {
            console.error('Error saving notes:', error);
            setIsSaving(false);
            sessionStorage.removeItem('calendar_is_saving');
        }
    };
    
    // Get month name
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    
    // Get first day of month and number of days
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startingDayOfWeek = firstDayOfMonth.getDay();
    
    // Get days array
    const days = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
        days.push(null);
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        days.push(day);
    }
    
    // Navigate months
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };
    
    const goToNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };
    
    const goToToday = () => {
        setCurrentDate(new Date());
    };
    
    // Handle day click - open DailyNotes full-page editor
    const handleDayClick = (day) => {
        if (day === null) return;
        
        console.log('📅 Calendar: Day clicked, opening DailyNotes...');
        const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        
        // Check if DailyNotes is available
        if (!window.DailyNotes) {
            console.warn('⚠️ DailyNotes not loaded yet, will wait for it...');
            // Force load DailyNotes by triggering lazy loader if available
            if (window.triggerLazyLoad) {
                window.triggerLazyLoad('DailyNotes');
            }
        }
        
        setDailyNotesDate(date);
        setShowDailyNotes(true);
        setDailyNotesLoaded(window.DailyNotes ? true : false);
    };
    
    // Handle opening daily notes list view
    const handleOpenDailyNotes = () => {
        console.log('📝 Calendar: Opening Daily Notes list view...');
        
        // Check if DailyNotes is available
        if (!window.DailyNotes) {
            console.warn('⚠️ DailyNotes not loaded yet, will wait for it...');
            // Force load DailyNotes by triggering lazy loader if available
            if (window.triggerLazyLoad) {
                window.triggerLazyLoad('DailyNotes');
            }
        }
        
        setDailyNotesDate(null);
        setShowDailyNotes(true);
        setDailyNotesLoaded(window.DailyNotes ? true : false);
    };
    
    // Format date string helper
    const formatDateString = (year, month, day) => {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };
    
    // Check if day has notes
    const hasNotes = (day) => {
        if (day === null) return false;
        const dateString = formatDateString(currentDate.getFullYear(), currentDate.getMonth(), day);
        return notes[dateString] && notes[dateString].trim().length > 0;
    };
    
    // Check if day is today
    const isToday = (day) => {
        if (day === null) return false;
        const today = new Date();
        return (
            currentDate.getFullYear() === today.getFullYear() &&
            currentDate.getMonth() === today.getMonth() &&
            day === today.getDate()
        );
    };
    
    // Wait for DailyNotes component to load (lazy loading)
    const [dailyNotesLoaded, setDailyNotesLoaded] = useState(false);
    
    useEffect(() => {
        if (showDailyNotes && !window.DailyNotes) {
            // Manually load DailyNotes component if not already loaded
            console.log('📥 Calendar: Loading DailyNotes component...');
            const script = document.createElement('script');
            script.src = './dist/src/components/daily-notes/DailyNotes.js';
            script.async = true;
            script.onload = () => {
                console.log('✅ DailyNotes script loaded');
                // Wait a bit for component to register
                setTimeout(() => {
                    if (window.DailyNotes) {
                        console.log('✅ DailyNotes component registered');
                        setDailyNotesLoaded(true);
                    } else {
                        console.error('❌ DailyNotes script loaded but component not registered');
                    }
                }, 100);
            };
            script.onerror = () => {
                console.error('❌ Failed to load DailyNotes script');
            };
            document.body.appendChild(script);
            
            // Also wait for DailyNotes to load (check every 100ms for up to 5 seconds)
            let attempts = 0;
            const maxAttempts = 50;
            const checkInterval = setInterval(() => {
                attempts++;
                if (window.DailyNotes) {
                    console.log('✅ DailyNotes component loaded');
                    setDailyNotesLoaded(true);
                    clearInterval(checkInterval);
                } else if (attempts >= maxAttempts) {
                    console.error('❌ DailyNotes component failed to load after 5 seconds');
                    clearInterval(checkInterval);
                }
            }, 100);
            
            return () => {
                clearInterval(checkInterval);
            };
        } else if (showDailyNotes && window.DailyNotes) {
            setDailyNotesLoaded(true);
        }
    }, [showDailyNotes]);
    
    // Get DailyNotes component
    const DailyNotes = window.DailyNotes || (() => {
        console.warn('⚠️ DailyNotes component not available yet');
        return null;
    });
    
    return (
        <>
            {/* Daily Notes Full-Page View - Only show when explicitly opened */}
            {showDailyNotes && (
                <>
                    {dailyNotesLoaded && DailyNotes ? (
                        <DailyNotes 
                            initialDate={dailyNotesDate}
                            onClose={() => {
                                setShowDailyNotes(false);
                                setDailyNotesDate(null);
                                setDailyNotesLoaded(false);
                                // Reload notes after closing
                                const loadNotes = async () => {
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
                                            }
                                        }
                                    } catch (error) {
                                        console.error('Error reloading notes:', error);
                                    }
                                };
                                loadNotes();
                            }}
                        />
                    ) : (
                        <div className={`fixed inset-0 z-50 ${isDark ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className={isDark ? 'text-gray-300' : 'text-gray-600'}>Loading Daily Notes...</p>
                                <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {window.DailyNotes ? 'Initializing...' : 'Loading component...'}
                                </p>
                            </div>
                        </div>
                    )}
                </>
            )}
            
            {/* Calendar Widget - Always render unless DailyNotes is open */}
            {!showDailyNotes ? (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border shadow-lg p-3 sm:p-4 w-full max-w-sm mx-auto transition-all duration-200`} style={{ display: 'block', visibility: 'visible' }}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 sm:mb-4 gap-2 sm:gap-0">
                        <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-start">
                            <button
                                onClick={goToPreviousMonth}
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'} p-2 sm:p-2 rounded-lg transition-all duration-200 active:scale-95 text-sm min-w-[44px] min-h-[44px] flex items-center justify-center`}
                                title="Previous month"
                            >
                                <i className="fas fa-chevron-left"></i>
                            </button>
                            <h2 className={`text-sm sm:text-base font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'} flex-1 text-center sm:text-left sm:flex-none`}>
                                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                            </h2>
                            <button
                                onClick={goToNextMonth}
                                className={`${isDark ? 'text-gray-300 hover:text-white hover:bg-gray-700 active:bg-gray-600' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200'} p-2 sm:p-2 rounded-lg transition-all duration-200 active:scale-95 text-sm min-w-[44px] min-h-[44px] flex items-center justify-center`}
                                title="Next month"
                            >
                                <i className="fas fa-chevron-right"></i>
                            </button>
                        </div>
                        <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                            <button
                                onClick={handleOpenDailyNotes}
                                className={`text-xs sm:text-xs ${isDark ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white'} font-medium px-3 py-2 sm:py-1.5 rounded-lg transition-all duration-200 active:scale-95 flex items-center space-x-1.5 min-h-[44px] sm:min-h-[auto]`}
                                title="Open Daily Notes"
                            >
                                <i className="fas fa-sticky-note"></i>
                                <span>Notes</span>
                            </button>
                            <button
                                onClick={goToToday}
                                className={`text-xs sm:text-xs ${isDark ? 'text-blue-400 hover:text-blue-300 hover:bg-gray-700 active:bg-gray-600' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 active:bg-blue-100'} font-medium px-3 py-2 sm:py-1.5 rounded-lg transition-all duration-200 active:scale-95 min-h-[44px] sm:min-h-[auto]`}
                            >
                                Today
                            </button>
                        </div>
                    </div>
                
                {/* Day names header */}
                <div className="grid grid-cols-7 mb-2" style={{ gap: '2px' }}>
                    {dayNames.map(day => (
                        <div
                            key={day}
                            className={`text-center text-[10px] sm:text-xs font-semibold py-1 sm:py-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
                        >
                            {day.substring(0, 3)}
                        </div>
                    ))}
                </div>
                
                {/* Calendar grid - improved spacing and design */}
                <div className="grid grid-cols-7" style={{ gap: '2px' }}>
                    {days.map((day, index) => {
                        if (day === null) {
                            return <div key={`empty-${index}`} className="aspect-square"></div>;
                        }
                        
                        const dateString = formatDateString(currentDate.getFullYear(), currentDate.getMonth(), day);
                        const dayHasNotes = hasNotes(day);
                        const dayIsToday = isToday(day);
                        
                        return (
                            <button
                                key={day}
                                onClick={() => handleDayClick(day)}
                                className={`
                                    aspect-square rounded-lg transition-all duration-200 text-xs sm:text-sm font-medium
                                    ${dayIsToday 
                                        ? isDark 
                                            ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg ring-2 ring-blue-400 ring-opacity-50' 
                                            : 'bg-gradient-to-br from-blue-500 to-blue-600 text-white shadow-lg ring-2 ring-blue-300 ring-opacity-50'
                                        : isDark
                                            ? 'text-gray-200 active:bg-gray-700 bg-gray-800/50 active:shadow-md active:scale-95'
                                            : 'text-gray-900 active:bg-blue-50 bg-white active:shadow-md active:scale-95'
                                    }
                                    ${dayHasNotes ? 'font-bold' : 'font-normal'}
                                    flex flex-col items-center justify-center relative
                                    border
                                    ${dayIsToday 
                                        ? 'border-blue-400' 
                                        : isDark ? 'border-gray-700' : 'border-gray-200'
                                    }
                                    box-border group
                                    touch-manipulation
                                `}
                                style={{ 
                                    borderWidth: dayIsToday ? '2px' : '1px',
                                    margin: 0,
                                    minHeight: '44px',
                                    WebkitTapHighlightColor: 'transparent'
                                }}
                            >
                                <span className={`${dayIsToday ? 'text-white' : ''} relative z-10 text-[11px] sm:text-sm`}>{day}</span>
                                {dayHasNotes && (
                                    <div className={`absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 sm:w-1.5 sm:h-1.5 rounded-full transition-all duration-200 ${
                                        dayIsToday 
                                            ? 'bg-white shadow-sm' 
                                            : isDark 
                                                ? 'bg-blue-400 group-active:bg-blue-300' 
                                                : 'bg-blue-600 group-active:bg-blue-500'
                                    }`}></div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            ) : null}
        </>
    );
};

// Day Notes Modal Component
const DayNotesModal = ({ date, dateString, initialNote, onSave, onClose, isDark }) => {
    const [note, setNote] = useState(initialNote || '');
    
    const formatDateDisplay = (date) => {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    };
    
    const handleSave = async () => {
        console.log('💾 DayNotesModal: Save button clicked, note:', note.substring(0, 50));
        try {
            await onSave(note);
            console.log('✅ DayNotesModal: onSave completed');
        } catch (error) {
            console.error('❌ DayNotesModal: Error in onSave:', error);
            alert(`Failed to save: ${error.message || 'Unknown error'}`);
        }
    };
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black bg-opacity-50"
                onClick={onClose}
            ></div>
            
            {/* Modal */}
            <div className={`
                relative w-full max-w-md ${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl
            `}>
                {/* Header */}
                <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                        <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            Notes for {formatDateDisplay(date)}
                        </h3>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'} mt-1`}>
                            {dateString}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} p-1 rounded`}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                
                {/* Content */}
                <div className="p-4">
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Write your notes for this day..."
                        className={`
                            w-full h-64 p-3 rounded border resize-none
                            ${isDark 
                                ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                                : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            }
                            focus:outline-none focus:ring-2 focus:ring-blue-500
                        `}
                    />
                </div>
                
                {/* Footer */}
                <div className={`flex items-center justify-end space-x-2 p-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <button
                        onClick={onClose}
                        className={`
                            px-4 py-2 rounded text-sm font-medium transition-colors
                            ${isDark 
                                ? 'text-gray-300 hover:text-white hover:bg-gray-700' 
                                : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                            }
                        `}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        Save Notes
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally - ensure it's always registered
if (typeof window !== 'undefined') {
    window.Calendar = Calendar;
    
    // Dispatch event to notify that Calendar is ready
    if (typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('calendarComponentReady'));
        } catch (e) {
            // Ignore event errors
        }
    }
}

