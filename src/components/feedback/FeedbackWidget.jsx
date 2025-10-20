// Lightweight feedback widget
const { useState } = React;

const FeedbackWidget = () => {
    const [open, setOpen] = useState(false);
    const [message, setMessage] = useState('');
    const [section, setSection] = useState('');
    const [type, setType] = useState('feedback');
    const [severity, setSeverity] = useState('medium');
    const [submitting, setSubmitting] = useState(false);
    const { user } = window.useAuth();

    const submit = async () => {
        if (!message.trim()) {
            alert('Please enter your feedback');
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message.trim(),
                    pageUrl: window.location.href,
                    section: section.trim(),
                    type,
                    severity,
                    meta: {
                        userAgent: navigator.userAgent,
                        viewport: `${window.innerWidth}x${window.innerHeight}`,
                        screen: `${window.screen.width}x${window.screen.height}`,
                        userName: user?.name || null,
                        userEmail: user?.email || null
                    }
                })
            });
            if (!res.ok) throw new Error('Failed to submit');
            setMessage('');
            setSection('');
            setOpen(false);
            alert('Thanks! Your feedback was submitted.');
        } catch (e) {
            console.error(e);
            alert('Could not submit feedback. Please try again later.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed right-4 bottom-4 z-50">
            {!open ? (
                <button
                    onClick={() => setOpen(true)}
                    className="bg-primary-600 text-white px-3 py-2 rounded-full shadow-lg text-xs font-medium hover:bg-primary-700"
                    title="Send feedback"
                >
                    <i className="fas fa-comment-dots mr-1"></i>
                    Feedback
                </button>
            ) : (
                <div className="w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                        <div className="text-xs font-semibold text-gray-700">Send Feedback</div>
                        <button className="text-gray-500 hover:text-gray-700" onClick={() => setOpen(false)}>
                            <i className="fas fa-times text-xs"></i>
                        </button>
                    </div>
                    <div className="p-3 space-y-2">
                        <div>
                            <label className="block text-[10px] text-gray-600 mb-1">Section (optional)</label>
                            <input
                                value={section}
                                onChange={(e) => setSection(e.target.value)}
                                placeholder="e.g., Clients > Contacts"
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[10px] text-gray-600 mb-1">Type</label>
                                <select
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                >
                                    <option value="feedback">Feedback</option>
                                    <option value="bug">Bug</option>
                                    <option value="idea">Idea</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-gray-600 mb-1">Severity</label>
                                <select
                                    value={severity}
                                    onChange={(e) => setSeverity(e.target.value)}
                                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[10px] text-gray-600 mb-1">Your message</label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Describe the issue or suggestion"
                                rows={4}
                                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-primary-500 focus:border-transparent"
                            />
                        </div>
                        <button
                            onClick={submit}
                            disabled={submitting}
                            className="w-full bg-primary-600 text-white rounded px-3 py-1.5 text-xs font-medium hover:bg-primary-700 disabled:opacity-60"
                        >
                            {submitting ? 'Sending…' : 'Submit feedback'}
                        </button>
                        <div className="text-[10px] text-gray-500 text-center">
                            Page: {window.location.pathname}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

window.FeedbackWidget = FeedbackWidget;


