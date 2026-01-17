// Get React hooks from window
// VERSION: Contact filter updated - removed "All Contacts" option
// DEPLOYMENT FIX: Contact filter now only shows site-specific contacts
// FIX: Added useRef to prevent form reset when user is editing
// FIX: formData initialization moved to top to prevent TDZ errors
const { useState, useEffect, useRef, useCallback } = React;

// Module-level tracking to prevent duplicate loads across remounts
// This persists even if the component remounts
const clientInitialLoadTracker = new Map(); // Map<clientId, Promise>

const ClientDetailModal = ({ client, onSave, onUpdate, onClose, onDelete, allProjects, onNavigateToProject, isFullPage = false, isEditing = false, hideSearchFilters = false, initialTab = 'overview', onTabChange, onPauseSync, onEditingChange, onOpenOpportunity, entityType = 'client', onConvertToClient }) => {
    // entityType: 'client' or 'lead' - determines terminology and behavior
    const isLead = entityType === 'lead';
    const entityLabel = isLead ? 'Lead' : 'Client';
    const entityLabelLower = isLead ? 'lead' : 'client';
    // CRITICAL: Initialize formData FIRST, before any other hooks or refs that might reference it
    // This prevents "Cannot access 'formData' before initialization" errors
    const mergeUniqueById = (items = [], extras = []) => {
        // CRITICAL: Deduplicate by name+email FIRST, then by ID
        // This prevents duplicates with same name/email but different IDs
        const mapByKey = new Map(); // Primary: deduplicate by name+email
        
        [...(items || []), ...(extras || [])].forEach(item => {
            if (!item) return;
            
            // Create a unique key from name+email for primary deduplication
            const name = String(item.name || '').toLowerCase().trim();
            const email = String(item.email || '').toLowerCase().trim();
            const key = name || email ? `${name}::${email}` : null;
            
            if (key) {
                // Primary deduplication by name+email
                if (mapByKey.has(key)) {
                    // Same name+email already exists - keep the one with more data
                    const existing = mapByKey.get(key);
                    const existingFieldCount = Object.values(existing).filter(v => v !== null && v !== undefined && v !== '').length;
                    const newFieldCount = Object.values(item).filter(v => v !== null && v !== undefined && v !== '').length;
                    
                    // If new item has more data, replace; otherwise keep existing
                    if (newFieldCount > existingFieldCount) {
                        mapByKey.set(key, item);
                    }
                } else {
                    // First occurrence of this name+email combination
                    mapByKey.set(key, item);
                }
            } else if (item.id) {
                // No name/email but has ID - use ID as fallback key
                const id = String(item.id);
                if (!mapByKey.has(id)) {
                    mapByKey.set(id, item);
                }
            }
        });
        
        return Array.from(mapByKey.values());
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
            stage: client.stage || (isLead ? 'Awareness' : undefined),
            // CRITICAL: Map stage to aidaStatus for leads - database uses 'stage' but formData uses 'aidaStatus'
            aidaStatus: client.aidaStatus || client.stage || (isLead ? 'Awareness' : undefined),
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
            type: entityType, // Use entityType ('client' or 'lead')
            industry: '',
            status: 'active',
            stage: 'Awareness',
            aidaStatus: 'Awareness',
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
    
    // Groups state for Services section
    const [availableGroups, setAvailableGroups] = useState([]);
    const [clientGroupMemberships, setClientGroupMemberships] = useState([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [showGroupSelector, setShowGroupSelector] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    
    // Track if user has edited the form to prevent unwanted resets
    const hasUserEditedForm = useRef(false);
    const lastSavedClientId = useRef(client?.id);
    
    // Use ref to track latest formData for auto-save
    // CRITICAL: Initialize formDataRef immediately with initial formData value
    // This ensures tabs can access data immediately on first render without waiting for useEffect
    const initialFormData = (() => {
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
            stage: client.stage || (isLead ? 'Awareness' : undefined),
            aidaStatus: client.aidaStatus || client.stage || (isLead ? 'Awareness' : undefined),
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
            type: entityType,
            industry: '',
            status: 'active',
            stage: 'Awareness',
            aidaStatus: 'Awareness',
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
    })();
    const formDataRef = useRef(initialFormData);
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
    const pendingTimeoutsRef = useRef([]); // Track all pending timeouts to cancel on unmount
    
    // Track which client ID we've already loaded sites for to prevent infinite loops
    const sitesLoadedForClientIdRef = useRef(null);
    
    // Track initial loading state to prevent jittery progressive rendering
    // Only render full content once all initial data loads are complete
    const [isInitialLoading, setIsInitialLoading] = useState(false);
    const initialLoadPromiseRef = useRef(null); // Track the Promise.all for initial load
    const initialDataLoadedForClientIdRef = useRef(null); // Track which client we've done initial load for
    
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
        // Removed excessive logging - only log on actual meaningful changes
    }, [formData]);
    
    // Track last processed client data to detect changes
    const lastClientDataRef = useRef({ followUps: null, notes: null, comments: null, id: null });
    
    // Track when a save just happened to prevent immediate overwriting
    const justSavedRef = useRef(false);
    const saveTimestampRef = useRef(0);
    
    // CRITICAL: Update formData when client prop changes (for followUps, notes, comments persistence)
    // This ensures data persists when navigating away and back, or on page refresh
    useEffect(() => {
        if (!client || !client.id) return;
        
        // Skip if user is currently editing or auto-saving - don't overwrite their changes
        if (isEditingRef.current || isAutoSavingRef.current) {
            return;
        }
        
        // Skip if user has edited the form - don't overwrite their changes
        if (hasUserEditedForm.current) {
            return;
        }
        
        // CRITICAL: Don't overwrite immediately after a save (within 2 seconds)
        // This prevents the useEffect from overwriting data that was just saved
        const timeSinceSave = Date.now() - saveTimestampRef.current;
        if (justSavedRef.current && timeSinceSave < 2000) {
            console.log('⏸️ Skipping update - save just happened', { timeSinceSave });
            return;
        }
        
        // Only update if client prop has changed (not just a re-render)
        const currentClientId = formDataRef.current?.id;
        if (currentClientId !== client.id) {
            // Different client - reset tracking and let the main useEffect handle it
            lastClientDataRef.current = { followUps: null, notes: null, comments: null, id: client.id };
            justSavedRef.current = false;
            return;
        }
        
        // Parse followUps, notes, and comments from client prop
        const clientFollowUps = typeof client.followUps === 'string' 
            ? (client.followUps.trim() ? JSON.parse(client.followUps) : [])
            : (Array.isArray(client.followUps) ? client.followUps : []);
        const clientNotes = client.notes !== undefined && client.notes !== null 
            ? String(client.notes) 
            : (formDataRef.current?.notes || '');
        const clientComments = typeof client.comments === 'string' 
            ? (client.comments.trim() ? JSON.parse(client.comments) : [])
            : (Array.isArray(client.comments) ? client.comments : []);
        
        // CRITICAL: Compare with CURRENT formData, not just last processed data
        // This prevents overwriting data that's already in formData
        const currentFormData = formDataRef.current || {};
        const currentFormFollowUps = currentFormData.followUps || [];
        const currentFormNotes = currentFormData.notes || '';
        const currentFormComments = currentFormData.comments || [];
        
        const currentFormFollowUpsStr = JSON.stringify(currentFormFollowUps);
        const currentFormCommentsStr = JSON.stringify(currentFormComments);
        const clientFollowUpsStr = JSON.stringify(clientFollowUps);
        const clientCommentsStr = JSON.stringify(clientComments);
        
        // Only update if client prop data is DIFFERENT from current formData
        const followUpsDifferent = clientFollowUpsStr !== currentFormFollowUpsStr;
        const notesDifferent = clientNotes !== currentFormNotes;
        const commentsDifferent = clientCommentsStr !== currentFormCommentsStr;
        
        // Also check against last processed data to avoid unnecessary updates
        const lastFollowUpsStr = JSON.stringify(lastClientDataRef.current.followUps);
        const lastNotes = lastClientDataRef.current.notes;
        const lastCommentsStr = JSON.stringify(lastClientDataRef.current.comments);
        
        const followUpsChanged = clientFollowUpsStr !== lastFollowUpsStr;
        const notesChanged = clientNotes !== lastNotes;
        const commentsChanged = clientCommentsStr !== lastCommentsStr;
        
        // Only update if:
        // 1. Client prop data is different from last processed data (to avoid duplicate updates)
        // 2. AND client prop data is different from current formData (to avoid overwriting with same data)
        if ((followUpsChanged && followUpsDifferent) || (notesChanged && notesDifferent) || (commentsChanged && commentsDifferent)) {
            console.log('🔄 Updating formData from client prop (followUps/notes/comments):', {
                clientId: client.id,
                followUpsChanged: followUpsChanged && followUpsDifferent,
                notesChanged: notesChanged && notesDifferent,
                commentsChanged: commentsChanged && commentsDifferent,
                followUpsCount: clientFollowUps.length,
                notesLength: clientNotes.length,
                commentsCount: clientComments.length,
                currentFormFollowUpsCount: currentFormFollowUps.length,
                currentFormNotesLength: currentFormNotes.length,
                currentFormCommentsCount: currentFormComments.length
            });
            
            // Update tracking ref
            lastClientDataRef.current = {
                followUps: clientFollowUps,
                notes: clientNotes,
                comments: clientComments,
                id: client.id
            };
            
            setFormData(prev => {
                const updated = {
                    ...prev,
                    ...(followUpsChanged && followUpsDifferent ? { followUps: clientFollowUps } : {}),
                    ...(notesChanged && notesDifferent ? { notes: clientNotes } : {}),
                    ...(commentsChanged && commentsDifferent ? { comments: clientComments } : {})
                };
                formDataRef.current = updated;
                return updated;
            });
        } else {
            // Update tracking ref even if we don't update formData (to prevent future unnecessary updates)
            lastClientDataRef.current = {
                followUps: clientFollowUps,
                notes: clientNotes,
                comments: clientComments,
                id: client.id
            };
        }
    }, [client]);
    
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
    // CRITICAL: Don't reset the active tab while we're auto-saving (e.g. adding comments/notes)
    // Otherwise, saving a note can cause the UI to jump back to the Overview tab.
    useEffect(() => {
        // If we're auto-saving, preserve the current tab and skip updates from initialTab
        if (isAutoSavingRef.current) {
            return;
        }
        
        // If user tries to access contracts tab but is not admin, default to overview
        if (initialTab === 'contracts' && !isAdmin) {
            setActiveTab('overview');
        } else if (initialTab && initialTab !== activeTab) {
            // Only update if the desired tab is different from the current one
            setActiveTab(initialTab);
        }
    }, [initialTab, isAdmin, activeTab]);
    
    // MANUFACTURING PATTERN: Only sync formData when client ID changes (switching to different client)
    // Reset initial loading state when client changes
    useEffect(() => {
        if (client?.id) {
            // Check if client already has complete data - if so, no need for initial loading
            const hasContacts = client.contacts && Array.isArray(client.contacts) && client.contacts.length >= 0;
            const hasSites = client.sites && Array.isArray(client.sites) && client.sites.length >= 0;
            // If client has the expected structure (even if arrays are empty), we can consider it "loaded"
            // Initial loading will be set based on whether we actually need to fetch additional data
        } else {
            // No client - not loading
            setIsInitialLoading(false);
        }
    }, [client?.id]);
    
    // CLEAN SOLUTION: Single useEffect to load all data when client.id changes
    // This replaces the complex competing sync logic with a simple, predictable flow
    useEffect(() => {
        // If no client, reset formData to empty
        if (!client) {
            setIsInitialLoading(false);
            return;
        }
        
        const clientId = client?.id;
        if (!clientId) {
            setIsInitialLoading(false);
            return;
        }
        
        // CRITICAL: Always load data when client.id changes to ensure fresh data
        // Only skip if we're currently loading the SAME client (prevent duplicate calls)
        // Don't skip based on editing state - we want fresh data even if user is editing
        if (isLoadingClientRef.current && initialDataLoadedForClientIdRef.current === clientId) {
            console.log('⏭️ Already loading data for this client, skipping duplicate call');
            return;
        }
        
        // Reset the loaded flag when client changes to ensure we load fresh data
        if (initialDataLoadedForClientIdRef.current !== clientId) {
            initialDataLoadedForClientIdRef.current = null;
        }
        
        // CRITICAL: Don't set loading state - formData already has client prop data
        // This ensures tabs render immediately without waiting for API calls
        // Only mark as loading if formData is empty (new client)
        const hasExistingData = formDataRef.current && (
            (formDataRef.current.contacts && formDataRef.current.contacts.length > 0) ||
            (formDataRef.current.sites && formDataRef.current.sites.length > 0) ||
            (formDataRef.current.opportunities && formDataRef.current.opportunities.length > 0)
        );
        
        if (!hasExistingData) {
            setIsInitialLoading(true);
        }
        isLoadingClientRef.current = true;
        
        // CRITICAL: Load all data immediately when modal opens
        // This ensures all tabs have data available immediately when user switches tabs
        // No deferral - start loading right away
        const loadAllData = async () => {
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    console.log('⏭️ Skipping data load - no token');
                    setIsInitialLoading(false);
                    return;
                }
                
                // Load contacts, sites, and opportunities sequentially to prevent rate limiting
                // Sequential loading allows the rate limiter to properly throttle requests
                const contactsResponse = await window.api.getContacts(clientId).catch(() => ({ data: { contacts: [] } }));
                const contacts = contactsResponse?.data?.contacts || [];
                
                // Small delay between requests to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const sitesResponse = await window.api.getSites(clientId).catch(() => ({ data: { sites: [] } }));
                const sites = sitesResponse?.data?.sites || [];
                
                // Small delay between requests to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const opportunitiesResponse = await window.api.getOpportunitiesByClient(clientId).catch(() => ({ data: { opportunities: [] } }));
                const opportunities = opportunitiesResponse?.data?.opportunities || [];
                
                // Parse client data (handle JSON strings)
                const parsedClient = {
                    ...client,
                    contacts: typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []),
                    sites: typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []),
                    opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
                    followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
                    projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
                    comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
                    contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
                    activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
                    services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || []),
                    // CRITICAL: Map stage to aidaStatus for leads - database uses 'stage' but formData uses 'aidaStatus'
                    aidaStatus: client.aidaStatus || client.stage || (isLead ? 'Awareness' : undefined),
                    billingTerms: typeof client.billingTerms === 'string' ? JSON.parse(client.billingTerms || '{}') : (client.billingTerms || {
                        paymentTerms: 'Net 30',
                        billingFrequency: 'Monthly',
                        currency: 'ZAR',
                        retainerAmount: 0,
                        taxExempt: false,
                        notes: ''
                    })
                };
                
                // CRITICAL: Always use API data when available (it's the most up-to-date)
                // Only fallback to existing formData if API returned empty and we have existing data
                // This ensures tabs always show the latest data immediately
                const currentFormData = formDataRef.current || {};
                const existingContacts = currentFormData.contacts || [];
                const existingSites = currentFormData.sites || [];
                const existingOpportunities = currentFormData.opportunities || [];
                
                // Prioritize API data - it's always more up-to-date
                // Only use existing data if API returned empty and we have existing data
                const finalContacts = contacts.length > 0 ? contacts : (existingContacts.length > 0 ? existingContacts : (parsedClient.contacts || []));
                const finalSites = sites.length > 0 ? sites : (existingSites.length > 0 ? existingSites : (parsedClient.sites || []));
                const finalOpportunities = opportunities.length > 0 ? opportunities : (existingOpportunities.length > 0 ? existingOpportunities : (parsedClient.opportunities || []));
                
                const mergedData = {
                    ...parsedClient,
                    contacts: finalContacts,
                    sites: finalSites,
                    opportunities: finalOpportunities
                };
                
                // CRITICAL: Always update formData immediately when API data arrives
                // This ensures tabs have data available immediately when user switches tabs
                // No conditional checks - just update immediately
                setFormData(mergedData);
                formDataRef.current = mergedData;
                
                // Mark as loaded
                initialDataLoadedForClientIdRef.current = clientId;
                lastProcessedClientRef.current = client;
                
            } catch (error) {
                console.error('❌ Error loading client data:', error);
            } finally {
                setIsInitialLoading(false);
                isLoadingClientRef.current = false;
            }
        };
        
        // CRITICAL: Load ALL data immediately when client modal opens
        // This ensures all tabs have data available immediately when user switches tabs
        // formData is already initialized with client prop data, so tabs render immediately
        // API data will update formData immediately when it arrives (no transition delay)
        // Start loading immediately - don't wait for anything
        loadAllData().catch(error => {
            console.error('❌ Error in loadAllData:', error);
            setIsInitialLoading(false);
            isLoadingClientRef.current = false;
        });
        
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [client?.id]); // Only reload when client.id changes
    
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
    
    // Job cards state - MUST be declared before loadJobCards function
    const [jobCards, setJobCards] = useState([]);
    const [loadingJobCards, setLoadingJobCards] = useState(false);
    
    // Refs to prevent duplicate loading calls - MUST be declared before loadJobCards function
    const isLoadingJobCardsRef = useRef(false);
    const lastLoadedClientIdRef = useRef(null);
    const lastLoadedClientNameRef = useRef(null);
    const jobCardsRef = useRef([]); // Ref to track current jobCards without causing re-renders
    
    // Load job cards for this client - MUST be defined before useEffect hooks that use it
    const loadJobCards = useCallback(async () => {
        if (!client?.id) {
            setJobCards([]);
            jobCardsRef.current = [];
            lastLoadedClientIdRef.current = null;
            lastLoadedClientNameRef.current = null;
            return Promise.resolve([]);
        }
        
        const clientId = String(client.id);
        const clientName = client?.name || null;
        
        // Prevent duplicate calls: if already loading, return empty array (will be handled by deduplicator)
        if (isLoadingJobCardsRef.current) {
            return jobCardsRef.current || [];
        }
        
        // Only check clientId, not name - name changes shouldn't trigger reload
        // If lastLoadedClientIdRef is null, it means we're doing an initial load - always proceed
        // Otherwise, if same client already loaded, skip
        if (lastLoadedClientIdRef.current === clientId && lastLoadedClientIdRef.current !== null) {
            // Same client already loaded, return existing job cards from ref
            return jobCardsRef.current || [];
        }
        
        const token = window.storage?.getToken?.();
        if (!token) {
            setLoadingJobCards(false);
            isLoadingJobCardsRef.current = false;
            return [];
        }
        
        // Use global request deduplication to prevent duplicate API calls
        const requestKey = window.RequestDeduplicator?.getRequestKey('/api/jobcards', { clientId, pageSize: 1000 });
        
        try {
            // Use deduplicator if available
            if (window.RequestDeduplicator) {
                await window.RequestDeduplicator.deduplicate(requestKey, async () => {
                    isLoadingJobCardsRef.current = true;
                    setLoadingJobCards(true);
                    
                    try {
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
                            const jobCards = data.jobCards || data.data?.jobCards || [];
                            if (jobCards.length > 0) {
                                setJobCards(jobCards);
                                jobCardsRef.current = jobCards; // Update ref
                                lastLoadedClientIdRef.current = clientId;
                                lastLoadedClientNameRef.current = clientName;
                                setLoadingJobCards(false);
                                isLoadingJobCardsRef.current = false;
                                return { jobCards };
                            }
                        }
                        
                        // Fallback: Fetch all job cards and filter by clientId ONLY (strict match)
                        response = await fetch(`/api/jobcards?pageSize=1000`, {
                            headers: { 
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            }
                        });
                        
                        if (response.ok) {
                            data = await response.json();
                            const allJobCards = data.jobCards || data.data?.jobCards || [];
                            console.log(`🔍 Checking ${allJobCards.length} job cards for clientId: ${clientId}`);
                            let matchingJobCards = allJobCards.filter(jc => {
                                // Check multiple possible field names for client ID
                                const jcClientId = jc.clientId || jc.client?.id;
                                const matches = jcClientId && String(jcClientId).trim() === clientId.trim();
                                if (jcClientId && !matches) {
                                    console.log(`⚠️ Job card ${jc.id} has clientId "${jcClientId}" (type: ${typeof jcClientId}), expected "${clientId}"`);
                                }
                                return matches;
                            });
                            console.log(`✅ Found ${matchingJobCards.length} matching job cards for clientId: ${clientId}`);
                            
                            if (matchingJobCards.length > 0) {
                                setJobCards(matchingJobCards);
                                jobCardsRef.current = matchingJobCards; // Update ref
                            } else {
                                setJobCards([]);
                                jobCardsRef.current = []; // Update ref
                            }
                            
                            lastLoadedClientIdRef.current = clientId;
                            lastLoadedClientNameRef.current = clientName;
                            return { jobCards: matchingJobCards };
                        } else {
                            const errorText = await response.text().catch(() => 'Unknown error');
                            console.error('❌ Failed to load job cards:', response.status, errorText);
                            setJobCards([]);
                            jobCardsRef.current = []; // Update ref
                            throw new Error(`Failed to load job cards: ${response.status} ${errorText}`);
                        }
                    } catch (error) {
                        console.error('Error loading job cards:', error);
                        setJobCards([]);
                        jobCardsRef.current = []; // Update ref
                        throw error;
                    } finally {
                        setLoadingJobCards(false);
                        isLoadingJobCardsRef.current = false;
                    }
                }, 2000); // 2 second deduplication window
            } else {
                // Fallback to original logic if RequestDeduplicator is not available
                isLoadingJobCardsRef.current = true;
                setLoadingJobCards(true);
                
                try {
                    let response = await fetch(`/api/jobcards?clientId=${encodeURIComponent(clientId)}&pageSize=1000`, {
                        headers: { 
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    let data = null;
                    
                    if (response.ok) {
                        data = await response.json();
                        const jobCards = data.jobCards || data.data?.jobCards || [];
                        if (jobCards.length > 0) {
                            setJobCards(jobCards);
                            jobCardsRef.current = jobCards; // Update ref
                            lastLoadedClientIdRef.current = clientId;
                            lastLoadedClientNameRef.current = clientName;
                            setLoadingJobCards(false);
                            isLoadingJobCardsRef.current = false;
                            return { jobCards };
                        }
                    }
                    
                    setJobCards([]);
                    jobCardsRef.current = []; // Update ref
                    lastLoadedClientIdRef.current = clientId;
                    lastLoadedClientNameRef.current = clientName;
                    setLoadingJobCards(false);
                    isLoadingJobCardsRef.current = false;
                    return { jobCards: [] };
                } catch (error) {
                    console.error('Error loading job cards:', error);
                    setJobCards([]);
                    jobCardsRef.current = []; // Update ref
                    setLoadingJobCards(false);
                    isLoadingJobCardsRef.current = false;
                    throw error;
                }
            }
        } catch (error) {
            // Error already handled in the inner try-catch
            setLoadingJobCards(false);
            isLoadingJobCardsRef.current = false;
            return jobCardsRef.current || [];
        }
    }, [client?.id]); // FIXED: Removed jobCards from deps to prevent infinite loop
    
    // Reload job cards when Service & Maintenance tab is opened
    useEffect(() => {
        if (activeTab === 'service-maintenance' && client?.id) {
            // Force reload by resetting the ref, then load
            const originalLoadedClientId = lastLoadedClientIdRef.current;
            lastLoadedClientIdRef.current = null;
            loadJobCards().finally(() => {
                // If loadJobCards didn't set the ref (e.g., error), restore original
                if (lastLoadedClientIdRef.current === null) {
                    lastLoadedClientIdRef.current = originalLoadedClientId;
                }
            });
        }
    }, [activeTab, client?.id, loadJobCards]);

    // REMOVED: Auto-restore saved tab from localStorage
    // Clients and leads should always default to 'overview' when opened, not restore the last tab
    // Tab selection is still saved to localStorage for other purposes, but not auto-restored on open
    
    // CRITICAL: Always reset to 'overview' when client/lead ID changes
    // This ensures that opening a different client/lead always starts on Overview tab
    // previousClientIdRef already declared above at line 618
    useEffect(() => {
        const currentClientId = client?.id;
        const previousClientId = previousClientIdRef.current;
        
        // CRITICAL: Don't reset tab if we're auto-saving (e.g. adding comments/notes)
        // This prevents the tab from jumping to Overview when saving a comment
        if (isAutoSavingRef.current) {
            return;
        }
        
        // Only reset if we're switching to a different client/lead
        if (currentClientId && currentClientId !== previousClientId) {
            // Always default to 'overview' when opening a new client/lead
            // Only use initialTab if it's explicitly set via URL query params (not from state persistence)
            const shouldUseInitialTab = initialTab && initialTab !== 'overview' && 
                                       (window.location.search?.includes('tab=') || 
                                        window.location.hash?.includes('tab='));
            
            if (shouldUseInitialTab) {
                // URL explicitly requested a tab - respect it
                setActiveTab(initialTab);
                if (onTabChange) {
                    onTabChange(initialTab);
                }
            } else {
                // Default to 'overview' when opening a new client/lead
                setActiveTab('overview');
                if (onTabChange) {
                    onTabChange('overview');
                }
            }
            
            previousClientIdRef.current = currentClientId;
        } else if (currentClientId) {
            // Same client, just update the ref
            previousClientIdRef.current = currentClientId;
        }
    }, [client?.id, initialTab, onTabChange]); // Run when client ID or initialTab changes
    
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
    
    // Load sites from database
    const loadSitesFromDatabase = useCallback(async (clientId) => {
        // FIXED: Don't load if client ID doesn't match current client (prevents race conditions)
        if (client?.id && String(client.id) !== String(clientId)) {
            console.log(`⏭️ Skipping loadSitesFromDatabase - client ID mismatch (current: ${client.id}, requested: ${clientId})`);
            return Promise.resolve([]);
        }
        
        const token = window.storage?.getToken?.();
        if (!token) {
            console.log('⏭️ Skipping loadSitesFromDatabase - no token');
            return Promise.resolve([]);
        }
        
        // Prevent duplicate requests with local ref check
                    if (isLoadingSitesRef.current) {
                        console.log('⏭️ Skipping loadSitesFromDatabase - already loading');
            return Promise.resolve([]);
                    }
                    
                    isLoadingSitesRef.current = true;
                    console.log(`📡 Loading sites from database for client: ${clientId}`);
                    
                    try {
                        const response = await window.api.getSites(clientId);
                        const sites = response?.data?.sites || [];
                        console.log(`✅ Loaded ${sites.length} sites from database for client: ${clientId}`);
                        
                        // Mark as loaded for this client to prevent infinite loop
                        sitesLoadedForClientIdRef.current = String(clientId);
                        
                        // CRITICAL FIX: Merge with existing sites to prevent duplicates
            console.log(`🔧 About to call setFormData with ${sites.length} sites`);
            try {
                const currentFormData = formDataRef.current || {};
                const existingSites = currentFormData.sites || [];
                            const mergedSites = mergeUniqueById([...sites, ...existingSites, ...optimisticSites]);
                            const updated = {
                    ...currentFormData,
                                sites: mergedSites
                            };
                            console.log(`✅ Merged sites: ${mergedSites.length} total (${sites.length} from DB, ${existingSites.length} existing, ${optimisticSites.length} optimistic)`);
                
                // CRITICAL: Use functional update to ensure React detects the change
                console.log(`🔧🔧🔧 CALLING setFormData with functional update for sites (sites: ${mergedSites.length})`);
                setFormData(prevFormData => {
                    const currentFormData = prevFormData || {};
                    console.log(`🔧🔧🔧 INSIDE setFormData callback for sites - prevFormData.sites.length=${currentFormData.sites?.length || 0}`);
                    
                    // Create completely new object with new array references
                    const updated = {
                        ...currentFormData,
                        sites: [...mergedSites], // New array reference
                        _lastUpdated: Date.now() // Timestamp to force change detection
                    };
                    
                    // Update ref
                    formDataRef.current = updated;
                    console.log(`🔧🔧🔧 RETURNING updated formData from callback for sites (sites: ${updated.sites.length})`);
                    return updated;
                });
                console.log(`✅ setFormData called successfully for sites`);
            } catch (error) {
                console.error('❌ Error in setFormData for sites:', error);
                throw error;
            }

                        // Remove optimistic sites that now exist in database
                    setOptimisticSites(prev => {
                        const filtered = prev.filter(opt => !sites.some(db => db.id === opt.id));
                        if (filtered.length !== prev.length) {
                            console.log(`✅ Removed ${prev.length - filtered.length} optimistic sites (now confirmed in DB)`);
                        }
                        return filtered;
                    });
                        
            return sites; // Return sites array directly
        } catch (error) {
            console.error('❌ Error loading sites from database:', error);
            return []; // Return empty array on error
        } finally {
            isLoadingSitesRef.current = false;
        }
    }, [client?.id, optimisticSites]);
    
    // REMOVED: Tab-specific job cards loading
    // Job cards are now loaded immediately when client opens (in the main client load useEffect)
    // This prevents reloading when clicking tabs and ensures counts appear immediately
    
    // REMOVED: Tab-specific sites loading
    // Sites are now loaded immediately when client opens (in the main client load useEffect)
    // This prevents reloading when clicking tabs and ensures counts appear immediately

    // Handle job card click - navigate to full job card detail page
    const handleJobCardClick = (jobCard) => {
        // Always use database ID for faster lookup (not jobCardNumber)
        const jobCardId = jobCard.id;
        if (jobCardId) {
            // Use the navigation event system to navigate to the full job card detail page
            window.dispatchEvent(new CustomEvent('navigateToPage', { 
                detail: { 
                    page: 'service-maintenance',
                    subpath: [jobCardId]
                } 
            }));
        }
    };
    
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
        // OLD COMPLEX LOGIC REMOVED - replaced with clean solution above
        // This useEffect is now empty and will be removed
        if (false && client?.id) {
            const currentClientId = String(client.id);
            const clientIdChanged = currentClientId !== lastSavedClientId.current;
            
            // CRITICAL FIX: Use module-level tracker to prevent duplicate loads even across remounts
            // Check if we're already loading this client (using module-level Map)
            const existingLoadPromise = clientInitialLoadTracker.get(currentClientId);
            const isAlreadyLoading = !!existingLoadPromise;
            
            console.log('🔍 ClientDetailModal state check (before reset):', {
                currentClientId,
                lastSavedClientId: lastSavedClientId.current,
                clientIdChanged,
                initialDataLoadedForClientId: initialDataLoadedForClientIdRef.current,
                hasPromise: !!initialLoadPromiseRef.current,
                moduleTrackerHasPromise: isAlreadyLoading
            });
            
            // CRITICAL FIX: Early guard check - if we're already loading this client, skip entirely
            // Check module-level tracker (persists across remounts) OR ref/promise (current mount)
            if (isAlreadyLoading || initialDataLoadedForClientIdRef.current === currentClientId || initialLoadPromiseRef.current) {
                console.log('⏭️ ClientDetailModal: Initial load already in progress or completed, skipping', {
                    refValue: initialDataLoadedForClientIdRef.current,
                    currentClientId,
                    hasPromise: !!initialLoadPromiseRef.current,
                    moduleTrackerHasPromise: isAlreadyLoading,
                    refMatches: initialDataLoadedForClientIdRef.current === currentClientId
                });
                return;
            }
            
            // Update lastSavedClientId if client changed
            if (clientIdChanged) {
                console.log('🔄 Client ID changed, resetting state');
                lastSavedClientId.current = currentClientId;
                lastProcessedClientRef.current = currentClientId;
                // Reset edit flag when switching clients
                hasUserEditedForm.current = false;
                // Clear optimistic updates when switching clients
                setOptimisticContacts([]);
                setOptimisticSites([]);
                // Reset sites loaded flag when client changes
                sitesLoadedForClientIdRef.current = null;
                // Reset initial data loaded flag when client changes - need to load again for new client
                initialDataLoadedForClientIdRef.current = null;
            }
            
            // CRITICAL FIX: Check if we've already loaded initial data for this client (AFTER reset)
            // Also check module-level tracker to catch loads that completed but ref wasn't set yet
            // This prevents duplicate loads while still allowing initial load when needed
            const hasLoadedInitialData = initialDataLoadedForClientIdRef.current === currentClientId || clientInitialLoadTracker.has(currentClientId);
            
            // Only load from database if:
            // 1. Client ID changed (switching to different client), OR
            // 2. Form hasn't been edited AND we haven't loaded initial data yet
            // This ensures data always loads on first open, but doesn't reload unnecessarily
            const shouldLoadFromDatabase = clientIdChanged || (!hasUserEditedForm.current && !hasLoadedInitialData);
            
            // Parse all JSON strings from API response
            // CRITICAL FIX: Prioritize normalized table data over JSON fields to prevent duplicates
            // If clientContacts relation exists, use ONLY that (parseClientJsonFields already converted it to contacts)
            // Ignore any JSON field contacts to prevent duplicates
            
            let finalContacts = [];
            
            // Check if we have normalized contacts (from parseClientJsonFields on API side)
            if (client.contacts && Array.isArray(client.contacts) && client.contacts.length > 0) {
                // API already ran parseClientJsonFields, so contacts are from normalized tables
                finalContacts = client.contacts;
            } else if (client.clientContacts && Array.isArray(client.clientContacts) && client.clientContacts.length > 0) {
                // Fallback: if relation object still exists, convert it
                finalContacts = client.clientContacts.map(contact => ({
                    id: contact.id,
                    name: contact.name,
                    email: contact.email || '',
                    phone: contact.phone || '',
                    mobile: contact.mobile || '',
                    role: contact.role || '',
                    title: contact.title || '',
                    isPrimary: contact.isPrimary || false,
                    notes: contact.notes || ''
                }));
            } else {
                // Last resort: parse from JSON fields (backward compatibility)
                const parsedContacts = typeof client.contacts === 'string' ? JSON.parse(client.contacts || '[]') : (client.contacts || []);
                finalContacts = Array.isArray(parsedContacts) ? parsedContacts : [];
            }
            
            // Ensure contacts are deduplicated by ID
            finalContacts = mergeUniqueById(finalContacts);
            
            // Same logic for sites
            let finalSites = [];
            if (client.sites && Array.isArray(client.sites) && client.sites.length > 0) {
                finalSites = client.sites;
            } else if (client.clientSites && Array.isArray(client.clientSites) && client.clientSites.length > 0) {
                finalSites = client.clientSites.map(site => ({
                    id: site.id,
                    name: site.name,
                    address: site.address || '',
                    contactPerson: site.contactPerson || '',
                    contactPhone: site.contactPhone || '',
                    contactEmail: site.contactEmail || '',
                    notes: site.notes || ''
                }));
            } else {
                const parsedSites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
                finalSites = Array.isArray(parsedSites) ? parsedSites : [];
            }
            finalSites = mergeUniqueById(finalSites);
            
            const parsedClient = {
                ...client,
                opportunities: typeof client.opportunities === 'string' ? JSON.parse(client.opportunities || '[]') : (client.opportunities || []),
                sites: finalSites,
                contacts: finalContacts, // Use deduplicated contacts
                followUps: typeof client.followUps === 'string' ? JSON.parse(client.followUps || '[]') : (client.followUps || []),
                comments: typeof client.comments === 'string' ? JSON.parse(client.comments || '[]') : (client.comments || []),
                contracts: typeof client.contracts === 'string' ? JSON.parse(client.contracts || '[]') : (client.contracts || []),
                activityLog: typeof client.activityLog === 'string' ? JSON.parse(client.activityLog || '[]') : (client.activityLog || []),
                projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || []),
                services: typeof client.services === 'string' ? JSON.parse(client.services || '[]') : (client.services || [])
            };
            
            
            // Load data if:
            // 1. Client ID changed (switching to different client), OR
            // 2. We haven't done initial load for this client yet (first time opening)
            // This ensures data always loads immediately when opening a client
            const shouldDoInitialLoad = clientIdChanged || !hasLoadedInitialData;
            
            // Only set formData if we should load (new client or not edited)
            // CRITICAL FIX: Use functional update to preserve contacts/sites/opportunities that have been loaded from database
            // This prevents overwriting contacts that were loaded by loadContactsFromDatabase
            // Also, only set formData if we're doing initial load (not if already loaded)
            if (shouldLoadFromDatabase && shouldDoInitialLoad) {
                setFormData(prevFormData => {
                    // Preserve existing contacts, sites, and opportunities if they've been loaded from database
                    // Only use parsedClient values if we don't have existing data loaded
                    const existingContacts = prevFormData?.contacts || [];
                    const existingSites = prevFormData?.sites || [];
                    const existingOpportunities = prevFormData?.opportunities || [];
                    
                    // Use parsedClient data, but preserve loaded contacts/sites/opportunities if they exist
                    // This prevents resetting contacts that were loaded by loadContactsFromDatabase
                    return {
                        ...parsedClient,
                        contacts: existingContacts.length > 0 ? existingContacts : (parsedClient.contacts || []),
                        sites: existingSites.length > 0 ? existingSites : (parsedClient.sites || []),
                        opportunities: existingOpportunities.length > 0 ? existingOpportunities : (parsedClient.opportunities || [])
                    };
                });
            }
            
            // CRITICAL FIX: Don't reload contacts/sites if they're already in the client object
            // The API already returns normalized data via parseClientJsonFields
            // Loading again causes duplicates
            const hasContactsInClient = parsedClient.contacts && Array.isArray(parsedClient.contacts) && parsedClient.contacts.length > 0;
            const hasSitesInClient = parsedClient.sites && Array.isArray(parsedClient.sites) && parsedClient.sites.length > 0;
            
            // DEBUG: Log loading conditions
            console.log('🔍 ClientDetailModal loading check:', {
                currentClientId,
                clientIdChanged,
                hasUserEditedForm: hasUserEditedForm.current,
                hasLoadedInitialData,
                shouldLoadFromDatabase,
                shouldDoInitialLoad,
                willLoad: shouldLoadFromDatabase && shouldDoInitialLoad
            });
            
            // Load data from database if we should load AND form hasn't been edited
            if (shouldLoadFromDatabase && shouldDoInitialLoad) {
                console.log('✅ Starting initial data load for client:', currentClientId);
                console.log(`📊 Initial load state: criticalLoadPromises will be created, hasUserEditedForm=${hasUserEditedForm.current}`);
                // CRITICAL: Set ref and module-level tracker IMMEDIATELY to prevent duplicate loads
                // BUT: Don't set initialDataLoadedForClientIdRef yet - wait until after load completes
                // Setting it now would cause loadContactsFromDatabase to skip on initial load
                
                // Cancel any existing pending timeouts for this client
                pendingTimeoutsRef.current.forEach(timeoutId => {
                    clearTimeout(timeoutId);
                });
                pendingTimeoutsRef.current = [];
                
                // FIXED: Load ALL data immediately in parallel - no tab-specific loading
                // This ensures counts appear immediately and don't reload when clicking tabs
                const loadPromises = [];
                const criticalLoadPromises = []; // Loads that affect count badges (sites, contacts, opportunities, job cards)
                
                // Always load opportunities immediately (affects count badge)
                console.log(`🚀 About to call loadOpportunitiesFromDatabase for client: ${client.id}`);
                const opportunitiesPromise = loadOpportunitiesFromDatabase(client.id);
                console.log(`🚀 loadOpportunitiesFromDatabase returned promise:`, opportunitiesPromise);
                loadPromises.push(opportunitiesPromise);
                criticalLoadPromises.push(opportunitiesPromise);
                
                // Always load job cards immediately (affects service-maintenance tab count)
                // For initial load, we want to force a reload even if previously loaded
                // So we temporarily reset the ref, then load
                const originalLoadedClientId = lastLoadedClientIdRef.current;
                lastLoadedClientIdRef.current = null;
                const jobCardsPromise = (async () => {
                    try {
                        const result = await loadJobCards();
                        return result || [];
                    } catch (error) {
                        console.error('❌ Error loading job cards in initial load:', error);
                        return []; // Return empty array on error
                    } finally {
                        // Restore original value after loading attempt (or keep new value if successful)
                        // The loadJobCards function will set lastLoadedClientIdRef.current if successful
                        if (lastLoadedClientIdRef.current === null) {
                            lastLoadedClientIdRef.current = originalLoadedClientId;
                        }
                    }
                })();
                loadPromises.push(jobCardsPromise);
                criticalLoadPromises.push(jobCardsPromise);
                
                // ALWAYS load contacts immediately on initial load to ensure we have the latest data
                // Even if client object has contacts, we still load from DB to get the most up-to-date count
                // This prevents the count from changing when clicking the tab
                console.log(`🚀 About to call loadContactsFromDatabase for client: ${client.id}`);
                const contactPromise = loadContactsFromDatabase(client.id);
                console.log(`🚀 loadContactsFromDatabase returned promise:`, contactPromise);
                loadPromises.push(contactPromise);
                criticalLoadPromises.push(contactPromise);
                
                // ALWAYS load sites immediately on initial load to ensure we have the latest data
                // Even if client object has sites, we still load from DB to get the most up-to-date count
                // This prevents the count from changing when clicking the tab
                const sitesPromise = loadSitesFromDatabase(client.id);
                loadPromises.push(sitesPromise);
                criticalLoadPromises.push(sitesPromise);
                
                // CRITICAL FIX: Skip loadClientFromDatabase if contacts are already present OR being loaded
                // When contacts are present, it means the client object came from the API with all data parsed
                // When contacts are being loaded, we should wait for that to complete to avoid race conditions
                // Calling loadClientFromDatabase again causes a reload/re-render because:
                // 1. The API's parseClientJsonFields formats contacts differently (cross-populates phone/mobile)
                // 2. Even though we preserve existing contacts, the setFormData call triggers a re-render
                // 3. This causes the contact to "reload with another version" as reported
                // The initial client object from API already has contacts, comments, followUps, etc. parsed
                // So we don't need to reload unless contacts are missing AND not being loaded
                if (!hasContactsInClient && !isLoadingContactsRef.current) {
                    // Only load if contacts are missing AND not being loaded - this means we need to fetch everything
                    const clientPromise = loadClientFromDatabase(client.id);
                    loadPromises.push(clientPromise);
                    criticalLoadPromises.push(clientPromise);
                }
                
                // FIX FOR JITTERY LOADING: Track initial loading state to prevent progressive rendering
                // Load ALL data that affects counts immediately, then render everything at once
                if (criticalLoadPromises.length > 0) {
                    setIsInitialLoading(true);
                    // Execute all critical loads (sites, contacts, opportunities, job cards) in parallel
                    // Wait for ALL to complete before showing count badges
                    const loadPromise = Promise.all(criticalLoadPromises)
                        .then(() => {
                            // CRITICAL: Longer delay to ensure all React state updates from setFormData are processed
                            // React batches state updates, so we need to wait for them to complete before rendering
                            return new Promise(resolve => setTimeout(resolve, 200));
                        })
                        .catch(error => {
                            console.error('❌ Error loading critical client data:', error);
                            // On error, reset the ref so we can retry
                            initialDataLoadedForClientIdRef.current = null;
                        })
                        .finally(() => {
                            console.log('✅ Initial data load complete, setting isInitialLoading to false');
                            setIsInitialLoading(false);
                            initialLoadPromiseRef.current = null;
                            // DON'T clear module-level tracker after load completes - keep it until client changes
                            // This prevents duplicate loads if useEffect runs again after completion
                            // The tracker will be cleared when client ID changes (checked in guard)
                            // Ensure ref is set to prevent duplicate loads
                            if (initialDataLoadedForClientIdRef.current !== currentClientId) {
                                initialDataLoadedForClientIdRef.current = currentClientId;
                            }
                        });
                    initialLoadPromiseRef.current = loadPromise;
                    // CRITICAL: Track in module-level Map to prevent duplicates across remounts
                    clientInitialLoadTracker.set(currentClientId, loadPromise);
                } else {
                    // No critical data to load - client object already has everything
                    setIsInitialLoading(false);
                    // Still mark as loaded to prevent duplicate loads
                    initialDataLoadedForClientIdRef.current = currentClientId;
                }
            } else {
                // Not loading from database - client data is already complete
                setIsInitialLoading(false);
            }
            // Removed else block with empty body
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
            
            try {
                const response = await window.api.getClient(clientId);
                
                // Check if response indicates an error
                if (response?.error || response?.status === 'error') {
                    const errorMessage = response?.error?.message || response?.error || 'Failed to load client data';
                    console.error('❌ API returned error:', errorMessage);
                    // Don't show alert for 500 errors - they're likely database issues
                    // Just log and continue with existing form data
                    return;
                }
                
                const dbClient = response?.data?.client;
                
                if (dbClient) {
                    
                    // CRITICAL: API already parsed contacts/sites via parseClientJsonFields
                    // They should already be arrays, not JSON strings
                    // Only parse if they're still strings (backward compatibility)
                    const parsedClient = {
                        ...dbClient,
                        // Skip parsing contacts - API already parsed them via parseClientJsonFields
                        // Parsing again would create different format (cross-populated phone/mobile)
                        contacts: Array.isArray(dbClient.contacts) ? dbClient.contacts : (typeof dbClient.contacts === 'string' ? JSON.parse(dbClient.contacts || '[]') : []),
                        followUps: typeof dbClient.followUps === 'string' ? JSON.parse(dbClient.followUps || '[]') : (Array.isArray(dbClient.followUps) ? dbClient.followUps : []),
                        projectIds: typeof dbClient.projectIds === 'string' ? JSON.parse(dbClient.projectIds || '[]') : (Array.isArray(dbClient.projectIds) ? dbClient.projectIds : []),
                        comments: typeof dbClient.comments === 'string' ? JSON.parse(dbClient.comments || '[]') : (Array.isArray(dbClient.comments) ? dbClient.comments : []),
                        // Skip parsing sites - API already parsed them via parseClientJsonFields
                        sites: Array.isArray(dbClient.sites) ? dbClient.sites : (typeof dbClient.sites === 'string' ? JSON.parse(dbClient.sites || '[]') : []),
                        contracts: typeof dbClient.contracts === 'string' ? JSON.parse(dbClient.contracts || '[]') : (Array.isArray(dbClient.contracts) ? dbClient.contracts : []),
                        activityLog: typeof dbClient.activityLog === 'string' ? JSON.parse(dbClient.activityLog || '[]') : (Array.isArray(dbClient.activityLog) ? dbClient.activityLog : []),
                        billingTerms: typeof dbClient.billingTerms === 'string' ? JSON.parse(dbClient.billingTerms || '{}') : (typeof dbClient.billingTerms === 'object' ? dbClient.billingTerms : {})
                    };
                    
                    
                    // Update formData with the fresh data from database
                    // CRITICAL: Only update comments, followUps, activityLog, contracts, proposals, services
                    // DO NOT update contacts or sites - those are managed separately via their own API endpoints
                    // Updating them here would cause duplicates since they're already loaded from normalized tables
                    setFormData(prevFormData => {
                        // CRITICAL FIX: Preserve existing contacts, sites, and opportunities, but only if they exist
                        // If contacts/sites/opportunities are empty but being loaded, preserve the empty array
                        // This prevents overwriting contacts/sites/opportunities that are being loaded separately
                        // However, if contacts/sites/opportunities are already loaded, preserve them
                        const existingContacts = prevFormData?.contacts || [];
                        const existingSites = prevFormData?.sites || [];
                        const existingOpportunities = prevFormData?.opportunities || [];
                        
                        // Merge new data with existing to ensure no loss
                        const mergedComments = mergeUniqueById(parsedClient.comments || [], prevFormData?.comments || []);
                        const mergedFollowUps = mergeUniqueById(parsedClient.followUps || [], prevFormData?.followUps || []);
                        const mergedContracts = mergeUniqueById(parsedClient.contracts || [], prevFormData?.contracts || []);
                        const mergedProposals = mergeUniqueById(parsedClient.proposals || [], prevFormData?.proposals || []);
                        
                        // CRITICAL FIX: Services are simple string arrays, not objects with IDs
                        // If user has edited services, preserve their current selection
                        // Otherwise, use the database value
                        let mergedServices;
                        if (userEditedFieldsRef.current.has('services')) {
                            // User has edited services - preserve their current selection
                            mergedServices = prevFormData?.services || [];
                        } else {
                            // Use database value, but merge with existing to avoid duplicates
                            const dbServices = Array.isArray(parsedClient.services) ? parsedClient.services : [];
                            const existingServices = Array.isArray(prevFormData?.services) ? prevFormData.services : [];
                            // For string arrays, just combine and remove duplicates
                            mergedServices = [...new Set([...dbServices, ...existingServices])];
                        }
                        
                        const updated = {
                            ...prevFormData,
                            comments: mergedComments,
                            followUps: mergedFollowUps,
                            activityLog: parsedClient.activityLog || prevFormData?.activityLog || [],
                            contracts: mergedContracts,
                            proposals: mergedProposals,
                            services: mergedServices,
                            // Explicitly preserve contacts, sites, and opportunities - NEVER update these here
                            contacts: existingContacts,
                            sites: existingSites,
                            opportunities: existingOpportunities
                        };
                        formDataRef.current = updated;
                        return updated;
                    });
                    
                }
            } catch (apiError) {
                // Handle API errors gracefully
                const errorMessage = apiError?.message || 'Unknown error';
                const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Failed to get client');
                
                console.error('❌ Error loading client from database:', {
                    error: errorMessage,
                    clientId: clientId,
                    isServerError: isServerError
                });
                
                // For server errors (500), don't show alert - likely database issue
                // Continue with existing form data instead of breaking the UI
                if (!isServerError) {
                    // Only show alert for non-server errors (network, auth, etc.)
                    console.warn('⚠️ Client data load failed, continuing with existing data');
                }
            }
        } catch (error) {
            console.error('❌ Unexpected error in loadClientFromDatabase:', error);
        } finally {
            isLoadingClientRef.current = false;
        }
    };

    // Load contacts from database
    const loadContactsFromDatabase = async (clientId) => {
        console.log(`🔍 loadContactsFromDatabase CALLED for client: ${clientId}`);
        console.log(`🔍 Checking conditions: isLoadingContactsRef=${isLoadingContactsRef.current}, hasUserEditedForm=${hasUserEditedForm.current}`);
        try {
            // Prevent duplicate requests
            if (isLoadingContactsRef.current) {
                console.log(`⏭️ Skipping loadContactsFromDatabase - already loading`);
                return Promise.resolve([]);
            }
            
            // Skip loading if form has been edited to preserve optimistic updates
            // CRITICAL: Only skip if initial load has completed AND contacts are already loaded
            // This ensures contacts always load during initial load, even if form was edited
            const currentFormData = formDataRef.current || {};
            const existingContacts = currentFormData.contacts || [];
            if (hasUserEditedForm.current && initialDataLoadedForClientIdRef.current === clientId && existingContacts.length > 0) {
                console.log(`⏭️ Skipping loadContactsFromDatabase - form has been edited, initial load completed, and contacts already exist`);
                return Promise.resolve([]);
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log(`⏭️ Skipping loadContactsFromDatabase - no token`);
                return Promise.resolve([]);
            }
            
            isLoadingContactsRef.current = true;
            console.log(`📡 Loading contacts from database for client: ${clientId}`);
            const response = await window.api.getContacts(clientId);
            const contacts = response?.data?.contacts || [];
            console.log(`✅ Loaded ${contacts.length} contacts from database for client: ${clientId}`);
            
            // CRITICAL FIX: Merge with existing contacts to prevent duplicates
            // The client object may already have contacts from parseClientJsonFields
            console.log(`🔧 About to update formData with ${contacts.length} contacts`);
            console.log(`🔧 DEBUG: contacts array:`, contacts);
            console.log(`🔧 DEBUG: optimisticContacts array:`, optimisticContacts);
            
            // CRITICAL FIX: Get current formData from ref and update directly
            console.log(`🔧🔧🔧 BEFORE setFormData - contacts.length=${contacts.length}`);
            // Reuse currentFormData and existingContacts from earlier in the function
            const currentFormDataForUpdate = formDataRef.current || {};
            const existingContactsForUpdate = currentFormDataForUpdate.contacts || [];
            console.log(`🔧 Existing contacts count: ${existingContactsForUpdate.length}, Optimistic contacts count: ${optimisticContacts.length}`);
            
                // Merge: API contacts + existing contacts + optimistic contacts
                const mergedContacts = mergeUniqueById(contacts, [...existingContactsForUpdate, ...optimisticContacts]);
            console.log(`🔧 Merged contacts array:`, mergedContacts);
            
            // Create updated formData - ensure it's a completely new object reference
                const updated = {
                ...currentFormDataForUpdate,
                contacts: [...mergedContacts] // Create new array reference
                };
            
            console.log(`✅✅✅ Merged contacts: ${mergedContacts.length} total (${contacts.length} from DB, ${existingContactsForUpdate.length} existing, ${optimisticContacts.length} optimistic)`);
            console.log(`✅✅✅ Updated formData.contacts:`, mergedContacts);
            
            // CRITICAL: Use functional update to ensure React detects the change
            // This is the most reliable way to update state in React
            console.log(`🔧🔧🔧 CALLING setFormData with functional update (contacts: ${mergedContacts.length})`);
            setFormData(prevFormData => {
                const currentFormData = prevFormData || {};
                console.log(`🔧🔧🔧 INSIDE setFormData callback - prevFormData.contacts.length=${currentFormData.contacts?.length || 0}`);
                
                // Create completely new object with new array references
                const updated = {
                    ...currentFormData,
                    contacts: [...mergedContacts], // New array reference
                    _lastUpdated: Date.now() // Timestamp to force change detection
                };
                
                // Update ref
                formDataRef.current = updated;
                console.log(`🔧🔧🔧 RETURNING updated formData from callback (contacts: ${updated.contacts.length})`);
                return updated;
            });
            console.log(`✅ setFormData called with updated contacts - AFTER call`);

            // Remove optimistic contacts that now exist in database
            setOptimisticContacts(prev => prev.filter(opt => !contacts.some(db => db.id === opt.id)));
            
            return contacts; // Return contacts for Promise.all tracking
        } catch (error) {
            console.error('❌ Error loading contacts from database:', error);
            return []; // Return empty array on error
        } finally {
            isLoadingContactsRef.current = false;
        }
    };

    // Load groups for Services section
    const isLoadingGroupsRef = useRef(false);
    const loadGroups = useCallback(async () => {
        if (isLoadingGroupsRef.current) return;
        
        const token = window.storage?.getToken?.();
        if (!token) {
            isLoadingGroupsRef.current = false;
            setIsLoadingGroups(false);
            return;
        }
        
        // Use global request deduplication to prevent duplicate API calls
        const groupsRequestKey = window.RequestDeduplicator?.getRequestKey('/api/clients/groups', {});
        const membershipsRequestKey = client?.id 
            ? window.RequestDeduplicator?.getRequestKey(`/api/clients/${client.id}/groups`, { clientId: client.id })
            : null;
        
        try {
            // Use deduplicator if available
            if (window.RequestDeduplicator) {
                // Load available groups with deduplication
                await window.RequestDeduplicator.deduplicate(groupsRequestKey, async () => {
                    isLoadingGroupsRef.current = true;
                    setIsLoadingGroups(true);
                    
                    try {
                        const groupsResponse = await fetch('/api/clients/groups', {
                            headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json'
                            },
                            credentials: 'include'
                        });
                        
                        if (groupsResponse.ok) {
                            const groupsData = await groupsResponse.json();
                            const groups = groupsData?.data?.groups || groupsData?.groups || [];
                            setAvailableGroups(groups);
                        }
                    } catch (error) {
                        console.error('Error loading groups:', error);
                    } finally {
                        isLoadingGroupsRef.current = false;
                        setIsLoadingGroups(false);
                    }
                }, 3000); // 3 second deduplication window for groups
                
                // Load client's current group memberships if client exists
                if (client?.id && membershipsRequestKey) {
                    await window.RequestDeduplicator.deduplicate(membershipsRequestKey, async () => {
                        try {
                            const membershipsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                credentials: 'include'
                            });
                            
                            if (membershipsResponse.ok) {
                                const membershipsData = await membershipsResponse.json();
                                const memberships = membershipsData?.data?.groupMemberships || membershipsData?.groupMemberships || [];
                                setClientGroupMemberships(memberships);
                            } else if (membershipsResponse.status === 500) {
                                // Server error - likely database issue with this client
                                console.warn(`⚠️ Failed to load groups for client ${client.id} (500 error). Continuing without group data.`);
                                setClientGroupMemberships([]);
                            } else if (membershipsResponse.status === 404) {
                                // 404 is expected when client has no groups or doesn't exist - silently handle
                                setClientGroupMemberships([]);
                            } else {
                                // Other errors (403, etc.)
                                console.warn(`⚠️ Failed to load groups for client ${client.id}: ${membershipsResponse.status}`);
                                setClientGroupMemberships([]);
                            }
                        } catch (groupError) {
                            // Only log non-404 errors (404s are expected and handled gracefully)
                            const is404Error = groupError?.message?.includes('404') || 
                                             groupError?.status === 404 ||
                                             groupError?.message?.includes('Not found');
                            if (!is404Error) {
                                console.error('❌ Error loading client groups:', groupError);
                            }
                            // Continue without group data rather than breaking the UI
                            setClientGroupMemberships([]);
                        }
                    }, 3000); // 3 second deduplication window for memberships
                }
            } else {
                // Fallback to original logic if RequestDeduplicator is not available
                isLoadingGroupsRef.current = true;
                setIsLoadingGroups(true);
                
                try {
                    const groupsResponse = await fetch('/api/clients/groups', {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include'
                    });
                    
                    if (groupsResponse.ok) {
                        const groupsData = await groupsResponse.json();
                        const groups = groupsData?.data?.groups || groupsData?.groups || [];
                        setAvailableGroups(groups);
                    }
                    
                    // Load client's current group memberships if client exists
                    if (client?.id) {
                        try {
                            const membershipsResponse = await fetch(`/api/clients/${client.id}/groups`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                credentials: 'include'
                            });
                            
                            if (membershipsResponse.ok) {
                                const membershipsData = await membershipsResponse.json();
                                const memberships = membershipsData?.data?.groupMemberships || membershipsData?.groupMemberships || [];
                                setClientGroupMemberships(memberships);
                            } else if (membershipsResponse.status === 500) {
                                console.warn(`⚠️ Failed to load groups for client ${client.id} (500 error). Continuing without group data.`);
                                setClientGroupMemberships([]);
                            } else if (membershipsResponse.status === 404) {
                                // 404 is expected when client has no groups or doesn't exist - silently handle
                                setClientGroupMemberships([]);
                            } else {
                                console.warn(`⚠️ Failed to load groups for client ${client.id}: ${membershipsResponse.status}`);
                                setClientGroupMemberships([]);
                            }
                        } catch (groupError) {
                            console.error('❌ Error loading client groups:', groupError);
                            setClientGroupMemberships([]);
                        }
                    }
                } catch (error) {
                    console.error('Error loading groups:', error);
                } finally {
                    isLoadingGroupsRef.current = false;
                    setIsLoadingGroups(false);
                }
            }
        } catch (error) {
            console.error('Error loading groups:', error);
            isLoadingGroupsRef.current = false;
            setIsLoadingGroups(false);
        }
    }, [client?.id]);
    
    // Load groups when client changes
    useEffect(() => {
        if (client?.id) {
            loadGroups();
        } else {
            setClientGroupMemberships([]);
        }
    }, [client?.id, loadGroups]);
    
    // Handle adding client to group
    const handleAddToGroup = async () => {
        if (!client?.id || !selectedGroupId) {
            alert('Please select a group');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to assign groups');
                return;
            }
            
            const response = await fetch(`/api/clients/${client.id}/groups`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ groupId: selectedGroupId, role: 'member' })
            });
            
            if (response.ok) {
                setShowGroupSelector(false);
                setSelectedGroupId('');
                await loadGroups(); // Reload groups
                alert('✅ Client added to group successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error?.message || errorData?.error || 'Failed to add client to group');
            }
        } catch (error) {
            console.error('Error adding client to group:', error);
            alert('Failed to add client to group. Please try again.');
        }
    };
    
    // Handle removing client from group
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
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                await loadGroups(); // Reload groups
                alert('✅ Client removed from group successfully');
            } else {
                const errorData = await response.json().catch(() => ({}));
                alert(errorData?.error?.message || errorData?.error || 'Failed to remove client from group');
            }
        } catch (error) {
            console.error('Error removing client from group:', error);
            alert('Failed to remove client from group. Please try again.');
        }
    };

    // Load opportunities from database
    const loadOpportunitiesFromDatabase = async (clientId) => {
        console.log(`🔍 loadOpportunitiesFromDatabase CALLED for client: ${clientId}`);
        console.log(`🔍 Checking conditions: isLoadingOpportunitiesRef=${isLoadingOpportunitiesRef.current}`);
        try {
            // Prevent duplicate requests
            if (isLoadingOpportunitiesRef.current) {
                console.log(`⏭️ Skipping loadOpportunitiesFromDatabase - already loading`);
                return Promise.resolve([]);
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log(`⏭️ Skipping loadOpportunitiesFromDatabase - no token`);
                return Promise.resolve([]);
            }
            
            isLoadingOpportunitiesRef.current = true;
            console.log(`📡 Loading opportunities from database for client: ${clientId}`);
            const response = await window.api.getOpportunitiesByClient(clientId);
            const opportunities = response?.data?.opportunities || [];
            console.log(`✅ Loaded ${opportunities.length} opportunities from database for client: ${clientId}`);
            
            // Update formData with opportunities from database
            console.log(`🔧 About to update formData with ${opportunities.length} opportunities`);
            
            // CRITICAL FIX: Get current formData from ref and update directly
            const currentFormData = formDataRef.current || {};
            const updated = {
                ...currentFormData,
                opportunities: [...opportunities] // Create new array reference
            };
            // CRITICAL: Use functional update to ensure React detects the change
            console.log(`🔧🔧🔧 CALLING setFormData with functional update for opportunities (opportunities: ${opportunities.length})`);
            setFormData(prevFormData => {
                const currentFormData = prevFormData || {};
                console.log(`🔧🔧🔧 INSIDE setFormData callback for opportunities - prevFormData.opportunities.length=${currentFormData.opportunities?.length || 0}`);
                
                // Create completely new object with new array references
                const updated = {
                    ...currentFormData,
                    opportunities: [...opportunities], // New array reference
                    _lastUpdated: Date.now() // Timestamp to force change detection
                };
                
                // Update ref
                formDataRef.current = updated;
                console.log(`🔧🔧🔧 RETURNING updated formData from callback for opportunities (opportunities: ${updated.opportunities.length})`);
                return updated;
            });
            console.log(`✅ setFormData called with updated opportunities`);
            
            return opportunities; // Return opportunities for Promise.all tracking
        } catch (error) {
            console.error('❌ Error loading opportunities from database:', error);
            // Don't show error to user, just log it
            return []; // Return empty array on error
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
        // CRITICAL: Explicitly ensure followUps are in the data being saved
        const dataToSave = {
            ...finalFormData,
            followUps: updatedFollowUps // Explicitly include followUps
        };
        
        console.log('💾 Saving follow-up:', {
            leadId: dataToSave.id,
            followUpsCount: dataToSave.followUps?.length || 0,
            latestFollowUp: dataToSave.followUps?.[dataToSave.followUps.length - 1]
        });
        
        isAutoSavingRef.current = true;
        onSave(dataToSave, true).then(() => {
            // After a successful save, ensure we remain on the calendar tab
            setTimeout(() => {
                handleTabChange('calendar');
            }, 0);
        }).finally(() => {
            // Clear the flag after a delay to allow API response to propagate
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, 3000);
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
            // CRITICAL: Explicitly ensure followUps are in the data being saved
            const dataToSave = {
                ...finalFormData,
                followUps: updatedFollowUps // Explicitly include followUps
            };
            
            isAutoSavingRef.current = true;
            onSave(dataToSave, true).then(() => {
                // After a successful save, ensure we remain on the calendar tab
                setTimeout(() => {
                    handleTabChange('calendar');
                }, 0);
            }).finally(() => {
                // Clear the flag after a delay to allow API response to propagate
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, 3000);
            });
        } else {
            // Just save the follow-up toggle (no activity log needed for uncompleting)
            // CRITICAL: Explicitly ensure followUps are in the data being saved
            const dataToSave = {
                ...updatedFormData,
                followUps: updatedFollowUps // Explicitly include followUps
            };
            
            isAutoSavingRef.current = true;
            onSave(dataToSave, true).then(() => {
                // After a successful save, ensure we remain on the calendar tab
                setTimeout(() => {
                    handleTabChange('calendar');
                }, 0);
            }).finally(() => {
                // Clear the flag after a delay to allow API response to propagate
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, 3000);
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
            // CRITICAL: Explicitly ensure followUps are in the data being saved
            const dataToSave = {
                ...finalFormData,
                followUps: updatedFormData.followUps // Explicitly include followUps
            };
            
            isAutoSavingRef.current = true;
            onSave(dataToSave, true).then(() => {
                // After a successful save, ensure we remain on the calendar tab
                setTimeout(() => {
                    handleTabChange('calendar');
                }, 0);
            }).finally(() => {
                // Clear the flag after a delay to allow API response to propagate
                setTimeout(() => {
                    isAutoSavingRef.current = false;
                }, 3000);
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
        
        const newCommentObj = {
            id: Date.now(),
            text: newComment,
            tags: Array.isArray(newNoteTags) ? newNoteTags : [],
            attachments: Array.isArray(newNoteAttachments) ? newNoteAttachments : [],
            createdAt: new Date().toISOString(),
            createdBy: currentUser.name,
            createdByEmail: currentUser.email,
            createdById: currentUser.id
        };
        
        const updatedComments = [...(formData.comments || []), newCommentObj];
        
        // CRITICAL: Build the complete formData with comments and activity log
        // Do this BEFORE updating state to ensure we have the correct data for saving
        const activity = {
            id: Date.now() + 1, // Ensure unique ID
            type: 'Comment Added',
            description: `Added note: ${newComment.substring(0, 50)}${newComment.length > 50 ? '...' : ''}`,
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            userId: currentUser.id,
            userEmail: currentUser.email,
            relatedId: null
        };
        
        const updatedFormData = {
            ...formData,
            comments: updatedComments,
            activityLog: [...(formData.activityLog || []), activity]
        };
        
        // CRITICAL: Update formDataRef immediately so guards and other code see the updated comments
        formDataRef.current = updatedFormData;
        // CRITICAL: Update state immediately so comment appears in UI
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
        
        // Save comment changes and activity log immediately - stay in edit mode
        // CRITICAL: Ensure comments are explicitly included in the save
        isAutoSavingRef.current = true;
        try {
            // CRITICAL: Explicitly ensure comments are in the data being saved
            const dataToSave = {
                ...updatedFormData,
                comments: updatedComments // Explicitly include comments
            };
            
            console.log('💾 Saving comment:', {
                leadId: dataToSave.id,
                commentsCount: dataToSave.comments?.length || 0,
                latestComment: dataToSave.comments?.[dataToSave.comments.length - 1]
            });
            
            await onSave(dataToSave, true);
            
            // CRITICAL: After a successful save, ensure we remain on the notes tab
            // Use setTimeout to ensure this happens after any potential re-renders
            // Use handleTabChange to ensure it persists to localStorage
            setTimeout(() => {
                handleTabChange('notes');
            }, 0);
        } catch (error) {
            console.error('❌ Error saving comment:', error);
            alert('Failed to save comment. Please try again.');
            // Revert the comment addition on error
            const revertedFormData = {
                ...formData,
                comments: formData.comments || []
            };
            setFormData(revertedFormData);
            formDataRef.current = revertedFormData;
        } finally {
            // Clear the flag after a delay to allow API response to propagate
            // This delay ensures any effects that check isAutoSavingRef won't reset the tab
            setTimeout(() => {
                isAutoSavingRef.current = false;
            }, 3000);
        }
        
        // Clear form fields only after successful save (handled in try block)
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
            onSave(updatedFormData, true).then(() => {
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
            const errorMessage = error?.message || 'Unknown error';
            const isServerError = errorMessage.includes('500') || errorMessage.includes('Internal Server Error') || errorMessage.includes('Failed to add site');
            
            if (isServerError) {
                alert('❌ Server error: Unable to save site. This may be due to a database issue with this client. Please contact support if this persists.');
            } else {
                alert('❌ Error saving site to database: ' + errorMessage);
            }
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
        if (!opportunity) {
            alert('❌ Opportunity not found in local data. It may have already been deleted.');
            return;
        }
        
        if (confirm(`Delete opportunity "${opportunity.name || opportunityId}"?`)) {
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
                
                console.log(`🗑️ Deleting opportunity: ${opportunityId}`);
                
                // Call API to delete from database
                await window.api.deleteOpportunity(opportunityId);
                
                console.log(`✅ Opportunity ${opportunityId} deleted from database`);
                
                // CRITICAL: Reload opportunities from database to ensure UI matches database state
                // This prevents stale data and handles cases where the opportunity was already deleted
                if (client?.id) {
                    console.log(`🔄 Reloading opportunities after deletion for client: ${client.id}`);
                    await loadOpportunitiesFromDatabase(client.id);
                } else {
                    // Fallback: Update local state if client ID not available
                    const updatedFormData = {
                        ...formData,
                        opportunities: formData.opportunities.filter(o => o.id !== opportunityId)
                    };
                    setFormData(updatedFormData);
                }
                
                // Log activity and auto-save (activity log will be saved automatically)
                const currentFormData = formDataRef.current || formData;
                logActivity('Opportunity Deleted', `Deleted opportunity: ${opportunity?.name}`, null, true, currentFormData);
                
                alert('✅ Opportunity deleted from database successfully!');
                
            } catch (error) {
                console.error('❌ Error deleting opportunity:', error);
                
                // Check if error is 404 (opportunity not found)
                const isNotFound = error.status === 404 || error.message?.includes('404') || error.message?.includes('not found');
                
                if (isNotFound) {
                    // Opportunity not found in database - reload opportunities to sync UI
                    console.log(`⚠️ Opportunity ${opportunityId} not found in database. Reloading opportunities to sync UI.`);
                    if (client?.id) {
                        await loadOpportunitiesFromDatabase(client.id);
                    }
                    alert('⚠️ Opportunity not found in database. It may have already been deleted. Refreshing list...');
                } else {
                    alert('❌ Error deleting opportunity from database: ' + error.message);
                }
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        hasUserEditedForm.current = false; // Reset after save
        const clientData = {
            ...formData,
            lastContact: new Date().toISOString().split('T')[0]
        };
        
        // CRITICAL: Set flag to prevent immediate overwriting after save
        justSavedRef.current = true;
        saveTimestampRef.current = Date.now();
        
        // Use onUpdate if provided (for updates that should close the modal)
        // Otherwise use onSave
        // For new clients/leads (client is null), explicitly pass stayInEditMode=false to close modal after save
        if (onUpdate && client) {
            await onUpdate(clientData);
        } else {
            // For new clients/leads, pass stayInEditMode=false to close modal after save
            // For existing clients/leads, default is false anyway, but make it explicit
            await onSave(clientData, false);
        }
        
        // Clear the flag after 3 seconds (enough time for parent to refresh and propagate)
        setTimeout(() => {
            justSavedRef.current = false;
        }, 3000);
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

    return (
            <div className={isFullPage ? `w-full h-full ${isDark ? 'bg-gray-900' : 'bg-gray-50'}` : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"}>
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} ${isFullPage ? 'w-full h-full rounded-none' : 'rounded-lg w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh]'} overflow-hidden flex flex-col`}>
                    {/* Breadcrumb Navigation */}
                    {isFullPage && (
                        <div className={`px-3 sm:px-6 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
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
                                        // If on a lead detail page, switch to leads view; if on client detail, switch to clients view
                                        const targetView = isLead ? 'leads' : 'clients';
                                        if (window.dispatchEvent) {
                                            window.dispatchEvent(new CustomEvent('resetClientsView', { 
                                                detail: { viewMode: targetView } 
                                            }));
                                        }
                                        if (onClose) {
                                            onClose();
                                        }
                                    }}
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'} transition-colors`}
                                >
                                    {isLead ? 'Leads' : 'Clients'}
                                </button>
                                {client && (
                                    <>
                                        <i className={`fas fa-chevron-right ${isDark ? 'text-gray-600' : 'text-gray-400'}`}></i>
                                        <span className={`${isDark ? 'text-gray-300' : 'text-gray-900'} font-medium`}>
                                            {formData.name}
                                        </span>
                                    </>
                                )}
                            </nav>
                        </div>
                    )}
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
                                    {client ? formData.name : `Add New ${entityLabel}`}
                                </h2>
                                {client && (
                                    <p className={`text-xs sm:text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-0.5 truncate`}>
                                        {formData.industry} • {formData.status}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {/* Quick Navigation Menu */}
                            {isFullPage && (
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
                                                <i className="fas fa-building mr-2"></i>
                                                {isLead ? 'Leads' : 'Clients'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {!isFullPage && (
                                <button 
                                    onClick={onClose} 
                                    className={`${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'} p-2 rounded transition-colors`}
                                >
                                    <i className="fas fa-times text-lg"></i>
                                </button>
                            )}
                        </div>
                    </div>

                {/* Tabs */}
                <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-3 sm:px-6`}>
                    <div className={`flex ${isFullPage ? 'gap-4 sm:gap-8' : 'gap-2 sm:gap-6'} overflow-x-auto scrollbar-hide`} style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {(() => {
                            // For new clients/leads (client is null), only show overview tab
                            if (!client) {
                                return ['overview'];
                            }
                            
                            // Determine if lead has been converted to client
                            const isConverted = !isLead || formData.type === 'client';
                            
                            // Base tabs - for leads, exclude calendar and notes
                            const baseTabs = isLead 
                                ? ['overview', 'contacts', 'sites', 'calendar', 'activity', 'notes']  // Leads: all tabs including calendar and notes
                                : ['overview', 'contacts', 'sites', 'calendar', 'activity', 'notes'];  // Clients: all tabs
                            
                            // Tabs that should only show for clients or converted leads
                            const clientOnlyTabs = [];
                            if (isConverted) {
                                clientOnlyTabs.push('opportunities', 'projects', 'service-maintenance');
                                if (isAdmin) {
                                    clientOnlyTabs.push('contracts');
                                }
                            }
                            
                            // Combine all tabs
                            const allTabs = [...baseTabs, ...clientOnlyTabs];
                            
                            return allTabs;
                        })().map(tab => (
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
                                        onChange={async (e) => {
                                            const newStatus = e.target.value;
                                            isEditingRef.current = true;
                                            hasUserEditedForm.current = true; // Mark that user has edited
                                            userEditedFieldsRef.current.add('status'); // Track that user has edited this field
                                            if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                            editingTimeoutRef.current = setTimeout(() => {
                                                isEditingRef.current = false;
                                            }, 5000); // Clear editing flag 5 seconds after user stops typing
                                            
                                            // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                            // This prevents LiveDataSync from overwriting during the delay
                                            isAutoSavingRef.current = true;
                                            if (onEditingChange) onEditingChange(false, true);
                                            
                                            setFormData(prev => {
                                                const updated = {...prev, status: newStatus};
                                                formDataRef.current = updated;
                                                
                                                // Auto-save immediately with the updated data
                                                // CRITICAL: Only auto-save for existing entities, NOT for new ones that haven't been saved yet
                                                if (client && client.id && onSave) {
                                                    console.log('💾 Auto-saving status change:', {
                                                        entityId: client.id,
                                                        entityType: entityType,
                                                        oldStatus: formDataRef.current?.status,
                                                        newStatus: newStatus
                                                    });
                                                    
                                                    // Use setTimeout to ensure state is updated
                                                    setTimeout(async () => {
                                                        try {
                                                            // Get the latest formData from ref (updated by useEffect)
                                                            const latest = {...formDataRef.current, status: newStatus};
                                                            
                                                            // Explicitly ensure status is included
                                                            latest.status = newStatus;
                                                            
                                                            // For leads, also ensure stage is mapped from aidaStatus if needed
                                                            if (isLead && latest.aidaStatus && !latest.stage) {
                                                                latest.stage = latest.aidaStatus;
                                                            }
                                                            
                                                            console.log('💾 Sending status to onSave:', {
                                                                entityId: latest.id,
                                                                status: latest.status,
                                                                stage: latest.stage,
                                                                aidaStatus: latest.aidaStatus
                                                            });
                                                            
                                                            // Save this as the last saved state
                                                            lastSavedDataRef.current = latest;
                                                            
                                                            // Save to API - ensure it's awaited
                                                            await onSave(latest, true);
                                                            
                                                            console.log('✅ Status auto-save completed');
                                                            
                                                            // Clear the flag and notify parent after save completes
                                                            setTimeout(() => {
                                                                isAutoSavingRef.current = false;
                                                                if (onEditingChange) onEditingChange(false, false);
                                                            }, 3000);
                                                        } catch (error) {
                                                            console.error('❌ Error saving status:', error);
                                                            isAutoSavingRef.current = false;
                                                            if (onEditingChange) onEditingChange(false, false);
                                                            alert('Failed to save status change. Please try again.');
                                                        }
                                                    }, 100); // Small delay to ensure state update is processed
                                                }
                                                
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
                                            <option>Active</option>
                                            <option>Inactive</option>
                                            <option>On Hold</option>
                                        </select>
                                    </div>
                                    {isLead && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Stage</label>
                                            <select 
                                                value={formData.stage || 'Potential'}
                                                onFocus={() => {
                                                    isEditingRef.current = true;
                                                    userHasStartedTypingRef.current = true;
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                }}
                                                onChange={async (e) => {
                                                    const newStage = e.target.value;
                                                    isEditingRef.current = true;
                                                    hasUserEditedForm.current = true;
                                                    userEditedFieldsRef.current.add('stage');
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                    editingTimeoutRef.current = setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 5000);
                                                    
                                                    // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                                    // This prevents LiveDataSync from overwriting during the delay
                                                    isAutoSavingRef.current = true;
                                                    if (onEditingChange) onEditingChange(false, true);
                                                    
                                                    setFormData(prev => {
                                                        const updated = {...prev, stage: newStage};
                                                        formDataRef.current = updated;
                                                        
                                                        // Auto-save immediately with the updated data
                                                        // CRITICAL: Only auto-save for existing entities, NOT for new ones that haven't been saved yet
                                                        if (client && client.id && onSave) {
                                                            console.log('💾 Auto-saving stage change:', {
                                                                entityId: client.id,
                                                                entityType: entityType,
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
                                                                        entityId: latest.id,
                                                                        status: latest.status,
                                                                        stage: latest.stage,
                                                                        aidaStatus: latest.aidaStatus
                                                                    });
                                                                    
                                                                    // Save this as the last saved state
                                                                    lastSavedDataRef.current = latest;
                                                                    
                                                                    // Save to API - ensure it's awaited
                                                                    await onSave(latest, true);
                                                                    
                                                                    console.log('✅ Stage auto-save completed');
                                                                    
                                                                    // Clear the flag and notify parent after save completes
                                                                    setTimeout(() => {
                                                                        isAutoSavingRef.current = false;
                                                                        if (onEditingChange) onEditingChange(false, false);
                                                                    }, 3000);
                                                                } catch (error) {
                                                                    console.error('❌ Error saving stage:', error);
                                                                    isAutoSavingRef.current = false;
                                                                    if (onEditingChange) onEditingChange(false, false);
                                                                    alert('Failed to save stage change. Please try again.');
                                                                }
                                                            }, 100); // Small delay to ensure state update is processed
                                                        }
                                                        
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
                                                <option value="Potential">Potential</option>
                                                <option value="Active">Active</option>
                                                <option value="Inactive">Inactive</option>
                                                <option value="On Hold">On Hold</option>
                                                <option value="Disinterested">Disinterested</option>
                                                <option value="Proposal">Proposal</option>
                                                <option value="Tender">Tender</option>
                                            </select>
                                        </div>
                                    )}
                                    {isLead && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1.5">AIDA Status</label>
                                            <select 
                                                value={formData.aidaStatus || 'Awareness'}
                                                onFocus={() => {
                                                    isEditingRef.current = true;
                                                    userHasStartedTypingRef.current = true;
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                }}
                                                onChange={async (e) => {
                                                    const newAidaStatus = e.target.value;
                                                    isEditingRef.current = true;
                                                    hasUserEditedForm.current = true;
                                                    userEditedFieldsRef.current.add('aidaStatus');
                                                    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
                                                    editingTimeoutRef.current = setTimeout(() => {
                                                        isEditingRef.current = false;
                                                    }, 5000);
                                                    
                                                    // CRITICAL: Set auto-saving flags IMMEDIATELY before any setTimeout
                                                    // This prevents LiveDataSync from overwriting during the delay
                                                    isAutoSavingRef.current = true;
                                                    if (onEditingChange) onEditingChange(false, true);
                                                    
                                                    setFormData(prev => {
                                                        const updated = {...prev, aidaStatus: newAidaStatus};
                                                        formDataRef.current = updated;
                                                        
                                                        // Auto-save immediately with the updated data
                                                        // CRITICAL: Only auto-save for existing entities, NOT for new ones that haven't been saved yet
                                                        if (client && client.id && onSave) {
                                                            console.log('💾 Auto-saving AIDA Status change:', {
                                                                entityId: client.id,
                                                                entityType: entityType,
                                                                oldAidaStatus: formDataRef.current?.aidaStatus,
                                                                newAidaStatus: newAidaStatus
                                                            });
                                                            
                                                            // Use setTimeout to ensure state is updated
                                                            setTimeout(async () => {
                                                                try {
                                                                    // Get the latest formData from ref (updated by useEffect)
                                                                    const latest = {...formDataRef.current, aidaStatus: newAidaStatus};
                                                                    
                                                                    // CRITICAL: Map aidaStatus to stage for database
                                                                    // The database field is 'stage', but formData uses 'aidaStatus'
                                                                    latest.stage = newAidaStatus;
                                                                    
                                                                    console.log('💾 Sending AIDA Status to onSave (mapped to stage):', {
                                                                        entityId: latest.id,
                                                                        status: latest.status,
                                                                        stage: latest.stage,
                                                                        aidaStatus: latest.aidaStatus
                                                                    });
                                                                    
                                                                    // Save this as the last saved state
                                                                    lastSavedDataRef.current = latest;
                                                                    
                                                                    // Save to API - ensure it's awaited
                                                                    await onSave(latest, true);
                                                                    
                                                                    console.log('✅ AIDA Status auto-save completed');
                                                                    
                                                                    // Clear the flag and notify parent after save completes
                                                                    setTimeout(() => {
                                                                        isAutoSavingRef.current = false;
                                                                        if (onEditingChange) onEditingChange(false, false);
                                                                    }, 3000);
                                                                } catch (error) {
                                                                    console.error('❌ Error saving AIDA Status:', error);
                                                                    isAutoSavingRef.current = false;
                                                                    if (onEditingChange) onEditingChange(false, false);
                                                                    alert('Failed to save AIDA Status change. Please try again.');
                                                                }
                                                            }, 100); // Small delay to ensure state update is processed
                                                        }
                                                        
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
                                                <option value="Awareness">Awareness</option>
                                                <option value="Interest">Interest</option>
                                                <option value="Desire">Desire</option>
                                                <option value="Action">Action</option>
                                            </select>
                                        </div>
                                    )}
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
                                                    // CRITICAL: Set flag to prevent immediate overwriting after auto-save
                                                    justSavedRef.current = true;
                                                    saveTimestampRef.current = Date.now();
                                                    
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
                                                            // Clear the justSaved flag after 3 seconds (enough time for parent to refresh and propagate)
                                                            setTimeout(() => {
                                                                justSavedRef.current = false;
                                                            }, 2000);
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

                                {/* Group Assignment */}
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="block text-sm font-medium text-gray-700">Group Assignment</label>
                                        {client?.id && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowGroupSelector(true);
                                                    setSelectedGroupId('');
                                                }}
                                                className="px-3 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                                            >
                                                <i className="fas fa-plus mr-1"></i>
                                                Assign Group
                                            </button>
                                        )}
                                    </div>
                                    
                                    {!client?.id ? (
                                        <p className="text-xs text-gray-500">Save the client first to assign groups</p>
                                    ) : isLoadingGroups ? (
                                        <p className="text-xs text-gray-500">
                                            <i className="fas fa-spinner fa-spin mr-1"></i>
                                            Loading groups...
                                        </p>
                                    ) : clientGroupMemberships.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {clientGroupMemberships.map((membership) => (
                                                <div
                                                    key={membership.id || membership.group?.id}
                                                    className="px-3 py-1.5 text-xs rounded-full border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-2"
                                                >
                                                    <i className="fas fa-layer-group"></i>
                                                    <span>{membership.group?.name || 'Unknown Group'}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveFromGroup(membership.group?.id)}
                                                        className="ml-1 text-blue-500 hover:text-blue-700"
                                                        title="Remove from group"
                                                    >
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-gray-500">No groups assigned</p>
                                    )}
                                    
                                    {/* Group Selector Modal */}
                                    {showGroupSelector && (
                                        <div 
                                            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" 
                                            onClick={() => {
                                                setShowGroupSelector(false);
                                                setSelectedGroupId('');
                                            }}
                                            style={{ zIndex: 9999 }}
                                        >
                                            <div 
                                                className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ zIndex: 10000 }}
                                            >
                                                <div className="flex justify-between items-center mb-4">
                                                    <h3 className="text-lg font-semibold text-gray-900">
                                                        Assign to Group
                                                    </h3>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowGroupSelector(false);
                                                            setSelectedGroupId('');
                                                        }}
                                                        className="text-gray-500 hover:text-gray-700 transition-colors"
                                                    >
                                                        <i className="fas fa-times text-xl"></i>
                                                    </button>
                                                </div>
                                                
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-2 text-gray-700">
                                                            Select Group
                                                        </label>
                                                        {availableGroups.length === 0 ? (
                                                            <p className="text-sm text-gray-500">
                                                                No groups available. Create a group from the Groups tab first.
                                                            </p>
                                                        ) : (
                                                            <select
                                                                value={selectedGroupId}
                                                                onChange={(e) => setSelectedGroupId(e.target.value)}
                                                                className="w-full px-3 py-2 rounded-md border bg-white border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            >
                                                                <option value="">Select a group...</option>
                                                                {availableGroups
                                                                    .filter(g => !clientGroupMemberships.some(m => m.group?.id === g.id))
                                                                    .map((group) => (
                                                                        <option key={group.id} value={group.id}>
                                                                            {group.name} {group.industry ? `(${group.industry})` : ''}
                                                                        </option>
                                                                    ))}
                                                            </select>
                                                        )}
                                                    </div>
                                                    
                                                    <div className="flex gap-3 justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setShowGroupSelector(false);
                                                                setSelectedGroupId('');
                                                            }}
                                                            className="px-4 py-2 rounded-md transition-colors bg-gray-200 hover:bg-gray-300 text-gray-900"
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
                                                                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                                                            }`}
                                                        >
                                                            Assign
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Services - service level tags - Hidden for leads */}
                                {!isLead && (
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
                                                        const updatedFormData = { ...formData, services: next };
                                                        setFormData(updatedFormData);
                                                        formDataRef.current = updatedFormData; // CRITICAL: Update ref immediately for auto-save
                                                        hasUserEditedForm.current = true;
                                                        userEditedFieldsRef.current.add('services'); // Track that user has edited services
                                                        
                                                        // Auto-save services immediately (stay in edit mode)
                                                        if (client && onSave) {
                                                            isAutoSavingRef.current = true;
                                                            onSave(updatedFormData, true).finally(() => {
                                                                isAutoSavingRef.current = false;
                                                            });
                                                        }
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
                                )}

                                {/* Delete {entityLabel} Section */}
                                {client && onDelete && (
                                    <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                                    Danger Zone
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    Once you delete a {entityLabelLower}, there is no going back. Please be certain.
                                                </p>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    if (confirm(`Are you sure you want to delete this ${entityLabelLower}? This action cannot be undone.`)) {
                                                        // onDelete will handle closing the modal after optimistic update
                                                        // Don't call onClose here - let handleDeleteClient close it to avoid reload
                                                        onDelete(client.id);
                                                    }
                                                }}
                                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center gap-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                                Delete {entityLabel}
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
                                        // CRITICAL: Merge formData contacts with optimistic contacts and deduplicate
                                        const formContacts = formData.contacts || [];
                                        const optimistic = optimisticContacts || [];
                                        
                                        // Use mergeUniqueById for consistent deduplication
                                        const allContacts = mergeUniqueById(formContacts, optimistic);

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
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleAddFollowUp();
                                            }}
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
                                                className="bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm transition cursor-pointer"
                                                onClick={() => handleJobCardClick(jobCard)}
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

                        {/* Footer Actions */}
                        <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                            <div>
                                {/* Convert to Client button - only show for leads */}
                                {isLead && onConvertToClient && client && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (onConvertToClient) {
                                                onConvertToClient(client);
                                            }
                                        }}
                                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
                                    >
                                        <i className="fas fa-exchange-alt"></i>
                                        Convert to Client
                                    </button>
                                )}
                            </div>
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
                                    {client ? `Update ${entityLabel}` : `Add ${entityLabel}`}
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

