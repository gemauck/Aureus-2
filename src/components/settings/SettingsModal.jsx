// Settings Modal Component - Modal wrapper for Settings
const { useState, useEffect } = React;

const SettingsModal = ({ isOpen, onClose }) => {
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
    const [notificationSettings, setNotificationSettings] = useState({
        emailMentions: true,
        emailComments: true,
        emailTasks: false,
        emailInvoices: true,
        emailSystem: true,
        inAppMentions: true,
        inAppComments: true,
        inAppTasks: true,
        inAppInvoices: true,
        inAppSystem: true
    });
    const [notificationLoading, setNotificationLoading] = useState(false);
    const [notificationSaveStatus, setNotificationSaveStatus] = useState('');
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
        alert('Data export functionality will be implemented');
    };

    const handleDataImport = () => {
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
        if (!isOpen) return;
        
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
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const renderGeneralSettings = () => (
        <div className="space-y-4">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    Company Name
                </label>
                <input
                    type="text"
                    value={settings.companyName}
                    onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                />
            </div>

            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    Timezone
                </label>
                <select
                    value={settings.timezone}
                    onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
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
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    Currency
                </label>
                <select
                    value={settings.currency}
                    onChange={(e) => setSettings(prev => ({ ...prev, currency: e.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
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
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    Date Format
                </label>
                <select
                    value={settings.dateFormat}
                    onChange={(e) => setSettings(prev => ({ ...prev, dateFormat: e.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
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

    const renderSecuritySettings = () => (
        <div className="space-y-4">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    Session Timeout (minutes)
                </label>
                <input
                    type="number"
                    min="5"
                    max="480"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings(prev => ({ ...prev, sessionTimeout: parseInt(e.target.value) }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                />
            </div>

            {[
                { key: 'requirePasswordChange', label: 'Require Password Change', desc: 'Require users to change passwords periodically' },
                { key: 'twoFactorAuth', label: 'Two Factor Auth', desc: 'Enable two-factor authentication' },
                { key: 'auditLogging', label: 'Audit Logging', desc: 'Log all user actions for security auditing' }
            ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2">
                    <div className="flex-1">
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {label}
                        </label>
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {desc}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4">
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

    useEffect(() => {
        if (activeTab === 'notifications' && isOpen) {
            loadNotificationSettings();
        }
    }, [activeTab, isOpen]);

    const loadNotificationSettings = async () => {
        try {
            setNotificationLoading(true);
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/notifications/settings`, {
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                const responseData = data.data || data;
                const loadedSettings = responseData.settings;
                
                if (loadedSettings) {
                    setNotificationSettings({
                        emailMentions: loadedSettings.emailMentions !== undefined ? loadedSettings.emailMentions : true,
                        emailComments: loadedSettings.emailComments !== undefined ? loadedSettings.emailComments : true,
                        emailTasks: loadedSettings.emailTasks !== undefined ? loadedSettings.emailTasks : false,
                        emailInvoices: loadedSettings.emailInvoices !== undefined ? loadedSettings.emailInvoices : true,
                        emailSystem: loadedSettings.emailSystem !== undefined ? loadedSettings.emailSystem : true,
                        inAppMentions: loadedSettings.inAppMentions !== undefined ? loadedSettings.inAppMentions : true,
                        inAppComments: loadedSettings.inAppComments !== undefined ? loadedSettings.inAppComments : true,
                        inAppTasks: loadedSettings.inAppTasks !== undefined ? loadedSettings.inAppTasks : true,
                        inAppInvoices: loadedSettings.inAppInvoices !== undefined ? loadedSettings.inAppInvoices : true,
                        inAppSystem: loadedSettings.inAppSystem !== undefined ? loadedSettings.inAppSystem : true
                    });
                }
            }
        } catch (error) {
            console.error('Error loading notification settings:', error);
        } finally {
            setNotificationLoading(false);
        }
    };

    const handleNotificationSave = async () => {
        try {
            setNotificationLoading(true);
            setNotificationSaveStatus('Saving...');
            
            const token = window.storage?.getToken?.();
            if (!token) {
                setNotificationSaveStatus('Not authenticated');
                return;
            }
            
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/notifications/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify(notificationSettings)
            });
            
            if (response.ok) {
                setNotificationSaveStatus('Settings saved successfully!');
                setTimeout(() => setNotificationSaveStatus(''), 3000);
            } else {
                setNotificationSaveStatus('Error saving settings');
            }
        } catch (error) {
            console.error('Error saving notification settings:', error);
            setNotificationSaveStatus('Error saving settings');
        } finally {
            setNotificationLoading(false);
        }
    };

    const renderNotificationsSettings = () => (
        <div className="space-y-4">
            {/* Email Notifications Section */}
            <div>
                <h3 className={`text-base font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                    <i className="fas fa-envelope mr-2"></i>
                    Email Notifications
                </h3>
                <div className="space-y-3">
                    {[
                        { key: 'emailMentions', label: 'Mentions', desc: 'Get notified via email when someone @mentions you' },
                        { key: 'emailComments', label: 'Comments', desc: 'Get notified via email when someone comments on your items' },
                        { key: 'emailTasks', label: 'Tasks', desc: 'Get notified via email about task assignments and updates' },
                        { key: 'emailInvoices', label: 'Invoices', desc: 'Get notified via email about invoice status and due dates' },
                        { key: 'emailSystem', label: 'System Alerts', desc: 'Get notified via email about important system events' }
                    ].map(item => (
                        <div key={item.key} className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="flex-1">
                                <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                    {item.label}
                                </label>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {item.desc}
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                    type="checkbox"
                                    checked={notificationSettings[item.key]}
                                    onChange={() => setNotificationSettings(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                            </label>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* In-App Notifications Section */}
            <div>
                <h3 className={`text-base font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                    <i className="fas fa-bell mr-2"></i>
                    In-App Notifications
                </h3>
                <div className="space-y-3">
                    {[
                        { key: 'inAppMentions', label: 'Mentions', desc: 'Show in-app notifications when someone @mentions you' },
                        { key: 'inAppComments', label: 'Comments', desc: 'Show in-app notifications for comments on your items' },
                        { key: 'inAppTasks', label: 'Tasks', desc: 'Show in-app notifications about task assignments and updates' },
                        { key: 'inAppInvoices', label: 'Invoices', desc: 'Show in-app notifications about invoice status and due dates' },
                        { key: 'inAppSystem', label: 'System Alerts', desc: 'Show in-app notifications for important system events' }
                    ].map(item => (
                        <div key={item.key} className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                            <div className="flex-1">
                                <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                    {item.label}
                                </label>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {item.desc}
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer ml-4">
                                <input
                                    type="checkbox"
                                    checked={notificationSettings[item.key]}
                                    onChange={() => setNotificationSettings(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                            </label>
                        </div>
                    ))}
                </div>
            </div>
            
            {notificationSaveStatus && (
                <div className={`p-3 rounded-lg text-sm ${
                    notificationSaveStatus.toLowerCase().includes('success')
                        ? isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                        : isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
                }`}>
                    {notificationSaveStatus}
                </div>
            )}
        </div>
    );

    const renderIntegrationsSettings = () => (
        <div className="space-y-4">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    Email Provider
                </label>
                <select
                    value={settings.emailProvider}
                    onChange={(e) => setSettings(prev => ({ ...prev, emailProvider: e.target.value }))}
                    className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="gmail">Gmail</option>
                    <option value="outlook">Outlook</option>
                    <option value="custom">Custom SMTP</option>
                </select>
            </div>

            {[
                { key: 'googleCalendar', label: 'Google Calendar', desc: 'Sync with Google Calendar' },
                { key: 'quickbooks', label: 'Quickbooks', desc: 'Integrate with QuickBooks' },
                { key: 'slack', label: 'Slack', desc: 'Send notifications to Slack' }
            ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between py-2">
                    <div className="flex-1">
                        <label className={`text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                            {label}
                        </label>
                        <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {desc}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer ml-4">
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
        <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2`}>
                    Data Export
                </h3>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                    Export all your data including clients, projects, invoices, and time entries.
                </p>
                <button
                    onClick={handleDataExport}
                    className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <i className="fas fa-download mr-2"></i>
                    Export Data
                </button>
            </div>

            <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2`}>
                    Data Import
                </h3>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                    Import data from CSV files or other systems.
                </p>
                <button
                    onClick={handleDataImport}
                    className="bg-green-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-green-700 transition-colors"
                >
                    <i className="fas fa-upload mr-2"></i>
                    Import Data
                </button>
            </div>

            <div className={`p-4 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'} mb-2`}>
                    Cache Management
                </h3>
                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-3`}>
                    Clear cached data to free up storage and resolve potential issues.
                </p>
                <button
                    onClick={handleClearCache}
                    className="bg-orange-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-orange-700 transition-colors"
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
                    className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col`}
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
                    <div className={`flex border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} px-4 overflow-x-auto`}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
                        {isLoadingData ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                                <span className={`ml-3 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>Loading settings...</span>
                            </div>
                        ) : (
                            <>
                                {saveStatus && (
                                    <div className={`mb-4 p-3 rounded-lg text-sm ${
                                        saveStatus.toLowerCase().includes('success')
                                            ? isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'
                                            : isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'
                                    }`}>
                                        {saveStatus}
                                    </div>
                                )}
                                
                                <div className="mb-4">
                                    <h3 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'} mb-4`}>
                                        {tabs.find(tab => tab.id === activeTab)?.label}
                                    </h3>
                                    {renderTabContent()}
                                </div>

                                {/* Action Buttons */}
                                {activeTab === 'notifications' ? (
                                    <div className={`flex items-center justify-end pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                        <button
                                            onClick={handleNotificationSave}
                                            disabled={notificationLoading}
                                            className="px-6 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {notificationLoading ? (
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
                                ) : (
                                    <div className={`flex items-center justify-between pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                                        <button
                                            onClick={handleReset}
                                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                                isDark 
                                                    ? 'text-gray-300 bg-gray-700 border border-gray-600 hover:bg-gray-600' 
                                                    : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                                            }`}
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
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

// Export to window for lazy loading
window.SettingsModal = SettingsModal;

