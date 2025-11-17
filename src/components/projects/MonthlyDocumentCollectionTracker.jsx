// Get React hooks from window
const { useState, useEffect, useRef, useCallback, useMemo } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';

const MonthlyDocumentCollectionTracker = ({ project, onBack }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Calculate working months (2 months in arrears from current month)
    // Example: If current month is October, working months are August and September
    const getWorkingMonths = () => {
        const twoMonthsBack = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const oneMonthBack = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [twoMonthsBack, oneMonthBack];
    };
    
    const workingMonths = getWorkingMonths();
    
    const tableRef = useRef(null);
    const monthRefs = useRef({});
    const hasInitialScrolled = useRef(false);

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const YEAR_STORAGE_PREFIX = 'documentCollectionSelectedYear_';
    const getInitialSelectedYear = () => {
        if (typeof window !== 'undefined' && project?.id) {
            const storedYear = localStorage.getItem(`${YEAR_STORAGE_PREFIX}${project.id}`);
            const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
            if (!Number.isNaN(parsedYear)) {
                return parsedYear;
            }
        }
        return currentYear;
    };
    const [selectedYear, setSelectedYear] = useState(getInitialSelectedYear);
    
    // Parse documentSections safely - handle various formats
    const parseSections = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        
        try {
            // Handle stringified data
            if (typeof data === 'string') {
                let cleaned = data.trim();
                if (!cleaned) return [];
                
                // Recursively unescape until we get valid JSON
                let attempts = 0;
                const maxAttempts = 10;
                
                while (attempts < maxAttempts) {
                    try {
                        // Try to parse directly first
                        const parsed = JSON.parse(cleaned);
                        if (Array.isArray(parsed)) return parsed;
                        // If it's a string, continue unescaping
                        if (typeof parsed === 'string') {
                            cleaned = parsed;
                            attempts++;
                            continue;
                        }
                        return [];
                    } catch (parseError) {
                        // If parsing fails, try to unescape
                        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                            cleaned = cleaned.slice(1, -1);
                        }
                        // Unescape backslashes and quotes
                        cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        attempts++;
                        
                        // If we've made no progress, give up
                        if (attempts >= maxAttempts) {
                            console.warn('Failed to parse documentSections after', attempts, 'attempts:', parseError);
                            return [];
                        }
                    }
                }
                
                return [];
            }
        } catch (e) {
            console.warn('Failed to parse documentSections:', e);
            return [];
        }
        return [];
    };
    
    // Refs for state management
    const previousProjectIdRef = useRef(project?.id);
    const editingSectionIdRef = useRef(null);
    const isSavingRef = useRef(false);
    const debouncedSaveTimeoutRef = useRef(null);
    
    // Version-based conflict resolution (best practice instead of time windows)
    const [localVersion, setLocalVersion] = useState(0);
    const serverVersionRef = useRef(0);
    
    // Initialize sections from localStorage or props (pure initialization)
    const getStorageKey = () => `documentSections_${project?.id}`;
    
    const [sections, setSections] = useState(() => {
        console.log('📋 Initializing sections from project.documentSections:', project.documentSections);
        
        // Check localStorage first for saved sections
        const storageKey = getStorageKey();
        try {
            const savedData = localStorage.getItem(storageKey);
            if (savedData) {
                const parsed = JSON.parse(savedData);
                if (Array.isArray(parsed)) {
                    console.log('🛡️ Using saved sections from localStorage:', parsed.length, 'sections');
                    return parsed;
                }
            }
        } catch (e) {
            console.warn('Failed to load sections from storage:', e);
        }
        
        // Fallback to prop data
        const parsed = parseSections(project.documentSections);
        console.log('📋 Parsed sections from props:', parsed.length, 'sections');
        return parsed;
    });
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [showTemplateList, setShowTemplateList] = useState(true);
    
    // Template storage key
    const TEMPLATES_STORAGE_KEY = 'documentCollectionTemplates';
    
    // Load templates from API and localStorage (reusable function)
    const loadTemplatesFromAPI = useCallback(async () => {
        console.log('🔄 loadTemplatesFromAPI called');
        if (typeof window === 'undefined') {
            console.log('⚠️ Window undefined, skipping template load');
            return;
        }
        
        try {
            // First, load from localStorage for instant UI
            const storedTemplates = localStorage.getItem(TEMPLATES_STORAGE_KEY);
            let localTemplates = [];
            if (storedTemplates) {
                try {
                    localTemplates = JSON.parse(storedTemplates);
                    console.log(`📦 Found ${localTemplates.length} template(s) in localStorage`);
                    if (Array.isArray(localTemplates)) {
                        // Ensure sections are arrays for all templates
                        localTemplates = localTemplates.map(t => {
                            if (typeof t.sections === 'string') {
                                try {
                                    t.sections = JSON.parse(t.sections);
                                } catch (e) {
                                    console.warn('Failed to parse template sections from localStorage:', e);
                                    t.sections = [];
                                }
                            }
                            if (!Array.isArray(t.sections)) {
                                t.sections = [];
                            }
                            return t;
                        });
                        setTemplates(localTemplates);
                    }
                } catch (e) {
                    console.warn('Failed to parse stored templates:', e);
                }
            } else {
                console.log('📦 No templates in localStorage');
            }
            
            // Then fetch from API
            const token = window.storage?.getToken?.();
            console.log('🔑 Token check:', token ? `Found (length: ${token.length})` : 'Not found');
            if (token) {
                try {
                    console.log('📋 Fetching document collection templates from API...');
                    const response = await fetch('/api/document-collection-templates', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    console.log('📡 API Response status:', response.status, response.ok);
                    
                    if (response.ok) {
                        const responseData = await response.json();
                        console.log('📥 API Response data:', responseData);
                        // Handle different response formats: {templates: [...]} or {data: {templates: [...]}}
                        const apiTemplates = responseData?.templates || responseData?.data?.templates || [];
                        
                        console.log(`✅ Loaded ${apiTemplates.length} template(s) from API`, {
                            responseData,
                            apiTemplates,
                            templatesCount: apiTemplates.length,
                            firstTemplate: apiTemplates[0]
                        });
                        
                        // Merge API templates with local templates (API templates take precedence)
                        const templateMap = new Map();
                        
                        // Add local templates first
                        if (Array.isArray(localTemplates)) {
                            localTemplates.forEach(t => {
                                if (t.id) templateMap.set(t.id, t);
                            });
                        }
                        
                        // Overwrite with API templates (they're the source of truth)
                        // Ensure sections are parsed correctly (API may return string or array)
                        apiTemplates.forEach(t => {
                            if (t.id) {
                                // Parse sections if they're a string
                                if (typeof t.sections === 'string') {
                                    try {
                                        t.sections = JSON.parse(t.sections);
                                    } catch (e) {
                                        console.warn('Failed to parse template sections:', e);
                                        t.sections = [];
                                    }
                                }
                                // Ensure sections is always an array
                                if (!Array.isArray(t.sections)) {
                                    t.sections = [];
                                }
                                templateMap.set(t.id, t);
                            }
                        });
                        
                        const mergedTemplates = Array.from(templateMap.values());
                        console.log(`💾 Setting ${mergedTemplates.length} merged template(s) to state`);
                        setTemplates(mergedTemplates);
                        
                        // Update localStorage with merged templates
                        if (typeof window !== 'undefined') {
                            localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(mergedTemplates));
                            console.log('💾 Templates saved to localStorage');
                        }
                    } else {
                        const errorText = await response.text();
                        console.warn('⚠️ Failed to fetch templates from API:', response.status, errorText);
                        // Keep using local templates if API fails
                    }
                } catch (apiError) {
                    console.error('❌ Error fetching templates from API:', apiError);
                    // Keep using local templates if API fails
                }
            } else {
                console.log('📋 No auth token, using local templates only');
            }
        } catch (e) {
            console.error('❌ Failed to load templates:', e);
            setTemplates([]);
        }
    }, []);
    
    // Load templates on mount
    useEffect(() => {
        console.log('🚀 MonthlyDocumentCollectionTracker: Loading templates on mount');
        loadTemplatesFromAPI();
    }, [loadTemplatesFromAPI]);
    
    // Reload templates when template modal opens
    useEffect(() => {
        if (showTemplateModal) {
            console.log('📂 Template modal opened, reloading templates...');
            loadTemplatesFromAPI();
        }
    }, [showTemplateModal, loadTemplatesFromAPI]);
    
    // Save templates to localStorage
    const saveTemplates = (templatesToSave) => {
        if (typeof window !== 'undefined') {
            try {
                localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templatesToSave));
                setTemplates(templatesToSave);
            } catch (e) {
                console.error('Failed to save templates:', e);
            }
        }
    };
    
    // BEST PRACTICE: Separate localStorage persistence from state updates
    // Persist sections to localStorage whenever they change (pure side effect)
    useEffect(() => {
        if (!project?.id || typeof window === 'undefined') return;
        
        const storageKey = getStorageKey();
        try {
            localStorage.setItem(storageKey, JSON.stringify(sections));
            console.log('💾 Persisted sections to localStorage:', sections.length, 'sections');
        } catch (e) {
            console.warn('Failed to persist sections to localStorage:', e);
        }
    }, [sections, project?.id]); // Pure side effect - no logic mixed with state
    
    // Initialize year when project ID changes
    useEffect(() => {
        if (!project?.id || typeof window === 'undefined') return;
        
        const projectIdChanged = previousProjectIdRef.current !== project.id;
        if (!projectIdChanged && previousProjectIdRef.current !== null) return;
        
        previousProjectIdRef.current = project.id;
        
        const storageKey = `${YEAR_STORAGE_PREFIX}${project.id}`;
        const storedYear = localStorage.getItem(storageKey);
        const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
        if (!Number.isNaN(parsedYear)) {
            if (parsedYear !== selectedYear) {
                console.log('📅 Restoring selected year from localStorage:', parsedYear);
                setSelectedYear(parsedYear);
            }
        } else {
            console.log('📅 No stored year found, using current year:', currentYear);
            setSelectedYear(currentYear);
        }
    }, [project?.id]);
    
    // Dirty field tracking for collaboration
    const [dirtyFields, setDirtyFields] = useState(new Set());
    const [lastSyncData, setLastSyncData] = useState(null);

    const handleYearChange = (year) => {
        setSelectedYear(year);
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(year));
        }
    };


  // Smart Sync: Only update fields that aren't currently being edited
  // This allows real-time collaboration while preventing overwrites
  useEffect(() => {
    console.log('🔄 Smart Sync enabled - will sync non-dirty fields only');
    
    // Resume LiveDataSync so we get updates
    if (window.LiveDataSync && typeof window.LiveDataSync.resume === 'function') {
      window.LiveDataSync.resume();
    }

    // Cleanup: pause on unmount
    return () => {
      if (window.LiveDataSync && typeof window.LiveDataSync.pause === 'function') {
        window.LiveDataSync.pause();
      }
    };
  }, []);
  
  // BEST PRACTICE: Single sync mechanism with version-based conflict resolution
  useEffect(() => {
    const newData = project?.documentSections;
    if (!newData || newData === lastSyncData) return;
    
    // Skip if user is actively editing
    if (dirtyFields.size > 0) {
      console.log('⏭️ Skipping sync - user has ' + dirtyFields.size + ' dirty field(s)');
      return;
    }
    
    // Version-based conflict resolution (best practice)
    const parsed = parseSections(newData);
    const serverVersion = Date.parse(project.updatedAt || new Date().toISOString());
    
    // Only sync if server version is newer than local version
    if (serverVersion > serverVersionRef.current || localVersion === 0) {
      console.log('🔄 Syncing from server (' + parsed.length + ' sections)');
      setSections(parsed);
      serverVersionRef.current = serverVersion;
    } else {
      console.log('🛡️ Local version is newer - skipping sync to preserve user changes');
    }
    
    setLastSyncData(newData);
  }, [project?.documentSections, dirtyFields, localVersion]);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedDocument, setDraggedDocument] = useState(null);
    const [dragOverDocumentIndex, setDragOverDocumentIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null); // Track which cell's popup is open
    const [quickComment, setQuickComment] = useState(''); // For quick comment input
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 }); // Store popup position
    const commentPopupContainerRef = useRef(null); // Ref for comment popup scrollable container
    
    // BEST PRACTICE: Save to database only (localStorage handled by separate useEffect)
    const immediatelySaveDocumentSections = async (sectionsToSave) => {
        try {
            // Cancel any pending debounced saves
            if (debouncedSaveTimeoutRef.current) {
                clearTimeout(debouncedSaveTimeoutRef.current);
                debouncedSaveTimeoutRef.current = null;
            }
            
            isSavingRef.current = true;
            
            console.log('💾 Saving document sections to database...');
            console.log('  - Project ID:', project.id);
            console.log('  - Sections count:', sectionsToSave.length);
            
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.updateProject !== 'function') {
                throw new Error('DatabaseAPI.updateProject is not available');
            }
            
            const updatePayload = {
                documentSections: JSON.stringify(sectionsToSave)
            };
            
            const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
            console.log('✅ Database save successful');
            
            // Update version after successful save
            const serverVersion = Date.parse(new Date().toISOString());
            serverVersionRef.current = serverVersion;
            setLocalVersion(prev => prev + 1);
            
            // Clear cache to ensure fresh data on reload
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
            
            // Note: localStorage persistence is handled by separate useEffect
            
            isSavingRef.current = false;
        } catch (error) {
            console.error('❌ Error saving document sections:', error);
            isSavingRef.current = false;
            throw error; // Re-throw for error handling in handlers
        }
    };

    // Generate year options (allow selection back to 2015)
    const MIN_YEAR = 2015;
    const FUTURE_YEAR_BUFFER = 5;
    const yearOptions = [];
    for (let i = MIN_YEAR; i <= currentYear + FUTURE_YEAR_BUFFER; i++) {
        yearOptions.push(i);
    }

    // Status options with color progression from red to green
    const statusOptions = [
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-400 text-white font-semibold', cellColor: 'bg-red-400 border-l-4 border-red-700 shadow-sm' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-400 text-white font-semibold', cellColor: 'bg-yellow-400 border-l-4 border-yellow-700 shadow-sm' },
        { value: 'collected', label: 'Collected', color: 'bg-green-500 text-white font-semibold', cellColor: 'bg-green-500 border-l-4 border-green-700 shadow-sm' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-400 text-white font-semibold', cellColor: 'bg-gray-400 border-l-4 border-gray-700 shadow-sm' }
    ];

    // DISABLED: No automatic refresh on mount - only use data from props
    // This prevents overwriting user input and unnecessary API calls
    // Data will be loaded from props when component mounts or project changes
    
    useEffect(() => {
        // Scroll to working months only on initial load
        if (!hasInitialScrolled.current && sections.length > 0 && tableRef.current && selectedYear === currentYear) {
            setTimeout(() => {
                scrollToWorkingMonths();
                hasInitialScrolled.current = true;
            }, 100);
        }
    }, [sections, selectedYear]);

    const scrollToWorkingMonths = () => {
        const firstWorkingMonthName = months[workingMonths[0]];
        const firstMonthElement = monthRefs.current[firstWorkingMonthName];
        
        if (firstMonthElement && tableRef.current) {
            const container = tableRef.current;
            const elementLeft = firstMonthElement.offsetLeft;
            
            // Calculate the width of document column (sticky left column)
            const documentColumnWidth = 250; // Approximate width of the document info column
            
            // Scroll to show the first working month with enough padding
            // Position it after the sticky document column with some breathing room
            const scrollPosition = elementLeft - documentColumnWidth - 100;
            
            container.scrollTo({
                left: Math.max(0, scrollPosition),
                behavior: 'smooth'
            });
        }
    };

    // BEST PRACTICE: Handle project changes - reset version when switching projects
    useEffect(() => {
        const projectIdChanged = previousProjectIdRef.current !== project?.id;
        if (projectIdChanged && project?.id) {
            console.log('🔄 Project ID changed, resetting for new project');
            previousProjectIdRef.current = project.id;
            setLocalVersion(0); // Reset version for new project
            serverVersionRef.current = 0;
            
            // Load from localStorage for new project
            const storageKey = getStorageKey();
            try {
                const savedSections = localStorage.getItem(storageKey);
                if (savedSections) {
                    const parsed = JSON.parse(savedSections);
                    if (Array.isArray(parsed)) {
                        console.log('🛡️ Loaded sections from localStorage for new project:', parsed.length);
                        setSections(parsed);
                        return;
                    }
                }
            } catch (e) {
                console.warn('Failed to load sections from storage:', e);
            }
        }
    }, [project?.id]);

    // REMOVED: Debounced auto-save effect
    // NEW METHODOLOGY: Only save explicitly when user adds/edits/deletes sections or documents
    // No automatic saves - prevents refreshes and overwriting user input
    // Data only refreshes on mount or when navigating back to the page

    // Auto-scroll to last comment when comment popup opens
    useEffect(() => {
        if (hoverCommentCell && commentPopupContainerRef.current) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (commentPopupContainerRef.current) {
                    commentPopupContainerRef.current.scrollTop = commentPopupContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [hoverCommentCell, sections]); // Re-scroll when popup opens or sections change

    // Close comment popup on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Check if click is on comment button or inside popup
            const isCommentButton = event.target.closest('[data-comment-cell]');
            const isInsidePopup = event.target.closest('.comment-popup');
            
            if (hoverCommentCell && !isCommentButton && !isInsidePopup) {
                console.log('Closing popup - clicked outside');
                setHoverCommentCell(null);
                setQuickComment('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell]);

    const getStatusConfig = (status) => {
        return statusOptions.find(opt => opt.value === status) || statusOptions[0];
    };

    // Helper function to safely get current user info
    // This function will NEVER throw an error - it always returns a valid user object
    const getCurrentUser = () => {
        const defaultUser = { name: 'System', email: 'system', id: 'system', role: 'System' };
        
        try {
            // Helper to extract user from various formats
            const extractUser = (data) => {
                if (!data) return null;
                
                // Handle case where API returns { user: {...} }
                if (data.user && typeof data.user === 'object') {
                    return data.user;
                }
                
                // Handle direct user object
                if (data.name || data.email) {
                    return data;
                }
                
                return null;
            };
            
            // Method 1: Try to parse from localStorage directly first (most reliable)
            try {
                const userData = localStorage.getItem('abcotronics_user');
                if (userData && userData !== 'null' && userData !== 'undefined') {
                    const parsed = JSON.parse(userData);
                    const user = extractUser(parsed);
                    
                    if (user && (user.name || user.email)) {
                        const result = {
                            name: user.name || user.email || 'System',
                            email: user.email || 'system',
                            id: user.id || user._id || user.email || 'system',
                            role: user.role || 'System'
                        };
                        
                        // Only return if it's not the default System user
                        if (result.name !== 'System' && result.email !== 'system') {
                            console.log('✅ Retrieved user from localStorage:', result.name, result.email);
                            return result;
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to parse user from localStorage:', error);
            }
            
            // Method 2: Try getUserInfo() if it exists
            if (window.storage && typeof window.storage.getUserInfo === 'function') {
                try {
                    const userInfo = window.storage.getUserInfo();
                    if (userInfo && ((userInfo.name && userInfo.name !== 'System') || (userInfo.email && userInfo.email !== 'system'))) {
                        console.log('✅ Retrieved user from getUserInfo():', userInfo.name || userInfo.email);
                        return userInfo;
                    }
                } catch (error) {
                    // Silently continue to next method
                }
            }
            
            // Method 3: Try getUser() as fallback
            if (window.storage && typeof window.storage.getUser === 'function') {
                try {
                    const userRaw = window.storage.getUser();
                    const user = extractUser(userRaw);
                    
                    if (user && (user.name || user.email)) {
                        const result = {
                            name: user.name || user.email || 'System',
                            email: user.email || 'system',
                            id: user.id || user._id || user.email || 'system',
                            role: user.role || 'System'
                        };
                        
                        if (result.name !== 'System' && result.email !== 'system') {
                            console.log('✅ Retrieved user from getUser():', result.name || result.email);
                            return result;
                        }
                    }
                } catch (error) {
                    // Silently continue to next method
                }
            }
        } catch (error) {
            // Catch any unexpected errors
            console.warn('Unexpected error in getCurrentUser:', error);
        }
        
        console.warn('⚠️ Could not retrieve user, defaulting to System. localStorage content:', localStorage.getItem('abcotronics_user'));
        // Always return a valid user object - never throw
        return defaultUser;
    };

    const handleAddSection = () => {
        console.log('🔵 Add Section button clicked');
        console.log('  - Current sections:', sections.length);
        setEditingSection(null);
        setShowSectionModal(true);
        console.log('  - showSectionModal set to:', true);
    };

    const handleEditSection = (section) => {
        setEditingSection(section);
        setShowSectionModal(true);
    };

    const handleSaveSection = async (sectionData) => {
        // Get current user info
        const currentUser = getCurrentUser();

        // Update timestamp BEFORE state update to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();

        let updatedSections;

        if (editingSection) {
            // Use functional update to avoid race conditions
            setSections(currentSections => {
                updatedSections = currentSections.map(s => 
                    s.id === editingSection.id ? { ...s, ...sectionData } : s
                );
                console.log('📝 Updating section:', sectionData.name, 'Total sections:', updatedSections.length);
                return updatedSections;
            });
            
            // Log to audit trail
            if (window.AuditLogger) {
                window.AuditLogger.log(
                    'update',
                    'projects',
                    {
                        action: 'Section Updated',
                        projectId: project.id,
                        projectName: project.name,
                        sectionName: sectionData.name,
                        oldSectionName: editingSection.name
                    },
                    currentUser
                );
            }
        } else {
            const newSection = {
                id: Date.now(),
                ...sectionData,
                documents: []
            };
            // Use functional update to avoid race conditions
            setSections(currentSections => {
                updatedSections = [...currentSections, newSection];
                console.log('➕ Adding new section:', sectionData.name, 'Total sections:', updatedSections.length);
                // ULTRA AGGRESSIVE: Mark as initialized IMMEDIATELY when adding section
                hasInitializedRef.current = true;
                console.log('🛑 ULTRA AGGRESSIVE: Marked initialized on section add - BLOCKING all future syncs');
                return updatedSections;
            });
            
            // Log to audit trail
            if (window.AuditLogger) {
                window.AuditLogger.log(
                    'create',
                    'projects',
                    {
                        action: 'Section Created',
                        projectId: project.id,
                        projectName: project.name,
                        sectionName: sectionData.name
                    },
                    currentUser
                );
            }
        }
        
        setShowSectionModal(false);
        setEditingSection(null);
        
        // Immediately save to database to ensure persistence
        if (updatedSections) {
            await immediatelySaveDocumentSections(updatedSections);
        }
    };

    // BEST PRACTICE: Optimistic updates - update UI first, then persist
    const handleDeleteSection = async (sectionId) => {
        const currentUser = getCurrentUser();
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        
        if (!confirm(`Delete section "${section.name}" and all its documents?`)) {
            return;
        }
        
        // Capture previous state for rollback
        const previousSections = sections;
        
        // STEP 1: Optimistic update (pure state update, no side effects)
        const updatedSections = sections.filter(s => s.id !== sectionId);
        setSections(updatedSections);
        setLocalVersion(prev => prev + 1); // Increment version to prevent sync override
        
        console.log('🗑️ Deleting section:', section.name, 'Remaining sections:', updatedSections.length);
        
        // STEP 2: Log to audit trail
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'delete',
                'projects',
                {
                    action: 'Section Deleted',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: section.name,
                    documentsCount: section.documents?.length || 0
                },
                currentUser
            );
        }
        
        // STEP 3: Save to database (async - localStorage already saved by useEffect)
        try {
            await immediatelySaveDocumentSections(updatedSections);
        } catch (error) {
            // STEP 4: Rollback on error
            console.error('Failed to delete section:', error);
            setSections(previousSections); // Restore previous state
            setLocalVersion(prev => Math.max(0, prev - 1)); // Rollback version
            alert('Failed to delete section. Please try again.');
        }
    };

    // Template Management Functions
    const handleCreateTemplate = () => {
        setEditingTemplate(null);
        setShowTemplateModal(true);
    };

    const handleEditTemplate = (template) => {
        setEditingTemplate(template);
        setShowTemplateModal(true);
    };

    const handleDeleteTemplate = async (templateId) => {
        if (confirm('Delete this template? This action cannot be undone.')) {
            try {
                // Delete from API if template has a database ID (not just a timestamp ID)
                const templateToDelete = templates.find(t => t.id === templateId);
                if (templateToDelete && typeof templateToDelete.id === 'string' && templateToDelete.id.length > 15) {
                    // Likely a database ID (UUID format), try to delete from API
                    const token = window.storage?.getToken?.();
                    if (token) {
                        try {
                            const response = await fetch(`/api/document-collection-templates/${templateId}`, {
                                method: 'DELETE',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (!response.ok) {
                                console.warn('⚠️ Failed to delete template from API:', response.status);
                                // Continue with local deletion even if API fails
                            } else {
                                console.log('✅ Template deleted from API');
                            }
                        } catch (apiError) {
                            console.error('❌ Error deleting template from API:', apiError);
                            // Continue with local deletion even if API fails
                        }
                    }
                }
                
                // Update local state
                const updatedTemplates = templates.filter(t => t.id !== templateId);
                saveTemplates(updatedTemplates);
            } catch (error) {
                console.error('❌ Error deleting template:', error);
                alert('Failed to delete template. Please try again.');
            }
        }
    };

    const handleSaveTemplate = async (templateData) => {
        const currentUser = getCurrentUser();
        let updatedTemplates;
        let savedTemplate;
        
        try {
            const token = window.storage?.getToken?.();
            
            if (editingTemplate) {
                // Update existing template
                if (token && typeof editingTemplate.id === 'string' && editingTemplate.id.length > 15) {
                    // Likely a database ID, try to update via API
                    try {
                        const response = await fetch(`/api/document-collection-templates/${editingTemplate.id}`, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(templateData)
                        });
                        
                        if (response.ok) {
                            const responseData = await response.json();
                            savedTemplate = responseData.template;
                            console.log('✅ Template updated in API');
                            
                            // Update local templates with API response
                            updatedTemplates = templates.map(t => 
                                t.id === editingTemplate.id ? savedTemplate : t
                            );
                        } else {
                            console.warn('⚠️ Failed to update template in API:', response.status);
                            // Fall back to local update
                            updatedTemplates = templates.map(t => 
                                t.id === editingTemplate.id 
                                    ? { ...t, ...templateData, updatedAt: new Date().toISOString(), updatedBy: currentUser.name || currentUser.email }
                                    : t
                            );
                        }
                    } catch (apiError) {
                        console.error('❌ Error updating template in API:', apiError);
                        // Fall back to local update
                        updatedTemplates = templates.map(t => 
                            t.id === editingTemplate.id 
                                ? { ...t, ...templateData, updatedAt: new Date().toISOString(), updatedBy: currentUser.name || currentUser.email }
                                : t
                        );
                    }
                } else {
                    // Local-only template (timestamp ID), just update locally
                    updatedTemplates = templates.map(t => 
                        t.id === editingTemplate.id 
                            ? { ...t, ...templateData, updatedAt: new Date().toISOString(), updatedBy: currentUser.name || currentUser.email }
                            : t
                    );
                }
            } else {
                // Create new template
                if (token) {
                    try {
                        const response = await fetch('/api/document-collection-templates', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(templateData)
                        });
                        
                        if (response.ok) {
                            const responseData = await response.json();
                            savedTemplate = responseData.template;
                            console.log('✅ Template created in API');
                            updatedTemplates = [...templates, savedTemplate];
                        } else {
                            console.warn('⚠️ Failed to create template in API:', response.status);
                            // Fall back to local creation
                            const newTemplate = {
                                id: Date.now(),
                                ...templateData,
                                createdAt: new Date().toISOString(),
                                createdBy: currentUser.name || currentUser.email,
                                updatedAt: new Date().toISOString(),
                                updatedBy: currentUser.name || currentUser.email
                            };
                            updatedTemplates = [...templates, newTemplate];
                        }
                    } catch (apiError) {
                        console.error('❌ Error creating template in API:', apiError);
                        // Fall back to local creation
                        const newTemplate = {
                            id: Date.now(),
                            ...templateData,
                            createdAt: new Date().toISOString(),
                            createdBy: currentUser.name || currentUser.email,
                            updatedAt: new Date().toISOString(),
                            updatedBy: currentUser.name || currentUser.email
                        };
                        updatedTemplates = [...templates, newTemplate];
                    }
                } else {
                    // No auth token, create locally only
                    const newTemplate = {
                        id: Date.now(),
                        ...templateData,
                        createdAt: new Date().toISOString(),
                        createdBy: currentUser.name || currentUser.email,
                        updatedAt: new Date().toISOString(),
                        updatedBy: currentUser.name || currentUser.email
                    };
                    updatedTemplates = [...templates, newTemplate];
                }
            }
            
            saveTemplates(updatedTemplates);
            setEditingTemplate(null);
            setShowTemplateList(true);
            // Don't close modal, just go back to list view
        } catch (error) {
            console.error('❌ Error saving template:', error);
            alert('Failed to save template. Please try again.');
        }
    };

    const handleApplyTemplate = async (template, targetYear) => {
        // Ensure sections is an array
        const sections = Array.isArray(template?.sections) ? template.sections : [];
        
        if (!template || sections.length === 0) {
            alert('Template is empty or invalid');
            return;
        }

        // Get current user info
        const currentUser = getCurrentUser();
        
        // Update timestamp to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();

        // Create new sections from template with unique IDs and target year
        const newSections = sections.map(section => ({
            id: Date.now() + Math.random(), // Unique ID
            name: section.name,
            description: section.description || '',
            documents: Array.isArray(section.documents) ? section.documents.map(doc => ({
                id: Date.now() + Math.random(), // Unique ID
                name: doc.name,
                description: doc.description || '',
                collectionStatus: {} // Initialize empty status for all months
            })) : []
        }));

        // Merge with existing sections
        setSections(currentSections => {
            const updatedSections = [...currentSections, ...newSections];
            console.log(`📋 Applied template "${template.name}" to year ${targetYear}:`, {
                templateSections: sections.length,
                newSections: newSections.length,
                totalSections: updatedSections.length
            });
            
            // Mark as initialized
            hasInitializedRef.current = true;
            
            return updatedSections;
        });

        // Log to audit trail
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'create',
                'projects',
                {
                    action: 'Template Applied',
                    projectId: project.id,
                    projectName: project.name,
                    templateName: template.name,
                    templateId: template.id,
                    targetYear: targetYear,
                    sectionsAdded: newSections.length
                },
                currentUser
            );
        }

        setShowApplyTemplateModal(false);
        
        // Save to database
        setSections(currentSections => {
            const finalSections = [...currentSections, ...newSections];
            immediatelySaveDocumentSections(finalSections);
            return finalSections;
        });
    };

    const handleCreateTemplateFromCurrent = () => {
        if (sections.length === 0) {
            alert('No sections to create template from. Please add sections first.');
            return;
        }
        
        // Create template from current sections
        const templateData = {
            name: `${project.name} - ${selectedYear}`,
            description: `Template created from ${project.name} for year ${selectedYear}`,
            sections: sections.map(section => ({
                name: section.name,
                description: section.description || '',
                documents: (section.documents || []).map(doc => ({
                    name: doc.name,
                    description: doc.description || ''
                }))
            }))
        };
        
        setEditingTemplate(null);
        setShowTemplateModal(true);
        // Pre-fill the form with this data (we'll handle this in the modal)
        setTimeout(() => {
            // Store in a ref or pass via state
            if (window.tempTemplateData) {
                window.tempTemplateData = templateData;
            }
        }, 100);
    };

    const handleAddDocument = (sectionId) => {
        console.log('➕ handleAddDocument called with sectionId:', sectionId);
        if (!sectionId) {
            console.error('❌ handleAddDocument called without sectionId');
            alert('Error: Cannot add document. Section ID is missing.');
            return;
        }
        // Store in both state and ref to ensure handleSaveDocument always has access
        editingSectionIdRef.current = sectionId;
        setEditingSectionId(sectionId);
        setEditingDocument(null);
        setShowDocumentModal(true);
        console.log('✅ Document modal opening for section:', sectionId);
    };

    const handleEditDocument = (section, document) => {
        // Store in both state and ref to ensure handleSaveDocument always has access
        editingSectionIdRef.current = section.id;
        setEditingSectionId(section.id);
        setEditingDocument(document);
        setShowDocumentModal(true);
    };

    const handleSaveDocument = async (documentData) => {
        // Use ref value to ensure we always have the current section ID
        const currentSectionId = editingSectionIdRef.current || editingSectionId;
        
        // Validate that we have a section ID
        if (!currentSectionId) {
            console.error('❌ Cannot save document: No section ID specified');
            alert('Error: No section selected. Please try again.');
            return;
        }
        
        console.log('💾 Saving document to section ID:', currentSectionId);
        
        // Get current user info
        const currentUser = getCurrentUser();
        
        // Update timestamp BEFORE state update to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();
        
        let updatedSections;
        
        // Use functional update to avoid race conditions
        setSections(currentSections => {
            const section = currentSections.find(s => s.id === currentSectionId);
            
            // Validate section exists
            if (!section) {
                console.error('❌ Cannot save document: Section not found with ID:', currentSectionId);
                alert('Error: Section not found. Please try again.');
                return currentSections;
            }
            
            updatedSections = currentSections.map(s => {
                if (s.id === currentSectionId) {
                    if (editingDocument) {
                        // Update existing document - preserve ALL existing fields and merge new data
                        const updated = {
                            ...s,
                            documents: s.documents.map(doc => {
                                if (doc.id === editingDocument.id) {
                                    // Preserve existing collectionStatus, comments, and attachments
                                    const merged = {
                                        ...doc, // Keep all existing fields
                                        ...documentData, // Apply new data
                                        // Ensure these are preserved if not in documentData
                                        collectionStatus: documentData.collectionStatus || doc.collectionStatus || {},
                                        comments: documentData.comments || doc.comments || {},
                                        attachments: documentData.attachments !== undefined ? documentData.attachments : doc.attachments || []
                                    };
                                    console.log('📝 Updating document:', merged.name, 'in section:', s.name, {
                                        hasAttachments: (merged.attachments?.length || 0) > 0,
                                        hasComments: Object.keys(merged.comments || {}).length > 0,
                                        hasStatus: Object.keys(merged.collectionStatus || {}).length > 0
                                    });
                                    return merged;
                                }
                                return doc;
                            })
                        };
                        
                        // Log to audit trail
                        if (window.AuditLogger) {
                            window.AuditLogger.log(
                                'update',
                                'projects',
                                {
                                    action: 'Document Updated',
                                    projectId: project.id,
                                    projectName: project.name,
                                    sectionName: section?.name || 'Unknown',
                                    documentName: documentData.name,
                                    oldDocumentName: editingDocument.name
                                },
                                currentUser
                            );
                        }
                        
                        return updated;
                    } else {
                        // Add new document - ensure ALL fields are preserved
                        const newDocument = {
                            id: Date.now(),
                            name: documentData.name || '',
                            description: documentData.description || '',
                            attachments: documentData.attachments || [], // Preserve file attachments
                            collectionStatus: documentData.collectionStatus || {}, // Store month-year status
                            comments: documentData.comments || {} // Store month-year comments
                        };
                        const updated = {
                            ...s,
                            documents: [...s.documents, newDocument]
                        };
                        
                        console.log('➕ Adding new document:', newDocument.name, 'to section:', s.name, {
                            hasDescription: !!newDocument.description,
                            attachmentsCount: newDocument.attachments?.length || 0
                        });
                        
                        // Log to audit trail
                        if (window.AuditLogger) {
                            window.AuditLogger.log(
                                'create',
                                'projects',
                                {
                                    action: 'Document Created',
                                    projectId: project.id,
                                    projectName: project.name,
                                    sectionName: section?.name || 'Unknown',
                                    documentName: documentData.name
                                },
                                currentUser
                            );
                        }
                        
                        return updated;
                    }
                }
                return s;
            });
            
            return updatedSections;
        });
        
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
        editingSectionIdRef.current = null; // Clear ref as well
        
        // Immediately save to database to ensure persistence
        if (updatedSections) {
            await immediatelySaveDocumentSections(updatedSections);
        }
    };

    const handleDeleteDocument = async (sectionId, documentId) => {
        // Get current user info
        const currentUser = getCurrentUser();
        
        let updatedSections;
        
        // Use functional update to avoid race conditions
        setSections(currentSections => {
            const section = currentSections.find(s => s.id === sectionId);
            const document = section?.documents.find(d => d.id === documentId);
            
            if (!section || !document) return currentSections;
            
            if (confirm('Delete this document/data item?')) {
                // Update timestamp to prevent sync from overwriting
                lastLocalUpdateRef.current = Date.now();
                
                updatedSections = currentSections.map(s => {
                    if (s.id === sectionId) {
                        return {
                            ...s,
                            documents: s.documents.filter(doc => doc.id !== documentId)
                        };
                    }
                    return s;
                });
                
                console.log('🗑️ Deleting document:', document.name, 'from section:', section.name);
                
                // Log to audit trail
                if (window.AuditLogger) {
                    window.AuditLogger.log(
                        'delete',
                        'projects',
                        {
                            action: 'Document Deleted',
                            projectId: project.id,
                            projectName: project.name,
                            sectionName: section?.name || 'Unknown',
                            documentName: document?.name || 'Unknown'
                        },
                        currentUser
                    );
                }
                
                return updatedSections;
            }
            return currentSections;
        });
        
        // Immediately save to database to ensure persistence
        if (updatedSections) {
            await immediatelySaveDocumentSections(updatedSections);
        }
    };

    const handleUpdateStatus = async (sectionId, documentId, month, status) => {
        // Get current user info
        const currentUser = getCurrentUser();

        // Update timestamp BEFORE state update to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();

        let updatedSections;
        // Hoisted audit variables to use after state update
        let auditSectionName = 'Unknown';
        let auditDocumentName = 'Unknown';
        let auditOldStatus = 'Not Set';

        // Use functional update to avoid race conditions
        setSections(currentSections => {
            // Get section and document names for audit trail
            const section = currentSections.find(s => s.id === sectionId);
            const document = section?.documents.find(d => d.id === documentId);
            const oldStatus = document?.collectionStatus?.[`${month}-${selectedYear}`];
            // Capture for audit logging after update
            auditSectionName = section?.name || 'Unknown';
            auditDocumentName = document?.name || 'Unknown';
            auditOldStatus = oldStatus || 'Not Set';

            updatedSections = currentSections.map(s => {
                if (s.id === sectionId) {
                    return {
                        ...s,
                        documents: s.documents.map(doc => {
                            if (doc.id === documentId) {
                                const monthKey = `${month}-${selectedYear}`;
                                return {
                                    ...doc,
                                    collectionStatus: {
                                        ...doc.collectionStatus,
                                        [monthKey]: status
                                    }
                                };
                            }
                            return doc;
                        })
                    };
                }
                return s;
            });
            
            return updatedSections;
        });

        // Immediately save to database to ensure persistence
        if (updatedSections) {
            await immediatelySaveDocumentSections(updatedSections);
        }

        // Log to audit trail (using values from closure)
        if (window.AuditLogger) {
            const statusLabel = statusOptions.find(opt => opt.value === status)?.label || status;
            window.AuditLogger.log(
                'update',
                'projects',
                {
                    action: 'Status Updated',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: auditSectionName,
                    documentName: auditDocumentName,
                    month: month,
                    year: selectedYear,
                    oldStatus: auditOldStatus,
                    newStatus: statusLabel
                },
                currentUser
            );
        }
    };

    const handleAddComment = async (sectionId, documentId, month, commentText) => {
        if (!commentText.trim()) return;

        // Get current user info - try multiple methods
        let currentUser = getCurrentUser();
        
        // If we got System, try to fetch from API as a last resort
        if (currentUser.name === 'System' && currentUser.email === 'system') {
            try {
                if (window.storage && window.storage.getToken && window.storage.getToken()) {
                    if (window.api && window.api.me) {
                        console.log('🔄 Attempting to fetch user from API...');
                        const meResponse = await window.api.me();
                        if (meResponse) {
                            // Handle different response formats
                            const user = meResponse.user || meResponse;
                            if (user && (user.name || user.email)) {
                                currentUser = {
                                    name: user.name || user.email || 'System',
                                    email: user.email || 'system',
                                    id: user.id || user._id || user.email || 'system',
                                    role: user.role || 'System'
                                };
                                
                                // Save to localStorage for future use
                                if (window.storage && window.storage.setUser) {
                                    window.storage.setUser(user);
                                }
                                console.log('✅ Retrieved user from API:', currentUser.name, currentUser.email);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn('Failed to fetch user from API:', error);
            }
        }
        
        console.log('💬 Creating comment with user:', currentUser.name, currentUser.email);
        
        // Get section and document names for context
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        const documentName = document?.name || 'Document';
        const sectionName = section?.name || 'Section';
        const contextTitle = `${documentName} in ${sectionName}`;
        const contextLink = `/projects/${project.id}`;
        const projectName = project?.name || 'Project';

        const monthKey = `${month}-${selectedYear}`;
        const newComment = {
            id: Date.now(),
            text: commentText,
            date: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id,
            authorRole: currentUser.role
        };

        // Update timestamp BEFORE state update to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();
        
        let updatedSections;
        
        // OPTIMISTIC UI UPDATE - Update UI immediately for better UX using functional update
        setSections(currentSections => {
            updatedSections = currentSections.map(s => {
                if (s.id === sectionId) {
                    return {
                        ...s,
                        documents: s.documents.map(doc => {
                            if (doc.id === documentId) {
                                const existingComments = doc.comments?.[monthKey] || [];
                                return {
                                    ...doc,
                                    comments: {
                                        ...doc.comments,
                                        [monthKey]: [...existingComments, newComment]
                                    }
                                };
                            }
                            return doc;
                        })
                    };
                }
                return s;
            });
            return updatedSections;
        });
        setQuickComment(''); // Clear input immediately
        
        // Immediately save to database to ensure persistence
        if (updatedSections) {
            immediatelySaveDocumentSections(updatedSections).catch(error => {
                console.error('❌ Error saving comment:', error);
            });
        }

        // PRIORITY: Process @mentions FIRST (emails must be sent immediately after tagging)
        // This runs in parallel with save but prioritizes mention notifications
        const mentionNotificationPromise = (async () => {
            const hasMentions = window.MentionHelper && window.MentionHelper.hasMentions(commentText);
            if (!hasMentions) return [];
            
            try {
                // Fetch users immediately for @mentions
                const token = window.storage?.getToken?.();
                if (!token) return [];
                
                const usersResponse = await fetch('/api/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!usersResponse.ok) return [];
                
                const usersData = await usersResponse.json();
                const allUsers = usersData.data?.users || usersData.users || [];
                
                if (allUsers.length === 0) return [];
                
                // Extract mentioned users
                const mentionedEntries = window.MentionHelper.getMentionedUsernames(commentText);
                const mentionedUsers = allUsers.filter(user => {
                    const userNameNormalized = window.MentionHelper.normalizeIdentifier(user.name || '');
                    const emailUsernameNormalized = window.MentionHelper.normalizeIdentifier(
                        (user.email || '').split('@')[0]
                    );
                    
                    return mentionedEntries.some(entry => {
                        const mentionNormalized = typeof entry === 'string'
                            ? window.MentionHelper.normalizeIdentifier(entry)
                            : entry.normalized;
                        
                        if (!mentionNormalized) return false;
                        
                        return userNameNormalized === mentionNormalized ||
                               userNameNormalized.includes(mentionNormalized) ||
                               mentionNormalized.includes(userNameNormalized) ||
                               emailUsernameNormalized === mentionNormalized;
                    });
                }).filter(user => user.id !== currentUser.id);
                
                if (mentionedUsers.length === 0) return [];
                
                // Process mentions IMMEDIATELY - this sends notifications and emails synchronously
                console.log(`📧 Processing @mentions immediately for ${mentionedUsers.length} user(s)`);
                await window.MentionHelper.processMentions(
                    commentText,
                    contextTitle,
                    contextLink,
                    currentUser.name || currentUser.email || 'Unknown',
                    allUsers,
                    {
                        projectId: project?.id,
                        projectName: projectName
                    }
                );
                console.log('✅ @Mention notifications and emails sent immediately');
                return mentionedUsers;
            } catch (error) {
                console.error('❌ Error processing @mentions:', error);
                return [];
            }
        })();

        // Save to database (in parallel with mention processing)
        const savePromise = (async () => {
            try {
                // Wait for DatabaseAPI if not immediately available
                const waitForDatabaseAPI = async (maxWait = 5000, retryInterval = 100) => {
                    const startTime = Date.now();
                    while (Date.now() - startTime < maxWait) {
                        if (window.DatabaseAPI && typeof window.DatabaseAPI.updateProject === 'function') {
                            return true;
                        }
                        await new Promise(resolve => setTimeout(resolve, retryInterval));
                    }
                    return false;
                };
                
                if (!window.DatabaseAPI || typeof window.DatabaseAPI.updateProject !== 'function') {
                    console.log('⏳ MonthlyDocumentCollectionTracker: Waiting for DatabaseAPI for comment save...');
                    const apiAvailable = await waitForDatabaseAPI(5000, 100);
                    if (!apiAvailable) {
                        throw new Error('DatabaseAPI.updateProject is not available after waiting. Please refresh the page.');
                    }
                    console.log('✅ DatabaseAPI is now available for comment save');
                }
                
                const updatePayload = {
                    documentSections: JSON.stringify(updatedSections)
                };
                await window.DatabaseAPI.updateProject(project.id, updatePayload);
                console.log('✅ Comment saved to database');
                
                // Clear cache to ensure fresh data is loaded next time
                if (window.DatabaseAPI && typeof window.DatabaseAPI.clearCache === 'function') {
                    window.DatabaseAPI.clearCache(`/projects/${project.id}`);
                    window.DatabaseAPI.clearCache('/projects');
                    console.log('🗑️ Cleared project cache after comment save');
                }
                
                // Dispatch event to notify parent component
                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('projectUpdated', {
                        detail: { projectId: project.id, field: 'documentSections' }
                    }));
                }
            } catch (error) {
                console.error('❌ Error saving comment to database:', error);
                console.error('  - Error details:', {
                    message: error.message,
                    DatabaseAPI: typeof window.DatabaseAPI,
                    updateProject: typeof window.DatabaseAPI?.updateProject
                });
                alert('Failed to save comment: ' + error.message);
            }
        })();

        // Process other comment notifications (previous commenters, team members) in background
        const commentNotificationPromise = (async () => {
            try {
                // Wait for mention processing to complete first
                const mentionedUsers = await mentionNotificationPromise;
                
                // Fetch users if we need to notify previous commenters or team members
                let allUsers = [];
                const hasPreviousComments = document?.comments && Object.keys(document.comments).length > 0;
                const hasTeam = project.team;
                
                if (hasPreviousComments || hasTeam) {
                    try {
                        const token = window.storage?.getToken?.();
                        if (token) {
                            const usersResponse = await fetch('/api/users', {
                                headers: { 'Authorization': `Bearer ${token}` }
                            });
                            if (usersResponse.ok) {
                                const usersData = await usersResponse.json();
                                allUsers = usersData.data?.users || usersData.users || [];
                            }
                        }
                    } catch (error) {
                        console.error('❌ Error fetching users:', error);
                        return;
                    }
                } else {
                    // If no previous comments or team, we already have users from mention processing
                    if (mentionedUsers.length > 0) {
                        // Get users from the mention processing (they were already fetched)
                        try {
                            const token = window.storage?.getToken?.();
                            if (token) {
                                const usersResponse = await fetch('/api/users', {
                                    headers: { 'Authorization': `Bearer ${token}` }
                                });
                                if (usersResponse.ok) {
                                    const usersData = await usersResponse.json();
                                    allUsers = usersData.data?.users || usersData.users || [];
                                }
                            }
                        } catch (error) {
                            console.error('❌ Error fetching users:', error);
                            return;
                        }
                    }
                }

                // Send comment notifications to relevant users (only if we have users loaded)
                if (allUsers.length > 0) {
                    console.log(`📧 Processing comment notifications - allUsers: ${allUsers.length}`);
                    
                    // Get the updated document from updatedSections to include all previous comments
                    const updatedSection = updatedSections.find(s => s.id === sectionId);
                    const updatedDocument = updatedSection?.documents.find(d => d.id === documentId);
                    
                    // Get all users who have previously commented on this document (across all months)
                    const previousCommenters = new Set();
                    if (updatedDocument && updatedDocument.comments) {
                        Object.values(updatedDocument.comments).forEach(commentArray => {
                            if (Array.isArray(commentArray)) {
                                commentArray.forEach(comment => {
                                    // Exclude the comment we just added (by ID) and the current user
                                    if (comment.id !== newComment.id && comment.authorId && comment.authorId !== currentUser.id) {
                                        previousCommenters.add(comment.authorId);
                                    }
                                });
                            }
                        });
                    }
                    console.log(`📧 Previous commenters found: ${previousCommenters.size}`);
                    
                    // Get project team members if available
                    const projectTeamIds = new Set();
                    if (project.team) {
                        try {
                            const team = typeof project.team === 'string' ? JSON.parse(project.team || '[]') : (project.team || []);
                            if (Array.isArray(team)) {
                                team.forEach(member => {
                                    if (typeof member === 'string') {
                                        const teamUser = allUsers.find(u => 
                                            u.name === member || u.email === member || u.id === member
                                        );
                                        if (teamUser && teamUser.id) {
                                            projectTeamIds.add(teamUser.id);
                                        }
                                    } else if (member && member.id) {
                                        projectTeamIds.add(member.id);
                                    }
                                });
                            }
                        } catch (e) {
                            console.warn('Error parsing project team:', e);
                        }
                    }
                    console.log(`📧 Project team members found: ${projectTeamIds.size}`);
                    
                    // Combine previous commenters and team members
                    const usersToNotify = new Set([...previousCommenters, ...projectTeamIds]);
                    
                    // Remove comment author and mentioned users
                    usersToNotify.delete(currentUser.id);
                    mentionedUsers.forEach(user => usersToNotify.delete(user.id));
                    
                    console.log(`📧 Total users to notify (after filtering): ${usersToNotify.size}`);
                    
                    // Send notifications to each user (fire and forget - don't await)
                    if (usersToNotify.size > 0) {
                        console.log(`📧 Sending comment notifications to ${usersToNotify.size} user(s)`);
                        const notificationPromises = [];
                        for (const userId of usersToNotify) {
                            const user = allUsers.find(u => u.id === userId);
                            if (user) {
                                console.log(`📧 Creating notification for: ${user.name} (${user.email})`);
                                notificationPromises.push(
                                    window.DatabaseAPI.makeRequest('/notifications', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            userId: user.id,
                                            type: 'comment',
                                            title: `New comment on document: ${documentName}`,
                                            message: `${currentUser.name} commented on "${documentName}" in ${sectionName} (${projectName}): "${commentText.substring(0, 100)}${commentText.length > 100 ? '...' : ''}"`,
                                            link: contextLink,
                                            metadata: {
                                                projectId: project?.id,
                                                projectName: projectName,
                                                sectionId: sectionId,
                                                sectionName: sectionName,
                                                documentId: documentId,
                                                documentName: documentName,
                                                month: month,
                                                year: selectedYear,
                                                commentAuthor: currentUser.name,
                                                commentText: commentText
                                            }
                                        })
                                    }).then(response => {
                                        console.log(`✅ Notification created for ${user.name}:`, response);
                                        return response;
                                    }).catch(err => {
                                        console.error(`❌ Failed to send notification to user ${user.name}:`, err);
                                        console.error(`❌ Error details:`, {
                                            message: err.message,
                                            status: err.status,
                                            response: err.response
                                        });
                                        return null;
                                    })
                                );
                            }
                        }
                        
                        // Don't await - let notifications send in background, but log results
                        Promise.all(notificationPromises).then(results => {
                            const successCount = results.filter(r => r !== null).length;
                            console.log(`✅ Comment notifications processed: ${successCount}/${notificationPromises.length} successful`);
                        }).catch(err => {
                            console.error('❌ Error sending comment notifications:', err);
                        });
                    } else {
                        console.log(`⏭️ No users to notify (no previous commenters or team members found)`);
                    }
                }
            } catch (error) {
                console.error('❌ Error in notification processing:', error);
            }
        })();

        // Wait for save and mention processing to complete
        // This ensures @mention emails are sent immediately after tagging
        await Promise.all([savePromise, mentionNotificationPromise]);

        // Log to audit trail (non-blocking)
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'comment',
                'projects',
                {
                    action: 'Comment Added',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: section?.name || 'Unknown',
                    documentName: document?.name || 'Unknown',
                    month: month,
                    year: selectedYear,
                    commentPreview: commentText.substring(0, 50) + (commentText.length > 50 ? '...' : '')
                },
                currentUser
            );
        }
    };

    const handleDeleteComment = async (sectionId, documentId, month, commentId) => {
        let updatedSections;
        // Get current user info
        const currentUser = getCurrentUser();
        
        // Get section and document
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        const comment = document?.comments?.[`${month}-${selectedYear}`]?.find(c => c.id === commentId);
        
        // Check if user can delete (own comment or admin role)
        const canDelete = comment?.authorId === currentUser.id || 
                         currentUser.role === 'Admin' || 
                         currentUser.role === 'Administrator' ||
                         currentUser.role === 'admin';
        
        if (!canDelete) {
            alert('You can only delete your own comments or you need admin privileges.');
            return;
        }
        
        if (!confirm('Delete this comment?')) return;

        const monthKey = `${month}-${selectedYear}`;

        // Update timestamp BEFORE state update to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();
        
        // Use functional update to avoid race conditions
        setSections(currentSections => {
            updatedSections = currentSections.map(s => {
                if (s.id === sectionId) {
                    return {
                        ...s,
                        documents: s.documents.map(doc => {
                            if (doc.id === documentId) {
                                const existingComments = doc.comments?.[monthKey] || [];
                                return {
                                    ...doc,
                                    comments: {
                                        ...doc.comments,
                                        [monthKey]: existingComments.filter(c => c.id !== commentId)
                                    }
                                };
                            }
                            return doc;
                        })
                    };
                }
                return s;
            });
            return updatedSections;
        });

        // Immediately save to database to ensure persistence
        if (updatedSections) {
            await immediatelySaveDocumentSections(updatedSections);
        }

        // Log to audit trail
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'delete',
                'projects',
                {
                    action: 'Comment Deleted',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: section?.name || 'Unknown',
                    documentName: document?.name || 'Unknown',
                    month: month,
                    year: selectedYear,
                    commentAuthor: comment?.author || 'Unknown'
                },
                currentUser
            );
        }
    };

    const getDocumentStatus = (document, month) => {
        const monthKey = `${month}-${selectedYear}`;
        return document.collectionStatus?.[monthKey] || null;
    };

    const getDocumentComments = (document, month) => {
        const monthKey = `${month}-${selectedYear}`;
        return document.comments?.[monthKey] || [];
    };

    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            // Get XLSX from global scope (loaded in index.html)
            let XLSX = window.XLSX;
            
            // Wait for XLSX to be available if it's still loading
            if (!XLSX || !XLSX.utils) {
                // Wait up to 3 seconds for XLSX to be fully loaded from the script tag
                for (let waitAttempt = 0; waitAttempt < 30 && (!XLSX || !XLSX.utils); waitAttempt++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSX = window.XLSX;
                }
            }
            
            // Verify XLSX is available and has required methods
            if (!XLSX) {
                throw new Error('XLSX library failed to load. window.XLSX is undefined. Please check your internet connection and refresh the page.');
            }
            if (!XLSX.utils) {
                throw new Error('XLSX library loaded but utils is missing. Please refresh the page and try again.');
            }
            if (!XLSX.utils.book_new) {
                throw new Error('XLSX.utils.book_new is missing. The library may not be fully loaded. Please refresh the page.');
            }
            if (!XLSX.utils.aoa_to_sheet) {
                throw new Error('XLSX.utils.aoa_to_sheet is missing. The library may not be fully loaded. Please refresh the page.');
            }
            if (!XLSX.writeFile) {
                throw new Error('XLSX.writeFile is missing. The library may not be fully loaded. Please refresh the page.');
            }
        
            // Prepare data for Excel
            const excelData = [];
            
            // Add header rows
            const headerRow1 = ['Section / Document'];
            const headerRow2 = [''];
            
            // Add month headers (2 columns per month: Status, Comments)
            months.forEach(month => {
                const monthYear = `${month.slice(0, 3)} '${String(selectedYear).slice(-2)}`;
                headerRow1.push(monthYear, '');
                headerRow2.push('Status', 'Comments');
            });
            
            excelData.push(headerRow1);
            excelData.push(headerRow2);
            
            // Add section and document data rows
            sections.forEach(section => {
                // Section header row
                const sectionRow = [section.name];
                for (let i = 0; i < 12 * 2; i++) {
                    sectionRow.push('');
                }
                excelData.push(sectionRow);
                
                // Document rows
                section.documents.forEach(document => {
                    const row = [`  ${document.name}${document.description ? ' - ' + document.description : ''}`];
                    
                    months.forEach(month => {
                        const monthKey = `${month}-${selectedYear}`;
                        
                        // Status
                        const status = document.collectionStatus?.[monthKey];
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        // Comments
                        const comments = document.comments?.[monthKey] || [];
                        const commentsText = comments.map((comment, idx) => {
                            const date = new Date(comment.date || comment.timestamp || comment.createdAt).toLocaleString('en-ZA', {
                                year: 'numeric',
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            const authorName = comment.author || comment.createdBy || 'User';
                            const authorEmail = comment.authorEmail || comment.createdByEmail;
                            const authorInfo = authorEmail 
                                ? `${authorName} (${authorEmail})`
                                : authorName;
                            return `[${date}] ${authorInfo}: ${comment.text}`;
                        }).join('\n\n');
                        row.push(commentsText);
                    });
                    
                    excelData.push(row);
                });
            });
            
            // Create workbook and worksheet
            // Double-check XLSX.utils is available before use
            if (!XLSX || !XLSX.utils) {
                throw new Error('XLSX.utils became unavailable. Please refresh the page and try again.');
            }
            if (typeof XLSX.utils.book_new !== 'function') {
                throw new Error('XLSX.utils.book_new is not a function. The library version may be incompatible.');
            }
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            
            // Set column widths
            const colWidths = [
                { wch: 40 }, // Section/Document column
            ];
            
            // Add widths for each month (2 columns per month)
            for (let i = 0; i < 12; i++) {
                colWidths.push(
                    { wch: 18 }, // Status
                    { wch: 50 }  // Comments - wider for multiple entries
                );
            }
            
            ws['!cols'] = colWidths;
            
            // Enable text wrapping for comments columns
            const range = XLSX.utils.decode_range(ws['!ref']);
            for (let R = range.s.r + 2; R <= range.e.r; ++R) {
                for (let i = 0; i < 12; i++) {
                    const commentsColIdx = 1 + (i * 2) + 1; // After doc name + (months*2) + comments column
                    const cellRef = XLSX.utils.encode_cell({ r: R, c: commentsColIdx });
                    if (ws[cellRef]) {
                        if (!ws[cellRef].s) ws[cellRef].s = {};
                        ws[cellRef].s.alignment = { wrapText: true, vertical: 'top' };
                    }
                }
            }
            
            // Merge cells for month headers
            const merges = [];
            for (let i = 0; i < 12; i++) {
                const startCol = 1 + (i * 2);
                merges.push({
                    s: { r: 0, c: startCol },
                    e: { r: 0, c: startCol + 1 }
                });
            }
            ws['!merges'] = merges;
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(wb, ws, `Doc Collection ${selectedYear}`);
            
            // Generate filename
            const filename = `${project.name}_Document_Collection_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            // Write file
            XLSX.writeFile(wb, filename);
            
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            const errorMessage = error.message || 'Unknown error occurred';
            alert(`Failed to export to Excel: ${errorMessage}`);
        } finally {
            setIsExporting(false);
        }
    };

    // Section drag and drop
    const handleDragStart = (e, section, index) => {
        setDraggedSection({ section, index });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            e.currentTarget.style.opacity = '0.5';
        }, 0);
    };

    const handleDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedSection(null);
        setDragOverIndex(null);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDragEnter = (e, index) => {
        e.preventDefault();
        if (draggedSection && draggedSection.index !== index) {
            setDragOverIndex(index);
        }
    };

    const handleDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverIndex(null);
        }
    };

    const handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedSection && draggedSection.index !== dropIndex) {
            // Update timestamp BEFORE state update to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
            
            // Use functional update to avoid race conditions
            setSections(currentSections => {
                // Reorder sections based on drag and drop
                const reordered = [...currentSections];
                const [removed] = reordered.splice(draggedSection.index, 1);
                reordered.splice(dropIndex, 0, removed);
                console.log('🔄 Reordering sections via drag and drop');
                return reordered;
            });
        }
        setDragOverIndex(null);
    };

    // Document drag and drop
    const handleDocumentDragStart = (e, document, sectionId, documentIndex) => {
        setDraggedDocument({ document, sectionId, documentIndex });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            e.currentTarget.style.opacity = '0.5';
        }, 0);
    };

    const handleDocumentDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedDocument(null);
        setDragOverDocumentIndex(null);
    };

    const handleDocumentDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDocumentDragEnter = (e, sectionId, documentIndex) => {
        e.preventDefault();
        if (draggedDocument && draggedDocument.sectionId === sectionId && draggedDocument.documentIndex !== documentIndex) {
            setDragOverDocumentIndex({ sectionId, documentIndex });
        }
    };

    const handleDocumentDragLeave = (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            setDragOverDocumentIndex(null);
        }
    };

    const handleDocumentDrop = (e, sectionId, dropIndex) => {
        e.preventDefault();
        if (draggedDocument && draggedDocument.sectionId === sectionId && draggedDocument.documentIndex !== dropIndex) {
            // Update timestamp BEFORE state update to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
            
            // Use functional update to avoid race conditions
            setSections(currentSections => {
                return currentSections.map(section => {
                    if (section.id === sectionId) {
                        const reordered = [...section.documents];
                        const [removed] = reordered.splice(draggedDocument.documentIndex, 1);
                        reordered.splice(dropIndex, 0, removed);
                        console.log('🔄 Reordering documents via drag and drop');
                        return { ...section, documents: reordered };
                    }
                    return section;
                });
            });
        }
        setDragOverDocumentIndex(null);
    };

    // Modals
    const SectionModal = () => {
        // Debug: Log when modal renders
        useEffect(() => {
            console.log('✅ SectionModal rendered, showSectionModal:', showSectionModal);
        }, [showSectionModal]);

        const [sectionFormData, setSectionFormData] = useState({
            name: editingSection?.name || '',
            description: editingSection?.description || ''
        });

        const handleSubmit = (e) => {
            e.preventDefault();
            if (!sectionFormData.name.trim()) {
                alert('Please enter a section name');
                return;
            }
            handleSaveSection(sectionFormData);
        };

        console.log('✅ SectionModal: Rendering modal, showSectionModal:', showSectionModal);
        return (
            <div 
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                onClick={(e) => {
                    // Only close if clicking directly on the backdrop, not on the modal content
                    if (e.target === e.currentTarget) {
                        setShowSectionModal(false);
                    }
                }}
            >
                <div 
                    className="bg-white rounded-lg shadow-xl w-full max-w-md"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingSection ? 'Edit Section' : 'Add New Section'}
                        </h2>
                        <button 
                            onClick={() => setShowSectionModal(false)} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Section Name *
                            </label>
                            <input
                                type="text"
                                value={sectionFormData.name}
                                onChange={(e) => setSectionFormData({...sectionFormData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="e.g., Financial Documents, Client Data, etc."
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Description (Optional)
                            </label>
                            <textarea
                                value={sectionFormData.description}
                                onChange={(e) => setSectionFormData({...sectionFormData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                                placeholder="Brief description of this section..."
                            ></textarea>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowSectionModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                {editingSection ? 'Update Section' : 'Add Section'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    const handleCloseDocumentModal = () => {
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
        editingSectionIdRef.current = null; // Clear ref when modal closes
    };

    const DocumentModal = () => {
        const [documentFormData, setDocumentFormData] = useState({
            name: editingDocument?.name || '',
            description: editingDocument?.description || '',
            attachments: editingDocument?.attachments || []
        });
        const [selectedFiles, setSelectedFiles] = useState([]);
        const [uploadingFiles, setUploadingFiles] = useState(false);

        // Reset form when editingDocument changes
        useEffect(() => {
            setDocumentFormData({
                name: editingDocument?.name || '',
                description: editingDocument?.description || '',
                attachments: editingDocument?.attachments || []
            });
            setSelectedFiles([]);
            setUploadingFiles(false);
        }, [editingDocument]);

        const handleFileSelect = (e) => {
            const files = Array.from(e.target.files);
            setSelectedFiles(prev => [...prev, ...files]);
        };

        const handleRemoveFile = (index) => {
            setSelectedFiles(prev => prev.filter((_, i) => i !== index));
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!documentFormData.name.trim()) {
                alert('Please enter a document/data name');
                return;
            }

            // Upload files if any are selected
            let uploadedAttachments = [...(documentFormData.attachments || [])];
            
            if (selectedFiles.length > 0) {
                setUploadingFiles(true);
                try {
                    const token = window.storage?.getToken?.();
                    if (!token) {
                        alert('Please log in to upload files');
                        setUploadingFiles(false);
                        return;
                    }

                    for (const file of selectedFiles) {
                        try {
                            // Read file as data URL
                            const dataUrl = await new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onload = (e) => resolve(e.target.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(file);
                            });

                            // Upload to server
                            const response = await fetch('/api/files', {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    folder: 'monthly-documents',
                                    name: file.name,
                                    dataUrl
                                })
                            });

                            if (!response.ok) {
                                throw new Error(`Failed to upload ${file.name}`);
                            }

                            const uploadData = await response.json();
                            const fileUrl = uploadData.data?.url || uploadData.url;

                            uploadedAttachments.push({
                                id: Date.now() + Math.random(),
                                name: file.name,
                                size: file.size,
                                type: file.type,
                                url: fileUrl,
                                uploadedAt: new Date().toISOString()
                            });
                        } catch (error) {
                            console.error(`Error uploading file ${file.name}:`, error);
                            alert(`Failed to upload ${file.name}: ${error.message}`);
                        }
                    }
                } catch (error) {
                    console.error('Error uploading files:', error);
                    alert('Failed to upload files: ' + error.message);
                    setUploadingFiles(false);
                    return;
                } finally {
                    setUploadingFiles(false);
                }
            }

            // Save document with attachments
            handleSaveDocument({
                ...documentFormData,
                attachments: uploadedAttachments
            });
        };

        return (
            <div 
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                onClick={(e) => {
                    // Only close if clicking directly on the backdrop, not on the modal content
                    if (e.target === e.currentTarget) {
                        handleCloseDocumentModal();
                    }
                }}
            >
                <div 
                    className="bg-white rounded-lg shadow-xl w-full max-w-md"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingDocument ? 'Edit Document/Data' : 'Add Document/Data'}
                        </h2>
                        <button 
                            onClick={handleCloseDocumentModal} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label htmlFor="documentName" className="block text-xs font-medium text-gray-700 mb-1.5">
                                Document/Data Name *
                            </label>
                            <input
                                id="documentName"
                                name="documentName"
                                type="text"
                                value={documentFormData.name}
                                onChange={(e) => setDocumentFormData({...documentFormData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="e.g., Bank Statements, Sales Report, etc."
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="documentDescription" className="block text-xs font-medium text-gray-700 mb-1.5">
                                Description (Optional)
                            </label>
                            <textarea
                                id="documentDescription"
                                name="documentDescription"
                                value={documentFormData.description}
                                onChange={(e) => setDocumentFormData({...documentFormData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                                placeholder="Additional details..."
                            ></textarea>
                        </div>

                        {/* File Upload */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Attachments (Optional)
                            </label>
                            <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 text-center">
                                <input
                                    type="file"
                                    id="documentFileUpload"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.csv"
                                    multiple
                                />
                                <label
                                    htmlFor="documentFileUpload"
                                    className="cursor-pointer block"
                                >
                                    <i className="fas fa-cloud-upload-alt text-2xl text-gray-400 mb-1"></i>
                                    <p className="text-xs text-gray-600">
                                        Click to upload or drag and drop
                                    </p>
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        PDF, Word, Excel, Images, CSV (Max 8MB each)
                                    </p>
                                </label>
                                
                                {/* Selected Files Preview */}
                                {selectedFiles.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                        {selectedFiles.map((file, index) => (
                                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded text-left">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-gray-700 font-medium truncate">{file.name}</p>
                                                    <p className="text-[10px] text-gray-500">
                                                        {(file.size / 1024).toFixed(2)} KB
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveFile(index)}
                                                    className="ml-2 text-red-600 hover:text-red-700 p-1"
                                                    title="Remove"
                                                >
                                                    <i className="fas fa-times text-xs"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Existing Attachments */}
                                {documentFormData.attachments && documentFormData.attachments.length > 0 && (
                                    <div className="mt-3 space-y-1">
                                        <p className="text-[10px] font-medium text-gray-600 mb-1">Existing attachments:</p>
                                        {documentFormData.attachments.map((attachment, index) => (
                                            <div key={attachment.id || index} className="flex items-center justify-between p-2 bg-blue-50 rounded text-left">
                                                <div className="flex-1 min-w-0">
                                                    <a
                                                        href={attachment.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-blue-700 font-medium truncate hover:underline"
                                                    >
                                                        {attachment.name}
                                                    </a>
                                                    <p className="text-[10px] text-gray-500">
                                                        {attachment.size ? `${(attachment.size / 1024).toFixed(2)} KB` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={handleCloseDocumentModal}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={uploadingFiles}
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {uploadingFiles ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-1"></i>
                                        Uploading...
                                    </>
                                ) : (
                                    editingDocument ? 'Update' : 'Add'
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    // Template Management Modal
    const TemplateModal = ({ showTemplateList = true, setShowTemplateList }) => {
        // showTemplateList is now managed by parent component
        // Add safety check for setShowTemplateList
        if (!setShowTemplateList) {
            console.error('TemplateModal: setShowTemplateList prop is missing');
            return null;
        }
        
        // Reset showTemplateList when editingTemplate changes
        useEffect(() => {
            if (!setShowTemplateList) return;
            if (editingTemplate) {
                setShowTemplateList(false);
            } else {
                setShowTemplateList(true);
            }
        }, [editingTemplate, setShowTemplateList]);
        
        // Reset showTemplateList when modal closes
        useEffect(() => {
            if (!setShowTemplateList) return;
            if (!showTemplateModal) {
                setShowTemplateList(true);
            }
        }, [showTemplateModal, setShowTemplateList]);
        
        // Debug: Log templates when they change
        useEffect(() => {
            console.log('🔍 TemplateModal: Templates state changed', {
                templatesCount: templates.length,
                templates: templates,
                showTemplateModal: showTemplateModal,
                showTemplateList: showTemplateList
            });
        }, [templates, showTemplateModal, showTemplateList]);
        
        // Helper to parse sections safely
        const parseTemplateSections = (sections) => {
            if (!sections) return [];
            if (Array.isArray(sections)) return sections;
            if (typeof sections === 'string') {
                try {
                    const parsed = JSON.parse(sections);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    console.warn('Failed to parse template sections:', e);
                    return [];
                }
            }
            return [];
        };

        const [templateFormData, setTemplateFormData] = useState(() => {
            // Check if we have pre-filled data from "Save as Template"
            const prefill = window.tempTemplateData;
            if (prefill) {
                window.tempTemplateData = null; // Clear after use
                return {
                    name: prefill.name || '',
                    description: prefill.description || '',
                    sections: parseTemplateSections(prefill.sections)
                };
            }
            return {
                name: editingTemplate?.name || '',
                description: editingTemplate?.description || '',
                sections: parseTemplateSections(editingTemplate?.sections)
            };
        });

        // Update templateFormData when editingTemplate changes
        useEffect(() => {
            if (editingTemplate && !showTemplateList) {
                setTemplateFormData({
                    name: editingTemplate.name || '',
                    description: editingTemplate.description || '',
                    sections: parseTemplateSections(editingTemplate.sections)
                });
            }
        }, [editingTemplate, showTemplateList]);

        const handleAddSectionToTemplate = () => {
            setTemplateFormData({
                ...templateFormData,
                sections: [...templateFormData.sections, { name: '', description: '', documents: [] }]
            });
        };

        const handleRemoveSectionFromTemplate = (index) => {
            setTemplateFormData({
                ...templateFormData,
                sections: templateFormData.sections.filter((_, i) => i !== index)
            });
        };

        const handleUpdateSectionInTemplate = (index, sectionData) => {
            const updatedSections = [...templateFormData.sections];
            updatedSections[index] = { ...updatedSections[index], ...sectionData };
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleAddDocumentToTemplateSection = (sectionIndex) => {
            const updatedSections = [...templateFormData.sections];
            if (!updatedSections[sectionIndex].documents) {
                updatedSections[sectionIndex].documents = [];
            }
            updatedSections[sectionIndex].documents.push({ name: '', description: '' });
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleRemoveDocumentFromTemplate = (sectionIndex, docIndex) => {
            const updatedSections = [...templateFormData.sections];
            updatedSections[sectionIndex].documents = updatedSections[sectionIndex].documents.filter((_, i) => i !== docIndex);
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleUpdateDocumentInTemplate = (sectionIndex, docIndex, docData) => {
            const updatedSections = [...templateFormData.sections];
            updatedSections[sectionIndex].documents[docIndex] = { ...updatedSections[sectionIndex].documents[docIndex], ...docData };
            setTemplateFormData({ ...templateFormData, sections: updatedSections });
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            if (!templateFormData.name.trim()) {
                alert('Please enter a template name');
                return;
            }
            if (templateFormData.sections.length === 0) {
                alert('Please add at least one section to the template');
                return;
            }
            // Validate sections and documents
            for (let i = 0; i < templateFormData.sections.length; i++) {
                const section = templateFormData.sections[i];
                if (!section.name.trim()) {
                    alert(`Please enter a name for section ${i + 1}`);
                    return;
                }
            }
            await handleSaveTemplate(templateFormData);
        };

        return (
            <div 
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                onClick={(e) => {
                    // Only close if clicking directly on the backdrop, not on the modal content
                    if (e.target === e.currentTarget) {
                        setShowTemplateModal(false);
                        setEditingTemplate(null);
                        setShowTemplateList(true);
                        window.tempTemplateData = null;
                    }
                }}
            >
                <div 
                    className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {showTemplateList ? 'Template Management' : (editingTemplate ? 'Edit Template' : 'Create Template')}
                        </h2>
                        <div className="flex items-center gap-2">
                            {!showTemplateList && (
                                <button
                                    onClick={() => {
                                        setShowTemplateList(true);
                                        setEditingTemplate(null);
                                        window.tempTemplateData = null;
                                    }}
                                    className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                                    title="Back to templates list"
                                >
                                    <i className="fas fa-arrow-left mr-1"></i>
                                    Back
                                </button>
                            )}
                            <button 
                                onClick={() => {
                                    setShowTemplateModal(false);
                                    setEditingTemplate(null);
                                    setShowTemplateList(true);
                                    window.tempTemplateData = null;
                                }} 
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {showTemplateList ? (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center mb-4">
                                    <p className="text-xs text-gray-600">Manage your document collection templates</p>
                                    <button
                                        onClick={() => {
                                            setShowTemplateList(false);
                                            setEditingTemplate(null);
                                            setTemplateFormData({ name: '', description: '', sections: [] });
                                        }}
                                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                    >
                                        <i className="fas fa-plus mr-1"></i>
                                        Create New Template
                                    </button>
                                </div>
                                
                                {(() => {
                                    console.log('🔍 Template Modal: Rendering template list', {
                                        templatesCount: templates.length,
                                        templates: templates,
                                        showTemplateList: showTemplateList
                                    });
                                    if (templates.length === 0) {
                                        return (
                                            <div className="text-center py-8 text-gray-400">
                                                <i className="fas fa-layer-group text-3xl mb-2 opacity-50"></i>
                                                <p className="text-sm">No templates yet</p>
                                                <p className="text-xs mt-1">Create your first template to get started</p>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="space-y-2">
                                            {parsedTemplates.map(template => {
                                            // Ensure sections is an array and safely calculate totalDocs
                                            const sections = Array.isArray(template.sections) ? template.sections : [];
                                            const totalDocs = sections.reduce((sum, s) => {
                                                const docCount = Array.isArray(s?.documents) ? s.documents.length : 0;
                                                return sum + docCount;
                                            }, 0);
                                            return (
                                                <div key={template.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <h3 className="text-sm font-semibold text-gray-900 mb-1">{template.name}</h3>
                                                            {template.description && (
                                                                <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                                            )}
                                                            <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                                                <span><i className="fas fa-folder mr-1"></i>{sections.length} sections</span>
                                                                <span><i className="fas fa-file mr-1"></i>{totalDocs} documents</span>
                                                                {template.createdBy && (
                                                                    <span><i className="fas fa-user mr-1"></i>Created by {template.createdBy}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1 ml-3">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingTemplate(template);
                                                                    setShowTemplateList(false);
                                                                    setTemplateFormData({
                                                                        name: template.name,
                                                                        description: template.description || '',
                                                                        sections: (() => {
                                                                            if (Array.isArray(template.sections)) return template.sections;
                                                                            if (typeof template.sections === 'string') {
                                                                                try {
                                                                                    const parsed = JSON.parse(template.sections);
                                                                                    return Array.isArray(parsed) ? parsed : [];
                                                                                } catch (e) {
                                                                                    return [];
                                                                                }
                                                                            }
                                                                            return [];
                                                                        })()
                                                                    });
                                                                }}
                                                                className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                                                title="Edit template"
                                                            >
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteTemplate(template.id)}
                                                                className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                                                                title="Delete template"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        </div>
                                    );
                                })()}
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Template Name *
                                </label>
                                <input
                                    type="text"
                                    value={templateFormData.name}
                                    onChange={(e) => setTemplateFormData({...templateFormData, name: e.target.value})}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="e.g., Standard Monthly Checklist"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                    Description (Optional)
                                </label>
                                <textarea
                                    value={templateFormData.description}
                                    onChange={(e) => setTemplateFormData({...templateFormData, description: e.target.value})}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    rows="2"
                                    placeholder="Brief description of this template..."
                                ></textarea>
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-medium text-gray-700">
                                        Sections *
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddSectionToTemplate}
                                        className="px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700"
                                    >
                                        <i className="fas fa-plus mr-1"></i>
                                        Add Section
                                    </button>
                                </div>
                                
                                <div className="space-y-3">
                                    {templateFormData.sections.map((section, sectionIndex) => (
                                        <div key={sectionIndex} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                            <div className="flex items-start justify-between mb-2">
                                                <div className="flex-1 space-y-2">
                                                    <input
                                                        type="text"
                                                        value={section.name}
                                                        onChange={(e) => handleUpdateSectionInTemplate(sectionIndex, { name: e.target.value })}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                                        placeholder="Section name *"
                                                        required
                                                    />
                                                    <textarea
                                                        value={section.description || ''}
                                                        onChange={(e) => handleUpdateSectionInTemplate(sectionIndex, { description: e.target.value })}
                                                        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                                        rows="1"
                                                        placeholder="Section description (optional)"
                                                    ></textarea>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSectionFromTemplate(sectionIndex)}
                                                    className="ml-2 text-red-600 hover:text-red-800 p-1"
                                                    title="Remove section"
                                                >
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                            
                                            <div className="mt-2">
                                                <div className="flex justify-between items-center mb-1">
                                                    <label className="text-[10px] font-medium text-gray-600">Documents:</label>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleAddDocumentToTemplateSection(sectionIndex)}
                                                        className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px] font-medium hover:bg-gray-700"
                                                    >
                                                        <i className="fas fa-plus mr-0.5"></i>
                                                        Add
                                                    </button>
                                                </div>
                                                <div className="space-y-1">
                                                    {(section.documents || []).map((doc, docIndex) => (
                                                        <div key={docIndex} className="flex items-center gap-1 bg-white p-1.5 rounded border border-gray-200">
                                                            <input
                                                                type="text"
                                                                value={doc.name}
                                                                onChange={(e) => handleUpdateDocumentInTemplate(sectionIndex, docIndex, { name: e.target.value })}
                                                                className="flex-1 px-1.5 py-0.5 text-[10px] border border-gray-300 rounded focus:ring-1 focus:ring-primary-500"
                                                                placeholder="Document name *"
                                                                required
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveDocumentFromTemplate(sectionIndex, docIndex)}
                                                                className="text-red-600 hover:text-red-800 p-0.5"
                                                                title="Remove document"
                                                            >
                                                                <i className="fas fa-times text-[9px]"></i>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowTemplateModal(false);
                                        setEditingTemplate(null);
                                        setShowTemplateList(true);
                                        window.tempTemplateData = null;
                                    }}
                                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                                >
                                    {editingTemplate ? 'Update Template' : 'Create Template'}
                                </button>
                            </div>
                        </form>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Apply Template Modal
    const ApplyTemplateModal = () => {
        const [selectedTemplateId, setSelectedTemplateId] = useState(null);
        const [targetYear, setTargetYear] = useState(() => {
            const year = typeof selectedYear === 'number' && !Number.isNaN(selectedYear) ? selectedYear : currentYear;
            return year;
        });

        // Helper to safely parse template sections
        const parseTemplateSections = (sections) => {
            if (!sections) return [];
            if (Array.isArray(sections)) return sections;
            if (typeof sections === 'string') {
                try {
                    const parsed = JSON.parse(sections);
                    return Array.isArray(parsed) ? parsed : [];
                } catch (e) {
                    console.warn('Failed to parse template sections in ApplyTemplateModal:', e);
                    return [];
                }
            }
            return [];
        };

        // Helper to safely convert any value to a number, preventing NaN
        const safeNumber = (value) => {
            const num = Number(value);
            return Number.isNaN(num) ? 0 : num;
        };

        // Ensure all templates have parsed sections when modal is open
        const parsedTemplates = useMemo(() => {
            const parsed = templates.map(t => {
                const parsedSections = parseTemplateSections(t.sections);
                // Debug: Log if we find any issues
                if (!Array.isArray(parsedSections)) {
                    console.warn('⚠️ Template sections not an array after parsing:', {
                        templateId: t.id,
                        templateName: t.name,
                        sectionsType: typeof t.sections,
                        parsedSectionsType: typeof parsedSections,
                        parsedSections
                    });
                }
                return {
                    ...t,
                    sections: Array.isArray(parsedSections) ? parsedSections : []
                };
            });
            return parsed;
        }, [templates]);

        const handleApply = () => {
            if (!selectedTemplateId) {
                alert('Please select a template');
                return;
            }
            const template = parsedTemplates.find(t => String(t.id) === String(selectedTemplateId));
            if (!template) {
                alert('Template not found');
                return;
            }
            // Sections are already parsed in parsedTemplates
            handleApplyTemplate(template, targetYear);
        };

        return (
            <div 
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
                onClick={(e) => {
                    // Only close if clicking directly on the backdrop, not on the modal content
                    if (e.target === e.currentTarget) {
                        setShowApplyTemplateModal(false);
                    }
                }}
            >
                <div 
                    className="bg-white rounded-lg shadow-xl w-full max-w-md"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            Apply Template
                        </h2>
                        <button 
                            onClick={() => setShowApplyTemplateModal(false)} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <div className="p-4 space-y-4">
                        {parsedTemplates.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-sm text-gray-600 mb-3">No templates available</p>
                                <button
                                    onClick={() => {
                                        setShowApplyTemplateModal(false);
                                        handleCreateTemplate();
                                    }}
                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    Create Template
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Select Template *
                                    </label>
                                    <select
                                        value={selectedTemplateId != null ? String(selectedTemplateId) : ''}
                                        onChange={(e) => {
                                            const value = e.target.value;
                                            if (!value) {
                                                setSelectedTemplateId(null);
                                            } else {
                                                // Keep as string - template IDs can be UUIDs (strings) or numbers
                                                setSelectedTemplateId(value);
                                            }
                                        }}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                        <option value="">-- Select a template --</option>
                                        {parsedTemplates.map(template => {
                                            // Sections are already parsed in parsedTemplates
                                            const sections = Array.isArray(template.sections) ? template.sections : [];
                                            const displayCount = safeNumber(sections.length);
                                            return (
                                                <option key={template.id} value={String(template.id)}>
                                                    {template.name} ({displayCount} sections)
                                                </option>
                                            );
                                        })}
                                    </select>
                                    {(() => {
                                        if (!selectedTemplateId) {
                                            return null;
                                        }
                                        const template = parsedTemplates.find(t => String(t.id) === String(selectedTemplateId));
                                        if (!template) {
                                            return null;
                                        }
                                        if (template.description) {
                                            return (
                                                <p className="mt-1 text-[10px] text-gray-500">{template.description}</p>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Target Year
                                    </label>
                                    <select
                                        value={typeof targetYear === 'number' && !Number.isNaN(targetYear) ? targetYear : currentYear}
                                        onChange={(e) => {
                                            const parsed = parseInt(e.target.value, 10);
                                            if (Number.isNaN(parsed)) {
                                                setTargetYear(currentYear);
                                            } else {
                                                setTargetYear(parsed);
                                            }
                                        }}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    >
                                        {yearOptions.map(year => (
                                            <option key={year} value={year}>
                                                {year}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="mt-1 text-[10px] text-gray-500">
                                        Template will be applied to the selected year. Sections and documents will be added to the current collection.
                                    </p>
                                </div>

                                {(() => {
                                    if (!selectedTemplateId) {
                                        return null;
                                    }
                                    const template = parsedTemplates.find(t => String(t.id) === String(selectedTemplateId));
                                    if (!template) {
                                        return null;
                                    }
                                    // Sections are already parsed in parsedTemplates
                                    const sections = Array.isArray(template.sections) ? template.sections : [];
                                    const sectionsCount = safeNumber(sections.length);
                                    
                                    const totalDocs = sections.reduce((sum, s) => {
                                        const docCount = Array.isArray(s?.documents) ? safeNumber(s.documents.length) : 0;
                                        return safeNumber(sum) + docCount;
                                    }, 0);
                                    
                                    return (
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                                            <p className="text-[10px] font-medium text-blue-900 mb-1">Template Preview:</p>
                                            <p className="text-[10px] text-blue-700">
                                                • {sectionsCount} sections<br/>
                                                • {totalDocs} documents
                                            </p>
                                        </div>
                                    );
                                })()}

                                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowApplyTemplateModal(false)}
                                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        disabled={!selectedTemplateId}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Apply Template
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderStatusCell = (section, document, month) => {
        const status = getDocumentStatus(document, month);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(document, month);
        const hasComments = comments.length > 0;
        const cellKey = `${section.id}-${document.id}-${month}`;
        const isPopupOpen = hoverCommentCell === cellKey;
        
        // Determine cell background - prioritize status color over working month highlight
        const isWorkingMonth = workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear;
        const cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingMonth ? 'bg-primary-50' : '');
        
        // Extract text color from status config (e.g., "bg-red-100 text-red-800" -> "text-red-800")
        const textColorClass = statusConfig && statusConfig.color 
            ? statusConfig.color.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-900'
            : 'text-gray-400';

        return (
            <td 
                className={`px-2 py-1 text-xs border-l border-gray-100 ${cellBackgroundClass} relative z-0`}
            >
                <div className="min-w-[160px] relative">
                    {/* Status Dropdown */}
                    <select
                        value={status || ''}
                        onChange={(e) => handleUpdateStatus(section.id, document.id, month, e.target.value)}
                        onFocus={() => {
                            // Mark field as dirty when user starts editing
                            const fieldId = cellKey;
                            console.log('🎯 Marking field as dirty:', fieldId);
                            setDirtyFields(prev => new Set(prev).add(fieldId));
                        }}
                        onBlur={() => {
                            // Clear dirty flag after 5 seconds of inactivity
                            const fieldId = cellKey;
                            setTimeout(() => {
                                console.log('✨ Clearing dirty flag:', fieldId);
                                setDirtyFields(prev => {
                                    const next = new Set(prev);
                                    next.delete(fieldId);
                                    return next;
                                });
                            }, 5000);
                        }}
                        className={`w-full px-1.5 py-0.5 text-[10px] rounded font-medium border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-80 relative z-0`}
                        style={{ pointerEvents: 'auto' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="">Select Status</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    
                    {/* Comments Icon/Badge - Centered vertically on right */}
                    <div className="absolute top-1/2 right-0.5 -translate-y-1/2 z-10">
                        <button
                            data-comment-cell={cellKey}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('Comment button clicked for:', cellKey, 'Current state:', hoverCommentCell);
                                
                                if (isPopupOpen) {
                                    setHoverCommentCell(null);
                                } else {
                                    // Calculate position for fixed popup
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const position = {
                                        top: rect.bottom + 5,
                                        left: rect.right - 288 // 288px = 18rem (w-72)
                                    };
                                    console.log('Popup position:', position, 'Button rect:', rect);
                                    setCommentPopupPosition(position);
                                    setHoverCommentCell(cellKey);
                                }
                            }}
                            className="text-gray-500 hover:text-gray-700 transition-colors relative p-1"
                            title={hasComments ? `${comments.length} comment(s)` : 'Add comment'}
                            type="button"
                            style={{ pointerEvents: 'auto' }}
                        >
                            <i className="fas fa-comment text-base"></i>
                            {hasComments && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                    {comments.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </td>
        );
    };

    return (
        <div className="space-y-3">
            {/* Comment Popup - Rendered at root level with fixed positioning */}
            {hoverCommentCell && (() => {
                const [sectionId, documentId, month] = hoverCommentCell.split('-');
                const section = sections.find(s => s.id === parseInt(sectionId));
                const document = section?.documents.find(d => d.id === parseInt(documentId));
                const comments = document ? getDocumentComments(document, month) : [];
                
                return (
                    <div 
                        className="comment-popup fixed w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-[999]"
                        style={{
                            top: `${commentPopupPosition.top}px`,
                            left: `${commentPopupPosition.left}px`
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Previous Comments */}
                        {comments.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                                <div ref={commentPopupContainerRef} className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                    {comments.map((comment, idx) => {
                                        const currentUser = getCurrentUser();
                                        const canDelete = comment?.authorId === currentUser.id || 
                                                         comment?.author === currentUser.name ||
                                                         currentUser.role === 'Admin' || 
                                                         currentUser.role === 'Administrator' ||
                                                         currentUser.role === 'admin';
                                        const authorName = comment.author || comment.createdBy || 'User';
                                        const authorEmail = comment.authorEmail || comment.createdByEmail;
                                        
                                        return (
                                            <div key={comment.id || idx} className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5 relative group">
                                                <p className="text-xs text-gray-700 whitespace-pre-wrap pr-6">{comment.text}</p>
                                                <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                    <span className="font-medium">
                                                        {authorName}
                                                        {authorEmail ? ` (${authorEmail})` : ''}
                                                    </span>
                                                    <span>{new Date(comment.date || comment.timestamp || comment.createdAt).toLocaleString('en-ZA', { 
                                                        month: 'short', 
                                                        day: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        year: 'numeric'
                                                    })}</span>
                                                </div>
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDeleteComment(parseInt(sectionId), parseInt(documentId), month, comment.id || idx)}
                                                        className="absolute top-1 right-1 text-gray-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Delete comment"
                                                        type="button"
                                                    >
                                                        <i className="fas fa-trash text-[10px]"></i>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        
                        {/* Quick Comment Input */}
                        <div>
                            {window.CommentInputWithMentions ? (
                                <window.CommentInputWithMentions
                                    onSubmit={(commentText) => {
                                        handleAddComment(parseInt(sectionId), parseInt(documentId), month, commentText);
                                    }}
                                    placeholder="Add a comment... (@mention users, Shift+Enter for new line, Enter to send)"
                                    rows={2}
                                    taskTitle={document?.name || 'Document'}
                                    taskLink={`#${section?.name || 'Section'}-${document?.name || 'Document'}`}
                                    showButton={true}
                                />
                            ) : (
                                <>
                                    <div className="text-[10px] font-semibold text-gray-600 mb-1">Add Comment</div>
                                    <textarea
                                        value={quickComment}
                                        onChange={(e) => setQuickComment(e.target.value)}
                                        onFocus={() => {
                                            // Mark comment field as dirty when typing
                                            const fieldId = `comment-${hoverCommentCell}`;
                                            console.log('🎯 Marking comment field as dirty:', fieldId);
                                            setDirtyFields(prev => new Set(prev).add(fieldId));
                                        }}
                                        onBlur={() => {
                                            // Clear dirty flag after 3 seconds
                                            const fieldId = `comment-${hoverCommentCell}`;
                                            setTimeout(() => {
                                                console.log('✨ Clearing comment dirty flag:', fieldId);
                                                setDirtyFields(prev => {
                                                    const next = new Set(prev);
                                                    next.delete(fieldId);
                                                    return next;
                                                });
                                            }, 3000);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && e.ctrlKey) {
                                                handleAddComment(parseInt(sectionId), parseInt(documentId), month, quickComment);
                                            }
                                        }}
                                        className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="2"
                                        placeholder="Type comment... (Ctrl+Enter to submit)"
                                        autoFocus
                                    />
                                    <button
                                        onClick={() => {
                                            handleAddComment(parseInt(sectionId), parseInt(documentId), month, quickComment);
                                        }}
                                        disabled={!quickComment.trim()}
                                        className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Add Comment
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onBack} 
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Monthly Document Collection Tracker</h1>
                        <p className="text-xs text-gray-500">{project.name} • {project.client} • Track monthly document & data collection</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-gray-600">Year:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => handleYearChange(parseInt(e.target.value))}
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>
                                {year}
                                {year === currentYear && ' (Current)'}
                            </option>
                        ))}
                    </select>
                    {selectedYear === currentYear && (
                        <button
                            onClick={scrollToWorkingMonths}
                            className="px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-[10px] font-medium"
                            title="Scroll to working months"
                        >
                            <i className="fas fa-crosshairs mr-1"></i>
                            Working Months
                        </button>
                    )}
                    <button
                        onClick={handleExportToExcel}
                        disabled={isExporting || sections.length === 0}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-[10px] font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Download as Excel"
                    >
                        {isExporting ? (
                            <>
                                <i className="fas fa-spinner fa-spin"></i>
                                Exporting...
                            </>
                        ) : (
                            <>
                                <i className="fas fa-file-excel"></i>
                                Export to Excel
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleAddSection}
                        className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-[10px] font-medium"
                    >
                        <i className="fas fa-plus mr-1"></i>
                        Add Section
                    </button>
                    <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-2">
                        <button
                            onClick={() => setShowApplyTemplateModal(true)}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-[10px] font-medium"
                            title="Apply a template to this year"
                        >
                            <i className="fas fa-magic mr-1"></i>
                            Apply Template
                        </button>
                        <button
                            onClick={handleCreateTemplate}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-[10px] font-medium"
                            title="Create or manage templates"
                        >
                            <i className="fas fa-layer-group mr-1"></i>
                            Templates
                        </button>
                        {sections.length > 0 && (
                            <button
                                onClick={handleCreateTemplateFromCurrent}
                                className="px-3 py-1 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-[10px] font-medium"
                                title="Create template from current sections"
                            >
                                <i className="fas fa-save mr-1"></i>
                                Save as Template
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Legend */}
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
                <div className="space-y-1.5">
                    {/* Working Months Info */}
                    <div className="flex items-center gap-2 pb-1.5 border-b border-gray-100">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-medium">
                            <i className="fas fa-calendar-check mr-1 text-[10px]"></i>
                            Working Months
                        </span>
                        <span className="text-[10px] text-gray-500">
                            Highlighted columns show current focus months (2 months in arrears)
                        </span>
                    </div>
                    
                    {/* Status Legend */}
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-medium text-gray-600">Status Progression:</span>
                        {statusOptions.slice(0, 3).map((option, idx) => (
                            <React.Fragment key={option.value}>
                                <div className="flex items-center gap-1">
                                    <div className={`w-3 h-3 rounded ${option.cellColor} border border-gray-300`}></div>
                                    <span className="text-[10px] text-gray-600">{option.label}</span>
                                </div>
                                {idx < 2 && (
                                    <i className="fas fa-arrow-right text-[8px] text-gray-400"></i>
                                )}
                            </React.Fragment>
                        ))}
                        <span className="text-gray-300 mx-1">|</span>
                        <div className="flex items-center gap-1">
                            <div className={`w-3 h-3 rounded ${statusOptions[3].cellColor} border border-gray-300`}></div>
                            <span className="text-[10px] text-gray-600">{statusOptions[3].label}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Collection Tracker Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="relative overflow-x-auto" ref={tableRef}>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th 
                                    className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide sticky left-0 bg-gray-50 z-50 border-r border-gray-200"
                                    style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                >
                                    Document / Data
                                </th>
                                {months.map((month, idx) => (
                                    <th 
                                        key={month}
                                        ref={el => monthRefs.current[month] = el}
                                        className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wide border-l border-gray-200 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-600'
                                        }`}
                                        >
                                        <div className="flex flex-col items-center gap-0.5">
                                            <span>{month.slice(0, 3)} '{String(selectedYear).slice(-2)}</span>
                                            {workingMonths.includes(idx) && selectedYear === currentYear && (
                                                <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-semibold bg-primary-100 text-primary-700">
                                                    <i className="fas fa-calendar-check mr-0.5"></i>
                                                    Working
                                                </span>
                                            )}
                                        </div>
                                    </th>
                                ))}
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide border-l border-gray-200">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {sections.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="px-6 py-8 text-center text-gray-400">
                                        <i className="fas fa-folder-open text-3xl mb-2 opacity-50"></i>
                                        <p className="text-sm">No sections yet</p>
                                        <button
                                            onClick={handleAddSection}
                                            className="mt-3 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                        >
                                            <i className="fas fa-plus mr-1"></i>
                                            Add First Section
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                sections.map((section, sectionIndex) => (
                                    <React.Fragment key={section.id}>
                                        {/* Section Header Row */}
                                        <tr 
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, section, sectionIndex)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={handleDragOver}
                                            onDragEnter={(e) => handleDragEnter(e, sectionIndex)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, sectionIndex)}
                                            className={`bg-gray-100 cursor-grab active:cursor-grabbing ${
                                                dragOverIndex === sectionIndex ? 'border-t-2 border-primary-500' : ''
                                            }`}
                                        >
                                                    <td 
                                                        className="px-2.5 py-2 sticky left-0 bg-gray-100 z-50 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-sm text-gray-900">{section.name}</div>
                                                        {section.description && (
                                                            <div className="text-[10px] text-gray-500">{section.description}</div>
                                                        )}
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="mt-2 px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 transition-colors"
                                                        >
                                                            <i className="fas fa-plus mr-1"></i>
                                                            Add Document/Data
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td colSpan={12} className="px-2 py-2">
                                            </td>
                                            <td className="px-2.5 py-2 border-l border-gray-200">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleEditSection(section)}
                                                        className="text-gray-600 hover:text-primary-600 p-1"
                                                        title="Edit Section"
                                                    >
                                                        <i className="fas fa-edit text-xs"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSection(section.id)}
                                                        className="text-gray-600 hover:text-red-600 p-1"
                                                        title="Delete Section"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Document Rows */}
                                        {section.documents.length === 0 ? (
                                            <tr>
                                                <td colSpan={14} className="px-8 py-4 text-center text-gray-400">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <i className="fas fa-file-alt text-2xl opacity-50"></i>
                                                        <p className="text-xs">No documents/data in this section</p>
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-xs font-medium flex items-center gap-1.5"
                                                        >
                                                            <i className="fas fa-plus"></i>
                                                            Add Document/Data
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            section.documents.map((document, documentIndex) => (
                                                <tr 
                                                    key={document.id} 
                                                    draggable="true"
                                                    onDragStart={(e) => handleDocumentDragStart(e, document, section.id, documentIndex)}
                                                    onDragEnd={handleDocumentDragEnd}
                                                    onDragOver={handleDocumentDragOver}
                                                    onDragEnter={(e) => handleDocumentDragEnter(e, section.id, documentIndex)}
                                                    onDragLeave={handleDocumentDragLeave}
                                                    onDrop={(e) => handleDocumentDrop(e, section.id, documentIndex)}
                                                    className={`hover:bg-gray-50 cursor-grab active:cursor-grabbing ${
                                                        dragOverDocumentIndex?.sectionId === section.id && dragOverDocumentIndex?.documentIndex === documentIndex 
                                                            ? 'border-t-2 border-primary-500' : ''
                                                    }`}
                                                >
                                                    <td 
                                                        className="px-4 py-1.5 sticky left-0 bg-white z-50 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                        <div className="min-w-[200px] flex items-center gap-2">
                                                            <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                                            <div className="flex-1">
                                                                <div className="text-xs font-medium text-gray-900">{document.name}</div>
                                                                {document.description && (
                                                                    <div className="text-[10px] text-gray-500 mt-0.5">{document.description}</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    {months.map(month => (
                                                        <React.Fragment key={`${document.id}-${month}`}>
                                                            {renderStatusCell(section, document, month)}
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="px-2.5 py-1.5 border-l border-gray-200">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleEditDocument(section, document)}
                                                                className="text-gray-600 hover:text-primary-600 p-1"
                                                                title="Edit"
                                                            >
                                                                <i className="fas fa-edit text-xs"></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDocument(section.id, document.id)}
                                                                className="text-gray-600 hover:text-red-600 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {showSectionModal && <SectionModal />}
            {showDocumentModal && <DocumentModal />}
            {showTemplateModal && <TemplateModal showTemplateList={showTemplateList} setShowTemplateList={setShowTemplateList} />}
            {showApplyTemplateModal && <ApplyTemplateModal />}
        </div>
    );
};

// Make available globally
window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
console.log('✅ MonthlyDocumentCollectionTracker component loaded and registered globally');

