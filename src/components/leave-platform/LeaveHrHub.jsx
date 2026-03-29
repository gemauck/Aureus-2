/**
 * Landing cards for Leave & HR module
 */
let ReactHooks = {};
try {
    if (typeof window !== 'undefined' && window.React) {
        const React = window.React;
        ReactHooks = { useCallback: React.useCallback };
    }
} catch (e) {
    ReactHooks = { useCallback: (fn) => fn };
}
const { useCallback } = ReactHooks;

const cardBase =
    'text-left rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm hover:border-primary-300 hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-primary-500';

const LeaveHrHub = ({ setCurrentTab, isAdmin }) => {
    const go = useCallback((id) => () => setCurrentTab(id), [setCurrentTab]);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">Welcome</h3>
                <p className="text-sm text-gray-600 mt-1">
                    Choose an area below. Leave tools follow South African BCEA conventions; HR policies and documents are maintained by your team.
                </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button type="button" className={cardBase} onClick={go('overview')}>
                    <i className="fas fa-clipboard-list text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Leave overview</h4>
                    <p className="text-sm text-gray-500 mt-1">Summary of your leave and team activity</p>
                </button>
                <button type="button" className={cardBase} onClick={go('my-leave')}>
                    <i className="fas fa-calendar-check text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">My leave</h4>
                    <p className="text-sm text-gray-500 mt-1">Requests, status and history</p>
                </button>
                <button type="button" className={cardBase} onClick={go('apply')}>
                    <i className="fas fa-plus-circle text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Apply for leave</h4>
                    <p className="text-sm text-gray-500 mt-1">Submit a new application</p>
                </button>
                <button type="button" className={cardBase} onClick={go('my-hr')}>
                    <i className="fas fa-id-card text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">My HR profile</h4>
                    <p className="text-sm text-gray-500 mt-1">Your employment details and leave balances</p>
                </button>
                <button type="button" className={cardBase} onClick={go('policies')}>
                    <i className="fas fa-book text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Policies</h4>
                    <p className="text-sm text-gray-500 mt-1">Company HR and leave policies</p>
                </button>
                <button type="button" className={cardBase} onClick={go('documents')}>
                    <i className="fas fa-file-alt text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Documents</h4>
                    <p className="text-sm text-gray-500 mt-1">Handbooks, templates and your files</p>
                </button>
                <button type="button" className={cardBase} onClick={go('balances')}>
                    <i className="fas fa-chart-pie text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Leave balances</h4>
                    <p className="text-sm text-gray-500 mt-1">Entitlements and usage</p>
                </button>
                <button type="button" className={cardBase} onClick={go('calendar')}>
                    <i className="fas fa-calendar text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Leave calendar</h4>
                    <p className="text-sm text-gray-500 mt-1">Team leave on the calendar</p>
                </button>
                <button type="button" className={cardBase} onClick={go('birthdays')}>
                    <i className="fas fa-birthday-cake text-primary-600 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Birthdays</h4>
                    <p className="text-sm text-gray-500 mt-1">Upcoming birthdays</p>
                </button>
                {isAdmin && (
                    <button type="button" className={`${cardBase} border-amber-200 bg-amber-50/50`} onClick={go('hr-admin')}>
                        <i className="fas fa-user-shield text-amber-700 text-xl mb-2" />
                        <h4 className="font-semibold text-gray-900">HR administration</h4>
                        <p className="text-sm text-gray-600 mt-1">Employees, approvals, approvers, import, policy and document management</p>
                    </button>
                )}
            </div>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.LeaveHrHub = LeaveHrHub;
}

export default LeaveHrHub;
