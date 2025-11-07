// Use React from window
const { useState, useEffect } = React;

const ServiceAndMaintenance = () => {
  const { user } = window.useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);

  // Load clients and users for JobCards
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load clients
        if (window.DatabaseAPI && window.DatabaseAPI.getClients) {
          const clientsData = await window.DatabaseAPI.getClients();
          setClients(clientsData || []);
        }

        // Load users
        if (window.DatabaseAPI && window.DatabaseAPI.getUsers) {
          const usersData = await window.DatabaseAPI.getUsers();
          setUsers(usersData || []);
        }
      } catch (error) {
        console.error('Error loading data for Service and Maintenance:', error);
      }
    };

    loadData();
  }, []);

  // Wait for JobCards component to be available
  if (!window.JobCards) {
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
          Service and Maintenance
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
  console.log('✅ ServiceAndMaintenance.jsx loaded and registered');
} catch (error) {
  console.error('❌ ServiceAndMaintenance.jsx: Error:', error);
}

