// Get React hooks from window
// FIX: formData initialization order fixed - moved to top to prevent TDZ errors (v2)
const { useState, useEffect, useRef } = React;

const LeadDetailModal = ({ lead, onSave, onUpdate, onClose, onDelete, onConvertToClient, allProjects, isFullPage = false, isEditing = false, initialTab = 'overview', onTabChange }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    
    // CRITICAL: Initialize formData FIRST with a safe default, before any other hooks or refs
    // This prevents "Cannot access 'formData' before initialization" errors
    // FIXED: formData now declared before all useEffect hooks that reference it
    // Create default object first to ensure it's always defined
    const defaultFormData = {
        name: '',
        industry: '',
        status: 'active',
        source: 'Website',
        stage: 'Awareness',
        value: 0,
        notes: '',
        contacts: [],
        followUps: [],
        projectIds: [],
        comments: [],
        activityLog: [],
        proposals: [],
        firstContactDate: new Date().toISOString().split('T')[0],
        thumbnail: '',
        id: null // Ensure id exists even if null
    };
    
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
            billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {}),
            proposals: typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []),
            thumbnail: lead.thumbnail || ''
        } : defaultFormData;
        
        return parsedLead;
    });
    
    // Use ref to track latest formData for auto-save
    const formDataRef = useRef(null);
    const isAutoSavingRef = useRef(false);
    const lastSavedDataRef = useRef(null); // Track last saved state
    const isSavingProposalsRef = useRef(false); // Track when proposals are being saved
    const isCreatingProposalRef = useRef(false); // Track when a proposal is being created (use ref for immediate updates)
    
    // Initialize formDataRef after formData is declared
    useEffect(() => {
        formDataRef.current = formData;
        
        // Debug: Log when proposals change
        if (formData.proposals && Array.isArray(formData.proposals)) {
            console.log('📋 formData.proposals updated:', {
                count: formData.proposals.length,
                ids: formData.proposals.map(p => p?.id || 'no-id'),
                titles: formData.proposals.map(p => p?.title || p?.name || 'no-title')
            });
        }
    }, [formData]);
    
    // Update tab when initialTab prop changes
    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);
    
    // Update formData when lead prop changes - but only when lead ID changes
    // NOTE: formData is intentionally NOT in dependency array to prevent loops
    // IMPORTANT: Never access formData directly in this useEffect to avoid TDZ errors
    // Use formDataRef.current which is synced via a separate useEffect
    useEffect(() => {
        // Don't reset formData if we're in the middle of auto-saving OR saving proposals OR creating a proposal
        if (isAutoSavingRef.current || isSavingProposalsRef.current || isCreatingProposalRef.current) {
            console.log('🚫 useEffect blocked: saving in progress', {
                isAutoSaving: isAutoSavingRef.current,
                isSavingProposals: isSavingProposalsRef.current,
                isCreatingProposal: isCreatingProposalRef.current
            });
            return;
        }
        
        // CRITICAL: Only use formDataRef.current or defaultFormData - NEVER access formData directly here
        // formDataRef.current is updated by a separate useEffect that runs after formData is set
        // On first render, formDataRef.current may be null, so we use defaultFormData
        const currentFormData = formDataRef.current || defaultFormData;
        
        // ONLY initialize formData when switching to a different lead (different ID)
        // Do NOT reinitialize when the same lead is updated
        if (lead && !currentFormData.id) {
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
                billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {}),
                proposals: typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []),
                thumbnail: lead.thumbnail || ''
            };
            setFormData(parsedLead);
        } else if (lead && currentFormData.id && lead.id !== currentFormData.id) {
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
                billingTerms: typeof lead.billingTerms === 'string' ? JSON.parse(lead.billingTerms || '{}') : (lead.billingTerms || {}),
                proposals: typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []),
                thumbnail: lead.thumbnail || ''
            };
            setFormData(parsedLead);
        } else if (lead && currentFormData.id === lead.id) {
            // Same lead reloaded - Merge only fields that aren't being actively edited
            // CRITICAL: ALWAYS preserve proposals from current formData - NEVER overwrite from lead prop
            // The lead prop might have stale or incomplete proposals from API responses
            const currentProposals = currentFormData.proposals || [];
            const leadProposals = typeof lead.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || []);
            
            console.log('🔄 Same lead reloaded - ALWAYS preserving proposals:', {
                currentProposalsCount: currentProposals.length,
                leadProposalsCount: leadProposals.length,
                currentProposalIds: currentProposals.map(p => p.id),
                leadProposalIds: leadProposals.map(p => p.id),
                isSavingProposals: isSavingProposalsRef.current,
                isCreatingProposal: isCreatingProposalRef.current,
                hasLastSavedData: !!lastSavedDataRef.current
            });
            
            // CRITICAL: If we have proposals in formData (even if empty), NEVER overwrite from lead prop
            // This prevents API responses from clearing proposals that were just created
            // Only use lead.proposals if formData has NO proposals at all (initial load)
            const proposalsToUse = (Array.isArray(currentProposals) && currentProposals.length > 0) 
                ? currentProposals 
                : (lastSavedDataRef.current?.proposals && Array.isArray(lastSavedDataRef.current.proposals) && lastSavedDataRef.current.proposals.length > 0)
                    ? lastSavedDataRef.current.proposals
                    : leadProposals;
            
            console.log('✅ Using proposals:', {
                source: (Array.isArray(currentProposals) && currentProposals.length > 0) ? 'currentFormData' 
                    : (lastSavedDataRef.current?.proposals?.length > 0) ? 'lastSavedData' 
                    : 'leadProp',
                count: proposalsToUse.length,
                ids: proposalsToUse.map(p => p.id)
            });
            
            // Update other fields from lead prop, but ALWAYS preserve proposals from formData
                    setFormData(prev => ({
                        ...prev,
                // Update other fields that might have changed externally
                status: lead.status || prev.status,
                stage: lead.stage || prev.stage,
                // CRITICAL: NEVER overwrite proposals from lead prop if we have any in formData
                proposals: proposalsToUse
            }));
            
            return; // Don't process further updates
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    
    // Refs for auto-scrolling comments
    const commentsContainerRef = useRef(null);
    const contentScrollableRef = useRef(null);
    
    // Auto-scroll to last comment when notes tab is opened
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
    const [thumbnailPreview, setThumbnailPreview] = useState(null);
    const [showThumbnailPreview, setShowThumbnailPreview] = useState(false);
    const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
    
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
                const token = window.storage?.getToken?.();
                if (!token) return;
                
                const response = await fetch('/api/users', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setAllUsers(data.data?.users || data.users || []);
                }
            } catch (error) {
                console.error('Error loading users:', error);
            }
        };
        
        loadUsers();
        
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
            
            console.log('💾 Saving proposals:', {
                currentCount: currentProposals.length,
                updatedCount: updatedProposals.length,
                mergedCount: finalProposals.length,
                currentIds: currentProposals.map(p => p.id),
                updatedIds: updatedProposals.map(p => p.id),
                finalIds: finalProposals.map(p => p.id),
                isCreatingProposal: isCreatingProposalRef.current
            });
            
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
                    console.log('📡 Calling onSave with proposals...');
                    await onSave(finalFormData, true);
                    console.log('✅ Proposals saved successfully to API');
                    // Keep the flag set longer to prevent immediate reset when API response comes back
                    setTimeout(() => {
                        isSavingProposalsRef.current = false;
                        console.log('🔓 Save guard released');
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
    const sendNotification = async (userId, title, message, link) => {
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
                    link: link || ''
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
    const notifyAllAssignedParties = async (proposal, title, message, link) => {
        const assigneeIds = getAllAssignedParties(proposal);
        const notificationPromises = assigneeIds.map(userId => 
            sendNotification(userId, title, message, link)
        );
        await Promise.all(notificationPromises);
    };
    
    // Tag management state
    const [leadTags, setLeadTags] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [showTagSelector, setShowTagSelector] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3B82F6');
    
    // Load tags when lead changes
    useEffect(() => {
        if (lead?.id) {
            loadLeadTags();
            loadAllTags();
        }
    }, [lead?.id]);
    
    // Load lead tags
    const loadLeadTags = async () => {
        if (!lead?.id) return;
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const response = await fetch(`/api/clients/${lead.id}/tags`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setLeadTags(data.data?.tags || []);
            }
        } catch (error) {
            console.error('Error loading lead tags:', error);
        }
    };
    
    // Load all available tags
    const loadAllTags = async () => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const response = await fetch('/api/tags', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setAllTags(data.data?.tags || []);
            }
        } catch (error) {
            console.error('Error loading tags:', error);
        }
    };
    
    // Add tag to lead
    const handleAddTag = async (tagId) => {
        if (!lead?.id) return;
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const response = await fetch(`/api/clients/${lead.id}/tags`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ tagId })
            });
            
            if (response.ok) {
                const data = await response.json();
                setLeadTags(prev => [...prev, data.data.tag]);
                loadLeadTags(); // Reload to ensure consistency
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to add tag');
            }
        } catch (error) {
            console.error('Error adding tag:', error);
            alert('Failed to add tag: ' + error.message);
        }
    };
    
    // Remove tag from lead
    const handleRemoveTag = async (tagId) => {
        if (!lead?.id) return;
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const response = await fetch(`/api/clients/${lead.id}/tags?tagId=${tagId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                setLeadTags(prev => prev.filter(t => t.id !== tagId));
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to remove tag');
            }
        } catch (error) {
            console.error('Error removing tag:', error);
            alert('Failed to remove tag: ' + error.message);
        }
    };
    
    // Create new tag
    const handleCreateTag = async () => {
        if (!newTagName.trim()) {
            alert('Please enter a tag name');
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const response = await fetch('/api/tags', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: newTagName.trim(),
                    color: newTagColor
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                const newTag = data.data.tag;
                setAllTags(prev => [...prev, newTag]);
                setNewTagName('');
                setNewTagColor('#3B82F6');
                
                // Automatically add to lead
                await handleAddTag(newTag.id);
            } else {
                const error = await response.json();
                alert(error.error?.message || 'Failed to create tag');
            }
        } catch (error) {
            console.error('Error creating tag:', error);
            alert('Failed to create tag: ' + error.message);
        }
    };

    // Handle thumbnail upload
    const handleThumbnailUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Validate image type
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('Image size must be less than 5MB');
            return;
        }

        setUploadingThumbnail(true);
        try {
            // Convert to base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                setThumbnailPreview(dataUrl);

                // Upload to server
                const token = window.storage?.getToken?.();
                if (!token) {
                    alert('Please log in to upload images');
                    setUploadingThumbnail(false);
                    return;
                }

                try {
                    const response = await fetch('/api/files', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            folder: 'thumbnails',
                            name: file.name,
                            dataUrl: dataUrl
                        })
                    });

                    if (!response.ok) {
                        throw new Error('Upload failed');
                    }

                    const result = await response.json();
                    setFormData({ ...formData, thumbnail: result.url });
                    setUploadingThumbnail(false);
                } catch (error) {
                    console.error('Thumbnail upload error:', error);
                    alert('Failed to upload thumbnail: ' + error.message);
                    setUploadingThumbnail(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error('Thumbnail read error:', error);
            alert('Failed to read image file');
            setUploadingThumbnail(false);
        }
    };

    const handleRemoveThumbnail = () => {
        setFormData({ ...formData, thumbnail: '' });
        setThumbnailPreview(null);
    };

    // Load thumbnail preview when formData changes
    // CRITICAL FIX: Cannot use formData in dependency array as it causes TDZ error
    // Track thumbnail in state to avoid accessing formData directly in dependency array
    const [thumbnailValue, setThumbnailValue] = useState('');
    
    // Sync thumbnail state when formData changes
    useEffect(() => {
        const currentFormData = formDataRef.current || defaultFormData;
        const thumbnail = currentFormData.thumbnail || '';
        if (thumbnail !== thumbnailValue) {
            setThumbnailValue(thumbnail);
        }
    }); // Run on every render to sync with formDataRef
    
    useEffect(() => {
        if (thumbnailValue) {
            setThumbnailPreview(thumbnailValue);
        }
    }, [thumbnailValue]);

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
            
            console.log('💾 Saving contact with updatedFormData:', {
                contactsCount: updatedContacts.length,
                activityLogCount: updatedActivityLog.length,
                hasContacts: Array.isArray(updatedContacts),
                hasActivityLog: Array.isArray(updatedActivityLog),
                contacts: updatedContacts,
                activityLog: updatedActivityLog
            });
            
            // Save contact changes immediately - stay in edit mode
            // Ensure onSave completes - it's async
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Contact save completed successfully');
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
            
            console.log('💾 Saving contact update with updatedFormData:', {
                contactsCount: updatedContacts.length,
                activityLogCount: updatedActivityLog.length
            });
            
            // Save contact changes immediately - stay in edit mode
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Contact update saved successfully');
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
                    console.log('✅ Contact deletion saved successfully');
                } catch (error) {
                    console.error('❌ Error saving contact deletion:', error);
                }
            })();
            
            // Stay in contacts tab
            handleTabChange('contacts');
        }
    };

    const handleAddFollowUp = () => {
        if (!newFollowUp.date || !newFollowUp.description) {
            alert('Date and description are required');
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
            
            const newFollowUpId = Date.now();
            const updatedFollowUps = [...(Array.isArray(formData.followUps) ? formData.followUps : []), {
                ...newFollowUp,
                id: newFollowUpId,
                createdAt: new Date().toISOString()
            }];
            
            // Create activity log entry
            const activity = {
                id: Date.now(),
                type: 'Follow-up Added',
                description: `Scheduled ${newFollowUp.type} for ${newFollowUp.date}`,
                timestamp: new Date().toISOString(),
                user: currentUser.name,
                userId: currentUser.id,
                userEmail: currentUser.email,
                relatedId: newFollowUpId
            };
            
            const updatedActivityLog = [...(Array.isArray(formData.activityLog) ? formData.activityLog : []), activity];
            
            const updatedFormData = {
                ...formData, 
                followUps: updatedFollowUps,
                activityLog: updatedActivityLog
            };
            
            setFormData(updatedFormData);
            
            console.log('💾 Saving follow-up with updatedFormData:', {
                followUpsCount: updatedFollowUps.length,
                activityLogCount: updatedActivityLog.length,
                hasFollowUps: Array.isArray(updatedFollowUps),
                hasActivityLog: Array.isArray(updatedActivityLog),
                followUps: updatedFollowUps,
                activityLog: updatedActivityLog
            });
            
            // Save follow-up changes immediately - stay in edit mode
            // Ensure onSave completes - it's async
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Follow-up save completed successfully');
                } catch (error) {
                    console.error('❌ Error saving follow-up:', error);
                    alert('Failed to save follow-up. Please try again.');
                }
            })();
            
            setNewFollowUp({
                date: '',
                time: '',
                type: 'Call',
                description: '',
                completed: false
            });
        } catch (error) {
            console.error('❌ Error adding follow-up:', error);
            alert('Failed to add follow-up: ' + error.message);
        }
    };

    const handleToggleFollowUp = (followUpId) => {
        try {
            const followUps = Array.isArray(formData.followUps) ? formData.followUps : [];
            const followUp = followUps.find(f => f.id === followUpId);
            const updatedFollowUps = followUps.map(f => 
                f.id === followUpId ? {...f, completed: !f.completed} : f
            );
            
            let updatedActivityLog = Array.isArray(formData.activityLog) ? formData.activityLog : [];
            
            // Add activity log entry if completing follow-up
            if (followUp && !followUp.completed) {
                const currentUser = window.storage?.getUserInfo?.() || { name: 'System', email: 'system', id: 'system' };
                const activity = {
                    id: Date.now(),
                    type: 'Follow-up Completed',
                    description: `Completed: ${followUp.description}`,
                    timestamp: new Date().toISOString(),
                    user: currentUser.name,
                    userId: currentUser.id,
                    userEmail: currentUser.email,
                    relatedId: followUpId
                };
                updatedActivityLog = [...updatedActivityLog, activity];
            }
            
            const updatedFormData = {
                ...formData, 
                followUps: updatedFollowUps,
                activityLog: updatedActivityLog
            };
            
            setFormData(updatedFormData);
            
            console.log('💾 Saving follow-up toggle with updatedFormData:', {
                followUpsCount: updatedFollowUps.length,
                activityLogCount: updatedActivityLog.length
            });
            
            // Save follow-up toggle immediately - stay in edit mode
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Follow-up toggle saved successfully');
                } catch (error) {
                    console.error('❌ Error saving follow-up toggle:', error);
                }
            })();
        } catch (error) {
            console.error('❌ Error toggling follow-up:', error);
            alert('Failed to toggle follow-up: ' + error.message);
        }
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
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Follow-up deletion saved successfully');
                } catch (error) {
                    console.error('❌ Error saving follow-up deletion:', error);
                }
            })();
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

    const handleAddComment = async () => {
        if (!newComment.trim()) return;
        
        try {
            // Get current user info
            const currentUser = window.storage?.getUserInfo?.() || { name: 'System', email: 'system', id: 'system' };
            
            // Process @mentions if MentionHelper is available
            if (window.MentionHelper && window.MentionHelper.hasMentions(newComment)) {
                try {
                    // Fetch all users for mention matching
                    const token = window.storage?.getToken?.();
                    if (token && window.DatabaseAPI?.getUsers) {
                        const usersResponse = await window.DatabaseAPI.getUsers();
                        const allUsers = usersResponse?.data?.users || usersResponse?.data?.data?.users || [];
                        
                        const contextTitle = `Lead: ${formData.name || formData.companyName || 'Unknown Lead'}`;
                        const contextLink = `#/leads/${formData.id}`;
                        
                        // Process mentions
                        await window.MentionHelper.processMentions(
                            newComment,
                            contextTitle,
                            contextLink,
                            currentUser.name || currentUser.email || 'Unknown',
                            allUsers
                        );
                        console.log('✅ @Mention notifications processed for lead comment');
                    }
                } catch (error) {
                    console.error('❌ Error processing @mentions:', error);
                    // Don't fail the comment if mention processing fails
                }
            }
            
            const commentId = Date.now();
            const updatedComments = [...(Array.isArray(formData.comments) ? formData.comments : []), {
                id: commentId,
                text: newComment,
                tags: Array.isArray(newNoteTags) ? newNoteTags : [],
                attachments: Array.isArray(newNoteAttachments) ? newNoteAttachments : [],
                createdAt: new Date().toISOString(),
                createdBy: currentUser.name,
                createdByEmail: currentUser.email,
                createdById: currentUser.id
            }];
            
            // Create activity log entry
            const activity = {
                id: Date.now(),
                type: 'Comment Added',
                description: `Added note: ${newComment.substring(0, 50)}${newComment.length > 50 ? '...' : ''}`,
                timestamp: new Date().toISOString(),
                user: currentUser.name,
                userId: currentUser.id,
                userEmail: currentUser.email,
                relatedId: commentId
            };
            
            const updatedActivityLog = [...(Array.isArray(formData.activityLog) ? formData.activityLog : []), activity];
            
            const updatedFormData = {
                ...formData, 
                comments: updatedComments,
                activityLog: updatedActivityLog
            };
            
            setFormData(updatedFormData);
            
            console.log('💾 Saving comment with updatedFormData:', {
                commentsCount: updatedComments.length,
                activityLogCount: updatedActivityLog.length
            });
            
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
            
            // Save comment changes immediately
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Comment save completed successfully');
                } catch (error) {
                    console.error('❌ Error saving comment:', error);
                    alert('Failed to save comment. Please try again.');
                }
            })();
            
            setNewComment('');
            setNewNoteTags([]);
            setNewNoteTagsInput('');
            setNewNoteAttachments([]);
        } catch (error) {
            console.error('❌ Error adding comment:', error);
            alert('Failed to add comment: ' + error.message);
        }
    };

    const logActivity = (type, description, relatedId = null) => {
        try {
            // Get current user info - handle different storage API structures
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
            
            // Use functional update to ensure we have latest formData
            setFormData(prevFormData => {
                const updatedActivityLog = [...(Array.isArray(prevFormData.activityLog) ? prevFormData.activityLog : []), activity];
                return {
                    ...prevFormData,
                    activityLog: updatedActivityLog
                };
            });
        } catch (error) {
            console.error('❌ Error logging activity:', error);
            // Don't throw - just log the error so the save can continue
        }
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
            (async () => {
                try {
                    await onSave(updatedFormData, true);
                    console.log('✅ Comment deletion saved successfully');
                } catch (error) {
                    console.error('❌ Error saving comment deletion:', error);
                }
            })();
        }
    };

    const handleToggleProject = (projectId) => {
        const newSelectedIds = selectedProjectIds.includes(projectId)
            ? selectedProjectIds.filter(id => id !== projectId)
            : [...selectedProjectIds, projectId];
        setSelectedProjectIds(newSelectedIds);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate required fields
        if (!formData.name || formData.name.trim() === '') {
            alert('Please enter an Entity Name');
            return;
        }
        
        if (!onSave) {
            console.error('❌ onSave callback is not defined');
            alert('Error: Save function is not available. Please refresh the page.');
            return;
        }
        
        console.log('💾 Submitting lead form:', formData);
        
        try {
            const leadData = {
                ...formData,
                projectIds: selectedProjectIds,
                lastContact: new Date().toISOString().split('T')[0]
            };
            
            // Use onUpdate if provided (for updates that should close the modal)
            // Otherwise use onSave (for auto-saves that stay in edit mode)
            if (onUpdate && lead) {
                await onUpdate(leadData);
            } else {
                await onSave(leadData);
            }
        } catch (error) {
            console.error('❌ Error in handleSubmit:', error);
            alert('Error saving lead: ' + (error.message || 'Unknown error'));
        }
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

    // Thumbnail Preview Modal Component - defined before use
    const ThumbnailPreviewModal = () => (
        showThumbnailPreview && (thumbnailPreview || formData.thumbnail) && (
            <div 
                className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]"
                onClick={() => setShowThumbnailPreview(false)}
            >
                <div className="relative max-w-4xl max-h-[90vh] p-4">
                    <button
                        onClick={() => setShowThumbnailPreview(false)}
                        className="absolute top-2 right-2 bg-white rounded-full w-10 h-10 flex items-center justify-center text-gray-700 hover:bg-gray-100 shadow-lg z-10"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                    <img 
                        src={thumbnailPreview || formData.thumbnail} 
                        alt="Thumbnail full view" 
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            </div>
        )
    );

    if (isFullPage) {
        // Full-page view - no modal wrapper
        return (
            <>
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
                    <div className="flex flex-wrap gap-2 sm:gap-6">
                        {['overview', 'contacts', 'calendar', 'projects', 'proposals', 'activity', 'notes'].map(tab => (
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
                                    tab === 'proposals' ? 'file-contract' :
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
                                {tab === 'proposals' && Array.isArray(formData.proposals) && formData.proposals.length > 0 && (
                                    <span className="ml-1.5 px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                                        {formData.proposals.length}
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
                <div ref={contentScrollableRef} className="flex-1 overflow-y-auto p-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-4">
                                {/* Thumbnail Upload Section */}
                                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Thumbnail Image
                                    </label>
                                    <div className="flex items-center gap-4">
                                        {thumbnailPreview || formData.thumbnail ? (
                                            <div className="relative">
                                                <img 
                                                    src={thumbnailPreview || formData.thumbnail} 
                                                    alt="Thumbnail preview" 
                                                    className="w-24 h-24 object-cover rounded-lg border border-gray-300 cursor-pointer hover:opacity-80 transition"
                                                    onClick={() => setShowThumbnailPreview(true)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleRemoveThumbnail}
                                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                                                    title="Remove thumbnail"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white">
                                                <i className="fas fa-image text-gray-400 text-2xl"></i>
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleThumbnailUpload}
                                                className="hidden"
                                                id="thumbnail-upload"
                                                disabled={uploadingThumbnail}
                                            />
                                            <label
                                                htmlFor="thumbnail-upload"
                                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 cursor-pointer transition ${
                                                    uploadingThumbnail 
                                                        ? 'bg-gray-200 cursor-not-allowed' 
                                                        : 'bg-white hover:bg-gray-50'
                                                }`}
                                            >
                                                {uploadingThumbnail ? (
                                                    <>
                                                        <i className="fas fa-spinner fa-spin text-gray-500"></i>
                                                        <span className="text-sm text-gray-600">Uploading...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <i className="fas fa-upload text-gray-600"></i>
                                                        <span className="text-sm text-gray-700">
                                                            {thumbnailPreview || formData.thumbnail ? 'Change' : 'Upload'} Thumbnail
                                                        </span>
                                                    </>
                                                )}
                                            </label>
                                            <p className="text-xs text-gray-500 mt-1">Click thumbnail to view full size</p>
                                        </div>
                                    </div>
                                </div>

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
                                            onChange={async (e) => {
                                                const newStage = e.target.value;
                                                
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
                                                        isAutoSavingRef.current = true;
                                                        
                                                                // Save to API - ensure it's awaited
                                                                await onSave(latest, true);
                                                                
                                                                console.log('✅ Stage saved successfully:', newStage);
                                                        
                                                        // Clear the flag after a longer delay to allow API response to propagate
                                                        setTimeout(() => {
                                                            isAutoSavingRef.current = false;
                                                        }, 3000);
                                                            } catch (error) {
                                                                console.error('❌ Error saving stage:', error);
                                                                isAutoSavingRef.current = false;
                                                                alert('Failed to save stage change. Please try again.');
                                                }
                                                        }, 100); // Small delay to ensure state update is processed
                                                    }
                                                    
                                                    return updated;
                                                });
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
                                        onChange={(e) => {
                                            const updated = {...formData, notes: e.target.value};
                                            setFormData(updated);
                                            formDataRef.current = updated;
                                        }}
                                        onBlur={() => {
                                            // Auto-save notes when user leaves the field
                                            if (lead && formDataRef.current) {
                                                const latest = {...formDataRef.current};
                                                onSave(latest, true);
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent" 
                                        rows="3"
                                        placeholder="General information about this lead..."
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

                                {/* Tags Section */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {leadTags.map(tag => (
                                            <span
                                                key={tag.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition"
                                                style={{
                                                    backgroundColor: tag.color ? `${tag.color}20` : '#3B82F620',
                                                    color: tag.color || '#3B82F6',
                                                    borderColor: tag.color || '#3B82F6'
                                                }}
                                            >
                                                <i className="fas fa-tag"></i>
                                                {tag.name}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveTag(tag.id)}
                                                    className="ml-1 hover:opacity-70"
                                                    title="Remove tag"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    
                                    <div className="flex gap-2">
                                        <div className="flex-1 relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowTagSelector(!showTagSelector)}
                                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-between"
                                            >
                                                <span className="text-gray-600">Add Tag</span>
                                                <i className={`fas fa-chevron-${showTagSelector ? 'up' : 'down'} text-gray-400`}></i>
                                            </button>
                                            
                                            {showTagSelector && (
                                                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                                    {allTags.filter(tag => !leadTags.find(lt => lt.id === tag.id)).map(tag => (
                                                        <button
                                                            key={tag.id}
                                                            type="button"
                                                            onClick={() => {
                                                                handleAddTag(tag.id);
                                                                setShowTagSelector(false);
                                                            }}
                                                            className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                                                        >
                                                            <span
                                                                className="w-3 h-3 rounded-full"
                                                                style={{ backgroundColor: tag.color || '#3B82F6' }}
                                                            ></span>
                                                            {tag.name}
                                                        </button>
                                                    ))}
                                                    {allTags.filter(tag => !leadTags.find(lt => lt.id === tag.id)).length === 0 && (
                                                        <div className="px-3 py-2 text-sm text-gray-500 text-center">No available tags</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNewTagName('');
                                                setNewTagColor('#3B82F6');
                                            }}
                                            className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                                        >
                                            <i className="fas fa-plus mr-1"></i>
                                            New Tag
                                        </button>
                                    </div>
                                    
                                    {newTagName && (
                                        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="flex items-center gap-2 mb-2">
                                                <input
                                                    type="text"
                                                    value={newTagName}
                                                    onChange={(e) => setNewTagName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleCreateTag();
                                                        } else if (e.key === 'Escape') {
                                                            setNewTagName('');
                                                            setNewTagColor('#3B82F6');
                                                        }
                                                    }}
                                                    placeholder="Tag name"
                                                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded"
                                                    autoFocus
                                                />
                                                <input
                                                    type="color"
                                                    value={newTagColor}
                                                    onChange={(e) => setNewTagColor(e.target.value)}
                                                    className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                                                    title="Select tag color"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleCreateTag}
                                                    className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
                                                >
                                                    Create & Add
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setNewTagName('');
                                                        setNewTagColor('#3B82F6');
                                                    }}
                                                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
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

                        {/* Proposals Tab */}
                        {activeTab === 'proposals' && (
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
                                            
                                            console.log('🆕 Creating new proposal...');
                                            
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
                                            
                                            console.log('🔍 Checking for duplicates:', {
                                                proposalId,
                                                existingCount: existingProposals.length,
                                                existingIds: existingProposals.map(p => p.id),
                                                formDataProposalsCount: formData.proposals?.length || 0,
                                                formDataRefProposalsCount: formDataRef.current?.proposals?.length || 0
                                            });
                                            
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
                                            
                                            console.log('✅ No duplicate found, proceeding with creation');
                                            
                                            console.log('✅ Adding proposal to state:', proposalId);
                                            // Use functional update to merge with existing proposals properly
                                            const updatedProposals = [...existingProposals, newProposal];
                                            console.log('📝 Updated proposals count:', updatedProposals.length, 'IDs:', updatedProposals.map(p => p.id));
                                            await saveProposals(updatedProposals);
                                            
                                            // Notify all assigned parties of the new proposal
                                            await notifyAllAssignedParties(
                                                newProposal,
                                                `New Proposal Created: ${newProposal.title || newProposal.name}`,
                                                `A new proposal "${newProposal.title || newProposal.name}" has been created for ${formData.name || 'this lead'}.`,
                                                `#/clients?lead=${lead.id}&tab=proposals`
                                            );
                                            
                                            // Reset flags after a delay (longer to ensure save completes)
                                            setTimeout(() => {
                                                isCreatingProposalRef.current = false;
                                                setIsCreatingProposal(false);
                                                console.log('🔓 Proposal creation guard released');
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
                                                        console.log('🔍 Manual Debug Check:', {
                                                            formDataProposals: formData.proposals,
                                                            formDataRefProposals: formDataRef.current?.proposals,
                                                            lastSavedProposals: lastSavedDataRef.current?.proposals,
                                                            isSavingProposals: isSavingProposalsRef.current,
                                                            isCreatingProposal: isCreatingProposalRef.current,
                                                            leadProposals: typeof lead?.proposals === 'string' ? JSON.parse(lead.proposals || '[]') : (lead.proposals || [])
                                                        });
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
                                                                                    `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                        defaultValue={proposal.workingDocumentLink || ''}
                                                                        onChange={(e) => {
                                                                            const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                idx === proposalIndex ? { ...p, workingDocumentLink: e.target.value } : p
                                                                            );
                                                                            setFormData({ ...formData, proposals: updatedProposals });
                                                                        }}
                                                                        onBlur={async (e) => {
                                                                            const oldLink = proposal.workingDocumentLink || '';
                                                                            const newLink = e.target.value || '';
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
                                                                                    `#/clients?lead=${lead.id}&tab=proposals`
                                                                                );
                                                                            }
                                                                        }}
                                                                        placeholder="https://..."
                                                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                                    />
                                                                    {proposal.workingDocumentLink && (
                                                                        <a 
                                                                            href={proposal.workingDocumentLink} 
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
                                                                    `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                                                    `#/clients?lead=${lead.id}&tab=proposals`
                                                                                                );
                                                                                                
                                                                                                // Also notify the newly assigned user if they were just assigned
                                                                                                if (updatedStage.assigneeId && updatedStage.assigneeId !== oldAssigneeId) {
                                                                                                    await sendNotification(
                                                                                                        updatedStage.assigneeId,
                                                                                                        `New Assignment: ${updatedProposal.title || updatedProposal.name}`,
                                                                                                        `You have been assigned to stage "${updatedStage.name}" on proposal "${updatedProposal.title || updatedProposal.name}".`,
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                                                    `#/clients?lead=${lead.id}&tab=proposals`
                                                                                                );
                                                                                                
                                                                                                // Also notify assigned user of next stage if it exists
                                                                                                if (stageIndex + 1 < proposal.stages.length) {
                                                                                                    const nextStage = updatedStages[stageIndex + 1];
                                                                                                    if (nextStage.assigneeId) {
                                                                                                        await sendNotification(
                                                                                                            nextStage.assigneeId,
                                                                                                            `Proposal Stage Ready: ${proposal.title || proposal.name}`,
                                                                                                            `Stage "${nextStage.name}" is now ready for your review.`,
                                                                                                            `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                                                    `#/clients?lead=${lead.id}&tab=proposals`
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
                                                                                                `#/clients?lead=${lead.id}&tab=proposals`
                                                                                            );
                                                                                            
                                                                                            // Notify assigned users of next stage
                                                                                            if (stageIndex + 1 < proposal.stages.length) {
                                                                                                const nextStage = updatedStages[stageIndex + 1];
                                                                                                if (nextStage.assigneeId) {
                                                                                                    await sendNotification(
                                                                                                        nextStage.assigneeId,
                                                                                                        `Proposal Stage Ready: ${proposal.title || proposal.name}`,
                                                                                                        `Stage "${nextStage.name}" is now ready for your review.`,
                                                                                                        `#/clients?lead=${lead.id}&tab=proposals`
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

                                <div ref={commentsContainerRef} className="space-y-2">
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
            <ThumbnailPreviewModal />
            </>
        );
    }

    // Modal view - with modal wrapper  
    return React.createElement(React.Fragment, null,
        React.createElement('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4', onClick: onClose },
            React.createElement('div', { className: 'bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col', onClick: (e) => e.stopPropagation() },
                React.createElement('div', { className: 'flex justify-between items-center px-6 py-4 border-b border-gray-200' },
                    React.createElement('div', null,
                        React.createElement('h2', { className: 'text-xl font-semibold text-gray-900' },
                            lead ? formData.name : 'Add New Lead'
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
                                ['overview', 'contacts', 'calendar', 'projects', 'proposals', 'activity', 'notes'].map(tab =>
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
                                React.createElement('div', { className: 'border border-gray-200 rounded-lg p-4 bg-gray-50' },
                                    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Thumbnail Image'),
                                    React.createElement('div', { className: 'flex items-center gap-4' },
                                        (thumbnailPreview || formData.thumbnail) ? (
                                            React.createElement('div', { className: 'relative' },
                                                React.createElement('img', {
                                                    src: thumbnailPreview || formData.thumbnail,
                                                    alt: 'Thumbnail preview',
                                                    className: 'w-24 h-24 object-cover rounded-lg border border-gray-300 cursor-pointer hover:opacity-80 transition',
                                                    onClick: () => setShowThumbnailPreview(true)
                                                }),
                                                React.createElement('button', {
                                                    type: 'button',
                                                    onClick: handleRemoveThumbnail,
                                                    className: 'absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600',
                                                    title: 'Remove thumbnail'
                                                }, React.createElement('i', { className: 'fas fa-times' }))
                                            )
                                        ) : (
                                            React.createElement('div', { className: 'w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white' },
                                                React.createElement('i', { className: 'fas fa-image text-gray-400 text-2xl' })
                                            )
                                        ),
                                        React.createElement('div', { className: 'flex-1' },
                                            React.createElement('input', {
                                                type: 'file',
                                                accept: 'image/*',
                                                onChange: handleThumbnailUpload,
                                                className: 'hidden',
                                                id: 'thumbnail-upload-modal',
                                                disabled: uploadingThumbnail
                                            }),
                                            React.createElement('label', {
                                                htmlFor: 'thumbnail-upload-modal',
                                                className: `inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 cursor-pointer transition ${
                                                    uploadingThumbnail ? 'bg-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50'
                                                }`
                                            },
                                                uploadingThumbnail ? (
                                                    React.createElement(React.Fragment, null,
                                                        React.createElement('i', { className: 'fas fa-spinner fa-spin text-gray-500' }),
                                                        React.createElement('span', { className: 'text-sm text-gray-600' }, 'Uploading...')
                                                    )
                                                ) : (
                                                    React.createElement(React.Fragment, null,
                                                        React.createElement('i', { className: 'fas fa-upload text-gray-600' }),
                                                        React.createElement('span', { className: 'text-sm text-gray-700' },
                                                            (thumbnailPreview || formData.thumbnail) ? 'Change' : 'Upload', ' Thumbnail'
                                                        )
                                                    )
                                                )
                                            ),
                                            React.createElement('p', { className: 'text-xs text-gray-500 mt-1' }, 'Click thumbnail to view full size')
                                        )
                                    )
                                ),
                                React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-6' },
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Entity Name'),
                                        React.createElement('input', {
                                            type: 'text',
                                            value: formData.name,
                                            onChange: (e) => setFormData({...formData, name: e.target.value}),
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500',
                                            placeholder: 'Enter lead name'
                                        })
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'Industry'),
                                        React.createElement('select', {
                                            value: formData.industry,
                                            onChange: (e) => setFormData({...formData, industry: e.target.value}),
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
                                            onChange: (e) => setFormData({...formData, firstContactDate: e.target.value}),
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
                                            onChange: (e) => setFormData({...formData, source: e.target.value}),
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500',
                                            placeholder: 'e.g., Website, Referral, Cold Call'
                                        })
                                    ),
                                    React.createElement('div', null,
                                        React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-2' }, 'AIDIA Stage'),
                                        React.createElement('select', {
                                            value: formData.stage,
                                            onChange: async (e) => {
                                                const newStage = e.target.value;
                                                
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
                                                                isAutoSavingRef.current = true;
                                                                
                                                                // Save to API - ensure it's awaited
                                                                await onSave(latest, true);
                                                                
                                                                console.log('✅ Stage saved successfully:', newStage);
                                                                
                                                                // Clear the flag after a longer delay to allow API response to propagate
                                                                setTimeout(() => {
                                                                    isAutoSavingRef.current = false;
                                                                }, 3000);
                                                            } catch (error) {
                                                                console.error('❌ Error saving stage:', error);
                                                                isAutoSavingRef.current = false;
                                                                alert('Failed to save stage change. Please try again.');
                                                            }
                                                        }, 100); // Small delay to ensure state update is processed
                                                    }
                                                    
                                                    return updated;
                                                });
                                            },
                                            className: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500'
                                        },
                                            React.createElement('option', { value: 'Awareness' }, 'Awareness - Lead knows about us'),
                                            React.createElement('option', { value: 'Interest' }, 'Interest - Lead is interested'),
                                            React.createElement('option', { value: 'Desire' }, 'Desire - Lead wants our solution'),
                                            React.createElement('option', { value: 'Action' }, 'Action - Lead is ready to buy')
                                        )
                                    ),
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
                                    className: 'bg-primary-600 text-white px-6 py-2 rounded-md hover:bg-primary-700 transition-colors flex items-center'
                                },
                                    React.createElement('i', { className: 'fas fa-save mr-2' }),
                                    lead ? 'Update Lead' : 'Create Lead'
                                )
                            )
                        )
                    )
                )
            )
        ),
        React.createElement(ThumbnailPreviewModal)
    );
};

// Make available globally
window.LeadDetailModal = LeadDetailModal;
console.log('✅ LeadDetailModal component registered on window.LeadDetailModal');
