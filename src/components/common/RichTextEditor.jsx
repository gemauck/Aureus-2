// Rich text editor component with formatting toolbar
const { useState, useRef, useEffect, useCallback } = React;

const RichTextEditor = ({ 
    value = '', 
    onChange, 
    onBlur,
    placeholder = 'Type your text...', 
    rows = 4,
    isDark = false,
    className = '',
    id = null,
    name = null
}) => {
    const editorRef = useRef(null);
    const [html, setHtml] = useState(value || '');
    const isInternalUpdateRef = useRef(false);
    const scrollLockRef = useRef(false);
    const savedScrollPositionRef = useRef(0);
    const originalScrollIntoViewRef = useRef(null);

    // Function to set up scroll protection on editor
    const setupScrollProtection = useCallback((editor) => {
        if (!editor) return;
        
        // Check if already overridden (to avoid re-overriding)
        const scrollIntoViewString = editor.scrollIntoView.toString();
        if (scrollIntoViewString.includes('savedScrollPositionRef') || scrollIntoViewString.length > 100) {
            return; // Already overridden
        }
        
        // CRITICAL: Override scrollIntoView to prevent browser's default scroll behavior
        if (!originalScrollIntoViewRef.current) {
            originalScrollIntoViewRef.current = editor.scrollIntoView.bind(editor);
        }
        const originalScrollIntoView = originalScrollIntoViewRef.current;
        editor.scrollIntoView = function(options) {
            // Save current scroll position BEFORE any scroll happens
            const currentScroll = window.scrollY || window.pageYOffset;
            savedScrollPositionRef.current = currentScroll;
            scrollLockRef.current = true;
            
            // IMMEDIATELY prevent any scroll by restoring position
            window.scrollTo(0, savedScrollPositionRef.current);
            
            // Try to use preventScroll if available (modern browsers)
            if (options && typeof options === 'object') {
                options.block = 'nearest';
                options.inline = 'nearest';
                // Try preventScroll first
                try {
                    originalScrollIntoView({ ...options, preventScroll: true });
                } catch (e) {
                    // If preventScroll fails, just don't call it at all
                    // The scroll restoration below will handle it
                }
            } else {
                // Try preventScroll with default options
                try {
                    originalScrollIntoView({ block: 'nearest', inline: 'nearest', preventScroll: true });
                } catch (e) {
                    // If preventScroll not supported, don't call original at all
                }
            }
            
            // Aggressively restore scroll position multiple times
            const restoreScroll = () => {
                const nowScroll = window.scrollY || window.pageYOffset;
                if (nowScroll === 0 || Math.abs(nowScroll - savedScrollPositionRef.current) > 50) {
                    window.scrollTo(0, savedScrollPositionRef.current);
                }
            };
            
            // Immediate restoration
            restoreScroll();
            requestAnimationFrame(restoreScroll);
            
            // Keep restoring for a period with multiple attempts
            const restoreInterval = setInterval(() => {
                if (scrollLockRef.current) {
                    restoreScroll();
                } else {
                    clearInterval(restoreInterval);
                }
            }, 5); // More frequent checks
            
            setTimeout(() => {
                scrollLockRef.current = false;
                clearInterval(restoreInterval);
                // Final restoration
                restoreScroll();
            }, 500);
        };
    }, []);
    
    // Initialize editor content on mount and set up scroll protection
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML && value) {
            editorRef.current.innerHTML = value;
            setHtml(value);
        }
        
        const editor = editorRef.current;
        if (!editor) return;
        
        // Set up scrollIntoView override
        setupScrollProtection(editor);
        
        // Save scroll position before any focus/click events
        const saveScroll = () => {
            savedScrollPositionRef.current = window.scrollY || window.pageYOffset;
        };
        
        // Set up scroll protection using multiple approaches
        const handleMouseDown = (e) => {
            // Save scroll position BEFORE any browser behavior
            savedScrollPositionRef.current = window.scrollY || window.pageYOffset;
            scrollLockRef.current = true;
        };
        
        const handleFocus = (e) => {
            // CRITICAL: Save scroll BEFORE any browser behavior
            const scrollBeforeFocus = window.scrollY || window.pageYOffset;
            savedScrollPositionRef.current = scrollBeforeFocus;
            scrollLockRef.current = true;
            
            // Immediately restore - multiple times to catch any async scroll
            window.scrollTo(0, savedScrollPositionRef.current);
            
            // Aggressive restoration with more attempts
            const restore = () => {
                const currentScroll = window.scrollY || window.pageYOffset;
                if (scrollLockRef.current && savedScrollPositionRef.current > 0) {
                    // If scroll jumped to 0 or changed significantly, restore it
                    if (currentScroll === 0 || Math.abs(currentScroll - savedScrollPositionRef.current) > 50) {
                        window.scrollTo(0, savedScrollPositionRef.current);
                    }
                }
            };
            
            // Immediate restoration attempts - more aggressive timing
            requestAnimationFrame(restore);
            setTimeout(restore, 0);
            setTimeout(restore, 1);
            setTimeout(restore, 5);
            setTimeout(restore, 10);
            setTimeout(restore, 20);
            setTimeout(restore, 50);
            setTimeout(restore, 100);
            setTimeout(restore, 150);
            setTimeout(() => {
                restore();
                scrollLockRef.current = false;
            }, 300);
        };
        
        // Global scroll interceptor - restore if scroll jumps to 0 unexpectedly
        let lastKnownScroll = window.scrollY || window.pageYOffset;
        const scrollInterceptor = (e) => {
            const currentScroll = window.scrollY || window.pageYOffset;
            
            // If scroll jumped to 0 and we have a saved position, restore it
            if (currentScroll === 0 && savedScrollPositionRef.current > 100 && scrollLockRef.current) {
                e.preventDefault();
                e.stopImmediatePropagation();
                window.scrollTo(0, savedScrollPositionRef.current);
                return false;
            } else {
                lastKnownScroll = currentScroll;
            }
        };
        
        editor.addEventListener('mousedown', handleMouseDown, true);
        editor.addEventListener('focus', handleFocus, true);
        editor.addEventListener('click', handleMouseDown, true);
        window.addEventListener('scroll', scrollInterceptor, { passive: false, capture: true });
        
        // Continuous scroll monitor while locked - more aggressive
        const scrollMonitor = setInterval(() => {
            if (scrollLockRef.current && savedScrollPositionRef.current > 0) {
                const currentScroll = window.scrollY || window.pageYOffset;
                // If scroll jumped to 0 or changed significantly, restore it immediately
                if (currentScroll === 0 || Math.abs(currentScroll - savedScrollPositionRef.current) > 50) {
                    window.scrollTo(0, savedScrollPositionRef.current);
                }
            }
        }, 5); // Check more frequently
        
        return () => {
            // Restore original scrollIntoView - use ref to avoid scope issues
            try {
                if (editor && editor.scrollIntoView && originalScrollIntoViewRef.current) {
                    // Only restore if it's still our override
                    const currentMethod = editor.scrollIntoView.toString();
                    if (currentMethod.includes('savedScrollPositionRef') || currentMethod.length > 100) {
                        editor.scrollIntoView = originalScrollIntoViewRef.current;
                    }
                }
            } catch (error) {
                // Silently fail if editor is no longer available
                console.warn('Could not restore scrollIntoView:', error);
            }
            editor.removeEventListener('mousedown', handleMouseDown, true);
            editor.removeEventListener('focus', handleFocus, true);
            editor.removeEventListener('click', handleMouseDown, true);
            window.removeEventListener('scroll', scrollInterceptor, { capture: true });
            clearInterval(scrollMonitor);
        };
    }, [setupScrollProtection]);

        // Update editor when value prop changes (external updates)
    useEffect(() => {
        if (isInternalUpdateRef.current) {
            isInternalUpdateRef.current = false;
            return;
        }
        if (value !== html && editorRef.current) {
            const currentHtml = editorRef.current.innerHTML || '';
            // Only update if the value has actually changed (not from user input)
            if (value !== currentHtml) {
                setHtml(value || '');
                editorRef.current.innerHTML = value || '';
            }
        }
        
        // Re-apply scroll protection in case React recreated the element
        if (editorRef.current) {
            setupScrollProtection(editorRef.current);
        }
    }, [value, setupScrollProtection]);

    const handleInput = () => {
        if (!editorRef.current) return;
        const newHtml = editorRef.current.innerHTML;
        isInternalUpdateRef.current = true;
        setHtml(newHtml);
        if (onChange) {
            onChange(newHtml);
        }
    };

    const handleCommand = (command, value = null) => {
        if (!editorRef.current) return;
        editorRef.current.focus();
        
        try {
            // Special handling for lists
            if (command === 'insertUnorderedList' || command === 'insertOrderedList') {
                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    // Check if we're already in a list
                    let node = range.commonAncestorContainer;
                    let inList = false;
                    while (node && node !== editorRef.current) {
                        if (node.nodeName === 'UL' || node.nodeName === 'OL') {
                            inList = true;
                            break;
                        }
                        node = node.parentNode;
                    }
                    
                    if (inList) {
                        // Toggle list off
                        document.execCommand('outdent', false, null);
                    } else {
                        // Insert new list
                        const success = document.execCommand(command, false, null);
                        if (!success) {
                            // Fallback: manually create list
                            if (range.collapsed) {
                                // Create empty list item
                                const list = document.createElement(command === 'insertUnorderedList' ? 'ul' : 'ol');
                                const li = document.createElement('li');
                                list.appendChild(li);
                                range.insertNode(list);
                                // Place cursor in list item
                                const newRange = document.createRange();
                                newRange.setStart(li, 0);
                                newRange.setEnd(li, 0);
                                selection.removeAllRanges();
                                selection.addRange(newRange);
                            } else {
                                // Wrap selected text in list
                                const list = document.createElement(command === 'insertUnorderedList' ? 'ul' : 'ol');
                                const li = document.createElement('li');
                                li.appendChild(range.extractContents());
                                list.appendChild(li);
                                range.insertNode(list);
                            }
                        }
                    }
                    handleInput();
                    return;
                }
            }
            
            // For other commands
            const success = document.execCommand(command, false, value);
            if (success) {
                handleInput();
            } else {
                console.warn(`Command ${command} was not successful`);
            }
        } catch (error) {
            console.error(`Error executing command ${command}:`, error);
        }
    };

    const getToolbarButton = (icon, command, label, value = null) => (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                handleCommand(command, value);
            }}
            className={`p-1.5 rounded hover:bg-opacity-70 transition ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`}
            title={label}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
        >
            <i className={`fas ${icon} text-sm`}></i>
        </button>
    );

    return (
        <div className={`border rounded-lg ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} ${className}`}>
            {/* Toolbar */}
            <div className={`flex items-center gap-1 p-2 border-b ${isDark ? 'border-slate-600' : 'border-gray-200'}`}>
                {getToolbarButton('fa-bold', 'bold', 'Bold')}
                {getToolbarButton('fa-italic', 'italic', 'Italic')}
                {getToolbarButton('fa-underline', 'underline', 'Underline')}
                <div className={`w-px h-4 mx-1 ${isDark ? 'bg-slate-600' : 'bg-gray-300'}`}></div>
                {getToolbarButton('fa-list-ul', 'insertUnorderedList', 'Bullet List')}
                {getToolbarButton('fa-list-ol', 'insertOrderedList', 'Numbered List')}
                <div className={`w-px h-4 mx-1 ${isDark ? 'bg-slate-600' : 'bg-gray-300'}`}></div>
                {getToolbarButton('fa-align-left', 'justifyLeft', 'Align Left')}
                {getToolbarButton('fa-align-center', 'justifyCenter', 'Align Center')}
                {getToolbarButton('fa-align-right', 'justifyRight', 'Align Right')}
            </div>

            {/* Editor */}
            <div
                ref={editorRef}
                contentEditable
                onInput={handleInput}
                onFocus={(e) => {
                    // CRITICAL: Save scroll position BEFORE any browser behavior
                    const scrollBeforeFocus = window.scrollY || window.pageYOffset;
                    savedScrollPositionRef.current = scrollBeforeFocus;
                    scrollLockRef.current = true;
                    
                    // Immediate restoration - multiple attempts
                    const restoreScroll = () => {
                        const currentScroll = window.scrollY || window.pageYOffset;
                        if (currentScroll === 0 || Math.abs(currentScroll - savedScrollPositionRef.current) > 50) {
                            window.scrollTo(0, savedScrollPositionRef.current);
                        }
                    };
                    
                    restoreScroll();
                    requestAnimationFrame(restoreScroll);
                    setTimeout(restoreScroll, 0);
                    setTimeout(restoreScroll, 1);
                    setTimeout(restoreScroll, 5);
                    setTimeout(restoreScroll, 10);
                    setTimeout(restoreScroll, 20);
                    setTimeout(restoreScroll, 50);
                    setTimeout(restoreScroll, 100);
                    setTimeout(restoreScroll, 150);
                    setTimeout(() => {
                        restoreScroll();
                        scrollLockRef.current = false;
                    }, 300);
                }}
                onClick={(e) => {
                    // CRITICAL: Save scroll position BEFORE any browser behavior
                    const scrollBeforeClick = window.scrollY || window.pageYOffset;
                    savedScrollPositionRef.current = scrollBeforeClick;
                    scrollLockRef.current = true;
                    
                    // Immediate restoration
                    const restoreScroll = () => {
                        const currentScroll = window.scrollY || window.pageYOffset;
                        if (currentScroll === 0 || Math.abs(currentScroll - savedScrollPositionRef.current) > 50) {
                            window.scrollTo(0, savedScrollPositionRef.current);
                        }
                    };
                    
                    restoreScroll();
                    requestAnimationFrame(restoreScroll);
                    setTimeout(restoreScroll, 0);
                    setTimeout(restoreScroll, 1);
                    setTimeout(restoreScroll, 5);
                    setTimeout(restoreScroll, 10);
                    setTimeout(restoreScroll, 50);
                    setTimeout(() => {
                        restoreScroll();
                        scrollLockRef.current = false;
                    }, 100);
                }}
                onMouseDown={(e) => {
                    // CRITICAL: Save scroll position BEFORE any browser behavior
                    const scrollBeforeMouseDown = window.scrollY || window.pageYOffset;
                    savedScrollPositionRef.current = scrollBeforeMouseDown;
                    scrollLockRef.current = true;
                    
                    // Immediate restoration
                    window.scrollTo(0, savedScrollPositionRef.current);
                    
                    // Multiple restoration attempts
                    requestAnimationFrame(() => {
                        const currentScroll = window.scrollY || window.pageYOffset;
                        if (currentScroll === 0 && savedScrollPositionRef.current > 0) {
                            window.scrollTo(0, savedScrollPositionRef.current);
                        }
                    });
                    setTimeout(() => {
                        const currentScroll = window.scrollY || window.pageYOffset;
                        if (currentScroll === 0 && savedScrollPositionRef.current > 0) {
                            window.scrollTo(0, savedScrollPositionRef.current);
                        }
                    }, 0);
                }}
                onBlur={(e) => {
                    if (onBlur && editorRef.current) {
                        onBlur(editorRef.current.innerHTML);
                    }
                }}
                onKeyDown={(e) => {
                    // Prevent form submission on Enter (unless in a list)
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        // Allow Ctrl/Cmd+Enter for line breaks
                        return;
                    }
                    
                    // Handle Enter key for lists
                    if (e.key === 'Enter') {
                        const selection = window.getSelection();
                        if (selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            let node = range.commonAncestorContainer;
                            
                            // Check if we're in a list item
                            while (node && node !== editorRef.current) {
                                if (node.nodeName === 'LI') {
                                    // Allow default Enter behavior in lists
                                    return;
                                }
                                node = node.parentNode;
                            }
                        }
                        // Prevent form submission on Enter outside of lists
                        // The default behavior will create a new line, which is what we want
                    }
                }}
                onPaste={(e) => {
                    e.preventDefault();
                    const text = e.clipboardData.getData('text/plain');
                    document.execCommand('insertText', false, text);
                }}
                className={`px-3 py-2 text-sm outline-none ${isDark ? 'text-slate-100' : 'text-gray-900'}`}
                style={{ 
                    minHeight: `${rows * 1.5}rem`,
                    maxHeight: '400px',
                    overflowY: 'auto'
                }}
                data-placeholder={placeholder}
                suppressContentEditableWarning
            />
            
            {/* Placeholder and list styling */}
            <style>{`
                [contenteditable][data-placeholder]:empty:before {
                    content: attr(data-placeholder);
                    color: ${isDark ? '#94a3b8' : '#9ca3af'};
                    pointer-events: none;
                }
                [contenteditable] ul,
                [contenteditable] ol {
                    margin-left: 1.5rem;
                    margin-top: 0.5rem;
                    margin-bottom: 0.5rem;
                    padding-left: 1rem;
                }
                [contenteditable] ul {
                    list-style-type: disc;
                }
                [contenteditable] ol {
                    list-style-type: decimal;
                }
                [contenteditable] li {
                    margin: 0.25rem 0;
                    line-height: 1.5;
                }
                [contenteditable] p {
                    margin: 0.5rem 0;
                    line-height: 1.5;
                }
                [contenteditable] p:first-child {
                    margin-top: 0;
                }
                [contenteditable] p:last-child {
                    margin-bottom: 0;
                }
                [contenteditable] strong,
                [contenteditable] b {
                    font-weight: 600;
                }
                [contenteditable] em,
                [contenteditable] i {
                    font-style: italic;
                }
                [contenteditable] u {
                    text-decoration: underline;
                }
            `}</style>

            {/* Hidden input for form submission */}
            {(id || name) && (
                <input
                    type="hidden"
                    id={id}
                    name={name}
                    value={html}
                />
            )}
        </div>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.RichTextEditor = RichTextEditor;
}

