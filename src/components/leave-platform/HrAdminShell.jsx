let ReactHooks = {};
try {
    if (typeof window !== 'undefined' && window.React) {
        const R = window.React;
        ReactHooks = { useCallback: R.useCallback };
    }
} catch (e) {
    ReactHooks = { useCallback: (fn) => fn };
}
const { useCallback } = ReactHooks;

const cardBase =
    'text-left rounded-xl border border-amber-200 bg-amber-50/40 p-4 sm:p-5 shadow-sm hover:border-amber-400 hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-amber-500';

const HrAdminShell = ({ onNavigate }) => {
    const go = useCallback((id) => () => onNavigate(id), [onNavigate]);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-gray-900">HR administration</h3>
                <p className="text-sm text-gray-600 mt-1">Manage people, leave configuration, and published HR content.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <button type="button" className={cardBase} onClick={go('employees')}>
                    <i className="fas fa-users text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Employees</h4>
                    <p className="text-sm text-gray-600 mt-1">Directory and employment records</p>
                </button>
                <button type="button" className={cardBase} onClick={go('team')}>
                    <i className="fas fa-people-arrows text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Team leave</h4>
                    <p className="text-sm text-gray-600 mt-1">Leave across teams</p>
                </button>
                <button type="button" className={cardBase} onClick={go('approvals')}>
                    <i className="fas fa-check-circle text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Approvals</h4>
                    <p className="text-sm text-gray-600 mt-1">Pending leave requests</p>
                </button>
                <button type="button" className={cardBase} onClick={go('approvers')}>
                    <i className="fas fa-user-shield text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Approvers</h4>
                    <p className="text-sm text-gray-600 mt-1">Department approver mapping</p>
                </button>
                <button type="button" className={cardBase} onClick={go('import')}>
                    <i className="fas fa-upload text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Import balances</h4>
                    <p className="text-sm text-gray-600 mt-1">Bulk balance updates</p>
                </button>
                <button type="button" className={cardBase} onClick={go('policies')}>
                    <i className="fas fa-book text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Policies</h4>
                    <p className="text-sm text-gray-600 mt-1">Create and publish HR policies</p>
                </button>
                <button type="button" className={cardBase} onClick={go('documents')}>
                    <i className="fas fa-file-alt text-amber-800 text-xl mb-2" />
                    <h4 className="font-semibold text-gray-900">Documents</h4>
                    <p className="text-sm text-gray-600 mt-1">HR library uploads</p>
                </button>
            </div>
        </div>
    );
};

if (typeof window !== 'undefined') {
    window.HrAdminShell = HrAdminShell;
}

export default HrAdminShell;
