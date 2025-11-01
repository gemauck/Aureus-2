// Local Storage Utilities
const storage = {
    // Auth Token
    getToken: () => {
        try {
            return localStorage.getItem('abcotronics_token') || null;
        } catch (e) {
            console.error('Error loading token:', e);
            return null;
        }
    },
    setToken: (token) => {
        if (token) localStorage.setItem('abcotronics_token', token);
    },
    removeToken: () => {
        localStorage.removeItem('abcotronics_token');
    },
    // User
    getUser: () => {
        try {
            const user = localStorage.getItem('abcotronics_user');
            return user ? JSON.parse(user) : null;
        } catch (e) {
            console.error('Error loading user:', e);
            return null;
        }
    },
    
    setUser: (user) => {
        localStorage.setItem('abcotronics_user', JSON.stringify(user));
    },
    
    removeUser: () => {
        localStorage.removeItem('abcotronics_user');
    },
    
    // Remember last email used for login
    getLastLoginEmail: () => {
        try {
            return localStorage.getItem('abcotronics_last_login_email') || null;
        } catch (e) {
            console.error('Error loading last login email:', e);
            return null;
        }
    },
    
    setLastLoginEmail: (email) => {
        try {
            if (email) {
                localStorage.setItem('abcotronics_last_login_email', email);
            } else {
                // Clear if email is null/empty
                localStorage.removeItem('abcotronics_last_login_email');
            }
        } catch (e) {
            console.error('Error saving last login email:', e);
        }
    },
    
    clearLastLoginEmail: () => {
        try {
            localStorage.removeItem('abcotronics_last_login_email');
        } catch (e) {
            console.error('Error clearing last login email:', e);
        }
    },
    
    // Get current user name for logging
    getUserName: () => {
        try {
            const userData = localStorage.getItem('abcotronics_user');
            const user = userData ? JSON.parse(userData) : null;
            return user?.name || user?.email || 'System';
        } catch (e) {
            console.error('Error getting user name:', e);
            return 'System';
        }
    },
    
    // Get current user info object for logging
    getUserInfo: () => {
        try {
            const userData = localStorage.getItem('abcotronics_user');
            const user = userData ? JSON.parse(userData) : null;
            return {
                name: user?.name || 'System',
                email: user?.email || 'system',
                id: user?.id || 'system',
                role: user?.role || 'System'
            };
        } catch (e) {
            console.error('Error getting user info:', e);
            return {
                name: 'System',
                email: 'system',
                id: 'system',
                role: 'System'
            };
        }
    },
    
    // Clients
    getClients: () => {
        try {
            const clients = localStorage.getItem('abcotronics_clients');
            return clients ? JSON.parse(clients) : null;
        } catch (e) {
            console.error('Error loading clients:', e);
            return null;
        }
    },
    
    setClients: (clients) => {
        localStorage.setItem('abcotronics_clients', JSON.stringify(clients));
    },
    
    removeClients: () => {
        localStorage.removeItem('abcotronics_clients');
    },
    
    // Leads
    getLeads: () => {
        try {
            const leads = localStorage.getItem('abcotronics_leads');
            return leads ? JSON.parse(leads) : null;
        } catch (e) {
            console.error('Error loading leads:', e);
            return null;
        }
    },
    
    setLeads: (leads) => {
        localStorage.setItem('abcotronics_leads', JSON.stringify(leads));
    },
    
    removeLeads: () => {
        localStorage.removeItem('abcotronics_leads');
    },
    
    // Projects
    getProjects: () => {
        try {
            const projects = localStorage.getItem('abcotronics_projects');
            return projects ? JSON.parse(projects) : null;
        } catch (e) {
            console.error('Error loading projects:', e);
            return null;
        }
    },
    
    setProjects: (projects) => {
        localStorage.setItem('abcotronics_projects', JSON.stringify(projects));
    },
    
    // Time Entries
    getTimeEntries: () => {
        try {
            const entries = localStorage.getItem('abcotronics_time_entries');
            return entries ? JSON.parse(entries) : null;
        } catch (e) {
            console.error('Error loading time entries:', e);
            return null;
        }
    },
    
    setTimeEntries: (entries) => {
        localStorage.setItem('abcotronics_time_entries', JSON.stringify(entries));
    },

    // Invoices
    getInvoices: () => {
        try {
            const invoices = localStorage.getItem('abcotronics_invoices');
            return invoices ? JSON.parse(invoices) : null;
        } catch (e) {
            console.error('Error loading invoices:', e);
            return null;
        }
    },
    
    setInvoices: (invoices) => {
        localStorage.setItem('abcotronics_invoices', JSON.stringify(invoices));
    },

    // Users
    getUsers: () => {
        try {
            const users = localStorage.getItem('abcotronics_users');
            return users ? JSON.parse(users) : null;
        } catch (e) {
            console.error('Error loading users:', e);
            return null;
        }
    },
    
        setUsers: (users) => {
            localStorage.setItem('abcotronics_users', JSON.stringify(users));
        },

        // User Invitations
        getInvitations: () => {
            try {
                const invitations = localStorage.getItem('abcotronics_invitations');
                return invitations ? JSON.parse(invitations) : null;
            } catch (e) {
                console.error('Error loading invitations:', e);
                return null;
            }
        },
        
        setInvitations: (invitations) => {
            localStorage.setItem('abcotronics_invitations', JSON.stringify(invitations));
        },

    // Team Documents
    getTeamDocuments: () => {
        try {
            const documents = localStorage.getItem('abcotronics_team_documents');
            return documents ? JSON.parse(documents) : null;
        } catch (e) {
            console.error('Error loading team documents:', e);
            return null;
        }
    },
    
    setTeamDocuments: (documents) => {
        localStorage.setItem('abcotronics_team_documents', JSON.stringify(documents));
    },

    // Team Workflows
    getTeamWorkflows: () => {
        try {
            const workflows = localStorage.getItem('abcotronics_team_workflows');
            return workflows ? JSON.parse(workflows) : null;
        } catch (e) {
            console.error('Error loading team workflows:', e);
            return null;
        }
    },
    
    setTeamWorkflows: (workflows) => {
        localStorage.setItem('abcotronics_team_workflows', JSON.stringify(workflows));
    },

    // Team Checklists
    getTeamChecklists: () => {
        try {
            const checklists = localStorage.getItem('abcotronics_team_checklists');
            return checklists ? JSON.parse(checklists) : null;
        } catch (e) {
            console.error('Error loading team checklists:', e);
            return null;
        }
    },
    
    setTeamChecklists: (checklists) => {
        localStorage.setItem('abcotronics_team_checklists', JSON.stringify(checklists));
    },

    // Team Notices
    getTeamNotices: () => {
        try {
            const notices = localStorage.getItem('abcotronics_team_notices');
            return notices ? JSON.parse(notices) : null;
        } catch (e) {
            console.error('Error loading team notices:', e);
            return null;
        }
    },
    
    setTeamNotices: (notices) => {
        localStorage.setItem('abcotronics_team_notices', JSON.stringify(notices));
    },

    // HR - Employees
    getEmployees: () => {
        try {
            const employees = localStorage.getItem('abcotronics_employees');
            return employees ? JSON.parse(employees) : null;
        } catch (e) {
            console.error('Error loading employees:', e);
            return null;
        }
    },
    
    setEmployees: (employees) => {
        localStorage.setItem('abcotronics_employees', JSON.stringify(employees));
    },

    // HR - Leave Applications
    getLeaveApplications: () => {
        try {
            const applications = localStorage.getItem('abcotronics_leave_applications');
            return applications ? JSON.parse(applications) : null;
        } catch (e) {
            console.error('Error loading leave applications:', e);
            return null;
        }
    },
    
    setLeaveApplications: (applications) => {
        localStorage.setItem('abcotronics_leave_applications', JSON.stringify(applications));
    },

    // HR - Leave Balances
    getLeaveBalances: () => {
        try {
            const balances = localStorage.getItem('abcotronics_leave_balances');
            return balances ? JSON.parse(balances) : null;
        } catch (e) {
            console.error('Error loading leave balances:', e);
            return null;
        }
    },
    
    setLeaveBalances: (balances) => {
        localStorage.setItem('abcotronics_leave_balances', JSON.stringify(balances));
    },

    // HR - Attendance Records
    getAttendanceRecords: () => {
        try {
            const records = localStorage.getItem('abcotronics_attendance_records');
            return records ? JSON.parse(records) : null;
        } catch (e) {
            console.error('Error loading attendance records:', e);
            return null;
        }
    },
    
    setAttendanceRecords: (records) => {
        localStorage.setItem('abcotronics_attendance_records', JSON.stringify(records));
    },

    // HR - Payroll Records
    getPayrollRecords: () => {
        try {
            const records = localStorage.getItem('abcotronics_payroll_records');
            return records ? JSON.parse(records) : null;
        } catch (e) {
            console.error('Error loading payroll records:', e);
            return null;
        }
    },
    
    setPayrollRecords: (records) => {
        localStorage.setItem('abcotronics_payroll_records', JSON.stringify(records));
    },

    // QuickBooks Integration
    getQBConnection: () => {
        try {
            const connection = localStorage.getItem('abcotronics_qb_connection');
            return connection ? JSON.parse(connection) : null;
        } catch (e) {
            console.error('Error loading QB connection:', e);
            return null;
        }
    },
    
    setQBConnection: (connection) => {
        localStorage.setItem('abcotronics_qb_connection', JSON.stringify(connection));
    },

    removeQBConnection: () => {
        localStorage.removeItem('abcotronics_qb_connection');
    },

    getQBSyncSettings: () => {
        try {
            const settings = localStorage.getItem('abcotronics_qb_sync_settings');
            return settings ? JSON.parse(settings) : null;
        } catch (e) {
            console.error('Error loading QB sync settings:', e);
            return null;
        }
    },
    
    setQBSyncSettings: (settings) => {
        localStorage.setItem('abcotronics_qb_sync_settings', JSON.stringify(settings));
    },

    getQBEmployeeMapping: () => {
        try {
            const mapping = localStorage.getItem('abcotronics_qb_employee_mapping');
            return mapping ? JSON.parse(mapping) : null;
        } catch (e) {
            console.error('Error loading QB employee mapping:', e);
            return null;
        }
    },
    
    setQBEmployeeMapping: (mapping) => {
        localStorage.setItem('abcotronics_qb_employee_mapping', JSON.stringify(mapping));
    }
};

