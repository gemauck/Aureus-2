// Public Job Card Form - Accessible without login
// Standalone form for technicians to submit job cards offline
const { useState, useEffect, useCallback, useRef } = React;

const JobCardFormPublic = () => {
  const [formData, setFormData] = useState({
    agentName: '',
    otherTechnicians: [],
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    location: '',
    timeOfDeparture: '',
    timeOfArrival: '',
    vehicleUsed: '',
    kmReadingBefore: '',
    kmReadingAfter: '',
    reasonForVisit: '',
    diagnosis: '',
    actionsTaken: '',
    stockUsed: [],
    materialsBought: [],
    otherComments: '',
    photos: [],
    status: 'draft'
  });
  const [technicianInput, setTechnicianInput] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  const [newStockItem, setNewStockItem] = useState({ sku: '', quantity: 0, locationId: '' });
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      console.log('🌐 Connection restored');
    };
    const handleOffline = () => {
      setIsOnline(false);
      console.log('📴 Connection lost - working offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load clients (public access - cached)
  useEffect(() => {
    const loadClients = async () => {
      try {
        // Try multiple localStorage keys that might have client data
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_clients') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('clients') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        
        const activeClients = Array.isArray(cached) ? cached.filter(c => {
          const status = (c.status || '').toLowerCase();
          const type = (c.type || 'client').toLowerCase();
          return (status === 'active' || status === '' || !c.status) && 
                 (type === 'client' || !c.type);
        }) : [];
        
        console.log('📋 JobCardFormPublic: Loaded clients from cache:', activeClients.length);
        
        if (activeClients.length > 0) {
          setClients(activeClients);
          setIsLoading(false); // Set loading false if we have cached data
        }

        // Try to sync from API if online (might require auth, but try anyway)
        if (isOnline) {
          try {
            console.log('🌐 JobCardFormPublic: Attempting to fetch clients from API...');
            const response = await fetch('/api/clients', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const allClients = data?.data?.clients || data?.data || [];
              const active = Array.isArray(allClients) ? allClients.filter(c => {
                const status = (c.status || '').toLowerCase();
                const type = (c.type || 'client').toLowerCase();
                return (status === 'active' || status === '' || !c.status) && 
                       (type === 'client' || !c.type);
              }) : [];
              
              if (active.length > 0) {
                console.log('✅ JobCardFormPublic: Loaded clients from API:', active.length);
                setClients(active);
                localStorage.setItem('manufacturing_clients', JSON.stringify(active));
                localStorage.setItem('clients', JSON.stringify(active)); // Also save to main key
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: API returned status', response.status, '- using cached data');
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load clients from API, using cache:', error.message);
          }
        }
        
        // Set loading false even if no cached data (show form with empty selects)
        if (activeClients.length === 0) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading clients:', error);
        setIsLoading(false);
      }
    };
    loadClients();
  }, [isOnline]);

  // Load users (for technician selection)
  useEffect(() => {
    const loadUsers = async () => {
      try {
        // Try multiple localStorage keys
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_users') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('users') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        
        console.log('👥 JobCardFormPublic: Loaded users from cache:', cached.length);
        
        if (cached.length > 0) {
          setUsers(cached);
        }

        if (isOnline) {
          try {
            console.log('🌐 JobCardFormPublic: Attempting to fetch users from API...');
            const response = await fetch('/api/users', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const usersData = data?.data?.users || data?.data || [];
              if (Array.isArray(usersData) && usersData.length > 0) {
                console.log('✅ JobCardFormPublic: Loaded users from API:', usersData.length);
                setUsers(usersData);
                localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                localStorage.setItem('users', JSON.stringify(usersData)); // Also save to main key
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Users API returned status', response.status, '- using cached data');
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load users from API, using cache:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading users:', error);
      }
    };
    loadUsers();
  }, [isOnline]);

  // Load inventory and stock locations
  useEffect(() => {
    const loadStockData = async () => {
      try {
        // Load inventory from cache
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        console.log('📦 JobCardFormPublic: Loaded inventory from cache:', cachedInventory.length);
        
        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
        }

        // Try to load from API if online
        if (isOnline) {
          try {
            console.log('🌐 JobCardFormPublic: Attempting to fetch inventory from API...');
            const invResponse = await fetch('/api/manufacturing/inventory', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (invResponse.ok) {
              const invData = await invResponse.json();
              const inventoryItems = invData?.data?.inventory || invData?.data || [];
              if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
                console.log('✅ JobCardFormPublic: Loaded inventory from API:', inventoryItems.length);
                setInventory(inventoryItems);
                localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Inventory API returned status', invResponse.status, '- using cached data');
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load inventory from API:', error.message);
          }
        }
        
        // Load stock locations - try multiple keys and provide defaults
        const cachedLocations1 = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        const cachedLocations2 = JSON.parse(localStorage.getItem('manufacturing_locations') || '[]');
        const cachedLocations = cachedLocations1.length > 0 ? cachedLocations1 : cachedLocations2;
        
        console.log('📍 JobCardFormPublic: Loaded locations from cache:', cachedLocations.length);
        
        if (cachedLocations.length > 0) {
          setStockLocations(cachedLocations);
        } else {
          // Provide default locations if none cached
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse', status: 'active' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle', status: 'active' }
          ];
          console.log('📍 JobCardFormPublic: Using default locations');
          setStockLocations(defaultLocations);
          localStorage.setItem('stock_locations', JSON.stringify(defaultLocations));
        }
        
        // Try to load locations from API if online
        if (isOnline) {
          try {
            console.log('🌐 JobCardFormPublic: Attempting to fetch locations from API...');
            const locResponse = await fetch('/api/manufacturing/locations', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (locResponse.ok) {
              const locData = await locResponse.json();
              const locations = locData?.data?.locations || locData?.data || [];
              if (Array.isArray(locations) && locations.length > 0) {
                console.log('✅ JobCardFormPublic: Loaded locations from API:', locations.length);
                setStockLocations(locations);
                localStorage.setItem('stock_locations', JSON.stringify(locations));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Locations API returned status', locResponse.status, '- using cached data');
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load locations from API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading stock data:', error);
      }
    };
    loadStockData();
  }, [isOnline]);

  // Load sites when client changes
  useEffect(() => {
    if (formData.clientId && clients.length > 0) {
      const client = clients.find(c => c.id === formData.clientId);
      if (client) {
        const sites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
        setAvailableSites(sites);
        setFormData(prev => ({ ...prev, clientName: client.name || '' }));
      }
    } else {
      setAvailableSites([]);
      setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
    }
  }, [formData.clientId, clients]);

  // Set site name when site changes
  useEffect(() => {
    if (formData.siteId && availableSites.length > 0) {
      const site = availableSites.find(s => s.id === formData.siteId);
      if (site) {
        setFormData(prev => ({ ...prev, siteName: site.name || '' }));
      }
    }
  }, [formData.siteId, availableSites]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTechnician = () => {
    const techName = technicianInput.trim();
    if (techName && !formData.otherTechnicians.includes(techName)) {
      setFormData(prev => ({
        ...prev,
        otherTechnicians: [...prev.otherTechnicians, techName]
      }));
      setTechnicianInput('');
    }
  };

  const handleRemoveTechnician = (technician) => {
    setFormData(prev => ({
      ...prev,
      otherTechnicians: prev.otherTechnicians.filter(t => t !== technician)
    }));
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          setSelectedPhotos(prev => [...prev, { name: file.name, url: dataUrl, size: file.size }]);
          setFormData(prev => ({ ...prev, photos: [...prev.photos, dataUrl] }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemovePhoto = (index) => {
    const newPhotos = selectedPhotos.filter((_, i) => i !== index);
    setSelectedPhotos(newPhotos);
    setFormData(prev => ({ ...prev, photos: newPhotos.map(p => typeof p === 'string' ? p : p.url) }));
  };

  // Stock usage handlers
  const handleAddStockItem = () => {
    if (!newStockItem.sku || !newStockItem.locationId || newStockItem.quantity <= 0) {
      alert('Please select a component, location, and enter quantity > 0');
      return;
    }
    
    const invItem = inventory.find(item => item.sku === newStockItem.sku || item.id === newStockItem.sku);
    if (!invItem) {
      alert('Selected item not found in inventory');
      return;
    }

    const stockItem = {
      id: Date.now().toString(),
      sku: invItem.sku || invItem.id,
      itemName: invItem.name || '',
      quantity: parseFloat(newStockItem.quantity),
      locationId: newStockItem.locationId,
      locationName: stockLocations.find(loc => loc.id === newStockItem.locationId)?.name || '',
      unitCost: invItem.unitCost || 0
    };

    setFormData(prev => ({
      ...prev,
      stockUsed: [...prev.stockUsed, stockItem]
    }));
    
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
  };

  const handleRemoveStockItem = (id) => {
    setFormData(prev => ({
      ...prev,
      stockUsed: prev.stockUsed.filter(item => item.id !== id)
    }));
  };

  // Materials bought handlers
  const handleAddMaterialItem = () => {
    if (!newMaterialItem.itemName || newMaterialItem.cost <= 0) {
      alert('Please enter item name and cost > 0');
      return;
    }

    const materialItem = {
      id: Date.now().toString(),
      itemName: newMaterialItem.itemName,
      description: newMaterialItem.description || '',
      reason: newMaterialItem.reason || '',
      cost: parseFloat(newMaterialItem.cost)
    };

    setFormData(prev => ({
      ...prev,
      materialsBought: [...prev.materialsBought, materialItem]
    }));
    
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
  };

  const handleRemoveMaterialItem = (id) => {
    setFormData(prev => ({
      ...prev,
      materialsBought: prev.materialsBought.filter(item => item.id !== id)
    }));
  };

  const handleSave = async () => {
    // Validation: Only Client is required
    if (!formData.clientId) {
      alert('Please select a client');
      return;
    }

    setIsSubmitting(true);
    try {
      const jobCardData = {
        ...formData,
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Calculate travel kilometers
      const kmBefore = parseFloat(formData.kmReadingBefore) || 0;
      const kmAfter = parseFloat(formData.kmReadingAfter) || 0;
      jobCardData.travelKilometers = Math.max(0, kmAfter - kmBefore);

      // Calculate total cost for materials bought
      jobCardData.totalMaterialsCost = (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0);

      // Create stock movements for any stock used (regardless of job card status)
      if (formData.stockUsed && formData.stockUsed.length > 0) {
        try {
          const jobCardId = jobCardData.id;
          const jobCardReference = `Job Card ${jobCardId}`;
          
          for (const stockItem of formData.stockUsed) {
            if (!stockItem.locationId || !stockItem.sku || stockItem.quantity <= 0) {
              console.warn('Skipping invalid stock item:', stockItem);
              continue;
            }

            const movementData = {
              type: 'consumption',
              sku: stockItem.sku,
              itemName: stockItem.itemName || '',
              quantity: parseFloat(stockItem.quantity),
              unitCost: stockItem.unitCost ? parseFloat(stockItem.unitCost) : undefined,
              fromLocation: stockItem.locationId,
              toLocation: '',
              reference: jobCardReference,
              notes: `Stock used in job card: ${jobCardReference}${formData.location ? ` - Location: ${formData.location}` : ''}`,
              date: new Date().toISOString()
            };

            // Store in localStorage (works offline)
            const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
            cachedMovements.push({
              ...movementData,
              id: `MOV${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              synced: false
            });
            localStorage.setItem('manufacturing_movements', JSON.stringify(cachedMovements));
            
            // Try to sync if online (fire and forget)
            if (isOnline && window.DatabaseAPI?.createStockMovement) {
              window.DatabaseAPI.createStockMovement(movementData).catch(err => {
                console.warn('Failed to sync stock movement:', err);
              });
            }
          }
        } catch (error) {
          console.error('Error creating stock movements:', error);
        }
      }

      // Save to localStorage (offline support)
      const existingJobCards = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      const updatedJobCards = [...existingJobCards, jobCardData];
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));

      // Try to sync with API if online (fire and forget - no auth blocking)
      if (isOnline && window.DatabaseAPI?.createJobCard) {
        try {
          await window.DatabaseAPI.createJobCard(jobCardData);
        } catch (error) {
          console.warn('⚠️ Failed to sync job card to API, saved offline:', error.message);
        }
      }

      alert('✅ Job card saved successfully!' + (isOnline ? '' : ' (Saved offline - will sync when online)'));
      
      // Reset form
      setFormData({
        agentName: '',
        otherTechnicians: [],
        clientId: '',
        clientName: '',
        siteId: '',
        siteName: '',
        location: '',
        timeOfDeparture: '',
        timeOfArrival: '',
        vehicleUsed: '',
        kmReadingBefore: '',
        kmReadingAfter: '',
        reasonForVisit: '',
        diagnosis: '',
        actionsTaken: '',
        stockUsed: [],
        materialsBought: [],
        otherComments: '',
        photos: [],
        status: 'draft'
      });
      setSelectedPhotos([]);
      setTechnicianInput('');
      setNewStockItem({ sku: '', quantity: 0, locationId: '' });
      setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    } catch (error) {
      console.error('Error saving job card:', error);
      alert(`Failed to save job card: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableTechnicians = users.filter(u => u.status !== 'inactive' && u.status !== 'suspended');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading form...</p>
        </div>
      </div>
    );
  }

  const travelKm = formData.kmReadingBefore && formData.kmReadingAfter
    ? parseFloat(formData.kmReadingAfter) - parseFloat(formData.kmReadingBefore)
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-4 px-3 sm:py-8 sm:px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Job Card Form</h1>
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                {!isOnline && <span className="text-orange-600">⚠️ Offline Mode - Changes will sync when connection is restored</span>}
                {isOnline && <span className="text-green-600">✓ Online</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4 sm:space-y-6">
          {/* Agent Name */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Agent Name *
            </label>
            <select
              name="agentName"
              value={formData.agentName}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            >
              <option value="">Select technician</option>
              {availableTechnicians.map(tech => (
                <option key={tech.id} value={tech.name || tech.email}>
                  {tech.name || tech.email} {tech.department ? `(${tech.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Client - REQUIRED */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client *
            </label>
            <select
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            >
              <option value="">Select client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          {/* Rest of form fields - copy from JobCards.jsx but simplified */}
          {/* Site - OPTIONAL */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Site
            </label>
            <select
              name="siteId"
              value={formData.siteId}
              onChange={handleChange}
              disabled={!formData.clientId || availableSites.length === 0}
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 bg-white"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            >
              <option value="">
                {availableSites.length === 0 ? 'No sites available for this client' : 'Select site'}
              </option>
              {availableSites.map(site => (
                <option key={site.id || site.name} value={site.id || site.name}>
                  {site.name || site}
                </option>
              ))}
            </select>
          </div>

          {/* Location */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Specific location details"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            />
          </div>

          {/* Reason for Visit - OPTIONAL */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Call Out / Visit
            </label>
            <textarea
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Why was the agent requested to come out?"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            />
          </div>

          {/* Time of Departure and Arrival */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time of Departure
                </label>
                <input
                  type="datetime-local"
                  name="timeOfDeparture"
                  value={formData.timeOfDeparture}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time of Arrival
                </label>
                <input
                  type="datetime-local"
                  name="timeOfArrival"
                  value={formData.timeOfArrival}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
            </div>
          </div>

          {/* Vehicle and Kilometer Readings */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle Used
                </label>
                <input
                  type="text"
                  name="vehicleUsed"
                  value={formData.vehicleUsed}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., AB12 CD 3456"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KM Reading Before
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="kmReadingBefore"
                  value={formData.kmReadingBefore}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KM Reading After
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="kmReadingAfter"
                  value={formData.kmReadingAfter}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
            </div>
          </div>

          {/* Travel Kilometers Display */}
          {travelKm > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-900">
                Travel Distance: {travelKm.toFixed(1)} km
              </p>
            </div>
          )}

          {/* Diagnosis */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Diagnosis
            </label>
            <textarea
              name="diagnosis"
              value={formData.diagnosis}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Notes and comments about diagnosis"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            />
          </div>

          {/* Actions Taken */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Actions Taken
            </label>
            <textarea
              name="actionsTaken"
              value={formData.actionsTaken}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Describe what actions were taken to resolve the issue"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            />
          </div>

          {/* Stock Used Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Stock Used</h3>
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 mb-3">
              <div className="sm:col-span-4">
                <select
                  value={newStockItem.sku}
                  onChange={(e) => setNewStockItem({ ...newStockItem, sku: e.target.value })}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg bg-white"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                >
                  <option value="">Select component</option>
                  {inventory.map(item => (
                    <option key={item.id || item.sku} value={item.sku || item.id}>
                      {item.name} ({item.sku || item.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4">
                <select
                  value={newStockItem.locationId}
                  onChange={(e) => setNewStockItem({ ...newStockItem, locationId: e.target.value })}
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg bg-white"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                >
                  <option value="">Select location</option>
                  {stockLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newStockItem.quantity || ''}
                  onChange={(e) => setNewStockItem({ ...newStockItem, quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Qty"
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddStockItem}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
                >
                  <i className="fas fa-plus mr-1"></i>Add
                </button>
              </div>
            </div>
            {formData.stockUsed.length > 0 && (
              <div className="space-y-2">
                {formData.stockUsed.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                      <p className="text-xs text-gray-600">
                        {item.locationName} • Qty: {item.quantity} • SKU: {item.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStockItem(item.id)}
                      className="ml-2 text-red-600 hover:text-red-800"
                      title="Remove"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Materials Bought Section */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Materials Bought (Not from Stock)</h3>
            <div className="space-y-3 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newMaterialItem.itemName}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, itemName: e.target.value })}
                  placeholder="Item Name *"
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newMaterialItem.cost || ''}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="Cost (R) *"
                  className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg"
                  style={{ fontSize: '16px' }} // Prevent zoom on iOS
                />
              </div>
              <input
                type="text"
                value={newMaterialItem.description}
                onChange={(e) => setNewMaterialItem({ ...newMaterialItem, description: e.target.value })}
                placeholder="Description"
                className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg"
                style={{ fontSize: '16px' }} // Prevent zoom on iOS
              />
              <input
                type="text"
                value={newMaterialItem.reason}
                onChange={(e) => setNewMaterialItem({ ...newMaterialItem, reason: e.target.value })}
                placeholder="Reason for purchase"
                className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg"
                style={{ fontSize: '16px' }} // Prevent zoom on iOS
              />
              <button
                type="button"
                onClick={handleAddMaterialItem}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add Material
              </button>
            </div>
            {formData.materialsBought.length > 0 && (
              <div className="space-y-2">
                {formData.materialsBought.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                        )}
                        {item.reason && (
                          <p className="text-xs text-gray-500 mt-1">Reason: {item.reason}</p>
                        )}
                        <p className="text-sm font-semibold text-gray-900 mt-2">R {item.cost.toFixed(2)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterialItem(item.id)}
                        className="ml-2 text-red-600 hover:text-red-800"
                        title="Remove"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="border-t border-gray-300 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-900">Total Cost:</span>
                    <span className="text-lg font-bold text-blue-600">
                      R {formData.materialsBought.reduce((sum, item) => sum + (item.cost || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Other Comments */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Other Comments
            </label>
            <textarea
              name="otherComments"
              value={formData.otherComments}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-3 text-base sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Additional comments or observations"
              style={{ fontSize: '16px' }} // Prevent zoom on iOS
            />
          </div>

          {/* Submit Button */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
            <button
              type="submit"
              disabled={isSubmitting || !formData.clientId}
              className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base touch-manipulation"
            >
              {isSubmitting ? 'Saving...' : 'Save Job Card'}
            </button>
            <p className="text-xs text-gray-500 mt-3 text-center">
              * Client is required. Other fields are optional.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

// Register component globally
try {
  window.JobCardFormPublic = JobCardFormPublic;
  if (window.debug && !window.debug.performanceMode) {
    console.log('✅ JobCardFormPublic.jsx loaded and registered');
  }
} catch (error) {
  console.error('❌ JobCardFormPublic.jsx: Error registering component:', error);
}

