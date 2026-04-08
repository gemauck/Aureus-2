// Settings Component - Per-user preferences (company name is read-only from system)
const { useState, useEffect, useMemo } = React;

const USER_PREF_DEFAULTS = {
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

function resolveUserForAdminChecks(authUser) {
    if (authUser && (authUser.id || authUser.email)) return authUser;
    try {
        if (window.storage?.getUser) {
            const u = window.storage.getUser();
            if (u && (u.id || u.email)) return u;
        }
    } catch (_) {}
    try {
        const raw = localStorage.getItem('currentUser');
        if (raw && raw !== 'null') {
            const p = JSON.parse(raw);
            if (p && (p.id || p.email)) return p;
        }
    } catch (_) {}
    return null;
}

const Settings = () => {
    const [activeTab, setActiveTab] = useState('general');
    const [companyName, setCompanyName] = useState('Abcotronics');
    const [settings, setSettings] = useState({ ...USER_PREF_DEFAULTS });
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [saveStatus, setSaveStatus] = useState('');
    const { isDark } = window.useTheme();

    const authHook = window.useAuth || (() => ({ user: null }));
    const { user: authUser } = authHook();

    const isDocAdmin = useMemo(() => {
        const u = resolveUserForAdminChecks(authUser);
        if (typeof window.isAdminUser === 'function') return window.isAdminUser(u);
        return typeof window.isAdminRole === 'function' && window.isAdminRole(u?.role);
    }, [authUser?.id, authUser?.email, authUser?.role, authUser?.permissions]);

    const [docCompanyName, setDocCompanyName] = useState('');
    const [docAddressText, setDocAddressText] = useState('');
    const [docPhone, setDocPhone] = useState('');
    const [docEmail, setDocEmail] = useState('');
    const [docVat, setDocVat] = useState('');
    const [docFooter, setDocFooter] = useState('');
    const [docLogoDataUrl, setDocLogoDataUrl] = useState('');
    const [docLoading, setDocLoading] = useState(false);
    const [docSaveStatus, setDocSaveStatus] = useState('');

    // Resolve Notification Settings component from global window (registered by NotificationSettings.jsx)
    const NotificationsComponent = React.useMemo(() => {
        const Comp = window.NotificationSettings;
        if (Comp && typeof Comp === 'function') {
            return Comp;
        }
        // Fallback placeholder while component loads
        return () => <div className="text-center py-12 text-gray-500">Notifications settings loading...</div>;
    }, []);

    const tabs = useMemo(() => {
        const base = [
            { id: 'general', label: 'General', icon: 'fa-cog' },
            ...(isDocAdmin ? [{ id: 'documents', label: 'Purchase documents', icon: 'fa-file-invoice' }] : []),
            { id: 'notifications', label: 'Notifications', icon: 'fa-bell' },
            { id: 'data', label: 'Data Management', icon: 'fa-database' }
        ];
        return base;
    }, [isDocAdmin]);

    const handleSave = async () => {
        setIsLoading(true);
        setSaveStatus('Saving...');
        try {
            let saved = false;
            let savedSettings = null;
            let savedCompanyName = companyName;
            try {
                if (window.api?.updateSettings) {
                    const response = await window.api.updateSettings(settings);
                    savedSettings = response?.data?.settings || settings;
                    savedCompanyName = response?.data?.companyName ?? companyName;
                    saved = true;
                } else if (window.DatabaseAPI?.updateSettings) {
                    const response = await window.DatabaseAPI.updateSettings(settings);
                    savedSettings = response?.data?.settings || settings;
                    savedCompanyName = response?.data?.companyName ?? companyName;
                    saved = true;
                }
            } catch (apiErr) {
                console.warn('Settings API save failed, trying fetch fallback:', apiErr);
            }
            if (!saved) {
                const token = window.storage?.getToken?.() || localStorage.getItem('token');
                const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
                if (token) {
                    const res = await fetch(`${apiBase}/api/settings`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        credentials: 'include',
                        body: JSON.stringify(settings)
                    });
                    if (res.ok) {
                        const json = await res.json();
                        savedSettings = json?.data?.settings || settings;
                        savedCompanyName = json?.data?.companyName ?? companyName;
                        saved = true;
                    }
                }
            }
            if (!saved) {
                savedSettings = settings;
                saved = true;
                console.warn('⚠️ Settings saved to localStorage (API not available)');
            }
            if (saved && savedSettings) {
                setSettings(savedSettings);
                setCompanyName(savedCompanyName);
                const merged = { ...savedSettings, companyName: savedCompanyName };
                localStorage.setItem('systemSettings', JSON.stringify(merged));
                if (window.setSystemSettings) window.setSystemSettings(merged);
                window.dispatchEvent(new CustomEvent('systemSettingsChanged', { detail: merged }));
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
        if (confirm('Are you sure you want to reset your preferences to default?')) {
            const defaultPrefs = { ...USER_PREF_DEFAULTS };
            setSettings(defaultPrefs);
            try {
                if (window.api?.updateSettings) {
                    await window.api.updateSettings(defaultPrefs);
                } else if (window.DatabaseAPI?.updateSettings) {
                    await window.DatabaseAPI.updateSettings(defaultPrefs);
                } else {
                    const token = window.storage?.getToken?.() || localStorage.getItem('token');
                    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
                    if (token) {
                        const res = await fetch(`${apiBase}/api/settings`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            credentials: 'include',
                            body: JSON.stringify(defaultPrefs)
                        });
                        if (!res.ok) throw new Error('Failed to save');
                    }
                }
                const merged = { ...defaultPrefs, companyName };
                localStorage.setItem('systemSettings', JSON.stringify(merged));
                if (window.setSystemSettings) window.setSystemSettings(merged);
                window.dispatchEvent(new CustomEvent('systemSettingsChanged', { detail: merged }));
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
                settings: { ...settings, companyName },
                data: {}
            };
            
            // Fetch all data types in parallel - use bound APIs only so 'this' is never lost
            const api = window.api;
            const dbApi = window.DatabaseAPI;
            const dataPromises = [];

            if (api?.getClients) {
                dataPromises.push(
                    api.getClients().then(res => ({
                        key: 'clients',
                        data: res?.data?.clients || res?.clients || []
                    })).catch(err => {
                        console.warn('Failed to export clients:', err);
                        return { key: 'clients', data: [] };
                    })
                );
            } else if (dbApi?.getClients) {
                dataPromises.push(
                    dbApi.getClients.call(dbApi).then(res => ({
                        key: 'clients',
                        data: res?.data?.clients || res?.clients || []
                    })).catch(err => {
                        console.warn('Failed to export clients:', err);
                        return { key: 'clients', data: [] };
                    })
                );
            }

            if (api?.getProjects) {
                dataPromises.push(
                    api.getProjects().then(res => ({
                        key: 'projects',
                        data: res?.data?.projects || res?.projects || []
                    })).catch(err => {
                        console.warn('Failed to export projects:', err);
                        return { key: 'projects', data: [] };
                    })
                );
            } else if (dbApi?.getProjects) {
                dataPromises.push(
                    dbApi.getProjects.call(dbApi).then(res => ({
                        key: 'projects',
                        data: res?.data?.projects || res?.projects || []
                    })).catch(err => {
                        console.warn('Failed to export projects:', err);
                        return { key: 'projects', data: [] };
                    })
                );
            }

            if (api?.getTimeEntries) {
                dataPromises.push(
                    api.getTimeEntries().then(res => ({
                        key: 'timeEntries',
                        data: res?.data?.timeEntries || res?.timeEntries || []
                    })).catch(err => {
                        console.warn('Failed to export time entries:', err);
                        return { key: 'timeEntries', data: [] };
                    })
                );
            } else if (dbApi?.getTimeEntries) {
                dataPromises.push(
                    dbApi.getTimeEntries.call(dbApi).then(res => ({
                        key: 'timeEntries',
                        data: res?.data?.timeEntries || res?.timeEntries || []
                    })).catch(err => {
                        console.warn('Failed to export time entries:', err);
                        return { key: 'timeEntries', data: [] };
                    })
                );
            }

            if (api?.getLeads) {
                dataPromises.push(
                    api.getLeads().then(res => ({
                        key: 'leads',
                        data: res?.data?.leads || res?.leads || []
                    })).catch(err => {
                        console.warn('Failed to export leads:', err);
                        return { key: 'leads', data: [] };
                    })
                );
            } else if (dbApi?.getLeads) {
                dataPromises.push(
                    dbApi.getLeads.call(dbApi).then(res => ({
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
                
                // Import each data type - use bound APIs only so 'this' is never lost
                const importPromises = [];
                let importedCount = 0;
                const api = window.api;
                const dbApi = window.DatabaseAPI;

                if (importData.data.clients && Array.isArray(importData.data.clients)) {
                    const createClient = api?.createClient || (dbApi?.createClient && dbApi.createClient.bind(dbApi));
                    if (createClient) {
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

                if (importData.data.projects && Array.isArray(importData.data.projects)) {
                    const createProject = api?.createProject || (dbApi?.createProject && dbApi.createProject.bind(dbApi));
                    if (createProject) {
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

                if (importData.data.timeEntries && Array.isArray(importData.data.timeEntries)) {
                    const createTimeEntry = api?.createTimeEntry || (dbApi?.createTimeEntry && dbApi.createTimeEntry.bind(dbApi));
                    if (createTimeEntry) {
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

                if (importData.data.leads && Array.isArray(importData.data.leads)) {
                    const createLead = api?.createLead || (dbApi?.createLead && dbApi.createLead.bind(dbApi));
                    if (createLead) {
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
                
                // Import user preferences if present (company name is not user-editable)
                if (importData.settings && confirm('Do you want to import your preferences as well?')) {
                    const prefs = { ...USER_PREF_DEFAULTS };
                    const s = importData.settings;
                    if (s.timezone != null) prefs.timezone = s.timezone;
                    if (s.currency != null) prefs.currency = s.currency;
                    if (s.dateFormat != null) prefs.dateFormat = s.dateFormat;
                    if (s.language != null) prefs.language = s.language;
                    if (s.sessionTimeout != null) prefs.sessionTimeout = s.sessionTimeout;
                    if (s.requirePasswordChange != null) prefs.requirePasswordChange = s.requirePasswordChange;
                    if (s.twoFactorAuth != null) prefs.twoFactorAuth = s.twoFactorAuth;
                    if (s.auditLogging != null) prefs.auditLogging = s.auditLogging;
                    if (s.emailProvider != null) prefs.emailProvider = s.emailProvider;
                    if (s.googleCalendar != null) prefs.googleCalendar = s.googleCalendar;
                    if (s.quickbooks != null) prefs.quickbooks = s.quickbooks;
                    if (s.slack != null) prefs.slack = s.slack;
                    setSettings(prefs);
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
        const loadSettings = async () => {
            setIsLoadingData(true);
            try {
                let userPrefs = null;
                let company = 'Abcotronics';
                try {
                    if (window.api?.getSettings) {
                        const response = await window.api.getSettings();
                        userPrefs = response?.data?.settings;
                        company = response?.data?.companyName ?? company;
                    } else if (window.DatabaseAPI?.getSettings) {
                        const response = await window.DatabaseAPI.getSettings();
                        userPrefs = response?.data?.settings;
                        company = response?.data?.companyName ?? company;
                    }
                } catch (err) {
                    console.warn('Settings API load failed:', err);
                }
                if (userPrefs == null) {
                    const token = window.storage?.getToken?.() || localStorage.getItem('token');
                    const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
                    if (token) {
                        try {
                            const res = await fetch(`${apiBase}/api/settings`, {
                                method: 'GET',
                                headers: { 'Authorization': `Bearer ${token}` },
                                credentials: 'include'
                            });
                            if (res.ok) {
                                const json = await res.json();
                                userPrefs = json?.data?.settings;
                                company = json?.data?.companyName ?? company;
                            }
                        } catch (fetchErr) {
                            console.warn('Settings fetch fallback failed:', fetchErr);
                        }
                    }
                }
                let mergedPrefs = {
                    ...USER_PREF_DEFAULTS,
                    ...(userPrefs || {}),
                    timezone: userPrefs?.timezone ?? USER_PREF_DEFAULTS.timezone,
                    currency: userPrefs?.currency ?? USER_PREF_DEFAULTS.currency,
                    dateFormat: userPrefs?.dateFormat ?? USER_PREF_DEFAULTS.dateFormat,
                    language: userPrefs?.language ?? USER_PREF_DEFAULTS.language,
                    sessionTimeout: userPrefs?.sessionTimeout ?? USER_PREF_DEFAULTS.sessionTimeout,
                    requirePasswordChange: userPrefs?.requirePasswordChange ?? USER_PREF_DEFAULTS.requirePasswordChange,
                    twoFactorAuth: userPrefs?.twoFactorAuth ?? USER_PREF_DEFAULTS.twoFactorAuth,
                    auditLogging: userPrefs?.auditLogging ?? USER_PREF_DEFAULTS.auditLogging,
                    emailProvider: userPrefs?.emailProvider ?? USER_PREF_DEFAULTS.emailProvider,
                    googleCalendar: userPrefs?.googleCalendar ?? USER_PREF_DEFAULTS.googleCalendar,
                    quickbooks: userPrefs?.quickbooks ?? USER_PREF_DEFAULTS.quickbooks,
                    slack: userPrefs?.slack ?? USER_PREF_DEFAULTS.slack
                };
                if (userPrefs == null && company === 'Abcotronics') {
                    const stored = localStorage.getItem('systemSettings');
                    if (stored) {
                        try {
                            const parsed = JSON.parse(stored);
                            company = parsed.companyName ?? 'Abcotronics';
                            mergedPrefs = {
                                ...USER_PREF_DEFAULTS,
                                timezone: parsed.timezone ?? USER_PREF_DEFAULTS.timezone,
                                currency: parsed.currency ?? USER_PREF_DEFAULTS.currency,
                                dateFormat: parsed.dateFormat ?? USER_PREF_DEFAULTS.dateFormat,
                                language: parsed.language ?? USER_PREF_DEFAULTS.language,
                                sessionTimeout: parsed.sessionTimeout ?? USER_PREF_DEFAULTS.sessionTimeout,
                                requirePasswordChange: parsed.requirePasswordChange ?? USER_PREF_DEFAULTS.requirePasswordChange,
                                twoFactorAuth: parsed.twoFactorAuth ?? USER_PREF_DEFAULTS.twoFactorAuth,
                                auditLogging: parsed.auditLogging ?? USER_PREF_DEFAULTS.auditLogging,
                                emailProvider: parsed.emailProvider ?? USER_PREF_DEFAULTS.emailProvider,
                                googleCalendar: parsed.googleCalendar ?? USER_PREF_DEFAULTS.googleCalendar,
                                quickbooks: parsed.quickbooks ?? USER_PREF_DEFAULTS.quickbooks,
                                slack: parsed.slack ?? USER_PREF_DEFAULTS.slack
                            };
                        } catch (e) {
                            console.warn('Failed to parse localStorage settings:', e);
                        }
                    }
                }
                setSettings(mergedPrefs);
                setCompanyName(company);
                const finalSettings = { ...mergedPrefs, companyName: company };
                localStorage.setItem('systemSettings', JSON.stringify(finalSettings));
                if (window.setSystemSettings) window.setSystemSettings(finalSettings);
                window.dispatchEvent(new CustomEvent('systemSettingsLoaded', { detail: finalSettings }));
                window.getSystemSettings = () => {
                    const stored = localStorage.getItem('systemSettings');
                    if (stored) {
                        try {
                            const p = JSON.parse(stored);
                            return {
                                companyName: p.companyName ?? 'Abcotronics',
                                ...USER_PREF_DEFAULTS,
                                ...p
                            };
                        } catch (e) {
                            console.warn('Failed to parse stored settings:', e);
                        }
                    }
                    return { ...USER_PREF_DEFAULTS, companyName: company };
                };
                window.isSettingsAPIAvailable = () => !!(window.DatabaseAPI?.updateSettings || window.api?.updateSettings);
            } catch (error) {
                console.error('Error loading settings:', error);
            } finally {
                setIsLoadingData(false);
            }
        };
        loadSettings();
    }, []);

    useEffect(() => {
        if (!isDocAdmin || isLoadingData || !window.DatabaseAPI?.getDocumentSettings) return;
        (async () => {
            try {
                const res = await window.DatabaseAPI.getDocumentSettings();
                const d = res?.data;
                if (!d) return;
                setDocCompanyName(d.companyName || '');
                const lh = d.poLetterhead || {};
                setDocAddressText((lh.addressLines || []).join('\n'));
                setDocPhone(lh.phone || '');
                setDocEmail(lh.email || '');
                setDocVat(lh.vatNumber || '');
                setDocFooter(lh.footerNote || '');
                setDocLogoDataUrl(lh.logoDataUrl || '');
            } catch (e) {
                console.warn('Document settings load failed:', e);
            }
        })();
    }, [isDocAdmin, isLoadingData]);

    const handleSavePurchaseDocuments = async () => {
        if (!window.DatabaseAPI?.updateDocumentSettings) {
            setDocSaveStatus('API not available');
            return;
        }
        setDocLoading(true);
        setDocSaveStatus('Saving…');
        try {
            const addressLines = docAddressText
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
            const poLetterhead = {
                addressLines,
                phone: docPhone.trim(),
                email: docEmail.trim(),
                vatNumber: docVat.trim(),
                footerNote: docFooter.trim()
            };
            if (docLogoDataUrl) poLetterhead.logoDataUrl = docLogoDataUrl;
            const res = await window.DatabaseAPI.updateDocumentSettings({
                companyName: docCompanyName.trim() || 'Abcotronics',
                poLetterhead
            });
            const d = res?.data;
            if (d?.companyName) {
                setCompanyName(d.companyName);
                const merged = { ...settings, companyName: d.companyName };
                localStorage.setItem('systemSettings', JSON.stringify(merged));
                if (window.setSystemSettings) window.setSystemSettings(merged);
                window.dispatchEvent(new CustomEvent('systemSettingsChanged', { detail: merged }));
            }
            setDocSaveStatus('Saved.');
            setTimeout(() => setDocSaveStatus(''), 4000);
        } catch (e) {
            setDocSaveStatus(e?.message || 'Save failed');
            setTimeout(() => setDocSaveStatus(''), 5000);
        } finally {
            setDocLoading(false);
        }
    };

    const renderPurchaseDocumentsSettings = () => (
        <div className="space-y-6">
            <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                Letterhead and logo appear on downloaded purchase order PDFs (Manufacturing → Purchase order → Download PDF).
            </p>
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Company name (PDF header)</label>
                <input
                    type="text"
                    value={docCompanyName}
                    onChange={(e) => setDocCompanyName(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                />
            </div>
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Address (one line per row)</label>
                <textarea
                    value={docAddressText}
                    onChange={(e) => setDocAddressText(e.target.value)}
                    rows={4}
                    className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Phone</label>
                    <input type="text" value={docPhone} onChange={(e) => setDocPhone(e.target.value)} className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                </div>
                <div>
                    <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Email</label>
                    <input type="text" value={docEmail} onChange={(e) => setDocEmail(e.target.value)} className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
                </div>
            </div>
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>VAT / registration number</label>
                <input type="text" value={docVat} onChange={(e) => setDocVat(e.target.value)} className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
            </div>
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Footer note</label>
                <textarea value={docFooter} onChange={(e) => setDocFooter(e.target.value)} rows={2} className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
            </div>
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Logo (PNG or JPEG)</label>
                <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => {
                        const file = e.target.files && e.target.files[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setDocLogoDataUrl(reader.result);
                        reader.readAsDataURL(file);
                    }}
                    className="text-sm w-full"
                />
                {docLogoDataUrl && (
                    <div className="mt-2 flex items-center gap-3">
                        <img src={docLogoDataUrl} alt="Logo preview" className="h-12 object-contain border border-gray-200 rounded" />
                        <button type="button" onClick={() => setDocLogoDataUrl('')} className="text-sm text-red-600 hover:underline">Remove logo</button>
                    </div>
                )}
            </div>
            {docSaveStatus && <p className={`text-sm ${docSaveStatus.includes('Saved') ? 'text-green-600' : 'text-red-600'}`}>{docSaveStatus}</p>}
            <button
                type="button"
                onClick={handleSavePurchaseDocuments}
                disabled={docLoading}
                className="px-6 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
                {docLoading ? 'Saving…' : 'Save purchase document settings'}
            </button>
        </div>
    );

    const renderGeneralSettings = () => (
        <div className="space-y-6">
            <div>
                <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'} mb-2`}>
                    Company
                </label>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                    {companyName}
                </p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                    {isDocAdmin
                        ? 'Open the Purchase documents tab in the sidebar to set the company name, logo, and address used on purchase order PDFs.'
                        : 'Company name and purchase order letterhead (logo, address on PO PDFs) are managed in Settings → Purchase documents. That tab is only visible to administrators—ask an admin to update them.'}
                </p>
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
            case 'documents':
                return renderPurchaseDocumentsSettings();
            case 'notifications':
                return <NotificationsComponent />;
            case 'data':
                return renderDataManagement();
            default:
                return renderGeneralSettings();
        }
    };

    if (isLoadingData) {
        return (
            <div className={`erp-module-root min-w-0 min-h-[40vh] ${isDark ? 'bg-gray-900' : 'bg-gray-50'} flex items-center justify-center`}>
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-4xl text-gray-400 mb-4"></i>
                    <p className="text-gray-500">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`erp-module-root min-w-0 max-w-full ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
                {/* Header */}
                <div className="mb-8">
                    <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        Settings
                    </h1>
                    <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
                                    <h2 className={`text-lg sm:text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                        {tabs.find(tab => tab.id === activeTab)?.label}
                                    </h2>
                                    {saveStatus && (
                                        <span className={`text-sm shrink-0 ${saveStatus.includes('successfully') ? 'text-green-600' : 'text-red-600'}`}>
                                            {saveStatus}
                                        </span>
                                    )}
                                </div>

                                {renderTabContent()}

                                {/* Action Buttons */}
                                {activeTab !== 'documents' && (
                                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between pt-6 border-t border-gray-200 dark:border-gray-600">
                                    <button
                                        onClick={handleReset}
                                        className="w-full sm:w-auto px-4 py-2.5 text-sm font-medium text-gray-700 bg-white dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[44px] sm:min-h-0"
                                    >
                                        Reset to Default
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isLoading}
                                        className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
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
