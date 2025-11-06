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
            const newSystemPref = e.matches ? 'dark' : 'light';
            setSystemPreference(newSystemPref);
            
            // Only update theme if user is following system preference
            const useSystemPreference = localStorage.getItem('abcotronics_use_system_theme') === 'true';
            if (useSystemPreference) {
                setTheme(newSystemPref);
                applyTheme(newSystemPref);
            }
        };
        
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // Load theme from localStorage on mount; only fall back to system if no saved theme
    useEffect(() => {
        const savedTheme = localStorage.getItem('abcotronics_theme');
        const useSystemPreference = localStorage.getItem('abcotronics_use_system_theme') === 'true';
        
        let initialTheme = 'light';
        
        if (useSystemPreference) {
            // User wants to follow system - use system preference
            initialTheme = systemPreference;
        } else if (savedTheme) {
            // User has explicit preference - use it
            initialTheme = savedTheme;
        } else {
            // First time user - default to light and do NOT follow system
            initialTheme = 'light';
            localStorage.setItem('abcotronics_use_system_theme', 'false');
        }
        
        setTheme(initialTheme);
        applyTheme(initialTheme);
    }, [systemPreference]);

    // Apply theme to document - CRITICAL: Never apply dark mode when user wants light mode
    const applyTheme = (newTheme) => {
        const useSystemPreference = localStorage.getItem('abcotronics_use_system_theme') === 'true';
        const savedTheme = localStorage.getItem('abcotronics_theme');
        
        // CRITICAL FIX: If user explicitly chose light mode and is NOT following system,
        // NEVER apply dark mode - force light mode always
        if (!useSystemPreference && savedTheme === 'light') {
            document.documentElement.classList.remove('light', 'dark');
            document.documentElement.classList.add('light');
            // Don't update localStorage here - it's already set correctly
            return;
        }
        
        // If user is following system, apply the requested theme (could be dark or light)
        // If user explicitly chose dark mode, apply dark mode
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(newTheme);
        if (!useSystemPreference) {
            localStorage.setItem('abcotronics_theme', newTheme);
        }
    };
    
    // Continuous watcher: Ensure document root NEVER has .dark class when user wants light mode
    useEffect(() => {
        const checkAndFixTheme = () => {
            const useSystemPreference = localStorage.getItem('abcotronics_use_system_theme') === 'true';
            const savedTheme = localStorage.getItem('abcotronics_theme');
            const hasDarkClass = document.documentElement.classList.contains('dark');
            
            // If user explicitly wants light mode and document has .dark class, force remove it
            if (!useSystemPreference && savedTheme === 'light' && hasDarkClass) {
                document.documentElement.classList.remove('dark');
                document.documentElement.classList.add('light');
            }
        };
        
        // Check immediately
        checkAndFixTheme();
        
        // Check periodically to catch any external changes
        const interval = setInterval(checkAndFixTheme, 1000);
        
        // Also watch for DOM mutations
        const observer = new MutationObserver(checkAndFixTheme);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        return () => {
            clearInterval(interval);
            observer.disconnect();
        };
    }, []);

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
        const newFollowingState = !currentlyFollowing;
        localStorage.setItem('abcotronics_use_system_theme', newFollowingState.toString());
        
        if (newFollowingState) {
            // Start following system preference
            setTheme(systemPreference);
            applyTheme(systemPreference);
        } else {
            // Stop following system - restore user's explicit theme choice
            const savedTheme = localStorage.getItem('abcotronics_theme') || 'light';
            setTheme(savedTheme);
            applyTheme(savedTheme);
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
