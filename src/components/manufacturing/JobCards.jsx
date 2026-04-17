// JobCards module (minimal version)
// This provides a simple, working Job Cards list inside
// the Service & Maintenance section while the full
// manager experience is being iterated on.

const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {};

const { useState, useEffect, useMemo, useCallback } = ReactGlobal;

function normalizeRole(role) {
  if (!role) return '';
  return String(role).trim().toLowerCase().replace(/\s+/g, '_');
}

function isAdminOrSuperAdminRole(role) {
  const normalized = normalizeRole(role);
  return [
    'admin',
    'administrator',
    'superadmin',
    'super-admin',
    'super_admin',
    'super_administrator',
    'system_admin',
  ].includes(normalized);
}

function jobCardAttachmentUrlIsVideo(url) {
  return typeof url === 'string' && /^data:video\//i.test(url);
}

/** Job card JSON fields may arrive parsed or as a string from older clients. */
function parseJsonArrayLoose(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const p = JSON.parse(value);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Service form answers: array of { fieldId, value } or a plain object (wizard-style). */
function jobCardAnswerRows(answers) {
  if (Array.isArray(answers)) {
    return answers
      .filter((a) => a && (a.fieldId != null || a.field_id != null))
      .map((a) => ({
        fieldId: a.fieldId ?? a.field_id,
        value: a.value != null ? String(a.value) : '',
      }));
  }
  if (answers && typeof answers === 'object') {
    return Object.entries(answers).map(([fieldId, value]) => ({
      fieldId,
      value: value != null ? String(value) : '',
    }));
  }
  return [];
}

function labelForTemplateField(templateFields, fieldId) {
  const arr = Array.isArray(templateFields) ? templateFields : [];
  const f = arr.find((x) => x && (x.id === fieldId || x.fieldId === fieldId));
  return f && f.label ? f.label : fieldId;
}

/** Resolve a human label for `form_<id>_<fieldId>` voice keys (wizard id may not match server instance id). */
function labelOrphanFormVoiceKey(forms, key) {
  if (!key || typeof key !== 'string' || !key.startsWith('form_')) return key;
  const parsed = key.slice(5);
  const lastUs = parsed.lastIndexOf('_');
  const fieldOnly = lastUs > 0 ? parsed.slice(lastUs + 1) : key;
  if (Array.isArray(forms)) {
    for (const form of forms) {
      const fields = Array.isArray(form.templateFields) ? form.templateFields : [];
      const lbl = labelForTemplateField(fields, fieldOnly);
      if (lbl !== fieldOnly) return lbl;
    }
  }
  return fieldOnly.replace(/_/g, ' ');
}

/**
 * Split photos array into gallery items vs voice clips (which carry `kind` + `section`).
 * @param {unknown} photosInput
 * @param {{ issueId?: string|null }} [opts] — SafetyCulture issue id so media proxy can refresh stale tokens
 */
/** Public job card wizard stores per-field photos as kind sectionMedia (shown under Diagnosis / Actions / Future work). */
const SECTION_VISUAL_KEYS = ['diagnosis', 'actionsTaken', 'futureWorkRequired'];

function partitionJobCardAttachments(photosInput, opts = {}) {
  const issueId = opts.issueId != null && String(opts.issueId).trim() !== '' ? String(opts.issueId) : '';
  const photos = parseJsonArrayLoose(photosInput);
  const visualItems = [];
  const voicesBySection = {};
  const visualItemsBySection = {
    diagnosis: [],
    actionsTaken: [],
    futureWorkRequired: []
  };
  photos.forEach((p, idx) => {
    const url = typeof p === 'string' ? p : p?.url;
    const isVoice = typeof p === 'object' && p && p.kind === 'voice';
    if (isVoice && url) {
      const sec =
        p.section != null && String(p.section).trim() !== ''
          ? String(p.section)
          : 'otherComments';
      if (!voicesBySection[sec]) voicesBySection[sec] = [];
      voicesBySection[sec].push({ url, mimeType: p.mimeType, idx });
      return;
    }
    const isSectionMedia =
      typeof p === 'object' &&
      p &&
      p.kind === 'sectionMedia' &&
      typeof p.url === 'string' &&
      p.url;
    if (isSectionMedia) {
      const secRaw = p.section != null ? String(p.section).trim() : '';
      const sec = SECTION_VISUAL_KEYS.includes(secRaw) ? secRaw : null;
      const item = { raw: p, url: String(p.url), idx };
      if (p.name != null && String(p.name).trim()) item.filename = String(p.name);
      if (sec) {
        visualItemsBySection[sec].push(item);
      } else {
        visualItems.push(item);
      }
      return;
    }
    const isScMedia =
      typeof p === 'object' &&
      p &&
      p.kind === 'safetyCultureMedia' &&
      p.mediaId &&
      p.token;
    if (isScMedia) {
      visualItems.push({
        raw: p,
        safetyCulture: true,
        mediaId: String(p.mediaId),
        token: String(p.token),
        mediaType: p.mediaType != null ? String(p.mediaType) : '',
        filename: p.filename != null ? String(p.filename) : 'media',
        issueId,
        idx
      });
      return;
    }
    if (url) {
      visualItems.push({ raw: p, url, idx });
    }
  });
  return { visualItems, voicesBySection, visualItemsBySection };
}

/** SafetyCulture media: backend proxy (refreshes tokens via issue_id when stale). */
function JobCardSafetyCultureThumbnail({ mediaId, token, mediaType, filename, idx, issueId }) {
  const [retryTick, setRetryTick] = useState(0);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setErr(null);
    setRetryTick(0);
  }, [mediaId, token, mediaType, filename, issueId]);

  const isVideo =
    String(mediaType).includes('VIDEO') ||
    /\.(mp4|webm|mov|m4v)$/i.test(filename || '');
  const mediaParams = new URLSearchParams({ id: String(mediaId || ''), token: String(token || '') });
  if (mediaType) mediaParams.set('media_type', String(mediaType));
  if (filename) mediaParams.set('filename', String(filename));
  if (issueId) mediaParams.set('issue_id', String(issueId));
  if (retryTick > 0) mediaParams.set('retry', String(retryTick));
  const mediaSrc = `/api/safety-culture/media/proxy?${mediaParams.toString()}`;
  const canRender = Boolean(mediaId && token);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950/50">
      <div className="truncate px-2 py-1 text-[11px] text-slate-400" title={filename}>
        {filename}
      </div>
      {err ? (
        <div className="px-2 pb-2 text-xs text-red-400">{err}</div>
      ) : null}
      {!err && !canRender ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
          <i className="fa-regular fa-circle-xmark" aria-hidden />
          Missing media credentials
        </div>
      ) : null}
      {canRender && isVideo ? (
        <video
          src={mediaSrc}
          className="max-h-64 w-full object-contain bg-black"
          controls
          playsInline
          preload="metadata"
          onError={() => {
            if (retryTick < 2) {
              setRetryTick((n) => n + 1);
              return;
            }
            setErr('Could not load media');
          }}
        />
      ) : null}
      {canRender && !isVideo ? (
        <figure className="group relative overflow-hidden bg-slate-800">
                          <img
                            src={mediaSrc}
                            alt={`SafetyCulture attachment ${idx + 1}`}
                            className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            loading="lazy"
                            decoding="async"
                            onError={() => {
              if (retryTick < 2) {
                setRetryTick((n) => n + 1);
                return;
              }
              setErr('Could not load media');
            }}
          />
        </figure>
      ) : null}
    </div>
  );
}

