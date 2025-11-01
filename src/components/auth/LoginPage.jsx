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
        e.stopPropagation();
        setError('');
        
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        try {
            setSubmitting(true);
            await login(email, password);
        } catch (err) {
            const errorMessage = err.message || 'Invalid credentials. Please try again.';
            setError(errorMessage);
        } finally {
            setSubmitting(false);
        }
    };

    // Mobile viewport and keyboard handling
    useEffect(() => {
        document.body.classList.add('login-page');
        
        // Dynamic viewport height calculation for mobile
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setViewportHeight();
        window.addEventListener('resize', setViewportHeight);
        window.addEventListener('orientationchange', () => {
            setTimeout(setViewportHeight, 100);
        });
        
        return () => {
            document.body.classList.remove('login-page');
            window.removeEventListener('resize', setViewportHeight);
            window.removeEventListener('orientationchange', setViewportHeight);
        };
    }, []);

    return (
        <>
            <style>{`
                /* ============================================
                   MODERN LOGIN PAGE - FULLY RESPONSIVE
                   Works on all devices from 320px to 4K
                   ============================================ */
                
                /* Base Reset */
                body.login-page,
                body.login-page * {
                    box-sizing: border-box;
                }
                
                body.login-page {
                    margin: 0;
                    padding: 0;
                    width: 100%;
                    min-height: 100vh;
                    min-height: 100dvh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    overflow-x: hidden;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                }
                
                body.login-page #root {
                    width: 100%;
                    min-height: 100vh;
                    min-height: 100dvh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                    margin: 0;
                }
                
                /* Hide all non-login elements */
                body.login-page header,
                body.login-page nav,
                body.login-page aside,
                body.login-page footer,
                body.login-page .sidebar,
                body.login-page [class*="MainLayout"],
                body.login-page [class*="overlay"],
                body.login-page [class*="modal"]:not(.login-modal),
                body.login-page #root > *:not(.login-wrapper) {
                    display: none !important;
                }
                
                /* Login Wrapper - Fully Responsive Container */
                .login-wrapper {
                    width: 100%;
                    min-height: 100vh;
                    min-height: 100dvh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: clamp(1rem, 4vw, 2rem);
                    padding-top: max(clamp(1rem, 4vw, 2rem), env(safe-area-inset-top));
                    padding-bottom: max(clamp(1rem, 4vw, 2rem), env(safe-area-inset-bottom));
                    padding-left: max(clamp(0.75rem, 3vw, 1.5rem), env(safe-area-inset-left));
                    padding-right: max(clamp(0.75rem, 3vw, 1.5rem), env(safe-area-inset-right));
                    position: relative;
                }
                
                /* Login Card - Dynamic Sizing */
                .login-card {
                    width: 100%;
                    max-width: min(calc(100vw - clamp(1.5rem, 6vw, 3rem)), 420px);
                    background: #ffffff;
                    border-radius: clamp(1rem, 4vw, 1.5rem);
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
                    overflow: hidden;
                    position: relative;
                    animation: slideUp 0.4s ease-out;
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Branding Header - Mobile Optimized */
                .login-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: clamp(1.5rem, 6vw, 2.5rem) clamp(1.25rem, 5vw, 2rem);
                    text-align: center;
                    color: #ffffff;
                }
                
                .login-brand {
                    font-size: clamp(1.75rem, 6vw, 2.5rem);
                    font-weight: 700;
                    margin: 0;
                    letter-spacing: -0.02em;
                    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                }
                
                /* Form Container */
                .login-form-container {
                    padding: clamp(1.5rem, 5vw, 2.5rem) clamp(1.25rem, 4vw, 2rem);
                }
                
                .login-title {
                    font-size: clamp(1.5rem, 5vw, 1.875rem);
                    font-weight: 700;
                    color: #1f2937;
                    margin: 0 0 0.5rem 0;
                    letter-spacing: -0.01em;
                }
                
                .login-subtitle {
                    font-size: clamp(0.875rem, 3vw, 1rem);
                    color: #6b7280;
                    margin: 0 0 clamp(1.5rem, 5vw, 2rem) 0;
                    line-height: 1.5;
                }
                
                /* Form Elements */
                .login-form {
                    display: flex;
                    flex-direction: column;
                    gap: clamp(1.25rem, 4vw, 1.5rem);
                }
                
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                
                .form-label {
                    font-size: clamp(0.875rem, 3vw, 0.9375rem);
                    font-weight: 600;
                    color: #374151;
                    display: block;
                }
                
                /* Input Fields - Touch Optimized */
                .form-input {
                    width: 100%;
                    font-size: 16px; /* Prevents iOS zoom */
                    padding: clamp(0.875rem, 3vw, 1rem) clamp(0.875rem, 3vw, 1.125rem);
                    border: 2px solid #e5e7eb;
                    border-radius: clamp(0.5rem, 2vw, 0.75rem);
                    background: #ffffff;
                    color: #1f2937;
                    transition: all 0.2s ease;
                    -webkit-appearance: none;
                    appearance: none;
                    touch-action: manipulation;
                    min-height: 48px;
                    line-height: 1.5;
                }
                
                .form-input:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                }
                
                .form-input::placeholder {
                    color: #9ca3af;
                }
                
                /* Password Input Wrapper */
                .password-wrapper {
                    position: relative;
                }
                
                .password-toggle {
                    position: absolute;
                    right: clamp(0.75rem, 3vw, 1rem);
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    color: #6b7280;
                    cursor: pointer;
                    padding: 0.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    touch-action: manipulation;
                    min-width: 44px;
                    min-height: 44px;
                    transition: color 0.2s ease;
                }
                
                .password-toggle:hover,
                .password-toggle:active {
                    color: #374151;
                }
                
                /* Error Message */
                .error-message {
                    padding: clamp(0.75rem, 3vw, 1rem);
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: clamp(0.5rem, 2vw, 0.75rem);
                    color: #dc2626;
                    font-size: clamp(0.875rem, 3vw, 0.9375rem);
                    line-height: 1.5;
                    margin: 0;
                }
                
                /* Submit Button */
                .submit-button {
                    width: 100%;
                    padding: clamp(0.875rem, 3vw, 1rem) clamp(1.25rem, 4vw, 1.5rem);
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: #ffffff;
                    border: none;
                    border-radius: clamp(0.5rem, 2vw, 0.75rem);
                    font-size: clamp(0.9375rem, 3vw, 1rem);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    touch-action: manipulation;
                    min-height: 52px;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }
                
                .submit-button:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
                }
                
                .submit-button:active:not(:disabled) {
                    transform: translateY(0);
                }
                
                .submit-button:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                }
                
                /* Forgot Password Link */
                .forgot-password {
                    text-align: center;
                    margin-top: -0.5rem;
                }
                
                .forgot-link {
                    font-size: clamp(0.875rem, 3vw, 0.9375rem);
                    color: #667eea;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0.5rem;
                    text-decoration: underline;
                    touch-action: manipulation;
                }
                
                .forgot-link:hover,
                .forgot-link:active {
                    color: #764ba2;
                }
                
                /* Forgot Password Form */
                .forgot-form {
                    margin-top: 1rem;
                    padding: clamp(1rem, 4vw, 1.5rem);
                    background: #f9fafb;
                    border-radius: clamp(0.5rem, 2vw, 0.75rem);
                    border: 1px solid #e5e7eb;
                    animation: slideDown 0.3s ease-out;
                }
                
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                /* Desktop Styles */
                @media (min-width: 768px) {
                    .login-card {
                        max-width: 480px;
                        display: grid;
                        grid-template-columns: 1fr 1.2fr;
                        border-radius: clamp(1rem, 2vw, 1.5rem);
                    }
                    
                    .login-header {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        padding: clamp(2rem, 5vw, 3rem);
                    }
                    
                    .login-form-container {
                        padding: clamp(2rem, 5vw, 3rem);
                    }
                }
                
                /* Large Desktop */
                @media (min-width: 1024px) {
                    .login-card {
                        max-width: 520px;
                    }
                }
                
                /* Landscape Mobile */
                @media (max-height: 600px) and (orientation: landscape) {
                    .login-wrapper {
                        padding-top: 0.5rem;
                        padding-bottom: 0.5rem;
                    }
                    
                    .login-header {
                        padding: 1rem;
                    }
                    
                    .login-brand {
                        font-size: 1.5rem;
                    }
                    
                    .login-form-container {
                        padding: 1.25rem;
                    }
                    
                    .login-form {
                        gap: 1rem;
                    }
                }
                
                /* Very Small Devices (iPhone SE, etc.) */
                @media (max-width: 360px) {
                    .login-wrapper {
                        padding: 0.75rem;
                    }
                    
                    .login-card {
                        border-radius: 0.875rem;
                    }
                    
                    .login-header {
                        padding: 1.25rem 1rem;
                    }
                    
                    .login-form-container {
                        padding: 1.25rem 1rem;
                    }
                }
                
                /* High DPI Displays */
                @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
                    .login-card {
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(255, 255, 255, 0.15);
                    }
                }
            `}</style>
            
            <div className="login-wrapper">
                <div className="login-card login-modal">
                    {/* Header */}
                    <div className="login-header">
                        <h1 className="login-brand">Abcotronics</h1>
                    </div>
                    
                    {/* Form */}
                    <div className="login-form-container">
                        <h2 className="login-title">Welcome Back</h2>
                        <p className="login-subtitle">Sign in to continue to your account</p>
                        
                        <form onSubmit={handleSubmit} className="login-form">
                            {error && (
                                <div className="error-message" role="alert">
                                    {error}
                                </div>
                            )}
                            
                            <div className="form-group">
                                <label htmlFor="email" className="form-label">
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="form-input"
                                    placeholder="you@company.com"
                                    required
                                />
                            </div>
                            
                            <div className="form-group">
                                <label htmlFor="password" className="form-label">
                                    Password
                                </label>
                                <div className="password-wrapper">
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        name="password"
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="form-input"
                                        placeholder="Enter your password"
                                        required
                                        style={{ paddingRight: '3rem' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="password-toggle"
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                    </button>
                                </div>
                            </div>
                            
                            <button
                                type="submit"
                                disabled={submitting}
                                className="submit-button"
                            >
                                {submitting ? 'Signing In...' : 'Sign In'}
                            </button>
                            
                            <div className="forgot-password">
                                <button
                                    type="button"
                                    onClick={() => setShowForgot(!showForgot)}
                                    className="forgot-link"
                                >
                                    {showForgot ? 'Hide' : 'Forgot password?'}
                                </button>
                            </div>
                            
                            {showForgot && (
                                <div className="forgot-form">
                                    <label htmlFor="resetEmail" className="form-label">
                                        Enter your email
                                    </label>
                                    <input
                                        id="resetEmail"
                                        type="email"
                                        value={resetEmail}
                                        onChange={(e) => setResetEmail(e.target.value)}
                                        className="form-input"
                                        placeholder="you@company.com"
                                        style={{ marginBottom: '0.75rem' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            setResetStatus('');
                                            if (!resetEmail) {
                                                setResetStatus('Please enter your email');
                                                return;
                                            }
                                            try {
                                                await window.api.requestPasswordReset(resetEmail);
                                                setResetStatus('If the email exists, a reset link has been sent.');
                                            } catch (e) {
                                                setResetStatus('If the email exists, a reset link has been sent.');
                                            }
                                        }}
                                        className="submit-button"
                                        style={{ marginTop: '0.5rem' }}
                                    >
                                        Send Reset Link
                                    </button>
                                    {resetStatus && (
                                        <p style={{ 
                                            marginTop: '0.75rem', 
                                            fontSize: '0.875rem', 
                                            color: '#059669',
                                            textAlign: 'center'
                                        }}>
                                            {resetStatus}
                                        </p>
                                    )}
                                </div>
                            )}
                        </form>
                    </div>
                </div>
            </div>
        </>
    );
};

// Make available globally
window.LoginPage = LoginPage;
