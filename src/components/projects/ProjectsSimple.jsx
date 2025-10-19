// Simple Projects Component - No API calls, loads immediately
const { useState, useEffect } = React;

const ProjectsSimple = () => {
    const [projects, setProjects] = useState([]);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newProject, setNewProject] = useState({
        name: '',
        client: '',
        status: 'Active',
        startDate: '',
        dueDate: '',
        description: ''
    });

    useEffect(() => {
        // Check authentication status
        const token = window.storage?.getToken?.();
        setIsAuthenticated(!!token);
    }, []);

    const handleAddProject = () => {
        if (newProject.name && newProject.client) {
            const project = {
                id: Date.now(),
                ...newProject,
                createdAt: new Date().toISOString()
            };
            setProjects(prev => [...prev, project]);
            setNewProject({
                name: '',
                client: '',
                status: 'Active',
                startDate: '',
                dueDate: '',
                description: ''
            });
            setShowAddForm(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
                    <p className="text-gray-600">
                        {isAuthenticated ? 'Manage your projects' : 'Please log in to manage projects'}
                    </p>
                </div>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <i className="fas fa-plus mr-2"></i>
                    Add Project
                </button>
            </div>

            {/* Add Project Form */}
            {showAddForm && (
                <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Project</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                            <input
                                type="text"
                                value={newProject.name}
                                onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter project name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
                            <input
                                type="text"
                                value={newProject.client}
                                onChange={(e) => setNewProject({...newProject, client: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                placeholder="Enter client name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select
                                value={newProject.status}
                                onChange={(e) => setNewProject({...newProject, status: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            >
                                <option value="Active">Active</option>
                                <option value="In Progress">In Progress</option>
                                <option value="Completed">Completed</option>
                                <option value="On Hold">On Hold</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input
                                type="date"
                                value={newProject.startDate}
                                onChange={(e) => setNewProject({...newProject, startDate: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                            <input
                                type="date"
                                value={newProject.dueDate}
                                onChange={(e) => setNewProject({...newProject, dueDate: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                value={newProject.description}
                                onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                rows="3"
                                placeholder="Enter project description"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-3 mt-4">
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAddProject}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Add Project
                        </button>
                    </div>
                </div>
            )}

            {/* Projects List */}
            {projects.length > 0 ? (
                <div className="bg-white rounded-lg shadow">
                    <div className="px-6 py-4 border-b border-gray-200">
                        <h3 className="text-lg font-medium text-gray-900">Your Projects</h3>
                    </div>
                    <div className="p-6">
                        <div className="space-y-4">
                            {projects.map(project => (
                                <div key={project.id} className="border border-gray-200 rounded-lg p-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h4 className="font-medium text-gray-900">{project.name}</h4>
                                            <p className="text-sm text-gray-500">Client: {project.client}</p>
                                            {project.description && (
                                                <p className="text-sm text-gray-600 mt-1">{project.description}</p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                project.status === 'Active' ? 'bg-green-100 text-green-800' :
                                                project.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                                project.status === 'Completed' ? 'bg-gray-100 text-gray-800' :
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {project.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow">
                    <div className="p-6">
                        <div className="text-center py-12">
                            <i className="fas fa-project-diagram text-gray-300 text-4xl mb-4"></i>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
                            <p className="text-gray-500 mb-4">Get started by adding your first project</p>
                            <button 
                                onClick={() => setShowAddForm(true)}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                            >
                                Add Your First Project
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Message */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center">
                    <i className="fas fa-check-circle text-green-600 mr-3"></i>
                    <div>
                        <h3 className="text-sm font-medium text-green-800">Projects Section Ready</h3>
                        <p className="text-sm text-green-700 mt-1">
                            You can now add and manage projects. Data is stored locally for now.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.ProjectsSimple = ProjectsSimple;
