// Get dependencies from window
console.log('🔵 ProjectDetail.jsx: Script is executing...');

// ROBUST ProjectDetail Loader - Multiple layers of protection
(function waitForDependenciesAndLoad() {
    // Prevent duplicate initialization
    if (window.ProjectDetail && typeof window.ProjectDetail === 'function') {
        console.log('✅ ProjectDetail: Already loaded, skipping initialization');
        return;
    }
    
    // Check if we're already initializing
    if (window._projectDetailInitializing) {
        console.log('⏳ ProjectDetail: Already initializing, waiting...');
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
                console.warn(`⚠️ ProjectDetail: Optional dependencies missing: ${optional.join(', ')}`);
                console.warn('⚠️ ProjectDetail will continue but may have limited functionality');
            }
            console.log(`✅ ProjectDetail: All critical dependencies available after ${attempt * baseDelay}ms`);
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
        console.log('✅ ProjectDetail: All critical dependencies available immediately');
        if (optional.length > 0) {
            console.warn(`⚠️ ProjectDetail: Optional dependencies missing: ${optional.join(', ')}`);
        }
        initializeProjectDetail();
    } else {
        console.log(`⏳ ProjectDetail: Waiting for dependencies: ${missing.join(', ')}`);
        if (optional.length > 0) {
            console.log(`ℹ️ ProjectDetail: Optional dependencies missing: ${optional.join(', ')}`);
        }
        waitForDependencies();
    }
    
    // Also listen for React load event
    const handleReactReady = () => {
        const { missing } = checkDependencies();
        if (missing.length === 0 && window._projectDetailInitializing) {
            console.log('✅ ProjectDetail: Dependencies ready via event');
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
                    console.log(`✅ ProjectDetail: Dependency ${compName} loaded, initializing now`);
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
        console.log('✅ ProjectDetail: Already initialized, skipping');
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
                console.log('🔄 ProjectDetail: React now available, retrying initialization...');
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
    
    console.log('✅ ProjectDetail: Starting component initialization...');
    
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
            console.log('🔵 DocumentCollectionProcessSection rendering...');
            console.log('  - hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
            console.log('  - activeSection:', activeSection);
            
            // Track component lifecycle
            useEffectSection(() => {
                console.log('✅ DocumentCollectionProcessSection mounted');
                return () => {
                    console.log('❌ DocumentCollectionProcessSection unmounting');
                };
            }, []);

            const handleBackToOverview = typeof onBack === 'function' ? onBack : () => {};
            const MonthlyDocumentCollectionTracker = window.MonthlyDocumentCollectionTracker;
            const [trackerReady, setTrackerReady] = useStateSection(() => !!MonthlyDocumentCollectionTracker);
            const [loadAttempts, setLoadAttempts] = useStateSection(0);
            const maxAttempts = 50; // 5 seconds (50 * 100ms)

            useEffectSection(() => {
                if (trackerReady) return;

                const checkComponent = () => {
                    if (window.MonthlyDocumentCollectionTracker && typeof window.MonthlyDocumentCollectionTracker === 'function') {
                        console.log('✅ MonthlyDocumentCollectionTracker loaded!');
                        setTrackerReady(true);
                        return true;
                    }
                    return false;
                };

                if (checkComponent()) return;

                const handleViteReady = () => {
                    console.log('📢 viteProjectsReady event received');
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
                            console.warn('⚠️ MonthlyDocumentCollectionTracker failed to load after', maxAttempts, 'attempts');
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

            console.log('  - MonthlyDocumentCollectionTracker:', typeof MonthlyDocumentCollectionTracker);
            console.log('  - trackerReady:', trackerReady);
            console.log('  - loadAttempts:', loadAttempts);

            if (!trackerReady || !MonthlyDocumentCollectionTracker) {
                return (
                    <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                        <i className="fas fa-spinner fa-spin text-3xl text-primary-500 mb-3"></i>
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Component...</h3>
                        <p className="text-sm text-gray-600 mb-4">
                            {loadAttempts < maxAttempts 
                                ? `The Monthly Document Collection Tracker is loading... (${loadAttempts * 100}ms)`
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
                            <p>Debug Info: window.MonthlyDocumentCollectionTracker = {String(typeof MonthlyDocumentCollectionTracker)}</p>
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
            
            return (
                <MonthlyDocumentCollectionTracker
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
                console.log('🔄 DocumentCollectionProcessSection: Props changed, allowing re-render', {
                    projectId: projectIdEqual,
                    hasDocCollection: hasDocCollectionEqual,
                    activeSection: activeSectionEqual,
                    onBack: onBackEqual
                });
            }
            
            return propsEqual; // Return true if equal (skip re-render), false if different (re-render)
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

    const ProjectDetail = ({ project, onBack, onDelete }) => {
        console.log('ProjectDetail rendering with project:', project);
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
        console.log('✅ ProjectDetail: All required components loaded');
    }
    
    const getStoredActiveSection = (projectId) => {
        if (!projectId) {
            return 'overview';
        }
        try {
            const stored = sessionStorage.getItem(`project-${projectId}-activeSection`);
            if (stored && typeof stored === 'string') {
                return stored;
            }
        } catch (error) {
            console.warn('Failed to read stored active section:', error);
        }
        return 'overview';
    };
    
    // Tab navigation state - restore last section per project when available
    const [activeSection, setActiveSection] = useState(() => getStoredActiveSection(project?.id));
    
    // Memoize the back callback to prevent DocumentCollectionProcessSection from re-rendering
    const handleBackToOverview = useCallback(() => {
        setActiveSection('overview');
    }, []);
    
    // Persist activeSection to sessionStorage (for navigation within the same session)
    useEffect(() => {
        if (!project?.id) return;
        try {
            sessionStorage.setItem(`project-${project.id}-activeSection`, activeSection);
        } catch (error) {
            console.warn('Failed to store active section:', error);
        }
        console.log('🟢 Active section changed to:', activeSection);
    }, [activeSection, project?.id]);
    
    // Reset to overview when project changes (opening a different project)
    useEffect(() => {
        if (!project?.id) return;
        const storedSection = getStoredActiveSection(project.id);
        if (storedSection !== activeSection) {
            setActiveSection(storedSection);
        }
        console.log('🔄 Project changed, restoring section:', storedSection);
    }, [project?.id]);
    
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
        console.log('🔄 Syncing hasDocumentCollectionProcess from project prop:', {
            raw: project.hasDocumentCollectionProcess,
            normalized: normalizedValue,
            currentState: hasDocumentCollectionProcess,
            projectId: project.id,
            wasExplicitlyChanged: hasDocumentCollectionProcessChangedRef.current
        });
        
        // Only sync if:
        // 1. The value actually changed, AND
        // 2. It wasn't explicitly changed by the user (to prevent overwriting user changes)
        if (normalizedValue !== hasDocumentCollectionProcess && !hasDocumentCollectionProcessChangedRef.current) {
            console.log('✅ Syncing hasDocumentCollectionProcess to:', normalizedValue);
            setHasDocumentCollectionProcess(normalizedValue);
        } else if (hasDocumentCollectionProcessChangedRef.current) {
            console.log('⏭️ Skipping sync - hasDocumentCollectionProcess was explicitly changed by user');
        }
    }, [project.hasDocumentCollectionProcess, project.id]);
    
    // Also sync on mount to ensure we have the latest value
    useEffect(() => {
        const normalizedValue = normalizeHasDocumentCollectionProcess(project.hasDocumentCollectionProcess);
        console.log('🔄 Mount/Project change: Syncing hasDocumentCollectionProcess:', {
            projectId: project.id,
            raw: project.hasDocumentCollectionProcess,
            normalized: normalizedValue,
            currentState: hasDocumentCollectionProcess
        });
        setHasDocumentCollectionProcess(normalizedValue);
    }, [project.id]); // Re-sync whenever we switch to a different project
    
    // Ref to prevent duplicate saves when manually adding document collection process
    const skipNextSaveRef = useRef(false);
    const saveTimeoutRef = useRef(null);
    
    // Document process dropdown
    const [showDocumentProcessDropdown, setShowDocumentProcessDropdown] = useState(false);
    
    const [showListModal, setShowListModal] = useState(false);
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
    const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [editingList, setEditingList] = useState(null);
    const [viewingTask, setViewingTask] = useState(null);
    const [viewingTaskParent, setViewingTaskParent] = useState(null);
    const [creatingTaskForList, setCreatingTaskForList] = useState(null);
    const [creatingTaskWithStatus, setCreatingTaskWithStatus] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'kanban'
    const [editingDocument, setEditingDocument] = useState(null);
    
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

    // Initialize taskLists with project-specific data
    const [taskLists, setTaskLists] = useState(
        project.taskLists || [
            { id: 1, name: 'To Do', color: 'blue', description: '' }
        ]
    );

    // Initialize tasks with project-specific data
    const [tasks, setTasks] = useState(project.tasks || []);
    const [taskFilters, setTaskFilters] = useState({
        search: '',
        status: 'all',
        assignee: 'all',
        priority: 'all',
        list: 'all',
        includeSubtasks: true
    });
    
    // Sync tasks when project prop changes (e.g., after reload or navigation)
    useEffect(() => {
        if (project?.tasks && Array.isArray(project.tasks)) {
            console.log('🔄 ProjectDetail: Syncing tasks from project prop', {
                projectId: project.id,
                tasksCount: project.tasks.length,
                tasksWithComments: project.tasks.filter(t => t.comments && t.comments.length > 0).length
            });
            setTasks(project.tasks);
        }
    }, [project?.id, project?.tasks]);
    
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
        nextTasks = tasks,
        nextTaskLists = taskLists,
        nextCustomFieldDefinitions = customFieldDefinitions,
        nextDocuments = documents,
        nextHasDocumentCollectionProcess = hasDocumentCollectionProcess,
        excludeHasDocumentCollectionProcess = false,
        excludeDocumentSections = true  // Default to true: don't overwrite documentSections managed by MonthlyDocumentCollectionTracker
    } = {}) => {
        try {
            console.log('💾 ProjectDetail: Saving project data changes...');
            console.log('  - Project ID:', project.id);
            console.log('  - Tasks count:', nextTasks.length);
            console.log('  - Task lists count:', nextTaskLists.length);
            
            const updatePayload = {
                taskLists: JSON.stringify(nextTaskLists),
                tasksList: JSON.stringify(nextTasks),  // Note: backend uses 'tasksList' not 'tasks'
                customFieldDefinitions: JSON.stringify(nextCustomFieldDefinitions),
                documents: JSON.stringify(nextDocuments)
            };
            
            // Only include documentSections if not excluded
            // This prevents overwriting changes made by MonthlyDocumentCollectionTracker
            if (!excludeDocumentSections) {
                updatePayload.documentSections = serializedDocumentSections;
                console.log('  - Including documentSections in save');
            } else {
                console.log('  - Excluding documentSections from save (managed by MonthlyDocumentCollectionTracker)');
            }
            
            // Only include hasDocumentCollectionProcess if not excluded
            // This prevents overwriting the database value when we don't want to save it
            if (!excludeHasDocumentCollectionProcess) {
                updatePayload.hasDocumentCollectionProcess = nextHasDocumentCollectionProcess;
            }
            
            console.log('📡 Sending update to database:', updatePayload);
            
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            console.log('✅ Database save successful:', apiResponse);
            
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
                            tasks: nextTasks, 
                            taskLists: nextTaskLists, 
                            customFieldDefinitions: nextCustomFieldDefinitions, 
                            documents: nextDocuments, 
                            hasDocumentCollectionProcess: nextHasDocumentCollectionProcess,
                            documentSections: normalizedSections
                        };
                    });
                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
                        try {
                            await window.dataService.setProjects(updatedProjects);
                            console.log('✅ localStorage updated for consistency');
                        } catch (saveError) {
                            console.warn('Failed to save projects to dataService:', saveError);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error saving project data:', error);
            alert('Failed to save project changes: ' + error.message);
            throw error;
        }
    }, [project.id, serializedDocumentSections, documentSectionsArray, tasks, taskLists, customFieldDefinitions, documents, hasDocumentCollectionProcess]);
    
    // Track if hasDocumentCollectionProcess was explicitly changed by user
    const hasDocumentCollectionProcessChangedRef = useRef(false);
    
    // Save back to project whenever they change
    useEffect(() => {
        // Skip save if this was triggered by manual document collection process addition
        // This prevents the debounced save from overwriting an explicit save
        if (skipNextSaveRef.current) {
            console.log('⏭️ Skipping debounced save - manual document collection process save in progress');
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
                console.log('💾 Debounced save: Including hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
                persistProjectData({
                    nextHasDocumentCollectionProcess: hasDocumentCollectionProcess
                }).catch(() => {});
                // Reset the flag after saving
                hasDocumentCollectionProcessChangedRef.current = false;
            } else if (!shouldIncludeHasProcess) {
                // Exclude hasDocumentCollectionProcess from save to prevent overwriting database value
                console.log('⏭️ Debounced save: Excluding hasDocumentCollectionProcess to prevent overwrite');
                persistProjectData({
                    excludeHasDocumentCollectionProcess: true
                }).catch(() => {});
            } else {
                // Flag was reset but we thought we should include it - skip to be safe
                console.log('⏭️ Debounced save: Skipping hasDocumentCollectionProcess - flag was reset');
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
    }, [tasks, taskLists, customFieldDefinitions, documents, hasDocumentCollectionProcess, project.hasDocumentCollectionProcess, persistProjectData, project]);

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

        try {
            await persistProjectData({ nextTasks: updatedTasks });
        } catch (error) {
            console.error('❌ Failed to persist project data after adding comment:', error);
        } finally {
            setTimeout(() => {
                skipNextSaveRef.current = false;
            }, 500);
        }

        // Use hash-based routing format for email links (frontend uses hash routing)
        const projectLink = project ? `#/projects/${project.id}` : '#/projects';
        const finalTaskId = updatedTargetTask.id || taskId;
        // Build task-specific link with anchor for direct navigation to task
        const taskLink = finalTaskId ? `${projectLink}#task-${finalTaskId}` : projectLink;
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
            await window.DatabaseAPI.makeRequest('/notifications', {
                method: 'POST',
                body: JSON.stringify({
                    userId,
                    type: 'comment',
                    title: `New comment on task: ${taskTitle}`,
                    message: `${currentUser.name} commented on "${taskTitle}" in project "${projectName}": "${commentText.substring(0, 100)}${commentText.length > 100 ? '...' : ''}"`,
                    link: taskLink, // Use task-specific link
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
                console.log(`✅ Comment notification sent to assignee ${assigneeUser.name}`);
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
                    console.log(`✅ Comment notification sent to subscriber ${subscriber.name}`);
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
                const tasksForList = tasks
                    .filter(task => task.listId === list.id)
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

    const openTaskComments = useCallback(async (event, task, { parentTask = null, isSubtask = false } = {}) => {
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
            position
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

    const handleDeleteList = (listId) => {
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
            // Move tasks to the first remaining list
            setTasks(tasks.map(t => t.listId === listId ? { ...t, listId: remainingList.id } : t));
            setTaskLists(taskLists.filter(l => l.id !== listId));
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
    }, [ensureTaskDetailModalLoaded]);

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
    }, [ensureTaskDetailModalLoaded]);

    const handleViewTaskDetail = useCallback(async (task, parentTask = null) => {
        const ready = await ensureTaskDetailModalLoaded();
        if (!ready) {
            alert('Task workspace is still loading. Please try again in a moment.');
            return;
        }
        setViewingTask(task);
        setViewingTaskParent(parentTask);
        setCreatingTaskForList(null);
        setShowTaskDetailModal(true);
    }, [ensureTaskDetailModalLoaded]);

    const handleUpdateTaskFromDetail = async (updatedTaskData) => {
        const isNewTask = !updatedTaskData.id || (!tasks.find(t => t.id === updatedTaskData.id) && 
                                                    !tasks.some(t => (t.subtasks || []).find(st => st.id === updatedTaskData.id)));
        
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
                console.log('🔍 findAssigneeUser: No assignee value or users available', { assigneeValue, usersCount: users?.length });
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
                console.log('✅ findAssigneeUser: Found user', { assigneeValue, matchedUserId: matchedUser.id, matchedUserName: matchedUser.name });
            } else {
                console.warn('⚠️ findAssigneeUser: No user found', { assigneeValue, availableUsers: users.map(u => ({ id: u.id, name: u.name, email: u.email })) });
            }
            
            return matchedUser || null;
        };
        
        // Send notification if assignee changed
        if (!isNewTask && oldTask && updatedTaskData.assignee && updatedTaskData.assignee !== oldTask.assignee) {
            console.log('🔔 Assignment changed - sending notification', { 
                oldAssignee: oldTask.assignee, 
                newAssignee: updatedTaskData.assignee,
                taskTitle: updatedTaskData.title,
                currentUserId: currentUser.id
            });
            
            const assigneeUser = findAssigneeUser(updatedTaskData.assignee);
            
            if (assigneeUser) {
                // Don't notify if the user assigned the task to themselves
                if (assigneeUser.id === currentUser.id) {
                    console.log('⚠️ Skipping self-assignment notification - user assigned task to themselves');
                } else {
                    try {
                        // Use hash-based routing format for email links (frontend uses hash routing)
                        const projectLink = `#/projects/${project.id}`;
                        // Build task-specific link with anchor for direct navigation to task
                        const taskLink = updatedTaskData.id ? `${projectLink}#task-${updatedTaskData.id}` : projectLink;
                        console.log('📤 Sending task assignment notification', {
                            userId: assigneeUser.id,
                            userName: assigneeUser.name,
                            type: 'task',
                            taskTitle: updatedTaskData.title
                        });
                        
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
                        
                        console.log('✅ Task assignment notification sent successfully', { 
                            assigneeName: assigneeUser.name,
                            response: response
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
            console.log('🔔 New task with assignee - sending notification', { 
                assignee: updatedTaskData.assignee,
                taskTitle: updatedTaskData.title,
                currentUserId: currentUser.id
            });
            
            const assigneeUser = findAssigneeUser(updatedTaskData.assignee);
            
            if (assigneeUser) {
                // Don't notify if the user assigned the task to themselves
                if (assigneeUser.id === currentUser.id) {
                    console.log('⚠️ Skipping self-assignment notification - user assigned task to themselves');
                } else {
                    try {
                        // Use hash-based routing format for email links (frontend uses hash routing)
                        const projectLink = `#/projects/${project.id}`;
                        // Build task-specific link with anchor for direct navigation to task
                        const taskLink = updatedTaskData.id ? `${projectLink}#task-${updatedTaskData.id}` : projectLink;
                        console.log('📤 Sending new task assignment notification', {
                            userId: assigneeUser.id,
                            userName: assigneeUser.name,
                            type: 'task',
                            taskTitle: updatedTaskData.title
                        });
                        
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
                        
                        console.log('✅ New task assignment notification sent successfully', { 
                            assigneeName: assigneeUser.name,
                            response: response
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
        
        if (isNewTask) {
            if (viewingTaskParent) {
                const newSubtask = {
                    ...updatedTaskData,
                    id: Date.now(),
                    isSubtask: true,
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                setTasks(tasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        return {
                            ...t,
                            subtasks: [...(t.subtasks || []), newSubtask]
                        };
                    }
                    return t;
                }));
            } else {
                const newTask = {
                    ...updatedTaskData,
                    id: Date.now(),
                    subtasks: [],
                    status: updatedTaskData.status || 'To Do'
                };
                setTasks([...tasks, newTask]);
            }
        } else {
            if (viewingTaskParent) {
                setTasks(tasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        return {
                            ...t,
                            subtasks: (t.subtasks || []).map(st =>
                                st.id === updatedTaskData.id ? updatedTaskData : st
                            )
                        };
                    }
                    return t;
                }));
            } else {
                setTasks(tasks.map(t => t.id === updatedTaskData.id ? updatedTaskData : t));
            }
        }
        
        // Immediately save to database to ensure checklist and other changes persist
        // Don't wait for the debounced useEffect - save immediately
        try {
            const updatedTasks = viewingTaskParent 
                ? tasks.map(t => {
                    if (t.id === viewingTaskParent.id) {
                        return {
                            ...t,
                            subtasks: (t.subtasks || []).map(st =>
                                st.id === updatedTaskData.id ? updatedTaskData : st
                            )
                        };
                    }
                    return t;
                })
                : tasks.map(t => t.id === updatedTaskData.id ? updatedTaskData : t);
            
            console.log('💾 Immediately saving task update (including checklist, comments, etc.) to database...');
            console.log('  - Task ID:', updatedTaskData.id);
            console.log('  - Checklist items:', updatedTaskData.checklist?.length || 0);
            console.log('  - Comments count:', updatedTaskData.comments?.length || 0);
            console.log('  - Attachments count:', updatedTaskData.attachments?.length || 0);
            console.log('  - Tags count:', updatedTaskData.tags?.length || 0);
            console.log('  - Full task data:', {
                id: updatedTaskData.id,
                title: updatedTaskData.title,
                hasComments: !!updatedTaskData.comments,
                commentsLength: updatedTaskData.comments?.length,
                hasChecklist: !!updatedTaskData.checklist,
                checklistLength: updatedTaskData.checklist?.length
            });
            
            await persistProjectData({ nextTasks: updatedTasks });
            console.log('✅ Task update (including checklist, comments, etc.) saved successfully');
        } catch (error) {
            console.error('❌ Failed to save task update:', error);
            // Don't block UI - the debounced save will retry
        }
        
        setShowTaskDetailModal(false);
        setViewingTask(null);
        setViewingTaskParent(null);
        setCreatingTaskForList(null);
    };

    const handleDeleteTask = async (taskId) => {
        if (confirm('Delete this task and all its subtasks?')) {
            // Filter out the task and all its subtasks
            const updatedTasks = tasks.filter(t => t.id !== taskId);
            
            // Update local state
            setTasks(updatedTasks);
            
            // Persist to database immediately
            try {
                await persistProjectData({ nextTasks: updatedTasks });
                console.log('✅ Task deleted successfully');
            } catch (error) {
                console.error('❌ Failed to delete task:', error);
                alert('Failed to delete task: ' + error.message);
                // Revert on error
                setTasks(tasks);
            }
        }
    };

    const handleDeleteSubtask = async (parentTaskId, subtaskId) => {
        if (confirm('Delete this subtask?')) {
            const updatedTasks = tasks.map(t => {
                if (t.id === parentTaskId) {
                    return {
                        ...t,
                        subtasks: (t.subtasks || []).filter(st => st.id !== subtaskId)
                    };
                }
                return t;
            });
            
            // Update local state
            setTasks(updatedTasks);
            
            // Persist to database immediately
            try {
                await persistProjectData({ nextTasks: updatedTasks });
                console.log('✅ Subtask deleted successfully');
            } catch (error) {
                console.error('❌ Failed to delete subtask:', error);
                alert('Failed to delete subtask: ' + error.message);
                // Revert on error
                setTasks(tasks);
            }
        }
    };

    // Document Collection Management
    const handleAddDocument = () => {
        setEditingDocument(null);
        setShowDocumentModal(true);
    };

    const handleAddDocumentCollectionProcess = async () => {
        console.log('🔄 Adding Document Collection Process...');
        console.log('  - MonthlyDocumentCollectionTracker loaded:', typeof window.MonthlyDocumentCollectionTracker);
        console.log('  - Project ID:', project.id);
        console.log('  - Current hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
        
        try {
            // Cancel any pending debounced saves to prevent overwriting
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
                console.log('🛑 Cancelled pending debounced save before explicit save');
            }
            
            // Set flag to skip the useEffect save to prevent duplicates
            skipNextSaveRef.current = true;
            // Mark that hasDocumentCollectionProcess was explicitly changed
            hasDocumentCollectionProcessChangedRef.current = true;
            
            // Update state first
            setHasDocumentCollectionProcess(true);
            setActiveSection('documentCollection');
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
            
            console.log('💾 Immediately saving document collection process to database...');
            console.log('📦 Update payload:', updatePayload);
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            console.log('✅ Database save successful:', apiResponse);
            console.log('🔍 API Response details:', {
              hasData: !!apiResponse?.data,
              project: apiResponse?.data?.project || apiResponse?.project || apiResponse?.data,
              hasDocumentCollectionProcess: (apiResponse?.data?.project || apiResponse?.project || apiResponse?.data)?.hasDocumentCollectionProcess
            });
            
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
                            console.log('🗑️ Cleared cache for:', key);
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
                            console.log('🗑️ Cleared projects list cache:', key);
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
                            console.log('🔄 Reloaded project from database:', {
                                hasDocumentCollectionProcess: updatedProject.hasDocumentCollectionProcess,
                                type: typeof updatedProject.hasDocumentCollectionProcess,
                                isTrue: updatedProject.hasDocumentCollectionProcess === true
                            });
                            
                            // Try to update parent component's viewingProject state if possible
                            // This ensures the prop is updated immediately
                            // The updateViewingProject function has smart comparison to prevent unnecessary re-renders
                            if (window.updateViewingProject && typeof window.updateViewingProject === 'function') {
                                console.log('🔄 Updating parent viewingProject state');
                                window.updateViewingProject(updatedProject);
                            }
                        }
                    } else {
                        console.log('⏭️ Skipping project reload: in document collection view (managed by MonthlyDocumentCollectionTracker)');
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
                            console.log('✅ localStorage updated for consistency');
                        } catch (saveError) {
                            console.warn('Failed to save projects to dataService:', saveError);
                        }
                    }
                }
            }
            
            console.log('✅ Document Collection Process setup complete and persisted');
            
            // Keep the flag set for longer to prevent any debounced saves from overwriting
            // Reset flag after a delay to allow any pending useEffect to complete
            setTimeout(() => {
                skipNextSaveRef.current = false;
                console.log('🔄 Reset skipNextSaveRef - debounced saves can now proceed');
            }, 3000);
            
            // Keep the changed flag set for even longer to prevent sync from overwriting
            // This ensures that when we navigate back, the value from the database will be used
            // But we don't want to reset it too early, or the sync might overwrite it
            setTimeout(() => {
                hasDocumentCollectionProcessChangedRef.current = false;
                console.log('🔄 Reset hasDocumentCollectionProcessChangedRef - ready for sync from database');
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
        console.log('🔄 Kanban drag: Updating task status', { taskId, newStatus, isSubtask, parentId });
        
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
                        console.log('✅ Found matching status definition:', { original: newStatus, normalized: normalizedStatus });
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
        
        // Explicitly trigger save to ensure persistence (don't wait for debounce)
        if (updatedTasks) {
            try {
                await persistProjectData({ nextTasks: updatedTasks });
                console.log('✅ Task status update saved successfully');
            } catch (error) {
                console.error('❌ Failed to save task status update:', error);
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

    // List View Component
    const ListView = () => {
        console.log('🔍 ListView rendering - Table structure version 3.0 - FORCE REFRESH');
        console.log('🔍 ListView - viewMode check:', viewMode);
        console.log('🔍 ListView - filteredTaskLists:', filteredTaskLists?.length);
        console.log('🔍 ListView - Table structure is active, check DOM for table elements');
        if (typeof window !== 'undefined') {
            setTimeout(() => {
                const tables = document.querySelectorAll('[data-task-table-version="3.0"]');
                console.log('🔍 Found', tables.length, 'table(s) with version 3.0 in DOM');
                if (tables.length === 0) {
                    console.error('❌ NO TABLE FOUND - OLD CODE MAY BE RUNNING');
                }
            }, 1000);
        }
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
                        onClick={() => setActiveSection('overview')}
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
                        onClick={() => setActiveSection('tasks')}
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
                            onClick={() => setActiveSection('documentCollection')}
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
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Section Content */}
            {(() => {
                console.log('🟢 Rendering section content. activeSection:', activeSection);
                console.log('  - hasDocumentCollectionProcess:', hasDocumentCollectionProcess);
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
            {(() => {
                console.error('🔴 CRITICAL DEBUG - Tasks section rendering');
                console.error('🔴 viewMode:', viewMode);
                console.error('🔴 Will render:', viewMode === 'list' ? 'ListView' : 'KanbanView');
                return null;
            })()}
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
                    onClose={() => setCommentsPopup(null)}
                    position={commentsPopup.position}
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
                                onClick={() => setCommentsPopup(null)}
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
                            if (window.dataService && typeof window.dataService.getProjects === 'function') {
                                const savedProjects = await window.dataService.getProjects();
                                if (savedProjects) {
                                    const updatedProjects = savedProjects.map(p => 
                                        p.id === project.id ? { ...p, ...projectData } : p
                                    );
                                    if (window.dataService && typeof window.dataService.setProjects === 'function') {
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
                        }
                        setShowProjectModal(false);
                    }}
                    onDelete={async (projectId) => {
                        console.log('🗑️ ProjectDetail: Delete requested for project:', projectId);
                        if (onDelete && typeof onDelete === 'function') {
                            console.log('✅ ProjectDetail: Calling parent onDelete handler');
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
                    onClose={() => {
                        setShowTaskDetailModal(false);
                        setViewingTask(null);
                        setViewingTaskParent(null);
                        setCreatingTaskForList(null);
                        setCreatingTaskWithStatus(null);
                    }}
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
                                onClick={() => {
                                    setShowTaskDetailModal(false);
                                    setViewingTask(null);
                                    setViewingTaskParent(null);
                                    setCreatingTaskForList(null);
                                    setCreatingTaskWithStatus(null);
                                }}
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
    console.log('🔵 ProjectDetail.jsx: About to register on window.ProjectDetail...');
    
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
        console.log('✅ ProjectDetail component registered on window.ProjectDetail');
        console.log('✅ ProjectDetail type:', typeof ProjectDetail);
        
        // Health check: Verify it's actually registered and callable
        if (!window.ProjectDetail) {
            throw new Error('Registration failed: window.ProjectDetail is still undefined');
        }
        
        if (typeof window.ProjectDetail !== 'function') {
            throw new Error(`Registration failed: window.ProjectDetail is not a function, got: ${typeof window.ProjectDetail}`);
        }
        
        console.log('✅ ProjectDetail health check passed: Component is registered and callable');
        
        // Clear initialization flag
        window._projectDetailInitializing = false;
        
        // Dispatch event to notify that ProjectDetail is loaded
        try {
            window.dispatchEvent(new CustomEvent('componentLoaded', { 
                detail: { component: 'ProjectDetail' } 
            }));
            console.log('✅ ProjectDetail component registered and event dispatched');
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
                console.log(`✅ ProjectDetail health check ${healthCheckCount}/${maxHealthChecks}: Component healthy`);
            }
            
            if (healthCheckCount >= maxHealthChecks) {
                clearInterval(healthCheckInterval);
                console.log('✅ ProjectDetail health monitoring complete');
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
                console.log('✅ ProjectDetail registered after error recovery');
                window._projectDetailInitializing = false;
            }
        } catch (recoveryError) {
            console.error('❌ Failed to recover ProjectDetail registration:', recoveryError);
            window._projectDetailInitializing = false;
        }
    }
}
