import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Placeholder components - replace with your actual components
function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-4 text-gray-600">
        Welcome to the modernized Abcotronics ERP!
      </p>
      <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-lg">
        <h2 className="text-xl font-semibold text-green-900">🎉 Migration Successful!</h2>
        <ul className="mt-4 space-y-2 text-green-800">
          <li>✅ Vite dev server running</li>
          <li>✅ Hot Module Replacement active</li>
          <li>✅ Modern React architecture</li>
          <li>✅ Proper ES modules</li>
        </ul>
        <p className="mt-4 text-sm text-green-700">
          Next: Copy your components from src/ to frontend/src/components/
        </p>
      </div>
    </div>
  );
}

function Login() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Login</h1>
        <p className="text-gray-600">Login component - to be implemented</p>
      </div>
    </div>
  );
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  useEffect(() => {
    // Check authentication status
    const token = localStorage.getItem('abcotronics_token');
    setIsAuthenticated(!!token);
  }, []);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route 
        path="/" 
        element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} 
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default App;
