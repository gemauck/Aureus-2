#!/usr/bin/env node
/**
 * Component Dependency Validator
 * 
 * Validates that components are loaded in the correct order in lazy-load-components.js
 * Run this before committing to catch dependency issues early.
 */

const fs = require('fs');
const path = require('path');

// Component dependency map
const DEPENDENCIES = {
    'ProjectDetail': ['ProjectModal', 'ListModal', 'TaskDetailModal', 'KanbanView', 'CustomFieldModal', 'CommentsPopup', 'DocumentCollectionModal', 'MonthlyDocumentCollectionTracker'],
    'Projects': ['ProjectDetail', 'ProjectModal'],
    'Clients': ['ClientDetailModal', 'LeadDetailModal'],
};

// Load lazy-load-components.js
const lazyLoaderPath = path.join(__dirname, '..', 'lazy-load-components.js');
const lazyLoaderContent = fs.readFileSync(lazyLoaderPath, 'utf8');

// Extract component file paths
const componentFilesMatch = lazyLoaderContent.match(/componentFiles\s*=\s*\[([\s\S]*?)\]/);
if (!componentFilesMatch) {
    console.error('❌ Could not find componentFiles array in lazy-load-components.js');
    process.exit(1);
}

const componentFilesContent = componentFilesMatch[1];
const componentPaths = componentFilesContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.match(/^'\.\/src\/.*\.jsx?'/))
    .map(line => line.replace(/['"]/g, '').replace(/,?\s*$/, ''));

// Convert paths to component names
const getComponentName = (filePath) => {
    const fileName = path.basename(filePath, path.extname(filePath));
    return fileName;
};

// Build dependency map with indices
const componentIndices = {};
componentPaths.forEach((filePath, index) => {
    const componentName = getComponentName(filePath);
    if (!componentIndices[componentName]) {
        componentIndices[componentName] = [];
    }
    componentIndices[componentName].push(index);
});

// Validate dependencies
let hasErrors = false;

Object.keys(DEPENDENCIES).forEach(component => {
    const deps = DEPENDENCIES[component];
    const componentIndex = componentIndices[component]?.[0];
    
    if (componentIndex === undefined) {
        console.warn(`⚠️  ${component} not found in lazy-loader`);
        return;
    }
    
    deps.forEach(dep => {
        const depIndex = componentIndices[dep]?.[0];
        
        if (depIndex === undefined) {
            console.warn(`⚠️  ${dep} (dependency of ${component}) not found in lazy-loader`);
            return;
        }
        
        if (depIndex >= componentIndex) {
            console.error(`❌ ERROR: ${dep} (dependency of ${component}) is loaded AFTER ${component}`);
            console.error(`   ${dep} at index ${depIndex}, ${component} at index ${componentIndex}`);
            hasErrors = true;
        } else {
            console.log(`✅ ${dep} (dependency of ${component}) loads before ${component}`);
        }
    });
});

if (hasErrors) {
    console.error('\n❌ Dependency validation failed! Fix the load order in lazy-load-components.js');
    process.exit(1);
} else {
    console.log('\n✅ All dependencies validated successfully!');
    process.exit(0);
}
