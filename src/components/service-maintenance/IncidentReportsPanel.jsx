const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {}
const { useState, useEffect, useMemo, useCallback } = ReactGlobal

const INCIDENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_investigation', label: 'Under investigation' },
  { value: 'closed', label: 'Closed' }
]

const INCIDENT_TYPE_OPTIONS = [
  'Near Miss',
  'Injury / First Aid',
  'Equipment Failure',
  'Fuel Spill / Leak',
  'Fire',
  'Environmental',
  'Security',
  'Property Damage',
  'Observation',
  'Other'
]

const INCIDENT_SEVERITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical']

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(value) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })
}

function statusBadgeClasses(status, isDark) {
  const s = String(status || 'draft').toLowerCase()
  if (s === 'closed') {
    return isDark ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  }
  if (s === 'submitted') {
    return isDark ? 'bg-sky-500/10 text-sky-300 border-sky-400/40' : 'bg-sky-50 text-sky-700 border-sky-200'
  }
  if (s === 'under_investigation') {
    return isDark ? 'bg-amber-500/10 text-amber-300 border-amber-400/40' : 'bg-amber-50 text-amber-700 border-amber-200'
  }
  return isDark ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-gray-100 text-gray-700 border-gray-200'
}

function emptyForm() {
  return {
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    jobCardId: '',
    jobCardNumber: '',
    incidentAt: new Date().toISOString().slice(0, 16),
    incidentType: '',
    severity: '',
    description: '',
    immediateActions: '',
    investigationNotes: '',
    correctiveActions: '',
    witnesses: '',
    equipmentInvolved: '',
    locationDescription: '',
    locationLatitude: '',
    locationLongitude: '',
    peopleInvolved: [{ name: '', role: '', injured: false }],
    status: 'draft'
  }
}

