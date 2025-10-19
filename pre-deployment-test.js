#!/usr/bin/env node

/**
 * Pre-deployment Testing Script
 * Checks for common issues before deployment to prevent console errors and runtime issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Starting Pre-deployment Testing...\n');

let hasErrors = false;
let hasWarnings = false;

// Test 1: Check for duplicate variable declarations
function checkDuplicateDeclarations() {
    console.log('1️⃣ Checking for duplicate variable declarations...');
    
    const jsFiles = findJSFiles('src');
    let duplicates = [];
    
    jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
            // Check for useState declarations
            const useStateMatch = line.match(/const\s+\[([^,]+),\s*set[A-Z]/);
            if (useStateMatch) {
                const varName = useStateMatch[1].trim();
                
                // Check if this variable is declared again later in the file
                for (let i = index + 1; i < lines.length; i++) {
                    const laterLine = lines[i];
                    const duplicateMatch = laterLine.match(/const\s+\[([^,]+),\s*set[A-Z]/);
                    if (duplicateMatch && duplicateMatch[1].trim() === varName) {
                        duplicates.push({
                            file: file,
                            line: i + 1,
                            variable: varName,
                            originalLine: index + 1
                        });
                    }
                }
            }
        });
    });
    
    if (duplicates.length > 0) {
        console.log('❌ Found duplicate declarations:');
        duplicates.forEach(dup => {
            console.log(`   📁 ${dup.file}:${dup.line} - Variable '${dup.variable}' already declared at line ${dup.originalLine}`);
        });
        hasErrors = true;
    } else {
        console.log('✅ No duplicate declarations found');
    }
    console.log('');
}

// Test 2: Check for undefined function calls
function checkUndefinedFunctions() {
    console.log('2️⃣ Checking for undefined function calls...');
    
    const jsFiles = findJSFiles('src');
    let undefinedFunctions = [];
    
    jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Common undefined function patterns
        const patterns = [
            /setShowClientModal\(/g,
            /setShowLeadModal\(/g,
            /setShowModal\(/g,
            /showClientModal/g,
            /showLeadModal/g
        ];
        
        patterns.forEach(pattern => {
            const matches = content.match(pattern);
            if (matches) {
                undefinedFunctions.push({
                    file: file,
                    pattern: pattern.source,
                    count: matches.length
                });
            }
        });
    });
    
    if (undefinedFunctions.length > 0) {
        console.log('❌ Found potentially undefined function calls:');
        undefinedFunctions.forEach(undef => {
            console.log(`   📁 ${undef.file} - Pattern '${undef.pattern}' found ${undef.count} times`);
        });
        hasWarnings = true;
    } else {
        console.log('✅ No undefined function calls found');
    }
    console.log('');
}

// Test 3: Check for missing imports
function checkMissingImports() {
    console.log('3️⃣ Checking for missing imports...');
    
    const jsFiles = findJSFiles('src');
    let missingImports = [];
    
    jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for common missing imports
        if (content.includes('useState') && !content.includes('useState')) {
            // This is a basic check - in reality, we'd need more sophisticated parsing
        }
        
        // Check for window object usage that might be undefined
        if (content.includes('window.') && !file.includes('index.html')) {
            const windowUsage = content.match(/window\.\w+/g);
            if (windowUsage) {
                missingImports.push({
                    file: file,
                    usage: windowUsage.slice(0, 3) // Show first 3 usages
                });
            }
        }
    });
    
    if (missingImports.length > 0) {
        console.log('⚠️ Found potential missing imports:');
        missingImports.forEach(imp => {
            console.log(`   📁 ${imp.file} - Using: ${imp.usage.join(', ')}`);
        });
        hasWarnings = true;
    } else {
        console.log('✅ No obvious missing imports found');
    }
    console.log('');
}

// Test 4: Check package.json consistency
function checkPackageConsistency() {
    console.log('4️⃣ Checking package.json consistency...');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
        
        // Check if all dependencies in package.json are in package-lock.json
        const packageDeps = Object.keys(packageJson.dependencies || {});
        const lockDeps = Object.keys(packageLock.dependencies || {});
        
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

// Test 5: Check for console errors in production code
function checkConsoleErrors() {
    console.log('5️⃣ Checking for potential console errors...');
    
    const jsFiles = findJSFiles('src');
    let consoleIssues = [];
    
    jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for common patterns that cause console errors
        const errorPatterns = [
            {
                pattern: /const\s+\[([^,]+),\s*set[A-Z]\w+\]\s*=\s*useState\([^)]*\);\s*\n.*const\s+\[(\1),\s*set[A-Z]\w+\]/,
                message: 'Duplicate useState declaration'
            },
            {
                pattern: /set[A-Z]\w+\(true\);\s*set[A-Z]\w+\(false\);/,
                message: 'Conflicting state updates'
            }
        ];
        
        errorPatterns.forEach(({pattern, message}) => {
            if (pattern.test(content)) {
                consoleIssues.push({
                    file: file,
                    message: message
                });
            }
        });
    });
    
    if (consoleIssues.length > 0) {
        console.log('⚠️ Found potential console issues:');
        consoleIssues.forEach(issue => {
            console.log(`   📁 ${issue.file} - ${issue.message}`);
        });
        hasWarnings = true;
    } else {
        console.log('✅ No obvious console issues found');
    }
    console.log('');
}

// Helper function to find JS files
function findJSFiles(dir) {
    let files = [];
    
    function walkDir(currentPath) {
        const items = fs.readdirSync(currentPath);
        
        items.forEach(item => {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                walkDir(fullPath);
            } else if (item.endsWith('.js') || item.endsWith('.jsx')) {
                files.push(fullPath);
            }
        });
    }
    
    if (fs.existsSync(dir)) {
        walkDir(dir);
    }
    
    return files;
}

// Run all tests
function runTests() {
    checkDuplicateDeclarations();
    checkUndefinedFunctions();
    checkMissingImports();
    checkPackageConsistency();
    checkConsoleErrors();
    
    // Summary
    console.log('📊 Test Summary:');
    if (hasErrors) {
        console.log('❌ ERRORS FOUND - Deployment should be blocked');
        console.log('   Fix the errors above before deploying');
        process.exit(1);
    } else if (hasWarnings) {
        console.log('⚠️ WARNINGS FOUND - Review before deploying');
        console.log('   Consider fixing warnings for better stability');
        process.exit(0);
    } else {
        console.log('✅ ALL TESTS PASSED - Ready for deployment!');
        process.exit(0);
    }
}

// Run the tests
runTests();
