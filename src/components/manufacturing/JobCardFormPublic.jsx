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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [deviceInfo, setDeviceInfo] = useState('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  const signatureCanvasRef = useRef(null);
  const signatureContainerRef = useRef(null);
  const touchScrollRef = useRef({
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    isTouching: false,
    lastTouchY: 0,
    lastTouchX: 0,
    lastScrollTop: 0
  });
  const signatureObserverRef = useRef(null);
  const canvasResizeObserverRef = useRef(null);
  const mapContainerRef = useRef(null);
  const leafletMapRef = useRef(null);
  const leafletMarkerRef = useRef(null);

  // Load stored draft and environment data
  useEffect(() => {
    try {
      const savedDraft = JSON.parse(localStorage.getItem('jobCardFormDraft') || '{}');
      if (savedDraft && Object.keys(savedDraft).length > 0) {
        setFormData(prev => ({
          ...prev,
          ...savedDraft,
          stockUsed: Array.isArray(savedDraft.stockUsed) ? savedDraft.stockUsed : prev.stockUsed,
          materialsBought: Array.isArray(savedDraft.materialsBought) ? savedDraft.materialsBought : prev.materialsBought,
          photos: Array.isArray(savedDraft.photos) ? savedDraft.photos : prev.photos
        }));
        if (Array.isArray(savedDraft.photos) && savedDraft.photos.length > 0) {
          setSelectedPhotos(savedDraft.photos.map(url => ({ url })));
        }
      }

      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      setDeviceInfo(ua);
    } catch (err) {
      console.error('Error loading saved draft:', err);
    }
  }, []);

  // Watch online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load clients, sites, and stock from DatabaseAPI when available
  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (window.DatabaseAPI && typeof window.DatabaseAPI.getJobCardFormData === 'function') {
          const result = await window.DatabaseAPI.getJobCardFormData();
          if (cancelled) return;

          const { clients, stockItems } = result || {};

          const clientList = Array.isArray(clients) ? clients.filter(c => c.type === 'client') : [];
          const websites = clientList.flatMap(client =>
            Array.isArray(client.sites) ? client.sites.map(site => ({ ...site, clientId: client.id, clientName: client.name })) : []
          );

          setAvailableSites(websites);

          setFormData(prev => ({
            ...prev,
            clients: clientList,
            stockItems: Array.isArray(stockItems) ? stockItems : []
          }));
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading job card form data:', err);
          setError('Could not load latest clients and stock. You can still submit a job card and it will sync when online.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Persist draft to localStorage
  useEffect(() => {
    try {
      const draftToSave = {
        ...formData,
        photos: formData.photos
      };
      localStorage.setItem('jobCardFormDraft', JSON.stringify(draftToSave));
    } catch (err) {
      console.error('Error saving draft:', err);
    }
  }, [formData]);

  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleChange = useCallback((event) => {
    const { name, value } = event.target;
    handleInputChange(name, value);
  }, [handleInputChange]);

  const handleClientChange = useCallback((event) => {
    const clientId = event.target.value;
    const clients = Array.isArray(formData.clients) ? formData.clients : [];
    const selectedClient = clients.find(client => client.id === clientId);

    setFormData(prev => ({
      ...prev,
      clientId,
      clientName: selectedClient ? selectedClient.name : '',
      siteId: '',
      siteName: ''
    }));
  }, [formData.clients]);

  const handleSiteChange = useCallback((event) => {
    const siteId = event.target.value;
    const selectedSite = availableSites.find(site => site.id === siteId);

    setFormData(prev => ({
      ...prev,
      siteId,
      siteName: selectedSite ? selectedSite.name : '',
      location: selectedSite ? selectedSite.address || selectedSite.name : prev.location
    }));
  }, [availableSites]);

  const handleAddTechnician = useCallback(() => {
    if (!technicianInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      otherTechnicians: [...prev.otherTechnicians, technicianInput.trim()]
    }));
    setTechnicianInput('');
  }, [technicianInput]);

  const handleRemoveTechnician = useCallback((tech) => {
    setFormData(prev => ({
      ...prev,
      otherTechnicians: prev.otherTechnicians.filter(t => t !== tech)
    }));
  }, []);

  const handlePhotoUpload = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const maxFiles = 10;
    const remainingSlots = maxFiles - selectedPhotos.length;
    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        setSelectedPhotos(prev => [...prev, { name: file.name, url: dataUrl, size: file.size }]);
        setFormData(prev => ({
          ...prev,
          photos: [...(prev.photos || []), dataUrl]
        }));
      };
      reader.readAsDataURL(file);
    });
  }, [selectedPhotos.length]);

  const handleRemovePhoto = useCallback((index) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== index));
    setFormData(prev => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
  }, []);

  const handleAddStockItem = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      stockUsed: [...(prev.stockUsed || []), { itemId: '', description: '', quantity: 1 }]
    }));
  }, []);

  const handleUpdateStockItem = useCallback((index, field, value) => {
    setFormData(prev => {
      const stockUsed = [...(prev.stockUsed || [])];
      stockUsed[index] = {
        ...(stockUsed[index] || {}),
        [field]: value
      };
      return { ...prev, stockUsed };
    });
  }, []);

  const handleRemoveStockItem = useCallback((index) => {
    setFormData(prev => ({
      ...prev,
      stockUsed: (prev.stockUsed || []).filter((_, i) => i !== index)
    }));
  }, []);

  const handleAddMaterial = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      materialsBought: [...(prev.materialsBought || []), { description: '', quantity: 1, cost: '' }]
    }));
  }, []);

  const handleUpdateMaterial = useCallback((index, field, value) => {
    setFormData(prev => {
      const materialsBought = [...(prev.materialsBought || [])];
      materialsBought[index] = {
        ...(materialsBought[index] || {}),
        [field]: value
      };
      return { ...prev, materialsBought };
    });
  }, []);

  const handleRemoveMaterial = useCallback((index) => {
    setFormData(prev => ({
      ...prev,
      materialsBought: (prev.materialsBought || []).filter((_, i) => i !== index)
    }));
  }, []);

  const handleSignatureStart = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    const isTouchEvent = event.type === 'touchstart';
    const point = isTouchEvent ? event.touches[0] : event;

    touchScrollRef.current.isDrawing = true;
    touchScrollRef.current.lastX = point.clientX - rect.left;
    touchScrollRef.current.lastY = point.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(touchScrollRef.current.lastX, touchScrollRef.current.lastY);

    if (isTouchEvent) {
      event.preventDefault();
    }
  }, []);

  const handleSignatureMove = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas || !touchScrollRef.current.isDrawing) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isTouchEvent = event.type === 'touchmove';
    const point = isTouchEvent ? event.touches[0] : event;

    const x = point.clientX - rect.left;
    const y = point.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();

    touchScrollRef.current.lastX = x;
    touchScrollRef.current.lastY = y;

    if (isTouchEvent) {
      event.preventDefault();
    }
  }, []);

  const handleSignatureEnd = useCallback(() => {
    touchScrollRef.current.isDrawing = false;

    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    let hasInk = false;

    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3];
      if (alpha !== 0) {
        hasInk = true;
        break;
      }
    }

    if (hasInk) {
      const dataUrl = canvas.toDataURL('image/png');
      setFormData(prev => ({
        ...prev,
        customerSignature: dataUrl
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        customerSignature: ''
      }));
    }
  }, []);

  const handleClearSignature = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFormData(prev => ({
      ...prev,
      customerSignature: ''
    }));
  }, []);

  const initialiseSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    const container = signatureContainerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const width = rect.width;
      const height = 160;

      const ratio = window.devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const context = canvas.getContext('2d');
      if (context) {
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
    };

    resizeCanvas();

    if (canvasResizeObserverRef.current) {
      canvasResizeObserverRef.current.disconnect();
    }

    canvasResizeObserverRef.current = new ResizeObserver(() => {
      resizeCanvas();
    });

    canvasResizeObserverRef.current.observe(container);
  }, []);

  useEffect(() => {
    initialiseSignatureCanvas();

    signatureObserverRef.current = new MutationObserver(() => {
      initialiseSignatureCanvas();
    });

    if (signatureContainerRef.current) {
      signatureObserverRef.current.observe(signatureContainerRef.current, {
        childList: true,
        subtree: true
      });
    }

    return () => {
      if (signatureObserverRef.current) {
        signatureObserverRef.current.disconnect();
      }
      if (canvasResizeObserverRef.current) {
        canvasResizeObserverRef.current.disconnect();
      }
    };
  }, [initialiseSignatureCanvas]);

  const loadLeafletScript = useCallback(() => {
    return new Promise((resolve, reject) => {
      const existingScript = document.getElementById('leaflet-js');
      if (existingScript) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = (error) => reject(error);
      document.body.appendChild(script);

      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    });
  }, []);

  const initialiseMap = useCallback(async () => {
    if (!mapContainerRef.current || leafletMapRef.current || typeof window === 'undefined') {
      return;
    }

    try {
      await loadLeafletScript();

      const L = window.L;
      if (!L) {
        console.error('Leaflet not available');
        return;
      }

      const map = L.map(mapContainerRef.current).setView([-26.2041, 28.0473], 13);
      leafletMapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const updateMarker = (lat, lng) => {
        if (leafletMarkerRef.current) {
          leafletMarkerRef.current.setLatLng([lat, lng]);
        } else {
          leafletMarkerRef.current = L.marker([lat, lng]).addTo(map);
        }
      };

      map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        updateMarker(lat, lng);
        setFormData(prev => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        }));
      });

      if (formData.latitude && formData.longitude) {
        const lat = parseFloat(formData.latitude);
        const lng = parseFloat(formData.longitude);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
          map.setView([lat, lng], 15);
          updateMarker(lat, lng);
        }
      } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 15);
            updateMarker(latitude, longitude);
          },
          (error) => {
            console.error('Error getting geolocation:', error);
          }
        );
      }

      setIsMapLoaded(true);
    } catch (error) {
      console.error('Error initialising map:', error);
    }
  }, [formData.latitude, formData.longitude, loadLeafletScript]);

  const openMapModal = useCallback(() => {
    setShowMapModal(true);
  }, []);

  const handleCloseMap = useCallback(() => {
    setShowMapModal(false);
  }, []);

  useEffect(() => {
    if (showMapModal && !isMapLoaded) {
      initialiseMap();
    }
  }, [showMapModal, isMapLoaded, initialiseMap]);

  const currentStepId = STEP_IDS[currentStep];

  const progressPercent = useMemo(() => {
    const completedSteps = currentStep;
    return ((completedSteps + 1) / STEP_IDS.length) * 100;
  }, [currentStep]);

  const validateCurrentStep = useCallback(() => {
    const stepId = STEP_IDS[currentStep];

    if (stepId === 'assignment') {
      if (!formData.agentName.trim()) {
        setStepError('Please enter the lead technician\'s name.');
        return false;
      }
      if (!formData.clientId) {
        setStepError('Please select a client.');
        return false;
      }
      if (!formData.siteId) {
        setStepError('Please select a site.');
        return false;
      }
      setStepError('');
      return true;
    }

    if (stepId === 'visit') {
      if (!formData.timeOfDeparture || !formData.timeOfArrival) {
        setStepError('Please capture both departure and arrival times.');
        return false;
      }
      if (!formData.vehicleUsed.trim()) {
        setStepError('Please enter the vehicle used.');
        return false;
      }
      if (!formData.kmReadingBefore || !formData.kmReadingAfter) {
        setStepError('Please capture kilometer readings before and after the trip.');
        return false;
      }
      setStepError('');
      return true;
    }

    if (stepId === 'work') {
      if (!formData.reasonForVisit.trim()) {
        setStepError('Please enter the reason for the call out / visit.');
        return false;
      }
      setStepError('');
      return true;
    }

    if (stepId === 'signoff') {
      if (!formData.customerName.trim()) {
        setStepError('Please capture the customer\'s name.');
        return false;
      }
      if (!formData.customerSignature) {
        setStepError('Please capture the customer\'s signature.');
        return false;
      }
      setStepError('');
      return true;
    }

    setStepError('');
    return true;
  }, [currentStep, formData]);

  const handleNext = useCallback(() => {
    if (!validateCurrentStep()) {
      return;
    }

    setCurrentStep(prev => Math.min(prev + 1, STEP_IDS.length - 1));
  }, [validateCurrentStep]);

  const handlePrevious = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const calculateTravelDistance = useMemo(() => {
    const before = parseFloat(formData.kmReadingBefore || '0');
    const after = parseFloat(formData.kmReadingAfter || '0');
    if (Number.isNaN(before) || Number.isNaN(after)) return 0;
    return Math.max(0, after - before);
  }, [formData.kmReadingBefore, formData.kmReadingAfter]);

  const handleSave = useCallback(async () => {
    if (!validateCurrentStep()) {
      return;
    }

    try {
      setIsSubmitting(true);
      setSaveStatus('');

      const payload = {
        ...formData,
        travelDistance: calculateTravelDistance,
        deviceInfo,
        isOnline
      };

      if (window.DatabaseAPI && typeof window.DatabaseAPI.submitJobCard === 'function') {
        await window.DatabaseAPI.submitJobCard(payload);
        setSaveStatus('Job card saved and will sync to Abcotronics when online.');
      } else {
        setSaveStatus('Job card saved locally. It will sync when the app is online and connected.');
      }

      localStorage.removeItem('jobCardFormDraft');

      setFormData(prev => ({
        ...prev,
        status: 'submitted'
      }));
    } catch (error) {
      console.error('Error saving job card:', error);
      setSaveStatus('There was an error saving the job card. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [calculateTravelDistance, deviceInfo, formData, isOnline, validateCurrentStep]);

  const renderAssignmentStep = () => {
    const clients = Array.isArray(formData.clients) ? formData.clients : [];

    const clientOptions = clients.filter(c => c.type === 'client');

    const sites = availableSites.filter(site => site.clientId === formData.clientId);

    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Lead Technician *
          </label>
          <input
            type="text"
            name="agentName"
            value={formData.agentName}
            onChange={handleChange}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Name of agent filling out this form"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Other Technicians
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={technicianInput}
              onChange={(e) => setTechnicianInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTechnician())}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Add technician name"
            />
            <button
              type="button"
              onClick={handleAddTechnician}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
            >
              <i className="fas fa-plus"></i>
            </button>
          </div>
