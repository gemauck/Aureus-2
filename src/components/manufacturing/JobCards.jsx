// Job Cards Page Component for Manufacturing
// Features:
// - Full offline support with localStorage + API sync
//   - All job card data (including photos and documents) cached locally
//   - Photos stored as data URLs for offline access
//   - Documents stored as data URLs for offline access
//   - All related data (users, clients, vehicles, inventory) cached
//   - Automatic sync when connection is restored
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
  const [viewingJobCard, setViewingJobCard] = useState(null);
  const [formData, setFormData] = useState({
    agentName: '',
    otherTechnicians: [],
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    location: '',
    locationLatitude: '',
    locationLongitude: '',
    vehicleId: '',
    vehicleUsed: '',
    timeOfDeparture: '',
    timeOfArrival: '',
    departureFromSite: '',
    arrivalBackAtOffice: '',
    kmReadingBefore: '',
    kmReadingAfter: '',
    reasonForVisit: '',
    diagnosis: '',
    actionsTaken: '',
    stockUsed: [],
    materialsBought: [],
    otherComments: '',
    photos: [],
    documents: [],
    status: 'draft'
  });
  const [technicianInput, setTechnicianInput] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [newStockItem, setNewStockItem] = useState({ sku: '', quantity: 0, locationId: '' });
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [mapInstance, setMapInstance] = useState(null);
  const [locationMarker, setLocationMarker] = useState(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const locationMapRef = useRef(null);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [vehicleFormData, setVehicleFormData] = useState({ name: '', model: '', type: '', reg: '', assetNumber: '', notes: '', status: 'active' });

  // Load job cards with offline support - defined as a stable function reference
  const loadJobCardsRef = useRef(null);
  const syncPendingJobCardsRef = useRef(null);
  
  // Function to ensure job card data is fully accessible offline
  const ensureJobCardOfflineAccess = useCallback((jobCard) => {
    if (!jobCard) return jobCard;
    
    // Ensure all arrays exist
    const enhanced = {
      ...jobCard,
      photos: Array.isArray(jobCard.photos) ? jobCard.photos : [],
      documents: Array.isArray(jobCard.documents) ? jobCard.documents : [],
      stockUsed: Array.isArray(jobCard.stockUsed) ? jobCard.stockUsed : [],
      materialsBought: Array.isArray(jobCard.materialsBought) ? jobCard.materialsBought : [],
      otherTechnicians: Array.isArray(jobCard.otherTechnicians) ? jobCard.otherTechnicians : []
    };
    
    // Ensure photos are data URLs (for offline access)
    enhanced.photos = enhanced.photos.map(photo => {
      if (typeof photo === 'string') {
        // If it's already a data URL, keep it
        if (photo.startsWith('data:')) {
          return photo;
        }
        // If it's a URL, try to get from cache or return as-is
        // (Note: We can't convert URLs to data URLs without network, so keep as-is)
        return photo;
      }
      // If it's an object with url property
      return typeof photo === 'object' && photo.url ? photo.url : photo;
    });
    
    // Ensure documents are properly formatted
    enhanced.documents = enhanced.documents.map(doc => {
      if (typeof doc === 'string') {
        // Convert string to object format if needed
        return {
          id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: 'Document',
          url: doc,
          size: 0,
          type: 'application/octet-stream',
          uploadedAt: jobCard.createdAt || new Date().toISOString()
        };
      }
      return doc;
    });
    
    return enhanced;
  }, []);
  
  const loadJobCards = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      // If forceRefresh is true, skip localStorage and go straight to API
      // This ensures we get fresh data after delete operations
      if (!forceRefresh) {
        // First, try to load from localStorage (offline support)
        const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
        if (cached.length > 0) {
          // Ensure all job cards are accessible offline
          const enhancedCards = cached.map(card => ensureJobCardOfflineAccess(card));
          setJobCards(enhancedCards);
          setIsLoading(false);
        }
      } else {
        // Force refresh mode - clear localStorage first to prevent stale data
        console.log('🔄 Force refresh: Clearing localStorage cache');
        localStorage.removeItem('manufacturing_jobcards');
      }

      // Then try to sync from API if online
      const onlineStatus = navigator.onLine;
      if (onlineStatus && window.DatabaseAPI?.getJobCards) {
        try {
          console.log('📡 JobCards: Fetching from API...', forceRefresh ? '(force refresh)' : '');
          
          // Force cache bypass if forceRefresh is true
          if (forceRefresh && window.DatabaseAPI._responseCache) {
            window.DatabaseAPI._responseCache.delete('GET:/jobcards');
            console.log('🗑️ Cleared job cards cache for force refresh');
          }
          
          // Add cache-busting query parameter to force fresh request
          const cacheBuster = forceRefresh ? `?_t=${Date.now()}` : '';
          const response = await window.DatabaseAPI.makeRequest(`/jobcards${cacheBuster}`);
          
          // Normalize response (same logic as getJobCards)
          const normalized = {
            data: {
              jobCards: Array.isArray(response?.data?.jobCards)
                ? response.data.jobCards
                : Array.isArray(response?.jobCards)
                  ? response.jobCards
                  : Array.isArray(response?.data)
                    ? response.data
                    : []
            }
          };
          console.log('📡 JobCards: API response:', normalized);
          const jobCardsData = normalized.data.jobCards;
          console.log('📡 JobCards: Parsed job cards:', jobCardsData.length);
          if (Array.isArray(jobCardsData)) {
            // Mark all API-loaded cards as synced to prevent duplicate creation
            // Ensure all job cards are accessible offline
            const syncedCards = jobCardsData.map(jc => {
              const enhanced = ensureJobCardOfflineAccess({ ...jc, synced: true });
              return enhanced;
            });
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
            localStorage.setItem('manufacturing_jobcards', JSON.stringify([]));
          }
        } catch (error) {
          // Handle authentication errors gracefully
          const isAuthError = error.message?.includes('401') || 
                              error.message?.includes('Unauthorized') ||
                              error.message?.includes('No authentication token');
          
          if (isAuthError) {
            console.warn('⚠️ JobCards: Authentication error - will retry when user logs in');
            // Don't clear cached data on auth errors - user might just need to refresh token
          } else {
            console.error('❌ JobCards: Failed to sync from API:', error);
            console.error('❌ Error details:', error.message, error.stack);
          }
          
          // Still show cached data if available (unless forceRefresh)
          if (!forceRefresh) {
            const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
            if (cached.length > 0) {
              console.log('📦 JobCards: Using cached data due to API error');
            }
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
  }, [ensureJobCardOfflineAccess]); // Include ensureJobCardOfflineAccess in dependencies

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
          // Handle authentication errors gracefully
          const isAuthError = error.message?.includes('401') || 
                              error.message?.includes('Unauthorized') ||
                              error.message?.includes('No authentication token');
          
          if (isAuthError) {
            console.warn(`⚠️ JobCards: Authentication error syncing job card ${card.id} - will retry when authenticated`);
            // Keep as unsynced - will retry when user authenticates
          } else {
            console.error(`❌ Failed to sync job card ${card.id}:`, error);
            // Keep as unsynced for next attempt
          }
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

  // Load vehicles - with offline support
  useEffect(() => {
    const loadVehicles = async () => {
      try {
        // First, load from cache for instant UI
        const cached = JSON.parse(localStorage.getItem('manufacturing_vehicles') || '[]');
        if (cached.length > 0) {
          setVehicles(cached);
        }

        // Then try to sync from API if online
        if (isOnline && window.DatabaseAPI?.getVehicles) {
          try {
            const response = await window.DatabaseAPI.getVehicles();
            const vehiclesData = response?.data?.vehicles || response?.data || [];
            if (Array.isArray(vehiclesData) && vehiclesData.length > 0) {
              setVehicles(vehiclesData);
              localStorage.setItem('manufacturing_vehicles', JSON.stringify(vehiclesData));
            }
          } catch (error) {
            console.warn('Failed to load vehicles from API, using cache:', error);
            if (cached.length > 0) setVehicles(cached);
          }
        }
      } catch (error) {
        console.warn('Failed to load vehicles:', error);
        const cached = JSON.parse(localStorage.getItem('manufacturing_vehicles') || '[]');
        if (cached.length > 0) setVehicles(cached);
      }
    };
    loadVehicles();
  }, [isOnline]);

  // Initial load of job cards - run only once on mount
  // This ensures cached data is available immediately for offline access
  useEffect(() => {
    const initLoad = async () => {
      // Immediately load from cache for instant offline access
      const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      if (cached.length > 0) {
        const enhancedCards = cached.map(card => ensureJobCardOfflineAccess(card));
        setJobCards(enhancedCards);
        setIsLoading(false);
      }
      
      // Then load from API if available
      await loadJobCardsRef.current?.();
      // NOTE: Don't sync pending cards on mount - they're already on the server
      // syncPendingJobCards should only be called when coming back online
    };
    initLoad();
  }, [ensureJobCardOfflineAccess]); // Include ensureJobCardOfflineAccess to ensure it's available

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
      // Ensure job card data is accessible offline
      const enhancedJobCard = ensureJobCardOfflineAccess(editingJobCard);
      
      setFormData({
        agentName: enhancedJobCard.agentName || '',
        otherTechnicians: enhancedJobCard.otherTechnicians || [],
        clientId: enhancedJobCard.clientId || '',
        clientName: enhancedJobCard.clientName || '',
        siteId: enhancedJobCard.siteId || '',
        siteName: enhancedJobCard.siteName || '',
        location: enhancedJobCard.location || '',
        locationLatitude: enhancedJobCard.locationLatitude || '',
        locationLongitude: enhancedJobCard.locationLongitude || '',
        vehicleId: enhancedJobCard.vehicleId || '',
        vehicleUsed: enhancedJobCard.vehicleUsed || '',
        timeOfDeparture: enhancedJobCard.timeOfDeparture ? enhancedJobCard.timeOfDeparture.substring(0, 16) : '',
        timeOfArrival: enhancedJobCard.timeOfArrival ? enhancedJobCard.timeOfArrival.substring(0, 16) : '',
        departureFromSite: enhancedJobCard.departureFromSite ? enhancedJobCard.departureFromSite.substring(0, 16) : '',
        arrivalBackAtOffice: enhancedJobCard.arrivalBackAtOffice ? enhancedJobCard.arrivalBackAtOffice.substring(0, 16) : '',
        kmReadingBefore: enhancedJobCard.kmReadingBefore || '',
        kmReadingAfter: enhancedJobCard.kmReadingAfter || '',
        reasonForVisit: enhancedJobCard.reasonForVisit || '',
        diagnosis: enhancedJobCard.diagnosis || '',
        actionsTaken: enhancedJobCard.actionsTaken || '',
        stockUsed: enhancedJobCard.stockUsed || [],
        materialsBought: enhancedJobCard.materialsBought || [],
        otherComments: enhancedJobCard.otherComments || '',
        photos: enhancedJobCard.photos || [],
        documents: enhancedJobCard.documents || [],
        status: enhancedJobCard.status || 'draft'
      });
      
      // Set photos - ensure they're in the right format for display
      const normalizedPhotos = (enhancedJobCard.photos || []).map((photo, idx) => {
        if (typeof photo === 'string') {
          return { name: `Photo ${idx + 1}`, url: photo, size: 0 };
        }
        return {
          name: photo.name || `Photo ${idx + 1}`,
          url: photo.url || photo,
          size: photo.size || 0
        };
      });
      setSelectedPhotos(normalizedPhotos);
      
      // Normalize documents - handle both old format (strings/dataUrls) and new format (objects)
      const normalizedDocuments = (enhancedJobCard.documents || []).map((doc, idx) => {
        if (typeof doc === 'string') {
          // Old format: just a data URL string
          return {
            id: `doc_${Date.now()}_${idx}`,
            name: `Document ${idx + 1}`,
            url: doc,
            size: 0,
            type: 'application/octet-stream',
            uploadedAt: enhancedJobCard.updatedAt || enhancedJobCard.createdAt || new Date().toISOString()
          };
        }
        // New format: object with all fields
        return {
          id: doc.id || `doc_${Date.now()}_${idx}`,
          name: doc.name || `Document ${idx + 1}`,
          url: doc.url || doc,
          size: doc.size || 0,
          type: doc.type || 'application/octet-stream',
          uploadedAt: doc.uploadedAt || enhancedJobCard.updatedAt || enhancedJobCard.createdAt || new Date().toISOString()
        };
      });
      setSelectedDocuments(normalizedDocuments);
    }
  }, [editingJobCard, ensureJobCardOfflineAccess]);

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

  const handleDocumentUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          const document = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: file.name,
            url: dataUrl,
            size: file.size,
            type: file.type,
            uploadedAt: new Date().toISOString()
          };
          setSelectedDocuments(prev => [...prev, document]);
          setFormData(prev => ({ ...prev, documents: [...prev.documents, document] }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveDocument = (id) => {
    const newDocuments = selectedDocuments.filter(doc => doc.id !== id);
    setSelectedDocuments(newDocuments);
    setFormData(prev => ({ ...prev, documents: newDocuments }));
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

      // Calculate total time in minutes
      const totalMinutes = calculateTotalTime();
      jobCardData.totalTimeMinutes = totalMinutes;

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
      // Ensure all data is properly formatted for offline access
      const enhancedJobCardData = ensureJobCardOfflineAccess(jobCardData);
      
      let updatedJobCards;
      const isNewCard = !editingJobCard;
      const wasSynced = editingJobCard?.synced !== false;
      
      // Mark new cards as unsynced, and track if it's an edit
      const cardDataWithSyncFlag = { 
        ...enhancedJobCardData, 
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
          // Handle authentication errors gracefully
          const isAuthError = error.message?.includes('401') || 
                              error.message?.includes('Unauthorized') ||
                              error.message?.includes('No authentication token');
          
          if (isAuthError) {
            console.warn('⚠️ JobCards: Authentication error - job card saved offline, will sync when authenticated');
          } else {
            console.warn('⚠️ Failed to sync job card to API, saved offline:', error.message);
          }
          // Card is already marked as unsynced, will be synced when back online or authenticated
        }
      } else {
        console.log('📴 Offline mode: Job card saved locally, will sync when online');
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
      // Close detail view if the deleted job card is being viewed
      if (viewingJobCard && viewingJobCard.id === id) {
        setViewingJobCard(null);
      }
      // Close edit form if the deleted job card is being edited
      if (editingJobCard && editingJobCard.id === id) {
        setEditingJobCard(null);
        setShowAddPage(false);
      }

      // First, try to delete from API if online
      if (isOnline && window.DatabaseAPI?.deleteJobCard) {
        try {
          console.log('🗑️ Deleting job card from database:', id);
          
          // DELETE FROM API FIRST - wait for confirmation
          await window.DatabaseAPI.deleteJobCard(id);
          console.log('✅ Job card deleted from database successfully');
          
          // Clear API cache to ensure fresh data on next load
          if (window.DatabaseAPI && window.DatabaseAPI._responseCache) {
            window.DatabaseAPI._responseCache.delete('GET:/jobcards');
            window.DatabaseAPI._responseCache.delete(`GET:/jobcards/${id}`);
            console.log('🗑️ Cleared job cards cache in DatabaseAPI');
          }
          
          // NOW remove from local state and localStorage after successful API delete
          const updatedJobCards = jobCards.filter(jc => jc.id !== id);
          setJobCards(updatedJobCards);
          localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));
          console.log('✅ Job card removed from local state after successful API delete');
          
          // Reload from API to ensure sync and get fresh data
          // Use a delay to ensure server has processed the delete
          setTimeout(async () => {
            if (loadJobCardsRef.current) {
              console.log('🔄 Reloading job cards from API after delete to ensure sync...');
              try {
                // Clear localStorage BEFORE reloading to prevent stale data
                localStorage.removeItem('manufacturing_jobcards');
                console.log('🗑️ Cleared localStorage before reload');
                
                await loadJobCardsRef.current(true); // Force refresh, bypass cache
                console.log('✅ Job cards reloaded from API after delete');
              } catch (syncError) {
                console.warn('⚠️ Failed to reload after delete:', syncError);
                // Don't show error to user - item already deleted from UI
              }
            }
          }, 500); // Increased delay to ensure server processes delete
          
          alert('Job card deleted successfully!');
          return; // Exit early after successful API delete
        } catch (error) {
          // Handle authentication errors gracefully
          const isAuthError = error.message?.includes('401') || 
                              error.message?.includes('Unauthorized') ||
                              error.message?.includes('No authentication token');
          
          if (isAuthError) {
            console.warn('⚠️ JobCards: Authentication error during delete - please log in and try again');
            // Restore the item since delete failed
            if (loadJobCardsRef.current) {
              await loadJobCardsRef.current();
            }
            alert('Authentication required. Please log in and try again.');
          } else {
            console.error('❌ Failed to delete from API:', error);
            // Restore the item since delete failed
            if (loadJobCardsRef.current) {
              await loadJobCardsRef.current();
            }
            const errorMessage = error.message || 'Unknown error';
            alert(`Failed to delete job card from server: ${errorMessage}. Please check your connection and try again.`);
          }
          return; // Don't proceed with local deletion if API fails
        }
      } else if (isOnline && !window.DatabaseAPI?.deleteJobCard) {
        console.warn('⚠️ DatabaseAPI.deleteJobCard not available');
        alert('Delete functionality is not available. Please refresh the page and try again.');
        return;
      } else {
        console.log('📴 Offline mode: Deleting job card locally only');
        // Remove from local state/localStorage if offline
        const updatedJobCards = jobCards.filter(jc => jc.id !== id);
        setJobCards(updatedJobCards);
        localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));
        console.log('✅ Job card removed from local state and localStorage (offline)');
        alert('Job card deleted successfully! (Changes will sync when online)');
      }
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

  const resetForm = () => {
    setFormData({
      agentName: user?.name || '',
      otherTechnicians: [],
      clientId: '',
      clientName: '',
      siteId: '',
      siteName: '',
      location: '',
      locationLatitude: '',
      locationLongitude: '',
      vehicleId: '',
      vehicleUsed: '',
      timeOfDeparture: '',
      timeOfArrival: '',
      departureFromSite: '',
      arrivalBackAtOffice: '',
      kmReadingBefore: '',
      kmReadingAfter: '',
      reasonForVisit: '',
      diagnosis: '',
      actionsTaken: '',
      stockUsed: [],
      materialsBought: [],
      otherComments: '',
      photos: [],
      documents: [],
      status: 'draft'
    });
    setSelectedPhotos([]);
    setSelectedDocuments([]);
    setTechnicianInput('');
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    // Clear map marker
    if (locationMarker) {
      locationMarker.remove();
      setLocationMarker(null);
    }
  };

  // Calculate total time in minutes
  const calculateTotalTime = () => {
    const departure = formData.timeOfDeparture ? new Date(formData.timeOfDeparture) : null;
    const arrivalBack = formData.arrivalBackAtOffice ? new Date(formData.arrivalBackAtOffice) : null;
    
    if (departure && arrivalBack && arrivalBack > departure) {
      const diffMs = arrivalBack - departure;
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      return diffMinutes;
    }
    return 0;
  };

  // Initialize map for location selection (only when showAddPage becomes true)
  useEffect(() => {
    if (!showAddPage || !locationMapRef.current) {
      // Clean up when hiding the form
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
      if (locationMarker) {
        locationMarker.remove();
        setLocationMarker(null);
      }
      return;
    }

    // Wait for Leaflet to be available
    if (typeof L === 'undefined') {
      const checkLeaflet = setInterval(() => {
        if (typeof L !== 'undefined') {
          clearInterval(checkLeaflet);
          initializeLocationMap();
        }
      }, 100);
      return () => clearInterval(checkLeaflet);
    }

    initializeLocationMap();

    function initializeLocationMap() {
      // Clean up existing map
      if (mapInstance) {
        mapInstance.remove();
      }

      // Default center (South Africa - approximate center)
      const defaultLat = formData.locationLatitude ? parseFloat(formData.locationLatitude) : -26.2041;
      const defaultLng = formData.locationLongitude ? parseFloat(formData.locationLongitude) : 28.0473;
      const defaultZoom = (formData.locationLatitude && formData.locationLongitude) ? 15 : 6;

      // Create map
      const map = L.map(locationMapRef.current).setView([defaultLat, defaultLng], defaultZoom);
      setMapInstance(map);

      // Add OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Add existing marker if coordinates exist
      if (formData.locationLatitude && formData.locationLongitude) {
        const lat = parseFloat(formData.locationLatitude);
        const lng = parseFloat(formData.locationLongitude);
        const marker = L.marker([lat, lng], { draggable: true })
          .addTo(map)
          .bindPopup('Location Pin<br>Drag to adjust');
        setLocationMarker(marker);

        // Update coordinates when marker is dragged
        marker.on('dragend', function() {
          const pos = marker.getLatLng();
          setFormData(prev => ({
            ...prev,
            locationLatitude: pos.lat.toString(),
            locationLongitude: pos.lng.toString()
          }));
        });
      }

      // Add click handler to place/update marker
      let currentMarkerRef = null;
      map.on('click', function(e) {
        const { lat, lng } = e.latlng;

        // Remove existing marker
        if (currentMarkerRef) {
          currentMarkerRef.remove();
        }

        // Create new marker
        const marker = L.marker([lat, lng], { draggable: true })
          .addTo(map)
          .bindPopup('Location Pin<br>Drag to adjust')
          .openPopup();
        currentMarkerRef = marker;
        setLocationMarker(marker);

        // Update form data
        setFormData(prev => ({
          ...prev,
          locationLatitude: lat.toString(),
          locationLongitude: lng.toString()
        }));

        // Update coordinates when marker is dragged
        marker.on('dragend', function() {
          const pos = marker.getLatLng();
          setFormData(prev => ({
            ...prev,
            locationLatitude: pos.lat.toString(),
            locationLongitude: pos.lng.toString()
          }));
        });
      });
    }

    // Cleanup function
    return () => {
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
      if (locationMarker) {
        locationMarker.remove();
        setLocationMarker(null);
      }
    };
  }, [showAddPage]); // Only depend on showAddPage

  // Update marker position when coordinates change externally (e.g., from GPS or editing existing card)
  useEffect(() => {
    if (!mapInstance || !showAddPage || !locationMarker) return;

    const lat = formData.locationLatitude ? parseFloat(formData.locationLatitude) : null;
    const lng = formData.locationLongitude ? parseFloat(formData.locationLongitude) : null;

    if (lat && lng) {
      // Only update if marker position is different (to avoid loops)
      try {
        const currentPos = locationMarker.getLatLng();
        if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
          locationMarker.setLatLng([lat, lng]);
          mapInstance.setView([lat, lng], 15);
          locationMarker.openPopup();
        }
      } catch (e) {
        // Marker might be removed, ignore
        console.warn('Marker update failed:', e);
      }
    }
  }, [formData.locationLatitude, formData.locationLongitude, mapInstance, showAddPage, locationMarker]);

  // Get current GPS location
  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      if (window.showNotification) {
        window.showNotification('Geolocation is not supported by your browser', 'error');
      } else {
        alert('Geolocation is not supported by your browser');
      }
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        // Update form data
        setFormData(prev => ({
          ...prev,
          locationLatitude: latitude.toString(),
          locationLongitude: longitude.toString()
        }));

        // Update map if it exists
        if (mapInstance) {
          mapInstance.setView([latitude, longitude], 15);

          // Remove existing marker
          if (locationMarker) {
            locationMarker.remove();
          }

          // Create new marker at current location
          const marker = L.marker([latitude, longitude], { draggable: true })
            .addTo(mapInstance)
            .bindPopup('Current Location<br>Drag to adjust')
            .openPopup();
          setLocationMarker(marker);

          // Update coordinates when marker is dragged
          marker.on('dragend', function() {
            const pos = marker.getLatLng();
            setFormData(prev => ({
              ...prev,
              locationLatitude: pos.lat.toString(),
              locationLongitude: pos.lng.toString()
            }));
          });
        }

        setIsGettingLocation(false);
        if (window.showNotification) {
          window.showNotification('Location detected successfully!', 'success');
        }
      },
      (error) => {
        setIsGettingLocation(false);
        let errorMessage = 'Failed to get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location permissions.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
        }
        if (window.showNotification) {
          window.showNotification(errorMessage, 'error');
        } else {
          alert(errorMessage);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Vehicle management handlers
  const handleSaveVehicle = async () => {
    try {
      if (!vehicleFormData.name || !vehicleFormData.reg) {
        if (window.showNotification) {
          window.showNotification('Vehicle name and registration number are required', 'error');
        } else {
          alert('Vehicle name and registration number are required');
        }
        return;
      }

      if (editingVehicle && window.DatabaseAPI?.updateVehicle) {
        await window.DatabaseAPI.updateVehicle(editingVehicle.id, vehicleFormData);
        if (window.showNotification) {
          window.showNotification('Vehicle updated successfully!', 'success');
        }
      } else if (window.DatabaseAPI?.createVehicle) {
        await window.DatabaseAPI.createVehicle(vehicleFormData);
        if (window.showNotification) {
          window.showNotification('Vehicle created successfully!', 'success');
        }
      }

      // Reload vehicles
      if (isOnline && window.DatabaseAPI?.getVehicles) {
        const response = await window.DatabaseAPI.getVehicles();
        const vehiclesData = response?.data?.vehicles || response?.data || [];
        if (Array.isArray(vehiclesData)) {
          setVehicles(vehiclesData);
          localStorage.setItem('manufacturing_vehicles', JSON.stringify(vehiclesData));
        }
      }

      setShowVehicleModal(false);
      setEditingVehicle(null);
      setVehicleFormData({ name: '', model: '', type: '', reg: '', assetNumber: '', notes: '', status: 'active' });
    } catch (error) {
      console.error('Error saving vehicle:', error);
      if (window.showNotification) {
        window.showNotification(`Failed to save vehicle: ${error.message}`, 'error');
      } else {
        alert(`Failed to save vehicle: ${error.message}`);
      }
    }
  };

  const handleDeleteVehicle = async (vehicleId) => {
    if (!confirm('Are you sure you want to delete this vehicle?')) return;

    try {
      if (window.DatabaseAPI?.deleteVehicle) {
        await window.DatabaseAPI.deleteVehicle(vehicleId);
        if (window.showNotification) {
          window.showNotification('Vehicle deleted successfully!', 'success');
        }

        // Reload vehicles
        if (isOnline && window.DatabaseAPI?.getVehicles) {
          const response = await window.DatabaseAPI.getVehicles();
          const vehiclesData = response?.data?.vehicles || response?.data || [];
          if (Array.isArray(vehiclesData)) {
            setVehicles(vehiclesData);
            localStorage.setItem('manufacturing_vehicles', JSON.stringify(vehiclesData));
          }
        }
      }
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      if (window.showNotification) {
        window.showNotification(`Failed to delete vehicle: ${error.message}`, 'error');
      } else {
        alert(`Failed to delete vehicle: ${error.message}`);
      }
    }
  };

  const openAddPage = () => {
    setEditingJobCard(null);
    resetForm();
    setShowAddPage(true);
  };

  const openEditPage = (jobCard) => {
    // Ensure all job card data is available offline
    // Load full job card data from cache if needed
    const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    const fullJobCard = cached.find(jc => jc.id === jobCard.id) || jobCard;
    
    // Ensure photos and documents are accessible offline
    // If photos/documents are URLs, convert them to data URLs if needed for offline access
    const enhancedJobCard = {
      ...fullJobCard,
      // Ensure photos array exists and is properly formatted
      photos: Array.isArray(fullJobCard.photos) ? fullJobCard.photos : [],
      // Ensure documents array exists and is properly formatted
      documents: Array.isArray(fullJobCard.documents) ? fullJobCard.documents : []
    };
    
    setEditingJobCard(enhancedJobCard);
    setShowAddPage(true);
  };

  const openViewPage = (jobCard) => {
    // Ensure all job card data is available offline
    // Load full job card data from cache if needed
    const cached = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
    const fullJobCard = cached.find(jc => jc.id === jobCard.id) || jobCard;
    
    // Ensure photos and documents are accessible offline
    const enhancedJobCard = ensureJobCardOfflineAccess(fullJobCard);
    
    setViewingJobCard(enhancedJobCard);
  };

  // Filter technicians/users - show only active users
  const availableTechnicians = users.filter(u => u.status !== 'inactive' && u.status !== 'suspended');

  // Detail view modal
  if (viewingJobCard) {
    const card = viewingJobCard;
    const travelKm = card.kmReadingBefore && card.kmReadingAfter
      ? parseFloat(card.kmReadingAfter) - parseFloat(card.kmReadingBefore)
      : 0;

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              Job Card Details
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {card.jobCardNumber || `Job Card ${card.id.slice(-6)}`}
              {!isOnline && <span className="ml-2 text-orange-600">⚠️ Offline</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setViewingJobCard(null);
                openEditPage(card);
              }}
              className="w-full sm:w-auto px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <i className="fas fa-edit mr-2"></i>Edit
            </button>
            <button
              onClick={() => setViewingJobCard(null)}
              className="w-full sm:w-auto px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <i className="fas fa-arrow-left mr-2"></i>Back to List
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded text-sm font-medium ${
              card.status === 'completed' ? 'bg-green-100 text-green-700' :
              card.status === 'submitted' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {card.status || 'draft'}
            </span>
          </div>

          {/* Basic Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Agent Name</label>
              <p className="text-sm text-gray-900">{card.agentName || 'N/A'}</p>
            </div>
            {card.otherTechnicians && card.otherTechnicians.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Other Technicians</label>
                <p className="text-sm text-gray-900">{card.otherTechnicians.join(', ')}</p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Client</label>
              <p className="text-sm text-gray-900">{card.clientName || 'N/A'}</p>
            </div>
            {card.siteName && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Site</label>
                <p className="text-sm text-gray-900">{card.siteName}</p>
              </div>
            )}
            {card.location && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Location</label>
                <p className="text-sm text-gray-900">{card.location}</p>
              </div>
            )}
            {card.vehicleUsed && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Vehicle</label>
                <p className="text-sm text-gray-900">{card.vehicleUsed}</p>
              </div>
            )}
          </div>

          {/* Time Tracking */}
          {(card.timeOfDeparture || card.timeOfArrival || card.departureFromSite || card.arrivalBackAtOffice) && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Time Tracking</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {card.timeOfDeparture && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Departure from Office</label>
                    <p className="text-sm text-gray-900">{new Date(card.timeOfDeparture).toLocaleString('en-ZA')}</p>
                  </div>
                )}
                {card.timeOfArrival && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Arrival at Site</label>
                    <p className="text-sm text-gray-900">{new Date(card.timeOfArrival).toLocaleString('en-ZA')}</p>
                  </div>
                )}
                {card.departureFromSite && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Departure from Site</label>
                    <p className="text-sm text-gray-900">{new Date(card.departureFromSite).toLocaleString('en-ZA')}</p>
                  </div>
                )}
                {card.arrivalBackAtOffice && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Arrival back at Office</label>
                    <p className="text-sm text-gray-900">{new Date(card.arrivalBackAtOffice).toLocaleString('en-ZA')}</p>
                  </div>
                )}
                {card.totalTimeMinutes > 0 && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">Total Time</label>
                    <p className="text-sm font-semibold text-gray-900">
                      {Math.floor(card.totalTimeMinutes / 60)}h {card.totalTimeMinutes % 60}m
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Kilometer Readings */}
          {(card.kmReadingBefore || card.kmReadingAfter) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {card.kmReadingBefore && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">KM Reading Before</label>
                  <p className="text-sm text-gray-900">{card.kmReadingBefore}</p>
                </div>
              )}
              {card.kmReadingAfter && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">KM Reading After</label>
                  <p className="text-sm text-gray-900">{card.kmReadingAfter}</p>
                </div>
              )}
              {travelKm > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Travel Distance</label>
                  <p className="text-sm font-semibold text-gray-900">{travelKm.toFixed(1)} km</p>
                </div>
              )}
            </div>
          )}

          {/* Reason for Visit */}
          {card.reasonForVisit && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason for Visit</label>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{card.reasonForVisit}</p>
            </div>
          )}

          {/* Diagnosis */}
          {card.diagnosis && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Diagnosis</label>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{card.diagnosis}</p>
            </div>
          )}

          {/* Actions Taken */}
          {card.actionsTaken && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Actions Taken</label>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{card.actionsTaken}</p>
            </div>
          )}

          {/* Stock Used */}
          {card.stockUsed && card.stockUsed.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Stock Used</h3>
              <div className="space-y-2">
                {card.stockUsed.map((item, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900">{item.itemName || item.sku}</p>
                    <p className="text-xs text-gray-600">
                      {item.locationName && `${item.locationName} • `}
                      Quantity: {item.quantity} • SKU: {item.sku}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials Bought */}
          {card.materialsBought && card.materialsBought.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Materials Bought</h3>
              <div className="space-y-2">
                {card.materialsBought.map((item, idx) => (
                  <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                    {item.description && (
                      <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                    )}
                    {item.reason && (
                      <p className="text-xs text-gray-500 mt-1">Reason: {item.reason}</p>
                    )}
                    <p className="text-sm font-semibold text-gray-900 mt-2">R {item.cost?.toFixed(2) || '0.00'}</p>
                  </div>
                ))}
                <div className="border-t border-gray-300 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-900">Total Cost:</span>
                    <span className="text-lg font-bold text-blue-600">
                      R {card.materialsBought.reduce((sum, item) => sum + (item.cost || 0), 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Other Comments */}
          {card.otherComments && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Other Comments</label>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{card.otherComments}</p>
            </div>
          )}

          {/* Photos */}
          {card.photos && card.photos.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Photos</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {card.photos.map((photo, idx) => {
                  const photoUrl = typeof photo === 'string' ? photo : photo.url;
                  return (
                    <div key={idx} className="relative group">
                      <img
                        src={photoUrl}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer"
                        onClick={() => {
                          // Open photo in new window/modal for full size
                          const newWindow = window.open();
                          if (newWindow) {
                            newWindow.document.write(`<img src="${photoUrl}" style="max-width:100%;height:auto;" />`);
                          }
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const errorDiv = document.createElement('div');
                          errorDiv.className = 'w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center';
                          errorDiv.innerHTML = '<i class="fas fa-image text-gray-400"></i>';
                          e.target.parentNode.appendChild(errorDiv);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Documents */}
          {card.documents && card.documents.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Documents</label>
              <div className="space-y-2">
                {card.documents.map((doc, idx) => {
                  const docObj = typeof doc === 'string' 
                    ? { id: `doc_${idx}`, name: `Document ${idx + 1}`, url: doc }
                    : doc;
                  return (
                    <div key={docObj.id || idx} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex-shrink-0">
                          {docObj.type?.includes('pdf') ? (
                            <i className="fas fa-file-pdf text-red-600 text-xl"></i>
                          ) : docObj.type?.includes('word') || docObj.type?.includes('document') ? (
                            <i className="fas fa-file-word text-blue-600 text-xl"></i>
                          ) : docObj.type?.includes('excel') || docObj.type?.includes('spreadsheet') ? (
                            <i className="fas fa-file-excel text-green-600 text-xl"></i>
                          ) : (
                            <i className="fas fa-file text-gray-400 text-xl"></i>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{docObj.name || `Document ${idx + 1}`}</p>
                          {docObj.size > 0 && (
                            <p className="text-xs text-gray-500">
                              {(docObj.size / 1024).toFixed(2)} KB
                            </p>
                          )}
                        </div>
                      </div>
                      {docObj.url && (
                        <a
                          href={docObj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800"
                          title="View document"
                        >
                          <i className="fas fa-external-link-alt"></i>
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="border-t border-gray-200 pt-4 text-xs text-gray-500">
            <p>Created: {card.createdAt ? new Date(card.createdAt).toLocaleString('en-ZA') : 'N/A'}</p>
            {card.updatedAt && card.updatedAt !== card.createdAt && (
              <p>Last Updated: {new Date(card.updatedAt).toLocaleString('en-ZA')}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (showAddPage) {
    const travelKm = formData.kmReadingBefore && formData.kmReadingAfter
      ? parseFloat(formData.kmReadingAfter) - parseFloat(formData.kmReadingBefore)
      : 0;

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
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
            className="w-full sm:w-auto px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>

          {/* Location with Map */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            
            {/* GPS Detection Button */}
            <div className="mb-2">
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={isGettingLocation}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
              >
                <i className={`fas ${isGettingLocation ? 'fa-spinner fa-spin' : 'fa-map-marker-alt'}`}></i>
                {isGettingLocation ? 'Detecting Location...' : 'Detect Current Location (GPS)'}
              </button>
              {(formData.locationLatitude && formData.locationLongitude) && (
                <span className="ml-3 text-xs text-gray-600">
                  <i className="fas fa-check-circle text-green-600 mr-1"></i>
                  Coordinates: {parseFloat(formData.locationLatitude).toFixed(6)}, {parseFloat(formData.locationLongitude).toFixed(6)}
                </span>
              )}
            </div>

            {/* Interactive Map */}
            <div className="mb-3 relative" style={{ zIndex: 0 }}>
              <div 
                ref={locationMapRef}
                className="w-full h-48 sm:h-64 rounded-lg border border-gray-300 overflow-hidden relative"
                style={{ minHeight: '192px', zIndex: 0 }}
              ></div>
              <p className="text-xs text-gray-500 mt-1">
                <i className="fas fa-info-circle mr-1"></i>
                Click on the map to place a location pin, or use GPS detection above
              </p>
            </div>

            {/* Location Text Input */}
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Specific location details (e.g., building name, floor, room number)"
            />
          </div>

          {/* Vehicle Selection */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-900">
                Vehicle Used
              </label>
              {user?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVehicle(null);
                    setVehicleFormData({ name: '', model: '', type: '', reg: '', assetNumber: '', notes: '', status: 'active' });
                    setShowVehicleModal(true);
                  }}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <i className="fas fa-plus mr-1"></i>Add Vehicle
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <select
                  name="vehicleId"
                  value={formData.vehicleId}
                  onChange={(e) => {
                    const selectedVehicle = vehicles.find(v => v.id === e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      vehicleId: e.target.value,
                      vehicleUsed: selectedVehicle ? `${selectedVehicle.name} (${selectedVehicle.reg})` : ''
                    }));
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select vehicle or enter manually</option>
                  {vehicles.map(vehicle => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.name} - {vehicle.reg} {vehicle.model ? `(${vehicle.model})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  type="text"
                  name="vehicleUsed"
                  value={formData.vehicleUsed}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Or enter vehicle manually (e.g., AB12 CD 3456)"
                />
              </div>
            </div>
          </div>

          {/* Time Tracking Section */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Time Tracking</h3>
            
            {/* To Site */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <h4 className="text-xs font-medium text-gray-600 mb-3 uppercase">To Site</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Departure from Office *
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
                    Arrival at Site *
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
            </div>

            {/* From Site */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <h4 className="text-xs font-medium text-gray-600 mb-3 uppercase">From Site</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Departure from Site *
                  </label>
                  <input
                    type="datetime-local"
                    name="departureFromSite"
                    value={formData.departureFromSite}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Arrival back at Office *
                  </label>
                  <input
                    type="datetime-local"
                    name="arrivalBackAtOffice"
                    value={formData.arrivalBackAtOffice}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Total Time Display */}
            {calculateTotalTime() > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    <i className="fas fa-clock mr-2"></i>
                    Total Time:
                  </span>
                  <span className="text-lg font-bold text-blue-700">
                    {Math.floor(calculateTotalTime() / 60)}h {calculateTotalTime() % 60}m
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Kilometer Readings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-3">
              <div className="col-span-1 sm:col-span-4">
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
              <div className="col-span-1 sm:col-span-4">
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
              <div className="col-span-1 sm:col-span-2">
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
              <div className="col-span-1 sm:col-span-2">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {selectedPhotos.map((photo, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={typeof photo === 'string' ? photo : photo.url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                      onError={(e) => {
                        // Handle image load errors gracefully (e.g., corrupted data URL)
                        e.target.style.display = 'none';
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'w-full h-24 bg-gray-100 rounded-lg flex items-center justify-center';
                        errorDiv.innerHTML = '<i class="fas fa-image text-gray-400"></i>';
                        e.target.parentNode.appendChild(errorDiv);
                      }}
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

          {/* Document Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Documents
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <input
                type="file"
                id="documentUpload"
                onChange={handleDocumentUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                multiple
              />
              <label
                htmlFor="documentUpload"
                className="cursor-pointer"
              >
                <i className="fas fa-file-upload text-3xl text-gray-400 mb-2"></i>
                <p className="text-sm text-gray-600">
                  Click to upload documents or drag and drop
                </p>
                <p className="text-xs text-gray-500">
                  PDF, Word, Excel, Text files (Max 10MB each)
                </p>
              </label>
            </div>
            {selectedDocuments.length > 0 && (
              <div className="mt-3 space-y-2">
                {selectedDocuments.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-shrink-0">
                        {doc.type?.includes('pdf') ? (
                          <i className="fas fa-file-pdf text-red-600 text-xl"></i>
                        ) : doc.type?.includes('word') || doc.type?.includes('document') ? (
                          <i className="fas fa-file-word text-blue-600 text-xl"></i>
                        ) : doc.type?.includes('excel') || doc.type?.includes('spreadsheet') ? (
                          <i className="fas fa-file-excel text-green-600 text-xl"></i>
                        ) : doc.type?.includes('text') || doc.type?.includes('csv') ? (
                          <i className="fas fa-file-alt text-gray-600 text-xl"></i>
                        ) : (
                          <i className="fas fa-file text-gray-400 text-xl"></i>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-500">
                          {(doc.size / 1024).toFixed(2)} KB
                          {doc.uploadedAt && (
                            <span className="ml-2">
                              • {new Date(doc.uploadedAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
                          title="View document"
                        >
                          <i className="fas fa-eye"></i>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveDocument(doc.id)}
                        className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                        title="Remove document"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
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
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => {
                setShowAddPage(false);
                setEditingJobCard(null);
                resetForm();
              }}
              className="w-full sm:flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {editingJobCard ? 'Update Job Card' : 'Create Job Card'}
            </button>
          </div>
        </form>

        {/* Vehicle Management Modal */}
        {showVehicleModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}
                </h3>
                <button
                  onClick={() => {
                    setShowVehicleModal(false);
                    setEditingVehicle(null);
                    setVehicleFormData({ name: '', model: '', type: '', reg: '', assetNumber: '', notes: '', status: 'active' });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vehicle Name *
                  </label>
                  <input
                    type="text"
                    value={vehicleFormData.name}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Service Van 1"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Model
                    </label>
                    <input
                      type="text"
                      value={vehicleFormData.model}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, model: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Toyota Hilux"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type
                    </label>
                    <input
                      type="text"
                      value={vehicleFormData.type}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, type: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Van, Truck, Car"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Registration Number *
                    </label>
                    <input
                      type="text"
                      value={vehicleFormData.reg}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, reg: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., AB12 CD 3456"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Asset Number
                    </label>
                    <input
                      type="text"
                      value={vehicleFormData.assetNumber}
                      onChange={(e) => setVehicleFormData({ ...vehicleFormData, assetNumber: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Asset number"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={vehicleFormData.notes}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Additional notes about the vehicle"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    value={vehicleFormData.status}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowVehicleModal(false);
                      setEditingVehicle(null);
                      setVehicleFormData({ name: '', model: '', type: '', reg: '', assetNumber: '', notes: '', status: 'active' });
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveVehicle}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingVehicle ? 'Update Vehicle' : 'Create Vehicle'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
                      onClick={() => openViewPage(jobCard)}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                      title="View Details"
                    >
                      <i className="fas fa-eye"></i>
                    </button>
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

