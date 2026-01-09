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
    const isScrollProtectionSetupRef = useRef(false);
    const protectionMonitorRef = useRef(null);
    const hasInitializedRef = useRef(false);
    const savedCursorPositionRef = useRef(null); // { start: number, end: number }
    const isUserTypingRef = useRef(false); // Track if user is actively typing
    const lastUserInputTimeRef = useRef(0); // Track last user input time
    const lastSetValueFromUserRef = useRef(null); // Track last value set from user input
    const isFocusedRef = useRef(false); // Track focus state reliably with events

    // Function to set up scroll protection on editor
    const setupScrollProtection = useCallback((editor) => {
        if (!editor) {
            return;
        }
        
        // Check if already overridden (to avoid re-overriding)
        const scrollIntoViewString = editor.scrollIntoView.toString();
        const isAlreadyOverridden = scrollIntoViewString.includes('savedScrollPositionRef') || 
                                     scrollIntoViewString.includes('scrollLockRef') ||
                                     scrollIntoViewString.length > 100;
        
        if (isAlreadyOverridden) {
            // Silently skip if already overridden (no need to log every time)
            return; // Already overridden
        }
        
        // Additional check: if we've already set up protection for this editor instance, skip
        if (isScrollProtectionSetupRef.current && editorRef.current === editor) {
            return;
        }
        
        // Only log setup in debug mode (reduce console noise)
        if (window.DEBUG_RICHTEXT_EDITOR) {
            console.log('🔒 RichTextEditor: Setting up scroll protection on editor', {
                scrollIntoViewType: typeof editor.scrollIntoView,
                scrollIntoViewString: scrollIntoViewString.substring(0, 100),
                isNative: scrollIntoViewString.includes('[native code]')
            });
        }
        
        // CRITICAL: Override scrollIntoView to COMPLETELY prevent browser's default scroll behavior
        if (!originalScrollIntoViewRef.current) {
            originalScrollIntoViewRef.current = editor.scrollIntoView.bind(editor);
        }
        
        // Save scroll position BEFORE overriding
        savedScrollPositionRef.current = window.scrollY || window.pageYOffset;
        
        // COMPLETE OVERRIDE - Never call the original, just restore scroll
        // Use Object.defineProperty to make it harder to override
        const overrideFunction = function(options) {
            // Save current scroll position
            const currentScroll = window.scrollY || window.pageYOffset;
            savedScrollPositionRef.current = currentScroll;
            scrollLockRef.current = true;
            
            // Only log in debug mode (reduce console noise)
            if (window.DEBUG_RICHTEXT_EDITOR) {
                console.log('🔒 RichTextEditor: scrollIntoView called, preventing scroll', {
                    currentScroll,
                    savedPosition: savedScrollPositionRef.current,
                    options
                });
            }
            
            // DO NOT CALL ORIGINAL - just restore scroll immediately
            window.scrollTo(0, savedScrollPositionRef.current);
            
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
            }, 5);
            
            setTimeout(() => {
                scrollLockRef.current = false;
                clearInterval(restoreInterval);
                restoreScroll();
            }, 500);
            
            // Return false to prevent any default behavior
            return false;
        };
        
        // Set the override function - make it writable so React can work with it
        try {
            Object.defineProperty(editor, 'scrollIntoView', {
                value: overrideFunction,
                writable: true, // Allow React to work with it
                configurable: true, // Allow reconfiguration if needed
                enumerable: true
            });
        } catch (e) {
            // Fallback if defineProperty fails (shouldn't happen but be safe)
            editor.scrollIntoView = overrideFunction;
        }
        
        // Verify the override was applied
        const verifyOverride = editor.scrollIntoView.toString();
        if (!verifyOverride.includes('savedScrollPositionRef') && verifyOverride.length < 100) {
            console.warn('🔒 RichTextEditor: Override verification failed, retrying direct assignment', {
                verifyOverride: verifyOverride.substring(0, 100)
            });
            // Override didn't stick, try direct assignment
            editor.scrollIntoView = overrideFunction;
        } else {
            // Only log verification in debug mode (reduce console noise)
            if (window.DEBUG_RICHTEXT_EDITOR) {
                console.log('✅ RichTextEditor: scrollIntoView override verified successfully');
            }
        }
        
        // Mark as setup complete
        isScrollProtectionSetupRef.current = true;
        
        // Also override focus method to prevent scroll
        const originalFocus = editor.focus;
        editor.focus = function(options) {
            // Save scroll before focus
            const scrollBefore = window.scrollY || window.pageYOffset;
            savedScrollPositionRef.current = scrollBefore;
            scrollLockRef.current = true;
            
            // Only log in debug mode (reduce console noise)
            if (window.DEBUG_RICHTEXT_EDITOR) {
                console.log('🔒 RichTextEditor: focus called, preventing scroll', {
                    scrollBefore,
                    savedPosition: savedScrollPositionRef.current,
                    options
                });
            }
            
            // Call original focus but immediately restore scroll
            const result = originalFocus.call(this, options);
            
            // Immediately restore scroll
            window.scrollTo(0, savedScrollPositionRef.current);
            
            // Multiple restoration attempts
            setTimeout(() => window.scrollTo(0, savedScrollPositionRef.current), 0);
            setTimeout(() => window.scrollTo(0, savedScrollPositionRef.current), 1);
            setTimeout(() => window.scrollTo(0, savedScrollPositionRef.current), 5);
            setTimeout(() => window.scrollTo(0, savedScrollPositionRef.current), 10);
            setTimeout(() => {
                window.scrollTo(0, savedScrollPositionRef.current);
                scrollLockRef.current = false;
            }, 100);
            
            return result;
        };
    }, []);
    
    // Track focus state with event listeners for reliable detection
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        
        const handleFocus = () => {
            isFocusedRef.current = true;
        };
        
        const handleBlur = () => {
            isFocusedRef.current = false;
        };
        
        editor.addEventListener('focus', handleFocus, true);
        editor.addEventListener('blur', handleBlur, true);
        
        // Also check current focus state
        if (document.activeElement === editor) {
            isFocusedRef.current = true;
        }
        
        return () => {
            editor.removeEventListener('focus', handleFocus, true);
            editor.removeEventListener('blur', handleBlur, true);
        };
    }, []); // Run once on mount
    
    // Initialize editor content on mount and set up scroll protection
    useEffect(() => {
        // Only initialize if editor is empty and not focused
        if (editorRef.current && !editorRef.current.innerHTML && value && !isFocusedRef.current) {
            editorRef.current.innerHTML = value;
            setHtml(value);
        }
        
        const editor = editorRef.current;
        if (!editor) return;
        
        // Skip if already initialized (prevent redundant setup on re-renders)
        if (hasInitializedRef.current && isScrollProtectionSetupRef.current) {
            return;
        }
        
        // Mark as initialized
        hasInitializedRef.current = true;
        
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
            
            // If scroll jumped to 0 and we have a saved position, restore it IMMEDIATELY
            if (currentScroll === 0 && savedScrollPositionRef.current > 50 && scrollLockRef.current) {
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                window.scrollTo(0, savedScrollPositionRef.current);
                return false;
            } else {
                lastKnownScroll = currentScroll;
            }
        };
        
        // Global scroll lock - prevent ANY scroll to 0 when locked
        const globalScrollLock = (e) => {
            if (scrollLockRef.current && savedScrollPositionRef.current > 50) {
                const currentScroll = window.scrollY || window.pageYOffset;
                if (currentScroll === 0) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.scrollTo(0, savedScrollPositionRef.current);
                    return false;
                }
            }
        };
        
        // Only log in debug mode (reduce console noise)
        if (window.DEBUG_RICHTEXT_EDITOR) {
            console.log('🔒 RichTextEditor: Adding event listeners for scroll protection');
        }
        editor.addEventListener('mousedown', handleMouseDown, true);
        editor.addEventListener('focus', handleFocus, true);
        editor.addEventListener('click', handleMouseDown, true);
        window.addEventListener('scroll', scrollInterceptor, { passive: false, capture: true });
        // Add wheel and touch events to prevent scroll
        window.addEventListener('wheel', globalScrollLock, { passive: false, capture: true });
        window.addEventListener('touchmove', globalScrollLock, { passive: false, capture: true });
        
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
        
        // Re-apply scroll protection if it gets lost (React might recreate elements)
        // Only check occasionally and only if protection was actually set up
        protectionMonitorRef.current = setInterval(() => {
            if (editor && editor.scrollIntoView && isScrollProtectionSetupRef.current) {
                const scrollIntoViewString = editor.scrollIntoView.toString();
                // If override was lost, re-apply it (but only log in debug mode)
                if (!scrollIntoViewString.includes('savedScrollPositionRef') && scrollIntoViewString.length < 100) {
                    if (window.DEBUG_RICHTEXT_EDITOR) {
                        console.warn('🔒 RichTextEditor: Override lost, re-applying protection', {
                            scrollIntoViewString: scrollIntoViewString.substring(0, 100),
                            isNative: scrollIntoViewString.includes('[native code]')
                        });
                    }
                    // Temporarily reset flag to allow re-setup
                    isScrollProtectionSetupRef.current = false;
                    setupScrollProtection(editor);
                }
            }
        }, 1000); // Check every 1 second instead of 100ms to reduce overhead
        
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
            }
            editor.removeEventListener('mousedown', handleMouseDown, true);
            editor.removeEventListener('focus', handleFocus, true);
            editor.removeEventListener('click', handleMouseDown, true);
            window.removeEventListener('scroll', scrollInterceptor, { capture: true });
            window.removeEventListener('wheel', globalScrollLock, { capture: true });
            window.removeEventListener('touchmove', globalScrollLock, { capture: true });
            clearInterval(scrollMonitor);
            if (protectionMonitorRef.current) {
                clearInterval(protectionMonitorRef.current);
                protectionMonitorRef.current = null;
            }
            // Reset setup flags on cleanup
            isScrollProtectionSetupRef.current = false;
            hasInitializedRef.current = false;
        };
    }, [setupScrollProtection]);

        // Helper function to save cursor position
    const saveCursorPosition = useCallback(() => {
        if (!editorRef.current) return;
        try {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                if (editorRef.current.contains(range.commonAncestorContainer)) {
                    // Calculate character offset from start of editor
                    const preCaretRange = range.cloneRange();
                    preCaretRange.selectNodeContents(editorRef.current);
                    preCaretRange.setEnd(range.startContainer, range.startOffset);
                    const start = preCaretRange.toString().length;
                    
                    preCaretRange.setEnd(range.endContainer, range.endOffset);
                    const end = preCaretRange.toString().length;
                    
                    savedCursorPositionRef.current = { start, end };
                }
            }
        } catch (e) {
            // Silently fail
        }
    }, []);
    
    // Helper function to restore cursor position
    const restoreCursorPosition = useCallback(() => {
        if (!editorRef.current || !savedCursorPositionRef.current) return;
        
        try {
            const { start, end } = savedCursorPositionRef.current;
            const range = document.createRange();
            const selection = window.getSelection();
            
            let charCount = 0;
            const walker = document.createTreeWalker(
                editorRef.current,
                NodeFilter.SHOW_TEXT,
                null
            );
            
            let startNode = null, startOffset = 0;
            let endNode = null, endOffset = 0;
            let foundStart = false, foundEnd = false;
            
            let node;
            while (node = walker.nextNode()) {
                const nodeLength = node.textContent.length;
                
                if (!foundStart && charCount + nodeLength >= start) {
                    startNode = node;
                    startOffset = start - charCount;
                    foundStart = true;
                }
                
                if (!foundEnd && charCount + nodeLength >= end) {
                    endNode = node;
                    endOffset = end - charCount;
                    foundEnd = true;
                    break;
                }
                
                charCount += nodeLength;
            }
            
            if (foundStart && startNode) {
                if (!foundEnd) {
                    endNode = startNode;
                    endOffset = startOffset;
                }
                
                range.setStart(startNode, Math.min(startOffset, startNode.textContent.length));
                range.setEnd(endNode, Math.min(endOffset, endNode.textContent.length));
                selection.removeAllRanges();
                selection.addRange(range);
                editorRef.current.focus();
            }
        } catch (e) {
            // Silently fail
        } finally {
            savedCursorPositionRef.current = null;
        }
    }, []);

        // Update editor when value prop changes (external updates)
    useEffect(() => {
        if (isInternalUpdateRef.current) {
            isInternalUpdateRef.current = false;
            return;
        }
        
        if (!editorRef.current) return;
        
        // CRITICAL: Use ref-based focus detection (more reliable than document.activeElement)
        // If editor is focused OR user is actively typing, NEVER update innerHTML from props
        // This is the key to preventing cursor jumps. When focused, the editor
        // is "uncontrolled" and manages its own state. Only update when blurred.
        if (isFocusedRef.current || isUserTypingRef.current) {
            // Editor is focused or user is typing - completely ignore prop updates
            // Just sync internal state without touching DOM to preserve cursor position
            if (value !== html) {
                setHtml(value || '');
            }
            return;
        }
        
        // Editor is not focused - safe to update from props
        const currentHtml = editorRef.current.innerHTML || '';
        // Only update if the value has actually changed
        if (value !== currentHtml && value !== html) {
            setHtml(value || '');
            editorRef.current.innerHTML = value || '';
        }
        
        // Re-apply scroll protection in case React recreated the element
        // Only if protection hasn't been set up yet
        if (editorRef.current && !isScrollProtectionSetupRef.current) {
            setupScrollProtection(editorRef.current);
        }
    }, [value, setupScrollProtection, html]);

    const handleInput = () => {
        if (!editorRef.current) return;
        
        // Mark that user is typing and editor is focused
        isFocusedRef.current = true;
        isUserTypingRef.current = true;
        lastUserInputTimeRef.current = Date.now();
        
        // Get the current HTML from the editor
        const newHtml = editorRef.current.innerHTML;
        lastSetValueFromUserRef.current = newHtml;
        
        // Mark this as an internal update so useEffect doesn't interfere
        isInternalUpdateRef.current = true;
        
        // Update internal state
        setHtml(newHtml);
        
        // Notify parent component of the change
        if (onChange) {
            onChange(newHtml);
        }
        
        // Keep typing flag active for longer to prevent any prop updates
        // Clear existing timeout
        if (window.richTextEditorTypingTimeout) {
            clearTimeout(window.richTextEditorTypingTimeout);
        }
        // Set new timeout - keep flag active for 2 seconds after last input
        window.richTextEditorTypingTimeout = setTimeout(() => {
            isUserTypingRef.current = false;
            window.richTextEditorTypingTimeout = null;
        }, 2000);
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
                    
                    // Immediate restoration - multiple attempts with very aggressive timing
                    const restoreScroll = () => {
                        const currentScroll = window.scrollY || window.pageYOffset;
                        if (currentScroll === 0 || Math.abs(currentScroll - savedScrollPositionRef.current) > 50) {
                            window.scrollTo(0, savedScrollPositionRef.current);
                        }
                    };
                    
                    // Use microtask and multiple timings to catch scroll ASAP
                    restoreScroll();
                    Promise.resolve().then(restoreScroll);
                    requestAnimationFrame(restoreScroll);
                    setTimeout(restoreScroll, 0);
                    setTimeout(restoreScroll, 1);
                    setTimeout(restoreScroll, 2);
                    setTimeout(restoreScroll, 5);
                    setTimeout(restoreScroll, 10);
                    setTimeout(restoreScroll, 20);
                    setTimeout(restoreScroll, 50);
                    setTimeout(restoreScroll, 100);
                    setTimeout(restoreScroll, 150);
                    setTimeout(restoreScroll, 200);
                    setTimeout(() => {
                        restoreScroll();
                        scrollLockRef.current = false;
                    }, 500);
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
                /* Prevent scroll behavior on contentEditable focus */
                [contenteditable="true"] {
                    scroll-margin: 0 !important;
                    scroll-padding: 0 !important;
                }
                
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
    // Version: 20260109-cursor-fix-v3 - Focus-based innerHTML protection
    console.log('✅ RichTextEditor loaded - cursor fix v3 (focus-based protection)');
}

