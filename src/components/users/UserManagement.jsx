// User Management Component
const { useState, useEffect } = React;

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [newInvitation, setNewInvitation] = useState({
        email: '',
        name: '',
        role: 'user'
    });
    const [whatsappMessage, setWhatsappMessage] = useState('');
    const [invitationLink, setInvitationLink] = useState('');
    const { isDark } = window.useTheme();

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('No token available');
                return;
            }

            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUsers(data.users || []);
                setInvitations(data.invitations || []);
            } else {
                console.error('Failed to load users');
            }
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInviteUser = async (e) => {
        e.preventDefault();
        
        if (!newInvitation.email || !newInvitation.name) {
            alert('Email and name are required');
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            const response = await fetch('/api/users/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...newInvitation,
                    invitedBy: window.storage?.getUser?.()?.name || 'Admin'
                })
            });

            const data = await response.json();

            if (response.ok) {
                setShowInviteModal(false);
                setNewInvitation({ email: '', name: '', role: 'user' });
                loadUsers(); // Refresh the list
                
                // Show success message with email confirmation
                // Handle both direct response and nested data response
                const invitation = data.invitation || data.data?.invitation;
                if (invitation) {
                    showEmailSentModal(invitation);
                } else {
                    alert('Invitation sent successfully!');
                }
            } else {
                alert(data.message || 'Failed to send invitation');
            }
        } catch (error) {
            console.error('Error sending invitation:', error);
            alert('Failed to send invitation');
        }
    };

    const showEmailSentModal = (invitation) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        <i class="fas fa-envelope text-blue-500 mr-2"></i>
                        Invitation Sent
                    </h3>
                    <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" onclick="this.closest('.fixed').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="mb-4">
                    <div class="bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-4 mb-4">
                        <div class="flex items-center">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            <p class="text-green-800 dark:text-green-200 text-sm font-medium">
                                Invitation email sent successfully!
                            </p>
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                        <h4 class="font-medium text-gray-900 dark:text-white mb-2">Invitation Details:</h4>
                        <div class="space-y-1 text-sm">
                            <div><span class="font-medium text-gray-700 dark:text-gray-300">Name:</span> <span class="text-gray-900 dark:text-white">${invitation.name}</span></div>
                            <div><span class="font-medium text-gray-700 dark:text-gray-300">Email:</span> <span class="text-gray-900 dark:text-white">${invitation.email}</span></div>
                            <div><span class="font-medium text-gray-700 dark:text-gray-300">Role:</span> <span class="text-gray-900 dark:text-white capitalize">${invitation.role}</span></div>
                            <div><span class="font-medium text-gray-700 dark:text-gray-300">Expires:</span> <span class="text-gray-900 dark:text-white">${new Date(invitation.expiresAt).toLocaleDateString()}</span></div>
                        </div>
                    </div>
                    
                    <div class="mt-4 p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
                        <p class="text-blue-800 dark:text-blue-200 text-xs">
                            <i class="fas fa-info-circle mr-1"></i>
                            The user will receive an email with instructions to accept the invitation and create their account.
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
            manager: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300'
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
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
                >
                    <i className="fas fa-user-plus mr-2"></i>
                    Invite User
                </button>
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
                            {users.map((user) => (
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
                            ))}
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
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
                                    Name
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
                                    Email
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
        </div>
    );
};

window.UserManagement = UserManagement;
