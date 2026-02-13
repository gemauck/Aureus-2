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
    
    // Check if current user is admin
    const user = window.storage?.getUser?.() || {};
    const isAdmin = user?.role?.toLowerCase() === 'admin';
    
    // Modal owns its state - fetch data when opportunityId changes
    const [opportunity, setOpportunity] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(() => {
        // If user tries to access proposals tab but is not admin, default to overview
        return 'overview';
    });
    
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
                    await window.api.updateOpportunity(opportunityId, finalFormData);
                    setTimeout(() => {
                        isSavingProposalsRef.current = false;
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


            const updatedProposals = [...existingProposals, newProposal];
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
                </div>
            </div>
        </div>
    );
};

window.OpportunityDetailModal = OpportunityDetailModal;

