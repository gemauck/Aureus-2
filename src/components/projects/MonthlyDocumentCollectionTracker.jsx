// Get React hooks from window
const { useState, useEffect, useRef, useCallback } = React;
const storage = window.storage;
const STICKY_COLUMN_SHADOW = '4px 0 12px rgba(15, 23, 42, 0.08)';

const MonthlyDocumentCollectionTracker = ({ project, onBack }) => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth(); // 0-11
    
    // Calculate working months (2 months in arrears from current month)
    const getWorkingMonths = () => {
        const twoMonthsBack = currentMonth - 2 < 0 ? currentMonth - 2 + 12 : currentMonth - 2;
        const oneMonthBack = currentMonth - 1 < 0 ? currentMonth - 1 + 12 : currentMonth - 1;
        return [twoMonthsBack, oneMonthBack];
    };
    
    const workingMonths = getWorkingMonths();
    
    const tableRef = useRef(null);
    const monthRefs = useRef({});
    const hasInitialScrolled = useRef(false);
    const saveTimeoutRef = useRef(null);
    const isSavingRef = useRef(false);

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Year selection with persistence
    const YEAR_STORAGE_PREFIX = 'documentCollectionSelectedYear_';
    const getInitialSelectedYear = () => {
        if (typeof window !== 'undefined' && project?.id) {
            const storedYear = localStorage.getItem(`${YEAR_STORAGE_PREFIX}${project.id}`);
            const parsedYear = storedYear ? parseInt(storedYear, 10) : NaN;
            if (!Number.isNaN(parsedYear)) {
                return parsedYear;
            }
        }
        return currentYear;
    };
    
    const [selectedYear, setSelectedYear] = useState(getInitialSelectedYear);
    
    // Parse documentSections safely
    const parseSections = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        
        try {
            if (typeof data === 'string') {
                let cleaned = data.trim();
                if (!cleaned) return [];
                
                let attempts = 0;
                while (attempts < 10) {
                    try {
                        const parsed = JSON.parse(cleaned);
                        if (Array.isArray(parsed)) return parsed;
                        if (typeof parsed === 'string') {
                            cleaned = parsed;
                            attempts++;
                            continue;
                        }
                        return [];
                    } catch (parseError) {
                        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
                            cleaned = cleaned.slice(1, -1);
                        }
                        cleaned = cleaned.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                        attempts++;
                        if (attempts >= 10) {
                            console.warn('Failed to parse documentSections after', attempts, 'attempts');
                            return [];
                        }
                    }
                }
                return [];
            }
        } catch (e) {
            console.warn('Failed to parse documentSections:', e);
            return [];
        }
        return [];
    };
    
    // ============================================================
    // SIMPLIFIED STATE MANAGEMENT - Single source of truth
    // ============================================================
    
    // Main data state - loaded from database
    const [sections, setSections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // Templates state
    const [templates, setTemplates] = useState([]);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    
    // UI state
    const [showSectionModal, setShowSectionModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
    const [showTemplateList, setShowTemplateList] = useState(true);
    const [editingSection, setEditingSection] = useState(null);
    const [editingDocument, setEditingDocument] = useState(null);
    const [editingSectionId, setEditingSectionId] = useState(null);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [draggedSection, setDraggedSection] = useState(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const [draggedDocument, setDraggedDocument] = useState(null);
    const [dragOverDocumentIndex, setDragOverDocumentIndex] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [hoverCommentCell, setHoverCommentCell] = useState(null);
    const [quickComment, setQuickComment] = useState('');
    const [commentPopupPosition, setCommentPopupPosition] = useState({ top: 0, left: 0 });
    const commentPopupContainerRef = useRef(null);
    
    // ============================================================
    // LOAD DATA FROM DATABASE ON MOUNT
    // ============================================================
    
    useEffect(() => {
        console.log('📋 MonthlyDocumentCollectionTracker: Loading data from database');
        loadFromDatabase();
    }, [project?.id]); // Reload when project changes
    
    const loadFromDatabase = async () => {
        if (!project?.id) return;
        
        setIsLoading(true);
        try {
            // Parse sections from project data
            const parsed = parseSections(project.documentSections);
            console.log('✅ Loaded sections from project:', parsed.length, 'sections');
            setSections(parsed);
        } catch (error) {
            console.error('❌ Error loading sections:', error);
            setSections([]);
        } finally {
            setIsLoading(false);
        }
    };
    
    // ============================================================
    // SIMPLE AUTO-SAVE - Debounced, saves entire state
    // ============================================================
    
    useEffect(() => {
        // Don't save while loading initial data
        if (isLoading) return;
        
        // Don't save if no sections (initial state)
        if (sections.length === 0 && !project?.documentSections) return;
        
        // Clear any pending save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        
        // Debounce save by 1 second
        saveTimeoutRef.current = setTimeout(() => {
            saveToDatabase();
        }, 1000);
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [sections, isLoading]);
    
    const saveToDatabase = async () => {
        if (isSavingRef.current) {
            console.log('⏭️ Save already in progress, skipping');
            return;
        }
        
        if (!project?.id) return;
        
        isSavingRef.current = true;
        
        try {
            console.log('💾 Saving sections to database:', sections.length, 'sections');
            
            if (!window.DatabaseAPI || typeof window.DatabaseAPI.updateProject !== 'function') {
                throw new Error('DatabaseAPI.updateProject is not available');
            }
            
            const updatePayload = {
                documentSections: JSON.stringify(sections)
            };
            
            await window.DatabaseAPI.updateProject(project.id, updatePayload);
            console.log('✅ Save successful');
            
        } catch (error) {
            console.error('❌ Error saving to database:', error);
        } finally {
            isSavingRef.current = false;
        }
    };
    
    // ============================================================
    // TEMPLATE MANAGEMENT - Backend storage with localStorage fallback
    // ============================================================
    
    const TEMPLATES_STORAGE_KEY = 'documentCollectionTemplates';
    
    const loadTemplates = async () => {
        console.log('📂 Loading templates...');
        setIsLoadingTemplates(true);
        
        try {
            // Try to load from API first
            const token = window.storage?.getToken?.();
            if (token) {
                const response = await fetch('/api/document-collection-templates', {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    // API wraps response in { data: { templates: [...] } }
                    const apiTemplates = data?.data?.templates || data?.templates || [];
                    
                    // Ensure sections are parsed for each template
                    const parsedTemplates = apiTemplates.map(t => ({
                        ...t,
                        sections: parseSections(t.sections)
                    }));
                    
                    console.log('✅ Loaded', parsedTemplates.length, 'templates from API');
                    setTemplates(parsedTemplates);
                    
                    // Save to localStorage as backup
                    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(parsedTemplates));
                    return;
                }
            }
            
            // Fallback to localStorage
            const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY);
            if (stored) {
                const parsedTemplates = JSON.parse(stored).map(t => ({
                    ...t,
                    sections: parseSections(t.sections)
                }));
                console.log('✅ Loaded', parsedTemplates.length, 'templates from localStorage');
                setTemplates(parsedTemplates);
            } else {
                console.log('📭 No templates found');
                setTemplates([]);
            }
        } catch (error) {
            console.error('❌ Error loading templates:', error);
            setTemplates([]);
        } finally {
            setIsLoadingTemplates(false);
        }
    };
    
    // Load templates when modal opens
    useEffect(() => {
        if (showTemplateModal || showApplyTemplateModal) {
            loadTemplates();
        }
    }, [showTemplateModal, showApplyTemplateModal]);
    
    const saveTemplate = async (templateData) => {
        try {
            const token = window.storage?.getToken?.();
            const currentUser = getCurrentUser();
            
            let savedTemplate;
            
            if (editingTemplate) {
                // Update existing template
                if (token && typeof editingTemplate.id === 'string' && editingTemplate.id.length > 15) {
                    // Update via API (database template)
                    const response = await fetch(`/api/document-collection-templates/${editingTemplate.id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(templateData)
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        // API wraps response in { data: { template: {...} } }
                        savedTemplate = data?.data?.template || data?.template;
                    } else {
                        throw new Error('Failed to update template');
                    }
                } else {
                    // Update locally (localStorage template)
                    savedTemplate = {
                        ...editingTemplate,
                        ...templateData,
                        updatedAt: new Date().toISOString(),
                        updatedBy: currentUser.name || currentUser.email
                    };
                }
                
                setTemplates(prev => prev.map(t => t.id === editingTemplate.id ? savedTemplate : t));
            } else {
                // Create new template
                if (token) {
                    // Create via API
                    const response = await fetch('/api/document-collection-templates', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(templateData)
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        // API wraps response in { data: { template: {...} } }
                        savedTemplate = data?.data?.template || data?.template;
                    } else {
                        throw new Error('Failed to create template');
                    }
                } else {
                    // Create locally
                    savedTemplate = {
                        id: Date.now().toString(),
                        ...templateData,
                        createdAt: new Date().toISOString(),
                        createdBy: currentUser.name || currentUser.email,
                        updatedAt: new Date().toISOString(),
                        updatedBy: currentUser.name || currentUser.email
                    };
                }
                
                setTemplates(prev => [...prev, savedTemplate]);
            }
            
            // Update localStorage
            const updatedTemplates = editingTemplate 
                ? templates.map(t => t.id === editingTemplate.id ? savedTemplate : t)
                : [...templates, savedTemplate];
            localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updatedTemplates));
            
            console.log('✅ Template saved successfully');
            setEditingTemplate(null);
            setShowTemplateList(true);
            
        } catch (error) {
            console.error('❌ Error saving template:', error);
            alert('Failed to save template: ' + error.message);
        }
    };
    
    const deleteTemplate = async (templateId) => {
        if (!confirm('Delete this template? This action cannot be undone.')) {
            return;
        }
        
        try {
            const token = window.storage?.getToken?.();
            const template = templates.find(t => String(t.id) === String(templateId));
            
            if (!template) {
                throw new Error('Template not found');
            }
            
            console.log('🗑️ Deleting template:', templateId, 'Template:', template);
            
            // Always try API first if we have a token
            if (token) {
                console.log('🗑️ Attempting to delete from database:', templateId);
                try {
                    const response = await fetch(`/api/document-collection-templates/${encodeURIComponent(templateId)}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        console.log('✅ Template deleted from database');
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        const errorMessage = errorData.error?.message || `API returned ${response.status}`;
                        
                        // If it's a 404, the template doesn't exist in DB, so it's a localStorage template
                        if (response.status === 404) {
                            console.log('⚠️ Template not found in database (likely localStorage template), continuing...');
                        } else {
                            // For other errors, still try to delete from localStorage but show warning
                            console.warn('⚠️ API deletion failed:', errorMessage, 'Will still remove from localStorage');
                        }
                    }
                } catch (apiError) {
                    console.warn('⚠️ API deletion error (network/connection issue):', apiError.message);
                    // Continue with localStorage deletion as fallback
                }
            } else {
                console.log('🗑️ No auth token, deleting from localStorage only:', templateId);
            }
            
            // Always update local state and localStorage (removes from UI immediately)
            const updatedTemplates = templates.filter(t => String(t.id) !== String(templateId));
            setTemplates(updatedTemplates);
            localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(updatedTemplates));
            
            console.log('✅ Template deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting template:', error);
            alert('Failed to delete template: ' + error.message);
        }
    };
    
    const applyTemplate = async (template, targetYear) => {
        if (!template || !Array.isArray(template.sections) || template.sections.length === 0) {
            alert('Template is empty or invalid');
            return;
        }
        
        console.log('🎨 Applying template:', template.name);
        
        // Create new sections from template
        const newSections = template.sections.map(section => ({
            id: Date.now() + Math.random(),
            name: section.name,
            description: section.description || '',
            documents: Array.isArray(section.documents) ? section.documents.map(doc => ({
                id: Date.now() + Math.random(),
                name: doc.name,
                description: doc.description || '',
                collectionStatus: {},
                comments: {}
            })) : []
        }));
        
        // Merge with existing sections
        setSections(prev => [...prev, ...newSections]);
        
        console.log('✅ Template applied:', newSections.length, 'sections added');
        setShowApplyTemplateModal(false);
        
        // Save will happen automatically via useEffect
    };
    
    // ============================================================
    // USER INFO HELPER
    // ============================================================
    
    const getCurrentUser = () => {
        const defaultUser = { name: 'System', email: 'system', id: 'system', role: 'System' };
        
        try {
            const userData = localStorage.getItem('abcotronics_user');
            if (userData && userData !== 'null' && userData !== 'undefined') {
                const parsed = JSON.parse(userData);
                const user = parsed.user || parsed;
                
                if (user && (user.name || user.email)) {
                    return {
                        name: user.name || user.email || 'System',
                        email: user.email || 'system',
                        id: user.id || user._id || user.email || 'system',
                        role: user.role || 'System'
                    };
                }
            }
        } catch (error) {
            console.warn('Failed to get user:', error);
        }
        
        return defaultUser;
    };
    
    // ============================================================
    // YEAR SELECTION
    // ============================================================
    
    const handleYearChange = (year) => {
        setSelectedYear(year);
        if (project?.id && typeof window !== 'undefined') {
            localStorage.setItem(`${YEAR_STORAGE_PREFIX}${project.id}`, String(year));
        }
    };
    
    const MIN_YEAR = 2015;
    const FUTURE_YEAR_BUFFER = 5;
    const yearOptions = [];
    for (let i = MIN_YEAR; i <= currentYear + FUTURE_YEAR_BUFFER; i++) {
        yearOptions.push(i);
    }
    
    // ============================================================
    // STATUS OPTIONS
    // ============================================================
    
    const statusOptions = [
        { value: 'not-collected', label: 'Not Collected', color: 'bg-red-400 text-white font-semibold', cellColor: 'bg-red-400 border-l-4 border-red-700 shadow-sm' },
        { value: 'ongoing', label: 'Collection Ongoing', color: 'bg-yellow-400 text-white font-semibold', cellColor: 'bg-yellow-400 border-l-4 border-yellow-700 shadow-sm' },
        { value: 'collected', label: 'Collected', color: 'bg-green-500 text-white font-semibold', cellColor: 'bg-green-500 border-l-4 border-green-700 shadow-sm' },
        { value: 'unavailable', label: 'Unavailable', color: 'bg-gray-400 text-white font-semibold', cellColor: 'bg-gray-400 border-l-4 border-gray-700 shadow-sm' }
    ];
    
    const getStatusConfig = (status) => {
        return statusOptions.find(opt => opt.value === status) || statusOptions[0];
    };
    
    // ============================================================
    // SECTION CRUD
    // ============================================================
    
    const handleAddSection = () => {
        setEditingSection(null);
        setShowSectionModal(true);
    };
    
    const handleEditSection = (section) => {
        setEditingSection(section);
        setShowSectionModal(true);
    };
    
    const handleSaveSection = (sectionData) => {
        if (editingSection) {
            setSections(prev => prev.map(s => 
                s.id === editingSection.id ? { ...s, ...sectionData } : s
            ));
            console.log('📝 Updated section:', sectionData.name);
        } else {
            const newSection = {
                id: Date.now(),
                ...sectionData,
                documents: []
            };
            setSections(prev => [...prev, newSection]);
            console.log('➕ Added section:', sectionData.name);
        }
        
        setShowSectionModal(false);
        setEditingSection(null);
    };
    
    const handleDeleteSection = (sectionId) => {
        const section = sections.find(s => s.id === sectionId);
        if (!section) return;
        
        if (!confirm(`Delete section "${section.name}" and all its documents?`)) {
            return;
        }
        
        setSections(prev => prev.filter(s => s.id !== sectionId));
        console.log('🗑️ Deleted section:', section.name);
    };
    
    // ============================================================
    // DOCUMENT CRUD
    // ============================================================
    
    const handleAddDocument = (sectionId) => {
        if (!sectionId) {
            alert('Error: Cannot add document. Section ID is missing.');
            return;
        }
        setEditingSectionId(sectionId);
        setEditingDocument(null);
        setShowDocumentModal(true);
    };
    
    const handleEditDocument = (section, document) => {
        setEditingSectionId(section.id);
        setEditingDocument(document);
        setShowDocumentModal(true);
    };
    
    const handleSaveDocument = (documentData) => {
        if (!editingSectionId) {
            alert('Error: No section selected.');
            return;
        }
        
        setSections(prev => prev.map(section => {
            if (section.id === editingSectionId) {
                if (editingDocument) {
                    // Update existing document
                    return {
                        ...section,
                        documents: section.documents.map(doc => 
                            doc.id === editingDocument.id 
                                ? { ...doc, ...documentData }
                                : doc
                        )
                    };
                } else {
                    // Add new document
                    const newDocument = {
                        id: Date.now(),
                        ...documentData,
                        collectionStatus: documentData.collectionStatus || {},
                        comments: documentData.comments || {}
                    };
                    return {
                        ...section,
                        documents: [...section.documents, newDocument]
                    };
                }
            }
            return section;
        }));
        
        setShowDocumentModal(false);
        setEditingDocument(null);
        setEditingSectionId(null);
    };
    
    const handleDeleteDocument = (sectionId, documentId) => {
        if (!confirm('Delete this document/data item?')) {
            return;
        }
        
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.filter(doc => doc.id !== documentId)
                };
            }
            return section;
        }));
    };
    
    // ============================================================
    // STATUS AND COMMENTS
    // ============================================================
    
    const handleUpdateStatus = (sectionId, documentId, month, status) => {
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                        if (doc.id === documentId) {
                            const monthKey = `${month}-${selectedYear}`;
                            return {
                                ...doc,
                                collectionStatus: {
                                    ...doc.collectionStatus,
                                    [monthKey]: status
                                }
                            };
                        }
                        return doc;
                    })
                };
            }
            return section;
        }));
    };
    
    const handleAddComment = (sectionId, documentId, month, commentText) => {
        if (!commentText.trim()) return;
        
        const currentUser = getCurrentUser();
        const monthKey = `${month}-${selectedYear}`;
        const newComment = {
            id: Date.now(),
            text: commentText,
            date: new Date().toISOString(),
            author: currentUser.name,
            authorEmail: currentUser.email,
            authorId: currentUser.id
        };
        
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                        if (doc.id === documentId) {
                            const existingComments = doc.comments?.[monthKey] || [];
                            return {
                                ...doc,
                                comments: {
                                    ...doc.comments,
                                    [monthKey]: [...existingComments, newComment]
                                }
                            };
                        }
                        return doc;
                    })
                };
            }
            return section;
        }));
        
        setQuickComment('');
    };
    
    const handleDeleteComment = (sectionId, documentId, month, commentId) => {
        const currentUser = getCurrentUser();
        const section = sections.find(s => s.id === sectionId);
        const document = section?.documents.find(d => d.id === documentId);
        const comment = document?.comments?.[`${month}-${selectedYear}`]?.find(c => c.id === commentId);
        
        const canDelete = comment?.authorId === currentUser.id || 
                         currentUser.role === 'Admin' || 
                         currentUser.role === 'Administrator';
        
        if (!canDelete) {
            alert('You can only delete your own comments or need admin privileges.');
            return;
        }
        
        if (!confirm('Delete this comment?')) return;
        
        const monthKey = `${month}-${selectedYear}`;
        
        setSections(prev => prev.map(section => {
            if (section.id === sectionId) {
                return {
                    ...section,
                    documents: section.documents.map(doc => {
                        if (doc.id === documentId) {
                            const existingComments = doc.comments?.[monthKey] || [];
                            return {
                                ...doc,
                                comments: {
                                    ...doc.comments,
                                    [monthKey]: existingComments.filter(c => c.id !== commentId)
                                }
                            };
                        }
                        return doc;
                    })
                };
            }
            return section;
        }));
    };
    
    const getDocumentStatus = (document, month) => {
        const monthKey = `${month}-${selectedYear}`;
        return document.collectionStatus?.[monthKey] || null;
    };
    
    const getDocumentComments = (document, month) => {
        const monthKey = `${month}-${selectedYear}`;
        return document.comments?.[monthKey] || [];
    };
    
    // ============================================================
    // DRAG AND DROP
    // ============================================================
    
    const handleSectionDragStart = (e, section, index) => {
        setDraggedSection({ section, index });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => e.currentTarget.style.opacity = '0.5', 0);
    };
    
    const handleSectionDragEnd = (e) => {
        e.currentTarget.style.opacity = '1';
        setDraggedSection(null);
        setDragOverIndex(null);
    };
    
    const handleSectionDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedSection && draggedSection.index !== dropIndex) {
            setSections(prev => {
                const reordered = [...prev];
                const [removed] = reordered.splice(draggedSection.index, 1);
                reordered.splice(dropIndex, 0, removed);
                return reordered;
            });
        }
        setDragOverIndex(null);
    };
    
    // ============================================================
    // EXCEL EXPORT
    // ============================================================
    
    const handleExportToExcel = async () => {
        setIsExporting(true);
        try {
            let XLSX = window.XLSX;
            
            // Wait for XLSX to load
            if (!XLSX || !XLSX.utils) {
                for (let i = 0; i < 30 && (!XLSX || !XLSX.utils); i++) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    XLSX = window.XLSX;
                }
            }
            
            if (!XLSX || !XLSX.utils) {
                throw new Error('XLSX library not available. Please refresh the page.');
            }
            
            // Prepare data
            const excelData = [];
            const headerRow1 = ['Section / Document'];
            const headerRow2 = [''];
            
            months.forEach(month => {
                const monthYear = `${month.slice(0, 3)} '${String(selectedYear).slice(-2)}`;
                headerRow1.push(monthYear, '');
                headerRow2.push('Status', 'Comments');
            });
            
            excelData.push(headerRow1, headerRow2);
            
            sections.forEach(section => {
                const sectionRow = [section.name];
                for (let i = 0; i < 24; i++) sectionRow.push('');
                excelData.push(sectionRow);
                
                section.documents.forEach(document => {
                    const row = [`  ${document.name}${document.description ? ' - ' + document.description : ''}`];
                    
                    months.forEach(month => {
                        const monthKey = `${month}-${selectedYear}`;
                        const status = document.collectionStatus?.[monthKey];
                        const statusLabel = status ? statusOptions.find(s => s.value === status)?.label : '';
                        row.push(statusLabel || '');
                        
                        const comments = document.comments?.[monthKey] || [];
                        const commentsText = comments.map(c => {
                            const date = new Date(c.date).toLocaleString('en-ZA', {
                                year: 'numeric', month: 'short', day: '2-digit',
                                hour: '2-digit', minute: '2-digit'
                            });
                            return `[${date}] ${c.author}: ${c.text}`;
                        }).join('\n\n');
                        row.push(commentsText);
                    });
                    
                    excelData.push(row);
                });
            });
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            
            const colWidths = [{ wch: 40 }];
            for (let i = 0; i < 12; i++) {
                colWidths.push({ wch: 18 }, { wch: 50 });
            }
            ws['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(wb, ws, `Doc Collection ${selectedYear}`);
            
            const filename = `${project.name}_Document_Collection_${selectedYear}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, filename);
            
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Failed to export: ' + error.message);
        } finally {
            setIsExporting(false);
        }
    };
    
    // ============================================================
    // SCROLL TO WORKING MONTHS
    // ============================================================
    
    useEffect(() => {
        if (!hasInitialScrolled.current && sections.length > 0 && tableRef.current && selectedYear === currentYear) {
            setTimeout(() => {
                const firstWorkingMonthName = months[workingMonths[0]];
                const firstMonthElement = monthRefs.current[firstWorkingMonthName];
                
                if (firstMonthElement && tableRef.current) {
                    const container = tableRef.current;
                    const elementLeft = firstMonthElement.offsetLeft;
                    const documentColumnWidth = 250;
                    const scrollPosition = elementLeft - documentColumnWidth - 100;
                    
                    container.scrollTo({
                        left: Math.max(0, scrollPosition),
                        behavior: 'smooth'
                    });
                }
                hasInitialScrolled.current = true;
            }, 100);
        }
    }, [sections, selectedYear]);
    
    // ============================================================
    // COMMENT POPUP MANAGEMENT
    // ============================================================
    
    useEffect(() => {
        if (hoverCommentCell && commentPopupContainerRef.current) {
            setTimeout(() => {
                if (commentPopupContainerRef.current) {
                    commentPopupContainerRef.current.scrollTop = commentPopupContainerRef.current.scrollHeight;
                }
            }, 100);
        }
    }, [hoverCommentCell, sections]);
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            const isCommentButton = event.target.closest('[data-comment-cell]');
            const isInsidePopup = event.target.closest('.comment-popup');
            
            if (hoverCommentCell && !isCommentButton && !isInsidePopup) {
                setHoverCommentCell(null);
                setQuickComment('');
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [hoverCommentCell]);
    
    // ============================================================
    // RENDER STATUS CELL
    // ============================================================
    
    const renderStatusCell = (section, document, month) => {
        const status = getDocumentStatus(document, month);
        const statusConfig = status ? getStatusConfig(status) : null;
        const comments = getDocumentComments(document, month);
        const hasComments = comments.length > 0;
        const cellKey = `${section.id}-${document.id}-${month}`;
        const isPopupOpen = hoverCommentCell === cellKey;
        
        const isWorkingMonth = workingMonths.includes(months.indexOf(month)) && selectedYear === currentYear;
        const cellBackgroundClass = statusConfig 
            ? statusConfig.cellColor 
            : (isWorkingMonth ? 'bg-primary-50' : '');
        
        const textColorClass = statusConfig && statusConfig.color 
            ? statusConfig.color.split(' ').find(cls => cls.startsWith('text-')) || 'text-gray-900'
            : 'text-gray-400';
        
        return (
            <td className={`px-2 py-1 text-xs border-l border-gray-100 ${cellBackgroundClass} relative`}>
                <div className="min-w-[160px] relative">
                    <select
                        value={status || ''}
                        onChange={(e) => handleUpdateStatus(section.id, document.id, month, e.target.value)}
                        className={`w-full px-1.5 py-0.5 text-[10px] rounded font-medium border-0 cursor-pointer appearance-none bg-transparent ${textColorClass} hover:opacity-80`}
                    >
                        <option value="">Select Status</option>
                        {statusOptions.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    
                    <div className="absolute top-1/2 right-0.5 -translate-y-1/2 z-10">
                        <button
                            data-comment-cell={cellKey}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                
                                if (isPopupOpen) {
                                    setHoverCommentCell(null);
                                } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setCommentPopupPosition({
                                        top: rect.bottom + 5,
                                        left: rect.right - 288
                                    });
                                    setHoverCommentCell(cellKey);
                                }
                            }}
                            className="text-gray-500 hover:text-gray-700 transition-colors relative p-1"
                            title={hasComments ? `${comments.length} comment(s)` : 'Add comment'}
                            type="button"
                        >
                            <i className="fas fa-comment text-base"></i>
                            {hasComments && (
                                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                    {comments.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>
            </td>
        );
    };
    
    // ============================================================
    // MODALS
    // ============================================================
    
    const SectionModal = () => {
        const [formData, setFormData] = useState({
            name: editingSection?.name || '',
            description: editingSection?.description || ''
        });
        
        const handleSubmit = (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a section name');
                return;
            }
            handleSaveSection(formData);
        };
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingSection ? 'Edit Section' : 'Add New Section'}
                        </h2>
                        <button onClick={() => setShowSectionModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Section Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="e.g., Financial Documents"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Brief description..."
                            ></textarea>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowSectionModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingSection ? 'Update' : 'Add'} Section
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    const DocumentModal = () => {
        const [formData, setFormData] = useState({
            name: editingDocument?.name || '',
            description: editingDocument?.description || '',
            attachments: editingDocument?.attachments || []
        });
        
        useEffect(() => {
            setFormData({
                name: editingDocument?.name || '',
                description: editingDocument?.description || '',
                attachments: editingDocument?.attachments || []
            });
        }, [editingDocument]);
        
        const handleSubmit = (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a document name');
                return;
            }
            handleSaveDocument(formData);
        };
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingDocument ? 'Edit Document' : 'Add Document'}
                        </h2>
                        <button onClick={() => setShowDocumentModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-4 space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Document Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="e.g., Bank Statements"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Additional details..."
                            ></textarea>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowDocumentModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingDocument ? 'Update' : 'Add'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    const TemplateModal = () => {
        const [formData, setFormData] = useState({
            name: editingTemplate?.name || '',
            description: editingTemplate?.description || '',
            sections: editingTemplate ? parseSections(editingTemplate.sections) : []
        });
        
        useEffect(() => {
            if (editingTemplate) {
                setFormData({
                    name: editingTemplate.name || '',
                    description: editingTemplate.description || '',
                    sections: parseSections(editingTemplate.sections)
                });
            }
        }, [editingTemplate]);
        
        const handleSubmit = (e) => {
            e.preventDefault();
            if (!formData.name.trim()) {
                alert('Please enter a template name');
                return;
            }
            if (formData.sections.length === 0) {
                alert('Please add at least one section');
                return;
            }
            saveTemplate(formData);
        };
        
        if (showTemplateList) {
            return (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                            <h2 className="text-base font-semibold text-gray-900">Template Management</h2>
                            <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-4">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-gray-600">Manage your document collection templates</p>
                                <button
                                    onClick={() => {
                                        setEditingTemplate(null);
                                        setShowTemplateList(false);
                                    }}
                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    <i className="fas fa-plus mr-1"></i>
                                    Create New Template
                                </button>
                            </div>
                            
                            {isLoadingTemplates ? (
                                <div className="text-center py-8">
                                    <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                    <p className="text-sm text-gray-600 mt-2">Loading templates...</p>
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <i className="fas fa-layer-group text-3xl mb-2 opacity-50"></i>
                                    <p className="text-sm">No templates yet</p>
                                    <p className="text-xs mt-1">Create your first template to get started</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {templates.map(template => (
                                        <div key={template.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50 hover:bg-gray-100">
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{template.name}</h3>
                                                    {template.description && (
                                                        <p className="text-xs text-gray-600 mb-2">{template.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-4 text-[10px] text-gray-500">
                                                        <span><i className="fas fa-folder mr-1"></i>{Array.isArray(template.sections) ? template.sections.length : 0} sections</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 ml-3">
                                                    <button
                                                        onClick={() => {
                                                            setEditingTemplate(template);
                                                            setShowTemplateList(false);
                                                        }}
                                                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                                                    >
                                                        <i className="fas fa-edit"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => deleteTemplate(template.id)}
                                                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        }
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">
                            {editingTemplate ? 'Edit Template' : 'Create Template'}
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => {
                                    setEditingTemplate(null);
                                    setShowTemplateList(true);
                                }}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                            >
                                <i className="fas fa-arrow-left mr-1"></i>
                                Back
                            </button>
                            <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                <i className="fas fa-times text-sm"></i>
                            </button>
                        </div>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Template Name *</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="e.g., Standard Monthly Checklist"
                                required
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1.5">Description (Optional)</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({...formData, description: e.target.value})}
                                className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Brief description..."
                            ></textarea>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-xs font-medium text-gray-700">Sections *</label>
                                <button
                                    type="button"
                                    onClick={() => setFormData({
                                        ...formData,
                                        sections: [...formData.sections, { name: '', description: '', documents: [] }]
                                    })}
                                    className="px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium"
                                >
                                    <i className="fas fa-plus mr-1"></i>
                                    Add Section
                                </button>
                            </div>
                            
                            <div className="space-y-3">
                                {formData.sections.map((section, idx) => (
                                    <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                                        <div className="flex items-start justify-between mb-2">
                                            <input
                                                type="text"
                                                value={section.name}
                                                onChange={(e) => {
                                                    const newSections = [...formData.sections];
                                                    newSections[idx].name = e.target.value;
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded"
                                                placeholder="Section name *"
                                                required
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newSections = formData.sections.filter((_, i) => i !== idx);
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="ml-2 text-red-600 hover:text-red-800 p-1"
                                            >
                                                <i className="fas fa-trash text-xs"></i>
                                            </button>
                                        </div>
                                        
                                        <div className="flex justify-between items-center mt-2">
                                            <label className="text-[10px] font-medium text-gray-600">Documents:</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newSections = [...formData.sections];
                                                    if (!newSections[idx].documents) newSections[idx].documents = [];
                                                    newSections[idx].documents.push({ name: '', description: '' });
                                                    setFormData({...formData, sections: newSections});
                                                }}
                                                className="px-1.5 py-0.5 bg-gray-600 text-white rounded text-[9px] font-medium"
                                            >
                                                <i className="fas fa-plus mr-0.5"></i>
                                                Add
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-1 mt-1">
                                            {(section.documents || []).map((doc, docIdx) => (
                                                <div key={docIdx} className="flex items-center gap-1 bg-white p-1.5 rounded border border-gray-200">
                                                    <input
                                                        type="text"
                                                        value={doc.name}
                                                        onChange={(e) => {
                                                            const newSections = [...formData.sections];
                                                            newSections[idx].documents[docIdx].name = e.target.value;
                                                            setFormData({...formData, sections: newSections});
                                                        }}
                                                        className="flex-1 px-1.5 py-0.5 text-[10px] border border-gray-300 rounded"
                                                        placeholder="Document name *"
                                                        required
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const newSections = [...formData.sections];
                                                            newSections[idx].documents = newSections[idx].documents.filter((_, i) => i !== docIdx);
                                                            setFormData({...formData, sections: newSections});
                                                        }}
                                                        className="text-red-600 hover:text-red-800 p-0.5"
                                                    >
                                                        <i className="fas fa-times text-[9px]"></i>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setShowTemplateModal(false)}
                                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                            >
                                {editingTemplate ? 'Update' : 'Create'} Template
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };
    
    const ApplyTemplateModal = () => {
        const [selectedTemplateId, setSelectedTemplateId] = useState(null);
        const [targetYear, setTargetYear] = useState(selectedYear);
        
        const handleApply = () => {
            if (!selectedTemplateId) {
                alert('Please select a template');
                return;
            }
            const template = templates.find(t => String(t.id) === String(selectedTemplateId));
            if (!template) {
                alert('Template not found');
                return;
            }
            applyTemplate(template, targetYear);
        };
        
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200">
                        <h2 className="text-base font-semibold text-gray-900">Apply Template</h2>
                        <button onClick={() => setShowApplyTemplateModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                            <i className="fas fa-times text-sm"></i>
                        </button>
                    </div>
                    
                    <div className="p-4 space-y-4">
                        {isLoadingTemplates ? (
                            <div className="text-center py-4">
                                <i className="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                                <p className="text-sm text-gray-600 mt-2">Loading templates...</p>
                            </div>
                        ) : templates.length === 0 ? (
                            <div className="text-center py-4">
                                <p className="text-sm text-gray-600 mb-3">No templates available</p>
                                <button
                                    onClick={() => {
                                        setShowApplyTemplateModal(false);
                                        setShowTemplateModal(true);
                                    }}
                                    className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                >
                                    Create Template
                                </button>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Select Template *</label>
                                    <select
                                        value={selectedTemplateId || ''}
                                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    >
                                        <option value="">-- Select a template --</option>
                                        {templates.map(template => (
                                            <option key={template.id} value={template.id}>
                                                {template.name} ({Array.isArray(template.sections) ? template.sections.length : 0} sections)
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Target Year</label>
                                    <select
                                        value={targetYear}
                                        onChange={(e) => setTargetYear(parseInt(e.target.value))}
                                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    >
                                        {yearOptions.map(year => (
                                            <option key={year} value={year}>{year}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={() => setShowApplyTemplateModal(false)}
                                        className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleApply}
                                        disabled={!selectedTemplateId}
                                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        Apply Template
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    };
    
    // ============================================================
    // MAIN RENDER
    // ============================================================
    
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-3"></i>
                    <p className="text-sm text-gray-600">Loading document collection tracker...</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="space-y-3">
            {/* Comment Popup */}
            {hoverCommentCell && (() => {
                const [sectionId, documentId, month] = hoverCommentCell.split('-');
                const section = sections.find(s => s.id === parseInt(sectionId));
                const document = section?.documents.find(d => d.id === parseInt(documentId));
                const comments = document ? getDocumentComments(document, month) : [];
                
                return (
                    <div 
                        className="comment-popup fixed w-72 bg-white border border-gray-300 rounded-lg shadow-xl p-3 z-[999]"
                        style={{ top: `${commentPopupPosition.top}px`, left: `${commentPopupPosition.left}px` }}
                    >
                        {comments.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-semibold text-gray-600 mb-1.5">Comments</div>
                                <div ref={commentPopupContainerRef} className="max-h-32 overflow-y-auto space-y-2 mb-2">
                                    {comments.map((comment, idx) => (
                                        <div key={comment.id || idx} className="pb-2 border-b last:border-b-0 bg-gray-50 rounded p-1.5 relative group">
                                            <p className="text-xs text-gray-700 whitespace-pre-wrap pr-6">{comment.text}</p>
                                            <div className="flex items-center justify-between mt-1 text-[10px] text-gray-500">
                                                <span className="font-medium">{comment.author}</span>
                                                <span>{new Date(comment.date).toLocaleString('en-ZA', { 
                                                    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
                                                })}</span>
                                            </div>
                                            <button
                                                onClick={() => handleDeleteComment(parseInt(sectionId), parseInt(documentId), month, comment.id)}
                                                className="absolute top-1 right-1 text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                                                type="button"
                                            >
                                                <i className="fas fa-trash text-[10px]"></i>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <div className="text-[10px] font-semibold text-gray-600 mb-1">Add Comment</div>
                            <textarea
                                value={quickComment}
                                onChange={(e) => setQuickComment(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && e.ctrlKey) {
                                        handleAddComment(parseInt(sectionId), parseInt(documentId), month, quickComment);
                                    }
                                }}
                                className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                rows="2"
                                placeholder="Type comment... (Ctrl+Enter to submit)"
                                autoFocus
                            />
                            <button
                                onClick={() => handleAddComment(parseInt(sectionId), parseInt(documentId), month, quickComment)}
                                disabled={!quickComment.trim()}
                                className="mt-1.5 w-full px-2 py-1 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700 disabled:opacity-50"
                            >
                                Add Comment
                            </button>
                        </div>
                    </div>
                );
            })()}
            
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold text-gray-900">Monthly Document Collection Tracker</h1>
                        <p className="text-xs text-gray-500">{project.name} • {project.client}</p>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <label className="text-[10px] font-medium text-gray-600">Year:</label>
                    <select
                        value={selectedYear}
                        onChange={(e) => handleYearChange(parseInt(e.target.value))}
                        className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-primary-500"
                    >
                        {yearOptions.map(year => (
                            <option key={year} value={year}>{year}{year === currentYear && ' (Current)'}</option>
                        ))}
                    </select>
                    
                    <button
                        onClick={handleExportToExcel}
                        disabled={isExporting || sections.length === 0}
                        className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 text-[10px] font-medium disabled:opacity-50"
                    >
                        {isExporting ? (
                            <><i className="fas fa-spinner fa-spin mr-1"></i>Exporting...</>
                        ) : (
                            <><i className="fas fa-file-excel mr-1"></i>Export</>
                        )}
                    </button>
                    
                    <button
                        onClick={handleAddSection}
                        className="px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-[10px] font-medium"
                    >
                        <i className="fas fa-plus mr-1"></i>Add Section
                    </button>
                    
                    <div className="flex items-center gap-1 border-l border-gray-300 pl-2 ml-2">
                        <button
                            onClick={() => setShowApplyTemplateModal(true)}
                            className="px-3 py-1 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-[10px] font-medium"
                        >
                            <i className="fas fa-magic mr-1"></i>Apply Template
                        </button>
                        <button
                            onClick={() => setShowTemplateModal(true)}
                            className="px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-[10px] font-medium"
                        >
                            <i className="fas fa-layer-group mr-1"></i>Templates
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Legend */}
            <div className="bg-white rounded-lg border border-gray-200 p-2.5">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-medium text-gray-600">Status:</span>
                    {statusOptions.slice(0, 3).map((option, idx) => (
                        <React.Fragment key={option.value}>
                            <div className="flex items-center gap-1">
                                <div className={`w-3 h-3 rounded ${option.cellColor}`}></div>
                                <span className="text-[10px] text-gray-600">{option.label}</span>
                            </div>
                            {idx < 2 && <i className="fas fa-arrow-right text-[8px] text-gray-400"></i>}
                        </React.Fragment>
                    ))}
                    <span className="text-gray-300 mx-1">|</span>
                    <div className="flex items-center gap-1">
                        <div className={`w-3 h-3 rounded ${statusOptions[3].cellColor}`}></div>
                        <span className="text-[10px] text-gray-600">{statusOptions[3].label}</span>
                    </div>
                </div>
            </div>
            
            {/* Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="relative overflow-x-auto" ref={tableRef}>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th 
                                    className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase sticky left-0 bg-gray-50 z-50 border-r border-gray-200"
                                    style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                >
                                    Document / Data
                                </th>
                                {months.map((month, idx) => (
                                    <th 
                                        key={month}
                                        ref={el => monthRefs.current[month] = el}
                                        className={`px-1.5 py-1.5 text-center text-[10px] font-semibold uppercase border-l border-gray-200 ${
                                            workingMonths.includes(idx) && selectedYear === currentYear
                                                ? 'bg-primary-50 text-primary-700'
                                                : 'text-gray-600'
                                        }`}
                                    >
                                        {month.slice(0, 3)} '{String(selectedYear).slice(-2)}
                                    </th>
                                ))}
                                <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-gray-700 uppercase border-l border-gray-200">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {sections.length === 0 ? (
                                <tr>
                                    <td colSpan={14} className="px-6 py-8 text-center text-gray-400">
                                        <i className="fas fa-folder-open text-3xl mb-2 opacity-50"></i>
                                        <p className="text-sm">No sections yet</p>
                                        <button
                                            onClick={handleAddSection}
                                            className="mt-3 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                        >
                                            <i className="fas fa-plus mr-1"></i>Add First Section
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                sections.map((section, sectionIndex) => (
                                    <React.Fragment key={section.id}>
                                        <tr 
                                            draggable="true"
                                            onDragStart={(e) => handleSectionDragStart(e, section, sectionIndex)}
                                            onDragEnd={handleSectionDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => handleSectionDrop(e, sectionIndex)}
                                            className="bg-gray-100 cursor-grab active:cursor-grabbing"
                                        >
                                            <td 
                                                className="px-2.5 py-2 sticky left-0 bg-gray-100 z-50 border-r border-gray-200"
                                                style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <i className="fas fa-grip-vertical text-gray-400 text-xs"></i>
                                                    <div className="flex-1">
                                                        <div className="font-semibold text-sm text-gray-900">{section.name}</div>
                                                        {section.description && (
                                                            <div className="text-[10px] text-gray-500">{section.description}</div>
                                                        )}
                                                        <button
                                                            onClick={() => handleAddDocument(section.id)}
                                                            className="mt-2 px-2 py-0.5 bg-primary-600 text-white rounded text-[10px] font-medium hover:bg-primary-700"
                                                        >
                                                            <i className="fas fa-plus mr-1"></i>Add Document
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                            <td colSpan={12} className="px-2 py-2"></td>
                                            <td className="px-2.5 py-2 border-l border-gray-200">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => handleEditSection(section)}
                                                        className="text-gray-600 hover:text-primary-600 p-1"
                                                    >
                                                        <i className="fas fa-edit text-xs"></i>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSection(section.id)}
                                                        className="text-gray-600 hover:text-red-600 p-1"
                                                    >
                                                        <i className="fas fa-trash text-xs"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        
                                        {section.documents.length === 0 ? (
                                            <tr>
                                                <td colSpan={14} className="px-8 py-4 text-center text-gray-400">
                                                    <p className="text-xs">No documents in this section</p>
                                                    <button
                                                        onClick={() => handleAddDocument(section.id)}
                                                        className="mt-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-xs font-medium"
                                                    >
                                                        <i className="fas fa-plus mr-1"></i>Add Document
                                                    </button>
                                                </td>
                                            </tr>
                                        ) : (
                                            section.documents.map((document, documentIndex) => (
                                                <tr key={document.id} className="hover:bg-gray-50">
                                                    <td 
                                                        className="px-4 py-1.5 sticky left-0 bg-white z-50 border-r border-gray-200"
                                                        style={{ boxShadow: STICKY_COLUMN_SHADOW }}
                                                    >
                                                        <div className="min-w-[200px]">
                                                            <div className="text-xs font-medium text-gray-900">{document.name}</div>
                                                            {document.description && (
                                                                <div className="text-[10px] text-gray-500">{document.description}</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {months.map(month => (
                                                        <React.Fragment key={`${document.id}-${month}`}>
                                                            {renderStatusCell(section, document, month)}
                                                        </React.Fragment>
                                                    ))}
                                                    <td className="px-2.5 py-1.5 border-l border-gray-200">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleEditDocument(section, document)}
                                                                className="text-gray-600 hover:text-primary-600 p-1"
                                                            >
                                                                <i className="fas fa-edit text-xs"></i>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDocument(section.id, document.id)}
                                                                className="text-gray-600 hover:text-red-600 p-1"
                                                            >
                                                                <i className="fas fa-trash text-xs"></i>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            {/* Modals */}
            {showSectionModal && <SectionModal />}
            {showDocumentModal && <DocumentModal />}
            {showTemplateModal && <TemplateModal />}
            {showApplyTemplateModal && <ApplyTemplateModal />}
        </div>
    );
};

// Make available globally
window.MonthlyDocumentCollectionTracker = MonthlyDocumentCollectionTracker;
console.log('✅ MonthlyDocumentCollectionTracker component loaded (OVERHAULED VERSION)');
