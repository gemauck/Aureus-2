// Get React hooks from window
// VERSION: Contact filter updated - removed "All Contacts" option
// DEPLOYMENT FIX: Contact filter now only shows site-specific contacts
// FIX: Added useRef to prevent form reset when user is editing
const { useState, useEffect, useRef } = React;
const GoogleCalendarSync = window.GoogleCalendarSync;

const ClientDetailModal = ({ client, onSave, onClose, onDelete, allProjects, onNavigateToProject, isFullPage = false, isEditing = false, hideSearchFilters = false, initialTab = 'overview', onTabChange }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [uploadingContract, setUploadingContract] = useState(false);
    
    // Track if user has edited the form to prevent unwanted resets
    const hasUserEditedForm = useRef(false);
    const lastSavedClientId = useRef(client?.id);
    
    // Use ref to track latest formData for auto-save
    const formDataRef = useRef(null);
    const isAutoSavingRef = useRef(false);
    const lastSavedDataRef = useRef(null); // Track last saved state
    
    // Update tab when initialTab prop changes
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);
    
    // Update formData when client prop changes - but only if user hasn't edited the form
    useEffect(() => {
        // Don't reset formData if we're in the middle of auto-saving OR just finished
        if (isAutoSavingRef.current) {
            console.log('⚠️ Skipping formData reset - auto-save in progress');
            return;
        }
        
        if (client) {
            // Only reset formData if:
            // 1. Client ID changed (viewing a different client), OR
            // 2. User hasn't edited the form yet
            const clientIdChanged = client.id !== lastSavedClientId.current;
            
            if (clientIdChanged) {
                // Reset the edit flag when switching to a different client
                hasUserEditedForm.current = false;
                lastSavedClientId.current = client.id;
            }
            
            // Only update formData if user hasn't edited or if client changed
            if (!hasUserEditedForm.current || clientIdChanged) {
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
                console.log('🔄 Setting initial formData from client prop:', {
                    contactsCount: parsedClient.contacts?.length,
                    sitesCount: parsedClient.sites?.length,
                    contractsCount: parsedClient.contracts?.length,
                    commentsCount: parsedClient.comments?.length,
                    hasUserEdited: hasUserEditedForm.current
                });
                setFormData(parsedClient);
            } else {
                console.log('⏭️ Skipping formData reset - user has edited the form');
            }
        }
    }, [client]);
    
    // Handle tab change and notify parent
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (onTabChange) {
            onTabChange(tab);
        }
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
            industry: '',
            status: 'Active',
            address: '',
            website: '',
            notes: '',
            contacts: [],
            followUps: [],
            projectIds: [],
            comments: [],
            contracts: [],
            sites: [],
            opportunities: [],
            activityLog: [],
            billingTerms: {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 0,
                taxExempt: false,
                notes: ''
            }
        };
        
        formDataRef.current = parsedClient;
        return parsedClient;
    });
    
    // Keep ref in sync with state
    useEffect(() => {
        formDataRef.current = formData;
    }, [formData]);
    const { isDark } = window.useTheme();
    
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
                projectIds: typeof client.projectIds === 'string' ? JSON.parse(client.projectIds || '[]') : (client.projectIds || [])
            };
            
            console.log('🔄 Initial formData from client prop:', {
                followUps: parsedClient.followUps?.length,
                comments: parsedClient.comments?.length,
                contracts: parsedClient.contracts?.length,
                contacts: parsedClient.contacts?.length,
                sites: parsedClient.sites?.length
            });
            
            setFormData(parsedClient);
            
            // Load data from database (will override initial data if logged in)
            loadOpportunitiesFromDatabase(client.id);
            loadContactsFromDatabase(client.id);
            loadSitesFromDatabase(client.id);
            
            // Reload the full client data from database to get comments, followUps, activityLog
            loadClientFromDatabase(client.id);
        }
    }, [client]);
    
    // Load full client data from database to get latest comments, followUps, activityLog
    const loadClientFromDatabase = async (clientId) => {
        try {
            // Don't reload if auto-saving is in progress
            if (isAutoSavingRef.current) {
                console.log('⚠️ Skipping client reload - auto-save in progress');
                return;
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token, skipping client data load');
                return;
            }
            
            console.log('📡 Reloading full client data from database for client:', clientId);
            const response = await window.api.getClient(clientId);
            const dbClient = response?.data?.client;
            
            if (dbClient) {
                console.log('✅ Loaded client from database:', dbClient.name);
                console.log('📋 Comments:', typeof dbClient.comments, Array.isArray(dbClient.comments) ? dbClient.comments.length : 'not array');
                console.log('📋 FollowUps:', typeof dbClient.followUps, Array.isArray(dbClient.followUps) ? dbClient.followUps.length : 'not array');
                console.log('📋 ActivityLog:', typeof dbClient.activityLog, Array.isArray(dbClient.activityLog) ? dbClient.activityLog.length : 'not array');
                
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
                
                console.log('📝 Parsed client data - Comments:', parsedClient.comments?.length, 'FollowUps:', parsedClient.followUps?.length, 'ActivityLog:', parsedClient.activityLog?.length);
                
                // Update formData with the fresh data from database
                setFormData(prevFormData => ({
                    ...prevFormData,
                    comments: parsedClient.comments,
                    followUps: parsedClient.followUps,
                    activityLog: parsedClient.activityLog,
                    contracts: parsedClient.contracts
                }));
                
                console.log('✅ FormData updated with fresh database data');
            }
        } catch (error) {
            console.error('❌ Error loading client from database:', error);
        }
    };

    // Load contacts from database
    const loadContactsFromDatabase = async (clientId) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token, skipping contact loading');
                return;
            }
            
            console.log('📡 Loading contacts from database for client:', clientId);
            const response = await window.api.getContacts(clientId);
            const contacts = response?.data?.contacts || [];
            
            console.log('✅ Loaded contacts from database:', contacts.length);
            console.log('📋 Contact data:', contacts);
            
            // Update formData with contacts from database - force new object reference
            setFormData(prevFormData => {
                const newFormData = {
                    ...prevFormData,
                    contacts: [...contacts] // Create new array reference
                };
                console.log('🔄 Updated formData with contacts:', newFormData.contacts?.length);
                return newFormData;
            });
        } catch (error) {
            console.error('❌ Error loading contacts from database:', error);
        }
    };

    // Load sites from database
    const loadSitesFromDatabase = async (clientId) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token, skipping site loading');
                return;
            }
            
            console.log('📡 Loading sites from database for client:', clientId);
            const response = await window.api.getSites(clientId);
            const sites = response?.data?.sites || [];
            
            console.log('✅ Loaded sites from database:', sites.length);
            console.log('📋 Site data:', sites);
            
            // Update formData with sites from database - force new object reference
            setFormData(prevFormData => {
                const newFormData = {
                    ...prevFormData,
                    sites: [...sites] // Create new array reference
                };
                console.log('🔄 Updated formData with sites:', newFormData.sites?.length);
                return newFormData;
            });
        } catch (error) {
            console.error('❌ Error loading sites from database:', error);
        }
    };

    // Load opportunities from database
    const loadOpportunitiesFromDatabase = async (clientId) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token, skipping opportunity loading');
                return;
            }
            
            console.log('📡 Loading opportunities from database for client:', clientId);
            const response = await window.api.getOpportunitiesByClient(clientId);
            const opportunities = response?.data?.opportunities || [];
            
            console.log('✅ Loaded opportunities from database:', opportunities.length);
            
            // Update formData with opportunities from database
            setFormData(prevFormData => ({
                ...prevFormData,
                opportunities: opportunities
            }));
        } catch (error) {
            console.error('❌ Error loading opportunities from database:', error);
            // Don't show error to user, just log it
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
            
            console.log('🌐 Creating contact via API:', newContact);
            const response = await window.api.createContact(formData.id, newContact);
            console.log('📥 Full API response:', response);
            console.log('🔍 Response structure:', {
                hasData: !!response?.data,
                hasDataContact: !!response?.data?.contact,
                hasContact: !!response?.contact,
                responseKeys: Object.keys(response || {}),
                dataKeys: response?.data ? Object.keys(response.data) : 'no data'
            });
            
            const savedContact = response?.data?.contact || response?.contact || response;
            console.log('👤 Extracted contact:', savedContact);
            
            if (savedContact && savedContact.id) {
                // Reload contacts from database to get fresh data
                await loadContactsFromDatabase(formData.id);
                
                logActivity('Contact Added', `Added contact: ${newContact.name} (${newContact.email})`);
                
                alert('✅ Contact saved to database successfully!');
                
                // Switch to contacts tab
                setTimeout(() => {
                    handleTabChange('contacts');
                }, 100);
                
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
                
                console.log('✅ Contact created and saved to database:', savedContact.id);
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
        logActivity('Contact Updated', `Updated contact: ${newContact.name}`);
        
        // Save contact changes immediately - stay in edit mode
        onSave(updatedFormData, true);
        
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
        
        console.log('✅ Contact updated and saved:', newContact.name);
    };

    const handleDeleteContact = (contactId) => {
        if (confirm('Remove this contact?')) {
            const updatedFormData = {
                ...formData,
                contacts: formData.contacts.filter(c => c.id !== contactId)
            };
            setFormData(updatedFormData);
            
            // Save contact deletion immediately - stay in edit mode
            onSave(updatedFormData, true);
            // Stay in contacts tab (use setTimeout to ensure it happens after re-render)
            setTimeout(() => {
                handleTabChange('contacts');
            }, 100);
            
            console.log('✅ Contact deleted and saved');
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
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
        const newActivityLog = [...(formData.activityLog || []), {
            id: Date.now() + 1,
            type: 'Follow-up Added',
            description: `Scheduled ${newFollowUp.type} for ${newFollowUp.date}`,
            timestamp: new Date().toISOString(),
            user: currentUser.name,
            userId: currentUser.id,
            userEmail: currentUser.email,
            relatedId: null
        }];
        
        const updatedFormData = {
            ...formData,
            followUps: updatedFollowUps,
            activityLog: newActivityLog
        };
        
        setFormData(updatedFormData);
        
        // Save follow-up changes immediately - stay in edit mode
        isAutoSavingRef.current = true;
        onSave(updatedFormData, true);
        
        // Clear the flag after a delay to allow API response to propagate
        setTimeout(() => {
            isAutoSavingRef.current = false;
            console.log('✅ Auto-save completed, re-enabling formData updates');
        }, 3000);
        
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
        
        if (followUp && !followUp.completed) {
            // Get current user info
            const user = window.storage?.getUser?.() || {};
            const currentUser = {
                name: user?.name || 'System',
                email: user?.email || 'system',
                id: user?.id || 'system'
            };
            
            updatedFormData.activityLog = [...(formData.activityLog || []), {
                id: Date.now(),
                type: 'Follow-up Completed',
                description: `Completed: ${followUp.description}`,
                timestamp: new Date().toISOString(),
                user: currentUser.name,
                userId: currentUser.id,
                userEmail: currentUser.email,
                relatedId: null
            }];
        }
        
        setFormData(updatedFormData);
        
        // Save follow-up toggle immediately - stay in edit mode
        isAutoSavingRef.current = true;
        onSave(updatedFormData, true);
        
        // Clear the flag after a delay to allow API response to propagate
        setTimeout(() => {
            isAutoSavingRef.current = false;
            console.log('✅ Auto-save completed, re-enabling formData updates');
        }, 3000);
    };

    const handleDeleteFollowUp = (followUpId) => {
        if (confirm('Delete this follow-up?')) {
            const updatedFormData = {
                ...formData,
                followUps: formData.followUps.filter(f => f.id !== followUpId)
            };
            setFormData(updatedFormData);
            
            // Save follow-up deletion immediately - stay in edit mode
            isAutoSavingRef.current = true;
            onSave(updatedFormData, true);
            
            // Clear the flag after a delay to allow API response to propagate
            setTimeout(() => {
                isAutoSavingRef.current = false;
                console.log('✅ Auto-save completed, re-enabling formData updates');
            }, 3000);
        }
    };

    // Google Calendar event handlers
    const handleGoogleEventCreated = (followUpId, updatedFollowUp) => {
        const updatedFollowUps = formData.followUps.map(f => 
            f.id === followUpId ? { ...f, ...updatedFollowUp } : f
        );
        setFormData({
            ...formData,
            followUps: updatedFollowUps
        });
    };

    const handleGoogleEventUpdated = (followUpId, updatedFollowUp) => {
        const updatedFollowUps = formData.followUps.map(f => 
            f.id === followUpId ? { ...f, ...updatedFollowUp } : f
        );
        setFormData({
            ...formData,
            followUps: updatedFollowUps
        });
    };

    const handleGoogleEventDeleted = (followUpId, updatedFollowUp) => {
        const updatedFollowUps = formData.followUps.map(f => 
            f.id === followUpId ? { ...f, ...updatedFollowUp } : f
        );
        setFormData({
            ...formData,
            followUps: updatedFollowUps
        });
    };

    const handleGoogleCalendarError = (error) => {
        console.error('Google Calendar error:', error);
        // You could show a toast notification here
        alert(`Google Calendar Error: ${error}`);
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

    const handleAddComment = () => {
        if (!newComment.trim()) return;
        
        // Get current user info
        const user = window.storage?.getUser?.() || {};
        const currentUser = {
            name: user?.name || 'System',
            email: user?.email || 'system',
            id: user?.id || 'system'
        };
        
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
        logActivity('Comment Added', `Added note: ${newComment.substring(0, 50)}${newComment.length > 50 ? '...' : ''}`);
        
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
        
        // Save comment changes immediately - stay in edit mode
        isAutoSavingRef.current = true;
        onSave(updatedFormData, true);
        
        // Clear the flag after a delay to allow API response to propagate
        setTimeout(() => {
            isAutoSavingRef.current = false;
            console.log('✅ Auto-save completed, re-enabling formData updates');
        }, 3000);
        
        setNewComment('');
        setNewNoteTags([]);
        setNewNoteTagsInput('');
        setNewNoteAttachments([]);
        
        console.log('✅ Comment added and saved:', newComment);
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
                console.log('✅ Auto-save completed, re-enabling formData updates');
            }, 3000);
            
            console.log('✅ Comment deleted and saved');
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
            
            console.log('🌐 Creating site via API:', newSite);
            const response = await window.api.createSite(formData.id, newSite);
            const savedSite = response?.data?.site || response?.site || response;
            
            if (savedSite && savedSite.id) {
                // Reload sites from database to get fresh data
                await loadSitesFromDatabase(formData.id);
                
                logActivity('Site Added', `Added site: ${newSite.name}`);
                
                alert('✅ Site saved to database successfully!');
                
                // Switch to sites tab
                setTimeout(() => {
                    handleTabChange('sites');
                }, 100);
                
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
                
                console.log('✅ Site created and saved to database:', savedSite.id);
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
        logActivity('Site Updated', `Updated site: ${newSite.name}`);
        
        // Save site changes immediately - stay in edit mode
        onSave(updatedFormData, true);
        
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
        
        console.log('✅ Site updated and saved:', newSite.name);
    };

    const handleDeleteSite = (siteId) => {
        const site = formData.sites.find(s => s.id === siteId);
        if (confirm('Delete this site?')) {
            const updatedFormData = {
                ...formData,
                sites: formData.sites.filter(s => s.id !== siteId)
            };
            setFormData(updatedFormData);
            logActivity('Site Deleted', `Deleted site: ${site?.name}`);
            
            // Save site deletion immediately - stay in edit mode
            onSave(updatedFormData, true);
            handleTabChange('sites'); // Stay in sites tab
            
            console.log('✅ Site deleted and saved:', site?.name);
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
            
            console.log('🔍 ClientDetailModal opportunity data before API call:', {
                opportunityData,
                newOpportunity,
                formDataId: formData.id,
                titleValue: newOpportunity.name,
                titleType: typeof newOpportunity.name,
                titleLength: newOpportunity.name?.length
            });
            
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('❌ Please log in to save opportunities to the database');
                return;
            }
            
            if (!window.api?.createOpportunity) {
                alert('❌ Opportunity API not available. Please refresh the page.');
                return;
            }
            
            console.log('🌐 Creating opportunity via API:', opportunityData);
            console.log('🔍 API method available?', typeof window.api?.createOpportunity);
            
            const response = await window.api.createOpportunity(opportunityData);
            console.log('📥 API response:', response);
            
            const savedOpportunity = response?.data?.opportunity || response?.opportunity || response;
            console.log('📋 Parsed savedOpportunity:', savedOpportunity);
            
            if (savedOpportunity && savedOpportunity.id) {
                // Get current user info
                const user = window.storage?.getUser?.() || {};
                const currentUser = {
                    name: user?.name || 'System',
                    email: user?.email || 'system',
                    id: user?.id || 'system'
                };
                
                // Add to local opportunities array for immediate UI update
                const currentOpportunities = Array.isArray(formData.opportunities) ? formData.opportunities : [];
                const updatedOpportunities = [...currentOpportunities, savedOpportunity];
                
                const newActivityLog = [...(formData.activityLog || []), {
                    id: Date.now() + 1,
                    type: 'Opportunity Added',
                    description: `Added opportunity: ${newOpportunity.name}`,
                    timestamp: new Date().toISOString(),
                    user: currentUser.name,
                    userId: currentUser.id,
                    userEmail: currentUser.email,
                    relatedId: savedOpportunity.id
                }];
                
                const updatedFormData = {
                    ...formData,
                    opportunities: updatedOpportunities,
                    activityLog: newActivityLog
                };
                
                setFormData(updatedFormData);
                
                // DON'T call onSave here - it will overwrite the client with stale data!
                // Instead, just update local state and let the user save when they're ready
                // The opportunity is already in the database, so it will load on next fetch
                
                alert('✅ Opportunity saved to database successfully!');
                
                // Switch to opportunities tab to show the added opportunity
                handleTabChange('opportunities');
                
                // Reset form
                setNewOpportunity({
                    name: '',
                    stage: 'Awareness',
                    expectedCloseDate: '',
                    relatedSiteId: null,
                    notes: ''
                });
                setShowOpportunityForm(false);
                
                // Reload opportunities from database to ensure we have the latest
                try {
                    const oppResponse = await window.api.getOpportunitiesByClient(formData.id);
                    const freshOpportunities = oppResponse?.data?.opportunities || oppResponse?.opportunities || [];
                    setFormData(prev => ({
                        ...prev,
                        opportunities: freshOpportunities
                    }));
                    console.log('✅ Reloaded opportunities from database:', freshOpportunities.length);
                    
                    // Trigger a window event to notify Pipeline view that opportunities changed
                    window.dispatchEvent(new CustomEvent('opportunitiesUpdated', { 
                        detail: { clientId: formData.id, opportunities: freshOpportunities } 
                    }));
                    console.log('📡 Dispatched opportunitiesUpdated event for Pipeline refresh');
                } catch (error) {
                    console.error('❌ Failed to reload opportunities:', error);
                }
                
                console.log('✅ Opportunity created and saved to database:', savedOpportunity.id);
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
            
            console.log('🌐 Updating opportunity via API:', editingOpportunity.id, opportunityData);
            const response = await window.api.updateOpportunity(editingOpportunity.id, opportunityData);
            const updatedOpportunity = response?.data?.opportunity || response?.opportunity || response;
            
            if (updatedOpportunity && updatedOpportunity.id) {
                // Update local opportunities array
                const updatedOpportunities = formData.opportunities.map(o => 
                    o.id === editingOpportunity.id ? updatedOpportunity : o
                );
                const updatedFormData = {...formData, opportunities: updatedOpportunities};
                setFormData(updatedFormData);
                
                logActivity('Opportunity Updated', `Updated opportunity: ${newOpportunity.name}`);
                
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
                
                console.log('✅ Opportunity updated and saved to database:', updatedOpportunity.id);
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
                
                console.log('🌐 Deleting opportunity via API:', opportunityId);
                await window.api.deleteOpportunity(opportunityId);
                
                // Update local opportunities array
                const updatedFormData = {
                    ...formData,
                    opportunities: formData.opportunities.filter(o => o.id !== opportunityId)
                };
                setFormData(updatedFormData);
                
                logActivity('Opportunity Deleted', `Deleted opportunity: ${opportunity?.name}`);
                
                alert('✅ Opportunity deleted from database successfully!');
                
                console.log('✅ Opportunity deleted from database:', opportunityId);
            } catch (error) {
                console.error('❌ Error deleting opportunity:', error);
                alert('❌ Error deleting opportunity from database: ' + error.message);
            }
        }
    };

    const logActivity = (type, description, relatedId = null) => {
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
        setFormData({
            ...formData,
            activityLog: [...(formData.activityLog || []), activity]
        });
    };



    const handleSubmit = (e) => {
        e.preventDefault();
        console.log('💾 Saving form data:', { notes: formData.notes });
        hasUserEditedForm.current = false; // Reset after save
        onSave({
            ...formData,
            lastContact: new Date().toISOString().split('T')[0]
        }); // Main form save - will exit edit mode
    };

    // Get projects that belong to this client (match by clientId or clientName)
    const clientProjects = allProjects?.filter(p => {
        // Primary: match by clientId (foreign key relationship)
        if (formData.id && p.clientId === formData.id) {
            return true;
        }
        // Fallback: match by client name (for projects without clientId set)
        if (p.client === formData.name || p.clientName === formData.name) {
            return true;
        }
        return false;
    }) || [];
    const upcomingFollowUps = (formData.followUps || [])
        .filter(f => !f.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    return (
            <div className={isFullPage ? `w-full h-full ${isDark ? 'bg-gray-900' : 'bg-gray-50'}` : "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4"}>
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} ${isFullPage ? 'w-full h-full rounded-none' : 'rounded-lg w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh]'} overflow-hidden flex flex-col`}>
                    {/* Header */}
                    <div className={`flex justify-between items-center px-3 sm:px-6 py-3 sm:py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
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
                        {['overview', 'contacts', 'sites', 'opportunities', 'calendar', 'projects', 'contracts', 'activity', 'notes'].map(tab => (
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
                                    tab === 'contracts' ? 'file-contract' :
                                    tab === 'activity' ? 'history' :
                                    'comment-alt'
                                } mr-1 sm:mr-2`}></i>
                                <span className="hidden sm:inline">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
                                <span className="sm:hidden">{tab.charAt(0).toUpperCase()}</span>
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
                <div className={`flex-1 overflow-y-auto ${isFullPage ? 'p-8' : 'p-6'}`}>
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
                                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                            required 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                                        <select
                                            value={formData.industry}
                                            onChange={(e) => setFormData({...formData, industry: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="">Select Industry</option>
                                            <option>Mining</option>
                                            <option>Forestry</option>
                                            <option>Agriculture</option>
                                            <option>Other</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                                        <select 
                                            value={formData.status}
                                            onChange={(e) => setFormData({...formData, status: e.target.value})}
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
                                            onChange={(e) => setFormData({...formData, website: e.target.value})}
                                            placeholder="https://example.com"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
                                    <textarea 
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="2"
                                        placeholder="Street address, City, Province, Postal Code"
                                    ></textarea>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">General Notes</label>
                                    <textarea 
                                        value={formData.notes}
                                        onChange={(e) => {
                                            hasUserEditedForm.current = true;
                                            setFormData({...formData, notes: e.target.value});
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="3"
                                        placeholder="General information about this client..."
                                    ></textarea>
                                </div>
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
                                        // Show all contacts without filtering
                                        const allContacts = formData.contacts || [];
                                        
                                        console.log('🖼️ RENDER: Contacts to display:', allContacts.length);
                                        console.log('🖼️ RENDER: formData.contacts:', formData.contacts);
                                        console.log('🖼️ RENDER: Full formData keys:', Object.keys(formData));

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
                                                        title="Open in map to set location"
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
                                                <div className="mt-2 text-xs text-gray-500">
                                                    💡 <strong>Tip:</strong> Use the map button to open OpenStreetMap and click on the exact location to get precise coordinates
                                                </div>
                                            </div>
                                            
                                            {/* Map Preview */}
                                            {newSite.latitude && newSite.longitude && (
                                                <div className="col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Location Preview</label>
                                                    <window.MapComponent 
                                                        latitude={newSite.latitude}
                                                        longitude={newSite.longitude}
                                                        siteName={newSite.name || 'Site Location'}
                                                    />
                                                </div>
                                            )}
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
                                    {(!formData.sites || formData.sites.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-map-marker-alt text-3xl mb-2"></i>
                                            <p>No sites added yet</p>
                                        </div>
                                    ) : (
                                        formData.sites.map(site => (
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
                                    )}
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
                                                <div key={opportunity.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-green-300 transition">
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
                                                            
                                                            {/* Google Calendar Sync Component */}
                                                            <div className="mt-2">
                                                                {GoogleCalendarSync && (
                                                                    <GoogleCalendarSync
                                                                        followUp={followUp}
                                                                        clientName={formData.name}
                                                                        clientId={formData.id}
                                                                        onEventCreated={(updatedFollowUp) => handleGoogleEventCreated(followUp.id, updatedFollowUp)}
                                                                        onEventUpdated={(updatedFollowUp) => handleGoogleEventUpdated(followUp.id, updatedFollowUp)}
                                                                        onEventDeleted={(updatedFollowUp) => handleGoogleEventDeleted(followUp.id, updatedFollowUp)}
                                                                        onError={(error) => handleGoogleCalendarError(error)}
                                                                    />
                                                                )}
                                                            </div>
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
                                                                        throw new Error(`Upload failed (${res.status})`);
                                                                    }
                                                                    const json = await res.json();
                                                                    const newContract = {
                                                                        id: Date.now(),
                                                                        name: file.name,
                                                                        size: file.size,
                                                                        type: file.type,
                                                                        uploadDate: new Date().toISOString(),
                                                                        url: json.url
                                                                    };
                                                                    setFormData({
                                                                        ...formData,
                                                                        contracts: [...(formData.contracts || []), newContract]
                                                                    });
                                                                    logActivity('Contract Uploaded', `Uploaded to server: ${file.name}`);
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
                                                                href={contract.data}
                                                                download={contract.name}
                                                                className="text-primary-600 hover:text-primary-700 p-1"
                                                                title="Download"
                                                            >
                                                                <i className="fas fa-download"></i>
                                                            </a>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (confirm('Delete this contract?')) {
                                                                        const contractToDelete = formData.contracts.find(c => c.id === contract.id);
                                                                        setFormData({
                                                                            ...formData,
                                                                            contracts: formData.contracts.filter(c => c.id !== contract.id)
                                                                        });
                                                                        logActivity('Contract Deleted', `Deleted: ${contractToDelete?.name}`);
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
                                                    activity.type === 'Site Added' ? 'map-marker-alt' :
                                                    activity.type === 'Site Updated' ? 'map-marked-alt' :
                                                    activity.type === 'Site Deleted' ? 'map-marker-slash' :
                                                    activity.type === 'Opportunity Added' ? 'bullseye' :
                                                    activity.type === 'Opportunity Updated' ? 'chart-line' :
                                                    activity.type === 'Opportunity Deleted' ? 'times-circle' :
                                                    activity.type === 'Follow-up Added' ? 'calendar-plus' :
                                                    activity.type === 'Follow-up Completed' ? 'calendar-check' :
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
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
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

                                <div className="space-y-2">
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
                                                                {comment.createdBy?.charAt(0) || 'U'}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900 text-sm">{comment.createdBy}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {new Date(comment.createdAt).toLocaleString()}
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
                                {client && onDelete && (
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            if (confirm('Are you sure you want to delete this client? This action cannot be undone.')) {
                                                onDelete(client.id);
                                                onClose();
                                            }
                                        }}
                                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                                    >
                                        <i className="fas fa-trash mr-1.5"></i>
                                        Delete Client
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

// Make available globally
window.ClientDetailModal = ClientDetailModal;
// CONTACT FILTER: Only shows site-specific contacts - no "All Contacts" option
// This ensures contacts are always properly linked to specific sites
