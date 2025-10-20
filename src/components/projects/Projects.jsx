// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;
const ProjectModal = window.ProjectModal;
const ProjectDetail = window.ProjectDetail;

const initialProjects = [
    { 
        id: 1, 
        name: 'Fleet Optimization Project', 
        client: 'ABC Corporation', 
        type: 'Monthly Review', 
        status: 'Active', 
        startDate: '2024-01-15', 
        dueDate: '2024-03-15', 
        progress: 65, 
        assignedTo: 'Gareth Mauck',
        tasks: [],
        taskLists: [
            { id: 1, name: 'To Do', color: 'blue' },
            { id: 2, name: 'Technical Requirements', color: 'green' },
            { id: 3, name: 'Client Deliverables', color: 'purple' }
        ],
        customFieldDefinitions: []
    },
    { 
        id: 2, 
        name: 'Annual Fuel Audit', 
        client: 'XYZ Industries', 
        type: 'Audit', 
        status: 'Active', 
        startDate: '2024-02-01', 
        dueDate: '2024-02-28', 
        progress: 90, 
        assignedTo: 'David Buttemer',
        tasks: [],
        taskLists: [
            { id: 1, name: 'To Do', color: 'blue' }
        ],
        customFieldDefinitions: []
    },
    { 
        id: 3, 
        name: 'Cost Analysis Study', 
        client: 'Logistics Ltd', 
        type: 'Monthly Review', 
        status: 'Active', 
        startDate: '2024-03-01', 
        dueDate: '2024-04-30', 
        progress: 25, 
        assignedTo: 'Gareth Mauck',
        tasks: [],
        taskLists: [
            { id: 1, name: 'Main Tasks', color: 'blue' }
        ],
        customFieldDefinitions: []
    }
];

