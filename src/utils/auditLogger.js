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
        try {
            const localLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
            if (localLogs.length === 0) {
                return { migrated: 0, total: 0 };
            }
            
            const token = window.storage?.getToken?.();
            if (!token) {
                console.warn('⚠️ No auth token available, cannot migrate logs');
                return { migrated: 0, total: localLogs.length };
            }
            
            console.log(`🔄 Migrating ${localLogs.length} logs from localStorage to backend...`);
            
            let migrated = 0;
            let failed = 0;
            const logsToMigrate = localLogs.slice(0, 100); // Limit to 100 to avoid overwhelming the server
            
            // Migrate logs with rate limiting to avoid 429 errors
            for (let i = 0; i < logsToMigrate.length; i++) {
                const log = logsToMigrate[i];
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
                        // Log progress every 10 logs
                        if (migrated % 10 === 0) {
                            console.log(`📊 Migration progress: ${migrated}/${logsToMigrate.length} migrated`);
                        }
                    } else if (response.status === 429) {
                        // Rate limited - wait and retry
                        const retryAfter = response.headers.get('Retry-After') || '5';
                        const waitTime = parseInt(retryAfter) * 1000;
                        console.warn(`⏳ Rate limited. Waiting ${waitTime/1000}s before retrying...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        // Retry this log
                        i--;
                        continue;
                    } else {
                        const errorText = await response.text();
                        console.warn('⚠️ Failed to migrate log:', log.id, response.status, errorText);
                        failed++;
                    }
                    
                    // Add small delay between requests to avoid rate limiting (50ms)
                    if (i < logsToMigrate.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                } catch (err) {
                    console.warn('⚠️ Failed to migrate log:', log.id, err);
                    failed++;
                    // Add delay even on error to avoid overwhelming
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            
            console.log(`✅ Migration complete: ${migrated} migrated, ${failed} failed`);
            return { migrated, failed, total: localLogs.length };
        } catch (error) {
            console.error('❌ Error migrating logs:', error);
            return { migrated: 0, failed: 0, total: 0, error: error.message };
        }
    },
    
    // Get all audit logs (from backend if available, otherwise from localStorage)
    getAll: async () => {
        try {
            const token = window.storage?.getToken?.();
            if (token) {
                const response = await fetch('/api/audit-logs', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const logCount = data.logs?.length || 0;
                    console.log('✅ Fetched audit logs from backend:', logCount, 'logs');
                    
                    // If no logs in backend but we have localStorage logs, try to migrate
                    if (logCount === 0) {
                        const localLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
                        if (localLogs.length > 0) {
                            console.log('🔄 No backend logs found, but localStorage has logs. Migrating...');
                            // Migrate and wait for completion, then re-fetch
                            const migrationResult = await AuditLogger.migrateLocalStorageLogs();
                            if (migrationResult && migrationResult.migrated > 0) {
                                console.log(`✅ Migrated ${migrationResult.migrated} logs, re-fetching from backend...`);
                                // Re-fetch after migration
                                const retryResponse = await fetch('/api/audit-logs', {
                                    method: 'GET',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    }
                                });
                                if (retryResponse.ok) {
                                    const retryData = await retryResponse.json();
                                    const retryLogCount = retryData.logs?.length || 0;
                                    console.log('✅ Re-fetched audit logs from backend after migration:', retryLogCount, 'logs');
                                    return retryData.logs || [];
                                }
                            }
                        }
                    }
                    
                    return data.logs || [];
                } else {
                    const errorText = await response.text();
                    console.error('❌ Failed to fetch audit logs:', response.status, errorText);
                    console.error('❌ Response headers:', Object.fromEntries(response.headers.entries()));
                }
            } else {
                console.warn('⚠️ No auth token available, using localStorage');
            }
        } catch (error) {
            console.error('❌ Error fetching audit logs from backend, using localStorage:', error);
            console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
        }
        
        // Fallback to localStorage
        const localLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
        console.log('📦 Using localStorage logs:', localLogs.length, 'logs');
        return localLogs;
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
        const headers = ['Timestamp', 'User', 'Role', 'Action', 'Module', 'Details', 'Success'];
        const rows = logs.map(log => [
            new Date(log.timestamp).toLocaleString('en-ZA'),
            log.user,
            log.userRole,
            log.action,
            log.module,
            JSON.stringify(log.details),
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
