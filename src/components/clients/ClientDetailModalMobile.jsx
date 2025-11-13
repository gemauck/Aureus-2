// Mobile-optimized Client Detail Modal
const { useState, useEffect } = React;

const ClientDetailModalMobile = ({ client, onSave, onClose, allProjects, onNavigateToProject }) => {
    const [activeTab, setActiveTab] = useState('overview');
    const [formData, setFormData] = useState(client || {
        name: '',
        industry: '',
        status: 'Active',
        address: '',
        website: '',
        notes: '',
        contacts: [],
        followUps: [],
        projectIds: [],
        comments: [],
        contracts: [],
        sites: [],
        opportunities: [],
        activityLog: [],
        billingTerms: {
            paymentTerms: 'Net 30',
            billingFrequency: 'Monthly',
            currency: 'ZAR',
            retainerAmount: 0,
            taxExempt: false,
            notes: ''
        }
    });
    const { isDark } = window.useTheme();

    // Form states
    const [showAddContact, setShowAddContact] = useState(false);
    const [showAddSite, setShowAddSite] = useState(false);
    const [showAddOpportunity, setShowAddOpportunity] = useState(false);
    const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '', department: '' });
    const [newSite, setNewSite] = useState({ name: '', address: '', gpsCoordinates: '', notes: '' });
    const [newOpportunity, setNewOpportunity] = useState({ name: '', value: '', stage: 'Awareness', expectedCloseDate: '', notes: '' });
    
    // Validation state
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});

    // Validate form
    const validateForm = () => {
        const newErrors = {};
        
        // Company Name is required
        if (!formData.name || formData.name.trim() === '') {
            newErrors.name = 'Company Name is required';
        }
        
        // Validate website format if provided
        if (formData.website && formData.website.trim() !== '') {
            const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
            if (!urlPattern.test(formData.website.trim())) {
                newErrors.website = 'Please enter a valid website URL';
            }
        }
        
        setErrors(newErrors);
        return { isValid: Object.keys(newErrors).length === 0, errors: newErrors };
    };

    const handleSave = () => {
        // Validate before saving
        const validation = validateForm();
        if (!validation.isValid) {
            // Scroll to first error field
            setTimeout(() => {
                const firstErrorField = Object.keys(validation.errors)[0];
                if (firstErrorField) {
                    const errorElement = document.querySelector(`[name="${firstErrorField}"]`);
                    if (errorElement) {
                        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        errorElement.focus();
                    }
                }
                // Show alert with error message
                const firstError = validation.errors[Object.keys(validation.errors)[0]];
                alert(firstError || 'Please fill in all required fields');
            }, 100);
            return;
        }
        
        onSave(formData);
    };
    
    // Handle field blur for validation
    const handleBlur = (fieldName) => {
        setTouched({ ...touched, [fieldName]: true });
        // Trigger validation on blur to show errors immediately
        validateForm();
    };

    const handleAddContact = () => {
        // Validate contact name is required
        if (!newContact.name || newContact.name.trim() === '') {
            alert('Contact Name is required');
            return;
        }
        
        // Validate email format if provided
        if (newContact.email && newContact.email.trim() !== '') {
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(newContact.email.trim())) {
                alert('Please enter a valid email address');
                return;
            }
        }
        
        const contact = {
            ...newContact,
            id: Date.now(),
            isPrimary: formData.contacts.length === 0
        };
        const updatedFormData = {
            ...formData,
            contacts: [...formData.contacts, contact]
        };
        setFormData(updatedFormData);
        setNewContact({ name: '', email: '', phone: '', role: '', department: '' });
        setShowAddContact(false);
        onSave(updatedFormData);
    };

    const handleAddSite = () => {
        // Validate site name is required
        if (!newSite.name || newSite.name.trim() === '') {
            alert('Site Name is required');
            return;
        }
        
        const site = {
            ...newSite,
            id: Date.now()
        };
        const updatedFormData = {
            ...formData,
            sites: [...formData.sites, site]
        };
        setFormData(updatedFormData);
        setNewSite({ name: '', address: '', gpsCoordinates: '', notes: '' });
        setShowAddSite(false);
        onSave(updatedFormData);
    };

    const handleAddOpportunity = () => {
        // Validate opportunity name is required
        if (!newOpportunity.name || newOpportunity.name.trim() === '') {
            alert('Opportunity Name is required');
            return;
        }
        
        // Validate value is a positive number if provided
        if (newOpportunity.value && (isNaN(parseFloat(newOpportunity.value)) || parseFloat(newOpportunity.value) < 0)) {
            alert('Please enter a valid positive number for value');
            return;
        }
        
        const opportunity = {
            ...newOpportunity,
            id: Date.now(),
            value: parseFloat(newOpportunity.value) || 0,
            clientId: formData.id
        };
        const updatedFormData = {
            ...formData,
            opportunities: [...formData.opportunities, opportunity]
        };
        setFormData(updatedFormData);
        setNewOpportunity({ name: '', value: '', stage: 'Awareness', expectedCloseDate: '', notes: '' });
        setShowAddOpportunity(false);
        onSave(updatedFormData);
    };

    const removeContact = (contactId) => {
        const updatedFormData = {
            ...formData,
            contacts: formData.contacts.filter(c => c.id !== contactId)
        };
        setFormData(updatedFormData);
        onSave(updatedFormData);
    };

    const removeSite = (siteId) => {
        const updatedFormData = {
            ...formData,
            sites: formData.sites.filter(s => s.id !== siteId)
        };
        setFormData(updatedFormData);
        onSave(updatedFormData);
    };

    const removeOpportunity = async (opportunityId) => {
        const opportunity = formData.opportunities.find(o => o.id === opportunityId);
        if (confirm('Delete this opportunity?')) {
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    alert('❌ Please log in to delete opportunities from the database');
                    return;
                }
                
                if (!window.api?.deleteOpportunity) {
                    alert('❌ Opportunity API not available. Please refresh the page.');
                    return;
                }
                
                console.log('🌐 Deleting opportunity via API:', opportunityId);
                await window.api.deleteOpportunity(opportunityId);
                
                // Update local opportunities array
                const updatedFormData = {
                    ...formData,
                    opportunities: formData.opportunities.filter(o => o.id !== opportunityId)
                };
                setFormData(updatedFormData);
                onSave(updatedFormData);
                
                alert('✅ Opportunity deleted from database successfully!');
                
                console.log('✅ Opportunity deleted from database:', opportunityId);
            } catch (error) {
                console.error('❌ Error deleting opportunity:', error);
                alert('❌ Error deleting opportunity from database: ' + error.message);
            }
        }
    };

    // Mobile-optimized tabs
    const tabs = [
        { id: 'overview', label: 'Overview', icon: 'fa-info-circle' },
        { id: 'contacts', label: 'Contacts', icon: 'fa-users' },
        { id: 'sites', label: 'Sites', icon: 'fa-map-marker-alt' },
        { id: 'opportunities', label: 'Opportunities', icon: 'fa-chart-line' },
        { id: 'projects', label: 'Projects', icon: 'fa-project-diagram' }
    ];

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
            
            {/* Modal */}
            <div className="absolute inset-0 bg-white dark:bg-gray-800 flex flex-col">
                {/* Mobile Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky top-0 z-10">
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <i className="fas fa-arrow-left text-lg"></i>
                    </button>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1 text-center">
                        {client ? 'Edit Client' : 'Add Client'}
                    </h2>
                    <button
                        onClick={handleSave}
                        className="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                    >
                        Save
                    </button>
                </div>

                {/* Mobile Tabs */}
                <div className="flex overflow-x-auto bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 sticky top-16 z-10">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === tab.id
                                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            <i className={`fas ${tab.icon} mr-2`}></i>
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Basic Information */}
                            <div className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Basic Information</h3>
                                
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Company Name *
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={(e) => {
                                            setFormData({...formData, name: e.target.value});
                                            if (errors.name) {
                                                setErrors({...errors, name: ''});
                                            }
                                        }}
                                        onBlur={() => handleBlur('name')}
                                        className={`w-full px-4 py-3 text-base border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                                            errors.name ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        }`}
                                        placeholder="Enter company name"
                                        required
                                    />
                                    {errors.name && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Industry
                                        </label>
                                        <select
                                            value={formData.industry}
                                            onChange={(e) => setFormData({...formData, industry: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="">Select Industry</option>
                                            <option value="Technology">Technology</option>
                                            <option value="Manufacturing">Manufacturing</option>
                                            <option value="Healthcare">Healthcare</option>
                                            <option value="Finance">Finance</option>
                                            <option value="Retail">Retail</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Status
                                        </label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => setFormData({...formData, status: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                        >
                                            <option value="Active">Active</option>
                                            <option value="Inactive">LInactive</option>
                                            <option value="Prospect">Prospect</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Address
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => setFormData({...formData, address: e.target.value})}
                                        className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                        placeholder="Enter address"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Website
                                    </label>
                                    <input
                                        type="url"
                                        name="website"
                                        value={formData.website}
                                        onChange={(e) => {
                                            setFormData({...formData, website: e.target.value});
                                            if (errors.website) {
                                                setErrors({...errors, website: ''});
                                            }
                                        }}
                                        onBlur={() => handleBlur('website')}
                                        className={`w-full px-4 py-3 text-base border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 ${
                                            errors.website ? 'border-red-500 dark:border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        }`}
                                        placeholder="https://example.com"
                                    />
                                    {errors.website && (
                                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.website}</p>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Notes
                                    </label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        rows={4}
                                        className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                                        placeholder="Additional notes..."
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'contacts' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Contacts</h3>
                                {!showAddContact && (
                                    <button
                                        onClick={() => setShowAddContact(true)}
                                        className="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                    >
                                        <i className="fas fa-plus mr-2"></i>Add Contact
                                    </button>
                                )}
                            </div>

                            {/* Add Contact Form */}
                            {showAddContact && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Add New Contact</h4>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newContact.name}
                                            onChange={(e) => setNewContact({...newContact, name: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="Contact name"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Email
                                            </label>
                                            <input
                                                type="email"
                                                value={newContact.email}
                                                onChange={(e) => setNewContact({...newContact, email: e.target.value})}
                                                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                placeholder="email@example.com"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Phone
                                            </label>
                                            <input
                                                type="tel"
                                                value={newContact.phone}
                                                onChange={(e) => setNewContact({...newContact, phone: e.target.value})}
                                                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                placeholder="Phone number"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Role
                                            </label>
                                            <input
                                                type="text"
                                                value={newContact.role}
                                                onChange={(e) => setNewContact({...newContact, role: e.target.value})}
                                                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                placeholder="Job title"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Department
                                            </label>
                                            <input
                                                type="text"
                                                value={newContact.department}
                                                onChange={(e) => setNewContact({...newContact, department: e.target.value})}
                                                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                placeholder="Department"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex space-x-3">
                                        <button
                                            onClick={handleAddContact}
                                            className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                        >
                                            Add Contact
                                        </button>
                                        <button
                                            onClick={() => setShowAddContact(false)}
                                            className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 py-3 rounded-lg font-medium hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Contacts List */}
                            <div className="space-y-3">
                                {formData.contacts.map(contact => (
                                    <div key={contact.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{contact.name}</h4>
                                                {contact.role && <p className="text-sm text-gray-600 dark:text-gray-400">{contact.role}</p>}
                                                {contact.department && <p className="text-sm text-gray-600 dark:text-gray-400">{contact.department}</p>}
                                                <div className="mt-2 space-y-1">
                                                    {contact.email && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            <i className="fas fa-envelope w-4 mr-2"></i>{contact.email}
                                                        </p>
                                                    )}
                                                    {contact.phone && (
                                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                                            <i className="fas fa-phone w-4 mr-2"></i>{contact.phone}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeContact(contact.id)}
                                                className="text-red-500 hover:text-red-700 p-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {formData.contacts.length === 0 && !showAddContact && (
                                <div className="text-center py-8">
                                    <i className="fas fa-users text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                                    <p className="text-gray-600 dark:text-gray-400">No contacts added yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'sites' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sites</h3>
                                {!showAddSite && (
                                    <button
                                        onClick={() => setShowAddSite(true)}
                                        className="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                    >
                                        <i className="fas fa-plus mr-2"></i>Add Site
                                    </button>
                                )}
                            </div>

                            {/* Add Site Form */}
                            {showAddSite && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Add New Site</h4>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Site Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newSite.name}
                                            onChange={(e) => setNewSite({...newSite, name: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="Site name"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Address
                                        </label>
                                        <textarea
                                            value={newSite.address}
                                            onChange={(e) => setNewSite({...newSite, address: e.target.value})}
                                            rows={3}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="Site address"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            GPS Coordinates
                                        </label>
                                        <input
                                            type="text"
                                            value={newSite.gpsCoordinates}
                                            onChange={(e) => setNewSite({...newSite, gpsCoordinates: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="e.g., -26.2041, 28.0473"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Notes
                                        </label>
                                        <textarea
                                            value={newSite.notes}
                                            onChange={(e) => setNewSite({...newSite, notes: e.target.value})}
                                            rows={3}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="Additional notes..."
                                        />
                                    </div>

                                    <div className="flex space-x-3">
                                        <button
                                            onClick={handleAddSite}
                                            className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                        >
                                            Add Site
                                        </button>
                                        <button
                                            onClick={() => setShowAddSite(false)}
                                            className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 py-3 rounded-lg font-medium hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Sites List */}
                            <div className="space-y-3">
                                {formData.sites.map(site => (
                                    <div key={site.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{site.name}</h4>
                                                {site.address && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                        <i className="fas fa-map-marker-alt w-4 mr-2"></i>{site.address}
                                                    </p>
                                                )}
                                                {site.gpsCoordinates && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                                        <i className="fas fa-crosshairs w-4 mr-2"></i>{site.gpsCoordinates}
                                                    </p>
                                                )}
                                                {site.notes && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{site.notes}</p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeSite(site.id)}
                                                className="text-red-500 hover:text-red-700 p-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {formData.sites.length === 0 && !showAddSite && (
                                <div className="text-center py-8">
                                    <i className="fas fa-map-marker-alt text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                                    <p className="text-gray-600 dark:text-gray-400">No sites added yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'opportunities' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Opportunities</h3>
                                {!showAddOpportunity && (
                                    <button
                                        onClick={() => setShowAddOpportunity(true)}
                                        className="bg-primary-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                    >
                                        <i className="fas fa-plus mr-2"></i>Add Opportunity
                                    </button>
                                )}
                            </div>

                            {/* Add Opportunity Form */}
                            {showAddOpportunity && (
                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-4">
                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">Add New Opportunity</h4>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Opportunity Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={newOpportunity.name}
                                            onChange={(e) => setNewOpportunity({...newOpportunity, name: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="Opportunity name"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Value (R)
                                            </label>
                                            <input
                                                type="number"
                                                value={newOpportunity.value}
                                                onChange={(e) => setNewOpportunity({...newOpportunity, value: e.target.value})}
                                                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                placeholder="0"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Stage
                                            </label>
                                            <select
                                                value={newOpportunity.stage}
                                                onChange={(e) => setNewOpportunity({...newOpportunity, stage: e.target.value})}
                                                className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            >
                                                <option value="Awareness">Awareness</option>
                                                <option value="Interest">Interest</option>
                                                <option value="Desire">Desire</option>
                                                <option value="Action">Action</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Expected Close Date
                                        </label>
                                        <input
                                            type="date"
                                            value={newOpportunity.expectedCloseDate}
                                            onChange={(e) => setNewOpportunity({...newOpportunity, expectedCloseDate: e.target.value})}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Notes
                                        </label>
                                        <textarea
                                            value={newOpportunity.notes}
                                            onChange={(e) => setNewOpportunity({...newOpportunity, notes: e.target.value})}
                                            rows={3}
                                            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                            placeholder="Additional notes..."
                                        />
                                    </div>

                                    <div className="flex space-x-3">
                                        <button
                                            onClick={handleAddOpportunity}
                                            className="flex-1 bg-primary-600 text-white py-3 rounded-lg font-medium hover:bg-primary-700 transition-colors"
                                        >
                                            Add Opportunity
                                        </button>
                                        <button
                                            onClick={() => setShowAddOpportunity(false)}
                                            className="flex-1 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 py-3 rounded-lg font-medium hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Opportunities List */}
                            <div className="space-y-3">
                                {formData.opportunities.map(opportunity => (
                                    <div key={opportunity.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-gray-900 dark:text-gray-100">{opportunity.title || opportunity.name}</h4>
                                                <div className="flex items-center space-x-4 mt-2">
                                                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full">
                                                        {opportunity.stage}
                                                    </span>
                                                    {opportunity.value > 0 && (
                                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                            R{opportunity.value.toLocaleString()}
                                                        </span>
                                                    )}
                                                </div>
                                                {opportunity.expectedCloseDate && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                        <i className="fas fa-calendar w-4 mr-2"></i>
                                                        Expected: {new Date(opportunity.expectedCloseDate).toLocaleDateString()}
                                                    </p>
                                                )}
                                                {opportunity.notes && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{opportunity.notes}</p>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => removeOpportunity(opportunity.id)}
                                                className="text-red-500 hover:text-red-700 p-2"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {formData.opportunities.length === 0 && !showAddOpportunity && (
                                <div className="text-center py-8">
                                    <i className="fas fa-chart-line text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                                    <p className="text-gray-600 dark:text-gray-400">No opportunities added yet</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'projects' && (
                        <div className="space-y-4">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Projects</h3>
                            
                            <div className="space-y-3">
                                {formData.projectIds.map(projectId => {
                                    const project = allProjects?.find(p => p.id === projectId);
                                    return project ? (
                                        <div key={projectId} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                                            <h4 className="font-medium text-gray-900 dark:text-gray-100">{project.name}</h4>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{project.description}</p>
                                            <span className={`inline-block px-2 py-1 text-xs rounded-full mt-2 ${
                                                project.status === 'Active' 
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                            }`}>
                                                {project.status}
                                            </span>
                                        </div>
                                    ) : null;
                                })}
                            </div>

                            {formData.projectIds.length === 0 && (
                                <div className="text-center py-8">
                                    <i className="fas fa-project-diagram text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                                    <p className="text-gray-600 dark:text-gray-400">No projects linked yet</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.ClientDetailModalMobile = ClientDetailModalMobile;
