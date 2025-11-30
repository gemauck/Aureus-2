// Comprehensive Testing Suite for State Management and Data Synchronization
class StateManagementTestSuite {
    constructor() {
        this.testResults = [];
        this.currentTest = null;
        this.testTimeout = 30000; // 30 seconds per test
        this.retryCount = 0;
        this.maxRetries = 3;
        
        // Bind methods
        this.runAllTests = this.runAllTests.bind(this);
        this.runTest = this.runTest.bind(this);
        this.testCreateOperation = this.testCreateOperation.bind(this);
        this.testUpdateOperation = this.testUpdateOperation.bind(this);
        this.testDeleteOperation = this.testDeleteOperation.bind(this);
        this.testConcurrentOperations = this.testConcurrentOperations.bind(this);
        this.testOptimisticUpdates = this.testOptimisticUpdates.bind(this);
        this.testConflictResolution = this.testConflictResolution.bind(this);
        this.testErrorHandling = this.testErrorHandling.bind(this);
        this.testDataValidation = this.testDataValidation.bind(this);
        this.testOfflineMode = this.testOfflineMode.bind(this);
        this.testRealTimeSync = this.testRealTimeSync.bind(this);
        this.generateReport = this.generateReport.bind(this);
    }

    // Run all tests
    async runAllTests() {
        
        const tests = [
            { name: 'Create Operations', fn: this.testCreateOperation },
            { name: 'Update Operations', fn: this.testUpdateOperation },
            { name: 'Delete Operations', fn: this.testDeleteOperation },
            { name: 'Concurrent Operations', fn: this.testConcurrentOperations },
            { name: 'Optimistic Updates', fn: this.testOptimisticUpdates },
            { name: 'Conflict Resolution', fn: this.testConflictResolution },
            { name: 'Error Handling', fn: this.testErrorHandling },
            { name: 'Data Validation', fn: this.testDataValidation },
            { name: 'Offline Mode', fn: this.testOfflineMode },
            { name: 'Real-time Sync', fn: this.testRealTimeSync }
        ];

        for (const test of tests) {
            await this.runTest(test.name, test.fn);
        }

        this.generateReport();
    }

    // Run individual test
    async runTest(testName, testFunction) {
        this.currentTest = testName;
        
        const startTime = Date.now();
        
        try {
            await Promise.race([
                testFunction(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Test timeout')), this.testTimeout)
                )
            ]);
            
            const duration = Date.now() - startTime;
            this.testResults.push({
                name: testName,
                status: 'PASSED',
                duration,
                error: null
            });
            
            
        } catch (error) {
            const duration = Date.now() - startTime;
            this.testResults.push({
                name: testName,
                status: 'FAILED',
                duration,
                error: error.message
            });
            
            console.error(`❌ ${testName} FAILED (${duration}ms):`, error.message);
            
            // Retry failed tests
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.runTest(testName, testFunction);
            }
        }
        
