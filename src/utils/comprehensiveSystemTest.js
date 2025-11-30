// Comprehensive System Test and Validation Script
// Run this in the browser console to test the enhanced state management system

window.runComprehensiveSystemTest = async function() {
    
    const testResults = {
        startTime: Date.now(),
        tests: [],
        summary: {}
    };
    
    // Test 1: Check if all enhanced systems are loaded
    try {
        const checks = {
            enhancedStateManager: !!window.EnhancedStateManager,
            enhancedAPIWrapper: !!window.EnhancedAPIWrapper,
            stateManagementTestSuite: !!window.StateManagementTestSuite,
            systemTestRunner: !!window.SystemTestRunner,
            clientsComponent: !!window.Clients
        };
        
        
        const allLoaded = Object.values(checks).every(Boolean);
        if (!allLoaded) {
            throw new Error('Not all enhanced systems are loaded');
        }
        
        testResults.tests.push({ name: 'System Initialization', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'System Initialization', status: 'FAILED', error: error.message });
        console.error('❌ System initialization failed:', error);
    }
    
    // Test 2: Enhanced State Manager Functionality
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Test basic state operations
        const testData = [{ id: 'test-1', name: 'Test Client', revenue: 100000 }];
        stateManager.setState('clients', testData);
        
        const retrievedData = stateManager.getState('clients');
        if (retrievedData.length !== 1 || retrievedData[0].name !== 'Test Client') {
            throw new Error('State set/get not working correctly');
        }
        
        // Test operation status
        const status = stateManager.getOperationStatus();
        if (typeof status.pendingOperations !== 'number') {
            throw new Error('Operation status not working correctly');
        }
        
        testResults.tests.push({ name: 'Enhanced State Manager', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Enhanced State Manager', status: 'FAILED', error: error.message });
        console.error('❌ Enhanced State Manager test failed:', error);
    }
    
    // Test 3: Enhanced API Wrapper
    try {
        const apiWrapper = window.EnhancedAPIWrapper;
        
        // Test connection status
        const connectionStatus = apiWrapper.getConnectionStatus();
        if (typeof connectionStatus.status !== 'string') {
            throw new Error('Connection status not working correctly');
        }
        
        // Test request ID generation
        const requestId = apiWrapper.generateRequestId();
        if (!requestId || !requestId.startsWith('req_')) {
            throw new Error('Request ID generation not working correctly');
        }
        
        testResults.tests.push({ name: 'Enhanced API Wrapper', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Enhanced API Wrapper', status: 'FAILED', error: error.message });
        console.error('❌ Enhanced API Wrapper test failed:', error);
    }
    
    // Test 4: Data Validation
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Test valid data
        const validData = {
            name: 'Valid Client',
            industry: 'Technology',
            revenue: 100000,
            status: 'active'
        };
        
        const validationResult = stateManager.validateData('clients', validData);
        if (!validationResult.isValid) {
            throw new Error('Valid data failed validation');
        }
        
        // Test invalid data
        const invalidData = {
            // Missing required name field
            industry: 'Technology',
            revenue: 'invalid_number'
        };
        
        const invalidValidationResult = stateManager.validateData('clients', invalidData);
        if (invalidValidationResult.isValid) {
            throw new Error('Invalid data passed validation');
        }
        
        testResults.tests.push({ name: 'Data Validation', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Data Validation', status: 'FAILED', error: error.message });
        console.error('❌ Data validation test failed:', error);
    }
    
    // Test 5: CRUD Operations (Optimistic)
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Test Create
        const clientData = {
            name: 'Test Client ' + Date.now(),
            industry: 'Technology',
            revenue: 50000,
            status: 'active'
        };
        
        const createdClient = await stateManager.createEntity('clients', clientData, {
            optimistic: true,
            retryOnFailure: false,
            validateBeforeSave: true
        });
        
        if (!createdClient.id) {
            throw new Error('Created client missing ID');
        }
        
        // Test Read
        const clients = stateManager.getState('clients');
        const foundClient = clients.find(c => c.id === createdClient.id);
        if (!foundClient) {
            throw new Error('Created client not found in state');
        }
        
        // Test Update
        const updateData = { revenue: 75000 };
        const updatedClient = await stateManager.updateEntity('clients', createdClient.id, updateData, {
            optimistic: true,
            retryOnFailure: false,
            validateBeforeSave: true
        });
        
        if (updatedClient.revenue !== 75000) {
            throw new Error('Client update not working correctly');
        }
        
        // Test Delete
        await stateManager.deleteEntity('clients', createdClient.id, {
            optimistic: true,
            retryOnFailure: false
        });
        
        const clientsAfterDelete = stateManager.getState('clients');
        const deletedClient = clientsAfterDelete.find(c => c.id === createdClient.id);
        if (deletedClient) {
            throw new Error('Client not deleted from state');
        }
        
        testResults.tests.push({ name: 'CRUD Operations', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'CRUD Operations', status: 'FAILED', error: error.message });
        console.error('❌ CRUD operations test failed:', error);
    }
    
    // Test 6: Optimistic Updates
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Create a test client
        const clientData = {
            name: 'Optimistic Test Client',
            industry: 'Technology',
            revenue: 100000
        };
        
        const createdClient = await stateManager.createEntity('clients', clientData, {
            optimistic: true,
            retryOnFailure: false,
            validateBeforeSave: true
        });
        
        // Verify optimistic update is applied immediately
        const clients = stateManager.getState('clients');
        const foundClient = clients.find(c => c.id === createdClient.id);
        
        if (!foundClient) {
            throw new Error('Optimistic update not applied immediately');
        }
        
        if (foundClient.name !== clientData.name) {
            throw new Error('Optimistic update data mismatch');
        }
        
        testResults.tests.push({ name: 'Optimistic Updates', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Optimistic Updates', status: 'FAILED', error: error.message });
        console.error('❌ Optimistic updates test failed:', error);
    }
    
    // Test 7: Error Handling
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Test validation error
        try {
            await stateManager.createEntity('clients', {
                // Missing required name field
                industry: 'Technology'
            });
            throw new Error('Validation error should have been thrown');
        } catch (error) {
            if (!error.message.includes('Validation failed')) {
                throw new Error('Expected validation error');
            }
        }
        
        testResults.tests.push({ name: 'Error Handling', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Error Handling', status: 'FAILED', error: error.message });
        console.error('❌ Error handling test failed:', error);
    }
    
    // Test 8: Concurrent Operations
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Create multiple clients concurrently
        const concurrentPromises = [];
        const clientCount = 3;
        
        for (let i = 0; i < clientCount; i++) {
            const clientData = {
                name: `Concurrent Client ${i}`,
                industry: 'Technology',
                revenue: 10000 + (i * 1000)
            };
            
            concurrentPromises.push(
                stateManager.createEntity('clients', clientData, {
                    optimistic: true,
                    retryOnFailure: false,
                    validateBeforeSave: true
                })
            );
        }
        
        const createdClients = await Promise.all(concurrentPromises);
        
        if (createdClients.length !== clientCount) {
            throw new Error(`Expected ${clientCount} clients, got ${createdClients.length}`);
        }
        
        // Verify all clients are in state
        const clients = stateManager.getState('clients');
        const foundClients = createdClients.filter(created => 
            clients.find(c => c.id === created.id)
        );
        
        if (foundClients.length !== clientCount) {
            throw new Error(`Expected ${clientCount} clients in state, found ${foundClients.length}`);
        }
        
        testResults.tests.push({ name: 'Concurrent Operations', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Concurrent Operations', status: 'FAILED', error: error.message });
        console.error('❌ Concurrent operations test failed:', error);
    }
    
    // Test 9: Real-time Sync
    try {
        const stateManager = window.EnhancedStateManager;
        
        // Subscribe to state changes
        let changeCount = 0;
        const unsubscribe = stateManager.subscribe('clients', (message) => {
            changeCount++;
        });
        
        // Create a client to trigger sync
        const clientData = {
            name: 'Sync Test Client',
            industry: 'Technology',
            revenue: 50000
        };
        
        await stateManager.createEntity('clients', clientData, {
            optimistic: true,
            retryOnFailure: false,
            validateBeforeSave: true
        });
        
        // Wait a bit for sync to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (changeCount === 0) {
            throw new Error('No state changes detected');
        }
        
        // Unsubscribe
        unsubscribe();
        
        testResults.tests.push({ name: 'Real-time Sync', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'Real-time Sync', status: 'FAILED', error: error.message });
        console.error('❌ Real-time sync test failed:', error);
    }
    
    // Test 10: UI Integration
    try {
        // Check if enhanced save functions are available in Clients component
        if (typeof window.Clients !== 'function') {
            throw new Error('Clients component not available');
        }
        
        // Test if enhanced state management is integrated
        if (!window.EnhancedStateManager) {
            throw new Error('Enhanced state management not integrated');
        }
        
        if (!window.EnhancedAPIWrapper) {
            throw new Error('Enhanced API wrapper not integrated');
        }
        
        testResults.tests.push({ name: 'UI Integration', status: 'PASSED' });
        
    } catch (error) {
        testResults.tests.push({ name: 'UI Integration', status: 'FAILED', error: error.message });
        console.error('❌ UI integration test failed:', error);
    }
    
    // Generate final report
    testResults.endTime = Date.now();
    testResults.duration = testResults.endTime - testResults.startTime;
    
    const totalTests = testResults.tests.length;
    const passedTests = testResults.tests.filter(t => t.status === 'PASSED').length;
    const failedTests = totalTests - passedTests;
    
    testResults.summary = {
        totalTests,
        passedTests,
        failedTests,
        successRate: (passedTests / totalTests) * 100,
        duration: testResults.duration
    };
    
    
    if (failedTests > 0) {
        testResults.tests
            .filter(t => t.status === 'FAILED')
            .forEach(t => {
            });
    }
    
    testResults.tests
        .filter(t => t.status === 'PASSED')
        .forEach(t => {
        });
    
    // Store results globally for debugging
    window.comprehensiveTestResults = testResults;
    
    // Return results for programmatic use
    return testResults;
};

// Additional utility functions for testing
window.testClientSave = async function() {
    
    try {
        const stateManager = window.EnhancedStateManager;
        if (!stateManager) {
            throw new Error('Enhanced State Manager not available');
        }
        
        // Test client data
        const clientData = {
            name: 'Test Save Client ' + Date.now(),
            industry: 'Technology',
            status: 'active',
            revenue: 100000,
            address: '123 Test St',
            website: 'https://test.com',
            notes: 'Test client for save validation',
            contacts: [{ name: 'John Doe', email: 'john@test.com' }],
            sites: [{ name: 'Main Site', url: 'https://test.com' }],
            billingTerms: {
                paymentTerms: 'Net 30',
                billingFrequency: 'Monthly',
                currency: 'ZAR',
                retainerAmount: 5000,
                taxExempt: false,
                notes: 'Test billing terms'
            }
        };
        
        const createdClient = await stateManager.createEntity('clients', clientData, {
            optimistic: true,
            retryOnFailure: true,
            validateBeforeSave: true
        });
        
        return createdClient;
        
    } catch (error) {
        console.error('❌ Client save test failed:', error);
        throw error;
    }
};

window.testLeadSave = async function() {
    
    try {
        const stateManager = window.EnhancedStateManager;
        if (!stateManager) {
            throw new Error('Enhanced State Manager not available');
        }
        
        // Test lead data
        const leadData = {
            name: 'Test Save Lead ' + Date.now(),
            industry: 'Healthcare',
            status: 'potential',
            value: 50000,
            probability: 75,
            source: 'Website',
            notes: 'Test lead for save validation'
        };
        
        const createdLead = await stateManager.createEntity('leads', leadData, {
            optimistic: true,
            retryOnFailure: true,
            validateBeforeSave: true
        });
        
        return createdLead;
        
    } catch (error) {
        console.error('❌ Lead save test failed:', error);
        throw error;
    }
};

window.testConcurrentSaves = async function() {
    
    try {
        const stateManager = window.EnhancedStateManager;
        if (!stateManager) {
            throw new Error('Enhanced State Manager not available');
        }
        
        // Create multiple entities concurrently
        const promises = [];
        const count = 5;
        
        for (let i = 0; i < count; i++) {
            const clientData = {
                name: `Concurrent Save Client ${i} ${Date.now()}`,
                industry: 'Technology',
                revenue: 10000 + (i * 1000)
            };
            
            promises.push(
                stateManager.createEntity('clients', clientData, {
                    optimistic: true,
                    retryOnFailure: true,
                    validateBeforeSave: true
                })
            );
        }
        
        const results = await Promise.all(promises);
        
        return results;
        
    } catch (error) {
        console.error('❌ Concurrent saves test failed:', error);
        throw error;
    }
};

// Auto-run test if called directly
if (typeof window !== 'undefined') {
}
