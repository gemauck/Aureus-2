// Comprehensive Persistence Test for ERP System
// This script tests data persistence, schema alignment, and CRUD operations

const BASE_URL = 'http://localhost:3000';
let authToken = '';

// Test results
const results = {
    passed: [],
    failed: [],
    warnings: []
};

// Helper functions
function log(message, type = 'info') {
    const emoji = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '📝';
    console.log(`${emoji} ${message}`);
}

function recordResult(test, passed, message = '') {
    if (passed) {
        results.passed.push({ test, message });
        log(`${test}: PASSED`, 'success');
    } else {
        results.failed.push({ test, message });
        log(`${test}: FAILED - ${message}`, 'error');
    }
}

// Test 1: Authentication
async function testAuthentication() {
    log('Testing authentication...');
    try {
        // Check if token exists in localStorage (for browser context)
        // For Node.js, we'll need to get it from the server or skip
        log('Authentication test skipped (requires browser context)', 'warn');
        results.warnings.push('Authentication test requires browser context');
        return true;
    } catch (error) {
        recordResult('Authentication', false, error.message);
        return false;
    }
}

// Test 2: Project CRUD Operations
async function testProjectCRUD() {
    log('Testing Project CRUD operations...');
    
    const testProject = {
        name: `Test Project ${Date.now()}`,
        clientName: 'Test Client',
        description: 'This is a test project for persistence testing',
        type: 'Monthly Review',
        status: 'Active',
        startDate: new Date().toISOString().split('T')[0],
        dueDate: null,
        assignedTo: '',
        budget: 5000,
        priority: 'Medium',
        taskLists: JSON.stringify([
            { id: 1, name: 'To Do', color: 'blue' },
            { id: 2, name: 'In Progress', color: 'yellow' },
            { id: 3, name: 'Done', color: 'green' }
        ]),
        tasksList: JSON.stringify([
            { 
                listId: 1, 
                title: 'Test Task', 
                comments: [], 
                attachments: [], 
                subtasks: [], 
                checklist: [], 
                tags: [],
                id: Date.now(),
                status: 'To Do'
            }
        ]),
        customFieldDefinitions: JSON.stringify([]),
        team: JSON.stringify([]),
        notes: 'Test notes'
    };

    try {
        // CREATE
        log('Creating test project...');
        const createResponse = await fetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(testProject)
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            recordResult('Project CREATE', false, `HTTP ${createResponse.status}: ${errorText}`);
            return false;
        }

        const created = await createResponse.json();
        const projectId = created?.data?.project?.id || created?.project?.id;
        
        if (!projectId) {
            recordResult('Project CREATE', false, 'No ID returned from API');
            return false;
        }

        recordResult('Project CREATE', true, `Project ID: ${projectId}`);

        // READ
        log('Reading created project...');
        const readResponse = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!readResponse.ok) {
            recordResult('Project READ', false, `HTTP ${readResponse.status}`);
            return false;
        }

        const readData = await readResponse.json();
        const readProject = readData?.data?.project || readData?.project;

        // Verify data integrity
        const nameMatch = readProject.name === testProject.name;
        const descriptionMatch = readProject.description === testProject.description;
        const taskListsMatch = JSON.stringify(readProject.taskLists) === testProject.taskLists;

        recordResult('Project READ', true);
        recordResult('Data Integrity - Name', nameMatch);
        recordResult('Data Integrity - Description', descriptionMatch);
        recordResult('Data Integrity - Task Lists', taskListsMatch);

        // UPDATE
        log('Updating project...');
        const updateData = {
            ...testProject,
            name: `Updated ${testProject.name}`,
            description: 'Updated description'
        };

        const updateResponse = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(updateData)
        });

        if (!updateResponse.ok) {
            recordResult('Project UPDATE', false, `HTTP ${updateResponse.status}`);
            return false;
        }

        // Verify update
        const verifyResponse = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const verifyData = await verifyResponse.json();
        const verifyProject = verifyData?.data?.project || verifyData?.project;

        const updateVerified = verifyProject.name === updateData.name;
        recordResult('Project UPDATE', updateVerified);

        // DELETE
        log('Deleting test project...');
        const deleteResponse = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!deleteResponse.ok) {
            recordResult('Project DELETE', false, `HTTP ${deleteResponse.status}`);
            return false;
        }

        recordResult('Project DELETE', true);

        return true;
    } catch (error) {
        recordResult('Project CRUD', false, error.message);
        return false;
    }
}

