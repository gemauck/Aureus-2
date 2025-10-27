// User Management Component
const { useState, useEffect } = React;

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [showEditInvitationModal, setShowEditInvitationModal] = useState(false);
    const [editingInvitation, setEditingInvitation] = useState(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordModalData, setPasswordModalData] = useState(null);
    const [newInvitation, setNewInvitation] = useState({
        email: '',
        name: '',
        role: 'user'
    });
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        role: 'member',
        department: '',
        phone: '',
        status: 'active'
    });
    const { isDark } = window.useTheme();

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('❌ No token available');
                return;
            }

            console.log('🔄 Loading users and invitations...');
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const responseData = await response.json();
                console.log('📦 Full API response:', responseData);
                
                // Handle both response formats: {users, invitations} or {data: {users, invitations}}
                const data = responseData.data || responseData;
                console.log('📦 Extracted data:', data);
                
                const usersList = data.users || [];
                const invitationsList = data.invitations || [];
                
                console.log('✅ Users loaded:', usersList.length);
                console.log('✅ Invitations loaded:', invitationsList.length);
                
                setUsers(usersList);
                setInvitations(invitationsList);
            } else {
                console.error('❌ Failed to load users, status:', response.status);
                const errorText = await response.text();
                console.error('Error response:', errorText);
            }
        } catch (error) {
            console.error('❌ Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUserSubmit = async (e) => {
        e.preventDefault();
        
        if (!newUser.name || !newUser.email) {
            alert('Name and email are required');
            return;
        }

        console.log('➕ Adding new user:', newUser);

        try {
            const success = await handleAddUser(newUser);
            if (success) {
                setShowAddUserModal(false);
                setNewUser({ name: '', email: '', role: 'member', department: '', phone: '', status: 'active' });
            }
        } catch (error) {
            console.error('❌ Error adding user:', error);
            alert('Failed to add user: ' + error.message);
        }
    };

    const handleInviteUser = async (e) => {
        e.preventDefault();
        
        if (!newInvitation.email || !newInvitation.name) {
            alert('Email and name are required');
            return;
        }

        console.log('📧 Sending invitation for:', newInvitation);

        try {
            const token = window.storage?.getToken?.();
            const currentUser = window.storage?.getUser?.();
            
            console.log('📤 Making invitation API call...');
            const response = await fetch('/api/users/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...newInvitation,
                    invitedBy: currentUser?.name || 'Admin'
                })
            });

            const data = await response.json();
            console.log('📨 Invitation API response:', data);

            if (response.ok) {
                console.log('✅ Invitation created successfully');
                
                setShowInviteModal(false);
                setNewInvitation({ email: '', name: '', role: 'user' });
                
                // Reload users and invitations
                await loadUsers();
                
                // Show success message with detailed information
                showInvitationResultModal(data);
            } else {
                console.error('❌ Invitation failed:', data);
                alert(data.message || 'Failed to send invitation');
            }
        } catch (error) {
            console.error('❌ Error sending invitation:', error);
            alert('Failed to send invitation: ' + error.message);
        }
    };

    const showInvitationResultModal = (responseData) => {
        const invitation = responseData.invitation || responseData.data?.invitation;
        const invitationLink = responseData.invitationLink;
        const debug = responseData.debug;
        
        console.log('🎉 Showing invitation result modal:', {
            invitation,
            invitationLink,
            emailSent: debug?.emailSent,
            emailError: debug?.emailError
        });

        const emailSent = debug?.emailSent;
        const emailError = debug?.emailError;
        const emailConfig = debug?.emailConfig;

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        <i class="fas fa-envelope ${emailSent ? 'text-green-500' : 'text-yellow-500'} mr-2"></i>
                        Invitation ${emailSent ? 'Sent' : 'Created'}
                    </h3>
                    <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="this.closest('.fixed').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="mb-4">
                    ${emailSent ? `
                        <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-green-500 mr-2"></i>
                                <p class="text-green-800 dark:text-green-200 text-sm font-medium">
                                    ✅ Invitation email sent successfully!
                                </p>
                            </div>
                        </div>
                    ` : `
                        <div class="bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4 mb-4">
                            <div class="flex items-start">
                                <i class="fas fa-exclamation-triangle text-yellow-500 mr-2 mt-1"></i>
                                <div>
                                    <p class="text-yellow-800 dark:text-yellow-200 text-sm font-medium mb-2">
                                        ⚠️ Invitation created but email not sent
                                    </p>
                                    <p class="text-yellow-700 dark:text-yellow-300 text-xs">
                                        ${emailError || 'Email configuration not available in local development mode.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    `}
                    
                    ${invitation ? `
                        <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4">
                            <h4 class="font-medium text-gray-900 dark:text-white mb-3">Invitation Details:</h4>
                            <div class="space-y-2 text-sm">
                                <div class="flex justify-between">
                                    <span class="font-medium text-gray-700 dark:text-gray-300">Name:</span>
                                    <span class="text-gray-900 dark:text-white">${invitation.name}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="font-medium text-gray-700 dark:text-gray-300">Email:</span>
                                    <span class="text-gray-900 dark:text-white">${invitation.email}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="font-medium text-gray-700 dark:text-gray-300">Role:</span>
                                    <span class="text-gray-900 dark:text-white capitalize">${invitation.role}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="font-medium text-gray-700 dark:text-gray-300">Status:</span>
                                    <span class="text-gray-900 dark:text-white">${invitation.status}</span>
                                </div>
                                <div class="flex justify-between">
                                    <span class="font-medium text-gray-700 dark:text-gray-300">Expires:</span>
                                    <span class="text-gray-900 dark:text-white">${new Date(invitation.expiresAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${invitationLink ? `
                        <div class="bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
                            <h4 class="font-medium text-blue-900 dark:text-blue-200 mb-2">Invitation Link:</h4>
                            <div class="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value="${invitationLink}" 
                                    readonly 
                                    class="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 rounded text-gray-900 dark:text-white"
                                />
                                <button 
                                    onclick="navigator.clipboard.writeText('${invitationLink}'); this.innerHTML='<i class=\\'fas fa-check\\'></i> Copied!'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i> Copy', 2000)"
                                    class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm whitespace-nowrap"
                                >
                                    <i class="fas fa-copy"></i> Copy
                                </button>
                            </div>
                            <p class="text-blue-700 dark:text-blue-300 text-xs mt-2">
                                <i class="fas fa-info-circle mr-1"></i>
                                ${emailSent 
                                    ? 'The user will receive this link via email.' 
                                    : 'Share this link manually with the user via WhatsApp, email, or other communication method.'}
                            </p>
                        </div>
                    ` : ''}
                    
                    ${!emailSent && emailConfig ? `
                        <div class="bg-orange-50 dark:bg-orange-900 border border-orange-200 dark:border-orange-700 rounded-lg p-4 mb-4">
                            <h4 class="font-medium text-orange-900 dark:text-orange-200 mb-2 flex items-center">
                                <i class="fas fa-cog mr-2"></i>Email Configuration Status:
                            </h4>
                            <div class="space-y-1 text-xs text-orange-800 dark:text-orange-300 font-mono">
                                <div>SMTP_HOST: ${emailConfig.SMTP_HOST}</div>
                                <div>SMTP_PORT: ${emailConfig.SMTP_PORT}</div>
                                <div>SMTP_USER: ${emailConfig.SMTP_USER}</div>
                                <div>SMTP_PASS: ${emailConfig.SMTP_PASS}</div>
                                <div>EMAIL_FROM: ${emailConfig.EMAIL_FROM}</div>
                            </div>
                            <p class="text-orange-700 dark:text-orange-300 text-xs mt-3">
                                <i class="fas fa-lightbulb mr-1"></i>
                                <strong>To enable email sending:</strong> Configure SMTP settings in your .env file and restart the server.
                            </p>
                        </div>
                    ` : ''}
                    
                    <div class="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                        <p class="text-gray-700 dark:text-gray-300 text-xs">
                            <i class="fas fa-info-circle mr-1"></i>
                            ${emailSent 
                                ? 'The user will receive an email with instructions to accept the invitation and create their account.' 
                                : 'In production, emails will be sent automatically. In local development, you may need to share the invitation link manually.'}
                        </p>
                    </div>
                </div>
                
                <div class="flex gap-3">
                    <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center">
                        <i class="fas fa-check mr-2"></i>Done
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };

    const handleAddUser = async (userData) => {
        try {
            const token = window.storage?.getToken?.();
            console.log('➕ Creating user via API...');
            console.log('📤 User data being sent:', userData);
            
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            });

            console.log('📡 Response status:', response.status, response.statusText);
            const data = await response.json();
            console.log('📨 Add user response:', data);

            if (response.ok) {
                console.log('✅ User created successfully');
                console.log('📨 Full response data:', data);
                await loadUsers();
                
                // Handle both response formats: {tempPassword} or {data: {tempPassword}}
                const tempPassword = data.tempPassword || data.data?.tempPassword;
                
                if (tempPassword) {
                    const userEmail = data.user?.email || userData.email;
                    setPasswordModalData({ email: userEmail, password: tempPassword });
                    setShowPasswordModal(true);
                } else {
                    alert('User created successfully!\n\nNote: Could not retrieve temporary password. Check server logs.');
                }
                return true;
            } else {
                console.error('❌ Failed to create user:', data);
                alert(data.message || data.error?.message || 'Failed to create user');
                return false;
            }
        } catch (error) {
            console.error('❌ Error creating user:', error);
            alert('Failed to create user: ' + error.message);
            throw error;
        }
    };

    const handleEditUser = async (userId, userData) => {
        try {
            const token = window.storage?.getToken?.();
            const response = await fetch('/api/users', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ userId, ...userData })
            });

            const data = await response.json();

            if (response.ok) {
                loadUsers();
                alert('User updated successfully');
                return true;
            } else {
                alert(data.message || 'Failed to update user');
                return false;
            }
        } catch (error) {
            console.error('Error updating user:', error);
            alert('Failed to update user');
            return false;
        }
    };

    const handleDeleteUser = async (userId, userName) => {
        if (!confirm(`Are you sure you want to delete user "${userName}"?`)) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            const response = await fetch('/api/users', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ userId })
            });

            if (response.ok) {
                loadUsers();
                alert('User deleted successfully');
            } else {
                const data = await response.json();
                alert(data.message || 'Failed to delete user');
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Failed to delete user');
        }
    };

    const handleEditInvitation = (invitation) => {
        setEditingInvitation(invitation);
        setShowEditInvitationModal(true);
    };

    const handleUpdateInvitation = async () => {
        if (!editingInvitation) return;
        
        try {
            const token = window.storage?.getToken?.();
            const response = await fetch(`/api/users/invitation/${editingInvitation.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: editingInvitation.name,
                    role: editingInvitation.role
                })
            });

            const data = await response.json();

            if (response.ok) {
                alert('Invitation updated successfully');
                setShowEditInvitationModal(false);
                setEditingInvitation(null);
                loadUsers();
            } else {
                alert(data.message || 'Failed to update invitation');
            }
        } catch (error) {
            console.error('Error updating invitation:', error);
            alert('Failed to update invitation');
        }
    };

    const handleResendInvitation = async (invitationId) => {
        try {
            const token = window.storage?.getToken?.();
            const response = await fetch(`/api/users/invitation/${invitationId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                alert(data.message || 'Invitation resent successfully');
                loadUsers();
            } else {
                alert(data.message || 'Failed to resend invitation');
            }
        } catch (error) {
            console.error('Error resending invitation:', error);
            alert('Failed to resend invitation');
        }
    };

    const handleDeleteInvitation = async (invitationId, email) => {
        if (!confirm(`Are you sure you want to delete the invitation for ${email}?`)) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            const response = await fetch(`/api/users/invitation/${invitationId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                alert('Invitation deleted successfully');
                loadUsers();
            } else {
                alert(data.message || 'Failed to delete invitation');
            }
        } catch (error) {
            console.error('Error deleting invitation:', error);
            alert('Failed to delete invitation');
        }
    };

    const getStatusBadge = (status) => {
        const statusClasses = {
            active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
            inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
            pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
        };
        
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClasses[status] || statusClasses.inactive}`}>
                {status}
            </span>
        );
    };

    const getRoleBadge = (role) => {
        const roleClasses = {
            admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
            user: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
            manager: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
            member: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
        };
        
        return (
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleClasses[role] || roleClasses.user}`}>
                {role}
            </span>
        );
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleDateString();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage users and send invitations</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowAddUserModal(true)}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
                    >
                        <i className="fas fa-user-plus mr-2"></i>
                        Add User
                    </button>
                    <button
                        onClick={() => setShowInviteModal(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                    >
                        <i className="fas fa-envelope mr-2"></i>
                        Invite User
                    </button>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className={`p-6 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center">
                        <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                            <i className="fas fa-users text-blue-600 dark:text-blue-400 text-xl"></i>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
                        </div>
                    </div>
                </div>

                <div className={`p-6 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center">
                        <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                            <i className="fas fa-clock text-yellow-600 dark:text-yellow-400 text-xl"></i>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Pending Invitations</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                {invitations.filter(inv => inv.status === 'pending').length}
                            </p>
                        </div>
                    </div>
                </div>

                <div className={`p-6 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className="flex items-center">
                        <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                            <i className="fas fa-user-check text-green-600 dark:text-green-400 text-xl"></i>
                        </div>
                        <div className="ml-4">
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Users</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                {users.filter(user => user.status === 'active').length}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Users Table */}
            <div className={`rounded-xl shadow-sm border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Users</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Login</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                        No users found. Add users or send invitations to get started.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                                                    <i className="fas fa-user text-gray-600 dark:text-gray-400"></i>
                                                </div>
                                                <div className="ml-4">
                                                    <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                                                    <div className="text-sm text-gray-500 dark:text-gray-400">{user.email}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getRoleBadge(user.role)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getStatusBadge(user.status)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {formatDate(user.lastLoginAt)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                                onClick={() => handleDeleteUser(user.id, user.name)}
                                                className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pending Invitations */}
            {invitations.filter(inv => inv.status === 'pending').length > 0 && (
                <div className={`rounded-xl shadow-sm border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">Pending Invitations</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Email</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Expires</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {invitations.filter(inv => inv.status === 'pending').map((invitation) => (
                                    <tr key={invitation.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {invitation.email}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            {invitation.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {getRoleBadge(invitation.role)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {formatDate(invitation.expiresAt)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleEditInvitation(invitation)}
                                                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                                                    title="Edit"
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleResendInvitation(invitation.id)}
                                                    className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
                                                    title="Resend"
                                                >
                                                    <i className="fas fa-paper-plane"></i>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteInvitation(invitation.id, invitation.email)}
                                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                                    title="Delete"
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Edit Invitation Modal */}
            {showEditInvitationModal && editingInvitation && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                <i className="fas fa-edit mr-2 text-blue-600"></i>
                                Edit Invitation
                            </h3>
                            <button
                                onClick={() => setShowEditInvitationModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Email
                                </label>
                                <input
                                    type="email"
                                    value={editingInvitation.email}
                                    disabled
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    value={editingInvitation.name}
                                    onChange={(e) => setEditingInvitation({...editingInvitation, name: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Role
                                </label>
                                <select
                                    value={editingInvitation.role}
                                    onChange={(e) => setEditingInvitation({...editingInvitation, role: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="member">Member</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowEditInvitationModal(false);
                                    setEditingInvitation(null);
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateInvitation}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <i className="fas fa-save mr-2"></i>
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add User Modal */}
            {showAddUserModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                <i className="fas fa-user-plus mr-2 text-green-600"></i>
                                Add New User
                            </h3>
                            <button
                                onClick={() => setShowAddUserModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleAddUserSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newUser.name}
                                    onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter full name"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter email address"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Role
                                </label>
                                <select
                                    value={newUser.role}
                                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="member">Member</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Department
                                </label>
                                <input
                                    type="text"
                                    value={newUser.department}
                                    onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter department (optional)"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    value={newUser.phone}
                                    onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter phone number (optional)"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Status
                                </label>
                                <select
                                    value={newUser.status}
                                    onChange={(e) => setNewUser({...newUser, status: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    <i className="fas fa-user-plus mr-2"></i>
                                    Create User
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddUserModal(false)}
                                    className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                <i className="fas fa-user-plus mr-2 text-blue-600"></i>
                                Invite New User
                            </h3>
                            <button
                                onClick={() => setShowInviteModal(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={handleInviteUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newInvitation.name}
                                    onChange={(e) => setNewInvitation({...newInvitation, name: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter full name"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={newInvitation.email}
                                    onChange={(e) => setNewInvitation({...newInvitation, email: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter email address"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Role
                                </label>
                                <select
                                    value={newInvitation.role}
                                    onChange={(e) => setNewInvitation({...newInvitation, role: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="user">User</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="submit"
                                    className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    <i className="fas fa-envelope mr-2"></i>
                                    Send Email Invitation
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowInviteModal(false)}
                                    className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Password Display Modal */}
            {showPasswordModal && passwordModalData && window.PasswordDisplayModal && (
                <window.PasswordDisplayModal
                    email={passwordModalData.email}
                    password={passwordModalData.password}
                    onClose={() => {
                        setShowPasswordModal(false);
                        setPasswordModalData(null);
                    }}
                />
            )}
        </div>
    );
};

window.UserManagement = UserManagement;
