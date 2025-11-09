// Get dependencies from window
const { useState, useEffect } = React;

const UserModal = ({ user, onClose, onSave, roleDefinitions, departments }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'user',
        department: '',
        status: 'Active',
        customPermissions: [],
        accessibleProjectIds: []
    });

    const [showPermissions, setShowPermissions] = useState(false);
    const [availableProjects, setAvailableProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(false);

    // Get permission categories from permissions.js
    const permissionCategories = window.PERMISSION_CATEGORIES || {};

    useEffect(() => {
        if (user) {
            // Parse accessibleProjectIds if it's a string
            let accessibleProjectIds = [];
            if (user.accessibleProjectIds) {
                if (typeof user.accessibleProjectIds === 'string') {
                    try {
                        accessibleProjectIds = JSON.parse(user.accessibleProjectIds);
                    } catch (e) {
                        accessibleProjectIds = [];
                    }
                } else if (Array.isArray(user.accessibleProjectIds)) {
                    accessibleProjectIds = user.accessibleProjectIds;
                }
            }
            
            setFormData({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                role: user.role || 'user',
                department: user.department || '',
                status: user.status || 'Active',
                customPermissions: user.customPermissions || [],
                accessibleProjectIds: accessibleProjectIds
            });
        }
    }, [user]);

    // Load projects when role is guest or when component mounts
    useEffect(() => {
        const loadProjects = async () => {
            if (formData.role === 'guest') {
                setLoadingProjects(true);
                try {
                    const token = window.storage?.getToken?.();
                    if (token && window.api && window.api.getProjects) {
                        const response = await window.api.getProjects();
                        let projects = [];
                        if (response?.data?.projects) {
                            projects = response.data.projects;
                        } else if (response?.projects) {
                            projects = response.projects;
                        } else if (Array.isArray(response?.data)) {
                            projects = response.data;
                        } else if (Array.isArray(response)) {
                            projects = response;
                        }
                        setAvailableProjects(projects);
                    }
                } catch (error) {
                    console.error('Error loading projects:', error);
                    setAvailableProjects([]);
                } finally {
                    setLoadingProjects(false);
                }
            }
        };
        
        loadProjects();
    }, [formData.role]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.name || !formData.email || !formData.role) {
            alert('Please fill in all required fields');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            alert('Please enter a valid email address');
            return;
        }

        onSave(formData);
    };

    const handlePermissionToggle = (permissionId) => {
        const isSelected = formData.customPermissions.includes(permissionId);
        const updatedPermissions = isSelected
            ? formData.customPermissions.filter(p => p !== permissionId)
            : [...formData.customPermissions, permissionId];
        
        setFormData({ ...formData, customPermissions: updatedPermissions });
    };

    const getRolePermissions = () => {
        const role = roleDefinitions[formData.role];
        if (!role) return [];
        if (role.permissions.includes('all')) return ['All permissions'];
        return role.permissions;
    };

    const isAdmin = formData.role?.toLowerCase() === 'admin';
    
    // Check if user has access to a permission category
    const hasCategoryAccess = (category) => {
        if (!category.adminOnly) return true; // Public categories
        return isAdmin; // Admin-only categories
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">
                            {user ? 'Edit User' : 'Add New User'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            {user ? 'Update user information and permissions' : 'Create a new user account'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    {/* Basic Information */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="John Doe"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Email Address <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="john.doe@example.com"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="+27 11 123 4567"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Status <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Role and Department */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-2">Role & Department</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Role <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    required
                                >
                                    {Object.entries(roleDefinitions).map(([key, role]) => (
                                        <option key={key} value={key}>
                                            {role.name} - {role.description}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-gray-500 mt-1">
                                    Default permissions: {getRolePermissions().join(', ')}
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Department
                                </label>
                                <select
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option value="">Select Department</option>
                                    {departments.sort((a, b) => a.localeCompare(b)).map(dept => (
                                        <option key={dept} value={dept}>{dept}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Project Access (for Guest users) */}
                    {formData.role === 'guest' && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-2">Project Access</h3>
                            <p className="text-xs text-gray-600 mb-3">
                                Select which projects this guest user can view. Guest users can only access the Projects section.
                            </p>
                            {loadingProjects ? (
                                <div className="text-center py-4 text-gray-500 text-xs">
                                    <i className="fas fa-spinner fa-spin mr-2"></i>
                                    Loading projects...
                                </div>
                            ) : availableProjects.length === 0 ? (
                                <div className="text-center py-4 text-gray-500 text-xs">
                                    No projects available. Create projects first before assigning guest access.
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-60 overflow-y-auto">
                                    <div className="space-y-2">
                                        {availableProjects.map(project => {
                                            const isSelected = formData.accessibleProjectIds.includes(project.id);
                                            return (
                                                <label
                                                    key={project.id}
                                                    className="flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-gray-100"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setFormData({
                                                                    ...formData,
                                                                    accessibleProjectIds: [...formData.accessibleProjectIds, project.id]
                                                                });
                                                            } else {
                                                                setFormData({
                                                                    ...formData,
                                                                    accessibleProjectIds: formData.accessibleProjectIds.filter(id => id !== project.id)
                                                                });
                                                            }
                                                        }}
                                                        className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                                    />
                                                    <span className="text-xs text-gray-700 flex-1">
                                                        {project.name}
                                                        {project.clientName && (
                                                            <span className="text-gray-500 ml-1">({project.clientName})</span>
                                                        )}
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Permissions */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-900">Custom Permissions</h3>
                            <button
                                type="button"
                                onClick={() => setShowPermissions(!showPermissions)}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                            >
                                {showPermissions ? 'Hide' : 'Show'} Permissions
                            </button>
                        </div>

                        {showPermissions && (
                            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                <div className="space-y-3">
                                    <p className="text-xs text-gray-600">
                                        All users have access to CRM, Projects, Team, Manufacturing, Documents, Leave Platform, Tool, Reports, and HR. Only Admins can access Users.
                                    </p>
                                    {Object.values(permissionCategories).map((category) => {
                                        const hasAccess = hasCategoryAccess(category);
                                        const isChecked = hasAccess;
                                        
                                        return (
                                            <div 
                                                key={category.id}
                                                className={`p-2 rounded border ${
                                                    category.adminOnly && !isAdmin 
                                                        ? 'border-gray-300 bg-gray-100 opacity-60' 
                                                        : 'border-gray-200 bg-white'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-semibold text-gray-700">
                                                            {category.label}
                                                        </span>
                                                        {category.adminOnly && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                                                                Admin Only
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-xs ${isChecked ? 'text-green-600' : 'text-gray-400'}`}>
                                                            {isChecked ? 'Enabled' : 'Disabled'}
                                                        </span>
                                                        {category.adminOnly && !isAdmin && (
                                                            <i className="fas fa-lock text-xs text-red-500"></i>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-gray-500 mt-1">
                                                    {category.description}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                            {user ? 'Update User' : 'Create User'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.UserModal = UserModal;
