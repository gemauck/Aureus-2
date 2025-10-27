// Password Display Modal Component
const { useState, useEffect } = React;

const PasswordDisplayModal = ({ email, password, onClose }) => {
    const [copied, setCopied] = useState(false);

    const copyToClipboard = () => {
        navigator.clipboard.writeText(password).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            User Created Successfully
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <p className="text-sm text-green-800 mb-2">
                                <i className="fas fa-check-circle mr-2"></i>
                                A temporary password has been generated for this user.
                            </p>
                            <p className="text-sm text-green-700">
                                Please share this password securely with the user. They will be required to change it on their first login.
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Email
                            </label>
                            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900">
                                {email}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Temporary Password
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono text-gray-900 break-all">
                                    {password}
                                </div>
                                <button
                                    onClick={copyToClipboard}
                                    className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                                        copied
                                            ? 'bg-green-600 text-white'
                                            : 'bg-primary-600 text-white hover:bg-primary-700'
                                    }`}
                                >
                                    {copied ? (
                                        <span><i className="fas fa-check mr-2"></i>Copied!</span>
                                    ) : (
                                        <span><i className="fas fa-copy mr-2"></i>Copy</span>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-xs text-blue-800">
                                <i className="fas fa-info-circle mr-2"></i>
                                <strong>Security Note:</strong> This is the only time this password will be shown. Make sure to copy it before closing this dialog.
                            </p>
                        </div>

                        <div className="pt-4">
                            <button
                                onClick={onClose}
                                className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.PasswordDisplayModal = PasswordDisplayModal;

