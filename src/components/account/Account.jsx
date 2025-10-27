// Account Component - User profile management
const { useState, useEffect } = React;

const Account = () => {
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
        { id: 'security', label: 'Security', icon: 'fa-shield-alt' },
        { id: 'preferences', label: 'Preferences', icon: 'fa-cog' }
    ];

    useEffect(() => {
        if (user) {
            setProfile({
                name: user.name || '',
                email: user.email || '',
                phone: user.phone || '',
                department: user.department || '',
                jobTitle: user.jobTitle || ''
            });
        }
    }, [user]);

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
                setTimeout(() => setSaveStatus(''), 3000);
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
            console.log('🔐 Attempting to change password...');
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

            console.log('🔐 Password change response status:', response.status);
            const data = await response.json();
            console.log('🔐 Password change response data:', data);

            if (response.ok) {
                setSaveStatus('Password changed successfully!');
                setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                const errorMessage = data.error || data.message || 'Failed to change password';
                console.error('❌ Password change failed:', errorMessage);
                setSaveStatus(errorMessage);
                setTimeout(() => setSaveStatus(''), 5000);
            }
        } catch (error) {
            console.error('❌ Error changing password:', error);
            setSaveStatus('Network error: ' + error.message);
            setTimeout(() => setSaveStatus(''), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const renderProfileTab = () => (
        <div className="space-y-6">
            <div>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-4`}>
                    Personal Information
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={profile.name}
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Email
                        </label>
                        <input
                            type="email"
                            value={profile.email}
                            disabled
                            className={`w-full px-3 py-2 border rounded-lg bg-gray-100 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-gray-100 border-gray-300 text-gray-500'
                            }`}
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Email cannot be changed
                        </p>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={profile.phone}
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Department
                        </label>
                        <input
                            type="text"
                            value={profile.department}
                            onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Job Title
                        </label>
                        <input
                            type="text"
                            value={profile.jobTitle}
                            onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                        />
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        onClick={handleProfileSave}
                        disabled={isLoading}
                        className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderSecurityTab = () => (
        <div className="space-y-6">
            <div>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-4`}>
                    Change Password
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Current Password
                        </label>
                        <input
                            type="password"
                            value={passwordForm.currentPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                            placeholder="Enter your current password"
                        />
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            New Password
                        </label>
                        <input
                            type="password"
                            value={passwordForm.newPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                            placeholder="Enter your new password"
                        />
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Password must be at least 8 characters long
                        </p>
                    </div>

                    <div>
                        <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                            Confirm New Password
                        </label>
                        <input
                            type="password"
                            value={passwordForm.confirmPassword}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                            }`}
                            placeholder="Confirm your new password"
                        />
                    </div>
                </div>

                <div className="mt-6">
                    <button
                        onClick={handlePasswordChange}
                        disabled={isLoading}
                        className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? 'Changing...' : 'Change Password'}
                    </button>
                </div>
            </div>
        </div>
    );

    const renderPreferencesTab = () => (
        <div className="space-y-6">
            <div>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-4`}>
                    Notification Preferences
                </h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Notification preferences coming soon...
                </p>
            </div>
        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'profile':
                return renderProfileTab();
            case 'security':
                return renderSecurityTab();
            case 'preferences':
                return renderPreferencesTab();
            default:
                return renderProfileTab();
        }
    };

    return (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        My Account
                    </h1>
                    <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Manage your account settings and preferences
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        <nav className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="p-4">
                                <h2 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-3`}>
                                    Account
                                </h2>
                                <div className="space-y-1">
                                    {tabs.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                                                activeTab === tab.id
                                                    ? isDark
                                                        ? 'bg-primary-600 text-white'
                                                        : 'bg-primary-100 text-primary-700'
                                                    : isDark
                                                        ? 'text-gray-300 hover:bg-gray-700 hover:text-white'
                                                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                            }`}
                                        >
                                            <i className={`fas ${tab.icon} mr-3`}></i>
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </nav>
                    </div>

                    {/* Main Content */}
                    <div className="lg:col-span-3">
                        <div className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {tabs.find(tab => tab.id === activeTab)?.label}
                                    </h2>
                                    {saveStatus && (
                                        <span className={`text-sm ${saveStatus.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
                                            {saveStatus}
                                        </span>
                                    )}
                                </div>

                                {renderTabContent()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Export to window for lazy loading
window.Account = Account;
