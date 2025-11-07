#!/usr/bin/env node

/**
 * Deployment Safety Test Suite
 * Ensures deployments will not result in deletion of the server or data loss
 * 
 * This test suite checks for:
 * - Dangerous file operations (rm -rf, etc.)
 * - Dangerous database operations (DROP, TRUNCATE, --force-reset, etc.)
 * - Dangerous process operations (pm2 delete, server shutdown, etc.)
 * - Missing backups before destructive operations
 * - Dangerous environment variable changes
 * - Rollback capability
 * 
 * Exit code 0 = all tests passed, 1 = tests failed (deployment blocked)
 */

import 'dotenv/config'
import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { execSync } from 'child_process'
import { PrismaClient } from '@prisma/client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = join(__dirname, '..')

// Configuration
const MAX_CRITICAL_FAILURES = 1 // Block deployment on any critical failure

// Test results tracking
const testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    critical: [],
    nonCritical: [],
    startTime: Date.now()
}

// Helper function to log test results
function logTest(name, passed, message = '', isCritical = true, isWarning = false) {
    const status = passed ? '✅' : isWarning ? '⚠️' : '❌'
    const prefix = passed ? 'PASS' : isWarning ? 'WARN' : 'FAIL'
    console.log(`${status} [${prefix}] ${name}: ${message || (passed ? 'OK' : 'FAILED')}`)
    
    const testResult = { name, passed, message, warning: isWarning, critical: isCritical }
    if (passed) {
        testResults.passed++
    } else if (isWarning) {
        testResults.warnings++
    } else {
        testResults.failed++
    }
    
    if (isCritical && !passed && !isWarning) {
        testResults.critical.push(testResult)
    } else {
        testResults.nonCritical.push(testResult)
    }
}

// Get all deployment-related scripts
function getDeploymentScripts() {
    const scripts = []
    const rootFiles = readdirSync(projectRoot)
    
    // Safety scripts that check for dangerous patterns (should be excluded from checks)
    const safetyScripts = [
        'pre-deployment-check.sh',
        'safe-db-migration.sh',
        'deployment-safety-test.js'
    ]
    
    // Legacy/old scripts that are not used in main deployment (warnings only, not critical)
    const legacyScripts = [
        'apply-',  // Old apply scripts
        'migrate-', // Old migrate scripts
        'fix-',    // Old fix scripts
        'deploy-calendar-notes-fix',
        'deploy-client-news',
        'deploy-database-fix',
        'deploy-guest-role',
        'deploy-inventory-fields',
        'deploy-inventory-type-update',
        'deploy-jobcard-fix',
        'deploy-lead-status-fix',
        'deploy-mobile-fixes',
        'deploy-postgresql-fix',
        'deploy-to-droplet',  // Alternative deployment script
        'fix-database-schema',
        'migrate-database',
        'migrate-guest-role',
        'migrate-tags',
        'setup-multi-location-inventory'
    ]
    
    // Check root directory - focus on main deployment script
    for (const file of rootFiles) {
        if (file.match(/^(deploy|apply|migrate|setup|fix|restore|backup|restart).*\.sh$/i)) {
            const filePath = join(projectRoot, file)
            if (statSync(filePath).isFile()) {
                // Skip safety scripts
                if (!safetyScripts.some(s => file.includes(s))) {
                    scripts.push({ path: filePath, isLegacy: legacyScripts.some(pattern => file.includes(pattern)) })
                }
            }
        }
    }
    
    // Check scripts directory
    const scriptsDir = join(projectRoot, 'scripts')
    if (existsSync(scriptsDir)) {
        const scriptFiles = readdirSync(scriptsDir)
        for (const file of scriptFiles) {
            if (file.endsWith('.sh')) {
                // Skip safety scripts
                if (!safetyScripts.some(s => file.includes(s))) {
                    scripts.push({ 
                        path: join(scriptsDir, file), 
                        isLegacy: legacyScripts.some(pattern => file.includes(pattern)) 
                    })
                }
            }
        }
    }
    
    return scripts
}

// Read file content safely
function readFileSafe(filePath) {
    try {
        return readFileSync(filePath, 'utf-8')
    } catch (error) {
        return ''
    }
}

