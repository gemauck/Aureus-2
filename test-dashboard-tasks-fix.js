#!/usr/bin/env node
/**
 * Test script to verify dashboard project tasks fix
 * Tests that /api/tasks?lightweight=true returns project information
 */

import 'dotenv/config';

const BASE_URL = process.env.API_URL || process.env.APP_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'garethm@abcotronics.co.za';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'test123';

let authToken = null;

// Helper functions
function log(message, type = 'info') {
    const emoji = {
        success: '✅',
        error: '❌',
        warn: '⚠️',
        info: '📝',
        test: '🧪'
    }[type] || '📝';
    console.log(`${emoji} ${message}`);
}

// Authentication
async function authenticate() {
    log('Authenticating...', 'test');
    try {
        const response = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: TEST_USER_EMAIL,
                password: TEST_USER_PASSWORD
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Login failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        authToken = data.accessToken || data.data?.accessToken;
        
        if (!authToken) {
            throw new Error('No access token in response');
        }

        log('Authentication: SUCCESS', 'success');
        return true;
    } catch (error) {
        log(`Authentication: FAILED - ${error.message}`, 'error');
        return false;
    }
}

// Test lightweight tasks endpoint
async function testLightweightTasksEndpoint() {
    log('Testing /api/tasks?lightweight=true endpoint...', 'test');
    
    if (!authToken) {
        log('No auth token available', 'error');
        return false;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/tasks?lightweight=true`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const tasks = data.tasks || data.data?.tasks || [];

        log(`Received ${tasks.length} tasks`, 'info');

        if (tasks.length === 0) {
            log('No tasks found - this is OK if user has no assigned tasks', 'warn');
            return true; // Not a failure, just no tasks
        }

        // Verify each task has project information
        let allTasksHaveProject = true;
        let tasksWithProject = 0;
        let tasksWithoutProject = 0;

        tasks.forEach((task, index) => {
            if (task.project) {
                tasksWithProject++;
                log(`Task ${index + 1}: "${task.title}" - Has project: ${task.project.name} (Client: ${task.project.clientName || 'N/A'})`, 'success');
                
                // Verify required fields
                if (!task.project.name) {
                    log(`  ⚠️  Warning: Task ${index + 1} has project but missing name`, 'warn');
                }
            } else {
                tasksWithoutProject++;
                log(`Task ${index + 1}: "${task.title}" - Missing project information`, 'error');
                allTasksHaveProject = false;
            }
        });

        log('', 'info');
        log(`Summary:`, 'info');
        log(`  Tasks with project info: ${tasksWithProject}`, 'info');
        log(`  Tasks without project info: ${tasksWithoutProject}`, tasksWithoutProject > 0 ? 'error' : 'info');

        if (allTasksHaveProject) {
            log('✅ All tasks include project information - FIX VERIFIED!', 'success');
            return true;
        } else {
            log('❌ Some tasks are missing project information - FIX NOT WORKING', 'error');
            return false;
        }

    } catch (error) {
        log(`Test failed: ${error.message}`, 'error');
        return false;
    }
}

// Main test runner
async function runTest() {
    console.log('🧪 Testing Dashboard Project Tasks Fix');
    console.log('=' .repeat(60));
    console.log(`📍 Testing against: ${BASE_URL}`);
    console.log('=' .repeat(60));
    console.log('');

    // Step 1: Authenticate
    const authSuccess = await authenticate();
    if (!authSuccess) {
        console.log('');
        log('Cannot proceed without authentication', 'error');
        process.exit(1);
    }

    console.log('');

    // Step 2: Test lightweight endpoint
    const testSuccess = await testLightweightTasksEndpoint();

    console.log('');
    console.log('=' .repeat(60));
    if (testSuccess) {
        log('All tests passed! Dashboard fix is working correctly.', 'success');
        process.exit(0);
    } else {
        log('Tests failed! Dashboard fix may not be working.', 'error');
        process.exit(1);
    }
}

// Run tests
runTest().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});



