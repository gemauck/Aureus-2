// Get React hooks from window
const { useState, useEffect } = React;

// Get useAuth from window
const useAuth = window.useAuth;
const storage = window.storage;

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        try {
            await login(email, password);
        } catch (err) {
            setError('Invalid credentials');
        }
    };


    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-700 p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden">
                <div className="grid md:grid-cols-2">
                    {/* Left Side - Branding */}
                    <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-8 text-white flex flex-col justify-center">
                        <div className="mb-8">
                            <h1 className="text-3xl font-bold mb-2 text-white">Abcotronics</h1>
                        </div>
                    </div>

                    {/* Right Side - Login */}
                    <div className="p-8">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome</h2>
                            <p className="text-sm text-gray-600">Sign in to access your dashboard</p>
                        </div>

                        {/* Email Login Form */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                                {error && (
                                    <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
                                        {error}
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Email Address
                                    </label>
                                    <input
                                        id="email"
                                        type="email"
                                        name="email"
                                        autoComplete="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="you@company.com"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1.5">
                                        Password
                                    </label>
                                    <input
                                        id="password"
                                        type="password"
                                        name="password"
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="••••••••"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full bg-blue-600 text-white py-2 text-sm rounded-lg hover:bg-blue-700 transition font-medium"
                                >
                                    Sign In
                                </button>
                                
                                {/* Divider */}
                                <div className="relative my-4">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-gray-300"></div>
                                    </div>
                                    <div className="relative flex justify-center text-sm">
                                        <span className="px-2 bg-white text-gray-500">or</span>
                                    </div>
                                </div>
                                
                                {/* Google OAuth */}
                                <a 
                                    href="/api/auth/google/start" 
                                    className="w-full inline-flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2 text-sm rounded-lg hover:bg-gray-50 transition font-medium"
                                >
                                    <i className="fab fa-google text-red-500"></i>
                                    Sign in with Google (Abcotronics)
                                </a>
                            </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.LoginPage = LoginPage;
