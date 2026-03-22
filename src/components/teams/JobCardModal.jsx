// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const parseJsonArrayField = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
};

const JobCardModal = ({ isOpen, onClose, jobCard, onSave, clients }) => {
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
    const [saving, setSaving] = useState(false);

    // Get current user name for auto-population
    useEffect(() => {
        const userInfo = window.storage?.getUserInfo();
        if (userInfo && !jobCard) {
            setFormData(prev => ({ ...prev, agentName: userInfo.name || '' }));
        }
    }, []);

    useEffect(() => {
        if (jobCard) {
            const photos = parseJsonArrayField(jobCard.photos);
            setFormData({
                agentName: jobCard.agentName || '',
                otherTechnicians: parseJsonArrayField(jobCard.otherTechnicians),
                clientId: jobCard.clientId || '',
                clientName: jobCard.clientName || '',
                siteId: jobCard.siteId || '',
                siteName: jobCard.siteName || '',
                location: jobCard.location || '',
                locationLatitude: jobCard.locationLatitude != null ? String(jobCard.locationLatitude) : '',
                locationLongitude: jobCard.locationLongitude != null ? String(jobCard.locationLongitude) : '',
                timeOfDeparture: jobCard.timeOfDeparture ? jobCard.timeOfDeparture.substring(0, 16) : '',
                timeOfArrival: jobCard.timeOfArrival ? jobCard.timeOfArrival.substring(0, 16) : '',
                vehicleUsed: jobCard.vehicleUsed || '',
                kmReadingBefore: jobCard.kmReadingBefore ?? '',
                kmReadingAfter: jobCard.kmReadingAfter ?? '',
                reasonForVisit: jobCard.reasonForVisit || '',
                diagnosis: jobCard.diagnosis || '',
                actionsTaken: jobCard.actionsTaken || '',
                stockUsed: parseJsonArrayField(jobCard.stockUsed),
                materialsBought: parseJsonArrayField(jobCard.materialsBought),
                otherComments: jobCard.otherComments || '',
                photos: photos.length ? photos : (jobCard.photos || []),
                status: jobCard.status || 'draft'
            });
            setSelectedPhotos(
                photos.length
                    ? photos.map((p, i) => (typeof p === 'string' ? { name: `Photo ${i + 1}`, url: p } : p))
                    : (jobCard.photos || [])
            );
        } else {
            setFormData({
                agentName: '',
                otherTechnicians: [],
                clientId: '',
                clientName: '',
                siteId: '',
                siteName: '',
                location: '',
                locationLatitude: '',
                locationLongitude: '',
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
        }
    }, [jobCard]);

    // Load sites when client changes
    useEffect(() => {
        if (formData.clientId && clients) {
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
    }, [formData.clientId]);

    // Set site name when site changes
    useEffect(() => {
        if (formData.siteId && availableSites.length > 0) {
            const site = availableSites.find(s => s.id === formData.siteId);
            if (site) {
                setFormData(prev => ({ ...prev, siteName: site.name || '' }));
            }
        }
    }, [formData.siteId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddTechnician = () => {
        if (technicianInput.trim() && !formData.otherTechnicians.includes(technicianInput.trim())) {
            setFormData(prev => ({
                ...prev,
                otherTechnicians: [...prev.otherTechnicians, technicianInput.trim()]
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

    const addMaterialRow = () => {
        setFormData(prev => ({
            ...prev,
            materialsBought: [...(prev.materialsBought || []), { itemName: '', description: '', reason: '', cost: '' }]
        }));
    };

    const updateMaterialRow = (index, patch) => {
        setFormData(prev => ({
            ...prev,
            materialsBought: (prev.materialsBought || []).map((m, i) => (i === index ? { ...m, ...patch } : m))
        }));
    };

    const removeMaterialRow = (index) => {
        setFormData(prev => ({
            ...prev,
            materialsBought: (prev.materialsBought || []).filter((_, i) => i !== index)
        }));
    };

    const addStockRow = () => {
        setFormData(prev => ({
            ...prev,
            stockUsed: [...(prev.stockUsed || []), { sku: '', quantity: '', locationId: '', itemName: '', unitCost: '' }]
        }));
    };

    const updateStockRow = (index, patch) => {
        setFormData(prev => ({
            ...prev,
            stockUsed: (prev.stockUsed || []).map((s, i) => (i === index ? { ...s, ...patch } : s))
        }));
    };

    const removeStockRow = (index) => {
        setFormData(prev => ({
            ...prev,
            stockUsed: (prev.stockUsed || []).filter((_, i) => i !== index)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // If marking as completed, ensure all attached service forms are completed
        if (jobCard && formData.status === 'completed') {
            try {
                const token = window.storage?.getToken?.();
                if (token && jobCard.id) {
                    const res = await fetch(`/api/jobcards/${encodeURIComponent(jobCard.id)}/forms`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const forms = Array.isArray(data.forms) ? data.forms : [];
                        const incomplete = forms.filter(
                            (f) => (f.status || '').toString().toLowerCase() !== 'completed'
                        );
                        if (forms.length > 0 && incomplete.length > 0) {
                            alert(
                                'This job card still has service forms/checklists that are not completed. Please complete all attached forms before marking the job as completed.'
                            );
                            return;
                        }
                    }
                }
            } catch (error) {
                console.warn('JobCardModal: Failed to verify service forms before completion', error);
                // If verification fails, allow completion to avoid blocking users unexpectedly
            }
        }

        try {
            setSaving(true);

            const materialsBought = (formData.materialsBought || [])
                .filter(
                    m =>
                        (m.itemName && String(m.itemName).trim()) ||
                        (m.cost !== '' && m.cost != null && !Number.isNaN(parseFloat(m.cost)))
                )
                .map(m => ({
                    itemName: String(m.itemName || '').trim(),
                    description: String(m.description || '').trim(),
                    reason: String(m.reason || '').trim(),
                    cost: parseFloat(m.cost) || 0
                }));

            const stockUsed = (formData.stockUsed || [])
                .filter(s => String(s.sku || '').trim() && parseFloat(s.quantity) > 0)
                .map(s => {
                    const row = {
                        sku: String(s.sku || '').trim(),
                        quantity: parseFloat(s.quantity) || 0,
                        locationId: String(s.locationId || '').trim(),
                        itemName: String(s.itemName || '').trim()
                    };
                    if (s.unitCost !== '' && s.unitCost != null && !Number.isNaN(parseFloat(s.unitCost))) {
                        row.unitCost = parseFloat(s.unitCost);
                    }
                    return row;
                });

            const totalMaterialsCost = materialsBought.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0);

            const jobCardData = {
                ...formData,
                materialsBought,
                stockUsed,
                totalMaterialsCost,
                locationLatitude: formData.locationLatitude != null ? String(formData.locationLatitude) : '',
                locationLongitude: formData.locationLongitude != null ? String(formData.locationLongitude) : '',
                photos: selectedPhotos.map(p => (typeof p === 'string' ? p : p.url)),
                id: jobCard?.id || Date.now().toString(),
                createdAt: jobCard?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await onSave(jobCardData);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="modal-panel bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between dark:bg-slate-800 dark:border-slate-700">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                            {jobCard ? 'Edit Job Card' : 'New Job Card'}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-slate-400">Technical Team</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition dark:text-slate-400 dark:hover:text-slate-200"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Agent Name - Auto-populated */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Agent Name *
                        </label>
                        <input
                            type="text"
                            name="agentName"
                            value={formData.agentName}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Name of agent filling out this form"
                        />
                    </div>

                    {/* Other Technicians */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Other Technicians
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={technicianInput}
                                onChange={(e) => setTechnicianInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTechnician())}
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="Add technician name"
                            />
                            <button
                                type="button"
                                onClick={handleAddTechnician}
                                className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                        {formData.otherTechnicians.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.otherTechnicians.map((technician, idx) => (
                                    <span key={idx} className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs dark:bg-blue-900 dark:text-blue-300">
                                        {technician}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTechnician(technician)}
                                            className="hover:text-blue-900 dark:hover:text-blue-100"
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Client and Site */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Client *
                            </label>
                            <select
                                name="clientId"
                                value={formData.clientId}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            >
                                <option value="">Select client</option>
                                {clients && clients.filter(c => c.type === 'client').map(client => (
                                    <option key={client.id} value={client.id}>{client.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Site *
                            </label>
                            <select
                                name="siteId"
                                value={formData.siteId}
                                onChange={handleChange}
                                disabled={!formData.clientId || availableSites.length === 0}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                                <option value="">
                                    {availableSites.length === 0 ? 'No sites available' : 'Select site (optional)'}
                                </option>
                                {availableSites.map(site => (
                                    <option key={site.id} value={site.id}>{site.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Location */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Location
                        </label>
                        <input
                            type="text"
                            name="location"
                            value={formData.location}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Specific location details"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Latitude (GPS)
                            </label>
                            <input
                                type="text"
                                name="locationLatitude"
                                value={formData.locationLatitude}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="-26.2041"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Longitude (GPS)
                            </label>
                            <input
                                type="text"
                                name="locationLongitude"
                                value={formData.locationLongitude}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="28.0473"
                            />
                        </div>
                    </div>

                    {/* Time of Departure and Arrival */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Time of Departure
                            </label>
                            <input
                                type="datetime-local"
                                name="timeOfDeparture"
                                value={formData.timeOfDeparture}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Time of Arrival
                            </label>
                            <input
                                type="datetime-local"
                                name="timeOfArrival"
                                value={formData.timeOfArrival}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                    </div>

                    {/* Vehicle and Kilometer Readings */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Vehicle Used
                            </label>
                            <input
                                type="text"
                                name="vehicleUsed"
                                value={formData.vehicleUsed}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="e.g., AB12 CD 3456"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                KM Reading Before
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                name="kmReadingBefore"
                                value={formData.kmReadingBefore}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="0.0"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                                KM Reading After
                            </label>
                            <input
                                type="number"
                                step="0.1"
                                name="kmReadingAfter"
                                value={formData.kmReadingAfter}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="0.0"
                            />
                        </div>
                    </div>

                    {/* Travel Kilometers Display */}
                    {formData.kmReadingBefore && formData.kmReadingAfter && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 dark:bg-blue-900 dark:border-blue-700">
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                Travel Distance: {parseFloat(formData.kmReadingAfter || 0) - parseFloat(formData.kmReadingBefore || 0)} km
                            </p>
                        </div>
                    )}

                    {/* Reason for Visit */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Reason for Call Out / Visit *
                        </label>
                        <textarea
                            name="reasonForVisit"
                            value={formData.reasonForVisit}
                            onChange={handleChange}
                            required
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Why was the agent requested to come out?"
                        />
                    </div>

                    {/* Diagnosis */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Diagnosis
                        </label>
                        <textarea
                            name="diagnosis"
                            value={formData.diagnosis}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Notes and comments about diagnosis"
                        />
                    </div>

                    {/* Actions taken */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Actions taken
                        </label>
                        <textarea
                            name="actionsTaken"
                            value={formData.actionsTaken}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Work performed, repairs, replacements, tests…"
                        />
                    </div>

                    {/* Stock used */}
                    <div className="border border-gray-200 rounded-lg p-3 dark:border-slate-600">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Stock used</label>
                            <button
                                type="button"
                                onClick={addStockRow}
                                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                            >
                                <i className="fas fa-plus mr-1" /> Add line
                            </button>
                        </div>
                        {(formData.stockUsed || []).length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-slate-400">No stock lines. Add consumables used on site.</p>
                        ) : (
                            <div className="space-y-2">
                                {(formData.stockUsed || []).map((row, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                        <div className="col-span-3">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">SKU</span>
                                            <input
                                                type="text"
                                                value={row.sku || ''}
                                                onChange={e => updateStockRow(idx, { sku: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Qty</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={row.quantity ?? ''}
                                                onChange={e => updateStockRow(idx, { quantity: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Location ID</span>
                                            <input
                                                type="text"
                                                value={row.locationId || ''}
                                                onChange={e => updateStockRow(idx, { locationId: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-3">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Item name</span>
                                            <input
                                                type="text"
                                                value={row.itemName || ''}
                                                onChange={e => updateStockRow(idx, { itemName: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-end pb-1">
                                            <button
                                                type="button"
                                                onClick={() => removeStockRow(idx)}
                                                className="text-red-500 hover:text-red-700 text-xs"
                                                title="Remove"
                                            >
                                                <i className="fas fa-times" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Materials bought */}
                    <div className="border border-gray-200 rounded-lg p-3 dark:border-slate-600">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-medium text-gray-700 dark:text-slate-300">Materials / purchases</label>
                            <button
                                type="button"
                                onClick={addMaterialRow}
                                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200"
                            >
                                <i className="fas fa-plus mr-1" /> Add line
                            </button>
                        </div>
                        {(formData.materialsBought || []).length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-slate-400">No purchase lines.</p>
                        ) : (
                            <div className="space-y-2">
                                {(formData.materialsBought || []).map((row, idx) => (
                                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                                        <div className="col-span-4">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Item</span>
                                            <input
                                                type="text"
                                                value={row.itemName || ''}
                                                onChange={e => updateMaterialRow(idx, { itemName: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Cost</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={row.cost ?? ''}
                                                onChange={e => updateMaterialRow(idx, { cost: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-5">
                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">Reason / notes</span>
                                            <input
                                                type="text"
                                                value={row.reason || ''}
                                                onChange={e => updateMaterialRow(idx, { reason: e.target.value })}
                                                className="w-full px-2 py-1 text-xs border rounded dark:bg-slate-700 dark:border-slate-600"
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-end pb-1">
                                            <button
                                                type="button"
                                                onClick={() => removeMaterialRow(idx)}
                                                className="text-red-500 hover:text-red-700 text-xs"
                                                title="Remove"
                                            >
                                                <i className="fas fa-times" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Other Comments */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Other Comments
                        </label>
                        <textarea
                            name="otherComments"
                            value={formData.otherComments}
                            onChange={handleChange}
                            rows={2}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            placeholder="Additional comments or observations"
                        />
                    </div>

                    {/* Photo Upload */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Photos
                        </label>
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center dark:border-slate-600">
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
                                <i className="fas fa-camera text-3xl text-gray-400 mb-2 dark:text-slate-400"></i>
                                <p className="text-sm text-gray-600 dark:text-slate-300">
                                    Click to upload photos or drag and drop
                                </p>
                                <p className="text-xs text-gray-500 dark:text-slate-400">
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
                        <label className="block text-xs font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Status
                        </label>
                        <select
                            name="status"
                            value={formData.status}
                            onChange={handleChange}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                        >
                            <option value="draft">Draft</option>
                            <option value="submitted">Submitted</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-gray-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {saving ? 'Saving…' : jobCard ? 'Update Job Card' : 'Create Job Card'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.JobCardModal = JobCardModal;