const Projects = () => {
    const [projects, setProjects] = useState(initialProjects);
    const [showModal, setShowModal] = useState(false);
    const [selectedProject, setSelectedProject] = useState(null);
    const [viewingProject, setViewingProject] = useState(null);
    const [showProgressTracker, setShowProgressTracker] = useState(false);
    const [draggedProject, setDraggedProject] = useState(null);
    const [selectedClient, setSelectedClient] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    
    // Ensure storage is available
    useEffect(() => {
        if (!window.storage) {
            console.error('❌ Projects: Storage not available! Make sure localStorage.js is loaded before Projects component.');
            // Try to wait for storage to be available
            const checkStorage = () => {
                if (window.storage) {
                    console.log('✅ Projects: Storage became available');
                } else {
                    setTimeout(checkStorage, 100);
                }
            };
            checkStorage();
        } else {
            console.log('✅ Projects: Storage is available');
        }
    }, []);
    
    // Load projects from localStorage on mount
    useEffect(() => {
        const loadProjects = () => {
            if (window.storage && typeof window.storage.getProjects === 'function') {
                try {
                    const savedProjects = window.storage.getProjects();
                    if (savedProjects) {
                        setProjects(savedProjects);
                        
                        // Sync existing projects with clients
                        syncProjectsWithClients(savedProjects);
                        
                        // Check if there's a project to open immediately after loading
                        const projectIdToOpen = sessionStorage.getItem('openProjectId');
                        if (projectIdToOpen) {
                            const project = savedProjects.find(p => p.id === parseInt(projectIdToOpen));
                            if (project) {
                                // Open the project immediately
                                setViewingProject(project);
                                // Clear the flag
                                sessionStorage.removeItem('openProjectId');
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error loading projects from storage:', error);
                }
            } else {
                console.warn('Storage not available or getProjects method not found, retrying...');
                // Retry after a short delay
                setTimeout(loadProjects, 100);
            }
        };

        // Listen for storage ready event
        const handleStorageReady = () => {
            console.log('✅ Projects: Storage ready event received');
            loadProjects();
        };

        // Check if storage is already ready
        if (window.storage && typeof window.storage.getProjects === 'function') {
            loadProjects();
        } else {
            // Wait for storage ready event
            window.addEventListener('storageReady', handleStorageReady);
        }

        return () => {
            window.removeEventListener('storageReady', handleStorageReady);
        };
    }, []);

    // Helper function to sync existing projects with clients
    const syncProjectsWithClients = (projectsList) => {
        if (window.storage && typeof window.storage.getClients === 'function' && typeof window.storage.setClients === 'function') {
            const clients = window.storage.getClients() || [];
            const updatedClients = clients.map(client => {
                const clientProjects = projectsList.filter(p => p.client === client.name);
                const projectIds = clientProjects.map(p => p.id);
                return {
                    ...client,
                    projectIds: projectIds
                };
            });
            window.storage.setClients(updatedClients);
            
            // Dispatch event to notify other components
            window.dispatchEvent(new CustomEvent('clientsUpdated'));
        }
    };
    
    // Save projects to localStorage whenever they change (sorted by client)
    useEffect(() => {
        const sortedProjects = [...projects].sort((a, b) => a.client.localeCompare(b.client));
        
        // Wait for storage to be available
        const saveProjects = () => {
            if (window.storage && typeof window.storage.setProjects === 'function') {
                try {
                    window.storage.setProjects(sortedProjects);
                } catch (error) {
                    console.error('Error saving projects to storage:', error);
                }
            } else {
                console.warn('Storage not available or setProjects method not found, retrying...');
                // Retry after a short delay
                setTimeout(saveProjects, 100);
            }
        };

        // Listen for storage ready event
        const handleStorageReady = () => {
            console.log('✅ Projects: Storage ready for saving');
            saveProjects();
        };

        // Check if storage is already ready
        if (window.storage && typeof window.storage.setProjects === 'function') {
            saveProjects();
        } else {
            // Wait for storage ready event
            window.addEventListener('storageReady', handleStorageReady);
        }

        return () => {
            window.removeEventListener('storageReady', handleStorageReady);
        };
    }, [projects]);

    // Helper function to count all nested subtasks
    const countAllSubtasks = (subtasks) => {
        if (!subtasks || subtasks.length === 0) return 0;
        let count = subtasks.length;
        subtasks.forEach(st => {
            if (st.subtasks && st.subtasks.length > 0) {
                count += countAllSubtasks(st.subtasks);
            }
        });
        return count;
    };

    const handleAddProject = () => {
        setSelectedProject(null);
        setShowModal(true);
    };

    const handleEditProject = (project) => {
        setSelectedProject(project);
        setShowModal(true);
    };

    const handleViewProject = (project) => {
        console.log('Viewing project:', project);
        console.log('ProjectDetail component exists:', !!ProjectDetail);
        try {
            setViewingProject(project);
        } catch (error) {
            console.error('Error setting viewingProject:', error);
            alert('Error opening project: ' + error.message);
        }
    };

    const handleSaveProject = (projectData) => {
        if (selectedProject) {
            // Editing existing project - preserve tasks and lists
            const updatedProjects = projects.map(p => 
                p.id === selectedProject.id 
                    ? { ...p, ...projectData }
                    : p
            );
            setProjects(updatedProjects);
            
            // Update client's projectIds if client changed
            if (projectData.client && projectData.client !== selectedProject.client) {
                updateClientProjectIds(selectedProject.client, projectData.client, selectedProject.id);
            }
        } else {
            // Creating new project - start with empty tasks
            const newProject = {
                id: Math.max(0, ...projects.map(p => p.id)) + 1,
                ...projectData,
                status: 'Active',
                progress: 0,
                tasks: [], // Empty tasks for new project
                taskLists: [ // Default task lists
                    { id: 1, name: 'To Do', color: 'blue' }
                ],
                customFieldDefinitions: [] // Empty custom fields
            };
            setProjects([...projects, newProject]);
            
            // Update client's projectIds for new project
            if (projectData.client) {
                updateClientProjectIds(null, projectData.client, newProject.id);
            }
        }
        setShowModal(false);
        setSelectedProject(null);
    };

    // Helper function to update client's projectIds
    const updateClientProjectIds = (oldClientName, newClientName, projectId) => {
        try {
            if (window.storage && typeof window.storage.getClients === 'function' && typeof window.storage.setClients === 'function') {
                const clients = window.storage.getClients() || [];
                const updatedClients = clients.map(client => {
                    if (oldClientName && client.name === oldClientName) {
                        // Remove project from old client
                        return {
                            ...client,
                            projectIds: (client.projectIds || []).filter(id => id !== projectId)
                        };
                    }
                    if (newClientName && client.name === newClientName) {
                        // Add project to new client
                        const projectIds = client.projectIds || [];
                        if (!projectIds.includes(projectId)) {
                            return {
                                ...client,
                                projectIds: [...projectIds, projectId]
                            };
                        }
                    }
                    return client;
                });
                window.storage.setClients(updatedClients);
                
                // Dispatch event to notify other components
                window.dispatchEvent(new CustomEvent('clientsUpdated'));
            } else {
                console.warn('Storage not available for updating client project IDs');
            }
        } catch (error) {
            console.error('Error updating client project IDs:', error);
        }
    };

    const handleDeleteProject = (projectId) => {
        if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
            const projectToDelete = projects.find(p => p.id === projectId);
            setProjects(projects.filter(p => p.id !== projectId));
            
            // Remove project from client's projectIds
            if (projectToDelete && projectToDelete.client) {
                updateClientProjectIds(projectToDelete.client, null, projectId);
            }
        }
    };

    // Get unique clients from projects
    const uniqueClients = [...new Set(projects.map(p => p.client))].sort();

    // Filter projects by selected client, search term, status and sort alphabetically by client name
    const filteredProjects = projects.filter(p => {
        const matchesClient = selectedClient === 'all' || p.client === selectedClient;
        const matchesSearch = searchTerm === '' || 
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.client.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.assignedTo?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
        return matchesClient && matchesSearch && matchesStatus;
    }).sort((a, b) => a.client.localeCompare(b.client));

    if (showProgressTracker) {
        return <window.ProjectProgressTracker onBack={() => setShowProgressTracker(false)} />;
    }

    if (viewingProject) {
        try {
            if (!ProjectDetail) {
                console.error('ProjectDetail component not found!');
                return (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h2 className="text-lg font-semibold text-red-800 mb-2">Error: ProjectDetail component not loaded</h2>
                        <p className="text-sm text-red-600 mb-3">The ProjectDetail component is not available. Check the browser console for more details.</p>
                        <button 
                            onClick={() => setViewingProject(null)}
                            className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                        >
                            Back to Projects
                        </button>
                    </div>
                );
            }
            return <ProjectDetail project={viewingProject} onBack={() => setViewingProject(null)} />;
        } catch (error) {
            console.error('Error rendering ProjectDetail:', error);
            return (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h2 className="text-lg font-semibold text-red-800 mb-2">Error loading project</h2>
                    <p className="text-sm text-red-600 mb-3">{error.message}</p>
                    <button 
                        onClick={() => setViewingProject(null)}
                        className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium"
                    >
                        Back to Projects
                    </button>
                </div>
            );
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">Projects</h1>
                    <p className="text-xs text-gray-600">Manage and track all your projects</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowProgressTracker(true)}
                        className="px-3 py-1.5 border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors flex items-center text-sm font-medium"
                    >
                        <i className="fas fa-chart-line mr-1.5 text-xs"></i>
                        Progress Tracker
                    </button>
                    <button 
                        onClick={handleAddProject}
                        className="bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 transition-colors flex items-center text-sm font-medium"
                    >
                        <i className="fas fa-plus mr-1.5 text-xs"></i>
                        New Project
                    </button>
                </div>
            </div>

            {/* Search and Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search projects by name, client, type, or team member..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>
                    <select
                        value={selectedClient}
                        onChange={(e) => setSelectedClient(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Clients ({projects.length})</option>
                        {uniqueClients.map(client => {
                            const clientCount = projects.filter(p => p.client === client).length;
                            return (
                                <option key={client} value={client}>
                                    {client} ({clientCount})
                                </option>
                            );
                        })}
                    </select>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Statuses</option>
                        <option value="Active">Active</option>
                        <option value="In Progress">In Progress</option>
                        <option value="On Hold">On Hold</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                    </select>
                </div>
            </div>

            {/* Project Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredProjects.length === 0 ? (
                    <div className="col-span-full text-center py-12">
                        <i className="fas fa-filter text-4xl text-gray-300 mb-3"></i>
                        <p className="text-gray-500 text-sm mb-2">
                            {projects.length === 0 
                                ? 'No projects yet. Create your first project!' 
                                : 'No projects match your filters'}
                        </p>
                        {(searchTerm !== '' || selectedClient !== 'all' || filterStatus !== 'all') && (
                            <button
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedClient('all');
                                    setFilterStatus('all');
                                }}
                                className="mt-3 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                            >
                                <i className="fas fa-redo mr-1.5"></i>
                                Clear all filters
                            </button>
                        )}
                    </div>
                ) : null}
                {filteredProjects.map((project, index) => (
                    <div 
                        key={project.id}
                        draggable
                        onDragStart={(e) => {
                            setDraggedProject(index);
                            e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (draggedProject === null) return;
                            
                            const newProjects = [...filteredProjects];
                            const draggedItem = newProjects[draggedProject];
                            newProjects.splice(draggedProject, 1);
                            newProjects.splice(index, 0, draggedItem);
                            
                            // Update the original projects array with the new order
                            // We need to merge the reordered filtered projects back into the full list
                            const updatedProjects = projects.map(p => {
                                const filteredIndex = newProjects.findIndex(fp => fp.id === p.id);
                                return filteredIndex !== -1 ? newProjects[filteredIndex] : p;
                            });
                            setProjects(updatedProjects);
                            setDraggedProject(null);
                        }}
                        onDragEnd={() => setDraggedProject(null)}
                        onClick={() => handleViewProject(project)}
                        className="bg-white rounded-lg border border-gray-200 hover:border-primary-300 hover:shadow-md transition-all p-4 cursor-pointer"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                                <h3 className="font-semibold text-gray-900 text-sm mb-0.5">{project.name}</h3>
                                <p className="text-xs text-gray-500">{project.client}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                                    project.status === 'In Progress' ? 'bg-blue-100 text-blue-700' :
                                    project.status === 'Active' ? 'bg-green-100 text-green-700' :
                                    project.status === 'Completed' ? 'bg-purple-100 text-purple-700' :
                                    project.status === 'On Hold' ? 'bg-yellow-100 text-yellow-700' :
                                    project.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                                    'bg-gray-100 text-gray-700'
                                }`}>
                                    {project.status}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 mb-3">
                            <div className="flex items-center text-xs text-gray-600">
                                <i className="fas fa-tag mr-2 w-3 text-[10px]"></i>
                                {project.type}
                            </div>
                            <div className="flex items-center text-xs text-gray-600">
                                <i className="fas fa-calendar mr-2 w-3 text-[10px]"></i>
                                {project.startDate} - {project.dueDate}
                            </div>
                            <div className="flex items-center text-xs text-gray-600">
                                <i className="fas fa-user mr-2 w-3 text-[10px]"></i>
                                {project.assignedTo}
                            </div>
                            <div className="flex items-center text-xs text-gray-600">
                                <i className="fas fa-tasks mr-2 w-3 text-[10px]"></i>
                                {project.tasks?.length || 0} tasks • {countAllSubtasks(project.tasks?.flatMap(t => t.subtasks || []))} subtasks
                            </div>
                        </div>


                    </div>
                ))}
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <ProjectModal
                    project={selectedProject}
                    onSave={handleSaveProject}
                    onClose={() => {
                        setShowModal(false);
                        setSelectedProject(null);
                    }}
                />
            )}
        </div>
    );
};

// Make available globally
window.Projects = Projects;
