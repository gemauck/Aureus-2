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
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [isDetailView, setIsDetailView] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
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
    status: 'draft',
    nonActiveClientSiteDetails: ''
  });
  const [technicianInput, setTechnicianInput] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  const [newStockItem, setNewStockItem] = useState({ sku: '', quantity: 0, locationId: '' });
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [locationData, setLocationData] = useState(null);

  // Handle location selection from LocationPicker
  const handleLocationSelect = (location) => {
    setLocationData(location);
    if (location) {
      const locationText = location.address || '';
      setFormData(prev => ({ ...prev, location: locationText }));
    } else {
      setFormData(prev => ({ ...prev, location: '' }));
    }
  };

  // Load job cards with offline support - defined as a stable function reference
  const loadJobCardsRef = useRef(null);
  const syncPendingJobCardsRef = useRef(null);
  const jobCardsContainerRef = useRef(null);
  
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
          console.log('📡 JobCards: Fetching from API...');
          const response = await window.DatabaseAPI.getJobCards();
          console.log('📡 JobCards: API response:', response);
          const jobCardsData = response?.data?.jobCards || response?.data || [];
          console.log('📡 JobCards: Parsed job cards:', jobCardsData.length);
          if (Array.isArray(jobCardsData)) {
            // Mark all API-loaded cards as synced to prevent duplicate creation
            const syncedCards = jobCardsData.map(jc => ({ ...jc, synced: true }));
            // Always set the job cards array (even if empty) so the UI shows the empty state
            setJobCards(syncedCards);
            localStorage.setItem('manufacturing_jobcards', JSON.stringify(syncedCards));
            if (jobCardsData.length > 0) {
              console.log('✅ JobCards: Loaded', jobCardsData.length, 'job cards from API (marked as synced)');
            } else {
              console.log('ℹ️ JobCards: API returned empty array (no job cards yet)');
            }
          } else {
            console.warn('⚠️ JobCards: API response is not an array:', typeof jobCardsData);
            // Set empty array if response is invalid
            setJobCards([]);
          }
        } catch (error) {
          console.error('❌ JobCards: Failed to sync from API:', error);
          console.error('❌ Error details:', error.message, error.stack);
          // Still show cached data if available
          if (cached.length > 0) {
            console.log('📦 JobCards: Using cached data due to API error');
          }
        }
      } else {
        if (!onlineStatus) {
          console.log('📴 JobCards: Offline, using cached data');
        } else if (!window.DatabaseAPI?.getJobCards) {
          console.error('❌ JobCards: getJobCards method not available on DatabaseAPI');
          console.log('📋 Available DatabaseAPI methods:', Object.keys(window.DatabaseAPI || {}));
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

  // Function to sync pending job cards to API
  const syncPendingJobCards = useCallback(async () => {
    try {
      let cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      const unsyncedCards = cached.filter(jc => !jc.synced && jc.id);
      
      if (unsyncedCards.length === 0) {
        console.log('📋 No pending job cards to sync');
        return;
      }
      
      console.log(`📤 Syncing ${unsyncedCards.length} pending job card(s)...`);
      
      for (const card of unsyncedCards) {
        try {
          // Check if this was an edit or a new card
          const isEdit = card._wasEdit === true;
          
          if (isEdit && window.DatabaseAPI?.updateJobCard) {
            // This was an edit of an existing card
            console.log(`📤 Syncing update for job card: ${card.id}`);
            await window.DatabaseAPI.updateJobCard(card.id, card);
            console.log(`✅ Synced update for job card: ${card.id}`);
          } else if (window.DatabaseAPI?.createJobCard) {
            // This is a new card
            console.log(`📤 Syncing new job card: ${card.id}`);
            await window.DatabaseAPI.createJobCard(card);
            console.log(`✅ Synced new job card: ${card.id}`);
          }
          
          // Mark as synced
          cached = cached.map(jc => jc.id === card.id ? { ...jc, synced: true } : jc);
          localStorage.setItem('manufacturing_jobcards', JSON.stringify(cached));
        } catch (error) {
          console.error(`❌ Failed to sync job card ${card.id}:`, error);
          // Keep as unsynced for next attempt
        }
      }
      
      // Update state with synced data
      setJobCards(cached);
    } catch (error) {
      console.error('❌ Error syncing pending job cards:', error);
    }
  }, []);

  // Store sync function in ref for stable access
  syncPendingJobCardsRef.current = syncPendingJobCards;

  // Monitor online/offline status and auto-sync when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      console.log('🌐 Connection restored - syncing job cards...');
      
      // Sync pending job cards first (this will reload data itself)
      if (syncPendingJobCardsRef.current) {
        await syncPendingJobCardsRef.current();
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
  }, []); // Empty deps - use refs instead to avoid re-creating listeners

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

  // Initial load of job cards - run only once on mount
  useEffect(() => {
    const initLoad = async () => {
      await loadJobCardsRef.current?.();
      // NOTE: Don't sync pending cards on mount - they're already on the server
      // syncPendingJobCards should only be called when coming back online
    };
    initLoad();
  }, []); // Empty dependency array - only run on mount

  // Auto-populate agent name from current user
  useEffect(() => {
    if (!editingJobCard && user?.name && !formData.agentName) {
      setFormData(prev => ({ ...prev, agentName: user.name }));
    }
  }, [user, editingJobCard]);

  // Load sites when client changes
  useEffect(() => {
    // Handle "Not an active Client" case
    if (formData.clientId === 'not_active_client') {
      setAvailableSites([]);
      setFormData(prev => ({ ...prev, siteId: '', siteName: '', clientName: '' }));
      return;
    }
    
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
      
      // Restore location data if available
      if (editingJobCard.locationCoordinates) {
        setLocationData(editingJobCard.locationCoordinates);
      } else if (editingJobCard.location) {
        // If only text location, set it as manual
        setLocationData({
          latitude: null,
          longitude: null,
          address: editingJobCard.location,
          fullAddress: null,
          isManual: true
        });
      } else {
        setLocationData(null);
      }
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

      // Add location coordinates if available
      if (locationData) {
        jobCardData.locationCoordinates = {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          address: locationData.address,
          isManual: locationData.isManual || false
        };
      }

      // Calculate total cost for materials bought
      jobCardData.totalMaterialsCost = (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0);

      // Create stock movements for any stock used (regardless of job card status - including draft)
      if (formData.stockUsed && formData.stockUsed.length > 0) {
        console.log('📦 Creating stock movements for job card:', {
          jobCardId: jobCardData.id,
          status: jobCardData.status,
          stockItemsCount: formData.stockUsed.length,
          stockItems: formData.stockUsed
        });
        
        try {
          const jobCardId = jobCardData.id;
          const jobCardReference = `Job Card ${jobCardId}`;
          
          // Create a stock movement for each stock item used
          for (const stockItem of formData.stockUsed) {
            if (!stockItem.locationId || !stockItem.sku || stockItem.quantity <= 0) {
              console.warn('⚠️ Skipping invalid stock item:', stockItem);
              continue;
            }

            const movementData = {
              type: 'consumption', // Stock being consumed/used in job card
              sku: stockItem.sku,
              itemName: stockItem.itemName || '',
              quantity: parseFloat(stockItem.quantity),
              unitCost: stockItem.unitCost ? parseFloat(stockItem.unitCost) : undefined,
              fromLocation: stockItem.locationId, // Location ID where stock was taken from
              toLocation: '', // Empty as this is consumption, not a transfer
              reference: jobCardReference,
              performedBy: formData.agentName || user?.name || 'System',
              notes: `Stock used in job card: ${jobCardReference}${formData.location ? ` - Location: ${formData.location}` : ''}`,
              date: new Date().toISOString()
            };

            console.log('📝 Creating stock movement:', movementData);

            // Try to create stock movement via API if online
            if (isOnline && window.DatabaseAPI?.createStockMovement) {
              try {
                const response = await window.DatabaseAPI.createStockMovement(movementData);
                console.log(`✅ Stock movement created successfully for ${stockItem.itemName}:`, response);
              } catch (error) {
                console.error(`❌ Failed to create stock movement for ${stockItem.itemName}:`, error);
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
                console.log(`📦 Stock movement saved to localStorage for later sync: ${stockItem.itemName}`);
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
              console.log(`📦 Stock movement queued for sync (offline mode): ${stockItem.itemName}`);
            }
          }
          console.log('✅ Stock movement creation process completed');
        } catch (error) {
          console.error('❌ Error creating stock movements:', error);
          console.error('Error stack:', error.stack);
          // Don't block save - just warn
          console.warn('⚠️ Job card will be saved but stock movements may not have been recorded');
        }
      } else {
        console.log('ℹ️ No stock items used in this job card');
      }

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
      const isNewCard = !editingJobCard;
      const wasSynced = editingJobCard?.synced !== false;
      
      // Mark new cards as unsynced, and track if it's an edit
      const cardDataWithSyncFlag = { 
        ...jobCardData, 
        synced: false,
        _wasEdit: !!editingJobCard  // Internal flag to track if this was an edit
      };
      
      if (editingJobCard) {
        updatedJobCards = jobCards.map(jc => jc.id === editingJobCard.id ? cardDataWithSyncFlag : jc);
      } else {
        updatedJobCards = [...jobCards, cardDataWithSyncFlag];
      }
      setJobCards(updatedJobCards);
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));

      // Try to sync with API if online
      if (isOnline && window.DatabaseAPI) {
        try {
          if (editingJobCard && window.DatabaseAPI.updateJobCard) {
            await window.DatabaseAPI.updateJobCard(editingJobCard.id, jobCardData);
            console.log('✅ Job card updated on server');
            
            // Mark as synced
            const syncedCards = updatedJobCards.map(jc => jc.id === editingJobCard.id ? { ...jc, synced: true } : jc);
            setJobCards(syncedCards);
            localStorage.setItem('manufacturing_jobcards', JSON.stringify(syncedCards));
          } else if (window.DatabaseAPI.createJobCard) {
            await window.DatabaseAPI.createJobCard(jobCardData);
            console.log('✅ Job card created on server');
            
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
          // Card is already marked as unsynced, will be synced when back online
        }
      } else {
        console.log('📴 Offline mode: Job card saved locally, will sync when online');
      }

      alert(editingJobCard ? 'Job card updated successfully!' : 'Job card created successfully!');
      
      // If we're in detail view, update the selected job card
      if (isDetailView && selectedJobCard) {
        // Reload job cards to get the latest data
        await loadJobCardsRef.current?.();
        // Find the updated card
        const allCards = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
        const updatedCard = allCards.find(jc => jc.id === (editingJobCard?.id || jobCardData.id));
        if (updatedCard) {
          setSelectedJobCard(updatedCard);
          setIsEditMode(false);
          setEditingJobCard(null);
        }
      } else {
        // Reload job cards to refresh the list
        await loadJobCardsRef.current?.();
        closeJobCardModal();
      }
    } catch (error) {
      console.error('Error saving job card:', error);
      alert(`Failed to save job card: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this job card?')) return;

    try {
      // First, try to delete from API if online
      if (isOnline && window.DatabaseAPI?.deleteJobCard) {
        try {
          console.log('🗑️ Deleting job card from database:', id);
          await window.DatabaseAPI.deleteJobCard(id);
          console.log('✅ Job card deleted from database successfully');
        } catch (error) {
          console.error('❌ Failed to delete from API:', error);
          const errorMessage = error.message || 'Unknown error';
          alert(`Failed to delete job card from server: ${errorMessage}. Please check your connection and try again.`);
          return; // Don't proceed with local deletion if API fails
        }
      } else if (isOnline && !window.DatabaseAPI?.deleteJobCard) {
        console.warn('⚠️ DatabaseAPI.deleteJobCard not available');
        alert('Delete functionality is not available. Please refresh the page and try again.');
        return;
      } else {
        console.log('📴 Offline mode: Deleting job card locally only');
      }

      // Only remove from local state/localStorage after successful API deletion (or if offline)
      const updatedJobCards = jobCards.filter(jc => jc.id !== id);
      setJobCards(updatedJobCards);
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));
      console.log('✅ Job card removed from local state');

      alert('Job card deleted successfully!');
    } catch (error) {
      console.error('❌ Error deleting job card:', error);
      alert(`Failed to delete job card: ${error.message || 'Unknown error'}`);
      
      // Try to reload to restore sync
      if (loadJobCardsRef.current) {
        console.log('🔄 Reloading job cards after deletion error to restore sync...');
        try {
          await loadJobCardsRef.current();
        } catch (reloadError) {
          console.error('❌ Failed to reload job cards:', reloadError);
        }
      }
    }
  };

  const resetForm = useCallback(() => {
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
      status: 'draft',
      nonActiveClientSiteDetails: ''
    });
    setSelectedPhotos([]);
    setTechnicianInput('');
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setLocationData(null);
  }, [user?.name]);

  const closeJobCardModal = useCallback(() => {
    setShowAddPage(false);
    setEditingJobCard(null);
    setIsDetailView(false);
    setSelectedJobCard(null);
    setIsEditMode(false);
    resetForm();
  }, [resetForm]);

  const openNewJobCardModal = useCallback(() => {
    setEditingJobCard(null);
    resetForm();
    setShowAddPage(true);
    requestAnimationFrame(() => {
      if (jobCardsContainerRef.current) {
        jobCardsContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, [resetForm]);

  const openAddPage = () => {
    openNewJobCardModal();
  };

  const openEditPage = (jobCard) => {
    setEditingJobCard(jobCard);
    setShowAddPage(true);
    setIsDetailView(false);
    setSelectedJobCard(null);
  };

  const openDetailView = (jobCard) => {
    setSelectedJobCard(jobCard);
    setIsDetailView(true);
    setIsEditMode(false);
    setShowAddPage(false);
    setEditingJobCard(null);
  };

  const closeDetailView = () => {
    setIsDetailView(false);
    setSelectedJobCard(null);
    setIsEditMode(false);
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort job cards
  const filteredAndSortedJobCards = useCallback(() => {
    let filtered = [...jobCards];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(jc => {
        return (
          (jc.jobCardNumber || '').toLowerCase().includes(query) ||
          (jc.agentName || '').toLowerCase().includes(query) ||
          (jc.clientName || '').toLowerCase().includes(query) ||
          (jc.siteName || '').toLowerCase().includes(query) ||
          (jc.reasonForVisit || '').toLowerCase().includes(query) ||
          (jc.diagnosis || '').toLowerCase().includes(query) ||
          (jc.status || '').toLowerCase().includes(query) ||
          (jc.location || '').toLowerCase().includes(query)
        );
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle different data types
      if (sortField === 'createdAt' || sortField === 'timeOfArrival' || sortField === 'timeOfDeparture') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = (bVal || '').toLowerCase();
      } else {
        aVal = aVal || 0;
        bVal = bVal || 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [jobCards, searchQuery, sortField, sortDirection]);

  // Filter technicians/users - show only active users
  const availableTechnicians = users.filter(u => u.status !== 'inactive' && u.status !== 'suspended');

  useEffect(() => {
    const jobCardsGlobal = window.JobCards;
    const handleOpenEvent = () => openNewJobCardModal();
    const handleCloseEvent = () => closeJobCardModal();

    window.addEventListener('jobcards:open', handleOpenEvent);
    window.addEventListener('jobcards:close', handleCloseEvent);

    if (jobCardsGlobal && typeof jobCardsGlobal === 'function') {
      jobCardsGlobal.openNewJobCardModal = openNewJobCardModal;
      jobCardsGlobal.closeJobCardModal = closeJobCardModal;
    }

    return () => {
      window.removeEventListener('jobcards:open', handleOpenEvent);
      window.removeEventListener('jobcards:close', handleCloseEvent);
      if (jobCardsGlobal && typeof jobCardsGlobal === 'function') {
        if (jobCardsGlobal.openNewJobCardModal === openNewJobCardModal) {
          delete jobCardsGlobal.openNewJobCardModal;
        }
        if (jobCardsGlobal.closeJobCardModal === closeJobCardModal) {
          delete jobCardsGlobal.closeJobCardModal;
        }
      }
    };
  }, [openNewJobCardModal, closeJobCardModal]);

  if (showAddPage) {
    const travelKm = formData.kmReadingBefore && formData.kmReadingAfter
      ? parseFloat(formData.kmReadingAfter) - parseFloat(formData.kmReadingBefore)
      : 0;

    return (
      <div ref={jobCardsContainerRef} data-jobcards-root className="bg-white rounded-lg border border-gray-200 p-6">
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
              closeJobCardModal();
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
                <option value="not_active_client">Not an active Client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            {formData.clientId === 'not_active_client' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Details of Site Visited *
                </label>
                <textarea
                  name="nonActiveClientSiteDetails"
                  value={formData.nonActiveClientSiteDetails}
                  onChange={handleChange}
                  required
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                  placeholder="Enter details of the site visited"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Site
                </label>
                <select
                  name="siteId"
                  value={formData.siteId}
                  onChange={handleChange}
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
            )}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            {window.LocationPicker ? (
              <LocationPicker 
                onLocationSelect={handleLocationSelect}
                initialLocation={formData.location}
              />
            ) : (
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Specific location details"
              />
            )}
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
              Reason for Call Out / Visit
            </label>
            <textarea
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleChange}
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
                closeJobCardModal();
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

  // Detail view component
  const renderDetailView = () => {
    if (!selectedJobCard) return null;

    const jobCard = selectedJobCard;
    const displayData = isEditMode ? formData : jobCard;

    return (
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={closeDetailView}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              <i className="fas fa-arrow-left mr-2"></i>Back to List
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {jobCard.jobCardNumber || `Job Card ${jobCard.id.slice(-6)}`}
              </h2>
              <p className="text-sm text-gray-500">
                {isEditMode ? 'Edit Mode' : 'View Mode'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && (
              <>
                <button
                  onClick={() => {
                    setEditingJobCard(jobCard);
                    setIsEditMode(true);
                    // Initialize form data for editing
                    setFormData({
                      agentName: jobCard.agentName || '',
                      otherTechnicians: jobCard.otherTechnicians || [],
                      clientId: jobCard.clientId || '',
                      clientName: jobCard.clientName || '',
                      siteId: jobCard.siteId || '',
                      siteName: jobCard.siteName || '',
                      location: jobCard.location || '',
                      timeOfDeparture: jobCard.timeOfDeparture ? jobCard.timeOfDeparture.substring(0, 16) : '',
                      timeOfArrival: jobCard.timeOfArrival ? jobCard.timeOfArrival.substring(0, 16) : '',
                      vehicleUsed: jobCard.vehicleUsed || '',
                      kmReadingBefore: jobCard.kmReadingBefore || '',
                      kmReadingAfter: jobCard.kmReadingAfter || '',
                      reasonForVisit: jobCard.reasonForVisit || '',
                      diagnosis: jobCard.diagnosis || '',
                      actionsTaken: jobCard.actionsTaken || '',
                      stockUsed: jobCard.stockUsed || [],
                      materialsBought: jobCard.materialsBought || [],
                      otherComments: jobCard.otherComments || '',
                      photos: jobCard.photos || [],
                      status: jobCard.status || 'draft',
                      nonActiveClientSiteDetails: jobCard.nonActiveClientSiteDetails || ''
                    });
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <i className="fas fa-edit mr-2"></i>Edit
                </button>
                <button
                  onClick={() => handleDelete(jobCard.id)}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                >
                  <i className="fas fa-trash mr-2"></i>Delete
                </button>
              </>
            )}
            {isEditMode && (
              <>
                <button
                  onClick={() => {
                    setIsEditMode(false);
                    setEditingJobCard(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <i className="fas fa-save mr-2"></i>Save Changes
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[calc(100vh-300px)] overflow-y-auto dark:bg-slate-50">
          {/* Helper function to extract coordinates */}
          {(() => {
            const locationStr = displayData.location || '';
            const coordsMatch = locationStr.match(/(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/);
            const latitude = coordsMatch ? coordsMatch[1] : (jobCard.locationLatitude || '');
            const longitude = coordsMatch ? coordsMatch[2] : (jobCard.locationLongitude || '');
            const getMapUrl = () => {
              if (latitude && longitude) {
                return `https://www.google.com/maps?q=${latitude},${longitude}`;
              } else if (locationStr) {
                return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationStr)}`;
              }
              return null;
            };
            const mapUrl = getMapUrl();
            
            return (
              <>
                {/* Status & Overview Section */}
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                    <i className="fas fa-info-circle mr-2 text-primary-600 dark:text-primary-400"></i>
                    Status & Overview
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Status:</span>
                    {isEditMode ? (
                      <select
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        className="px-3 py-1 border border-gray-300 rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                      >
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                        <option value="completed">Completed</option>
                      </select>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        displayData.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                        displayData.status === 'submitted' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                        'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}>
                        {displayData.status || 'draft'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Job Details Section */}
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                    <i className="fas fa-briefcase mr-2 text-primary-600 dark:text-primary-400"></i>
                    Job Details
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Agent Name</label>
                      {isEditMode ? (
                        <select
                          name="agentName"
                          value={formData.agentName}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        >
                          <option value="">Select technician</option>
                          {availableTechnicians.map(tech => (
                            <option key={tech.id} value={tech.name || tech.email}>
                              {tech.name || tech.email}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.agentName || 'N/A'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Other Technicians</label>
                      {isEditMode ? (
                        <div>
                          <div className="flex gap-2 mb-2">
                            <select
                              value={technicianInput}
                              onChange={(e) => setTechnicianInput(e.target.value)}
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
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
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              <i className="fas fa-plus"></i>
                            </button>
                          </div>
                          {formData.otherTechnicians.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {formData.otherTechnicians.map((technician, idx) => (
                                <span key={idx} className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm dark:bg-blue-900 dark:text-blue-300">
                                  {technician}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTechnician(technician)}
                                    className="hover:text-blue-900 dark:hover:text-blue-100"
                                  >
                                    <i className="fas fa-times text-xs"></i>
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100">
                          {displayData.otherTechnicians && displayData.otherTechnicians.length > 0
                            ? displayData.otherTechnicians.join(', ')
                            : 'N/A'}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Client</label>
                      {isEditMode ? (
                        <select
                          name="clientId"
                          value={formData.clientId}
                          onChange={handleChange}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        >
                          <option value="">Select client</option>
                          <option value="not_active_client">Not an active Client</option>
                          {clients.map(client => (
                            <option key={client.id} value={client.id}>{client.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100">
                          {displayData.clientId === 'not_active_client' ? 'Not an active Client' : (displayData.clientName || 'N/A')}
                        </p>
                      )}
                    </div>
                    {formData.clientId === 'not_active_client' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Details of Site Visited</label>
                        {isEditMode ? (
                          <textarea
                            name="nonActiveClientSiteDetails"
                            value={formData.nonActiveClientSiteDetails}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-y dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Enter details of the site visited"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.nonActiveClientSiteDetails || 'N/A'}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Site</label>
                        {isEditMode ? (
                          <select
                            name="siteId"
                            value={formData.siteId}
                            onChange={handleChange}
                            disabled={!formData.clientId || availableSites.length === 0}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:bg-gray-100 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          >
                            <option value="">Select site</option>
                            {availableSites.map(site => (
                              <option key={site.id || site.name} value={site.id || site.name}>
                                {site.name || site}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.siteName || 'N/A'}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Location & Map Section */}
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                    <i className="fas fa-map-marker-alt mr-2 text-primary-600 dark:text-primary-400"></i>
                    Location & Map
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Location</label>
                      {isEditMode ? (
                        window.LocationPicker ? (
                          <LocationPicker 
                            onLocationSelect={handleLocationSelect}
                            initialLocation={formData.location}
                          />
                        ) : (
                          <input
                            type="text"
                            name="location"
                            value={formData.location}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          />
                        )
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.location || 'N/A'}</p>
                      )}
                    </div>
                    {(latitude || longitude) && (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Latitude</label>
                          <p className="text-sm text-gray-900 dark:text-slate-100">{latitude || 'N/A'}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Longitude</label>
                          <p className="text-sm text-gray-900 dark:text-slate-100">{longitude || 'N/A'}</p>
                        </div>
                      </div>
                    )}
                    {mapUrl && (
                      <div className="mt-4">
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                          <i className="fas fa-map mr-2"></i>
                          View on Google Maps
                        </a>
                      </div>
                    )}
                    {latitude && longitude && (
                      <div className="mt-4 rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600" style={{ height: '300px' }}>
                        <iframe
                          width="100%"
                          height="100%"
                          frameBorder="0"
                          style={{ border: 0 }}
                          src={`https://www.google.com/maps/embed/v1/place?key=${process.env.REACT_APP_GOOGLE_MAPS_API_KEY || ''}&q=${latitude},${longitude}`}
                          allowFullScreen
                        ></iframe>
                      </div>
                    )}
                  </div>
                </div>

                {/* Scheduling & Travel Section */}
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                    <i className="fas fa-clock mr-2 text-primary-600 dark:text-primary-400"></i>
                    Scheduling & Travel
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Time of Departure</label>
                        {isEditMode ? (
                          <input
                            type="datetime-local"
                            name="timeOfDeparture"
                            value={formData.timeOfDeparture}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">
                            {displayData.timeOfDeparture ? new Date(displayData.timeOfDeparture).toLocaleString('en-ZA') : 'N/A'}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Time of Arrival</label>
                        {isEditMode ? (
                          <input
                            type="datetime-local"
                            name="timeOfArrival"
                            value={formData.timeOfArrival}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">
                            {displayData.timeOfArrival ? new Date(displayData.timeOfArrival).toLocaleString('en-ZA') : 'N/A'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Vehicle Used</label>
                        {isEditMode ? (
                          <input
                            type="text"
                            name="vehicleUsed"
                            value={formData.vehicleUsed}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.vehicleUsed || 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">KM Reading Before</label>
                        {isEditMode ? (
                          <input
                            type="number"
                            step="0.1"
                            name="kmReadingBefore"
                            value={formData.kmReadingBefore}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.kmReadingBefore || 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">KM Reading After</label>
                        {isEditMode ? (
                          <input
                            type="number"
                            step="0.1"
                            name="kmReadingAfter"
                            value={formData.kmReadingAfter}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                          />
                        ) : (
                          <p className="text-sm text-gray-900 dark:text-slate-100">{displayData.kmReadingAfter || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                    {displayData.kmReadingBefore && displayData.kmReadingAfter && (
                      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                          Travel Distance: {Math.max(0, parseFloat(displayData.kmReadingAfter || 0) - parseFloat(displayData.kmReadingBefore || 0)).toFixed(1)} km
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Work Details Section */}
                <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                    <i className="fas fa-tools mr-2 text-primary-600 dark:text-primary-400"></i>
                    Work Details
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Reason for Visit</label>
                      {isEditMode ? (
                        <textarea
                          name="reasonForVisit"
                          value={formData.reasonForVisit}
                          onChange={handleChange}
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        />
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100 whitespace-pre-wrap">{displayData.reasonForVisit || 'N/A'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Diagnosis</label>
                      {isEditMode ? (
                        <textarea
                          name="diagnosis"
                          value={formData.diagnosis}
                          onChange={handleChange}
                          rows={4}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        />
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100 whitespace-pre-wrap">{displayData.diagnosis || 'N/A'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Actions Taken</label>
                      {isEditMode ? (
                        <textarea
                          name="actionsTaken"
                          value={formData.actionsTaken}
                          onChange={handleChange}
                          rows={4}
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        />
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-slate-100 whitespace-pre-wrap">{displayData.actionsTaken || 'N/A'}</p>
                      )}
                    </div>
                  </div>
                </div>

          {/* Stock Used */}
          {displayData.stockUsed && displayData.stockUsed.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Stock Used</label>
                {isEditMode && (
                  <span className="text-xs text-gray-500">Use full edit form to modify stock items</span>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Item</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Location</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayData.stockUsed.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">{item.itemName || item.sku}</td>
                        <td className="px-4 py-2">{item.locationName || 'N/A'}</td>
                        <td className="px-4 py-2 text-right">{item.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Materials Bought */}
          {displayData.materialsBought && displayData.materialsBought.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Materials Bought</label>
                {isEditMode && (
                  <span className="text-xs text-gray-500">Use full edit form to modify materials</span>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Item</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">Description</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-700">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayData.materialsBought.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2">{item.itemName}</td>
                        <td className="px-4 py-2">{item.description || 'N/A'}</td>
                        <td className="px-4 py-2 text-right">R {parseFloat(item.cost || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan="2" className="px-4 py-2 text-right font-medium">Total:</td>
                      <td className="px-4 py-2 text-right font-bold">
                        R {displayData.materialsBought.reduce((sum, item) => sum + (item.cost || 0), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Other Comments */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Other Comments</label>
            {isEditMode ? (
              <textarea
                name="otherComments"
                value={formData.otherComments}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            ) : (
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{displayData.otherComments || 'N/A'}</p>
            )}
          </div>

          {/* Photos */}
          {displayData.photos && displayData.photos.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
              <div className="grid grid-cols-4 gap-2">
                {displayData.photos.map((photo, idx) => (
                  <div key={idx} className="relative">
                    <img
                      src={typeof photo === 'string' ? photo : photo.url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-32 object-cover rounded-lg border border-gray-200"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-4 border-t border-gray-200 text-xs text-gray-500">
            <p>Created: {new Date(jobCard.createdAt).toLocaleString('en-ZA')}</p>
            {jobCard.updatedAt && (
              <p>Last Updated: {new Date(jobCard.updatedAt).toLocaleString('en-ZA')}</p>
            )}
          </div>
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  // List view
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <i className="fas fa-spinner fa-spin text-3xl text-gray-400 mb-4"></i>
        <p className="text-gray-500">Loading job cards...</p>
      </div>
    );
  }

  // Show detail view if a job card is selected
  if (isDetailView && selectedJobCard) {
    return renderDetailView();
  }

  const sortedJobCards = filteredAndSortedJobCards();

  return (
    <div ref={jobCardsContainerRef} data-jobcards-root className="bg-white rounded-lg border border-gray-200">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Job Cards</h2>
          <p className="text-sm text-gray-500 mt-1">
            {sortedJobCards.length} of {jobCards.length} job card{jobCards.length !== 1 ? 's' : ''}
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

      {/* Search Bar */}
      <div className="p-4 border-b border-gray-200">
        <div className="relative">
          <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search job cards by number, agent, client, site, reason, status..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
      </div>

      {jobCards.length === 0 ? (
        <div className="p-12 text-center">
          <i className="fas fa-clipboard-list text-4xl mb-4 text-gray-300"></i>
          <p className="text-gray-600 font-medium mb-2">No job cards yet</p>
          <p className="text-sm text-gray-500 mb-4">Create your first job card to get started</p>
          <button
            onClick={openAddPage}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Create Your First Job Card
          </button>
        </div>
      ) : sortedJobCards.length === 0 ? (
        <div className="p-12 text-center">
          <i className="fas fa-search text-4xl mb-4 text-gray-300"></i>
          <p className="text-gray-600 font-medium mb-2">No job cards match your search</p>
          <button
            onClick={() => setSearchQuery('')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Clear Search
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('jobCardNumber')}
                >
                  <div className="flex items-center gap-2">
                    Job Card #
                    {sortField === 'jobCardNumber' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-2">
                    Status
                    {sortField === 'status' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('agentName')}
                >
                  <div className="flex items-center gap-2">
                    Agent
                    {sortField === 'agentName' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('clientName')}
                >
                  <div className="flex items-center gap-2">
                    Client
                    {sortField === 'clientName' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('siteName')}
                >
                  <div className="flex items-center gap-2">
                    Site
                    {sortField === 'siteName' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('timeOfArrival')}
                >
                  <div className="flex items-center gap-2">
                    Date
                    {sortField === 'timeOfArrival' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('travelKilometers')}
                >
                  <div className="flex items-center gap-2">
                    Distance
                    {sortField === 'travelKilometers' && (
                      <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} text-xs`}></i>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedJobCards.map(jobCard => (
                <tr 
                  key={jobCard.id} 
                  className="hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => openDetailView(jobCard)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {jobCard.jobCardNumber || `JC${jobCard.id.slice(-6)}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      jobCard.status === 'completed' ? 'bg-green-100 text-green-700' :
                      jobCard.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {jobCard.status || 'draft'}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{jobCard.agentName || 'N/A'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{jobCard.clientName || 'N/A'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{jobCard.siteName || 'N/A'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {jobCard.timeOfArrival 
                        ? new Date(jobCard.timeOfArrival).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })
                        : jobCard.createdAt 
                          ? new Date(jobCard.createdAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'N/A'
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {jobCard.travelKilometers > 0 ? `${jobCard.travelKilometers.toFixed(1)} km` : 'N/A'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditPage(jobCard)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(jobCard.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
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
      )}
    </div>
  );
};

// Make available globally
window.JobCards = JobCards;