// Test 1: Check for dangerous file deletion operations (CRITICAL)
async function testDangerousFileOperations() {
    console.log('\n🗑️  Testing for Dangerous File Operations (CRITICAL)...')
    
    const dangerousPatterns = [
        { pattern: /rm\s+-rf\s+/i, name: 'rm -rf (recursive force delete)', critical: true },
        { pattern: /rm\s+-r\s+/i, name: 'rm -r (recursive delete)', critical: true },
        { pattern: /rm\s+.*\*\s*$/m, name: 'rm * (delete all files)', critical: true },
        { pattern: /rm\s+.*\/\.\.|rm\s+.*\.\.\/|rm\s+\.\.\s/i, name: 'rm .. (parent directory deletion)', critical: true },
        { pattern: /unlinkSync.*\/|fs\.unlink.*\/|fs\.rmSync.*\//i, name: 'Node.js unlink/rmSync on root paths', critical: true },
        { pattern: /rm\s+-rf\s+node_modules/i, name: 'rm -rf node_modules (acceptable)', critical: false },
        { pattern: /rm\s+-rf\s+\.git/i, name: 'rm -rf .git (acceptable)', critical: false },
    ]
    
    const scripts = getDeploymentScripts()
    let foundDangerous = false
    
    // Focus on main deployment script first
    const mainDeploymentScript = join(projectRoot, 'deploy-production.sh')
    const mainScriptExists = existsSync(mainDeploymentScript)
    
    if (mainScriptExists) {
        const mainContent = readFileSafe(mainDeploymentScript)
        for (const { pattern, name, critical } of dangerousPatterns) {
            if (pattern.test(mainContent) && critical) {
                const lines = mainContent.split('\n')
                lines.forEach((line, index) => {
                    if (pattern.test(line) && !line.trim().startsWith('#')) {
                        const isSafe = line.includes('node_modules') || 
                                      line.includes('.git') || 
                                      line.includes('dist/') ||
                                      line.includes('build/') ||
                                      line.includes('tmp/') ||
                                      line.includes('cache')
                        
                        if (!isSafe) {
                            logTest(
                                `Dangerous File Operation (MAIN DEPLOYMENT): ${name}`,
                                false,
                                `Found in deploy-production.sh:${index + 1} - "${line.trim()}"`,
                                true
                            )
                            foundDangerous = true
                        }
                    }
                })
            }
        }
    }
    
    // Check other scripts (legacy scripts are warnings only)
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const isLegacy = scriptObj.isLegacy || false
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Skip main deployment script (already checked)
        if (scriptName === 'deploy-production.sh') {
            continue
        }
        
        for (const { pattern, name, critical } of dangerousPatterns) {
            if (pattern.test(content)) {
                // Check if it's in a safe context (commented out or in a safe path)
                const lines = content.split('\n')
                lines.forEach((line, index) => {
                    if (pattern.test(line) && !line.trim().startsWith('#')) {
                        // Check if it's targeting safe paths
                        const isSafe = line.includes('node_modules') || 
                                      line.includes('.git') || 
                                      line.includes('dist/') ||
                                      line.includes('build/') ||
                                      line.includes('tmp/') ||
                                      line.includes('cache')
                        
                        if (critical && !isSafe) {
                            // Legacy scripts are warnings, not critical failures
                            if (isLegacy) {
                                logTest(
                                    `Dangerous File Operation (LEGACY): ${name}`,
                                    false,
                                    `Found in legacy script ${scriptName}:${index + 1} - "${line.trim()}"`,
                                    false,
                                    true
                                )
                            } else {
                                logTest(
                                    `Dangerous File Operation: ${name}`,
                                    false,
                                    `Found in ${scriptName}:${index + 1} - "${line.trim()}"`,
                                    true
                                )
                                foundDangerous = true
                            }
                        } else if (!critical && !isSafe) {
                            logTest(
                                `File Operation: ${name}`,
                                true,
                                `Found in ${scriptName} (acceptable context)`,
                                false
                            )
                        }
                    }
                })
            }
        }
    }
    
    if (!foundDangerous) {
        logTest('Dangerous File Operations', true, 'No dangerous file deletion operations found', true)
        return true
    }
    
    return false
}

