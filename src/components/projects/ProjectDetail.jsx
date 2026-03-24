// Get dependencies from window

// ROBUST ProjectDetail Loader - Multiple layers of protection
(function waitForDependenciesAndLoad() {
    // Prevent duplicate initialization
    if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
        return;
    }
    
    // Check if we're already initializing
    if (window._projectDetailInitializing) {
        return;
    }
    
    // Track initialization state
    window._projectDetailInitializing = true;
    
    // Define required dependencies with their validation functions
    const requiredDependencies = {
        React: () => window.React && window.React.useState && window.React.useEffect && window.React.useRef,
        // Optional dependencies (will check but not fail if missing)
        storage: () => window.storage,
        ListModal: () => window.ListModal,
        ProjectModal: () => window.ProjectModal,
        CustomFieldModal: () => window.CustomFieldModal,
        TaskDetailModal: () => window.TaskDetailModal,
        KanbanView: () => window.KanbanView,
        CommentsPopup: () => window.CommentsPopup,
        DocumentCollectionModal: () => window.DocumentCollectionModal
    };
    
    const criticalDependencies = ['React'];
    
    // Check dependencies
    const checkDependencies = () => {
        const missing = [];
        const optional = [];
        
        for (const [name, checkFn] of Object.entries(requiredDependencies)) {
            if (!checkFn()) {
                if (criticalDependencies.includes(name)) {
                    missing.push(name);
                } else {
                    optional.push(name);
                }
            }
        }
        
        return { missing, optional };
    };
    
    // Wait for dependencies with exponential backoff
    let attempt = 0;
    const maxAttempts = 150; // 15 seconds max (with exponential backoff)
    let baseDelay = 50; // Start with 50ms
    
    const waitForDependencies = () => {
        const { missing, optional } = checkDependencies();
        
        if (missing.length === 0) {
            // All critical dependencies available
            if (optional.length > 0) {
                // Use debug level - these are optional and component will work fine
                console.debug(`ℹ️ ProjectDetail: Optional dependencies not yet loaded: ${optional.join(', ')} (will load on demand)`);
            }
            initializeProjectDetail();
            return;
        }
        
        attempt++;
        if (attempt >= maxAttempts) {
            console.error(`❌ ProjectDetail: Critical dependencies still missing after ${attempt * baseDelay}ms:`, missing);
            console.error('❌ Missing dependencies:', missing);
            console.error('❌ Attempting to initialize anyway - may fail');
            window._projectDetailInitializing = false;
            initializeProjectDetail(); // Try anyway
            return;
        }
        
        // Exponential backoff: 50ms, 75ms, 112ms, 168ms, etc. (max 500ms)
        const delay = Math.min(baseDelay * Math.pow(1.5, attempt - 1), 500);
        setTimeout(waitForDependencies, delay);
    };
    
    // Start waiting
    const { missing, optional } = checkDependencies();
    if (missing.length === 0) {
        if (optional.length > 0) {
            // Use debug level - these are optional and component will work fine
            console.debug(`ℹ️ ProjectDetail: Optional dependencies not yet loaded: ${optional.join(', ')} (will load on demand)`);
        }
        initializeProjectDetail();
    } else {
        waitForDependencies();
    }
    
    // Also listen for React load event
    const handleReactReady = () => {
        const { missing } = checkDependencies();
        if (missing.length === 0 && window._projectDetailInitializing) {
            window.removeEventListener('babelready', handleReactReady);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
            if (!window.ProjectDetail) {
                initializeProjectDetail();
            }
        }
    };
    
    // Listen for when dependencies become available
    const handleComponentLoaded = (event) => {
        if (event.detail && event.detail.component) {
            const compName = event.detail.component;
            if (requiredDependencies[compName] && requiredDependencies[compName]()) {
                const { missing } = checkDependencies();
                if (missing.length === 0 && window._projectDetailInitializing && !window.ProjectDetail) {
                    window.removeEventListener('componentLoaded', handleComponentLoaded);
                    window.removeEventListener('babelready', handleReactReady);
                    initializeProjectDetail();
                }
            }
        }
    };
    
    window.addEventListener('babelready', handleReactReady);
    window.addEventListener('componentLoaded', handleComponentLoaded);
})();

function initializeProjectDetail() {
    // Prevent duplicate initialization
    if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
        window._projectDetailInitializing = false;
        return;
    }
    
    // Final check: Ensure React is available
    if (!window.React || !window.React.useState || !window.React.useEffect || !window.React.useRef) {
        console.error('❌ ProjectDetail: React still not available in initializeProjectDetail!');
        console.error('❌ Available React:', typeof window.React, window.React);
        console.error('❌ Will retry initialization after React loads...');
        window._projectDetailInitializing = false;
        
        // Set up retry mechanism
        const retryInitialization = () => {
            if (!window.ProjectDetail && window.React && window.React.useState) {
                window._projectDetailInitializing = true;
                initializeProjectDetail();
            }
        };
        
        // Retry on React ready event
        const handleRetry = () => {
            if (window.React && window.React.useState) {
                window.removeEventListener('babelready', handleRetry);
                retryInitialization();
            }
        };
        window.addEventListener('babelready', handleRetry);
        
        // Also poll as fallback
        setTimeout(() => {
            if (!window.ProjectDetail && window.React && window.React.useState) {
                retryInitialization();
            }
        }, 1000);
        
        return;
    }
    
    
    const { useState, useEffect, useRef, useCallback, useMemo } = window.React;
    const storage = window.storage;
    const ProjectModal = window.ProjectModal;
    const CustomFieldModal = window.CustomFieldModal;
    const KanbanView = window.KanbanView;
    const DocumentCollectionModal = window.DocumentCollectionModal;

    // Time tracking section: stable component so inputs/buttons stay interactive (not recreated on parent render)
    const TimeTrackingSection = ({ project: timeProject }) => {
        const [entries, setEntries] = useState([]);
        const [loading, setLoading] = useState(true);
        const [timerRunning, setTimerRunning] = useState(false);
        const [timerStartedAt, setTimerStartedAt] = useState(null);
        const [timerDescription, setTimerDescription] = useState('');
        const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
        const [manualStartTime, setManualStartTime] = useState('09:00');
        const [manualEndTime, setManualEndTime] = useState('17:00');
        const [manualDescription, setManualDescription] = useState('');
        const [elapsed, setElapsed] = useState(0);
        const [lastRecordedStart, setLastRecordedStart] = useState(null);
        const [lastRecordedStop, setLastRecordedStop] = useState(null);
        const timerTickRef = useRef(null);

        const getTimeApiBase = () => (window.DatabaseAPI && window.DatabaseAPI.API_BASE) || window.location.origin;
        const getTimeAuthHeaders = () => {
            const token = window.storage?.getToken?.();
            if (!token) return null;
            return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
        };

        const loadEntries = useCallback(async () => {
            if (!timeProject?.id) return;
            setLoading(true);
            try {
                let list = [];
                const headers = getTimeAuthHeaders();
                if (!headers) {
                    setEntries([]);
                    return;
                }
                const base = getTimeApiBase();
                const r = await fetch(`${base}/api/time-entries?projectId=${encodeURIComponent(timeProject.id)}`, {
                    method: 'GET',
                    headers,
                    credentials: 'include'
                });
                if (r.ok) {
                    const j = await r.json();
                    list = Array.isArray(j.data) ? j.data : (Array.isArray(j) ? j : []);
                }
                setEntries(list);
            } catch (e) {
                console.warn('Time entries load failed:', e);
                setEntries([]);
            } finally {
                setLoading(false);
            }
        }, [timeProject?.id]);

        useEffect(() => {
            loadEntries();
        }, [loadEntries]);

        useEffect(() => {
            if (!timerRunning || !timerStartedAt) {
                if (timerTickRef.current) clearInterval(timerTickRef.current);
                return;
            }
            const tick = () => setElapsed(Math.floor((Date.now() - timerStartedAt) / 1000));
            tick();
            timerTickRef.current = setInterval(tick, 1000);
            return () => { if (timerTickRef.current) clearInterval(timerTickRef.current); };
        }, [timerRunning, timerStartedAt]);

        const formatElapsed = (sec) => {
            const h = Math.floor(sec / 3600);
            const m = Math.floor((sec % 3600) / 60);
            const s = sec % 60;
            return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
        };

        const handleStartTimer = () => {
            setLastRecordedStart(null);
            setLastRecordedStop(null);
            setTimerStartedAt(Date.now());
            setTimerRunning(true);
        };

        const createTimeEntryFetch = async (payload) => {
            const headers = getTimeAuthHeaders();
            if (!headers) throw new Error('Not logged in');
            const base = getTimeApiBase();
            const r = await fetch(`${base}/api/time-entries`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const text = await r.text();
            if (!r.ok) {
                let msg = 'Request failed';
                try {
                    const err = text ? JSON.parse(text) : {};
                    msg = (err.error && err.error.message) || err.message || err.error || msg;
                } catch (_) { msg = text.slice(0, 100) || msg; }
                throw new Error(String(msg) + (r.status ? ' (' + r.status + ')' : ''));
            }
            const j = text ? JSON.parse(text) : {};
            return (j && j.data) || j;
        };

        const handleStopTimer = async () => {
            if (!timerRunning || !timerStartedAt || !timeProject?.id) return;
            const stoppedAt = Date.now();
            const sec = Math.floor((stoppedAt - timerStartedAt) / 1000);
            const hours = Math.round((sec / 3600) * 100) / 100;
            setLastRecordedStart(timerStartedAt);
            setLastRecordedStop(stoppedAt);
            setTimerRunning(false);
            setTimerStartedAt(null);
            setElapsed(0);
            const payload = {
                date: new Date(timerStartedAt).toISOString(),
                hours,
                projectId: timeProject.id,
                projectName: (timeProject.name || '').toString(),
                description: (timerDescription || 'Timer entry').toString()
            };
            try {
                const newEntry = await createTimeEntryFetch(payload);
                if (newEntry && (newEntry.id || newEntry.hours != null)) {
                    setEntries(prev => [newEntry, ...prev]);
                } else {
                    await loadEntries();
                }
                setTimerDescription('');
            } catch (e) {
                console.warn('Save timer entry failed:', e);
                alert('Could not save time entry: ' + (e?.message || 'Please try again.'));
            }
        };

        const handleAddManual = async () => {
            const dateStr = manualDate || new Date().toISOString().slice(0, 10);
            const startDt = new Date(dateStr + 'T' + (manualStartTime || '00:00') + ':00');
            const endDt = new Date(dateStr + 'T' + (manualEndTime || '00:00') + ':00');
            if (Number.isNaN(startDt.getTime()) || Number.isNaN(endDt.getTime())) {
                alert('Please enter valid date and times.');
                return;
            }
            const hours = Math.round(((endDt - startDt) / 3600000) * 100) / 100;
            if (hours <= 0 || !timeProject?.id) {
                alert('End time must be after start time.');
                return;
            }
            const payload = {
                date: startDt.toISOString(),
                hours,
                projectId: timeProject.id,
                projectName: (timeProject.name || '').toString(),
                description: (manualDescription || '').toString()
            };
            try {
                const newEntry = await createTimeEntryFetch(payload);
                if (newEntry && (newEntry.id || newEntry.hours != null)) {
                    setEntries(prev => [newEntry, ...prev]);
                    setManualDescription('');
                } else {
                    await loadEntries();
                }
            } catch (e) {
                console.warn('Add manual entry failed:', e);
                alert('Could not add time entry: ' + (e?.message || 'Please try again.'));
            }
        };

        const handleDeleteEntry = async (id) => {
            if (!id || !confirm('Delete this time entry?')) return;
            const headers = getTimeAuthHeaders();
            if (!headers) {
                alert('Not logged in.');
                return;
            }
            try {
                const base = getTimeApiBase();
                const r = await fetch(`${base}/api/time-entries/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': headers['Authorization'] },
                    credentials: 'include'
                });
                if (!r.ok) throw new Error('Delete failed (' + r.status + ')');
                setEntries(prev => prev.filter(e => e.id !== id));
            } catch (e) {
                console.warn('Delete entry failed:', e);
                alert('Could not delete entry: ' + (e?.message || ''));
            }
        };

        if (!timeProject?.id) return null;

        const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);

        const formatTime = (ms) => ms != null ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';

        return (
            <div className="space-y-4" style={{ position: 'relative', zIndex: 1 }}>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">Record time</h2>
                    <p className="text-xs text-gray-500 mb-3">Use the timer to record time as you work. Start and stop to capture the exact span.</p>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="text-2xl font-mono tabular-nums text-gray-900 min-w-[6rem]">
                                {timerRunning ? formatElapsed(elapsed) : '00:00:00'}
                            </div>
                            {timerRunning && (
                                <span className="text-sm text-gray-600">
                                    Start: {formatTime(timerStartedAt)} · Stop: —
                                </span>
                            )}
                            {!timerRunning && lastRecordedStart != null && (
                                <span className="text-sm text-gray-600">
                                    Last run — Start: {formatTime(lastRecordedStart)} · Stop: {formatTime(lastRecordedStop)}
                                </span>
                            )}
                            {!timerRunning ? (
                                <button
                                    type="button"
                                    onClick={handleStartTimer}
                                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-1.5"
                                >
                                    <i className="fas fa-play"></i> Start
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleStopTimer}
                                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium flex items-center gap-1.5"
                                >
                                    <i className="fas fa-stop"></i> Stop
                                </button>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                            <textarea
                                placeholder="What are you working on? Add details, tasks, or notes…"
                                value={timerDescription}
                                onChange={e => setTimerDescription(e.target.value)}
                                rows={3}
                                className="w-full max-w-xl px-2 py-1.5 border border-gray-300 rounded text-sm resize-y min-h-[4.5rem]"
                                autoComplete="off"
                            />
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-2">Manually capture time</h2>
                    <p className="text-xs text-gray-500 mb-3">Enter date and start/end times for work already done. Hours are computed from the span.</p>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-end gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                                <input
                                    type="date"
                                    value={manualDate}
                                    onChange={e => setManualDate(e.target.value)}
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Start time</label>
                                <input
                                    type="time"
                                    value={manualStartTime}
                                    onChange={e => setManualStartTime(e.target.value)}
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">End time</label>
                                <input
                                    type="time"
                                    value={manualEndTime}
                                    onChange={e => setManualEndTime(e.target.value)}
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                                />
                            </div>
                            <div className="text-sm text-gray-500 self-end pb-1.5">
                                = {(() => {
                                    const d = manualDate || new Date().toISOString().slice(0, 10);
                                    const s = new Date(d + 'T' + (manualStartTime || '00:00') + ':00');
                                    const e = new Date(d + 'T' + (manualEndTime || '00:00') + ':00');
                                    const h = (e - s) / 3600000;
                                    return Number.isFinite(h) && h > 0 ? h.toFixed(2) + ' h' : '—';
                                })()}
                            </div>
                            <button
                                type="button"
                                onClick={handleAddManual}
                                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex items-center gap-1.5 self-end"
                            >
                                <i className="fas fa-plus"></i> Add
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                            <textarea
                                placeholder="Describe what you did, tasks completed, or other notes…"
                                value={manualDescription}
                                onChange={e => setManualDescription(e.target.value)}
                                rows={3}
                                className="w-full max-w-xl px-2 py-1.5 border border-gray-300 rounded text-sm resize-y min-h-[4.5rem]"
                                autoComplete="off"
                            />
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-sm font-semibold text-gray-900">Time entries</h2>
                        <span className="text-xs text-gray-600">Total: {totalHours.toFixed(2)} h</span>
                    </div>
                    {loading ? (
                        <p className="text-sm text-gray-500">Loading…</p>
                    ) : entries.length === 0 ? (
                        <p className="text-sm text-gray-500">No time logged yet. Start the timer or add a manual entry.</p>
                    ) : (
                        <ul className="space-y-2">
                            {entries.map(e => (
                                <li key={e.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                    <div>
                                        <span className="text-sm text-gray-900">{e.description || '—'}</span>
                                        <span className="text-xs text-gray-500 ml-2">
                                            {e.date ? new Date(e.date).toLocaleDateString() : ''} · {(e.hours || 0).toFixed(2)} h
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteEntry(e.id)}
                                        className="text-red-600 hover:text-red-800 p-1"
                                        title="Delete"
                                    >
                                        <i className="fas fa-trash text-xs"></i>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        );
    };

    // Extract DocumentCollectionProcessSection outside ProjectDetail to prevent recreation on every render
    // This ensures the component reference is stable and doesn't cause MonthlyDocumentCollectionTracker to remount
    const DocumentCollectionProcessSection = (() => {
        const { useState: useStateSection, useEffect: useEffectSection, memo } = window.React;
        
        const DocumentCollectionProcessSectionInner = ({
            project,
            hasDocumentCollectionProcess,
            activeSection,
            onBack
        }) => {
            
            // Track component lifecycle
            useEffectSection(() => {
                return () => {
                };
            }, []);

            const handleBackToOverview = typeof onBack === 'function' ? onBack : () => {};
            // Always check window directly, not from closure (component persists in window even after unmount)
            const { useCallback: useCallbackSection } = window.React;
            // CRITICAL: Check window directly in initial state to avoid reset on remount
            const [trackerReady, setTrackerReady] = useStateSection(() => {
                return !!(window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function');
            });
            const [isLoading, setIsLoading] = useStateSection(false);

            // Continuous check for component availability (updates state when component becomes available)
            // This runs on every mount/remount to immediately recognize if component is already loaded
            useEffectSection(() => {
                // Check immediately on mount - component might already be in window from previous visit
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    if (!trackerReady) {
                        setTrackerReady(true);
                        setIsLoading(false);
                    }
                    return; // Component already available, no need to poll
                }

                // If already marked as ready but component not found, reset state
                if (trackerReady) {
                    setTrackerReady(false);
                }

                // Component not available yet, set up polling
                setIsLoading(true);
                let checkAttempts = 0;
                const maxCheckAttempts = 50; // 5 seconds max (50 * 100ms)
                const checkInterval = setInterval(() => {
                    checkAttempts++;
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        clearInterval(checkInterval);
                    } else if (checkAttempts >= maxCheckAttempts) {
                        clearInterval(checkInterval);
                        setIsLoading(false);
                    }
                }, 100);

                // Listen for viteProjectsReady event
                const handleViteReady = () => {
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        clearInterval(checkInterval);
                        window.removeEventListener('viteProjectsReady', handleViteReady);
                    }
                };
                window.addEventListener('viteProjectsReady', handleViteReady);

                return () => {
                    clearInterval(checkInterval);
                    window.removeEventListener('viteProjectsReady', handleViteReady);
                };
            }, []); // Empty deps - run once on mount, check window directly

            // Eagerly load MonthlyDocumentCollectionTracker component
            const loadTrackerComponent = useCallbackSection(() => {
                // If already available, mark as ready immediately
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    setTrackerReady(true);
                    return Promise.resolve(true);
                }

                // If already loading, return existing promise
                if (window._monthlyTrackerLoadPromise) {
                    return window._monthlyTrackerLoadPromise;
                }

                setIsLoading(true);

                // Create load promise
                const loadPromise = new Promise((resolve) => {
                    // Check immediately first
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        window._monthlyTrackerLoadPromise = null;
                        resolve(true);
                        return;
                    }

                    // Listen for viteProjectsReady event (fastest path)
                    const handleViteReady = () => {
                        if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                            setTrackerReady(true);
                            setIsLoading(false);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                            window._monthlyTrackerLoadPromise = null;
                            resolve(true);
                        }
                    };
                    window.addEventListener('viteProjectsReady', handleViteReady);

                    // Try to load from lazy-loader if available
                    if (window.loadComponent && typeof window.loadComponent === 'function') {
                        window.loadComponent('./src/components/projects/MonthlyDocumentCollectionTracker.jsx')
                            .then(() => {
                                // Check again after load attempt
                                let checkAttempts = 0;
                                const maxCheckAttempts = 10; // 1 second max (10 * 100ms)
                                const checkInterval = setInterval(() => {
                                    checkAttempts++;
                                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                                        setTrackerReady(true);
                                        setIsLoading(false);
                                        clearInterval(checkInterval);
                                        window.removeEventListener('viteProjectsReady', handleViteReady);
                                        window._monthlyTrackerLoadPromise = null;
                                        resolve(true);
                                    } else if (checkAttempts >= maxCheckAttempts) {
                                        clearInterval(checkInterval);
                                        window.removeEventListener('viteProjectsReady', handleViteReady);
                                        setIsLoading(false);
                                        window._monthlyTrackerLoadPromise = null;
                                        resolve(false);
                                    }
                                }, 100);
                            })
                            .catch(() => {
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                setIsLoading(false);
                                window._monthlyTrackerLoadPromise = null;
                                resolve(false);
                            });
                    } else {
                        // Fallback: quick polling with early exit
                        let checkAttempts = 0;
                        const maxCheckAttempts = 20; // 2 seconds max (20 * 100ms)
                        const checkInterval = setInterval(() => {
                            checkAttempts++;
                            if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                                setTrackerReady(true);
                                setIsLoading(false);
                                clearInterval(checkInterval);
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                window._monthlyTrackerLoadPromise = null;
                                resolve(true);
                            } else if (checkAttempts >= maxCheckAttempts) {
                                clearInterval(checkInterval);
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                setIsLoading(false);
                                window._monthlyTrackerLoadPromise = null;
                                resolve(false);
                            }
                        }, 100);
                    }
                });

                window._monthlyTrackerLoadPromise = loadPromise;
                return loadPromise;
            }, []);

            // Sync state with window object on every render (handles remount case where component is already loaded)
            // This ensures that if the component is already in window (from previous visit), we recognize it immediately
            useEffectSection(() => {
                // If component is available in window but state isn't updated, update it immediately
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    if (!trackerReady) {
                        setTrackerReady(true);
                        setIsLoading(false);
                    }
                }
            });

            // Load component only when user actually opens the Document Collection tab (avoids slow project load)
            useEffectSection(() => {
                if (trackerReady) return;
                if (activeSection === 'documentCollection') {
                    loadTrackerComponent();
                }
            }, [activeSection, trackerReady, loadTrackerComponent]);


            // Only render MonthlyDocumentCollectionTracker when activeSection is documentCollection
            // This prevents it from being rendered when not needed, but DocumentCollectionProcessSection
            // stays mounted to prevent remounting issues
            if (activeSection !== 'documentCollection') {
                return null;
            }

            // Check component availability directly from window (not from closure)
            // This ensures we always get the current state, even after remount
            const currentTracker = window.MonthlyDocumentCollectionTracker;
            const isComponentAvailable = currentTracker && typeof currentTracker === 'function';
            // Component is ready if either state says so OR component is actually available in window
            // This ensures immediate rendering on remount if component is already loaded
            const isComponentReady = trackerReady || isComponentAvailable;

            if (!isComponentReady) {
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {isLoading 
                                ? 'The Monthly Document Collection Tracker is loading...'
                                : 'The component is being prepared...'}
                        </p>
                        <div className="mt-4 text-xs text-gray-500">
                            <p>Debug Info: window.MonthlyDocumentCollectionTracker = {String(typeof currentTracker)}</p>
                            <p>Tracker Ready State: {String(trackerReady)}</p>
                            <p>Component Available: {String(isComponentAvailable)}</p>
                            <p>Module Status: {typeof window.ViteProjects !== 'undefined' ? 'Loaded' : 'Not loaded'}</p>
                        </div>
                    </div>
                );
            }
            
            // Use React.createElement to render the component dynamically
            // Always use window object directly to ensure we get the latest version
            const TrackerComponent = window.MonthlyDocumentCollectionTracker;
            return (
                <TrackerComponent
                    key={`tracker-${project?.id || 'default'}`}
                    project={project}
                    onBack={handleBackToOverview}
                />
            );
        };
        
        // Wrap with React.memo to prevent unnecessary re-renders when props haven't changed
        // This prevents MonthlyDocumentCollectionTracker from remounting unnecessarily
        return memo(DocumentCollectionProcessSectionInner, (prevProps, nextProps) => {
            // React.memo comparison: return true if props are equal (skip re-render), false if different (re-render)
            const projectIdEqual = prevProps.project?.id === nextProps.project?.id;
            const hasDocCollectionEqual = prevProps.hasDocumentCollectionProcess === nextProps.hasDocumentCollectionProcess;
            const activeSectionEqual = prevProps.activeSection === nextProps.activeSection;
            const onBackEqual = prevProps.onBack === nextProps.onBack;
            
            const propsEqual = projectIdEqual && hasDocCollectionEqual && activeSectionEqual && onBackEqual;
            
            if (!propsEqual) {
            }
            
            return propsEqual; // Return true if equal (skip re-render), false if different (re-render)
        });
    })();

    // Extract MonthlyDataReviewProcessSection to handle loading and avoid remounts
    const MonthlyDataReviewProcessSection = (() => {
        const { useState: useStateSection, useEffect: useEffectSection, memo } = window.React;

        const MonthlyDataReviewProcessSectionInner = ({
            project,
            hasMonthlyDataReviewProcess,
            activeSection,
            onBack
        }) => {
            useEffectSection(() => {
                return () => {
                };
            }, []);

            const handleBackToOverview = typeof onBack === 'function' ? onBack : () => {};
            const { useCallback: useCallbackSection } = window.React;

            const [trackerReady, setTrackerReady] = useStateSection(() => {
                return !!(window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function');
            });
            const [isLoading, setIsLoading] = useStateSection(false);

            useEffectSection(() => {
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    if (!trackerReady) {
                        setTrackerReady(true);
                        setIsLoading(false);
                    }
                    return;
                }

                if (trackerReady) {
                    setTrackerReady(false);
                }

                setIsLoading(true);
                let checkAttempts = 0;
                const maxCheckAttempts = 50;
                const checkInterval = setInterval(() => {
                    checkAttempts++;
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        clearInterval(checkInterval);
                    } else if (checkAttempts >= maxCheckAttempts) {
                        clearInterval(checkInterval);
                        setIsLoading(false);
                    }
                }, 100);

                const handleViteReady = () => {
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        clearInterval(checkInterval);
                        window.removeEventListener('viteProjectsReady', handleViteReady);
                    }
                };
                window.addEventListener('viteProjectsReady', handleViteReady);

                return () => {
                    clearInterval(checkInterval);
                    window.removeEventListener('viteProjectsReady', handleViteReady);
                };
            }, []);

            const loadTrackerComponent = useCallbackSection(() => {
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    setTrackerReady(true);
                    return Promise.resolve(true);
                }

                if (window._monthlyTrackerLoadPromise) {
                    return window._monthlyTrackerLoadPromise;
                }

                setIsLoading(true);

                const loadPromise = new Promise((resolve) => {
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        window._monthlyTrackerLoadPromise = null;
                        resolve(true);
                        return;
                    }

                    const handleViteReady = () => {
                        if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                            setTrackerReady(true);
                            setIsLoading(false);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                            window._monthlyTrackerLoadPromise = null;
                            resolve(true);
                        }
                    };
                    window.addEventListener('viteProjectsReady', handleViteReady);

                    if (window.loadComponent && typeof window.loadComponent === 'function') {
                        window.loadComponent('./src/components/projects/MonthlyDocumentCollectionTracker.jsx')
                            .then(() => {
                                let checkAttempts = 0;
                                const maxCheckAttempts = 10;
                                const checkInterval = setInterval(() => {
                                    checkAttempts++;
                                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                                        setTrackerReady(true);
                                        setIsLoading(false);
                                        clearInterval(checkInterval);
                                        window.removeEventListener('viteProjectsReady', handleViteReady);
                                        window._monthlyTrackerLoadPromise = null;
                                        resolve(true);
                                    } else if (checkAttempts >= maxCheckAttempts) {
                                        clearInterval(checkInterval);
                                        window.removeEventListener('viteProjectsReady', handleViteReady);
                                        setIsLoading(false);
                                        window._monthlyTrackerLoadPromise = null;
                                        resolve(false);
                                    }
                                }, 100);
                            })
                            .catch(() => {
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                setIsLoading(false);
                                window._monthlyTrackerLoadPromise = null;
                                resolve(false);
                            });
                    } else {
                        let checkAttempts = 0;
                        const maxCheckAttempts = 20;
                        const checkInterval = setInterval(() => {
                            checkAttempts++;
                            if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                                setTrackerReady(true);
                                setIsLoading(false);
                                clearInterval(checkInterval);
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                window._monthlyTrackerLoadPromise = null;
                                resolve(true);
                            } else if (checkAttempts >= maxCheckAttempts) {
                                clearInterval(checkInterval);
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                setIsLoading(false);
                                window._monthlyTrackerLoadPromise = null;
                                resolve(false);
                            }
                        }, 100);
                    }
                });

                window._monthlyTrackerLoadPromise = loadPromise;
                return loadPromise;
            }, []);

            // Load only when user opens the Monthly Data Review tab (avoids slow project load)
            useEffectSection(() => {
                if (trackerReady) return;
                if (activeSection === 'monthlyDataReview') {
                    loadTrackerComponent();
                }
            }, [activeSection, trackerReady, loadTrackerComponent]);

            if (activeSection !== 'monthlyDataReview') {
                return null;
            }

            const currentTracker = window.MonthlyDocumentCollectionTracker;
            const isComponentAvailable = currentTracker && typeof currentTracker === 'function';
            const isComponentReady = trackerReady || isComponentAvailable;

            if (!isComponentReady) {
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {isLoading
                                ? 'The Monthly Data Review tracker is loading...'
                                : 'The component is being prepared...'}
                        </p>
                    </div>
                );
            }

            const TrackerComponent = window.MonthlyDocumentCollectionTracker;
            return (
                <TrackerComponent
                    key={`monthly-data-review-${project?.id || 'default'}`}
                    project={project}
                    onBack={handleBackToOverview}
                    dataSource="monthlyDataReview"
                />
            );
        };

        return memo(MonthlyDataReviewProcessSectionInner, (prevProps, nextProps) => {
            const projectIdEqual = prevProps.project?.id === nextProps.project?.id;
            const hasProcessEqual = prevProps.hasMonthlyDataReviewProcess === nextProps.hasMonthlyDataReviewProcess;
            const activeSectionEqual = prevProps.activeSection === nextProps.activeSection;
            const onBackEqual = prevProps.onBack === nextProps.onBack;
            return projectIdEqual && hasProcessEqual && activeSectionEqual && onBackEqual;
        });
    })();

    // Extract ComplianceReviewProcessSection to handle loading and avoid remounts
    const ComplianceReviewProcessSection = (() => {
        const { useState: useStateSection, useEffect: useEffectSection, memo } = window.React;

        const ComplianceReviewProcessSectionInner = ({
            project,
            hasComplianceReviewProcess,
            activeSection,
            onBack
        }) => {
            useEffectSection(() => {
                return () => {
                };
            }, []);

            const handleBackToOverview = typeof onBack === 'function' ? onBack : () => {};
            const { useCallback: useCallbackSection } = window.React;

            const [trackerReady, setTrackerReady] = useStateSection(() => {
                return !!(window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function');
            });
            const [isLoading, setIsLoading] = useStateSection(false);

            useEffectSection(() => {
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    if (!trackerReady) {
                        setTrackerReady(true);
                        setIsLoading(false);
                    }
                    return;
                }

                if (trackerReady) {
                    setTrackerReady(false);
                }

                setIsLoading(true);
                let checkAttempts = 0;
                const maxCheckAttempts = 50;
                const checkInterval = setInterval(() => {
                    checkAttempts++;
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        clearInterval(checkInterval);
                    } else if (checkAttempts >= maxCheckAttempts) {
                        clearInterval(checkInterval);
                        setIsLoading(false);
                    }
                }, 100);

                const handleViteReady = () => {
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        clearInterval(checkInterval);
                        window.removeEventListener('viteProjectsReady', handleViteReady);
                    }
                };
                window.addEventListener('viteProjectsReady', handleViteReady);

                return () => {
                    clearInterval(checkInterval);
                    window.removeEventListener('viteProjectsReady', handleViteReady);
                };
            }, []);

            const loadTrackerComponent = useCallbackSection(() => {
                if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                    setTrackerReady(true);
                    return Promise.resolve(true);
                }

                if (window._complianceTrackerLoadPromise) {
                    return window._complianceTrackerLoadPromise;
                }

                setIsLoading(true);

                const loadPromise = new Promise((resolve) => {
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        setTrackerReady(true);
                        setIsLoading(false);
                        window._complianceTrackerLoadPromise = null;
                        resolve(true);
                        return;
                    }

                    const handleViteReady = () => {
                        if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                            setTrackerReady(true);
                            setIsLoading(false);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                            window._complianceTrackerLoadPromise = null;
                            resolve(true);
                        }
                    };
                    window.addEventListener('viteProjectsReady', handleViteReady);

                    if (window.loadComponent && typeof window.loadComponent === 'function') {
                        window.loadComponent('./src/components/projects/MonthlyDocumentCollectionTracker.jsx')
                            .then(() => {
                                let checkAttempts = 0;
                                const maxCheckAttempts = 10;
                                const checkInterval = setInterval(() => {
                                    checkAttempts++;
                                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                                        setTrackerReady(true);
                                        setIsLoading(false);
                                        clearInterval(checkInterval);
                                        window.removeEventListener('viteProjectsReady', handleViteReady);
                                        window._complianceTrackerLoadPromise = null;
                                        resolve(true);
                                    } else if (checkAttempts >= maxCheckAttempts) {
                                        clearInterval(checkInterval);
                                        window.removeEventListener('viteProjectsReady', handleViteReady);
                                        setIsLoading(false);
                                        window._complianceTrackerLoadPromise = null;
                                        resolve(false);
                                    }
                                }, 100);
                            })
                            .catch(() => {
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                setIsLoading(false);
                                window._complianceTrackerLoadPromise = null;
                                resolve(false);
                            });
                    } else {
                        let checkAttempts = 0;
                        const maxCheckAttempts = 20;
                        const checkInterval = setInterval(() => {
                            checkAttempts++;
                            if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                                setTrackerReady(true);
                                setIsLoading(false);
                                clearInterval(checkInterval);
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                window._complianceTrackerLoadPromise = null;
                                resolve(true);
                            } else if (checkAttempts >= maxCheckAttempts) {
                                clearInterval(checkInterval);
                                window.removeEventListener('viteProjectsReady', handleViteReady);
                                setIsLoading(false);
                                window._complianceTrackerLoadPromise = null;
                                resolve(false);
                            }
                        }, 100);
                    }
                });

                window._complianceTrackerLoadPromise = loadPromise;
                return loadPromise;
            }, []);

            useEffectSection(() => {
                if (trackerReady) return;
                if (activeSection === 'complianceReview') {
                    loadTrackerComponent();
                }
            }, [activeSection, trackerReady, loadTrackerComponent]);

            if (activeSection !== 'complianceReview') {
                return null;
            }

            const currentTracker = window.MonthlyDocumentCollectionTracker;
            const isComponentAvailable = currentTracker && typeof currentTracker === 'function';
            const isComponentReady = trackerReady || isComponentAvailable;

            if (!isComponentReady) {
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {isLoading
                                ? 'The Compliance Review tracker is loading...'
                                : 'The component is being prepared...'}
                        </p>
                    </div>
                );
            }

            const TrackerComponent = window.MonthlyDocumentCollectionTracker;
            return (
                <TrackerComponent
                    key={`compliance-review-${project?.id || 'default'}`}
                    project={project}
                    onBack={handleBackToOverview}
                    dataSource="complianceReview"
                />
            );
        };

        return memo(ComplianceReviewProcessSectionInner, (prevProps, nextProps) => {
            const projectIdEqual = prevProps.project?.id === nextProps.project?.id;
            const hasProcessEqual = prevProps.hasComplianceReviewProcess === nextProps.hasComplianceReviewProcess;
            const activeSectionEqual = prevProps.activeSection === nextProps.activeSection;
            const onBackEqual = prevProps.onBack === nextProps.onBack;
            return projectIdEqual && hasProcessEqual && activeSectionEqual && onBackEqual;
        });
    })();
    
    // Extract MonthlyFMSReviewProcessSection outside ProjectDetail to prevent recreation on every render
    const MonthlyFMSReviewProcessSection = (() => {
        const { useState: useStateSection, useEffect: useEffectSection, memo } = window.React;
        
        const MonthlyFMSReviewProcessSectionInner = ({
            project,
            hasMonthlyFMSReviewProcess,
            activeSection,
            onBack
        }) => {
            
            // Track component lifecycle
            useEffectSection(() => {
                return () => {
                };
            }, []);

            const handleBackToOverview = typeof onBack === 'function' ? onBack : () => {};
            // Always check window directly, not from closure (component persists in window even after unmount)
            const { useCallback: useCallbackSection } = window.React;
            
            const [trackerReady, setTrackerReady] = useStateSection(() => {
                const isAvailable = !!(window.MonthlyFMSReviewTracker && typeof window.MonthlyFMSReviewTracker === 'function');
                console.log('🔍 MonthlyFMSReviewProcessSection: Initial trackerReady check', {
                    isAvailable,
                    trackerType: typeof window.MonthlyFMSReviewTracker,
                    activeSection
                });
                return isAvailable;
            });
            const [loadAttempts, setLoadAttempts] = useStateSection(0);
            const maxAttempts = 50; // 5 seconds (50 * 100ms)

            // Continuous check for component availability (updates state when component becomes available)
            // This runs on every mount/remount to immediately recognize if component is already loaded
            useEffectSection(() => {
                // Always check on mount - tracker might have loaded after initial state
                const checkComponent = () => {
                    const isAvailable = !!(window.MonthlyFMSReviewTracker && typeof window.MonthlyFMSReviewTracker === 'function');
                    if (isAvailable && !trackerReady) {
                        console.log('✅ MonthlyFMSReviewTracker became available, updating trackerReady', {
                            activeSection,
                            projectId: project?.id
                        });
                        setTrackerReady(true);
                        return true;
                    }
                    return isAvailable;
                };

                // Check immediately on mount
                if (checkComponent()) {
                    console.log('✅ MonthlyFMSReviewTracker already available on mount', {
                        activeSection,
                        projectId: project?.id
                    });
                    return;
                }

                const handleViteReady = () => {
                    if (checkComponent()) {
                        window.removeEventListener('viteProjectsReady', handleViteReady);
                    }
                };
                window.addEventListener('viteProjectsReady', handleViteReady);

                const interval = setInterval(() => {
                    setLoadAttempts(prev => {
                        const newAttempts = prev + 1;
                        if (newAttempts >= maxAttempts) {
                            clearInterval(interval);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                            console.warn('⚠️ MonthlyFMSReviewTracker failed to load after', maxAttempts, 'attempts');
                            return newAttempts;
                        }
                        if (checkComponent()) {
                            clearInterval(interval);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                        }
                        return newAttempts;
                    });
                }, 100);

                return () => {
                    clearInterval(interval);
                    window.removeEventListener('viteProjectsReady', handleViteReady);
                };
            }, [trackerReady]);

            // Only render MonthlyFMSReviewTracker when activeSection is monthlyFMSReview
            if (activeSection !== 'monthlyFMSReview') {
                return null;
            }
            
            // Always get latest version from window (vite-projects may have overridden dist version)
            const LatestTracker = window.MonthlyFMSReviewTracker;
            
            // Check if tracker is available - use direct check instead of state to avoid stale state
            const isTrackerAvailable = !!(LatestTracker && typeof LatestTracker === 'function');
            
            if (!isTrackerAvailable) {
                console.log('⚠️ MonthlyFMSReviewTracker not available', {
                    trackerReady,
                    hasTracker: !!LatestTracker,
                    trackerType: typeof LatestTracker,
                    activeSection,
                    projectId: project?.id
                });
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {loadAttempts < maxAttempts 
                                ? `The Monthly FMS Review Tracker is loading... (${loadAttempts * 100}ms)`
                                : 'The component failed to load. Please try reloading the page.'}
                        </p>
                        {loadAttempts >= maxAttempts && (
                            <div className="flex gap-2 justify-center">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                                >
                                    <i className="fas fa-sync-alt mr-2"></i>
                                    Reload Page
                                </button>
                                <button
                                    onClick={handleBackToOverview}
                                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                >
                                    <i className="fas fa-arrow-left mr-2"></i>
                                    Back to Overview
                                </button>
                            </div>
                        )}
                        <div className="mt-4 text-xs text-gray-500">
                            <p>Debug Info: window.MonthlyFMSReviewTracker = {String(typeof window.MonthlyFMSReviewTracker)}</p>
                            <p>Module Status: {typeof window.ViteProjects !== 'undefined' ? 'Loaded' : 'Not loaded'}</p>
                            <p>Active Section: {activeSection}</p>
                            <p>Project ID: {project?.id || 'N/A'}</p>
                        </div>
                    </div>
                );
            }
            
            console.log('✅ Rendering MonthlyFMSReviewTracker', {
                projectId: project?.id,
                activeSection,
                trackerType: typeof LatestTracker,
                hasTracker: !!LatestTracker
            });
            
            return (
                <LatestTracker
                    key={`tracker-${project?.id || 'default'}`}
                    project={project}
                    onBack={handleBackToOverview}
                />
            );
        };

        return memo(MonthlyFMSReviewProcessSectionInner, (prevProps, nextProps) => {
            const projectIdEqual = prevProps.project?.id === nextProps.project?.id;
            const hasMonthlyFMSReviewEqual = prevProps.hasMonthlyFMSReviewProcess === nextProps.hasMonthlyFMSReviewProcess;
            const activeSectionEqual = prevProps.activeSection === nextProps.activeSection;
            const onBackEqual = prevProps.onBack === nextProps.onBack;
            
            const propsEqual = projectIdEqual && hasMonthlyFMSReviewEqual && activeSectionEqual && onBackEqual;
            return propsEqual;
        });
    })();

    // Extract WeeklyFMSReviewProcessSection outside ProjectDetail to prevent recreation on every render
    const WeeklyFMSReviewProcessSection = (() => {
        const { useState: useStateSection, useEffect: useEffectSection, memo } = window.React;
        
        const WeeklyFMSReviewProcessSectionInner = ({
            project,
            hasWeeklyFMSReviewProcess,
            activeSection,
            onBack
        }) => {
            
            // Track component lifecycle
            useEffectSection(() => {
                return () => {
                };
            }, []);

            const handleBackToOverview = typeof onBack === 'function' ? onBack : () => {};
            // Always read from window to get latest version (vite-projects may override dist version)
            const WeeklyFMSReviewTracker = window.WeeklyFMSReviewTracker;
            const [trackerReady, setTrackerReady] = useStateSection(() => !!window.WeeklyFMSReviewTracker);
            const [loadAttempts, setLoadAttempts] = useStateSection(0);
            const [trackerVersion, setTrackerVersion] = useStateSection(0);
            const maxAttempts = 50; // 5 seconds (50 * 100ms)

            useEffectSection(() => {
                if (trackerReady) return;

                const checkComponent = () => {
                    if (window.WeeklyFMSReviewTracker && typeof window.WeeklyFMSReviewTracker === 'function') {
                        setTrackerReady(true);
                        return true;
                    }
                    return false;
                };

                if (checkComponent()) return;

                const handleViteReady = () => {
                    if (checkComponent()) {
                        window.removeEventListener('viteProjectsReady', handleViteReady);
                    }
                };
                window.addEventListener('viteProjectsReady', handleViteReady);

                const interval = setInterval(() => {
                    setLoadAttempts(prev => {
                        const newAttempts = prev + 1;
                        if (newAttempts >= maxAttempts) {
                            clearInterval(interval);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                            console.warn('⚠️ WeeklyFMSReviewTracker failed to load after', maxAttempts, 'attempts');
                            return newAttempts;
                        }
                        if (checkComponent()) {
                            clearInterval(interval);
                            window.removeEventListener('viteProjectsReady', handleViteReady);
                        }
                        return newAttempts;
                    });
                }, 100);

                return () => {
                    clearInterval(interval);
                    window.removeEventListener('viteProjectsReady', handleViteReady);
                };
            }, [trackerReady]);

            useEffectSection(() => {
                const handleTrackerUpdated = () => {
                    if (window.WeeklyFMSReviewTracker && typeof window.WeeklyFMSReviewTracker === 'function') {
                        setTrackerReady(true);
                        setTrackerVersion(prev => prev + 1);
                    }
                };

                window.addEventListener('weeklyFMSReviewTrackerUpdated', handleTrackerUpdated);
                window.addEventListener('viteProjectsReady', handleTrackerUpdated);

                return () => {
                    window.removeEventListener('weeklyFMSReviewTrackerUpdated', handleTrackerUpdated);
                    window.removeEventListener('viteProjectsReady', handleTrackerUpdated);
                };
            }, []);


            if (!trackerReady || !window.WeeklyFMSReviewTracker) {
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {loadAttempts < maxAttempts 
                                ? `The Weekly FMS Review Tracker is loading... (${loadAttempts * 100}ms)`
                                : 'The component failed to load. Please try reloading the page.'}
                        </p>
                        {loadAttempts >= maxAttempts && (
                            <div className="flex gap-2 justify-center">
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                                >
                                    <i className="fas fa-sync-alt mr-2"></i>
                                    Reload Page
                                </button>
                                <button
                                    onClick={handleBackToOverview}
                                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                >
                                    <i className="fas fa-arrow-left mr-2"></i>
                                    Back to Overview
                                </button>
                            </div>
                        )}
                        <div className="mt-4 text-xs text-gray-500">
                            <p>Debug Info: window.WeeklyFMSReviewTracker = {String(typeof window.WeeklyFMSReviewTracker)}</p>
                            <p>Module Status: {typeof window.ViteProjects !== 'undefined' ? 'Loaded' : 'Not loaded'}</p>
                        </div>
                    </div>
                );
            }

            // Only render WeeklyFMSReviewTracker when activeSection is weeklyFMSReview
            if (activeSection !== 'weeklyFMSReview') {
                return null;
            }
            
            // Always get latest version from window (vite-projects may have overridden dist version)
            const LatestTracker = window.WeeklyFMSReviewTracker;
            if (!LatestTracker) {
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600">The Weekly FMS Review Tracker is loading...</p>
                    </div>
                );
            }
            
            return (
                <LatestTracker
                    key={`tracker-${project?.id || 'default'}-${trackerVersion}`}
                    project={project}
                    onBack={handleBackToOverview}
                />
            );
        };
        
        // Wrap with React.memo to prevent unnecessary re-renders when props haven't changed
        return memo(WeeklyFMSReviewProcessSectionInner, (prevProps, nextProps) => {
            const projectIdEqual = prevProps.project?.id === nextProps.project?.id;
            const hasWeeklyFMSReviewEqual = prevProps.hasWeeklyFMSReviewProcess === nextProps.hasWeeklyFMSReviewProcess;
            const activeSectionEqual = prevProps.activeSection === nextProps.activeSection;
            const onBackEqual = prevProps.onBack === nextProps.onBack;
            
            const propsEqual = projectIdEqual && hasWeeklyFMSReviewEqual && activeSectionEqual && onBackEqual;
            
            return propsEqual;
        });
    })();

    const parseDocumentSections = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;

        if (typeof data !== 'string') {
            return [];
        }

        let cleaned = data.trim();
        if (!cleaned) return [];

        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            try {
                const parsed = JSON.parse(cleaned);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
                if (typeof parsed === 'string') {
                    cleaned = parsed;
                    attempts++;
                    continue;
                }
                return [];
            } catch (error) {
                let nextCleaned = cleaned;
                if (nextCleaned.startsWith('"') && nextCleaned.endsWith('"')) {
                    nextCleaned = nextCleaned.slice(1, -1);
                }
                nextCleaned = nextCleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                if (nextCleaned === cleaned) {
                    break;
                }
                cleaned = nextCleaned;
                attempts++;
            }
        }

        return [];
    };

    const serializeDocumentSections = (data) => JSON.stringify(parseDocumentSections(data));

    /**
     * Online Drive links — MUST be a stable component (defined once here), not inside ProjectDetail.
     * Inline `const OverviewSection = () => {}` creates a new component type every parent render,
     * which remounts all children and breaks controlled inputs (focus loss / "can't type").
     */
    const OnlineDriveLinksEditor = ({ projectId, initialSerialized, onProjectUpdate }) => {
        const row = (url) => ({
            id:
                typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            url: String(url ?? '')
        });

        const parseOnlineDriveLinks = useCallback((rawValue) => {
            const mk = (u) => ({
                id:
                    typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `row-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                url: String(u ?? '')
            });
            const empty = { googleDrive: [mk('')], oneDrive: [mk('')] };
            if (!rawValue) return empty;

            const parseMaybeNestedJson = (value) => {
                if (value == null) return null;
                if (typeof value === 'object') return value;
                if (typeof value !== 'string') return null;
                let cleaned = value.trim();
                if (!cleaned) return null;
                let attempts = 0;
                while (attempts < 8) {
                    try {
                        const parsed = JSON.parse(cleaned);
                        if (typeof parsed === 'string') {
                            cleaned = parsed.trim();
                            attempts++;
                            continue;
                        }
                        return parsed;
                    } catch (_) {
                        let nextCleaned = cleaned;
                        if (nextCleaned.startsWith('"') && nextCleaned.endsWith('"')) {
                            nextCleaned = nextCleaned.slice(1, -1);
                        }
                        nextCleaned = nextCleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        if (nextCleaned === cleaned) break;
                        cleaned = nextCleaned;
                        attempts++;
                    }
                }
                return null;
            };

            const normalizeProviderArray = (rawList) => {
                if (!Array.isArray(rawList)) return [mk('')];
                const mapped = rawList.map((entry) => {
                    if (typeof entry === 'string') return mk(entry);
                    if (entry && typeof entry === 'object') {
                        if (typeof entry.url === 'string') return mk(entry.url);
                        if (typeof entry.link === 'string') return mk(entry.link);
                    }
                    return mk('');
                });
                return mapped.length > 0 ? mapped : [mk('')];
            };

            try {
                const parsed = parseMaybeNestedJson(rawValue);
                if (!parsed || typeof parsed !== 'object') return empty;
                return {
                    googleDrive: normalizeProviderArray(parsed.googleDrive),
                    oneDrive: normalizeProviderArray(parsed.oneDrive)
                };
            } catch (e) {
                console.warn('Failed to parse onlineDriveLinks:', e);
                return empty;
            }
        }, []);

        const [links, setLinks] = useState(() => parseOnlineDriveLinks(initialSerialized));
        const [saving, setSaving] = useState(false);
        const [saveHint, setSaveHint] = useState(null);
        const lastProjectIdRef = useRef(null);
        const dirtyRef = useRef(false);
        const lastSeedRawRef = useRef('');
        const driveLinksFallbackLoadedForRef = useRef(null);
        const autoSaveTimerRef = useRef(null);
        const lastSavedPayloadRef = useRef('');
        // Always read latest serialized value without putting it in effect deps (parent re-fetches would reset inputs).
        const initialSerializedRef = useRef(initialSerialized);
        initialSerializedRef.current = initialSerialized;

        useEffect(() => {
            if (!projectId) return;
            const raw = String(initialSerializedRef.current ?? '');
            if (lastProjectIdRef.current !== projectId) {
                lastProjectIdRef.current = projectId;
                dirtyRef.current = false;
                lastSeedRawRef.current = raw;
                driveLinksFallbackLoadedForRef.current = null;
                setLinks(parseOnlineDriveLinks(initialSerializedRef.current));
                if (!raw) {
                    driveLinksFallbackLoadedForRef.current = String(projectId);
                    const token =
                        window.storage?.getToken?.() ||
                        localStorage.getItem('abcotronics_token') ||
                        localStorage.getItem('authToken') ||
                        '';
                    fetch(`/api/projects/${projectId}?driveLinksOnly=1`, {
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {})
                        }
                    })
                        .then((r) => (r.ok ? r.json() : null))
                        .then((payload) => {
                            const projectPayload = payload?.project || payload?.data?.project || payload?.data || {};
                            const fetchedRaw = projectPayload?.onlineDriveLinks;
                            if (!fetchedRaw || dirtyRef.current) return;
                            const fetchedString = String(fetchedRaw);
                            lastSeedRawRef.current = fetchedString;
                            setLinks(parseOnlineDriveLinks(fetchedString));
                        })
                        .catch(() => {});
                }
                setSaveHint(null);
                return;
            }
            // Same project: when summary loads first then full project arrives, or after refetch — re-seed if user has not edited.
            if (!dirtyRef.current && raw !== lastSeedRawRef.current) {
                lastSeedRawRef.current = raw;
                setLinks(parseOnlineDriveLinks(initialSerializedRef.current));
            }

            // Fallback hydration: if project payload did not include onlineDriveLinks, fetch it directly.
            if (!dirtyRef.current && !raw && driveLinksFallbackLoadedForRef.current !== String(projectId)) {
                driveLinksFallbackLoadedForRef.current = String(projectId);
                const token =
                    window.storage?.getToken?.() ||
                    localStorage.getItem('abcotronics_token') ||
                    localStorage.getItem('authToken') ||
                    '';
                fetch(`/api/projects/${projectId}?driveLinksOnly=1`, {
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((payload) => {
                        const projectPayload = payload?.project || payload?.data?.project || payload?.data || {};
                        const fetchedRaw = projectPayload?.onlineDriveLinks;
                        if (!fetchedRaw || dirtyRef.current) return;
                        const fetchedString = String(fetchedRaw);
                        lastSeedRawRef.current = fetchedString;
                        setLinks(parseOnlineDriveLinks(fetchedString));
                    })
                    .catch(() => {});
            }
        }, [projectId, initialSerialized, parseOnlineDriveLinks]);

        const normalizeForApi = useCallback((state) => ({
            googleDrive: (state?.googleDrive || []).map((r) => String(r?.url || '').trim()),
            oneDrive: (state?.oneDrive || []).map((r) => String(r?.url || '').trim())
        }), []);

        const updateUrl = (provider, index, value) => {
            dirtyRef.current = true;
            setLinks((prev) => {
                const arr = Array.isArray(prev?.[provider]) ? [...prev[provider]] : [];
                while (arr.length <= index) arr.push(row(''));
                const next = [...arr];
                next[index] = { ...next[index], url: value };
                return { ...prev, [provider]: next };
            });
            setSaveHint(null);
        };

        const addSpot = (provider) => {
            dirtyRef.current = true;
            setLinks((prev) => {
                const cur = Array.isArray(prev?.[provider]) ? [...prev[provider]] : [];
                cur.push(row(''));
                return { ...prev, [provider]: cur };
            });
            setSaveHint(null);
        };

        const removeSpot = (provider, index) => {
            dirtyRef.current = true;
            setLinks((prev) => {
                const cur = Array.isArray(prev?.[provider]) ? [...prev[provider]] : [];
                const next = cur.filter((_, i) => i !== index);
                return { ...prev, [provider]: next.length > 0 ? next : [row('')] };
            });
            setSaveHint(null);
        };

        const handleSave = async () => {
            if (!projectId || !window.DatabaseAPI?.updateProject || saving) return;
            const normalized = normalizeForApi(links);
            setSaving(true);
            setSaveHint(null);
            try {
                const payload = JSON.stringify(normalized);
                const apiResponse = await window.DatabaseAPI.updateProject(projectId, {
                    onlineDriveLinks: payload
                });
                const updatedProject =
                    apiResponse?.data?.project ||
                    apiResponse?.project ||
                    { id: projectId, onlineDriveLinks: payload };
                dirtyRef.current = false;
                lastSeedRawRef.current = payload;
                lastSavedPayloadRef.current = payload;
                if (typeof onProjectUpdate === 'function') onProjectUpdate(updatedProject);
                if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    window.updateViewingProject(updatedProject);
                }
                setSaveHint('saved');
                window.setTimeout(() => setSaveHint(null), 2500);
            } catch (err) {
                console.error('Failed to save online drive links:', err);
                setSaveHint('error');
            } finally {
                setSaving(false);
            }
        };

        useEffect(() => {
            if (!projectId || !window.DatabaseAPI?.updateProject) return;
            if (!dirtyRef.current || saving) return;
            const payload = JSON.stringify(normalizeForApi(links));
            if (payload === lastSavedPayloadRef.current) return;
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
            }
            autoSaveTimerRef.current = window.setTimeout(() => {
                autoSaveTimerRef.current = null;
                if (!dirtyRef.current || saving) return;
                handleSave();
            }, 900);
            return () => {
                if (autoSaveTimerRef.current) {
                    window.clearTimeout(autoSaveTimerRef.current);
                    autoSaveTimerRef.current = null;
                }
            };
        }, [links, projectId, saving, normalizeForApi]);

        // Render helper (not a nested component) so React does not remount the list on each render.
        const renderDriveBlock = (provider, title, subtitle, iconClass, placeholder, accentClass) => (
            <div className={`rounded-xl border p-3 sm:p-4 ${accentClass}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-2 min-w-0">
                        <div
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 shadow-sm border border-gray-100"
                            aria-hidden
                        >
                            <i className={`${iconClass} text-lg`} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
                            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => addSpot(provider)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50"
                    >
                        <i className="fas fa-plus text-[10px]" />
                        Add link
                    </button>
                </div>
                <ul className="space-y-2">
                    {(links[provider] || []).map((entry, index) => (
                        <li key={entry.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                                type="text"
                                inputMode="url"
                                autoComplete="off"
                                spellCheck={false}
                                value={entry.url}
                                onChange={(e) => updateUrl(provider, index, e.target.value)}
                                placeholder={placeholder}
                                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                            />
                            <div className="flex shrink-0 items-center gap-2">
                                {entry.url?.trim() ? (
                                    <a
                                        href={
                                            /^https?:\/\//i.test(entry.url.trim())
                                                ? entry.url.trim()
                                                : `https://${entry.url.trim()}`
                                        }
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                    >
                                        <i className="fas fa-external-link-alt mr-1.5 text-[10px]" />
                                        Open
                                    </a>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={() => removeSpot(provider, index)}
                                    className="inline-flex items-center justify-center rounded-lg border border-red-100 bg-red-50/80 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                                    title="Remove this row"
                                >
                                    <i className="fas fa-times" />
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        );

        if (!projectId) return null;

        return (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-slate-50/80 to-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-white/90 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                            <i className="fas fa-cloud" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900">Online drive</h2>
                            <p className="text-xs text-gray-500">Folder or share links for this project</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {saveHint === 'saved' && (
                            <span className="text-xs font-medium text-emerald-600">
                                <i className="fas fa-check-circle mr-1" />
                                Saved
                            </span>
                        )}
                        {saveHint === 'error' && (
                            <span className="text-xs font-medium text-red-600">Save failed</span>
                        )}
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <i className="fas fa-spinner fa-spin" />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-save" />
                                    Save links
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className="grid gap-4 p-4 md:grid-cols-2">
                    {renderDriveBlock(
                        'googleDrive',
                        'Google Drive',
                        'Shared drives or folder links',
                        'fab fa-google-drive text-green-600',
                        'https://drive.google.com/...',
                        'border-green-100 bg-green-50/40'
                    )}
                    {renderDriveBlock(
                        'oneDrive',
                        'OneDrive',
                        'SharePoint or personal OneDrive',
                        'fab fa-microsoft text-blue-600',
                        'https://onedrive.live.com/...',
                        'border-blue-100 bg-blue-50/40'
                    )}
                </div>
            </div>
        );
    };

    const ProjectContactsEditor = ({ projectId, clientId, initialSerialized, onProjectUpdate }) => {
        const [availableContacts, setAvailableContacts] = useState([]);
        const [sites, setSites] = useState([]);
        const [selectedContactId, setSelectedContactId] = useState('');
        const [linkedContacts, setLinkedContacts] = useState([]);
        const [loadingContacts, setLoadingContacts] = useState(false);
        const [savingNewContact, setSavingNewContact] = useState(false);
        const [saving, setSaving] = useState(false);
        const [saveHint, setSaveHint] = useState(null);
        const [newContact, setNewContact] = useState({
            name: '',
            email: '',
            phone: '',
            role: '',
            siteId: ''
        });
        const lastClientIdRef = useRef(null);
        const lastProjectIdRef = useRef(null);
        const dirtyRef = useRef(false);
        const lastSavedPayloadRef = useRef('');
        const autoSaveTimerRef = useRef(null);
        const initialSerializedRef = useRef(initialSerialized);
        initialSerializedRef.current = initialSerialized;

        const normalizeContact = useCallback((raw) => {
            if (!raw || typeof raw !== 'object') return null;
            const id = String(raw.id || '').trim();
            if (!id) return null;
            return {
                id,
                name: String(raw.name || '').trim(),
                email: String(raw.email || '').trim(),
                phone: String(raw.phone || raw.mobile || '').trim(),
                role: String(raw.role || raw.title || '').trim(),
                siteId: raw.siteId != null ? String(raw.siteId).trim() : ''
            };
        }, []);

        const parseLinkedContacts = useCallback((rawValue) => {
            if (!rawValue) return [];
            try {
                const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
                if (!Array.isArray(parsed)) return [];
                return parsed.map(normalizeContact).filter(Boolean);
            } catch (error) {
                console.warn('Failed to parse projectContacts:', error);
                return [];
            }
        }, [normalizeContact]);

        const loadClientContacts = useCallback(async (targetClientId) => {
            if (!targetClientId || !window.api?.getContacts) {
                setAvailableContacts([]);
                return;
            }
            setLoadingContacts(true);
            try {
                const response = await window.api.getContacts(targetClientId);
                const list = response?.data?.contacts || response?.contacts || [];
                const normalized = Array.isArray(list) ? list.map(normalizeContact).filter(Boolean) : [];
                setAvailableContacts(normalized);
            } catch (error) {
                console.error('Failed to load client contacts:', error);
                setAvailableContacts([]);
            } finally {
                setLoadingContacts(false);
            }
        }, [normalizeContact]);

        const loadClientSites = useCallback(async (targetClientId) => {
            if (!targetClientId || !window.api?.getSites) {
                setSites([]);
                return;
            }
            try {
                const response = await window.api.getSites(targetClientId);
                const siteRows = response?.data?.sites || response?.sites || [];
                setSites(Array.isArray(siteRows) ? siteRows : []);
            } catch (error) {
                console.error('Failed to load client sites:', error);
                setSites([]);
            }
        }, []);

        useEffect(() => {
            const nextProjectId = String(projectId || '');
            const nextClientId = String(clientId || '');
            const projectChanged = lastProjectIdRef.current !== nextProjectId;
            const clientChanged = lastClientIdRef.current !== nextClientId;

            if (projectChanged) {
                lastProjectIdRef.current = nextProjectId;
                dirtyRef.current = false;
                setSaveHint(null);
                const parsed = parseLinkedContacts(initialSerializedRef.current);
                const payload = JSON.stringify(parsed);
                lastSavedPayloadRef.current = payload;
                setLinkedContacts(parsed);
            } else if (!dirtyRef.current) {
                setLinkedContacts(parseLinkedContacts(initialSerializedRef.current));
            }

            if (clientChanged || projectChanged) {
                lastClientIdRef.current = nextClientId;
                setSelectedContactId('');
                loadClientContacts(nextClientId);
                loadClientSites(nextClientId);
            }
        }, [projectId, clientId, initialSerialized, parseLinkedContacts, loadClientContacts, loadClientSites]);

        const serializeLinkedContacts = useCallback(
            (rows) => JSON.stringify((Array.isArray(rows) ? rows : []).map(normalizeContact).filter(Boolean)),
            [normalizeContact]
        );

        const handleSave = useCallback(async () => {
            if (!projectId || !window.DatabaseAPI?.updateProject || saving) return;
            const payload = serializeLinkedContacts(linkedContacts);
            setSaving(true);
            setSaveHint(null);
            try {
                const apiResponse = await window.DatabaseAPI.updateProject(projectId, {
                    projectContacts: payload
                });
                const updatedProject =
                    apiResponse?.data?.project ||
                    apiResponse?.project ||
                    { id: projectId, projectContacts: payload };
                dirtyRef.current = false;
                lastSavedPayloadRef.current = payload;
                if (typeof onProjectUpdate === 'function') onProjectUpdate(updatedProject);
                if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    window.updateViewingProject(updatedProject);
                }
                setSaveHint('saved');
                window.setTimeout(() => setSaveHint(null), 2500);
            } catch (error) {
                console.error('Failed to save project contacts:', error);
                setSaveHint('error');
            } finally {
                setSaving(false);
            }
        }, [projectId, linkedContacts, saving, serializeLinkedContacts, onProjectUpdate]);

        useEffect(() => {
            if (!projectId || !window.DatabaseAPI?.updateProject) return;
            if (!dirtyRef.current || saving) return;
            const payload = serializeLinkedContacts(linkedContacts);
            if (payload === lastSavedPayloadRef.current) return;
            if (autoSaveTimerRef.current) {
                window.clearTimeout(autoSaveTimerRef.current);
            }
            autoSaveTimerRef.current = window.setTimeout(() => {
                autoSaveTimerRef.current = null;
                if (!dirtyRef.current || saving) return;
                handleSave();
            }, 900);
            return () => {
                if (autoSaveTimerRef.current) {
                    window.clearTimeout(autoSaveTimerRef.current);
                    autoSaveTimerRef.current = null;
                }
            };
        }, [projectId, linkedContacts, saving, serializeLinkedContacts, handleSave]);

        const linkedIds = new Set(linkedContacts.map((c) => c.id));
        const availableToLink = availableContacts.filter((c) => !linkedIds.has(c.id));
        const siteNameById = new Map((Array.isArray(sites) ? sites : []).map((site) => [String(site.id), String(site.name || '')]));

        const addSelectedContact = () => {
            if (!selectedContactId) return;
            const selected = availableContacts.find((c) => c.id === selectedContactId);
            if (!selected || linkedIds.has(selected.id)) return;
            dirtyRef.current = true;
            setLinkedContacts((prev) => [...prev, selected]);
            setSelectedContactId('');
            setSaveHint(null);
        };

        const removeLinkedContact = (contactId) => {
            dirtyRef.current = true;
            setLinkedContacts((prev) => prev.filter((c) => c.id !== contactId));
            setSaveHint(null);
        };

        const createAndLinkContact = async () => {
            if (!clientId || !window.api?.createContact || savingNewContact) return;
            const name = String(newContact.name || '').trim();
            if (!name) return;
            setSavingNewContact(true);
            try {
                const payload = {
                    name,
                    email: String(newContact.email || '').trim(),
                    phone: String(newContact.phone || '').trim(),
                    role: String(newContact.role || '').trim(),
                    siteId: newContact.siteId ? String(newContact.siteId) : null
                };
                const response = await window.api.createContact(clientId, payload);
                const createdRaw = response?.data?.contact || response?.contact || null;
                const created = normalizeContact(createdRaw);
                if (!created) throw new Error('Contact was created but response is invalid');

                setAvailableContacts((prev) => {
                    const existing = Array.isArray(prev) ? prev : [];
                    if (existing.some((c) => c.id === created.id)) return existing;
                    return [...existing, created];
                });
                dirtyRef.current = true;
                setLinkedContacts((prev) => {
                    if (prev.some((c) => c.id === created.id)) return prev;
                    return [...prev, created];
                });
                setNewContact({
                    name: '',
                    email: '',
                    phone: '',
                    role: '',
                    siteId: ''
                });
                setSaveHint(null);
            } catch (error) {
                console.error('Failed to create project contact:', error);
            } finally {
                setSavingNewContact(false);
            }
        };

        const updateContactSite = async (contactId, siteIdValue) => {
            if (!clientId || !contactId || !window.api?.updateContact) return;
            const normalizedSiteId = siteIdValue ? String(siteIdValue) : '';
            const previousLinked = linkedContacts;
            const previousAvailable = availableContacts;
            const applySite = (rows) =>
                (Array.isArray(rows) ? rows : []).map((row) =>
                    row.id === contactId ? { ...row, siteId: normalizedSiteId } : row
                );

            setLinkedContacts((prev) => applySite(prev));
            setAvailableContacts((prev) => applySite(prev));
            try {
                await window.api.updateContact(clientId, contactId, {
                    siteId: normalizedSiteId || null
                });
                dirtyRef.current = true;
                setSaveHint(null);
            } catch (error) {
                console.error('Failed to update contact site link:', error);
                setLinkedContacts(previousLinked);
                setAvailableContacts(previousAvailable);
            }
        };

        if (!projectId) return null;

        return (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                            <i className="fas fa-address-book" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900">Project contacts</h2>
                            <p className="text-xs text-gray-500">Link contacts from this client's CRM record</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {saveHint === 'saved' && (
                            <span className="text-xs font-medium text-emerald-600">
                                <i className="fas fa-check-circle mr-1" />
                                Saved
                            </span>
                        )}
                        {saveHint === 'error' && <span className="text-xs font-medium text-red-600">Save failed</span>}
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-save" />}
                            Save
                        </button>
                    </div>
                </div>

                {!clientId ? (
                    <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                        Link a client to this project first, then you can select contacts from CRM.
                    </p>
                ) : (
                    <div className="mt-3 space-y-3">
                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                            <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-wide mb-2">
                                Add new CRM contact
                            </h3>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <input
                                    type="text"
                                    value={newContact.name}
                                    onChange={(e) => setNewContact((prev) => ({ ...prev, name: e.target.value }))}
                                    placeholder="Name *"
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                />
                                <input
                                    type="email"
                                    value={newContact.email}
                                    onChange={(e) => setNewContact((prev) => ({ ...prev, email: e.target.value }))}
                                    placeholder="Email"
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                />
                                <input
                                    type="tel"
                                    value={newContact.phone}
                                    onChange={(e) => setNewContact((prev) => ({ ...prev, phone: e.target.value }))}
                                    placeholder="Phone"
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                />
                                <input
                                    type="text"
                                    value={newContact.role}
                                    onChange={(e) => setNewContact((prev) => ({ ...prev, role: e.target.value }))}
                                    placeholder="Role"
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                />
                                <select
                                    value={newContact.siteId}
                                    onChange={(e) => setNewContact((prev) => ({ ...prev, siteId: e.target.value }))}
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 sm:col-span-2"
                                >
                                    <option value="">No specific site</option>
                                    {(sites || []).map((site) => (
                                        <option key={site.id} value={site.id}>
                                            {site.name || site.id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="mt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={createAndLinkContact}
                                    disabled={savingNewContact || !String(newContact.name || '').trim()}
                                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {savingNewContact ? <i className="fas fa-spinner fa-spin text-[10px]" /> : <i className="fas fa-plus text-[10px]" />}
                                    Add to CRM and link
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <select
                                value={selectedContactId}
                                onChange={(e) => setSelectedContactId(e.target.value)}
                                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                disabled={loadingContacts || availableToLink.length === 0}
                            >
                                <option value="">
                                    {loadingContacts
                                        ? 'Loading CRM contacts...'
                                        : availableToLink.length > 0
                                          ? 'Select a CRM contact to link'
                                          : 'No additional CRM contacts available'}
                                </option>
                                {availableToLink.map((contact) => (
                                    <option key={contact.id} value={contact.id}>
                                        {contact.name || contact.email || contact.phone || contact.id}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={addSelectedContact}
                                disabled={!selectedContactId}
                                className="inline-flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <i className="fas fa-link text-[10px]" />
                                Link contact
                            </button>
                        </div>

                        {linkedContacts.length === 0 ? (
                            <p className="text-xs text-gray-500">No contacts linked to this project yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {linkedContacts.map((contact) => (
                                    <li
                                        key={contact.id}
                                        className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {contact.name || 'Unnamed contact'}
                                            </p>
                                            <p className="text-xs text-gray-600 truncate">{contact.role || 'No role set'}</p>
                                            <p className="text-xs text-gray-600 truncate">
                                                {[contact.email, contact.phone].filter(Boolean).join(' - ') || 'No contact details'}
                                            </p>
                                            {contact.siteId ? (
                                                <p className="text-xs text-primary-700 truncate">
                                                    <i className="fas fa-map-marker-alt mr-1 text-[10px]" />
                                                    {siteNameById.get(String(contact.siteId)) || `Site ${contact.siteId}`}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={contact.siteId || ''}
                                                onChange={(e) => updateContactSite(contact.id, e.target.value)}
                                                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
                                                title="Assign site"
                                            >
                                                <option value="">No site</option>
                                                {(sites || []).map((site) => (
                                                    <option key={site.id} value={site.id}>
                                                        {site.name || site.id}
                                                    </option>
                                                ))}
                                            </select>
                                            {contact.email ? (
                                                <a
                                                    href={`mailto:${contact.email}`}
                                                    className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                                                >
                                                    <i className="fas fa-envelope mr-1.5 text-[10px]" />
                                                    Email
                                                </a>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => removeLinkedContact(contact.id)}
                                                className="inline-flex items-center rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                                            >
                                                <i className="fas fa-unlink mr-1.5 text-[10px]" />
                                                Unlink
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        );
    };

    /**
     * Overview tab — stable component (defined once next to OnlineDriveLinksEditor).
     * Do NOT use `const OverviewSection = () => {}` inside ProjectDetail: a new function each render
     * remounts all children so link inputs lose focus and the UI flashes.
     */
    const ProjectOverviewSection = ({ project, tasks, users, onProjectUpdate, formatProjectDate }) => {
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        const totalTasks = safeTasks.length;
        const completedTasks = safeTasks.filter((t) => t.status === 'Done').length;
        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const activeUsers = users.filter((u) => u.status === 'Active');

        const today = new Date();
        const dueDate = project.dueDate ? new Date(project.dueDate) : null;
        const daysUntilDue = dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : null;

        return (
            <div className="space-y-4">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h2 className="text-sm font-semibold text-gray-900 mb-3">Project Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Client</label>
                            <p className="text-sm text-gray-900">{project.client || 'Not assigned'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Project Type</label>
                            <p className="text-sm text-gray-900">{project.type}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Status</label>
                            <span
                                className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
                                    project.status === 'In Progress'
                                        ? 'bg-blue-100 text-blue-700'
                                        : project.status === 'Active'
                                          ? 'bg-green-100 text-green-700'
                                          : project.status === 'Completed'
                                            ? 'bg-blue-100 text-blue-700'
                                            : project.status === 'On Hold'
                                              ? 'bg-yellow-100 text-yellow-700'
                                              : project.status === 'Cancelled'
                                                ? 'bg-red-100 text-red-700'
                                                : 'bg-gray-100 text-gray-700'
                                }`}
                            >
                                {project.status}
                            </span>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Assigned To</label>
                            <p className="text-sm text-gray-900">{project.assignedTo || 'Not assigned'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Start Date</label>
                            <p className="text-sm text-gray-900">{formatProjectDate(project.startDate) || 'Not set'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Due Date</label>
                            <p className="text-sm text-gray-900">{formatProjectDate(project.dueDate) || 'Not set'}</p>
                        </div>
                        {project.description && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-500 mb-0.5">Description</label>
                                <p className="text-sm text-gray-700">{project.description}</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Total Tasks</p>
                                <p className="text-xl font-bold text-gray-900">{totalTasks}</p>
                            </div>
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-tasks text-blue-600"></i>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Completed</p>
                                <p className="text-xl font-bold text-green-600">{completedTasks}</p>
                            </div>
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-check-circle text-green-600"></i>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Completion</p>
                                <p className="text-xl font-bold text-primary-600">{completionPercentage}%</p>
                            </div>
                            <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-chart-pie text-primary-600"></i>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-gray-600 mb-0.5">Days Until Due</p>
                                <p
                                    className={`text-xl font-bold ${
                                        daysUntilDue === null
                                            ? 'text-gray-400'
                                            : daysUntilDue < 0
                                              ? 'text-red-600'
                                              : daysUntilDue <= 7
                                                ? 'text-yellow-600'
                                                : 'text-gray-900'
                                    }`}
                                >
                                    {daysUntilDue === null
                                        ? 'N/A'
                                        : daysUntilDue < 0
                                          ? `${Math.abs(daysUntilDue)} overdue`
                                          : daysUntilDue}
                                </p>
                            </div>
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-calendar-alt text-blue-600"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <OnlineDriveLinksEditor
                    projectId={project?.id}
                    initialSerialized={project?.onlineDriveLinks}
                    onProjectUpdate={onProjectUpdate}
                />
                <ProjectContactsEditor
                    projectId={project?.id}
                    clientId={project?.clientId}
                    initialSerialized={project?.projectContacts}
                    onProjectUpdate={onProjectUpdate}
                />

                {activeUsers.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h2 className="text-sm font-semibold text-gray-900 mb-3">Team Members</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {activeUsers.map((user) => (
                                <div key={user.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm">
                                        {user.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                                        <p className="text-xs text-gray-500">
                                            {user.role} • {user.department}
                                        </p>
                                    </div>
                                    <a
                                        href={`mailto:${user.email}`}
                                        className="text-primary-600 hover:text-primary-700 text-xs"
                                    >
                                        <i className="fas fa-envelope"></i>
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const ProjectDetail = ({ project, onBack, onDelete, onProjectUpdate }) => {
        const ReactHooks = window.React;
        if (!ReactHooks || typeof ReactHooks.useState !== 'function') {
            console.error('❌ ProjectDetail: React hooks unavailable at render time', ReactHooks);
            if (window.React && typeof window.React.createElement === 'function') {
                return window.React.createElement(
                    'div',
                    { className: 'p-4 text-sm text-red-600' },
                    'Project detail is still loading...'
                );
            }
            return null;
        }
        const { useState, useEffect, useRef, useCallback, useMemo, Fragment } = ReactHooks;
        const React = ReactHooks; // Keep React available for React.Fragment fallback
        const TASK_LIST_DEBUG = false; // Set true to log tasks without matching listId
        const [listModalComponent, setListModalComponent] = useState(
            () => (typeof window.ListModal === 'function' ? window.ListModal : null)
        );
        const [taskDetailModalComponent, setTaskDetailModalComponent] = useState(
            () => (typeof window.TaskDetailModal === 'function' ? window.TaskDetailModal : null)
        );
        const [isListModalLoading, setIsListModalLoading] = useState(false);
        const [isTaskDetailModalLoading, setIsTaskDetailModalLoading] = useState(false);
        const [commentsPopupComponent, setCommentsPopupComponent] = useState(
            () => (typeof window.CommentsPopup === 'function' ? window.CommentsPopup : null)
        );
        const [isCommentsPopupLoading, setIsCommentsPopupLoading] = useState(false);
        const [projectModalComponent, setProjectModalComponent] = useState(
            () => (typeof window.ProjectModal === 'function' ? window.ProjectModal : null)
        );
        const [isProjectModalLoading, setIsProjectModalLoading] = useState(false);
        const listModalLoadPromiseRef = useRef(null);
        const taskDetailModalLoadPromiseRef = useRef(null);
        const commentsPopupLoadPromiseRef = useRef(null);
        const projectModalLoadPromiseRef = useRef(null);
        const ensureTaskDetailModalLoadedRef = useRef(null);
    
    // Ensure functions for lazy loading components - defined early to avoid TDZ issues
    // These must be defined before any useEffect hooks that reference them
    const ensureListModalLoaded = useCallback(async () => {
        if (typeof window.ListModal === 'function') {
            if (!listModalComponent) {
                setListModalComponent(() => window.ListModal);
            }
            return true;
        }

        if (listModalLoadPromiseRef.current) {
            return listModalLoadPromiseRef.current;
        }

        setIsListModalLoading(true);

        const loadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `/dist/src/components/projects/ListModal.js?v=list-modal-on-demand-${Date.now()}`;
            script.async = true;
            script.dataset.listModalLoader = 'true';

            script.onload = () => {
                setIsListModalLoading(false);
                listModalLoadPromiseRef.current = null;
                if (typeof window.ListModal === 'function') {
                    setListModalComponent(() => window.ListModal);
                    resolve(true);
                } else {
                    const message = 'The list editor loaded but did not register correctly. Please refresh the page and try again.';
                    console.error(message);
                    alert(message);
                    resolve(false);
                }
            };

            script.onerror = () => {
                setIsListModalLoading(false);
                listModalLoadPromiseRef.current = null;
                const message = 'Failed to load the list editor. Please check your connection and refresh the page.';
                console.error(message);
                alert(message);
                resolve(false);
            };

            document.body.appendChild(script);
        });

        listModalLoadPromiseRef.current = loadPromise;
        return loadPromise;
    }, [listModalComponent]);

    const ensureTaskDetailModalLoaded = useCallback(async () => {
        if (typeof window.TaskDetailModal === 'function') {
            if (!taskDetailModalComponent) {
                setTaskDetailModalComponent(() => window.TaskDetailModal);
            }
            return true;
        }

        if (taskDetailModalLoadPromiseRef.current) {
            return taskDetailModalLoadPromiseRef.current;
        }

        setIsTaskDetailModalLoading(true);

        const loadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `/dist/src/components/projects/TaskDetailModal.js?v=task-detail-modal-fallback-${Date.now()}`;
            script.async = true;
            script.dataset.taskDetailModalLoader = 'true';

            script.onload = () => {
                setIsTaskDetailModalLoading(false);
                taskDetailModalLoadPromiseRef.current = null;
                if (typeof window.TaskDetailModal === 'function') {
                    setTaskDetailModalComponent(() => window.TaskDetailModal);
                    resolve(true);
                } else {
                    console.warn('⚠️ TaskDetailModal script loaded but component not registered');
                    resolve(false);
                }
            };

            script.onerror = (error) => {
                console.error('❌ Failed to load TaskDetailModal:', error);
                setIsTaskDetailModalLoading(false);
                taskDetailModalLoadPromiseRef.current = null;
                resolve(false);
            };

            document.body.appendChild(script);
        });

        taskDetailModalLoadPromiseRef.current = loadPromise;
        return loadPromise;
    }, [taskDetailModalComponent]);

    const ensureCommentsPopupLoaded = useCallback(async () => {
        if (typeof window.CommentsPopup === 'function') {
            if (!commentsPopupComponent) {
                setCommentsPopupComponent(() => window.CommentsPopup);
            }
            return true;
        }

        if (commentsPopupLoadPromiseRef.current) {
            return commentsPopupLoadPromiseRef.current;
        }

        setIsCommentsPopupLoading(true);

        const loadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `/dist/src/components/projects/CommentsPopup.js?v=comments-popup-fallback-${Date.now()}`;
            script.async = true;
            script.dataset.commentsPopupLoader = 'true';

            script.onload = () => {
                setIsCommentsPopupLoading(false);
                commentsPopupLoadPromiseRef.current = null;
                if (typeof window.CommentsPopup === 'function') {
                    setCommentsPopupComponent(() => window.CommentsPopup);
                    resolve(true);
                } else {
                    console.warn('⚠️ CommentsPopup script loaded but component not registered');
                    resolve(false);
                }
            };

            script.onerror = (error) => {
                console.error('❌ Failed to load CommentsPopup:', error);
                setIsCommentsPopupLoading(false);
                commentsPopupLoadPromiseRef.current = null;
                resolve(false);
            };

            document.body.appendChild(script);
        });

        commentsPopupLoadPromiseRef.current = loadPromise;
        return loadPromise;
    }, [commentsPopupComponent]);

    const ensureProjectModalLoaded = useCallback(async () => {
        if (typeof window.ProjectModal === 'function') {
            if (!projectModalComponent) {
                setProjectModalComponent(() => window.ProjectModal);
            }
            return true;
        }

        if (projectModalLoadPromiseRef.current) {
            return projectModalLoadPromiseRef.current;
        }

        setIsProjectModalLoading(true);

        const loadPromise = new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = `/dist/src/components/projects/ProjectModal.js?v=project-modal-fallback-${Date.now()}`;
            script.async = true;
            script.dataset.projectModalLoader = 'true';

            script.onload = () => {
                setIsProjectModalLoading(false);
                projectModalLoadPromiseRef.current = null;
                if (typeof window.ProjectModal === 'function') {
                    setProjectModalComponent(() => window.ProjectModal);
                    resolve(true);
                } else {
                    console.warn('⚠️ ProjectModal script loaded but component not registered');
                    resolve(false);
                }
            };

            script.onerror = (error) => {
                console.error('❌ Failed to load ProjectModal:', error);
                setIsProjectModalLoading(false);
                projectModalLoadPromiseRef.current = null;
                resolve(false);
            };

            document.body.appendChild(script);
        });

        projectModalLoadPromiseRef.current = loadPromise;
        return loadPromise;
    }, [projectModalComponent]);
    
    // Check if required components are loaded
    const requiredComponents = {
        ListModal: window.ListModal,
        ProjectModal: window.ProjectModal,
        CustomFieldModal: window.CustomFieldModal,
        TaskDetailModal: window.TaskDetailModal,
        KanbanView: window.KanbanView,
        CommentsPopup: window.CommentsPopup,
        DocumentCollectionModal: window.DocumentCollectionModal,
        MonthlyDocumentCollectionTracker: window.MonthlyDocumentCollectionTracker
    };
    
    const missingComponents = Object.entries(requiredComponents)
        .filter(([name, component]) => !component)
        .map(([name]) => name);
    
    if (missingComponents.length > 0) {
        console.error('❌ ProjectDetail: Missing required components:', missingComponents);
        console.error('🔍 Available window components:', Object.keys(window).filter(key => 
            key.includes('Modal') || key.includes('View') || key.includes('Tracker') || key.includes('Popup')
        ));
    } else {
    }
    
    // Tab navigation state
    // Check URL for deep link parameters first (e.g., docSectionId for Document Collection)
    // If found, start with the appropriate tab; otherwise default to Overview
    const getInitialActiveSection = () => {
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        let params = null;
        if (hash.includes('?')) {
            const hashParts = hash.split('?');
            if (hashParts.length > 1) params = new URLSearchParams(hashParts[1]);
        }
        if (!params && search) params = new URLSearchParams(search);
        
        const tabFromUrl = params ? (() => {
            const t = params.get('tab');
            return t && ['overview', 'tasks', 'time', 'documentCollection', 'monthlyFMSReview', 'weeklyFMSReview', 'monthlyDataReview', 'complianceReview', 'activity', 'notes'].includes(t) ? t : null;
        })() : null;
        const hasDocWeek = params ? !!params.get('docWeek') : false;
        const hasWeeklySectionId = params ? !!params.get('weeklySectionId') : false;
        const hasDocMonth = params ? !!params.get('docMonth') : false;
        const hasDocSectionId = params ? !!params.get('docSectionId') : false;
        const hasDocDocumentId = params ? !!params.get('docDocumentId') : false;
        const hasDocYear = params ? !!params.get('docYear') : false;
        const hasCommentId = params ? !!params.get('commentId') : false;
        
        // Email/link deep links: tab=monthlyFMSReview goes to Monthly FMS tab
        if (tabFromUrl === 'monthlyFMSReview') return 'monthlyFMSReview';
        // docWeek or weeklySectionId -> Weekly FMS tab (links from email/notifications)
        if (hasDocWeek || hasWeeklySectionId) return 'weeklyFMSReview';
        // docSectionId + docMonth (and not docWeek) -> Document Collection tab
        const hasDocCollectionParams = (hasDocSectionId || (hasDocDocumentId && hasDocMonth) || (hasDocYear && (hasDocSectionId || hasDocDocumentId))) && !hasDocWeek;
        if (hasDocCollectionParams) return 'documentCollection';
        if (tabFromUrl) return tabFromUrl;
        // commentId only (no section/doc) -> document collection; tracker will search for comment
        if (hasCommentId && !hasDocSectionId && !params?.get('task') && !hasWeeklySectionId) return 'documentCollection';
        return 'overview';
    };
    
    const [activeSection, setActiveSection] = useState(getInitialActiveSection);
    
    // Wrapper function to update both section state and URL
    const switchSection = useCallback((section, options = {}) => {
        try {
        setActiveSection(section);
        
        // Update URL if updateProjectUrl function is available
        // BUT: Don't overwrite hash-based deep link parameters (docSectionId, etc.)
        // These should be preserved for document collection tracker navigation
        const hash = window.location.hash || '';
        const hasDeepLinkParams = hash.includes('docSectionId=') || 
                                   hash.includes('weeklySectionId=') ||
                                   hash.includes('docDocumentId=') ||
                                   hash.includes('weeklyDocumentId=');
        
        if (window.updateProjectUrl && project?.id && !hasDeepLinkParams) {
            // Only update URL if there are no deep link params to preserve
            window.updateProjectUrl({
                tab: section,
                section: options.section,
                commentId: options.commentId,
                focusInput: options.focusInput
            });
            }
        } catch (error) {
            console.error('❌ Error in switchSection:', error);
            alert('Failed to switch section: ' + (error?.message || 'Unknown error'));
        }
    }, [project?.id]);
    
    // Helper function to update URL with task and/or comment parameters
    // CRITICAL: Always ensures project ID is in the path, not just query params
    // Moved here to avoid temporal dead zone error - must be defined before use in useEffect
    const updateUrl = useCallback((options = {}) => {
        if (!project?.id) {
            console.warn('⚠️ ProjectDetail: Cannot update URL - project.id is missing');
            return;
        }
        
        const { 
            task: taskId = null, 
            comment: commentId = null, 
            focusInput = null,
            clearTask = false, 
            clearComment = false, 
            clearFocusInput = false,
            replace = false 
        } = options;
        
        // Build search params
        const searchParams = new URLSearchParams();
        
        // Update task parameter
        if (taskId && !clearTask) {
            searchParams.set('task', String(taskId));
        }
        
        // Update comment parameter
        if (commentId && !clearComment) {
            searchParams.set('commentId', String(commentId));
        }

        if (focusInput && !clearFocusInput) {
            searchParams.set('focusInput', String(focusInput));
        }
        
        const searchString = searchParams.toString();
        const newSearch = searchString ? `?${searchString}` : '';
        const projectId = String(project.id);
        
        // ALWAYS ensure project ID is in the path - this is critical!
        // CRITICAL: Always ensure project ID is in the path, not just query params
        // Try multiple methods, but always fall back to direct URL manipulation if needed
        let urlUpdated = false;
        
        if (window.updateProjectUrl && typeof window.updateProjectUrl === 'function') {
            try {
                // Use Projects component's update function (this should handle path + search)
                const urlOptions = {};
                if (taskId && !clearTask) {
                    urlOptions.task = taskId;
                } else if (clearTask) {
                    // Explicitly remove task parameter by setting to null
                    urlOptions.task = null;
                }
                if (commentId && !clearComment) {
                    urlOptions.commentId = commentId;
                } else if (clearComment) {
                    urlOptions.commentId = null;
                }
                if (focusInput && !clearFocusInput) {
                    urlOptions.focusInput = focusInput;
                } else if (clearFocusInput) {
                    urlOptions.focusInput = null;
                }
                // window.updateProjectUrl only takes options, not projectId (it uses viewingProject.id internally)
                window.updateProjectUrl(urlOptions);
                urlUpdated = true;
            } catch (e) {
                console.warn('⚠️ updateProjectUrl failed, using fallback:', e);
            }
        }
        
        if (!urlUpdated && window.RouteState?.navigate) {
            try {
                // Use RouteState.navigate - explicitly set segments to include project ID
                // Use replace: true to prevent navigation events that cause page flashes
                window.RouteState.navigate({
                    page: 'projects',
                    segments: [projectId], // CRITICAL: Always include project ID in segments
                    search: newSearch,
                    preserveSearch: false,
                    preserveHash: false,
                    replace: replace // Use replace parameter to prevent navigation events
                });
                urlUpdated = true;
            } catch (e) {
                console.warn('⚠️ RouteState.navigate failed, using fallback:', e);
            }
        }
        
        if (!urlUpdated && window.RouteState?.setPageSubpath) {
            try {
                // Use setPageSubpath - explicitly set segments to include project ID
                // Use replace parameter to prevent navigation events
                window.RouteState.setPageSubpath('projects', [projectId], { // CRITICAL: Always include project ID
                    replace: replace, // Use replace parameter to prevent navigation events
                    preserveSearch: false,
                    preserveHash: false
                });
                urlUpdated = true;
            } catch (e) {
                console.warn('⚠️ RouteState.setPageSubpath failed, using fallback:', e);
            }
        }
        
        // ALWAYS use direct URL manipulation as final fallback to ensure it works
        // This ensures the URL is ALWAYS updated, even if other methods fail
        // CRITICAL: Always ensure project ID is in path, even if current URL is just /projects
        const url = new URL(window.location.href);
        const currentPath = url.pathname;
        const expectedPath = `/projects/${projectId}`;
        
        // Always update if:
        // 1. Pathname doesn't include project ID, OR
        // 2. We have search params to add/update, OR  
        // 3. Pathname doesn't match expected path exactly
        const needsUpdate = 
            !currentPath.includes(projectId) || 
            currentPath !== expectedPath || 
            newSearch !== url.search;
        
        if (needsUpdate) {
            url.pathname = expectedPath; // CRITICAL: Always set pathname with project ID
            url.search = newSearch;
            
            // Use replaceState when replace=true to prevent navigation events that cause page flashes
            // Use pushState only when replace=false (for normal navigation)
            try {
                if (replace) {
                    window.history.replaceState({}, '', url);
                    console.log('✅ URL updated via replaceState (no navigation):', url.href);
                } else {
                window.history.pushState({}, '', url);
                    console.log('✅ URL updated via pushState:', url.href, '(was:', window.location.href + ')');
                }
                
                // Verify it actually updated
                setTimeout(() => {
                    const verifyUrl = window.location.href;
                    if (!verifyUrl.includes(projectId) || (newSearch && !verifyUrl.includes(newSearch.replace('?', '')))) {
                        console.error('❌ URL update failed! Expected:', url.href, 'Got:', verifyUrl);
                        // Try one more time with replaceState
                        window.history.replaceState({}, '', url);
                    }
                }, 50);
            } catch (e) {
                console.error('❌ Error updating URL:', e);
                // Last resort: try replaceState
                try {
                    window.history.replaceState({}, '', url);
                } catch (e2) {
                    console.error('❌ replaceState also failed:', e2);
                }
            }
        } else {
            console.log('ℹ️ URL already correct, no update needed');
        }
    }, [project]);
    
    // Normalize list from API: use listId as id for task grouping (task.listId === list.id), keep _pk for API calls
    const normalizeTaskList = (l) => ({
        ...l,
        id: l.listId != null ? l.listId : l.id,
        ...(l.id && typeof l.id === 'string' && l.listId != null ? { _pk: l.id } : {})
    });
    // Initialize taskLists with project-specific data
    // CRITICAL: If project.taskLists is empty array, use default lists to ensure tasks can be displayed
    const [taskLists, setTaskLists] = useState(
        (project.taskLists && Array.isArray(project.taskLists) && project.taskLists.length > 0)
            ? project.taskLists.map(normalizeTaskList)
            : [
                { id: 1, name: 'To Do', color: 'blue', description: '' }
            ]
    );

    // Initialize tasks with project-specific data - SYNCHRONOUS for instant load
    // NOTE: API returns tasks in tasksList field (from Task table), not tasks field
    // CRITICAL: Always use project prop tasks immediately - no async loading
    const getTasksFromProject = (proj) => {
        if (!proj) return [];
        // Ensure we always return an array - check if values are actually arrays
        const tasksList = Array.isArray(proj.tasksList) ? proj.tasksList : null;
        const tasks = Array.isArray(proj.tasks) ? proj.tasks : null;
        return tasksList || tasks || [];
    };
    // Preserve comments when merging new tasks with previous state (avoids COMMENTS column disappearing after refresh)
    // CRITICAL: Preserve tasks that exist only in prev (e.g. just-created tasks not yet in API/project response) so they never disappear when we merge with stale data.
    const mergeTaskComments = useCallback((prevTasks, nextTasks) => {
        if (!Array.isArray(prevTasks)) return Array.isArray(nextTasks) ? nextTasks : [];
        if (!Array.isArray(nextTasks)) return prevTasks;
        const nextIds = new Set((nextTasks || []).map(t => String(t?.id)).filter(Boolean));
        const prevById = new Map(prevTasks.map(t => [String(t?.id), t]));
        const mergedFromNext = nextTasks.map(task => {
            const prev = prevById.get(String(task?.id));
            const hasComments = Array.isArray(task?.comments) && task.comments.length > 0;
            const prevHasComments = prev && Array.isArray(prev.comments) && prev.comments.length > 0;
            let merged = task;
            if (!hasComments && prevHasComments) {
                merged = { ...task, comments: prev.comments };
            }
            if (merged.subtasks && merged.subtasks.length > 0 && prev?.subtasks?.length) {
                const prevSubById = new Map((prev.subtasks || []).map(st => [String(st?.id), st]));
                merged = {
                    ...merged,
                    subtasks: merged.subtasks.map(st => {
                        const prevSt = prevSubById.get(String(st?.id));
                        const stHasComments = Array.isArray(st?.comments) && st.comments.length > 0;
                        const prevStHasComments = prevSt && Array.isArray(prevSt.comments) && prevSt.comments.length > 0;
                        if (!stHasComments && prevStHasComments) return { ...st, comments: prevSt.comments };
                        return st;
                    })
                };
            }
            return merged;
        });
        const prevOnly = prevTasks.filter(t => t?.id != null && !nextIds.has(String(t.id)));
        return prevOnly.length ? [...mergedFromNext, ...prevOnly] : mergedFromNext;
    }, []);
    const initialTasks = getTasksFromProject(project);
    // Safety check: ensure initialTasks is always an array
    const [tasks, setTasks] = useState(Array.isArray(initialTasks) ? initialTasks : []);
    const [viewingTask, setViewingTask] = useState(null);
    const [viewingTaskParent, setViewingTaskParent] = useState(null);
    // Use a ref to store current tasks value to avoid TDZ issues in closures
    const tasksRef = useRef(initialTasks);
    // Unique temp id for new tasks (avoids collision when adding two tasks in same millisecond — second API response would replace both and first task would disappear)
    const nextTempTaskIdRef = useRef(0);
    // Drag-and-drop reorder: source (listId, taskIndex)
    const taskDragRef = useRef(null);
    const taskJustDroppedRef = useRef(false);
    const [dragOverTask, setDragOverTask] = useState(null); // { listId, taskIndex } or null
    // Activity log: null = use project.activityLog from initial load; array = fetched for Activity tab / after mutations
    const [activityLogEntries, setActivityLogEntries] = useState(null);
    const [noteActivityEntries, setNoteActivityEntries] = useState(null);
    // Public notes for this project (Notes tab) — from My Notes (user notes made public)
    const [projectNotes, setProjectNotes] = useState(null); // user notes (public) for this project
    // Notes from the project notes table (created from this project's Notes tab)
    const [projectNotesFromProject, setProjectNotesFromProject] = useState(null);
    const [selectedProjectNote, setSelectedProjectNote] = useState(null);
    // Full note opened for editing in-project (same UI as My Notes)
    const [editingNoteFull, setEditingNoteFull] = useState(null);
    const [editingNoteSource, setEditingNoteSource] = useState(null); // 'project' | 'user'
    const [noteEditorReady, setNoteEditorReady] = useState(false);
    const [noteEditorData, setNoteEditorData] = useState({ clients: [], projects: [], clientProjects: [], users: [], allTags: [] });
    const [isSavingNote, setIsSavingNote] = useState(false);
    const [showNoteShareModal, setShowNoteShareModal] = useState(false);
    const [noteShareSelectedUsers, setNoteShareSelectedUsers] = useState([]);
    // Per-note activity: when editing a note, activity for that note; in list, expanded note's activity
    const [noteActivityForEditor, setNoteActivityForEditor] = useState([]);
    const [expandedNoteActivityId, setExpandedNoteActivityId] = useState(null);
    const [noteActivityByNoteId, setNoteActivityByNoteId] = useState({});
    const [editorActivityPanelOpen, setEditorActivityPanelOpen] = useState(false);
    // Keep ref in sync with state
    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    // Reset activity log and project notes when switching project
    useEffect(() => {
        setActivityLogEntries(null);
        setNoteActivityEntries(null);
        setProjectNotes(null);
        setProjectNotesFromProject(null);
        setSelectedProjectNote(null);
        setEditingNoteFull(null);
        setEditingNoteSource(null);
        setNoteActivityForEditor([]);
        setExpandedNoteActivityId(null);
        setNoteActivityByNoteId({});
        setEditorActivityPanelOpen(false);
    }, [project?.id]);

    const loadActivityLog = useCallback(async () => {
        if (!project?.id || !window.DatabaseAPI?.makeRequest) return;
        try {
            const url = `/project-activity-logs?projectId=${encodeURIComponent(project.id)}&limit=100`;
            const response = await window.DatabaseAPI.makeRequest(url, { method: 'GET', forceRefresh: true });
            const data = response?.data ?? response;
            const logs = data?.logs ?? (Array.isArray(data) ? data : []);
            setActivityLogEntries(Array.isArray(logs) ? logs : []);
        } catch (err) {
            console.warn('Failed to load activity log:', err?.message);
        }
    }, [project?.id]);

    const loadNoteActivity = useCallback(async () => {
        if (!project?.id || !window.DatabaseAPI?.makeRequest) return;
        try {
            const url = `/project-activity-logs?projectId=${encodeURIComponent(project.id)}&limit=100`;
            const response = await window.DatabaseAPI.makeRequest(url, { method: 'GET', forceRefresh: true });
            const data = response?.data ?? response;
            const logs = data?.logs ?? (Array.isArray(data) ? data : []);
            const noteTypes = ['note_created', 'note_updated', 'note_deleted'];
            const filtered = (Array.isArray(logs) ? logs : []).filter((log) => noteTypes.includes(log.type));
            setNoteActivityEntries(filtered);
        } catch (err) {
            console.warn('Failed to load note activity:', err?.message);
        }
    }, [project?.id]);

    /** Load activity for a single note (for per-note activity). Returns array of log entries. */
    const loadActivityForNote = useCallback(async (noteId) => {
        if (!project?.id || !noteId || !window.DatabaseAPI?.makeRequest) return [];
        try {
            const url = `/project-activity-logs?projectId=${encodeURIComponent(project.id)}&noteId=${encodeURIComponent(noteId)}&limit=50`;
            const response = await window.DatabaseAPI.makeRequest(url, { method: 'GET', forceRefresh: true });
            const data = response?.data ?? response;
            const logs = data?.logs ?? (Array.isArray(data) ? data : []);
            return Array.isArray(logs) ? logs : [];
        } catch (err) {
            console.warn('Failed to load activity for note:', err?.message);
            return [];
        }
    }, [project?.id]);

    useEffect(() => {
        if (activeSection === 'activity' && project?.id) {
            loadActivityLog();
        }
    }, [activeSection, project?.id, loadActivityLog]);

    const loadProjectNotes = useCallback(async () => {
        if (!project?.id || !window.storage?.getToken) return;
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/projects/${project.id}/public-notes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                const list = data?.data?.notes ?? data?.notes ?? [];
                const withSource = (Array.isArray(list) ? list : []).map(n => ({ ...n, source: 'user' }));
                setProjectNotes(withSource);
            } else {
                setProjectNotes([]);
            }
        } catch (err) {
            console.warn('Failed to load project notes:', err?.message);
            setProjectNotes([]);
        }
    }, [project?.id]);

    const loadProjectNotesFromProject = useCallback(async () => {
        if (!project?.id || !window.storage?.getToken) return;
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/projects/${project.id}/notes`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                const list = data?.data?.notes ?? data?.notes ?? [];
                setProjectNotesFromProject(Array.isArray(list) ? list : []);
            } else {
                setProjectNotesFromProject([]);
            }
        } catch (err) {
            console.warn('Failed to load project notes from project:', err?.message);
            setProjectNotesFromProject([]);
        }
    }, [project?.id]);

    useEffect(() => {
        if (activeSection === 'notes' && project?.id) {
            loadProjectNotes();
            loadProjectNotesFromProject();
            loadNoteActivity();
        }
    }, [activeSection, project?.id, loadProjectNotes, loadProjectNotesFromProject, loadNoteActivity]);

    // Load this note's activity when editing a note
    useEffect(() => {
        if (!editingNoteFull?.id || !loadActivityForNote) return;
        let cancelled = false;
        loadActivityForNote(editingNoteFull.id).then((logs) => {
            if (!cancelled) setNoteActivityForEditor(Array.isArray(logs) ? logs : []);
        });
        return () => { cancelled = true; };
    }, [editingNoteFull?.id, loadActivityForNote]);

    // Load NoteEditor script when we need to edit a note in-project and it's not loaded yet
    useEffect(() => {
        if (!editingNoteFull || window.NoteEditor) {
            if (window.NoteEditor) setNoteEditorReady(true);
            return;
        }
        const scriptSrc = '/dist/src/components/notes/NoteEditor.js';
        if (document.querySelector(`script[src="${scriptSrc}"]`)) {
            setNoteEditorReady(!!window.NoteEditor);
            return;
        }
        const script = document.createElement('script');
        script.src = scriptSrc;
        script.onload = () => setNoteEditorReady(true);
        script.onerror = () => setNoteEditorReady(false);
        document.body.appendChild(script);
    }, [editingNoteFull]);

    // Load clients, projects, users for note editor when opening a note
    const loadNoteEditorData = useCallback(async () => {
        const token = window.storage?.getToken?.();
        if (!token) return;
        try {
            const [clientsRes, projectsRes, usersRes] = await Promise.all([
                fetch('/api/clients', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/projects?limit=500', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } })
            ]);
            const clientsData = clientsRes.ok ? await clientsRes.json().catch(() => ({})) : {};
            const projectsData = projectsRes.ok ? await projectsRes.json().catch(() => ({})) : {};
            const usersData = usersRes.ok ? await usersRes.json().catch(() => ({})) : {};
            const clients = clientsData?.data?.clients ?? clientsData?.clients ?? [];
            const projectsList = projectsData?.data?.projects ?? projectsData?.projects ?? [];
            const usersList = usersData?.data?.users ?? usersData?.users ?? [];
            const allTags = Array.from(new Set((projectNotes || []).flatMap(n => n.tags || []).map(String).filter(Boolean))).sort((a, b) => a.localeCompare(b));
            setNoteEditorData(prev => ({
                clients: Array.isArray(clients) ? clients : prev.clients,
                projects: Array.isArray(projectsList) ? projectsList : prev.projects,
                clientProjects: prev.clientProjects,
                users: Array.isArray(usersList) ? usersList : prev.users,
                allTags: allTags.length ? allTags : prev.allTags
            }));
        } catch (e) {
            console.warn('Failed to load note editor data:', e);
        }
    }, [projectNotes]);

    const loadProjectsForNoteClient = useCallback(async (clientId) => {
        if (!clientId || !window.storage?.getToken?.()) return;
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/projects?clientId=${encodeURIComponent(clientId)}&limit=500`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json().catch(() => ({}));
            const list = Array.isArray(data?.data?.projects) ? data.data.projects : Array.isArray(data?.projects) ? data.projects : [];
            setNoteEditorData(prev => ({ ...prev, clientProjects: list }));
        } catch (e) {
            setNoteEditorData(prev => ({ ...prev, clientProjects: [] }));
        }
    }, []);

    const openNoteForEditing = useCallback(async (note) => {
        if (!note?.id || !window.storage?.getToken?.()) return;
        const source = note.source || 'user';
        setSelectedProjectNote(note);
        setEditingNoteSource(source);
        if (source === 'project') {
            try {
                const token = window.storage.getToken();
                const response = await fetch(`/api/projects/${project.id}/notes/${note.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (response.ok) {
                    const data = await response.json();
                    const fullNote = data?.data?.note ?? data?.note ?? note;
                    setEditingNoteFull(fullNote);
                } else {
                    setEditingNoteFull(note);
                }
            } catch (e) {
                console.warn('Failed to load project note:', e);
                setEditingNoteFull(note);
            }
            return;
        }
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/user-notes/${note.id}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) return;
            const data = await response.json();
            const fullNote = data?.data?.note ?? data?.note ?? note;
            setEditingNoteFull(fullNote);
            loadNoteEditorData();
            const cid = fullNote.clientId ?? fullNote.client?.id;
            if (cid) loadProjectsForNoteClient(cid);
        } catch (e) {
            console.warn('Failed to load full note:', e);
        }
    }, [project?.id, loadNoteEditorData, loadProjectsForNoteClient]);

    const closeNoteEditor = useCallback(() => {
        setEditingNoteFull(null);
        setEditingNoteSource(null);
        setSelectedProjectNote(null);
        setShowNoteShareModal(false);
    }, []);

    const handleToggleNoteActivity = useCallback((e, note) => {
        e.stopPropagation();
        e.preventDefault();
        if (expandedNoteActivityId === note.id) {
            setExpandedNoteActivityId(null);
            return;
        }
        setExpandedNoteActivityId(note.id);
        if (!noteActivityByNoteId[note.id]) {
            loadActivityForNote(note.id).then((logs) => {
                setNoteActivityByNoteId(prev => ({ ...prev, [note.id]: Array.isArray(logs) ? logs : [] }));
            });
        }
    }, [expandedNoteActivityId, noteActivityByNoteId, loadActivityForNote]);

    // Merged list: project notes first, then user public notes, sorted by updatedAt desc
    const mergedNotesList = React.useMemo(() => {
        const fromProject = (projectNotesFromProject || []).map(n => ({ ...n, source: 'project' }));
        const fromUser = projectNotes || [];
        return [...fromProject, ...fromUser].sort((a, b) => {
            const aAt = a.updatedAt || a.createdAt || 0;
            const bAt = b.updatedAt || b.createdAt || 0;
            return new Date(bAt) - new Date(aAt);
        });
    }, [projectNotesFromProject, projectNotes]);

    const createProjectNote = useCallback(async () => {
        if (!project?.id || !window.storage?.getToken) return;
        setIsSavingNote(true);
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/projects/${project.id}/notes`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Untitled Note', content: '', tags: [] })
            });
            if (response.ok) {
                const data = await response.json();
                const newNote = data?.data?.note ?? data?.note;
                if (newNote) {
                    setEditingNoteFull(newNote);
                    setEditingNoteSource('project');
                    setNoteEditorReady(!!window.NoteEditor);
                    loadProjectNotesFromProject();
                    loadNoteActivity();
                }
            } else {
                const err = await response.json().catch(() => ({}));
                alert(err?.error?.message || err?.message || 'Failed to create project note.');
            }
        } catch (e) {
            console.warn('Failed to create project note:', e);
            alert(e?.message || 'Failed to create project note.');
        } finally {
            setIsSavingNote(false);
        }
    }, [project?.id, loadProjectNotesFromProject, loadNoteActivity]);

    const handleSaveNoteInProject = useCallback(async (notePayload) => {
        if (!notePayload?.id || notePayload.id.startsWith('temp-') || !window.storage?.getToken?.()) return;
        setIsSavingNote(true);
        try {
            const token = window.storage.getToken();
            if (editingNoteSource === 'project') {
                const response = await fetch(`/api/projects/${project.id}/notes/${notePayload.id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: notePayload.title || 'Untitled Note',
                        content: notePayload.content || '',
                        tags: notePayload.tags || []
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    const updated = data?.data?.note ?? data?.note;
                    setEditingNoteFull(prev => prev?.id === notePayload.id ? (updated ?? prev) : prev);
                    loadProjectNotesFromProject();
                    loadNoteActivity();
                    loadActivityForNote(notePayload.id).then((logs) => setNoteActivityForEditor(Array.isArray(logs) ? logs : []));
                } else {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err?.error?.message || err?.message || 'Failed to save project note');
                }
            } else {
                const response = await fetch(`/api/user-notes/${notePayload.id}`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: notePayload.title || 'Untitled Note',
                        content: notePayload.content || '',
                        tags: notePayload.tags || [],
                        pinned: Boolean(notePayload.pinned),
                        isPublic: Boolean(notePayload.isPublic),
                        clientId: notePayload.clientId && String(notePayload.clientId).trim() ? notePayload.clientId : null,
                        projectId: notePayload.projectId && String(notePayload.projectId).trim() ? notePayload.projectId : null
                    })
                });
                if (response.ok) {
                    const data = await response.json();
                    const updated = data?.data?.note ?? data?.note;
                    setEditingNoteFull(prev => prev?.id === notePayload.id ? (updated ?? prev) : prev);
                    loadProjectNotes();
                    loadNoteActivity();
                    loadActivityForNote(notePayload.id).then((logs) => setNoteActivityForEditor(Array.isArray(logs) ? logs : []));
                } else {
                    const err = await response.json().catch(() => ({}));
                    throw new Error(err?.error?.message || err?.message || 'Failed to save note');
                }
            }
        } catch (e) {
            console.warn('Save note failed:', e);
            alert(e?.message || 'Failed to save note.');
        } finally {
            setIsSavingNote(false);
        }
    }, [project?.id, editingNoteSource, loadProjectNotesFromProject, loadProjectNotes, loadNoteActivity, loadActivityForNote]);

    const handleDeleteNoteInProject = useCallback(async (noteId) => {
        if (!confirm('Are you sure you want to delete this note?')) return;
        if (!noteId || !window.storage?.getToken?.()) return;
        try {
            const token = window.storage.getToken();
            if (editingNoteSource === 'project') {
                const response = await fetch(`/api/projects/${project.id}/notes/${noteId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                if (response.ok) {
                    closeNoteEditor();
                    loadProjectNotesFromProject();
                    loadNoteActivity();
                }
            } else {
                const response = await fetch(`/api/user-notes/${noteId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
                if (response.ok) {
                    closeNoteEditor();
                    loadProjectNotes();
                    loadNoteActivity();
                }
            }
        } catch (e) {
            console.warn('Delete note failed:', e);
        }
    }, [project?.id, editingNoteSource, closeNoteEditor, loadProjectNotesFromProject, loadProjectNotes, loadNoteActivity]);

    const handleShareNoteInProject = useCallback((note) => {
        setNoteShareSelectedUsers(note?.sharedWith?.map(s => s.userId || s.id) || []);
        setShowNoteShareModal(true);
    }, []);

    const handleSaveNoteShareInProject = useCallback(async () => {
        if (!editingNoteFull?.id || !window.storage?.getToken?.()) return;
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/user-notes/${editingNoteFull.id}/share`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ sharedWith: noteShareSelectedUsers })
            });
            if (response.ok) {
                const data = await response.json();
                const updated = data?.data?.note ?? data?.note;
                setEditingNoteFull(prev => prev?.id === editingNoteFull.id ? (updated ?? prev) : prev);
                setShowNoteShareModal(false);
                loadProjectNotes();
            }
        } catch (e) {
            console.warn('Share note failed:', e);
        }
    }, [editingNoteFull?.id, noteShareSelectedUsers]);

    const handleTogglePinNoteInProject = useCallback(async (notePayload) => {
        if (!notePayload?.id || notePayload.id.startsWith('temp-') || !window.storage?.getToken?.()) return;
        const newPinned = !Boolean(notePayload.pinned);
        try {
            const token = window.storage.getToken();
            const response = await fetch(`/api/user-notes/${notePayload.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: notePayload.title || 'Untitled Note',
                    content: notePayload.content || '',
                    tags: notePayload.tags || [],
                    pinned: newPinned,
                    isPublic: Boolean(notePayload.isPublic),
                    clientId: notePayload.clientId ?? null,
                    projectId: notePayload.projectId ?? null
                })
            });
            if (response.ok) {
                const data = await response.json();
                const updated = data?.data?.note ?? data?.note;
                setEditingNoteFull(prev => prev?.id === notePayload.id ? { ...(updated ?? prev), pinned: newPinned } : prev);
                loadProjectNotes();
            }
        } catch (e) {
            console.warn('Toggle pin failed:', e);
        }
    }, []);

    const handleExportNoteInProject = useCallback((note) => {
        const title = (note?.title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-');
        const content = `# ${note?.title || 'Untitled Note'}\n\n${(note?.content || '').replace(/\r/g, '')}\n\n---\nTags: ${(note?.tags || []).join(', ')}`;
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }, []);

    // CRITICAL: Update tasks IMMEDIATELY when project prop changes (synchronous, no delay)
    // This runs synchronously in useEffect to ensure tasks are available instantly
    const previousProjectIdRef = useRef(project?.id);
    const needPersistTimeFromUrlRef = useRef(false);
    const needPersistMonthlyFMSFromUrlRef = useRef(false);
    const hasMonthlyFMSReviewProcessChangedRef = useRef(false); // declared early so URL-sync effect can set it
    const setHasMonthlyFMSReviewProcessRef = useRef(() => {}); // set later so URL-sync/switchTab can invoke it
    const [pendingModuleFromUrl, setPendingModuleFromUrl] = useState(null); // 'monthlyFMSReview' when URL asked for Monthly FMS before monthly state existed
    useEffect(() => {
        if (project?.id !== previousProjectIdRef.current) {
            const newTasks = getTasksFromProject(project);
            const safeNewTasks = Array.isArray(newTasks) ? newTasks : [];
            const isSwitchingProject = previousProjectIdRef.current != null && previousProjectIdRef.current !== project?.id;
            previousProjectIdRef.current = project?.id;
            setTasks(prev => {
                const merged = mergeTaskComments(prev, safeNewTasks);
                if (isSwitchingProject) {
                    return merged.filter(t => t.projectId == null || Number(t.projectId) === Number(project?.id));
                }
                return merged;
            });
            tasksRef.current = mergeTaskComments(tasksRef.current || [], safeNewTasks);
            if (isSwitchingProject) {
                tasksRef.current = tasksRef.current.filter(t => t.projectId == null || Number(t.projectId) === Number(project?.id));
            }
            console.log('✅ ProjectDetail: Tasks updated from project prop (instant):', safeNewTasks.length);
        } else {
            const newTasks = getTasksFromProject(project);
            const safeNewTasks = Array.isArray(newTasks) ? newTasks : [];
            const currentTaskIds = (tasks || []).map(t => t?.id).filter(Boolean).sort().join(',');
            const newTaskIds = safeNewTasks.map(t => t?.id).filter(Boolean).sort().join(',');
            if (currentTaskIds !== newTaskIds || safeNewTasks.length !== (tasks || []).length) {
                setTasks(prev => mergeTaskComments(prev, safeNewTasks));
                tasksRef.current = mergeTaskComments(tasksRef.current || [], safeNewTasks);
            }
        }
    }, [project?.id, project?.tasksList, project?.tasks, mergeTaskComments]); // Only depend on project data, not tasks state
    const [taskFilters, setTaskFilters] = useState({
        search: '',
        status: 'all',
        assignee: 'all',
        priority: 'all',
        list: 'all',
        includeSubtasks: true,
        showArchived: false
    });
    // Task list table sort: default newest first (createdAt desc)
    const [taskListSortBy, setTaskListSortBy] = useState('createdAt');
    const [taskListSortDir, setTaskListSortDir] = useState('desc');
    
    // Load tasks from Task API (new approach) or fallback to JSON (backward compatibility)
    // silent: when true, do not log success (for background/interval refresh to avoid console spam)
    const loadTasksFromAPI = useCallback(async (projectId, silent = false) => {
        if (!projectId || !window.DatabaseAPI?.makeRequest) {
            if (!silent) console.warn('⚠️ ProjectDetail: Cannot load tasks from API - missing projectId or DatabaseAPI');
            return null;
        }

        try {
            // Include comments so COMMENTS column and actions show correct counts in list view
            const url = `/tasks?projectId=${encodeURIComponent(projectId)}&includeComments=true`;
            const response = await window.DatabaseAPI.makeRequest(url, { method: 'GET' });
            const data = response?.data ?? response;
            const taskArray = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data?.data?.tasks) ? data.data.tasks : Array.isArray(response?.tasks) ? response.tasks : null;

            if (taskArray && taskArray.length > 0) {
                if (!silent) {
                    console.log('✅ ProjectDetail: Loaded tasks from Task API:', {
                        projectId,
                        taskCount: taskArray.length
                    });
                }
                return taskArray;
            }
            if (taskArray && taskArray.length === 0) return [];

            if (!silent) console.warn('⚠️ ProjectDetail: Task API returned no tasks (or unexpected shape)');
            return null;
        } catch (error) {
            if (!silent) console.warn('⚠️ ProjectDetail: Failed to load tasks from API, will use JSON fallback:', error);
            return null;
        }
    }, []);

    // OPTIMIZED: Use tasks from project prop if available, otherwise load from API
    // Only run when project.id changes to avoid re-running on every parent re-render (project object reference churn).
    // Task list updates from project prop are handled by the separate effect that syncs project?.tasksList/tasks into state.
    useEffect(() => {
        if (!project?.id) return;
        const projectId = project.id;
        const projectTasks = getTasksFromProject(project);
        if (Array.isArray(projectTasks) && projectTasks.length > 0) {
            console.log('⚡ ProjectDetail: Using tasks from project prop (no API call needed):', projectTasks.length);
            setTasks(prev => mergeTaskComments(prev, projectTasks));
            tasksRef.current = mergeTaskComments(tasksRef.current || [], projectTasks);
            const refreshInterval = setInterval(() => {
                loadTasksFromAPI(projectId, true).then(apiTasks => {
                    if (apiTasks && Array.isArray(apiTasks)) {
                        setTasks(prev => mergeTaskComments(prev, apiTasks));
                        tasksRef.current = mergeTaskComments(tasksRef.current || [], apiTasks);
                    }
                }).catch(() => {});
            }, 60000);
            return () => clearInterval(refreshInterval);
        } else {
            const loadTasks = async (isBackgroundRefresh = false) => {
                const apiTasks = await loadTasksFromAPI(projectId, isBackgroundRefresh);
                if (apiTasks != null && Array.isArray(apiTasks)) {
                    setTasks(prev => mergeTaskComments(prev, apiTasks));
                    tasksRef.current = mergeTaskComments(tasksRef.current || [], apiTasks);
                    if (!isBackgroundRefresh) {
                        console.log('✅ ProjectDetail: Tasks loaded from API:', apiTasks.length);
                    }
                } else if (!isBackgroundRefresh) {
                    console.log('⚠️ ProjectDetail: API returned no tasks, keeping existing tasks from project prop');
                }
            };
            loadTasks(false);
            const refreshInterval = setInterval(() => loadTasks(true), 30000);
            return () => clearInterval(refreshInterval);
        }
        // Intentionally depend only on project.id; project tasks are synced by the effect that watches project?.tasksList/tasks
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);
    
    // CRITICAL: Initialize default taskLists when project loads with empty taskLists
    // This ensures default lists are shown even if project.taskLists is an empty array from the database
    const previousProjectIdForTaskListsRef = useRef(project?.id);
    useEffect(() => {
        // Only sync if project ID changed (switching to a different project)
        if (project?.id !== previousProjectIdForTaskListsRef.current) {
            previousProjectIdForTaskListsRef.current = project?.id;
            
            if (!project?.id) return;
            
            // Check if project.taskLists is empty or doesn't exist
            const hasTaskLists = project.taskLists && Array.isArray(project.taskLists) && project.taskLists.length > 0;
            
            if (!hasTaskLists) {
                // Set default lists when project.taskLists is empty (only "To Do")
                const defaultLists = [
                    { id: 1, name: 'To Do', color: 'blue', description: '' }
                ];
                console.log('✅ ProjectDetail: Initializing default taskLists for project:', project.id);
                setTaskLists(defaultLists);
            } else {
                // Project has taskLists, normalize so list.id matches task.listId for grouping
                setTaskLists(project.taskLists.map(normalizeTaskList));
            }
        } else {
            // Same project, but project.taskLists might have changed
            // Only update if project.taskLists exists and is different from current state
            const hasTaskLists = project.taskLists && Array.isArray(project.taskLists) && project.taskLists.length > 0;
            if (hasTaskLists) {
                // Check if current state differs from project.taskLists
                setTaskLists(prev => {
                    const normalized = project.taskLists.map(normalizeTaskList);
                    const prevIds = prev?.map(l => l.id).sort().join(',') || '';
                    const projectIds = normalized.map(l => l.id).sort().join(',');
                    if (prevIds !== projectIds) {
                        return normalized;
                    }
                    return prev;
                });
            }
        }
    }, [project?.id, project?.taskLists]); // Run when project ID or taskLists changes
    
    // CRITICAL: Ensure project ID is always in URL when ProjectDetail is rendered
    // BUT: Don't fix URL if we're navigating back to projects list
    useEffect(() => {
        if (!project?.id) return;
        
        const currentPathname = window.location.pathname;
        const expectedPath = `/projects/${project.id}`;
        
        // CRITICAL: If we're on /projects (no project ID), don't try to fix URL
        // This means user navigated back - don't interfere
        if (currentPathname === '/projects' || currentPathname === '/projects/') {
            return; // User is navigating away, don't restore project ID
        }
        
        // Check if pathname exactly matches expected path (not just contains project ID)
        // This prevents false positives when one project ID is a substring of another
        const pathMatches = currentPathname === expectedPath || currentPathname.startsWith(expectedPath + '/');
        
        // Only fix URL if pathname doesn't match expected path
        if (!pathMatches) {
            console.log('🔧 ProjectDetail: URL missing project ID, fixing...', {
                currentPathname,
                expectedPath
            });
            
            // Preserve any existing search params (like task=) and hash (e.g. docSectionId for document collection deep link)
            const currentSearch = window.location.search;
            const currentHash = window.location.hash || '';
            const url = new URL(window.location.href);
            url.pathname = expectedPath;
            // Keep existing search params
            if (currentSearch) {
                url.search = currentSearch;
            }
            // Preserve hash so document collection / comment deep links still work
            if (currentHash) {
                url.hash = currentHash;
            }
            
            try {
                window.history.replaceState({}, '', url);
                console.log('✅ ProjectDetail: URL fixed to include project ID:', url.href);
            } catch (e) {
                console.error('❌ Failed to fix URL:', e);
            }
        }
    }, [project?.id]); // Run whenever project ID changes
    
    // Listen for openTask event (for programmatic task opening) - MUST be after tasks state is declared
    useEffect(() => {
        if (!project?.id || !tasks || tasks.length === 0) return;
        
        const handleOpenTask = async (event) => {
            if (!event.detail || !event.detail.taskId) return;
            
            // CRITICAL: Don't open task if it was manually closed
            // This prevents the modal from reopening after the user explicitly closed it
            if (taskManuallyClosedRef.current) {
                console.log('⏸️ ProjectDetail: handleOpenTask - task was manually closed, ignoring openTask event');
                return;
            }
            
            const taskId = event.detail.taskId;
            const tab = event.detail.tab || 'details';
            const searchParams = new URLSearchParams(window.location.search || '');
            const hashParams = window.location.hash?.includes('?')
                ? new URLSearchParams(window.location.hash.split('?')[1])
                : null;
            const focusInput =
                event.detail.focusInput ||
                searchParams.get('focusInput') ||
                (hashParams && hashParams.get('focusInput')) ||
                null;
            const normalizedTab = ['details', 'comments', 'checklist'].includes(tab) ? tab : null;
            
            try {
                // Find the task in the tasks array (including subtasks)
                let foundTask = tasks.find(t => t.id === taskId || String(t.id) === String(taskId));
                let foundParent = null;
                
                // If not found in main tasks, check subtasks
                if (!foundTask) {
                    for (const task of tasks) {
                        if (task.subtasks && Array.isArray(task.subtasks)) {
                            const subtask = task.subtasks.find(st => st.id === taskId || String(st.id) === String(taskId));
                            if (subtask) {
                                foundTask = subtask;
                                foundParent = task;
                                break;
                            }
                        }
                    }
                }
                
                if (foundTask) {
                    // Double-check before opening (in case flag was set during async operations)
                    if (taskManuallyClosedRef.current) {
                        console.log('⏸️ ProjectDetail: handleOpenTask - task was manually closed (double-check), ignoring');
                        return;
                    }
                    
                    // Don't reopen the specific task that was just closed
                    if (closedTaskIdRef.current && (foundTask.id === closedTaskIdRef.current || String(foundTask.id) === String(closedTaskIdRef.current))) {
                        console.log('⏸️ ProjectDetail: handleOpenTask - this specific task was manually closed, ignoring:', closedTaskIdRef.current);
                        return;
                    }
                    
                    // OPTIMIZED: Check if modal is ready immediately, don't wait if it's already loaded
                    const modalReady = typeof window.TaskDetailModal === 'function';
                    if (modalReady) {
                        // Modal is ready, open immediately without waiting
                        // Final check before actually opening
                        if (taskManuallyClosedRef.current) {
                            console.log('⏸️ ProjectDetail: handleOpenTask - task was manually closed (final check), ignoring');
                            return;
                        }
                        
                        // Final check for closed task ID
                        if (closedTaskIdRef.current && (foundTask.id === closedTaskIdRef.current || String(foundTask.id) === String(closedTaskIdRef.current))) {
                            console.log('⏸️ ProjectDetail: handleOpenTask - this specific task was manually closed (final check), ignoring');
                            return;
                        }
                        
                        if (focusInput || normalizedTab) {
                            setTaskFocusInput({
                                taskId: foundTask.id,
                                focusInput: focusInput || null,
                                tab: normalizedTab
                            });
                        }
                        setViewingTask(foundTask);
                        setViewingTaskParent(foundParent);
                        setShowTaskDetailModal(true);
                    } else {
                        // Modal not ready, ensure it's loaded (but this should be rare)
                        await ensureTaskDetailModalLoaded();
                        
                        // Final check before actually opening
                        if (taskManuallyClosedRef.current) {
                            console.log('⏸️ ProjectDetail: handleOpenTask - task was manually closed (final check), ignoring');
                            return;
                        }
                        
                        // Final check for closed task ID
                        if (closedTaskIdRef.current && (foundTask.id === closedTaskIdRef.current || String(foundTask.id) === String(closedTaskIdRef.current))) {
                            console.log('⏸️ ProjectDetail: handleOpenTask - this specific task was manually closed (final check), ignoring');
                            return;
                        }
                        
                        if (focusInput || normalizedTab) {
                            setTaskFocusInput({
                                taskId: foundTask.id,
                                focusInput: focusInput || null,
                                tab: normalizedTab
                            });
                        }
                        setViewingTask(foundTask);
                        setViewingTaskParent(foundParent);
                        setShowTaskDetailModal(true);
                    }
                }
            } catch (error) {
                console.warn('⚠️ ProjectDetail: failed to open task from event:', error);
            }
        };
        
        window.addEventListener('openTask', handleOpenTask);
        return () => window.removeEventListener('openTask', handleOpenTask);
    }, [project?.id, tasks]); // Removed ensureTaskDetailModalLoaded from deps, using ref instead
    
    // Listen for task refresh events from TaskDetailModal
    // This allows the modal to request updated task data when comments/checklists are added by other users
    useEffect(() => {
        const handleRefreshTaskInModal = (event) => {
            const { taskId, updatedTask } = event.detail || {};
            if (!taskId || !updatedTask) {
                console.warn('⚠️ ProjectDetail: Invalid refresh event', { taskId, hasUpdatedTask: !!updatedTask });
                return;
            }

            // Check if this is for the currently viewing task
            const isCurrentTask = viewingTask && (viewingTask.id === taskId || String(viewingTask.id) === String(taskId));
            
            if (!isCurrentTask) {
                console.log('🔍 ProjectDetail: Refresh event for different task, ignoring', {
                    eventTaskId: taskId,
                    viewingTaskId: viewingTask?.id
                });
                return;
            }

            const currentCommentsCount = Array.isArray(viewingTask.comments) ? viewingTask.comments.length : 0;
            const updatedCommentsCount = Array.isArray(updatedTask.comments) ? updatedTask.comments.length : 0;

            console.log('🔄 ProjectDetail: Refreshing task in modal', {
                taskId,
                currentCommentsCount,
                updatedCommentsCount,
                currentComments: viewingTask.comments?.map(c => ({ id: c.id, author: c.author })) || [],
                updatedComments: updatedTask.comments?.map(c => ({ id: c.id, author: c.author })) || []
            });

            // Update the viewingTask with the latest data - ensure all fields are preserved
            setViewingTask(prev => {
                // Merge to preserve any local edits while updating with fresh data
                // CRITICAL: For comments, merge by ID to prevent losing comments that are being saved
                const prevComments = Array.isArray(prev?.comments) ? prev.comments : [];
                const updatedComments = Array.isArray(updatedTask.comments) ? updatedTask.comments : [];
                
                // If updated comments has fewer items than previous, it might be stale data
                // Merge by ID to preserve all comments
                let mergedComments = updatedComments;
                if (prevComments.length > 0) {
                    const commentsMap = new Map();
                    // Start with previous comments (preserve local state)
                    prevComments.forEach(comment => {
                        if (comment.id) {
                            commentsMap.set(comment.id, comment);
                        }
                    });
                    // Merge in updated comments (update existing or add new)
                    updatedComments.forEach(comment => {
                        if (comment.id) {
                            commentsMap.set(comment.id, comment);
                        }
                    });
                    mergedComments = Array.from(commentsMap.values());
                    
                    // If we're losing comments, log a warning
                    if (mergedComments.length < prevComments.length && updatedComments.length < prevComments.length) {
                        console.warn('⚠️ ProjectDetail: Potential comment loss during refresh, preserving all comments', {
                            taskId,
                            prevCount: prevComments.length,
                            updatedCount: updatedComments.length,
                            mergedCount: mergedComments.length
                        });
                    }
                }
                
                const merged = {
                    ...prev,
                    ...updatedTask,
                    // Use merged comments to preserve all comments
                    comments: mergedComments,
                    checklist: Array.isArray(updatedTask.checklist) ? updatedTask.checklist : (prev?.checklist || []),
                    attachments: Array.isArray(updatedTask.attachments) ? updatedTask.attachments : (prev?.attachments || []),
                    tags: Array.isArray(updatedTask.tags) ? updatedTask.tags : (prev?.tags || [])
                };
                return merged;
            });

            // Also update the task in the tasks array to keep everything in sync
            setTasks(prevTasks => {
                return prevTasks.map(t => {
                    if (t.id === taskId || String(t.id) === String(taskId)) {
                        // Merge to preserve structure
                        return {
                            ...t,
                            ...updatedTask,
                            comments: Array.isArray(updatedTask.comments) ? updatedTask.comments : (t.comments || []),
                            checklist: Array.isArray(updatedTask.checklist) ? updatedTask.checklist : (t.checklist || []),
                            attachments: Array.isArray(updatedTask.attachments) ? updatedTask.attachments : (t.attachments || []),
                            tags: Array.isArray(updatedTask.tags) ? updatedTask.tags : (t.tags || [])
                        };
                    }
                    // Check subtasks
                    if (t.subtasks && Array.isArray(t.subtasks)) {
                        const hasUpdatedSubtask = t.subtasks.some(st => 
                            st.id === taskId || String(st.id) === String(taskId)
                        );
                        if (hasUpdatedSubtask) {
                            return {
                                ...t,
                                subtasks: t.subtasks.map(st => {
                                    if (st.id === taskId || String(st.id) === String(taskId)) {
                                        return {
                                            ...st,
                                            ...updatedTask,
                                            comments: Array.isArray(updatedTask.comments) ? updatedTask.comments : (st.comments || []),
                                            checklist: Array.isArray(updatedTask.checklist) ? updatedTask.checklist : (st.checklist || []),
                                            attachments: Array.isArray(updatedTask.attachments) ? updatedTask.attachments : (st.attachments || []),
                                            tags: Array.isArray(updatedTask.tags) ? updatedTask.tags : (st.tags || [])
                                        };
                                    }
                                    return st;
                                })
                            };
                        }
                    }
                    return t;
                });
            });
        };

        window.addEventListener('refreshTaskInModal', handleRefreshTaskInModal);
        return () => {
            window.removeEventListener('refreshTaskInModal', handleRefreshTaskInModal);
        };
    }, [viewingTask?.id]);

    // Memoize the back callback to prevent DocumentCollectionProcessSection from re-rendering
    const handleBackToOverview = useCallback(() => {
        switchSection('overview');
    }, [switchSection]);
    
    // Sync activeSection from URL on mount (ensures Time tab etc. persist after hard refresh).
    // When URL has ?tab=time but project.hasTimeProcess is false, enable locally and flag for persist (done in effect after persistProjectData).
    useEffect(() => {
        if (!project?.id) return;
        const hash = window.location.hash || '';
        const search = window.location.search || '';
        let params = null;
        if (hash.includes('?')) {
            const parts = hash.split('?');
            if (parts.length > 1) params = new URLSearchParams(parts[1]);
        }
        if (!params && search) params = new URLSearchParams(search);
        const tabFromUrl = params?.get('tab');
        const validTabs = ['overview', 'tasks', 'time', 'documentCollection', 'monthlyFMSReview', 'weeklyFMSReview', 'monthlyDataReview', 'complianceReview', 'activity', 'notes'];
        if (tabFromUrl && validTabs.includes(tabFromUrl)) {
            if (tabFromUrl === 'time' && !normalizeHasTimeProcess(project.hasTimeProcess)) {
                hasTimeProcessChangedRef.current = true;
                setHasTimeProcess(true);
                needPersistTimeFromUrlRef.current = true;
            }
            const projectHasMonthly = project.hasMonthlyFMSReviewProcess === true || project.hasMonthlyFMSReviewProcess === 'true' || project.hasMonthlyFMSReviewProcess === 1 || (typeof project.hasMonthlyFMSReviewProcess === 'string' && String(project.hasMonthlyFMSReviewProcess).toLowerCase() === 'true');
            if (tabFromUrl === 'monthlyFMSReview' && !projectHasMonthly) {
                needPersistMonthlyFMSFromUrlRef.current = true;
                setPendingModuleFromUrl('monthlyFMSReview'); // triggers effect below to set monthly state + persist
            }
            setActiveSection(tabFromUrl);
        }
    }, [project?.id, project?.hasTimeProcess, project?.hasMonthlyFMSReviewProcess]);

    // Listen for switchProjectTab event to handle programmatic tab switching.
    // When tab is 'time' but project doesn't have hasTimeProcess, enable locally and flag for persist (done in effect after persistProjectData).
    useEffect(() => {
        const handleSwitchTab = (event) => {
            if (!event.detail) return;
            const { tab, section, commentId, focusInput } = event.detail;
            if (tab === 'time' && !normalizeHasTimeProcess(project?.hasTimeProcess)) {
                hasTimeProcessChangedRef.current = true;
                setHasTimeProcess(true);
                needPersistTimeFromUrlRef.current = true;
            }
            const projectHasMonthly = project?.hasMonthlyFMSReviewProcess === true || project?.hasMonthlyFMSReviewProcess === 'true' || project?.hasMonthlyFMSReviewProcess === 1 || (typeof project?.hasMonthlyFMSReviewProcess === 'string' && String(project?.hasMonthlyFMSReviewProcess).toLowerCase() === 'true');
            if (tab === 'monthlyFMSReview' && !projectHasMonthly) {
                hasMonthlyFMSReviewProcessChangedRef.current = true;
                if (typeof setHasMonthlyFMSReviewProcessRef.current === 'function') setHasMonthlyFMSReviewProcessRef.current(true);
                needPersistMonthlyFMSFromUrlRef.current = true;
            }
            if (tab) {
                switchSection(tab, { section, commentId, focusInput });
            }
        };
        
        window.addEventListener('switchProjectTab', handleSwitchTab);
        return () => window.removeEventListener('switchProjectTab', handleSwitchTab);
    }, [switchSection, project]);
    
    // Listen for switchProjectSection event
    useEffect(() => {
        const handleSwitchSection = (event) => {
            if (!event.detail) return;
            const { section, commentId, focusInput } = event.detail;
            if (section) {
                switchSection(activeSection, { section, commentId, focusInput });
            }
        };
        
        window.addEventListener('switchProjectSection', handleSwitchSection);
        return () => window.removeEventListener('switchProjectSection', handleSwitchSection);
    }, [activeSection, switchSection]);
    
    // Listen for scrollToComment event
    useEffect(() => {
        const handleScrollToComment = (event) => {
            if (!event.detail || !event.detail.commentId) return;
            const { commentId, taskId, focusInput: eventFocusInput } = event.detail;
            const searchParams = new URLSearchParams(window.location.search || '');
            const hashParams = window.location.hash?.includes('?')
                ? new URLSearchParams(window.location.hash.split('?')[1])
                : null;
            const focusInput = eventFocusInput ||
                searchParams.get('focusInput') ||
                (hashParams && hashParams.get('focusInput')) ||
                null;
            
            // Update URL with commentId (and taskId if provided)
            updateUrl({ 
                task: taskId || undefined,
                comment: commentId,
                focusInput: focusInput || undefined
            });
            
            // Try to scroll to the comment element
            setTimeout(() => {
                const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`);
                if (commentElement) {
                    commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Highlight the comment briefly
                    commentElement.classList.add('highlight-comment');
                    setTimeout(() => {
                        commentElement.classList.remove('highlight-comment');
                    }, 2000);
                }
            }, 100);
        };
        
        window.addEventListener('scrollToComment', handleScrollToComment);
        return () => window.removeEventListener('scrollToComment', handleScrollToComment);
    }, [activeSection, project?.id, updateUrl]);
    
    // Ensure we are on the overview tab when switching to a different project.
    // Use a ref to track the previous project ID to only reset when actually switching projects.
    // IMPORTANT: Use null initially so "first time we have a project" (e.g. from URL deep link)
    // does not get treated as "switching projects" and reset to overview — we preserve the
    // initial tab from getInitialActiveSection() (e.g. documentCollection when URL has doc params).
    const previousProjectIdForSectionRef = useRef(null);
    useEffect(() => {
        if (!project?.id) return;
        
        const prevId = previousProjectIdForSectionRef.current;
        const isFirstProject = prevId === null || prevId === undefined;
        
        if (isFirstProject) {
            // First time we have a project (e.g. opened from URL) — just track it, do not reset tab
            previousProjectIdForSectionRef.current = project?.id;
            return;
        }
        
        // Only reset to overview if we're actually switching from one project to another
        const projectIdChanged = prevId !== project?.id;
        if (projectIdChanged) {
            if (activeSection !== 'overview') {
                switchSection('overview');
            }
            previousProjectIdForSectionRef.current = project?.id;
        }
    }, [project?.id, activeSection, switchSection]);

    // Track if weekly FMS review process exists
    // Normalize the value from project prop (handle boolean, string, number, undefined)
    const normalizeHasWeeklyFMSReviewProcess = (value) => {
        if (value === true || value === 'true' || value === 1) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    };
    
    const [hasWeeklyFMSReviewProcess, setHasWeeklyFMSReviewProcess] = useState(() => {
        const normalized = normalizeHasWeeklyFMSReviewProcess(project.hasWeeklyFMSReviewProcess);
        console.log('🔵 ProjectDetail: Initial hasWeeklyFMSReviewProcess state', {
            projectId: project?.id,
            projectName: project?.name,
            propValue: project.hasWeeklyFMSReviewProcess,
            propType: typeof project.hasWeeklyFMSReviewProcess,
            normalized,
            projectKeys: Object.keys(project || {}).filter(k => k.includes('Weekly') || k.includes('FMS'))
        });
        return normalized;
    });
    
    // Sync hasWeeklyFMSReviewProcess when project prop changes (e.g., after reloading from database)
    // But only if it hasn't been explicitly changed by the user recently
    const hasWeeklyFMSReviewProcessChangedRef = useRef(false);
    
    useEffect(() => {
        const normalizedValue = normalizeHasWeeklyFMSReviewProcess(project.hasWeeklyFMSReviewProcess);
        // Don't overwrite when user explicitly changed it
        if (hasWeeklyFMSReviewProcessChangedRef.current) return;
        if (normalizedValue !== hasWeeklyFMSReviewProcess) {
            setHasWeeklyFMSReviewProcess(normalizedValue);
            hasWeeklyFMSReviewProcessChangedRef.current = false;
        }
    }, [project.hasWeeklyFMSReviewProcess, project.id, hasWeeklyFMSReviewProcess]);
    
    // Also sync on mount / project change
    useEffect(() => {
        const normalizedValue = normalizeHasWeeklyFMSReviewProcess(project.hasWeeklyFMSReviewProcess);
        if (normalizedValue !== hasWeeklyFMSReviewProcess) {
            setHasWeeklyFMSReviewProcess(normalizedValue);
        }
        hasWeeklyFMSReviewProcessChangedRef.current = false;
    }, [project.id]); // Re-sync whenever we switch to a different project

    // Track if monthly FMS review process exists
    // Normalize the value from project prop (handle boolean, string, number, undefined)
    const normalizeHasMonthlyFMSReviewProcess = (value) => {
        if (value === true || value === 'true' || value === 1) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    };
    
    const [hasMonthlyFMSReviewProcess, setHasMonthlyFMSReviewProcess] = useState(() => {
        const normalized = normalizeHasMonthlyFMSReviewProcess(project.hasMonthlyFMSReviewProcess);
        return normalized;
    });
    useEffect(() => {
        setHasMonthlyFMSReviewProcessRef.current = setHasMonthlyFMSReviewProcess;
        return () => { setHasMonthlyFMSReviewProcessRef.current = () => {}; };
    }, [setHasMonthlyFMSReviewProcess]);

    // When URL wanted ?tab=monthlyFMSReview before monthly state existed, apply it now and flag persist
    useEffect(() => {
        if (pendingModuleFromUrl !== 'monthlyFMSReview') return;
        setPendingModuleFromUrl(null);
        hasMonthlyFMSReviewProcessChangedRef.current = true;
        setHasMonthlyFMSReviewProcess(true);
        // needPersistMonthlyFMSFromUrlRef was already set by URL-sync; persist effect will run when hasMonthlyFMSReviewProcess changes
    }, [pendingModuleFromUrl]);

    // Sync hasMonthlyFMSReviewProcess when project prop changes (e.g., after reloading from database)
    // But only if it hasn't been explicitly changed by the user recently
    useEffect(() => {
        const normalizedValue = normalizeHasMonthlyFMSReviewProcess(project.hasMonthlyFMSReviewProcess);
        
        // If the user has explicitly toggled the Monthly FMS flag (e.g. via "Add a Process"),
        // avoid immediately overwriting that local state with the (stale) value from the database.
        // Once the database value catches up and matches the local state, clear the flag so that
        // future backend-driven changes can sync normally.
        if (hasMonthlyFMSReviewProcessChangedRef.current) {
            if (normalizedValue === hasMonthlyFMSReviewProcess) {
                // Backend has caught up with the local user action – allow future syncs
                hasMonthlyFMSReviewProcessChangedRef.current = false;
            }
            return;
        }
        
        // Normal sync path: keep local state aligned with project prop
        if (normalizedValue !== hasMonthlyFMSReviewProcess) {
            setHasMonthlyFMSReviewProcess(normalizedValue);
        }
    }, [project.hasMonthlyFMSReviewProcess, project.id, hasMonthlyFMSReviewProcess]);
    
    // Also sync on mount to ensure we have the latest value
    useEffect(() => {
        const normalizedValue = normalizeHasMonthlyFMSReviewProcess(project.hasMonthlyFMSReviewProcess);
        // Only set if different to avoid unnecessary updates
        if (normalizedValue !== hasMonthlyFMSReviewProcess) {
            setHasMonthlyFMSReviewProcess(normalizedValue);
        }
        // Reset the changed ref when project changes to allow sync from database
        hasMonthlyFMSReviewProcessChangedRef.current = false;
    }, [project.id]); // Re-sync whenever we switch to a different project

    // Track if Monthly Data Review module is enabled (add via + Module)
    const normalizeHasMonthlyDataReviewProcess = (value) => {
        if (value === true || value === 'true' || value === 1) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    };
    const [hasMonthlyDataReviewProcess, setHasMonthlyDataReviewProcess] = useState(() =>
        normalizeHasMonthlyDataReviewProcess(project.hasMonthlyDataReviewProcess)
    );
    const hasMonthlyDataReviewProcessChangedRef = useRef(false);
    useEffect(() => {
        const normalizedValue = normalizeHasMonthlyDataReviewProcess(project.hasMonthlyDataReviewProcess);
        if (normalizedValue !== hasMonthlyDataReviewProcess && !hasMonthlyDataReviewProcessChangedRef.current) {
            setHasMonthlyDataReviewProcess(normalizedValue);
        } else if (hasMonthlyDataReviewProcessChangedRef.current) {
            // keep local state until persist completes
        }
    }, [project.hasMonthlyDataReviewProcess, project.id, hasMonthlyDataReviewProcess]);
    useEffect(() => {
        const normalizedValue = normalizeHasMonthlyDataReviewProcess(project.hasMonthlyDataReviewProcess);
        setHasMonthlyDataReviewProcess(normalizedValue);
        hasMonthlyDataReviewProcessChangedRef.current = false;
    }, [project.id]);

    // Track if Compliance Review module is enabled (add via + Module)
    const normalizeHasComplianceReviewProcess = (value) => {
        if (value === true || value === 'true' || value === 1) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    };
    const [hasComplianceReviewProcess, setHasComplianceReviewProcess] = useState(() =>
        normalizeHasComplianceReviewProcess(project.hasComplianceReviewProcess)
    );
    const hasComplianceReviewProcessChangedRef = useRef(false);
    useEffect(() => {
        const normalizedValue = normalizeHasComplianceReviewProcess(project.hasComplianceReviewProcess);
        if (normalizedValue !== hasComplianceReviewProcess && !hasComplianceReviewProcessChangedRef.current) {
            setHasComplianceReviewProcess(normalizedValue);
        } else if (hasComplianceReviewProcessChangedRef.current) {
            // keep local state until persist completes
        }
    }, [project.hasComplianceReviewProcess, project.id, hasComplianceReviewProcess]);
    useEffect(() => {
        const normalizedValue = normalizeHasComplianceReviewProcess(project.hasComplianceReviewProcess);
        setHasComplianceReviewProcess(normalizedValue);
        hasComplianceReviewProcessChangedRef.current = false;
    }, [project.id]);

    // Track if Time module is enabled (new projects: false; add via + Module)
    const normalizeHasTimeProcess = (value) => {
        if (value === true || value === 'true' || value === 1) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    };
    const [hasTimeProcess, setHasTimeProcess] = useState(() => normalizeHasTimeProcess(project.hasTimeProcess));
    const hasTimeProcessChangedRef = useRef(false);
    useEffect(() => {
        const v = normalizeHasTimeProcess(project.hasTimeProcess);
        if (v !== hasTimeProcess && !hasTimeProcessChangedRef.current) setHasTimeProcess(v);
    }, [project.hasTimeProcess, project.id, hasTimeProcess]);
    useEffect(() => {
        const v = normalizeHasTimeProcess(project.hasTimeProcess);
        if (v !== hasTimeProcess) setHasTimeProcess(v);
        hasTimeProcessChangedRef.current = false;
    }, [project.id]);

    // Track if document collection process exists
    // Normalize the value from project prop (handle boolean, string, number, undefined)
    const normalizeHasDocumentCollectionProcess = (value) => {
        if (value === true || value === 'true' || value === 1) return true;
        if (typeof value === 'string' && value.toLowerCase() === 'true') return true;
        return false;
    };
    
    const [hasDocumentCollectionProcess, setHasDocumentCollectionProcess] = useState(() => 
        normalizeHasDocumentCollectionProcess(project.hasDocumentCollectionProcess)
    );
    const [forceDocumentCollectionDeepLink, setForceDocumentCollectionDeepLink] = useState(false);
    // Track if hasDocumentCollectionProcess was explicitly changed by user
    const hasDocumentCollectionProcessChangedRef = useRef(false);
    
    // Sync hasDocumentCollectionProcess when project prop changes (e.g., after reloading from database)
    // But only if it hasn't been explicitly changed by the user recently
    useEffect(() => {
        const normalizedValue = normalizeHasDocumentCollectionProcess(project.hasDocumentCollectionProcess);
        
        // Only sync if:
        // 1. The value actually changed, AND
        // 2. It wasn't explicitly changed by the user (to prevent overwriting user changes)
        if (normalizedValue !== hasDocumentCollectionProcess && !hasDocumentCollectionProcessChangedRef.current) {
            setHasDocumentCollectionProcess(normalizedValue);
        } else if (hasDocumentCollectionProcessChangedRef.current) {
        }
    }, [project.hasDocumentCollectionProcess, project.id, hasDocumentCollectionProcess]);
    
    // Also sync on mount to ensure we have the latest value
    useEffect(() => {
        const normalizedValue = normalizeHasDocumentCollectionProcess(project.hasDocumentCollectionProcess);
        setHasDocumentCollectionProcess(normalizedValue);
    }, [project.id]); // Re-sync whenever we switch to a different project
    
    // Do NOT preload MonthlyDocumentCollectionTracker on project open - load only when user opens
    // Document Collection or Monthly Data Review tab (fixes slow project tab loading).

    // If the project is opened via a deep-link to the document collection tracker
    // (for example from an email notification), ensure the Document Collection tab
    // is active so the MonthlyDocumentCollectionTracker can show the target comment.
    useEffect(() => {
        if (!project?.id) return;
        
        const checkAndSwitchToDocumentCollection = () => {
            try {
                // Check both window.location.search (for regular URLs) and hash query params (for hash-based routing)
                let params = null;
                let deepSectionId = null;
                let deepDocumentId = null;
                let deepMonth = null;
                let deepCommentId = null;
                let deepDocWeek = null;
                let tabFromUrl = null;
                
                // First check hash query params (for hash-based routing like #/projects/123?docSectionId=...)
                const hash = window.location.hash || '';
                if (hash.includes('?')) {
                    const hashParts = hash.split('?');
                    if (hashParts.length > 1) {
                        params = new URLSearchParams(hashParts[1]);
                        deepSectionId = params.get('docSectionId');
                        deepDocumentId = params.get('docDocumentId');
                        deepMonth = params.get('docMonth');
                        deepCommentId = params.get('commentId');
                        deepDocWeek = params.get('docWeek');
                        tabFromUrl = params.get('tab');
                    }
                }
                
                // Also check window.location.search (for regular URLs like ?commentId=...)
                // Always check search params, especially for commentId which might be the only param
                const search = window.location.search || '';
                if (search) {
                    const searchParams = new URLSearchParams(search);
                    if (!deepSectionId) deepSectionId = searchParams.get('docSectionId');
                    if (!deepDocumentId) deepDocumentId = searchParams.get('docDocumentId');
                    if (!deepMonth) deepMonth = searchParams.get('docMonth');
                    if (!deepCommentId) deepCommentId = searchParams.get('commentId');
                    if (!deepDocWeek) deepDocWeek = searchParams.get('docWeek');
                    if (!tabFromUrl) tabFromUrl = searchParams.get('tab');
                }
                // Hash params take precedence for SPA links (e.g. #/projects/...?docWeek=...)
                if (hash.includes('?')) {
                    const hashParams = new URLSearchParams(hash.split('?')[1]);
                    if (!deepDocWeek) deepDocWeek = hashParams.get('docWeek');
                    if (!tabFromUrl) tabFromUrl = hashParams.get('tab');
                }
                
                // Do NOT switch to Document Collection when this is a Weekly or Monthly FMS link (prevents tab flipping)
                if (deepDocWeek || tabFromUrl === 'monthlyFMSReview') {
                    return;
                }
                
                // Normalize docDocumentId - treat "undefined" string, null, or empty as invalid
                const isValidDocumentId = deepDocumentId && 
                                         deepDocumentId !== 'undefined' && 
                                         deepDocumentId.trim() !== '';
                
                const hasDocCollectionDeepLink = !!(deepSectionId && isValidDocumentId && deepMonth) || !!deepCommentId;
                if (hasDocCollectionDeepLink) {
                    setForceDocumentCollectionDeepLink(true);
                } else if (forceDocumentCollectionDeepLink) {
                    setForceDocumentCollectionDeepLink(false);
                }

                // If we have full params with valid document ID, switch to document collection tab
                if (deepSectionId && isValidDocumentId && deepMonth) {
                    if (activeSection !== 'documentCollection') {
                        switchSection('documentCollection');
                    }
                } 
                // Fallback: If we have commentId but missing valid docDocumentId (or section/doc/month), 
                // still switch to document collection tab and let MonthlyDocumentCollectionTracker search for it
                else if (deepCommentId && (!isValidDocumentId || !deepSectionId || !deepMonth)) {
                    console.log('📧 ProjectDetail: Found commentId-only deep link:', deepCommentId, {
                        activeSection,
                        hasDocCollection: project?.hasDocumentCollectionProcess
                    });
                    
                    // Check if project has document collection process
                    const projectHasDocCollection = project?.hasDocumentCollectionProcess === true || 
                                                   project?.hasDocumentCollectionProcess === 'true' ||
                                                   project?.hasDocumentCollectionProcess === 1 ||
                                                   (typeof project?.hasDocumentCollectionProcess === 'string' && 
                                                    project?.hasDocumentCollectionProcess?.toLowerCase() === 'true');
                    const canShowDocCollection = projectHasDocCollection || hasDocCollectionDeepLink;
                    
                    console.log('📧 ProjectDetail: projectHasDocCollection:', projectHasDocCollection);
                    
                    if (canShowDocCollection && activeSection !== 'documentCollection') {
                        // Switch to document collection tab - the tracker will search for the comment
                        console.log('📧 ProjectDetail: Switching to document collection tab to search for comment:', deepCommentId);
                        switchSection('documentCollection');
                    } else if (canShowDocCollection && activeSection === 'documentCollection') {
                        console.log('📧 ProjectDetail: Already on document collection tab, comment search should run in tracker');
                    } else {
                        console.log('⚠️ ProjectDetail: Cannot switch - projectHasDocCollection:', projectHasDocCollection, 'activeSection:', activeSection);
                    }
                }
            } catch (error) {
                console.warn('⚠️ ProjectDetail: failed to apply document collection deep-link:', error);
            }
        };
        
        // Check for weekly FMS review deep-link parameters
        const checkAndSwitchToWeeklyFMSReview = () => {
            // Check the prop directly to avoid TDZ issues (state may not be initialized yet)
            const projectHasWeeklyFMS = project?.hasWeeklyFMSReviewProcess === true || 
                                      project?.hasWeeklyFMSReviewProcess === 'true' ||
                                      project?.hasWeeklyFMSReviewProcess === 1 ||
                                      (typeof project?.hasWeeklyFMSReviewProcess === 'string' && project?.hasWeeklyFMSReviewProcess?.toLowerCase() === 'true');
            if (!project?.id || !projectHasWeeklyFMS) return;
            
            try {
                let params = null;
                let weeklySectionId = null;
                let weeklyDocumentId = null;
                let weeklyMonth = null;
                let weeklyWeek = null;
                let commentId = null;
                
                // First check hash query params (for hash-based routing like #/projects/123?weeklySectionId=...)
                const hash = window.location.hash || '';
                if (hash.includes('?')) {
                    const hashParts = hash.split('?');
                    if (hashParts.length > 1) {
                        params = new URLSearchParams(hashParts[1]);
                        weeklySectionId = params.get('weeklySectionId') || params.get('docSectionId');
                        weeklyDocumentId = params.get('weeklyDocumentId') || params.get('docDocumentId');
                        weeklyMonth = params.get('weeklyMonth');
                        weeklyWeek = params.get('weeklyWeek') || params.get('docWeek');
                        commentId = params.get('commentId');
                    }
                }
                
                // If not found in hash, check window.location.search (for regular URLs)
                if (!weeklySectionId || !weeklyDocumentId) {
                    const search = window.location.search || '';
                    if (search) {
                        params = new URLSearchParams(search);
                        if (!weeklySectionId) weeklySectionId = params.get('weeklySectionId') || params.get('docSectionId');
                        if (!weeklyDocumentId) weeklyDocumentId = params.get('weeklyDocumentId') || params.get('docDocumentId');
                        if (!weeklyMonth) weeklyMonth = params.get('weeklyMonth');
                        if (!weeklyWeek) weeklyWeek = params.get('weeklyWeek') || params.get('docWeek');
                        if (!commentId) commentId = params.get('commentId');
                    }
                }
                
                // Only switch to weekly when URL has docWeek/weeklyWeek (weekly link). Document collection
                // links use docSectionId+docDocumentId+docMonth, so we must not switch on section+doc alone.
                if (weeklySectionId && weeklyDocumentId && weeklyWeek) {
                    if (activeSection !== 'weeklyFMSReview') {
                        switchSection('weeklyFMSReview');
                    }
                }
            } catch (error) {
                console.warn('⚠️ ProjectDetail: failed to apply weekly FMS review deep-link:', error);
            }
        };

        // Switch to Monthly FMS tab when URL has tab=monthlyFMSReview (email/notification deep links)
        const checkAndSwitchToMonthlyFMSReview = () => {
            const projectHasMonthlyFMS = project?.hasMonthlyFMSReviewProcess === true ||
                                       project?.hasMonthlyFMSReviewProcess === 'true' ||
                                       project?.hasMonthlyFMSReviewProcess === 1 ||
                                       (typeof project?.hasMonthlyFMSReviewProcess === 'string' && project?.hasMonthlyFMSReviewProcess?.toLowerCase() === 'true');
            if (!project?.id || !projectHasMonthlyFMS) return;

            try {
                let params = null;
                const hash = window.location.hash || '';
                if (hash.includes('?')) {
                    const hashParts = hash.split('?');
                    if (hashParts.length > 1) params = new URLSearchParams(hashParts[1]);
                }
                if (!params) {
                    const search = window.location.search || '';
                    if (search) params = new URLSearchParams(search);
                }
                const tabFromUrl = params?.get('tab');
                const hasMonthlyFMSDeepLink = tabFromUrl === 'monthlyFMSReview';
                if (hasMonthlyFMSDeepLink && activeSection !== 'monthlyFMSReview') {
                    switchSection('monthlyFMSReview');
                }
            } catch (error) {
                console.warn('⚠️ ProjectDetail: failed to apply monthly FMS review deep-link:', error);
            }
        };

        // Check immediately and again after a short delay so we catch the hash if it's set
        // after mount (e.g. by router or when opening project from URL)
        checkAndSwitchToDocumentCollection();
        checkAndSwitchToWeeklyFMSReview();
        checkAndSwitchToMonthlyFMSReview();
        const delayedCheck = setTimeout(() => {
            checkAndSwitchToDocumentCollection();
            checkAndSwitchToWeeklyFMSReview();
            checkAndSwitchToMonthlyFMSReview();
        }, 50);

        // Also listen for hash changes
        const handleHashChange = () => {
            setTimeout(() => {
                checkAndSwitchToDocumentCollection();
                checkAndSwitchToWeeklyFMSReview();
                checkAndSwitchToMonthlyFMSReview();
            }, 100);
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => {
            clearTimeout(delayedCheck);
            window.removeEventListener('hashchange', handleHashChange);
        };
    }, [project?.id, switchSection, activeSection, project?.hasWeeklyFMSReviewProcess, project?.hasMonthlyFMSReviewProcess, forceDocumentCollectionDeepLink]);
    
    // If the project is opened via a deep-link to a specific task
    // (for example from an email notification), open the task modal
    // Note: This useEffect is defined before ensureTaskDetailModalLoaded to avoid TDZ issues
    // We'll handle the modal loading inside the effect
    useEffect(() => {
        if (!project?.id || !tasks || tasks.length === 0) return;
        
        // CRITICAL: Don't run deep-link handler if task was manually closed
        // Also check if URL actually has a task parameter - if not, don't run
        // This prevents the effect from reopening the modal after closing
        if (taskManuallyClosedRef.current) {
            console.log('⏸️ ProjectDetail: useEffect - task was manually closed, skipping deep-link handler');
            return;
        }
        
        // Double-check: If URL doesn't have task parameter, don't run deep-link handler
        // This prevents unnecessary processing when effect re-runs due to dependency changes
        const currentSearch = window.location.search || '';
        const currentHash = window.location.hash || '';
        const currentParams = new URLSearchParams(currentSearch);
        const hashParams = currentHash.includes('?') ? new URLSearchParams(currentHash.split('?')[1]) : null;
        const urlHasTask = currentParams.get('task') || (hashParams && hashParams.get('task'));
        
        if (!urlHasTask) {
            // No task in URL, so no need to run deep-link handler
            // This is normal when modal is closed or when just viewing project
            return;
        }
        
        const handleDeepLink = async () => {
            try {
                // CRITICAL: Check if task was manually closed first
                if (taskManuallyClosedRef.current) {
                    console.log('⏸️ ProjectDetail: handleDeepLink - task was manually closed, skipping');
                    return;
                }
                
                // Check both window.location.search (for regular URLs) and hash query params (for hash-based routing)
                let taskId = null;
                let params = null;
                
                // First check hash query params (for hash-based routing like #/projects/123?task=456)
                const hash = window.location.hash || '';
                if (hash.includes('?')) {
                    const hashParts = hash.split('?');
                    if (hashParts.length > 1) {
                        params = new URLSearchParams(hashParts[1]);
                        taskId = params.get('task');
                    }
                }
                
                // If not found in hash, check window.location.search (for regular URLs)
                if (!taskId) {
                    const search = window.location.search || '';
                    if (search) {
                        params = new URLSearchParams(search);
                        taskId = params.get('task');
                    }
                }
                
                // Double-check: If we found a taskId but the URL was just updated to remove it, don't open
                // This handles race conditions where the handler runs before URL update completes
                if (taskId && taskManuallyClosedRef.current) {
                    console.log('⏸️ ProjectDetail: handleDeepLink - task was manually closed (double-check), skipping');
                    return;
                }
                
                // Also check for commentId/focusInput/tab in URL
                let commentId = null;
                let focusInput = null;
                let taskTab = null;
                if (params) {
                    commentId = params.get('commentId');
                    focusInput = params.get('focusInput');
                    const tabParam = params.get('tab');
                    if (tabParam && ['details', 'comments', 'checklist'].includes(tabParam)) {
                        taskTab = tabParam;
                    }
                } else {
                    const search = window.location.search || '';
                    if (search) {
                        const searchParams = new URLSearchParams(search);
                        commentId = searchParams.get('commentId');
                        focusInput = searchParams.get('focusInput');
                        const tabParam = searchParams.get('tab');
                        if (tabParam && ['details', 'comments', 'checklist'].includes(tabParam)) {
                            taskTab = tabParam;
                        }
                    }
                }
                
                if (taskId) {
                    // Don't reopen task if it was manually closed
                    if (taskManuallyClosedRef.current) {
                        console.log('⏸️ ProjectDetail: Skipping task deep-link - task was manually closed');
                        return;
                    }
                    
                    // Re-check URL one more time - if it doesn't have task param now, it was just removed
                    // This handles race conditions where URL was updated between when we read it and now
                    const finalCheckSearch = window.location.search || '';
                    const finalCheckHash = window.location.hash || '';
                    const finalCheckParams = new URLSearchParams(finalCheckSearch);
                    const finalCheckHashParams = finalCheckHash.includes('?') ? new URLSearchParams(finalCheckHash.split('?')[1]) : null;
                    const finalUrlHasTask = finalCheckParams.get('task') || (finalCheckHashParams && finalCheckHashParams.get('task'));
                    
                    // If URL doesn't have task parameter now, it was just closed - don't reopen
                    if (!finalUrlHasTask) {
                        console.log('⏸️ ProjectDetail: Skipping task open - URL no longer has task parameter (was closed)');
                        return;
                    }
                    
                    // Find the task in the tasks array (including subtasks)
                    let foundTask = tasks.find(t => t.id === taskId || String(t.id) === String(taskId));
                    let foundParent = null;
                    
                    // If not found in main tasks, check subtasks
                    if (!foundTask) {
                        for (const task of tasks) {
                            if (task.subtasks && Array.isArray(task.subtasks)) {
                                const subtask = task.subtasks.find(st => st.id === taskId || String(st.id) === String(taskId));
                                if (subtask) {
                                    foundTask = subtask;
                                    foundParent = task;
                                    break;
                                }
                            }
                        }
                    }
                    
                    if (foundTask) {
                        // Don't reopen if task was manually closed
                        if (taskManuallyClosedRef.current) {
                            console.log('⏸️ ProjectDetail: Skipping task open - task was manually closed');
                            return;
                        }
                        
                        // Don't reopen the specific task that was just closed
                        if (closedTaskIdRef.current && (foundTask.id === closedTaskIdRef.current || String(foundTask.id) === String(closedTaskIdRef.current))) {
                            console.log('⏸️ ProjectDetail: Skipping task open - this specific task was manually closed:', closedTaskIdRef.current);
                            return;
                        }
                        
                        // Also check if modal is already closed (double-check)
                        // If showTaskDetailModal is false and we're trying to open, respect the closed state
                        // This prevents reopening immediately after closing
                        
                        // OPTIMIZED: Open task immediately if modal is ready, otherwise poll quickly
                        if (typeof window.TaskDetailModal === 'function') {
                            if (focusInput || taskTab) {
                                setTaskFocusInput({
                                    taskId: foundTask.id,
                                    focusInput: focusInput || null,
                                    tab: taskTab || null
                                });
                            }
                            setViewingTask(foundTask);
                            setViewingTaskParent(foundParent);
                            setShowTaskDetailModal(true);
                            
                            // If commentId is also in URL, open comments for this task
                            if (commentId) {
                                // Reduced delay for comments (was 500ms, now 200ms)
                                setTimeout(() => {
                                    // Dispatch event to scroll to comment (which will also open comments popup)
                                    window.dispatchEvent(new CustomEvent('scrollToComment', {
                                        detail: { commentId, taskId: foundTask.id }
                                    }));
                                }, 200);
                            }
                        } else {
                            // If modal not loaded yet, poll quickly instead of fixed delay
                            let pollCount = 0;
                            const maxPolls = 20; // 1 second max (20 * 50ms)
                            const pollInterval = setInterval(() => {
                                pollCount++;
                                
                                // Check again if task was manually closed before opening
                                if (taskManuallyClosedRef.current) {
                                    clearInterval(pollInterval);
                                    console.log('⏸️ ProjectDetail: Skipping delayed task open - task was manually closed');
                                    return;
                                }
                                
                                if (typeof window.TaskDetailModal === 'function') {
                                    clearInterval(pollInterval);
                                    
                                    // Final check before opening
                                    if (taskManuallyClosedRef.current) {
                                        console.log('⏸️ ProjectDetail: Skipping task open - task was manually closed (final check)');
                                        return;
                                    }
                                    
                                    if (focusInput || taskTab) {
                                        setTaskFocusInput({
                                            taskId: foundTask.id,
                                            focusInput: focusInput || null,
                                            tab: taskTab || null
                                        });
                                    }
                                    setViewingTask(foundTask);
                                    setViewingTaskParent(foundParent);
                                    setShowTaskDetailModal(true);
                                    
                                    // If commentId is also in URL, open comments for this task
                                    if (commentId) {
                                        setTimeout(() => {
                                            window.dispatchEvent(new CustomEvent('scrollToComment', {
                                                detail: { commentId, taskId: foundTask.id }
                                            }));
                                        }, 200);
                                    }
                                } else if (pollCount >= maxPolls) {
                                    clearInterval(pollInterval);
                                    console.warn('⚠️ ProjectDetail: TaskDetailModal not available after polling');
                                }
                            }, 50); // Check every 50ms for fast response (was 500ms fixed delay)
                        }
                        
                        // Keep task and comment parameters in URL - don't remove them
                        // This allows URLs to be shareable and bookmarkable
                    }
                } else if (commentId && !taskId) {
                    // If only commentId is in URL (no task), find the task that contains this comment
                    for (const task of tasks) {
                        const taskComments = task.comments || [];
                        const hasComment = taskComments.some(c => 
                            String(c.id) === String(commentId) || 
                            String(c.commentId) === String(commentId)
                        );
                        
                        if (hasComment) {
                            // Open task and scroll to comment
                            setTimeout(() => {
                                // Check if task was manually closed before opening
                                if (taskManuallyClosedRef.current) {
                                    console.log('⏸️ ProjectDetail: Skipping comment task open - task was manually closed');
                                    return;
                                }
                                
                                if (typeof window.TaskDetailModal === 'function') {
                                    // Final check before opening
                                    if (taskManuallyClosedRef.current) {
                                        console.log('⏸️ ProjectDetail: Skipping comment task open - task was manually closed (final check)');
                                        return;
                                    }
                                    
                                    if (focusInput || taskTab) {
                                        setTaskFocusInput({
                                            taskId: task.id,
                                            focusInput: focusInput || null,
                                            tab: taskTab || null
                                        });
                                    }
                                    setViewingTask(task);
                                    setViewingTaskParent(null);
                                    setShowTaskDetailModal(true);
                                    
                                    setTimeout(() => {
                                        window.dispatchEvent(new CustomEvent('scrollToComment', {
                                            detail: { commentId, taskId: task.id }
                                        }));
                                    }, 500);
                                }
                            }, 500);
                            break;
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ ProjectDetail: failed to apply task deep-link:', error);
            }
        };
        
        handleDeepLink();
        
        // Also listen for hash changes to handle navigation from other pages
        const handleHashChange = () => {
            // Don't reopen task if it was manually closed
            if (taskManuallyClosedRef.current) {
                console.log('⏸️ ProjectDetail: Skipping hashchange task deep-link - task was manually closed');
                return;
            }
            
            // Check if URL still has task parameter - if not, don't try to open task
            const currentSearch = window.location.search || '';
            const currentHash = window.location.hash || '';
            const currentParams = new URLSearchParams(currentSearch);
            const hashParams = currentHash.includes('?') ? new URLSearchParams(currentHash.split('?')[1]) : null;
            const urlHasTask = currentParams.get('task') || (hashParams && hashParams.get('task'));
            
            if (!urlHasTask && taskManuallyClosedRef.current) {
                console.log('⏸️ ProjectDetail: Skipping hashchange - URL no longer has task parameter');
                return;
            }
            
            // Small delay to ensure route has updated
            setTimeout(() => {
                handleDeepLink();
            }, 100);
        };
        
        window.addEventListener('hashchange', handleHashChange);
        
        return () => {
            window.removeEventListener('hashchange', handleHashChange);
        };
    }, [project?.id, tasks]);
    
    // Ref to prevent duplicate saves when manually adding document collection process
    const skipNextSaveRef = useRef(false);
    const saveTimeoutRef = useRef(null);
    
    // Ref to prevent duplicate task deletions (tracks task ID currently being deleted)
    const deletingTaskIdRef = useRef(null);
    
    // Document process dropdown
    const [showDocumentProcessDropdown, setShowDocumentProcessDropdown] = useState(false);
    
    const [showListModal, setShowListModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
    const [taskFocusInput, setTaskFocusInput] = useState(null); // { taskId, focusInput, tab }
    const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [editingList, setEditingList] = useState(null);
    const [creatingTaskForList, setCreatingTaskForList] = useState(null);
    const [creatingTaskWithStatus, setCreatingTaskWithStatus] = useState(null);
    // Load view mode from localStorage, defaulting to 'list' if not set
    const [viewMode, setViewMode] = useState(() => {
        try {
            const saved = localStorage.getItem('projectTaskViewMode');
            return saved === 'kanban' || saved === 'list' ? saved : 'list';
        } catch (e) {
            return 'list';
        }
    });
    // Kanban: which list(s) to show as columns. 'all' = all lists; otherwise single list id
    const [kanbanListFilter, setKanbanListFilter] = useState('all');
    const [editingDocument, setEditingDocument] = useState(null);

    // Reset Kanban list filter if the selected list was deleted
    useEffect(() => {
        if (kanbanListFilter === 'all' || !taskLists || !Array.isArray(taskLists)) return;
        const exists = taskLists.some(l => String(l.id) === String(kanbanListFilter));
        if (!exists) setKanbanListFilter('all');
    }, [kanbanListFilter, taskLists]);

    // When task modal opens, ensure activity log is loaded so History tab has data
    useEffect(() => {
        if (showTaskDetailModal && project?.id && !activityLogEntries && (!project.activityLog || project.activityLog.length === 0)) {
            loadActivityLog();
        }
    }, [showTaskDetailModal, project?.id, project?.activityLog, activityLogEntries, loadActivityLog]);

    // Track if task was manually closed to prevent deep-link from reopening it
    const taskManuallyClosedRef = useRef(false);
    // Track if close is in progress to prevent double-closing
    const isClosingRef = useRef(false);
    // Track which task ID was manually closed to prevent reopening that specific task
    const closedTaskIdRef = useRef(null);
    
    // Comments popup state
    const [commentsPopup, setCommentsPopup] = useState(null); // {taskId, task, isSubtask, parentId, position}
    
    // Listen for ListModal being registered after initial render
    useEffect(() => {
        if (listModalComponent) {
            return;
        }

        if (typeof window.ListModal === 'function') {
            setListModalComponent(() => window.ListModal);
            return;
        }

        const handleComponentLoaded = (event) => {
            if (event?.detail?.component === 'ListModal' && typeof window.ListModal === 'function') {
                setListModalComponent(() => window.ListModal);
            }
        };

        let attempts = 0;
        const maxAttempts = 50;
        const intervalId = setInterval(() => {
            attempts++;
            if (typeof window.ListModal === 'function') {
                setListModalComponent(() => window.ListModal);
                clearInterval(intervalId);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 100);

        window.addEventListener('componentLoaded', handleComponentLoaded);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [listModalComponent]);

    // Persist view mode preference to localStorage
    useEffect(() => {
        try {
            localStorage.setItem('projectTaskViewMode', viewMode);
        } catch (error) {
            console.warn('⚠️ ProjectDetail: Failed to save view mode preference:', error);
        }
    }, [viewMode]);

    // Listen for ProjectModal being registered after initial render
    useEffect(() => {
        if (projectModalComponent) {
            return;
        }

        if (typeof window.ProjectModal === 'function') {
            setProjectModalComponent(() => window.ProjectModal);
            return;
        }

        const handleComponentLoaded = (event) => {
            if (event?.detail?.component === 'ProjectModal' && typeof window.ProjectModal === 'function') {
                setProjectModalComponent(() => window.ProjectModal);
            }
        };

        let attempts = 0;
        const maxAttempts = 50;
        const intervalId = setInterval(() => {
            attempts++;
            if (typeof window.ProjectModal === 'function') {
                setProjectModalComponent(() => window.ProjectModal);
                clearInterval(intervalId);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 100);

        window.addEventListener('componentLoaded', handleComponentLoaded);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [projectModalComponent]);

    useEffect(() => {
        if (taskDetailModalComponent) {
            return;
        }

        if (typeof window.TaskDetailModal === 'function') {
            setTaskDetailModalComponent(() => window.TaskDetailModal);
            return;
        }

        const handleComponentLoaded = (event) => {
            if (event?.detail?.component === 'TaskDetailModal' && typeof window.TaskDetailModal === 'function') {
                setTaskDetailModalComponent(() => window.TaskDetailModal);
            }
        };

        let attempts = 0;
        const maxAttempts = 50;
        const intervalId = setInterval(() => {
            attempts++;
            if (typeof window.TaskDetailModal === 'function') {
                setTaskDetailModalComponent(() => window.TaskDetailModal);
                clearInterval(intervalId);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 100);

        window.addEventListener('componentLoaded', handleComponentLoaded);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [taskDetailModalComponent]);

    useEffect(() => {
        if (commentsPopupComponent) {
            return;
        }

        if (typeof window.CommentsPopup === 'function') {
            setCommentsPopupComponent(() => window.CommentsPopup);
            return;
        }

        const handleComponentLoaded = (event) => {
            if (event?.detail?.component === 'CommentsPopup' && typeof window.CommentsPopup === 'function') {
                setCommentsPopupComponent(() => window.CommentsPopup);
            }
        };

        let attempts = 0;
        const maxAttempts = 50;
        const intervalId = setInterval(() => {
            attempts++;
            if (typeof window.CommentsPopup === 'function') {
                setCommentsPopupComponent(() => window.CommentsPopup);
                clearInterval(intervalId);
            } else if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
        }, 100);

        window.addEventListener('componentLoaded', handleComponentLoaded);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('componentLoaded', handleComponentLoaded);
        };
    }, [commentsPopupComponent]);

    // Initialize custom field definitions with project-specific data
    const [customFieldDefinitions, setCustomFieldDefinitions] = useState(
        project.customFieldDefinitions || []
    );
    
    // Initialize documents for Document Collection workflow
    const [documents, setDocuments] = useState(project.documents || []);
    
    const documentSectionsArray = useMemo(
        () => parseDocumentSections(project.documentSections),
        [project.documentSections]
    );
    const serializedDocumentSections = useMemo(
        () => JSON.stringify(documentSectionsArray),
        [documentSectionsArray]
    );
    
    // Users state for project members and DocumentCollectionModal
    const [users, setUsers] = useState([]);
    
    // Load users on component mount
    useEffect(() => {
        const loadUsers = async () => {
            try {
                if (window.dataService && typeof window.dataService.getUsers === 'function') {
                    const userData = await window.dataService.getUsers() || [];
                    setUsers(userData);
                }
            } catch (error) {
                console.warn('Error loading users:', error);
                setUsers([]);
            }
        };
        loadUsers();
    }, []);
    
    const persistProjectData = useCallback(async ({
        nextTasks,
        nextTaskLists,
        nextCustomFieldDefinitions,
        nextDocuments,
        nextHasTimeProcess,
        nextHasDocumentCollectionProcess,
        nextHasWeeklyFMSReviewProcess,
        nextHasMonthlyFMSReviewProcess,
        nextHasMonthlyDataReviewProcess,
        nextHasComplianceReviewProcess,
        excludeHasTimeProcess = false,
        excludeHasDocumentCollectionProcess = false,
        excludeHasWeeklyFMSReviewProcess = false,
        excludeHasMonthlyFMSReviewProcess = false,
        excludeHasMonthlyDataReviewProcess = false,
        excludeHasComplianceReviewProcess = false,
        excludeDocumentSections = true,  // Default to true: don't overwrite documentSections managed by MonthlyDocumentCollectionTracker
        excludeWeeklyFMSReviewSections = true,  // Default to true: don't overwrite weeklyFMSReviewSections managed by WeeklyFMSReviewTracker
        excludeMonthlyFMSReviewSections = true  // Default to true: don't overwrite monthlyFMSReviewSections managed by MonthlyFMSReviewTracker
    } = {}) => {
        // Use provided values or fall back to current state from ref (avoids TDZ issues)
        const tasksToSave = nextTasks !== undefined ? nextTasks : tasksRef.current;
        const taskListsToSave = nextTaskLists !== undefined ? nextTaskLists : taskLists;
        const customFieldDefinitionsToSave = nextCustomFieldDefinitions !== undefined ? nextCustomFieldDefinitions : customFieldDefinitions;
        const documentsToSave = nextDocuments !== undefined ? nextDocuments : documents;
        const hasTimeProcessToSave = nextHasTimeProcess !== undefined ? nextHasTimeProcess : hasTimeProcess;
        const hasDocumentCollectionProcessToSave = nextHasDocumentCollectionProcess !== undefined ? nextHasDocumentCollectionProcess : hasDocumentCollectionProcess;
        const hasWeeklyFMSReviewProcessToSave = nextHasWeeklyFMSReviewProcess !== undefined ? nextHasWeeklyFMSReviewProcess : hasWeeklyFMSReviewProcess;
        const hasMonthlyFMSReviewProcessToSave = nextHasMonthlyFMSReviewProcess !== undefined ? nextHasMonthlyFMSReviewProcess : hasMonthlyFMSReviewProcess;
        const hasMonthlyDataReviewProcessToSave = nextHasMonthlyDataReviewProcess !== undefined ? nextHasMonthlyDataReviewProcess : hasMonthlyDataReviewProcess;
        const hasComplianceReviewProcessToSave = nextHasComplianceReviewProcess !== undefined ? nextHasComplianceReviewProcess : hasComplianceReviewProcess;
        
        try {
            // tasksList JSON writes removed - tasks are now stored in Task table
            // Comments are now stored in TaskComment table
            // JSON fields removed - data now stored in separate tables:
            // - taskLists → ProjectTaskList table (via /api/project-task-lists)
            // - customFieldDefinitions → ProjectCustomFieldDefinition table (via /api/project-custom-fields)
            // - documents → ProjectDocument table (via /api/project-documents)
            // - team → ProjectTeamMember table (via /api/project-team-members)
            // - comments → ProjectComment table (via /api/project-comments)
            // - activityLog → ProjectActivityLog table (via /api/project-activity-logs)
            // Only update documentSections if needed (uses DocumentSection table)
            const updatePayload = {};
            
            // Only include documentSections if not excluded
            // This prevents overwriting changes made by MonthlyDocumentCollectionTracker
            if (!excludeDocumentSections) {
                updatePayload.documentSections = serializedDocumentSections;
            } else {
            }
            
            // Only include hasTimeProcess if not excluded
            if (!excludeHasTimeProcess) {
                updatePayload.hasTimeProcess = hasTimeProcessToSave;
            }
            // Only include hasDocumentCollectionProcess if not excluded
            // This prevents overwriting the database value when we don't want to save it
            if (!excludeHasDocumentCollectionProcess) {
                updatePayload.hasDocumentCollectionProcess = hasDocumentCollectionProcessToSave;
            }
            
            // Only include hasWeeklyFMSReviewProcess if not excluded
            if (!excludeHasWeeklyFMSReviewProcess) {
                updatePayload.hasWeeklyFMSReviewProcess = hasWeeklyFMSReviewProcessToSave;
            }
            
            // Only include hasMonthlyFMSReviewProcess if not excluded
            if (!excludeHasMonthlyFMSReviewProcess) {
                updatePayload.hasMonthlyFMSReviewProcess = hasMonthlyFMSReviewProcessToSave;
            }
            // Only include hasMonthlyDataReviewProcess if not excluded
            if (!excludeHasMonthlyDataReviewProcess) {
                updatePayload.hasMonthlyDataReviewProcess = hasMonthlyDataReviewProcessToSave;
            }
            // Only include hasComplianceReviewProcess if not excluded
            if (!excludeHasComplianceReviewProcess) {
                updatePayload.hasComplianceReviewProcess = hasComplianceReviewProcessToSave;
            }
            
            // tasksList JSON writes removed - tasks are now stored in Task table
            // Validation and debug logging for tasksList removed
            console.log('💾 Saving project data:', { 
                projectId: project.id, 
                updatePayloadKeys: Object.keys(updatePayload)
            });
            
            try {
                const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                console.log('✅ Project save response:', apiResponse);
                
                // tasksList JSON verification removed - tasks are now stored in Task table
                
                // Check if save was successful - API returns { data: { project: ... } }
                const savedProject = apiResponse?.project || apiResponse?.data?.project;
                if (!savedProject) {
                    if (apiResponse?.error) {
                        throw new Error(apiResponse.error.message || 'Failed to save project');
                    } else {
                        // Response might be successful but project not in expected format
                        console.warn('⚠️ Project save response missing project data:', apiResponse);
                        // Don't throw - the save might have succeeded even if response format is unexpected
                    }
                } else {
                    console.log('✅ Project saved successfully:', savedProject.id);
                }
            } catch (saveError) {
                console.error('❌ Error in updateProject call:', saveError);
                throw saveError;
            }
            
            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                const savedProjects = await window.dataService.getProjects();
                if (savedProjects) {
                    const updatedProjects = savedProjects.map(p => {
                        if (p.id !== project.id) return p;
                        const normalizedSections = Array.isArray(p.documentSections)
                            ? p.documentSections
                            : documentSectionsArray;
                        return { 
                            ...p, 
                            // tasks removed - tasks are now loaded from Task table via API
                            taskLists: taskListsToSave, 
                            customFieldDefinitions: customFieldDefinitionsToSave, 
                            documents: documentsToSave, 
                            hasTimeProcess: hasTimeProcessToSave,
                            hasDocumentCollectionProcess: hasDocumentCollectionProcessToSave,
                            hasWeeklyFMSReviewProcess: hasWeeklyFMSReviewProcessToSave,
                            hasMonthlyFMSReviewProcess: hasMonthlyFMSReviewProcessToSave,
                            hasMonthlyDataReviewProcess: hasMonthlyDataReviewProcessToSave,
                            hasComplianceReviewProcess: hasComplianceReviewProcessToSave,
                            documentSections: normalizedSections
                        };
                    });
                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                        try {
                            await window.dataService.setProjects(updatedProjects);
                        } catch (saveError) {
                            console.warn('Failed to save projects to dataService:', saveError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error saving project data:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                projectId: project.id,
                updatePayload: updatePayload ? Object.keys(updatePayload) : null
            });
            alert('Failed to save project changes: ' + error.message);
            throw error;
        }
    }, [project.id, serializedDocumentSections, documentSectionsArray, taskLists, customFieldDefinitions, documents, hasTimeProcess, hasDocumentCollectionProcess, hasWeeklyFMSReviewProcess, hasMonthlyFMSReviewProcess]);
    
    // When URL or switchProjectTab enabled Time but we couldn't call persist yet (TDZ), persist here.
    useEffect(() => {
        if (!needPersistTimeFromUrlRef.current || !project?.id) return;
        needPersistTimeFromUrlRef.current = false;
        persistProjectData({ nextHasTimeProcess: true })
            .then(() => {
                if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    window.updateViewingProject({ ...project, hasTimeProcess: true });
                }
            })
            .finally(() => { hasTimeProcessChangedRef.current = false; });
    }, [hasTimeProcess, project?.id, persistProjectData]);

    // When URL or switchProjectTab enabled Monthly FMS but we couldn't call persist yet, persist here (same as Time).
    useEffect(() => {
        if (!needPersistMonthlyFMSFromUrlRef.current || !project?.id) return;
        needPersistMonthlyFMSFromUrlRef.current = false;
        persistProjectData({ nextHasMonthlyFMSReviewProcess: true })
            .then(() => {
                if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                    window.updateViewingProject({ ...project, hasMonthlyFMSReviewProcess: true });
                }
            })
            .finally(() => { hasMonthlyFMSReviewProcessChangedRef.current = false; });
    }, [hasMonthlyFMSReviewProcess, project?.id, persistProjectData]);

    // Save hasTimeProcess back to project whenever it changes
    useEffect(() => {
        if (skipNextSaveRef.current) return;
        const projectHas = project.hasTimeProcess === true || project.hasTimeProcess === 'true' || project.hasTimeProcess === 1 || (typeof project.hasTimeProcess === 'string' && project.hasTimeProcess.toLowerCase() === 'true');
        const shouldInclude = hasTimeProcessChangedRef.current || (hasTimeProcess !== projectHas);
        if (!shouldInclude) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            if (hasTimeProcessChangedRef.current) {
                persistProjectData({ nextHasTimeProcess: hasTimeProcess }).catch(() => {});
                hasTimeProcessChangedRef.current = false;
            }
        }, 500);
        return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
    }, [hasTimeProcess, project.hasTimeProcess, project.id, persistProjectData]);

    // Save back to project whenever they change
    // NOTE: tasks is NOT in dependencies - tasks are managed via Task API, not project JSON
    useEffect(() => {
        // Skip save if this was triggered by manual document collection process addition
        // This prevents the debounced save from overwriting an explicit save
        if (skipNextSaveRef.current) {
            // Don't reset skipNextSaveRef here - it will be reset by the explicit save handler
            return;
        }
        
        // Normalize project prop value for comparison
        const projectHasProcess = project.hasDocumentCollectionProcess === true || 
                                  project.hasDocumentCollectionProcess === 'true' ||
                                  project.hasDocumentCollectionProcess === 1 ||
                                  (typeof project.hasDocumentCollectionProcess === 'string' && project.hasDocumentCollectionProcess.toLowerCase() === 'true');
        
        // Only include hasDocumentCollectionProcess in save if:
        // 1. It was explicitly changed by the user (tracked by ref), OR
        // 2. It differs from the project prop (meaning user changed it)
        // Otherwise, exclude it from the save to prevent overwriting the database value
        const shouldIncludeHasProcess = hasDocumentCollectionProcessChangedRef.current || 
                                       (hasDocumentCollectionProcess !== projectHasProcess);
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
            // Double-check that hasDocumentCollectionProcess wasn't explicitly changed
            // This prevents race conditions where the flag might have been reset
            if (shouldIncludeHasProcess && hasDocumentCollectionProcessChangedRef.current) {
                // Include hasDocumentCollectionProcess in save
                persistProjectData({
                    nextHasDocumentCollectionProcess: hasDocumentCollectionProcess
                }).catch(() => {});
                // Reset the flag after saving
                hasDocumentCollectionProcessChangedRef.current = false;
            } else if (!shouldIncludeHasProcess) {
                // Exclude hasDocumentCollectionProcess from save to prevent overwriting database value
                persistProjectData({
                    excludeHasDocumentCollectionProcess: true
                }).catch(() => {});
            } else {
                // Flag was reset but we thought we should include it - skip to be safe
                persistProjectData({
                    excludeHasDocumentCollectionProcess: true
                }).catch(() => {});
            }
        }, 1500); // Increased debounce to 1.5 seconds to avoid excessive API calls
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [taskLists, customFieldDefinitions, documents, hasDocumentCollectionProcess, project.hasDocumentCollectionProcess, persistProjectData, project]);

    // Save hasWeeklyFMSReviewProcess back to project whenever it changes
    useEffect(() => {
        // Skip save if this was triggered by manual weekly FMS review process addition
        // This prevents the debounced save from overwriting an explicit save
        if (skipNextSaveRef.current) {
            // Don't reset skipNextSaveRef here - it will be reset by the explicit save handler
            return;
        }
        
        // Normalize project prop value for comparison
        const projectHasProcess = project.hasWeeklyFMSReviewProcess === true || 
                                  project.hasWeeklyFMSReviewProcess === 'true' ||
                                  project.hasWeeklyFMSReviewProcess === 1 ||
                                  (typeof project.hasWeeklyFMSReviewProcess === 'string' && project.hasWeeklyFMSReviewProcess.toLowerCase() === 'true');
        
        // Only include hasWeeklyFMSReviewProcess in save if:
        // 1. It was explicitly changed by the user (tracked by ref), OR
        // 2. It differs from the project prop (meaning user changed it)
        // Otherwise, exclude it from the save to prevent overwriting the database value
        const shouldIncludeHasProcess = hasWeeklyFMSReviewProcessChangedRef.current || 
                                       (hasWeeklyFMSReviewProcess !== projectHasProcess);
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
            // Double-check that hasWeeklyFMSReviewProcess wasn't explicitly changed
            // This prevents race conditions where the flag might have been reset
            if (shouldIncludeHasProcess && hasWeeklyFMSReviewProcessChangedRef.current) {
                // Include hasWeeklyFMSReviewProcess in save
                persistProjectData({
                    nextHasWeeklyFMSReviewProcess: hasWeeklyFMSReviewProcess
                }).catch(() => {});
                // Reset the flag after saving
                hasWeeklyFMSReviewProcessChangedRef.current = false;
            } else if (!shouldIncludeHasProcess) {
                // Exclude hasWeeklyFMSReviewProcess from save to prevent overwriting database value
                persistProjectData({
                    excludeHasWeeklyFMSReviewProcess: true
                }).catch(() => {});
            } else {
                // Flag was reset but we thought we should include it - skip to be safe
                persistProjectData({
                    excludeHasWeeklyFMSReviewProcess: true
                }).catch(() => {});
            }
        }, 1500); // Increased debounce to 1.5 seconds to avoid excessive API calls
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [tasks, taskLists, customFieldDefinitions, documents, hasWeeklyFMSReviewProcess, project.hasWeeklyFMSReviewProcess, persistProjectData, project]);

    // Save hasMonthlyFMSReviewProcess back to project whenever it changes
    useEffect(() => {
        // Skip save if this was triggered by manual monthly FMS review process addition
        // This prevents the debounced save from overwriting an explicit save
        if (skipNextSaveRef.current) {
            // Don't reset skipNextSaveRef here - it will be reset by the explicit save handler
            return;
        }
        
        // Normalize project prop value for comparison
        const projectHasProcess = project.hasMonthlyFMSReviewProcess === true || 
                                  project.hasMonthlyFMSReviewProcess === 'true' ||
                                  project.hasMonthlyFMSReviewProcess === 1 ||
                                  (typeof project.hasMonthlyFMSReviewProcess === 'string' && project.hasMonthlyFMSReviewProcess.toLowerCase() === 'true');
        
        // Only include hasMonthlyFMSReviewProcess in save if:
        // 1. It was explicitly changed by the user (tracked by ref), OR
        // 2. It differs from the project prop (meaning user changed it)
        // Otherwise, exclude it from the save to prevent overwriting the database value
        const shouldIncludeHasProcess = hasMonthlyFMSReviewProcessChangedRef.current || 
                                       (hasMonthlyFMSReviewProcess !== projectHasProcess);
        
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        saveTimeoutRef.current = setTimeout(() => {
            // Double-check that hasMonthlyFMSReviewProcess wasn't explicitly changed
            // This prevents race conditions where the flag might have been reset
            if (shouldIncludeHasProcess && hasMonthlyFMSReviewProcessChangedRef.current) {
                // Include hasMonthlyFMSReviewProcess in save
                persistProjectData({
                    nextHasMonthlyFMSReviewProcess: hasMonthlyFMSReviewProcess
                }).catch(() => {});
                // Reset the flag after saving
                hasMonthlyFMSReviewProcessChangedRef.current = false;
            } else if (!shouldIncludeHasProcess) {
                // Exclude hasMonthlyFMSReviewProcess from save to prevent overwriting database value
                persistProjectData({
                    excludeHasMonthlyFMSReviewProcess: true
                }).catch(() => {});
            } else {
                // Flag was reset but we thought we should include it - skip to be safe
                persistProjectData({
                    excludeHasMonthlyFMSReviewProcess: true
                }).catch(() => {});
            }
        }, 1500); // Increased debounce to 1.5 seconds to avoid excessive API calls
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [tasks, taskLists, customFieldDefinitions, documents, hasMonthlyFMSReviewProcess, project.hasMonthlyFMSReviewProcess, persistProjectData, project]);

    // Save hasMonthlyDataReviewProcess back to project whenever it changes
    useEffect(() => {
        if (skipNextSaveRef.current) return;
        const projectHasProcess = project.hasMonthlyDataReviewProcess === true ||
                                  project.hasMonthlyDataReviewProcess === 'true' ||
                                  project.hasMonthlyDataReviewProcess === 1 ||
                                  (typeof project.hasMonthlyDataReviewProcess === 'string' && project.hasMonthlyDataReviewProcess.toLowerCase() === 'true');
        const shouldIncludeHasProcess = hasMonthlyDataReviewProcessChangedRef.current ||
                                       (hasMonthlyDataReviewProcess !== projectHasProcess);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            if (shouldIncludeHasProcess && hasMonthlyDataReviewProcessChangedRef.current) {
                persistProjectData({ nextHasMonthlyDataReviewProcess: hasMonthlyDataReviewProcess }).catch(() => {});
                hasMonthlyDataReviewProcessChangedRef.current = false;
            } else if (!shouldIncludeHasProcess) {
                persistProjectData({ excludeHasMonthlyDataReviewProcess: true }).catch(() => {});
            } else {
                persistProjectData({ excludeHasMonthlyDataReviewProcess: true }).catch(() => {});
            }
        }, 1500);
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [taskLists, customFieldDefinitions, documents, hasMonthlyDataReviewProcess, project.hasMonthlyDataReviewProcess, persistProjectData, project]);

    // Save hasComplianceReviewProcess back to project whenever it changes
    useEffect(() => {
        if (skipNextSaveRef.current) return;
        const projectHasProcess = project.hasComplianceReviewProcess === true ||
                                  project.hasComplianceReviewProcess === 'true' ||
                                  project.hasComplianceReviewProcess === 1 ||
                                  (typeof project.hasComplianceReviewProcess === 'string' && project.hasComplianceReviewProcess.toLowerCase() === 'true');
        const shouldIncludeHasProcess = hasComplianceReviewProcessChangedRef.current ||
                                       (hasComplianceReviewProcess !== projectHasProcess);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            if (shouldIncludeHasProcess && hasComplianceReviewProcessChangedRef.current) {
                persistProjectData({ nextHasComplianceReviewProcess: hasComplianceReviewProcess }).catch(() => {});
                hasComplianceReviewProcessChangedRef.current = false;
            } else if (!shouldIncludeHasProcess) {
                persistProjectData({ excludeHasComplianceReviewProcess: true }).catch(() => {});
            } else {
                persistProjectData({ excludeHasComplianceReviewProcess: true }).catch(() => {});
            }
        }, 1500);
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [taskLists, customFieldDefinitions, documents, hasComplianceReviewProcess, project.hasComplianceReviewProcess, persistProjectData, project]);

    // Get document status color
    const getDocumentStatusColor = (status) => {
        switch(status) {
            case 'Approved': return 'bg-green-100 text-green-800';
            case 'Submitted': return 'bg-blue-100 text-blue-800';
            case 'Under Review': return 'bg-yellow-100 text-yellow-800';
            case 'Rejected': return 'bg-red-100 text-red-800';
            case 'Pending': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const formatProjectDate = (dateValue) => {
        if (!dateValue) return '';

        const rawValue = typeof dateValue === 'string' ? dateValue.trim() : dateValue;
        if (!rawValue) return '';

        const parsed = new Date(rawValue);
        if (Number.isNaN(parsed.getTime())) {
            return typeof dateValue === 'string' ? dateValue : '';
        }

        const hasTime = typeof dateValue === 'string' && /[T\s]\d{2}:\d{2}/.test(dateValue);
        const options = hasTime
            ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { year: 'numeric', month: 'short', day: 'numeric' };

        return parsed.toLocaleString(undefined, options);
    };

    // Comment handling function
    const handleAddComment = async (taskId, commentText, isSubtask, parentId) => {
        if (!commentText || !commentText.trim()) {
            return;
        }

        const currentUser = (window.storage?.getUserInfo && window.storage.getUserInfo()) || { name: 'System', email: 'system', id: 'system' };

        // Parse mentions from comment text (@username format)
        const mentionRegex = /@([\w]+(?:\s+[\w]+)*)/g;
        const mentionTexts = [];
        let match;
        while ((match = mentionRegex.exec(commentText)) !== null) {
            const mentionValue = match[1]?.trim();
            if (mentionValue) {
                mentionTexts.push(mentionValue);
            }
        }

        const mentionedUsers = [];
        mentionTexts.forEach(mentionText => {
            const mentionLower = mentionText.toLowerCase();
            const matchedUser = users.find(user => {
                const name = (user.name || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                return name === mentionLower ||
                    email === mentionLower ||
                    name.startsWith(mentionLower + ' ') ||
                    name.includes(' ' + mentionLower + ' ') ||
                    name.endsWith(' ' + mentionLower) ||
                    name.split(' ').some(part => part === mentionLower);
            });
            if (matchedUser && matchedUser.id && !mentionedUsers.some(m => m.id === matchedUser.id)) {
                mentionedUsers.push({
                    id: matchedUser.id,
                    name: matchedUser.name,
                    email: matchedUser.email
                });
            }
        });

        const newComment = {
            id: Date.now(),
            text: commentText,
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id,
            timestamp: new Date().toISOString(),
            date: new Date().toLocaleString(),
            mentions: mentionedUsers
        };

        const findTaskById = () => {
            // CRITICAL: Ensure tasks is always an array
            const safeTasks = Array.isArray(tasks) ? tasks : [];
            if (isSubtask) {
                const parentTask = safeTasks.find(t => t.id === parentId);
                return parentTask?.subtasks?.find(st => st.id === taskId) || null;
            }
            return safeTasks.find(t => t.id === taskId) || null;
        };

        const originalTask = findTaskById();
        if (!originalTask) {
            console.warn('⚠️ handleAddComment: Task not found for comment addition', { taskId, isSubtask, parentId });
            return;
        }

        const existingSubscribers = Array.isArray(originalTask.subscribers)
            ? originalTask.subscribers.filter(Boolean)
            : [];
        const newSubscribers = Array.from(new Set([
            ...existingSubscribers,
            currentUser.id,
            ...mentionedUsers.map(u => u.id).filter(Boolean)
        ])).filter(Boolean);

        let updatedTargetTask = null;
        // Use functional update so we never overwrite with stale tasks (avoids first task disappearing when adding comment after adding two tasks)
        setTasks(prev => {
            const safe = Array.isArray(prev) ? prev : [];
            const updated = safe.map(task => {
                if (isSubtask) {
                    if (task.id !== parentId) {
                        return task;
                    }
                    const updatedSubtasks = (task.subtasks || []).map(subtask => {
                        if (subtask.id !== taskId) {
                            return subtask;
                        }
                        updatedTargetTask = {
                            ...subtask,
                            comments: [...(subtask.comments || []), newComment],
                            subscribers: newSubscribers
                        };
                        return updatedTargetTask;
                    });
                    return {
                        ...task,
                        subtasks: updatedSubtasks
                    };
                }

                if (task.id !== taskId) {
                    return task;
                }

                updatedTargetTask = {
                    ...task,
                    comments: [...(task.comments || []), newComment],
                    subscribers: newSubscribers
                };
                return updatedTargetTask;
            });
            return updated;
        });

        if (!updatedTargetTask) {
            console.warn('⚠️ handleAddComment: Updated task not resolved after mapping', { taskId, isSubtask, parentId });
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        skipNextSaveRef.current = true;

        // tasksList JSON write removed - comments are now stored in TaskComment table
        // Comment persistence is handled by TaskComment API in TaskDetailModal
        setTimeout(() => {
            skipNextSaveRef.current = false;
        }, 500);

        // Use hash-based routing format for email links (frontend uses hash routing)
        const projectLink = project ? `#/projects/${project.id}` : '#/projects';
        const finalTaskId = updatedTargetTask.id || taskId;
        // Build task-specific link with query parameter for direct navigation to task
        const taskLink = finalTaskId
            ? `${projectLink}?task=${encodeURIComponent(finalTaskId)}&focusInput=comment`
            : projectLink;
        const taskTitle = updatedTargetTask.title || originalTask.title || 'Task';
        const projectName = project?.name || 'Project';

        try {
            if (window.MentionHelper && mentionedUsers.length > 0) {
                await window.MentionHelper.processMentions(
                    commentText,
                    `Task: ${taskTitle}`,
                    taskLink, // Use task-specific link
                    currentUser.name,
                    users,
                    {
                        projectId: project?.id,
                        projectName,
                        taskId: finalTaskId,
                        taskTitle
                    }
                );
            }
        } catch (mentionError) {
            console.error('❌ Failed to process mentions:', mentionError);
        }

        const findUserMatch = (value) => {
            if (!value) return null;
            const lowered = String(value).toLowerCase();
            return users.find(user =>
                user.id === value ||
                (user.email || '').toLowerCase() === lowered ||
                (user.name || '').toLowerCase() === lowered
            ) || null;
        };

        const assigneeUser = findUserMatch(
            updatedTargetTask.assigneeId ||
            updatedTargetTask.assignee ||
            originalTask.assigneeId ||
            originalTask.assignee
        );

        const sendNotification = async (userId, contextLabel) => {
            if (!userId || !window.DatabaseAPI || typeof window.DatabaseAPI.makeRequest !== 'function') {
                return;
            }
            
            // Generate entity URL for the task (nested under project)
            let entityUrl = taskLink; // Fallback to old format
            if (window.EntityUrl && finalTaskId && project?.id) {
                entityUrl = window.EntityUrl.getEntityUrl('task', finalTaskId, {
                    parentId: project.id,
                    parentType: 'project',
                    tab: 'comments'
                });
            }
            
            // Get task details for enhanced notification
            const task = tasks.find(t => t.id === finalTaskId);
            
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'POST',
                body: JSON.stringify({
                    userId,
                    type: 'comment',
                    title: `New comment on task: ${taskTitle}`,
                    message: `${currentUser.name} commented on "${taskTitle}" in project "${projectName}": "${commentText.substring(0, 100)}${commentText.length > 100 ? '...' : ''}"`,
                    link: entityUrl,
                    metadata: {
                        taskId: finalTaskId,
                        taskTitle,
                        taskDescription: task?.description || null,
                        taskStatus: task?.status || 'To Do',
                        taskPriority: task?.priority || 'Medium',
                        taskDueDate: task?.dueDate || null,
                        taskListId: task?.listId || null,
                        projectId: project?.id,
                        projectName,
                        clientId: project?.clientId || null,
                        commentAuthor: currentUser.name,
                        commentText,
                        context: contextLabel
                    }
                })
            });
        };

        try {
            if (assigneeUser && assigneeUser.id && assigneeUser.id !== currentUser.id && !mentionedUsers.some(m => m.id === assigneeUser.id)) {
                await sendNotification(assigneeUser.id, 'assignee');
            }
        } catch (assigneeError) {
            console.error('❌ Failed to send comment notification to assignee:', assigneeError);
        }

        const mentionedIds = mentionedUsers.map(u => u.id).filter(Boolean);
        const subscribersToNotify = newSubscribers
            .filter(Boolean)
            .filter(subId => subId !== currentUser.id)
            .filter(subId => !mentionedIds.includes(subId))
            .filter(subId => !(assigneeUser && assigneeUser.id === subId));

        for (const subscriberId of subscribersToNotify) {
            const subscriber = users.find(u => u.id === subscriberId);
            if (subscriber) {
                try {
                    await sendNotification(subscriber.id, 'subscriber');
                } catch (subscriberError) {
                    console.error(`❌ Failed to send comment notification to subscriber ${subscriber.name}:`, subscriberError);
                }
            }
        }
    };

    const getAssigneeKey = useCallback((task) => {
        if (!task) return null;
        if (task.assigneeId) return `id:${task.assigneeId}`;
        if (task.assigneeEmail) return `email:${String(task.assigneeEmail).toLowerCase()}`;
        if (task.assignee) return `name:${String(task.assignee).toLowerCase()}`;
        return null;
    }, []);

    const getAssigneeLabel = useCallback((task) => {
        if (!task) return 'Unassigned';
        return task.assignee || task.assigneeName || task.assigneeEmail || (task.assigneeId ? `User ${task.assigneeId}` : 'Unassigned');
    }, []);

    const statusOptions = useMemo(() => {
        const map = new Map();
        const addStatus = (status) => {
            if (!status) return;
            const normalized = String(status).toLowerCase();
            if (!map.has(normalized)) {
                map.set(normalized, status);
            }
        };

        ['To Do', 'In Progress', 'Done', 'Blocked', 'Review', 'Archived'].forEach(addStatus);

        // CRITICAL: Ensure tasks is always an array
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        safeTasks.forEach(task => {
            addStatus(task.status || 'To Do');
            (task.subtasks || []).forEach(subtask => addStatus(subtask.status || ''));
        });

        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [tasks]);

    const priorityOptions = useMemo(() => {
        const map = new Map();
        ['High', 'Medium', 'Low'].forEach(priority => {
            map.set(priority.toLowerCase(), priority);
        });

        // CRITICAL: Ensure tasks is always an array
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        safeTasks.forEach(task => {
            if (task.priority) {
                map.set(String(task.priority).toLowerCase(), task.priority);
            }
            (task.subtasks || []).forEach(subtask => {
                if (subtask.priority) {
                    map.set(String(subtask.priority).toLowerCase(), subtask.priority);
                }
            });
        });

        return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
    }, [tasks]);

    const assigneeOptions = useMemo(() => {
        const map = new Map();

        // CRITICAL: Ensure tasks is always an array
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        safeTasks.forEach(task => {
            const key = getAssigneeKey(task);
            if (key) {
                map.set(key, getAssigneeLabel(task));
            }

            (task.subtasks || []).forEach(subtask => {
                const subKey = getAssigneeKey(subtask);
                if (subKey) {
                    map.set(subKey, getAssigneeLabel(subtask));
                }
            });
        });

        users.forEach(user => {
            const key = user.id
                ? `id:${user.id}`
                : user.email
                    ? `email:${String(user.email).toLowerCase()}`
                    : user.name
                        ? `name:${String(user.name).toLowerCase()}`
                        : null;
            if (key) {
                map.set(key, user.name || user.email || `User ${user.id || ''}`.trim());
            }
        });

        return Array.from(map.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => (a.label || '').localeCompare(b.label || ''));
    }, [tasks, users, getAssigneeKey, getAssigneeLabel]);

    const listOptions = useMemo(() => {
        return taskLists.map(list => ({
            value: String(list.id),
            label: list.name
        }));
    }, [taskLists]);

    const matchesTaskFilters = useCallback((task, fallbackListId = null) => {
        if (!task) return false;

        const normalizedTaskStatus = String(task.status || 'To Do').toLowerCase().replace(/\s+/g, '');
        const isArchived = normalizedTaskStatus === 'archived';

        // When "Show archived" is off, hide archived tasks
        if (isArchived && !taskFilters.showArchived) {
            return false;
        }

        const searchTerm = taskFilters.search.trim().toLowerCase();
        const effectiveListId = task.listId ?? fallbackListId;

        if (taskFilters.list !== 'all' && String(effectiveListId) !== taskFilters.list) {
            return false;
        }

        if (taskFilters.status !== 'all') {
            const normalizedStatus = String(task.status || 'To Do').toLowerCase();
            if (normalizedStatus !== taskFilters.status) {
                return false;
            }
        }

        if (taskFilters.priority !== 'all') {
            const normalizedPriority = String(task.priority || '').toLowerCase();
            if (normalizedPriority !== taskFilters.priority) {
                return false;
            }
        }

        if (taskFilters.assignee !== 'all') {
            const key = getAssigneeKey(task);
            if (!key || key !== taskFilters.assignee) {
                return false;
            }
        }

        if (searchTerm) {
            const haystack = [
                task.title,
                task.description,
                task.assignee,
                task.assigneeEmail,
                ...(task.tags || [])
            ].map(value => (value || '').toString().toLowerCase());

            const commentsHaystack = (task.comments || []).map(comment => (comment.text || '').toLowerCase());
            const combined = haystack.concat(commentsHaystack);
            const hasMatch = combined.some(text => text.includes(searchTerm));

            if (!hasMatch) {
                return false;
            }
        }

        return true;
    }, [taskFilters, getAssigneeKey]);

    const filteredTaskLists = useMemo(() => {
        const includeSubtasks = taskFilters.includeSubtasks;
        // CRITICAL: Ensure tasks is always an array to prevent .map() errors
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        
        // Track which tasks have been assigned to a list
        const assignedTaskIds = new Set();

        const result = taskLists
            .filter(list => taskFilters.list === 'all' || String(list.id) === taskFilters.list)
            .map(list => {
                // CRITICAL: Use String() comparison to handle type mismatch (number vs string)
                const tasksForList = safeTasks
                    .filter(task => String(task.listId) === String(list.id))
                    .map(task => {
                        const taskMatches = matchesTaskFilters(task, list.id);
                        const matchingSubtasks = (task.subtasks || []).filter(subtask => matchesTaskFilters(subtask, list.id));
                        const shouldInclude = taskMatches || (includeSubtasks && matchingSubtasks.length > 0);

                        if (!shouldInclude) {
                            return null;
                        }

                        // Mark task as assigned
                        assignedTaskIds.add(task.id);

                        return {
                            task,
                            matchingSubtasks: includeSubtasks ? matchingSubtasks : [],
                            matchedBySubtasks: includeSubtasks && !taskMatches && matchingSubtasks.length > 0
                        };
                    })
                    .filter(Boolean);

                // Sort by current column (default: newest first = createdAt desc)
                const cmp = (aa, bb) => {
                    const a = aa.task;
                    const b = bb.task;
                    let diff = 0;
                    if (taskListSortBy === 'order') {
                        const oa = a.order ?? 999999;
                        const ob = b.order ?? 999999;
                        diff = oa - ob;
                    } else if (taskListSortBy === 'title') {
                        diff = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'status') {
                        diff = (a.status || '').localeCompare(b.status || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'assignee') {
                        diff = (a.assignee || '').localeCompare(b.assignee || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'priority') {
                        diff = (a.priority || '').localeCompare(b.priority || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'dueDate') {
                        const ta = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                        const tb = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                        diff = ta - tb;
                    } else if (taskListSortBy === 'comments') {
                        const ca = (a.comments || []).length;
                        const cb = (b.comments || []).length;
                        diff = ca - cb;
                    } else {
                        // createdAt (default)
                        diff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                    }
                    return taskListSortDir === 'asc' ? diff : -diff;
                };
                tasksForList.sort(cmp);

                return {
                    ...list,
                    tasks: tasksForList
                };
            });

        // Find tasks that don't have a matching listId and assign them to the first available list
        // Prefer "To Do" list if it exists, otherwise use the first list. Exclude archived tasks (they get their own section).
        const isArchivedTask = (t) => String(t.status || '').toLowerCase().replace(/\s+/g, '') === 'archived';
        const unmatchedTasks = safeTasks.filter(task => !assignedTaskIds.has(task.id) && !isArchivedTask(task));
        
        if (unmatchedTasks.length > 0 && result.length > 0) {
            // Find "To Do" list or use the first list as fallback
            const fallbackListIndex = result.findIndex(list => {
                const listName = String(list.name || '').toLowerCase();
                return listName === 'to do' || listName === 'todo';
            });
            const targetListIndex = fallbackListIndex >= 0 ? fallbackListIndex : 0;
            const targetList = result[targetListIndex];
            
            // Process unmatched tasks and add them to the fallback list
            const unmatchedTasksForList = unmatchedTasks
                .map(task => {
                    const taskMatches = matchesTaskFilters(task, targetList.id);
                    const matchingSubtasks = (task.subtasks || []).filter(subtask => matchesTaskFilters(subtask, targetList.id));
                    const shouldInclude = taskMatches || (includeSubtasks && matchingSubtasks.length > 0);

                    if (!shouldInclude) {
                        return null;
                    }

                    return {
                        task,
                        matchingSubtasks: includeSubtasks ? matchingSubtasks : [],
                        matchedBySubtasks: includeSubtasks && !taskMatches && matchingSubtasks.length > 0
                    };
                })
                .filter(Boolean);
            
            if (unmatchedTasksForList.length > 0) {
                const merged = [...targetList.tasks, ...unmatchedTasksForList];
                const cmp = (aa, bb) => {
                    const a = aa.task;
                    const b = bb.task;
                    let diff = 0;
                    if (taskListSortBy === 'order') {
                        diff = (a.order ?? 999999) - (b.order ?? 999999);
                    } else if (taskListSortBy === 'title') {
                        diff = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'status') {
                        diff = (a.status || '').localeCompare(b.status || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'assignee') {
                        diff = (a.assignee || '').localeCompare(b.assignee || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'priority') {
                        diff = (a.priority || '').localeCompare(b.priority || '', undefined, { sensitivity: 'base' });
                    } else if (taskListSortBy === 'dueDate') {
                        const ta = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                        const tb = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                        diff = ta - tb;
                    } else if (taskListSortBy === 'comments') {
                        diff = (a.comments || []).length - (b.comments || []).length;
                    } else {
                        diff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                    }
                    return taskListSortDir === 'asc' ? diff : -diff;
                };
                merged.sort(cmp);
                result[targetListIndex] = {
                    ...targetList,
                    tasks: merged
                };
                if (TASK_LIST_DEBUG) console.warn(`ProjectDetail: ${unmatchedTasksForList.length} task(s) without matching listId assigned to "${targetList.name}" list. Task IDs:`, unmatchedTasksForList.map(item => item.task.id));
            }
        }

        // When "Show archived" is on, append an Archived section for tasks with status Archived
        if (taskFilters.showArchived) {
            const archivedTasks = safeTasks.filter(t => {
                if (String(t.status || '').toLowerCase().replace(/\s+/g, '') !== 'archived') return false;
                return matchesTaskFilters(t, null);
            });
            if (archivedTasks.length > 0) {
                const archivedListId = 'archived';
                const existingArchivedList = taskLists.find(l => String(l.name || '').toLowerCase() === 'archived');
                const archivedList = existingArchivedList || { id: archivedListId, name: 'Archived', statuses: [{ value: 'archived', label: 'Archived' }] };
                const archivedItems = archivedTasks.map(task => {
                    const matchingSubtasks = (task.subtasks || []).filter(st => matchesTaskFilters(st, null));
                    const taskMatches = matchesTaskFilters(task, archivedList.id);
                    const shouldInclude = taskMatches || (taskFilters.includeSubtasks && matchingSubtasks.length > 0);
                    if (!shouldInclude) return null;
                    return {
                        task,
                        matchingSubtasks: taskFilters.includeSubtasks ? matchingSubtasks : [],
                        matchedBySubtasks: taskFilters.includeSubtasks && !taskMatches && matchingSubtasks.length > 0
                    };
                }).filter(Boolean);
                const cmp = (aa, bb) => {
                    const a = aa.task;
                    const b = bb.task;
                    let diff = (a.order ?? 999999) - (b.order ?? 999999);
                    if (diff !== 0) return taskListSortDir === 'asc' ? diff : -diff;
                    diff = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                    return taskListSortDir === 'asc' ? diff : -diff;
                };
                archivedItems.sort(cmp);
                result.push({ ...archivedList, id: existingArchivedList?.id ?? archivedListId, tasks: archivedItems });
            }
        }

        return result;
    }, [taskLists, tasks, taskFilters, matchesTaskFilters, taskListSortBy, taskListSortDir]);

    const filteredTaskIdSet = useMemo(() => {
        const ids = new Set();
        filteredTaskLists.forEach(list => {
            list.tasks.forEach(item => {
                if (item?.task?.id != null) {
                    ids.add(item.task.id);
                }
            });
        });
        return ids;
    }, [filteredTaskLists]);

    const hasActiveTaskFilters = useMemo(() => {
        return (
            taskFilters.search.trim() !== '' ||
            taskFilters.status !== 'all' ||
            taskFilters.assignee !== 'all' ||
            taskFilters.priority !== 'all' ||
            taskFilters.list !== 'all' ||
            taskFilters.showArchived
        );
    }, [taskFilters]);

    const filteredTopLevelTasks = useMemo(() => {
        // CRITICAL: Ensure tasks is always an array to prevent .filter() errors
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        
        // If no tasks match filters but we have tasks, show all tasks when no filters are active
        if (filteredTaskIdSet.size === 0) {
            // Always show tasks when no filters are active, or when list filter is 'all' and no other filters
            if (taskFilters.list === 'all' && !hasActiveTaskFilters) {
                return safeTasks;
            }
            // If filters are active but no matches, return empty (filtered out)
            return [];
        }
        
        // Filter tasks based on filteredTaskIdSet (which respects all active filters)
        return safeTasks.filter(task => filteredTaskIdSet.has(task.id));
    }, [tasks, filteredTaskIdSet, taskFilters.list, hasActiveTaskFilters]);

    const filteredSubtasksMap = useMemo(() => {
        const map = new Map();
        filteredTaskLists.forEach(list => {
            list.tasks.forEach(item => {
                map.set(item.task.id, item.matchingSubtasks);
            });
        });
        return map;
    }, [filteredTaskLists]);

    const visibleTaskCount = filteredTopLevelTasks.length;
    const totalTaskCount = useMemo(() => {
        const safe = Array.isArray(tasks) ? tasks : [];
        if (taskFilters.showArchived) return safe.length;
        return safe.filter(t => String(t.status || '').toLowerCase().replace(/\s+/g, '') !== 'archived').length;
    }, [tasks, taskFilters.showArchived]);

    // Tasks to show in Kanban: optionally filtered by selected list (status columns stay the same)
    const kanbanTasks = useMemo(() => {
        if (kanbanListFilter === 'all') return filteredTopLevelTasks;
        return filteredTopLevelTasks.filter(t => String(t.listId) === String(kanbanListFilter));
    }, [filteredTopLevelTasks, kanbanListFilter]);

    const resetTaskFilters = useCallback(() => {
        setTaskFilters({
            search: '',
            status: 'all',
            assignee: 'all',
            priority: 'all',
            list: 'all',
            includeSubtasks: true,
            showArchived: false
        });
    }, []);

    const handleTaskListSort = useCallback((column) => {
        setTaskListSortBy(prev => {
            if (prev === column) {
                setTaskListSortDir(d => d === 'asc' ? 'desc' : 'asc');
                return prev;
            }
            setTaskListSortDir(column === 'createdAt' || column === 'dueDate' ? 'desc' : 'asc');
            return column;
        });
    }, []);

    const getDueDateMeta = useCallback((dateValue) => {
        if (!dateValue) {
            return { label: 'No due date', pillClass: 'bg-gray-100 text-gray-600' };
        }

        const parsed = new Date(dateValue);
        if (Number.isNaN(parsed.getTime())) {
            return { label: String(dateValue), pillClass: 'bg-gray-100 text-gray-600' };
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const due = new Date(parsed);
        due.setHours(0, 0, 0, 0);

        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { label: `Overdue ${Math.abs(diffDays)}d`, pillClass: 'bg-red-100 text-red-700' };
        }
        if (diffDays === 0) {
            return { label: 'Due today', pillClass: 'bg-orange-100 text-orange-700' };
        }
        if (diffDays === 1) {
            return { label: 'Due tomorrow', pillClass: 'bg-yellow-100 text-yellow-700' };
        }
        if (diffDays <= 7) {
            return { label: `Due in ${diffDays}d`, pillClass: 'bg-blue-100 text-blue-700' };
        }

        return { label: due.toLocaleDateString(), pillClass: 'bg-gray-100 text-gray-600' };
    }, []);

    const formatStartDateLabel = useCallback((dateValue) => {
        if (!dateValue) return null;
        const parsed = new Date(dateValue);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toLocaleDateString();
    }, []);

    const kanbanColumns = useMemo(() => {
        const baseOrder = ['to do', 'in progress', 'review', 'blocked', 'done'];
        const seen = new Set();
        const ordered = [];

        baseOrder.forEach(key => {
            const match = statusOptions.find(option => option.value === key);
            if (match && !seen.has(match.value)) {
                ordered.push(match);
                seen.add(match.value);
            }
        });

        statusOptions.forEach(option => {
            if (!seen.has(option.value)) {
                ordered.push(option);
                seen.add(option.value);
            }
        });

        return ordered;
    }, [statusOptions]);

    // List-based columns for Kanban (filtered by kanbanListFilter)
    const kanbanListColumns = useMemo(() => {
        if (!taskLists || !Array.isArray(taskLists) || taskLists.length === 0) {
            return [{ value: 1, label: 'To Do' }];
        }
        if (kanbanListFilter === 'all') {
            return taskLists.map(l => ({ value: l.id, label: l.name || 'Unnamed' }));
        }
        const single = taskLists.find(l => String(l.id) === String(kanbanListFilter));
        if (single) {
            return [{ value: single.id, label: single.name || 'Unnamed' }];
        }
        return taskLists.map(l => ({ value: l.id, label: l.name || 'Unnamed' }));
    }, [taskLists, kanbanListFilter]);

    const openTaskComments = useCallback(async (event, task, { parentTask = null, isSubtask = false, commentId = null } = {}) => {
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
        const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
        const commentWidth = 320;
        const left = Math.min(rect.left + scrollX, (scrollX + window.innerWidth) - commentWidth - 16);

        const position = {
            top: rect.bottom + scrollY + 8,
            left: Math.max(16, left)
        };

        // Calculate trigger position for speech bubble tail
        const triggerPosition = {
            top: rect.top + scrollY + (rect.height / 2), // Center of the button vertically
            left: rect.left + scrollX + (rect.width / 2)  // Center of the button horizontally
        };

        const ready = await ensureCommentsPopupLoaded();
        if (!ready) {
            console.warn('⚠️ CommentsPopup component is not available yet.');
            alert('Comments workspace is still loading. Please try again in a moment.');
            setCommentsPopup(null);
            return;
        }

        setCommentsPopup({
            taskId: task.id,
            task,
            isSubtask,
            parentId: parentTask ? parentTask.id : null,
            position,
            triggerPosition
        });
        
        // Update URL to include task and comment parameters
        // Always include task when opening comments, and commentId if provided
        updateUrl({ 
            task: task.id, 
            comment: commentId || undefined 
        });
    }, [ensureCommentsPopupLoaded]);

    // List Management
    const handleAddList = useCallback(async () => {
        const ready = await ensureListModalLoaded();
        if (!ready) {
            return;
        }
        setEditingList(null);
        setShowListModal(true);
    }, [ensureListModalLoaded]);

    const handleEditList = useCallback(async (list) => {
        const ready = await ensureListModalLoaded();
        if (!ready) {
            return;
        }
        setEditingList(list);
        setShowListModal(true);
    }, [ensureListModalLoaded]);

    const handleSaveList = useCallback(async (listData) => {
        const projectId = project?.id;
        if (!projectId || !window.DatabaseAPI?.makeRequest) {
            // Fallback to local-only when API not available
            if (editingList) {
                setTaskLists(prev => prev.map(l => l.id === editingList.id ? { ...l, ...listData } : l));
            } else {
                const newList = {
                    id: Math.max(0, ...taskLists.map(l => Number(l.id) || 0)) + 1,
                    ...listData
                };
                setTaskLists(prev => [...prev, newList]);
            }
            setShowListModal(false);
            setEditingList(null);
            return;
        }
        try {
            if (editingList) {
                const listPk = editingList._pk || editingList.id;
                if (listPk && typeof listPk === 'string') {
                    const data = await window.DatabaseAPI.makeRequest(`/project-task-lists?id=${encodeURIComponent(listPk)}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            name: listData.name || editingList.name,
                            color: listData.color ?? editingList.color,
                            order: listData.order !== undefined ? listData.order : editingList.order
                        })
                    });
                    const updated = data?.data?.taskList || data?.taskList || data;
                    setTaskLists(prev => prev.map(l => l.id === editingList.id ? normalizeTaskList({ ...l, ...updated, ...listData }) : l));
                } else {
                    setTaskLists(prev => prev.map(l => l.id === editingList.id ? { ...l, ...listData } : l));
                }
            } else {
                const nextOrder = taskLists.length;
                const data = await window.DatabaseAPI.makeRequest('/project-task-lists', {
                    method: 'POST',
                    body: JSON.stringify({
                        projectId,
                        name: listData.name || 'New list',
                        color: listData.color || 'blue',
                        order: nextOrder
                    })
                });
                const taskList = data?.data?.taskList || data?.taskList || data;
                if (!taskList) throw new Error('Invalid response');
                const newList = normalizeTaskList({
                    ...taskList,
                    name: listData.name || taskList.name,
                    color: listData.color ?? taskList.color
                });
                setTaskLists(prev => [...prev, newList]);
            }
            if (window.DatabaseAPI?._responseCache) {
                const pid = project?.id;
                if (pid) {
                    window.DatabaseAPI._responseCache.delete(`GET:/projects/${pid}`);
                    window.DatabaseAPI._responseCache.delete(`GET:/projects/${pid}?summary=1`);
                }
            }
            setShowListModal(false);
            setEditingList(null);
        } catch (err) {
            console.error('❌ Error saving list:', err);
            alert('Failed to save list: ' + (err.message || 'Please try again.'));
        }
    }, [project?.id, editingList, taskLists]);

    const handleAddCustomField = (fieldData) => {
        setCustomFieldDefinitions([...customFieldDefinitions, fieldData]);
        setShowCustomFieldModal(false);
    };

    const handleDeleteList = async (listId) => {
        // Prevent deletion if it's the last list
        if (taskLists.length === 1) {
            alert('Cannot delete the last list. Projects must have at least one list.');
            return;
        }

        // Find the first remaining list (that's not the one being deleted)
        const remainingList = taskLists.find(l => l.id !== listId);
        const listToDelete = taskLists.find(l => l.id === listId);
        // CRITICAL: Ensure tasks is always an array
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        const tasksInList = safeTasks.filter(t => t.listId === listId);

        const message = tasksInList.length > 0 
            ? `Delete "${listToDelete.name}"? ${tasksInList.length} task(s) will be moved to "${remainingList.name}".`
            : `Delete "${listToDelete.name}"?`;

        if (confirm(message)) {
            try {
                // Save moved tasks to database first (only update listId)
                if (tasksInList.length > 0 && window.DatabaseAPI?.makeRequest) {
                    const savePromises = tasksInList.map(async (task) => {
                        try {
                            // Only send listId change for PATCH (API only updates provided fields)
                            const taskPayload = {
                                listId: remainingList.id // Move to remaining list
                            };
                            
                            await window.DatabaseAPI.makeRequest(`/tasks?id=${task.id}`, {
                                method: 'PATCH',
                                body: JSON.stringify(taskPayload)
                            });
                        } catch (error) {
                            console.error(`❌ Error moving task ${task.id} to new list:`, error);
                            throw error; // Re-throw to stop the process if any task fails
                        }
                    });
                    
                    await Promise.all(savePromises);
                }
                
                // Persist list deletion when list was saved to DB (_pk = table primary key)
                const listPk = listToDelete._pk;
                if (listPk && typeof listPk === 'string' && window.DatabaseAPI?.makeRequest) {
                    await window.DatabaseAPI.makeRequest(`/project-task-lists?id=${encodeURIComponent(listPk)}`, { method: 'DELETE' });
                }
                if (window.DatabaseAPI?._responseCache && project?.id) {
                    window.DatabaseAPI._responseCache.delete(`GET:/projects/${project.id}`);
                    window.DatabaseAPI._responseCache.delete(`GET:/projects/${project.id}?summary=1`);
                }
                // Update local state after successful save — use functional update to avoid stale closure
                setTasks(prev => (Array.isArray(prev) ? prev : []).map(t => t.listId === listId ? { ...t, listId: remainingList.id } : t));
                setTaskLists(prev => prev.filter(l => l.id !== listId));
            } catch (error) {
                console.error('❌ Error deleting list:', error);
                alert('Failed to delete list: ' + error.message);
            }
        }
    };

    // Task Management - Unified for both creating and editing
    const handleAddTask = useCallback(async (listId, statusName = null) => {
        const ready = await ensureTaskDetailModalLoaded();
        if (!ready) {
            alert('Task workspace is still loading. Please try again in a moment.');
            return;
        }
        // When adding from status-based Kanban, listId can be null; use first list as default
        const effectiveListId = listId ?? (taskLists && taskLists.length > 0 ? taskLists[0].id : null);
        const newTask = { listId: effectiveListId };
        if (statusName) {
            newTask.status = statusName;
            setCreatingTaskWithStatus(statusName);
        }
        setViewingTask(newTask);
        setViewingTaskParent(null);
        setCreatingTaskForList(effectiveListId);
        setShowTaskDetailModal(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskLists]);

    const handleAddSubtask = useCallback(async (parentTask) => {
        const ready = await ensureTaskDetailModalLoaded();
        if (!ready) {
            alert('Task workspace is still loading. Please try again in a moment.');
            return;
        }
        setViewingTask({ listId: parentTask.listId });
        setViewingTaskParent(parentTask);
        setCreatingTaskForList(null);
        setShowTaskDetailModal(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // ensureTaskDetailModalLoaded is stable from useCallback, no need in deps

    // Monitor URL changes to detect if something is resetting it
    useEffect(() => {
        if (!project?.id) return;
        
        let lastUrl = window.location.href;
        const checkInterval = setInterval(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== lastUrl) {
                console.log('🔍 URL changed detected:', lastUrl, '→', currentUrl);
                lastUrl = currentUrl;
                
                // If URL lost project ID or task parameter when task is open, fix it
                // BUT: Don't restore task if it was manually closed OR if the closed task ID matches
                if (viewingTask?.id && !taskManuallyClosedRef.current) {
                    // Also check if this is the task that was manually closed
                    const isClosedTask = closedTaskIdRef.current && 
                                       (viewingTask.id === closedTaskIdRef.current || 
                                        String(viewingTask.id) === String(closedTaskIdRef.current));
                    
                    if (isClosedTask) {
                        console.log('⏸️ URL monitoring: Skipping restore - this task was manually closed');
                        return;
                    }
                    
                    const hasProjectId = currentUrl.includes(project.id);
                    const hasTask = currentUrl.includes(`task=${viewingTask.id}`);
                    
                    if (!hasProjectId || !hasTask) {
                        console.warn('⚠️ URL lost project/task info, fixing...');
                        updateUrl({ task: viewingTask.id });
                    }
                }
            }
        }, 500);
        
        return () => clearInterval(checkInterval);
    }, [project?.id, viewingTask?.id, updateUrl]);

    const handleViewTaskDetail = useCallback(async (task, parentTask = null) => {
        const ready = await ensureTaskDetailModalLoaded();
        if (!ready) {
            alert('Task workspace is still loading. Please try again in a moment.');
            return;
        }
        
        if (!task?.id) {
            console.warn('⚠️ handleViewTaskDetail: Task has no ID');
            return;
        }
        
        if (!project?.id) {
            console.warn('⚠️ handleViewTaskDetail: Project has no ID');
            return;
        }
        
        console.log('🔗 Opening task:', task.id, 'for project:', project.id);
        console.log('🔗 Current URL before update:', window.location.href);
        
        // Clear the manually closed flag since user is explicitly opening a task
        // This allows normal task opening to work after closing
        taskManuallyClosedRef.current = false;
        isClosingRef.current = false;
        // Clear the closed task ID ref since user is explicitly opening a (possibly different) task
        closedTaskIdRef.current = null;
        setTaskFocusInput(null);
        
        setViewingTask(task);
        setViewingTaskParent(parentTask);
        setCreatingTaskForList(null);
        setShowTaskDetailModal(true);
        
        // CRITICAL: Update URL to include task query parameter - ALWAYS update URL when opening task
        // This MUST work regardless of RouteState or other systems
        console.log('🔗 Opening task - Current URL:', window.location.href);
        console.log('🔗 Task ID:', task.id, 'Project ID:', project.id);
        
        // Build the correct URL
        const expectedPath = `/projects/${project.id}`;
        const expectedSearch = `?task=${task.id}`;
        const expectedUrl = `${window.location.origin}${expectedPath}${expectedSearch}`;
        
        // Method 1: Direct URL manipulation using replaceState to avoid triggering route changes
        // Use replaceState instead of pushState to prevent navigation events that cause page flashes
        const url = new URL(window.location.href);
        url.pathname = expectedPath; // Always set pathname with project ID
        url.search = expectedSearch; // Always set search with task ID
        
        // Update immediately using replaceState to avoid triggering route navigation
            try {
                window.history.replaceState({}, '', url);
            console.log('✅ URL updated via replaceState (no navigation trigger):', url.href);
        } catch (e) {
            console.error('❌ replaceState failed:', e);
        }
        
        // Method 2: Also try RouteState methods (if available) for consistency
        // Use replace: true to prevent navigation events
        updateUrl({ task: task.id, clearComment: true, replace: true });
        
        // Method 3: Verify and force-fix after delay to ensure it sticks
        setTimeout(() => {
            const currentUrl = window.location.href;
            const hasProjectId = currentUrl.includes(project.id);
            const hasTask = currentUrl.includes(`task=${task.id}`);
            
            if (!hasProjectId || !hasTask) {
                console.warn('⚠️ URL verification failed! Expected:', expectedUrl);
                console.warn('⚠️ Got:', currentUrl);
                console.warn('⚠️ Has project ID:', hasProjectId, 'Has task:', hasTask);
                
                // Force update one more time with replaceState
                const fixUrl = new URL(window.location.href);
                fixUrl.pathname = expectedPath;
                fixUrl.search = expectedSearch;
                window.history.replaceState({}, '', fixUrl);
                console.log('✅ URL force-fixed:', fixUrl.href);
            } else {
                console.log('✅ URL correctly updated and verified:', window.location.href);
            }
        }, 300);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateUrl, project?.id]); // ensureTaskDetailModalLoaded is stable from useCallback, no need in deps
    
    // Helper function to close task modal and update URL
    const handleCloseTaskModal = useCallback(() => {
        // Prevent double-closing: if already closing, ignore this call
        if (isClosingRef.current) {
            console.log('⏸️ ProjectDetail: handleCloseTaskModal - already closing, ignoring duplicate call');
            return;
        }
        
        // Mark as closing
        isClosingRef.current = true;
        setTaskFocusInput(null);
        
        // CRITICAL: Set flag FIRST before any state changes or URL updates
        // This prevents any handlers from reopening the modal
        taskManuallyClosedRef.current = true;
        
        // Store the task ID that was closed to prevent reopening this specific task
        const closedTaskId = viewingTask?.id || null;
        closedTaskIdRef.current = closedTaskId;
        console.log('🔒 ProjectDetail: Marking task as closed:', closedTaskId);
        
        // Clear task state immediately (before URL updates)
        // This prevents URL monitoring effect from trying to restore task parameter
        setViewingTask(null);
        setViewingTaskParent(null);
        setCreatingTaskForList(null);
        setCreatingTaskWithStatus(null);
        setShowTaskDetailModal(false);
        
        // CRITICAL: Navigate to clean project URL (without task parameter but keep tab/section)
        // This ensures the URL reflects that we're viewing the project, not a task
        // Use RouteState.navigate as PRIMARY method to ensure routing system recognizes the change
        const projectId = String(project?.id);
        if (projectId) {
            const searchPreservingTab = (() => {
                const q = new URLSearchParams(window.location.search || (window.location.hash && window.location.hash.includes('?') ? (window.location.hash.split('?')[1] || '') : ''));
                q.delete('task');
                q.delete('commentId');
                q.delete('focusInput');
                return q.toString() ? '?' + q.toString() : '';
            })();
            const cleanProjectUrl = `${window.location.origin}/projects/${projectId}${searchPreservingTab}`;
            
            // Method 1: RouteState.navigate (PRIMARY - ensures routing system recognizes navigation)
            // Do this FIRST to ensure the routing system knows we've navigated away from the task
            if (window.RouteState && typeof window.RouteState.navigate === 'function') {
                try {
                    window.RouteState.navigate({
                        page: 'projects',
                        segments: [projectId],
                        search: searchPreservingTab,
                        preserveSearch: false,
                        preserveHash: false,
                        replace: true // Use replace to avoid adding to history
                    });
                    console.log('✅ ProjectDetail: RouteState.navigate called to clean project URL (PRIMARY METHOD)');
                } catch (e) {
                    console.warn('⚠️ Failed to update URL via RouteState:', e);
                }
            }
            
            // Method 2: Direct URL manipulation (synchronous backup)
            try {
                window.history.replaceState({}, '', cleanProjectUrl);
                console.log('✅ ProjectDetail: URL updated directly to clean project URL:', cleanProjectUrl);
            } catch (e) {
                console.warn('⚠️ Failed to update URL directly:', e);
            }
            
            // Method 3: Dispatch a route change event to notify other systems
            // This ensures all routing listeners know we've navigated away from the task
                try {
                    window.dispatchEvent(new CustomEvent('route:change', {
                        detail: {
                            page: 'projects',
                            segments: [projectId],
                            search: searchPreservingTab
                        }
                    }));
                    console.log('✅ ProjectDetail: Dispatched route:change event');
            } catch (e) {
                console.warn('⚠️ Failed to dispatch route change event:', e);
            }
            
            // Method 4: Also update via updateProjectUrl so tab is preserved when clearing task
            if (window.updateProjectUrl) {
                window.updateProjectUrl({
                    tab: activeSection && activeSection !== 'overview' ? activeSection : undefined,
                    task: null,
                    commentId: null,
                    focusInput: null
                });
            }
            
            // Method 5: Set up a persistent monitor to prevent the closed task from being restored to URL
            // This runs indefinitely to catch any delayed handlers or effects that try to restore the task
            const startPersistentMonitor = () => {
                const monitorInterval = setInterval(() => {
                    if (!closedTaskIdRef.current) {
                        // No closed task to monitor, stop checking
                        clearInterval(monitorInterval);
                        return;
                    }
                    
                    const currentSearch = window.location.search || '';
                    const currentHash = window.location.hash || '';
                    const currentParams = new URLSearchParams(currentSearch);
                    const hashParams = currentHash.includes('?') ? new URLSearchParams(currentHash.split('?')[1]) : null;
                    const taskIdInUrl = currentParams.get('task') || (hashParams && hashParams.get('task'));
                    
                    // If URL has the closed task parameter, force remove it
                    if (taskIdInUrl && (taskIdInUrl === closedTaskIdRef.current || String(taskIdInUrl) === String(closedTaskIdRef.current))) {
                        console.warn('⚠️ Persistent monitor: Detected closed task in URL, forcing clean URL');
                        window.history.replaceState({}, '', cleanProjectUrl);
                        if (window.RouteState) {
                            window.RouteState.navigate({
                                page: 'projects',
                                segments: [projectId],
                                search: searchPreservingTab,
                                preserveSearch: false,
                                preserveHash: false,
                                replace: true
                            });
                        }
                    }
                }, 2000); // Check every 2 seconds
                
                // Store interval ID so we can clear it if needed (e.g., when opening a different task)
                // For now, let it run indefinitely
            };
            
            // Start the persistent monitor after a short delay
            setTimeout(startPersistentMonitor, 1000);
            
            // Also do immediate verification checks
            const verifyAndFix = (delay) => {
                setTimeout(() => {
                    const verifySearch = window.location.search || '';
                    const verifyHash = window.location.hash || '';
                    const verifyParams = new URLSearchParams(verifySearch);
                    const verifyHashParams = verifyHash.includes('?') ? new URLSearchParams(verifyHash.split('?')[1]) : null;
                    const urlHasTask = verifyParams.get('task') || (verifyHashParams && verifyHashParams.get('task'));
                    
                    if (urlHasTask && closedTaskIdRef.current) {
                        const taskIdInUrl = verifyParams.get('task') || (verifyHashParams && verifyHashParams.get('task'));
                        const isClosedTask = taskIdInUrl === closedTaskIdRef.current || 
                                           String(taskIdInUrl) === String(closedTaskIdRef.current);
                        
                        if (isClosedTask) {
                            console.warn('⚠️ URL has closed task parameter after', delay, 'ms, forcing clean URL');
                            window.history.replaceState({}, '', cleanProjectUrl);
                            if (window.RouteState) {
                                window.RouteState.navigate({
                                    page: 'projects',
                                    segments: [projectId],
                                    search: searchPreservingTab,
                                    preserveSearch: false,
                                    preserveHash: false,
                                    replace: true
                                });
                            }
                        }
                    } else if (!urlHasTask) {
                        console.log('✅ ProjectDetail: URL verified clean after', delay, 'ms');
                    }
                }, delay);
            };
            
            verifyAndFix(100);
            verifyAndFix(500);
            verifyAndFix(2000);
            verifyAndFix(5000);
        }
        
        // Keep the flag set for a longer period to prevent any delayed handlers from reopening
        // The closedTaskIdRef will persist indefinitely - only cleared when user explicitly opens a different task
        // This prevents the same task from being reopened via deep-link after being manually closed
        const clearFlagAfterDelay = (delay) => {
            setTimeout(() => {
                // Only clear the general flag if the URL still doesn't have the task parameter
                // This ensures we don't clear it if something added the task back to the URL
                const currentSearch = window.location.search || '';
                const currentHash = window.location.hash || '';
                const currentParams = new URLSearchParams(currentSearch);
                const hashParams = currentHash.includes('?') ? new URLSearchParams(currentHash.split('?')[1]) : null;
                const urlHasTask = currentParams.get('task') || (hashParams && hashParams.get('task'));
                
                // Check if the task in URL is the closed one
                if (urlHasTask && closedTaskIdRef.current) {
                    const taskIdInUrl = currentParams.get('task') || (hashParams && hashParams.get('task'));
                    const isClosedTask = taskIdInUrl === closedTaskIdRef.current || 
                                       String(taskIdInUrl) === String(closedTaskIdRef.current);
                    
                    if (isClosedTask) {
                        console.warn('⚠️ ProjectDetail: URL has closed task parameter, forcing clean URL and keeping flags');
                        // Force clean the URL (preserve tab)
                        const cleanUrl = `${window.location.origin}/projects/${projectId}${searchPreservingTab}`;
                        window.history.replaceState({}, '', cleanUrl);
                        if (window.RouteState) {
                            window.RouteState.navigate({
                                page: 'projects',
                                segments: [projectId],
                                search: searchPreservingTab,
                                preserveSearch: false,
                                preserveHash: false,
                                replace: true
                            });
                        }
                        // Keep flags set and retry
                        clearFlagAfterDelay(delay * 2);
                        return;
                    }
                }
                
                if (!urlHasTask) {
                    taskManuallyClosedRef.current = false;
                    isClosingRef.current = false; // Allow closing again after delay
                    // Keep closedTaskIdRef set INDEFINITELY to prevent reopening the same task
                    // Only clear it when a new task is explicitly opened (handled in handleViewTaskDetail)
                    console.log('✅ ProjectDetail: Cleared taskManuallyClosedRef flag - URL confirmed clean');
                    console.log('🔒 ProjectDetail: Keeping closedTaskIdRef set indefinitely for task:', closedTaskId);
                } else {
                    console.log('⚠️ ProjectDetail: Keeping taskManuallyClosedRef flag - URL still has task parameter, will retry');
                    // Keep the flag set and try again later with exponential backoff
                    clearFlagAfterDelay(delay * 2);
                }
            }, delay);
        };
        
        // Start with 10 seconds to ensure all delayed handlers have completed
        // Then verify URL is clean before clearing the general flag
        clearFlagAfterDelay(10000);
    }, [updateUrl, project?.id]);

    const handleUpdateTaskFromDetail = async (updatedTaskData, options = {}) => {
        const { closeModal = true, sendNotifications: sendNotificationsOption = false } = options; // Default to closing modal unless explicitly set to false
        
        // CRITICAL: Ensure tasks is always an array
        const safeTasks = Array.isArray(tasks) ? tasks : [];
        // Check if this is a new task by looking for it in existing tasks
        // A task is new if:
        // 1. It has no ID (very rare, but possible), OR
        // 2. It has an ID but doesn't exist in the tasks array (or in any subtasks)
        // Note: Temporary IDs from Date.now() are fine - they won't match existing tasks
        const existingTask = safeTasks.find(t => t.id === updatedTaskData.id);
        const existingSubtask = safeTasks.find(t => 
            Array.isArray(t.subtasks) && t.subtasks.find(st => st.id === updatedTaskData.id)
        );
        const isNewTask = !updatedTaskData.id || (!existingTask && !existingSubtask);
        
        console.log('🔍 Task update check:', {
            taskId: updatedTaskData.id,
            hasId: !!updatedTaskData.id,
            foundInTasks: !!existingTask,
            foundInSubtasks: !!existingSubtask,
            isNewTask: isNewTask,
            isSubtask: !!viewingTaskParent
        });
        
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        // Find the old task to compare assignee changes
        let oldTask = null;
        if (!isNewTask) {
            if (viewingTaskParent) {
                const parentTask = tasks.find(t => t.id === viewingTaskParent.id);
                oldTask = parentTask?.subtasks?.find(st => st.id === updatedTaskData.id);
            } else {
                oldTask = tasks.find(t => t.id === updatedTaskData.id);
            }
        }
        
        // Helper function to find user by assignee value (name, email, or id)
        const findAssigneeUser = (assigneeValue) => {
            if (!assigneeValue || !users || users.length === 0) {
                return null;
            }
            
            // Try multiple matching strategies
            const assigneeLower = String(assigneeValue).toLowerCase().trim();
            
            const matchedUser = users.find(u => {
                if (!u || !u.id) return false;
                
                // Exact match by ID
                if (u.id === assigneeValue) {
                    return true;
                }
                
                // Match by name (case-insensitive)
                const userName = String(u.name || '').toLowerCase().trim();
                if (userName === assigneeLower) {
                    return true;
                }
                
                // Match by email (case-insensitive)
                const userEmail = String(u.email || '').toLowerCase().trim();
                if (userEmail === assigneeLower) {
                    return true;
                }
                
                // Partial match by name
                if (userName && assigneeLower && userName.includes(assigneeLower)) {
                    return true;
                }
                
                // Match email username (before @)
                const emailUsername = userEmail.split('@')[0];
                if (emailUsername === assigneeLower) {
                    return true;
                }
                
                return false;
            });
            
            if (matchedUser) {
            } else {
                console.warn('⚠️ findAssigneeUser: No user found', { assigneeValue, availableUsers: users.map(u => ({ id: u.id, name: u.name, email: u.email })) });
            }
            
            return matchedUser || null;
        };
        
        // Send notification if assignee changed (skip when API will send via sendNotificationsOption)
        if (!sendNotificationsOption && !isNewTask && oldTask && updatedTaskData.assignee && updatedTaskData.assignee !== oldTask.assignee) {
            
            const assigneeUser = findAssigneeUser(updatedTaskData.assignee);
            
            if (assigneeUser) {
                // Don't notify if the user assigned the task to themselves
                if (assigneeUser.id === currentUser.id) {
                } else {
                    try {
                        // Use hash-based routing format for email links (frontend uses hash routing)
                        const projectLink = `#/projects/${project.id}`;
                        // Build task-specific link with query parameter for direct navigation to task
                        const taskLink = updatedTaskData.id ? `${projectLink}?task=${updatedTaskData.id}` : projectLink;
                        
                        // Get task list name for location context (if available)
                        const taskListName = lists?.find(list => list.id === updatedTaskData.listId)?.name || null;
                        
                        const taskTitle = updatedTaskData.title || 'Untitled Task';
                        const taskDesc = (updatedTaskData.description && String(updatedTaskData.description).trim()) ? String(updatedTaskData.description).trim().slice(0, 500) : '';
                        const assignMessage = taskDesc ? `You have been assigned to "${taskTitle}". ${taskDesc}` : `You have been assigned to "${taskTitle}".`;
                        const response = await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: assigneeUser.id,
                                type: 'task',
                                title: `You have been assigned to ${taskTitle}`,
                                message: assignMessage,
                                link: taskLink, // Use task-specific link
                                metadata: {
                                    taskId: updatedTaskData.id,
                                    taskTitle: updatedTaskData.title,
                                    taskDescription: updatedTaskData.description || null,
                                    taskStatus: updatedTaskData.status || 'To Do',
                                    taskPriority: updatedTaskData.priority || 'Medium',
                                    taskDueDate: updatedTaskData.dueDate || null,
                                    taskListId: updatedTaskData.listId || null,
                                    taskListName: taskListName,
                                    projectId: project.id,
                                    projectName: project.name,
                                    clientId: project.clientId || null,
                                    assignedBy: currentUser.name
                                }
                            })
                        });
                        
                    } catch (error) {
                        console.error('❌ Failed to send task assignment notification:', error);
                        console.error('❌ Error details:', {
                            message: error.message,
                            stack: error.stack,
                            assigneeUser: assigneeUser ? { id: assigneeUser.id, name: assigneeUser.name } : null
                        });
                    }
                }
            } else {
                console.warn('⚠️ Cannot send assignment notification - assignee user not found', {
                    assignee: updatedTaskData.assignee,
                    availableUsers: users.length
                });
            }
        }
        
        // Send notification if this is a new task with an assignee (skip when API will send via sendNotificationsOption)
        if (!sendNotificationsOption && isNewTask && updatedTaskData.assignee) {
            
            const assigneeUser = findAssigneeUser(updatedTaskData.assignee);
            
            if (assigneeUser) {
                // Don't notify if the user assigned the task to themselves
                if (assigneeUser.id === currentUser.id) {
                } else {
                    try {
                        // Use hash-based routing format for email links (frontend uses hash routing)
                        const projectLink = `#/projects/${project.id}`;
                        // Build task-specific link with query parameter for direct navigation to task
                        const taskLink = updatedTaskData.id ? `${projectLink}?task=${updatedTaskData.id}` : projectLink;
                        
                        // Get task list name for location context (if available)
                        const taskListName = lists?.find(list => list.id === updatedTaskData.listId)?.name || null;
                        
                        const taskTitle = updatedTaskData.title || 'Untitled Task';
                        const taskDesc = (updatedTaskData.description && String(updatedTaskData.description).trim()) ? String(updatedTaskData.description).trim().slice(0, 500) : '';
                        const assignMessage = taskDesc ? `You have been assigned to "${taskTitle}". ${taskDesc}` : `You have been assigned to "${taskTitle}".`;
                        const response = await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: assigneeUser.id,
                                type: 'task',
                                title: `You have been assigned to ${taskTitle}`,
                                message: assignMessage,
                                link: taskLink, // Use task-specific link
                                metadata: {
                                    taskId: updatedTaskData.id,
                                    taskTitle: updatedTaskData.title,
                                    taskDescription: updatedTaskData.description || null,
                                    taskStatus: updatedTaskData.status || 'To Do',
                                    taskPriority: updatedTaskData.priority || 'Medium',
                                    taskDueDate: updatedTaskData.dueDate || null,
                                    taskListId: updatedTaskData.listId || null,
                                    taskListName: taskListName,
                                    projectId: project.id,
                                    projectName: project.name,
                                    clientId: project.clientId || null,
                                    assignedBy: currentUser.name
                                }
                            })
                        });
                        
                    } catch (error) {
                        console.error('❌ Failed to send new task assignment notification:', error);
                        console.error('❌ Error details:', {
                            message: error.message,
                            stack: error.stack,
                            assigneeUser: assigneeUser ? { id: assigneeUser.id, name: assigneeUser.name } : null
                        });
                    }
                }
            } else {
                console.warn('⚠️ Cannot send assignment notification - assignee user not found', {
                    assignee: updatedTaskData.assignee,
                    availableUsers: users.length
                });
            }
        }
        
        // Build the updated tasks array first, then use it for both state update and save
        // This ensures we're working with the correct data including new tasks
        let updatedTasks;
        let taskIdForLookup = updatedTaskData.id; // for new tasks we overwrite with tempTaskId below
        
        if (isNewTask) {
            // Always generate our own unique temp id for new tasks; do not use updatedTaskData.id from the modal (TaskDetailModal uses Date.now() which can collide when adding two tasks in the same millisecond)
            const tempTaskId = `temp-${Date.now()}-${++nextTempTaskIdRef.current}`;
            taskIdForLookup = tempTaskId;
            // CRITICAL: Ensure tasks is always an array
            const safeTasks = Array.isArray(tasks) ? tasks : [];
            if (viewingTaskParent) {
                const newSubtask = {
                    ...updatedTaskData,
                    id: tempTaskId,
                    isSubtask: true,
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                updatedTasks = safeTasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        return {
                            ...t,
                            subtasks: [...(t.subtasks || []), newSubtask]
                        };
                    }
                    return t;
                });
            } else {
                const newTask = {
                    ...updatedTaskData,
                    id: tempTaskId,
                    subtasks: Array.isArray(updatedTaskData.subtasks) ? updatedTaskData.subtasks : [],
                    status: updatedTaskData.status || 'To Do'
                };
                console.log('➕ Creating new task:', {
                    taskId: newTask.id,
                    title: newTask.title,
                    status: newTask.status,
                    listId: newTask.listId,
                    currentTasksCount: safeTasks.length
                });
                updatedTasks = [...safeTasks, newTask];
                console.log('✅ New task added to array. Updated tasks count:', updatedTasks.length);
            }
        } else {
            if (viewingTaskParent) {
                updatedTasks = safeTasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        // Find the original subtask to preserve all fields
                        const originalSubtask = (t.subtasks || []).find(st => st.id === updatedTaskData.id);
                        
                        // CRITICAL: Explicitly preserve comments array for subtasks
                        // FIXED: Always merge comments - never lose existing comments
                        const originalSubtaskComments = Array.isArray(originalSubtask?.comments) ? originalSubtask.comments : [];
                        const updatedSubtaskComments = Array.isArray(updatedTaskData.comments) ? updatedTaskData.comments : null;
                        
                        // CRITICAL FIX: Always use updatedComments if provided (even if empty array)
                        // This ensures newly added comments are never lost
                        const finalSubtaskComments = updatedSubtaskComments !== null 
                            ? updatedSubtaskComments  // Use updated comments (includes new comments)
                            : originalSubtaskComments; // Fall back to original if not provided
                        
                        const mergedSubtask = {
                            ...originalSubtask,
                            ...updatedTaskData,
                            // CRITICAL: Always set comments explicitly to ensure they're never lost
                            comments: finalSubtaskComments
                        };
                        
                        // VALIDATION: Ensure comments array is always present
                        if (!Array.isArray(mergedSubtask.comments)) {
                            console.error('❌ CRITICAL: mergedSubtask.comments is not an array!', {
                                subtaskId: mergedSubtask.id,
                                commentsType: typeof mergedSubtask.comments
                            });
                            mergedSubtask.comments = [];
                        }
                        
                        return {
                            ...t,
                            subtasks: (t.subtasks || []).map(st =>
                                st.id === updatedTaskData.id 
                                    ? mergedSubtask
                                    : st
                            )
                        };
                    }
                    return t;
                });
            } else {
                // Find the original task to preserve all fields
                const originalTask = safeTasks.find(t => t.id === updatedTaskData.id);
                
                // CRITICAL: Explicitly preserve comments array to ensure comments persist
                // FIXED: Always merge comments - never lose existing comments
                // If updatedTaskData has comments, use them (they should include all comments)
                // If not, preserve original comments
                // If both exist, prefer updatedTaskData.comments (it should be the complete list)
                const originalComments = Array.isArray(originalTask?.comments) ? originalTask.comments : [];
                const updatedComments = Array.isArray(updatedTaskData.comments) ? updatedTaskData.comments : null;
                
                // CRITICAL FIX: Always use updatedComments if provided (even if empty array)
                // This ensures newly added comments are never lost
                // Only fall back to originalComments if updatedTaskData doesn't have a comments property
                const finalComments = updatedComments !== null 
                    ? updatedComments  // Use updated comments (includes new comments)
                    : originalComments; // Fall back to original if not provided
                
                const mergedTask = {
                    ...originalTask,
                    ...updatedTaskData,
                    // CRITICAL: Always set comments explicitly to ensure they're never lost
                    comments: finalComments
                };
                
                console.log('💬 handleUpdateTaskFromDetail: Merging task with comments', {
                    taskId: updatedTaskData.id,
                    originalCommentsCount: originalComments.length,
                    updatedCommentsCount: updatedComments?.length || 0,
                    finalCommentsCount: mergedTask.comments.length,
                    hasCommentsArray: Array.isArray(mergedTask.comments),
                    usingUpdatedComments: updatedComments !== null,
                    commentIds: mergedTask.comments.map(c => c.id).filter(Boolean)
                });
                
                // VALIDATION: Ensure comments array is always present
                if (!Array.isArray(mergedTask.comments)) {
                    console.error('❌ CRITICAL: mergedTask.comments is not an array!', {
                        taskId: mergedTask.id,
                        commentsType: typeof mergedTask.comments,
                        commentsValue: mergedTask.comments
                    });
                    mergedTask.comments = [];
                }
                
                updatedTasks = safeTasks.map(t => 
                    t.id === updatedTaskData.id 
                        ? mergedTask
                        : t
                );
            }
        }
        
        // Update state with the new tasks array
        console.log('🔄 Updating tasks state. New tasks count:', updatedTasks.length);
        if (isNewTask && !viewingTaskParent) {
            const newTask = updatedTasks[updatedTasks.length - 1];
            setTasks(prev => {
                const next = [...(Array.isArray(prev) ? prev : []), newTask];
                tasksRef.current = next;
                return next;
            });
        } else {
            setTasks(prev => {
                const nextIds = new Set((updatedTasks || []).map(t => String(t?.id)).filter(Boolean));
                const prevOnly = (Array.isArray(prev) ? prev : []).filter(t => t?.id != null && !nextIds.has(String(t.id)));
                const next = prevOnly.length ? [...updatedTasks, ...prevOnly] : updatedTasks;
                tasksRef.current = next;
                return next;
            });
        }
        
        // Set flag to skip the useEffect save to prevent race condition
        // This prevents the debounced save from overwriting our immediate save
        skipNextSaveRef.current = true;
        
        // Immediately save to database to ensure checklist and other changes persist
        // Don't wait for the debounced useEffect - save immediately
        try {
            // Find the updated task to log comment info (use taskIdForLookup so new tasks are found by our temp id)
            const savedTask = updatedTasks.find(t => t.id === taskIdForLookup) || 
                            updatedTasks.find(t => (t.subtasks || []).some(st => st.id === taskIdForLookup));
            
            // CRITICAL: Validate comments before saving
            const commentsCount = savedTask?.comments?.length || 0;
            const hasCommentsArray = Array.isArray(savedTask?.comments);
            
            if (!hasCommentsArray && commentsCount > 0) {
                console.error('❌ CRITICAL: Task has comments but comments is not an array!', {
                    taskId: updatedTaskData.id,
                    commentsType: typeof savedTask?.comments,
                    expectedCommentsCount: commentsCount
                });
            }
            
            console.log('💾 Persisting task update to database...', {
                taskId: updatedTaskData.id,
                commentsInTask: commentsCount,
                hasCommentsArray: hasCommentsArray,
                totalTasksCount: updatedTasks.length,
                commentIds: savedTask?.comments?.map(c => c.id).filter(Boolean) || []
            });
            
            // CRITICAL: Ensure all tasks have valid comments arrays before saving
            let tasksNormalizedCount = 0;
            const validatedTasksForSave = updatedTasks.map(t => {
                if (!Array.isArray(t.comments)) {
                    tasksNormalizedCount++;
                    t.comments = [];
                }
                // Validate subtasks too
                if (Array.isArray(t.subtasks)) {
                    t.subtasks = t.subtasks.map(st => {
                        if (!Array.isArray(st.comments)) {
                            st.comments = [];
                        }
                        return st;
                    });
                }
                return t;
            });
            if (tasksNormalizedCount > 0) {
                console.warn('⚠️ Normalized comments array for', tasksNormalizedCount, 'task(s) before save (invalid or missing).');
            }
            
            // NEW: Save task via Task API (preferred method) — use taskIdForLookup so new tasks are found by our temp id
            const taskToSave = validatedTasksForSave.find(t => t.id === taskIdForLookup) || 
                            validatedTasksForSave.find(t => (t.subtasks || []).some(st => st.id === taskIdForLookup));
            
            if (taskToSave && window.DatabaseAPI?.makeRequest) {
                try {
                    const isSubtask = viewingTaskParent && taskToSave.id === taskIdForLookup;
                    // Slim attachments for PUT: omit dataUrl/base64 to avoid huge payloads and timeouts
                    const rawAttachments = taskToSave.attachments || [];
                    const slimAttachments = rawAttachments.map(att => {
                        if (!att || typeof att !== 'object') return att;
                        const { dataUrl, ...rest } = att;
                        return rest;
                    });

                    const taskPayload = {
                        projectId: project.id,
                        title: taskToSave.title || '',
                        description: taskToSave.description || '',
                        status: taskToSave.status || 'todo',
                        priority: taskToSave.priority || 'Medium',
                        assignee: taskToSave.assignee || '',
                        assigneeId: taskToSave.assigneeId || null,
                        assigneeIds: Array.isArray(taskToSave.assigneeIds) ? taskToSave.assigneeIds : [],
                        sendNotifications: sendNotificationsOption,
                        startDate: taskToSave.startDate || null,
                        dueDate: taskToSave.dueDate || null,
                        reminderRecurrence: (taskToSave.reminderRecurrence && taskToSave.reminderRecurrence !== 'none') ? taskToSave.reminderRecurrence : null,
                        listId: taskToSave.listId || null,
                        estimatedHours: taskToSave.estimatedHours || null,
                        actualHours: taskToSave.actualHours || null,
                        blockedBy: taskToSave.blockedBy || '',
                        tags: taskToSave.tags || [],
                        attachments: slimAttachments,
                        checklist: taskToSave.checklist || [],
                        dependencies: taskToSave.dependencies || [],
                        subscribers: taskToSave.subscribers || [],
                        customFields: taskToSave.customFields || {},
                        parentTaskId: isSubtask ? viewingTaskParent.id : null
                    };

                    if (isNewTask) {
                        // Create new task
                        console.log('📤 Creating task via Task API:', {
                            projectId: taskPayload.projectId,
                            title: taskPayload.title,
                            listId: taskPayload.listId,
                            status: taskPayload.status,
                            isSubtask: isSubtask,
                            parentTaskId: taskPayload.parentTaskId
                        });
                        
                        const response = await window.DatabaseAPI.makeRequest('/tasks', {
                            method: 'POST',
                            body: JSON.stringify(taskPayload)
                        });
                        
                        console.log('📥 Task API response:', {
                            status: response?.status,
                            hasData: !!response?.data,
                            hasTask: !!response?.data?.task,
                            taskId: response?.data?.task?.id
                        });
                        
                        const savedTask = response?.data?.task || response?.task || response?.data;
                        if (savedTask?.id) {
                            console.log('✅ Task created via Task API:', savedTask.id, isSubtask ? '(subtask)' : '(top-level)');
                            // Replace temporary task (with Date.now() ID) with saved task (with real ID) in local state
                            // The saved task from API has all the correct fields including proper structure
                            const savedTaskFormatted = {
                                ...savedTask,
                                comments: savedTask.comments || [],
                                subtasks: savedTask.subtasks || [],
                                tags: savedTask.tags || [],
                                attachments: savedTask.attachments || [],
                                checklist: savedTask.checklist || [],
                                dependencies: savedTask.dependencies || [],
                                subscribers: savedTask.subscribers || [],
                                customFields: savedTask.customFields || {}
                            };
                            const tempTaskId = taskToSave.id; // This is the temporary ID from updatedTaskData
                            // If this was a new top-level task created with draft subtasks, create each subtask via API
                            if (!isSubtask && Array.isArray(taskToSave.subtasks) && taskToSave.subtasks.length > 0) {
                                const savedSubtasks = [];
                                for (const draft of taskToSave.subtasks) {
                                    const subtaskPayload = {
                                        projectId: project.id,
                                        title: (draft.title && String(draft.title).trim()) ? String(draft.title).trim() : 'Untitled subtask',
                                        description: draft.description || '',
                                        status: draft.status || 'To Do',
                                        priority: draft.priority || 'Medium',
                                        assignee: draft.assignee || '',
                                        assigneeId: draft.assigneeId || null,
                                        startDate: draft.startDate || null,
                                        dueDate: draft.dueDate || null,
                                        reminderRecurrence: (draft.reminderRecurrence && draft.reminderRecurrence !== 'none') ? draft.reminderRecurrence : null,
                                        listId: draft.listId || savedTask.listId || null,
                                        parentTaskId: savedTask.id
                                    };
                                    try {
                                        const subRes = await window.DatabaseAPI.makeRequest('/tasks', {
                                            method: 'POST',
                                            body: JSON.stringify(subtaskPayload)
                                        });
                                        const savedSub = subRes?.data?.task || subRes?.task || subRes?.data;
                                        if (savedSub?.id) {
                                            savedSubtasks.push({
                                                ...savedSub,
                                                comments: savedSub.comments || [],
                                                tags: savedSub.tags || [],
                                                attachments: savedSub.attachments || [],
                                                checklist: savedSub.checklist || []
                                            });
                                        }
                                    } catch (subErr) {
                                        console.warn('⚠️ Failed to create subtask:', draft.title || draft.id, subErr);
                                    }
                                }
                                savedTaskFormatted.subtasks = savedSubtasks;
                            }
                            
                            if (isSubtask && viewingTaskParent) {
                                // Handle subtask: update within parent task's subtasks array
                                setTasks(prev => prev.map(t => {
                                    if (t.id === viewingTaskParent.id) {
                                        const updatedSubtasks = (t.subtasks || []).map(st => 
                                            st.id === tempTaskId ? savedTaskFormatted : st
                                        );
                                        // If subtask wasn't found, add it
                                        if (!(t.subtasks || []).find(st => st.id === tempTaskId)) {
                                            console.warn('⚠️ Temporary subtask not found in parent, adding saved subtask');
                                            updatedSubtasks.push(savedTaskFormatted);
                                        }
                                        return {
                                            ...t,
                                            subtasks: updatedSubtasks
                                        };
                                    }
                                    return t;
                                }));
                                // Also update tasksRef
                                tasksRef.current = tasksRef.current.map(t => {
                                    if (t.id === viewingTaskParent.id) {
                                        const updatedSubtasks = (t.subtasks || []).map(st => 
                                            st.id === tempTaskId ? savedTaskFormatted : st
                                        );
                                        if (!(t.subtasks || []).find(st => st.id === tempTaskId)) {
                                            updatedSubtasks.push(savedTaskFormatted);
                                        }
                                        return {
                                            ...t,
                                            subtasks: updatedSubtasks
                                        };
                                    }
                                    return t;
                                });
                            } else {
                                // Handle top-level task: update in main tasks array — replace only FIRST match so we never overwrite two tasks with the same temp id
                                setTasks(prev => {
                                    let replaced = false;
                                    const updated = prev.map(t => {
                                        if (!replaced && t.id === tempTaskId) {
                                            replaced = true;
                                            return savedTaskFormatted;
                                        }
                                        return t;
                                    });
                                    if (!replaced) {
                                        console.warn('⚠️ Temporary task not found in state, adding saved task');
                                        updated.push(savedTaskFormatted);
                                    }
                                    return updated;
                                });
                                // Also update tasksRef — replace only first match to stay in sync with state
                                let refReplaced = false;
                                tasksRef.current = tasksRef.current.map(t => {
                                    if (!refReplaced && t.id === tempTaskId) {
                                        refReplaced = true;
                                        return savedTaskFormatted;
                                    }
                                    return t;
                                });
                                if (!refReplaced) {
                                    tasksRef.current.push(savedTaskFormatted);
                                }
                            }
                        } else {
                            console.error('❌ Task creation failed: No task ID returned from API', {
                                response: response,
                                responseData: response?.data,
                                responseTask: response?.task
                            });
                            throw new Error('Task creation failed: No task ID returned from API');
                        }
                        
                        // Don't reload from server immediately - we already have the correct task data from the API response
                        // Reloading immediately can cause the task to disappear if the server hasn't indexed it yet
                        // The local state update above already has the correct task with the real ID from the database
                        loadActivityLog();
                    } else {
                        // Update existing task
                        const response = await window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(taskToSave.id)}`, {
                            method: 'PUT',
                            body: JSON.stringify(taskPayload)
                        });
                        console.log('✅ Task updated via Task API:', taskToSave.id);
                        loadActivityLog();
                    }
                } catch (taskApiError) {
                    console.error('❌ Failed to save task via Task API:', {
                        error: taskApiError,
                        errorMessage: taskApiError?.message,
                        errorStatus: taskApiError?.status,
                        errorResponse: taskApiError?.response,
                        taskData: taskPayload,
                        isNewTask: isNewTask,
                        taskId: taskToSave?.id
                    });
                    // No fallback - Task API is the only method now
                    throw taskApiError; // Re-throw to let caller handle the error
                }
            } else {
                throw new Error('Task API not available');
            }
            
            // tasksList JSON write removed - tasks are now stored in Task table via Task API above
            
            // Verify the save by checking the saved task again
            const verifyTask = validatedTasksForSave.find(t => t.id === taskIdForLookup) ||
                            validatedTasksForSave.find(t => (t.subtasks || []).some(st => st.id === taskIdForLookup));
            
            console.log('✅ Task update persisted successfully', {
                taskId: updatedTaskData.id,
                commentsCount: verifyTask?.comments?.length || 0,
                commentIds: verifyTask?.comments?.map(c => c.id).filter(Boolean) || []
            });
        } catch (error) {
            console.error('❌ Failed to save task update:', {
                error: error,
                errorMessage: error?.message,
                errorStatus: error?.status,
                errorStack: error?.stack,
                updatedTasksCount: updatedTasks.length,
                taskId: updatedTaskData.id,
                commentsCount: updatedTaskData.comments?.length || 0,
                isNewTask: isNewTask,
                taskTitle: updatedTaskData.title
            });
            
            // Revert local state changes if task creation failed — remove only the failed task by id so we don't overwrite with stale closure
            if (isNewTask) {
                console.log('🔄 Reverting local state changes due to creation failure');
                setTasks(prev => prev.filter(t => t.id !== taskIdForLookup));
                tasksRef.current = (tasksRef.current || []).filter(t => t.id !== taskIdForLookup);
            }
            
            // Show user-friendly error message
            const errorMsg = error?.message || 'Unknown error';
            const statusMsg = error?.status ? ` (Status: ${error.status})` : '';
            alert(`Failed to ${isNewTask ? 'create' : 'save'} task: ${errorMsg}${statusMsg}. Please try again or refresh the page.`);
            // Don't block UI - user can try again
        } finally {
            // Reset flag after a delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 500);
        }
        
        // Only close modal if closeModal option is true (default behavior for Save Changes button)
        if (closeModal) {
            console.log('🔒 Closing task modal...');
            handleCloseTaskModal();
        } else {
            console.log('💾 Task updated (auto-save), keeping modal open');
        }
    };

    const handleDeleteTask = async (taskId) => {
        if (!taskId) {
            console.error('❌ Cannot delete task: taskId is missing');
            alert('Cannot delete task: Missing task ID');
            return;
        }
        
        // Prevent duplicate deletions of the same task
        const taskIdString = String(taskId);
        if (deletingTaskIdRef.current === taskIdString) {
            console.warn('⚠️ Task deletion already in progress, ignoring duplicate call:', taskIdString);
            return;
        }
        
        // Set deletion guard immediately to prevent duplicate calls
        // Note: Confirm dialog is shown in TaskDetailModal, not here
        deletingTaskIdRef.current = taskIdString;
        
        let deleteSuccessful = false;
        try {
            // NEW: Delete via Task API first (cascades to subtasks)
            if (window.DatabaseAPI?.makeRequest) {
                const deleteUrl = `/tasks?id=${encodeURIComponent(String(taskId))}`;
                console.log('🗑️ Deleting task via Task API:', {
                    taskId: taskId,
                    url: deleteUrl
                });
                
                try {
                    const deleteResponse = await window.DatabaseAPI.makeRequest(deleteUrl, {
                        method: 'DELETE'
                    });
                    console.log('✅ Task deleted via Task API:', {
                        taskId: taskId,
                        response: deleteResponse
                    });
                    deleteSuccessful = true;
                } catch (deleteError) {
                    console.error('❌ Task deletion error:', {
                        taskId: taskId,
                        error: deleteError,
                        errorMessage: deleteError?.message,
                        errorStatus: deleteError?.status,
                        errorResponse: deleteError?.response
                    });
                    
                    // Handle 404 gracefully - task might already be deleted
                    const errorStatus = deleteError?.status || 
                                      (deleteError?.message?.includes('404') || 
                                       deleteError?.message?.includes('not found') || 
                                       deleteError?.message?.includes('Task not found') ? 404 : null);
                    if (errorStatus === 404) {
                        console.warn('⚠️ Task not found (may have already been deleted):', taskId);
                        deleteSuccessful = true; // Treat as success since task is gone
                        // Continue with local state cleanup even if task was already deleted
                    } else {
                        // Re-throw other errors to be caught by outer catch
                        throw deleteError;
                    }
                }
            } else {
                throw new Error('Task API not available - DatabaseAPI.makeRequest is not defined');
            }
            
            // Filter out the task and all its subtasks from local state using functional update to avoid stale closure
            setTasks(prevTasks => {
                // CRITICAL: Ensure prevTasks is always an array
                const safePrevTasks = Array.isArray(prevTasks) ? prevTasks : [];
                const updatedTasks = safePrevTasks.filter(t => t.id !== taskId);
                tasksRef.current = updatedTasks; // Update ref with same data
                return updatedTasks;
            });
            
            // Set flag to skip the useEffect save to prevent race condition
            skipNextSaveRef.current = true;
            
            // Don't reload from server immediately - we already updated local state correctly
            // Reloading immediately can cause the task to reappear if the server hasn't processed the deletion yet
            
            // tasksList JSON write removed - task deletion handled by Task API above
            console.log('✅ Task deleted successfully');
            if (window.DatabaseAPI?.invalidateTasksCache) window.DatabaseAPI.invalidateTasksCache();
            const pid = project?.id;
            if (pid && window.DatabaseAPI?._responseCache) {
                window.DatabaseAPI._responseCache.delete(`GET:/projects/${pid}`);
                window.DatabaseAPI._responseCache.delete(`GET:/projects/${pid}?summary=1`);
            }
            // Close task modal if the deleted task is currently being viewed
            if (viewingTask?.id === taskId) {
                handleCloseTaskModal();
            }
        } catch (taskApiError) {
                console.error('❌ Failed to delete task via Task API:', {
                    taskId: taskId,
                    error: taskApiError,
                    errorMessage: taskApiError?.message,
                    errorStatus: taskApiError?.status,
                    errorStack: taskApiError?.stack
                });
                
                // Check if it's a 404 (task not found) - handle more gracefully
                const errorStatus = taskApiError?.status || 
                                  (taskApiError?.message?.includes('404') || 
                                   taskApiError?.message?.includes('not found') || 
                                   taskApiError?.message?.includes('Task not found') ? 404 : null);
                if (errorStatus === 404) {
                    // Task not found - might already be deleted, so just update local state
                    // CRITICAL: Ensure tasks is always an array
                    const safeTasks = Array.isArray(tasks) ? tasks : [];
                    const updatedTasks = safeTasks.filter(t => t.id !== taskId);
                    setTasks(updatedTasks);
                    tasksRef.current = updatedTasks;
                    
                    if (viewingTask?.id === taskId) {
                        handleCloseTaskModal();
                    }
                    
                    console.log('⚠️ Task was not found (may have already been deleted). Local state updated.');
                } else {
                    // For other errors, show alert but don't update state
                    const errorMsg = taskApiError?.message || 'Unknown error';
                    alert(`Failed to delete task: ${errorMsg}. Please try again or refresh the page.`);
                    console.error('Task deletion error details:', taskApiError);
                    // Don't re-throw to avoid unhandled promise rejection - error has been handled via alert
                }
        } finally {
            // Always clear the deletion guard, even if there was an error
            if (deletingTaskIdRef.current === taskIdString) {
                deletingTaskIdRef.current = null;
            }
            // Reset flag after a delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 500);
        }
    };

    const handleDeleteSubtask = async (parentTaskId, subtaskId) => {
        try {
            // NEW: Delete subtask via Task API first
            if (window.DatabaseAPI?.makeRequest) {
                await window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(subtaskId)}`, {
                    method: 'DELETE'
                });
                console.log('✅ Subtask deleted via Task API:', subtaskId);
            } else {
                throw new Error('Task API not available');
            }
            
            // Confirmation is handled by the modal UI, so we proceed directly
            // CRITICAL: Ensure tasks is always an array
            const safeTasks = Array.isArray(tasks) ? tasks : [];
            const updatedTasks = safeTasks.map(t => {
                if (t.id === parentTaskId) {
                    return {
                        ...t,
                        subtasks: (t.subtasks || []).filter(st => st.id !== subtaskId)
                    };
                }
                return t;
            });
            
            // Update local state and ref
            setTasks(updatedTasks);
            tasksRef.current = updatedTasks;
            
            // Set flag to skip the useEffect save to prevent race condition
            skipNextSaveRef.current = true;
            
            // Reload tasks from server to ensure consistency (subtasks will be included in parent task's subtasks array)
            if (project?.id && window.DatabaseAPI?.makeRequest) {
                try {
                    const tasksResponse = await window.DatabaseAPI.makeRequest(`/tasks?projectId=${encodeURIComponent(project.id)}&includeComments=true`, {
                        method: 'GET'
                    });
                    const fetchedTasks = tasksResponse?.data?.tasks || tasksResponse?.tasks || [];
                    if (Array.isArray(fetchedTasks) && fetchedTasks.length >= 0) {
                        console.log('✅ Refreshed tasks from server after subtask deletion. Task count:', fetchedTasks.length);
                        setTasks(prev => mergeTaskComments(prev, fetchedTasks));
                        tasksRef.current = mergeTaskComments(tasksRef.current || [], fetchedTasks);
                    }
                } catch (refreshError) {
                    console.warn('⚠️ Failed to refresh tasks after subtask deletion, using local state:', refreshError);
                    // Continue with local state update - deletion should still work
                }
            }
            
            // tasksList JSON write removed - subtask deletion handled by Task API above
            console.log('✅ Subtask deleted successfully');
        } catch (taskApiError) {
            console.error('❌ Failed to delete subtask via Task API:', taskApiError);
            alert('Failed to delete subtask. Please try again.');
            throw taskApiError;
        } finally {
            // Reset flag after a delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 500);
        }
    };

    // Document Collection Management
    const handleAddDocument = () => {
        setEditingDocument(null);
        setShowDocumentModal(true);
    };

    const handleAddTimeProcess = async () => {
        hasTimeProcessChangedRef.current = true;
        setHasTimeProcess(true);
        switchSection('time');
        setShowDocumentProcessDropdown(false);
        try {
            // Persist hasTimeProcess immediately so it survives hard refresh. Send a minimal PUT first to guarantee the backend gets it.
            if (window.DatabaseAPI?.updateProject && project?.id) {
                try {
                    await window.DatabaseAPI.updateProject(project.id, { hasTimeProcess: true });
                } catch (directErr) {
                    console.warn('Time tab: direct hasTimeProcess update failed, trying full persist:', directErr?.message);
                }
            }
            await persistProjectData({ nextHasTimeProcess: true });
            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                window.updateViewingProject({ ...project, hasTimeProcess: true });
            }
        } finally {
            hasTimeProcessChangedRef.current = false;
        }
    };

    const handleAddDocumentCollectionProcess = async () => {
        
        try {
            // Cancel any pending debounced saves to prevent overwriting
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            
            // Set flag to skip the useEffect save to prevent duplicates
            skipNextSaveRef.current = true;
            // Mark that hasDocumentCollectionProcess was explicitly changed
            hasDocumentCollectionProcessChangedRef.current = true;
            
            // Update state first
            setHasDocumentCollectionProcess(true);
            switchSection('documentCollection');
            setShowDocumentProcessDropdown(false);
            
            // Immediately save to database to ensure persistence
            // Ensure documentSections is properly serialized
            const sectionsToSave = documentSectionsArray && documentSectionsArray.length > 0 
                ? JSON.stringify(documentSectionsArray) 
                : '[]';
            
            const updatePayload = {
                hasDocumentCollectionProcess: true,
                documentSections: sectionsToSave
            };
            
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            
            // Reload project from database to ensure state is in sync
            // Also clear any cache to ensure we get fresh data
            if (window.DatabaseAPI && typeof window.DatabaseAPI.getProject === 'function') {
                try {
                    // Clear cache for this project to ensure we get fresh data
                    if (window.DatabaseAPI._responseCache) {
                        const cacheKeysToDelete = [];
                        window.DatabaseAPI._responseCache.forEach((value, key) => {
                            if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) {
                                cacheKeysToDelete.push(key);
                            }
                        });
                        cacheKeysToDelete.forEach(key => {
                            window.DatabaseAPI._responseCache.delete(key);
                        });
                    }
                    
                    // Also clear projects list cache to ensure fresh data
                    if (window.DatabaseAPI._responseCache) {
                        const projectsListCacheKeys = [];
                        window.DatabaseAPI._responseCache.forEach((value, key) => {
                            if (key.includes('/projects') && !key.includes(`/projects/${project.id}`)) {
                                projectsListCacheKeys.push(key);
                            }
                        });
                        projectsListCacheKeys.forEach(key => {
                            window.DatabaseAPI._responseCache.delete(key);
                        });
                    }
                    
                    // Only reload and update if we're not in document collection view
                    // (document collection manages its own state and updates)
                    const isDocumentCollectionView = activeSection === 'documentCollection';
                    
                    if (!isDocumentCollectionView) {
                        const refreshedProject = await window.DatabaseAPI.getProject(project.id);
                        const updatedProject = refreshedProject?.data?.project || refreshedProject?.project || refreshedProject?.data;
                        if (updatedProject) {
                            // Update the project prop by triggering a re-render with updated data
                            // This ensures the component has the latest data from the database
                            
                            // Try to update parent component's viewingProject state if possible
                            // This ensures the prop is updated immediately
                            // The updateViewingProject function has smart comparison to prevent unnecessary re-renders
                            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                                window.updateViewingProject(updatedProject);
                            }
                        }
                    } else {
                    }
                } catch (reloadError) {
                    console.warn('⚠️ Failed to reload project after save:', reloadError);
                }
            }
            
            // Also update localStorage for consistency
            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                const savedProjects = await window.dataService.getProjects();
                if (savedProjects) {
                    const updatedProjects = savedProjects.map(p => {
                        if (p.id !== project.id) return p;
                        const normalizedSections = Array.isArray(p.documentSections)
                            ? p.documentSections
                            : documentSectionsArray;
                        return { 
                            ...p, 
                            hasDocumentCollectionProcess: true,
                            documentSections: normalizedSections
                        };
                    });
                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                        try {
                            await window.dataService.setProjects(updatedProjects);
                        } catch (saveError) {
                            console.warn('Failed to save projects to dataService:', saveError);
                        }
                    }
                }
            }
            
            
            // Keep the flag set for longer to prevent any debounced saves from overwriting
            // Reset flag after a delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 3000);
            
            // Keep the changed flag set for even longer to prevent sync from overwriting
            // This ensures that when we navigate back, the value from the database will be used
            // But we don't want to reset it too early, or the sync might overwrite it
            setTimeout(() => {
                hasDocumentCollectionProcessChangedRef.current = false;
            }, 10000); // Increased to 10 seconds to ensure navigation completes
        } catch (error) {
            console.error('❌ Error saving document collection process:', error);
            alert('Failed to save document collection process: ' + error.message);
            // Revert state on error
            setHasDocumentCollectionProcess(false);
            skipNextSaveRef.current = false;
        }
    };

    const handleAddMonthlyDataReviewProcess = async () => {
        try {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            skipNextSaveRef.current = true;
            hasMonthlyDataReviewProcessChangedRef.current = true;
            setHasMonthlyDataReviewProcess(true);
            switchSection('monthlyDataReview');
            setShowDocumentProcessDropdown(false);
            const updatePayload = {
                hasMonthlyDataReviewProcess: true,
                monthlyDataReviewSections: '{}'
            };
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            if (!apiResponse) throw new Error('API returned no response');
            if (apiResponse.error || (apiResponse.data && apiResponse.data.error)) {
                const msg = apiResponse.error || (apiResponse.data && apiResponse.data.error) || 'Unknown error';
                throw new Error(typeof msg === 'string' ? msg : msg.message || 'API error');
            }
            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                window.updateViewingProject({ ...project, hasMonthlyDataReviewProcess: true, monthlyDataReviewSections: '{}' });
            }
            if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
                const keysToDelete = [];
                window.DatabaseAPI._responseCache.forEach((_, key) => {
                    if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) keysToDelete.push(key);
                });
                keysToDelete.forEach(k => window.DatabaseAPI._responseCache.delete(k));
            }
        } catch (error) {
            console.error('Error adding Monthly Data Review process:', error);
            alert('Failed to add Monthly Data Review: ' + (error.message || 'Unknown error'));
            hasMonthlyDataReviewProcessChangedRef.current = false;
            setHasMonthlyDataReviewProcess(false);
        } finally {
            skipNextSaveRef.current = false;
        }
    };

    const handleAddComplianceReviewProcess = async () => {
        try {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            skipNextSaveRef.current = true;
            hasComplianceReviewProcessChangedRef.current = true;
            setHasComplianceReviewProcess(true);
            switchSection('complianceReview');
            setShowDocumentProcessDropdown(false);
            const updatePayload = {
                hasComplianceReviewProcess: true,
                complianceReviewSections: '{}'
            };
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            if (!apiResponse) throw new Error('API returned no response');
            if (apiResponse.error || (apiResponse.data && apiResponse.data.error)) {
                const msg = apiResponse.error || (apiResponse.data && apiResponse.data.error) || 'Unknown error';
                throw new Error(typeof msg === 'string' ? msg : msg.message || 'API error');
            }
            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                window.updateViewingProject({ ...project, hasComplianceReviewProcess: true, complianceReviewSections: '{}' });
            }
            if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
                const keysToDelete = [];
                window.DatabaseAPI._responseCache.forEach((_, key) => {
                    if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) keysToDelete.push(key);
                });
                keysToDelete.forEach(k => window.DatabaseAPI._responseCache.delete(k));
            }
        } catch (error) {
            console.error('Error adding Compliance Review process:', error);
            alert('Failed to add Compliance Review: ' + (error.message || 'Unknown error'));
            hasComplianceReviewProcessChangedRef.current = false;
            setHasComplianceReviewProcess(false);
        } finally {
            skipNextSaveRef.current = false;
        }
    };
    
    const handleAddMonthlyFMSReviewProcess = async () => {
        console.log('🟢 ProjectDetail: Adding Monthly FMS Review process', {
            projectId: project.id,
            currentHasMonthlyFMSReviewProcess: hasMonthlyFMSReviewProcess,
            projectHasProcess: project.hasMonthlyFMSReviewProcess
        });
        
        try {
            // Cancel any pending debounced saves to prevent overwriting
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            
            // Set flag to skip the useEffect save to prevent duplicates
            skipNextSaveRef.current = true;
            // Mark that hasMonthlyFMSReviewProcess was explicitly changed
            hasMonthlyFMSReviewProcessChangedRef.current = true;
            
            // Update state first
            setHasMonthlyFMSReviewProcess(true);
            setShowDocumentProcessDropdown(false);
            
            // Switch to monthly FMS review section
            console.log('🔄 Switching to monthlyFMSReview section');
            switchSection('monthlyFMSReview');
            
            // Immediately save to database to ensure persistence
            // Ensure monthlyFMSReviewSections is properly serialized
            const sectionsToSave = '[]';
            
            const updatePayload = {
                hasMonthlyFMSReviewProcess: true,
                monthlyFMSReviewSections: sectionsToSave
            };
            
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            
            // Validate API response
            if (!apiResponse) {
                throw new Error('API returned no response');
            }
            
            // Check if the response indicates an error
            if (apiResponse.error || (apiResponse.data && apiResponse.data.error)) {
                const errorMessage = apiResponse.error || apiResponse.data?.error || 'Unknown error';
                throw new Error(`API error: ${errorMessage}`);
            }
            
            console.log('✅ API update successful:', apiResponse);
            
            // Update parent immediately so the Monthly FMS Review tab persists on navigation/refresh
            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                window.updateViewingProject({ ...project, hasMonthlyFMSReviewProcess: true });
            }
            
            // Clear cache for this project to ensure fresh data
            if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
                try {
                    const cacheKeysToDelete = [];
                    window.DatabaseAPI._responseCache.forEach((value, key) => {
                        if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) {
                            cacheKeysToDelete.push(key);
                        }
                    });
                    cacheKeysToDelete.forEach(key => {
                        window.DatabaseAPI._responseCache.delete(key);
                    });
                } catch (cacheError) {
                    console.warn('⚠️ Failed to clear cache after adding monthly FMS review process:', cacheError);
                }
            }
            
            // Reload project from database to ensure state is in sync
            // This updates the project prop so the tab appears immediately
            if (window.DatabaseAPI && typeof window.DatabaseAPI.getProject === 'function') {
                try {
                    const refreshedProject = await window.DatabaseAPI.getProject(project.id);
                    const updatedProject = refreshedProject?.data?.project || refreshedProject?.project || refreshedProject?.data;
                    if (updatedProject) {
                        console.log('🔄 Reloaded project from database:', {
                            hasMonthlyFMSReviewProcess: updatedProject.hasMonthlyFMSReviewProcess,
                            type: typeof updatedProject.hasMonthlyFMSReviewProcess,
                            isTrue: updatedProject.hasMonthlyFMSReviewProcess === true
                        });
                        
                        // Update the project prop by triggering a re-render with updated data
                        // This ensures the component has the latest data from the database
                        // and the tab appears immediately
                        if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                            console.log('🔄 Updating parent viewingProject state');
                            window.updateViewingProject(updatedProject);
                        } else {
                            console.warn('⚠️ window.updateViewingProject is not available');
                        }
                    } else {
                        console.warn('⚠️ Failed to get updated project from API response');
                    }
                } catch (reloadError) {
                    console.warn('⚠️ Failed to reload project after adding monthly FMS review process:', reloadError);
                }
            } else {
                console.warn('⚠️ window.DatabaseAPI.getProject is not available');
            }
            
            console.log('✅ Monthly FMS Review process added successfully');
        } catch (error) {
            console.error('❌ Error adding Monthly FMS Review process:', error);
            alert('Failed to add Monthly FMS Review process: ' + error.message);
            // Revert state on error
            setHasMonthlyFMSReviewProcess(false);
            hasMonthlyFMSReviewProcessChangedRef.current = false;
        }
    };

    const handleAddWeeklyFMSReviewProcess = async () => {
        console.log('🟢 ProjectDetail: Adding Weekly FMS Review process', {
            projectId: project.id,
            currentHasWeeklyFMSReviewProcess: hasWeeklyFMSReviewProcess
        });
        
        try {
            // Cancel any pending debounced saves to prevent overwriting
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            
            // Set flag to skip the useEffect save to prevent duplicates
            skipNextSaveRef.current = true;
            // Mark that hasWeeklyFMSReviewProcess was explicitly changed
            hasWeeklyFMSReviewProcessChangedRef.current = true;
            
            // Update state first
            setHasWeeklyFMSReviewProcess(true);
            switchSection('weeklyFMSReview');
            setShowDocumentProcessDropdown(false);
            
            // Immediately save to database to ensure persistence
            // Ensure weeklyFMSReviewSections is properly serialized
            const sectionsToSave = '[]';
            
            const updatePayload = {
                hasWeeklyFMSReviewProcess: true,
                weeklyFMSReviewSections: sectionsToSave
            };
            
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            
            // Reload project from database to ensure state is in sync
            // Also clear any cache to ensure we get fresh data
            if (window.DatabaseAPI && typeof window.DatabaseAPI.getProject === 'function') {
                try {
                    // Clear cache for this project to ensure we get fresh data
                    if (window.DatabaseAPI._responseCache) {
                        const cacheKeysToDelete = [];
                        window.DatabaseAPI._responseCache.forEach((value, key) => {
                            if (key.includes(`/projects/${project.id}`) || key.includes(`projects/${project.id}`)) {
                                cacheKeysToDelete.push(key);
                            }
                        });
                        cacheKeysToDelete.forEach(key => {
                            window.DatabaseAPI._responseCache.delete(key);
                        });
                    }
                    
                    // Also clear projects list cache to ensure fresh data
                    if (window.DatabaseAPI._responseCache) {
                        const projectsListCacheKeys = [];
                        window.DatabaseAPI._responseCache.forEach((value, key) => {
                            if (key.includes('/projects') && !key.includes(`/projects/${project.id}`)) {
                                projectsListCacheKeys.push(key);
                            }
                        });
                        projectsListCacheKeys.forEach(key => {
                            window.DatabaseAPI._responseCache.delete(key);
                        });
                    }
                    
                    // Only reload and update if we're not in weekly FMS review view
                    // (weekly FMS review manages its own state and updates)
                    const isWeeklyFMSReviewView = activeSection === 'weeklyFMSReview';
                    
                    if (!isWeeklyFMSReviewView) {
                        const refreshedProject = await window.DatabaseAPI.getProject(project.id);
                        const updatedProject = refreshedProject?.data?.project || refreshedProject?.project || refreshedProject?.data;
                        if (updatedProject) {
                            // Update the project prop by triggering a re-render with updated data
                            // This ensures the component has the latest data from the database
                            
                            // Try to update parent component's viewingProject state if possible
                            // This ensures the prop is updated immediately
                            // The updateViewingProject function has smart comparison to prevent unnecessary re-renders
                            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                                window.updateViewingProject(updatedProject);
                            }
                        }
                    } else {
                        // We're in weekly FMS review view - just update parent component directly
                        // The weekly FMS review tracker will handle its own state updates
                        if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                            // Use the response from the updateProject call
                            const updatedProject = apiResponse?.data?.project || apiResponse?.project || apiResponse?.data;
                            if (updatedProject) {
                                window.updateViewingProject({
                                    ...updatedProject,
                                    hasWeeklyFMSReviewProcess: true,
                                    weeklyFMSReviewSections: sectionsToSave
                                });
                            }
                        }
                    }
                } catch (reloadError) {
                    console.warn('⚠️ Failed to reload project after save:', reloadError);
                }
            }
            
            // Also update localStorage for consistency
            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                const savedProjects = await window.dataService.getProjects();
                if (savedProjects) {
                    const updatedProjects = savedProjects.map(p => {
                        if (p.id !== project.id) return p;
                        return { 
                            ...p, 
                            hasWeeklyFMSReviewProcess: true,
                            weeklyFMSReviewSections: []
                        };
                    });
                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                        try {
                            await window.dataService.setProjects(updatedProjects);
                        } catch (saveError) {
                            console.warn('Failed to save projects to dataService:', saveError);
                        }
                    }
                }
            }
            
            
            // Keep the flag set for longer to prevent any debounced saves from overwriting
            // Reset flag after a delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 3000);
            
            // Keep the changed flag set for even longer to prevent sync from overwriting
            // This ensures that when we navigate back, the value from the database will be used
            // But we don't want to reset it too early, or the sync might overwrite it
            setTimeout(() => {
                hasWeeklyFMSReviewProcessChangedRef.current = false;
            }, 10000); // Increased to 10 seconds to ensure navigation completes
        } catch (error) {
            console.error('❌ Error saving weekly FMS review process:', error);
            alert('Failed to save weekly FMS review process: ' + error.message);
            // Revert state on error
            setHasWeeklyFMSReviewProcess(false);
            skipNextSaveRef.current = false;
        }
    };

    const handleEditDocument = (doc) => {
        setEditingDocument(doc);
        setShowDocumentModal(true);
    };

    const handleSaveDocument = (docData) => {
        if (editingDocument) {
            setDocuments(documents.map(d => 
                d.id === editingDocument.id ? { ...d, ...docData } : d
            ));
        } else {
            const newDoc = {
                ...docData,
                id: Date.now(),
                status: 'Pending',
                submittedDate: null,
                submittedBy: null,
                fileUrl: null,
                fileName: null,
                comments: [],
                createdAt: new Date().toISOString()
            };
            setDocuments([...documents, newDoc]);
        }
        setShowDocumentModal(false);
        setEditingDocument(null);
    };

    const handleDeleteDocument = (docId) => {
        if (confirm('Delete this document request?')) {
            setDocuments(documents.filter(d => d.id !== docId));
        }
    };

    const handleUpdateDocumentStatus = (docId, newStatus) => {
        setDocuments(documents.map(d => 
            d.id === docId ? { ...d, status: newStatus } : d
        ));
    };

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'High': return 'bg-red-100 text-red-800';
            case 'Medium': return 'bg-yellow-100 text-yellow-800';
            case 'Low': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Done': return 'bg-green-100 text-green-800 border-green-500';
            case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-500';
            case 'Review': return 'bg-blue-100 text-blue-800 border-blue-500';
            case 'Blocked': return 'bg-red-100 text-red-800 border-red-500';
            case 'Archived': return 'bg-gray-200 text-gray-600 border-gray-400';
            case 'To Do': return 'bg-gray-100 text-gray-800 border-gray-500';
            default: return 'bg-gray-100 text-gray-800 border-gray-500';
        }
    };
    
    // Handler for updating task status when dragged in kanban (or list view)
    const handleUpdateTaskStatus = useCallback(async (taskId, newStatus, { isSubtask = false, parentId = null } = {}) => {
        const prevTasks = tasksRef.current || [];
        
        // Normalize status - KanbanView passes the column label
        let normalizedStatus = newStatus;
        if (taskLists && taskLists.length > 0) {
            for (const list of taskLists) {
                if (list.statuses && Array.isArray(list.statuses)) {
                    const matchingStatus = list.statuses.find(s => {
                        const statusLabel = String(s.label || '').toLowerCase();
                        const statusValue = String(s.value || '').toLowerCase();
                        const newStatusLower = String(newStatus || '').toLowerCase();
                        return statusLabel === newStatusLower || statusValue === newStatusLower;
                    });
                    if (matchingStatus) {
                        normalizedStatus = matchingStatus.value || matchingStatus.label || newStatus;
                        break;
                    }
                }
            }
        }
        
        // Find list whose name matches the new status so List view section stays in sync (listId drives list grouping)
        const statusList = taskLists?.find(list => {
            const name = String(list.name || '').toLowerCase();
            const norm = String(normalizedStatus || '').toLowerCase().replace(/\s+/g, ' ');
            return name === norm || name.replace(/\s+/g, '') === norm.replace(/\s+/g, '');
        });
        const newListId = statusList?.id ?? undefined;
        
        // Compute new state (don't rely on setState callback - React may defer it)
        let newTasks;
        if (isSubtask && parentId) {
            newTasks = prevTasks.map(t => {
                if (t.id === parentId || String(t.id) === String(parentId)) {
                    const updatedSubtasks = (t.subtasks || []).map(st =>
                        (st.id === taskId || String(st.id) === String(taskId))
                            ? { ...st, status: normalizedStatus }
                            : st
                    );
                    return { ...t, subtasks: updatedSubtasks };
                }
                return t;
            });
        } else {
            newTasks = prevTasks.map(t =>
                (t.id === taskId || String(t.id) === String(taskId))
                    ? { ...t, status: normalizedStatus, ...(newListId != null ? { listId: newListId } : {}) }
                    : t
            );
        }
        
        setTasks(newTasks);
        tasksRef.current = newTasks;
        
        if (!window.DatabaseAPI?.makeRequest) return;
        
        try {
            const payload = {
                status: normalizedStatus,
                projectId: project?.id
            };
            if (!isSubtask && newListId != null) payload.listId = newListId;
            
            await window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(taskId)}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            console.log('✅ Task status updated via Task API:', taskId, normalizedStatus);
        } catch (error) {
            console.error('❌ Failed to save task status update via Task API:', error);
            setTasks(prevTasks);
            tasksRef.current = prevTasks;
            alert('Failed to save task status. Please try again.');
        }
    }, [taskLists, project?.id]);

    const handleArchiveTask = useCallback(async (taskId) => {
        const normalized = 'Archived';
        await handleUpdateTaskStatus(taskId, normalized);
    }, [handleUpdateTaskStatus]);

    // Reorder tasks within a list (swap order with previous/next task)
    const handleMoveTaskUp = useCallback(async (list, taskIndex) => {
        if (taskIndex <= 0 || !list?.tasks?.length) return;
        const items = list.tasks;
        const current = items[taskIndex];
        const prev = items[taskIndex - 1];
        if (!current?.task || !prev?.task) return;
        const currentOrder = current.task.order ?? taskIndex;
        const prevOrder = prev.task.order ?? taskIndex - 1;
        const prevTasks = tasksRef.current || [];
        const newTasks = prevTasks.map(t => {
            if (t.id === current.task.id) return { ...t, order: prevOrder };
            if (t.id === prev.task.id) return { ...t, order: currentOrder };
            return t;
        });
        setTasks(newTasks);
        tasksRef.current = newTasks;
        if (window.DatabaseAPI?.makeRequest) {
            try {
                await Promise.all([
                    window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(current.task.id)}`, { method: 'PATCH', body: JSON.stringify({ order: prevOrder }) }),
                    window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(prev.task.id)}`, { method: 'PATCH', body: JSON.stringify({ order: currentOrder }) })
                ]);
            } catch (err) {
                console.error('Failed to save task order:', err);
                setTasks(prevTasks);
                tasksRef.current = prevTasks;
                alert('Failed to save order. Please try again.');
            }
        }
    }, []);

    const handleMoveTaskDown = useCallback(async (list, taskIndex) => {
        if (taskIndex < 0 || !list?.tasks?.length || taskIndex >= list.tasks.length - 1) return;
        const items = list.tasks;
        const current = items[taskIndex];
        const next = items[taskIndex + 1];
        if (!current?.task || !next?.task) return;
        const currentOrder = current.task.order ?? taskIndex;
        const nextOrder = next.task.order ?? taskIndex + 1;
        const prevTasks = tasksRef.current || [];
        const newTasks = prevTasks.map(t => {
            if (t.id === current.task.id) return { ...t, order: nextOrder };
            if (t.id === next.task.id) return { ...t, order: currentOrder };
            return t;
        });
        setTasks(newTasks);
        tasksRef.current = newTasks;
        if (window.DatabaseAPI?.makeRequest) {
            try {
                await Promise.all([
                    window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(current.task.id)}`, { method: 'PATCH', body: JSON.stringify({ order: nextOrder }) }),
                    window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(next.task.id)}`, { method: 'PATCH', body: JSON.stringify({ order: currentOrder }) })
                ]);
            } catch (err) {
                console.error('Failed to save task order:', err);
                setTasks(prevTasks);
                tasksRef.current = prevTasks;
                alert('Failed to save order. Please try again.');
            }
        }
    }, []);

    // Drag-and-drop reorder (same list only)
    const handleTaskDragStart = useCallback((list, taskIndex, e) => {
        taskDragRef.current = { listId: list.id, taskIndex };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', list.tasks[taskIndex]?.task?.id || '');
        e.dataTransfer.setData('application/json', JSON.stringify({ listId: list.id, taskIndex }));
        setTimeout(() => {
            if (e.currentTarget) e.currentTarget.style.opacity = '0.5';
        }, 0);
    }, []);

    const handleTaskDragEnd = useCallback((e) => {
        if (e.currentTarget) e.currentTarget.style.opacity = '1';
        taskDragRef.current = null;
        setDragOverTask(null);
    }, []);

    const handleTaskDragOver = useCallback((e, list, taskIndex) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverTask(prev => {
            if (prev?.listId === list.id && prev?.taskIndex === taskIndex) return prev;
            return { listId: list.id, taskIndex };
        });
    }, []);

    const handleTaskDragLeave = useCallback((e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOverTask(null);
    }, []);

    const handleTaskDrop = useCallback(async (e, list, dropIndex) => {
        e.preventDefault();
        e.stopPropagation();
        taskJustDroppedRef.current = true;
        setTimeout(() => { taskJustDroppedRef.current = false; }, 100);
        setDragOverTask(null);
        const drag = taskDragRef.current;
        if (!drag || String(drag.listId) !== String(list.id) || drag.taskIndex === dropIndex) return;
        const items = list.tasks;
        if (drag.taskIndex < 0 || drag.taskIndex >= items.length || dropIndex < 0 || dropIndex >= items.length) return;
        const reordered = [...items];
        const [removed] = reordered.splice(drag.taskIndex, 1);
        reordered.splice(dropIndex, 0, removed);
        const prevTasks = tasksRef.current || [];
        const orderByTaskId = {};
        reordered.forEach((item, idx) => { orderByTaskId[item.task.id] = idx; });
        const newTasks = prevTasks.map(t => {
            const newOrder = orderByTaskId[t.id];
            if (newOrder === undefined) return t;
            return { ...t, order: newOrder };
        });
        setTasks(newTasks);
        tasksRef.current = newTasks;
        taskDragRef.current = null;
        if (window.DatabaseAPI?.makeRequest) {
            try {
                await Promise.all(
                    reordered.map((item, idx) =>
                        window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(item.task.id)}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ order: idx })
                        })
                    )
                );
            } catch (err) {
                console.error('Failed to save task order:', err);
                setTasks(prevTasks);
                tasksRef.current = prevTasks;
                alert('Failed to save order. Please try again.');
            }
        }
    }, []);

    // Format checklist progress helper
    const formatChecklistProgress = useCallback((checklist = []) => {
                if (!Array.isArray(checklist) || checklist.length === 0) {
                    return { percent: 0, label: '0/0 complete' };
                }
                const completed = checklist.filter(item => item.completed).length;
                return {
                    percent: Math.round((completed / checklist.length) * 100),
                    label: `${completed}/${checklist.length} complete`
                };
    }, []);

    // List View Component - Proper React component
    const ListView = useCallback(() => {
            return (
            <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div>
                            <label className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide">Search</label>
                            <div className="relative mt-1">
                                <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input
                                    type="text"
                                    value={taskFilters.search}
                                    onChange={(e) => setTaskFilters(prev => ({ ...prev, search: e.target.value }))}
                                    placeholder="Search tasks, tags, comments..."
                                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide">List</label>
                            <select
                                value={taskFilters.list}
                                onChange={(e) => setTaskFilters(prev => ({ ...prev, list: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="all">All lists</option>
                                {listOptions.map(list => (
                                    <option key={list.value} value={list.value}>{list.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide">Status</label>
                            <select
                                value={taskFilters.status}
                                onChange={(e) => setTaskFilters(prev => ({ ...prev, status: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="all">All statuses</option>
                                {statusOptions.map(status => (
                                    <option key={status.value} value={status.value}>{status.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide">Assignee</label>
                            <select
                                value={taskFilters.assignee}
                                onChange={(e) => setTaskFilters(prev => ({ ...prev, assignee: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="all">All assignees</option>
                                {assigneeOptions.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-[11px] font-semibold uppercase text-gray-500 tracking-wide">Priority</label>
                            <select
                                value={taskFilters.priority}
                                onChange={(e) => setTaskFilters(prev => ({ ...prev, priority: e.target.value }))}
                                className="mt-1 w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="all">All priorities</option>
                                {priorityOptions.map(priority => (
                                    <option key={priority.value} value={priority.value}>{priority.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2 xl:col-span-1 flex items-end justify-between gap-3 flex-wrap">
                            <label className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    checked={taskFilters.includeSubtasks}
                                    onChange={(e) => setTaskFilters(prev => ({ ...prev, includeSubtasks: e.target.checked }))}
                                />
                                Include subtasks
                            </label>
                            <label className="flex items-center gap-2 text-xs text-gray-600 font-medium" title="Show tasks that are no longer relevant">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    checked={taskFilters.showArchived}
                                    onChange={(e) => setTaskFilters(prev => ({ ...prev, showArchived: e.target.checked }))}
                                />
                                Show archived
                            </label>
                            {hasActiveTaskFilters && (
                                <button
                                    onClick={resetTaskFilters}
                                    className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                                >
                                    <i className="fas fa-times mr-1"></i>
                                    Clear filters
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between text-xs text-gray-500">
                        <span>
                            Showing <span className="font-semibold text-gray-700">{visibleTaskCount}</span> of{' '}
                            <span className="font-semibold text-gray-700">{totalTaskCount}</span> tasks
                        </span>
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                                <i className="fas fa-comments text-primary-500"></i>
                                Comments available to every user
                            </span>
                            <span className="hidden sm:inline-flex items-center gap-1 text-gray-400">
                                <i className="fas fa-mouse-pointer"></i>
                                Click any task to open the detailed workspace
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col gap-4">
                    {filteredTaskLists.map(list => {
                        const accentColor = list.color ? `var(--tw-${list.color}-500, #0ea5e9)` : '#0ea5e9';
                        return (
                            <section key={list.id} className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
                                <header className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="inline-flex w-2 h-2 rounded-full"
                                                style={{ backgroundColor: accentColor }}
                                            ></span>
                                            <h3 className="text-sm font-semibold text-gray-900">{list.name}</h3>
                                            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white border border-gray-200 text-gray-600">
                                                {list.tasks.length} task{list.tasks.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                        {list.description && (
                                            <p className="text-xs text-gray-500 mt-1">
                                                {list.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                try {
                                                    console.log('🖱️ + Task button clicked - event:', e);
                                                    console.log('🖱️ + Task button clicked for list:', list.id);
                                                    console.log('🖱️ handleAddTask type:', typeof handleAddTask);
                                                    
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    
                                                    if (typeof handleAddTask === 'function') {
                                                        console.log('✅ Calling handleAddTask with listId:', list.id);
                                                        const result = handleAddTask(list.id);
                                                        console.log('✅ handleAddTask returned:', result);
                                                        if (result && typeof result.catch === 'function') {
                                                            result.catch(err => {
                                                                console.error('❌ Error in handleAddTask promise:', err);
                                                                alert('Failed to add task: ' + (err?.message || 'Unknown error'));
                                                            });
                                                        }
                                                    } else {
                                                        console.error('❌ handleAddTask is not a function, type:', typeof handleAddTask);
                                                        alert('Task functionality is not available. Please refresh the page.');
                                                    }
                                                } catch (error) {
                                                    console.error('❌ Error in + Task button onClick handler:', error);
                                                    alert('Failed to add task: ' + (error?.message || 'Unknown error'));
                                                }
                                            }}
                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 transition-colors"
                                        >
                                            <i className="fas fa-plus text-[10px]"></i>
                                            Task
                                        </button>
                                        <button
                                            onClick={() => handleEditList(list)}
                                            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5"
                                            title="Edit list"
                                        >
                                            <i className="fas fa-cog text-xs"></i>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteList(list.id)}
                                            className="text-gray-400 hover:text-red-600 transition-colors p-1.5"
                                            title="Delete list"
                                        >
                                            <i className="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                </header>
                                <div className="flex-1">
                                    <div className="overflow-x-auto">
                                        {/* TABLE STRUCTURE VERSION 3.0 - IF YOU SEE THIS, NEW CODE IS LOADED */}
                                        <table className="min-w-full divide-y divide-gray-200" data-task-table-version="3.0" style={{ display: 'table', width: '100%' }}>
                                            {list.tasks.length > 0 && (
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th
                                                            className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20 cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('order')}
                                                            title="Sort by order"
                                                        >
                                                            <span className="inline-flex items-center justify-center gap-1">
                                                                Order
                                                                {taskListSortBy === 'order' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th
                                                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('title')}
                                                            title="Sort by task name"
                                                        >
                                                            <span className="inline-flex items-center gap-1">
                                                                Task
                                                                {taskListSortBy === 'title' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th
                                                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('status')}
                                                            title="Sort by status"
                                                        >
                                                            <span className="inline-flex items-center gap-1">
                                                                Status
                                                                {taskListSortBy === 'status' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th
                                                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('assignee')}
                                                            title="Sort by assignee"
                                                        >
                                                            <span className="inline-flex items-center gap-1">
                                                                Assignee
                                                                {taskListSortBy === 'assignee' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th
                                                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('priority')}
                                                            title="Sort by priority"
                                                        >
                                                            <span className="inline-flex items-center gap-1">
                                                                Priority
                                                                {taskListSortBy === 'priority' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th
                                                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('dueDate')}
                                                            title="Sort by due date"
                                                        >
                                                            <span className="inline-flex items-center gap-1">
                                                                Due Date
                                                                {taskListSortBy === 'dueDate' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th
                                                            className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100"
                                                            onClick={() => handleTaskListSort('comments')}
                                                            title="Sort by comment count"
                                                        >
                                                            <span className="inline-flex items-center gap-1">
                                                                Comments
                                                                {taskListSortBy === 'comments' ? (taskListSortDir === 'asc' ? <i className="fas fa-sort-up text-primary-500" /> : <i className="fas fa-sort-down text-primary-500" />) : <i className="fas fa-sort text-gray-300" />}
                                                            </span>
                                                        </th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                    </tr>
                                                </thead>
                                            )}
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {list.tasks.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="8" className="px-4 py-12 text-center">
                                                            <div className="flex flex-col items-center justify-center text-center text-gray-400">
                                                                <i className="fas fa-clipboard-list text-3xl mb-3"></i>
                                                                <p className="text-sm font-medium">
                                                                    {hasActiveTaskFilters ? 'No tasks match your filters.' : 'No tasks yet. Start by adding one.'}
                                                                </p>
                                                                {!hasActiveTaskFilters && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            try {
                                                                                console.log('🖱️ Add first task button clicked - event:', e);
                                                                                console.log('🖱️ Add first task button clicked for list:', list.id);
                                                                                console.log('🖱️ handleAddTask type:', typeof handleAddTask);
                                                                                
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                
                                                                                if (typeof handleAddTask === 'function') {
                                                                                    console.log('✅ Calling handleAddTask with listId:', list.id);
                                                                                    const result = handleAddTask(list.id);
                                                                                    console.log('✅ handleAddTask returned:', result);
                                                                                    if (result && typeof result.catch === 'function') {
                                                                                        result.catch(err => {
                                                                                            console.error('❌ Error in handleAddTask promise:', err);
                                                                                            alert('Failed to add task: ' + (err?.message || 'Unknown error'));
                                                                                        });
                                                                                    }
                                                                                } else {
                                                                                    console.error('❌ handleAddTask is not a function, type:', typeof handleAddTask);
                                                                                    alert('Task functionality is not available. Please refresh the page.');
                                                                                }
                                                                            } catch (error) {
                                                                                console.error('❌ Error in Add first task button onClick handler:', error);
                                                                                alert('Failed to add task: ' + (error?.message || 'Unknown error'));
                                                                            }
                                                                        }}
                                                                        className="mt-4 px-3 py-1.5 text-xs font-semibold bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
                                                                    >
                                                                        Add your first task
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    list.tasks.map(({ task, matchingSubtasks, matchedBySubtasks }, taskIndex) => {
                                                        const dueMeta = getDueDateMeta(task.dueDate);
                                                        const subtasksForCard = matchingSubtasks || [];
                                                        return (
                                                            <Fragment key={task.id}>
                                                                <tr
                                                                    onClick={(e) => {
                                                                        if (taskJustDroppedRef.current) return;
                                                                        try {
                                                                            e.stopPropagation();
                                                                            if (typeof handleViewTaskDetail === 'function') {
                                                                                console.log('✅ Calling handleViewTaskDetail with task:', task.id);
                                                                                const result = handleViewTaskDetail(task);
                                                                                console.log('✅ handleViewTaskDetail returned:', result);
                                                                                if (result && typeof result.catch === 'function') {
                                                                                    result.catch(err => {
                                                                                        console.error('❌ Error in handleViewTaskDetail promise:', err);
                                                                                        alert('Failed to open task: ' + (err?.message || 'Unknown error'));
                                                                                    });
                                                                                }
                                                                            } else {
                                                                                console.error('❌ handleViewTaskDetail is not a function, type:', typeof handleViewTaskDetail);
                                                                                alert('Task functionality is not available. Please refresh the page.');
                                                                            }
                                                                        } catch (error) {
                                                                            console.error('❌ Error in Table row onClick handler:', error);
                                                                            alert('Failed to open task: ' + (error?.message || 'Unknown error'));
                                                                        }
                                                                    }}
                                                                    className={`hover:bg-gray-50 cursor-pointer transition ${dragOverTask?.listId === list.id && dragOverTask?.taskIndex === taskIndex ? 'bg-primary-50 ring-1 ring-primary-200' : ''}`}
                                                                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                                                    onDragOver={(e) => handleTaskDragOver(e, list, taskIndex)}
                                                                    onDragLeave={handleTaskDragLeave}
                                                                    onDrop={(e) => handleTaskDrop(e, list, taskIndex)}
                                                                >
                                                                    <td
                                                                        className="px-2 py-2 whitespace-nowrap text-center align-middle"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        draggable
                                                                        onDragStart={(e) => {
                                                                            e.stopPropagation();
                                                                            handleTaskDragStart(list, taskIndex, e);
                                                                        }}
                                                                        onDragEnd={handleTaskDragEnd}
                                                                        title="Drag to reorder"
                                                                    >
                                                                        <span className="inline-flex cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 rounded">
                                                                            <i className="fas fa-grip-vertical text-[10px]"></i>
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        <div className="text-xs font-medium text-gray-900">{task.title || 'Untitled task'}</div>
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        <select
                                                                            value={task.status || 'To Do'}
                                                                            onChange={(e) => {
                                                                                e.stopPropagation();
                                                                                const newStatus = e.target.value;
                                                                                if (newStatus && newStatus !== (task.status || 'To Do')) {
                                                                                    handleUpdateTaskStatus(task.id, newStatus);
                                                                                }
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border-0 cursor-pointer focus:ring-1 focus:ring-primary-500 ${getStatusColor(task.status || 'To Do')}`}
                                                                            title="Change status"
                                                                        >
                                                                            {statusOptions.map(opt => (
                                                                                <option key={opt.value} value={opt.label}>{opt.label}</option>
                                                                            ))}
                                                                        </select>
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        {task.assignee ? (
                                                                            <div className="flex items-center text-xs text-gray-500">
                                                                                <i className="fas fa-user text-[10px] text-gray-400 mr-1"></i>
                                                                                {task.assignee}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-xs text-gray-400">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getPriorityColor(task.priority || 'Medium')}`}>
                                                                            <i className="fas fa-bolt text-[9px] mr-1"></i>
                                                                            {task.priority || 'Medium'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        <div className="flex flex-wrap items-center gap-1">
                                                                            {task.startDate && formatStartDateLabel(task.startDate) && (
                                                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700" title="Start date">
                                                                                    <i className="fas fa-play-circle text-[9px] mr-1"></i>
                                                                                    {formatStartDateLabel(task.startDate)}
                                                                                </span>
                                                                            )}
                                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${dueMeta.pillClass}`}>
                                                                                <i className="fas fa-calendar-alt text-[9px] mr-1"></i>
                                                                                {dueMeta.label}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap text-center">
                                                                        {task.comments?.length > 0 ? (
                                                                            <span className="inline-flex items-center text-xs text-gray-500">
                                                                                <i className="fas fa-comments text-[10px] text-gray-400 mr-1"></i>
                                                                                {task.comments.length}
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-xs text-gray-400">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap text-right">
                                                                        <div className="flex items-center justify-end gap-1">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    openTaskComments(e, task);
                                                                                }}
                                                                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-primary-500 text-white rounded hover:bg-primary-600 transition-all font-medium"
                                                                                title="Open comments"
                                                                            >
                                                                                <i className="fas fa-comments text-[9px] mr-0.5"></i>
                                                                                {task.comments?.length || 0}
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    try {
                                                                                        console.log('🖱️ Add subtask button clicked - event:', e);
                                                                                        console.log('🖱️ Add subtask button clicked for task:', task.id);
                                                                                        console.log('🖱️ handleAddSubtask type:', typeof handleAddSubtask);
                                                                                        
                                                                                        e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                        
                                                                                        if (typeof handleAddSubtask === 'function') {
                                                                                            console.log('✅ Calling handleAddSubtask with task:', task.id);
                                                                                            const result = handleAddSubtask(task);
                                                                                            console.log('✅ handleAddSubtask returned:', result);
                                                                                            if (result && typeof result.catch === 'function') {
                                                                                                result.catch(err => {
                                                                                                    console.error('❌ Error in handleAddSubtask promise:', err);
                                                                                                    alert('Failed to add subtask: ' + (err?.message || 'Unknown error'));
                                                                                                });
                                                                                            }
                                                                                        } else {
                                                                                            console.error('❌ handleAddSubtask is not a function, type:', typeof handleAddSubtask);
                                                                                            alert('Task functionality is not available. Please refresh the page.');
                                                                                        }
                                                                                    } catch (error) {
                                                                                        console.error('❌ Error in Add subtask button onClick handler:', error);
                                                                                        alert('Failed to add subtask: ' + (error?.message || 'Unknown error'));
                                                                                    }
                                                                                }}
                                                                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-primary-500 text-white rounded hover:bg-primary-600 transition-all font-medium"
                                                                                title="Add subtask"
                                                                            >
                                                                                <i className="fas fa-level-down-alt text-[9px] mr-0.5"></i>
                                                                                {task.subtasks?.length || 0}
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    try {
                                                                                        console.log('🖱️ View button clicked - event:', e);
                                                                                        console.log('🖱️ View button clicked for task:', task.id);
                                                                                        console.log('🖱️ handleViewTaskDetail type:', typeof handleViewTaskDetail);
                                                                                        
                                                                                        e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                        
                                                                                        if (typeof handleViewTaskDetail === 'function') {
                                                                                            console.log('✅ Calling handleViewTaskDetail with task:', task.id);
                                                                                            const result = handleViewTaskDetail(task);
                                                                                            console.log('✅ handleViewTaskDetail returned:', result);
                                                                                            if (result && typeof result.catch === 'function') {
                                                                                                result.catch(err => {
                                                                                                    console.error('❌ Error in handleViewTaskDetail promise:', err);
                                                                                                    alert('Failed to open task: ' + (err?.message || 'Unknown error'));
                                                                                                });
                                                                                            }
                                                                                        } else {
                                                                                            console.error('❌ handleViewTaskDetail is not a function, type:', typeof handleViewTaskDetail);
                                                                                            alert('Task functionality is not available. Please refresh the page.');
                                                                                        }
                                                                                    } catch (error) {
                                                                                        console.error('❌ Error in View button onClick handler:', error);
                                                                                        alert('Failed to open task: ' + (error?.message || 'Unknown error'));
                                                                                    }
                                                                                }}
                                                                                className="text-[10px] text-primary-600 hover:text-primary-700 font-semibold px-1.5"
                                                                            >
                                                                                View
                                                                            </button>
                                                                            {String(task.status || '').toLowerCase().replace(/\s+/g, '') !== 'archived' && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                        if (typeof handleArchiveTask === 'function') {
                                                                                            const result = handleArchiveTask(task.id);
                                                                                            if (result && typeof result.catch === 'function') {
                                                                                                result.catch(err => {
                                                                                                    console.error('Failed to archive task:', err);
                                                                                                    alert('Failed to archive task: ' + (err?.message || 'Unknown error'));
                                                                                                });
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-gray-500 text-white rounded hover:bg-gray-600 transition-all font-medium"
                                                                                    title="Archive task (no longer relevant)"
                                                                                >
                                                                                    <i className="fas fa-archive text-[9px]"></i>
                                                                                </button>
                                                                            )}
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    try {
                                                                                        console.log('🖱️ Delete button clicked - event:', e);
                                                                                        console.log('🖱️ Delete button clicked for task:', task.id);
                                                                                        console.log('🖱️ handleDeleteTask type:', typeof handleDeleteTask);
                                                                                        
                                                                                        e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                        
                                                                                        if (typeof handleDeleteTask === 'function') {
                                                                                            console.log('✅ Calling handleDeleteTask with taskId:', task.id);
                                                                                            const result = handleDeleteTask(task.id);
                                                                                            console.log('✅ handleDeleteTask returned:', result);
                                                                                            if (result && typeof result.catch === 'function') {
                                                                                                result.catch(err => {
                                                                                                    console.error('❌ Error in handleDeleteTask promise:', err);
                                                                                                    alert('Failed to delete task: ' + (err?.message || 'Unknown error'));
                                                                                                });
                                                                                            }
                                                                                        } else {
                                                                                            console.error('❌ handleDeleteTask is not a function, type:', typeof handleDeleteTask);
                                                                                            alert('Task functionality is not available. Please refresh the page.');
                                                                                        }
                                                                                    } catch (error) {
                                                                                        console.error('❌ Error in Delete button onClick handler:', error);
                                                                                        alert('Failed to delete task: ' + (error?.message || 'Unknown error'));
                                                                                    }
                                                                                }}
                                                                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-600 transition-all font-medium"
                                                                                title="Delete task"
                                                                            >
                                                                                <i className="fas fa-trash text-[9px]"></i>
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {subtasksForCard.length > 0 && subtasksForCard.map(subtask => {
                                                                    const subtaskDue = getDueDateMeta(subtask.dueDate);
                                                                    return (
                                                                        <tr
                                                                            key={`subtask-${subtask.id}`}
                                                                            onClick={(e) => {
                                                                                try {
                                                                                    console.log('🖱️ Subtask row clicked - event:', e);
                                                                                    console.log('🖱️ Subtask row clicked:', subtask.id);
                                                                                    console.log('🖱️ handleViewTaskDetail type:', typeof handleViewTaskDetail);
                                                                                    
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    
                                                                                    if (typeof handleViewTaskDetail === 'function') {
                                                                                        console.log('✅ Calling handleViewTaskDetail with subtask:', subtask.id);
                                                                                        const result = handleViewTaskDetail(subtask, task);
                                                                                        console.log('✅ handleViewTaskDetail returned:', result);
                                                                                        if (result && typeof result.catch === 'function') {
                                                                                            result.catch(err => {
                                                                                                console.error('❌ Error in handleViewTaskDetail promise:', err);
                                                                                                alert('Failed to open subtask: ' + (err?.message || 'Unknown error'));
                                                                                            });
                                                                                        }
                                                                                    } else {
                                                                                        console.error('❌ handleViewTaskDetail is not a function, type:', typeof handleViewTaskDetail);
                                                                                        alert('Task functionality is not available. Please refresh the page.');
                                                                                    }
                                                                                } catch (error) {
                                                                                    console.error('❌ Error in Subtask row onClick handler:', error);
                                                                                    alert('Failed to open subtask: ' + (error?.message || 'Unknown error'));
                                                                                }
                                                                            }}
                                                                            className="bg-gray-50 hover:bg-gray-100 cursor-pointer transition"
                                                                        >
                                                                            <td className="px-4 py-1.5 whitespace-nowrap pl-10">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <i className="fas fa-level-up-alt fa-rotate-90 text-[10px] text-gray-400"></i>
                                                                                    <div className="text-[10px] font-medium text-gray-700">{subtask.title || 'Untitled subtask'}</div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-1.5 whitespace-nowrap">
                                                                                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${getStatusColor(subtask.status || 'To Do')}`}>
                                                                                    {subtask.status || 'To Do'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-4 py-1.5 whitespace-nowrap">
                                                                                {subtask.assignee ? (
                                                                                    <div className="flex items-center text-[10px] text-gray-500">
                                                                                        <i className="fas fa-user text-[9px] text-gray-400 mr-1"></i>
                                                                                        {subtask.assignee}
                                                                                    </div>
                                                                                ) : (
                                                                                    <span className="text-[10px] text-gray-400">—</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-1.5 whitespace-nowrap">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getPriorityColor(subtask.priority || 'Medium')}`}>
                                                                                    <i className="fas fa-bolt text-[9px] mr-1"></i>
                                                                                    {subtask.priority || 'Medium'}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-4 py-1.5 whitespace-nowrap">
                                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${subtaskDue.pillClass}`}>
                                                                                    <i className="fas fa-calendar-alt text-[9px] mr-1"></i>
                                                                                    {subtaskDue.label}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-4 py-1.5 whitespace-nowrap text-center">
                                                                                {subtask.comments?.length > 0 ? (
                                                                                    <span className="inline-flex items-center text-[10px] text-gray-500">
                                                                                        <i className="fas fa-comments text-[9px] text-gray-400 mr-1"></i>
                                                                                        {subtask.comments.length}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-[10px] text-gray-400">—</span>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-1.5 whitespace-nowrap text-right">
                                                                                <div className="flex items-center justify-end gap-1">
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            openTaskComments(e, subtask, { parentTask: task, isSubtask: true });
                                                                                        }}
                                                                                        className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-primary-500 text-white rounded hover:bg-primary-600 transition-all font-medium"
                                                                                        title="Open comments"
                                                                                    >
                                                                                        <i className="fas fa-comments text-[9px] mr-0.5"></i>
                                                                                        {subtask.comments?.length || 0}
                                                                                    </button>
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleViewTaskDetail(subtask, task);
                                                                                        }}
                                                                                        className="text-[10px] text-primary-600 hover:text-primary-700 font-semibold px-1.5"
                                                                                    >
                                                                                        View
                                                                                    </button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </Fragment>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
            );
    }, [filteredTaskLists, taskFilters, listOptions, statusOptions, assigneeOptions, priorityOptions, visibleTaskCount, totalTaskCount, hasActiveTaskFilters, resetTaskFilters, handleAddTask, handleEditList, handleViewTaskDetail, handleDeleteTask, handleArchiveTask, handleAddSubtask, handleUpdateTaskStatus, handleTaskDragStart, handleTaskDragEnd, handleTaskDragOver, handleTaskDragLeave, handleTaskDrop, dragOverTask, openTaskComments, getStatusColor, getPriorityColor, getDueDateMeta, formatChecklistProgress]);

    const TaskDetailModalComponent = taskDetailModalComponent || (typeof window.TaskDetailModal === 'function' ? window.TaskDetailModal : null);
    const CommentsPopupComponent = commentsPopupComponent || (typeof window.CommentsPopup === 'function' ? window.CommentsPopup : null);
    const ProjectModalComponent = projectModalComponent || (typeof window.ProjectModal === 'function' ? window.ProjectModal : null);
    const CustomFieldModalComponent = (typeof window.CustomFieldModal === 'function' ? window.CustomFieldModal : null);
    const KanbanViewComponent = (typeof window.KanbanView === 'function' ? window.KanbanView : null);
    const DocumentCollectionModalComponent = (typeof window.DocumentCollectionModal === 'function' ? window.DocumentCollectionModal : null);

    const projectSectionNavItems = useMemo(() => {
        const items = [
            { id: 'overview', label: 'Overview' },
            { id: 'tasks', label: 'Tasks' }
        ];
        if (hasTimeProcess) items.push({ id: 'time', label: 'Time' });
        if (hasDocumentCollectionProcess) items.push({ id: 'documentCollection', label: 'Document Collection' });
        if (hasWeeklyFMSReviewProcess) items.push({ id: 'weeklyFMSReview', label: 'Weekly FMS Review' });
        if (hasMonthlyFMSReviewProcess) items.push({ id: 'monthlyFMSReview', label: 'Monthly FMS Review' });
        if (hasMonthlyDataReviewProcess) items.push({ id: 'monthlyDataReview', label: 'Monthly Data Review' });
        if (hasComplianceReviewProcess) items.push({ id: 'complianceReview', label: 'Compliance Review' });
        items.push({ id: 'notes', label: 'Notes' });
        items.push({ id: 'activity', label: 'Activity' });
        return items;
    }, [
        hasTimeProcess,
        hasDocumentCollectionProcess,
        hasWeeklyFMSReviewProcess,
        hasMonthlyFMSReviewProcess,
        hasMonthlyDataReviewProcess,
        hasComplianceReviewProcess
    ]);

    const activeSectionLabel = useMemo(() => {
        const found = projectSectionNavItems.find((i) => i.id === activeSection);
        return found ? found.label : 'Section';
    }, [projectSectionNavItems, activeSection]);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col gap-3 min-w-0 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <button 
                        type="button"
                        onClick={(e) => {
                            // CRITICAL: Stop all event propagation immediately
                            e.preventDefault();
                            e.stopPropagation();
                            e.nativeEvent?.stopImmediatePropagation?.();
                            
                            // Prevent multiple rapid clicks
                            const button = e.currentTarget;
                            if (button.disabled) {
                                return;
                            }
                            button.disabled = true;
                            
                            // Call onBack immediately and synchronously
                            if (typeof onBack === 'function') {
                                try {
                                    onBack();
                                } catch (error) {
                                    console.error('Error calling onBack:', error);
                                    button.disabled = false; // Re-enable on error
                                }
                            } else {
                                console.warn('onBack is not a function');
                                button.disabled = false; // Re-enable if no handler
                            }
                            
                            // Re-enable after navigation completes (longer delay to prevent re-clicks)
                            setTimeout(() => {
                                button.disabled = false;
                            }, 1000);
                        }} 
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <i className="fas fa-arrow-left text-lg pointer-events-none"></i>
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">{project.name}</h1>
                        <p className="text-sm text-gray-500 truncate">{project.client} • {project.type}</p>
                        <p className="lg:hidden mt-1.5 text-xs font-medium text-gray-700" aria-live="polite">
                            <span className="text-gray-500 font-normal">Section: </span>
                            {activeSectionLabel}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => requestAnimationFrame(() => switchSection('notes'))}
                        className={`px-3 py-1.5 rounded-lg transition-colors flex items-center text-xs font-medium ${
                            activeSection === 'notes'
                                ? 'bg-primary-600 text-white hover:bg-primary-700'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <i className="fas fa-sticky-note mr-1.5"></i>
                        Notes
                    </button>
                    <button
                        type="button"
                        onClick={() => requestAnimationFrame(() => switchSection('activity'))}
                        className={`px-3 py-1.5 rounded-lg transition-colors flex items-center text-xs font-medium ${
                            activeSection === 'activity'
                                ? 'bg-primary-600 text-white hover:bg-primary-700'
                                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <i className="fas fa-history mr-1.5"></i>
                        Activity
                    </button>
                    <button 
                        onClick={async () => {
                            const loaded = await ensureProjectModalLoaded();
                            if (loaded) {
                                setShowProjectModal(true);
                            } else {
                                alert('Failed to load project settings. Please refresh the page and try again.');
                            }
                        }}
                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center text-xs font-medium"
                    >
                        <i className="fas fa-cog mr-1.5"></i>
                        Settings
                    </button>
                </div>
            </div>

            {/* Tab Navigation — native select on small screens; horizontal tabs from lg and up */}
            <div className="bg-white rounded-lg border border-gray-200 p-1 min-w-0">
                <div className="lg:hidden px-2 pt-2 pb-1 space-y-1">
                    <label htmlFor="project-detail-section-nav" className="block text-xs font-medium text-gray-600">
                        Jump to section
                    </label>
                    <select
                        id="project-detail-section-nav"
                        value={projectSectionNavItems.some((i) => i.id === activeSection) ? activeSection : 'overview'}
                        onChange={(e) => {
                            const v = e.target.value;
                            requestAnimationFrame(() => switchSection(v));
                        }}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-h-[44px]"
                    >
                        {projectSectionNavItems.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-1 min-w-0">
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-visible -mx-0.5 px-0.5 pb-0.5 hidden lg:block" style={{ WebkitOverflowScrolling: 'touch' }}>
                <div className="flex gap-1 flex-nowrap min-w-0">
                    <button
                        onClick={() => requestAnimationFrame(() => switchSection('overview'))}
                        className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeSection === 'overview'
                                ? 'bg-primary-600 text-white hover:bg-primary-700'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <i className="fas fa-chart-line mr-1.5"></i>
                        Overview
                    </button>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            requestAnimationFrame(() => {
                                try {
                                    if (typeof switchSection === 'function') {
                                        switchSection('tasks');
                                    } else {
                                    console.error('❌ switchSection is not a function');
                                        alert('Failed to switch to tasks: Handler not available.');
                                    }
                                } catch (error) {
                                    console.error('❌ Error in Tasks button click handler:', error);
                                    alert('An unexpected error occurred while trying to switch to tasks: ' + (error?.message || 'Unknown error'));
                                }
                            });
                        }}
                        className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeSection === 'tasks'
                                ? 'bg-primary-600 text-white hover:bg-primary-700'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <i className="fas fa-tasks mr-1.5"></i>
                        Tasks
                    </button>
                    {hasTimeProcess && (
                        <button
                            onClick={() => requestAnimationFrame(() => switchSection('time'))}
                            className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'time'
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-clock mr-1.5"></i>
                            Time
                        </button>
                    )}
                    {hasDocumentCollectionProcess && (
                        <button
                            type="button"
                            onClick={() => requestAnimationFrame(() => switchSection('documentCollection'))}
                            className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'documentCollection'
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-folder-open mr-1.5"></i>
                            Document Collection
                        </button>
                    )}
                    {hasWeeklyFMSReviewProcess && (
                        <button
                            type="button"
                            onClick={() => requestAnimationFrame(() => switchSection('weeklyFMSReview'))}
                            className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'weeklyFMSReview'
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-calendar-week mr-1.5"></i>
                            Weekly FMS Review
                        </button>
                    )}
                    {hasMonthlyFMSReviewProcess && (
                        <button
                            type="button"
                            onClick={() => requestAnimationFrame(() => switchSection('monthlyFMSReview'))}
                            className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'monthlyFMSReview'
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-calendar-alt mr-1.5"></i>
                            Monthly FMS Review
                        </button>
                    )}
                    {hasMonthlyDataReviewProcess && (
                        <button
                            type="button"
                            onClick={() => requestAnimationFrame(() => switchSection('monthlyDataReview'))}
                            className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'monthlyDataReview'
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-clipboard-check mr-1.5"></i>
                            Monthly Data Review
                        </button>
                    )}
                    {hasComplianceReviewProcess && (
                        <button
                            type="button"
                            onClick={() => requestAnimationFrame(() => switchSection('complianceReview'))}
                            className={`shrink-0 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'complianceReview'
                                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-clipboard-list mr-1.5"></i>
                            Compliance Review
                        </button>
                    )}
                </div>
                </div>
                    <div className="relative flex justify-end shrink-0 px-2 pb-2 lg:px-0 lg:pb-0 lg:self-center">
                        <button
                            onClick={() => setShowDocumentProcessDropdown(!showDocumentProcessDropdown)}
                            className="px-3 py-2 lg:px-2 lg:py-0.5 bg-primary-600 text-white text-xs font-medium rounded-lg lg:rounded hover:bg-primary-700 transition-colors flex items-center gap-1 whitespace-nowrap min-h-[44px] lg:min-h-0"
                        >
                            <i className="fas fa-plus text-[10px]"></i>
                            <span>Module</span>
                            <i className="fas fa-chevron-down text-[10px]"></i>
                        </button>
                        
                        {/* Dropdown Menu */}
                        {showDocumentProcessDropdown && (
                            <>
                                {/* Backdrop */}
                                <div 
                                    className="fixed inset-0 z-10" 
                                    onClick={() => setShowDocumentProcessDropdown(false)}
                                ></div>
                                
                                {/* Dropdown */}
                                <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                                    {!hasTimeProcess && (
                                        <button
                                            type="button"
                                            onClick={handleAddTimeProcess}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            <i className="fas fa-clock text-primary-600 w-4"></i>
                                            <div>
                                                <div className="font-medium">Time</div>
                                                <div className="text-[10px] text-gray-500">Time tracking and entries</div>
                                            </div>
                                        </button>
                                    )}
                                    {!hasDocumentCollectionProcess && (
                                        <button
                                            type="button"
                                            onClick={handleAddDocumentCollectionProcess}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            <i className="fas fa-folder-open text-primary-600 w-4"></i>
                                            <div>
                                                <div className="font-medium">Document Collection Process</div>
                                                <div className="text-[10px] text-gray-500">Request specific documents</div>
                                            </div>
                                        </button>
                                    )}
                                    {!hasMonthlyDataReviewProcess && (
                                        <button
                                            type="button"
                                            onClick={handleAddMonthlyDataReviewProcess}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            <i className="fas fa-clipboard-check text-primary-600 w-4"></i>
                                            <div>
                                                <div className="font-medium">Monthly Data Review</div>
                                                <div className="text-[10px] text-gray-500">Checklist for monthly data review</div>
                                            </div>
                                        </button>
                                    )}
                                    {!hasComplianceReviewProcess && (
                                        <button
                                            type="button"
                                            onClick={handleAddComplianceReviewProcess}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            <i className="fas fa-clipboard-list text-primary-600 w-4"></i>
                                            <div>
                                                <div className="font-medium">Compliance Review</div>
                                                <div className="text-[10px] text-gray-500">Checklist for compliance review</div>
                                            </div>
                                        </button>
                                    )}
                                    {!hasWeeklyFMSReviewProcess && (
                                        <button
                                            onClick={handleAddWeeklyFMSReviewProcess}
                                            className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                        >
                                            <i className="fas fa-calendar-week text-primary-600 w-4"></i>
                                            <div>
                                                <div className="font-medium">Weekly FMS Review</div>
                                                <div className="text-[10px] text-gray-500">Weekly FMS review per month</div>
                                            </div>
                                        </button>
                                    )}
                                    {!hasMonthlyFMSReviewProcess && (
                                            <button
                                                type="button"
                                                onClick={handleAddMonthlyFMSReviewProcess}
                                                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                            >
                                                <i className="fas fa-calendar-alt text-primary-600 w-4"></i>
                                                <div>
                                                    <div className="font-medium">Monthly FMS Review</div>
                                                <div className="text-[10px] text-gray-500">Monthly FMS review checklist</div>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Section Content */}
            {(() => {
                return null;
            })()}
            
            {activeSection === 'overview' && (
                <ProjectOverviewSection
                    project={project}
                    tasks={tasks}
                    users={users}
                    onProjectUpdate={onProjectUpdate}
                    formatProjectDate={formatProjectDate}
                />
            )}

            {activeSection === 'notes' && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {editingNoteFull ? (
                        <div className="flex flex-col h-full min-h-[500px]">
                            <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={closeNoteEditor}
                                    className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <i className="fas fa-arrow-left"></i>
                                    Back to list
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditorActivityPanelOpen(prev => !prev)}
                                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-2 ${editorActivityPanelOpen ? 'bg-primary-100 text-primary-800 border border-primary-300' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
                                >
                                    <i className="fas fa-history"></i>
                                    Activity
                                    <i className={`fas fa-chevron-${editorActivityPanelOpen ? 'right' : 'left'} text-xs`}></i>
                                </button>
                            </div>
                            <div className="flex flex-1 min-h-0">
                                <div className="flex-1 min-w-0 overflow-hidden">
                                    {window.NoteEditor && noteEditorReady ? (
                                        React.createElement(window.NoteEditor, {
                                            note: editingNoteFull,
                                            allTags: noteEditorData.allTags,
                                            clients: noteEditorData.clients,
                                            projects: noteEditorData.projects,
                                            clientProjects: noteEditorData.clientProjects,
                                            onClientChange: loadProjectsForNoteClient,
                                            onSave: handleSaveNoteInProject,
                                            onDelete: handleDeleteNoteInProject,
                                            onShare: handleShareNoteInProject,
                                            onTogglePin: handleTogglePinNoteInProject,
                                            onExport: handleExportNoteInProject,
                                            isSaving: isSavingNote,
                                            lastSavedAt: null,
                                            isDark: false,
                                            isProjectNote: editingNoteSource === 'project'
                                        })
                                    ) : (
                                        <div className="p-8 text-center">
                                            <i className="fas fa-spinner fa-spin text-2xl text-primary-500 mb-2" aria-hidden="true"></i>
                                            <p className="text-gray-500">Loading editor…</p>
                                        </div>
                                    )}
                                </div>
                                {editorActivityPanelOpen && (
                                    <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col">
                                        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-gray-800">Note activity</h4>
                                            <button
                                                type="button"
                                                onClick={() => setEditorActivityPanelOpen(false)}
                                                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                                                aria-label="Close activity panel"
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                        <div className="p-3 overflow-y-auto flex-1">
                                            {noteActivityForEditor.length === 0 ? (
                                                <p className="text-xs text-gray-500">No activity recorded for this note yet.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {noteActivityForEditor.map((log) => {
                                                        const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                                        const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                                        const sourceLabel = meta.source === 'user' ? ' (My Notes)' : '';
                                                        const changes = Array.isArray(meta.changes) ? meta.changes : [];
                                                        return (
                                                            <div key={log.id} className="border border-gray-200 rounded-lg p-3 bg-white text-xs">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">{String(log.type || '').replace(/_/g, ' ')}</span>
                                                                    <span className="text-gray-500">{log.userName || 'System'}</span>
                                                                    <span className="text-gray-400">{dateStr}</span>
                                                                    {sourceLabel && <span className="text-gray-500">{sourceLabel}</span>}
                                                                </div>
                                                                {changes.length > 0 ? (
                                                                    <ul className="mt-2 list-disc list-inside text-gray-600 space-y-0.5">
                                                                        {changes.map((c, i) => (
                                                                            <li key={i}>{c}</li>
                                                                        ))}
                                                                    </ul>
                                                                ) : log.description ? (
                                                                    <div className="mt-1.5 text-gray-600">{log.description}</div>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => editingNoteFull?.id && loadActivityForNote(editingNoteFull.id).then(setNoteActivityForEditor)}
                                                className="mt-3 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
                                            >
                                                <i className="fas fa-sync-alt mr-1"></i> Refresh
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="p-4">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <i className="fas fa-sticky-note text-primary-600"></i>
                                    Notes
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">Project notes (saved with this project) and public notes from My Notes. Create a new note for this project or open one to edit.</p>
                                <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <button
                                        type="button"
                                        onClick={createProjectNote}
                                        disabled={isSavingNote}
                                        className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <i className="fas fa-plus"></i>
                                        Create note
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { loadProjectNotes(); loadProjectNotesFromProject(); }}
                                        className="px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
                                    >
                                        <i className="fas fa-sync-alt mr-1"></i> Refresh
                                    </button>
                                </div>
                            </div>
                            <div className="flex gap-0 min-h-0 flex-1">
                                <div className="flex-1 min-w-0 px-4 pb-4 space-y-4 max-h-[60vh] overflow-y-auto">
                                    {(projectNotes === null && projectNotesFromProject === null) ? (
                                        <p className="text-sm text-gray-500">Loading…</p>
                                    ) : mergedNotesList.length === 0 ? (
                                        <p className="text-sm text-gray-500">No notes yet. Click &quot;Create note&quot; to add a project note, or create and publish notes from My Notes to see them here.</p>
                                    ) : (
                                        mergedNotesList.map((note) => (
                                            <div
                                                key={note.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => openNoteForEditing(note)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNoteForEditing(note); } }}
                                                className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 hover:bg-gray-100 cursor-pointer transition-colors"
                                            >
                                                <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                                                    <span className="font-medium text-gray-900">{note.title || 'Untitled'}</span>
                                                    {note.author?.name && (
                                                        <span className="text-gray-500">by {note.author.name}</span>
                                                    )}
                                                    <span className="text-gray-400 text-xs">
                                                        {note.updatedAt ? new Date(note.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleToggleNoteActivity(e, note)}
                                                        className="text-primary-600 text-xs hover:text-primary-700 hover:underline ml-auto"
                                                    >
                                                        <i className="fas fa-history mr-1"></i>
                                                        {expandedNoteActivityId === note.id ? 'Hide activity' : 'Activity'}
                                                    </button>
                                                    <span className="text-primary-600 text-xs">View & edit →</span>
                                                </div>
                                                <div
                                                    className="text-sm text-gray-700 prose prose-sm max-w-none line-clamp-2"
                                                    dangerouslySetInnerHTML={{ __html: (note.content || '').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') }}
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                                {/* Right-hand activity panel (Google Docs style) */}
                                {expandedNoteActivityId && (
                                    <div className="w-80 flex-shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col max-h-[60vh]">
                                        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-gray-800 truncate">
                                                {(() => {
                                                    const note = mergedNotesList.find((n) => n.id === expandedNoteActivityId);
                                                    return note ? (note.title || 'Untitled') : 'Note activity';
                                                })()}
                                            </h4>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setExpandedNoteActivityId(null); }}
                                                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded"
                                                aria-label="Close activity panel"
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </div>
                                        <div className="p-3 overflow-y-auto flex-1">
                                            {noteActivityByNoteId[expandedNoteActivityId] === undefined ? (
                                                <p className="text-sm text-gray-500">Loading…</p>
                                            ) : !noteActivityByNoteId[expandedNoteActivityId]?.length ? (
                                                <p className="text-sm text-gray-500">No activity for this note yet.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {noteActivityByNoteId[expandedNoteActivityId].map((log) => {
                                                        const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                                        const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                                        const sourceLabel = meta.source === 'user' ? ' (My Notes)' : '';
                                                        const changes = Array.isArray(meta.changes) ? meta.changes : [];
                                                        return (
                                                            <div key={log.id} className="border border-gray-200 rounded-lg p-3 bg-white text-sm">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-700">{String(log.type || '').replace(/_/g, ' ')}</span>
                                                                    <span className="text-gray-500">{log.userName || 'System'}</span>
                                                                    <span className="text-gray-400 text-xs">{dateStr}</span>
                                                                    {sourceLabel && <span className="text-gray-500 text-xs">{sourceLabel}</span>}
                                                                </div>
                                                                {changes.length > 0 ? (
                                                                    <ul className="mt-1.5 list-disc list-inside text-xs text-gray-600 space-y-0.5">
                                                                        {changes.map((c, i) => (
                                                                            <li key={i}>{c}</li>
                                                                        ))}
                                                                    </ul>
                                                                ) : log.description ? (
                                                                    <div className="mt-1.5 text-xs text-gray-600">{log.description}</div>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {noteActivityByNoteId[expandedNoteActivityId] && (
                                                <button
                                                    type="button"
                                                    onClick={() => expandedNoteActivityId && loadActivityForNote(expandedNoteActivityId).then((logs) => setNoteActivityByNoteId(prev => ({ ...prev, [expandedNoteActivityId]: Array.isArray(logs) ? logs : [] })))}
                                                    className="mt-3 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
                                                >
                                                    <i className="fas fa-sync-alt mr-1"></i> Refresh
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Share modal when editing a note in project */}
            {showNoteShareModal && editingNoteFull && window.ShareModal && React.createElement(window.ShareModal, {
                noteId: editingNoteFull.id,
                users: noteEditorData.users,
                selectedUsers: noteShareSelectedUsers,
                onSelectUsers: setNoteShareSelectedUsers,
                onSave: handleSaveNoteShareInProject,
                onClose: () => setShowNoteShareModal(false),
                isDark: false
            })}

            {activeSection === 'activity' && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <i className="fas fa-history text-primary-600"></i>
                        Project activity & history
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">Recent changes to tasks, documents, reviews, and project settings.</p>
                    <button
                        type="button"
                        onClick={() => loadActivityLog()}
                        className="mb-3 px-2 py-1 text-xs text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded"
                    >
                        <i className="fas fa-sync-alt mr-1"></i> Refresh
                    </button>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                        {(() => {
                            const logs = activityLogEntries !== null ? activityLogEntries : (project?.activityLog ?? []);
                            return Array.isArray(logs) && logs.length > 0 ? (
                            logs.map((log) => {
                                const meta = (() => { try { return typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {}); } catch (_) { return {}; } })();
                                const dateStr = log.createdAt ? new Date(log.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '';
                                const entityType = meta.entityType || '';
                                const taskId = meta.entityId && entityType === 'task' ? meta.entityId : null;
                                const taskTitle = meta.taskTitle || (taskId ? `Task ${String(taskId).slice(-6)}` : null);
                                const documentName = meta.documentName || null;
                                const yearMonth = (meta.year != null && meta.month != null) ? `${meta.year}-${String(meta.month).padStart(2, '0')}` : null;
                                const fieldLabel = meta.field ? String(meta.field).replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim() : null;
                                const hasTaskLink = taskId && project?.id;
                                const docCollectionType = entityType === 'document_section';
                                const weeklyFmsType = entityType === 'weekly_fms';
                                const monthlyFmsType = entityType === 'monthly_fms';
                                const monthlyDataReviewType = entityType === 'monthly_data_review';
                                const complianceType = entityType === 'compliance_review';
                                const hasDocLink = (docCollectionType || weeklyFmsType || monthlyFmsType || monthlyDataReviewType || complianceType) && project?.id;
                                const isNotesChange = /_notes_change$/.test(log.type || '');
                                const statusKey = meta.statusKey || null;
                                const summaryLine = (() => {
                                    if (taskTitle && entityType === 'task') return `Task: ${taskTitle}`;
                                    if (isNotesChange && documentName && yearMonth) return `Notes: ${documentName} (${yearMonth})`;
                                    if (documentName && statusKey) return `${documentName} (${statusKey})`;
                                    if (documentName && yearMonth) return `${documentName} (${yearMonth})`;
                                    if (documentName) return documentName;
                                    if (entityType === 'project' && fieldLabel) return `Project: ${fieldLabel}`;
                                    return log.description || log.type || 'Activity';
                                })();
                                return (
                                    <div key={log.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50/50 hover:bg-gray-50">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                            <span className="font-medium text-gray-900">{summaryLine}</span>
                                            {log.type && (
                                                <span className="px-1.5 py-0.5 rounded text-xs bg-gray-200 text-gray-700">{log.type.replace(/_/g, ' ')}</span>
                                            )}
                                            <span className="text-gray-500">{log.userName || 'System'}</span>
                                            <span className="text-gray-400 text-xs">{dateStr}</span>
                                        </div>
                                        {log.description && summaryLine !== log.description && (
                                            <div className="mt-1 text-xs text-gray-600">{log.description}</div>
                                        )}
                                        {meta.noteSnippet && (
                                            <div className="mt-2 text-xs text-gray-700 bg-white/90 rounded px-2 py-1.5 border border-gray-200">
                                                <span className="text-gray-500 font-medium">Note: </span>
                                                <span className="italic">{meta.noteSnippet}</span>
                                            </div>
                                        )}
                                        {(meta.oldValue != null || meta.newValue != null) && !meta.noteSnippet && (
                                            <div className="mt-2 text-xs text-gray-600">
                                                {fieldLabel && <span className="text-gray-500">{fieldLabel}: </span>}
                                                {meta.oldValue != null && <span className="line-through text-gray-500">{String(meta.oldValue)}</span>}
                                                {meta.oldValue != null && meta.newValue != null && <span className="mx-1">→</span>}
                                                {meta.newValue != null && <span>{String(meta.newValue)}</span>}
                                            </div>
                                        )}
                                        {(meta.oldValue != null || meta.newValue != null) && meta.noteSnippet && (meta.oldValue !== meta.newValue) && (
                                            <div className="mt-1 text-xs text-gray-500">
                                                {meta.oldValue ? 'Updated from previous note' : 'New note added'}
                                            </div>
                                        )}
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {hasTaskLink && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        window.dispatchEvent(new CustomEvent('openTask', { detail: { taskId } }));
                                                    }}
                                                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                                                >
                                                    <i className="fas fa-external-link-alt mr-1"></i> View task
                                                </button>
                                            )}
                                            {hasDocLink && docCollectionType && (
                                                <button
                                                    type="button"
                                                    onClick={() => switchSection('documentCollection')}
                                                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                                                >
                                                    <i className="fas fa-folder-open mr-1"></i> Document Collection
                                                </button>
                                            )}
                                            {hasDocLink && weeklyFmsType && (
                                                <button
                                                    type="button"
                                                    onClick={() => switchSection('weeklyFMSReview')}
                                                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                                                >
                                                    <i className="fas fa-calendar-week mr-1"></i> Weekly FMS Review
                                                </button>
                                            )}
                                            {hasDocLink && monthlyFmsType && (
                                                <button
                                                    type="button"
                                                    onClick={() => switchSection('monthlyFMSReview')}
                                                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                                                >
                                                    <i className="fas fa-calendar-alt mr-1"></i> Monthly FMS Review
                                                </button>
                                            )}
                                            {hasDocLink && monthlyDataReviewType && (
                                                <button
                                                    type="button"
                                                    onClick={() => switchSection('monthlyDataReview')}
                                                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                                                >
                                                    <i className="fas fa-clipboard-check mr-1"></i> Monthly Data Review
                                                </button>
                                            )}
                                            {hasDocLink && complianceType && (
                                                <button
                                                    type="button"
                                                    onClick={() => switchSection('complianceReview')}
                                                    className="text-xs text-primary-600 hover:text-primary-700 hover:underline font-medium"
                                                >
                                                    <i className="fas fa-clipboard-list mr-1"></i> Compliance Review
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                            ) : (
                            <p className="text-gray-500 text-sm">No activity recorded yet. Changes to tasks, document status, and reviews will appear here.</p>
                        );
                        })()}
                    </div>
                </div>
            )}

            {activeSection === 'time' && <TimeTrackingSection project={project} />}
            
            {activeSection === 'tasks' && (
                <>
                    {/* Task View Controls */}
                    <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                            {/* View Switcher */}
                            <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                        viewMode === 'list'
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-list mr-1.5"></i>
                                    List
                                </button>
                                <button
                                    onClick={() => setViewMode('kanban')}
                                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                                        viewMode === 'kanban'
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <i className="fas fa-columns mr-1.5"></i>
                                    Kanban
                                </button>
                            </div>
                            {viewMode === 'kanban' && taskLists && taskLists.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <label htmlFor="kanban-list-select" className="text-xs font-medium text-gray-600 whitespace-nowrap">
                                        Show list:
                                    </label>
                                    <select
                                        id="kanban-list-select"
                                        value={kanbanListFilter}
                                        onChange={(e) => setKanbanListFilter(e.target.value)}
                                        className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-800 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-w-[120px]"
                                    >
                                        <option value="all">All lists</option>
                                        {taskLists.map(list => (
                                            <option key={list.id} value={list.id}>{list.name || 'Unnamed'}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setShowCustomFieldModal(true)}
                                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center text-xs font-medium"
                            >
                                <i className="fas fa-th mr-1.5"></i>
                                Custom Fields
                            </button>
                            <button 
                                onClick={handleAddList}
                                className="bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center text-xs font-medium"
                            >
                                <i className="fas fa-plus mr-1.5"></i>
                                Add List
                            </button>
                        </div>
                    </div>

            {/* List or Kanban View */}
            {viewMode === 'list' ? (
                ListView()
            ) : (
                KanbanViewComponent ? (
                    <div className="-mx-6 min-w-0 w-full max-w-none">
                    <KanbanViewComponent
                        tasks={kanbanTasks}
                        statusColumns={kanbanColumns}
                        groupByList={false}
                        onViewTaskDetail={handleViewTaskDetail}
                        onAddTask={handleAddTask}
                        onDeleteTask={handleDeleteTask}
                        onUpdateTaskStatus={handleUpdateTaskStatus}
                        getStatusColor={getStatusColor}
                        getPriorityColor={getPriorityColor}
                        getDueDateMeta={getDueDateMeta}
                    />
                    </div>
                ) : (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-gray-300 mb-2"></i>
                        <p className="text-sm text-gray-600 mb-1">Loading Kanban view...</p>
                    </div>
                )
            )}

            {/* Comments Popup */}
            {commentsPopup && CommentsPopupComponent && (
                <CommentsPopupComponent
                    task={commentsPopup.task}
                    isSubtask={commentsPopup.isSubtask}
                    parentId={commentsPopup.parentId}
                    onAddComment={handleAddComment}
                    onClose={() => {
                        setCommentsPopup(null);
                        // Remove comment from URL when closing (but keep task if present)
                        updateUrl({ clearComment: true });
                    }}
                    position={commentsPopup.position}
                    triggerPosition={commentsPopup.triggerPosition}
                />
            )}

            {commentsPopup && !CommentsPopupComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[120] p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-sm text-center shadow-lg space-y-2">
                        <p className="text-sm text-gray-700 font-medium">
                            {isCommentsPopupLoading
                                ? 'Loading comments workspace...'
                                : 'Preparing comments workspace. Please wait...'}
                        </p>
                        <p className="text-xs text-gray-500">
                            This screen opens once the CommentsPopup component finishes loading.
                        </p>
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setCommentsPopup(null);
                                    // Remove comment from URL when closing (but keep task if present)
                                    updateUrl({ clearComment: true });
                                }}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
                </>
            )}

            {/* Always render DocumentCollectionProcessSection when hasDocumentCollectionProcess is true */}
            {/* This prevents remounting when switching between sections */}
            {/* Use a stable key based on project ID to prevent remounts */}
            {(hasDocumentCollectionProcess || forceDocumentCollectionDeepLink) && (
                <DocumentCollectionProcessSection
                    key={`doc-collection-${project?.id || 'default'}`}
                    project={project}
                    hasDocumentCollectionProcess={hasDocumentCollectionProcess || forceDocumentCollectionDeepLink}
                    activeSection={activeSection}
                    onBack={handleBackToOverview}
                />
            )}
            
            {/* Always render WeeklyFMSReviewProcessSection when hasWeeklyFMSReviewProcess is true */}
            {hasWeeklyFMSReviewProcess && (
                <WeeklyFMSReviewProcessSection
                    key={`weekly-fms-review-${project?.id || 'default'}`}
                    project={project}
                    hasWeeklyFMSReviewProcess={hasWeeklyFMSReviewProcess}
                    activeSection={activeSection}
                    onBack={handleBackToOverview}
                />
            )}
            
            {/* Always render MonthlyFMSReviewProcessSection when the Monthly FMS tab is active */}
            {activeSection === 'monthlyFMSReview' && (
                <MonthlyFMSReviewProcessSection
                    key={`monthly-fms-review-${project?.id || 'default'}`}
                    project={project}
                    hasMonthlyFMSReviewProcess={true}
                    activeSection={activeSection}
                    onBack={handleBackToOverview}
                />
            )}

            {/* Monthly Data Review tab - same functionality as Document Collection (tracker with year, sections, documents, status, comments) */}
            {hasMonthlyDataReviewProcess && (
                <MonthlyDataReviewProcessSection
                    key={`monthly-data-review-${project?.id || 'default'}`}
                    project={project}
                    hasMonthlyDataReviewProcess={hasMonthlyDataReviewProcess}
                    activeSection={activeSection}
                    onBack={handleBackToOverview}
                />
            )}

            {/* Compliance Review tab - same tracker as Monthly Data Review, separate data */}
            {hasComplianceReviewProcess && (
                <ComplianceReviewProcessSection
                    key={`compliance-review-${project?.id || 'default'}`}
                    project={project}
                    hasComplianceReviewProcess={hasComplianceReviewProcess}
                    activeSection={activeSection}
                    onBack={handleBackToOverview}
                />
            )}

            {/* Modals */}
            {showListModal && listModalComponent && window.React && window.React.createElement(
                listModalComponent,
                {
                    list: editingList,
                    onSave: handleSaveList,
                    onClose: () => {
                        setShowListModal(false);
                        setEditingList(null);
                    }
                }
            )}

            {showListModal && !listModalComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-sm text-center">
                        <p className="text-sm text-gray-700">
                            {isListModalLoading
                                ? 'Loading list editor...'
                                : 'Preparing list editor. Please wait...'}
                        </p>
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowListModal(false);
                                    setEditingList(null);
                                }}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCustomFieldModal && CustomFieldModalComponent && (
                <CustomFieldModalComponent
                    customFields={customFieldDefinitions}
                    onAdd={handleAddCustomField}
                    onClose={() => setShowCustomFieldModal(false)}
                />
            )}
            {showCustomFieldModal && !CustomFieldModalComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-sm text-center shadow-lg space-y-2">
                        <p className="text-sm text-gray-700 font-medium">
                            Loading custom fields modal...
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowCustomFieldModal(false)}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {showProjectModal && ProjectModalComponent && (
                <ProjectModalComponent
                    project={project}
                    onSave={async (projectData) => {
                        try {
                            const hasClientField = Object.prototype.hasOwnProperty.call(projectData, 'client');
                            const normalizedClient = hasClientField
                                ? projectData.client
                                : (project.clientName ?? project.client ?? '');

                            const payload = {
                                ...projectData,
                                clientName: normalizedClient,
                                client: normalizedClient
                            };

                            const projectApi = window.DatabaseAPI?.updateProject
                                ? window.DatabaseAPI
                                : window.api;

                            const apiResponse = await projectApi.updateProject(project.id, payload);
                            const updatedProject = apiResponse?.data?.project
                                || apiResponse?.project
                                || { ...project, ...payload };

                            if (!updatedProject.client && updatedProject.clientName) {
                                updatedProject.client = updatedProject.clientName;
                            }

                            if (typeof onProjectUpdate === 'function') {
                                onProjectUpdate(updatedProject);
                            }

                            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                                const savedProjects = await window.dataService.getProjects();
                                if (savedProjects && Array.isArray(savedProjects)) {
                                    const updatedProjects = savedProjects.map(p => 
                                        p.id === project.id ? { ...p, ...updatedProject } : p
                                    );
                                    if (typeof window.dataService.setProjects === 'function') {
                                        try {
                                            await window.dataService.setProjects(updatedProjects);
                                        } catch (saveError) {
                                            console.warn('Failed to save projects to dataService:', saveError);
                                        }
                                    } else {
                                        console.warn('DataService not available or setProjects method not found');
                                    }
                                }
                            } else {
                                console.warn('DataService not available or getProjects method not found');
                            }
                        } catch (error) {
                            console.error('Error saving project:', error);
                            alert('Failed to save project. Please try again.');
                        } finally {
                            setShowProjectModal(false);
                        }
                    }}
                    onDelete={async (projectId) => {
                        if (onDelete && typeof onDelete === 'function') {
                            await onDelete(projectId);
                            setShowProjectModal(false);
                            onBack();
                        } else {
                            console.error('❌ ProjectDetail: No onDelete handler provided');
                            alert('Delete functionality not available. Please use the projects list to delete.');
                        }
                    }}
                    onClose={() => setShowProjectModal(false)}
                />
            )}
            {showProjectModal && !ProjectModalComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-sm text-center shadow-lg space-y-2">
                        <p className="text-sm text-gray-700 font-medium">
                            {isProjectModalLoading
                                ? 'Loading project settings...'
                                : 'Preparing project settings. Please wait...'}
                        </p>
                        <p className="text-xs text-gray-500">
                            This screen opens once ProjectModal finishes loading.
                        </p>
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={() => setShowProjectModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showTaskDetailModal && TaskDetailModalComponent && (
                <TaskDetailModalComponent
                    task={viewingTask}
                    parentTask={viewingTaskParent}
                    customFieldDefinitions={customFieldDefinitions}
                    taskLists={taskLists}
                    project={activityLogEntries !== null ? { ...project, activityLog: activityLogEntries } : project}
                    users={users}
                    focusInput={taskFocusInput?.focusInput || null}
                    focusTaskId={taskFocusInput?.taskId || null}
                    initialTab={taskFocusInput?.tab || null}
                    onFocusHandled={() => setTaskFocusInput(null)}
                    onUpdate={handleUpdateTaskFromDetail}
                    onAddSubtask={handleAddSubtask}
                    onViewSubtask={handleViewTaskDetail}
                    onDeleteSubtask={handleDeleteSubtask}
                    onDeleteTask={handleDeleteTask}
                    onClose={handleCloseTaskModal}
                />
            )}

            {showTaskDetailModal && !TaskDetailModalComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-sm text-center shadow-lg space-y-2">
                        <p className="text-sm text-gray-700 font-medium">
                            {isTaskDetailModalLoading
                                ? 'Loading task workspace...'
                                : 'Preparing task workspace. Please wait...'}
                        </p>
                        <p className="text-xs text-gray-500">
                            This screen opens once TaskDetailModal finishes loading.
                        </p>
                        <div className="mt-4">
                            <button
                                type="button"
                                onClick={handleCloseTaskModal}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDocumentModal && DocumentCollectionModalComponent && (
                <DocumentCollectionModalComponent
                    document={editingDocument}
                    onSave={handleSaveDocument}
                    onClose={() => {
                        setShowDocumentModal(false);
                        setEditingDocument(null);
                    }}
                    users={users}
                />
            )}
            {showDocumentModal && !DocumentCollectionModalComponent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg p-4 w-full max-w-sm text-center shadow-lg space-y-2">
                        <p className="text-sm text-gray-700 font-medium">
                            Loading document modal...
                        </p>
                        <button
                            type="button"
                            onClick={() => {
                                setShowDocumentModal(false);
                                setEditingDocument(null);
                            }}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

    // Make available globally - INSIDE initializeProjectDetail function
    
    // Validate component before registering
    const validateComponent = () => {
        if (!ProjectDetail) {
            throw new Error('ProjectDetail component is undefined');
        }
        
        if (typeof ProjectDetail !== 'function') {
            throw new Error(`ProjectDetail is not a function, got: ${typeof ProjectDetail}`);
        }
        
        // Check if it's a valid React component (could be function, memo, forwardRef, etc.)
        const isValidReactComponent = 
            typeof ProjectDetail === 'function' ||
            (typeof ProjectDetail === 'object' && (ProjectDetail.$$typeof || ProjectDetail.type));
        
        if (!isValidReactComponent) {
            console.warn('⚠️ ProjectDetail may not be a valid React component');
        }
        
        return true;
    };
    
    try {
        // Validate first
        validateComponent();
        
        // Register component
        window.ProjectDetail = ProjectDetail;
        
        // Health check: Verify it's actually registered and callable
        if (!window.ProjectDetail) {
            throw new Error('Registration failed: window.ProjectDetail is still undefined');
        }
        
        if (typeof window.ProjectDetail !== 'function') {
            throw new Error(`Registration failed: window.ProjectDetail is not a function, got: ${typeof window.ProjectDetail}`);
        }
        
        
        // Clear initialization flag
        window._projectDetailInitializing = false;
        
        // Dispatch event to notify that ProjectDetail is loaded
        try {
            window.dispatchEvent(new CustomEvent('componentLoaded', { 
                detail: { component: 'ProjectDetail' } 
            }));
        } catch (error) {
            console.warn('⚠️ Failed to dispatch componentLoaded event:', error);
        }
        
        // Set up periodic health check (every 5 seconds for first 30 seconds)
        let healthCheckCount = 0;
        const maxHealthChecks = 6; // 6 checks * 5 seconds = 30 seconds
        const healthCheckInterval = setInterval(() => {
            healthCheckCount++;
            if (!window.ProjectDetail) {
                console.error(`❌ ProjectDetail health check ${healthCheckCount}: Component disappeared!`);
                console.error('❌ Attempting to re-register...');
                window.ProjectDetail = ProjectDetail;
            } else if (typeof window.ProjectDetail !== 'function') {
                console.error(`❌ ProjectDetail health check ${healthCheckCount}: Component corrupted!`);
                console.error('❌ Attempting to re-register...');
                window.ProjectDetail = ProjectDetail;
            } else {
            }
            
            if (healthCheckCount >= maxHealthChecks) {
                clearInterval(healthCheckInterval);
            }
        }, 5000);
        
    } catch (error) {
        console.error('❌ CRITICAL: Failed to register ProjectDetail on window:', error);
        console.error('❌ Error details:', error.message, error.stack);
        window._projectDetailInitializing = false;
        
        // Try to register anyway if possible
        try {
            if (typeof ProjectDetail !== 'undefined') {
                window.ProjectDetail = ProjectDetail;
                window._projectDetailInitializing = false;
            }
        } catch (recoveryError) {
            console.error('❌ Failed to recover ProjectDetail registration:', recoveryError);
            window._projectDetailInitializing = false;
        }
    }
}
