// Get React hooks from window
const { useState, useEffect, useRef } = React;

const AdminNoteMode = () => {
    const [isActive, setIsActive] = useState(false);
    const [selectedElement, setSelectedElement] = useState(null);
    const [showNoteModal, setShowNoteModal] = useState(false);
    const [note, setNote] = useState('');
    const [noteType, setNoteType] = useState('bug');
    const [priority, setPriority] = useState('medium');
    const [elementPath, setElementPath] = useState('');
    const [elementInfo, setElementInfo] = useState({});
    const [feedbackHistory, setFeedbackHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const overlayRef = useRef(null);

    // Load feedback history from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('admin_feedback_history');
        if (saved) {
            setFeedbackHistory(JSON.parse(saved));
        }
    }, []);

    // Save feedback history to localStorage
    const saveFeedbackHistory = (newFeedback) => {
        const updated = [...feedbackHistory, newFeedback];
        setFeedbackHistory(updated);
        localStorage.setItem('admin_feedback_history', JSON.stringify(updated));
    };

    // Toggle admin note mode
    const toggleNoteMode = () => {
        setIsActive(!isActive);
        if (!isActive) {
            document.body.style.cursor = 'crosshair';
            document.body.classList.add('admin-note-mode-active');
        } else {
            document.body.style.cursor = 'default';
            document.body.classList.remove('admin-note-mode-active');
            setSelectedElement(null);
            setShowNoteModal(false);
        }
    };

    // Handle element click
    const handleElementClick = (e) => {
        if (!isActive) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const element = e.target;
        const rect = element.getBoundingClientRect();
        
        setSelectedElement({
            element: element,
            rect: rect,
            tagName: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className,
            textContent: element.textContent?.substring(0, 100) || '',
            innerHTML: element.innerHTML?.substring(0, 200) || ''
        });

        // Generate element path
        const path = generateElementPath(element);
        setElementPath(path);
        
        // Set element info
        setElementInfo({
            tagName: element.tagName.toLowerCase(),
            id: element.id,
            className: element.className,
            textContent: element.textContent?.substring(0, 100) || '',
            attributes: Array.from(element.attributes).reduce((acc, attr) => {
                acc[attr.name] = attr.value;
                return acc;
            }, {})
        });

        setShowNoteModal(true);
    };

    // Generate element path for identification
    const generateElementPath = (element) => {
        const path = [];
        let current = element;
        
        while (current && current !== document.body) {
            let selector = current.tagName.toLowerCase();
            
            if (current.id) {
                selector += `#${current.id}`;
            } else if (current.className && typeof current.className === 'string') {
                const classes = current.className.split(' ').filter(c => c.trim());
                if (classes.length > 0) {
                    selector += '.' + classes.join('.');
                }
            }
            
            // Add nth-child if needed for uniqueness
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(s => s.tagName === current.tagName);
                if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-child(${index})`;
                }
            }
            
            path.unshift(selector);
            current = current.parentElement;
        }
        
        return path.join(' > ');
    };

    // Submit feedback
    const submitFeedback = async () => {
        if (!note.trim()) {
            alert('Please enter a note');
            return;
        }

        const feedback = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            note: note.trim(),
            type: noteType,
            priority: priority,
            elementPath: elementPath,
            elementInfo: elementInfo,
            pageUrl: window.location.href,
            userAgent: navigator.userAgent,
            screenResolution: `${window.screen.width}x${window.screen.height}`,
            viewportSize: `${window.innerWidth}x${window.innerHeight}`,
            status: 'pending'
        };

        // Save to history
        saveFeedbackHistory(feedback);

        // Send to issue tracker (mock implementation)
        try {
            await sendToIssueTracker(feedback);
            alert('Feedback submitted successfully!');
        } catch (error) {
            console.error('Failed to send feedback:', error);
            alert('Feedback saved locally but failed to send to tracker');
        }

        // Reset form
        setNote('');
        setNoteType('bug');
        setPriority('medium');
        setShowNoteModal(false);
        setSelectedElement(null);
    };

    // Mock function to send to issue tracker
    const sendToIssueTracker = async (feedback) => {
        // In a real implementation, this would send to your issue tracker API
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // For now, just log to console
    };

    // Add event listeners when active
    useEffect(() => {
        if (isActive) {
            document.addEventListener('click', handleElementClick, true);
            return () => {
                document.removeEventListener('click', handleElementClick, true);
            };
        }
    }, [isActive]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyPress = (e) => {
            // Ctrl/Cmd + Shift + A to toggle admin mode
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                toggleNoteMode();
            }
            // Escape to close modal
            if (e.key === 'Escape') {
                setShowNoteModal(false);
                setSelectedElement(null);
            }
        };

        document.addEventListener('keydown', handleKeyPress);
        return () => document.removeEventListener('keydown', handleKeyPress);
    }, [isActive]);

    return (
        <>
            {/* Admin Note Mode Toggle Button */}
            <div className="fixed top-4 right-4 z-[9999]">
                <button
                    onClick={toggleNoteMode}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                        isActive 
                            ? 'bg-red-600 text-white shadow-lg' 
                            : 'bg-gray-800 text-white hover:bg-gray-700'
                    }`}
                    title="Toggle Admin Note Mode (Ctrl/Cmd + Shift + A)"
                >
                    <i className={`fas fa-${isActive ? 'stop' : 'bug'} mr-2`}></i>
                    {isActive ? 'Exit Note Mode' : 'Admin Note Mode'}
                </button>
                
                {/* Feedback History Button */}
                <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="ml-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    title="View Feedback History"
                >
                    <i className="fas fa-history"></i>
                    {feedbackHistory.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                            {feedbackHistory.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Element Selection Overlay */}
            {isActive && (
                <div
                    ref={overlayRef}
                    className="fixed inset-0 z-[9998] pointer-events-none"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                >
                    <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium">
                        Click any element to add feedback
                    </div>
                </div>
            )}

            {/* Note Modal */}
            {showNoteModal && selectedElement && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
                    <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Add Feedback Note</h2>
                                <button
                                    onClick={() => setShowNoteModal(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            {/* Element Info */}
                            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-2">Selected Element:</h3>
                                <div className="text-sm text-gray-600 space-y-1">
                                    <div><strong>Tag:</strong> {elementInfo.tagName}</div>
                                    {elementInfo.id && <div><strong>ID:</strong> {elementInfo.id}</div>}
                                    {elementInfo.className && <div><strong>Classes:</strong> {elementInfo.className}</div>}
                                    {elementInfo.textContent && <div><strong>Text:</strong> {elementInfo.textContent}</div>}
                                    <div><strong>Path:</strong> <code className="bg-gray-200 px-1 rounded text-xs">{elementPath}</code></div>
                                </div>
                            </div>

                            {/* Feedback Form */}
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Feedback Type
                                        </label>
                                        <select
                                            value={noteType}
                                            onChange={(e) => setNoteType(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="bug">🐛 Bug Report</option>
                                            <option value="improvement">💡 Improvement</option>
                                            <option value="feature">✨ Feature Request</option>
                                            <option value="question">❓ Question</option>
                                            <option value="praise">👍 Positive Feedback</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Priority
                                        </label>
                                        <select
                                            value={priority}
                                            onChange={(e) => setPriority(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        >
                                            <option value="low">🟢 Low</option>
                                            <option value="medium">🟡 Medium</option>
                                            <option value="high">🟠 High</option>
                                            <option value="critical">🔴 Critical</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Feedback Note *
                                    </label>
                                    <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        placeholder="Describe the issue, improvement, or feedback..."
                                        rows={4}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div className="flex justify-end space-x-3">
                                    <button
                                        onClick={() => setShowNoteModal(false)}
                                        className="px-4 py-2 text-gray-600 hover:text-gray-800"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={submitFeedback}
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                    >
                                        Submit Feedback
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Feedback History Modal */}
            {showHistory && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
                    <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Feedback History</h2>
                                <button
                                    onClick={() => setShowHistory(false)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <i className="fas fa-times text-xl"></i>
                                </button>
                            </div>

                            {feedbackHistory.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    <i className="fas fa-history text-4xl mb-4"></i>
                                    <p>No feedback submitted yet</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {feedbackHistory.map((feedback) => (
                                        <div key={feedback.id} className="border border-gray-200 rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex items-center space-x-2">
                                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                                        feedback.type === 'bug' ? 'bg-red-100 text-red-800' :
                                                        feedback.type === 'improvement' ? 'bg-blue-100 text-blue-800' :
                                                        feedback.type === 'feature' ? 'bg-green-100 text-green-800' :
                                                        feedback.type === 'question' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-purple-100 text-purple-800'
                                                    }`}>
                                                        {feedback.type}
                                                    </span>
                                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                                        feedback.priority === 'critical' ? 'bg-red-100 text-red-800' :
                                                        feedback.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                                                        feedback.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-green-100 text-green-800'
                                                    }`}>
                                                        {feedback.priority}
                                                    </span>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {new Date(feedback.timestamp).toLocaleString()}
                                                </span>
                                            </div>
                                            <p className="text-gray-900 mb-2">{feedback.note}</p>
                                            <div className="text-xs text-gray-500">
                                                <div><strong>Page:</strong> {feedback.pageUrl}</div>
                                                <div><strong>Element:</strong> <code className="bg-gray-100 px-1 rounded">{feedback.elementPath}</code></div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// Make available globally
window.AdminNoteMode = AdminNoteMode;
