(function() {
    let attempt = 0;
    const MAX_ATTEMPTS = 10;
    const RETRY_DELAY = 100;
    
    function showLoading(message, attempt) {
        const app = document.getElementById('app-loading') || document.getElementById('root');
        if (!app) return;
        app.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f7fafc;">
                <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 400px;">
                    <div style="width: 40px; height: 40px; margin: 0 auto 20px; border: 4px solid #e2e8f0; border-top-color: #3182ce; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                    <div style="font-size: 18px; font-weight: 600; color: #2d3748; margin-bottom: 8px;">${message}</div>
                    <div style="font-size: 14px; color: #718096;">Attempt ${attempt} of ${MAX_ATTEMPTS}</div>
                </div>
            </div>
            <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
        `;
    }
    
    function showError(missing) {
        const app = document.getElementById('app-loading') || document.getElementById('root');
        if (!app) return;
        app.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f7fafc;">
                <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                    <div style="font-size: 24px; font-weight: 600; color: #e53e3e; margin-bottom: 16px;">Loading Failed</div>
                    <div style="font-size: 14px; color: #4a5568; margin-bottom: 24px;">Missing: <strong>${missing.join(', ')}</strong></div>
                    <button onclick="location.reload()" style="padding: 12px 32px; background: #3182ce; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: 600;">Reload Page</button>
                </div>
            </div>
        `;
    }
    
    function checkComponents() {
        attempt++;
        const required = {
            React: window.React,
            ReactDOM: window.ReactDOM,
            App: window.App,
            MainLayout: window.MainLayout,
            ThemeProvider: window.ThemeProvider,
            AuthProvider: window.AuthProvider
        };
        const missing = Object.entries(required).filter(([name, value]) => !value).map(([name]) => name);
        console.log(`🔍 Check ${attempt}/${MAX_ATTEMPTS}:`, missing.length ? `Missing: ${missing.join(', ')}` : '✅ All loaded');
        
        if (missing.length === 0) {
            console.log('✅ Mounting app...');
            mountApp();
            return;
        }
        if (attempt >= MAX_ATTEMPTS) {
            console.error('❌ Failed:', missing);
            showError(missing);
            return;
        }
        showLoading('Loading components...', attempt);
        setTimeout(checkComponents, RETRY_DELAY);
    }
    
    function mountApp() {
        try {
            const root = document.getElementById('root');
            if (!root) throw new Error('Root element not found');
            ReactDOM.createRoot(root).render(React.createElement(window.App));
            console.log('✅ App mounted');
        } catch (error) {
            console.error('❌ Mount failed:', error);
            showError(['Mount Error: ' + error.message]);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkComponents);
    } else {
        checkComponents();
    }
})();
