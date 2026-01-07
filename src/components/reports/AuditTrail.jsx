// Use React from window
const { useState, useEffect } = React;

const AuditTrail = () => {
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModule, setFilterModule] = useState('all');
    const [filterAction, setFilterAction] = useState('all');
    const [filterUser, setFilterUser] = useState('all');
    const [dateRange, setDateRange] = useState('7'); // days
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const logsPerPage = 50;

    const AuditLogger = window.AuditLogger;
    
    // Get current user info - try multiple methods
    const getCurrentUser = () => {
        try {
            // Method 1: Try storage.getUser() (most reliable)
            if (window.storage && window.storage.getUser) {
                const user = window.storage.getUser();
                if (user && (user.id || user.email)) {
                    return user;
                }
            }
            
            // Method 2: Try localStorage directly
            const userData = localStorage.getItem('abcotronics_user');
            if (userData && userData !== 'null' && userData !== 'undefined') {
                const parsed = JSON.parse(userData);
                const user = parsed.user || parsed.data?.user || parsed;
                if (user && (user.id || user.email)) {
                    return user;
                }
            }
            
            // Method 3: Try currentUser from localStorage (legacy)
            const currentUserData = localStorage.getItem('currentUser');
            if (currentUserData && currentUserData !== 'null' && currentUserData !== 'undefined') {
                const parsed = JSON.parse(currentUserData);
                if (parsed && (parsed.id || parsed.email || parsed.username)) {
                    return {
                        id: parsed.id || parsed.email || parsed.username,
                        name: parsed.name || parsed.username || 'System',
                        email: parsed.email || 'system',
                        role: parsed.role || 'System'
                    };
                }
            }
            
            // Fallback
            return { id: 'system', name: 'System', role: 'System' };
        } catch (e) {
            console.error('Error getting current user:', e);
            return { id: 'system', name: 'System', role: 'System' };
        }
    };
    
    // Check if current user is admin
    const isAdmin = () => {
        const user = getCurrentUser();
        return user?.role?.toLowerCase() === 'admin';
    };

    // Load logs
    useEffect(() => {
        loadLogs();
    }, []);

    // Apply filters whenever they change
    useEffect(() => {
        applyFilters();
    }, [logs, searchTerm, filterModule, filterAction, filterUser, dateRange]);

    const loadLogs = async () => {
        if (!AuditLogger || typeof AuditLogger.getAll !== 'function') {
            console.error('AuditLogger.getAll not available');
            setLogs([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const allLogs = await AuditLogger.getAll();
            setLogs(allLogs || []);
        } catch (error) {
            console.error('Error loading audit logs:', error);
            setLogs([]);
        } finally {
            setIsLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...logs];
        
        const currentUser = getCurrentUser();
        const userIsAdmin = isAdmin();

        // Role-based filtering: Admin users see all activity, non-admin users see only their own
        if (!userIsAdmin && currentUser && currentUser.id && currentUser.id !== 'system') {
            // Non-admin users only see their own activity
            filtered = filtered.filter(log => {
                // Skip system logs for non-admin users (unless they're the system user)
                if (log.userId === 'system' || log.user === 'System') {
                    return false;
                }
                
                // Match by userId if available
                if (log.userId) {
                    return log.userId === currentUser.id || 
                           log.userId === currentUser._id || 
                           log.userId === currentUser.email;
                }
                
                // Fallback: match by user name or email
                const logUser = (log.user || '').toLowerCase().trim();
                const currentUserName = (currentUser.name || '').toLowerCase().trim();
                const currentUserEmail = (currentUser.email || '').toLowerCase().trim();
                
                return (logUser && (logUser === currentUserName || logUser === currentUserEmail));
            });
        }
        // Admin users see all logs (no filtering by user)

        // Date range filter
        if (dateRange !== 'all') {
            const days = parseInt(dateRange);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            filtered = filtered.filter(log => new Date(log.timestamp) >= cutoffDate);
        }

        // Module filter
        if (filterModule !== 'all') {
            filtered = filtered.filter(log => log.module === filterModule);
        }

        // Action filter
        if (filterAction !== 'all') {
            filtered = filtered.filter(log => log.action === filterAction);
        }

        // User filter (only applies if admin, or if filtering own logs)
        if (filterUser !== 'all') {
            filtered = filtered.filter(log => log.userId === filterUser);
        }

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                log.user.toLowerCase().includes(term) ||
                log.action.toLowerCase().includes(term) ||
                log.module.toLowerCase().includes(term) ||
                JSON.stringify(log.details).toLowerCase().includes(term)
            );
        }

        setFilteredLogs(filtered);
        setCurrentPage(1);
    };

    const exportToCSV = () => {
        if (!AuditLogger) {
            console.error('AuditLogger not available');
            return;
        }
        
        const csvContent = AuditLogger.exportToCSV(filteredLogs);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit_trail_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Log the export action
        const user = getCurrentUser();
        if (AuditLogger && typeof AuditLogger.log === 'function') {
            AuditLogger.log('export', 'reports', {
                reportType: 'audit_trail',
                recordCount: filteredLogs.length
            }, user);
        }
    };

    const exportToExcel = () => {
        // Create Excel-compatible format
        const headers = ['Timestamp', 'User', 'Role', 'Action', 'Module', 'Details', 'Success', 'Session ID'];
        const rows = filteredLogs.map(log => [
            new Date(log.timestamp).toLocaleString('en-ZA'),
            log.user,
            log.userRole,
            log.action,
            log.module,
            JSON.stringify(log.details),
            log.success ? 'Yes' : 'No',
            log.sessionId
        ]);

        let excelContent = '<html xmlns:x="urn:schemas-microsoft-com:office:excel">';
        excelContent += '<head><meta charset="UTF-8"><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
        excelContent += '<x:Name>Audit Trail</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>';
        excelContent += '</x:ExcelWorksheets></x:ExcelWorkbook></xml></head><body>';
        excelContent += '<table border="1"><thead><tr>';
        
        headers.forEach(header => {
            excelContent += `<th>${header}</th>`;
        });
        excelContent += '</tr></thead><tbody>';
        
        rows.forEach(row => {
            excelContent += '<tr>';
            row.forEach(cell => {
                excelContent += `<td>${cell}</td>`;
            });
            excelContent += '</tr>';
        });
        
        excelContent += '</tbody></table></body></html>';

        const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit_trail_${new Date().toISOString().split('T')[0]}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // Log the export action
        const user = getCurrentUser();
        if (AuditLogger && typeof AuditLogger.log === 'function') {
            AuditLogger.log('export', 'reports', {
                reportType: 'audit_trail',
                format: 'excel',
                recordCount: filteredLogs.length
            }, user);
        }
    };

    // Get unique values for filters
    const modules = [...new Set(logs.map(log => log.module))];
    const actions = [...new Set(logs.map(log => log.action))];
    const users = [...new Set(logs.map(log => ({ id: log.userId, name: log.user })))];

    // Pagination
    const indexOfLastLog = currentPage * logsPerPage;
    const indexOfFirstLog = indexOfLastLog - logsPerPage;
    const currentLogs = filteredLogs.slice(indexOfFirstLog, indexOfLastLog);
    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

    const getActionColor = (action) => {
        switch(action) {
            case 'create': return 'text-green-600 bg-green-50';
            case 'update': return 'text-blue-600 bg-blue-50';
            case 'delete': return 'text-red-600 bg-red-50';
            case 'view': return 'text-gray-600 bg-gray-50';
            case 'export': return 'text-purple-600 bg-purple-50';
            case 'login': return 'text-teal-600 bg-teal-50';
            case 'logout': return 'text-orange-600 bg-orange-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const getActionIcon = (action) => {
        switch(action) {
            case 'create': return 'fa-plus-circle';
            case 'update': return 'fa-edit';
            case 'delete': return 'fa-trash';
            case 'view': return 'fa-eye';
            case 'export': return 'fa-file-export';
            case 'login': return 'fa-sign-in-alt';
            case 'logout': return 'fa-sign-out-alt';
            default: return 'fa-circle';
        }
    };

    const userIsAdmin = isAdmin();
    const currentUser = getCurrentUser();

    return (
        <div className="space-y-3">
            {/* View Mode Indicator */}
            {userIsAdmin ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
                    <i className="fas fa-shield-alt text-blue-600"></i>
                    <p className="text-xs text-blue-800 font-medium">
                        Admin View: Showing all activity for all users
                    </p>
                </div>
            ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex items-center gap-2">
                    <i className="fas fa-user text-gray-600"></i>
                    <p className="text-xs text-gray-700 font-medium">
                        Showing your activity only ({currentUser.name || currentUser.email || 'User'})
                    </p>
                </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-[10px] text-blue-600 font-medium mb-0.5">Total Logs</p>
                    <p className="text-xl font-bold text-blue-900">{logs.length}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-[10px] text-green-600 font-medium mb-0.5">Filtered Results</p>
                    <p className="text-xl font-bold text-green-900">{filteredLogs.length}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-[10px] text-purple-600 font-medium mb-0.5">Unique Users</p>
                    <p className="text-xl font-bold text-purple-900">{users.length}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-[10px] text-orange-600 font-medium mb-0.5">Modules</p>
                    <p className="text-xl font-bold text-orange-900">{modules.length}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2">
                    {/* Search */}
                    <div className="lg:col-span-2">
                        <label className="text-[10px] font-medium text-gray-700 mb-1 block">Search</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search logs..."
                                className="w-full pl-7 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            />
                            <i className="fas fa-search absolute left-2 top-2 text-gray-400 text-[10px]"></i>
                        </div>
                    </div>

                    {/* Date Range */}
                    <div>
                        <label className="text-[10px] font-medium text-gray-700 mb-1 block">Date Range</label>
                        <select
                            value={dateRange}
                            onChange={(e) => setDateRange(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            <option value="1">Last 24 hours</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                            <option value="all">All time</option>
                        </select>
                    </div>

                    {/* Module */}
                    <div>
                        <label className="text-[10px] font-medium text-gray-700 mb-1 block">Module</label>
                        <select
                            value={filterModule}
                            onChange={(e) => setFilterModule(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            <option value="all">All Modules</option>
                            {modules.map(module => (
                                <option key={module} value={module}>{module}</option>
                            ))}
                        </select>
                    </div>

                    {/* Action */}
                    <div>
                        <label className="text-[10px] font-medium text-gray-700 mb-1 block">Action</label>
                        <select
                            value={filterAction}
                            onChange={(e) => setFilterAction(e.target.value)}
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                            <option value="all">All Actions</option>
                            {actions.map(action => (
                                <option key={action} value={action}>{action}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between">
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            setFilterModule('all');
                            setFilterAction('all');
                            setFilterUser('all');
                            setDateRange('7');
                        }}
                        className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 hover:bg-white rounded transition-colors"
                    >
                        <i className="fas fa-redo mr-1"></i>
                        Reset Filters
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportToCSV}
                            className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded transition-colors font-medium"
                        >
                            <i className="fas fa-file-csv mr-1"></i>
                            Export CSV
                        </button>
                        <button
                            onClick={exportToExcel}
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition-colors font-medium"
                        >
                            <i className="fas fa-file-excel mr-1"></i>
                            Export Excel
                        </button>
                    </div>
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Timestamp</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">User</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Action</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Module</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Details</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="6" className="px-3 py-12 text-center">
                                        <i className="fas fa-spinner fa-spin text-2xl text-gray-400 mb-2"></i>
                                        <p className="text-xs text-gray-500">Loading audit logs...</p>
                                    </td>
                                </tr>
                            ) : currentLogs.length > 0 ? currentLogs.map(log => (
                                <tr key={log.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5 text-xs text-gray-900">
                                        {new Date(log.timestamp).toLocaleString('en-ZA', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </td>
                                    <td className="px-3 py-2.5 text-xs">
                                        <div className="font-medium text-gray-900">{log.user}</div>
                                        <div className="text-[10px] text-gray-500">{log.userRole}</div>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${getActionColor(log.action)}`}>
                                            <i className={`fas ${getActionIcon(log.action)} mr-1`}></i>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-gray-900 font-medium capitalize">{log.module}</td>
                                    <td className="px-3 py-2.5 text-xs text-gray-600 max-w-xs truncate">
                                        {JSON.stringify(log.details)}
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {log.success ? (
                                            <span className="inline-flex items-center text-[10px] text-green-700">
                                                <i className="fas fa-check-circle mr-1"></i>
                                                Success
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center text-[10px] text-red-700">
                                                <i className="fas fa-times-circle mr-1"></i>
                                                Failed
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan="6" className="px-3 py-12 text-center">
                                        <i className="fas fa-clipboard-list text-3xl text-gray-300 mb-2"></i>
                                        <p className="text-xs text-gray-500">No audit logs found</p>
                                        <p className="text-[10px] text-gray-400 mt-1">Try adjusting your filters</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="bg-gray-50 px-3 py-2 border-t border-gray-200 flex items-center justify-between pr-32">
                        <div className="text-xs text-gray-600">
                            Showing {indexOfFirstLog + 1} to {Math.min(indexOfLastLog, filteredLogs.length)} of {filteredLogs.length} logs
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i className="fas fa-chevron-left"></i>
                            </button>
                            <span className="px-3 py-1 text-xs">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage === totalPages}
                                className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <i className="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Make available globally
window.AuditTrail = AuditTrail;
