const { useState, useEffect, createContext, useContext, useMemo, useCallback } = React;

const THEME_STORAGE_KEY = 'abcotronics_theme';
const FOLLOW_SYSTEM_KEY = 'abcotronics_use_system_theme';

const ThemeContext = createContext(null);

const getStoredBoolean = (key, fallback = false) => {
    try {
        return localStorage.getItem(key) === 'true';
    } catch {
        return fallback;
    }
};

const getStoredTheme = (fallback = 'light') => {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
        return fallback;
    } catch {
        return fallback;
    }
};

const setRootThemeClass = (theme) => {
    const root = document.documentElement;
    const body = document.body;
    if (!root) return;

    root.classList.remove('light', 'dark');
    root.dataset.theme = theme;
    root.classList.add(theme);

    if (body) {
        body.classList.remove('light', 'dark');
        body.classList.add(theme);
    }
};

const ThemeProvider = ({ children }) => {
    const [systemPreference, setSystemPreference] = useState('light');
    const [followSystem, setFollowSystem] = useState(() => getStoredBoolean(FOLLOW_SYSTEM_KEY, false));
    const [userTheme, setUserTheme] = useState(() => getStoredTheme('light'));

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const initialSystem = mediaQuery.matches ? 'dark' : 'light';
        setSystemPreference(initialSystem);

        const handleChange = (event) => {
            const nextSystem = event.matches ? 'dark' : 'light';
            setSystemPreference(nextSystem);
        };

        if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', handleChange);
        } else {
            mediaQuery.addListener(handleChange);
        }

        return () => {
            if (mediaQuery.removeEventListener) {
                mediaQuery.removeEventListener('change', handleChange);
            } else {
                mediaQuery.removeListener(handleChange);
            }
        };
    }, []);

    const theme = useMemo(() => (followSystem ? systemPreference : userTheme), [followSystem, systemPreference, userTheme]);

    useEffect(() => {
        setRootThemeClass(theme);
    }, [theme]);

    const toggleTheme = useCallback(() => {
        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        setFollowSystem(false);
        setUserTheme(nextTheme);

        try {
            localStorage.setItem(FOLLOW_SYSTEM_KEY, 'false');
            localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        } catch (error) {
            console.warn('⚠️ ThemeProvider: Failed to persist theme preference', error);
        }
    }, [theme]);

    const toggleSystemPreference = useCallback(() => {
        const nextFollow = !followSystem;
        setFollowSystem(nextFollow);

        try {
            localStorage.setItem(FOLLOW_SYSTEM_KEY, nextFollow.toString());
            if (!nextFollow) {
                localStorage.setItem(THEME_STORAGE_KEY, theme);
                setUserTheme(theme);
            }
        } catch (error) {
            console.warn('⚠️ ThemeProvider: Failed to persist system preference', error);
        }
    }, [followSystem, theme]);

    const contextValue = useMemo(() => ({
        theme,
        toggleTheme,
        toggleSystemPreference,
        isFollowingSystem: followSystem,
        systemPreference,
        isDark: theme === 'dark'
    }), [followSystem, systemPreference, theme, toggleTheme, toggleSystemPreference]);

    return (
        <ThemeContext.Provider value={contextValue}>
            {children}
        </ThemeContext.Provider>
    );
};

const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

try {
    window.ThemeProvider = ThemeProvider;
    window.useTheme = useTheme;
    if (window.debug && !window.debug.performanceMode) {
    }
} catch (error) {
    console.error('❌ ThemeProvider.jsx: Error registering component:', error);
}
