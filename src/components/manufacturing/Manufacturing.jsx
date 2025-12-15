// Use React from window
console.log('🔵 Manufacturing.jsx: Script started loading...');

// Safely access React hooks from the global window.React without throwing
// If React isn't ready yet, we fall back to an empty object so the script
// doesn't crash before we can register a fallback component.
const ReactGlobal = window.React || {};
const { useState, useEffect, useCallback, useMemo, useRef, createElement } = ReactGlobal;
// Safely access useAuth - don't destructure if undefined
const useAuth = window.useAuth || (() => {
  console.error('❌ Manufacturing: useAuth is not available');
  return { user: null };
});

// Helper to safely get React for error fallbacks
const getReactForError = () => window.React || ReactGlobal;

const MANUFACTURING_TABS = ['dashboard', 'inventory', 'bom', 'production', 'sales', 'purchase', 'movements', 'suppliers', 'locations'];
const normalizeManufacturingTab = (value = 'dashboard') => {
  const normalized = (value || 'dashboard').toLowerCase();
  return MANUFACTURING_TABS.includes(normalized) ? normalized : 'dashboard';
};

// Wrap component definition in try-catch to catch any errors during definition
let Manufacturing;
try {
  Manufacturing = () => {
  // Safety check for React hooks - if React isn't ready, show error
  if (!ReactGlobal || !ReactGlobal.useState || !ReactGlobal.useEffect) {
    console.error('❌ Manufacturing: React hooks are not available');
    const ReactForError = getReactForError();
    if (ReactForError && ReactForError.createElement) {
      return ReactForError.createElement('div', { className: 'text-center py-12 text-gray-500' },
        'React is not loaded yet. Please wait a moment and refresh the page.'
      );
    }
    return null;
  }
  
  // Safety check for useAuth
  if (!window.useAuth) {
    console.error('❌ Manufacturing: useAuth is not available');
    const ReactForError = getReactForError();
    if (ReactForError && ReactForError.createElement) {
      return ReactForError.createElement('div', { className: 'text-center py-12 text-gray-500' },
        'Authentication not loaded. Please refresh the page.'
      );
    }
    return null;
  }
  
  const { user } = useAuth();
  
  // Helper function to safely call DatabaseAPI methods
  const safeCallAPI = async (methodName, ...args) => {
    if (!window.DatabaseAPI || typeof window.DatabaseAPI[methodName] !== 'function') {
      console.error(`window.DatabaseAPI.${methodName} is not available`);
      throw new Error(`DatabaseAPI method ${methodName} is not available`);
    }
    return await window.DatabaseAPI[methodName](...args);
  };

  // Helper to resolve the canonical inventory item id.
  // In some views (e.g. location-filtered inventory) the backend
  // returns a location-scoped `id` like `${locationInventoryId}-${locationId}`
  // as well as `inventoryItemId` which is the real inventoryItem.id.
  // All write operations (update/delete) should use the canonical id.
  const getInventoryItemId = (itemOrId) => {
    if (!itemOrId) return null;

    // If we were passed a primitive id, just return it
    if (typeof itemOrId === 'string') {
      return itemOrId;
    }

    // Prefer the explicit inventoryItemId when present
    if (itemOrId.inventoryItemId) {
      return itemOrId.inventoryItemId;
    }

    // Fallback: use the item's own id
    return itemOrId.id || null;
  };
  const getInitialTabFromURL = () => {
    try {
      if (window.RouteState) {
        const route = window.RouteState.getRoute();
        if (route.page === 'manufacturing') {
          return normalizeManufacturingTab(route.segments[0]);
        }
      }
      const pathnameSegments = (window.location.pathname || '')
        .replace(/^\//, '')
        .split('/')
        .filter(Boolean);
      if ((pathnameSegments[0] || '').toLowerCase() === 'manufacturing' && pathnameSegments[1]) {
        return normalizeManufacturingTab(pathnameSegments[1]);
      }
      const hashValue = (window.location.hash || '').replace('#', '').toLowerCase();
      if (hashValue && MANUFACTURING_TABS.includes(hashValue)) {
        return hashValue;
      }
    } catch (error) {
      console.warn('Manufacturing: Failed to derive initial tab from URL', error);
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getInitialTabFromURL);
  const [inventory, setInventory] = useState([]);
  const [boms, setBoms] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  // Initialize movements from localStorage if available
  const [movements, setMovements] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
      return cached;
    } catch (e) {
      console.error('Error loading cached movements:', e);
      return [];
    }
  });
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [formData, setFormData] = useState({});
  const [viewingInventoryItemDetail, setViewingInventoryItemDetail] = useState(null); // Full-page detail view
  const [isEditingInventoryItem, setIsEditingInventoryItem] = useState(false); // Edit mode in detail view
  const [bomComponents, setBomComponents] = useState([]);
  const [salesOrderItems, setSalesOrderItems] = useState([]);
  const [newSalesOrderItem, setNewSalesOrderItem] = useState({ sku: '', name: '', quantity: 1, unitPrice: 0 });
  const [purchaseOrderItems, setPurchaseOrderItems] = useState([]);
  const [newPurchaseOrderItem, setNewPurchaseOrderItem] = useState({ sku: '', name: '', quantity: 1, unitPrice: 0 });
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedLocationId, setSelectedLocationId] = useState('all'); // Location filter for inventory
  const [columnFilters, setColumnFilters] = useState({}); // Column-specific filters
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' }); // Sorting state
  const syncTabToRoute = useCallback((tab, options = {}) => {
    const normalizedTab = normalizeManufacturingTab(tab);
    const segments = normalizedTab === 'dashboard' ? [] : [normalizedTab];

    if (window.RouteState) {
      const currentRoute = window.RouteState.getRoute();
      const currentTab = currentRoute.page === 'manufacturing' ? normalizeManufacturingTab(currentRoute.segments[0]) : null;
      const hasExtraSegments = currentRoute.page === 'manufacturing' ? currentRoute.segments.slice(1).length > 0 : false;
      if (currentRoute.page === 'manufacturing' && currentTab === normalizedTab && !hasExtraSegments) {
        return;
      }
      window.RouteState.setPageSubpath('manufacturing', segments, {
        replace: options.replace ?? false,
        preserveSearch: true,
        preserveHash: false
      });
    } else {
      const path = segments.length === 0 ? '/manufacturing' : `/manufacturing/${segments.join('/')}`;
      const method = options.replace ? 'replaceState' : 'pushState';
      window.history[method]({ page: 'manufacturing', tab: normalizedTab }, '', path);
    }
  }, []);

  const changeTab = useCallback((tab, options = {}) => {
    const normalizedTab = normalizeManufacturingTab(tab);
    setActiveTab(normalizedTab);
    if (!options.skipUrlSync) {
      syncTabToRoute(normalizedTab, { replace: options.replace });
    }
  }, [syncTabToRoute]);

  useEffect(() => {
    if (!window.RouteState) {
      return;
    }
    const unsubscribe = window.RouteState.subscribe((route) => {
      if (route.page !== 'manufacturing') {
        return;
      }
      changeTab(route.segments[0], { skipUrlSync: true });
    });
    return unsubscribe;
  }, [changeTab]);
  
  // Track user input state to prevent data sync from interrupting typing
  const isUserTypingRef = useRef(false);
  const activeInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  
  // Refs for input values to prevent re-renders from losing focus
  const searchInputRef = useRef(null);
  const filterInputRefs = useRef({});
  
  // Refs to store current filter values while typing (to prevent re-renders)
  const searchTermRef = useRef('');
  const columnFiltersRef = useRef({});
  
  // Sync refs with state
  useEffect(() => {
    searchTermRef.current = searchTerm;
  }, [searchTerm]);
  
  useEffect(() => {
    columnFiltersRef.current = columnFilters;
  }, [columnFilters]);
  const [stockLocations, setStockLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExportingInventory, setIsExportingInventory] = useState(false);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState({ current: 0, total: 0 });
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [pendingCreateData, setPendingCreateData] = useState(null);
  const fileInputRef = useRef(null);


  // Load data from API - OPTIMIZED: Parallel loading + localStorage cache
  useEffect(() => {
    const loadData = async () => {
      try {
        // STEP 1: Load from localStorage immediately for instant UI
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        const cachedBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
        const cachedProductionOrders = JSON.parse(localStorage.getItem('manufacturing_production_orders') || '[]');
        const cachedSalesOrders = JSON.parse(localStorage.getItem('manufacturing_sales_orders') || '[]');
        const cachedPurchaseOrders = JSON.parse(localStorage.getItem('manufacturing_purchase_orders') || '[]');
        const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
        const cachedSuppliers = JSON.parse(localStorage.getItem('manufacturing_suppliers') || '[]');

        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
        }
        if (cachedBOMs.length > 0) {
          setBoms(cachedBOMs);
        }
        if (cachedProductionOrders.length > 0) {
          setProductionOrders(cachedProductionOrders);
        }
        if (cachedSalesOrders.length > 0) {
          setSalesOrders(cachedSalesOrders);
        }
        if (cachedPurchaseOrders.length > 0) {
          setPurchaseOrders(cachedPurchaseOrders);
        }
        if (cachedMovements.length > 0) {
          setMovements(cachedMovements);
        }
        if (cachedSuppliers.length > 0) {
          setSuppliers(cachedSuppliers);
        }

        // Load stock locations from localStorage first, then sync from API
        const loadedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        setStockLocations(loadedLocations);

        // Load only user-added categories (no default categories)
        // Filter out default categories if they exist in localStorage
        const defaultCategories = ['components', 'packaging', 'accessories', 'finished_goods', 'work_in_progress'];
        const loadedCategories = JSON.parse(localStorage.getItem('inventory_categories') || '[]');
        const userCategories = loadedCategories.filter(cat => !defaultCategories.includes(cat));
        
        if (userCategories.length > 0) {
          setCategories(userCategories);
          // Update localStorage to only contain user-added categories
          localStorage.setItem('inventory_categories', JSON.stringify(userCategories));
        } else if (loadedCategories.length > 0) {
          // Clear localStorage if it only had default categories
          localStorage.setItem('inventory_categories', JSON.stringify([]));
        }

        // STEP 2: Load from API in parallel (background sync)
        if (!window.DatabaseAPI) {
          console.warn('⚠️ Manufacturing: DatabaseAPI not available');
          return;
        }

        const startTime = performance.now();

        // Create parallel API calls
        const apiCalls = [];

        // Stock Locations - Load on every data refresh
        if (typeof window.DatabaseAPI.getStockLocations === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getStockLocations()
              .then(locResponse => {
                const locData = locResponse?.data?.locations || [];
                setStockLocations(locData);
                localStorage.setItem('stock_locations', JSON.stringify(locData));
                
                // Ensure main warehouse exists (LOC001)
                const mainWarehouse = locData.find(loc => loc.code === 'LOC001');
                if (!mainWarehouse && locData.length === 0) {
                  console.warn('⚠️ Main warehouse (LOC001) not found - inventory may need assignment');
                }
                
                return { type: 'locations', data: locData };
              })
              .catch(error => {
                console.error('Error loading stock locations:', error);
                // Don't fail completely - use localStorage fallback
                const cached = JSON.parse(localStorage.getItem('stock_locations') || '[]');
                if (cached.length > 0) {
                  setStockLocations(cached);
                }
                return { type: 'locations', error };
              })
          );
        }

        // Inventory - Load based on selected location
        if (typeof window.DatabaseAPI.getInventory === 'function') {
          const locationIdToLoad = selectedLocationId && selectedLocationId !== 'all' ? selectedLocationId : null;
          apiCalls.push(
            window.DatabaseAPI.getInventory(locationIdToLoad)
              .then(invResponse => {
                const invData = invResponse?.data?.inventory || [];
                const processed = invData.map(item => ({ ...item, id: item.id }));
                setInventory(processed);
                localStorage.setItem('manufacturing_inventory', JSON.stringify(processed));
                return { type: 'inventory', data: processed };
              })
              .catch(error => {
                console.error('Error loading inventory:', error);
                return { type: 'inventory', error };
              })
          );
        }

        // BOMs
        if (typeof window.DatabaseAPI.getBOMs === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getBOMs()
              .then(bomResponse => {
                const bomData = bomResponse?.data?.boms || [];
                const processed = bomData.map(bom => ({
                  ...bom,
                  id: bom.id,
                  components: Array.isArray(bom.components) ? bom.components : (typeof bom.components === 'string' ? JSON.parse(bom.components || '[]') : [])
                }));
                setBoms(processed);
                localStorage.setItem('manufacturing_boms', JSON.stringify(processed));
                return { type: 'boms', data: processed };
              })
              .catch(error => {
                console.error('Error loading BOMs:', error);
                return { type: 'boms', error };
              })
          );
        }

        // Production Orders
        if (typeof window.DatabaseAPI.getProductionOrders === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getProductionOrders()
              .then(ordersResponse => {
                const ordersData = ordersResponse?.data?.productionOrders || [];
                const processed = ordersData.map(order => ({ ...order, id: order.id }));
                setProductionOrders(processed);
                localStorage.setItem('manufacturing_production_orders', JSON.stringify(processed));
                return { type: 'productionOrders', data: processed };
              })
              .catch(error => {
                console.error('Error loading production orders:', error);
                return { type: 'productionOrders', error };
              })
          );
        }

        // Sales Orders
        if (typeof window.DatabaseAPI.getSalesOrders === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getSalesOrders()
              .then(ordersResponse => {
                const ordersData = ordersResponse?.data?.salesOrders || [];
                const processed = ordersData.map(order => ({ ...order, id: order.id }));
                setSalesOrders(processed);
                localStorage.setItem('manufacturing_sales_orders', JSON.stringify(processed));
                return { type: 'salesOrders', data: processed };
              })
              .catch(error => {
                console.error('Error loading sales orders:', error);
                return { type: 'salesOrders', error };
              })
          );
        }

        // Purchase Orders
        if (typeof window.DatabaseAPI.getPurchaseOrders === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getPurchaseOrders()
              .then(ordersResponse => {
                const ordersData = ordersResponse?.data?.purchaseOrders || [];
                const processed = ordersData.map(order => ({ ...order, id: order.id }));
                setPurchaseOrders(processed);
                localStorage.setItem('manufacturing_purchase_orders', JSON.stringify(processed));
                return { type: 'purchaseOrders', data: processed };
              })
              .catch(error => {
                console.error('Error loading purchase orders:', error);
                return { type: 'purchaseOrders', error };
              })
          );
        }

        // Stock Movements
        if (typeof window.DatabaseAPI.getStockMovements === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getStockMovements()
              .then(movementsResponse => {
                const movementsData = movementsResponse?.data?.movements || [];
                const processed = movementsData.map(movement => ({ ...movement, id: movement.id }));
                
                // Log type breakdown to verify all types are included
                const typeBreakdown = processed.reduce((acc, m) => {
                  acc[m.type] = (acc[m.type] || 0) + 1;
                  return acc;
                }, {});
                
                setMovements(processed);
                localStorage.setItem('manufacturing_movements', JSON.stringify(processed));
                return { type: 'movements', data: processed };
              })
              .catch(error => {
                console.error('Error loading stock movements:', error);
                return { type: 'movements', error };
              })
          );
        }

        // Suppliers
        if (typeof window.DatabaseAPI.getSuppliers === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getSuppliers()
              .then(suppliersResponse => {
                const suppliersData = suppliersResponse?.data?.suppliers || [];
                const processed = suppliersData.map(supplier => ({
                  ...supplier,
                  id: supplier.id,
                  createdAt: supplier.createdAt || new Date().toISOString().split('T')[0],
                  updatedAt: supplier.updatedAt || new Date().toISOString().split('T')[0]
                }));
                setSuppliers(processed);
                localStorage.setItem('manufacturing_suppliers', JSON.stringify(processed));
                return { type: 'suppliers', data: processed };
              })
              .catch(error => {
                console.error('Error loading suppliers:', error);
                // Fallback to localStorage if database fails
                const loadedSuppliers = JSON.parse(localStorage.getItem('manufacturing_suppliers') || '[]');
                if (loadedSuppliers.length > 0) {
                  setSuppliers(loadedSuppliers);
                }
                return { type: 'suppliers', error };
              })
          );
        } else {
          // Fallback to localStorage if DatabaseAPI not available
          const loadedSuppliers = JSON.parse(localStorage.getItem('manufacturing_suppliers') || '[]');
          if (loadedSuppliers.length > 0) {
            setSuppliers(loadedSuppliers.length ? loadedSuppliers : getInitialSuppliers());
          }
        }

        // Clients (for production order allocation)
        if (typeof window.DatabaseAPI.getClients === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getClients()
              .then(response => {
                // Extract clients from response - handle different response structures
                const allClients = response?.data?.clients || response?.data || (Array.isArray(response) ? response : []);
                const processed = Array.isArray(allClients) ? allClients : [];
                // Filter for active clients - also include clients without explicit status/type
                const activeClients = processed.filter(c => {
                  const status = (c.status || '').toLowerCase();
                  const type = (c.type || 'client').toLowerCase();
                  return (status === 'active' || status === '') && (type === 'client' || type === '');
                });
                setClients(activeClients);
                return { type: 'clients', data: activeClients };
              })
              .catch(error => {
                console.error('Error loading clients:', error);
                // Try to load from localStorage as fallback
                try {
                  const cachedClients = JSON.parse(localStorage.getItem('clients') || '[]');
                  if (Array.isArray(cachedClients) && cachedClients.length > 0) {
                    const activeClients = cachedClients.filter(c => {
                      const status = (c.status || '').toLowerCase();
                      const type = (c.type || 'client').toLowerCase();
                      return (status === 'active' || status === '') && (type === 'client' || type === '');
                    });
                    setClients(activeClients);
                  }
                } catch (cacheError) {
                  console.error('Error loading clients from cache:', cacheError);
                }
                return { type: 'clients', error };
              })
          );
        }

        // Users (for job cards - technicians)
        if (typeof window.DatabaseAPI.getUsers === 'function') {
          apiCalls.push(
            window.DatabaseAPI.getUsers()
              .then(usersResponse => {
                const usersData = usersResponse?.data?.users || usersResponse?.data || [];
                setUsers(Array.isArray(usersData) ? usersData : []);
                return { type: 'users', data: usersData };
              })
              .catch(error => {
                console.error('Error loading users:', error);
                return { type: 'users', error };
              })
          );
        }

        // Execute all API calls in parallel
        if (apiCalls.length > 0) {
          const results = await Promise.all(apiCalls);
          const endTime = performance.now();
          const loadTime = ((endTime - startTime) / 1000).toFixed(2);
        }
      } catch (error) {
        console.error('Error loading manufacturing data:', error);
      }
    };

    loadData();
  }, []);

  // Manual refresh for diagnostics - OPTIMIZED: Parallel loading
  const refreshAllManufacturingData = async () => {
    try {
      setIsRefreshing(true);
      const startTime = performance.now();

      const apiCalls = [];

      // Inventory
      if (window.DatabaseAPI?.getInventory) {
        apiCalls.push(
          window.DatabaseAPI.getInventory()
            .then(invResponse => {
              const invData = invResponse?.data?.inventory || [];
              const processed = invData.map(item => ({ ...item, id: item.id }));
              setInventory(processed);
              localStorage.setItem('manufacturing_inventory', JSON.stringify(processed));
              return { type: 'inventory', data: processed };
            })
            .catch(error => ({ type: 'inventory', error }))
        );
      }

      // BOMs
      if (window.DatabaseAPI?.getBOMs) {
        apiCalls.push(
          window.DatabaseAPI.getBOMs()
            .then(bomResponse => {
              const bomData = bomResponse?.data?.boms || [];
              const processed = bomData.map(bom => ({
                ...bom,
                id: bom.id,
                components: Array.isArray(bom.components) ? bom.components : (typeof bom.components === 'string' ? JSON.parse(bom.components || '[]') : [])
              }));
              setBoms(processed);
              localStorage.setItem('manufacturing_boms', JSON.stringify(processed));
              return { type: 'boms', data: processed };
            })
            .catch(error => ({ type: 'boms', error }))
        );
      }

      // Production Orders
      if (window.DatabaseAPI?.getProductionOrders) {
        apiCalls.push(
          window.DatabaseAPI.getProductionOrders()
            .then(ordersResponse => {
              const ordersData = ordersResponse?.data?.productionOrders || [];
              const processed = ordersData.map(order => ({ ...order, id: order.id }));
              setProductionOrders(processed);
              localStorage.setItem('manufacturing_production_orders', JSON.stringify(processed));
              return { type: 'productionOrders', data: processed };
            })
            .catch(error => ({ type: 'productionOrders', error }))
        );
      }

      // Movements
      if (window.DatabaseAPI?.getStockMovements) {
        apiCalls.push(
          window.DatabaseAPI.getStockMovements()
            .then(movementsResponse => {
              const movementsData = movementsResponse?.data?.movements || [];
              const processed = movementsData.map(movement => ({ ...movement, id: movement.id }));
              setMovements(processed);
              localStorage.setItem('manufacturing_movements', JSON.stringify(processed));
              return { type: 'movements', data: processed };
            })
            .catch(error => ({ type: 'movements', error }))
        );
      }

      // Suppliers
      if (window.DatabaseAPI?.getSuppliers) {
        apiCalls.push(
          window.DatabaseAPI.getSuppliers()
            .then(suppliersResponse => {
              const suppliersData = suppliersResponse?.data?.suppliers || [];
              const processed = suppliersData.map(supplier => ({
                ...supplier,
                id: supplier.id,
                createdAt: supplier.createdAt || new Date().toISOString().split('T')[0],
                updatedAt: supplier.updatedAt || new Date().toISOString().split('T')[0]
              }));
              setSuppliers(processed);
              localStorage.setItem('manufacturing_suppliers', JSON.stringify(processed));
              return { type: 'suppliers', data: processed };
            })
            .catch(error => ({ type: 'suppliers', error }))
        );
      }

      if (apiCalls.length > 0) {
        await Promise.all(apiCalls);
        const endTime = performance.now();
        const loadTime = ((endTime - startTime) / 1000).toFixed(2);
      }
    } catch (e) {
      console.error('Error refreshing manufacturing data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleExportInventory = useCallback(() => {
    if (!Array.isArray(inventory) || inventory.length === 0) {
      window.alert('No inventory data available to export.');
      return;
    }

    setIsExportingInventory(true);

    try {
      const uniqueKeys = new Set();

      inventory.forEach((item) => {
        if (item && typeof item === 'object') {
          Object.keys(item).forEach((key) => uniqueKeys.add(key));
        }
      });

      if (uniqueKeys.size === 0) {
        window.alert('Inventory items do not contain any fields to export.');
        return;
      }

      const preferredOrder = [
        'id',
        'sku',
        'name',
        'category',
        'type',
        'status',
        'description',
        'unit',
        'quantity',
        'allocatedQuantity',
        'availableQuantity',
        'reorderPoint',
        'unitCost',
        'totalValue',
        'location',
        'manufacturerPartNumber',
        'legacyPartNumber',
        'supplierPartNumbers',
        'createdAt',
        'updatedAt',
        'notes'
      ];

      const orderedKeys = [
        ...preferredOrder.filter((key) => uniqueKeys.has(key)),
        ...[...uniqueKeys].filter((key) => !preferredOrder.includes(key)).sort()
      ];

      const formatValueForCell = (value) => {
        if (value === null || value === undefined) {
          return '';
        }

        if (Array.isArray(value)) {
          return value
            .map((entry) => {
              if (entry === null || entry === undefined) {
                return '';
              }
              if (typeof entry === 'object') {
                try {
                  return JSON.stringify(entry);
                } catch (err) {
                  console.warn('Failed to stringify array entry for export:', err);
                  return '[Object]';
                }
              }
              return entry;
            })
            .join(' | ');
        }

        if (typeof value === 'object') {
          try {
            return JSON.stringify(value);
          } catch (err) {
            console.warn('Failed to stringify value for export:', err, value);
            return '[Object]';
          }
        }

        return value;
      };

      const sanitizeForCell = (value) =>
        String(formatValueForCell(value))
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\r?\n/g, '&#10;');

      let excelContent = '<html xmlns:x="urn:schemas-microsoft-com:office:excel">';
      excelContent += '<head><meta charset="UTF-8"><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
      excelContent += '<x:Name>Inventory Export</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>';
      excelContent += '</x:ExcelWorksheets></x:ExcelWorkbook></xml></head><body>';
      excelContent += '<table border="1"><thead><tr>';

      orderedKeys.forEach((key) => {
        excelContent += `<th>${sanitizeForCell(key)}</th>`;
      });

      excelContent += '</tr></thead><tbody>';

      inventory.forEach((item) => {
        excelContent += '<tr>';
        orderedKeys.forEach((key) => {
          const cellValue = key in item ? item[key] : '';
          excelContent += `<td>${sanitizeForCell(cellValue)}</td>`;
        });
        excelContent += '</tr>';
      });

      excelContent += '</tbody></table></body></html>';

      const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const today = new Date().toISOString().split('T')[0];
      link.download = `manufacturing_inventory_${today}.xls`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export manufacturing inventory:', error);
      window.alert('Failed to export inventory. Please try again or check the console for details.');
    } finally {
      setIsExportingInventory(false);
    }
  }, [inventory]);

  // Download Excel template for bulk upload with dropdowns
  const handleDownloadTemplate = useCallback(async () => {
    // Helper function to get XLSX library (waits if needed)
    const getXLSX = () => {
      // Try multiple possible locations and structures
      // The CDN might expose it differently
      if (typeof XLSX !== 'undefined' && XLSX.utils) {
        return XLSX;
      }
      if (typeof window !== 'undefined' && window.XLSX && window.XLSX.utils) {
        return window.XLSX;
      }
      // Sometimes it's nested differently
      if (typeof window !== 'undefined' && window.XLSX) {
        const xlsx = window.XLSX;
        if (xlsx.utils || (xlsx.default && xlsx.default.utils)) {
          return xlsx.default || xlsx;
        }
      }
      return null;
    };

    // Try to get XLSX, wait a bit if not immediately available (defer loading)
    let XLSXLib = getXLSX();
    if (!XLSXLib) {
      // Wait up to 2 seconds for XLSX to load (it's loaded with defer)
      for (let i = 0; i < 20; i++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        XLSXLib = getXLSX();
        if (XLSXLib && XLSXLib.utils) break;
      }
    }

    // If still not available or doesn't have utils, fallback to CSV
    if (!XLSXLib || !XLSXLib.utils) {
      console.warn('XLSX library not available, falling back to CSV');
      const templateContent = `SKU,Name,Category,Type,Quantity,Unit,Unit Cost,Total Value,Reorder Point,Reorder Qty,Location,Supplier,Thumbnail,Legacy Part Number,Manufacturing Part Number,Supplier Part Numbers,Location Code
SKU0001,Example Component 1,components,component,100,pcs,5.50,550.00,20,30,Main Warehouse,Supplier ABC,,OLD-PART-001,MFG-PART-001,"[{""supplier"":""Supplier ABC"",""partNumber"":""SUP-001""},{""supplier"":""Supplier ABC"",""partNumber"":""SUP-002""}]",LOC001
SKU0002,Example Component 2,accessories,raw_material,50,pcs,2.25,112.50,10,15,Main Warehouse,Supplier XYZ,,OLD-PART-002,MFG-PART-002,"[{""supplier"":""Supplier XYZ"",""partNumber"":""SUP-003""}]",LOC001
SKU0003,Finished Product 1,finished_goods,final_product,25,pcs,150.00,3750.00,5,10,Main Warehouse,Internal,,OLD-PART-003,MFG-PART-003,"[]",LOC001`;

      const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory-bulk-upload-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    try {
      // Verify XLSX library structure
      if (!XLSXLib || !XLSXLib.utils || typeof XLSXLib.utils.book_new !== 'function') {
        console.error('XLSX library structure invalid:', {
          hasXLSXLib: !!XLSXLib,
          hasUtils: !!(XLSXLib && XLSXLib.utils),
          hasBookNew: !!(XLSXLib && XLSXLib.utils && XLSXLib.utils.book_new),
          XLSXLibType: typeof XLSXLib,
          utilsType: XLSXLib ? typeof XLSXLib.utils : 'N/A'
        });
        throw new Error('XLSX library not properly loaded');
      }

      // Create workbook
      const wb = XLSXLib.utils.book_new();

      // Valid values for dropdowns
      const typeValues = ['component', 'raw_material', 'work_in_progress', 'finished_good', 'final_product'];
      const unitValues = ['pcs', 'kg', 'g', 'm', 'cm', 'mm', 'L', 'mL', 'box', 'pack', 'roll', 'sheet', 'set', 'pair', 'dozen'];
      const categoryValues = ['components', 'accessories', 'finished_goods', 'raw_materials', 'packaging', 'work_in_progress'];

      // Create validation lists sheet
      const validationData = [
        ['Type Options'],
        ...typeValues.map(v => [v]),
        [''],
        ['Unit Options'],
        ...unitValues.map(v => [v]),
        [''],
        ['Category Options'],
        ...categoryValues.map(v => [v])
      ];
      const wsValidation = XLSXLib.utils.aoa_to_sheet(validationData);
      XLSXLib.utils.book_append_sheet(wb, wsValidation, 'Validation Lists');

      // Create main data sheet
      const headers = [
        'SKU', 'Name', 'Category', 'Type', 'Quantity', 'Unit', 'Unit Cost', 
        'Total Value', 'Reorder Point', 'Reorder Qty', 'Location', 'Supplier', 
        'Thumbnail', 'Legacy Part Number', 'Manufacturing Part Number', 
        'Supplier Part Numbers', 'Location Code'
      ];

      const exampleRows = [
        ['SKU0001', 'Example Component 1', 'components', 'component', 100, 'pcs', 5.50, 550.00, 20, 30, 'Main Warehouse', 'Supplier ABC', '', 'OLD-PART-001', 'MFG-PART-001', '[{"supplier":"Supplier ABC","partNumber":"SUP-001"},{"supplier":"Supplier ABC","partNumber":"SUP-002"}]', 'LOC001'],
        ['SKU0002', 'Example Component 2', 'accessories', 'raw_material', 50, 'pcs', 2.25, 112.50, 10, 15, 'Main Warehouse', 'Supplier XYZ', '', 'OLD-PART-002', 'MFG-PART-002', '[{"supplier":"Supplier XYZ","partNumber":"SUP-003"}]', 'LOC001'],
        ['SKU0003', 'Finished Product 1', 'finished_goods', 'final_product', 25, 'pcs', 150.00, 3750.00, 5, 10, 'Main Warehouse', 'Internal', '', 'OLD-PART-003', 'MFG-PART-003', '[]', 'LOC001']
      ];

      const data = [headers, ...exampleRows];
      const ws = XLSXLib.utils.aoa_to_sheet(data);

      // Set column widths
      const colWidths = [
        { wch: 12 }, // SKU
        { wch: 30 }, // Name
        { wch: 15 }, // Category
        { wch: 18 }, // Type
        { wch: 10 }, // Quantity
        { wch: 8 },  // Unit
        { wch: 12 }, // Unit Cost
        { wch: 12 }, // Total Value
        { wch: 12 }, // Reorder Point
        { wch: 12 }, // Reorder Qty
        { wch: 20 }, // Location
        { wch: 20 }, // Supplier
        { wch: 15 }, // Thumbnail
        { wch: 20 }, // Legacy Part Number
        { wch: 25 }, // Manufacturing Part Number
        { wch: 40 }, // Supplier Part Numbers
        { wch: 12 }  // Location Code
      ];
      ws['!cols'] = colWidths;

      // Add instructions at the end (after data)
      const instructionRows = [
        [''],
        ['=== INSTRUCTIONS ===', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['1. Delete example rows (rows 2-4) before adding your data', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['2. To set up DROPDOWNS for Type and Unit columns:', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['   - Select Type column (column D), go to Data > Data Validation', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['   - Allow: List, Source: =Validation Lists!$A$2:$A$6', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['   - Repeat for Unit column (F): =Validation Lists!$C$2:$C$16', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['3. Valid values are in the "Validation Lists" sheet', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['4. SKU is optional - will auto-generate if empty', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['5. Supplier Part Numbers: [{"supplier":"Name","partNumber":"PART123"}]', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']
      ];
      XLSXLib.utils.sheet_add_aoa(ws, instructionRows, { origin: -1 });

      XLSXLib.utils.book_append_sheet(wb, ws, 'Inventory Template');

      // Write file
      XLSXLib.writeFile(wb, 'inventory-bulk-upload-template.xlsx');
    } catch (error) {
      console.error('Error creating Excel file:', error);
      // Fallback to CSV
      const templateContent = `SKU,Name,Category,Type,Quantity,Unit,Unit Cost,Total Value,Reorder Point,Reorder Qty,Location,Supplier,Thumbnail,Legacy Part Number,Manufacturing Part Number,Supplier Part Numbers,Location Code
SKU0001,Example Component 1,components,component,100,pcs,5.50,550.00,20,30,Main Warehouse,Supplier ABC,,OLD-PART-001,MFG-PART-001,"[{""supplier"":""Supplier ABC"",""partNumber"":""SUP-001""},{""supplier"":""Supplier ABC"",""partNumber"":""SUP-002""}]",LOC001`;

      const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'inventory-bulk-upload-template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, []);

  // Parse CSV content to JSON format
  const parseCSV = useCallback((csvContent) => {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines

      // Simple CSV parsing (handles quoted fields)
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        
        if (char === '"') {
          if (inQuotes && line[j + 1] === '"') {
            // Escaped quote
            current += '"';
            j++;
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim()); // Add last value

      if (values.length !== headers.length) {
        console.warn(`⚠️  Row ${i + 1} has ${values.length} columns, expected ${headers.length}. Skipping.`);
        continue;
      }

      const row = {};
      // Find supplier index for use when processing Supplier Part Numbers
      const supplierIndex = headers.findIndex(h => h === 'Supplier');
      const supplierValue = supplierIndex >= 0 ? (values[supplierIndex] || '').trim() : '';
      
      headers.forEach((header, index) => {
        let value = values[index] || '';
        
        // Parse JSON arrays for Supplier Part Numbers
        // Supports two formats:
        // 1. Array of objects: [{"supplier": "Supplier Name", "partNumber": "PART123"}, ...]
        // 2. Array of strings (legacy): ["PART1", "PART2"] - converts to objects using Supplier field
        if (header === 'Supplier Part Numbers' && value) {
          try {
            // Remove extra quotes if present
            value = value.replace(/^["']|["']$/g, '');
            // Try to parse as JSON
            if (value.startsWith('[') && value.endsWith(']')) {
              const parsed = JSON.parse(value);
              // Check if it's an array of objects (new format)
              if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0].supplier !== undefined) {
                // Already in correct format: [{supplier: "...", partNumber: "..."}]
                value = parsed;
              } else if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
                // Legacy format: ["PART1", "PART2"] - convert to objects
                // Use the Supplier field from CSV if available, otherwise empty
                value = parsed.map(partNum => ({ supplier: supplierValue, partNumber: partNum }));
              } else {
                value = [];
              }
            } else if (value) {
              // Single string value - convert to object format
              value = [{ supplier: supplierValue, partNumber: value }];
            } else {
              value = [];
            }
          } catch (e) {
            // If parsing fails, treat as single value or empty
            if (value) {
              value = [{ supplier: supplierValue, partNumber: value }];
            } else {
              value = [];
            }
          }
        }
        
        // Convert numeric fields
        if (['Quantity', 'Unit Cost', 'Total Value', 'Reorder Point', 'Reorder Qty'].includes(header)) {
          value = value ? parseFloat(value) : (header === 'Quantity' ? 0 : 0);
        }
        
        // Map CSV headers to API field names
        const fieldMap = {
          'SKU': 'sku',
          'Name': 'name',
          'Category': 'category',
          'Type': 'type',
          'Quantity': 'quantity',
          'Unit': 'unit',
          'Unit Cost': 'unitCost',
          'Total Value': 'totalValue',
          'Reorder Point': 'reorderPoint',
          'Reorder Qty': 'reorderQty',
          'Location': 'location',
          'Supplier': 'supplier',
          'Thumbnail': 'thumbnail',
          'Legacy Part Number': 'legacyPartNumber',
          'Manufacturing Part Number': 'manufacturingPartNumber',
          'Supplier Part Numbers': 'supplierPartNumbers',
          'Location Code': 'locationCode'
        };

        const apiField = fieldMap[header] || header.toLowerCase().replace(/\s+/g, '');
        
        // Only include non-empty values (except for numeric fields which should be 0 if empty)
        if (value !== '' && value !== null && value !== undefined) {
          row[apiField] = value;
        }
      });

      // Only add row if it has at least a name
      if (row.name) {
        rows.push(row);
      } else {
        console.warn(`⚠️  Row ${i + 1} skipped: missing required 'name' field`);
      }
    }

    return rows;
  }, []);

  // Handle bulk upload from CSV or Excel file
  const handleBulkUpload = useCallback(async (file, originalFileName) => {
    if (!file) return;

    setIsBulkUploading(true);
    setBulkUploadProgress({ current: 0, total: 0 });

    try {
      // Read file content
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      // Parse CSV
      const items = parseCSV(text);
      
      if (items.length === 0) {
        window.alert('No valid items found in CSV file. Please check the format.');
        setIsBulkUploading(false);
        return;
      }

      // Convert supplierPartNumbers arrays to JSON strings (API expects string format)
      const processedItems = items.map(item => {
        if (item.supplierPartNumbers && Array.isArray(item.supplierPartNumbers)) {
          return {
            ...item,
            supplierPartNumbers: JSON.stringify(item.supplierPartNumbers)
          };
        }
        return item;
      });

      setBulkUploadProgress({ current: 0, total: processedItems.length });

      // Upload via API
      if (!window.DatabaseAPI || !window.DatabaseAPI.makeRequest) {
        throw new Error('DatabaseAPI not available');
      }

      const response = await window.DatabaseAPI.makeRequest('/manufacturing/inventory', {
        method: 'POST',
        body: JSON.stringify({ items: processedItems })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(errorData.message || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      const created = result.data?.created || result.created || 0;
      const errors = result.data?.errors || result.errors || 0;

      // Refresh inventory
      if (window.DatabaseAPI && typeof window.DatabaseAPI.getInventory === 'function') {
        try {
          const invResponse = await window.DatabaseAPI.getInventory(selectedLocationId !== 'all' ? selectedLocationId : null);
          if (invResponse?.data?.items) {
            setInventory(invResponse.data.items);
            localStorage.setItem('manufacturing_inventory', JSON.stringify(invResponse.data.items));
          }
        } catch (refreshError) {
          console.warn('Failed to refresh inventory after upload:', refreshError);
        }
      }

      // Show success message
      const message = `✅ Bulk upload complete!\n\n` +
        `Created: ${created} items\n` +
        (errors > 0 ? `Errors: ${errors} items\n` : '') +
        `\nTotal processed: ${items.length} items`;
      
      window.alert(message);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('❌ Bulk upload error:', error);
      window.alert(`Failed to upload inventory: ${error.message}\n\nPlease check:\n- CSV format is correct\n- All required fields (Name) are filled\n- File is saved as CSV format`);
    } finally {
      setIsBulkUploading(false);
      setBulkUploadProgress({ current: 0, total: 0 });
    }
  }, [parseCSV, selectedLocationId]);

  // Handle file input change
  const handleFileInputChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

    if (!isCSV && !isExcel) {
      window.alert('Please select a CSV or Excel file (.csv, .xlsx, .xls).');
      return;
    }

    if (isExcel) {
      // Handle Excel file
      const XLSXLib = window.XLSX || XLSX;
      if (!XLSXLib) {
        window.alert('Excel file support requires xlsx library. Please use CSV format.');
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSXLib.read(arrayBuffer, { type: 'array' });
        
        // Get first sheet (or sheet named 'Inventory Template')
        const sheetName = workbook.SheetNames.find(name => 
          name.toLowerCase().includes('inventory') || name.toLowerCase().includes('template')
        ) || workbook.SheetNames[0];
        
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to CSV format for parsing
        const csvData = XLSXLib.utils.sheet_to_csv(worksheet);
        handleBulkUpload(new Blob([csvData], { type: 'text/csv' }), file.name);
      } catch (error) {
        console.error('Error reading Excel file:', error);
        window.alert('Failed to read Excel file. Please check the file format or try using CSV format.');
      }
    } else {
      // Handle CSV file
      handleBulkUpload(file);
    }
  }, [handleBulkUpload]);

  // Trigger file input click
  const handleBulkUploadClick = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const getInitialInventory = () => [];

  const getInitialBoms = () => [];

  const getInitialOrders = () => [];

  const getInitialMovements = () => [];

  const getInitialSuppliers = () => [];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2
    }).format(amount).replace('ZAR', 'R').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ');
  };

  const getStatusColor = (status) => {
    const colors = {
      in_stock: 'text-green-600 bg-green-50',
      low_stock: 'text-yellow-600 bg-yellow-50',
      out_of_stock: 'text-red-600 bg-red-50',
      requested: 'text-orange-600 bg-orange-50',
      in_production: 'text-blue-600 bg-blue-50',
      in_progress: 'text-blue-600 bg-blue-50', // Keep for backwards compatibility
      completed: 'text-green-600 bg-green-50',
      cancelled: 'text-red-600 bg-red-50',
      active: 'text-green-600 bg-green-50',
      inactive: 'text-gray-600 bg-gray-50',
      draft: 'text-gray-600 bg-gray-50',
      consumption: 'text-red-600 bg-red-50',
      receipt: 'text-green-600 bg-green-50',
      production: 'text-blue-600 bg-blue-50',
      transfer: 'text-purple-600 bg-purple-50',
      adjustment: 'text-orange-600 bg-orange-50'
    };
    return colors[status] || 'text-gray-600 bg-gray-50';
  };

  const getInventoryStats = () => {
    const totalValue = inventory.reduce((sum, item) => sum + item.totalValue, 0);
    // Use available quantity (quantity - allocatedQuantity) for low stock calculation
    const lowStockItems = inventory.filter(item => {
      const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);
      return availableQty <= item.reorderPoint;
    }).length;
    const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const categories = [...new Set(inventory.map(item => item.category))].length;
    
    return { totalValue, lowStockItems, totalItems, categories };
  };


  const getProductionStats = () => {
    const requestedOrders = productionOrders.filter(o => o.status === 'requested').length;
    const activeOrders = productionOrders.filter(o => o.status === 'in_production' || o.status === 'in_progress').length;
    const completedOrders = productionOrders.filter(o => o.status === 'completed').length;
    const totalProduction = productionOrders.reduce((sum, o) => sum + o.quantityProduced, 0);
    const pendingUnits = productionOrders.filter(o => o.status === 'in_production' || o.status === 'in_progress').reduce((sum, o) => sum + (o.quantity - o.quantityProduced), 0);
    
    return { activeOrders, completedOrders, totalProduction, pendingUnits };
  };

  const DashboardView = () => {
    const invStats = getInventoryStats();
    const prodStats = getProductionStats();

    return (
      <div className="space-y-3">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Inventory Value</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{formatCurrency(invStats.totalValue)}</p>
                <p className="text-xs text-gray-500 mt-1">{invStats.totalItems.toLocaleString()} items</p>
              </div>
              <div className="bg-blue-50 p-2 rounded-lg">
                <i className="fas fa-boxes text-blue-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Low Stock Alerts</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{invStats.lowStockItems}</p>
                <p className="text-xs text-gray-500 mt-1">Items need reorder</p>
              </div>
              <div className="bg-yellow-50 p-2 rounded-lg">
                <i className="fas fa-exclamation-triangle text-yellow-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Active Production Orders</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{prodStats.activeOrders}</p>
                <p className="text-xs text-gray-500 mt-1">{prodStats.pendingUnits} units pending</p>
              </div>
              <div className="bg-green-50 p-2 rounded-lg">
                <i className="fas fa-industry text-green-600"></i>
              </div>
            </div>
          </div>

          <div className="bg-white p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Total Production (Month)</p>
                <p className="text-lg font-semibold text-gray-900 mt-1">{prodStats.totalProduction}</p>
                <p className="text-xs text-gray-500 mt-1">{prodStats.completedOrders} orders completed</p>
              </div>
              <div className="bg-purple-50 p-2 rounded-lg">
                <i className="fas fa-chart-line text-purple-600"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Low Stock Alerts */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-yellow-600"></i>
                Low Stock Alerts
              </h3>
            </div>
            <div className="p-3">
              <div className="space-y-2">
                {inventory.filter(item => {
                  const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);
                  return availableQty <= item.reorderPoint;
                }).slice(0, 5).map(item => {
                  const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);
                  return (
                    <div key={item.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-200">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.sku} • {item.location}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-yellow-700">{availableQty} / {item.quantity} {item.unit}</p>
                        <p className="text-xs text-gray-500">Reorder: {item.reorderPoint}</p>
                        {(item.allocatedQuantity || 0) > 0 && (
                          <p className="text-xs text-orange-600">Allocated: {item.allocatedQuantity}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Production Orders */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <i className="fas fa-industry text-blue-600"></i>
                Active Production Orders
              </h3>
            </div>
            <div className="p-3">
              <div className="space-y-2">
                {productionOrders.filter(o => o.status === 'in_production' || o.status === 'in_progress').map(order => (
                  <div key={order.id} className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{order.productName}</p>
                      <p className="text-xs text-gray-500">{order.id} • {order.assignedTo}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-700">{order.quantityProduced}/{order.quantity}</p>
                      <p className="text-xs text-gray-500">Target: {order.targetDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Stock Movements */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <i className="fas fa-exchange-alt text-purple-600"></i>
              Recent Stock Movements
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From → To</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movements.slice(0, 10).map(movement => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm text-gray-900">{movement.date}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(movement.type)}`}>
                        {movement.type}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{movement.itemName}</div>
                      <div className="text-xs text-gray-500">{movement.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-sm font-semibold text-gray-900">{movement.quantity > 0 ? '+' : ''}{movement.quantity}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{movement.fromLocation} → {movement.toLocation || 'N/A'}</td>
                    <td className="px-3 py-2 text-sm text-gray-600">{movement.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Reload inventory when location changes - BUT NOT if user is actively typing
  useEffect(() => {
    // CRITICAL: Skip reload if user is actively typing in an input field
    if (isUserTypingRef.current) {
      return;
    }
    
    if (activeTab === 'inventory' && window.DatabaseAPI?.getInventory) {
      const loadInventoryForLocation = async () => {
        try {
          // Save the currently focused element before state update
          const focusedElement = document.activeElement;
          const wasInputFocused = focusedElement && (focusedElement.tagName === 'INPUT' || focusedElement.tagName === 'TEXTAREA');
          const inputValue = wasInputFocused ? focusedElement.value : null;
          const inputKey = wasInputFocused ? focusedElement.getAttribute('key') : null;
          const inputPlaceholder = wasInputFocused ? focusedElement.placeholder : null;
          
          const locationIdToLoad = selectedLocationId && selectedLocationId !== 'all' ? selectedLocationId : null;
          const invResponse = await window.DatabaseAPI.getInventory(locationIdToLoad);
          const invData = invResponse?.data?.inventory || [];
          const processed = invData.map(item => ({ ...item, id: item.id }));
          
          setInventory(processed);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(processed));
          
          // Restore focus after state update if user was typing
          if (wasInputFocused) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                let inputToFocus = null;
                if (inputKey) {
                  inputToFocus = document.querySelector(`input[key="${inputKey}"]`);
                }
                if (!inputToFocus && inputPlaceholder) {
                  // Try to find by placeholder
                  const inputs = document.querySelectorAll('input[type="text"]');
                  inputs.forEach(input => {
                    if (input.placeholder === inputPlaceholder) {
                      inputToFocus = input;
                    }
                  });
                }
                if (inputToFocus) {
                  inputToFocus.focus();
                  // Restore cursor position
                  if (inputValue !== null) {
                    const cursorPos = Math.min(inputValue.length, inputToFocus.value.length);
                    inputToFocus.setSelectionRange(cursorPos, cursorPos);
                  }
                }
              });
            });
          }
        } catch (error) {
          console.error('Error loading inventory for location:', error);
        }
      };
      loadInventoryForLocation();
    }
  }, [selectedLocationId, activeTab]);

  // Reload stock locations when switching to inventory tab
  useEffect(() => {
    if (activeTab === 'inventory' && window.DatabaseAPI?.getStockLocations) {
      const loadLocations = async () => {
        try {
          const locResponse = await window.DatabaseAPI.getStockLocations();
          const locData = locResponse?.data?.locations || [];
          setStockLocations(locData);
          localStorage.setItem('stock_locations', JSON.stringify(locData));
        } catch (error) {
          console.error('Error loading stock locations:', error);
        }
      };
      loadLocations();
    }
  }, [activeTab]);

  // Listen for location updates from StockLocations component
  useEffect(() => {
    const handleLocationUpdate = (event) => {
      const updatedLocations = event.detail?.locations || [];
      if (updatedLocations.length > 0) {
        setStockLocations(updatedLocations);
        localStorage.setItem('stock_locations', JSON.stringify(updatedLocations));
      }
    };

    window.addEventListener('stockLocationsUpdated', handleLocationUpdate);
    return () => {
      window.removeEventListener('stockLocationsUpdated', handleLocationUpdate);
    };
  }, []);

  // Handle column sorting - memoized to prevent recreation
  const handleSort = useCallback((key, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        // Toggle direction if same column
        const newDirection = prevConfig.direction === 'asc' ? 'desc' : 'asc';
        return { key, direction: newDirection };
      } else {
        // New column, default to ascending
        return { key, direction: 'asc' };
      }
    });
  }, []);

  // Handle column filter change - memoized to prevent recreation
  const handleColumnFilterChange = useCallback((column, value, event) => {
    // Mark that user is typing
    isUserTypingRef.current = true;
    if (event && event.target) {
      activeInputRef.current = event.target;
      filterInputRefs.current[column] = event.target;
    }
    
    // Update ref immediately for filtering
    columnFiltersRef.current = {
      ...columnFiltersRef.current,
      [column]: value || undefined
    };
    // Remove undefined values
    Object.keys(columnFiltersRef.current).forEach(k => {
      if (columnFiltersRef.current[k] === undefined) {
        delete columnFiltersRef.current[k];
      }
    });
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    // Update state after user stops typing (debounced)
    typingTimeoutRef.current = setTimeout(() => {
      setColumnFilters(prev => {
        const newFilters = {
          ...prev,
          [column]: value || undefined
        };
        // Remove undefined values
        Object.keys(newFilters).forEach(k => {
          if (newFilters[k] === undefined) {
            delete newFilters[k];
          }
        });
        return newFilters;
      });
      isUserTypingRef.current = false;
      activeInputRef.current = null;
    }, 300);
  }, []);

  const openAddItemModal = useCallback(() => {
    // Set locationId based on selected location (or main warehouse as default)
    const locationId = selectedLocationId && selectedLocationId !== 'all' 
      ? selectedLocationId 
      : (stockLocations.find(loc => loc.code === 'LOC001')?.id || null);
    setFormData({
      sku: '', // Will be auto-generated by backend
      name: '',
      thumbnail: '',
      category: '',
      type: 'component',
      quantity: undefined,
      inProductionQuantity: undefined,
      completedQuantity: undefined,
      unit: 'pcs',
      reorderPoint: undefined,
      reorderQty: undefined,
      unitCost: undefined,
      supplier: '',
      status: 'in_stock' // Will be auto-calculated by backend
    });
    setModalType('add_item');
    setShowModal(true);
  }, [selectedLocationId, stockLocations]);

  const renderInventoryView = () => {
    // Get unique categories from inventory items
    const uniqueCategories = [...new Set(inventory.map(item => item.category).filter(Boolean))].sort();
    
    // Get main warehouse for default selection
    const mainWarehouse = stockLocations.find(loc => loc.code === 'LOC001');
    
    // Filter logic with column-specific filters
    let filteredInventory = inventory.filter(item => {
      const name = (item.name || '').toString().toLowerCase();
      const sku = (item.sku || '').toString().toLowerCase();
      const category = (item.category || '').toString();
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || sku.includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || category === filterCategory;
      
      // Column-specific filters
      const matchesSKU = !columnFilters.sku || (item.sku || '').toString().toLowerCase().includes(columnFilters.sku.toLowerCase());
      const matchesName = !columnFilters.name || name.includes(columnFilters.name.toLowerCase());
      const matchesSupplierPart = !columnFilters.supplierPart || (() => {
        try {
          const supplierParts = typeof item.supplierPartNumbers === 'string' 
            ? JSON.parse(item.supplierPartNumbers || '[]') 
            : (item.supplierPartNumbers || []);
          return supplierParts.some(sp => 
            (sp.supplier || '').toLowerCase().includes(columnFilters.supplierPart.toLowerCase()) ||
            (sp.partNumber || '').toLowerCase().includes(columnFilters.supplierPart.toLowerCase())
          );
        } catch {
          return false;
        }
      })();
      const matchesLegacyPart = !columnFilters.legacyPart || ((item.legacyPartNumber || '').toString().toLowerCase().includes(columnFilters.legacyPart.toLowerCase()));
      const matchesManufacturingPart = !columnFilters.manufacturingPart || ((item.manufacturingPartNumber || '').toString().toLowerCase().includes(columnFilters.manufacturingPart.toLowerCase()));
      const matchesCategoryFilter = !columnFilters.category || category.toLowerCase().includes(columnFilters.category.toLowerCase());
      const matchesType = !columnFilters.type || (item.type || '').toString().toLowerCase().includes(columnFilters.type.toLowerCase());
      const matchesStatus = !columnFilters.status || (item.status || '').toString().toLowerCase().includes(columnFilters.status.toLowerCase());
      const matchesLocation = !columnFilters.location || ((item.location || '').toString().toLowerCase().includes(columnFilters.location.toLowerCase()));
      
      return matchesSearch && matchesCategory && matchesSKU && matchesName && matchesSupplierPart && 
             matchesLegacyPart && matchesManufacturingPart && matchesCategoryFilter && matchesType && matchesStatus && matchesLocation;
    });

    // Sorting logic
    if (sortConfig.key) {
      filteredInventory = [...filteredInventory].sort((a, b) => {
        let aVal, bVal;
        
        switch (sortConfig.key) {
          case 'sku':
            aVal = (a.sku || '').toString().toLowerCase();
            bVal = (b.sku || '').toString().toLowerCase();
            break;
          case 'name':
            aVal = (a.name || '').toString().toLowerCase();
            bVal = (b.name || '').toString().toLowerCase();
            break;
          case 'category':
            aVal = (a.category || '').toString().toLowerCase();
            bVal = (b.category || '').toString().toLowerCase();
            break;
          case 'type':
            aVal = (a.type || '').toString().toLowerCase();
            bVal = (b.type || '').toString().toLowerCase();
            break;
          case 'quantity':
            aVal = parseFloat(a.quantity || 0);
            bVal = parseFloat(b.quantity || 0);
            break;
          case 'allocated':
            aVal = parseFloat(a.allocatedQuantity || 0);
            bVal = parseFloat(b.allocatedQuantity || 0);
            break;
          case 'available':
            aVal = parseFloat((a.quantity || 0) - (a.allocatedQuantity || 0));
            bVal = parseFloat((b.quantity || 0) - (b.allocatedQuantity || 0));
            break;
          case 'unitCost':
            aVal = parseFloat(a.unitCost || 0);
            bVal = parseFloat(b.unitCost || 0);
            break;
          case 'totalValue':
            aVal = parseFloat(a.totalValue || 0);
            bVal = parseFloat(b.totalValue || 0);
            break;
          case 'status':
            aVal = (a.status || '').toString().toLowerCase();
            bVal = (b.status || '').toString().toLowerCase();
            break;
          case 'location':
            aVal = (a.location || '').toString().toLowerCase();
            bVal = (b.location || '').toString().toLowerCase();
            break;
          default:
            return 0;
        }
        
        if (typeof aVal === 'string') {
          return sortConfig.direction === 'asc' 
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        } else {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
      });
    }

    // Get sort icon for column
    const getSortIcon = (columnKey) => {
      if (sortConfig.key !== columnKey) {
        return <span className="text-gray-400 text-xs ml-1" title="Click to sort">↕</span>;
      }
      return sortConfig.direction === 'asc' 
        ? <span className="text-blue-600 text-xs font-bold ml-1" title="Sorted ascending - click to reverse">↑</span>
        : <span className="text-blue-600 text-xs font-bold ml-1" title="Sorted descending - click to reverse">↓</span>;
    };

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              {/* Location Selector */}
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white font-medium"
                title="Select Stock Location"
              >
                <option value="all">All Locations</option>
                {stockLocations.map(loc => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} - {loc.name}
                  </option>
                ))}
              </select>
              <div className="relative flex-1 max-w-md">
                <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  key="inventory-search-input"
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by name or SKU..."
                  defaultValue={searchTerm}
                  onFocus={(e) => {
                    isUserTypingRef.current = true;
                    activeInputRef.current = e.target;
                    searchInputRef.current = e.target;
                  }}
                  onBlur={(e) => {
                    // Sync value to state on blur
                    setSearchTerm(e.target.value);
                    setTimeout(() => {
                      if (document.activeElement !== activeInputRef.current) {
                        isUserTypingRef.current = false;
                        activeInputRef.current = null;
                      }
                    }, 100);
                  }}
                  onChange={(e) => {
                    // Mark that user is typing
                    isUserTypingRef.current = true;
                    activeInputRef.current = e.target;
                    
                    // Update ref immediately for filtering
                    searchTermRef.current = e.target.value;
                    
                    // Clear existing timeout
                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current);
                    }
                    
                    // Update state after user stops typing (debounced)
                    typingTimeoutRef.current = setTimeout(() => {
                      setSearchTerm(e.target.value);
                      isUserTypingRef.current = false;
                      activeInputRef.current = null;
                    }, 300);
                  }}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Categories</option>
                {uniqueCategories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 whitespace-nowrap">
                Showing {filteredInventory.length} of {inventory.length}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshAllManufacturingData}
                className={`px-3 py-2 text-sm rounded-lg border ${isRefreshing ? 'bg-gray-100 text-gray-500 border-gray-200' : 'bg-white hover:bg-gray-50 border-gray-300'} flex items-center gap-2`}
                disabled={isRefreshing}
                title="Force refresh from server"
              >
                <i className={`fas fa-rotate-right text-xs ${isRefreshing ? 'animate-spin' : ''}`}></i>
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="px-3 py-2 text-sm rounded-lg flex items-center gap-2 border bg-white hover:bg-gray-50 border-gray-300"
                title="Download Excel template with dropdowns for bulk upload"
              >
                <i className="fas fa-file-download text-xs"></i>
                Download Template
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileInputChange}
                style={{ display: 'none' }}
              />
              <button
                onClick={handleBulkUploadClick}
                disabled={isBulkUploading}
                className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 border ${isBulkUploading ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50 border-gray-300'}`}
                title="Upload CSV or Excel file to bulk import inventory items"
              >
                <i className={`${isBulkUploading ? 'fas fa-spinner animate-spin' : 'fas fa-upload'} text-xs`}></i>
                {isBulkUploading ? `Uploading... ${bulkUploadProgress.total > 0 ? `(${bulkUploadProgress.current}/${bulkUploadProgress.total})` : ''}` : 'Bulk Upload'}
              </button>
              <button
                onClick={handleExportInventory}
                disabled={isExportingInventory}
                className={`px-3 py-2 text-sm rounded-lg flex items-center gap-2 border ${isExportingInventory ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'bg-white hover:bg-gray-50 border-gray-300'}`}
                title="Export the full inventory dataset to Excel"
              >
                <i className={`${isExportingInventory ? 'fas fa-spinner animate-spin' : 'fas fa-download'} text-xs`}></i>
                {isExportingInventory ? 'Exporting...' : 'Export'}
              </button>
              <button
                onClick={openAddItemModal}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <i className="fas fa-plus text-xs"></i>
                Add Item
              </button>
            </div>
          </div>
        </div>

        {/* Diagnostics Banner */}
        <div className="px-1">
          <div className="text-[11px] text-gray-500 flex items-center gap-3">
            <span>API: {window.DatabaseAPI?.API_BASE || 'n/a'}</span>
            <span>• Inventory: {inventory.length}</span>
            <span>• BOMs: {boms.length}</span>
            <span>• Orders: {productionOrders.length}</span>
            <span>• Movements: {movements.length}</span>
            <span>• Suppliers: {suppliers.length}</span>
          </div>
        </div>

        {filteredInventory.length < inventory.length && (
          <div className="text-xs text-gray-500 px-1">
            Some items are hidden by current search or category filter.
          </div>
        )}

        {/* Mobile Card View - Shows on mobile devices */}
        <div className="table-mobile space-y-3">
          {filteredInventory.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <i className="fas fa-box-open text-4xl mb-4 text-gray-300"></i>
              <p className="text-sm">No inventory items found</p>
            </div>
          ) : (
            filteredInventory.map(item => {
              const supplierParts = (() => {
                try {
                  return (item.supplierPartNumbers !== undefined && item.supplierPartNumbers !== null)
                    ? (typeof item.supplierPartNumbers === 'string' 
                        ? JSON.parse(item.supplierPartNumbers || '[]') 
                        : (item.supplierPartNumbers || []))
                    : [];
                } catch (e) {
                  return [];
                }
              })();
              const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);
              
              return (
                <div 
                  key={item.id} 
                  className="mobile-card bg-white rounded-lg border border-gray-200 p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setViewingInventoryItemDetail(item)}
                >
                  <div className="flex items-start gap-3 mb-3">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      {item.thumbnail ? (
                        <img 
                          src={item.thumbnail} 
                          alt={item.name} 
                          className="w-16 h-16 object-cover rounded border border-gray-200" 
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className={`w-16 h-16 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 ${item.thumbnail ? 'hidden' : ''}`}>
                        <i className="fas fa-box text-2xl"></i>
                      </div>
                    </div>
                    
                    {/* Item Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-semibold text-gray-900 truncate">{item.name}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">SKU: {item.sku}</p>
                        </div>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ml-2 flex-shrink-0 ${getStatusColor(item.status || '')}`}>
                          {(item.status || '').replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <div>
                          <span className="text-gray-500">Category:</span>
                          <span className="ml-1 text-gray-900 capitalize">{item.category ? item.category.replace('_', ' ') : 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Type:</span>
                            <span className="ml-1 text-gray-900 capitalize">
                            {item.type === 'final_product'
                              ? 'Final Product'
                              : item.type === 'component'
                                ? 'Component'
                                : (item.type || '').replace('_', ' ')}
                          </span>
                        </div>
                        {item.location && (
                          <div>
                            <span className="text-gray-500">Location:</span>
                            <span className="ml-1 text-gray-900">{item.location}</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Stock Info */}
                      {item.type === 'final_product' ? (
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center">
                              <div className={`text-lg font-bold ${item.quantity < 0 ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity || 0}</div>
                              <div className="text-xs text-gray-500">Total {item.unit}</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-orange-600">{item.inProductionQuantity || 0}</div>
                              <div className="text-xs text-gray-500">In-Production</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-green-600">{item.completedQuantity || 0}</div>
                              <div className="text-xs text-gray-500">Completed</div>
                            </div>
                          </div>
                          {item.allocatedQuantity > 0 && (
                            <div className="text-center pt-2 border-t border-gray-200">
                              <div className="text-sm font-bold text-yellow-700">{item.allocatedQuantity || 0}</div>
                              <div className="text-xs text-gray-500">Allocated</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-200">
                          <div className="text-center">
                            <div className={`text-lg font-bold ${item.quantity < 0 ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity || 0}</div>
                            <div className="text-xs text-gray-500">Total {item.unit}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-lg font-bold text-yellow-700">{item.allocatedQuantity || 0}</div>
                            <div className="text-xs text-gray-500">Allocated</div>
                          </div>
                          <div className="text-center">
                            <div className={`text-lg font-bold ${availableQty < 0 ? 'text-red-600' : 'text-green-700'}`}>{availableQty}</div>
                            <div className="text-xs text-gray-500">Available</div>
                          </div>
                        </div>
                      )}
                      
                      {/* Cost Info */}
                      {(item.unitCost > 0 || item.totalValue > 0) && (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                          {item.unitCost > 0 && (
                            <div>
                              <span className="text-xs text-gray-500">Unit Cost:</span>
                              <span className="ml-1 text-sm font-semibold text-gray-900">{formatCurrency(item.unitCost)}</span>
                            </div>
                          )}
                          {item.totalValue > 0 && (
                            <div className="text-right">
                              <span className="text-xs text-gray-500">Total Value:</span>
                              <span className="ml-1 text-sm font-bold text-blue-600">{formatCurrency(item.totalValue)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Supplier Parts */}
                      {supplierParts.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="text-xs text-gray-500 mb-1">Supplier Parts:</div>
                          <div className="space-y-1">
                            {supplierParts.slice(0, 2).map((sp, idx) => (
                              <div key={idx} className="text-xs">
                                <span className="font-medium text-gray-700">{sp.supplier}:</span>
                                <span className="ml-1 text-gray-600">{sp.partNumber}</span>
                              </div>
                            ))}
                            {supplierParts.length > 2 && (
                              <div className="text-xs text-gray-500">+{supplierParts.length - 2} more</div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Manufacturing Part Number */}
                      {item.manufacturingPartNumber && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <div className="text-xs">
                            <span className="text-gray-500">Manufacturing Part Number:</span>
                            <span className="ml-1 text-gray-900 font-medium">{item.manufacturingPartNumber}</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => { setSelectedItem(item); setModalType('view_item'); setShowModal(true); }}
                          className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                        >
                          <i className="fas fa-eye mr-1"></i> View
                        </button>
                        <button
                          onClick={() => openEditItemModal(item)}
                          className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-medium"
                        >
                          <i className="fas fa-edit mr-1"></i> Edit
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View - Shows on desktop */}
        <div className="table-responsive bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                {/* Header Row */}
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('sku', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full text-left font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>SKU</span>
                      {getSortIcon('sku')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Image</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('name', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full text-left font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Item Name</span>
                      {getSortIcon('name')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Supplier Part No.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Manufacturing Part Number</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Abcotronics Part Number (Legacy)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('category', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full text-left font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Category</span>
                      {getSortIcon('category')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('type', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full text-left font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Type</span>
                      {getSortIcon('type')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('quantity', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full justify-end font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Quantity</span>
                      {getSortIcon('quantity')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('allocated', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full justify-end font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Allocated</span>
                      {getSortIcon('allocated')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('available', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full justify-end font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Available</span>
                      {getSortIcon('available')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('location', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full text-left font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Location</span>
                      {getSortIcon('location')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('unitCost', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full justify-end font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Unit Cost</span>
                      {getSortIcon('unitCost')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('totalValue', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full justify-end font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Total Value</span>
                      {getSortIcon('totalValue')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                    <button 
                      type="button"
                      onClick={(e) => handleSort('status', e)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer w-full text-left font-medium bg-transparent border-0 p-0"
                      title="Click to sort"
                    >
                      <span>Status</span>
                      {getSortIcon('status')}
                    </button>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
                {/* Filter Row */}
                <tr key="inventory-filter-row" className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2">
                    <input
                      key="filter-sku-input"
                      ref={(el) => { if (el) filterInputRefs.current.sku = el; }}
                      type="text"
                      placeholder="Filter SKU..."
                      defaultValue={columnFilters.sku || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('sku', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => {
                        // Mark that user is typing - don't update state yet
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-name-input"
                      ref={(el) => { if (el) filterInputRefs.current.name = el; }}
                      type="text"
                      placeholder="Filter Name..."
                      defaultValue={columnFilters.name || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('name', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('name', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-supplier-input"
                      ref={(el) => { if (el) filterInputRefs.current.supplierPart = el; }}
                      type="text"
                      placeholder="Filter Supplier..."
                      defaultValue={columnFilters.supplierPart || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('supplierPart', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('supplierPart', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-mfg-part-input"
                      ref={(el) => { if (el) filterInputRefs.current.manufacturingPart = el; }}
                      type="text"
                      placeholder="Filter Mfg Part..."
                      defaultValue={columnFilters.manufacturingPart || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('manufacturingPart', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('manufacturingPart', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-legacy-part-input"
                      ref={(el) => { if (el) filterInputRefs.current.legacyPart = el; }}
                      type="text"
                      placeholder="Filter Abcotronics Part..."
                      defaultValue={columnFilters.legacyPart || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('legacyPart', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('legacyPart', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-category-input"
                      ref={(el) => { if (el) filterInputRefs.current.category = el; }}
                      type="text"
                      placeholder="Filter Category..."
                      defaultValue={columnFilters.category || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('category', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('category', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-type-input"
                      ref={(el) => { if (el) filterInputRefs.current.type = el; }}
                      type="text"
                      placeholder="Filter Type..."
                      defaultValue={columnFilters.type || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('type', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('type', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-location-input"
                      ref={(el) => { if (el) filterInputRefs.current.location = el; }}
                      type="text"
                      placeholder="Filter Location..."
                      defaultValue={columnFilters.location || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('location', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('location', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2"></th>
                  <th className="px-3 py-2">
                    <input
                      key="filter-status-input"
                      ref={(el) => { if (el) filterInputRefs.current.status = el; }}
                      type="text"
                      placeholder="Filter Status..."
                      defaultValue={columnFilters.status || ''}
                      onFocus={(e) => {
                        isUserTypingRef.current = true;
                        activeInputRef.current = e.target;
                      }}
                      onBlur={(e) => {
                        handleColumnFilterChange('status', e.target.value, e);
                        setTimeout(() => {
                          if (document.activeElement !== activeInputRef.current) {
                            isUserTypingRef.current = false;
                            activeInputRef.current = null;
                          }
                        }, 100);
                      }}
                      onChange={(e) => handleColumnFilterChange('status', e.target.value, e)}
                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </th>
                  <th className="px-3 py-2">
                    {(Object.keys(columnFilters).length > 0) && (
                      <button
                        onClick={() => setColumnFilters({})}
                        className="text-xs text-red-600 hover:text-red-800"
                        title="Clear all filters"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInventory.map(item => {
                  const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);
                  return (
                    <tr 
                      key={item.id} 
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setViewingInventoryItemDetail(item)}
                    >
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.sku}</td>
                    <td className="px-3 py-2">
                      {item.thumbnail ? (
                        <>
                          <img 
                            src={item.thumbnail} 
                            alt={item.name} 
                            className="w-10 h-10 object-cover rounded" 
                            onError={(e) => {
                              console.error('Failed to load image for item:', item.name, item.thumbnail);
                              e.target.style.display = 'none';
                              e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                          <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-400 hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                              <path d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V6.75zM6 7.5a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zM3.75 16.5l4.69-4.69a1.125 1.125 0 011.59 0l3.44 3.44.53-.53a1.125 1.125 0 011.59 0l4.13 4.13H3.75z" />
                            </svg>
                          </div>
                        </>
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-400">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                            <path d="M2.25 6.75A2.25 2.25 0 014.5 4.5h15a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0119.5 19.5h-15A2.25 2.25 0 012.25 17.25V6.75zM6 7.5a1.5 1.5 0 103 0 1.5 1.5 0 00-3 0zM3.75 16.5l4.69-4.69a1.125 1.125 0 011.59 0l3.44 3.44.53-.53a1.125 1.125 0 011.59 0l4.13 4.13H3.75z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      {item.reorderPoint > 0 && (
                        <div className="text-xs text-gray-500">Reorder: {item.reorderPoint} {item.unit}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {(() => {
                        try {
                          const supplierParts = (item.supplierPartNumbers !== undefined && item.supplierPartNumbers !== null)
                            ? (typeof item.supplierPartNumbers === 'string' 
                                ? JSON.parse(item.supplierPartNumbers || '[]') 
                                : (item.supplierPartNumbers || []))
                            : [];
                          if (supplierParts.length === 0) return <span className="text-gray-400">-</span>;
                          return (
                            <div className="space-y-1">
                              {supplierParts.map((sp, idx) => (
                                <div key={idx} className="text-xs">
                                  <span className="font-medium">{sp.supplier}:</span> {sp.partNumber}
                                </div>
                              ))}
                            </div>
                          );
                        } catch (e) {
                          return <span className="text-gray-400">-</span>;
                        }
                      })()}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {(item.manufacturingPartNumber !== undefined && item.manufacturingPartNumber) 
                        ? item.manufacturingPartNumber 
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {(item.legacyPartNumber !== undefined && item.legacyPartNumber) 
                        ? item.legacyPartNumber 
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 capitalize">{item.category ? item.category.replace('_', ' ') : 'N/A'}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 capitalize">
                      {item.type === 'final_product'
                        ? 'Final Product'
                        : item.type === 'component'
                          ? 'Component'
                          : (item.type || '').replace('_', ' ')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.type === 'final_product' ? (
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-gray-900">Total: {item.quantity || 0}</div>
                          <div className="text-xs">
                            <span className="text-orange-600">In-Prod: {(item.inProductionQuantity || 0)}</span>
                            {' • '}
                            <span className="text-green-600">Completed: {(item.completedQuantity || 0)}</span>
                          </div>
                          <div className="text-xs text-gray-500">{item.unit}</div>
                        </div>
                      ) : (
                        <>
                          <div className={`text-sm font-semibold ${item.quantity < 0 ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity || 0}</div>
                          <div className="text-xs text-gray-500">{item.unit}</div>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="text-sm font-medium text-yellow-700">{(item.allocatedQuantity || 0)}</div>
                      <div className="text-xs text-gray-500">{item.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className={`text-sm font-semibold ${availableQty < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {availableQty}
                      </div>
                      <div className="text-xs text-gray-500">{item.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">
                      {item.location ? item.location : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-right text-gray-900">
                      {item.unitCost > 0 ? formatCurrency(item.unitCost) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">
                      {item.totalValue > 0 ? formatCurrency(item.totalValue) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(item.status || '')}`}>
                          {(item.status || '').replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setSelectedItem(item); setModalType('view_item'); setShowModal(true); }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          title="View Details"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                        <button
                          onClick={() => openEditItemModal(item)}
                          className="text-green-600 hover:text-green-800 text-sm font-medium"
                          title="Edit Item"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                          title="Delete Item"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const BOMView = () => {
    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Bill of Materials (BOM)</h3>
            <button
              onClick={openAddBomModal}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="fas fa-plus text-xs"></i>
              Create BOM
            </button>
          </div>
        </div>

        {/* BOM Cards */}
        <div className="grid grid-cols-1 gap-3">
          {boms.map(bom => (
            <div key={bom.id} className="bg-white rounded-lg border border-gray-200">
              <div className="p-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-gray-900">{bom.productName}</h3>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(bom.status)}`}>
                        {bom.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-xs text-gray-500">BOM: {bom.id}</p>
                      <p className="text-xs text-gray-500">SKU: {bom.productSku}</p>
                      <p className="text-xs text-gray-500">Version: {bom.version}</p>
                      <p className="text-xs text-gray-500">Effective: {bom.effectiveDate}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedItem(bom); setModalType('view_bom'); setShowModal(true); }}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium px-2 py-1"
                      title="View Details"
                    >
                      <i className="fas fa-eye"></i>
                    </button>
                    <button
                      onClick={() => openEditBomModal(bom)}
                      className="text-green-600 hover:text-green-800 text-sm font-medium px-2 py-1"
                      title="Edit BOM"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      onClick={() => handleDeleteBom(bom.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium px-2 py-1"
                      title="Delete BOM"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div className="p-3">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Component</th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Qty</th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                        <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {bom.components.map((comp, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1">
                            <div className="text-sm text-gray-900">{comp.name}</div>
                            <div className="text-xs text-gray-500">{comp.sku}</div>
                          </td>
                          <td className="px-2 py-1 text-sm text-right text-gray-900">{comp.quantity} {comp.unit}</td>
                          <td className="px-2 py-1 text-sm text-right text-gray-900">{formatCurrency(comp.unitCost)}</td>
                          <td className="px-2 py-1 text-sm font-semibold text-right text-gray-900">{formatCurrency(comp.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-gray-500">Material Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(bom.totalMaterialCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Labor Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(bom.laborCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Overhead Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(bom.overheadCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Cost per Unit</p>
                      <p className="text-sm font-semibold text-blue-600">{formatCurrency(bom.totalCost)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const ProductionView = () => {
    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Production Orders</h3>
            <button
              onClick={() => { 
                const nextWO = getNextWorkOrderNumber();
                const mainWarehouse = stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN');
                setFormData({ 
                  workOrderNumber: nextWO,
                  startDate: null,
                  priority: 'normal',
                  status: 'requested',
                  stockLocationId: mainWarehouse?.id || null
                });
                setModalType('add_production'); 
                setShowModal(true); 
              }}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="fas fa-plus text-xs"></i>
              New Production Order
            </button>
          </div>
        </div>

        {/* Mobile Card View - Shows on mobile devices */}
        <div className="table-mobile space-y-3">
          {productionOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <i className="fas fa-industry text-4xl mb-4 text-gray-300"></i>
              <p className="text-sm font-medium text-gray-700 mb-2">No production orders found</p>
              <p className="text-xs text-gray-500 mb-4">Create your first production order to get started</p>
              <button
                onClick={() => { 
                  const nextWO = getNextWorkOrderNumber();
                  const mainWarehouse = stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN');
                  setFormData({ 
                    workOrderNumber: nextWO,
                    startDate: null,
                    priority: 'normal',
                    status: 'requested',
                    stockLocationId: mainWarehouse?.id || null
                  });
                  setModalType('add_production'); 
                  setShowModal(true); 
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
              >
                <i className="fas fa-plus text-xs"></i>
                Create Production Order
              </button>
            </div>
          ) : (
            productionOrders.map(order => {
              const progress = (order.quantityProduced / order.quantity) * 100;
              return (
                <div key={order.id} className="mobile-card bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-base font-semibold text-gray-900">{order.productName}</h3>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize flex-shrink-0 ${getStatusColor(order.status)}`}>
                          {(order.status || '').replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">Order ID: {order.id}</p>
                      <p className="text-xs text-gray-500">SKU: {order.productSku}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-gray-200">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Progress</div>
                      <div className="text-lg font-bold text-gray-900">{order.quantityProduced}/{order.quantity}</div>
                      <div className="text-xs text-gray-500">{progress.toFixed(0)}% complete</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Priority</div>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${
                        order.priority === 'high' ? 'text-red-600 bg-red-50' : 
                        order.priority === 'normal' ? 'text-blue-600 bg-blue-50' : 
                        'text-gray-600 bg-gray-50'
                      }`}>
                        {order.priority}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 mb-3 pt-3 border-t border-gray-200 text-sm">
                    <div>
                      <span className="text-gray-500">Start Date:</span>
                      <span className="ml-2 text-gray-900">{order.startDate}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Target Date:</span>
                      <span className="ml-2 text-gray-900">{order.targetDate}</span>
                    </div>
                    {order.completedDate && (
                      <div>
                        <span className="text-gray-500">Completed:</span>
                        <span className="ml-2 text-green-600">{order.completedDate}</span>
                      </div>
                    )}
                    {order.totalCost > 0 && (
                      <div>
                        <span className="text-gray-500">Total Cost:</span>
                        <span className="ml-2 text-sm font-bold text-blue-600">{formatCurrency(order.totalCost)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => { setSelectedItem(order); setModalType('view_production'); setShowModal(true); }}
                      className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                    >
                      <i className="fas fa-eye mr-1"></i> View
                    </button>
                    <button
                      onClick={() => {
                        setSelectedItem(order);
                        const mainWarehouse = stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN');
                        setFormData({ 
                          ...order,
                          stockLocationId: order.stockLocationId || mainWarehouse?.id || null
                        });
                        setModalType('edit_production');
                        setShowModal(true);
                      }}
                      className="flex-1 px-3 py-2 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 font-medium"
                    >
                      <i className="fas fa-edit mr-1"></i> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteProductionOrder(order.id)}
                      className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View - Shows on desktop */}
        <div className="table-responsive bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Product</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Priority</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Progress</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Dates</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total Cost</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {productionOrders.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-3 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <i className="fas fa-industry text-4xl mb-4 text-gray-300"></i>
                        <p className="text-sm font-medium text-gray-700 mb-2">No production orders found</p>
                        <p className="text-xs text-gray-500 mb-4">Create your first production order to get started</p>
                        <button
                          onClick={() => { 
                            const nextWO = getNextWorkOrderNumber();
                            const mainWarehouse = stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN');
                            setFormData({ 
                              workOrderNumber: nextWO,
                              startDate: null,
                              priority: 'normal',
                              status: 'requested',
                              stockLocationId: mainWarehouse?.id || null
                            });
                            setModalType('add_production'); 
                            setShowModal(true); 
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                          <i className="fas fa-plus text-xs"></i>
                          Create Production Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  productionOrders.map(order => {
                  const progress = (order.quantityProduced / order.quantity) * 100;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{order.id}</td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-gray-900">{order.productName}</div>
                        <div className="text-xs text-gray-500">{order.productSku}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                          {(order.status || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                          order.priority === 'high' ? 'text-red-600 bg-red-50' : 
                          order.priority === 'normal' ? 'text-blue-600 bg-blue-50' : 
                          'text-gray-600 bg-gray-50'
                        }`}>
                          {order.priority}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-right">
                          <div className="text-sm font-semibold text-gray-900">{order.quantityProduced}/{order.quantity}</div>
                          <div className="text-xs text-gray-500">{progress.toFixed(0)}%</div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-sm text-gray-900">Start: {order.startDate}</div>
                        <div className="text-xs text-gray-500">Target: {order.targetDate}</div>
                        {order.completedDate && <div className="text-xs text-green-600">Done: {order.completedDate}</div>}
                      </td>
                      <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">{formatCurrency(order.totalCost)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { 
                              setSelectedItem(order);
                              const mainWarehouse = stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN');
                              setFormData({ 
                                ...order,
                                stockLocationId: order.stockLocationId || mainWarehouse?.id || null
                              }); 
                              setModalType('edit_production'); 
                              setShowModal(true); 
                            }}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                            title="Edit Production Order"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteProductionOrder(order.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            title="Delete Order"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const openEditItemModal = (item) => {
    setFormData({ ...item });
    setSelectedItem(item);
    setModalType('edit_item');
    setShowModal(true);
  };

  // Generate next PSKU number
  const getNextPSKU = () => {
    if (!boms || boms.length === 0) {
      return 'PSKU001';
    }
    
    // Extract all PSKU numbers and find the highest
    const pskuNumbers = boms
      .map(bom => bom.productSku)
      .filter(sku => sku && sku.startsWith('PSKU'))
      .map(sku => {
        const match = sku.match(/PSKU(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });
    
    const maxNumber = pskuNumbers.length > 0 ? Math.max(...pskuNumbers) : 0;
    const nextNumber = maxNumber + 1;
    return `PSKU${String(nextNumber).padStart(3, '0')}`;
  };

  // Generate next Production Order number
  const getNextWorkOrderNumber = () => {
    if (!productionOrders || productionOrders.length === 0) {
      return 'WO0001';
    }
    
    // Extract all WO numbers and find the highest
    const woNumbers = productionOrders
      .map(order => order.workOrderNumber)
      .filter(wo => wo && wo.startsWith('WO'))
      .map(wo => {
        const match = wo.match(/WO(\d+)/);
        return match ? parseInt(match[1]) : 0;
      });
    
    const maxNumber = woNumbers.length > 0 ? Math.max(...woNumbers) : 0;
    const nextNumber = maxNumber + 1;
    return `WO${String(nextNumber).padStart(4, '0')}`;
  };

  const openAddBomModal = async () => {
    // Refresh inventory to ensure we have latest data
    try {
      if (window.DatabaseAPI?.getInventory) {
        const response = await window.DatabaseAPI.getInventory();
        if (response?.data?.inventory) {
          const updatedInventory = response.data.inventory.map(item => ({ ...item, id: item.id }));
          setInventory(updatedInventory);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not refresh inventory:', error.message);
      // Continue anyway - use cached inventory
    }
    
    const nextPSKU = getNextPSKU();
    setFormData({
      inventoryItemId: '', // REQUIRED - must be selected
      productSku: nextPSKU,
      productName: '',
      status: 'active',
      effectiveDate: new Date().toISOString().split('T')[0],
      laborCost: 0,
      overheadCost: 0,
      estimatedTime: 0,
      notes: '',
      thumbnail: '',
      instructions: ''
    });
    setBomComponents([]);
    setModalType('add_bom');
    setShowModal(true);
  };

  const openEditBomModal = (bom) => {
    // Ensure components have location field
    const componentsWithLocation = bom.components.map(comp => ({
      ...comp,
      location: comp.location || ''
    }));
    setFormData({ 
      ...bom,
      inventoryItemId: bom.inventoryItemId || '', // Include inventoryItemId
      thumbnail: bom.thumbnail || '',
      instructions: bom.instructions || ''
    });
    setBomComponents(componentsWithLocation);
    setSelectedItem(bom);
    setModalType('edit_bom');
    setShowModal(true);
  };

  // Fuzzy matching utility functions
  const levenshteinDistance = (str1, str2) => {
    const s1 = (str1 || '').toLowerCase().trim();
    const s2 = (str2 || '').toLowerCase().trim();
    
    if (s1 === s2) return 0;
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    const matrix = [];
    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[s2.length][s1.length];
  };

  const calculateSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 100;
    const distance = levenshteinDistance(str1, str2);
    return ((maxLength - distance) / maxLength) * 100;
  };

  const checkForDuplicateParts = (newItemData, existingInventory) => {
    const warnings = [];
    const newName = (newItemData.name || '').trim();
    const newManufacturingPart = (newItemData.manufacturingPartNumber || '').trim();
    const newLegacyPart = (newItemData.legacyPartNumber || '').trim();
    const newSKU = (newItemData.sku || '').trim();

    // Thresholds for similarity (percentage)
    const nameThreshold = 85; // 85% similarity for names
    const partNumberThreshold = 90; // 90% similarity for part numbers
    const skuThreshold = 95; // 95% similarity for SKUs

    existingInventory.forEach(item => {
      const existingName = (item.name || '').trim();
      const existingManufacturingPart = (item.manufacturingPartNumber || '').trim();
      const existingLegacyPart = (item.legacyPartNumber || '').trim();
      const existingSKU = (item.sku || '').trim();

      let matchScore = 0;
      let matchReasons = [];

      // Check name similarity
      if (newName && existingName) {
        const nameSimilarity = calculateSimilarity(newName, existingName);
        if (nameSimilarity >= nameThreshold) {
          matchScore = Math.max(matchScore, nameSimilarity);
          matchReasons.push(`Name: ${nameSimilarity.toFixed(1)}% similar`);
        }
      }

      // Check manufacturing part number (exact match or high similarity)
      if (newManufacturingPart && existingManufacturingPart) {
        if (newManufacturingPart.toLowerCase() === existingManufacturingPart.toLowerCase()) {
          matchScore = 100;
          matchReasons.push('Manufacturing Part Number: Exact match');
        } else {
          const partSimilarity = calculateSimilarity(newManufacturingPart, existingManufacturingPart);
          if (partSimilarity >= partNumberThreshold) {
            matchScore = Math.max(matchScore, partSimilarity);
            matchReasons.push(`Manufacturing Part: ${partSimilarity.toFixed(1)}% similar`);
          }
        }
      }

      // Check legacy part number (exact match or high similarity)
      if (newLegacyPart && existingLegacyPart) {
        if (newLegacyPart.toLowerCase() === existingLegacyPart.toLowerCase()) {
          matchScore = 100;
          matchReasons.push('Abcotronics Part Number (Legacy): Exact match');
        } else {
          const partSimilarity = calculateSimilarity(newLegacyPart, existingLegacyPart);
          if (partSimilarity >= partNumberThreshold) {
            matchScore = Math.max(matchScore, partSimilarity);
            matchReasons.push(`Abcotronics Part (Legacy): ${partSimilarity.toFixed(1)}% similar`);
          }
        }
      }

      // Check SKU similarity (only if both exist)
      if (newSKU && existingSKU) {
        if (newSKU.toLowerCase() === existingSKU.toLowerCase()) {
          matchScore = 100;
          matchReasons.push('SKU: Exact match');
        } else {
          const skuSimilarity = calculateSimilarity(newSKU, existingSKU);
          if (skuSimilarity >= skuThreshold) {
            matchScore = Math.max(matchScore, skuSimilarity);
            matchReasons.push(`SKU: ${skuSimilarity.toFixed(1)}% similar`);
          }
        }
      }

      // If we found a match, add to warnings
      if (matchScore >= nameThreshold) {
        warnings.push({
          existingItem: item,
          matchScore: matchScore,
          reasons: matchReasons,
          severity: matchScore >= 95 ? 'high' : matchScore >= 85 ? 'medium' : 'low'
        });
      }
    });

    // Sort by match score (highest first)
    return warnings.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5); // Return top 5 matches
  };

  const handleSaveItem = async () => {
    try {
      // Don't include quantity in update (it's read-only)
      // Don't include SKU in create (auto-generated) or update (read-only)
      // Don't include location (removed)
      // Don't include status (auto-calculated)
      const itemData = {
        name: formData.name,
        thumbnail: formData.thumbnail || '',
        category: formData.category,
        type: formData.type,
        unit: formData.unit,
        reorderPoint: formData.reorderPoint === undefined || formData.reorderPoint === null || formData.reorderPoint === '' ? undefined : parseFloat(formData.reorderPoint),
        reorderQty: formData.reorderQty === undefined || formData.reorderQty === null || formData.reorderQty === '' ? undefined : parseFloat(formData.reorderQty),
        unitCost: formData.unitCost === undefined || formData.unitCost === null || formData.unitCost === '' ? undefined : parseFloat(formData.unitCost),
        supplier: formData.supplier || ''
      };
      
      // Only include new fields if they exist (backwards compatibility)
      if (formData.supplierPartNumbers !== undefined) {
        itemData.supplierPartNumbers = formData.supplierPartNumbers || '[]';
      }
      if (formData.manufacturingPartNumber !== undefined) {
        itemData.manufacturingPartNumber = formData.manufacturingPartNumber || '';
      }
      if (formData.legacyPartNumber !== undefined) {
        itemData.legacyPartNumber = formData.legacyPartNumber || '';
      }
      // Include production tracking fields for Final Products
      if (formData.inProductionQuantity !== undefined) {
        itemData.inProductionQuantity = formData.inProductionQuantity === undefined || formData.inProductionQuantity === null || formData.inProductionQuantity === '' ? undefined : parseFloat(formData.inProductionQuantity);
      }
      if (formData.completedQuantity !== undefined) {
        itemData.completedQuantity = formData.completedQuantity === undefined || formData.completedQuantity === null || formData.completedQuantity === '' ? undefined : parseFloat(formData.completedQuantity);
      }

      if (selectedItem?.id) {
        // Update existing - don't send quantity or SKU
        const targetId = getInventoryItemId(selectedItem);
        const response = await safeCallAPI('updateInventoryItem', targetId, itemData);
        if (response?.data?.item) {
          const updatedInventory = inventory.map(item => getInventoryItemId(item) === targetId ? response.data.item : item);
          setInventory(updatedInventory);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
        }
      } else {
        // Create new - include quantity for initial stock, but not SKU (auto-generated)
        // Set locationId based on selected location (or main warehouse as default)
        const locationId = selectedLocationId && selectedLocationId !== 'all' 
          ? selectedLocationId 
          : (stockLocations.find(loc => loc.code === 'LOC001')?.id || null);
        
        const createData = {
          ...itemData,
          quantity: formData.quantity === undefined || formData.quantity === null || formData.quantity === '' ? undefined : parseFloat(formData.quantity),
          inProductionQuantity: formData.inProductionQuantity === undefined || formData.inProductionQuantity === null || formData.inProductionQuantity === '' ? undefined : parseFloat(formData.inProductionQuantity),
          completedQuantity: formData.completedQuantity === undefined || formData.completedQuantity === null || formData.completedQuantity === '' ? undefined : parseFloat(formData.completedQuantity),
          lastRestocked: new Date().toISOString().split('T')[0],
          locationId: locationId // Include locationId
        };

        // Check for duplicate parts using fuzzy matching
        const duplicateWarningsFound = checkForDuplicateParts(createData, inventory);
        if (duplicateWarningsFound.length > 0) {
          // Store the create data and show warning modal
          setPendingCreateData(createData);
          setDuplicateWarnings(duplicateWarningsFound);
          setShowDuplicateWarning(true);
          return; // Don't create yet, wait for user confirmation
        }

        // No duplicates found, proceed with creation
        const response = await safeCallAPI('createInventoryItem', createData);
        if (response?.data?.item) {
          const updatedInventory = [...inventory, { ...response.data.item, id: response.data.item.id }];
          setInventory(updatedInventory);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
        }
      }

      setShowModal(false);
      setSelectedItem(null);
      setFormData({});
    } catch (error) {
      console.error('Error saving inventory item:', error);
      alert('Failed to save inventory item. Please try again.');
    }
  };

  // Handle duplicate warning - proceed with creation anyway
  const handleProceedWithDuplicate = async () => {
    if (!pendingCreateData) return;
    
    try {
      const response = await safeCallAPI('createInventoryItem', pendingCreateData);
      if (response?.data?.item) {
        const updatedInventory = [...inventory, { ...response.data.item, id: response.data.item.id }];
        setInventory(updatedInventory);
        localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
      }
      
      // Close both modals
      setShowDuplicateWarning(false);
      setShowModal(false);
      setSelectedItem(null);
      setFormData({});
      setPendingCreateData(null);
      setDuplicateWarnings([]);
    } catch (error) {
      console.error('Error saving inventory item:', error);
      alert('Failed to save inventory item. Please try again.');
    }
  };

  // Handle duplicate warning - cancel creation
  const handleCancelDuplicate = () => {
    setShowDuplicateWarning(false);
    setPendingCreateData(null);
    setDuplicateWarnings([]);
    // Keep the add item modal open so user can edit
  };

  const handleAddCategory = () => {
    const trimmedName = (newCategoryName || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (trimmedName && !categories.includes(trimmedName)) {
      const updatedCategories = [...categories, trimmedName];
      setCategories(updatedCategories);
      localStorage.setItem('inventory_categories', JSON.stringify(updatedCategories));
      setFormData({ ...formData, category: trimmedName });
      setNewCategoryName('');
      setShowCategoryInput(false);
    } else if (categories.includes(trimmedName)) {
      alert('Category already exists!');
    }
  };

  const handleDeleteCategory = (categoryToDelete) => {
    if (confirm(`Are you sure you want to delete category "${categoryToDelete}"? This will only remove it from the list. Items using this category will keep it.`)) {
      const updatedCategories = categories.filter(cat => cat !== categoryToDelete);
      setCategories(updatedCategories);
      localStorage.setItem('inventory_categories', JSON.stringify(updatedCategories));
      if (formData.category === categoryToDelete) {
        setFormData({ ...formData, category: updatedCategories.length > 0 ? updatedCategories[0] : '' });
      }
    }
  };

  const handleDeleteItem = async (itemOrId) => {
    const itemId = getInventoryItemId(itemOrId);
    if (!itemId) {
      alert('Unable to determine which item to delete. Please refresh and try again.');
      return;
    }

    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await safeCallAPI('deleteInventoryItem', itemId);
        const updatedInventory = inventory.filter(item => getInventoryItemId(item) !== itemId);
        setInventory(updatedInventory);
        localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
        setShowModal(false);
      } catch (error) {
        console.error('Error deleting inventory item:', error);
        const message = error?.message || 'Failed to delete inventory item. Please try again.';
        alert(message);
      }
    }
  };

  const handleSaveBom = async () => {
    try {
      // Validate inventory item is selected (REQUIRED)
      if (!formData.inventoryItemId) {
        alert('⚠️ REQUIRED: You must select a finished product inventory item before creating the BOM.\n\nIf you haven\'t created the finished product yet:\n1. Go to the Inventory tab\n2. Add a new item\n3. Set Type to "Finished Good"\n4. Set Category to "Finished Goods"\n5. Then return here to create the BOM.');
        return;
      }
      
      // Ensure PSKU is set for new BOMs
      const productSku = formData.productSku || getNextPSKU();
      
      // Validate required fields per backend requirements
      if (!productSku || !formData.productName) {
        alert('Please enter Product Name before saving the BOM.');
        return;
      }

      const totalMaterialCost = bomComponents.reduce((sum, comp) => sum + (parseFloat(comp.totalCost) || 0), 0);
      const laborCost = parseFloat(formData.laborCost || 0);
      const overheadCost = parseFloat(formData.overheadCost || 0);
      const totalCost = totalMaterialCost + laborCost + overheadCost;

      const bomData = {
        ...formData,
        productSku: productSku,
        inventoryItemId: formData.inventoryItemId, // REQUIRED
        components: bomComponents,
        totalMaterialCost,
        laborCost,
        overheadCost,
        totalCost,
        estimatedTime: parseInt(formData.estimatedTime) || 0,
        effectiveDate: formData.effectiveDate || new Date().toISOString().split('T')[0]
      };

      if (selectedItem?.id) {
        // Update existing
        const response = await safeCallAPI('updateBOM', selectedItem.id, bomData);
        if (response?.data?.bom) {
          const updatedBom = {
            ...response.data.bom,
            components: Array.isArray(response.data.bom.components) ? response.data.bom.components : (typeof response.data.bom.components === 'string' ? JSON.parse(response.data.bom.components || '[]') : [])
          };
          const updatedBoms = boms.map(bom => bom.id === selectedItem.id ? updatedBom : bom);
          setBoms(updatedBoms);
          localStorage.setItem('manufacturing_boms', JSON.stringify(updatedBoms));
        }
      } else {
        // Create new
        const response = await safeCallAPI('createBOM', bomData);
        if (response?.data?.bom) {
          const newBom = {
            ...response.data.bom,
            components: Array.isArray(response.data.bom.components) ? response.data.bom.components : (typeof response.data.bom.components === 'string' ? JSON.parse(response.data.bom.components || '[]') : [])
          };
          const updatedBoms = [...boms, newBom];
          setBoms(updatedBoms);
          localStorage.setItem('manufacturing_boms', JSON.stringify(updatedBoms));
        }
      }

      setShowModal(false);
      setSelectedItem(null);
      setFormData({});
      setBomComponents([]);
    } catch (error) {
      console.error('Error saving BOM:', error);
      alert('Failed to save BOM. Please try again.');
    }
  };

  const handleDeleteBom = async (bomId) => {
    if (confirm('Are you sure you want to delete this BOM?')) {
      try {
        await safeCallAPI('deleteBOM', bomId);
        const updatedBoms = boms.filter(bom => bom.id !== bomId);
        setBoms(updatedBoms);
        localStorage.setItem('manufacturing_boms', JSON.stringify(updatedBoms));
        setShowModal(false);
      } catch (error) {
        console.error('Error deleting BOM:', error);
        alert('Failed to delete BOM. Please try again.');
      }
    }
  };

  const handleDeleteProductionOrder = async (orderId) => {
    if (confirm('Are you sure you want to delete this production order? This action cannot be undone.')) {
      try {
        await safeCallAPI('deleteProductionOrder', orderId);
        const updatedOrders = productionOrders.filter(order => order.id !== orderId);
        setProductionOrders(updatedOrders);
        localStorage.setItem('manufacturing_production_orders', JSON.stringify(updatedOrders));
      } catch (error) {
        console.error('Error deleting production order:', error);
        alert('Failed to delete production order. Please try again.');
      }
    }
  };

  const handleDeleteSalesOrder = async (orderId) => {
    if (confirm('Are you sure you want to delete this sales order? This action cannot be undone.')) {
      try {
        await safeCallAPI('deleteSalesOrder', orderId);
        const updatedOrders = salesOrders.filter(order => order.id !== orderId);
        setSalesOrders(updatedOrders);
        localStorage.setItem('manufacturing_sales_orders', JSON.stringify(updatedOrders));
      } catch (error) {
        console.error('Error deleting sales order:', error);
        alert('Failed to delete sales order. Please try again.');
      }
    }
  };

  const openAddSalesOrderModal = () => {
    setFormData({
      clientId: '',
      clientName: '',
      priority: 'normal',
      orderDate: new Date().toISOString().split('T')[0],
      requiredDate: '',
      subtotal: 0,
      tax: 0,
      total: 0,
      shippingAddress: '',
      shippingMethod: '',
      notes: '',
      internalNotes: ''
    });
    setSalesOrderItems([]);
    setNewSalesOrderItem({ sku: '', name: '', quantity: 1, unitPrice: 0 });
    setModalType('add_sales');
    setShowModal(true);
  };

  const handleAddSalesOrderItem = () => {
    if (!newSalesOrderItem.sku || !newSalesOrderItem.name || newSalesOrderItem.quantity <= 0 || newSalesOrderItem.unitPrice <= 0) {
      alert('Please fill in all fields: SKU, Name, Quantity > 0, and Unit Price > 0');
      return;
    }
    
    const total = newSalesOrderItem.quantity * newSalesOrderItem.unitPrice;
    const item = {
      id: Date.now().toString(),
      sku: newSalesOrderItem.sku,
      name: newSalesOrderItem.name,
      quantity: parseFloat(newSalesOrderItem.quantity),
      unitPrice: parseFloat(newSalesOrderItem.unitPrice),
      total: total
    };
    
    setSalesOrderItems([...salesOrderItems, item]);
    setNewSalesOrderItem({ sku: '', name: '', quantity: 1, unitPrice: 0 });
  };

  const handleRemoveSalesOrderItem = (itemId) => {
    setSalesOrderItems(salesOrderItems.filter(item => item.id !== itemId));
  };

  const handleSaveSalesOrder = async () => {
    try {
      if (!formData.clientId && !formData.clientName) {
        alert('Please select a client');
        return;
      }
      
      if (salesOrderItems.length === 0) {
        alert('Please add at least one order item');
        return;
      }

      // Calculate totals
      const subtotal = salesOrderItems.reduce((sum, item) => sum + item.total, 0);
      const tax = formData.tax || 0;
      const total = subtotal + tax;

      const orderData = {
        clientId: formData.clientId || null,
        clientName: formData.clientName || '',
        clientSiteId: formData.clientSiteId || null,
        clientSiteName: formData.clientSiteName || '',
        status: 'confirmed', // Sales orders are automatically confirmed when created
        priority: formData.priority || 'normal',
        orderDate: formData.orderDate || new Date().toISOString(),
        requiredDate: formData.requiredDate || null,
        subtotal: subtotal,
        tax: tax,
        total: total,
        items: salesOrderItems.map(item => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total
        })),
        shippingAddress: formData.shippingAddress || '',
        shippingMethod: formData.shippingMethod || '',
        notes: formData.notes || '',
        internalNotes: formData.internalNotes || ''
      };

      const response = await safeCallAPI('createSalesOrder', orderData);
      
      if (response?.data?.salesOrder) {
        const createdOrder = response.data.salesOrder;
        const orderNumber = createdOrder.orderNumber || createdOrder.id;
        
        // Create stock movements for each item (consumption - items being sold)
        if (salesOrderItems && salesOrderItems.length > 0) {
          
          try {
            // Get default warehouse location (main warehouse)
            const mainWarehouse = stockLocations.find(loc => loc.code === 'LOC001' || loc.type === 'warehouse') || stockLocations[0];
            const defaultLocationId = mainWarehouse ? mainWarehouse.id : '';
            const defaultLocationName = mainWarehouse ? mainWarehouse.name : 'Main Warehouse';
            
            // Create a stock movement for each item in the sales order
            for (const orderItem of salesOrderItems) {
              if (!orderItem.sku || orderItem.quantity <= 0) {
                console.warn('⚠️ Skipping invalid order item:', orderItem);
                continue;
              }

              // Find the inventory item to get unit cost
              const invItem = inventory.find(item => item.sku === orderItem.sku || item.id === orderItem.sku);
              const unitCost = invItem?.unitCost || orderItem.unitPrice || 0;

              const movementData = {
                type: 'consumption', // Stock being consumed/sold
                sku: orderItem.sku,
                itemName: orderItem.name || '',
                quantity: parseFloat(orderItem.quantity),
                unitCost: unitCost ? parseFloat(unitCost) : undefined,
                fromLocation: String(defaultLocationId || ''), // Location where stock is taken from (convert to string)
                toLocation: '', // Empty as this is consumption/sale, not a transfer
                reference: `Sales Order ${orderNumber}`,
                performedBy: user?.name || 'System',
                notes: `Stock sold to client: ${formData.clientName || 'N/A'} - Sales Order ${orderNumber}`,
                date: new Date().toISOString()
              };


              // Try to create stock movement via API
              if (window.DatabaseAPI?.createStockMovement) {
                try {
                  const movementResponse = await safeCallAPI('createStockMovement', movementData);
                } catch (error) {
                  console.error(`❌ Failed to create stock movement for ${orderItem.name}:`, error);
                  console.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    movementData
                  });
                  // Store in localStorage for offline sync
                  const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
                  cachedMovements.push({
                    ...movementData,
                    id: `MOV${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    synced: false
                  });
                  localStorage.setItem('manufacturing_movements', JSON.stringify(cachedMovements));
                }
              } else {
                // Offline mode - store in localStorage for later sync
                const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
                cachedMovements.push({
                  ...movementData,
                  id: `MOV${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  synced: false
                });
                localStorage.setItem('manufacturing_movements', JSON.stringify(cachedMovements));
              }
            }
            
            // Refresh inventory to show updated quantities
            if (window.DatabaseAPI && window.DatabaseAPI.getInventory) {
              try {
                const invResponse = await window.DatabaseAPI.getInventory();
                const invData = invResponse?.data?.inventory || [];
                setInventory(invData);
                localStorage.setItem('manufacturing_inventory', JSON.stringify(invData));
              } catch (invError) {
                console.error('❌ Failed to refresh inventory:', invError);
              }
            }
          } catch (error) {
            console.error('❌ Error creating stock movements:', error);
            console.error('Error stack:', error.stack);
            // Don't block save - just warn
            console.warn('⚠️ Sales order will be saved but stock movements may not have been recorded');
          }
        } else {
        }

        const updatedOrders = [...salesOrders, { ...createdOrder, id: createdOrder.id }];
        setSalesOrders(updatedOrders);
        localStorage.setItem('manufacturing_sales_orders', JSON.stringify(updatedOrders));
        alert('Sales order created successfully! Stock movements have been recorded.');
      } else {
        alert('Sales order created but response data incomplete. Please refresh to verify.');
      }

      setShowModal(false);
      setFormData({});
      setSalesOrderItems([]);
    } catch (error) {
      console.error('❌ Error saving sales order:', error);
      alert(`Failed to save sales order: ${error.message}`);
    }
  };

  const openAddPurchaseOrderModal = () => {
    // Get default warehouse location
    const mainWarehouse = stockLocations.find(loc => loc.code === 'LOC001' || loc.type === 'warehouse') || stockLocations[0];
    setFormData({
      supplierId: '',
      supplierName: '',
      status: 'draft',
      priority: 'normal',
      orderDate: new Date().toISOString().split('T')[0],
      expectedDate: '',
      toLocationId: mainWarehouse ? mainWarehouse.id : '',
      subtotal: 0,
      tax: 0,
      total: 0,
      notes: '',
      internalNotes: ''
    });
    setPurchaseOrderItems([]);
    setNewPurchaseOrderItem({ sku: '', name: '', quantity: 1, unitPrice: 0, supplierPartNumber: '' });
    setModalType('add_purchase');
    setShowModal(true);
  };

  const handleAddPurchaseOrderItem = () => {
    if (!newPurchaseOrderItem.sku || !newPurchaseOrderItem.name || newPurchaseOrderItem.quantity <= 0 || newPurchaseOrderItem.unitPrice <= 0) {
      alert('Please fill in all fields: SKU, Name, Quantity > 0, and Unit Price > 0');
      return;
    }
    
    const total = newPurchaseOrderItem.quantity * newPurchaseOrderItem.unitPrice;
    const item = {
      id: Date.now().toString(),
      sku: newPurchaseOrderItem.sku,
      name: newPurchaseOrderItem.name,
      quantity: parseFloat(newPurchaseOrderItem.quantity),
      unitPrice: parseFloat(newPurchaseOrderItem.unitPrice),
      total: total,
      supplierPartNumber: newPurchaseOrderItem.supplierPartNumber || ''
    };
    
    setPurchaseOrderItems([...purchaseOrderItems, item]);
    setNewPurchaseOrderItem({ sku: '', name: '', quantity: 1, unitPrice: 0, supplierPartNumber: '' });
  };

  const handleRemovePurchaseOrderItem = (itemId) => {
    setPurchaseOrderItems(purchaseOrderItems.filter(item => item.id !== itemId));
  };

  const handleSavePurchaseOrder = async () => {
    try {
      if (!formData.supplierId && !formData.supplierName) {
        alert('Please select a supplier');
        return;
      }
      
      if (purchaseOrderItems.length === 0) {
        alert('Please add at least one order item');
        return;
      }

      // Calculate totals
      const subtotal = purchaseOrderItems.reduce((sum, item) => sum + item.total, 0);
      const tax = formData.tax || 0;
      const total = subtotal + tax;

      // Get default warehouse location for receiving
      const mainWarehouse = stockLocations.find(loc => loc.code === 'LOC001' || loc.type === 'warehouse') || stockLocations[0];
      const toLocationId = formData.toLocationId || (mainWarehouse ? mainWarehouse.id : null);

      const orderData = {
        supplierId: formData.supplierId || '',
        supplierName: formData.supplierName || '',
        status: 'draft', // Purchase orders start as draft and must be marked as received to update inventory
        priority: formData.priority || 'normal',
        orderDate: formData.orderDate || new Date().toISOString(),
        expectedDate: formData.expectedDate || null,
        toLocationId: toLocationId,
        subtotal: subtotal,
        tax: tax,
        total: total,
        items: purchaseOrderItems.map(item => ({
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          supplierPartNumber: item.supplierPartNumber || ''
        })),
        notes: formData.notes || '',
        internalNotes: formData.internalNotes || ''
      };

      const response = await safeCallAPI('createPurchaseOrder', orderData);
      
      if (response?.data?.purchaseOrder) {
        const createdOrder = response.data.purchaseOrder;
        const orderNumber = createdOrder.orderNumber || createdOrder.id;

        const updatedOrders = [...purchaseOrders, { ...createdOrder, id: createdOrder.id }];
        setPurchaseOrders(updatedOrders);
        localStorage.setItem('manufacturing_purchase_orders', JSON.stringify(updatedOrders));
        alert('Purchase order created successfully! Mark it as "received" to record stock movements and update inventory.');
      } else {
        alert('Purchase order created but response data incomplete. Please refresh to verify.');
      }

      setShowModal(false);
      setFormData({});
      setPurchaseOrderItems([]);
    } catch (error) {
      console.error('❌ Error saving purchase order:', error);
      alert(`Failed to save purchase order: ${error.message}`);
    }
  };

  const handleDeletePurchaseOrder = async (orderId) => {
    if (confirm('Are you sure you want to delete this purchase order? This action cannot be undone.')) {
      try {
        await safeCallAPI('deletePurchaseOrder', orderId);
        const updatedOrders = purchaseOrders.filter(order => order.id !== orderId);
        setPurchaseOrders(updatedOrders);
        localStorage.setItem('manufacturing_purchase_orders', JSON.stringify(updatedOrders));
      } catch (error) {
        console.error('Error deleting purchase order:', error);
        alert('Failed to delete purchase order. Please try again.');
      }
    }
  };

  const handleDeleteMovement = async (movementId) => {
    // Find the movement for confirmation message
    const movement = movements.find(m => m.id === movementId);
    const movementInfo = movement 
      ? `${movement.itemName} (${movement.sku}) - ${movement.type} on ${movement.date}`
      : movementId;
    
    if (confirm(`Are you sure you want to delete this stock movement?\n\n${movementInfo}\n\nThis action cannot be undone.`)) {
      try {
        
        // Use the API endpoint directly
        const token = window.storage?.getToken?.();
        const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
        
        const response = await fetch(`${apiBase}/api/manufacturing/stock-movements/${movementId}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText }));
          throw new Error(errorData.message || `Failed to delete: ${response.status}`);
        }

        // Remove from local state
        const updatedMovements = movements.filter(movement => movement.id !== movementId);
        setMovements(updatedMovements);
        localStorage.setItem('manufacturing_movements', JSON.stringify(updatedMovements));
        
      } catch (error) {
        console.error('❌ Error deleting stock movement:', error);
        alert(`Failed to delete stock movement: ${error.message}`);
      }
    }
  };

  const handlePurgeAllMovements = async () => {
    const count = movements.length;
    
    if (count === 0) {
      alert('No stock movements to purge.');
      return;
    }

    const confirmed = confirm(
      `⚠️  WARNING: This will delete ALL ${count} stock movements from the database.\n\n` +
      `This action cannot be undone!\n\n` +
      `Do you want to proceed?`
    );

    if (!confirmed) {
      return;
    }

    try {
      
      // Use bulk delete API endpoint
      const token = window.storage?.getToken?.();
      const apiBase = window.DatabaseAPI?.API_BASE || window.location.origin;
      
      const response = await fetch(`${apiBase}/api/manufacturing/stock-movements`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'Unknown error' };
        }
        console.error('❌ API Error Response:', {
          status: response.status,
          statusText: response.statusText,
          body: errorData
        });
        throw new Error(errorData.message || `Failed to delete stock movements: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      const deletedCount = result?.count || result?.data?.count || count;
      
      if (deletedCount === 0) {
        console.warn('⚠️ API returned 0 deleted count, but response was OK');
      }

      // Clear local state and cache
      setMovements([]);
      localStorage.removeItem('manufacturing_movements');
      
      alert(`✅ Successfully purged ${deletedCount} stock movements from the database.`);
      
      // Reload data to ensure consistency
      if (typeof window.DatabaseAPI.getStockMovements === 'function') {
        const movementsResponse = await window.DatabaseAPI.getStockMovements();
        const movementsData = movementsResponse?.data?.movements || [];
        setMovements(movementsData);
        localStorage.setItem('manufacturing_movements', JSON.stringify(movementsData));
      }
    } catch (error) {
      console.error('❌ Error purging stock movements:', error);
      alert(`Failed to purge stock movements: ${error.message}`);
    }
  };

  const openAddMovementModal = (prefill = {}) => {
    try {
      setFormData({
        type: prefill.type || 'receipt',
        sku: prefill.sku || '',
        itemName: prefill.itemName || '',
        quantity: prefill.quantity !== undefined ? prefill.quantity : '',
        unitCost: prefill.unitCost !== undefined ? prefill.unitCost : '',
        fromLocation: prefill.fromLocation || '',
        toLocation: prefill.toLocation || '',
        reference: prefill.reference || '',
        notes: prefill.notes || '',
        date: prefill.date || new Date().toISOString().split('T')[0]
      });
      setModalType('add_movement');
      setShowModal(true);
    } catch (error) {
      console.error('❌ Error opening movement modal:', error);
      alert('Error opening movement modal. Please check console.');
    }
  };

  const handleSaveMovement = async () => {
    try {
      // Robust validation
      const isValidQuantity = formData.quantity !== '' && formData.quantity !== null && formData.quantity !== undefined;
      const isAdjustment = formData.type === 'adjustment';
      
      // Validate required fields
      if (!formData.sku || !formData.itemName || !isValidQuantity) {
        alert('Please provide SKU, Item Name, and Quantity');
        return;
      }
      
      // Validate SKU format (basic check)
      if (formData.sku.trim().length === 0) {
        alert('SKU cannot be empty');
        return;
      }
      
      // Validate item name
      if (formData.itemName.trim().length === 0) {
        alert('Item Name cannot be empty');
        return;
      }
      
      // Parse and validate quantity
      const quantity = parseFloat(formData.quantity);
      if (isNaN(quantity)) {
        alert('Quantity must be a valid number');
        return;
      }
      
      // For non-adjustment types, allow negative values but not zero
      if (!isAdjustment && quantity === 0) {
        alert('Quantity cannot be zero for non-adjustment movements');
        return;
      }
      
      // Validate unit cost if provided
      let unitCost = undefined;
      if (formData.unitCost && formData.unitCost !== '') {
        unitCost = parseFloat(formData.unitCost);
        if (isNaN(unitCost) || unitCost < 0) {
          alert('Unit Cost must be a valid positive number');
          return;
        }
      }

      const movementData = {
        type: formData.type || 'receipt',
        sku: formData.sku.trim(),
        itemName: formData.itemName.trim(),
        quantity: quantity,
        unitCost: unitCost,
        fromLocation: (formData.fromLocation || '').trim(),
        toLocation: (formData.toLocation || '').trim(),
        reference: (formData.reference || '').trim(),
        notes: (formData.notes || '').trim(),
        date: formData.date || new Date().toISOString().split('T')[0]
      };

      
      // Retry logic for API call
      let response;
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          response = await safeCallAPI('createStockMovement', movementData);
          break; // Success, exit retry loop
        } catch (apiError) {
          retries++;
          if (retries >= maxRetries) {
            throw apiError;
          }
          console.warn(`⚠️ API call failed, retrying (${retries}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, 500 * retries)); // Exponential backoff
        }
      }
      
      
      // Check if movement was created successfully (handle various response structures)
      const createdMovement = response?.data?.movement || response?.movement || response?.data;
      
      if (createdMovement || response?.data || response?.success !== false) {
        
        // Wait for database commit
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Refresh movements list with retry logic
        let movementsData = [];
        retries = 0;
        while (retries < maxRetries) {
          try {
            const movementsResponse = await safeCallAPI('getStockMovements');
            movementsData = movementsResponse?.data?.movements || [];
            
            // Verify the new movement is in the list
            const newMovementFound = movementsData.some(m => 
              m.sku === movementData.sku && 
              m.type === movementData.type &&
              Math.abs(m.quantity - movementData.quantity) < 0.01 &&
              Math.abs(new Date(m.date).getTime() - new Date(movementData.date).getTime()) < 86400000 // Within 24 hours
            );
            
            if (newMovementFound || movementsData.length > 0) {
              break; // Success
            }
            
            if (retries < maxRetries - 1) {
              console.warn(`⚠️ New movement not found yet, retrying (${retries + 1}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 500));
            }
            retries++;
          } catch (error) {
            retries++;
            if (retries >= maxRetries) {
              console.error('❌ Failed to refresh movements after retries:', error);
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
        
        
        const processedMovements = movementsData.map(movement => ({
          ...movement,
          id: movement.id
        }));
        setMovements(processedMovements);
        localStorage.setItem('manufacturing_movements', JSON.stringify(processedMovements));
        
        // Refresh inventory
        try {
          const invResponse = await safeCallAPI('getInventory');
          const invData = invResponse?.data?.inventory || [];
          const processedInventory = invData.map(item => ({ ...item, id: item.id }));
          setInventory(processedInventory);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(processedInventory));
        } catch (invError) {
          console.warn('⚠️ Failed to refresh inventory, but movement was saved:', invError);
        }
        
        setShowModal(false);
        setFormData({});
        alert('Stock movement recorded successfully!');
      } else {
        console.error('❌ Invalid response structure:', response);
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('❌ Error creating stock movement:', error);
      const errorMessage = error?.message || error?.response?.data?.message || 'Failed to create stock movement. Please try again.';
      alert(`Error: ${errorMessage}`);
    }
  };

  const openAddSupplierModal = () => {
    setSelectedItem(null);
    setFormData({
      name: '',
      code: '',
      contactPerson: '',
      email: '',
      phone: '',
      address: '',
      website: '',
      paymentTerms: 'Net 30',
      notes: '',
      status: 'active'
    });
    setModalType('add_supplier');
    setShowModal(true);
  };

  const openEditSupplierModal = (supplier) => {
    setFormData({ ...supplier });
    setSelectedItem(supplier);
    setModalType('edit_supplier');
    setShowModal(true);
  };

  const handleSaveSupplier = async () => {
    try {
      const isEditingSupplier = modalType === 'edit_supplier' && selectedItem;
      const supplierData = {
        code: formData.code || '',
        name: formData.name,
        contactPerson: formData.contactPerson || '',
        email: formData.email || '',
        phone: formData.phone || '',
        website: formData.website || '',
        address: formData.address || '',
        paymentTerms: formData.paymentTerms || 'Net 30',
        status: formData.status || 'active',
        notes: formData.notes || ''
      };

      let savedSupplier;
      if (isEditingSupplier && window.DatabaseAPI && window.DatabaseAPI.updateSupplier) {
        // Update existing supplier
        const response = await window.DatabaseAPI.updateSupplier(selectedItem.id, supplierData);
        savedSupplier = response?.data?.supplier;
      } else if (window.DatabaseAPI && window.DatabaseAPI.createSupplier) {
        // Create new supplier
        const response = await window.DatabaseAPI.createSupplier(supplierData);
        savedSupplier = response?.data?.supplier;
      } else {
        // Fallback to localStorage if DatabaseAPI not available
        const newSupplier = {
          ...supplierData,
          id: selectedItem?.id || `SUP${String(suppliers.length + 1).padStart(3, '0')}`,
          createdAt: selectedItem?.createdAt || new Date().toISOString().split('T')[0],
          updatedAt: new Date().toISOString().split('T')[0]
        };

        let updatedSuppliers;
        if (selectedItem) {
          updatedSuppliers = suppliers.map(supplier => supplier.id === selectedItem.id ? newSupplier : supplier);
        } else {
          updatedSuppliers = [...suppliers, newSupplier];
        }

        setSuppliers(updatedSuppliers);
        localStorage.setItem('manufacturing_suppliers', JSON.stringify(updatedSuppliers));

        setShowModal(false);
        setSelectedItem(null);
        setFormData({});
        return;
      }

      // Ensure UI updates immediately with the saved supplier
      if (savedSupplier) {
        const normalizedSupplier = {
          ...savedSupplier,
          id: savedSupplier.id || savedSupplier._id || savedSupplier.code || `SUP${String(Date.now()).slice(-5)}`,
          createdAt: savedSupplier.createdAt || new Date().toISOString().split('T')[0],
          updatedAt: savedSupplier.updatedAt || new Date().toISOString().split('T')[0]
        };

        setSuppliers(prev => {
          const updatedSuppliers = isEditingSupplier
            ? prev.map(supplier => (supplier.id === normalizedSupplier.id ? normalizedSupplier : supplier))
            : [...prev, normalizedSupplier];
          localStorage.setItem('manufacturing_suppliers', JSON.stringify(updatedSuppliers));
          return updatedSuppliers;
        });
      }

      // Refresh suppliers list from database for authoritative sync
      if (window.DatabaseAPI && window.DatabaseAPI.getSuppliers) {
        try {
          const suppliersResponse = await window.DatabaseAPI.getSuppliers();
          const suppliersData = suppliersResponse?.data?.suppliers || [];
          const processedSuppliers = suppliersData.map(supplier => ({
            ...supplier,
            id: supplier.id,
            createdAt: supplier.createdAt || new Date().toISOString().split('T')[0],
            updatedAt: supplier.updatedAt || new Date().toISOString().split('T')[0]
          }));
          setSuppliers(processedSuppliers);
          localStorage.setItem('manufacturing_suppliers', JSON.stringify(processedSuppliers));
        } catch (refreshError) {
          console.warn('⚠️ Failed to refresh suppliers after save, using local optimistic data:', refreshError);
        }
      }

      setShowModal(false);
      setSelectedItem(null);
      setFormData({});
    } catch (error) {
      console.error('Error saving supplier:', error);
      alert(`Failed to save supplier: ${error.message}`);
    }
  };

  const handleDeleteSupplier = async (supplierId) => {
    // Check if supplier is used in any inventory items
    const supplier = suppliers.find(s => s.id === supplierId);
    const isUsed = inventory.some(item => item.supplier === supplier?.name);
    
    if (isUsed) {
      alert('Cannot delete supplier: This supplier is assigned to one or more inventory items. Please update those items first.');
      return;
    }

    if (confirm('Are you sure you want to delete this supplier?')) {
      try {
        if (window.DatabaseAPI && window.DatabaseAPI.deleteSupplier) {
          await window.DatabaseAPI.deleteSupplier(supplierId);
          
          // Refresh suppliers list from database
          const suppliersResponse = await window.DatabaseAPI.getSuppliers();
          const suppliersData = suppliersResponse?.data?.suppliers || [];
          setSuppliers(suppliersData.map(s => ({
            ...s,
            id: s.id,
            createdAt: s.createdAt || new Date().toISOString().split('T')[0],
            updatedAt: s.updatedAt || new Date().toISOString().split('T')[0]
          })));
        } else {
          // Fallback to localStorage
          const updatedSuppliers = suppliers.filter(s => s.id !== supplierId);
          setSuppliers(updatedSuppliers);
          localStorage.setItem('manufacturing_suppliers', JSON.stringify(updatedSuppliers));
        }
        setShowModal(false);
      } catch (error) {
        // Check if error is 404 (supplier not found) - treat as success since it's already deleted
        const isNotFound = error.message?.includes('404') || error.message?.includes('not found');
        
        if (isNotFound) {
          // Supplier already deleted on server, just update local state
          const updatedSuppliers = suppliers.filter(s => s.id !== supplierId);
          setSuppliers(updatedSuppliers);
          localStorage.setItem('manufacturing_suppliers', JSON.stringify(updatedSuppliers));
          setShowModal(false);
        } else {
          // Other errors - show alert
          console.error('Error deleting supplier:', error);
          alert(`Failed to delete supplier: ${error.message}`);
        }
      }
    }
  };

  const handleSaveProductionOrder = async () => {
    try {
      const selectedBom = boms.find(b => b.id === formData.bomId);
      if (!selectedBom) {
        alert('Please select a BOM/Product');
        return;
      }

      // Validate quantity is greater than 0
      const quantity = parseInt(formData.quantity);
      if (!quantity || quantity <= 0) {
        alert('Please enter a valid quantity greater than 0');
        return;
      }

      // Validate required fields
      // Validate stock location is selected
      if (!formData.stockLocationId) {
        alert('Please select a stock location');
        return;
      }

      const totalCost = selectedBom.totalCost * quantity;
      // Ensure production order number is set
      if (!formData.workOrderNumber) {
        setFormData({ ...formData, workOrderNumber: getNextWorkOrderNumber() });
      }
      const workOrderNumber = formData.workOrderNumber || getNextWorkOrderNumber();
      
      // Determine client allocation (backward compatibility)
      const allocationType = formData.clientId && formData.clientId !== 'stock' ? 'client' : 'stock';
      const clientId = allocationType === 'client' ? formData.clientId : null;
      
      const orderData = {
        bomId: formData.bomId,
        productSku: formData.productSku || selectedBom.productSku,
        productName: formData.productName || selectedBom.productName,
        quantity: quantity,
        quantityProduced: 0,
        status: formData.status || 'requested',
        priority: formData.priority || 'normal',
        assignedTo: formData.assignedTo || '',
        totalCost: totalCost,
        notes: formData.notes || '',
        workOrderNumber: workOrderNumber,
        stockLocationId: formData.stockLocationId,
        clientId: clientId,
        allocationType: allocationType,
        createdBy: user?.name || 'System'
      };

      // Only include date fields if they have values
      if (formData.startDate) orderData.startDate = formData.startDate;
      if (formData.targetDate) orderData.targetDate = formData.targetDate;

      const response = await safeCallAPI('createProductionOrder', orderData);
      
      if (response?.data?.order) {
        const updatedOrders = [...productionOrders, { ...response.data.order, id: response.data.order.id }];
        setProductionOrders(updatedOrders);
        localStorage.setItem('manufacturing_production_orders', JSON.stringify(updatedOrders));
        alert('Production order created successfully!');
      } else {
        console.warn('⚠️ No order in response:', response);
        alert('Production order created but response data incomplete. Please refresh to verify.');
      }

      setShowModal(false);
      setFormData({});
    } catch (error) {
      console.error('❌ Error saving production order:', error);
      alert(`Failed to save production order: ${error.message}`);
    }
  };

  const handleUpdateProductionOrder = async () => {
    try {
      const oldStatus = String(selectedItem.status || '').trim()
      const newStatus = String(formData.status || selectedItem.status || 'requested').trim()
      
      const orderData = {
        bomId: formData.bomId !== undefined ? formData.bomId : selectedItem.bomId,
        productSku: formData.productSku !== undefined ? formData.productSku : selectedItem.productSku,
        productName: formData.productName !== undefined ? formData.productName : selectedItem.productName,
        quantity: parseInt(formData.quantity) || selectedItem.quantity,
        quantityProduced: parseInt(formData.quantityProduced) || selectedItem.quantityProduced || 0,
        status: newStatus, // Explicitly set status
        priority: formData.priority !== undefined ? formData.priority : selectedItem.priority,
        startDate: formData.startDate || selectedItem.startDate,
        targetDate: formData.targetDate !== undefined ? formData.targetDate : selectedItem.targetDate,
        assignedTo: formData.assignedTo !== undefined ? formData.assignedTo : selectedItem.assignedTo,
        notes: formData.notes !== undefined ? formData.notes : selectedItem.notes,
        workOrderNumber: formData.workOrderNumber || selectedItem.workOrderNumber,
        stockLocationId: formData.stockLocationId !== undefined ? formData.stockLocationId : (selectedItem.stockLocationId || stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN')?.id),
        clientId: formData.clientId !== undefined ? formData.clientId : selectedItem.clientId,
        allocationType: formData.allocationType !== undefined ? formData.allocationType : selectedItem.allocationType,
        completedDate: newStatus === 'completed' ? new Date().toISOString().split('T')[0] : (selectedItem.completedDate || null)
      };


      const response = await safeCallAPI('updateProductionOrder', selectedItem.id, orderData);
      if (response?.data?.order) {
        const updatedOrders = productionOrders.map(order => 
          order.id === selectedItem.id ? response.data.order : order
        );
        setProductionOrders(updatedOrders);
        localStorage.setItem('manufacturing_production_orders', JSON.stringify(updatedOrders));
        
        // Always refresh inventory after production order update to show latest stock levels
        try {
          const inventoryResponse = await safeCallAPI('getInventory');
          if (inventoryResponse?.data?.inventory) {
            setInventory(inventoryResponse.data.inventory);
            localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryResponse.data.inventory));
          }
        } catch (invError) {
          console.error('⚠️ Failed to refresh inventory:', invError);
        }
        
        // Show warning if stock was insufficient
        if (response?.data?.stockWarnings && response.data.stockWarnings.length > 0) {
          const warnings = response.data.stockWarnings.map(w => 
            `${w.name}: Available ${w.available}, Required ${w.required} (Shortfall: ${w.shortfall})`
          ).join('\n');
          alert(`⚠️ Production order updated successfully!\n\nSome items are now in negative stock:\n${warnings}`);
        } else {
          alert('Production order updated successfully!');
        }
      }

      setShowModal(false);
      setSelectedItem(null);
      setFormData({});
    } catch (error) {
      console.error('Error updating production order:', error);
      alert('Failed to update production order. Please try again.');
    }
  };

  const addBomComponent = () => {
    setBomComponents([...bomComponents, {
      sku: '',
      name: '',
      quantity: 1,
      unit: 'pcs',
      unitCost: 0,
      totalCost: 0,
      location: ''
    }]);
  };

  const updateBomComponent = (index, field, value) => {
    const updated = [...bomComponents];
    updated[index][field] = value;
    
    // Auto-calculate total cost
    if (field === 'quantity' || field === 'unitCost') {
      updated[index].totalCost = updated[index].quantity * updated[index].unitCost;
    }
    
    // Auto-fill from inventory if SKU is selected
    if (field === 'sku') {
      const invItem = inventory.find(item => item.sku === value);
      if (invItem) {
        updated[index].name = invItem.name;
        updated[index].unit = invItem.unit;
        updated[index].unitCost = invItem.unitCost;
        updated[index].totalCost = updated[index].quantity * invItem.unitCost;
      }
    }
    
    setBomComponents(updated);
  };

  const removeBomComponent = (index) => {
    setBomComponents(bomComponents.filter((_, i) => i !== index));
  };

  const renderModal = () => {
    
    // Debug: Check if modal should be visible
    if (!showModal) {
      console.warn('⚠️ renderModal called but showModal is false');
      return null;
    }
    
    if (modalType === 'add_item' || modalType === 'edit_item') {
      // Resolve human-friendly location name for context in the modal
      const resolvedLocation = (() => {
        const explicitLoc = selectedLocationId && selectedLocationId !== 'all'
          ? stockLocations.find(loc => loc.id === selectedLocationId)
          : stockLocations.find(loc => loc.code === 'LOC001');
        if (explicitLoc) {
          return `${explicitLoc.name} (${explicitLoc.code})`;
        }
        if (selectedLocationId && selectedLocationId !== 'all') {
          return 'Selected location';
        }
        return 'Default location';
      })();

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {modalType === 'edit_item' ? 'Edit Inventory Item' : 'Add Inventory Item'}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  This item will be created for: <span className="font-medium text-gray-700">{resolvedLocation}</span>
                </p>
              </div>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* SKU - Read-only, auto-generated */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                  {modalType === 'edit_item' && formData.sku ? (
                    <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-mono">
                      {formData.sku}
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-500 italic">
                      Auto-generated (SKU0001, SKU0002, ...)
                    </div>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., GPS Module GT-U7"
                  />
                </div>

                {/* Supplier Part Numbers */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Part No.</label>
                  <div className="space-y-2">
                    {(() => {
                      try {
                        const supplierParts = typeof formData.supplierPartNumbers === 'string' 
                          ? JSON.parse(formData.supplierPartNumbers || '[]') 
                          : (formData.supplierPartNumbers || []);
                        return (
                          <>
                            {supplierParts.map((sp, idx) => (
                              <div key={idx} className="flex gap-2">
                                <select
                                  value={sp.supplier || ''}
                                  onChange={(e) => {
                                    const updated = [...supplierParts];
                                    updated[idx].supplier = e.target.value;
                                    setFormData({ ...formData, supplierPartNumbers: JSON.stringify(updated) });
                                  }}
                                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                  <option value="">Select supplier...</option>
                                  {suppliers.filter(s => s.status === 'active').map(supplier => (
                                    <option key={supplier.id} value={supplier.name}>
                                      {supplier.name} {supplier.code ? `(${supplier.code})` : ''}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="text"
                                  value={sp.partNumber || ''}
                                  onChange={(e) => {
                                    const updated = [...supplierParts];
                                    updated[idx].partNumber = e.target.value;
                                    setFormData({ ...formData, supplierPartNumbers: JSON.stringify(updated) });
                                  }}
                                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="Part number"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = supplierParts.filter((_, i) => i !== idx);
                                    setFormData({ ...formData, supplierPartNumbers: JSON.stringify(updated) });
                                  }}
                                  className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-300 rounded-lg"
                                  title="Remove"
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const currentParts = typeof formData.supplierPartNumbers === 'string' 
                                  ? JSON.parse(formData.supplierPartNumbers || '[]') 
                                  : (formData.supplierPartNumbers || []);
                                const updated = [...currentParts, { supplier: '', partNumber: '' }];
                                setFormData({ ...formData, supplierPartNumbers: JSON.stringify(updated) });
                              }}
                              className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                            >
                              <i className="fas fa-plus mr-1"></i>
                              Add Supplier Part Number
                            </button>
                          </>
                        );
                      } catch (e) {
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, supplierPartNumbers: JSON.stringify([{ supplier: '', partNumber: '' }]) });
                            }}
                            className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                          >
                            <i className="fas fa-plus mr-1"></i>
                            Add Supplier Part Number
                          </button>
                        );
                      }
                    })()}
                  </div>
                </div>

                {/* Manufacturing Part Number */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Part Number</label>
                  <input
                    type="text"
                    value={formData.manufacturingPartNumber || ''}
                    onChange={(e) => setFormData({ ...formData, manufacturingPartNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., MFG-PART-123"
                  />
                </div>

                {/* Abcotronics Part Number (Legacy) */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Abcotronics Part Number (Legacy)</label>
                  <input
                    type="text"
                    value={formData.legacyPartNumber || ''}
                    onChange={(e) => setFormData({ ...formData, legacyPartNumber: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., OLD-PART-123"
                  />
                </div>

                {/* Image / Thumbnail */
                }
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image / Thumbnail</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setFormData(prev => ({ ...prev, thumbnail: reader.result }));
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <input
                      type="url"
                      placeholder="Or paste image URL (https://...)"
                      value={formData.thumbnail || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, thumbnail: e.target.value }))}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const clip = await navigator.clipboard.readText();
                          if (clip) setFormData(prev => ({ ...prev, thumbnail: clip }));
                        } catch (_) {}
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200"
                    >
                      Paste
                    </button>
                  </div>
                  {formData.thumbnail && (
                    <div className="mt-2">
                      <img src={formData.thumbnail} alt="Preview" className="w-20 h-20 object-cover rounded border" />
                    </div>
                  )}
                </div>

                {/* Category - with create/delete functionality */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      {categories.length === 0 ? (
                        <option value="">No categories yet - Add one using the + button</option>
                      ) : (
                        <>
                          <option value="">Select a category...</option>
                          {/* Show current category if editing and it's not in the list (for backwards compatibility) */}
                          {formData.category && !categories.includes(formData.category) && (
                            <option value={formData.category}>
                              {formData.category.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')} (existing)
                            </option>
                          )}
                          {categories.map(cat => (
                            <option key={cat} value={cat}>
                              {cat.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowCategoryInput(!showCategoryInput)}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                      title="Add new category"
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                  </div>
                  {showCategoryInput && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="New category name..."
                      />
                      <button
                        type="button"
                        onClick={handleAddCategory}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCategoryInput(false); setNewCategoryName(''); }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type || 'component'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="component">Component</option>
                    <option value="final_product">Final Product</option>
                  </select>
                </div>

                {/* Quantity - Read-only for edits, editable for new items */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Starting Quantity {modalType === 'add_item' ? '*' : ''}
                  </label>
                  {modalType === 'edit_item' ? (
                    <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                      {formData.quantity || 0} {formData.unit || 'pcs'}
                      <span className="ml-2 text-xs text-gray-500 italic">
                        (Update via stock movements/purchase orders)
                      </span>
                    </div>
                  ) : (
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity === undefined || formData.quantity === null ? '' : formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Initial stock quantity"
                    />
                  )}
                </div>

                {/* Unit */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                  <select
                    value={formData.unit || 'pcs'}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="units">Units</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="m">Meters (m)</option>
                    <option value="l">Liters (l)</option>
                    <option value="box">Box</option>
                    <option value="set">Set</option>
                  </select>
                </div>

                {/* In-Production and Completed Quantities - Only for Final Products */}
                {formData.type === 'final_product' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        In-Production Units {modalType === 'add_item' ? '*' : ''}
                      </label>
                      {modalType === 'edit_item' ? (
                        <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                          {formData.inProductionQuantity || 0} {formData.unit || 'pcs'}
                          <span className="ml-2 text-xs text-gray-500 italic">
                            (Update via stock movements/production orders)
                          </span>
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={formData.inProductionQuantity === undefined || formData.inProductionQuantity === null ? '' : formData.inProductionQuantity}
                          onChange={(e) => setFormData({ ...formData, inProductionQuantity: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Units currently in production"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Completed Units {modalType === 'add_item' ? '*' : ''}
                      </label>
                      {modalType === 'edit_item' ? (
                        <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                          {formData.completedQuantity || 0} {formData.unit || 'pcs'}
                          <span className="ml-2 text-xs text-gray-500 italic">
                            (Update via stock movements/production orders)
                          </span>
                        </div>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          value={formData.completedQuantity === undefined || formData.completedQuantity === null ? '' : formData.completedQuantity}
                          onChange={(e) => setFormData({ ...formData, completedQuantity: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Units completed and ready"
                        />
                      )}
                    </div>
                  </>
                )}

                {/* Reorder Point */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    value={(formData.reorderPoint === undefined || formData.reorderPoint === null) ? '' : formData.reorderPoint}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Reorder Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Quantity</label>
                  <input
                    type="number"
                    value={(formData.reorderQty === undefined || formData.reorderQty === null) ? '' : formData.reorderQty}
                    onChange={(e) => setFormData({ ...formData, reorderQty: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Unit Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (R) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={(formData.unitCost === undefined || formData.unitCost === null) ? '' : formData.unitCost}
                    onChange={(e) => setFormData({ ...formData, unitCost: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Supplier */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.supplier || ''}
                      onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select supplier...</option>
                      {suppliers.filter(s => s.status === 'active').map(supplier => (
                        <option key={supplier.id} value={supplier.name}>{supplier.name} {supplier.code ? `(${supplier.code})` : ''}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        changeTab('suppliers');
                        setTimeout(() => openAddSupplierModal(), 100);
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                      title="Add new supplier"
                    >
                      <i className="fas fa-plus"></i>
                    </button>
                  </div>
                </div>

                {/* Status - Auto-calculated, read-only */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700">
                    {modalType === 'edit_item' ? (
                      <>
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(formData.status || 'in_stock')}`}>
                          {formData.status === 'in_stock' ? 'In Stock' : 
                           formData.status === 'low_stock' ? 'Low Stock' : 
                           formData.status === 'out_of_stock' ? 'Out of Stock' : 
                           formData.status === 'in_production' ? 'In Production' : 
                           formData.status || 'In Stock'}
                        </span>
                        <span className="ml-2 text-xs text-gray-500 italic">(Auto-calculated)</span>
                      </>
                    ) : (
                      <span className="text-gray-500 italic">Will be calculated based on quantity and reorder point</span>
                    )}
                  </div>
                </div>

                {/* Total Value (Calculated) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Value</label>
                  <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-900 font-semibold">
                    {formatCurrency((formData.quantity || 0) * (formData.unitCost || 0))}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between bg-gray-50">
              <div>
                {modalType === 'edit_item' && (
                  <button
                    onClick={() => handleDeleteItem(selectedItem)}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Delete Item
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveItem}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {modalType === 'edit_item' ? 'Update Item' : 'Add Item'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'add_bom' || modalType === 'edit_bom') {
      const totalMaterialCost = bomComponents.reduce((sum, comp) => sum + comp.totalCost, 0);
      const totalCost = totalMaterialCost + parseFloat(formData.laborCost || 0) + parseFloat(formData.overheadCost || 0);

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'edit_bom' ? 'Edit Bill of Materials' : 'Create Bill of Materials'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); setBomComponents([]); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* IMPORTANT: Select Finished Product Inventory Item First */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-2 mb-3">
                  <i className="fas fa-info-circle text-blue-600 text-sm mt-0.5"></i>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-blue-900 mb-1">Select Finished Product Inventory Item *</p>
                    <p className="text-xs text-blue-700">
                      Every BOM must be linked to a final product inventory item. If you haven't created the final product yet, 
                      go to the Inventory tab and create it first (set type to "Final Product").
                    </p>
                    {/* Debug info */}
                    {process.env.NODE_ENV === 'development' && (
                      <p className="text-xs text-gray-500 mt-1">
                        Debug: {inventory.length} inventory items loaded
                      </p>
                    )}
                  </div>
                </div>
                {inventory.length === 0 ? (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 mb-2">
                      <i className="fas fa-exclamation-triangle mr-2"></i>
                      No inventory items found. Please create inventory items first.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        changeTab('inventory');
                        setTimeout(() => openAddItemModal(), 100);
                      }}
                      className="text-sm text-yellow-900 underline hover:no-underline"
                    >
                      Go to Inventory tab to create items →
                    </button>
                  </div>
                ) : (
                  <>
                    <select
                      value={formData.inventoryItemId || ''}
                      onChange={(e) => {
                        const selectedItem = inventory.find(item => item.id === e.target.value);
                        if (selectedItem) {
                          setFormData({
                            ...formData,
                            inventoryItemId: selectedItem.id,
                            productSku: selectedItem.sku,
                            productName: selectedItem.name
                          });
                        } else {
                          setFormData({ ...formData, inventoryItemId: '' });
                        }
                      }}
                      className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white ${
                        !formData.inventoryItemId 
                          ? 'border-red-400 focus:ring-red-500 focus:border-red-400' 
                          : 'border-blue-300'
                      }`}
                      required
                    >
                      <option value="">-- Select finished product inventory item --</option>
                      {(() => {
                        // Debug: Log inventory state
                        
                        // More flexible filtering - show final products first, then all items as fallback
                        const finalProducts = inventory.filter(item => {
                          const typeMatch = item.type === 'final_product';
                          const categoryMatch = item.category === 'finished_goods';
                          return typeMatch || categoryMatch;
                        });
                        
                        // If no final products found, show ALL inventory items (user can link any item)
                        const itemsToShow = finalProducts.length > 0 ? finalProducts : inventory;
                        
                        if (finalProducts.length === 0 && inventory.length > 0) {
                          console.warn('⚠️ No items with type="final_product" found. Showing all items as fallback.');
                        }
                        
                        if (itemsToShow.length === 0) {
                          return (
                            <option value="" disabled>No inventory items available</option>
                          );
                        }
                        
                        return itemsToShow.map(item => {
                          const isFinalProduct = finalProducts.find(fp => fp.id === item.id);
                          return (
                            <option key={item.id} value={item.id}>
                              {item.sku} - {item.name}
                              {!isFinalProduct && finalProducts.length > 0 
                                ? ' (⚠️ Set type to "Final Product" in Inventory)' 
                                : finalProducts.length === 0 
                                  ? ' (✅ All items shown - update type in Inventory to "Final Product")'
                                  : ''}
                            </option>
                          );
                        });
                      })()}
                    </select>
                    {inventory.filter(item => item.type === 'final_product').length === 0 && inventory.length > 0 && (
                      <div className="mt-2 text-xs text-yellow-600 flex items-start gap-1">
                        <i className="fas fa-exclamation-triangle mt-0.5"></i>
                        <div>
                          <p className="font-medium">No final products found</p>
                          <p className="mt-1">Showing all items as fallback. To mark an item as final product:</p>
                          <p className="mt-1">1. Go to Inventory tab</p>
                          <p className="ml-4">2. Edit the item</p>
                          <p className="ml-4">3. Set Type to "Final Product"</p>
                        </div>
                      </div>
                    )}
                    {!formData.inventoryItemId && (
                      <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                        <i className="fas fa-exclamation-circle"></i>
                        <span>You must select a finished product inventory item before creating the BOM</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* BOM Header */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product SKU *</label>
                  <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-mono">
                    {formData.productSku || getNextPSKU()}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Auto-filled from selected inventory item</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    value={formData.productName || ''}
                    onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Device Basic v1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Auto-filled from selected inventory item</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
                  <input
                    type="date"
                    value={formData.effectiveDate || ''}
                    onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Labor Cost (R)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.laborCost || 0}
                    onChange={(e) => setFormData({ ...formData, laborCost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Overhead Cost (R)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.overheadCost || 0}
                    onChange={(e) => setFormData({ ...formData, overheadCost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Time (minutes)</label>
                  <input
                    type="number"
                    value={formData.estimatedTime || 0}
                    onChange={(e) => setFormData({ ...formData, estimatedTime: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {/* Image and Instructions Upload Section */}
              <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-4">
                {/* Product Thumbnail Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Thumbnail</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setFormData(prev => ({ ...prev, thumbnail: reader.result }));
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-sm"
                  />
                  <div className="mt-2 flex gap-2">
                    <input
                      type="url"
                      placeholder="Or paste image URL (https://...)"
                      value={formData.thumbnail || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, thumbnail: e.target.value }))}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const clip = await navigator.clipboard.readText();
                          if (clip) setFormData(prev => ({ ...prev, thumbnail: clip }));
                        } catch (_) {}
                      }}
                      className="px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200"
                    >
                      Paste
                    </button>
                  </div>
                  {formData.thumbnail && (
                    <div className="mt-2">
                      <img src={formData.thumbnail} alt="Thumbnail Preview" className="w-20 h-20 object-cover rounded border" />
                    </div>
                  )}
                </div>

                {/* Instructions Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product Instructions</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.md"
                    onChange={(e) => {
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setFormData(prev => ({ ...prev, instructions: reader.result }));
                      };
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-sm"
                  />
                  <div className="mt-2">
                    <input
                      type="url"
                      placeholder="Or paste instructions URL (https://...)"
                      value={formData.instructions || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {formData.instructions && (
                    <div className="mt-2 text-xs text-gray-600">
                      <i className="fas fa-file-alt mr-1"></i>
                      Instructions file/URL added
                    </div>
                  )}
                </div>
              </div>

              {/* Components Section */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Components</h3>
                  <button
                    onClick={addBomComponent}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <i className="fas fa-plus text-xs"></i>
                    Add Component
                  </button>
                </div>

                {bomComponents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No components added yet. Click "Add Component" to start.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bomComponents.map((comp, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 items-end">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">SKU / Select from Inventory</label>
                          <select
                            value={comp.sku}
                            onChange={(e) => updateBomComponent(index, 'sku', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select or type...</option>
                            {inventory.filter(item => item.type === 'component').map(item => (
                              <option key={item.sku} value={item.sku}>{item.sku} - {item.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Component Name</label>
                          <input
                            type="text"
                            value={comp.name}
                            onChange={(e) => updateBomComponent(index, 'name', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Name"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Component Location</label>
                          <input
                            type="text"
                            value={comp.location || ''}
                            onChange={(e) => updateBomComponent(index, 'location', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="e.g., A1-B2"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            step="0.01"
                            value={comp.quantity}
                            onChange={(e) => updateBomComponent(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                          <input
                            type="text"
                            value={comp.unit}
                            onChange={(e) => updateBomComponent(index, 'unit', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Unit Cost (R)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={comp.unitCost}
                            onChange={(e) => updateBomComponent(index, 'unitCost', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-2 flex items-center">
                          <div className="w-full text-right">
                            <span className="text-xs text-gray-500">Total: </span>
                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(comp.totalCost)}</span>
                          </div>
                        </div>
                        <div className="col-span-1 flex items-center justify-center">
                          <button
                            onClick={() => removeBomComponent(index)}
                            className="px-2 py-1.5 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200"
                            title="Remove"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cost Summary */}
              <div className="border-t border-gray-200 pt-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs text-gray-600">Material Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(totalMaterialCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Labor Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(formData.laborCost || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Overhead Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(formData.overheadCost || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total Cost per Unit</p>
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(totalCost)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Additional notes about this BOM..."
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between bg-gray-50">
              <div>
                {modalType === 'edit_bom' && (
                  <button
                    onClick={() => handleDeleteBom(selectedItem.id)}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Delete BOM
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); setBomComponents([]); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBom}
                  className={`px-4 py-2 text-sm rounded-lg ${
                    bomComponents.length === 0 || !formData.inventoryItemId
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                  disabled={bomComponents.length === 0 || !formData.inventoryItemId}
                  title={!formData.inventoryItemId ? 'Please select a finished product inventory item first' : bomComponents.length === 0 ? 'Please add at least one component' : ''}
                >
                  {modalType === 'edit_bom' ? 'Update BOM' : 'Create BOM'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'view_item') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Inventory Item Details</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {selectedItem && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">SKU</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.sku}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(selectedItem.status)}`}>
                        {(selectedItem.status || '').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Item Name</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Category</p>
                      <p className="text-sm text-gray-900 capitalize">
                        {selectedItem.category ? selectedItem.category.replace('_', ' ') : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Type</p>
                      <p className="text-sm text-gray-900 capitalize">
                        {(selectedItem.type || '').replace('_', ' ')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Quantity</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.quantity} {selectedItem.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Location</p>
                      <p className="text-sm text-gray-900">{selectedItem.location}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Reorder Point</p>
                      <p className="text-sm text-gray-900">{selectedItem.reorderPoint} {selectedItem.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Reorder Quantity</p>
                      <p className="text-sm text-gray-900">{selectedItem.reorderQty} {selectedItem.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Unit Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedItem.unitCost)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total Value</p>
                      <p className="text-sm font-semibold text-blue-600">{formatCurrency(selectedItem.totalValue)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Supplier</p>
                      <p className="text-sm text-gray-900">{selectedItem.supplier}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Manufacturing Part Number</p>
                      <p className="text-sm text-gray-900">{selectedItem.manufacturingPartNumber || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Last Restocked</p>
                      <p className="text-sm text-gray-900">{selectedItem.lastRestocked}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => openEditItemModal(selectedItem)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit Item
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'add_production' || modalType === 'edit_production') {
      const selectedBom = formData.bomId ? boms.find(b => b.id === formData.bomId) : null;
      const totalCost = selectedBom ? selectedBom.totalCost * (formData.quantity || 0) : 0;
      
      // Debug form state

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'add_production' ? 'New Production Order' : 'Edit Production Order'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {/* Production Order Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Production Order Number</label>
                  <div className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-mono">
                    {formData.workOrderNumber || getNextWorkOrderNumber()}
                  </div>
                </div>

                {/* Select BOM/Product */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select Product (BOM) *</label>
                  {boms.filter(b => b.status === 'active').length === 0 ? (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <i className="fas fa-exclamation-triangle text-yellow-600 text-sm mt-0.5"></i>
                        <div>
                          <p className="text-sm font-medium text-yellow-900">No Active BOMs Available</p>
                          <p className="text-xs text-yellow-700 mt-1">
                            You need to create a Bill of Materials (BOM) first. Go to the "Bill of Materials" tab to create one.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={formData.bomId || ''}
                      onChange={(e) => {
                        const selectedBom = boms.find(b => b.id === e.target.value);
                        if (selectedBom) {
                          setFormData({
                            ...formData,
                            bomId: selectedBom.id,
                            productSku: selectedBom.productSku,
                            productName: selectedBom.productName
                          });
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    >
                      <option value="">Select a product...</option>
                      {boms.filter(b => b.status === 'active').map(bom => (
                        <option key={bom.id} value={bom.id}>
                          {bom.productSku} - {bom.productName} (Cost: {formatCurrency(bom.totalCost)}/unit)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Production Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quantity to Produce *</label>
                    <input
                      type="number"
                      value={formData.quantity || ''}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="1"
                      disabled={false}
                      placeholder="Enter quantity"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={formData.priority || 'normal'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={formData.startDate || ''}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value || null })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Completion Date</label>
                    <input
                      type="date"
                      value={formData.targetDate || ''}
                      onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status || 'requested'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    >
                      <option value="requested">Requested</option>
                      <option value="in_production">In Production</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Stock Location *</label>
                    <select
                      value={formData.stockLocationId || (stockLocations.find(loc => loc.name === 'Main Warehouse' || loc.code === 'LOC001' || loc.code === 'WH-MAIN')?.id || '')}
                      onChange={(e) => setFormData({ ...formData, stockLocationId: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    >
                      <option value="">Select a stock location...</option>
                      {stockLocations.filter(loc => loc.status === 'active').map(location => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({location.code})
                        </option>
                      ))}
                    </select>
                    {stockLocations.length === 0 && (
                      <p className="text-xs text-gray-500 mt-1">No stock locations available. Please create one in the Stock Locations tab.</p>
                    )}
                  </div>

                  {modalType === 'edit_production' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantity Produced</label>
                      <input
                        type="number"
                        value={formData.quantityProduced || 0}
                        onChange={(e) => setFormData({ ...formData, quantityProduced: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        min="0"
                        max={formData.quantity || 0}
                      />
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes or instructions..."
                    disabled={formData.status === 'completed'}
                  />
                </div>

                {/* Cost Summary */}
                {selectedBom && formData.quantity > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Unit Cost</p>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedBom.totalCost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Quantity</p>
                          <p className="text-sm font-semibold text-gray-900">{formData.quantity} units</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Total Production Cost</p>
                          <p className="text-lg font-bold text-blue-600">{formatCurrency(totalCost)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modalType === 'add_production') {
                    handleSaveProductionOrder();
                  } else if (modalType === 'edit_production') {
                    handleUpdateProductionOrder();
                  }
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {modalType === 'add_production' ? 'Create Production Order' : 'Update Order'}
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'view_bom') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">BOM Details</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {selectedItem && (
                <div className="space-y-4">
                  {/* Product Thumbnail and Instructions Section */}
                  {(selectedItem.thumbnail || selectedItem.instructions) && (
                    <div className="grid grid-cols-2 gap-4 border-b border-gray-200 pb-4">
                      {/* Thumbnail */}
                      {selectedItem.thumbnail && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Product Thumbnail</p>
                          <div className="relative">
                            <img 
                              src={selectedItem.thumbnail} 
                              alt={selectedItem.productName} 
                              className="w-full max-w-xs h-48 object-contain border border-gray-200 rounded-lg bg-gray-50"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = 'flex';
                                }
                              }}
                            />
                            <div className="w-full max-w-xs h-48 border border-gray-200 rounded-lg bg-gray-50 hidden items-center justify-center text-gray-400">
                              <div className="text-center">
                                <i className="fas fa-image text-3xl mb-2"></i>
                                <p className="text-xs">Image not available</p>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                const img = new Image();
                                img.src = selectedItem.thumbnail;
                                const w = window.open();
                                w.document.write(`<img src="${selectedItem.thumbnail}" style="max-width: 100%; height: auto;" />`);
                              }}
                              className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                              title="View full size"
                            >
                              <i className="fas fa-expand"></i>
                              View Full Size
                            </button>
                          </div>
                        </div>
                      )}
                      
                      {/* Instructions */}
                      {selectedItem.instructions && (
                        <div>
                          <p className="text-xs text-gray-500 mb-2">Product Instructions</p>
                          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                            <div className="flex items-center gap-2 mb-2">
                              <i className="fas fa-file-alt text-blue-600"></i>
                              <span className="text-sm font-medium text-gray-900">Instructions Available</span>
                            </div>
                            {selectedItem.instructions.startsWith('data:') ? (
                              <div className="space-y-2">
                                <p className="text-xs text-gray-600">File uploaded as base64</p>
                                <button
                                  onClick={() => {
                                    // Convert data URL to blob and download
                                    const link = document.createElement('a');
                                    link.href = selectedItem.instructions;
                                    link.download = `${selectedItem.productSku || 'bom'}_instructions.pdf`;
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  }}
                                  className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                                >
                                  <i className="fas fa-download"></i>
                                  Download Instructions
                                </button>
                              </div>
                            ) : (
                              <a
                                href={selectedItem.instructions}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                              >
                                <i className="fas fa-external-link-alt"></i>
                                Open Instructions
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">BOM ID</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedItem.status)}`}>
                        {selectedItem.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Product SKU</p>
                      <p className="text-sm text-gray-900">{selectedItem.productSku}</p>
                    </div>
                    {selectedItem.version && (
                      <div>
                        <p className="text-xs text-gray-500">Version</p>
                        <p className="text-sm text-gray-900">{selectedItem.version}</p>
                      </div>
                    )}
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Product Name</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.productName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Effective Date</p>
                      <p className="text-sm text-gray-900">{selectedItem.effectiveDate}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Estimated Time</p>
                      <p className="text-sm text-gray-900">{selectedItem.estimatedTime} minutes</p>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Components</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Component</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Location</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedItem.components.map((comp, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-sm text-gray-900">{comp.sku}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{comp.name}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{comp.location || '-'}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-900">{comp.quantity} {comp.unit}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-900">{formatCurrency(comp.unitCost)}</td>
                              <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">{formatCurrency(comp.totalCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-gray-600">Material Cost</p>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedItem.totalMaterialCost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Labor Cost</p>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedItem.laborCost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Overhead Cost</p>
                          <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedItem.overheadCost)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">Total Cost per Unit</p>
                          <p className="text-lg font-bold text-blue-600">{formatCurrency(selectedItem.totalCost)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {selectedItem.notes && (
                    <div className="border-t border-gray-200 pt-4">
                      <p className="text-xs text-gray-500">Notes</p>
                      <p className="text-sm text-gray-900 mt-1">{selectedItem.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => openEditBomModal(selectedItem)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit BOM
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'add_supplier' || modalType === 'edit_supplier') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'edit_supplier' ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Supplier Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., TechSupply SA"
                  />
                </div>

                {/* Supplier Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Code</label>
                  <input
                    type="text"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., TSS001"
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contactPerson || ''}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., John Doe"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="supplier@example.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+27 11 123 4567"
                  />
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website || ''}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://www.example.com"
                  />
                </div>

                {/* Payment Terms */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
                  <select
                    value={formData.paymentTerms || 'Net 30'}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="Net 15">Net 15</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Net 45">Net 45</option>
                    <option value="Net 60">Net 60</option>
                    <option value="Due on Receipt">Due on Receipt</option>
                    <option value="Prepaid">Prepaid</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                {/* Address */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <textarea
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Street address, City, Province, Postal Code"
                  />
                </div>

                {/* Notes */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes about this supplier..."
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between bg-gray-50">
              <div>
                {modalType === 'edit_supplier' && (
                  <button
                    onClick={() => handleDeleteSupplier(selectedItem.id)}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Delete Supplier
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSupplier}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={!formData.name}
                >
                  {modalType === 'edit_supplier' ? 'Update Supplier' : 'Add Supplier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'add_movement') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">Record Stock Movement</h2>
              <button
                onClick={() => { setShowModal(false); setFormData({}); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {/* Movement Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Movement Type *</label>
                  <select
                    value={formData.type || 'receipt'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="receipt">Receipt (Incoming Stock)</option>
                    <option value="consumption">Consumption (Outgoing Stock)</option>
                    <option value="production">Production</option>
                    <option value="transfer">Transfer</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
                  <select
                    value={formData.sku || ''}
                    onChange={(e) => {
                      const selectedItem = inventory.find(item => item.sku === e.target.value);
                      setFormData({ 
                        ...formData, 
                        sku: e.target.value,
                        itemName: selectedItem ? selectedItem.name : formData.itemName
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select SKU...</option>
                    {inventory.map(item => (
                      <option key={item.sku} value={item.sku}>{item.sku} - {item.name}</option>
                    ))}
                  </select>
                </div>

                {/* Item Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input
                    type="text"
                    value={formData.itemName || ''}
                    onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., GPS Module GT-U7"
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity *
                    {formData.type === 'adjustment' && (
                      <span className="text-xs font-normal text-gray-500 ml-2">(Negative values allowed)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.quantity || ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Allow empty string, negative values, and positive values
                      setFormData({ ...formData, quantity: value });
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder={formData.type === 'adjustment' ? "±10 (use negative for reductions)" : "10"}
                  />
                </div>

                {/* Unit Cost (for receipts) */}
                {(formData.type === 'receipt' || formData.type === 'production') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (R)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.unitCost || ''}
                      onChange={(e) => setFormData({ ...formData, unitCost: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* Locations */}
                <div className="grid grid-cols-2 gap-4">
                  {(formData.type === 'transfer' || formData.type === 'consumption') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">From Location</label>
                      <input
                        type="text"
                        value={formData.fromLocation || ''}
                        onChange={(e) => setFormData({ ...formData, fromLocation: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Warehouse A"
                      />
                    </div>
                  )}
                  {(formData.type === 'transfer' || formData.type === 'receipt' || formData.type === 'production') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">To Location</label>
                      <input
                        type="text"
                        value={formData.toLocation || ''}
                        onChange={(e) => setFormData({ ...formData, toLocation: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Warehouse B"
                      />
                    </div>
                  )}
                </div>

                {/* Reference */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={formData.reference || ''}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., PO-12345, Invoice #789"
                  />
                </div>

                {/* Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formData.date || new Date().toISOString().split('T')[0]}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes about this movement..."
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex items-center justify-end gap-3 sticky bottom-0 bg-white">
              <button
                onClick={() => { setShowModal(false); setFormData({}); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMovement}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Record Movement
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'view_supplier') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Supplier Details</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {selectedItem && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Supplier Name</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedItem.status)}`}>
                        {selectedItem.status}
                      </span>
                    </div>
                    {selectedItem.code && (
                      <div>
                        <p className="text-xs text-gray-500">Supplier Code</p>
                        <p className="text-sm text-gray-900">{selectedItem.code}</p>
                      </div>
                    )}
                    {selectedItem.contactPerson && (
                      <div>
                        <p className="text-xs text-gray-500">Contact Person</p>
                        <p className="text-sm text-gray-900">{selectedItem.contactPerson}</p>
                      </div>
                    )}
                    {selectedItem.email && (
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-sm text-gray-900">{selectedItem.email}</p>
                      </div>
                    )}
                    {selectedItem.phone && (
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="text-sm text-gray-900">{selectedItem.phone}</p>
                      </div>
                    )}
                    {selectedItem.website && (
                      <div>
                        <p className="text-xs text-gray-500">Website</p>
                        <a href={selectedItem.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                          {selectedItem.website}
                        </a>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Payment Terms</p>
                      <p className="text-sm text-gray-900">{selectedItem.paymentTerms || 'Net 30'}</p>
                    </div>
                    {selectedItem.address && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">Address</p>
                        <p className="text-sm text-gray-900">{selectedItem.address}</p>
                      </div>
                    )}
                    {selectedItem.notes && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">Notes</p>
                        <p className="text-sm text-gray-900">{selectedItem.notes}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Created</p>
                      <p className="text-sm text-gray-900">{selectedItem.createdAt}</p>
                    </div>
                    {selectedItem.updatedAt && (
                      <div>
                        <p className="text-xs text-gray-500">Last Updated</p>
                        <p className="text-sm text-gray-900">{selectedItem.updatedAt}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => openEditSupplierModal(selectedItem)}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Edit Supplier
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'view_purchase') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Purchase Order Details</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {selectedItem && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Order Number</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.orderNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(selectedItem.status)}`}>
                        {(selectedItem.status || '').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Supplier</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.supplierName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Order Date</p>
                      <p className="text-sm text-gray-900">{selectedItem.orderDate || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Expected Date</p>
                      <p className="text-sm text-gray-900">{selectedItem.expectedDate || '-'}</p>
                    </div>
                    {selectedItem.receivedDate && (
                      <div>
                        <p className="text-xs text-gray-500">Received Date</p>
                        <p className="text-sm text-green-600">{selectedItem.receivedDate}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Priority</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        selectedItem.priority === 'high' ? 'text-red-600 bg-red-50' : 
                        selectedItem.priority === 'normal' ? 'text-blue-600 bg-blue-50' : 
                        'text-gray-600 bg-gray-50'
                      }`}>
                        {selectedItem.priority}
                      </span>
                    </div>
                    {selectedItem.toLocation && (
                      <div>
                        <p className="text-xs text-gray-500">Receiving Location</p>
                        <p className="text-sm text-gray-900">{selectedItem.toLocation}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Subtotal</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedItem.subtotal || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Tax</p>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedItem.tax || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(selectedItem.total || 0)}</p>
                    </div>
                  </div>

                  {/* Items List */}
                  {selectedItem.items && (
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Items</h3>
                      {(() => {
                        const items = typeof selectedItem.items === 'string' ? JSON.parse(selectedItem.items || '[]') : (selectedItem.items || []);
                        return items.length > 0 ? (
                          <div className="space-y-2">
                            {items.map((item, idx) => (
                              <div key={idx} className="border border-gray-200 rounded-lg p-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{item.name || item.itemName}</p>
                                    <p className="text-xs text-gray-500">SKU: {item.sku || '-'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-gray-900">Qty: {item.quantity}</p>
                                    <p className="text-xs text-gray-500">{formatCurrency(item.total || item.unitPrice * item.quantity)}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No items in this order</p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Notes */}
                  {(selectedItem.notes || selectedItem.internalNotes) && (
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
                      {selectedItem.notes && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-500">Order Notes</p>
                          <p className="text-sm text-gray-900">{selectedItem.notes}</p>
                        </div>
                      )}
                      {selectedItem.internalNotes && (
                        <div>
                          <p className="text-xs text-gray-500">Internal Notes</p>
                          <p className="text-sm text-gray-900">{selectedItem.internalNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    // VIEW SALES ORDER
    if (modalType === 'view_sales') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Sales Order Details</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {selectedItem && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Order Number</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.orderNumber}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(selectedItem.status)}`}>
                        {(selectedItem.status || '').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Client</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.clientName || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Order Date</p>
                      <p className="text-sm text-gray-900">{selectedItem.orderDate ? selectedItem.orderDate.split('T')[0] : '-'}</p>
                    </div>
                    {selectedItem.requiredDate && (
                      <div>
                        <p className="text-xs text-gray-500">Required Date</p>
                        <p className="text-sm text-gray-900">{selectedItem.requiredDate.split('T')[0]}</p>
                      </div>
                    )}
                    {selectedItem.shippedDate && (
                      <div>
                        <p className="text-xs text-gray-500">Shipped Date</p>
                        <p className="text-sm text-green-600">{selectedItem.shippedDate.split('T')[0]}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500">Priority</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${
                        selectedItem.priority === 'high' ? 'text-red-600 bg-red-50' : 
                        selectedItem.priority === 'normal' ? 'text-blue-600 bg-blue-50' : 
                        'text-gray-600 bg-gray-50'
                      }`}>
                        {selectedItem.priority}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Subtotal</p>
                      <p className="text-sm font-semibold text-gray-900">{formatCurrency(selectedItem.subtotal || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Tax</p>
                      <p className="text-sm text-gray-900">{formatCurrency(selectedItem.tax || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="text-lg font-bold text-blue-600">{formatCurrency(selectedItem.total || 0)}</p>
                    </div>
                  </div>

                  {/* Items List */}
                  {selectedItem.items && (
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Items</h3>
                      {(() => {
                        const items = typeof selectedItem.items === 'string' ? JSON.parse(selectedItem.items || '[]') : (selectedItem.items || []);
                        return items.length > 0 ? (
                          <div className="space-y-2">
                            {items.map((item, idx) => (
                              <div key={idx} className="border border-gray-200 rounded-lg p-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">{item.name || item.itemName}</p>
                                    <p className="text-xs text-gray-500">SKU: {item.sku || '-'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-gray-900">Qty: {item.quantity}</p>
                                    <p className="text-xs text-gray-500">{formatCurrency(item.total || (item.unitPrice * item.quantity))}</p>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No items in this order</p>
                        );
                      })()}
                    </div>
                  )}

                  {/* Shipping Info */}
                  {(selectedItem.shippingAddress || selectedItem.shippingMethod) && (
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Shipping Information</h3>
                      {selectedItem.shippingAddress && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-500">Shipping Address</p>
                          <p className="text-sm text-gray-900">{selectedItem.shippingAddress}</p>
                        </div>
                      )}
                      {selectedItem.shippingMethod && (
                        <div>
                          <p className="text-xs text-gray-500">Shipping Method</p>
                          <p className="text-sm text-gray-900">{selectedItem.shippingMethod}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {(selectedItem.notes || selectedItem.internalNotes) && (
                    <div className="border-t border-gray-200 pt-4">
                      <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
                      {selectedItem.notes && (
                        <div className="mb-2">
                          <p className="text-xs text-gray-500">Order Notes</p>
                          <p className="text-sm text-gray-900">{selectedItem.notes}</p>
                        </div>
                      )}
                      {selectedItem.internalNotes && (
                        <div>
                          <p className="text-xs text-gray-500">Internal Notes</p>
                          <p className="text-sm text-gray-900">{selectedItem.internalNotes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ADD SALES ORDER
    if (modalType === 'add_sales') {
      // Calculate totals from items
      const subtotal = salesOrderItems.reduce((sum, item) => sum + (item.total || 0), 0);
      const tax = formData.tax || 0;
      const total = subtotal + tax;

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">New Sales Order</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); setSalesOrderItems([]); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {/* Client Selection - Sale to Client */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sale to Client *</label>
                  <select
                    value={formData.clientId || ''}
                    onChange={(e) => {
                      const selectedClient = clients.find(c => c.id === e.target.value);
                      if (selectedClient) {
                        // Parse client sites with error handling
                        let clientSites = [];
                        try {
                          if (typeof selectedClient.sites === 'string') {
                            clientSites = JSON.parse(selectedClient.sites || '[]');
                          } else if (Array.isArray(selectedClient.sites)) {
                            clientSites = selectedClient.sites;
                          }
                        } catch (parseError) {
                          console.warn('⚠️ Failed to parse client sites:', parseError);
                          clientSites = [];
                        }
                        
                        // Ensure clientSites is an array
                        if (!Array.isArray(clientSites)) {
                          clientSites = [];
                        }
                        
                        // Auto-populate shipping address from client address
                        const defaultShippingAddress = selectedClient.address || '';
                        
                        setFormData({
                          ...formData,
                          clientId: e.target.value,
                          clientName: selectedClient.name || '',
                          clientAddress: selectedClient.address || '',
                          clientSites: clientSites,
                          clientSiteId: '', // Reset site selection when client changes
                          clientSiteName: '',
                          shippingAddress: defaultShippingAddress // Auto-populate with client address
                        });
                      } else {
                        setFormData({
                          ...formData,
                          clientId: e.target.value,
                          clientName: '',
                          clientAddress: '',
                          clientSites: [],
                          clientSiteId: '',
                          clientSiteName: '',
                          shippingAddress: ''
                        });
                      }
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a client...</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">This sales order will be sold to the selected client</p>
                </div>

                {/* Client Site Selection - Only show if client has sites */}
                {formData.clientId && formData.clientSites && Array.isArray(formData.clientSites) && formData.clientSites.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Client Site (Optional)</label>
                    <select
                      value={formData.clientSiteId || ''}
                      onChange={(e) => {
                        if (!e.target.value) {
                          // Reset to client address if "No site" is selected
                          setFormData({
                            ...formData,
                            clientSiteId: '',
                            clientSiteName: '',
                            shippingAddress: formData.clientAddress || ''
                          });
                          return;
                        }
                        
                        // Find the selected site by index (since we use index as value)
                        const siteIndex = parseInt(e.target.value, 10);
                        const selectedSite = formData.clientSites[siteIndex];
                        
                        if (selectedSite) {
                          const siteAddress = typeof selectedSite === 'object' ? selectedSite.address || '' : '';
                          const siteName = typeof selectedSite === 'object' ? selectedSite.name || `Site ${siteIndex + 1}` : String(selectedSite);
                          const siteId = typeof selectedSite === 'object' && selectedSite.id ? selectedSite.id : String(siteIndex);
                          
                          setFormData({
                            ...formData,
                            clientSiteId: siteId,
                            clientSiteName: siteName,
                            shippingAddress: siteAddress || formData.clientAddress || '' // Use site address, fallback to client address
                          });
                        }
                      }}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">No specific site (use client address)</option>
                      {formData.clientSites.map((site, index) => {
                        const siteName = typeof site === 'object' ? site.name || `Site ${index + 1}` : String(site);
                        return (
                          <option key={index} value={String(index)}>{siteName}</option>
                        );
                      })}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Select a specific site for this order. Shipping address will be updated automatically.</p>
                  </div>
                )}

                {/* Order Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Date *</label>
                    <input
                      type="date"
                      value={formData.orderDate || ''}
                      onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Required Date</label>
                    <input
                      type="date"
                      value={formData.requiredDate || ''}
                      onChange={(e) => setFormData({ ...formData, requiredDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={formData.priority || 'normal'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                {/* Order Items Section */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Items</h3>
                  
                  {/* Add Item Form */}
                  <div className="grid grid-cols-12 gap-2 mb-3">
                    <div className="col-span-4">
                      <select
                        value={newSalesOrderItem.sku}
                        onChange={(e) => {
                          const sku = e.target.value;
                          const invItem = inventory.find(item => item.sku === sku || item.id === sku);
                          setNewSalesOrderItem({
                            ...newSalesOrderItem,
                            sku: sku,
                            name: invItem ? invItem.name : newSalesOrderItem.name
                          });
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select from inventory</option>
                        {inventory.map(item => (
                          <option key={item.id || item.sku} value={item.sku || item.id}>
                            {item.name} ({item.sku || item.id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input
                        type="text"
                        value={newSalesOrderItem.name}
                        onChange={(e) => setNewSalesOrderItem({ ...newSalesOrderItem, name: e.target.value })}
                        placeholder="Item Name *"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={newSalesOrderItem.quantity || ''}
                        onChange={(e) => setNewSalesOrderItem({ ...newSalesOrderItem, quantity: parseFloat(e.target.value) || 0 })}
                        placeholder="Qty"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <button
                        type="button"
                        onClick={handleAddSalesOrderItem}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        <i className="fas fa-plus"></i>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newSalesOrderItem.unitPrice || ''}
                      onChange={(e) => setNewSalesOrderItem({ ...newSalesOrderItem, unitPrice: parseFloat(e.target.value) || 0 })}
                      placeholder="Unit Price *"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={handleAddSalesOrderItem}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      <i className="fas fa-plus mr-1"></i> Add Item
                    </button>
                  </div>

                  {/* Items List */}
                  {salesOrderItems.length > 0 && (
                    <div className="space-y-2">
                      {salesOrderItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-600">SKU: {item.sku} • Qty: {item.quantity} • R {item.unitPrice.toFixed(2)} each</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-semibold text-blue-600">R {item.total.toFixed(2)}</p>
                            <button
                              type="button"
                              onClick={() => handleRemoveSalesOrderItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Remove"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals */}
                {salesOrderItems.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Subtotal:</p>
                        <p className="text-lg font-bold text-gray-900">R {subtotal.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1">Tax (R)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.tax || ''}
                          onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <p className="text-gray-600">Total:</p>
                        <p className="text-lg font-bold text-blue-600">R {total.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Shipping Information */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Shipping Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
                      <textarea
                        value={formData.shippingAddress || ''}
                        onChange={(e) => setFormData({ ...formData, shippingAddress: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Enter shipping address"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Method</label>
                      <input
                        type="text"
                        value={formData.shippingMethod || ''}
                        onChange={(e) => setFormData({ ...formData, shippingMethod: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., Standard, Express, Courier"
                      />
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Order Notes</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Notes visible to client"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                      <textarea
                        value={formData.internalNotes || ''}
                        onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Internal notes (not visible to client)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setFormData({}); setSalesOrderItems([]); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSalesOrder}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Sales Order
              </button>
            </div>
          </div>
        </div>
      );
    }

    // ADD PURCHASE ORDER
    if (modalType === 'add_purchase') {
      // Calculate totals from items
      const subtotal = purchaseOrderItems.reduce((sum, item) => sum + (item.total || 0), 0);
      const tax = formData.tax || 0;
      const total = subtotal + tax;

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">New Purchase Order</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedItem(null); setFormData({}); setPurchaseOrderItems([]); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="space-y-4">
                {/* Supplier Selection - Purchase from Supplier */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Purchase from Supplier *</label>
                  <select
                    value={formData.supplierId || ''}
                    onChange={(e) => {
                      const selectedSupplier = suppliers.find(s => s.id === e.target.value);
                      setFormData({
                        ...formData,
                        supplierId: e.target.value,
                        supplierName: selectedSupplier ? selectedSupplier.name : ''
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select a supplier...</option>
                    {suppliers.map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">This purchase order will be purchased from the selected supplier</p>
                </div>

                {/* Order Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Order Date *</label>
                    <input
                      type="date"
                      value={formData.orderDate || ''}
                      onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Expected Date</label>
                    <input
                      type="date"
                      value={formData.expectedDate || ''}
                      onChange={(e) => setFormData({ ...formData, expectedDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={formData.priority || 'normal'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    <i className="fas fa-info-circle mr-1"></i>
                    <strong>Note:</strong> Purchase orders are created with "draft" status. Stock movements will only be recorded and inventory updated when the order is marked as "received".
                  </p>
                </div>

                {/* Order Items Section */}
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Order Items</h3>
                  
                  {/* Add Item Form */}
                  <div className="grid grid-cols-12 gap-2 mb-3">
                    <div className="col-span-3">
                      <select
                        value={newPurchaseOrderItem.sku}
                        onChange={(e) => {
                          const sku = e.target.value;
                          const invItem = inventory.find(item => item.sku === sku || item.id === sku);
                          setNewPurchaseOrderItem({
                            ...newPurchaseOrderItem,
                            sku: sku,
                            name: invItem ? invItem.name : newPurchaseOrderItem.name
                          });
                        }}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select from inventory</option>
                        {inventory.map(item => (
                          <option key={item.id || item.sku} value={item.sku || item.id}>
                            {item.name} ({item.sku || item.id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={newPurchaseOrderItem.name}
                        onChange={(e) => setNewPurchaseOrderItem({ ...newPurchaseOrderItem, name: e.target.value })}
                        placeholder="Item Name *"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        value={newPurchaseOrderItem.supplierPartNumber || ''}
                        onChange={(e) => setNewPurchaseOrderItem({ ...newPurchaseOrderItem, supplierPartNumber: e.target.value })}
                        placeholder="Supplier Part #"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={newPurchaseOrderItem.quantity || ''}
                        onChange={(e) => setNewPurchaseOrderItem({ ...newPurchaseOrderItem, quantity: parseFloat(e.target.value) || 0 })}
                        placeholder="Qty"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="col-span-2">
                      <button
                        type="button"
                        onClick={handleAddPurchaseOrderItem}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        <i className="fas fa-plus"></i>
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newPurchaseOrderItem.unitPrice || ''}
                      onChange={(e) => setNewPurchaseOrderItem({ ...newPurchaseOrderItem, unitPrice: parseFloat(e.target.value) || 0 })}
                      placeholder="Unit Price *"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={handleAddPurchaseOrderItem}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      <i className="fas fa-plus mr-1"></i> Add Item
                    </button>
                  </div>

                  {/* Items List */}
                  {purchaseOrderItems.length > 0 && (
                    <div className="space-y-2">
                      {purchaseOrderItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-600">
                              SKU: {item.sku} • Qty: {item.quantity} • R {item.unitPrice.toFixed(2)} each
                              {item.supplierPartNumber && ` • Supplier Part: ${item.supplierPartNumber}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-semibold text-blue-600">R {item.total.toFixed(2)}</p>
                            <button
                              type="button"
                              onClick={() => handleRemovePurchaseOrderItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                              title="Remove"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals */}
                {purchaseOrderItems.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Subtotal:</p>
                        <p className="text-lg font-bold text-gray-900">R {subtotal.toFixed(2)}</p>
                      </div>
                      <div>
                        <label className="block text-gray-600 mb-1">Tax (R)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.tax || ''}
                          onChange={(e) => setFormData({ ...formData, tax: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 text-sm border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <p className="text-gray-600">Total:</p>
                        <p className="text-lg font-bold text-blue-600">R {total.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Receiving Location */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Receiving Location</h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse/Location *</label>
                    <select
                      value={formData.toLocationId || ''}
                      onChange={(e) => setFormData({ ...formData, toLocationId: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="">Select receiving location...</option>
                      {stockLocations.filter(loc => loc.status === 'active').map(location => (
                        <option key={location.id} value={location.id}>
                          {location.name} ({location.code})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">Where the purchased items will be received and stored</p>
                  </div>
                </div>

                {/* Notes */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Notes</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Order Notes</label>
                      <textarea
                        value={formData.notes || ''}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Notes for supplier"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                      <textarea
                        value={formData.internalNotes || ''}
                        onChange={(e) => setFormData({ ...formData, internalNotes: e.target.value })}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Internal notes"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
              <button
                onClick={() => { setShowModal(false); setFormData({}); setPurchaseOrderItems([]); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePurchaseOrder}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create Purchase Order
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const SalesOrdersView = () => {
    const formatDate = (date) => {
      if (!date) return '-';
      if (typeof date === 'string') return date.split('T')[0];
      return new Date(date).toISOString().split('T')[0];
    };

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Sales Orders</h3>
            <button
              onClick={openAddSalesOrderModal}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="fas fa-plus text-xs"></i>
              New Sales Order
            </button>
          </div>
        </div>

        {/* Mobile Card View - Shows on mobile devices */}
        <div className="table-mobile space-y-3">
          {salesOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <i className="fas fa-shopping-cart text-4xl mb-4 text-gray-300"></i>
              <p className="text-sm font-medium text-gray-700 mb-2">No sales orders found</p>
              <p className="text-xs text-gray-500 mb-4">Create your first sales order to get started</p>
              <button
                onClick={openAddSalesOrderModal}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
              >
                <i className="fas fa-plus text-xs"></i>
                Create Sales Order
              </button>
            </div>
          ) : (
            salesOrders.map(order => {
              const orderItems = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
              return (
                <div key={order.id} className="mobile-card bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-base font-semibold text-gray-900">{order.orderNumber}</h3>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize flex-shrink-0 ${getStatusColor(order.status)}`}>
                          {(order.status || '').replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">Client: {order.clientName || '-'}</p>
                      <p className="text-xs text-gray-500">Items: {orderItems.length}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-gray-200">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Priority</div>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${
                        order.priority === 'high' ? 'text-red-600 bg-red-50' : 
                        order.priority === 'normal' ? 'text-blue-600 bg-blue-50' : 
                        'text-gray-600 bg-gray-50'
                      }`}>
                        {order.priority}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Total</div>
                      <div className="text-lg font-bold text-blue-600">{formatCurrency(order.total || 0)}</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 mb-3 pt-3 border-t border-gray-200 text-sm">
                    <div>
                      <span className="text-gray-500">Order Date:</span>
                      <span className="ml-2 text-gray-900">{formatDate(order.orderDate)}</span>
                    </div>
                    {order.requiredDate && (
                      <div>
                        <span className="text-gray-500">Required:</span>
                        <span className="ml-2 text-gray-900">{formatDate(order.requiredDate)}</span>
                      </div>
                    )}
                    {order.shippedDate && (
                      <div>
                        <span className="text-gray-500">Shipped:</span>
                        <span className="ml-2 text-green-600">{formatDate(order.shippedDate)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => { setSelectedItem(order); setModalType('view_sales'); setShowModal(true); }}
                      className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                    >
                      <i className="fas fa-eye mr-1"></i> View
                    </button>
                    <button
                      onClick={() => handleDeleteSalesOrder(order.id)}
                      className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="table-responsive bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Client</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Required Date</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {salesOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-3 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <i className="fas fa-shopping-cart text-4xl mb-4 text-gray-300"></i>
                        <p className="text-sm font-medium text-gray-700 mb-2">No sales orders found</p>
                        <p className="text-xs text-gray-500 mb-4">Create your first sales order to get started</p>
                        <button
                          onClick={openAddSalesOrderModal}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                          <i className="fas fa-plus text-xs"></i>
                          Create Sales Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  salesOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{order.orderNumber}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{order.clientName || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                          {(order.status || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-900">{formatDate(order.orderDate)}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{formatDate(order.requiredDate)}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">{formatCurrency(order.total || 0)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedItem(order); setModalType('view_sales'); setShowModal(true); }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            title="View"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteSalesOrder(order.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            title="Delete"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const PurchaseOrdersView = () => {
    const formatDate = (date) => {
      if (!date) return '-';
      if (typeof date === 'string') return date.split('T')[0];
      return new Date(date).toISOString().split('T')[0];
    };

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Purchase Orders</h3>
            <div className="flex items-center gap-2">
              {/* Debug button - remove after testing */}
              <button
                onClick={() => {
                  alert('Button click works! Function type: ' + typeof openAddPurchaseOrderModal);
                }}
                className="px-2 py-1 text-xs bg-yellow-500 text-white rounded"
                title="Test button"
              >
                TEST
              </button>
              <button
                onClick={() => {
                  try {
                    if (typeof openAddPurchaseOrderModal === 'function') {
                      openAddPurchaseOrderModal();
                    } else {
                      console.error('❌ openAddPurchaseOrderModal is not a function!');
                      alert('Error: Purchase order function not available. Please refresh the page.');
                    }
                  } catch (error) {
                    console.error('❌ Error opening purchase order modal:', error);
                    alert('Error opening purchase order form: ' + error.message);
                  }
                }}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <i className="fas fa-plus text-xs"></i>
                New Purchase Order
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="table-mobile space-y-3">
          {purchaseOrders.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <i className="fas fa-file-invoice-dollar text-4xl mb-4 text-gray-300"></i>
              <p className="text-sm font-medium text-gray-700 mb-2">No purchase orders found</p>
              <p className="text-xs text-gray-500 mb-4">Create your first purchase order to get started</p>
                        <button
                          onClick={() => {
                            openAddPurchaseOrderModal();
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                        >
                          <i className="fas fa-plus text-xs"></i>
                          Create Purchase Order
                        </button>
            </div>
          ) : (
            purchaseOrders.map(order => {
              const orderItems = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
              return (
                <div key={order.id} className="mobile-card bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 mb-2">
                        <h3 className="text-base font-semibold text-gray-900">{order.orderNumber}</h3>
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize flex-shrink-0 ${getStatusColor(order.status)}`}>
                          {(order.status || '').replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">Supplier: {order.supplierName || '-'}</p>
                      <p className="text-xs text-gray-500">Items: {orderItems.length}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mb-3 pt-3 border-t border-gray-200">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Priority</div>
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${
                        order.priority === 'high' ? 'text-red-600 bg-red-50' : 
                        order.priority === 'normal' ? 'text-blue-600 bg-blue-50' : 
                        'text-gray-600 bg-gray-50'
                      }`}>
                        {order.priority}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Total</div>
                      <div className="text-lg font-bold text-blue-600">{formatCurrency(order.total || 0)}</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-2 mb-3 pt-3 border-t border-gray-200 text-sm">
                    <div>
                      <span className="text-gray-500">Order Date:</span>
                      <span className="ml-2 text-gray-900">{formatDate(order.orderDate)}</span>
                    </div>
                    {order.expectedDate && (
                      <div>
                        <span className="text-gray-500">Expected:</span>
                        <span className="ml-2 text-gray-900">{formatDate(order.expectedDate)}</span>
                      </div>
                    )}
                    {order.receivedDate && (
                      <div>
                        <span className="text-gray-500">Received:</span>
                        <span className="ml-2 text-green-600">{formatDate(order.receivedDate)}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => { setSelectedItem(order); setModalType('view_purchase'); setShowModal(true); }}
                      className="flex-1 px-3 py-2 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                    >
                      <i className="fas fa-eye mr-1"></i> View
                    </button>
                    <button
                      onClick={() => handleDeletePurchaseOrder(order.id)}
                      className="px-3 py-2 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table View */}
        <div className="table-responsive bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order #</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Supplier</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Order Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Expected Date</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {purchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-3 py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <i className="fas fa-file-invoice-dollar text-4xl mb-4 text-gray-300"></i>
                        <p className="text-sm font-medium text-gray-700 mb-2">No purchase orders found</p>
                        <p className="text-xs text-gray-500 mb-4">Create your first purchase order to get started</p>
                        <button
                          onClick={() => {
                            openAddPurchaseOrderModal();
                          }}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                        >
                          <i className="fas fa-plus text-xs"></i>
                          Create Purchase Order
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  purchaseOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{order.orderNumber}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{order.supplierName || '-'}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(order.status)}`}>
                          {(order.status || '').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-900">{formatDate(order.orderDate)}</td>
                      <td className="px-3 py-2 text-sm text-gray-900">{formatDate(order.expectedDate)}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">{formatCurrency(order.total || 0)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedItem(order); setModalType('view_purchase'); setShowModal(true); }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            title="View"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            onClick={() => handleDeletePurchaseOrder(order.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            title="Delete"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const SuppliersView = () => {
    const filteredSuppliers = suppliers.filter(supplier => {
      const matchesSearch = supplier.name.toLowerCase().includes(supplierSearchTerm.toLowerCase()) ||
                           (supplier.code && supplier.code.toLowerCase().includes(supplierSearchTerm.toLowerCase())) ||
                           (supplier.contactPerson && supplier.contactPerson.toLowerCase().includes(supplierSearchTerm.toLowerCase())) ||
                           (supplier.email && supplier.email.toLowerCase().includes(supplierSearchTerm.toLowerCase()));
      return matchesSearch;
    });

    // Count items per supplier
    const getSupplierItemCount = (supplierName) => {
      return inventory.filter(item => item.supplier === supplierName).length;
    };

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs"></i>
                <input
                  type="text"
                  placeholder="Search suppliers..."
                  value={supplierSearchTerm}
                  onChange={(e) => setSupplierSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <i className="fas fa-download text-xs"></i>
                Export
              </button>
              <button
                onClick={openAddSupplierModal}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <i className="fas fa-plus text-xs"></i>
                Add Supplier
              </button>
            </div>
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Code</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Supplier Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Contact Person</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Phone</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Payment Terms</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Inventory Items</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-3 py-8 text-center text-sm text-gray-500">
                      {supplierSearchTerm ? 'No suppliers found matching your search.' : 'No suppliers added yet. Click "Add Supplier" to get started.'}
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map(supplier => (
                    <tr key={supplier.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{supplier.code || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                        {supplier.website && (
                          <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                            {supplier.website}
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{supplier.contactPerson || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{supplier.email || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{supplier.phone || '-'}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{supplier.paymentTerms || 'Net 30'}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {getSupplierItemCount(supplier.name)} items
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(supplier.status)}`}>
                          {supplier.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setSelectedItem(supplier); setModalType('view_supplier'); setShowModal(true); }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            title="View Details"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            onClick={() => openEditSupplierModal(supplier)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium"
                            title="Edit Supplier"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteSupplier(supplier.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            title="Delete Supplier"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const MovementsView = ({ onRecordMovement }) => {
    // No blocking operations - movements are already loaded from parent
    
    // Handler for opening the record movement modal - direct call
    const handleRecordClick = (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      
      
      // Call the parent function directly
      if (onRecordMovement && typeof onRecordMovement === 'function') {
        onRecordMovement();
      } else {
        console.error('❌ onRecordMovement not available, trying direct call...');
        // Direct fallback - call parent's function
        try {
          setFormData({
            type: 'receipt',
            sku: '',
            itemName: '',
            quantity: '',
            unitCost: '',
            fromLocation: '',
            toLocation: '',
            reference: '',
            notes: '',
            date: new Date().toISOString().split('T')[0]
          });
          setModalType('add_movement');
          setShowModal(true);
        } catch (error) {
          console.error('❌ Error:', error);
          alert('Error opening modal: ' + error.message);
        }
      }
    };

    const handleRefreshMovements = async () => {
      try {
        if (window.DatabaseAPI?.getStockMovements) {
          const movementsResponse = await window.DatabaseAPI.getStockMovements();
          const movementsData = movementsResponse?.data?.movements || [];
          
          // Log breakdown to verify all types
          const typeBreakdown = movementsData.reduce((acc, m) => {
            acc[m.type] = (acc[m.type] || 0) + 1;
            return acc;
          }, {});
          
          const processed = movementsData.map(movement => ({ ...movement, id: movement.id }));
          setMovements(processed);
          localStorage.setItem('manufacturing_movements', JSON.stringify(processed));
          alert(`✅ Refreshed! Found ${movementsData.length} stock movements. Types: ${Object.keys(typeBreakdown).join(', ')}`);
        }
      } catch (error) {
        console.error('Error refreshing movements:', error);
        alert('Failed to refresh movements: ' + error.message);
      }
    };

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Stock Movements
              {movements.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">
                  ({movements.length} records
                  {(() => {
                    const typeCounts = movements.reduce((acc, m) => {
                      acc[m.type] = (acc[m.type] || 0) + 1;
                      return acc;
                    }, {});
                    const breakdown = Object.entries(typeCounts)
                      .map(([type, count]) => `${type}: ${count}`)
                      .join(', ');
                    return breakdown ? ` - ${breakdown}` : '';
                  })()})
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleRefreshMovements}
                className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                title="Refresh movements list"
                type="button"
              >
                <i className="fas fa-sync-alt text-xs"></i>
                Refresh
              </button>
              <button className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <i className="fas fa-filter text-xs"></i>
                Filter
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRecordClick(e);
                }}
                onMouseDown={(e) => e.preventDefault()}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors cursor-pointer"
                type="button"
                aria-label="Record Stock Movement"
              >
                <i className="fas fa-plus text-xs"></i>
                Record Movement
              </button>
            </div>
          </div>
        </div>

        {/* Movements Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Movement ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From Location</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">To Location</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Performed By</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Notes</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-3 py-8 text-center text-sm text-gray-500">
                      No stock movements found. Click "Record Movement" to create one.
                    </td>
                  </tr>
                ) : (
                  (() => {
                    // Log all movements being displayed
                    return movements.map(movement => (
                      <tr key={movement.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{movement.movementId || movement.id}</td>
                        <td className="px-3 py-2 text-sm text-gray-900">{movement.date}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(movement.type)}`}>
                            {movement.type}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-sm font-medium text-gray-900">{movement.itemName}</div>
                          <div className="text-xs text-gray-500">{movement.sku}</div>
                        </td>
                        <td className={`px-3 py-2 text-sm font-semibold text-right ${
                          movement.type === 'receipt' || movement.type === 'production' 
                            ? 'text-green-600' 
                            : movement.type === 'consumption' || movement.type === 'sale'
                            ? 'text-red-600'
                            : 'text-gray-900'
                        }`}>
                          {(() => {
                            // Normalize display: receipts should show positive, consumption should show negative
                            const qty = parseFloat(movement.quantity) || 0;
                            if (movement.type === 'receipt' || movement.type === 'production') {
                              return `+${Math.abs(qty)}`;
                            } else if (movement.type === 'consumption' || movement.type === 'sale') {
                              return `${-Math.abs(qty)}`;
                            } else {
                              // Adjustment or other types - show as-is
                              return qty > 0 ? `+${qty}` : `${qty}`;
                            }
                          })()}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-600">{movement.fromLocation}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{movement.toLocation || '-'}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{movement.reference}</td>
                        <td className="px-3 py-2 text-sm text-gray-600">{movement.performedBy}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{movement.notes}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteMovement(movement.id);
                              }}
                              className="inline-flex items-center justify-center w-8 h-8 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors cursor-pointer border border-red-200"
                              title="Delete Movement"
                              type="button"
                              style={{ minWidth: '32px', minHeight: '32px' }}
                            >
                              <i className="fas fa-trash text-sm"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Inventory Item Detail View Component
  const InventoryItemDetailView = () => {
    if (!viewingInventoryItemDetail) return null;

    const item = viewingInventoryItemDetail;
    const [editFormData, setEditFormData] = useState({ ...item });
    const [localShowCategoryInput, setLocalShowCategoryInput] = useState(false);
    const [localNewCategoryName, setLocalNewCategoryName] = useState('');
    const [selectedMovementTemplateId, setSelectedMovementTemplateId] = useState('');

    const itemMovementsForDetail = useMemo(() => {
      if (!item?.sku) return [];
      return (movements || [])
        .filter(m => m.sku === item.sku)
        .sort((a, b) => {
          // Primary sort: by date (oldest first)
          const dateA = new Date(a.date || a.createdAt || 0);
          const dateB = new Date(b.date || b.createdAt || 0);
          if (dateA.getTime() !== dateB.getTime()) {
            return dateA.getTime() - dateB.getTime();
          }
          // Secondary sort: by createdAt (oldest first) for same date
          const createdAtA = new Date(a.createdAt || a.id || 0);
          const createdAtB = new Date(b.createdAt || b.id || 0);
          if (createdAtA.getTime() !== createdAtB.getTime()) {
            return createdAtA.getTime() - createdAtB.getTime();
          }
          // Tertiary sort: by ID (for absolute ordering)
          return (a.id || '').localeCompare(b.id || '');
        });
    }, [movements, item?.sku]);

    const recentMovementTemplates = useMemo(() => {
      if (!itemMovementsForDetail.length) return [];
      const startIndex = Math.max(itemMovementsForDetail.length - 5, 0);
      return itemMovementsForDetail.slice(startIndex).reverse();
    }, [itemMovementsForDetail]);

    useEffect(() => {
      setSelectedMovementTemplateId('');
    }, [item?.id]);

    const formatMovementType = useCallback((type) => {
      const typeMap = {
        'receipt': 'Receipt',
        'issue': 'Issue',
        'transfer': 'Transfer',
        'adjustment': 'Adjustment',
        'sale': 'Sale',
        'production': 'Production',
        'consumption': 'Consumption'
      };
      return typeMap[type] || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Movement');
    }, []);

    const getMovementDescription = useCallback((movement) => {
      const type = formatMovementType(movement.type);
      let desc = type;
      
      if (movement.reference) {
        desc += ` - ${movement.reference}`;
      }
      
      if (movement.fromLocation && movement.toLocation) {
        desc += ` (${movement.fromLocation} → ${movement.toLocation})`;
      } else if (movement.fromLocation) {
        desc += ` (from ${movement.fromLocation})`;
      } else if (movement.toLocation) {
        desc += ` (to ${movement.toLocation})`;
      }
      
      if (movement.notes) {
        desc += ` - ${movement.notes}`;
      }
      
      return desc;
    }, [formatMovementType]);

    const handleRecordMovementForCurrentItem = useCallback((movementId = null) => {
      const template = movementId ? itemMovementsForDetail.find(m => m.id === movementId) : null;
      const parsedQty = template ? parseFloat(template.quantity) || 0 : 0;
      const normalizedQty = template
        ? (template.type === 'adjustment' ? parsedQty : Math.abs(parsedQty))
        : '';
      
      openAddMovementModal({
        type: template?.type || 'receipt',
        sku: item.sku,
        itemName: item.name,
        quantity: template ? `${normalizedQty}` : '',
        unitCost: template && template.unitCost !== undefined && template.unitCost !== null
          ? template.unitCost
          : '',
        fromLocation: template?.fromLocation || '',
        toLocation: template?.toLocation || '',
        reference: '',
        notes: template?.notes || '',
        date: new Date().toISOString().split('T')[0]
      });
      
      if (movementId) {
        setSelectedMovementTemplateId('');
      }
    }, [item, itemMovementsForDetail, openAddMovementModal]);

    // Sync editFormData when item changes
    useEffect(() => {
      setEditFormData({ ...item });
    }, [item]);

    const supplierParts = (() => {
      try {
        return typeof item.supplierPartNumbers === 'string' 
          ? JSON.parse(item.supplierPartNumbers || '[]') 
          : (item.supplierPartNumbers || []);
      } catch (e) {
        return [];
      }
    })();

    const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);

    const handleSaveEdit = async () => {
      try {
        const itemData = {
          name: editFormData.name,
          thumbnail: editFormData.thumbnail || '',
          category: editFormData.category,
          type: editFormData.type,
          unit: editFormData.unit,
          reorderPoint: editFormData.reorderPoint === undefined || editFormData.reorderPoint === null || editFormData.reorderPoint === '' ? undefined : parseFloat(editFormData.reorderPoint),
          reorderQty: editFormData.reorderQty === undefined || editFormData.reorderQty === null || editFormData.reorderQty === '' ? undefined : parseFloat(editFormData.reorderQty),
          unitCost: editFormData.unitCost === undefined || editFormData.unitCost === null || editFormData.unitCost === '' ? undefined : parseFloat(editFormData.unitCost),
          supplier: editFormData.supplier || ''
        };
        
        if (editFormData.supplierPartNumbers !== undefined) {
          itemData.supplierPartNumbers = editFormData.supplierPartNumbers || '[]';
        }
        if (editFormData.manufacturingPartNumber !== undefined) {
          itemData.manufacturingPartNumber = editFormData.manufacturingPartNumber || '';
        }
        if (editFormData.legacyPartNumber !== undefined) {
          itemData.legacyPartNumber = editFormData.legacyPartNumber || '';
        }

        const targetId = getInventoryItemId(item);
        const response = await safeCallAPI('updateInventoryItem', targetId, itemData);
        if (response?.data?.item) {
          const updatedInventory = inventory.map(invItem => getInventoryItemId(invItem) === targetId ? response.data.item : invItem);
          setInventory(updatedInventory);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
          setViewingInventoryItemDetail(response.data.item);
          setIsEditingInventoryItem(false);
          alert('Item updated successfully!');
        }
      } catch (error) {
        console.error('Error updating inventory item:', error);
        alert('Failed to update inventory item. Please try again.');
      }
    };

    const handleAddLocalCategory = () => {
      const trimmedName = (localNewCategoryName || '').trim().toLowerCase().replace(/\s+/g, '_');
      if (trimmedName && !categories.includes(trimmedName)) {
        const updatedCategories = [...categories, trimmedName];
        setCategories(updatedCategories);
        localStorage.setItem('inventory_categories', JSON.stringify(updatedCategories));
        setEditFormData({ ...editFormData, category: trimmedName });
        setLocalNewCategoryName('');
        setLocalShowCategoryInput(false);
      } else if (categories.includes(trimmedName)) {
        alert('Category already exists!');
      }
    };

    return (
      <div className="space-y-4">
        {/* Header with Back Button */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                setViewingInventoryItemDetail(null);
                setIsEditingInventoryItem(false);
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <i className="fas fa-arrow-left"></i>
              <span>Back to Inventory</span>
            </button>
            <div className="flex items-center gap-2">
              {!isEditingInventoryItem ? (
                <>
                  <button
                    onClick={() => setIsEditingInventoryItem(true)}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <i className="fas fa-edit"></i>
                    Edit Item
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item)}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                  >
                    <i className="fas fa-trash"></i>
                    Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setIsEditingInventoryItem(false);
                      setEditFormData({ ...item });
                    }}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                  >
                    <i className="fas fa-save"></i>
                    Save Changes
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Item Header Info */}
          <div className="flex items-start gap-4 pb-4 border-b border-gray-200">
            {item.thumbnail ? (
              <img 
                src={item.thumbnail} 
                alt={item.name} 
                className="w-24 h-24 object-cover rounded-lg border border-gray-200" 
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <div className="w-24 h-24 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400">
                <i className="fas fa-box text-3xl"></i>
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{item.name}</h1>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="text-sm text-gray-500">SKU:</span>
                  <span className="ml-2 text-sm font-mono font-semibold text-gray-900">{item.sku}</span>
                </div>
                <div>
                  <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-medium capitalize ${getStatusColor(item.status)}`}>
                    {(item.status || '').replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Type:</span>
                  <span className="ml-2 text-sm text-gray-900 capitalize">
                    {item.type === 'final_product'
                      ? 'Final Product'
                      : item.type === 'component'
                        ? 'Component'
                        : (item.type || '').replace('_', ' ')}
                  </span>
                </div>
                {item.category && (
                  <div>
                    <span className="text-sm text-gray-500">Category:</span>
                    <span className="ml-2 text-sm text-gray-900 capitalize">
                      {(item.category || '').replace('_', ' ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Main Details */}
          <div className="lg:col-span-2 space-y-4">
            {/* Stock Information */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Stock Information</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Quantity</p>
                  <p className={`text-xl font-bold ${item.quantity < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {item.quantity || 0} {item.unit}
                  </p>
                </div>
                {item.type === 'final_product' ? (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">In Production</p>
                      <p className="text-xl font-bold text-orange-600">{item.inProductionQuantity || 0} {item.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Completed</p>
                      <p className="text-xl font-bold text-green-600">{item.completedQuantity || 0} {item.unit}</p>
                    </div>
                  </>
                ) : null}
                <div>
                  <p className="text-xs text-gray-500 mb-1">Allocated</p>
                  <p className="text-xl font-bold text-yellow-700">{item.allocatedQuantity || 0} {item.unit}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Available</p>
                  <p className={`text-xl font-bold ${availableQty < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {availableQty} {item.unit}
                  </p>
                </div>
              </div>
            </div>

            {/* Item Details */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Item Details</h2>
              <div className="grid grid-cols-2 gap-4">
                {isEditingInventoryItem ? (
                  <>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                      <input
                        type="text"
                        value={editFormData.name || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <div className="flex gap-2">
                        <select
                          value={editFormData.category || ''}
                          onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="">Select a category...</option>
                          {categories.map(cat => (
                            <option key={cat} value={cat}>
                              {cat.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setLocalShowCategoryInput(!localShowCategoryInput)}
                          className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                        >
                          <i className="fas fa-plus"></i>
                        </button>
                      </div>
                      {localShowCategoryInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            value={localNewCategoryName}
                            onChange={(e) => setLocalNewCategoryName(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAddLocalCategory()}
                            className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="New category name..."
                          />
                          <button
                            type="button"
                            onClick={handleAddLocalCategory}
                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => { setLocalShowCategoryInput(false); setLocalNewCategoryName(''); }}
                            className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                      <select
                        value={editFormData.type || 'component'}
                        onChange={(e) => setEditFormData({ ...editFormData, type: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="component">Component</option>
                        <option value="final_product">Final Product</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit *</label>
                      <select
                        value={editFormData.unit || 'pcs'}
                        onChange={(e) => setEditFormData({ ...editFormData, unit: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="pcs">Pieces (pcs)</option>
                        <option value="units">Units</option>
                        <option value="kg">Kilograms (kg)</option>
                        <option value="m">Meters (m)</option>
                        <option value="l">Liters (l)</option>
                        <option value="box">Box</option>
                        <option value="set">Set</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Point</label>
                      <input
                        type="number"
                        value={editFormData.reorderPoint === undefined || editFormData.reorderPoint === null ? '' : editFormData.reorderPoint}
                        onChange={(e) => setEditFormData({ ...editFormData, reorderPoint: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Quantity</label>
                      <input
                        type="number"
                        value={editFormData.reorderQty === undefined || editFormData.reorderQty === null ? '' : editFormData.reorderQty}
                        onChange={(e) => setEditFormData({ ...editFormData, reorderQty: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (R) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editFormData.unitCost === undefined || editFormData.unitCost === null ? '' : editFormData.unitCost}
                        onChange={(e) => setEditFormData({ ...editFormData, unitCost: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                      <select
                        value={editFormData.supplier || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, supplier: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select supplier...</option>
                        {suppliers.filter(s => s.status === 'active').map(supplier => (
                          <option key={supplier.id} value={supplier.name}>{supplier.name} {supplier.code ? `(${supplier.code})` : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Part Number</label>
                      <input
                        type="text"
                        value={editFormData.manufacturingPartNumber || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, manufacturingPartNumber: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., MFG-PART-123"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Abcotronics Part Number (Legacy)</label>
                      <input
                        type="text"
                        value={editFormData.legacyPartNumber || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, legacyPartNumber: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., OLD-PART-123"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Image / Thumbnail</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files && e.target.files[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            setEditFormData(prev => ({ ...prev, thumbnail: reader.result }));
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="w-full text-sm mb-2"
                      />
                      <input
                        type="url"
                        placeholder="Or paste image URL (https://...)"
                        value={editFormData.thumbnail || ''}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, thumbnail: e.target.value }))}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      {editFormData.thumbnail && (
                        <div className="mt-2">
                          <img src={editFormData.thumbnail} alt="Preview" className="w-20 h-20 object-cover rounded border" />
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Part Numbers</label>
                      <div className="space-y-2">
                        {(() => {
                          try {
                            const parts = typeof editFormData.supplierPartNumbers === 'string' 
                              ? JSON.parse(editFormData.supplierPartNumbers || '[]') 
                              : (editFormData.supplierPartNumbers || []);
                            return (
                              <>
                                {parts.map((sp, idx) => (
                                  <div key={idx} className="flex gap-2">
                                    <select
                                      value={sp.supplier || ''}
                                      onChange={(e) => {
                                        const updated = [...parts];
                                        updated[idx].supplier = e.target.value;
                                        setEditFormData({ ...editFormData, supplierPartNumbers: JSON.stringify(updated) });
                                      }}
                                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                      <option value="">Select supplier...</option>
                                      {suppliers.filter(s => s.status === 'active').map(supplier => (
                                        <option key={supplier.id} value={supplier.name}>
                                          {supplier.name} {supplier.code ? `(${supplier.code})` : ''}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={sp.partNumber || ''}
                                      onChange={(e) => {
                                        const updated = [...parts];
                                        updated[idx].partNumber = e.target.value;
                                        setEditFormData({ ...editFormData, supplierPartNumbers: JSON.stringify(updated) });
                                      }}
                                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      placeholder="Part number"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = parts.filter((_, i) => i !== idx);
                                        setEditFormData({ ...editFormData, supplierPartNumbers: JSON.stringify(updated) });
                                      }}
                                      className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-300 rounded-lg"
                                    >
                                      <i className="fas fa-times"></i>
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentParts = typeof editFormData.supplierPartNumbers === 'string' 
                                      ? JSON.parse(editFormData.supplierPartNumbers || '[]') 
                                      : (editFormData.supplierPartNumbers || []);
                                    const updated = [...currentParts, { supplier: '', partNumber: '' }];
                                    setEditFormData({ ...editFormData, supplierPartNumbers: JSON.stringify(updated) });
                                  }}
                                  className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                                >
                                  <i className="fas fa-plus mr-1"></i>
                                  Add Supplier Part Number
                                </button>
                              </>
                            );
                          } catch (e) {
                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditFormData({ ...editFormData, supplierPartNumbers: JSON.stringify([{ supplier: '', partNumber: '' }]) });
                                }}
                                className="w-full px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 border border-gray-300"
                              >
                                <i className="fas fa-plus mr-1"></i>
                                Add Supplier Part Number
                              </button>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Quantity</p>
                      <p className="text-sm font-semibold text-gray-900">{item.quantity || 0} {item.unit}</p>
                      <p className="text-xs text-gray-400 mt-1">(Update via stock movements/purchase orders)</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Unit</p>
                      <p className="text-sm font-semibold text-gray-900">{item.unit || 'pcs'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Reorder Point</p>
                      <p className="text-sm font-semibold text-gray-900">{item.reorderPoint || '-'} {item.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Reorder Quantity</p>
                      <p className="text-sm font-semibold text-gray-900">{item.reorderQty || '-'} {item.unit}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Unit Cost</p>
                      <p className="text-sm font-semibold text-gray-900">{item.unitCost > 0 ? formatCurrency(item.unitCost) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Total Value</p>
                      <p className="text-sm font-semibold text-blue-600">{item.totalValue > 0 ? formatCurrency(item.totalValue) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Supplier</p>
                      <p className="text-sm font-semibold text-gray-900">{item.supplier || '-'}</p>
                    </div>
                    {item.location && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Location</p>
                        <p className="text-sm font-semibold text-gray-900">{item.location}</p>
                      </div>
                    )}
                    {item.manufacturingPartNumber && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Manufacturing Part Number</p>
                        <p className="text-sm font-semibold text-gray-900">{item.manufacturingPartNumber}</p>
                      </div>
                    )}
                    {item.legacyPartNumber && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Abcotronics Part Number (Legacy)</p>
                        <p className="text-sm font-semibold text-gray-900">{item.legacyPartNumber}</p>
                      </div>
                    )}
                    {item.lastRestocked && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Last Restocked</p>
                        <p className="text-sm font-semibold text-gray-900">{item.lastRestocked}</p>
                      </div>
                    )}
                    {supplierParts.length > 0 && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500 mb-2">Supplier Part Numbers</p>
                        <div className="space-y-1">
                          {supplierParts.map((sp, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium text-gray-700">{sp.supplier}:</span>
                              <span className="ml-2 text-gray-600">{sp.partNumber}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Summary */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize mt-1 ${getStatusColor(item.status)}`}>
                    {(item.status || '').replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total Value</p>
                  <p className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(item.totalValue || 0)}</p>
                </div>
                {item.reorderPoint > 0 && (
                  <div className={`p-3 rounded-lg ${availableQty <= item.reorderPoint ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                    <p className="text-xs font-medium text-gray-700">Stock Level</p>
                    <p className={`text-sm font-bold mt-1 ${availableQty <= item.reorderPoint ? 'text-red-600' : 'text-green-600'}`}>
                      {availableQty <= item.reorderPoint ? 'Low Stock' : 'In Stock'}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      Available: {availableQty} / Reorder Point: {item.reorderPoint}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stock Ledger */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mt-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Stock Ledger</h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                onClick={() => handleRecordMovementForCurrentItem()}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <i className="fas fa-plus"></i>
                Record Movement
              </button>
              {recentMovementTemplates.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={selectedMovementTemplateId}
                    onChange={(e) => setSelectedMovementTemplateId(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Use existing movement...</option>
                    {recentMovementTemplates.map(movement => {
                      const qty = Math.abs(parseFloat(movement.quantity) || 0);
                      const dateLabel = movement.date
                        ? new Date(movement.date).toLocaleDateString()
                        : (movement.createdAt ? new Date(movement.createdAt).toLocaleDateString() : 'Unknown date');
                      return (
                        <option key={movement.id} value={movement.id}>
                          {`${dateLabel} · ${formatMovementType(movement.type)} (${qty} ${item.unit || ''})`}
                        </option>
                      );
                    })}
                  </select>
                  <button
                    onClick={() => handleRecordMovementForCurrentItem(selectedMovementTemplateId)}
                    disabled={!selectedMovementTemplateId}
                    className={`px-3 py-2 text-sm rounded-lg border ${
                      selectedMovementTemplateId
                        ? 'bg-white text-blue-600 border-blue-200 hover:bg-blue-50'
                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    }`}
                  >
                    Use Template
                  </button>
                </div>
              )}
            </div>
          </div>
          {(() => {
            // Movements are sorted oldest-first, but we want to display newest-first
            // So we reverse for display, but calculate balances backwards from current quantity
            const itemMovements = [...itemMovementsForDetail].reverse();

            // Helper function to normalize quantity based on movement type
            // This ensures consistent handling across balance calculation and display
            const normalizeQuantity = (movement) => {
              let qty = parseFloat(movement.quantity) || 0;
              // Normalize quantity based on type
              if (movement.type === 'receipt') {
                qty = Math.abs(qty); // Receipts always increase stock (positive)
              } else if (movement.type === 'production' || movement.type === 'consumption' || movement.type === 'sale') {
                qty = -Math.abs(qty); // Production/consumption/sale always decrease stock (negative)
              }
              // Adjustments keep their sign as-is (can be positive or negative)
              // This is critical - adjustments are stored with their actual sign in the database
              return qty;
            };

            // Calculate balances backwards from current quantity (since we're displaying newest-first)
            // Start with current quantity and work backwards by subtracting each movement
            const currentQuantity = item.quantity || 0;
            let runningBalance = currentQuantity;

            return (
              <div className="overflow-x-auto">
                {itemMovements.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <i className="fas fa-inbox text-4xl mb-2 text-gray-300"></i>
                    <p className="text-sm">No stock movements recorded for this item</p>
                    <p className="text-xs text-gray-400 mt-1">Stock movements will appear here as they are recorded</p>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Description</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">In</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Out</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Balance</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {/* Transaction Rows */}
                      {itemMovements.map((movement, index) => {
                        // Use the same normalization function for consistency
                        const qty = normalizeQuantity(movement);
                        
                        const isIncrease = qty > 0;
                        const isDecrease = qty < 0;
                        
                        // Display the balance AFTER this movement (runningBalance)
                        // Then calculate the balance BEFORE this movement for the next row
                        const balanceToDisplay = runningBalance;
                        runningBalance = runningBalance - qty;
                        
                        return (
                          <tr key={movement.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm text-gray-900">
                              {movement.date || (movement.createdAt ? new Date(movement.createdAt).toLocaleDateString() : '-')}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(movement.type)}`}>
                                {formatMovementType(movement.type)}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700">
                              {getMovementDescription(movement)}
                            </td>
                            <td className="px-3 py-2 text-sm text-right">
                              {isIncrease ? (
                                <span className="text-green-600 font-medium">+{Math.abs(qty).toFixed(2)}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-sm text-right">
                              {isDecrease ? (
                                <span className="text-red-600 font-medium">{qty.toFixed(2)}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className={`px-3 py-2 text-sm text-right font-semibold ${
                              balanceToDisplay < 0 ? 'text-red-600' : balanceToDisplay === 0 ? 'text-orange-600' : 'text-gray-900'
                            }`}>
                              {balanceToDisplay.toFixed(2)} {item.unit}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-600">
                              {movement.reference || movement.movementId || '-'}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Closing Balance Row */}
                      <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                        <td className="px-3 py-2 text-sm text-gray-700" colSpan="5">
                          <span className="text-gray-900">Closing Balance</span>
                        </td>
                        <td className={`px-3 py-2 text-sm text-right font-bold ${
                          currentQuantity < 0 ? 'text-red-600' : currentQuantity === 0 ? 'text-orange-600' : 'text-blue-600'
                        }`}>
                          {currentQuantity.toFixed(2)} {item.unit}
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-700">-</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Show detail view if viewing an item, otherwise show normal view */}
      {viewingInventoryItemDetail ? (
        <InventoryItemDetailView />
      ) : (
        <>
          {/* Header */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Manufacturing & Inventory Management</h2>
                <p className="text-sm text-gray-500 mt-1">Comprehensive stock control and production management system</p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              {[
                { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-bar' },
                { id: 'inventory', label: 'Inventory', icon: 'fa-boxes' },
                { id: 'bom', label: 'Bill of Materials', icon: 'fa-clipboard-list' },
                { id: 'production', label: 'Production Orders', icon: 'fa-industry' },
                { id: 'sales', label: 'Sales Orders', icon: 'fa-shopping-cart' },
                { id: 'purchase', label: 'Purchase Orders', icon: 'fa-file-invoice-dollar' },
                { id: 'movements', label: 'Stock Movements', icon: 'fa-exchange-alt' },
                { id: 'suppliers', label: 'Suppliers', icon: 'fa-truck' },
                { id: 'locations', label: 'Stock Locations', icon: 'fa-map-marker-alt' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => changeTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <i className={`fas ${tab.icon} text-xs`}></i>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Content Area */}
          <div>
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'inventory' && renderInventoryView()}
            {activeTab === 'bom' && <BOMView />}
            {activeTab === 'production' && <ProductionView />}
            {activeTab === 'sales' && <SalesOrdersView />}
            {activeTab === 'purchase' && <PurchaseOrdersView />}
            {activeTab === 'movements' && (
              <MovementsView 
                onRecordMovement={openAddMovementModal}
              />
            )}
            {activeTab === 'suppliers' && <SuppliersView />}
            {activeTab === 'locations' && window.StockLocations && (
              <window.StockLocations 
                inventory={inventory}
                onInventoryUpdate={(updatedInventory) => setInventory(updatedInventory)}
              />
            )}
          </div>
        </>
      )}

      {/* Modals */}
      {showModal && renderModal()}
      
      {/* Duplicate Warning Modal */}
      {showDuplicateWarning && duplicateWarnings.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center gap-3">
                <i className="fas fa-exclamation-triangle text-yellow-600 text-xl"></i>
                <h2 className="text-lg font-semibold text-gray-900">
                  Potential Duplicate Parts Detected
                </h2>
              </div>
              <button
                onClick={handleCancelDuplicate}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-900 mb-2">
                  <i className="fas fa-info-circle mr-2"></i>
                  <strong>Warning:</strong> The following existing parts may be similar to the part you're trying to create.
                  Please review them carefully before proceeding.
                </p>
                <p className="text-xs text-yellow-700">
                  You can still create the part if you're sure it's different, or cancel to edit your entry.
                </p>
              </div>

              <div className="space-y-3">
                {duplicateWarnings.map((warning, index) => (
                  <div
                    key={index}
                    className={`border rounded-lg p-4 ${
                      warning.severity === 'high'
                        ? 'border-red-300 bg-red-50'
                        : warning.severity === 'medium'
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-yellow-300 bg-yellow-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">
                          {warning.existingItem.name || 'Unnamed Item'}
                        </h3>
                        <div className="text-xs text-gray-600 space-y-1">
                          {warning.existingItem.sku && (
                            <div><strong>SKU:</strong> {warning.existingItem.sku}</div>
                          )}
                          {warning.existingItem.manufacturingPartNumber && (
                            <div><strong>Manufacturing Part:</strong> {warning.existingItem.manufacturingPartNumber}</div>
                          )}
                          {warning.existingItem.legacyPartNumber && (
                            <div><strong>Abcotronics Part (Legacy):</strong> {warning.existingItem.legacyPartNumber}</div>
                          )}
                          {warning.existingItem.category && (
                            <div>
                              <strong>Category:</strong> {(warning.existingItem.category || '').replace('_', ' ')}
                            </div>
                          )}
                          {warning.existingItem.type && (
                            <div><strong>Type:</strong> {warning.existingItem.type}</div>
                          )}
                        </div>
                      </div>
                      <div className="ml-4 text-right">
                        <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold ${
                          warning.severity === 'high'
                            ? 'bg-red-200 text-red-800'
                            : warning.severity === 'medium'
                            ? 'bg-orange-200 text-orange-800'
                            : 'bg-yellow-200 text-yellow-800'
                        }`}>
                          {warning.matchScore.toFixed(1)}% Match
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-300">
                      <div className="text-xs text-gray-700">
                        <strong>Match Reasons:</strong>
                        <ul className="list-disc list-inside mt-1 space-y-0.5">
                          {warning.reasons.map((reason, reasonIndex) => (
                            <li key={reasonIndex}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>New Part Details:</strong>
                </p>
                <div className="text-xs text-blue-700 mt-1 space-y-1">
                  <div><strong>Name:</strong> {pendingCreateData?.name || 'N/A'}</div>
                  {pendingCreateData?.manufacturingPartNumber && (
                    <div><strong>Manufacturing Part:</strong> {pendingCreateData.manufacturingPartNumber}</div>
                  )}
                  {pendingCreateData?.legacyPartNumber && (
                    <div><strong>Abcotronics Part (Legacy):</strong> {pendingCreateData.legacyPartNumber}</div>
                  )}
                  {pendingCreateData?.category && (
                    <div>
                      <strong>Category:</strong> {(pendingCreateData?.category || '').replace('_', ' ')}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
              <button
                onClick={handleCancelDuplicate}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel & Edit
              </button>
              <button
                onClick={handleProceedWithDuplicate}
                className={`px-4 py-2 text-sm rounded-lg text-white ${
                  duplicateWarnings.some(w => w.severity === 'high')
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                <i className="fas fa-exclamation-triangle mr-2"></i>
                Create Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
} catch (componentError) {
  console.error('❌ Manufacturing.jsx: Error during component definition:', componentError);
  console.error('❌ Error stack:', componentError.stack);
  // Define a fallback component
  Manufacturing = () => {
    const ReactForError = getReactForError();
    if (ReactForError && ReactForError.createElement) {
      return ReactForError.createElement('div', { className: 'text-center py-12 text-gray-500' },
        ReactForError.createElement('p', null, '❌ Manufacturing component failed to initialize.'),
        ReactForError.createElement('p', null, 'Error: ', componentError.message),
        ReactForError.createElement('br'),
        ReactForError.createElement('button', {
          onClick: () => window.location.reload(),
          className: 'mt-4 px-4 py-2 bg-blue-600 text-white rounded'
        }, 'Reload Page')
      );
    }
    return null;
  };
}

// Make available globally - Register immediately
// Wrap in IIFE to catch any errors during component definition
(function() {
    console.log('🔵 Manufacturing.jsx: Starting registration IIFE...');
    console.log('🔵 Manufacturing variable type:', typeof Manufacturing);
    try {
        // Check if Manufacturing was defined (might be undefined if there was an error earlier)
        if (typeof Manufacturing !== 'undefined') {
            window.Manufacturing = Manufacturing;
            console.log('✅ Manufacturing component registered successfully');
            
            // Dispatch ready event
            if (typeof window.dispatchEvent === 'function') {
                try {
                    window.dispatchEvent(new CustomEvent('manufacturingComponentReady'));
                    
                    // Also dispatch after a small delay in case listeners weren't ready
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('manufacturingComponentReady'));
                    }, 100);
                    
                    // One more delayed dispatch for safety
                    setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('manufacturingComponentReady'));
                    }, 500);
                } catch (e) {
                    console.warn('⚠️ Could not dispatch manufacturingComponentReady event:', e);
                }
            }
        } else {
            console.error('❌ Manufacturing.jsx: Manufacturing function is undefined!');
            console.error('❌ This means there was a JavaScript error before the component definition.');
            console.error('❌ Check the browser console for syntax errors or runtime errors above this message.');
            
            // Register a fallback component that shows an error message
            const ReactForFallback = getReactForError();
            window.Manufacturing = () => {
                if (ReactForFallback && ReactForFallback.createElement) {
                    return ReactForFallback.createElement('div', { className: 'text-center py-12 text-gray-500' },
                        ReactForFallback.createElement('p', null, '❌ Manufacturing component failed to load.'),
                        ReactForFallback.createElement('p', null, 'Please check the browser console for errors.'),
                        ReactForFallback.createElement('br'),
                        ReactForFallback.createElement('button', {
                            onClick: () => window.location.reload(),
                            className: 'mt-4 px-4 py-2 bg-blue-600 text-white rounded'
                        }, 'Reload Page')
                    );
                } else {
                    // If React isn't available, return a simple div
                    return {
                        type: 'div',
                        props: {
                            className: 'text-center py-12 text-gray-500',
                            dangerouslySetInnerHTML: {
                                __html: '❌ Manufacturing component failed to load. Please check the browser console for errors.<br><button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Reload Page</button>'
                            }
                        }
                    };
                }
            };
        }
    } catch (error) {
        console.error('❌ Manufacturing.jsx: Error registering component:', error);
        console.error('❌ Error stack:', error.stack);
        // Still try to register a fallback
        const ReactForFallback = getReactForError();
        window.Manufacturing = () => {
            if (ReactForFallback && ReactForFallback.createElement) {
                return ReactForFallback.createElement('div', { className: 'text-center py-12 text-gray-500' },
                    'Manufacturing component failed to load. Error: ', error.message,
                    ReactForFallback.createElement('br'),
                    ReactForFallback.createElement('button', {
                        onClick: () => window.location.reload(),
                        className: 'mt-4 px-4 py-2 bg-blue-600 text-white rounded'
                    }, 'Reload Page')
                );
            } else {
                // If React isn't available, return a simple div string
                return {
                    type: 'div',
                    props: {
                        className: 'text-center py-12 text-gray-500',
                        dangerouslySetInnerHTML: {
                            __html: `Manufacturing component failed to load. Error: ${error.message}<br><button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Reload Page</button>`
                        }
                    }
                };
            }
        };
    }
})();

// Also set it after a short delay to catch late registrations
setTimeout(() => {
    if (typeof Manufacturing !== 'undefined' && !window.Manufacturing) {
        console.warn('⚠️ Manufacturing not registered initially, trying delayed registration...');
        window.Manufacturing = Manufacturing;
        
        // Dispatch event after delayed registration
        if (typeof window.dispatchEvent === 'function') {
            try {
                window.dispatchEvent(new CustomEvent('manufacturingComponentReady'));
            } catch (e) {
                console.warn('⚠️ Could not dispatch manufacturingComponentReady event:', e);
            }
        }
    }
}, 1000);

// BULLETPROOF: Ensure Manufacturing is always registered, even if everything else fails
// This is a final safety net to prevent the "failed to load" error
(function ensureManufacturingRegistered() {
    // Check multiple times with increasing delays
    const checkAndRegister = (attempt = 1, maxAttempts = 10) => {
        if (window.Manufacturing) {
            console.log(`✅ Manufacturing component registered (verified on attempt ${attempt})`);
            return;
        }
        
        if (attempt > maxAttempts) {
            console.error('❌ Manufacturing component failed to register after all attempts');
            // Register a minimal fallback component
            const ReactForFallback = window.React || {};
            window.Manufacturing = () => {
                if (ReactForFallback.createElement) {
                    return ReactForFallback.createElement('div', { 
                        className: 'text-center py-12 text-gray-500',
                        style: { padding: '3rem' }
                    },
                        ReactForFallback.createElement('p', null, '❌ Manufacturing component failed to load.'),
                        ReactForFallback.createElement('p', null, 'Please refresh the page or check the console for errors.'),
                        ReactForFallback.createElement('button', {
                            onClick: () => window.location.reload(),
                            className: 'mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700',
                            style: { cursor: 'pointer' }
                        }, 'Reload Page')
                    );
                }
                // If React isn't available, return a simple object
                return {
                    type: 'div',
                    props: {
                        className: 'text-center py-12 text-gray-500',
                        dangerouslySetInnerHTML: {
                            __html: '❌ Manufacturing component failed to load. <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded">Reload Page</button>'
                        }
                    }
                };
            };
            console.log('✅ Registered fallback Manufacturing component');
            return;
        }
        
        // Try to register if Manufacturing variable exists
        if (typeof Manufacturing !== 'undefined') {
            console.log(`🔄 Attempting to register Manufacturing (attempt ${attempt}/${maxAttempts})...`);
            window.Manufacturing = Manufacturing;
            
            // Dispatch event
            if (typeof window.dispatchEvent === 'function') {
                try {
                    window.dispatchEvent(new CustomEvent('manufacturingComponentReady'));
                } catch (e) {
                    // Ignore event dispatch errors
                }
            }
        }
        
        // Schedule next check with exponential backoff
        const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
        setTimeout(() => checkAndRegister(attempt + 1, maxAttempts), delay);
    };
    
    // Start checking after initial delay
    setTimeout(() => checkAndRegister(), 500);
})();
