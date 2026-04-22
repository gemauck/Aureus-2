// Rich text editor component with formatting toolbar
const { useState, useRef, useEffect, useLayoutEffect, useCallback } = React;

/** Basic colours — shown in a popover from one toolbar button (avoids a busy inline row in dense grids). */
const BASIC_TEXT_COLORS = [
    { color: '#000000', label: 'Black' },
    { color: '#6b7280', label: 'Gray' },
    { color: '#dc2626', label: 'Red' },
    { color: '#ea580c', label: 'Orange' },
    { color: '#ca8a04', label: 'Amber' },
    { color: '#16a34a', label: 'Green' },
    { color: '#0891b2', label: 'Cyan' },
    { color: '#2563eb', label: 'Blue' },
    { color: '#7c3aed', label: 'Violet' },
    { color: '#db2777', label: 'Pink' }
];

const RichTextEditor = ({ 
    value = '', 
    onChange, 
    onBlur,
    placeholder = 'Type your text...', 
    rows = 4,
    isDark = false,
    className = '',
    id = null,
    name = null,
    /** Dense layout: small toolbar buttons, tighter padding (e.g. tracker grid cells). */
    compact = false
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
    const isFocusedRef = useRef(false); // Track focus state reliably with events
    const ignorePropUpdatesRef = useRef(false); // Completely ignore prop updates when true
    const lastSyncedValueRef = useRef(value || ''); // Track last value we synced from props
    /** Last HTML sent via onChange — prevents applying a stale `value` prop one frame behind (colour “reverting”). */
    const lastOutgoingHtmlRef = useRef(value || '');
    const [colorMenuOpen, setColorMenuOpen] = useState(false);
    const colorMenuWrapRef = useRef(null);
    const savedRangeForColorRef = useRef(null);

    const saveSelectionForColor = useCallback(() => {
        if (!editorRef.current) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!editorRef.current.contains(range.commonAncestorContainer)) return;
        try {
            savedRangeForColorRef.current = range.cloneRange();
        } catch (_) {
            savedRangeForColorRef.current = null;
        }
    }, []);

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
                domValueRef.current = editor.innerHTML || '';
                ignorePropUpdatesRef.current = true;
                
                // Save current cursor position
                savedPosition = saveCursorPosition();
                // Also save to ref so handleInput can access it
                savedCursorPositionRef.current = savedPosition;
                
                // Set up MutationObserver to detect DOM changes and restore cursor
                if (!mutationObserver) {
                    mutationObserver = new MutationObserver((mutations) => {
                        // Simple: Only restore cursor after auto-save when user is NOT typing
                        if (isUserTypingRef.current) {
                            // User is typing - do nothing, let browser handle it
                            return;
                        }
                        
                        // Only restore if user hasn't typed for 2+ seconds (auto-save scenario)
                        const timeSinceLastInput = Date.now() - (lastUserInputTimeRef.current || 0);
                        if (timeSinceLastInput < 2000) {
                            // Too recent - might still be processing
                            return;
                        }
                        
                        // Restore cursor only if React updated the DOM (auto-save)
                        if (isFocusedRef.current && savedCursorPositionRef.current) {
                            const currentHtml = editor.innerHTML || '';
                            if (currentHtml !== domValueRef.current) {
                                // React updated DOM - restore cursor
                                restoreCursorPosition(savedCursorPositionRef.current);
                                domValueRef.current = currentHtml;
                            }
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
                    lastOutgoingHtmlRef.current = finalHtml;
                    // Allow prop updates again
                    ignorePropUpdatesRef.current = false;
                }
            }, 150); // Small delay to ensure blur event completes and cursor position is stable
        };
        
        // Simple: just mark that user is typing - block React updates
        const handleBeforeInput = () => {
            if (isFocusedRef.current) {
                isUserTypingRef.current = true;
                lastUserInputTimeRef.current = Date.now();
                ignorePropUpdatesRef.current = true;
                domValueRef.current = editor.innerHTML || '';
            }
        };
        
        // Save cursor position on selection change (user moving cursor)
        const handleSelectionChange = () => {
            if (isFocusedRef.current && editor.contains(document.activeElement)) {
                savedPosition = saveCursorPosition();
                // Also save to ref so handleInput can access it
                savedCursorPositionRef.current = savedPosition;
            }
        };
        
        // Save cursor position on mouse down (user clicking in editor)
        const handleMouseDown = () => {
            if (editor.contains(document.activeElement) || editor === document.activeElement) {
                // Small delay to ensure selection is set after click
                setTimeout(() => {
                    if (editor.contains(document.activeElement) || editor === document.activeElement) {
                        savedPosition = saveCursorPosition();
                        savedCursorPositionRef.current = savedPosition;
                    }
                }, 0);
            }
        };
        
        // Use capture phase to catch all focus events
        editor.addEventListener('focusin', handleFocus, true);
        editor.addEventListener('focusout', handleBlur, true);
        editor.addEventListener('focus', handleFocus, true);
        editor.addEventListener('blur', handleBlur, true);
        editor.addEventListener('beforeinput', handleBeforeInput, true);
        editor.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('selectionchange', handleSelectionChange);
        
        // Also check current focus state
        if (document.activeElement === editor || editor.contains(document.activeElement)) {
            isFocusedRef.current = true;
            ignorePropUpdatesRef.current = true;
            savedPosition = saveCursorPosition();
            // Also save to ref so handleInput can access it
            savedCursorPositionRef.current = savedPosition;
        }
        
        return () => {
            editor.removeEventListener('focusin', handleFocus, true);
            editor.removeEventListener('focusout', handleBlur, true);
            editor.removeEventListener('focus', handleFocus, true);
            editor.removeEventListener('blur', handleBlur, true);
            editor.removeEventListener('beforeinput', handleBeforeInput, true);
            editor.removeEventListener('mousedown', handleMouseDown, true);
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
        
        // Simple: If editor is focused or user is typing, don't update from props
        // Let the browser handle everything naturally
        const activeEl = document.activeElement;
        const editorEl = editorRef.current;
        const isCurrentlyFocused = isFocusedRef.current || 
                                   activeEl === editorEl || 
                                   (activeEl && editorEl && editorEl.contains(activeEl));
        const timeSinceLastInput = Date.now() - lastUserInputTimeRef.current;
        const recentlyTyped = isUserTypingRef.current && timeSinceLastInput < 2000;
        
        if (isCurrentlyFocused || recentlyTyped) {
            // User is interacting - don't touch the DOM, let browser handle it
            return;
        }
        
        // Editor is not focused - safe to update from props
        // Only update if value actually changed AND we haven't already synced this value
        const currentHtml = editorRef.current.innerHTML || '';
        if (value !== lastSyncedValueRef.current && value !== currentHtml && value !== html) {
            // Parent `value` often lags one render behind the HTML we already onChange’d (blur + batched setState).
            if (
                lastOutgoingHtmlRef.current != null &&
                lastOutgoingHtmlRef.current !== '' &&
                currentHtml === lastOutgoingHtmlRef.current &&
                value !== lastOutgoingHtmlRef.current
            ) {
                return;
            }
            setHtml(value || '');
            editorRef.current.innerHTML = value || '';
            domValueRef.current = value || '';
            lastSyncedValueRef.current = value || '';
            lastOutgoingHtmlRef.current = value || '';
        }
        
        // Re-apply scroll protection in case React recreated the element
        // Only if protection hasn't been set up yet
        if (editorRef.current && !isScrollProtectionSetupRef.current) {
            setupScrollProtection(editorRef.current);
        }
    }, [value, setupScrollProtection, html]);

    useEffect(() => {
        if (!colorMenuOpen) return undefined;
        const onDocMouseDown = (e) => {
            if (colorMenuWrapRef.current && !colorMenuWrapRef.current.contains(e.target)) {
                setColorMenuOpen(false);
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setColorMenuOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDocMouseDown, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [colorMenuOpen]);

    /** Toolbar execCommand: notify parent immediately so value prop does not stomp colour. Typing: debounce. */
    const handleInput = (immediate = false) => {
        if (!editorRef.current) return;
        
        isFocusedRef.current = true;
        isUserTypingRef.current = true;
        lastUserInputTimeRef.current = Date.now();
        ignorePropUpdatesRef.current = true;
        
        const newHtml = editorRef.current.innerHTML;
        domValueRef.current = newHtml;
        savedCursorPositionRef.current = saveCursorPosition();

        const onChangeTimeoutKey = `richTextEditorOnChange_${editorRef.current.id || 'default'}`;
        if (window[onChangeTimeoutKey]) {
            clearTimeout(window[onChangeTimeoutKey]);
            window[onChangeTimeoutKey] = null;
        }
        
        if (immediate) {
            lastSyncedValueRef.current = newHtml;
            setHtml(newHtml);
            lastOutgoingHtmlRef.current = newHtml;
            if (onChange) {
                onChange(newHtml);
            }
        } else {
            window[onChangeTimeoutKey] = setTimeout(() => {
                if (onChange) {
                    onChange(newHtml);
                }
                lastOutgoingHtmlRef.current = newHtml;
                window[onChangeTimeoutKey] = null;
            }, 200);
        }
        
        const timeoutKey = `richTextEditorTypingTimeout_${editorRef.current.id || 'default'}`;
        if (window[timeoutKey]) {
            clearTimeout(window[timeoutKey]);
        }
        window[timeoutKey] = setTimeout(() => {
            isUserTypingRef.current = false;
            if (!isFocusedRef.current) {
                ignorePropUpdatesRef.current = false;
            }
            window[timeoutKey] = null;
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
                    handleInput(true);
                    return;
                }
            }
            
            // For other commands
            const success = document.execCommand(command, false, value);
            if (success) {
                handleInput(true);
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
            className={
                compact
                    ? `p-0.5 rounded-sm leading-none hover:bg-opacity-70 transition ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`
                    : `p-1.5 rounded hover:bg-opacity-70 transition ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`
            }
            title={label}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
        >
            <i className={`fas ${icon} ${compact ? 'text-[10px]' : 'text-sm'}`}></i>
        </button>
    );

    const tbDivider = (
        <div
            className={`w-px shrink-0 ${compact ? 'h-3 mx-0.5' : 'h-4 mx-1'} ${isDark ? 'bg-slate-600' : 'bg-gray-300'}`}
            aria-hidden
        />
    );

    return (
        <div
            className={`border ${compact ? 'rounded-md' : 'rounded-lg'} ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} ${className}`}
        >
            {/* Toolbar */}
            <div
                className={`flex items-center border-b ${compact ? 'flex-wrap gap-0.5 px-1 py-0.5' : 'gap-1 p-2'} ${isDark ? 'border-slate-600' : 'border-gray-200'}`}
            >
                {getToolbarButton('fa-bold', 'bold', 'Bold')}
                {getToolbarButton('fa-italic', 'italic', 'Italic')}
                {getToolbarButton('fa-underline', 'underline', 'Underline')}
                <div className="relative shrink-0" ref={colorMenuWrapRef}>
                    <button
                        type="button"
                        title="Text color"
                        aria-label="Text color"
                        aria-haspopup="listbox"
                        aria-expanded={colorMenuOpen}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            saveSelectionForColor();
                        }}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setColorMenuOpen((open) => !open);
                        }}
                        className={
                            compact
                                ? `p-0.5 rounded-sm leading-none hover:bg-opacity-70 transition ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'} ${colorMenuOpen ? (isDark ? 'bg-gray-700' : 'bg-gray-200') : ''}`
                                : `p-1.5 rounded hover:bg-opacity-70 transition ${isDark ? 'hover:bg-gray-700 text-gray-300' : 'hover:bg-gray-200 text-gray-600'} ${colorMenuOpen ? (isDark ? 'bg-gray-700' : 'bg-gray-200') : ''}`
                        }
                    >
                        <i className={`fas fa-palette ${compact ? 'text-[10px]' : 'text-sm'}`} />
                    </button>
                    {colorMenuOpen ? (
                        <div
                            className={`absolute left-0 top-full z-[300] mt-0.5 min-w-[7.5rem] rounded-md border p-1.5 shadow-lg grid grid-cols-5 gap-1 ${
                                isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-200'
                            }`}
                            role="listbox"
                            aria-label="Text colors"
                        >
                            {BASIC_TEXT_COLORS.map(({ color, label }) => (
                                <button
                                    key={color}
                                    type="button"
                                    title={label}
                                    aria-label={label}
                                    role="option"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!editorRef.current) return;
                                        editorRef.current.focus();
                                        if (savedRangeForColorRef.current) {
                                            const sel = window.getSelection();
                                            try {
                                                sel.removeAllRanges();
                                                sel.addRange(savedRangeForColorRef.current);
                                            } catch (_) {
                                                /* range invalid */
                                            }
                                        }
                                        handleCommand('foreColor', color);
                                        setColorMenuOpen(false);
                                    }}
                                    className="rounded p-0.5 hover:ring-2 hover:ring-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                >
                                    <span
                                        className={`block rounded-full ring-1 ring-black/20 mx-auto ${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'}`}
                                        style={{ backgroundColor: color }}
                                    />
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                {tbDivider}
                {getToolbarButton('fa-list-ul', 'insertUnorderedList', 'Bullet List')}
                {getToolbarButton('fa-list-ol', 'insertOrderedList', 'Numbered List')}
                {tbDivider}
                {getToolbarButton('fa-align-left', 'justifyLeft', 'Align Left')}
                {getToolbarButton('fa-align-center', 'justifyCenter', 'Align Center')}
                {getToolbarButton('fa-align-right', 'justifyRight', 'Align Right')}
            </div>

            {/* Editor */}
            <div
                ref={editorRef}
                id={id || undefined}
                contentEditable
                onInput={() => handleInput(false)}
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
                className={`${compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'} outline-none cursor-text ${isDark ? 'text-slate-100' : 'text-gray-900'}`}
                style={{ 
                    minHeight: compact ? `${Math.max(rows, 2) * 1.125}rem` : `${rows * 1.5}rem`,
                    height: compact ? `${Math.max(rows, 2) * 1.125}rem` : undefined,
                    maxHeight: compact ? `${Math.max(rows, 2) * 1.125}rem` : '400px',
                    overflowY: 'auto',
                    cursor: 'text'
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
                    cursor: text !important;
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
                    id={id ? `${id}-richform` : undefined}
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