// Test 2: Check for dangerous database operations (CRITICAL)
async function testDangerousDatabaseOperations() {
    console.log('\n🗄️  Testing for Dangerous Database Operations (CRITICAL)...')
    
    const dangerousPatterns = [
        { pattern: /--force-reset/i, name: 'Prisma --force-reset (deletes all data)', critical: true },
        { pattern: /migrate\s+reset/i, name: 'Prisma migrate reset (deletes all data)', critical: true },
        { pattern: /DROP\s+TABLE/i, name: 'DROP TABLE (table deletion)', critical: true },
        { pattern: /DROP\s+DATABASE/i, name: 'DROP DATABASE (database deletion)', critical: true },
        { pattern: /TRUNCATE\s+TABLE/i, name: 'TRUNCATE TABLE (data deletion)', critical: true },
        { pattern: /DELETE\s+FROM\s+\w+\s*;/i, name: 'DELETE FROM without WHERE (mass deletion)', critical: true },
        { pattern: /db\s+push\s+--accept-data-loss/i, name: 'db push --accept-data-loss (data loss)', critical: true },
        { pattern: /--accept-data-loss/i, name: '--accept-data-loss flag', critical: false }, // Warning only if no backup
    ]
    
    const scripts = getDeploymentScripts()
    let foundDangerous = false
    
    // Focus on main deployment script first
    const mainDeploymentScript = join(projectRoot, 'deploy-production.sh')
    const mainScriptExists = existsSync(mainDeploymentScript)
    
    if (mainScriptExists) {
        const mainContent = readFileSafe(mainDeploymentScript)
        for (const { pattern, name, critical } of dangerousPatterns) {
            if (pattern.test(mainContent) && critical) {
                const lines = mainContent.split('\n')
                lines.forEach((line, index) => {
                    if (pattern.test(line) && !line.trim().startsWith('#')) {
                        const hasBackup = mainContent.toLowerCase().includes('backup') ||
                                        mainContent.toLowerCase().includes('pg_dump') ||
                                        mainContent.toLowerCase().includes('dump') ||
                                        mainContent.toLowerCase().includes('.sql')
                        
                        if (!hasBackup && name.includes('--accept-data-loss')) {
                            logTest(
                                `Dangerous Database Operation (MAIN DEPLOYMENT): ${name}`,
                                false,
                                `Found in deploy-production.sh:${index + 1} without backup - "${line.trim()}"`,
                                true
                            )
                            foundDangerous = true
                        } else if (critical) {
                            logTest(
                                `Dangerous Database Operation (MAIN DEPLOYMENT): ${name}`,
                                false,
                                `Found in deploy-production.sh:${index + 1} - "${line.trim()}"`,
                                true
                            )
                            foundDangerous = true
                        }
                    }
                })
            }
        }
    }
    
    // Check other scripts (legacy scripts are warnings only)
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const isLegacy = scriptObj.isLegacy || false
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Skip main deployment script (already checked)
        if (scriptName === 'deploy-production.sh') {
            continue
        }
        
        for (const { pattern, name, critical } of dangerousPatterns) {
            if (pattern.test(content)) {
                const lines = content.split('\n')
                lines.forEach((line, index) => {
                    if (pattern.test(line) && !line.trim().startsWith('#')) {
                        if (critical) {
                            // Legacy scripts are warnings, not critical failures
                            if (isLegacy) {
                                logTest(
                                    `Dangerous Database Operation (LEGACY): ${name}`,
                                    false,
                                    `Found in legacy script ${scriptName}:${index + 1} - "${line.trim()}"`,
                                    false,
                                    true
                                )
                            } else {
                                // Check if backup exists before this operation
                                const hasBackup = content.toLowerCase().includes('backup') ||
                                                content.toLowerCase().includes('pg_dump') ||
                                                content.toLowerCase().includes('dump') ||
                                                content.toLowerCase().includes('.sql')
                                
                                if (!hasBackup && name.includes('--accept-data-loss')) {
                                    logTest(
                                        `Dangerous Database Operation: ${name}`,
                                        false,
                                        `Found in ${scriptName}:${index + 1} without backup - "${line.trim()}"`,
                                        true
                                    )
                                    foundDangerous = true
                                } else if (critical) {
                                    logTest(
                                        `Dangerous Database Operation: ${name}`,
                                        false,
                                        `Found in ${scriptName}:${index + 1} - "${line.trim()}"`,
                                        true
                                    )
                                    foundDangerous = true
                                }
                            }
                        } else {
                            // Warning for --accept-data-loss without backup check
                            const hasBackup = content.toLowerCase().includes('backup') ||
                                            content.toLowerCase().includes('pg_dump')
                            if (!hasBackup) {
                                logTest(
                                    `Database Operation Warning: ${name}`,
                                    false,
                                    `Found in ${scriptName}:${index + 1} without explicit backup - "${line.trim()}"`,
                                    false,
                                    true
                                )
                            }
                        }
                    }
                })
            }
        }
    }
    
    // Check Prisma schema for dangerous operations
    const prismaSchemaPath = join(projectRoot, 'prisma', 'schema.prisma')
    if (existsSync(prismaSchemaPath)) {
        const schemaContent = readFileSafe(prismaSchemaPath)
        if (/@@map|@map/i.test(schemaContent)) {
            // Schema has mappings, which is safe
            logTest('Prisma Schema', true, 'Schema uses safe mapping operations', false)
        }
    }
    
    // Note: Many scripts use --accept-data-loss as a fallback, which is risky
    // but acceptable if they're using migrate deploy first (which is safer)
    // We flag them as warnings, not critical failures, since they're fallbacks
    
    if (!foundDangerous) {
        logTest('Dangerous Database Operations', true, 'No dangerous database operations found', true)
        return true
    }
    
    return false
}

