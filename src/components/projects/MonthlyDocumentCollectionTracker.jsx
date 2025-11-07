// Get React hooks from window
const { useState, useEffect, useRef } = React;
const storage = window.storage;

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

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const [selectedYear, setSelectedYear] = useState(currentYear);
    
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
    
    const [sections, setSections] = useState(() => {
        console.log('📋 Initializing sections from project.documentSections:', project.documentSections);
        const parsed = parseSections(project.documentSections);
        console.log('📋 Parsed sections:', parsed);
        return parsed;
    });
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null); // Track which cell's popup is open
    const [quickComment, setQuickComment] = useState(''); // For quick comment input
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 }); // Store popup position
    const commentPopupContainerRef = useRef(null); // Ref for comment popup scrollable container
    
    // Ref to track if this is the initial mount (prevent save on initial load)
    const isInitialMount = useRef(true);
    
    // Ref to track when we last updated sections locally (to prevent sync from overwriting)
    const lastLocalUpdateRef = useRef(Date.now());
    
    // Ref to track if we're currently saving to prevent sync during save
    const isSavingRef = useRef(false);

    // Generate year options (current year ± 5 years)
    const yearOptions = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
        yearOptions.push(i);
    }

    // Status options with color progression from red to green
    const statusOptions = [
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-100 text-red-800', cellColor: 'bg-red-50' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-100 text-yellow-800', cellColor: 'bg-yellow-50' },
        { value: 'collected', label: 'Collected', color: 'bg-green-100 text-green-800', cellColor: 'bg-green-50' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-100 text-gray-800', cellColor: 'bg-gray-50' }
    ];

    useEffect(() => {
        // Scroll to working months after sections load and when year changes
        if (sections.length > 0 && tableRef.current && selectedYear === currentYear) {
            setTimeout(() => {
                scrollToWorkingMonths();
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

    // Sync sections from project prop when it changes (e.g., after refresh or reload)
    // This ensures that when the project data is reloaded from the database, the sections state is updated
    // BUT: Only sync if we haven't made recent local changes (to prevent overwriting user edits)
    useEffect(() => {
        if (project && project.documentSections !== undefined) {
            // Don't sync if we're currently saving or just made a local update (within last 3 seconds)
            const timeSinceLastUpdate = Date.now() - lastLocalUpdateRef.current;
            if (isSavingRef.current || timeSinceLastUpdate < 3000) {
                console.log('⏭️ Skipping sync - recent local changes or save in progress');
                return;
            }
            
            const parsed = parseSections(project.documentSections);
            
            // Use functional update to access current sections state and avoid stale closures
            setSections(currentSections => {
                // Only update if the parsed data is different from current sections
                // This prevents infinite loops and unnecessary updates
                const currentSectionsStr = JSON.stringify(currentSections);
                const parsedSectionsStr = JSON.stringify(parsed);
                
                if (currentSectionsStr !== parsedSectionsStr) {
                    // Only sync if the prop data has more sections OR if local state is empty
                    // This prevents stale prop data from overwriting newer local changes
                    if (parsed.length > currentSections.length || currentSections.length === 0) {
                        console.log('🔄 Syncing sections from project prop:', parsed.length, 'sections');
                        console.log('  - Previous sections:', currentSections.length);
                        console.log('  - New sections:', parsed.length);
                        return parsed;
                    } else {
                        console.log('⏭️ Skipping sync - local state has more sections than prop');
                    }
                }
                
                // Return current state if no change (prevents unnecessary re-renders)
                return currentSections;
            });
        }
    }, [project?.documentSections, project?.id]);

    useEffect(() => {
        // Skip save on initial mount to prevent duplicate saves when component first loads
        if (isInitialMount.current) {
            console.log('⏭️ MonthlyDocumentCollectionTracker: Skipping save on initial mount');
            isInitialMount.current = false;
            return;
        }
        
        // Save sections to project whenever they change
        const saveProjectData = async () => {
            try {
                isSavingRef.current = true;
                console.log('💾 MonthlyDocumentCollectionTracker: Saving sections...');
                console.log('  - Project ID:', project.id);
                console.log('  - Sections count:', sections.length);
                
                // Prepare the update payload
                const updatePayload = {
                    documentSections: JSON.stringify(sections)
                };
                
                console.log('📡 Sending sections update to database');
                
                // Save to database first (server-first approach)
                const apiResponse = await window.DatabaseAPI.updateProject(project.id, updatePayload);
                console.log('✅ Database save successful for document sections:', apiResponse);
                
                // Update the timestamp to prevent sync from overwriting
                lastLocalUpdateRef.current = Date.now();
                
                // Then update localStorage for consistency
                if (window.dataService && typeof window.dataService.getProjects === 'function') {
                    const savedProjects = await window.dataService.getProjects();
                    if (savedProjects) {
                        const updatedProjects = savedProjects.map(p => {
                            if (p.id === project.id) {
                                // Preserve all existing project data and only update documentSections
                                return { ...p, documentSections: sections };
                            }
                            return p;
                        });
                        if (window.dataService && typeof window.dataService.setProjects === 'function') {
                            try {
                                await window.dataService.setProjects(updatedProjects);
                                console.log('✅ localStorage updated for document sections');
                            } catch (saveError) {
                                console.warn('Failed to save projects to dataService:', saveError);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error saving document sections:', error);
                alert('Failed to save document collection changes: ' + error.message);
            } finally {
                // Reset saving flag after a short delay to allow sync to see the update
                setTimeout(() => {
                    isSavingRef.current = false;
                }, 1000);
            }
        };
        
        // Debounce saves - increased to 1.5 seconds to avoid conflicts
        const timeoutId = setTimeout(() => {
            saveProjectData();
        }, 1500);
        
        return () => clearTimeout(timeoutId);
    }, [sections, project.id]);

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

    const handleSaveSection = (sectionData) => {
        // Get current user info
        const currentUser = getCurrentUser();

        if (editingSection) {
            setSections(sections.map(s => 
                s.id === editingSection.id ? { ...s, ...sectionData } : s
            ));
            
            // Update timestamp to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
            
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
            setSections([...sections, newSection]);
            
            // Update timestamp to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
            
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
    };

    const handleDeleteSection = (sectionId) => {
        // Get current user info
        const currentUser = getCurrentUser();
        
        const section = sections.find(s => s.id === sectionId);
        if (confirm(`Delete section "${section.name}" and all its documents?`)) {
            setSections(sections.filter(s => s.id !== sectionId));
            
            // Update timestamp to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
            
            // Log to audit trail
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
        }
    };

    const handleAddDocument = (sectionId) => {
        setEditingSectionId(sectionId);
        setEditingDocument(null);
        setShowDocumentModal(true);
    };

    const handleEditDocument = (section, document) => {
        setEditingSectionId(section.id);
        setEditingDocument(document);
        setShowDocumentModal(true);
    };

    const handleSaveDocument = (documentData) => {
        // Get current user info
        const currentUser = getCurrentUser();
        
        const section = sections.find(s => s.id === editingSectionId);
        
        setSections(sections.map(s => {
            if (s.id === editingSectionId) {
                if (editingDocument) {
                    // Update existing document
                    const updated = {
                        ...s,
                        documents: s.documents.map(doc =>
                            doc.id === editingDocument.id ? { ...doc, ...documentData } : doc
                        )
                    };
                    
                    // Update timestamp to prevent sync from overwriting
                    lastLocalUpdateRef.current = Date.now();
                    
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
                    // Add new document
                    const newDocument = {
                        id: Date.now(),
                        ...documentData,
                        collectionStatus: {}, // Store month-year status
                        comments: {} // Store month-year comments
                    };
                    const updated = {
                        ...s,
                        documents: [...s.documents, newDocument]
                    };
                    
                    // Update timestamp to prevent sync from overwriting
                    lastLocalUpdateRef.current = Date.now();
                    
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
        }));
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
    };

    const handleDeleteDocument = (sectionId, documentId) => {
        // Get current user info
        const currentUser = getCurrentUser();
        
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        
        if (confirm('Delete this document/data item?')) {
            setSections(sections.map(s => {
                if (s.id === sectionId) {
                    return {
                        ...s,
                        documents: s.documents.filter(doc => doc.id !== documentId)
                    };
                }
                return s;
            }));
            
            // Update timestamp to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
            
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
        }
    };

    const handleUpdateStatus = (sectionId, documentId, month, status) => {
        // Get current user info
        const currentUser = getCurrentUser();

        // Get section and document names for audit trail
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        const oldStatus = document?.collectionStatus?.[`${month}-${selectedYear}`];

        setSections(sections.map(s => {
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
        }));
        
        // Update timestamp to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();

        // Log to audit trail
        if (window.AuditLogger) {
            const statusLabel = statusOptions.find(opt => opt.value === status)?.label || status;
            window.AuditLogger.log(
                'update',
                'projects',
                {
                    action: 'Status Updated',
                    projectId: project.id,
                    projectName: project.name,
                    sectionName: section?.name || 'Unknown',
                    documentName: document?.name || 'Unknown',
                    month: month,
                    year: selectedYear,
                    oldStatus: oldStatus || 'Not Set',
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

        // OPTIMISTIC UI UPDATE - Update UI immediately for better UX
        const updatedSections = sections.map(s => {
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

        setSections(updatedSections);
        setQuickComment(''); // Clear input immediately
        
        // Update timestamp to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();

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
                const mentionedUsernames = window.MentionHelper.getMentionedUsernames(commentText);
                const mentionedUsers = allUsers.filter(user => {
                    const userNameLower = (user.name || '').toLowerCase().replace(/\s+/g, '');
                    const emailUsername = (user.email || '').split('@')[0].toLowerCase();
                    
                    return mentionedUsernames.some(username => {
                        const usernameLower = username.toLowerCase();
                        return userNameLower === usernameLower ||
                               userNameLower.includes(usernameLower) ||
                               usernameLower.includes(userNameLower) ||
                               emailUsername === usernameLower;
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
                const updatePayload = {
                    documentSections: JSON.stringify(updatedSections)
                };
                await window.DatabaseAPI.updateProject(project.id, updatePayload);
                console.log('✅ Comment saved to database');
            } catch (error) {
                console.error('❌ Error saving comment to database:', error);
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

        const updatedSections = sections.map(s => {
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

        setSections(updatedSections);
        
        // Update timestamp to prevent sync from overwriting
        lastLocalUpdateRef.current = Date.now();

        // Save to database
        try {
            const updatePayload = {
                documentSections: JSON.stringify(updatedSections)
            };
            await window.DatabaseAPI.updateProject(project.id, updatePayload);
            console.log('✅ Comment deletion saved to database');
        } catch (error) {
            console.error('❌ Error saving comment deletion to database:', error);
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
            // Check if XLSX is already loaded
            let XLSX = window.XLSX;
            
            // If not loaded, dynamically load it
            if (!XLSX || !XLSX.utils) {
                // Remove existing script if present
                const existingScript = document.querySelector('script[src*="xlsx"]');
                if (existingScript) {
                    existingScript.remove();
                }
                
                // Try multiple CDN sources in order of preference
                const cdnUrls = [
                    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
                    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
                    'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js'
                ];
                
                let loadError = null;
                
                for (const cdnUrl of cdnUrls) {
                    try {
                        await new Promise((resolve, reject) => {
                            const script = document.createElement('script');
                            script.src = cdnUrl;
                            script.onload = () => {
                                // Wait a bit more to ensure XLSX is fully exposed
                                setTimeout(() => {
                                    XLSX = window.XLSX;
                                    if (!XLSX || !XLSX.utils) {
                                        reject(new Error('XLSX library failed to load properly'));
                                    } else {
                                        resolve();
                                    }
                                }, 150);
                            };
                            script.onerror = () => {
                                reject(new Error(`Failed to load XLSX from ${cdnUrl}`));
                            };
                            document.head.appendChild(script);
                        });
                        
                        XLSX = window.XLSX;
                        if (XLSX && XLSX.utils) {
                            break; // Successfully loaded
                        }
                    } catch (error) {
                        loadError = error;
                        // Remove the failed script
                        const failedScript = document.querySelector(`script[src="${cdnUrl}"]`);
                        if (failedScript) {
                            failedScript.remove();
                        }
                        continue; // Try next CDN
                    }
                }
                
                if (!XLSX || !XLSX.utils) {
                    throw new Error(`Failed to load XLSX library from any CDN. Last error: ${loadError?.message || 'Unknown error'}`);
                }
            }
            
            // Ensure we're using the globally loaded XLSX
            XLSX = window.XLSX;
            
            // Wait a bit more if XLSX is still not ready
            if (!XLSX || !XLSX.utils) {
                // Wait up to 2 seconds for XLSX to be fully loaded
                for (let waitAttempt = 0; waitAttempt < 20 && (!XLSX || !XLSX.utils); waitAttempt++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSX = window.XLSX;
                }
            }
            
            // Verify XLSX is available and has required methods
            if (!XLSX) {
                throw new Error('XLSX library failed to load. window.XLSX is undefined.');
            }
            if (!XLSX.utils) {
                throw new Error('XLSX library loaded but utils is missing. Try refreshing and exporting again.');
            }
            if (!XLSX.utils.book_new) {
                throw new Error('XLSX.utils.book_new is missing. The library may not be fully loaded.');
            }
            if (!XLSX.utils.aoa_to_sheet) {
                throw new Error('XLSX.utils.aoa_to_sheet is missing. The library may not be fully loaded.');
            }
            if (!XLSX.writeFile) {
                throw new Error('XLSX.writeFile is missing. The library may not be fully loaded.');
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
            alert(`Failed to export to Excel: ${errorMessage}\n\nPlease check your internet connection and try again.`);
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
            const newSections = [...sections];
            const [movedSection] = newSections.splice(draggedSection.index, 1);
            newSections.splice(dropIndex, 0, movedSection);
            setSections(newSections);
            
            // Update timestamp to prevent sync from overwriting
            lastLocalUpdateRef.current = Date.now();
        }
        setDragOverIndex(null);
    };

    // Modals
    const SectionModal = () => {
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

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
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

    const DocumentModal = () => {
        const [documentFormData, setDocumentFormData] = useState({
            name: editingDocument?.name || '',
            description: editingDocument?.description || ''
        });

        const handleSubmit = (e) => {
            e.preventDefault();
            if (!documentFormData.name.trim()) {
                alert('Please enter a document/data name');
                return;
            }
            handleSaveDocument(documentFormData);
        };

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingDocument ? 'Edit Document/Data' : 'Add Document/Data'}
                        </h2>
                        <button 
                            onClick={() => setShowDocumentModal(false)} 
                            className="text-gray-400 hover:text-gray-600 p-1"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Document/Data Name *
                            </label>
                            <input
                                type="text"
                                value={documentFormData.name}
                                onChange={(e) => setDocumentFormData({...documentFormData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="e.g., Bank Statements, Sales Report, etc."
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                Description (Optional)
                            </label>
                            <textarea
                                value={documentFormData.description}
                                onChange={(e) => setDocumentFormData({...documentFormData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                rows="2"
                                placeholder="Additional details..."
                            ></textarea>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowDocumentModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                            >
                                {editingDocument ? 'Update' : 'Add'}
                            </button>
                        </div>
                    </form>
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

        return (
            <td 
                className={`px-2 py-1 text-xs border-l border-gray-100 ${
                    workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear
                        ? 'bg-primary-50 bg-opacity-30'
                        : ''
                } ${statusConfig ? statusConfig.cellColor : ''}`}
            >
                <div className="min-w-[160px] relative">
                    {/* Status Dropdown */}
                    <select
                        value={status || ''}
                        onChange={(e) => handleUpdateStatus(section.id, document.id, month, e.target.value)}
                        className={`w-full px-1.5 py-0.5 text-[10px] rounded font-medium border-0 cursor-pointer appearance-none ${
                            status ? statusConfig.color : 'bg-white text-gray-400 hover:bg-gray-50'
                        }`}
                    >
                        <option value="">Select Status</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    
                    {/* Comments Icon/Badge - Centered vertically on right */}
                    <div className="absolute top-1/2 right-0.5 -translate-y-1/2">
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
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
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
                <div className="overflow-x-auto" ref={tableRef}>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wide sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
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
                                            <td className="px-2.5 py-2 sticky left-0 bg-gray-100 z-10 border-r border-gray-200">
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-sm text-gray-900">{section.name}</div>
                                                        {section.description && (
                                                            <div className="text-[10px] text-gray-500">{section.description}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td colSpan={12} className="px-2 py-2">
                                                <button
                                                    onClick={() => handleAddDocument(section.id)}
                                                    className="px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 transition-colors"
                                                >
                                                    <i className="fas fa-plus mr-1"></i>
                                                    Add Document/Data
                                                </button>
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
                                            section.documents.map((document) => (
                                                <tr key={document.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-1.5 sticky left-0 bg-white z-10 border-r border-gray-200">
                                                        <div className="min-w-[200px]">
                                                            <div className="text-xs font-medium text-gray-900">{document.name}</div>
                                                            {document.description && (
                                                                <div className="text-[10px] text-gray-500 mt-0.5">{document.description}</div>
                                                            )}
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
        </div>
    );
};

// Make available globally
window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
console.log('✅ MonthlyDocumentCollectionTracker component loaded and registered globally');
