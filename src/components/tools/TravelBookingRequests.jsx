/**
 * Travel & accommodation booking requests: comprehensive form, nominee selection,
 * queues for requester / assignee. Only allowlisted emails may create requests (server + UI).
 */
const { useState, useEffect, useCallback, useMemo } = React;

const EMPTY_FLIGHT = {
  fromLocation: '',
  toLocation: '',
  departDate: '',
  returnDate: '',
  tripType: 'return',
  timePreference: '',
  cabin: '',
  airlinePreference: '',
  avoidAirlines: '',
  baggageNotes: '',
  frequentFlyerNotes: '',
  flexibilityNotes: ''
};

const EMPTY_STAY = {
  location: '',
  checkIn: '',
  checkOut: '',
  roomType: '',
  board: '',
  budgetNotes: '',
  parking: '',
  specialNeeds: ''
};

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'needs_info', label: 'Needs info' },
  { value: 'booked', label: 'Booked' },
  { value: 'declined', label: 'Declined' },
  { value: 'cancelled', label: 'Cancelled' }
];

function getToken() {
  return window.storage?.getToken?.() || localStorage.getItem('token') || '';
}

function authHeaders() {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function travelBookingCreatorEmails() {
  const custom = typeof window !== 'undefined' && window.__TRAVEL_BOOKING_TOOL_EMAILS__;
  if (custom && String(custom).trim()) {
    return String(custom)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return ['garethm@abcotronics.co.za'];
}

function isTravelBookingCreatorUser() {
  const u = window.storage?.getUser?.() || {};
  const email = (u.email || '').trim().toLowerCase();
  return travelBookingCreatorEmails().includes(email);
}

function parseHighlightRequestId() {
  try {
    const rs = window.RouteState?.getRoute?.();
    if (rs?.search && typeof rs.search.get === 'function') {
      const h = rs.search.get('highlightRequest');
      if (h) return String(h).trim();
    }
    const hash = window.location.hash || '';
    const q = hash.includes('?') ? hash.split('?')[1] : '';
    if (q) {
      const p = new URLSearchParams(q);
      const h = p.get('highlightRequest');
      if (h) return String(h).trim();
    }
  } catch {
    /* ignore */
  }
  return '';
}

function TravelBookingRequests() {
  const { isDark } = window.useTheme?.() || { isDark: false };
  const canCreateTravelBooking = useMemo(() => isTravelBookingCreatorUser(), []);
  const [tab, setTab] = useState(() => (isTravelBookingCreatorUser() ? 'new' : 'assigned'));

  const [users, setUsers] = useState([]);
  const [userFilter, setUserFilter] = useState('');
  const [myRequests, setMyRequests] = useState([]);
  const [assigned, setAssigned] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const [assigneeId, setAssigneeId] = useState('');
  const [tripTitle, setTripTitle] = useState('');
  const [businessReason, setBusinessReason] = useState('');
  const [tripStartDate, setTripStartDate] = useState('');
  const [tripEndDate, setTripEndDate] = useState('');
  const [costCentre, setCostCentre] = useState('');
  const [projectRef, setProjectRef] = useState('');
  const [passengerInput, setPassengerInput] = useState('');
  const [passengers, setPassengers] = useState([]);
  const [generalConstraints, setGeneralConstraints] = useState('');
  const [flights, setFlights] = useState([{ ...EMPTY_FLIGHT }]);
  const [stays, setStays] = useState([{ ...EMPTY_STAY }]);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [patchStatus, setPatchStatus] = useState('');
  const [patchInternal, setPatchInternal] = useState('');
  const [patchMessage, setPatchMessage] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users', { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || json.message || 'Failed to load users');
      const list = json.data?.users || [];
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn('TravelBooking: users', e);
    }
  }, []);

  const loadLists = useCallback(async () => {
    setLoadingList(true);
    setMsg('');
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/travel-booking-requests?scope=my_submissions', { headers: authHeaders() }),
        fetch('/api/travel-booking-requests?scope=assigned_to_me', { headers: authHeaders() })
      ]);
      const j1 = await r1.json().catch(() => ({}));
      const j2 = await r2.json().catch(() => ({}));
      if (!r1.ok) throw new Error(j1.error?.message || j1.message || 'Failed to load my requests');
      if (!r2.ok) throw new Error(j2.error?.message || j2.message || 'Failed to load assigned');
      setMyRequests(j1.data?.requests || []);
      setAssigned(j2.data?.requests || []);
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (tab === 'mine' || tab === 'assigned') void loadLists();
  }, [tab, loadLists]);

  useEffect(() => {
    const id = parseHighlightRequestId();
    if (!id) return;
    void (async () => {
      setDetailLoading(true);
      try {
        const res = await fetch(`/api/travel-booking-requests/${encodeURIComponent(id)}`, {
          headers: authHeaders()
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.data?.request) {
          setDetail(json.data.request);
          setPatchStatus(json.data.request.status || 'submitted');
          setPatchInternal(json.data.request.assigneeInternalNotes || '');
          setPatchMessage(json.data.request.messageToRequester || '');
        }
      } catch {
        /* ignore */
      } finally {
        setDetailLoading(false);
      }
    })();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [users, userFilter]);

  const addPassenger = () => {
    const p = passengerInput.trim();
    if (!p) return;
    setPassengers((prev) => [...prev, p]);
    setPassengerInput('');
  };

  const resetForm = () => {
    setAssigneeId('');
    setTripTitle('');
    setBusinessReason('');
    setTripStartDate('');
    setTripEndDate('');
    setCostCentre('');
    setProjectRef('');
    setPassengers([]);
    setGeneralConstraints('');
    setFlights([{ ...EMPTY_FLIGHT }]);
    setStays([{ ...EMPTY_STAY }]);
  };

  const submitNew = async () => {
    setMsg('');
    if (!assigneeId) {
      setMsg('Select a nominated person.');
      return;
    }
    if (!businessReason.trim()) {
      setMsg('Business reason is required.');
      return;
    }
    if (!tripStartDate || !tripEndDate) {
      setMsg('Trip start and end dates are required.');
      return;
    }

    const flightPayload = flights
      .filter((f) => f.fromLocation.trim() && f.toLocation.trim() && f.departDate.trim())
      .map((f) => ({
        fromLocation: f.fromLocation.trim(),
        toLocation: f.toLocation.trim(),
        departDate: f.departDate.trim(),
        returnDate: (f.returnDate || '').trim(),
        tripType: f.tripType || 'return',
        timePreference: (f.timePreference || '').trim(),
        cabin: (f.cabin || '').trim(),
        airlinePreference: (f.airlinePreference || '').trim(),
        avoidAirlines: (f.avoidAirlines || '').trim(),
        baggageNotes: (f.baggageNotes || '').trim(),
        frequentFlyerNotes: (f.frequentFlyerNotes || '').trim(),
        flexibilityNotes: (f.flexibilityNotes || '').trim()
      }));

    const stayPayload = stays
      .filter((s) => s.location.trim() && s.checkIn.trim() && s.checkOut.trim())
      .map((s) => ({
        location: s.location.trim(),
        checkIn: s.checkIn.trim(),
        checkOut: s.checkOut.trim(),
        roomType: (s.roomType || '').trim(),
        board: (s.board || '').trim(),
        budgetNotes: (s.budgetNotes || '').trim(),
        parking: (s.parking || '').trim(),
        specialNeeds: (s.specialNeeds || '').trim()
      }));

    if (flightPayload.length === 0 && stayPayload.length === 0) {
      setMsg('Add at least one complete flight leg or accommodation stay.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/travel-booking-requests', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          assigneeId,
          tripTitle: tripTitle.trim(),
          businessReason: businessReason.trim(),
          payload: {
            tripStartDate,
            tripEndDate,
            costCentre: costCentre.trim(),
            projectRef: projectRef.trim(),
            passengers,
            generalConstraints: generalConstraints.trim(),
            flights: flightPayload,
            stays: stayPayload
          }
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || json.message || 'Save failed');
      setMsg('Request submitted. The nominee and you have been notified.');
      resetForm();
      void loadLists();
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id) => {
    setDetailLoading(true);
    setMsg('');
    try {
      const res = await fetch(`/api/travel-booking-requests/${encodeURIComponent(id)}`, {
        headers: authHeaders()
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || json.message || 'Load failed');
      setDetail(json.data.request);
      setPatchStatus(json.data.request.status || 'submitted');
      setPatchInternal(json.data.request.assigneeInternalNotes || '');
      setPatchMessage(json.data.request.messageToRequester || '');
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setDetailLoading(false);
    }
  };

  const savePatch = async () => {
    if (!detail?.id) return;
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/travel-booking-requests/${encodeURIComponent(detail.id)}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          status: patchStatus,
          assigneeInternalNotes: patchInternal,
          messageToRequester: patchMessage
        })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message || json.message || 'Update failed');
      setDetail(json.data.request);
      setMsg('Updated. The requester has been notified if status or message changed.');
      void loadLists();
    } catch (e) {
      setMsg(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const meId = window.storage?.getUser?.()?.id;
  const canEditBooking =
    detail && (detail.assigneeId === meId || isTravelBookingCreatorUser());

  const fieldClass = `w-full rounded-lg border px-3 py-2 text-sm ${
    isDark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'
  }`;
  const labelClass = `block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`;

  const renderFlightRow = (f, i) => (
    <div
      key={i}
      className={`space-y-2 p-3 rounded-lg border ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}
    >
      <div className="flex justify-between items-center">
        <span className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          Flight leg {i + 1}
        </span>
        {flights.length > 1 ? (
          <button
            type="button"
            className="text-xs text-red-500 hover:underline"
            onClick={() => setFlights((prev) => prev.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>From (city or airport code)</label>
          <input className={fieldClass} value={f.fromLocation} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, fromLocation: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>To (city or airport code)</label>
          <input className={fieldClass} value={f.toLocation} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, toLocation: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Depart date</label>
          <input type="date" className={fieldClass} value={f.departDate} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, departDate: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Return date (if return leg)</label>
          <input type="date" className={fieldClass} value={f.returnDate} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, returnDate: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Trip type</label>
          <select
            className={fieldClass}
            value={f.tripType}
            onChange={(e) => {
              const v = e.target.value;
              setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, tripType: v } : x)));
            }}
          >
            <option value="one_way">One way</option>
            <option value="return">Return</option>
            <option value="multi_city">Multi-city</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Time preference</label>
          <input
            className={fieldClass}
            placeholder="e.g. morning, after 14:00, flexible"
            value={f.timePreference}
            onChange={(e) => {
              const v = e.target.value;
              setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, timePreference: v } : x)));
            }}
          />
        </div>
        <div>
          <label className={labelClass}>Cabin</label>
          <input className={fieldClass} value={f.cabin} placeholder="Economy / Premium / Business" onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, cabin: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Airline preference</label>
          <input className={fieldClass} value={f.airlinePreference} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, airlinePreference: v } : x)));
          }} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Airlines to avoid</label>
          <input className={fieldClass} value={f.avoidAirlines} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, avoidAirlines: v } : x)));
          }} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Baggage</label>
          <textarea className={fieldClass} rows={2} value={f.baggageNotes} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, baggageNotes: v } : x)));
          }} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Frequent flyer / membership numbers</label>
          <textarea className={fieldClass} rows={2} value={f.frequentFlyerNotes} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, frequentFlyerNotes: v } : x)));
          }} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Date/time flexibility</label>
          <textarea className={fieldClass} rows={2} value={f.flexibilityNotes} onChange={(e) => {
            const v = e.target.value;
            setFlights((prev) => prev.map((x, j) => (j === i ? { ...x, flexibilityNotes: v } : x)));
          }} />
        </div>
      </div>
    </div>
  );

  const renderStayRow = (s, i) => (
    <div
      key={i}
      className={`space-y-2 p-3 rounded-lg border ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}
    >
      <div className="flex justify-between items-center">
        <span className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          Accommodation {i + 1}
        </span>
        {stays.length > 1 ? (
          <button
            type="button"
            className="text-xs text-red-500 hover:underline"
            onClick={() => setStays((prev) => prev.filter((_, j) => j !== i))}
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="sm:col-span-2">
          <label className={labelClass}>City / area / hotel preference</label>
          <input className={fieldClass} value={s.location} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, location: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Check-in</label>
          <input type="date" className={fieldClass} value={s.checkIn} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, checkIn: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Check-out</label>
          <input type="date" className={fieldClass} value={s.checkOut} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, checkOut: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Room type</label>
          <input className={fieldClass} value={s.roomType} placeholder="Single / twin / suite" onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, roomType: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Board / breakfast</label>
          <input className={fieldClass} value={s.board} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, board: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Budget cap / rate notes</label>
          <input className={fieldClass} value={s.budgetNotes} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, budgetNotes: v } : x)));
          }} />
        </div>
        <div>
          <label className={labelClass}>Parking needed</label>
          <input className={fieldClass} value={s.parking} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, parking: v } : x)));
          }} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Special needs / accessibility</label>
          <textarea className={fieldClass} rows={2} value={s.specialNeeds} onChange={(e) => {
            const v = e.target.value;
            setStays((prev) => prev.map((x, j) => (j === i ? { ...x, specialNeeds: v } : x)));
          }} />
        </div>
      </div>
    </div>
  );

  const renderRequestTable = (rows, emptyText) => (
    <div className={`rounded-lg border overflow-x-auto ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
      {loadingList ? (
        <p className={`p-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading…</p>
      ) : rows.length === 0 ? (
        <p className={`p-4 text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{emptyText}</p>
      ) : (
        <table className="w-full text-left text-xs">
          <thead className={isDark ? 'bg-gray-800' : 'bg-gray-100'}>
            <tr>
              <th className="p-2 font-semibold">Trip</th>
              <th className="p-2 font-semibold">Status</th>
              <th className="p-2 font-semibold">Updated</th>
              <th className="p-2 font-semibold"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={isDark ? 'border-t border-gray-700' : 'border-t border-gray-200'}>
                <td className="p-2">{r.tripTitle || '—'}</td>
                <td className="p-2 capitalize">{String(r.status || '').replace(/_/g, ' ')}</td>
                <td className="p-2">{r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '—'}</td>
                <td className="p-2">
                  <button
                    type="button"
                    className="text-sky-600 hover:underline"
                    onClick={() => void openDetail(r.id)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const tabBtn = (id, label) => (
    <button
      type="button"
      key={id}
      onClick={() => setTab(id)}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
        tab === id
          ? 'bg-sky-600 text-white'
          : isDark
            ? 'bg-gray-700 text-gray-200'
            : 'bg-gray-100 text-gray-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`space-y-4 max-w-5xl ${isDark ? 'text-gray-100' : ''}`}>
      <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        Submit detailed flight and accommodation requirements to your nominated booker. They receive email and in-app
        notifications; you are notified when they update status or leave a message.
      </p>

      <div className="flex flex-wrap gap-2">
        {canCreateTravelBooking ? tabBtn('new', 'New request') : null}
        {tabBtn('mine', 'My requests')}
        {tabBtn('assigned', 'Assigned to me')}
      </div>

      {msg ? (
        <p className={`text-sm ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>{msg}</p>
      ) : null}

      {tab === 'new' && canCreateTravelBooking && (
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nominated booker</label>
            <input
              className={`${fieldClass} mb-2`}
              placeholder="Filter by name or email…"
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
            />
            <select
              className={fieldClass}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Select person…</option>
              {filteredUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.name || u.email || u.id) + (u.email ? ` (${u.email})` : '')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Trip title (optional)</label>
            <input className={fieldClass} value={tripTitle} onChange={(e) => setTripTitle(e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>Business reason (required)</label>
            <textarea
              className={fieldClass}
              rows={4}
              value={businessReason}
              onChange={(e) => setBusinessReason(e.target.value)}
              placeholder="Why is this travel needed? Client, site, meeting purpose, approvals, etc."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={labelClass}>Overall trip start</label>
              <input
                type="date"
                className={fieldClass}
                value={tripStartDate}
                onChange={(e) => setTripStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Overall trip end</label>
              <input
                type="date"
                className={fieldClass}
                value={tripEndDate}
                onChange={(e) => setTripEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Cost centre (optional)</label>
              <input className={fieldClass} value={costCentre} onChange={(e) => setCostCentre(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Project / job ref (optional)</label>
              <input className={fieldClass} value={projectRef} onChange={(e) => setProjectRef(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Travellers (names as on ID)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {passengers.map((p, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                    isDark ? 'bg-gray-700' : 'bg-gray-200'
                  }`}
                >
                  {p}
                  <button type="button" className="text-red-500" onClick={() => setPassengers((x) => x.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className={fieldClass}
                value={passengerInput}
                onChange={(e) => setPassengerInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPassenger())}
                placeholder="Add name, Enter"
              />
              <button
                type="button"
                className={`px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}
                onClick={addPassenger}
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>General constraints</label>
            <textarea
              className={fieldClass}
              rows={3}
              value={generalConstraints}
              onChange={(e) => setGeneralConstraints(e.target.value)}
              placeholder="Visa, company policy, preferred suppliers, invoice details, etc."
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Flights</h3>
              <button
                type="button"
                className="text-xs text-sky-600 hover:underline"
                onClick={() => setFlights((p) => [...p, { ...EMPTY_FLIGHT }])}
              >
                + Add leg
              </button>
            </div>
            {flights.map((f, i) => renderFlightRow(f, i))}
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                Accommodation
              </h3>
              <button
                type="button"
                className="text-xs text-sky-600 hover:underline"
                onClick={() => setStays((p) => [...p, { ...EMPTY_STAY }])}
              >
                + Add stay
              </button>
            </div>
            {stays.map((s, i) => renderStayRow(s, i))}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void submitNew()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 text-white disabled:opacity-50"
          >
            {saving ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      )}

      {tab === 'mine' && renderRequestTable(myRequests, 'No requests yet.')}
      {tab === 'assigned' && renderRequestTable(assigned, 'Nothing assigned to you.')}

      {detail || detailLoading ? (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${isDark ? 'bg-black/70' : 'bg-black/40'}`}
          onClick={() => !saving && setDetail(null)}
          role="presentation"
        >
          <div
            className={`max-w-2xl w-full max-h-[90vh] overflow-y-auto rounded-xl border p-4 shadow-xl ${
              isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-200'
            }`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {detailLoading ? (
              <p className="text-sm">Loading…</p>
            ) : detail ? (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-start gap-2">
                  <h3 className="font-semibold text-base">{detail.tripTitle || 'Travel request'}</h3>
                  <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setDetail(null)}>
                    Close
                  </button>
                </div>
                <p className="text-xs text-gray-500">Ref: {detail.id}</p>
                <p>
                  <span className="font-medium">Status:</span>{' '}
                  <span className="capitalize">{String(detail.status || '').replace(/_/g, ' ')}</span>
                </p>
                <p>
                  <span className="font-medium">Requester:</span> {detail.requester?.name || detail.requester?.email}
                </p>
                <p>
                  <span className="font-medium">Booker:</span> {detail.assignee?.name || detail.assignee?.email}
                </p>
                <div>
                  <span className="font-medium">Business reason</span>
                  <p className="whitespace-pre-wrap mt-1 text-xs opacity-90">{detail.businessReason}</p>
                </div>
                {detail.messageToRequester ? (
                  <div>
                    <span className="font-medium">Message to requester</span>
                    <p className="whitespace-pre-wrap mt-1 text-xs opacity-90">{detail.messageToRequester}</p>
                  </div>
                ) : null}
                <div>
                  <span className="font-medium">Trip details (payload)</span>
                  <pre
                    className={`mt-1 text-[11px] p-2 rounded overflow-x-auto ${
                      isDark ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                  >
                    {JSON.stringify(detail.payload || {}, null, 2)}
                  </pre>
                </div>

                {canEditBooking ? (
                  <div className={`space-y-2 pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <p className="text-xs font-semibold text-sky-600">Update (booker / admin)</p>
                    <div>
                      <label className={labelClass}>Status</label>
                      <select
                        className={fieldClass}
                        value={patchStatus}
                        onChange={(e) => setPatchStatus(e.target.value)}
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Internal notes (not shown to requester)</label>
                      <textarea
                        className={fieldClass}
                        rows={3}
                        value={patchInternal}
                        onChange={(e) => setPatchInternal(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Message to requester</label>
                      <textarea
                        className={fieldClass}
                        rows={3}
                        value={patchMessage}
                        onChange={(e) => setPatchMessage(e.target.value)}
                        placeholder="Visible to the requester; triggers notification when saved."
                      />
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void savePatch()}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white disabled:opacity-50"
                    >
                      {saving ? 'Saving…' : 'Save update'}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

window.TravelBookingRequests = TravelBookingRequests;
