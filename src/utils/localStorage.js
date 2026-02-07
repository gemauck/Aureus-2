// Local Storage Utilities

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch (e) {
    const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22);
    if (isQuota) {
      console.warn('⚠️ localStorage quota exceeded, skipping cache for', key);
    } else {
      console.warn('⚠️ localStorage setItem failed for', key, e?.message || e);
    }
    // Never rethrow - caching is optional
  }
}

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
        if (token) safeSetItem('abcotronics_token', token);
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
        safeSetItem('abcotronics_user', user);
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
        safeSetItem('abcotronics_clients', clients);
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
        safeSetItem('abcotronics_leads', leads);
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
        safeSetItem('abcotronics_projects', projects);
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
        safeSetItem('abcotronics_time_entries', entries);
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
        safeSetItem('abcotronics_invoices', invoices);
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
            safeSetItem('abcotronics_users', users);
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
            safeSetItem('abcotronics_invitations', invitations);
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
        safeSetItem('abcotronics_team_documents', documents);
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
        safeSetItem('abcotronics_team_workflows', workflows);
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
        safeSetItem('abcotronics_team_checklists', checklists);
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
        safeSetItem('abcotronics_team_notices', notices);
    },

    // Management Meeting Notes
    getManagementMeetingNotes: () => {
        try {
            const notes = localStorage.getItem('abcotronics_management_meeting_notes');
            if (!notes) return [];
            const parsed = JSON.parse(notes);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Error loading management meeting notes:', e);
            return [];
        }
    },
    
    setManagementMeetingNotes: (notes) => {
        safeSetItem('abcotronics_management_meeting_notes', notes);
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
        safeSetItem('abcotronics_employees', employees);
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
        safeSetItem('abcotronics_leave_applications', applications);
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
        safeSetItem('abcotronics_leave_balances', balances);
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
        safeSetItem('abcotronics_attendance_records', records);
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
        safeSetItem('abcotronics_payroll_records', records);
    },

    // Job Cards
    getJobCards: () => {
        try {
            const jobCards = localStorage.getItem('abcotronics_job_cards');
            return jobCards ? JSON.parse(jobCards) : null;
        } catch (e) {
            console.error('Error loading job cards:', e);
            return null;
        }
    },
    
    setJobCards: (jobCards) => {
        safeSetItem('abcotronics_job_cards', jobCards);
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
        safeSetItem('abcotronics_qb_connection', connection);
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
        safeSetItem('abcotronics_qb_sync_settings', settings);
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
        safeSetItem('abcotronics_qb_employee_mapping', mapping);
    }
};

// Make available globally with immediate assignment
if (typeof window !== 'undefined') {
    // Merge with existing storage if it exists (preserves methods from authStorage.js if loaded first)
    if (window.storage && typeof window.storage === 'object') {
        // Merge all localStorage methods into existing storage object
        Object.assign(window.storage, storage);
    } else {
        // No existing storage, use localStorage as base
        window.storage = storage;
    }
    // Create a global storage variable for components that use 'storage' directly
    if (typeof globalThis !== 'undefined') {
        globalThis.storage = window.storage;
    }
}

// Debug function to check if storage is loaded
window.debugStorage = () => {
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
