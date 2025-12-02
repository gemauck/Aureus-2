// Get React hooks from window
// VERSION: Contact filter updated - removed "All Contacts" option
// DEPLOYMENT FIX: Contact filter now only shows site-specific contacts
// FIX: Added useRef to prevent form reset when user is editing
// FIX: formData initialization moved to top to prevent TDZ errors
const { useState, useEffect, useRef, useCallback } = React;

const ClientDetailModal = ({ client, onSave, onUpdate, onClose, onDelete, allProjects, onNavigateToProject, isFullPage = false, isEditing = false, hideSearchFilters = false, initialTab = 'overview', onTabChange, onPauseSync, onEditingChange, onOpenOpportunity }) => {
    // CRITICAL: Initialize formData FIRST, before any other hooks or refs that might reference it
    // This prevents "Cannot access 'formData' before initialization" errors
    const mergeUniqueById = (items = [], extras = []) => {
        const map = new Map();
        [...(items || []), ...(extras || [])].forEach(item => {
            if (item && item.id) {
                map.set(item.id, item);
            }
        });
        return Array.from(map.values());
    };
    
    const [formData, setFormData] = useState(() => {
        // Parse JSON strings to arrays/objects if needed
        const parsedClient = client ? {
            ...client,
            contacts: typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []),
            followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
            projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
            comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
            contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
            sites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []),
            opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
            activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
            services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || []),
            billingTerms: typeof client.billingTerms === 'string' ? JSON.parse(client.billingTerms || '{}') : (client.billingTerms || {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            })
        } : {
            name: '',
            type: 'client',
            industry: '',
            status: 'active',
            stage: 'Awareness',
            revenue: 0,
            value: 0,
            probability: 100,
            contacts: [],
            followUps: [],
            projectIds: [],
            comments: [],
            contracts: [],
            sites: [],
            opportunities: [],
            activityLog: [],
            services: [],
            billingTerms: {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            }
        };
        
        return parsedClient;
    });
    
    // Check if current user is admin
    const user = window.storage?.getUser?.() || {};
    const isAdmin = user?.role?.toLowerCase() === 'admin';
    
    // Now initialize other state and refs AFTER formData
    const [activeTab, setActiveTab] = useState(() => {
        // If user tries to access contracts tab but is not admin, default to overview
        if (initialTab === 'contracts' && !isAdmin) {
            return 'overview';
        }
        // Redirect old 'service' or 'maintenance' tabs to combined 'service-maintenance' tab
        if (initialTab === 'service' || initialTab === 'maintenance') {
            return 'service-maintenance';
        }
        return initialTab;
    });
    const [uploadingContract, setUploadingContract] = useState(false);
    
    // Track optimistic updates in STATE (not refs) so React re-renders when they change
    const [optimisticContacts, setOptimisticContacts] = useState([]);
    const [optimisticSites, setOptimisticSites] = useState([]);
    
    // Industries state
    const [industries, setIndustries] = useState([]);
    
    // Company Groups state
    const [allGroups, setAllGroups] = useState([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [primaryParent, setPrimaryParent] = useState(null);
    const [groupMemberships, setGroupMemberships] = useState([]);
    const [showAddGroupModal, setShowAddGroupModal] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [createGroupMode, setCreateGroupMode] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [newGroupIndustry, setNewGroupIndustry] = useState('Other');
    // Group management state
    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
    const [showDeleteGroupModal, setShowDeleteGroupModal] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState(null);
    const [standaloneGroupName, setStandaloneGroupName] = useState('');
    const [standaloneGroupIndustry, setStandaloneGroupIndustry] = useState('Other');
    
    // Track if user has edited the form to prevent unwanted resets
    const hasUserEditedForm = useRef(false);
    const lastSavedClientId = useRef(client?.id);
    
    // Use ref to track latest formData for auto-save
    const formDataRef = useRef(null);
    const isAutoSavingRef = useRef(false);
    const lastSavedDataRef = useRef(null); // Track last saved state
    
    // Track when user is actively typing/editing in an input field
    const isEditingRef = useRef(false);
    const editingTimeoutRef = useRef(null); // Track timeout to clear editing flag
    
    // Track which fields the user has actually entered data into - NEVER overwrite these
    const userEditedFieldsRef = useRef(new Set()); // Set of field names user has edited
    
    // CRITICAL: Track the last client object we processed to detect LiveDataSync updates
    // This helps us run the guard even when the ID hasn't changed but the object reference has
    const lastProcessedClientRef = useRef(null);
    
    // CRITICAL: Track when user has started typing - once they start, NEVER update formData from prop
    const userHasStartedTypingRef = useRef(false);
    
    // Track loading state to prevent duplicate API calls
    const isLoadingContactsRef = useRef(false);
    const isLoadingSitesRef = useRef(false);
    const isLoadingClientRef = useRef(false);
    const isLoadingOpportunitiesRef = useRef(false);
    const isLoadingGroupsRef = useRef(false);
    const pendingTimeoutsRef = useRef([]); // Track all pending timeouts to cancel on unmount
    
    // Refs for auto-scrolling comments
    const commentsContainerRef = useRef(null);
    const contentScrollableRef = useRef(null);
    
    // Ref for comment textarea to preserve cursor position
    const commentTextareaRef = useRef(null);
    
    // Ref for notes textarea to preserve cursor position
    const notesTextareaRef = useRef(null);
    const notesCursorPositionRef = useRef(null); // Track cursor position to restore after renders
    const isSpacebarPressedRef = useRef(false); // Track if spacebar was just pressed
    
    // Restore cursor position after formData.notes changes - use useLayoutEffect for synchronous restoration
    React.useLayoutEffect(() => {
        if (notesCursorPositionRef.current !== null && notesTextareaRef.current) {
            const pos = notesCursorPositionRef.current;
            const textarea = notesTextareaRef.current;
            // Always restore cursor position if valid
            if (textarea.value.length >= pos) {
                textarea.setSelectionRange(pos, pos);
                textarea.focus();
            }
        }
    }, [formData.notes]);
    
    // CRITICAL: Sync formDataRef with formData so guards can check current values
    useEffect(() => {
        formDataRef.current = formData;
    }, [formData]);
    
    // Cleanup editing timeout on unmount
    useEffect(() => {
        return () => {
            if (editingTimeoutRef.current) {
                clearTimeout(editingTimeoutRef.current);
            }
        };
    }, []);
    
    // CRITICAL: Completely stop LiveDataSync when modal is open (whether new or existing client)
    // LiveDataSync will ONLY resume when user explicitly saves/closes the form
    // VERSION: v2 - NO RESTART IN CLEANUP (2025-01-06)
    useEffect(() => {
        // Stop LiveDataSync directly if available, regardless of onPauseSync prop
        // This ensures LiveDataSync is stopped even if onPauseSync prop is not passed
        if (window.LiveDataSync && window.LiveDataSync.stop) {
            window.LiveDataSync.stop();
        }
        
        // Also use onPauseSync callback if provided (for parent component coordination)
        // This sets isFormOpenRef to true, providing additional blocking
        if (onPauseSync && typeof onPauseSync === 'function') {
            onPauseSync(true);
        }
        
        // CRITICAL: LiveDataSync will ONLY restart when modal explicitly closes
        // This happens in onClose callback, NOT in cleanup to prevent premature restarts
        // VERSION v2: Removed all LiveDataSync.start() calls from cleanup
        return () => {
            // Don't restart here - only restart when user explicitly closes/saves
            // NO LiveDataSync.start() here - only in onClose callback
        };
    }, []); // Run on mount/unmount only - stop/start based on modal visibility
    
    // Cleanup: Cancel all pending timeouts when component unmounts
    useEffect(() => {
        return () => {
            // Cancel all pending timeouts to prevent API calls after unmount
            pendingTimeoutsRef.current.forEach(timeoutId => {
                clearTimeout(timeoutId);
            });
            pendingTimeoutsRef.current = [];
            // Reset loading flags
            isLoadingContactsRef.current = false;
            isLoadingSitesRef.current = false;
            isLoadingClientRef.current = false;
            isLoadingOpportunitiesRef.current = false;
        };
    }, []);
    
    // Update tab when initialTab prop changes
    useEffect(() => {
        // If user tries to access contracts tab but is not admin, default to overview
        if (initialTab === 'contracts' && !isAdmin) {
            setActiveTab('overview');
        } else {
            setActiveTab(initialTab);
        }
    }, [initialTab, isAdmin]);
    
    // MANUFACTURING PATTERN: Only sync formData when client ID changes (switching to different client)
    // Once modal is open, formData is completely user-controlled - no automatic syncing from props
    // This matches Manufacturing.jsx which has NO useEffect watching selectedItem prop
    useEffect(() => {
        // CRITICAL: If client is null (new client), NEVER sync formData from prop
        // User is creating a new client - formData should be completely user-controlled
        if (!client) {
            return;
        }
        
        const currentClientId = client?.id || null;
        const previousClientId = lastProcessedClientRef.current?.id || null;
        
        // Skip if same client (by ID) - no need to sync
        if (currentClientId === previousClientId && client === lastProcessedClientRef.current) {
            return;
        }
        
        // CRITICAL: If user has started typing or edited fields, NEVER update formData from prop
        if (userHasStartedTypingRef.current || userEditedFieldsRef.current.size > 0) {
            lastProcessedClientRef.current = client;
            return;
        }
        
        // CRITICAL: Block if user is currently editing or saving
        if (isEditingRef.current || isAutoSavingRef.current || hasUserEditedForm.current) {
            lastProcessedClientRef.current = client;
            return;
        }
        
        // Check if formData has user-entered content
        const currentFormData = formDataRef.current || {};
        const formDataHasContent = Boolean(
            (currentFormData.name && currentFormData.name.trim()) ||
            (currentFormData.notes && currentFormData.notes.trim()) ||
            (currentFormData.industry && currentFormData.industry.trim()) ||
            (currentFormData.address && currentFormData.address.trim()) ||
            (currentFormData.website && currentFormData.website.trim())
        );
        
        // Block if formData has content (user has entered something)
        if (formDataHasContent) {
            lastProcessedClientRef.current = client;
            return;
        }
        
        // CRITICAL: If same client ID (and not first time), NEVER sync - user might be typing
        // Only sync when switching to a completely different client (different ID)
        const isDifferentClient = currentClientId !== previousClientId && currentClientId !== null && previousClientId !== null;
        const isFirstTimeOpening = client && previousClientId === null && lastProcessedClientRef.current === null;
        
        // CRITICAL: If same client ID (and not first time opening), NEVER sync even if form is empty (might be mid-edit)
        if (currentClientId === previousClientId && currentClientId !== null && !isFirstTimeOpening) {
            lastProcessedClientRef.current = client;
            return;
        }
        
        // Only sync when:
        // 1. Switching to a different client (different ID) AND form is empty, OR
        // 2. Opening a client for the first time (client exists but previousClientId is null)
        // This matches Manufacturing pattern: only set formData when opening a new item
        if (client && (isDifferentClient || isFirstTimeOpening) && !formDataHasContent) {
            const parsedClient = {
                ...client,
                contacts: typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []),
                followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
                projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
                comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
                contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
                sites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []),
                opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
                activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
                billingTerms: typeof client.billingTerms === 'string' ? JSON.parse(client.billingTerms || '{}') : (client.billingTerms || {
                    paymentTerms: 'Net 30',
                    billingFrequency: 'Monthly',
                    currency: 'ZAR',
                    retainerAmount: 0,
                    taxExempt: false,
                    notes: ''
                })
            };
            
            setFormData(parsedClient);
        }
        
        lastProcessedClientRef.current = client;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client?.id]); // Only watch client.id, not entire client object - matches Manufacturing pattern
    
    // Track previous client ID to detect when a new client gets an ID after save
    const previousClientIdRef = useRef(client?.id || null);
    
    // Reset typing flag when switching to different client
    // BUT: Don't reset if we're saving a new client (null -> ID) and user is typing
    // CRITICAL: NEVER reset if user has edited fields - preserve them permanently
    useEffect(() => {
        const currentClientId = client?.id || null;
        const previousClientId = previousClientIdRef.current;
        const currentFormDataId = formDataRef.current?.id || null;
        
        // CRITICAL: NEVER reset if user has edited any fields
        if (userEditedFieldsRef.current.size > 0) {
            previousClientIdRef.current = currentClientId;
            return; // Don't reset anything if user has edited fields
        }
        
        // If switching to a completely different client (different ID), reset typing flag
        if (currentClientId && currentClientId !== currentFormDataId && currentClientId !== previousClientId) {
            // Only reset if it's truly a different client (not the same client getting an ID)
            const isSameClientGettingId = !previousClientId && currentClientId && userHasStartedTypingRef.current;
            if (!isSameClientGettingId) {
                userHasStartedTypingRef.current = false;
            } else {
            }
        }
        
        previousClientIdRef.current = currentClientId;
    }, [client?.id]);
    
    // Handle tab change and notify parent
    const handleTabChange = (tab) => {
        // Prevent non-admins from accessing contracts tab
        if (tab === 'contracts' && !isAdmin) {
            return;
        }
        // Redirect old 'service' or 'maintenance' tabs to combined 'service-maintenance' tab
        if (tab === 'service' || tab === 'maintenance') {
            tab = 'service-maintenance';
        }
        setActiveTab(tab);
        if (onTabChange) {
            onTabChange(tab);
        }
        // Persist tab selection to localStorage (per client)
        if (client?.id) {
            try {
                const tabKey = `client-tab-${client.id}`;
                localStorage.setItem(tabKey, tab);
            } catch (e) {
                console.warn('⚠️ Failed to save tab to localStorage:', e);
            }
        }
    };
    
    // Load persisted tab on mount or when client changes (after initialTab has been set)
    useEffect(() => {
        if (client?.id) {
            try {
                const tabKey = `client-tab-${client.id}`;
                const savedTab = localStorage.getItem(tabKey);
                // Restore saved tab if:
                // 1. A saved tab exists
                // 2. initialTab is the default ('overview'), meaning no explicit tab was passed
                if (savedTab && initialTab === 'overview') {
                    // Use setTimeout to ensure this runs after initialTab useEffect
                    const timer = setTimeout(() => {
                        setActiveTab(savedTab);
                        if (onTabChange) {
                            onTabChange(savedTab);
                        }
                    }, 0);
                    return () => clearTimeout(timer);
                }
            } catch (e) {
                console.warn('⚠️ Failed to load tab from localStorage:', e);
            }
        }
    }, [client?.id, initialTab]); // Run when client ID or initialTab changes
    
    // Auto-scroll to last comment when notes tab is opened
    useEffect(() => {
        // Defensive check: ensure formData is initialized before accessing it
        if (!formData) return;
        
        if (activeTab === 'notes' && commentsContainerRef.current && formData && formData.comments && formData.comments.length > 0) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                // Scroll the parent scrollable container to show the last comment
                if (contentScrollableRef.current) {
                    // Find the last comment element
                    const lastComment = commentsContainerRef.current?.lastElementChild;
                    if (lastComment) {
                        lastComment.scrollIntoView({ behavior: 'smooth', block: 'end' });
                    } else if (contentScrollableRef.current) {
                        // Fallback: scroll container to bottom
                        contentScrollableRef.current.scrollTop = contentScrollableRef.current.scrollHeight;
                    }
                }
            }, 150);
        }
    }, [activeTab, formData]); // Use formData directly - it's already initialized at this point
    
    // Get theme with safe fallback - don't check system preference, only localStorage
    let isDark = false;
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            const themeResult = window.useTheme();
            isDark = themeResult?.isDark || false;
        } else {
            // Fallback: only check localStorage, NOT system preference
            const storedTheme = localStorage.getItem('abcotronics_theme');
            isDark = storedTheme === 'dark';
        }
    } catch (error) {
        // Fallback: only check localStorage, NOT system preference
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            isDark = storedTheme === 'dark';
        } catch (e) {
            isDark = false;
        }
    }
    
    // GPS coordinate parsing function
    const parseGPSCoordinates = (gpsString) => {
        if (!gpsString || !gpsString.trim()) return { latitude: '', longitude: '' };
        
        // Handle various GPS coordinate formats
        const formats = [
            // Format: "lat, lng" or "lat,lng"
            /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/,
            // Format: "lat lng" (space separated)
            /^(-?\d+\.?\d*)\s+(-?\d+\.?\d*)$/,
            // Format: "lat° lng°" (with degree symbols)
            /^(-?\d+\.?\d*)°\s*(-?\d+\.?\d*)°$/
        ];
        
        for (const format of formats) {
            const match = gpsString.trim().match(format);
            if (match) {
                const lat = parseFloat(match[1]);
                const lng = parseFloat(match[2]);
                
                // Validate coordinate ranges
                if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                    return { latitude: lat.toString(), longitude: lng.toString() };
                }
            }
        }
        
        return { latitude: '', longitude: '' };
    };
    
    // Function to get current location
    const getCurrentLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude.toFixed(6);
                    const lng = position.coords.longitude.toFixed(6);
                    setNewSite(prev => ({
                        ...prev,
                        latitude: lat,
                        longitude: lng,
                        gpsCoordinates: `${lat}, ${lng}`
                    }));
                },
                (error) => {
                    console.error('Error getting location:', error);
                    alert('Unable to get current location. Please enter coordinates manually.');
                }
            );
        } else {
            alert('Geolocation is not supported by this browser.');
        }
    };

    const handleSiteMapLocationSelect = (coords) => {
        if (!coords || typeof coords.latitude !== 'number' || typeof coords.longitude !== 'number') {
            return;
        }

        const lat = coords.latitude.toFixed(6);
        const lng = coords.longitude.toFixed(6);

        setNewSite(prev => ({
            ...prev,
            latitude: lat,
            longitude: lng,
            gpsCoordinates: `${lat}, ${lng}`
        }));
    };
    // Job cards state
    const [jobCards, setJobCards] = useState([]);
    const [loadingJobCards, setLoadingJobCards] = useState(false);
    // Load job cards for this client - MUST be defined before useEffect hooks that use it
    const loadJobCards = useCallback(async () => {
        if (!client?.id) {
            setJobCards([]);
            return;
        }
        
        setLoadingJobCards(true);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                setLoadingJobCards(false);
                return;
            }
            
            const clientId = String(client.id);
            
            
            // First, try fetching by clientId (most reliable)
            let response = await fetch(`/api/jobcards?clientId=${encodeURIComponent(clientId)}&pageSize=1000`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            let data = null;
            
            if (response.ok) {
                data = await response.json();
                // Handle both response structures: { jobCards: [...] } and { data: { jobCards: [...] } }
                const jobCards = data.jobCards || data.data?.jobCards || [];
                console.log(`📋 Job cards found by clientId: ${jobCards.length}`);
                
                if (jobCards.length > 0) {
                    setJobCards(jobCards);
                    setLoadingJobCards(false);
                    return;
                }
            } else {
                console.warn('⚠️ API filter by clientId failed, trying clientName fallback...');
            }
            
            // Fallback 1: Try filtering by clientName (in case job cards only have clientName set)
            if (client?.name) {
                console.log('📡 Trying to fetch job cards by clientName:', client.name);
                response = await fetch(`/api/jobcards?clientName=${encodeURIComponent(client.name)}&pageSize=1000`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    data = await response.json();
                    // Handle both response structures
                    const jobCards = data.jobCards || data.data?.jobCards || [];
                    console.log(`📋 Job cards found by clientName: ${jobCards.length}`);
                    
                    if (jobCards.length > 0) {
                        setJobCards(jobCards);
                        setLoadingJobCards(false);
                        return;
                    }
                }
            }
            
            // Fallback 2: Fetch all job cards and filter by clientId/clientName client-side
            // This handles cases where API filtering might not work correctly
            console.log('📡 Fetching all job cards for client-side filtering...');
            response = await fetch(`/api/jobcards?pageSize=1000`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                data = await response.json();
                // Handle both response structures
                const allJobCards = data.jobCards || data.data?.jobCards || [];
                
                // Filter by clientId first, then by clientName if no clientId match
                let matchingJobCards = allJobCards.filter(jc => 
                    jc.clientId && String(jc.clientId) === clientId
                );
                
                // If no matches by clientId, try matching by clientName
                if (matchingJobCards.length === 0 && client?.name) {
                    const normalizedClientName = (client.name || '').trim().toLowerCase();
                    matchingJobCards = allJobCards.filter(jc => {
                        const jobCardClientName = (jc.clientName || '').trim().toLowerCase();
                        // Match if clientName contains the client name or vice versa
                        return jobCardClientName === normalizedClientName || 
                               jobCardClientName.includes(normalizedClientName) ||
                               normalizedClientName.includes(jobCardClientName);
                    });
                }
                
                
                if (matchingJobCards.length > 0) {
                    setJobCards(matchingJobCards);
                } else {
                    // Log for debugging if job cards exist but don't match
                    if (allJobCards.length > 0) {
                    }
                    setJobCards([]);
                }
            } else {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error('❌ Failed to load job cards:', response.status, errorText);
                setError(`Failed to load job cards (${response.status}). Please try again.`);
                setJobCards([]);
            }
        } catch (error) {
            console.error('Error loading job cards:', error);
            setError('Failed to load job cards. Please try again.');
            setJobCards([]);
        } finally {
            setLoadingJobCards(false);
        }
    }, [client?.id, client?.name]);
    
    // Load job cards when client changes
    useEffect(() => {
        if (client?.id) {
            loadJobCards();
        } else {
            setJobCards([]);
}
    }, [client?.id, loadJobCards]);

    // Reload job cards when Service & Maintenance tab becomes active
    useEffect(() => {
        if (activeTab === 'service-maintenance' && client?.id) {
            loadJobCards();
        }
    }, [activeTab, client?.id, loadJobCards]);
    
    const [editingContact, setEditingContact] = useState(null);
    const [showContactForm, setShowContactForm] = useState(false);
    const [newContact, setNewContact] = useState({
        name: '',
        role: '',
        department: '',
        email: '',
        phone: '',
        town: '',
        isPrimary: false,
        siteId: null
    });
    
    const [newFollowUp, setNewFollowUp] = useState({
        date: '',
        time: '',
        type: 'Call',
        description: '',
        completed: false
    });
    
    const [newComment, setNewComment] = useState('');
    const [showSiteForm, setShowSiteForm] = useState(false);
    const [editingSite, setEditingSite] = useState(null);
    const [newSite, setNewSite] = useState({
        name: '',
        address: '',
        contactPerson: '',
        phone: '',
        email: '',
        notes: '',
        latitude: '',
        longitude: '',
        gpsCoordinates: ''
    });
    const [showOpportunityForm, setShowOpportunityForm] = useState(false);
    const [editingOpportunity, setEditingOpportunity] = useState(null);
    const [newOpportunity, setNewOpportunity] = useState({
        name: '',
        stage: 'Awareness',
        expectedCloseDate: '',
        relatedSiteId: null,
        notes: ''
    });

    useEffect(() => {
        if (client) {
            const clientIdChanged = client.id !== lastSavedClientId.current;
            
            // Update lastSavedClientId if client changed
            if (clientIdChanged) {
                lastSavedClientId.current = client.id;
                // Reset edit flag when switching clients
                hasUserEditedForm.current = false;
                // Clear optimistic updates when switching clients
                setOptimisticContacts([]);
                setOptimisticSites([]);
            }
            
            // Only load from database if client ID changed (new client) or form hasn't been edited
            const shouldLoadFromDatabase = clientIdChanged || !hasUserEditedForm.current;
            
            // Parse all JSON strings from API response
            const parsedClient = {
                ...client,
                opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
                sites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []),
                contacts: typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []),
                followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
                comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
                contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
                activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
                projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
                services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || [])
            };
            
            
            // Only set formData if we should load (new client or not edited)
            if (shouldLoadFromDatabase) {
                setFormData(parsedClient);
            }
            
            // Load data from database ONLY if client changed or form hasn't been edited
            // This prevents overwriting optimistic updates
            if (shouldLoadFromDatabase) {
                
                // Cancel any existing pending timeouts for this client
                pendingTimeoutsRef.current.forEach(timeoutId => {
                    clearTimeout(timeoutId);
                });
                pendingTimeoutsRef.current = [];
                
                // Stagger API calls to prevent rate limiting (429 errors)
                // Each call waits for the previous one with a delay
                const timeout1 = setTimeout(() => {
                    loadOpportunitiesFromDatabase(client.id);
                }, 0);
                pendingTimeoutsRef.current.push(timeout1);
                
                const timeout2 = setTimeout(() => {
                    loadContactsFromDatabase(client.id);
                }, 500); // Increased delay to 500ms
                pendingTimeoutsRef.current.push(timeout2);
                
                const timeout3 = setTimeout(() => {
                    loadSitesFromDatabase(client.id);
                }, 1000); // Increased delay to 1000ms
                pendingTimeoutsRef.current.push(timeout3);
                
                // Reload the full client data from database to get comments, followUps, activityLog
                const timeout4 = setTimeout(() => {
                    loadClientFromDatabase(client.id);
                }, 1500); // Increased delay to 1500ms
                pendingTimeoutsRef.current.push(timeout4);
            } else {
            }
        }
    }, [client?.id]); // Only depend on client.id, not entire client object to prevent infinite loops
    
    // Load full client data from database to get latest comments, followUps, activityLog
    const loadClientFromDatabase = async (clientId) => {
        try {
            // Prevent duplicate requests
            if (isLoadingClientRef.current) {
                return;
            }
            
            // Skip if form has been edited to preserve optimistic updates
            if (hasUserEditedForm.current) {
                return;
            }
            
            // Don't reload if auto-saving is in progress
            if (isAutoSavingRef.current) {
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            isLoadingClientRef.current = true;
            const response = await window.api.getClient(clientId);
            const dbClient = response?.data?.client;
            
            if (dbClient) {
                
                // Parse JSON strings
                const parsedClient = {
                    ...dbClient,
                    contacts: typeof dbClient.contacts === 'string' ? JSON.parse(dbClient.contacts || '[]') : (dbClient.contacts || []),
                    followUps: typeof dbClient.followUps === 'string' ? JSON.parse(dbClient.followUps || '[]') : (dbClient.followUps || []),
                    projectIds: typeof dbClient.projectIds === 'string' ? JSON.parse(dbClient.projectIds || '[]') : (dbClient.projectIds || []),
                    comments: typeof dbClient.comments === 'string' ? JSON.parse(dbClient.comments || '[]') : (dbClient.comments || []),
                    sites: typeof dbClient.sites === 'string' ? JSON.parse(dbClient.sites || '[]') : (dbClient.sites || []),
                    contracts: typeof dbClient.contracts === 'string' ? JSON.parse(dbClient.contracts || '[]') : (dbClient.contracts || []),
                    activityLog: typeof dbClient.activityLog === 'string' ? JSON.parse(dbClient.activityLog || '[]') : (dbClient.activityLog || []),
                    billingTerms: typeof dbClient.billingTerms === 'string' ? JSON.parse(dbClient.billingTerms || '{}') : (dbClient.billingTerms || {})
                };
                
                
                // Update formData with the fresh data from database
                // IMPORTANT: Only update comments, followUps, activityLog, contracts
                // DO NOT update contacts or sites - those are managed separately
                setFormData(prevFormData => {
                    const updated = {
                        ...prevFormData,
                        comments: parsedClient.comments,
                        followUps: parsedClient.followUps,
                        activityLog: parsedClient.activityLog,
                        contracts: parsedClient.contracts
                        // Explicitly preserve contacts and sites from current state
                    };
                    return updated;
                });
                
            }
        } catch (error) {
            console.error('❌ Error loading client from database:', error);
        } finally {
            isLoadingClientRef.current = false;
        }
    };

    // Load contacts from database
    const loadContactsFromDatabase = async (clientId) => {
        try {
            // Prevent duplicate requests
            if (isLoadingContactsRef.current) {
                return;
            }
            
            // Skip loading if form has been edited to preserve optimistic updates
            if (hasUserEditedForm.current) {
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            isLoadingContactsRef.current = true;
            const response = await window.api.getContacts(clientId);
            const contacts = response?.data?.contacts || [];
            
            
            // Merge database contacts with any optimistic contacts still pending
            setFormData(prevFormData => {
                const mergedContacts = mergeUniqueById(contacts, optimisticContacts);
                const updated = {
                    ...prevFormData,
                    contacts: mergedContacts
                };
                formDataRef.current = updated;
                return updated;
            });

            // Remove optimistic contacts that now exist in database
            setOptimisticContacts(prev => prev.filter(opt => !contacts.some(db => db.id === opt.id)));
        } catch (error) {
            console.error('❌ Error loading contacts from database:', error);
        } finally {
            isLoadingContactsRef.current = false;
        }
    };

    // Load sites from database
    const loadSitesFromDatabase = async (clientId) => {
        try {
            // Prevent duplicate requests
            if (isLoadingSitesRef.current) {
                return;
            }
            
            // Skip loading if form has been edited to preserve optimistic updates
            if (hasUserEditedForm.current) {
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            isLoadingSitesRef.current = true;
            const response = await window.api.getSites(clientId);
            const sites = response?.data?.sites || [];
            
            
            // Merge database sites with any optimistic sites still pending
            setFormData(prevFormData => {
                const mergedSites = mergeUniqueById(sites, optimisticSites);
                const updated = {
                    ...prevFormData,
                    sites: mergedSites
                };
                formDataRef.current = updated;
                return updated;
            });

            // Remove optimistic sites that now exist in database
            setOptimisticSites(prev => prev.filter(opt => !sites.some(db => db.id === opt.id)));
        } catch (error) {
            console.error('❌ Error loading sites from database:', error);
        } finally {
            isLoadingSitesRef.current = false;
        }
    };

    // Load opportunities from database
    const loadOpportunitiesFromDatabase = async (clientId) => {
        try {
            // Prevent duplicate requests
            if (isLoadingOpportunitiesRef.current) {
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            isLoadingOpportunitiesRef.current = true;
            const response = await window.api.getOpportunitiesByClient(clientId);
            const opportunities = response?.data?.opportunities || [];
            
            
            // Update formData with opportunities from database
            setFormData(prevFormData => ({
                ...prevFormData,
                opportunities: opportunities
            }));
        } catch (error) {
            console.error('❌ Error loading opportunities from database:', error);
            // Don't show error to user, just log it
        } finally {
            isLoadingOpportunitiesRef.current = false;
        }
    };


    const handleAddContact = async () => {
        if (!newContact.name) {
            alert('Name is required');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to save contacts to the database');
                return;
            }
            
            if (!window.api?.createContact) {
                alert('❌ Contact API not available. Please refresh the page.');
                return;
            }
            
            const response = await window.api.createContact(formData.id, newContact);
            
            const savedContact = response?.data?.contact || response?.contact || response;
            
            if (savedContact && savedContact.id) {
                // Mark form as edited to prevent useEffect from resetting formData
                hasUserEditedForm.current = true;
                
                // Store clientId to avoid stale closure
                const clientId = formData.id;
                
                // Add to optimistic contacts state - this triggers re-render and persists even if formData gets reset
                setOptimisticContacts(prev => {
                    const contactExists = prev.some(c => c.id === savedContact.id);
                    if (contactExists) {
                        return prev;
                    }
                    const updated = [...prev, savedContact];
                    return updated;
                });
                
                // Optimistically update UI immediately - use functional update to get latest state
                let updatedFormDataAfterContact = null;
                setFormData(prev => {
                    const currentContacts = prev.contacts || [];
                    // Check if contact already exists to avoid duplicates
                    const contactExists = currentContacts.some(c => c.id === savedContact.id);
                    if (contactExists) {
                        return prev;
                    }
                    const updatedContacts = [...currentContacts, savedContact];
                    const newFormData = {
                        ...prev,
                        contacts: updatedContacts
                    };
                    updatedFormDataAfterContact = newFormData;
                    formDataRef.current = newFormData;
                    // Force React to see this as a new object reference
                    return newFormData;
                });
                
                // State update above will automatically trigger re-render
                
                const formDataForActivity = updatedFormDataAfterContact || formDataRef.current || formData;
                const mergedContactsForActivity = mergeUniqueById(formDataForActivity?.contacts, [savedContact, ...optimisticContacts]);
                const finalFormDataForActivity = {
                    ...formDataForActivity,
                    contacts: mergedContactsForActivity
                };
                formDataRef.current = finalFormDataForActivity;
                logActivity('Contact Added', `Added contact: ${newContact.name} (${newContact.email})`, null, true, finalFormDataForActivity);
                
                // Switch to contacts tab immediately
                handleTabChange('contacts');
                
                // Close form and reset
                setNewContact({
                    name: '',
                    role: '',
                    department: '',
                    email: '',
                    phone: '',
                    town: '',
                    isPrimary: false,
                    siteId: null
                });
                setShowContactForm(false);
                
                // Delay alert to ensure state update and render complete first
                setTimeout(() => {
                    alert('✅ Contact saved to database successfully!');
                }, 100);
                
            } else {
                throw new Error('No contact ID returned from API');
            }
        } catch (error) {
            console.error('❌ Error creating contact:', error);
            alert('❌ Error saving contact to database: ' + error.message);
        }
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setNewContact(contact);
        setShowContactForm(true);
    };

    const handleUpdateContact = () => {
        const updatedContacts = formData.contacts.map(c => 
            c.id === editingContact.id ? {...newContact, id: c.id} : c
        );
        const updatedFormData = {...formData, contacts: updatedContacts};
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData;
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Contact Updated', `Updated contact: ${newContact.name}`, null, false, updatedFormData);
        
        // Save contact changes and activity log immediately - stay in edit mode
        onSave(finalFormData, true);
        
        setEditingContact(null);
        setNewContact({
            name: '',
            role: '',
            department: '',
            email: '',
            phone: '',
            town: '',
            isPrimary: false,
            siteId: null
        });
        setShowContactForm(false);
        // Stay in contacts tab (use setTimeout to ensure it happens after re-render)
        setTimeout(() => {
            handleTabChange('contacts');
        }, 100);
        
    };

    const handleDeleteContact = (contactId) => {
        if (confirm('Remove this contact?')) {
            const contact = formData.contacts.find(c => c.id === contactId);
            const updatedFormData = {
                ...formData,
                contacts: formData.contacts.filter(c => c.id !== contactId)
            };
            setFormData(updatedFormData);
            formDataRef.current = updatedFormData;
            
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Contact Deleted', `Deleted contact: ${contact?.name || 'Unknown'}`, null, false, updatedFormData);
            
            // Save contact deletion and activity log immediately - stay in edit mode
            onSave(finalFormData, true);
            // Stay in contacts tab (use setTimeout to ensure it happens after re-render)
            setTimeout(() => {
                handleTabChange('contacts');
            }, 100);
            
        }
    };

    const handleAddFollowUp = () => {
        if (!newFollowUp.date || !newFollowUp.description) {
            alert('Date and description are required');
            return;
        }
        
        const newFollowUpItem = {
            ...newFollowUp,
            id: Date.now(),
            createdAt: new Date().toISOString()
        };
        
        const currentFollowUps = Array.isArray(formData.followUps) ? formData.followUps : [];
        const updatedFollowUps = [...currentFollowUps, newFollowUpItem];
        
        // Get current user info
        const updatedFormData = {
            ...formData,
            followUps: updatedFollowUps
        };
        setFormData(updatedFormData);
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Follow-up Added', `Scheduled ${newFollowUp.type} for ${newFollowUp.date}`, null, false, updatedFormData);
        
        // Save follow-up changes and activity log immediately - stay in edit mode
        isAutoSavingRef.current = true;
        onSave(finalFormData, true).finally(() => {
            isAutoSavingRef.current = false;
        });
        
        setNewFollowUp({
            date: '',
            time: '',
            type: 'Call',
            description: '',
            completed: false
        });
    };

    const handleToggleFollowUp = (followUpId) => {
        const followUp = formData.followUps.find(f => f.id === followUpId);
        const updatedFollowUps = formData.followUps.map(f => 
            f.id === followUpId ? {...f, completed: !f.completed} : f
        );
        
        const updatedFormData = {...formData, followUps: updatedFollowUps};
        setFormData(updatedFormData);
        
        // Log activity when follow-up is completed
        if (followUp && !followUp.completed) {
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Follow-up Completed', `Completed: ${followUp.description}`, null, false, updatedFormData);
            
            // Save follow-up toggle and activity log immediately - stay in edit mode
            isAutoSavingRef.current = true;
            onSave(finalFormData, true).finally(() => {
                isAutoSavingRef.current = false;
            });
        } else {
            // Just save the follow-up toggle (no activity log needed for uncompleting)
            isAutoSavingRef.current = true;
            onSave(updatedFormData, true).finally(() => {
                isAutoSavingRef.current = false;
            });
        }
    };

    const handleDeleteFollowUp = (followUpId) => {
        if (confirm('Delete this follow-up?')) {
            const followUp = formData.followUps.find(f => f.id === followUpId);
            const updatedFormData = {
                ...formData,
                followUps: formData.followUps.filter(f => f.id !== followUpId)
            };
            setFormData(updatedFormData);
            
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Follow-up Deleted', `Deleted follow-up: ${followUp?.description || followUp?.type || 'Unknown'}`, null, false, updatedFormData);
            
            // Save follow-up deletion and activity log immediately - stay in edit mode
            isAutoSavingRef.current = true;
            onSave(finalFormData, true).finally(() => {
                isAutoSavingRef.current = false;
            });
        }
    };


    // Notes helpers: tags, attachments, simple markdown toggle
    const [newNoteTagsInput, setNewNoteTagsInput] = useState('');
    const [newNoteTags, setNewNoteTags] = useState([]);
    const [newNoteAttachments, setNewNoteAttachments] = useState([]);
    const [notesTagFilter, setNotesTagFilter] = useState(null);

    const handleAddTagFromInput = () => {
        const raw = (newNoteTagsInput || '').trim();
        if (!raw) return;
        const parts = raw.split(',').map(t => t.trim()).filter(Boolean);
        const next = Array.from(new Set([...(newNoteTags || []), ...parts]));
        setNewNoteTags(next);
        setNewNoteTagsInput('');
    };

    const handleRemoveNewTag = (tag) => {
        setNewNoteTags((newNoteTags || []).filter(t => t !== tag));
    };

    const handleAttachmentFiles = async (files) => {
        if (!files || files.length === 0) return;
        const fileArray = Array.from(files);
        const reads = await Promise.all(fileArray.map(file => new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({
                id: `${Date.now()}-${file.name}`,
                name: file.name,
                size: file.size,
                type: file.type,
                dataUrl: reader.result
            });
            reader.readAsDataURL(file);
        })));
        setNewNoteAttachments([...(newNoteAttachments || []), ...reads]);
    };

    const handleRemoveNewAttachment = (id) => {
        setNewNoteAttachments((newNoteAttachments || []).filter(a => a.id !== id));
    };

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        
        // Get current user info
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
        // Process @mentions if MentionHelper is available
        if (window.MentionHelper && window.MentionHelper.hasMentions(newComment)) {
            try {
                // Fetch all users for mention matching
                const token = window.storage?.getToken?.();
                if (token && window.DatabaseAPI?.getUsers) {
                    const usersResponse = await window.DatabaseAPI.getUsers();
                    const allUsers = usersResponse?.data?.users || usersResponse?.data?.data?.users || [];
                    
                    const contextTitle = `Client: ${formData.name || 'Unknown Client'}`;
                    const contextLink = `#/clients/${formData.id}`;
                    
                    // Process mentions
                    await window.MentionHelper.processMentions(
                        newComment,
                        contextTitle,
                        contextLink,
                        currentUser.name || currentUser.email || 'Unknown',
                        allUsers
                    );
                }
            } catch (error) {
                console.error('❌ Error processing @mentions:', error);
                // Don't fail the comment if mention processing fails
            }
        }
        
        const updatedComments = [...(formData.comments || []), {
            id: Date.now(),
            text: newComment,
            tags: Array.isArray(newNoteTags) ? newNoteTags : [],
            attachments: Array.isArray(newNoteAttachments) ? newNoteAttachments : [],
            createdAt: new Date().toISOString(),
            createdBy: currentUser.name,
            createdByEmail: currentUser.email,
            createdById: currentUser.id
        }];
        
        const updatedFormData = {...formData, comments: updatedComments};
        setFormData(updatedFormData);
        
        // Log to audit trail
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'comment',
                'clients',
                {
                    action: 'Comment Added',
                    clientId: formData.id,
                    clientName: formData.name,
                    commentPreview: newComment.substring(0, 50) + (newComment.length > 50 ? '...' : '')
                },
                currentUser
            );
        }
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Comment Added', `Added note: ${newComment.substring(0, 50)}${newComment.length > 50 ? '...' : ''}`, null, false, updatedFormData);
        
        // Save comment changes and activity log immediately - stay in edit mode
        isAutoSavingRef.current = true;
        onSave(finalFormData, true);
        
        // Clear the flag after a delay to allow API response to propagate
        setTimeout(() => {
            isAutoSavingRef.current = false;
        }, 3000);
        
        setNewComment('');
        setNewNoteTags([]);
        setNewNoteTagsInput('');
        setNewNoteAttachments([]);
        
    };

    const handleDeleteComment = (commentId) => {
        if (confirm('Delete this comment?')) {
            const updatedFormData = {
                ...formData,
                comments: formData.comments.filter(c => c.id !== commentId)
            };
            setFormData(updatedFormData);
            
            // Save comment deletion immediately - stay in edit mode
            isAutoSavingRef.current = true;
            onSave(updatedFormData, true);
            
            // Clear the flag after a delay to allow API response to propagate
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, 3000);
            
        }
    };

    const handleAddSite = async () => {
        if (!newSite.name) {
            alert('Site name is required');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to save sites to the database');
                return;
            }
            
            if (!window.api?.createSite) {
                alert('❌ Site API not available. Please refresh the page.');
                return;
            }
            
            const response = await window.api.createSite(formData.id, newSite);
            const savedSite = response?.data?.site || response?.site || response;
            
            if (savedSite && savedSite.id) {
                // Mark form as edited to prevent useEffect from resetting formData
                hasUserEditedForm.current = true;
                
                // Store clientId to avoid stale closure
                const clientId = formData.id;
                
                // Add to optimistic sites state - this triggers re-render and persists even if formData gets reset
                setOptimisticSites(prev => {
                    const siteExists = prev.some(s => s.id === savedSite.id);
                    if (siteExists) {
                        return prev;
                    }
                    const updated = [...prev, savedSite];
                    return updated;
                });
                
                // Optimistically update UI immediately - use functional update to get latest state
                let updatedFormDataAfterSite = null;
                setFormData(prev => {
                    const currentSites = prev.sites || [];
                    // Check if site already exists to avoid duplicates
                    const siteExists = currentSites.some(s => s.id === savedSite.id);
                    if (siteExists) {
                        return prev;
                    }
                    const updatedSites = [...currentSites, savedSite];
                    const newFormData = {
                        ...prev,
                        sites: updatedSites
                    };
                    updatedFormDataAfterSite = newFormData;
                    formDataRef.current = newFormData;
                    // Force React to see this as a new object reference
                    return newFormData;
                });
                
                // State update above will automatically trigger re-render
                
                const formDataForSiteActivity = updatedFormDataAfterSite || formDataRef.current || formData;
                const mergedSitesForActivity = mergeUniqueById(formDataForSiteActivity?.sites, [savedSite, ...optimisticSites]);
                const finalFormDataForSiteActivity = {
                    ...formDataForSiteActivity,
                    sites: mergedSitesForActivity
                };
                formDataRef.current = finalFormDataForSiteActivity;
                logActivity('Site Added', `Added site: ${newSite.name}`, null, true, finalFormDataForSiteActivity);
                
                // Switch to sites tab immediately
                handleTabChange('sites');
                
                // Close form and reset
                setNewSite({
                    name: '',
                    address: '',
                    contactPerson: '',
                    phone: '',
                    email: '',
                    notes: '',
                    latitude: '',
                    longitude: '',
                    gpsCoordinates: ''
                });
                setShowSiteForm(false);
                
                // Delay alert to ensure state update and render complete first
                setTimeout(() => {
                    alert('✅ Site saved to database successfully!');
                }, 100);
                
            } else {
                throw new Error('No site ID returned from API');
            }
        } catch (error) {
            console.error('❌ Error creating site:', error);
            alert('❌ Error saving site to database: ' + error.message);
        }
    };

    const handleEditSite = (site) => {
        setEditingSite(site);
        setNewSite(site);
        setShowSiteForm(true);
    };

    const handleUpdateSite = () => {
        const updatedSites = formData.sites.map(s => 
            s.id === editingSite.id ? {...newSite, id: s.id} : s
        );
        const updatedFormData = {...formData, sites: updatedSites};
        setFormData(updatedFormData);
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Site Updated', `Updated site: ${newSite.name}`, null, false, updatedFormData);
        
        // Save site changes and activity log immediately - stay in edit mode
        onSave(finalFormData, true);
        
        setEditingSite(null);
            setNewSite({
                name: '',
                address: '',
                contactPerson: '',
                phone: '',
                email: '',
                notes: '',
                latitude: '',
                longitude: '',
                gpsCoordinates: ''
            });
        setShowSiteForm(false);
        // Stay in sites tab (use setTimeout to ensure it happens after re-render)
        setTimeout(() => {
            handleTabChange('sites');
        }, 100);
        
    };

    const handleDeleteSite = (siteId) => {
        const site = formData.sites.find(s => s.id === siteId);
        if (confirm('Delete this site?')) {
            const updatedFormData = {
                ...formData,
                sites: formData.sites.filter(s => s.id !== siteId)
            };
            setFormData(updatedFormData);
            
            // Log activity and get updated formData with activity log, then save everything
            const finalFormData = logActivity('Site Deleted', `Deleted site: ${site?.name}`, null, false, updatedFormData);
            
            // Save site deletion and activity log immediately - stay in edit mode
            onSave(finalFormData, true);
            handleTabChange('sites'); // Stay in sites tab
            
        }
    };

    const handleAddOpportunity = async () => {
        if (!newOpportunity.name || !newOpportunity.name.trim()) {
            alert('Opportunity name is required');
            return;
        }
        
        try {
            const opportunityData = {
                title: newOpportunity.name,
                clientId: formData.id,
                stage: newOpportunity.stage || 'prospect',
                value: parseFloat(newOpportunity.value) || 0
            };
            
            
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to save opportunities to the database');
                return;
            }
            
            if (!window.api?.createOpportunity) {
                alert('❌ Opportunity API not available. Please refresh the page.');
                return;
            }
            
            
            const response = await window.api.createOpportunity(opportunityData);
            
            const savedOpportunity = response?.data?.opportunity || response?.opportunity || response;
            
            if (savedOpportunity && savedOpportunity.id) {
                // Get current user info
                const user = window.storage?.getUser?.() || {};
                const currentUser = {
                    name: user?.name || 'System',
                    email: user?.email || 'system',
                    id: user?.id || 'system'
                };
                
                // Use functional update to ensure we're working with latest state and update immediately
                setFormData(prev => {
                    // Add to local opportunities array for immediate UI update
                    const currentOpportunities = Array.isArray(prev.opportunities) ? prev.opportunities : [];
                    // Check if opportunity already exists to avoid duplicates
                    const opportunityExists = currentOpportunities.some(o => o.id === savedOpportunity.id);
                    if (opportunityExists) {
                        return prev;
                    }
                    
                    const updatedOpportunities = [...currentOpportunities, savedOpportunity];
                    
                    const newActivityLog = [...(prev.activityLog || []), {
                        id: Date.now() + 1,
                        type: 'Opportunity Added',
                        description: `Added opportunity: ${newOpportunity.name}`,
                        timestamp: new Date().toISOString(),
                        user: currentUser.name,
                        userId: currentUser.id,
                        userEmail: currentUser.email,
                        relatedId: savedOpportunity.id
                    }];
                    
                    return {
                        ...prev,
                        opportunities: updatedOpportunities,
                        activityLog: newActivityLog
                    };
                });
                
                // Reset form immediately
                setNewOpportunity({
                    name: '',
                    stage: 'Awareness',
                    expectedCloseDate: '',
                    relatedSiteId: null,
                    notes: ''
                });
                setShowOpportunityForm(false);
                
                // Switch to opportunities tab to show the added opportunity
                // Use setTimeout to ensure state update is processed first
                setTimeout(() => {
                    handleTabChange('opportunities');
                }, 0);
                
                // DON'T call onSave here - it will overwrite the client with stale data!
                // Instead, just update local state and let the user save when they're ready
                // The opportunity is already in the database, so it will load on next fetch
                
                
                // Reload opportunities from database in background to ensure we have the latest
                // This will merge with the optimistic update
                try {
                    const oppResponse = await window.api.getOpportunitiesByClient(formData.id);
                    const freshOpportunities = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                    
                    // Merge with existing opportunities, ensuring no duplicates
                    setFormData(prev => {
                        const existingIds = new Set((prev.opportunities || []).map(o => o.id));
                        const newOpportunities = freshOpportunities.filter(o => !existingIds.has(o.id));
                        const merged = [...(prev.opportunities || []), ...newOpportunities];
                        
                        return {
                            ...prev,
                            opportunities: merged
                        };
                    });
                    
                    
                    // Trigger a window event to notify Pipeline view that opportunities changed
                    window.dispatchEvent(new CustomEvent('opportunitiesUpdated', { 
                        detail: { clientId: formData.id, opportunities: freshOpportunities } 
                    }));
                } catch (error) {
                    console.error('❌ Failed to reload opportunities:', error);
                    // Don't show error to user - optimistic update already shows the opportunity
                }
            } else {
                throw new Error('No opportunity ID returned from API');
            }
        } catch (error) {
            console.error('❌ Error creating opportunity:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                response: error.response,
                data: error.data
            });
            alert('❌ Error saving opportunity to database: ' + (error.message || 'Unknown error'));
        }
    };

    const handleEditOpportunity = (opportunity) => {
        setEditingOpportunity(opportunity);
        setNewOpportunity(opportunity);
        setShowOpportunityForm(true);
    };

    const handleUpdateOpportunity = async () => {
        try {
            const opportunityData = {
                title: newOpportunity.name,
                stage: newOpportunity.stage || 'prospect',
                value: parseFloat(newOpportunity.value) || 0
            };
            
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to update opportunities in the database');
                return;
            }
            
            if (!window.api?.updateOpportunity) {
                alert('❌ Opportunity API not available. Please refresh the page.');
                return;
            }
            
            const response = await window.api.updateOpportunity(editingOpportunity.id, opportunityData);
            const updatedOpportunity = response?.data?.opportunity || response?.opportunity || response;
            
            if (updatedOpportunity && updatedOpportunity.id) {
                // Update local opportunities array
                const updatedOpportunities = formData.opportunities.map(o => 
                    o.id === editingOpportunity.id ? updatedOpportunity : o
                );
                const updatedFormData = {...formData, opportunities: updatedOpportunities};
                setFormData(updatedFormData);
                
                // Log activity and auto-save (activity log will be saved automatically)
                logActivity('Opportunity Updated', `Updated opportunity: ${newOpportunity.name}`, null, true, updatedFormData);
                
                alert('✅ Opportunity updated in database successfully!');
                
                setEditingOpportunity(null);
                setNewOpportunity({
                    name: '',
                    stage: 'Awareness',
                    expectedCloseDate: '',
                    relatedSiteId: null,
                    notes: ''
                });
                setShowOpportunityForm(false);
                
            } else {
                throw new Error('No opportunity data returned from API');
            }
        } catch (error) {
            console.error('❌ Error updating opportunity:', error);
            alert('❌ Error updating opportunity in database: ' + error.message);
        }
    };

    const handleDeleteOpportunity = async (opportunityId) => {
        const opportunity = formData.opportunities.find(o => o.id === opportunityId);
        if (confirm('Delete this opportunity?')) {
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    alert('❌ Please log in to delete opportunities from the database');
                    return;
                }
                
                if (!window.api?.deleteOpportunity) {
                    alert('❌ Opportunity API not available. Please refresh the page.');
                    return;
                }
                
                await window.api.deleteOpportunity(opportunityId);
                
                // Update local opportunities array
                const updatedFormData = {
                    ...formData,
                    opportunities: formData.opportunities.filter(o => o.id !== opportunityId)
                };
                setFormData(updatedFormData);
                
                // Log activity and auto-save (activity log will be saved automatically)
                logActivity('Opportunity Deleted', `Deleted opportunity: ${opportunity?.name}`, null, true, updatedFormData);
                
                alert('✅ Opportunity deleted from database successfully!');
                
            } catch (error) {
                console.error('❌ Error deleting opportunity:', error);
                alert('❌ Error deleting opportunity from database: ' + error.message);
            }
        }
    };

    const logActivity = (type, description, relatedId = null, autoSave = true, formDataToUpdate = null) => {
        // Get current user info
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
        const activity = {
            id: Date.now(),
            type,
            description,
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            userId: currentUser.id,
            userEmail: currentUser.email,
            relatedId
        };
        
        // Use provided formData or current formData
        const baseFormData = formDataToUpdate || formDataRef.current || formData;
        const updatedFormData = {
            ...baseFormData,
            activityLog: [...(baseFormData.activityLog || []), activity]
        };
        
        setFormData(updatedFormData);
        formDataRef.current = updatedFormData;
        
        // Auto-save activity log to database if enabled (default: true)
        if (autoSave && client && onSave) {
            isAutoSavingRef.current = true;
            // Don't await - let it run in background to avoid blocking UI
            onSave(updatedFormData, true).finally(() => {
                // Clear flag immediately after save completes (no artificial delay)
                isAutoSavingRef.current = false;
            });
        }
        
        // Return updated formData so callers can use it if needed
        return updatedFormData;
    };

    // Company Groups: Load groups data function (moved outside useEffect so it can be called from other functions)
    const loadGroupsData = useCallback(async () => {
        if (!client?.id) {
            return;
        }

        if (isLoadingGroupsRef.current) {
            return;
        }

            try {
                isLoadingGroupsRef.current = true;
                setLoadingGroups(true);

                const token = window.storage?.getToken?.();
                if (!token) {
                    setLoadingGroups(false);
                    return;
                }

                // Fetch client's groups
                const groupsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (groupsResponse.ok) {
                    const groupsData = await groupsResponse.json();
                    const data = groupsData?.data || groupsData;
                    setPrimaryParent(data.primaryParent || null);
                    setGroupMemberships(data.groupMemberships || []);
                }

                // Fetch all available groups (including named groups with type='group' and regular clients)
                const groupsListResponse = await fetch('/api/clients/groups', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (groupsListResponse.ok) {
                    const groupsListData = await groupsListResponse.json();
                    const groups = groupsListData?.data?.groups || groupsListData?.groups || [];
                    // Filter out current client and map to expected format
                    const availableGroups = groups
                        .filter(g => g.id !== client.id)
                        .map(g => ({ id: g.id, name: g.name, type: g.type || 'client', industry: g.industry || 'Other' }));
                    setAllGroups(availableGroups);
                } else {
                    // Fallback to clients endpoint if groups endpoint fails
                    const clientsResponse = await fetch('/api/clients?limit=1000', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (clientsResponse.ok) {
                        const clientsData = await clientsResponse.json();
                        const clients = clientsData?.data?.clients || clientsData?.clients || [];
                        const potentialGroups = clients
                            .filter(c => c.id !== client.id && (c.type === 'client' || c.type === 'group'))
                            .map(c => ({ id: c.id, name: c.name, type: c.type || 'client', industry: c.industry || 'Other' }));
                        setAllGroups(potentialGroups);
                    }
                }
            } catch (error) {
                console.error('Failed to load groups:', error);
            } finally {
                setLoadingGroups(false);
                isLoadingGroupsRef.current = false;
            }
    }, [client?.id]);

    // Company Groups: Load groups data when groups tab is active
    useEffect(() => {
        if (activeTab !== 'groups' || !client?.id) {
            return;
        }

        loadGroupsData();
    }, [activeTab, client?.id, loadGroupsData]);

    // Debug: Log when Create Group modal state changes
    useEffect(() => {
        console.log('Create Group Modal state changed:', showCreateGroupModal);
    }, [showCreateGroupModal]);

    // Company Groups: Handle primary parent change
    const handleParentGroupChange = async (groupId) => {
        if (!client?.id) return;

        const newParentId = groupId === '' ? null : groupId;

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to update groups');
                return;
            }

            const response = await fetch(`/api/clients/${client.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ parentGroupId: newParentId })
            });

            if (response.ok) {
                const data = await response.json();
                const updatedClient = data?.data?.client || data?.client;
                const newParent = updatedClient?.parentGroup || null;
                setPrimaryParent(newParent);

                if (onUpdate) {
                    onUpdate({ ...client, parentGroupId: newParentId, parentGroup: newParent });
                }

                // Reload groups to refresh state
                isLoadingGroupsRef.current = false;
                setTimeout(() => {
                    const event = new Event('groupsTabActive');
                    window.dispatchEvent(event);
                }, 100);
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData.message || 'Failed to update parent group. Please try again.');
            }
        } catch (error) {
            console.error('Failed to update parent group:', error);
            alert('Failed to update parent group. Please try again.');
        }
    };

    // Company Groups: Handle adding client to group
    const handleAddToGroup = async () => {
        // Adding to existing group only
            if (!client?.id || !selectedGroupId) {
                console.warn('Cannot add group: missing client ID or selected group ID');
                return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to add groups');
                return;
            }

            const requestBody = { groupId: selectedGroupId, role: 'member' };

            console.log('Adding client to group:', { 
                clientId: client.id, 
                ...requestBody 
            });
            
            const response = await fetch(`/api/clients/${client.id}/groups`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json().catch(() => ({}));
            console.log('Add group response:', { status: response.status, statusText: response.statusText, data: responseData });

            if (response.ok) {
                console.log('✅ Group added successfully:', responseData);
                
                // Close modal first
                setShowAddGroupModal(false);
                setSelectedGroupId('');
                
                // Wait a moment for database to commit, then reload all groups data
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Force reload by resetting loading flag
                isLoadingGroupsRef.current = false;
                
                // Reload groups data - fetch full groups data including primary parent
                try {
                    setLoadingGroups(true);
                    const groupsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    if (groupsResponse.ok) {
                        const groupsData = await groupsResponse.json();
                        const gData = groupsData?.data || groupsData;
                        console.log('Reloaded groups data:', gData);
                        setPrimaryParent(gData.primaryParent || null);
                        setGroupMemberships(gData.groupMemberships || []);
                    } else {
                        console.error('Failed to reload groups:', groupsResponse.status, groupsResponse.statusText);
                    }
                    
                    // Also reload available groups list to update the dropdown (include new groups)
                    const groupsListResponse = await fetch('/api/clients/groups', {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    if (groupsListResponse.ok) {
                        const groupsListData = await groupsListResponse.json();
                        const groups = groupsListData?.data?.groups || groupsListData?.groups || [];
                        const availableGroups = groups
                            .filter(g => g.id !== client.id)
                            .map(g => ({ id: g.id, name: g.name, type: g.type || 'client', industry: g.industry || 'Other' }));
                        setAllGroups(availableGroups);
                    } else {
                        // Fallback to clients endpoint
                        const clientsResponse = await fetch('/api/clients?limit=1000', {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                        
                        if (clientsResponse.ok) {
                            const clientsData = await clientsResponse.json();
                            const clients = clientsData?.data?.clients || clientsData?.clients || [];
                            const potentialGroups = clients
                                .filter(c => c.id !== client.id && (c.type === 'client' || c.type === 'group'))
                                .map(c => ({ id: c.id, name: c.name, type: c.type || 'client', industry: c.industry || 'Other' }));
                            setAllGroups(potentialGroups);
                        }
                    }
                } catch (reloadError) {
                    console.error('Error reloading groups:', reloadError);
                } finally {
                    setLoadingGroups(false);
                    isLoadingGroupsRef.current = false;
                }
                
                // Don't show alert if everything worked - the UI update is enough
            } else {
                const errorMessage = responseData.message || responseData.error || 'Failed to add client to group. Please try again.';
                console.error('Failed to add group:', { status: response.status, message: errorMessage, data: responseData });
                alert(`❌ ${errorMessage}`);
            }
        } catch (error) {
            console.error('Failed to add client to group:', error);
            alert('Failed to add client to group. Please try again.');
        }
    };

    // Company Groups: Handle removing client from group
    const handleRemoveFromGroup = async (groupId) => {
        if (!client?.id || !groupId) return;

        if (!confirm('Remove this client from the group?')) return;

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to remove groups');
                return;
            }

            const response = await fetch(`/api/clients/${client.id}/groups/${groupId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                // Reload groups data
                isLoadingGroupsRef.current = false;
                const groupsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (groupsResponse.ok) {
                    const groupsData = await groupsResponse.json();
                    const gData = groupsData?.data || groupsData;
                    setGroupMemberships(gData.groupMemberships || []);
                }
                alert('✅ Successfully removed from group');
            } else {
                alert('Failed to remove client from group. Please try again.');
            }
        } catch (error) {
            console.error('Failed to remove client from group:', error);
            alert('Failed to remove client from group. Please try again.');
        }
    };

    // Create a standalone group
    const handleCreateStandaloneGroup = async () => {
        if (!standaloneGroupName?.trim()) {
            alert('Please enter a group name');
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to create groups');
                return;
            }

            const requestBody = {
                name: standaloneGroupName.trim(),
                industry: standaloneGroupIndustry || 'Other'
            };
            
            console.log('Creating group with data:', requestBody);

            const response = await fetch('/api/clients/groups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(requestBody)
            });

            const responseData = await response.json().catch(() => ({}));
            const data = responseData?.data || responseData;

            console.log('Create group response:', { status: response.status, statusText: response.statusText, responseData, data });

            if (response.ok) {
                alert('✅ Group created successfully');
                setShowCreateGroupModal(false);
                setStandaloneGroupName('');
                setStandaloneGroupIndustry('Other');
                // Reload all groups
                await loadGroupsData();
            } else {
                // Handle error response structure: { error: { code, message, details } }
                const errorMessage = responseData?.error?.message || 
                                   responseData?.error || 
                                   data?.error?.message || 
                                   data?.error || 
                                   data?.message || 
                                   `Failed to create group (${response.status}). Please try again.`;
                console.error('Failed to create group:', { status: response.status, error: errorMessage, responseData });
                alert(errorMessage);
            }
        } catch (error) {
            console.error('Failed to create group:', error);
            alert('Failed to create group. Please try again.');
        }
    };

    // Delete a group
    const handleDeleteGroup = async () => {
        if (!groupToDelete) return;

        const memberCount = (groupToDelete._count?.childCompanies || 0) + (groupToDelete._count?.groupChildren || 0);
        if (memberCount > 0) {
            alert(`Cannot delete group "${groupToDelete.name}" because it has ${memberCount} member(s). Please remove all members first.`);
            setShowDeleteGroupModal(false);
            setGroupToDelete(null);
            return;
        }

        if (!confirm(`Are you sure you want to delete the group "${groupToDelete.name}"? This action cannot be undone.`)) {
            setShowDeleteGroupModal(false);
            setGroupToDelete(null);
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete groups');
                return;
            }

            const response = await fetch(`/api/clients/groups/${groupToDelete.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const responseData = await response.json();
            const data = responseData?.data || responseData;

            if (response.ok) {
                alert('✅ Group deleted successfully');
                setShowDeleteGroupModal(false);
                setGroupToDelete(null);
                // Reload all groups
                await loadGroupsData();
            } else {
                const errorMessage = data?.error?.message || data?.error || data?.message || 'Failed to delete group. Please try again.';
                const errorDetails = data?.error?.details;
                
                // If we have linked clients, display them in a formatted message
                if (errorDetails?.linkedClients) {
                    const { primaryParent = [], groupMembers = [] } = errorDetails.linkedClients;
                    const allLinked = [...primaryParent, ...groupMembers];
                    
                    if (allLinked.length > 0) {
                        const clientList = allLinked.map(client => 
                            `  • ${client.name} (${client.relationship})`
                        ).join('\n');
                        
                        const fullMessage = `${errorMessage}\n\nLinked Clients:\n${clientList}\n\nPlease remove or reassign these clients before deleting the group.`;
                        alert(fullMessage);
                    } else {
                        alert(errorMessage);
                    }
                } else {
                    alert(errorMessage);
                }
            }
        } catch (error) {
            console.error('Failed to delete group:', error);
            alert('Failed to delete group. Please try again.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        hasUserEditedForm.current = false; // Reset after save
        const clientData = {
            ...formData,
            lastContact: new Date().toISOString().split('T')[0]
        };
        
        // Use onUpdate if provided (for updates that should close the modal)
        // Otherwise use onSave (for auto-saves that stay in edit mode)
        if (onUpdate && client) {
            await onUpdate(clientData);
        } else {
            await onSave(clientData);
        }
    };

    // Get projects that belong to this client (match by clientId or clientName)
    const clientProjects = React.useMemo(() => {
        if (!allProjects || !Array.isArray(allProjects) || allProjects.length === 0) {
            return [];
        }
        if (!formData || !formData.id && !formData.name) {
            return [];
        }
        
        return allProjects.filter(p => {
            if (!p) return false;
            
            // Primary: match by clientId (foreign key relationship)
            if (formData.id && p.clientId && p.clientId === formData.id) {
                return true;
            }
            // Fallback: match by client name (for projects without clientId set)
            // Use case-insensitive comparison and trim whitespace
            const clientName = (formData.name || '').trim().toLowerCase();
            const projectClient = (p.client || '').trim().toLowerCase();
            const projectClientName = (p.clientName || '').trim().toLowerCase();
            
            if (clientName && (projectClient === clientName || projectClientName === clientName)) {
                return true;
            }
            return false;
        });
    }, [allProjects, formData?.id, formData?.name]);
    const upcomingFollowUps = (formData.followUps || [])
        .filter(f => !f.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    return (
            <div className={isFullPage ? `w-full h-full ${isDark ? 'bg-gray-900' : 'bg-gray-50'}` : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"}>
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} ${isFullPage ? 'w-full h-full rounded-none' : 'rounded-lg w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh]'} overflow-hidden flex flex-col`}>
                    {/* Header */}
                    <div className={`flex justify-between items-center px-3 sm:px-6 py-3 sm:py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                            {client && (
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        const currentStarred = client.isStarred || false;
                                        try {
                                            if (window.DatabaseAPI && typeof window.DatabaseAPI.toggleStarClient === 'function') {
                                                await window.DatabaseAPI.toggleStarClient(client.id);
                                                // Update local state
                                                if (onUpdate) {
                                                    onUpdate({ ...client, isStarred: !currentStarred });
                                                }
                                            }
                                        } catch (error) {
                                            console.error('❌ Failed to toggle star:', error);
                                        }
                                    }}
                                    className={`flex-shrink-0 transition-colors ${isDark ? 'hover:text-yellow-400' : 'hover:text-yellow-600'}`}
                                    title={client.isStarred ? 'Unstar this client' : 'Star this client'}
                                >
                                    <i className={`${client.isStarred ? 'fas' : 'far'} fa-star ${client.isStarred ? 'text-yellow-500' : isDark ? 'text-white' : 'text-gray-300'}`}></i>
                                </button>
                            )}
                            <div className="min-w-0 flex-1">
                                <h2 className={`text-lg sm:text-xl font-semibold truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                    {client ? formData.name : 'Add New Client'}
                                </h2>
                                {client && (
                                    <p className={`text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-0.5 truncate`}>
                                        {formData.industry} • {formData.status}
                                    </p>
                                )}
                            </div>
                        </div>
                        {!isFullPage && (
                            <button 
                                onClick={onClose} 
                                className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} p-2 rounded transition-colors`}
                            >
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        )}
                    </div>

                {/* Tabs */}
                <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-3 sm:px-6`}>
                    <div className={`flex ${isFullPage ? 'gap-4 sm:gap-8' : 'gap-2 sm:gap-6'} overflow-x-auto scrollbar-hide`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {['overview', 'groups', 'contacts', 'sites', 'opportunities', 'calendar', 'projects', 'service-maintenance', ...(isAdmin ? ['contracts'] : []), 'activity', 'notes'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => handleTabChange(tab)}
                                className={`${isFullPage ? 'py-4 px-2' : 'py-3'} text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 min-w-fit ${
                                    activeTab === tab
                                        ? 'border-primary-600 text-primary-600'
                                        : isDark 
                                            ? 'border-transparent text-gray-400 hover:text-gray-200' 
                                            : 'border-transparent text-gray-600 hover:text-gray-900'
                                }`}
                                style={{ minWidth: 'max-content' }}
                            >
                                <i className={`fas fa-${
                                    tab === 'overview' ? 'info-circle' :
                                    tab === 'groups' ? 'sitemap' :
                                    tab === 'contacts' ? 'users' :
                                    tab === 'sites' ? 'map-marker-alt' :
                                    tab === 'opportunities' ? 'bullseye' :
                                    tab === 'calendar' ? 'calendar-alt' :
                                    tab === 'projects' ? 'folder-open' :
                                    tab === 'service-maintenance' ? 'wrench' :
                                    tab === 'contracts' ? 'file-contract' :
                                    tab === 'activity' ? 'history' :
                                    'comment-alt'
                                } mr-1 sm:mr-2`}></i>
                                <span className="hidden sm:inline">{tab === 'service-maintenance' ? 'Service & Maintenance' : (tab.charAt(0).toUpperCase() + tab.slice(1).replace(/-/g, ' '))}</span>
                                <span className="sm:hidden">{tab === 'service-maintenance' ? 'S&M' : tab.charAt(0).toUpperCase()}</span>
                                {tab === 'contacts' && formData.contacts?.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.contacts.length}
                                    </span>
                                )}
                                {tab === 'sites' && formData.sites?.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.sites.length}
                                    </span>
                                )}
                                {tab === 'opportunities' && formData.opportunities?.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-green-100 text-green-600 rounded text-xs">
                                        {formData.opportunities.length}
                                    </span>
                                )}
                                {tab === 'projects' && clientProjects.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {clientProjects.length}
                                    </span>
                                )}
                                {tab === 'service-maintenance' && jobCards.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-xs">
                                        {jobCards.length}
                                    </span>
                                )}
                                {tab === 'calendar' && upcomingFollowUps.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-100 text-yellow-600 rounded text-xs">
                                        {upcomingFollowUps.length}
                                    </span>
                                )}
                                {tab === 'contracts' && formData.contracts?.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.contracts.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div ref={contentScrollableRef} className={`flex-1 overflow-y-auto ${isFullPage ? 'p-8' : 'p-6'}`}>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                <div className={`grid grid-cols-1 ${isFullPage ? 'md:grid-cols-3 gap-6' : 'md:grid-cols-2 gap-4'}`}>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            Entity Name *
                                        </label>
                                        <input 
                                            type="text" 
                                            value={formData.name}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                isEditingRef.current = true;
                                                hasUserEditedForm.current = true; // Mark that user has edited
                                                userEditedFieldsRef.current.add('name'); // Track that user has edited this field
                                                if (onEditingChange) onEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    if (onEditingChange) onEditingChange(false);
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing (longer to prevent overwrites)
                                                setFormData(prev => {
                                                    const updated = {...prev, name: e.target.value};
                                                    // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                                        <select
                                            value={formData.industry}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                        onChange={(e) => {
                                            // CRITICAL: Mark that user has started typing and edited this field
                                            userHasStartedTypingRef.current = true;
                                            isEditingRef.current = true;
                                            hasUserEditedForm.current = true; // Mark that user has edited
                                            userEditedFieldsRef.current.add('industry'); // Track that user has edited this field
                                            if (onEditingChange) onEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                                if (onEditingChange) onEditingChange(false);
                                            }, 5000); // Clear editing flag 5 seconds after user stops typing
                                            setFormData(prev => {
                                                const updated = {...prev, industry: e.target.value};
                                                // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                formDataRef.current = updated;
                                                return updated;
                                            });
                                        }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="">Select Industry</option>
                                            {industries.map((industry) => (
                                                <option key={industry.id} value={industry.name}>
                                                    {industry.name}
                                                </option>
                                            ))}
                                            {industries.length === 0 && (
                                                <>
                                                    <option>Mining</option>
                                                    <option>Mining Contractor</option>
                                                    <option>Forestry</option>
                                                    <option>Agriculture</option>
                                                    <option>Diesel Supply</option>
                                                    <option>Logistics</option>
                                                    <option>Other</option>
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                                        <select 
                                            value={formData.status}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                        onChange={(e) => {
                                            isEditingRef.current = true;
                                            hasUserEditedForm.current = true; // Mark that user has edited
                                            userEditedFieldsRef.current.add('status'); // Track that user has edited this field
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                            }, 5000); // Clear editing flag 5 seconds after user stops typing
                                            setFormData(prev => ({...prev, status: e.target.value}));
                                        }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option>Active</option>
                                            <option>Inactive</option>
                                            <option>On Hold</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                                        <input 
                                            type="url" 
                                            value={formData.website || ''}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                isEditingRef.current = true;
                                                hasUserEditedForm.current = true; // Mark that user has edited
                                                userEditedFieldsRef.current.add('website'); // Track that user has edited this field
                                                if (onEditingChange) onEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    if (onEditingChange) onEditingChange(false);
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing
                                                setFormData(prev => {
                                                    const updated = {...prev, website: e.target.value};
                                                    // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 500);
                                            }}
                                            placeholder="https://example.com"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                                    <textarea 
                                        value={formData.address}
                                        onFocus={() => {
                                            userHasStartedTypingRef.current = true;
                                            isEditingRef.current = true;
                                            if (onEditingChange) onEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                        }}
                                        onChange={(e) => {
                                            // CRITICAL: Mark that user has started typing and edited this field
                                            userHasStartedTypingRef.current = true;
                                            isEditingRef.current = true;
                                            hasUserEditedForm.current = true; // Mark that user has edited
                                            userEditedFieldsRef.current.add('address'); // Track that user has edited this field
                                            if (onEditingChange) onEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                                if (onEditingChange) onEditingChange(false);
                                            }, 5000); // Clear editing flag 5 seconds after user stops typing
                                            setFormData(prev => {
                                                const updated = {...prev, address: e.target.value};
                                                // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                formDataRef.current = updated;
                                                return updated;
                                            });
                                        }}
                                        onBlur={() => {
                                            setTimeout(() => {
                                                isEditingRef.current = false;
                                            }, 500);
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="2"
                                        placeholder="Street address, City, Province, Postal Code"
                                    ></textarea>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">General Notes</label>
                                    <textarea 
                                        ref={notesTextareaRef}
                                        value={formData.notes}
                                        onFocus={() => {
                                            isEditingRef.current = true;
                                            userHasStartedTypingRef.current = true; // CRITICAL: Mark that user has started typing
                                            userEditedFieldsRef.current.add('notes'); // CRITICAL: Track that user has edited this field
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                        }}
                                        onChange={(e) => {
                                            // Skip if spacebar was just pressed (handled in onKeyDown)
                                            if (isSpacebarPressedRef.current) {
                                                isSpacebarPressedRef.current = false;
                                                return; // Skip - onKeyDown already updated formData
                                            }
                                            
                                            isEditingRef.current = true;
                                            userHasStartedTypingRef.current = true; // CRITICAL: Mark that user has started typing
                                            hasUserEditedForm.current = true;
                                            userEditedFieldsRef.current.add('notes');
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                            }, 5000);
                                            
                                            // Preserve cursor position
                                            const textarea = e.target;
                                            const cursorPos = textarea.selectionStart;
                                            const newValue = e.target.value;
                                            
                                            // Store cursor position for restoration after render
                                            notesCursorPositionRef.current = cursorPos;
                                            
                                            setFormData(prev => {
                                                const updated = {...prev, notes: newValue};
                                                formDataRef.current = updated;
                                                return updated;
                                            });
                                        }}
                                        onKeyDown={(e) => {
                                            // Handle spacebar specially to prevent cursor jumping
                                            if (e.key === ' ' || e.keyCode === 32) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                
                                                const textarea = e.target;
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                const currentValue = formData.notes || '';
                                                const newValue = currentValue.substring(0, start) + ' ' + currentValue.substring(end);
                                                const newCursorPos = start + 1;
                                                
                                                // Mark that spacebar was pressed
                                                isSpacebarPressedRef.current = true;
                                                
                                                // Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                hasUserEditedForm.current = true;
                                                userEditedFieldsRef.current.add('notes');
                                                
                                                // Store cursor position for restoration
                                                notesCursorPositionRef.current = newCursorPos;
                                                
                                                // Update React state - let React handle the value update normally
                                                setFormData(prev => {
                                                    const updated = {...prev, notes: newValue};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                                
                                                // Restore cursor position after React re-renders
                                                // Use setTimeout to ensure it's after React's render cycle
                                                setTimeout(() => {
                                                    if (notesTextareaRef.current) {
                                                        notesTextareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                                                        notesTextareaRef.current.focus();
                                                    }
                                                }, 0);
                                            }
                                        }}
                                        onBlur={(e) => {
                                            // Clear cursor position tracking when user leaves field
                                            notesCursorPositionRef.current = null;
                                            
                                            isEditingRef.current = false; // Clear editing flag when user leaves field
                                            // Auto-save notes when user leaves the field
                                            // Use the current textarea value to ensure we have the latest data
                                            if (client) {
                                                const latestNotes = e.target.value;
                                                
                                                // Mark form as edited to prevent useEffect from resetting
                                                hasUserEditedForm.current = true;
                                                isAutoSavingRef.current = true;
                                                
                                                // Get latest formData including the notes value from the textarea
                                                setFormData(prev => {
                                                    const latest = {...prev, notes: latestNotes};
                                                    // Update ref immediately
                                                    formDataRef.current = latest;
                                                    return latest;
                                                });
                                                
                                                // Update ref immediately with notes - use latest from textarea
                                                const latest = {...(formDataRef.current || {}), notes: latestNotes};
                                                formDataRef.current = latest;
                                                
                                                
                                                // Save the latest data after a small delay to ensure state is updated
                                                setTimeout(() => {
                                                    onSave(latest, true).then((savedClient) => {
                                                        // Update formData with saved notes to ensure they persist
                                                        if (savedClient && savedClient.notes !== undefined) {
                                                            setFormData(prev => {
                                                                // CRITICAL: Always preserve current notes if they exist and are longer
                                                                // Only use savedClient notes if they're actually different and longer
                                                                const currentNotes = prev.notes || '';
                                                                const savedNotes = savedClient.notes || '';
                                                                if (currentNotes.trim().length > 0 && currentNotes.trim().length >= savedNotes.trim().length) {
                                                                    // Keep current notes if they're longer (user might have typed more)
                                                                    return {...prev, notes: currentNotes};
                                                                } else if (savedNotes.trim().length > 0) {
                                                                    // Use saved notes if they exist
                                                                    return {...prev, notes: savedNotes};
                                                                }
                                                                // Otherwise keep current
                                                                return prev;
                                                            });
                                                        }
                                                    }).catch((error) => {
                                                        console.error('❌ Error saving notes:', error);
                                                    }).finally(() => {
                                                        // Clear auto-saving flag after save completes AND a delay to prevent useEffect from running
                                                        // CRITICAL: This delay must be LONGER than the setSelectedClient delay in Clients.jsx (100ms)
                                                        setTimeout(() => {
                                                            isAutoSavingRef.current = false;
                                                        }, 1000); // Increased to 1000ms to ensure setSelectedClient delay (100ms) completes first
                                                    });
                                                }, 200); // Increased delay to ensure state is updated
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="3"
                                        placeholder="General information about this client..."
                                    ></textarea>
                                </div>

                                {/* RSS News Feed Subscription */}
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <i className="fas fa-rss text-blue-600 dark:text-blue-400"></i>
                                                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                                                    News Feed Subscription
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Receive daily news articles about this {client?.type === 'lead' ? 'lead' : 'client'} automatically
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const token = window.storage?.getToken?.();
                                                    const newSubscriptionStatus = !(formData.rssSubscribed !== false);
                                                    
                                                    const response = await fetch(`/api/clients/${formData.id}/rss-subscription`, {
                                                        method: 'POST',
                                                        headers: {
                                                            'Authorization': `Bearer ${token}`,
                                                            'Content-Type': 'application/json'
                                                        },
                                                        credentials: 'include',
                                                        body: JSON.stringify({ subscribed: newSubscriptionStatus })
                                                    });
                                                    
                                                    if (response.ok) {
                                                        setFormData({...formData, rssSubscribed: newSubscriptionStatus});
                                                        hasUserEditedForm.current = true;
                                                        alert(newSubscriptionStatus ? 'Subscribed to news feed' : 'Unsubscribed from news feed');
                                                    } else {
                                                        alert('Failed to update subscription. Please try again.');
                                                    }
                                                } catch (error) {
                                                    console.error('Error updating subscription:', error);
                                                    alert('Error updating subscription. Please try again.');
                                                }
                                            }}
                                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                                                formData.rssSubscribed !== false
                                                    ? 'bg-green-600 text-white hover:bg-green-700'
                                                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
                                            }`}
                                        >
                                            <i className={`fas ${formData.rssSubscribed !== false ? 'fa-bell' : 'fa-bell-slash'}`}></i>
                                            {formData.rssSubscribed !== false ? 'Subscribed' : 'Not Subscribed'}
                                        </button>
                                    </div>
                                </div>

                                {/* Services - service level tags */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Services</label>
                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            'Self-Managed FMS',
                                            'Comprehensive FMS',
                                            'Diesel Refund Compliance',
                                            'Diesel Refund Audit',
                                            'Weight Track'
                                        ].map(option => {
                                            const isSelected = Array.isArray(formData.services) && formData.services.includes(option);
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = Array.isArray(formData.services) ? formData.services : [];
                                                        const next = isSelected
                                                            ? current.filter(s => s !== option)
                                                            : [...current, option];
                                                        setFormData({ ...formData, services: next });
                                                        hasUserEditedForm.current = true;
                                                        userEditedFieldsRef.current.add('services'); // Track that user has edited services
                                                    }}
                                                    className={`px-3 py-1.5 text-xs rounded-full border transition ${
                                                        isSelected
                                                            ? 'bg-primary-100 text-primary-700 border-primary-200'
                                                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <i className="fas fa-tags mr-1"></i>
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Delete Client Section */}
                                {client && onDelete && (
                                    <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                                    Danger Zone
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Once you delete a client, there is no going back. Please be certain.
                                                </p>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    if (confirm('Are you sure you want to delete this client? This action cannot be undone.')) {
                                                        onDelete(client.id);
                                                        onClose();
                                                    }
                                                }}
                                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                                Delete Client
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Contacts Tab */}
                        {activeTab === 'contacts' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Contact Persons</h3>
                                    <div className="flex items-center gap-3">
                                        {!showContactForm && (
                                            <button
                                                type="button"
                                                onClick={() => setShowContactForm(true)}
                                                className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center"
                                            >
                                                <i className="fas fa-plus mr-1.5"></i>
                                                Add Contact
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {showContactForm && (
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <h4 className="font-medium text-gray-900 mb-3 text-sm">
                                            {editingContact ? 'Edit Contact' : 'New Contact'}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                                                <input
                                                    type="text"
                                                    value={newContact.name}
                                                    onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="Contact name"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                                <input
                                                    type="text"
                                                    value={newContact.role}
                                                    onChange={(e) => setNewContact({...newContact, role: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="e.g., Manager, Director"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
                                                <input
                                                    type="text"
                                                    value={newContact.department}
                                                    onChange={(e) => setNewContact({...newContact, department: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="e.g., Operations, Finance"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                                <input
                                                    type="email"
                                                    value={newContact.email}
                                                    onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="contact@company.com"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                                                <input
                                                    type="tel"
                                                    value={newContact.phone}
                                                    onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="+27 11 123 4567"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Town</label>
                                                <input
                                                    type="text"
                                                    value={newContact.town}
                                                    onChange={(e) => setNewContact({...newContact, town: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="e.g., Johannesburg, Cape Town"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Linked Site</label>
                                                <select
                                                    value={newContact.siteId || ''}
                                                    onChange={(e) => setNewContact({...newContact, siteId: e.target.value || null})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option value="">No specific site</option>
                                                    {(formData.sites || []).map(site => (
                                                        <option key={site.id} value={site.id}>
                                                            {site.name} {site.address && `(${site.address})`}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex items-center">
                                                <label className="flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={newContact.isPrimary}
                                                        onChange={(e) => setNewContact({...newContact, isPrimary: e.target.checked})}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-xs font-medium text-gray-700">Primary Contact</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowContactForm(false);
                                                    setEditingContact(null);
                                                    setNewContact({
                                                        name: '',
                                                        role: '',
                                                        department: '',
                                                        email: '',
                                                        phone: '',
                                                        isPrimary: false
                                                    });
                                                }}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={editingContact ? handleUpdateContact : handleAddContact}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                            >
                                                {editingContact ? 'Update' : 'Add'} Contact
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {(() => {
                                        // Merge formData contacts with optimistic contacts
                                        const formContacts = formData.contacts || [];
                                        const optimistic = optimisticContacts || [];
                                        
                                        // Merge and deduplicate by ID
                                        const contactMap = new Map();
                                        
                                        // Add formData contacts first
                                        formContacts.forEach(contact => {
                                            if (contact?.id) contactMap.set(contact.id, contact);
                                        });
                                        
                                        // Add optimistic contacts (will overwrite if duplicate ID)
                                        optimistic.forEach(contact => {
                                            if (contact?.id) contactMap.set(contact.id, contact);
                                        });
                                        
                                        const allContacts = Array.from(contactMap.values());
                                        

                                        return allContacts.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500 text-sm">
                                                <i className="fas fa-users text-3xl mb-2"></i>
                                                <p>No contacts added yet</p>
                                            </div>
                                        ) : (
                                            allContacts.map(contact => (
                                            <div 
                                                key={contact.id} 
                                                className={`${isDark ? 'bg-gray-700 border-gray-600 hover:border-primary-400' : 'bg-white border-gray-200 hover:border-primary-300'} rounded-lg p-3 transition cursor-pointer hover:shadow-md`}
                                                onClick={() => handleEditContact(contact)}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className={`font-semibold text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{contact.name}</h4>
                                                            {contact.isPrimary && (
                                                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${isDark ? 'bg-primary-900 text-primary-200' : 'bg-primary-100 text-primary-700'}`}>
                                                                    Primary
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className={`grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                            {contact.role && (
                                                                <div><i className="fas fa-briefcase mr-1.5 w-4"></i>{contact.role}</div>
                                                            )}
                                                            {contact.department && (
                                                                <div><i className="fas fa-building mr-1.5 w-4"></i>{contact.department}</div>
                                                            )}
                                                            <div><i className="fas fa-envelope mr-1.5 w-4"></i>
                                                                <a href={`mailto:${contact.email}`} className="text-primary-600 hover:underline">
                                                                    {contact.email}
                                                                </a>
                                                            </div>
                                                            {contact.phone && (
                                                                <div><i className="fas fa-phone mr-1.5 w-4"></i>{contact.phone}</div>
                                                            )}
                                                            {contact.town && (
                                                                <div><i className="fas fa-map-marker-alt mr-1.5 w-4"></i>{contact.town}</div>
                                                            )}
                                                            {contact.siteId && (() => {
                                                                const linkedSite = (formData.sites || []).find(s => s.id === contact.siteId);
                                                                return linkedSite ? (
                                                                    <div className="col-span-2">
                                                                        <i className="fas fa-map-marker-alt mr-1.5 w-4 text-primary-600"></i>
                                                                        <span className="text-primary-600 font-medium">Linked to: </span>
                                                                        <span className="text-gray-600">{linkedSite.name}</span>
                                                                        {linkedSite.address && (
                                                                            <span className="text-gray-500 ml-1">({linkedSite.address})</span>
                                                                        )}
                                                                    </div>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditContact(contact)}
                                                            className="text-primary-600 hover:text-primary-700 p-1"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteContact(contact.id)}
                                                            className="text-red-600 hover:text-red-700 p-1"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Sites Tab */}
                        {activeTab === 'sites' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Sites & Locations</h3>
                                    {!showSiteForm && (
                                        <button
                                            type="button"
                                            onClick={() => setShowSiteForm(true)}
                                            className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Site
                                        </button>
                                    )}
                                </div>

                                {showSiteForm && (
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <h4 className="font-medium text-gray-900 mb-3 text-sm">
                                            {editingSite ? 'Edit Site' : 'New Site'}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Site Name *</label>
                                                <input
                                                    type="text"
                                                    value={newSite.name}
                                                    onChange={(e) => setNewSite({...newSite, name: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    placeholder="e.g., Main Mine, North Farm"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Site Contact</label>
                                                <input
                                                    type="text"
                                                    value={newSite.contactPerson}
                                                    onChange={(e) => setNewSite({...newSite, contactPerson: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="Contact person name"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                                                <textarea
                                                    value={newSite.address}
                                                    onChange={(e) => setNewSite({...newSite, address: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    rows="2"
                                                    placeholder="Full site address"
                                                ></textarea>
                                            </div>
                                            
                                            {/* GPS Coordinates Section */}
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">GPS Coordinates</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newSite.gpsCoordinates}
                                                        onChange={(e) => {
                                                            const coords = parseGPSCoordinates(e.target.value);
                                                            setNewSite({
                                                                ...newSite, 
                                                                gpsCoordinates: e.target.value,
                                                                latitude: coords.latitude,
                                                                longitude: coords.longitude
                                                            });
                                                        }}
                                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                        placeholder="e.g., -26.2041, 28.0473 or -26.2041, 28.0473"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={getCurrentLocation}
                                                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                                        title="Get current location"
                                                    >
                                                        <i className="fas fa-location-arrow"></i>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (newSite.latitude && newSite.longitude) {
                                                                window.open(`https://www.openstreetmap.org/?mlat=${newSite.latitude}&mlon=${newSite.longitude}&zoom=15`, '_blank');
                                                            } else {
                                                                alert('Please enter GPS coordinates first');
                                                            }
                                                        }}
                                                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                                        title="Open in OpenStreetMap"
                                                    >
                                                        <i className="fas fa-map"></i>
                                                    </button>
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        value={newSite.latitude}
                                                        onChange={(e) => setNewSite({
                                                            ...newSite, 
                                                            latitude: e.target.value,
                                                            gpsCoordinates: e.target.value && newSite.longitude ? `${e.target.value}, ${newSite.longitude}` : ''
                                                        })}
                                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                        placeholder="Latitude (-90 to 90)"
                                                    />
                                                    <input
                                                        type="number"
                                                        step="any"
                                                        value={newSite.longitude}
                                                        onChange={(e) => setNewSite({
                                                            ...newSite, 
                                                            longitude: e.target.value,
                                                            gpsCoordinates: newSite.latitude && e.target.value ? `${newSite.latitude}, ${e.target.value}` : ''
                                                        })}
                                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                        placeholder="Longitude (-180 to 180)"
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Map Selection */}
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Location Map</label>
                                                <window.MapComponent
                                                    latitude={newSite.latitude}
                                                    longitude={newSite.longitude}
                                                    siteName={newSite.name || 'Site Location'}
                                                    allowSelection={true}
                                                    onLocationSelect={handleSiteMapLocationSelect}
                                                />
                                                <div className="mt-2 text-xs text-gray-500">
                                                    💡 <strong>Tip:</strong> Click anywhere on the map to drop a pin and automatically fill in the GPS fields, or use the buttons above to pull your current location or open OpenStreetMap.
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                                                <input
                                                    type="tel"
                                                    value={newSite.phone}
                                                    onChange={(e) => setNewSite({...newSite, phone: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="+27 11 123 4567"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                                                <input
                                                    type="email"
                                                    value={newSite.email}
                                                    onChange={(e) => setNewSite({...newSite, email: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="site@company.com"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                                                <textarea
                                                    value={newSite.notes}
                                                    onChange={(e) => setNewSite({...newSite, notes: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    rows="2"
                                                    placeholder="Equipment deployed, special instructions, etc."
                                                ></textarea>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSiteForm(false);
                                                    setEditingSite(null);
            setNewSite({
                name: '',
                address: '',
                contactPerson: '',
                phone: '',
                email: '',
                notes: '',
                latitude: '',
                longitude: '',
                gpsCoordinates: ''
            });
                                                }}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={editingSite ? handleUpdateSite : handleAddSite}
                                                className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                            >
                                                {editingSite ? 'Update' : 'Add'} Site
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {(() => {
                                        // Merge formData sites with optimistic sites
                                        const formSites = formData.sites || [];
                                        const optimistic = optimisticSites || [];
                                        
                                        // Merge and deduplicate by ID
                                        const siteMap = new Map();
                                        
                                        // Add formData sites first
                                        formSites.forEach(site => {
                                            if (site?.id) siteMap.set(site.id, site);
                                        });
                                        
                                        // Add optimistic sites (will overwrite if duplicate ID)
                                        optimistic.forEach(site => {
                                            if (site?.id) siteMap.set(site.id, site);
                                        });
                                        
                                        const allSites = Array.from(siteMap.values());
                                        
                                        return allSites.length === 0 ? (
                                            <div className="text-center py-8 text-gray-500 text-sm">
                                                <i className="fas fa-map-marker-alt text-3xl mb-2"></i>
                                                <p>No sites added yet</p>
                                            </div>
                                        ) : (
                                            allSites.map(site => (
                                            <div key={site.id} className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg p-4 hover:border-primary-300 transition-all duration-200 hover:shadow-md`}>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        <i className="fas fa-map-marker-alt text-primary-600 text-lg"></i>
                                                        <h4 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} text-base`}>{site.name}</h4>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditSite(site)}
                                                            className="text-primary-600 hover:text-primary-700 p-2 hover:bg-primary-50 rounded-lg transition-colors"
                                                            title="Edit Site"
                                                        >
                                                            <i className="fas fa-edit"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteSite(site.id)}
                                                            className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete Site"
                                                        >
                                                            <i className="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Enhanced Site Information Grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {/* Left Column - Contact & Location Info */}
                                                    <div className="space-y-3">
                                                        {site.address && (
                                                            <div className={`flex items-start gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                <i className="fas fa-map-marker-alt text-primary-600 mt-0.5 w-4"></i>
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Address</div>
                                                                    <div className="text-sm">{site.address}</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {site.contactPerson && (
                                                            <div className={`flex items-start gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                <i className="fas fa-user text-blue-600 mt-0.5 w-4"></i>
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact Person</div>
                                                                    <div className="text-sm">{site.contactPerson}</div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {(site.latitude && site.longitude) && (
                                                            <div className={`flex items-start gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                <i className="fas fa-crosshairs text-green-600 mt-0.5 w-4"></i>
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">GPS Coordinates</div>
                                                                    <div className="text-sm font-mono">{site.latitude}, {site.longitude}</div>
                                                                    <a 
                                                                        href={`https://www.openstreetmap.org/?mlat=${site.latitude}&mlon=${site.longitude}&zoom=15`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 hover:underline mt-1"
                                                                        title="Open in OpenStreetMap"
                                                                    >
                                                                        <i className="fas fa-external-link-alt"></i>
                                                                        View on Map
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Right Column - Contact Details */}
                                                    <div className="space-y-3">
                                                        {site.phone && (
                                                            <div className={`flex items-start gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                <i className="fas fa-phone text-green-600 mt-0.5 w-4"></i>
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</div>
                                                                    <a href={`tel:${site.phone}`} className="text-sm text-primary-600 hover:underline">
                                                                        {site.phone}
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {site.email && (
                                                            <div className={`flex items-start gap-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                                <i className="fas fa-envelope text-purple-600 mt-0.5 w-4"></i>
                                                                <div>
                                                                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</div>
                                                                    <a href={`mailto:${site.email}`} className="text-sm text-primary-600 hover:underline">
                                                                        {site.email}
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Notes Section */}
                                                {site.notes && (
                                                    <div className={`mt-4 pt-3 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                                        <div className="flex items-start gap-2">
                                                            <i className="fas fa-sticky-note text-yellow-600 mt-0.5 w-4"></i>
                                                            <div className="flex-1">
                                                                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</div>
                                                                <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'} ${isDark ? 'bg-gray-600' : 'bg-gray-50'} p-3 rounded-lg`}>
                                                                    {site.notes}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Mini Map Preview */}
                                                {(site.latitude && site.longitude) && (
                                                    <div className={`mt-4 pt-3 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <i className="fas fa-map text-primary-600 w-4"></i>
                                                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Location Preview</div>
                                                        </div>
                                                        <div className="h-32 rounded-lg overflow-hidden border border-gray-200">
                                                            <iframe
                                                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${site.longitude-0.01},${site.latitude-0.01},${site.longitude+0.01},${site.latitude+0.01}&layer=mapnik&marker=${site.latitude},${site.longitude}`}
                                                                width="100%"
                                                                height="100%"
                                                                style={{ border: 0 }}
                                                                title={`Map of ${site.name}`}
                                                            ></iframe>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            ))
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Opportunities Tab */}
                        {activeTab === 'opportunities' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">Opportunities</h3>
                                        <p className="text-sm text-gray-600 mt-0.5">Track upsell, cross-sell, and expansion opportunities</p>
                                    </div>
                                    {!showOpportunityForm && (
                                        <button
                                            type="button"
                                            onClick={() => setShowOpportunityForm(true)}
                                            className="bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-green-700 flex items-center"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Opportunity
                                        </button>
                                    )}
                                </div>

                                {showOpportunityForm && (
                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                        <h4 className="font-medium text-gray-900 mb-3 text-sm">
                                            {editingOpportunity ? 'Edit Opportunity' : 'New Opportunity'}
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Opportunity Name *</label>
                                                <input
                                                    type="text"
                                                    value={newOpportunity.name}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, name: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    placeholder="e.g., North Mine Expansion, Premium Upgrade"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
                                                <select
                                                    value={newOpportunity.stage}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, stage: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option>Awareness</option>
                                                    <option>Interest</option>
                                                    <option>Desire</option>
                                                    <option>Action</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Expected Close Date</label>
                                                <input
                                                    type="date"
                                                    value={newOpportunity.expectedCloseDate}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, expectedCloseDate: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Related Site (Optional)</label>
                                                <select
                                                    value={newOpportunity.relatedSiteId || ''}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, relatedSiteId: e.target.value || null})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option value="">None</option>
                                                    {formData.sites?.map(site => (
                                                        <option key={site.id} value={site.id}>{site.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                                                <textarea
                                                    value={newOpportunity.notes}
                                                    onChange={(e) => setNewOpportunity({...newOpportunity, notes: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    rows="2"
                                                    placeholder="Additional details about this opportunity..."
                                                ></textarea>
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowOpportunityForm(false);
                                                    setEditingOpportunity(null);
                                                    setNewOpportunity({
                                                        name: '',
                                                        stage: 'Awareness',
                                                        expectedCloseDate: '',
                                                        relatedSiteId: null,
                                                        notes: ''
                                                    });
                                                }}
                                                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={editingOpportunity ? handleUpdateOpportunity : handleAddOpportunity}
                                                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                                            >
                                                {editingOpportunity ? 'Update' : 'Add'} Opportunity
                                            </button>
                                        </div>
                                    </div>
                                )}


                                <div className="space-y-2">
                                    {(!formData.opportunities || formData.opportunities.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-bullseye text-3xl mb-2"></i>
                                            <p>No opportunities added yet</p>
                                            <p className="text-xs mt-1">Track expansion, upsell, and cross-sell opportunities</p>
                                        </div>
                                    ) : (
                                        formData.opportunities.map(opportunity => {
                                            const relatedSite = formData.sites?.find(s => s.id === opportunity.relatedSiteId);
                                            const stageColor = 
                                                opportunity.stage === 'Awareness' ? 'bg-blue-100 text-blue-700' :
                                                opportunity.stage === 'Interest' ? 'bg-yellow-100 text-yellow-700' :
                                                opportunity.stage === 'Desire' ? 'bg-orange-100 text-orange-700' :
                                                opportunity.stage === 'Action' ? 'bg-green-100 text-green-700' :
                                                'bg-gray-100 text-gray-700';

                                            return (
                                                <div 
                                                    key={opportunity.id} 
                                                    className="bg-white border border-gray-200 rounded-lg p-3 hover:border-green-300 transition cursor-pointer"
                                                    onClick={(e) => {
                                                        // Don't open if clicking edit/delete buttons
                                                        if (e.target.closest('button')) return;
                                                        if (onOpenOpportunity) {
                                                            onOpenOpportunity(opportunity.id, client);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <i className="fas fa-bullseye text-green-600"></i>
                                                                <h4 className="font-semibold text-gray-900 text-sm">{opportunity.title || opportunity.name}</h4>
                                                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${stageColor}`}>
                                                                    {opportunity.stage}
                                                                </span>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
                                                                {opportunity.expectedCloseDate && (
                                                                    <div>
                                                                        <i className="fas fa-calendar mr-1.5 w-4"></i>
                                                                        Expected: {opportunity.expectedCloseDate}
                                                                    </div>
                                                                )}
                                                                {relatedSite && (
                                                                    <div className="col-span-2">
                                                                        <i className="fas fa-map-marker-alt mr-1.5 w-4"></i>
                                                                        {relatedSite.name}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {opportunity.notes && (
                                                                <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                                                    {opportunity.notes}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleEditOpportunity(opportunity)}
                                                                className="text-green-600 hover:text-green-700 p-1"
                                                                title="Edit"
                                                            >
                                                                <i className="fas fa-edit"></i>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteOpportunity(opportunity.id)}
                                                                className="text-red-600 hover:text-red-700 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                            </div>
                        )}

                        {/* Calendar/Follow-ups Tab */}
                        {activeTab === 'calendar' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Follow-ups & Meetings</h3>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <h4 className="font-medium text-gray-900 mb-3 text-sm">Schedule Follow-up</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Date *</label>
                                            <input
                                                type="date"
                                                value={newFollowUp.date}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, date: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Time</label>
                                            <input
                                                type="time"
                                                value={newFollowUp.time}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, time: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                            <select
                                                value={newFollowUp.type}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, type: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                            >
                                                <option>Call</option>
                                                <option>Meeting</option>
                                                <option>Email</option>
                                                <option>Visit</option>
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                                            <textarea
                                                value={newFollowUp.description}
                                                onChange={(e) => setNewFollowUp({...newFollowUp, description: e.target.value})}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                rows="2"
                                                placeholder="What needs to be discussed..."
                                            ></textarea>
                                        </div>
                                    </div>
                                    <div className="flex justify-end mt-3">
                                        <button
                                            type="button"
                                            onClick={handleAddFollowUp}
                                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Follow-up
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="font-medium text-gray-900 text-sm">Upcoming Follow-ups</h4>
                                    {upcomingFollowUps.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-calendar-alt text-3xl mb-2"></i>
                                            <p>No upcoming follow-ups scheduled</p>
                                        </div>
                                    ) : (
                                        upcomingFollowUps.map(followUp => (
                                            <div key={followUp.id} className="bg-white border border-gray-200 rounded-lg p-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={followUp.completed}
                                                            onChange={() => handleToggleFollowUp(followUp.id)}
                                                            className="mt-1"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                                                    followUp.type === 'Call' ? 'bg-blue-100 text-blue-700' :
                                                                    followUp.type === 'Meeting' ? 'bg-purple-100 text-purple-700' :
                                                                    followUp.type === 'Email' ? 'bg-green-100 text-green-700' :
                                                                    'bg-gray-100 text-gray-700'
                                                                }`}>
                                                                    {followUp.type}
                                                                </span>
                                                                <span className="text-sm font-medium text-gray-900">
                                                                    {followUp.date} {followUp.time && `at ${followUp.time}`}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-600">{followUp.description}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteFollowUp(followUp.id)}
                                                        className="text-red-600 hover:text-red-700 p-1"
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {formData.followUps?.filter(f => f.completed).length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-gray-900 text-sm">Completed Follow-ups</h4>
                                        {formData.followUps.filter(f => f.completed).map(followUp => (
                                            <div key={followUp.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 opacity-60">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-start gap-3 flex-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={true}
                                                            onChange={() => handleToggleFollowUp(followUp.id)}
                                                            className="mt-1"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="px-2 py-0.5 text-xs rounded font-medium bg-gray-200 text-gray-700">
                                                                    {followUp.type}
                                                                </span>
                                                                <span className="text-sm font-medium text-gray-900 line-through">
                                                                    {followUp.date} {followUp.time && `at ${followUp.time}`}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm text-gray-600 line-through">{followUp.description}</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteFollowUp(followUp.id)}
                                                        className="text-red-600 hover:text-red-700 p-1"
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Projects Tab */}
                        {activeTab === 'projects' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Projects</h3>
                                    <div className="text-sm text-gray-600">
                                        {clientProjects.length} project{clientProjects.length !== 1 ? 's' : ''}
                                    </div>
                                </div>

                                {clientProjects.length > 0 ? (
                                    <div className="space-y-2">
                                        {clientProjects.map(project => (
                                            <div 
                                                key={project.id} 
                                                className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 hover:shadow-sm transition cursor-pointer group"
                                                onClick={() => {
                                                    if (onNavigateToProject) {
                                                        onNavigateToProject(project.id);
                                                    }
                                                }}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm group-hover:text-primary-600 transition-colors">
                                                                {project.name}
                                                            </h4>
                                                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                                                project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                                                project.status === 'Review' ? 'bg-yellow-100 text-yellow-700' :
                                                                project.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {project.status}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 space-y-0.5">
                                                            <div><i className="fas fa-tag mr-1.5 w-4"></i>{project.type}</div>
                                                            <div><i className="fas fa-calendar mr-1.5 w-4"></i>{project.startDate} - {project.dueDate}</div>
                                                            <div><i className="fas fa-user mr-1.5 w-4"></i>{project.assignedTo}</div>
                                                            {project.tasks && (
                                                                <div><i className="fas fa-tasks mr-1.5 w-4"></i>{project.tasks.length} tasks</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <i className="fas fa-arrow-right text-primary-600 text-sm"></i>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-folder-open text-3xl mb-2"></i>
                                        <p>No projects found for this client</p>
                                        <p className="text-xs mt-1">Create projects with client name "{formData.name}" to see them here</p>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">How Projects Work</p>
                                            <p className="text-xs text-blue-800">
                                                Projects are automatically shown here when their "Client" field matches this client's name. 
                                                Click on any project to view its full details in the Projects module.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Service & Maintenance Tab */}
                        {activeTab === 'service-maintenance' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Service & Maintenance Job Cards</h3>
                                    <div className="text-sm text-gray-600">
                                        {jobCards.length} job card{jobCards.length !== 1 ? 's' : ''}
                                    </div>
                                </div>

                                {loadingJobCards ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-2"></div>
                                        <p>Loading job cards...</p>
                                    </div>
                                ) : jobCards.length > 0 ? (
                                    <div className="space-y-2">
                                        {jobCards.map(jobCard => (
                                            <div 
                                                key={jobCard.id} 
                                                className="bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition"
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm">
                                                                {jobCard.jobCardNumber || `Job Card #${jobCard.id.slice(0, 8)}`}
                                                            </h4>
                                                            <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                                                                jobCard.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                                jobCard.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                                                                'bg-gray-100 text-gray-700'
                                                            }`}>
                                                                {jobCard.status || 'draft'}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600 space-y-0.5">
                                                            {jobCard.reasonForVisit && (
                                                                <div><i className="fas fa-info-circle mr-1.5 w-4"></i>{jobCard.reasonForVisit}</div>
                                                            )}
                                                            {jobCard.siteName && (
                                                                <div><i className="fas fa-map-marker-alt mr-1.5 w-4"></i>{jobCard.siteName}</div>
                                                            )}
                                                            {jobCard.agentName && (
                                                                <div><i className="fas fa-user mr-1.5 w-4"></i>{jobCard.agentName}</div>
                                                            )}
                                                            {jobCard.createdAt && (
                                                                <div><i className="fas fa-calendar mr-1.5 w-4"></i>{new Date(jobCard.createdAt).toLocaleDateString()}</div>
                                                            )}
                                                            {jobCard.diagnosis && (
                                                                <div className="mt-1 text-xs text-gray-500 italic">{jobCard.diagnosis.substring(0, 100)}{jobCard.diagnosis.length > 100 ? '...' : ''}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-wrench text-3xl mb-2"></i>
                                        <p>No job cards found for this client</p>
                                        <p className="text-xs mt-1">Job cards will appear here when they are created for this client</p>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">Service & Maintenance Job Cards</p>
                                            <p className="text-xs text-blue-800">
                                                Job cards are automatically shown here when they are created for this client. 
                                                View the full Service & Maintenance module to create new job cards.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Contracts Tab */}
                        {activeTab === 'contracts' && (
                            <div className="space-y-4">
                                {/* Billing Terms Section */}
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Billing Terms</h3>
                                    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Payment Terms</label>
                                                <select
                                                    value={formData.billingTerms?.paymentTerms || 'Net 30'}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        billingTerms: { ...formData.billingTerms, paymentTerms: e.target.value }
                                                    })}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option>Due on Receipt</option>
                                                    <option>Net 7</option>
                                                    <option>Net 15</option>
                                                    <option>Net 30</option>
                                                    <option>Net 45</option>
                                                    <option>Net 60</option>
                                                    <option>Net 90</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Billing Frequency</label>
                                                <select
                                                    value={formData.billingTerms?.billingFrequency || 'Monthly'}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        billingTerms: { ...formData.billingTerms, billingFrequency: e.target.value }
                                                    })}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                >
                                                    <option>Per Project</option>
                                                    <option>Weekly</option>
                                                    <option>Bi-Weekly</option>
                                                    <option>Monthly</option>
                                                    <option>Quarterly</option>
                                                    <option>Annually</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Retainer (R)</label>
                                                <input
                                                    type="number"
                                                    value={formData.billingTerms?.retainerAmount || 0}
                                                    onChange={(e) => setFormData({
                                                        ...formData,
                                                        billingTerms: { ...formData.billingTerms, retainerAmount: parseFloat(e.target.value) || 0 }
                                                    })}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                    min="0"
                                                    step="0.01"
                                                />
                                            </div>
                                            <div className="flex items-end">
                                                <label className="flex items-center cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.billingTerms?.taxExempt || false}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            billingTerms: { ...formData.billingTerms, taxExempt: e.target.checked }
                                                        })}
                                                        className="mr-2"
                                                    />
                                                    <span className="text-xs font-medium text-gray-700">VAT Exempt</span>
                                                </label>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Billing Notes</label>
                                            <textarea
                                                value={formData.billingTerms?.notes || ''}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    billingTerms: { ...formData.billingTerms, notes: e.target.value }
                                                })}
                                                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                rows="2"
                                                placeholder="Special billing instructions or notes..."
                                            ></textarea>
                                        </div>
                                    </div>
                                </div>

                                {/* Contract Documents Section */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <h3 className="text-lg font-semibold text-gray-900">Contract Documents</h3>
                                        <label className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 cursor-pointer flex items-center">
                                            <i className="fas fa-upload mr-1.5"></i>
                                            Upload Contract
                                            <input
                                                type="file"
                                                accept=".pdf,.doc,.docx"
                                                onChange={async (e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        try {
                                                            const reader = new FileReader();
                                                            reader.onload = async (event) => {
                                                                try {
                                                                    const dataUrl = event.target.result;
                                                                    // Upload to server
                                                                    const token = window.storage?.getToken?.();
                                                                    const res = await fetch('/api/files', {
                                                                        method: 'POST',
                                                                        headers: {
                                                                            'Content-Type': 'application/json',
                                                                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                                                                        },
                                                                        body: JSON.stringify({
                                                                            folder: 'contracts',
                                                                            name: file.name,
                                                                            dataUrl
                                                                        })
                                                                    });
                                                                    if (!res.ok) {
                                                                        const errorData = await res.json().catch(() => ({}));
                                                                        throw new Error(errorData.error?.message || `Upload failed (${res.status})`);
                                                                    }
                                                                    const json = await res.json();
                                                                    // Handle both wrapped { data: { url: ... } } and direct { url: ... } responses
                                                                    const fileUrl = json.data?.url || json.url;
                                                                    if (!fileUrl) {
                                                                        throw new Error('No URL returned from server');
                                                                    }
                                                                    const newContract = {
                                                                        id: Date.now(),
                                                                        name: file.name,
                                                                        size: file.size,
                                                                        type: file.type,
                                                                        uploadDate: new Date().toISOString(),
                                                                        url: fileUrl
                                                                    };
                                                                    const updatedFormData = {
                                                                        ...formData,
                                                                        contracts: [...(formData.contracts || []), newContract]
                                                                    };
                                                                    setFormData(updatedFormData);
                                                                    // Log activity and auto-save (activity log will be saved automatically)
                                                                    logActivity('Contract Uploaded', `Uploaded to server: ${file.name}`, null, true, updatedFormData);
                                                                } catch (err) {
                                                                    console.error('Contract upload error:', err);
                                                                    alert('Failed to upload contract to server.');
                                                                }
                                                            };
                                                            reader.readAsDataURL(file);
                                                        } catch (readErr) {
                                                            console.error('File read error:', readErr);
                                                        }
                                                    }
                                                    e.target.value = '';
                                                }}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>

                                    {(!formData.contracts || formData.contracts.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
                                            <i className="fas fa-file-contract text-3xl mb-2"></i>
                                            <p>No contracts uploaded</p>
                                            <p className="text-xs mt-1">Upload PDF or Word documents</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {formData.contracts.map(contract => (
                                                <div key={contract.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                    <div className="flex justify-between items-start">
                                                        <div className="flex items-start gap-3 flex-1">
                                                            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                                <i className="fas fa-file-pdf text-red-600"></i>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-medium text-gray-900 text-sm truncate">{contract.name}</h4>
                                                                <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
                                                                    <span><i className="fas fa-calendar mr-1"></i>{new Date(contract.uploadDate).toLocaleDateString()}</span>
                                                                    <span><i className="fas fa-file mr-1"></i>{(contract.size / 1024).toFixed(1)} KB</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <a
                                                                href={contract.url}
                                                                download={contract.name}
                                                                className="text-primary-600 hover:text-primary-700 p-1"
                                                                title="Download"
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                <i className="fas fa-download"></i>
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (confirm('Delete this contract?')) {
                                                                        const contractToDelete = formData.contracts.find(c => c.id === contract.id);
                                                                        const updatedFormData = {
                                                                            ...formData,
                                                                            contracts: formData.contracts.filter(c => c.id !== contract.id)
                                                                        };
                                                                        setFormData(updatedFormData);
                                                                        // Log activity and auto-save (activity log will be saved automatically)
                                                                        logActivity('Contract Deleted', `Deleted: ${contractToDelete?.name}`, null, true, updatedFormData);
                                                                    }
                                                                }}
                                                                className="text-red-600 hover:text-red-700 p-1"
                                                                title="Delete"
                                                            >
                                                                <i className="fas fa-trash"></i>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Info box */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">Contract Management</p>
                                            <p className="text-xs text-blue-800">
                                                Upload signed contracts, service agreements, and NDAs. Set billing terms to automate invoicing. 
                                                All documents are stored securely in your browser's local storage.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Activity Timeline Tab */}
                        {activeTab === 'activity' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                                    <div className="text-sm text-gray-600">
                                        {(formData.activityLog || []).length} activities
                                    </div>
                                </div>

                                {(!formData.activityLog || formData.activityLog.length === 0) ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-history text-3xl mb-2"></i>
                                        <p>No activity recorded yet</p>
                                        <p className="text-xs mt-1">Activity will be logged automatically as you interact with this client</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {/* Timeline line */}
                                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                                        
                                        <div className="space-y-4">
                                            {[...(formData.activityLog || [])].reverse().map((activity, index) => {
                                                const activityIcon = 
                                                    activity.type === 'Contact Added' ? 'user-plus' :
                                                    activity.type === 'Contact Updated' ? 'user-edit' :
                                                    activity.type === 'Contact Deleted' ? 'user-minus' :
                                                    activity.type === 'Site Added' ? 'map-marker-alt' :
                                                    activity.type === 'Site Updated' ? 'map-marked-alt' :
                                                    activity.type === 'Site Deleted' ? 'map-marker-slash' :
                                                    activity.type === 'Opportunity Added' ? 'bullseye' :
                                                    activity.type === 'Opportunity Updated' ? 'chart-line' :
                                                    activity.type === 'Opportunity Deleted' ? 'times-circle' :
                                                    activity.type === 'Follow-up Added' ? 'calendar-plus' :
                                                    activity.type === 'Follow-up Completed' ? 'calendar-check' :
                                                    activity.type === 'Follow-up Deleted' ? 'calendar-times' :
                                                    activity.type === 'Comment Added' ? 'comment' :
                                                    activity.type === 'Contract Uploaded' ? 'file-upload' :
                                                    activity.type === 'Contract Deleted' ? 'file-times' :
                                                    activity.type === 'Status Changed' ? 'toggle-on' :
                                                    activity.type === 'Project Linked' ? 'link' :
                                                    'info-circle';

                                                const activityColor = 
                                                    activity.type.includes('Deleted') ? 'bg-red-100 text-red-600 border-red-200' :
                                                    activity.type.includes('Completed') ? 'bg-green-100 text-green-600 border-green-200' :
                                                    activity.type.includes('Opportunity') && !activity.type.includes('Deleted') ? 'bg-green-100 text-green-600 border-green-200' :
                                                    activity.type.includes('Added') || activity.type.includes('Uploaded') ? 'bg-blue-100 text-blue-600 border-blue-200' :
                                                    'bg-gray-100 text-gray-600 border-gray-200';

                                                return (
                                                    <div key={activity.id} className="relative flex items-start gap-3 pl-2">
                                                        <div className={`w-8 h-8 rounded-full ${activityColor} border-2 flex items-center justify-center flex-shrink-0 bg-white z-10`}>
                                                            <i className={`fas fa-${activityIcon} text-xs`}></i>
                                                        </div>
                                                        <div className="flex-1 bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                            <div className="flex justify-between items-start mb-1">
                                                                <div className="font-medium text-gray-900 text-sm">{activity.type}</div>
                                                                <div className="text-xs text-gray-500">
                                                                    {new Date(activity.timestamp).toLocaleString()}
                                                                </div>
                                                            </div>
                                                            <div className="text-sm text-gray-600">{activity.description}</div>
                                                            {activity.user && (
                                                                <div className="text-xs text-gray-500 mt-1">
                                                                    <i className="fas fa-user mr-1"></i>{activity.user}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Info box */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <div className="flex items-start">
                                        <i className="fas fa-info-circle text-blue-600 text-xs mt-0.5 mr-2"></i>
                                        <div>
                                            <p className="text-xs font-medium text-blue-900 mb-1">Activity Tracking</p>
                                            <p className="text-xs text-blue-800">
                                                All major actions are automatically logged in the activity timeline, providing a complete history 
                                                of your interactions with this client.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Company Groups Tab */}
                        {activeTab === 'groups' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                        Company Groups
                                    </h3>
                                </div>

                                {loadingGroups ? (
                                    <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                                        <p>Loading groups...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Manage Groups Section */}
                                        <div>
                                            <div className="flex justify-between items-center mb-3">
                                                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    Manage Groups
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        console.log('Create Group button clicked, setting showCreateGroupModal to true');
                                                        setShowCreateGroupModal(true);
                                                    }}
                                                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                                        isDark
                                                            ? 'bg-green-600 hover:bg-green-700 text-white'
                                                            : 'bg-green-500 hover:bg-green-600 text-white'
                                                    }`}
                                                >
                                                    <i className="fas fa-plus mr-1"></i>
                                                    Create Group
                                                </button>
                                            </div>
                                                <div className={`space-y-2 max-h-64 overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded-md p-3 border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                                    {allGroups
                                                        .filter(g => g.type === 'group')
                                                        .map((group) => {
                                                            const memberCount = (group._count?.childCompanies || 0) + (group._count?.groupChildren || 0);
                                                            return (
                                                                <div
                                                                    key={group.id}
                                                                    className={`flex items-center justify-between p-2 rounded-md ${isDark ? 'bg-gray-700' : 'bg-white'} border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}
                                                                >
                                                                    <div className="flex-1">
                                                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                            {group.name}
                                                                        </span>
                                                                        {group.industry && (
                                                                            <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                                ({group.industry})
                                                                            </span>
                                                                        )}
                                                                        <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                            • {memberCount} member{memberCount !== 1 ? 's' : ''}
                                                                        </span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setGroupToDelete(group);
                                                                            setShowDeleteGroupModal(true);
                                                                        }}
                                                                        className={`px-2 py-1 text-xs rounded transition-colors ${
                                                                            isDark
                                                                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                                                                : 'bg-red-500 hover:bg-red-600 text-white'
                                                                        }`}
                                                                    >
                                                                        <i className="fas fa-trash mr-1"></i>
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    {allGroups.filter(g => g.type === 'group').length === 0 && (
                                                        <p className={`text-sm py-4 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                            No groups created yet. Click "Create Group" to add one.
                                                        </p>
                                                    )}
                                                </div>
                                        </div>

                                        {!client?.id ? (
                                            <div className={`text-center py-8 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                <p>Please save the client first before managing group memberships.</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Primary Parent Group */}
                                        <div>
                                            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                Primary Parent Company
                                            </label>
                                            <select
                                                value={primaryParent?.id || ''}
                                                onChange={(e) => handleParentGroupChange(e.target.value)}
                                                className={`w-full px-3 py-2 rounded-md border ${
                                                    isDark 
                                                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                        : 'bg-white border-gray-300 text-gray-900'
                                                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                            >
                                                <option value="">None (Standalone Company)</option>
                                                {allGroups
                                                    .filter(g => g.type !== 'group' && g.id !== client?.id)
                                                    .map((group) => (
                                                    <option key={group.id} value={group.id}>
                                                        {group.name} {group.industry ? `(${group.industry})` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                Select the primary parent company for this client (ownership hierarchy)
                                            </p>
                                        </div>

                                        {/* Additional Group Memberships */}
                                        <div>
                                            <div className="flex justify-between items-center mb-2">
                                                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    Additional Group Memberships
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        console.log('Add Group button clicked', { 
                                                            allGroupsCount: allGroups.length,
                                                            primaryParentId: primaryParent?.id,
                                                            groupMembershipsCount: groupMemberships.length,
                                                            availableGroups: allGroups.filter(g => 
                                                                g.id !== primaryParent?.id && 
                                                                !groupMemberships.some(gm => gm.group?.id === g.id)
                                                            ).length
                                                        });
                                                        setShowAddGroupModal(true);
                                                    }}
                                                    disabled={!client?.id}
                                                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                                        !client?.id
                                                            ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                                                            : isDark
                                                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                                : 'bg-blue-500 hover:bg-blue-600 text-white'
                                                    }`}
                                                >
                                                    <i className="fas fa-plus mr-1"></i>
                                                    Add Group
                                                </button>
                                            </div>
                                            
                                            {groupMemberships.length > 0 ? (
                                                <div className="space-y-2">
                                                    {groupMemberships.map((membership) => (
                                                        <div
                                                            key={membership.id || membership.group?.id}
                                                            className={`flex items-center justify-between p-3 rounded-md border ${
                                                                isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
                                                            }`}
                                                        >
                                                            <div>
                                                                <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                                    {membership.group?.name || 'Unknown Group'}
                                                                </span>
                                                                {membership.group?.industry && (
                                                                    <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                        ({membership.group.industry})
                                                                    </span>
                                                                )}
                                                                {membership.role && membership.role !== 'member' && (
                                                                    <span className={`ml-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                                        • {membership.role}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    handleRemoveFromGroup(membership.group?.id);
                                                                }}
                                                                className={`px-3 py-1 text-xs rounded transition-colors ${
                                                                    isDark
                                                                        ? 'bg-red-600 hover:bg-red-700 text-white'
                                                                        : 'bg-red-500 hover:bg-red-600 text-white'
                                                                }`}
                                                            >
                                                                <i className="fas fa-times mr-1"></i>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className={`text-sm py-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    No additional group memberships. Click "Add Group" to assign this client to additional groups.
                                                </p>
                                            )}
                                            
                                            <p className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                Assign this client to multiple groups for flexible categorization
                                            </p>
                                        </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {/* Add Group Modal */}
                                {showAddGroupModal && (
                                    <div 
                                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" 
                                        onClick={() => {
                                            console.log('Modal backdrop clicked - closing modal');
                                            setShowAddGroupModal(false);
                                            setSelectedGroupId('');
                                        }}
                                        style={{ zIndex: 9999 }}
                                    >
                                        <div 
                                            className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}
                                            onClick={(e) => {
                                                console.log('Modal content clicked - preventing close');
                                                e.stopPropagation();
                                            }}
                                            style={{ zIndex: 10000 }}
                                        >
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    Add to Group
                                                </h3>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        console.log('Close button clicked');
                                                        setShowAddGroupModal(false);
                                                        setSelectedGroupId('');
                                                    }}
                                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
                                                >
                                                    <i className="fas fa-times text-xl"></i>
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                    <div>
                                                        <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                            Select Group
                                                        </label>
                                                        {(() => {
                                                        // Only show groups with type='group' (created groups), not regular clients
                                                            const availableGroups = allGroups.filter(g => 
                                                            g.type === 'group' &&
                                                                g.id !== client?.id &&
                                                                g.id !== primaryParent?.id && 
                                                                !groupMemberships.some(gm => gm.group?.id === g.id)
                                                            );
                                                            
                                                            if (availableGroups.length === 0) {
                                                                return (
                                                                    <div className={`p-4 rounded-md ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                                        <p className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                                        No groups available. Use the "Create Group" button to create a new group first.
                                                                        </p>
                                                                    </div>
                                                                );
                                                            }
                                                            
                                                            return (
                                                                <select
                                                                    value={selectedGroupId}
                                                                    onChange={(e) => {
                                                                        console.log('Group selected:', e.target.value);
                                                                        setSelectedGroupId(e.target.value);
                                                                    }}
                                                                    className={`w-full px-3 py-2 rounded-md border ${
                                                                        isDark 
                                                                            ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                                            : 'bg-white border-gray-300 text-gray-900'
                                                                    } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                                                >
                                                                    <option value="">Select a group...</option>
                                                                    {availableGroups.map((group) => (
                                                                        <option key={group.id} value={group.id}>
                                                                        {group.name} {group.industry ? `(${group.industry})` : ''}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            );
                                                        })()}
                                                    </div>
                                                
                                                <div className="flex gap-3 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowAddGroupModal(false);
                                                            setSelectedGroupId('');
                                                        }}
                                                        className={`px-4 py-2 rounded-md transition-colors ${
                                                            isDark
                                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                                                                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                                        }`}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleAddToGroup}
                                                        disabled={!selectedGroupId}
                                                        className={`px-4 py-2 rounded-md transition-colors ${
                                                            !selectedGroupId
                                                                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                                                                : isDark
                                                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                                        }`}
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Create Group Modal */}
                                {showCreateGroupModal && (
                                    <div 
                                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999]" 
                                        onClick={() => {
                                            console.log('Modal backdrop clicked, closing modal');
                                            setShowCreateGroupModal(false);
                                            setStandaloneGroupName('');
                                            setStandaloneGroupIndustry('Other');
                                        }}
                                        style={{ zIndex: 99999, position: 'fixed' }}
                                    >
                                        <div 
                                            className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ zIndex: 10000 }}
                                        >
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    Create New Group
                                                </h3>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowCreateGroupModal(false);
                                                        setStandaloneGroupName('');
                                                        setStandaloneGroupIndustry('Other');
                                                    }}
                                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
                                                >
                                                    <i className="fas fa-times text-xl"></i>
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                <div>
                                                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                        Group Name <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={standaloneGroupName}
                                                        onChange={(e) => setStandaloneGroupName(e.target.value)}
                                                        placeholder="e.g., Exxaro Group"
                                                        className={`w-full px-3 py-2 rounded-md border ${
                                                            isDark 
                                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                                : 'bg-white border-gray-300 text-gray-900'
                                                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                        Industry (Optional)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={standaloneGroupIndustry}
                                                        onChange={(e) => setStandaloneGroupIndustry(e.target.value)}
                                                        placeholder="e.g., Mining"
                                                        className={`w-full px-3 py-2 rounded-md border ${
                                                            isDark 
                                                                ? 'bg-gray-700 border-gray-600 text-gray-100' 
                                                                : 'bg-white border-gray-300 text-gray-900'
                                                        } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                                                    />
                                                </div>
                                                
                                                <div className="flex gap-3 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowCreateGroupModal(false);
                                                            setStandaloneGroupName('');
                                                            setStandaloneGroupIndustry('Other');
                                                        }}
                                                        className={`px-4 py-2 rounded-md transition-colors ${
                                                            isDark
                                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                                                                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                                        }`}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleCreateStandaloneGroup}
                                                        disabled={!standaloneGroupName?.trim()}
                                                        className={`px-4 py-2 rounded-md transition-colors ${
                                                            !standaloneGroupName?.trim()
                                                                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                                                                : isDark
                                                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                                                    : 'bg-green-500 hover:bg-green-600 text-white'
                                                        }`}
                                                    >
                                                        Create Group
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Delete Group Modal */}
                                {showDeleteGroupModal && groupToDelete && (
                                    <div 
                                        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" 
                                        onClick={() => {
                                            setShowDeleteGroupModal(false);
                                            setGroupToDelete(null);
                                        }}
                                        style={{ zIndex: 9999 }}
                                    >
                                        <div 
                                            className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg p-6 max-w-md w-full mx-4 shadow-xl`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ zIndex: 10000 }}
                                        >
                                            <div className="flex justify-between items-center mb-4">
                                                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                    Delete Group
                                                </h3>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setShowDeleteGroupModal(false);
                                                        setGroupToDelete(null);
                                                    }}
                                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}
                                                >
                                                    <i className="fas fa-times text-xl"></i>
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-4">
                                                <p className={`${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    Are you sure you want to delete the group <strong>"{groupToDelete.name}"</strong>?
                                                </p>
                                                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    This action cannot be undone. The group will be permanently deleted.
                                                </p>
                                                
                                                <div className="flex gap-3 justify-end">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowDeleteGroupModal(false);
                                                            setGroupToDelete(null);
                                                        }}
                                                        className={`px-4 py-2 rounded-md transition-colors ${
                                                            isDark
                                                                ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                                                                : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                                        }`}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={handleDeleteGroup}
                                                        className={`px-4 py-2 rounded-md transition-colors ${
                                                            isDark
                                                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                                                : 'bg-red-500 hover:bg-red-600 text-white'
                                                        }`}
                                                    >
                                                        Delete Group
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Notes/Comments Tab */}
                        {activeTab === 'notes' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Notes & Comments</h3>
                                </div>

                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <textarea
                                        ref={commentTextareaRef}
                                        value={newComment}
                                        onChange={(e) => {
                                            setNewComment(e.target.value);
                                        }}
                                        onKeyDown={(e) => {
                                            // Handle spacebar specially to prevent cursor jumping
                                            if (e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                const textarea = e.target;
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                const newValue = newComment.substring(0, start) + ' ' + newComment.substring(end);
                                                setNewComment(newValue);
                                                // Restore cursor position after space
                                                setTimeout(() => {
                                                    if (commentTextareaRef.current) {
                                                        commentTextareaRef.current.setSelectionRange(start + 1, start + 1);
                                                        commentTextareaRef.current.focus();
                                                    }
                                                }, 0);
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-2"
                                        rows="3"
                                        placeholder="Add a comment or note..."
                                    ></textarea>
                                    {/* Tags input */}
                                    <div className="mb-2">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                value={newNoteTagsInput}
                                                onChange={(e) => setNewNoteTagsInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTagFromInput(); } }}
                                                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                placeholder="Type a tag and press Enter or comma"
                                            />
                                            <button type="button" onClick={handleAddTagFromInput} className="px-2.5 py-1.5 text-xs bg-gray-200 rounded hover:bg-gray-300">Add</button>
                                        </div>
                                        {(newNoteTags || []).length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {newNoteTags.map(tag => (
                                                    <span key={tag} className="inline-flex items-center px-2 py-0.5 text-xs bg-primary-100 text-primary-700 rounded">
                                                        <i className="fas fa-tag mr-1"></i>{tag}
                                                        <button type="button" className="ml-1 text-primary-700" onClick={() => handleRemoveNewTag(tag)}><i className="fas fa-times"></i></button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Attachments */}
                                    <div className="mb-3">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Attachments</label>
                                        <input
                                            type="file"
                                            multiple
                                            onChange={(e) => handleAttachmentFiles(e.target.files)}
                                            className="block w-full text-xs text-gray-600"
                                        />
                                        {(newNoteAttachments || []).length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {newNoteAttachments.map(att => (
                                                    <div key={att.id} className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-2 py-1">
                                                        <div className="flex items-center gap-2">
                                                            <i className="fas fa-paperclip text-gray-500"></i>
                                                            <span className="text-gray-700">{att.name}</span>
                                                            <span className="text-gray-400">({Math.round(att.size/1024)} KB)</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <a href={att.dataUrl} download={att.name} className="text-primary-600 hover:underline">Download</a>
                                                            <button type="button" className="text-red-600" onClick={() => handleRemoveNewAttachment(att.id)} title="Remove"><i className="fas fa-trash"></i></button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleAddComment}
                                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                        >
                                            <i className="fas fa-plus mr-1.5"></i>
                                            Add Comment
                                        </button>
                                    </div>
                                </div>

                                {/* Tag filter */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600">Filter by tag:</span>
                                    <button type="button" className={`text-xs px-2 py-0.5 rounded ${!notesTagFilter ? 'bg-gray-200' : 'bg-gray-100'}`} onClick={() => setNotesTagFilter(null)}>All</button>
                                    {Array.from(new Set((formData.comments || []).flatMap(c => Array.isArray(c.tags) ? c.tags : []))).map(tag => (
                                        <button key={tag} type="button" className={`text-xs px-2 py-0.5 rounded ${notesTagFilter === tag ? 'bg-primary-200 text-primary-800' : 'bg-gray-100'}`} onClick={() => setNotesTagFilter(tag)}>
                                            <i className="fas fa-tag mr-1"></i>{tag}
                                        </button>
                                    ))}
                                </div>

                                <div ref={commentsContainerRef} className="space-y-2">
                                    {(!formData.comments || formData.comments.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-comment-alt text-3xl mb-2"></i>
                                            <p>No comments yet</p>
                                        </div>
                                    ) : (
                                        (formData.comments.filter(c => !notesTagFilter || (Array.isArray(c.tags) && c.tags.includes(notesTagFilter)))).map(comment => (
                                            <div key={comment.id} className="bg-white border border-gray-200 rounded-lg p-3">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                                                            <span className="text-primary-600 font-semibold text-xs">
                                                                {(comment.createdBy || comment.author || 'U').charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900 text-sm">{comment.createdBy || comment.author || 'User'}{comment.createdByEmail || comment.authorEmail ? ` (${comment.createdByEmail || comment.authorEmail})` : ''}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {new Date(comment.createdAt || comment.timestamp || comment.date).toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDeleteComment(comment.id)}
                                                        className="text-red-600 hover:text-red-700 p-1"
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                                {Array.isArray(comment.tags) && comment.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                                        {comment.tags.map(tag => (
                                                            <span key={tag} className="inline-flex items-center px-2 py-0.5 text-[10px] bg-gray-100 text-gray-700 rounded">
                                                                <i className="fas fa-tag mr-1"></i>{tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap mt-2">{comment.text}</p>
                                                {Array.isArray(comment.attachments) && comment.attachments.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {comment.attachments.map(att => (
                                                            <div key={att.id || att.name} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                                                                <div className="flex items-center gap-2">
                                                                    <i className="fas fa-paperclip text-gray-500"></i>
                                                                    <span className="text-gray-700">{att.name}</span>
                                                                    {att.size && <span className="text-gray-400">({Math.round(att.size/1024)} KB)</span>}
                                                                </div>
                                                                {att.dataUrl && <a href={att.dataUrl} download={att.name} className="text-primary-600 hover:underline">Download</a>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                            <div></div>
                            <div className="flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={onClose} 
                                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                                >
                                    <i className="fas fa-save mr-1.5"></i>
                                    {client ? 'Update Client' : 'Add Client'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Make available globally with error handling wrapper
try {
    window.ClientDetailModal = ClientDetailModal;
} catch (error) {
    console.error('❌ Error registering ClientDetailModal:', error);
    // Fallback: wrap in error boundary component
    window.ClientDetailModal = ({ client, onClose, ...props }) => {
        try {
            return React.createElement(ClientDetailModal, { client, onClose, ...props });
        } catch (err) {
            console.error('❌ ClientDetailModal render error:', err);
            return React.createElement('div', { 
                className: 'p-4 bg-red-50 border border-red-200 rounded-lg' 
            }, React.createElement('p', { className: 'text-red-800' }, 'Error loading client details. Please refresh the page.'));
        }
    };
}
// CONTACT FILTER: Only shows site-specific contacts - no "All Contacts" option
// This ensures contacts are always properly linked to specific sites
