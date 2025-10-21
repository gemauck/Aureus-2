// Database-First Projects Component - No localStorage dependency
const { useState, useEffect } = React;

const ProjectsDatabaseFirst = () => {
    const [projects, setProjects] = useState([]);
    const [selectedProject, setSelectedProject] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('All Status');
    const [filterType, setFilterType] = useState('All Types');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [selectedProjects, setSelectedProjects] = useState([]);
    const [showBulkActions, setShowBulkActions] = useState(false);
    const { isDark } = window.useTheme();

    // Load projects from database
    const loadProjects = async () => {
        console.log('🔄 Loading projects from database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.log('⚠️ No authentication token - redirecting to login');
                window.location.hash = '#/login';
                return;
            }

            const response = await window.api.getProjects();
            const apiProjects = response?.data || [];
            console.log('📡 Database returned projects:', apiProjects.length);
            
            // Process projects data
            const processedProjects = apiProjects.map(p => ({
                id: p.id,
                name: p.name || '',
                client: p.client || '',
                type: p.type || 'Project',
                status: p.status || 'Active',
                startDate: p.startDate || new Date().toISOString().split('T')[0],
                dueDate: p.dueDate || '',
                progress: p.progress || 0,
                assignedTo: p.assignedTo || '',
                description: p.description || '',
                budget: p.budget || 0,
                actualCost: p.actualCost || 0,
                tasks: Array.isArray(p.tasks) ? p.tasks : [],
                taskLists: Array.isArray(p.taskLists) ? p.taskLists : [
                    { id: 1, name: 'To Do', color: 'blue' },
                    { id: 2, name: 'In Progress', color: 'yellow' },
                    { id: 3, name: 'Done', color: 'green' }
                ],
                customFieldDefinitions: Array.isArray(p.customFieldDefinitions) ? p.customFieldDefinitions : [],
                documents: Array.isArray(p.documents) ? p.documents : [],
                comments: Array.isArray(p.comments) ? p.comments : [],
                activityLog: Array.isArray(p.activityLog) ? p.activityLog : []
            }));
            
            setProjects(processedProjects);
            console.log('✅ Projects loaded from database');
            
        } catch (error) {
            console.error('❌ Failed to load projects from database:', error);
            if (error.message.includes('Unauthorized') || error.message.includes('401')) {
                console.log('🔑 Authentication expired - redirecting to login');
                window.storage.removeToken();
                window.storage.removeUser();
                window.location.hash = '#/login';
            } else {
                alert('Failed to load projects from database. Please try again.');
            }
        }
    };

    // Save project to database
    const handleSaveProject = async (projectData) => {
        console.log('💾 Saving project to database...');
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to save project data');
                return;
            }

            const comprehensiveProject = {
                id: selectedProject ? selectedProject.id : Date.now().toString(),
                name: projectData.name || '',
                client: projectData.client || '',
                type: projectData.type || 'Project',
                status: projectData.status || 'Active',
                startDate: projectData.startDate || new Date().toISOString().split('T')[0],
                dueDate: projectData.dueDate || '',
                progress: projectData.progress || 0,
                assignedTo: projectData.assignedTo || '',
                description: projectData.description || '',
                budget: projectData.budget || 0,
                actualCost: projectData.actualCost || 0,
                tasks: projectData.tasks || [],
                taskLists: projectData.taskLists || [
                    { id: 1, name: 'To Do', color: 'blue' },
                    { id: 2, name: 'In Progress', color: 'yellow' },
                    { id: 3, name: 'Done', color: 'green' }
                ],
                customFieldDefinitions: projectData.customFieldDefinitions || [],
                documents: projectData.documents || [],
                comments: projectData.comments || [],
                activityLog: projectData.activityLog || []
            };

            if (selectedProject) {
                // Update existing project
                await window.api.updateProject(comprehensiveProject.id, comprehensiveProject);
                console.log('✅ Project updated in database');
                
                // Update local state
                const updated = projects.map(p => p.id === selectedProject.id ? comprehensiveProject : p);
                setProjects(updated);
                setSelectedProject(comprehensiveProject);
            } else {
                // Create new project
                const newProject = await window.api.createProject(comprehensiveProject);
                console.log('✅ Project created in database');
                
                // Add to local state
                setProjects(prev => [...prev, newProject]);
                
                // Close modal and refresh
                setShowModal(false);
                setSelectedProject(null);
            }
            
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to save project to database:', error);
            alert('Failed to save project to database. Please try again.');
        }
    };

    // Delete project from database
    const handleDeleteProject = async (projectId) => {
        if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            return;
        }

        console.log(`💾 Deleting project ${projectId} from database...`);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete project');
                return;
            }

            await window.api.deleteProject(projectId);
            console.log('✅ Project deleted from database');
            
            // Update local state
            setProjects(prev => prev.filter(p => p.id !== projectId));
            setSelectedProject(null);
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to delete project from database:', error);
            alert('Failed to delete project from database. Please try again.');
        }
    };

    // Bulk delete projects
    const handleBulkDelete = async () => {
        if (selectedProjects.length === 0) return;
        
        const projectNames = selectedProjects.map(id => {
            const project = projects.find(p => p.id === id);
            return project ? project.name : `Project ${id}`;
        }).join(', ');
        
        if (!confirm(`Are you sure you want to delete ${selectedProjects.length} project(s)?\n\nProjects: ${projectNames}\n\nThis action cannot be undone.`)) {
            return;
        }

        console.log(`💾 Bulk deleting ${selectedProjects.length} projects from database...`);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Please log in to delete projects');
                return;
            }

            // Delete each project
            for (const projectId of selectedProjects) {
                await window.api.deleteProject(projectId);
            }
            
            console.log('✅ Projects deleted from database');
            
            // Update local state
            setProjects(prev => prev.filter(p => !selectedProjects.includes(p.id)));
            setSelectedProjects([]);
            setShowBulkActions(false);
            setRefreshKey(k => k + 1);
            
        } catch (error) {
            console.error('❌ Failed to bulk delete projects from database:', error);
            alert('Failed to delete projects from database. Please try again.');
        }
    };

    // Toggle project selection
    const toggleProjectSelection = (projectId) => {
        setSelectedProjects(prev => 
            prev.includes(projectId) 
                ? prev.filter(id => id !== projectId)
                : [...prev, projectId]
        );
    };

    // Select all projects
    const selectAllProjects = () => {
        setSelectedProjects(filteredProjects.map(p => p.id));
    };

    // Clear selection
    const clearSelection = () => {
        setSelectedProjects([]);
    };

    // Filter and search
    const filteredProjects = projects.filter(project => {
        const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            project.client.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'All Status' || project.status === filterStatus;
        const matchesType = filterType === 'All Types' || project.type === filterType;
        return matchesSearch && matchesStatus && matchesType;
    });

    // Load data on mount
    useEffect(() => {
        loadProjects();
    }, []);

    // Auto-refresh data every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            loadProjects();
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading projects from database...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className={`w-12 h-12 rounded-xl ${isDark ? 'bg-primary-600' : 'bg-primary-500'} flex items-center justify-center`}>
                            <i className="fas fa-project-diagram text-white text-lg"></i>
                        </div>
                        <div>
                            <h1 className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Projects</h1>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Database-synchronized project management</p>
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        {selectedProjects.length > 0 && (
                            <div className="flex items-center space-x-2">
                                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                                    {selectedProjects.length} selected
                                </span>
                                <button
                                    onClick={handleBulkDelete}
                                    className="bg-red-600 text-white px-3 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
                                >
                                    <i className="fas fa-trash mr-1"></i>
                                    Delete Selected
                                </button>
                                <button
                                    onClick={clearSelection}
                                    className="bg-gray-500 text-white px-3 py-2 rounded-lg font-medium hover:bg-gray-600 transition-colors text-sm"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        <button
                            onClick={() => setShowBulkActions(!showBulkActions)}
                            className={`px-3 py-2 rounded-lg font-medium transition-colors text-sm ${
                                showBulkActions 
                                    ? 'bg-primary-100 text-primary-700 border border-primary-200' 
                                    : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                            }`}
                        >
                            <i className="fas fa-check-square mr-1"></i>
                            Bulk Actions
                        </button>
                        <button 
                            onClick={() => {
                                setSelectedProject(null);
                                setShowModal(true);
                            }}
                            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-all duration-200"
                        >
                            <i className="fas fa-plus text-xs"></i>
                            <span>Add Project</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {showBulkActions && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-4`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedProjects.length === filteredProjects.length && filteredProjects.length > 0}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            selectAllProjects();
                                        } else {
                                            clearSelection();
                                        }
                                    }}
                                    className={`w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 ${
                                        isDark ? 'bg-gray-700 border-gray-600' : ''
                                    }`}
                                />
                                <span className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    Select All ({filteredProjects.length} projects)
                                </span>
                            </label>
                        </div>
                        <div className="text-sm text-gray-500">
                            Click "Bulk Actions" again to exit selection mode
                        </div>
                    </div>
                </div>
            )}

            {/* Search and Filters */}
            <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-6`}>
                <div className="space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search projects..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full px-4 py-3 pl-10 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-gray-50 text-gray-900 border-gray-200'} border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        />
                        <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Status</option>
                            <option>Active</option>
                            <option>Completed</option>
                            <option>On Hold</option>
                            <option>Cancelled</option>
                        </select>
                        
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className={`px-3 py-2 ${isDark ? 'bg-gray-700 text-gray-100 border-gray-600' : 'bg-white text-gray-900 border-gray-200'} border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500`}
                        >
                            <option>All Types</option>
                            <option>Monthly Review</option>
                            <option>Audit</option>
                            <option>Analysis</option>
                            <option>Implementation</option>
                            <option>Consultation</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Projects Grid */}
            <div className="space-y-4">
                {filteredProjects.length === 0 ? (
                    <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl p-8 text-center`}>
                        <i className="fas fa-project-diagram text-4xl text-gray-400 mb-4"></i>
                        <h3 className={`text-lg font-medium ${isDark ? 'text-gray-300' : 'text-gray-900'} mb-2`}>
                            No projects found
                        </h3>
                        <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                            Get started by adding your first project
                        </p>
                        <button
                            onClick={() => {
                                setSelectedProject(null);
                                setShowModal(true);
                            }}
                            className="bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                        >
                            Add Project
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredProjects.map(project => (
                            <div 
                                key={project.id}
                                className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl p-6 transition-all duration-200 hover:shadow-lg ${
                                    showBulkActions ? 'cursor-default' : 'cursor-pointer'
                                }`}
                                onClick={() => {
                                    if (!showBulkActions) {
                                        setSelectedProject(project);
                                    }
                                }}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-start space-x-3 flex-1">
                                        {showBulkActions && (
                                            <input
                                                type="checkbox"
                                                checked={selectedProjects.includes(project.id)}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    toggleProjectSelection(project.id);
                                                }}
                                                className={`mt-1 w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 ${
                                                    isDark ? 'bg-gray-700 border-gray-600' : ''
                                                }`}
                                            />
                                        )}
                                        <div className="flex-1">
                                            <h3 className={`font-semibold text-lg ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-1`}>
                                                {project.name}
                                            </h3>
                                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                {project.client}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                            project.status === 'Active' ? 'bg-green-100 text-green-800' : 
                                            project.status === 'Completed' ? 'bg-blue-100 text-blue-800' :
                                            project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {project.status}
                                        </span>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteProject(project.id);
                                            }}
                                            className={`p-1 rounded-full transition-colors ${
                                                isDark 
                                                    ? 'text-gray-400 hover:text-red-400 hover:bg-red-900/20' 
                                                    : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
                                            }`}
                                            title="Delete Project"
                                        >
                                            <i className="fas fa-trash text-sm"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Type:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.type}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Progress:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.progress}%
                                        </span>
                                    </div>
                                    
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-primary-600 h-2 rounded-full transition-all duration-300" 
                                            style={{ width: `${project.progress}%` }}
                                        ></div>
                                    </div>
                                    
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}> primary-600'>Due:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'No due date'}
                                        </span>
                                    </div>
                                    
                                    <div className="flex justify-between text-sm">
                                        <span className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Assigned:</span>
                                        <span className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                            {project.assignedTo || 'Unassigned'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Project Modal */}
            {showModal && (
                <ProjectModal
                    project={selectedProject}
                    onSave={handleSaveProject}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedProject(null);
                    }}
                    allClients={[]} // Will be loaded from database
                />
            )}

            {/* Project Detail Modal */}
            {selectedProject && !showModal && (
                <ProjectDetail
                    project={selectedProject}
                    onSave={handleSaveProject}
                    onClose={() => setSelectedProject(null)}
                    onDelete={handleDeleteProject}
                    allClients={[]} // Will be loaded from database
                />
            )}
        </div>
    );
};

// Make available globally
window.ProjectsDatabaseFirst = ProjectsDatabaseFirst;
