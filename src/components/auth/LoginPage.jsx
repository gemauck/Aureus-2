// Get React hooks from window
const { useState, useEffect, useRef, useLayoutEffect } = React;

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
    const [headerStyle, setHeaderStyle] = useState({ 
        display: 'block', 
        visibility: 'visible', 
        opacity: 1 
    });
    const [cardStyle, setCardStyle] = useState({});
    const cardRef = useRef(null);
    const formContainerRef = useRef(null);
    const wrapperRef = useRef(null);

    // Set header and card styles based on viewport width
    useEffect(() => {
        const updateStyles = () => {
            const isDesktop = window.innerWidth >= 768;
            setHeaderStyle({
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                maxHeight: isDesktop ? '200px' : '60px',
                height: 'auto',
                alignSelf: isDesktop ? 'start' : 'auto'
            });
        };
        
        updateStyles();
        window.addEventListener('resize', updateStyles);
        return () => window.removeEventListener('resize', updateStyles);
    }, []);
    
    // Use useLayoutEffect to set card and form container styles synchronously before paint
    useLayoutEffect(() => {
        const updateStyles = () => {
            const isDesktop = window.innerWidth >= 768;
            
            // Fix root element centering on mobile
            const root = document.getElementById('root');
            if (root && !isDesktop) {
                root.style.setProperty('align-items', 'flex-start', 'important');
                root.style.setProperty('justify-content', 'flex-start', 'important');
                root.style.setProperty('padding', '0', 'important');
            }
            
            // Update wrapper positioning
            if (wrapperRef.current) {
                if (!isDesktop) {
                    wrapperRef.current.style.setProperty('position', 'relative', 'important');
                    wrapperRef.current.style.setProperty('left', '0', 'important');
                    wrapperRef.current.style.setProperty('margin-left', '0', 'important');
                    wrapperRef.current.style.setProperty('padding-left', '0', 'important');
                    wrapperRef.current.style.setProperty('transform', 'none', 'important');
                    wrapperRef.current.style.setProperty('width', '100%', 'important');
                    wrapperRef.current.style.setProperty('max-width', '100%', 'important');
                }
            }
            
            // Update card positioning
            if (cardRef.current) {
                if (!isDesktop) {
                    // Directly set styles with !important to override external CSS
                    cardRef.current.style.setProperty('position', 'relative', 'important');
                    cardRef.current.style.setProperty('left', 'auto', 'important');
                    cardRef.current.style.setProperty('right', 'auto', 'important');
                    cardRef.current.style.setProperty('top', 'auto', 'important');
                    cardRef.current.style.setProperty('bottom', 'auto', 'important');
                    cardRef.current.style.setProperty('transform', 'none', 'important');
                } else {
                    // Clear mobile styles on desktop
                    cardRef.current.style.removeProperty('position');
                    cardRef.current.style.removeProperty('left');
                    cardRef.current.style.removeProperty('right');
                    cardRef.current.style.removeProperty('top');
                    cardRef.current.style.removeProperty('bottom');
                    cardRef.current.style.removeProperty('transform');
                }
            }
            
            // Update form container padding
            if (formContainerRef.current) {
                if (!isDesktop) {
                    // Force padding on mobile
                    formContainerRef.current.style.setProperty('padding', 'clamp(1.5rem, 5vw, 2rem) clamp(1.25rem, 4vw, 2rem)', 'important');
                    formContainerRef.current.style.setProperty('padding-bottom', 'clamp(2rem, 6vw, 3rem)', 'important');
                } else {
                    // Use default padding on desktop
                    formContainerRef.current.style.removeProperty('padding');
                    formContainerRef.current.style.removeProperty('padding-bottom');
                }
            }
        };
        
        // Use requestAnimationFrame to ensure DOM is ready, then setTimeout for external CSS
        requestAnimationFrame(() => {
            setTimeout(() => {
                updateStyles();
                // Also run again after a short delay to catch any late-loading CSS
                setTimeout(updateStyles, 100);
            }, 50);
        });
        
        window.addEventListener('resize', updateStyles);
        
        return () => {
            window.removeEventListener('resize', updateStyles);
        };
    }, []);

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
                    background: #f3f4f6 !important;
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
                body.login-page header:not(.login-header),
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
                
                /* CRITICAL: Override any header hiding rules - must come after hiding rule */
                body.login-page .login-wrapper .login-card .login-header,
                body.login-page .login-card .login-header,
                body.login-page header.login-header {
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                    height: auto !important;
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
                    background: #f3f4f6 !important;
                }
                
                /* Login Card - Dynamic Sizing */
                .login-card {
                    width: 100%;
                    max-width: min(calc(100vw - clamp(1.5rem, 6vw, 3rem)), 500px);
                    max-height: calc(100vh - 2rem);
                    background: #ffffff;
                    border-radius: clamp(1rem, 4vw, 1.5rem);
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
                    overflow: visible;
                    position: relative;
                    animation: slideUp 0.4s ease-out;
                    display: flex;
                    flex-direction: column;
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
                
                /* Branding Header - Mobile Optimized (Thinner) */
                body.login-page .login-header,
                .login-wrapper .login-header,
                .login-card .login-header {
                    background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%) !important;
                    padding: clamp(0.75rem, 2.5vw, 1rem) clamp(1.25rem, 5vw, 2rem) !important;
                    text-align: center !important;
                    color: #ffffff !important;
                    flex-shrink: 0 !important;
                    display: block !important;
                    visibility: visible !important;
                    opacity: 1 !important;
                }
                
                .login-brand {
                    font-size: clamp(1.25rem, 4.5vw, 1.75rem);
                    font-weight: 700;
                    margin: 0;
                    letter-spacing: -0.02em;
                    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
                }
                
                /* Mobile: Stack header on top - Single scroll container */
                @media (max-width: 767px) {
                    body.login-page {
                        overflow-y: auto !important;
                        overflow-x: hidden !important;
                    }
                    
                    .login-wrapper {
                        min-height: 100vh !important;
                        padding: 0 !important;
                        align-items: flex-start !important;
                        justify-content: flex-start !important;
                        overflow: visible !important;
                        position: relative !important;
                        left: auto !important;
                        right: auto !important;
                        top: auto !important;
                        bottom: auto !important;
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    
                    body.login-page .login-card,
                    body.login-page .login-card.login-modal,
                    body.login-page [class*="login-card"],
                    body.login-page [class*="login-modal"] {
                        display: flex !important;
                        flex-direction: column !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        max-height: none !important;
                        height: auto !important;
                        min-height: 100vh !important;
                        overflow: visible !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        background: #ffffff !important;
                        margin: 0 !important;
                        position: relative !important;
                        left: auto !important;
                        right: auto !important;
                        top: auto !important;
                        bottom: auto !important;
                        transform: none !important;
                    }
                    
                    .login-header {
                        display: block !important;
                        padding: clamp(0.75rem, 2.5vw, 1rem) clamp(1rem, 4vw, 1.5rem) !important;
                        min-height: auto !important;
                        max-height: 60px !important;
                        height: auto !important;
                        flex-shrink: 0 !important;
                        overflow: hidden !important;
                        position: relative !important;
                        order: 1 !important;
                    }
                    
                    .login-brand {
                        font-size: clamp(1.25rem, 4.5vw, 1.5rem) !important;
                        line-height: 1.2 !important;
                        margin: 0 !important;
                        white-space: nowrap !important;
                    }
                    
                    .login-form-container {
                        flex: 1 !important;
                        display: flex !important;
                        flex-direction: column !important;
                        min-height: 0 !important;
                        padding: clamp(1.5rem, 5vw, 2rem) clamp(1.25rem, 4vw, 2rem) !important;
                        padding-bottom: clamp(2rem, 6vw, 3rem) !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        position: relative !important;
                        order: 2 !important;
                        gap: 0 !important;
                    }
                    
                    .login-form {
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: flex-start !important;
                        gap: clamp(1rem, 3vw, 1.25rem) !important;
                        width: 100% !important;
                    }
                    
                    .form-group {
                        display: flex !important;
                        flex-direction: column !important;
                        gap: 0.5rem !important;
                        margin-bottom: 0 !important;
                        width: 100% !important;
                    }
                    
                    .form-label {
                        margin-bottom: 0.5rem !important;
                        display: block !important;
                        font-size: clamp(0.875rem, 3vw, 0.9375rem) !important;
                    }
                    
                    .form-input {
                        width: 100% !important;
                        margin: 0 !important;
                        box-sizing: border-box !important;
                        padding: clamp(0.875rem, 3vw, 1rem) clamp(0.875rem, 3vw, 1.125rem) !important;
                        min-height: 48px !important;
                    }
                    
                    .remember-me-container {
                        margin: clamp(0.75rem, 2vw, 1rem) 0 !important;
                        display: flex !important;
                        visibility: visible !important;
                        width: 100% !important;
                    }
                    
                    .submit-button {
                        width: 100% !important;
                        margin-top: clamp(1rem, 3vw, 1.25rem) !important;
                        margin-bottom: 0 !important;
                        padding: clamp(0.875rem, 3vw, 1rem) clamp(1rem, 4vw, 1.5rem) !important;
                        min-height: 48px !important;
                    }
                    
                    .forgot-password {
                        margin-top: clamp(0.75rem, 2vw, 1rem) !important;
                        text-align: center !important;
                        width: 100% !important;
                    }
                    
                    .login-title {
                        margin: 0 0 0.5rem 0 !important;
                        font-size: clamp(1.5rem, 5vw, 1.875rem) !important;
                    }
                    
                    .login-subtitle {
                        margin: 0 0 clamp(1.5rem, 5vw, 2rem) 0 !important;
                        font-size: clamp(0.875rem, 3vw, 1rem) !important;
                    }
                }
                
                /* Form Container - Desktop default */
                @media (min-width: 768px) {
                    .login-form-container {
                        padding: clamp(1.5rem, 5vw, 2.5rem) clamp(1.25rem, 4vw, 2rem);
                        overflow: visible;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                    }
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
                    border-color: #3b82f6;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
                }
                
                .form-input::placeholder {
                    color: #9ca3af;
                }
                
                /* Remember Me Checkbox */
                .remember-me-container {
                    display: flex;
                    align-items: center;
                    margin: 0.75rem 0;
                    padding: 0.5rem 0;
                    min-height: 44px; /* Ensure touch target size */
                    visibility: visible !important;
                    opacity: 1 !important;
                }
                
                .remember-me-label {
                    display: flex;
                    align-items: center;
                    gap: 0.625rem;
                    cursor: pointer;
                    user-select: none;
                    font-size: clamp(0.875rem, 3vw, 0.9375rem);
                    color: #374151;
                    width: 100%;
                    padding: 0.25rem 0;
                }
                
                .remember-me-checkbox {
                    width: 20px;
                    height: 20px;
                    min-width: 20px;
                    min-height: 20px;
                    cursor: pointer;
                    accent-color: #3b82f6;
                    flex-shrink: 0;
                    margin: 0;
                    visibility: visible !important;
                    opacity: 1 !important;
                }
                
                .remember-me-text {
                    font-weight: 500;
                    flex: 1;
                }
                
                /* Ensure remember me is always visible on all screen sizes */
                @media (max-width: 480px) {
                    .remember-me-container {
                        margin: 0.5rem 0;
                        padding: 0.25rem 0;
                    }
                    
                    .remember-me-checkbox {
                        width: 18px;
                        height: 18px;
                        min-width: 18px;
                        min-height: 18px;
                    }
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
                    background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
                    color: #ffffff;
                    border: none;
                    border-radius: clamp(0.5rem, 2vw, 0.75rem);
                    font-size: clamp(0.9375rem, 3vw, 1rem);
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    touch-action: manipulation;
                    min-height: 52px;
                    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
                }
                
                .submit-button:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 6px 16px rgba(59, 130, 246, 0.5);
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
                    color: #3b82f6;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 0.5rem;
                    text-decoration: underline;
                    touch-action: manipulation;
                }
                
                .forgot-link:hover,
                .forgot-link:active {
                    color: #1e40af;
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
                        max-width: 600px;
                        display: grid !important;
                        grid-template-columns: 200px 1fr !important;
                        border-radius: clamp(1rem, 2vw, 1.5rem);
                        overflow: hidden !important;
                    }
                    
                    .login-header {
                        display: flex !important;
                        flex-direction: column !important;
                        justify-content: center !important;
                        align-items: center !important;
                        padding: clamp(1.5rem, 3vw, 2rem) clamp(1rem, 2.5vw, 1.5rem) !important;
                        width: 100% !important;
                        max-width: 200px !important;
                        height: 100% !important;
                        min-height: 100% !important;
                        overflow: visible !important;
                        position: relative !important;
                        flex-shrink: 0 !important;
                        align-self: stretch !important;
                    }
                    
                    .login-brand {
                        font-size: clamp(1.75rem, 6vw, 2.5rem);
                        writing-mode: vertical-rl;
                        text-orientation: mixed;
                        transform: rotate(180deg);
                        white-space: nowrap;
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        width: auto !important;
                        text-align: center !important;
                        line-height: 1.2 !important;
                        letter-spacing: 0.05em !important;
                    }
                    
                    .login-form-container {
                        padding: clamp(2rem, 5vw, 3rem);
                        overflow: visible !important;
                    }
                }
                
                /* Large Desktop */
                @media (min-width: 1024px) {
                    .login-card {
                        max-width: 650px;
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
                        align-items: flex-start;
                        padding-top: 1rem;
                    }
                    
                    .login-card {
                        border-radius: 0.875rem;
                        max-height: calc(100vh - 2rem);
                        overflow-y: auto;
                    }
                    
                    .login-header {
                        padding: 1.25rem 1rem;
                    }
                    
                    .login-form-container {
                        padding: 1.25rem 1rem;
                    }
                    
                    .login-form {
                        gap: 1rem;
                    }
                    
                    /* Ensure remember me is visible */
                    .remember-me-container {
                        margin: 0.5rem 0;
                        display: flex !important;
                        visibility: visible !important;
                    }
                }
                
                /* Extra small screens - ensure nothing is hidden */
                @media (max-height: 600px) {
                    .login-form-container {
                        padding: 1rem;
                    }
                    
                    .login-form {
                        gap: 0.75rem;
                    }
                    
                    .form-group {
                        gap: 0.375rem;
                    }
                    
                    .remember-me-container {
                        margin: 0.5rem 0;
                        display: flex !important;
                        visibility: visible !important;
                    }
                }
                
                /* High DPI Displays */
                @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
                    .login-card {
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(255, 255, 255, 0.15);
                    }
                }
            `}</style>
            
            <div className="login-wrapper" ref={wrapperRef}>
                <div className="login-card login-modal" ref={cardRef} style={cardStyle}>
                    {/* Header */}
                    <div className="login-header" style={headerStyle}>
                        <h1 className="login-brand abcotronics-logo">Abcotronics</h1>
                    </div>
                    
                    {/* Form */}
                    <div className="login-form-container" ref={formContainerRef}>
                        <h2 className="login-title">Welcome Back</h2>
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
                                            type={showPassword ? "text" : "password"}
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
                                        aria-label={showPassword ? "Hide password" : "Show password"}
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
