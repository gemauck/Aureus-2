// Stock Locations Component - Manage warehouses, service LDVs, and stock transfers
const { useState, useEffect } = React;
const { useAuth } = window;

const StockLocations = ({ inventory, onInventoryUpdate }) => {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [locationInventory, setLocationInventory] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [activeView, setActiveView] = useState('locations'); // locations, transfers, reports
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [formData, setFormData] = useState({});
  const [transferItems, setTransferItems] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Load data from database
  useEffect(() => {
    const loadLocations = async () => {
      try {
        // Load from localStorage first for instant UI
        const cachedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        if (cachedLocations.length > 0) {
          setLocations(cachedLocations);
        }

        // Load from database
        if (window.DatabaseAPI && typeof window.DatabaseAPI.getStockLocations === 'function') {
          const response = await window.DatabaseAPI.getStockLocations();
          const dbLocations = response?.data?.locations || [];
          if (dbLocations.length > 0) {
            setLocations(dbLocations);
            localStorage.setItem('stock_locations', JSON.stringify(dbLocations));
          } else if (cachedLocations.length === 0) {
            // Fallback to initial locations if no data
            setLocations(getInitialLocations());
          }
        }
      } catch (error) {
        console.error('Error loading locations:', error);
        // Fallback to localStorage
        const loadedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        setLocations(loadedLocations.length ? loadedLocations : getInitialLocations());
      }
    };

    loadLocations();

    // Load other data from localStorage (these are not in database yet)
    const loadedLocationInventory = JSON.parse(localStorage.getItem('location_inventory') || '[]');
    const loadedTransfers = JSON.parse(localStorage.getItem('stock_transfers') || '[]');
    setLocationInventory(loadedLocationInventory);
    setTransfers(loadedTransfers);
  }, []);

  // Save data
  useEffect(() => {
    if (locations.length) localStorage.setItem('stock_locations', JSON.stringify(locations));
  }, [locations]);

  useEffect(() => {
    localStorage.setItem('location_inventory', JSON.stringify(locationInventory));
  }, [locationInventory]);

  useEffect(() => {
    localStorage.setItem('stock_transfers', JSON.stringify(transfers));
  }, [transfers]);

  const getInitialLocations = () => [
    {
      id: 'LOC001',
      code: 'WH-MAIN',
      name: 'Main Warehouse',
      type: 'warehouse',
      status: 'active',
      address: '123 Industrial Road, Johannesburg',
      contactPerson: 'Warehouse Manager',
      contactPhone: '+27 11 123 4567',
      createdDate: new Date().toISOString().split('T')[0]
    }
  ];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 2
    }).format(amount).replace('ZAR', 'R').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1 ');
  };

  const getLocationTypeIcon = (type) => {
    const icons = {
      warehouse: 'fa-warehouse',
      vehicle: 'fa-truck',
      site: 'fa-map-marker-alt',
      transit: 'fa-shipping-fast'
    };
    return icons[type] || 'fa-map-marker';
  };

  const getLocationTypeColor = (type) => {
    const colors = {
      warehouse: 'bg-blue-100 text-blue-700',
      vehicle: 'bg-green-100 text-green-700',
      site: 'bg-purple-100 text-purple-700',
      transit: 'bg-orange-100 text-orange-700'
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-green-100 text-green-700',
      inactive: 'bg-gray-100 text-gray-600',
      maintenance: 'bg-yellow-100 text-yellow-700',
      pending: 'bg-blue-100 text-blue-700',
      in_transit: 'bg-purple-100 text-purple-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-600';
  };

  const getLocationInventory = (locationId) => {
    return locationInventory.filter(item => item.locationId === locationId);
  };

  const getLocationStats = (locationId) => {
    const items = getLocationInventory(locationId);
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);
    const lowStockItems = items.filter(item => item.quantity <= item.reorderPoint).length;
    return { totalItems, totalValue, lowStockItems, uniqueItems: items.length };
  };

  const handleAddLocation = () => {
    setFormData({
      code: '',
      name: '',
      type: 'warehouse',
      status: 'active',
      address: '',
      contactPerson: '',
      contactPhone: '',
      vehicleReg: '',
      driver: ''
    });
    setModalType('add_location');
    setShowModal(true);
  };

  const handleEditLocation = (location) => {
    setSelectedLocation(location);
    setFormData({ ...location });
    setModalType('edit_location');
    setShowModal(true);
  };

  const handleSaveLocation = async () => {
    // Validate required fields
    if (!formData.code || !formData.name) {
      alert('Please fill in Location Code and Name');
      return;
    }

    try {
      const locationData = {
        code: formData.code,
        name: formData.name,
        type: formData.type || 'warehouse',
        status: formData.status || 'active',
        address: formData.address || '',
        contactPerson: formData.contactPerson || '',
        contactPhone: formData.contactPhone || '',
        meta: JSON.stringify({
          vehicleReg: formData.vehicleReg || '',
          driver: formData.driver || ''
        })
      };

      if (selectedLocation) {
        // Update existing location
        if (window.DatabaseAPI && typeof window.DatabaseAPI.updateStockLocation === 'function') {
          const response = await window.DatabaseAPI.updateStockLocation(selectedLocation.id, locationData);
          const updatedLocation = response?.data?.location;
          if (updatedLocation) {
            setLocations(locations.map(loc => loc.id === selectedLocation.id ? updatedLocation : loc));
            localStorage.setItem('stock_locations', JSON.stringify(locations.map(loc => loc.id === selectedLocation.id ? updatedLocation : loc)));
            alert('✅ Location updated successfully!');
          }
        } else {
          // Fallback to localStorage
          const newLocation = {
            ...selectedLocation,
            ...locationData,
            vehicleReg: formData.vehicleReg || '',
            driver: formData.driver || ''
          };
          setLocations(locations.map(loc => loc.id === selectedLocation.id ? newLocation : loc));
        }
      } else {
        // Create new location
        if (window.DatabaseAPI && typeof window.DatabaseAPI.createStockLocation === 'function') {
          const response = await window.DatabaseAPI.createStockLocation(locationData);
          const newLocation = response?.data?.location;
          if (newLocation) {
            // Reload locations list from database to get the full updated list
            const refreshResponse = await window.DatabaseAPI.getStockLocations();
            const refreshedLocations = refreshResponse?.data?.locations || [];
            setLocations(refreshedLocations);
            localStorage.setItem('stock_locations', JSON.stringify(refreshedLocations));
            
            // Notify parent component to refresh location dropdown
            if (window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('stockLocationsUpdated', { 
                detail: { locations: refreshedLocations } 
              }));
            }
            
            alert('✅ Location created successfully! Inventory items will be created for this location. The dropdown will refresh automatically.');
          } else {
            throw new Error('Failed to create location - no location returned from API');
          }
        } else {
          // Fallback to localStorage
          const newLocation = {
            id: `LOC${String(locations.length + 1).padStart(3, '0')}`,
            ...locationData,
            vehicleReg: formData.vehicleReg || '',
            driver: formData.driver || '',
            createdDate: new Date().toISOString().split('T')[0]
          };
          setLocations([...locations, newLocation]);
        }
      }

      setShowModal(false);
      setSelectedLocation(null);
      setFormData({});
    } catch (error) {
      console.error('Error saving location:', error);
      alert('❌ Failed to save location: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDeleteLocation = async (locationId) => {
    const locInventory = getLocationInventory(locationId);
    if (locInventory.length > 0) {
      alert('Cannot delete location with inventory. Please transfer stock first.');
      return;
    }

    if (confirm('Are you sure you want to delete this location?')) {
      try {
        if (window.DatabaseAPI && typeof window.DatabaseAPI.deleteStockLocation === 'function') {
          await window.DatabaseAPI.deleteStockLocation(locationId);
        }
        setLocations(locations.filter(loc => loc.id !== locationId));
        localStorage.setItem('stock_locations', JSON.stringify(locations.filter(loc => loc.id !== locationId)));
        alert('✅ Location deleted successfully!');
      } catch (error) {
        console.error('Error deleting location:', error);
        alert('❌ Failed to delete location: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleAllocateStock = (location) => {
    setSelectedLocation(location);
    setTransferItems([]);
    setFormData({
      fromLocation: 'LOC001', // Default to main warehouse
      toLocation: location.id,
      date: new Date().toISOString().split('T')[0],
      performedBy: user?.name || 'System',
      status: 'completed',
      notes: ''
    });
    setModalType('allocate_stock');
    setShowModal(true);
  };

  const handleTransferStock = () => {
    setTransferItems([]);
    setFormData({
      fromLocation: '',
      toLocation: '',
      date: new Date().toISOString().split('T')[0],
      performedBy: user?.name || 'System',
      status: 'completed',
      notes: ''
    });
    setModalType('transfer_stock');
    setShowModal(true);
  };

  const addTransferItem = () => {
    setTransferItems([...transferItems, {
      sku: '',
      itemName: '',
      quantity: 0,
      unitCost: 0,
      reason: ''
    }]);
  };

  const updateTransferItem = (index, field, value) => {
    const updated = [...transferItems];
    updated[index][field] = value;

    // Auto-fill from inventory
    if (field === 'sku') {
      const invItem = inventory.find(item => item.sku === value);
      if (invItem) {
        updated[index].itemName = invItem.name;
        updated[index].unitCost = invItem.unitCost;
      }
    }

    setTransferItems(updated);
  };

  const removeTransferItem = (index) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleSaveTransfer = () => {
    if (!formData.fromLocation || !formData.toLocation) {
      alert('Please select both from and to locations');
      return;
    }

    if (transferItems.length === 0) {
      alert('Please add at least one item to transfer');
      return;
    }

    // Validate quantities available at from location
    for (const item of transferItems) {
      const locInv = locationInventory.find(
        li => li.locationId === formData.fromLocation && li.sku === item.sku
      );
      if (!locInv || locInv.quantity < item.quantity) {
        alert(`Insufficient quantity of ${item.itemName} at source location`);
        return;
      }
    }

    // Create transfer record
    const newTransfer = {
      id: `TRF${String(transfers.length + 1).padStart(4, '0')}`,
      ...formData,
      items: transferItems,
      createdBy: user?.name || 'System',
      createdDate: new Date().toISOString()
    };

    setTransfers([...transfers, newTransfer]);

    // Update location inventory
    const updatedLocationInventory = [...locationInventory];

    transferItems.forEach(item => {
      // Deduct from source location
      const fromIndex = updatedLocationInventory.findIndex(
        li => li.locationId === formData.fromLocation && li.sku === item.sku
      );
      if (fromIndex >= 0) {
        updatedLocationInventory[fromIndex].quantity -= item.quantity;
        if (updatedLocationInventory[fromIndex].quantity === 0) {
          updatedLocationInventory.splice(fromIndex, 1);
        }
      }

      // Add to destination location
      const toIndex = updatedLocationInventory.findIndex(
        li => li.locationId === formData.toLocation && li.sku === item.sku
      );
      if (toIndex >= 0) {
        updatedLocationInventory[toIndex].quantity += item.quantity;
      } else {
        const invItem = inventory.find(inv => inv.sku === item.sku);
        updatedLocationInventory.push({
          locationId: formData.toLocation,
          itemId: invItem?.id || `INV${item.sku}`,
          sku: item.sku,
          itemName: item.itemName,
          quantity: item.quantity,
          unitCost: item.unitCost,
          reorderPoint: invItem?.reorderPoint || 0,
          lastRestocked: new Date().toISOString().split('T')[0],
          status: 'in_stock'
        });
      }
    });

    setLocationInventory(updatedLocationInventory);

    setShowModal(false);
    setTransferItems([]);
    setFormData({});
  };

  const LocationsView = () => {
    const filteredLocations = locations.filter(loc => {
      const matchesType = filterType === 'all' || loc.type === filterType;
      const matchesSearch = loc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           loc.code.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
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
                  placeholder="Search locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="warehouse">Warehouses</option>
                <option value="vehicle">Service LDVs</option>
                <option value="site">Sites</option>
                <option value="transit">Transit</option>
              </select>
            </div>
            <button
              onClick={handleAddLocation}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="fas fa-plus text-xs"></i>
              Add Location
            </button>
          </div>
        </div>

        {/* Location Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredLocations.map(location => {
            const stats = getLocationStats(location.id);

            return (
              <div key={location.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-md transition">
                <div className="p-3 border-b border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-lg ${getLocationTypeColor(location.type)} flex items-center justify-center`}>
                        <i className={`fas ${getLocationTypeIcon(location.type)}`}></i>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{location.name}</h3>
                        <p className="text-xs text-gray-500">{location.code}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(location.status)}`}>
                      {location.status}
                    </span>
                  </div>

                  {/* Vehicle-specific info */}
                  {location.type === 'vehicle' && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          <i className="fas fa-id-card mr-1"></i>
                          {location.vehicleReg}
                        </span>
                        <span className="text-gray-500">
                          <i className="fas fa-user mr-1"></i>
                          {location.driver}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-3">
                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-blue-50 p-2 rounded">
                      <p className="text-xs text-blue-600 font-medium">Items</p>
                      <p className="text-lg font-bold text-blue-700">{stats.uniqueItems}</p>
                      <p className="text-xs text-blue-600">{stats.totalItems} units</p>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                      <p className="text-xs text-green-600 font-medium">Value</p>
                      <p className="text-lg font-bold text-green-700">{formatCurrency(stats.totalValue)}</p>
                    </div>
                  </div>

                  {/* Low Stock Alert */}
                  {stats.lowStockItems > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mb-3">
                      <p className="text-xs text-yellow-800">
                        <i className="fas fa-exclamation-triangle mr-1"></i>
                        {stats.lowStockItems} items low stock
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedLocation(location);
                        setModalType('view_inventory');
                        setShowModal(true);
                      }}
                      className="flex-1 px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 font-medium"
                    >
                      <i className="fas fa-eye mr-1"></i>
                      View Stock
                    </button>
                    <button
                      onClick={() => handleAllocateStock(location)}
                      className="flex-1 px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 font-medium"
                    >
                      <i className="fas fa-plus mr-1"></i>
                      Allocate
                    </button>
                    <button
                      onClick={() => handleEditLocation(location)}
                      className="px-3 py-1.5 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const TransfersView = () => {
    return (
      <div className="space-y-3">
        {/* Controls */}
        <div className="bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Stock Transfers</h3>
            <button
              onClick={handleTransferStock}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <i className="fas fa-exchange-alt text-xs"></i>
              New Transfer
            </button>
          </div>
        </div>

        {/* Transfers Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Transfer ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">From → To</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Items</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Performed By</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transfers.map(transfer => {
                  const fromLoc = locations.find(l => l.id === transfer.fromLocation);
                  const toLoc = locations.find(l => l.id === transfer.toLocation);

                  return (
                    <tr key={transfer.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">{transfer.id}</td>
                      <td className="px-3 py-2 text-sm text-gray-600">{transfer.date}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-900">{fromLoc?.name || transfer.fromLocation}</span>
                          <i className="fas fa-arrow-right text-gray-400 text-xs"></i>
                          <span className="text-gray-900">{toLoc?.name || transfer.toLocation}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">
                        {transfer.items.length} item(s)
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(transfer.status)}`}>
                          {transfer.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-600">{transfer.performedBy}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => {
                            setSelectedLocation(transfer);
                            setModalType('view_transfer');
                            setShowModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
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

  const renderModal = () => {
    if (modalType === 'add_location' || modalType === 'edit_location') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'add_location' ? 'Add Stock Location' : 'Edit Stock Location'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); setFormData({}); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location Code *</label>
                  <input
                    type="text"
                    value={formData.code || ''}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., WH-A01 or LDV-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Main Warehouse or Service LDV 1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type || 'warehouse'}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="vehicle">Service LDV</option>
                    <option value="site">Site/Customer Location</option>
                    <option value="transit">Transit</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.status || 'active'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>

                {/* Vehicle-specific fields */}
                {formData.type === 'vehicle' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Registration *</label>
                      <input
                        type="text"
                        value={formData.vehicleReg || ''}
                        onChange={(e) => setFormData({ ...formData, vehicleReg: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., ABC123GP"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Driver/Assigned To *</label>
                      <input
                        type="text"
                        value={formData.driver || ''}
                        onChange={(e) => setFormData({ ...formData, driver: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="e.g., David Buttemer"
                      />
                    </div>
                  </>
                )}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={formData.address || ''}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Physical address"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contactPerson || ''}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={formData.contactPhone || ''}
                    onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="+27 11 123 4567"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-between bg-gray-50">
              <div>
                {modalType === 'edit_location' && (
                  <button
                    onClick={() => handleDeleteLocation(selectedLocation.id)}
                    className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Delete Location
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowModal(false); setSelectedLocation(null); setFormData({}); }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLocation}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  disabled={!formData.code || !formData.name}
                >
                  {modalType === 'add_location' ? 'Add Location' : 'Update Location'}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'allocate_stock' || modalType === 'transfer_stock') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalType === 'allocate_stock' ? `Allocate Stock to ${selectedLocation?.name}` : 'Transfer Stock'}
              </h2>
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); setFormData({}); setTransferItems([]); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Transfer Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Location *</label>
                  <select
                    value={formData.fromLocation || ''}
                    onChange={(e) => setFormData({ ...formData, fromLocation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={modalType === 'allocate_stock'}
                  >
                    <option value="">Select location...</option>
                    {locations.filter(l => l.status === 'active').map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Location *</label>
                  <select
                    value={formData.toLocation || ''}
                    onChange={(e) => setFormData({ ...formData, toLocation: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={modalType === 'allocate_stock'}
                  >
                    <option value="">Select location...</option>
                    {locations.filter(l => l.status === 'active').map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={formData.date || ''}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Performed By</label>
                  <input
                    type="text"
                    value={formData.performedBy || ''}
                    onChange={(e) => setFormData({ ...formData, performedBy: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    readOnly
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Transfer reason or notes..."
                  />
                </div>
              </div>

              {/* Transfer Items */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">Items to Transfer</h3>
                  <button
                    onClick={addTransferItem}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <i className="fas fa-plus text-xs"></i>
                    Add Item
                  </button>
                </div>

                {transferItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    No items added. Click "Add Item" to start.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transferItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="col-span-4">
                          <label className="block text-xs font-medium text-gray-700 mb-1">SKU / Item</label>
                          <select
                            value={item.sku}
                            onChange={(e) => updateTransferItem(index, 'sku', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          >
                            <option value="">Select item...</option>
                            {inventory.map(inv => (
                              <option key={inv.sku} value={inv.sku}>{inv.sku} - {inv.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Item Name</label>
                          <input
                            type="text"
                            value={item.itemName}
                            readOnly
                            className="w-full px-2 py-1.5 text-sm bg-gray-100 border border-gray-300 rounded"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateTransferItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            min="1"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                          <input
                            type="text"
                            value={item.reason}
                            onChange={(e) => updateTransferItem(index, 'reason', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Optional"
                          />
                        </div>
                        <div className="col-span-1 flex items-end">
                          <button
                            onClick={() => removeTransferItem(index)}
                            className="w-full px-2 py-1.5 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end gap-2 bg-gray-50">
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); setFormData({}); setTransferItems([]); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTransfer}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                disabled={transferItems.length === 0}
              >
                Complete Transfer
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'view_inventory') {
      const locInventory = getLocationInventory(selectedLocation?.id);

      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">
                Inventory at {selectedLocation?.name}
              </h2>
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {locInventory.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <i className="fas fa-box-open text-4xl mb-3 opacity-50"></i>
                  <p className="text-sm">No inventory at this location</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Quantity</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Total Value</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {locInventory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm font-medium text-gray-900">{item.sku}</td>
                          <td className="px-3 py-2 text-sm text-gray-900">{item.itemName}</td>
                          <td className="px-3 py-2 text-sm text-right font-semibold text-gray-900">{item.quantity}</td>
                          <td className="px-3 py-2 text-sm text-right text-gray-600">{formatCurrency(item.unitCost)}</td>
                          <td className="px-3 py-2 text-sm text-right font-semibold text-gray-900">
                            {formatCurrency(item.quantity * item.unitCost)}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.quantity <= item.reorderPoint ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {item.quantity <= item.reorderPoint ? 'Low Stock' : 'In Stock'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (modalType === 'view_transfer') {
      return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">Transfer Details</h2>
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4">
              {selectedLocation && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500">Transfer ID</p>
                      <p className="text-sm font-semibold text-gray-900">{selectedLocation.id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Status</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedLocation.status)}`}>
                        {selectedLocation.status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">From Location</p>
                      <p className="text-sm text-gray-900">
                        {locations.find(l => l.id === selectedLocation.fromLocation)?.name || selectedLocation.fromLocation}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">To Location</p>
                      <p className="text-sm text-gray-900">
                        {locations.find(l => l.id === selectedLocation.toLocation)?.name || selectedLocation.toLocation}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Date</p>
                      <p className="text-sm text-gray-900">{selectedLocation.date}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Performed By</p>
                      <p className="text-sm text-gray-900">{selectedLocation.performedBy}</p>
                    </div>
                    {selectedLocation.notes && (
                      <div className="col-span-2">
                        <p className="text-xs text-gray-500">Notes</p>
                        <p className="text-sm text-gray-900">{selectedLocation.notes}</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Transferred Items</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">SKU</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Quantity</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Reason</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {selectedLocation.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.sku}</td>
                              <td className="px-3 py-2 text-sm text-gray-900">{item.itemName}</td>
                              <td className="px-3 py-2 text-sm text-right font-semibold text-gray-900">{item.quantity}</td>
                              <td className="px-3 py-2 text-sm text-gray-600">{item.reason || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => { setShowModal(false); setSelectedLocation(null); }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white p-3 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Stock Locations Management</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Track inventory across warehouses, service LDVs, and sites
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTransferStock}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5"
            >
              <i className="fas fa-exchange-alt text-[10px]"></i>
              Transfer Stock
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'locations', label: 'Locations', icon: 'fa-map-marked-alt' },
            { id: 'transfers', label: 'Transfer History', icon: 'fa-exchange-alt' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeView === tab.id
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

      {/* Content */}
      <div>
        {activeView === 'locations' && <LocationsView />}
        {activeView === 'transfers' && <TransfersView />}
      </div>

      {/* Modal */}
      {showModal && renderModal()}
    </div>
  );
};

// Make available globally
window.StockLocations = StockLocations;
