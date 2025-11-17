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

    const ensurePermissionValue = (permissionKey, fallback) => {
        return window.PERMISSIONS?.[permissionKey] || fallback;
    };
    
    const permissionCategories = (() => {
        let categories = {};
        if (window.PERMISSION_CATEGORIES && Object.keys(window.PERMISSION_CATEGORIES).length > 0) {
            categories = { ...window.PERMISSION_CATEGORIES };
        } else if (window.PERMISSIONS) {
            categories = {
                CRM: {
                    id: 'crm',
                    label: 'CRM',
                    permission: ensurePermissionValue('ACCESS_CRM', 'access_crm'),
                    description: 'Customer Relationship Management',
                    adminOnly: false
                },
                PROJECTS: {
                    id: 'projects',
                    label: 'Projects',
                    permission: ensurePermissionValue('ACCESS_PROJECTS', 'access_projects'),
                    description: 'Project Management',
                    adminOnly: false
                },
                TEAM: {
                    id: 'team',
                    label: 'Team',
                    permission: ensurePermissionValue('ACCESS_TEAM', 'access_team'),
                    description: 'Team Management',
                    adminOnly: false
                },
                USERS: {
                    id: 'users',
                    label: 'Users',
                    permission: ensurePermissionValue('ACCESS_USERS', 'access_users'),
                    description: 'User Management',
                    adminOnly: true
                },
                MANUFACTURING: {
                    id: 'manufacturing',
                    label: 'Manufacturing',
                    permission: ensurePermissionValue('ACCESS_MANUFACTURING', 'access_manufacturing'),
                    description: 'Manufacturing Operations',
                    adminOnly: false
                },
                SERVICE_MAINTENANCE: {
                    id: 'service_maintenance',
                    label: 'Service & Maintenance',
                    permission: ensurePermissionValue('ACCESS_SERVICE_MAINTENANCE', 'access_service_maintenance'),
                    description: 'Service & Maintenance Operations',
                    adminOnly: false
                },
                TOOL: {
                    id: 'tool',
                    label: 'Tool',
                    permission: ensurePermissionValue('ACCESS_TOOL', 'access_tool'),
                    description: 'Tool Management',
                    adminOnly: false
                },
                REPORTS: {
                    id: 'reports',
                    label: 'Reports',
                    permission: ensurePermissionValue('ACCESS_REPORTS', 'access_reports'),
                    description: 'Reports and Analytics',
                    adminOnly: false
                }
            };
        }
        
        if (Object.keys(categories).length > 0) {
            if (!categories.DOCUMENTS) {
                categories.DOCUMENTS = {
                    id: 'documents',
                    label: 'Documents',
                    permission: ensurePermissionValue('ACCESS_DOCUMENTS', 'access_documents'),
                    description: 'Shared document library and uploads',
                    adminOnly: false
                };
            }
            if (!categories.LEAVE_PLATFORM) {
                categories.LEAVE_PLATFORM = {
                    id: 'leave_platform',
                    label: 'Leave Platform',
                    permission: ensurePermissionValue('ACCESS_LEAVE_PLATFORM', 'access_leave_platform'),
                    description: 'Employee leave management workspace',
                    adminOnly: false
                };
            }
        }
        
        return categories;
    })();

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
            
            // Parse permissions from user.permissions (API returns it as an array or JSON string)
            let permissions = [];
            if (user.permissions) {
                if (typeof user.permissions === 'string') {
                    try {
                        permissions = JSON.parse(user.permissions);
                        if (!Array.isArray(permissions)) {
                            permissions = [];
                        }
                    } catch (e) {
                        permissions = [];
                    }
                } else if (Array.isArray(user.permissions)) {
                    permissions = user.permissions;
                }
            } else if (user.customPermissions) {
                // Fallback to customPermissions for backward compatibility
                permissions = Array.isArray(user.customPermissions) ? user.customPermissions : [];
            }
            
            setFormData({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                role: user.role || 'user',
                department: user.department || '',
                status: user.status || 'Active',
                customPermissions: permissions,
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

    const handlePermissionToggle = (permissionKey) => {
        // Get all available permissions from categories
        const allPermissions = Object.values(permissionCategories)
            .map(cat => cat.permission)
            .concat(
                permissionCategories.TEAM?.subcategories?.map(sub => sub.permission) || []
            );
        
        // If customPermissions is empty (default state), initialize with all permissions
        let currentPermissions = formData.customPermissions;
        if (currentPermissions.length === 0) {
            // Initialize with all permissions except admin-only ones if user is not admin
            const isAdmin = formData.role?.toLowerCase() === 'admin';
            currentPermissions = allPermissions.filter(perm => {
                const category = Object.values(permissionCategories).find(cat => cat.permission === perm);
                return !category?.adminOnly || isAdmin;
            });
        }
        
        // Toggle the permission
        const isSelected = currentPermissions.includes(permissionKey);
        const updatedPermissions = isSelected
            ? currentPermissions.filter(p => p !== permissionKey)
            : [...currentPermissions, permissionKey];
        
        setFormData({ ...formData, customPermissions: updatedPermissions });
    };
    
    // Check if a permission category is enabled
    const isPermissionEnabled = (category) => {
        // Admin-only categories can only be enabled for admins
        if (category.adminOnly && formData.role?.toLowerCase() !== 'admin') {
            return false;
        }
        
        // If no custom permissions are set, all non-admin-only permissions are enabled by default
        // If custom permissions are set, only explicitly listed permissions are enabled
        if (formData.customPermissions.length === 0) {
            // Default: all permissions are enabled (except admin-only for non-admins)
            return true;
        }
        
        // Custom permissions are set: check if this permission is explicitly included
        return formData.customPermissions.includes(category.permission);
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
                                    <p className="text-xs text-gray-600 mb-3">
                                        By default, all users have access to most modules. Use custom permissions to restrict or grant specific access. Only Admins can access Users module.
                                    </p>
                                    {Object.values(permissionCategories).map((category) => {
                                        const canEdit = !category.adminOnly || isAdmin;
                                        const isEnabled = isPermissionEnabled(category);
                                        const isLocked = category.adminOnly && !isAdmin;
                                        
                                        return (
                                            <label
                                                key={category.id}
                                                className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${
                                                    isLocked
                                                        ? 'border-gray-300 bg-gray-100 opacity-60 cursor-not-allowed'
                                                        : isEnabled
                                                        ? 'border-primary-200 bg-primary-50'
                                                        : 'border-gray-200 bg-white hover:bg-gray-50'
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isEnabled}
                                                    onChange={() => canEdit && handlePermissionToggle(category.permission)}
                                                    disabled={isLocked}
                                                    className="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                                />
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-xs font-semibold text-gray-700">
                                                            {category.label}
                                                        </span>
                                                        {category.adminOnly && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                                                                Admin Only
                                                            </span>
                                                        )}
                                                        {isEnabled && (
                                                            <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                                                Enabled
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-gray-500">
                                                        {category.description}
                                                    </p>
                                                    {isLocked && (
                                                        <p className="text-[10px] text-red-600 mt-1">
                                                            <i className="fas fa-lock mr-1"></i>
                                                            Requires admin role
                                                        </p>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                    {Object.values(permissionCategories).some(cat => cat.subcategories) && (
                                        <div className="mt-4 pt-3 border-t border-gray-300">
                                            <h4 className="text-xs font-semibold text-gray-700 mb-2">Team Subcategories</h4>
                                            {permissionCategories.TEAM?.subcategories?.map((subcategory) => {
                                                const canEdit = isAdmin;
                                                const isEnabled = isPermissionEnabled(subcategory);
                                                
                                                return (
                                                    <label
                                                        key={subcategory.id}
                                                        className="flex items-start gap-3 p-2 rounded border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer transition-colors mb-2"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={isEnabled}
                                                            onChange={() => canEdit && handlePermissionToggle(subcategory.permission)}
                                                            disabled={!isAdmin}
                                                            className="mt-0.5 w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500 disabled:opacity-50"
                                                        />
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-medium text-gray-700">
                                                                    {subcategory.label}
                                                                </span>
                                                                {isEnabled && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                                                                        Enabled
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-[10px] text-gray-500 mt-0.5">
                                                                {subcategory.description}
                                                            </p>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
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
