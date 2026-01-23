// Get dependencies from window
const { useState, useEffect } = React;
const storage = window.storage;

const Dashboard = () => {
    const [clients, setClients] = useState([]);
    const [leads, setLeads] = useState([]);
    const [projects, setProjects] = useState([]);
    const [timeEntries, setTimeEntries] = useState([]);
    const { isDark } = window.useTheme();

    // Ultra-optimized data loading with ClientCache
    useEffect(() => {
        const loadData = async () => {
            try {
                // Use ClientCache for optimized loading
                if (window.ClientCache) {
                    const cachedData = await window.ClientCache.loadDataWithCache();
                    
                    // Set data immediately (from cache or localStorage) - leads are database-only
                    setClients(cachedData.clients);
                    setLeads([]); // Leads are database-only, no localStorage fallback
                    setProjects(cachedData.projects);
                    setTimeEntries(cachedData.timeEntries);
                    
                } else {
                    // Fallback to direct localStorage loading (leads are database-only)
                    const savedClients = (storage && typeof storage.getClients === 'function') ? storage.getClients() || [] : [];
                    const savedProjects = (storage && typeof storage.getProjects === 'function') ? storage.getProjects() || [] : [];
                    const savedTimeEntries = (storage && typeof storage.getTimeEntries === 'function') ? storage.getTimeEntries() || [] : [];

                    setClients(savedClients);
                    setLeads([]); // Leads are database-only
                    setProjects(savedProjects);
                    setTimeEntries(savedTimeEntries);
                }
            } catch (error) {
                console.error('Failed to load dashboard data:', error);
                // Ensure we have at least localStorage data (leads are database-only)
                const savedClients = (storage && typeof storage.getClients === 'function') ? storage.getClients() || [] : [];
                const savedProjects = (storage && typeof storage.getProjects === 'function') ? storage.getProjects() || [] : [];
                const savedTimeEntries = (storage && typeof storage.getTimeEntries === 'function') ? storage.getTimeEntries() || [] : [];

                setClients(savedClients);
                setLeads([]); // Leads are database-only
                setProjects(savedProjects);
                setTimeEntries(savedTimeEntries);
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

    // Get recent activities from time entries
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
    // Since status is always 'active', use stage or just count all leads as qualified
    const qualifiedLeads = leads.filter(l => l.stage === 'Qualified' || l.stage === 'Consideration' || l.stage === 'Proposal' || l.stage === 'Negotiation').length || leads.length;
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

    // Get MyProjectTasks component (may be lazy loaded)
    const MyProjectTasks = window.MyProjectTasks || (() => <div>Loading tasks...</div>);
    
    return (
        <div className="space-y-4">
            {/* My Project Tasks Component */}
            <div>
                <MyProjectTasks />
            </div>
        </div>
    );
};

// Make available globally
window.Dashboard = Dashboard;
