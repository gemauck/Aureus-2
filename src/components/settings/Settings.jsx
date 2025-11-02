// Settings Component - System Configuration and Preferences
const { useState, useEffect } = React;

const Settings = () => {
    const [activeTab, setActiveTab] = useState('general');
    const [settings, setSettings] = useState({
        general: {
            companyName: 'Abcotronics',
            timezone: 'Africa/Johannesburg',
            currency: 'ZAR',
            dateFormat: 'DD/MM/YYYY',
            language: 'en'
        },
        notifications: {
            emailNotifications: true,
            projectUpdates: true,
            clientUpdates: true,
            invoiceReminders: true,
            systemAlerts: true
        },
        security: {
            sessionTimeout: 30,
            requirePasswordChange: false,
            twoFactorAuth: false,
            auditLogging: true
        },
        integrations: {
            googleCalendar: false,
            quickbooks: false,
            slack: false,
            emailProvider: 'gmail'
        }
    });
    const [isLoading, setIsLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState('');
    const { isDark } = window.useTheme();

    const tabs = [
        { id: 'general', label: 'General', icon: 'fa-cog' },
        { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
        { id: 'security', label: 'Security', icon: 'fa-shield-alt' },
        { id: 'integrations', label: 'Integrations', icon: 'fa-plug' },
        { id: 'data', label: 'Data Management', icon: 'fa-database' }
    ];

    const handleSave = async () => {
        setIsLoading(true);
        setSaveStatus('Saving...');
        
        try {
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Save to localStorage for now
            localStorage.setItem('erp_settings', JSON.stringify(settings));
            
            setSaveStatus('Settings saved successfully!');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            setSaveStatus('Error saving settings');
            setTimeout(() => setSaveStatus(''), 3000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            setSettings({
                general: {
                    companyName: 'Abcotronics',
                    timezone: 'Africa/Johannesburg',
                    currency: 'ZAR',
                    dateFormat: 'DD/MM/YYYY',
                    language: 'en'
                },
                notifications: {
                    emailNotifications: true,
                    projectUpdates: true,
                    clientUpdates: true,
                    invoiceReminders: true,
                    systemAlerts: true
                },
                security: {
                    sessionTimeout: 30,
                    requirePasswordChange: false,
                    twoFactorAuth: false,
                    auditLogging: true
                },
                integrations: {
                    googleCalendar: false,
                    quickbooks: false,
                    slack: false,
                    emailProvider: 'gmail'
                }
            });
        }
    };

    const handleDataExport = () => {
        // Export all data functionality
        alert('Data export functionality will be implemented');
    };

    const handleDataImport = () => {
        // Import data functionality
        alert('Data import functionality will be implemented');
    };

    const handleClearCache = () => {
        if (confirm('Are you sure you want to clear all cached data?')) {
            localStorage.clear();
            sessionStorage.clear();
            alert('Cache cleared successfully');
        }
    };

    useEffect(() => {
        // Load saved settings
        const savedSettings = localStorage.getItem('erp_settings');
        if (savedSettings) {
            setSettings(JSON.parse(savedSettings));
        }
    }, []);

    const renderGeneralSettings = () => (
        <div className="space-y-6">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Company Name
                </label>
                <input
                    type="text"
                    value={settings.general.companyName}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        general: { ...prev.general, companyName: e.target.value }
                    }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                />
            </div>

            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Timezone
                </label>
                <select
                    value={settings.general.timezone}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        general: { ...prev.general, timezone: e.target.value }
                    }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="Africa/Johannesburg">Africa/Johannesburg</option>
                    <option value="UTC">UTC</option>
                    <option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                </select>
            </div>

            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Currency
                </label>
                <select
                    value={settings.general.currency}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        general: { ...prev.general, currency: e.target.value }
                    }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="ZAR">ZAR (South African Rand)</option>
                    <option value="USD">USD (US Dollar)</option>
                    <option value="EUR">EUR (Euro)</option>
                    <option value="GBP">GBP (British Pound)</option>
                </select>
            </div>

            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Date Format
                </label>
                <select
                    value={settings.general.dateFormat}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        general: { ...prev.general, dateFormat: e.target.value }
                    }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
            </div>
        </div>
    );

    const renderNotificationsSettings = () => (
        <div className="space-y-6">
            {Object.entries(settings.notifications).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                    <div>
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </label>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {key === 'emailNotifications' && 'Receive email notifications for important events'}
                            {key === 'projectUpdates' && 'Get notified when projects are updated'}
                            {key === 'clientUpdates' && 'Get notified when client information changes'}
                            {key === 'invoiceReminders' && 'Receive reminders for overdue invoices'}
                            {key === 'systemAlerts' && 'Get system alerts and maintenance notifications'}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) => setSettings(prev => ({
                                ...prev,
                                notifications: { ...prev.notifications, [key]: e.target.checked }
                            }))}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                </div>
            ))}
        </div>
    );

    const renderSecuritySettings = () => (
        <div className="space-y-6">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Session Timeout (minutes)
                </label>
                <input
                    type="number"
                    min="5"
                    max="480"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        security: { ...prev.security, sessionTimeout: parseInt(e.target.value) }
                    }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                />
            </div>

            {Object.entries(settings.security).filter(([key]) => key !== 'sessionTimeout').map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                    <div>
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </label>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {key === 'requirePasswordChange' && 'Require users to change passwords periodically'}
                            {key === 'twoFactorAuth' && 'Enable two-factor authentication for enhanced security'}
                            {key === 'auditLogging' && 'Log all user actions for security auditing'}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) => setSettings(prev => ({
                                ...prev,
                                security: { ...prev.security, [key]: e.target.checked }
                            }))}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                </div>
            ))}
        </div>
    );

    const renderIntegrationsSettings = () => (
        <div className="space-y-6">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Email Provider
                </label>
                <select
                    value={settings.integrations.emailProvider}
                    onChange={(e) => setSettings(prev => ({
                        ...prev,
                        integrations: { ...prev.integrations, emailProvider: e.target.value }
                    }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook</option>
                    <option value="custom">Custom SMTP</option>
                </select>
            </div>

            {Object.entries(settings.integrations).filter(([key]) => key !== 'emailProvider').map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                    <div>
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                        </label>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {key === 'googleCalendar' && 'Sync with Google Calendar for scheduling'}
                            {key === 'quickbooks' && 'Integrate with QuickBooks for accounting'}
                            {key === 'slack' && 'Send notifications to Slack channels'}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={value}
                            onChange={(e) => setSettings(prev => ({
                                ...prev,
                                integrations: { ...prev.integrations, [key]: e.target.checked }
                            }))}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                </div>
            ))}
        </div>
    );

    const renderDataManagement = () => (
        <div className="space-y-6">
            <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2`}>
                    Data Export
                </h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                    Export all your data including clients, projects, invoices, and time entries.
                </p>
                <button
                    onClick={handleDataExport}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <i className="fas fa-download mr-2"></i>
                    Export Data
                </button>
            </div>

            <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2`}>
                    Data Import
                </h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                    Import data from CSV files or other systems.
                </p>
                <button
                    onClick={handleDataImport}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                    <i className="fas fa-upload mr-2"></i>
                    Import Data
                </button>
            </div>

            <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-lg font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2`}>
                    Cache Management
                </h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                    Clear cached data to free up storage and resolve potential issues.
                </p>
                <button
                    onClick={handleClearCache}
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors"
                >
                    <i className="fas fa-trash mr-2"></i>
                    Clear Cache
                </button>
            </div>
        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'general':
                return renderGeneralSettings();
            case 'notifications':
                // Use new NotificationSettings component if available
                if (window.NotificationSettings) {
                    return <window.NotificationSettings />;
                }
                return renderNotificationsSettings();
            case 'security':
                return renderSecuritySettings();
            case 'integrations':
                return renderIntegrationsSettings();
            case 'data':
                return renderDataManagement();
            default:
                return renderGeneralSettings();
        }
    };

    return (
        <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Settings
                    </h1>
                    <p className={`mt-2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        Manage your system preferences and configuration
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    {/* Sidebar */}
                    <div className="lg:col-span-1">
                        <nav className={`rounded-lg ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-sm border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                            <div className="p-4">
                                <h2 className={`text-sm font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'} mb-3`}>
                                    Settings
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

                                {/* Action Buttons */}
                                <div className="flex items-center justify-between pt-6 border-t border-gray-200">
                                    <button
                                        onClick={handleReset}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    >
                                        Reset to Default
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isLoading}
                                        className="px-6 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isLoading ? (
                                            <>
                                                <i className="fas fa-spinner fa-spin mr-2"></i>
                                                Saving...
                                            </>
                                        ) : (
                                            <>
                                                <i className="fas fa-save mr-2"></i>
                                                Save Settings
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Export the component
window.Settings = Settings;
