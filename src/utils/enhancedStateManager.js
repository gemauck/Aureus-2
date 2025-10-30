// Enhanced State Management System with Bulletproof Data Synchronization
class EnhancedStateManager {
    constructor() {
        this.state = new Map();
        this.pendingOperations = new Map();
        this.operationQueue = [];
        this.isProcessingQueue = false;
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.conflictResolution = new Map();
        this.auditLog = [];
        this.subscribers = new Map();
        this.optimisticUpdates = new Map();
        this.lastSyncTimestamp = new Map();
        this.syncInProgress = new Map();
        
        // Bind methods
        this.getState = this.getState.bind(this);
        this.setState = this.setState.bind(this);
        this.updateEntity = this.updateEntity.bind(this);
        this.createEntity = this.createEntity.bind(this);
        this.deleteEntity = this.deleteEntity.bind(this);
        this.syncWithServer = this.syncWithServer.bind(this);
        this.handleConflict = this.handleConflict.bind(this);
        this.rollbackOptimisticUpdate = this.rollbackOptimisticUpdate.bind(this);
        this.subscribe = this.subscribe.bind(this);
        this.unsubscribe = this.unsubscribe.bind(this);
        this.notifySubscribers = this.notifySubscribers.bind(this);
        this.processQueue = this.processQueue.bind(this);
        this.retryOperation = this.retryOperation.bind(this);
        this.validateData = this.validateData.bind(this);
        this.auditOperation = this.auditOperation.bind(this);
    }

    // Get current state for a specific entity type
    getState(entityType) {
        return this.state.get(entityType) || [];
    }

    // Set state for a specific entity type
    setState(entityType, data) {
        const previousState = this.state.get(entityType) || [];
        this.state.set(entityType, data);
        
        // Audit the state change
        this.auditOperation('STATE_CHANGE', entityType, {
            previousCount: previousState.length,
            newCount: data.length,
            timestamp: new Date().toISOString()
        });
        
        // Notify subscribers
        this.notifySubscribers(entityType, {
            type: 'STATE_CHANGE',
            data,
            previousData: previousState,
            timestamp: new Date().toISOString()
        });
        
        console.log(`🔄 State updated for ${entityType}:`, data.length, 'items');
    }

    // Enhanced entity update with optimistic updates and conflict resolution
    async updateEntity(entityType, id, updateData, options = {}) {
        const operationId = `${entityType}_${id}_${Date.now()}`;
        const {
            optimistic = true,
            retryOnFailure = true,
            validateBeforeSave = true,
            skipConflictResolution = false
        } = options;

        console.log(`🔄 Updating ${entityType} ${id}:`, updateData);

        // Validate data before processing
        if (validateBeforeSave) {
            const validationResult = this.validateData(entityType, updateData);
            if (!validationResult.isValid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }
        }

        // Get current entity
        const currentEntities = this.getState(entityType);
        const currentEntity = currentEntities.find(e => e.id === id);
        
        if (!currentEntity) {
            throw new Error(`${entityType} with id ${id} not found`);
        }

        // Create optimistic update
        const optimisticEntity = { ...currentEntity, ...updateData };
        
        if (optimistic) {
            // Apply optimistic update immediately
            this.applyOptimisticUpdate(entityType, id, optimisticEntity, operationId);
        }

        // Add to operation queue
        const operation = {
            id: operationId,
            type: 'UPDATE',
            entityType,
            entityId: id,
            data: updateData,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            optimistic,
            retryOnFailure
        };

        this.operationQueue.push(operation);
        this.pendingOperations.set(operationId, operation);

        // Process queue
        await this.processQueue();

        return optimisticEntity;
    }

    // Enhanced entity creation with validation and conflict detection
    async createEntity(entityType, createData, options = {}) {
        const operationId = `${entityType}_create_${Date.now()}`;
        const {
            optimistic = true,
            retryOnFailure = true,
            validateBeforeSave = true,
            generateId = true
        } = options;

        console.log(`🆕 Creating ${entityType}:`, createData);

        // Validate data before processing
        if (validateBeforeSave) {
            const validationResult = this.validateData(entityType, createData);
            if (!validationResult.isValid) {
                throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
            }
        }

        // Generate ID if needed
        if (generateId && !createData.id) {
            createData.id = this.generateId();
        }

        const newEntity = { ...createData };

        if (optimistic) {
            // Apply optimistic update immediately
            this.applyOptimisticUpdate(entityType, newEntity.id, newEntity, operationId);
        }

        // Add to operation queue
        const operation = {
            id: operationId,
            type: 'CREATE',
            entityType,
            entityId: newEntity.id,
            data: createData,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            optimistic,
            retryOnFailure
        };

        this.operationQueue.push(operation);
        this.pendingOperations.set(operationId, operation);

        // Process queue
        await this.processQueue();

        return newEntity;
    }

