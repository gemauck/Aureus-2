#!/usr/bin/env node

/**
 * Quick Deployment Check
 * Focuses on critical errors that would break deployment
 */

import fs from 'fs';
import path from 'path';

console.log('🔍 Quick Deployment Check...\n');

let hasErrors = false;

// Test 1: Check for duplicate variable declarations (critical)
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
                // But only within the same component/function scope
                let braceCount = 0;
                let inFunction = false;
                
                for (let i = index + 1; i < lines.length; i++) {
                    const laterLine = lines[i];
                    
                    // Track function boundaries
                    if (laterLine.includes('const ') && laterLine.includes('= () => {')) {
                        inFunction = true;
                        braceCount = 0;
                    }
                    if (laterLine.includes('}')) {
                        braceCount++;
                    }
                    if (laterLine.includes('{')) {
                        braceCount--;
                    }
                    
                    // If we're outside the current component, stop checking
                    if (inFunction && braceCount > 0) {
                        break;
                    }
                    
                    const duplicateMatch = laterLine.match(/const\s+\[([^,]+),\s*set[A-Z]/);
                    if (duplicateMatch && duplicateMatch[1].trim() === varName) {
                        // Only flag if it's in the same scope (no function boundary between)
                        if (!inFunction || braceCount <= 0) {
                            duplicates.push({
                                file: path.basename(file),
                                line: i + 1,
                                variable: varName,
                                originalLine: index + 1
                            });
                        }
                        break;
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

// Test 2: Check package.json consistency (critical for deployment)
function checkPackageConsistency() {
    console.log('2️⃣ Checking package.json consistency...');
    
    try {
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const packageLock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
        
        // Check if all dependencies in package.json are in package-lock.json
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

// Test 3: Check for obvious syntax errors
function checkSyntaxErrors() {
    console.log('3️⃣ Checking for obvious syntax errors...');
    
    const jsFiles = findJSFiles('src');
    let syntaxErrors = [];
    
    jsFiles.forEach(file => {
        const content = fs.readFileSync(file, 'utf8');
        
        // Check for common syntax issues
        const issues = [
            {
                pattern: /const\s+\[([^,]+),\s*set[A-Z]\w+\]\s*=\s*useState\([^)]*\);\s*\n.*const\s+\[(\1),\s*set[A-Z]\w+\]/,
                message: 'Duplicate useState declaration'
            },
            {
                pattern: /setShowClientModal\(/g,
                message: 'Undefined function setShowClientModal'
            },
            {
                pattern: /setShowLeadModal\(/g,
                message: 'Undefined function setShowLeadModal'
            }
        ];
        
        issues.forEach(({pattern, message}) => {
            if (pattern.test(content)) {
                syntaxErrors.push({
                    file: path.basename(file),
                    message: message
                });
            }
        });
    });
    
    if (syntaxErrors.length > 0) {
        console.log('❌ Found syntax issues:');
        syntaxErrors.slice(0, 5).forEach(error => { // Show only first 5
            console.log(`   📁 ${error.file} - ${error.message}`);
        });
        if (syntaxErrors.length > 5) {
            console.log(`   ... and ${syntaxErrors.length - 5} more issues`);
        }
        hasErrors = true;
    } else {
        console.log('✅ No obvious syntax errors found');
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
            const fullPath = path.join(currentPath, item);
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

// Run tests
checkDuplicateDeclarations();
checkPackageConsistency();
checkSyntaxErrors();

// Summary
console.log('📊 Quick Check Summary:');
if (hasErrors) {
    console.log('❌ CRITICAL ERRORS FOUND - Deployment should be blocked');
    console.log('   Fix the errors above before deploying');
    process.exit(1);
} else {
    console.log('✅ NO CRITICAL ERRORS - Safe to deploy');
    process.exit(0);
}
