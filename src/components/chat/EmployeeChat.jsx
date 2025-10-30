// Employee Chat Component - Dashboard Chat Feature
const { useState, useEffect, useRef } = React;

const EmployeeChat = () => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState(null);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const messagesEndRef = useRef(null);
    const { user } = window.useAuth?.() || {};
    const { isDark } = window.useTheme?.() || {};

    // Scroll to bottom of messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Load messages from API
    const loadMessages = async () => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                setError('Authentication required');
                setIsLoading(false);
                return;
            }

            const response = await fetch('/api/messages', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load messages: ${response.status}`);
            }

            const data = await response.json();
            if (data.messages && Array.isArray(data.messages)) {
                setMessages(data.messages);
                setError(null);
            }
        } catch (err) {
            console.error('Error loading messages:', err);
            setError(err.message || 'Failed to load messages');
        } finally {
            setIsLoading(false);
        }
    };

    // Send new message
    const sendMessage = async (e) => {
        e.preventDefault();
        
        if (!newMessage.trim() || isSending) return;

        setIsSending(true);
        setError(null);

        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                throw new Error('Authentication required');
            }

            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: newMessage.trim()
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Failed to send message: ${response.status}`);
            }

            const data = await response.json();
            if (data.message) {
                // Add new message to the list
                setMessages(prev => [...prev, data.message]);
                setNewMessage('');
            }
        } catch (err) {
            console.error('Error sending message:', err);
            setError(err.message || 'Failed to send message');
        } finally {
            setIsSending(false);
        }
    };

    // Initial load
    useEffect(() => {
        loadMessages();
    }, []);

    // Auto-refresh messages every 5 seconds
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            loadMessages();
        }, 5000);

        return () => clearInterval(interval);
    }, [autoRefresh]);

    // Format timestamp
    const formatTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // Check if message is from current user
    const isOwnMessage = (message) => {
        return message.senderId === user?.id || message.sender?.id === user?.id;
    };

    // Get user display name
    const getDisplayName = (sender) => {
        if (!sender) return 'Unknown';
        return sender.name || sender.email || 'Unknown';
    };

    // Get user initials for avatar
    const getInitials = (sender) => {
        if (!sender) return '?';
        const name = sender.name || sender.email || '';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name[0]?.toUpperCase() || '?';
    };

    if (isLoading) {
        return (
            <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} p-4`}>
                <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                        <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading messages...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'} flex flex-col h-[600px]`}>
            {/* Header */}
            <div className={`${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'} border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10`}>
                <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-full ${isDark ? 'bg-primary-700' : 'bg-primary-600'} flex items-center justify-center text-white font-semibold`}>
                        <i className="fas fa-comments"></i>
                    </div>
                    <div>
                        <h3 className={`font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Employee Chat</h3>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`p-2 rounded-lg transition-colors ${
                            autoRefresh
                                ? `${isDark ? 'bg-primary-700 text-white' : 'bg-primary-100 text-primary-700'}`
                                : `${isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
                        }`}
                        title={autoRefresh ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
                    >
                        <i className={`fas fa-${autoRefresh ? 'sync' : 'pause'} text-sm`}></i>
                    </button>
                    <button
                        onClick={loadMessages}
                        className={`p-2 rounded-lg transition-colors ${isDark ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}
                        title="Refresh messages"
                    >
                        <i className="fas fa-sync-alt text-sm"></i>
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className={`${isDark ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} border-b px-4 py-2 text-sm ${isDark ? 'text-red-200' : 'text-red-800'}`}>
                    <i className="fas fa-exclamation-circle mr-2"></i>
                    {error}
                </div>
            )}

            {/* Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <i className={`fas fa-comments text-4xl ${isDark ? 'text-gray-600' : 'text-gray-400'} mb-3`}></i>
                            <p className={`${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No messages yet. Be the first to say something!</p>
                        </div>
                    </div>
                ) : (
                    messages.map((message) => {
                        const isOwn = isOwnMessage(message);
                        const sender = message.sender || {};
                        const displayName = getDisplayName(sender);

                        return (
                            <div
                                key={message.id}
                                className={`flex items-start space-x-3 ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}
                            >
                                {/* Avatar */}
                                <div className={`flex-shrink-0 w-10 h-10 rounded-full ${isOwn ? (isDark ? 'bg-primary-700' : 'bg-primary-600') : (isDark ? 'bg-gray-700' : 'bg-gray-300')} flex items-center justify-center text-white font-semibold text-sm`}>
                                    {sender.avatar ? (
                                        <img src={sender.avatar} alt={displayName} className="w-full h-full rounded-full object-cover" />
                                    ) : (
                                        <span>{getInitials(sender)}</span>
                                    )}
                                </div>

                                {/* Message Content */}
                                <div className={`flex-1 ${isOwn ? 'items-end' : 'items-start'} flex flex-col ${isOwn ? 'text-right' : 'text-left'} max-w-[70%]`}>
                                    <div className={`flex items-center space-x-2 mb-1 ${isOwn ? 'flex-row-reverse space-x-reverse' : ''}`}>
                                        <span className={`font-medium text-sm ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>
                                            {isOwn ? 'You' : displayName}
                                        </span>
                                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                                            {formatTime(message.createdAt)}
                                        </span>
                                        {sender.role && (
                                            <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                                                {sender.role}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`rounded-lg px-4 py-2 ${
                                        isOwn
                                            ? `${isDark ? 'bg-primary-700 text-white' : 'bg-primary-600 text-white'}`
                                            : `${isDark ? 'bg-gray-700 text-gray-100' : 'bg-gray-100 text-gray-900'}`
                                    }`}>
                                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className={`${isDark ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'} border-t px-4 py-3`}>
                <form onSubmit={sendMessage} className="flex items-end space-x-2">
                    <div className="flex-1">
                        <textarea
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage(e);
                                }
                            }}
                            placeholder="Type your message... (Press Enter to send, Shift+Enter for new line)"
                            rows={2}
                            maxLength={5000}
                            className={`w-full px-4 py-2 rounded-lg border resize-none ${
                                isDark
                                    ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            } focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                            disabled={isSending}
                        />
                        <div className="text-xs text-right mt-1 text-gray-500">
                            {newMessage.length}/5000
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || isSending}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                            !newMessage.trim() || isSending
                                ? `${isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`
                                : `${isDark ? 'bg-primary-600 hover:bg-primary-700 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'}`
                        }`}
                    >
                        {isSending ? (
                            <i className="fas fa-spinner fa-spin"></i>
                        ) : (
                            <>
                                <i className="fas fa-paper-plane mr-2"></i>
                                Send
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

// Make available globally
try {
    window.EmployeeChat = EmployeeChat;
    console.log('✅ EmployeeChat.jsx loaded and registered on window.EmployeeChat');
} catch (error) {
    console.error('❌ EmployeeChat.jsx: Error registering component:', error);
}

