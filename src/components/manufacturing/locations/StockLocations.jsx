const StockLocations = ({ inventory = [], onInventoryUpdate }) => {
  const ReactGlobal = window.React || {};
  const { useState, useEffect } = ReactGlobal;
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    type: 'warehouse',
    address: ''
  });
  const [editingLocation, setEditingLocation] = useState(null);

  const loadLocations = async () => {
    if (!window.DatabaseAPI || typeof window.DatabaseAPI.getStockLocations !== 'function') {
      console.error('❌ StockLocations: DatabaseAPI.getStockLocations is not available');
      return;
    }
    setIsLoading(true);
    try {
      const response = await window.DatabaseAPI.getStockLocations();
      const locs = response?.data?.locations || [];
      setLocations(locs);
      localStorage.setItem('stock_locations', JSON.stringify(locs));

      // Notify Manufacturing.jsx about updated locations
      if (typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('stockLocationsUpdated', {
          detail: { locations: locs }
        }));
      }
    } catch (error) {
      console.error('❌ StockLocations: Failed to load locations', error);
      const cached = JSON.parse(localStorage.getItem('stock_locations') || '[]');
      if (cached.length) {
        setLocations(cached);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  const resetForm = () => {
    setEditingLocation(null);
    setFormData({
      name: '',
      code: '',
      type: 'warehouse',
      address: ''
    });
  };

  const handleEdit = (loc) => {
    setEditingLocation(loc);
    setFormData({
      name: loc.name || '',
      code: loc.code || '',
      type: loc.type || 'warehouse',
      address: loc.address || ''
    });
  };

  const handleDelete = async (loc) => {
    if (!window.DatabaseAPI || typeof window.DatabaseAPI.deleteStockLocation !== 'function') {
      console.error('❌ StockLocations: DatabaseAPI.deleteStockLocation is not available');
      return;
    }
    if (!window.confirm(`Delete location "${loc.name}" (${loc.code})? This cannot be undone.`)) {
      return;
    }
    setIsSaving(true);
    try {
      await window.DatabaseAPI.deleteStockLocation(loc.id);
      await loadLocations();
    } catch (error) {
      console.error('❌ StockLocations: Failed to delete location', error);
      alert('Failed to delete location. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!window.DatabaseAPI) {
      console.error('❌ StockLocations: DatabaseAPI is not available');
      return;
    }
    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim(),
      type: formData.type,
      address: formData.address.trim() || undefined
    };
    if (!payload.name || !payload.code) {
      alert('Name and Code are required.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingLocation && typeof window.DatabaseAPI.updateStockLocation === 'function') {
        await window.DatabaseAPI.updateStockLocation(editingLocation.id, payload);
      } else if (typeof window.DatabaseAPI.createStockLocation === 'function') {
        await window.DatabaseAPI.createStockLocation(payload);
      } else {
        console.error('❌ StockLocations: create/update API methods are not available');
      }
      resetForm();
      await loadLocations();
    } catch (error) {
      console.error('❌ StockLocations: Failed to save location', error);
      alert('Failed to save location. Please check console for details.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Stock Locations</h2>
          <p className="text-sm text-gray-500">
            Manage warehouses and stock locations used by the Manufacturing module.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Existing Locations</h3>
            <span className="text-xs text-gray-500">
              {isLoading ? 'Loading…' : `${locations.length} location${locations.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Code</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Type</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Address</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {locations.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                      No stock locations defined yet. Use the form on the right to add your first location.
                    </td>
                  </tr>
                )}
                {locations.map(loc => (
                  <tr key={loc.id}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-900">{loc.code}</td>
                    <td className="px-4 py-2 text-gray-900">{loc.name}</td>
                    <td className="px-4 py-2 text-gray-700 capitalize">{loc.type || 'warehouse'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{loc.address || '—'}</td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(loc)}
                        className="inline-flex items-center px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(loc)}
                        className="inline-flex items-center px-2 py-1 text-xs border border-red-300 text-red-700 rounded hover:bg-red-50"
                        disabled={isSaving}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            {editingLocation ? 'Edit Location' : 'Add Location'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Code</label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="LOC001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Main Warehouse"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="warehouse">Warehouse</option>
                <option value="site">Site</option>
                <option value="store">Store</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Address (optional)</label>
              <textarea
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center px-3 py-2 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSaving ? 'Saving…' : (editingLocation ? 'Update Location' : 'Add Location')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Register globally so Manufacturing.jsx can render this via window.StockLocations
try {
  if (typeof window !== 'undefined') {
    window.StockLocations = StockLocations;
    console.log('✅ StockLocations component registered on window.StockLocations');
  }
} catch (error) {
  console.error('❌ StockLocations.jsx: Error registering component on window.StockLocations', error);
}

export default StockLocations;