// Make available globally with immediate assignment
if (typeof window !== 'undefined') {
    window.storage = storage;
    // Create a global storage variable for components that use 'storage' directly
    if (typeof globalThis !== 'undefined') {
        globalThis.storage = storage;
    }
    
    // Also create a global 'storage' variable for backward compatibility
    window.storage = storage;
}

// Debug function to check if storage is loaded
window.debugStorage = () => {
    console.log('🔍 Storage Debug:', {
        hasGetProjects: typeof window.storage?.getProjects === 'function',
        hasGetClients: typeof window.storage?.getClients === 'function',
        hasGetLeads: typeof window.storage?.getLeads === 'function',
        storageMethods: Object.keys(window.storage || {})
    });
};

// Ensure storage is available immediately and robustly
if (typeof window !== 'undefined') {
    // Multiple assignment strategies to ensure availability
    window.storage = storage;
    globalThis.storage = storage;
    
    // Create a global storage variable for components that use 'storage' directly
    if (typeof globalThis !== 'undefined') {
        globalThis.storage = storage;
    }
    
    const log = window.debug?.log || (() => {});
    log('✅ Storage utilities loaded');
    
    // Dispatch event to notify components that storage is ready
    // Use setTimeout to ensure all components are loaded
    setTimeout(() => {
        window.dispatchEvent(new CustomEvent('storageReady', {
            detail: {
                timestamp: Date.now(),
                methods: Object.keys(storage)
            }
        }));
        log('📡 Storage ready event dispatched');
    }, 50);
    
    // Also set up a global check function
    window.checkStorage = () => {
        return {
            available: !!window.storage,
            methods: Object.keys(window.storage || {}),
            hasSetProjects: typeof window.storage?.setProjects === 'function',
            hasGetProjects: typeof window.storage?.getProjects === 'function',
            hasSetClients: typeof window.storage?.setClients === 'function',
            hasGetClients: typeof window.storage?.getClients === 'function',
            hasGetUsers: typeof window.storage?.getUsers === 'function',
            hasGetTeamDocuments: typeof window.storage?.getTeamDocuments === 'function',
            hasGetEmployees: typeof window.storage?.getEmployees === 'function'
        };
    };
    
    // Add a method to manually trigger storage ready event
    window.triggerStorageReady = () => {
        window.dispatchEvent(new CustomEvent('storageReady', {
            detail: {
                timestamp: Date.now(),
                methods: Object.keys(storage),
                manual: true
            }
        }));
        console.log('📡 Storage ready event manually triggered');
    };
    
    // Add a safety check that runs periodically to ensure storage is available
    let storageCheckInterval = setInterval(() => {
        if (!window.storage) {
            console.warn('⚠️ Storage became unavailable, re-assigning...');
            window.storage = storage;
            globalThis.storage = storage;
        }
    }, 1000);
    
    // Clear the interval after 10 seconds
    setTimeout(() => {
        clearInterval(storageCheckInterval);
    }, 10000);
}
