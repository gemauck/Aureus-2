// Use React from window
console.log('🏭 Manufacturing.jsx: Starting to load...');
console.log('🏭 React available:', typeof window.React !== 'undefined');
console.log('🏭 useAuth available:', typeof window.useAuth !== 'undefined');

const { useState, useEffect, useCallback } = React;
const { useAuth } = window;

const Manufacturing = () => {
  console.log('🏭 Manufacturing component rendering/updating');
  
  // Safety check for useAuth
  if (!window.useAuth) {
    console.error('❌ Manufacturing: useAuth is not available');
    return <div className="text-center py-12 text-gray-500">Authentication not loaded. Please refresh the page.</div>;
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [inventory, setInventory] = useState([]);
  const [boms, setBoms] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [formData, setFormData] = useState({});
  const [bomComponents, setBomComponents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedLocationId, setSelectedLocationId] = useState('all'); // Location filter for inventory
  const [stockLocations, setStockLocations] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');
  const [categories, setCategories] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);


  // Load data from API - OPTIMIZED: Parallel loading + localStorage cache
  useEffect(() => {
    const loadData = async () => {
      try {
        // STEP 1: Load from localStorage immediately for instant UI
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        const cachedBOMs = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
        const cachedProductionOrders = JSON.parse(localStorage.getItem('manufacturing_production_orders') || '[]');
        const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
        const cachedSuppliers = JSON.parse(localStorage.getItem('manufacturing_suppliers') || '[]');

        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
          console.log('⚡ Manufacturing: Loaded inventory from cache:', cachedInventory.length);
        }
        if (cachedBOMs.length > 0) {
          setBoms(cachedBOMs);
          console.log('⚡ Manufacturing: Loaded BOMs from cache:', cachedBOMs.length);
        }
        if (cachedProductionOrders.length > 0) {
          setProductionOrders(cachedProductionOrders);
          console.log('⚡ Manufacturing: Loaded production orders from cache:', cachedProductionOrders.length);
        }
        if (cachedMovements.length > 0) {
          setMovements(cachedMovements);
          console.log('⚡ Manufacturing: Loaded movements from cache:', cachedMovements.length);
        }
        if (cachedSuppliers.length > 0) {
          setSuppliers(cachedSuppliers);
          console.log('⚡ Manufacturing: Loaded suppliers from cache:', cachedSuppliers.length);
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

        console.log('🔄 Manufacturing: Starting parallel data load from API...');
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
                console.log('✅ Manufacturing: Stock locations synced:', locData.length);
                
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
                console.log('✅ Manufacturing: Inventory synced:', processed.length);
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
                console.log('✅ Manufacturing: BOMs synced:', processed.length);
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
                console.log('✅ Manufacturing: Production orders synced:', processed.length);
                return { type: 'productionOrders', data: processed };
              })
              .catch(error => {
                console.error('Error loading production orders:', error);
                return { type: 'productionOrders', error };
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
                setMovements(processed);
                localStorage.setItem('manufacturing_movements', JSON.stringify(processed));
                console.log('✅ Manufacturing: Stock movements synced:', processed.length);
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
                console.log('✅ Manufacturing: Suppliers synced:', processed.length);
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
              .then(clientsData => {
                const processed = Array.isArray(clientsData) ? clientsData : [];
                const activeClients = processed.filter(c => c.status === 'active' && c.type === 'client');
                setClients(activeClients);
                console.log('✅ Manufacturing: Clients loaded:', activeClients.length);
                return { type: 'clients', data: activeClients };
              })
              .catch(error => {
                console.error('Error loading clients:', error);
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
                console.log('✅ Manufacturing: Users loaded:', Array.isArray(usersData) ? usersData.length : 0);
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
          console.log(`⚡ Manufacturing: All data loaded in parallel (${loadTime}s)`);
          console.log('📊 Manufacturing: Results:', results.map(r => `${r.type}: ${r.data?.length || 0} items`).join(', '));
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
      console.log('🔄 Manufacturing: Refreshing all data in parallel...');
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
        console.log(`✅ Manufacturing: Refresh completed in parallel (${loadTime}s)`);
      }
    } catch (e) {
      console.error('Error refreshing manufacturing data:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

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

  // Reload inventory when location changes
  useEffect(() => {
    if (activeTab === 'inventory' && window.DatabaseAPI?.getInventory) {
      const loadInventoryForLocation = async () => {
        try {
          const locationIdToLoad = selectedLocationId && selectedLocationId !== 'all' ? selectedLocationId : null;
          const invResponse = await window.DatabaseAPI.getInventory(locationIdToLoad);
          const invData = invResponse?.data?.inventory || [];
          const processed = invData.map(item => ({ ...item, id: item.id }));
          setInventory(processed);
          localStorage.setItem('manufacturing_inventory', JSON.stringify(processed));
          console.log(`✅ Inventory loaded for location ${selectedLocationId}:`, processed.length);
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
          console.log('✅ Stock locations refreshed for inventory tab:', locData.length);
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
        console.log('✅ Stock locations updated via event:', updatedLocations.length);
      }
    };

    window.addEventListener('stockLocationsUpdated', handleLocationUpdate);
    return () => {
      window.removeEventListener('stockLocationsUpdated', handleLocationUpdate);
    };
  }, []);

  const InventoryView = () => {
    // Get unique categories from inventory items
    const uniqueCategories = [...new Set(inventory.map(item => item.category).filter(Boolean))].sort();
    
    // Get main warehouse for default selection
    const mainWarehouse = stockLocations.find(loc => loc.code === 'LOC001');
    
    const filteredInventory = inventory.filter(item => {
      const name = (item.name || '').toString().toLowerCase();
      const sku = (item.sku || '').toString().toLowerCase();
      const category = (item.category || '').toString();
      const matchesSearch = name.includes(searchTerm.toLowerCase()) || sku.includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || category === filterCategory;
      return matchesSearch && matchesCategory;
    });

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
                  type="text"
                  placeholder="Search by name or SKU..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
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
              <button className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <i className="fas fa-download text-xs"></i>
                Export
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
                <div key={item.id} className="mobile-card bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
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
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ml-2 flex-shrink-0 ${getStatusColor(item.status)}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                        <div>
                          <span className="text-gray-500">Category:</span>
                          <span className="ml-1 text-gray-900 capitalize">{item.category.replace('_', ' ')}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Type:</span>
                          <span className="ml-1 text-gray-900 capitalize">
                            {item.type === 'final_product' ? 'Final Product' : item.type === 'component' ? 'Component' : item.type.replace('_', ' ')}
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
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
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
                          onClick={() => handleDeleteItem(item.id)}
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
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Image</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Supplier Part No.</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Legacy Part Number</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Quantity</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Allocated</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Available</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Location</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total Value</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInventory.map(item => {
                  const availableQty = (item.quantity || 0) - (item.allocatedQuantity || 0);
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
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
                      {(item.legacyPartNumber !== undefined && item.legacyPartNumber) 
                        ? item.legacyPartNumber 
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 capitalize">{item.category.replace('_', ' ')}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 capitalize">
                      {item.type === 'final_product' ? 'Final Product' : item.type === 'component' ? 'Component' : item.type.replace('_', ' ')}
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusColor(item.status)}`}>
                        {item.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-3 py-2">
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
                setFormData({ 
                  workOrderNumber: nextWO,
                  startDate: null,
                  priority: 'normal',
                  status: 'requested',
                  clientId: 'stock',
                  allocationType: 'stock'
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
                  setFormData({ 
                    workOrderNumber: nextWO,
                    startDate: null,
                    priority: 'normal',
                    status: 'requested',
                    clientId: 'stock',
                    allocationType: 'stock'
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
                          {order.status.replace('_', ' ')}
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
                    {order.assignedTo && (
                      <div>
                        <span className="text-gray-500">Assigned To:</span>
                        <span className="ml-2 text-gray-900">{order.assignedTo}</span>
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
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Assigned To</th>
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
                            setFormData({ 
                              workOrderNumber: nextWO,
                              startDate: null,
                              priority: 'normal',
                              status: 'requested',
                              clientId: 'stock',
                              allocationType: 'stock'
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
                          {order.status.replace('_', ' ')}
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
                      <td className="px-3 py-2 text-sm text-gray-600">{order.assignedTo}</td>
                      <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">{formatCurrency(order.totalCost)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { 
                              setSelectedItem(order); 
                              setFormData({ ...order }); 
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

  const openAddItemModal = () => {
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
      quantity: 0,
      inProductionQuantity: 0,
      completedQuantity: 0,
      unit: 'pcs',
      reorderPoint: 0,
      reorderQty: 0,
      unitCost: 0,
      supplier: '',
      status: 'in_stock' // Will be auto-calculated by backend
    });
    setModalType('add_item');
    setShowModal(true);
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
          console.log('✅ Refreshed inventory for BOM creation:', updatedInventory.length, 'items');
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

  const handleSaveItem = async () => {
    try {
      // Validate required fields
      if (!formData.category || formData.category.trim() === '') {
        alert('Please select or add a category for this item.');
        return;
      }
      
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
        reorderPoint: parseFloat(formData.reorderPoint) || 0,
        reorderQty: parseFloat(formData.reorderQty) || 0,
        unitCost: parseFloat(formData.unitCost) || 0,
        supplier: formData.supplier || ''
      };
      
      // Only include new fields if they exist (backwards compatibility)
      if (formData.supplierPartNumbers !== undefined) {
        itemData.supplierPartNumbers = formData.supplierPartNumbers || '[]';
      }
      if (formData.legacyPartNumber !== undefined) {
        itemData.legacyPartNumber = formData.legacyPartNumber || '';
      }
      // Include production tracking fields for Final Products
      if (formData.inProductionQuantity !== undefined) {
        itemData.inProductionQuantity = parseFloat(formData.inProductionQuantity) || 0;
      }
      if (formData.completedQuantity !== undefined) {
        itemData.completedQuantity = parseFloat(formData.completedQuantity) || 0;
      }

      if (selectedItem?.id) {
        // Update existing - don't send quantity or SKU
        const response = await safeCallAPI('updateInventoryItem', selectedItem.id, itemData);
        if (response?.data?.item) {
          const updatedInventory = inventory.map(item => item.id === selectedItem.id ? response.data.item : item);
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
          quantity: parseFloat(formData.quantity) || 0,
          inProductionQuantity: parseFloat(formData.inProductionQuantity) || 0,
          completedQuantity: parseFloat(formData.completedQuantity) || 0,
          lastRestocked: new Date().toISOString().split('T')[0],
          locationId: locationId // Include locationId
        };
        const response = await safeCallAPI('createInventoryItem', createData);
        if (response?.data?.item) {
          console.log('✅ Created inventory item (debug):', {
            id: response.data.item.id,
            sku: response.data.item.sku,
            hasThumbnail: !!response.data.item.thumbnail,
            thumbnailPreview: (response.data.item.thumbnail || '').slice(0, 64)
          });
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

  const handleAddCategory = () => {
    const trimmedName = newCategoryName.trim().toLowerCase().replace(/\s+/g, '_');
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

  const handleDeleteItem = async (itemId) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        await safeCallAPI('deleteInventoryItem', itemId);
        const updatedInventory = inventory.filter(item => item.id !== itemId);
        setInventory(updatedInventory);
        localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
        setShowModal(false);
      } catch (error) {
        console.error('Error deleting inventory item:', error);
        alert('Failed to delete inventory item. Please try again.');
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

  const handleDeleteMovement = async (movementId) => {
    // Find the movement for confirmation message
    const movement = movements.find(m => m.id === movementId);
    const movementInfo = movement 
      ? `${movement.itemName} (${movement.sku}) - ${movement.type} on ${movement.date}`
      : movementId;
    
    if (confirm(`Are you sure you want to delete this stock movement?\n\n${movementInfo}\n\nThis action cannot be undone.`)) {
      try {
        console.log('🗑️ Deleting stock movement:', movementId);
        
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
        
        console.log('✅ Stock movement deleted successfully');
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
      console.log('🔄 Purging all stock movements...');
      
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
      console.log('📥 API Response:', result);
      const deletedCount = result?.count || result?.data?.count || count;
      
      if (deletedCount === 0) {
        console.warn('⚠️ API returned 0 deleted count, but response was OK');
      }

      // Clear local state and cache
      setMovements([]);
      localStorage.removeItem('manufacturing_movements');
      
      console.log(`✅ Successfully deleted ${deletedCount} stock movements`);
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

  const openAddMovementModal = () => {
    console.log('📝 openAddMovementModal called');
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
      console.error('❌ Error opening movement modal:', error);
      alert('Error opening movement modal. Please check console.');
    }
  };

  const handleSaveMovement = async () => {
    try {
      if (!formData.sku || !formData.itemName || !formData.quantity || parseFloat(formData.quantity) <= 0) {
        alert('Please provide SKU, Item Name, and a positive Quantity');
        return;
      }

      const movementData = {
        type: formData.type || 'receipt',
        sku: formData.sku,
        itemName: formData.itemName,
        quantity: parseFloat(formData.quantity),
        unitCost: formData.unitCost ? parseFloat(formData.unitCost) : undefined,
        fromLocation: formData.fromLocation || '',
        toLocation: formData.toLocation || '',
        reference: formData.reference || '',
        notes: formData.notes || '',
        date: formData.date || new Date().toISOString()
      };

      const response = await safeCallAPI('createStockMovement', movementData);
      
      if (response?.data?.movement) {
        // Refresh movements list
        const movementsResponse = await safeCallAPI('getStockMovements');
        const movementsData = movementsResponse?.data?.movements || [];
        const processedMovements = movementsData.map(movement => ({
          ...movement,
          id: movement.id
        }));
        setMovements(processedMovements);
        localStorage.setItem('manufacturing_movements', JSON.stringify(processedMovements));
        
        // Refresh inventory
        const invResponse = await safeCallAPI('getInventory');
        const invData = invResponse?.data?.inventory || [];
        const processedInventory = invData.map(item => ({ ...item, id: item.id }));
        setInventory(processedInventory);
        localStorage.setItem('manufacturing_inventory', JSON.stringify(processedInventory));
        
        setShowModal(false);
        setFormData({});
        alert('Stock movement recorded successfully!');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Error creating stock movement:', error);
      alert(error?.message || 'Failed to create stock movement. Please try again.');
    }
  };

  const openAddSupplierModal = () => {
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
      if (selectedItem && window.DatabaseAPI && window.DatabaseAPI.updateSupplier) {
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

      // Refresh suppliers list from database
      if (window.DatabaseAPI && window.DatabaseAPI.getSuppliers) {
        const suppliersResponse = await window.DatabaseAPI.getSuppliers();
        const suppliersData = suppliersResponse?.data?.suppliers || [];
        setSuppliers(suppliersData.map(supplier => ({
          ...supplier,
          id: supplier.id,
          createdAt: supplier.createdAt || new Date().toISOString().split('T')[0],
          updatedAt: supplier.updatedAt || new Date().toISOString().split('T')[0]
        })));
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
        console.error('Error deleting supplier:', error);
        alert(`Failed to delete supplier: ${error.message}`);
      }
    }
  };

  const handleSaveProductionOrder = async () => {
    try {
      console.log('🔍 Starting production order save...', { formData });
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

      // Validate required fields (startDate is now optional)
      if (!formData.assignedTo) {
        alert('Please fill in all required fields (Assigned To)');
        return;
      }

      const totalCost = selectedBom.totalCost * quantity;
      // Ensure production order number is set
      if (!formData.workOrderNumber) {
        setFormData({ ...formData, workOrderNumber: getNextWorkOrderNumber() });
      }
      const workOrderNumber = formData.workOrderNumber || getNextWorkOrderNumber();
      
      // Determine client allocation
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
        clientId: clientId,
        allocationType: allocationType,
        createdBy: user?.name || 'System'
      };

      // Only include date fields if they have values
      if (formData.startDate) orderData.startDate = formData.startDate;
      if (formData.targetDate) orderData.targetDate = formData.targetDate;

      console.log('📤 Sending production order data:', orderData);
      const response = await safeCallAPI('createProductionOrder', orderData);
      console.log('📥 API Response:', response);
      
      if (response?.data?.order) {
        console.log('✅ Production order created successfully:', response.data.order);
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
        clientId: formData.clientId !== undefined ? formData.clientId : selectedItem.clientId,
        allocationType: formData.allocationType !== undefined ? formData.allocationType : selectedItem.allocationType,
        completedDate: newStatus === 'completed' ? new Date().toISOString().split('T')[0] : (selectedItem.completedDate || null)
      };

      console.log('📤 Updating production order:', {
        id: selectedItem.id,
        oldStatus: oldStatus,
        newStatus: newStatus,
        willDeductStock: (newStatus === 'in_production' && oldStatus === 'requested'),
        hasBomId: !!orderData.bomId,
        orderData
      });

      const response = await safeCallAPI('updateProductionOrder', selectedItem.id, orderData);
      console.log('📥 Update response:', response);
      if (response?.data?.order) {
        const updatedOrders = productionOrders.map(order => 
          order.id === selectedItem.id ? response.data.order : order
        );
        setProductionOrders(updatedOrders);
        localStorage.setItem('manufacturing_production_orders', JSON.stringify(updatedOrders));
        
        // Always refresh inventory after production order update to show latest stock levels
        console.log('🔄 Refreshing inventory after production order update...');
        try {
          const inventoryResponse = await safeCallAPI('getInventory');
          if (inventoryResponse?.data?.inventory) {
            setInventory(inventoryResponse.data.inventory);
            localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryResponse.data.inventory));
            console.log('✅ Inventory refreshed:', inventoryResponse.data.inventory.length, 'items');
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
    if (modalType === 'add_item' || modalType === 'edit_item') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'edit_item' ? 'Edit Inventory Item' : 'Add Inventory Item'}
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

                {/* Legacy Part Number */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Legacy Part Number</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.category || ''}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
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
                      value={formData.quantity || 0}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
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
                          value={formData.inProductionQuantity || 0}
                          onChange={(e) => setFormData({ ...formData, inProductionQuantity: parseFloat(e.target.value) || 0 })}
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
                          value={formData.completedQuantity || 0}
                          onChange={(e) => setFormData({ ...formData, completedQuantity: parseFloat(e.target.value) || 0 })}
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
                        setActiveTab('suppliers');
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
                    onClick={() => handleDeleteItem(selectedItem.id)}
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
                        setActiveTab('inventory');
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
                        console.log('🔍 BOM Form - Inventory check:', {
                          totalInventory: inventory.length,
                          items: inventory.map(i => ({ id: i.id, sku: i.sku, name: i.name, type: i.type, category: i.category }))
                        });
                        
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
                        {selectedItem.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Item Name</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedItem.name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Category</p>
                      <p className="text-sm text-gray-900 capitalize">{selectedItem.category.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Type</p>
                      <p className="text-sm text-gray-900 capitalize">{selectedItem.type.replace('_', ' ')}</p>
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
      console.log('🔍 Rendering production order modal:', {
        bomId: formData.bomId,
        quantity: formData.quantity,
        startDate: formData.startDate,
        assignedTo: formData.assignedTo,
        modalType
      });

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
                    <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To *</label>
                    <input
                      type="text"
                      value={formData.assignedTo || ''}
                      onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Production Team A"
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

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Allocate To</label>
                    <select
                      value={formData.clientId || 'stock'}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={false}
                    >
                      <option value="stock">Allocate to Stock</option>
                      {clients.map(client => (
                        <option key={client.id} value={client.id}>{client.name}</option>
                      ))}
                    </select>
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
                  console.log('🔘 Create/Update Order button clicked', { modalType, formData });
                  console.log('🔍 Button state check:', {
                    bomId: !!formData.bomId,
                    quantity: !!formData.quantity,
                    startDate: !!formData.startDate,
                    assignedTo: !!formData.assignedTo,
                    allValid: !formData.bomId || !formData.quantity || !formData.startDate || !formData.assignedTo ? false : true
                  });
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.quantity || ''}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="10"
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

    return null;
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

  const MovementsView = () => {
    // Memoize the handler to prevent recreation on every render
    const handleRecordClick = useCallback((e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      
      try {
        const formDataInit = {
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
        };
        
        setFormData(formDataInit);
        setModalType('add_movement');
        setShowModal(true);
      } catch (error) {
        console.error('❌ Error opening movement modal:', error);
        alert('Error opening movement modal: ' + error.message);
      }
    }, []); // Empty deps - React's useState setters are stable

    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Stock Movements
              {movements.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-500">({movements.length} records)</span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {movements.length > 0 && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePurgeAllMovements();
                  }}
                  className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                  title="Purge all stock movements (cannot be undone)"
                  type="button"
                >
                  <i className="fas fa-trash-alt text-xs"></i>
                  Purge All
                </button>
              )}
              <button className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <i className="fas fa-filter text-xs"></i>
                Filter
              </button>
              <button
                onClick={handleRecordClick}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
                  movements.map(movement => (
                    <tr key={movement.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{movement.id}</td>
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
                      <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">
                        {movement.quantity > 0 ? '+' : ''}{movement.quantity}
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
                              console.log('🗑️ Delete button clicked for movement:', movement.id);
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
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
        <div className="flex border-b border-gray-200 overflow-x-auto scrollbar-hide">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-bar' },
            { id: 'inventory', label: 'Inventory', icon: 'fa-boxes' },
            { id: 'bom', label: 'Bill of Materials', icon: 'fa-clipboard-list' },
            { id: 'production', label: 'Production Orders', icon: 'fa-industry' },
            { id: 'movements', label: 'Stock Movements', icon: 'fa-exchange-alt' },
            { id: 'suppliers', label: 'Suppliers', icon: 'fa-truck' },
            { id: 'jobcards', label: 'Job Cards', icon: 'fa-clipboard' },
            { id: 'locations', label: 'Stock Locations', icon: 'fa-map-marker-alt' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
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
        {activeTab === 'inventory' && <InventoryView />}
        {activeTab === 'bom' && <BOMView />}
        {activeTab === 'production' && <ProductionView />}
        {activeTab === 'movements' && <MovementsView />}
        {activeTab === 'suppliers' && <SuppliersView />}
        {activeTab === 'jobcards' && window.JobCards && (
          <window.JobCards 
            clients={clients}
            users={users}
          />
        )}
        {activeTab === 'locations' && window.StockLocations && (
          <window.StockLocations 
            inventory={inventory}
            onInventoryUpdate={(updatedInventory) => setInventory(updatedInventory)}
          />
        )}
      </div>

      {/* Modals */}
      {showModal && renderModal()}
    </div>
  );
};

// Make available globally - Register immediately
console.log('🏭 Manufacturing.jsx: About to register component...');
console.log('🏭 Manufacturing function type:', typeof Manufacturing);
console.log('🏭 Manufacturing is defined:', typeof Manufacturing !== 'undefined');

try {
    if (typeof Manufacturing !== 'undefined') {
        window.Manufacturing = Manufacturing;
        console.log('✅ Manufacturing component registered on window.Manufacturing', typeof window.Manufacturing);
        console.log('✅ window.Manufacturing now equals:', window.Manufacturing);
    } else {
        console.error('❌ Manufacturing.jsx: Manufacturing function is undefined!');
        console.error('❌ This means there was a JavaScript error before the component definition.');
    }
} catch (error) {
    console.error('❌ Manufacturing.jsx: Error registering component:', error);
    console.error('❌ Error stack:', error.stack);
    // Still try to register a fallback
    window.Manufacturing = () => {
        return React.createElement('div', { className: 'text-center py-12 text-gray-500' },
            'Manufacturing component failed to load. Error: ', error.message,
            React.createElement('br'),
            React.createElement('button', {
                onClick: () => window.location.reload(),
                className: 'mt-4 px-4 py-2 bg-blue-600 text-white rounded'
            }, 'Reload Page')
        );
    };
}

// Also set it after a short delay to catch late registrations
setTimeout(() => {
    if (typeof Manufacturing !== 'undefined' && !window.Manufacturing) {
        console.warn('⚠️ Manufacturing not registered initially, trying delayed registration...');
        window.Manufacturing = Manufacturing;
        console.log('✅ Manufacturing component registered on window.Manufacturing (delayed)', typeof window.Manufacturing);
    }
}, 1000);
