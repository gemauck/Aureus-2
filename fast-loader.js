// Fast app mount script - waits for components and mounts
(function() {
    let mounted = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 15 seconds (60 * 250ms)
    
    function checkComponents() {
        return {
            React: !!window.React,
            ReactDOM: !!window.ReactDOM,
            App: !!window.App,
            MainLayout: !!window.MainLayout,
            ThemeProvider: !!window.ThemeProvider,
            AuthProvider: !!window.AuthProvider,
            DataProvider: !!window.DataProvider
        };
    }
    
    function mountApp() {
        if (window.__appMounted || mounted) return true;
        
        const components = checkComponents();
        const allReady = Object.values(components).every(v => v);
        
        if (!allReady) {
            return false;
        }
        
        try {
            const root = document.getElementById('root');
            if (!root) {
                console.error('❌ Root element not found');
                return false;
            }
            
            mounted = true;
            window.__appMounted = true;
            
            // Store React root for potential reuse
            if (window.__reactRoot) {
                window.__reactRoot.render(window.React.createElement(window.App));
            } else {
                const reactRoot = window.ReactDOM.createRoot(root);
                window.__reactRoot = reactRoot;
                reactRoot.render(window.React.createElement(window.App));
            }
            
            console.log('✅ App mounted successfully');
            return true;
        } catch (error) {
            console.error('❌ Mount error:', error);
            mounted = false;
            window.__appMounted = false;
            return false;
        }
    }
    
    function tryMount() {
        attempts++;
        
        if (mountApp()) {
            return true;
        }
        
        // Log progress every 10 attempts
        if (attempts % 10 === 0) {
            const components = checkComponents();
            const missing = Object.entries(components)
                .filter(([k, v]) => !v)
                .map(([k]) => k);
            console.log(`⏳ Waiting for components... (${attempts}/${MAX_ATTEMPTS}) Missing:`, missing.join(', '));
        }
        
        // Show error if max attempts reached
        if (attempts >= MAX_ATTEMPTS) {
            const components = checkComponents();
            const missing = Object.entries(components)
                .filter(([k, v]) => !v)
                .map(([k]) => k);
            
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = `
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
            return true;
        }
        
        return false;
    }
    
    // Wait for Babel to be ready before starting
    function startChecking() {
        // Check if Babel is ready
        if (typeof Babel !== 'undefined' && (window.BabelReady || typeof window.BabelReady !== 'undefined')) {
            const checkInterval = setInterval(() => {
                if (tryMount()) {
                    clearInterval(checkInterval);
                }
            }, 250);
        } else {
            // Wait for babelready event
            window.addEventListener('babelready', () => {
                const checkInterval = setInterval(() => {
                    if (tryMount()) {
                        clearInterval(checkInterval);
                    }
                }, 250);
            }, { once: true });
            
            // Fallback: start checking after a delay even if Babel event doesn't fire
            setTimeout(() => {
                if (!mounted) {
                    const checkInterval = setInterval(() => {
                        if (tryMount()) {
                            clearInterval(checkInterval);
                        }
                    }, 250);
                }
            }, 2000);
        }
    }
    
    // Start after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(startChecking, 500);
        });
    } else {
        setTimeout(startChecking, 500);
    }
})();
