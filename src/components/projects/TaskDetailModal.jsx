// Get React hooks from window
const { useState, useEffect, useRef } = React;

const TaskDetailModal = ({ 
    task, 
    parentTask, 
    customFieldDefinitions, 
    taskLists,
    project,
    users: usersProp,
    onUpdate, 
    onClose,
    onAddSubtask,
    onViewSubtask,
    onDeleteSubtask,
    onDeleteTask
}) => {
    const isCreating = !task || !task.id;
    const isSubtask = !!parentTask;
    
    const [activeTab, setActiveTab] = useState('details'); // details, comments, attachments, checklist
    const [editedTask, setEditedTask] = useState(task || {
        title: '',
        description: '',
        assignee: '',
        dueDate: '',
        priority: 'Medium',
        listId: task?.listId || (taskLists && taskLists[0]?.id) || 1,
        customFields: {},
        comments: [],
        attachments: [],
        subtasks: [],
        checklist: [],
        tags: [],
        estimatedHours: '',
        actualHours: '',
        status: 'To Do',
        blockedBy: '',
        dependencies: [],
        subscribers: [] // Track users subscribed to task conversation
    });
    const [newComment, setNewComment] = useState('');
    // CRITICAL: Initialize comments from task, ensuring it's always an array
    const [comments, setComments] = useState(() => {
        const initialComments = Array.isArray(task?.comments) ? task.comments : [];
        if (initialComments.length > 0) {
            console.log('📝 TaskDetailModal: Initialized with', initialComments.length, 'comments');
        }
        return initialComments;
    });
    const [attachments, setAttachments] = useState(task?.attachments || []);
    const [checklist, setChecklist] = useState(task?.checklist || []);
    
    // Initialize subscribers from task if it exists
    useEffect(() => {
        if (task?.subscribers) {
            setEditedTask(prev => ({
                ...prev,
                subscribers: task.subscribers
            }));
        }
    }, [task?.subscribers]);
    const [newChecklistItem, setNewChecklistItem] = useState('');
    const [newTag, setNewTag] = useState('');
    const [tags, setTags] = useState(task?.tags || []);
    const [users, setUsers] = useState(usersProp || []);
    const previousTaskIdRef = useRef(task?.id);
    const [mentionQuery, setMentionQuery] = useState('');
    const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
    
    const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const commentTextareaRef = useRef(null);
    const mentionSuggestionsRef = useRef(null);
    const commentsContainerRef = useRef(null);
    const leftContentRef = useRef(null);
    const refreshIntervalRef = useRef(null);
    const lastCommentAddTimeRef = useRef(null); // Track when comment was added to prevent refresh race condition
    
    // NEW: Load comments from TaskComment table API
    const loadCommentsFromAPI = async () => {
        if (!task?.id || !project?.id) return;
        
        try {
            const taskId = String(task.id);
            const projectId = String(project.id);
            const url = '/task-comments?taskId=' + encodeURIComponent(taskId) + '&projectId=' + encodeURIComponent(projectId);
            const response = await window.DatabaseAPI.makeRequest(url);
            const data = await response.json();
            
            if (data.comments && Array.isArray(data.comments)) {
                // Transform API comments to match expected format
                const formattedComments = data.comments.map(c => ({
                    id: c.id,
                    text: c.text,
                    author: c.author,
                    authorId: c.authorId,
                    userName: c.userName || c.author,
                    authorEmail: c.userName,
                    timestamp: c.createdAt,
                    date: new Date(c.createdAt).toLocaleString(),
                    createdAt: c.createdAt,
                    updatedAt: c.updatedAt
                }));
                
                // Merge with any JSON comments (for backward compatibility during migration)
                const jsonComments = Array.isArray(task.comments) ? task.comments : [];
                const allComments = [...formattedComments, ...jsonComments];
                
                // Deduplicate by ID or text+author combination
                const uniqueComments = Array.from(
                    new Map(
                        allComments.map(c => {
                            const key = c.id || (c.text + '-' + c.author + '-' + (c.timestamp || c.date || ''));
                            return [key, c];
                        })
                    ).values()
                );
                
                // Sort by timestamp/date
                uniqueComments.sort((a, b) => {
                    const timeA = new Date(a.timestamp || a.date || a.createdAt || 0).getTime();
                    const timeB = new Date(b.timestamp || b.date || b.createdAt || 0).getTime();
                    return timeA - timeB;
                });
                
                setComments(uniqueComments);
                console.log('✅ Loaded comments from API:', {
                    taskId: task.id,
                    apiComments: formattedComments.length,
                    jsonComments: jsonComments.length,
                    totalComments: uniqueComments.length
                });
            }
        } catch (error) {
            console.warn('⚠️ Failed to load comments from API, using JSON fallback:', error);
            // Fallback to JSON comments
            const jsonComments = Array.isArray(task.comments) ? task.comments : [];
            setComments(jsonComments);
        }
    };
    
    // Load comments when task changes
    useEffect(() => {
        if (task?.id && project?.id) {
            loadCommentsFromAPI();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [task?.id, project?.id]);

    // Refresh task data from database when modal opens and periodically while open
    // This ensures comments and checklists added by other users are visible
    useEffect(() => {
        if (!task?.id || !project?.id) return;

        const refreshTaskData = async () => {
            try {
                // Skip refresh if a comment was just added (within last 3 seconds)
                // This prevents race condition where refresh overwrites newly added comments
                if (lastCommentAddTimeRef.current && (Date.now() - lastCommentAddTimeRef.current) < 3000) {
                    console.log('⏸️ TaskDetailModal: Skipping refresh - comment recently added');
                    return;
                }
                
                // Get the latest project data from database
                if (window.DatabaseAPI?.getProject) {
                    const response = await window.DatabaseAPI.getProject(project.id);
                    const updatedProject = response?.data?.project || response?.project || response?.data;
                    
                    if (updatedProject?.tasks && Array.isArray(updatedProject.tasks)) {
                        // Find the updated task in the project
                        let updatedTask = updatedProject.tasks.find(t => t.id === task.id);
                        
                        // Also check subtasks
                        if (!updatedTask) {
                            for (const parentTask of updatedProject.tasks) {
                                if (parentTask.subtasks && Array.isArray(parentTask.subtasks)) {
                                    const foundSubtask = parentTask.subtasks.find(st => st.id === task.id);
                                    if (foundSubtask) {
                                        updatedTask = foundSubtask;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // If we found an updated task, check if comments or checklist have changed
                        if (updatedTask) {
                            // CRITICAL: Compare against local comments state, not just task prop
                            // This ensures we don't lose comments that are in local state but not yet in prop
                            const currentComments = Array.isArray(comments) ? comments : [];
                            const updatedComments = Array.isArray(updatedTask.comments) ? updatedTask.comments : [];
                            const currentChecklist = Array.isArray(task.checklist) ? task.checklist : [];
                            const updatedChecklist = Array.isArray(updatedTask.checklist) ? updatedTask.checklist : [];
                            
                            // Get current comment IDs for comparison
                            const currentCommentIds = new Set(currentComments.map(c => c.id).filter(Boolean));
                            const updatedCommentIds = new Set(updatedComments.map(c => c.id).filter(Boolean));
                            
                            // CRITICAL: Check if we have local comments that aren't in the database yet
                            // This can happen if refresh runs before database save completes
                            const hasLocalCommentsNotInDB = currentComments.length > updatedComments.length ||
                                Array.from(currentCommentIds).some(id => !updatedCommentIds.has(id));
                            
                            // Check if there are new comments from database (by ID comparison)
                            const hasNewComments = updatedComments.length > currentComments.length ||
                                Array.from(updatedCommentIds).some(id => !currentCommentIds.has(id));
                            
                            // If we have local comments not in DB, don't refresh yet (wait for save to complete)
                            if (hasLocalCommentsNotInDB && !hasNewComments) {
                                console.log('⏸️ TaskDetailModal: Skipping refresh - local comments not yet saved to DB', {
                                    localCount: currentComments.length,
                                    dbCount: updatedComments.length,
                                    localIds: Array.from(currentCommentIds),
                                    dbIds: Array.from(updatedCommentIds)
                                });
                                return;
                            }
                            
                            // Check if any existing comments have changed
                            const commentsChanged = updatedComments.some(updatedComment => {
                                if (!updatedComment.id) return false;
                                const currentComment = currentComments.find(c => c.id === updatedComment.id);
                                return !currentComment || 
                                       updatedComment.text !== currentComment.text ||
                                       updatedComment.timestamp !== currentComment.timestamp;
                            });
                            
                            // Check if checklist has changed (by ID comparison)
                            const currentChecklistIds = new Set(currentChecklist.map(item => item.id).filter(Boolean));
                            const updatedChecklistIds = new Set(updatedChecklist.map(item => item.id).filter(Boolean));
                            const hasNewChecklistItems = updatedChecklist.length > currentChecklist.length ||
                                Array.from(updatedChecklistIds).some(id => !currentChecklistIds.has(id));
                            
                            const checklistChanged = updatedChecklist.some(updatedItem => {
                                if (!updatedItem.id) return false;
                                const currentItem = currentChecklist.find(item => item.id === updatedItem.id);
                                return !currentItem ||
                                       updatedItem.completed !== currentItem.completed ||
                                       updatedItem.text !== currentItem.text;
                            });
                            
                            // Always update if there are more comments/checklist items or if anything changed
                            if (hasNewComments || commentsChanged || hasNewChecklistItems || checklistChanged) {
                                console.log('🔄 TaskDetailModal: Found updated task data, refreshing...', {
                                    taskId: task.id,
                                    currentComments: currentComments.length,
                                    updatedComments: updatedComments.length,
                                    hasNewComments,
                                    commentsChanged,
                                    hasNewChecklistItems,
                                    checklistChanged,
                                    currentCommentIds: Array.from(currentCommentIds),
                                    updatedCommentIds: Array.from(updatedCommentIds)
                                });
                                
                                // Dispatch event to parent to update the task
                                window.dispatchEvent(new CustomEvent('refreshTaskInModal', {
                                    detail: { taskId: task.id, updatedTask }
                                }));
                            } else {
                                console.log('🔍 TaskDetailModal: No changes detected', {
                                    taskId: task.id,
                                    currentComments: currentComments.length,
                                    updatedComments: updatedComments.length
                                });
                            }
                        } else {
                            console.warn('⚠️ TaskDetailModal: Task not found in updated project data', {
                                taskId: task.id,
                                projectId: project.id
                            });
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ TaskDetailModal: Failed to refresh task data:', error);
            }
        };

        // Refresh immediately when modal opens
        refreshTaskData();

        // Set up periodic refresh - more frequent when on comments tab
        const refreshInterval = activeTab === 'comments' ? 2000 : 5000; // 2 seconds on comments tab, 5 seconds otherwise
        refreshIntervalRef.current = setInterval(refreshTaskData, refreshInterval);

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
                refreshIntervalRef.current = null;
            }
        };
    }, [task?.id, project?.id, activeTab]); // Include activeTab to adjust refresh rate

    // Listen for refresh events from parent
    useEffect(() => {
        const handleRefreshTask = (event) => {
            const { taskId, updatedTask } = event.detail || {};
            if (taskId && updatedTask && taskId === task?.id) {
                console.log('🔄 TaskDetailModal: Received refresh event, updating task data');
                // The task prop will be updated by the parent, which will trigger the sync useEffect
            }
        };

        window.addEventListener('refreshTaskInModal', handleRefreshTask);
        return () => {
            window.removeEventListener('refreshTaskInModal', handleRefreshTask);
        };
    }, [task?.id]);

    // Sync all task data when task prop changes - CRITICAL for persistence
    useEffect(() => {
        if (task) {
            const isNewTask = previousTaskIdRef.current !== task.id;
            previousTaskIdRef.current = task.id;
            
            // Sync comments - ALWAYS MERGE by ID to prevent losing comments
            // CRITICAL: Never overwrite existing comments with incomplete data
            setComments(prevComments => {
                // Ensure prevComments is always an array
                const safePrevComments = Array.isArray(prevComments) ? prevComments : [];
                
                // If it's a new task, use the new task's comments (but still validate)
                if (isNewTask) {
                    if (Array.isArray(task.comments) && task.comments.length > 0) {
                        return task.comments;
                    }
                    // If new task has no comments, return empty array
                    return [];
                }
                
                // Same task - ALWAYS merge to preserve all comments
                // Never overwrite existing comments, always merge by ID
                if (safePrevComments.length > 0) {
                    // We have existing comments - ALWAYS merge, never replace
                    const commentsMap = new Map();
                    
                    // Start with all existing comments (CRITICAL: preserve local state)
                    safePrevComments.forEach(comment => {
                        if (comment.id) {
                            commentsMap.set(comment.id, comment);
                        } else {
                            // Comments without IDs - keep them by adding a temporary key
                            commentsMap.set(`temp-${Date.now()}-${Math.random()}`, comment);
                        }
                    });
                    
                    const existingCount = safePrevComments.length;
                    const incomingCount = Array.isArray(task.comments) ? task.comments.length : 0;
                    
                    // Merge in incoming comments (update existing or add new)
                    // CRITICAL: Only update if incoming comment exists, never remove local comments
                    // CRITICAL: Handle comments without IDs (old tasks) by matching on content + timestamp
                    if (Array.isArray(task.comments) && task.comments.length > 0) {
                        task.comments.forEach(incomingComment => {
                            if (incomingComment.id) {
                                // Update existing or add new comment
                                // If local comment exists, prefer local version if it's newer (by timestamp)
                                const existingComment = commentsMap.get(incomingComment.id);
                                if (existingComment && existingComment.timestamp && incomingComment.timestamp) {
                                    const existingTime = new Date(existingComment.timestamp).getTime();
                                    const incomingTime = new Date(incomingComment.timestamp).getTime();
                                    // Only update if incoming is newer (more than 1 second difference)
                                    if (incomingTime > existingTime + 1000) {
                                        commentsMap.set(incomingComment.id, incomingComment);
                                    }
                                    // Otherwise keep existing (local) comment
                                } else {
                                    // No existing comment with this ID, add it
                                    commentsMap.set(incomingComment.id, incomingComment);
                                }
                            } else {
                                // CRITICAL: Handle comments without IDs (old tasks)
                                // Match by text + timestamp to avoid duplicates
                                const incomingText = incomingComment.text || incomingComment.message || '';
                                const incomingTimestamp = incomingComment.timestamp || incomingComment.date || '';
                                
                                // Check if we already have this comment (by content + timestamp)
                                let foundMatch = false;
                                for (const [key, existingComment] of commentsMap.entries()) {
                                    const existingText = existingComment.text || existingComment.message || '';
                                    const existingTimestamp = existingComment.timestamp || existingComment.date || '';
                                    
                                    // Match if text and timestamp are the same
                                    if (incomingText === existingText && incomingTimestamp === existingTimestamp) {
                                        foundMatch = true;
                                        break;
                                    }
                                }
                                
                                // Only add if we don't already have it
                                if (!foundMatch) {
                                    // Generate a stable ID for comments without IDs to prevent duplicates
                                    const stableId = `legacy-${incomingText.substring(0, 20)}-${incomingTimestamp}`.replace(/[^a-zA-Z0-9-]/g, '');
                                    commentsMap.set(stableId, incomingComment);
                                }
                            }
                        });
                    }
                    
                    // CRITICAL: If incoming has fewer comments than local state, keep all local comments
                    // This prevents losing comments that were just added but not yet in database
                    if (incomingCount < existingCount) {
                        console.warn('⚠️ TaskDetailModal: Incoming comments count is less than local state, preserving all local comments', {
                            taskId: task.id,
                            localCount: existingCount,
                            incomingCount: incomingCount,
                            localIds: safePrevComments.map(c => c.id).filter(Boolean),
                            incomingIds: Array.isArray(task.comments) ? task.comments.map(c => c.id).filter(Boolean) : []
                        });
                    }
                    
                    const mergedCount = commentsMap.size;
                    
                    // Defensive logging to detect if comments are lost
                    if (mergedCount < existingCount) {
                        console.warn('⚠️ TaskDetailModal: Potential comment loss detected!', {
                            taskId: task.id,
                            existingCount,
                            incomingCount,
                            mergedCount,
                            existingIds: safePrevComments.map(c => c.id).filter(Boolean),
                            incomingIds: Array.isArray(task.comments) ? task.comments.map(c => c.id).filter(Boolean) : []
                        });
                    }
                    
                    // Return merged comments (preserving all existing + any new/updated from server)
                    const mergedComments = Array.from(commentsMap.values());
                    if (mergedComments.length !== existingCount || incomingCount > 0) {
                        console.log('🔄 TaskDetailModal: Merged comments', {
                            taskId: task.id,
                            before: existingCount,
                            incoming: incomingCount,
                            after: mergedComments.length
                        });
                    }
                    return mergedComments;
                }
                
                // No existing comments - use incoming if available
                if (Array.isArray(task.comments)) {
                    return task.comments;
                }
                
                // Fallback: return empty array
                return [];
            });
            
            // Sync attachments
            if (Array.isArray(task.attachments)) {
                setAttachments(task.attachments);
            } else if (task.attachments === undefined || task.attachments === null) {
                setAttachments([]);
            }
            
            // Sync checklist
            if (Array.isArray(task.checklist)) {
                setChecklist(task.checklist);
            } else if (task.checklist === undefined || task.checklist === null) {
                setChecklist([]);
            }
            
            // Sync tags
            if (Array.isArray(task.tags)) {
                setTags(task.tags);
            } else if (task.tags === undefined || task.tags === null) {
                setTags([]);
            }
            
            // Sync editedTask with all task properties
            // CRITICAL: Exclude comments, checklist, attachments, and tags from editedTask
            // These are managed separately in their own state variables
            const { comments: taskComments, checklist: taskChecklist, attachments: taskAttachments, tags: taskTags, ...taskWithoutArrays } = task;
            setEditedTask(prev => ({
                ...prev,
                ...taskWithoutArrays,
                // Preserve local edits for fields that might be in progress
                title: task.title !== undefined ? task.title : prev.title,
                description: task.description !== undefined ? task.description : prev.description,
                assignee: task.assignee !== undefined ? task.assignee : prev.assignee,
                dueDate: task.dueDate !== undefined ? task.dueDate : prev.dueDate,
                priority: task.priority !== undefined ? task.priority : prev.priority,
                status: task.status !== undefined ? task.status : prev.status,
                listId: task.listId !== undefined ? task.listId : prev.listId,
                customFields: task.customFields !== undefined ? task.customFields : prev.customFields,
                subtasks: Array.isArray(task.subtasks) ? task.subtasks : (prev.subtasks || []),
                estimatedHours: task.estimatedHours !== undefined ? task.estimatedHours : prev.estimatedHours,
                actualHours: task.actualHours !== undefined ? task.actualHours : prev.actualHours,
                blockedBy: task.blockedBy !== undefined ? task.blockedBy : prev.blockedBy,
                dependencies: Array.isArray(task.dependencies) ? task.dependencies : (prev.dependencies || []),
                subscribers: Array.isArray(task.subscribers) ? task.subscribers : (prev.subscribers || [])
            }));
        }
    }, [task?.id, task?.comments, task?.attachments, task?.checklist, task?.tags, task?.subscribers, task?.title, task?.description, task?.assignee, task?.dueDate, task?.priority, task?.status, task?.listId, task?.customFields, task?.subtasks, task?.estimatedHours, task?.actualHours, task?.blockedBy, task?.dependencies]);

    // Update users if prop changes
    useEffect(() => {
        if (usersProp && usersProp.length > 0) {
            setUsers(usersProp);
        }
    }, [usersProp]);

    // Fetch users on component mount
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                if (window.DatabaseAPI?.getUsers) {
                    const response = await window.DatabaseAPI.getUsers();
                    const usersList = response?.data?.users || response?.data?.data?.users || 
                                     (Array.isArray(response?.data) ? response.data : []) ||
                                     (Array.isArray(response) ? response : []);
                    setUsers(usersList.filter(u => u.status !== 'inactive'));
                } else if (window.api?.getUsers) {
                    const response = await window.api.getUsers();
                    const usersList = response?.data?.users || response?.data?.data?.users || 
                                     (Array.isArray(response?.data) ? response.data : []) ||
                                     (Array.isArray(response) ? response : []);
                    setUsers(usersList.filter(u => u.status !== 'inactive'));
                }
            } catch (error) {
                console.error('Error fetching users:', error);
            }
        };
        fetchUsers();
    }, []);

    // Auto-scroll to last comment when comments tab is opened or comments change
    useEffect(() => {
        if (activeTab === 'comments' && commentsContainerRef.current && comments.length > 0) {
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (commentsContainerRef.current) {
                    // Scroll to bottom to show the last comment
                    commentsContainerRef.current.scrollTop = commentsContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [activeTab, comments.length, comments]); // Re-scroll when tab changes, comments count changes, or comments array updates

    // Listen for scrollToComment event to scroll to a specific comment (from email links)
    useEffect(() => {
        const handleScrollToComment = (event) => {
            const { commentId, taskId } = event.detail || {};
            if (!commentId) return;
            
            // Verify this is for the current task
            const currentTaskId = editedTask.id || task?.id;
            if (taskId && String(currentTaskId) !== String(taskId)) {
                return; // Not for this task
            }
            
            // Switch to comments tab if not already there
            if (activeTab !== 'comments') {
                setActiveTab('comments');
            }
            
            // Wait for tab switch and DOM update, then scroll to comment
            setTimeout(() => {
                const commentElement = document.querySelector(`[data-comment-id="${commentId}"]`) ||
                                     document.querySelector(`#comment-${commentId}`);
                
                if (commentElement && commentsContainerRef.current) {
                    // Scroll the comment into view within the container
                    commentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // Also scroll the container to ensure visibility
                    if (commentsContainerRef.current) {
                        const containerRect = commentsContainerRef.current.getBoundingClientRect();
                        const commentRect = commentElement.getBoundingClientRect();
                        const scrollTop = commentsContainerRef.current.scrollTop;
                        const commentOffset = commentRect.top - containerRect.top + scrollTop;
                        commentsContainerRef.current.scrollTo({
                            top: commentOffset - 20, // 20px padding from top
                            behavior: 'smooth'
                        });
                    }
                    
                    // Highlight the comment briefly
                    const originalBg = window.getComputedStyle(commentElement).backgroundColor;
                    commentElement.style.transition = 'background-color 0.3s, box-shadow 0.3s';
                    commentElement.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                    commentElement.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.3)';
                    setTimeout(() => {
                        commentElement.style.backgroundColor = originalBg;
                        commentElement.style.boxShadow = '';
                        commentElement.style.transition = '';
                    }, 2000);
                }
            }, activeTab === 'comments' ? 100 : 300); // Shorter delay if already on comments tab
        };
        
        window.addEventListener('scrollToComment', handleScrollToComment);
        return () => window.removeEventListener('scrollToComment', handleScrollToComment);
    }, [activeTab, editedTask.id, task?.id, comments]);

    // Close mention suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (mentionSuggestionsRef.current && !mentionSuggestionsRef.current.contains(event.target) &&
                commentTextareaRef.current && !commentTextareaRef.current.contains(event.target)) {
                setShowMentionSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    const handleSave = () => {
        const title = (editedTask && typeof editedTask.title === 'string') ? editedTask.title : '';
        if (!title.trim()) {
            alert('Please enter a task title');
            return;
        }

        // CRITICAL: Explicitly include comments, checklist, attachments, and tags from current state
        // These are managed separately and must be included in the save
        // ALWAYS use current state, never task.comments prop (which might be stale)
        let commentsToSave = Array.isArray(comments) ? comments : [];
        
        // Defensive check: if we have comments in state but task.comments has more, merge them
        // This is a safety net in case state got out of sync
        // CRITICAL: Handle comments without IDs (old tasks) by matching on content + timestamp
        if (commentsToSave.length > 0 && Array.isArray(task?.comments) && task.comments.length > commentsToSave.length) {
            console.warn('⚠️ TaskDetailModal: State comments count is less than task prop, merging before save', {
                stateCount: commentsToSave.length,
                taskPropCount: task.comments.length
            });
            const commentsMap = new Map();
            
            // Add all comments from state first
            commentsToSave.forEach(c => {
                if (c.id) {
                    commentsMap.set(c.id, c);
                } else {
                    // Comments without IDs - create stable key
                    const text = c.text || c.message || '';
                    const timestamp = c.timestamp || c.date || '';
                    const stableId = `legacy-${text.substring(0, 20)}-${timestamp}`.replace(/[^a-zA-Z0-9-]/g, '');
                    commentsMap.set(stableId, c);
                }
            });
            
            // Merge in comments from task prop
            task.comments.forEach(c => {
                if (c.id) {
                    commentsMap.set(c.id, c);
                } else {
                    // Match by content + timestamp for comments without IDs
                    const text = c.text || c.message || '';
                    const timestamp = c.timestamp || c.date || '';
                    let foundMatch = false;
                    
                    for (const [key, existing] of commentsMap.entries()) {
                        const existingText = existing.text || existing.message || '';
                        const existingTimestamp = existing.timestamp || existing.date || '';
                        if (text === existingText && timestamp === existingTimestamp) {
                            foundMatch = true;
                            break;
                        }
                    }
                    
                    if (!foundMatch) {
                        const stableId = `legacy-${text.substring(0, 20)}-${timestamp}`.replace(/[^a-zA-Z0-9-]/g, '');
                        commentsMap.set(stableId, c);
                    }
                }
            });
            
            commentsToSave = Array.from(commentsMap.values());
        }
        
        const taskToSave = {
            ...editedTask,
            // Explicitly include arrays from current state to ensure persistence
            comments: commentsToSave,
            checklist: Array.isArray(checklist) ? checklist : [],
            attachments: Array.isArray(attachments) ? attachments : [],
            tags: Array.isArray(tags) ? tags : [],
            subtasks: Array.isArray(editedTask.subtasks) ? editedTask.subtasks : [],
            subscribers: Array.isArray(editedTask.subscribers) ? editedTask.subscribers : [],
            id: editedTask.id || Date.now()
        };

        console.log('💾 TaskDetailModal: Saving task with:', {
            id: taskToSave.id,
            title: taskToSave.title,
            commentsCount: taskToSave.comments?.length || 0,
            checklistCount: taskToSave.checklist?.length || 0,
            attachmentsCount: taskToSave.attachments?.length || 0,
            tagsCount: taskToSave.tags?.length || 0,
            commentIds: taskToSave.comments?.map(c => c.id).filter(Boolean) || []
        });

        // Save and close modal (explicit close for Save Changes button)
        onUpdate(taskToSave, { closeModal: true });
        onClose();
    };

    // Parse mentions from comment text (@username format)
    // Handles both @username and @John Doe (with spaces, but only up to the next space or end)
    const parseMentions = (text) => {
        // Match @ followed by word characters or spaces, but stop at space or punctuation
        const mentionRegex = new RegExp('@([\\w]+(?:\\s+[\\w]+)*)', 'g');
        const mentions = [];
        let match;
        while ((match = mentionRegex.exec(text)) !== null) {
            // Remove @ and trim
            const mentionText = match[1].trim();
            if (mentionText) {
                mentions.push(mentionText);
            }
        }
        return mentions;
    };

    // Find users by name or email (case-insensitive partial match)
    const findUsersByMention = (mentionText) => {
        if (!mentionText) return [];
        const query = mentionText.toLowerCase();
        return users.filter(user => {
            const name = (user.name || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            return name.includes(query) || email.includes(query);
        });
    };

    // Get suggested users for mention autocomplete
    const getMentionSuggestions = () => {
        if (!mentionQuery) return users.slice(0, 5); // Show first 5 users if no query
        return findUsersByMention(mentionQuery).slice(0, 5);
    };

    // Handle mention insertion in comment
    const insertMention = (user) => {
        if (!commentTextareaRef.current) return;
        
        const textarea = commentTextareaRef.current;
        const text = newComment;
        const start = mentionStartIndex;
        const end = textarea.selectionStart;
        const before = text.substring(0, start);
        const after = text.substring(end);
        const mentionText = `@${user.name || user.email}`;
        
        setNewComment(before + mentionText + ' ' + after);
        setShowMentionSuggestions(false);
        setMentionQuery('');
        setMentionStartIndex(-1);
        
        // Focus back on textarea and set cursor position
        setTimeout(() => {
            textarea.focus();
            const newPosition = start + mentionText.length + 1;
            textarea.setSelectionRange(newPosition, newPosition);
        }, 0);
    };

    // Handle comment text change and detect @ mentions
    const handleCommentChange = (e) => {
        const text = e.target.value;
        const cursorPos = e.target.selectionStart;
        
        // Find @ symbol before cursor
        const textBeforeCursor = text.substring(0, cursorPos);
        const lastAtIndex = textBeforeCursor.lastIndexOf('@');
        
        if (lastAtIndex !== -1) {
            // Check if there's a space after @ (meaning @ is not for mention)
            const afterAt = textBeforeCursor.substring(lastAtIndex + 1);
            if (!afterAt.includes(' ')) {
                // This is a mention
                const mentionText = afterAt;
                setMentionQuery(mentionText);
                setMentionStartIndex(lastAtIndex);
                setShowMentionSuggestions(true);
                
                // Position suggestions directly below the textarea
                // Using simple positioning - just below the textarea
                setMentionPosition({
                    top: 0, // Will be overridden by CSS
                    left: 0
                });
            } else {
                setShowMentionSuggestions(false);
            }
        } else {
            setShowMentionSuggestions(false);
        }
        
        setNewComment(text);
    };

    const handleAddComment = async () => {
        if (newComment.trim()) {
            // Get current user info
            const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
            
            // Parse mentions from comment text
            const mentionTexts = parseMentions(newComment);
            const mentionedUsers = [];
            
            // Find actual user objects for mentions
            mentionTexts.forEach(mentionText => {
                const mentionLower = mentionText.toLowerCase();
                const user = users.find(u => {
                    const name = (u.name || '').toLowerCase();
                    const email = (u.email || '').toLowerCase();
                    // Match exact name/email or if mention is contained in name (for partial matches)
                    return name === mentionLower || 
                           email === mentionLower ||
                           name.startsWith(mentionLower + ' ') ||
                           name.includes(' ' + mentionLower + ' ') ||
                           name.endsWith(' ' + mentionLower) ||
                           (name.split(' ').some(word => word === mentionLower)); // Match any word in name
                });
                if (user) {
                    // Only add if not already mentioned
                    if (!mentionedUsers.find(m => m.id === user.id)) {
                        mentionedUsers.push({
                            id: user.id,
                            name: user.name,
                            email: user.email
                        });
                    }
                }
            });
            
            // CRITICAL: Ensure comment always has an ID (even for old tasks)
            // Use a more robust ID generation that won't collide
            const commentId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            
            const comment = {
                id: commentId,
                text: newComment,
                author: currentUser.name,
                authorEmail: currentUser.email,
                authorId: currentUser.id,
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleString(),
                mentions: mentionedUsers // Store mentioned users
            };
            
            // Update subscribers list - add mentioned users and comment author
            const newSubscribers = [...new Set([
                ...(editedTask.subscribers || []),
                currentUser.id, // Comment author is always subscribed
                ...mentionedUsers.map(u => u.id) // Add all mentioned users
            ])];
            
            setEditedTask({
                ...editedTask,
                subscribers: newSubscribers
            });
            
            const updatedComments = [...comments, comment];
            setComments(updatedComments);
            setNewComment('');
            
            // CRITICAL: Mark that we just added a comment to prevent refresh race condition
            lastCommentAddTimeRef.current = Date.now();
            
            // CRITICAL: Auto-save the comment immediately to ensure persistence
            // Don't wait for user to click "Save Changes" - comments should persist immediately
            // CRITICAL FIX: Ensure comments array is always present and valid
            const taskToAutoSave = {
                ...editedTask,
                // CRITICAL: Always include comments array - never undefined
                comments: Array.isArray(updatedComments) ? updatedComments : [],
                checklist: Array.isArray(checklist) ? checklist : [],
                attachments: Array.isArray(attachments) ? attachments : [],
                tags: Array.isArray(tags) ? tags : [],
                subtasks: Array.isArray(editedTask.subtasks) ? editedTask.subtasks : [],
                subscribers: newSubscribers,
                id: editedTask.id || task?.id || Date.now()
            };

            // VALIDATION: Ensure comments array is present before saving
            if (!Array.isArray(taskToAutoSave.comments)) {
                console.error('❌ CRITICAL: taskToAutoSave.comments is not an array!', {
                    taskId: taskToAutoSave.id,
                    commentsType: typeof taskToAutoSave.comments,
                    commentsValue: taskToAutoSave.comments
                });
                taskToAutoSave.comments = updatedComments || [];
            }

            console.log('💾 TaskDetailModal: Saving comment to TaskComment table', {
                taskId: taskToAutoSave.id,
                projectId: project?.id,
                commentId: comment.id,
                commentAuthor: comment.author,
                commentText: comment.text?.substring(0, 50)
            });

            // NEW: Save comment directly to TaskComment table via API
            try {
                const currentUser = window.storage?.getUserInfo() || { name: 'System', email: 'system', id: 'system' };
                
                const commentResponse = await window.DatabaseAPI.makeRequest('/task-comments', {
                    method: 'POST',
                    body: JSON.stringify({
                        taskId: taskToAutoSave.id,
                        projectId: project?.id,
                        text: comment.text,
                        author: comment.author || currentUser.name,
                        authorId: comment.authorId || currentUser.id,
                        userName: comment.userName || comment.authorEmail || currentUser.email
                    })
                });
                
                const commentData = await commentResponse.json();
                
                if (commentData.comment) {
                    // Update local comment with the saved comment from API (includes generated ID)
                    const savedComment = {
                        ...comment,
                        id: commentData.comment.id,
                        createdAt: commentData.comment.createdAt,
                        timestamp: commentData.comment.createdAt,
                        date: new Date(commentData.comment.createdAt).toLocaleString()
                    };
                    
                    // Update comments state with the saved comment
                    setComments(prev => [...prev.filter(c => c.id !== comment.id), savedComment]);
                    
                    console.log('✅ TaskDetailModal: Comment saved to TaskComment table', {
                        taskId: taskToAutoSave.id,
                        commentId: savedComment.id
                    });
                    
                    // Also update the task for backward compatibility (but don't rely on it)
                    // This ensures the task still has comments in JSON during transition
                    try {
                        onUpdate(taskToAutoSave, { closeModal: false });
                    } catch (updateError) {
                        console.warn('⚠️ Failed to update task (non-critical):', updateError);
                    }
                } else {
                    throw new Error('Comment save response missing comment data');
                }
            } catch (apiError) {
                console.error('❌ TaskDetailModal: Failed to save comment to API, falling back to task update', {
                    taskId: taskToAutoSave.id,
                    error: apiError.message
                });
                
                // Fallback to old method (saves through task update)
                try {
                    onUpdate(taskToAutoSave, { closeModal: false });
                    console.log('✅ TaskDetailModal: Comment save via task update (fallback)');
                } catch (error) {
                    console.error('❌ TaskDetailModal: Failed to save comment (both methods failed)', {
                        taskId: taskToAutoSave.id,
                        error: error.message
                    });
                    alert('Failed to save comment. Please try again or refresh the page.');
                }
            }
            
            // Send notifications
            try {
                const taskId = editedTask.id || task?.id;
                const commentId = comment.id; // Get the comment ID for deep linking
                // Use hash-based routing format for email links (frontend uses hash routing)
                const projectLink = project ? `#/projects/${project.id}` : '#/projects';
                // Build task-specific link with query parameters for direct navigation to task and comment
                let taskLink = taskId ? `${projectLink}?task=${taskId}` : projectLink;
                // Add commentId parameter for deep linking to specific comment
                if (commentId) {
                    const separator = taskLink.includes('?') ? '&' : '?';
                    taskLink = `${taskLink}${separator}commentId=${encodeURIComponent(commentId)}`;
                }
                const taskTitle = editedTask.title || task?.title || 'Untitled Task';
                const projectName = project?.name || 'Project';
                
                // Send notifications to mentioned users using MentionHelper
                if (window.MentionHelper && mentionedUsers.length > 0) {
                    const contextTitle = `Task: ${taskTitle}`;
                    const contextLink = taskLink; // Use task-specific link with commentId
                    // Pass project information for email notifications
                    await window.MentionHelper.processMentions(
                        newComment,
                        contextTitle,
                        contextLink,
                        currentUser.name,
                        users,
                        {
                            projectId: project?.id,
                            projectName: projectName,
                            taskId: taskId,
                            taskTitle: taskTitle,
                            commentId: commentId // Include commentId in metadata
                        }
                    );
                }
                
                // Send notification to task assignee if they're not the comment author
                if (editedTask.assignee) {
                    const assigneeUser = users.find(u => 
                        u.name === editedTask.assignee || 
                        u.email === editedTask.assignee ||
                        u.id === editedTask.assignee
                    );
                    
                    if (assigneeUser && assigneeUser.id !== currentUser.id && !mentionedUsers.find(m => m.id === assigneeUser.id)) {
                        // Generate entity URL for the task (nested under project)
                        let entityUrl = taskLink; // Fallback to old format
                        if (window.EntityUrl && taskId && project?.id) {
                            entityUrl = window.EntityUrl.getEntityUrl('task', taskId, {
                                parentId: project.id,
                                parentType: 'project',
                                tab: 'comments'
                            });
                        }
                        
                        await window.DatabaseAPI.makeRequest('/notifications', {
                            method: 'POST',
                            body: JSON.stringify({
                                userId: assigneeUser.id,
                                type: 'comment',
                                title: `New comment on task: ${taskTitle}`,
                                message: `${currentUser.name} commented on "${taskTitle}" in project "${projectName}": "${newComment.substring(0, 100)}${newComment.length > 100 ? '...' : ''}"`,
                                link: entityUrl,
                                metadata: {
                                    taskId: taskId,
                                    taskTitle: taskTitle,
                                    projectId: project?.id,
                                    projectName: projectName,
                                    commentAuthor: currentUser.name,
                                    commentText: newComment
                                }
                            })
                        });
                    }
                }
                
                // Send notifications to subscribers (excluding comment author and mentioned users)
                const subscribersToNotify = (editedTask.subscribers || []).filter(subId => {
                    return subId !== currentUser.id && 
                           !mentionedUsers.find(m => m.id === subId) &&
                           subId !== (editedTask.assignee ? users.find(u => u.name === editedTask.assignee || u.email === editedTask.assignee || u.id === editedTask.assignee)?.id : null);
                });
                
                for (const subscriberId of subscribersToNotify) {
                    const subscriber = users.find(u => u.id === subscriberId);
                    if (subscriber) {
                        try {
                            // Generate entity URL for the task
                            let entityUrl = taskLink; // Fallback to old format
                            if (window.EntityUrl && taskId) {
                                entityUrl = window.EntityUrl.getEntityUrl('task', taskId, {
                                    tab: 'comments'
                                });
                            }
                            
                            await window.DatabaseAPI.makeRequest('/notifications', {
                                method: 'POST',
                                body: JSON.stringify({
                                    userId: subscriber.id,
                                    type: 'comment',
                                    title: `New comment on task: ${taskTitle}`,
                                    message: `${currentUser.name} commented on "${taskTitle}" in project "${projectName}": "${newComment.substring(0, 100)}${newComment.length > 100 ? '...' : ''}"`,
                                    link: entityUrl,
                                    metadata: {
                                        taskId: taskId,
                                        taskTitle: taskTitle,
                                        projectId: project?.id,
                                        projectName: projectName,
                                        commentAuthor: currentUser.name,
                                        commentText: newComment
                                    }
                                })
                            });
                        } catch (error) {
                            console.error(`❌ Failed to send comment notification to subscriber ${subscriber.name}:`, error);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Failed to send comment notifications:', error);
            }
        }
    };

    const handleDeleteComment = (commentId) => {
        if (confirm('Delete this comment?')) {
            const updatedComments = comments.filter(c => c.id !== commentId);
            setComments(updatedComments);
            
            // CRITICAL: Auto-save comment deletion immediately
            const taskToAutoSave = {
                ...editedTask,
                comments: updatedComments,
                checklist: Array.isArray(checklist) ? checklist : [],
                attachments: Array.isArray(attachments) ? attachments : [],
                tags: Array.isArray(tags) ? tags : [],
                subtasks: Array.isArray(editedTask.subtasks) ? editedTask.subtasks : [],
                subscribers: Array.isArray(editedTask.subscribers) ? editedTask.subscribers : [],
                id: editedTask.id || task?.id || Date.now()
            };

            console.log('💾 TaskDetailModal: Auto-saving comment deletion immediately', {
                taskId: taskToAutoSave.id,
                commentsCount: taskToAutoSave.comments.length
            });

            // Save without closing modal
            onUpdate(taskToAutoSave, { closeModal: false });
        }
    };

    const handleFileUpload = (e) => {
        const files = Array.from(e.target.files);
        const newAttachments = files.map(file => ({
            id: Date.now() + Math.random(),
            name: file.name,
            size: file.size,
            type: file.type,
            uploadDate: new Date().toISOString(),
            url: URL.createObjectURL(file)
        }));
        setAttachments([...attachments, ...newAttachments]);
    };

    const handleDeleteAttachment = (attachmentId) => {
        if (confirm('Delete this attachment?')) {
            setAttachments(attachments.filter(a => a.id !== attachmentId));
        }
    };

    const handleAddChecklistItem = () => {
        if (newChecklistItem.trim()) {
            const item = {
                id: Date.now(),
                text: newChecklistItem,
                completed: false
            };
            const updatedChecklist = [...checklist, item];
            setChecklist(updatedChecklist);
            setNewChecklistItem('');
            
            // CRITICAL: Auto-save checklist item immediately
            const taskToAutoSave = {
                ...editedTask,
                comments: Array.isArray(comments) ? comments : [],
                checklist: updatedChecklist,
                attachments: Array.isArray(attachments) ? attachments : [],
                tags: Array.isArray(tags) ? tags : [],
                subtasks: Array.isArray(editedTask.subtasks) ? editedTask.subtasks : [],
                subscribers: Array.isArray(editedTask.subscribers) ? editedTask.subscribers : [],
                id: editedTask.id || task?.id || Date.now()
            };

            console.log('💾 TaskDetailModal: Auto-saving checklist item immediately', {
                taskId: taskToAutoSave.id,
                checklistCount: taskToAutoSave.checklist.length
            });

            // Save without closing modal
            onUpdate(taskToAutoSave, { closeModal: false });
        }
    };

    const handleToggleChecklistItem = (itemId) => {
        const updatedChecklist = checklist.map(item =>
            item.id === itemId ? { ...item, completed: !item.completed } : item
        );
        setChecklist(updatedChecklist);
        
        // CRITICAL: Auto-save checklist toggle immediately
        const taskToAutoSave = {
            ...editedTask,
            comments: Array.isArray(comments) ? comments : [],
            checklist: updatedChecklist,
            attachments: Array.isArray(attachments) ? attachments : [],
            tags: Array.isArray(tags) ? tags : [],
            subtasks: Array.isArray(editedTask.subtasks) ? editedTask.subtasks : [],
            subscribers: Array.isArray(editedTask.subscribers) ? editedTask.subscribers : [],
            id: editedTask.id || task?.id || Date.now()
        };

        console.log('💾 TaskDetailModal: Auto-saving checklist toggle immediately', {
            taskId: taskToAutoSave.id,
            itemId
        });

        // Save without closing modal
        if (typeof onUpdate === 'function') {
            if (onUpdate.length > 1) {
                onUpdate(taskToAutoSave, { closeModal: false });
            } else {
                onUpdate(taskToAutoSave);
            }
        }
    };

    const handleDeleteChecklistItem = (itemId) => {
        const updatedChecklist = checklist.filter(item => item.id !== itemId);
        setChecklist(updatedChecklist);
        
        // CRITICAL: Auto-save checklist deletion immediately
        const taskToAutoSave = {
            ...editedTask,
            comments: Array.isArray(comments) ? comments : [],
            checklist: updatedChecklist,
            attachments: Array.isArray(attachments) ? attachments : [],
            tags: Array.isArray(tags) ? tags : [],
            subtasks: Array.isArray(editedTask.subtasks) ? editedTask.subtasks : [],
            subscribers: Array.isArray(editedTask.subscribers) ? editedTask.subscribers : [],
            id: editedTask.id || task?.id || Date.now()
        };

        console.log('💾 TaskDetailModal: Auto-saving checklist deletion immediately', {
            taskId: taskToAutoSave.id,
            checklistCount: taskToAutoSave.checklist.length
        });

        // Save without closing modal
        if (typeof onUpdate === 'function') {
            if (onUpdate.length > 1) {
                onUpdate(taskToAutoSave, { closeModal: false });
            } else {
                onUpdate(taskToAutoSave);
            }
        }
    };

    const handleAddTag = () => {
        if (newTag.trim() && !tags.includes(newTag.trim())) {
            setTags([...tags, newTag.trim()]);
            setNewTag('');
        }
    };

    const handleRemoveTag = (tag) => {
        setTags(tags.filter(t => t !== tag));
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 'High': return 'bg-red-100 text-red-800';
            case 'Medium': return 'bg-yellow-100 text-yellow-800';
            case 'Low': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'Done': return 'bg-green-100 text-green-800';
            case 'In Progress': return 'bg-blue-100 text-blue-800';
            case 'To Do': return 'bg-gray-100 text-gray-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getCompletionPercentage = () => {
        if (checklist.length === 0) return 0;
        const completed = checklist.filter(item => item.completed).length;
        return Math.round((completed / checklist.length) * 100);
    };

    const subtasks = editedTask.subtasks || [];

    let dueDateDisplay = null;
    if (editedTask.dueDate) {
        const dueDateValue = new Date(editedTask.dueDate);
        dueDateDisplay = isNaN(dueDateValue) ? editedTask.dueDate : dueDateValue.toLocaleDateString();
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto" style={{ padding: '0.5rem' }}>
            <div className="min-h-full flex items-start sm:items-center justify-center py-2 sm:py-4">
                <div className="bg-white rounded-lg w-full max-w-5xl max-h-[calc(100vh-1rem)] sm:max-h-[90vh] flex flex-col shadow-xl overflow-y-auto">
                {/* Header */}
                <div className="border-b border-gray-200 px-3 sm:px-4 py-3 bg-white flex-shrink-0">
                    <div className="flex items-start justify-between">
                        <div className="flex-1">
                            {parentTask && (
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs text-gray-500">
                                        <i className="fas fa-level-up-alt fa-rotate-90 mr-1"></i>
                                        {isCreating ? 'New Subtask of' : 'Subtask of'}: {parentTask.title}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-2 mb-1.5">
                                <input
                                    type="text"
                                    value={editedTask.title}
                                    onChange={(e) => setEditedTask({...editedTask, title: e.target.value})}
                                    className="text-lg font-semibold text-gray-800 w-full border-0 border-b-2 border-transparent hover:border-gray-300 focus:border-primary-500 outline-none px-2 -mx-2"
                                    placeholder={isCreating ? "Enter task title..." : "Task title..."}
                                    autoFocus={isCreating}
                                />
                            </div>
                            {/* Tags Display */}
                            {tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {tags.map((tag, idx) => (
                                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-medium">
                                            <i className="fas fa-tag"></i>
                                            {tag}
                                            <button
                                                onClick={() => handleRemoveTag(tag)}
                                                className="hover:text-purple-900"
                                            >
                                                <i className="fas fa-times"></i>
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 p-1 hover:bg-gray-100 rounded transition-colors">
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 bg-gray-50 min-h-0">
                    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 lg:px-6">
                            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] gap-4 sm:gap-6">
                                {/* Left Side - Main Content */}
                                <div ref={leftContentRef} className="space-y-4">
                                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                        {/* Tabs */}
                        <div className="flex gap-3 border-b border-gray-200 mb-4 overflow-x-auto">
                            <button
                                onClick={() => setActiveTab('details')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'details'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-info-circle mr-1.5"></i>
                                Details
                            </button>
                            <button
                                onClick={() => setActiveTab('checklist')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'checklist'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-check-square mr-1.5"></i>
                                Checklist ({checklist.filter(i => i.completed).length}/{checklist.length})
                            </button>
                            <button
                                onClick={async () => {
                                    setActiveTab('comments');
                                    // Trigger immediate refresh when switching to comments tab
                                    if (window.DatabaseAPI?.getProject && project?.id && task?.id) {
                                        try {
                                            const response = await window.DatabaseAPI.getProject(project.id);
                                            const updatedProject = response?.data?.project || response?.project || response?.data;
                                            
                                            if (updatedProject?.tasks && Array.isArray(updatedProject.tasks)) {
                                                let updatedTask = updatedProject.tasks.find(t => t.id === task.id);
                                                
                                                if (!updatedTask) {
                                                    for (const parentTask of updatedProject.tasks) {
                                                        if (parentTask.subtasks && Array.isArray(parentTask.subtasks)) {
                                                            const foundSubtask = parentTask.subtasks.find(st => st.id === task.id);
                                                            if (foundSubtask) {
                                                                updatedTask = foundSubtask;
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                                
                                                if (updatedTask) {
                                                    window.dispatchEvent(new CustomEvent('refreshTaskInModal', {
                                                        detail: { taskId: task.id, updatedTask }
                                                    }));
                                                }
                                            }
                                        } catch (error) {
                                            console.warn('⚠️ Failed to refresh on comments tab switch:', error);
                                        }
                                    }
                                }}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'comments'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-comments mr-1.5"></i>
                                Comments ({comments.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('attachments')}
                                className={`pb-2 px-1.5 text-sm font-medium transition whitespace-nowrap ${
                                    activeTab === 'attachments'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-gray-600 hover:text-gray-800'
                                }`}
                            >
                                <i className="fas fa-paperclip mr-1.5"></i>
                                Attachments ({attachments.length})
                            </button>
                        </div>

                        {/* Tab Content */}
                        {activeTab === 'details' && (
                            <div className="space-y-4">
                                {/* Description */}
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                        <i className="fas fa-align-left mr-1.5 text-gray-400"></i>
                                        Description
                                    </label>
                                    <textarea
                                        value={editedTask.description || ''}
                                        onChange={(e) => setEditedTask({...editedTask, description: e.target.value})}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg min-h-[120px] focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Add a detailed description..."
                                    ></textarea>
                                </div>

                                {/* Custom Fields */}
                                {customFieldDefinitions && customFieldDefinitions.length > 0 && (
                                    <div>
                                        <h3 className="text-xs font-medium text-gray-700 mb-2">Custom Fields</h3>
                                        <div className="grid grid-cols-2 gap-3">
                                            {customFieldDefinitions.map(field => (
                                                <div key={field.name}>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">
                                                        {field.name}
                                                    </label>
                                                    {field.type === 'text' && (
                                                        <input
                                                            type="text"
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}
                                                    {field.type === 'number' && (
                                                        <input
                                                            type="number"
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}
                                                    {field.type === 'date' && (
                                                        <input
                                                            type="date"
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        />
                                                    )}
                                                    {field.type === 'select' && (
                                                        <select
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        >
                                                            <option value="">Select...</option>
                                                            {field.options.map((option, idx) => (
                                                                <option key={idx} value={option}>{option}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    {field.type === 'status' && (
                                                        <select
                                                            value={editedTask.customFields?.[field.name] || ''}
                                                            onChange={(e) => setEditedTask({
                                                                ...editedTask,
                                                                customFields: {
                                                                    ...editedTask.customFields,
                                                                    [field.name]: e.target.value
                                                                }
                                                            })}
                                                            className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                                        >
                                                            <option value="">Select Status...</option>
                                                            {field.options.map((option, idx) => (
                                                                <option key={idx} value={option}>{option}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Subtasks Section */}
                                {!isCreating && !isSubtask && (
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xs font-medium text-gray-700">
                                                <i className="fas fa-tasks mr-1.5 text-gray-400"></i>
                                                Subtasks ({subtasks.length})
                                            </h3>
                                            {onAddSubtask && (
                                                <button
                                                    onClick={() => {
                                                        handleSave();
                                                        setTimeout(() => onAddSubtask(editedTask), 100);
                                                    }}
                                                    className="px-2.5 py-1 bg-primary-600 text-white text-[10px] rounded hover:bg-primary-700 transition font-medium"
                                                >
                                                    <i className="fas fa-plus mr-1"></i>
                                                    Add Subtask
                                                </button>
                                            )}
                                        </div>
                                        
                                        {subtasks.length === 0 ? (
                                            <div className="text-center py-6 bg-gray-50 rounded-lg border border-gray-200">
                                                <i className="fas fa-tasks text-2xl text-gray-400 mb-1.5"></i>
                                                <p className="text-gray-500 text-xs">No subtasks yet</p>
                                                {onAddSubtask && (
                                                    <button
                                                        onClick={() => {
                                                            handleSave();
                                                            setTimeout(() => onAddSubtask(editedTask), 100);
                                                        }}
                                                        className="mt-2.5 px-3 py-1.5 bg-primary-600 text-white text-xs rounded hover:bg-primary-700 font-medium"
                                                    >
                                                        Add First Subtask
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {subtasks.map(subtask => (
                                                    <div 
                                                        key={subtask.id} 
                                                        className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 hover:border-primary-300 transition cursor-pointer"
                                                        onClick={() => {
                                                            if (onViewSubtask) {
                                                                handleSave();
                                                                setTimeout(() => onViewSubtask(subtask, editedTask), 100);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                                    <i className="fas fa-level-up-alt fa-rotate-90 text-gray-400 text-[10px]"></i>
                                                                    <span className="font-medium text-gray-800 text-xs">{subtask.title}</span>
                                                                </div>
                                                                {subtask.description && (
                                                                    <p className="text-[10px] text-gray-500 ml-4 mb-1.5">{subtask.description}</p>
                                                                )}
                                                                <div className="flex items-center gap-2 ml-4 text-[10px] text-gray-500">
                                                                    <span>
                                                                        <i className="fas fa-user mr-0.5"></i>
                                                                        {subtask.assignee}
                                                                    </span>
                                                                    {subtask.dueDate && (
                                                                        <span>
                                                                            <i className="fas fa-calendar mr-0.5"></i>
                                                                            {subtask.dueDate}
                                                                        </span>
                                                                    )}
                                                                    <span className={`px-1.5 py-0.5 rounded ${getPriorityColor(subtask.priority)}`}>
                                                                        {subtask.priority}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {onDeleteSubtask && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (confirm('Delete this subtask?')) {
                                                                            onDeleteSubtask(editedTask.id, subtask.id);
                                                                        }
                                                                    }}
                                                                    className="text-gray-400 hover:text-red-600 p-1"
                                                                    title="Delete Subtask"
                                                                >
                                                                    <i className="fas fa-trash text-xs"></i>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'checklist' && (
                            <div className="space-y-3">
                                {/* Progress Bar */}
                                {checklist.length > 0 && (
                                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                                        <div className="flex justify-between items-center mb-1.5">
                                            <span className="text-xs font-medium text-gray-700">Progress</span>
                                            <span className="text-xs font-semibold text-primary-600">{getCompletionPercentage()}%</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                            <div 
                                                className="bg-primary-600 h-2 rounded-full transition-all" 
                                                style={{width: `${getCompletionPercentage()}%`}}
                                            ></div>
                                        </div>
                                    </div>
                                )}

                                {/* Add Checklist Item */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newChecklistItem}
                                        onChange={(e) => setNewChecklistItem(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                                        className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        placeholder="Add checklist item..."
                                    />
                                    <button
                                        onClick={handleAddChecklistItem}
                                        className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                    >
                                        <i className="fas fa-plus"></i>
                                    </button>
                                </div>

                                {/* Checklist Items */}
                                <div className="space-y-1.5">
                                    {checklist.length === 0 ? (
                                        <div className="text-center py-6 text-gray-500">
                                            <i className="fas fa-check-square text-3xl mb-1.5"></i>
                                            <p className="text-sm">No checklist items yet</p>
                                        </div>
                                    ) : (
                                        checklist.map(item => (
                                            <div key={item.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                                                <input
                                                    type="checkbox"
                                                    checked={item.completed}
                                                    onChange={() => handleToggleChecklistItem(item.id)}
                                                    className="w-4 h-4 text-primary-600 rounded focus:ring-2 focus:ring-primary-500"
                                                />
                                                <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                                                    {item.text}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteChecklistItem(item.id)}
                                                    className="text-gray-400 hover:text-red-600 p-1"
                                                >
                                                    <i className="fas fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'comments' && (
                            <div className="space-y-3">
                                {/* Refresh Button */}
                                <div className="flex justify-end">
                                    <button
                                        onClick={async () => {
                                            console.log('🔄 Manual refresh triggered');
                                            if (window.DatabaseAPI?.getProject && project?.id && task?.id) {
                                                try {
                                                    const response = await window.DatabaseAPI.getProject(project.id);
                                                    const updatedProject = response?.data?.project || response?.project || response?.data;
                                                    
                                                    if (updatedProject?.tasks && Array.isArray(updatedProject.tasks)) {
                                                        let updatedTask = updatedProject.tasks.find(t => t.id === task.id);
                                                        
                                                        if (!updatedTask) {
                                                            for (const parentTask of updatedProject.tasks) {
                                                                if (parentTask.subtasks && Array.isArray(parentTask.subtasks)) {
                                                                    const foundSubtask = parentTask.subtasks.find(st => st.id === task.id);
                                                                    if (foundSubtask) {
                                                                        updatedTask = foundSubtask;
                                                                        break;
                                                                    }
                                                                }
                                                            }
                                                        }
                                                        
                                                        if (updatedTask) {
                                                            console.log('🔄 Manual refresh: Found updated task', {
                                                                taskId: task.id,
                                                                commentsCount: Array.isArray(updatedTask.comments) ? updatedTask.comments.length : 0
                                                            });
                                                            window.dispatchEvent(new CustomEvent('refreshTaskInModal', {
                                                                detail: { taskId: task.id, updatedTask }
                                                            }));
                                                        }
                                                    }
                                                } catch (error) {
                                                    console.error('❌ Manual refresh failed:', error);
                                                }
                                            }
                                        }}
                                        className="px-2 py-1 text-xs text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded transition-colors"
                                        title="Refresh comments"
                                    >
                                        <i className="fas fa-sync-alt mr-1"></i>
                                        Refresh
                                    </button>
                                </div>
                                {/* Add Comment */}
                                <div className="relative">
                                    <textarea
                                        ref={commentTextareaRef}
                                        value={newComment}
                                        onChange={handleCommentChange}
                                        onKeyDown={(e) => {
                                            // Handle arrow keys and enter in mention suggestions
                                            if (showMentionSuggestions && mentionSuggestionsRef.current) {
                                                const suggestions = mentionSuggestionsRef.current.querySelectorAll('[data-mention-item]');
                                                const currentIndex = Array.from(suggestions).findIndex(el => el.classList.contains('bg-primary-100'));
                                                
                                                if (e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    const nextIndex = currentIndex < suggestions.length - 1 ? currentIndex + 1 : 0;
                                                    suggestions[nextIndex]?.scrollIntoView({ block: 'nearest' });
                                                    suggestions.forEach((s, i) => {
                                                        if (i === nextIndex) s.classList.add('bg-primary-100');
                                                        else s.classList.remove('bg-primary-100');
                                                    });
                                                } else if (e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    const prevIndex = currentIndex > 0 ? currentIndex - 1 : suggestions.length - 1;
                                                    suggestions[prevIndex]?.scrollIntoView({ block: 'nearest' });
                                                    suggestions.forEach((s, i) => {
                                                        if (i === prevIndex) s.classList.add('bg-primary-100');
                                                        else s.classList.remove('bg-primary-100');
                                                    });
                                                } else if (e.key === 'Enter' && currentIndex >= 0) {
                                                    e.preventDefault();
                                                    const selectedUser = getMentionSuggestions()[currentIndex];
                                                    if (selectedUser) insertMention(selectedUser);
                                                } else if (e.key === 'Escape') {
                                                    setShowMentionSuggestions(false);
                                                }
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                        rows="3"
                                        placeholder="Add a comment... (use @ to mention someone)"
                                    ></textarea>
                                    
                                    {/* Mention Suggestions Dropdown */}
                                    {showMentionSuggestions && (
                                        <div
                                            ref={mentionSuggestionsRef}
                                            className="absolute top-full mt-1 left-0 right-0 z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto"
                                            style={{
                                                minWidth: '200px',
                                                maxWidth: '100%'
                                            }}
                                        >
                                            {getMentionSuggestions().length > 0 ? (
                                                getMentionSuggestions().map((user, index) => (
                                                    <div
                                                        key={user.id}
                                                        data-mention-item
                                                        onClick={() => insertMention(user)}
                                                        className={`px-3 py-2 cursor-pointer hover:bg-primary-100 flex items-center gap-2 ${
                                                            index === 0 ? 'bg-primary-50' : ''
                                                        }`}
                                                    >
                                                        <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-[10px]">
                                                            {(user.name || user.email || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-xs font-medium text-gray-800 truncate">
                                                                {user.name || user.email}
                                                            </div>
                                                            {user.name && user.email && (
                                                                <div className="text-[10px] text-gray-500 truncate">
                                                                    {user.email}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="px-3 py-2 text-xs text-gray-500">
                                                    No users found
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    
                                    <div className="mt-1.5 flex justify-between items-center">
                                        <div className="text-[10px] text-gray-500">
                                            {editedTask.subscribers && editedTask.subscribers.length > 0 && (
                                                <span>
                                                    <i className="fas fa-bell mr-1"></i>
                                                    {editedTask.subscribers.length} subscriber{editedTask.subscribers.length !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleAddComment}
                                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium"
                                        >
                                            <i className="fas fa-comment mr-1.5"></i>
                                            Add Comment
                                        </button>
                                    </div>
                                </div>

                                {/* Comments List */}
                                <div ref={commentsContainerRef} className="space-y-2 max-h-96 overflow-y-auto pr-2">
                                    {comments.length === 0 ? (
                                        <div className="text-center py-6 text-gray-500">
                                            <i className="fas fa-comments text-3xl mb-1.5"></i>
                                            <p className="text-sm">No comments yet</p>
                                        </div>
                                    ) : (
                                        comments.map(comment => (
                                            <div 
                                                key={comment.id} 
                                                data-comment-id={comment.id}
                                                id={comment.id ? `comment-${comment.id}` : undefined}
                                                className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                                            >
                                                <div className="flex items-start justify-between mb-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold text-[10px]">
                                                            {(comment.author || comment.createdBy || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-800 text-xs">{(comment.author || comment.createdBy || 'User')}{(comment.authorEmail || comment.createdByEmail) ? ` (${comment.authorEmail || comment.createdByEmail})` : ''}</div>
                                                            <div className="text-[10px] text-gray-500">{comment.date || new Date(comment.timestamp || comment.createdAt).toLocaleString('en-ZA', {
                                                                month: 'short',
                                                                day: '2-digit',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                                year: 'numeric'
                                                            })}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteComment(comment.id)}
                                                        className="text-gray-400 hover:text-red-600 p-0.5"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                                <p className="text-gray-700 text-xs whitespace-pre-wrap">
                                                    {comment.text}
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'attachments' && (
                            <div className="space-y-3">
                                {/* Upload */}
                                <div>
                                    <label className="block w-full px-3 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition cursor-pointer text-center">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={handleFileUpload}
                                            className="hidden"
                                        />
                                        <i className="fas fa-cloud-upload-alt text-3xl text-gray-400 mb-1.5"></i>
                                        <p className="text-sm text-gray-600">Click to upload files or drag and drop</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Any file type supported</p>
                                    </label>
                                </div>

                                {/* Attachments List */}
                                <div className="space-y-1.5">
                                    {attachments.length === 0 ? (
                                        <div className="text-center py-6 text-gray-500">
                                            <i className="fas fa-paperclip text-3xl mb-1.5"></i>
                                            <p className="text-sm">No attachments yet</p>
                                        </div>
                                    ) : (
                                        attachments.map(attachment => (
                                            <div key={attachment.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <div className="w-8 h-8 bg-primary-100 rounded flex items-center justify-center flex-shrink-0">
                                                        <i className="fas fa-file text-primary-600 text-xs"></i>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-gray-800 text-xs truncate">{attachment.name}</div>
                                                        <div className="text-[10px] text-gray-500">{formatFileSize(attachment.size)}</div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 ml-2">
                                                    <a
                                                        href={attachment.url}
                                                        download={attachment.name}
                                                        className="text-primary-600 hover:text-primary-800 p-1.5"
                                                        title="Download"
                                                    >
                                                        <i className="fas fa-download text-xs"></i>
                                                    </a>
                                                    <button
                                                        onClick={() => handleDeleteAttachment(attachment.id)}
                                                        className="text-red-600 hover:text-red-800 p-1.5"
                                                        title="Delete"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                                    </div>
                                </div>

                                {/* Right Side - Task Properties */}
                                <aside className="space-y-4">
                                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                                            <div>
                                                <p className="text-[11px] uppercase tracking-wide text-gray-500">Task Properties</p>
                                                <h3 className="text-base font-semibold text-gray-800 mt-0.5">Quick Overview</h3>
                                            </div>
                                            <span className="text-[10px] bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">
                                                <i className="fas fa-pencil-alt mr-1 text-[9px]"></i>
                                                Editable
                                            </span>
                                        </div>

                                        <div className="px-4 py-5 space-y-5">
                                            <div className="flex flex-wrap gap-2">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold ${getStatusColor(editedTask.status)}`}>
                                                    <i className="fas fa-flag text-[10px]"></i>
                                                    {editedTask.status}
                                                </span>
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold ${getPriorityColor(editedTask.priority)}`}>
                                                    <i className="fas fa-exclamation-circle text-[10px]"></i>
                                                    {editedTask.priority}
                                                </span>
                                                {dueDateDisplay && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
                                                        <i className="fas fa-calendar-alt text-[10px]"></i>
                                                        Due {dueDateDisplay}
                                                    </span>
                                                )}
                                            </div>

                                            {/* List Selection */}
                                            {isCreating && !parentTask && taskLists && taskLists.length > 0 && (
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-semibold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <i className="fas fa-list text-gray-400"></i>
                                                            List
                                                        </span>
                                                    </label>
                                                    <select
                                                        value={editedTask.listId}
                                                        onChange={(e) => setEditedTask({...editedTask, listId: parseInt(e.target.value)})}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                    >
                                                        {taskLists.map(list => (
                                                            <option key={list.id} value={list.id}>{list.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-1 gap-4">
                                                {/* Status */}
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-semibold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <i className="fas fa-flag text-gray-400"></i>
                                                            Status
                                                        </span>
                                                    </label>
                                                    <select
                                                        value={editedTask.status}
                                                        onChange={(e) => setEditedTask({...editedTask, status: e.target.value})}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                    >
                                                        <option>To Do</option>
                                                        <option>In Progress</option>
                                                        <option>Done</option>
                                                    </select>
                                                </div>

                                                {/* Assignee */}
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-semibold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <i className="fas fa-user text-gray-400"></i>
                                                            Assignee
                                                        </span>
                                                    </label>
                                                    <select
                                                        value={editedTask.assignee || ''}
                                                        onChange={(e) => setEditedTask({...editedTask, assignee: e.target.value})}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                    >
                                                        <option value="">Unassigned</option>
                                                        {users.map(user => (
                                                            <option key={user.id} value={user.name || user.email}>
                                                                {user.name || user.email}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Due Date */}
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-semibold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <i className="fas fa-calendar text-gray-400"></i>
                                                            Due Date
                                                        </span>
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={editedTask.dueDate}
                                                        onChange={(e) => setEditedTask({...editedTask, dueDate: e.target.value})}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                    />
                                                </div>

                                                {/* Priority */}
                                                <div className="space-y-2">
                                                    <label className="block text-xs font-semibold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <i className="fas fa-exclamation-circle text-gray-400"></i>
                                                            Priority
                                                        </span>
                                                    </label>
                                                    <select
                                                        value={editedTask.priority}
                                                        onChange={(e) => setEditedTask({...editedTask, priority: e.target.value})}
                                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                    >
                                                        <option>Low</option>
                                                        <option>Medium</option>
                                                        <option>High</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Time Tracking */}
                                            <div className="pt-4 border-t border-gray-200 space-y-3">
                                                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                                                    <i className="fas fa-clock text-gray-400"></i>
                                                    Time Tracking
                                                </h4>
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="block text-[11px] text-gray-500 font-medium">Estimated Hours</label>
                                                        <input
                                                            type="number"
                                                            value={editedTask.estimatedHours}
                                                            onChange={(e) => setEditedTask({...editedTask, estimatedHours: e.target.value})}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                            placeholder="0"
                                                            step="0.5"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="block text-[11px] text-gray-500 font-medium">Actual Hours</label>
                                                        <input
                                                            type="number"
                                                            value={editedTask.actualHours}
                                                            onChange={(e) => setEditedTask({...editedTask, actualHours: e.target.value})}
                                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                            placeholder="0"
                                                            step="0.5"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tags */}
                                            <div className="pt-4 border-t border-gray-200 space-y-3">
                                                <label className="block text-xs font-semibold text-gray-700">
                                                    <span className="flex items-center gap-1.5">
                                                        <i className="fas fa-tags text-gray-400"></i>
                                                        Tags
                                                    </span>
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={newTag}
                                                        onChange={(e) => setNewTag(e.target.value)}
                                                        onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                        placeholder="Add tag..."
                                                    />
                                                    <button
                                                        onClick={handleAddTag}
                                                        className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm shadow-sm"
                                                    >
                                                        <i className="fas fa-plus"></i>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Blocked By */}
                                            <div className="pt-4 border-t border-gray-200 space-y-2">
                                                <label className="block text-xs font-semibold text-gray-700">
                                                    <span className="flex items-center gap-1.5">
                                                        <i className="fas fa-ban text-gray-400"></i>
                                                        Blocked By
                                                    </span>
                                                </label>
                                                <input
                                                    type="text"
                                                    value={editedTask.blockedBy}
                                                    onChange={(e) => setEditedTask({...editedTask, blockedBy: e.target.value})}
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-gray-50 hover:bg-white transition"
                                                    placeholder="What's slowing this down?"
                                                />
                                            </div>

                                            {/* Dates Info */}
                                            {!isCreating && (
                                                <div className="pt-4 border-t border-gray-200 text-[11px] text-gray-500 space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <i className="fas fa-plus-circle text-gray-400"></i>
                                                        <span>Created: {new Date(task.id).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <i className="fas fa-edit text-gray-400"></i>
                                                        <span>Last Updated: {new Date().toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </aside>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 px-3 sm:px-4 py-2.5 flex justify-between items-center bg-white flex-shrink-0">
                    <div>
                        {!isCreating && (isSubtask ? onDeleteSubtask : onDeleteTask) && (
                            <button
                                onClick={() => {
                                    if (isSubtask) {
                                        // Delete subtask
                                        if (confirm('Delete this subtask?')) {
                                            onDeleteSubtask(parentTask.id, task.id);
                                            onClose();
                                        }
                                    } else {
                                        // Delete regular task
                                        if (confirm('Delete this task and all its subtasks?')) {
                                            onDeleteTask(task.id);
                                            onClose();
                                        }
                                    }
                                }}
                                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                            >
                                <i className="fas fa-trash mr-1.5"></i>
                                Delete Task
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
                        >
                            <i className={`fas ${isCreating ? 'fa-plus' : 'fa-save'} mr-1.5`}></i>
                            {isCreating ? 'Create Task' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.TaskDetailModal = TaskDetailModal;
