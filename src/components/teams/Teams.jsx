// Get dependencies from window
const { useState, useEffect, useMemo, useCallback } = React;
const storage = window.storage;
const DocumentModal = window.DocumentModal;
const WorkflowModal = window.WorkflowModal;
const ChecklistModal = window.ChecklistModal;
const NoticeModal = window.NoticeModal;
const WorkflowExecutionModal = window.WorkflowExecutionModal;
const ManagementMeetingNotes = window.ManagementMeetingNotes;

// Team definitions - defined outside component to avoid recreation on every render
const TEAMS = [
        { 
            id: 'management', 
            name: 'Management', 
            icon: 'fa-user-tie', 
            color: 'blue',
            description: 'Executive leadership and strategic planning',
            members: 0,
            permissions: [
                'Approve capital expenditure, budgets, and strategic initiatives',
                'Assign cross-team priorities and override departmental escalations',
                'Access organization-wide executive dashboards and audit summaries'
            ]
        },
        { 
            id: 'technical', 
            name: 'Technical', 
            icon: 'fa-tools', 
            color: 'purple',
            description: 'Technical operations and system maintenance',
            members: 0,
            permissions: [
                'Deploy production releases and manage infrastructure integrations',
                'Configure APIs, webhooks, and security credentials for services',
                'View system diagnostics, error logs, and performance telemetry'
            ]
        },
        { 
            id: 'support', 
            name: 'Support', 
            icon: 'fa-headset', 
            color: 'green',
            description: 'Customer support and service delivery',
            members: 0,
            permissions: [
                'Manage customer tickets, escalations, and service level agreements',
                'Access unified communication channels and contact history',
                'Publish and update customer-facing knowledge base documentation'
            ]
        },
        { 
            id: 'data-analytics', 
            name: 'Data Analytics', 
            icon: 'fa-chart-line', 
            color: 'indigo',
            description: 'Data analysis and business intelligence',
            members: 0,
            permissions: [
                'Query governed datasets and schedule BI dashboard refreshes',
                'Export aggregated analytics for leadership and finance reviews',
                'Define metric definitions, KPIs, and reporting taxonomies'
            ]
        },
        { 
            id: 'finance', 
            name: 'Finance', 
            icon: 'fa-coins', 
            color: 'yellow',
            description: 'Financial management and accounting',
            members: 0,
            permissions: [
                'Approve invoices, purchase orders, and payment runs',
                'Access ledgers, balance sheets, and sensitive financial statements',
                'Manage payroll configurations and tax compliance filings'
            ]
        },
        { 
            id: 'business-development', 
            name: 'Business Development', 
            icon: 'fa-rocket', 
            color: 'pink',
            description: 'Growth strategies and new opportunities',
            members: 0,
            permissions: [
                'Create and negotiate partnership and channel opportunity records',
                'Access competitive intelligence and pipeline analytics',
                'Approve pricing proposals and bespoke commercial terms'
            ]
        },
        { 
            id: 'commercial', 
            name: 'Commercial', 
            icon: 'fa-handshake', 
            color: 'orange',
            description: 'Sales and commercial operations',
            members: 0,
            permissions: [
                'Manage quotes, contracts, and sales order fulfilment tasks',
                'Update product catalogues, pricing tiers, and discount rules',
                'View customer credit status and contract renewal schedules'
            ]
        },
        { 
            id: 'compliance', 
            name: 'Compliance', 
            icon: 'fa-shield-alt', 
            color: 'red',
            description: 'Regulatory compliance and risk management',
            members: 0,
            permissions: [
                'Review audit trails, exception reports, and attestation evidence',
                'Manage regulatory documentation, policies, and control mappings',
                'Enforce policy acknowledgment and training completion workflows'
            ]
        }
];

