// Comprehensive System Test Script
class SystemTestRunner {
    constructor() {
        this.testResults = [];
        this.isRunning = false;
        this.testTimeout = 60000; // 60 seconds per test
    }

    // Run comprehensive system tests
    async runSystemTests() {
        this.isRunning = true;
        
        try {
            // Test 1: Enhanced State Manager Initialization
            await this.testStateManagerInitialization();
            
            // Test 2: Enhanced API Wrapper Initialization
            await this.testAPIWrapperInitialization();
            
            // Test 3: Data Validation
            await this.testDataValidation();
            
            // Test 4: CRUD Operations
            await this.testCRUDOperations();
            
            // Test 5: Optimistic Updates
            await this.testOptimisticUpdates();
            
            // Test 6: Error Handling
            await this.testErrorHandling();
            
            // Test 7: Offline Mode
            await this.testOfflineMode();
            
            // Test 8: Concurrent Operations
            await this.testConcurrentOperations();
            
            // Test 9: Real-time Sync
            await this.testRealTimeSync();
            
            // Test 10: UI Integration
            await this.testUIIntegration();
            
        } catch (error) {
            console.error('❌ System test suite failed:', error);
        } finally {
            this.isRunning = false;
            this.generateSystemReport();
        }
    }

    // Test Enhanced State Manager Initialization
    async testStateManagerInitialization() {
        
        try {
            if (!window.EnhancedStateManager) {
                throw new Error('EnhancedStateManager not available');
            }
            
            const stateManager = window.EnhancedStateManager;
            
            // Test basic functionality
            const testData = [{ id: '1', name: 'Test Client' }];
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
            
            this.testResults.push({ test: 'State Manager Initialization', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Enhanced State Manager initialization test failed:', error);
            this.testResults.push({ test: 'State Manager Initialization', status: 'FAILED', error: error.message });
        }
    }

    // Test Enhanced API Wrapper Initialization
    async testAPIWrapperInitialization() {
        
        try {
            if (!window.EnhancedAPIWrapper) {
                throw new Error('EnhancedAPIWrapper not available');
            }
            
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
            
            this.testResults.push({ test: 'API Wrapper Initialization', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Enhanced API Wrapper initialization test failed:', error);
            this.testResults.push({ test: 'API Wrapper Initialization', status: 'FAILED', error: error.message });
        }
    }

    // Test Data Validation
    async testDataValidation() {
        
        try {
            const stateManager = window.EnhancedStateManager;
            
            // Test valid client data
            const validClientData = {
                name: 'Valid Client',
                industry: 'Technology',
                revenue: 100000,
                status: 'active'
            };
            
            const validationResult = stateManager.validateData('clients', validClientData);
            if (!validationResult.isValid) {
                throw new Error('Valid client data failed validation');
            }
            
            // Test invalid client data
            const invalidClientData = {
                // Missing required name field
                industry: 'Technology',
                revenue: 'invalid_number'
            };
            
            const invalidValidationResult = stateManager.validateData('clients', invalidClientData);
            if (invalidValidationResult.isValid) {
                throw new Error('Invalid client data passed validation');
            }
            
            this.testResults.push({ test: 'Data Validation', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Data validation test failed:', error);
            this.testResults.push({ test: 'Data Validation', status: 'FAILED', error: error.message });
        }
    }

    // Test CRUD Operations
    async testCRUDOperations() {
        
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
            
            this.testResults.push({ test: 'CRUD Operations', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ CRUD operations test failed:', error);
            this.testResults.push({ test: 'CRUD Operations', status: 'FAILED', error: error.message });
        }
    }

    // Test Optimistic Updates
    async testOptimisticUpdates() {
        
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
            
            this.testResults.push({ test: 'Optimistic Updates', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Optimistic updates test failed:', error);
            this.testResults.push({ test: 'Optimistic Updates', status: 'FAILED', error: error.message });
        }
    }

    // Test Error Handling
    async testErrorHandling() {
        
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
            
            // Test network error simulation
            const originalFetch = window.fetch;
            window.fetch = () => Promise.reject(new Error('Network error'));
            
            try {
                await stateManager.createEntity('clients', {
                    name: 'Network Test Client',
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
            
            this.testResults.push({ test: 'Error Handling', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Error handling test failed:', error);
            this.testResults.push({ test: 'Error Handling', status: 'FAILED', error: error.message });
        }
    }

    // Test Offline Mode
    async testOfflineMode() {
        
        try {
            const apiWrapper = window.EnhancedAPIWrapper;
            
            // Simulate offline mode
            const originalFetch = window.fetch;
            window.fetch = () => Promise.reject(new Error('Offline'));
            
            try {
                const result = await apiWrapper.get('/clients');
                
                if (!result.offline) {
                    throw new Error('Offline response not detected');
                }
                
                if (!result.queued) {
                    throw new Error('Request not queued for offline mode');
                }
                
            } finally {
                window.fetch = originalFetch;
            }
            
            this.testResults.push({ test: 'Offline Mode', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Offline mode test failed:', error);
            this.testResults.push({ test: 'Offline Mode', status: 'FAILED', error: error.message });
        }
    }

    // Test Concurrent Operations
    async testConcurrentOperations() {
        
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
            
            this.testResults.push({ test: 'Concurrent Operations', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Concurrent operations test failed:', error);
            this.testResults.push({ test: 'Concurrent Operations', status: 'FAILED', error: error.message });
        }
    }

    // Test Real-time Sync
    async testRealTimeSync() {
        
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
            
            this.testResults.push({ test: 'Real-time Sync', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ Real-time sync test failed:', error);
            this.testResults.push({ test: 'Real-time Sync', status: 'FAILED', error: error.message });
        }
    }

    // Test UI Integration
    async testUIIntegration() {
        
        try {
            // Check if Clients component is available
            if (typeof window.Clients !== 'function') {
                throw new Error('Clients component not available');
            }
            
            // Check if enhanced save functions are available
            const clientsElement = document.querySelector('[data-testid="clients-component"]');
            if (!clientsElement) {
            }
            
            // Test if enhanced state management is integrated
            if (!window.EnhancedStateManager) {
                throw new Error('Enhanced state management not integrated');
            }
            
            if (!window.EnhancedAPIWrapper) {
                throw new Error('Enhanced API wrapper not integrated');
            }
            
            this.testResults.push({ test: 'UI Integration', status: 'PASSED' });
            
        } catch (error) {
            console.error('❌ UI integration test failed:', error);
            this.testResults.push({ test: 'UI Integration', status: 'FAILED', error: error.message });
        }
    }

    // Generate system test report
    generateSystemReport() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.status === 'PASSED').length;
        const failedTests = totalTests - passedTests;
        
        
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
        window.systemTestResults = this.testResults;
        
        return {
            totalTests,
            passedTests,
            failedTests,
            successRate: (passedTests / totalTests) * 100,
            results: this.testResults
        };
    }
}

// Create global instance
window.SystemTestRunner = new SystemTestRunner();

// Debug function
window.runSystemTests = () => {
    return window.SystemTestRunner.runSystemTests();
};

export default SystemTestRunner;
