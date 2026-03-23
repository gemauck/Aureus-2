/**
 * Greenfield ERP Calendar + Google Calendar (read/write via OAuth).
 * Month, week, and day views. Does not use legacy dashboard Calendar.
 */
const { useState, useEffect, useCallback, useMemo, useRef } = React;

const TZ = 'Africa/Johannesburg';
const GRID_HOUR_START = 6;
const GRID_HOUR_END = 22;
const PX_PER_HOUR = 44;

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

function dayBounds(day) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  return { start, end };
}

/** @returns {{ id: string, source: 'erp'|'google', title: string, start: Date, end: Date, allDay: boolean, raw: any } | null} */
function normalizeGoogleEvent(e) {
  const s = e.start;
  const en = e.end;
  if (!s) return null;
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(String(s));
  let start;
  let end;
  if (allDay) {
    const [y, mo, d] = String(s).split('-').map(Number);
    start = new Date(y, mo - 1, d, 0, 0, 0, 0);
    const endStr = en || s;
    const [ey, em, ed] = String(endStr).split('-').map(Number);
    const endExclusive = new Date(ey, em - 1, ed, 0, 0, 0, 0);
    end = new Date(endExclusive.getTime() - 1);
  } else {
    start = new Date(s);
    end = en ? new Date(en) : new Date(start.getTime() + 3600000);
  }
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    id: `g-${e.id}`,
    source: 'google',
    title: e.summary || '(No title)',
    start,
    end,
    allDay,
    raw: e
  };
}

function normalizeErpEvent(e) {
  return {
    id: e.id,
    source: 'erp',
    title: e.title,
    start: new Date(e.startUtc),
    end: new Date(e.endUtc),
    allDay: false,
    raw: e
  };
}

/** Event overlaps local calendar day */
function eventOverlapsDay(ev, day) {
  const { start: d0, end: d1 } = dayBounds(day);
  return ev.start <= d1 && ev.end >= d0;
}

/** Clip event to local day; returns new object or null */
function clipEventToDay(ev, day) {
  const { start: d0, end: d1 } = dayBounds(day);
  const s = ev.start < d0 ? d0 : ev.start;
  const en = ev.end > d1 ? d1 : ev.end;
  if (en <= s) return null;
  return { ...ev, start: s, end: en };
}

function windowMinutes() {
  return {
    w0: GRID_HOUR_START * 60,
    w1: GRID_HOUR_END * 60,
    total: (GRID_HOUR_END - GRID_HOUR_START) * 60
  };
}

