// TEAMS ENHANCED - Complete Teams & Collaboration Platform
// This component provides comprehensive team communication, task management, and collaboration features

const { useState, useEffect, useRef } = React;
const storage = window.storage;

const TeamsEnhanced = () => {
    // Use the original Teams component directly, avoiding wrapper complexity
    if (!window.Teams) {
        return (
            <div className="p-4">
                <div className="text-center py-12">
                    <i className="fas fa-users text-4xl text-gray-300 mb-3"></i>
                    <p className="text-sm text-gray-500">Teams module loading...</p>
                </div>
            </div>
        );
    }
    
    // Render Teams directly without creating unnecessary wrapper instances
    return React.createElement(window.Teams);
};

// Make available globally
window.TeamsEnhanced = TeamsEnhanced;
