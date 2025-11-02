// Get dependencies from window
const { useState, useEffect, useMemo } = React;
const storage = window.storage;
const DocumentModal = window.DocumentModal;
const WorkflowModal = window.WorkflowModal;
const ChecklistModal = window.ChecklistModal;
const NoticeModal = window.NoticeModal;
const WorkflowExecutionModal = window.WorkflowExecutionModal;

// Team definitions - defined outside component to avoid recreation on every render
const TEAMS = [
        { 
            id: 'management', 
            name: 'Management', 
            icon: 'fa-user-tie', 
            color: 'blue',
            description: 'Executive leadership and strategic planning',
            members: 0
        },
        { 
            id: 'technical', 
            name: 'Technical', 
            icon: 'fa-tools', 
            color: 'purple',
            description: 'Technical operations and system maintenance',
            members: 0
        },
        { 
            id: 'support', 
            name: 'Support', 
            icon: 'fa-headset', 
            color: 'green',
            description: 'Customer support and service delivery',
            members: 0
        },
        { 
            id: 'data-analytics', 
            name: 'Data Analytics', 
            icon: 'fa-chart-line', 
            color: 'indigo',
            description: 'Data analysis and business intelligence',
            members: 0
        },
        { 
            id: 'finance', 
            name: 'Finance', 
            icon: 'fa-coins', 
            color: 'yellow',
            description: 'Financial management and accounting',
            members: 0
        },
        { 
            id: 'business-development', 
            name: 'Business Development', 
            icon: 'fa-rocket', 
            color: 'pink',
            description: 'Growth strategies and new opportunities',
            members: 0
        },
        { 
            id: 'commercial', 
            name: 'Commercial', 
            icon: 'fa-handshake', 
            color: 'orange',
            description: 'Sales and commercial operations',
            members: 0
        },
        { 
            id: 'compliance', 
            name: 'Compliance', 
            icon: 'fa-shield-alt', 
            color: 'red',
            description: 'Regulatory compliance and risk management',
            members: 0
        }
];

