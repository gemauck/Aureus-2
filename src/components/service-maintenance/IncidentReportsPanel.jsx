const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {}
const { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } = ReactGlobal

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

function prefillIncidentAtLocal(value) {
  if (!value) return new Date().toISOString().slice(0, 16)
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 16)
  }
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 16)
  return dt.toISOString().slice(0, 16)
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

function currentUserName() {
  const user = typeof window !== 'undefined' ? window.storage?.getUser?.() : null
  return String(user?.name || user?.email || '').trim()
}

function normalizeLinkedJobCards(source) {
  if (!source || typeof source !== 'object') return []
  if (Array.isArray(source.linkedJobCards) && source.linkedJobCards.length) {
    return source.linkedJobCards
      .map((row) => ({
        id: String(row?.id || row?.jobCardId || '').trim(),
        jobCardNumber: String(row?.jobCardNumber || '').trim()
      }))
      .filter((row) => row.id)
  }
  const legacyId = String(source.jobCardId || '').trim()
  if (legacyId) {
    return [{ id: legacyId, jobCardNumber: String(source.jobCardNumber || '').trim() }]
  }
  return []
}

function linkedJobCardsToPayload(links) {
  return (Array.isArray(links) ? links : [])
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean)
}

function incidentPhotoHelpers() {
  return typeof window !== 'undefined' ? window.IncidentPhotos || {} : {}
}

function normalizeIncidentPhotos(raw) {
  const helpers = incidentPhotoHelpers()
  if (helpers.parseIncidentPhotosArray) return helpers.parseIncidentPhotosArray(raw)
  return Array.isArray(raw) ? raw : []
}

function mergeFormPhotos(existing, incoming) {
  const helpers = incidentPhotoHelpers()
  if (helpers.mergeIncidentPhotos) return helpers.mergeIncidentPhotos(existing, incoming)
  return [...normalizeIncidentPhotos(existing), ...normalizeIncidentPhotos(incoming)]
}

const INCIDENT_IMAGE_MAX_BYTES = 4 * 1024 * 1024
const INCIDENT_IMAGE_MAX_DIMENSION = 1920

function dataUrlApproxBytes(dataUrl) {
  const s = String(dataUrl || '')
  const idx = s.indexOf(',')
  if (idx < 0) return s.length
  return Math.ceil(((s.length - idx - 1) * 3) / 4)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('Read failed'))
    reader.readAsDataURL(file)
  })
}

async function compressIncidentImageDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxSide = Math.max(img.width, img.height)
      const scale = maxSide > INCIDENT_IMAGE_MAX_DIMENSION ? INCIDENT_IMAGE_MAX_DIMENSION / maxSide : 1
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      let quality = 0.82
      let out = canvas.toDataURL('image/jpeg', quality)
      while (dataUrlApproxBytes(out) > INCIDENT_IMAGE_MAX_BYTES && quality > 0.45) {
        quality -= 0.08
        out = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(out)
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function buildIncidentThumbDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const maxSide = 320
      const scale = Math.max(img.width, img.height) > maxSide ? maxSide / Math.max(img.width, img.height) : 1
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.62))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

function incidentPhotoDisplayUrl(entry) {
  const helpers = incidentPhotoHelpers()
  return helpers.incidentPhotoThumbUrl
    ? helpers.incidentPhotoThumbUrl(entry)
    : helpers.incidentPhotoUrl
      ? helpers.incidentPhotoUrl(entry)
      : typeof entry === 'string'
        ? entry
        : String(entry?.url || '')
}

function incidentPhotoFullUrl(entry) {
  const helpers = incidentPhotoHelpers()
  return helpers.incidentPhotoUrl
    ? helpers.incidentPhotoUrl(entry)
    : typeof entry === 'string'
      ? entry
      : String(entry?.url || '')
}

function incidentPhotoIsVideo(entry) {
  const helpers = incidentPhotoHelpers()
  if (helpers.incidentPhotoIsVideo) return helpers.incidentPhotoIsVideo(entry)
  const url = incidentPhotoFullUrl(entry)
  return /^data:video\//i.test(url)
}

