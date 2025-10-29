// Lazy loading script to defer non-critical component loading
(function() {
    // Note: Components already loaded in index.html are not included here to avoid duplicate loading
    // ClientDetailModal and LeadDetailModal are loaded before Clients.jsx in index.html to avoid race condition
    const componentFiles = [
        // Add any truly non-critical components here that should be lazy-loaded
        // Most components are already loaded synchronously in index.html for reliability
    ];
    
    let loadedComponents = 0;
    
    function loadComponent(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            // Convert src/ paths to dist/src/ paths if needed
            const scriptSrc = src.startsWith('./src/') ? src.replace('./src/', './dist/src/').replace('.jsx', '.js') : src;
            script.src = scriptSrc;
            script.async = true;
            script.onload = () => {
                loadedComponents++;
                resolve();
            };
            script.onerror = () => {
                resolve(); // Continue even if one fails
            };
            document.body.appendChild(script);
        });
    }
    
    // Load components in batches after page is interactive
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startLazyLoading);
    } else {
        startLazyLoading();
    }
    
    function startLazyLoading() {
        // Wait for critical components to be ready
        setTimeout(() => {
            // Load in small batches to not block rendering
            const batchSize = 3;
            let index = 0;
            
            function loadBatch() {
                const batch = componentFiles.slice(index, index + batchSize);
                if (batch.length === 0) {
                    return;
                }
                
                Promise.all(batch.map(loadComponent)).then(() => {
                    index += batchSize;
                    // Use requestIdleCallback if available, otherwise setTimeout
                    const nextBatchDelay = index < componentFiles.length ? 100 : 0;
                    
                    if (typeof requestIdleCallback !== 'undefined') {
                        requestIdleCallback(loadBatch, { timeout: 500 });
                    } else {
                        setTimeout(loadBatch, nextBatchDelay);
                    }
                });
            }
            
            loadBatch();
        }, 2000); // Wait 2 seconds for initial page to load
    }
})();

