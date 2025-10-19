// Advanced Search and Filtering Component
const { useState, useEffect } = React;

const AdvancedSearch = ({ 
    items = [], 
    onFilteredResults, 
    searchFields = ['name'], 
    filterConfig = {},
    placeholder = "Search...",
    showFilters = true,
    className = ""
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeFilters, setActiveFilters] = useState({});
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [sortField, setSortField] = useState('');
    const [sortDirection, setSortDirection] = useState('asc');
    const { isDark } = window.useTheme();

    // Filter items based on search term and active filters
    useEffect(() => {
        let filteredItems = [...items];

        // Apply search term
        if (searchTerm) {
            filteredItems = filteredItems.filter(item => {
                return searchFields.some(field => {
                    const value = item[field];
                    return value && value.toString().toLowerCase().includes(searchTerm.toLowerCase());
                });
            });
        }

        // Apply active filters
        Object.entries(activeFilters).forEach(([filterKey, filterValue]) => {
            if (filterValue && filterValue !== 'all') {
                filteredItems = filteredItems.filter(item => {
                    const itemValue = item[filterKey];
                    if (Array.isArray(filterValue)) {
                        return filterValue.includes(itemValue);
                    }
                    return itemValue === filterValue;
                });
            }
        });

        // Apply sorting
        if (sortField) {
            filteredItems.sort((a, b) => {
                const aValue = a[sortField];
                const bValue = b[sortField];
                
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    return sortDirection === 'asc' 
                        ? aValue.localeCompare(bValue)
                        : bValue.localeCompare(aValue);
                }
                
                if (typeof aValue === 'number' && typeof bValue === 'number') {
                    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
                }
                
                return 0;
            });
        }

        onFilteredResults(filteredItems);
    }, [searchTerm, activeFilters, sortField, sortDirection, items]);

    // Handle filter change
    const handleFilterChange = (filterKey, value) => {
        setActiveFilters(prev => ({
            ...prev,
            [filterKey]: value
        }));
    };

    // Clear all filters
    const clearAllFilters = () => {
        setActiveFilters({});
        setSearchTerm('');
        setSortField('');
        setSortDirection('asc');
    };

    // Get unique values for filter options
    const getFilterOptions = (field) => {
        const values = items.map(item => item[field]).filter(Boolean);
        return [...new Set(values)].sort();
    };

    // Render filter dropdown
    const FilterDropdown = ({ field, label, options }) => (
        <div className="space-y-1">
            <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                {label}
            </label>
            <select
                value={activeFilters[field] || 'all'}
                onChange={(e) => handleFilterChange(field, e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${
                    isDark 
                        ? 'bg-gray-700 border-gray-600 text-gray-100' 
                        : 'bg-white border-gray-300 text-gray-900'
                }`}
            >
                <option value="all">All {label}</option>
                {options.map(option => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );

    // Render sort dropdown
    const SortDropdown = () => (
        <div className="space-y-1">
            <label className={`block text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                Sort By
            </label>
            <div className="flex space-x-2">
                <select
                    value={sortField}
                    onChange={(e) => setSortField(e.target.value)}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                        isDark 
                            ? 'bg-gray-700 border-gray-600 text-gray-100' 
                            : 'bg-white border-gray-300 text-gray-900'
                    }`}
                >
                    <option value="">No Sorting</option>
                    {searchFields.map(field => (
                        <option key={field} value={field}>
                            {field.charAt(0).toUpperCase() + field.slice(1)}
                        </option>
                    ))}
                </select>
                {sortField && (
                    <button
                        onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                        className={`px-3 py-2 rounded-lg border text-sm ${
                            isDark 
                                ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' 
                                : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
                        }`}
                        title={`Sort ${sortDirection === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                        <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`}></i>
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Search Bar */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className={`fas fa-search ${isDark ? 'text-gray-400' : 'text-gray-500'}`}></i>
                </div>
                <input
                    type="text"
                    placeholder={placeholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={`w-full pl-10 pr-12 py-3 rounded-lg border ${
                        isDark 
                            ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                            : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                    } focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                />
                {searchTerm && (
                    <button
                        onClick={() => setSearchTerm('')}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                        <i className={`fas fa-times ${isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'}`}></i>
                    </button>
                )}
            </div>

            {/* Filter Controls */}
            {showFilters && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <button
                            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                            className={`flex items-center space-x-2 px-3 py-2 rounded-lg border text-sm ${
                                isDark 
                                    ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600' 
                                    : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'
                            }`}
                        >
                            <i className="fas fa-filter"></i>
                            <span>Advanced Filters</span>
                            <i className={`fas fa-chevron-${showAdvancedFilters ? 'up' : 'down'} transition-transform`}></i>
                        </button>
                        
                        {(Object.keys(activeFilters).length > 0 || searchTerm || sortField) && (
                            <button
                                onClick={clearAllFilters}
                                className={`px-3 py-2 rounded-lg text-sm ${
                                    isDark 
                                        ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                Clear All
                            </button>
                        )}
                    </div>

                    {showAdvancedFilters && (
                        <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded-lg p-4 space-y-4`}>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Dynamic filters based on filterConfig */}
                                {Object.entries(filterConfig).map(([field, config]) => (
                                    <FilterDropdown
                                        key={field}
                                        field={field}
                                        label={config.label || field}
                                        options={config.options || getFilterOptions(field)}
                                    />
                                ))}
                                
                                {/* Sort controls */}
                                <SortDropdown />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Active Filters Display */}
            {(Object.keys(activeFilters).length > 0 || searchTerm || sortField) && (
                <div className="flex flex-wrap gap-2">
                    {searchTerm && (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                            isDark 
                                ? 'bg-blue-900 text-blue-300' 
                                : 'bg-blue-100 text-blue-800'
                        }`}>
                            Search: "{searchTerm}"
                            <button
                                onClick={() => setSearchTerm('')}
                                className="ml-2 text-blue-600 hover:text-blue-800"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </span>
                    )}
                    
                    {Object.entries(activeFilters).map(([field, value]) => {
                        if (!value || value === 'all') return null;
                        return (
                            <span key={field} className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                                isDark 
                                    ? 'bg-green-900 text-green-300' 
                                    : 'bg-green-100 text-green-800'
                            }`}>
                                {field}: {value}
                                <button
                                    onClick={() => handleFilterChange(field, 'all')}
                                    className="ml-2 text-green-600 hover:text-green-800"
                                >
                                    <i className="fas fa-times text-xs"></i>
                                </button>
                            </span>
                        );
                    })}
                    
                    {sortField && (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm ${
                            isDark 
                                ? 'bg-purple-900 text-purple-300' 
                                : 'bg-purple-100 text-purple-800'
                        }`}>
                            Sort: {sortField} ({sortDirection})
                            <button
                                onClick={() => setSortField('')}
                                className="ml-2 text-purple-600 hover:text-purple-800"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        </span>
                    )}
                </div>
            )}
        </div>
    );
};

// Make available globally
window.AdvancedSearch = AdvancedSearch;
