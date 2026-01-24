// Get dependencies from window
const { useState, useEffect, useMemo, useCallback } = React;
const storage = window.storage;

const Users = () => {
    const { user: currentUser } = window.useAuth ? window.useAuth() : { user: null };
    const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
    
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
    const [forceUpdate, setForceUpdate] = useState(0);
    const [loading, setLoading] = useState(true);
    
    // Sort state - default alphabetical by name
    const [sortColumn, setSortColumn] = useState('name'); // Default sort by name (alphabetical)
    const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

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
        loadUsersAndInvitations();
    }, []);
    
    // Listen for route changes to handle user navigation and URL-based user opening
    useEffect(() => {
        if (!window.RouteState) return;
        
        const handleRouteChange = async (route) => {
            if (route?.page !== 'users') return;
            
            // If no segments, reset selected user and close modals
            if (!route.segments || route.segments.length === 0) {
                setSelectedUser(prev => {
                    if (prev) {
                        return null;
                    }
                    return prev;
                });
                setShowUserModal(prev => {
                    if (prev) {
                        return false;
                    }
                    return prev;
                });
                setShowInviteModal(prev => {
                    if (prev) {
                        return false;
                    }
                    return prev;
                });
                return;
            }
            
            // URL contains a user ID - open that user
            const userId = route.segments[0];
            if (userId) {
                const user = users.find(u => String(u.id) === String(userId));
                if (user) {
                    setSelectedUser(user);
                    setShowUserModal(true);
                } else {
                    // User not in cache, try to fetch it
                    try {
                        const token = window.storage?.getToken?.();
                        if (token) {
                            const response = await fetch(`/api/users/${userId}`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`
                                }
                            });
                            if (response.ok) {
                                const data = await response.json();
                                const userData = data.data?.user || data.user || data.data;
                                if (userData) {
                                    setSelectedUser(userData);
                                    setShowUserModal(true);
                                }
                            }
                        }
                    } catch (error) {
                        console.error('Failed to load user from URL:', error);
                    }
                }
            }
        };
        
        // Check initial route
        const currentRoute = window.RouteState.getRoute();
        handleRouteChange(currentRoute);
        
        // Subscribe to route changes
        const unsubscribe = window.RouteState.subscribe(handleRouteChange);
        
        return () => {
            if (unsubscribe && typeof unsubscribe === 'function') {
                unsubscribe();
            }
        };
    }, [users]);

    // Debug: Log when showInviteModal changes
    useEffect(() => {
        if (showInviteModal) {
            console.log('🎯 showInviteModal is true, should render modal');
            console.log('🔍 InviteUserModal available:', typeof window.InviteUserModal);
        }
    }, [showInviteModal]);

    // Debug: Verify delete buttons are rendered
    useEffect(() => {
        const deleteButtons = document.querySelectorAll('button[title="Delete"]');
        if (deleteButtons.length > 0) {
        }
    }, [users, viewMode]);

    // Combined function to load both users and invitations in a single API call
    const loadUsersAndInvitations = async () => {
        try {
            setLoading(true);
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
                    const apiInvitations = responseData.invitations || [];
                    
                    // Always use API data when available, even if empty array
                    setUsers(apiUsers);
                    setInvitations(apiInvitations);
                    
                    // Update local storage to match API data
                    storage.setUsers(apiUsers);
                    storage.setInvitations(apiInvitations);
                    setLoading(false);
                    return;
                }
            }
            
            // Fallback to local storage only if API call fails
            let savedUsers = storage.getUsers() || [];
            let savedInvitations = storage.getInvitations() || [];
            if (savedUsers.length === 0) {
                savedUsers = [];
                storage.setUsers(savedUsers);
            }
            setUsers(savedUsers);
            setInvitations(savedInvitations);
            setLoading(false);
        } catch (error) {
            console.error('Error loading users and invitations:', error);
            // Fallback to local storage on error
            let savedUsers = storage.getUsers() || [];
            let savedInvitations = storage.getInvitations() || [];
            if (savedUsers.length === 0) {
                savedUsers = [];
                storage.setUsers(savedUsers);
            }
            setUsers(savedUsers);
            setInvitations(savedInvitations);
            setLoading(false);
        }
    };

    // Keep separate functions for backward compatibility when reloading after mutations
    const loadUsers = async () => {
        await loadUsersAndInvitations();
    };

    const loadInvitations = async () => {
        await loadUsersAndInvitations();
    };

    const handleAddUser = () => {
        setSelectedUser(null);
        setShowUserModal(true);
    };

    const handleInviteUser = () => {
        console.log('📧 Invite User button clicked, opening modal...');
        console.log('🔍 window.InviteUserModal before setState:', typeof window.InviteUserModal);
        setShowInviteModal(true);
        setForceUpdate(prev => prev + 1); // Force re-render
        console.log('✅ showInviteModal set to true, forceUpdate triggered');
    };

    const handleEditUser = (user) => {
        setSelectedUser(user);
        setShowUserModal(true);
        
        // Update URL to reflect the selected user
        if (window.RouteState && user?.id) {
            window.RouteState.setPageSubpath('users', [String(user.id)], {
                replace: false,
                preserveSearch: false,
                preserveHash: false
            });
        }
    };

    const handleDeleteUser = async (user) => {
        try {
            
            if (!user) {
                console.error('❌ handleDeleteUser: user is null or undefined');
                alert('Error: User data is missing');
                return;
            }
            
            if (!user.id) {
                console.error('❌ handleDeleteUser: user.id is missing');
                alert('Error: User ID is missing');
                return;
            }
            
            const confirmed = confirm(`Are you sure you want to delete ${user.name || user.email || 'this user'}?`);
            
            if (!confirmed) {
                return;
            }
            

            const token = window.storage?.getToken?.();
            if (!token) {
                alert('Authentication error: Please refresh the page and try again');
                return;
            }

            
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });


            // Get response text first to see what we're dealing with
            const responseText = await response.text();

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

                // Reload users from API
                await loadUsers();
                
                setShowUserModal(false);
                setSelectedUser(null);
            } else {
                // Add new user via API
                
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
        alert(`Invitation resent to ${invitation.email}!`);
    };

    const handleCancelInvitation = async (invitationId, email) => {
        
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

            const response = await fetch(`/api/users/invitation/${invitationId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });


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

    // Handle column sorting
    const handleSort = useCallback((column) => {
        if (sortColumn === column) {
            // Toggle direction if clicking the same column
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column and default to ascending
            setSortColumn(column);
            setSortDirection('asc');
        }
    }, [sortColumn, sortDirection]);

    // Sort function - memoized to ensure proper reactivity
    const sortUsers = useCallback((a, b) => {
        let aValue, bValue;
        
        switch (sortColumn) {
            case 'name':
                aValue = (a.name || '').toLowerCase();
                bValue = (b.name || '').toLowerCase();
                break;
            case 'email':
                aValue = (a.email || '').toLowerCase();
                bValue = (b.email || '').toLowerCase();
                break;
            case 'role':
                aValue = (a.role || '').toLowerCase();
                bValue = (b.role || '').toLowerCase();
                break;
            case 'department':
                aValue = (a.department || '').toLowerCase();
                bValue = (b.department || '').toLowerCase();
                break;
            case 'status':
                aValue = (a.status || '').toLowerCase();
                bValue = (b.status || '').toLowerCase();
                break;
            case 'lastSeen':
                aValue = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
                bValue = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
                break;
            default:
                aValue = (a.name || '').toLowerCase();
                bValue = (b.name || '').toLowerCase();
        }
        
        let comparison = 0;
        if (sortColumn === 'lastSeen') {
            // Numeric comparison for dates
            comparison = aValue - bValue;
        } else {
            // String comparison for alphabetical sorting
            comparison = aValue.localeCompare(bValue);
        }
        
        return sortDirection === 'asc' ? comparison : -comparison;
    }, [sortColumn, sortDirection]);

    // Filter and sort users - memoized to ensure proper sorting
    const filteredUsers = useMemo(() => {
        // Filter users
        const filtered = users.filter(user => {
            const matchesSearch = user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                user.email.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesRole = filterRole === 'all' || user.role === filterRole;
            const matchesStatus = filterStatus === 'all' || user.status === filterStatus;
            return matchesSearch && matchesRole && matchesStatus;
        });
        
        // Always sort - default is alphabetical by name (asc)
        // Create a new array to avoid mutating the original
        const sorted = [...filtered].sort(sortUsers);
        
        return sorted;
    }, [users, searchTerm, filterRole, filterStatus, sortUsers]);

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
                    <i className={`fas fa-lock text-4xl mb-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                    <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Access Denied</h2>
                    <p className={`mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>You need administrator privileges to access the Users page.</p>
                    <button
                        onClick={() => {
                            // Navigate to dashboard
                            window.dispatchEvent(new CustomEvent('navigateToPage', { detail: { page: 'dashboard' } }));
                        }}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Get modal component references (re-evaluated on each render)
    const InviteModal = window.InviteUserModal;
    console.log('🔄 Render - showInviteModal:', showInviteModal, 'InviteModal:', typeof InviteModal, 'forceUpdate:', forceUpdate);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
                <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 ${isDark ? 'bg-gray-800' : 'bg-gray-100'} rounded-xl flex items-center justify-center flex-shrink-0`}>
                        <i className={`fas fa-user-cog ${isDark ? 'text-gray-300' : 'text-gray-600'} text-sm sm:text-lg`}></i>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>User Management</h1>
                        <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Manage users, roles, and permissions</p>
                    </div>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-3">
                    <button
                        onClick={handleInviteUser}
                        className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 text-sm font-medium min-h-[44px] sm:min-h-0"
                    >
                        <i className="fas fa-envelope mr-2"></i>
                        Invite User
                    </button>
                    <button
                        onClick={handleAddUser}
                        className="px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium min-h-[44px] sm:min-h-0"
                    >
                        <i className="fas fa-plus mr-2"></i>
                        Add User
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                        <div className={`inline-block animate-spin rounded-full h-8 w-8 border-b-2 mb-3 ${isDark ? 'border-blue-400' : 'border-blue-600'}`}></div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading users...</p>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            {!loading && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 shadow-sm`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Total Users</p>
                            <p className={`text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{users.length}</p>
                        </div>
                        <div className={`w-10 h-10 ${isDark ? 'bg-gray-800' : 'bg-blue-100'} rounded-lg flex items-center justify-center`}>
                            <i className={`fas fa-users ${isDark ? 'text-gray-300' : 'text-blue-600'}`}></i>
                        </div>
                    </div>
                </div>
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 shadow-sm`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Active Users</p>
                            <p className={`text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {users.filter(u => u.status === 'Active').length}
                            </p>
                        </div>
                        <div className={`w-10 h-10 ${isDark ? 'bg-gray-800' : 'bg-green-100'} rounded-lg flex items-center justify-center`}>
                            <i className={`fas fa-user-check ${isDark ? 'text-gray-300' : 'text-green-600'}`}></i>
                        </div>
                    </div>
                </div>
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 shadow-sm`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Administrators</p>
                            <p className={`text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                                {getUserCountByRole('admin')}
                            </p>
                        </div>
                        <div className={`w-10 h-10 ${isDark ? 'bg-gray-800' : 'bg-red-100'} rounded-lg flex items-center justify-center`}>
                            <i className={`fas fa-user-shield ${isDark ? 'text-gray-300' : 'text-red-600'}`}></i>
                        </div>
                    </div>
                </div>
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 shadow-sm`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Departments</p>
                            <p className={`text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{departments.length}</p>
                        </div>
                        <div className={`w-10 h-10 ${isDark ? 'bg-gray-800' : 'bg-purple-100'} rounded-lg flex items-center justify-center`}>
                            <i className={`fas fa-building ${isDark ? 'text-gray-300' : 'text-purple-600'}`}></i>
                        </div>
                    </div>
                </div>
            </div>
            )}

            {/* Filters and Search */}
            {!loading && (
            <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 shadow-sm`}>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    {/* Search */}
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Search users by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                                isDark
                                    ? 'bg-gray-800 border-gray-700 text-gray-200 placeholder-gray-400 focus:bg-gray-800'
                                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-500 focus:bg-white'
                            }`}
                        />
                        <i className={`fas fa-search absolute left-3 top-3 text-sm ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className={`absolute right-3 top-3 transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                                title="Clear search"
                            >
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        )}
                    </div>

                    {/* Role Filter */}
                    <select
                        value={filterRole}
                        onChange={(e) => setFilterRole(e.target.value)}
                        className={`px-4 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                            isDark
                                ? 'bg-gray-800 border-gray-700 text-gray-200 focus:bg-gray-800'
                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                        }`}
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
                        className={`px-4 py-2.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                            isDark
                                ? 'bg-gray-800 border-gray-700 text-gray-200 focus:bg-gray-800'
                                : 'bg-gray-50 border-gray-200 text-gray-900 focus:bg-white'
                        }`}
                    >
                        <option value="all">All Status</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>

                    {/* View Mode Toggle */}
                    <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} flex border rounded-xl p-1.5`}>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                                viewMode === 'grid'
                                    ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                    : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            <i className="fas fa-th"></i>
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                                viewMode === 'table'
                                    ? isDark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-900'
                                    : isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-800' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            <i className="fas fa-list"></i>
                        </button>
                    </div>
                </div>
            </div>
            )}

            {/* Users Display */}
            {viewMode === 'grid' ? (
                // Grid View
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {filteredUsers.length > 0 ? (
                        filteredUsers.map(user => {
                            const role = roleDefinitions[user.role];
                            return (
                                <div key={user.id} className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 hover:shadow-md transition-all duration-200`}>
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
                                                    <h3 className={`font-semibold text-sm truncate ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{user.name}</h3>
                                                    {isUserOnline(user) && (
                                                        <span className="text-[10px] text-green-600 font-medium">●</span>
                                                    )}
                                                </div>
                                                <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{user.email}</p>
                                                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{formatLastSeen(user)}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggleStatus(user)}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                user.status === 'Active'
                                                    ? 'bg-green-100 text-green-600'
                                                    : isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400'
                                            }`}
                                            title={user.status === 'Active' ? 'Deactivate' : 'Activate'}
                                        >
                                            <i className={`fas fa-${user.status === 'Active' ? 'check' : 'times'} text-xs`}></i>
                                        </button>
                                    </div>

                                    <div className="space-y-1.5 mb-3">
                                        <div className="flex items-center gap-2 text-xs">
                                            <i className={`fas fa-user-tag w-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-${role?.color || 'gray'}-100 text-${role?.color || 'gray'}-700`}>
                                                {role?.name || user.role}
                                            </span>
                                        </div>
                                        {user.department && (
                                            <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                <i className={`fas fa-building w-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                                                <span>{user.department}</span>
                                            </div>
                                        )}
                                        {user.phone && (
                                            <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                                <i className={`fas fa-phone w-3 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}></i>
                                                <span>{user.phone}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className={`flex gap-1.5 pt-2 border-t ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleEditUser(user);
                                            }}
                                            className={`flex-1 px-2 py-1 text-xs rounded transition font-medium ${
                                                isDark ? 'bg-gray-800 text-gray-200 hover:bg-gray-750' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                            }`}
                                        >
                                            <i className="fas fa-edit mr-1"></i>
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                try {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    if (!user || !user.id) {
                                                        console.error('❌ Invalid user object in grid view:', user);
                                                        alert('Error: Invalid user data');
                                                        return;
                                                    }
                                                    handleDeleteUser(user);
                                                } catch (error) {
                                                    console.error('❌ Error in grid delete button onClick:', error);
                                                    alert('Error clicking delete button: ' + error.message);
                                                }
                                            }}
                                            className={`px-2 py-1 text-xs rounded transition font-medium ${
                                                isDark ? 'bg-red-900/30 text-red-300 hover:bg-red-900/40' : 'bg-red-100 text-red-700 hover:bg-red-200'
                                            }`}
                                        >
                                            <i className="fas fa-trash mr-1"></i>
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className={`col-span-full text-center py-12 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-8`}>
                            <i className={`fas fa-users text-4xl mb-3 ${isDark ? 'text-gray-500' : 'text-gray-300'}`}></i>
                            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No users found</p>
                            <button
                                onClick={handleAddUser}
                                className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200 text-sm font-medium"
                            >
                                Add First User
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                // Table View
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border overflow-hidden shadow-sm`}>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className={isDark ? 'bg-gray-800' : 'bg-gray-50'}>
                                <tr>
                                    <th 
                                        className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer transition-colors select-none ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                        onClick={() => handleSort('name')}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span>User</span>
                                            {sortColumn === 'name' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                            ) : (
                                                <i className={`fas fa-sort ${isDark ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-sm`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer transition-colors select-none ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                        onClick={() => handleSort('email')}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span>Email</span>
                                            {sortColumn === 'email' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                            ) : (
                                                <i className={`fas fa-sort ${isDark ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-sm`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer transition-colors select-none ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                        onClick={() => handleSort('role')}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span>Role</span>
                                            {sortColumn === 'role' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                            ) : (
                                                <i className={`fas fa-sort ${isDark ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-sm`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer transition-colors select-none ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                        onClick={() => handleSort('department')}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span>Department</span>
                                            {sortColumn === 'department' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                            ) : (
                                                <i className={`fas fa-sort ${isDark ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-sm`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer transition-colors select-none ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                        onClick={() => handleSort('status')}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span>Status</span>
                                            {sortColumn === 'status' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                            ) : (
                                                <i className={`fas fa-sort ${isDark ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-sm`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th 
                                        className={`px-4 py-3 text-left text-xs font-semibold uppercase cursor-pointer transition-colors select-none ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
                                        onClick={() => handleSort('lastSeen')}
                                    >
                                        <div className="flex items-center space-x-2">
                                            <span>Last Seen</span>
                                            {sortColumn === 'lastSeen' ? (
                                                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} ${isDark ? 'text-blue-400' : 'text-blue-600'} text-sm`}></i>
                                            ) : (
                                                <i className={`fas fa-sort ${isDark ? 'text-gray-500' : 'text-gray-400'} opacity-50 text-sm`}></i>
                                            )}
                                        </div>
                                    </th>
                                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className={`${isDark ? 'bg-gray-900 divide-gray-800' : 'bg-white divide-gray-100'} divide-y`}>
                                {filteredUsers.length > 0 ? (
                                    filteredUsers.map(user => {
                                        const role = roleDefinitions[user.role];
                                        return (
                                            <tr key={user.id} className={isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-50'}>
                                                <td className="px-4 py-3">
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
                                                                <span className={`font-medium text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{user.name}</span>
                                                                {isUserOnline(user) && (
                                                                    <span className="text-[10px] text-green-600 font-medium">●</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{user.email}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium bg-${role?.color || 'gray'}-100 text-${role?.color || 'gray'}-700`}>
                                                        {role?.name || user.role}
                                                    </span>
                                                </td>
                                                <td className={`px-4 py-3 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{user.department || '-'}</td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => handleToggleStatus(user)}
                                                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                                            user.status === 'Active'
                                                                ? 'bg-green-100 text-green-700'
                                                                : isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'
                                                        }`}
                                                    >
                                                        {user.status}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex flex-col">
                                                        {isUserOnline(user) ? (
                                                            <span className="text-[10px] text-green-600 font-medium">Online</span>
                                                        ) : (
                                                            <span className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{formatLastSeen(user)}</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleEditUser(user);
                                                            }}
                                                            className={`p-1 transition ${isDark ? 'text-gray-500 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'}`}
                                                            title="Edit"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                try {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    if (!user || !user.id) {
                                                                        console.error('❌ Invalid user object:', user);
                                                                        alert('Error: Invalid user data');
                                                                        return;
                                                                    }
                                                                    handleDeleteUser(user);
                                                                } catch (error) {
                                                                    console.error('❌ Error in delete button onClick:', error);
                                                                    alert('Error clicking delete button: ' + error.message);
                                                                }
                                                            }}
                                                            className={`p-1 transition ${isDark ? 'text-gray-500 hover:text-red-400' : 'text-gray-400 hover:text-red-600'}`}
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
                                        <td colSpan="7" className={`px-6 py-12 text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
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
                <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-4 shadow-sm`}>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Pending Invitations</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${isDark ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800'}`}>
                            {invitations.filter(inv => inv.status === 'pending').length} pending
                        </span>
                    </div>
                    <div className="space-y-2">
                        {invitations.filter(inv => inv.status === 'pending').map(invitation => (
                            <div key={invitation.id} className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} flex items-center justify-between p-3 rounded-lg`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-yellow-900' : 'bg-yellow-100'}`}>
                                        <i className={`fas fa-envelope text-xs ${isDark ? 'text-yellow-200' : 'text-yellow-600'}`}></i>
                                    </div>
                                    <div>
                                        <p className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{invitation.email}</p>
                                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                            Invited as {roleDefinitions[invitation.role]?.name || invitation.role} • 
                                            {invitation.department && ` ${invitation.department} •`}
                                            Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleResendInvitation(invitation)}
                                        className={`px-3 py-1.5 text-xs rounded transition ${isDark ? 'bg-blue-900/30 text-blue-200 hover:bg-blue-900/40' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                                        title="Resend Invitation"
                                    >
                                        <i className="fas fa-redo mr-1"></i>
                                        Resend
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
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
                                        className={`px-3 py-1.5 text-xs rounded transition cursor-pointer ${isDark ? 'bg-red-900/30 text-red-300 hover:bg-red-900/40' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
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
            {showInviteModal && InviteModal && React.createElement(InviteModal, {
                onClose: () => {
                    console.log('🚪 Closing invite modal');
                    setShowInviteModal(false);
                },
                onSave: handleSaveInvitation,
                roleDefinitions: roleDefinitions,
                departments: departments
            })}
        </div>
    );
};

// Make available globally
try {
    window.Users = Users;
    
    // Dispatch ready event
    if (typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('usersComponentReady'));
            
            // Also dispatch after a small delay in case listeners weren't ready
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('usersComponentReady'));
            }, 100);
            
            // One more delayed dispatch for safety
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent('usersComponentReady'));
            }, 500);
        } catch (e) {
            console.warn('⚠️ Could not dispatch usersComponentReady event:', e);
        }
    }
} catch (error) {
    console.error('❌ Users.jsx: Error registering component:', error, error.stack);
}
