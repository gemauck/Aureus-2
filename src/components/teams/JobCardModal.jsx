// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const JobCardModal = ({ isOpen, onClose, jobCard, onSave, clients }) => {
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
                otherComments: jobCard.otherComments || '',
                photos: jobCard.photos || [],
                status: jobCard.status || 'draft'
            });
            setSelectedPhotos(jobCard.photos || []);
        } else {
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
            const jobCardData = {
                ...formData,
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
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
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
                                required
                                disabled={!formData.clientId || availableSites.length === 0}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                                <option value="">
                                    {availableSites.length === 0 ? 'No sites available' : 'Select site'}
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

