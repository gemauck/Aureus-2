/**
 * Smart Hybrid Persistence Hook
 * Manages state, localStorage, and API sync with automatic conflict resolution
 * 
 * @param {string} storageKey - localStorage key (e.g., 'clients', 'projects')
 * @param {object} apiMethods - { list, create, update, delete } API functions
 * @param {object} options - Configuration options
 */

const { useState, useEffect, useCallback, useRef } = React;

export const usePersistence = (storageKey, apiMethods, options = {}) => {
  const {
    enableOffline = true,
    enableRealTimeSync = true,
    syncInterval = 30000,
    retryAttempts = 3,
    conflictStrategy = 'server-wins'
  } = options;

  // State management
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [error, setError] = useState(null);

  // Track pending operations
  const pendingOps = useRef([]);
  const syncTimer = useRef(null);

  // Helper to capitalize storage key
  const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

  // Storage helper with metadata
  const storageHelper = {
    get: () => {
      try {
        const getter = window.storage?.[`get${capitalize(storageKey)}`];
        return getter ? getter() : [];
      } catch (e) {
        console.error(`Failed to read ${storageKey} from storage:`, e);
        return [];
      }
    },
    
    set: (newData, metadata = {}) => {
      try {
        const setter = window.storage?.[`set${capitalize(storageKey)}`];
        if (setter) {
          setter(newData);
          localStorage.setItem(`${storageKey}_meta`, JSON.stringify({
            lastUpdate: Date.now(),
            syncStatus: metadata.syncStatus || 'synced',
            recordCount: newData.length,
            ...metadata
          }));
        }
      } catch (e) {
        console.error(`Failed to write ${storageKey} to storage:`, e);
      }
    },

    getMeta: () => {
      try {
        const meta = localStorage.getItem(`${storageKey}_meta`);
        return meta ? JSON.parse(meta) : {};
      } catch (e) {
        return {};
      }
    }
  };

  // Check authentication
  const isAuthenticated = () => !!window.storage?.getToken?.();

  // Initial data load
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // STEP 1: Load from localStorage first (instant UI)
      const cachedData = storageHelper.get();
      if (cachedData && cachedData.length > 0) {
        setData(cachedData);
        setIsLoading(false);
      }

      // STEP 2: Try to fetch from API
      if (isAuthenticated() && apiMethods.list) {
        try {
          const response = await apiMethods.list();
          const apiData = response?.data?.[storageKey] || response?.[storageKey] || response?.data || response || [];
          
          
          // STEP 3: Update both state and localStorage
          setData(apiData);
          storageHelper.set(apiData, { syncStatus: 'synced' });
          setLastSyncTime(Date.now());
          setSyncStatus('synced');
          
          // Process pending operations
          if (pendingOps.current.length > 0) {
            await processPendingOperations();
          }
        } catch (apiError) {
          console.warn(`⚠️ API failed for ${storageKey}, using cached data:`, apiError.message);
          if (cachedData && cachedData.length > 0) {
            setSyncStatus('dirty');
            setError({ type: 'sync', message: 'Using offline data - will retry' });
          }
        }
      } else if (!cachedData || cachedData.length === 0) {
      }
    } catch (error) {
      console.error(`❌ Failed to load ${storageKey}:`, error);
      setError({ type: 'load', message: error.message });
    } finally {
      setIsLoading(false);
    }
  }, [storageKey]);

  // Create item
  const create = useCallback(async (itemData) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem = {
      ...itemData,
      id: tempId,
      _isTemp: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };


    // STEP 1 & 2: Optimistic update + localStorage
    setData(prev => [...prev, newItem]);
    const updatedData = [...data, newItem];
    storageHelper.set(updatedData, { syncStatus: 'dirty' });
    setSyncStatus('dirty');

    // STEP 3: API call
    if (isAuthenticated() && apiMethods.create) {
      try {
        setIsSyncing(true);
        const response = await apiMethods.create(itemData);
        const serverItem = response?.data?.[storageKey.slice(0, -1)] || 
                          response?.[storageKey.slice(0, -1)] || 
                          response?.data ||
                          response;


        // STEP 4: Replace temp item with server version
        setData(prev => prev.map(item => 
          item.id === tempId ? { ...serverItem, _isTemp: false } : item
        ));
        
        // Update localStorage with server data
        const finalData = data.map(item => 
          item.id === tempId ? { ...serverItem, _isTemp: false } : item
        );
        finalData.push(serverItem); // Add if map didn't find it
        storageHelper.set(finalData, { syncStatus: 'synced' });
        setSyncStatus('synced');
        setLastSyncTime(Date.now());
        
        return { success: true, data: serverItem };
      } catch (apiError) {
        console.error(`❌ API create failed for ${storageKey}:`, apiError.message);
        
        pendingOps.current.push({
          type: 'create',
          data: itemData,
          tempId,
          attempts: 0,
          timestamp: Date.now()
        });
        
        setError({ type: 'sync', message: 'Changes saved locally - will sync when online' });
        return { success: false, error: apiError.message, tempId };
      } finally {
        setIsSyncing(false);
      }
    } else {
      pendingOps.current.push({
        type: 'create',
        data: itemData,
        tempId,
        attempts: 0,
        timestamp: Date.now()
      });
      return { success: true, data: newItem, offline: true };
    }
  }, [data, storageKey]);

  // Update item
  const update = useCallback(async (id, updates) => {

    // STEP 1: Optimistic update
    const updatedItem = {
      ...data.find(item => item.id === id),
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    setData(prev => prev.map(item => 
      item.id === id ? updatedItem : item
    ));

    // STEP 2: localStorage
    const updatedData = data.map(item => 
      item.id === id ? updatedItem : item
    );
    storageHelper.set(updatedData, { syncStatus: 'dirty' });
    setSyncStatus('dirty');

    // STEP 3: API call
    if (isAuthenticated() && apiMethods.update) {
      try {
        setIsSyncing(true);
        const response = await apiMethods.update(id, updates);
        const serverItem = response?.data?.[storageKey.slice(0, -1)] || 
                          response?.[storageKey.slice(0, -1)] || 
                          response?.data ||
                          response;


        // STEP 4: Update with server response
        if (conflictStrategy === 'server-wins' && serverItem) {
          setData(prev => prev.map(item => 
            item.id === id ? serverItem : item
          ));
          const finalData = data.map(item => 
            item.id === id ? serverItem : item
          );
          storageHelper.set(finalData, { syncStatus: 'synced' });
        }
        
        setSyncStatus('synced');
        setLastSyncTime(Date.now());
        
        return { success: true, data: serverItem || updatedItem };
      } catch (apiError) {
        console.error(`❌ API update failed for ${storageKey}/${id}:`, apiError.message);
        
        pendingOps.current.push({
          type: 'update',
          id,
          data: updates,
          attempts: 0,
          timestamp: Date.now()
        });
        
        setError({ type: 'sync', message: 'Changes saved locally - will sync when online' });
        return { success: false, error: apiError.message };
      } finally {
        setIsSyncing(false);
      }
    } else {
      pendingOps.current.push({
        type: 'update',
        id,
        data: updates,
        attempts: 0,
        timestamp: Date.now()
      });
      return { success: true, data: updatedItem, offline: true };
    }
  }, [data, storageKey, conflictStrategy]);

  // Delete item
  const remove = useCallback(async (id) => {

    // STEP 1: Optimistic update
    setData(prev => prev.filter(item => item.id !== id));

    // STEP 2: localStorage
    const updatedData = data.filter(item => item.id !== id);
    storageHelper.set(updatedData, { syncStatus: 'dirty' });
    setSyncStatus('dirty');

    // STEP 3: API call
    if (isAuthenticated() && apiMethods.delete) {
      try {
        setIsSyncing(true);
        await apiMethods.delete(id);
        
        setSyncStatus('synced');
        setLastSyncTime(Date.now());
        
        return { success: true };
      } catch (apiError) {
        console.error(`❌ API delete failed for ${storageKey}/${id}:`, apiError.message);
        
        pendingOps.current.push({
          type: 'delete',
          id,
          attempts: 0,
          timestamp: Date.now()
        });
        
        setError({ type: 'sync', message: 'Changes saved locally - will sync when online' });
        return { success: false, error: apiError.message };
      } finally {
        setIsSyncing(false);
      }
    } else {
      pendingOps.current.push({
        type: 'delete',
        id,
        attempts: 0,
        timestamp: Date.now()
      });
      return { success: true, offline: true };
    }
  }, [data, storageKey]);

  // Process pending operations
  const processPendingOperations = useCallback(async () => {
    if (pendingOps.current.length === 0) return;
    
    const remaining = [];
    
    for (const op of pendingOps.current) {
      try {
        if (op.type === 'create') {
          await create(op.data);
        } else if (op.type === 'update') {
          await update(op.id, op.data);
        } else if (op.type === 'delete') {
          await remove(op.id);
        }
      } catch (error) {
        op.attempts += 1;
        if (op.attempts < retryAttempts) {
          remaining.push(op);
        } else {
          console.error(`❌ Operation failed after ${retryAttempts} attempts:`, op);
        }
      }
    }
    
    pendingOps.current = remaining;
    if (remaining.length === 0) {
      setSyncStatus('synced');
    }
  }, [create, update, remove, retryAttempts, storageKey]);

  // Manual sync
  const sync = useCallback(async () => {
    await loadData();
    await processPendingOperations();
  }, [loadData, processPendingOperations, storageKey]);

  // Background sync
  useEffect(() => {
    if (syncInterval > 0 && isAuthenticated()) {
      syncTimer.current = setInterval(() => {
        if (syncStatus === 'dirty' || pendingOps.current.length > 0) {
          sync();
        }
      }, syncInterval);

      return () => {
        if (syncTimer.current) clearInterval(syncTimer.current);
      };
    }
  }, [syncInterval, syncStatus, sync, storageKey]);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time sync subscription
  useEffect(() => {
    if (!enableRealTimeSync || !window.LiveDataSync) return;

    const subscriberId = `${storageKey}-persistence-hook`;
    const handler = (message) => {
      if (message?.type === 'data' && message.dataType === storageKey) {
        const freshData = Array.isArray(message.data) ? message.data : [];
        setData(freshData);
        storageHelper.set(freshData, { syncStatus: 'synced' });
        setSyncStatus('synced');
        setLastSyncTime(Date.now());
      }
    };

    window.LiveDataSync?.subscribe?.(subscriberId, handler);
    return () => window.LiveDataSync?.unsubscribe?.(subscriberId);
  }, [enableRealTimeSync, storageKey]);

  return {
    data,
    isLoading,
    isSyncing,
    error,
    syncStatus,
    lastSyncTime,
    pendingCount: pendingOps.current.length,
    create,
    update,
    remove,
    refresh: loadData,
    sync,
    clearError: () => setError(null),
    getSyncStatus: () => ({
      status: syncStatus,
      lastSync: lastSyncTime,
      pending: pendingOps.current.length,
      isOnline: isAuthenticated()
    })
  };
};

// Make available globally
if (typeof window !== 'undefined') {
  window.usePersistence = usePersistence;
}
