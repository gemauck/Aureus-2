// Job Cards Page Component for Manufacturing
// Features:
// - Offline support with localStorage + API sync
// - Technicians selectable from users list
// - Clients selectable from clients list
// - Sites selectable per client

const { useState, useEffect, useCallback, useRef } = React;
const { useAuth } = window;

const JobCards = ({ clients: clientsProp, users: usersProp }) => {
  const { user } = useAuth();
  const [jobCards, setJobCards] = useState([]);
  const [users, setUsers] = useState(usersProp || []);
  const [clients, setClients] = useState(clientsProp || []);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddPage, setShowAddPage] = useState(false);
  const [editingJobCard, setEditingJobCard] = useState(null);
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

  // Load job cards with offline support - defined as a stable function reference
  const loadJobCardsRef = useRef(null);
  
  const loadJobCards = useCallback(async () => {
    setIsLoading(true);
    try {
      // First, try to load from localStorage (offline support)
      const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      if (cached.length > 0) {
        setJobCards(cached);
        setIsLoading(false);
      }

      // Then try to sync from API if online
      const onlineStatus = navigator.onLine;
      if (onlineStatus && window.DatabaseAPI?.getJobCards) {
        try {
          const response = await window.DatabaseAPI.getJobCards();
          const jobCardsData = response?.data?.jobCards || response?.data || [];
          if (Array.isArray(jobCardsData) && jobCardsData.length > 0) {
            setJobCards(jobCardsData);
            localStorage.setItem('manufacturing_jobcards', JSON.stringify(jobCardsData));
          }
        } catch (error) {
          console.warn('⚠️ Failed to sync job cards from API, using cached data:', error.message);
        }
      }
    } catch (error) {
      console.error('Error loading job cards:', error);
    } finally {
      setIsLoading(false);
    }
  }, []); // Remove isOnline dependency to avoid initialization issues

  // Store the function in a ref for stable access
  loadJobCardsRef.current = loadJobCards;

  // Monitor online/offline status and auto-sync when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      console.log('🌐 Connection restored - syncing job cards...');
      
      // Auto-sync job cards when coming back online
      if (loadJobCardsRef.current) {
        loadJobCardsRef.current();
      }
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      console.log('📴 Connection lost - working in offline mode');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // Empty deps - use ref to access latest function

  // Load users if not provided - with offline support
  useEffect(() => {
    const loadUsers = async () => {
      // First, load from cache for instant UI
      const cached = JSON.parse(localStorage.getItem('manufacturing_users') || '[]');
      if (cached.length > 0) {
        setUsers(cached);
      }

      // Then try to sync from API if online
      if (users.length === 0 && isOnline && window.DatabaseAPI?.getUsers) {
        try {
          const response = await window.DatabaseAPI.getUsers();
          const usersData = response?.data?.users || response?.data || [];
          if (Array.isArray(usersData) && usersData.length > 0) {
            setUsers(usersData);
            localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
          }
        } catch (error) {
          console.warn('Failed to load users from API, using cache:', error);
          if (cached.length > 0) setUsers(cached);
        }
      } else if (usersProp && usersProp.length > 0) {
        setUsers(usersProp);
        localStorage.setItem('manufacturing_users', JSON.stringify(usersProp));
      }
    };
    loadUsers();
  }, [isOnline, usersProp]);

  // Load clients if not provided - with offline support
  useEffect(() => {
    const loadClients = async () => {
      // First, load from cache for instant UI
      const cached = JSON.parse(localStorage.getItem('manufacturing_clients') || '[]');
      const activeCached = Array.isArray(cached) ? cached.filter(c => {
        const status = (c.status || '').toLowerCase();
        const type = (c.type || 'client').toLowerCase();
        return (status === 'active' || status === '' || !c.status) && 
               (type === 'client' || !c.type);
      }) : [];
      
      if (activeCached.length > 0) {
        setClients(activeCached);
      }

      // Then try to sync from API if online
      if (clients.length === 0 && isOnline && window.DatabaseAPI?.getClients) {
        try {
          const response = await window.DatabaseAPI.getClients();
          const allClients = response?.data?.clients || response?.data || [];
          // Case-insensitive status check - accept 'active', 'Active', etc.
          const activeClients = Array.isArray(allClients) ? allClients.filter(c => {
            const status = (c.status || '').toLowerCase();
            const type = (c.type || 'client').toLowerCase();
            return (status === 'active' || status === '' || !c.status) && 
                   (type === 'client' || !c.type);
          }) : [];
          
          if (activeClients.length > 0) {
            setClients(activeClients);
            localStorage.setItem('manufacturing_clients', JSON.stringify(activeClients));
            console.log('✅ JobCards: Loaded clients from API:', activeClients.length, activeClients.map(c => c.name).join(', '));
          }
        } catch (error) {
          console.warn('Failed to load clients from API, using cache:', error);
          if (activeCached.length > 0) setClients(activeCached);
        }
      } else if (clientsProp && clientsProp.length > 0) {
        // Use provided clients
        setClients(clientsProp);
        localStorage.setItem('manufacturing_clients', JSON.stringify(clientsProp));
        console.log('✅ JobCards: Using provided clients:', clientsProp.length, clientsProp.map(c => c.name).join(', '));
      }
    };
    loadClients();
  }, [isOnline, clientsProp]);

  // Load inventory and stock locations - with offline support
  useEffect(() => {
    const loadStockData = async () => {
      try {
        // First, load inventory from cache for instant UI
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
        }

        // Then try to sync from API if online
        if (isOnline && window.DatabaseAPI?.getInventory) {
          try {
            const invResponse = await window.DatabaseAPI.getInventory();
            const invData = invResponse?.data?.inventory || invResponse?.data || [];
            if (Array.isArray(invData) && invData.length > 0) {
              setInventory(invData);
              localStorage.setItem('manufacturing_inventory', JSON.stringify(invData));
            }
          } catch (error) {
            console.warn('Failed to load inventory from API, using cache:', error);
            if (cachedInventory.length > 0) setInventory(cachedInventory);
          }
        }
        
        // Load stock locations from localStorage (they're managed in StockLocations component)
        const cachedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        if (cachedLocations.length > 0) {
          setStockLocations(cachedLocations);
        } else {
          // Default locations if none exist
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle' }
          ];
          setStockLocations(defaultLocations);
          localStorage.setItem('stock_locations', JSON.stringify(defaultLocations));
        }
      } catch (error) {
        console.warn('Failed to load stock data:', error);
        // Use cached data as fallback
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        const cachedLocations = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        if (cachedInventory.length > 0) setInventory(cachedInventory);
        if (cachedLocations.length > 0) setStockLocations(cachedLocations);
      }
    };
    loadStockData();
  }, [isOnline]);

  // Initial load of job cards
  useEffect(() => {
    loadJobCardsRef.current?.();
  }, []);

  // Auto-populate agent name from current user
  useEffect(() => {
    if (!editingJobCard && user?.name && !formData.agentName) {
      setFormData(prev => ({ ...prev, agentName: user.name }));
    }
  }, [user, editingJobCard]);

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

  // Initialize form for editing
  useEffect(() => {
    if (editingJobCard) {
      setFormData({
        agentName: editingJobCard.agentName || '',
        otherTechnicians: editingJobCard.otherTechnicians || [],
        clientId: editingJobCard.clientId || '',
        clientName: editingJobCard.clientName || '',
        siteId: editingJobCard.siteId || '',
        siteName: editingJobCard.siteName || '',
        location: editingJobCard.location || '',
        timeOfDeparture: editingJobCard.timeOfDeparture ? editingJobCard.timeOfDeparture.substring(0, 16) : '',
        timeOfArrival: editingJobCard.timeOfArrival ? editingJobCard.timeOfArrival.substring(0, 16) : '',
        vehicleUsed: editingJobCard.vehicleUsed || '',
        kmReadingBefore: editingJobCard.kmReadingBefore || '',
        kmReadingAfter: editingJobCard.kmReadingAfter || '',
        reasonForVisit: editingJobCard.reasonForVisit || '',
        diagnosis: editingJobCard.diagnosis || '',
        actionsTaken: editingJobCard.actionsTaken || '',
        stockUsed: editingJobCard.stockUsed || [],
        materialsBought: editingJobCard.materialsBought || [],
        otherComments: editingJobCard.otherComments || '',
        photos: editingJobCard.photos || [],
        status: editingJobCard.status || 'draft'
      });
      setSelectedPhotos(editingJobCard.photos || []);
    }
  }, [editingJobCard]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
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
    try {
      const jobCardData = {
        ...formData,
        id: editingJobCard?.id || Date.now().toString(),
        createdAt: editingJobCard?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Calculate travel kilometers
      const kmBefore = parseFloat(formData.kmReadingBefore) || 0;
      const kmAfter = parseFloat(formData.kmReadingAfter) || 0;
      jobCardData.travelKilometers = Math.max(0, kmAfter - kmBefore);

      // Calculate total cost for materials bought
      jobCardData.totalMaterialsCost = (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0);

      // If job card is being marked as completed, remove stock from locations
      // Works offline - updates localStorage immediately
      const wasCompleted = editingJobCard?.status === 'completed';
      const isNowCompleted = jobCardData.status === 'completed';
      
      if (isNowCompleted && !wasCompleted && formData.stockUsed && formData.stockUsed.length > 0) {
        // Process stock removal from locations (works offline)
        try {
          const locationInventory = JSON.parse(localStorage.getItem('location_inventory') || '[]');
          const updatedLocationInventory = [...locationInventory];
          
          formData.stockUsed.forEach(stockItem => {
            // Find existing inventory entry for this item at this location
            const existingEntry = updatedLocationInventory.find(
              entry => entry.locationId === stockItem.locationId && 
                      (entry.sku === stockItem.sku || entry.itemId === stockItem.sku)
            );
            
            if (existingEntry) {
              // Reduce quantity
              existingEntry.quantity = Math.max(0, (existingEntry.quantity || 0) - stockItem.quantity);
              if (existingEntry.quantity === 0) {
                // Remove entry if quantity reaches 0
                const index = updatedLocationInventory.indexOf(existingEntry);
                updatedLocationInventory.splice(index, 1);
              }
            } else {
              console.warn(`Stock item ${stockItem.itemName} not found at location ${stockItem.locationName}`);
            }
          });
          
          // Save to localStorage (works offline)
          localStorage.setItem('location_inventory', JSON.stringify(updatedLocationInventory));
          
          // Update main inventory cache
          const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
          const updatedInventory = cachedInventory.map(item => {
            const stockItem = formData.stockUsed.find(s => s.sku === item.sku || s.sku === item.id);
            if (stockItem) {
              return {
                ...item,
                quantityOnHand: Math.max(0, (item.quantityOnHand || item.quantity || 0) - stockItem.quantity)
              };
            }
            return item;
          });
          localStorage.setItem('manufacturing_inventory', JSON.stringify(updatedInventory));
          setInventory(updatedInventory);
          
          // Try to sync with API if online (non-blocking)
          if (isOnline && window.DatabaseAPI?.getInventory) {
            try {
              const invResponse = await window.DatabaseAPI.getInventory();
              const invData = invResponse?.data?.inventory || invResponse?.data || [];
              const apiUpdatedInventory = invData.map(item => {
                const stockItem = formData.stockUsed.find(s => s.sku === item.sku || s.sku === item.id);
                if (stockItem) {
                  return {
                    ...item,
                    quantityOnHand: Math.max(0, (item.quantityOnHand || item.quantity || 0) - stockItem.quantity)
                  };
                }
                return item;
              });
              
              // Try to update via API (fire and forget - doesn't block)
              if (window.DatabaseAPI.updateInventoryItem) {
                apiUpdatedInventory.forEach(item => {
                  const original = invData.find(i => i.id === item.id || i.sku === item.sku);
                  if (original && original.quantityOnHand !== item.quantityOnHand) {
                    window.DatabaseAPI.updateInventoryItem(item.id || item.sku, item).catch(err => {
                      console.warn('Failed to sync inventory item to API:', err);
                    });
                  }
                });
              }
            } catch (error) {
              console.warn('Failed to sync inventory with API (will retry when online):', error);
            }
          }
        } catch (error) {
          console.error('Error processing stock removal:', error);
          // Don't block save - just warn
          if (!isOnline) {
            console.warn('Offline mode: Stock removal saved to cache, will sync when online');
          } else {
            alert('Warning: Job card saved but stock removal may have failed. Please verify stock levels.');
          }
        }
      }

      // Save to localStorage first (offline support)
      let updatedJobCards;
      if (editingJobCard) {
        updatedJobCards = jobCards.map(jc => jc.id === editingJobCard.id ? jobCardData : jc);
      } else {
        updatedJobCards = [...jobCards, jobCardData];
      }
      setJobCards(updatedJobCards);
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));

      // Try to sync with API if online
      if (isOnline && window.DatabaseAPI) {
        try {
          if (editingJobCard && window.DatabaseAPI.updateJobCard) {
            await window.DatabaseAPI.updateJobCard(editingJobCard.id, jobCardData);
          } else if (window.DatabaseAPI.createJobCard) {
            await window.DatabaseAPI.createJobCard(jobCardData);
            // Reload from API to get the generated job card number
            const response = await window.DatabaseAPI.getJobCards();
            const freshData = response?.data?.jobCards || [];
            if (freshData.length > 0) {
              setJobCards(freshData);
              localStorage.setItem('manufacturing_jobcards', JSON.stringify(freshData));
            }
          }
        } catch (error) {
          console.warn('⚠️ Failed to sync job card to API, saved offline:', error.message);
          // Data is already saved in localStorage, so it will sync when back online
        }
      }

      alert(editingJobCard ? 'Job card updated successfully!' : 'Job card created successfully!');
      setShowAddPage(false);
      setEditingJobCard(null);
      resetForm();
    } catch (error) {
      console.error('Error saving job card:', error);
      alert(`Failed to save job card: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this job card?')) return;

    try {
      // Remove from localStorage first
      const updatedJobCards = jobCards.filter(jc => jc.id !== id);
      setJobCards(updatedJobCards);
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));

      // Try to delete from API if online
      if (isOnline && window.DatabaseAPI?.deleteJobCard) {
        try {
          await window.DatabaseAPI.deleteJobCard(id);
        } catch (error) {
          console.warn('⚠️ Failed to delete from API, removed from local storage:', error.message);
        }
      }

      alert('Job card deleted successfully!');
    } catch (error) {
      console.error('Error deleting job card:', error);
      alert(`Failed to delete job card: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      agentName: user?.name || '',
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
  };

  const openAddPage = () => {
    setEditingJobCard(null);
    resetForm();
    setShowAddPage(true);
  };

  const openEditPage = (jobCard) => {
    setEditingJobCard(jobCard);
    setShowAddPage(true);
  };

  // Filter technicians/users - show only active users
  const availableTechnicians = users.filter(u => u.status !== 'inactive' && u.status !== 'suspended');

  if (showAddPage) {
    const travelKm = formData.kmReadingBefore && formData.kmReadingAfter
      ? parseFloat(formData.kmReadingAfter) - parseFloat(formData.kmReadingBefore)
      : 0;

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {editingJobCard ? 'Edit Job Card' : 'Add New Job Card'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {!isOnline && <span className="text-orange-600">⚠️ Offline Mode - Changes will sync when connection is restored</span>}
            </p>
          </div>
          <button
            onClick={() => {
              setShowAddPage(false);
              setEditingJobCard(null);
              resetForm();
            }}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <i className="fas fa-arrow-left mr-2"></i>Back to List
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-6">
          {/* Agent Name - Selectable from users */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Agent Name *
            </label>
            <select
              name="agentName"
              value={formData.agentName}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select technician</option>
              {availableTechnicians.map(tech => (
                <option key={tech.id} value={tech.name || tech.email}>
                  {tech.name || tech.email} {tech.department ? `(${tech.department})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Other Technicians */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Other Technicians
            </label>
            <div className="flex gap-2 mb-2">
              <select
                value={technicianInput}
                onChange={(e) => setTechnicianInput(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select technician to add</option>
                {availableTechnicians
                  .filter(tech => !formData.otherTechnicians.includes(tech.name || tech.email))
                  .map(tech => (
                    <option key={tech.id} value={tech.name || tech.email}>
                      {tech.name || tech.email}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={handleAddTechnician}
                disabled={!technicianInput}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
            {formData.otherTechnicians.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.otherTechnicians.map((technician, idx) => (
                  <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm">
                    {technician}
                    <button
                      type="button"
                      onClick={() => handleRemoveTechnician(technician)}
                      className="hover:text-blue-900"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Client and Site */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client *
              </label>
              <select
                name="clientId"
                value={formData.clientId}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site *
              </label>
              <select
                name="siteId"
                value={formData.siteId}
                onChange={handleChange}
                required
                disabled={!formData.clientId || availableSites.length === 0}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Specific location details"
            />
          </div>

          {/* Time of Departure and Arrival */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time of Departure
              </label>
              <input
                type="datetime-local"
                name="timeOfDeparture"
                value={formData.timeOfDeparture}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time of Arrival
              </label>
              <input
                type="datetime-local"
                name="timeOfArrival"
                value={formData.timeOfArrival}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Vehicle and Kilometer Readings */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle Used
              </label>
              <input
                type="text"
                name="vehicleUsed"
                value={formData.vehicleUsed}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., AB12 CD 3456"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                KM Reading Before
              </label>
              <input
                type="number"
                step="0.1"
                name="kmReadingBefore"
                value={formData.kmReadingBefore}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                KM Reading After
              </label>
              <input
                type="number"
                step="0.1"
                name="kmReadingAfter"
                value={formData.kmReadingAfter}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0.0"
              />
            </div>
          </div>

          {/* Travel Kilometers Display */}
          {formData.kmReadingBefore && formData.kmReadingAfter && travelKm > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-900">
                Travel Distance: {travelKm.toFixed(1)} km
              </p>
            </div>
          )}

          {/* Reason for Visit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Call Out / Visit *
            </label>
            <textarea
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleChange}
              required
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Why was the agent requested to come out?"
            />
          </div>

          {/* Diagnosis */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Diagnosis
            </label>
            <textarea
              name="diagnosis"
              value={formData.diagnosis}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Notes and comments about diagnosis"
            />
          </div>

          {/* Actions Taken */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Actions Taken
            </label>
            <textarea
              name="actionsTaken"
              value={formData.actionsTaken}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe what actions were taken to resolve the issue"
            />
          </div>

          {/* Stock Used Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Stock Used</h3>
            
            {/* Add Stock Item Form */}
            <div className="grid grid-cols-12 gap-2 mb-3">
              <div className="col-span-4">
                <select
                  value={newStockItem.sku}
                  onChange={(e) => setNewStockItem({ ...newStockItem, sku: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select component</option>
                  {inventory.map(item => (
                    <option key={item.id || item.sku} value={item.sku || item.id}>
                      {item.name} ({item.sku || item.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <select
                  value={newStockItem.locationId}
                  onChange={(e) => setNewStockItem({ ...newStockItem, locationId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select location</option>
                  {stockLocations.map(loc => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newStockItem.quantity || ''}
                  onChange={(e) => setNewStockItem({ ...newStockItem, quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Qty"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="button"
                  onClick={handleAddStockItem}
                  className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <i className="fas fa-plus mr-1"></i>Add
                </button>
              </div>
            </div>

            {/* Stock Items List */}
            {formData.stockUsed && formData.stockUsed.length > 0 && (
              <div className="space-y-2">
                {formData.stockUsed.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3">
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
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Materials Bought (Not from Stock)</h3>
            
            {/* Add Material Item Form */}
            <div className="space-y-2 mb-3">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newMaterialItem.itemName}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, itemName: e.target.value })}
                  placeholder="Item Name *"
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newMaterialItem.cost || ''}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="Cost (R) *"
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <input
                type="text"
                value={newMaterialItem.description}
                onChange={(e) => setNewMaterialItem({ ...newMaterialItem, description: e.target.value })}
                placeholder="Description"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                value={newMaterialItem.reason}
                onChange={(e) => setNewMaterialItem({ ...newMaterialItem, reason: e.target.value })}
                placeholder="Reason for purchase"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleAddMaterialItem}
                className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <i className="fas fa-plus mr-1"></i>Add Material
              </button>
            </div>

            {/* Materials List */}
            {formData.materialsBought && formData.materialsBought.length > 0 && (
              <div className="space-y-2">
                {formData.materialsBought.map(item => (
                  <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Other Comments
            </label>
            <textarea
              name="otherComments"
              value={formData.otherComments}
              onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Additional comments or observations"
            />
          </div>

          {/* Photo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photos
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <input
                type="file"
                id="photoUpload"
                onChange={handlePhotoUpload}
                className="hidden"
                accept="image/*"
                multiple
              />
              <label
                htmlFor="photoUpload"
                className="cursor-pointer"
              >
                <i className="fas fa-camera text-3xl text-gray-400 mb-2"></i>
                <p className="text-sm text-gray-600">
                  Click to upload photos or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  Images (Max 10MB each)
                </p>
              </label>
            </div>
            {selectedPhotos.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {selectedPhotos.map((photo, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={typeof photo === 'string' ? photo : photo.url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setShowAddPage(false);
                setEditingJobCard(null);
                resetForm();
              }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {editingJobCard ? 'Update Job Card' : 'Create Job Card'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // List view
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <i className="fas fa-spinner fa-spin text-3xl text-gray-400 mb-4"></i>
        <p className="text-gray-500">Loading job cards...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Job Cards</h2>
          <p className="text-sm text-gray-500 mt-1">
            {jobCards.length} job card{jobCards.length !== 1 ? 's' : ''}
            {!isOnline && <span className="ml-2 text-orange-600">⚠️ Offline</span>}
          </p>
        </div>
        <button
          onClick={openAddPage}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <i className="fas fa-plus mr-2"></i>Add Job Card
        </button>
      </div>

      {jobCards.length === 0 ? (
        <div className="p-12 text-center text-gray-500">
          <i className="fas fa-clipboard-list text-4xl mb-4 text-gray-300"></i>
          <p>No job cards yet. Create your first job card to get started.</p>
        </div>
      ) : (
        <div className="p-4">
          <div className="space-y-3">
            {jobCards.map(jobCard => (
              <div key={jobCard.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {jobCard.jobCardNumber || `Job Card ${jobCard.id.slice(-6)}`}
                      </h3>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        jobCard.status === 'completed' ? 'bg-green-100 text-green-700' :
                        jobCard.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {jobCard.status || 'draft'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p><span className="font-medium">Agent:</span> {jobCard.agentName}</p>
                      {jobCard.clientName && (
                        <p><span className="font-medium">Client:</span> {jobCard.clientName}
                          {jobCard.siteName && ` - ${jobCard.siteName}`}
                        </p>
                      )}
                      {jobCard.reasonForVisit && (
                        <p className="text-gray-700 mt-2 line-clamp-2">{jobCard.reasonForVisit}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      {jobCard.timeOfArrival && (
                        <span><i className="fas fa-clock mr-1"></i>{new Date(jobCard.timeOfArrival).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
                      )}
                      {jobCard.travelKilometers > 0 && (
                        <span><i className="fas fa-route mr-1"></i>{jobCard.travelKilometers} km</span>
                      )}
                      <span>{new Date(jobCard.createdAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openEditPage(jobCard)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      title="Edit"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      onClick={() => handleDelete(jobCard.id)}
                      className="px-3 py-1 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50"
                      title="Delete"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Make available globally
window.JobCards = JobCards;

