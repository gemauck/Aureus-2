// Audit Trail System for ERP
// Tracks all user actions across the system

const AuditLogger = {
    // Log an action to the audit trail
    log: (action, module, details, user) => {
        const logEntry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            user: user?.name || 'System',
            userId: user?.id || 'system',
            userRole: user?.role || 'System',
            action: action, // 'create', 'update', 'delete', 'view', 'export', 'login', 'logout'
            module: module, // 'clients', 'projects', 'invoicing', 'users', 'time', 'manufacturing', 'tools'
            details: details, // Object with specific details
            ipAddress: 'N/A', // Browser doesn't have access to IP
            sessionId: getSessionId(),
            success: true
        };
        
        // Save to backend database (fire and forget)
        const token = window.storage?.getToken?.();
        if (token) {
            fetch('/api/audit-logs', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logEntry)
            }).catch(err => {
                console.warn('Failed to save audit log to backend:', err);
            });
        }
        
        // Also save to localStorage as backup
        const auditLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
        auditLogs.unshift(logEntry); // Add to beginning
        
        // Keep only last 1000 entries
        if (auditLogs.length > 1000) {
            auditLogs.splice(1000);
        }
        
        localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
        
        return logEntry;
    },
    
    // Log a failed action
    logError: (action, module, error, user) => {
        const logEntry = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            user: user?.name || 'System',
            userId: user?.id || 'system',
            userRole: user?.role || 'System',
            action: action,
            module: module,
            details: { error: error },
            sessionId: getSessionId(),
            success: false
        };
        
        // Save to backend database (fire and forget)
        const token = window.storage?.getToken?.();
        if (token) {
            fetch('/api/audit-logs', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(logEntry)
            }).catch(err => {
                console.warn('Failed to save audit log to backend:', err);
            });
        }
        
        // Also save to localStorage as backup
        const auditLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
        auditLogs.unshift(logEntry);
        
        if (auditLogs.length > 1000) {
            auditLogs.splice(1000);
        }
        
        localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
        
        return logEntry;
    },
    
    // Migrate localStorage logs to backend
    migrateLocalStorageLogs: async () => {
        // Prevent multiple migrations from running simultaneously
        if (window._auditLogMigrationInProgress) {
            console.log('⏸️ Audit log migration already in progress, skipping...');
            return { migrated: 0, failed: 0, total: 0, skipped: true };
        }
        
        // Check if migration was already completed in this session
        const migrationKey = 'audit_log_migration_completed';
        if (sessionStorage.getItem(migrationKey)) {
            return { migrated: 0, failed: 0, total: 0, skipped: true };
        }
        
        try {
            window._auditLogMigrationInProgress = true;
            
            const localLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
            if (localLogs.length === 0) {
                sessionStorage.setItem(migrationKey, 'true');
                return { migrated: 0, total: 0 };
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No auth token available, cannot migrate logs');
                return { migrated: 0, total: localLogs.length };
            }
            
            console.log(`🔄 Migrating ${localLogs.length} logs from localStorage to backend (rate-limited)...`);
            
            let migrated = 0;
            let failed = 0;
            let rateLimited = false;
            // Reduce batch size to 20 and process slowly to avoid rate limits
            const BATCH_SIZE = 20;
            const DELAY_BETWEEN_REQUESTS = 1000; // 1 second between requests
            const DELAY_AFTER_429 = 10000; // 10 seconds after rate limit
            
            const logsToMigrate = localLogs.slice(0, BATCH_SIZE);
            
            // Migrate logs with aggressive rate limiting to avoid 429 errors
            for (let i = 0; i < logsToMigrate.length; i++) {
                const log = logsToMigrate[i];
                
                // Skip if we hit rate limit - don't retry immediately
                if (rateLimited) {
                    console.log(`⏸️ Rate limit detected, stopping migration. Will resume on next page load.`);
                    break;
                }
                
                try {
                    const response = await fetch('/api/audit-logs', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(log)
                    });
                    
                    if (response.ok) {
                        migrated++;
                        // Remove migrated log from localStorage
                        const remainingLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
                        const index = remainingLogs.findIndex(l => l.id === log.id);
                        if (index !== -1) {
                            remainingLogs.splice(index, 1);
                            localStorage.setItem('auditLogs', JSON.stringify(remainingLogs));
                        }
                        
                        // Log progress every 5 logs
                        if (migrated % 5 === 0) {
                            console.log(`📊 Migration progress: ${migrated}/${logsToMigrate.length} migrated`);
                        }
                    } else if (response.status === 429) {
                        // Rate limited - stop migration and mark for later
                        rateLimited = true;
                        const retryAfter = response.headers.get('Retry-After') || '10';
                        const waitTime = parseInt(retryAfter) * 1000;
                        console.warn(`⏳ Rate limited (429). Stopping migration. Will resume on next page load.`);
                        // Don't retry immediately - let it resume on next page load
                        failed++;
                        break;
                    } else {
                        // For other errors, log but continue (don't spam console)
                        if (failed < 3) { // Only log first 3 errors
                            const errorText = await response.text().catch(() => 'Unknown error');
                            console.warn('⚠️ Failed to migrate log:', log.id, response.status, errorText.substring(0, 50));
                        }
                        failed++;
                    }
                    
                    // Add delay between requests to avoid rate limiting (1 second)
                    if (i < logsToMigrate.length - 1 && !rateLimited) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
                    }
                } catch (err) {
                    // Only log first few errors to avoid spam
                    if (failed < 3) {
                        console.warn('⚠️ Failed to migrate log:', log.id, err.message);
                    }
                    failed++;
                    // Add delay even on error
                    if (i < logsToMigrate.length - 1 && !rateLimited) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS));
                    }
                }
            }
            
            // Mark migration as completed for this session if we finished the batch
            if (!rateLimited && migrated + failed >= logsToMigrate.length) {
                sessionStorage.setItem(migrationKey, 'true');
            }
            
            if (migrated > 0 || failed > 0) {
                console.log(`✅ Migration batch complete: ${migrated} migrated, ${failed} failed${rateLimited ? ' (rate limited)' : ''}`);
            }
            
            return { migrated, failed, total: localLogs.length, rateLimited };
        } catch (error) {
            console.error('❌ Error migrating logs:', error);
            return { migrated: 0, failed: 0, total: 0, error: error.message };
        } finally {
            window._auditLogMigrationInProgress = false;
        }
    },
    
    _buildAuditQueryParams: (options = {}) => {
        const params = new URLSearchParams();
        if (options.email) params.set('email', options.email);
        if (options.module) params.set('module', options.module);
        if (options.action) params.set('action', options.action);
        if (options.startDate) params.set('startDate', options.startDate);
        if (options.endDate) params.set('endDate', options.endDate);
        if (options.userId) params.set('userId', options.userId);
        if (options.limit) params.set('limit', String(options.limit));
        if (options.offset) params.set('offset', String(options.offset));
        if (options.stats) params.set('stats', '1');
        return params;
    },

    _fetchFromBackend: async (options = {}) => {
        const token = window.storage?.getToken?.();
        if (!token) return null;
        const params = AuditLogger._buildAuditQueryParams(options);
        const query = params.toString();
        const url = query ? `/api/audit-logs?${query}` : '/api/audit-logs';
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch audit logs (${response.status}): ${errorText}`);
        }
        const responseData = await response.json();
        const data = responseData.data || responseData;
        return {
            logs: data.logs || [],
            total: typeof data.total === 'number' ? data.total : (data.logs?.length || 0),
            limit: data.limit,
            offset: data.offset,
            truncated: Boolean(data.truncated),
            stats: data.stats || null
        };
    },

    // Get audit logs (backend with filters, or localStorage fallback).
    // options: email, module, action, startDate, endDate, limit, stats
    // Returns { logs, total, stats, truncated, limit, offset } or legacy array when raw: true
    getAll: async (options = {}) => {
        const wantRawArray = options.raw === true;
        try {
            let payload = await AuditLogger._fetchFromBackend(options);
            if (payload && payload.logs.length === 0 && !options.email && !options.module && !options.action && !options.startDate) {
                const migrationAttemptedKey = 'audit_log_migration_attempted';
                if (!sessionStorage.getItem(migrationAttemptedKey)) {
                    const localLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
                    if (localLogs.length > 0) {
                        sessionStorage.setItem(migrationAttemptedKey, 'true');
                        const migrationResult = await AuditLogger.migrateLocalStorageLogs();
                        if (migrationResult?.migrated > 0) {
                            payload = await AuditLogger._fetchFromBackend(options);
                        }
                    }
                }
            }
            if (payload) {
                if (wantRawArray) return payload.logs;
                return payload;
            }
        } catch (error) {
            console.error('❌ Error fetching audit logs from backend, using localStorage:', error);
        }

        const localLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
        const filtered = AuditLogger._filterLocalLogs(localLogs, options);
        const fallback = {
            logs: filtered,
            total: filtered.length,
            truncated: false,
            stats: null,
            limit: filtered.length,
            offset: 0
        };
        return wantRawArray ? fallback.logs : fallback;
    },

    _filterLocalLogs: (logs, options = {}) => {
        let filtered = [...logs];
        if (options.module) {
            filtered = filtered.filter((log) => log.module === options.module);
        }
        if (options.action) {
            filtered = filtered.filter((log) => log.action === options.action);
        }
        if (options.startDate) {
            const start = new Date(options.startDate);
            filtered = filtered.filter((log) => new Date(log.timestamp) >= start);
        }
        if (options.endDate) {
            const end = new Date(options.endDate);
            filtered = filtered.filter((log) => new Date(log.timestamp) <= end);
        }
        if (options.email) {
            const emailLower = options.email.toLowerCase();
            filtered = filtered.filter((log) => {
                const logEmail = (log.userEmail || log.details?.email || '').toLowerCase();
                return logEmail && logEmail.includes(emailLower);
            });
        }
        return filtered;
    },
    
    // Get logs by date range
    getByDateRange: (startDate, endDate) => {
        const logs = AuditLogger.getAll();
        return logs.filter(log => {
            const logDate = new Date(log.timestamp);
            return logDate >= startDate && logDate <= endDate;
        });
    },
    
    // Get logs by user
    getByUser: (userId) => {
        const logs = AuditLogger.getAll();
        return logs.filter(log => log.userId === userId);
    },
    
    // Get logs by module
    getByModule: (module) => {
        const logs = AuditLogger.getAll();
        return logs.filter(log => log.module === module);
    },
    
    // Get logs by action
    getByAction: (action) => {
        const logs = AuditLogger.getAll();
        return logs.filter(log => log.action === action);
    },
    
    // Search logs
    search: (searchTerm) => {
        const logs = AuditLogger.getAll();
        const term = searchTerm.toLowerCase();
        return logs.filter(log => 
            log.user.toLowerCase().includes(term) ||
            log.action.toLowerCase().includes(term) ||
            log.module.toLowerCase().includes(term) ||
            JSON.stringify(log.details).toLowerCase().includes(term)
        );
    },
    
    // Clear all logs (admin only)
    clearAll: () => {
        localStorage.setItem('auditLogs', '[]');
    },
    
    // Export logs to CSV
    exportToCSV: (logs) => {
        const headers = ['Log ID', 'Timestamp', 'User', 'Email', 'Role', 'Action', 'Module', 'Entity ID', 'Details (JSON)', 'IP Address', 'Session ID', 'Success'];
        const rows = logs.map(log => [
            log.id || '',
            new Date(log.timestamp).toLocaleString('en-ZA'),
            log.user,
            log.userEmail || '',
            log.userRole,
            log.action,
            log.module,
            log.entityId || '',
            JSON.stringify(log.details),
            log.ipAddress || 'N/A',
            log.sessionId || 'N/A',
            log.success ? 'Yes' : 'No'
        ]);
        
        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
        
        return csvContent;
    },
    
    // Initialize with sample logs if empty (for demo)
    initializeSampleLogs: () => {
        const existingLogs = AuditLogger.getAll();
        if (existingLogs.length === 0) {
            const now = Date.now();
            const sampleLogs = [
                {
                    id: `audit_${now - 300000}_sample1`,
                    timestamp: new Date(now - 300000).toISOString(),
                    user: 'System',
                    userId: 'system',
                    userRole: 'System',
                    action: 'create',
                    module: 'leave-platform',
                    details: { action: 'System initialized', message: 'Leave management data loaded' },
                    sessionId: getSessionId(),
                    success: true
                },
                {
                    id: `audit_${now - 240000}_sample2`,
                    timestamp: new Date(now - 240000).toISOString(),
                    user: 'System',
                    userId: 'system',
                    userRole: 'System',
                    action: 'create',
                    module: 'projects',
                    details: { action: 'System initialized', message: 'Project data loaded' },
                    sessionId: getSessionId(),
                    success: true
                },
                {
                    id: `audit_${now - 180000}_sample3`,
                    timestamp: new Date(now - 180000).toISOString(),
                    user: 'System',
                    userId: 'system',
                    userRole: 'System',
                    action: 'view',
                    module: 'dashboard',
                    details: { action: 'Dashboard accessed', page: 'main' },
                    sessionId: getSessionId(),
                    success: true
                }
            ];
            
            localStorage.setItem('auditLogs', JSON.stringify(sampleLogs));
        }
    }
};

// Helper function to get or create session ID
const getSessionId = () => {
    let sessionId = sessionStorage.getItem('sessionId');
    if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
};

// Make available globally
window.AuditLogger = AuditLogger;
