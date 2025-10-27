// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const WorkflowExecutionModal = ({ isOpen, onClose, workflow, onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [completedSteps, setCompletedSteps] = useState(new Set());
    const [stepNotes, setStepNotes] = useState({});
    const [checkpointStatus, setCheckpointStatus] = useState({});
    const [startTime, setStartTime] = useState(null);
    const [stepStartTime, setStepStartTime] = useState(null);
    const [executionData, setExecutionData] = useState({
        executedBy: (window.storage?.getUserInfo() || { name: 'System' }).name,
        executedById: (window.storage?.getUserInfo() || { id: 'system' }).id,
        executedByEmail: (window.storage?.getUserInfo() || { email: 'system' }).email,
        startedAt: null,
        completedAt: null,
        totalDuration: 0,
        stepDurations: {},
        notes: '',
        status: 'In Progress'
    });

    useEffect(() => {
        if (isOpen && workflow) {
            setStartTime(Date.now());
            setStepStartTime(Date.now());
            setExecutionData(prev => ({
                ...prev,
                startedAt: new Date().toISOString(),
                status: 'In Progress'
            }));
        }
    }, [isOpen, workflow]);

    const handleCompleteStep = () => {
        const step = workflow.steps[currentStep];
        
        // Check if all required checkpoints are completed
        if (step.checkpoints && step.checkpoints.length > 0) {
            const allCompleted = step.checkpoints.every(checkpoint => 
                checkpointStatus[`${currentStep}-${checkpoint}`]
            );
            
            if (!allCompleted) {
                alert('Please complete all checkpoints before proceeding');
                return;
            }
        }

        // Record step duration
        const stepDuration = Date.now() - stepStartTime;
        setExecutionData(prev => ({
            ...prev,
            stepDurations: {
                ...prev.stepDurations,
                [currentStep]: stepDuration
            }
        }));

        // Mark step as completed
        setCompletedSteps(prev => new Set([...prev, currentStep]));

        // Move to next step or complete workflow
        if (currentStep < workflow.steps.length - 1) {
            setCurrentStep(currentStep + 1);
            setStepStartTime(Date.now());
        } else {
            completeWorkflow();
        }
    };

    const completeWorkflow = () => {
        const totalDuration = Date.now() - startTime;
        const completionData = {
            ...executionData,
            completedAt: new Date().toISOString(),
            totalDuration,
            status: 'Completed',
            stepNotes
        };

        if (onComplete) {
            onComplete(completionData);
        }

        alert('Workflow completed successfully!');
        onClose();
    };

    const handlePreviousStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
            setStepStartTime(Date.now());
        }
    };

    const handleStepNoteChange = (e) => {
        setStepNotes(prev => ({
            ...prev,
            [currentStep]: e.target.value
        }));
    };

    const handleCheckpointToggle = (checkpoint) => {
        const key = `${currentStep}-${checkpoint}`;
        setCheckpointStatus(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const formatDuration = (ms) => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    if (!isOpen || !workflow) return null;

    const currentStepData = workflow.steps[currentStep];
    const progress = ((completedSteps.size) / workflow.steps.length) * 100;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Execute Workflow
                            </h3>
                            <p className="text-xs text-gray-600">{workflow.title}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 transition"
                        >
                            <i className="fas fa-times text-lg"></i>
                        </button>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">
                                Step {currentStep + 1} of {workflow.steps.length}
                            </span>
                            <span className="text-gray-600">
                                {Math.round(progress)}% Complete
                            </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                                className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

                <div className="p-4">
                    {/* Step Navigation */}
                    <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-2">
                        {workflow.steps.map((step, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentStep(index)}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                                    index === currentStep
                                        ? 'bg-primary-600 text-white'
                                        : completedSteps.has(index)
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                            >
                                {completedSteps.has(index) && (
                                    <i className="fas fa-check mr-1"></i>
                                )}
                                {index + 1}. {step.name}
                            </button>
                        ))}
                    </div>

                    {/* Current Step Details */}
                    <div className="space-y-4">
                        {/* Step Header */}
                        <div className="bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg p-4 text-white">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                                    <span className="text-lg font-bold">{currentStep + 1}</span>
                                </div>
                                <div className="flex-1">
                                    <h4 className="text-lg font-bold">{currentStepData.name}</h4>
                                    {currentStepData.assignee && (
                                        <p className="text-xs opacity-90">
                                            <i className="fas fa-user mr-1"></i>
                                            Assigned to: {currentStepData.assignee}
                                        </p>
                                    )}
                                </div>
                                {currentStepData.duration && (
                                    <div className="text-right">
                                        <p className="text-xs opacity-75">Estimated Time</p>
                                        <p className="text-sm font-bold">{currentStepData.duration}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Step Description */}
                        {currentStepData.description && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-blue-900 mb-1">
                                    <i className="fas fa-info-circle mr-1"></i>
                                    Instructions
                                </p>
                                <p className="text-sm text-blue-800">{currentStepData.description}</p>
                            </div>
                        )}

                        {/* Schematic */}
                        {currentStepData.schematicPreview && (
                            <div className="border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-gray-700 mb-2">
                                    <i className="fas fa-image mr-1"></i>
                                    Reference Schematic/Diagram
                                </p>
                                <img 
                                    src={currentStepData.schematicPreview} 
                                    alt="Step schematic" 
                                    className="w-full rounded border border-gray-200 cursor-pointer hover:shadow-lg transition"
                                    onClick={() => window.open(currentStepData.schematicPreview, '_blank')}
                                />
                                <p className="text-xs text-gray-500 mt-1 text-center">
                                    Click to view full size
                                </p>
                            </div>
                        )}

                        {/* Checkpoints */}
                        {currentStepData.checkpoints && currentStepData.checkpoints.length > 0 && (
                            <div className="border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-gray-700 mb-2">
                                    <i className="fas fa-check-circle mr-1"></i>
                                    Checkpoints ({Object.values(checkpointStatus).filter(v => v && Object.keys(checkpointStatus).some(k => k.startsWith(`${currentStep}-`))).length} / {currentStepData.checkpoints.length})
                                </p>
                                <div className="space-y-2">
                                    {currentStepData.checkpoints.map((checkpoint, idx) => {
                                        const key = `${currentStep}-${checkpoint}`;
                                        return (
                                            <label
                                                key={idx}
                                                className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checkpointStatus[key] || false}
                                                    onChange={() => handleCheckpointToggle(checkpoint)}
                                                    className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                                                />
                                                <span className="text-sm text-gray-900">{checkpoint}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Step Notes */}
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Step Notes (Optional)
                            </label>
                            <textarea
                                value={stepNotes[currentStep] || ''}
                                onChange={handleStepNoteChange}
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                                placeholder="Add notes about this step execution..."
                            />
                        </div>

                        {/* Completed Steps Summary */}
                        {completedSteps.size > 0 && (
                            <div className="border border-gray-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-gray-700 mb-2">
                                    <i className="fas fa-history mr-1"></i>
                                    Completed Steps Summary
                                </p>
                                <div className="space-y-1">
                                    {Array.from(completedSteps).sort().map(stepIndex => (
                                        <div key={stepIndex} className="flex items-center justify-between text-xs bg-green-50 p-2 rounded">
                                            <span className="text-green-700">
                                                <i className="fas fa-check-circle mr-1"></i>
                                                {workflow.steps[stepIndex].name}
                                            </span>
                                            {executionData.stepDurations[stepIndex] && (
                                                <span className="text-green-600">
                                                    {formatDuration(executionData.stepDurations[stepIndex])}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex gap-2 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                            >
                                <i className="fas fa-times mr-1"></i>
                                Cancel
                            </button>
                            
                            {currentStep > 0 && (
                                <button
                                    type="button"
                                    onClick={handlePreviousStep}
                                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm"
                                >
                                    <i className="fas fa-arrow-left mr-1"></i>
                                    Previous
                                </button>
                            )}
                            
                            <button
                                type="button"
                                onClick={handleCompleteStep}
                                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition text-sm font-medium"
                            >
                                {currentStep === workflow.steps.length - 1 ? (
                                    <>
                                        <i className="fas fa-check-double mr-1"></i>
                                        Complete Workflow
                                    </>
                                ) : (
                                    <>
                                        Complete Step & Continue
                                        <i className="fas fa-arrow-right ml-1"></i>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.WorkflowExecutionModal = WorkflowExecutionModal;
