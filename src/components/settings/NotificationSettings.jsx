// Notification Settings Component - Per-user notification preferences
const { useState, useEffect } = React;

const NotificationSettings = () => {
    const [settings, setSettings] = useState({
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
    const [loading, setLoading] = useState(true);
    const [saveStatus, setSaveStatus] = useState('');
    const { isDark } = window.useTheme();
    
    useEffect(() => {
        loadSettings();
    }, []);
    
    const loadSettings = async () => {
        try {
            setLoading(true);
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            // Use proper API base URL like other components
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
                    setSettings({
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
            setLoading(false);
        }
    };
    
    const handleSave = async () => {
        try {
            setLoading(true);
            setSaveStatus('Saving...');
            
            const token = window.storage?.getToken?.();
            if (!token) {
                setSaveStatus('Not authenticated');
                return;
            }
            
            // Use proper API base URL like other components
            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
            const response = await fetch(`${apiBase}/api/notifications/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                setSaveStatus('Settings saved successfully!');
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                const error = await response.text();
                setSaveStatus('Error saving settings');
                console.error('Error saving notification settings:', error);
            }
        } catch (error) {
            console.error('Error saving notification settings:', error);
            setSaveStatus('Error saving settings');
        } finally {
            setLoading(false);
        }
    };
    
    const toggleSetting = (key) => {
        setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    };
    
    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <i className="fas fa-spinner fa-spin text-3xl text-primary-600"></i>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            {/* Email Notifications Section */}
            <div>
                <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                    <i className="fas fa-envelope mr-2"></i>
                    Email Notifications
                </h3>
                <div className="space-y-4">
                    {[
                        { key: 'emailMentions', label: 'Mentions', desc: 'Get notified via email when someone @mentions you' },
                        { key: 'emailComments', label: 'Comments', desc: 'Get notified via email when someone comments on your items' },
                        { key: 'emailTasks', label: 'Tasks', desc: 'Get notified via email about task assignments and updates' },
                        { key: 'emailInvoices', label: 'Invoices', desc: 'Get notified via email about invoice status and due dates' },
                        { key: 'emailSystem', label: 'System Alerts', desc: 'Get notified via email about important system events' }
                    ].map(item => (
                        <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div>
                                <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                    {item.label}
                                </label>
                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {item.desc}
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings[item.key]}
                                    onChange={() => toggleSetting(item.key)}
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
                <h3 className={`text-lg font-semibold mb-4 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                    <i className="fas fa-bell mr-2"></i>
                    In-App Notifications
                </h3>
                <div className="space-y-4">
                    {[
                        { key: 'inAppMentions', label: 'Mentions', desc: 'Show in-app notifications when someone @mentions you' },
                        { key: 'inAppComments', label: 'Comments', desc: 'Show in-app notifications for comments on your items' },
                        { key: 'inAppTasks', label: 'Tasks', desc: 'Show in-app notifications about task assignments and updates' },
                        { key: 'inAppInvoices', label: 'Invoices', desc: 'Show in-app notifications about invoice status and due dates' },
                        { key: 'inAppSystem', label: 'System Alerts', desc: 'Show in-app notifications for important system events' }
                    ].map(item => (
                        <div key={item.key} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                            <div>
                                <label className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
                                    {item.label}
                                </label>
                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {item.desc}
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings[item.key]}
                                    onChange={() => toggleSetting(item.key)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                            </label>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* Test Notification Section */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h3 className={`text-lg font-semibold mb-2 ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                    <i className="fas fa-vial mr-2"></i>
                    Test Notifications
                </h3>
                <p className={`text-xs mb-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    Create a test notification to verify your notification settings are working correctly.
                </p>
                <button
                    onClick={async () => {
                        try {
                            const token = window.storage?.getToken?.();
                            if (!token) {
                                alert('Please log in first');
                                return;
                            }
                            
                            const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
                            const response = await fetch(`${apiBase}/api/notifications/test`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                credentials: 'include',
                                body: JSON.stringify({
                                    type: 'system',
                                    title: 'Test Notification',
                                    message: 'This is a test notification. If you can see this, notifications are working!'
                                })
                            });
                            
                            if (response.ok) {
                                const data = await response.json();
                                alert('✅ Test notification created! Check the notification bell icon in the header.');
                            } else {
                                const error = await response.text();
                                alert('Failed to create test notification: ' + error);
                            }
                        } catch (error) {
                            console.error('Error creating test notification:', error);
                            alert('Error creating test notification: ' + error.message);
                        }
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                    <i className="fas fa-bell mr-2"></i>
                    Create Test Notification
                </button>
            </div>
            
            {/* Save Button */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {saveStatus || 'Changes are saved automatically'}
                </p>
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.NotificationSettings = NotificationSettings;
}

