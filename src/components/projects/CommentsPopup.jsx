// Get React hooks from window
const { useState, useEffect, useRef } = React;

// Inline Comments Popup Component
const CommentsPopup = ({ task, isSubtask, parentId, onAddComment, onClose, position, triggerPosition }) => {
    const comments = task.comments || [];
    const recentComments = comments.slice(-3).reverse(); // Show last 3 comments
    const commentsContainerRef = useRef(null);
    const popupRef = useRef(null);
    
    // Calculate speech bubble tail position
    const [tailStyle, setTailStyle] = useState({});
    
    useEffect(() => {
        if (popupRef.current && triggerPosition) {
            // Small delay to ensure popup is fully rendered
            const timeoutId = setTimeout(() => {
                if (!popupRef.current) return;
                
                const popupRect = popupRef.current.getBoundingClientRect();
                const scrollX = window.scrollX ?? window.pageXOffset ?? 0;
                const scrollY = window.scrollY ?? window.pageYOffset ?? 0;
                
                // Calculate relative position of trigger to popup
                const triggerX = triggerPosition.left - (popupRect.left - scrollX);
                const triggerY = triggerPosition.top - (popupRect.top - scrollY);
                
                // Determine which side the tail should be on
                // If trigger is above the popup, tail goes on top
                // If trigger is below, tail goes on bottom
                // If trigger is to the left, tail goes on left
                // If trigger is to the right, tail goes on right
                
                const isAbove = triggerY < 0;
                const isBelow = triggerY > popupRect.height;
                const isLeft = triggerX < 0;
                const isRight = triggerX > popupRect.width;
                
                let tailStyle = {};
                
                if (isAbove) {
                    // Tail on top, pointing up
                    tailStyle = {
                        top: '-8px',
                        left: `${Math.max(12, Math.min(popupRect.width - 12, triggerX))}px`,
                        transform: 'translateX(-50%)',
                        borderBottom: '8px solid white',
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderTop: 'none',
                        filter: 'drop-shadow(0 -1px 1px rgba(0, 0, 0, 0.1))'
                    };
                } else if (isBelow) {
                    // Tail on bottom, pointing down
                    tailStyle = {
                        bottom: '-8px',
                        left: `${Math.max(12, Math.min(popupRect.width - 12, triggerX))}px`,
                        transform: 'translateX(-50%)',
                        borderTop: '8px solid white',
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderBottom: 'none',
                        filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1))'
                    };
                } else if (isLeft) {
                    // Tail on left, pointing left
                    tailStyle = {
                        left: '-8px',
                        top: `${Math.max(12, Math.min(popupRect.height - 12, triggerY))}px`,
                        transform: 'translateY(-50%)',
                        borderRight: '8px solid white',
                        borderTop: '8px solid transparent',
                        borderBottom: '8px solid transparent',
                        borderLeft: 'none',
                        filter: 'drop-shadow(-1px 0 1px rgba(0, 0, 0, 0.1))'
                    };
                } else if (isRight) {
                    // Tail on right, pointing right
                    tailStyle = {
                        right: '-8px',
                        top: `${Math.max(12, Math.min(popupRect.height - 12, triggerY))}px`,
                        transform: 'translateY(-50%)',
                        borderLeft: '8px solid white',
                        borderTop: '8px solid transparent',
                        borderBottom: '8px solid transparent',
                        borderRight: 'none',
                        filter: 'drop-shadow(1px 0 1px rgba(0, 0, 0, 0.1))'
                    };
                } else {
                    // Default: tail on top if trigger is roughly above center
                    tailStyle = {
                        top: '-8px',
                        left: `${Math.max(12, Math.min(popupRect.width - 12, triggerX))}px`,
                        transform: 'translateX(-50%)',
                        borderBottom: '8px solid white',
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderTop: 'none',
                        filter: 'drop-shadow(0 -1px 1px rgba(0, 0, 0, 0.1))'
                    };
                }
                
                setTailStyle(tailStyle);
            }, 10); // Small delay to ensure DOM is ready
            
            return () => clearTimeout(timeoutId);
        }
    }, [position, triggerPosition]);

    // Auto-scroll to last comment when popup opens
    useEffect(() => {
        if (commentsContainerRef.current && recentComments.length > 0) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (commentsContainerRef.current) {
                    commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [task?.id, recentComments.length]); // Re-scroll when task changes or comments update

    const handleAdd = (commentText) => {
        if (commentText && commentText.trim()) {
            onAddComment(task.id, commentText, isSubtask, parentId);
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 z-40" 
                onClick={onClose}
            ></div>
            
            {/* Popup */}
            <div 
                ref={popupRef}
                className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 w-80"
                style={{ 
                    top: position.top,
                    left: position.left,
                    maxHeight: '400px'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Speech bubble tail */}
                {triggerPosition && Object.keys(tailStyle).length > 0 && (
                    <div
                        className="absolute w-0 h-0"
                        style={tailStyle}
                    />
                )}
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                    <div className="flex items-center gap-2">
                        <i className="fas fa-comments text-primary-600 text-sm"></i>
                        <span className="text-sm font-semibold text-gray-800">Comments ({comments.length})</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1"
                    >
                        <i className="fas fa-times text-xs"></i>
                    </button>
                </div>

                {/* Comments List */}
                <div ref={commentsContainerRef} className="max-h-48 overflow-y-auto px-3 py-2">
                    {recentComments.length === 0 ? (
                        <div className="text-center py-4 text-gray-400">
                            <i className="fas fa-comment text-2xl mb-1"></i>
                            <p className="text-xs">No comments yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentComments.map((comment) => (
                                <div 
                                    key={comment.id} 
                                    data-comment-id={comment.id}
                                    id={comment.id ? `comment-${comment.id}` : undefined}
                                    className="bg-gray-50/30 rounded-lg p-2 border border-gray-200/30"
                                >
                                    <div className="flex items-start gap-2 mb-1">
                                        <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-[8px] flex-shrink-0">
                                            {(comment.author || comment.createdBy || 'U').charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-gray-800 text-[10px]">{(comment.author || comment.createdBy || 'User')}{(comment.authorEmail || comment.createdByEmail) ? ` (${comment.authorEmail || comment.createdByEmail})` : ''}</span>
                                                <span className="text-[9px] text-gray-500">{new Date(comment.timestamp || comment.date || comment.createdAt).toLocaleString('en-ZA', {
                                                    month: 'short',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    year: 'numeric'
                                                })}</span>
                                            </div>
                                            <p className="text-xs text-gray-700 mt-0.5 break-words">{comment.text}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {comments.length > 3 && (
                                <p className="text-xs text-gray-500 text-center py-1">
                                    + {comments.length - 3} more comment{comments.length - 3 > 1 ? 's' : ''}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Add Comment */}
                <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                    {window.CommentInputWithMentions ? (
                        <window.CommentInputWithMentions
                            onSubmit={handleAdd}
                            placeholder="Add a comment... (@mention users, Shift+Enter for new line, Enter to send)"
                            rows={2}
                            taskTitle={task.title || 'Task'}
                            taskLink={`/projects?task=${task.id}`}
                            showButton={true}
                        />
                    ) : (
                        <textarea
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            rows="2"
                            placeholder="Add a comment... (Loading mention support...)"
                            disabled
                        ></textarea>
                    )}
                </div>
            </div>
        </>
    );
};

// Make available globally
window.CommentsPopup = CommentsPopup;