const Teams = () => {
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

    // Check modal components on mount only
    useEffect(() => {
        console.log('🔍 Teams: Checking modal components...');
        console.log('  - DocumentModal:', typeof window.DocumentModal);
        console.log('  - WorkflowModal:', typeof window.WorkflowModal);
        console.log('  - ChecklistModal:', typeof window.ChecklistModal);
        console.log('  - NoticeModal:', typeof window.NoticeModal);
        console.log('  - WorkflowExecutionModal:', typeof window.WorkflowExecutionModal);
    }, []);

    // Load data from data service
    useEffect(() => {
        const loadData = async () => {
            try {
                console.log('🔄 Teams: Loading data from data service');
                
                const [savedDocuments, savedWorkflows, savedChecklists, savedNotices] = await Promise.all([
                    window.dataService?.getTeamDocuments?.() || [],
                    window.dataService?.getTeamWorkflows?.() || [],
                    window.dataService?.getTeamChecklists?.() || [],
                    window.dataService?.getTeamNotices?.() || []
                ]);
                
                const savedExecutions = JSON.parse(localStorage.getItem('abcotronics_workflow_executions') || '[]');

                console.log('✅ Teams: Data loaded successfully', {
                    documents: savedDocuments.length,
                    workflows: savedWorkflows.length,
                    checklists: savedChecklists.length,
                    notices: savedNotices.length,
                    executions: savedExecutions.length
                });

                setDocuments(savedDocuments);
                setWorkflows(savedWorkflows);
                setChecklists(savedChecklists);
                setNotices(savedNotices);
                setWorkflowExecutions(savedExecutions);
                
                // Delay rendering significantly to prevent renderer crash
                setTimeout(() => setIsReady(true), 500);
            } catch (error) {
                console.error('❌ Teams: Error loading data:', error);
                setIsReady(true); // Show error state
            }
        };
        
        loadData();
    }, []);

    // Get counts for selected team - memoized per team to avoid recalculation
    const teamCountsCache = useMemo(() => {
        const cache = {};
        TEAMS.forEach(team => {
            cache[team.id] = {
                documents: documents.filter(d => d.team === team.id).length,
                workflows: workflows.filter(w => w.team === team.id).length,
                checklists: checklists.filter(c => c.team === team.id).length,
                notices: notices.filter(n => n.team === team.id).length
            };
        });
        return cache;
    }, [documents, workflows, checklists, notices]);

    const getTeamCounts = (teamId) => {
        return teamCountsCache[teamId] || { documents: 0, workflows: 0, checklists: 0, notices: 0 };
    };

    // Filter data by selected team - memoized to avoid recalculation
    const filteredDocuments = useMemo(() => {
        return selectedTeam 
            ? documents.filter(d => d.team === selectedTeam.id)
            : documents;
    }, [selectedTeam, documents]);
    
    const filteredWorkflows = useMemo(() => {
        return selectedTeam 
            ? workflows.filter(w => w.team === selectedTeam.id)
            : workflows;
    }, [selectedTeam, workflows]);
    
    const filteredChecklists = useMemo(() => {
        return selectedTeam 
            ? checklists.filter(c => c.team === selectedTeam.id)
            : checklists;
    }, [selectedTeam, checklists]);
    
    const filteredNotices = useMemo(() => {
        return selectedTeam 
            ? notices.filter(n => n.team === selectedTeam.id)
            : notices;
    }, [selectedTeam, notices]);

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
            ...documents.map(d => ({ ...d, type: 'document', icon: 'file-alt' })),
            ...workflows.map(w => ({ ...w, type: 'workflow', icon: 'project-diagram' })),
            ...checklists.map(c => ({ ...c, type: 'checklist', icon: 'tasks' })),
            ...notices.map(n => ({ ...n, type: 'notice', icon: 'bullhorn' }))
        ]
            .sort((a, b) => new Date(b.createdAt || b.updatedAt || b.date) - new Date(a.createdAt || a.updatedAt || a.date))
            .slice(0, 10);
    }, [documents, workflows, checklists, notices]);

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
					<h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Teams & Knowledge Hub</h1>
					<p className="text-xs text-gray-600 dark:text-slate-400">Centralized documentation, workflows, and team collaboration</p>
                </div>
                {selectedTeam && (
                    <button
                        onClick={() => setSelectedTeam(null)}
						className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    >
                        <i className="fas fa-arrow-left mr-1.5"></i>
                        Back to All Teams
                    </button>
                )}
            </div>

            {/* Search and Filter Bar */}
            {selectedTeam && (
				<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                placeholder="Search documents, workflows, checklists..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
								className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400"
                            />
							<i className="fas fa-search absolute left-2.5 top-2 text-gray-400 text-xs dark:text-slate-400"></i>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActiveTab('documents')}
                                className={`px-3 py-1.5 text-xs rounded-lg transition ${
                                    activeTab === 'documents'
                                        ? 'bg-primary-600 text-white'
										: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
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
										: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
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
										: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
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
										: 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
                                }`}
                            >
                                <i className="fas fa-bullhorn mr-1"></i>
                                Notices
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Overview - All Teams Grid */}
            {!selectedTeam && (
                <div className="space-y-3">
                    {/* Quick Stats */}
						<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
						<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                                <div>
									<p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Total Documents</p>
									<p className="text-xl font-bold text-gray-900 dark:text-slate-100">{documents.length}</p>
                                </div>
								<div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center dark:bg-blue-900">
									<i className="fas fa-file-alt text-blue-600 dark:text-blue-300"></i>
                                </div>
                            </div>
                        </div>
						<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                                <div>
									<p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Active Workflows</p>
									<p className="text-xl font-bold text-gray-900 dark:text-slate-100">{workflows.filter(w => w.status === 'Active').length}</p>
                                </div>
								<div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center dark:bg-purple-900">
									<i className="fas fa-project-diagram text-purple-600 dark:text-purple-300"></i>
                                </div>
                            </div>
                        </div>
						<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                                <div>
									<p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Checklists</p>
									<p className="text-xl font-bold text-gray-900 dark:text-slate-100">{checklists.length}</p>
                                </div>
								<div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center dark:bg-green-900">
									<i className="fas fa-tasks text-green-600 dark:text-green-300"></i>
                                </div>
                            </div>
                        </div>
						<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                                <div>
									<p className="text-xs text-gray-600 mb-0.5 dark:text-slate-400">Executions</p>
									<p className="text-xl font-bold text-gray-900 dark:text-slate-100">{workflowExecutions.length}</p>
                                </div>
								<div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center dark:bg-orange-900">
									<i className="fas fa-play-circle text-orange-600 dark:text-orange-300"></i>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Teams Grid */}
					<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
						<h2 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">Department Teams</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {TEAMS.map(team => {
                                const counts = getTeamCounts(team.id);
                                return (
                                    <button
                                        key={team.id}
                                        onClick={() => setSelectedTeam(team)}
										className="text-left border border-gray-200 rounded-lg p-3 hover:shadow-md hover:border-primary-300 transition group dark:border-slate-700"
                                    >
                                        <div className="flex items-center justify-between mb-2">
											<div className={`w-10 h-10 bg-${team.color}-100 rounded-lg flex items-center justify-center group-hover:bg-${team.color}-200 transition dark:bg-slate-700 dark:group-hover:bg-slate-600`}>
												<i className={`fas ${team.icon} text-${team.color}-600 text-lg dark:text-white`}></i>
                                            </div>
                                            <i className="fas fa-arrow-right text-gray-400 text-xs group-hover:text-primary-600 transition"></i>
                                        </div>
										<h3 className="font-semibold text-gray-900 text-sm mb-1 dark:text-slate-100">{team.name}</h3>
										<p className="text-xs text-gray-600 mb-2 line-clamp-2 dark:text-slate-400">{team.description}</p>
										<div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
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
					<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
						<h2 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">Recent Activity</h2>
                        {recentActivity.length > 0 ? (
                            <div className="space-y-2">
                                {recentActivity.map((item, idx) => {
                                    const team = TEAMS.find(t => t.id === item.team);
                                    return (
										<div key={idx} className="flex items-center gap-3 py-2 border-b last:border-b-0 dark:border-slate-700">
											<div className={`w-8 h-8 bg-${team?.color || 'gray'}-100 rounded-lg flex items-center justify-center flex-shrink-0 dark:bg-slate-700`}>
												<i className={`fas fa-${item.icon} text-${team?.color || 'gray'}-600 text-xs dark:text-white`}></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
												<p className="text-xs font-medium text-gray-900 truncate dark:text-slate-100">{item.title}</p>
												<p className="text-xs text-gray-500 dark:text-slate-400">
                                                    {team?.name} • {item.type}
                                                </p>
                                            </div>
											<span className="text-xs text-gray-400 whitespace-nowrap dark:text-slate-400">
                                                {new Date(item.createdAt || item.updatedAt || item.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-8">
								<i className="fas fa-history text-3xl text-gray-300 mb-2 dark:text-slate-500"></i>
								<p className="text-xs text-gray-500 dark:text-slate-400">No activity yet</p>
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
					<div className="bg-white rounded-lg border border-gray-200 p-3 dark:bg-slate-800 dark:border-slate-700">
                        {activeTab === 'documents' && (
                            <div>
									<h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">Documents Library</h3>
                                {displayDocuments.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {displayDocuments.map(doc => (
                                            <div key={doc.id} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition dark:bg-slate-800 dark:border-slate-700">
                                                <div className="flex items-start justify-between mb-2">
										<div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center dark:bg-blue-900">
											<i className="fas fa-file-alt text-blue-600 dark:text-blue-300"></i>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleViewDocument(doc)}
                                                            className="p-1 text-gray-400 hover:text-blue-600 transition dark:text-slate-400 dark:hover:text-blue-400"
                                                            title="View"
                                                        >
                                                            <i className="fas fa-eye text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingDocument(doc);
                                                                setShowDocumentModal(true);
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition dark:text-slate-400 dark:hover:text-primary-400"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteDocument(doc.id)}
                                                            className="p-1 text-gray-400 hover:text-red-600 transition dark:text-slate-400 dark:hover:text-red-400"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
										<span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded mb-2 inline-block dark:bg-slate-700 dark:text-slate-200">
                                                    {doc.category}
                                                </span>
										<h4 className="font-semibold text-gray-900 text-sm mb-1 dark:text-slate-100">{doc.title}</h4>
										<p className="text-xs text-gray-600 mb-2 line-clamp-2 dark:text-slate-400">{doc.description}</p>
										<div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                                    <span>v{doc.version}</span>
                                                    <span>{new Date(doc.createdAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className="fas fa-file-alt text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                                        <p className="text-sm text-gray-500 dark:text-slate-400">No documents yet</p>
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
                                <h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">Workflows & Processes</h3>
                                {displayWorkflows.length > 0 ? (
									<div className="space-y-3">
                                        {displayWorkflows.map(workflow => (
                                            <div key={workflow.id} className="border border-gray-200 rounded-lg p-3 dark:bg-slate-800 dark:border-slate-700">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-3 flex-1">
										<div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center dark:bg-purple-900">
											<i className="fas fa-project-diagram text-purple-600 dark:text-purple-300"></i>
                                                        </div>
                                                        <div className="flex-1">
												<h4 className="font-semibold text-gray-900 text-sm dark:text-slate-100">{workflow.title}</h4>
												<p className="text-xs text-gray-600 dark:text-slate-400">{workflow.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleExecuteWorkflow(workflow)}
                                                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 transition font-medium dark:bg-green-900 dark:text-green-300 dark:hover:bg-green-800"
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
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition dark:text-slate-400 dark:hover:text-primary-400"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteWorkflow(workflow.id)}
                                                            className="p-1 text-gray-400 hover:text-red-600 transition dark:text-slate-400 dark:hover:text-red-400"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                                
										<div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-2 py-1 text-xs rounded ${
												workflow.status === 'Active' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
												workflow.status === 'Draft' ? 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-200' :
												'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                                                    }`}>
                                                        {workflow.status}
                                                    </span>
											{workflow.tags && workflow.tags.map(tag => (
												<span key={tag} className="px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded dark:bg-purple-900/40 dark:text-purple-300">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                                
										<div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                                                    <span><i className="fas fa-layer-group mr-1"></i>{workflow.steps?.length || 0} steps</span>
                                                    <span><i className="fas fa-clock mr-1"></i>Updated {new Date(workflow.updatedAt).toLocaleDateString('en-ZA')}</span>
                                                    <span><i className="fas fa-play-circle mr-1"></i>
                                                        {workflowExecutions.filter(e => e.workflowId === workflow.id).length} executions
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className="fas fa-project-diagram text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                                        <p className="text-sm text-gray-500 dark:text-slate-400">No workflows yet</p>
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
									<h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">Checklists & Forms</h3>
                                {displayChecklists.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {displayChecklists.map(checklist => (
                                            <div key={checklist.id} className="border border-gray-200 rounded-lg p-3 dark:bg-slate-800 dark:border-slate-700">
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-3 flex-1">
										<div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center dark:bg-green-900">
											<i className="fas fa-tasks text-green-600 dark:text-green-300"></i>
                                                        </div>
                                                        <div>
												<h4 className="font-semibold text-gray-900 text-sm dark:text-slate-100">{checklist.title}</h4>
												<p className="text-xs text-gray-600 dark:text-slate-400">{checklist.items?.length || 0} items</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => {
                                                                setEditingChecklist(checklist);
                                                                setShowChecklistModal(true);
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition dark:text-slate-400 dark:hover:text-primary-400"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteChecklist(checklist.id)}
                                                            className="p-1 text-gray-400 hover:text-red-600 transition dark:text-slate-400 dark:hover:text-red-400"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
										<span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded mb-2 inline-block dark:bg-slate-700 dark:text-slate-200">
                                                    {checklist.category}
                                                </span>
										<p className="text-xs text-gray-600 mb-2 dark:text-slate-400">{checklist.description}</p>
										<div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                                                    <span><i className="fas fa-check-circle mr-1"></i>{checklist.frequency}</span>
                                                    <button className="text-primary-600 hover:text-primary-700 font-medium dark:text-primary-400 dark:hover:text-primary-300">
                                                        Use Template →
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className="fas fa-tasks text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                                        <p className="text-sm text-gray-500 dark:text-slate-400">No checklists yet</p>
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
									<h3 className="text-sm font-semibold text-gray-900 mb-3 dark:text-slate-100">Notice Board</h3>
                                {displayNotices.length > 0 ? (
                                    <div className="space-y-3">
                                        {displayNotices.map(notice => (
                                            <div key={notice.id} className={`border-l-4 rounded-lg p-3 ${
                                                notice.priority === 'Critical' || notice.priority === 'High' ? 'border-red-500 bg-red-50 dark:bg-red-900/30 dark:border-red-400' :
                                                notice.priority === 'Medium' ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 dark:border-yellow-400' :
                                                'border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-400'
                                            }`}>
                                                <div className="flex items-start justify-between mb-2">
                                                    <div className="flex items-center gap-2 flex-1">
                                                        <i className={`fas fa-bullhorn ${
                                                            notice.priority === 'Critical' || notice.priority === 'High' ? 'text-red-600 dark:text-red-400' :
                                                            notice.priority === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' :
                                                            'text-blue-600 dark:text-blue-400'
                                                        }`}></i>
												<h4 className="font-semibold text-gray-900 text-sm dark:text-slate-100">{notice.title}</h4>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <span className={`px-2 py-1 text-xs rounded font-medium ${
                                                            notice.priority === 'Critical' || notice.priority === 'High' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                                                            notice.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                                                            'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                                        }`}>
                                                            {notice.priority}
                                                        </span>
                                                        <button
                                                            onClick={() => {
                                                                setEditingNotice(notice);
                                                                setShowNoticeModal(true);
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition dark:text-slate-400 dark:hover:text-primary-400"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteNotice(notice.id)}
                                                            className="p-1 text-gray-400 hover:text-red-600 transition dark:text-slate-400 dark:hover:text-red-400"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
												<p className="text-sm text-gray-700 mb-2 dark:text-slate-300">{notice.content}</p>
												<div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400">
                                                    <span><i className="fas fa-user mr-1"></i>{notice.author}</span>
                                                    <span>{new Date(notice.date).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <i className="fas fa-bullhorn text-4xl text-gray-300 mb-3 dark:text-slate-600"></i>
                                        <p className="text-sm text-gray-500 dark:text-slate-400">No notices yet</p>
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
                    <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10 dark:bg-slate-800 dark:border-slate-700">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{viewingDocument.title}</h3>
                                <p className="text-xs text-gray-600 dark:text-slate-400">
                                    {viewingDocument.category} • Version {viewingDocument.version}
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setShowDocumentViewModal(false);
                                    setViewingDocument(null);
                                }}
                                className="text-gray-400 hover:text-gray-600 transition dark:text-slate-400 dark:hover:text-slate-200"
                            >
                                <i className="fas fa-times text-lg"></i>
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {viewingDocument.description && (
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 dark:bg-blue-900/30 dark:border-blue-700">
                                    <p className="text-sm text-blue-900 dark:text-blue-200">{viewingDocument.description}</p>
                                </div>
                            )}

                            <div className="prose prose-sm max-w-none">
                                <pre className="whitespace-pre-wrap font-sans text-sm text-gray-900 dark:text-slate-100">
                                    {viewingDocument.content}
                                </pre>
                            </div>

                            {viewingDocument.attachments && viewingDocument.attachments.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-2 dark:text-slate-100">Attachments</h4>
                                    <div className="space-y-2">
                                        {viewingDocument.attachments.map((att, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200 dark:bg-slate-700 dark:border-slate-600">
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-file text-gray-400 dark:text-slate-400"></i>
                                                    <span className="text-sm text-gray-900 dark:text-slate-100">{att.name}</span>
                                                </div>
                                                <span className="text-xs text-gray-500 dark:text-slate-400">
                                                    {(att.size / 1024).toFixed(2)} KB
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {viewingDocument.tags && viewingDocument.tags.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-2 dark:text-slate-100">Tags</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {viewingDocument.tags.map(tag => (
                                            <span key={tag} className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs dark:bg-primary-900/50 dark:text-primary-300">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400">
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
