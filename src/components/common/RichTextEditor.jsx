// Rich text editor component with formatting toolbar
const { useState, useRef, useEffect } = React;

const RichTextEditor = ({ 
    value = '', 
    onChange, 
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

    // Initialize editor content on mount
    useEffect(() => {
        if (editorRef.current && !editorRef.current.innerHTML && value) {
            editorRef.current.innerHTML = value;
            setHtml(value);
        }
    }, []);

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
    }, [value]);

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

