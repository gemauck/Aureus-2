// Simplified Teams component to prevent crashes
const TeamsSimple = () => {
    return (
        <div className="p-4">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 mb-4">
                    Teams & Knowledge Hub
                </h1>
                <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
                    <div className="text-center py-12">
                        <i className="fas fa-users text-6xl text-gray-300 dark:text-slate-600 mb-4"></i>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100 mb-2">
                            Teams Module
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
                            This module is being optimized for better performance.
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-500">
                            Coming soon: Document management, workflows, checklists, and team collaboration features.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Make available globally
window.TeamsSimple = TeamsSimple;

