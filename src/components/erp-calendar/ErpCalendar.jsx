/**
 * Greenfield ERP Calendar + Google Calendar (read/write via OAuth).
 * Does not use legacy dashboard Calendar, calendar-notes, or GoogleCalendarSync.
 */
const { useState, useEffect, useCallback, useMemo } = React;

const TZ = 'Africa/Johannesburg';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(x.setDate(diff));
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function parseGoogleTime(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(s))) {
    const [y, mo, d] = String(s).split('-').map(Number);
    return new Date(y, mo - 1, d, 12, 0, 0);
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

const ErpCalendar = () => {
  let isDark = false;
  try {
    if (window.useTheme && typeof window.useTheme === 'function') {
      isDark = !!window.useTheme().isDark;
    } else {
      isDark = localStorage.getItem('abcotronics_theme') === 'dark';
    }
  } catch {
    isDark = false;
  }

  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [erpEvents, setErpEvents] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSync, setFormSync] = useState(true);
  const [saving, setSaving] = useState(false);

  const token = () => window.storage?.getToken?.();

  const loadConnection = useCallback(async () => {
    try {
      const r = await fetch('/api/erp-calendar/connection', {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json();
      const d = j.data || j;
      setConnected(!!d.connected);
      setGoogleEmail(d.googleEmail || null);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const loadMonth = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const { start, end } = monthRange(y, m);
    const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
    const gqs = `timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;

    try {
      const [rErp, rG] = await Promise.all([
        fetch(`/api/erp-calendar/erp-events?${qs}`, {
          headers: { Authorization: `Bearer ${token()}` }
        }),
        fetch(`/api/erp-calendar/google-events?${gqs}`, {
          headers: { Authorization: `Bearer ${token()}` }
        })
      ]);
      const jErp = await rErp.json();
      const jG = await rG.json();
      if (!rErp.ok) throw new Error(jErp?.data?.message || jErp?.message || 'ERP events failed');
      if (!rG.ok) throw new Error(jG?.data?.message || jG?.message || 'Google events failed');
      const dE = jErp.data || jErp;
      const dG = jG.data || jG;
      setErpEvents(Array.isArray(dE.events) ? dE.events : []);
      setGoogleEvents(Array.isArray(dG.events) ? dG.events : []);
      setConnected(!!dG.connected);
    } catch (e) {
      setErr(e.message || 'Failed to load calendar');
      setErpEvents([]);
      setGoogleEvents([]);
    } finally {
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    const onMsg = (ev) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'ERP_CALENDAR_OAUTH_OK') {
        loadConnection();
        loadMonth();
      }
      if (ev.data?.type === 'ERP_CALENDAR_OAUTH_ERR') {
        setErr(ev.data.message || 'Google connection failed');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadConnection, loadMonth]);

  const connectGoogle = async () => {
    setErr(null);
    try {
      const r = await fetch('/api/erp-calendar/auth-url', {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg =
          j?.error?.message ||
          j?.error?.details ||
          j?.message ||
          (r.status === 503
            ? 'Calendar Google integration is not configured on the server (missing OAuth env vars).'
            : `Request failed (${r.status})`);
        throw new Error(msg);
      }
      const d = j.data || j;
      if (!d.authUrl) throw new Error('No auth URL in response');
      const w = window.open(d.authUrl, 'erp-cal-google', 'width=560,height=720,scrollbars=yes');
      if (!w) setErr('Popup blocked — allow popups for this site.');
    } catch (e) {
      setErr(e.message || 'Could not start Google connection');
    }
  };

  const disconnectGoogle = async () => {
    if (!confirm('Disconnect Google Calendar from the ERP?')) return;
    await fetch('/api/erp-calendar/connection', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` }
    });
    setConnected(false);
    setGoogleEmail(null);
    loadMonth();
  };

  const calendarCells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1);
    const start = startOfWeek(first);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      cells.push(addDays(start, i));
    }
    return cells;
  }, [cursor]);

  const eventsForDay = useCallback(
    (day) => {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
      const erp = erpEvents.filter((e) => {
        const s = new Date(e.startUtc);
        const en = new Date(e.endUtc);
        return s <= dayEnd && en >= dayStart;
      });
      const g = googleEvents.filter((e) => {
        const s = parseGoogleTime(e.start);
        return s && sameDay(s, day);
      });
      return { erp, google: g };
    },
    [erpEvents, googleEvents]
  );

  const selectedBuckets = useMemo(() => eventsForDay(selected), [selected, eventsForDay]);

  const openCreateModal = () => {
    const d = new Date(selected);
    d.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(10, 0, 0, 0);
    const isoLocal = (dt) => {
      const y = dt.getFullYear();
      const m = pad2(dt.getMonth() + 1);
      const day = pad2(dt.getDate());
      const h = pad2(dt.getHours());
      const mi = pad2(dt.getMinutes());
      return `${y}-${m}-${day}T${h}:${mi}`;
    };
    setFormTitle('');
    setFormDesc('');
    setFormStart(isoLocal(d));
    setFormEnd(isoLocal(end));
    setFormSync(connected);
    setModalOpen(true);
  };

  const saveEvent = async () => {
    if (!formTitle.trim()) {
      alert('Title is required');
      return;
    }
    const start = new Date(formStart);
    const end = new Date(formEnd);
    if (!(end > start)) {
      alert('End must be after start');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/erp-calendar/erp-events', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim(),
          start: start.toISOString(),
          end: end.toISOString(),
          timezone: TZ,
          syncToGoogle: connected && formSync
        })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.data?.message || j?.message || 'Save failed');
      setModalOpen(false);
      loadMonth();
    } catch (e) {
      alert(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const deleteErpEvent = async (id) => {
    if (!confirm('Delete this event?')) return;
    const r = await fetch(`/api/erp-calendar/erp-events?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` }
    });
    if (!r.ok) {
      const j = await r.json();
      alert(j?.data?.message || j?.message || 'Delete failed');
      return;
    }
    loadMonth();
  };

  const monthLabel = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const shell = isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`min-h-screen p-4 md:p-8 ${shell}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className={`text-sm ${muted} mt-1`}>
              ERP events with optional sync to your Google Calendar ({TZ}).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <>
                <span className={`text-sm ${muted}`}>
                  <i className="fab fa-google text-green-500 mr-1" />
                  {googleEmail || 'Connected'}
                </span>
                <button
                  type="button"
                  onClick={disconnectGoogle}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
                >
                  Disconnect Google
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={connectGoogle}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                <i className="fab fa-google mr-2" />
                Connect Google Calendar
              </button>
            )}
          </div>
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">{err}</div>
        )}

        <div className={`rounded-xl border shadow-sm p-4 md:p-6 ${card}`}>
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              aria-label="Previous month"
            >
              <i className="fas fa-chevron-left" />
            </button>
            <div className="text-lg font-medium">{monthLabel}</div>
            <button
              type="button"
              className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              aria-label="Next month"
            >
              <i className="fas fa-chevron-right" />
            </button>
          </div>

          {loading ? (
            <div className={`text-center py-16 ${muted}`}>
              <i className="fas fa-spinner fa-spin text-2xl mb-2" />
              <p>Loading…</p>
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wide mb-2 ${muted}`}
              >
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((day, idx) => {
                  const inMonth = day.getMonth() === cursor.getMonth();
                  const { erp, google } = eventsForDay(day);
                  const isSel = sameDay(day, selected);
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setSelected(new Date(day))}
                      className={`min-h-[72px] p-1 rounded-lg text-left text-sm border transition-colors ${
                        !inMonth ? 'opacity-40' : ''
                      } ${
                        isSel
                          ? isDark
                            ? 'border-blue-500 bg-blue-900/40'
                            : 'border-blue-500 bg-blue-50'
                          : isDark
                            ? 'border-gray-700 hover:bg-gray-800/60'
                            : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium">{day.getDate()}</div>
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {erp.length > 0 && (
                          <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" title="ERP events" />
                        )}
                        {google.length > 0 && (
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Google" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className={`rounded-xl border shadow-sm p-4 md:p-6 mt-6 ${card}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">
              {selected.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h2>
            <button
              type="button"
              onClick={openCreateModal}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
            >
              <i className="fas fa-plus mr-1" /> Add ERP event
            </button>
          </div>

          <div className="space-y-3">
            {selectedBuckets.erp.length === 0 && selectedBuckets.google.length === 0 && (
              <p className={muted}>No events this day.</p>
            )}
            {selectedBuckets.erp.map((e) => (
              <div
                key={e.id}
                className={`flex items-start justify-between gap-3 p-3 rounded-lg ${isDark ? 'bg-gray-700/40' : 'bg-indigo-50'}`}
              >
                <div>
                  <div className="font-medium">{e.title}</div>
                  <div className={`text-sm ${muted}`}>
                    {new Date(e.startUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                    {new Date(e.endUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {e.googleHtmlLink && (
                      <a
                        href={e.googleHtmlLink}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-blue-500 hover:underline"
                      >
                        Google
                      </a>
                    )}
                  </div>
                  {e.description ? <p className={`text-sm mt-1 ${muted}`}>{e.description}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => deleteErpEvent(e.id)}
                  className="text-red-500 hover:text-red-400 text-sm"
                >
                  Delete
                </button>
              </div>
            ))}
            {selectedBuckets.google.map((e) => (
              <div
                key={`g-${e.id}`}
                className={`p-3 rounded-lg ${isDark ? 'bg-gray-700/40' : 'bg-green-50'}`}
              >
                <div className="font-medium flex items-center gap-2">
                  <i className="fab fa-google text-green-600" />
                  {e.summary}
                </div>
                <div className={`text-sm ${muted}`}>
                  {e.start ? new Date(e.start).toLocaleString() : ''}
                  {e.htmlLink && (
                    <a href={e.htmlLink} target="_blank" rel="noreferrer" className="ml-2 text-blue-500 hover:underline">
                      Open
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-xl border shadow-xl p-6 ${card}`}>
            <h3 className="text-lg font-semibold mb-4">New event</h3>
            <label className="block text-sm mb-1">Title</label>
            <input
              className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
            />
            <label className="block text-sm mb-1">Start</label>
            <input
              type="datetime-local"
              className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
              value={formStart}
              onChange={(e) => setFormStart(e.target.value)}
            />
            <label className="block text-sm mb-1">End</label>
            <input
              type="datetime-local"
              className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
              value={formEnd}
              onChange={(e) => setFormEnd(e.target.value)}
            />
            <label className="block text-sm mb-1">Description</label>
            <textarea
              className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
              rows={3}
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
            />
            {connected && (
              <label className="flex items-center gap-2 mb-4 text-sm cursor-pointer">
                <input type="checkbox" checked={formSync} onChange={(e) => setFormSync(e.target.checked)} />
                Also create in Google Calendar
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                onClick={() => setModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                onClick={saveEvent}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.ErpCalendar = ErpCalendar;
window.dispatchEvent(new CustomEvent('erpCalendarComponentReady'));

export default ErpCalendar;
