// Get React hooks from window
const { useState, useEffect, useRef } = React;

// Simple test component to verify progress tracker persistence
const ProgressPersistenceTest = function ProgressPersistenceTestComponent() {
    const [testData, setTestData] = useState({
        projectId: '',
        month: 'January',
        year: new Date().getFullYear(),
        field: 'comments',
        value: ''
    });
    const [savedData, setSavedData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [projects, setProjects] = useState([]);

    // Load projects on mount
    useEffect(() => {
        const loadProjects = async () => {
            try {
                if (window.DatabaseAPI && window.DatabaseAPI.getProjects) {
                    const response = await window.DatabaseAPI.getProjects();
                    const projs = response?.data?.projects || response?.projects || response?.data || [];
                    setProjects(Array.isArray(projs) ? projs : []);
                    
                    // Auto-select first project if available
                    if (projs.length > 0 && !testData.projectId) {
                        setTestData(prev => ({ ...prev, projectId: projs[0].id }));
                    }
                }
            } catch (error) {
                console.error('Error loading projects:', error);
                setStatus('Error loading projects: ' + error.message);
            }
        };
        loadProjects();
    }, []);

    // Load saved data for selected project/month/field
    const loadSavedData = async () => {
        if (!testData.projectId) {
            setStatus('Please select a project');
            return;
        }

        setLoading(true);
        setStatus('Loading...');
        
        try {
            if (window.DatabaseAPI && window.DatabaseAPI.getProject) {
                const response = await window.DatabaseAPI.getProject(testData.projectId);
                const project = response?.data?.project || response?.project || response?.data;
                
                if (project) {
                    let monthlyProgress = project.monthlyProgress || {};
                    
                    // Parse if it's a string
                    if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                        try {
                            monthlyProgress = JSON.parse(monthlyProgress);
                        } catch (e) {
                            console.warn('Failed to parse monthlyProgress:', e);
                            monthlyProgress = {};
                        }
                    }
                    
                    const key = `${testData.month}-${testData.year}`;
                    const monthData = monthlyProgress[key] || {};
                    const fieldValue = monthData[testData.field] || '';
                    
                    setSavedData({
                        projectName: project.name || 'Unknown',
                        value: fieldValue,
                        rawProgress: monthlyProgress,
                        key: key
                    });
                    
                    setStatus(`✅ Loaded data for ${project.name || 'project'}`);
                } else {
                    setStatus('❌ Project not found');
                    setSavedData(null);
                }
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
            setStatus('❌ Error: ' + error.message);
            setSavedData(null);
        } finally {
            setLoading(false);
        }
    };

    // Save test data
    const saveTestData = async () => {
        if (!testData.projectId) {
            setStatus('Please select a project');
            return;
        }

        if (!testData.value.trim()) {
            setStatus('Please enter a value to save');
            return;
        }

        setLoading(true);
        setStatus('Saving...');
        
        try {
            // Get current project data
            const response = await window.DatabaseAPI.getProject(testData.projectId);
            const project = response?.data?.project || response?.project || response?.data;
            
            if (!project) {
                throw new Error('Project not found');
            }
            
            // Get current monthlyProgress
            let monthlyProgress = project.monthlyProgress || {};
            if (typeof monthlyProgress === 'string' && monthlyProgress.trim()) {
                try {
                    monthlyProgress = JSON.parse(monthlyProgress);
                } catch (e) {
                    monthlyProgress = {};
                }
            }
            
            // Update the specific field
            const key = `${testData.month}-${testData.year}`;
            const currentMonthData = monthlyProgress[key] || {};
            const updatedMonthData = {
                ...currentMonthData,
                [testData.field]: testData.value
            };
            const updatedProgress = {
                ...monthlyProgress,
                [key]: updatedMonthData
            };
            
            // Save via API
            const updateResponse = await window.DatabaseAPI.updateProject(testData.projectId, {
                monthlyProgress: JSON.stringify(updatedProgress)
            });
            
            setStatus('✅ Saved successfully!');
            
            // Reload to verify
            setTimeout(() => {
                loadSavedData();
            }, 500);
            
        } catch (error) {
            console.error('Error saving data:', error);
            setStatus('❌ Save failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Test persistence by saving, reloading page, and checking
    const testPersistence = async () => {
        if (!testData.projectId || !testData.value.trim()) {
            setStatus('Please enter test data first');
            return;
        }

        setLoading(true);
        setStatus('Testing persistence...');
        
        try {
            // Step 1: Save data
            await saveTestData();
            setStatus('✅ Step 1: Data saved. Now reload the page to test persistence.');
            
            // Store test info in sessionStorage for verification
            sessionStorage.setItem('persistenceTest', JSON.stringify({
                projectId: testData.projectId,
                month: testData.month,
                year: testData.year,
                field: testData.field,
                value: testData.value,
                timestamp: new Date().toISOString()
            }));
            
            // Step 2: Wait a moment, then reload
            setTimeout(() => {
                if (confirm('Data saved! Reload page to verify persistence?')) {
                    window.location.reload();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error testing persistence:', error);
            setStatus('❌ Test failed: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Check if we're returning from a reload
    useEffect(() => {
        const testInfo = sessionStorage.getItem('persistenceTest');
        if (testInfo) {
            try {
                const info = JSON.parse(testInfo);
                setTestData(prev => ({
                    ...prev,
                    projectId: info.projectId,
                    month: info.month,
                    year: info.year,
                    field: info.field,
                    value: info.value
                }));
                
                // Auto-load saved data
                setTimeout(() => {
                    loadSavedData();
                    setStatus('🔄 Reloaded - checking if data persisted...');
                }, 1000);
                
                // Clear test info
                sessionStorage.removeItem('persistenceTest');
            } catch (e) {
                console.error('Error parsing test info:', e);
            }
        }
    }, []);

    return React.createElement('div', { 
        className: 'p-6 bg-white rounded-lg shadow-lg border border-gray-200 max-w-4xl mx-auto',
        style: { margin: '20px' }
    },
        React.createElement('h2', { 
            className: 'text-2xl font-bold text-gray-900 mb-4',
            style: { marginBottom: '16px' }
        }, 
            React.createElement('i', { className: 'fas fa-flask mr-2' }),
            'Progress Tracker Persistence Test'
        ),
        
        React.createElement('div', { className: 'space-y-4' },
            // Project selection
            React.createElement('div', { className: 'grid grid-cols-2 gap-4' },
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Project'),
                    React.createElement('select', {
                        value: testData.projectId,
                        onChange: (e) => setTestData(prev => ({ ...prev, projectId: e.target.value })),
                        className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500',
                        disabled: loading
                    },
                        React.createElement('option', { value: '' }, 'Select a project...'),
                        projects.map(p => React.createElement('option', { key: p.id, value: p.id }, p.name || 'Unnamed Project'))
                    )
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Month'),
                    React.createElement('select', {
                        value: testData.month,
                        onChange: (e) => setTestData(prev => ({ ...prev, month: e.target.value })),
                        className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500',
                        disabled: loading
                    },
                        ['January', 'February', 'March', 'April', 'May', 'June', 
                         'July', 'August', 'September', 'October', 'November', 'December'].map(m => 
                            React.createElement('option', { key: m, value: m }, m)
                        )
                    )
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Year'),
                    React.createElement('input', {
                        type: 'number',
                        value: testData.year,
                        onChange: (e) => setTestData(prev => ({ ...prev, year: parseInt(e.target.value) || new Date().getFullYear() })),
                        className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500',
                        disabled: loading
                    })
                ),
                React.createElement('div', null,
                    React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Field'),
                    React.createElement('select', {
                        value: testData.field,
                        onChange: (e) => setTestData(prev => ({ ...prev, field: e.target.value })),
                        className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500',
                        disabled: loading
                    },
                        React.createElement('option', { value: 'comments' }, 'Comments'),
                        React.createElement('option', { value: 'compliance' }, 'Compliance'),
                        React.createElement('option', { value: 'data' }, 'Data')
                    )
                )
            ),
            
            // Value input
            React.createElement('div', null,
                React.createElement('label', { className: 'block text-sm font-medium text-gray-700 mb-1' }, 'Test Value'),
                React.createElement('textarea', {
                    value: testData.value,
                    onChange: (e) => setTestData(prev => ({ ...prev, value: e.target.value })),
                    placeholder: 'Enter test data to save...',
                    className: 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500',
                    rows: 3,
                    disabled: loading
                })
            ),
            
            // Buttons
            React.createElement('div', { className: 'flex gap-3' },
                React.createElement('button', {
                    onClick: saveTestData,
                    disabled: loading || !testData.projectId,
                    className: 'px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium'
                },
                    React.createElement('i', { className: 'fas fa-save mr-2' }),
                    'Save Data'
                ),
                React.createElement('button', {
                    onClick: loadSavedData,
                    disabled: loading || !testData.projectId,
                    className: 'px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium'
                },
                    React.createElement('i', { className: 'fas fa-download mr-2' }),
                    'Load Saved Data'
                ),
                React.createElement('button', {
                    onClick: testPersistence,
                    disabled: loading || !testData.projectId || !testData.value.trim(),
                    className: 'px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium'
                },
                    React.createElement('i', { className: 'fas fa-sync mr-2' }),
                    'Test Persistence (Save & Reload)'
                )
            ),
            
            // Status
            status && React.createElement('div', {
                className: `p-3 rounded-lg ${
                    status.includes('✅') ? 'bg-green-50 text-green-800' :
                    status.includes('❌') ? 'bg-red-50 text-red-800' :
                    'bg-blue-50 text-blue-800'
                }`
            }, status),
            
            // Saved data display
            savedData && React.createElement('div', { className: 'mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200' },
                React.createElement('h3', { className: 'font-semibold text-gray-900 mb-2' }, 'Saved Data'),
                React.createElement('div', { className: 'space-y-2 text-sm' },
                    React.createElement('div', null,
                        React.createElement('span', { className: 'font-medium' }, 'Project: '),
                        savedData.projectName
                    ),
                    React.createElement('div', null,
                        React.createElement('span', { className: 'font-medium' }, 'Key: '),
                        savedData.key
                    ),
                    React.createElement('div', null,
                        React.createElement('span', { className: 'font-medium' }, 'Value: '),
                        React.createElement('span', { 
                            className: savedData.value ? 'text-green-700 font-mono' : 'text-gray-400'
                        }, savedData.value || '(empty)')
                    ),
                    savedData.value && React.createElement('div', { className: 'mt-2 p-2 bg-white rounded border border-gray-300' },
                        savedData.value
                    )
                )
            )
        )
    );
};

// Register globally
try {
    window.ProgressPersistenceTest = ProgressPersistenceTest;
    console.log('✅ ProgressPersistenceTest registered successfully');
} catch (error) {
    console.error('❌ Failed to register ProgressPersistenceTest:', error);
}







