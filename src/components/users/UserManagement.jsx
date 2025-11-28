// User Management Component
const { useState, useEffect } = React;

const UserManagement = () => {
    const { user: currentUser } = window.useAuth ? window.useAuth() : { user: null };
    
    // Check if current user is admin (case-insensitive)
    const isAdmin = currentUser?.role?.toLowerCase() === 'admin';
    
    const [users, setUsers] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [showEditInvitationModal, setShowEditInvitationModal] = useState(false);
    const [editingInvitation, setEditingInvitation] = useState(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordModalData, setPasswordModalData] = useState(null);
    const [showPermissionsModal, setShowPermissionsModal] = useState(false);
    const [editingUserPermissions, setEditingUserPermissions] = useState(null);
    const [selectedPermissions, setSelectedPermissions] = useState([]);
    const [showEditUserModal, setShowEditUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [newInvitation, setNewInvitation] = useState({
        email: '',
        name: '',
        role: 'user'
    });
    const [newUser, setNewUser] = useState({
        name: '',
        email: '',
        role: 'user',
        department: '',
        phone: '',
        status: 'active',
        accessibleProjectIds: []
    });
    const [availableProjects, setAvailableProjects] = useState([]);
    const [loadingProjects, setLoadingProjects] = useState(false);
    const { isDark } = window.useTheme();

    useEffect(() => {
        loadUsers();
    }, []);

    // Load projects when role is guest
    useEffect(() => {
        const loadProjects = async () => {
            if (newUser.role === 'guest' || editingUser?.role === 'guest') {
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
    }, [newUser.role, editingUser?.role]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('❌ No token available');
                setUsers([]);
                setInvitations([]);
                setLoading(false);
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
                
                const usersList = (data.users || []).map(user => {
                    // Parse permissions from JSON string to array
                    console.log('🔍 Processing user:', user.email, 'permissions (raw):', user.permissions, 'type:', typeof user.permissions);
                    if (user.permissions) {
                        try {
                            if (typeof user.permissions === 'string') {
                                const parsed = JSON.parse(user.permissions);
                                user.permissions = Array.isArray(parsed) ? parsed : [];
                                console.log('✅ Parsed permissions for', user.email, ':', user.permissions);
                            } else if (!Array.isArray(user.permissions)) {
                                user.permissions = [];
                            }
                        } catch (e) {
                            console.warn('❌ Failed to parse permissions for user:', user.email, e);
                            user.permissions = [];
                        }
                    } else {
                        console.log('⚠️ No permissions field for user:', user.email);
                        user.permissions = [];
                    }
                    return user;
                });
                const invitationsList = data.invitations || [];
                
                console.log('✅ Users loaded:', usersList.length);
                console.log('✅ Invitations loaded:', invitationsList.length);
                
                setUsers(usersList);
                setInvitations(invitationsList);
            } else {
                // Suppress error logs for database connection errors and server errors (500, 502, 503, 504)
                const isServerError = response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504;
                const errorText = await response.text();
                const isDatabaseError = errorText.includes('DATABASE_CONNECTION_ERROR') ||
                                       errorText.includes('Database connection failed') ||
                                       errorText.includes('unreachable');
                
                if (!isDatabaseError && !isServerError) {
                    console.error('❌ Failed to load users, status:', response.status);
                    console.error('Error response:', errorText);
                }
                
                // Set empty arrays on error so UI can still render
                setUsers([]);
                setInvitations([]);
            }
        } catch (error) {
            // Suppress error logs for database connection errors and server errors
            const errorMessage = error?.message || String(error);
            const isDatabaseError = errorMessage.includes('Database connection failed') ||
                                  errorMessage.includes('unreachable') ||
                                  errorMessage.includes('ECONNREFUSED') ||
                                  errorMessage.includes('ETIMEDOUT');
            const isServerError = errorMessage.includes('500') || 
                                 errorMessage.includes('502') || 
                                 errorMessage.includes('503') || 
                                 errorMessage.includes('504');
            
            if (!isDatabaseError && !isServerError) {
                console.error('❌ Error loading users:', error);
            }
            
            // Set empty arrays on error so UI can still render
            setUsers([]);
            setInvitations([]);
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

            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // Server returned non-JSON (likely HTML error page)
                const text = await response.text();
                console.error('❌ Server returned non-JSON response:', text.substring(0, 200));
                throw new Error('Server returned invalid response. Please check the server logs.');
            }
            
            console.log('📨 Invitation API response:', data);

            if (response.ok) {
                console.log('✅ Invitation created successfully');
                
                setShowInviteModal(false);
                setNewInvitation({ email: '', name: '', role: 'user' });
                
                // Reload users and invitations
                await loadUsers();
                
                // Show success message with detailed information
                // Handle both {data: {...}} and direct response formats
                const responseData = data.data || data;
                showInvitationResultModal(responseData);
            } else {
                console.error('❌ Invitation failed:', data);
                // Extract error message from { error: { code, message, details } } structure
                const errorMessage = data.error?.message || data.message || data.error || 'Failed to send invitation';
                alert(errorMessage);
            }
        } catch (error) {
            console.error('❌ Error sending invitation:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
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
        
        // Determine if there's an actual error vs just missing config
        const hasActualError = emailError && emailError !== null && emailError !== '';
        const hasConfig = emailConfig && (
            emailConfig.SMTP_HOST !== 'NOT_SET' || 
            emailConfig.SMTP_USER !== 'NOT_SET' || 
            emailConfig.SENDGRID_API_KEY !== 'NOT_SET'
        );

        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                        <i class="fas fa-envelope ${emailSent ? 'text-green-500' : (hasActualError ? 'text-red-500' : 'text-yellow-500')} mr-2"></i>
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
                    ` : hasActualError ? `
                        <div class="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4 mb-4">
                            <div class="flex items-start">
                                <i class="fas fa-times-circle text-red-500 mr-2 mt-1"></i>
                                <div class="flex-1">
                                    <p class="text-red-800 dark:text-red-200 text-sm font-medium mb-2">
                                        ❌ Email Failed to Send
                                    </p>
                                    <p class="text-red-700 dark:text-red-300 text-xs mb-2">
                                        <strong>Error:</strong> ${emailError}
                                    </p>
                                    <div class="bg-red-100 dark:bg-red-800 rounded p-2 mt-2">
                                        <p class="text-red-800 dark:text-red-200 text-xs font-medium mb-1">Possible causes:</p>
                                        <ul class="text-red-700 dark:text-red-300 text-xs list-disc list-inside space-y-1">
                                            <li>Invalid email configuration (check server logs)</li>
                                            <li>SendGrid API key invalid or expired</li>
                                            <li>Network connectivity issues</li>
                                            <li>Email service temporarily unavailable</li>
                                        </ul>
                                    </div>
                                </div>
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
                                        ${hasConfig ? 'Email configuration is set, but email sending failed. Check server logs for details.' : 'Email configuration not available. Please configure SMTP settings in your .env file.'}
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
            
            console.log('📤 UserManagement handleEditUser: Sending request:', {
                userId,
                userData,
                accessibleProjectIds: userData.accessibleProjectIds,
                accessibleProjectIdsType: typeof userData.accessibleProjectIds
            });
            
            const response = await fetch('/api/users', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ userId, ...userData })
            });

            const data = await response.json();
            
            console.log('📥 UserManagement handleEditUser: Response:', {
                status: response.status,
                ok: response.ok,
                data
            });

            if (response.ok) {
                loadUsers();
                alert('User updated successfully');
                return true;
            } else {
                console.error('❌ UserManagement handleEditUser: Failed:', data);
                alert(data.message || data.error?.message || 'Failed to update user');
                return false;
            }
        } catch (error) {
            console.error('❌ UserManagement handleEditUser: Error:', error);
            alert(`Failed to update user: ${error.message || 'Network error'}`);
            return false;
        }
    };

    const handleDeleteUser = async (userId, userName) => {
        if (!confirm(`Are you sure you want to delete user "${userName}"?`)) {
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            console.log('🗑️ Deleting user:', userId);
            
            const response = await fetch(`/api/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            
            if (response.ok) {
                console.log('✅ User deleted successfully');
                loadUsers();
                alert('User deleted successfully');
            } else {
                console.error('❌ Failed to delete user:', data);
                const errorMessage = data.message || data.error || 'Failed to delete user';
                alert(`Failed to delete user: ${errorMessage}`);
            }
        } catch (error) {
            console.error('❌ Error deleting user:', error);
            alert(`Failed to delete user: ${error.message || 'Network error. Please try again.'}`);
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
        console.log('🗑️ Delete invitation clicked:', { invitationId, email });
        
        if (!invitationId) {
            console.error('❌ No invitation ID provided');
            alert('Error: Invitation ID is missing');
            return;
        }

        if (!confirm(`Are you sure you want to delete the invitation for ${email}?`)) {
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

            if (response.ok) {
                alert('Invitation deleted successfully');
                await loadUsers();
            } else {
                alert(data.message || 'Failed to delete invitation');
            }
        } catch (error) {
            console.error('❌ Error deleting invitation:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack
            });
            alert(`Failed to delete invitation: ${error.message}`);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

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
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 
                        className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}
                        style={{ color: isDark ? '#f3f4f6' : '#111827' }}
                    >
                        User Management
                    </h1>
                    <p 
                        className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                        style={{ color: isDark ? '#9ca3af' : '#4b5563' }}
                    >
                        Manage users and send invitations
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setNewUser({
                                name: '',
                                email: '',
                                role: 'user',
                                department: '',
                                phone: '',
                                status: 'active',
                                accessibleProjectIds: []
                            });
                            setShowAddUserModal(true);
                        }}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
                    >
                        <i className="fas fa-user-plus mr-2"></i>
                        Add User
                    </button>
                    <button
                        onClick={() => {
                            setNewUser({
                                name: '',
                                email: '',
                                role: 'guest',
                                department: '',
                                phone: '',
                                status: 'active',
                                accessibleProjectIds: []
                            });
                            setShowAddUserModal(true);
                        }}
                        className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors flex items-center"
                    >
                        <i className="fas fa-user-friends mr-2"></i>
                        Add Guest
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
                <div className={`px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <h3 className={`text-lg font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Users</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className={isDark ? 'bg-gray-700' : 'bg-gray-100'}>
                            <tr>
                                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                }`}>User</th>
                                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                }`}>Role</th>
                                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                }`}>Status</th>
                                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                }`}>Last Seen</th>
                                <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                }`}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                            {users.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className={`px-6 py-8 text-center ${
                                        isDark ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                        No users found. Add users or send invitations to get started.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className={isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="relative">
                                                    <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                                                        <i className="fas fa-user text-gray-600 dark:text-gray-400"></i>
                                                    </div>
                                                    {isUserOnline(user) && (
                                                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800"></div>
                                                    )}
                                                </div>
                                                <div className="ml-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</div>
                                                        {isUserOnline(user) && (
                                                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">●</span>
                                                        )}
                                                    </div>
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
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {isUserOnline(user) ? (
                                                <span className="text-sm text-green-600 dark:text-green-400 font-medium">Online</span>
                                            ) : (
                                                <span className="text-sm text-gray-500 dark:text-gray-400">{formatLastSeen(user)}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        console.log('✅ Edit button clicked for user:', user.name, user.id);
                                                        setEditingUser(user);
                                                        setShowEditUserModal(true);
                                                    }}
                                                    className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-900/30 dark:hover:bg-green-900/50 rounded-lg transition-colors flex items-center gap-2 border border-green-200 dark:border-green-800"
                                                    title="Edit User - Change Role"
                                                    style={{ minWidth: '70px' }}
                                                >
                                                    <i className="fas fa-edit text-xs"></i>
                                                    <span className="text-xs font-semibold">Edit</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                    // Parse user permissions
                                                    let userPermissions = [];
                                                    if (user.permissions) {
                                                        try {
                                                            if (typeof user.permissions === 'string') {
                                                                const parsed = JSON.parse(user.permissions);
                                                                userPermissions = Array.isArray(parsed) ? parsed : [];
                                                            } else if (Array.isArray(user.permissions)) {
                                                                userPermissions = user.permissions;
                                                            }
                                                        } catch (e) {
                                                            console.warn('Failed to parse user permissions:', e);
                                                            userPermissions = [];
                                                        }
                                                    }
                                                    
                                                    // If user has custom permissions set, use ONLY those (don't merge with defaults)
                                                    // Otherwise, use default permissions based on role
                                                    let finalPermissions = [];
                                                    
                                                    if (userPermissions && userPermissions.length > 0) {
                                                        // User has custom permissions - use them exclusively
                                                        console.log('📋 Loading custom permissions for user:', user.email, userPermissions);
                                                        finalPermissions = userPermissions;
                                                    } else {
                                                        // No custom permissions - use defaults based on role
                                                        const permissionCategories = window.PERMISSION_CATEGORIES || {};
                                                        const isAdmin = user?.role?.toLowerCase() === 'admin';
                                                        
                                                        Object.values(permissionCategories).forEach(category => {
                                                            // Add public permissions (all users)
                                                            if (!category.adminOnly) {
                                                                finalPermissions.push(category.permission);
                                                            }
                                                            // Add admin-only permissions if user is admin
                                                            if (category.adminOnly && isAdmin) {
                                                                finalPermissions.push(category.permission);
                                                            }
                                                            if (Array.isArray(category.subcategories) && category.subcategories.length > 0) {
                                                                category.subcategories.forEach(subcategory => {
                                                                    if (!category.adminOnly || isAdmin) {
                                                                        finalPermissions.push(subcategory.permission);
                                                                    }
                                                                });
                                                            }
                                                        });
                                                        console.log('📋 Using default permissions for user:', user.email, finalPermissions);
                                                    }
                                                    
                                                    setEditingUserPermissions(user);
                                                    setSelectedPermissions(finalPermissions);
                                                    setShowPermissionsModal(true);
                                                    }}
                                                    className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-lg transition-colors flex items-center gap-2 border border-blue-200 dark:border-blue-800"
                                                    title="Manage Permissions"
                                                    style={{ minWidth: '100px' }}
                                                >
                                                    <i className="fas fa-key text-xs"></i>
                                                    <span className="text-xs font-semibold">Permissions</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(user.id, user.name)}
                                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                                                    title="Delete User"
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
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
                    <div className={`px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <h3 className={`text-lg font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Pending Invitations</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className={isDark ? 'bg-gray-700' : 'bg-gray-100'}>
                                <tr>
                                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>Email</th>
                                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>Name</th>
                                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>Role</th>
                                    <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>Expires</th>
                                    <th className={`px-6 py-3 text-right text-xs font-medium uppercase tracking-wider ${
                                        isDark ? 'text-gray-300' : 'text-gray-700'
                                    }`}>Actions</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                                {invitations.filter(inv => inv.status === 'pending').map((invitation) => (
                                    <tr key={invitation.id} onClick={(e) => {
                                        // Prevent row click from interfering with button clicks
                                        if (e.target.closest('button')) {
                                            return;
                                        }
                                    }}>
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
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleEditInvitation(invitation);
                                                    }}
                                                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                    title="Edit"
                                                    type="button"
                                                >
                                                    <i className="fas fa-edit"></i>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleResendInvitation(invitation.id);
                                                    }}
                                                    className="text-green-600 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300 px-2 py-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20"
                                                    title="Resend"
                                                    type="button"
                                                >
                                                    <i className="fas fa-paper-plane"></i>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        console.log('🔴 CLICK EVENT FIRED');
                                                        console.log('🔴 Event target:', e.target);
                                                        console.log('🔴 Current target:', e.currentTarget);
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        e.cancelBubble = true;
                                                        console.log('🔴 Delete button clicked for invitation:', invitation);
                                                        console.log('🔴 Invitation ID:', invitation?.id);
                                                        console.log('🔴 Invitation Email:', invitation?.email);
                                                        alert(`Testing delete for: ${invitation?.email || 'unknown'}`);
                                                        if (!invitation || !invitation.id) {
                                                            console.error('❌ Invalid invitation object:', invitation);
                                                            alert('Error: Invalid invitation data');
                                                            return;
                                                        }
                                                        handleDeleteInvitation(invitation.id, invitation.email);
                                                    }}
                                                    onMouseDown={(e) => {
                                                        console.log('🖱️ MOUSE DOWN EVENT');
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        e.cancelBubble = true;
                                                        console.log('🖱️ Delete button mouse down');
                                                    }}
                                                    onTouchStart={(e) => {
                                                        console.log('👆 TOUCH START EVENT');
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        e.cancelBubble = true;
                                                        console.log('👆 Delete button touch start');
                                                    }}
                                                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 cursor-pointer px-3 py-2 rounded hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-300 dark:border-red-700 hover:border-red-400 dark:hover:border-red-600 min-w-[40px] min-h-[40px] flex items-center justify-center"
                                                    title="Delete Invitation"
                                                    type="button"
                                                    style={{ 
                                                        pointerEvents: 'auto', 
                                                        zIndex: 10,
                                                        position: 'relative',
                                                        display: 'inline-flex'
                                                    }}
                                                >
                                                    <i className="fas fa-trash text-sm"></i>
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
                                    <option value="user">User</option>
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
                                    onChange={(e) => setNewUser({...newUser, role: e.target.value, accessibleProjectIds: e.target.value === 'guest' ? [] : newUser.accessibleProjectIds})}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="user">User</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                    <option value="guest">Guest</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Guest users can only view specified projects
                                </p>
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

                            {/* Project Access for Guest Users */}
                            {newUser.role === 'guest' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Accessible Projects
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                        Select which projects this guest user can view
                                    </p>
                                    {loadingProjects ? (
                                        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Loading projects...
                                        </div>
                                    ) : availableProjects.length === 0 ? (
                                        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                                            No projects available. Create projects first before assigning guest access.
                                        </div>
                                    ) : (
                                        <div className={`border ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-gray-50'} rounded-lg p-3 max-h-60 overflow-y-auto`}>
                                            <div className="space-y-2">
                                                {availableProjects.map(project => {
                                                    const isSelected = newUser.accessibleProjectIds.includes(project.id);
                                                    return (
                                                        <label
                                                            key={project.id}
                                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setNewUser({
                                                                            ...newUser,
                                                                            accessibleProjectIds: [...newUser.accessibleProjectIds, project.id]
                                                                        });
                                                                    } else {
                                                                        setNewUser({
                                                                            ...newUser,
                                                                            accessibleProjectIds: newUser.accessibleProjectIds.filter(id => id !== project.id)
                                                                        });
                                                                    }
                                                                }}
                                                                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                                            />
                                                            <span className={`text-sm flex-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                                                {project.name}
                                                                {project.clientName && (
                                                                    <span className={`ml-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>({project.clientName})</span>
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

            {/* Edit User Modal */}
            {showEditUserModal && editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-xl p-6 max-w-md w-full ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                <i className="fas fa-user-edit mr-2 text-green-600"></i>
                                Edit User - {editingUser.name}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowEditUserModal(false);
                                    setEditingUser(null);
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            // Parse accessibleProjectIds if role is guest
                            let accessibleProjectIds = [];
                            const role = formData.get('role');
                            if (role === 'guest') {
                                const projectIdsInput = formData.get('accessibleProjectIds');
                                if (projectIdsInput) {
                                    try {
                                        const parsed = JSON.parse(projectIdsInput);
                                        accessibleProjectIds = Array.isArray(parsed) ? parsed : [];
                                    } catch (e) {
                                        console.warn('Failed to parse accessibleProjectIds:', e);
                                        accessibleProjectIds = [];
                                    }
                                }
                            }
                            
                            const userData = {
                                name: formData.get('name'),
                                email: formData.get('email'),
                                role: role,
                                status: formData.get('status'),
                                department: formData.get('department') || '',
                                phone: formData.get('phone') || '',
                                ...(role === 'guest' && { accessibleProjectIds: accessibleProjectIds })
                            };
                            
                            console.log('📤 UserManagement: Sending user update:', {
                                userId: editingUser.id,
                                role: userData.role,
                                hasAccessibleProjectIds: userData.accessibleProjectIds !== undefined,
                                accessibleProjectIds: userData.accessibleProjectIds,
                                accessibleProjectIdsLength: userData.accessibleProjectIds?.length || 0
                            });
                            
                            const success = await handleEditUser(editingUser.id, userData);
                            if (success) {
                                setShowEditUserModal(false);
                                setEditingUser(null);
                            }
                        }} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    defaultValue={editingUser.name}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    defaultValue={editingUser.email}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Role <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="role"
                                    defaultValue={editingUser.role || 'user'}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                    required
                                    onChange={(e) => {
                                        // Update accessibleProjectIds when role changes
                                        if (e.target.value !== 'guest') {
                                            const form = e.target.closest('form');
                                            if (form) {
                                                const hiddenInput = form.querySelector('input[name="accessibleProjectIds"]');
                                                if (hiddenInput) {
                                                    hiddenInput.value = '[]';
                                                }
                                            }
                                        }
                                    }}
                                >
                                    <option value="user">User</option>
                                    <option value="manager">Manager</option>
                                    <option value="admin">Admin</option>
                                    <option value="guest">Guest</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Change the user's role to grant or revoke permissions
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Status
                                </label>
                                <select
                                    name="status"
                                    defaultValue={editingUser.status || 'active'}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="suspended">Suspended</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Department
                                </label>
                                <input
                                    type="text"
                                    name="department"
                                    defaultValue={editingUser.department || ''}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Phone
                                </label>
                                <input
                                    type="tel"
                                    name="phone"
                                    defaultValue={editingUser.phone || ''}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                />
                            </div>

                            {/* Project Access for Guest Users */}
                            {editingUser?.role === 'guest' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Accessible Projects
                                    </label>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                        Select which projects this guest user can view
                                    </p>
                                    <input
                                        type="hidden"
                                        name="accessibleProjectIds"
                                        value={JSON.stringify(
                                            (() => {
                                                // Parse existing accessibleProjectIds
                                                let existingIds = [];
                                                if (editingUser?.accessibleProjectIds) {
                                                    if (typeof editingUser.accessibleProjectIds === 'string') {
                                                        try {
                                                            existingIds = JSON.parse(editingUser.accessibleProjectIds);
                                                        } catch (e) {
                                                            existingIds = [];
                                                        }
                                                    } else if (Array.isArray(editingUser.accessibleProjectIds)) {
                                                        existingIds = editingUser.accessibleProjectIds;
                                                    }
                                                }
                                                return existingIds;
                                            })()
                                        )}
                                    />
                                    {loadingProjects ? (
                                        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                                            <i className="fas fa-spinner fa-spin mr-2"></i>
                                            Loading projects...
                                        </div>
                                    ) : availableProjects.length === 0 ? (
                                        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
                                            No projects available. Create projects first before assigning guest access.
                                        </div>
                                    ) : (
                                        <div className={`border ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-gray-50'} rounded-lg p-3 max-h-60 overflow-y-auto`}>
                                            <div className="space-y-2" id="edit-user-projects-list">
                                                {availableProjects.map(project => {
                                                    const existingIds = (() => {
                                                        let ids = [];
                                                        if (editingUser?.accessibleProjectIds) {
                                                            if (typeof editingUser.accessibleProjectIds === 'string') {
                                                                try {
                                                                    ids = JSON.parse(editingUser.accessibleProjectIds);
                                                                } catch (e) {
                                                                    ids = [];
                                                                }
                                                            } else if (Array.isArray(editingUser.accessibleProjectIds)) {
                                                                ids = editingUser.accessibleProjectIds;
                                                            }
                                                        }
                                                        return ids;
                                                    })();
                                                    const isSelected = existingIds.includes(project.id);
                                                    return (
                                                        <label
                                                            key={project.id}
                                                            className={`flex items-center gap-2 p-2 rounded cursor-pointer ${isDark ? 'hover:bg-gray-600' : 'hover:bg-gray-100'}`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                defaultChecked={isSelected}
                                                                data-project-id={project.id}
                                                                onChange={(e) => {
                                                                    const hiddenInput = document.querySelector('input[name="accessibleProjectIds"]');
                                                                    if (hiddenInput) {
                                                                        let currentIds = [];
                                                                        try {
                                                                            currentIds = JSON.parse(hiddenInput.value);
                                                                        } catch (e) {
                                                                            currentIds = [];
                                                                        }
                                                                        if (e.target.checked) {
                                                                            if (!currentIds.includes(project.id)) {
                                                                                currentIds.push(project.id);
                                                                            }
                                                                        } else {
                                                                            currentIds = currentIds.filter(id => id !== project.id);
                                                                        }
                                                                        hiddenInput.value = JSON.stringify(currentIds);
                                                                    }
                                                                }}
                                                                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                                            />
                                                            <span className={`text-sm flex-1 ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                                                {project.name}
                                                                {project.clientName && (
                                                                    <span className={`ml-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>({project.clientName})</span>
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

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditUserModal(false);
                                        setEditingUser(null);
                                    }}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                >
                                    <i className="fas fa-save mr-2"></i>
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Permissions Management Modal */}
            {showPermissionsModal && editingUserPermissions && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto ${isDark ? 'bg-gray-800' : 'bg-white'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                <i className="fas fa-key mr-2 text-blue-600"></i>
                                Manage Permissions - {editingUserPermissions.name || editingUserPermissions.email}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowPermissionsModal(false);
                                    setEditingUserPermissions(null);
                                    setSelectedPermissions([]);
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900 rounded-lg">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <i className="fas fa-info-circle mr-2"></i>
                                <strong>Role:</strong> {editingUserPermissions.role || 'user'} | All users have access to CRM, Projects, Team, Manufacturing, Documents, Leave Platform, Tool, and Reports. Only Admins can access Users.
                            </p>
                        </div>

                        <div className="space-y-4">
                            {/* Permission Categories */}
                            {(() => {
                                // Get permission categories - ensure it's loaded
                                let permissionCategories = window.PERMISSION_CATEGORIES;
                                
                                // If not loaded, try to get from permissions module
                                if (!permissionCategories || Object.keys(permissionCategories).length === 0) {
                                    console.warn('PERMISSION_CATEGORIES not loaded, checking permissions.js...');
                                    // Fallback: create categories from PERMISSIONS if available
                                    if (window.PERMISSIONS) {
                                        permissionCategories = {
                                            CRM: {
                                                id: 'crm',
                                                label: 'CRM',
                                                permission: window.PERMISSIONS.ACCESS_CRM,
                                                description: 'Customer Relationship Management',
                                                adminOnly: false
                                            },
                                            PROJECTS: {
                                                id: 'projects',
                                                label: 'Projects',
                                                permission: window.PERMISSIONS.ACCESS_PROJECTS,
                                                description: 'Project Management',
                                                adminOnly: false
                                            },
                                            TEAM: {
                                                id: 'team',
                                                label: 'Team',
                                                permission: window.PERMISSIONS.ACCESS_TEAM,
                                                description: 'Team Management',
                                                adminOnly: false,
                                                subcategories: [
                                                    {
                                                        id: 'team_management',
                                                        label: 'Management',
                                                        permission: window.PERMISSIONS?.TEAM_MANAGEMENT || 'team_management_management',
                                                        description: 'Executive leadership and strategic planning',
                                                        adminOnly: true
                                                    },
                                                    {
                                                        id: 'team_technical',
                                                        label: 'Technical',
                                                        permission: window.PERMISSIONS?.TEAM_TECHNICAL || 'team_management_technical',
                                                        description: 'Technical operations and system maintenance'
                                                    },
                                                    {
                                                        id: 'team_support',
                                                        label: 'Support',
                                                        permission: window.PERMISSIONS?.TEAM_SUPPORT || 'team_management_support',
                                                        description: 'Customer support and service delivery'
                                                    },
                                                    {
                                                        id: 'team_data_analytics',
                                                        label: 'Data Analytics',
                                                        permission: window.PERMISSIONS?.TEAM_DATA_ANALYTICS || 'team_management_data_analytics',
                                                        description: 'Data analysis and business intelligence'
                                                    },
                                                    {
                                                        id: 'team_finance',
                                                        label: 'Finance',
                                                        permission: window.PERMISSIONS?.TEAM_FINANCE || 'team_management_finance',
                                                        description: 'Financial management and accounting'
                                                    },
                                                    {
                                                        id: 'team_business_development',
                                                        label: 'Business Development',
                                                        permission: window.PERMISSIONS?.TEAM_BUSINESS_DEVELOPMENT || 'team_management_business_development',
                                                        description: 'Growth strategies and new opportunities'
                                                    },
                                                    {
                                                        id: 'team_commercial',
                                                        label: 'Commercial',
                                                        permission: window.PERMISSIONS?.TEAM_COMMERCIAL || 'team_management_commercial',
                                                        description: 'Sales and commercial operations'
                                                    },
                                                    {
                                                        id: 'team_compliance',
                                                        label: 'Compliance',
                                                        permission: window.PERMISSIONS?.TEAM_COMPLIANCE || 'team_management_compliance',
                                                        description: 'Regulatory compliance and risk management'
                                                    }
                                                ]
                                            },
                                            USERS: {
                                                id: 'users',
                                                label: 'Users',
                                                permission: window.PERMISSIONS.ACCESS_USERS,
                                                description: 'User Management',
                                                adminOnly: true
                                            },
                                            MANUFACTURING: {
                                                id: 'manufacturing',
                                                label: 'Manufacturing',
                                                permission: window.PERMISSIONS.ACCESS_MANUFACTURING,
                                                description: 'Manufacturing Operations',
                                                adminOnly: false
                                            },
                                            DOCUMENTS: {
                                                id: 'documents',
                                                label: 'Documents',
                                                permission: ensurePermissionValue('ACCESS_DOCUMENTS', 'access_documents'),
                                                description: 'Shared document library and uploads',
                                                adminOnly: false
                                            },
                                            TOOL: {
                                                id: 'tool',
                                                label: 'Tool',
                                                permission: window.PERMISSIONS.ACCESS_TOOL,
                                                description: 'Tool Management',
                                                adminOnly: false
                                            },
                                            LEAVE_PLATFORM: {
                                                id: 'leave_platform',
                                                label: 'Leave Platform',
                                                permission: ensurePermissionValue('ACCESS_LEAVE_PLATFORM', 'access_leave_platform'),
                                                description: 'Employee leave management workspace',
                                                adminOnly: false
                                            },
                                            REPORTS: {
                                                id: 'reports',
                                                label: 'Reports',
                                                permission: window.PERMISSIONS.ACCESS_REPORTS,
                                                description: 'Reports and Analytics',
                                                adminOnly: false
                                            }
                                        };
                                    } else {
                                        console.error('PERMISSIONS not available!');
                                        return (
                                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900 rounded-lg">
                                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                                    <i className="fas fa-exclamation-triangle mr-2"></i>
                                                    Permissions system not loaded. Please refresh the page.
                                                </p>
                                            </div>
                                        );
                                    }
                                }
                                
                                const ensurePermissionValue = (permissionKey, fallback) => {
                                    return window.PERMISSIONS?.[permissionKey] || fallback;
                                };
                                
                                const ensureCategory = (categories, key, config) => {
                                    if (!categories) return categories;
                                    if (!categories[key]) {
                                        return { ...categories, [key]: config };
                                    }
                                    return categories;
                                };
                                
                                permissionCategories = ensureCategory(permissionCategories, 'DOCUMENTS', {
                                    id: 'documents',
                                    label: 'Documents',
                                    permission: ensurePermissionValue('ACCESS_DOCUMENTS', 'access_documents'),
                                    description: 'Shared document library and uploads',
                                    adminOnly: false
                                });
                                
                                permissionCategories = ensureCategory(permissionCategories, 'LEAVE_PLATFORM', {
                                    id: 'leave_platform',
                                    label: 'Leave Platform',
                                    permission: ensurePermissionValue('ACCESS_LEAVE_PLATFORM', 'access_leave_platform'),
                                    description: 'Employee leave management workspace',
                                    adminOnly: false
                                });
                                
                                const isAdmin = editingUserPermissions?.role?.toLowerCase() === 'admin';
                                
                                return Object.values(permissionCategories).map((category) => {
                                    const isAdminOnly = category.adminOnly;
                                    const isChecked = selectedPermissions.includes(category.permission);
                                    const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];
                                    const canEdit = !isAdminOnly || isAdmin; // Can edit if not admin-only OR user is admin
                                    
                                    return (
                                        <div 
                                            key={category.id} 
                                            className={`border rounded-lg p-4 ${
                                                isAdminOnly && !isAdmin 
                                                    ? 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 opacity-60' 
                                                    : 'border-gray-200 dark:border-gray-700'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                                                        {category.label}
                                                    </h4>
                                                    {isAdminOnly && (
                                                        <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                                                            Admin Only
                                                        </span>
                                                    )}
                                                </div>
                                                <label className={`flex items-center ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        disabled={!canEdit}
                                                        onChange={(e) => {
                                                            if (!canEdit) return;
                                                            
                                                            const shouldEnable = e.target.checked;
                                                            const subPermissionIds = subcategories.map(sub => sub.permission);
                                                            
                                                            setSelectedPermissions(prev => {
                                                                const current = Array.isArray(prev) ? [...prev] : [];
                                                                
                                                                if (shouldEnable) {
                                                                    if (!current.includes(category.permission)) {
                                                                        current.push(category.permission);
                                                                    }
                                                                    return current;
                                                                }
                                                                
                                                                return current.filter(permissionValue => 
                                                                    permissionValue !== category.permission && !subPermissionIds.includes(permissionValue)
                                                                );
                                                            });
                                                        }}
                                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                    />
                                                    <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                                                        {isChecked ? 'Enabled' : 'Disabled'}
                                                    </span>
                                                </label>
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {category.description}
                                            </p>
                                            {subcategories.length > 0 && (
                                                <div className={`mt-3 pl-4 border-l ${
                                                    isChecked 
                                                        ? 'border-blue-100 dark:border-blue-800' 
                                                        : 'border-gray-200 dark:border-gray-700 opacity-60'
                                                }`}>
                                                    <div className="space-y-2">
                                                        {subcategories.map((sub) => {
                                                            const subChecked = selectedPermissions.includes(sub.permission);
                                                            const subIsAdminOnly = sub.adminOnly === true 
                                                                || sub.id === 'team_management' 
                                                                || sub.permission === (window.PERMISSIONS?.TEAM_MANAGEMENT || 'team_management_management');
                                                            const subCanEdit = canEdit && isChecked && (!subIsAdminOnly || isAdmin);
                                                            
                                                            return (
                                                                <label
                                                                    key={sub.id}
                                                                    className={`flex items-start gap-2 p-2 rounded ${
                                                                        subCanEdit
                                                                            ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
                                                                            : 'cursor-not-allowed opacity-60'
                                                                    }`}
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                                                                        checked={subChecked}
                                                                        disabled={!subCanEdit}
                                                                        onChange={(e) => {
                                                                            if (!subCanEdit) return;
                                                                            const shouldEnableSub = e.target.checked;
                                                                            
                                                                            setSelectedPermissions(prev => {
                                                                                const current = Array.isArray(prev) ? [...prev] : [];
                                                                                
                                                                                if (shouldEnableSub) {
                                                                                    if (!current.includes(sub.permission)) {
                                                                                        current.push(sub.permission);
                                                                                    }
                                                                                    if (!current.includes(category.permission)) {
                                                                                        current.push(category.permission);
                                                                                    }
                                                                                    return current;
                                                                                }
                                                                                
                                                                                return current.filter(permissionValue => permissionValue !== sub.permission);
                                                                            });
                                                                        }}
                                                                    />
                                                                    <div className="flex-1">
                                                                        <p className={`flex items-center gap-2 text-sm font-medium ${subCanEdit ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                            {sub.label}
                                                                            {subIsAdminOnly && (
                                                                                <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded">
                                                                                    Admin Only
                                                                                </span>
                                                                            )}
                                                                        </p>
                                                                        {sub.description && (
                                                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                                {sub.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                    <span className={`text-xs ${subChecked ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                        {subChecked ? 'Enabled' : 'Disabled'}
                                                                    </span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {isAdminOnly && !isAdmin && (
                                                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                                                    <i className="fas fa-lock mr-1"></i>
                                                    Only administrators can access this module
                                                </p>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>

                        <div className="mt-6 flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={async () => {
                                    try {
                                        const token = window.storage?.getToken?.();
                                        // Ensure selectedPermissions is an array, not a string
                                        const permissionsArray = Array.isArray(selectedPermissions) 
                                            ? selectedPermissions 
                                            : (typeof selectedPermissions === 'string' 
                                                ? JSON.parse(selectedPermissions) 
                                                : []);
                                        
                                        const requestBody = {
                                            userId: editingUserPermissions.id,
                                            permissions: permissionsArray  // Send as array, not stringified
                                        };
                                        console.log('📤 Sending permissions update:', {
                                            userId: editingUserPermissions.id,
                                            selectedPermissions,
                                            selectedPermissionsType: typeof selectedPermissions,
                                            isArray: Array.isArray(selectedPermissions),
                                            permissionsArray,
                                            requestBody
                                        });
                                        
                                        const response = await fetch('/api/users', {
                                            method: 'PUT',
                                            headers: {
                                                'Content-Type': 'application/json',
                                                'Authorization': `Bearer ${token}`
                                            },
                                            body: JSON.stringify(requestBody)
                                        });

                                        const data = await response.json();
                                        console.log('📥 Response from server:', { status: response.status, data });
                                        
                                        if (response.ok) {
                                            // Handle response format: {data: {success, message, user}}
                                            // The ok() function wraps everything in {data: ...}
                                            const responseUser = data.data?.user || data.user;
                                            console.log('✅ Permissions saved successfully, response user:', responseUser);
                                            // Update the user in the local state immediately with the response data
                                            if (responseUser) {
                                                // Parse permissions from response
                                                let parsedPermissions = [];
                                                if (responseUser.permissions) {
                                                    try {
                                                        if (typeof responseUser.permissions === 'string') {
                                                            const parsed = JSON.parse(responseUser.permissions);
                                                            parsedPermissions = Array.isArray(parsed) ? parsed : [];
                                                        } else if (Array.isArray(responseUser.permissions)) {
                                                            parsedPermissions = responseUser.permissions;
                                                        }
                                                    } catch (e) {
                                                        console.warn('Failed to parse permissions from response:', e);
                                                    }
                                                }
                                                
                                                // Update the user in the users array
                                                setUsers(prevUsers => {
                                                    return prevUsers.map(u => {
                                                        if (u.id === responseUser.id) {
                                                            return {
                                                                ...u,
                                                                ...responseUser,
                                                                permissions: parsedPermissions
                                                            };
                                                        }
                                                        return u;
                                                    });
                                                });
                                                
                                                console.log('✅ Updated user in state with permissions:', parsedPermissions);
                                            }
                                            
                                            alert('Permissions updated successfully');
                                            // Close modal first
                                            setShowPermissionsModal(false);
                                            setEditingUserPermissions(null);
                                            setSelectedPermissions([]);
                                            // Then reload users to get fresh data from server
                                            await loadUsers();
                                        } else {
                                            alert(data.message || 'Failed to update permissions');
                                        }
                                    } catch (error) {
                                        console.error('Error updating permissions:', error);
                                        alert('Failed to update permissions: ' + error.message);
                                    }
                                }}
                                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <i className="fas fa-save mr-2"></i>
                                Save Permissions
                            </button>
                            <button
                                onClick={() => {
                                    setShowPermissionsModal(false);
                                    setEditingUserPermissions(null);
                                    setSelectedPermissions([]);
                                }}
                                className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
try {
    window.UserManagement = UserManagement;
    console.log('✅ UserManagement.jsx loaded and registered on window.UserManagement', typeof window.UserManagement);
    
    // Dispatch ready event
    if (typeof window.dispatchEvent === 'function') {
        try {
            window.dispatchEvent(new CustomEvent('usersComponentReady'));
            console.log('📢 Dispatched usersComponentReady event');
            
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
    console.error('❌ UserManagement.jsx: Error registering component:', error, error.stack);
}
