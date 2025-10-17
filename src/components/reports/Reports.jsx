// Use React from window
const { useState } = React;

const Reports = () => {
    // Get report components from window
    const AuditTrail = window.AuditTrail;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div>
                <h1 className="text-lg font-bold text-gray-900">Audit Trail</h1>
                <p className="text-xs text-gray-600 mt-0.5">System activity monitoring and audit logs</p>
            </div>

            {/* Content */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                {AuditTrail ? <AuditTrail /> : <div className="text-center py-12 text-gray-500">Loading...</div>}
            </div>
        </div>
    );
};

// Make available globally
window.Reports = Reports;
