// Get dependencies from window
const { useState, useEffect } = React;

const UserModal = ({ user, onClose, onSave, roleDefinitions, departments }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        role: 'team_member',
        department: '',
        status: 'Active',
        customPermissions: []
    });

    const [showPermissions, setShowPermissions] = useState(false);

    // All available permissions
    const allPermissions = [
        { id: 'view_all', label: 'View All Data', category: 'General' },
        { id: 'view_assigned', label: 'View Assigned Items', category: 'General' },
        { id: 'edit_assigned', label: 'Edit Assigned Items', category: 'General' },
        
        { id: 'manage_users', label: 'Manage Users', category: 'Administration' },
        { id: 'manage_roles', label: 'Manage Roles', category: 'Administration' },
        { id: 'system_settings', label: 'System Settings', category: 'Administration' },
        
        { id: 'edit_projects', label: 'Edit Projects', category: 'Projects' },
        { id: 'view_projects', label: 'View Projects', category: 'Projects' },
        { id: 'manage_tasks', label: 'Manage Tasks', category: 'Projects' },
        { id: 'delete_projects', label: 'Delete Projects', category: 'Projects' },
        
        { id: 'edit_clients', label: 'Edit Clients', category: 'CRM' },
        { id: 'view_clients', label: 'View Clients', category: 'CRM' },
        { id: 'manage_leads', label: 'Manage Leads', category: 'CRM' },
        
        { id: 'manage_invoicing', label: 'Manage Invoicing', category: 'Finance' },
        { id: 'view_invoices', label: 'View Invoices', category: 'Finance' },
        { id: 'manage_expenses', label: 'Manage Expenses', category: 'Finance' },
        { id: 'approve_expenses', label: 'Approve Expenses', category: 'Finance' },
        
        { id: 'time_tracking', label: 'Time Tracking', category: 'Operations' },
        { id: 'view_team', label: 'View Team', category: 'Operations' },
        { id: 'manage_team', label: 'Manage Team', category: 'Operations' },
        
        { id: 'view_reports', label: 'View Reports', category: 'Reporting' },
        { id: 'export_data', label: 'Export Data', category: 'Reporting' },
    ];

    useEffect(() => {
        if (user) {
            setFormData({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                role: user.role || 'team_member',
                department: user.department || '',
                status: user.status || 'Active',
                customPermissions: user.customPermissions || []
            });
        }
    }, [user]);

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

    const hasPermission = (permissionId) => {
        const role = roleDefinitions[formData.role];
        if (role?.permissions.includes('all')) return true;
        return formData.customPermissions.includes(permissionId) || 
               role?.permissions.includes(permissionId);
    };

    // Group permissions by category
    const groupedPermissions = allPermissions.reduce((acc, perm) => {
        if (!acc[perm.category]) {
            acc[perm.category] = [];
        }
        acc[perm.category].push(perm);
        return acc;
    }, {});

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
                                {formData.role === 'admin' ? (
                                    <div className="text-center py-4">
                                        <i className="fas fa-shield-alt text-3xl text-red-600 mb-2"></i>
                                        <p className="text-sm font-medium text-gray-900">Administrator</p>
                                        <p className="text-xs text-gray-600 mt-1">This role has full system access</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-xs text-gray-600">
                                            Select additional permissions beyond the default role permissions:
                                        </p>
                                        {Object.entries(groupedPermissions).map(([category, perms]) => (
                                            <div key={category}>
                                                <h4 className="text-xs font-semibold text-gray-700 mb-1.5">{category}</h4>
                                                <div className="space-y-1">
                                                    {perms.map(perm => {
                                                        const isRoleDefault = roleDefinitions[formData.role]?.permissions.includes(perm.id);
                                                        const isCustom = formData.customPermissions.includes(perm.id);
                                                        const isChecked = isRoleDefault || isCustom;

                                                        return (
                                                            <label
                                                                key={perm.id}
                                                                className={`flex items-center gap-2 p-1.5 rounded cursor-pointer ${
                                                                    isRoleDefault ? 'bg-blue-50' : 'hover:bg-gray-100'
                                                                }`}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isChecked}
                                                                    onChange={() => !isRoleDefault && handlePermissionToggle(perm.id)}
                                                                    disabled={isRoleDefault}
                                                                    className="w-3.5 h-3.5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                                                />
                                                                <span className="text-xs text-gray-700 flex-1">
                                                                    {perm.label}
                                                                    {isRoleDefault && (
                                                                        <span className="ml-1.5 text-[10px] text-blue-600">(Role default)</span>
                                                                    )}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
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
