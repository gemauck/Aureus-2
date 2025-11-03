// Settings Component - System Configuration and Preferences
const { useState, useEffect } = React;

const Settings = () => {
    const [activeTab, setActiveTab] = useState('general');
    const [settings, setSettings] = useState({
        companyName: 'Abcotronics',
        timezone: 'Africa/Johannesburg',
        currency: 'ZAR',
        dateFormat: 'DD/MM/YYYY',
        language: 'en',
        sessionTimeout: 30,
        requirePasswordChange: false,
        twoFactorAuth: false,
        auditLogging: true,
        emailProvider: 'gmail',
        googleCalendar: false,
        quickbooks: false,
        slack: false
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
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
            // Save to database via API
            if (window.DatabaseAPI?.updateSettings) {
                await window.DatabaseAPI.updateSettings(settings);
                setSaveStatus('Settings saved successfully!');
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                throw new Error('DatabaseAPI not available');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            setSaveStatus('Error saving settings: ' + error.message);
            setTimeout(() => setSaveStatus(''), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            setSettings({
                companyName: 'Abcotronics',
                timezone: 'Africa/Johannesburg',
                currency: 'ZAR',
                dateFormat: 'DD/MM/YYYY',
                language: 'en',
                sessionTimeout: 30,
                requirePasswordChange: false,
                twoFactorAuth: false,
                auditLogging: true,
                emailProvider: 'gmail',
                googleCalendar: false,
                quickbooks: false,
                slack: false
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
        // Load settings from database
        const loadSettings = async () => {
            setIsLoadingData(true);
            try {
                if (window.DatabaseAPI?.getSettings) {
                    const response = await window.DatabaseAPI.getSettings();
                    const dbSettings = response?.data?.settings;
                    if (dbSettings) {
                        setSettings(dbSettings);
                    }
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            } finally {
                setIsLoadingData(false);
            }
        };
        loadSettings();
    }, []);

    const renderGeneralSettings = () => (
        <div className="space-y-6">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Company Name
                </label>
                <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
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
                    value={settings.timezone}
                    onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
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
                    value={settings.currency}
                    onChange={(e) => setSettings(prev => ({ ...prev, currency: e.target.value }))}
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
                    value={settings.dateFormat}
                    onChange={(e) => setSettings(prev => ({ ...prev, dateFormat: e.target.value }))}
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
            {window.NotificationSettings ? (
                <window.NotificationSettings />
            ) : (
                <div className="text-center py-12">
                    <p className="text-gray-500">Notification settings are managed separately.</p>
                </div>
            )}
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
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                />
            </div>

            {[
                { key: 'requirePasswordChange', label: 'Require Password Change', desc: 'Require users to change passwords periodically' },
                { key: 'twoFactorAuth', label: 'Two Factor Auth', desc: 'Enable two-factor authentication for enhanced security' },
                { key: 'auditLogging', label: 'Audit Logging', desc: 'Log all user actions for security auditing' }
            ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                    <div>
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {label}
                        </label>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {desc}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings[key]}
                            onChange={(e) => setSettings(prev => ({ ...prev, [key]: e.target.checked }))}
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
                    value={settings.emailProvider}
                    onChange={(e) => setSettings(prev => ({ ...prev, emailProvider: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook</option>
                    <option value="custom">Custom SMTP</option>
                </select>
            </div>

            {[
                { key: 'googleCalendar', label: 'Google Calendar', desc: 'Sync with Google Calendar for scheduling' },
                { key: 'quickbooks', label: 'Quickbooks', desc: 'Integrate with QuickBooks for accounting' },
                { key: 'slack', label: 'Slack', desc: 'Send notifications to Slack channels' }
            ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                    <div>
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {label}
                        </label>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {desc}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings[key]}
                            onChange={(e) => setSettings(prev => ({ ...prev, [key]: e.target.checked }))}
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

    if (isLoadingData) {
        return (
            <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>
                    <p className="text-gray-500">Loading settings...</p>
                </div>
            </div>
        );
    }

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
