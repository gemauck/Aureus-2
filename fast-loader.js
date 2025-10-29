// Simple app mount script - waits for App component and mounts
(function() {
    let mounted = false;
    
    function mountApp() {
        if (window.__appMounted || mounted) return;
        
        if (!window.React || !window.ReactDOM || !window.App) {
            return false;
        }
        
        try {
            const root = document.getElementById('root');
            if (!root) return false;
            
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
            
            return true;
        } catch (error) {
            console.error('Mount error:', error);
            mounted = false;
            window.__appMounted = false;
            return false;
        }
    }
    
    // Wait for App to load and mount
    function startMount() {
        if (mountApp()) {
            return;
        }
        
        // Simple retry - check a few times
        let attempts = 0;
        const maxAttempts = 20;
        
        const checkInterval = setInterval(() => {
            attempts++;
            
            if (mountApp() || attempts >= maxAttempts) {
                clearInterval(checkInterval);
                
                if (!mounted && attempts >= maxAttempts) {
                    const root = document.getElementById('root');
                    if (root) {
                        root.innerHTML = `
                            <div style="padding: 40px; text-align: center;">
                                <h2>Loading Application...</h2>
                                <p>If this persists, please refresh the page.</p>
                                <button onclick="location.reload()" style="padding: 12px 24px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; margin-top: 10px;">
                                    Reload Page
                                </button>
                            </div>
                        `;
                    }
                }
            }
        }, 250);
    }
    
    // Start after DOM is ready and Babel has had time to process
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(startMount, 1000);
        });
    } else {
        setTimeout(startMount, 1000);
    }
})();
