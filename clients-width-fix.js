// Force Clients component to full width on desktop - NUCLEAR FIX
(function() {
    function forceClientsFullWidth() {
        // Only run on desktop
        if (window.innerWidth < 769) return;
        
        // Fix root container
        const root = document.getElementById('root');
        if (root) {
            root.style.setProperty('width', '100vw', 'important');
            root.style.setProperty('max-width', '100vw', 'important');
        }
        
        // Fix root flex container
        const rootFlex = document.querySelector('.flex.h-screen');
        if (rootFlex) {
            rootFlex.style.setProperty('width', '100vw', 'important');
            rootFlex.style.setProperty('max-width', '100vw', 'important');
            rootFlex.style.setProperty('display', 'flex', 'important');
        }
        
        // Fix the flex-1 wrapper div (parent of main)
        const flex1Wrappers = document.querySelectorAll('.flex-1.flex.flex-col, div.flex-1');
        flex1Wrappers.forEach(wrapper => {
            if (wrapper.tagName !== 'MAIN') {
                wrapper.style.setProperty('width', 'auto', 'important');
                wrapper.style.setProperty('max-width', 'none', 'important');
                wrapper.style.setProperty('min-width', '0', 'important');
                wrapper.style.setProperty('flex', '1 1 0%', 'important');
                wrapper.style.setProperty('flex-basis', '0%', 'important');
                wrapper.style.setProperty('flex-grow', '1', 'important');
                wrapper.style.setProperty('flex-shrink', '1', 'important');
            }
        });
        
        // Find main content area - CRITICAL FIX
        const mainContent = document.querySelector('main.flex-1, main[class*="flex-1"]');
        if (mainContent) {
            mainContent.style.setProperty('width', 'auto', 'important');
            mainContent.style.setProperty('max-width', 'none', 'important');
            mainContent.style.setProperty('min-width', '0', 'important');
            mainContent.style.setProperty('flex', '1 1 0%', 'important');
            mainContent.style.setProperty('flex-basis', '0%', 'important');
            mainContent.style.setProperty('flex-grow', '1', 'important');
            mainContent.style.setProperty('flex-shrink', '1', 'important');
        }
        
        // Fix inner wrapper div inside main
        const innerWrappers = document.querySelectorAll('main > div');
        innerWrappers.forEach(wrapper => {
            wrapper.style.setProperty('width', '100%', 'important');
            wrapper.style.setProperty('max-width', '100%', 'important');
            wrapper.style.setProperty('min-width', '100%', 'important');
        });
        
        // Find Clients component
        const clientsElements = document.querySelectorAll('[class*="Clients"]');
        if (clientsElements.length === 0) return;
        
        // Force Clients component and all wrappers to full width
        clientsElements.forEach(el => {
            el.style.setProperty('width', '100%', 'important');
            el.style.setProperty('max-width', '100%', 'important');
            el.style.setProperty('min-width', '100%', 'important');
            el.style.setProperty('flex', '1 1 100%', 'important');
            
            // Also fix ALL parent wrappers up to body
            let parent = el.parentElement;
            let depth = 0;
            while (parent && depth < 10 && parent !== document.body && parent !== document.documentElement) {
                if (parent.tagName === 'MAIN' || parent.classList.contains('flex-1')) {
                    parent.style.setProperty('width', 'auto', 'important');
                    parent.style.setProperty('max-width', 'none', 'important');
                    parent.style.setProperty('min-width', '0', 'important');
                    parent.style.setProperty('flex', '1 1 0%', 'important');
                    parent.style.setProperty('flex-basis', '0%', 'important');
                } else if (parent.classList.contains('flex') || parent.classList.contains('flex-col')) {
                    if (!parent.classList.contains('h-screen')) {
                        parent.style.setProperty('width', '100%', 'important');
                        parent.style.setProperty('max-width', '100%', 'important');
                    }
                }
                parent = parent.parentElement;
                depth++;
            }
        });
        
        // Remove any container max-width constraints
        const containers = document.querySelectorAll('.container, [class*="container"], [class*="max-w"]');
        containers.forEach(container => {
            const hasClients = container.querySelector('[class*="Clients"]') || container.closest('[class*="Clients"]');
            if (hasClients || container.closest('main')) {
                container.style.setProperty('max-width', '100%', 'important');
                container.style.setProperty('width', '100%', 'important');
            }
        });
        
        console.log('✅ Clients width fix applied');
    }
    
    // Run immediately
    forceClientsFullWidth();
    
    // Run after delays to catch late-rendered elements
    setTimeout(forceClientsFullWidth, 100);
    setTimeout(forceClientsFullWidth, 500);
    setTimeout(forceClientsFullWidth, 1000);
    setTimeout(forceClientsFullWidth, 2000);
    
    // Run on resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(forceClientsFullWidth, 100);
    });
    
    // Run when Clients page loads (using MutationObserver)
    const observer = new MutationObserver(() => {
        forceClientsFullWidth();
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    // Also run on route changes
    if (window.addEventListener) {
        window.addEventListener('popstate', forceClientsFullWidth);
        window.addEventListener('hashchange', forceClientsFullWidth);
    }
    
    // Run periodically to catch any late changes
    setInterval(forceClientsFullWidth, 2000);
})();
