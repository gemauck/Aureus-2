/**
 * Component Dependency Checker
 * 
 * Validates that required components are loaded before use.
 * Prevents "Component not found" errors by checking dependencies.
 */

// Component dependency map - defines what each component needs
const COMPONENT_DEPENDENCIES = {
    'Projects': ['ProjectDetail', 'ProjectModal'],
    'ProjectDetail': [
        'ProjectModal',
        'ListModal',
        'TaskDetailModal',
        'KanbanView',
        'CustomFieldModal',
        'CommentsPopup',
        'DocumentCollectionModal',
        'MonthlyDocumentCollectionTracker'
    ],
    'Clients': ['ClientDetailModal', 'LeadDetailModal'],
    // Add more as needed
};

/**
 * Check if a component and its dependencies are available
 * @param {string} componentName - Name of the component to check
 * @returns {Object} - { available: boolean, missing: string[], allDependencies: string[] }
 */
window.checkComponentDependencies = function(componentName) {
    const dependencies = COMPONENT_DEPENDENCIES[componentName] || [];
    const missing = dependencies.filter(dep => !window[dep]);
    
    return {
        available: missing.length === 0 && !!window[componentName],
        missing: missing,
        allDependencies: dependencies,
        componentAvailable: !!window[componentName]
    };
};

/**
 * Wait for a component and its dependencies to be available
 * @param {string} componentName - Name of the component to wait for
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 5000)
 * @returns {Promise<boolean>} - True if component loaded, false if timeout
 */
window.waitForComponent = function(componentName, timeout = 5000) {
    return new Promise((resolve) => {
        const check = () => {
            const status = window.checkComponentDependencies(componentName);
            if (status.available) {
                console.log(`✅ ${componentName} and dependencies are available`);
                resolve(true);
                return;
            }
            
            // Check if component itself is available
            if (status.componentAvailable && status.missing.length === 0) {
                resolve(true);
                return;
            }
            
            resolve(false);
        };
        
        // Check immediately
        if (check()) return;
        
        // Listen for componentLoaded events
        const handler = (event) => {
            if (event.detail && event.detail.component === componentName) {
                window.removeEventListener('componentLoaded', handler);
                check();
            }
        };
        
        window.addEventListener('componentLoaded', handler);
        
        // Timeout
        setTimeout(() => {
            window.removeEventListener('componentLoaded', handler);
            const status = window.checkComponentDependencies(componentName);
            if (status.missing.length > 0) {
                console.warn(`⚠️ ${componentName} missing dependencies after timeout:`, status.missing);
            }
            resolve(status.available);
        }, timeout);
    });
};

/**
 * Validate component dependencies on page load
 * Logs warnings for missing dependencies
 */
window.validateAllDependencies = function() {
    console.log('🔍 Validating component dependencies...');
    
    Object.keys(COMPONENT_DEPENDENCIES).forEach(componentName => {
        const status = window.checkComponentDependencies(componentName);
        
        if (status.componentAvailable && status.missing.length > 0) {
            console.warn(`⚠️ ${componentName} is loaded but missing dependencies:`, status.missing);
        } else if (!status.componentAvailable && status.missing.length > 0) {
            console.log(`ℹ️ ${componentName} not loaded yet (missing: ${status.missing.join(', ')})`);
        } else if (status.available) {
            console.log(`✅ ${componentName} and all dependencies are available`);
        }
    });
};

// Auto-validate after lazy loader completes (with delay)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(window.validateAllDependencies, 2000);
    });
} else {
    setTimeout(window.validateAllDependencies, 2000);
}

// Export for use in other scripts
console.log('✅ Component dependency checker loaded');
