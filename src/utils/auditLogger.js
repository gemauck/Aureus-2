// Audit Trail System for ERP
// Tracks all user actions across the system

const AuditLogger = {
    // Log an action to the audit trail
    log: (action, module, details, user) => {
        const auditLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
        
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
        const auditLogs = JSON.parse(localStorage.getItem('auditLogs') || '[]');
        
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
        
        auditLogs.unshift(logEntry);
        
        if (auditLogs.length > 1000) {
            auditLogs.splice(1000);
        }
        
        localStorage.setItem('auditLogs', JSON.stringify(auditLogs));
        
        return logEntry;
    },
    
    // Get all audit logs
    getAll: () => {
        return JSON.parse(localStorage.getItem('auditLogs') || '[]');
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
