// Authentication Storage Utility - Only for auth tokens, no data storage
const AuthStorage = {
    // Get authentication token
    getToken: () => {
        try {
            const token = localStorage.getItem('abcotronics_auth_token');
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
            localStorage.setItem('abcotronics_auth_token', token);
            console.log('✅ Auth token saved');
        } catch (e) {
            console.error('Error saving auth token:', e);
        }
    },

    // Remove authentication token
    removeToken: () => {
        try {
            localStorage.removeItem('abcotronics_auth_token');
            console.log('✅ Auth token removed');
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
            console.log('✅ User data saved');
        } catch (e) {
            console.error('Error saving user:', e);
        }
    },

    // Remove user data
    removeUser: () => {
        try {
            localStorage.removeItem('abcotronics_user');
            console.log('✅ User data removed');
        } catch (e) {
            console.error('Error removing user:', e);
        }
    }
};

// Make available globally
window.storage = AuthStorage;