// Test 3: Check for dangerous process operations (CRITICAL)
async function testDangerousProcessOperations() {
    console.log('\n⚙️  Testing for Dangerous Process Operations (CRITICAL)...')
    
    const dangerousPatterns = [
        { pattern: /pm2\s+delete\s+abcotronics-erp/i, name: 'pm2 delete (process deletion)', critical: true },
        { pattern: /pm2\s+delete\s+all/i, name: 'pm2 delete all (all processes)', critical: true },
        { pattern: /systemctl\s+stop\s+abcotronics/i, name: 'systemctl stop (service stop)', critical: false },
        { pattern: /systemctl\s+disable\s+abcotronics/i, name: 'systemctl disable (service disable)', critical: true },
        { pattern: /killall\s+node/i, name: 'killall node (kill all node processes)', critical: true },
        { pattern: /pkill\s+-9\s+node/i, name: 'pkill -9 node (force kill)', critical: true },
        { pattern: /shutdown\s+-h\s+now/i, name: 'shutdown -h now (server shutdown)', critical: true },
        { pattern: /reboot/i, name: 'reboot command', critical: false }, // Warning only
    ]
    
    const scripts = getDeploymentScripts()
    let foundDangerous = false
    
    // Focus on main deployment script first
    const mainDeploymentScript = join(projectRoot, 'deploy-production.sh')
    const mainScriptExists = existsSync(mainDeploymentScript)
    
    if (mainScriptExists) {
        const mainContent = readFileSafe(mainDeploymentScript)
        for (const { pattern, name, critical } of dangerousPatterns) {
            if (pattern.test(mainContent) && critical) {
                const lines = mainContent.split('\n')
                lines.forEach((line, index) => {
                    if (pattern.test(line) && !line.trim().startsWith('#')) {
                        logTest(
                            `Dangerous Process Operation (MAIN DEPLOYMENT): ${name}`,
                            false,
                            `Found in deploy-production.sh:${index + 1} - "${line.trim()}"`,
                            true
                        )
                        foundDangerous = true
                    }
                })
            }
        }
    }
    
    // Check other scripts (legacy scripts are warnings only)
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const isLegacy = scriptObj.isLegacy || false
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Skip main deployment script (already checked)
        if (scriptName === 'deploy-production.sh') {
            continue
        }
        
        for (const { pattern, name, critical } of dangerousPatterns) {
            if (pattern.test(content)) {
                const lines = content.split('\n')
                lines.forEach((line, index) => {
                    if (pattern.test(line) && !line.trim().startsWith('#')) {
                        if (critical) {
                            // Legacy scripts are warnings, not critical failures
                            if (isLegacy) {
                                logTest(
                                    `Dangerous Process Operation (LEGACY): ${name}`,
                                    false,
                                    `Found in legacy script ${scriptName}:${index + 1} - "${line.trim()}"`,
                                    false,
                                    true
                                )
                            } else {
                                logTest(
                                    `Dangerous Process Operation: ${name}`,
                                    false,
                                    `Found in ${scriptName}:${index + 1} - "${line.trim()}"`,
                                    true
                                )
                                foundDangerous = true
                            }
                        } else {
                            logTest(
                                `Process Operation Warning: ${name}`,
                                false,
                                `Found in ${scriptName}:${index + 1} - "${line.trim()}"`,
                                false,
                                true
                            )
                        }
                    }
                })
            }
        }
    }
    
    if (!foundDangerous) {
        logTest('Dangerous Process Operations', true, 'No dangerous process operations found', true)
        return true
    }
    
    return false
}

