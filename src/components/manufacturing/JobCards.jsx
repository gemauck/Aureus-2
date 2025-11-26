// JobCards module (minimal version)
// This provides a simple, working Job Cards list inside
// the Service & Maintenance section while the full
// manager experience is being iterated on.

const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {};

const { useState, useEffect, useMemo } = ReactGlobal;

const JobCards = ({ clients = [], users = [] }) => {
  if (!useState || !useEffect || !useMemo) {
    return (
      <div className="mt-6 flex items-center justify-center">
        <div className="text-center text-sm text-gray-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto mb-3" />
          <p>Initialising job cards list&hellip;</p>
        </div>
      </div>
    );
  }

  const [jobCards, setJobCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJobCard, setEditingJobCard] = useState(null);
  const [saving, setSaving] = useState(false);

  const reloadJobCards = async () => {
    let cancelled = false;

    try {
      setLoading(true);
      setError(null);

      const token = window.storage?.getToken?.();
      if (!token) {
        setError('You must be logged in to view job cards.');
        return;
      }

      const response = await fetch('/api/jobcards', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('❌ JobCards: Failed to reload job cards', response.status, text);
        throw new Error('Failed to load job cards.');
      }

      const raw = await response.json();
      const data =
        (raw && (raw.jobCards || raw.data?.jobCards || raw.data)) || [];

      if (!cancelled) {
        setJobCards(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      if (!cancelled) {
        console.error('❌ JobCards: Error reloading job cards', e);
        setError(e.message || 'Unable to load job cards.');
        setJobCards([]);
      }
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    let cancelled = false;

    const loadJobCards = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = window.storage?.getToken?.();
        if (!token) {
          setError('You must be logged in to view job cards.');
          return;
        }

        const response = await fetch('/api/jobcards', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const text = await response.text();
          console.error('❌ JobCards: Failed to load job cards', response.status, text);
          throw new Error('Failed to load job cards.');
        }

        const raw = await response.json();

        // Support both flat `{ jobCards: [] }` and wrapped `{ data: { jobCards: [] } }` API shapes
        const data =
          (raw && (raw.jobCards || raw.data?.jobCards || raw.data)) || [];

        if (!cancelled) {
          setJobCards(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('❌ JobCards: Error loading job cards', e);
          setError(e.message || 'Unable to load job cards.');
          setJobCards([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadJobCards();

    return () => {
      cancelled = true;
    };
  }, []);

  const clientOptions = useMemo(() => {
    const base = clients.map((c) => ({
      id: c.id || c._id,
      name: c.name || c.companyName || c.displayName || 'Unnamed client',
    }));
    const extraNames = Array.from(
      new Set(
        jobCards
          .map((jc) => jc.clientName)
          .filter(Boolean)
      )
    ).filter(
      (name) => !base.some((c) => c.name === name)
    );

    return [
      ...base,
      ...extraNames.map((name) => ({ id: name, name })),
    ];
  }, [clients, jobCards]);

  const filteredJobCards = useMemo(() => {
    return jobCards.filter((jc) => {
      if (statusFilter !== 'all' && (jc.status || 'draft') !== statusFilter) {
        return false;
      }
      if (clientFilter) {
        return (
          jc.clientId === clientFilter ||
          jc.clientName === clientFilter
        );
      }
      return true;
    });
  }, [jobCards, statusFilter, clientFilter]);

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  const handleRowClick = (jobCard) => {
    setEditingJobCard(jobCard);
    setIsModalOpen(true);
  };

  const handleNewJobCard = () => {
    setEditingJobCard(null);
    setIsModalOpen(true);
  };

  const handleSaveJobCard = async (formData) => {
    if (!window.DatabaseAPI) {
      console.error('❌ DatabaseAPI is not available on window');
      return;
    }

    try {
      setSaving(true);

      if (editingJobCard && editingJobCard.id) {
        await window.DatabaseAPI.updateJobCard(editingJobCard.id, formData);
      } else {
        await window.DatabaseAPI.createJobCard(formData);
      }

      setIsModalOpen(false);
      setEditingJobCard(null);

      // Refresh list after save
      await reloadJobCards();
    } catch (e) {
      console.error('❌ Failed to save job card from classic manager:', e);
      alert(e.message || 'Failed to save job card. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Expose a simple global API so the Service & Maintenance page can open the modal
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.JobCards = {
          openNewJobCardModal: handleNewJobCard,
        };
      }
    } catch (error) {
      console.error('❌ JobCards.jsx: Error registering global API:', error);
    }
  }, []);

  return (
    <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Job Cards
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Recent job cards captured from the field and classic workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            className="rounded-lg border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            className="rounded-lg border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id || c.name} value={c.id || c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="text-center text-sm text-gray-500">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto mb-3" />
            <p>Loading job cards&hellip;</p>
          </div>
        </div>
      ) : error ? (
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        </div>
      ) : filteredJobCards.length === 0 ? (
        <div className="px-4 py-6 sm:px-6 sm:py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No job cards found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Job Card
                </th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Client
                </th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Technician
                </th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Status
                </th>
                <th className="px-4 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
              {filteredJobCards.map((jc) => {
                const technicianName =
                  jc.agentName ||
                  users.find((u) => u.id === jc.ownerId)?.name ||
                  '';

                const status =
                  (jc.status || 'draft').toString().toLowerCase();

                const statusClasses =
                  status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : status === 'open'
                    ? 'bg-sky-50 text-sky-700 border-sky-200'
                    : status === 'cancelled'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200';

                return (
                  <tr
                    key={jc.id}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80"
                    onClick={() => handleRowClick(jc)}
                  >
                    <td className="px-4 py-2 whitespace-nowrap text-slate-800 dark:text-slate-100">
                      <div className="font-semibold">
                        {jc.jobCardNumber || '–'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {jc.reasonForVisit || jc.diagnosis || 'No summary'}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                      {jc.clientName || '–'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-700 dark:text-slate-200">
                      {technicianName || '–'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClasses}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-slate-600 dark:text-slate-300">
                      <div className="text-[11px]">
                        {formatDate(jc.createdAt)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Classic manager modal for creating / editing job cards */}
      {window.JobCardModal ? (
        <window.JobCardModal
          isOpen={isModalOpen}
          onClose={() => {
            if (!saving) {
              setIsModalOpen(false);
              setEditingJobCard(null);
            }
          }}
          jobCard={editingJobCard}
          onSave={handleSaveJobCard}
          clients={clients}
        />
      ) : null}
    </div>
  );
};

try {
  if (typeof window !== 'undefined') {
    window.JobCards = JobCards;
    window.dispatchEvent(new Event('jobcardsComponentReady'));
    console.log('✅ JobCards.jsx loaded and registered');
  }
} catch (error) {
  console.error('❌ JobCards.jsx: Error registering global component:', error);
}

export default JobCards;



