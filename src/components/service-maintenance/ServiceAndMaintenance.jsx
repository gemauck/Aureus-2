// Use React from window
const { useState, useEffect } = React;

const ServiceAndMaintenance = () => {
  const { user } = window.useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobCardsReady, setJobCardsReady] = useState(!!window.JobCards);

  // Load clients and users for JobCards
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load clients
        if (window.DatabaseAPI && window.DatabaseAPI.getClients) {
          const response = await window.DatabaseAPI.getClients();
          const clientsData = response?.data?.clients || response?.data || [];
          setClients(Array.isArray(clientsData) ? clientsData : []);
        }

        // Load users
        if (window.DatabaseAPI && window.DatabaseAPI.getUsers) {
          const response = await window.DatabaseAPI.getUsers();
          const usersData = response?.data?.users || response?.data || [];
          setUsers(Array.isArray(usersData) ? usersData : []);
        }
      } catch (error) {
        console.error('Error loading data for Service and Maintenance:', error);
      }
    };

    loadData();
  }, []);

  // Poll for JobCards component registration to avoid permanent loading state
  useEffect(() => {
    if (jobCardsReady) {
      return;
    }

    let cancelled = false;
    const checkJobCards = () => {
      if (!cancelled && window.JobCards) {
        setJobCardsReady(true);
      }
    };

    // Initial check in case it became available between render and effect
    checkJobCards();

    if (!jobCardsReady) {
      const interval = setInterval(checkJobCards, 150);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return undefined;
  }, [jobCardsReady]);

  // Wait for JobCards component to be available
  if (!jobCardsReady || !window.JobCards) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading Service and Maintenance...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Service & Maintenance
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage job cards and service maintenance operations
        </p>
      </div>

      <window.JobCards
        clients={clients}
        users={users}
      />
    </div>
  );
};

// Make available globally
try {
  window.ServiceAndMaintenance = ServiceAndMaintenance;
  window.dispatchEvent(new Event('serviceMaintenanceComponentReady'));
  console.log('✅ ServiceAndMaintenance.jsx loaded and registered');
} catch (error) {
  console.error('❌ ServiceAndMaintenance.jsx: Error:', error);
}

