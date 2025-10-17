// Get React hooks from window
const { useState, useEffect } = React;
const storage = window.storage;

const QuickBooksPayrollSync = ({ onClose }) => {
    const [connectionStatus, setConnectionStatus] = useState('disconnected'); // disconnected, connecting, connected
    const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, success, error
    const [lastSync, setLastSync] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [qbEmployees, setQBEmployees] = useState([]);
    const [employeeMapping, setEmployeeMapping] = useState({});
    const [activeTab, setActiveTab] = useState('connection'); // connection, employees, payroll
    const [syncSettings, setSyncSettings] = useState({
        autoSync: false,
        syncInterval: 'daily', // daily, weekly, manual
        includeAttendance: true,
        includeLeave: true,
        lastSyncDate: null
    });

    useEffect(() => {
        loadSyncSettings();
        loadEmployees();
        checkConnectionStatus();
    }, []);

    const loadSyncSettings = () => {
        const saved = storage.getQBSyncSettings();
        if (saved) {
            setSyncSettings(saved);
            setLastSync(saved.lastSyncDate);
        }
    };

    const loadEmployees = () => {
        const emps = storage.getEmployees() || [];
        setEmployees(emps);
        
        // Load saved mappings
        const mappings = storage.getQBEmployeeMapping() || {};
        setEmployeeMapping(mappings);
    };

    const checkConnectionStatus = () => {
        // TODO: Check if QB OAuth token is valid
        const qbConnection = storage.getQBConnection();
        if (qbConnection && qbConnection.accessToken) {
            setConnectionStatus('connected');
        } else {
            setConnectionStatus('disconnected');
        }
    };

    const handleConnect = async () => {
        setConnectionStatus('connecting');
        
        // TODO: Implement OAuth flow
        // For now, simulate connection
        setTimeout(() => {
            const connection = {
                accessToken: 'mock_token_' + Date.now(),
                refreshToken: 'mock_refresh_' + Date.now(),
                realmId: 'mock_realm_id',
                connectedAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 3600000).toISOString()
            };
            
            storage.setQBConnection(connection);
            setConnectionStatus('connected');
            
            // Fetch QB employees after connection
            fetchQBEmployees();
        }, 1500);
    };

    const handleDisconnect = () => {
        if (confirm('Disconnect from QuickBooks? You will need to reconnect to sync payroll data.')) {
            storage.removeQBConnection();
            setConnectionStatus('disconnected');
            setQBEmployees([]);
        }
    };

    const fetchQBEmployees = async () => {
        // TODO: Actual API call to QB
        // GET /v3/company/{companyId}/query?query=SELECT * FROM Employee
        
        // Mock data for now
        const mockQBEmployees = [
            {
                id: 'qb_emp_1',
                displayName: 'Gareth Mauck',
                givenName: 'Gareth',
                familyName: 'Mauck',
                email: 'gareth@abcotronics.com',
                employeeNumber: 'EMP001',
                status: 'Active'
            },
            {
                id: 'qb_emp_2',
                displayName: 'David Buttemer',
                givenName: 'David',
                familyName: 'Buttemer',
                email: 'david@abcotronics.com',
                employeeNumber: 'EMP002',
                status: 'Active'
            }
        ];
        
        setQBEmployees(mockQBEmployees);
        
        // Auto-match employees by email
        const autoMapping = {};
        employees.forEach(emp => {
            const match = mockQBEmployees.find(qb => 
                qb.email.toLowerCase() === emp.email.toLowerCase() ||
                qb.employeeNumber === emp.employeeNumber
            );
            if (match) {
                autoMapping[emp.id] = match.id;
            }
        });
        setEmployeeMapping(autoMapping);
        storage.setQBEmployeeMapping(autoMapping);
    };

    const handleMapEmployee = (erpEmployeeId, qbEmployeeId) => {
        const newMapping = {
            ...employeeMapping,
            [erpEmployeeId]: qbEmployeeId
        };
        setEmployeeMapping(newMapping);
        storage.setQBEmployeeMapping(newMapping);
    };

    const handleSyncPayroll = async () => {
        setSyncStatus('syncing');
        
        // TODO: Actual API calls
        // 1. GET paychecks for each employee
        // 2. Transform to ERP format
        // 3. Save to localStorage
        
        setTimeout(() => {
            // Mock sync completion
            const now = new Date().toISOString();
            const updatedSettings = {
                ...syncSettings,
                lastSyncDate: now
            };
            setSyncSettings(updatedSettings);
            storage.setQBSyncSettings(updatedSettings);
            setLastSync(now);
            setSyncStatus('success');
            
            setTimeout(() => setSyncStatus('idle'), 2000);
        }, 2000);
    };

    const handleSyncAttendance = async () => {
        // TODO: Push attendance records to QB
        // POST /v3/company/{companyId}/timeactivity
        alert('Attendance sync to QuickBooks will be implemented with API integration');
    };

    const handleSaveSyncSettings = () => {
        storage.setQBSyncSettings(syncSettings);
        alert('Sync settings saved!');
    };

    const getEmployeeName = (qbId) => {
        const qbEmp = qbEmployees.find(e => e.id === qbId);
        return qbEmp ? qbEmp.displayName : 'Unknown';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <img src="https://plugin.intuitcdn.net/designsystem/assets/2023-06-13/icons-and-images/qbo-logo.svg" 
                             alt="QuickBooks" className="h-6" 
                             onError={(e) => e.target.style.display = 'none'} />
                        <h2 className="text-base font-semibold text-gray-900">QuickBooks Payroll Sync</h2>
                        {connectionStatus === 'connected' && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded font-medium">
                                Connected
                            </span>
                        )}
                    </div>
                    <button 
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 px-4">
                    <button
                        onClick={() => setActiveTab('connection')}
                        className={`px-4 py-2 text-xs font-medium ${activeTab === 'connection' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                    >
                        <i className="fas fa-plug mr-1.5"></i>
                        Connection
                    </button>
                    <button
                        onClick={() => setActiveTab('employees')}
                        className={`px-4 py-2 text-xs font-medium ${activeTab === 'employees' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                        disabled={connectionStatus !== 'connected'}
                    >
                        <i className="fas fa-users mr-1.5"></i>
                        Employee Mapping
                    </button>
                    <button
                        onClick={() => setActiveTab('payroll')}
                        className={`px-4 py-2 text-xs font-medium ${activeTab === 'payroll' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                        disabled={connectionStatus !== 'connected'}
                    >
                        <i className="fas fa-sync mr-1.5"></i>
                        Sync Payroll
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 text-xs font-medium ${activeTab === 'settings' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                    >
                        <i className="fas fa-cog mr-1.5"></i>
                        Settings
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {/* Connection Tab */}
                    {activeTab === 'connection' && (
                        <div className="space-y-4">
                            {connectionStatus === 'disconnected' && (
                                <div className="text-center py-8">
                                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <i className="fas fa-link text-3xl text-gray-400"></i>
                                    </div>
                                    <h3 className="text-base font-semibold text-gray-900 mb-2">Connect to QuickBooks</h3>
                                    <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
                                        Link your QuickBooks Online account to sync payroll data, employee records, and attendance tracking.
                                    </p>
                                    <button
                                        onClick={handleConnect}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                                    >
                                        <i className="fas fa-link mr-2"></i>
                                        Connect to QuickBooks
                                    </button>
                                    
                                    <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto text-left">
                                        <p className="text-xs font-semibold text-blue-900 mb-2">What you'll get:</p>
                                        <ul className="text-xs text-blue-800 space-y-1">
                                            <li><i className="fas fa-check mr-2"></i>Automatic payroll sync</li>
                                            <li><i className="fas fa-check mr-2"></i>Employee records sync</li>
                                            <li><i className="fas fa-check mr-2"></i>Payslip history import</li>
                                            <li><i className="fas fa-check mr-2"></i>Tax calculation alignment</li>
                                            <li><i className="fas fa-check mr-2"></i>Attendance data push</li>
                                        </ul>
                                    </div>
                                </div>
                            )}

                            {connectionStatus === 'connecting' && (
                                <div className="text-center py-12">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                                    <p className="text-sm text-gray-600">Connecting to QuickBooks...</p>
                                </div>
                            )}

                            {connectionStatus === 'connected' && (
                                <div>
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                                    <i className="fas fa-check text-green-600"></i>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-green-900">Connected to QuickBooks</p>
                                                    <p className="text-xs text-green-700">Realm ID: mock_realm_id</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleDisconnect}
                                                className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                                            >
                                                Disconnect
                                            </button>
                                        </div>
                                    </div>

                                    {lastSync && (
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                            <p className="text-xs text-gray-600">
                                                <i className="fas fa-clock mr-1.5"></i>
                                                Last synced: {new Date(lastSync).toLocaleString('en-ZA')}
                                            </p>
                                        </div>
                                    )}

                                    <div className="mt-4">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3">Connection Details</h4>
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                <p className="text-gray-600 mb-1">QuickBooks Employees</p>
                                                <p className="text-lg font-bold text-gray-900">{qbEmployees.length}</p>
                                            </div>
                                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                                <p className="text-gray-600 mb-1">Mapped Employees</p>
                                                <p className="text-lg font-bold text-gray-900">
                                                    {Object.keys(employeeMapping).length}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Employee Mapping Tab */}
                    {activeTab === 'employees' && (
                        <div className="space-y-4">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs text-blue-900">
                                    <i className="fas fa-info-circle mr-1.5"></i>
                                    Map your ERP employees to QuickBooks employees to enable payroll sync.
                                </p>
                            </div>

                            <div className="space-y-2">
                                {employees.map(emp => (
                                    <div key={emp.id} className="bg-white border border-gray-200 rounded-lg p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <p className="text-sm font-medium text-gray-900">{emp.name}</p>
                                                <p className="text-xs text-gray-500">{emp.email} • {emp.employeeNumber}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <i className="fas fa-arrow-right text-gray-400 text-xs"></i>
                                                <select
                                                    value={employeeMapping[emp.id] || ''}
                                                    onChange={(e) => handleMapEmployee(emp.id, e.target.value)}
                                                    className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                                >
                                                    <option value="">Not Mapped</option>
                                                    {qbEmployees.map(qb => (
                                                        <option key={qb.id} value={qb.id}>
                                                            {qb.displayName} ({qb.employeeNumber})
                                                        </option>
                                                    ))}
                                                </select>
                                                {employeeMapping[emp.id] && (
                                                    <span className="text-green-600">
                                                        <i className="fas fa-check-circle"></i>
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Payroll Sync Tab */}
                    {activeTab === 'payroll' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={handleSyncPayroll}
                                    disabled={syncStatus === 'syncing'}
                                    className="p-4 border-2 border-primary-600 rounded-lg hover:bg-primary-50 transition-colors text-left disabled:opacity-50"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <i className="fas fa-download text-primary-600 text-xl"></i>
                                        {syncStatus === 'syncing' && (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                                        )}
                                        {syncStatus === 'success' && (
                                            <i className="fas fa-check-circle text-green-600"></i>
                                        )}
                                    </div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Import Payroll from QB</h4>
                                    <p className="text-xs text-gray-600">Fetch payslips and payroll data</p>
                                </button>

                                <button
                                    onClick={handleSyncAttendance}
                                    className="p-4 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-left"
                                >
                                    <i className="fas fa-upload text-gray-600 text-xl mb-2"></i>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-1">Push Attendance to QB</h4>
                                    <p className="text-xs text-gray-600">Send time tracking data</p>
                                </button>
                            </div>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-gray-900 mb-3">Sync Preview</h4>
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Employees to sync:</span>
                                        <span className="font-medium">{Object.keys(employeeMapping).length}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Current month payroll:</span>
                                        <span className="font-medium">Ready</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Attendance records:</span>
                                        <span className="font-medium">
                                            {storage.getAttendanceRecords()?.length || 0} records
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {syncStatus === 'success' && (
                                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                                    <p className="text-xs text-green-900">
                                        <i className="fas fa-check-circle mr-1.5"></i>
                                        Payroll synced successfully!
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Settings Tab */}
                    {activeTab === 'settings' && (
                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center cursor-pointer mb-3">
                                    <input
                                        type="checkbox"
                                        checked={syncSettings.autoSync}
                                        onChange={(e) => setSyncSettings({...syncSettings, autoSync: e.target.checked})}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-medium text-gray-900">
                                        Enable automatic sync
                                    </span>
                                </label>

                                {syncSettings.autoSync && (
                                    <div className="ml-6">
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Sync Frequency
                                        </label>
                                        <select
                                            value={syncSettings.syncInterval}
                                            onChange={(e) => setSyncSettings({...syncSettings, syncInterval: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                                        >
                                            <option value="manual">Manual Only</option>
                                            <option value="daily">Daily</option>
                                            <option value="weekly">Weekly</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-gray-200 pt-4">
                                <h4 className="text-sm font-semibold text-gray-900 mb-3">Data to Sync</h4>
                                
                                <label className="flex items-center cursor-pointer mb-2">
                                    <input
                                        type="checkbox"
                                        checked={syncSettings.includeAttendance}
                                        onChange={(e) => setSyncSettings({...syncSettings, includeAttendance: e.target.checked})}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">Attendance & Time Tracking</span>
                                </label>

                                <label className="flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={syncSettings.includeLeave}
                                        onChange={(e) => setSyncSettings({...syncSettings, includeLeave: e.target.checked})}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">Leave Applications</span>
                                </label>
                            </div>

                            <button
                                onClick={handleSaveSyncSettings}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                            >
                                <i className="fas fa-save mr-2"></i>
                                Save Settings
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.QuickBooksPayrollSync = QuickBooksPayrollSync;