/** Photos/videos saved for one narrative block (public wizard: kind sectionMedia). Shown under Diagnosis / Actions / Future work. */
function JobCardInlineSectionMediaStrip({ items, issueId }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-2">Photos &amp; video</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((item) => {
          const key = `sec-inline-${item.idx}`;
          if (item.safetyCulture) {
            return (
              <JobCardSafetyCultureThumbnail
                key={key}
                mediaId={item.mediaId}
                token={item.token}
                mediaType={item.mediaType}
                filename={item.filename || 'media'}
                issueId={issueId}
                idx={item.idx}
              />
            );
          }
          const { url } = item;
          if (url && jobCardAttachmentUrlIsVideo(url)) {
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-slate-700 bg-black">
                <video
                  src={url}
                  className="max-h-40 w-full object-contain"
                  controls
                  playsInline
                  preload="metadata"
                />
              </div>
            );
          }
          return (
            <figure key={key} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              <img src={url} alt="" className="h-28 w-full object-cover" loading="lazy" decoding="async" />
            </figure>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Compact voice attachments: collapsed to a single control; expand to play.
 * @param {'auto'|'dark'|'light'} [tone='auto'] — `dark` for the manufacturing immersive viewer; `auto` follows app theme (e.g. Service & Maintenance).
 */
function JobCardVoiceClips({ items, tone = 'auto' }) {
  const [expanded, setExpanded] = useState(false);
  if (!items || items.length === 0) return null;

  const themeDark =
    typeof window !== 'undefined' && window.useTheme ? window.useTheme().isDark : false;
  const isDark = tone === 'dark' ? true : tone === 'light' ? false : themeDark;

  const count = items.length;
  const label = count === 1 ? 'Voice note' : `${count} voice notes`;

  const btn = isDark
    ? 'border-slate-600/80 bg-slate-900/50 text-slate-200 hover:bg-slate-800/70'
    : 'border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50';
  const iconBg = isDark ? 'bg-pink-500/15 text-pink-300' : 'bg-pink-50 text-pink-600';
  const panel = isDark
    ? 'border-slate-600/50 bg-slate-950/50'
    : 'border-gray-200 bg-gray-50';

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`inline-flex max-w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs font-medium transition-colors ${btn}`}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide voice note player' : `Show ${label}`}
      >
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg}`}
        >
          <i className="fa-solid fa-microphone text-[13px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">{label}</span>
        <i
          className={`fa-solid fa-chevron-down text-[10px] text-current opacity-50 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div
          className={`mt-2 space-y-2 rounded-lg border p-2 ${panel}`}
          role="region"
          aria-label="Voice recordings"
        >
          {items.map((item) => (
            <audio key={item.idx} controls className="h-8 w-full max-w-md" src={item.url} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const JobCards = ({ clients = [], users = [], onOpenDetail }) => {
  const isDark = (typeof window !== 'undefined' && window.useTheme) ? (window.useTheme().isDark) : false;
  if (!useState || !useEffect || !useMemo || !useCallback) {
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
  const [deletingJobCardId, setDeletingJobCardId] = useState(null);
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Checklist / service form instances for the open detail view (GET /api/jobcards/:id/forms). */
  const [detailServiceForms, setDetailServiceForms] = useState([]);
  /** Activity trail (GET /api/jobcards/:id/activity). */
  const [detailActivities, setDetailActivities] = useState([]);

  const attachmentParts = useMemo(
    () =>
      partitionJobCardAttachments(selectedJobCard?.photos, {
        issueId: selectedJobCard?.safetyCultureIssueId
      }),
    [selectedJobCard?.photos, selectedJobCard?.safetyCultureIssueId]
  );

  /** Detail shell vs heavy `photos` JSON (loaded in a follow-up request when using omitPhotos=1). */
  const detailAttachmentsLoading =
    (detailLoading && !Array.isArray(selectedJobCard?.photos)) ||
    selectedJobCard?.attachmentsPending === true;

  /** Keys like `form_<instanceId>_<fieldId>` for checklist fields we can place next to answers. */
  const checklistFieldVoiceKeys = useMemo(() => {
    const s = new Set();
    detailServiceForms.forEach((form) => {
      jobCardAnswerRows(form.answers).forEach(({ fieldId }) => {
        s.add(`form_${form.id}_${fieldId}`);
      });
    });
    return s;
  }, [detailServiceForms]);

  const orphanChecklistVoiceKeys = useMemo(() => {
    const v = attachmentParts.voicesBySection;
    return Object.keys(v).filter(
      (k) => k.startsWith('form_') && !checklistFieldVoiceKeys.has(k)
    );
  }, [attachmentParts, checklistFieldVoiceKeys]);

  const pageSize = 25;
  const currentUser = useMemo(
    () => (typeof window !== 'undefined' && window.storage?.getUser ? window.storage.getUser() : null),
    []
  );
  const canDeleteJobCards = isAdminOrSuperAdminRole(currentUser?.role);

  /** Match Prisma cuid or UUID so we query by clientId; otherwise filter by clientName (contains). */
  const clientFilterLooksLikeId = (value) => {
    if (!value || typeof value !== 'string') return false;
    const v = value.trim();
    if (/^c[a-z0-9]{24}$/i.test(v)) return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  };

  const buildJobCardsListUrl = useCallback(
    (pageNum) => {
      const params = new URLSearchParams();
      params.set('page', String(pageNum));
      params.set('pageSize', String(pageSize));
      if (statusFilter && statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      if (clientFilter) {
        if (clientFilterLooksLikeId(clientFilter)) {
          params.set('clientId', clientFilter.trim());
        } else {
          params.set('clientName', clientFilter.trim());
        }
      }
      const apiSortField =
        sortField === 'client'
          ? 'clientName'
          : sortField === 'technician'
            ? 'agentName'
            : sortField === 'jobCardNumber' ||
                sortField === 'status' ||
                sortField === 'createdAt'
              ? sortField
              : 'createdAt';
      params.set('sortField', apiSortField);
      params.set('sortDirection', sortDirection);
      return `/api/jobcards?${params.toString()}`;
    },
    [pageSize, statusFilter, clientFilter, sortField, sortDirection]
  );

  const fetchJobCardsPage = useCallback(
    async (pageToLoad) => {
      const token = window.storage?.getToken?.();
      if (!token) {
        setError('You must be logged in to view job cards.');
        setJobCards([]);
        setPagination(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(buildJobCardsListUrl(pageToLoad), {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const text = await response.text();
          console.error('❌ JobCards: Failed to load job cards', response.status, text);

          let errorMessage = 'Failed to load job cards.';
          try {
            const errorData = JSON.parse(text);
            errorMessage = errorData.message || errorData.error || errorMessage;
          } catch {
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
        setPagination(raw.pagination || raw.data?.pagination || null);
      } catch (e) {
        console.error('❌ JobCards: Error loading job cards', e);

        let errorMessage = e.message || 'Unable to load job cards.';
        if (e.name === 'TypeError' && e.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (e.message.includes('JSON')) {
          errorMessage = 'Invalid response from server. Please try again.';
        }

        setError(errorMessage);
        setJobCards([]);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    },
    [buildJobCardsListUrl]
  );

  useEffect(() => {
    fetchJobCardsPage(page);
  }, [page, fetchJobCardsPage]);

  const reloadJobCards = useCallback(async () => {
    await fetchJobCardsPage(page);
  }, [fetchJobCardsPage, page]);

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

  /** Server applies filters + sort; list is ready to render. */
  const displayJobCards = jobCards;

  const handleSort = (field) => {
    setPage(1);
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

  const formatJobCardActivityAction = (action) => {
    const h = typeof window !== 'undefined' && window.jobCardActivityHelpers;
    if (h && typeof h.formatJobCardActivityAction === 'function') {
      return h.formatJobCardActivityAction(action);
    }
    if (!action || typeof action !== 'string') return '—';
    return action;
  };

  const formatJobCardActivityDetailLine = (action, metadata) => {
    const h = typeof window !== 'undefined' && window.jobCardActivityHelpers;
    if (h && typeof h.formatJobCardActivityDetail === 'function') {
      return h.formatJobCardActivityDetail(action, metadata);
    }
    return '';
  };

  const handleRowClick = async (jobCard) => {
    if (typeof onOpenDetail === 'function') {
      onOpenDetail(jobCard);
      return;
    }
    if (!jobCard?.id) {
      setSelectedJobCard(jobCard);
      setDetailServiceForms([]);
      setDetailActivities([]);
      setShowDetail(true);
      return;
    }
    setDetailLoading(true);
    setShowDetail(true);
    setSelectedJobCard(jobCard);
    setDetailServiceForms([]);
    setDetailActivities([]);
    try {
      const token = window.storage?.getToken?.();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [cardResponse, formsResponse, activityResponse] = await Promise.all([
        fetch(`/api/jobcards/${jobCard.id}?omitPhotos=1`, { headers }),
        fetch(`/api/jobcards/${jobCard.id}/forms`, { headers }),
        fetch(`/api/jobcards/${jobCard.id}/activity?order=asc`, { headers }),
      ]);
      let shouldLoadPhotos = false;
      if (cardResponse.ok) {
        const data = await cardResponse.json();
        const full = data?.data?.jobCard ?? data?.jobCard ?? data;
        if (full && full.id) {
          setSelectedJobCard(full);
          shouldLoadPhotos = full.attachmentsPending === true;
        }
      }
      if (formsResponse.ok) {
        try {
          const fr = await formsResponse.json();
          setDetailServiceForms(Array.isArray(fr.forms) ? fr.forms : []);
        } catch {
          setDetailServiceForms([]);
        }
      }
      if (activityResponse.ok) {
        try {
          const ar = await activityResponse.json();
          const acts = ar?.data?.activities ?? ar?.activities;
          setDetailActivities(Array.isArray(acts) ? acts : []);
        } catch {
          setDetailActivities([]);
        }
      }
      if (shouldLoadPhotos && jobCard.id) {
        void (async () => {
          try {
            const pr = await fetch(`/api/jobcards/${jobCard.id}/photos`, { headers });
            if (!pr.ok) {
              setSelectedJobCard((prev) =>
                prev?.id === jobCard.id ? { ...prev, photos: [], attachmentsPending: false } : prev
              );
              return;
            }
            const pd = await pr.json();
            const photos = pd?.data?.photos ?? pd?.photos;
            setSelectedJobCard((prev) =>
              prev?.id === jobCard.id
                ? {
                    ...prev,
                    photos: Array.isArray(photos) ? photos : [],
                    attachmentsPending: false
                  }
                : prev
            );
          } catch {
            setSelectedJobCard((prev) =>
              prev?.id === jobCard.id ? { ...prev, photos: [], attachmentsPending: false } : prev
            );
          }
        })();
      }
    } catch (e) {
      console.warn('Failed to load full job card details, showing list data', e);
    } finally {
      setDetailLoading(false);
    }
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

      let savedId = null;
      if (editingJobCard && editingJobCard.id) {
        await window.DatabaseAPI.updateJobCard(editingJobCard.id, formData);
        savedId = editingJobCard.id;
      } else {
        const created = await window.DatabaseAPI.createJobCard(formData);
        const jc = created?.data?.jobCard || created?.jobCard;
        savedId = jc?.id || null;
      }

      setIsModalOpen(false);
      setEditingJobCard(null);

      // Refresh list after save
      await reloadJobCards();
      return { id: savedId };
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

  const handleDeleteJobCard = async (jobCard) => {
    if (!canDeleteJobCards) return;
    if (!jobCard?.id) return;
    if (deletingJobCardId) return;

    const jobCardLabel = jobCard.jobCardNumber || 'this job card';
    const confirmed = window.confirm(
      `Delete ${jobCardLabel}? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingJobCardId(jobCard.id);
      if (!window.DatabaseAPI?.deleteJobCard) {
        throw new Error('Delete job card API is unavailable.');
      }
      await window.DatabaseAPI.deleteJobCard(jobCard.id);
      if (selectedJobCard?.id === jobCard.id) {
        setShowDetail(false);
        setSelectedJobCard(null);
        setDetailServiceForms([]);
      }
      await reloadJobCards();
    } catch (e) {
      console.error('❌ Failed to delete job card:', e);
      alert(e?.message || 'Failed to delete job card. Please try again.');
    } finally {
      setDeletingJobCardId(null);
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
            onChange={(e) => {
              setPage(1);
              setStatusFilter(e.target.value);
            }}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            className={`rounded-lg px-2 py-1 text-xs shadow-sm focus:border-primary-500 focus:ring-primary-500 ${isDark ? 'border-slate-600 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}
            value={clientFilter}
            onChange={(e) => {
              setPage(1);
              setClientFilter(e.target.value);
            }}
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
      ) : displayJobCards.length === 0 ? (
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
                {canDeleteJobCards ? (
                  <th className="px-4 py-2 text-right">
                    <span className="font-semibold">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800 bg-slate-900' : 'divide-slate-100 bg-white'}`}>
              {displayJobCards.map((jc) => {
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
                    {canDeleteJobCards ? (
                      <td className="px-4 py-2 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteJobCard(jc);
                          }}
                          disabled={deletingJobCardId === jc.id}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                            deletingJobCardId === jc.id
                              ? isDark
                                ? 'border-slate-700 text-slate-500 cursor-not-allowed'
                                : 'border-slate-200 text-slate-300 cursor-not-allowed'
                              : isDark
                                ? 'border-rose-500/40 text-rose-300 hover:bg-rose-500/10'
                                : 'border-rose-300 text-rose-700 hover:bg-rose-50'
                          }`}
                          aria-label={`Delete ${jc.jobCardNumber || 'job card'}`}
                          title={`Delete ${jc.jobCardNumber || 'job card'}`}
                        >
                          <i className="fa-solid fa-trash-can" />
                          <span>
                            {deletingJobCardId === jc.id ? 'Deleting…' : 'Delete'}
                          </span>
                        </button>
                      </td>
                    ) : null}
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
                  setDetailServiceForms([]);
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

                  {(selectedJobCard.recordedByName ||
                    selectedJobCard.recordedByEmail ||
                    selectedJobCard.ownerId ||
                    selectedJobCard.completedByName ||
                    selectedJobCard.completedByUserId) && (
                    <div className="mt-4 border-t border-slate-800 pt-4 grid gap-4 sm:grid-cols-2 text-sm text-slate-100">
                      {(selectedJobCard.recordedByName ||
                        selectedJobCard.recordedByEmail ||
                        selectedJobCard.ownerId) && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-slate-400">
                            Recorded by (ERP account)
                          </div>
                          <div className="mt-1">
                            {selectedJobCard.recordedByName ||
                              selectedJobCard.recordedByEmail ||
                              (selectedJobCard.ownerId
                                ? `User id ${String(selectedJobCard.ownerId).slice(0, 10)}…`
                                : '—')}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                            The signed-in user who created or owns this card in the system (not the on-site technician).
                          </p>
                        </div>
                      )}
                      {(selectedJobCard.completedByName || selectedJobCard.completedByUserId) && (
                        <div>
                          <div className="text-[11px] font-semibold uppercase text-slate-400">
                            Sign-off (ERP account)
                          </div>
                          <div className="mt-1">
                            {selectedJobCard.completedByName ||
                              selectedJobCard.completedByUserId ||
                              '—'}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500 leading-snug">
                            Set when the card is submitted or completed in the app.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {parseJsonArrayLoose(selectedJobCard.otherTechnicians).length > 0 && (
                    <div className="mt-4 border-t border-slate-800 pt-4">
                      <div className="text-[11px] font-semibold uppercase text-slate-400">
                        Also on site
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parseJsonArrayLoose(selectedJobCard.otherTechnicians).map((name, idx) => (
                          <span
                            key={idx}
                            className="rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs text-slate-200"
                          >
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

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

                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 print:break-inside-avoid">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
                    Activity
                  </div>
                  {detailLoading ? (
                    <p className="text-sm text-slate-500">Loading…</p>
                  ) : detailActivities.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No activity events could be loaded. Refresh or reopen this card.
                    </p>
                  ) : (
                    <ul className="space-y-2 text-sm text-slate-200">
                      {detailActivities.map((a) => (
                        <li
                          key={a.id}
                          className="border-b border-slate-800/80 pb-2 last:border-0"
                        >
                          <span className="text-slate-400 text-xs">{formatDate(a.createdAt)}</span>
                          {' · '}
                          <span className="font-medium">{formatJobCardActivityAction(a.action)}</span>
                          {a.actorName ? ` — ${a.actorName}` : ''}
                          {a.source ? (
                            <span className="text-slate-500 text-xs"> ({a.source})</span>
                          ) : null}
                          {formatJobCardActivityDetailLine(a.action, a.metadata) ? (
                            <div className="text-slate-500 text-xs mt-0.5 pl-0">
                              {formatJobCardActivityDetailLine(a.action, a.metadata)}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Narrative */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                  <header className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-300">
                      <i className="fa-solid fa-clipboard-list text-sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Visit summary
                      </div>
                      <div className="text-sm text-slate-100">
                        {selectedJobCard.reasonForVisit || 'No visit reason captured.'}
                      </div>
                      <JobCardVoiceClips
                        tone="dark"
                        items={attachmentParts.voicesBySection.reasonForVisit}
                      />
                    </div>
                  </header>

                  <div className="space-y-5 text-sm text-slate-100">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Diagnosis
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.diagnosis || 'No diagnosis captured.'}
                      </p>
                      <JobCardInlineSectionMediaStrip
                        items={attachmentParts.visualItemsBySection?.diagnosis}
                        issueId={selectedJobCard.safetyCultureIssueId}
                      />
                      <JobCardVoiceClips
                        tone="dark"
                        items={attachmentParts.voicesBySection.diagnosis}
                      />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Actions taken
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.actionsTaken || 'No actions recorded.'}
                      </p>
                      <JobCardInlineSectionMediaStrip
                        items={attachmentParts.visualItemsBySection?.actionsTaken}
                        issueId={selectedJobCard.safetyCultureIssueId}
                      />
                      <JobCardVoiceClips
                        tone="dark"
                        items={attachmentParts.voicesBySection.actionsTaken}
                      />
                    </div>
                    {(selectedJobCard.futureWorkRequired ||
                      selectedJobCard.futureWorkScheduledAt ||
                      (attachmentParts.visualItemsBySection?.futureWorkRequired?.length > 0)) && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-slate-500">
                          Future work
                        </div>
                        <p className="mt-1 leading-relaxed">
                          {selectedJobCard.futureWorkRequired || 'Follow-up work scheduled.'}
                        </p>
                        {selectedJobCard.futureWorkScheduledAt ? (
                          <p className="mt-2 text-xs text-slate-300">
                            Scheduled: {formatDate(selectedJobCard.futureWorkScheduledAt)}
                          </p>
                        ) : null}
                        <JobCardInlineSectionMediaStrip
                          items={attachmentParts.visualItemsBySection?.futureWorkRequired}
                          issueId={selectedJobCard.safetyCultureIssueId}
                        />
                        <JobCardVoiceClips
                          tone="dark"
                          items={attachmentParts.voicesBySection.futureWorkRequired}
                        />
                      </div>
                    )}
                  </div>

                  {(selectedJobCard.otherComments ||
                    (attachmentParts.voicesBySection.otherComments &&
                      attachmentParts.voicesBySection.otherComments.length > 0)) && (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
                        Additional notes
                      </div>
                      {selectedJobCard.otherComments ? (
                        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
                          {selectedJobCard.otherComments}
                        </div>
                      ) : null}
                      <JobCardVoiceClips
                        tone="dark"
                        items={attachmentParts.voicesBySection.otherComments}
                      />
                    </div>
                  )}

                  {selectedJobCard.safetyCultureSnapshotJson ? (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
                        Safety Culture — imported snapshot
                      </div>
                      <details className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40">
                        <summary className="cursor-pointer p-3 text-sm text-slate-200">
                          View full JSON snapshot (feed + SafetyCulture API detail)
                        </summary>
                        <pre className="text-xs overflow-auto max-h-96 p-3 border-t border-slate-800 text-slate-300 whitespace-pre-wrap">
                          {(() => {
                            try {
                              const o = JSON.parse(selectedJobCard.safetyCultureSnapshotJson);
                              return JSON.stringify(o, null, 2);
                            } catch {
                              return selectedJobCard.safetyCultureSnapshotJson;
                            }
                          })()}
                        </pre>
                      </details>
                    </div>
                  ) : null}

                  {attachmentParts.voicesBySection.customerFeedback &&
                  attachmentParts.voicesBySection.customerFeedback.length > 0 ? (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
                        Customer feedback
                      </div>
                      <JobCardVoiceClips
                        tone="dark"
                        items={attachmentParts.voicesBySection.customerFeedback}
                      />
                    </div>
                  ) : null}
                </section>

                {/* Job checklists / service forms (wizard &quot;Add a Checklist&quot;) */}
                {(detailServiceForms.length > 0 ||
                  detailLoading ||
                  orphanChecklistVoiceKeys.length > 0) && (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                    <header className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-300">
                        <i className="fa-solid fa-list-check text-sm" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Job checklists &amp; forms
                        </div>
                        <div className="text-sm text-slate-100">
                          {detailLoading && detailServiceForms.length === 0
                            ? 'Loading…'
                            : detailServiceForms.length > 0
                              ? `${detailServiceForms.length} form${
                                  detailServiceForms.length === 1 ? '' : 's'
                                }`
                              : orphanChecklistVoiceKeys.length > 0
                                ? 'Checklist voice notes (see below)'
                                : '—'}
                        </div>
                      </div>
                    </header>
                    {detailServiceForms.length > 0 && (
                      <div className="space-y-4">
                        {detailServiceForms.map((form) => {
                          const rows = jobCardAnswerRows(form.answers);
                          const fields = Array.isArray(form.templateFields) ? form.templateFields : [];
                          return (
                            <div
                              key={form.id}
                              className="rounded-xl border border-slate-700 bg-slate-950/40 p-4"
                            >
                              <div className="text-sm font-semibold text-slate-100">
                                {form.templateName || 'Checklist'}
                              </div>
                              {rows.length === 0 ? (
                                <p className="mt-2 text-xs text-slate-500">No answers recorded.</p>
                              ) : (
                                <dl className="mt-3 space-y-2 text-sm">
                                  {rows.map(({ fieldId, value }) => {
                                    const formVoiceKey = `form_${form.id}_${fieldId}`;
                                    return (
                                      <div key={fieldId} className="grid gap-1 sm:grid-cols-3 sm:gap-3">
                                        <dt className="text-[11px] font-medium uppercase text-slate-500 sm:col-span-1">
                                          {labelForTemplateField(fields, fieldId)}
                                        </dt>
                                        <dd className="text-slate-100 sm:col-span-2 whitespace-pre-wrap">
                                          <span className="block">{value || '—'}</span>
                                          <JobCardVoiceClips
                                            tone="dark"
                                            items={attachmentParts.voicesBySection[formVoiceKey]}
                                          />
                                        </dd>
                                      </div>
                                    );
                                  })}
                                </dl>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {orphanChecklistVoiceKeys.length > 0 && (
                      <div className="mt-4 rounded-xl border border-dashed border-slate-600 bg-slate-950/30 p-4">
                        <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
                          Other checklist recordings
                        </div>
                        <p className="mb-3 text-[10px] text-slate-500">
                          Saved under a different form instance id than on the server; audio is still shown
                          here.
                        </p>
                        <div className="space-y-4">
                          {orphanChecklistVoiceKeys.map((key) => (
                            <div key={key}>
                              <div className="text-[10px] font-medium text-slate-400 mb-1">
                                {labelOrphanFormVoiceKey(detailServiceForms, key)}
                              </div>
                              <JobCardVoiceClips
                                tone="dark"
                                items={attachmentParts.voicesBySection[key]}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!detailLoading &&
                      detailServiceForms.length === 0 &&
                      orphanChecklistVoiceKeys.length === 0 && (
                        <p className="text-xs text-slate-500">No checklists attached to this job card.</p>
                      )}
                  </section>
                )}

                {/* Stock & materials (wizard stock step) */}
                {(parseJsonArrayLoose(selectedJobCard.stockUsed).length > 0 ||
                  parseJsonArrayLoose(selectedJobCard.materialsBought).length > 0) && (
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                    <header className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-300">
                        <i className="fa-solid fa-boxes-stacked text-sm" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Stock &amp; materials
                        </div>
                        <div className="text-sm text-slate-100">
                          Inventory usage and purchases
                        </div>
                      </div>
                    </header>
                    {parseJsonArrayLoose(selectedJobCard.stockUsed).length > 0 && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase text-slate-500 mb-2">
                          Stock used
                        </div>
                        <ul className="space-y-2 text-sm text-slate-100">
                          {parseJsonArrayLoose(selectedJobCard.stockUsed).map((item, idx) => (
                            <li
                              key={item.id || idx}
                              className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2"
                            >
                              <div className="font-medium">{item.itemName || item.sku || 'Item'}</div>
                              <div className="mt-0.5 text-xs text-slate-400">
                                {[item.locationName, item.sku ? `SKU ${item.sku}` : null, item.quantity != null ? `Qty ${item.quantity}` : null]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {parseJsonArrayLoose(selectedJobCard.materialsBought).length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase text-slate-500">
                            Materials bought
                          </div>
                          <div className="text-xs font-semibold text-amber-200">
                            {typeof selectedJobCard.totalMaterialsCost === 'number'
                              ? `Total R ${selectedJobCard.totalMaterialsCost.toFixed(2)}`
                              : null}
                          </div>
                        </div>
                        <ul className="space-y-2 text-sm text-slate-100">
                          {parseJsonArrayLoose(selectedJobCard.materialsBought).map((item, idx) => (
                            <li
                              key={item.id || idx}
                              className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2"
                            >
                              <div className="font-medium">{item.itemName || 'Material'}</div>
                              {item.description && (
                                <div className="mt-0.5 text-xs text-slate-400">{item.description}</div>
                              )}
                              {item.reason && (
                                <div className="mt-0.5 text-xs text-slate-500">Reason: {item.reason}</div>
                              )}
                              <div className="mt-1 text-xs font-semibold text-slate-200">
                                {item.cost != null ? `R ${Number(item.cost).toFixed(2)}` : '—'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                )}

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

                {/* Photos & videos only (voice notes appear under their sections above) */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-500/10 text-pink-300">
                        <i className="fa-regular fa-image text-sm" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Photos &amp; videos
                        </div>
                        <div className="text-sm text-slate-100">
                          {detailAttachmentsLoading ? (
                            <span className="text-slate-400">Loading…</span>
                          ) : (
                            <>
                              {attachmentParts.visualItems.length} visual attachment
                              {attachmentParts.visualItems.length === 1 ? '' : 's'}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </header>
                  {detailAttachmentsLoading ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 px-4 py-8 text-center">
                      <i className="fa-solid fa-spinner fa-spin text-slate-500 text-xl mb-2" />
                      <p className="text-sm text-slate-400">Loading attachments…</p>
                    </div>
                  ) : attachmentParts.visualItems.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {attachmentParts.visualItems.map((item) => {
                        const { idx } = item;
                        if (item.safetyCulture) {
                          return (
                            <JobCardSafetyCultureThumbnail
                              key={`sc-${item.mediaId}-${idx}`}
                              mediaId={item.mediaId}
                              token={item.token}
                              mediaType={item.mediaType}
                              filename={item.filename}
                              issueId={item.issueId}
                              idx={idx}
                            />
                          );
                        }
                        const { url } = item;
                        if (url && jobCardAttachmentUrlIsVideo(url)) {
                          return (
                            <div
                              key={idx}
                              className="overflow-hidden rounded-xl border border-slate-700 bg-black"
                            >
                              <video
                                src={url}
                                className="max-h-64 w-full object-contain"
                                controls
                                playsInline
                                preload="metadata"
                              />
                            </div>
                          );
                        }
                        return (
                          <figure
                            key={idx}
                            className="group relative overflow-hidden rounded-xl bg-slate-800"
                          >
                            <img
                              src={url}
                              alt={`Job card photo ${idx + 1}`}
                              className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                              loading="lazy"
                              decoding="async"
                            />
                          </figure>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 px-4 py-8 text-center">
                      <i className="fa-regular fa-image text-slate-500 text-xl mb-2" />
                      <p className="text-sm text-slate-300">
                        No photos or videos attached.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Voice notes are listed next to the relevant visit, work, or checklist fields.
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
                  setDetailServiceForms([]);
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
    window.JobCardVoiceClips = JobCardVoiceClips;
    window.JobCardSafetyCultureThumbnail = JobCardSafetyCultureThumbnail;
    window.JobCardAttachmentUtils = {
      parseJsonArrayLoose,
      jobCardAnswerRows,
      labelForTemplateField,
      labelOrphanFormVoiceKey,
      partitionJobCardAttachments,
      jobCardAttachmentUrlIsVideo
    };
    window.dispatchEvent(new Event('jobcardsComponentReady'));
  }
} catch (error) {
  console.error('❌ JobCards.jsx: Error registering global component:', error);
}

export default JobCards;



