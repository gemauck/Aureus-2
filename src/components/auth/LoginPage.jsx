// Get React hooks from window
const { useState, useEffect } = React;

// Get useAuth from window
const useAuth = window.useAuth;
const storage = window.storage;

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
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


    // Add mobile-specific body class on mount and handle viewport fixes
    useEffect(() => {
        document.body.classList.add('login-page');
        
        // Fix viewport height on mobile when keyboard appears
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', setViewportHeight);
        
        // Prevent body scroll on mobile but allow login-outer scroll
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        
        return () => {
            document.body.classList.remove('login-page');
            document.body.style.overflow = originalOverflow;
            window.removeEventListener('resize', setViewportHeight);
            window.removeEventListener('orientationchange', setViewportHeight);
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
            boxSizing: 'border-box',
            background: 'linear-gradient(to bottom right, #3b82f6, #1e40af)'
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
                        height: 100dvh !important;
                        overflow-x: hidden !important;
                        position: relative !important;
                        -webkit-text-size-adjust: 100% !important;
                        -ms-text-size-adjust: 100% !important;
                        background: linear-gradient(to bottom right, #3b82f6, #1e40af) !important;
                    }
                    
                    #root {
                        width: 100% !important;
                        min-height: 100vh !important;
                        min-height: 100dvh !important;
                        height: 100vh !important;
                        height: 100dvh !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow-x: hidden !important;
                        overflow-y: auto !important;
                        -webkit-overflow-scrolling: touch !important;
                        background: linear-gradient(to bottom right, #3b82f6, #1e40af) !important;
                        position: relative !important;
                        display: flex !important;
                        flex-direction: column !important;
                    }
                    
                    .login-outer {
                        width: 100% !important;
                        max-width: 100% !important;
                        min-height: 100vh !important;
                        min-height: 100dvh !important;
                        min-height: calc(var(--vh, 1vh) * 100) !important;
                        height: 100vh !important;
                        height: 100dvh !important;
                        height: calc(var(--vh, 1vh) * 100) !important;
                        padding: 1rem !important;
                        padding-top: max(1rem, env(safe-area-inset-top)) !important;
                        padding-bottom: max(1rem, env(safe-area-inset-bottom)) !important;
                        padding-left: max(1rem, env(safe-area-inset-left)) !important;
                        padding-right: max(1rem, env(safe-area-inset-right)) !important;
                        margin: 0 !important;
                        display: flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        background: linear-gradient(to bottom right, #3b82f6, #1e40af) !important;
                        position: relative !important;
                        overflow-y: auto !important;
                        -webkit-overflow-scrolling: touch !important;
                        z-index: 1 !important;
                    }
                    
                    .login-container {
                        width: 100% !important;
                        max-width: 420px !important;
                        margin: 0 auto !important;
                        border-radius: 1rem !important;
                        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1) !important;
                        overflow: visible !important;
                        position: relative !important;
                        z-index: 10 !important;
                        background: white !important;
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
                        transform: none !important;
                    }
                    
                    .login-form-wrapper {
                        padding: 1.5rem !important;
                        padding-top: 1.25rem !important;
                        width: 100% !important;
                        box-sizing: border-box !important;
                        display: block !important;
                        visibility: visible !important;
                        opacity: 1 !important;
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
                        min-height: 52px !important;
                        height: 52px !important;
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
                        opacity: 1 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                    }
                    
                    .login-form-wrapper input:focus {
                        outline: none !important;
                        border-color: #3b82f6 !important;
                        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
                    }
                    
                    /* Buttons must be large and touchable */
                    .login-form-wrapper button[type="submit"],
                    .login-form-wrapper button[type="button"]:not(.text-xs) {
                        min-height: 52px !important;
                        height: auto !important;
                        font-size: 16px !important;
                        font-weight: 600 !important;
                        padding: 14px 20px !important;
                        touch-action: manipulation !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        box-sizing: border-box !important;
                        -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1) !important;
                        cursor: pointer !important;
                        border: none !important;
                        border-radius: 0.5rem !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                        display: block !important;
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
                        padding-top: max(0.5rem, env(safe-area-inset-top)) !important;
                        padding-bottom: max(0.5rem, env(safe-area-inset-bottom)) !important;
                        align-items: center !important;
                    }
                    
                    .login-branding {
                        padding: 0.75rem 1rem !important;
                    }
                    
                    .login-branding h1 {
                        font-size: 1.25rem !important;
                    }
                    
                    .login-container {
                        max-width: 500px !important;
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
                    height: 100vh !important;
                    height: 100dvh !important;
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                    -webkit-overflow-scrolling: touch !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    background: linear-gradient(to bottom right, #3b82f6, #1e40af) !important;
                }
                
                body.login-page #root {
                    width: 100% !important;
                    min-height: 100vh !important;
                    min-height: 100dvh !important;
                    height: 100vh !important;
                    height: 100dvh !important;
                    overflow-x: hidden !important;
                    overflow-y: auto !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    display: flex !important;
                    flex-direction: column !important;
                    background: linear-gradient(to bottom right, #3b82f6, #1e40af) !important;
                    position: relative !important;
                }
                
                /* Ensure login page elements are always visible */
                body.login-page .login-outer,
                body.login-page .login-container,
                body.login-page .login-form-wrapper {
                    display: flex !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                }
                
                body.login-page .login-container {
                    display: block !important;
                }
                
                /* Hide any overlay elements that might cover login */
                body.login-page .overlay,
                body.login-page .modal-backdrop,
                body.login-page [class*="backdrop"],
                body.login-page [class*="overlay"] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    z-index: -1 !important;
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
                                    <div className="relative">
                                        <input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            name="password"
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                                        >
                                            <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                        </button>
                                    </div>
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
