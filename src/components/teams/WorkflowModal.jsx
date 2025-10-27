// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const WorkflowModal = ({ isOpen, onClose, team, workflow, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        status: 'Draft',
        steps: [],
        tags: [],
        schematic: null
    });
    const [tagInput, setTagInput] = useState('');
    const [showStepModal, setShowStepModal] = useState(false);
    const [editingStep, setEditingStep] = useState(null);
    const [stepFormData, setStepFormData] = useState({
        name: '',
        description: '',
        assignee: '',
        duration: '',
        schematic: null,
        schematicPreview: null,
        inputs: [],
        outputs: [],
        checkpoints: []
    });
    const [schematicFile, setSchematicFile] = useState(null);

    useEffect(() => {
        if (workflow) {
            setFormData(workflow);
        } else {
            setFormData({
                title: '',
                description: '',
                status: 'Draft',
                steps: [],
                tags: [],
                schematic: null
            });
        }
    }, [workflow]);

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

    const handleAddStep = () => {
        setStepFormData({
            name: '',
            description: '',
            assignee: '',
            duration: '',
            schematic: null,
            schematicPreview: null,
            inputs: [],
            outputs: [],
            checkpoints: []
        });
        setEditingStep(null);
        setSchematicFile(null);
        setShowStepModal(true);
    };

    const handleEditStep = (step, index) => {
        setStepFormData(step);
        setEditingStep(index);
        setSchematicFile(null);
        setShowStepModal(true);
    };

    const handleDeleteStep = (index) => {
        setFormData(prev => ({
            ...prev,
            steps: prev.steps.filter((_, i) => i !== index)
        }));
    };

    const handleStepChange = (e) => {
        const { name, value } = e.target;
        setStepFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSchematicUpload = (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            setSchematicFile(file);
            
            // Create preview
            const reader = new FileReader();
            reader.onload = (event) => {
                setStepFormData(prev => ({
                    ...prev,
                    schematic: {
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        uploadedAt: new Date().toISOString()
                    },
                    schematicPreview: event.target.result
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAddCheckpoint = () => {
        const checkpoint = prompt('Enter checkpoint description:');
        if (checkpoint) {
            setStepFormData(prev => ({
                ...prev,
                checkpoints: [...prev.checkpoints, checkpoint]
            }));
        }
    };

    const handleRemoveCheckpoint = (index) => {
        setStepFormData(prev => ({
            ...prev,
            checkpoints: prev.checkpoints.filter((_, i) => i !== index)
        }));
    };

    const handleSaveStep = () => {
        if (!stepFormData.name.trim()) {
            alert('Please enter a step name');
            return;
        }

        const stepData = {
            ...stepFormData,
            id: stepFormData.id || Date.now().toString()
        };

        if (editingStep !== null) {
            // Update existing step
            setFormData(prev => ({
                ...prev,
                steps: prev.steps.map((step, index) => 
                    index === editingStep ? stepData : step
                )
            }));
        } else {
            // Add new step
            setFormData(prev => ({
                ...prev,
                steps: [...prev.steps, stepData]
            }));
        }

        setShowStepModal(false);
        setStepFormData({
            name: '',
            description: '',
            assignee: '',
            duration: '',
            schematic: null,
            schematicPreview: null,
            inputs: [],
            outputs: [],
            checkpoints: []
        });
        setSchematicFile(null);
    };

    const handleMoveStep = (index, direction) => {
        const newSteps = [...formData.steps];
        const newIndex = index + direction;
        
        if (newIndex >= 0 && newIndex < newSteps.length) {
            [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
            setFormData(prev => ({
                ...prev,
                steps: newSteps
            }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (formData.steps.length === 0) {
            alert('Please add at least one step to the workflow');
            return;
        }

        // Get current user info
        const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
        
        const workflowData = {
            ...formData,
            id: workflow?.id || Date.now().toString(),
            team: team.id,
            createdAt: workflow?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: currentUser.name,
            createdByEmail: currentUser.email,
            createdById: currentUser.id
        };

        onSave(workflowData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            {workflow ? 'Edit Workflow' : 'Create New Workflow'}
                        </h3>
                        <p className="text-xs text-gray-600">{team.name}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition"
                    >
                        <i className="fas fa-times text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <div className="lg:col-span-2">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Workflow Title *
                            </label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleChange}
                                required
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="e.g., Customer Onboarding Process"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Status
                            </label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                                <option value="Draft">Draft</option>
                                <option value="Active">Active</option>
                                <option value="Under Review">Under Review</option>
                                <option value="Archived">Archived</option>
                            </select>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            placeholder="Brief description of the workflow purpose and outcomes..."
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Tags
                        </label>
                        <div className="flex gap-2 mb-2">
                            <input
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="Add tag and press Enter"
                            />
                            <button
                                type="button"
                                onClick={handleAddTag}
                                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm"
                            >
                                Add
                            </button>
                        </div>
                        {formData.tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs flex items-center gap-1"
                                    >
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(tag)}
                                            className="hover:text-primary-900"
                                        >
                                            <i className="fas fa-times text-xs"></i>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Workflow Steps */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-xs font-medium text-gray-700">
                                Workflow Steps ({formData.steps.length})
                            </label>
                            <button
                                type="button"
                                onClick={handleAddStep}
                                className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                            >
                                <i className="fas fa-plus mr-1"></i>
                                Add Step
                            </button>
                        </div>

                        {formData.steps.length > 0 ? (
                            <div className="space-y-2">
                                {formData.steps.map((step, index) => (
                                    <div key={index} className="border border-gray-200 rounded-lg p-3 hover:border-primary-300 transition">
                                        <div className="flex items-start gap-3">
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveStep(index, -1)}
                                                    disabled={index === 0}
                                                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <i className="fas fa-chevron-up text-xs"></i>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleMoveStep(index, 1)}
                                                    disabled={index === formData.steps.length - 1}
                                                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <i className="fas fa-chevron-down text-xs"></i>
                                                </button>
                                            </div>

                                            <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <span className="text-sm font-bold text-primary-600">{index + 1}</span>
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between mb-1">
                                                    <h4 className="font-semibold text-gray-900 text-sm">{step.name}</h4>
                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditStep(step, index)}
                                                            className="p-1 text-gray-400 hover:text-primary-600 transition"
                                                        >
                                                            <i className="fas fa-edit text-xs"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteStep(index)}
                                                            className="p-1 text-gray-400 hover:text-red-600 transition"
                                                        >
                                                            <i className="fas fa-trash text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                                
                                                {step.description && (
                                                    <p className="text-xs text-gray-600 mb-2">{step.description}</p>
                                                )}
                                                
                                                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                                                    {step.assignee && (
                                                        <span className="flex items-center gap-1">
                                                            <i className="fas fa-user"></i>
                                                            {step.assignee}
                                                        </span>
                                                    )}
                                                    {step.duration && (
                                                        <span className="flex items-center gap-1">
                                                            <i className="fas fa-clock"></i>
                                                            {step.duration}
                                                        </span>
                                                    )}
                                                    {step.schematic && (
                                                        <span className="flex items-center gap-1 text-primary-600">
                                                            <i className="fas fa-image"></i>
                                                            Schematic attached
                                                        </span>
                                                    )}
                                                    {step.checkpoints && step.checkpoints.length > 0 && (
                                                        <span className="flex items-center gap-1">
                                                            <i className="fas fa-check-circle"></i>
                                                            {step.checkpoints.length} checkpoints
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                                <i className="fas fa-project-diagram text-3xl text-gray-300 mb-2"></i>
                                <p className="text-sm text-gray-500 mb-3">No steps added yet</p>
                                <button
                                    type="button"
                                    onClick={handleAddStep}
                                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-xs"
                                >
                                    Add First Step
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                        >
                            {workflow ? 'Update Workflow' : 'Create Workflow'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Step Modal */}
            {showStepModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                            <h4 className="text-base font-semibold text-gray-900">
                                {editingStep !== null ? 'Edit Step' : 'Add Step'}
                            </h4>
                            <button
                                onClick={() => setShowStepModal(false)}
                                className="text-gray-400 hover:text-gray-600 transition"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Step Name */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Step Name *
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={stepFormData.name}
                                    onChange={handleStepChange}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                    placeholder="e.g., Initial Contact"
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Description
                                </label>
                                <textarea
                                    name="description"
                                    value={stepFormData.description}
                                    onChange={handleStepChange}
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                    placeholder="Detailed description of what happens in this step..."
                                />
                            </div>

                            {/* Assignee and Duration */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Assignee
                                    </label>
                                    <input
                                        type="text"
                                        name="assignee"
                                        value={stepFormData.assignee}
                                        onChange={handleStepChange}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Team/Person"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Duration
                                    </label>
                                    <input
                                        type="text"
                                        name="duration"
                                        value={stepFormData.duration}
                                        onChange={handleStepChange}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="e.g., 2 hours"
                                    />
                                </div>
                            </div>

                            {/* Schematic Upload */}
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Schematic/Diagram (Optional)
                                </label>
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                                    <input
                                        type="file"
                                        id="schematicUpload"
                                        onChange={handleSchematicUpload}
                                        accept="image/*"
                                        className="hidden"
                                    />
                                    {stepFormData.schematicPreview ? (
                                        <div className="space-y-2">
                                            <img 
                                                src={stepFormData.schematicPreview} 
                                                alt="Schematic preview" 
                                                className="w-full h-48 object-contain rounded border border-gray-200"
                                            />
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-gray-600">{stepFormData.schematic?.name}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStepFormData(prev => ({
                                                            ...prev,
                                                            schematic: null,
                                                            schematicPreview: null
                                                        }));
                                                        setSchematicFile(null);
                                                    }}
                                                    className="text-xs text-red-600 hover:text-red-700"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <label htmlFor="schematicUpload" className="cursor-pointer block text-center">
                                            <i className="fas fa-image text-3xl text-gray-400 mb-2"></i>
                                            <p className="text-sm text-gray-600">Click to upload schematic or diagram</p>
                                            <p className="text-xs text-gray-500">PNG, JPG, SVG supported</p>
                                        </label>
                                    )}
                                </div>
                            </div>

                            {/* Checkpoints */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-medium text-gray-700">
                                        Checkpoints
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddCheckpoint}
                                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200 transition"
                                    >
                                        <i className="fas fa-plus mr-1"></i>
                                        Add
                                    </button>
                                </div>
                                {stepFormData.checkpoints.length > 0 ? (
                                    <div className="space-y-1">
                                        {stepFormData.checkpoints.map((checkpoint, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded text-xs">
                                                <span className="text-gray-700">{checkpoint}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveCheckpoint(idx)}
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    <i className="fas fa-times"></i>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-500 text-center py-2">No checkpoints added</p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setShowStepModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveStep}
                                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm"
                                >
                                    {editingStep !== null ? 'Update Step' : 'Add Step'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.WorkflowModal = WorkflowModal;