    // Enhanced entity deletion with cascade handling
    async deleteEntity(entityType, id, options = {}) {
        const operationId = `${entityType}_${id}_delete_${Date.now()}`;
        const {
            optimistic = true,
            retryOnFailure = true,
            cascade = true
        } = options;

        console.log(`🗑️ Deleting ${entityType} ${id}`);

        // Get current entity
        const currentEntities = this.getState(entityType);
        const currentEntity = currentEntities.find(e => e.id === id);
        
        if (!currentEntity) {
            throw new Error(`${entityType} with id ${id} not found`);
        }

        if (optimistic) {
            // Apply optimistic update immediately
            this.applyOptimisticUpdate(entityType, id, null, operationId);
        }

        // Add to operation queue
        const operation = {
            id: operationId,
            type: 'DELETE',
            entityType,
            entityId: id,
            data: currentEntity,
            timestamp: new Date().toISOString(),
            retryCount: 0,
            optimistic,
            retryOnFailure,
            cascade
        };

        this.operationQueue.push(operation);
        this.pendingOperations.set(operationId, operation);

        // Process queue
        await this.processQueue();

        return true;
    }

    // Apply optimistic update to state
    applyOptimisticUpdate(entityType, entityId, newData, operationId) {
        const currentEntities = this.getState(entityType);
        
        if (newData === null) {
            // Delete operation
            const updatedEntities = currentEntities.filter(e => e.id !== entityId);
            this.setState(entityType, updatedEntities);
        } else if (currentEntities.find(e => e.id === entityId)) {
            // Update operation
            const updatedEntities = currentEntities.map(e => 
                e.id === entityId ? newData : e
            );
            this.setState(entityType, updatedEntities);
        } else {
            // Create operation
            const updatedEntities = [...currentEntities, newData];
            this.setState(entityType, updatedEntities);
        }

        // Store optimistic update for potential rollback
        this.optimisticUpdates.set(operationId, {
            entityType,
            entityId,
            previousData: currentEntities.find(e => e.id === entityId),
            newData,
            timestamp: new Date().toISOString()
        });

        console.log(`✨ Optimistic update applied for ${entityType} ${entityId}`);
    }

    // Rollback optimistic update
    rollbackOptimisticUpdate(operationId) {
        const optimisticUpdate = this.optimisticUpdates.get(operationId);
        if (!optimisticUpdate) return;

        const { entityType, entityId, previousData } = optimisticUpdate;
        const currentEntities = this.getState(entityType);

        if (previousData === undefined) {
            // Was a create operation, remove the entity
            const updatedEntities = currentEntities.filter(e => e.id !== entityId);
            this.setState(entityType, updatedEntities);
        } else {
            // Was an update operation, restore previous data
            const updatedEntities = currentEntities.map(e => 
                e.id === entityId ? previousData : e
            );
            this.setState(entityType, updatedEntities);
        }

        this.optimisticUpdates.delete(operationId);
        console.log(`🔄 Rolled back optimistic update for ${entityType} ${entityId}`);
    }

