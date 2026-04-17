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
    const [rememberMe, setRememberMe] = useState(true);
    const { login } = useAuth();
    const [showForgot, setShowForgot] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetStatus, setResetStatus] = useState('');

    // Load last used email on mount
    useEffect(() => {
        try {
            // Check if localStorage is available
            const testKey = 'abcotronics_storage_test';
            try {
                localStorage.setItem(testKey, 'test');
                localStorage.removeItem(testKey);
            } catch (storageErr) {
                console.info('💡 Note: localStorage is not available. "Remember me" will work within this session, but may not persist (this is normal in incognito/private mode). Browser password managers will still work normally.');
            }
            
            const lastEmail = storage?.getLastLoginEmail?.();
            if (lastEmail) {
                setEmail(lastEmail);
            }
        } catch (err) {
            // localStorage might not be available (e.g., incognito mode, privacy settings)
            // This is not an error - browser password manager will still work
        }
    }, []);

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
            // Optional redirect (e.g. public Job Card app sets sessionStorage before navigating to login)
            try {
                const next = sessionStorage.getItem('redirectAfterLogin');
                if (
                    next &&
                    typeof next === 'string' &&
                    next.startsWith('/') &&
                    !next.startsWith('//')
                ) {
                    sessionStorage.removeItem('redirectAfterLogin');
                    window.location.assign(next);
                    return;
                }
            } catch (_) {
                /* ignore */
            }
            // Save email for next time if remember me is checked, otherwise clear it
            try {
                if (rememberMe && storage?.setLastLoginEmail) {
                    storage.setLastLoginEmail(email);
                } else if (storage?.setLastLoginEmail) {
                    storage.setLastLoginEmail(null); // Clear saved email
                }
            } catch (storageErr) {
                // localStorage might not be available (e.g., incognito mode)
                // This is not critical - browser password manager will still work
                console.warn('Could not save email preference (this is normal in incognito mode):', storageErr);
            }
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
        
        // Dynamic viewport height calculation for mobile (iPhone 13 and similar)
        const setViewportHeight = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
            
            // iPhone 13 specific: Ensure proper height calculation
            // Account for safe area insets on notched devices
            const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)') || '0', 10);
            const safeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)') || '0', 10);
            const availableHeight = window.innerHeight - safeAreaTop - safeAreaBottom;
            const adjustedVh = availableHeight * 0.01;
            document.documentElement.style.setProperty('--vh-adjusted', `${adjustedVh}px`);
        };
        
        setViewportHeight();
        
        // Handle resize events
        const handleResize = () => {
            setViewportHeight();
        };
        
        // Handle orientation changes (with delay for iOS)
        const handleOrientationChange = () => {
            setTimeout(() => {
                setViewportHeight();
            }, 150);
        };
        
        // Handle visual viewport changes (keyboard show/hide on iOS)
        const handleVisualViewportChange = () => {
            if (window.visualViewport) {
                setViewportHeight();
            }
        };
        
        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);
        
        // Visual viewport API for better keyboard handling on iOS
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', handleVisualViewportChange);
            window.visualViewport.addEventListener('scroll', handleVisualViewportChange);
        }
        
        return () => {
            document.body.classList.remove('login-page');
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleOrientationChange);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', handleVisualViewportChange);
                window.visualViewport.removeEventListener('scroll', handleVisualViewportChange);
            }
        };
    }, []);

    return (
        <>
            <style>{`
                body.login-page,
                body.login-page * {
                    box-sizing: border-box;
                }

                body.login-page {
                    margin: 0;
                    width: 100%;
                    min-height: 100vh;
                    min-height: 100dvh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    overflow-x: hidden;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                    background-color: #f4f7fb;
                    background-image:
                        radial-gradient(ellipse 120% 80% at 50% -20%, rgba(37, 99, 235, 0.14), transparent 55%),
                        radial-gradient(ellipse 80% 60% at 100% 50%, rgba(59, 130, 246, 0.1), transparent 50%),
                        radial-gradient(ellipse 60% 50% at 0% 80%, rgba(14, 165, 233, 0.07), transparent 45%),
                        linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%);
                    font-family: 'DM Sans', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
                }

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

                .login-wrapper {
                    width: 100%;
                    min-height: 100vh;
                    min-height: 100dvh;
                    min-height: calc(var(--vh, 1vh) * 100);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: max(1rem, env(safe-area-inset-top)) max(1rem, env(safe-area-inset-right))
                        max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));
                }

                .login-card {
                    width: 100%;
                    max-width: 460px;
                    background: rgba(255, 255, 255, 0.92);
                    border-radius: 1.35rem;
                    border: 1px solid rgba(226, 232, 240, 0.95);
                    box-shadow:
                        0 0 0 1px rgba(255, 255, 255, 0.7) inset,
                        0 24px 50px -12px rgba(15, 23, 42, 0.14),
                        0 12px 24px -8px rgba(79, 70, 229, 0.12);
                    padding: clamp(1.25rem, 3.5vw, 2.25rem);
                    animation: fadeInUp 0.32s cubic-bezier(0.22, 1, 0.36, 1);
                    backdrop-filter: blur(12px);
                }

                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(12px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .login-title {
                    margin: 0;
                    font-size: clamp(1.5rem, 4.6vw, 2rem);
                    font-weight: 750;
                    color: #111827;
                    letter-spacing: -0.02em;
                    text-align: center;
                    font-family: 'Outfit', 'DM Sans', ui-sans-serif, system-ui, sans-serif;
                }

                .login-brand-subtitle {
                    margin: 0.3rem 0 1.5rem;
                    text-align: center;
                    font-size: 0.86rem;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    color: #2563eb;
                    text-transform: uppercase;
                }

                .login-slogan {
                    margin: 0.25rem 0 0;
                    text-align: center;
                    font-size: 0.9rem;
                    color: #4b5563;
                    font-style: italic;
                }

                .login-subtitle {
                    margin: 0 0 1.5rem;
                    color: #6b7280;
                    text-align: center;
                    font-size: 0.95rem;
                }

                .login-form {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }

                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }

                .form-label {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #374151;
                }

                .form-input {
                    width: 100%;
                    min-height: 48px;
                    border: 1.5px solid #d1d5db;
                    border-radius: 0.72rem;
                    padding: 0.82rem 1rem;
                    font-size: 16px;
                    color: #111827;
                    background: #ffffff;
                    transition: border-color 0.2s ease, box-shadow 0.2s ease;
                    -webkit-appearance: none;
                    appearance: none;
                }

                .form-input:focus {
                    outline: none;
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.22);
                }

                .form-input::placeholder {
                    color: #9ca3af;
                }

                .password-wrapper {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                .password-toggle {
                    position: absolute;
                    right: 0.65rem;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 42px;
                    height: 42px;
                    border: none;
                    background: transparent;
                    color: #6b7280;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 0.5rem;
                    transition: color 0.2s ease, background-color 0.2s ease;
                }

                .password-toggle:hover,
                .password-toggle:focus-visible {
                    color: #1f2937;
                    background: #f3f4f6;
                }

                .remember-me-container {
                    display: flex;
                    align-items: center;
                    margin: 0.25rem 0 0.4rem;
                    min-height: 44px;
                }

                .remember-me-label {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                    cursor: pointer;
                    user-select: none;
                    color: #374151;
                    font-size: 0.9rem;
                }

                .remember-me-checkbox {
                    width: 18px;
                    height: 18px;
                    accent-color: #2563eb;
                    margin: 0;
                }

                .error-message {
                    padding: 0.78rem 0.9rem;
                    border-radius: 0.7rem;
                    border: 1px solid #fecaca;
                    background: #fef2f2;
                    color: #dc2626;
                    font-size: 0.9rem;
                }

                .submit-button {
                    width: 100%;
                    min-height: 48px;
                    border: none;
                    border-radius: 0.85rem;
                    background: linear-gradient(135deg, #2563eb 0%, #3b82f6 45%, #1d4ed8 100%);
                    color: #ffffff !important;
                    -webkit-text-fill-color: #ffffff !important;
                    font-size: 0.98rem;
                    font-weight: 650;
                    cursor: pointer;
                    transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
                    box-shadow: 0 10px 24px rgba(37, 99, 235, 0.35);
                }

                .login-card .submit-button,
                .login-card .submit-button * {
                    color: #ffffff !important;
                    -webkit-text-fill-color: #ffffff !important;
                }

                .submit-button:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 14px 28px rgba(37, 99, 235, 0.4);
                    color: #ffffff !important;
                }

                .submit-button:focus,
                .submit-button:active,
                .submit-button:visited {
                    color: #ffffff !important;
                }

                .submit-button:disabled {
                    opacity: 0.75;
                    cursor: not-allowed;
                    color: #ffffff !important;
                }

                .forgot-password {
                    margin-top: 0.15rem;
                    text-align: center;
                }

                .forgot-link {
                    background: none;
                    border: none;
                    color: #2563eb;
                    font-size: 0.88rem;
                    text-decoration: underline;
                    text-underline-offset: 2px;
                    cursor: pointer;
                    padding: 0.35rem;
                }

                .forgot-form {
                    margin-top: 0.9rem;
                    border: 1px solid #e5e7eb;
                    border-radius: 0.72rem;
                    background: #f9fafb;
                    padding: 0.9rem;
                }

                .forgot-status {
                    margin: 0.7rem 0 0;
                    font-size: 0.86rem;
                    color: #059669;
                    text-align: center;
                }

                @media (max-width: 640px) {
                    .login-wrapper {
                        align-items: flex-start;
                        justify-content: flex-start;
                        padding: 0;
                    }

                    .login-card {
                        min-height: 100vh;
                        min-height: 100dvh;
                        border-radius: 0;
                        border: none;
                        box-shadow: none;
                        max-width: 100%;
                        padding: max(1.25rem, env(safe-area-inset-top)) 1rem max(1.5rem, env(safe-area-inset-bottom));
                    }
                }
            `}</style>

            <div className="login-wrapper">
                <div className="login-card login-modal">
                    <h1 className="login-title">Praxis ERP</h1>
                    <p className="login-slogan">Knowledge drives action</p>
                    <p className="login-brand-subtitle">by Abco</p>
                    <p className="login-subtitle">Sign in to continue to your account</p>

                    <form onSubmit={handleSubmit} className="login-form" autoComplete="on">
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
                                autoComplete="username email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="form-input"
                                placeholder="you@company.com"
                                autoFocus
                                required
                                data-lpignore="false"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="password" className="form-label">
                                Password
                            </label>
                            <div className="password-wrapper">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    name="password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="form-input"
                                    placeholder="Enter your password"
                                    required
                                    data-lpignore="false"
                                    style={{ paddingRight: '3rem' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="password-toggle"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                        </div>

                        <div className="remember-me-container">
                            <label className="remember-me-label">
                                <input
                                    type="checkbox"
                                    id="remember-me"
                                    name="remember-me"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="remember-me-checkbox"
                                    aria-label="Remember my email address"
                                />
                                <span className="remember-me-text">Remember me</span>
                            </label>
                        </div>

                        <button type="submit" disabled={submitting} className="submit-button">
                            {submitting ? 'Signing In...' : 'Sign In'}
                        </button>

                        <div className="forgot-password">
                            <button type="button" onClick={() => setShowForgot(!showForgot)} className="forgot-link">
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
                                {resetStatus && <p className="forgot-status">{resetStatus}</p>}
                            </div>
                        )}
                    </form>
                </div>
            </div>
        </>
    );
};

// Make available globally
window.LoginPage = LoginPage;
