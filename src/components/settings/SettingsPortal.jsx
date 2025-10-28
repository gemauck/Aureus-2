// Settings Portal Component - Modal/dropdown for account settings
const { useState, useEffect } = React;

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
    const [isLoading, setIsLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const { user } = window.useAuth();
    const { isDark } = window.useTheme();

    const tabs = [
        { id: 'profile', label: 'Profile', icon: 'fa-user' },
        { id: 'security', label: 'Security', icon: 'fa-shield-alt' }
    ];

    useEffect(() => {
        if (user && isOpen) {
            setProfile({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                department: user.department || '',
                jobTitle: user.jobTitle || ''
            });
            loadProfile();
        }
    }, [user, isOpen]);

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

    const loadProfile = async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/me', {
                headers: {
                    'Authorization': `Bearer ${window.storage.getToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.user) {
                    setProfile({
                        name: data.user.name || '',
                        email: data.user.email || '',
                        phone: data.user.phone || '',
                        department: data.user.department || '',
                        jobTitle: data.user.jobTitle || ''
                    });
                }
            }
        } catch (error) {
            console.error('Error loading profile:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleProfileSave = async () => {
        setIsLoading(true);
        setSaveStatus('Saving...');
        
        try {
            const response = await fetch(`/api/users/${user.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.storage.getToken()}`
                },
                body: JSON.stringify(profile)
            });

            const data = await response.json();

            if (response.ok) {
                setSaveStatus('Profile updated successfully!');
                // Update user in auth context
                if (window.storage && window.storage.setUser) {
                    window.storage.setUser({ ...user, ...profile });
                }
                setTimeout(() => {
                    setSaveStatus('');
                    // Refresh auth context
                    if (window.useAuth && window.useAuth.refresh) {
                        window.useAuth.refresh();
                    }
                }, 2000);
            } else {
                setSaveStatus(data.message || 'Failed to update profile');
                setTimeout(() => setSaveStatus(''), 3000);
            }
        } catch (error) {
            console.error('Error updating profile:', error);
            setSaveStatus('Error updating profile');
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
            const response = await fetch('/api/users/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.storage.getToken()}`
                },
                body: JSON.stringify({
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                setSaveStatus('Password changed successfully!');
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                const errorMessage = data.error || data.message || 'Failed to change password';
                setSaveStatus(errorMessage);
                setTimeout(() => setSaveStatus(''), 5000);
            }
        } catch (error) {
            console.error('Error changing password:', error);
            setSaveStatus('Network error: ' + error.message);
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
                        <input
                            type="password"
                            value={passwordForm.currentPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                            placeholder="Enter your current password"
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            New Password
                        </label>
                        <input
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                            placeholder="Enter your new password"
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Password must be at least 8 characters long
                        </p>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Confirm New Password
                        </label>
                        <input
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                            placeholder="Confirm your new password"
                        />
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
                        {renderTabContent()}
                    </div>
                </div>
            </div>
        </>
    );
};

// Export to window for lazy loading
window.SettingsPortal = SettingsPortal;

