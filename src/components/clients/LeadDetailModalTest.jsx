// Simplified LeadDetailModal for testing
const { useState, useEffect } = React;

const LeadDetailModalTest = ({ lead, onSave, onClose, onDelete, onConvertToClient, allProjects, isFullPage = false, isEditing = false, initialTab = 'overview', onTabChange }) => {
    const [activeTab, setActiveTab] = useState(initialTab);
    const [formData, setFormData] = useState(lead || {
        name: '',
        industry: '',
        status: 'Potential',
        source: 'Website',
        stage: 'Awareness',
        value: 0,
        notes: '',
        contacts: [],
        followUps: [],
        projectIds: [],
        comments: [],
        activityLog: [],
        firstContactDate: new Date().toISOString().split('T')[0]
    });
    
    const handleSubmit = (e) => {
        e.preventDefault();
        if (onSave) {
            onSave(formData);
        }
    };
    
    return React.createElement('div', { className: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' },
        React.createElement('div', { className: 'bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden' },
            React.createElement('div', { className: 'flex justify-between items-center p-6 border-b border-gray-200' },
                React.createElement('h2', { className: 'text-xl font-semibold text-gray-900' },
                    lead ? 'Edit Lead' : 'Add New Lead'
                ),
                React.createElement('button', {
                    onClick: onClose,
                    className: 'text-gray-400 hover:text-gray-600'
                }, '×')
            ),
            React.createElement('form', { onSubmit: handleSubmit },
                React.createElement('div', { className: 'p-6' },
                    React.createElement('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' },
                        React.createElement('div', null,
                            React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Name *'),
                            React.createElement('input', {
                                type: 'text',
                                value: formData.name,
                                onChange: (e) => setFormData({...formData, name: e.target.value}),
                                className: 'w-full px-3 py-2 border border-gray-300 rounded-lg',
                                required: true
                            })
                        ),
                        React.createElement('div', null,
                            React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Industry'),
                            React.createElement('input', {
                                type: 'text',
                                value: formData.industry,
                                onChange: (e) => setFormData({...formData, industry: e.target.value}),
                                className: 'w-full px-3 py-2 border border-gray-300 rounded-lg'
                            })
                        )
                    )
                ),
                React.createElement('div', { className: 'flex justify-end gap-3 p-6 border-t border-gray-200' },
                    React.createElement('button', {
                        type: 'button',
                        onClick: onClose,
                        className: 'px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50'
                    }, 'Cancel'),
                    React.createElement('button', {
                        type: 'submit',
                        className: 'px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700'
                    }, lead ? 'Update Lead' : 'Create Lead')
                )
            )
        )
    );
};

// Make available globally
window.LeadDetailModalTest = LeadDetailModalTest;