function IncidentPhotoGallery({ photos, isDark, onRemove, readOnly = false }) {
  const rows = normalizeIncidentPhotos(photos)
  if (!rows.length) {
    return (
      <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No photos attached yet.</p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {rows.map((entry, idx) => {
        const src = incidentPhotoDisplayUrl(entry)
        const full = incidentPhotoFullUrl(entry)
        const isVideo = incidentPhotoIsVideo(entry)
        return (
          <div
            key={`${full || idx}-${idx}`}
            className={`relative overflow-hidden rounded-lg border ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}
          >
            {isVideo ? (
              <video src={full} controls className="h-28 w-full object-cover" />
            ) : (
              <a href={full} target="_blank" rel="noopener noreferrer">
                <img src={src || full} alt="" className="h-28 w-full object-cover" />
              </a>
            )}
            {!readOnly && typeof onRemove === 'function' ? (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                aria-label="Remove photo"
              >
                <i className="fa-solid fa-xmark text-xs" />
              </button>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function emptyForm() {
  return {
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    linkedJobCards: [],
    jobCardId: '',
    jobCardNumber: '',
    photos: [],
    incidentAt: new Date().toISOString().slice(0, 16),
    incidentType: '',
    severity: '',
    description: '',
    immediateActions: '',
    investigationNotes: '',
    correctiveActions: '',
    witnesses: '',
    equipmentInvolved: '',
    relevantAssets: '',
    relevantTanksMobileBowsers: '',
    technicianName: '',
    authorName: currentUserName(),
    authorSignature: '',
    locationDescription: '',
    locationLatitude: '',
    locationLongitude: '',
    peopleInvolved: [{ name: '', role: '', injured: false }],
    status: 'draft'
  }
}

function IncidentSignaturePad({ value, onChange, isDark, disabled = false }) {
  const canvasRef = useRef(null)
  const wrapperRef = useRef(null)
  const drawingRef = useRef(false)
  const lockedRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [locked, setLocked] = useState(Boolean(value))

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const ratio = window.devicePixelRatio || 1
    const width = wrapper.clientWidth || 320
    const height = 160
    canvas.width = width * ratio
    canvas.height = height * ratio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(ratio, ratio)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#111827'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }, [])

  const restoreImage = useCallback(
    (dataUrl) => {
      const canvas = canvasRef.current
      if (!canvas || !dataUrl || !String(dataUrl).startsWith('data:image')) return
      const img = new Image()
      img.onload = () => {
        resizeCanvas()
        const ctx = canvas.getContext('2d')
        const ratio = window.devicePixelRatio || 1
        ctx.drawImage(img, 0, 0, canvas.width / ratio, canvas.height / ratio)
        setHasInk(true)
        setLocked(true)
        lockedRef.current = true
      }
      img.src = dataUrl
    },
    [resizeCanvas]
  )

  useLayoutEffect(() => {
    resizeCanvas()
    if (value) restoreImage(value)
  }, [resizeCanvas, restoreImage, value])

  const getPos = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const pointer = event.touches ? event.touches[0] : event
    return { x: pointer.clientX - rect.left, y: pointer.clientY - rect.top }
  }

  const startDraw = (event) => {
    if (disabled || lockedRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    drawingRef.current = true
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(event)
    ctx.beginPath()
    ctx.moveTo(x, y)
    event.preventDefault()
  }

  const draw = (event) => {
    if (disabled || lockedRef.current || !drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { x, y } = getPos(event)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasInk(true)
    event.preventDefault()
  }

  const endDraw = () => {
    drawingRef.current = false
  }

  const saveSignature = () => {
    if (!hasInk || !canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onChange(dataUrl)
    setLocked(true)
    lockedRef.current = true
  }

  const clearSignature = () => {
    onChange('')
    setLocked(false)
    lockedRef.current = false
    setHasInk(false)
    resizeCanvas()
  }

  const borderCls = isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-white'

  return (
    <div className="space-y-2">
      <div ref={wrapperRef} className={`relative overflow-hidden rounded-lg border-2 ${borderCls}`}>
        <canvas
          ref={canvasRef}
          className={`block w-full touch-none ${locked || disabled ? 'pointer-events-none opacity-0' : ''}`}
          style={{ touchAction: 'none', height: '160px' }}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
        {locked && value ? (
          <img src={value} alt="Saved signature" className="pointer-events-none absolute inset-0 h-full w-full object-contain p-2" />
        ) : null}
        {!hasInk && !locked ? (
          <div className={`pointer-events-none absolute inset-0 flex items-center justify-center text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Sign here with mouse or finger
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {!locked ? (
          <button
            type="button"
            disabled={disabled || !hasInk}
            onClick={saveSignature}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save signature
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          onClick={clearSignature}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${isDark ? 'border-gray-700 text-gray-200' : 'border-gray-200 text-gray-700'}`}
        >
          Clear signature
        </button>
      </div>
    </div>
  )
}

function IncidentReportsPanel({
  clients = [],
  users = [],
  isDark = false,
  isAdminUser = false,
  onOpenJobCard,
  initialIncidentId = '',
  initialOpenNew = false,
  createPrefill = null,
  onConsumeCreatePrefill,
  onConsumeInitialIncidentId,
  onConsumeInitialOpenNew,
  initialRows = null,
  skipInitialFetch = false
}) {
  const [rows, setRows] = useState(() => (Array.isArray(initialRows) ? initialRows : []))
  const [loading, setLoading] = useState(() => !(skipInitialFetch && Array.isArray(initialRows)))
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingWord, setDownloadingWord] = useState(false)
  const [clientJobCards, setClientJobCards] = useState([])
  const [clientJobCardsLoading, setClientJobCardsLoading] = useState(false)
  const [jobCardPickerId, setJobCardPickerId] = useState('')
  const [photoUploadBusy, setPhotoUploadBusy] = useState(false)
  const photoInputRef = useRef(null)

  const token = window.storage?.getToken?.()

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search), 350)
    return () => window.clearTimeout(handle)
  }, [search])

  const loadRows = useCallback(
    async (opts = {}) => {
      const silent = opts.silent === true
      if (!token) {
        if (!silent) setLoading(false)
        return
      }
      if (!silent) setLoading(true)
      setLoadError('')
      try {
        const params = new URLSearchParams({ pageSize: '100' })
        if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim())
        if (statusFilter !== 'all') params.set('status', statusFilter)
        const res = await fetch(`/api/incident-reports?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg =
            data?.error?.message || data?.error || data?.message || `Failed to load (${res.status})`
          setLoadError(String(msg))
          if (!silent) setRows([])
          return
        }
        const list = data?.incidentReports || data?.data?.incidentReports || []
        setRows(Array.isArray(list) ? list : [])
      } catch (e) {
        console.error('Failed to load incident reports', e)
        setLoadError(e?.message || 'Could not load incident reports')
        if (!silent) setRows([])
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [token, debouncedSearch, statusFilter]
  )

  useEffect(() => {
    if (Array.isArray(initialRows)) {
      setRows(initialRows)
      setLoading(false)
    }
  }, [initialRows])

  useEffect(() => {
    const isDefaultListQuery = !debouncedSearch && statusFilter === 'all'
    const silent = skipInitialFetch && Array.isArray(initialRows) && isDefaultListQuery
    void loadRows({ silent })
  }, [loadRows, skipInitialFetch, initialRows, debouncedSearch, statusFilter])

  useEffect(() => {
    if (!createPrefill) return
    setSelected(null)
    const linkedJobCards = normalizeLinkedJobCards(createPrefill)
    setForm({
      ...emptyForm(),
      ...createPrefill,
      linkedJobCards,
      jobCardId: linkedJobCards[0]?.id || createPrefill.jobCardId || '',
      jobCardNumber: linkedJobCards[0]?.jobCardNumber || createPrefill.jobCardNumber || '',
      photos: normalizeIncidentPhotos(createPrefill.photos),
      authorName: createPrefill.authorName || currentUserName(),
      incidentAt: prefillIncidentAtLocal(createPrefill.incidentAt),
      peopleInvolved: Array.isArray(createPrefill.peopleInvolved) && createPrefill.peopleInvolved.length
        ? createPrefill.peopleInvolved
        : [{ name: '', role: '', injured: false }]
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
    if (!initialIncidentId) return
    void openIncidentById(initialIncidentId).finally(() => {
      if (typeof onConsumeInitialIncidentId === 'function') onConsumeInitialIncidentId()
    })
  }, [initialIncidentId, openIncidentById, onConsumeInitialIncidentId])

  useEffect(() => {
    if (!initialOpenNew) return
    setSelected(null)
    setShowDetail(false)
    setForm({ ...emptyForm(), authorName: currentUserName() })
    setShowForm(true)
    if (typeof onConsumeInitialOpenNew === 'function') onConsumeInitialOpenNew()
  }, [initialOpenNew, onConsumeInitialOpenNew])

  const loadIncidentExportContext = useCallback(async () => {
    if (!selected) return null
    let incident = { ...selected }
    if (token && selected.id) {
      try {
        const res = await fetch(`/api/incident-reports/${encodeURIComponent(selected.id)}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          incident = data?.incidentReport || data?.data?.incidentReport || incident
        }
      } catch (error) {
        console.warn('Could not refresh incident before export', error)
      }
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
        console.warn('Could not load document settings for incident export', error)
      }
    }

    return { incident, companyName, letterhead }
  }, [selected, token])

  const handleDownloadPdf = useCallback(async () => {
    if (!selected || downloadingPdf) return
    const printWin = window.open('', '_blank')
    if (!printWin) {
      window.alert('Please allow pop-ups to generate the PDF.')
      return
    }
    try {
      setDownloadingPdf(true)
      const ctx = await loadIncidentExportContext()
      if (!ctx) return

      const buildHtml = window.IncidentReportPrint?.buildIncidentReportPrintHtml
      const html =
        typeof buildHtml === 'function'
          ? buildHtml(ctx.incident, { companyName: ctx.companyName, letterhead: ctx.letterhead })
          : `<html><body><pre>${escapeHtml(JSON.stringify(ctx.incident, null, 2))}</pre></body></html>`

      printWin.document.write(html)
      printWin.document.close()
      printWin.focus()
      await new Promise((resolve) => {
        const imgs = printWin.document.querySelectorAll('img')
        if (!imgs.length) {
          setTimeout(resolve, 400)
          return
        }
        let pending = imgs.length
        const finish = () => {
          pending -= 1
          if (pending <= 0) setTimeout(resolve, 150)
        }
        imgs.forEach((img) => {
          if (img.complete) finish()
          else {
            img.onload = finish
            img.onerror = finish
          }
        })
        setTimeout(resolve, 4000)
      })
      printWin.print()
      printWin.close()
    } catch (error) {
      printWin.close()
      console.error('Failed to generate incident PDF', error)
      window.alert(error?.message || 'Failed to generate incident PDF.')
    } finally {
      setDownloadingPdf(false)
    }
  }, [selected, downloadingPdf, loadIncidentExportContext])

  const handleDownloadWord = useCallback(async () => {
    if (!selected || downloadingWord) return
    try {
      setDownloadingWord(true)
      const ctx = await loadIncidentExportContext()
      if (!ctx) return

      const downloadWord = window.IncidentReportPrint?.downloadIncidentReportWord
      if (typeof downloadWord !== 'function') {
        window.alert('Word export is not available. Please refresh the page and try again.')
        return
      }
      downloadWord(ctx.incident, { companyName: ctx.companyName, letterhead: ctx.letterhead })
    } catch (error) {
      console.error('Failed to generate incident Word document', error)
      window.alert(error?.message || 'Failed to generate incident Word document.')
    } finally {
      setDownloadingWord(false)
    }
  }, [selected, downloadingWord, loadIncidentExportContext])

  const loadClientJobCards = useCallback(
    async (clientId) => {
      const cid = String(clientId || '').trim()
      if (!token || !cid) {
        setClientJobCards([])
        return
      }
      setClientJobCardsLoading(true)
      try {
        const params = new URLSearchParams({ clientId: cid, pageSize: '200' })
        const res = await fetch(`/api/jobcards?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setClientJobCards([])
          return
        }
        const list = data?.jobCards || data?.data?.jobCards || []
        setClientJobCards(
          Array.isArray(list)
            ? list
                .map((row) => ({
                  id: String(row?.id || '').trim(),
                  jobCardNumber: String(row?.jobCardNumber || '').trim()
                }))
                .filter((row) => row.id)
            : []
        )
      } catch (e) {
        console.error('Failed to load job cards for incident link picker', e)
        setClientJobCards([])
      } finally {
        setClientJobCardsLoading(false)
      }
    },
    [token]
  )

  useEffect(() => {
    if (!showForm) return
    void loadClientJobCards(form.clientId)
  }, [showForm, form.clientId, loadClientJobCards])

  const addLinkedJobCard = useCallback(
    async (jobCard) => {
      const id = String(jobCard?.id || '').trim()
      if (!id) return
      setForm((f) => {
        const existing = Array.isArray(f.linkedJobCards) ? f.linkedJobCards : []
        if (existing.some((row) => row.id === id)) return f
        const next = [
          ...existing,
          { id, jobCardNumber: String(jobCard?.jobCardNumber || '').trim() }
        ]
        return {
          ...f,
          linkedJobCards: next,
          jobCardId: next[0]?.id || '',
          jobCardNumber: next[0]?.jobCardNumber || ''
        }
      })
      setJobCardPickerId('')
      if (!token) return
      const helpers = window.IncidentJobCardPrefill
      const jcPhotos = helpers?.fetchJobCardPhotosForPrefill
        ? await helpers.fetchJobCardPhotosForPrefill(token, id)
        : []
      if (!jcPhotos.length) return
      setForm((f) => ({
        ...f,
        photos: mergeFormPhotos(f.photos, jcPhotos)
      }))
    },
    [token]
  )

  const handleIncidentPhotoUpload = useCallback(async (event) => {
    const files = Array.from(event.target.files || [])
    const input = event.target
    if (!files.length) return
    setPhotoUploadBusy(true)
    try {
      const next = normalizeIncidentPhotos(form.photos)
      for (const file of files) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name)
        const maxBytes = isVideo ? 24 * 1024 * 1024 : INCIDENT_IMAGE_MAX_BYTES
        if (file.size > maxBytes) {
          window.alert(`${file.name} is too large.`)
          continue
        }
        const rawUrl = await readFileAsDataUrl(file)
        if (isVideo) {
          next.push(rawUrl)
          continue
        }
        const url = await compressIncidentImageDataUrl(rawUrl)
        const thumbUrl = await buildIncidentThumbDataUrl(url)
        next.push({
          kind: 'imageMedia',
          name: file.name || 'Photo',
          url,
          thumbUrl: thumbUrl || url
        })
      }
      setForm((f) => ({ ...f, photos: next }))
    } catch (e) {
      window.alert(e?.message || 'Failed to add photo')
    } finally {
      setPhotoUploadBusy(false)
      if (input) input.value = ''
    }
  }, [form.photos])

  const removeIncidentPhoto = useCallback((index) => {
    setForm((f) => ({
      ...f,
      photos: normalizeIncidentPhotos(f.photos).filter((_, i) => i !== index)
    }))
  }, [])

  const removeLinkedJobCard = useCallback((jobCardId) => {
    const id = String(jobCardId || '').trim()
    if (!id) return
    setForm((f) => {
      const next = (Array.isArray(f.linkedJobCards) ? f.linkedJobCards : []).filter((row) => row.id !== id)
      return {
        ...f,
        linkedJobCards: next,
        jobCardId: next[0]?.id || '',
        jobCardNumber: next[0]?.jobCardNumber || ''
      }
    })
  }, [])

  const saveForm = useCallback(async (statusOverride) => {
    if (!token || saving) return
    setSaving(true)
    try {
      const linkedJobCards = Array.isArray(form.linkedJobCards) ? form.linkedJobCards : []
      const payload = {
        ...form,
        status: statusOverride || form.status,
        jobCardIds: linkedJobCardsToPayload(linkedJobCards),
        peopleInvolved: (form.peopleInvolved || []).filter((p) => p.name || p.role)
      }
      delete payload.linkedJobCards
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

  const deleteSelected = useCallback(async () => {
    if (!token || !selected?.id || deleting || !isAdminUser) return
    const label = selected.incidentNumber || selected.id
    const confirmed = window.confirm(
      `Delete incident report ${label}?\n\nThis cannot be undone.`
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/incident-reports/${encodeURIComponent(selected.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.error || 'Delete failed')
      }
      setShowDetail(false)
      setSelected(null)
      setShowForm(false)
      await loadRows()
    } catch (e) {
      window.alert(e?.message || 'Failed to delete incident report')
    } finally {
      setDeleting(false)
    }
  }, [token, selected, deleting, isAdminUser, loadRows])

  const filteredRows = useMemo(() => rows, [rows])

  const inputCls = `w-full rounded-lg border px-3 py-2 text-sm ${
    isDark ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`

  const openNewIncidentForm = () => {
    setSelected(null)
    setShowDetail(false)
    setForm({ ...emptyForm(), authorName: currentUserName() })
    setShowForm(true)
  }

  return (
    <div className="relative min-h-[calc(100dvh-10rem)] w-full space-y-3">
      <div
        className={`sticky top-0 z-20 flex flex-wrap items-center gap-2 py-1 ${
          isDark ? 'bg-gray-950/95' : 'bg-[#f8fafc]/95'
        } backdrop-blur-sm`}
      >
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
          onClick={openNewIncidentForm}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <i className="fa-solid fa-plus" />
          New incident report
        </button>
      </div>

      {loadError ? (
        <div className={`rounded-xl border px-4 py-6 text-center text-sm ${isDark ? 'border-red-900/50 bg-red-950/20 text-red-300' : 'border-red-200 bg-red-50 text-red-700'}`}>
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void loadRows()}
            className="mt-3 text-xs font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading && filteredRows.length === 0 && !loadError ? (
        <div className={`rounded-xl border px-4 py-10 text-center text-sm ${isDark ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
          Loading incident reports…
        </div>
      ) : !loadError && filteredRows.length === 0 ? (
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
                void openIncidentById(row.id)
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
                {[row.incidentType, row.clientName, formatDate(row.incidentAt || row.createdAt)]
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
        <div className={`fixed inset-0 z-[90] flex flex-col ${isDark ? 'bg-gray-950/95' : 'bg-white'} backdrop-blur-sm`}>
          <div className={`flex items-center justify-between border-b px-6 py-4 shadow-sm ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'}`}>
            <div>
              <h2 className={`text-base font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                {selected.incidentNumber || 'Incident report'}
              </h2>
              <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                {selected.clientName || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf || downloadingWord}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              >
                <i className={`fa-solid ${downloadingPdf ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`} />
                {downloadingPdf ? 'Preparing PDF…' : 'Download PDF'}
              </button>
              <button
                type="button"
                onClick={handleDownloadWord}
                disabled={downloadingWord || downloadingPdf}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
                  isDark ? 'border-blue-700 bg-blue-950/40 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-800'
                }`}
              >
                <i className={`fa-solid ${downloadingWord ? 'fa-spinner fa-spin' : 'fa-file-word'}`} />
                {downloadingWord ? 'Preparing Word…' : 'Download Word'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const linkedJobCards = normalizeLinkedJobCards(selected)
                  setForm({
                    ...emptyForm(),
                    ...selected,
                    linkedJobCards,
                    jobCardId: linkedJobCards[0]?.id || selected.jobCardId || '',
                    jobCardNumber: linkedJobCards[0]?.jobCardNumber || selected.jobCardNumber || '',
                    photos: normalizeIncidentPhotos(selected.photos),
                    incidentAt: selected.incidentAt
                      ? new Date(selected.incidentAt).toISOString().slice(0, 16)
                      : '',
                    authorName: selected.authorName || currentUserName(),
                    authorSignature: selected.authorSignature || '',
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
              {isAdminUser ? (
                <button
                  type="button"
                  onClick={() => void deleteSelected()}
                  disabled={deleting}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-60 ${
                    isDark ? 'border-red-800 text-red-300 hover:bg-red-950/40' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  <i className={`fa-solid ${deleting ? 'fa-spinner fa-spin' : 'fa-trash'}`} />
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              ) : null}
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
                ['Client', selected.clientName],
                ['Type', selected.incidentType],
                ['Severity', selected.severity],
                ['Status', selected.status],
                ['Incident date', formatDate(selected.incidentAt)],
                ['Technician', selected.technicianName],
                ['Author', selected.authorName],
                ['Draft recorded', formatDate(selected.createdAt)],
                ['Submitted', formatDate(selected.submittedAt)]
              ].map(([label, value]) => (
                <div key={label} className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                  <div className={`text-[10px] uppercase tracking-wide ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{label}</div>
                  <div className={`mt-1 text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{value || '—'}</div>
                </div>
              ))}
            </div>
            {normalizeLinkedJobCards(selected).length ? (
              <section className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Linked job cards</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {normalizeLinkedJobCards(selected).map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => {
                        if (typeof onOpenJobCard === 'function') onOpenJobCard({ id: row.id, jobCardNumber: row.jobCardNumber })
                      }}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        isDark ? 'border-indigo-700/50 bg-indigo-950/30 text-indigo-200 hover:bg-indigo-900/40' : 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
                      }`}
                    >
                      <i className="fa-solid fa-clipboard-list" />
                      {row.jobCardNumber || row.id}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {normalizeIncidentPhotos(selected.photos).length ? (
              <section className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Photos</h3>
                <div className="mt-2">
                  <IncidentPhotoGallery photos={selected.photos} isDark={isDark} readOnly />
                </div>
              </section>
            ) : null}
            {[
              ['Location', selected.locationDescription],
              ['Equipment / vehicle involved', selected.equipmentInvolved],
              ['Relevant tanks / mobile bowsers', selected.relevantTanksMobileBowsers],
              ['Description', selected.description],
              ['Immediate actions', selected.immediateActions],
              ['Investigation notes', selected.investigationNotes],
              ['Corrective / follow-up actions', selected.correctiveActions]
            ]
              .filter(([, body]) => String(body || '').trim())
              .map(([title, body]) => (
              <section key={title} className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>{title}</h3>
                <p className={`mt-2 whitespace-pre-wrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{body || '—'}</p>
              </section>
            ))}
            {selected.authorSignature ? (
              <section className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                <h3 className={`text-sm font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>Author signature</h3>
                <img src={selected.authorSignature} alt="Author signature" className="mt-2 max-h-24 max-w-xs rounded border border-gray-200 bg-white object-contain p-2" />
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className={`fixed inset-0 z-[100] flex flex-col ${isDark ? 'bg-gray-950/95' : 'bg-white'}`}>
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
            <div className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}>
              <div className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Linked job cards</div>
              <p className={`mt-1 text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Link one or more job cards related to this incident.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(form.linkedJobCards || []).map((row) => (
                  <span
                    key={row.id}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                      isDark ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-200 bg-white text-gray-800'
                    }`}
                  >
                    <span>{row.jobCardNumber || row.id}</span>
                    <button
                      type="button"
                      onClick={() => removeLinkedJobCard(row.id)}
                      className={isDark ? 'text-gray-400 hover:text-red-300' : 'text-gray-500 hover:text-red-600'}
                      aria-label={`Remove ${row.jobCardNumber || row.id}`}
                    >
                      <i className="fa-solid fa-xmark" />
                    </button>
                  </span>
                ))}
                {!form.linkedJobCards?.length ? (
                  <span className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>No job cards linked yet.</span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-xs font-medium">
                  Add job card
                  <select
                    className={`${inputCls} mt-1`}
                    value={jobCardPickerId}
                    disabled={!form.clientId || clientJobCardsLoading}
                    onChange={(e) => {
                      const nextId = e.target.value
                      setJobCardPickerId(nextId)
                      const picked = clientJobCards.find((row) => row.id === nextId)
                      if (picked) addLinkedJobCard(picked)
                    }}
                  >
                    <option value="">
                      {!form.clientId
                        ? 'Select a client first'
                        : clientJobCardsLoading
                          ? 'Loading job cards…'
                          : 'Choose a job card'}
                    </option>
                    {clientJobCards
                      .filter((row) => !(form.linkedJobCards || []).some((linked) => linked.id === row.id))
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.jobCardNumber || row.id}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>
            <div className={`rounded-lg border p-3 ${isDark ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Photos</div>
                <div className="flex items-center gap-2">
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleIncidentPhotoUpload(e)}
                  />
                  <button
                    type="button"
                    disabled={saving || photoUploadBusy}
                    onClick={() => photoInputRef.current?.click()}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60 ${
                      isDark ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <i className={`fa-solid ${photoUploadBusy ? 'fa-spinner fa-spin' : 'fa-camera'} mr-1`} />
                    {photoUploadBusy ? 'Adding…' : 'Add photos'}
                  </button>
                </div>
              </div>
              <p className={`mt-1 text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                Attach photos or videos. Photos from linked job cards are copied automatically.
              </p>
              <div className="mt-3">
                <IncidentPhotoGallery
                  photos={form.photos}
                  isDark={isDark}
                  onRemove={removeIncidentPhoto}
                />
              </div>
            </div>
            <label className="block text-xs font-medium">
              Location
              <input className={`${inputCls} mt-1`} value={form.locationDescription} onChange={(e) => setForm((f) => ({ ...f, locationDescription: e.target.value }))} placeholder="Location or address" />
            </label>
            <label className="block text-xs font-medium">
              Equipment / vehicle involved
              <input className={`${inputCls} mt-1`} value={form.equipmentInvolved} onChange={(e) => setForm((f) => ({ ...f, equipmentInvolved: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Relevant tanks / mobile bowsers
              <textarea className={`${inputCls} mt-1`} rows={2} value={form.relevantTanksMobileBowsers} onChange={(e) => setForm((f) => ({ ...f, relevantTanksMobileBowsers: e.target.value }))} placeholder="Tank IDs, bowser numbers, or locations" />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium">
                Technician involved
                <input
                  list="incident-technicians"
                  className={`${inputCls} mt-1`}
                  value={form.technicianName}
                  onChange={(e) => setForm((f) => ({ ...f, technicianName: e.target.value }))}
                  placeholder="Technician name"
                />
                <datalist id="incident-technicians">
                  {users.map((u) => (
                    <option key={u.id} value={u.name || u.email || u.id} />
                  ))}
                </datalist>
              </label>
              <label className="block text-xs font-medium">
                Author (person completing report)
                <input className={`${inputCls} mt-1`} value={form.authorName} onChange={(e) => setForm((f) => ({ ...f, authorName: e.target.value }))} placeholder="Your name" />
              </label>
            </div>
            <label className="block text-xs font-medium">
              Description
              <textarea className={`${inputCls} mt-1`} rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Immediate actions
              <textarea className={`${inputCls} mt-1`} rows={3} value={form.immediateActions} onChange={(e) => setForm((f) => ({ ...f, immediateActions: e.target.value }))} />
            </label>
            <label className="block text-xs font-medium">
              Investigation notes
              <textarea className={`${inputCls} mt-1`} rows={3} value={form.investigationNotes} onChange={(e) => setForm((f) => ({ ...f, investigationNotes: e.target.value }))} placeholder="Diagnosis, findings, or observations" />
            </label>
            <label className="block text-xs font-medium">
              Corrective / follow-up actions
              <textarea className={`${inputCls} mt-1`} rows={3} value={form.correctiveActions} onChange={(e) => setForm((f) => ({ ...f, correctiveActions: e.target.value }))} placeholder="Future work or corrective steps" />
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
            <div className={`rounded-lg border p-3 text-xs ${isDark ? 'border-gray-800 bg-gray-900 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
              <div><span className="font-semibold">Draft timing:</span> saved automatically when you create or update a draft.</div>
              <div className="mt-1"><span className="font-semibold">Submission timing:</span> recorded when status is set to Submitted.</div>
            </div>
            <div>
              <div className={`mb-2 text-xs font-medium ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Author signature</div>
              <IncidentSignaturePad
                value={form.authorSignature}
                onChange={(sig) => setForm((f) => ({ ...f, authorSignature: sig }))}
                isDark={isDark}
                disabled={saving}
              />
            </div>
          </div>
          <div className={`flex shrink-0 flex-wrap items-center gap-3 border-t px-6 py-4 ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'}`}>
            <button type="button" disabled={saving} onClick={() => void saveForm()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving…' : 'Save incident'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveForm('submitted')}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold ${isDark ? 'border-sky-700 text-sky-300' : 'border-sky-200 bg-sky-50 text-sky-800'}`}
            >
              Save & submit
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

window.IncidentReportsPanel = IncidentReportsPanel
if (typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent('incidentReportsPanelReady'))
}
