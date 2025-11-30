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

    // Resolve Notification Settings component from global window (registered by NotificationSettings.jsx)
    const NotificationsComponent = React.useMemo(() => {
        const Comp = window.NotificationSettings;
        if (Comp && typeof Comp === 'function') {
            return Comp;
        }
        // Fallback placeholder while component loads
        return () => <div className="text-center py-12 text-gray-500">Notifications settings loading...</div>;
    }, []);

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
            // Validate settings before saving
            if (!settings.companyName || settings.companyName.trim() === '') {
                setSaveStatus('Error: Company name is required');
                setTimeout(() => setSaveStatus(''), 3000);
                setIsLoading(false);
                return;
            }
            
            // Save to database via API - try multiple methods
            let saved = false;
            let savedSettings = null;
            
            if (window.DatabaseAPI?.updateSettings) {
                const response = await window.DatabaseAPI.updateSettings(settings);
                // Get saved settings from response
                savedSettings = response?.data?.settings || settings;
                saved = true;
            } else if (window.api?.updateSettings) {
                const response = await window.api.updateSettings(settings);
                savedSettings = response?.data?.settings || settings;
                saved = true;
            } else {
                // Fallback: save to localStorage
                localStorage.setItem('systemSettings', JSON.stringify(settings));
                savedSettings = settings;
                saved = true;
                console.warn('⚠️ Settings saved to localStorage (API not available)');
            }
            
            if (saved && savedSettings) {
                // Update state with saved settings (in case server normalized them)
                setSettings(savedSettings);
                
                // Store settings in localStorage for quick access
                localStorage.setItem('systemSettings', JSON.stringify(savedSettings));
                
                // Apply settings to global context if available
                if (window.setSystemSettings) {
                    window.setSystemSettings(savedSettings);
                }
                
                // Dispatch event so other components can react to settings changes
                window.dispatchEvent(new CustomEvent('systemSettingsChanged', { 
                    detail: savedSettings 
                }));
                
                setSaveStatus('✅ Settings saved successfully!');
                setTimeout(() => setSaveStatus(''), 3000);
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('❌ Error saving settings:', error);
            const errorMessage = error?.message || 'Unknown error occurred';
            setSaveStatus(`❌ Error: ${errorMessage}`);
            setTimeout(() => setSaveStatus(''), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = async () => {
        if (confirm('Are you sure you want to reset all settings to default?')) {
            const defaultSettings = {
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
            };
            
            setSettings(defaultSettings);
            
            // Also save the reset to database
            try {
                if (window.DatabaseAPI?.updateSettings) {
                    await window.DatabaseAPI.updateSettings(defaultSettings);
                } else if (window.api?.updateSettings) {
                    await window.api.updateSettings(defaultSettings);
                }
                localStorage.setItem('systemSettings', JSON.stringify(defaultSettings));
                if (window.setSystemSettings) {
                    window.setSystemSettings(defaultSettings);
                }
                
                // Dispatch event so other components can react to settings changes
                window.dispatchEvent(new CustomEvent('systemSettingsChanged', { 
                    detail: defaultSettings 
                }));
                
                setSaveStatus('Settings reset to default!');
                setTimeout(() => setSaveStatus(''), 3000);
            } catch (error) {
                console.error('Error resetting settings:', error);
            }
        }
    };

    const handleDataExport = async () => {
        setIsLoading(true);
        setSaveStatus('Exporting data...');
        
        try {
            // Collect all data from database
            const exportData = {
                exportDate: new Date().toISOString(),
                version: '1.0',
                settings: settings,
                data: {}
            };
            
            // Fetch all data types in parallel
            const dataPromises = [];
            
            // Clients
            if (window.DatabaseAPI?.getClients || window.api?.getClients) {
                const getClients = window.DatabaseAPI?.getClients || window.api?.getClients;
                dataPromises.push(
                    getClients().then(res => ({
                        key: 'clients',
                        data: res?.data?.clients || res?.clients || []
                    })).catch(err => {
                        console.warn('Failed to export clients:', err);
                        return { key: 'clients', data: [] };
                    })
                );
            }
            
            // Projects
            if (window.DatabaseAPI?.getProjects || window.api?.getProjects) {
                const getProjects = window.DatabaseAPI?.getProjects || window.api?.getProjects;
                dataPromises.push(
                    getProjects().then(res => ({
                        key: 'projects',
                        data: res?.data?.projects || res?.projects || []
                    })).catch(err => {
                        console.warn('Failed to export projects:', err);
                        return { key: 'projects', data: [] };
                    })
                );
            }
            
            // Time Entries
            if (window.DatabaseAPI?.getTimeEntries || window.api?.getTimeEntries) {
                const getTimeEntries = window.DatabaseAPI?.getTimeEntries || window.api?.getTimeEntries;
                dataPromises.push(
                    getTimeEntries().then(res => ({
                        key: 'timeEntries',
                        data: res?.data?.timeEntries || res?.timeEntries || []
                    })).catch(err => {
                        console.warn('Failed to export time entries:', err);
                        return { key: 'timeEntries', data: [] };
                    })
                );
            }
            
            // Leads
            if (window.DatabaseAPI?.getLeads || window.api?.getLeads) {
                const getLeads = window.DatabaseAPI?.getLeads || window.api?.getLeads;
                dataPromises.push(
                    getLeads().then(res => ({
                        key: 'leads',
                        data: res?.data?.leads || res?.leads || []
                    })).catch(err => {
                        console.warn('Failed to export leads:', err);
                        return { key: 'leads', data: [] };
                    })
                );
            }
            
            // Wait for all data to load
            const results = await Promise.all(dataPromises);
            
            // Organize data
            results.forEach(({ key, data }) => {
                exportData.data[key] = data;
            });
            
            // Create and download JSON file
            const jsonStr = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `abcotronics_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            setSaveStatus('Data exported successfully!');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            console.error('Error exporting data:', error);
            setSaveStatus('Error exporting data: ' + error.message);
            setTimeout(() => setSaveStatus(''), 5000);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDataImport = () => {
        // Create file input
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.style.display = 'none';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            setIsLoading(true);
            setSaveStatus('Importing data...');
            
            try {
                const text = await file.text();
                const importData = JSON.parse(text);
                
                if (!importData.data) {
                    throw new Error('Invalid export file format');
                }
                
                // Import each data type
                const importPromises = [];
                let importedCount = 0;
                
                // Import Clients
                if (importData.data.clients && Array.isArray(importData.data.clients)) {
                    if (window.DatabaseAPI?.createClient || window.api?.createClient) {
                        const createClient = window.DatabaseAPI?.createClient || window.api?.createClient;
                        for (const client of importData.data.clients) {
                            importPromises.push(
                                createClient(client).then(() => {
                                    importedCount++;
                                }).catch(err => {
                                    console.warn('Failed to import client:', client.name || client.id, err);
                                })
                            );
                        }
                    }
                }
                
                // Import Projects
                if (importData.data.projects && Array.isArray(importData.data.projects)) {
                    if (window.DatabaseAPI?.createProject || window.api?.createProject) {
                        const createProject = window.DatabaseAPI?.createProject || window.api?.createProject;
                        for (const project of importData.data.projects) {
                            importPromises.push(
                                createProject(project).then(() => {
                                    importedCount++;
                                }).catch(err => {
                                    console.warn('Failed to import project:', project.name || project.id, err);
                                })
                            );
                        }
                    }
                }
                
                // Import Time Entries
                if (importData.data.timeEntries && Array.isArray(importData.data.timeEntries)) {
                    if (window.DatabaseAPI?.createTimeEntry || window.api?.createTimeEntry) {
                        const createTimeEntry = window.DatabaseAPI?.createTimeEntry || window.api?.createTimeEntry;
                        for (const entry of importData.data.timeEntries) {
                            importPromises.push(
                                createTimeEntry(entry).then(() => {
                                    importedCount++;
                                }).catch(err => {
                                    console.warn('Failed to import time entry:', err);
                                })
                            );
                        }
                    }
                }
                
                // Import Leads
                if (importData.data.leads && Array.isArray(importData.data.leads)) {
                    if (window.DatabaseAPI?.createLead || window.api?.createLead) {
                        const createLead = window.DatabaseAPI?.createLead || window.api?.createLead;
                        for (const lead of importData.data.leads) {
                            importPromises.push(
                                createLead(lead).then(() => {
                                    importedCount++;
                                }).catch(err => {
                                    console.warn('Failed to import lead:', err);
                                })
                            );
                        }
                    }
                }
                
                // Import Settings if present
                if (importData.settings && confirm('Do you want to import settings as well?')) {
                    setSettings(importData.settings);
                    await handleSave();
                }
                
                // Wait for all imports
                await Promise.all(importPromises);
                
                setSaveStatus(`Successfully imported ${importedCount} records!`);
                setTimeout(() => setSaveStatus(''), 5000);
                
                // Reload page to refresh data
                if (importedCount > 0) {
                    setTimeout(() => {
                        if (confirm('Data imported successfully. Reload page to see changes?')) {
                            window.location.reload();
                        }
                    }, 2000);
                }
            } catch (error) {
                console.error('Error importing data:', error);
                setSaveStatus('Error importing data: ' + error.message);
                setTimeout(() => setSaveStatus(''), 5000);
            } finally {
                setIsLoading(false);
                document.body.removeChild(input);
            }
        };
        
        document.body.appendChild(input);
        input.click();
    };

    const handleClearCache = async () => {
        if (confirm('Are you sure you want to clear all cached data? This will log you out and require you to log in again.')) {
            setIsLoading(true);
            setSaveStatus('Clearing cache...');
            
            try {
                // Clear all localStorage except auth token and settings
                const token = localStorage.getItem('token');
                const systemSettings = localStorage.getItem('systemSettings');
                
                localStorage.clear();
                sessionStorage.clear();
                
                // Restore essential items
                if (token) {
                    localStorage.setItem('token', token);
                }
                if (systemSettings) {
                    localStorage.setItem('systemSettings', systemSettings);
                }
                
                setSaveStatus('Cache cleared successfully!');
                setTimeout(() => {
                    setSaveStatus('');
                    // Reload to refresh all data
                    if (confirm('Cache cleared. Reload page to see changes?')) {
                        window.location.reload();
                    }
                }, 2000);
            } catch (error) {
                console.error('Error clearing cache:', error);
                setSaveStatus('Error clearing cache: ' + error.message);
                setTimeout(() => setSaveStatus(''), 5000);
            } finally {
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        // Load settings from database
        const loadSettings = async () => {
            setIsLoadingData(true);
            try {
                // Try to load from database first
                let dbSettings = null;
                
                if (window.DatabaseAPI?.getSettings) {
                    try {
                        const response = await window.DatabaseAPI.getSettings();
                        dbSettings = response?.data?.settings;
                    } catch (err) {
                        console.warn('Failed to load settings from DatabaseAPI:', err);
                    }
                } else if (window.api?.getSettings) {
                    try {
                        const response = await window.api.getSettings();
                        dbSettings = response?.data?.settings;
                    } catch (err) {
                        console.warn('Failed to load settings from api:', err);
                    }
                }
                
                // If database settings found, merge with defaults to ensure all fields exist
                if (dbSettings) {
                    // Merge with defaults to ensure all fields are present
                    const mergedSettings = {
                        companyName: dbSettings.companyName ?? 'Abcotronics',
                        timezone: dbSettings.timezone ?? 'Africa/Johannesburg',
                        currency: dbSettings.currency ?? 'ZAR',
                        dateFormat: dbSettings.dateFormat ?? 'DD/MM/YYYY',
                        language: dbSettings.language ?? 'en',
                        sessionTimeout: dbSettings.sessionTimeout ?? 30,
                        requirePasswordChange: dbSettings.requirePasswordChange ?? false,
                        twoFactorAuth: dbSettings.twoFactorAuth ?? false,
                        auditLogging: dbSettings.auditLogging ?? true,
                        emailProvider: dbSettings.emailProvider ?? 'gmail',
                        googleCalendar: dbSettings.googleCalendar ?? false,
                        quickbooks: dbSettings.quickbooks ?? false,
                        slack: dbSettings.slack ?? false
                    };
                    setSettings(mergedSettings);
                    localStorage.setItem('systemSettings', JSON.stringify(mergedSettings));
                } else {
                    // Fallback: try localStorage
                    const localSettings = localStorage.getItem('systemSettings');
                    if (localSettings) {
                        try {
                            const parsed = JSON.parse(localSettings);
                            // Merge with defaults
                            const mergedSettings = {
                                companyName: parsed.companyName ?? 'Abcotronics',
                                timezone: parsed.timezone ?? 'Africa/Johannesburg',
                                currency: parsed.currency ?? 'ZAR',
                                dateFormat: parsed.dateFormat ?? 'DD/MM/YYYY',
                                language: parsed.language ?? 'en',
                                sessionTimeout: parsed.sessionTimeout ?? 30,
                                requirePasswordChange: parsed.requirePasswordChange ?? false,
                                twoFactorAuth: parsed.twoFactorAuth ?? false,
                                auditLogging: parsed.auditLogging ?? true,
                                emailProvider: parsed.emailProvider ?? 'gmail',
                                googleCalendar: parsed.googleCalendar ?? false,
                                quickbooks: parsed.quickbooks ?? false,
                                slack: parsed.slack ?? false
                            };
                            setSettings(mergedSettings);
                        } catch (err) {
                            console.warn('Failed to parse localStorage settings:', err);
                        }
                    }
                }
                
                // Get final settings (merged with defaults)
                let finalSettings = {};
                if (dbSettings) {
                    finalSettings = {
                        companyName: dbSettings.companyName ?? 'Abcotronics',
                        timezone: dbSettings.timezone ?? 'Africa/Johannesburg',
                        currency: dbSettings.currency ?? 'ZAR',
                        dateFormat: dbSettings.dateFormat ?? 'DD/MM/YYYY',
                        language: dbSettings.language ?? 'en',
                        sessionTimeout: dbSettings.sessionTimeout ?? 30,
                        requirePasswordChange: dbSettings.requirePasswordChange ?? false,
                        twoFactorAuth: dbSettings.twoFactorAuth ?? false,
                        auditLogging: dbSettings.auditLogging ?? true,
                        emailProvider: dbSettings.emailProvider ?? 'gmail',
                        googleCalendar: dbSettings.googleCalendar ?? false,
                        quickbooks: dbSettings.quickbooks ?? false,
                        slack: dbSettings.slack ?? false
                    };
                } else {
                    const localSettings = localStorage.getItem('systemSettings');
                    if (localSettings) {
                        try {
                            const parsed = JSON.parse(localSettings);
                            finalSettings = {
                                companyName: parsed.companyName ?? 'Abcotronics',
                                timezone: parsed.timezone ?? 'Africa/Johannesburg',
                                currency: parsed.currency ?? 'ZAR',
                                dateFormat: parsed.dateFormat ?? 'DD/MM/YYYY',
                                language: parsed.language ?? 'en',
                                sessionTimeout: parsed.sessionTimeout ?? 30,
                                requirePasswordChange: parsed.requirePasswordChange ?? false,
                                twoFactorAuth: parsed.twoFactorAuth ?? false,
                                auditLogging: parsed.auditLogging ?? true,
                                emailProvider: parsed.emailProvider ?? 'gmail',
                                googleCalendar: parsed.googleCalendar ?? false,
                                quickbooks: parsed.quickbooks ?? false,
                                slack: parsed.slack ?? false
                            };
                        } catch (e) {
                            console.warn('Failed to parse localStorage settings:', e);
                        }
                    }
                }
                
                // Apply settings to global context if available
                if (Object.keys(finalSettings).length > 0 && window.setSystemSettings) {
                    window.setSystemSettings(finalSettings);
                }
                
                // Dispatch event so other components can react to settings loaded
                if (Object.keys(finalSettings).length > 0) {
                    window.dispatchEvent(new CustomEvent('systemSettingsLoaded', { 
                        detail: finalSettings 
                    }));
                }
                
                // Expose global getter function for settings
                window.getSystemSettings = () => {
                    const stored = localStorage.getItem('systemSettings');
                    if (stored) {
                        try {
                            const parsed = JSON.parse(stored);
                            // Merge with defaults
                            return {
                                companyName: parsed.companyName ?? 'Abcotronics',
                                timezone: parsed.timezone ?? 'Africa/Johannesburg',
                                currency: parsed.currency ?? 'ZAR',
                                dateFormat: parsed.dateFormat ?? 'DD/MM/YYYY',
                                language: parsed.language ?? 'en',
                                sessionTimeout: parsed.sessionTimeout ?? 30,
                                requirePasswordChange: parsed.requirePasswordChange ?? false,
                                twoFactorAuth: parsed.twoFactorAuth ?? false,
                                auditLogging: parsed.auditLogging ?? true,
                                emailProvider: parsed.emailProvider ?? 'gmail',
                                googleCalendar: parsed.googleCalendar ?? false,
                                quickbooks: parsed.quickbooks ?? false,
                                slack: parsed.slack ?? false
                            };
                        } catch (e) {
                            console.warn('Failed to parse stored settings:', e);
                        }
                    }
                    return finalSettings || {};
                };
                
                // Expose helper to check if settings API is available
                window.isSettingsAPIAvailable = () => {
                    return !!(window.DatabaseAPI?.updateSettings || window.api?.updateSettings);
                };
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

            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Language
                </label>
                <select
                    value={settings.language}
                    onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                        isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'
                    }`}
                >
                    <option value="en">English</option>
                    <option value="af">Afrikaans</option>
                    <option value="zu">Zulu</option>
                    <option value="xh">Xhosa</option>
                </select>
            </div>
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
                return <NotificationsComponent />;
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

// Log that Settings component is loaded
