// JobCards module (minimal version)
// This provides a simple, working Job Cards list inside
// the Service & Maintenance section while the full
// manager experience is being iterated on.

const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {};

const { useState, useEffect, useMemo } = ReactGlobal;

const JobCards = ({ clients = [], users = [], onOpenDetail }) => {
  const isDark = (typeof window !== 'undefined' && window.useTheme) ? (window.useTheme().isDark) : false;
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [sortField, setSortField] = useState('createdAt'); // jobCardNumber | client | technician | status | createdAt
  const [sortDirection, setSortDirection] = useState('desc'); // asc | desc
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJobCard, setEditingJobCard] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  const pageSize = 25;

  const reloadJobCards = async (targetPage) => {
    const pageToLoad = targetPage || page || 1;

    try {
      setLoading(true);
      setError(null);

      const token = window.storage?.getToken?.();
      if (!token) {
        setError('You must be logged in to view job cards.');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `/api/jobcards?page=${pageToLoad}&pageSize=${pageSize}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        const text = await response.text();
        console.error('❌ JobCards: Failed to reload job cards', response.status, text);
        
        // Try to parse error message from response
        let errorMessage = 'Failed to load job cards.';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status-based messages
          if (response.status === 401) {
            errorMessage = 'Authentication required. Please log in again.';
          } else if (response.status === 403) {
            errorMessage = 'You do not have permission to view job cards.';
          } else if (response.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          } else if (response.status >= 400) {
            errorMessage = `Failed to load job cards (${response.status}). Please try again.`;
          }
        }
        
        throw new Error(errorMessage);
      }
      
      const raw = await response.json();
      const data =
        (raw && (raw.jobCards || raw.data?.jobCards || raw.data)) || [];
      
      setJobCards(Array.isArray(data) ? data : []);
      setPagination(raw.pagination || null);
    } catch (e) {
      console.error('❌ JobCards: Error reloading job cards', e);
      
      // Provide more helpful error messages
      let errorMessage = e.message || 'Unable to load job cards.';
      
      // Handle network errors
      if (e.name === 'TypeError' && e.message.includes('fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      } else if (e.message.includes('JSON')) {
        errorMessage = 'Invalid response from server. Please try again.';
      }
      
      setError(errorMessage);
      setJobCards([]);
    } finally {
      setLoading(false);
    }
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

        const response = await fetch(
          `/api/jobcards?page=${page}&pageSize=${pageSize}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      if (!response.ok) {
        const text = await response.text();
        console.error('❌ JobCards: Failed to reload job cards', response.status, text);
        
        // Try to parse error message from response
        let errorMessage = 'Failed to load job cards.';
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use status-based messages
          if (response.status === 401) {
            errorMessage = 'Authentication required. Please log in again.';
          } else if (response.status === 403) {
            errorMessage = 'You do not have permission to view job cards.';
          } else if (response.status === 500) {
            errorMessage = 'Server error. Please try again later.';
          } else if (response.status >= 400) {
            errorMessage = `Failed to load job cards (${response.status}). Please try again.`;
          }
        }
        
        throw new Error(errorMessage);
      }

        const raw = await response.json();

        // Support both flat `{ jobCards: [] }` and wrapped `{ data: { jobCards: [] } }` API shapes
        const data =
          (raw && (raw.jobCards || raw.data?.jobCards || raw.data)) || [];

        if (!cancelled) {
          setJobCards(Array.isArray(data) ? data : []);
          setPagination(raw.pagination || null);
        }
      } catch (e) {
        if (!cancelled) {
          console.error('❌ JobCards: Error loading job cards', e);
          
          // Provide more helpful error messages
          let errorMessage = e.message || 'Unable to load job cards.';
          
          // Handle network errors
          if (e.name === 'TypeError' && e.message.includes('fetch')) {
            errorMessage = 'Network error. Please check your connection and try again.';
          } else if (e.message.includes('JSON')) {
            errorMessage = 'Invalid response from server. Please try again.';
          }
          
          setError(errorMessage);
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
  }, [page]);

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

  const filteredJobCards = useMemo(
    () =>
      jobCards.filter((jc) => {
        if (statusFilter !== 'all' && (jc.status || 'draft') !== statusFilter) {
          return false;
        }
        if (clientFilter) {
          return jc.clientId === clientFilter || jc.clientName === clientFilter;
        }
        return true;
      }),
    [jobCards, statusFilter, clientFilter]
  );

  const sortedJobCards = useMemo(() => {
    const data = [...filteredJobCards];

    data.sort((a, b) => {
      let aVal;
      let bVal;

      switch (sortField) {
        case 'jobCardNumber':
          aVal = a.jobCardNumber || '';
          bVal = b.jobCardNumber || '';
          break;
        case 'client':
          aVal = a.clientName || '';
          bVal = b.clientName || '';
          break;
        case 'technician': {
          const aTech = a.agentName || (users.find((u) => u.id === a.ownerId) || {}).name || '';
          const bTech = b.agentName || (users.find((u) => u.id === b.ownerId) || {}).name || '';
          aVal = aTech;
          bVal = bTech;
          break;
        }
        case 'status':
          aVal = (a.status || 'draft').toString();
          bVal = (b.status || 'draft').toString();
          break;
        case 'createdAt':
        default:
          aVal = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bVal = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
      }

      let cmp = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        cmp = aVal.localeCompare(bVal);
      } else {
        const aNum = Number(aVal) || 0;
        const bNum = Number(bVal) || 0;
        if (aNum < bNum) cmp = -1;
        if (aNum > bNum) cmp = 1;
      }

      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return data;
  }, [filteredJobCards, sortField, sortDirection, users]);

  const handleSort = (field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevField;
      }
      // default to descending for createdAt, ascending for others
      setSortDirection(field === 'createdAt' ? 'desc' : 'asc');
      return field;
    });
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) {
      return (
        <i
          className="fa-solid fa-up-down text-[10px] text-slate-400"
          aria-hidden="true"
        />
      );
    }
    return sortDirection === 'asc' ? (
      <i className="fa-solid fa-arrow-up-short-wide text-[10px]" aria-hidden="true" />
    ) : (
      <i className="fa-solid fa-arrow-down-wide-short text-[10px]" aria-hidden="true" />
    );
  };

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  const handleRowClick = (jobCard) => {
    if (typeof onOpenDetail === 'function') {
      onOpenDetail(jobCard);
      return;
    }
    setSelectedJobCard(jobCard);
    setShowDetail(true);
  };

  const handleNewJobCard = () => {
    setEditingJobCard(null);
    setIsModalOpen(true);
  };

  const handleNextPage = () => {
    if (pagination && page < (pagination.totalPages || 1)) {
      setPage((prev) =>
        Math.min(prev + 1, pagination.totalPages || prev + 1)
      );
    }
  };

  const handlePrevPage = () => {
    if (page > 1) {
      setPage((prev) => Math.max(prev - 1, 1));
    }
  };

  const handleSaveJobCard = async (formData) => {
    if (!window.DatabaseAPI) {
      console.error('❌ DatabaseAPI is not available on window');
      return;
    }

    // Prevent duplicate submissions
    if (saving) {
      console.warn('⚠️ Job card save already in progress, ignoring duplicate submission');
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
      
      // Provide user-friendly error messages based on error type
      let errorMessage = 'Failed to save job card. Please try again.';
      const errorMsg = e.message || String(e);
      
      // Check for specific error types
      if (errorMsg.includes('502') || errorMsg.includes('Bad Gateway')) {
        errorMessage = 'The server is temporarily unavailable (Bad Gateway). The system will automatically retry. Please wait a moment and try again if the issue persists.';
      } else if (errorMsg.includes('503') || errorMsg.includes('Service Unavailable')) {
        errorMessage = 'The service is temporarily unavailable. Please try again in a few moments.';
      } else if (errorMsg.includes('504') || errorMsg.includes('Gateway Timeout')) {
        errorMessage = 'The request timed out. Please try again.';
      } else if (errorMsg.includes('500') || errorMsg.includes('Server error')) {
        errorMessage = 'A server error occurred. Please try again. If the problem persists, contact support.';
      } else if (errorMsg.includes('Network error') || errorMsg.includes('Failed to fetch')) {
        errorMessage = 'Network connection error. Please check your internet connection and try again.';
      } else if (errorMsg.includes('Database connection failed')) {
        errorMessage = 'Database connection failed. The system is temporarily unavailable. Please try again in a few moments.';
      } else if (errorMsg) {
        errorMessage = errorMsg;
      }
      
      alert(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  // Safely parse GPS coordinates from a job card record
  const getJobCardCoordinates = (jobCard) => {
    if (!jobCard) return null;

    const parseCoordinate = (value) => {
      if (value == null) return null;

      // If it's already a finite number, use it as-is
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }

      // If it's a non-empty string, try to parse it
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
      }

      return null;
    };

    const lat = parseCoordinate(jobCard.locationLatitude);
    const lng = parseCoordinate(jobCard.locationLongitude);

    if (lat == null || lng == null) {
      return null;
    }

    return { lat, lng };
  };

  // Expose a simple global API so the Service & Maintenance page can open the modal
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        // Ensure JobCards remains a valid React component type for rendering
        window.JobCards = JobCards;
        // Attach helper method for "New job card" buttons
        window.JobCards.openNewJobCardModal = handleNewJobCard;
        window.JobCards.openEditJobCardModal = (jobCard) => {
          setEditingJobCard(jobCard);
          setIsModalOpen(true);
        };
      }
    } catch (error) {
      console.error('❌ JobCards.jsx: Error registering global API:', error);
    }
  }, [handleNewJobCard]);

  return (
    <div className={`relative mt-6 rounded-2xl shadow-sm overflow-hidden border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className={`px-4 py-4 sm:px-6 sm:py-5 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
        <div>
          <h2 className={`text-base font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Job Cards
          </h2>
          <p className={`mt-1 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Recent job cards captured from the field and classic workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <select
            className={`rounded-lg px-2 py-1 text-xs shadow-sm focus:border-primary-500 focus:ring-primary-500 ${isDark ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
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
            className={`rounded-lg px-2 py-1 text-xs shadow-sm focus:border-primary-500 focus:ring-primary-500 ${isDark ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
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
          <div className={`rounded-md border px-3 py-2 text-xs ${isDark ? 'border-amber-600 bg-amber-900/20 text-amber-200' : 'border-amber-300 bg-amber-50 text-amber-800'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <div className="font-semibold mb-1">Failed to load job cards</div>
                <div>{error}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  reloadJobCards();
                }}
                disabled={loading}
                className={`inline-flex items-center gap-1 rounded-full border border-amber-400 px-3 py-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isDark ? 'bg-slate-800 text-amber-200 hover:bg-slate-700' : 'bg-white text-amber-700 hover:bg-amber-100'}`}
              >
                <i className="fa-solid fa-arrow-rotate-right text-[10px]" />
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : filteredJobCards.length === 0 ? (
        <div className={`px-4 py-6 sm:px-6 sm:py-8 text-center text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          No job cards found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`min-w-full divide-y text-xs ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
            <thead className={`text-xs ${isDark ? 'bg-slate-800/60 text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
              <tr>
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-primary-500"
                    onClick={() => handleSort('jobCardNumber')}
                  >
                    <span>Job Card</span>
                    {renderSortIcon('jobCardNumber')}
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-primary-500"
                    onClick={() => handleSort('client')}
                  >
                    <span>Client</span>
                    {renderSortIcon('client')}
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-primary-500"
                    onClick={() => handleSort('technician')}
                  >
                    <span>Technician</span>
                    {renderSortIcon('technician')}
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-primary-500"
                    onClick={() => handleSort('status')}
                  >
                    <span>Status</span>
                    {renderSortIcon('status')}
                  </button>
                </th>
                <th className="px-4 py-2 text-left">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-semibold hover:text-primary-500"
                    onClick={() => handleSort('createdAt')}
                  >
                    <span>Created</span>
                    {renderSortIcon('createdAt')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800 bg-slate-900' : 'divide-slate-100 bg-white'}`}>
              {sortedJobCards.map((jc) => {
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
                    className={`cursor-pointer ${isDark ? 'hover:bg-slate-800/80' : 'hover:bg-slate-50'}`}
                    onClick={() => handleRowClick(jc)}
                  >
                    <td className={`px-4 py-2 whitespace-nowrap ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>
                      <div className="font-semibold">
                        {jc.jobCardNumber || '–'}
                      </div>
                      <div className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {jc.reasonForVisit || jc.diagnosis || 'No summary'}
                      </div>
                    </td>
                    <td className={`px-4 py-2 whitespace-nowrap ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {jc.clientName || '–'}
                    </td>
                    <td className={`px-4 py-2 whitespace-nowrap ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
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
                    <td className={`px-4 py-2 whitespace-nowrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      <div className="text-[11px]">
                        {formatDate(jc.createdAt)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pagination && (
            <div className={`flex items-center justify-between px-4 py-3 border-t text-[11px] ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
              <div>
                <span>
                  Page {page} of {pagination.totalPages || 1}
                </span>
                {typeof pagination.totalItems === 'number' && (
                  <span className="ml-2">
                    • {pagination.totalItems} total job card
                    {pagination.totalItems === 1 ? '' : 's'}
                  </span>
                )}
              </div>
              <div className="inline-flex gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={loading || page <= 1}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                    page <= 1 || loading
                      ? isDark ? 'border-slate-700 text-slate-600 cursor-not-allowed' : 'border-slate-200 text-slate-300 cursor-not-allowed'
                      : isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <i className="fa-solid fa-chevron-left text-[9px]" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={
                    loading ||
                    !pagination ||
                    page >= (pagination.totalPages || 1)
                  }
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 ${
                    loading ||
                    !pagination ||
                    page >= (pagination.totalPages || 1)
                      ? isDark ? 'border-slate-700 text-slate-600 cursor-not-allowed' : 'border-slate-200 text-slate-300 cursor-not-allowed'
                      : isDark ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>Next</span>
                  <i className="fa-solid fa-chevron-right text-[9px]" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Immersive job card viewer overlayed on this card block (within content area, not whole app shell) */}
      {showDetail && selectedJobCard && (
        <div className="absolute inset-0 z-40 flex flex-col bg-slate-950/80 backdrop-blur-sm">
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDetail(false);
                  setSelectedJobCard(null);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-800/70 text-slate-100 hover:bg-slate-700"
                aria-label="Back to job cards"
              >
                <i className="fa-solid fa-arrow-left" />
              </button>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Job Card
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">
                    {selectedJobCard.jobCardNumber || 'New job card'}
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      (selectedJobCard.status || 'draft').toString().toLowerCase() === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/40'
                        : (selectedJobCard.status || 'draft').toString().toLowerCase() === 'open'
                        ? 'bg-sky-500/10 text-sky-300 border-sky-400/40'
                        : (selectedJobCard.status || 'draft').toString().toLowerCase() === 'cancelled'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-400/40'
                        : 'bg-slate-700/60 text-slate-100 border-slate-600'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {(selectedJobCard.status || 'draft').toString().toUpperCase()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  {selectedJobCard.clientName || 'Unknown client'} •{' '}
                  {selectedJobCard.agentName || 'Unknown technician'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingJobCard(selectedJobCard);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-primary-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-primary-600"
            >
              <i className="fa-solid fa-pen" />
              Edit job card
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="grid gap-6 xl:grid-cols-3">
              {/* Left / main column */}
              <div className="xl:col-span-2 space-y-6">
                {/* Key info */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                  <div className="grid gap-4 md:grid-cols-3 text-sm text-slate-100">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-400">
                        Client
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.clientName || '–'}
                        {selectedJobCard.siteName && (
                          <span className="ml-1 text-slate-400">
                            • {selectedJobCard.siteName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-400">
                        Technician
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.agentName || 'Unknown technician'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-400">
                        Created
                      </div>
                      <div className="mt-1">{formatDate(selectedJobCard.createdAt)}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-3 text-xs text-slate-300">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Location
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.location || selectedJobCard.siteName || 'Not recorded'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Departure
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.timeOfDeparture
                          ? formatDate(selectedJobCard.timeOfDeparture)
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Arrival
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.timeOfArrival
                          ? formatDate(selectedJobCard.timeOfArrival)
                          : '—'}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Narrative */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                  <header className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-300">
                      <i className="fa-solid fa-clipboard-list text-sm" />
                    </span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Visit summary
                      </div>
                      <div className="text-sm text-slate-100">
                        {selectedJobCard.reasonForVisit || 'No visit reason captured.'}
                      </div>
                    </div>
                  </header>

                  <div className="grid gap-4 md:grid-cols-2 text-sm text-slate-100">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Diagnosis
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.diagnosis || 'No diagnosis captured.'}
                      </p>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Actions taken
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.actionsTaken || 'No actions recorded.'}
                      </p>
                    </div>
                  </div>

                  {selectedJobCard.otherComments ? (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
                        Customer feedback &amp; notes
                      </div>
                      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
                        {selectedJobCard.otherComments}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* Travel & vehicle */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                  <header className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-300">
                      <i className="fa-solid fa-car-side text-sm" />
                    </span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Travel &amp; usage
                      </div>
                      <div className="text-sm text-slate-100">
                        {typeof selectedJobCard.travelKilometers === 'number'
                          ? `${selectedJobCard.travelKilometers.toFixed(1)} km travelled`
                          : 'Travel distance not recorded'}
                      </div>
                    </div>
                  </header>

                  <div className="grid gap-4 sm:grid-cols-3 text-sm text-slate-100">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Vehicle
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.vehicleUsed || 'Not specified'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        KM before
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.kmReadingBefore ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        KM after
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.kmReadingAfter ?? '—'}
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right column: map + photos */}
              <div className="space-y-6">
                {/* Map */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky-500/10 text-sky-300">
                        <i className="fa-solid fa-location-dot text-sm" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Job location
                        </div>
                        <div className="text-sm text-slate-100">
                          {selectedJobCard.location ||
                            selectedJobCard.siteName ||
                            selectedJobCard.clientName ||
                            'Not specified'}
                        </div>
                      </div>
                    </div>
                  </header>
                  <div className="mt-3 h-64 rounded-xl overflow-hidden border border-slate-800">
                    {getJobCardCoordinates(selectedJobCard) ? (
                      (() => {
                        const coords = getJobCardCoordinates(selectedJobCard);
                        const latFixed = coords.lat.toFixed(6);
                        const lngFixed = coords.lng.toFixed(6);
                        const zoom = 15;

                        // Build a small bounding box around the point so the embedded map
                        // shows the marker nicely centred.
                        const delta = 0.01;
                        const minLat = coords.lat - delta;
                        const maxLat = coords.lat + delta;
                        const minLng = coords.lng - delta;
                        const maxLng = coords.lng + delta;

                        const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
                          `${minLng},${minLat},${maxLng},${maxLat}`
                        )}&layer=mapnik&marker=${encodeURIComponent(
                          `${coords.lat},${coords.lng}`
                        )}&zoom=${zoom}`;

                        const openStreetMapUrl = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
                          coords.lat
                        )}&mlon=${encodeURIComponent(
                          coords.lng
                        )}&zoom=${zoom}`;

                        return (
                          <a
                            href={openStreetMapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group block h-full w-full"
                          >
                            <div className="relative h-full w-full bg-slate-900">
                              <iframe
                                title="Job location preview"
                                src={embedUrl}
                                className="h-full w-full border-0"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                              />
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 to-transparent px-4 py-3">
                                <div className="flex items-center justify-between gap-3 text-xs text-slate-100">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                                      <i className="fa-solid fa-location-dot text-sm" />
                                    </span>
                                    <div>
                                      <p className="font-semibold">
                                        Open this location in OpenStreetMap
                                      </p>
                                      <p className="text-[11px] text-slate-300">
                                        {latFixed}, {lngFixed}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-200 group-hover:bg-slate-700">
                                    <span>View full map</span>
                                    <i className="fa-solid fa-arrow-up-right-from-square" />
                                  </span>
                                </div>
                              </div>
                            </div>
                          </a>
                        );
                      })()
                    ) : (
                      <div className="flex h-full items-center justify-center bg-slate-950/60">
                        <div className="text-center">
                          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 mb-2">
                            <i className="fa-regular fa-map text-slate-400" />
                          </div>
                          <p className="text-sm font-medium text-slate-100">
                            No GPS data recorded
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Ask the technician to enable location services for future visits.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Photos */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-500/10 text-pink-300">
                        <i className="fa-regular fa-image text-sm" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Photos
                        </div>
                        <div className="text-sm text-slate-100">
                          {Array.isArray(selectedJobCard.photos)
                            ? selectedJobCard.photos.length
                            : 0}{' '}
                          photo
                          {Array.isArray(selectedJobCard.photos) &&
                          selectedJobCard.photos.length === 1
                            ? ''
                            : 's'}
                        </div>
                      </div>
                    </div>
                  </header>
                  {Array.isArray(selectedJobCard.photos) && selectedJobCard.photos.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedJobCard.photos.map((photo, idx) => (
                        <figure
                          key={idx}
                          className="group relative overflow-hidden rounded-xl bg-slate-800"
                        >
                          <img
                            src={typeof photo === 'string' ? photo : photo.url}
                            alt={`Job card photo ${idx + 1}`}
                            className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 px-4 py-8 text-center">
                      <i className="fa-regular fa-image text-slate-500 text-xl mb-2" />
                      <p className="text-sm text-slate-300">
                        No photos have been attached to this job card.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Encourage technicians to capture photos for better traceability.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <i className="fa-regular fa-clock" />
                <span>
                  Last updated{' '}
                  {formatDate(selectedJobCard.updatedAt || selectedJobCard.createdAt)}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
                onClick={() => {
                  setShowDetail(false);
                  setSelectedJobCard(null);
                }}
              >
                <i className="fa-solid fa-xmark" />
                Close
              </button>
            </div>
          </div>
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
  }
} catch (error) {
  console.error('❌ JobCards.jsx: Error registering global component:', error);
}

export default JobCards;



