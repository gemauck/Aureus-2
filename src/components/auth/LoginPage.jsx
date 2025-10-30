// Get React hooks from window
const { useState, useEffect } = React;

// Get useAuth from window
const useAuth = window.useAuth;
const storage = window.storage;

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        try {
            setSubmitting(true);
            await login(email, password);
        } catch (err) {
            setError('Invalid credentials');
        } finally {
            setSubmitting(false);
        }
    };


    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 p-4" style={{ minHeight: '100dvh' }}>
            <style>{`
                /* Mobile-specific login page fixes */
                @media (max-width: 768px) {
                    .login-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        padding: 1rem !important;
                    }
                    
                    .login-form-wrapper {
                        padding: 1.5rem !important;
                    }
                    
                    .login-form-wrapper input,
                    .login-form-wrapper textarea,
                    .login-form-wrapper select {
                        font-size: 16px !important;
                        min-height: 48px !important;
                        padding: 14px 16px !important;
                        -webkit-appearance: none;
                        appearance: none;
                    }
                    
                    .login-form-wrapper button {
                        min-height: 48px !important;
                        font-size: 16px !important;
                        padding: 14px 18px !important;
                        touch-action: manipulation;
                    }
                    
                    .login-form-wrapper label {
                        font-size: 14px !important;
                        margin-bottom: 8px !important;
                        display: block !important;
                    }
                    
                    .login-branding {
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        padding: 2rem 1rem !important;
                        margin-bottom: 1rem !important;
                    }
                    
                    .login-branding h1 {
                        font-size: 2rem !important;
                        color: #ffffff !important;
                    }
                }
                
                /* Ensure login form is interactive on mobile */
                #root > div input,
                #root > div button {
                    -webkit-user-select: text;
                    user-select: text;
                    pointer-events: auto;
                    touch-action: manipulation;
                }
                
                /* Prevent body scroll issues on mobile */
                body.login-page {
                    position: fixed !important;
                    width: 100% !important;
                    height: 100% !important;
                    overflow: hidden !important;
                }
                
                body.login-page #root {
                    width: 100% !important;
                    height: 100% !important;
                    overflow: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                }
            `}</style>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden login-container">
                <div className="grid md:grid-cols-2">
                    {/* Left Side - Branding */}
                    <div className="hidden md:flex bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white flex-col justify-center items-center text-center">
                        <style>{`#loginBrand,.login-brand{color:#ffffff !important;text-align:center !important;}`}</style>
                        <div className="mb-8 w-full flex justify-center">
                            <h1 id="loginBrand" className="login-brand text-3xl font-bold mb-2">Abcotronics</h1>
                        </div>
                    </div>
                    
                    {/* Mobile Branding - visible on mobile */}
                    <div className="md:hidden bg-gradient-to-br from-blue-600 to-blue-800 p-6 text-white text-center login-branding">
                        <h1 className="login-brand text-3xl font-bold">Abcotronics</h1>
                    </div>

                    {/* Right Side - Login */}
                    <div className="p-6 sm:p-8 login-form-wrapper">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome</h2>
                            <p className="text-sm text-gray-600">Sign in to access your dashboard</p>
                        </div>

                        {/* Email Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Email Address
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="you@company.com"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Password
                                    </label>
                                    <input
                                        id="password"
                                        type="password"
                                        name="password"
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="••••••••"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className={`w-full bg-blue-600 text-white py-3 text-sm rounded-lg transition font-medium ${submitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                                >
                                    {submitting ? 'Signing In…' : 'Sign In'}
                                </button>
                                
                                
                            </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.LoginPage = LoginPage;
