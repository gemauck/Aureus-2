// Public Job Card Form - Accessible without login
// Standalone form for technicians to submit job cards offline with a mobile-first experience
const { useState, useEffect, useCallback, useMemo, useRef } = React;

const STEP_IDS = ['assignment', 'visit', 'work', 'stock', 'signoff'];

const STEP_META = {
  assignment: {
    title: 'Team & Client',
    subtitle: 'Assign crew & site',
    icon: 'fa-user-check'
  },
  visit: {
    title: 'Site Visit',
    subtitle: 'Trip & timing',
    icon: 'fa-route'
  },
  work: {
    title: 'Work Notes',
    subtitle: 'Diagnosis & actions',
    icon: 'fa-clipboard-list'
  },
  stock: {
    title: 'Stock & Costs',
    subtitle: 'Usage & purchases',
    icon: 'fa-boxes-stacked'
  },
  signoff: {
    title: 'Customer Sign-off',
    subtitle: 'Feedback & approval',
    icon: 'fa-signature'
  }
};

const StepBadge = ({ index, stepId, active, complete, onClick, className = '' }) => {
  const meta = STEP_META[stepId] || {};
  const baseClasses = 'group flex items-center lg:flex-col lg:items-start lg:justify-start sm:flex-col sm:items-center justify-between sm:justify-center gap-3 sm:gap-2 lg:gap-3 rounded-xl px-3 py-3 sm:px-4 sm:py-4 lg:px-3 lg:py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-blue-600 min-w-[160px] sm:min-w-0 lg:min-w-0 snap-start w-full lg:w-full';
  const stateClass = active
    ? 'bg-white/95 text-blue-700 shadow-lg shadow-blue-500/25'
    : complete
      ? 'bg-white/30 text-white'
      : 'bg-white/10 text-white/80 hover:bg-white/20';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${stateClass} ${className}`}
      aria-current={active ? 'step' : undefined}
    >
      <div
        className={[
          'flex h-11 w-11 items-center justify-center rounded-full border-2 transition',
          active
            ? 'bg-white text-blue-600 border-white shadow'
            : complete
              ? 'bg-white/90 text-blue-600 border-transparent'
              : 'bg-white/20 text-white border-white/30 group-hover:border-white/50'
        ].join(' ')}
      >
        <i className={`fa-solid ${meta.icon || 'fa-circle-dot'} text-base`}></i>
      </div>
      <div className="flex-1 sm:flex sm:w-full sm:flex-col sm:items-center lg:items-start lg:flex-1">
        <span className={`text-[11px] uppercase tracking-wide font-semibold ${active ? 'text-blue-500' : 'text-white/70'} sm:text-center lg:text-left`}>
          Step {index + 1}
        </span>
        <span className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-white'} sm:text-center lg:text-left`}>
          {meta.title || stepId}
        </span>
        {meta.subtitle && (
          <span className={`text-[11px] sm:text-xs mt-0.5 ${active ? 'text-blue-500/80' : 'text-white/70'} sm:text-center lg:text-left`}>
            {meta.subtitle}
          </span>
        )}
      </div>
    </button>
  );
};

const SummaryRow = ({ label, value }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 text-right font-medium">{value || '—'}</span>
  </div>
);

