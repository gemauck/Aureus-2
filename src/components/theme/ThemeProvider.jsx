// Get React hooks from window
const { useState, useEffect, createContext } = React;

// Create theme context
const ThemeContext = createContext();

const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState('light');
    const [systemPreference, setSystemPreference] = useState('light');

    // Detect system preference
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        setSystemPreference(mediaQuery.matches ? 'dark' : 'light');
        
        const handleChange = (e) => {
            setSystemPreference(e.matches ? 'dark' : 'light');
        };
        
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Load theme from localStorage on mount; only fall back to system if no saved theme
    useEffect(() => {
        const savedTheme = localStorage.getItem('abcotronics_theme');
        const useSystemPreference = localStorage.getItem('abcotronics_use_system_theme') === 'true';
        
        let initialTheme = 'light';
        
        if (savedTheme) {
            initialTheme = savedTheme;
        } else if (useSystemPreference) {
            initialTheme = systemPreference;
        } else {
            // First time user - default to light and do NOT follow system
            initialTheme = 'light';
            localStorage.setItem('abcotronics_use_system_theme', 'false');
        }
        
        setTheme(initialTheme);
        applyTheme(initialTheme);
    }, [systemPreference]);

    // Apply theme to document
    const applyTheme = (newTheme) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(newTheme);
        localStorage.setItem('abcotronics_theme', newTheme);
    };

    // Toggle theme
    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        applyTheme(newTheme);
        localStorage.setItem('abcotronics_use_system_theme', 'false');
    };

    // Toggle system preference following
    const toggleSystemPreference = () => {
        const currentlyFollowing = localStorage.getItem('abcotronics_use_system_theme') === 'true';
        localStorage.setItem('abcotronics_use_system_theme', (!currentlyFollowing).toString());
        
        if (!currentlyFollowing) {
            // Start following system preference
            setTheme(systemPreference);
            applyTheme(systemPreference);
        }
    };

    // Check if following system preference
    const isFollowingSystem = () => {
        return localStorage.getItem('abcotronics_use_system_theme') === 'true';
    };

    const value = {
        theme,
        toggleTheme,
        toggleSystemPreference,
        isFollowingSystem: isFollowingSystem(),
        systemPreference,
        isDark: theme === 'dark'
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

// Hook to use theme
const useTheme = () => {
    const context = React.useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

// Make available globally
try {
    window.ThemeProvider = ThemeProvider;
    window.useTheme = useTheme;
    if (window.debug && !window.debug.performanceMode) {
        console.log('✅ ThemeProvider.jsx loaded and registered', typeof window.ThemeProvider);
    }
} catch (error) {
    console.error('❌ ThemeProvider.jsx: Error registering component:', error);
}
