// Comment input with @mention support
const { useState, useEffect, useRef } = React;

const CommentInputWithMentions = ({ 
    onSubmit, 
    placeholder = "Add a comment... (Enter to send)",
    rows = 2,
    autoFocus = false,
    taskTitle = '',
    taskLink = '',
    showButton = false
}) => {
    const [comment, setComment] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [mentionStart, setMentionStart] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [allUsers, setAllUsers] = useState([]);
    const textareaRef = useRef(null);
    const suggestionsRef = useRef(null);
    const { isDark } = window.useTheme();
    
    // Load all users on mount
    useEffect(() => {
        loadUsers();
    }, []);
    
    const loadUsers = async () => {
        try {
            const token = window.storage?.getToken?.();
            if (!token) return;
            
            const response = await fetch('/api/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                const users = data.data?.users || data.users || [];
                setAllUsers(users);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };
    
    const handleChange = (e) => {
        const value = e.target.value;
        const cursorPosition = e.target.selectionStart;
        
        setComment(value);
        
        // Check for @mention trigger
        const textBeforeCursor = value.substring(0, cursorPosition);
        const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
        
        if (mentionMatch) {
            // Show suggestions
            const query = mentionMatch[1].toLowerCase();
            const filtered = allUsers.filter(user => {
                const name = (user.name || '').toLowerCase();
                const email = (user.email || '').toLowerCase();
                return name.includes(query) || email.includes(query);
            });
            
            if (filtered.length > 0 && !showSuggestions) {
                setMentionStart(mentionMatch.index);
                setSuggestions(filtered);
                setShowSuggestions(true);
                setSelectedIndex(0);
            } else if (filtered.length > 0) {
                setSuggestions(filtered);
                setSelectedIndex(0);
            } else {
                setShowSuggestions(false);
            }
        } else {
            setShowSuggestions(false);
        }
    };
    
    const insertMention = (user) => {
        if (!mentionStart && mentionStart !== 0) return;
        
        const beforeMention = comment.substring(0, mentionStart);
        const afterMention = comment.substring(mentionStart + comment.substring(mentionStart).indexOf('@'));
        
        // Find where the current @mention ends
        const currentMentionMatch = comment.substring(mentionStart).match(/@(\w*)/);
        if (currentMentionMatch) {
            const mentionEnd = mentionStart + currentMentionMatch.index + currentMentionMatch[0].length;
            const afterMentionCorrect = comment.substring(mentionEnd);
            
            const newComment = beforeMention + `@${user.name} ` + afterMentionCorrect;
            setComment(newComment);
        }
        
        setShowSuggestions(false);
        setMentionStart(null);
        setSuggestions([]);
        
        // Focus back on textarea
        setTimeout(() => {
            if (textareaRef.current) {
                textareaRef.current.focus();
            }
        }, 0);
    };
    
    const handleKeyDown = (e) => {
        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => 
                    prev < suggestions.length - 1 ? prev + 1 : prev
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => prev > 0 ? prev - 1 : 0);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                insertMention(suggestions[selectedIndex]);
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };
    
    const handleSubmit = async () => {
        if (!comment.trim()) return;
        
        // Process @mentions if MentionHelper is available
        if (window.MentionHelper && window.MentionHelper.hasMentions(comment)) {
            const currentUser = window.storage?.getUserInfo() || {};
            await window.MentionHelper.processMentions(
                comment,
                taskTitle || 'a comment',
                taskLink || '#',
                currentUser.name || currentUser.email || 'Unknown',
                allUsers
            );
        }
        
        onSubmit(comment);
        setComment('');
    };
    
    return (
        <>
            <div className="relative">
                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    className={`w-full px-2 py-1.5 text-xs border ${isDark ? 'border-gray-600 bg-gray-800 text-gray-200' : 'border-gray-300 bg-white'} rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none`}
                    rows={rows}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                />
                
                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div 
                        ref={suggestionsRef}
                        className={`absolute z-50 mt-1 w-64 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg shadow-lg max-h-60 overflow-y-auto`}
                        style={{ bottom: '100%', left: 0 }}
                    >
                        {suggestions.map((user, index) => (
                            <div
                                key={user.id}
                                onClick={() => insertMention(user)}
                                className={`px-3 py-2 cursor-pointer ${
                                    index === selectedIndex 
                                        ? isDark ? 'bg-gray-700' : 'bg-gray-100'
                                        : isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'
                                }`}
                            >
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-sm mr-2">
                                        {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className={`${isDark ? 'text-gray-200' : 'text-gray-900'} font-medium truncate`}>
                                            {user.name || user.email}
                                        </div>
                                        {user.email && user.name && (
                                            <div className={`${isDark ? 'text-gray-400' : 'text-gray-500'} text-xs truncate`}>
                                                {user.email}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {/* Optional Send Button */}
            {showButton && (
                <div className="flex justify-end mt-1.5">
                    <button
                        onClick={handleSubmit}
                        disabled={!comment.trim()}
                        className="px-2.5 py-1 bg-primary-600 text-white text-[10px] rounded hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <i className="fas fa-paper-plane mr-1"></i>
                        Send
                    </button>
                </div>
            )}
        </>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.CommentInputWithMentions = CommentInputWithMentions;
}

