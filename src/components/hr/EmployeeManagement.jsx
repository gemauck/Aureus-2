// Get React hooks from window
const { useState, useEffect } = React;
const storage = window.storage;

const EmployeeManagement = () => {
    const [employees, setEmployees] = useState([]);
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [viewMode, setViewMode] = useState('list'); // list or cards
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDepartment, setFilterDepartment] = useState('all');

    const departments = ['Management', 'Operations', 'Sales', 'Technical', 'Finance', 'Admin'];
    const positions = ['Director', 'Manager', 'Technical Lead', 'Engineer', 'Technician', 'Sales Representative', 'Accountant', 'Admin Assistant'];

    useEffect(() => {
        loadEmployees();
    }, []);

    const loadEmployees = () => {
        const saved = storage.getEmployees() || [
            {
                id: 1,
                employeeNumber: 'EMP001',
                name: 'Gareth Mauck',
                email: 'gareth@abcotronics.com',
                phone: '+27 82 555 0001',
                position: 'Director',
                department: 'Management',
                employmentDate: '2020-01-15',
                idNumber: '8501015800081',
                taxNumber: 'TAX123456',
                bankName: 'FNB',
                accountNumber: '62123456789',
                branchCode: '250655',
                salary: 85000,
                status: 'Active',
                address: '123 Main Road, Johannesburg, 2001',
                emergencyContact: 'Jane Mauck - +27 82 555 0002'
            },
            {
                id: 2,
                employeeNumber: 'EMP002',
                name: 'David Buttemer',
                email: 'david@abcotronics.com',
                phone: '+27 83 555 0003',
                position: 'Technical Lead',
                department: 'Operations',
                employmentDate: '2021-03-01',
                idNumber: '9201125800082',
                taxNumber: 'TAX789012',
                bankName: 'Standard Bank',
                accountNumber: '02987654321',
                branchCode: '051001',
                salary: 65000,
                status: 'Active',
                address: '456 Oak Avenue, Pretoria, 0002',
                emergencyContact: 'Sarah Buttemer - +27 83 555 0004'
            }
        ];
        setEmployees(saved);
    };

    useEffect(() => {
        if (employees.length > 0) {
            storage.setEmployees(employees);
        }
    }, [employees]);

    const handleSaveEmployee = (employeeData) => {
        const user = storage.getUser();
        
        if (selectedEmployee) {
            setEmployees(employees.map(emp =>
                emp.id === selectedEmployee.id ? { ...employeeData, id: selectedEmployee.id } : emp
            ));
            
            // Log update action
            if (window.AuditLogger) {
                window.AuditLogger.log('update', 'hr', {
                    action: 'Updated employee',
                    employeeId: selectedEmployee.id,
                    employeeName: employeeData.name
                }, user);
            }
        } else {
            const newEmployee = {
                ...employeeData,
                id: Date.now(),
                employeeNumber: `EMP${String(employees.length + 1).padStart(3, '0')}`
            };
            setEmployees([...employees, newEmployee]);
            
            // Log create action
            if (window.AuditLogger) {
                window.AuditLogger.log('create', 'hr', {
                    action: 'Created new employee',
                    employeeId: newEmployee.id,
                    employeeName: newEmployee.name,
                    employeeNumber: newEmployee.employeeNumber
                }, user);
            }
        }
        setShowEmployeeModal(false);
        setSelectedEmployee(null);
    };

    const handleDeleteEmployee = (id) => {
        if (confirm('Are you sure you want to delete this employee? This action cannot be undone.')) {
            const user = storage.getUser();
            const employee = employees.find(e => e.id === id);
            
            setEmployees(employees.filter(emp => emp.id !== id));
            
            // Log delete action
            if (window.AuditLogger && employee) {
                window.AuditLogger.log('delete', 'hr', {
                    action: 'Deleted employee',
                    employeeId: id,
                    employeeName: employee.name,
                    employeeNumber: employee.employeeNumber
                }, user);
            }
        }
    };

    const filteredEmployees = employees.filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            emp.employeeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            emp.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDepartment = filterDepartment === 'all' || emp.department === filterDepartment;
        return matchesSearch && matchesDepartment;
    });

    const getStatusColor = (status) => {
        switch(status) {
            case 'Active': return 'bg-green-100 text-green-800';
            case 'On Leave': return 'bg-yellow-100 text-yellow-800';
            case 'Suspended': return 'bg-red-100 text-red-800';
            case 'Resigned': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const calculateTenure = (employmentDate) => {
        const start = new Date(employmentDate);
        const now = new Date();
        const years = now.getFullYear() - start.getFullYear();
        const months = now.getMonth() - start.getMonth();
        const totalMonths = years * 12 + months;
        
        if (totalMonths < 12) {
            return `${totalMonths} ${totalMonths === 1 ? 'month' : 'months'}`;
        }
        const y = Math.floor(totalMonths / 12);
        const m = totalMonths % 12;
        return m > 0 ? `${y}y ${m}m` : `${y} ${y === 1 ? 'year' : 'years'}`;
    };

    // Employee Modal Component
    const EmployeeModal = () => {
        const [formData, setFormData] = useState(selectedEmployee || {
            name: '',
            email: '',
            phone: '',
            position: '',
            department: '',
            employmentDate: '',
            idNumber: '',
            taxNumber: '',
            bankName: '',
            accountNumber: '',
            branchCode: '',
            salary: '',
            status: 'Active',
            address: '',
            emergencyContact: ''
        });

        const [activeTab, setActiveTab] = useState('personal');

        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {selectedEmployee ? 'Edit Employee' : 'Add New Employee'}
                        </h2>
                        <button 
                            onClick={() => {
                                setShowEmployeeModal(false);
                                setSelectedEmployee(null);
                            }}
                            className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                        >
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 px-4">
                        <button
                            onClick={() => setActiveTab('personal')}
                            className={`px-4 py-2 text-xs font-medium ${activeTab === 'personal' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                        >
                            Personal Info
                        </button>
                        <button
                            onClick={() => setActiveTab('employment')}
                            className={`px-4 py-2 text-xs font-medium ${activeTab === 'employment' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                        >
                            Employment
                        </button>
                        <button
                            onClick={() => setActiveTab('financial')}
                            className={`px-4 py-2 text-xs font-medium ${activeTab === 'financial' ? 'text-primary-600 border-b-2 border-primary-600' : 'text-gray-600'}`}
                        >
                            Financial
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'personal' && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Full Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            ID Number *
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.idNumber}
                                            onChange={(e) => setFormData({...formData, idNumber: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            placeholder="8501015800081"
                                            maxLength="13"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Email *
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.email}
                                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Phone *
                                        </label>
                                        <input
                                            type="tel"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            placeholder="+27 82 555 0000"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Physical Address
                                    </label>
                                    <textarea
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="2"
                                        placeholder="Street address, City, Postal code"
                                    ></textarea>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Emergency Contact
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.emergencyContact}
                                        onChange={(e) => setFormData({...formData, emergencyContact: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Name - Phone number"
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'employment' && (
                            <div className="space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Position *
                                        </label>
                                        <select
                                            value={formData.position}
                                            onChange={(e) => setFormData({...formData, position: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            required
                                        >
                                            <option value="">Select Position</option>
                                            {positions.map(pos => (
                                                <option key={pos} value={pos}>{pos}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Department *
                                        </label>
                                        <select
                                            value={formData.department}
                                            onChange={(e) => setFormData({...formData, department: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            required
                                        >
                                            <option value="">Select Department</option>
                                            {departments.map(dept => (
                                                <option key={dept} value={dept}>{dept}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Employment Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={formData.employmentDate}
                                            onChange={(e) => setFormData({...formData, employmentDate: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Status *
                                        </label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => setFormData({...formData, status: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="Active">Active</option>
                                            <option value="On Leave">On Leave</option>
                                            <option value="Suspended">Suspended</option>
                                            <option value="Resigned">Resigned</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'financial' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Tax Number
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.taxNumber}
                                        onChange={(e) => setFormData({...formData, taxNumber: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="TAX123456"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Monthly Salary (ZAR)
                                    </label>
                                    <input
                                        type="number"
                                        value={formData.salary}
                                        onChange={(e) => setFormData({...formData, salary: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="0.00"
                                    />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Bank Name
                                        </label>
                                        <select
                                            value={formData.bankName}
                                            onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        >
                                            <option value="">Select Bank</option>
                                            <option>ABSA</option>
                                            <option>Capitec</option>
                                            <option>FNB</option>
                                            <option>Nedbank</option>
                                            <option>Standard Bank</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Account Number
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.accountNumber}
                                            onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                            Branch Code
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.branchCode}
                                            onChange={(e) => setFormData({...formData, branchCode: e.target.value})}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200">
                        <button
                            onClick={() => {
                                setShowEmployeeModal(false);
                                setSelectedEmployee(null);
                            }}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => handleSaveEmployee(formData)}
                            disabled={!formData.name || !formData.email || !formData.position || !formData.department}
                            className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <i className="fas fa-save mr-1.5"></i>
                            Save Employee
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-base font-semibold text-gray-900">Employee Management</h2>
                    <p className="text-xs text-gray-600">Manage employee records and information</p>
                </div>
                <button
                    onClick={() => setShowEmployeeModal(true)}
                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                    <i className="fas fa-user-plus mr-1.5"></i>
                    Add Employee
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Total Employees</p>
                    <p className="text-xl font-bold text-gray-900">{employees.length}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Active</p>
                    <p className="text-xl font-bold text-green-600">
                        {employees.filter(e => e.status === 'Active').length}
                    </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">On Leave</p>
                    <p className="text-xl font-bold text-yellow-600">
                        {employees.filter(e => e.status === 'On Leave').length}
                    </p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-[10px] text-gray-600 mb-0.5">Departments</p>
                    <p className="text-xl font-bold text-blue-600">
                        {new Set(employees.map(e => e.department)).size}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex gap-2.5">
                    <div className="flex-1">
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search employees..."
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                    </div>

                    <select
                        value={filterDepartment}
                        onChange={(e) => setFilterDepartment(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                        <option value="all">All Departments</option>
                        {departments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                        ))}
                    </select>

                    <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-3 py-1.5 text-xs ${viewMode === 'list' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            <i className="fas fa-list"></i>
                        </button>
                        <button
                            onClick={() => setViewMode('cards')}
                            className={`px-3 py-1.5 text-xs border-l ${viewMode === 'cards' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            <i className="fas fa-th-large"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* Employees Display */}
            {viewMode === 'list' ? (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Employee</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Position</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Department</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Tenure</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Status</th>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredEmployees.map(employee => (
                                <tr key={employee.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                                                <span className="text-primary-600 font-semibold text-xs">
                                                    {employee.name.charAt(0)}
                                                </span>
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                                                <div className="text-[10px] text-gray-500">{employee.employeeNumber}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-gray-900">{employee.position}</td>
                                    <td className="px-3 py-2.5 text-xs text-gray-900">{employee.department}</td>
                                    <td className="px-3 py-2.5 text-xs text-gray-600">{calculateTenure(employee.employmentDate)}</td>
                                    <td className="px-3 py-2.5">
                                        <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${getStatusColor(employee.status)}`}>
                                            {employee.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs">
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => {
                                                    setSelectedEmployee(employee);
                                                    setShowEmployeeModal(true);
                                                }}
                                                className="text-primary-600 hover:text-primary-700 p-1"
                                                title="Edit"
                                            >
                                                <i className="fas fa-edit"></i>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteEmployee(employee.id)}
                                                className="text-red-600 hover:text-red-700 p-1"
                                                title="Delete"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredEmployees.map(employee => (
                        <div key={employee.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center">
                                        <span className="text-primary-600 font-bold text-base">
                                            {employee.name.charAt(0)}
                                        </span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900">{employee.name}</h3>
                                        <p className="text-[10px] text-gray-500">{employee.employeeNumber}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${getStatusColor(employee.status)}`}>
                                    {employee.status}
                                </span>
                            </div>

                            <div className="space-y-1.5 mb-3">
                                <div className="flex items-center text-xs text-gray-600">
                                    <i className="fas fa-briefcase w-4 mr-2"></i>
                                    {employee.position}
                                </div>
                                <div className="flex items-center text-xs text-gray-600">
                                    <i className="fas fa-building w-4 mr-2"></i>
                                    {employee.department}
                                </div>
                                <div className="flex items-center text-xs text-gray-600">
                                    <i className="fas fa-envelope w-4 mr-2"></i>
                                    {employee.email}
                                </div>
                                <div className="flex items-center text-xs text-gray-600">
                                    <i className="fas fa-clock w-4 mr-2"></i>
                                    {calculateTenure(employee.employmentDate)} tenure
                                </div>
                            </div>

                            <div className="flex gap-2 pt-3 border-t border-gray-200">
                                <button
                                    onClick={() => {
                                        setSelectedEmployee(employee);
                                        setShowEmployeeModal(true);
                                    }}
                                    className="flex-1 px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    <i className="fas fa-edit mr-1"></i>
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDeleteEmployee(employee.id)}
                                    className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {filteredEmployees.length === 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                    <i className="fas fa-users text-gray-300 text-4xl mb-3"></i>
                    <p className="text-sm text-gray-600">No employees found</p>
                </div>
            )}

            {/* Modal */}
            {showEmployeeModal && <EmployeeModal />}
        </div>
    );
};

// Make available globally
window.EmployeeManagement = EmployeeManagement;
