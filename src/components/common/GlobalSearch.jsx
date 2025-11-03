// Global Search Component - Search across all modules
const { useState, useEffect, useRef } = React;

const GlobalSearch = ({ isMobile = false, isDark = false }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const searchRef = useRef(null);
    const resultsRef = useRef(null);
    
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);
    
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);
    
    const performSearch = async (term) => {
        if (!term || term.length < 2) {
            setResults([]);
            return;
        }
        
        setLoading(true);
        try {
            const token = window.storage?.getToken?.();
            if (!token) {
                setLoading(false);
                return;
            }
            
            const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setResults(data.data?.results || []);
            } else {
                setResults([]);
            }
        } catch (error) {
            console.error('Error performing search:', error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        const debounceTimer = setTimeout(() => {
            if (searchTerm) {
                performSearch(searchTerm);
                setIsOpen(true);
            } else {
                setResults([]);
                setIsOpen(false);
            }
        }, 300);
        
        return () => clearTimeout(debounceTimer);
    }, [searchTerm]);
    
    const handleResultClick = (result) => {
        setSearchTerm('');
        setIsOpen(false);
        setResults([]);
        
        // Navigate to the result
        if (result.link) {
            window.location.hash = result.link;
        }
    };
    
    const getResultIcon = (type) => {
        const icons = {
            client: 'fa-users',
            project: 'fa-project-diagram',
            user: 'fa-user',
            team: 'fa-user-friends',
            document: 'fa-file',
            invoice: 'fa-file-invoice',
            task: 'fa-tasks',
            lead: 'fa-user-tie',
            opportunity: 'fa-handshake'
        };
        return icons[type] || 'fa-circle';
    };
    
    const getResultColor = (type) => {
        const colors = {
            client: 'text-blue-600',
            project: 'text-green-600',
            user: 'text-purple-600',
            team: 'text-pink-600',
            document: 'text-gray-600',
            invoice: 'text-orange-600',
            task: 'text-yellow-600',
            lead: 'text-indigo-600',
            opportunity: 'text-teal-600'
        };
        return colors[type] || 'text-gray-600';
    };
    
    return (
        <div className="relative">
            {/* Search Input */}
            <div className={`relative ${isMobile ? 'block' : 'hidden lg:block'}`}>
                <input
                    ref={searchRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onFocus={() => {
                        if (searchTerm) setIsOpen(true);
                    }}
                    placeholder="Q Search..."
                    className={`w-48 pl-8 pr-10 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all ${
                        isDark 
                            ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    }`}
                />
                <i className={`fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isDark ? 'text-gray-400' : 'text-gray-400'}`}></i>
                {isOpen && results.length === 0 && !loading && searchTerm && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>ESC</span>
                    </div>
                )}
            </div>
            
            {/* Search Results Dropdown */}
            {isOpen && (results.length > 0 || loading || (searchTerm.length > 0 && !loading)) && (
                <div 
                    ref={resultsRef}
                    className={`absolute left-0 top-full mt-2 w-96 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-xl shadow-xl z-50 max-h-96 overflow-hidden`}
                >
                    {/* Loading State */}
                    {loading && (
                        <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                            <p className="text-sm">Searching...</p>
                        </div>
                    )}
                    
                    {/* Results List */}
                    {!loading && results.length > 0 && (
                        <div className="max-h-80 overflow-y-auto">
                            <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400 bg-gray-750' : 'text-gray-500 bg-gray-50'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} sticky top-0`}>
                                {results.length} result{results.length !== 1 ? 's' : ''}
                            </div>
                            {results.map((result, index) => (
                                <div
                                    key={result.id || index}
                                    onClick={() => handleResultClick(result)}
                                    className={`border-b ${isDark ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer transition-colors ${
                                        selectedIndex === index ? (isDark ? 'bg-gray-700' : 'bg-gray-50') : ''
                                    }`}
                                >
                                    <div className="px-4 py-3">
                                        <div className="flex items-start gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                                <i className={`fas ${getResultIcon(result.type)} ${getResultColor(result.type)} text-sm`}></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className={`text-sm font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'} truncate`}>
                                                        {result.title}
                                                    </p>
                                                    <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'} flex-shrink-0`}>
                                                        {result.type}
                                                    </span>
                                                </div>
                                                {result.subtitle && (
                                                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1 truncate`}>
                                                        {result.subtitle}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {/* No Results */}
                    {!loading && results.length === 0 && searchTerm.length > 1 && (
                        <div className={`px-4 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            <i className="fas fa-search text-2xl mb-2"></i>
                            <p className="text-sm">No results found</p>
                            <p className="text-xs mt-1">Try different keywords</p>
                        </div>
                    )}
                    
                    {/* Footer */}
                    {results.length > 0 && !loading && (
                        <div className={`px-4 py-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'} text-center`}>
                            <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                Press <kbd className={`px-1.5 py-0.5 rounded text-xs ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>ESC</kbd> to close
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Make available globally
if (typeof window !== 'undefined') {
    window.GlobalSearch = GlobalSearch;
}

