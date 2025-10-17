// Get dependencies from window
const { useState } = React;

const InviteUserModal = ({ onClose, onSave, roleDefinitions, departments }) => {
    const [formData, setFormData] = useState({
        email: '',
        role: 'team_member',
        department: '',
        message: ''
    });

    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.email || !formData.role) {
            alert('Please fill in all required fields');
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            alert('Please enter a valid email address');
            return;
        }

        setIsLoading(true);
        
        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            onSave(formData);
        } catch (error) {
            console.error('Error sending invitation:', error);
            alert('Failed to send invitation. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const getRoleDescription = () => {
        const role = roleDefinitions[formData.role];
        return role ? role.description : '';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">
                            <i className="fas fa-envelope text-green-600 mr-2"></i>
                            Invite New User
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Send an invitation email to create a new user account
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-3">
                    {/* Email Address */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            placeholder="john.doe@example.com"
                            required
                            disabled={isLoading}
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                            The user will receive an invitation email at this address
                        </p>
                    </div>

                    {/* Role Selection */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Role <span className="text-red-500">*</span>
                        </label>
                        <select
                            value={formData.role}
                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            required
                            disabled={isLoading}
                        >
                            {Object.entries(roleDefinitions).map(([key, role]) => (
                                <option key={key} value={key}>
                                    {role.name} - {role.description}
                                </option>
                            ))}
                        </select>
                        {formData.role && (
                            <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                                <p className="text-xs text-blue-800 font-medium">
                                    <i className="fas fa-info-circle mr-1"></i>
                                    {getRoleDescription()}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Department */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Department
                        </label>
                        <select
                            value={formData.department}
                            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            disabled={isLoading}
                        >
                            <option value="">Select Department (Optional)</option>
                            {departments.sort((a, b) => a.localeCompare(b)).map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>
                    </div>

                    {/* Custom Message */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Personal Message (Optional)
                        </label>
                        <textarea
                            value={formData.message}
                            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            rows="3"
                            placeholder="Add a personal message to the invitation email..."
                            disabled={isLoading}
                        />
                        <p className="text-[10px] text-gray-500 mt-1">
                            This message will be included in the invitation email
                        </p>
                    </div>

                    {/* Invitation Preview */}
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                        <h4 className="text-xs font-semibold text-gray-700 mb-2">
                            <i className="fas fa-eye mr-1"></i>
                            Invitation Preview
                        </h4>
                        <div className="text-xs text-gray-600 space-y-1">
                            <p><strong>To:</strong> {formData.email || 'email@example.com'}</p>
                            <p><strong>Role:</strong> {roleDefinitions[formData.role]?.name || 'Role'}</p>
                            {formData.department && <p><strong>Department:</strong> {formData.department}</p>}
                            <p><strong>Expires:</strong> 7 days from now</p>
                            {formData.message && (
                                <div className="mt-2 p-2 bg-white rounded border-l-2 border-blue-500">
                                    <p className="text-xs text-gray-700 italic">"{formData.message}"</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <i className="fas fa-spinner fa-spin mr-1"></i>
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-paper-plane mr-1"></i>
                                    Send Invitation
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.InviteUserModal = InviteUserModal;
