// Get React hooks from window
// FIX: formData initialization order fixed - moved to top to prevent TDZ errors (v2)
const { useState, useEffect, useRef, useCallback } = React;
const ReactDOM = window.ReactDOM || (window.React && window.React.DOM) || null;

const LeadDetailModal = ({
    leadId,
    initialLead = null,
    onClose,
    onDelete,
    onConvertToClient,
    allProjects,
    isFullPage = false,
    initialTab = 'overview',
    onTabChange,
    onSave,
    onPauseSync = null,
    onEditingChange = null
}) => {
    // Check if current user is admin (must be before useState that uses it)
    const user = window.storage?.getUser?.() || {};
    const isAdmin = user?.role?.toLowerCase() === 'admin';
    const { isDark } = window.useTheme?.() || { isDark: false };
    
    // Modal owns its state - start with any provided lead data for instant rendering
    const [lead, setLead] = useState(() => initialLead || null);
    const [isLoading, setIsLoading] = useState(() => !initialLead);
    const [isSaving, setIsSaving] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(() => {
        // If user tries to access proposals tab but is not admin, default to overview
        if (initialTab === 'proposals' && !isAdmin) {
            return 'overview';
        }
        // If user tries to access projects tab (which no longer exists), default to overview
        if (initialTab === 'projects') {
            return 'overview';
        }
        return initialTab;
    });
    const lastInitialTabRef = useRef(initialTab);
    const [hasBeenSaved, setHasBeenSaved] = useState(false); // Track if lead has been saved at least once
    
    // Fetch lead data when leadId changes
    useEffect(() => {
        if (initialLead) {
            setLead(prevLead => {
                if (!prevLead || prevLead.id !== initialLead.id) {
                    return initialLead;
                }
                return prevLead;
            });
            setIsLoading(false);
        }
    }, [initialLead]);

    useEffect(() => {
        const fetchLead = async () => {
            if (!leadId) {
                setLead(null);
                setIsLoading(false);
                return;
            }
            
            if (!initialLead) {
                setIsLoading(true);
            }
            try {
                // Check rate limit before making request
                if (window.RateLimitManager?.isRateLimited()) {
                    const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
                    const waitMinutes = Math.round(waitSeconds / 60);
                    console.warn(`⏸️ Rate limit active. Skipping lead fetch. Please wait ${waitMinutes} minute(s).`);
                    setIsLoading(false);
                    return;
                }
                
                // Use throttled request to prevent rate limiting
                const response = await window.RateLimitManager?.throttleRequest?.(
                    () => window.api.getLead(leadId),
                    10 // High priority for fetching lead data
                ) || await window.api.getLead(leadId);
                
                const fetchedLead = response?.data?.lead || response?.lead;
                if (fetchedLead) {
                    setLead(fetchedLead);
                    
                    // Initialize lastSavedDataRef with fetched lead data
                    const parsedLead = {
                        ...fetchedLead,
                        contacts: typeof fetchedLead.contacts === 'string' ? JSON.parse(fetchedLead.contacts || '[]') : (fetchedLead.contacts || []),
                        followUps: typeof fetchedLead.followUps === 'string' ? JSON.parse(fetchedLead.followUps || '[]') : (fetchedLead.followUps || []),
                        comments: typeof fetchedLead.comments === 'string' ? JSON.parse(fetchedLead.comments || '[]') : (fetchedLead.comments || []),
                        proposals: typeof fetchedLead.proposals === 'string' ? JSON.parse(fetchedLead.proposals || '[]') : (fetchedLead.proposals || []),
                        projectIds: typeof fetchedLead.projectIds === 'string' ? JSON.parse(fetchedLead.projectIds || '[]') : (fetchedLead.projectIds || []),
                        sites: typeof fetchedLead.sites === 'string' ? JSON.parse(fetchedLead.sites || '[]') : (fetchedLead.sites || [])
                    };
                    lastSavedDataRef.current = parsedLead;
                }
            } catch (error) {
                // Don't show alert for rate limit errors - they're handled by RateLimitManager
                if (error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
                    console.warn('⏸️ Rate limit active. Skipping lead fetch.');
                } else {
                    console.error('Error fetching lead:', error);
                    alert('Error loading lead data');
                }
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchLead();
    }, [leadId, initialLead]);
    
    // Cleanup debounce timeout on unmount
    useEffect(() => {
        return () => {
            if (autoSaveDebounceTimeoutRef.current) {
                clearTimeout(autoSaveDebounceTimeoutRef.current);
                autoSaveDebounceTimeoutRef.current = null;
            }
        };
    }, []);
    
    const normalizeLifecycleStage = (value) => {
        switch ((value || '').toLowerCase()) {
            case 'active':
                return 'Active';
            case 'proposal':
                return 'Proposal';
            case 'tender':
                return 'Tender';
            case 'disinterested':
                return 'Disinterested';
            case 'potential':
            default:
                return 'Potential';
        }
    };

    // Create default object first to ensure it's always defined
    const defaultFormData = {
        name: '',
        industry: '',
        status: 'Potential',
        source: 'Website',
        stage: 'Awareness',
        value: 0,
        notes: '',
        website: '',
        contacts: [],
        followUps: [],
        projectIds: [],
        comments: [],
        activityLog: [],
        proposals: [],
        sites: [],
        firstContactDate: new Date().toISOString().split('T')[0],
        thumbnail: '',
        externalAgentId: null,
        id: null // Ensure id exists even if null
    };
    
    const [formData, setFormData] = useState(() => {
        // Parse JSON strings to arrays/objects if needed
        const parsedLead = lead ? {
            ...lead,
            // Ensure stage and status are ALWAYS present with defaults
            stage: lead.stage || 'Awareness',
            status: normalizeLifecycleStage(lead.status),
            contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
            followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || []),
            projectIds: typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : (lead.projectIds || []),
            comments: typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : (lead.comments || []),
            activityLog: typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : (lead.activityLog || []),
            billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {}),
            proposals: typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []),
            sites: typeof lead.sites === 'string' ? JSON.parse(lead.sites || '[]') : (lead.sites || []),
            thumbnail: lead.thumbnail || '',
            // Extract externalAgentId from externalAgent object if it exists
            externalAgentId: lead.externalAgentId || (lead.externalAgent?.id || null),
            // Initialize firstContactDate from createdAt if available, otherwise preserve existing value or use default
            firstContactDate: lead.firstContactDate || (lead.createdAt ? new Date(lead.createdAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
        } : defaultFormData;
        
        return parsedLead;
    });
    
    // Use ref to track latest formData for auto-save
    const formDataRef = useRef(null);
    const isAutoSavingRef = useRef(false);
    const lastSavedDataRef = useRef(null); // Track last saved state
    
    // REMOVED: Separate lastSavedDataRef initialization useEffect
    // This is now handled in the clean data-loading useEffect above
    
    // Track the last lead ID we processed to detect when a new lead is loaded
    const lastProcessedLeadIdRef = useRef(null);
    
    // CLEAN SOLUTION: Single useEffect to load all data when lead.id changes
    // This replaces the complex competing sync logic with a simple, predictable flow
    // The lead object from the API already includes contacts, sites, and proposals via parseClientJsonFields
    useEffect(() => {
        if (!lead?.id) {
            // No lead - reset formData to defaults
            if (lead === null) {
                lastProcessedLeadIdRef.current = null;
            }
            return;
        }

        const currentLeadId = String(lead.id);
        const isDifferentLead = lastProcessedLeadIdRef.current !== currentLeadId;
        
        // CRITICAL: Don't overwrite formData if user is currently editing/typing
        // This prevents form from refreshing and losing user input
        if (isEditingRef.current && !isDifferentLead) {
            console.log('⏸️ Skipping formData update - user is currently typing/editing');
            return;
        }
        
        // CRITICAL: Don't overwrite formData if user has started typing (even if not currently typing)
        // This preserves user input that hasn't been saved yet
        if (userHasStartedTypingRef.current && !isDifferentLead) {
            console.log('⏸️ Skipping formData update - user has unsaved changes');
            return;
        }
        
        // CRITICAL: Don't overwrite formData if we're currently auto-saving status or stage
        // This prevents race conditions where API response comes back during auto-save
        if (isAutoSavingRef.current && !isDifferentLead) {
            console.log('⏸️ Skipping formData update - auto-save in progress');
            return;
        }

        // Only update if it's a different lead (new lead loaded) OR if status/stage changed in the lead prop
        // This ensures we update formData when parent refreshes lead data after save
        const currentStatus = normalizeLifecycleStage(lead.status);
        const currentStage = lead.stage || 'Awareness';
        const formDataStatus = formDataRef.current?.status || formData?.status;
        const formDataStage = formDataRef.current?.stage || formData?.stage;
        
        const statusChanged = currentStatus !== normalizeLifecycleStage(formDataStatus);
        const stageChanged = currentStage !== formDataStage;
        const shouldUpdate = isDifferentLead || (statusChanged && !userEditedFieldsRef.current.has('status')) || (stageChanged && !userEditedFieldsRef.current.has('stage'));

        if (shouldUpdate) {
            if (isDifferentLead) {
                lastProcessedLeadIdRef.current = currentLeadId;
            }
            
            // Parse the lead data - API already includes contacts, sites, proposals via parseClientJsonFields
            const parsedLead = {
                ...lead,
                stage: currentStage,
                status: currentStatus,
                contacts: Array.isArray(lead.contacts) ? lead.contacts : (typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : []),
                followUps: Array.isArray(lead.followUps) ? lead.followUps : (typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : []),
                projectIds: Array.isArray(lead.projectIds) ? lead.projectIds : (typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : []),
                comments: Array.isArray(lead.comments) ? lead.comments : (typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : []),
                activityLog: Array.isArray(lead.activityLog) ? lead.activityLog : (typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : []),
                billingTerms: typeof lead.billingTerms === 'object' && lead.billingTerms !== null ? lead.billingTerms : (typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : {}),
                proposals: Array.isArray(lead.proposals) ? lead.proposals : (typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : []),
                sites: Array.isArray(lead.sites) ? lead.sites : (typeof lead.sites === 'string' ? JSON.parse(lead.sites || '[]') : []),
                thumbnail: lead.thumbnail || '',
                externalAgentId: lead.externalAgentId || (lead.externalAgent?.id || null),
                firstContactDate: lead.firstContactDate || (lead.createdAt ? new Date(lead.createdAt).toISOString().split('T')[0] : defaultFormData.firstContactDate),
                notes: lead.notes !== undefined && lead.notes !== null ? String(lead.notes) : ''
            };

            console.log('✅ Loaded lead data:', { 
                leadId: currentLeadId, 
                contacts: parsedLead.contacts.length,
                sites: parsedLead.sites.length,
                proposals: parsedLead.proposals.length,
                status: parsedLead.status,
                stage: parsedLead.stage
            });

            // Update formData ONCE with all loaded data
            setFormData(parsedLead);
            
            // Initialize lastSavedDataRef
            lastSavedDataRef.current = {
                ...parsedLead,
                notes: notesTextareaRef.current?.value || parsedLead.notes || '',
                projectIds: parsedLead.projectIds || []
            };
        }
    }, [lead?.id, lead?.status, lead?.stage]); // Also depend on status and stage to detect updates
    const isSavingProposalsRef = useRef(false); // Track when proposals are being saved
    const isCreatingProposalRef = useRef(false); // Track when a proposal is being created (use ref for immediate updates)
    const isEditingRef = useRef(false); // Track when user is actively typing/editing
    const editingTimeoutRef = useRef(null); // Track timeout to clear editing flag
    const autoSaveDebounceTimeoutRef = useRef(null); // Debounce auto-save to prevent rate limiting
    const lastAutoSaveAttemptRef = useRef(0); // Track last auto-save attempt timestamp
    
    // Track which fields the user has actually entered data into - NEVER overwrite these
    const userEditedFieldsRef = useRef(new Set()); // Set of field names user has edited
    
    // CRITICAL: Track the last lead object we processed to detect LiveDataSync updates
    // This helps us run the guard even when the ID hasn't changed but the object reference has
    const lastProcessedLeadRef = useRef(null);
    
    // CRITICAL: Track input values separately from formData to prevent overwrites
    // These refs hold the actual DOM values that the user types
    const nameInputRef = useRef(null);
    const industrySelectRef = useRef(null);
    const sourceSelectRef = useRef(null);
    
    // Ref for notes textarea to preserve cursor position
    const notesTextareaRef = useRef(null);
    const notesCursorPositionRef = useRef(null); // Track cursor position to restore after renders
    const isSpacebarPressedRef = useRef(false); // Track if spacebar was just pressed
    
    // Track when user has started typing - once they start, NEVER update inputs from prop
    const userHasStartedTypingRef = useRef(false);
    
    // CRITICAL: Track if this is a new lead that hasn't been explicitly saved yet
    // This prevents auto-saves from overriding new lead data until user clicks "Create Lead"
    const isNewLeadNotSavedRef = useRef(!lead); // true if lead is null/undefined (new lead)
    
    // Industry management state
    const [industries, setIndustries] = useState([]);
    const [showIndustryModal, setShowIndustryModal] = useState(false);
    const [newIndustryName, setNewIndustryName] = useState('');
    const [isLoadingIndustries, setIsLoadingIndustries] = useState(false);
    const isOpeningIndustryModalRef = useRef(false); // Prevent multiple rapid clicks
    
    // External agents state
    const [externalAgents, setExternalAgents] = useState([]);
    const [isLoadingExternalAgents, setIsLoadingExternalAgents] = useState(false);
    const [showExternalAgentModal, setShowExternalAgentModal] = useState(false);
    const [showManageExternalAgentsModal, setShowManageExternalAgentsModal] = useState(false);
    const [newExternalAgentName, setNewExternalAgentName] = useState('');
    const [isCreatingExternalAgent, setIsCreatingExternalAgent] = useState(false);
    const [isDeletingExternalAgent, setIsDeletingExternalAgent] = useState(false);
    
    // Debug modal state
    useEffect(() => {
        // Reset the ref when modal state changes
        if (!showIndustryModal) {
            isOpeningIndustryModalRef.current = false;
        }
    }, [showIndustryModal, isAdmin]);
    
    // Load industries function
    const loadIndustries = useCallback(async () => {
        try {
            // Check rate limit before making request
            if (window.RateLimitManager?.isRateLimited()) {
                console.warn('⏸️ Rate limit active. Skipping industries load.');
                setIsLoadingIndustries(false);
                return;
            }
            
            setIsLoadingIndustries(true);
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            // Use throttled request
            const response = await window.RateLimitManager?.throttleRequest?.(
                () => fetch('/api/industries', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                }),
                1 // Lowest priority
            ) || await fetch('/api/industries', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const industriesList = data?.data?.industries || data?.industries || [];
                setIndustries(industriesList);
            }
        } catch (error) {
            // Don't log rate limit errors
            if (error.status !== 429 && error.code !== 'RATE_LIMIT_EXCEEDED') {
                console.error('Error loading industries:', error);
            }
        } finally {
            setIsLoadingIndustries(false);
        }
    }, []);
    
    // Fetch industries on mount
    useEffect(() => {
        loadIndustries();
    }, [loadIndustries]);
    
    // Reload industries when modal opens
    useEffect(() => {
        if (showIndustryModal) {
            loadIndustries();
        }
    }, [showIndustryModal, loadIndustries]);
    
    // Load external agents function
    const loadExternalAgents = useCallback(async () => {
        try {
            // Check rate limit before making request
            if (window.RateLimitManager?.isRateLimited()) {
                console.warn('⏸️ Rate limit active. Skipping external agents load.');
                setIsLoadingExternalAgents(false);
                return;
            }
            
            setIsLoadingExternalAgents(true);
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            // Use throttled request
            const response = await window.RateLimitManager?.throttleRequest?.(
                () => fetch('/api/external-agents', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                }),
                1 // Lowest priority
            ) || await fetch('/api/external-agents', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const agentsList = data?.data?.externalAgents || data?.externalAgents || [];
                setExternalAgents(agentsList);
            }
        } catch (error) {
            // Don't log rate limit errors
            if (error.status !== 429 && error.code !== 'RATE_LIMIT_EXCEEDED') {
                console.error('Error loading external agents:', error);
            }
        } finally {
            setIsLoadingExternalAgents(false);
        }
    }, []);
    
    // Fetch external agents on mount
    useEffect(() => {
        loadExternalAgents();
    }, [loadExternalAgents]);
    
    // Create new external agent
    const handleCreateExternalAgent = useCallback(async () => {
        if (!newExternalAgentName.trim()) {
            alert('Please enter an external agent name');
            return;
        }
        
        if (!isAdmin) {
            alert('Only administrators can create external agents');
            return;
        }
        
        setIsCreatingExternalAgent(true);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch('/api/external-agents', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    name: newExternalAgentName.trim(),
                    isActive: true
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const newAgent = data?.data?.externalAgent || data?.externalAgent;
                
                // Reload external agents list
                await loadExternalAgents();
                
                // Select the newly created agent
                if (newAgent && newAgent.id) {
                    console.log('✅ External agent created and selected:', {
                        id: newAgent.id,
                        name: newAgent.name,
                        fullAgent: newAgent
                    });
                    setFormData(prev => {
                        const updated = {...prev, externalAgentId: newAgent.id};
                        formDataRef.current = updated;
                        userEditedFieldsRef.current.add('externalAgentId');
                        console.log('🔵 Updated formData with externalAgentId:', newAgent.id);
                        return updated;
                    });
                } else {
                    console.warn('⚠️ New external agent created but no ID found:', newAgent);
                }
                
                // Close modal and reset form
                setShowExternalAgentModal(false);
                setNewExternalAgentName('');
                
                // Show success message
                if (typeof window.showNotification === 'function') {
                    window.showNotification('External agent created successfully', 'success');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData?.message || errorData?.error || 'Failed to create external agent';
                alert(errorMessage);
            }
        } catch (error) {
            console.error('Error creating external agent:', error);
            alert('Failed to create external agent. Please try again.');
        } finally {
            setIsCreatingExternalAgent(false);
        }
    }, [newExternalAgentName, isAdmin, loadExternalAgents]);
    
    // Delete external agent
    const handleDeleteExternalAgent = useCallback(async (agentId, agentName) => {
        if (!isAdmin) {
            alert('Only administrators can delete external agents');
            return;
        }
        
        if (!confirm(`Are you sure you want to delete "${agentName}"?\n\nNote: If any leads/clients are using this agent, it will be deactivated instead of deleted.`)) {
            return;
        }
        
        setIsDeletingExternalAgent(true);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch(`/api/external-agents/${agentId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const message = data?.message || 'External agent deleted successfully';
                
                // Reload external agents list
                await loadExternalAgents();
                
                // If the deleted agent was selected, clear the selection
                setFormData(prev => {
                    if (prev.externalAgentId === agentId) {
                        const updated = {...prev, externalAgentId: null};
                        formDataRef.current = updated;
                        return updated;
                    }
                    return prev;
                });
                
                // Show success message
                if (typeof window.showNotification === 'function') {
                    window.showNotification(message, 'success');
                } else {
                    alert(message);
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData?.message || errorData?.error || 'Failed to delete external agent';
                alert(errorMessage);
            }
        } catch (error) {
            console.error('Error deleting external agent:', error);
            alert('Failed to delete external agent. Please try again.');
        } finally {
            setIsDeletingExternalAgent(false);
        }
    }, [isAdmin, loadExternalAgents]);
    
    // Add new industry
    const handleAddIndustry = useCallback(async () => {
        if (!newIndustryName.trim()) {
            alert('Please enter an industry name');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch('/api/industries', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ name: newIndustryName.trim() })
            });
            
            if (response.ok) {
                setNewIndustryName('');
                await loadIndustries(); // Reload industries list
                alert('Industry added successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error || 'Failed to add industry');
            }
        } catch (error) {
            console.error('Error adding industry:', error);
            alert('Error adding industry: ' + error.message);
        }
    }, [newIndustryName, loadIndustries]);
    
    // Edit industry
    const handleEditIndustry = useCallback(async (industryId, newName) => {
        if (!newName || !newName.trim()) {
            alert('Please enter an industry name');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch(`/api/industries/${industryId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ name: newName.trim() })
            });
            
            if (response.ok) {
                await loadIndustries(); // Reload industries list
                alert('Industry updated successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error || 'Failed to update industry');
            }
        } catch (error) {
            console.error('Error updating industry:', error);
            alert('Error updating industry: ' + error.message);
        }
    }, [loadIndustries]);
    
    // Delete industry - define before useEffect that uses it
    const handleDeleteIndustry = useCallback(async (industryId) => {
        if (!confirm('Are you sure you want to delete this industry?')) {
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication required');
                return;
            }
            
            const response = await fetch(`/api/industries/${industryId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                await loadIndustries(); // Reload industries list
                alert('Industry deleted successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error || 'Failed to delete industry');
            }
        } catch (error) {
            console.error('Error deleting industry:', error);
            alert('Error deleting industry: ' + error.message);
        }
    }, [loadIndustries]);
    
    // Store functions in refs to prevent useEffect re-runs
    const handleAddIndustryRef = useRef(handleAddIndustry);
    const handleDeleteIndustryRef = useRef(handleDeleteIndustry);
    const handleEditIndustryRef = useRef(handleEditIndustry);
    
    useEffect(() => {
        handleAddIndustryRef.current = handleAddIndustry;
        handleDeleteIndustryRef.current = handleDeleteIndustry;
        handleEditIndustryRef.current = handleEditIndustry;
    }, [handleAddIndustry, handleDeleteIndustry, handleEditIndustry]);
    
    // Render modal to document.body using useEffect - MUST be after handleAddIndustry and handleDeleteIndustry
    useEffect(() => {
        if (!showIndustryModal) {
            // Remove modal if it exists
            const existingModal = document.getElementById('industry-management-modal-container');
            if (existingModal) {
                existingModal.remove();
            }
            return;
        }
        
        // Remove any existing modal first
        const existingModal = document.getElementById('industry-management-modal-container');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal container
        const modalContainer = document.createElement('div');
        modalContainer.id = 'industry-management-modal-container';
        modalContainer.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99999; display: flex; align-items: center; justify-content: center; background-color: rgba(0, 0, 0, 0.5);';
        document.body.appendChild(modalContainer);

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col';
        modalContent.style.cssText = 'z-index: 100000; position: relative;';
        modalContent.onclick = (e) => e.stopPropagation();
        modalContainer.appendChild(modalContent);

        // Create header
        const header = document.createElement('div');
        header.className = 'px-6 py-4 border-b border-gray-200 flex items-center justify-between';
        const headerTitle = document.createElement('h2');
        headerTitle.className = 'text-xl font-semibold text-gray-900';
        headerTitle.textContent = 'Manage Industries';
        header.appendChild(headerTitle);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'text-gray-400 hover:text-gray-600';
        closeBtn.onclick = () => setShowIndustryModal(false);
        closeBtn.innerHTML = '<i class="fas fa-times text-xl"></i>';
        header.appendChild(closeBtn);
        modalContent.appendChild(header);

        // Create body
        const body = document.createElement('div');
        body.className = 'flex-1 overflow-y-auto p-6';
        
        // Add new industry section
        const addSection = document.createElement('div');
        addSection.className = 'mb-6';
        const addLabel = document.createElement('label');
        addLabel.className = 'block text-sm font-medium mb-2 text-gray-700';
        addLabel.textContent = 'Add New Industry';
        addSection.appendChild(addLabel);
        const addInputGroup = document.createElement('div');
        addInputGroup.className = 'flex gap-2';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = newIndustryName;
        input.placeholder = 'Enter industry name';
        input.className = 'flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';
        input.oninput = (e) => setNewIndustryName(e.target.value);
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleAddIndustryRef.current();
            }
        };
        addInputGroup.appendChild(input);
        const addBtn = document.createElement('button');
        addBtn.className = 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors';
        addBtn.onclick = () => handleAddIndustryRef.current();
        addBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>Add';
        addInputGroup.appendChild(addBtn);
        addSection.appendChild(addInputGroup);
        body.appendChild(addSection);

        // Industries list
        const listSection = document.createElement('div');
        const listLabel = document.createElement('label');
        listLabel.className = 'block text-sm font-medium mb-2 text-gray-700';
        listLabel.textContent = `Existing Industries (${industries.length})`;
        listSection.appendChild(listLabel);
        
        if (isLoadingIndustries) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'text-center py-8 text-gray-500';
            loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>Loading industries...</p>';
            listSection.appendChild(loadingDiv);
        } else if (industries.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-center py-8 text-gray-500';
            emptyDiv.innerHTML = '<p>No industries found. Add one above to get started.</p>';
            listSection.appendChild(emptyDiv);
        } else {
            const industriesList = document.createElement('div');
            industriesList.className = 'space-y-2 bg-gray-50 rounded-lg p-4';
            industries.forEach((industry) => {
                const industryItem = document.createElement('div');
                industryItem.className = 'flex items-center justify-between p-3 rounded-lg bg-white hover:bg-gray-100';
                industryItem.setAttribute('data-industry-id', industry.id);
                
                // Industry name display/edit
                const nameContainer = document.createElement('div');
                nameContainer.className = 'flex-1';
                const industryName = document.createElement('span');
                industryName.className = 'font-medium text-gray-900';
                industryName.textContent = industry.name;
                industryName.setAttribute('data-display-name', industry.id);
                nameContainer.appendChild(industryName);
                
                // Edit input (hidden initially)
                const editInput = document.createElement('input');
                editInput.type = 'text';
                editInput.value = industry.name;
                editInput.className = 'hidden w-full px-2 py-1 border border-blue-500 rounded text-sm';
                editInput.setAttribute('data-edit-input', industry.id);
                nameContainer.appendChild(editInput);
                industryItem.appendChild(nameContainer);
                
                // Action buttons container
                const actionsContainer = document.createElement('div');
                actionsContainer.className = 'flex gap-2 items-center';
                actionsContainer.setAttribute('data-actions', industry.id);
                
                // Edit button with proper closure
                const editBtn = document.createElement('button');
                editBtn.className = 'px-3 py-1.5 text-sm rounded-lg transition-colors bg-blue-100 hover:bg-blue-200 text-blue-700';
                editBtn.setAttribute('data-edit-btn', industry.id);
                editBtn.innerHTML = '<i class="fas fa-edit mr-1"></i>Edit';
                
                let isEditing = false;
                let cancelBtn = null;
                
                const startEdit = () => {
                    if (isEditing) return;
                    isEditing = true;
                    displayName.classList.add('hidden');
                    editInput.classList.remove('hidden');
                    editInput.focus();
                    editInput.select();
                    
                    // Change edit button to save
                    editBtn.innerHTML = '<i class="fas fa-check mr-1"></i>Save';
                    
                    // Add cancel button
                    cancelBtn = document.createElement('button');
                    cancelBtn.className = 'px-3 py-1.5 text-sm rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700';
                    cancelBtn.innerHTML = '<i class="fas fa-times mr-1"></i>Cancel';
                    cancelBtn.onclick = () => {
                        editInput.value = industry.name;
                        displayName.classList.remove('hidden');
                        editInput.classList.add('hidden');
                        editBtn.innerHTML = '<i class="fas fa-edit mr-1"></i>Edit';
                        if (cancelBtn && cancelBtn.parentNode) {
                            cancelBtn.remove();
                        }
                        isEditing = false;
                    };
                    actionsContainer.insertBefore(cancelBtn, deleteBtn);
                    
                    // Handle Enter/Escape keys
                    const handleKeyDown = (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEdit();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelBtn.click();
                        }
                    };
                    editInput.onkeydown = handleKeyDown;
                };
                
                const saveEdit = () => {
                    const newName = editInput.value.trim();
                    if (newName && newName !== industry.name) {
                        handleEditIndustryRef.current(industry.id, newName);
                    }
                    // Reset UI
                    editInput.value = industry.name;
                    displayName.classList.remove('hidden');
                    editInput.classList.add('hidden');
                    editBtn.innerHTML = '<i class="fas fa-edit mr-1"></i>Edit';
                    if (cancelBtn && cancelBtn.parentNode) {
                        cancelBtn.remove();
                    }
                    isEditing = false;
                };
                
                editBtn.onclick = () => {
                    if (isEditing) {
                        saveEdit();
                    } else {
                        startEdit();
                    }
                };
                
                actionsContainer.appendChild(editBtn);
                
                // Delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'px-3 py-1.5 text-sm rounded-lg transition-colors bg-red-100 hover:bg-red-200 text-red-700';
                deleteBtn.setAttribute('data-delete-btn', industry.id);
                deleteBtn.setAttribute('data-industry-id', industry.id);
                deleteBtn.setAttribute('data-action', 'delete-industry');
                deleteBtn.onclick = () => handleDeleteIndustryRef.current(industry.id);
                deleteBtn.innerHTML = '<i class="fas fa-trash mr-1"></i>Delete';
                actionsContainer.appendChild(deleteBtn);
                
                industryItem.appendChild(actionsContainer);
                industriesList.appendChild(industryItem);
            });
            listSection.appendChild(industriesList);
        }
        body.appendChild(listSection);
        modalContent.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'px-6 py-4 border-t border-gray-200 flex justify-end';
        const closeFooterBtn = document.createElement('button');
        closeFooterBtn.className = 'px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700';
        closeFooterBtn.textContent = 'Close';
        closeFooterBtn.onclick = () => setShowIndustryModal(false);
        footer.appendChild(closeFooterBtn);
        modalContent.appendChild(footer);

        // Handle backdrop click
        modalContainer.onclick = (e) => {
            if (e.target === modalContainer) {
                setShowIndustryModal(false);
            }
        };


        // Cleanup function - only remove if showIndustryModal becomes false
        return () => {
            // Only remove if showIndustryModal is false (checked at start of effect)
            // This prevents removal when dependencies change but modal should stay open
            if (!showIndustryModal) {
                const modalToRemove = document.getElementById('industry-management-modal-container');
                if (modalToRemove && modalToRemove.parentNode) {
                    modalToRemove.remove();
                }
            } else {
            }
        };
    }, [showIndustryModal, industries, isLoadingIndustries]);

    // Update input value when newIndustryName changes (separate effect to avoid recreating modal)
    // Only update if the input value differs and preserve cursor position
    useEffect(() => {
        if (showIndustryModal) {
            const input = document.querySelector('#industry-management-modal-container input[type="text"]');
            if (input && input.value !== newIndustryName) {
                // Preserve cursor position
                const cursorPosition = input.selectionStart;
                input.value = newIndustryName;
                // Restore cursor position if it was within the old value length
                if (cursorPosition !== null && cursorPosition <= newIndustryName.length) {
                    input.setSelectionRange(cursorPosition, cursorPosition);
                }
            }
        }
    }, [newIndustryName, showIndustryModal]);
    
    // Update the flag when lead changes from null to having an ID (after first save)
    useEffect(() => {
        if (lead && lead.id && isNewLeadNotSavedRef.current) {
            // Lead was just created and got an ID - clear the flag to allow auto-saves
            isNewLeadNotSavedRef.current = false;
            setHasBeenSaved(true); // Mark as saved after first creation
        } else if (!lead) {
            // Lead is null - reset flag for next new lead
            isNewLeadNotSavedRef.current = true;
            setHasBeenSaved(false); // Reset saved flag for new lead
        } else if (lead && lead.id) {
            // Existing lead - mark as saved
            setHasBeenSaved(true);
        }
    }, [lead?.id]);
    
    // Refs for auto-scrolling comments
    const commentsContainerRef = useRef(null);
    const contentScrollableRef = useRef(null);
    
    // Ref for comment textarea to preserve cursor position
    const commentTextareaRef = useRef(null);
    
    // CRITICAL: Sync formDataRef with formData so guards can check current values
    // Removed duplicate useEffect and debug logging that was causing re-renders
    useEffect(() => {
        formDataRef.current = formData;
    }, [formData]);
    
    // Track previous editing state to only call onEditingChange when state actually changes
    const previousEditingStateRef = useRef(false);
    
    // Helper function to call onEditingChange only when state actually changes
    const notifyEditingChange = (isEditing, autoSaving = false) => {
        // Only call callback if editing state actually changed
        if (previousEditingStateRef.current !== isEditing) {
            previousEditingStateRef.current = isEditing;
            if (onEditingChange) {
                onEditingChange(isEditing, autoSaving);
            }
        }
    };
    
    // Cleanup editing timeout on unmount
    useEffect(() => {
        return () => {
            if (editingTimeoutRef.current) {
                clearTimeout(editingTimeoutRef.current);
            }
        };
    }, []);
    
    // CRITICAL: Completely stop LiveDataSync when modal is open (whether new or existing lead)
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
    
    // NOTE: No useEffect to watch ref values - refs don't trigger effects!
    // onEditingChange is called directly in onChange/onFocus/onBlur handlers instead
    
    const parseProposalsArray = (value) => {
        if (Array.isArray(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim()) {
            try {
                return JSON.parse(value);
            } catch (error) {
                console.warn('⚠️ Failed to parse proposals JSON, returning empty array', error);
            }
        }
        return [];
    };
    
    // Update tab when initialTab prop changes
    // CRITICAL: Don't reset tab if we're currently auto-saving (e.g., adding comments)
    // This prevents the tab from resetting to overview when saving comments
    useEffect(() => {
        // Skip tab update if we're currently auto-saving - preserve current tab
        if (isAutoSavingRef.current) {
            return;
        }
        
        let nextTab = initialTab;
        
        // If user tries to access proposals tab but is not admin, default to overview
        if (initialTab === 'proposals' && !isAdmin) {
            nextTab = 'overview';
        }
        // If user tries to access projects tab (which no longer exists), default to overview
        if (initialTab === 'projects') {
            nextTab = 'overview';
        }
        
        // Only update when the incoming initialTab actually changes
        if (nextTab && lastInitialTabRef.current !== nextTab) {
            setActiveTab(nextTab);
            lastInitialTabRef.current = nextTab;
        }
    }, [initialTab, isAdmin]);
    
    // MANUFACTURING PATTERN: Only sync formData when lead ID changes (switching to different lead)
    // Once modal is open, formData is completely user-controlled - no automatic syncing from props
    // This matches Manufacturing.jsx which has NO useEffect watching selectedItem prop
    useEffect(() => {
        // CRITICAL: If lead is null (new lead), NEVER sync formData from prop
        // User is creating a new lead - formData should be completely user-controlled
        if (!lead) {
            return;
        }
        
        const currentLeadId = lead?.id || null;
        const previousLeadId = lastProcessedLeadRef.current?.id || null;
        
        // Skip if same lead (by ID) - no need to sync
        if (currentLeadId === previousLeadId && lead === lastProcessedLeadRef.current) {
            return;
        }
        
        // CRITICAL: If user has started typing or edited fields, NEVER update formData from prop
        if (userHasStartedTypingRef.current || userEditedFieldsRef.current.size > 0) {
            lastProcessedLeadRef.current = lead;
            return;
        }
        
        // CRITICAL: Block if user is currently editing or saving
        if (isEditingRef.current || isAutoSavingRef.current || isSavingProposalsRef.current || isCreatingProposalRef.current) {
            lastProcessedLeadRef.current = lead;
            return;
        }
        
        // CRITICAL: Check DOM values directly - if user has typed in DOM, don't overwrite
        const hasDomContent = Boolean(
            (nameInputRef.current && nameInputRef.current.value && nameInputRef.current.value.trim()) ||
            (notesTextareaRef.current && notesTextareaRef.current.value && notesTextareaRef.current.value.trim()) ||
            (industrySelectRef.current && industrySelectRef.current.value && industrySelectRef.current.value.trim()) ||
            (sourceSelectRef.current && sourceSelectRef.current.value && sourceSelectRef.current.value.trim() && sourceSelectRef.current.value !== 'Website')
        );
        
        // Check if formData has user-entered content
        const currentFormData = formDataRef.current || defaultFormData;
        const formDataHasContent = Boolean(
            (currentFormData.name && currentFormData.name.trim()) ||
            (currentFormData.notes && currentFormData.notes.trim()) ||
            (currentFormData.industry && currentFormData.industry.trim()) ||
            (currentFormData.source && currentFormData.source.trim() && currentFormData.source !== 'Website')
        );
        
        // Block if DOM or formData has content (user has entered something)
        if (hasDomContent || formDataHasContent) {
            lastProcessedLeadRef.current = lead;
            return;
        }
        
        // CRITICAL: If same lead ID (and not first time), NEVER sync - user might be typing
        // Only sync when switching to a completely different lead (different ID)
        const isDifferentLead = currentLeadId !== previousLeadId && currentLeadId !== null && previousLeadId !== null;
        const isFirstTimeOpening = lead && previousLeadId === null && lastProcessedLeadRef.current === null;
        
        // CRITICAL: If same lead ID (and not first time opening), NEVER sync even if form is empty (might be mid-edit)
        if (currentLeadId === previousLeadId && currentLeadId !== null && !isFirstTimeOpening) {
            lastProcessedLeadRef.current = lead;
            return;
        }
        
        // Only sync when:
        // 1. Switching to a different lead (different ID) AND form is empty, OR
        // 2. Opening a lead for the first time (lead exists but previousLeadId is null)
        // This matches Manufacturing pattern: only set formData when opening a new item
        if (lead && (isDifferentLead || isFirstTimeOpening) && !formDataHasContent && !hasDomContent) {
            const parsedLead = {
                ...lead,
                stage: lead.stage || 'Awareness',
                status: normalizeLifecycleStage(lead.status),
                contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
                followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || []),
                projectIds: typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : (lead.projectIds || []),
                comments: typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : (lead.comments || []),
                activityLog: typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : (lead.activityLog || []),
                billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {}),
                proposals: typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []),
                thumbnail: lead.thumbnail || ''
            };
            
            setFormData(parsedLead);
            // Also update input refs if they exist
            if (nameInputRef.current && parsedLead.name) {
                nameInputRef.current.value = parsedLead.name;
            }
            if (notesTextareaRef.current && parsedLead.notes) {
                notesTextareaRef.current.value = parsedLead.notes;
            }
        }
        
        lastProcessedLeadRef.current = lead;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lead?.id]); // Only watch lead.id, not entire lead object - matches Manufacturing pattern
    
    // Ensure proposals from latest lead fetch are synced even when lead ID stays the same
    useEffect(() => {
        if (!lead || isSavingProposalsRef.current || isCreatingProposalRef.current) {
            return;
        }
        
        const fetchedProposals = parseProposalsArray(lead.proposals);
        if (!fetchedProposals.length) {
            return;
        }
        
        setFormData(prev => {
            const currentProposals = Array.isArray(prev.proposals) ? prev.proposals : [];
            if (currentProposals.length > 0) {
                return prev;
            }
            
            
            return { ...prev, proposals: fetchedProposals };
        });
    }, [lead?.proposals]);
    
    // Track previous lead ID to detect when a new lead gets an ID after save
    const previousLeadIdRef = useRef(lead?.id || null);
    
    // Track the "original" lead ID when component first mounts - use this for stable keys
    // This prevents inputs from remounting when a new lead gets an ID
    const originalLeadIdRef = useRef(lead?.id || 'new');
    
    // Update original lead ID only when switching to a completely different lead
    useEffect(() => {
        const currentLeadId = lead?.id || null;
        const originalLeadId = originalLeadIdRef.current;
        
        // Only update originalLeadId if:
        // 1. We're switching to a different lead (different ID)
        // 2. AND it's not the same lead getting an ID (original was 'new', current is real ID)
        if (currentLeadId && currentLeadId !== originalLeadId && originalLeadId !== 'new') {
            originalLeadIdRef.current = currentLeadId;
        } else if (originalLeadId === 'new' && currentLeadId) {
            // This is a new lead getting an ID - keep 'new' as the key to prevent remounting
        }
    }, [lead?.id]);
    
    // Reset typing flag when switching to different lead
    // BUT: Don't reset if we're saving a new lead (null -> ID) and user is typing
    // CRITICAL: NEVER reset if user has edited fields - preserve them permanently
    useEffect(() => {
        const currentLeadId = lead?.id || null;
        const previousLeadId = previousLeadIdRef.current;
        const currentFormDataId = formDataRef.current?.id || null;
        
        // CRITICAL: NEVER reset if user has edited any fields
        if (userEditedFieldsRef.current.size > 0) {
            previousLeadIdRef.current = currentLeadId;
            return; // Don't reset anything if user has edited fields
        }
        
        // If switching to a completely different lead (different ID), reset typing flag
        if (currentLeadId && currentLeadId !== currentFormDataId && currentLeadId !== previousLeadId) {
            // Only reset if it's truly a different lead (not the same lead getting an ID)
            const isSameLeadGettingId = !previousLeadId && currentLeadId && userHasStartedTypingRef.current;
            if (!isSameLeadGettingId) {
                userHasStartedTypingRef.current = false;
            } else {
            }
        }
        
        previousLeadIdRef.current = currentLeadId;
    }, [lead?.id]);
    
    // DISABLED: This was causing status/stage to be overwritten from stale parent data
    // When auto-saving changes, the parent's lead prop wasn't updated fast enough,
    // causing this effect to revert changes back to old values
    // useEffect(() => {
    //     if (lead && formData.id === lead.id) {
    //         // Only update specific fields that might change externally
    //         if (lead.status !== formData.status || lead.stage !== formData.stage) {
    //             setFormData(prev => ({
    //                 ...prev,
    //                 status: lead.status,
    //                 stage: lead.stage
    //             }));
    //         }
    //     }
    // }, [lead?.status, lead?.stage]);
    
    // Helper function to compare if form data has actually changed
    const hasFormDataChanged = (currentData, lastSavedData) => {
        if (!lastSavedData) return true; // If nothing saved yet, consider it changed
        
        // Compare critical fields that matter for auto-save
        const fieldsToCompare = [
            'name', 'industry', 'source', 'status', 'stage', 'notes',
            'contacts', 'followUps', 'comments', 'proposals'
        ];
        
        for (const field of fieldsToCompare) {
            const currentValue = currentData[field];
            const lastValue = lastSavedData[field];
            
            // Deep comparison for arrays/objects
            if (Array.isArray(currentValue) || Array.isArray(lastValue)) {
                const currentStr = JSON.stringify(currentValue || []);
                const lastStr = JSON.stringify(lastValue || []);
                if (currentStr !== lastStr) return true;
            } else if (typeof currentValue === 'object' && typeof lastValue === 'object') {
                const currentStr = JSON.stringify(currentValue || {});
                const lastStr = JSON.stringify(lastValue || {});
                if (currentStr !== lastStr) return true;
            } else if (currentValue !== lastValue) {
                return true;
            }
        }
        
        return false;
    };

    // Auto-save function that handles both new and existing leads
    const handleAutoSave = async (currentFormData, skipIfNewLead = false, skipChangeCheck = false) => {
        // Don't save if there's no name (required field)
        if (!currentFormData.name || currentFormData.name.trim() === '') {
            return false;
        }

        // For new leads, if skipIfNewLead is true and lead hasn't been saved, skip
        if (skipIfNewLead && !leadId && !hasBeenSaved) {
            return false;
        }

        // Check if we're already saving to prevent duplicate saves
        if (isAutoSavingRef.current || isSaving) {
            return false;
        }

        // Check rate limit before attempting save
        if (window.RateLimitManager?.isRateLimited()) {
            const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
            const waitMinutes = Math.round(waitSeconds / 60);
            console.warn(`⏸️ Rate limit active. Skipping auto-save. Please wait ${waitMinutes} minute(s).`);
            return false;
        }

        // Rate limiting: Don't auto-save if we just saved recently (within 3 seconds - increased from 2)
        const now = Date.now();
        const timeSinceLastSave = now - lastAutoSaveAttemptRef.current;
        if (timeSinceLastSave < 3000 && !skipChangeCheck) {
            return false; // Skip if we just attempted a save recently
        }

        // Check if data has actually changed before saving (unless skipChangeCheck is true)
        if (!skipChangeCheck && lastSavedDataRef.current) {
            const latestNotes = notesTextareaRef.current?.value || currentFormData.notes || '';
            const dataToCompare = {
                ...currentFormData,
                notes: latestNotes,
                projectIds: selectedProjectIds
            };
            
            if (!hasFormDataChanged(dataToCompare, lastSavedDataRef.current)) {
                // No changes detected, skip save
                return false;
            }
        }

        try {
            isAutoSavingRef.current = true;
            setIsAutoSaving(true);
            lastAutoSaveAttemptRef.current = now;

            // CRITICAL: Always read notes from textarea ref to ensure we have the latest value
            // This fixes the issue where notes typed in the textarea might not be saved on PC
            const latestNotes = notesTextareaRef.current?.value || currentFormData.notes || '';
            
            // CRITICAL: Always read externalAgentId from formDataRef to ensure we have the latest value
            // This fixes the issue where external agent selection might not be saved
            // Convert empty strings to null for consistency
            const latestExternalAgentId = formDataRef.current?.externalAgentId !== undefined && formDataRef.current?.externalAgentId !== ''
                ? formDataRef.current.externalAgentId
                : (currentFormData.externalAgentId !== undefined && currentFormData.externalAgentId !== '' 
                    ? currentFormData.externalAgentId 
                    : null);
            
            const leadData = {
                ...currentFormData,
                notes: latestNotes, // Always use the latest notes from textarea
                projectIds: selectedProjectIds,
                // Explicitly include externalAgentId to ensure it's saved (even if null)
                externalAgentId: latestExternalAgentId,
                // Only update lastContact if it's not already set or if user explicitly changed it
                // Don't overwrite with today's date on every save
                lastContact: currentFormData.lastContact || new Date().toISOString().split('T')[0]
            };
            
            // Debug logging for externalAgentId
            if (latestExternalAgentId !== null && latestExternalAgentId !== undefined) {
                console.log('💾 Saving lead with externalAgentId:', latestExternalAgentId);
            }

            // Use throttled request wrapper for API calls
            const performSave = async () => {
                // Use onSave prop if provided
                if (onSave && typeof onSave === 'function') {
                    await onSave(leadData, true); // true = stay in edit mode after save
                } else {
                    // Fallback to direct API calls if onSave is not provided
                    if (leadId) {
                        await window.api.updateLead(leadId, leadData);
                    } else {
                        const apiResponse = await window.api.createLead(leadData);
                        const savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                        // Update leadId if we just created the lead
                        if (savedLead && savedLead.id) {
                            // Update the lead state so the modal recognizes it as existing
                            setLead(savedLead);
                            // Update formData with the saved lead ID
                            setFormData(prev => ({ ...prev, id: savedLead.id }));
                        }
                    }
                }
            };

            // Use throttled request to prevent rate limiting
            await window.RateLimitManager?.throttleRequest?.(
                performSave,
                8 // High priority for saves
            ) || await performSave();
            
            // Update last saved data reference after successful save
            lastSavedDataRef.current = {
                ...leadData,
                notes: latestNotes,
                projectIds: selectedProjectIds
            };
            
            setHasBeenSaved(true); // Mark as saved after successful save
            return true;
        } catch (error) {
            // Don't show alert for rate limit or auto-save errors
            if (error.status === 429 || error.code === 'RATE_LIMIT_EXCEEDED') {
                console.warn('⏸️ Rate limit active. Auto-save skipped.');
            } else {
                console.error('❌ Error auto-saving lead:', error);
            }
            return false;
        } finally {
            isAutoSavingRef.current = false;
            setIsAutoSaving(false);
        }
    };

    // Handle tab change with auto-save (debounced to prevent rate limiting)
    const handleTabChange = async (tab) => {
        // Prevent accessing projects tab (removed)
        if (tab === 'projects') {
            return;
        }
        // Prevent non-admins from accessing proposals tab
        if (tab === 'proposals' && !isAdmin) {
            return;
        }
        
        // Switch tab immediately for better UX
        setActiveTab(tab);
        if (onTabChange) {
            onTabChange(tab);
        }
        
        // Clear any pending auto-save
        if (autoSaveDebounceTimeoutRef.current) {
            clearTimeout(autoSaveDebounceTimeoutRef.current);
        }
        
        // Check rate limit before proceeding with auto-save
        if (window.RateLimitManager?.isRateLimited()) {
            const waitSeconds = window.RateLimitManager.getWaitTimeRemaining();
            const waitMinutes = Math.round(waitSeconds / 60);
            console.warn(`⏸️ Rate limit active. Skipping auto-save on tab change. Please wait ${waitMinutes} minute(s).`);
            return;
        }
        
        // Debounce auto-save to prevent rapid API calls when switching tabs quickly
        // Increased debounce time to 1000ms to give more time between requests
        autoSaveDebounceTimeoutRef.current = setTimeout(async () => {
            // Check rate limit again before executing (in case it changed during debounce)
            if (window.RateLimitManager?.isRateLimited()) {
                console.warn('⏸️ Rate limit active. Skipping auto-save on tab change.');
                autoSaveDebounceTimeoutRef.current = null;
                return;
            }
            
            // Auto-save current form data after tab switch (debounced)
            // Only save if there's actual data to save (name is required)
            let currentFormData = formDataRef.current || formData;
            
            // CRITICAL FIX: Always sync notes from textarea ref before saving
            // This ensures notes typed in the textarea are saved even if formData hasn't updated yet
            if (notesTextareaRef.current) {
                const latestNotes = notesTextareaRef.current.value || '';
                currentFormData = {
                    ...currentFormData,
                    notes: latestNotes
                };
                // Update formDataRef immediately so it's in sync
                formDataRef.current = currentFormData;
            }
            
            // Auto-save logic:
            // 1. For existing leads (leadId exists): Save when switching tabs (only if changed)
            // 2. For new leads (no leadId): Create lead when switching away from overview tab (if name exists)
            if (currentFormData.name && currentFormData.name.trim() !== '') {
                if (leadId) {
                    // Existing lead: Save on tab change (with change detection)
                    await handleAutoSave(currentFormData, false, false);
                } else if (tab !== 'overview') {
                    // New lead: Create when switching away from overview
                    await handleAutoSave(currentFormData, false, false);
                }
            }
            
            autoSaveDebounceTimeoutRef.current = null;
        }, 1000); // Increased to 1000ms debounce - wait for user to finish switching tabs and prevent rapid requests
    };
    
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
    // CRITICAL FIX: Cannot use formData in dependency array as it causes TDZ error
    // Track comments length in state to avoid accessing formData directly in dependency array
    const [commentsLength, setCommentsLength] = useState(0);
    
    // Sync comments length state when formData changes
    useEffect(() => {
        const currentFormData = formDataRef.current || defaultFormData;
        const length = (currentFormData.comments && Array.isArray(currentFormData.comments)) 
            ? currentFormData.comments.length 
            : 0;
        if (length !== commentsLength) {
            setCommentsLength(length);
        }
    }); // Run on every render to sync with formDataRef
    
    // Auto-scroll to last comment when notes tab is opened
    useEffect(() => {
        // Use formDataRef.current instead of formData directly to avoid TDZ errors
        const currentFormData = formDataRef.current || defaultFormData;
        if (activeTab === 'notes' && commentsContainerRef.current && currentFormData.comments && Array.isArray(currentFormData.comments) && currentFormData.comments.length > 0) {
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
    }, [activeTab, commentsLength]); // Use state value instead of formData directly
    
    useEffect(() => {
        if (activeTab !== 'notes' || !formData?.id || !window.DatabaseAPI?.makeRequest) return;
        window.DatabaseAPI.makeRequest(`/comment-subscriptions?threadType=lead&threadId=${encodeURIComponent(formData.id)}`)
            .then((r) => { if (r && r.isSubscribed) setIsCommentSubscribed(true); })
            .catch(() => {});
    }, [activeTab, formData?.id]);
    
    const [editingContact, setEditingContact] = useState(null);
    const [showContactForm, setShowContactForm] = useState(false);
    
    // Sites state management
    const [optimisticSites, setOptimisticSites] = useState([]);
    const isLoadingSitesRef = useRef(false);
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
        gpsCoordinates: '',
        stage: 'Potential',
        aidaStatus: 'Awareness'
    });
    
    
    const [newContact, setNewContact] = useState({
        name: '',
        role: '',
        department: '',
        email: '',
        phone: '',
        town: '',
        isPrimary: false
    });
    
    const [newFollowUp, setNewFollowUp] = useState({
        date: '',
        time: '',
        type: 'Call',
        description: '',
        completed: false
    });
    
    const [newComment, setNewComment] = useState('');
    const [isCommentSubscribed, setIsCommentSubscribed] = useState(false);
    // Notes helpers for tags and attachments
    const [newNoteTagsInput, setNewNoteTagsInput] = useState('');
    const [newNoteTags, setNewNoteTags] = useState([]);
    const [newNoteAttachments, setNewNoteAttachments] = useState([]);
    const [notesTagFilter, setNotesTagFilter] = useState(null);
    
    // Proposal workflow state
    const [allUsers, setAllUsers] = useState([]);
    const [editingProposalName, setEditingProposalName] = useState(null);
    const [proposalNameInput, setProposalNameInput] = useState('');
    const [editingStageAssignee, setEditingStageAssignee] = useState(null);
    const [showStageComments, setShowStageComments] = useState({});
    const [stageCommentInput, setStageCommentInput] = useState({});
    const [isCreatingProposal, setIsCreatingProposal] = useState(false); // UI state for button disabled state
    const lastSaveTimeoutRef = useRef(null); // Debounce saves
    // @mention tagging state
    const [mentionState, setMentionState] = useState({}); // { [stageKey]: { show: false, query: '', position: 0 } }
    const mentionInputRefs = useRef({}); // Track textarea refs for @mention positioning
    
    // Load users for assignment
    useEffect(() => {
        const loadUsers = async () => {
            try {
                // Check rate limit before making request
                if (window.RateLimitManager?.isRateLimited()) {
                    console.warn('⏸️ Rate limit active. Skipping users load.');
                    return;
                }
                
                const token = window.storage?.getToken?.();
                if (!token) return;
                
                // Use throttled request
                const response = await window.RateLimitManager?.throttleRequest?.(
                    () => fetch('/api/users', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    }),
                    5 // Medium priority
                ) || await fetch('/api/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setAllUsers(data.data?.users || data.users || []);
                }
            } catch (error) {
                // Don't log rate limit errors
                if (error.status !== 429 && error.code !== 'RATE_LIMIT_EXCEEDED') {
                    console.error('Error loading users:', error);
                }
            }
        };
        
        // Stagger the loadUsers call to prevent burst of requests
        setTimeout(() => {
            loadUsers();
        }, 200);
        
        // Cleanup function to clear timeout on unmount
        return () => {
            if (lastSaveTimeoutRef.current) {
                clearTimeout(lastSaveTimeoutRef.current);
            }
        };
    }, []);
    
    // Helper function to save proposals with debouncing
    const saveProposals = async (updatedProposals) => {
        // Clear any pending save
        if (lastSaveTimeoutRef.current) {
            clearTimeout(lastSaveTimeoutRef.current);
        }
        
        // Use functional update to always get latest proposals
        let finalFormData = null;
        
        setFormData(prev => {
            const currentProposals = prev.proposals || [];
            
            // Merge with updatedProposals, ensuring we don't lose any
            // Use updatedProposals as source of truth but merge with current to catch any missing ones
            const allProposalIds = new Set();
            const mergedProposals = [];
            
            // Add all current proposals first
            currentProposals.forEach(p => {
                if (p.id && !allProposalIds.has(p.id)) {
                    allProposalIds.add(p.id);
                    mergedProposals.push(p);
                }
            });
            
            // Add all updated proposals (will overwrite duplicates by ID)
            updatedProposals.forEach(p => {
                if (p.id) {
                    const existingIndex = mergedProposals.findIndex(mp => mp.id === p.id);
                    if (existingIndex >= 0) {
                        // Update existing
                        mergedProposals[existingIndex] = p;
                    } else {
                        // Add new
                        mergedProposals.push(p);
                        allProposalIds.add(p.id);
                    }
                }
            });
            
            const finalProposals = mergedProposals.length > 0 ? mergedProposals : updatedProposals;
            
            const updatedFormData = { ...prev, proposals: finalProposals };
            finalFormData = updatedFormData;
            
            
            return updatedFormData;
        });
        
        // CRITICAL: Wait for state update to complete, then set refs BEFORE calling onSave
        // This ensures guards are in place before API response comes back
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay to ensure state update
        
        // Now set the refs and guards BEFORE calling onSave
        // This prevents useEffect from clearing proposals when API response updates lead prop
        isSavingProposalsRef.current = true;
        if (finalFormData) {
            lastSavedDataRef.current = finalFormData;
        }
        
        // Debounce the actual save to prevent rapid repeated saves
        lastSaveTimeoutRef.current = setTimeout(async () => {
            if (onSave && finalFormData) {
                try {
                    await onSave(finalFormData, true);
                    // Keep the flag set longer to prevent immediate reset when API response comes back
                    setTimeout(() => {
                        isSavingProposalsRef.current = false;
                    }, 3000); // Increased to 3 seconds to ensure API response is processed
                } catch (error) {
                    console.error('❌ Error saving proposals:', error);
                    isSavingProposalsRef.current = false;
                }
            } else {
                console.warn('⚠️ onSave not available or finalFormData missing');
                isSavingProposalsRef.current = false;
            }
        }, 500); // Increased debounce to 500ms
    };
    
    // Helper function to send notifications
    const sendNotification = async (userId, title, message, link, metadata = null) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            await fetch('/api/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    userId,
                    type: 'system',
                    title,
                    message,
                    link: link || '',
                    metadata: metadata || undefined
                })
            });
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    };
    
    // Helper function to get all unique assigned parties from proposal stages
    const getAllAssignedParties = (proposal) => {
        if (!proposal || !Array.isArray(proposal.stages)) return [];
        const assigneeIds = new Set();
        proposal.stages.forEach(stage => {
            if (stage.assigneeId && stage.assigneeId.trim()) {
                assigneeIds.add(stage.assigneeId);
            }
        });
        return Array.from(assigneeIds);
    };
    
    // Helper function to notify all assigned parties
    const notifyAllAssignedParties = async (proposal, title, message, link, metadata = null) => {
        const assigneeIds = getAllAssignedParties(proposal);
        const notificationPromises = assigneeIds.map(userId => 
            sendNotification(userId, title, message, link, metadata)
        );
        await Promise.all(notificationPromises);
    };
    

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
    const [selectedProjectIds, setSelectedProjectIds] = useState(formData.projectIds || []);

    // DISABLED: This was causing formData to be completely reset whenever lead prop changed
    // Including when liveDataSync refetched after every save
    // useEffect(() => {
    //     if (lead) {
    //         setFormData(lead);
    //         setSelectedProjectIds(lead.projectIds || []);
    //     }
    // }, [lead]);

    const handleAddContact = () => {
        if (!newContact.name) {
            alert('Name is required');
            return;
        }
        
        try {
            // Get current user info for activity log - handle different storage API structures
            let currentUser = { name: 'System', email: 'system', id: 'system' };
            if (window.storage) {
                if (typeof window.storage.getUserInfo === 'function') {
                    currentUser = window.storage.getUserInfo() || currentUser;
                } else if (typeof window.storage.getUser === 'function') {
                    const user = window.storage.getUser();
                    if (user) {
                        currentUser = {
                            name: user.name || 'System',
                            email: user.email || 'system',
                            id: user.id || 'system'
                        };
                    }
                }
            }
            
            const newContactId = Date.now();
            const updatedContacts = [...(Array.isArray(formData.contacts) ? formData.contacts : []), {
                ...newContact,
                id: newContactId
            }];
            
            // Create activity log entry
            const activity = {
                id: Date.now(),
                type: 'Contact Added',
                description: `Added contact: ${newContact.name}${newContact.email ? ' (' + newContact.email + ')' : ''}`,
                timestamp: new Date().toISOString(),
                user: currentUser.name,
                userId: currentUser.id,
                userEmail: currentUser.email,
                relatedId: newContactId
            };
            
            const updatedActivityLog = [...(Array.isArray(formData.activityLog) ? formData.activityLog : []), activity];
            
            const updatedFormData = {
                ...formData, 
                contacts: updatedContacts,
                activityLog: updatedActivityLog
            };
            
            setFormData(updatedFormData);
            
            
            // Save contact changes immediately - stay in edit mode
            // Ensure onSave completes - it's async
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                } catch (error) {
                    console.error('❌ Error saving contact:', error);
                    alert('Failed to save contact. Please try again.');
                }
            })();
            
            // Switch to contacts tab to show the added contact
            handleTabChange('contacts');
            
            setNewContact({
                name: '',
                role: '',
                department: '',
                email: '',
                phone: '',
                town: '',
                isPrimary: false
            });
            setShowContactForm(false);
        } catch (error) {
            console.error('❌ Error adding contact:', error);
            alert('Failed to add contact: ' + error.message);
        }
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setNewContact(contact);
        setShowContactForm(true);
    };

    const handleUpdateContact = () => {
        try {
            // Get current user info for activity log - handle different storage API structures
            let currentUser = { name: 'System', email: 'system', id: 'system' };
            if (window.storage) {
                if (typeof window.storage.getUserInfo === 'function') {
                    currentUser = window.storage.getUserInfo() || currentUser;
                } else if (typeof window.storage.getUser === 'function') {
                    const user = window.storage.getUser();
                    if (user) {
                        currentUser = {
                            name: user.name || 'System',
                            email: user.email || 'system',
                            id: user.id || 'system'
                        };
                    }
                }
            }
            
            const contacts = Array.isArray(formData.contacts) ? formData.contacts : [];
            const updatedContacts = contacts.map(c => 
                c.id === editingContact.id ? {...newContact, id: c.id} : c
            );
            
            // Create activity log entry
            const activity = {
                id: Date.now(),
                type: 'Contact Updated',
                description: `Updated contact: ${newContact.name}`,
                timestamp: new Date().toISOString(),
                user: currentUser.name,
                userId: currentUser.id,
                userEmail: currentUser.email,
                relatedId: editingContact.id
            };
            
            const updatedActivityLog = [...(Array.isArray(formData.activityLog) ? formData.activityLog : []), activity];
            
            const updatedFormData = {
                ...formData, 
                contacts: updatedContacts,
                activityLog: updatedActivityLog
            };
            
            setFormData(updatedFormData);
            
            
            // Save contact changes immediately - stay in edit mode
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                } catch (error) {
                    console.error('❌ Error saving contact update:', error);
                    alert('Failed to save contact update. Please try again.');
                }
            })();
            
            // Stay in contacts tab
            handleTabChange('contacts');
            
            setEditingContact(null);
            setNewContact({
                name: '',
                role: '',
                department: '',
                email: '',
                phone: '',
                town: '',
                isPrimary: false
            });
            setShowContactForm(false);
        } catch (error) {
            console.error('❌ Error updating contact:', error);
            alert('Failed to update contact: ' + error.message);
        }
    };

    const handleDeleteContact = (contactId) => {
        if (confirm('Remove this contact?')) {
            const contacts = Array.isArray(formData.contacts) ? formData.contacts : [];
            const updatedFormData = {
                ...formData,
                contacts: contacts.filter(c => c.id !== contactId)
            };
            setFormData(updatedFormData);
            
            // Save contact deletion immediately - stay in edit mode
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                } catch (error) {
                    console.error('❌ Error saving contact deletion:', error);
                }
            })();
            
            // Stay in contacts tab
            handleTabChange('contacts');
        }
    };

    // Helper function to merge arrays by unique ID
    const mergeUniqueById = (items = [], extras = []) => {
        const map = new Map();
        [...(items || []), ...(extras || [])].forEach(item => {
            if (item?.id) {
                map.set(item.id, item);
            }
        });
        return Array.from(map.values());
    };

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

    // Load sites from database
    const loadSitesFromDatabase = async (leadId) => {
        try {
            // Prevent duplicate requests
            if (isLoadingSitesRef.current) {
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                return;
            }
            
            isLoadingSitesRef.current = true;
            const response = await window.api.getSites(leadId);
            const sites = response?.data?.sites || [];
            
            
            // Merge database sites with any optimistic sites still pending
            setFormData(prevFormData => {
                const mergedSites = mergeUniqueById(sites, optimisticSites);
                return {
                    ...prevFormData,
                    sites: mergedSites
                };
            });
            
            // Remove optimistic sites that now exist in database
            setOptimisticSites(prev => prev.filter(opt => !sites.some(db => db.id === opt.id)));
        } catch (error) {
            console.error('❌ Error loading sites from database:', error);
        } finally {
            isLoadingSitesRef.current = false;
        }
    };
    
    // REMOVED: Automatic sites loading useEffect
    // Sites are already included in the lead object from the API (via parseClientJsonFields)
    // The loadSitesFromDatabase function is kept for manual refresh when needed (e.g., after adding a site)

    const handleAddSite = async () => {
        if (!newSite.name) {
            alert('Site name is required');
            return;
        }
        const leadId = formData?.id;
        if (!leadId) {
            alert('Save the lead first before adding sites.');
            return;
        }
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to save sites to the database');
                return;
            }
            const sitePayload = {
                name: newSite.name ?? '',
                address: newSite.address ?? '',
                contactPerson: newSite.contactPerson ?? '',
                contactPhone: newSite.contactPhone ?? newSite.phone ?? '',
                contactEmail: newSite.contactEmail ?? newSite.email ?? '',
                notes: newSite.notes ?? '',
                siteLead: newSite.siteLead ?? '',
                stage: newSite.stage ?? 'Potential',
                aidaStatus: newSite.aidaStatus ?? 'Awareness'
            };
            let response;
            if (window.api?.createSite) {
                response = await window.api.createSite(leadId, sitePayload);
            } else if (window.DatabaseAPI?.makeRequest) {
                response = await window.DatabaseAPI.makeRequest(`/sites/client/${leadId}`, { method: 'POST', body: JSON.stringify(sitePayload) });
            } else {
                alert('❌ Site API not available. Please refresh the page.');
                return;
            }
            const savedSite = response?.data?.site || response?.site || response;
            
            if (savedSite && savedSite.id) {
                // Add to optimistic sites state
                setOptimisticSites(prev => {
                    const siteExists = prev.some(s => s.id === savedSite.id);
                    if (siteExists) {
                        return prev;
                    }
                    return [...prev, savedSite];
                });
                
                // Optimistically update UI immediately
                setFormData(prev => {
                    const currentSites = prev.sites || [];
                    const siteExists = currentSites.some(s => s.id === savedSite.id);
                    if (siteExists) {
                        return prev;
                    }
                    return {
                        ...prev,
                        sites: [...currentSites, savedSite]
                    };
                });
                
                // Get current user info for activity log
                let currentUser = { name: 'System', email: 'system', id: 'system' };
                if (window.storage) {
                    if (typeof window.storage.getUserInfo === 'function') {
                        currentUser = window.storage.getUserInfo() || currentUser;
                    } else if (typeof window.storage.getUser === 'function') {
                        const user = window.storage.getUser();
                        if (user) {
                            currentUser = {
                                name: user.name || 'System',
                                email: user.email || 'system',
                                id: user.id || 'system'
                            };
                        }
                    }
                }
                
                // Create activity log entry
                const activity = {
                    id: Date.now(),
                    type: 'Site Added',
                    description: `Added site: ${newSite.name}`,
                    timestamp: new Date().toISOString(),
                    user: currentUser.name,
                    userId: currentUser.id,
                    userEmail: currentUser.email,
                    relatedId: savedSite.id
                };
                
                const updatedActivityLog = [...(Array.isArray(formData.activityLog) ? formData.activityLog : []), activity];
                const updatedFormData = {
                    ...formData,
                    sites: [...(formData.sites || []), savedSite],
                    activityLog: updatedActivityLog
                };
                try {
                    await onSave(updatedFormData, true);
                } catch (error) {
                    console.error('❌ Error saving site:', error);
                    alert('Failed to save site. Please try again.');
                }
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
                    gpsCoordinates: '',
                    stage: 'Potential',
                    aidaStatus: 'Awareness'
                });
                setShowSiteForm(false);
            } else {
                throw new Error('No site ID returned from API');
            }
        } catch (error) {
            console.error('❌ Error creating site:', error);
            const errorMessage = error?.message || 'Unknown error';
            const details = (error && typeof error.details === 'string') ? error.details : '';
            const fullMessage = details ? (errorMessage + ' — ' + details) : errorMessage;
            const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Failed to add site') || errorMessage.includes('Sites table not initialized');
            if (isServerError) {
                alert('❌ ' + (fullMessage || 'Unable to save site. This may be due to a database issue. Please contact support if this persists.'));
            } else {
                alert('❌ Error saving site to database: ' + fullMessage);
            }
        }
    };

    const handleEditSite = (site) => {
        setEditingSite(site);
        setNewSite({
            ...site,
            phone: site.phone ?? site.contactPhone ?? '',
            email: site.email ?? site.contactEmail ?? '',
            siteLead: site.siteLead ?? '',
            stage: site.stage ?? 'Potential',
            aidaStatus: site.aidaStatus ?? 'Awareness'
        });
        setShowSiteForm(true);
    };

    const handleUpdateSite = async () => {
        const siteId = editingSite?.id;
        const leadId = formData?.id;
        const sitePayload = {
            ...newSite,
            id: siteId,
            contactPhone: newSite.contactPhone ?? newSite.phone ?? '',
            contactEmail: newSite.contactEmail ?? newSite.email ?? '',
            stage: newSite.stage ?? 'Potential',
            aidaStatus: newSite.aidaStatus ?? 'Awareness'
        };
        const sites = Array.isArray(formData.sites) ? formData.sites : [];
        const updatedSites = sites.map(s => (s.id === siteId ? sitePayload : s));
        const updatedFormData = {
            ...formData,
            sites: updatedSites,
            activityLog: [
                ...(Array.isArray(formData.activityLog) ? formData.activityLog : []),
                {
                    id: Date.now(),
                    type: 'Site Updated',
                    description: `Updated site: ${newSite.name}`,
                    timestamp: new Date().toISOString(),
                    user: (window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {}).name || 'System',
                    userId: (window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {}).id || 'system',
                    userEmail: (window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {}).email || 'system',
                    relatedId: siteId
                }
            ]
        };
        setFormData(updatedFormData);
        isAutoSavingRef.current = true;
        setEditingSite(null);
        setNewSite({ name: '', address: '', contactPerson: '', phone: '', email: '', notes: '', latitude: '', longitude: '', gpsCoordinates: '', stage: 'Potential', aidaStatus: 'Awareness' });
        setShowSiteForm(false);
        setTimeout(() => handleTabChange('sites'), 100);

        try {
            if (leadId && siteId && (window.api?.updateSite || window.DatabaseAPI?.makeRequest)) {
                const payload = {
                    name: sitePayload.name ?? '',
                    address: sitePayload.address ?? '',
                    contactPerson: sitePayload.contactPerson ?? '',
                    contactPhone: sitePayload.contactPhone ?? '',
                    contactEmail: sitePayload.contactEmail ?? '',
                    notes: sitePayload.notes ?? '',
                    siteLead: sitePayload.siteLead ?? '',
                    stage: (sitePayload.stage != null && String(sitePayload.stage).trim() !== '') ? String(sitePayload.stage) : 'Potential',
                    aidaStatus: (sitePayload.aidaStatus != null && String(sitePayload.aidaStatus).trim() !== '') ? String(sitePayload.aidaStatus) : 'Awareness'
                };
                if (window.api?.updateSite) {
                    await window.api.updateSite(leadId, siteId, payload);
                } else {
                    await window.DatabaseAPI.makeRequest(`/sites/client/${leadId}/${siteId}`, { method: 'PATCH', body: JSON.stringify(payload) });
                }
            }
            await onSave(updatedFormData, true);
        } catch (error) {
            console.error('❌ Error saving site update:', error);
            alert('Failed to save site update. Please try again.');
        } finally {
            setTimeout(() => { isAutoSavingRef.current = false; }, 800);
        }
    };

    const handleDeleteSite = async (siteId) => {
        const site = formData.sites?.find(s => s.id === siteId);
        if (!confirm('Delete this site?')) return;
        const leadId = formData?.id;
        const prevFormData = formData;
        const updatedSites = (formData.sites || []).filter(s => s.id !== siteId);
        const updatedFormData = {
            ...formData,
            sites: updatedSites,
            activityLog: [
                ...(Array.isArray(formData.activityLog) ? formData.activityLog : []),
                {
                    id: Date.now(),
                    type: 'Site Deleted',
                    description: `Deleted site: ${site?.name || 'Unknown'}`,
                    timestamp: new Date().toISOString(),
                    user: (window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {}).name || 'System',
                    userId: (window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {}).id || 'system',
                    userEmail: (window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {}).email || 'system',
                    relatedId: siteId
                }
            ]
        };
        setFormData(updatedFormData);
        isAutoSavingRef.current = true;
        handleTabChange('sites');

        try {
            if (leadId && siteId && (window.api?.deleteSite || window.DatabaseAPI?.makeRequest)) {
                if (window.api?.deleteSite) {
                    await window.api.deleteSite(leadId, siteId);
                } else {
                    await window.DatabaseAPI.makeRequest(`/sites/client/${leadId}/${siteId}`, { method: 'DELETE' });
                }
            }
            await onSave(updatedFormData, true);
        } catch (error) {
            console.error('❌ Error saving site deletion:', error);
            alert('Failed to delete site. Please try again.');
            setFormData(prevFormData);
        } finally {
            setTimeout(() => { isAutoSavingRef.current = false; }, 800);
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

    // Google Calendar event handlers

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
        let allUsers = [];
        try {
            if (window.DatabaseAPI?.getUsers) {
                const usersResponse = await window.DatabaseAPI.getUsers();
                allUsers = usersResponse?.data?.users || usersResponse?.data?.data?.users || [];
            }
        } catch (_) {}
        
        if (window.MentionHelper && window.MentionHelper.hasMentions(newComment) && allUsers.length) {
            try {
                const contextTitle = `Lead: ${formData.name || formData.companyName || 'Unknown Lead'}`;
                const contextLink = `#/leads/${formData.id}`;
                await window.MentionHelper.processMentions(
                    newComment,
                    contextTitle,
                    contextLink,
                    currentUser.name || currentUser.email || 'Unknown',
                    allUsers
                );
            } catch (error) {
                console.error('❌ Error processing @mentions:', error);
            }
        }
        
        const threadType = 'lead';
        const threadId = formData.id;
        if (threadId && window.DatabaseAPI?.makeRequest) {
            try {
                const mentionedEntries = (window.MentionHelper && window.MentionHelper.getMentionedUsernames(newComment)) || [];
                const mentionedIds = mentionedEntries
                    .map(({ normalized }) => {
                        const u = allUsers.find(a =>
                            (window.MentionHelper.normalizeIdentifier(a.name || '') === normalized) ||
                            (window.MentionHelper.normalizeIdentifier((a.email || '').split('@')[0]) === normalized)
                        );
                        return u?.id;
                    })
                    .filter(Boolean);
                const priorIds = (formData.comments || []).map(c => c.createdById || c.userId).filter(Boolean);
                const subscriberIds = [...new Set([currentUser.id, ...mentionedIds, ...priorIds])].filter(Boolean);
                await window.DatabaseAPI.makeRequest('/comment-subscriptions', {
                    method: 'POST',
                    body: JSON.stringify({ threadType, threadId, userIds: subscriberIds })
                });
                setIsCommentSubscribed(true);
                const contextLink = `#/leads/${formData.id}?tab=notes`;
                const toNotify = subscriberIds.filter(id => id !== currentUser.id && !mentionedIds.includes(id));
                for (const uid of toNotify) {
                    try {
                        await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: uid,
                                type: 'comment',
                                title: `New comment on lead: ${formData.name || formData.companyName || 'Unknown'}`,
                                message: `${currentUser.name} commented: "${newComment.substring(0, 80)}${newComment.length > 80 ? '...' : ''}"`,
                                link: contextLink,
                                metadata: {
                                    leadId: formData.id,
                                    commentAuthor: currentUser.name,
                                    commentText: newComment,
                                    tab: 'notes'
                                }
                            })
                        });
                    } catch (_) {}
                }
            } catch (err) {
                console.warn('Comment subscription/notify failed:', err?.message);
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
        formDataRef.current = updatedFormData;
        
        // Log to audit trail
        if (window.AuditLogger) {
            window.AuditLogger.log(
                'comment',
                'leads',
                {
                    action: 'Comment Added',
                    leadId: formData.id,
                    leadName: formData.name || formData.companyName,
                    commentPreview: newComment.substring(0, 50) + (newComment.length > 50 ? '...' : '')
                },
                currentUser
            );
        }
        
        // Log activity and get updated formData with activity log, then save everything
        const finalFormData = logActivity('Comment Added', `Added note: ${newComment.substring(0, 50)}${newComment.length > 50 ? '...' : ''}`, null, false, updatedFormData);
        
        // CRITICAL FIX: Await the save to ensure it completes before clearing form
        // This prevents navigation/reset from happening before the save completes
        isAutoSavingRef.current = true;
        try {
            // Await the save to ensure it completes
            if (onSave && typeof onSave === 'function') {
                await onSave(finalFormData, true); // true = stay in edit mode
            }
            
            // CRITICAL: After a successful save, ensure we remain on the notes tab
            // Use setTimeout to ensure this happens after any potential re-renders
            // Use handleTabChange to ensure it persists to localStorage
            setTimeout(() => {
                handleTabChange('notes');
            }, 0);
        } catch (error) {
            console.error('❌ Error saving comment:', error);
            alert('Failed to save comment. Please try again.');
        } finally {
            // Clear the flag after a delay to allow API response to propagate
            // This delay ensures any effects that check isAutoSavingRef won't reset the tab
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, 3000);
        }
        
        // Clear form fields only after successful save
        setNewComment('');
        setNewNoteTags([]);
        setNewNoteTagsInput('');
        setNewNoteAttachments([]);
        
    };

    const handleUnsubscribeFromComments = async () => {
        const threadId = formData?.id;
        if (!threadId || !window.DatabaseAPI?.makeRequest) return;
        try {
            await window.DatabaseAPI.makeRequest(`/comment-subscriptions?threadType=lead&threadId=${encodeURIComponent(threadId)}`, { method: 'DELETE' });
            setIsCommentSubscribed(false);
        } catch (e) {
            console.warn('Unsubscribe failed:', e?.message);
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
        if (autoSave && lead && onSave) {
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

    const handleDeleteComment = (commentId) => {
        if (confirm('Delete this comment?')) {
            const updatedFormData = {
                ...formData,
                comments: formData.comments.filter(c => c.id !== commentId)
            };
            setFormData(updatedFormData);
            
            // Save comment deletion immediately - stay in edit mode
            isAutoSavingRef.current = true;
            
            // Ensure we remain on the notes tab after save
            const savePromise = onSave && typeof onSave === 'function' 
                ? Promise.resolve(onSave(updatedFormData, true))
                : Promise.resolve();
            
            savePromise.then(() => {
                // After a successful save, ensure we remain on the notes tab
                setTimeout(() => {
                    handleTabChange('notes');
                }, 0);
            }).finally(() => {
                // Clear the flag after a delay to allow API response to propagate
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, 3000);
            });
            
        }
    };


    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.name || formData.name.trim() === '') {
            alert('Please enter an Entity Name');
            return;
        }
        
        setIsSaving(true);
        try {
            // CRITICAL: Always read notes from textarea ref to ensure we have the latest value
            // This fixes the issue where notes typed in the textarea might not be saved on PC
            const latestNotes = notesTextareaRef.current?.value || formData.notes || '';
            
            const leadData = {
                ...formData,
                notes: latestNotes, // Always use the latest notes from textarea
                projectIds: selectedProjectIds,
                // CRITICAL: Explicitly include followUps and comments to ensure they're saved
                followUps: formData.followUps || [],
                comments: formData.comments || [],
                // Explicitly include externalAgentId to ensure it's saved (even if null)
                // Convert empty strings to null for consistency
                externalAgentId: formData.externalAgentId !== undefined && formData.externalAgentId !== '' 
                    ? formData.externalAgentId 
                    : null,
                // Only update lastContact if it's not already set or if user explicitly changed it
                // Don't overwrite with today's date on every save
                lastContact: formData.lastContact || new Date().toISOString().split('T')[0]
            };
            
            // Use onSave prop if provided, otherwise fall back to direct API calls
            if (onSave && typeof onSave === 'function') {
                await onSave(leadData, false); // false = don't stay in edit mode after save
                setHasBeenSaved(true); // Mark as saved after successful save
            } else {
                // Fallback to direct API calls if onSave is not provided
                if (leadId) {
                    await window.api.updateLead(leadId, leadData);
                } else {
                    const apiResponse = await window.api.createLead(leadData);
                    const savedLead = apiResponse?.data?.lead || apiResponse?.lead || apiResponse;
                    if (savedLead && savedLead.id) {
                        setLead(savedLead);
                        setFormData(prev => ({ ...prev, id: savedLead.id }));
                    }
                }
                setHasBeenSaved(true);
                onClose();
            }
        } catch (error) {
            console.error('Error saving lead:', error);
            alert('Error saving lead: ' + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const upcomingFollowUps = (Array.isArray(formData.followUps) ? formData.followUps : [])
        .filter(f => !f.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const getStageColor = (stage) => {
        switch(stage) {
            case 'No Engagement': return 'bg-slate-100 text-slate-800';
            case 'Awareness': return 'bg-blue-100 text-blue-800';
            case 'Interest': return 'bg-purple-100 text-purple-800';
            case 'Desire': return 'bg-yellow-100 text-yellow-800';
            case 'Action': return 'bg-green-100 text-green-800';
            case 'Closed Won': return 'bg-emerald-100 text-emerald-800';
            case 'Closed Lost': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    // Show loading state
    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-spinner fa-spin text-2xl text-primary-600"></i>
                        <span className="text-gray-800">Loading lead data...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Show loading state
    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg p-8">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-spinner fa-spin text-2xl text-primary-600"></i>
                        <span>Loading lead data...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Navigation helper function
    const navigateToPage = (page) => {
        // If navigating to clients page, reset the Clients component view first
        if (page === 'clients') {
            // Dispatch event to reset Clients component view
            if (window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('resetClientsView', { 
                    detail: { viewMode: 'clients' } 
                }));
            }
        }
        
        // Navigate using RouteState
        if (window.RouteState && window.RouteState.navigate) {
            window.RouteState.navigate({
                page: page,
                segments: [],
                search: '',
                hash: '',
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        } else if (window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent('navigateToPage', { 
                detail: { page: page } 
            }));
        }
        
        // Close modal when navigating away
        if (onClose) {
            onClose();
        }
    };

    if (isFullPage) {
        // Full-page view - no modal wrapper
        return (
            <>
            <div className="w-full h-full flex flex-col">
                {/* Breadcrumb Navigation */}
                <div className={`px-6 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <nav className="flex items-center space-x-2 text-sm">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (onClose) {
                                    onClose();
                                }
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 mr-2`}
                            title="Go back"
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <button
                            onClick={() => navigateToPage('dashboard')}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
                        >
                            <i className="fas fa-home mr-1"></i>
                            Dashboard
                        </button>
                        <i className={`fas fa-chevron-right ${isDark ? 'text-gray-600' : 'text-gray-400'}`}></i>
                        <button
                            onClick={() => {
                                // Switch to leads view
                                if (window.dispatchEvent) {
                                    window.dispatchEvent(new CustomEvent('resetClientsView', { 
                                        detail: { viewMode: 'leads' } 
                                    }));
                                }
                                if (onClose) {
                                    onClose();
                                }
                            }}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
                        >
                            Leads
                        </button>
                        {lead && (
                            <>
                                <i className={`fas fa-chevron-right ${isDark ? 'text-gray-600' : 'text-gray-400'}`}></i>
                                <span className={`${isDark ? 'text-gray-300' : 'text-gray-900'} font-medium`}>
                                    {formData.name}
                                </span>
                            </>
                        )}
                    </nav>
                </div>
                {/* Header */}
                <div className={`flex justify-between items-center px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className={`text-xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {lead ? formData.name : 'Add New Lead'}
                            </h2>
                            {isAutoSaving && (
                                <span className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <i className="fas fa-spinner fa-spin"></i>
                                    Saving...
                                </span>
                            )}
                        </div>
                        {lead && (
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{formData.industry}</span>
                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${getStageColor(formData.stage)}`}>
                                    {formData.stage}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Quick Navigation Menu */}
                        <div className="relative group">
                            <button
                                className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'} p-2 rounded transition-colors`}
                                title="Navigate to other pages"
                            >
                                <i className="fas fa-compass text-lg"></i>
                            </button>
                            <div className={`absolute right-0 top-full mt-1 w-48 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200`}>
                                <div className="py-1">
                                    <button
                                        onClick={() => navigateToPage('dashboard')}
                                        className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                    >
                                        <i className="fas fa-home mr-2"></i>
                                        Dashboard
                                    </button>
                                    <button
                                        onClick={() => navigateToPage('projects')}
                                        className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                    >
                                        <i className="fas fa-folder-open mr-2"></i>
                                        Projects
                                    </button>
                                    <button
                                        onClick={() => navigateToPage('tasks')}
                                        className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                    >
                                        <i className="fas fa-tasks mr-2"></i>
                                        Tasks
                                    </button>
                                    <button
                                        onClick={() => navigateToPage('clients')}
                                        className={`w-full text-left px-4 py-2 text-sm ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'} transition-colors`}
                                    >
                                        <i className="fas fa-user-plus mr-2"></i>
                                        Leads
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} p-2 rounded transition-colors`}
                        >
                            <i className="fas fa-times text-lg"></i>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 px-3 sm:px-6">
                    <div className="flex flex-wrap gap-2 sm:gap-6">
                        {['overview', 'contacts', 'sites', 'calendar', ...(isAdmin ? ['proposals'] : []), 'activity', 'notes'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => handleTabChange(tab)}
                                className={`py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 min-w-fit ${
                                    activeTab === tab
                                        ? 'border-primary-600 text-primary-600'
                                        : 'border-transparent text-gray-600 hover:text-gray-900'
                                }`}
                                style={{ minWidth: 'max-content' }}
                            >
                                <i className={`fas fa-${
                                    tab === 'overview' ? 'info-circle' :
                                    tab === 'contacts' ? 'users' :
                                    tab === 'sites' ? 'map-marker-alt' :
                                    tab === 'calendar' ? 'calendar-alt' :
                                    tab === 'proposals' ? 'file-contract' :
                                    tab === 'activity' ? 'history' :
                                    tab === 'notes' ? 'sticky-note' :
                                    'info-circle'
                                } mr-2`}></i>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                {tab === 'contacts' && Array.isArray(formData.contacts) && formData.contacts.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.contacts.length}
                                    </span>
                                )}
                                {tab === 'sites' && formData.sites?.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.sites.length}
                                    </span>
                                )}
                                {tab === 'proposals' && Array.isArray(formData.proposals) && formData.proposals.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.proposals.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div ref={contentScrollableRef} className="flex-1 overflow-y-auto p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            Entity Name *
                                        </label>
                                        <input 
                                            type="text" 
                                            ref={nameInputRef}
                                            value={formData.name || ''}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true, isAutoSavingRef.current);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('name'); // Track that user has edited this field
                                                notifyEditingChange(true); // Only notify if state changed
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false); // Only notify if state changed
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing
                                                setFormData(prev => {
                                                    const updated = {...prev, name: e.target.value};
                                                    // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={() => {
                                                // Clear editing flag after a delay to allow for final keystrokes
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false, isAutoSavingRef.current);
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                                        <div className="flex gap-2">
                                        <select
                                            ref={industrySelectRef}
                                            value={formData.industry || ''}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('industry'); // Track that user has edited this field
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
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
                                                    notifyEditingChange(false);
                                                }, 500);
                                            }}
                                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    
                                                    // Prevent multiple rapid clicks
                                                    if (isOpeningIndustryModalRef.current || showIndustryModal) {
                                                        return;
                                                    }
                                                    
                                                    isOpeningIndustryModalRef.current = true;
                                                    setShowIndustryModal(true);
                                                }}
                                                className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100 cursor-pointer"
                                                title={isAdmin ? "Manage Industries" : "Admin Only - Manage Industries"}
                                                style={{ opacity: isAdmin ? 1 : 0.5 }}
                                            >
                                                <i className="fas fa-cog"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">First Contact Date</label>
                                        <input 
                                            type="date" 
                                            value={formData.firstContactDate || new Date().toISOString().split('T')[0]}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                isEditingRef.current = true;
                                                userEditedFieldsRef.current.add('firstContactDate'); // Track that user has edited this field
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing
                                                setFormData(prev => ({...prev, firstContactDate: e.target.value}));
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
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                                        <input 
                                            type="url" 
                                            value={formData.website || ''}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('website'); // Track that user has edited this field
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
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
                                                    notifyEditingChange(false);
                                                }, 500);
                                            }}
                                            placeholder="https://example.com"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Source</label>
                                        <select 
                                            ref={sourceSelectRef}
                                            value={formData.source || 'Website'}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('source'); // Track that user has edited this field
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000); // Clear editing flag 5 seconds after user stops typing
                                                setFormData(prev => {
                                                    const updated = {...prev, source: e.target.value};
                                                    // CRITICAL: Sync formDataRef IMMEDIATELY so guards can check current value
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option>Website</option>
                                            <option>Referral</option>
                                            <option>LinkedIn</option>
                                            <option>Cold Outreach</option>
                                            <option>Advertisement</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                    <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    AIDA STAGE
                </label>
                                        <select 
                                            value={formData.stage}
                                            onChange={async (e) => {
                                                const newStage = e.target.value;
                                            
                                            // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                            // This prevents LiveDataSync from overwriting during the delay
                                            isAutoSavingRef.current = true;
                                            notifyEditingChange(false, true);
                                            
                                                
                                                // Update state and get the updated formData
                                                setFormData(prev => {
                                                    const updated = {...prev, stage: newStage};
                                                    
                                                    // Auto-save immediately with the updated data
                                                    // CRITICAL: Only auto-save for existing leads, NOT for new leads that haven't been saved yet
                                                    if (lead && !isNewLeadNotSavedRef.current && onSave) {
                                                        console.log('💾 Auto-saving stage change:', {
                                                            leadId: lead.id,
                                                            oldStage: formDataRef.current?.stage,
                                                            newStage: newStage
                                                        });
                                                        
                                                        // Use setTimeout to ensure state is updated
                                                        setTimeout(async () => {
                                                            try {
                                                                // Get the latest formData from ref (updated by useEffect)
                                                        const latest = {...formDataRef.current, stage: newStage};
                                                                
                                                                // Explicitly ensure stage is included
                                                                latest.stage = newStage;
                                                        
                                                                console.log('💾 Sending stage to onSave:', {
                                                                    leadId: latest.id,
                                                                    status: latest.status,
                                                                    stage: latest.stage
                                                                });
                                                        
                                                        // Save this as the last saved state
                                                        lastSavedDataRef.current = latest;
                                                        
                                                                // Save to API - ensure it's awaited
                                                                await onSave(latest, true);
                                                                
                                                                console.log('✅ Stage auto-save completed');
                                                        
                                            // Clear the flag and notify parent after save completes
                                                        setTimeout(() => {
                                                            isAutoSavingRef.current = false;
                                                notifyEditingChange(false, false);
                                                        }, 3000);
                                                            } catch (error) {
                                                                console.error('❌ Error saving stage:', error);
                                                                isAutoSavingRef.current = false;
                                                        notifyEditingChange(false, false);
                                                                alert('Failed to save stage change. Please try again.');
                                                }
                                                        }, 100); // Small delay to ensure state update is processed
                                                    }
                                                    
                                                    return updated;
                                                });
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="No Engagement">No Engagement - No response yet</option>
                                            <option value="Awareness">Awareness - Lead knows about us</option>
                                            <option value="Interest">Interest - Lead shows engagement</option>
                                            <option value="Desire">Desire - Lead wants our solution</option>
                                            <option value="Action">Action - Ready to purchase</option>
                                            <option value="Closed Won">Closed Won - Deal completed</option>
                                            <option value="Closed Lost">Closed Lost - Deal lost</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="block text-sm font-medium text-gray-700">External Agent</label>
                                            {isAdmin && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setShowManageExternalAgentsModal(true);
                                                        }}
                                                        className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors flex items-center gap-1"
                                                        title="Manage External Agents (Admin Only)"
                                                    >
                                                        <i className="fas fa-cog text-xs"></i>
                                                        <span>Manage</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setShowExternalAgentModal(true);
                                                        }}
                                                        className="text-xs px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors flex items-center gap-1"
                                                        title="Add New External Agent (Admin Only)"
                                                    >
                                                        <i className="fas fa-plus text-xs"></i>
                                                        <span>Add New</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <select 
                                            value={formData.externalAgentId || ''}
                                            onFocus={() => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            }}
                                            onChange={(e) => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('externalAgentId');
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000);
                                                const selectedValue = e.target.value || null;
                                                const selectedAgent = externalAgents.find(a => a.id === selectedValue);
                                                console.log('🔵 External agent selected:', {
                                                    value: selectedValue,
                                                    agent: selectedAgent ? selectedAgent.name : 'none',
                                                    allAgents: externalAgents.map(a => ({ id: a.id, name: a.name }))
                                                });
                                                setFormData(prev => {
                                                    const updated = {...prev, externalAgentId: selectedValue};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            }}
                                            onBlur={() => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 500);
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="">Select External Agent</option>
                                            {externalAgents.map((agent) => (
                                                <option key={agent.id} value={agent.id}>
                                                    {agent.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                                    <textarea 
                                        ref={notesTextareaRef}
                                        value={formData.notes}
                                        onFocus={() => {
                                            isEditingRef.current = true;
                                            userHasStartedTypingRef.current = true;
                                            notifyEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                        }}
                                        onChange={(e) => {
                                            // Skip if spacebar was just pressed (handled in onKeyDown)
                                            if (isSpacebarPressedRef.current) {
                                                isSpacebarPressedRef.current = false;
                                                return; // Skip - onKeyDown already updated formData
                                            }
                                            
                                            isEditingRef.current = true;
                                            userHasStartedTypingRef.current = true;
                                            userEditedFieldsRef.current.add('notes');
                                            notifyEditingChange(true);
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                                notifyEditingChange(false);
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
                                            // CRITICAL: Only auto-save for existing leads, NOT for new leads that haven't been saved yet
                                            if (lead && !isNewLeadNotSavedRef.current) {
                                        // Mark as auto-saving to prevent useEffect from resetting
                                        isAutoSavingRef.current = true;
                                        notifyEditingChange(false, true); // Notify parent auto-save started
                                        
                                                // Get latest formData including the notes value from the textarea
                                        const latestNotes = e.target.value;
                                                setFormData(prev => {
                                        const latest = {...prev, notes: latestNotes};
                                                    // Update ref immediately
                                                    formDataRef.current = latest;
                                                    return latest;
                                                });
                                        
                                        // Update ref immediately with notes
                                        const currentFormData = formDataRef.current || {};
                                        const latest = {...currentFormData, notes: latestNotes};
                                        formDataRef.current = latest;
                                        
                                        // Save the latest data after a small delay to ensure state is updated
                                        setTimeout(() => {
                                        onSave(latest, true).finally(() => {
                                        // Clear auto-saving flag after save completes
                                            isAutoSavingRef.current = false;
                                                notifyEditingChange(false, false); // Notify parent auto-save complete
                                                });
                                                }, 100);
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="3"
                                        placeholder="General information about this lead..."
                                    ></textarea>
                                </div>

                                {/* Go Back Button */}
                                <div className="mt-4">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (onClose) {
                                                onClose();
                                            }
                                        }}
                                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                                            isDark 
                                                ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                    >
                                        <i className="fas fa-arrow-left"></i>
                                        Go back
                                    </button>
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
                                                Receive daily news articles about this lead automatically
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
                                                        const updated = {...formData, rssSubscribed: newSubscriptionStatus};
                                                        setFormData(updated);
                                                        formDataRef.current = updated;
                                                        alert(newSubscriptionStatus ? 'Subscribed to news feed' : 'Unsubscribed from news feed');
                                                        // Auto-save
                                                        if (lead) {
                                                            onSave(updated, true);
                                                        }
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

                                {/* Delete Lead Section */}
                                {lead && onDelete && (
                                    <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                                    Danger Zone
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Once you delete a lead, there is no going back. Please be certain.
                                                </p>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    if (confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
                                                        onDelete(lead.id);
                                                        onClose();
                                                    }
                                                }}
                                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                                Delete Lead
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
                                    <button
                                        type="button"
                                        onClick={() => setShowContactForm(!showContactForm)}
                                        className="bg-primary-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-primary-700 flex items-center"
                                    >
                                        <i className="fas fa-plus mr-1.5"></i>
                                        Add Contact
                                    </button>
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
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                                                <input
                                                    type="text"
                                                    value={newContact.role}
                                                    onChange={(e) => setNewContact({...newContact, role: e.target.value})}
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
                                                    placeholder="e.g., Operations, Finance"
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                                                <input
                                                    type="email"
                                                    value={newContact.email}
                                                    onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                                                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                                                <input
                                                    type="tel"
                                                    value={newContact.phone}
                                                    onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
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
                                    {(!Array.isArray(formData.contacts) || formData.contacts.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-users text-3xl mb-2"></i>
                                            <p>No contacts added yet</p>
                                        </div>
                                    ) : (
                                        (Array.isArray(formData.contacts) ? formData.contacts : []).map(contact => (
                                            <div key={contact.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm">{contact.name}</h4>
                                                            {contact.isPrimary && (
                                                                <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded font-medium">
                                                                    Primary
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
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
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Sites Tab */}
                        {activeTab === 'sites' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Sites & Locations</h3>
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
                                    <div className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'} rounded-lg p-4 border`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowSiteForm(false);
                                                    setEditingSite(null);
                                                    setNewSite({ name: '', address: '', contactPerson: '', phone: '', email: '', notes: '', latitude: '', longitude: '', gpsCoordinates: '', stage: 'Potential', aidaStatus: 'Awareness' });
                                                }}
                                                className={`text-sm flex items-center gap-1.5 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}
                                            >
                                                <i className="fas fa-arrow-left"></i>
                                                Back to list
                                            </button>
                                            <h4 className={`font-medium text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                                {editingSite ? 'Edit Site' : 'New Site'}
                                            </h4>
                                            <span className="w-20" aria-hidden="true" />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Site Name *</label>
                                                <input
                                                    type="text"
                                                    value={newSite.name}
                                                    onChange={(e) => setNewSite({...newSite, name: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                    placeholder="e.g., Main Mine, North Farm"
                                                />
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Site Contact</label>
                                                <input
                                                    type="text"
                                                    value={newSite.contactPerson}
                                                    onChange={(e) => setNewSite({...newSite, contactPerson: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="Contact person name"
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Address</label>
                                                <textarea
                                                    value={newSite.address}
                                                    onChange={(e) => setNewSite({...newSite, address: e.target.value})}
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                    rows="2"
                                                    placeholder="Full site address"
                                                ></textarea>
                                            </div>
                                            
                                            {/* GPS Coordinates Section */}
                                            <div className="col-span-2">
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>GPS Coordinates</label>
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
                                                        className={`flex-1 px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
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
                                                        className={`flex-1 px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
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
                                                        className={`flex-1 px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                        placeholder="Longitude (-180 to 180)"
                                                    />
                                                </div>
                                            </div>
                                            
                                            {/* Map Selection */}
                                            {window.MapComponent && (
                                                <div className="col-span-2">
                                                    <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Location Map</label>
                                                    <window.MapComponent
                                                        latitude={newSite.latitude}
                                                        longitude={newSite.longitude}
                                                        siteName={newSite.name || 'Site Location'}
                                                        allowSelection={true}
                                                        onLocationSelect={handleSiteMapLocationSelect}
                                                    />
                                                    <div className={`mt-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                        💡 <strong>Tip:</strong> Click anywhere on the map to drop a pin and automatically fill in the GPS fields, or use the buttons above to pull your current location or open OpenStreetMap.
                                                    </div>
                                                </div>
                                            )}
                                            <div>
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Phone</label>
                                                <input
                                                    type="tel"
                                                    value={newSite.phone}
                                                    onChange={(e) => setNewSite({...newSite, phone: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="+27 11 123 4567"
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                />
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
                                                <input
                                                    type="email"
                                                    value={newSite.email}
                                                    onChange={(e) => setNewSite({...newSite, email: e.target.value})}
                                                    onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                                                    placeholder="site@company.com"
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Notes</label>
                                                <textarea
                                                    value={newSite.notes}
                                                    onChange={(e) => setNewSite({...newSite, notes: e.target.value})}
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                    rows="2"
                                                    placeholder="Equipment deployed, special instructions, etc."
                                                ></textarea>
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Stage</label>
                                                <select
                                                    value={newSite.stage ?? 'Potential'}
                                                    onChange={(e) => setNewSite({...newSite, stage: e.target.value})}
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                >
                                                    <option value="Potential">Potential</option>
                                                    <option value="Active">Active</option>
                                                    <option value="Inactive">Inactive</option>
                                                    <option value="On Hold">On Hold</option>
                                                    <option value="Disinterested">Disinterested</option>
                                                    <option value="Proposal">Proposal</option>
                                                    <option value="Tender">Tender</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>AIDA Status</label>
                                                <select
                                                    value={newSite.aidaStatus ?? 'Awareness'}
                                                    onChange={(e) => setNewSite({...newSite, aidaStatus: e.target.value})}
                                                    className={`w-full px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'border-gray-300'}`}
                                                >
                                                    <option value="No Engagement">No Engagement</option>
                                                    <option value="Awareness">Awareness</option>
                                                    <option value="Interest">Interest</option>
                                                    <option value="Desire">Desire</option>
                                                    <option value="Action">Action</option>
                                                </select>
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
                                                        gpsCoordinates: '',
                                                        stage: 'Potential',
                                                        aidaStatus: 'Awareness'
                                                    });
                                                }}
                                                className={`px-3 py-1.5 text-sm border rounded-lg ${isDark ? 'border-gray-500 hover:bg-gray-600 text-gray-100' : 'border-gray-300 hover:bg-gray-50'}`}
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

                                {!showSiteForm && (
                                <div className={`overflow-x-auto rounded-lg border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                                    {(() => {
                                        const formSites = formData.sites || [];
                                        const optimistic = optimisticSites || [];
                                        const siteMap = new Map();
                                        formSites.forEach(site => { if (site?.id) siteMap.set(site.id, site); });
                                        optimistic.forEach(site => { if (site?.id) siteMap.set(site.id, site); });
                                        const allSites = Array.from(siteMap.values());
                                        if (allSites.length === 0) {
                                            return (
                                                <div className={`text-center py-8 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                                    <i className="fas fa-map-marker-alt text-3xl mb-2"></i>
                                                    <p>No sites added yet</p>
                                                </div>
                                            );
                                        }
                                        return (
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                                                    <tr>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Name</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Address</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Stage</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-left text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>AIDA Status</th>
                                                        <th scope="col" className={`px-4 py-2.5 text-right text-xs font-medium uppercase ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={`divide-y ${isDark ? 'divide-gray-600' : 'divide-gray-200'}`}>
                                                    {allSites.map(site => (
                                                        <tr
                                                            key={site.id}
                                                            onClick={() => handleEditSite(site)}
                                                            className={`cursor-pointer transition-colors ${isDark ? 'hover:bg-gray-600/50' : 'hover:bg-primary-50/50'}`}
                                                        >
                                                            <td className={`px-4 py-3 text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{site.name || '—'}</td>
                                                            <td className={`px-4 py-3 text-sm max-w-xs truncate ${isDark ? 'text-gray-300' : 'text-gray-600'}`} title={site.address}>{site.address || '—'}</td>
                                                            <td className={`px-4 py-3 text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{site.stage || '—'}</td>
                                                            <td className="px-4 py-3">
                                                                {site.aidaStatus ? (
                                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                                                        site.aidaStatus === 'Action' ? 'bg-green-100 text-green-800' :
                                                                        site.aidaStatus === 'Desire' ? 'bg-amber-100 text-amber-800' :
                                                                        site.aidaStatus === 'Interest' ? 'bg-yellow-100 text-yellow-800' :
                                                                        site.aidaStatus === 'No Engagement' ? 'bg-slate-100 text-slate-800' :
                                                                        'bg-blue-100 text-blue-800'
                                                                    }`}>{site.aidaStatus}</span>
                                                                ) : (
                                                                    <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>—</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                                <div className="flex justify-end gap-1">
                                                                    <button type="button" onClick={() => handleEditSite(site)} className="text-primary-600 hover:text-primary-700 p-2 hover:bg-primary-50 rounded-lg transition-colors" title="Edit Site"><i className="fas fa-edit"></i></button>
                                                                    <button type="button" onClick={() => handleDeleteSite(site.id)} className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Delete Site"><i className="fas fa-trash"></i></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        );
                                    })()}
                                </div>
                                )}
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

                        {/* Notes/Comments Tab */}
                        {activeTab === 'notes' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center flex-wrap gap-2">
                                    <h3 className="text-lg font-semibold text-gray-900">Notes & Comments</h3>
                                    {isCommentSubscribed && (
                                        <button
                                            type="button"
                                            onClick={handleUnsubscribeFromComments}
                                            className="text-xs text-primary-600 hover:text-primary-700 hover:underline"
                                            title="Stop receiving notifications for new comments"
                                        >
                                            Unsubscribe from notifications
                                        </button>
                                    )}
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
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleAddComment().catch(err => {
                                                    console.error('Error adding comment:', err);
                                                });
                                            }}
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

                        {/* Proposals Tab */}
                        {activeTab === 'proposals' && isAdmin && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Proposals</h3>
                                    <button
                                        type="button"
                                        disabled={isCreatingProposal || isCreatingProposalRef.current}
                                        onClick={async () => {
                                            // Use ref check for immediate guard (before state updates)
                                            if (isCreatingProposalRef.current || isCreatingProposal) {
                                                console.warn('⚠️ Proposal creation already in progress, ignoring click');
                                                return;
                                            }
                                            
                                            // Set both ref (immediate) and state (for UI)
                                            isCreatingProposalRef.current = true;
                                            setIsCreatingProposal(true);
                                            
                                            
                                            // Generate a stable ID that won't change on re-renders
                                            const proposalId = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                                            
                                            const newProposal = {
                                                id: proposalId,
                                                title: `Proposal for ${formData.name}`,
                                                name: `Proposal for ${formData.name}`,
                                                createdDate: new Date().toISOString().split('T')[0],
                                                workflowStage: 'create-site-inspection',
                                                workingDocumentLink: '',
                                                stages: [
                                                    { 
                                                        name: 'Create Site Inspection Document', 
                                                        department: 'Business Development',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Conduct site visit input data to Site Inspection Document', 
                                                        department: 'Technical',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Comments on work loading requirements', 
                                                        department: 'Data',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Comments on time allocations', 
                                                        department: 'Support',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Relevant comments time allocations', 
                                                        department: 'Compliance',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Creates proposal from template add client information', 
                                                        department: 'Business Development',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Reviews proposal against Site Inspection comments', 
                                                        department: 'Operations Manager',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Price proposal', 
                                                        department: 'Commercial',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    },
                                                    { 
                                                        name: 'Final Approval', 
                                                        department: 'CEO',
                                                        assignee: '',
                                                        assigneeId: '',
                                                        assigneeEmail: '',
                                                        status: 'pending',
                                                        comments: [],
                                                        rejectedBy: null,
                                                        rejectedAt: null,
                                                        rejectedReason: ''
                                                    }
                                                ],
                                                proposalContent: '',
                                                siteInspectionData: '',
                                                pricing: {
                                                    subtotal: 0,
                                                    tax: 0,
                                                    total: 0
                                                }
                                            };
                                            
                                            // Check if proposal already exists (prevent duplicates)
                                            // Use functional update pattern to get latest proposals
                                            const checkProposals = () => {
                                                // Use formDataRef for most up-to-date data
                                                const refData = formDataRef.current;
                                                const stateData = formData;
                                                const lastSavedData = lastSavedDataRef.current;
                                                
                                                // Get proposals from all sources (including last saved)
                                                const refProposals = refData?.proposals || [];
                                                const stateProposals = stateData?.proposals || [];
                                                const lastSavedProposals = lastSavedData?.proposals || [];
                                                
                                                // Merge them by ID (ref takes precedence, then lastSaved, then state)
                                                const allProposalsMap = new Map();
                                                
                                                // Add state proposals first
                                                stateProposals.forEach(p => {
                                                    if (p.id) allProposalsMap.set(p.id, p);
                                                });
                                                
                                                // Add lastSaved proposals (overwrites state if same ID)
                                                lastSavedProposals.forEach(p => {
                                                    if (p.id) allProposalsMap.set(p.id, p);
                                                });
                                                
                                                // Add ref proposals last (highest priority - overwrites all)
                                                refProposals.forEach(p => {
                                                    if (p.id) allProposalsMap.set(p.id, p);
                                                });
                                                
                                                return Array.from(allProposalsMap.values());
                                            };
                                            
                                            const existingProposals = checkProposals();
                                            
                                            
                                            // Check by ID first (most reliable) - this should always be unique
                                            const proposalExistsById = existingProposals.some(p => p.id === proposalId);
                                            
                                            // Only check by title if we're creating within the same second (very rare but possible)
                                            // Removed the date check since proposals created on the same day should be allowed
                                            const recentProposals = existingProposals.filter(p => {
                                                if (!p.id) return false;
                                                // Check if proposal ID was created in the last 2 seconds
                                                const pTimestamp = parseInt(p.id.split('-')[1]);
                                                const currentTimestamp = Date.now();
                                                return Math.abs(currentTimestamp - pTimestamp) < 2000;
                                            });
                                            
                                            const proposalExistsByTitle = recentProposals.some(p => 
                                                p.title === newProposal.title
                                            );
                                            
                                            if (proposalExistsById) {
                                                console.warn('⚠️ Proposal with same ID already exists, skipping creation', {
                                                    proposalId,
                                                    existingProposal: existingProposals.find(p => p.id === proposalId)
                                                });
                                                isCreatingProposalRef.current = false;
                                                setIsCreatingProposal(false);
                                                return;
                                            }
                                            
                                            // Only block if we have a very recent proposal with the same title (within 2 seconds)
                                            if (proposalExistsByTitle && recentProposals.length > 0) {
                                                console.warn('⚠️ Very recent proposal with same title exists, skipping creation', {
                                                    recentProposals: recentProposals.map(p => ({ id: p.id, title: p.title }))
                                                });
                                                isCreatingProposalRef.current = false;
                                                setIsCreatingProposal(false);
                                                return;
                                            }
                                            
                                            
                                            // Use functional update to merge with existing proposals properly
                                            const updatedProposals = [...existingProposals, newProposal];
                                            await saveProposals(updatedProposals);
                                            
                                            // Notify all assigned parties of the new proposal
                                            await notifyAllAssignedParties(
                                                newProposal,
                                                `New Proposal Created: ${newProposal.title || newProposal.name}`,
                                                `A new proposal "${newProposal.title || newProposal.name}" has been created for ${formData.name || 'this lead'}.`,
                                                `#/clients?lead=${lead.id}&tab=proposals`,
                                                {
                                                    proposalId: newProposal.id,
                                                    leadId: lead.id
                                                }
                                            );
                                            
                                            // Reset flags after a delay (longer to ensure save completes)
                                            setTimeout(() => {
                                                isCreatingProposalRef.current = false;
                                                setIsCreatingProposal(false);
                                            }, 2000);
                                        }}
                                        className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                                            (isCreatingProposal || isCreatingProposalRef.current)
                                                ? 'bg-gray-400 text-white cursor-not-allowed' 
                                                : 'bg-primary-600 text-white hover:bg-primary-700'
                                        }`}
                                    >
                                        <i className="fas fa-plus mr-2"></i>
                                        {(isCreatingProposal || isCreatingProposalRef.current) ? 'Creating...' : 'Create New Proposal'}
                                    </button>
                                </div>

                                {(!Array.isArray(formData.proposals) || formData.proposals.length === 0) ? (
                                    <div className="text-center py-12 text-gray-500">
                                        <i className="fas fa-file-contract text-4xl mb-3"></i>
                                        <p className="text-sm">No proposals created yet</p>
                                        <p className="text-xs mt-1">Click "Create New Proposal" to start the approval workflow</p>
                                        {/* Debug info */}
                                        {process.env.NODE_ENV === 'development' && (
                                            <div className="mt-4 text-xs text-gray-400">
                                                <p>Debug: proposals = {JSON.stringify(formData.proposals)}</p>
                                                <p>formDataRef proposals count: {formDataRef.current?.proposals?.length || 0}</p>
                                                <button 
                                                    onClick={() => {
                                                    }}
                                                    className="mt-2 px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs"
                                                >
                                                    Debug Proposals
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {formData.proposals.map((proposal, proposalIndex) => {
                                            const currentUser = window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {};
                                            const currentUserId = currentUser.id || currentUser.sub;
                                            
                                            return (
                                            <div key={proposal.id} className="bg-white border border-gray-200 rounded-lg p-5">
                                                <div className="flex justify-between items-start mb-4">
                                                        <div className="flex-1">
                                                            {editingProposalName === proposal.id ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={proposalNameInput}
                                                                        onChange={(e) => setProposalNameInput(e.target.value)}
                                                                        onBlur={async () => {
                                                                            if (proposalNameInput.trim() && proposalNameInput.trim() !== (proposal.title || proposal.name)) {
                                                                                const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                    idx === proposalIndex ? { ...p, title: proposalNameInput.trim(), name: proposalNameInput.trim() } : p
                                                                                );
                                                                                const updatedProposal = updatedProposals[proposalIndex];
                                                                                await saveProposals(updatedProposals);
                                                                                
                                                                                // Notify all assigned parties of the name change
                                                                                await notifyAllAssignedParties(
                                                                                    updatedProposal,
                                                                                    `Proposal Updated: ${updatedProposal.title || updatedProposal.name}`,
                                                                                    `Proposal name has been changed to "${updatedProposal.title || updatedProposal.name}" by ${currentUser.name || currentUser.email || 'Unknown'}.`,
                                                                                    `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                    {
                                                                                        proposalId: updatedProposal.id,
                                                                                        leadId: lead.id
                                                                                    }
                                                                                );
                                                                            }
                                                                            setEditingProposalName(null);
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                e.target.blur();
                                                                            }
                                                                            if (e.key === 'Escape') {
                                                                                setEditingProposalName(null);
                                                                                setProposalNameInput(proposal.title || proposal.name || '');
                                                                            }
                                                                        }}
                                                                        autoFocus
                                                                        className="text-lg font-semibold text-gray-900 border-b-2 border-primary-500 px-2 py-1"
                                                                    />
                                                                </div>
                                                            ) : (
                                                    <div>
                                                                    <h4 
                                                                        className="font-semibold text-gray-900 cursor-pointer hover:text-primary-600"
                                                                        onClick={() => {
                                                                            setEditingProposalName(proposal.id);
                                                                            setProposalNameInput(proposal.title || proposal.name || '');
                                                                        }}
                                                                        title="Click to edit name"
                                                                    >
                                                                        {proposal.title || proposal.name || 'Untitled Proposal'}
                                                                        <i className="fas fa-edit ml-2 text-xs text-gray-400"></i>
                                                                    </h4>
                                                        <div className="text-sm text-gray-600 mt-1">
                                                            <i className="fas fa-calendar mr-1"></i>
                                                            Created: {new Date(proposal.createdDate).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {/* Working Document Link */}
                                                            <div className="mt-3">
                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Working Document Link</label>
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="text"
                                                                        value={formData.proposals[proposalIndex]?.workingDocumentLink || ''}
                                                                        onChange={(e) => {
                                                                            const newLink = e.target.value;
                                                                            const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                idx === proposalIndex ? { ...p, workingDocumentLink: newLink } : p
                                                                            );
                                                                            setFormData(prev => ({ ...prev, proposals: updatedProposals }));
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                const saveButton = e.target.nextElementSibling;
                                                                                if (saveButton) saveButton.click();
                                                                            }
                                                                        }}
                                                                        placeholder="https://..."
                                                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={async () => {
                                                                            const currentProposal = formData.proposals[proposalIndex];
                                                                            const oldLink = (proposal.workingDocumentLink || '').trim();
                                                                            const newLink = (currentProposal?.workingDocumentLink || '').trim();
                                                                            
                                                                            if (oldLink !== newLink) {
                                                                                const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                    idx === proposalIndex ? { ...p, workingDocumentLink: newLink } : p
                                                                                );
                                                                                const updatedProposal = updatedProposals[proposalIndex];
                                                                                
                                                                                await saveProposals(updatedProposals);
                                                                                
                                                                                // Notify all assigned parties of the document link change
                                                                                await notifyAllAssignedParties(
                                                                                    updatedProposal,
                                                                                    `Proposal Updated: ${updatedProposal.title || updatedProposal.name}`,
                                                                                    `Working document link has been ${newLink ? `updated to: ${newLink}` : 'removed'} by ${currentUser.name || currentUser.email || 'Unknown'}.`,
                                                                                    `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                    {
                                                                                        proposalId: updatedProposal.id,
                                                                                        leadId: lead.id
                                                                                    }
                                                                                );
                                                                            }
                                                                        }}
                                                                        className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
                                                                        title="Save working document link"
                                                                    >
                                                                        <i className="fas fa-save mr-1"></i>
                                                                        Save
                                                                    </button>
                                                                    {formData.proposals[proposalIndex]?.workingDocumentLink && (
                                                                        <a 
                                                                            href={formData.proposals[proposalIndex].workingDocumentLink} 
                                                                            target="_blank" 
                                                                            rel="noopener noreferrer"
                                                                            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                                                                        >
                                                                            <i className="fas fa-external-link-alt mr-1"></i>
                                                                            Open
                                                                        </a>
                                                                    )}
                                                                </div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (confirm(`Are you sure you want to delete "${proposal.title || proposal.name}"? This action cannot be undone.`)) {
                                                                // Notify all assigned parties before deletion
                                                                await notifyAllAssignedParties(
                                                                    proposal,
                                                                    `Proposal Deleted: ${proposal.title || proposal.name}`,
                                                                    `Proposal "${proposal.title || proposal.name}" has been deleted by ${currentUser.name || currentUser.email || 'Unknown'}.`,
                                                                    `#/clients?lead=${lead.id}&tab=proposals`,
                                                                    {
                                                                        proposalId: proposal.id,
                                                                        leadId: lead.id
                                                                    }
                                                                );
                                                                
                                                                setFormData(prev => {
                                                                    const updatedProposals = (prev.proposals || []).filter(p => p.id !== proposal.id);
                                                                    saveProposals(updatedProposals);
                                                                    return { ...prev, proposals: updatedProposals };
                                                                });
                                                            }
                                                        }}
                                                        className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete Proposal"
                                                    >
                                                        <i className="fas fa-trash mr-1"></i>Delete
                                                    </button>
                                                </div>

                                                {/* Workflow Stages */}
                                                <div className="space-y-3">
                                                    <h5 className="font-medium text-gray-900 text-sm">Approval Workflow</h5>
                                                    {proposal.stages.map((stage, stageIndex) => {
                                                            const previousStage = stageIndex > 0 ? proposal.stages[stageIndex - 1] : null;
                                                        // Allow approval/rejection at any stage by any user
                                                        // Also allow commenting at any stage
                                                        const canApprove = true; // Any user can approve at any stage
                                                        // Allow commenting at any stage - any user can comment
                                                        const canComment = true; // Always allow commenting
                                                            const isAssigned = stage.assigneeId === currentUserId;
                                                        const statusColor = 
                                                            stage.status === 'approved' ? 'bg-green-100 text-green-700 border-green-300' :
                                                                stage.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-300' :
                                                            stage.status === 'in-progress' ? 'bg-blue-100 text-blue-700 border-blue-300' :
                                                            'bg-gray-100 text-gray-600 border-gray-300';
                                                        const teamKey = (stage.department || '').toLowerCase();
                                                        const teamMetaMap = {
                                                            'business development': { icon: 'fa-rocket', colorClass: 'text-pink-700 bg-pink-100 border-pink-200' },
                                                            'technical': { icon: 'fa-cogs', colorClass: 'text-blue-700 bg-blue-100 border-blue-200' },
                                                            'data': { icon: 'fa-chart-line', colorClass: 'text-indigo-700 bg-indigo-100 border-indigo-200' },
                                                            'support': { icon: 'fa-life-ring', colorClass: 'text-teal-700 bg-teal-100 border-teal-200' },
                                                            'compliance': { icon: 'fa-shield-alt', colorClass: 'text-red-700 bg-red-100 border-red-200' },
                                                            'operations': { icon: 'fa-project-diagram', colorClass: 'text-purple-700 bg-purple-100 border-purple-200' },
                                                            'operations manager': { icon: 'fa-project-diagram', colorClass: 'text-purple-700 bg-purple-100 border-purple-200' },
                                                            'commercial': { icon: 'fa-handshake', colorClass: 'text-orange-700 bg-orange-100 border-orange-200' },
                                                            'ceo': { icon: 'fa-user-tie', colorClass: 'text-gray-700 bg-gray-100 border-gray-200' }
                                                        };
                                                        const teamMeta = teamMetaMap[teamKey] || { icon: 'fa-users', colorClass: 'text-gray-700 bg-gray-100 border-gray-200' };
                                                            const stageKey = `${proposalIndex}-${stageIndex}`;
                                                            const showComments = showStageComments[stageKey] || false;
                                                        
                                                        return (
                                                            <>
                                                                <div key={stageIndex} className={`border-2 rounded-lg p-3 ${statusColor}`}>
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <span className="font-medium text-sm">{stageIndex + 1}.</span>
                                                                                <span className="font-medium text-sm">{(stage.name || '').replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())}</span>
                                                                            </div>
                                                                                <div className="text-xs ml-6 mb-2">
                                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded-full ${teamMeta.colorClass}`}>
                                                                                    <i className={`fas ${teamMeta.icon}`}></i>
                                                                                    {stage.department}
                                                                                </span>
                                                                            </div>
                                                                                
                                                                                {/* Assignee Selection */}
                                                                                <div className="mb-2">
                                                                                    {editingStageAssignee === stageKey ? (
                                                                                        <select
                                                                                            value={stage.assigneeId || ''}
                                                                                            onChange={async (e) => {
                                                                                                const selectedUser = allUsers.find(u => u.id === e.target.value);
                                                                                                const oldAssigneeId = stage.assigneeId;
                                                                                                const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                    idx === stageIndex ? { 
                                                                                                        ...s, 
                                                                                                        assigneeId: e.target.value || '',
                                                                                                        assignee: selectedUser?.name || '',
                                                                                                        assigneeEmail: selectedUser?.email || ''
                                                                                                    } : s
                                                                                                );
                                                                                                const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                    idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                                );
                                                                                                setFormData({ ...formData, proposals: updatedProposals });
                                                                                                setEditingStageAssignee(null);
                                                                                                await saveProposals(updatedProposals);
                                                                                                
                                                                                                // Notify all assigned parties of the assignee change
                                                                                                const updatedProposal = updatedProposals[proposalIndex];
                                                                                                const updatedStage = updatedStages[stageIndex];
                                                                                                await notifyAllAssignedParties(
                                                                                                    updatedProposal,
                                                                                                    `Proposal Assignment Updated: ${updatedProposal.title || updatedProposal.name}`,
                                                                                                    `Stage "${updatedStage.name}" has been ${updatedStage.assigneeId ? `assigned to ${selectedUser?.name || selectedUser?.email || 'a user'}` : 'unassigned'} by ${currentUser.name || currentUser.email || 'Unknown'}.`,
                                                                                                    `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                    {
                                                                                                        proposalId: updatedProposal.id,
                                                                                                        stageId: updatedStage.id,
                                                                                                        stageIndex: stageIndex,
                                                                                                        leadId: lead.id
                                                                                                    }
                                                                                                );
                                                                                                
                                                                                                // Also notify the newly assigned user if they were just assigned
                                                                                                if (updatedStage.assigneeId && updatedStage.assigneeId !== oldAssigneeId) {
                                                                                                    await sendNotification(
                                                                                                        updatedStage.assigneeId,
                                                                                                        `New Assignment: ${updatedProposal.title || updatedProposal.name}`,
                                                                                                        `You have been assigned to stage "${updatedStage.name}" on proposal "${updatedProposal.title || updatedProposal.name}".`,
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                        {
                                                                                                            proposalId: updatedProposal.id,
                                                                                                            stageId: updatedStage.id,
                                                                                                            stageIndex: stageIndex,
                                                                                                            leadId: lead.id
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            }}
                                                                                            onBlur={() => setEditingStageAssignee(null)}
                                                                                            className="text-xs px-2 py-1 border border-gray-300 rounded"
                                                                                            autoFocus
                                                                                        >
                                                                                            <option value="">Assign to...</option>
                                                                                            {allUsers.filter(u => u.status === 'active').map(user => (
                                                                                                <option key={user.id} value={user.id}>{user.name || user.email}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                    ) : (
                                                                                        <div className="text-xs">
                                                                                            <span className="text-gray-600">Assigned to: </span>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => setEditingStageAssignee(stageKey)}
                                                                                                className="text-primary-600 hover:text-primary-700 font-medium"
                                                                                            >
                                                                                                {stage.assignee || <span className="text-gray-400 italic">Unassigned</span>}
                                                                                                <i className="fas fa-edit ml-1 text-xs"></i>
                                                                                            </button>
                                                                                </div>
                                                                            )}
                                                                                </div>
                                                                                
                                                                                {/* Comments Section - Always available for commenting */}
                                                                                {(showComments || canComment) && (
                                                                                    <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                                                                                        <div className="text-xs font-medium text-gray-700 mb-2">Comments:</div>
                                                                                        <div className="space-y-2 mb-2 max-h-32 overflow-y-auto">
                                                                                            {Array.isArray(stage.comments) && stage.comments.length > 0 ? (
                                                                                                stage.comments.map((comment, commentIdx) => {
                                                                                                    // Parse @mentions in comment text (handles @username or @email)
                                                                                                    const renderCommentText = (text) => {
                                                                                                        if (!text) return '';
                                                                                                        // Match @ followed by word characters, spaces, dots, or hyphens (for names/emails)
                                                                                                        const parts = text.split(/(@[\w\s.@-]+)/g);
                                                                                                        return parts.map((part, idx) => {
                                                                                                            if (part.startsWith('@')) {
                                                                                                                // Remove trailing spaces and @ if present
                                                                                                                const mentionName = part.substring(1).trim().replace(/@+$/, '');
                                                                                                                if (mentionName) {
                                                                                                                    const mentionedUser = allUsers.find(u => 
                                                                                                                        (u.name && u.name.toLowerCase() === mentionName.toLowerCase()) ||
                                                                                                                        (u.email && u.email.toLowerCase() === mentionName.toLowerCase())
                                                                                                                    );
                                                                                                                    return (
                                                                                                                        <span key={idx} className="inline-flex items-center px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium mx-0.5">
                                                                                                                            <i className="fas fa-at mr-1"></i>{mentionName}
                                                                                                                        </span>
                                                                                                                    );
                                                                                                                }
                                                                                                            }
                                                                                                            return <span key={idx}>{part}</span>;
                                                                                                        });
                                                                                                    };
                                                                                                    
                                                                                                    return (
                                                                                                        <div key={commentIdx} className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                                                                                                            <div className="font-medium text-gray-700">{comment.author || 'Unknown'}</div>
                                                                                                            <div className="mt-1">{renderCommentText(comment.text)}</div>
                                                                                                            <div className="text-[10px] text-gray-400 mt-1">
                                                                                                                {new Date(comment.timestamp).toLocaleString()}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    );
                                                                                                })
                                                                                            ) : (
                                                                                                <div className="text-xs text-gray-400 italic">No comments yet</div>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="relative">
                                                                                            <textarea
                                                                                                ref={(el) => { if (el) mentionInputRefs.current[stageKey] = el; }}
                                                                                                value={stageCommentInput[stageKey] || ''}
                                                                                                onChange={(e) => {
                                                                                                    const value = e.target.value;
                                                                                                    const cursorPos = e.target.selectionStart;
                                                                                                    const textBeforeCursor = value.substring(0, cursorPos);
                                                                                                    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                                                                                                    
                                                                                                    // Check if we're typing an @mention
                                                                                                    if (lastAtIndex !== -1) {
                                                                                                        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
                                                                                                        // Check if there's a space or newline after @ (end of mention)
                                                                                                        const spaceIndex = textAfterAt.indexOf(' ');
                                                                                                        const newlineIndex = textAfterAt.indexOf('\n');
                                                                                                        const endIndex = Math.min(
                                                                                                            spaceIndex === -1 ? textAfterAt.length : spaceIndex,
                                                                                                            newlineIndex === -1 ? textAfterAt.length : newlineIndex
                                                                                                        );
                                                                                                        
                                                                                                        if (endIndex > 0) {
                                                                                                            const query = textAfterAt.substring(0, endIndex).toLowerCase();
                                                                                                            setMentionState({
                                                                                                                ...mentionState,
                                                                                                                [stageKey]: {
                                                                                                                    show: true,
                                                                                                                    query: query,
                                                                                                                    position: lastAtIndex
                                                                                                                }
                                                                                                            });
                                                                                                        } else {
                                                                                                            setMentionState({
                                                                                                                ...mentionState,
                                                                                                                [stageKey]: { show: false, query: '', position: 0 }
                                                                                                            });
                                                                                                        }
                                                                                                    } else {
                                                                                                        setMentionState({
                                                                                                            ...mentionState,
                                                                                                            [stageKey]: { show: false, query: '', position: 0 }
                                                                                                        });
                                                                                                    }
                                                                                                    
                                                                                                    setStageCommentInput({ ...stageCommentInput, [stageKey]: value });
                                                                                                }}
                                                                                                onBlur={() => {
                                                                                                    // Delay hiding mention dropdown to allow clicking on it
                                                                                                    setTimeout(() => {
                                                                                                        setMentionState(prev => ({
                                                                                                            ...prev,
                                                                                                            [stageKey]: { show: false, query: '', position: 0 }
                                                                                                        }));
                                                                                                    }, 200);
                                                                                                }}
                                                                                                placeholder="Add a comment... (use @ to mention users)"
                                                                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded mb-1"
                                                                                                rows="2"
                                                                                            />
                                                                                            {/* @mention dropdown */}
                                                                                            {mentionState[stageKey]?.show && (
                                                                                                <div className="absolute z-50 mt-1 w-48 bg-white border border-gray-300 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                                                                                    {allUsers.filter(u => {
                                                                                                        const query = mentionState[stageKey]?.query || '';
                                                                                                        if (!query) return true;
                                                                                                        const name = (u.name || '').toLowerCase();
                                                                                                        const email = (u.email || '').toLowerCase();
                                                                                                        return name.includes(query) || email.includes(query);
                                                                                                    }).slice(0, 5).map(user => (
                                                                                                        <button
                                                                                                            key={user.id}
                                                                                                            type="button"
                                                                                                            onClick={() => {
                                                                                                                const currentValue = stageCommentInput[stageKey] || '';
                                                                                                                const mentionPos = mentionState[stageKey]?.position || 0;
                                                                                                                const textBefore = currentValue.substring(0, mentionPos);
                                                                                                                const textAfter = currentValue.substring(mentionPos + 1 + (mentionState[stageKey]?.query?.length || 0));
                                                                                                                const mentionText = `@${user.name || user.email}`;
                                                                                                                const newValue = textBefore + mentionText + ' ' + textAfter;
                                                                                                                setStageCommentInput({ ...stageCommentInput, [stageKey]: newValue });
                                                                                                                setMentionState({
                                                                                                                    ...mentionState,
                                                                                                                    [stageKey]: { show: false, query: '', position: 0 }
                                                                                                                });
                                                                                                                // Focus back on textarea
                                                                                                                setTimeout(() => {
                                                                                                                    const textarea = mentionInputRefs.current[stageKey];
                                                                                                                    if (textarea) {
                                                                                                                        textarea.focus();
                                                                                                                        const newPos = textBefore.length + mentionText.length + 1;
                                                                                                                        textarea.setSelectionRange(newPos, newPos);
                                                                                                                    }
                                                                                                                }, 0);
                                                                                                            }}
                                                                                                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 flex items-center gap-2"
                                                                                                        >
                                                                                                            <i className="fas fa-user text-gray-400"></i>
                                                                                                            <span>{user.name || user.email}</span>
                                                                                                        </button>
                                                                                                    ))}
                                                                                                    {allUsers.filter(u => {
                                                                                                        const query = mentionState[stageKey]?.query || '';
                                                                                                        if (!query) return true;
                                                                                                        const name = (u.name || '').toLowerCase();
                                                                                                        const email = (u.email || '').toLowerCase();
                                                                                                        return name.includes(query) || email.includes(query);
                                                                                                    }).length === 0 && (
                                                                                                        <div className="px-3 py-2 text-xs text-gray-400">No users found</div>
                                                                                                    )}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={async () => {
                                                                                                if (stageCommentInput[stageKey]?.trim()) {
                                                                                                    const newComment = {
                                                                                                        id: Date.now(),
                                                                                                        text: stageCommentInput[stageKey].trim(),
                                                                                                        author: currentUser.name || currentUser.email || 'Unknown',
                                                                                                        authorId: currentUserId,
                                                                                                        timestamp: new Date().toISOString()
                                                                                                    };
                                                                                                    const updatedComments = [...(Array.isArray(stage.comments) ? stage.comments : []), newComment];
                                                                                                    const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                        idx === stageIndex ? { ...s, comments: updatedComments } : s
                                                                                                    );
                                                                                                    const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                        idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                                    );
                                                                                                    setStageCommentInput({ ...stageCommentInput, [stageKey]: '' });
                                                                                                    await saveProposals(updatedProposals);
                                                                                                    
                                                                                                    // Notify all assigned parties of the new comment
                                                                                                    await notifyAllAssignedParties(
                                                                                                        updatedProposals[proposalIndex],
                                                                                                        `New Comment on Proposal: ${proposal.title || proposal.name}`,
                                                                                                        `${currentUser.name || currentUser.email || 'Unknown'} commented on stage "${stage.name}": ${newComment.text}`,
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                        {
                                                                                                            proposalId: proposal.id,
                                                                                                            stageId: stage.id,
                                                                                                            stageIndex: stageIndex,
                                                                                                            leadId: lead.id
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            }}
                                                                                            className="px-2 py-1 text-xs bg-primary-600 text-white rounded hover:bg-primary-700"
                                                                                        >
                                                                                            Add Comment
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                                
                                                                                {/* Status Messages */}
                                                                            {stage.approvedBy && (
                                                                                <div className="mt-2 text-[11px] text-gray-600">
                                                                                    <i className="fas fa-user-check mr-1"></i>Approved by {stage.approvedBy} on {new Date(stage.approvedAt).toLocaleDateString()}
                                                                                </div>
                                                                                )}
                                                                                {stage.rejectedBy && (
                                                                                    <div className="mt-2 text-[11px] text-red-600">
                                                                                        <i className="fas fa-times-circle mr-1"></i>Rejected by {stage.rejectedBy} on {new Date(stage.rejectedAt).toLocaleDateString()}
                                                                                        {stage.rejectedReason && (
                                                                                            <div className="mt-1 text-gray-600">Reason: {stage.rejectedReason}</div>
                                                                            )}
                                                                        </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-2 flex-col">
                                                                            {canApprove && (
                                                                                    <>
                                                                                <button
                                                                                    type="button"
                                                                                            onClick={async () => {
                                                                                                const commentText = stageCommentInput[stageKey] || '';
                                                                                                let approver = currentUser.name || currentUser.email || 'Unknown';
                                                                                                const approverId = currentUserId;
                                                                                                
                                                                                                const updatedComments = Array.isArray(stage.comments) ? stage.comments : [];
                                                                                                if (commentText.trim()) {
                                                                                                    updatedComments.push({
                                                                                                        id: Date.now(),
                                                                                                        text: commentText.trim(),
                                                                                                        author: approver,
                                                                                                        authorId: approverId,
                                                                                                        timestamp: new Date().toISOString()
                                                                                                    });
                                                                                                }
                                                                                                
                                                                                            const updatedStages = proposal.stages.map((s, idx) => {
                                                                                                if (idx === stageIndex) {
                                                                                                        return { 
                                                                                                            ...s, 
                                                                                                            status: 'approved', 
                                                                                                            comments: updatedComments,
                                                                                                            approvedBy: approver,
                                                                                                            approvedAt: new Date().toISOString()
                                                                                                        };
                                                                                                } else if (idx === stageIndex + 1 && idx < proposal.stages.length) {
                                                                                                    return { ...s, status: 'in-progress' };
                                                                                                }
                                                                                                return s;
                                                                                            });
                                                                                                
                                                                                            const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                            );
                                                                                                setStageCommentInput({ ...stageCommentInput, [stageKey]: '' });
                                                                                                setShowStageComments({ ...showStageComments, [stageKey]: false });
                                                                                                await saveProposals(updatedProposals);
                                                                                                
                                                                                                // Notify all assigned parties of the approval
                                                                                                await notifyAllAssignedParties(
                                                                                                    updatedProposals[proposalIndex],
                                                                                                    `Proposal Stage Approved: ${proposal.title || proposal.name}`,
                                                                                                    `Stage "${stage.name}" has been approved by ${approver}.${commentText.trim() ? ` Comment: ${commentText.trim()}` : ''}`,
                                                                                                    `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                    {
                                                                                                        proposalId: proposal.id,
                                                                                                        stageId: stage.id,
                                                                                                        stageIndex: stageIndex,
                                                                                                        leadId: lead.id
                                                                                                    }
                                                                                                );
                                                                                                
                                                                                                // Also notify assigned user of next stage if it exists
                                                                                                if (stageIndex + 1 < proposal.stages.length) {
                                                                                                    const nextStage = updatedStages[stageIndex + 1];
                                                                                                    if (nextStage.assigneeId) {
                                                                                                        await sendNotification(
                                                                                                            nextStage.assigneeId,
                                                                                                            `Proposal Stage Ready: ${proposal.title || proposal.name}`,
                                                                                                            `Stage "${nextStage.name}" is now ready for your review.`,
                                                                                                            `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                            {
                                                                                                                proposalId: proposal.id,
                                                                                                                stageId: nextStage.id,
                                                                                                                stageIndex: stageIndex + 1,
                                                                                                                leadId: lead.id
                                                                                                            }
                                                                                                        );
                                                                                                    }
                                                                                        }
                                                                                    }}
                                                                                    className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                                                >
                                                                                            <i className="fas fa-check mr-1"></i>Approve
                                                                                </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={async () => {
                                                                                                const reason = prompt('Please provide a reason for rejection:');
                                                                                                if (reason !== null) {
                                                                                                    let rejector = currentUser.name || currentUser.email || 'Unknown';
                                                                                                    const rejectorId = currentUserId;
                                                                                                    
                                                                                                    const updatedComments = Array.isArray(stage.comments) ? stage.comments : [];
                                                                                                    const commentText = stageCommentInput[stageKey] || '';
                                                                                                    if (commentText.trim()) {
                                                                                                        updatedComments.push({
                                                                                                            id: Date.now(),
                                                                                                            text: commentText.trim(),
                                                                                                            author: rejector,
                                                                                                            authorId: rejectorId,
                                                                                                            timestamp: new Date().toISOString()
                                                                                                        });
                                                                                                    }
                                                                                                    
                                                                                                    const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                        idx === stageIndex ? { 
                                                                                                            ...s, 
                                                                                                            status: 'rejected',
                                                                                                            comments: updatedComments,
                                                                                                            rejectedBy: rejector,
                                                                                                            rejectedAt: new Date().toISOString(),
                                                                                                            rejectedReason: reason
                                                                                                        } : s
                                                                                                    );
                                                                                                    
                                                                                                    const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                        idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                                    );
                                                                                                    setStageCommentInput({ ...stageCommentInput, [stageKey]: '' });
                                                                                                    setShowStageComments({ ...showStageComments, [stageKey]: false });
                                                                                                    await saveProposals(updatedProposals);
                                                                                                    
                                                                                                    // Notify all assigned parties of the rejection
                                                                                                    await notifyAllAssignedParties(
                                                                                                        updatedProposals[proposalIndex],
                                                                                                        `Proposal Stage Rejected: ${proposal.title || proposal.name}`,
                                                                                                        `Stage "${stage.name}" has been rejected by ${rejector}. Reason: ${reason}${commentText.trim() ? ` Additional comment: ${commentText.trim()}` : ''}`,
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                        {
                                                                                                            proposalId: proposal.id,
                                                                                                            stageId: stage.id,
                                                                                                            stageIndex: stageIndex,
                                                                                                            leadId: lead.id
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            }}
                                                                                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                                                        >
                                                                                            <i className="fas fa-times mr-1"></i>Reject
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setShowStageComments({ ...showStageComments, [stageKey]: !showComments })}
                                                                                            className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                                                                        >
                                                                                            <i className="fas fa-comment mr-1"></i>{showComments ? 'Hide' : 'Show'} Comments
                                                                                        </button>
                                                                                    </>
                                                                            )}
                                                                            {/* Status display and update controls */}
                                                                            {stage.status === 'approved' && (
                                                                                <div className="flex flex-col gap-1">
                                                                                <span className="px-2 py-1 text-xs bg-green-200 text-green-800 rounded">
                                                                                    <i className="fas fa-check mr-1"></i>Approved
                                                                                </span>
                                                                                    {/* Allow any user to change status */}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={async () => {
                                                                                            const reason = prompt('Please provide a reason for changing to rejected:');
                                                                                            if (reason !== null && reason.trim()) {
                                                                                                let updater = currentUser.name || currentUser.email || 'Unknown';
                                                                                                const updaterId = currentUserId;
                                                                                                
                                                                                                const commentText = stageCommentInput[stageKey] || '';
                                                                                                const updatedComments = Array.isArray(stage.comments) ? stage.comments : [];
                                                                                                if (commentText.trim()) {
                                                                                                    updatedComments.push({
                                                                                                        id: Date.now(),
                                                                                                        text: commentText.trim(),
                                                                                                        author: updater,
                                                                                                        authorId: updaterId,
                                                                                                        timestamp: new Date().toISOString()
                                                                                                    });
                                                                                                }
                                                                                                
                                                                                                const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                    idx === stageIndex ? { 
                                                                                                        ...s, 
                                                                                                        status: 'rejected',
                                                                                                        comments: updatedComments,
                                                                                                        rejectedBy: updater,
                                                                                                        rejectedAt: new Date().toISOString(),
                                                                                                        rejectedReason: reason.trim(),
                                                                                                        approvedBy: null,
                                                                                                        approvedAt: null
                                                                                                    } : s
                                                                                                );
                                                                                                
                                                                                                const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                    idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                                );
                                                                                                setStageCommentInput({ ...stageCommentInput, [stageKey]: '' });
                                                                                                await saveProposals(updatedProposals);
                                                                                                
                                                                                                // Notify all assigned parties of the status change from approved to rejected
                                                                                                await notifyAllAssignedParties(
                                                                                                    updatedProposals[proposalIndex],
                                                                                                    `Proposal Stage Status Changed: ${proposal.title || proposal.name}`,
                                                                                                    `Stage "${stage.name}" has been changed from approved to rejected by ${updater}. Reason: ${reason.trim()}${commentText.trim() ? ` Additional comment: ${commentText.trim()}` : ''}`,
                                                                                                    `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                    {
                                                                                                        proposalId: proposal.id,
                                                                                                        stageId: stage.id,
                                                                                                        stageIndex: stageIndex,
                                                                                                        leadId: lead.id
                                                                                                    }
                                                                                                );
                                                                                            }
                                                                                        }}
                                                                                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                                                        title="Change to Rejected"
                                                                                    >
                                                                                        <i className="fas fa-times mr-1"></i>Reject
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {stage.status === 'rejected' && (
                                                                                <div className="flex flex-col gap-1">
                                                                                    <span className="px-2 py-1 text-xs bg-red-200 text-red-800 rounded">
                                                                                        <i className="fas fa-times mr-1"></i>Rejected
                                                                                    </span>
                                                                                    {/* Allow any user to change status */}
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={async () => {
                                                                                            const commentText = stageCommentInput[stageKey] || '';
                                                                                            let updater = currentUser.name || currentUser.email || 'Unknown';
                                                                                            const updaterId = currentUserId;
                                                                                            
                                                                                            const updatedComments = Array.isArray(stage.comments) ? stage.comments : [];
                                                                                            if (commentText.trim()) {
                                                                                                updatedComments.push({
                                                                                                    id: Date.now(),
                                                                                                    text: commentText.trim(),
                                                                                                    author: updater,
                                                                                                    authorId: updaterId,
                                                                                                    timestamp: new Date().toISOString()
                                                                                                });
                                                                                            }
                                                                                            
                                                                                            const updatedStages = proposal.stages.map((s, idx) => {
                                                                                                if (idx === stageIndex) {
                                                                                                    return { 
                                                                                                        ...s, 
                                                                                                        status: 'approved', 
                                                                                                        comments: updatedComments,
                                                                                                        approvedBy: updater,
                                                                                                        approvedAt: new Date().toISOString(),
                                                                                                        rejectedBy: null,
                                                                                                        rejectedAt: null,
                                                                                                        rejectedReason: ''
                                                                                                    };
                                                                                                } else if (idx === stageIndex + 1 && idx < proposal.stages.length) {
                                                                                                    return { ...s, status: 'in-progress' };
                                                                                                }
                                                                                                return s;
                                                                                            });
                                                                                            
                                                                                            const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                            );
                                                                                            setStageCommentInput({ ...stageCommentInput, [stageKey]: '' });
                                                                                            await saveProposals(updatedProposals);
                                                                                            
                                                                                            // Notify all assigned parties of the status change from rejected to approved
                                                                                            await notifyAllAssignedParties(
                                                                                                updatedProposals[proposalIndex],
                                                                                                `Proposal Stage Status Changed: ${proposal.title || proposal.name}`,
                                                                                                `Stage "${stage.name}" has been changed from rejected to approved by ${updater}.${commentText.trim() ? ` Comment: ${commentText.trim()}` : ''}`,
                                                                                                `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                {
                                                                                                    proposalId: proposal.id,
                                                                                                    stageId: stage.id,
                                                                                                    stageIndex: stageIndex,
                                                                                                    leadId: lead.id
                                                                                                }
                                                                                            );
                                                                                            
                                                                                            // Notify assigned users of next stage
                                                                                            if (stageIndex + 1 < proposal.stages.length) {
                                                                                                const nextStage = updatedStages[stageIndex + 1];
                                                                                                if (nextStage.assigneeId) {
                                                                                                    await sendNotification(
                                                                                                        nextStage.assigneeId,
                                                                                                        `Proposal Stage Ready: ${proposal.title || proposal.name}`,
                                                                                                        `Stage "${nextStage.name}" is now ready for your review.`,
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`,
                                                                                                        {
                                                                                                            proposalId: proposal.id,
                                                                                                            stageId: nextStage.id,
                                                                                                            stageIndex: stageIndex + 1,
                                                                                                            leadId: lead.id
                                                                                                        }
                                                                                                    );
                                                                                                }
                                                                                            }
                                                                                        }}
                                                                                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                                                        title="Change to Approved"
                                                                                    >
                                                                                        <i className="fas fa-check mr-1"></i>Approve
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                            {stage.status === 'in-progress' && (
                                                                                <span className="px-2 py-1 text-xs bg-blue-200 text-blue-800 rounded">
                                                                                    <i className="fas fa-clock mr-1"></i>In Progress
                                                                                </span>
                                                                            )}
                                                                            {/* Always show comment button for any stage */}
                                                                            {!showComments && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setShowStageComments({ ...showStageComments, [stageKey]: true })}
                                                                                    className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                                                                >
                                                                                    <i className="fas fa-comment mr-1"></i>Comments ({Array.isArray(stage.comments) ? stage.comments.length : 0})
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                {stageIndex < proposal.stages.length - 1 && (
                                                                    <div className="flex justify-center -my-1">
                                                                        <i className="fas fa-arrow-down text-gray-400 text-xs"></i>
                                                                    </div>
                                                                )}
                                                            </>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Activity Timeline Tab */}
                        {activeTab === 'activity' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-lg font-semibold text-gray-900">Activity Timeline</h3>
                                    <div className="text-sm text-gray-600">
                                        {(Array.isArray(formData.activityLog) ? formData.activityLog : []).length} activities
                                    </div>
                                </div>

                                    {(!Array.isArray(formData.activityLog) || formData.activityLog.length === 0) ? (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-history text-3xl mb-2"></i>
                                        <p>No activity recorded yet</p>
                                        <p className="text-xs mt-1">Activity will be logged automatically as you interact with this lead</p>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        {/* Timeline line */}
                                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>
                                        
                                        <div className="space-y-4">
                                            {[...(Array.isArray(formData.activityLog) ? formData.activityLog : [])].reverse().map((activity, index) => {
                                                const activityIcon = 
                                                    activity.type === 'Contact Added' ? 'user-plus' :
                                                    activity.type === 'Contact Updated' ? 'user-edit' :
                                                    activity.type === 'Follow-up Added' ? 'calendar-plus' :
                                                    activity.type === 'Follow-up Completed' ? 'calendar-check' :
                                                    activity.type === 'Comment Added' ? 'comment' :
                                                    activity.type === 'Status Changed' ? 'toggle-on' :
                                                    activity.type === 'Stage Changed' ? 'arrow-right' :
                                                    activity.type === 'Project Linked' ? 'link' :
                                                    'info-circle';

                                                const activityColor = 
                                                    activity.type.includes('Deleted') ? 'bg-red-100 text-red-600 border-red-200' :
                                                    activity.type.includes('Completed') ? 'bg-green-100 text-green-600 border-green-200' :
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
                                                of your interactions with this lead.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                            <div className="flex gap-2">
                                {lead && (
                                    <button 
                                        type="button"
                                        onClick={() => onConvertToClient(formData)}
                                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
                                    >
                                        <i className="fas fa-check-circle mr-2"></i>
                                        Convert to Client
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    type="button" 
                                    onClick={onClose} 
                                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isSaving}
                                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? (
                                        <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</>
                                    ) : (
                                        <><i className="fas fa-save mr-2"></i>{hasBeenSaved || leadId ? 'Update Lead' : 'Create Lead'}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            
            {/* External Agent Modal - Admin Only */}
            {showExternalAgentModal && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowExternalAgentModal(false);
                            setNewExternalAgentName('');
                        }
                    }}
                >
                    <div 
                        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-gray-900">Add New External Agent</h2>
                            <button
                                onClick={() => {
                                    setShowExternalAgentModal(false);
                                    setNewExternalAgentName('');
                                }}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        {/* Body */}
                        <div className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    External Agent Name *
                                </label>
                                <input
                                    type="text"
                                    value={newExternalAgentName}
                                    onChange={(e) => setNewExternalAgentName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !isCreatingExternalAgent) {
                                            handleCreateExternalAgent();
                                        } else if (e.key === 'Escape') {
                                            setShowExternalAgentModal(false);
                                            setNewExternalAgentName('');
                                        }
                                    }}
                                    placeholder="Enter external agent name"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>
                            <p className="text-xs text-gray-500 mb-4">
                                Only administrators can create new external agents.
                            </p>
                        </div>
                        
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowExternalAgentModal(false);
                                    setNewExternalAgentName('');
                                }}
                                className="px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
                                disabled={isCreatingExternalAgent}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateExternalAgent}
                                disabled={!newExternalAgentName.trim() || isCreatingExternalAgent}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCreatingExternalAgent ? (
                                    <>
                                        <i className="fas fa-spinner fa-spin mr-2"></i>
                                        Creating...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-plus mr-2"></i>
                                        Create Agent
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Manage External Agents Modal - Admin Only - Added deletion functionality */}
            {showManageExternalAgentsModal && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setShowManageExternalAgentsModal(false);
                        }
                    }}
                >
                    <div 
                        className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-gray-900">Manage External Agents</h2>
                            <button
                                onClick={() => setShowManageExternalAgentsModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <i className="fas fa-times text-xl"></i>
                            </button>
                        </div>
                        
                        {/* Body */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {isLoadingExternalAgents ? (
                                <div className="text-center py-8">
                                    <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                    <p className="mt-2 text-sm text-gray-500">Loading external agents...</p>
                                </div>
                            ) : externalAgents.length === 0 ? (
                                <div className="text-center py-8">
                                    <i className="fas fa-users text-3xl text-gray-300 mb-2"></i>
                                    <p className="text-gray-500">No external agents found</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {externalAgents.map((agent) => (
                                        <div
                                            key={agent.id}
                                            className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                                        >
                                            <div className="flex-1">
                                                <div className="font-medium text-gray-900">{agent.name}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {agent.isActive ? (
                                                        <span className="text-green-600">Active</span>
                                                    ) : (
                                                        <span className="text-gray-400">Inactive</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteExternalAgent(agent.id, agent.name)}
                                                disabled={isDeletingExternalAgent}
                                                className="ml-3 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                                title="Delete external agent"
                                            >
                                                {isDeletingExternalAgent ? (
                                                    <i className="fas fa-spinner fa-spin"></i>
                                                ) : (
                                                    <>
                                                        <i className="fas fa-trash"></i>
                                                        <span>Delete</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                            <button
                                onClick={() => setShowManageExternalAgentsModal(false)}
                                className="px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </>
        );
    }

    // Modal view - with modal wrapper  
    return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4', onClick: onClose },
            React.createElement('div', { className: 'bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col', onClick: (e) => e.stopPropagation() },
                React.createElement('div', { className: 'flex justify-between items-center px-6 py-4 border-b border-gray-200' },
                    React.createElement('div', null,
                        React.createElement('div', { className: 'flex items-center gap-2' },
                            React.createElement('h2', { className: 'text-xl font-semibold text-gray-900' },
                                lead ? formData.name : 'Add New Lead'
                            ),
                            isAutoSaving && React.createElement('span', { className: 'text-xs text-gray-500 flex items-center gap-1' },
                                React.createElement('i', { className: 'fas fa-spinner fa-spin' }),
                                'Saving...'
                            )
                        ),
                        lead && React.createElement('div', { className: 'flex items-center gap-2 mt-0.5' },
                            React.createElement('span', { className: 'text-sm text-gray-600' }, formData.industry)
                        )
                    ),
                    React.createElement('button', { onClick: onClose, className: 'text-gray-400 hover:text-gray-600 transition-colors' },
                        React.createElement('i', { className: 'fas fa-times text-xl' })
                    )
                ),
                React.createElement('div', { className: 'flex-1 overflow-y-auto' },
                    React.createElement('form', { onSubmit: handleSubmit, className: 'h-full flex flex-col' },
                        React.createElement('div', { className: 'border-b border-gray-200 px-3 sm:px-6' },
                            React.createElement('div', { className: 'flex gap-2 sm:gap-6 overflow-x-auto scrollbar-hide', style: { scrollbarWidth: 'none', msOverflowStyle: 'none' } },
                                ['overview', 'contacts', 'sites', 'calendar', ...(isAdmin ? ['proposals'] : []), 'activity', 'notes'].map(tab =>
                                    React.createElement('button', {
                                        key: tab,
                                        onClick: () => handleTabChange(tab),
                                        className: `py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 min-w-fit ${
                                                activeTab === tab
                                                    ? 'border-primary-600 text-primary-600'
                                                    : 'border-transparent text-gray-600 hover:text-gray-900'
                                        }`,
                                        style: { minWidth: 'max-content' }
                                    }, tab.charAt(0).toUpperCase() + tab.slice(1))
                                )
                            )
                        ),
                        React.createElement('div', { className: 'flex-1 p-6' },
                            activeTab === 'overview' && React.createElement('div', { className: 'space-y-6' },
                                React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-6' },
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Entity Name'),
                                        React.createElement('input', {
                                            type: 'text',
                                            value: formData.name,
                                            onChange: (e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('name');
                                                isEditingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000);
                                                
                                                // Use functional update to avoid closure issues
                                                setFormData(prev => {
                                                    const updated = {...prev, name: e.target.value};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            },
                                            onFocus: () => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                            },
                                            ref: nameInputRef,
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500',
                                            placeholder: 'Enter lead name'
                                        })
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Industry'),
                                        React.createElement('select', {
                                            value: formData.industry,
                                            onChange: (e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('industry');
                                                isEditingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000);
                                                
                                                // Use functional update to avoid closure issues
                                                setFormData(prev => {
                                                    const updated = {...prev, industry: e.target.value};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            },
                                            onFocus: () => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                            },
                                            ref: industrySelectRef,
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500'
                                        },
                                            React.createElement('option', { value: 'Technology' }, 'Technology'),
                                            React.createElement('option', { value: 'Manufacturing' }, 'Manufacturing'),
                                            React.createElement('option', { value: 'Healthcare' }, 'Healthcare'),
                                            React.createElement('option', { value: 'Finance' }, 'Finance'),
                                            React.createElement('option', { value: 'Retail' }, 'Retail'),
                                            React.createElement('option', { value: 'Education' }, 'Education'),
                                            React.createElement('option', { value: 'Government' }, 'Government'),
                                            React.createElement('option', { value: 'Other' }, 'Other')
                                        )
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'First Contact Date'),
                                        React.createElement('input', {
                                            type: 'date',
                                            value: formData.firstContactDate,
                                            onChange: (e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('firstContactDate');
                                                isEditingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000);
                                                
                                                // Use functional update to avoid closure issues
                                                setFormData(prev => {
                                                    const updated = {...prev, firstContactDate: e.target.value};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            },
                                            onFocus: () => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                            },
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500'
                                        })
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Status'),
                                        React.createElement('div', { className: 'w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700' }, 'Active')
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Source'),
                                        React.createElement('input', {
                                            type: 'text',
                                            value: formData.source,
                                            onChange: (e) => {
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('source');
                                                isEditingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000);
                                                
                                                // Use functional update to avoid closure issues
                                                setFormData(prev => {
                                                    const updated = {...prev, source: e.target.value};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            },
                                            onFocus: () => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                            },
                                            ref: sourceSelectRef,
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500',
                                            placeholder: 'e.g., Website, Referral, Cold Call'
                                        })
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'AIDA STAGE'),
                                        React.createElement('select', {
                                            value: formData.stage,
                                            onChange: async (e) => {
                                                const newStage = e.target.value;
                                                
                                                // CRITICAL: Mark that user has started typing and edited this field
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('stage');
                                                isEditingRef.current = true;
                                                
                                                // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                                // This prevents LiveDataSync from overwriting during the delay
                                                isAutoSavingRef.current = true;
                                                notifyEditingChange(false, true);
                                                
                                                
                                                // Update state and get the updated formData
                                                setFormData(prev => {
                                                    const updated = {...prev, stage: newStage};
                                                    
                                                    // Auto-save immediately with the updated data
                                                    if (lead && onSave) {
                                                        // Use setTimeout to ensure state is updated
                                                        setTimeout(async () => {
                                                            try {
                                                                // Get the latest formData from ref (updated by useEffect)
                                                                const latest = {...formDataRef.current, stage: newStage};
                                                                
                                                                // Explicitly ensure stage is included
                                                                latest.stage = newStage;
                                                                
                                                                // Save this as the last saved state
                                                                lastSavedDataRef.current = latest;
                                                                
                                                                // Save to API - ensure it's awaited
                                                                await onSave(latest, true);
                                                                
                                                                
                                                                // Clear the flag after a longer delay to allow API response to propagate
                                                                setTimeout(() => {
                                                                    isAutoSavingRef.current = false;
                                                                    notifyEditingChange(false, false); // Notify parent auto-save complete
                                                                }, 3000);
                                                            } catch (error) {
                                                                console.error('❌ Error saving stage:', error);
                                                                isAutoSavingRef.current = false;
                                                                notifyEditingChange(false, false); // Notify parent auto-save failed
                                                                alert('Failed to save stage change. Please try again.');
                                                            }
                                                        }, 100); // Small delay to ensure state update is processed
                                                    }
                                                    
                                                    return updated;
                                                });
                                            },
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500'
                                        },
                                            React.createElement('option', { value: 'No Engagement' }, 'No Engagement - No response yet'),
                                            React.createElement('option', { value: 'Awareness' }, 'Awareness - Lead knows about us'),
                                            React.createElement('option', { value: 'Interest' }, 'Interest - Lead is interested'),
                                            React.createElement('option', { value: 'Desire' }, 'Desire - Lead wants our solution'),
                                            React.createElement('option', { value: 'Action' }, 'Action - Lead is ready to buy')
                                        )
                                    )
                                ),
                                React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-3 gap-4' },
                                    React.createElement('div', null,
                                        React.createElement('div', { className: 'flex items-center justify-between mb-2' },
                                            React.createElement('label', { className: 'block text-sm font-medium text-gray-700' }, 'External Agent'),
                                            isAdmin && React.createElement('div', { className: 'flex items-center gap-1' },
                                                React.createElement('button', {
                                                    type: 'button',
                                                    onClick: (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setShowManageExternalAgentsModal(true);
                                                    },
                                                    className: 'text-xs px-2 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors flex items-center gap-1',
                                                    title: 'Manage External Agents (Admin Only)'
                                                },
                                                    React.createElement('i', { className: 'fas fa-cog text-xs' }),
                                                    React.createElement('span', null, 'Manage')
                                                ),
                                                React.createElement('button', {
                                                    type: 'button',
                                                    onClick: (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setShowExternalAgentModal(true);
                                                    },
                                                    className: 'text-xs px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors flex items-center gap-1',
                                                    title: 'Add New External Agent (Admin Only)'
                                                },
                                                    React.createElement('i', { className: 'fas fa-plus text-xs' }),
                                                    React.createElement('span', null, 'Add New')
                                                )
                                            )
                                        ),
                                        React.createElement('select', {
                                            value: formData.externalAgentId || '',
                                            onChange: (e) => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                userEditedFieldsRef.current.add('externalAgentId');
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                editingTimeoutRef.current = setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 5000);
                                                setFormData(prev => {
                                                    const updated = {...prev, externalAgentId: e.target.value || null};
                                                    formDataRef.current = updated;
                                                    return updated;
                                                });
                                            },
                                            onFocus: () => {
                                                isEditingRef.current = true;
                                                userHasStartedTypingRef.current = true;
                                                notifyEditingChange(true);
                                                if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            },
                                            onBlur: () => {
                                                setTimeout(() => {
                                                    isEditingRef.current = false;
                                                    notifyEditingChange(false);
                                                }, 500);
                                            },
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500'
                                        },
                                            React.createElement('option', { value: '' }, 'Select External Agent'),
                                            externalAgents.map((agent) =>
                                                React.createElement('option', { key: agent.id, value: agent.id }, agent.name)
                                            )
                                        )
                                    )
                                ),
                                React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
                                    React.createElement('div', { className: 'md:col-span-2' },
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Notes'),
                                        React.createElement('textarea', {
                                            value: formData.notes,
                                            onChange: (e) => {
                                                    const updated = {...formData, notes: e.target.value};
                                                    setFormData(updated);
                                                    formDataRef.current = updated;
                                            },
                                            onBlur: () => {
                                                    if (lead && formDataRef.current) {
                                                        const latest = {...formDataRef.current};
                                                        onSave(latest, true);
                                                    }
                                            },
                                            rows: 4,
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500',
                                            placeholder: 'Add notes about this lead...'
                                        })
                                    ),
                                    React.createElement('div', { className: 'md:col-span-2' },
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Sites'),
                                        React.createElement('div', { className: 'space-y-2' },
                                            ((formData && formData.sites) || []).map((site, index) =>
                                                React.createElement('div', { key: index, className: 'flex gap-2' },
                                                    React.createElement('input', {
                                                        type: 'text',
                                                        value: typeof site === 'string' ? site : site.name || '',
                                                        onChange: (e) => {
                                                            setFormData(prev => {
                                                                const currentSites = prev?.sites || [];
                                                                const newSites = [...currentSites];
                                                                if (typeof site === 'string') {
                                                                    newSites[index] = e.target.value;
                                                                } else {
                                                                    newSites[index] = { ...site, name: e.target.value };
                                                                }
                                                                const updated = {...prev, sites: newSites};
                                                                formDataRef.current = updated;
                                                                return updated;
                                                            });
                                                        },
                                                        className: 'flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                                                        placeholder: 'Site name or location'
                                                    }),
                                                    React.createElement('button', {
                                                        type: 'button',
                                                        onClick: () => {
                                                            setFormData(prev => {
                                                                const currentSites = prev?.sites || [];
                                                                const newSites = currentSites.filter((_, i) => i !== index);
                                                                const updated = {...prev, sites: newSites};
                                                                formDataRef.current = updated;
                                                                return updated;
                                                            });
                                                        },
                                                        className: 'px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors'
                                                    },
                                                        React.createElement('i', { className: 'fas fa-trash' })
                                                    )
                                                )
                                            ),
                                            React.createElement('button', {
                                                type: 'button',
                                                onClick: () => {
                                                    setFormData(prev => {
                                                        const currentSites = prev?.sites || [];
                                                        const newSites = [...currentSites, ''];
                                                        const updated = {...prev, sites: newSites};
                                                        formDataRef.current = updated;
                                                        return updated;
                                                    });
                                                },
                                                className: 'px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium'
                                            },
                                                React.createElement('i', { className: 'fas fa-plus mr-1' }),
                                                'Add Site'
                                            )
                                        )
                                    )
                                )
                            ),
                            activeTab !== 'overview' && React.createElement('div', { className: 'text-center py-8 text-gray-500' },
                                activeTab.charAt(0).toUpperCase() + activeTab.slice(1), ' content coming soon...'
                            )
                        ),
                        React.createElement('div', { className: 'border-t border-gray-200 px-6 py-4' },
                            React.createElement('div', { className: 'flex justify-between' },
                                React.createElement('button', {
                                    type: 'button',
                                    onClick: onClose,
                                    className: 'px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors'
                                }, 'Cancel'),
                                React.createElement('button', {
                                    type: 'submit',
                                    disabled: isSaving,
                                    className: 'bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed'
                                },
                                    isSaving ? React.createElement(React.Fragment, null,
                                        React.createElement('i', { className: 'fas fa-spinner fa-spin mr-2' }),
                                        'Saving...'
                                    ) : React.createElement(React.Fragment, null,
                                        React.createElement('i', { className: 'fas fa-save mr-2' }),
                                        hasBeenSaved || leadId ? 'Update Lead' : 'Create Lead'
                                    )
                                )
                            )
                        )
                    )
                )
            )
        ),
        // Industry Management Modal is rendered via DOM manipulation in useEffect (line 297)
        // No JSX modal needed here - the useEffect handles it
        
        // External Agent Modal - Admin Only
        showExternalAgentModal ? React.createElement('div', {
            className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]',
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    setShowExternalAgentModal(false);
                    setNewExternalAgentName('');
                }
            }
        },
            React.createElement('div', {
                className: 'bg-white rounded-lg shadow-xl max-w-md w-full mx-4',
                onClick: (e) => e.stopPropagation()
            },
                // Header
                React.createElement('div', { className: 'px-6 py-4 border-b border-gray-200 flex items-center justify-between' },
                    React.createElement('h2', { className: 'text-xl font-semibold text-gray-900' }, 'Add New External Agent'),
                    React.createElement('button', {
                        onClick: () => {
                            setShowExternalAgentModal(false);
                            setNewExternalAgentName('');
                        },
                        className: 'text-gray-400 hover:text-gray-600'
                    }, React.createElement('i', { className: 'fas fa-times text-xl' }))
                ),
                // Body
                React.createElement('div', { className: 'p-6' },
                    React.createElement('div', { className: 'mb-4' },
                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'External Agent Name *'),
                        React.createElement('input', {
                            type: 'text',
                            value: newExternalAgentName,
                            onChange: (e) => setNewExternalAgentName(e.target.value),
                            onKeyDown: (e) => {
                                if (e.key === 'Enter' && !isCreatingExternalAgent) {
                                    handleCreateExternalAgent();
                                } else if (e.key === 'Escape') {
                                    setShowExternalAgentModal(false);
                                    setNewExternalAgentName('');
                                }
                            },
                            placeholder: 'Enter external agent name',
                            className: 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                            autoFocus: true
                        })
                    ),
                    React.createElement('p', { className: 'text-xs text-gray-500 mb-4' }, 'Only administrators can create new external agents.')
                ),
                // Footer
                React.createElement('div', { className: 'px-6 py-4 border-t border-gray-200 flex justify-end gap-3' },
                    React.createElement('button', {
                        onClick: () => {
                            setShowExternalAgentModal(false);
                            setNewExternalAgentName('');
                        },
                        className: 'px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700',
                        disabled: isCreatingExternalAgent
                    }, 'Cancel'),
                    React.createElement('button', {
                        onClick: handleCreateExternalAgent,
                        disabled: !newExternalAgentName.trim() || isCreatingExternalAgent,
                        className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50 disabled:cursor-not-allowed'
                    },
                        isCreatingExternalAgent ? (
                            React.createElement(React.Fragment, null,
                                React.createElement('i', { className: 'fas fa-spinner fa-spin mr-2' }),
                                'Creating...'
                            )
                        ) : (
                            React.createElement(React.Fragment, null,
                                React.createElement('i', { className: 'fas fa-plus mr-2' }),
                                'Create Agent'
                            )
                        )
                    )
                )
            )
        ) : null,
        
        // Manage External Agents Modal - Admin Only
        showManageExternalAgentsModal ? React.createElement('div', {
            className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]',
            onClick: (e) => {
                if (e.target === e.currentTarget) {
                    setShowManageExternalAgentsModal(false);
                }
            }
        },
            React.createElement('div', {
                className: 'bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col',
                onClick: (e) => e.stopPropagation()
            },
                // Header
                React.createElement('div', { className: 'px-6 py-4 border-b border-gray-200 flex items-center justify-between' },
                    React.createElement('h2', { className: 'text-xl font-semibold text-gray-900' }, 'Manage External Agents'),
                    React.createElement('button', {
                        onClick: () => setShowManageExternalAgentsModal(false),
                        className: 'text-gray-400 hover:text-gray-600'
                    }, React.createElement('i', { className: 'fas fa-times text-xl' }))
                ),
                // Body
                React.createElement('div', { className: 'p-6 overflow-y-auto flex-1' },
                    isLoadingExternalAgents ? (
                        React.createElement('div', { className: 'text-center py-8' },
                            React.createElement('i', { className: 'fas fa-spinner fa-spin text-2xl text-gray-400' }),
                            React.createElement('p', { className: 'mt-2 text-sm text-gray-500' }, 'Loading external agents...')
                        )
                    ) : externalAgents.length === 0 ? (
                        React.createElement('div', { className: 'text-center py-8' },
                            React.createElement('i', { className: 'fas fa-users text-3xl text-gray-300 mb-2' }),
                            React.createElement('p', { className: 'text-gray-500' }, 'No external agents found')
                        )
                    ) : (
                        React.createElement('div', { className: 'space-y-2' },
                            externalAgents.map((agent) =>
                                React.createElement('div', {
                                    key: agent.id,
                                    className: 'flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors'
                                },
                                    React.createElement('div', { className: 'flex-1' },
                                        React.createElement('div', { className: 'font-medium text-gray-900' }, agent.name),
                                        React.createElement('div', { className: 'text-xs text-gray-500 mt-0.5' },
                                            agent.isActive ? (
                                                React.createElement('span', { className: 'text-green-600' }, 'Active')
                                            ) : (
                                                React.createElement('span', { className: 'text-gray-400' }, 'Inactive')
                                            )
                                        )
                                    ),
                                    React.createElement('button', {
                                        type: 'button',
                                        onClick: () => handleDeleteExternalAgent(agent.id, agent.name),
                                        disabled: isDeletingExternalAgent,
                                        className: 'ml-3 px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed',
                                        title: 'Delete external agent'
                                    },
                                        isDeletingExternalAgent ? (
                                            React.createElement('i', { className: 'fas fa-spinner fa-spin' })
                                        ) : (
                                            React.createElement(React.Fragment, null,
                                                React.createElement('i', { className: 'fas fa-trash' }),
                                                React.createElement('span', null, 'Delete')
                                            )
                                        )
                                    )
                                )
                            )
                        )
                    )
                ),
                // Footer
                React.createElement('div', { className: 'px-6 py-4 border-t border-gray-200 flex justify-end' },
                    React.createElement('button', {
                        onClick: () => setShowManageExternalAgentsModal(false),
                        className: 'px-4 py-2 rounded-lg transition-colors bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }, 'Close')
                )
            )
        ) : null
    );
};

// Make available globally
window.LeadDetailModal = LeadDetailModal;
