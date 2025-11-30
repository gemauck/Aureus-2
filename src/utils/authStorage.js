// Authentication Storage Utility - Only for auth tokens, no data storage
const AuthStorage = {
    // Get authentication token
    getToken: () => {
        try {
            const token = localStorage.getItem('abcotronics_token');
            if (!token || token === 'undefined' || token === 'null') return null;
            return token;
        } catch (e) {
            console.error('Error loading auth token:', e);
            return null;
        }
    },

    // Set authentication token
    setToken: (token) => {
        try {
            localStorage.setItem('abcotronics_token', token);
        } catch (e) {
            console.error('Error saving auth token:', e);
        }
    },

    // Remove authentication token
    removeToken: () => {
        try {
            localStorage.removeItem('abcotronics_token');
        } catch (e) {
            console.error('Error removing auth token:', e);
        }
    },

    // Get user data
    getUser: () => {
        try {
            const user = localStorage.getItem('abcotronics_user');
            if (!user || user === 'undefined' || user === 'null') return null;
            return JSON.parse(user);
        } catch (e) {
            console.error('Error loading user:', e);
            return null;
        }
    },

    // Set user data
    setUser: (user) => {
        try {
            localStorage.setItem('abcotronics_user', JSON.stringify(user));
        } catch (e) {
            console.error('Error saving user:', e);
        }
    },

    // Remove user data
    removeUser: () => {
        try {
            localStorage.removeItem('abcotronics_user');
        } catch (e) {
            console.error('Error removing user:', e);
        }
    },

    // Get current user name for logging
    getUserName: () => {
        try {
            const user = AuthStorage.getUser();
            return user?.name || user?.email || 'System';
        } catch (e) {
            console.error('Error getting user name:', e);
            return 'System';
        }
    },

    // Get current user info object for logging
    getUserInfo: () => {
        try {
            const user = AuthStorage.getUser();
            return {
                name: user?.name || 'System',
                email: user?.email || 'system',
                id: user?.id || 'system',
                role: user?.role || 'System'
            };
        } catch (e) {
            console.error('Error getting user info:', e);
            return {
                name: 'System',
                email: 'system',
                id: 'system',
                role: 'System'
            };
        }
    },

    // Remember last email used for login (if not provided by localStorage.js)
    getLastLoginEmail: () => {
        try {
            return localStorage.getItem('abcotronics_last_login_email') || null;
        } catch (e) {
            console.error('Error loading last login email:', e);
            return null;
        }
    },
    
    setLastLoginEmail: (email) => {
        try {
            if (email) {
                localStorage.setItem('abcotronics_last_login_email', email);
            } else {
                // Clear if email is null/empty
                localStorage.removeItem('abcotronics_last_login_email');
            }
        } catch (e) {
            console.error('Error saving last login email:', e);
        }
    },
    
    clearLastLoginEmail: () => {
        try {
            localStorage.removeItem('abcotronics_last_login_email');
        } catch (e) {
            console.error('Error clearing last login email:', e);
        }
    }
};

// Make available globally - merge with existing storage to preserve all methods
if (window.storage && typeof window.storage === 'object') {
    // Merge auth methods into existing storage object (preserves getLastLoginEmail, setLastLoginEmail, etc.)
    Object.assign(window.storage, AuthStorage);
} else {
    // If no existing storage, use AuthStorage as base
    window.storage = AuthStorage;
}
