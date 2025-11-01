// Get React hooks from window
const { useState, useEffect } = React;

const ResetPassword = () => {
    const [token, setToken] = useState('');
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPasswords, setShowPasswords] = useState({ password: false, confirm: false });
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const t = urlParams.get('token') || '';
        setToken(t);
    }, []);

    const onSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setStatus('');
        if (!password || !confirm) { setError('Enter and confirm your new password'); return; }
        if (password !== confirm) { setError('Passwords do not match'); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
        try {
            setSubmitting(true);
            await window.api.resetPassword(token, password);
            setStatus('Password updated. You can now sign in.');
            setTimeout(() => { window.location.href = '/'; }, 1500);
        } catch (e) {
            setError(e.message || 'Failed to reset password');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 p-4" style={{ minHeight: '100dvh' }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-6 sm:p-8">
                    <div className="mb-6 text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-1">Reset Password</h2>
                        <p className="text-sm text-gray-600">Choose a new password for your account</p>
                    </div>
                    <form onSubmit={onSubmit} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</div>
                        )}
                        {status && (
                            <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded text-sm">{status}</div>
                        )}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">New Password</label>
                            <div className="relative">
                                <input type={showPasswords.password ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="••••••••" />
                                <button type="button" onClick={() => setShowPasswords({ ...showPasswords, password: !showPasswords.password })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                                    <i className={`fas ${showPasswords.password ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Confirm Password</label>
                            <div className="relative">
                                <input type={showPasswords.confirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="••••••••" />
                                <button type="button" onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700">
                                    <i className={`fas ${showPasswords.confirm ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>
                        <button type="submit" disabled={submitting} className={`w-full bg-blue-600 text-white py-3 text-sm rounded-lg transition font-medium ${submitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'}`}>
                            {submitting ? 'Updating…' : 'Update Password'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.ResetPassword = ResetPassword;


