// Get React hooks from window
const { useState } = React;

// Inline Comments Popup Component
const CommentsPopup = ({ task, isSubtask, parentId, onAddComment, onClose, position }) => {
    const comments = task.comments || [];
    const recentComments = comments.slice(-3).reverse(); // Show last 3 comments

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
                className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 w-80"
                style={{ 
                    top: position.top,
                    left: position.left,
                    maxHeight: '400px'
                }}
                onClick={(e) => e.stopPropagation()}
            >
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
                <div className="max-h-48 overflow-y-auto px-3 py-2">
                    {recentComments.length === 0 ? (
                        <div className="text-center py-4 text-gray-400">
                            <i className="fas fa-comment text-2xl mb-1"></i>
                            <p className="text-xs">No comments yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentComments.map((comment) => (
                                <div key={comment.id} className="bg-gray-50 rounded-lg p-2 border border-gray-100">
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
                            placeholder="Add a comment... (@mention users, Enter to send)"
                            rows={2}
                            taskTitle={task.title || 'Task'}
                            taskLink={`/projects?task=${task.id}`}
                        />
                    ) : (
                        <textarea
                            className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                            rows="2"
                            placeholder="Add a comment... (Loading mention support...)"
                            disabled
                        ></textarea>
                    )}
                    <div className="flex justify-end mt-1.5">
                        {window.CommentInputWithMentions && (
                            <small className="text-[9px] text-gray-500 mr-2">
                                Tip: @mention users to notify them
                            </small>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

// Make available globally
window.CommentsPopup = CommentsPopup;
