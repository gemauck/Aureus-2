// Simplified Teams component to prevent crashes - minimal theme matching Dashboard/Projects
const TeamsSimple = () => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-users text-gray-600 dark:text-gray-300 text-sm sm:text-lg"></i>
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">Teams & Knowledge Hub</h1>
                    <p className="text-sm mt-0.5 text-gray-500 dark:text-gray-400">Centralized documentation, workflows, and team collaboration</p>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-8 shadow-sm">
                <div className="text-center py-12">
                    <i className="fas fa-users text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Teams Module</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                        This module is being optimized for better performance.
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                        Coming soon: Document management, workflows, checklists, and team collaboration features.
                    </p>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.TeamsSimple = TeamsSimple;
