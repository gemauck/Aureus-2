/**
 * PIPELINE PLATFORM INTEGRATION
 * 
 * This file integrates the Pipeline component into the Abcotronics ERP system.
 * It adds the Pipeline as a standalone view accessible from the CRM module.
 */

// Step 1: Load Pipeline Component in index.html
// Add this script tag after other component scripts:
/*
<script src="src/components/clients/Pipeline.jsx" type="text/babel"></script>
*/

// Step 2: Update App.jsx Navigation
// Add Pipeline as a navigation option

const PIPELINE_INTEGRATION = {
    // Navigation entry for sidebar
    navigation: {
        id: 'pipeline',
        name: 'Pipeline',
        icon: 'fa-stream',
        module: 'crm',
        order: 6,
        requiresAuth: true,
        roles: ['Admin', 'Sales Manager', 'Sales Rep']
    },

    // Component registration
    component: 'Pipeline',

    // Menu placement
    placement: {
        section: 'Sales & CRM',
        position: 'after-clients',
        parent: null // Standalone view
    }
};

// Step 3: Update MainLayout.jsx to include Pipeline route
/*
In MainLayout.jsx, add to the renderContent function:

if (currentPage === 'pipeline') return <Pipeline />;
*/

// Step 4: Add to sidebar navigation in MainLayout.jsx
/*
In the navigation menu, add:

<button
    onClick={() => setCurrentPage('pipeline')}
    className={`w-full text-left px-4 py-3 rounded-lg transition flex items-center gap-3 ${
        currentPage === 'pipeline' 
            ? 'bg-primary-100 text-primary-700 font-medium' 
            : 'text-gray-700 hover:bg-gray-100'
    }`}
>
    <i className="fas fa-stream w-5"></i>
    <span>Pipeline</span>
</button>
*/

// Step 5: Verify dependencies are loaded
const verifyPipelineDependencies = () => {
    const required = [
        'React',
        'storage',
        'Pipeline'
    ];

    const missing = required.filter(dep => !window[dep]);
    
    if (missing.length > 0) {
        console.error('Pipeline missing dependencies:', missing);
        return false;
    }
    
    return true;
};

// Step 6: Initialize Pipeline
const initializePipeline = () => {
    if (!verifyPipelineDependencies()) {
        console.error('Cannot initialize Pipeline - missing dependencies');
        return false;
    }

    console.log('✅ Pipeline Platform initialized successfully');
    return true;
};

// Step 7: Navigation helper
const navigateToPipeline = () => {
    window.dispatchEvent(new CustomEvent('navigateToPage', { 
        detail: { page: 'pipeline' } 
    }));
};

// Export for use in other components
window.PIPELINE_INTEGRATION = PIPELINE_INTEGRATION;
window.initializePipeline = initializePipeline;
window.navigateToPipeline = navigateToPipeline;

// Auto-initialize on load with dependency wait
function waitForDependencies(fn, tries = 40) {
    // Check if Pipeline component exists - if not, just skip initialization
    if (window.storage && window.React) {
        if (!window.Pipeline) {
            console.warn('⚠️ Pipeline component not loaded, skipping integration');
            return false;
        }
        return fn();
    }
    if (tries <= 0) {
        console.warn('⚠️ Pipeline integration dependencies still missing after wait - skipping');
        return false;
    }
    setTimeout(() => waitForDependencies(fn, tries - 1), 250);
    return true;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => waitForDependencies(initializePipeline));
} else {
    waitForDependencies(initializePipeline);
}

console.log('Pipeline Integration loaded');
