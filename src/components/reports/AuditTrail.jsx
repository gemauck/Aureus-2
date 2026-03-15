// Use React from window
const { useState, useEffect } = React;

const AuditTrail = () => {
    const [logs, setLogs] = useState([]);
    const [filteredLogs, setFilteredLogs] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterModule, setFilterModule] = useState('all');
    const [filterAction, setFilterAction] = useState('all');
    const [filterUser, setFilterUser] = useState('all');
    const [filterByEmail, setFilterByEmail] = useState('');
    const [dateRange, setDateRange] = useState('all'); // Show all logs by default
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedLogId, setExpandedLogId] = useState(null); // For full-detail row expand
    const [auditReportTab, setAuditReportTab] = useState('log'); // 'log' | 'users' | 'modules'
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
    
    // Only superadmins can see all users' activity; report access is already restricted to superadmin in Reports.jsx
    const isSuperadmin = () => {
        const user = getCurrentUser();
        return (user?.role || '').toLowerCase() === 'superadmin';
    };
    const isAdmin = () => isSuperadmin(); // For this report, only superadmins have full view

    // Load logs
    useEffect(() => {
        loadLogs();
    }, []);

    // Apply filters whenever they change
    useEffect(() => {
        applyFilters();
    }, [logs, searchTerm, filterModule, filterAction, filterUser, filterByEmail, dateRange]);

    const loadLogs = async (options = {}) => {
        if (!AuditLogger || typeof AuditLogger.getAll !== 'function') {
            console.error('AuditLogger.getAll not available');
            setError('AuditLogger not available. Please refresh the page.');
            setLogs([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const emailFilter = options.email !== undefined ? options.email : filterByEmail;
            if (emailFilter && isAdmin()) {
                setFilterByEmail(emailFilter);
            } else if (options.email === '') {
                setFilterByEmail('');
            }
            console.log('📊 Loading audit logs...');
            const getAllOptions = (emailFilter && isAdmin()) ? { email: emailFilter } : {};
            const allLogs = await AuditLogger.getAll(getAllOptions);
            console.log('📊 Raw audit logs response:', allLogs);
            
            // Ensure allLogs is an array
            const logsArray = Array.isArray(allLogs) ? allLogs : (allLogs?.logs && Array.isArray(allLogs.logs) ? allLogs.logs : []);
            
            console.log(`📊 Extracted ${logsArray.length} audit log entries`);
            
            setLogs(logsArray);
            if (logsArray.length === 0) {
                // Don't show error for empty logs - it's normal if no actions have been performed yet
                console.log('ℹ️ No audit logs found. This is normal if no actions have been logged yet.');
            }
        } catch (error) {
            console.error('❌ Error loading audit logs:', error);
            setError(`Failed to load audit logs: ${error.message}. Please check your connection and try again.`);
            setLogs([]);
        } finally {
            setIsLoading(false);
        }
    };

    const applyFilters = () => {
        // Ensure logs is an array
        const logsArray = Array.isArray(logs) ? logs : [];
        let filtered = [...logsArray];
        
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

        // Filter by email (admin: show only logs for this email; works with API or client-side)
        if (filterByEmail && filterByEmail.trim()) {
            const emailLower = filterByEmail.trim().toLowerCase();
            filtered = filtered.filter(log => {
                const logEmail = (log.userEmail || log.details?.email || '').toLowerCase();
                return logEmail && logEmail.indexOf(emailLower) !== -1;
            });
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
        // Create Excel-compatible format (extreme detail: all fields)
        const headers = ['Log ID', 'Timestamp', 'User', 'Email', 'Role', 'Action', 'Module', 'Entity ID', 'Details (JSON)', 'IP Address', 'Session ID', 'Success'];
        const rows = filteredLogs.map(log => [
            log.id || '',
            new Date(log.timestamp).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
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

    // Get unique values for filters (ensure logs is an array)
    // CRITICAL: Always ensure logs is an array before using .map()
    const logsArray = Array.isArray(logs) ? logs : (logs && typeof logs === 'object' && logs.logs && Array.isArray(logs.logs) ? logs.logs : []);
    const modules = logsArray.length > 0 ? [...new Set(logsArray.map(log => log.module).filter(Boolean))] : [];
    const actions = logsArray.length > 0 ? [...new Set(logsArray.map(log => log.action).filter(Boolean))] : [];
    const users = logsArray.length > 0 ? [...new Set(logsArray.map(log => log.userId || log.userEmail || log.user || '').filter(Boolean))].map(id => {
        const log = logsArray.find(l => (l.userId || l.userEmail || l.user) === id);
        return { id, name: log?.user || id };
    }) : [];

    // Metrics derived from filtered results (so they match what the user is looking at)
    const totalLoaded = logsArray.length;
    const resultsCount = filteredLogs.length;
    const uniqueUsersInResults = resultsCount > 0
        ? new Set(filteredLogs.map(log => (log.userId || log.userEmail || log.user || '').toString().trim()).filter(Boolean)).size
        : 0;
    const modulesInResults = resultsCount > 0
        ? new Set(filteredLogs.map(log => log.module).filter(Boolean)).size
        : 0;
    const successCount = resultsCount > 0 ? filteredLogs.filter(log => log.success === true).length : 0;
    const successRate = resultsCount > 0 ? Math.round((successCount / resultsCount) * 100) : 0;
    const dateSpan = (() => {
        if (resultsCount === 0) return null;
        const dates = filteredLogs.map(log => new Date(log.timestamp).getTime()).filter(Boolean);
        if (dates.length === 0) return null;
        const min = new Date(Math.min(...dates));
        const max = new Date(Math.max(...dates));
        const fmt = d => d.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric' });
        return min.getTime() === max.getTime() ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
    })();

    // Most active users (from filtered results)
    const mostActiveUsers = (() => {
        if (filteredLogs.length === 0) return [];
        const byKey = {};
        filteredLogs.forEach(log => {
            const key = (log.userId || log.userEmail || log.user || 'Unknown').toString().trim() || 'Unknown';
            if (!byKey[key]) byKey[key] = { label: log.user || log.userEmail || key, email: log.userEmail || null, count: 0 };
            byKey[key].count += 1;
        });
        return Object.values(byKey)
            .sort((a, b) => b.count - a.count)
            .slice(0, 15);
    })();
    const maxUserCount = mostActiveUsers.length ? Math.max(...mostActiveUsers.map(u => u.count)) : 1;

    // Most used modules (from filtered results)
    const mostUsedModules = (() => {
        if (filteredLogs.length === 0) return [];
        const byModule = {};
        filteredLogs.forEach(log => {
            const m = (log.module || 'Other').toString().trim();
            byModule[m] = (byModule[m] || 0) + 1;
        });
        return Object.entries(byModule)
            .map(([module, count]) => ({ module, count }))
            .sort((a, b) => b.count - a.count);
    })();
    const maxModuleCount = mostUsedModules.length ? Math.max(...mostUsedModules.map(m => m.count)) : 1;
    const totalModuleActions = mostUsedModules.reduce((s, m) => s + m.count, 0);

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

    // Restrict report to superadmins only
    if (!isSuperadmin()) {
        return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <i className="fas fa-lock text-2xl text-amber-600 mb-2"></i>
                <p className="text-sm font-medium text-amber-800">This report is restricted to Superadmins only.</p>
                <p className="text-xs text-amber-700 mt-1">You do not have permission to view the audit trail.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* View Mode Indicator */}
            {userIsAdmin ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
                    <i className="fas fa-shield-alt text-blue-600"></i>
                    <p className="text-xs text-blue-800 font-medium">
                        Superadmin View: Full audit trail for all users (extreme detail)
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

            {userIsAdmin && (
                <p className="text-[10px] text-gray-500">Use filters below to narrow by user email, module, action, or date. Click a row’s chevron for full log JSON.</p>
            )}

            {/* Error Message */}
            {error && (
                <div className={`${isDark ? 'bg-yellow-900 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border rounded-lg p-3 flex items-start gap-2`}>
                    <i className={`fas fa-exclamation-triangle ${isDark ? 'text-yellow-400' : 'text-yellow-600'} mt-0.5`}></i>
                    <div className="flex-1">
                        <p className={`text-xs ${isDark ? 'text-yellow-200' : 'text-yellow-800'} font-medium mb-1`}>Notice</p>
                        <p className={`text-xs ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>{error}</p>
                    </div>
                    <button
                        onClick={() => setError(null)}
                        className={isDark ? 'text-yellow-400 hover:text-yellow-300' : 'text-yellow-600 hover:text-yellow-800'}
                    >
                        <i className="fas fa-times"></i>
                    </button>
                </div>
            )}

            {/* Summary Stats – all metrics refer to current filters */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <p className="text-[10px] text-slate-600 font-medium mb-0.5">Logs loaded</p>
                    <p className="text-xl font-bold text-slate-900">{totalLoaded}</p>
                    <p className="text-[9px] text-slate-500 mt-0.5">in this session</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-[10px] text-green-600 font-medium mb-0.5">Results</p>
                    <p className="text-xl font-bold text-green-900">{resultsCount}</p>
                    <p className="text-[9px] text-green-600 mt-0.5">matching filters</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <p className="text-[10px] text-purple-600 font-medium mb-0.5">Unique users</p>
                    <p className="text-xl font-bold text-purple-900">{uniqueUsersInResults}</p>
                    <p className="text-[9px] text-purple-600 mt-0.5">in results</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <p className="text-[10px] text-orange-600 font-medium mb-0.5">Modules</p>
                    <p className="text-xl font-bold text-orange-900">{modulesInResults}</p>
                    <p className="text-[9px] text-orange-600 mt-0.5">in results</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-[10px] text-emerald-600 font-medium mb-0.5">Success rate</p>
                    <p className="text-xl font-bold text-emerald-900">{resultsCount ? `${successRate}%` : '—'}</p>
                    <p className="text-[9px] text-emerald-600 mt-0.5">{resultsCount ? `${successCount}/${resultsCount} successful` : 'no data'}</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-[10px] text-blue-600 font-medium mb-0.5">Date range</p>
                    <p className="text-sm font-bold text-blue-900 truncate" title={dateSpan || ''}>{dateSpan || '—'}</p>
                    <p className="text-[9px] text-blue-600 mt-0.5">of results</p>
                </div>
            </div>

            {/* Report tabs */}
            <div className="border-b border-gray-200">
                <nav className="flex gap-1" aria-label="Report type">
                    {[
                        { id: 'log', label: 'Audit log', icon: 'fa-list-alt' },
                        { id: 'users', label: 'Most active users', icon: 'fa-users' },
                        { id: 'modules', label: 'Most used modules', icon: 'fa-cubes' }
                    ].map(({ id, label, icon }) => (
                        <button
                            key={id}
                            onClick={() => setAuditReportTab(id)}
                            className={`py-2 px-3 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                                auditReportTab === id
                                    ? 'border-primary-500 text-primary-600 bg-white border-gray-200 -mb-px'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            <i className={`fas ${icon} mr-1.5 text-[10px]`}></i>
                            {label}
                        </button>
                    ))}
                </nav>
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
                    {/* Filter by email (admin) - optional server-side refetch */}
                    {userIsAdmin && (
                        <div className="lg:col-span-2">
                            <label className="text-[10px] font-medium text-gray-700 mb-1 block">Filter by email</label>
                            <div className="flex gap-1">
                                <input
                                    type="text"
                                    value={filterByEmail}
                                    onChange={(e) => setFilterByEmail(e.target.value)}
                                    placeholder="e.g. garethm@abcotronics.co.za"
                                    className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg"
                                />
                                <button type="button" onClick={() => loadLogs({ email: filterByEmail || undefined })} className="text-xs px-2 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700">Apply</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
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
                        <button
                            onClick={loadLogs}
                            className="text-xs text-blue-600 hover:text-blue-900 px-2 py-1 hover:bg-blue-50 rounded transition-colors"
                        >
                            <i className="fas fa-sync-alt mr-1"></i>
                            Refresh
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {auditReportTab === 'log' && (
                            <>
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
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Tab content */}
            {auditReportTab === 'users' && (
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/80">
                        <h2 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                            <i className="fas fa-users text-indigo-600"></i>
                            Most active users
                        </h2>
                        <p className="text-[10px] text-indigo-600 mt-0.5">Activity count from filtered audit logs</p>
                    </div>
                    <div className="p-4">
                        {mostActiveUsers.length === 0 ? (
                            <p className="text-xs text-gray-500 py-4 text-center">No user activity in current filters.</p>
                        ) : (
                            <div className="space-y-3">
                                {mostActiveUsers.map((u, i) => (
                                    <div key={i} className={`flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 ${i < 3 ? 'bg-indigo-50/60' : ''}`}>
                                        <span className="text-[10px] font-mono w-6 flex items-center justify-center">
                                            {i === 0 ? <i className="fas fa-trophy text-amber-500" title="Top user"></i> : i === 1 ? <span className="text-slate-500">2</span> : i === 2 ? <span className="text-amber-600">3</span> : `${i + 1}.`}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                                <span className="text-xs font-medium text-gray-900 truncate" title={u.email || u.label}>{u.label}</span>
                                                <span className="text-xs font-semibold text-indigo-700 tabular-nums">{u.count.toLocaleString()}</span>
                                            </div>
                                            <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500"
                                                    style={{ width: `${Math.max(4, (u.count / maxUserCount) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {auditReportTab === 'modules' && (
                <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-emerald-100 bg-emerald-50/80">
                        <h2 className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
                            <i className="fas fa-cubes text-emerald-600"></i>
                            Most used modules
                        </h2>
                        <p className="text-[10px] text-emerald-600 mt-0.5">Actions per module (filtered results)</p>
                    </div>
                    <div className="p-4">
                        {mostUsedModules.length === 0 ? (
                            <p className="text-xs text-gray-500 py-4 text-center">No module data in current filters.</p>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    {mostUsedModules.slice(0, 10).map((m, i) => (
                                        <div key={m.module} className={`flex items-center gap-3 rounded-lg px-2 py-1 -mx-2 ${i < 3 ? 'bg-emerald-50/60' : ''}`}>
                                            <span className="text-[10px] font-mono w-6 flex items-center justify-center">
                                                {i === 0 ? <i className="fas fa-chart-pie text-emerald-600" title="Most used"></i> : `${i + 1}.`}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                                    <span className="text-xs font-medium text-gray-900 capitalize">{m.module}</span>
                                                    <span className="text-xs font-semibold text-emerald-700 tabular-nums">{m.count.toLocaleString()}{totalModuleActions ? ` (${Math.round((m.count / totalModuleActions) * 100)}%)` : ''}</span>
                                                </div>
                                                <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                                                        style={{ width: `${Math.max(4, (m.count / maxModuleCount) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex flex-col items-center justify-center">
                                    <div className="relative w-32 h-32">
                                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                                            {mostUsedModules.slice(0, 8).map((m, i) => {
                                                const pct = totalModuleActions ? (m.count / totalModuleActions) * 100 : 0;
                                                const dashArray = `${pct} ${100 - pct}`;
                                                const offset = mostUsedModules.slice(0, i).reduce((s, x) => s + (totalModuleActions ? (x.count / totalModuleActions) * 100 : 0), 0);
                                                const dashOffset = -offset;
                                                const colors = ['#10b981', '#059669', '#047857', '#065f46', '#064e3b', '#34d399', '#6ee7b7', '#a7f3d0'];
                                                return (
                                                    <circle
                                                        key={m.module}
                                                        cx="18"
                                                        cy="18"
                                                        r="14"
                                                        fill="none"
                                                        stroke={colors[i % colors.length]}
                                                        strokeWidth="3"
                                                        strokeDasharray={dashArray}
                                                        strokeDashoffset={dashOffset}
                                                        className="transition-opacity hover:opacity-90"
                                                    />
                                                );
                                            })}
                                        </svg>
                                    </div>
                                    <p className="text-[10px] text-emerald-600 mt-2 font-medium">Share of actions</p>
                                    <div className="flex flex-wrap gap-1.5 mt-1 justify-center max-w-[140px]">
                                        {mostUsedModules.slice(0, 5).map((m, i) => (
                                            <span key={m.module} className="inline-flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ backgroundColor: ['#10b981', '#059669', '#047857', '#065f46', '#34d399'][i % 5] }}></span>
                                                <span className="text-[9px] text-gray-600 truncate max-w-[60px]" title={m.module}>{m.module}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {auditReportTab === 'log' && (
            <>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px]">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase w-8"></th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Timestamp</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">User</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Email</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Role</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Action</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Module</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Entity ID</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Details</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">IP</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Session</th>
                                <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="12" className="px-3 py-12 text-center">
                                        <i className="fas fa-spinner fa-spin text-2xl text-gray-400 mb-2"></i>
                                        <p className="text-xs text-gray-500">Loading audit logs...</p>
                                    </td>
                                </tr>
                            ) : currentLogs.length > 0 ? currentLogs.map(log => (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-gray-50">
                                        <td className="px-2 py-2 text-xs">
                                            <button
                                                type="button"
                                                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                                className="text-gray-500 hover:text-primary-600"
                                                title={expandedLogId === log.id ? 'Collapse full details' : 'Expand full details'}
                                            >
                                                <i className={`fas ${expandedLogId === log.id ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                                            </button>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-900 whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleString('en-ZA', {
                                                timeZone: 'Africa/Johannesburg',
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                second: '2-digit'
                                            })}
                                        </td>
                                        <td className="px-2 py-2 text-xs">
                                            <div className="font-medium text-gray-900">{log.user}</div>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-600 max-w-[140px] truncate" title={log.userEmail || ''}>{log.userEmail || '—'}</td>
                                        <td className="px-2 py-2 text-xs text-gray-600">{log.userRole || '—'}</td>
                                        <td className="px-2 py-2">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${getActionColor(log.action)}`}>
                                                <i className={`fas ${getActionIcon(log.action)} mr-1`}></i>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-900 font-medium capitalize">{log.module}</td>
                                        <td className="px-2 py-2 text-xs text-gray-500 max-w-[100px] truncate font-mono" title={log.entityId || ''}>{log.entityId || '—'}</td>
                                        <td className="px-2 py-2 text-xs text-gray-600 max-w-[200px]">
                                            <span className="truncate block" title={JSON.stringify(log.details)}>{typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || '—')}</span>
                                        </td>
                                        <td className="px-2 py-2 text-xs text-gray-500 font-mono max-w-[120px] truncate" title={log.ipAddress || ''}>{log.ipAddress || '—'}</td>
                                        <td className="px-2 py-2 text-xs text-gray-500 font-mono max-w-[100px] truncate" title={log.sessionId || ''}>{log.sessionId || '—'}</td>
                                        <td className="px-2 py-2">
                                            {log.success ? (
                                                <span className="inline-flex items-center text-[10px] text-green-700">
                                                    <i className="fas fa-check-circle mr-1"></i> Success
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center text-[10px] text-red-700">
                                                    <i className="fas fa-times-circle mr-1"></i> Failed
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                    {expandedLogId === log.id && (
                                        <tr className="bg-gray-50 border-t border-gray-200">
                                            <td colSpan="12" className="px-3 py-3">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-[10px] font-semibold text-gray-600 uppercase mb-1">Full log record (raw)</p>
                                                    <button type="button" onClick={() => setExpandedLogId(null)} className="text-[10px] text-gray-500 hover:text-gray-700">Close</button>
                                                </div>
                                                <pre className="text-[10px] text-left bg-gray-800 text-gray-100 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto font-mono whitespace-pre-wrap break-all">
                                                    {JSON.stringify({ id: log.id, timestamp: log.timestamp, user: log.user, userId: log.userId, userEmail: log.userEmail, userRole: log.userRole, action: log.action, module: log.module, entityId: log.entityId, details: log.details, ipAddress: log.ipAddress, sessionId: log.sessionId, success: log.success }, null, 2)}
                                                </pre>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )) : (
                                <tr>
                                    <td colSpan="12" className="px-3 py-12 text-center">
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
            </>
            )}
        </div>
    );
};

// Make available globally
window.AuditTrail = AuditTrail;
