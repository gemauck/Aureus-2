// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const Dashboard = () => {
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const [projects, setProjects] = useState([]);
    const [timeEntries, setTimeEntries] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const { isDark } = window.useTheme();

    // Load all data from API and localStorage
    useEffect(() => {
        const loadData = async () => {
            try {
                // Check if user is logged in first
                const token = window.storage?.getToken?.();
                if (!token) {
                    console.log('No auth token, loading from localStorage only');
                    // Load from localStorage only
                    const savedClients = storage.getClients() || [];
                    const savedLeads = storage.getLeads() || [];
                    const savedProjects = storage.getProjects() || [];
                    const savedTimeEntries = storage.getTimeEntries() || [];
                    const savedInvoices = storage.getInvoices() || [];

                    setClients(savedClients);
                    setLeads(savedLeads);
                    setProjects(savedProjects);
                    setTimeEntries(savedTimeEntries);
                    setInvoices(savedInvoices);
                    return;
                }

                // Try to load from API, but if it fails with 401, clear the token
                try {
                    const clientsResponse = await window.api.listClients();
                    setClients(clientsResponse.data.clients || []);
                } catch (apiError) {
                    if (apiError.message.includes('Unauthorized') || apiError.message.includes('401')) {
                        console.log('Token expired, clearing and using localStorage');
                        window.storage.removeToken();
                        window.storage.removeUser();
                        // Load from localStorage instead
                        const savedClients = storage.getClients() || [];
                        setClients(savedClients);
                    } else {
                        throw apiError;
                    }
                }
                
                // Still load some data from localStorage for now
                const savedLeads = storage.getLeads() || [];
                const savedProjects = storage.getProjects() || [];
                const savedTimeEntries = storage.getTimeEntries() || [];
                const savedInvoices = storage.getInvoices() || [];

                setLeads(savedLeads);
                setProjects(savedProjects);
                setTimeEntries(savedTimeEntries);
                setInvoices(savedInvoices);
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
                // Fallback to localStorage
                const savedClients = storage.getClients() || [];
                const savedLeads = storage.getLeads() || [];
                const savedProjects = storage.getProjects() || [];
                const savedTimeEntries = storage.getTimeEntries() || [];
                const savedInvoices = storage.getInvoices() || [];

                setClients(savedClients);
                setLeads(savedLeads);
                setProjects(savedProjects);
                setTimeEntries(savedTimeEntries);
                setInvoices(savedInvoices);
            }
        };
        
        loadData();
    }, []);

    // Calculate stats
    const activeClients = clients.filter(c => c.status === 'active' || c.status === 'Active').length;
    const activeProjects = projects.filter(p => p.status === 'In Progress' || p.status === 'Planning' || p.status === 'Review').length;
    
    // Calculate hours this month
    const now = new Date();
    const thisMonth = timeEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear();
    });
    const hoursThisMonth = thisMonth.reduce((sum, entry) => sum + entry.hours, 0);
    
    // Calculate previous month stats for comparison
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEntries = timeEntries.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getMonth() === lastMonth.getMonth() && entryDate.getFullYear() === lastMonth.getFullYear();
    });
    const hoursLastMonth = lastMonthEntries.reduce((sum, entry) => sum + entry.hours, 0);
    const hoursChange = hoursLastMonth > 0 ? ((hoursThisMonth - hoursLastMonth) / hoursLastMonth * 100).toFixed(0) : 0;

    const stats = [
        { 
            label: 'Active Clients', 
            value: activeClients.toString(), 
            icon: 'fa-users', 
            color: 'bg-blue-500', 
            change: `${clients.length} total`,
            changeColor: 'text-gray-600'
        },
        { 
            label: 'Active Projects', 
            value: activeProjects.toString(), 
            icon: 'fa-project-diagram', 
            color: 'bg-green-500', 
            change: `${projects.length} total`,
            changeColor: 'text-gray-600'
        },
        { 
            label: 'Hours This Month', 
            value: hoursThisMonth.toFixed(1), 
            icon: 'fa-clock', 
            color: 'bg-purple-500', 
            change: hoursChange !== 0 ? `${hoursChange > 0 ? '+' : ''}${hoursChange}%` : 'No change',
            changeColor: hoursChange > 0 ? 'text-green-600' : hoursChange < 0 ? 'text-red-600' : 'text-gray-600'
        }
    ];

    // Get recent projects (sorted by date, most recent first)
    const recentProjects = [...projects]
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
        .slice(0, 5)
        .map(p => ({
            ...p,
            taskCount: p.tasks?.length || 0
        }));

    // Get recent activities from time entries and invoices
    const recentActivities = [];
    
    // Helper function to calculate better time ago
    const getTimeAgo = (date) => {
        const now = new Date();
        const past = new Date(date);
        const diffMs = now - past;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffWeeks = Math.floor(diffDays / 7);
        const diffMonths = Math.floor(diffDays / 30);
        const diffYears = Math.floor(diffDays / 365);
        
        if (diffYears > 0) return { text: `${diffYears} year${diffYears > 1 ? 's' : ''} ago`, value: diffMs };
        if (diffMonths > 0) return { text: `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`, value: diffMs };
        if (diffWeeks > 0) return { text: `${diffWeeks} week${diffWeeks > 1 ? 's' : ''} ago`, value: diffMs };
        if (diffDays > 0) return { text: `${diffDays} day${diffDays > 1 ? 's' : ''} ago`, value: diffMs };
        if (diffHours > 0) return { text: `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`, value: diffMs };
        if (diffMins > 0) return { text: `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`, value: diffMs };
        return { text: 'Just now', value: 0 };
    };
    
    // Add time entries (only from last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentTimeEntries = [...timeEntries]
        .filter(entry => new Date(entry.date) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);
    
    recentTimeEntries.forEach(entry => {
        const timeAgo = getTimeAgo(entry.date);
        recentActivities.push({
            user: entry.employee,
            action: 'logged',
            target: `${entry.hours}h on ${entry.project}`,
            time: timeAgo.text,
            sortValue: timeAgo.value,
            icon: 'clock',
            color: 'blue'
        });
    });
    
    // Add recent invoices (only from last 30 days)
    const recentInvoices = [...invoices]
        .filter(inv => new Date(inv.issueDate) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate))
        .slice(0, 2);
    
    recentInvoices.forEach(inv => {
        const timeAgo = getTimeAgo(inv.issueDate);
        recentActivities.push({
            user: 'System',
            action: 'created invoice',
            target: `${inv.invoiceNumber} - ${inv.client}`,
            time: timeAgo.text,
            sortValue: timeAgo.value,
            icon: 'file-invoice-dollar',
            color: 'green'
        });
    });
    
    // Add recent project updates (from last 30 days)
    const recentProjectUpdates = [...projects]
        .filter(p => new Date(p.startDate) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
        .slice(0, 2);
    
    recentProjectUpdates.forEach(project => {
        const timeAgo = getTimeAgo(project.startDate);
        recentActivities.push({
            user: 'System',
            action: 'started project',
            target: project.name,
            time: timeAgo.text,
            sortValue: timeAgo.value,
            icon: 'project-diagram',
            color: 'purple'
        });
    });

    // Sort activities by actual time (most recent first)
    recentActivities.sort((a, b) => a.sortValue - b.sortValue);

    // Get top clients by project count
    const clientProjectCounts = {};
    projects.forEach(p => {
        if (!clientProjectCounts[p.client]) {
            clientProjectCounts[p.client] = 0;
        }
        clientProjectCounts[p.client]++;
    });
    
    const topClients = Object.entries(clientProjectCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([clientName, projectCount]) => {
            const client = clients.find(c => c.name === clientName);
            return {
                name: clientName,
                projectCount,
                status: client?.status || 'Unknown'
            };
        });

    // Pipeline stats - Include both Leads and Client Opportunities
    const qualifiedLeads = leads.filter(l => l.status === 'Qualified').length;
    const leadsPipelineValue = leads.reduce((sum, l) => sum + l.value, 0);
    const leadsWeightedValue = leads.reduce((sum, l) => sum + (l.value * l.probability / 100), 0);
    
    // Calculate client opportunities count (no values)
    const clientOpportunities = clients.reduce((acc, client) => {
        if (client.opportunities && Array.isArray(client.opportunities)) {
            return acc.concat(client.opportunities.map(opp => ({
                ...opp,
                clientName: client.name
            })));
        }
        return acc;
    }, []);
    
    // Combined counts only
    const totalPipeline = leadsPipelineValue;
    const weightedPipeline = leadsWeightedValue;

    // Outstanding invoices
    const overdueInvoices = invoices.filter(inv => {
        const dueDate = new Date(inv.dueDate);
        return inv.status === 'Unpaid' && dueDate < now;
    });
    const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balance, 0);

    return (
        <div className="space-y-3">
            <div>
                <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
                <p className="text-xs text-gray-600">Business overview</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {stats.map((stat, idx) => (
                    <div key={idx} className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded border p-2`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} mb-0.5`}>{stat.label}</p>
                                <p className={`text-lg font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{stat.value}</p>
                                <p className={`text-[10px] ${stat.changeColor} mt-0.5`}>{stat.change}</p>
                            </div>
                            <div className={`${stat.color} w-10 h-10 rounded-lg flex items-center justify-center`}>
                                <i className={`fas ${stat.icon} text-white`}></i>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pipeline & Outstanding Invoices Alert Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Pipeline Summary */}
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-4 text-white">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold">Sales Pipeline</h2>
                        <i className="fas fa-funnel-dollar text-xl opacity-80"></i>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-xs opacity-90">Active Leads (Prospects)</span>
                            <span className="text-base font-bold">{leads.length}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs opacity-90">Client Opportunities</span>
                            <span className="text-base font-bold">{clientOpportunities.length}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-blue-400">
                            <span className="text-xs font-medium">Total Pipeline Value</span>
                            <span className="text-lg font-bold">R {totalPipeline.toLocaleString('en-ZA')}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-medium">Weighted Value</span>
                            <span className="text-xl font-bold">R {Math.round(weightedPipeline).toLocaleString('en-ZA')}</span>
                        </div>
                    </div>
                </div>

                {/* Outstanding Invoices Alert - Only show if there are overdue invoices */}
                {overdueInvoices.length > 0 && (
                    <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-4 text-white">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-sm font-semibold">Overdue Invoices</h2>
                            <i className="fas fa-exclamation-triangle text-xl opacity-80"></i>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs opacity-90">Overdue Count</span>
                                <span className="text-2xl font-bold">{overdueInvoices.length}</span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-red-400">
                                <span className="text-xs font-medium">Total Amount</span>
                                <span className="text-xl font-bold">R {overdueAmount.toLocaleString('en-ZA')}</span>
                            </div>
                            <button className="w-full mt-3 bg-white text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition text-xs font-semibold">
                                View Overdue Invoices
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Recent Projects */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>Recent Projects</h2>
                    {recentProjects.length > 0 ? (
                        <div className="space-y-3">
                            {recentProjects.map(project => (
                                <div key={project.id} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b pb-3 last:border-b-0 last:pb-0`}>
                                    <div className="flex justify-between items-start mb-1.5">
                                        <div>
                                            <h3 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>{project.name}</h3>
                                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{project.client}</p>
                                        </div>
                                        <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                                            project.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                            project.status === 'Review' ? 'bg-yellow-100 text-yellow-800' :
                                            project.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                            isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {project.status}
                                        </span>
                                    </div>
                                    <div className={`flex items-center justify-between text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                        <span><i className="fas fa-tasks mr-1"></i>{project.taskCount} tasks</span>
                                        <span><i className="fas fa-calendar mr-1"></i>{project.dueDate}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <i className="fas fa-project-diagram text-3xl text-gray-300 mb-2"></i>
                            <p className="text-xs text-gray-500">No projects yet</p>
                        </div>
                    )}
                </div>

                {/* Recent Activity */}
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>Recent Activity</h2>
                    {recentActivities.length > 0 ? (
                        <div className="space-y-2.5">
                            {recentActivities.slice(0, 5).map((activity, idx) => (
                                <div key={idx} className="flex items-start space-x-2">
                                    <div className={`w-7 h-7 rounded-full bg-${activity.color}-100 flex items-center justify-center flex-shrink-0`}>
                                        <i className={`fas fa-${activity.icon} text-${activity.color}-600 text-xs`}></i>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                                            <span className="font-medium">{activity.user}</span>
                                            {' '}{activity.action}{' '}
                                            <span className="font-medium">{activity.target}</span>
                                        </p>
                                        <p className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{activity.time}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <i className={`fas fa-history text-3xl ${isDark ? 'text-gray-600' : 'text-gray-300'} mb-2`}></i>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No activity in the last 30 days</p>
                            <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'} mt-1`}>Time entries, invoices, and projects will appear here</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Top Clients */}
            {topClients.length > 0 && (
                <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}>
                    <h2 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'} mb-2.5`}>Top Clients by Project Count</h2>
                    <div className="space-y-2">
                        {topClients.map((client, idx) => (
                            <div key={idx} className={`flex items-center justify-between py-2 ${isDark ? 'border-gray-700' : 'border-gray-200'} border-b last:border-b-0`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                                        <span className="text-primary-600 font-semibold text-xs">{client.name.charAt(0)}</span>
                                    </div>
                                    <div>
                                        <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'} text-sm`}>{client.name}</div>
                                        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{client.status}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-primary-600 text-sm">{client.projectCount}</div>
                                    <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>projects</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Make available globally
window.Dashboard = Dashboard;
