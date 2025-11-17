// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const Users = () => {
    const { user: currentUser } = window.useAuth ? window.useAuth() : { user: null };
    
    // Check if current user is admin (case-insensitive)
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
    
    const [users, setUsers] = useState([]);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const [invitations, setInvitations] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterRole, setFilterRole] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [viewMode, setViewMode] = useState('table'); // 'grid' or 'table'

    // Role definitions with permissions (Admin > Manager > User > Guest hierarchy)
    const roleDefinitions = {
        admin: {
            name: 'Administrator',
            color: 'red',
            permissions: ['all'],
            description: 'Full system access - Can manage users and all system settings'
        },
        manager: {
            name: 'Manager',
            color: 'blue',
            permissions: ['view_all', 'edit_projects', 'edit_clients', 'view_reports', 'manage_team'],
            description: 'Manage projects, teams, and assigned resources'
        },
        user: {
            name: 'User',
            color: 'orange',
            permissions: ['view_assigned', 'edit_assigned', 'time_tracking'],
            description: 'Standard user with assigned task access'
        },
        guest: {
            name: 'Guest',
            color: 'gray',
            permissions: ['view_projects', 'view_clients', 'edit_clients', 'manage_leads'],
            description: 'Limited access - Can view projects, clients, and leads'
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

    const loadUsers = async () => {
        try {
            // Try to load from API first
            const token = window.storage?.getToken?.();
            if (token) {
                const response = await fetch('/api/users', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const responseData = data.data || data;
                    const apiUsers = responseData.users || [];
                    // Always use API data when available, even if empty array
                    setUsers(apiUsers);
                    // Update local storage to match API data
                    storage.setUsers(apiUsers);
                    return;
                }
            }
            
            // Fallback to local storage only if API call fails
            let savedUsers = storage.getUsers() || [];
            if (savedUsers.length === 0) {
                savedUsers = [];
                storage.setUsers(savedUsers);
            }
            setUsers(savedUsers);
        } catch (error) {
            console.error('Error loading users:', error);
            // Fallback to local storage on error
            let savedUsers = storage.getUsers() || [];
            if (savedUsers.length === 0) {
                savedUsers = [];
                storage.setUsers(savedUsers);
            }
            setUsers(savedUsers);
        }
    };

    const loadInvitations = async () => {
        try {
            // Try to load from API first
            const token = window.storage?.getToken?.();
            if (token) {
                const response = await fetch('/api/users', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const responseData = data.data || data;
                    const apiInvitations = responseData.invitations || [];
                    if (apiInvitations.length > 0) {
                        setInvitations(apiInvitations);
                        return;
                    }
                }
            }
            
            // Fallback to local storage
            const savedInvitations = storage.getInvitations() || [];
            setInvitations(savedInvitations);
        } catch (error) {
            console.error('Error loading invitations:', error);
            // Fallback to local storage on error
            const savedInvitations = storage.getInvitations() || [];
            setInvitations(savedInvitations);
        }
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

    const handleDeleteUser = async (user) => {
        console.log('🔴 handleDeleteUser called with user:', user);
        
        if (!confirm(`Are you sure you want to delete ${user.name}?`)) {
            console.log('❌ User cancelled deletion');
            return;
        }
        
        console.log('✅ User confirmed deletion');

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            console.log('🗑️ Deleting user via API:', {
                userId: user.id,
                userName: user.name,
                userEmail: user.email,
                url: `/api/users/${user.id}`
            });
            
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('📡 Delete response status:', response.status, response.statusText);

            // Get response text first to see what we're dealing with
            const responseText = await response.text();
            console.log('📡 Delete response body:', responseText);

            if (!response.ok) {
                let errorData;
                try {
                    errorData = JSON.parse(responseText);
                } catch (e) {
                    errorData = { message: responseText || `Failed to delete user (Status: ${response.status})` };
                }
                console.error('❌ Delete failed:', errorData);
                alert(errorData.message || errorData.error || `Failed to delete user (Status: ${response.status})`);
                return;
            }

            // Parse response if it's JSON
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                data = { success: true, message: 'User deleted successfully' };
            }
            
            console.log('✅ User deleted successfully:', data);

            // Clear local storage cache to prevent stale data
            const currentUsers = users.filter(u => u.id !== user.id);
            storage.setUsers(currentUsers);
            
            // Reload users from API to reflect the deletion
            await loadUsers();
            
            alert('User deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting user:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            alert(`Failed to delete user: ${error.message}`);
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

    const handleSaveUser = async (userData) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            if (selectedUser) {
                // Update existing user via API
                console.log('📝 Updating user via API:', selectedUser.id);
                
                // Prepare accessibleProjectIds - ensure it's an array
                let accessibleProjectIds = userData.accessibleProjectIds || [];
                if (typeof accessibleProjectIds === 'string') {
                    try {
                        accessibleProjectIds = JSON.parse(accessibleProjectIds);
                    } catch (e) {
                        accessibleProjectIds = [];
                    }
                }

                // Prepare permissions - map customPermissions to permissions for API
                let permissions = userData.customPermissions || [];
                if (!Array.isArray(permissions)) {
                    permissions = [];
                }

                const response = await fetch('/api/users', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        userId: selectedUser.id,
                        name: userData.name,
                        email: userData.email,
                        role: userData.role,
                        status: userData.status,
                        department: userData.department || '',
                        phone: userData.phone || '',
                        accessibleProjectIds: accessibleProjectIds,
                        permissions: permissions
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: 'Failed to update user' }));
                    alert(errorData.message || 'Failed to update user');
                    return;
                }

                const data = await response.json();
                console.log('✅ User updated successfully:', data);

                // Reload users from API
                await loadUsers();
                
                setShowUserModal(false);
                setSelectedUser(null);
            } else {
                // Add new user via API
                console.log('➕ Creating new user via API');
                
                // Prepare accessibleProjectIds - ensure it's an array
                let accessibleProjectIds = userData.accessibleProjectIds || [];
                if (typeof accessibleProjectIds === 'string') {
                    try {
                        accessibleProjectIds = JSON.parse(accessibleProjectIds);
                    } catch (e) {
                        accessibleProjectIds = [];
                    }
                }

                // Prepare permissions - map customPermissions to permissions for API
                let permissions = userData.customPermissions || [];
                if (!Array.isArray(permissions)) {
                    permissions = [];
                }

                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        name: userData.name,
                        email: userData.email,
                        role: userData.role,
                        status: userData.status,
                        department: userData.department || '',
                        phone: userData.phone || '',
                        accessibleProjectIds: accessibleProjectIds,
                        permissions: permissions
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ message: 'Failed to create user' }));
                    alert(errorData.message || 'Failed to create user');
                    return;
                }

                const data = await response.json();
                console.log('✅ User created successfully:', data);

                // Reload users from API
                await loadUsers();
                
                setShowUserModal(false);
            }
        } catch (error) {
            console.error('❌ Error saving user:', error);
            alert(`Failed to save user: ${error.message}`);
        }
    };

    const handleSaveInvitation = async (invitationData) => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            console.log('📧 Sending invitation via API:', invitationData);

            // Call the invite API
            const response = await fetch('/api/users/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    email: invitationData.email,
                    name: invitationData.name || invitationData.email.split('@')[0], // Use provided name or email prefix as default
                    role: invitationData.role,
                    department: invitationData.department || '',
                    accessibleProjectIds: invitationData.accessibleProjectIds || []
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Failed to send invitation' }));
                alert(errorData.message || 'Failed to send invitation');
                return;
            }

            const data = await response.json();
            console.log('✅ Invitation sent successfully:', data);

            // Reload invitations from API
            await loadInvitations();
            
            setShowInviteModal(false);
            
            // Show success message
            alert(`Invitation sent to ${invitationData.email}! They will receive an email with instructions to create their account.`);
        } catch (error) {
            console.error('❌ Error sending invitation:', error);
            alert(`Failed to send invitation: ${error.message}`);
        }
    };


    const handleResendInvitation = (invitation) => {
        console.log('Resending invitation to:', invitation.email);
        alert(`Invitation resent to ${invitation.email}!`);
    };

    const handleCancelInvitation = async (invitationId, email) => {
        console.log('🗑️ Cancel/Delete invitation clicked:', { invitationId, email });
        
        if (!invitationId) {
            console.error('❌ No invitation ID provided');
            alert('Error: Invitation ID is missing');
            return;
        }

        if (!confirm(`Are you sure you want to delete the invitation for ${email || 'this user'}?`)) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('❌ No token available');
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            console.log('📤 Sending DELETE request to:', `/api/users/invitation/${invitationId}`);
            const response = await fetch(`/api/users/invitation/${invitationId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('📡 Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Error response:', errorText);
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { message: errorText || 'Failed to delete invitation' };
                }
                alert(errorData.message || `Failed to delete invitation (Status: ${response.status})`);
                return;
            }

            const data = await response.json();
            console.log('✅ Delete response:', data);

            alert('Invitation deleted successfully');
            
            // Reload invitations from API if using API, otherwise update local state
            await loadInvitations();
            
        } catch (error) {
            console.error('❌ Error deleting invitation:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            alert(`Failed to delete invitation: ${error.message}`);
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

    // Check if user is online (last seen within last 5 minutes)
    const isUserOnline = (user) => {
        if (!user.lastSeenAt) return false;
        const lastSeen = new Date(user.lastSeenAt);
        const now = new Date();
        const diffMinutes = (now - lastSeen) / (1000 * 60);
        return diffMinutes <= 5;
    };

    // Format last seen time
    const formatLastSeen = (user) => {
        if (!user.lastSeenAt) return 'Never';
        if (isUserOnline(user)) return 'Online';
        
        const lastSeen = new Date(user.lastSeenAt);
        const now = new Date();
        const diffMs = now - lastSeen;
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return lastSeen.toLocaleDateString();
    };

    // Show access denied message if user is not admin
    if (!isAdmin) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <i className="fas fa-lock text-4xl text-gray-400 mb-4"></i>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">You need administrator privileges to access the Users page.</p>
                    <button
                        onClick={() => {
                            // Navigate to dashboard
                            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'dashboard' } }));
                        }}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

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
                                        <div className="flex items-center gap-2 flex-1">
                                            <div className="relative">
                                                <div className={`w-10 h-10 rounded-full bg-${role?.color || 'gray'}-100 flex items-center justify-center`}>
                                                    <span className={`text-${role?.color || 'gray'}-600 font-semibold text-sm`}>
                                                        {user.name.charAt(0)}
                                                    </span>
                                                </div>
                                                {isUserOnline(user) && (
                                                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-gray-900 text-sm truncate">{user.name}</h3>
                                                    {isUserOnline(user) && (
                                                        <span className="text-[10px] text-green-600 font-medium">●</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500 truncate">{user.email}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{formatLastSeen(user)}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleStatus(user)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
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
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleEditUser(user);
                                            }}
                                            className="flex-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition font-medium"
                                        >
                                            <i className="fas fa-edit mr-1"></i>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                console.log('🔴 Delete button clicked (grid view) for user:', user);
                                                handleDeleteUser(user);
                                            }}
                                            className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition font-medium"
                                        >
                                            <i className="fas fa-trash mr-1"></i>
                                            Delete
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
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Last Seen</th>
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
                                                        <div className="relative">
                                                            <div className={`w-8 h-8 rounded-full bg-${role?.color || 'gray'}-100 flex items-center justify-center`}>
                                                                <span className={`text-${role?.color || 'gray'}-600 font-semibold text-xs`}>
                                                                    {user.name.charAt(0)}
                                                                </span>
                                                            </div>
                                                            {isUserOnline(user) && (
                                                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border border-white"></div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="font-medium text-gray-900 text-sm">{user.name}</span>
                                                                {isUserOnline(user) && (
                                                                    <span className="text-[10px] text-green-600 font-medium">●</span>
                                                                )}
                                                            </div>
                                                        </div>
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
                                                    <div className="flex flex-col">
                                                        {isUserOnline(user) ? (
                                                            <span className="text-[10px] text-green-600 font-medium">Online</span>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-500">{formatLastSeen(user)}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleEditUser(user);
                                                            }}
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition"
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                console.log('🔴 Delete button clicked for user:', user);
                                                                handleDeleteUser(user);
                                                            }}
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
                                        <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
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
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('🔴 Cancel/Delete button clicked for invitation:', invitation);
                                            if (!invitation || !invitation.id) {
                                                console.error('❌ Invalid invitation object:', invitation);
                                                alert('Error: Invalid invitation data');
                                                return;
                                            }
                                            handleCancelInvitation(invitation.id, invitation.email);
                                        }}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition cursor-pointer"
                                        title="Delete Invitation"
                                        type="button"
                                    >
                                        <i className="fas fa-trash mr-1"></i>
                                        Delete
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
try {
    window.Users = Users;
    console.log('✅ Users.jsx loaded and registered on window.Users', typeof window.Users);
} catch (error) {
    console.error('❌ Users.jsx: Error registering component:', error, error.stack);
}