function IncidentReportsPanel({
  clients = [],
  users = [],
  isDark = false,
  onOpenJobCard,
  initialIncidentId = '',
  createPrefill = null,
  onConsumeCreatePrefill
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const token = window.storage?.getToken?.()

  const loadRows = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ pageSize: '200' })
      if (search.trim()) params.set('q', search.trim())
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await fetch(`/api/incident-reports?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      const list = data?.incidentReports || data?.data?.incidentReports || []
      setRows(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('Failed to load incident reports', e)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, search, statusFilter])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    if (!createPrefill) return
    setSelected(null)
    setForm({
      ...emptyForm(),
      ...createPrefill,
      incidentAt: new Date().toISOString().slice(0, 16)
    })
    setShowForm(true)
    if (typeof onConsumeCreatePrefill === 'function') onConsumeCreatePrefill()
  }, [createPrefill, onConsumeCreatePrefill])

  const openIncidentById = useCallback(
    async (id) => {
      if (!token || !id) return
      try {
        const res = await fetch(`/api/incident-reports/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        const row = data?.incidentReport || data?.data?.incidentReport
        if (row) {
          setSelected(row)
          setShowDetail(true)
        }
      } catch (e) {
        console.error('Failed to open incident', e)
      }
    },
    [token]
  )

  useEffect(() => {
    if (initialIncidentId) void openIncidentById(initialIncidentId)
  }, [initialIncidentId, openIncidentById])

  const handleDownloadPdf = useCallback(async () => {
    if (!selected || downloadingPdf) return
    const printWin = window.open('', '_blank')
    if (!printWin) {
      window.alert('Please allow pop-ups to generate the PDF.')
      return
    }
    try {
      setDownloadingPdf(true)
      let incident = { ...selected }
      const pr = await fetch(`/api/incident-reports/${encodeURIComponent(incident.id)}/photos`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (pr.ok) {
        const pd = await pr.json()
        const photos = pd?.photos || pd?.data?.photos
        if (Array.isArray(photos)) incident = { ...incident, photos }
      }

      let companyName = 'Abcotronics'
      let letterhead = {}
      if (window.DatabaseAPI?.getDocumentSettings) {
        try {
          const response = await window.DatabaseAPI.getDocumentSettings()
          const documentSettings = response?.data || {}
          companyName = documentSettings.companyName || companyName
          letterhead =
            documentSettings.jobCardLetterhead ||
            documentSettings.poLetterhead ||
            documentSettings.serviceLetterhead ||
            {}
        } catch (error) {
          console.warn('Could not load document settings for incident PDF', error)
        }
      }

      const buildHtml = window.IncidentReportPrint?.buildIncidentReportPrintHtml
      const partition = window.IncidentReportPrint?.partitionIncidentPhotosForPrint
      const visual = typeof partition === 'function' ? partition(incident.photos || []) : []
      const imageSrcs = visual
        .map((item) => (typeof item === 'string' ? item : item?.url || ''))
        .filter((url) => typeof url === 'string' && url.trim())
        .slice(0, 12)

      const lat = String(incident.locationLatitude || '').trim()
      const lng = String(incident.locationLongitude || '').trim()
      let mapImageSrc = ''
      if (lat && lng) {
        const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
          `${lat},${lng}`
        )}&zoom=15&size=900x360&markers=${encodeURIComponent(`${lat},${lng},red-pushpin`)}`
        try {
          const mr = await fetch(mapUrl)
          if (mr.ok) {
            const blob = await mr.blob()
            mapImageSrc = await new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onloadend = () => resolve(reader.result || '')
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
          }
        } catch {
          // optional map
        }
      }

      const html =
        typeof buildHtml === 'function'
          ? buildHtml(incident, { companyName, letterhead, imageSrcs, mapImageSrc })
          : `<html><body><pre>${escapeHtml(JSON.stringify(incident, null, 2))}</pre></body></html>`

      printWin.document.write(html)
      printWin.document.close()
      printWin.focus()
      await new Promise((resolve) => setTimeout(resolve, 400))
      printWin.print()
      printWin.close()
    } catch (error) {
      printWin.close()
      console.error('Failed to generate incident PDF', error)
      window.alert(error?.message || 'Failed to generate incident PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }, [selected, downloadingPdf, token])

  const saveForm = useCallback(async () => {
    if (!token || saving) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        peopleInvolved: (form.peopleInvolved || []).filter((p) => p.name || p.role)
      }
      const isEdit = Boolean(selected?.id)
      const url = isEdit
        ? `/api/incident-reports/${encodeURIComponent(selected.id)}`
        : '/api/incident-reports'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Save failed')
      const row = data?.incidentReport || data?.data?.incidentReport
      setShowForm(false)
      setForm(emptyForm())
      await loadRows()
      if (row) {
        setSelected(row)
        setShowDetail(true)
      }
    } catch (e) {
      window.alert(e?.message || 'Failed to save incident report')
    } finally {
      setSaving(false)
    }
  }, [token, saving, form, selected, loadRows])

  const filteredRows = useMemo(() => rows, [rows])

  const inputCls = `w-full rounded-lg border px-3 py-2 text-sm ${
    isDark ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`

  return (
    <div className="relative min-h-[calc(100dvh-10rem)] w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search incidents…"
          className={`min-w-[200px] flex-1 rounded-lg border px-3 py-2 text-sm ${
            isDark ? 'border-gray-700 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white'
          }`}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`rounded-lg border px-3 py-2 text-sm ${
            isDark ? 'border-gray-700 bg-gray-900 text-gray-100' : 'border-gray-200 bg-white'
          }`}
        >
          <option value="all">All statuses</option>
          {INCIDENT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSelected(null)
            setForm(emptyForm())
            setShowForm(true)
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          <i className="fa-solid fa-plus" />
          New incident
        </button>
      </div>

      {loading ? (
        <div className={`rounded-xl border px-4 py-10 text-center text-sm ${isDark ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
          Loading incident reports…
        </div>
      ) : filteredRows.length === 0 ? (
        <div className={`rounded-xl border px-4 py-10 text-center text-sm ${isDark ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
          No incident reports found.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => {
                setSelected(row)
                setShowDetail(true)
              }}
              className={`w-full rounded-lg border px-3 py-3 text-left transition hover:border-indigo-300 ${
                isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  {row.incidentNumber || row.id}
                </span>
                <span className={`rounded border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClasses(row.status, isDark)}`}>
                  {String(row.status || 'draft').replace(/_/g, ' ')}
                </span>
                {row.severity ? (
                  <span className={`text-[10px] ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{row.severity}</span>
                ) : null}
              </div>
              <div className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                {[row.incidentType, row.clientName, row.siteName, formatDate(row.incidentAt || row.createdAt)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              {row.description ? (
                <div className={`mt-1 text-xs italic ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                  {String(row.description).slice(0, 120)}
                  {row.description.length > 120 ? '…' : ''}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {showDetail && selected ? (
        <div className={`absolute inset-0 z-40 flex flex-col ${isDark ? 'bg-gray-950/95' : 'bg-white'} backdrop-blur-sm`}>
          <div className={`flex items-center justify-between border-b px-6 py-4 shadow-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'}`}>
            <div>
              <h2 className={`text-base font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                {selected.incidentNumber || 'Incident report'}
              </h2>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {selected.clientName || '—'} · {selected.siteName || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                <i className={`fa-solid ${downloadingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} />
                {downloadingPdf ? 'Preparing PDF…' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm({
                    ...emptyForm(),
                    ...selected,
                    incidentAt: selected.incidentAt
                      ? new Date(selected.incidentAt).toISOString().slice(0, 16)
                      : '',
                    peopleInvolved: Array.isArray(selected.peopleInvolved) && selected.peopleInvolved.length
                      ? selected.peopleInvolved
                      : [{ name: '', role: '', injured: false }]
                  })
                  setShowForm(true)
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDetail(false)
                  setSelected(null)
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`}
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['Type', selected.incidentType],
                ['Severity', selected.severity],
                ['Status', selected.status],
                ['Incident date', formatDate(selected.incidentAt)],
                ['Reported by', selected.reportedByName],
                ['Linked job card', selected.jobCardNumber || '—']
              ].map(([label, value]) => (
                <div key={label} className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                  <div className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{label}</div>
                  <div className={`mt-1 text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value || '—'}</div>
                </div>
              ))}
            </div>
            {selected.jobCardId && typeof onOpenJobCard === 'function' ? (
              <button
                type="button"
                onClick={() => onOpenJobCard({ id: selected.jobCardId, jobCardNumber: selected.jobCardNumber })}
                className="text-xs font-medium text-indigo-600 underline"
              >
                Open linked job card {selected.jobCardNumber || selected.jobCardId}
              </button>
            ) : null}
            {[
              ['Description', selected.description],
              ['Immediate actions', selected.immediateActions],
              ['Investigation notes', selected.investigationNotes],
              ['Corrective actions', selected.correctiveActions],
              ['Equipment involved', selected.equipmentInvolved],
              ['Witnesses', selected.witnesses],
              ['Location', selected.locationDescription]
            ].map(([title, body]) => (
              <section key={title} className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                <p className={`mt-2 whitespace-pre-wrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{body || '—'}</p>
              </section>
            ))}
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className={`absolute inset-0 z-50 flex flex-col ${isDark ? 'bg-gray-950/95' : 'bg-white'}`}>
          <div className={`flex items-center justify-between border-b px-6 py-4 shadow-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                aria-label="Back to incidents"
              >
                <i className="fa-solid fa-arrow-left" />
              </button>
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Incident report
                </div>
                <h2 className={`text-lg font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  {selected?.id ? 'Edit incident' : 'New incident report'}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className={`rounded-lg border px-3 py-2 text-xs font-medium ${isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`}
            >
              Cancel
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <label className="block text-xs font-medium">
              Client
              <select
                className={`${inputCls} mt-1`}
                value={form.clientId}
                onChange={(e) => {
                  const client = clients.find((c) => c.id === e.target.value)
                  setForm((f) => ({
                    ...f,
                    clientId: e.target.value,
                    clientName: client?.name || ''
                  }))
                }}
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium">
                Incident type
                <select className={`${inputCls} mt-1`} value={form.incidentType} onChange={(e) => setForm((f) => ({ ...f, incidentType: e.target.value }))}>
                  <option value="">Select type</option>
                  {INCIDENT_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium">
                Severity
                <select className={`${inputCls} mt-1`} value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
                  <option value="">Select severity</option>
                  {INCIDENT_SEVERITY_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium">
              Incident date & time
              <input type="datetime-local" className={`${inputCls} mt-1`} value={form.incidentAt} onChange={(e) => setForm((f) => ({ ...f, incidentAt: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Site name
              <input className={`${inputCls} mt-1`} value={form.siteName} onChange={(e) => setForm((f) => ({ ...f, siteName: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Description
              <textarea className={`${inputCls} mt-1`} rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Immediate actions
              <textarea className={`${inputCls} mt-1`} rows={3} value={form.immediateActions} onChange={(e) => setForm((f) => ({ ...f, immediateActions: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Status
              <select className={`${inputCls} mt-1`} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {INCIDENT_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={`flex shrink-0 items-center border-t px-6 py-4 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'}`}>
            <button type="button" disabled={saving} onClick={() => void saveForm()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Save incident'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

window.IncidentReportsPanel = IncidentReportsPanel
