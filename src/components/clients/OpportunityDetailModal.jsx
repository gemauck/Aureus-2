// Get React hooks from window
const { useState, useEffect, useRef } = React;

const OpportunityDetailModal = ({ opportunityId, onClose, client, isFullPage = false }) => {
    // Get theme
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            // Only check localStorage, NOT system preference - respect user's explicit theme choice
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;
    
    // Modal owns its state - fetch data when opportunityId changes
    const [opportunity, setOpportunity] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    
    // Fetch opportunity data when opportunityId changes
    useEffect(() => {
        const fetchOpportunity = async () => {
            if (!opportunityId) {
                setOpportunity(null);
                setIsLoading(false);
                return;
            }
            
            setIsLoading(true);
            try {
                const response = await window.api.getOpportunity(opportunityId);
                const fetchedOpportunity = response?.data?.opportunity || response?.opportunity;
                if (fetchedOpportunity) {
                    console.log('✅ Opportunity fetched with proposals:', Array.isArray(fetchedOpportunity.proposals) ? fetchedOpportunity.proposals.length : 'not an array');
                    setOpportunity(fetchedOpportunity);
                }
            } catch (error) {
                console.error('Error fetching opportunity:', error);
                alert('Error loading opportunity data');
            } finally {
                setIsLoading(false);
            }
        };
        
        fetchOpportunity();
    }, [opportunityId]);
    
    const normalizeLifecycleStage = (value) => {
        switch ((value || '').toLowerCase()) {
            case 'active':
                return 'Active';
            case 'proposal':
                return 'Proposal';
            case 'disinterested':
                return 'Disinterested';
            case 'potential':
            default:
                return 'Potential';
        }
    };

    // Create default object first to ensure it's always defined
    const defaultFormData = {
        title: '',
        stage: 'Awareness',
        status: 'Potential',
        value: 0,
        proposals: [],
        id: null
    };
    
    const [formData, setFormData] = useState(() => {
        // Parse JSON strings to arrays/objects if needed
        const parsedOpportunity = opportunity ? {
            ...opportunity,
            stage: opportunity.stage || 'Awareness',
            status: normalizeLifecycleStage(opportunity.status),
            proposals: typeof opportunity.proposals === 'string' ? JSON.parse(opportunity.proposals || '[]') : (opportunity.proposals || []),
        } : defaultFormData;
        
        return parsedOpportunity;
    });
    
    // Update formData when opportunity changes
    useEffect(() => {
        if (opportunity) {
            const parsedOpportunity = {
                ...opportunity,
                stage: opportunity.stage || 'Awareness',
                status: normalizeLifecycleStage(opportunity.status),
                proposals: typeof opportunity.proposals === 'string' ? JSON.parse(opportunity.proposals || '[]') : (opportunity.proposals || []),
            };
            setFormData(parsedOpportunity);
        }
    }, [opportunity]);
    
    // Use ref to track latest formData for auto-save
    const formDataRef = useRef(null);
    const isSavingProposalsRef = useRef(false);
    const isCreatingProposalRef = useRef(false);
    const lastSavedDataRef = useRef(null);
    const lastSaveTimeoutRef = useRef(null);
    
    useEffect(() => {
        formDataRef.current = formData;
    }, [formData]);
    
    // Proposal workflow state
    const [allUsers, setAllUsers] = useState([]);
    const [editingProposalName, setEditingProposalName] = useState(null);
    const [proposalNameInput, setProposalNameInput] = useState('');
    const [editingStageAssignee, setEditingStageAssignee] = useState(null);
    const [showStageComments, setShowStageComments] = useState({});
    const [stageCommentInput, setStageCommentInput] = useState({});
    const [isCreatingProposal, setIsCreatingProposal] = useState(false);
    const [mentionState, setMentionState] = useState({});
    const mentionInputRefs = useRef({});
    
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
        
        return () => {
            if (lastSaveTimeoutRef.current) {
                clearTimeout(lastSaveTimeoutRef.current);
            }
        };
    }, []);
    
    // Helper function to save proposals with debouncing
    const saveProposals = async (updatedProposals) => {
        if (lastSaveTimeoutRef.current) {
            clearTimeout(lastSaveTimeoutRef.current);
        }
        
        let finalFormData = null;
        
        setFormData(prev => {
            const currentProposals = prev.proposals || [];
            const allProposalIds = new Set();
            const mergedProposals = [];
            
            currentProposals.forEach(p => {
                if (p.id && !allProposalIds.has(p.id)) {
                    allProposalIds.add(p.id);
                    mergedProposals.push(p);
                }
            });
            
            updatedProposals.forEach(p => {
                if (p.id) {
                    const existingIndex = mergedProposals.findIndex(mp => mp.id === p.id);
                    if (existingIndex >= 0) {
                        mergedProposals[existingIndex] = p;
                    } else {
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
                mergedCount: finalProposals.length
            });
            
            return updatedFormData;
        });
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        isSavingProposalsRef.current = true;
        if (finalFormData) {
            lastSavedDataRef.current = finalFormData;
        }
        
        lastSaveTimeoutRef.current = setTimeout(async () => {
            if (finalFormData && opportunityId) {
                try {
                    console.log('📡 Calling API to update opportunity with proposals...');
                    await window.api.updateOpportunity(opportunityId, finalFormData);
                    console.log('✅ Proposals saved successfully to API');
                    setTimeout(() => {
                        isSavingProposalsRef.current = false;
                        console.log('🔓 Save guard released');
                    }, 3000);
                } catch (error) {
                    console.error('❌ Error saving proposals:', error);
                    isSavingProposalsRef.current = false;
                }
            } else {
                console.warn('⚠️ Opportunity ID missing or finalFormData missing');
                isSavingProposalsRef.current = false;
            }
        }, 500);
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
                    title,
                    message,
                    link,
                    type: 'proposal'
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
    
    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg p-8`}>
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
                    <p className={`mt-4 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading opportunity...</p>
                </div>
            </div>
        );
    }
    
    if (!opportunity) {
        return null;
    }
    
    const clientName = client?.name || opportunity.client?.name || 'Unknown Client';

    const releaseProposalCreationGuard = (delay = 0) => {
        const release = () => {
            isCreatingProposalRef.current = false;
            setIsCreatingProposal(false);
            console.log('🔓 Proposal creation guard released');
        };

        if (delay > 0) {
            setTimeout(release, delay);
        } else {
            release();
        }
    };

    const handleCreateProposal = async () => {
        if (isCreatingProposalRef.current || isCreatingProposal) {
            console.warn('⚠️ Proposal creation already in progress, ignoring click');
            return;
        }

        isCreatingProposalRef.current = true;
        setIsCreatingProposal(true);

        try {
            console.log('🆕 Creating new proposal...');

            const currentFormData = formDataRef.current || formData || {};
            const baseTitle = currentFormData.title || formData.title || clientName || 'this opportunity';
            const contextTitle = (baseTitle || '').trim() || 'this opportunity';
            const proposalTitle = `Proposal for ${contextTitle}`;
            const proposalId = `proposal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            const newProposal = {
                id: proposalId,
                title: proposalTitle,
                name: proposalTitle,
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

            const gatherExistingProposals = () => {
                const refData = formDataRef.current;
                const stateData = formData;
                const lastSavedData = lastSavedDataRef.current;

                const refProposals = refData?.proposals || [];
                const stateProposals = stateData?.proposals || [];
                const lastSavedProposals = lastSavedData?.proposals || [];

                const allProposalsMap = new Map();

                stateProposals.forEach(p => {
                    if (p?.id) allProposalsMap.set(p.id, p);
                });

                lastSavedProposals.forEach(p => {
                    if (p?.id) allProposalsMap.set(p.id, p);
                });

                refProposals.forEach(p => {
                    if (p?.id) allProposalsMap.set(p.id, p);
                });

                return Array.from(allProposalsMap.values());
            };

            const existingProposals = gatherExistingProposals();

            console.log('🔍 Checking for duplicates:', {
                proposalId,
                existingCount: existingProposals.length,
                existingIds: existingProposals.map(p => p.id),
                formDataProposalsCount: formData.proposals?.length || 0,
                formDataRefProposalsCount: formDataRef.current?.proposals?.length || 0
            });

            const proposalExistsById = existingProposals.some(p => p.id === proposalId);
            const now = Date.now();
            const recentProposals = existingProposals.filter(p => {
                if (!p?.id) return false;
                const parts = p.id.split('-');
                if (parts.length < 3) return false;
                const timestamp = parseInt(parts[1], 10);
                if (Number.isNaN(timestamp)) return false;
                return Math.abs(now - timestamp) < 2000;
            });

            const proposalExistsByTitle = recentProposals.some(p => (p.title || p.name) === (newProposal.title || newProposal.name));

            if (proposalExistsById) {
                console.warn('⚠️ Proposal with same ID already exists, skipping creation', {
                    proposalId,
                    existingProposal: existingProposals.find(p => p.id === proposalId)
                });
                releaseProposalCreationGuard();
                return;
            }

            if (proposalExistsByTitle && recentProposals.length > 0) {
                console.warn('⚠️ Very recent proposal with same title exists, skipping creation', {
                    recentProposals: recentProposals.map(p => ({ id: p.id, title: p.title }))
                });
                releaseProposalCreationGuard();
                return;
            }

            console.log('✅ No duplicate found, proceeding with creation');
            console.log('✅ Adding proposal to state:', proposalId);

            const updatedProposals = [...existingProposals, newProposal];
            console.log('📝 Updated proposals count:', updatedProposals.length, 'IDs:', updatedProposals.map(p => p.id));
            await saveProposals(updatedProposals);

            await notifyAllAssignedParties(
                newProposal,
                `New Proposal Created: ${newProposal.title || newProposal.name}`,
                `A new proposal "${newProposal.title || newProposal.name}" has been created for ${contextTitle}.`,
                opportunityId ? `#/clients?opportunity=${opportunityId}&tab=proposals` : ''
            );

            releaseProposalCreationGuard(2000);
        } catch (error) {
            console.error('❌ Error creating opportunity proposal:', error);
            releaseProposalCreationGuard();
        }
    };
    
    // Full-page mode: render without modal overlay
    if (isFullPage) {
        return (
            <div className={`${isDark ? 'bg-gray-900' : 'bg-gray-50'} min-h-full`}>
                <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-lg w-full`}>
                    {/* Header */}
                    <div className={`sticky top-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4 flex justify-between items-center z-10`}>
                        <div>
                            <h2 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{formData.title || 'Untitled Opportunity'}</h2>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>Client: {clientName}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'} text-2xl`}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                    
                    {/* Tabs */}
                    <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-6`}>
                        <div className="flex space-x-4">
                            <button
                                onClick={() => setActiveTab('overview')}
                                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                                    activeTab === 'overview'
                                        ? 'border-primary-600 text-primary-600'
                                        : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                                }`}
                            >
                                Overview
                            </button>
                            <button
                                onClick={() => setActiveTab('proposals')}
                                className={`py-4 px-2 border-b-2 font-medium text-sm ${
                                    activeTab === 'proposals'
                                        ? 'border-primary-600 text-primary-600'
                                        : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                                }`}
                            >
                                Proposals
                                {formData.proposals?.length > 0 && (
                                    <span className={`ml-2 px-2 py-0.5 ${isDark ? 'bg-primary-900 text-primary-300' : 'bg-primary-100 text-primary-700'} rounded-full text-xs`}>
                                        {formData.proposals.length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="p-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Title</label>
                                        <input
                                            type="text"
                                            value={formData.title || ''}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            onBlur={async () => {
                                                if (opportunityId) {
                                                    await window.api.updateOpportunity(opportunityId, formData);
                                                }
                                            }}
                                            className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Stage</label>
                                        <select
                                            value={formData.status || 'Potential'}
                                            onChange={async (e) => {
                                                const newStatus = e.target.value;
                                                setFormData({ ...formData, status: newStatus });
                                                if (opportunityId) {
                                                    await window.api.updateOpportunity(opportunityId, { ...formData, status: newStatus });
                                                }
                                            }}
                                            className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                        >
                                            <option value="Active">Active</option>
                                            <option value="Potential">Potential</option>
                                            <option value="Proposal">Proposal</option>
                                            <option value="Disinterested">Disinterested</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>AIDA STAGE</label>
                                        <select
                                            value={formData.stage || 'Awareness'}
                                            onChange={async (e) => {
                                                const newStage = e.target.value;
                                                setFormData({ ...formData, stage: newStage });
                                                if (opportunityId) {
                                                    await window.api.updateOpportunity(opportunityId, { ...formData, stage: newStage });
                                                }
                                            }}
                                            className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                        >
                                            <option value="Awareness">Awareness</option>
                                            <option value="Interest">Interest</option>
                                            <option value="Desire">Desire</option>
                                            <option value="Action">Action</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Value (R)</label>
                                        <input
                                            type="number"
                                            value={formData.value || 0}
                                            onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                                            onBlur={async () => {
                                                if (opportunityId) {
                                                    await window.api.updateOpportunity(opportunityId, formData);
                                                }
                                            }}
                                            className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                        />
                                    </div>
                                    
                                    <div>
                                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Client</label>
                                        <input
                                            type="text"
                                            value={clientName}
                                            disabled
                                            className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-600'} rounded-md`}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Proposals Tab - Reuse the same code from modal mode */}
                        {activeTab === 'proposals' && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Proposals</h3>
                                    <button
                                        type="button"
                                        disabled={isCreatingProposal || isCreatingProposalRef.current}
                                        onClick={handleCreateProposal}
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
                                    <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <i className={`fas fa-file-contract text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                        <p className="text-sm">No proposals created yet</p>
                                        <p className="text-xs mt-1">Click "Create New Proposal" to start the approval workflow</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        {formData.proposals.map((proposal, proposalIndex) => {
                                            const currentUser = window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {};
                                            const currentUserId = currentUser.id || currentUser.sub;
                                            
                                            return (
                                                <div key={proposal.id} className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg p-5`}>
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
                                                                                await saveProposals(updatedProposals);
                                                                            }
                                                                            setEditingProposalName(null);
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') e.target.blur();
                                                                            if (e.key === 'Escape') {
                                                                                setEditingProposalName(null);
                                                                                setProposalNameInput(proposal.title || proposal.name || '');
                                                                            }
                                                                        }}
                                                                        autoFocus
                                                                        className={`text-lg font-semibold ${isDark ? 'text-gray-100 bg-gray-600' : 'text-gray-900 bg-white'} border-b-2 border-primary-500 px-2 py-1`}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div>
                                                                    <h4 
                                                                        className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} cursor-pointer hover:text-primary-600`}
                                                                        onClick={() => {
                                                                            setEditingProposalName(proposal.id);
                                                                            setProposalNameInput(proposal.title || proposal.name || '');
                                                                        }}
                                                                        title="Click to edit name"
                                                                    >
                                                                        {proposal.title || proposal.name || 'Untitled Proposal'}
                                                                        <i className={`fas fa-edit ml-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                                                                    </h4>
                                                                    <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                                                                        <i className="fas fa-calendar mr-1"></i>
                                                                        Created: {new Date(proposal.createdDate).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            
                                                            {/* Working Document Link */}
                                                            <div className="mt-3">
                                                                <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Working Document Link</label>
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
                                                                        className={`flex-1 px-3 py-1.5 text-sm border ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300'} rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
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
                                                                                
                                                                                console.log('💾 Saving working document link:', { oldLink, newLink, proposalId: updatedProposals[proposalIndex].id });
                                                                                await saveProposals(updatedProposals);
                                                                            }
                                                                        }}
                                                                        className={`px-3 py-1.5 text-xs ${isDark ? 'bg-primary-600 hover:bg-primary-700' : 'bg-primary-600 hover:bg-primary-700'} text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1`}
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
                                                                            className={`px-3 py-1.5 text-sm ${isDark ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} rounded-lg`}
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
                                                                    const updatedProposals = (formData.proposals || []).filter(p => p.id !== proposal.id);
                                                                    await saveProposals(updatedProposals);
                                                                }
                                                            }}
                                                            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Delete Proposal"
                                                        >
                                                            <i className="fas fa-trash mr-1"></i>Delete
                                                        </button>
                                                    </div>

                                                    {/* Workflow Stages - Reuse from modal mode */}
                                                    <div className="space-y-3">
                                                        <h5 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>Approval Workflow</h5>
                                                        {proposal.stages.map((stage, stageIndex) => {
                                                            const canApprove = true;
                                                            const canComment = true;
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
                                                                                        }}
                                                                                        onBlur={() => setEditingStageAssignee(null)}
                                                                                        className={`text-xs px-2 py-1 border ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300'} rounded`}
                                                                                        autoFocus
                                                                                    >
                                                                                        <option value="">Assign to...</option>
                                                                                        {allUsers.filter(u => u.status === 'active').map(user => (
                                                                                            <option key={user.id} value={user.id}>{user.name || user.email}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                ) : (
                                                                                    <div className="text-xs">
                                                                                        <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Assigned to: </span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setEditingStageAssignee(stageKey)}
                                                                                            className="text-primary-600 hover:text-primary-700 font-medium"
                                                                                        >
                                                                                            {stage.assignee || <span className={isDark ? 'text-gray-500' : 'text-gray-400'} style={{ fontStyle: 'italic' }}>Unassigned</span>}
                                                                                            <i className="fas fa-edit ml-1 text-xs"></i>
                                                                                        </button>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            
                                                                            {/* Comments Section */}
                                                                            {(showComments || canComment) && (
                                                                                <div className={`mt-2 p-2 ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'} rounded border`}>
                                                                                    <div className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} mb-2`}>Comments:</div>
                                                                                    <div className="space-y-2 mb-2 max-h-32 overflow-y-auto">
                                                                                        {Array.isArray(stage.comments) && stage.comments.length > 0 ? (
                                                                                            stage.comments.map((comment, commentIdx) => (
                                                                                                <div key={commentIdx} className={`text-xs ${isDark ? 'text-gray-300 bg-gray-500' : 'text-gray-600 bg-gray-50'} p-2 rounded`}>
                                                                                                    <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-700'}`}>{comment.author || 'Unknown'}</div>
                                                                                                    <div className="mt-1">{comment.text}</div>
                                                                                                    <div className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-400'} mt-1`}>
                                                                                                        {new Date(comment.timestamp).toLocaleString()}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ))
                                                                                        ) : (
                                                                                            <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} italic`}>No comments yet</div>
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
                                                                                                
                                                                                                if (lastAtIndex !== -1) {
                                                                                                    const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
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
                                                                                                setTimeout(() => {
                                                                                                    setMentionState(prev => ({
                                                                                                        ...prev,
                                                                                                        [stageKey]: { show: false, query: '', position: 0 }
                                                                                                    }));
                                                                                                }, 200);
                                                                                            }}
                                                                                            placeholder="Add a comment... (use @ to mention users)"
                                                                                            className={`w-full px-2 py-1 text-xs border ${isDark ? 'bg-gray-500 border-gray-400 text-gray-100' : 'bg-white border-gray-300'} rounded mb-1`}
                                                                                            rows="2"
                                                                                        />
                                                                                        {/* @mention dropdown - same as modal mode */}
                                                                                        {mentionState[stageKey]?.show && (
                                                                                            <div className={`absolute z-50 mt-1 w-48 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'} border rounded-lg shadow-lg max-h-40 overflow-y-auto`}>
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
                                                                                                            setTimeout(() => {
                                                                                                                const textarea = mentionInputRefs.current[stageKey];
                                                                                                                if (textarea) {
                                                                                                                    textarea.focus();
                                                                                                                    const newPos = textBefore.length + mentionText.length + 1;
                                                                                                                    textarea.setSelectionRange(newPos, newPos);
                                                                                                                }
                                                                                                            }, 0);
                                                                                                        }}
                                                                                                        className={`w-full text-left px-3 py-2 text-xs ${isDark ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-100 text-gray-900'} flex items-center gap-2`}
                                                                                                    >
                                                                                                        <i className={`fas fa-user ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
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
                                                                                                    <div className={`px-3 py-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>No users found</div>
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
                                                                                <div className={`mt-2 text-[11px] ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                                                    <i className="fas fa-user-check mr-1"></i>Approved by {stage.approvedBy} on {new Date(stage.approvedAt).toLocaleDateString()}
                                                                                </div>
                                                                            )}
                                                                            {stage.rejectedBy && (
                                                                                <div className="mt-2 text-[11px] text-red-600">
                                                                                    <i className="fas fa-times-circle mr-1"></i>Rejected by {stage.rejectedBy} on {new Date(stage.rejectedAt).toLocaleDateString()}
                                                                                    {stage.rejectedReason && (
                                                                                        <div className={`mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Reason: {stage.rejectedReason}</div>
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
                                                                                            const approver = currentUser.name || currentUser.email || 'Unknown';
                                                                                            const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                idx === stageIndex ? { 
                                                                                                    ...s, 
                                                                                                    status: 'approved',
                                                                                                    approvedBy: approver,
                                                                                                    approvedAt: new Date().toISOString()
                                                                                                } : s
                                                                                            );
                                                                                            const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                            );
                                                                                            await saveProposals(updatedProposals);
                                                                                        }}
                                                                                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                                                    >
                                                                                        <i className="fas fa-check mr-1"></i>Approve
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={async () => {
                                                                                            const reason = prompt('Please provide a reason for rejection:');
                                                                                            if (reason !== null) {
                                                                                                const rejector = currentUser.name || currentUser.email || 'Unknown';
                                                                                                const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                    idx === stageIndex ? { 
                                                                                                        ...s, 
                                                                                                        status: 'rejected',
                                                                                                        rejectedBy: rejector,
                                                                                                        rejectedAt: new Date().toISOString(),
                                                                                                        rejectedReason: reason
                                                                                                    } : s
                                                                                                );
                                                                                                const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                    idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                                );
                                                                                                await saveProposals(updatedProposals);
                                                                                            }
                                                                                        }}
                                                                                        className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                                                    >
                                                                                        <i className="fas fa-times mr-1"></i>Reject
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                            {!canApprove && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setShowStageComments({
                                                                                        ...showStageComments,
                                                                                        [stageKey]: !showComments
                                                                                    })}
                                                                                    className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                                                                                >
                                                                                    <i className="fas fa-comment mr-1"></i>{showComments ? 'Hide' : 'Show'} Comments
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
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
                    </div>
                </div>
            </div>
        );
    }
    
    // Modal mode: render with overlay
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8`}>
                {/* Header */}
                <div className={`sticky top-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4 flex justify-between items-center z-10`}>
                    <div>
                        <h2 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{formData.title || 'Untitled Opportunity'}</h2>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>Client: {clientName}</p>
        </div>
                    <button
                        onClick={onClose}
                        className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'} text-2xl`}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                
                {/* Tabs */}
                <div className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-6`}>
                    <div className="flex space-x-4">
                        <button
                            onClick={() => setActiveTab('overview')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm ${
                                activeTab === 'overview'
                                    ? 'border-primary-600 text-primary-600'
                                    : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                            }`}
                        >
                            Overview
                        </button>
                        <button
                            onClick={() => setActiveTab('proposals')}
                            className={`py-4 px-2 border-b-2 font-medium text-sm ${
                                activeTab === 'proposals'
                                    ? 'border-primary-600 text-primary-600'
                                    : `border-transparent ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`
                            }`}
                        >
                            Proposals
                            {formData.proposals?.length > 0 && (
                                <span className={`ml-2 px-2 py-0.5 ${isDark ? 'bg-primary-900 text-primary-300' : 'bg-primary-100 text-primary-700'} rounded-full text-xs`}>
                                    {formData.proposals.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
                
                {/* Content */}
                <div className="p-6">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Title</label>
                                    <input
                                        type="text"
                                        value={formData.title || ''}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        onBlur={async () => {
                                            if (opportunityId) {
                                                await window.api.updateOpportunity(opportunityId, formData);
                                            }
                                        }}
                                        className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                    />
                                </div>
                                
                                <div>
                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Stage</label>
                                    <select
                                        value={formData.status || 'Potential'}
                                        onChange={async (e) => {
                                            const newStatus = e.target.value;
                                            setFormData({ ...formData, status: newStatus });
                                            if (opportunityId) {
                                                await window.api.updateOpportunity(opportunityId, { ...formData, status: newStatus });
                                            }
                                        }}
                                        className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Potential">Potential</option>
                                        <option value="Proposal">Proposal</option>
                                        <option value="Disinterested">Disinterested</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>AIDA STAGE</label>
                                    <select
                                        value={formData.stage || 'Awareness'}
                                        onChange={async (e) => {
                                            const newStage = e.target.value;
                                            setFormData({ ...formData, stage: newStage });
                                            if (opportunityId) {
                                                await window.api.updateOpportunity(opportunityId, { ...formData, stage: newStage });
                                            }
                                        }}
                                        className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                    >
                                        <option value="Awareness">Awareness</option>
                                        <option value="Interest">Interest</option>
                                        <option value="Desire">Desire</option>
                                        <option value="Action">Action</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Value (R)</label>
                                    <input
                                        type="number"
                                        value={formData.value || 0}
                                        onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                                        onBlur={async () => {
                                            if (opportunityId) {
                                                await window.api.updateOpportunity(opportunityId, formData);
                                            }
                                        }}
                                        className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'} rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500`}
                                    />
                                </div>
                                
                                <div>
                                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Client</label>
                                    <input
                                        type="text"
                                        value={clientName}
                                        disabled
                                        className={`w-full px-3 py-2 border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-600'} rounded-md`}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {/* Proposals Tab - Same as LeadDetailModal */}
                    {activeTab === 'proposals' && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Proposals</h3>
                                <button
                                    type="button"
                                    disabled={isCreatingProposal || isCreatingProposalRef.current}
                                    onClick={handleCreateProposal}
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
                                <div className={`text-center py-12 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    <i className={`fas fa-file-contract text-4xl mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}></i>
                                    <p className="text-sm">No proposals created yet</p>
                                    <p className="text-xs mt-1">Click "Create New Proposal" to start the approval workflow</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {formData.proposals.map((proposal, proposalIndex) => {
                                        const currentUser = window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {};
                                        const currentUserId = currentUser.id || currentUser.sub;
                                        
                                        return (
                                            <div key={proposal.id} className={`${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-200'} border rounded-lg p-5`}>
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
                                                                            await saveProposals(updatedProposals);
                                                                        }
                                                                        setEditingProposalName(null);
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') e.target.blur();
                                                                        if (e.key === 'Escape') {
                                                                            setEditingProposalName(null);
                                                                            setProposalNameInput(proposal.title || proposal.name || '');
                                                                        }
                                                                    }}
                                                                    autoFocus
                                                                    className={`text-lg font-semibold ${isDark ? 'text-gray-100 bg-gray-600' : 'text-gray-900 bg-white'} border-b-2 border-primary-500 px-2 py-1`}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <h4 
                                                                    className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} cursor-pointer hover:text-primary-600`}
                                                                    onClick={() => {
                                                                        setEditingProposalName(proposal.id);
                                                                        setProposalNameInput(proposal.title || proposal.name || '');
                                                                    }}
                                                                    title="Click to edit name"
                                                                >
                                                                    {proposal.title || proposal.name || 'Untitled Proposal'}
                                                                    <i className={`fas fa-edit ml-2 text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                                                                </h4>
                                                                <div className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                                                                    <i className="fas fa-calendar mr-1"></i>
                                                                    Created: {new Date(proposal.createdDate).toLocaleDateString()}
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {/* Working Document Link */}
                                                        <div className="mt-3">
                                                            <label className={`block text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>Working Document Link</label>
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
                                                                    className={`flex-1 px-3 py-1.5 text-sm border ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300'} rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
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
                                                                            
                                                                            console.log('💾 Saving working document link:', { oldLink, newLink, proposalId: updatedProposals[proposalIndex].id });
                                                                            await saveProposals(updatedProposals);
                                                                        }
                                                                    }}
                                                                    className={`px-3 py-1.5 text-xs ${isDark ? 'bg-primary-600 hover:bg-primary-700' : 'bg-primary-600 hover:bg-primary-700'} text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1`}
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
                                                                        className={`px-3 py-1.5 text-sm ${isDark ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} rounded-lg`}
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
                                                                const updatedProposals = (formData.proposals || []).filter(p => p.id !== proposal.id);
                                                                await saveProposals(updatedProposals);
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
                                                    <h5 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>Approval Workflow</h5>
                                                    {proposal.stages.map((stage, stageIndex) => {
                                                        const canApprove = true;
                                                        const canComment = true;
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
                                                                                    }}
                                                                                    onBlur={() => setEditingStageAssignee(null)}
                                                                                    className={`text-xs px-2 py-1 border ${isDark ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300'} rounded`}
                                                                                    autoFocus
                                                                                >
                                                                                    <option value="">Assign to...</option>
                                                                                    {allUsers.filter(u => u.status === 'active').map(user => (
                                                                                        <option key={user.id} value={user.id}>{user.name || user.email}</option>
                                                                                    ))}
                                                                                </select>
                                                                            ) : (
                                                                                <div className="text-xs">
                                                                                    <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Assigned to: </span>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingStageAssignee(stageKey)}
                                                                                        className="text-primary-600 hover:text-primary-700 font-medium"
                                                                                    >
                                                                                        {stage.assignee || <span className={isDark ? 'text-gray-500' : 'text-gray-400'} style={{ fontStyle: 'italic' }}>Unassigned</span>}
                                                                                        <i className="fas fa-edit ml-1 text-xs"></i>
                                                                                    </button>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        
                                                                        {/* Comments Section */}
                                                                        {(showComments || canComment) && (
                                                                            <div className={`mt-2 p-2 ${isDark ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-200'} rounded border`}>
                                                                                <div className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'} mb-2`}>Comments:</div>
                                                                                <div className="space-y-2 mb-2 max-h-32 overflow-y-auto">
                                                                                    {Array.isArray(stage.comments) && stage.comments.length > 0 ? (
                                                                                        stage.comments.map((comment, commentIdx) => (
                                                                                            <div key={commentIdx} className={`text-xs ${isDark ? 'text-gray-300 bg-gray-500' : 'text-gray-600 bg-gray-50'} p-2 rounded`}>
                                                                                                <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-700'}`}>{comment.author || 'Unknown'}</div>
                                                                                                <div className="mt-1">{comment.text}</div>
                                                                                                <div className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-400'} mt-1`}>
                                                                                                    {new Date(comment.timestamp).toLocaleString()}
                                                                                                </div>
                                                                                            </div>
                                                                                        ))
                                                                                    ) : (
                                                                                        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'} italic`}>No comments yet</div>
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
                                                                                            
                                                                                            if (lastAtIndex !== -1) {
                                                                                                const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
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
                                                                                            setTimeout(() => {
                                                                                                setMentionState(prev => ({
                                                                                                    ...prev,
                                                                                                    [stageKey]: { show: false, query: '', position: 0 }
                                                                                                }));
                                                                                            }, 200);
                                                                                        }}
                                                                                        placeholder="Add a comment... (use @ to mention users)"
                                                                                        className={`w-full px-2 py-1 text-xs border ${isDark ? 'bg-gray-500 border-gray-400 text-gray-100' : 'bg-white border-gray-300'} rounded mb-1`}
                                                                                        rows="2"
                                                                                    />
                                                                                    {/* @mention dropdown */}
                                                                                    {mentionState[stageKey]?.show && (
                                                                                        <div className={`absolute z-50 mt-1 w-48 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'} border rounded-lg shadow-lg max-h-40 overflow-y-auto`}>
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
                                                                                                        setTimeout(() => {
                                                                                                            const textarea = mentionInputRefs.current[stageKey];
                                                                                                            if (textarea) {
                                                                                                                textarea.focus();
                                                                                                                const newPos = textBefore.length + mentionText.length + 1;
                                                                                                                textarea.setSelectionRange(newPos, newPos);
                                                                                                            }
                                                                                                        }, 0);
                                                                                                    }}
                                                                                                    className={`w-full text-left px-3 py-2 text-xs ${isDark ? 'hover:bg-gray-600 text-gray-200' : 'hover:bg-gray-100 text-gray-900'} flex items-center gap-2`}
                                                                                                >
                                                                                                    <i className={`fas fa-user ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
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
                                                                                                <div className={`px-3 py-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>No users found</div>
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
                                                                            <div className={`mt-2 text-[11px] ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                                                                <i className="fas fa-user-check mr-1"></i>Approved by {stage.approvedBy} on {new Date(stage.approvedAt).toLocaleDateString()}
                                                                            </div>
                                                                        )}
                                                                        {stage.rejectedBy && (
                                                                            <div className="mt-2 text-[11px] text-red-600">
                                                                                <i className="fas fa-times-circle mr-1"></i>Rejected by {stage.rejectedBy} on {new Date(stage.rejectedAt).toLocaleDateString()}
                                                                                {stage.rejectedReason && (
                                                                                    <div className={`mt-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Reason: {stage.rejectedReason}</div>
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
                                                                                        const approver = currentUser.name || currentUser.email || 'Unknown';
                                                                                        const updatedStages = proposal.stages.map((s, idx) => 
                                                                                            idx === stageIndex ? { 
                                                                                                ...s, 
                                                                                                status: 'approved',
                                                                                                approvedBy: approver,
                                                                                                approvedAt: new Date().toISOString()
                                                                                            } : s
                                                                                        );
                                                                                        const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                            idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                        );
                                                                                        await saveProposals(updatedProposals);
                                                                                    }}
                                                                                    className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                                                                >
                                                                                    <i className="fas fa-check mr-1"></i>Approve
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={async () => {
                                                                                        const reason = prompt('Please provide a reason for rejection:');
                                                                                        if (reason !== null) {
                                                                                            const rejector = currentUser.name || currentUser.email || 'Unknown';
                                                                                            const updatedStages = proposal.stages.map((s, idx) => 
                                                                                                idx === stageIndex ? { 
                                                                                                    ...s, 
                                                                                                    status: 'rejected',
                                                                                                    rejectedBy: rejector,
                                                                                                    rejectedAt: new Date().toISOString(),
                                                                                                    rejectedReason: reason
                                                                                                } : s
                                                                                            );
                                                                                            const updatedProposals = formData.proposals.map((p, idx) => 
                                                                                                idx === proposalIndex ? { ...p, stages: updatedStages } : p
                                                                                            );
                                                                                            await saveProposals(updatedProposals);
                                                                                        }
                                                                                    }}
                                                                                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                                                                >
                                                                                    <i className="fas fa-times mr-1"></i>Reject
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                        {!canApprove && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setShowStageComments({
                                                                                    ...showStageComments,
                                                                                    [stageKey]: !showComments
                                                                                })}
                                                                                className="px-3 py-1.5 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                                                                            >
                                                                                <i className="fas fa-comment mr-1"></i>{showComments ? 'Hide' : 'Show'} Comments
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
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
                </div>
            </div>
        </div>
    );
};

window.OpportunityDetailModal = OpportunityDetailModal;

