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

            // Preload component when document collection section is active or about to be active
            useEffectSection(() => {
                // If already ready, no need to load
                if (trackerReady) return;

                // If section is documentCollection or project has document collection process, load immediately
                if (activeSection === 'documentCollection' || hasDocumentCollectionProcess) {
                    loadTrackerComponent();
                }
            }, [activeSection, hasDocumentCollectionProcess, trackerReady, loadTrackerComponent]);


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

            // Only render MonthlyDocumentCollectionTracker when activeSection is documentCollection
            // This prevents it from being rendered when not needed, but DocumentCollectionProcessSection
            // stays mounted to prevent remounting issues
            if (activeSection !== 'documentCollection') {
                return null;
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
                    key={`tracker-${project?.id || 'default'}`}
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
    // Always default to the Overview tab when opening a project.
    // We intentionally do NOT restore the last viewed tab from storage anymore,
    // as per product decision to keep the entry point consistent.
    const [activeSection, setActiveSection] = useState('overview');
    
    // Wrapper function to update both section state and URL
    const switchSection = useCallback((section, options = {}) => {
        setActiveSection(section);
        
        // Update URL if updateProjectUrl function is available
        if (window.updateProjectUrl && project?.id) {
            window.updateProjectUrl({
                tab: section,
                section: options.section,
                commentId: options.commentId
            });
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
        
        const { task: taskId = null, comment: commentId = null, clearTask = false, clearComment = false } = options;
        
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
                window.RouteState.navigate({
                    page: 'projects',
                    segments: [projectId], // CRITICAL: Always include project ID in segments
                    search: newSearch,
                    preserveSearch: false,
                    preserveHash: false
                });
                urlUpdated = true;
            } catch (e) {
                console.warn('⚠️ RouteState.navigate failed, using fallback:', e);
            }
        }
        
        if (!urlUpdated && window.RouteState?.setPageSubpath) {
            try {
                // Use setPageSubpath - explicitly set segments to include project ID
                window.RouteState.setPageSubpath('projects', [projectId], { // CRITICAL: Always include project ID
                    replace: false,
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
            
            // Use pushState to update URL
            try {
                window.history.pushState({}, '', url);
                console.log('✅ URL updated directly:', url.href, '(was:', window.location.href + ')');
                
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
    
    // Initialize taskLists with project-specific data
    // CRITICAL: If project.taskLists is empty array, use default lists to ensure tasks can be displayed
    const [taskLists, setTaskLists] = useState(
        (project.taskLists && Array.isArray(project.taskLists) && project.taskLists.length > 0) 
            ? project.taskLists 
            : [
                { id: 1, name: 'To Do', color: 'blue', description: '' },
                { id: 2, name: 'In Progress', color: 'yellow', description: '' },
                { id: 3, name: 'Done', color: 'green', description: '' }
            ]
    );

    // Initialize tasks with project-specific data
    // NOTE: API returns tasks in tasksList field (from Task table), not tasks field
    const initialTasks = project.tasksList || project.tasks || [];
    const [tasks, setTasks] = useState(initialTasks);
    const [viewingTask, setViewingTask] = useState(null);
    const [viewingTaskParent, setViewingTaskParent] = useState(null);
    // Use a ref to store current tasks value to avoid TDZ issues in closures
    const tasksRef = useRef(initialTasks);
    // Keep ref in sync with state
    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);
    const [taskFilters, setTaskFilters] = useState({
        search: '',
        status: 'all',
        assignee: 'all',
        priority: 'all',
        list: 'all',
        includeSubtasks: true
    });
    
    // Load tasks from Task API (new approach) or fallback to JSON (backward compatibility)
    const loadTasksFromAPI = useCallback(async (projectId) => {
        if (!projectId || !window.DatabaseAPI?.makeRequest) {
            console.warn('⚠️ ProjectDetail: Cannot load tasks from API - missing projectId or DatabaseAPI');
            return null;
        }

        try {
            // Use lightweight mode (skip comments) for faster refresh - comments already loaded from project prop
            const url = `/tasks?projectId=${encodeURIComponent(projectId)}&includeComments=false`;
            const response = await window.DatabaseAPI.makeRequest(url, { method: 'GET' });
            const data = response?.data || response;
            
            if (data?.tasks && Array.isArray(data.tasks)) {
                console.log('✅ ProjectDetail: Loaded tasks from Task API:', {
                    projectId,
                    taskCount: data.tasks.length
                });
                return data.tasks;
            }
            
            console.warn('⚠️ ProjectDetail: Task API returned no tasks');
            return null;
        } catch (error) {
            console.warn('⚠️ ProjectDetail: Failed to load tasks from API, will use JSON fallback:', error);
            return null;
        }
    }, []);

    // Sync tasks when project prop changes (e.g., after reload or navigation)
    // Use a ref to track previous project ID to prevent infinite loops
    const previousProjectIdRef = useRef(null);
    // Track if we've loaded tasks for the current project (prevents showing zero on initial load)
    const hasLoadedTasksRef = useRef(false);
    // Track URL/route to detect navigation back to the same project
    const [routeKey, setRouteKey] = useState(() => {
        // Initialize with current URL to detect changes
        if (typeof window !== 'undefined' && window.location) {
            return `${window.location.pathname}${window.location.search}${window.location.hash}`;
        }
        return '';
    });
    // Track previous routeKey to detect navigation back
    const previousRouteKeyRef = useRef(routeKey);
    
    // Listen for route/URL changes to detect navigation back
    useEffect(() => {
        const updateRouteKey = () => {
            if (typeof window !== 'undefined' && window.location) {
                const newRouteKey = `${window.location.pathname}${window.location.search}${window.location.hash}`;
                setRouteKey(prev => {
                    if (prev !== newRouteKey) {
                        console.log('🔄 ProjectDetail: Route changed', { from: prev, to: newRouteKey });
                        // Check if we navigated away from the project page
                        const isProjectPage = project?.id && window.location?.pathname?.includes(`/projects/${project.id}`);
                        const wasProjectPage = project?.id && prev?.includes(`/projects/${project.id}`);
                        
                        // If we navigated away from project page, reset hasLoadedTasksRef so tasks reload when we come back
                        if (wasProjectPage && !isProjectPage && hasLoadedTasksRef.current) {
                            console.log('🔄 ProjectDetail: Navigated away from project, resetting hasLoadedTasksRef');
                            hasLoadedTasksRef.current = false;
                        }
                        return newRouteKey;
                    }
                    return prev;
                });
            }
        };
        
        // Listen for route changes
        if (window.RouteState && typeof window.RouteState.subscribe === 'function') {
            const unsubscribe = window.RouteState.subscribe(() => {
                updateRouteKey();
            });
            return unsubscribe;
        }
        
        // Fallback: listen for hashchange and popstate
        window.addEventListener('hashchange', updateRouteKey);
        window.addEventListener('popstate', updateRouteKey);
        
        return () => {
            window.removeEventListener('hashchange', updateRouteKey);
            window.removeEventListener('popstate', updateRouteKey);
        };
    }, [project?.id]);
    
    useEffect(() => {
        // OPTIMIZATION: Use tasks from project prop immediately for instant load
        // The project already includes tasks from /api/projects/[id], so no need to wait for API call
        const projectIdChanged = project?.id !== previousProjectIdRef.current;
        const routeChanged = routeKey !== previousRouteKeyRef.current;
        
        if (projectIdChanged) {
            previousProjectIdRef.current = project?.id;
            hasLoadedTasksRef.current = false; // Reset flag when project changes
        }
        
        // Update previous routeKey after checking
        if (routeChanged) {
            previousRouteKeyRef.current = routeKey;
        }
        
        // Check if we're currently on the project page
        const isOnProjectPage = project?.id && (
            window.location?.pathname?.includes(`/projects/${project.id}`) ||
            (window.RouteState?.getRoute?.()?.page === 'projects' && 
             window.RouteState.getRoute()?.segments?.[0] === String(project.id))
        );
        
        // IMMEDIATE: Use tasks from project prop if available (instant load)
        const tasksFromProject = project?.tasksList || project?.tasks || [];
        const hasTasksInProject = Array.isArray(tasksFromProject) && tasksFromProject.length >= 0; // Allow empty arrays
        
        if (projectIdChanged && hasTasksInProject) {
            // Project changed and has tasks - use them immediately
            setTasks(tasksFromProject);
            tasksRef.current = tasksFromProject;
            hasLoadedTasksRef.current = true;
            console.log('✅ ProjectDetail: Using tasks from project prop (instant):', tasksFromProject.length);
        } else if (!hasLoadedTasksRef.current && hasTasksInProject) {
            // Initial load - use tasks from project prop immediately
            setTasks(tasksFromProject);
            tasksRef.current = tasksFromProject;
            hasLoadedTasksRef.current = true;
            console.log('✅ ProjectDetail: Using tasks from project prop (instant):', tasksFromProject.length);
        } else if (!project?.id) {
            // No project ID, use tasksList from project prop
            setTasks(tasksFromProject);
            tasksRef.current = tasksFromProject;
        }
        
        // BACKGROUND REFRESH: Refresh from API in the background to ensure we have latest data
        // This runs asynchronously and doesn't block the UI
        const shouldRefreshInBackground = project?.id && (
            projectIdChanged || 
            !hasLoadedTasksRef.current ||
            (isOnProjectPage && routeChanged)
        );
        
        if (shouldRefreshInBackground) {
            // Mark as loaded to prevent duplicate calls
            if (!hasLoadedTasksRef.current) {
                hasLoadedTasksRef.current = true;
            }
            
            // Refresh in background (non-blocking)
            loadTasksFromAPI(project.id).then(apiTasks => {
                if (apiTasks !== null && Array.isArray(apiTasks)) {
                    // Only update if we got valid tasks and they're different
                    const currentTaskIds = (tasksRef.current || []).map(t => t.id).sort().join(',');
                    const apiTaskIds = apiTasks.map(t => t.id).sort().join(',');
                    
                    if (currentTaskIds !== apiTaskIds || apiTasks.length !== (tasksRef.current || []).length) {
                        setTasks(apiTasks);
                        tasksRef.current = apiTasks;
                        console.log('✅ ProjectDetail: Tasks refreshed from API (background):', apiTasks.length);
                    }
                }
            }).catch(error => {
                // Silently fail - we already have tasks from project prop
                console.debug('⚠️ ProjectDetail: Background task refresh failed (using project prop tasks):', error.message);
            });
        }
    }, [project?.id, project?.tasksList, project?.tasks, loadTasksFromAPI, routeKey]); // Include project tasks in deps
    
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
                // Set default lists when project.taskLists is empty
                const defaultLists = [
                    { id: 1, name: 'To Do', color: 'blue', description: '' },
                    { id: 2, name: 'In Progress', color: 'yellow', description: '' },
                    { id: 3, name: 'Done', color: 'green', description: '' }
                ];
                console.log('✅ ProjectDetail: Initializing default taskLists for project:', project.id);
                setTaskLists(defaultLists);
            } else {
                // Project has taskLists, use them
                setTaskLists(project.taskLists);
            }
        } else {
            // Same project, but project.taskLists might have changed
            // Only update if project.taskLists exists and is different from current state
            const hasTaskLists = project.taskLists && Array.isArray(project.taskLists) && project.taskLists.length > 0;
            if (hasTaskLists) {
                // Check if current state differs from project.taskLists
                setTaskLists(prev => {
                    const prevIds = prev?.map(l => l.id).sort().join(',') || '';
                    const projectIds = project.taskLists.map(l => l.id).sort().join(',');
                    if (prevIds !== projectIds) {
                        return project.taskLists;
                    }
                    return prev;
                });
            }
        }
    }, [project?.id, project?.taskLists]); // Run when project ID or taskLists changes
    
    // CRITICAL: Ensure project ID is always in URL when ProjectDetail is rendered
    useEffect(() => {
        if (!project?.id) return;
        
        const currentPathname = window.location.pathname;
        const expectedPath = `/projects/${project.id}`;
        
        // Check if pathname exactly matches expected path (not just contains project ID)
        // This prevents false positives when one project ID is a substring of another
        const pathMatches = currentPathname === expectedPath || currentPathname.startsWith(expectedPath + '/');
        
        // Only fix URL if pathname doesn't match expected path
        if (!pathMatches) {
            console.log('🔧 ProjectDetail: URL missing project ID, fixing...', {
                currentPathname,
                expectedPath
            });
            
            // Preserve any existing search params (like task=)
            const currentSearch = window.location.search;
            const url = new URL(window.location.href);
            url.pathname = expectedPath;
            // Keep existing search params
            if (currentSearch) {
                url.search = currentSearch;
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
    
    // Listen for switchProjectTab event to handle programmatic tab switching
    useEffect(() => {
        const handleSwitchTab = (event) => {
            if (!event.detail) return;
            const { tab, section, commentId } = event.detail;
            if (tab) {
                switchSection(tab, { section, commentId });
            }
        };
        
        window.addEventListener('switchProjectTab', handleSwitchTab);
        return () => window.removeEventListener('switchProjectTab', handleSwitchTab);
    }, [switchSection]);
    
    // Listen for switchProjectSection event
    useEffect(() => {
        const handleSwitchSection = (event) => {
            if (!event.detail) return;
            const { section, commentId } = event.detail;
            if (section) {
                switchSection(activeSection, { section, commentId });
            }
        };
        
        window.addEventListener('switchProjectSection', handleSwitchSection);
        return () => window.removeEventListener('switchProjectSection', handleSwitchSection);
    }, [activeSection, switchSection]);
    
    // Listen for scrollToComment event
    useEffect(() => {
        const handleScrollToComment = (event) => {
            if (!event.detail || !event.detail.commentId) return;
            const { commentId, taskId } = event.detail;
            
            // Update URL with commentId (and taskId if provided)
            updateUrl({ 
                task: taskId || undefined,
                comment: commentId 
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
    // Use a ref to track the previous project ID to only reset when actually switching projects
    const previousProjectIdForSectionRef = useRef(project?.id);
    useEffect(() => {
        if (!project?.id) return;
        
        // Only reset to overview if we're actually switching to a different project
        const projectIdChanged = previousProjectIdForSectionRef.current !== project?.id;
        if (projectIdChanged && previousProjectIdForSectionRef.current !== null && previousProjectIdForSectionRef.current !== undefined) {
            // We're switching to a different project, reset to overview
            if (activeSection !== 'overview') {
                switchSection('overview');
            }
            previousProjectIdForSectionRef.current = project?.id;
        } else if (previousProjectIdForSectionRef.current === null || previousProjectIdForSectionRef.current === undefined) {
            // First time setting project ID, just track it
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
        
        // Sync when value changes from prop (e.g., after database refresh)
        // Only skip sync if ref is set AND we're not switching projects
        // This ensures that when navigating back, we always sync from the database
        if (normalizedValue !== hasWeeklyFMSReviewProcess) {
            console.log('🔄 ProjectDetail: Syncing hasWeeklyFMSReviewProcess from prop', {
                projectId: project?.id,
                propValue: project.hasWeeklyFMSReviewProcess,
                normalizedValue,
                currentState: hasWeeklyFMSReviewProcess,
                refValue: hasWeeklyFMSReviewProcessChangedRef.current
            });
            // Always sync - the ref is reset when project.id changes anyway
            setHasWeeklyFMSReviewProcess(normalizedValue);
            // Reset the ref after syncing from prop to allow future syncs
            hasWeeklyFMSReviewProcessChangedRef.current = false;
        }
    }, [project.hasWeeklyFMSReviewProcess, project.id, hasWeeklyFMSReviewProcess]);
    
    // Also sync on mount to ensure we have the latest value
    useEffect(() => {
        const normalizedValue = normalizeHasWeeklyFMSReviewProcess(project.hasWeeklyFMSReviewProcess);
        console.log('🔄 ProjectDetail: Syncing hasWeeklyFMSReviewProcess on project.id change', {
            projectId: project?.id,
            propValue: project.hasWeeklyFMSReviewProcess,
            normalizedValue,
            currentState: hasWeeklyFMSReviewProcess,
            willSync: normalizedValue !== hasWeeklyFMSReviewProcess
        });
        // Only set if different to avoid unnecessary updates
        if (normalizedValue !== hasWeeklyFMSReviewProcess) {
            setHasWeeklyFMSReviewProcess(normalizedValue);
        }
        // Reset the changed ref when project changes to allow sync from database
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
    
    // Sync hasMonthlyFMSReviewProcess when project prop changes (e.g., after reloading from database)
    // But only if it hasn't been explicitly changed by the user recently
    const hasMonthlyFMSReviewProcessChangedRef = useRef(false);
    
    useEffect(() => {
        const normalizedValue = normalizeHasMonthlyFMSReviewProcess(project.hasMonthlyFMSReviewProcess);
        
        // Sync when value changes from prop (e.g., after database refresh)
        // Only skip sync if ref is set AND we're not switching projects
        // This ensures that when navigating back, we always sync from the database
        if (normalizedValue !== hasMonthlyFMSReviewProcess) {
            // Always sync - the ref is reset when project.id changes anyway
            setHasMonthlyFMSReviewProcess(normalizedValue);
            // Reset the ref after syncing from prop to allow future syncs
            hasMonthlyFMSReviewProcessChangedRef.current = false;
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
                
                // First check hash query params (for hash-based routing like #/projects/123?docSectionId=...)
                const hash = window.location.hash || '';
                if (hash.includes('?')) {
                    const hashParts = hash.split('?');
                    if (hashParts.length > 1) {
                        params = new URLSearchParams(hashParts[1]);
                        deepSectionId = params.get('docSectionId');
                        deepDocumentId = params.get('docDocumentId');
                        deepMonth = params.get('docMonth');
                    }
                }
                
                // If not found in hash, check window.location.search (for regular URLs)
                if (!deepSectionId || !deepDocumentId || !deepMonth) {
                    const search = window.location.search || '';
                    if (search) {
                        params = new URLSearchParams(search);
                        if (!deepSectionId) deepSectionId = params.get('docSectionId');
                        if (!deepDocumentId) deepDocumentId = params.get('docDocumentId');
                        if (!deepMonth) deepMonth = params.get('docMonth');
                    }
                }
                
                if (deepSectionId && deepDocumentId && deepMonth) {
                    // Only switch if not already on document collection tab
                    if (activeSection !== 'documentCollection') {
                        switchSection('documentCollection');
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
                        weeklySectionId = params.get('weeklySectionId');
                        weeklyDocumentId = params.get('weeklyDocumentId');
                        weeklyMonth = params.get('weeklyMonth');
                        weeklyWeek = params.get('weeklyWeek');
                        commentId = params.get('commentId');
                    }
                }
                
                // If not found in hash, check window.location.search (for regular URLs)
                if (!weeklySectionId || !weeklyDocumentId) {
                    const search = window.location.search || '';
                    if (search) {
                        params = new URLSearchParams(search);
                        if (!weeklySectionId) weeklySectionId = params.get('weeklySectionId');
                        if (!weeklyDocumentId) weeklyDocumentId = params.get('weeklyDocumentId');
                        if (!weeklyMonth) weeklyMonth = params.get('weeklyMonth');
                        if (!weeklyWeek) weeklyWeek = params.get('weeklyWeek');
                        if (!commentId) commentId = params.get('commentId');
                    }
                }
                
                if (weeklySectionId && weeklyDocumentId) {
                    // Only switch if not already on weekly FMS review tab
                    if (activeSection !== 'weeklyFMSReview') {
                        switchSection('weeklyFMSReview');
                    }
                }
            } catch (error) {
                console.warn('⚠️ ProjectDetail: failed to apply weekly FMS review deep-link:', error);
            }
        };
        
        // Check immediately
        checkAndSwitchToDocumentCollection();
        checkAndSwitchToWeeklyFMSReview();
        
        // Also listen for hash changes
        const handleHashChange = () => {
            setTimeout(() => {
                checkAndSwitchToDocumentCollection();
                checkAndSwitchToWeeklyFMSReview();
            }, 100);
        };
        
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [project?.id, switchSection, activeSection, project?.hasWeeklyFMSReviewProcess]);
    
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
                
                // Also check for commentId in URL
                let commentId = null;
                if (params) {
                    commentId = params.get('commentId');
                } else {
                    const search = window.location.search || '';
                    if (search) {
                        const searchParams = new URLSearchParams(search);
                        commentId = searchParams.get('commentId');
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
    }, [project.hasDocumentCollectionProcess, project.id]);
    
    // Also sync on mount to ensure we have the latest value
    useEffect(() => {
        const normalizedValue = normalizeHasDocumentCollectionProcess(project.hasDocumentCollectionProcess);
        setHasDocumentCollectionProcess(normalizedValue);
    }, [project.id]); // Re-sync whenever we switch to a different project

    // Preload MonthlyDocumentCollectionTracker when project has document collection process enabled
    useEffect(() => {
        if (!hasDocumentCollectionProcess) return;
        
        // If component is already available, no need to preload
        if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
            return;
        }

        // Preload the component immediately
        if (window.loadComponent && typeof window.loadComponent === 'function') {
            window.loadComponent('./src/components/projects/MonthlyDocumentCollectionTracker.jsx')
                .catch(() => {
                    // Silently fail - component will load when needed
                });
        }
    }, [hasDocumentCollectionProcess, project.id]);
    
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
    const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [editingList, setEditingList] = useState(null);
    const [creatingTaskForList, setCreatingTaskForList] = useState(null);
    const [creatingTaskWithStatus, setCreatingTaskWithStatus] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'kanban'
    const [editingDocument, setEditingDocument] = useState(null);
    
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
        nextHasDocumentCollectionProcess,
        nextHasWeeklyFMSReviewProcess,
        nextHasMonthlyFMSReviewProcess,
        excludeHasDocumentCollectionProcess = false,
        excludeHasWeeklyFMSReviewProcess = false,
        excludeHasMonthlyFMSReviewProcess = false,
        excludeDocumentSections = true,  // Default to true: don't overwrite documentSections managed by MonthlyDocumentCollectionTracker
        excludeWeeklyFMSReviewSections = true,  // Default to true: don't overwrite weeklyFMSReviewSections managed by WeeklyFMSReviewTracker
        excludeMonthlyFMSReviewSections = true  // Default to true: don't overwrite monthlyFMSReviewSections managed by MonthlyFMSReviewTracker
    } = {}) => {
        // Use provided values or fall back to current state from ref (avoids TDZ issues)
        const tasksToSave = nextTasks !== undefined ? nextTasks : tasksRef.current;
        const taskListsToSave = nextTaskLists !== undefined ? nextTaskLists : taskLists;
        const customFieldDefinitionsToSave = nextCustomFieldDefinitions !== undefined ? nextCustomFieldDefinitions : customFieldDefinitions;
        const documentsToSave = nextDocuments !== undefined ? nextDocuments : documents;
        const hasDocumentCollectionProcessToSave = nextHasDocumentCollectionProcess !== undefined ? nextHasDocumentCollectionProcess : hasDocumentCollectionProcess;
        const hasWeeklyFMSReviewProcessToSave = nextHasWeeklyFMSReviewProcess !== undefined ? nextHasWeeklyFMSReviewProcess : hasWeeklyFMSReviewProcess;
        const hasMonthlyFMSReviewProcessToSave = nextHasMonthlyFMSReviewProcess !== undefined ? nextHasMonthlyFMSReviewProcess : hasMonthlyFMSReviewProcess;
        
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
                            hasDocumentCollectionProcess: hasDocumentCollectionProcessToSave,
                            hasWeeklyFMSReviewProcess: hasWeeklyFMSReviewProcessToSave,
                            hasMonthlyFMSReviewProcess: hasMonthlyFMSReviewProcessToSave,
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
    }, [project.id, serializedDocumentSections, documentSectionsArray, taskLists, customFieldDefinitions, documents, hasDocumentCollectionProcess, hasWeeklyFMSReviewProcess]);
    
    // Track if hasDocumentCollectionProcess was explicitly changed by user
    const hasDocumentCollectionProcessChangedRef = useRef(false);
    
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

    // Overview Section
    const OverviewSection = () => {
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'Done').length;
        const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        const activeUsers = users.filter(u => u.status === 'Active');

        // Calculate days until due
        const today = new Date();
        const dueDate = project.dueDate ? new Date(project.dueDate) : null;
        const daysUntilDue = dueDate ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : null;

        return (
            <div className="space-y-4">
                {/* Project Info Card */}
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
                            <span className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
                                project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                project.status === 'Active' ? 'bg-green-100 text-green-700' :
                                project.status === 'Completed' ? 'bg-purple-100 text-purple-700' :
                                project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-700' :
                                project.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                            }`}>
                                {project.status}
                            </span>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Assigned To</label>
                            <p className="text-sm text-gray-900">{project.assignedTo || 'Not assigned'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Start Date</label>
                            <p className="text-sm text-gray-900">{project.startDate || 'Not set'}</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-0.5">Due Date</label>
                            <p className="text-sm text-gray-900">{project.dueDate || 'Not set'}</p>
                        </div>
                        {project.description && (
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-500 mb-0.5">Description</label>
                                <p className="text-sm text-gray-700">{project.description}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Quick Stats */}
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
                                <p className={`text-xl font-bold ${
                                    daysUntilDue === null ? 'text-gray-400' :
                                    daysUntilDue < 0 ? 'text-red-600' :
                                    daysUntilDue <= 7 ? 'text-yellow-600' :
                                    'text-gray-900'
                                }`}>
                                    {daysUntilDue === null ? 'N/A' : daysUntilDue < 0 ? `${Math.abs(daysUntilDue)} overdue` : daysUntilDue}
                                </p>
                            </div>
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                <i className="fas fa-calendar-alt text-purple-600"></i>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Documents Section */}
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
                        <button
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.multiple = true;
                                input.onchange = (e) => {
                                    // Get current user info
                                    const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
                                    
                                    const files = Array.from(e.target.files);
                                    const newDocs = files.map(file => ({
                                        id: Date.now() + Math.random(),
                                        name: file.name,
                                        size: file.size,
                                        type: file.type,
                                        uploadedAt: new Date().toISOString(),
                                        uploadedBy: currentUser.name,
                                        uploadedByEmail: currentUser.email,
                                        uploadedById: currentUser.id
                                    }));
                                    setDocuments(prev => [...prev, ...newDocs]);
                                };
                                input.click();
                            }}
                            className="px-2 py-0.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 transition-colors font-medium flex items-center gap-1"
                        >
                            <i className="fas fa-upload text-[10px]"></i>
                            <span>Upload</span>
                        </button>
                    </div>
                    
                    {documents.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                            <i className="fas fa-file text-3xl mb-2 opacity-50"></i>
                            <p className="text-xs">No documents yet</p>
                            <button
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.multiple = true;
                                    input.onchange = (e) => {
                                        // Get current user info
                                        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
                                        
                                        const files = Array.from(e.target.files);
                                        const newDocs = files.map(file => ({
                                            id: Date.now() + Math.random(),
                                            name: file.name,
                                            size: file.size,
                                            type: file.type,
                                            uploadedAt: new Date().toISOString(),
                                            uploadedBy: currentUser.name,
                                            uploadedByEmail: currentUser.email,
                                            uploadedById: currentUser.id
                                        }));
                                        setDocuments(prev => [...prev, ...newDocs]);
                                    };
                                    input.click();
                                }}
                                className="mt-2 px-2 py-0.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 font-medium flex items-center gap-1 mx-auto"
                            >
                                <i className="fas fa-upload text-[10px]"></i>
                                <span>Upload Documents</span>
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {documents.map(doc => {
                                const fileIcon = doc.type?.includes('pdf') ? 'fa-file-pdf text-red-600' :
                                               doc.type?.includes('word') || doc.type?.includes('document') ? 'fa-file-word text-blue-600' :
                                               doc.type?.includes('excel') || doc.type?.includes('spreadsheet') ? 'fa-file-excel text-green-600' :
                                               doc.type?.includes('image') ? 'fa-file-image text-purple-600' :
                                               'fa-file text-gray-600';
                                const fileSize = doc.size ? (doc.size / 1024).toFixed(1) + ' KB' : 'Unknown size';
                                
                                return (
                                    <div key={doc.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group">
                                        <i className={`fas ${fileIcon} text-xl`}></i>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium text-gray-900 truncate">{doc.name}</p>
                                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                                <span>{fileSize}</span>
                                                <span>•</span>
                                                <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                                                <span>•</span>
                                                <span>{doc.uploadedBy}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                className="text-primary-600 hover:text-primary-800 p-1"
                                                title="Download"
                                            >
                                                <i className="fas fa-download text-xs"></i>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Team Members */}
                {activeUsers.length > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <h2 className="text-sm font-semibold text-gray-900 mb-3">Team Members</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {activeUsers.map(user => (
                                <div key={user.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm">
                                        {user.name.charAt(0)}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-900">{user.name}</p>
                                        <p className="text-xs text-gray-500">{user.role} • {user.department}</p>
                                    </div>
                                    <a href={`mailto:${user.email}`} className="text-primary-600 hover:text-primary-700 text-xs">
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
            if (isSubtask) {
                const parentTask = tasks.find(t => t.id === parentId);
                return parentTask?.subtasks?.find(st => st.id === taskId) || null;
            }
            return tasks.find(t => t.id === taskId) || null;
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
        const updatedTasks = tasks.map(task => {
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

        if (!updatedTargetTask) {
            console.warn('⚠️ handleAddComment: Updated task not resolved after mapping', { taskId, isSubtask, parentId });
            return;
        }

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }

        skipNextSaveRef.current = true;
        setTasks(updatedTasks);

        // tasksList JSON write removed - comments are now stored in TaskComment table
        // Comment persistence is handled by TaskComment API in TaskDetailModal
        setTimeout(() => {
            skipNextSaveRef.current = false;
        }, 500);

        // Use hash-based routing format for email links (frontend uses hash routing)
        const projectLink = project ? `#/projects/${project.id}` : '#/projects';
        const finalTaskId = updatedTargetTask.id || taskId;
        // Build task-specific link with query parameter for direct navigation to task
        const taskLink = finalTaskId ? `${projectLink}?task=${finalTaskId}` : projectLink;
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
                        projectId: project?.id,
                        projectName,
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

        ['To Do', 'In Progress', 'Done', 'Blocked', 'Review'].forEach(addStatus);

        tasks.forEach(task => {
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

        tasks.forEach(task => {
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

        tasks.forEach(task => {
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

        return taskLists
            .filter(list => taskFilters.list === 'all' || String(list.id) === taskFilters.list)
            .map(list => {
                // CRITICAL: Use String() comparison to handle type mismatch (number vs string)
                const tasksForList = tasks
                    .filter(task => String(task.listId) === String(list.id))
                    .map(task => {
                        const taskMatches = matchesTaskFilters(task, list.id);
                        const matchingSubtasks = (task.subtasks || []).filter(subtask => matchesTaskFilters(subtask, list.id));
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

                return {
                    ...list,
                    tasks: tasksForList
                };
            });
    }, [taskLists, tasks, taskFilters, matchesTaskFilters]);

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
            taskFilters.list !== 'all'
        );
    }, [taskFilters]);

    const filteredTopLevelTasks = useMemo(() => {
        if (filteredTaskIdSet.size === 0) {
            return taskFilters.list === 'all' && !hasActiveTaskFilters ? tasks : [];
        }
        return tasks.filter(task => filteredTaskIdSet.has(task.id));
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
    const totalTaskCount = tasks.length;

    const resetTaskFilters = useCallback(() => {
        setTaskFilters({
            search: '',
            status: 'all',
            assignee: 'all',
            priority: 'all',
            list: 'all',
            includeSubtasks: true
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

    const handleSaveList = (listData) => {
        if (editingList) {
            setTaskLists(taskLists.map(l => l.id === editingList.id ? { ...l, ...listData } : l));
        } else {
            const newList = {
                id: Math.max(0, ...taskLists.map(l => l.id)) + 1,
                ...listData
            };
            setTaskLists([...taskLists, newList]);
        }
        setShowListModal(false);
        setEditingList(null);
    };

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
        const tasksInList = tasks.filter(t => t.listId === listId);

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
                
                // Update local state after successful save
                setTasks(tasks.map(t => t.listId === listId ? { ...t, listId: remainingList.id } : t));
                setTaskLists(taskLists.filter(l => l.id !== listId));
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
        const newTask = { listId };
        if (statusName) {
            newTask.status = statusName;
            setCreatingTaskWithStatus(statusName);
        }
        setViewingTask(newTask);
        setViewingTaskParent(null);
        setCreatingTaskForList(listId);
        setShowTaskDetailModal(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // ensureTaskDetailModalLoaded is stable from useCallback, no need in deps

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
        
        // Method 1: Direct URL manipulation (ALWAYS works)
        const url = new URL(window.location.href);
        url.pathname = expectedPath; // Always set pathname with project ID
        url.search = expectedSearch; // Always set search with task ID
        
        // Update immediately - this is the most reliable method
        try {
            window.history.pushState({}, '', url);
            console.log('✅ URL updated via pushState:', url.href);
        } catch (e) {
            console.error('❌ pushState failed, trying replaceState:', e);
            try {
                window.history.replaceState({}, '', url);
                console.log('✅ URL updated via replaceState:', url.href);
            } catch (e2) {
                console.error('❌ Both pushState and replaceState failed:', e2);
            }
        }
        
        // Method 2: Also try RouteState methods (if available) for consistency
        updateUrl({ task: task.id, clearComment: true });
        
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
        
        // CRITICAL: Navigate to clean project URL (without task parameter)
        // This ensures the URL reflects that we're viewing the project, not a task
        // Use RouteState.navigate as PRIMARY method to ensure routing system recognizes the change
        const projectId = String(project?.id);
        if (projectId) {
            const cleanProjectUrl = `${window.location.origin}/projects/${projectId}`;
            
            // Method 1: RouteState.navigate (PRIMARY - ensures routing system recognizes navigation)
            // Do this FIRST to ensure the routing system knows we've navigated away from the task
            if (window.RouteState && typeof window.RouteState.navigate === 'function') {
                try {
                    window.RouteState.navigate({
                        page: 'projects',
                        segments: [projectId],
                        search: '', // Explicitly empty - no task parameter
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
                        search: ''
                    }
                }));
                console.log('✅ ProjectDetail: Dispatched route:change event');
            } catch (e) {
                console.warn('⚠️ Failed to dispatch route change event:', e);
            }
            
            // Method 4: Also update via updateUrl function (for consistency with other handlers)
            updateUrl({ clearTask: true });
            
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
                                search: '',
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
                                    search: '',
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
                        // Force clean the URL
                        const cleanUrl = `${window.location.origin}/projects/${projectId}`;
                        window.history.replaceState({}, '', cleanUrl);
                        if (window.RouteState) {
                            window.RouteState.navigate({
                                page: 'projects',
                                segments: [projectId],
                                search: '',
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
        const { closeModal = true } = options; // Default to closing modal unless explicitly set to false
        
        // Check if this is a new task by looking for it in existing tasks
        // A task is new if:
        // 1. It has no ID (very rare, but possible), OR
        // 2. It has an ID but doesn't exist in the tasks array (or in any subtasks)
        // Note: Temporary IDs from Date.now() are fine - they won't match existing tasks
        const existingTask = tasks.find(t => t.id === updatedTaskData.id);
        const existingSubtask = tasks.find(t => 
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
        
        // Send notification if assignee changed
        if (!isNewTask && oldTask && updatedTaskData.assignee && updatedTaskData.assignee !== oldTask.assignee) {
            
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
                        
                        const response = await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: assigneeUser.id,
                                type: 'task',
                                title: `Task assigned: ${updatedTaskData.title || 'Untitled Task'}`,
                                message: `${currentUser.name} assigned you to "${updatedTaskData.title || 'Untitled Task'}" in project "${project.name}"`,
                                link: taskLink, // Use task-specific link
                                metadata: {
                                    taskId: updatedTaskData.id,
                                    taskTitle: updatedTaskData.title,
                                    projectId: project.id,
                                    projectName: project.name,
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
        
        // Send notification if this is a new task with an assignee
        if (isNewTask && updatedTaskData.assignee) {
            
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
                        
                        const response = await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: assigneeUser.id,
                                type: 'task',
                                title: `Task assigned: ${updatedTaskData.title || 'Untitled Task'}`,
                                message: `${currentUser.name} assigned you to "${updatedTaskData.title || 'Untitled Task'}" in project "${project.name}"`,
                                link: taskLink, // Use task-specific link
                                metadata: {
                                    taskId: updatedTaskData.id,
                                    taskTitle: updatedTaskData.title,
                                    projectId: project.id,
                                    projectName: project.name,
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
        
        if (isNewTask) {
            // Use the ID from updatedTaskData if it exists (set by handleSave), otherwise generate one
            const tempTaskId = updatedTaskData.id || Date.now();
            
            if (viewingTaskParent) {
                const newSubtask = {
                    ...updatedTaskData,
                    id: tempTaskId,
                    isSubtask: true,
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                updatedTasks = tasks.map(t => {
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
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                console.log('➕ Creating new task:', {
                    taskId: newTask.id,
                    title: newTask.title,
                    status: newTask.status,
                    listId: newTask.listId,
                    currentTasksCount: tasks.length
                });
                updatedTasks = [...tasks, newTask];
                console.log('✅ New task added to array. Updated tasks count:', updatedTasks.length);
            }
        } else {
            if (viewingTaskParent) {
                updatedTasks = tasks.map(t => {
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
                const originalTask = tasks.find(t => t.id === updatedTaskData.id);
                
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
                
                updatedTasks = tasks.map(t => 
                    t.id === updatedTaskData.id 
                        ? mergedTask
                        : t
                );
            }
        }
        
        // Update state with the new tasks array
        console.log('🔄 Updating tasks state. New tasks count:', updatedTasks.length);
        setTasks(updatedTasks);
        tasksRef.current = updatedTasks; // Also update ref immediately
        
        // Set flag to skip the useEffect save to prevent race condition
        // This prevents the debounced save from overwriting our immediate save
        skipNextSaveRef.current = true;
        
        // Immediately save to database to ensure checklist and other changes persist
        // Don't wait for the debounced useEffect - save immediately
        try {
            // Find the updated task to log comment info
            const savedTask = updatedTasks.find(t => t.id === updatedTaskData.id) || 
                            updatedTasks.find(t => (t.subtasks || []).some(st => st.id === updatedTaskData.id));
            
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
            const validatedTasksForSave = updatedTasks.map(t => {
                if (!Array.isArray(t.comments)) {
                    console.warn('⚠️ Fixing task with invalid comments array before save:', {
                        taskId: t.id,
                        taskTitle: t.title
                    });
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
            
            // NEW: Save task via Task API (preferred method)
            const taskToSave = validatedTasksForSave.find(t => t.id === updatedTaskData.id) || 
                            validatedTasksForSave.find(t => (t.subtasks || []).some(st => st.id === updatedTaskData.id));
            
            if (taskToSave && window.DatabaseAPI?.makeRequest) {
                try {
                    const isSubtask = viewingTaskParent && taskToSave.id === updatedTaskData.id;
                    const taskPayload = {
                        projectId: project.id,
                        title: taskToSave.title || '',
                        description: taskToSave.description || '',
                        status: taskToSave.status || 'todo',
                        priority: taskToSave.priority || 'Medium',
                        assignee: taskToSave.assignee || '',
                        assigneeId: taskToSave.assigneeId || null,
                        dueDate: taskToSave.dueDate || null,
                        listId: taskToSave.listId || null,
                        estimatedHours: taskToSave.estimatedHours || null,
                        actualHours: taskToSave.actualHours || null,
                        blockedBy: taskToSave.blockedBy || '',
                        tags: taskToSave.tags || [],
                        attachments: taskToSave.attachments || [],
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
                                // Handle top-level task: update in main tasks array
                                setTasks(prev => {
                                    const updated = prev.map(t => 
                                        t.id === tempTaskId ? savedTaskFormatted : t
                                    );
                                    // If task wasn't found (shouldn't happen), add it anyway
                                    if (!prev.find(t => t.id === tempTaskId)) {
                                        console.warn('⚠️ Temporary task not found in state, adding saved task');
                                        updated.push(savedTaskFormatted);
                                    }
                                    return updated;
                                });
                                // Also update tasksRef immediately
                                tasksRef.current = tasksRef.current.map(t => 
                                    t.id === tempTaskId ? savedTaskFormatted : t
                                );
                                if (!tasksRef.current.find(t => t.id === tempTaskId)) {
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
                    } else {
                        // Update existing task
                        const response = await window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(taskToSave.id)}`, {
                            method: 'PUT',
                            body: JSON.stringify(taskPayload)
                        });
                        console.log('✅ Task updated via Task API:', taskToSave.id);
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
            const verifyTask = validatedTasksForSave.find(t => t.id === updatedTaskData.id) || 
                            validatedTasksForSave.find(t => (t.subtasks || []).some(st => st.id === updatedTaskData.id));
            
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
            
            // Revert local state changes if task creation failed
            if (isNewTask) {
                console.log('🔄 Reverting local state changes due to creation failure');
                setTasks(tasks); // Restore original tasks array
                tasksRef.current = tasks;
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
                const updatedTasks = prevTasks.filter(t => t.id !== taskId);
                tasksRef.current = updatedTasks; // Update ref with same data
                return updatedTasks;
            });
            
            // Set flag to skip the useEffect save to prevent race condition
            skipNextSaveRef.current = true;
            
            // Don't reload from server immediately - we already updated local state correctly
            // Reloading immediately can cause the task to reappear if the server hasn't processed the deletion yet
            
            // tasksList JSON write removed - task deletion handled by Task API above
            console.log('✅ Task deleted successfully');
            
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
                    const updatedTasks = tasks.filter(t => t.id !== taskId);
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
            const updatedTasks = tasks.map(t => {
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
                    const tasksResponse = await window.DatabaseAPI.makeRequest(`/tasks?projectId=${encodeURIComponent(project.id)}`, {
                        method: 'GET'
                    });
                    const fetchedTasks = tasksResponse?.data?.tasks || [];
                    if (Array.isArray(fetchedTasks) && fetchedTasks.length >= 0) {
                        console.log('✅ Refreshed tasks from server after subtask deletion. Task count:', fetchedTasks.length);
                        setTasks(fetchedTasks);
                        tasksRef.current = fetchedTasks;
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

    const handleAddMonthlyDataProcess = () => {
        // Pre-populate with monthly data process defaults
        setEditingDocument({
            name: 'Monthly Data Report',
            category: 'Reports',
            description: 'Monthly data collection and reporting',
            priority: 'High',
            dueDate: '',
            requiredFrom: ''
        });
        setShowDocumentModal(true);
        setShowDocumentProcessDropdown(false);
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
            case 'Review': return 'bg-purple-100 text-purple-800 border-purple-500';
            case 'Blocked': return 'bg-red-100 text-red-800 border-red-500';
            case 'To Do': return 'bg-gray-100 text-gray-800 border-gray-500';
            default: return 'bg-gray-100 text-gray-800 border-gray-500';
        }
    };
    
    // Handler for updating task status when dragged in kanban
    const handleUpdateTaskStatus = useCallback(async (taskId, newStatus, { isSubtask = false, parentId = null } = {}) => {
        
        // Normalize status - KanbanView passes the column label, but we need to match the actual status value
        // Try to find matching status from taskLists or use the provided status
        let normalizedStatus = newStatus;
        
        // Check if we have task lists with status definitions
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
        
        // Update local state and get updated tasks for saving
        let updatedTasks = null;
        setTasks(prevTasks => {
            if (isSubtask && parentId) {
                updatedTasks = prevTasks.map(t => {
                    if (t.id === parentId || String(t.id) === String(parentId)) {
                        return {
                            ...t,
                            subtasks: (t.subtasks || []).map(st =>
                                (st.id === taskId || String(st.id) === String(taskId)) ? { ...st, status: normalizedStatus } : st
                            )
                        };
                    }
                    return t;
                });
            } else {
                updatedTasks = prevTasks.map(t =>
                    (t.id === taskId || String(t.id) === String(taskId)) ? { ...t, status: normalizedStatus } : t
                );
            }
            return updatedTasks;
        });
        
        // Save task status update via Task API
        if (updatedTasks && window.DatabaseAPI?.makeRequest) {
            try {
                const taskToUpdate = isSubtask 
                    ? updatedTasks.find(t => t.id === parentId)?.subtasks?.find(st => st.id === taskId)
                    : updatedTasks.find(t => t.id === taskId);
                
                if (taskToUpdate) {
                    await window.DatabaseAPI.makeRequest(`/tasks?id=${encodeURIComponent(taskId)}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            ...taskToUpdate,
                            status: normalizedStatus,
                            projectId: project?.id
                        })
                    });
                    console.log('✅ Task status updated via Task API:', taskId);
                }
            } catch (error) {
                console.error('❌ Failed to save task status update via Task API:', error);
                // Revert on error
                setTasks(prevTasks => {
                    if (isSubtask && parentId) {
                        return prevTasks.map(t => {
                            if (t.id === parentId || String(t.id) === String(parentId)) {
                                return {
                                    ...t,
                                    subtasks: (t.subtasks || []).map(st =>
                                        (st.id === taskId || String(st.id) === String(taskId)) ? { ...st, status: st.status } : st
                                    )
                                };
                            }
                            return t;
                        });
                    } else {
                        return prevTasks.map(t =>
                            (t.id === taskId || String(t.id) === String(taskId)) ? { ...t, status: t.status } : t
                        );
                    }
                });
                alert('Failed to save task status. Please try again.');
            }
        }
    }, [taskLists, persistProjectData]);

    // List View Component - Memoized to prevent recreation on every render
    const ListView = useMemo(() => {
        return () => {
            // Diagnostic check for table version - runs after component mounts with retries
            const { useEffect } = window.React;
            useEffect(() => {
                // Only check if we're in a browser environment
                if (typeof window === 'undefined') return;
                
                // Check if there are any tasks - if not, no table will be rendered (expected)
                const hasTasks = taskLists.some(list => list.tasks && list.tasks.length > 0);
                if (!hasTasks) {
                    // No tasks means no table - this is expected, no need to check or warn
                    return;
                }
                
                let attempts = 0;
                const maxAttempts = 5;
                const delays = [500, 1000, 2000, 3000, 5000]; // Progressive delays
                
                const checkTable = () => {
                    attempts++;
                    const tables = document.querySelectorAll('[data-task-table-version="3.0"]');
                    if (tables.length > 0) {
                        // Table found, no need to continue checking
                        return;
                    }
                    
                    if (attempts < maxAttempts) {
                        // Retry with next delay
                        const delay = attempts === 1 ? delays[0] : delays[attempts] - delays[attempts - 1];
                        setTimeout(checkTable, delay);
                    } else {
                        // Only warn if we have tasks but no table found after multiple attempts
                        // This indicates a potential issue since we expect a table when tasks exist
                        console.warn('⚠️ Table version check: No table with data-task-table-version="3.0" found after multiple attempts, but tasks exist. This may indicate a rendering issue.');
                    }
                };
                
                // Start checking after initial delay
                setTimeout(checkTable, delays[0]);
            }, [taskLists]);
            
            const formatChecklistProgress = (checklist = []) => {
                if (!Array.isArray(checklist) || checklist.length === 0) {
                    return { percent: 0, label: '0/0 complete' };
                }
                const completed = checklist.filter(item => item.completed).length;
                return {
                    percent: Math.round((completed / checklist.length) * 100),
                    label: `${completed}/${checklist.length} complete`
                };
            };

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
                        <div className="md:col-span-2 xl:col-span-1 flex items-end justify-between gap-3">
                            <label className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                    checked={taskFilters.includeSubtasks}
                                    onChange={(e) => setTaskFilters(prev => ({ ...prev, includeSubtasks: e.target.checked }))}
                                />
                                Include subtasks
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
                                            onClick={() => handleAddTask(list.id)}
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
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Task</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assignee</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Due Date</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
                                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                    </tr>
                                                </thead>
                                            )}
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {list.tasks.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="7" className="px-4 py-12 text-center">
                                                            <div className="flex flex-col items-center justify-center text-center text-gray-400">
                                                                <i className="fas fa-clipboard-list text-3xl mb-3"></i>
                                                                <p className="text-sm font-medium">
                                                                    {hasActiveTaskFilters ? 'No tasks match your filters.' : 'No tasks yet. Start by adding one.'}
                                                                </p>
                                                                {!hasActiveTaskFilters && (
                                                                    <button
                                                                        onClick={() => handleAddTask(list.id)}
                                                                        className="mt-4 px-3 py-1.5 text-xs font-semibold bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100 transition-colors"
                                                                    >
                                                                        Add your first task
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    list.tasks.map(({ task, matchingSubtasks, matchedBySubtasks }) => {
                                                        const dueMeta = getDueDateMeta(task.dueDate);
                                                        const checklistMeta = formatChecklistProgress(task.checklist);
                                                        const subtasksForCard = matchingSubtasks || [];
                                                        return (
                                                            <Fragment key={task.id}>
                                                                <tr
                                                                    onClick={() => handleViewTaskDetail(task)}
                                                                    className="hover:bg-gray-50 cursor-pointer transition"
                                                                >
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        <div className="text-xs font-medium text-gray-900">{task.title || 'Untitled task'}</div>
                                                                    </td>
                                                                    <td className="px-4 py-2 whitespace-nowrap">
                                                                        <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${getStatusColor(task.status || 'To Do')}`}>
                                                                            {task.status || 'To Do'}
                                                                        </span>
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
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${dueMeta.pillClass}`}>
                                                                            <i className="fas fa-calendar-alt text-[9px] mr-1"></i>
                                                                            {dueMeta.label}
                                                                        </span>
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
                                                                                    e.stopPropagation();
                                                                                    handleAddSubtask(task);
                                                                                }}
                                                                                className="inline-flex items-center px-1.5 py-0.5 text-[10px] bg-primary-500 text-white rounded hover:bg-primary-600 transition-all font-medium"
                                                                                title="Add subtask"
                                                                            >
                                                                                <i className="fas fa-level-down-alt text-[9px] mr-0.5"></i>
                                                                                {task.subtasks?.length || 0}
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleViewTaskDetail(task);
                                                                                }}
                                                                                className="text-[10px] text-primary-600 hover:text-primary-700 font-semibold px-1.5"
                                                                            >
                                                                                View
                                                                            </button>
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleDeleteTask(task.id);
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
                                                                            onClick={() => handleViewTaskDetail(subtask, task)}
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
        };
    }, [filteredTaskLists, taskFilters, listOptions, statusOptions, assigneeOptions, priorityOptions, visibleTaskCount, totalTaskCount, hasActiveTaskFilters, resetTaskFilters, handleAddTask, handleEditList, handleViewTaskDetail, handleDeleteTask, handleAddSubtask, openTaskComments, getStatusColor, getPriorityColor, getDueDateMeta]);

    const TaskDetailModalComponent = taskDetailModalComponent || (typeof window.TaskDetailModal === 'function' ? window.TaskDetailModal : null);
    const CommentsPopupComponent = commentsPopupComponent || (typeof window.CommentsPopup === 'function' ? window.CommentsPopup : null);
    const ProjectModalComponent = projectModalComponent || (typeof window.ProjectModal === 'function' ? window.ProjectModal : null);
    const CustomFieldModalComponent = (typeof window.CustomFieldModal === 'function' ? window.CustomFieldModal : null);
    const KanbanViewComponent = (typeof window.KanbanView === 'function' ? window.KanbanView : null);
    const DocumentCollectionModalComponent = (typeof window.DocumentCollectionModal === 'function' ? window.DocumentCollectionModal : null);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onBack} 
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    <div>
                        <h1 className="text-xl font-semibold text-gray-900">{project.name}</h1>
                        <p className="text-sm text-gray-500">{project.client} • {project.type}</p>
                    </div>
                </div>
                <div className="flex gap-2">
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

            {/* Tab Navigation */}
            <div className="bg-white rounded-lg border border-gray-200 p-1">
                <div className="flex gap-1">
                    <button
                        onClick={() => switchSection('overview')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeSection === 'overview'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <i className="fas fa-chart-line mr-1.5"></i>
                        Overview
                    </button>
                    <button
                        onClick={() => switchSection('tasks')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeSection === 'tasks'
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-700 hover:bg-gray-100'
                        }`}
                    >
                        <i className="fas fa-tasks mr-1.5"></i>
                        Tasks
                    </button>
                    {hasDocumentCollectionProcess && (
                        <button
                            onClick={() => switchSection('documentCollection')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'documentCollection'
                                    ? 'bg-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-folder-open mr-1.5"></i>
                            Document Collection
                        </button>
                    )}
                    {hasWeeklyFMSReviewProcess && (
                        <button
                            onClick={() => switchSection('weeklyFMSReview')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'weeklyFMSReview'
                                    ? 'bg-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-calendar-week mr-1.5"></i>
                            Weekly FMS Review
                        </button>
                    )}
                    {hasMonthlyFMSReviewProcess && (
                        <button
                            onClick={() => switchSection('monthlyFMSReview')}
                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                activeSection === 'monthlyFMSReview'
                                    ? 'bg-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <i className="fas fa-calendar-alt mr-1.5"></i>
                            Monthly FMS Review
                        </button>
                    )}
                    <div className="relative">
                        <button
                            onClick={() => setShowDocumentProcessDropdown(!showDocumentProcessDropdown)}
                            className="px-2 py-0.5 bg-primary-600 text-white text-xs font-medium rounded hover:bg-primary-700 transition-colors flex items-center gap-1 whitespace-nowrap"
                        >
                            <i className="fas fa-plus text-[10px]"></i>
                            <span>Add a Process</span>
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
                                    {!hasDocumentCollectionProcess && (
                                        <button
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
                                    <button
                                        onClick={handleAddMonthlyDataProcess}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                    >
                                        <i className="fas fa-calendar-alt text-primary-600 w-4"></i>
                                        <div>
                                            <div className="font-medium">Monthly Data Process</div>
                                            <div className="text-[10px] text-gray-500">Recurring monthly data collection</div>
                                        </div>
                                    </button>
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
                                    {(() => {
                                        // Debug: Log the condition
                                        const shouldShow = !hasMonthlyFMSReviewProcess;
                                        console.log('🔍 Monthly FMS Review dropdown condition:', {
                                            hasMonthlyFMSReviewProcess,
                                            shouldShow,
                                            projectHasProcess: project.hasMonthlyFMSReviewProcess,
                                            projectId: project.id
                                        });
                                        return shouldShow ? (
                                            <button
                                                onClick={handleAddMonthlyFMSReviewProcess}
                                                className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                            >
                                                <i className="fas fa-calendar-alt text-primary-600 w-4"></i>
                                                <div>
                                                    <div className="font-medium">Monthly FMS Review</div>
                                                    <div className="text-[10px] text-gray-500">Monthly FMS review checklist</div>
                                                </div>
                                            </button>
                                        ) : null;
                                    })()}
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
            
            {activeSection === 'overview' && <OverviewSection />}
            
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
                <ListView />
            ) : (
                KanbanViewComponent ? (
                    <KanbanViewComponent
                        tasks={filteredTopLevelTasks}
                        statusColumns={kanbanColumns}
                        onViewTaskDetail={handleViewTaskDetail}
                        onAddTask={handleAddTask}
                        onDeleteTask={handleDeleteTask}
                        onUpdateTaskStatus={handleUpdateTaskStatus}
                        getStatusColor={getStatusColor}
                        getPriorityColor={getPriorityColor}
                        getDueDateMeta={getDueDateMeta}
                    />
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
            {hasDocumentCollectionProcess && (
                <DocumentCollectionProcessSection
                    key={`doc-collection-${project?.id || 'default'}`}
                    project={project}
                    hasDocumentCollectionProcess={hasDocumentCollectionProcess}
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
            
            {/* Always render MonthlyFMSReviewProcessSection when hasMonthlyFMSReviewProcess is true */}
            {hasMonthlyFMSReviewProcess && (
                <MonthlyFMSReviewProcessSection
                    key={`monthly-fms-review-${project?.id || 'default'}`}
                    project={project}
                    hasMonthlyFMSReviewProcess={hasMonthlyFMSReviewProcess}
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
                            const payload = {
                                ...projectData,
                                clientName: projectData.client || project.clientName || project.client || '',
                                client: projectData.client || project.client || ''
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
                    project={project}
                    users={users}
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
