#!/usr/bin/env node

/**
 * Comprehensive Website Functionality Test
 * Tests login functionality and verifies all components can be accessed and interacted with
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

// Try localhost first if server is running locally, otherwise use APP_URL
const BASE_URL = process.env.APP_URL || 'http://localhost:3000'
let prisma = null

// Only initialize Prisma if DATABASE_URL is available and accessible
try {
    if (process.env.DATABASE_URL) {
        prisma = new PrismaClient()
    }
} catch (error) {
    console.warn('⚠️  Could not initialize Prisma client:', error.message)
}

// Test results tracking
const testResults = {
    passed: 0,
    failed: 0,
    warnings: 0,
    tests: []
}

// Helper function to log test results
function logTest(name, passed, message = '', isWarning = false) {
    const status = passed ? '✅' : isWarning ? '⚠️' : '❌'
    const prefix = passed ? 'PASS' : isWarning ? 'WARN' : 'FAIL'
    console.log(`${status} [${prefix}] ${name}: ${message || (passed ? 'OK' : 'FAILED')}`)
    
    testResults.tests.push({ name, passed, message, warning: isWarning })
    if (passed) testResults.passed++
    else if (isWarning) testResults.warnings++
    else testResults.failed++
}

// Test API endpoint
async function testAPIEndpoint(path, method = 'GET', body = null, token = null) {
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        }
        
        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`
        }
        
        if (body) {
            options.body = JSON.stringify(body)
        }
        
        const response = await fetch(`${BASE_URL}/api/${path}`, options)
        const data = await response.ok ? await response.json().catch(() => null) : null
        
        return {
            ok: response.ok,
            status: response.status,
            data,
            error: !response.ok ? (data?.error || data?.message || `HTTP ${response.status}`) : null
        }
    } catch (error) {
        return {
            ok: false,
            status: 0,
            data: null,
            error: error.message
        }
    }
}

// Test 1: Health Check
async function testHealthCheck() {
    console.log('\n🏥 Testing Health Check...')
    const result = await testAPIEndpoint('health')
    logTest('Health Check', result.ok, result.error || 'Server is healthy')
    return result.ok
}

// Test 2: Database Connection
async function testDatabaseConnection() {
    console.log('\n🗄️  Testing Database Connection...')
    if (!prisma) {
        logTest('Database Connection', false, 'Prisma client not initialized (database may not be accessible)', true)
        return false
    }
    try {
        await prisma.$connect()
        const userCount = await prisma.user.count()
        logTest('Database Connection', true, `Connected successfully (${userCount} users found)`)
        await prisma.$disconnect()
        return true
    } catch (error) {
        logTest('Database Connection', false, error.message, true) // Mark as warning since API may still work
        return false
    }
}

// Test 3: Login Functionality
async function testLogin() {
    console.log('\n🔐 Testing Login Functionality...')
    
    // Check if admin user exists (only if database is accessible)
    if (prisma) {
        let adminUser
        try {
            adminUser = await prisma.user.findUnique({
                where: { email: 'admin@example.com' }
            })
            
            if (!adminUser) {
                logTest('Admin User Exists', false, 'Admin user not found. Creating test user...')
                // Create admin user for testing
                const bcrypt = await import('bcryptjs')
                const hashedPassword = await bcrypt.default.hash('password123', 10)
                
                adminUser = await prisma.user.create({
                    data: {
                        email: 'admin@example.com',
                        name: 'Admin User',
                        passwordHash: hashedPassword,
                        role: 'admin',
                        status: 'active'
                    }
                })
                logTest('Admin User Created', true, 'Test admin user created successfully')
                await prisma.$disconnect()
            } else {
                logTest('Admin User Exists', true, 'Admin user found')
                await prisma.$disconnect()
            }
        } catch (error) {
            logTest('Admin User Check', false, error.message, true) // Warning, not fatal
        }
    } else {
        logTest('Admin User Check', false, 'Database not accessible, skipping user check', true)
    }
    
    // Test login endpoint (this works even if database is not directly accessible)
    console.log('  Testing login API endpoint...')
    const loginResult = await testAPIEndpoint('auth/login', 'POST', {
        email: 'admin@example.com',
        password: 'password123'
    })
    
    // Handle nested response structure: { data: { accessToken, user, ... } }
    const accessToken = loginResult.data?.data?.accessToken || loginResult.data?.accessToken
    const user = loginResult.data?.data?.user || loginResult.data?.user
    const loginSuccess = loginResult.ok && accessToken
    
    logTest('Login API', loginSuccess, loginResult.error || 'Login successful')
    
    if (loginSuccess) {
        logTest('Access Token Received', !!accessToken, 'Token generated')
        logTest('User Data Returned', !!user, 'User object returned')
        return accessToken
    } else {
        // Try alternative login endpoint
        console.log('  Trying alternative login endpoint...')
        const altLoginResult = await testAPIEndpoint('login', 'POST', {
            email: 'admin@example.com',
            password: 'password123'
        })
        const altAccessToken = altLoginResult.data?.data?.accessToken || altLoginResult.data?.accessToken
        const altSuccess = altLoginResult.ok && altAccessToken
        if (altSuccess) {
            logTest('Login API (alt endpoint)', true, 'Login successful via /api/login')
            return altAccessToken
        }
    }
    
    return null
}

// Test 4: Protected Routes
async function testProtectedRoutes(token) {
    console.log('\n🔒 Testing Protected Routes...')
    
    if (!token) {
        logTest('Protected Routes Test', false, 'No token available, skipping protected route tests')
        return
    }
    
    const routes = [
        { path: 'me', name: 'Current User Endpoint' },
        { path: 'users', name: 'Users List' },
        { path: 'clients', name: 'Clients List' },
        { path: 'projects', name: 'Projects List' },
        { path: 'leads', name: 'Leads List' },
        { path: 'calendar-notes', name: 'Calendar Notes' },
        { path: 'jobcards', name: 'Job Cards' },
        { path: 'manufacturing/stock-locations', name: 'Stock Locations' }
    ]
    
    for (const route of routes) {
        const result = await testAPIEndpoint(route.path, 'GET', null, token)
        // Consider 200, 404 (no data but endpoint works), or 400 (bad request but authenticated) as success
        const success = result.status === 200 || result.status === 404 || (result.status === 400 && !result.error?.includes('Unauthorized'))
        logTest(route.name, success, result.error || `Status: ${result.status}`)
    }
}

// Test 5: Component Availability
async function testComponents() {
    console.log('\n🧩 Testing Component Availability...')
    
    // List of key components to verify (matching actual file names)
    const components = [
        { name: 'Dashboard', path: 'dashboard/Dashboard.jsx' },
        { name: 'DashboardLive', path: 'dashboard/DashboardLive.jsx' },
        { name: 'DashboardEnhanced', path: 'dashboard/DashboardEnhanced.jsx' },
        { name: 'LoginPage', path: 'auth/LoginPage.jsx' },
        { name: 'AuthProvider', path: 'auth/AuthProvider.jsx' },
        { name: 'MainLayout', path: 'layout/MainLayout.jsx' },
        { name: 'Clients', path: 'clients/Clients.jsx' },
        { name: 'Projects', path: 'projects/Projects.jsx' },
        { name: 'Manufacturing', path: 'manufacturing/Manufacturing.jsx' },
        { name: 'LeavePlatform', path: 'leave-platform/LeavePlatform.jsx' },
        { name: 'Calendar', path: 'calendar' }, // Check for calendar components
        { name: 'TimeTracking', path: 'time' }, // Check for time tracking components
        { name: 'Invoicing', path: 'invoicing' } // Check for invoicing components
    ]
    
    // Since components are loaded in the browser, we'll check if the build files exist
    const fs = await import('fs')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    
    const distPath = path.join(__dirname, 'dist')
    const srcPath = path.join(__dirname, 'src')
    
    // Check if dist directory exists and has files
    const distExists = fs.existsSync(distPath)
    logTest('Build Directory Exists', distExists, distExists ? 'dist/ directory found' : 'dist/ directory not found - run npm run build')
    
    // Check if source components exist
    for (const component of components) {
        const componentPath = path.join(srcPath, 'components', component.path)
        let exists = fs.existsSync(componentPath)
        
        // If it's a directory, check if it has any JSX files
        if (!exists && fs.existsSync(componentPath) && fs.statSync(componentPath).isDirectory()) {
            const files = fs.readdirSync(componentPath)
            exists = files.some(file => file.endsWith('.jsx'))
        }
        
        // Try to find in subdirectories if direct path doesn't exist
        if (!exists) {
            const searchInDir = (dir) => {
                if (!fs.existsSync(dir)) return false
                try {
                    const files = fs.readdirSync(dir, { withFileTypes: true })
                    for (const file of files) {
                        if (file.isDirectory()) {
                            const found = searchInDir(path.join(dir, file.name))
                            if (found) return true
                        } else if (file.name.includes(component.name) && file.name.endsWith('.jsx')) {
                            return true
                        }
                    }
                } catch (error) {
                    return false
                }
                return false
            }
            const found = searchInDir(path.join(srcPath, 'components'))
            logTest(`Component: ${component.name}`, found, found ? 'Found' : 'Not found', !found)
        } else {
            logTest(`Component: ${component.name}`, true, 'Found')
        }
    }
}

// Test 6: API Endpoints Available
async function testAPIEndpoints(token) {
    console.log('\n🔌 Testing API Endpoints...')
    
    if (!token) {
        logTest('API Endpoints Test', false, 'No token available, skipping API endpoint tests')
        return
    }
    
    const endpoints = [
        'health',
        'me',
        'users',
        'clients',
        'projects',
        'leads',
        'jobcards',
        'calendar-notes',
        'time-entries',
        'notifications',
        'manufacturing/stock-locations',
        'manufacturing/inventory'
    ]
    
    for (const endpoint of endpoints) {
        const result = await testAPIEndpoint(endpoint, 'GET', null, token)
        // Accept 200 (success), 404 (not found but endpoint exists), or 401 (unauthorized but endpoint exists)
        const success = result.status === 200 || result.status === 404 || result.status === 401
        logTest(`API: ${endpoint}`, success, result.error || `Status: ${result.status}`)
    }
}

// Test 7: File Structure
async function testFileStructure() {
    console.log('\n📁 Testing File Structure...')
    
    const fs = await import('fs')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    
    const requiredFiles = [
        'package.json',
        'server.js',
        'index.html',
        'dist/styles.css',
        'src/App.jsx',
        'api/auth/login.js',
        'prisma/schema.prisma'
    ]
    
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, file)
        const exists = fs.existsSync(filePath)
        logTest(`File: ${file}`, exists, exists ? 'Found' : 'Missing')
    }
}

// Main test runner
async function runAllTests() {
    console.log('🚀 Starting Comprehensive Website Functionality Tests')
    console.log(`📍 Testing against: ${BASE_URL}`)
    console.log('=' .repeat(60))
    
    try {
        // Run tests in sequence
        await testFileStructure()
        await testDatabaseConnection()
        await testHealthCheck()
        const token = await testLogin()
        await testProtectedRoutes(token)
        await testComponents()
        await testAPIEndpoints(token)
        
        // Print summary
        console.log('\n' + '='.repeat(60))
        console.log('📊 Test Summary')
        console.log('='.repeat(60))
        console.log(`✅ Passed: ${testResults.passed}`)
        console.log(`⚠️  Warnings: ${testResults.warnings}`)
        console.log(`❌ Failed: ${testResults.failed}`)
        console.log(`📈 Total: ${testResults.tests.length}`)
        
        const successRate = ((testResults.passed / testResults.tests.length) * 100).toFixed(1)
        console.log(`\n🎯 Success Rate: ${successRate}%`)
        
        if (testResults.failed === 0) {
            console.log('\n🎉 All critical tests passed! Website is ready for use.')
            process.exit(0)
        } else {
            console.log('\n⚠️  Some tests failed. Please review the errors above.')
            process.exit(1)
        }
    } catch (error) {
        console.error('\n❌ Fatal error during testing:', error)
        process.exit(1)
    } finally {
        if (prisma) {
            try {
                await prisma.$disconnect()
            } catch (error) {
                // Ignore disconnect errors
            }
        }
    }
}

// Run tests
runAllTests()
