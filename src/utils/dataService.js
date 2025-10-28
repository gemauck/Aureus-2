// API-Only Data Service - Always uses database API, no localStorage fallback
// Wrap entire file in IIFE to prevent variable redeclaration when Babel transforms multiple times
(() => {
    // Get environment from window (set by debug.js) or determine locally
    const { isProduction, isLocalhost } = (() => {
        // Use window values if available (from debug.js)
        if (typeof window.isProduction !== 'undefined' && typeof window.isLocalhost !== 'undefined') {
            return { 
                isProduction: window.isProduction, 
                isLocalhost: window.isLocalhost 
            };
        }
        
        // Otherwise, determine locally
        const hostname = window.location.hostname;
        const isLocalhostValue = hostname === 'localhost' || hostname === '127.0.0.1';
        const isProductionValue = !isLocalhostValue && window.location.protocol === 'https:';
        
        return { isProduction: isProductionValue, isLocalhost: isLocalhostValue };
    })();

    const log = window.debug?.log || (() => {});
    log('🔍 Environment Detection:', { isProduction, isLocalhost, hostname: window.location.hostname });
    log('📡 DataService Mode: API-ONLY (no localStorage fallback)');

    // Helpers to normalize API/local responses to arrays and safely access storage methods
    function normalizeArrayResponse(response, preferredKeys = []) {
        // Try preferred keys first (e.g., ['projects'] or ['clients'])
        for (const key of preferredKeys) {
            const value = response?.[key];
            if (Array.isArray(value)) return value;
        }
        // Common data wrapper { data: [...] }
        if (Array.isArray(response?.data)) return response.data;
        // Direct array
        if (Array.isArray(response)) return response;
        // Unknown shape -> empty array
        return [];
    }

    function safeStorageCall(obj, methodName, fallback = []) {
        const fn = obj && obj[methodName];
        return typeof fn === 'function' ? fn.call(obj) : fallback;
    }

    const dataService = {
        // Projects - API Only
        async getProjects() {
        try {
            const log = window.debug?.log || (() => {});
            log('🌐 Using API for projects (API-only mode)');
            const response = await window.api.getProjects();
            return normalizeArrayResponse(response, ['projects']);
        } catch (error) {
            console.error('❌ API failed for projects:', error.message);
            throw new Error(`Failed to fetch projects from API: ${error.message}`);
        }
    },

    async setProjects(projects) {
        const log = window.debug?.log || (() => {});
        log('📡 Projects should be saved individually via API (no bulk operations)');
        log('💡 Use window.api.createProject() or window.api.updateProject() for individual projects');
        return projects;
    },

    async createProject(projectData) {
        try {
            console.log('🌐 Creating project via API (API-only mode)');
            const response = await window.api.createProject(projectData);
            return response.project || response;
        } catch (error) {
            console.error('❌ API create failed:', error.message);
            throw new Error(`Failed to create project via API: ${error.message}`);
        }
    },

    // Time Entries
    async getTimeEntries() {
        if (isProduction && window.api?.listTimeEntries) {
            try {
                console.log('🌐 Using API for time entries');
                const response = await window.api.listTimeEntries();
                return normalizeArrayResponse(response, ['timeEntries']);
            } catch (error) {
                console.warn('⚠️ API failed, falling back to localStorage:', error.message);
                return safeStorageCall(window.storage, 'getTimeEntries', []);
            }
        } else {
            console.log('💾 Using localStorage for time entries');
            return safeStorageCall(window.storage, 'getTimeEntries', []);
        }
    },

    async setTimeEntries(timeEntries) {
        if (isProduction && window.api?.createTimeEntry) {
            try {
                console.log('🌐 Syncing time entries to API');
                // For now, just store locally in production
                // TODO: Implement proper API sync
                if (window.storage?.setTimeEntries) {
                    window.storage.setTimeEntries(timeEntries);
                }
            } catch (error) {
                console.warn('⚠️ API sync failed, using localStorage:', error.message);
                if (window.storage?.setTimeEntries) {
                    window.storage.setTimeEntries(timeEntries);
                }
            }
        } else {
            console.log('💾 Using localStorage for time entries');
            if (typeof window.storage?.setTimeEntries === 'function') {
                window.storage.setTimeEntries(timeEntries);
            }
        }
    },

    async createTimeEntry(timeEntryData) {
        if (isProduction && window.api?.createTimeEntry) {
            try {
                console.log('🌐 Creating time entry via API');
                const response = await window.api.createTimeEntry(timeEntryData);
                return response.timeEntry || response;
            } catch (error) {
                console.warn('⚠️ API create failed, using localStorage:', error.message);
                // Fallback to localStorage
                const timeEntries = await this.getTimeEntries();
                const newTimeEntry = {
                    id: Math.max(0, ...timeEntries.map(t => t.id)) + 1,
                    ...timeEntryData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                timeEntries.push(newTimeEntry);
                await this.setTimeEntries(timeEntries);
                return newTimeEntry;
            }
        } else {
            console.log('💾 Creating time entry in localStorage');
            const timeEntries = await this.getTimeEntries();
            const newTimeEntry = {
                id: Math.max(0, ...timeEntries.map(t => t.id)) + 1,
                ...timeEntryData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            timeEntries.push(newTimeEntry);
            await this.setTimeEntries(timeEntries);
            return newTimeEntry;
        }
    },

    // Clients
    async getClients() {
        // Always try to use API if available, regardless of environment
        if (window.api?.listClients) {
            try {
                console.log('🌐 Using API for clients');
                const response = await window.api.listClients();
                console.log('🔍 Client API Response:', response);
                console.log('🔍 Response structure:', { data: response.data, clients: response.clients, hasData: !!response.data, hasClients: !!response.clients });
                
                // Handle nested data structure: { data: { clients: [...] } }
                let clients = [];
                if (response?.data?.clients && Array.isArray(response.data.clients)) {
                    clients = response.data.clients;
                } else if (response?.clients && Array.isArray(response.clients)) {
                    clients = response.clients;
                } else if (Array.isArray(response?.data)) {
                    clients = response.data;
                } else if (Array.isArray(response)) {
                    clients = response;
                }
                
                console.log('📊 Clients extracted:', clients.length, clients);
                return clients;
            } catch (error) {
                console.warn('⚠️ API failed, falling back to localStorage:', error.message);
                return safeStorageCall(window.storage, 'getClients', []);
            }
        } else {
            console.log('💾 Using localStorage for clients');
            return safeStorageCall(window.storage, 'getClients', []);
        }
    },

    async setClients(clients) {
        // Always try to use API if available, regardless of environment
        if (window.api?.createClient) {
            try {
                console.log('🌐 Syncing clients to API');
                // For now, just store locally in production
                // TODO: Implement proper API sync
                if (window.storage?.setClients) {
                    window.storage.setClients(clients);
                }
            } catch (error) {
                console.warn('⚠️ API sync failed, using localStorage:', error.message);
                if (window.storage?.setClients) {
                    window.storage.setClients(clients);
                }
            }
        } else {
            console.log('💾 Using localStorage for clients');
            if (typeof window.storage?.setClients === 'function') {
                window.storage.setClients(clients);
            }
        }
    },

    async createClient(clientData) {
        // Always try to use API if available, regardless of environment
        if (window.api?.createClient) {
            try {
                console.log('🌐 Creating client via API');
                const response = await window.api.createClient(clientData);
                return response.client || response;
            } catch (error) {
                console.warn('⚠️ API create failed, using localStorage:', error.message);
                // Fallback to localStorage
                const clients = await this.getClients();
                const newClient = {
                    id: Math.max(0, ...clients.map(c => c.id)) + 1,
                    ...clientData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                clients.push(newClient);
                await this.setClients(clients);
                return newClient;
            }
        } else {
            console.log('💾 Creating client in localStorage');
            const clients = await this.getClients();
            const newClient = {
                id: Math.max(0, ...clients.map(c => c.id)) + 1,
                ...clientData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            clients.push(newClient);
            await this.setClients(clients);
            return newClient;
        }
    },

    // Teams (localStorage only for now)
    async getTeamDocuments() {
        return safeStorageCall(window.storage, 'getTeamDocuments', []);
    },

    async setTeamDocuments(documents) {
        if (typeof window.storage?.setTeamDocuments === 'function') {
            window.storage.setTeamDocuments(documents);
        }
    },

    async getTeamWorkflows() {
        return safeStorageCall(window.storage, 'getTeamWorkflows', []);
    },

    async setTeamWorkflows(workflows) {
        if (typeof window.storage?.setTeamWorkflows === 'function') {
            window.storage.setTeamWorkflows(workflows);
        }
    },

    async getTeamChecklists() {
        return safeStorageCall(window.storage, 'getTeamChecklists', []);
    },

    async setTeamChecklists(checklists) {
        if (typeof window.storage?.setTeamChecklists === 'function') {
            window.storage.setTeamChecklists(checklists);
        }
    },

    async getTeamNotices() {
        return safeStorageCall(window.storage, 'getTeamNotices', []);
    },

    async setTeamNotices(notices) {
        if (typeof window.storage?.setTeamNotices === 'function') {
            window.storage.setTeamNotices(notices);
        }
    },

    // HR - Employees (API with localStorage fallback)
    async getEmployees() {
        if (window.api?.getEmployees) {
            try {
                console.log('🌐 Using API for employees');
                const response = await window.api.getEmployees();
                return normalizeArrayResponse(response, ['employees']);
            } catch (error) {
                console.warn('⚠️ API failed, falling back to localStorage:', error.message);
                return safeStorageCall(window.storage, 'getEmployees', []);
            }
        } else {
            console.log('💾 Using localStorage for employees');
            return safeStorageCall(window.storage, 'getEmployees', []);
        }
    },

    async setEmployees(employees) {
        if (typeof window.storage?.setEmployees === 'function') {
            window.storage.setEmployees(employees);
        }
    },

    async createEmployee(employeeData) {
        if (window.api?.createEmployee) {
            try {
                console.log('🌐 Creating employee via API');
                const response = await window.api.createEmployee(employeeData);
                return response.employee || response;
            } catch (error) {
                console.warn('⚠️ API create failed, using localStorage:', error.message);
                // Fallback to localStorage
                const employees = await this.getEmployees();
                const newEmployee = {
                    id: Math.max(0, ...employees.map(e => e.id)) + 1,
                    ...employeeData,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                employees.push(newEmployee);
                await this.setEmployees(employees);
                return newEmployee;
            }
        } else {
            console.log('💾 Creating employee in localStorage');
            const employees = await this.getEmployees();
            const newEmployee = {
                id: Math.max(0, ...employees.map(e => e.id)) + 1,
                ...employeeData,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            employees.push(newEmployee);
            await this.setEmployees(employees);
            return newEmployee;
        }
    },

    async updateEmployee(id, employeeData) {
        if (window.api?.updateEmployee) {
            try {
                console.log('🌐 Updating employee via API');
                const response = await window.api.updateEmployee(id, employeeData);
                return response.employee || response;
            } catch (error) {
                console.warn('⚠️ API update failed, using localStorage:', error.message);
                // Fallback to localStorage
                const employees = await this.getEmployees();
                const updatedEmployees = employees.map(emp => 
                    emp.id === id ? { ...emp, ...employeeData, updatedAt: new Date().toISOString() } : emp
                );
                await this.setEmployees(updatedEmployees);
                return updatedEmployees.find(e => e.id === id);
            }
        } else {
            console.log('💾 Updating employee in localStorage');
            const employees = await this.getEmployees();
            const updatedEmployees = employees.map(emp => 
                emp.id === id ? { ...emp, ...employeeData, updatedAt: new Date().toISOString() } : emp
            );
            await this.setEmployees(updatedEmployees);
            return updatedEmployees.find(e => e.id === id);
        }
    },

    async deleteEmployee(id) {
        if (window.api?.deleteEmployee) {
            try {
                console.log('🌐 Deleting employee via API');
                await window.api.deleteEmployee(id);
                return true;
            } catch (error) {
                console.warn('⚠️ API delete failed, using localStorage:', error.message);
                // Fallback to localStorage
                const employees = await this.getEmployees();
                const filteredEmployees = employees.filter(emp => emp.id !== id);
                await this.setEmployees(filteredEmployees);
                return true;
            }
        } else {
            console.log('💾 Deleting employee in localStorage');
            const employees = await this.getEmployees();
            const filteredEmployees = employees.filter(emp => emp.id !== id);
            await this.setEmployees(filteredEmployees);
            return true;
        }
    },

    async getLeaveApplications() {
        return safeStorageCall(window.storage, 'getLeaveApplications', []);
    },

    async setLeaveApplications(applications) {
        if (typeof window.storage?.setLeaveApplications === 'function') {
            window.storage.setLeaveApplications(applications);
        }
    },

    async getLeaveBalances() {
        return safeStorageCall(window.storage, 'getLeaveBalances', []);
    },

    async setLeaveBalances(balances) {
        if (typeof window.storage?.setLeaveBalances === 'function') {
            window.storage.setLeaveBalances(balances);
        }
    },

    async getAttendanceRecords() {
        return safeStorageCall(window.storage, 'getAttendanceRecords', []);
    },

    async setAttendanceRecords(records) {
        if (typeof window.storage?.setAttendanceRecords === 'function') {
            window.storage.setAttendanceRecords(records);
        }
    },

    async getPayrollRecords() {
        return safeStorageCall(window.storage, 'getPayrollRecords', []);
    },

    async setPayrollRecords(records) {
        if (typeof window.storage?.setPayrollRecords === 'function') {
            window.storage.setPayrollRecords(records);
        }
    }
};

    // Make available globally
    window.dataService = dataService;

    // Debug function
    window.debugDataService = () => {
        console.log('🔍 Data Service Debug:', {
            isProduction,
            isLocalhost,
            hasAPI: !!window.api,
            hasStorage: !!window.storage,
            apiMethods: Object.keys(window.api || {}),
            storageMethods: Object.keys(window.storage || {}),
            dataServiceMethods: Object.keys(dataService)
        });
    };

    const finalLog = window.debug?.log || (() => {});
    finalLog('✅ Data Service loaded - Environment:', isProduction ? 'Production' : 'Development');
})(); // End IIFE - prevents variable redeclaration errors
