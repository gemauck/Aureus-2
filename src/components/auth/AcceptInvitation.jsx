// Accept Invitation Component
const { useState, useEffect } = React;

const AcceptInvitation = () => {
    const [token, setToken] = useState(null);
    const [invitation, setInvitation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    
    // Form fields
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPasswords, setShowPasswords] = useState({ password: false, confirm: false });
    const [phone, setPhone] = useState('');
    const [department, setDepartment] = useState('');
    const [jobTitle, setJobTitle] = useState('');

    // Get token from URL
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = urlParams.get('token');
        
        if (tokenParam) {
            setToken(tokenParam);
            validateInvitation(tokenParam);
        } else {
            setError('Invalid invitation link. No token provided.');
            setLoading(false);
        }
    }, []);

    const validateInvitation = async (inviteToken) => {
        try {
            setLoading(true);
            // Use full URL to avoid relative path issues
            const apiUrl = `/api/users/invitation-details?token=${encodeURIComponent(inviteToken)}`;
            const response = await fetch(apiUrl, {
                method: 'GET',
                credentials: 'include', // Include cookies for any session
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: `Server error: ${response.status}` } }));
                throw new Error(errorData.error?.message || `Failed to validate invitation (${response.status})`);
            }
            
            const result = await response.json();
            
            // Handle both direct response and wrapped response formats
            const invitationData = result.data?.invitation || result.invitation;
            
            if (invitationData) {
                setInvitation(invitationData);
                setName(invitationData.name || '');
            } else {
                setError(result.error?.message || result.data?.error?.message || 'Invalid or expired invitation link');
            }
        } catch (err) {
            setError('Failed to validate invitation. Please check your connection.');
            console.error('Validation error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        // Validation
        if (!name.trim()) {
            setError('Please enter your name');
            return;
        }
        
        if (!password) {
            setError('Please enter a password');
            return;
        }
        
        if (password.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }
        
        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        try {
            setSubmitting(true);
            const response = await fetch('/api/users/accept-invitation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token,
                    name: name.trim(),
                    password,
                    phone: phone.trim() || '',
                    department: department.trim() || '',
                    jobTitle: jobTitle.trim() || ''
                })
            });

            const result = await response.json();

            // Handle both direct response and wrapped response formats
            const success = result.success || (result.data && result.data.success);
            const errorMsg = result.error?.message || result.data?.error?.message;

            if (success || (result.data && result.data.success)) {
                setSuccess(true);
                // Redirect to login after 2 seconds
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
            } else {
                setError(errorMsg || 'Failed to create account. Please try again.');
            }
        } catch (err) {
            setError('Network error. Please check your connection and try again.');
            console.error('Submit error:', err);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 p-4">
                <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Validating invitation...</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-500 to-green-700 p-4">
                <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center">
                    <div className="mb-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-check text-green-600 text-2xl"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
                        <p className="text-gray-600 mb-4">Your account has been created successfully.</p>
                        <p className="text-sm text-gray-500">Redirecting to login...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error && !invitation) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-500 to-red-700 p-4">
                <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
                    <div className="text-center mb-6">
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                        </div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Invitation Invalid</h2>
                        <p className="text-gray-600">{error}</p>
                    </div>
                    <a 
                        href="/" 
                        className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
                    >
                        Go to Login
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white text-center">
                    <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="fas fa-envelope-open text-2xl"></i>
                    </div>
                    <h1 className="text-2xl font-bold mb-2">Accept Invitation</h1>
                    <p className="text-sm opacity-90">Create your account to join Abcotronics</p>
                </div>

                {/* Form */}
                <div className="p-6">
                    {invitation && (
                        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-gray-700">
                                <strong>Email:</strong> {invitation.email}
                            </p>
                            <p className="text-sm text-gray-700 mt-1">
                                <strong>Role:</strong> {invitation.role}
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Full Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter your full name"
                                required
                                disabled={submitting}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPasswords.password ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Enter a password (min. 8 characters)"
                                    required
                                    minLength={8}
                                    disabled={submitting}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords({ ...showPasswords, password: !showPasswords.password })}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    <i className={`fas ${showPasswords.password ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPasswords.confirm ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Confirm your password"
                                    required
                                    disabled={submitting}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                >
                                    <i className={`fas ${showPasswords.confirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Phone <span className="text-gray-500 text-xs">(optional)</span>
                            </label>
                            <input
                                type="tel"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter your phone number"
                                disabled={submitting}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Department <span className="text-gray-500 text-xs">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={department}
                                onChange={(e) => setDepartment(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter your department"
                                disabled={submitting}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Job Title <span className="text-gray-500 text-xs">(optional)</span>
                            </label>
                            <input
                                type="text"
                                value={jobTitle}
                                onChange={(e) => setJobTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter your job title"
                                disabled={submitting}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? (
                                <>
                                    <i className="fas fa-spinner fa-spin mr-2"></i>
                                    Creating Account...
                                </>
                            ) : (
                                'Create Account & Accept Invitation'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center">
                        <a 
                            href="/" 
                            className="text-sm text-gray-600 hover:text-gray-900"
                        >
                            Already have an account? Sign in
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make component available globally
try {
    window.AcceptInvitation = AcceptInvitation;
    if (window.debug && !window.debug.performanceMode) {
        console.log('✅ AcceptInvitation.jsx loaded and registered');
    }
} catch (error) {
    console.error('❌ AcceptInvitation.jsx: Error registering component:', error);
}

