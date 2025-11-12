// Enhanced Dashboard with Advanced Analytics and Quick Actions
const { useState, useEffect } = React;
const storage = window.storage;

const DashboardEnhanced = () => {
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const [projects, setProjects] = useState([]);
    const [timeEntries, setTimeEntries] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTimeRange, setSelectedTimeRange] = useState('30d');
    const [activeTab, setActiveTab] = useState('overview');
    const { isDark } = window.useTheme();

    // Load all data from API and localStorage
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const token = window.storage?.getToken?.();
                if (!token) {
                    // Load from localStorage only (projects are database-only)
                    const savedClients = (storage && typeof storage.getClients === 'function') ? storage.getClients() || [] : [];
                    const savedTimeEntries = (storage && typeof storage.getTimeEntries === 'function') ? storage.getTimeEntries() || [] : [];

                    setClients(savedClients);
                    setLeads([]); // Leads are database-only
                    setProjects([]); // Projects are database-only
                    setTimeEntries(savedTimeEntries);
                } else {
                    // Try to load from API
                    try {
                        const [clientsResponse, leadsResponse, projectsResponse, timeResponse] = await Promise.allSettled([
                            window.api.getClients(),
                            window.api.getLeads?.() || Promise.resolve({ data: [] }),
                            window.api.getProjects?.() || Promise.resolve({ data: [] }),
                            window.api.getTimeEntries?.() || Promise.resolve({ data: [] })
                        ]);

                        setClients(clientsResponse.status === 'fulfilled' ? clientsResponse.value : ((storage && typeof storage.getClients === 'function') ? storage.getClients() || [] : []));
                        setLeads(leadsResponse.status === 'fulfilled' ? leadsResponse.value.data || [] : []); // Leads are database-only
                        setProjects(projectsResponse.status === 'fulfilled' ? projectsResponse.value.data || [] : []); // Projects are database-only
                        setTimeEntries(timeResponse.status === 'fulfilled' ? timeResponse.value.data || [] : ((storage && typeof storage.getTimeEntries === 'function') ? storage.getTimeEntries() || [] : []));
                    } catch (error) {
                        console.error('Error loading data:', error);
                        // Fallback to localStorage (leads are database-only)
                        setClients((storage && typeof storage.getClients === 'function') ? storage.getClients() || [] : []);
                        setLeads([]); // Leads are database-only
                        setProjects((storage && typeof storage.getProjects === 'function') ? storage.getProjects() || [] : []);
                        setTimeEntries((storage && typeof storage.getTimeEntries === 'function') ? storage.getTimeEntries() || [] : []);
                    }
                }

                // Generate recent activity
                generateRecentActivity();
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    // Generate recent activity from all data sources
    const generateRecentActivity = () => {
        const activities = [];
        
        // Add recent clients
        clients.slice(-5).forEach(client => {
            activities.push({
                id: `client-${client.id}`,
                type: 'client',
                title: `New client: ${client.name}`,
                description: `${client.industry} - ${client.status}`,
                timestamp: client.lastContact || new Date().toISOString(),
                icon: 'fas fa-building',
                color: 'text-blue-600'
            });
        });

        // Add recent leads
        leads.slice(-5).forEach(lead => {
            activities.push({
                id: `lead-${lead.id}`,
                type: 'lead',
                title: `New lead: ${lead.name}`,
                description: `${lead.industry} - ${lead.status}`,
                timestamp: lead.lastContact || new Date().toISOString(),
                icon: 'fas fa-user-plus',
                color: 'text-green-600'
            });
        });

        // Add recent projects
        projects.slice(-5).forEach(project => {
            activities.push({
                id: `project-${project.id}`,
                type: 'project',
                title: `Project: ${project.name}`,
                description: `${project.status} - ${project.progress || 0}% complete`,
                timestamp: project.updatedAt || new Date().toISOString(),
                icon: 'fas fa-project-diagram',
                color: 'text-purple-600'
            });
        });


        // Sort by timestamp and take the most recent 10
        setRecentActivity(activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10));
    };

    // Calculate key metrics
    const calculateMetrics = () => {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        // Filter data based on selected time range
        const filterByTimeRange = (items, dateField = 'lastContact') => {
            if (selectedTimeRange === '7d') {
                const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                return items.filter(item => new Date(item[dateField]) >= sevenDaysAgo);
            } else if (selectedTimeRange === '30d') {
                return items.filter(item => new Date(item[dateField]) >= thirtyDaysAgo);
            } else if (selectedTimeRange === '90d') {
                const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
                return items.filter(item => new Date(item[dateField]) >= ninetyDaysAgo);
            }
            return items;
        };

        const recentClients = filterByTimeRange(clients);
        const recentLeads = filterByTimeRange(leads);
        const recentProjects = filterByTimeRange(projects, 'updatedAt');
        const activeProjects = projects.filter(p => p.status === 'Active').length;
        const totalTimeEntries = timeEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);

        // Calculate growth rates
        const previousPeriod = selectedTimeRange === '7d' ? 7 : selectedTimeRange === '30d' ? 30 : 90;
        const previousStart = new Date(now.getTime() - (previousPeriod * 2 * 24 * 60 * 60 * 1000));
        const previousEnd = new Date(now.getTime() - (previousPeriod * 24 * 60 * 60 * 1000));
        
        const previousClients = clients.filter(c => {
            const date = new Date(c.lastContact);
            return date >= previousStart && date <= previousEnd;
        }).length;
        
        const clientGrowthRate = previousClients > 0 ? ((recentClients.length - previousClients) / previousClients * 100) : 0;

        return {
            totalClients: clients.length,
            totalLeads: leads.length,
            totalProjects: projects.length,
            totalRevenue,
            recentRevenue,
            activeProjects,
            totalTimeEntries,
            recentClients: recentClients.length,
            recentLeads: recentLeads.length,
            recentProjects: recentProjects.length,
            clientGrowthRate
        };
    };

    const metrics = calculateMetrics();

    // Quick action handlers
    const handleQuickAction = (action) => {
        switch (action) {
            case 'add-client':
                window.location.hash = '#/clients?action=add';
                break;
            case 'add-lead':
                window.location.hash = '#/clients?action=add-lead';
                break;
            case 'start-timer':
                window.location.hash = '#/time?action=start';
                break;
            case 'view-projects':
                window.location.hash = '#/projects';
                break;
            case 'view-reports':
                window.location.hash = '#/reports';
                break;
        }
    };

    // Metric card component
    const MetricCard = ({ title, value, subtitle, icon, color, trend, onClick }) => (
        <div 
            onClick={onClick}
            className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-750' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl p-6 cursor-pointer transition-all duration-200 hover:shadow-lg`}
        >
            <div className="flex items-center justify-between">
                <div className="flex-1">
                    <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {title}
                    </p>
                    <p className={`text-2xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'} mt-1`}>
                        {value}
                    </p>
                    {subtitle && (
                        <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'} mt-1`}>
                            {subtitle}
                        </p>
                    )}
                    {trend && (
                        <div className={`flex items-center mt-2 text-xs ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            <i className={`fas fa-arrow-${trend > 0 ? 'up' : 'down'} mr-1`}></i>
                            {Math.abs(trend).toFixed(1)}%
                        </div>
                    )}
                </div>
                <div className={`${color} p-3 rounded-lg`}>
                    <i className={`${icon} text-xl text-white`}></i>
                </div>
            </div>
        </div>
    );

    // Quick action button component
    const QuickActionButton = ({ title, icon, color, onClick, description }) => (
        <button
            onClick={onClick}
            className={`${isDark ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-lg p-4 text-left transition-all duration-200 hover:shadow-md w-full`}
        >
            <div className="flex items-center space-x-3">
                <div className={`${color} p-2 rounded-lg`}>
                    <i className={`${icon} text-lg text-white`}></i>
                </div>
                <div>
                    <h3 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {title}
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                        {description}
                    </p>
                </div>
            </div>
        </button>
    );

    // Activity item component
    const ActivityItem = ({ activity }) => (
        <div className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <div className="flex items-start space-x-3">
                <div className={`${activity.color} p-2 rounded-lg`}>
                    <i className={`${activity.icon} text-sm text-white`}></i>
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {activity.title}
                    </h4>
                    <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                        {activity.description}
                    </p>
                    <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'} mt-2`}>
                        {new Date(activity.timestamp).toLocaleDateString()}
                    </p>
                </div>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <i className="fas fa-spinner fa-spin text-3xl text-primary-600 mb-4"></i>
                    <p className={`${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    // Get Calendar component
    const Calendar = window.Calendar || (() => <div>Loading calendar...</div>);

    return (
        <div className="space-y-4">
            {/* Calendar Component */}
            <div>
                <Calendar />
            </div>
        </div>
    );
};

// Make available globally
window.DashboardEnhanced = DashboardEnhanced;
