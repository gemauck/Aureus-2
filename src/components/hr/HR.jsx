// Get React hooks from window
const { useMemo } = React;

const HR = () => {
    const LeavePlatform = useMemo(() => window.LeavePlatform, []);

    if (!LeavePlatform || typeof LeavePlatform !== 'function') {
        return (
            <div className="flex items-center justify-center min-h-[320px]">
                <div className="text-center text-gray-500">
                    <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
                    <p>Loading HR portal…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Human Resources Portal</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Self-service leave management, approvals, and BCEA compliance
                    </p>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-xs text-green-700 dark:text-green-300 font-medium">
                        South African BCEA compliant
                    </p>
                </div>
            </div>

            <LeavePlatform initialTab="overview" />
        </div>
    );
};

window.HR = HR;
