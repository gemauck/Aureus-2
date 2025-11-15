// Debug script to find what's constraining the width
(function() {
    console.log('🔍 DEBUGGING CLIENTS WIDTH ISSUE');
    console.log('================================');
    
    const main = document.querySelector('main.flex-1, main[class*="flex-1"]');
    if (main) {
        const computed = window.getComputedStyle(main);
        console.log('Main element:', {
            width: computed.width,
            maxWidth: computed.maxWidth,
            minWidth: computed.minWidth,
            flex: computed.flex,
            flexBasis: computed.flexBasis,
            flexGrow: computed.flexGrow,
            flexShrink: computed.flexShrink,
            actualWidth: main.getBoundingClientRect().width,
            viewportWidth: window.innerWidth
        });
        
        // Check parent
        const parent = main.parentElement;
        if (parent) {
            const parentComputed = window.getComputedStyle(parent);
            console.log('Parent element:', {
                tagName: parent.tagName,
                className: parent.className,
                width: parentComputed.width,
                maxWidth: parentComputed.maxWidth,
                flex: parentComputed.flex,
                actualWidth: parent.getBoundingClientRect().width
            });
        }
        
        // Check Clients component
        const clients = document.querySelector('[class*="Clients"]');
        if (clients) {
            const clientsComputed = window.getComputedStyle(clients);
            console.log('Clients component:', {
                width: clientsComputed.width,
                maxWidth: clientsComputed.maxWidth,
                actualWidth: clients.getBoundingClientRect().width
            });
        }
        
        // Check sidebar
        const sidebar = document.querySelector('aside, [class*="sidebar"]');
        if (sidebar) {
            const sidebarComputed = window.getComputedStyle(sidebar);
            console.log('Sidebar:', {
                width: sidebarComputed.width,
                actualWidth: sidebar.getBoundingClientRect().width
            });
        }
        
        // Calculate expected width
        const sidebarWidth = sidebar ? sidebar.getBoundingClientRect().width : 0;
        const expectedMainWidth = window.innerWidth - sidebarWidth;
        const actualMainWidth = main.getBoundingClientRect().width;
        
        console.log('Width Analysis:', {
            viewportWidth: window.innerWidth,
            sidebarWidth: sidebarWidth,
            expectedMainWidth: expectedMainWidth,
            actualMainWidth: actualMainWidth,
            difference: expectedMainWidth - actualMainWidth,
            isHalfWidth: actualMainWidth < expectedMainWidth * 0.6
        });
    }
})();
