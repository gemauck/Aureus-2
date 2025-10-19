#!/usr/bin/env node

/**
 * Simple Deployment Check
 * Focuses only on the most critical issues that would definitely break deployment
 */

import fs from 'fs';

console.log('🔍 Simple Deployment Check...\n');

let hasErrors = false;

// Check 1: Package consistency (critical for Railway deployment)
function checkPackageConsistency() {
    console.log('1️⃣ Checking package consistency...');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
        
        const packageDeps = Object.keys(packageJson.dependencies || {});
        const lockDeps = Object.keys(packageLock.packages?.[""]?.dependencies || {});
        
        const missingDeps = packageDeps.filter(dep => !lockDeps.includes(dep));
        
        if (missingDeps.length > 0) {
            console.log('❌ Dependencies missing from package-lock.json:');
            missingDeps.forEach(dep => {
                console.log(`   📦 ${dep}`);
            });
            hasErrors = true;
        } else {
            console.log('✅ Package dependencies are consistent');
        }
    } catch (error) {
        console.log('❌ Error reading package files:', error.message);
        hasErrors = true;
    }
    console.log('');
}

// Check 2: Look for the specific error we just fixed
function checkSpecificIssues() {
    console.log('2️⃣ Checking for specific known issues...');
    
    let issues = 0;
    
    // Check for the duplicate viewMode issue we just fixed
    if (fs.existsSync('src/components/clients/ClientsMobile.jsx')) {
        const content = fs.readFileSync('src/components/clients/ClientsMobile.jsx', 'utf8');
        const viewModeMatches = content.match(/const\s+\[viewMode/g);
        if (viewModeMatches && viewModeMatches.length > 1) {
            console.log('❌ Found duplicate viewMode declarations in ClientsMobile.jsx');
            issues++;
        }
    }
    
    // Check for undefined function calls we fixed
    const jsFiles = findJSFiles('src');
    jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for the specific patterns we fixed
        if (content.includes('setShowClientModal(') || content.includes('setShowLeadModal(')) {
            console.log(`⚠️ Found potentially undefined function calls in ${file}`);
            issues++;
        }
    });
    
    if (issues === 0) {
        console.log('✅ No specific known issues found');
    } else {
        console.log(`⚠️ Found ${issues} potential issues`);
        hasErrors = true;
    }
    console.log('');
}

// Helper function to find JS files
function findJSFiles(dir) {
    let files = [];
    
    function walkDir(currentPath) {
        if (!fs.existsSync(currentPath)) return;
        
        const items = fs.readdirSync(currentPath);
        
        items.forEach(item => {
            const fullPath = `${currentPath}/${item}`;
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
                walkDir(fullPath);
            } else if (item.endsWith('.js') || item.endsWith('.jsx')) {
                files.push(fullPath);
            }
        });
    }
    
    walkDir(dir);
    return files;
}

// Run checks
checkPackageConsistency();
checkSpecificIssues();

// Summary
console.log('📊 Simple Check Summary:');
if (hasErrors) {
    console.log('❌ ISSUES FOUND - Review before deploying');
    console.log('   Fix the issues above for a safer deployment');
    process.exit(1);
} else {
    console.log('✅ NO CRITICAL ISSUES - Safe to deploy');
    process.exit(0);
}
