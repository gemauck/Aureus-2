// Get React hooks from window
const { useState, useEffect, useRef } = React;

const LeadDetailModal = ({ lead, onSave, onClose, onDelete, onConvertToClient, allProjects, isFullPage = false, isEditing = false, initialTab = 'overview', onTabChange }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    
    // Update tab when initialTab prop changes
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);
    
    // Update formData when lead prop changes - but only when lead ID changes
    useEffect(() => {
        // Don't reset formData if we're in the middle of auto-saving OR just finished
        if (isAutoSavingRef.current) {
            return;
        }
        
        // ONLY initialize formData when switching to a different lead (different ID)
        // Do NOT reinitialize when the same lead is updated
        if (lead && !formData.id) {
            // First load - initialize formData
            const parsedLead = {
                ...lead,
                // Ensure stage and status are preserved
                stage: lead.stage || 'Awareness',
                status: 'active', // Status is hardcoded as 'active'
                contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
                followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || []),
                projectIds: typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : (lead.projectIds || []),
                comments: typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : (lead.comments || []),
                activityLog: typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : (lead.activityLog || []),
                billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {})
            };
            setFormData(parsedLead);
        } else if (lead && formData.id && lead.id !== formData.id) {
            // Switching to a different lead - reinitialize
            const parsedLead = {
                ...lead,
                stage: lead.stage || 'Awareness',
                status: lead.status || 'Potential',
                contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
                followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || []),
                projectIds: typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : (lead.projectIds || []),
                comments: typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : (lead.comments || []),
                activityLog: typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : (lead.activityLog || []),
                billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {})
            };
            setFormData(parsedLead);
        } else if (lead && formData.id === lead.id) {
            // Same lead reloaded - Merge only fields that aren't being actively edited
            // Use the last saved data as reference
            if (lastSavedDataRef.current) {
                // If the current formData matches what we last saved, we can safely update from the API
                const currentStatus = formData.status;
                const currentStage = formData.stage;
                const lastSavedStatus = lastSavedDataRef.current.status;
                const lastSavedStage = lastSavedDataRef.current.stage;
                
                // Only update if formData still matches our last save (meaning user hasn't made new changes)
                if (currentStatus === lastSavedStatus && currentStage === lastSavedStage) {
                    setFormData(prev => ({
                        ...prev,
                        status: lead.status,
                        stage: lead.stage
                    }));
                }
            }
        }
    }, [lead?.id]); // Only re-run when lead ID changes, not when lead properties change
    
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
    
    // Handle tab change and notify parent
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (onTabChange) {
            onTabChange(tab);
        }
    };
    
    // Use ref to track latest formData for auto-save
    const formDataRef = useRef(null);
    const isAutoSavingRef = useRef(false);
    const lastSavedDataRef = useRef(null); // Track last saved state
    
    const [formData, setFormData] = useState(() => {
        // Parse JSON strings to arrays/objects if needed
        const parsedLead = lead ? {
            ...lead,
            // Ensure stage and status are ALWAYS present with defaults
            stage: lead.stage || 'Awareness',
            status: 'active', // Status is hardcoded as 'active'
            contacts: typeof lead.contacts === 'string' ? JSON.parse(lead.contacts || '[]') : (lead.contacts || []),
            followUps: typeof lead.followUps === 'string' ? JSON.parse(lead.followUps || '[]') : (lead.followUps || []),
            projectIds: typeof lead.projectIds === 'string' ? JSON.parse(lead.projectIds || '[]') : (lead.projectIds || []),
            comments: typeof lead.comments === 'string' ? JSON.parse(lead.comments || '[]') : (lead.comments || []),
            activityLog: typeof lead.activityLog === 'string' ? JSON.parse(lead.activityLog || '[]') : (lead.activityLog || []),
            billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {})
        } : {
            name: '',
            industry: '',
            status: 'active', // Status is hardcoded as 'active'
            source: 'Website',
            stage: 'Awareness',
            value: 0,
            notes: '',
            contacts: [],
            followUps: [],
            projectIds: [],
            comments: [],
            activityLog: [],
            firstContactDate: new Date().toISOString().split('T')[0]
        };
        
        formDataRef.current = parsedLead;
        return parsedLead;
    });
    
    // Keep ref in sync with state
    useEffect(() => {
        formDataRef.current = formData;
    }, [formData]);
    
    const [editingContact, setEditingContact] = useState(null);
    const [showContactForm, setShowContactForm] = useState(false);
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
    // Notes helpers for tags and attachments
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
        
        const updatedContacts = [...(Array.isArray(formData.contacts) ? formData.contacts : []), {
            ...newContact,
            id: Date.now()
        }];
        
        const updatedFormData = {...formData, contacts: updatedContacts};
        setFormData(updatedFormData);
        logActivity('Contact Added', `Added contact: ${newContact.name} (${newContact.email})`);
        
        // Save contact changes immediately - stay in edit mode
        onSave(updatedFormData, true);
        
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
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setNewContact(contact);
        setShowContactForm(true);
    };

    const handleUpdateContact = () => {
        const contacts = Array.isArray(formData.contacts) ? formData.contacts : [];
        const updatedContacts = contacts.map(c => 
            c.id === editingContact.id ? {...newContact, id: c.id} : c
        );
        const updatedFormData = {...formData, contacts: updatedContacts};
        setFormData(updatedFormData);
        logActivity('Contact Updated', `Updated contact: ${newContact.name}`);
        
        // Save contact changes immediately - stay in edit mode
        onSave(updatedFormData, true);
        
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
            onSave(updatedFormData, true);
            
            // Stay in contacts tab
            handleTabChange('contacts');
        }
    };

    const handleAddFollowUp = () => {
        if (!newFollowUp.date || !newFollowUp.description) {
            alert('Date and description are required');
            return;
        }
        
        const updatedFollowUps = [...(Array.isArray(formData.followUps) ? formData.followUps : []), {
            ...newFollowUp,
            id: Date.now(),
            createdAt: new Date().toISOString()
        }];
        
        const updatedFormData = {...formData, followUps: updatedFollowUps};
        setFormData(updatedFormData);
        logActivity('Follow-up Added', `Scheduled ${newFollowUp.type} for ${newFollowUp.date}`);
        
        // Save follow-up changes immediately - stay in edit mode
        onSave(updatedFormData, true);
        
        setNewFollowUp({
            date: '',
            time: '',
            type: 'Call',
            description: '',
            completed: false
        });
    };

    const handleToggleFollowUp = (followUpId) => {
        const followUps = Array.isArray(formData.followUps) ? formData.followUps : [];
        const followUp = followUps.find(f => f.id === followUpId);
        const updatedFollowUps = followUps.map(f => 
            f.id === followUpId ? {...f, completed: !f.completed} : f
        );
        const updatedFormData = {...formData, followUps: updatedFollowUps};
        setFormData(updatedFormData);
        if (followUp && !followUp.completed) {
            logActivity('Follow-up Completed', `Completed: ${followUp.description}`);
        }
        
        // Save follow-up toggle immediately - stay in edit mode
        onSave(updatedFormData, true);
    };

    const handleDeleteFollowUp = (followUpId) => {
        if (confirm('Delete this follow-up?')) {
            const followUps = Array.isArray(formData.followUps) ? formData.followUps : [];
            const updatedFormData = {
                ...formData,
                followUps: followUps.filter(f => f.id !== followUpId)
            };
            setFormData(updatedFormData);
            
            // Save follow-up deletion immediately - stay in edit mode
            onSave(updatedFormData, true);
        }
    };

    // Google Calendar event handlers
    const handleGoogleEventCreated = (followUpId, updatedFollowUp) => {
        const followUps = Array.isArray(formData.followUps) ? formData.followUps : [];
        const updatedFollowUps = followUps.map(f => 
            f.id === followUpId ? { ...f, ...updatedFollowUp } : f
        );
        setFormData({
            ...formData,
            followUps: updatedFollowUps
        });
    };

    const handleGoogleEventUpdated = (followUpId, updatedFollowUp) => {
        const followUps = Array.isArray(formData.followUps) ? formData.followUps : [];
        const updatedFollowUps = followUps.map(f => 
            f.id === followUpId ? { ...f, ...updatedFollowUp } : f
        );
        setFormData({
            ...formData,
            followUps: updatedFollowUps
        });
    };

    const handleGoogleEventDeleted = (followUpId, updatedFollowUp) => {
        const followUps = Array.isArray(formData.followUps) ? formData.followUps : [];
        const updatedFollowUps = followUps.map(f => 
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

    const handleAddComment = () => {
        if (!newComment.trim()) return;
        
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        const updatedComments = [...(Array.isArray(formData.comments) ? formData.comments : []), {
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
        
        // Save comment changes immediately
        onSave(updatedFormData, true);
        
        setNewComment('');
        setNewNoteTags([]);
        setNewNoteTagsInput('');
        setNewNoteAttachments([]);
    };

    const logActivity = (type, description, relatedId = null) => {
        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
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
            activityLog: [...(Array.isArray(formData.activityLog) ? formData.activityLog : []), activity]
        });
    };

    const handleDeleteComment = (commentId) => {
        if (confirm('Delete this comment?')) {
            const comments = Array.isArray(formData.comments) ? formData.comments : [];
            const updatedFormData = {
                ...formData,
                comments: comments.filter(c => c.id !== commentId)
            };
            setFormData(updatedFormData);
            
            // Save comment deletion immediately - stay in edit mode
            onSave(updatedFormData, true);
        }
    };

    const handleToggleProject = (projectId) => {
        const newSelectedIds = selectedProjectIds.includes(projectId)
            ? selectedProjectIds.filter(id => id !== projectId)
            : [...selectedProjectIds, projectId];
        setSelectedProjectIds(newSelectedIds);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            ...formData,
            projectIds: selectedProjectIds,
            lastContact: new Date().toISOString().split('T')[0]
        });
    };

    const leadProjects = allProjects?.filter(p => selectedProjectIds.includes(p.id)) || [];
    // Only show available projects that belong to THIS lead (match by name)
    const availableProjects = allProjects?.filter(p => 
        !selectedProjectIds.includes(p.id) && 
        p.client === formData.name
    ) || [];
    const upcomingFollowUps = (Array.isArray(formData.followUps) ? formData.followUps : [])
        .filter(f => !f.completed)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    const getStageColor = (stage) => {
        switch(stage) {
            case 'Awareness': return 'bg-blue-100 text-blue-800';
            case 'Interest': return 'bg-purple-100 text-purple-800';
            case 'Desire': return 'bg-yellow-100 text-yellow-800';
            case 'Action': return 'bg-green-100 text-green-800';
            case 'Closed Won': return 'bg-emerald-100 text-emerald-800';
            case 'Closed Lost': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    if (isFullPage) {
        // Full-page view - no modal wrapper
        return (
            <div className="w-full h-full flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            {lead ? formData.name : 'Add New Lead'}
                        </h2>
                        {lead && (
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-sm text-gray-600">{formData.industry}</span>
                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${getStageColor(formData.stage)}`}>
                                    {formData.stage}
                                </span>
                            </div>
                        )}
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded transition-colors"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 px-3 sm:px-6">
                    <div className="flex gap-2 sm:gap-6 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {['overview', 'contacts', 'calendar', 'projects', 'activity', 'notes'].map(tab => (
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
                                    tab === 'calendar' ? 'calendar-alt' :
                                    tab === 'projects' ? 'folder-open' :
                                    tab === 'activity' ? 'history' :
                                    'comment-alt'
                                } mr-2`}></i>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                {tab === 'contacts' && Array.isArray(formData.contacts) && formData.contacts.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.contacts.length}
                                    </span>
                                )}
                                {tab === 'projects' && selectedProjectIds.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {selectedProjectIds.length}
                                    </span>
                                )}
                                {tab === 'calendar' && Array.isArray(upcomingFollowUps) && upcomingFollowUps.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-100 text-yellow-600 rounded text-xs">
                                        {upcomingFollowUps.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
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

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">First Contact Date</label>
                                        <input 
                                            type="date" 
                                            value={formData.firstContactDate || new Date().toISOString().split('T')[0]}
                                            onChange={(e) => setFormData({...formData, firstContactDate: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Status</label>
                                        <div className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                                            Active
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Source</label>
                                        <select 
                                            value={formData.source}
                                            onChange={(e) => setFormData({...formData, source: e.target.value})}
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
                                            AIDIA Stage
                                        </label>
                                        <select 
                                            value={formData.stage}
                                            onChange={(e) => {
                                                const newStage = e.target.value;
                                                
                                                // Update state
                                                setFormData(prev => {
                                                    return {...prev, stage: newStage};
                                                });
                                                
                                                // Auto-save using ref to get latest data
                                                if (lead) {
                                                    setTimeout(() => {
                                                        const latest = {...formDataRef.current, stage: newStage};
                                                        
                                                        // Save this as the last saved state
                                                        lastSavedDataRef.current = latest;
                                                        isAutoSavingRef.current = true;
                                                        
                                                        onSave(latest, true);
                                                        
                                                        // Clear the flag after a longer delay to allow API response to propagate
                                                        setTimeout(() => {
                                                            isAutoSavingRef.current = false;
                                                        }, 3000);
                                                    }, 0);
                                                }
                                            }}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="Awareness">Awareness - Lead knows about us</option>
                                            <option value="Interest">Interest - Lead shows engagement</option>
                                            <option value="Desire">Desire - Lead wants our solution</option>
                                            <option value="Action">Action - Ready to purchase</option>
                                            <option value="Closed Won">Closed Won - Deal completed</option>
                                            <option value="Closed Lost">Closed Lost - Deal lost</option>
                                        </select>
                                    </div>
                                </div>

                                

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
                                    <textarea 
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="3"
                                        placeholder="General information about this lead..."
                                    ></textarea>
                                </div>
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
                                                <option>Demo</option>
                                                <option>Proposal Review</option>
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
                                    {!Array.isArray(upcomingFollowUps) || upcomingFollowUps.length === 0 ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-calendar-alt text-3xl mb-2"></i>
                                            <p>No upcoming follow-ups scheduled</p>
                                        </div>
                                    ) : (
                                        (Array.isArray(upcomingFollowUps) ? upcomingFollowUps : []).map(followUp => (
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
                                                                    followUp.type === 'Demo' ? 'bg-orange-100 text-orange-700' :
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
                                                                {window.GoogleCalendarSync && (
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

                                {Array.isArray(formData.followUps) && formData.followUps.filter(f => f.completed).length > 0 && (
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
                                    <h3 className="text-lg font-semibold text-gray-900">Associated Projects</h3>
                                    <div className="text-sm text-gray-600">
                                        {selectedProjectIds.length} project{selectedProjectIds.length !== 1 ? 's' : ''} linked
                                    </div>
                                </div>

                                {leadProjects.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-gray-900 text-sm">Linked Projects</h4>
                                        {leadProjects.map(project => (
                                            <div key={project.id} className="bg-white border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <h4 className="font-semibold text-gray-900 text-sm">{project.name}</h4>
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
                                                            {project.assignedTo && (
                                                                <div><i className="fas fa-user mr-1.5 w-4"></i>{project.assignedTo}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleProject(project.id)}
                                                        className="text-red-600 hover:text-red-700 p-1"
                                                        title="Unlink Project"
                                                    >
                                                        <i className="fas fa-unlink"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {availableProjects.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="font-medium text-gray-900 text-sm">Available Projects to Link</h4>
                                        {availableProjects.map(project => (
                                            <div key={project.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <h4 className="font-semibold text-gray-900 text-sm mb-1">{project.name}</h4>
                                                        <div className="text-xs text-gray-600">
                                                            {project.client && <span className="mr-2"><i className="fas fa-building mr-1"></i>{project.client}</span>}
                                                            <span><i className="fas fa-tag mr-1"></i>{project.type}</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleProject(project.id)}
                                                        className="text-primary-600 hover:text-primary-700 p-1"
                                                        title="Link Project"
                                                    >
                                                        <i className="fas fa-link"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {availableProjects.length === 0 && leadProjects.length === 0 && (
                                    <div className="text-center py-8 text-gray-500 text-sm">
                                        <i className="fas fa-folder-open text-3xl mb-2"></i>
                                        <p>No projects available</p>
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
                                    {Array.from(new Set((Array.isArray(formData.comments) ? formData.comments : []).flatMap(c => Array.isArray(c.tags) ? c.tags : []))).map(tag => (
                                        <button key={tag} type="button" className={`text-xs px-2 py-0.5 rounded ${notesTagFilter === tag ? 'bg-primary-200 text-primary-800' : 'bg-gray-100'}`} onClick={() => setNotesTagFilter(tag)}>
                                            <i className="fas fa-tag mr-1"></i>{tag}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    {(!Array.isArray(formData.comments) || formData.comments.length === 0) ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">
                                            <i className="fas fa-comment-alt text-3xl mb-2"></i>
                                            <p>No comments yet</p>
                                        </div>
                                    ) : (
                                        (Array.isArray(formData.comments) ? formData.comments.filter(c => !notesTagFilter || (Array.isArray(c.tags) && c.tags.includes(notesTagFilter))) : []).map(comment => (
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
                            <div className="flex gap-2">
                                {lead && onDelete && (
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            if (confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
                                                onDelete(lead.id);
                                                onClose();
                                            }
                                        }}
                                        className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center"
                                    >
                                        <i className="fas fa-trash mr-2"></i>
                                        Delete Lead
                                    </button>
                                )}
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
                                    className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center"
                                >
                                    <i className="fas fa-save mr-2"></i>
                                    {lead ? 'Update Lead' : 'Create Lead'}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        );
    } else {
        // Modal view - with modal wrapper
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900">
                                {lead ? formData.name : 'Add New Lead'}
                            </h2>
                            {lead && (
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-sm text-gray-600">{formData.industry}</span>
                                </div>
                            )}
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition-colors"
                        >
                            <i className="fas fa-times text-xl"></i>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto">
                        <form onSubmit={handleSubmit} className="h-full flex flex-col">
                            {/* Tabs */}
                            <div className="border-b border-gray-200 px-3 sm:px-6">
                                <div className="flex gap-2 sm:gap-6 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    {['overview', 'contacts', 'calendar', 'projects', 'activity', 'notes'].map(tab => (
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
                                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tab Content */}
                            <div className="flex-1 p-6">
                                {activeTab === 'overview' && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Entity Name
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.name}
                                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                placeholder="Enter lead name"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Industry
                                            </label>
                                            <select
                                                value={formData.industry}
                                                onChange={(e) => setFormData({...formData, industry: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            >
                                                <option value="Technology">Technology</option>
                                                <option value="Manufacturing">Manufacturing</option>
                                                <option value="Healthcare">Healthcare</option>
                                                <option value="Finance">Finance</option>
                                                <option value="Retail">Retail</option>
                                                <option value="Education">Education</option>
                                                <option value="Government">Government</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                First Contact Date
                                            </label>
                                            <input
                                                type="date"
                                                value={formData.firstContactDate}
                                                onChange={(e) => setFormData({...formData, firstContactDate: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Status
                                            </label>
                                            <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700">
                                                Active
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Source
                                            </label>
                                            <input
                                                type="text"
                                                value={formData.source}
                                                onChange={(e) => setFormData({...formData, source: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                placeholder="e.g., Website, Referral, Cold Call"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">AIDIA Stage</label>
                                            <select
                                                value={formData.stage}
                                                onChange={(e) => setFormData({...formData, stage: e.target.value})}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            >
                                                <option value="Awareness">Awareness - Lead knows about us</option>
                                                <option value="Interest">Interest - Lead is interested</option>
                                                <option value="Desire">Desire - Lead wants our solution</option>
                                                <option value="Action">Action - Lead is ready to buy</option>
                                            </select>
                                        </div>
                                        
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Notes
                                            </label>
                                            <textarea
                                                value={formData.notes}
                                                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                                rows={4}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                                                placeholder="Add notes about this lead..."
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Other tab content would go here - simplified for brevity */}
                                {activeTab !== 'overview' && (
                                    <div className="text-center py-8 text-gray-500">
                                        {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} content coming soon...
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="border-t border-gray-200 px-6 py-4">
                                <div className="flex justify-between">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center"
                                    >
                                        <i className="fas fa-save mr-2"></i>
                                        {lead ? 'Update Lead' : 'Create Lead'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        );
    }
};

// Make available globally
window.LeadDetailModal = LeadDetailModal;