const JobCardFormPublic = () => {
  const [formData, setFormData] = useState({
    agentName: '',
    otherTechnicians: [],
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    location: '',
    latitude: '',
    longitude: '',
    timeOfDeparture: '',
    timeOfArrival: '',
    vehicleUsed: '',
    kmReadingBefore: '',
    kmReadingAfter: '',
    reasonForVisit: '',
    diagnosis: '',
    actionsTaken: '',
    otherComments: '',
    stockUsed: [],
    materialsBought: [],
    photos: [],
    status: 'draft',
    customerName: '',
    customerTitle: '',
    customerFeedback: '',
    customerSignDate: '',
    customerSignature: ''
  });

  const [technicianInput, setTechnicianInput] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  const [newStockItem, setNewStockItem] = useState({ sku: '', quantity: 0, locationId: '' });
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [shareStatus, setShareStatus] = useState('Copy share link');

  const signatureCanvasRef = useRef(null);
  const signatureWrapperRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapMarkerRef = useRef(null);

  useEffect(() => {
    const body = typeof document !== 'undefined' ? document.body : null;
    const html = typeof document !== 'undefined' ? document.documentElement : null;

    if (body) {
      body.classList.add('job-card-public');
    }
    if (html) {
      html.classList.add('job-card-public');
    }

    return () => {
      if (body) {
        body.classList.remove('job-card-public');
      }
      if (html) {
        html.classList.remove('job-card-public');
      }
    };
  }, []);

  const availableTechnicians = useMemo(
    () => users.filter(u => u.status !== 'inactive' && u.status !== 'suspended'),
    [users]
  );

  const travelKm = formData.kmReadingBefore && formData.kmReadingAfter
    ? Math.max(0, parseFloat(formData.kmReadingAfter) - parseFloat(formData.kmReadingBefore))
    : 0;

  const totalMaterialCost = useMemo(
    () => (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0),
    [formData.materialsBought]
  );

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/job-card';
    }
    return `${window.location.origin}/job-card`;
  }, []);

  const resizeSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    const wrapper = signatureWrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = window.devicePixelRatio || 1;
    const width = wrapper.clientWidth;
    const height = 180;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }, []);

  const getSignaturePosition = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches ? event.touches[0] : event;
    return {
      x: pointer.clientX - rect.left,
      y: pointer.clientY - rect.top
    };
  }, []);

  const startSignature = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    isDrawingRef.current = true;
    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.preventDefault();
  }, [getSignaturePosition]);

  const drawSignature = useCallback((event) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
    event.preventDefault();
  }, [getSignaturePosition]);

  const endSignature = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const clearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    resizeSignatureCanvas();
    setHasSignature(false);
  }, [resizeSignatureCanvas]);

  const exportSignature = useCallback(() => {
    if (!hasSignature || !signatureCanvasRef.current) {
      return '';
    }
    return signatureCanvasRef.current.toDataURL('image/png');
  }, [hasSignature]);

  const handleShareLink = useCallback(async () => {
    const targetUrl = shareUrl || (typeof window !== 'undefined' ? `${window.location.origin}/job-card` : '/job-card');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Job Card Capture',
          text: 'Use the mobile-friendly job card wizard to capture site visits.',
          url: targetUrl
        });
        setShareStatus('Link shared');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl);
        setShareStatus('Link copied');
      } else {
        throw new Error('Share API unavailable');
      }
    } catch (error) {
      console.warn('Job card share failed, attempting clipboard fallback:', error);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(targetUrl);
          setShareStatus('Link copied');
        } catch (clipboardError) {
          console.error('Clipboard fallback failed:', clipboardError);
          setShareStatus('Copy unavailable');
          return;
        }
      } else {
        setShareStatus('Copy unavailable');
        return;
      }
    } finally {
      setTimeout(() => setShareStatus('Copy share link'), 2500);
    }
  }, [shareUrl]);

  const handleOpenClassicView = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const classicUrl = `${window.location.origin}/service-maintenance`;
    window.open(classicUrl, '_blank', 'noopener,noreferrer');
  }, []);

  // Map selection functions
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      // Use Nominatim (OpenStreetMap geocoding service)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Abcotronics-ERP/1.0'
          }
        }
      );
      const data = await response.json();
      
      let address = '';
      if (data.address) {
        const parts = [];
        if (data.address.road) parts.push(data.address.road);
        if (data.address.suburb || data.address.neighbourhood) parts.push(data.address.suburb || data.address.neighbourhood);
        if (data.address.city || data.address.town) parts.push(data.address.city || data.address.town);
        if (data.address.state) parts.push(data.address.state);
        address = parts.join(', ');
      }
      
      if (!address) {
        address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }

      setFormData(prev => ({
        ...prev,
        location: address,
        latitude: lat.toString(),
        longitude: lng.toString()
      }));
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      setFormData(prev => ({
        ...prev,
        location: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        latitude: lat.toString(),
        longitude: lng.toString()
      }));
    }
  }, []);

  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || typeof window === 'undefined' || !window.L) {
      return;
    }

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const L = window.L;
    const defaultLat = formData.latitude ? parseFloat(formData.latitude) : -25.7479; // South Africa default
    const defaultLng = formData.longitude ? parseFloat(formData.longitude) : 28.2293;

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: formData.latitude && formData.longitude ? 15 : 6,
      zoomControl: true
    });

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    // Add marker if coordinates exist
    if (formData.latitude && formData.longitude) {
      const marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);
      mapMarkerRef.current = marker;
      
      marker.on('dragend', (e) => {
        const lat = e.target.getLatLng().lat;
        const lng = e.target.getLatLng().lng;
        reverseGeocode(lat, lng);
      });
    }

    // Handle map clicks
    map.on('click', (e) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      // Remove existing marker
      if (mapMarkerRef.current) {
        map.removeLayer(mapMarkerRef.current);
      }

      // Add new marker
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      mapMarkerRef.current = marker;
      
      marker.on('dragend', (e) => {
        const newLat = e.target.getLatLng().lat;
        const newLng = e.target.getLatLng().lng;
        reverseGeocode(newLat, newLng);
      });

      reverseGeocode(lat, lng);
    });

    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          map.setView([lat, lng], 15);
        },
        () => {
          // Geolocation failed, use default
        }
      );
    }
  }, [formData.latitude, formData.longitude, reverseGeocode]);

  const handleOpenMap = useCallback(() => {
    setShowMapModal(true);
    setTimeout(() => {
      initializeMap();
    }, 100);
  }, [initializeMap]);

  const handleCloseMap = useCallback(() => {
    setShowMapModal(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    mapMarkerRef.current = null;
  }, []);

  const progressPercent = Math.min(100, Math.round(((currentStep + 1) / STEP_IDS.length) * 100));

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

  useEffect(() => {
    const loadClients = async () => {
      try {
        const token = window.storage?.getToken?.();
        const isLoggedIn = !!token;
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_clients') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('clients') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        const activeClients = Array.isArray(cached) ? cached.filter(c => {
          const status = (c.status || '').toLowerCase();
          const type = (c.type || 'client').toLowerCase();
          return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
        }) : [];
        
        if (activeClients.length > 0) {
          setClients(activeClients);
          setIsLoading(false);
        }

        if (isOnline && (isLoggedIn || window.DatabaseAPI?.getClients)) {
          try {
            const response = await window.DatabaseAPI.getClients();
            if (response?.data?.clients || Array.isArray(response?.data)) {
              const allClients = response.data.clients || response.data || [];
              const active = Array.isArray(allClients) ? allClients.filter(c => {
                const status = (c.status || '').toLowerCase();
                const type = (c.type || 'client').toLowerCase();
                return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
              }) : [];
              
              if (active.length > 0) {
                setClients(active);
                localStorage.setItem('manufacturing_clients', JSON.stringify(active));
                localStorage.setItem('clients', JSON.stringify(active));
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load clients from API, using cache:', error.message);
            try {
              if (token) {
                const response = await fetch('/api/clients', {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (response.ok) {
                  const data = await response.json();
                  const allClients = data?.data?.clients || data?.data || [];
                  const active = Array.isArray(allClients) ? allClients.filter(c => {
                    const status = (c.status || '').toLowerCase();
                    const type = (c.type || 'client').toLowerCase();
                    return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
                  }) : [];
                  if (active.length > 0) {
                    setClients(active);
                    localStorage.setItem('manufacturing_clients', JSON.stringify(active));
                    localStorage.setItem('clients', JSON.stringify(active));
                  }
                }
              }
            } catch (fallbackError) {
              console.warn('⚠️ JobCardFormPublic: Fallback fetch also failed:', fallbackError.message);
            }
          }
        }
        
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

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_users') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('users') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        
        if (cached.length > 0) {
          setUsers(cached);
        }

        const token = window.storage?.getToken?.();
        const isLoggedIn = !!token;
        
        if (isOnline && (isLoggedIn || window.DatabaseAPI?.getUsers)) {
          try {
            const response = await window.DatabaseAPI.getUsers();
            if (response?.data?.users || Array.isArray(response?.data)) {
              const usersData = response.data.users || response.data || [];
              if (Array.isArray(usersData) && usersData.length > 0) {
                setUsers(usersData);
                localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                localStorage.setItem('users', JSON.stringify(usersData));
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load users from API, using cache:', error.message);
            try {
              if (token) {
                const response = await fetch('/api/users', {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (response.ok) {
                  const data = await response.json();
                  const usersData = data?.data?.users || data?.data || [];
                  if (Array.isArray(usersData) && usersData.length > 0) {
                    setUsers(usersData);
                    localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                    localStorage.setItem('users', JSON.stringify(usersData));
                  }
                }
              }
            } catch (fallbackError) {
              console.warn('⚠️ JobCardFormPublic: Fallback fetch also failed:', fallbackError.message);
            }
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading users:', error);
      }
    };
    loadUsers();
  }, [isOnline]);

  useEffect(() => {
    const loadStockData = async () => {
      try {
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
        }

        const token = window.storage?.getToken?.();
        const isLoggedIn = !!token;
        
        if (isOnline && (isLoggedIn || window.DatabaseAPI?.getInventory)) {
          try {
            const response = await window.DatabaseAPI.getInventory();
            if (response?.data?.inventory || Array.isArray(response?.data)) {
              const inventoryItems = response.data.inventory || response.data || [];
              if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
                setInventory(inventoryItems);
                localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load inventory from API, using cache:', error.message);
            try {
              if (token) {
                const response = await fetch('/api/manufacturing/inventory', {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (response.ok) {
                  const data = await response.json();
                  const inventoryItems = data?.data?.inventory || data?.data || [];
                  if (Array.isArray(inventoryItems) && inventoryItems.length > 0) {
                    setInventory(inventoryItems);
                    localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
                  }
                }
              }
            } catch (fallbackError) {
              console.warn('⚠️ JobCardFormPublic: Fallback fetch also failed:', fallbackError.message);
            }
          }
        }
        
        const cachedLocations1 = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        const cachedLocations2 = JSON.parse(localStorage.getItem('manufacturing_locations') || '[]');
        const cachedLocations = cachedLocations1.length > 0 ? cachedLocations1 : cachedLocations2;
        
        if (cachedLocations.length > 0) {
          setStockLocations(cachedLocations);
        } else {
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse', status: 'active' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle', status: 'active' }
          ];
          setStockLocations(defaultLocations);
          localStorage.setItem('stock_locations', JSON.stringify(defaultLocations));
        }
        
        if (isOnline && (isLoggedIn || window.DatabaseAPI?.getStockLocations)) {
          try {
            const response = await window.DatabaseAPI.getStockLocations();
            if (response?.data?.locations || Array.isArray(response?.data)) {
              const locations = response.data.locations || response.data || [];
              if (Array.isArray(locations) && locations.length > 0) {
                setStockLocations(locations);
                localStorage.setItem('stock_locations', JSON.stringify(locations));
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load locations from API, using cache:', error.message);
            try {
              if (token) {
                const response = await fetch('/api/manufacturing/locations', {
                  method: 'GET',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  }
                });
                if (response.ok) {
                  const data = await response.json();
                  const locations = data?.data?.locations || data?.data || [];
                  if (Array.isArray(locations) && locations.length > 0) {
                    setStockLocations(locations);
                    localStorage.setItem('stock_locations', JSON.stringify(locations));
                  }
                }
              }
            } catch (fallbackError) {
              console.warn('⚠️ JobCardFormPublic: Fallback fetch also failed:', error.message);
            }
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading stock data:', error);
      }
    };
    loadStockData();
  }, [isOnline]);

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

  useEffect(() => {
    if (formData.siteId && availableSites.length > 0) {
      const site = availableSites.find(s => s.id === formData.siteId || s === formData.siteId);
      if (site) {
        setFormData(prev => ({ ...prev, siteName: site.name || site }));
      }
    }
  }, [formData.siteId, availableSites]);

  useEffect(() => {
    resizeSignatureCanvas();

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const handleResize = () => resizeSignatureCanvas();

    canvas.addEventListener('pointerdown', startSignature);
    canvas.addEventListener('pointermove', drawSignature);
    canvas.addEventListener('pointerup', endSignature);
    canvas.addEventListener('pointerleave', endSignature);
    window.addEventListener('pointerup', endSignature);
    window.addEventListener('resize', handleResize);

    return () => {
      canvas.removeEventListener('pointerdown', startSignature);
      canvas.removeEventListener('pointermove', drawSignature);
      canvas.removeEventListener('pointerup', endSignature);
      canvas.removeEventListener('pointerleave', endSignature);
      window.removeEventListener('pointerup', endSignature);
      window.removeEventListener('resize', handleResize);
    };
  }, [drawSignature, endSignature, resizeSignatureCanvas, startSignature]);

  const handleChange = (event) => {
    const { name, value } = event.target;
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

  const handlePhotoUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          setSelectedPhotos(prev => [...prev, { name: file.name, url: dataUrl, size: file.size }]);
          setFormData(prev => ({ ...prev, photos: [...prev.photos, dataUrl] }));
        };
        reader.readAsDataURL(file);
      });
  };

  const handleRemovePhoto = (index) => {
    const newPhotos = selectedPhotos.filter((_, idx) => idx !== index);
    setSelectedPhotos(newPhotos);
    setFormData(prev => ({ ...prev, photos: newPhotos.map(photo => typeof photo === 'string' ? photo : photo.url) }));
  };

  const handleAddStockItem = () => {
    if (!newStockItem.sku || !newStockItem.locationId || newStockItem.quantity <= 0) {
      alert('Please select a component, location, and quantity greater than zero.');
      return;
    }
    
    const inventoryItem = inventory.find(item => item.sku === newStockItem.sku || item.id === newStockItem.sku);
    if (!inventoryItem) {
      alert('Selected component could not be found in inventory.');
      return;
    }

    const stockItem = {
      id: Date.now().toString(),
      sku: inventoryItem.sku || inventoryItem.id,
      itemName: inventoryItem.name || '',
      quantity: parseFloat(newStockItem.quantity),
      locationId: newStockItem.locationId,
      locationName: stockLocations.find(loc => loc.id === newStockItem.locationId)?.name || '',
      unitCost: inventoryItem.unitCost || 0
    };

    setFormData(prev => ({
      ...prev,
      stockUsed: [...prev.stockUsed, stockItem]
    }));
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
  };

  const handleRemoveStockItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      stockUsed: prev.stockUsed.filter(item => item.id !== itemId)
    }));
  };

  const handleAddMaterialItem = () => {
    if (!newMaterialItem.itemName || newMaterialItem.cost <= 0) {
      alert('Please provide an item name and a cost greater than zero.');
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

  const handleRemoveMaterialItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      materialsBought: prev.materialsBought.filter(item => item.id !== itemId)
    }));
  };

  const persistStockMovement = async (movementData) => {
            const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
            cachedMovements.push({
              ...movementData,
              id: `MOV${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              synced: false
            });
            localStorage.setItem('manufacturing_movements', JSON.stringify(cachedMovements));
            
            if (isOnline && window.DatabaseAPI?.createStockMovement) {
              window.DatabaseAPI.createStockMovement(movementData).catch(err => {
                console.warn('Failed to sync stock movement:', err);
              });
            }
  };

  const syncClientContact = async (jobCardData) => {
    if (!formData.clientId || !window.DatabaseAPI?.updateClient) return;
              const client = clients.find(c => c.id === formData.clientId);
    if (!client) return;

                const activityLog = Array.isArray(client.activityLog) ? client.activityLog : [];
                const newActivityEntry = {
                  id: Date.now(),
                  type: 'Job Card Created',
                  description: `Job card created for ${client.name}${formData.siteName ? ` at ${formData.siteName}` : ''}${formData.location ? ` - ${formData.location}` : ''}`,
                  timestamp: new Date().toISOString(),
                  user: formData.agentName || 'Technician'
                };
                
                const updatedClient = {
                  ...client,
                  lastContact: new Date().toISOString(),
                  activityLog: [...activityLog, newActivityEntry]
                };
                
                await window.DatabaseAPI.updateClient(formData.clientId, {
                  lastContact: updatedClient.lastContact,
                  activityLog: updatedClient.activityLog
                });
                
    const updatedClients = clients.map(clientEntry =>
      clientEntry.id === formData.clientId ? updatedClient : clientEntry
                );
                setClients(updatedClients);
                localStorage.setItem('manufacturing_clients', JSON.stringify(updatedClients));
                localStorage.setItem('clients', JSON.stringify(updatedClients));
  };

  const resetForm = () => {
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
      otherComments: '',
        stockUsed: [],
        materialsBought: [],
        photos: [],
      status: 'draft',
      customerName: '',
      customerTitle: '',
      customerFeedback: '',
      customerSignDate: '',
      customerSignature: ''
      });
      setSelectedPhotos([]);
      setTechnicianInput('');
      setNewStockItem({ sku: '', quantity: 0, locationId: '' });
      setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setCurrentStep(0);
    clearSignature();
  };

  const handleSave = async () => {
    if (!formData.clientId) {
      setStepError('Please select a client before submitting.');
      setCurrentStep(0);
      return;
    }
    if (!formData.agentName) {
      setStepError('Please select the attending technician.');
      setCurrentStep(0);
      return;
    }
    if (!hasSignature) {
      setStepError('Customer signature is required before submitting.');
      setCurrentStep(STEP_IDS.indexOf('signoff'));
      return;
    }

    setIsSubmitting(true);
    setStepError('');
    try {
      const jobCardData = {
        ...formData,
        customerSignature: exportSignature(),
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const kmBefore = parseFloat(formData.kmReadingBefore) || 0;
      const kmAfter = parseFloat(formData.kmReadingAfter) || 0;
      jobCardData.travelKilometers = Math.max(0, kmAfter - kmBefore);
      jobCardData.totalMaterialsCost = totalMaterialCost;

      if (formData.stockUsed && formData.stockUsed.length > 0) {
        const jobCardReference = `Job Card ${jobCardData.id}`;
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

          await persistStockMovement(movementData);
        }
      }

      const existingJobCards = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      const updatedJobCards = [...existingJobCards, jobCardData];
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));

      if (isOnline && window.DatabaseAPI?.createJobCard) {
        try {
          await window.DatabaseAPI.createJobCard(jobCardData);
          await syncClientContact(jobCardData);
          console.log('✅ Job card synced to API');
        } catch (error) {
          console.warn('⚠️ Failed to sync job card to API, saved offline:', error.message);
        }
      }

      alert('✅ Job card saved successfully!' + (isOnline ? '' : ' (Saved offline - will sync when online)'));
      resetForm();
    } catch (error) {
      console.error('Error saving job card:', error);
      alert(`Failed to save job card: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateStep = (stepIndex) => {
    switch (STEP_IDS[stepIndex]) {
      case 'assignment':
        if (!formData.agentName) return 'Select the attending technician to continue.';
        if (!formData.clientId) return 'A client must be selected before moving on.';
        return '';
      case 'signoff':
        if (!hasSignature) return 'Please capture the customer signature before submitting.';
        return '';
      default:
        return '';
    }
  };

  const goToStep = (stepIndex) => {
    if (stepIndex === currentStep) return;
    if (stepIndex > currentStep) {
      const validationError = validateStep(currentStep);
      if (validationError) {
        setStepError(validationError);
        return;
      }
    }
    setStepError('');
    setCurrentStep(stepIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = () => {
    const errorMessage = validateStep(currentStep);
    if (errorMessage) {
      setStepError(errorMessage);
      return;
    }
    setStepError('');
    setCurrentStep(prev => Math.min(prev + 1, STEP_IDS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevious = () => {
    setStepError('');
    setCurrentStep(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderAssignmentStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Lead Technician</h2>
          <p className="text-sm text-gray-500 mt-1">Assign the primary technician responsible for this job card.</p>
        </header>
            <select
              name="agentName"
              value={formData.agentName}
              onChange={handleChange}
              required
          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          style={{ fontSize: '16px' }}
            >
              <option value="">Select technician</option>
              {availableTechnicians.map(tech => (
                <option key={tech.id} value={tech.name || tech.email}>
                  {tech.name || tech.email} {tech.department ? `(${tech.department})` : ''}
                </option>
              ))}
            </select>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <p className="text-sm text-gray-500 mt-1">Add additional technicians assisting on-site.</p>
        </header>
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <select
                value={technicianInput}
                onChange={(e) => setTechnicianInput(e.target.value)}
            className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            style={{ fontSize: '16px' }}
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
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add
              </button>
            </div>
            {formData.otherTechnicians.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
                {formData.otherTechnicians.map((technician, idx) => (
                  <span key={idx} className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-sm">
                    {technician}
                    <button
                      type="button"
                      onClick={() => handleRemoveTechnician(technician)}
                      className="hover:text-blue-900 ml-1"
                      title="Remove"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Client & Site</h2>
          <p className="text-sm text-gray-500 mt-1">Link this visit to a client and optional customer site.</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client *
            </label>
            <select
              name="clientId"
              value={formData.clientId}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              style={{ fontSize: '16px' }}
            >
              <option value="">Select client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Site
            </label>
            <select
              name="siteId"
              value={formData.siteId}
              onChange={handleChange}
              disabled={!formData.clientId || availableSites.length === 0}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 bg-white"
              style={{ fontSize: '16px' }}
            >
              <option value="">
                {availableSites.length === 0 ? 'No sites available for this client' : 'Select site'}
              </option>
              {availableSites.map(site => (
                <option key={site.id || site.name || site} value={site.id || site.name || site}>
                  {site.name || site}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );

  const renderVisitStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Visit Details</h2>
          <p className="text-sm text-gray-500 mt-1">Capture the customer location and call-out reason.</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Facility, area or coordinates"
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleOpenMap}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-manipulation"
                title="Select location on map"
              >
                <i className="fas fa-map-marker-alt"></i>
              </button>
            </div>
            {formData.latitude && formData.longitude && (
              <p className="text-xs text-gray-500 mt-1">
                Coordinates: {formData.latitude}, {formData.longitude}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Call Out / Visit
            </label>
            <textarea
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Why was the technician requested to attend?"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Travel & Timing</h2>
          <p className="text-sm text-gray-500 mt-1">Record departure, arrival, vehicle and kilometer readings.</p>
        </header>
        <div className="space-y-4">
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
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
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
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
                />
            </div>
          </div>

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
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., AB12 CD GP"
                style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KM Reading Before
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  name="kmReadingBefore"
                  value={formData.kmReadingBefore}
                  onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KM Reading After
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  name="kmReadingAfter"
                  value={formData.kmReadingAfter}
                  onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                style={{ fontSize: '16px' }}
                />
            </div>
          </div>

          {travelKm > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <i className="fas fa-road text-blue-600"></i>
              <p className="text-sm font-medium text-blue-900">
                Travel Distance: {travelKm.toFixed(1)} km
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  const renderWorkStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Diagnosis</h2>
          <p className="text-sm text-gray-500 mt-1">Summarise the fault, findings or observations.</p>
        </header>
            <textarea
              name="diagnosis"
              value={formData.diagnosis}
              onChange={handleChange}
              rows={4}
          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="e.g., Pump not priming due to airlock in suction line..."
          style={{ fontSize: '16px' }}
        />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Actions Taken</h2>
          <p className="text-sm text-gray-500 mt-1">Detail the corrective actions and resolution steps.</p>
        </header>
            <textarea
              name="actionsTaken"
              value={formData.actionsTaken}
              onChange={handleChange}
              rows={4}
          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="Steps taken, parts replaced, calibrations performed..."
          style={{ fontSize: '16px' }}
        />
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Additional Notes</h2>
          <p className="text-sm text-gray-500 mt-1">Capture handover notes, risks or recommended next actions.</p>
        </header>
        <textarea
          name="otherComments"
          value={formData.otherComments}
          onChange={handleChange}
          rows={3}
          className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
          placeholder="Outstanding concerns, customer requests, safety notes..."
          style={{ fontSize: '16px' }}
        />
      </section>
          </div>
  );

  const renderStockStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stock Used</h2>
            <p className="text-sm text-gray-500 mt-1">Record components issued from inventory for this job.</p>
          </div>
          {formData.stockUsed.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {formData.stockUsed.length} item{formData.stockUsed.length === 1 ? '' : 's'}
            </span>
          )}
        </header>
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 mb-3">
              <div className="sm:col-span-4">
                <select
                  value={newStockItem.sku}
                  onChange={(e) => setNewStockItem({ ...newStockItem, sku: e.target.value })}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white"
              style={{ fontSize: '16px' }}
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
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg bg-white"
              style={{ fontSize: '16px' }}
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
                  inputMode="decimal"
                  value={newStockItem.quantity || ''}
                  onChange={(e) => setNewStockItem({ ...newStockItem, quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Qty"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
              style={{ fontSize: '16px' }}
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
                  <p className="text-xs text-gray-600 mt-0.5">
                    {item.locationName || 'Location N/A'} • Qty: {item.quantity} • SKU: {item.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStockItem(item.id)}
                  className="ml-3 text-red-600 hover:text-red-800"
                      title="Remove"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
        {formData.stockUsed.length === 0 && (
          <p className="text-sm text-gray-400">No stock usage recorded yet.</p>
        )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Materials Bought</h2>
            <p className="text-sm text-gray-500 mt-1">Capture purchases not taken from stock (cash, card, etc.).</p>
          </div>
          {totalMaterialCost > 0 && (
            <span className="text-sm font-semibold text-blue-600">
              R {totalMaterialCost.toFixed(2)}
            </span>
          )}
        </header>
            <div className="space-y-3 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newMaterialItem.itemName}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, itemName: e.target.value })}
                  placeholder="Item Name *"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
              style={{ fontSize: '16px' }}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={newMaterialItem.cost || ''}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="Cost (R) *"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
              style={{ fontSize: '16px' }}
                />
              </div>
              <input
                type="text"
                value={newMaterialItem.description}
                onChange={(e) => setNewMaterialItem({ ...newMaterialItem, description: e.target.value })}
                placeholder="Description"
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
            style={{ fontSize: '16px' }}
              />
              <input
                type="text"
                value={newMaterialItem.reason}
                onChange={(e) => setNewMaterialItem({ ...newMaterialItem, reason: e.target.value })}
                placeholder="Reason for purchase"
            className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
            style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleAddMaterialItem}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add Material
              </button>
            </div>
        {formData.materialsBought.length > 0 ? (
              <div className="space-y-2">
                {formData.materialsBought.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
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
                    className="text-red-600 hover:text-red-800"
                        title="Remove"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                ))}
            <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-900">Total Cost</span>
              <span className="text-lg font-bold text-blue-600">R {totalMaterialCost.toFixed(2)}</span>
                  </div>
                </div>
        ) : (
          <p className="text-sm text-gray-400">No ad-hoc purchases recorded yet.</p>
            )}
      </section>
          </div>
  );

  const renderSignoffStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
            <p className="text-sm text-gray-500 mt-1">Capture supporting photos directly from site.</p>
          </div>
          {selectedPhotos.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {selectedPhotos.length} photo{selectedPhotos.length === 1 ? '' : 's'}
            </span>
          )}
        </header>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
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
                className="cursor-pointer block"
              >
                <i className="fas fa-camera text-3xl sm:text-4xl text-gray-400 mb-2"></i>
                <p className="text-sm sm:text-base text-gray-600">
              Tap to upload photos or drag and drop
                </p>
                <p className="text-xs text-gray-500 mt-1">
              Supports mobile camera capture • Max 10MB each
                </p>
              </label>
            </div>
            {selectedPhotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {selectedPhotos.map((photo, idx) => (
              <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={typeof photo === 'string' ? photo : photo.url}
                      alt={`Photo ${idx + 1}`}
                  className="w-full h-24 sm:h-32 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition touch-manipulation"
                      title="Remove photo"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Customer Acknowledgement</h2>
          <p className="text-sm text-gray-500 mt-1">
            Capture customer details and signature confirming completed work.
          </p>
        </header>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Full name"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position / Title
              </label>
              <input
                type="text"
                name="customerTitle"
                value={formData.customerTitle}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Role at site"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Feedback
            </label>
            <textarea
              name="customerFeedback"
              value={formData.customerFeedback}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Optional comments from customer"
              style={{ fontSize: '16px' }}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sign-off Date
              </label>
              <input
                type="date"
                name="customerSignDate"
                value={formData.customerSignDate}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Status
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                style={{ fontSize: '16px' }}
            >
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="completed">Completed</option>
            </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Signature *
            </label>
            <div
              ref={signatureWrapperRef}
              className={[
                'border-2 rounded-lg overflow-hidden relative bg-white',
                hasSignature ? 'border-blue-500' : 'border-gray-300'
              ].join(' ')}
            >
              <canvas
                ref={signatureCanvasRef}
                className="w-full h-48 touch-none"
                style={{ touchAction: 'none', display: 'block' }}
              />
              {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-xs sm:text-sm text-gray-400 text-center px-4">
                    Sign here with finger or stylus
            </p>
          </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">
                Signatures are stored securely with the job card record.
              </span>
              <button
                type="button"
                onClick={clearSignature}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Clear signature
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Submission Summary</h2>
          <p className="text-sm text-gray-500 mt-1">Quick review before submitting this job card.</p>
        </header>
        <div className="space-y-3">
          <SummaryRow label="Technician" value={formData.agentName} />
          <SummaryRow label="Client" value={formData.clientName || clients.find(c => c.id === formData.clientId)?.name} />
          <SummaryRow label="Site" value={formData.siteName} />
          <SummaryRow label="Travel Distance" value={travelKm > 0 ? `${travelKm.toFixed(1)} km` : ''} />
          <SummaryRow label="Stock Lines" value={formData.stockUsed.length > 0 ? `${formData.stockUsed.length}` : ''} />
          <SummaryRow label="Materials Cost" value={totalMaterialCost > 0 ? `R ${totalMaterialCost.toFixed(2)}` : ''} />
          <SummaryRow label="Photos Attached" value={selectedPhotos.length > 0 ? `${selectedPhotos.length}` : ''} />
          <SummaryRow label="Customer Signature" value={hasSignature ? 'Captured' : 'Pending'} />
        </div>
      </section>
    </div>
  );

  const renderStepContent = () => {
    switch (STEP_IDS[currentStep]) {
      case 'assignment':
        return renderAssignmentStep();
      case 'visit':
        return renderVisitStep();
      case 'work':
        return renderWorkStep();
      case 'stock':
        return renderStockStep();
      case 'signoff':
        return renderSignoffStep();
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading job card form...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="job-card-public-wrapper fixed inset-0 flex flex-col xl:flex-row bg-gradient-to-b from-gray-100 to-gray-50 overflow-hidden">
      {/* Desktop Sidebar - Vertical Steps */}
      <aside className="hidden xl:flex xl:flex-col xl:w-56 flex-shrink-0 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 text-white shadow-xl z-10 overflow-y-auto overflow-x-hidden">
        <div className="p-4 pb-2 border-b border-white/20">
          <p className="text-[10px] uppercase tracking-wide text-white/70 font-semibold mb-1">
            Mobile Job Card
          </p>
          <h1 className="text-lg font-bold leading-tight">
            Field Job Card Wizard
          </h1>
          <p className="text-xs text-white/80 mt-2">
            Capture job cards in minutes with a guided, offline-friendly flow.
          </p>
        </div>
        <div className="flex-1 p-4 space-y-2">
          {STEP_IDS.map((stepId, idx) => (
            <StepBadge
              key={`desktop-${stepId}`}
              index={idx}
              stepId={stepId}
              active={idx === currentStep}
              complete={idx < currentStep}
              onClick={() => goToStep(idx)}
              className="w-full"
            />
          ))}
        </div>
        <div className="p-4 pt-2 border-t border-white/20 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-white/70">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span
              className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${
                isOnline ? 'bg-white/15 text-white' : 'bg-amber-200/90 text-amber-900'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                }`}
              ></span>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <button
              type="button"
              onClick={handleShareLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition"
            >
              <i className="fa-regular fa-share-from-square text-xs"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="xl:hidden flex-shrink-0 relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 text-white shadow-lg z-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-20 h-44 w-44 rounded-full bg-white/15 blur-3xl"></div>
          <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-white/10 blur-3xl"></div>
        </div>
        <div className="relative p-3 sm:p-5">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-white/70 font-semibold">
                  Mobile Job Card
                </p>
                <h1 className="text-lg sm:text-2xl font-bold leading-tight mt-1">
                  Field Job Card Wizard
                </h1>
                <p className="text-xs sm:text-sm text-white/80 mt-2 hidden sm:block">
                  Capture job cards in minutes with a guided, offline-friendly flow.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 sm:mt-0">
                <span
                  className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] sm:text-xs font-semibold justify-center ${
                    isOnline ? 'bg-white/15 text-white' : 'bg-amber-200/90 text-amber-900'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                    }`}
                  ></span>
                  {isOnline ? 'Online' : 'Offline'}
                </span>
                <button
                  type="button"
                  onClick={handleShareLink}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] sm:text-xs font-semibold hover:bg-white/25 transition"
                >
                  <i className="fa-regular fa-share-from-square text-xs"></i>
                  <span className="hidden sm:inline">Share</span>
                </button>
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <div
                className="mobile-step-scroll flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 snap-x snap-mandatory scrollbar-hide"
                aria-label="Wizard steps"
              >
                {STEP_IDS.map((stepId, idx) => (
                  <StepBadge
                    key={`mobile-${stepId}`}
                    index={idx}
                    stepId={stepId}
                    active={idx === currentStep}
                    complete={idx < currentStep}
                    onClick={() => goToStep(idx)}
                    className="flex-shrink-0"
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-white/70">
                <span>Progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Scrollable Content Area */}
        <div className="job-card-scrollable-content flex-1 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {stepError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 flex items-start gap-2 text-sm">
                <i className="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i>
                <div className="leading-relaxed">{stepError}</div>
              </div>
            )}

            <form onSubmit={(event) => { event.preventDefault(); handleSave(); }} className="space-y-4 sm:space-y-5">
              {renderStepContent()}
            </form>
          </div>
        </div>

        {/* Fixed Footer */}
        <footer className="flex-shrink-0 bg-white border-t border-gray-200 shadow-lg z-10">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-2 sm:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] sm:text-xs text-gray-500">
                Step {currentStep + 1} of {STEP_IDS.length}
              </div>
              <div className="flex flex-row gap-2">
                <button
                  type="button"
                  onClick={handlePrevious}
                  disabled={currentStep === 0 || isSubmitting}
                  className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium touch-manipulation"
                >
                  Back
                </button>

                {currentStep < STEP_IDS.length - 1 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={isSubmitting}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-xs font-medium shadow-sm touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="submit"
                    onClick={(event) => { event.preventDefault(); handleSave(); }}
                    disabled={isSubmitting}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-xs font-medium shadow-sm touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Saving...' : 'Submit'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </footer>
      </div>

      {/* Map Selection Modal */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Select Location on Map</h3>
              <button
                type="button"
                onClick={handleCloseMap}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div
                ref={mapContainerRef}
                className="w-full h-full"
                style={{ minHeight: '400px' }}
              ></div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-1">Selected Location:</p>
                  <p className="text-sm font-medium text-gray-900">{formData.location || 'Click on the map to select a location'}</p>
                  {formData.latitude && formData.longitude && (
                    <p className="text-xs text-gray-500 mt-1">
                      Coordinates: {formData.latitude}, {formData.longitude}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCloseMap}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold touch-manipulation"
                >
                  Use This Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

try {
  window.JobCardFormPublic = JobCardFormPublic;
  if (window.debug && !window.debug.performanceMode) {
    console.log('✅ JobCardFormPublic.jsx loaded and registered');
  }
} catch (error) {
  console.error('❌ JobCardFormPublic.jsx: Error registering component:', error);
}