// Test 3: JSON Field Serialization
async function testJSONSerialization() {
    log('Testing JSON field serialization...');
    
    const complexData = {
        name: `JSON Test ${Date.now()}`,
        clientName: 'Test Client',
        taskLists: [
            { id: 1, name: 'To Do', color: 'blue', description: 'Tasks to be done' },
            { id: 2, name: 'In Progress', color: 'yellow' }
        ],
        tasksList: [
            {
                listId: 1,
                title: 'Complex Task',
                id: Date.now(),
                status: 'To Do',
                comments: [{ id: 1, text: 'Test comment', author: 'Tester' }],
                attachments: ['file1.pdf'],
                subtasks: ['Subtask 1'],
                checklist: [{ item: 'Check 1', checked: false }],
                tags: ['important', 'urgent']
            }
        ],
        customFieldDefinitions: [
            { name: 'Custom Field 1', type: 'text', value: 'Test value' }
        ],
        team: [
            { id: 'user1', name: 'John Doe', role: 'Developer' }
        ]
    };

    try {
        // Create project with complex JSON data
        const createResponse = await fetch(`${BASE_URL}/api/projects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                ...complexData,
                taskLists: JSON.stringify(complexData.taskLists),
                tasksList: JSON.stringify(complexData.tasksList),
                customFieldDefinitions: JSON.stringify(complexData.customFieldDefinitions),
                team: JSON.stringify(complexData.team)
            })
        });

        if (!createResponse.ok) {
            recordResult('JSON Serialization - Create', false, `HTTP ${createResponse.status}`);
            return false;
        }

        const created = await createResponse.json();
        const projectId = created?.data?.project?.id || created?.project?.id;

        // Read and verify JSON deserialization
        const readResponse = await fetch(`${BASE_URL}/api/projects/${projectId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const readData = await readResponse.json();
        const project = readData?.data?.project || readData?.project;

        // Verify JSON fields are properly formatted
        const taskListsValid = typeof project.taskLists === 'string';
        const taskListsParse = taskListsValid ? JSON.parse(project.taskLists) : null;
        const taskListsMatch = taskListsParse && Array.isArray(taskListsParse);

        recordResult('JSON Serialization - Task Lists', taskListsMatch);

        // Clean up
        await fetch(`${BASE_URL}/api/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        return true;
    } catch (error) {
        recordResult('JSON Serialization', false, error.message);
        return false;
    }
}

// Run all tests
async function runTests() {
    log('Starting comprehensive persistence tests...', 'info');
    log('');
    
    await testAuthentication();
    await testProjectCRUD();
    await testJSONSerialization();

    // Print summary
    log('');
    log('=== TEST SUMMARY ===', 'info');
    log(`✅ Passed: ${results.passed.length}`, 'success');
    log(`❌ Failed: ${results.failed.length}`, 'error');
    log(`⚠️  Warnings: ${results.warnings.length}`, 'warn');
    
    if (results.failed.length > 0) {
        log('');
        log('Failed Tests:', 'error');
        results.failed.forEach(f => log(`  - ${f.test}: ${f.message}`, 'error'));
    }
    
    log('');
    log('Test completed!', 'info');
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runTests };
}

// Auto-run if executed directly
if (typeof window !== 'undefined') {
    window.testPersistence = runTests;
}

