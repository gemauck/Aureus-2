// Simple Loading State Component
const { useState } = React;

const LoadingState = ({ message = "Loading...", showSpinner = true }) => {
    return (
        <div className="flex items-center justify-center min-h-64 bg-white rounded-lg shadow">
            <div className="text-center">
                {showSpinner && (
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                )}
                <p className="text-gray-600 text-lg">{message}</p>
                <p className="text-gray-500 text-sm mt-2">Please wait while we load your data...</p>
            </div>
        </div>
    );
};

// Make available globally
window.LoadingState = LoadingState;
