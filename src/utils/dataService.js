// API-Only Data Service - Always uses database API, no localStorage fallback
// Wrap entire file in IIFE to prevent variable redeclaration when Babel transforms multiple times
(() => {
    // Get environment from window (set by debug.js) or determine locally
    // Access via window to avoid variable redeclaration when Babel transforms multiple scripts
    function getIsProduction() {
        if (typeof window.isProduction !== 'undefined') {
            return window.isProduction;
        }
        const hostname = window.location.hostname;
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
        return !isLocal && window.location.protocol === 'https:';
    }
    
    function getIsLocalhost() {
        if (typeof window.isLocalhost !== 'undefined') {
            return window.isLocalhost;
        }
        const hostname = window.location.hostname;
        return hostname === 'localhost' || hostname === '127.0.0.1';
    }

    const log = window.debug?.log || (() => {});
    log('🔍 Environment Detection:', { 
        isProduction: getIsProduction(), 
        isLocalhost: getIsLocalhost(), 
        hostname: window.location.hostname 
    });
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
        if (typeof fn !== 'function') {
            return fallback;
        }
        const result = fn.call(obj);
        // Ensure we always return an array, never null or undefined
        return Array.isArray(result) ? result : fallback;
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
            const response = await window.api.createProject(projectData);
            return response.project || response;
        } catch (error) {
            console.error('❌ API create failed:', error.message);
            throw new Error(`Failed to create project via API: ${error.message}`);
        }
    },

    // Time Entries
    async getTimeEntries() {
        if (getIsProduction() && window.api?.listTimeEntries) {
            try {
                const response = await window.api.listTimeEntries();
                return normalizeArrayResponse(response, ['timeEntries']);
            } catch (error) {
                console.warn('⚠️ API failed, falling back to localStorage:', error.message);
                return safeStorageCall(window.storage, 'getTimeEntries', []);
            }
        } else {
            return safeStorageCall(window.storage, 'getTimeEntries', []);
        }
    },

    async setTimeEntries(timeEntries) {
        if (getIsProduction() && window.api?.createTimeEntry) {
            try {
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
            if (typeof window.storage?.setTimeEntries === 'function') {
                window.storage.setTimeEntries(timeEntries);
            }
        }
    },

    async createTimeEntry(timeEntryData) {
        if (getIsProduction() && window.api?.createTimeEntry) {
            try {
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

    // Users
    async getUsers() {
        const extractUsers = (response) => {
            if (!response) return [];
            if (Array.isArray(response?.data?.users)) return response.data.users;
            if (Array.isArray(response?.data?.data?.users)) return response.data.data.users;
            if (Array.isArray(response?.users)) return response.users;
            if (Array.isArray(response?.data)) return response.data;
            if (Array.isArray(response)) return response;
            return [];
        };

        const cacheUsers = (users) => {
            if (!Array.isArray(users)) return;
            if (typeof window.storage?.setUsers === 'function') {
                try {
                    window.storage.setUsers(users);
                } catch (cacheError) {
                    console.warn('⚠️ Failed to cache users to storage:', cacheError.message);
                }
            }
        };

        const sources = [
            {
                label: 'DatabaseAPI',
                fetch: window.DatabaseAPI?.getUsers?.bind(window.DatabaseAPI)
            },
            {
                label: 'API',
                fetch: window.api?.getUsers?.bind(window.api)
            }
        ];

        for (const source of sources) {
            if (typeof source.fetch !== 'function') continue;

            try {
                const response = await source.fetch();
                const users = extractUsers(response);
                cacheUsers(users);
                if (Array.isArray(users)) {
                    return users;
                }
            } catch (error) {
                console.warn(`⚠️ ${source.label} failed for users, continuing:`, error.message);
            }
        }

        return safeStorageCall(window.storage, 'getUsers', []);
    },

    async setUsers(users) {
        if (typeof window.storage?.setUsers === 'function') {
            try {
                window.storage.setUsers(users);
            } catch (error) {
                console.warn('⚠️ Failed to save users to storage:', error.message);
            }
        }
    },

    // Clients
    async getClients() {
        // Always try to use API if available, regardless of environment
        if (window.api?.listClients) {
            try {
                const response = await window.api.listClients();
                
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
                
                return clients;
            } catch (error) {
                console.warn('⚠️ API failed, falling back to localStorage:', error.message);
                return safeStorageCall(window.storage, 'getClients', []);
            }
        } else {
            return safeStorageCall(window.storage, 'getClients', []);
        }
    },

    async setClients(clients) {
        // Always try to use API if available, regardless of environment
        if (window.api?.createClient) {
            try {
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
            if (typeof window.storage?.setClients === 'function') {
                window.storage.setClients(clients);
            }
        }
    },

    async createClient(clientData) {
        // Always try to use API if available, regardless of environment
        if (window.api?.createClient) {
            try {
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

    async getTeamNotices(teamId = null) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) {
                console.warn('getTeamNotices: No auth token available');
                return [];
            }

            const url = teamId ? `/api/teams/notices?teamId=${teamId}` : '/api/teams/notices';
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch team notices: ${response.status}`);
            }

            const data = await response.json();
            return data.data?.notices || [];
        } catch (error) {
            console.error('Error fetching team notices from API:', error);
            // Fallback to empty array on error
            return [];
        }
    },

    async setTeamNotices(notice) {
        // Handle both single notice object and array (for backward compatibility during migration)
        if (Array.isArray(notice)) {
            console.warn('setTeamNotices: Array passed, but API expects single notice. Please update calling code.');
            // For now, just create/update the first notice if array is passed
            if (notice.length === 0) return null;
            notice = notice[notice.length - 1]; // Use last notice in array
        }

        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) {
                throw new Error('No auth token available');
            }

            const url = notice.id ? `/api/teams/notices/${notice.id}` : '/api/teams/notices';
            const method = notice.id ? 'PUT' : 'POST';

            // Ensure teamId is set (support both team and teamId for backward compatibility)
            const noticeData = {
                ...notice,
                teamId: notice.teamId || notice.team
            };

            if (!noticeData.teamId) {
                throw new Error('teamId is required');
            }

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(noticeData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to ${notice.id ? 'update' : 'create'} team notice: ${response.status}`);
            }

            const data = await response.json();
            return data.data?.notice || notice;
        } catch (error) {
            console.error(`Error ${notice.id ? 'updating' : 'creating'} team notice:`, error);
            throw error;
        }
    },

    async deleteTeamNotice(noticeId) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) {
                throw new Error('No auth token available');
            }

            const response = await fetch(`/api/teams/notices/${noticeId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to delete team notice: ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting team notice:', error);
            throw error;
        }
    },

    // Discussions (API-only)
    async getTeamDiscussions(teamId, params = {}) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) return [];
            const q = new URLSearchParams({ teamId: teamId || '' });
            if (params.type) q.set('type', params.type);
            if (params.pinned !== undefined) q.set('pinned', String(params.pinned));
            const response = await fetch(`/api/teams/discussions?${q}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`Failed to fetch discussions: ${response.status}`);
            const data = await response.json();
            return data.data?.discussions || [];
        } catch (e) {
            console.error('getTeamDiscussions:', e);
            return [];
        }
    },

    async getDiscussion(discussionId) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) return null;
            const response = await fetch(`/api/teams/discussions/${discussionId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                const msg = data?.error?.message || data?.error || `Failed to fetch discussion: ${response.status}`;
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            return data.data?.discussion ?? null;
        } catch (e) {
            console.error('getDiscussion:', e);
            throw e;
        }
    },

    async createDiscussion(payload) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch('/api/teams/discussions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Create discussion failed: ${response.status}`);
        }
        const data = await response.json();
        return data.data?.discussion;
    },

    async updateDiscussion(id, payload) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Update discussion failed: ${response.status}`);
        }
        const data = await response.json();
        return data.data?.discussion;
    },

    async deleteDiscussion(id) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Delete discussion failed: ${response.status}`);
        return true;
    },

    async getDiscussionReplies(discussionId) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) return [];
            const response = await fetch(`/api/teams/discussions/${discussionId}/replies`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.data?.replies || [];
        } catch (e) {
            console.error('getDiscussionReplies:', e);
            return [];
        }
    },

    async addDiscussionReply(discussionId, body, authorId, authorName, attachments = []) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${discussionId}/replies`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ body, authorId, authorName, attachments: Array.isArray(attachments) ? attachments : [] })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Add reply failed: ${response.status}`);
        }
        const data = await response.json();
        return data.data?.reply;
    },

    async updateDiscussionReply(discussionId, replyId, body) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${discussionId}/replies/${replyId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ body })
        });
        if (!response.ok) throw new Error(`Update reply failed: ${response.status}`);
        const data = await response.json();
        return data.data?.reply;
    },

    async deleteDiscussionReply(discussionId, replyId) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${discussionId}/replies/${replyId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Delete reply failed: ${response.status}`);
        return true;
    },

    async getDiscussionChecklists(discussionId) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) return [];
            const response = await fetch(`/api/teams/discussions/${discussionId}/checklists`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.data?.checklists || [];
        } catch (e) {
            console.error('getDiscussionChecklists:', e);
            return [];
        }
    },

    async addDiscussionChecklist(discussionId, payload) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${discussionId}/checklists`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Add checklist failed: ${response.status}`);
        const data = await response.json();
        return data.data?.checklist;
    },

    async updateDiscussionChecklist(discussionId, checklistId, payload) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${discussionId}/checklists/${checklistId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Update checklist failed: ${response.status}`);
        const data = await response.json();
        return data.data?.checklist;
    },

    async deleteDiscussionChecklist(discussionId, checklistId) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/discussions/${discussionId}/checklists/${checklistId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Delete checklist failed: ${response.status}`);
        return true;
    },

    async getTeamTasksForTeam(teamId, discussionId = null) {
        try {
            const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
            if (!token) return [];
            const q = new URLSearchParams({ teamId: teamId || '' });
            if (discussionId) q.set('discussionId', discussionId);
            const response = await fetch(`/api/teams/tasks?${q}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.data?.tasks || [];
        } catch (e) {
            console.error('getTeamTasksForTeam:', e);
            return [];
        }
    },

    async createTeamTask(payload) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch('/api/teams/tasks', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Create task failed: ${response.status}`);
        }
        const data = await response.json();
        return data.data?.task;
    },

    async updateTeamTask(taskId, payload) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`Update task failed: ${response.status}`);
        const data = await response.json();
        return data.data?.task;
    },

    async deleteTeamTask(taskId) {
        const token = window.storage?.getToken?.() || localStorage.getItem('abcotronics_token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token');
        if (!token) throw new Error('No auth token');
        const response = await fetch(`/api/teams/tasks/${taskId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (!response.ok) throw new Error(`Delete task failed: ${response.status}`);
        return true;
    },

    async getManagementMeetingNotes() {
        return safeStorageCall(window.storage, 'getManagementMeetingNotes', []);
    },

    async setManagementMeetingNotes(notes) {
        if (typeof window.storage?.setManagementMeetingNotes === 'function') {
            window.storage.setManagementMeetingNotes(notes);
        }
    },

    async getTeamTasks() {
        return safeStorageCall(window.storage, 'getTeamTasks', []);
    },

    async setTeamTasks(tasks) {
        if (typeof window.storage?.setTeamTasks === 'function') {
            window.storage.setTeamTasks(tasks);
        }
    },

    // Job Cards (localStorage)
    async getJobCards() {
        return safeStorageCall(window.storage, 'getJobCards', []);
    },

    async setJobCards(jobCards) {
        if (typeof window.storage?.setJobCards === 'function') {
            window.storage.setJobCards(jobCards);
        }
    },

    // HR - Employees (API with localStorage fallback)
    async getEmployees() {
        if (window.api?.getEmployees) {
            try {
                const response = await window.api.getEmployees();
                return normalizeArrayResponse(response, ['employees']);
            } catch (error) {
                console.warn('⚠️ API failed, falling back to localStorage:', error.message);
                return safeStorageCall(window.storage, 'getEmployees', []);
            }
        } else {
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
    };

    const finalLog = window.debug?.log || (() => {});
    finalLog('✅ Data Service loaded - Environment:', getIsProduction() ? 'Production' : 'Development');
})(); // End IIFE - prevents variable redeclaration errors