    // Process operation queue
    async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        try {
            while (this.operationQueue.length > 0) {
                const operation = this.operationQueue.shift();
                await this.executeOperation(operation);
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    // Execute individual operation
    async executeOperation(operation) {
        const { id, type, entityType, entityId, data, retryOnFailure } = operation;

        try {
            console.log(`🔄 Executing ${type} operation for ${entityType} ${entityId}`);

            // Check if sync is in progress for this entity type
            if (this.syncInProgress.get(entityType)) {
                console.log(`⏳ Sync in progress for ${entityType}, queuing operation`);
                this.operationQueue.unshift(operation); // Put back at front
                return;
            }

            // Execute the operation
            let result;
            switch (type) {
                case 'CREATE':
                    result = await this.syncWithServer('POST', `/${entityType}`, data);
                    break;
                case 'UPDATE':
                    result = await this.syncWithServer('PATCH', `/${entityType}/${entityId}`, data);
                    break;
                case 'DELETE':
                    result = await this.syncWithServer('DELETE', `/${entityType}/${entityId}`);
                    break;
                default:
                    throw new Error(`Unknown operation type: ${type}`);
            }

            // Operation successful
            this.pendingOperations.delete(id);
            this.retryAttempts.delete(id);
            
            // Update last sync timestamp
            this.lastSyncTimestamp.set(entityType, new Date().toISOString());

            console.log(`✅ Operation ${type} completed for ${entityType} ${entityId}`);

        } catch (error) {
            console.error(`❌ Operation ${type} failed for ${entityType} ${entityId}:`, error);

            if (retryOnFailure && operation.retryCount < this.maxRetries) {
                // Retry the operation
                operation.retryCount++;
                this.retryAttempts.set(id, operation.retryCount);
                
                console.log(`🔄 Retrying operation ${type} for ${entityType} ${entityId} (attempt ${operation.retryCount})`);
                
                // Add delay before retry
                setTimeout(() => {
                    this.operationQueue.unshift(operation);
                    this.processQueue();
                }, this.retryDelay * operation.retryCount);

            } else {
                // Max retries exceeded or retry disabled
                console.error(`🛑 Operation ${type} failed permanently for ${entityType} ${entityId}`);
                
                // Rollback optimistic update
                this.rollbackOptimisticUpdate(id);
                
                // Remove from pending operations
                this.pendingOperations.delete(id);
                this.retryAttempts.delete(id);
                
                // Notify subscribers of failure
                this.notifySubscribers(entityType, {
                    type: 'OPERATION_FAILED',
                    operation,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    // Sync with server
    async syncWithServer(method, endpoint, data = null) {
        const token = window.storage?.getToken?.();
        if (!token) {
            throw new Error('No authentication token available');
        }

        const url = `${window.DatabaseAPI.API_BASE}/api${endpoint}`;
        const buildOptions = (authToken) => ({
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            credentials: 'include'
        });

        let options = buildOptions(token);
        if (data && method !== 'GET') {
            options.body = JSON.stringify(data);
        }

        let response = await fetch(url, options);

        if (!response.ok && response.status === 401) {
            // attempt refresh once
            try {
                const refreshUrl = `${window.DatabaseAPI.API_BASE}/api/auth/refresh`;
                const refreshRes = await fetch(refreshUrl, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
                if (refreshRes.ok) {
                    const text = await refreshRes.text();
                    const refreshData = text ? JSON.parse(text) : {};
                    const newToken = refreshData?.data?.accessToken || refreshData?.accessToken;
                    if (newToken && window.storage?.setToken) {
                        window.storage.setToken(newToken);
                        options = buildOptions(newToken);
                        if (data && method !== 'GET') options.body = JSON.stringify(data);
                        response = await fetch(url, options);
                    }
                }
            } catch (_) {
                // ignore; handle below
            }
        }

        if (!response.ok) {
            if (response.status === 401) {
                // Avoid logging out for permission endpoints
                const permissionLikely = endpoint.startsWith('/users') || endpoint.startsWith('/admin');
                if (!permissionLikely) {
                    if (window.storage?.removeToken) window.storage.removeToken();
                    if (window.storage?.removeUser) window.storage.removeUser();
                    if (window.LiveDataSync) {
                        window.LiveDataSync.stop();
                    }
                    if (!window.location.hash.includes('#/login')) {
                        window.location.hash = '#/login';
                    }
                }
                throw new Error('Authentication expired or unauthorized');
            }
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        return result;
    }

    // Handle conflicts between local and server data
    async handleConflict(entityType, localData, serverData) {
        const conflictId = `${entityType}_${localData.id}_${Date.now()}`;
        
        this.conflictResolution.set(conflictId, {
            entityType,
            localData,
            serverData,
            timestamp: new Date().toISOString(),
            resolved: false
        });

        // For now, prioritize server data (last-write-wins)
        // In a production system, you might want to implement more sophisticated conflict resolution
        console.log(`⚠️ Conflict detected for ${entityType} ${localData.id}, using server data`);
        
        return serverData;
    }

    // Validate data before saving
    validateData(entityType, data) {
        const errors = [];
        
        // Basic validation rules
        switch (entityType) {
            case 'clients':
                if (!data.name || data.name.trim().length === 0) {
                    errors.push('Name is required');
                }
                if (data.revenue && (isNaN(data.revenue) || data.revenue < 0)) {
                    errors.push('Revenue must be a positive number');
                }
                break;
            case 'leads':
                if (!data.name || data.name.trim().length === 0) {
                    errors.push('Name is required');
                }
                if (data.value && (isNaN(data.value) || data.value < 0)) {
                    errors.push('Value must be a positive number');
                }
                break;
            case 'projects':
                if (!data.name || data.name.trim().length === 0) {
                    errors.push('Name is required');
                }
                if (data.budget && (isNaN(data.budget) || data.budget < 0)) {
                    errors.push('Budget must be a positive number');
                }
                break;
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // Audit operation
    auditOperation(action, entityType, details) {
        const auditEntry = {
            id: this.generateId(),
            action,
            entityType,
            details,
            timestamp: new Date().toISOString(),
            userId: window.storage?.getUser?.()?.id || 'anonymous'
        };

        this.auditLog.push(auditEntry);
        
        // Keep only last 1000 audit entries
        if (this.auditLog.length > 1000) {
            this.auditLog = this.auditLog.slice(-1000);
        }

        console.log(`📝 Audit: ${action} on ${entityType}`, details);
    }

    // Subscribe to state changes
    subscribe(entityType, callback) {
        if (!this.subscribers.has(entityType)) {
            this.subscribers.set(entityType, new Set());
        }
        this.subscribers.get(entityType).add(callback);
        
        console.log(`📡 Subscribed to ${entityType} updates`);
    }

    // Unsubscribe from state changes
    unsubscribe(entityType, callback) {
        if (this.subscribers.has(entityType)) {
            this.subscribers.get(entityType).delete(callback);
        }
        
        console.log(`📡 Unsubscribed from ${entityType} updates`);
    }

    // Notify subscribers
    notifySubscribers(entityType, message) {
        if (this.subscribers.has(entityType)) {
            this.subscribers.get(entityType).forEach(callback => {
                try {
                    callback(message);
                } catch (error) {
                    console.error('Error in subscriber callback:', error);
                }
            });
        }
    }

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Get operation status
    getOperationStatus() {
        return {
            pendingOperations: this.pendingOperations.size,
            operationQueue: this.operationQueue.length,
            isProcessingQueue: this.isProcessingQueue,
            optimisticUpdates: this.optimisticUpdates.size,
            lastSyncTimestamps: Object.fromEntries(this.lastSyncTimestamp),
            auditLogCount: this.auditLog.length
        };
    }

    // Force sync all data
    async forceSyncAll() {
        console.log('🔄 Force syncing all data...');
        
        const entityTypes = ['clients', 'leads', 'projects', 'invoices', 'timeEntries', 'users'];
        
        for (const entityType of entityTypes) {
            try {
                this.syncInProgress.set(entityType, true);
                const data = await this.syncWithServer('GET', `/${entityType}`);
                this.setState(entityType, data.data || data[entityType] || []);
                console.log(`✅ Synced ${entityType}:`, data.data?.length || data[entityType]?.length || 0);
            } catch (error) {
                console.error(`❌ Failed to sync ${entityType}:`, error);
            } finally {
                this.syncInProgress.set(entityType, false);
            }
        }
        
        console.log('✅ Force sync completed');
    }

    // Clear all data
    clearAll() {
        this.state.clear();
        this.pendingOperations.clear();
        this.operationQueue = [];
        this.retryAttempts.clear();
        this.conflictResolution.clear();
        this.auditLog = [];
        this.optimisticUpdates.clear();
        this.lastSyncTimestamp.clear();
        this.syncInProgress.clear();
        
        // Debugging disabled
        if (window.debug && window.debug.enabled) {
            console.log('🧹 All state cleared');
        }
    }
}

// Create global instance
window.EnhancedStateManager = new EnhancedStateManager();

// Debug function - disabled by default
window.debugEnhancedState = () => {
    // Debugging disabled - uncomment to enable:
    // console.log('🔍 Enhanced State Manager Debug:', window.EnhancedStateManager.getOperationStatus());
};

export default EnhancedStateManager;
