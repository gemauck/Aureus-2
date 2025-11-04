// Settings Portal Component - Modal/dropdown for account settings
const { useState, useEffect, useCallback } = React;

const SettingsPortal = ({ isOpen, onClose }) => {
    const [activeTab, setActiveTab] = useState('profile');
    const [profile, setProfile] = useState({
        name: '',
        email: '',
        phone: '',
        department: '',
        jobTitle: ''
    });
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [showPasswords, setShowPasswords] = useState({
        current: false,
        new: false,
        confirm: false
    });
    const [isLoading, setIsLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const { user } = window.useAuth();
    const { isDark } = window.useTheme();

    const tabs = [
        { id: 'profile', label: 'Profile', icon: 'fa-user' },
        { id: 'security', label: 'Security', icon: 'fa-shield-alt' }
    ];

    const loadProfile = useCallback(async () => {
        try {
            setIsLoading(true);
            
            // Use DatabaseAPI if available, otherwise fallback to direct fetch
            if (window.DatabaseAPI?.makeRequest) {
                try {
                    const data = await window.DatabaseAPI.makeRequest('/me');
                    const user = data?.data?.user || data?.user;
                    if (user) {
                        const updatedProfile = {
                            name: user.name || '',
                            email: user.email || '',
                            phone: user.phone || '',
                            department: user.department || '',
                            jobTitle: user.jobTitle || ''
                        };
                        setProfile(updatedProfile);
                        
                        // Update storage silently (don't trigger global refresh during load)
                        if (window.storage && window.storage.setUser) {
                            window.storage.setUser(user);
                        }
                    }
                    return;
                } catch (apiError) {
                    console.error('DatabaseAPI error, falling back to direct fetch:', apiError);
                }
            }
            
            // Fallback to direct fetch
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('No authentication token available');
                setIsLoading(false);
                return;
            }

            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const user = data?.data?.user || data?.user;
                if (user) {
                    const updatedProfile = {
                        name: user.name || '',
                        email: user.email || '',
                        phone: user.phone || '',
                        department: user.department || '',
                        jobTitle: user.jobTitle || ''
                    };
                    setProfile(updatedProfile);
                    
                    // Update storage silently (don't trigger global refresh during load)
                    if (window.storage && window.storage.setUser) {
                        window.storage.setUser(user);
                    }
                }
            } else {
                console.error('Failed to load profile:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Use ref to track if we've loaded profile for this modal open session
    const hasLoadedRef = React.useRef(false);
    
    useEffect(() => {
        // Reset loading flag when modal closes
        if (!isOpen) {
            hasLoadedRef.current = false;
            return;
        }
        
        // Only load once per modal open session
        if (hasLoadedRef.current) {
            return;
        }
        
        // Initialize from user prop if available (immediate display)
        if (user && (user.id || user.email)) {
            setProfile({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                department: user.department || '',
                jobTitle: user.jobTitle || ''
            });
        }
        
        // Always load fresh data from server when modal opens (only once)
        const userId = user?.id || user?.sub;
        if (userId) {
            console.log('🔧 SettingsPortal: Loading profile for user:', userId);
            hasLoadedRef.current = true;
            loadProfile();
        } else {
            // If user isn't loaded yet, wait a bit and try again
            console.log('⚠️ SettingsPortal: User not available, checking storage...');
            const timer = setTimeout(() => {
                const storedUser = window.storage?.getUser?.();
                if (storedUser && (storedUser.id || storedUser.email)) {
                    console.log('🔧 SettingsPortal: Found user in storage, loading profile');
                    setProfile({
                        name: storedUser.name || '',
                        email: storedUser.email || '',
                        phone: storedUser.phone || '',
                        department: storedUser.department || '',
                        jobTitle: storedUser.jobTitle || ''
                    });
                    hasLoadedRef.current = true;
                    loadProfile();
                } else {
                    console.error('❌ SettingsPortal: No user found in storage');
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isOpen, loadProfile]); // Removed 'user' from deps to prevent infinite loop

    useEffect(() => {
        // Close on Escape key
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleProfileSave = async () => {
        setIsLoading(true);
        setSaveStatus('Saving...');
        
        try {
            // Get user ID from user prop or storage
            const currentUser = user || window.storage?.getUser?.();
            const userId = currentUser?.id || currentUser?.sub;
            
            if (!userId) {
                console.error('❌ SettingsPortal: No user ID available', { user, storageUser: window.storage?.getUser?.() });
                setSaveStatus('User information not available');
                setIsLoading(false);
                return;
            }

            const token = window.storage?.getToken?.();
            if (!token) {
                setSaveStatus('Authentication required. Please log in again.');
                setIsLoading(false);
                return;
            }

            console.log('💾 Saving profile:', profile, 'for user:', userId);
            
            // Use DatabaseAPI if available for consistent error handling
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify(profile)
            });

            console.log('📡 Profile save response status:', response.status);
            let data;
            try {
                data = await response.json();
                console.log('📡 Profile save response data:', data);
            } catch (parseError) {
                console.error('Error parsing response:', parseError);
                setSaveStatus('Error: Invalid response from server');
                setIsLoading(false);
                return;
            }

            if (response.ok && (data.success || data.user)) {
                setSaveStatus('Profile updated successfully!');
                
                // Reload fresh user data from server
                try {
                    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
                    const meResponse = await fetch(`${apiBase}/api/me`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        credentials: 'include'
                    });
                    
                    if (meResponse.ok) {
                        const meData = await meResponse.json();
                        console.log('🔄 Refreshed user data:', meData);
                        if (meData.user || meData.data?.user) {
                            const updatedUser = meData.user || meData.data.user;
                            // Update storage with fresh data from server
                            if (window.storage && window.storage.setUser) {
                                window.storage.setUser(updatedUser);
                            }
                            // Update local profile state with fresh data
                            setProfile({
                                name: updatedUser.name || '',
                                email: updatedUser.email || '',
                                phone: updatedUser.phone || '',
                                department: updatedUser.department || '',
                                jobTitle: updatedUser.jobTitle || ''
                            });
                            // Notify auth context to refresh
                            window.dispatchEvent(new CustomEvent('userDataUpdated'));
                        }
                    }
                } catch (refreshError) {
                    console.error('Error refreshing user data:', refreshError);
                    // Fallback to using response data if available
                    if (data.user) {
                        if (window.storage && window.storage.setUser) {
                            window.storage.setUser(data.user);
                        }
                        setProfile({
                            name: data.user.name || '',
                            email: data.user.email || '',
                            phone: data.user.phone || '',
                            department: data.user.department || '',
                            jobTitle: data.user.jobTitle || ''
                        });
                        window.dispatchEvent(new CustomEvent('userDataUpdated'));
                    } else {
                        // Final fallback to using updated profile data
                        if (window.storage && window.storage.setUser) {
                            window.storage.setUser({ ...user, ...profile });
                        }
                    }
                }

                setTimeout(() => {
                    setSaveStatus('');
                }, 2000);
            } else {
                const errorMsg = data.message || data.error?.message || data.error || 'Failed to update profile';
                console.error('❌ Profile update failed:', errorMsg);
                setSaveStatus(errorMsg);
                setTimeout(() => setSaveStatus(''), 5000);
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            setSaveStatus('Error updating profile: ' + error.message);
            setTimeout(() => setSaveStatus(''), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePasswordChange = async () => {
        setIsLoading(true);
        setSaveStatus('Changing password...');
        
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setSaveStatus('Passwords do not match');
            setTimeout(() => setSaveStatus(''), 3000);
            setIsLoading(false);
            return;
        }

        if (passwordForm.newPassword.length < 8) {
            setSaveStatus('Password must be at least 8 characters long');
            setTimeout(() => setSaveStatus(''), 3000);
            setIsLoading(false);
            return;
        }

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                setSaveStatus('Authentication required. Please log in again.');
                setIsLoading(false);
                return;
            }

            // Get user ID from user prop or storage
            const currentUser = user || window.storage?.getUser?.();
            const userId = currentUser?.id || currentUser?.sub;
            
            if (!userId) {
                setSaveStatus('User information not available');
                setIsLoading(false);
                return;
            }
            
            console.log('🔐 Changing password for user:', userId);
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/users/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify({
                    currentPassword: passwordForm.currentPassword.trim(),
                    newPassword: passwordForm.newPassword.trim()
                })
            });

            console.log('📡 Password change response status:', response.status);
            let data;
            try {
                data = await response.json();
                console.log('📡 Password change response data:', data);
            } catch (parseError) {
                console.error('Error parsing response:', parseError);
                setSaveStatus('Error: Invalid response from server');
                setIsLoading(false);
                return;
            }

            // Handle both wrapped { data: { success: ... } } and unwrapped responses
            const result = data.data || data;
            if (response.ok && (result.success || result.message)) {
                setSaveStatus('Password changed successfully!');
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                const errorMessage = data.error?.message || data.error || result.message || 'Failed to change password';
                console.error('❌ Password change failed:', errorMessage);
                setSaveStatus(errorMessage);
                setTimeout(() => setSaveStatus(''), 5000);
            }
        } catch (error) {
            console.error('❌ Error changing password:', error);
            setSaveStatus('Network error: ' + (error.message || 'Unknown error'));
            setTimeout(() => setSaveStatus(''), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const renderProfileTab = () => (
        <div className="space-y-4">
            <div>
                <h3 className={`text-base font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-3`}>
                    Personal Information
                </h3>
                <div className="space-y-3">
                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Email
                        </label>
                        <input
                            type="email"
                            value={profile.email}
                            disabled
                            className={`w-full px-3 py-2 text-sm border rounded-lg ${
                                isDark ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-300 text-gray-500'
                            }`}
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Email cannot be changed
                        </p>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Department
                        </label>
                        <input
                            type="text"
                            value={profile.department}
                            onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Job Title
                        </label>
                        <input
                            type="text"
                            value={profile.jobTitle}
                            onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>
                </div>

                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handleProfileSave}
                        disabled={isLoading}
                        className="bg-primary-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderSecurityTab = () => (
        <div className="space-y-4">
            <div>
                <h3 className={`text-base font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-3`}>
                    Change Password
                </h3>
                <div className="space-y-3">
                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Current Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPasswords.current ? "text" : "password"}
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                                }`}
                                placeholder="Enter your current password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <i className={`fas ${showPasswords.current ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            New Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPasswords.new ? "text" : "password"}
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                                }`}
                                placeholder="Enter your new password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <i className={`fas ${showPasswords.new ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Password must be at least 8 characters long
                        </p>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Confirm New Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPasswords.confirm ? "text" : "password"}
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                                }`}
                                placeholder="Confirm your new password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <i className={`fas ${showPasswords.confirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex justify-end">
                    <button
                        onClick={handlePasswordChange}
                        disabled={isLoading}
                        className="bg-primary-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Changing...' : 'Change Password'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'profile':
                return renderProfileTab();
            case 'security':
                return renderSecurityTab();
            default:
                return renderProfileTab();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-black bg-opacity-50 z-50"
                onClick={onClose}
            ></div>
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div 
                    className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            Settings
                        </h2>
                        <button
                            onClick={onClose}
                            className={`${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'} p-2 rounded-lg transition-colors`}
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className={`flex border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-4`}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                    activeTab === tab.id
                                        ? isDark
                                            ? 'border-primary-500 text-primary-400'
                                            : 'border-primary-600 text-primary-600'
                                        : isDark
                                            ? 'border-transparent text-gray-400 hover:text-white'
                                            : 'border-transparent text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <i className={`fas ${tab.icon} mr-2`}></i>
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {saveStatus && (
                            <div className={`mb-4 p-3 rounded-lg text-sm ${
                                saveStatus.toLowerCase().includes('success')
                                    ? isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                                    : isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
                            }`}>
                                {saveStatus}
                            </div>
                        )}
                        {isLoading && !saveStatus ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                <span className={`ml-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading...</span>
                            </div>
                        ) : (
                            renderTabContent()
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

// Export to window for lazy loading
window.SettingsPortal = SettingsPortal;

