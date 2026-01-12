// Rich text editor component with formatting toolbar
const { useState, useRef, useEffect, useLayoutEffect, useCallback } = React;

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
    // Use a ref to store the actual DOM value - this is the source of truth when focused
    const domValueRef = useRef(value || '');
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
    const frozenValueRef = useRef(null); // Freeze value prop when editor is focused to prevent prop changes
    const ignorePropUpdatesRef = useRef(false); // Completely ignore prop updates when true
    const lastSyncedValueRef = useRef(value || ''); // Track last value we synced from props

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
    
    // Save and restore cursor position functions - CRITICAL for preventing cursor jumps
    const saveCursorPosition = useCallback(() => {
        if (!editorRef.current || !isFocusedRef.current) return null;
        
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) return null;
        
        const range = selection.getRangeAt(0);
        
        // Save both text position and node references
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(editorRef.current);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        
        const position = {
            start: preCaretRange.toString().length,
            end: preCaretRange.toString().length + range.toString().length,
            startContainer: range.startContainer,
            startOffset: range.startOffset,
            endContainer: range.endContainer,
            endOffset: range.endOffset
        };
        
        return position;
    }, []);
    
    const restoreCursorPosition = useCallback((position) => {
        if (!editorRef.current || !position || !isFocusedRef.current) return;
        
        try {
            const selection = window.getSelection();
            if (!selection) return;
            
            // Try to restore using saved container/offset first (most accurate)
            if (position.startContainer && document.body.contains(position.startContainer)) {
                try {
                    const range = document.createRange();
                    range.setStart(position.startContainer, position.startOffset);
                    range.setEnd(position.endContainer || position.startContainer, position.endOffset || position.startOffset);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    return;
                } catch (e) {
                    // Fall through to text-based restoration
                }
            }
            
            // Fallback: restore using text position
            const walker = document.createTreeWalker(
                editorRef.current,
                NodeFilter.SHOW_TEXT,
                null
            );
            
            let charCount = 0;
            let startNode = null;
            let endNode = null;
            let startOffset = 0;
            let endOffset = 0;
            
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const nodeLength = node.textContent.length;
                
                if (!startNode && charCount + nodeLength >= position.start) {
                    startNode = node;
                    startOffset = position.start - charCount;
                }
                
                if (charCount + nodeLength >= position.end) {
                    endNode = node;
                    endOffset = position.end - charCount;
                    break;
                }
                
                charCount += nodeLength;
            }
            
            if (startNode) {
                const range = document.createRange();
                range.setStart(startNode, Math.min(startOffset, startNode.textContent.length));
                if (endNode) {
                    range.setEnd(endNode, Math.min(endOffset, endNode.textContent.length));
                } else {
                    range.setEnd(startNode, Math.min(startOffset, startNode.textContent.length));
                }
                selection.removeAllRanges();
                selection.addRange(range);
            }
        } catch (e) {
            console.warn('Failed to restore cursor position:', e);
        }
    }, []);
    
    // Track focus state with event listeners and MutationObserver for cursor protection
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        
        let savedPosition = null;
        let mutationObserver = null;
        let isRestoring = false; // Flag to prevent recursive restoration
        
        const handleFocus = (e) => {
            // Only set focus if the event target is the editor or a child
            if (e.target === editor || editor.contains(e.target)) {
                isFocusedRef.current = true;
                isUserTypingRef.current = false; // Reset typing flag on focus
                // Freeze the current DOM value - this becomes the source of truth
                domValueRef.current = editor.innerHTML || '';
                frozenValueRef.current = domValueRef.current;
                // Completely ignore prop updates while focused
                ignorePropUpdatesRef.current = true;
                
                // Save current cursor position
                savedPosition = saveCursorPosition();
                
                // Set up MutationObserver to detect DOM changes and restore cursor
                if (!mutationObserver) {
                    mutationObserver = new MutationObserver((mutations) => {
                        // CRITICAL: Don't restore during active typing - this causes backwards typing
                        if (!isFocusedRef.current || isRestoring || isUserTypingRef.current) return;
                        
                        // Also ignore if typing happened very recently (within last 100ms)
                        const timeSinceLastInput = Date.now() - (lastUserInputTimeRef.current || 0);
                        if (timeSinceLastInput < 100) return;
                        
                        // Check if innerHTML actually changed (not just user typing)
                        let externalChange = false;
                        const currentHtml = editor.innerHTML || '';
                        
                        // Only restore if HTML changed externally (not from user input)
                        // User input changes are handled by handleInput, which doesn't trigger mutations we care about
                        if (currentHtml !== domValueRef.current && savedPosition) {
                            externalChange = true;
                        }
                        
                        // If external change detected, restore cursor position
                        if (externalChange) {
                            isRestoring = true;
                            requestAnimationFrame(() => {
                                restoreCursorPosition(savedPosition);
                                // Update saved position after restoration
                                savedPosition = saveCursorPosition();
                                // Update domValueRef to current to prevent false positives
                                domValueRef.current = editor.innerHTML || '';
                                isRestoring = false;
                            });
                        }
                    });
                    
                    mutationObserver.observe(editor, {
                        childList: true,
                        subtree: true,
                        characterData: true,
                        attributes: false
                    });
                }
            }
        };
        
        const handleBlur = (e) => {
            // Only clear focus if we're actually leaving the editor
            // Check if the new active element is still within the editor
            setTimeout(() => {
                if (document.activeElement !== editor && 
                    !editor.contains(document.activeElement)) {
                    isFocusedRef.current = false;
                    savedPosition = null; // Clear saved position on blur
                    
                    // Disconnect MutationObserver
                    if (mutationObserver) {
                        mutationObserver.disconnect();
                        mutationObserver = null;
                    }
                    
                    // Update DOM value ref from actual DOM content before allowing prop updates
                    const finalHtml = editor.innerHTML || '';
                    domValueRef.current = finalHtml;
                    // Sync internal state with DOM content on blur (since we didn't update it during typing)
                    setHtml(finalHtml);
                    // Update last synced value so we can detect actual changes
                    lastSyncedValueRef.current = finalHtml;
                    // Unfreeze value when blurring - allow prop updates again
                    frozenValueRef.current = null;
                    // Allow prop updates again
                    ignorePropUpdatesRef.current = false;
                }
            }, 150); // Small delay to ensure blur event completes and cursor position is stable
        };
        
        // Save cursor position before any potential DOM changes
        const handleBeforeInput = () => {
            if (isFocusedRef.current) {
                // Update domValueRef BEFORE user types to prevent MutationObserver false positives
                domValueRef.current = editor.innerHTML || '';
                savedPosition = saveCursorPosition();
            }
        };
        
        // Save cursor position on selection change (user moving cursor)
        const handleSelectionChange = () => {
            if (isFocusedRef.current && editor.contains(document.activeElement)) {
                savedPosition = saveCursorPosition();
            }
        };
        
        // Use capture phase to catch all focus events
        editor.addEventListener('focusin', handleFocus, true);
        editor.addEventListener('focusout', handleBlur, true);
        editor.addEventListener('focus', handleFocus, true);
        editor.addEventListener('blur', handleBlur, true);
        editor.addEventListener('beforeinput', handleBeforeInput, true);
        document.addEventListener('selectionchange', handleSelectionChange);
        
        // Also check current focus state
        if (document.activeElement === editor || editor.contains(document.activeElement)) {
            isFocusedRef.current = true;
            ignorePropUpdatesRef.current = true;
            savedPosition = saveCursorPosition();
        }
        
        return () => {
            editor.removeEventListener('focusin', handleFocus, true);
            editor.removeEventListener('focusout', handleBlur, true);
            editor.removeEventListener('focus', handleFocus, true);
            editor.removeEventListener('blur', handleBlur, true);
            editor.removeEventListener('beforeinput', handleBeforeInput, true);
            document.removeEventListener('selectionchange', handleSelectionChange);
            if (mutationObserver) {
                mutationObserver.disconnect();
            }
        };
    }, [saveCursorPosition, restoreCursorPosition]); // Include dependencies
    
    // Initialize editor content on mount and set up scroll protection
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        
        // Initialize DOM value ref and last synced value
        if (!domValueRef.current && value) {
            domValueRef.current = value;
            lastSyncedValueRef.current = value;
        }
        
        // Only initialize if editor is empty and not focused
        // CRITICAL: Don't update if editor already has content (user might be typing)
        if (!editor.innerHTML && value && !isFocusedRef.current && !editor.textContent) {
            editor.innerHTML = value;
            setHtml(value);
            domValueRef.current = value;
            lastSyncedValueRef.current = value;
        }
        
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

    // Update editor when value prop changes (external updates)
    // Use useLayoutEffect instead of useEffect for synchronous execution before paint
    // This ensures focus check happens BEFORE any DOM updates
    useLayoutEffect(() => {
        if (isInternalUpdateRef.current) {
            isInternalUpdateRef.current = false;
            return;
        }
        
        if (!editorRef.current) return;
        
        // ABSOLUTE BLOCK: If we're ignoring prop updates, do NOTHING
        // This is the final line of defense - completely disconnect from React updates
        if (ignorePropUpdatesRef.current) {
            // Completely ignore this prop update - DOM content is the source of truth
            return;
        }
        
        // CRITICAL FIX: Multiple checks for focus state - be EXTREMELY defensive
        // Check if editor or any child element is focused
        const activeEl = document.activeElement;
        const editorEl = editorRef.current;
        const isDirectlyFocused = activeEl === editorEl;
        const isChildFocused = activeEl && editorEl && editorEl.contains(activeEl);
        const isCurrentlyFocused = isFocusedRef.current || isDirectlyFocused || isChildFocused;
        const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
        const recentlyTyped = isUserTypingRef.current && timeSinceLastInput < 3000;
        
        // If editor is focused OR user is actively typing, NEVER update innerHTML from props
        // This is the ABSOLUTE KEY to preventing cursor jumps. When focused, the editor
        // is "uncontrolled" and the DOM content is the source of truth.
        if (isCurrentlyFocused || recentlyTyped || frozenValueRef.current !== null) {
            // Editor is focused or user just typed - COMPLETELY IGNORE prop updates
            // Don't touch innerHTML, don't sync state, don't do anything
            return;
        }
        
        // Editor is not focused - safe to update from props
        // Only update if value actually changed AND we haven't already synced this value
        const currentHtml = editorRef.current.innerHTML || '';
        if (value !== lastSyncedValueRef.current && value !== currentHtml && value !== html) {
            setHtml(value || '');
            editorRef.current.innerHTML = value || '';
            domValueRef.current = value || '';
            lastSyncedValueRef.current = value || '';
        }
        
        // Re-apply scroll protection in case React recreated the element
        // Only if protection hasn't been set up yet
        if (editorRef.current && !isScrollProtectionSetupRef.current) {
            setupScrollProtection(editorRef.current);
        }
    }, [value, setupScrollProtection, html]);

    const handleInput = () => {
        if (!editorRef.current) return;
        
        // Mark that user is typing and editor is focused - CRITICAL for cursor preservation
        isFocusedRef.current = true;
        isUserTypingRef.current = true;
        lastUserInputTimeRef.current = Date.now();
        ignorePropUpdatesRef.current = true; // Block ALL prop updates during typing
        
        // Get the current HTML from the editor (this is the ONLY source of truth when user is typing)
        const newHtml = editorRef.current.innerHTML;
        const oldHtml = domValueRef.current || '';
        
        // CRITICAL: Save cursor position IMMEDIATELY before any async operations
        // This is especially important for the first keystroke
        const savedCursorPos = saveCursorPosition();
        
        // Check if this is the first keystroke (empty to first character)
        const isFirstKeystroke = (!oldHtml || oldHtml.trim() === '' || oldHtml === '<br>' || oldHtml === '<p><br></p>') && 
                                  newHtml && newHtml.trim() !== '' && newHtml !== '<br>' && newHtml !== '<p><br></p>';
        
        // CRITICAL: Update domValueRef IMMEDIATELY to prevent MutationObserver from thinking this is an external change
        // This must happen synchronously before any other async operations
        domValueRef.current = newHtml;
        lastSetValueFromUserRef.current = newHtml;
        frozenValueRef.current = newHtml;
        
        // CRITICAL: DO NOT call setHtml here - this causes a re-render which can reset cursor
        // The DOM already has the correct content, and we'll sync state on blur
        // isInternalUpdateRef.current = true; // Not needed if we don't call setHtml
        // setHtml(newHtml); // REMOVED - prevents re-renders during typing
        
        // Function to restore cursor position aggressively
        const restoreCursor = () => {
            if (!editorRef.current || !isFocusedRef.current) return;
            
            // For first keystroke, ensure cursor is at the end of the content
            if (isFirstKeystroke) {
                try {
                    const selection = window.getSelection();
                    if (selection && editorRef.current) {
                        // Move cursor to end of content
                        const range = document.createRange();
                        range.selectNodeContents(editorRef.current);
                        range.collapse(false); // false = collapse to end
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                } catch (e) {
                    // Fallback: try to restore saved position
                    if (savedCursorPos) {
                        restoreCursorPosition(savedCursorPos);
                    }
                }
            } else if (savedCursorPos) {
                // For subsequent keystrokes, restore the saved position
                restoreCursorPosition(savedCursorPos);
            }
        };
        
        // Debounce onChange to prevent too many state updates in parent
        // Clear existing timeout
        const onChangeTimeoutKey = `richTextEditorOnChange_${editorRef.current.id || 'default'}`;
        if (window[onChangeTimeoutKey]) {
            clearTimeout(window[onChangeTimeoutKey]);
        }
        
        // Call onChange after a short delay (but still call it for auto-save)
        // This updates parent state but we prevent parent from re-rendering RichTextEditor by delaying state update
        window[onChangeTimeoutKey] = setTimeout(() => {
            if (onChange) {
                onChange(newHtml);
            }
            
            // CRITICAL: Restore cursor position after onChange might have triggered re-render
            // Use multiple strategies to ensure cursor is restored
            if (isFirstKeystroke) {
                // For first keystroke, be extra aggressive
                queueMicrotask(restoreCursor);
                requestAnimationFrame(() => {
                    restoreCursor();
                    requestAnimationFrame(restoreCursor);
                });
                setTimeout(restoreCursor, 0);
                setTimeout(restoreCursor, 10);
                setTimeout(restoreCursor, 50);
            } else {
                // Normal restoration for subsequent keystrokes
                queueMicrotask(restoreCursor);
                requestAnimationFrame(() => {
                    requestAnimationFrame(restoreCursor);
                });
                setTimeout(restoreCursor, 0);
            }
            
            window[onChangeTimeoutKey] = null;
        }, 150); // Small delay to batch rapid typing and reduce parent re-renders
        
        // Also restore cursor immediately (before onChange delay) to handle fast typing
        if (isFirstKeystroke) {
            queueMicrotask(restoreCursor);
            requestAnimationFrame(restoreCursor);
        }
        
        // Keep typing flag and ignore flag active for longer
        const timeoutKey = `richTextEditorTypingTimeout_${editorRef.current.id || 'default'}`;
        if (window[timeoutKey]) {
            clearTimeout(window[timeoutKey]);
        }
        // Set new timeout - keep flags active for 3 seconds after last input
        window[timeoutKey] = setTimeout(() => {
            isUserTypingRef.current = false;
            // Only clear ignore flag if editor is not focused
            if (!isFocusedRef.current) {
                ignorePropUpdatesRef.current = false;
            }
            window[timeoutKey] = null;
        }, 3000);
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
    // Memoize the component to prevent unnecessary re-renders
    // Custom comparison: if editor is focused in any instance, don't re-render based on value prop
    const MemoizedRichTextEditor = React.memo(RichTextEditor, (prevProps, nextProps) => {
        // Always allow re-render if value actually changed significantly (for initial load)
        // But during typing, React won't call this if we prevent parent re-renders
        return prevProps.value === nextProps.value;
    });
    
    window.RichTextEditor = MemoizedRichTextEditor;
    // Also export unmemoized version in case needed
    window.RichTextEditorUnmemoized = RichTextEditor;
    // Version: 20260109-cursor-fix-v10 - Fixed backwards typing by ignoring mutations during typing
    console.log('✅ RichTextEditor loaded - cursor fix v10 (Fixed backwards typing issue)');
}