function minutesSinceMidnight(d) {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Layout timed (non-all-day) clipped event in grid window */
function layoutTimedBlock(clipped) {
  if (clipped.allDay) return null;
  const { w0, w1, total } = windowMinutes();
  const sm = minutesSinceMidnight(clipped.start);
  const em = minutesSinceMidnight(clipped.end);
  const clipStart = Math.max(sm, w0);
  const clipEnd = Math.min(em, w1);
  if (clipEnd <= clipStart) return null;
  return {
    topPct: ((clipStart - w0) / total) * 100,
    heightPct: ((clipEnd - clipStart) / total) * 100
  };
}

function isoLocal(dt) {
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const day = pad2(dt.getDate());
  const h = pad2(dt.getHours());
  const mi = pad2(dt.getMinutes());
  return `${y}-${m}-${day}T${h}:${mi}`;
}

/** Google all-day end.date is exclusive; convert to inclusive YYYY-MM-DD for form */
function exclusiveEndToInclusiveYmd(ymdExclusive) {
  const [y, m, d] = String(ymdExclusive).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function stripGoogleIdPrefix(id) {
  return String(id || '').replace(/^g-/, '');
}

function splitEmailList(v) {
  return String(v || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function htmlToPlainText(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = String(html);
  return tmp.textContent || tmp.innerText || '';
}

function fmtMailDate(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleString();
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

  const [viewMode, setViewMode] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => new Date());
  const [erpEvents, setErpEvents] = useState([]);
  const [googleEvents, setGoogleEvents] = useState([]);
  const [connected, setConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSync, setFormSync] = useState(true);
  const [saving, setSaving] = useState(false);

  const [googleModalOpen, setGoogleModalOpen] = useState(false);
  const [googleModalLoading, setGoogleModalLoading] = useState(false);
  const [googleSaving, setGoogleSaving] = useState(false);
  const [googleEventId, setGoogleEventId] = useState(null);
  const [gTitle, setGTitle] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gLocation, setGLocation] = useState('');
  const [gAllDay, setGAllDay] = useState(false);
  const [gTimedStart, setGTimedStart] = useState('');
  const [gTimedEnd, setGTimedEnd] = useState('');
  const [gDateStart, setGDateStart] = useState('');
  const [gDateEndInclusive, setGDateEndInclusive] = useState('');
  const [gAttendees, setGAttendees] = useState('');
  const [gScope, setGScope] = useState('instance');
  const [gRecurringEventId, setGRecurringEventId] = useState(null);
  const [gHtmlLink, setGHtmlLink] = useState(null);
  const [gHangoutLink, setGHangoutLink] = useState(null);
  const [gAddMeet, setGAddMeet] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState('calendar');

  const [mailLabels, setMailLabels] = useState([]);
  const [mailLabelFilter, setMailLabelFilter] = useState('INBOX');
  const [mailQuery, setMailQuery] = useState('');
  const [mailMessages, setMailMessages] = useState([]);
  const [mailNextPageToken, setMailNextPageToken] = useState(null);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailSelectedId, setMailSelectedId] = useState(null);
  const [mailThread, setMailThread] = useState([]);
  const [mailThreadLoading, setMailThreadLoading] = useState(false);
  const [mailExpandedIds, setMailExpandedIds] = useState([]);
  const [mailSelectedIds, setMailSelectedIds] = useState([]);
  const [mailFromFilter, setMailFromFilter] = useState('');
  const [mailSubjectFilter, setMailSubjectFilter] = useState('');
  const [mailAfterFilter, setMailAfterFilter] = useState('');
  const [mailBeforeFilter, setMailBeforeFilter] = useState('');
  const [mailHasAttachment, setMailHasAttachment] = useState(false);
  const [mailLoadingMore, setMailLoadingMore] = useState(false);
  const [mailActionBusy, setMailActionBusy] = useState(false);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [mailDrafts, setMailDrafts] = useState([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeMode, setComposeMode] = useState('new');
  const [composeDraftId, setComposeDraftId] = useState('');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [composeBcc, setComposeBcc] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeHtmlBody, setComposeHtmlBody] = useState('');
  const [composeInReplyTo, setComposeInReplyTo] = useState('');
  const [composeReferences, setComposeReferences] = useState('');
  const [composeThreadId, setComposeThreadId] = useState('');
  const [composeAttachments, setComposeAttachments] = useState([]);
  const [composeSavingDraft, setComposeSavingDraft] = useState(false);
  const [mailSending, setMailSending] = useState(false);
  const attachmentInputRef = useRef(null);

  const token = () => window.storage?.getToken?.();

  const queryRange = useMemo(() => {
    if (viewMode === 'month') {
      const y = cursor.getFullYear();
      const m = cursor.getMonth();
      const first = new Date(y, m, 1);
      const gridStart = startOfWeek(first);
      gridStart.setHours(0, 0, 0, 0);
      const lastCell = addDays(gridStart, 41);
      const end = new Date(lastCell.getFullYear(), lastCell.getMonth(), lastCell.getDate(), 23, 59, 59, 999);
      return { start: gridStart, end };
    }
    if (viewMode === 'week') {
      const ws = startOfWeek(selected);
      const dayStart = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate(), 0, 0, 0, 0);
      const last = addDays(ws, 6);
      const end = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
      return { start: dayStart, end };
    }
    const d = selected;
    const ds = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const de = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    return { start: ds, end: de };
  }, [viewMode, cursor, selected]);

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

  const loadEventsForRange = useCallback(
    async (start, end) => {
      const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      const gqs = `timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;
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
      return {
        erp: Array.isArray(dE.events) ? dE.events : [],
        google: Array.isArray(dG.events) ? dG.events : [],
        connected: !!dG.connected
      };
    },
    []
  );

  const reloadCalendar = useCallback(
    async (opts) => {
      const silent = opts && opts.silent === true;
      if (!silent) {
        setLoading(true);
        setErr(null);
      }
      try {
        const { start, end } = queryRange;
        const out = await loadEventsForRange(start, end);
        setErpEvents(out.erp);
        setGoogleEvents(out.google);
        setConnected(out.connected);
      } catch (e) {
        if (!silent) {
          setErr(e.message || 'Failed to load calendar');
          setErpEvents([]);
          setGoogleEvents([]);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [queryRange, loadEventsForRange]
  );

  useEffect(() => {
    loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    reloadCalendar();
  }, [reloadCalendar]);

  useEffect(() => {
    const onMsg = (ev) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === 'ERP_CALENDAR_OAUTH_OK') {
        loadConnection();
        reloadCalendar();
      }
      if (ev.data?.type === 'ERP_CALENDAR_OAUTH_ERR') {
        setErr(ev.data.message || 'Google connection failed');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadConnection, reloadCalendar]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        reloadCalendar({ silent: true });
      }
    };
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        reloadCalendar({ silent: true });
      }
    }, 120000);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reloadCalendar]);

  const normalizedEvents = useMemo(() => {
    const list = [];
    erpEvents.forEach((e) => list.push(normalizeErpEvent(e)));
    googleEvents.forEach((e) => {
      const n = normalizeGoogleEvent(e);
      if (n) list.push(n);
    });
    return list;
  }, [erpEvents, googleEvents]);

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
    reloadCalendar();
  };

  const loadMailLabels = useCallback(async () => {
    try {
      const r = await fetch('/api/erp-mail/labels', {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Failed to load labels');
      }
      const labels = j?.data?.labels || [];
      setMailLabels(Array.isArray(labels) ? labels : []);
    } catch (e) {
      setErr(e.message || 'Failed to load labels');
    }
  }, []);

  const loadMailMessages = useCallback(
    async (opts) => {
      const append = !!opts?.append;
      const nextToken = append ? mailNextPageToken : null;
      if (append) setMailLoadingMore(true);
      else setMailLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('labelIds', mailLabelFilter || 'INBOX');
        if (mailQuery.trim()) params.set('q', mailQuery.trim());
        if (mailFromFilter.trim()) params.set('from', mailFromFilter.trim());
        if (mailSubjectFilter.trim()) params.set('subject', mailSubjectFilter.trim());
        if (mailAfterFilter) params.set('after', mailAfterFilter);
        if (mailBeforeFilter) params.set('before', mailBeforeFilter);
        if (mailHasAttachment) params.set('hasAttachment', '1');
        if (nextToken) params.set('pageToken', nextToken);
        params.set('maxResults', '30');
        const r = await fetch(`/api/erp-mail/messages?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token()}` }
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Failed to load messages');
        }
        const rows = j?.data?.messages || [];
        setMailMessages((prev) => {
          const nextRows = append ? prev.concat(rows) : rows;
          if (
            prev.length === nextRows.length &&
            prev.every((item, idx) => item?.id === nextRows[idx]?.id)
          ) {
            return prev;
          }
          return nextRows;
        });
        setMailNextPageToken(j?.data?.nextPageToken || null);
      } catch (e) {
        setErr(e.message || 'Failed to load messages');
      } finally {
        if (append) setMailLoadingMore(false);
        else setMailLoading(false);
      }
    },
    [
      mailLabelFilter,
      mailQuery,
      mailFromFilter,
      mailSubjectFilter,
      mailAfterFilter,
      mailBeforeFilter,
      mailHasAttachment,
      mailNextPageToken
    ]
  );

  const loadMailDrafts = useCallback(async () => {
    try {
      const r = await fetch('/api/erp-mail/drafts?maxResults=30', {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Failed to load drafts');
      const drafts = Array.isArray(j?.data?.drafts) ? j.data.drafts : [];
      setMailDrafts(drafts);
    } catch (e) {
      setErr(e.message || 'Failed to load drafts');
    }
  }, []);

  useEffect(() => {
    if (workspaceTab !== 'mail') return;
    loadMailLabels();
    loadMailMessages({});
  }, [workspaceTab, loadMailLabels, loadMailMessages]);

  useEffect(() => {
    if (!draftsOpen) return;
    loadMailDrafts();
  }, [draftsOpen, loadMailDrafts]);

  const loadMailThread = useCallback(async (threadId, selectedId) => {
    if (!threadId) return;
    setMailThreadLoading(true);
    try {
      const r = await fetch(`/api/erp-mail/thread?id=${encodeURIComponent(threadId)}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Failed to load thread');
      const msgs = j?.data?.messages || [];
      setMailThread(Array.isArray(msgs) ? msgs : []);
      setMailExpandedIds((msgs || []).map((m) => m.id).filter(Boolean));
      setMailSelectedId(selectedId || (msgs[0] && msgs[0].id) || null);
    } catch (e) {
      setErr(e.message || 'Failed to load thread');
      setMailThread([]);
    } finally {
      setMailThreadLoading(false);
    }
  }, []);

  const openCompose = (replyTo, mode = 'new') => {
    setComposeMode(mode);
    setComposeDraftId('');
    setComposeAttachments([]);
    setComposeInReplyTo('');
    setComposeReferences('');
    if (replyTo) {
      const prefix = mode === 'forward' ? 'Fwd:' : 'Re:';
      setComposeTo(mode === 'forward' ? '' : replyTo.from || '');
      setComposeSubject(replyTo.subject?.toLowerCase().startsWith(prefix.toLowerCase()) ? replyTo.subject : `${prefix} ${replyTo.subject || ''}`);
      setComposeThreadId(replyTo.threadId || '');
      setComposeInReplyTo(replyTo.messageId || '');
      setComposeReferences(replyTo.references || replyTo.messageId || '');
      const quoted = `\n\n--- Original message ---\nFrom: ${replyTo.from || ''}\nDate: ${replyTo.date || ''}\n\n${replyTo.bodyText || ''}`;
      setComposeBody(quoted);
      setComposeHtmlBody(`<p><br/></p><hr/><p><strong>From:</strong> ${replyTo.from || ''}</p><p><strong>Date:</strong> ${replyTo.date || ''}</p><blockquote>${(replyTo.bodyHtml || replyTo.bodyText || '').replace(/\n/g, '<br/>')}</blockquote>`);
    } else {
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setComposeHtmlBody('');
      setComposeThreadId('');
    }
    setComposeCc('');
    setComposeBcc('');
    setComposeOpen(true);
  };

  const openDraft = async (draftId) => {
    try {
      const r = await fetch(`/api/erp-mail/drafts?id=${encodeURIComponent(draftId)}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Failed to open draft');
      const msg = j?.data?.message || {};
      setComposeMode('draft');
      setComposeDraftId(draftId);
      setComposeTo(msg.to || '');
      setComposeCc(msg.cc || '');
      setComposeBcc(msg.bcc || '');
      setComposeSubject(msg.subject || '');
      setComposeBody(msg.bodyText || '');
      setComposeHtmlBody(msg.bodyHtml || '');
      setComposeThreadId(msg.threadId || '');
      setComposeInReplyTo(msg.inReplyTo || '');
      setComposeReferences(msg.references || '');
      setComposeAttachments(Array.isArray(msg.attachments) ? [] : []);
      setComposeOpen(true);
    } catch (e) {
      setErr(e.message || 'Failed to open draft');
    }
  };

  const downloadAttachment = async (messageId, att) => {
    if (!messageId || !att?.attachmentId) return;
    try {
      const qs = new URLSearchParams({
        messageId,
        attachmentId: att.attachmentId,
        filename: att.filename || 'attachment',
        mimeType: att.mimeType || 'application/octet-stream'
      });
      const r = await fetch(`/api/erp-mail/attachment?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Attachment download failed');
      const d = j?.data || {};
      const bin = atob(String(d.dataBase64 || '').replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: d.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e.message || 'Attachment download failed');
    }
  };

  const onPickAttachments = async (ev) => {
    const files = Array.from(ev.target?.files || []);
    if (!files.length) return;
    const loaded = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || '');
              const contentBase64 = result.includes(',') ? result.split(',')[1] : '';
              resolve({
                id: `${file.name}-${file.size}-${Date.now()}`,
                filename: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size || 0,
                contentBase64
              });
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          })
      )
    );
    setComposeAttachments((prev) => prev.concat(loaded.filter(Boolean)));
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const sendMail = async () => {
    if (!composeTo.trim()) {
      alert('Recipient is required');
      return;
    }
    setMailSending(true);
    try {
      const r = await fetch('/api/erp-mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: composeTo.trim(),
          cc: composeCc.trim(),
          bcc: composeBcc.trim(),
          subject: composeSubject.trim(),
          textBody: composeBody || htmlToPlainText(composeHtmlBody),
          htmlBody: composeHtmlBody || undefined,
          threadId: composeThreadId || undefined,
          inReplyTo: composeInReplyTo || undefined,
          references: composeReferences || undefined,
          attachments: composeAttachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            contentBase64: a.contentBase64
          }))
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Send failed');
      setComposeOpen(false);
      setComposeAttachments([]);
      loadMailMessages({});
    } catch (e) {
      alert(e.message || 'Failed to send email');
    } finally {
      setMailSending(false);
    }
  };

  const saveDraft = async () => {
    setComposeSavingDraft(true);
    try {
      const r = await fetch('/api/erp-mail/drafts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'save',
          id: composeDraftId || undefined,
          to: composeTo.trim(),
          cc: composeCc.trim(),
          bcc: composeBcc.trim(),
          subject: composeSubject.trim(),
          textBody: composeBody || htmlToPlainText(composeHtmlBody),
          htmlBody: composeHtmlBody || undefined,
          threadId: composeThreadId || undefined,
          inReplyTo: composeInReplyTo || undefined,
          references: composeReferences || undefined,
          attachments: composeAttachments.map((a) => ({
            filename: a.filename,
            mimeType: a.mimeType,
            contentBase64: a.contentBase64
          }))
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.details || j?.error?.message || j?.message || 'Failed to save draft');
      const draftId = j?.data?.draft?.id || '';
      if (draftId) setComposeDraftId(draftId);
      setComposeMode('draft');
      loadMailDrafts();
    } catch (e) {
      setErr(e.message || 'Failed to save draft');
    } finally {
      setComposeSavingDraft(false);
    }
  };

  const modifyMailMessage = async (id, addLabelIds, removeLabelIds) => {
    try {
      await fetch('/api/erp-mail/modify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id, addLabelIds, removeLabelIds })
      });
    } catch (_) {}
  };

  const runBulkModify = async (addLabelIds, removeLabelIds) => {
    if (!mailSelectedIds.length) return;
    setMailActionBusy(true);
    try {
      await fetch('/api/erp-mail/modify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: mailSelectedIds, addLabelIds, removeLabelIds })
      });
      await loadMailMessages({});
      setMailSelectedIds([]);
    } catch (e) {
      setErr(e.message || 'Bulk action failed');
    } finally {
      setMailActionBusy(false);
    }
  };

  const promptApplyLabel = async () => {
    if (!mailSelectedIds.length) return;
    const options = mailLabels.map((l) => `${l.id}:${l.name}`).join('\n');
    const value = prompt(`Enter Gmail label ID to apply to selected messages:\n${options}`);
    const labelId = String(value || '').trim();
    if (!labelId) return;
    await runBulkModify([labelId], []);
  };

  const trashMailMessage = async (id) => {
    const ids = id ? [id] : mailSelectedIds;
    if (!ids.length) return;
    try {
      await Promise.all(
        ids.map((x) =>
          fetch('/api/erp-mail/trash', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token()}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id: x })
          })
        )
      );
      setMailMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
      setMailThread((prev) => prev.filter((m) => !ids.includes(m.id)));
      setMailSelectedIds([]);
    } catch (_) {}
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
      const erp = erpEvents.filter((e) => {
        const s = new Date(e.startUtc);
        const en = new Date(e.endUtc);
        const { start: d0, end: d1 } = dayBounds(day);
        return s <= d1 && en >= d0;
      });
      const g = googleEvents
        .map((e) => normalizeGoogleEvent(e))
        .filter(Boolean)
        .filter((ev) => eventOverlapsDay(ev, day))
        .map((ev) => ev.raw);
      return { erp, google: g };
    },
    [erpEvents, googleEvents]
  );

  const selectedBuckets = useMemo(() => eventsForDay(selected), [selected, eventsForDay]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingEventId(null);
  };

  const openCreateModal = () => {
    const d = new Date(selected);
    d.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(10, 0, 0, 0);
    setEditingEventId(null);
    setFormTitle('');
    setFormDesc('');
    setFormStart(isoLocal(d));
    setFormEnd(isoLocal(end));
    setFormSync(connected);
    setModalOpen(true);
  };

  const openCreateModalFromSlot = (day, hour) => {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0, 0, 0);
    const end = new Date(d);
    end.setHours(hour + 1, 0, 0, 0);
    setEditingEventId(null);
    setFormTitle('');
    setFormDesc('');
    setFormStart(isoLocal(d));
    setFormEnd(isoLocal(end));
    setFormSync(connected);
    setModalOpen(true);
  };

  const openEditErpModal = (e) => {
    setEditingEventId(e.id);
    setFormTitle(e.title || '');
    setFormDesc(e.description || '');
    setFormStart(isoLocal(new Date(e.startUtc)));
    setFormEnd(isoLocal(new Date(e.endUtc)));
    setFormSync(connected && !!e.googleEventId);
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
      if (editingEventId) {
        const r = await fetch('/api/erp-calendar/erp-events', {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token()}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: editingEventId,
            title: formTitle.trim(),
            description: formDesc.trim(),
            start: start.toISOString(),
            end: end.toISOString(),
            timezone: TZ,
            syncToGoogle: connected && formSync
          })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.data?.message || j?.message || 'Update failed');
      } else {
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
      }
      closeModal();
      reloadCalendar();
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
    reloadCalendar();
  };

  const closeGoogleModal = () => {
    setGoogleModalOpen(false);
    setGoogleEventId(null);
    setGoogleModalLoading(false);
  };

  const populateGoogleFormFromApi = (ev) => {
    setGTitle(ev.summary || '');
    setGDesc(ev.description || '');
    setGLocation(ev.location || '');
    setGHtmlLink(ev.htmlLink || null);
    setGHangoutLink(ev.hangoutLink || null);
    setGRecurringEventId(ev.recurringEventId || null);
    setGScope('instance');
    setGAddMeet(false);
    setGAttendees((ev.attendees || []).map((a) => a.email).filter(Boolean).join(', '));

    if (ev.allDay && ev.start?.date) {
      setGAllDay(true);
      setGDateStart(ev.start.date);
      const endEx = ev.end?.date || ev.start.date;
      setGDateEndInclusive(exclusiveEndToInclusiveYmd(endEx));
    } else {
      setGAllDay(false);
      const s = ev.start?.dateTime ? new Date(ev.start.dateTime) : new Date();
      const en = ev.end?.dateTime ? new Date(ev.end.dateTime) : new Date(s.getTime() + 3600000);
      setGTimedStart(isoLocal(s));
      setGTimedEnd(isoLocal(en));
    }
  };

  const openGoogleModal = async (rawOrId) => {
    const id = stripGoogleIdPrefix(typeof rawOrId === 'string' ? rawOrId : rawOrId?.id);
    if (!id || !connected) return;
    setGoogleModalOpen(true);
    setGoogleModalLoading(true);
    setGoogleEventId(id);
    setErr(null);
    try {
      const r = await fetch(`/api/erp-calendar/google-event?id=${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const j = await r.json();
      if (!r.ok) {
        const msg = j?.error?.message || j?.message || `Failed (${r.status})`;
        throw new Error(msg);
      }
      const ev = j.data?.event || j.data;
      if (!ev) throw new Error('No event data');
      populateGoogleFormFromApi(ev);
    } catch (e) {
      setErr(e.message || 'Failed to load Google event');
      setGoogleModalOpen(false);
    } finally {
      setGoogleModalLoading(false);
    }
  };

  const saveGoogleEvent = async () => {
    if (!googleEventId || !gTitle.trim()) {
      alert('Title is required');
      return;
    }
    const body = {
      id: googleEventId,
      recurringEventId: gRecurringEventId,
      scope: gRecurringEventId && gScope === 'series' ? 'series' : 'instance',
      summary: gTitle.trim(),
      description: gDesc.trim(),
      location: gLocation.trim(),
      allDay: gAllDay,
      sendUpdates: 'all'
    };
    if (gAllDay) {
      if (!gDateStart || !gDateEndInclusive) {
        alert('Start and end dates are required for all-day events');
        return;
      }
      body.startDate = gDateStart;
      body.endInclusiveDate = gDateEndInclusive;
    } else {
      const s = new Date(gTimedStart);
      const en = new Date(gTimedEnd);
      if (!(en > s)) {
        alert('End must be after start');
        return;
      }
      body.start = s.toISOString();
      body.end = en.toISOString();
    }
    if (gAttendees.trim()) {
      body.attendees = gAttendees.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
    }
    if (gAddMeet) body.addMeet = true;

    setGoogleSaving(true);
    try {
      const r = await fetch('/api/erp-calendar/google-event', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || j?.message || 'Update failed');
      closeGoogleModal();
      reloadCalendar({ silent: true });
    } catch (e) {
      alert(e.message || 'Failed to save');
    } finally {
      setGoogleSaving(false);
    }
  };

  const deleteGoogleEvent = async () => {
    if (!googleEventId) return;
    if (!confirm('Delete this Google Calendar event? Attendees may be notified.')) return;
    setGoogleSaving(true);
    try {
      const r = await fetch(
        `/api/erp-calendar/google-event?id=${encodeURIComponent(googleEventId)}&sendUpdates=all`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token()}` } }
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || j?.message || 'Delete failed');
      closeGoogleModal();
      reloadCalendar({ silent: true });
    } catch (e) {
      alert(e.message || 'Failed to delete');
    } finally {
      setGoogleSaving(false);
    }
  };

  const goPrev = () => {
    if (viewMode === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      const n = addDays(selected, -7);
      setSelected(n);
      setCursor(n);
    } else {
      const n = addDays(selected, -1);
      setSelected(n);
      setCursor(n);
    }
  };

  const goNext = () => {
    if (viewMode === 'month') {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      const n = addDays(selected, 7);
      setSelected(n);
      setCursor(n);
    } else {
      const n = addDays(selected, 1);
      setSelected(n);
      setCursor(n);
    }
  };

  const goToday = () => {
    const t = new Date();
    setCursor(t);
    setSelected(t);
  };

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') {
      return cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      const ws = startOfWeek(selected);
      const we = addDays(ws, 6);
      if (ws.getMonth() === we.getMonth()) {
        return `${ws.getDate()}–${we.getDate()} ${ws.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`;
      }
      return `${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }
    return selected.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [viewMode, cursor, selected]);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(selected);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(ws, i));
    return days;
  }, [selected]);

  const displayWeekDays = viewMode === 'day' ? [new Date(selected)] : weekDays;

  const hourRows = useMemo(() => {
    const h = [];
    for (let hr = GRID_HOUR_START; hr < GRID_HOUR_END; hr++) h.push(hr);
    return h;
  }, []);

  const gridBodyHeight = (GRID_HOUR_END - GRID_HOUR_START) * PX_PER_HOUR;

  const shell = isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';
  const card = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const segBtn = (active) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-indigo-600 text-white'
        : isDark
          ? 'text-gray-300 hover:bg-gray-700'
          : 'text-gray-700 hover:bg-gray-100'
    }`;

  const renderAllDayChips = (day) => {
    const chips = normalizedEvents.filter((ev) => ev.allDay && eventOverlapsDay(ev, day));
    return (
      <div className={`min-h-[2rem] flex flex-wrap gap-1 p-1 border-b ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-100 bg-gray-50'}`}>
        {chips.length === 0 ? <span className={`text-xs ${muted} px-1`}> </span> : null}
        {chips.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (ev.source === 'erp') openEditErpModal(ev.raw);
              else openGoogleModal(ev.raw.id);
            }}
            className={`text-xs px-1.5 py-0.5 rounded truncate max-w-full ${
              ev.source === 'erp'
                ? isDark
                  ? 'bg-indigo-900/80 text-indigo-100'
                  : 'bg-indigo-100 text-indigo-900'
                : isDark
                  ? 'bg-green-900/60 text-green-100'
                  : 'bg-green-100 text-green-900'
            }`}
            title={ev.title}
          >
            {ev.source === 'google' && <i className="fab fa-google mr-0.5" />}
            {ev.title}
          </button>
        ))}
      </div>
    );
  };

  const renderTimedColumn = (day) => (
    <div
      className={`relative border-l ${isDark ? 'border-gray-700' : 'border-gray-200'}`}
      style={{ height: gridBodyHeight }}
    >
      {hourRows.map((hr) => (
        <button
          key={hr}
          type="button"
          aria-label={`${day.toDateString()} ${hr}:00`}
          className={`absolute left-0 right-0 border-b ${isDark ? 'border-gray-700/80 hover:bg-gray-700/20' : 'border-gray-100 hover:bg-gray-50'}`}
          style={{ top: `${((hr - GRID_HOUR_START) / (GRID_HOUR_END - GRID_HOUR_START)) * 100}%`, height: `${100 / (GRID_HOUR_END - GRID_HOUR_START)}%` }}
          onClick={() => openCreateModalFromSlot(day, hr)}
        />
      ))}
      {normalizedEvents
        .filter((ev) => !ev.allDay)
        .map((ev) => {
          const clipped = clipEventToDay(ev, day);
          if (!clipped) return null;
          const layout = layoutTimedBlock(clipped);
          if (!layout) return null;
          return (
            <button
              key={`${ev.id}-${day.getTime()}`}
              type="button"
              className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-left text-xs overflow-hidden z-10 shadow-sm border ${
                ev.source === 'erp'
                  ? isDark
                    ? 'bg-indigo-800/95 border-indigo-600 text-white'
                    : 'bg-indigo-100 border-indigo-200 text-indigo-900'
                  : isDark
                    ? 'bg-green-900/90 border-green-600 text-green-50'
                    : 'bg-green-50 border-green-200 text-green-900'
              }`}
              style={{ top: `${layout.topPct}%`, height: `${Math.max(layout.heightPct, 2)}%` }}
              onClick={(e) => {
                e.stopPropagation();
                if (ev.source === 'erp') openEditErpModal(ev.raw);
                else openGoogleModal(ev.raw.id);
              }}
            >
              <span className="font-medium line-clamp-2">{ev.title}</span>
            </button>
          );
        })}
    </div>
  );

  const selectedThreadMessage = useMemo(
    () => mailThread.find((m) => m.id === mailSelectedId) || mailThread[mailThread.length - 1] || null,
    [mailThread, mailSelectedId]
  );
  const mailUnreadTotal = useMemo(
    () =>
      (mailLabels || []).reduce(
        (sum, l) => sum + (Number.isFinite(Number(l?.messagesUnread)) ? Number(l.messagesUnread) : 0),
        0
      ),
    [mailLabels]
  );

  const renderMailWorkspace = () => {
    const allSelected = !!mailMessages.length && mailSelectedIds.length === mailMessages.length;
    return (
      <div className={`rounded-xl border shadow-sm ${card}`}>
        <div className={`p-3 border-b space-y-2 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => openCompose(null, 'new')} className="px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700">
              <i className="fas fa-pen mr-1" /> New mail
            </button>
            <button type="button" disabled={!selectedThreadMessage} onClick={() => openCompose(selectedThreadMessage, 'reply')} className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Reply</button>
            <button type="button" disabled={!selectedThreadMessage} onClick={() => openCompose(selectedThreadMessage, 'forward')} className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Forward</button>
            <button type="button" disabled={!mailSelectedIds.length || mailActionBusy} onClick={() => runBulkModify([], ['UNREAD'])} className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Mark read</button>
            <button type="button" disabled={!mailSelectedIds.length || mailActionBusy} onClick={() => runBulkModify(['UNREAD'], [])} className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Mark unread</button>
            <button type="button" disabled={!mailSelectedIds.length || mailActionBusy} onClick={() => runBulkModify(['STARRED'], [])} className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Add star</button>
            <button type="button" disabled={!mailSelectedIds.length || mailActionBusy} onClick={promptApplyLabel} className={`px-3 py-1.5 rounded-lg text-sm border disabled:opacity-50 ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Apply label</button>
            <button type="button" disabled={!mailSelectedIds.length} onClick={() => trashMailMessage()} className="px-3 py-1.5 rounded-lg text-sm border border-red-400/50 text-red-500 disabled:opacity-50">Delete</button>
            <button type="button" onClick={() => setDraftsOpen((v) => !v)} className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>{draftsOpen ? 'Hide drafts' : 'Show drafts'}</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
            <input value={mailQuery} onChange={(e) => setMailQuery(e.target.value)} placeholder="Search text" className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`} />
            <input value={mailFromFilter} onChange={(e) => setMailFromFilter(e.target.value)} placeholder="From" className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`} />
            <input value={mailSubjectFilter} onChange={(e) => setMailSubjectFilter(e.target.value)} placeholder="Subject contains" className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`} />
            <input type="date" value={mailAfterFilter} onChange={(e) => setMailAfterFilter(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`} />
            <input type="date" value={mailBeforeFilter} onChange={(e) => setMailBeforeFilter(e.target.value)} className={`px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`} />
            <label className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}><input type="checkbox" checked={mailHasAttachment} onChange={(e) => setMailHasAttachment(e.target.checked)} />Has attachment</label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => loadMailMessages({})} className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Apply filters</button>
            <button type="button" onClick={() => { setMailQuery(''); setMailFromFilter(''); setMailSubjectFilter(''); setMailAfterFilter(''); setMailBeforeFilter(''); setMailHasAttachment(false); }} className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Clear</button>
          </div>
        </div>
        {err ? (
          <div className={`mx-3 mt-3 p-3 rounded-lg border text-sm ${isDark ? 'bg-red-900/30 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-800'}`}>{err}</div>
        ) : null}
        <div className="grid grid-cols-12 min-h-[64vh]">
          <aside className={`col-span-12 md:col-span-2 border-r p-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`text-xs uppercase mb-2 ${muted}`}>
              Labels
              <span className="ml-1 normal-case">
                ({mailUnreadTotal} unread)
              </span>
            </div>
            <div className="space-y-1 max-h-[32vh] overflow-y-auto">
              {mailLabels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    setMailLabelFilter(l.id);
                    setMailMessages([]);
                    setMailThread([]);
                    setMailSelectedId(null);
                    setMailSelectedIds([]);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${mailLabelFilter === l.id ? (isDark ? 'bg-gray-700' : 'bg-gray-100') : ''}`}
                >
                  <span>{l.name}</span>
                  <span className={`ml-1 ${muted}`}>
                    ({Number(l.messagesUnread || 0)} unread / {Number(l.messagesTotal || 0)} total)
                  </span>
                </button>
              ))}
            </div>
            {draftsOpen ? (
              <div className="mt-4">
                <div className={`text-xs uppercase mb-2 ${muted}`}>Drafts</div>
                <div className="space-y-1 max-h-[20vh] overflow-y-auto">
                  {mailDrafts.map((d) => (
                    <button key={d.id} type="button" onClick={() => openDraft(d.id)} className={`w-full text-left px-2 py-1.5 rounded text-sm ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
                      {d.message?.id || d.id}
                    </button>
                  ))}
                  {!mailDrafts.length ? <div className={`text-xs ${muted}`}>No drafts found.</div> : null}
                </div>
              </div>
            ) : null}
          </aside>
          <section className={`col-span-12 md:col-span-5 border-r ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`px-3 py-2 text-sm border-b flex items-center justify-between ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <label className="flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={(e) => setMailSelectedIds(e.target.checked ? mailMessages.map((m) => m.id) : [])} />{mailLabelFilter}</label>
              <span className={muted}>{mailLoading ? 'Loading…' : `${mailMessages.length} messages`}</span>
            </div>
            <div className="max-h-[56vh] overflow-y-auto">
              {mailMessages.map((m) => {
                const isUnread = Array.isArray(m.labelIds) && m.labelIds.includes('UNREAD');
                const isSelected = mailSelectedIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={`grid grid-cols-12 gap-2 items-center px-3 py-2 border-b ${
                      isUnread
                        ? isDark
                          ? 'bg-blue-900/20 border-blue-800/40'
                          : 'bg-blue-50/70 border-blue-100'
                        : isDark
                          ? 'border-gray-800 hover:bg-gray-800/40'
                          : 'border-gray-100 hover:bg-gray-50'
                    } ${mailSelectedId === m.id ? (isDark ? 'ring-1 ring-blue-500/60 bg-gray-800' : 'ring-1 ring-blue-300 bg-blue-50') : ''}`}
                  >
                    <div className="col-span-1">
                      <input type="checkbox" checked={isSelected} onChange={(e) => setMailSelectedIds((prev) => (e.target.checked ? prev.concat(m.id).filter((v, i, arr) => arr.indexOf(v) === i) : prev.filter((x) => x !== m.id)))} />
                    </div>
                    <button
                      type="button"
                      className="col-span-11 text-left"
                      onClick={async () => {
                        setMailSelectedId(m.id);
                        await modifyMailMessage(m.id, [], ['UNREAD']);
                        loadMailThread(m.threadId, m.id);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className={`text-sm truncate ${isUnread ? 'font-bold' : 'font-medium'}`}>
                          {isUnread ? <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${isDark ? 'bg-blue-400' : 'bg-blue-600'}`} /> : null}
                          {m.from || '(Unknown sender)'}
                        </div>
                        <div className={`text-xs ${muted}`}>{fmtMailDate(m.date || m.internalDate)}</div>
                      </div>
                      <div className={`text-sm truncate ${isUnread ? (isDark ? 'text-blue-200 font-semibold' : 'text-blue-900 font-semibold') : ''}`}>
                        {m.subject || '(No subject)'}
                        {isUnread ? (
                          <span className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'bg-blue-800 text-blue-100' : 'bg-blue-600 text-white'}`}>
                            UNREAD
                          </span>
                        ) : null}
                      </div>
                      <div className={`text-xs truncate ${muted}`}>{m.snippet}</div>
                    </button>
                  </div>
                );
              })}
              {!mailMessages.length && !mailLoading ? <div className={`p-4 text-sm ${muted}`}>No messages.</div> : null}
            </div>
            {mailNextPageToken ? (
              <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => loadMailMessages({ append: true })} className={`w-full px-3 py-1.5 rounded text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>
                  {mailLoadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </section>
          <section className="col-span-12 md:col-span-5 p-4">
            {mailThreadLoading ? (
              <p className={muted}>Loading thread…</p>
            ) : selectedThreadMessage ? (
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-lg font-semibold">{selectedThreadMessage.subject || '(No subject)'}</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openCompose(selectedThreadMessage, 'reply')} className={`px-2 py-1 rounded text-xs border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Reply</button>
                    <button type="button" onClick={() => openCompose(selectedThreadMessage, 'forward')} className={`px-2 py-1 rounded text-xs border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Forward</button>
                    <button type="button" onClick={() => trashMailMessage(selectedThreadMessage.id)} className="px-2 py-1 rounded text-xs text-red-500 border border-red-400/40">Trash</button>
                  </div>
                </div>
                <div className="space-y-3 max-h-[54vh] overflow-y-auto pr-1">
                  {mailThread.map((m) => {
                    const expanded = mailExpandedIds.includes(m.id);
                    return (
                      <div key={m.id} className={`rounded-lg border ${mailSelectedId === m.id ? (isDark ? 'border-blue-500 bg-blue-900/10' : 'border-blue-300 bg-blue-50') : isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                        <button type="button" onClick={() => { setMailSelectedId(m.id); setMailExpandedIds((prev) => (prev.includes(m.id) ? prev.filter((x) => x !== m.id) : prev.concat(m.id))); }} className="w-full text-left p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium truncate">{m.from || '(Unknown sender)'}</div>
                            <div className={`text-xs ${muted}`}>{fmtMailDate(m.date || m.internalDate)}</div>
                          </div>
                          <div className={`text-xs truncate ${muted}`}>{m.snippet}</div>
                        </button>
                        {expanded ? (
                          <div className={`px-3 pb-3 text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                            <div className={`text-xs mb-2 ${muted}`}>To: {m.to || 'me'}</div>
                            <div className={`whitespace-pre-wrap rounded-lg p-3 border ${isDark ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>{m.bodyText || m.snippet || '(No message body)'}</div>
                            {Array.isArray(m.attachments) && m.attachments.length ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {m.attachments.map((att) => (
                                  <button key={`${m.id}-${att.attachmentId}`} type="button" onClick={() => downloadAttachment(m.id, att)} className={`px-2 py-1 rounded text-xs border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>
                                    <i className="fas fa-paperclip mr-1" />
                                    {att.filename || 'attachment'}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className={muted}>Select an email to read.</p>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${shell}`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Mail and Calendar</h1>
            <p className={`text-sm ${muted} mt-1`}>
              Unified workspace with Gmail and Google Calendar integration ({TZ}).
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

        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setWorkspaceTab('mail')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${workspaceTab === 'mail' ? 'bg-green-600 text-white' : isDark ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-700 border border-gray-300'}`}
          >
            Mail
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab('calendar')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${workspaceTab === 'calendar' ? 'bg-indigo-600 text-white' : isDark ? 'bg-gray-800 text-gray-200' : 'bg-white text-gray-700 border border-gray-300'}`}
          >
            Calendar
          </button>
        </div>

        {workspaceTab === 'mail' ? (
          renderMailWorkspace()
        ) : (
          <>
        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700 text-red-200 text-sm">{err}</div>
        )}

        <div className={`rounded-xl border shadow-sm p-4 md:p-6 ${card}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-1 rounded-lg p-1 bg-black/10 dark:bg-white/5">
              <button type="button" className={segBtn(viewMode === 'month')} onClick={() => setViewMode('month')}>
                Month
              </button>
              <button
                type="button"
                className={segBtn(viewMode === 'week')}
                onClick={() => {
                  setCursor(selected);
                  setViewMode('week');
                }}
              >
                Week
              </button>
              <button
                type="button"
                className={segBtn(viewMode === 'day')}
                onClick={() => {
                  setCursor(selected);
                  setViewMode('day');
                }}
              >
                Day
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-end">
              <button
                type="button"
                className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
                onClick={goToday}
              >
                Today
              </button>
              <button
                type="button"
                className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                onClick={goPrev}
                aria-label="Previous"
              >
                <i className="fas fa-chevron-left" />
              </button>
              <div className="text-lg font-medium min-w-[10rem] text-center">{headerLabel}</div>
              <button
                type="button"
                className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                onClick={goNext}
                aria-label="Next"
              >
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className={`text-center py-16 ${muted}`}>
              <i className="fas fa-spinner fa-spin text-2xl mb-2" />
              <p>Loading…</p>
            </div>
          ) : viewMode === 'month' ? (
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
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="flex">
                  <div className={`w-12 flex-shrink-0 ${muted} text-xs`} />
                  {displayWeekDays.map((day) => (
                    <div key={day.getTime()} className="flex-1 text-center text-xs font-medium py-2 border-b border-l border-gray-200 dark:border-gray-700">
                      <div className={sameDay(day, new Date()) ? 'text-indigo-500 font-semibold' : ''}>
                        {day.toLocaleDateString(undefined, { weekday: 'short' })}
                      </div>
                      <div className="text-sm">{day.getDate()}</div>
                    </div>
                  ))}
                </div>
                <div className="flex">
                  <div className="w-12 flex-shrink-0" />
                  {displayWeekDays.map((day) => (
                    <div key={`ad-${day.getTime()}`} className="flex-1 min-w-0">
                      {renderAllDayChips(day)}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  <div className={`w-12 flex-shrink-0 relative ${muted} text-xs`} style={{ height: gridBodyHeight }}>
                    {hourRows.map((hr) => (
                      <div
                        key={hr}
                        className="absolute right-1 text-right pr-1"
                        style={{
                          top: `${((hr - GRID_HOUR_START) / (GRID_HOUR_END - GRID_HOUR_START)) * 100}%`,
                          transform: 'translateY(-50%)'
                        }}
                      >
                        {`${pad2(hr)}:00`}
                      </div>
                    ))}
                  </div>
                  {displayWeekDays.map((day) => (
                    <div key={`col-${day.getTime()}`} className="flex-1 min-w-0">
                      {renderTimedColumn(day)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
                <button
                  type="button"
                  className="text-left flex-1"
                  onClick={() => openEditErpModal(e)}
                >
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
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        Google
                      </a>
                    )}
                  </div>
                  {e.description ? <p className={`text-sm mt-1 ${muted}`}>{e.description}</p> : null}
                </button>
                <button
                  type="button"
                  onClick={() => deleteErpEvent(e.id)}
                  className="text-red-500 hover:text-red-400 text-sm flex-shrink-0"
                >
                  Delete
                </button>
              </div>
            ))}
            {selectedBuckets.google.map((e) => (
              <div
                key={`g-${e.id}`}
                className={`p-3 rounded-lg flex items-start justify-between gap-3 ${isDark ? 'bg-gray-700/40' : 'bg-green-50'}`}
              >
                <button
                  type="button"
                  className="text-left flex-1 min-w-0"
                  onClick={() => openGoogleModal(e.id)}
                >
                  <div className="font-medium flex items-center gap-2">
                    <i className="fab fa-google text-green-600" />
                    {e.summary}
                  </div>
                  <div className={`text-sm ${muted}`}>
                    {e.start ? new Date(e.start).toLocaleString() : ''}
                  </div>
                </button>
                {e.htmlLink && (
                  <a
                    href={e.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-500 hover:underline flex-shrink-0"
                  >
                    Open in Google
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
          </>
        )}
      </div>

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-5xl rounded-xl border shadow-xl p-6 ${card}`}>
            <h3 className="text-lg font-semibold mb-4">
              {composeMode === 'forward' ? 'Forward email' : composeMode === 'reply' ? 'Reply email' : composeMode === 'draft' ? 'Edit draft' : 'Compose email'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">To</label>
                <input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Cc</label>
                <input
                  value={composeCc}
                  onChange={(e) => setComposeCc(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Bcc</label>
                <input
                  value={composeBcc}
                  onChange={(e) => setComposeBcc(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Subject</label>
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-sm mb-1">Body</label>
              {window.RichTextEditor ? (
                <window.RichTextEditor
                  value={composeHtmlBody}
                  onChange={(html) => {
                    setComposeHtmlBody(html || '');
                    setComposeBody(htmlToPlainText(html || ''));
                  }}
                  placeholder="Write your email..."
                  rows={12}
                  isDark={isDark}
                />
              ) : (
                <textarea
                  rows={12}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              )}
            </div>
            <div className="mt-3">
              <div className="flex items-center gap-2">
                <input ref={attachmentInputRef} type="file" multiple className="hidden" onChange={onPickAttachments} />
                <button
                  type="button"
                  onClick={() => attachmentInputRef.current?.click()}
                  className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}
                >
                  <i className="fas fa-paperclip mr-1" />
                  Add attachment
                </button>
                {composeAttachments.length ? <span className={`text-xs ${muted}`}>{composeAttachments.length} file(s) attached</span> : null}
              </div>
              {composeAttachments.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {composeAttachments.map((att) => (
                    <span key={att.id} className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs border ${isDark ? 'border-gray-600' : 'border-gray-300'}`}>
                      {att.filename}
                      <button type="button" onClick={() => setComposeAttachments((prev) => prev.filter((x) => x.id !== att.id))} className="text-red-500">
                        <i className="fas fa-times" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                onClick={() => setComposeOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={composeSavingDraft}
                className={`px-4 py-2 rounded-lg text-sm border ${isDark ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'} disabled:opacity-50`}
                onClick={saveDraft}
              >
                {composeSavingDraft ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                disabled={mailSending}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                onClick={sendMail}
              >
                {mailSending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-md rounded-xl border shadow-xl p-6 ${card}`}>
            <h3 className="text-lg font-semibold mb-4">{editingEventId ? 'Edit event' : 'New event'}</h3>
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
                {editingEventId ? 'Sync changes to Google Calendar (if linked)' : 'Also create in Google Calendar'}
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                onClick={saveEvent}
              >
                {saving ? 'Saving…' : editingEventId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {googleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`w-full max-w-lg rounded-xl border shadow-xl p-6 max-h-[90vh] overflow-y-auto ${card}`}>
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <i className="fab fa-google text-green-600" />
              Google Calendar event
            </h3>
            {googleModalLoading ? (
              <p className={muted}>Loading…</p>
            ) : (
              <>
                {gRecurringEventId ? (
                  <label className="block text-sm mb-3">
                    <span className={muted}>Edit scope</span>
                    <select
                      className={`w-full mt-1 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                      value={gScope}
                      onChange={(e) => setGScope(e.target.value)}
                    >
                      <option value="instance">This occurrence only</option>
                      <option value="series">All events in series</option>
                    </select>
                  </label>
                ) : null}
                <label className="block text-sm mb-1">Title</label>
                <input
                  className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                  value={gTitle}
                  onChange={(e) => setGTitle(e.target.value)}
                />
                <label className="block text-sm mb-1">Location</label>
                <input
                  className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                  value={gLocation}
                  onChange={(e) => setGLocation(e.target.value)}
                  placeholder="Optional"
                />
                <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={gAllDay} onChange={(e) => setGAllDay(e.target.checked)} />
                  All day
                </label>
                {gAllDay ? (
                  <>
                    <label className="block text-sm mb-1">Start date</label>
                    <input
                      type="date"
                      className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                      value={gDateStart}
                      onChange={(e) => setGDateStart(e.target.value)}
                    />
                    <label className="block text-sm mb-1">End date (inclusive)</label>
                    <input
                      type="date"
                      className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                      value={gDateEndInclusive}
                      onChange={(e) => setGDateEndInclusive(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <label className="block text-sm mb-1">Start</label>
                    <input
                      type="datetime-local"
                      className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                      value={gTimedStart}
                      onChange={(e) => setGTimedStart(e.target.value)}
                    />
                    <label className="block text-sm mb-1">End</label>
                    <input
                      type="datetime-local"
                      className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                      value={gTimedEnd}
                      onChange={(e) => setGTimedEnd(e.target.value)}
                    />
                  </>
                )}
                <label className="block text-sm mb-1">Description</label>
                <textarea
                  className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                  rows={3}
                  value={gDesc}
                  onChange={(e) => setGDesc(e.target.value)}
                />
                <label className="block text-sm mb-1">Attendees (comma-separated emails)</label>
                <input
                  className={`w-full mb-3 px-3 py-2 rounded-lg border ${isDark ? 'bg-gray-900 border-gray-600' : 'bg-white border-gray-300'}`}
                  value={gAttendees}
                  onChange={(e) => setGAttendees(e.target.value)}
                  placeholder="a@x.com, b@y.com"
                />
                <label className="flex items-center gap-2 mb-3 text-sm cursor-pointer">
                  <input type="checkbox" checked={gAddMeet} onChange={(e) => setGAddMeet(e.target.checked)} />
                  Add or refresh Google Meet link
                </label>
                {(gHangoutLink || gHtmlLink) && (
                  <div className={`text-sm mb-3 space-x-3 ${muted}`}>
                    {gHangoutLink ? (
                      <a href={gHangoutLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                        Join Meet
                      </a>
                    ) : null}
                    {gHtmlLink ? (
                      <a href={gHtmlLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                        Open in Google Calendar
                      </a>
                    ) : null}
                  </div>
                )}
                <div className="flex flex-wrap justify-between gap-2 mt-4">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg text-sm text-red-500 hover:text-red-400"
                    disabled={googleSaving}
                    onClick={deleteGoogleEvent}
                  >
                    Delete
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`px-4 py-2 rounded-lg text-sm ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
                      disabled={googleSaving}
                      onClick={closeGoogleModal}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={googleSaving}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      onClick={saveGoogleEvent}
                    >
                      {googleSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

window.ErpCalendar = ErpCalendar;
window.dispatchEvent(new CustomEvent('erpCalendarComponentReady'));

export default ErpCalendar;
