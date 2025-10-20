// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const Users = () => {
    const [users, setUsers] = useState([]);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [invitations, setInvitations] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'

    // Role definitions with permissions
    const roleDefinitions = {
        admin: {
            name: 'Administrator',
            color: 'red',
            permissions: ['all'],
            description: 'Full system access'
        },
        manager: {
            name: 'Manager',
            color: 'blue',
            permissions: ['view_all', 'edit_projects', 'edit_clients', 'view_reports', 'manage_team'],
            description: 'Manage projects and teams'
        },
        accountant: {
            name: 'Accountant',
            color: 'green',
            permissions: ['view_all', 'manage_invoicing', 'view_reports', 'manage_expenses'],
            description: 'Financial management'
        },
        project_manager: {
            name: 'Project Manager',
            color: 'purple',
            permissions: ['view_projects', 'edit_projects', 'manage_tasks', 'view_team', 'time_tracking'],
            description: 'Manage assigned projects'
        },
        team_member: {
            name: 'Team Member',
            color: 'orange',
            permissions: ['view_assigned', 'edit_assigned', 'time_tracking'],
            description: 'Work on assigned tasks'
        },
        viewer: {
            name: 'Viewer',
            color: 'gray',
            permissions: ['view_assigned'],
            description: 'Read-only access'
        }
    };

    // Department list
    const departments = [
        'Management',
        'Technical',
        'Support',
        'Data Analytics',
        'Finance',
        'Business Development',
        'Commercial',
        'Compliance'
    ];

    useEffect(() => {
        loadUsers();
        loadInvitations();
    }, []);

    const loadUsers = () => {
        let savedUsers = storage.getUsers() || [];
        
		// Do not seed default users; keep empty until created via UI/API
		if (savedUsers.length === 0) {
			savedUsers = [];
			storage.setUsers(savedUsers);
		}
        
        setUsers(savedUsers);
    };

    const loadInvitations = () => {
        const savedInvitations = storage.getInvitations() || [];
        setInvitations(savedInvitations);
    };

    const handleAddUser = () => {
        setSelectedUser(null);
        setShowUserModal(true);
    };

    const handleInviteUser = () => {
        setShowInviteModal(true);
    };

    const handleEditUser = (user) => {
        setSelectedUser(user);
        setShowUserModal(true);
    };

    const handleDeleteUser = (user) => {
        if (confirm(`Are you sure you want to delete ${user.name}?`)) {
            const updatedUsers = users.filter(u => u.id !== user.id);
            setUsers(updatedUsers);
            storage.setUsers(updatedUsers);
        }
    };

    const handleToggleStatus = (user) => {
        const updatedUsers = users.map(u => 
            u.id === user.id 
                ? { ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' }
                : u
        );
        setUsers(updatedUsers);
        storage.setUsers(updatedUsers);
    };

    const handleSaveUser = (userData) => {
        if (selectedUser) {
            // Update existing user
            const updatedUsers = users.map(u => 
                u.id === selectedUser.id ? { ...userData, id: selectedUser.id } : u
            );
            setUsers(updatedUsers);
            storage.setUsers(updatedUsers);
        } else {
            // Add new user
            const newUser = {
                ...userData,
                id: Date.now().toString(),
                createdAt: new Date().toISOString()
            };
            const updatedUsers = [...users, newUser];
            setUsers(updatedUsers);
            storage.setUsers(updatedUsers);
        }
        setShowUserModal(false);
    };

    const handleSaveInvitation = (invitationData) => {
        const newInvitation = {
            ...invitationData,
            id: Date.now().toString(),
            status: 'pending',
            token: generateInviteToken(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        };
        
        const updatedInvitations = [...invitations, newInvitation];
        setInvitations(updatedInvitations);
        storage.setInvitations(updatedInvitations);
        
        // Simulate sending email (in real app, this would call an API)
        console.log('Sending invitation email to:', invitationData.email);
        console.log('Invitation token:', newInvitation.token);
        
        setShowInviteModal(false);
        
        // Show success message
        alert(`Invitation sent to ${invitationData.email}! They will receive an email with instructions to create their account.`);
    };

    const generateInviteToken = () => {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    };

    const handleResendInvitation = (invitation) => {
        console.log('Resending invitation to:', invitation.email);
        alert(`Invitation resent to ${invitation.email}!`);
    };

    const handleCancelInvitation = (invitationId) => {
        if (confirm('Are you sure you want to cancel this invitation?')) {
            const updatedInvitations = invitations.filter(inv => inv.id !== invitationId);
            setInvitations(updatedInvitations);
            storage.setInvitations(updatedInvitations);
        }
    };

    // Filter users
    const filteredUsers = users.filter(user => {
        const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            user.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = filterRole === 'all' || user.role === filterRole;
        const matchesStatus = filterStatus === 'all' || user.status === filterStatus;
        return matchesSearch && matchesRole && matchesStatus;
    });

    // Get user count by role
    const getUserCountByRole = (role) => {
        return users.filter(u => u.role === role).length;
    };

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-gray-900">User Management</h1>
                    <p className="text-xs text-gray-600">Manage users, roles, and permissions</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleInviteUser}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-xs font-medium"
                    >
                        <i className="fas fa-envelope mr-1.5"></i>
                        Invite User
                    </button>
                    <button
                        onClick={handleAddUser}
                        className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs font-medium"
                    >
                        <i className="fas fa-plus mr-1.5"></i>
                        Add User
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Total Users</p>
                            <p className="text-xl font-bold text-gray-900">{users.length}</p>
                        </div>
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-users text-blue-600"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Active Users</p>
                            <p className="text-xl font-bold text-gray-900">
                                {users.filter(u => u.status === 'Active').length}
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-user-check text-green-600"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Administrators</p>
                            <p className="text-xl font-bold text-gray-900">
                                {getUserCountByRole('admin')}
                            </p>
                        </div>
                        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-user-shield text-red-600"></i>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-0.5">Departments</p>
                            <p className="text-xl font-bold text-gray-900">{departments.length}</p>
                        </div>
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i className="fas fa-building text-purple-600"></i>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters and Search */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Search users by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                        <i className="fas fa-search absolute left-2.5 top-2 text-gray-400 text-xs"></i>
                    </div>

                    {/* Role Filter */}
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Roles</option>
                        {Object.keys(roleDefinitions).map(role => (
                            <option key={role} value={role}>{roleDefinitions[role].name}</option>
                        ))}
                    </select>

                    {/* Status Filter */}
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>

                    {/* View Mode Toggle */}
                    <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-2.5 py-1.5 text-xs ${
                                viewMode === 'grid'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <i className="fas fa-th"></i>
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`px-2.5 py-1.5 text-xs border-l border-gray-300 ${
                                viewMode === 'table'
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <i className="fas fa-list"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Users Display */}
            {viewMode === 'grid' ? (
                // Grid View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredUsers.length > 0 ? (
                        filteredUsers.map(user => {
                            const role = roleDefinitions[user.role];
                            return (
                                <div key={user.id} className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-10 h-10 rounded-full bg-${role?.color || 'gray'}-100 flex items-center justify-center`}>
                                                <span className={`text-${role?.color || 'gray'}-600 font-semibold text-sm`}>
                                                    {user.name.charAt(0)}
                                                </span>
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-gray-900 text-sm">{user.name}</h3>
                                                <p className="text-xs text-gray-500">{user.email}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleStatus(user)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center ${
                                                user.status === 'Active'
                                                    ? 'bg-green-100 text-green-600'
                                                    : 'bg-gray-100 text-gray-400'
                                            }`}
                                            title={user.status === 'Active' ? 'Deactivate' : 'Activate'}
                                        >
                                            <i className={`fas fa-${user.status === 'Active' ? 'check' : 'times'} text-xs`}></i>
                                        </button>
                                    </div>

                                    <div className="space-y-1.5 mb-3">
                                        <div className="flex items-center gap-2 text-xs">
                                            <i className="fas fa-user-tag text-gray-400 w-3"></i>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-${role?.color || 'gray'}-100 text-${role?.color || 'gray'}-700`}>
                                                {role?.name || user.role}
                                            </span>
                                        </div>
                                        {user.department && (
                                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                                <i className="fas fa-building text-gray-400 w-3"></i>
                                                <span>{user.department}</span>
                                            </div>
                                        )}
                                        {user.phone && (
                                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                                <i className="fas fa-phone text-gray-400 w-3"></i>
                                                <span>{user.phone}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-1.5 pt-2 border-t border-gray-200">
                                        <button
                                            onClick={() => handleEditUser(user)}
                                            className="flex-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition font-medium"
                                        >
                                            <i className="fas fa-edit mr-1"></i>
                                            Edit
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="col-span-full text-center py-12">
                            <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                            <p className="text-sm text-gray-500">No users found</p>
                            <button
                                onClick={handleAddUser}
                                className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                            >
                                Add First User
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                // Table View
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">User</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Email</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Role</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Department</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {filteredUsers.length > 0 ? (
                                    filteredUsers.map(user => {
                                        const role = roleDefinitions[user.role];
                                        return (
                                            <tr key={user.id} className="hover:bg-gray-50">
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-8 h-8 rounded-full bg-${role?.color || 'gray'}-100 flex items-center justify-center`}>
                                                            <span className={`text-${role?.color || 'gray'}-600 font-semibold text-xs`}>
                                                                {user.name.charAt(0)}
                                                            </span>
                                                        </div>
                                                        <span className="font-medium text-gray-900 text-sm">{user.name}</span>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2 text-xs text-gray-600">{user.email}</td>
                                                <td className="px-3 py-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-${role?.color || 'gray'}-100 text-${role?.color || 'gray'}-700`}>
                                                        {role?.name || user.role}
                                                    </span>
                                                </td>
                                                <td className="px-3 py-2 text-xs text-gray-600">{user.department || '-'}</td>
                                                <td className="px-3 py-2">
                                                    <button
                                                        onClick={() => handleToggleStatus(user)}
                                                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                                            user.status === 'Active'
                                                                ? 'bg-green-100 text-green-700'
                                                                : 'bg-gray-100 text-gray-600'
                                                        }`}
                                                    >
                                                        {user.status}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleEditUser(user)}
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteUser(user)}
                                                            className="p-1 text-gray-400 hover:text-red-600 transition"
                                                            title="Delete"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center text-gray-400">
                                            <i className="fas fa-users text-4xl mb-3 opacity-50"></i>
                                            <p className="text-sm">No users found</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Pending Invitations */}
            {invitations.filter(inv => inv.status === 'pending').length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900">Pending Invitations</h3>
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
                            {invitations.filter(inv => inv.status === 'pending').length} pending
                        </span>
                    </div>
                    <div className="space-y-2">
                        {invitations.filter(inv => inv.status === 'pending').map(invitation => (
                            <div key={invitation.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                                        <i className="fas fa-envelope text-yellow-600 text-xs"></i>
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
                                        <p className="text-xs text-gray-500">
                                            Invited as {roleDefinitions[invitation.role]?.name || invitation.role} • 
                                            {invitation.department && ` ${invitation.department} •`}
                                            Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleResendInvitation(invitation)}
                                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                                        title="Resend Invitation"
                                    >
                                        <i className="fas fa-redo mr-1"></i>
                                        Resend
                                    </button>
                                    <button
                                        onClick={() => handleCancelInvitation(invitation.id)}
                                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                                        title="Cancel Invitation"
                                    >
                                        <i className="fas fa-times mr-1"></i>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* User Modal */}
            {showUserModal && (
                <window.UserModal
                    user={selectedUser}
                    onClose={() => setShowUserModal(false)}
                    onSave={handleSaveUser}
                    roleDefinitions={roleDefinitions}
                    departments={departments}
                />
            )}

            {/* Invitation Modal */}
            {showInviteModal && (
                <window.InviteUserModal
                    onClose={() => setShowInviteModal(false)}
                    onSave={handleSaveInvitation}
                    roleDefinitions={roleDefinitions}
                    departments={departments}
                />
            )}
        </div>
    );
};

// Make available globally
window.Users = Users;