// Test 4: Check for backup procedures before destructive operations (CRITICAL)
async function testBackupProcedures() {
    console.log('\n💾 Testing Backup Procedures (CRITICAL)...')
    
    const scripts = getDeploymentScripts()
    let hasBackupScript = false
    let scriptsWithDestructiveOps = []
    
    // Check if backup script exists
    const backupScriptPath = join(projectRoot, 'scripts', 'backup-database.sh')
    if (existsSync(backupScriptPath)) {
        hasBackupScript = true
        logTest('Backup Script Exists', true, 'scripts/backup-database.sh found', false)
    } else {
        logTest('Backup Script Exists', false, 'scripts/backup-database.sh not found', false, true)
    }
    
    // Check deployment scripts for destructive operations without backups
    // Focus on main deployment script
    const mainDeploymentScript = join(projectRoot, 'deploy-production.sh')
    if (existsSync(mainDeploymentScript)) {
        const mainContent = readFileSafe(mainDeploymentScript)
        // Only flag actual destructive operations (not just mentions in comments/variable names)
        // Look for actual command execution, not just text
        const hasDestructiveOp = /(npx\s+prisma\s+(migrate\s+reset|db\s+push\s+--accept-data-loss)|DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;)/i.test(mainContent)
        const hasBackup = /backup|pg_dump|dump|\.sql/i.test(mainContent)
        
        if (hasDestructiveOp && !hasBackup) {
            scriptsWithDestructiveOps.push('deploy-production.sh (MAIN DEPLOYMENT)')
        }
    }
    
    // Check other scripts (warnings only for legacy scripts)
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const isLegacy = scriptObj.isLegacy || false
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Skip main deployment script (already checked)
        if (scriptName === 'deploy-production.sh') {
            continue
        }
        
        // Check for destructive operations
        // Only flag actual destructive operations (not just mentions in comments/variable names)
        const hasDestructiveOp = /(npx\s+prisma\s+(migrate\s+reset|db\s+push\s+--accept-data-loss)|DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM\s+\w+\s*;)/i.test(content)
        const hasBackup = /backup|pg_dump|dump|\.sql/i.test(content)
        
        // Only flag non-legacy scripts as critical
        if (hasDestructiveOp && !hasBackup && !scriptName.includes('backup') && !isLegacy) {
            scriptsWithDestructiveOps.push(scriptName)
        }
    }
    
    if (scriptsWithDestructiveOps.length > 0) {
        logTest(
            'Backup Before Destructive Operations',
            false,
            `Found ${scriptsWithDestructiveOps.length} script(s) with destructive operations but no backup: ${scriptsWithDestructiveOps.join(', ')}`,
            true
        )
        return false
    }
    
    logTest('Backup Procedures', true, 'All destructive operations have backup procedures', true)
    return true
}

