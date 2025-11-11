// Use React from window
const { useState, useEffect } = React;

const ServiceAndMaintenance = () => {
  const { user } = window.useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobCardsReady, setJobCardsReady] = useState(!!window.JobCards);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [copyStatus, setCopyStatus] = useState('Copy share link');

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

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/job-card`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus('Link copied!');
      setTimeout(() => setCopyStatus('Copy share link'), 2000);
    } catch (error) {
      console.error('Failed to copy mobile link:', error);
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus('Copy share link'), 2500);
    }
  };

  const handleOpenClassic = () => {
    const mainNav = document.querySelector('[data-navigation-target="service-maintenance"]');
    if (mainNav) {
      mainNav.click();
    } else {
      window.history.pushState({}, '', '/service-maintenance');
    }
  };

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
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Service & Maintenance
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Choose between classic scheduling and the mobile-first capture flow. Both work offline and will sync when connectivity returns.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
              }`}
            />
            {isOnline ? 'Online' : 'Offline mode'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Classic View
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    Job Card Manager
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                    Full dashboard view with scheduling, timelines, history, and advanced filters. Use when you need the high-level overview.
                  </p>
                </div>
                <div className="hidden sm:flex items-center justify-center h-12 w-12 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-200">
                  <i className="fa-regular fa-clipboard-list text-lg" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                  <i className="fa-solid fa-laptop text-[11px]" />
                  Desktop optimised
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                  <i className="fa-solid fa-cloud-arrow-up text-[11px]" />
                  Auto-sync offline data
                </span>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleOpenClassic}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-800 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 transition-all"
                >
                  <i className="fa-solid fa-table-columns text-xs" />
                  Open Classic Manager
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.JobCards?.openNewJobCardModal) {
                      window.JobCards.openNewJobCardModal();
                    } else {
                      window.dispatchEvent(new Event('jobcards:open'));
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 active:bg-primary-200 dark:bg-primary-900/30 dark:hover:bg-primary-900/40 dark:text-primary-200 transition-all"
                >
                  <i className="fa-solid fa-plus text-xs" />
                  New job card
                </button>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-primary-600 via-primary-500 to-blue-500 text-white shadow-lg">
            <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div className="relative p-5 sm:p-6">
              <p className="text-xs uppercase tracking-wide text-white/80">
                Mobile View
              </p>
              <h2 className="text-xl font-semibold mt-1">
                Field Tech Form
              </h2>
              <p className="text-sm text-white/80 mt-2">
                Tap-friendly wizard with photo uploads, smart checklists, customer sign-off, and offline save. Perfect for technicians on site.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/80">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15">
                  <i className="fa-solid fa-mobile-screen text-[11px]" />
                  Optimised for touch
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15">
                  <i className="fa-solid fa-pen-nib text-[11px]" />
                  Signature capture
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15">
                  <i className="fa-solid fa-wifi-slash text-[11px]" />
                  Works offline
                </span>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <a
                  href="/job-card"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-primary-600 bg-white hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-400 focus-visible:ring-offset-primary-600 transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                  Open mobile form
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-all"
                >
                  <i className="fa-regular fa-copy text-xs" />
                  {copyStatus}
                </button>
              </div>
            </div>
          </div>
        </div>
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

