// Lazy loading script to defer non-critical component loading
(function() {
    const componentFiles = [
        './src/components/clients/Clients.jsx',
        './src/components/clients/ClientsDatabaseFirst.jsx',
        './src/components/clients/ClientDetailModal.jsx',
        './src/components/clients/ClientModal.jsx',
        './src/components/clients/LeadDetailModal.jsx',
        './src/components/clients/Pipeline.jsx',
        './src/components/clients/BulkOperations.jsx',
        './src/components/projects/ProjectDetail.jsx',
        './src/components/projects/Projects.jsx',
        './src/components/projects/ProjectModal.jsx',
        './src/components/projects/MonthlyDocumentCollectionTracker.jsx',
        './src/components/teams/TeamsEnhanced.jsx',
        './src/components/teams/Teams.jsx',
        './src/components/users/Users.jsx',
        './src/components/account/Account.jsx',
        './src/components/hr/HR.jsx',
        './src/components/invoicing/InvoicingDatabaseFirst.jsx',
        './src/components/time/TimeTracking.jsx',
        './src/components/reports/Reports.jsx',
        './src/components/tools/Tools.jsx',
        './src/components/manufacturing/Manufacturing.jsx'
    ];
    
    let loadedComponents = 0;
    
    function loadComponent(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.type = 'text/babel';
            script.src = src;
            script.onload = () => {
                loadedComponents++;
                console.log(`✅ Loaded ${src} (${loadedComponents}/${componentFiles.length})`);
                resolve();
            };
            script.onerror = () => {
                console.error(`❌ Failed to load ${src}`);
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
            console.log('🚀 Starting lazy load of non-critical components...');
            
            // Load in small batches to not block rendering
            const batchSize = 3;
            let index = 0;
            
            function loadBatch() {
                const batch = componentFiles.slice(index, index + batchSize);
                if (batch.length === 0) {
                    console.log('✅ All components loaded!');
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