const Teams = () => {
    const normalizePermissions = (permissions) => {
        if (!permissions) return [];
        if (Array.isArray(permissions)) return permissions;
        if (typeof permissions === 'string') {
            try {
                const parsed = JSON.parse(permissions);
                return Array.isArray(parsed) ? parsed : [];
            } catch (error) {
                console.warn('Teams: Failed to parse permissions string:', error);
                return [];
            }
        }
        return [];
    };

    const getCurrentUser = () => {
        try {
            if (window.storage?.getUser) {
                const user = window.storage.getUser();
                if (user && (user.id || user.email)) {
                    return {
                        ...user,
                        permissions: normalizePermissions(user.permissions)
                    };
                }
            }

            const storedUser = localStorage.getItem('abcotronics_user');
            if (storedUser && storedUser !== 'null' && storedUser !== 'undefined') {
                const parsed = JSON.parse(storedUser);
                const user = parsed.user || parsed.data?.user || parsed;
                if (user && (user.id || user.email)) {
                    return {
                        ...user,
                        permissions: normalizePermissions(user.permissions)
                    };
                }
            }

            const legacyUser = localStorage.getItem('currentUser');
            if (legacyUser && legacyUser !== 'null' && legacyUser !== 'undefined') {
                const parsed = JSON.parse(legacyUser);
                if (parsed && (parsed.id || parsed.email || parsed.username)) {
                    return {
                        id: parsed.id || parsed.email || parsed.username,
                        name: parsed.name || parsed.username || 'User',
                        email: parsed.email || parsed.username || '',
                        role: parsed.role || '',
                        permissions: normalizePermissions(parsed.permissions)
                    };
                }
            }
        } catch (error) {
            console.warn('Teams: Error retrieving current user', error);
        }

        return {
            id: 'anonymous',
            name: 'User',
            role: '',
            permissions: []
        };
    };

    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: authUser } = authHook();

    const sanitizeUser = (user) => {
        if (!user) return null;
        return {
            ...user,
            permissions: normalizePermissions(user.permissions)
        };
    };

    const [currentUser, setCurrentUser] = useState(() => sanitizeUser(authUser) || getCurrentUser());

    useEffect(() => {
        const sanitizedAuthUser = sanitizeUser(authUser);
        if (!sanitizedAuthUser) {
            return;
        }

        setCurrentUser((prevUser) => {
            if (!prevUser) {
                return sanitizedAuthUser;
            }

            const prevPermissions = (prevUser.permissions || []).slice().sort().join('|');
            const nextPermissions = (sanitizedAuthUser.permissions || []).slice().sort().join('|');

            const isSameUser =
                prevUser.id === sanitizedAuthUser.id &&
                prevUser.role === sanitizedAuthUser.role &&
                prevPermissions === nextPermissions;

            return isSameUser ? prevUser : sanitizedAuthUser;
        });
    }, [authUser]);

    const isAdminUser = useMemo(() => {
        const role = (currentUser?.role || '').toString().trim().toLowerCase();
        const adminRoles = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];
        if (adminRoles.includes(role)) {
            return true;
        }

        const permissions = normalizePermissions(currentUser?.permissions);
        const normalizedPermissions = permissions.map((perm) => (perm || '').toString().trim().toLowerCase());
        const adminPermissionKeys = ['admin', 'administrator', 'superadmin', 'super-admin', 'super_admin', 'system_admin'];

        return normalizedPermissions.some((perm) => adminPermissionKeys.includes(perm));
    }, [currentUser]);

    const isTeamAccessible = useCallback(
        (teamId) => {
            if (teamId === 'management') {
                return isAdminUser;
            }
            return true;
        },
        [isAdminUser]
    );

    // Get theme state - CRITICAL: Use React state, not document root class
    let themeResult = { isDark: false };
    try {
        if (window.useTheme && typeof window.useTheme === 'function') {
            themeResult = window.useTheme();
        }
    } catch (error) {
        // Fallback: check localStorage only
        try {
            const storedTheme = localStorage.getItem('abcotronics_theme');
            themeResult.isDark = storedTheme === 'dark';
        } catch (e) {
            themeResult.isDark = false;
        }
    }
    const isDark = themeResult?.isDark || false;
    const [activeTab, setActiveTab] = useState('overview');
    const [selectedTeam, setSelectedTeam] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isReady, setIsReady] = useState(false);
    
    // Modal states
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [showChecklistModal, setShowChecklistModal] = useState(false);
    const [showNoticeModal, setShowNoticeModal] = useState(false);
    const [showWorkflowExecutionModal, setShowWorkflowExecutionModal] = useState(false);
    const [showDocumentViewModal, setShowDocumentViewModal] = useState(false);
    
    // Data states
    const [documents, setDocuments] = useState([]);
    const [workflows, setWorkflows] = useState([]);
    const [checklists, setChecklists] = useState([]);
    const [notices, setNotices] = useState([]);
    const [workflowExecutions, setWorkflowExecutions] = useState([]);
    
    // Edit states
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingWorkflow, setEditingWorkflow] = useState(null);
    const [editingChecklist, setEditingChecklist] = useState(null);
    const [editingNotice, setEditingNotice] = useState(null);
    const [executingWorkflow, setExecutingWorkflow] = useState(null);
    const [viewingDocument, setViewingDocument] = useState(null);

    // State to track ManagementMeetingNotes availability
    const [managementMeetingNotesAvailable, setManagementMeetingNotesAvailable] = useState(false);

    // Check modal components on mount only
    useEffect(() => {
        console.log('🔍 Teams: Checking modal components...');
        console.log('  - DocumentModal:', typeof window.DocumentModal);
        console.log('  - WorkflowModal:', typeof window.WorkflowModal);
        console.log('  - ChecklistModal:', typeof window.ChecklistModal);
        console.log('  - NoticeModal:', typeof window.NoticeModal);
        console.log('  - WorkflowExecutionModal:', typeof window.WorkflowExecutionModal);
        console.log('  - ManagementMeetingNotes:', typeof window.ManagementMeetingNotes);
    }, []);

    // Wait for ManagementMeetingNotes component to load
    useEffect(() => {
        const checkForManagementMeetingNotes = () => {
            if (window.ManagementMeetingNotes) {
                console.log('✅ Teams: ManagementMeetingNotes component now available');
                setManagementMeetingNotesAvailable(true);
                return true;
            }
            return false;
        };

        // Check immediately
        if (checkForManagementMeetingNotes()) {
            return;
        }

        // Poll for the component (components load asynchronously)
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        const interval = setInterval(() => {
            attempts++;
            if (checkForManagementMeetingNotes() || attempts >= maxAttempts) {
                clearInterval(interval);
                if (attempts >= maxAttempts) {
                    console.warn('⚠️ Teams: ManagementMeetingNotes component not found after waiting');
                }
            }
        }, 100);

        return () => clearInterval(interval);
    }, []);

    // Load data from data service
    useEffect(() => {
        const loadData = async () => {
            try {
                console.log('🔄 Teams: Loading data from data service');
                
                // Safely call dataService methods with better error handling
                const getSafeData = async (method) => {
                    try {
                        if (!window.dataService || typeof window.dataService[method] !== 'function') {
                            return [];
                        }
                        const result = await window.dataService[method]();
                        return Array.isArray(result) ? result : [];
                    } catch (err) {
                        console.warn(`⚠️ Teams: Error loading ${method}:`, err);
                        return [];
                    }
                };
                
                const [savedDocuments, savedWorkflows, savedChecklists, savedNotices] = await Promise.all([
                    getSafeData('getTeamDocuments'),
                    getSafeData('getTeamWorkflows'),
                    getSafeData('getTeamChecklists'),
                    getSafeData('getTeamNotices')
                ]);
                
                // Ensure all values are arrays, even if they returned null/undefined
                const documents = Array.isArray(savedDocuments) ? savedDocuments : [];
                const workflows = Array.isArray(savedWorkflows) ? savedWorkflows : [];
                const checklists = Array.isArray(savedChecklists) ? savedChecklists : [];
                const notices = Array.isArray(savedNotices) ? savedNotices : [];
                
                // Safely parse workflow executions
                let savedExecutions = [];
                try {
                    const executionsStr = localStorage.getItem('abcotronics_workflow_executions');
                    if (executionsStr) {
                        const parsed = JSON.parse(executionsStr);
                        savedExecutions = Array.isArray(parsed) ? parsed : [];
                    }
                } catch (parseError) {
                    console.warn('⚠️ Teams: Error parsing workflow executions:', parseError);
                    savedExecutions = [];
                }

                console.log('✅ Teams: Data loaded successfully', {
                    documents: documents.length,
                    workflows: workflows.length,
                    checklists: checklists.length,
                    notices: notices.length,
                    executions: savedExecutions.length
                });

                setDocuments(documents);
                setWorkflows(workflows);
                setChecklists(checklists);
                setNotices(notices);
                setWorkflowExecutions(savedExecutions);
                
                // Delay rendering significantly to prevent renderer crash
                setTimeout(() => setIsReady(true), 500);
            } catch (error) {
                console.error('❌ Teams: Error loading data:', error);
                // Set empty arrays on error to prevent null reference errors
                setDocuments([]);
                setWorkflows([]);
                setChecklists([]);
                setNotices([]);
                setWorkflowExecutions([]);
                setIsReady(true); // Show error state
            }
        };
        
        loadData();
    }, []);

    const accessibleTeams = useMemo(() => {
        return TEAMS.filter(team => isTeamAccessible(team.id));
    }, [isTeamAccessible]);

    const accessibleDocuments = useMemo(() => {
        return isAdminUser
            ? documents
            : documents.filter((d) => (d.team || '').toString().trim().toLowerCase() !== 'management');
    }, [documents, isAdminUser]);

    const accessibleWorkflows = useMemo(() => {
        return isAdminUser
            ? workflows
            : workflows.filter((w) => (w.team || '').toString().trim().toLowerCase() !== 'management');
    }, [workflows, isAdminUser]);

    const accessibleChecklists = useMemo(() => {
        return isAdminUser
            ? checklists
            : checklists.filter((c) => (c.team || '').toString().trim().toLowerCase() !== 'management');
    }, [checklists, isAdminUser]);

    const accessibleNotices = useMemo(() => {
        return isAdminUser
            ? notices
            : notices.filter((n) => (n.team || '').toString().trim().toLowerCase() !== 'management');
    }, [notices, isAdminUser]);

    const accessibleWorkflowExecutions = useMemo(() => {
        return isAdminUser
            ? workflowExecutions
            : workflowExecutions.filter(
                  (execution) => (execution.team || '').toString().trim().toLowerCase() !== 'management'
              );
    }, [workflowExecutions, isAdminUser]);

    // Get counts for selected team - memoized per team to avoid recalculation
    const teamCountsCache = useMemo(() => {
        const cache = {};
        accessibleTeams.forEach(team => {
            cache[team.id] = {
                documents: accessibleDocuments.filter(d => d.team === team.id).length,
                workflows: accessibleWorkflows.filter(w => w.team === team.id).length,
                checklists: accessibleChecklists.filter(c => c.team === team.id).length,
                notices: accessibleNotices.filter(n => n.team === team.id).length
            };
        });
        return cache;
    }, [accessibleTeams, accessibleDocuments, accessibleWorkflows, accessibleChecklists, accessibleNotices]);

    const getTeamCounts = (teamId) => {
        return teamCountsCache[teamId] || { documents: 0, workflows: 0, checklists: 0, notices: 0 };
    };

    // Filter data by selected team - memoized to avoid recalculation
    const filteredDocuments = useMemo(() => {
        return selectedTeam 
            ? accessibleDocuments.filter(d => d.team === selectedTeam.id)
            : accessibleDocuments;
    }, [selectedTeam, accessibleDocuments]);
    
    const filteredWorkflows = useMemo(() => {
        return selectedTeam 
            ? accessibleWorkflows.filter(w => w.team === selectedTeam.id)
            : accessibleWorkflows;
    }, [selectedTeam, accessibleWorkflows]);
    
    const filteredChecklists = useMemo(() => {
        return selectedTeam 
            ? accessibleChecklists.filter(c => c.team === selectedTeam.id)
            : accessibleChecklists;
    }, [selectedTeam, accessibleChecklists]);
    
    const filteredNotices = useMemo(() => {
        return selectedTeam 
            ? accessibleNotices.filter(n => n.team === selectedTeam.id)
            : accessibleNotices;
    }, [selectedTeam, accessibleNotices]);

    // Search functionality - inline to avoid circular dependencies
    const displayDocuments = useMemo(() => {
        if (!searchTerm) return filteredDocuments;
        return filteredDocuments.filter(item => 
            ['title', 'category', 'description'].some(field => 
                item[field]?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [filteredDocuments, searchTerm]);
    
    const displayWorkflows = useMemo(() => {
        if (!searchTerm) return filteredWorkflows;
        return filteredWorkflows.filter(item => 
            ['title', 'description'].some(field => 
                item[field]?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [filteredWorkflows, searchTerm]);
    
    const displayChecklists = useMemo(() => {
        if (!searchTerm) return filteredChecklists;
        return filteredChecklists.filter(item => 
            ['title', 'description'].some(field => 
                item[field]?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [filteredChecklists, searchTerm]);
    
    const displayNotices = useMemo(() => {
        if (!searchTerm) return filteredNotices;
        return filteredNotices.filter(item => 
            ['title', 'content'].some(field => 
                item[field]?.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [filteredNotices, searchTerm]);

    // Recent activity across all teams - memoized to avoid recalculation on every render
    const recentActivity = useMemo(() => {
        return [
            ...accessibleDocuments.map(d => ({ ...d, type: 'document', icon: 'file-alt' })),
            ...accessibleWorkflows.map(w => ({ ...w, type: 'workflow', icon: 'project-diagram' })),
            ...accessibleChecklists.map(c => ({ ...c, type: 'checklist', icon: 'tasks' })),
            ...accessibleNotices.map(n => ({ ...n, type: 'notice', icon: 'bullhorn' }))
        ]
            .sort((a, b) => new Date(b.createdAt || b.updatedAt || b.date) - new Date(a.createdAt || a.updatedAt || a.date))
            .slice(0, 10);
    }, [accessibleDocuments, accessibleWorkflows, accessibleChecklists, accessibleNotices]);

    useEffect(() => {
        if (selectedTeam && !isTeamAccessible(selectedTeam.id)) {
            setSelectedTeam(null);
            setActiveTab('overview');
        }
    }, [selectedTeam, isTeamAccessible]);

    const handleSelectTeam = useCallback((team) => {
        if (!isTeamAccessible(team.id)) {
            if (typeof window.alert === 'function') {
                window.alert('Only administrators can access the Management team.');
            }
            return;
        }
        setSelectedTeam(team);
        setActiveTab('documents');
    }, [isTeamAccessible]);

    // Save handlers
    const handleSaveDocument = async (documentData) => {
        const existingIndex = documents.findIndex(d => d.id === documentData.id);
        let updatedDocuments;
        
        if (existingIndex >= 0) {
            updatedDocuments = [...documents];
            updatedDocuments[existingIndex] = documentData;
        } else {
            updatedDocuments = [...documents, documentData];
        }
        
        setDocuments(updatedDocuments);
        await window.dataService.setTeamDocuments(updatedDocuments);
        setEditingDocument(null);
    };

    const handleSaveWorkflow = async (workflowData) => {
        const existingIndex = workflows.findIndex(w => w.id === workflowData.id);
        let updatedWorkflows;
        
        if (existingIndex >= 0) {
            updatedWorkflows = [...workflows];
            updatedWorkflows[existingIndex] = workflowData;
        } else {
            updatedWorkflows = [...workflows, workflowData];
        }
        
        setWorkflows(updatedWorkflows);
        await window.dataService.setTeamWorkflows(updatedWorkflows);
        setEditingWorkflow(null);
    };

    const handleSaveChecklist = async (checklistData) => {
        const existingIndex = checklists.findIndex(c => c.id === checklistData.id);
        let updatedChecklists;
        
        if (existingIndex >= 0) {
            updatedChecklists = [...checklists];
            updatedChecklists[existingIndex] = checklistData;
        } else {
            updatedChecklists = [...checklists, checklistData];
        }
        
        setChecklists(updatedChecklists);
        await window.dataService.setTeamChecklists(updatedChecklists);
        setEditingChecklist(null);
    };

    const handleSaveNotice = async (noticeData) => {
        const existingIndex = notices.findIndex(n => n.id === noticeData.id);
        let updatedNotices;
        
        if (existingIndex >= 0) {
            updatedNotices = [...notices];
            updatedNotices[existingIndex] = noticeData;
        } else {
            updatedNotices = [...notices, noticeData];
        }
        
        setNotices(updatedNotices);
        await window.dataService.setTeamNotices(updatedNotices);
        setEditingNotice(null);
    };

    const handleWorkflowExecutionComplete = (executionData) => {
        const execution = {
            id: Date.now().toString(),
            workflowId: executingWorkflow.id,
            workflowTitle: executingWorkflow.title,
            team: executingWorkflow.team,
            ...executionData
        };
        
        const updatedExecutions = [...workflowExecutions, execution];
        setWorkflowExecutions(updatedExecutions);
        localStorage.setItem('abcotronics_workflow_executions', JSON.stringify(updatedExecutions));
    };

    // Delete handlers
    const handleDeleteDocument = async (id) => {
        if (confirm('Are you sure you want to delete this document?')) {
            const updatedDocuments = documents.filter(d => d.id !== id);
            setDocuments(updatedDocuments);
            await window.dataService.setTeamDocuments(updatedDocuments);
        }
    };

    const handleDeleteWorkflow = async (id) => {
        if (confirm('Are you sure you want to delete this workflow?')) {
            const updatedWorkflows = workflows.filter(w => w.id !== id);
            setWorkflows(updatedWorkflows);
            await window.dataService.setTeamWorkflows(updatedWorkflows);
        }
    };

    const handleDeleteChecklist = async (id) => {
        if (confirm('Are you sure you want to delete this checklist?')) {
            const updatedChecklists = checklists.filter(c => c.id !== id);
            setChecklists(updatedChecklists);
            await window.dataService.setTeamChecklists(updatedChecklists);
        }
    };

    const handleDeleteNotice = async (id) => {
        if (confirm('Are you sure you want to delete this notice?')) {
            const updatedNotices = notices.filter(n => n.id !== id);
            setNotices(updatedNotices);
            await window.dataService.setTeamNotices(updatedNotices);
        }
    };

    const handleExecuteWorkflow = (workflow) => {
        setExecutingWorkflow(workflow);
        setShowWorkflowExecutionModal(true);
    };

    const handleViewDocument = (document) => {
        setViewingDocument(document);
        setShowDocumentViewModal(true);
    };

    // Show minimal loading state to prevent renderer crash
    if (!isReady) {
        return (
            <div className="p-4">
                <div className="text-center py-12">
                    <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p className="text-sm text-gray-500">Loading Teams module...</p>
                </div>
            </div>
        );
    }
    
    // Additional safety check - if data arrays are too large, show warning
    if (documents.length > 1000 || workflows.length > 1000 || checklists.length > 1000 || notices.length > 1000) {
        return (
            <div className="p-4">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">⚠️ Too much data to display. Please contact support.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
					<h1 className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Teams & Knowledge Hub</h1>
					<p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Centralized documentation, workflows, and team collaboration</p>
                </div>
                {selectedTeam && (
                    <button
                        onClick={() => setSelectedTeam(null)}
						className={`px-3 py-1.5 text-xs rounded-lg hover:bg-gray-200 transition ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                        <i className="fas fa-arrow-left mr-1.5"></i>
                        Back to All Teams
                    </button>
                )}
            </div>

            {/* Search and Filter Bar */}
            {selectedTeam && (
				<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder="Search documents, workflows, checklists..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
								className={`w-full pl-8 pr-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-gray-400 ${isDark ? 'bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400' : 'border-gray-300'}`}
                            />
							<i className={`fas fa-search absolute left-2.5 top-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-400'}`}></i>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActiveTab('documents')}
                                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                    activeTab === 'documents'
                                        ? 'bg-primary-600 text-white'
										: isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-file-alt mr-1"></i>
                                Documents
                            </button>
                            <button
                                onClick={() => setActiveTab('workflows')}
                                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                    activeTab === 'workflows'
                                        ? 'bg-primary-600 text-white'
										: isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-project-diagram mr-1"></i>
                                Workflows
                            </button>
                            <button
                                onClick={() => setActiveTab('checklists')}
                                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                    activeTab === 'checklists'
                                        ? 'bg-primary-600 text-white'
										: isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-tasks mr-1"></i>
                                Checklists
                            </button>
                            <button
                                onClick={() => setActiveTab('notices')}
                                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                    activeTab === 'notices'
                                        ? 'bg-primary-600 text-white'
										: isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                <i className="fas fa-bullhorn mr-1"></i>
                                Notices
                            </button>
                            {selectedTeam?.id === 'management' && (
                                <button
                                    onClick={() => setActiveTab('meeting-notes')}
                                    className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                        activeTab === 'meeting-notes'
                                            ? 'bg-primary-600 text-white'
											: isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                >
                                    <i className="fas fa-clipboard-list mr-1"></i>
                                    Meeting Notes
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Overview - All Teams Grid */}
            {!selectedTeam && (
                <div className="space-y-3">
                    {/* Quick Stats */}
						<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
						<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div>
									<p className={`text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Total Documents</p>
									<p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{accessibleDocuments.length}</p>
                                </div>
								<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-900' : 'bg-blue-100'}`}>
									<i className={`fas fa-file-alt ${isDark ? 'text-blue-300' : 'text-blue-600'}`}></i>
                                </div>
                            </div>
                        </div>
						<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div>
									<p className={`text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Active Workflows</p>
									<p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{accessibleWorkflows.filter(w => w.status === 'Active').length}</p>
                                </div>
								<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-purple-900' : 'bg-purple-100'}`}>
									<i className={`fas fa-project-diagram ${isDark ? 'text-purple-300' : 'text-purple-600'}`}></i>
                                </div>
                            </div>
                        </div>
						<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div>
									<p className={`text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Checklists</p>
									<p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{accessibleChecklists.length}</p>
                                </div>
								<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-green-900' : 'bg-green-100'}`}>
									<i className={`fas fa-tasks ${isDark ? 'text-green-300' : 'text-green-600'}`}></i>
                                </div>
                            </div>
                        </div>
						<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div>
									<p className={`text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>Executions</p>
									<p className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{accessibleWorkflowExecutions.length}</p>
                                </div>
								<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-orange-900' : 'bg-orange-100'}`}>
									<i className={`fas fa-play-circle ${isDark ? 'text-orange-300' : 'text-orange-600'}`}></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Teams Grid */}
					<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
						<h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Department Teams</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {accessibleTeams.map(team => {
                                const counts = getTeamCounts(team.id);
                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => handleSelectTeam(team)}
										className={`text-left border rounded-lg p-3 hover:shadow-md hover:border-primary-300 transition group ${isDark ? 'border-slate-700' : 'border-gray-200'}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
											<div className={`w-10 h-10 bg-${team.color}-100 rounded-lg flex items-center justify-center group-hover:bg-${team.color}-200 transition ${isDark ? 'bg-slate-700 group-hover:bg-slate-600' : ''}`}>
												<i className={`fas ${team.icon} text-${team.color}-600 text-lg ${isDark ? 'text-white' : ''}`}></i>
                                            </div>
                                            <i className="fas fa-arrow-right text-gray-400 text-xs group-hover:text-primary-600 transition"></i>
                                        </div>
										<h3 className={`font-semibold text-sm mb-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{team.name}</h3>
										<p className={`text-xs mb-2 line-clamp-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{team.description}</p>
										<div className={`flex items-center gap-2 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                            <span><i className="fas fa-file-alt mr-1"></i>{counts.documents}</span>
                                            <span><i className="fas fa-project-diagram mr-1"></i>{counts.workflows}</span>
                                            <span><i className="fas fa-tasks mr-1"></i>{counts.checklists}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recent Activity */}
					<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
						<h2 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Recent Activity</h2>
                        {recentActivity.length > 0 ? (
                            <div className="space-y-2">
                                {recentActivity.map((item, idx) => {
                                    const team = TEAMS.find(t => t.id === item.team);
                                    return (
										<div key={idx} className={`flex items-center gap-3 py-2 border-b last:border-b-0 ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>
											<div className={`w-8 h-8 bg-${team?.color || 'gray'}-100 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-slate-700' : ''}`}>
												<i className={`fas fa-${item.icon} text-${team?.color || 'gray'}-600 text-xs ${isDark ? 'text-white' : ''}`}></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
												<p className={`text-xs font-medium truncate ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{item.title}</p>
												<p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                                    {team?.name} • {item.type}
                                                </p>
                                            </div>
											<span className={`text-xs whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-gray-400'}`}>
                                                {new Date(item.createdAt || item.updatedAt || item.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8">
								<i className={`fas fa-history text-3xl mb-2 ${isDark ? 'text-slate-500' : 'text-gray-300'}`}></i>
								<p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>No activity yet</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Team Detail View */}
            {selectedTeam && (
                <div className="space-y-3">
                    {/* Team Header */}
                    <div className={`bg-gradient-to-r from-${selectedTeam.color}-500 to-${selectedTeam.color}-600 rounded-lg p-4 text-white`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center`}>
                                <i className={`fas ${selectedTeam.icon} text-2xl`}></i>
                            </div>
                            <div>
                                <h2 className="text-lg font-bold">{selectedTeam.name}</h2>
                                <p className="text-xs opacity-90">{selectedTeam.description}</p>
                            </div>
                        </div>
                        <div className="flex gap-4 text-sm">
                            <div>
                                <span className="opacity-75">Documents: </span>
                                <span className="font-bold">{filteredDocuments.length}</span>
                            </div>
                            <div>
                                <span className="opacity-75">Workflows: </span>
                                <span className="font-bold">{filteredWorkflows.length}</span>
                            </div>
                            <div>
                                <span className="opacity-75">Checklists: </span>
                                <span className="font-bold">{filteredChecklists.length}</span>
                            </div>
                            <div>
                                <span className="opacity-75">Notices: </span>
                                <span className="font-bold">{filteredNotices.length}</span>
                            </div>
                        </div>
                    </div>

                    {selectedTeam.permissions?.length > 0 && (
                        <div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                            <h3 className={`text-sm font-semibold mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>
                                Key Permissions & Access
                            </h3>
                            <ul className="space-y-2">
                                {selectedTeam.permissions.map((permission) => (
                                    <li
                                        key={permission}
                                        className={`flex items-start gap-2 text-xs ${isDark ? 'text-slate-300' : 'text-gray-600'}`}
                                    >
                                        <i className={`fas fa-check-circle mt-0.5 text-${selectedTeam.color}-500`}></i>
                                        <span className="leading-relaxed">{permission}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                console.log('🟢 Add Document button clicked');
                                console.log('  - DocumentModal available:', typeof window.DocumentModal);
                                console.log('  - selectedTeam:', selectedTeam?.name);
                                setEditingDocument(null);
                                setShowDocumentModal(true);
                                console.log('  - showDocumentModal set to: true');
                            }}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Add Document
                        </button>
                        <button
                            onClick={() => {
                                console.log('🟢 Create Workflow button clicked');
                                console.log('  - WorkflowModal available:', typeof window.WorkflowModal);
                                console.log('  - selectedTeam:', selectedTeam?.name);
                                setEditingWorkflow(null);
                                setShowWorkflowModal(true);
                                console.log('  - showWorkflowModal set to: true');
                            }}
                            className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-xs font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Create Workflow
                        </button>
                        <button
                            onClick={() => {
                                console.log('🟢 New Checklist button clicked');
                                console.log('  - ChecklistModal available:', typeof window.ChecklistModal);
                                console.log('  - selectedTeam:', selectedTeam?.name);
                                setEditingChecklist(null);
                                setShowChecklistModal(true);
                                console.log('  - showChecklistModal set to: true');
                            }}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-xs font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            New Checklist
                        </button>
                        <button
                            onClick={() => {
                                console.log('🟢 Post Notice button clicked');
                                console.log('  - NoticeModal available:', typeof window.NoticeModal);
                                console.log('  - selectedTeam:', selectedTeam?.name);
                                setEditingNotice(null);
                                setShowNoticeModal(true);
                                console.log('  - showNoticeModal set to: true');
                            }}
                            className="flex-1 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-xs font-medium"
                        >
                            <i className="fas fa-plus mr-1.5"></i>
                            Post Notice
                        </button>
                    </div>

                    {/* Content Display Based on Active Tab */}
					<div className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                        {activeTab === 'documents' && (
                            <div>
									<h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Documents Library</h3>
                                {displayDocuments.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {displayDocuments.map(doc => (
                                            <div key={doc.id} className={`border rounded-lg p-3 hover:shadow-md transition ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                                                <div className="flex items-start justify-between mb-2">
										<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-blue-900' : 'bg-blue-100'}`}>
											<i className={`fas fa-file-alt ${isDark ? 'text-blue-300' : 'text-blue-600'}`}></i>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleViewDocument(doc)}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`}
                                                            title="View"
                                                        >
                                                            <i className="fas fa-eye text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingDocument(doc);
                                                                setShowDocumentModal(true);
                                                            }}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-primary-400' : 'text-gray-400 hover:text-primary-600'}`}
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteDocument(doc.id)}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
										<span className={`px-2 py-0.5 text-xs rounded mb-2 inline-block ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}>
                                                    {doc.category}
                                                </span>
										<h4 className={`font-semibold text-sm mb-1 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{doc.title}</h4>
										<p className={`text-xs mb-2 line-clamp-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{doc.description}</p>
										<div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                                    <span>v{doc.version}</span>
                                                    <span>{new Date(doc.createdAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-file-alt text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>No documents yet</p>
                                        <button 
                                            onClick={() => {
                                                setEditingDocument(null);
                                                setShowDocumentModal(true);
                                            }}
                                            className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                                        >
                                            Add First Document
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'workflows' && (
                            <div>
                                <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Workflows & Processes</h3>
                                {displayWorkflows.length > 0 ? (
									<div className="space-y-3">
                                        {displayWorkflows.map(workflow => (
                                            <div key={workflow.id} className={`border rounded-lg p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-3 flex-1">
										<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-purple-900' : 'bg-purple-100'}`}>
											<i className={`fas fa-project-diagram ${isDark ? 'text-purple-300' : 'text-purple-600'}`}></i>
                                                        </div>
                                                        <div className="flex-1">
												<h4 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{workflow.title}</h4>
												<p className={`text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>{workflow.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleExecuteWorkflow(workflow)}
                                                            className={`px-2 py-1 rounded text-xs transition font-medium ${isDark ? 'bg-green-900 text-green-300 hover:bg-green-800' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                                                            title="Execute Workflow"
                                                        >
                                                            <i className="fas fa-play mr-1"></i>
                                                            Execute
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingWorkflow(workflow);
                                                                setShowWorkflowModal(true);
                                                            }}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-primary-400' : 'text-gray-400 hover:text-primary-600'}`}
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteWorkflow(workflow.id)}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                                
										<div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-1 text-xs rounded ${
												workflow.status === 'Active' ? isDark ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-700' :
												workflow.status === 'Draft' ? isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700' :
												isDark ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-700'
                                                    }`}>
                                                        {workflow.status}
                                                    </span>
											{workflow.tags && workflow.tags.map(tag => (
												<span key={tag} className={`px-2 py-1 text-xs rounded ${isDark ? 'bg-purple-900/40 text-purple-300' : 'bg-purple-50 text-purple-700'}`}>
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                                
										<div className={`flex items-center gap-4 text-xs ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
                                                    <span><i className="fas fa-layer-group mr-1"></i>{workflow.steps?.length || 0} steps</span>
                                                    <span><i className="fas fa-clock mr-1"></i>Updated {new Date(workflow.updatedAt).toLocaleDateString('en-ZA')}</span>
                                                    <span><i className="fas fa-play-circle mr-1"></i>
                                                        {accessibleWorkflowExecutions.filter(e => e.workflowId === workflow.id).length} executions
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-project-diagram text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>No workflows yet</p>
                                        <button 
                                            onClick={() => {
                                                setEditingWorkflow(null);
                                                setShowWorkflowModal(true);
                                            }}
                                            className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                                        >
                                            Create First Workflow
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'checklists' && (
                            <div>
									<h3 className="text-sm font-semibold text-gray-900 mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}">Checklists & Forms</h3>
                                {displayChecklists.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {displayChecklists.map(checklist => (
                                            <div key={checklist.id} className="border border-gray-200 rounded-lg p-3 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-3 flex-1">
										<div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? 'bg-green-900' : 'bg-green-100'}`}>
											<i className={`fas fa-tasks ${isDark ? 'text-green-300' : 'text-green-600'}`}></i>
                                                        </div>
                                                        <div>
												<h4 className="font-semibold text-gray-900 text-sm ${isDark ? 'text-slate-100' : 'text-gray-900'}">{checklist.title}</h4>
												<p className="text-xs text-gray-600 ${isDark ? 'text-slate-400' : 'text-gray-600'}">{checklist.items?.length || 0} items</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setEditingChecklist(checklist);
                                                                setShowChecklistModal(true);
                                                            }}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-primary-400' : 'text-gray-400 hover:text-primary-600'}`}
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteChecklist(checklist.id)}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
										<span className={`px-2 py-1 text-xs rounded mb-2 inline-block ${isDark ? 'bg-slate-700 text-slate-200' : 'bg-gray-100 text-gray-700'}`}>
                                                    {checklist.category}
                                                </span>
										<p className="text-xs text-gray-600 mb-2 ${isDark ? 'text-slate-400' : 'text-gray-600'}">{checklist.description}</p>
										<div className="flex items-center justify-between text-xs text-gray-500 ${isDark ? 'text-slate-400' : 'text-gray-600'}">
                                                    <span><i className="fas fa-check-circle mr-1"></i>{checklist.frequency}</span>
                                                    <button className={`font-medium ${isDark ? 'text-primary-400 hover:text-primary-300' : 'text-primary-600 hover:text-primary-700'}`}>
                                                        Use Template →
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-tasks text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>No checklists yet</p>
                                        <button 
                                            onClick={() => {
                                                setEditingChecklist(null);
                                                setShowChecklistModal(true);
                                            }}
                                            className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                                        >
                                            Create First Checklist
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'notices' && (
                            <div>
								<h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>Notice Board</h3>
                                {displayNotices.length > 0 ? (
                                    <div className="space-y-3">
                                        {displayNotices.map(notice => {
                                            const priorityClasses = notice.priority === 'Critical' || notice.priority === 'High' 
                                                ? isDark ? 'border-red-400 bg-red-900/30' : 'border-red-500 bg-red-50'
                                                : notice.priority === 'Medium'
                                                ? isDark ? 'border-yellow-400 bg-yellow-900/30' : 'border-yellow-500 bg-yellow-50'
                                                : isDark ? 'border-blue-400 bg-blue-900/30' : 'border-blue-500 bg-blue-50';
                                            
                                            const iconClasses = notice.priority === 'Critical' || notice.priority === 'High'
                                                ? isDark ? 'text-red-400' : 'text-red-600'
                                                : notice.priority === 'Medium'
                                                ? isDark ? 'text-yellow-400' : 'text-yellow-600'
                                                : isDark ? 'text-blue-400' : 'text-blue-600';
                                            
                                            const badgeClasses = notice.priority === 'Critical' || notice.priority === 'High'
                                                ? isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-700'
                                                : notice.priority === 'Medium'
                                                ? isDark ? 'bg-yellow-900/50 text-yellow-300' : 'bg-yellow-100 text-yellow-700'
                                                : isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700';
                                            
                                            return (
                                            <div key={notice.id} className={`border-l-4 rounded-lg p-3 ${priorityClasses}`}>
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <i className={`fas fa-bullhorn ${iconClasses}`}></i>
												<h4 className={`font-semibold text-sm ${isDark ? 'text-slate-100' : 'text-gray-900'}`}>{notice.title}</h4>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <span className={`px-2 py-1 text-xs rounded font-medium ${badgeClasses}`}>
                                                            {notice.priority}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingNotice(notice);
                                                                setShowNoticeModal(true);
                                                            }}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-primary-400' : 'text-gray-400 hover:text-primary-600'}`}
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteNotice(notice.id)}
                                                            className={`p-1 transition ${isDark ? 'text-slate-400 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
												<p className={`text-sm mb-2 ${isDark ? 'text-slate-300' : 'text-gray-700'}`}>{notice.content}</p>
												<div className={`flex items-center justify-between text-xs ${isDark ? 'text-slate-400' : 'text-gray-600'}`}>
                                                    <span><i className="fas fa-user mr-1"></i>{notice.author}</span>
                                                    <span>{new Date(notice.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className={`fas fa-bullhorn text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>No notices yet</p>
                                        <button 
                                            onClick={() => {
                                                setEditingNotice(null);
                                                setShowNoticeModal(true);
                                            }}
                                            className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                                        >
                                            Post First Notice
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'meeting-notes' && selectedTeam?.id === 'management' && (() => {
                            const ComponentToRender = window.ManagementMeetingNotes || ManagementMeetingNotes;
                            
                            console.log('🔍 Teams: Rendering meeting-notes tab', {
                                activeTab,
                                selectedTeamId: selectedTeam?.id,
                                ManagementMeetingNotesAvailable: !!ManagementMeetingNotes,
                                windowManagementMeetingNotes: !!window.ManagementMeetingNotes,
                                ComponentToRender: !!ComponentToRender,
                                managementMeetingNotesAvailable
                            });
                            
                            if (!ComponentToRender) {
                                // Show loading state while waiting for component
                                if (managementMeetingNotesAvailable) {
                                    // Component was available but disappeared (shouldn't happen)
                                    return (
                                        <div className="text-center py-12">
                                            <i className={`fas fa-clipboard-list text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                                            <p className="text-sm text-gray-500 ${isDark ? 'text-slate-400' : 'text-gray-600'} mb-2">
                                                Meeting Notes component not available
                                            </p>
                                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                                Please refresh the page to load the component.
                                            </p>
                                        </div>
                                    );
                                } else {
                                    // Still loading
                                    return (
                                        <div className="text-center py-12">
                                            <i className={`fas fa-spinner fa-spin text-4xl mb-3 ${isDark ? 'text-slate-600' : 'text-gray-300'}`}></i>
                                            <p className="text-sm text-gray-500 ${isDark ? 'text-slate-400' : 'text-gray-600'} mb-2">
                                                Loading Meeting Notes component...
                                            </p>
                                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-gray-400'}`}>
                                                Please wait while the component loads.
                                            </p>
                                        </div>
                                    );
                                }
                            }
                            
                            return (
                                <div>
                                    <ComponentToRender />
                                </div>
                            );
                        })()}

                    </div>
                </div>
            )}

            {/* Modals */}
            {showDocumentModal && (
                <DocumentModal
                    isOpen={showDocumentModal}
                    onClose={() => {
                        setShowDocumentModal(false);
                        setEditingDocument(null);
                    }}
                    team={selectedTeam}
                    document={editingDocument}
                    onSave={handleSaveDocument}
                />
            )}

            {showWorkflowModal && (
                <WorkflowModal
                    isOpen={showWorkflowModal}
                    onClose={() => {
                        setShowWorkflowModal(false);
                        setEditingWorkflow(null);
                    }}
                    team={selectedTeam}
                    workflow={editingWorkflow}
                    onSave={handleSaveWorkflow}
                />
            )}

            {showChecklistModal && (
                <ChecklistModal
                    isOpen={showChecklistModal}
                    onClose={() => {
                        setShowChecklistModal(false);
                        setEditingChecklist(null);
                    }}
                    team={selectedTeam}
                    checklist={editingChecklist}
                    onSave={handleSaveChecklist}
                />
            )}

            {showNoticeModal && (
                <NoticeModal
                    isOpen={showNoticeModal}
                    onClose={() => {
                        setShowNoticeModal(false);
                        setEditingNotice(null);
                    }}
                    team={selectedTeam}
                    notice={editingNotice}
                    onSave={handleSaveNotice}
                />
            )}

            {showWorkflowExecutionModal && (
                <WorkflowExecutionModal
                    isOpen={showWorkflowExecutionModal}
                    onClose={() => {
                        setShowWorkflowExecutionModal(false);
                        setExecutingWorkflow(null);
                    }}
                    workflow={executingWorkflow}
                    onComplete={handleWorkflowExecutionComplete}
                />
            )}

            {/* Document View Modal */}
            {showDocumentViewModal && viewingDocument && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 ${isDark ? 'text-slate-100' : 'text-gray-900'}">{viewingDocument.title}</h3>
                                <p className="text-xs text-gray-600 ${isDark ? 'text-slate-400' : 'text-gray-600'}">
                                    {viewingDocument.category} • Version {viewingDocument.version}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowDocumentViewModal(false);
                                    setViewingDocument(null);
                                }}
                                className={`text-gray-400 transition ${isDark ? 'hover:text-slate-200 text-slate-400' : 'hover:text-gray-600'}`}
                            >
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {viewingDocument.description && (
                                <div className={`border rounded-lg p-3 ${isDark ? 'bg-blue-900/30 border-blue-700' : 'bg-blue-50 border-blue-200'}`}>
                                    <p className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-900'}`}>{viewingDocument.description}</p>
                                </div>
                            )}

                            <div className="prose prose-sm max-w-none">
                                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-900 ${isDark ? 'text-slate-100' : 'text-gray-900'}">
                                    {viewingDocument.content}
                                </pre>
                            </div>

                            {viewingDocument.attachments && viewingDocument.attachments.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}">Attachments</h4>
                                    <div className="space-y-2">
                                        {viewingDocument.attachments.map((att, idx) => (
                                            <div key={idx} className={`flex items-center justify-between p-2 rounded border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}>
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-file text-gray-400 ${isDark ? 'text-slate-400' : 'text-gray-600'}"></i>
                                                    <span className="text-sm text-gray-900 ${isDark ? 'text-slate-100' : 'text-gray-900'}">{att.name}</span>
                                                </div>
                                                <span className="text-xs text-gray-500 ${isDark ? 'text-slate-400' : 'text-gray-600'}">
                                                    {(att.size / 1024).toFixed(2)} KB
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {viewingDocument.tags && viewingDocument.tags.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-2 ${isDark ? 'text-slate-100' : 'text-gray-900'}">Tags</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {viewingDocument.tags.map(tag => (
                                            <span key={tag} className={`px-2 py-1 rounded text-xs ${isDark ? 'bg-primary-900/50 text-primary-300' : 'bg-primary-100 text-primary-700'}`}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={`pt-4 border-t flex items-center justify-between text-xs ${isDark ? 'border-slate-700 text-slate-400' : 'border-gray-200 text-gray-500'}`}>
                                <span>Created by {viewingDocument.createdBy}</span>
                                <span>
                                    Last updated: {new Date(viewingDocument.updatedAt).toLocaleDateString('en-ZA', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally - don't wrap in memo as it may cause issues
window.Teams = Teams;