        this.retryCount = 0;
    }

    // Test create operations
    async testCreateOperation() {
        const stateManager = window.EnhancedStateManager;
        if (!stateManager) {
            throw new Error('EnhancedStateManager not available');
        }

        // Test creating a client
        const clientData = {
            name: 'Test Client ' + Date.now(),
            industry: 'Technology',
            status: 'active',
            revenue: 100000,
            address: '123 Test St',
            website: 'https://test.com',
            notes: 'Test client for validation',
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

        const createdClient = await stateManager.createEntity('clients', clientData);
        
        if (!createdClient.id) {
            throw new Error('Created client missing ID');
        }
        
        if (createdClient.name !== clientData.name) {
            throw new Error('Created client name mismatch');
        }

        // Verify client appears in state
        const clients = stateManager.getState('clients');
        const foundClient = clients.find(c => c.id === createdClient.id);
        
        if (!foundClient) {
            throw new Error('Created client not found in state');
        }

        // Test creating a lead
        const leadData = {
            name: 'Test Lead ' + Date.now(),
            industry: 'Healthcare',
            status: 'potential',
            value: 50000,
            probability: 75,
            source: 'Website',
            notes: 'Test lead for validation'
        };

        const createdLead = await stateManager.createEntity('leads', leadData);
        
        if (!createdLead.id) {
            throw new Error('Created lead missing ID');
        }

        // Verify lead appears in state
        const leads = stateManager.getState('leads');
        const foundLead = leads.find(l => l.id === createdLead.id);
        
        if (!foundLead) {
            throw new Error('Created lead not found in state');
        }

    }

    // Test update operations
    async testUpdateOperation() {
        const stateManager = window.EnhancedStateManager;
        
        // Get existing client
        const clients = stateManager.getState('clients');
        if (clients.length === 0) {
            throw new Error('No clients available for update test');
        }

        const clientToUpdate = clients[0];
        const originalName = clientToUpdate.name;
        
        // Update client
        const updateData = {
            name: 'Updated ' + originalName,
            revenue: clientToUpdate.revenue + 1000,
            notes: clientToUpdate.notes + ' - Updated',
            contacts: [...(clientToUpdate.contacts || []), { name: 'Jane Doe', email: 'jane@test.com' }]
        };

        const updatedClient = await stateManager.updateEntity('clients', clientToUpdate.id, updateData);
        
        if (updatedClient.name !== updateData.name) {
            throw new Error('Updated client name mismatch');
        }
        
        if (updatedClient.revenue !== updateData.revenue) {
            throw new Error('Updated client revenue mismatch');
        }

        // Verify update appears in state
        const updatedClients = stateManager.getState('clients');
        const foundUpdatedClient = updatedClients.find(c => c.id === clientToUpdate.id);
        
        if (!foundUpdatedClient) {
            throw new Error('Updated client not found in state');
        }
        
        if (foundUpdatedClient.name !== updateData.name) {
            throw new Error('State not updated with new name');
        }

    }

    // Test delete operations
    async testDeleteOperation() {
        const stateManager = window.EnhancedStateManager;
        
        // Create a test client to delete
        const clientData = {
            name: 'Client to Delete ' + Date.now(),
            industry: 'Test',
            status: 'active'
        };

        const createdClient = await stateManager.createEntity('clients', clientData);
        
        // Verify client exists
        let clients = stateManager.getState('clients');
        let foundClient = clients.find(c => c.id === createdClient.id);
        
        if (!foundClient) {
            throw new Error('Created client not found before deletion');
        }

        // Delete client
        await stateManager.deleteEntity('clients', createdClient.id);
        
        // Verify client is removed from state
        clients = stateManager.getState('clients');
        foundClient = clients.find(c => c.id === createdClient.id);
        
        if (foundClient) {
            throw new Error('Deleted client still found in state');
        }

    }

    // Test concurrent operations
    async testConcurrentOperations() {
        const stateManager = window.EnhancedStateManager;
        
        // Create multiple clients concurrently
        const concurrentPromises = [];
        const clientCount = 5;
        
        for (let i = 0; i < clientCount; i++) {
            const clientData = {
                name: `Concurrent Client ${i} ${Date.now()}`,
                industry: 'Technology',
                status: 'active',
                revenue: 10000 + (i * 1000)
            };
            
            concurrentPromises.push(
                stateManager.createEntity('clients', clientData)
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

        // Test concurrent updates
        const updatePromises = createdClients.map((client, index) => 
            stateManager.updateEntity('clients', client.id, {
                revenue: client.revenue + 5000,
                notes: `Updated concurrently ${index}`
            })
        );

        await Promise.all(updatePromises);
        
        // Verify updates
        const updatedClients = stateManager.getState('clients');
        const updatedFoundClients = createdClients.filter(created => {
            const updated = updatedClients.find(c => c.id === created.id);
            return updated && updated.revenue === created.revenue + 5000;
        });
        
        if (updatedFoundClients.length !== clientCount) {
            throw new Error(`Expected ${clientCount} updated clients, found ${updatedFoundClients.length}`);
        }

    }

    // Test optimistic updates
    async testOptimisticUpdates() {
        const stateManager = window.EnhancedStateManager;
        
        // Get existing client
        const clients = stateManager.getState('clients');
        if (clients.length === 0) {
            throw new Error('No clients available for optimistic update test');
        }

        const clientToUpdate = clients[0];
        const originalRevenue = clientToUpdate.revenue;
        
        // Apply optimistic update
        const updateData = { revenue: originalRevenue + 2000 };
        
        // Temporarily disable network to test optimistic updates
        const originalFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('Network error'));
        
        try {
            await stateManager.updateEntity('clients', clientToUpdate.id, updateData, {
                optimistic: true,
                retryOnFailure: false
            });
            
            // Verify optimistic update is applied
            const updatedClients = stateManager.getState('clients');
            const optimisticClient = updatedClients.find(c => c.id === clientToUpdate.id);
            
            if (!optimisticClient) {
                throw new Error('Optimistic client not found');
            }
            
            if (optimisticClient.revenue !== updateData.revenue) {
                throw new Error('Optimistic update not applied');
            }
            
        } finally {
            // Restore network
            window.fetch = originalFetch;
        }

    }

    // Test conflict resolution
    async testConflictResolution() {
        const stateManager = window.EnhancedStateManager;
        
        // Get existing client
        const clients = stateManager.getState('clients');
        if (clients.length === 0) {
            throw new Error('No clients available for conflict resolution test');
        }

        const clientToUpdate = clients[0];
        
        // Simulate conflict by updating the same field with different values
        const localUpdate = { revenue: 50000 };
        const serverUpdate = { revenue: 60000 };
        
        // Apply local update
        await stateManager.updateEntity('clients', clientToUpdate.id, localUpdate);
        
        // Simulate server conflict
        const conflictResult = await stateManager.handleConflict(
            'clients',
            { ...clientToUpdate, ...localUpdate },
            { ...clientToUpdate, ...serverUpdate }
        );
        
        if (conflictResult.revenue !== serverUpdate.revenue) {
            throw new Error('Conflict resolution not working correctly');
        }

    }

    // Test error handling
    async testErrorHandling() {
        const stateManager = window.EnhancedStateManager;
        
        // Test validation errors
        try {
            await stateManager.createEntity('clients', {
                // Missing required name field
                industry: 'Technology'
            });
            throw new Error('Validation should have failed');
        } catch (error) {
            if (!error.message.includes('Validation failed')) {
                throw new Error('Expected validation error');
            }
        }

        // Test network errors
        const originalFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('Network error'));
        
        try {
            await stateManager.createEntity('clients', {
                name: 'Test Client for Error Handling',
                industry: 'Technology'
            }, { retryOnFailure: false });
            
            throw new Error('Network error should have been thrown');
        } catch (error) {
            if (!error.message.includes('Network error')) {
                throw new Error('Expected network error');
            }
        } finally {
            window.fetch = originalFetch;
        }

    }

    // Test data validation
    async testDataValidation() {
        const stateManager = window.EnhancedStateManager;
        
        // Test invalid data types
        const invalidData = {
            name: 'Valid Name',
            revenue: 'invalid_number', // Should be number
            industry: 'Technology'
        };

        const validationResult = stateManager.validateData('clients', invalidData);
        
        if (validationResult.isValid) {
            throw new Error('Invalid revenue should fail validation');
        }

        // Test missing required fields
        const missingData = {
            industry: 'Technology'
            // Missing required name field
        };

        const missingValidationResult = stateManager.validateData('clients', missingData);
        
        if (missingValidationResult.isValid) {
            throw new Error('Missing name should fail validation');
        }

        // Test valid data
        const validData = {
            name: 'Valid Client',
            industry: 'Technology',
            revenue: 100000,
            status: 'active'
        };

        const validValidationResult = stateManager.validateData('clients', validData);
        
        if (!validValidationResult.isValid) {
            throw new Error('Valid data should pass validation');
        }

    }

    // Test offline mode
    async testOfflineMode() {
        const stateManager = window.EnhancedStateManager;
        
        // Simulate offline mode
        const originalFetch = window.fetch;
        window.fetch = () => Promise.reject(new Error('Offline'));
        
        try {
            // Create client in offline mode
            const clientData = {
                name: 'Offline Client ' + Date.now(),
                industry: 'Technology',
                status: 'active'
            };

            const createdClient = await stateManager.createEntity('clients', clientData, {
                optimistic: true,
                retryOnFailure: false
            });
            
            // Verify client is in local state
            const clients = stateManager.getState('clients');
            const foundClient = clients.find(c => c.id === createdClient.id);
            
            if (!foundClient) {
                throw new Error('Offline client not found in local state');
            }
            
        } finally {
            window.fetch = originalFetch;
        }

    }

    // Test real-time sync
    async testRealTimeSync() {
        const stateManager = window.EnhancedStateManager;
        
        // Subscribe to state changes
        let changeCount = 0;
        const unsubscribe = stateManager.subscribe('clients', (message) => {
            changeCount++;
        });

        // Create a client to trigger sync
        const clientData = {
            name: 'Sync Test Client ' + Date.now(),
            industry: 'Technology',
            status: 'active'
        };

        await stateManager.createEntity('clients', clientData);
        
        // Wait a bit for sync to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (changeCount === 0) {
            throw new Error('No state changes detected');
        }

        // Unsubscribe
        unsubscribe();

    }

    // Generate test report
    generateReport() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASSED').length;
        const failedTests = totalTests - passedTests;
        const totalDuration = this.testResults.reduce((sum, r) => sum + r.duration, 0);
        
        
        if (failedTests > 0) {
            this.testResults
                .filter(r => r.status === 'FAILED')
                .forEach(r => {
                });
        }
        
        this.testResults
            .filter(r => r.status === 'PASSED')
            .forEach(r => {
            });
        
        // Store results globally for debugging
        window.testResults = this.testResults;
        
        return {
            totalTests,
            passedTests,
            failedTests,
            successRate: (passedTests / totalTests) * 100,
            totalDuration,
            averageDuration: totalDuration / totalTests,
            results: this.testResults
        };
    }
}

// Create global instance
window.StateManagementTestSuite = new StateManagementTestSuite();

// Debug function
window.runStateTests = () => {
    return window.StateManagementTestSuite.runAllTests();
};

export default StateManagementTestSuite;
