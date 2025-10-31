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
    const [showForgot, setShowForgot] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetStatus, setResetStatus] = useState('');

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


    // Add mobile-specific body class on mount
    useEffect(() => {
        document.body.classList.add('login-page');
        return () => {
            document.body.classList.remove('login-page');
        };
    }, []);

    return (
        <div className="login-outer" style={{ 
            minHeight: '100dvh',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            boxSizing: 'border-box'
        }}>
            <style>{`
                /* Critical: Reset everything for mobile login */
                @media (max-width: 768px) {
                    * {
                        box-sizing: border-box !important;
                    }
                    
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: 100% !important;
                        overflow-x: hidden !important;
                        position: relative !important;
                        -webkit-text-size-adjust: 100% !important;
                        -ms-text-size-adjust: 100% !important;
                    }
                    
                    #root {
                        width: 100% !important;
                        min-height: 100vh !important;
                        min-height: 100dvh !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow-x: hidden !important;
                    }
                    
                    .login-outer {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-height: 100vh !important;
                        min-height: 100dvh !important;
                        padding: 0.5rem !important;
                        margin: 0 !important;
                        display: flex !important;
                        align-items: flex-start !important;
                        justify-content: center !important;
                        padding-top: 2rem !important;
                        padding-bottom: 2rem !important;
                        background: linear-gradient(to bottom right, #3b82f6, #1e40af) !important;
                        position: relative !important;
                        overflow-y: auto !important;
                        -webkit-overflow-scrolling: touch !important;
                    }
                    
                    .login-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 auto !important;
                        border-radius: 1rem !important;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
                        overflow: visible !important;
                        position: relative !important;
                        z-index: 1 !important;
                    }
                    
                    .login-form-wrapper {
                        padding: 1.5rem !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                    }
                    
                    .login-form-wrapper h2 {
                        font-size: 1.5rem !important;
                        margin-bottom: 0.5rem !important;
                        line-height: 1.2 !important;
                    }
                    
                    .login-form-wrapper p {
                        font-size: 0.875rem !important;
                        margin-bottom: 1.5rem !important;
                    }
                    
                    /* Critical: Input fields must be large and visible */
                    .login-form-wrapper input[type="email"],
                    .login-form-wrapper input[type="password"],
                    .login-form-wrapper input[type="text"] {
                        font-size: 16px !important;
                        min-height: 50px !important;
                        height: 50px !important;
                        padding: 14px 16px !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        -webkit-appearance: none !important;
                        appearance: none !important;
                        border-radius: 0.5rem !important;
                        border: 2px solid #d1d5db !important;
                        box-sizing: border-box !important;
                        display: block !important;
                        margin: 0 !important;
                        background: #ffffff !important;
                        color: #000000 !important;
                        line-height: 1.5 !important;
                        -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1) !important;
                    }
                    
                    .login-form-wrapper input:focus {
                        outline: none !important;
                        border-color: #3b82f6 !important;
                        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                    }
                    
                    /* Buttons must be large and touchable */
                    .login-form-wrapper button[type="submit"],
                    .login-form-wrapper button[type="button"]:not(.text-xs) {
                        min-height: 50px !important;
                        height: auto !important;
                        font-size: 16px !important;
                        padding: 14px 20px !important;
                        touch-action: manipulation !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1) !important;
                        cursor: pointer !important;
                        border: none !important;
                        border-radius: 0.5rem !important;
                    }
                    
                    .login-form-wrapper label {
                        font-size: 15px !important;
                        margin-bottom: 8px !important;
                        display: block !important;
                        font-weight: 600 !important;
                        color: #374151 !important;
                        line-height: 1.4 !important;
                    }
                    
                    .login-branding {
                        display: flex !important;
                        justify-content: center !important;
                        align-items: center !important;
                        padding: 1.25rem 1rem !important;
                        margin-bottom: 0 !important;
                        width: 100% !important;
                    }
                    
                    .login-branding h1 {
                        font-size: 1.5rem !important;
                        color: #ffffff !important;
                        margin: 0 !important;
                        font-weight: 700 !important;
                    }
                    
                    /* Form spacing */
                    .login-form-wrapper form {
                        margin-top: 0 !important;
                        width: 100% !important;
                    }
                    
                    .login-form-wrapper form > div {
                        margin-bottom: 1.25rem !important;
                    }
                    
                    /* Error messages */
                    .login-form-wrapper .bg-red-50 {
                        padding: 12px 16px !important;
                        font-size: 14px !important;
                        line-height: 1.5 !important;
                        margin-bottom: 1rem !important;
                    }
                    
                    /* Forgot password link */
                    .login-form-wrapper .text-xs {
                        font-size: 14px !important;
                        padding: 8px 0 !important;
                        min-height: 44px !important;
                        display: inline-block !important;
                        touch-action: manipulation !important;
                    }
                }
                
                /* Very small devices */
                @media (max-width: 375px) {
                    .login-outer {
                        padding: 0.25rem !important;
                        padding-top: 1rem !important;
                    }
                    
                    .login-form-wrapper {
                        padding: 1.25rem !important;
                    }
                    
                    .login-branding {
                        padding: 1rem 0.75rem !important;
                    }
                    
                    .login-branding h1 {
                        font-size: 1.25rem !important;
                    }
                    
                    .login-form-wrapper h2 {
                        font-size: 1.25rem !important;
                    }
                }
                
                /* Landscape orientation on mobile */
                @media (max-width: 768px) and (orientation: landscape) {
                    .login-outer {
                        padding-top: 0.5rem !important;
                        padding-bottom: 0.5rem !important;
                    }
                    
                    .login-branding {
                        padding: 0.75rem 1rem !important;
                    }
                    
                    .login-branding h1 {
                        font-size: 1.25rem !important;
                    }
                }
                
                /* Ensure all inputs are interactive */
                .login-outer input,
                .login-outer button {
                    -webkit-user-select: text !important;
                    user-select: text !important;
                    pointer-events: auto !important;
                    touch-action: manipulation !important;
                    -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1) !important;
                }
                
                /* Prevent zoom on input focus - CRITICAL for iOS */
                @media screen and (max-width: 768px) {
                    input[type="text"],
                    input[type="email"],
                    input[type="password"],
                    input[type="tel"],
                    input[type="number"],
                    textarea,
                    select {
                        font-size: 16px !important;
                    }
                }
                
                /* Body fixes for login page */
                body.login-page {
                    position: relative !important;
                    width: 100% !important;
                    height: 100% !important;
                    overflow-x: hidden !important;
                    -webkit-overflow-scrolling: touch !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                body.login-page #root {
                    width: 100% !important;
                    min-height: 100vh !important;
                    min-height: 100dvh !important;
                    overflow-x: hidden !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
            `}</style>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl overflow-hidden login-container" style={{ width: '100%', maxWidth: '100%', margin: '0 auto' }}>
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
                                <div className="mt-3 text-right">
                                    <button type="button" onClick={() => setShowForgot(v => !v)} className="text-xs text-blue-600 hover:underline">
                                        {showForgot ? 'Hide' : 'Forgot password?'}
                                    </button>
                                </div>

                                {showForgot && (
                                    <div className="mt-4 p-3 border rounded-md bg-gray-50">
                                        <label htmlFor="resetEmail" className="block text-xs font-medium text-gray-700 mb-1.5">Enter your email</label>
                                        <input
                                            id="resetEmail"
                                            type="email"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="you@company.com"
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setResetStatus('');
                                                if (!resetEmail) { setResetStatus('Please enter your email'); return; }
                                                try {
                                                    await window.api.requestPasswordReset(resetEmail);
                                                    setResetStatus('If the email exists, a reset link has been sent.');
                                                } catch (e) {
                                                    setResetStatus('If the email exists, a reset link has been sent.');
                                                }
                                            }}
                                            className="mt-2 w-full bg-gray-800 text-white py-2 text-sm rounded-lg hover:bg-gray-900"
                                        >
                                            Send reset link
                                        </button>
                                        {resetStatus && (
                                            <div className="mt-2 text-xs text-gray-700">{resetStatus}</div>
                                        )}
                                    </div>
                                )}

                            </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.LoginPage = LoginPage;
