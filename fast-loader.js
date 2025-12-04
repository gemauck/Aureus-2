// Fast app mount script - waits for components and mounts
(function() {
    let mounted = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 15 seconds (60 * 250ms)
    
    // Show initial loading message
    console.log('🚀 Fast loader starting...');
    
    function checkComponents() {
        return {
            React: !!window.React,
            ReactDOM: !!window.ReactDOM,
            App: !!window.App,
            MainLayout: !!window.MainLayout,
            ThemeProvider: !!window.ThemeProvider,
            AuthProvider: !!window.AuthProvider,
            DataProvider: !!window.DataProvider,
            storage: !!window.storage,
            api: !!window.api
        };
    }
    
    function mountApp() {
        if (window.__appMounted || mounted) return true;
        
        const components = checkComponents();
        // Required components (storage and api are optional - loaded async)
        const required = ['React', 'ReactDOM', 'App', 'ThemeProvider', 'AuthProvider', 'DataProvider'];
        const allReady = required.every(key => components[key]);
        
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
        
        // Log progress every 5 attempts for better visibility
        if (attempts % 5 === 0) {
            const components = checkComponents();
            const missing = Object.entries(components)
                .filter(([k, v]) => !v)
                .map(([k]) => k);
            const available = Object.entries(components)
                .filter(([k, v]) => v)
                .map(([k]) => k);
            console.log(`⏳ Loading components... (${attempts}/${MAX_ATTEMPTS})`);
            console.log(`   ✅ Available:`, available.join(', ') || 'None');
            if (missing.length > 0) {
                console.log(`   ⏳ Missing:`, missing.join(', '));
            }
        }
        
        // Show error if max attempts reached
        if (attempts >= MAX_ATTEMPTS) {
            const components = checkComponents();
            const missing = Object.entries(components)
                .filter(([k, v]) => !v)
                .map(([k]) => k);
            
            console.error('❌ Failed to mount app after', MAX_ATTEMPTS, 'attempts');
            console.error('Missing components:', missing);
            
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f7fafc;">
                        <div style="text-align: center; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px;">
                            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
                            <div style="font-size: 24px; font-weight: 600; color: #e53e3e; margin-bottom: 16px;">Loading Failed</div>
                            <div style="font-size: 14px; color: #4a5568; margin-bottom: 24px;">Missing: <strong>${missing.join(', ')}</strong></div>
                            <div style="font-size: 12px; color: #718096; margin-bottom: 16px;">Check browser console for details</div>
                            <button onclick="location.reload()" style="padding: 12px 32px; background: #3182ce; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; font-weight: 600;">Reload Page</button>
                        </div>
                    </div>
                `;
            }
            return true;
        }
        
        return false;
    }
    
    // Start checking for components (no Babel needed anymore)
    function startChecking() {
        console.log('🔍 Starting component check...');
        // Check if BabelReady event was fired (or just start checking)
        if (window.BabelReady) {
            console.log('✅ BabelReady event already fired');
            const checkInterval = setInterval(() => {
                if (tryMount()) {
                    clearInterval(checkInterval);
                }
            }, 250);
        } else {
            console.log('⏳ Waiting for babelready event...');
            // Wait for babelready event (still used for React loading signal)
            window.addEventListener('babelready', () => {
                console.log('✅ babelready event received');
                const checkInterval = setInterval(() => {
                    if (tryMount()) {
                        clearInterval(checkInterval);
                    }
                }, 250);
            }, { once: true });
            
            // Fallback: start checking after a shorter delay for faster startup
            setTimeout(() => {
                if (!mounted) {
                    console.log('⏳ Fallback: Starting checks without babelready event');
                    const checkInterval = setInterval(() => {
                        if (tryMount()) {
                            clearInterval(checkInterval);
                        }
                    }, 250);
                }
            }, 200);
        }
    }
    
    // Start after DOM is ready - reduced delay for faster startup
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('✅ DOM loaded');
            setTimeout(startChecking, 100);
        });
    } else {
        console.log('✅ DOM already ready');
        setTimeout(startChecking, 100);
    }
})();
