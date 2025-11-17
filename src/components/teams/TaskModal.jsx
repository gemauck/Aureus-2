// Get dependencies from window
const { useState, useEffect } = React;

const TaskModal = ({ isOpen, onClose, team, task, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        status: 'todo',
        priority: 'Medium',
        assigneeId: '',
        dueDate: '',
        tags: [],
        location: '',
        address: '',
        latitude: '',
        longitude: '',
        photos: []
    });
    const [tagInput, setTagInput] = useState('');
    const [employees, setEmployees] = useState([]);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [isGoogleCalendarAuthenticated, setIsGoogleCalendarAuthenticated] = useState(false);
    const [isSyncingToGoogle, setIsSyncingToGoogle] = useState(false);
    const [googleEventId, setGoogleEventId] = useState(null);
    const [googleEventUrl, setGoogleEventUrl] = useState(null);
    const [selectedPhotos, setSelectedPhotos] = useState([]);

    useEffect(() => {
        if (task) {
            setFormData({
                title: task.title || '',
                description: task.description || '',
                status: task.status || 'todo',
                priority: task.priority || 'Medium',
                assigneeId: task.assigneeId || '',
                dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
                tags: Array.isArray(task.tags) ? task.tags : (typeof task.tags === 'string' ? JSON.parse(task.tags || '[]') : []),
                location: task.location || '',
                address: task.address || '',
                latitude: task.latitude || '',
                longitude: task.longitude || '',
                photos: Array.isArray(task.photos) ? task.photos : (typeof task.photos === 'string' ? JSON.parse(task.photos || '[]') : [])
            });
            setSelectedPhotos(Array.isArray(task.photos) ? task.photos : (typeof task.photos === 'string' ? JSON.parse(task.photos || '[]') : []));
            setGoogleEventId(task.googleEventId || null);
            setGoogleEventUrl(task.googleEventUrl || null);
        } else {
            setFormData({
                title: '',
                description: '',
                status: 'todo',
                priority: 'Medium',
                assigneeId: '',
                dueDate: '',
                tags: [],
                location: '',
                address: '',
                latitude: '',
                longitude: '',
                photos: []
            });
            setSelectedPhotos([]);
            setGoogleEventId(null);
            setGoogleEventUrl(null);
        }
    }, [task, isOpen]);

    // Check Google Calendar auth once
    useEffect(() => {
        const checkAuth = async () => {
            try {
                if (window.GoogleCalendarService) {
                    const authed = await window.GoogleCalendarService.checkAuthentication();
                    setIsGoogleCalendarAuthenticated(authed);
                }
            } catch (e) {
                console.warn('Google Calendar auth check failed:', e?.message || e);
            }
        };
        if (isOpen) checkAuth();
    }, [isOpen]);

    // Leaflet is already loaded globally, no need to load Google Maps

    // Load employees when modal opens
    useEffect(() => {
        if (isOpen) {
            loadEmployees();
        }
    }, [isOpen]);

    const loadEmployees = async () => {
        try {
            setLoadingEmployees(true);
            const token = window.storage?.getToken?.();
            if (!token) {
                console.error('❌ No token available');
                setEmployees([]);
                setLoadingEmployees(false);
                return;
            }

            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const responseData = await response.json();
                const userData = responseData.data?.users || responseData.users || [];
                console.log('✅ Loaded employees for TaskModal:', userData.length);
                setEmployees(userData);
            } else {
                console.error('❌ Failed to load users:', response);
                setEmployees([]);
            }
        } catch (error) {
            console.error('❌ TaskModal: Error loading employees:', error);
            setEmployees([]);
        } finally {
            setLoadingEmployees(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleAddTag = () => {
        if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
            setFormData(prev => ({
                ...prev,
                tags: [...prev.tags, tagInput.trim()]
            }));
            setTagInput('');
        }
    };

    const handleRemoveTag = (tag) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(t => t !== tag)
        }));
    };

    const handlePhotoUpload = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            files.forEach(file => {
                if (file.size > 10 * 1024 * 1024) {
                    alert(`File ${file.name} is too large. Maximum size is 10MB.`);
                    return;
                }
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

    const handleLocationChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        // Note: Geocoding can be added later if needed using a free geocoding service
        // For now, users can manually enter coordinates or use the LocationPicker component
    };

    const getMapUrl = () => {
        if (formData.latitude && formData.longitude) {
            return `https://www.openstreetmap.org/?mlat=${formData.latitude}&mlon=${formData.longitude}&zoom=15`;
        } else if (formData.address) {
            return `https://www.openstreetmap.org/search?query=${encodeURIComponent(formData.address)}`;
        } else if (formData.location) {
            return `https://www.openstreetmap.org/search?query=${encodeURIComponent(formData.location)}`;
        }
        return null;
    };

    const handleGoogleCalendarAuth = async () => {
        setIsSyncingToGoogle(true);
        try {
            if (window.GoogleCalendarService) {
                await window.GoogleCalendarService.openAuthPopup();
                setIsGoogleCalendarAuthenticated(true);
            } else {
                alert('Google Calendar service not available. Please refresh the page.');
            }
        } catch (error) {
            console.error('Google Calendar authentication error:', error);
            alert('Failed to authenticate with Google Calendar.');
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleSyncToGoogleCalendar = async () => {
        if (!formData.dueDate) {
            alert('Set a due date to sync this task to Google Calendar.');
            return;
        }
        if (!isGoogleCalendarAuthenticated) {
            await handleGoogleCalendarAuth();
            return;
        }
        setIsSyncingToGoogle(true);
        try {
            if (!window.GoogleCalendarService) {
                alert('Google Calendar service not available. Please refresh the page.');
                return;
            }
            const assignee = employees.find(e => String(e.id) === String(formData.assigneeId));
            const eventData = {
                id: task?.id || 'new',
                title: formData.title,
                description: `${formData.description || ''}${team?.name ? `\nTeam: ${team.name}` : ''}${assignee ? `\nAssignee: ${assignee.name || assignee.email}` : ''}`,
                date: formData.dueDate,
                time: '09:00',
                clientName: team?.name || '',
                clientId: team?.id || '',
                type: 'Team Task'
            };
            let googleEvent;
            if (googleEventId) {
                googleEvent = await window.GoogleCalendarService.updateEvent(googleEventId, {
                    summary: eventData.title,
                    description: eventData.description,
                    start: {
                        dateTime: window.GoogleCalendarService.formatDateTime(eventData.date, eventData.time),
                        timeZone: 'Africa/Johannesburg'
                    },
                    end: {
                        dateTime: window.GoogleCalendarService.formatDateTime(
                            eventData.date,
                            window.GoogleCalendarService.getEndTime(eventData.time)
                        ),
                        timeZone: 'Africa/Johannesburg'
                    }
                });
            } else {
                googleEvent = await window.GoogleCalendarService.createEvent(eventData);
            }
            setGoogleEventId(googleEvent.id);
            setGoogleEventUrl(googleEvent.htmlLink || googleEvent.url || null);
        } catch (error) {
            console.error('Failed to sync team task to Google Calendar:', error);
            alert('Failed to sync to Google Calendar.');
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleRemoveFromGoogleCalendar = async () => {
        if (!googleEventId) return;
        if (!confirm('Remove this task from Google Calendar?')) return;
        setIsSyncingToGoogle(true);
        try {
            if (window.GoogleCalendarService) {
                await window.GoogleCalendarService.deleteEvent(googleEventId);
                setGoogleEventId(null);
                setGoogleEventUrl(null);
            }
        } catch (error) {
            console.error('Failed to remove Google Calendar event:', error);
            alert('Failed to remove from Google Calendar.');
        } finally {
            setIsSyncingToGoogle(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (!formData.title.trim()) {
            alert('Please enter a task title');
            return;
        }

        const taskData = {
            ...formData,
            id: task?.id || Date.now().toString(),
            team: team.id,
            tags: typeof formData.tags === 'string' ? formData.tags : JSON.stringify(formData.tags),
            photos: typeof formData.photos === 'string' ? formData.photos : JSON.stringify(formData.photos || []),
            attachments: typeof formData.attachments === 'string' ? formData.attachments : JSON.stringify(formData.attachments || []),
            dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
            googleEventId: googleEventId || null,
            googleEventUrl: googleEventUrl || null,
            createdAt: task?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        onSave(taskData);
        onClose();
    };

    if (!isOpen) return null;

    const mapUrl = getMapUrl();

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto dark:bg-slate-800">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 dark:bg-slate-800 dark:border-slate-700 shadow-sm">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">
                            {task ? 'Edit Job Card' : 'Create New Job Card'}
                    </h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                            {team?.name || 'Team Task'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition dark:hover:text-gray-300"
                    >
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Job Details Section */}
                    <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                            <i className="fas fa-briefcase mr-2 text-primary-600 dark:text-primary-400"></i>
                            Job Details
                        </h3>
                        <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                    Job Title <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="title"
                            value={formData.title}
                            onChange={handleChange}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                    placeholder="Enter job title"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows="4"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                    placeholder="Enter job description and requirements"
                        />
                            </div>
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
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                    Location Name
                            </label>
                                <input
                                    type="text"
                                    name="location"
                                    value={formData.location}
                                    onChange={handleLocationChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                    placeholder="e.g., Site A, Building B, etc."
                                />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                    Full Address
                                </label>
                                <input
                                    type="text"
                                    name="address"
                                    value={formData.address}
                                    onChange={handleLocationChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                    placeholder="Enter full address for map integration"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                        Latitude
                                    </label>
                                    <input
                                        type="text"
                                        name="latitude"
                                        value={formData.latitude}
                                        onChange={handleLocationChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                        placeholder="Auto-filled from address"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                        Longitude
                            </label>
                                    <input
                                        type="text"
                                        name="longitude"
                                        value={formData.longitude}
                                        onChange={handleLocationChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                        placeholder="Auto-filled from address"
                                    />
                                </div>
                            </div>

                            {mapUrl && (
                                <div className="mt-4">
                                    <a
                                        href={mapUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                                    >
                                        <i className="fas fa-map mr-2"></i>
                                        View on OpenStreetMap
                                    </a>
                                </div>
                            )}

                            {(formData.latitude && formData.longitude) && window.MapComponent && (
                                <div className="mt-4 rounded-lg overflow-hidden border border-gray-300 dark:border-slate-600" style={{ height: '300px' }}>
                                    <window.MapComponent
                                        latitude={parseFloat(formData.latitude)}
                                        longitude={parseFloat(formData.longitude)}
                                        siteName={formData.location || formData.address || 'Job Location'}
                                        allowSelection={false}
                                        defaultZoom={15}
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Images Section */}
                    <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                            <i className="fas fa-images mr-2 text-primary-600 dark:text-primary-400"></i>
                            Job Images
                        </h3>
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg p-6 text-center hover:border-primary-400 transition">
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
                                    className="cursor-pointer flex flex-col items-center"
                                >
                                    <i className="fas fa-camera text-4xl text-gray-400 dark:text-slate-500 mb-3"></i>
                                    <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                                        Click to upload photos or drag and drop
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-slate-400">
                                        PNG, JPG, GIF up to 10MB each
                                    </p>
                                </label>
                            </div>

                            {selectedPhotos.length > 0 && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                                    {selectedPhotos.map((photo, idx) => (
                                        <div key={idx} className="relative group">
                                            <div className="aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-slate-700">
                                                <img
                                                    src={typeof photo === 'string' ? photo : photo.url}
                                                    alt={`Job photo ${idx + 1}`}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemovePhoto(idx)}
                                                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-lg"
                                            >
                                                <i className="fas fa-times text-xs"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Assignment & Scheduling Section */}
                    <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                            <i className="fas fa-user-check mr-2 text-primary-600 dark:text-primary-400"></i>
                            Assignment & Scheduling
                        </h3>
                        <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Assignee
                            </label>
                            {loadingEmployees ? (
                                <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 dark:bg-slate-700 dark:border-slate-600 text-gray-500 dark:text-slate-400 text-sm">
                                    Loading employee details...
                                </div>
                            ) : (
                                <select
                                    name="assigneeId"
                                    value={formData.assigneeId}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                >
                                    <option value="">Select an assignee</option>
                                    {employees.map((employee) => (
                                        <option key={employee.id} value={employee.id}>
                                            {employee.name || employee.email || employee.id}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                Due Date
                            </label>
                            <input
                                type="date"
                                name="dueDate"
                                value={formData.dueDate}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                            />
                        </div>
                    </div>
                        </div>
                    </div>

                    {/* Status & Priority Section */}
                    <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                            <i className="fas fa-tasks mr-2 text-primary-600 dark:text-primary-400"></i>
                            Status & Priority
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                    Status
                                </label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                >
                                    <option value="todo">To Do</option>
                                    <option value="in-progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="blocked">Blocked</option>
                                </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-300">
                                    Priority
                        </label>
                                <select
                                    name="priority"
                                    value={formData.priority}
                                    onChange={handleChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Critical">Critical</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Tags Section */}
                    <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                            <i className="fas fa-tags mr-2 text-primary-600 dark:text-primary-400"></i>
                            Tags & Labels
                        </h3>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-slate-100"
                                placeholder="Add tag and press Enter"
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
                            >
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>
                            {formData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {formData.tags.map((tag, idx) => (
                                <span
                                    key={idx}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-medium dark:bg-primary-900 dark:text-primary-300"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveTag(tag)}
                                                className="text-primary-700 hover:text-primary-900 dark:text-primary-300 dark:hover:text-primary-100 ml-1"
                                    >
                                        <i className="fas fa-times text-xs"></i>
                                    </button>
                                </span>
                            ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Google Calendar Sync Section */}
                    <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-5 border border-gray-200 dark:border-slate-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-4 flex items-center">
                            <i className="fab fa-google mr-2 text-primary-600 dark:text-primary-400"></i>
                            Google Calendar Integration
                        </h3>
                        <div className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            {googleEventId ? (
                                <>
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        <i className="fas fa-check-circle mr-1"></i>Synced
                                    </span>
                                    {googleEventUrl && (
                                        <a
                                            href={googleEventUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-sm px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                                        >
                                            <i className="fas fa-external-link-alt mr-1"></i>Open
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleSyncToGoogleCalendar}
                                        disabled={isSyncingToGoogle || !formData.dueDate}
                                        className="text-sm px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300 disabled:opacity-50 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                                    >
                                        <i className={`fas ${isSyncingToGoogle ? 'fa-spinner fa-spin' : 'fa-sync-alt'} mr-1`}></i>
                                        {isSyncingToGoogle ? 'Syncing...' : 'Update'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFromGoogleCalendar}
                                        disabled={isSyncingToGoogle}
                                        className="text-sm px-3 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-600 dark:text-white dark:hover:bg-red-700"
                                    >
                                        <i className="fas fa-trash mr-1"></i>Remove
                                    </button>
                                </>
                            ) : (
                                <>
                                    {!isGoogleCalendarAuthenticated ? (
                                        <button
                                            type="button"
                                            onClick={handleGoogleCalendarAuth}
                                            disabled={isSyncingToGoogle}
                                            className="text-sm px-3 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-600 dark:text-white dark:hover:bg-green-700"
                                        >
                                            <i className={`fab fa-google mr-1 ${isSyncingToGoogle ? 'fa-spinner fa-spin' : ''}`}></i>
                                            {isSyncingToGoogle ? 'Connecting...' : 'Connect Google Calendar'}
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleSyncToGoogleCalendar}
                                            disabled={isSyncingToGoogle || !formData.dueDate}
                                            className="text-sm px-3 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 dark:bg-blue-600 dark:text-white dark:hover:bg-blue-700"
                                        >
                                            <i className={`fas ${isSyncingToGoogle ? 'fa-spinner fa-spin' : 'fa-calendar-plus'} mr-1`}></i>
                                            {isSyncingToGoogle ? 'Syncing...' : 'Sync to Google Calendar'}
                                        </button>
                                    )}
                                    {!formData.dueDate && (
                                        <span className="text-xs text-gray-500 dark:text-slate-400">(Set a due date to enable sync)</span>
                                    )}
                                </>
                            )}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 border-t border-gray-200 dark:border-slate-700 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
                        >
                            {task ? 'Update Job Card' : 'Create Job Card'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Make available globally
window.TaskModal = TaskModal;

