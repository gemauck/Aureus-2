// Use React from window
const { useState, useEffect } = React;
const { useAuth } = window;

const Manufacturing = () => {
  const { user } = useAuth();
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
  const [stockLocations, setStockLocations] = useState([]);

  // Load data from localStorage
  useEffect(() => {
    const loadedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
    const loadedBoms = JSON.parse(localStorage.getItem('manufacturing_boms') || '[]');
    const loadedOrders = JSON.parse(localStorage.getItem('production_orders') || '[]');
    const loadedMovements = JSON.parse(localStorage.getItem('stock_movements') || '[]');
    const loadedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
    
    // If localStorage is empty, clear it completely to ensure no old data persists
    if (loadedInventory.length === 0) localStorage.removeItem('manufacturing_inventory');
    if (loadedBoms.length === 0) localStorage.removeItem('manufacturing_boms');
    if (loadedOrders.length === 0) localStorage.removeItem('production_orders');
    if (loadedMovements.length === 0) localStorage.removeItem('stock_movements');
    
    setInventory(loadedInventory.length ? loadedInventory : getInitialInventory());
    setBoms(loadedBoms.length ? loadedBoms : getInitialBoms());
    setProductionOrders(loadedOrders.length ? loadedOrders : getInitialOrders());
    setMovements(loadedMovements.length ? loadedMovements : getInitialMovements());
    setStockLocations(loadedLocations);
  }, []);

  // Save data to localStorage
  useEffect(() => {
    if (inventory.length) localStorage.setItem('manufacturing_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    if (boms.length) localStorage.setItem('manufacturing_boms', JSON.stringify(boms));
  }, [boms]);

  useEffect(() => {
    if (productionOrders.length) localStorage.setItem('production_orders', JSON.stringify(productionOrders));
  }, [productionOrders]);

  useEffect(() => {
    if (movements.length) localStorage.setItem('stock_movements', JSON.stringify(movements));
  }, [movements]);

  const getInitialInventory = () => [];

  const getInitialBoms = () => [];

  const getInitialOrders = () => [];

  const getInitialMovements = () => [];

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
      in_production: 'text-blue-600 bg-blue-50',
      in_progress: 'text-blue-600 bg-blue-50',
      completed: 'text-green-600 bg-green-50',
      cancelled: 'text-gray-600 bg-gray-50',
      active: 'text-green-600 bg-green-50',
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
    const lowStockItems = inventory.filter(item => item.quantity <= item.reorderPoint).length;
    const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
    const categories = [...new Set(inventory.map(item => item.category))].length;
    
    return { totalValue, lowStockItems, totalItems, categories };
  };

  const handleClearAllData = () => {
    if (confirm('⚠️ WARNING: This will delete ALL manufacturing data including inventory, BOMs, production orders, and movements. This cannot be undone. Are you absolutely sure?')) {
      if (confirm('Last chance - are you REALLY sure you want to delete everything?')) {
        localStorage.removeItem('manufacturing_inventory');
        localStorage.removeItem('manufacturing_boms');
        localStorage.removeItem('production_orders');
        localStorage.removeItem('stock_movements');
        setInventory([]);
        setBoms([]);
        setProductionOrders([]);
        setMovements([]);
        alert('All manufacturing data has been cleared.');
      }
    }
  };

  const getProductionStats = () => {
    const activeOrders = productionOrders.filter(o => o.status === 'in_progress').length;
    const completedOrders = productionOrders.filter(o => o.status === 'completed').length;
    const totalProduction = productionOrders.reduce((sum, o) => sum + o.quantityProduced, 0);
    const pendingUnits = productionOrders.filter(o => o.status === 'in_progress').reduce((sum, o) => sum + (o.quantity - o.quantityProduced), 0);
    
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
                {inventory.filter(item => item.quantity <= item.reorderPoint).slice(0, 5).map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded border border-yellow-200">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.sku} • {item.location}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-yellow-700">{item.quantity} {item.unit}</p>
                      <p className="text-xs text-gray-500">Reorder: {item.reorderPoint}</p>
                    </div>
                  </div>
                ))}
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
                {productionOrders.filter(o => o.status === 'in_progress').map(order => (
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

  const InventoryView = () => {
    const filteredInventory = inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           item.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      return matchesSearch && matchesCategory;
    });

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
                <option value="components">Components</option>
                <option value="packaging">Packaging</option>
                <option value="accessories">Accessories</option>
                <option value="finished_goods">Finished Goods</option>
                <option value="work_in_progress">Work in Progress</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
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

        {/* Inventory Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Type</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Quantity</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Location</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total Value</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInventory.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.sku}</td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">Reorder: {item.reorderPoint} {item.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600 capitalize">{item.category.replace('_', ' ')}</td>
                    <td className="px-3 py-2 text-sm text-gray-600 capitalize">{item.type.replace('_', ' ')}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="text-sm font-semibold text-gray-900">{item.quantity}</div>
                      <div className="text-xs text-gray-500">{item.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-600">{item.location}</td>
                    <td className="px-3 py-2 text-sm text-right text-gray-900">{formatCurrency(item.unitCost)}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-right text-gray-900">{formatCurrency(item.totalValue)}</td>
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
                ))}
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
                setFormData({ 
                  startDate: new Date().toISOString().split('T')[0],
                  priority: 'normal',
                  status: 'in_progress'
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

        {/* Production Orders Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
                {productionOrders.map(order => {
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
                              setModalType('view_production'); 
                              setShowModal(true); 
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            title="View Details"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          {user?.role === 'Admin' && (
                            <button
                              onClick={() => handleDeleteProductionOrder(order.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                              title="Delete Order (Admin Only)"
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
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

  const openAddItemModal = () => {
    setFormData({
      sku: '',
      name: '',
      category: 'components',
      type: 'raw_material',
      quantity: 0,
      unit: 'pcs',
      reorderPoint: 0,
      reorderQty: 0,
      location: '',
      unitCost: 0,
      supplier: '',
      status: 'in_stock'
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

  const openAddBomModal = () => {
    setFormData({
      productSku: '',
      productName: '',
      version: '1.0',
      status: 'active',
      effectiveDate: new Date().toISOString().split('T')[0],
      laborCost: 0,
      overheadCost: 0,
      estimatedTime: 0,
      notes: ''
    });
    setBomComponents([]);
    setModalType('add_bom');
    setShowModal(true);
  };

  const openEditBomModal = (bom) => {
    setFormData({ ...bom });
    setBomComponents([...bom.components]);
    setSelectedItem(bom);
    setModalType('edit_bom');
    setShowModal(true);
  };

  const handleSaveItem = () => {
    const totalValue = formData.quantity * formData.unitCost;
    const newItem = {
      ...formData,
      id: selectedItem?.id || `INV${String(inventory.length + 1).padStart(3, '0')}`,
      totalValue,
      lastRestocked: new Date().toISOString().split('T')[0]
    };

    if (selectedItem) {
      // Edit existing
      setInventory(inventory.map(item => item.id === selectedItem.id ? newItem : item));
    } else {
      // Add new
      setInventory([...inventory, newItem]);
    }

    setShowModal(false);
    setSelectedItem(null);
    setFormData({});
  };

  const handleDeleteItem = (itemId) => {
    if (confirm('Are you sure you want to delete this item?')) {
      const updatedInventory = inventory.filter(item => item.id !== itemId);
      setInventory(updatedInventory);
      localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
      setShowModal(false);
    }
  };

  const handleSaveBom = () => {
    const totalMaterialCost = bomComponents.reduce((sum, comp) => sum + comp.totalCost, 0);
    const totalCost = totalMaterialCost + parseFloat(formData.laborCost || 0) + parseFloat(formData.overheadCost || 0);

    const newBom = {
      ...formData,
      id: selectedItem?.id || `BOM${String(boms.length + 1).padStart(3, '0')}`,
      components: bomComponents,
      totalMaterialCost,
      laborCost: parseFloat(formData.laborCost || 0),
      overheadCost: parseFloat(formData.overheadCost || 0),
      totalCost
    };

    if (selectedItem) {
      // Edit existing
      setBoms(boms.map(bom => bom.id === selectedItem.id ? newBom : bom));
    } else {
      // Add new
      setBoms([...boms, newBom]);
    }

    setShowModal(false);
    setSelectedItem(null);
    setFormData({});
    setBomComponents([]);
  };

  const handleDeleteBom = (bomId) => {
    if (confirm('Are you sure you want to delete this BOM?')) {
      const updatedBoms = boms.filter(bom => bom.id !== bomId);
      setBoms(updatedBoms);
      localStorage.setItem('manufacturing_boms', JSON.stringify(updatedBoms));
      setShowModal(false);
    }
  };

  const handleDeleteProductionOrder = (orderId) => {
    if (confirm('Are you sure you want to delete this production order? This action cannot be undone.')) {
      const updatedOrders = productionOrders.filter(order => order.id !== orderId);
      setProductionOrders(updatedOrders);
      localStorage.setItem('production_orders', JSON.stringify(updatedOrders));
    }
  };

  const handleDeleteMovement = (movementId) => {
    if (confirm('Are you sure you want to delete this stock movement? This will affect audit trail.')) {
      const updatedMovements = movements.filter(movement => movement.id !== movementId);
      setMovements(updatedMovements);
      localStorage.setItem('stock_movements', JSON.stringify(updatedMovements));
    }
  };

  const handleSaveProductionOrder = () => {
    const selectedBom = boms.find(b => b.id === formData.bomId);
    if (!selectedBom) return;

    const totalCost = selectedBom.totalCost * formData.quantity;
    const newOrder = {
      id: `PO${String(productionOrders.length + 1).padStart(4, '0')}`,
      bomId: formData.bomId,
      productSku: formData.productSku,
      productName: formData.productName,
      quantity: formData.quantity,
      quantityProduced: 0,
      status: formData.status || 'in_progress',
      priority: formData.priority || 'normal',
      startDate: formData.startDate,
      targetDate: formData.targetDate,
      completedDate: null,
      assignedTo: formData.assignedTo,
      totalCost: totalCost,
      notes: formData.notes || '',
      createdAt: new Date().toISOString().split('T')[0],
      createdBy: user?.name || 'System'
    };

    setProductionOrders([...productionOrders, newOrder]);
    setShowModal(false);
    setFormData({});
  };

  const handleUpdateProductionOrder = () => {
    const updatedOrder = {
      ...selectedItem,
      ...formData,
      completedDate: formData.status === 'completed' ? new Date().toISOString().split('T')[0] : selectedItem.completedDate
    };

    setProductionOrders(productionOrders.map(order => 
      order.id === selectedItem.id ? updatedOrder : order
    ));
    setShowModal(false);
    setSelectedItem(null);
    setFormData({});
  };

  const addBomComponent = () => {
    setBomComponents([...bomComponents, {
      sku: '',
      name: '',
      quantity: 1,
      unit: 'pcs',
      unitCost: 0,
      totalCost: 0
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
                {/* SKU */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
                  <input
                    type="text"
                    value={formData.sku || ''}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., GPS-MOD-001"
                  />
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

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                  <select
                    value={formData.category || 'components'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="components">Components</option>
                    <option value="packaging">Packaging</option>
                    <option value="accessories">Accessories</option>
                    <option value="finished_goods">Finished Goods</option>
                    <option value="work_in_progress">Work in Progress</option>
                  </select>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type || 'raw_material'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="raw_material">Raw Material</option>
                    <option value="finished_good">Finished Good</option>
                    <option value="wip">Work in Progress</option>
                  </select>
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    value={formData.quantity || 0}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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

                {/* Reorder Point */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Point</label>
                  <input
                    type="number"
                    value={formData.reorderPoint || 0}
                    onChange={(e) => setFormData({ ...formData, reorderPoint: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Reorder Quantity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Quantity</label>
                  <input
                    type="number"
                    value={formData.reorderQty || 0}
                    onChange={(e) => setFormData({ ...formData, reorderQty: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                  <select
                    value={formData.location || ''}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select location...</option>
                    {stockLocations.filter(loc => loc.status === 'active').map(loc => (
                      <option key={loc.id} value={loc.name}>{loc.name} ({loc.code})</option>
                    ))}
                  </select>
                </div>

                {/* Unit Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unit Cost (R) *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.unitCost || 0}
                    onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Supplier */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                  <input
                    type="text"
                    value={formData.supplier || ''}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., TechSupply SA"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status || 'in_stock'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="in_stock">In Stock</option>
                    <option value="low_stock">Low Stock</option>
                    <option value="out_of_stock">Out of Stock</option>
                    <option value="in_production">In Production</option>
                  </select>
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
              {/* BOM Header */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Product SKU *</label>
                  <input
                    type="text"
                    value={formData.productSku || ''}
                    onChange={(e) => setFormData({ ...formData, productSku: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., FT-BASIC-V1"
                  />
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                  <input
                    type="text"
                    value={formData.version || '1.0'}
                    onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
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
                      <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-gray-700 mb-1">SKU / Select from Inventory</label>
                          <select
                            value={comp.sku}
                            onChange={(e) => updateBomComponent(index, 'sku', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select or type...</option>
                            {inventory.filter(item => item.type === 'raw_material').map(item => (
                              <option key={item.sku} value={item.sku}>{item.sku} - {item.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
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
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Unit Cost (R)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={comp.unitCost}
                            onChange={(e) => updateBomComponent(index, 'unitCost', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="col-span-1 flex items-end">
                          <button
                            onClick={() => removeBomComponent(index)}
                            className="w-full px-2 py-1.5 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200"
                            title="Remove"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                        <div className="col-span-12 text-right">
                          <span className="text-xs text-gray-500">Total: </span>
                          <span className="text-sm font-semibold text-gray-900">{formatCurrency(comp.totalCost)}</span>
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
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={bomComponents.length === 0}
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

    if (modalType === 'add_production' || modalType === 'view_production') {
      const selectedBom = formData.bomId ? boms.find(b => b.id === formData.bomId) : null;
      const totalCost = selectedBom ? selectedBom.totalCost * (formData.quantity || 0) : 0;

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'add_production' ? 'New Production Order' : 'Production Order Details'}
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
                      disabled={modalType === 'view_production'}
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
                      value={formData.quantity || 0}
                      onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      min="1"
                      disabled={modalType === 'view_production'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                    <select
                      value={formData.priority || 'normal'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={modalType === 'view_production'}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={formData.startDate || new Date().toISOString().split('T')[0]}
                      onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={modalType === 'view_production'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Completion Date *</label>
                    <input
                      type="date"
                      value={formData.targetDate || ''}
                      onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      disabled={modalType === 'view_production'}
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
                      disabled={modalType === 'view_production'}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      value={formData.status || 'in_progress'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  {modalType === 'view_production' && (
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
                    disabled={modalType === 'view_production' && formData.status === 'completed'}
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
                  } else {
                    handleUpdateProductionOrder();
                  }
                }}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={!formData.bomId || !formData.quantity || !formData.startDate || !formData.targetDate || !formData.assignedTo}
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
                    <div>
                      <p className="text-xs text-gray-500">Version</p>
                      <p className="text-sm text-gray-900">{selectedItem.version}</p>
                    </div>
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

    return null;
  };

  const MovementsView = () => {
    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Stock Movements</h3>
            <div className="flex items-center gap-2">
              <button className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <i className="fas fa-filter text-xs"></i>
                Filter
              </button>
              <button
                onClick={() => { setModalType('add_movement'); setShowModal(true); }}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
                {movements.map(movement => (
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
                        {user?.role === 'Admin' && (
                          <button
                            onClick={() => handleDeleteMovement(movement.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                            title="Delete Movement (Admin Only)"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
          <div className="flex items-center gap-2">
            <button 
              onClick={handleClearAllData}
              className="px-3 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              title="Clear all manufacturing data"
            >
              <i className="fas fa-trash-alt text-xs"></i>
              Clear All Data
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'fa-chart-bar' },
            { id: 'inventory', label: 'Inventory', icon: 'fa-boxes' },
            { id: 'bom', label: 'Bill of Materials', icon: 'fa-clipboard-list' },
            { id: 'production', label: 'Production Orders', icon: 'fa-industry' },
            { id: 'movements', label: 'Stock Movements', icon: 'fa-exchange-alt' },
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

// Make available globally
window.Manufacturing = Manufacturing;
