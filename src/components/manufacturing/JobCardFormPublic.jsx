// Public Job Card form for technicians (no authentication required)
// This component is loaded via the core bundle and exposed on window
// so that /job-card and /jobcard routes can render it directly.

const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {};

const { useState, useEffect } = ReactGlobal;

const JobCardFormPublic = () => {
  // Safety guard: if hooks are not available yet, show a basic fallback
  if (!useState || !useEffect) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-600">
          Initialising job card form&hellip; please wait.
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);

  const [form, setForm] = useState({
    clientId: '',
    technicianId: '',
    locationId: '',
    scheduledDate: '',
    description: '',
    notes: '',
  });

  const handleChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  // Load public data for dropdowns
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const [clientsRes, usersRes, locationsRes] = await Promise.allSettled([
          fetch('/api/public/clients'),
          fetch('/api/public/users'),
          fetch('/api/public/locations'),
        ]);

        if (!cancelled && clientsRes.status === 'fulfilled') {
          const data = await clientsRes.value.json();
          const list = data?.clients || data?.data || data || [];
          setClients(Array.isArray(list) ? list : []);
        }

        if (!cancelled && usersRes.status === 'fulfilled') {
          const data = await usersRes.value.json();
          const list = data?.users || data?.data || data || [];
          setUsers(Array.isArray(list) ? list : []);
        }

        if (!cancelled && locationsRes.status === 'fulfilled') {
          const data = await locationsRes.value.json();
          const list = data?.locations || data?.data || data || [];
          setLocations(Array.isArray(list) ? list : []);
        }
      } catch (e) {
        if (!cancelled) {
          // Log for diagnostics but show a generic message to the user
          console.error('❌ JobCardFormPublic: Failed to load reference data', e);
          setError('Unable to load reference data. You can still submit a basic job card.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        clientId: form.clientId || null,
        technicianId: form.technicianId || null,
        locationId: form.locationId || null,
        scheduledDate: form.scheduledDate || null,
        description: form.description || '',
        notes: form.notes || '',
        source: 'public-mobile',
      };

      const response = await fetch('/api/public/jobcards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('❌ JobCardFormPublic: Submission failed', response.status, text);
        throw new Error('Submission failed. Please try again.');
      }

      setSuccess(true);
      setForm({
        clientId: '',
        technicianId: '',
        locationId: '',
        scheduledDate: '',
        description: '',
        notes: '',
      });
    } catch (e) {
      console.error('❌ JobCardFormPublic: Error submitting job card', e);
      setError(e.message || 'Something went wrong while submitting the job card.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md border border-gray-200 p-5">
        <div className="mb-4 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Field Job Card</h1>
          <p className="mt-1 text-sm text-gray-500">
            Capture basic job details on site. No login required.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-6">
            <div className="text-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
              <p>Loading reference data&hellip;</p>
            </div>
          </div>
        )}

        {!loading && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Job card submitted successfully. You can submit another one below.
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Client (optional)
              </label>
              <select
                className="block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={form.clientId}
                onChange={handleChange('clientId')}
              >
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id || client._id} value={client.id || client._id}>
                    {client.name || client.companyName || client.displayName || 'Unnamed client'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Technician (optional)
              </label>
              <select
                className="block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={form.technicianId}
                onChange={handleChange('technicianId')}
              >
                <option value="">Select technician</option>
                {users.map((user) => (
                  <option key={user.id || user._id} value={user.id || user._id}>
                    {user.name || user.fullName || user.email || 'Unnamed user'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Site / Location (optional)
              </label>
              <select
                className="block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={form.locationId}
                onChange={handleChange('locationId')}
              >
                <option value="">Select location</option>
                {locations.map((loc) => (
                  <option key={loc.id || loc._id || loc.code} value={loc.id || loc._id || loc.code}>
                    {loc.name || loc.description || loc.code || 'Location'}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Scheduled date
              </label>
              <input
                type="date"
                className="block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                value={form.scheduledDate}
                onChange={handleChange('scheduledDate')}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Job description
              </label>
              <textarea
                className="block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows="3"
                placeholder="Briefly describe the work to be done or completed&hellip;"
                value={form.description}
                onChange={handleChange('description')}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-700">
                Notes (optional)
              </label>
              <textarea
                className="block w-full rounded-lg border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                rows="3"
                placeholder="Additional notes, meter readings, serial numbers, etc."
                value={form.notes}
                onChange={handleChange('notes')}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Submitting&hellip;
                </>
              ) : (
                <>
                  <i className="fa-solid fa-paper-plane text-xs" />
                  Submit job card
                </>
              )}
            </button>

            <p className="mt-2 text-[11px] leading-snug text-gray-400 text-center">
              Submissions are logged against your Abcotronics workspace and can be
              reviewed from the Service &amp; Maintenance module.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

// Expose component on window so App.jsx can render it for public routes
try {
  if (typeof window !== 'undefined') {
    window.JobCardFormPublic = JobCardFormPublic;
    window.dispatchEvent(new Event('jobCardFormPublicReady'));
    console.log('✅ JobCardFormPublic.jsx loaded and registered');
  }
} catch (error) {
  console.error('❌ JobCardFormPublic.jsx: Error registering global component:', error);
}

export default JobCardFormPublic;