// Test 5: Check for dangerous environment variable changes (CRITICAL)
async function testEnvironmentVariableSafety() {
    console.log('\n🔐 Testing Environment Variable Safety (CRITICAL)...')
    
    const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL']
    const criticalEnvVars = ['DATABASE_URL', 'JWT_SECRET']
    
    // Check if required env vars are set
    let allPresent = true
    for (const varName of requiredEnvVars) {
        const isSet = !!process.env[varName] || process.env.DEV_LOCAL_NO_DB === 'true'
        if (!isSet && varName === 'DATABASE_URL' && process.env.DEV_LOCAL_NO_DB === 'true') {
            logTest(`Env Var: ${varName}`, true, 'Skipped (DEV_LOCAL_NO_DB=true)', false)
        } else {
            logTest(`Env Var: ${varName}`, isSet, isSet ? 'Set' : 'Missing', varName === 'JWT_SECRET')
            if (!isSet && criticalEnvVars.includes(varName)) {
                allPresent = false
            }
        }
    }
    
    // Check deployment scripts for hardcoded credentials
    // Focus on main deployment script
    const mainDeploymentScript = join(projectRoot, 'deploy-production.sh')
    let foundHardcoded = false
    
    if (existsSync(mainDeploymentScript)) {
        const mainContent = readFileSafe(mainDeploymentScript)
        if (/postgresql:\/\/.*:.*@/.test(mainContent) || /password\s*=\s*['"]/.test(mainContent)) {
            logTest(
                'Hardcoded Credentials (MAIN DEPLOYMENT)',
                false,
                `Possible hardcoded credentials in deploy-production.sh`,
                true
            )
            foundHardcoded = true
        }
    }
    
    // Check other scripts (warnings only)
    const scripts = getDeploymentScripts()
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Skip main deployment script (already checked)
        if (scriptName === 'deploy-production.sh') {
            continue
        }
        
        // Check for hardcoded database URLs or passwords
        if (/postgresql:\/\/.*:.*@/.test(content) || /password\s*=\s*['"]/.test(content)) {
            logTest(
                'Hardcoded Credentials',
                false,
                `Possible hardcoded credentials in ${scriptName}`,
                false,
                true
            )
            foundHardcoded = true
        }
    }
    
    if (!allPresent && !process.env.DEV_LOCAL_NO_DB) {
        logTest('Environment Variables', false, 'Required environment variables missing', true)
        return false
    }
    
    logTest('Environment Variable Safety', true, 'Environment variables are safe', true)
    return true
}

// Test 5b: Validate database connection and prevent wrong database (CRITICAL)
async function testDatabaseConnectionValidation() {
    console.log('\n🗄️  Testing Database Connection Validation (CRITICAL)...')
    
    // Skip if DEV_LOCAL_NO_DB is set
    if (process.env.DEV_LOCAL_NO_DB === 'true') {
        logTest('Database Connection Validation', true, 'Skipped (DEV_LOCAL_NO_DB=true)', false)
        return true
    }
    
    // Check if DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
        logTest('DATABASE_URL Set', false, 'DATABASE_URL environment variable is not set', true)
        return false
    }
    
    const dbUrl = process.env.DATABASE_URL
    logTest('DATABASE_URL Set', true, `Database URL configured (${dbUrl.substring(0, 50)}...)`, true)
    
    // Check for dangerous localhost/local connections in production
    const isProduction = process.env.NODE_ENV === 'production' || 
                        process.env.APP_URL?.includes('abcoafrica.co.za') ||
                        process.env.APP_URL?.includes('https://')
    
    if (isProduction) {
        // In production, block localhost connections
        const localhostPatterns = [
            /localhost/i,
            /127\.0\.0\.1/,
            /file:\.\/prisma\/dev\.db/i,  // SQLite file
            /postgresql:\/\/.*@localhost/i,
            /postgresql:\/\/.*@127\.0\.0\.1/i
        ]
        
        for (const pattern of localhostPatterns) {
            if (pattern.test(dbUrl)) {
                logTest(
                    'Production Database URL',
                    false,
                    `DATABASE_URL points to localhost/local file in production: ${dbUrl.substring(0, 60)}...`,
                    true
                )
                return false
            }
        }
        
        // In production, expect DigitalOcean database host
        const expectedHostPatterns = [
            /\.db\.ondigitalocean\.com/i,
            /dbaas-db-.*-do-use\.l\.db\.ondigitalocean\.com/i
        ]
        
        const hasExpectedHost = expectedHostPatterns.some(pattern => pattern.test(dbUrl))
        if (!hasExpectedHost) {
            logTest(
                'Production Database Host',
                false,
                `DATABASE_URL does not match expected DigitalOcean host pattern in production: ${dbUrl.substring(0, 80)}...`,
                true
            )
            return false
        }
        
        logTest('Production Database URL', true, 'DATABASE_URL points to DigitalOcean database', true)
    }
    
    // Check .env.local file doesn't override DATABASE_URL incorrectly in production
    const envLocalPath = join(projectRoot, '.env.local')
    if (existsSync(envLocalPath)) {
        const envLocalContent = readFileSafe(envLocalPath)
        const envLocalDbUrl = envLocalContent
            .split('\n')
            .find(line => line.trim().startsWith('DATABASE_URL') && !line.trim().startsWith('#'))
        
        if (envLocalDbUrl) {
            const envLocalUrlValue = envLocalDbUrl.split('=')[1]?.trim().replace(/^["']|["']$/g, '')
            
            // Only check if .env.local is overriding with localhost in production
            if (isProduction && envLocalUrlValue) {
                const isLocalhost = /localhost|127\.0\.0\.1|file:\.\/prisma\/dev\.db/i.test(envLocalUrlValue)
                if (isLocalhost) {
                    logTest(
                        '.env.local Override',
                        false,
                        '.env.local is overriding DATABASE_URL with localhost in production - this will cause the server to connect to the wrong database!',
                        true
                    )
                    return false
                } else {
                    logTest('.env.local Override', true, '.env.local DATABASE_URL is safe for production', false)
                }
            } else if (!isProduction) {
                // In development, .env.local with localhost is fine
                logTest('.env.local Override', true, '.env.local exists (development mode - localhost is OK)', false)
            }
        }
    }
    
    // Test actual database connection
    let prisma = null
    try {
        prisma = new PrismaClient()
        await prisma.$connect()
        logTest('Database Connection', true, 'Successfully connected to database', true)
        
        // Check database has data (not empty)
        try {
            const userCount = await prisma.user.count()
            const clientCount = await prisma.client.count()
            const totalRecords = userCount + clientCount
            
            if (totalRecords === 0 && isProduction) {
                logTest(
                    'Database Contains Data',
                    false,
                    'Database appears to be empty (0 users, 0 clients) - possible wrong database connection',
                    true
                )
                await prisma.$disconnect()
                return false
            }
            
            logTest(
                'Database Contains Data',
                true,
                `Database has data (${userCount} users, ${clientCount} clients)`,
                true
            )
        } catch (countError) {
            logTest(
                'Database Contains Data',
                false,
                `Could not verify database contents: ${countError.message}`,
                true
            )
            await prisma.$disconnect()
            return false
        }
        
        // Verify we can query clients table specifically
        try {
            const clientsWithType = await prisma.client.count({ where: { type: 'client' } })
            if (isProduction && clientsWithType === 0) {
                logTest(
                    'Database Client Records',
                    false,
                    'No clients found in database - possible data issue or wrong database',
                    false,
                    true
                )
            } else {
                logTest(
                    'Database Client Records',
                    true,
                    `Found ${clientsWithType} client records`,
                    false
                )
            }
        } catch (queryError) {
            // Non-critical - might be schema issue
            logTest(
                'Database Client Records',
                false,
                `Could not query clients: ${queryError.message}`,
                false,
                true
            )
        }
        
        await prisma.$disconnect()
        return true
        
    } catch (connectionError) {
        logTest(
            'Database Connection',
            false,
            `Failed to connect to database: ${connectionError.message}`,
            true
        )
        
        if (prisma) {
            try {
                await prisma.$disconnect()
            } catch (e) {
                // Ignore disconnect errors
            }
        }
        
        return false
    }
}

// Test 6: Check for rollback capability (NON-CRITICAL)
async function testRollbackCapability() {
    console.log('\n🔄 Testing Rollback Capability (NON-CRITICAL)...')
    
    const restoreScriptPath = join(projectRoot, 'scripts', 'restore-from-backup.sh')
    const hasRestoreScript = existsSync(restoreScriptPath)
    
    if (hasRestoreScript) {
        logTest('Rollback Script', true, 'scripts/restore-from-backup.sh exists', false)
    } else {
        logTest('Rollback Script', false, 'scripts/restore-from-backup.sh not found', false, true)
    }
    
    // Check if git is available for rollback
    try {
        execSync('git --version', { stdio: 'ignore' })
        logTest('Git Available', true, 'Git available for code rollback', false)
    } catch (error) {
        logTest('Git Available', false, 'Git not available', false, true)
    }
    
    return true
}

// Test 7: Check deployment scripts use safe migration wrapper (CRITICAL)
async function testSafeMigrationWrapper() {
    console.log('\n🛡️  Testing Safe Migration Wrapper Usage (CRITICAL)...')
    
    const safeWrapperPath = join(projectRoot, 'scripts', 'safe-db-migration.sh')
    const hasSafeWrapper = existsSync(safeWrapperPath)
    
    if (!hasSafeWrapper) {
        logTest('Safe Migration Wrapper', false, 'scripts/safe-db-migration.sh not found', true)
        return false
    }
    
    logTest('Safe Migration Wrapper Exists', true, 'scripts/safe-db-migration.sh found', false)
    
    // Check if deployment scripts use the safe wrapper
    // Focus on main deployment script
    const mainDeploymentScript = join(projectRoot, 'deploy-production.sh')
    let scriptsUsingWrapper = 0
    let scriptsNotUsingWrapper = []
    
    if (existsSync(mainDeploymentScript)) {
        const mainContent = readFileSafe(mainDeploymentScript)
        const hasDbOps = /prisma\s+(migrate|db\s+push)/i.test(mainContent)
        
        if (hasDbOps) {
            if (mainContent.includes('safe-db-migration.sh') || mainContent.includes('scripts/safe-db-migration')) {
                scriptsUsingWrapper++
            } else {
                scriptsNotUsingWrapper.push('deploy-production.sh (MAIN DEPLOYMENT)')
            }
        }
    }
    
    // Check other scripts (warnings only for legacy scripts)
    const scripts = getDeploymentScripts()
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const isLegacy = scriptObj.isLegacy || false
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Skip the wrapper script itself and main deployment script
        if (scriptName.includes('safe-db-migration') || scriptName === 'deploy-production.sh') {
            continue
        }
        
        // Check if script has database operations
        const hasDbOps = /prisma\s+(migrate|db\s+push)/i.test(content)
        
        if (hasDbOps) {
            if (content.includes('safe-db-migration.sh') || content.includes('scripts/safe-db-migration')) {
                scriptsUsingWrapper++
            } else if (!isLegacy) {
                // Only flag non-legacy scripts as critical
                scriptsNotUsingWrapper.push(scriptName)
            }
        }
    }
    
    if (scriptsNotUsingWrapper.length > 0) {
        logTest(
            'Migration Wrapper Usage',
            false,
            `Found ${scriptsNotUsingWrapper.length} script(s) with database operations not using safe wrapper: ${scriptsNotUsingWrapper.join(', ')}`,
            true
        )
        return false
    }
    
    if (scriptsUsingWrapper > 0) {
        logTest('Migration Wrapper Usage', true, `${scriptsUsingWrapper} script(s) using safe wrapper`, false)
    }
    
    logTest('Safe Migration Wrapper', true, 'All database operations use safe wrapper', true)
    return true
}

// Test 8: Check for dangerous npm operations (NON-CRITICAL)
async function testDangerousNpmOperations() {
    console.log('\n📦 Testing NPM Operations (NON-CRITICAL)...')
    
    const scripts = getDeploymentScripts()
    let foundDangerous = false
    
    for (const scriptObj of scripts) {
        const scriptPath = scriptObj.path || scriptObj
        const content = readFileSafe(scriptPath)
        const scriptName = scriptPath.replace(projectRoot + '/', '')
        
        // Check for npm operations that could break the server
        if (/npm\s+uninstall\s+express|npm\s+uninstall\s+@prisma/i.test(content)) {
            logTest(
                'Dangerous NPM Operation',
                false,
                `Found uninstall of critical package in ${scriptName}`,
                false,
                true
            )
            foundDangerous = true
        }
    }
    
    if (!foundDangerous) {
        logTest('NPM Operations', true, 'No dangerous NPM operations found', false)
    }
    
    return true
}

// Main test runner
async function runAllTests() {
    console.log('🛡️  Starting Deployment Safety Test Suite')
    console.log('='.repeat(60))
    console.log('This suite ensures deployments will not result in server deletion')
    console.log('='.repeat(60))
    
    try {
        // Run critical tests first
        const criticalTests = [
            testDangerousFileOperations,
            testDangerousDatabaseOperations,
            testDangerousProcessOperations,
            testBackupProcedures,
            testEnvironmentVariableSafety,
            testDatabaseConnectionValidation,
            testSafeMigrationWrapper,
        ]
        
        for (const test of criticalTests) {
            try {
                const result = await test()
                if (!result && testResults.critical.length >= MAX_CRITICAL_FAILURES) {
                    console.log(`\n❌ Critical failures detected. Aborting remaining tests.`)
                    break
                }
            } catch (error) {
                logTest(`Test: ${test.name}`, false, error.message, true)
            }
        }
        
        // Run non-critical tests
        const nonCriticalTests = [
            testRollbackCapability,
            testDangerousNpmOperations,
        ]
        
        for (const test of nonCriticalTests) {
            try {
                await test()
            } catch (error) {
                logTest(`Test: ${test.name}`, false, error.message, false)
            }
        }
        
        // Print summary
        const duration = ((Date.now() - testResults.startTime) / 1000).toFixed(2)
        console.log('\n' + '='.repeat(60))
        console.log('📊 Test Summary')
        console.log('='.repeat(60))
        console.log(`✅ Passed: ${testResults.passed}`)
        console.log(`⚠️  Warnings: ${testResults.warnings}`)
        console.log(`❌ Failed: ${testResults.failed}`)
        console.log(`📈 Total: ${testResults.passed + testResults.failed + testResults.warnings}`)
        console.log(`⏱️  Duration: ${duration}s`)
        
        if (testResults.critical.length > 0) {
            console.log('\n❌ Critical Failures (DEPLOYMENT BLOCKED):')
            testResults.critical.forEach(failure => {
                console.log(`   - ${failure.name}: ${failure.message}`)
            })
        }
        
        if (testResults.nonCritical.length > 0 && testResults.nonCritical.some(f => !f.passed && !f.warning)) {
            console.log('\n⚠️  Non-Critical Failures:')
            testResults.nonCritical
                .filter(f => !f.passed && !f.warning)
                .forEach(failure => {
                    console.log(`   - ${failure.name}: ${failure.message}`)
                })
        }
        
        // Determine exit code
        const hasCriticalFailures = testResults.critical.length > 0
        
        if (hasCriticalFailures) {
            console.log('\n❌ DEPLOYMENT BLOCKED: Critical safety tests failed!')
            console.log('   Please fix the issues above before deploying.')
            console.log('   These issues could result in server deletion or data loss.')
            process.exit(1)
        } else if (testResults.failed > 0) {
            console.log('\n⚠️  Some non-critical tests failed, but deployment can proceed.')
            console.log('   Review warnings before deploying.')
            process.exit(0)
        } else {
            console.log('\n🎉 All safety tests passed! Deployment is safe to proceed.')
            process.exit(0)
        }
    } catch (error) {
        console.error('\n❌ Fatal error during safety testing:', error)
        console.error('   Deployment is BLOCKED due to test suite failure.')
        process.exit(1)
    }
}

// Run tests
runAllTests()

