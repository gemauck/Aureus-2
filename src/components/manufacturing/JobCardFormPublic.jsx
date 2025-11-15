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
  const [submissionStatus, setSubmissionStatus] = useState(null); // 'success', 'error', or null
  const [submissionMessage, setSubmissionMessage] = useState('');
  const [submittedJobCardId, setSubmittedJobCardId] = useState(null);

  const signatureCanvasRef = useRef(null);
  const signatureWrapperRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastEventTypeRef = useRef(null); // Track last event type to prevent double handling
  const [showMapModal, setShowMapModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
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
    // Use wrapper height if available (fullscreen modal), otherwise default to 250px
    const height = wrapper.clientHeight > 0 ? wrapper.clientHeight : 250;

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
    
    // Ensure canvas is interactive
    canvas.style.touchAction = 'none';
    canvas.style.pointerEvents = 'auto';
    canvas.style.position = 'relative';
    canvas.style.zIndex = '2';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    if (wrapper.clientHeight > 0) {
      canvas.style.height = `${wrapper.clientHeight}px`;
    } else {
      canvas.style.height = '250px';
      canvas.style.minHeight = '250px';
    }
  }, []);

  const getSignaturePosition = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    // Handle both touch events and pointer events
    let clientX, clientY;
    if (event.touches && event.touches.length > 0) {
      // Touch event
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else if (event.changedTouches && event.changedTouches.length > 0) {
      // Touch end event
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else if (event.pointerType) {
      // Pointer event
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      // Mouse event
      clientX = event.clientX;
      clientY = event.clientY;
    }
    // Return coordinates relative to canvas (context is already scaled)
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }, []);

  const startSignature = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    // Determine event type to prevent double handling
    const eventType = event.type;
    const isPointerEvent = eventType.startsWith('pointer');
    const isTouchEvent = eventType.startsWith('touch');
    const isMouseEvent = eventType.startsWith('mouse');
    
    // If we're already handling pointer events, ignore touch/mouse events
    if (lastEventTypeRef.current === 'pointer' && (isTouchEvent || isMouseEvent)) {
      return;
    }
    // If we're handling touch events, ignore mouse events
    if (lastEventTypeRef.current === 'touch' && isMouseEvent) {
      return;
    }
    
    // Update last event type
    if (isPointerEvent) {
      lastEventTypeRef.current = 'pointer';
    } else if (isTouchEvent) {
      lastEventTypeRef.current = 'touch';
    } else if (isMouseEvent) {
      lastEventTypeRef.current = 'mouse';
    }

    // Prevent default to avoid scrolling and other browser behaviors
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    isDrawingRef.current = true;
    const ctx = canvas.getContext('2d');
    // Context is already scaled in resizeSignatureCanvas, so use base line width
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const { x, y } = getSignaturePosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getSignaturePosition]);

  const drawSignature = useCallback((event) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    // Check event type to prevent double handling
    const eventType = event.type;
    const isPointerEvent = eventType.startsWith('pointer');
    const isTouchEvent = eventType.startsWith('touch');
    const isMouseEvent = eventType.startsWith('mouse');
    
    // Only process events of the same type we started with
    if (lastEventTypeRef.current === 'pointer' && (isTouchEvent || isMouseEvent)) {
      return;
    }
    if (lastEventTypeRef.current === 'touch' && isMouseEvent) {
      return;
    }

    // Prevent default to avoid scrolling
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [getSignaturePosition]);

  const endSignature = useCallback((event) => {
    if (event) {
      // Check event type
      const eventType = event.type;
      const isPointerEvent = eventType.startsWith('pointer');
      const isTouchEvent = eventType.startsWith('touch');
      const isMouseEvent = eventType.startsWith('mouse');
      
      // Only process events of the same type we started with
      if (lastEventTypeRef.current === 'pointer' && (isTouchEvent || isMouseEvent)) {
        return;
      }
      if (lastEventTypeRef.current === 'touch' && isMouseEvent) {
        return;
      }
      
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    isDrawingRef.current = false;
    lastEventTypeRef.current = null; // Reset for next drawing session
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
      console.warn('⚠️ JobCardFormPublic: Cannot initialize map - missing container or Leaflet');
      if (!mapContainerRef.current) console.warn('  - Map container ref is null');
      if (!window.L) console.warn('  - Leaflet (window.L) is not loaded');
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

    console.log('🗺️ JobCardFormPublic: Initializing map at', defaultLat, defaultLng);

    // Ensure container is visible
    if (mapContainerRef.current) {
      mapContainerRef.current.style.display = 'block';
      mapContainerRef.current.style.visibility = 'visible';
      mapContainerRef.current.style.opacity = '1';
      mapContainerRef.current.style.width = '100%';
      mapContainerRef.current.style.height = '100%';
      mapContainerRef.current.style.minHeight = '400px';
    }

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: formData.latitude && formData.longitude ? 15 : 6,
      zoomControl: true
    });

    console.log('✅ JobCardFormPublic: Map created successfully');

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
        console.log('📡 JobCardFormPublic: Loading clients...');
        
        // Always load from cache first
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_clients') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('clients') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        const activeClients = Array.isArray(cached) ? cached.filter(c => {
          const status = (c.status || '').toLowerCase();
          const type = (c.type || 'client').toLowerCase();
          return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
        }) : [];
        
        console.log(`📋 JobCardFormPublic: Found ${activeClients.length} active clients in cache`);
        
        if (activeClients.length > 0) {
          console.log('✅ JobCardFormPublic: Setting clients from cache');
          setClients(activeClients);
        }
        
        setIsLoading(false); // Always set loading to false after checking cache

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            console.log('📡 JobCardFormPublic: Attempting to load clients from public API...');
            const response = await fetch('/api/public/clients', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const clients = data?.data?.clients || data?.clients || [];
              
              console.log(`✅ JobCardFormPublic: Loaded ${clients.length} clients from public API`);
              if (clients.length > 0) {
                setClients(clients);
                localStorage.setItem('manufacturing_clients', JSON.stringify(clients));
                localStorage.setItem('clients', JSON.stringify(clients));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public API returned error:', response.status);
              // Try authenticated API as fallback
              if (window.DatabaseAPI?.getClients) {
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
                      console.log(`✅ JobCardFormPublic: Loaded ${active.length} clients from authenticated API`);
                      setClients(active);
                      localStorage.setItem('manufacturing_clients', JSON.stringify(active));
                      localStorage.setItem('clients', JSON.stringify(active));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load clients from public API:', error.message);
          }
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
        console.log('📡 JobCardFormPublic: Loading users...');
        
        // Always load from cache first
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_users') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('users') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        
        console.log(`📋 JobCardFormPublic: Found ${cached.length} users in cache`);
        
        if (cached.length > 0) {
          console.log('✅ JobCardFormPublic: Setting users from cache');
          setUsers(cached);
        }

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            console.log('📡 JobCardFormPublic: Attempting to load users from public API...');
            const response = await fetch('/api/public/users', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const usersData = data?.data?.users || data?.users || [];
              
              console.log(`✅ JobCardFormPublic: Loaded ${usersData.length} users from public API`);
              if (usersData.length > 0) {
                setUsers(usersData);
                localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                localStorage.setItem('users', JSON.stringify(usersData));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public API returned error:', response.status);
              // Try authenticated API as fallback
              if (window.DatabaseAPI?.getUsers) {
                try {
                  const response = await window.DatabaseAPI.getUsers();
                  if (response?.data?.users || Array.isArray(response?.data)) {
                    const usersData = response.data.users || response.data || [];
                    if (usersData.length > 0) {
                      console.log(`✅ JobCardFormPublic: Loaded ${usersData.length} users from authenticated API`);
                      setUsers(usersData);
                      localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                      localStorage.setItem('users', JSON.stringify(usersData));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load users from public API:', error.message);
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
        console.log('📡 JobCardFormPublic: Loading inventory...');
        
        // Always load from cache first
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        console.log(`📋 JobCardFormPublic: Found ${cachedInventory.length} inventory items in cache`);
        
        if (cachedInventory.length > 0) {
          console.log('✅ JobCardFormPublic: Setting inventory from cache');
          setInventory(cachedInventory);
        }

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            console.log('📡 JobCardFormPublic: Attempting to load inventory from public API...');
            const response = await fetch('/api/public/inventory', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const inventoryItems = data?.data?.inventory || data?.inventory || [];
              
              console.log(`✅ JobCardFormPublic: Loaded ${inventoryItems.length} inventory items from public API`);
              if (inventoryItems.length > 0) {
                setInventory(inventoryItems);
                localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public inventory API returned error:', response.status);
              // Try authenticated API as fallback
              const token = window.storage?.getToken?.();
              if (token && window.DatabaseAPI?.getInventory) {
                try {
                  const response = await window.DatabaseAPI.getInventory();
                  if (response?.data?.inventory || Array.isArray(response?.data)) {
                    const inventoryItems = response.data.inventory || response.data || [];
                    if (inventoryItems.length > 0) {
                      console.log(`✅ JobCardFormPublic: Loaded ${inventoryItems.length} inventory items from authenticated API`);
                      setInventory(inventoryItems);
                      localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated inventory API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load inventory from public API:', error.message);
          }
        }
        
        console.log('📡 JobCardFormPublic: Loading locations...');
        
        // Always load from cache first
        const cachedLocations1 = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        const cachedLocations2 = JSON.parse(localStorage.getItem('manufacturing_locations') || '[]');
        const cachedLocations = cachedLocations1.length > 0 ? cachedLocations1 : cachedLocations2;
        
        console.log(`📋 JobCardFormPublic: Found ${cachedLocations.length} locations in cache`);
        
        if (cachedLocations.length > 0) {
          console.log('✅ JobCardFormPublic: Setting locations from cache');
          setStockLocations(cachedLocations);
        } else {
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse', status: 'active' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle', status: 'active' }
          ];
          setStockLocations(defaultLocations);
          localStorage.setItem('stock_locations', JSON.stringify(defaultLocations));
        }
        
        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            console.log('📡 JobCardFormPublic: Attempting to load locations from public API...');
            const response = await fetch('/api/public/locations', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const locations = data?.data?.locations || data?.locations || [];
              
              console.log(`✅ JobCardFormPublic: Loaded ${locations.length} locations from public API`);
              if (locations.length > 0) {
                setStockLocations(locations);
                localStorage.setItem('stock_locations', JSON.stringify(locations));
                localStorage.setItem('manufacturing_locations', JSON.stringify(locations));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public locations API returned error:', response.status);
              // Try authenticated API as fallback
              const token = window.storage?.getToken?.();
              if (token && window.DatabaseAPI?.getStockLocations) {
                try {
                  const response = await window.DatabaseAPI.getStockLocations();
                  if (response?.data?.locations || Array.isArray(response?.data)) {
                    const locations = response.data.locations || response.data || [];
                    if (locations.length > 0) {
                      console.log(`✅ JobCardFormPublic: Loaded ${locations.length} locations from authenticated API`);
                      setStockLocations(locations);
                      localStorage.setItem('stock_locations', JSON.stringify(locations));
                      localStorage.setItem('manufacturing_locations', JSON.stringify(locations));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated locations API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load locations from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading stock data:', error);
      }
    };
    loadStockData();
  }, [isOnline]);

  useEffect(() => {
    const loadSitesForClient = async () => {
      if (formData.clientId && clients.length > 0) {
        const client = clients.find(c => c.id === formData.clientId);
        if (client) {
          console.log('📡 JobCardFormPublic: Loading sites for client:', client.id);
          
          // First, try to get sites from client object
          let sites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
          
          console.log(`📋 JobCardFormPublic: Found ${sites.length} sites in client object`);
          
          // Also try to load from API if online
          if (isOnline && sites.length === 0) {
            try {
              console.log('📡 JobCardFormPublic: Attempting to load sites from API...');
              const response = await fetch(`/api/sites/client/${formData.clientId}`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                const data = await response.json();
                const apiSites = data?.data?.sites || data?.sites || [];
                if (Array.isArray(apiSites) && apiSites.length > 0) {
                  console.log(`✅ JobCardFormPublic: Loaded ${apiSites.length} sites from API`);
                  sites = apiSites;
                }
              } else {
                console.warn('⚠️ JobCardFormPublic: Sites API returned error:', response.status);
              }
            } catch (error) {
              console.warn('⚠️ JobCardFormPublic: Failed to load sites from API:', error.message);
            }
          }
          
          setAvailableSites(sites);
          setFormData(prev => ({ ...prev, clientName: client.name || '' }));
          console.log(`✅ JobCardFormPublic: Set ${sites.length} sites for client`);
        }
      } else {
        setAvailableSites([]);
        setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
      }
    };
    
    loadSitesForClient();
  }, [formData.clientId, clients, isOnline]);

  useEffect(() => {
    if (formData.siteId && availableSites.length > 0) {
      const site = availableSites.find(s => s.id === formData.siteId || s === formData.siteId);
      if (site) {
        setFormData(prev => ({ ...prev, siteName: site.name || site }));
      }
    }
  }, [formData.siteId, availableSites]);

  useEffect(() => {
    // Resize when modal opens/closes
    if (showSignatureModal) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        resizeSignatureCanvas();
      }, 100);
    }
    resizeSignatureCanvas();

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const handleResize = () => resizeSignatureCanvas();

    // Use non-passive listeners to allow preventDefault
    const options = { passive: false, capture: true };
    
    // Always add both pointer and touch events for maximum compatibility
    // Pointer events work best on modern browsers
    canvas.addEventListener('pointerdown', startSignature, options);
    canvas.addEventListener('pointermove', drawSignature, options);
    canvas.addEventListener('pointerup', endSignature, options);
    canvas.addEventListener('pointerleave', endSignature, options);
    canvas.addEventListener('pointercancel', endSignature, options);
    
    // Touch events for mobile devices (especially iOS)
    canvas.addEventListener('touchstart', startSignature, options);
    canvas.addEventListener('touchmove', drawSignature, options);
    canvas.addEventListener('touchend', endSignature, options);
    canvas.addEventListener('touchcancel', endSignature, options);
    
    // Mouse events for desktop
    canvas.addEventListener('mousedown', startSignature, options);
    canvas.addEventListener('mousemove', drawSignature, options);
    canvas.addEventListener('mouseup', endSignature, options);
    canvas.addEventListener('mouseleave', endSignature, options);
    
    // Global handlers to catch events that leave the canvas
    window.addEventListener('pointerup', endSignature, options);
    window.addEventListener('touchend', endSignature, options);
    window.addEventListener('touchcancel', endSignature, options);
    
    window.addEventListener('resize', handleResize);

    return () => {
      const removeOptions = { capture: true };
      // Remove pointer events
      canvas.removeEventListener('pointerdown', startSignature, removeOptions);
      canvas.removeEventListener('pointermove', drawSignature, removeOptions);
      canvas.removeEventListener('pointerup', endSignature, removeOptions);
      canvas.removeEventListener('pointerleave', endSignature, removeOptions);
      canvas.removeEventListener('pointercancel', endSignature, removeOptions);
      
      // Remove touch events
      canvas.removeEventListener('touchstart', startSignature, removeOptions);
      canvas.removeEventListener('touchmove', drawSignature, removeOptions);
      canvas.removeEventListener('touchend', endSignature, removeOptions);
      canvas.removeEventListener('touchcancel', endSignature, removeOptions);
      
      // Remove mouse events
      canvas.removeEventListener('mousedown', startSignature, removeOptions);
      canvas.removeEventListener('mousemove', drawSignature, removeOptions);
      canvas.removeEventListener('mouseup', endSignature, removeOptions);
      canvas.removeEventListener('mouseleave', endSignature, removeOptions);
      
      // Remove global handlers
      window.removeEventListener('pointerup', endSignature, removeOptions);
      window.removeEventListener('touchend', endSignature, removeOptions);
      window.removeEventListener('touchcancel', endSignature, removeOptions);
      
      window.removeEventListener('resize', handleResize);
    };
  }, [drawSignature, endSignature, resizeSignatureCanvas, startSignature, showSignatureModal]);

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

    // Process files sequentially to avoid race conditions
    files.forEach((file, index) => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        console.warn(`Skipping non-image file: ${file.name}`);
        return;
      }

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      if (file.size > maxSize) {
        console.warn(`File ${file.name} exceeds 10MB limit, skipping`);
        alert(`File ${file.name} is too large. Maximum size is 10MB.`);
        return;
      }

      const reader = new FileReader();
      
      reader.onloadend = () => {
        try {
          const dataUrl = reader.result;
          if (dataUrl) {
            // Update both states atomically
            setSelectedPhotos(prev => {
              const updated = [...prev, { name: file.name, url: dataUrl, size: file.size }];
              // Sync with formData
              setFormData(prevForm => ({
                ...prevForm,
                photos: updated.map(photo => typeof photo === 'string' ? photo : photo.url)
              }));
              return updated;
            });
            console.log(`✅ Photo ${file.name} loaded successfully`);
          }
        } catch (error) {
          console.error(`❌ Error processing photo ${file.name}:`, error);
          alert(`Failed to load photo: ${file.name}`);
        }
      };

      reader.onerror = (error) => {
        console.error(`❌ FileReader error for ${file.name}:`, error);
        alert(`Failed to read file: ${file.name}`);
      };

      reader.readAsDataURL(file);
    });

    // Reset input to allow selecting the same file again
    event.target.value = '';
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
    setSubmissionStatus(null);
    setSubmissionMessage('');
    setSubmittedJobCardId(null);
  };

  const handleCloseSubmissionMessage = () => {
    setSubmissionStatus(null);
    setSubmissionMessage('');
  };

  const handleCreateNew = () => {
    resetForm();
  };

  const handleSave = async () => {
    if (!formData.clientId) {
      setStepError('Please select a client before submitting.');
      setCurrentStep(0);
      return;
    }
    // Check for technician - can be agentName or leadTechnicianId
    let finalAgentName = formData.agentName;
    if (!formData.agentName && !formData.leadTechnicianId) {
      setStepError('Please select the attending technician.');
      setCurrentStep(0);
      return;
    }
    
    // If leadTechnicianId is set but agentName is not, set agentName from the technician list
    if (formData.leadTechnicianId && !formData.agentName) {
      const tech = availableTechnicians.find(t => t.id === formData.leadTechnicianId);
      if (tech) {
        finalAgentName = tech.name || tech.email;
        setFormData(prev => ({ ...prev, agentName: finalAgentName }));
      }
    }
    // Check signature - verify canvas has content (not just relying on state)
    const canvas = signatureCanvasRef.current;
    let signatureExists = hasSignature;
    if (canvas) {
      try {
        const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        const hasContent = imageData.data.some((channel, index) => {
          // Check alpha channel (every 4th byte) - if any pixel is not fully transparent, there's content
          return index % 4 === 3 && channel < 255;
        });
        if (hasContent) {
          signatureExists = true;
          setHasSignature(true); // Update state if canvas has content
        }
      } catch (e) {
        console.warn('Could not check signature canvas:', e);
      }
    }

    if (!signatureExists) {
      setStepError('Customer signature is required before submitting.');
      setCurrentStep(STEP_IDS.indexOf('signoff'));
      return;
    }

    setIsSubmitting(true);
    setStepError('');
    try {
      const jobCardData = {
        ...formData,
        agentName: finalAgentName || formData.agentName,
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

      // Always save to localStorage first
      const existingJobCards = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      
      // If updating existing job card, replace it; otherwise add new
      let updatedJobCards;
      if (submittedJobCardId && jobCardData.id === submittedJobCardId) {
        // Update existing job card
        const index = existingJobCards.findIndex(jc => jc.id === submittedJobCardId);
        if (index >= 0) {
          updatedJobCards = [...existingJobCards];
          updatedJobCards[index] = { ...jobCardData, updatedAt: new Date().toISOString() };
          console.log('✅ Job card updated in local storage');
        } else {
          updatedJobCards = [...existingJobCards, jobCardData];
          console.log('✅ Job card saved to local storage (new entry)');
        }
      } else {
        // New job card
        updatedJobCards = [...existingJobCards, jobCardData];
        console.log('✅ Job card saved to local storage');
      }
      
      localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));

      // Try to submit to public API endpoint (no authentication required)
      const isUpdate = submittedJobCardId && jobCardData.id === submittedJobCardId;
      if (isOnline) {
        try {
          console.log(`📡 ${isUpdate ? 'Updating' : 'Submitting'} job card to public API...`);
          
          // Ensure photos array is properly formatted
          const submissionData = {
            ...jobCardData,
            photos: Array.isArray(jobCardData.photos) 
              ? jobCardData.photos.filter(photo => {
                  if (!photo) return false;
                  // Handle both string URLs and object URLs
                  const photoUrl = typeof photo === 'string' ? photo : (photo.url || '');
                  return photoUrl && photoUrl.length > 0;
                })
              : []
          };

          const response = await fetch('/api/public/jobcards', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(submissionData)
          });

          if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
              const errorData = await response.json();
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (parseError) {
              // If JSON parsing fails, use status text
              console.warn('Could not parse error response:', parseError);
            }
            throw new Error(errorMessage);
          }

          const result = await response.json();
          console.log(`✅ Job card ${isUpdate ? 'updated' : 'submitted'} to API:`, result);
          
          // Try to sync client contact if function exists
          if (typeof syncClientContact === 'function') {
            try {
              await syncClientContact(jobCardData);
            } catch (contactError) {
              console.warn('⚠️ Failed to sync client contact:', contactError.message);
            }
          }
          
          // Success - show message but keep form data for editing
          setSubmissionStatus('success');
          setSubmissionMessage(isUpdate 
            ? 'Job card updated and submitted successfully!'
            : 'Job card saved and submitted successfully!');
          setSubmittedJobCardId(jobCardData.id);
        } catch (error) {
          console.error(`❌ Failed to ${isUpdate ? 'update' : 'submit'} job card to API:`, error);
          // Partial success - saved locally but API failed
          setSubmissionStatus('error');
          const errorMsg = error.message || 'Unknown error occurred';
          setSubmissionMessage(`Job card saved locally, but failed to ${isUpdate ? 'update on' : 'submit to'} server:\n${errorMsg}\n\nIt will be synced when you are online.`);
          setSubmittedJobCardId(jobCardData.id);
        }
      } else {
        // Offline - saved locally
        setSubmissionStatus('success');
        setSubmissionMessage(isUpdate 
          ? 'Job card updated offline! It will be synced when you are online.'
          : 'Job card saved offline! It will be synced when you are online.');
        setSubmittedJobCardId(jobCardData.id);
      }
    } catch (error) {
      console.error('Error saving job card:', error);
      setSubmissionStatus('error');
      setSubmissionMessage(`Failed to save job card: ${error.message}`);
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
      {renderNavigationButtons()}
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
      {renderNavigationButtons()}
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
      {renderNavigationButtons()}
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
      {renderNavigationButtons()}
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
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                id="photoUpload"
                onChange={handlePhotoUpload}
                className="hidden"
                accept="image/*"
                multiple
                capture="environment"
              />
              <label
                htmlFor="photoUpload"
                className="cursor-pointer block touch-manipulation"
              >
                <i className="fas fa-camera text-3xl sm:text-4xl text-gray-400 mb-2"></i>
                <p className="text-sm sm:text-base text-gray-600 font-medium">
                  Tap to upload photos or drag and drop
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Supports mobile camera capture • Max 10MB each
                </p>
              </label>
            </div>
            {selectedPhotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {selectedPhotos.map((photo, idx) => (
                  <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                    <img
                      src={typeof photo === 'string' ? photo : photo.url}
                      alt={`Photo ${idx + 1}`}
                      className="w-full h-24 sm:h-32 object-cover"
                      onError={(e) => {
                        console.error(`Failed to load photo ${idx + 1}`);
                        e.target.style.display = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(idx)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 hover:bg-red-600 transition touch-manipulation shadow-lg"
                      title="Remove photo"
                      aria-label={`Remove photo ${idx + 1}`}
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                    {typeof photo === 'object' && photo.name && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition">
                        {photo.name}
                      </div>
                    )}
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

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Customer Signature *
            </label>
            {/* Mobile: Button to open fullscreen signature */}
            <div className="sm:hidden mb-3">
              <button
                type="button"
                onClick={() => setShowSignatureModal(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold touch-manipulation flex items-center justify-center gap-2"
              >
                <i className="fas fa-signature"></i>
                {hasSignature ? 'Edit Signature' : 'Sign Here'}
              </button>
              {hasSignature && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <i className="fas fa-check-circle text-green-600"></i>
                  <span className="text-sm text-green-700 font-medium">Signature captured</span>
                </div>
              )}
            </div>
            {/* Desktop: Inline signature */}
            <div
              ref={signatureWrapperRef}
              className={[
                'hidden sm:block border-2 rounded-lg overflow-hidden relative bg-white signature-wrapper',
                hasSignature ? 'border-blue-500 shadow-md' : 'border-gray-300 border-dashed'
              ].join(' ')}
              style={{ 
                touchAction: 'none', 
                WebkitTouchCallout: 'none', 
                WebkitUserSelect: 'none', 
                userSelect: 'none',
                position: 'relative',
                zIndex: 1,
                WebkitTapHighlightColor: 'transparent',
                minHeight: '250px',
                height: '250px',
                width: '100%'
              }}
              onTouchStart={(e) => {
                // Only prevent default if touching the wrapper, not the canvas
                if (e.target === signatureWrapperRef.current) {
                  e.preventDefault();
                }
              }}
              onTouchMove={(e) => {
                // Only prevent default if touching the wrapper, not the canvas
                if (e.target === signatureWrapperRef.current) {
                  e.preventDefault();
                }
              }}
            >
              <canvas
                ref={signatureCanvasRef}
                className="w-full signature-canvas"
                style={{ 
                  touchAction: 'none', 
                  display: 'block',
                  pointerEvents: 'auto',
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTapHighlightColor: 'transparent',
                  cursor: 'crosshair',
                  position: 'relative',
                  zIndex: 2,
                  backgroundColor: '#ffffff',
                  WebkitAppearance: 'none',
                  appearance: 'none',
                  width: '100%',
                  height: '250px',
                  minHeight: '250px'
                }}
              />
              {!hasSignature && (
                <div 
                  className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                  style={{ zIndex: 0 }}
                >
                  <i className="fas fa-signature text-3xl text-gray-300 mb-2"></i>
                  <p className="text-sm sm:text-base text-gray-400 text-center px-4 font-medium">
                    Sign here with finger or stylus
                  </p>
                  <p className="text-xs text-gray-400 text-center px-4 mt-1">
                    Touch and drag to create your signature
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
                className="text-sm font-medium text-blue-600 hover:text-blue-800 touch-manipulation"
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
      {renderNavigationButtons()}
    </div>
  );

  const renderNavigationButtons = () => (
    <div className="mt-6 pt-6 border-t border-gray-200 bg-white rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="text-[10px] sm:text-xs text-gray-500 text-center sm:text-left">
          Step {currentStep + 1} of {STEP_IDS.length}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStep === 0 || isSubmitting}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold touch-manipulation"
          >
            Back
          </button>

          {currentStep < STEP_IDS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold shadow-sm touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              onClick={(event) => { event.preventDefault(); handleSave(); }}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold shadow-sm touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting 
                ? 'Saving...' 
                : submittedJobCardId 
                  ? 'Update Job Card' 
                  : 'Submit Job Card'}
            </button>
          )}
        </div>
      </div>
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

        {/* Footer removed - navigation buttons are now inline at end of each step */}
      </div>

      {/* Map Selection Modal - Fullscreen on Mobile */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 sm:p-4">
          <div className="bg-white shadow-xl w-full h-full sm:rounded-xl sm:w-full sm:max-w-4xl sm:h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <h3 className="text-lg font-semibold text-gray-900">Select Location on Map</h3>
              <button
                type="button"
                onClick={handleCloseMap}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 touch-manipulation"
                aria-label="Close map"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div
                ref={mapContainerRef}
                className="w-full h-full map-container"
                style={{ minHeight: '400px', height: '100%' }}
              ></div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-1">Selected Location:</p>
                  <p className="text-sm font-medium text-gray-900 break-words">{formData.location || 'Click on the map to select a location'}</p>
                  {formData.latitude && formData.longitude && (
                    <p className="text-xs text-gray-500 mt-1">
                      Coordinates: {formData.latitude}, {formData.longitude}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCloseMap}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold touch-manipulation whitespace-nowrap"
                >
                  Use This Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Modal - Fullscreen on Mobile */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white sm:bg-black sm:bg-opacity-50 sm:items-center sm:justify-center sm:p-4">
          <div className="bg-white shadow-xl w-full h-full sm:rounded-xl sm:w-full sm:max-w-2xl sm:h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Customer Signature</h3>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 touch-manipulation"
                aria-label="Close signature"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="flex-1 flex flex-col p-4 min-h-0 overflow-hidden">
              <div
                ref={signatureWrapperRef}
                className={[
                  'flex-1 border-2 rounded-lg overflow-hidden relative bg-white signature-wrapper',
                  hasSignature ? 'border-blue-500 shadow-md' : 'border-gray-300 border-dashed'
                ].join(' ')}
                style={{ 
                  touchAction: 'none', 
                  WebkitTouchCallout: 'none', 
                  WebkitUserSelect: 'none', 
                  userSelect: 'none',
                  position: 'relative',
                  zIndex: 1,
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: '300px',
                  width: '100%'
                }}
              >
                <canvas
                  ref={signatureCanvasRef}
                  className="w-full h-full signature-canvas"
                  style={{ 
                    touchAction: 'none', 
                    display: 'block',
                    pointerEvents: 'auto',
                    WebkitTouchCallout: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTapHighlightColor: 'transparent',
                    cursor: 'crosshair',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 2,
                    backgroundColor: '#ffffff',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    width: '100%',
                    height: '100%'
                  }}
                />
                {!hasSignature && (
                  <div 
                    className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                    style={{ zIndex: 0 }}
                  >
                    <i className="fas fa-signature text-4xl text-gray-300 mb-3"></i>
                    <p className="text-base text-gray-400 text-center px-4 font-medium">
                      Sign here with finger or stylus
                    </p>
                    <p className="text-sm text-gray-400 text-center px-4 mt-2">
                      Touch and drag to create your signature
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={clearSignature}
                  className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium touch-manipulation"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (hasSignature) {
                      setShowSignatureModal(false);
                    } else {
                      alert('Please provide a signature before closing.');
                    }
                  }}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold touch-manipulation"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submission Status Modal */}
      {submissionStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className={`p-6 border-b ${submissionStatus === 'success' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                  submissionStatus === 'success' ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  <i className={`fas ${
                    submissionStatus === 'success' ? 'fa-check-circle text-green-600' : 'fa-exclamation-circle text-red-600'
                  } text-2xl`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-lg font-semibold mb-1 ${
                    submissionStatus === 'success' ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {submissionStatus === 'success' ? 'Success!' : 'Submission Issue'}
                  </h3>
                  <p className={`text-sm whitespace-pre-line ${
                    submissionStatus === 'success' ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {submissionMessage}
                  </p>
                  {submittedJobCardId && (
                    <p className="text-xs text-gray-500 mt-2">
                      Job Card ID: {submittedJobCardId}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCloseSubmissionMessage}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-white/50"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>
            </div>
            <div className="p-6 bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleCloseSubmissionMessage}
                  className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition touch-manipulation"
                >
                  Continue Editing
                </button>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold transition touch-manipulation"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Create New
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


