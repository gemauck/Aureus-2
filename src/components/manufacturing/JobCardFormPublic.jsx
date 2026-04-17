// Mobile Job Card wizard — used at /job-card behind JobCardAppGate (login required).
// Offline-friendly: drafts can be saved locally and synced when online.
import {
  formatJobCardActivityAction,
  formatJobCardActivityDetail,
  sortJobCardActivitiesChronological
} from './jobCardActivityDisplay.js';

const { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } = React;

const STEP_IDS = ['assignment', 'visit', 'work', 'stock', 'signoff'];

/** Base64 payloads: keep video cap lower than express.json (100mb) to leave room for the rest of the payload */
const JOB_CARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const JOB_CARD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

/** Work-step fields that can each carry photos/videos (stored on JobCard.photos as { kind: 'sectionMedia', section, url, name }). */
const SECTION_WORK_MEDIA_KEYS = ['diagnosis', 'actionsTaken', 'futureWorkRequired'];

function emptySectionWorkMedia() {
  return { diagnosis: [], actionsTaken: [], futureWorkRequired: [] };
}

/** Ids of job cards created/updated via the public API on this browser — used for GET /api/public/jobcards?ids= */
const JOB_CARD_PUBLIC_PRIOR_IDS_KEY = 'jobcard_public_prior_ids';
const MAX_PUBLIC_PRIOR_IDS = 200;
const PROJECT_ASSOCIATION_PREFIX = 'Project Association:';

function sortJobCardStockLocations(list) {
  const fn = window.manufacturingStockLocations?.sortStockLocationsForManufacturing;
  return fn ? fn(list) : (Array.isArray(list) ? [...list] : []);
}

/** Quantity at a warehouse when using cached aggregate inventory (locations[] or single locationId row). */
function jobCardQuantityAtLocation(item, locationId) {
  if (!item || !locationId) return 0;
  const locs = Array.isArray(item.locations) ? item.locations : [];
  if (locs.length > 0) {
    const loc = locs.find((l) => l.locationId === locationId);
    return loc ? Number(loc.quantity) || 0 : 0;
  }
  if (item.locationId === locationId) {
    return Number(item.quantity) || 0;
  }
  return 0;
}

/** Offline / fallback: build pick list from cached inventory for one location (qty on hand only). */
function jobCardStockPickListFromCachedInventory(items, locationId) {
  if (!locationId || !Array.isArray(items)) return [];
  const out = [];
  for (const item of items) {
    const q = jobCardQuantityAtLocation(item, locationId);
    if (q <= 0) continue;
    const sku = item.sku || item.id;
    if (!sku) continue;
    if (item.status === 'inactive') continue;
    out.push({ ...item, quantity: q, sku });
  }
  out.sort((a, b) => String(a.name || a.sku || '').localeCompare(String(b.name || b.sku || ''), undefined, { sensitivity: 'base' }));
  return out;
}

function readPublicPriorJobCardIds() {
  try {
    const raw = localStorage.getItem(JOB_CARD_PUBLIC_PRIOR_IDS_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr)
      ? arr.filter(id => typeof id === 'string' && id.length > 0).slice(0, MAX_PUBLIC_PRIOR_IDS)
      : [];
  } catch {
    return [];
  }
}

function rememberPublicPriorJobCardId(id) {
  if (!id || typeof id !== 'string') return;
  try {
    const existing = readPublicPriorJobCardIds();
    const next = [id, ...existing.filter(x => x !== id)].slice(0, MAX_PUBLIC_PRIOR_IDS);
    localStorage.setItem(JOB_CARD_PUBLIC_PRIOR_IDS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Set before navigating to `/` to log in; LoginPage reads and redirects back here. */
const REDIRECT_AFTER_LOGIN_KEY = 'redirectAfterLogin';

function getJobCardAuthToken() {
  try {
    const t =
      (typeof window !== 'undefined' && window.storage?.getToken?.()) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('abcotronics_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('authToken')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('auth_token')) ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('token'));
    if (!t || t === 'undefined' || t === 'null') return null;
    return t;
  } catch {
    return null;
  }
}

/** Logged-in ERP user — this name is stored on the server as job card owner / captured-by identity. */
function getJobCardRecorderDisplayName() {
  try {
    const u = typeof window !== 'undefined' && window.storage?.getUser?.();
    if (!u || typeof u !== 'object') return '';
    const name = u.name || u.displayName;
    const email = u.email;
    if (name && String(name).trim()) return String(name).trim();
    if (email && String(email).trim()) return String(email).trim();
    return '';
  } catch {
    return '';
  }
}

function goToSignInForJobCardHistory() {
  try {
    sessionStorage.setItem(REDIRECT_AFTER_LOGIN_KEY, '/job-card');
  } catch {
    /* ignore */
  }
  window.location.assign('/');
}

function jobCardMediaIsVideoDataUrl(url) {
  return typeof url === 'string' && /^data:video\//i.test(url);
}

function jobCardFileLooksImageOrVideo(file) {
  if (file.type.startsWith('image/') || file.type.startsWith('video/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|mp4|webm|mov|mkv)$/i.test(file.name || '');
}

function jobCardFileIsVideo(file) {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|mkv)$/i.test(file.name || '');
}

function parseProjectAssociationFromComments(rawComments) {
  if (!rawComments || typeof rawComments !== 'string') {
    return { projectId: '', projectName: '' };
  }
  const lines = rawComments.split('\n');
  const line = lines.find(
    l => typeof l === 'string' && l.startsWith(PROJECT_ASSOCIATION_PREFIX)
  );
  if (!line) return { projectId: '', projectName: '' };
  const raw = line.slice(PROJECT_ASSOCIATION_PREFIX.length).trim();
  if (!raw) return { projectId: '', projectName: '' };
  const idMatch = raw.match(/\(([^)]+)\)\s*$/);
  if (idMatch && idMatch[1]) {
    const projectId = String(idMatch[1]).trim();
    const projectName = raw.slice(0, idMatch.index).trim();
    return { projectId, projectName };
  }
  return { projectId: '', projectName: raw };
}

/** Inline photo/video strip for Diagnosis / Actions / Future work sections on the work step. */
const WorkSectionMediaAttachments = ({ sectionKey, items, onUpload, onRemove }) => {
  const inputId = `section-work-media-${sectionKey}`;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-600 mb-2">Photos &amp; video for this section (optional)</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          id={inputId}
          className="hidden"
          accept="image/*,video/*"
          multiple
          onChange={(e) => onUpload(sectionKey, e)}
        />
        <label
          htmlFor={inputId}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer touch-manipulation"
        >
          <i className="fas fa-camera text-gray-500" />
          <span>Add photo or video</span>
        </label>
      </div>
      {items && items.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((photo, idx) => (
            <JobCardWizardAttachmentPreview
              key={`${sectionKey}-m-${idx}`}
              url={photo.url}
              index={idx}
              onRemove={(i) => onRemove(sectionKey, i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const JobCardWizardAttachmentPreview = ({ url, index, onRemove }) => {
  const isVideo = jobCardMediaIsVideoDataUrl(url);
  return (
    <div className="relative group rounded-lg overflow-hidden border border-gray-200">
      {isVideo ? (
        <video
          src={url}
          className="w-full max-h-48 sm:max-h-64 object-contain bg-black"
          controls
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          src={url}
          alt={`Attachment ${index + 1}`}
          className="w-full h-24 sm:h-32 object-cover"
        />
      )}
      <button
        type="button"
        onClick={() => onRemove(index)}
        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 transition touch-manipulation z-10"
        title="Remove"
      >
        <i className="fas fa-times text-xs"></i>
      </button>
    </div>
  );
};

const STEP_META = {
  assignment: {
    title: 'Team & Client',
    subtitle: 'Assign crew & site',
    icon: 'fa-user-check'
  },
  visit: {
    title: 'Site Visit',
    subtitle: 'Trip & timing',
    icon: 'fa-route'
  },
  work: {
    title: 'Work Notes',
    subtitle: 'Diagnosis & actions',
    icon: 'fa-clipboard-list'
  },
  stock: {
    title: 'Stock & Costs',
    subtitle: 'Usage & purchases',
    icon: 'fa-boxes-stacked'
  },
  signoff: {
    title: 'Customer Sign-off',
    subtitle: 'Feedback & approval',
    icon: 'fa-signature'
  }
};

/** Full-width title above step body so steps 4–5 match wizard labels (Stock & Costs, Customer Sign-off). */
const WizardStepPageHeader = ({ stepIndex, stepId }) => {
  const meta = STEP_META[stepId] || {};
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40 px-4 py-4 sm:px-6 sm:py-5 ring-1 ring-slate-100">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 mb-1">
        Step {stepIndex + 1}
      </p>
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{meta.title || stepId}</h2>
      {meta.subtitle ? (
        <p className="text-sm text-gray-600 mt-1">{meta.subtitle}</p>
      ) : null}
    </div>
  );
};

const StepBadge = ({
  index,
  stepId,
  active,
  complete,
  onClick,
  className = '',
  /** 'carousel' = single horizontal swipe row in mobile header (below xl) */
  variant = 'default'
}) => {
  const meta = STEP_META[stepId] || {};
  const baseClasses =
    variant === 'carousel'
      ? 'group flex flex-row items-center justify-start gap-1.5 rounded-lg px-2 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-blue-700 snap-start shrink-0 touch-manipulation [scroll-snap-stop:always] max-w-[11rem]'
      : 'group flex items-center lg:flex-col lg:items-start lg:justify-start sm:flex-col sm:items-center justify-between sm:justify-center gap-3 sm:gap-2 lg:gap-3 rounded-xl px-3 py-3 sm:px-4 sm:py-4 lg:px-3 lg:py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-blue-700 min-w-[160px] sm:min-w-0 lg:min-w-0 snap-start w-full lg:w-full';
  const stateClass =
    active && variant === 'carousel'
      ? 'bg-blue-50 border-2 border-blue-600 text-slate-900 shadow-md shadow-blue-900/10'
      : active
        ? 'bg-white/95 text-blue-800 shadow-lg shadow-blue-600/25'
        : complete
          ? 'bg-white/35 text-white ring-1 ring-white/25'
          : 'bg-white/15 text-blue-50 hover:bg-white/25';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${stateClass} ${variant === 'carousel' ? 'job-card-step-chip' : ''} ${className}`}
      aria-current={active ? 'step' : undefined}
    >
      <div
        className={[
          variant === 'carousel'
            ? 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition'
            : 'flex h-11 w-11 items-center justify-center rounded-full border-2 transition',
          active && variant === 'carousel'
            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
            : active
              ? 'bg-white text-blue-600 border-white shadow'
              : complete
                ? 'bg-white/90 text-blue-600 border-transparent'
                : 'bg-white/20 text-white border-white/30 group-hover:border-white/50'
        ].join(' ')}
      >
        <i
          className={`fa-solid ${meta.icon || 'fa-circle-dot'} ${variant === 'carousel' ? 'text-xs' : 'text-base'}`}
        ></i>
      </div>
      <div
        className={
          variant === 'carousel'
            ? 'flex min-w-0 flex-1 flex-col gap-0.5 text-left'
            : 'flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:items-center sm:text-center lg:items-start lg:text-left'
        }
      >
        <span
          className={`${variant === 'carousel' ? 'text-[10px]' : 'text-[11px]'} uppercase tracking-wide font-semibold ${
            active && variant === 'carousel'
              ? 'text-blue-800'
              : active
                ? '!text-blue-700'
                : 'text-blue-50'
          } ${variant === 'carousel' ? '' : 'sm:text-center lg:text-left'}`}
        >
          Step {index + 1}
        </span>
        <span
          className={`${variant === 'carousel' ? 'text-xs' : 'text-sm'} font-semibold leading-tight ${
            active && variant === 'carousel'
              ? 'text-slate-900'
              : active
                ? '!text-blue-950'
                : 'text-white'
          } ${variant === 'carousel' ? '' : 'sm:text-center lg:text-left'}`}
        >
          {meta.title || stepId}
        </span>
        {meta.subtitle && variant !== 'carousel' && (
          <span
            className={`text-[11px] sm:text-xs ${active ? '!text-blue-700/90' : 'text-blue-100/90'} ${variant === 'carousel' ? '' : 'sm:text-center lg:text-left'}`}
          >
            {meta.subtitle}
          </span>
        )}
      </div>
    </button>
  );
};

const SummaryRow = ({ label, value }) => (
  <div className="flex justify-between gap-4 text-sm">
    <span className="text-gray-500">{label}</span>
    <span className="text-gray-900 text-right font-medium">{value || '—'}</span>
  </div>
);

/** Combobox-style select: type to filter, click to choose (technicians, clients, stock, etc.) */
const SearchableSelect = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Search or select…',
  disabled = false,
  required = false,
  className = '',
  name,
  'aria-label': ariaLabel
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [menuFixedStyle, setMenuFixedStyle] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const listId = id ? `${id}-listbox` : undefined;

  const positionMenu = useCallback(() => {
    if (!open || !inputRef.current || typeof window === 'undefined') return;
    const r = inputRef.current.getBoundingClientRect();
    const gap = 4;
    const maxH = 224;
    const spaceBelow = window.innerHeight - r.bottom - gap - 16;
    const mh = Math.min(maxH, Math.max(96, spaceBelow));
    setMenuFixedStyle({
      top: r.bottom + gap,
      left: r.left,
      width: r.width,
      maxHeight: mh
    });
  }, [open]);

  /** Real choices only — never show "Select…" style rows in the dropdown */
  const listOptions = useMemo(
    () =>
      (options || []).filter(
        o => o && o.value !== '' && o.value != null && String(o.value).length > 0
      ),
    [options]
  );

  const selected = useMemo(
    () => listOptions.find(o => String(o.value) === String(value)),
    [listOptions, value]
  );

  useEffect(() => {
    if (!open) {
      setFilter(selected ? selected.label : '');
    }
  }, [value, selected, open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return listOptions;
    return listOptions.filter(
      o =>
        String(o.label).toLowerCase().includes(q) ||
        String(o.value).toLowerCase().includes(q)
    );
  }, [listOptions, filter]);

  useEffect(() => {
    const onDoc = e => {
      const t = e.target;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuFixedStyle(null);
      return;
    }
    positionMenu();
    const onWin = () => positionMenu();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open, positionMenu, filtered.length, listOptions.length]);

  const canPortal =
    typeof document !== 'undefined' &&
    window.ReactDOM &&
    typeof window.ReactDOM.createPortal === 'function';

  const renderDropdown = () => {
    if (!open || disabled) return null;

    const menuShellClass =
      'job-card-public-select-menu rounded-lg border border-gray-200 bg-white shadow-lg';

    if (listOptions.length === 0) {
      return (
        <div
          ref={menuRef}
          className={`${menuShellClass} fixed z-[10050] px-3 py-2 text-sm text-gray-500 job-card-public-select-menu-empty`}
          style={menuFixedStyle || undefined}
        >
          No options available
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div
          ref={menuRef}
          className={`${menuShellClass} fixed z-[10050] px-3 py-2 text-sm text-gray-500 job-card-public-select-menu-empty`}
          style={menuFixedStyle || undefined}
        >
          No matches
        </div>
      );
    }

    return (
      <div
        ref={menuRef}
        className={`${menuShellClass} fixed z-[10050] overflow-y-auto py-1`}
        style={menuFixedStyle || undefined}
      >
        <ul id={listId} role="listbox" className="py-0">
          {filtered.map(opt => {
            const isOptSelected = String(opt.value) === String(value);
            return (
            <li
              key={String(opt.value) + String(opt.label)}
              role="option"
              aria-selected={isOptSelected}
              className={`cursor-pointer px-3 py-2.5 text-sm touch-manipulation border-l-2 ${
                isOptSelected
                  ? 'bg-blue-100 text-blue-900 font-medium border-blue-600'
                  : 'border-transparent text-gray-900 hover:bg-blue-50 active:bg-blue-100'
              }`}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(opt.value);
                setFilter(opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const dropdownNode = renderDropdown();
  const portaledDropdown =
    canPortal && dropdownNode ? window.ReactDOM.createPortal(dropdownNode, document.body) : null;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          name={name}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-required={required}
          aria-label={ariaLabel}
          disabled={disabled}
          autoComplete="off"
          value={open ? filter : (selected ? selected.label : '')}
          onChange={e => {
            setFilter(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            // When opening from a closed list, clear the query so all options show (previously
            // we prefilled the filter with the selected label, which hid every other row).
            if (!open) {
              setFilter('');
            }
          }}
          placeholder={placeholder}
          className={[
            'w-full pl-4 pr-11 py-3 text-base rounded-lg bg-white disabled:bg-gray-100 disabled:cursor-not-allowed touch-manipulation transition-shadow',
            open && !disabled
              ? 'border-2 border-blue-600 ring-2 ring-blue-200 shadow-sm'
              : 'border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
          ].join(' ')}
          style={{ fontSize: '16px' }}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? 'Close list' : 'Open list'}
          className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-md touch-manipulation ${
            open && !disabled ? 'text-blue-700 bg-blue-50' : 'text-gray-500 hover:bg-gray-100 active:bg-gray-200'
          }`}
          onMouseDown={e => {
            e.preventDefault();
          }}
          onClick={() => {
            if (disabled) return;
            if (open) {
              setOpen(false);
            } else {
              setFilter('');
              setOpen(true);
              inputRef.current?.focus();
            }
          }}
        >
          <i className={`fas fa-chevron-down text-sm transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>
      {canPortal ? (
        portaledDropdown
      ) : (
        <>
          {open && !disabled && listOptions.length > 0 && filtered.length > 0 && (
            <ul
              id={listId}
              role="listbox"
              ref={menuRef}
              className="job-card-public-select-menu absolute z-[60] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {filtered.map(opt => {
                const isOptSelected = String(opt.value) === String(value);
                return (
                <li
                  key={String(opt.value) + String(opt.label)}
                  role="option"
                  aria-selected={isOptSelected}
                  className={`cursor-pointer px-3 py-2.5 text-sm touch-manipulation border-l-2 ${
                    isOptSelected
                      ? 'bg-blue-100 text-blue-900 font-medium border-blue-600'
                      : 'border-transparent text-gray-900 hover:bg-blue-50 active:bg-blue-100'
                  }`}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onChange(opt.value);
                    setFilter(opt.label);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </li>
                );
              })}
            </ul>
          )}
          {open && !disabled && listOptions.length === 0 && (
            <div
              ref={menuRef}
              className="job-card-public-select-menu job-card-public-select-menu-empty absolute z-[60] mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg"
            >
              No options available
            </div>
          )}
          {open && !disabled && listOptions.length > 0 && filtered.length === 0 && (
            <div
              ref={menuRef}
              className="job-card-public-select-menu job-card-public-select-menu-empty absolute z-[60] mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg"
            >
              No matches
            </div>
          )}
        </>
      )}
    </div>
  );
};

/** Voice-note field (shared with classic JobCardModal) — core-entry loads JobCardVoiceNoteTextarea.jsx before this file */
const VoiceNoteTextarea =
  typeof window !== 'undefined' && window.JobCardVoiceNoteTextarea
    ? window.JobCardVoiceNoteTextarea
    : function VoiceNoteTextareaFallback(props) {
        const { name, value, onChange, rows = 3, placeholder = '', className = '' } = props;
        return (
          <textarea
            name={name}
            value={value}
            onChange={onChange}
            rows={rows}
            placeholder={placeholder}
            className={`w-full px-3 py-2 text-sm border border-gray-300 rounded-lg ${className}`}
          />
        );
      };

const NO_CLIENT_ID = 'NO_CLIENT';

const parseStoredJsonArray = (val, fallback = []) => {
  if (val == null) return fallback;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

const toDatetimeLocalInput = val => {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Prisma cuid or UUID — id stored on the server after submit */
const isLikelyServerJobCardId = id => {
  if (id == null || id === '') return false;
  const s = String(id);
  if (/^c[a-z0-9]{24}$/i.test(s)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
};

/** Pending / failed-sync job cards for the public wizard (offline or server unreachable) */
const JOB_CARD_LOCAL_PENDING_KEY = 'manufacturing_jobcards';
const MAX_LOCAL_PENDING_JOB_CARDS = 100;

function readLocalPendingJobCards() {
  try {
    const raw = localStorage.getItem(JOB_CARD_LOCAL_PENDING_KEY);
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeLocalPendingJobCards(cards) {
  try {
    localStorage.setItem(
      JOB_CARD_LOCAL_PENDING_KEY,
      JSON.stringify(cards.slice(0, MAX_LOCAL_PENDING_JOB_CARDS))
    );
  } catch (e) {
    console.warn('JobCardFormPublic: could not persist local job cards', e);
  }
}

function upsertLocalPendingJobCard(card) {
  if (!card || card.id == null) return;
  const list = readLocalPendingJobCards();
  const id = String(card.id);
  const next = [{ ...card, synced: false }, ...list.filter(c => c && String(c.id) !== id)].slice(
    0,
    MAX_LOCAL_PENDING_JOB_CARDS
  );
  writeLocalPendingJobCards(next);
}

function removeLocalPendingJobCard(id) {
  if (id == null) return;
  const sid = String(id);
  writeLocalPendingJobCards(readLocalPendingJobCards().filter(c => c && String(c.id) !== sid));
}

async function flushJobCardActivityQueue(serverJobCardId, events) {
  if (!serverJobCardId || !Array.isArray(events) || events.length === 0) return;
  const token = getJobCardAuthToken();
  if (!token) return;
  try {
    const res = await fetch(
      `/api/jobcards/${encodeURIComponent(serverJobCardId)}/activity/sync`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          events: events.map(e => ({
            action: e.action,
            metadata: e.metadata,
            source: e.source || 'mobile'
          }))
        })
      }
    );
    if (!res.ok) {
      console.warn('JobCardFormPublic: activity sync HTTP', res.status);
    }
  } catch (e) {
    console.warn('JobCardFormPublic: activity sync failed', e);
  }
}

/** Searchable text for unsynced local drafts (mirrors server `q` coverage as far as stored fields allow). */
function priorListLocalSearchHay(jc) {
  if (!jc || typeof jc !== 'object') return '';
  const asJson = v => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try {
      return JSON.stringify(v);
    } catch {
      return '';
    }
  };
  const parts = [
    jc.id,
    jc.jobCardNumber,
    jc.clientId,
    jc.clientName,
    jc.siteId,
    jc.siteName,
    jc.agentName,
    jc.location,
    jc.locationLatitude,
    jc.locationLongitude,
    jc.latitude,
    jc.longitude,
    jc.vehicleUsed,
    jc.reasonForVisit,
    jc.diagnosis,
    jc.futureWorkRequired,
    jc.actionsTaken,
    jc.otherComments,
    jc.status,
    asJson(jc.otherTechnicians),
    asJson(jc.stockUsed),
    asJson(jc.materialsBought),
    asJson(jc.photos),
    asJson(jc.serviceForms)
  ];
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Id used to open a row (GET detail). Prefer `id`; merged rows also set `serverJobCardId`. */
function getPriorCardOpenId(card) {
  if (!card || typeof card !== 'object') return '';
  const raw = card.id != null ? card.id : card.serverJobCardId;
  if (raw == null) return '';
  const s = String(raw).trim();
  return s || '';
}

/** Merge server/public API rows with unsynced local copies (local wins on id collision). */
function buildMergedWizardJobCardRows(serverList) {
  const token = typeof window !== 'undefined' ? getJobCardAuthToken() : null;
  const localPending = readLocalPendingJobCards().filter(j => j && j.synced === false);
  const pendingIdSet = new Set(localPending.map(j => String(j.id)));
  const serverRows = (serverList || [])
    .filter(jc => jc && !pendingIdSet.has(String(jc.id)))
    .map(jc => ({
      ...jc,
      source: token ? 'server' : 'public',
      serverJobCardId: jc.id,
      synced: true
    }));
  const localRows = localPending.map(jc => ({
    ...jc,
    source: 'local',
    serverJobCardId:
      jc.serverJobCardId || (isLikelyServerJobCardId(jc.id) ? String(jc.id) : null),
    synced: false
  }));
  const rows = [...localRows, ...serverRows];
  rows.sort((a, b) => {
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    return tb - ta;
  });
  return rows;
}

const JobCardFormPublic = () => {
  const [formData, setFormData] = useState({
    agentName: '',
    otherTechnicians: [],
    projectId: '',
    projectName: '',
    clientId: '',
    clientName: '',
    siteId: '',
    siteName: '',
    location: '',
    latitude: '',
    longitude: '',
    timeOfDeparture: '',
    timeOfArrival: '',
    vehicleUsed: '',
    kmReadingBefore: '',
    kmReadingAfter: '',
    reasonForVisit: '',
    diagnosis: '',
    futureWorkRequired: '',
    futureWorkScheduledAt: '',
    actionsTaken: '',
    otherComments: '',
    stockUsed: [],
    materialsBought: [],
    photos: [],
    // Service form instances attached to this job card
    // [{ id, templateId, templateName, answers: { fieldId: value } }]
    serviceForms: [],
    status: 'draft',
    customerName: '',
    customerTitle: '',
    customerFeedback: '',
    customerSignDate: '',
    customerSignature: ''
  });

  const [technicianInput, setTechnicianInput] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  /** Per-section photos/videos on work step (Diagnosis, Actions, Future work). */
  const [sectionWorkMedia, setSectionWorkMedia] = useState(() => emptySectionWorkMedia());
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  /** Rows with on-hand qty at `newStockItem.locationId` (from API or cache). */
  const [stockRowsAtLocation, setStockRowsAtLocation] = useState([]);
  const [newStockItem, setNewStockItem] = useState({ sku: '', quantity: 0, locationId: '' });
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [shareStatus, setShareStatus] = useState('Copy share link');
  const [calendarStatus, setCalendarStatus] = useState('Copy calendar link');
  /** Voice clips recorded from text fields: saved with the job card and keyed by section */
  const [voiceAttachments, setVoiceAttachments] = useState([]);
  // Service form templates and selection state
  const [formTemplates, setFormTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  /** landing → pick create vs edit; prior_list → choose a saved card; form → wizard */
  const [wizardFlow, setWizardFlow] = useState('landing');
  /** Prior list: server + public API; merged with readLocalPendingJobCards() for display */
  const [serverPriorList, setServerPriorList] = useState([]);
  const [serverPriorLoading, setServerPriorLoading] = useState(false);
  /** Full-screen overlay while fetching job card detail for edit (large payloads). */
  const [openingJobCard, setOpeningJobCard] = useState(false);
  /** Prior list: server search + client filter (authenticated) */
  const [priorSearchInput, setPriorSearchInput] = useState('');
  const [priorSearchDebounced, setPriorSearchDebounced] = useState('');
  const [priorClientId, setPriorClientId] = useState('');
  /** Bump when returning from login (another tab) or visibility — refetch job card list */
  const [priorListRefreshTick, setPriorListRefreshTick] = useState(0);
  /** Bump after local pending queue changes so landing / prior list re-read storage */
  const [localDraftsTick, setLocalDraftsTick] = useState(0);
  /** Activity trail when editing a card opened from prior list (server GET). */
  const [priorLoadedActivities, setPriorLoadedActivities] = useState([]);
  const [priorActivityLoading, setPriorActivityLoading] = useState(false);
  const [priorActivityOpen, setPriorActivityOpen] = useState(true);
  /** For offline warning when there is no cached auth */
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  /** When editing, keep stable id / createdAt / sync flags for save */
  const [editingMeta, setEditingMeta] = useState(null);
  /** Mobile (< xl): collapse wizard header to maximize form area */
  const [mobileHeaderCollapsed, setMobileHeaderCollapsed] = useState(() => {
    try {
      if (typeof sessionStorage === 'undefined') return true;
      const v = sessionStorage.getItem('jobcard_wizard_header_collapsed');
      if (v === '0') return false;
      return true;
    } catch {
      return true;
    }
  });
  const lastSignatureRestoreRef = useRef(null);
  /** New wizard events since this session opened (merged into activityQueue on save). */
  const sessionActivityQueueRef = useRef([]);

  const pushWizardActivity = useCallback((action, metadata) => {
    const ev = {
      action,
      metadata: metadata && typeof metadata === 'object' ? metadata : {},
      source: 'mobile'
    };
    sessionActivityQueueRef.current.push(ev);
  }, []);

  const signatureCanvasRef = useRef(null);
  const signatureWrapperRef = useRef(null);
  const isDrawingRef = useRef(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const mapMarkerRef = useRef(null);

  useEffect(() => {
    const body = typeof document !== 'undefined' ? document.body : null;
    const html = typeof document !== 'undefined' ? document.documentElement : null;

    if (body) {
      body.classList.add('job-card-public');
    }
    if (html) {
      html.classList.add('job-card-public');
    }

    return () => {
      if (body) {
        body.classList.remove('job-card-public');
      }
      if (html) {
        html.classList.remove('job-card-public');
      }
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('jobcard_wizard_header_collapsed', mobileHeaderCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [mobileHeaderCollapsed]);

  useEffect(() => {
    const t = setTimeout(() => setPriorSearchDebounced(priorSearchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [priorSearchInput]);

  useEffect(() => {
    const up = () => setNetworkOnline(true);
    const down = () => setNetworkOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => {
    const bump = () => setPriorListRefreshTick(x => x + 1);
    const onStorage = e => {
      if (e.key === 'abcotronics_token') bump();
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') bump();
    };
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const availableTechnicians = useMemo(
    () => users.filter(u => u.status !== 'inactive' && u.status !== 'suspended'),
    [users]
  );

  const priorClientSelectOptions = useMemo(() => {
    const list = Array.isArray(clients) ? clients : [];
    return [...list]
      .filter(c => c && c.id)
      .sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
      );
  }, [clients]);

  const addVoiceClip = useCallback(
    clip => {
      pushWizardActivity('wizard_media_added', {
        kind: 'voice',
        section: clip?.section || 'unknown'
      });
      setVoiceAttachments(prev => [
        ...prev,
        {
          ...clip,
          id: `vn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
        }
      ]);
    },
    [pushWizardActivity]
  );

  const updateVoiceClip = useCallback((clipId, patch) => {
    if (!clipId || !patch || typeof patch !== 'object') return;
    setVoiceAttachments(prev =>
      prev.map(v => (v.id === clipId ? { ...v, ...patch } : v))
    );
  }, []);

  const leadTechnicianOptions = useMemo(
    () =>
      availableTechnicians.map(tech => ({
        value: tech.name || tech.email,
        label: `${tech.name || tech.email}${tech.department ? ` (${tech.department})` : ''}`
      })),
    [availableTechnicians]
  );

  const teamTechnicianOptions = useMemo(
    () =>
      availableTechnicians
        .filter(tech => !formData.otherTechnicians.includes(tech.name || tech.email))
        .map(tech => ({
          value: tech.name || tech.email,
          label: tech.name || tech.email
        })),
    [availableTechnicians, formData.otherTechnicians]
  );

  const clientSelectOptions = useMemo(
    () => [
      ...clients.map(c => ({ value: c.id, label: c.name || c.companyName || c.id })),
      { value: NO_CLIENT_ID, label: 'No Client (enter details manually)' }
    ],
    [clients]
  );

  const siteSelectOptions = useMemo(() => {
    if (!formData.clientId || availableSites.length === 0) {
      return [];
    }
    return availableSites.map(site => ({
      value: site.id || site.name || site,
      label: String(site.name || site)
    }));
  }, [formData.clientId, availableSites]);

  const projectSelectOptions = useMemo(() => {
    const selectedClient = (clients || []).find(
      c => String(c.id) === String(formData.clientId)
    );
    const selectedClientName = (
      selectedClient?.name ||
      selectedClient?.companyName ||
      ''
    )
      .toString()
      .trim()
      .toLowerCase();
    const hasClientFilter =
      Boolean(formData.clientId) && formData.clientId !== NO_CLIENT_ID;

    const filteredProjects = (projects || []).filter(project => {
      if (!hasClientFilter) return true;

      const projectClientId = project?.clientId != null ? String(project.clientId) : '';
      if (projectClientId && projectClientId === String(formData.clientId)) {
        return true;
      }

      const projectClientName = (
        project?.clientName ||
        project?.client ||
        ''
      )
        .toString()
        .trim()
        .toLowerCase();

      if (projectClientName && selectedClientName && projectClientName === selectedClientName) {
        return true;
      }

      return false;
    });

    return filteredProjects.map(project => ({
      value: project.id,
      label: project.name || project.projectName || project.title || project.id
    }));
  }, [projects, clients, formData.clientId]);

  useEffect(() => {
    if (!formData.projectId) return;
    const stillValid = projectSelectOptions.some(
      p => String(p.value) === String(formData.projectId)
    );
    if (!stillValid) {
      setFormData(prev => ({
        ...prev,
        projectId: ''
      }));
    }
  }, [formData.projectId, projectSelectOptions]);

  const stockSkuOptions = useMemo(
    () =>
      stockRowsAtLocation.map((item) => {
        const sku = item.sku || item.id;
        const q = Number(item.quantity) || 0;
        return {
          value: sku,
          label: `${item.name || sku} (${sku}) — ${q} on hand`
        };
      }),
    [stockRowsAtLocation]
  );

  const stockLocationOptions = useMemo(
    () =>
      stockLocations
        .filter((loc) => loc.status !== 'inactive' && loc.status !== 'suspended')
        .map((loc) => ({
          value: loc.id,
          label: `${loc.name} (${loc.code})`
        })),
    [stockLocations]
  );

  const lockedStockLocationId = useMemo(() => {
    const firstStockLine = Array.isArray(formData.stockUsed) ? formData.stockUsed[0] : null;
    return firstStockLine?.locationId ? String(firstStockLine.locationId) : '';
  }, [formData.stockUsed]);

  useEffect(() => {
    if (!lockedStockLocationId) return;
    if (String(newStockItem.locationId || '') === lockedStockLocationId) return;
    setNewStockItem((prev) => ({ ...prev, locationId: lockedStockLocationId, sku: '' }));
  }, [lockedStockLocationId, newStockItem.locationId]);

  useEffect(() => {
    const locId = newStockItem.locationId;
    if (!locId) {
      setStockRowsAtLocation([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      if (!isOnline) {
        const rows = jobCardStockPickListFromCachedInventory(inventory, locId);
        if (!cancelled) setStockRowsAtLocation(rows);
        return;
      }
      try {
        const response = await fetch(
          `/api/public/inventory?locationId=${encodeURIComponent(locId)}`,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } }
        );
        if (response.ok) {
          const data = await response.json();
          const rows = data?.data?.inventory || data?.inventory || [];
          if (!cancelled) setStockRowsAtLocation(Array.isArray(rows) ? rows : []);
          return;
        }
      } catch (e) {
        console.warn('⚠️ JobCardFormPublic: location inventory fetch failed:', e?.message || e);
      }
      const token = getJobCardAuthToken();
      if (token && window.DatabaseAPI?.getInventory) {
        try {
          const response = await window.DatabaseAPI.getInventory(locId, { forceRefresh: true });
          const rows = response?.data?.inventory || [];
          if (!cancelled) {
            setStockRowsAtLocation(
              Array.isArray(rows) ? rows.map((item) => ({ ...item, id: item.id })) : []
            );
          }
          return;
        } catch (authError) {
          console.warn('⚠️ JobCardFormPublic: authenticated location inventory failed:', authError?.message || authError);
        }
      }
      const rows = jobCardStockPickListFromCachedInventory(inventory, locId);
      if (!cancelled) setStockRowsAtLocation(rows);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [newStockItem.locationId, isOnline, inventory]);

  const jobStatusOptions = useMemo(
    () => [
      { value: 'draft', label: 'Draft' },
      { value: 'submitted', label: 'Submitted' },
      { value: 'completed', label: 'Completed' }
    ],
    []
  );

  const travelKm = formData.kmReadingBefore && formData.kmReadingAfter
    ? Math.max(0, parseFloat(formData.kmReadingAfter) - parseFloat(formData.kmReadingBefore))
    : 0;

  const totalMaterialCost = useMemo(
    () => (formData.materialsBought || []).reduce((sum, item) => sum + (item.cost || 0), 0),
    [formData.materialsBought]
  );

  /** General gallery (work + sign-off) plus per-section work-step attachments. */
  const totalPhotoVideoCount = useMemo(() => {
    const sectionCount = SECTION_WORK_MEDIA_KEYS.reduce(
      (n, k) => n + (sectionWorkMedia[k]?.length || 0),
      0
    );
    return selectedPhotos.length + sectionCount;
  }, [selectedPhotos, sectionWorkMedia]);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/job-card';
    }
    return `${window.location.origin}/job-card`;
  }, []);

  const calendarUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/api/public/jobcards-calendar.ics';
    }
    const base = `${window.location.origin}/api/public/jobcards-calendar.ics`;
    const token = getJobCardAuthToken();
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }, []);

  const resizeSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    const wrapper = signatureWrapperRef.current;
    if (!canvas || !wrapper) return;

    const ratio = window.devicePixelRatio || 1;
    const width = wrapper.clientWidth;
    const height = 180;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111827';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }, []);

  const getSignaturePosition = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches ? event.touches[0] : event;
    return {
      x: pointer.clientX - rect.left,
      y: pointer.clientY - rect.top
    };
  }, []);

  const startSignature = useCallback((event) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    isDrawingRef.current = true;
    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.preventDefault();
  }, [getSignaturePosition]);

  const drawSignature = useCallback((event) => {
    if (!isDrawingRef.current) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const { x, y } = getSignaturePosition(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
    event.preventDefault();
  }, [getSignaturePosition]);

  const endSignature = useCallback(() => {
    isDrawingRef.current = false;
  }, []);

  const clearSignature = useCallback(() => {
    lastSignatureRestoreRef.current = null;
    setFormData(prev => ({ ...prev, customerSignature: '' }));
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    resizeSignatureCanvas();
    setHasSignature(false);
  }, [resizeSignatureCanvas]);

  const exportSignature = useCallback(() => {
    if (!hasSignature || !signatureCanvasRef.current) {
      return '';
    }
    return signatureCanvasRef.current.toDataURL('image/png');
  }, [hasSignature]);

  const handleShareLink = useCallback(async () => {
    const targetUrl = shareUrl || (typeof window !== 'undefined' ? `${window.location.origin}/job-card` : '/job-card');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Job Card Capture',
          text: 'Use the mobile-friendly job card wizard to capture site visits.',
          url: targetUrl
        });
        setShareStatus('Link shared');
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(targetUrl);
        setShareStatus('Link copied');
      } else {
        throw new Error('Share API unavailable');
      }
    } catch (error) {
      console.warn('Job card share failed, attempting clipboard fallback:', error);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(targetUrl);
          setShareStatus('Link copied');
        } catch (clipboardError) {
          console.error('Clipboard fallback failed:', clipboardError);
          setShareStatus('Copy unavailable');
          return;
        }
      } else {
        setShareStatus('Copy unavailable');
        return;
      }
    } finally {
      setTimeout(() => setShareStatus('Copy share link'), 2500);
    }
  }, [shareUrl]);

  const handleOpenClassicView = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const classicUrl = `${window.location.origin}/service-maintenance`;
    window.open(classicUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleCopyCalendarLink = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCalendarStatus('Copy unavailable');
      setTimeout(() => setCalendarStatus('Copy calendar link'), 2500);
      return;
    }
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setCalendarStatus('Calendar link copied');
    } catch (error) {
      console.error('Calendar link copy failed:', error);
      setCalendarStatus('Copy unavailable');
    } finally {
      setTimeout(() => setCalendarStatus('Copy calendar link'), 2500);
    }
  }, [calendarUrl]);

  const handleSubscribeCalendar = useCallback(() => {
    if (typeof window === 'undefined') return;
    let target = calendarUrl;
    if (target.startsWith('https://')) {
      target = `webcal://${target.slice('https://'.length)}`;
    } else if (target.startsWith('http://')) {
      target = `webcal://${target.slice('http://'.length)}`;
    }
    window.open(target, '_blank', 'noopener,noreferrer');
  }, [calendarUrl]);

  // Map selection functions
  const reverseGeocode = useCallback(async (lat, lng) => {
    try {
      // Use Nominatim (OpenStreetMap geocoding service)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'Abcotronics-ERP/1.0'
          }
        }
      );
      const data = await response.json();
      
      let address = '';
      if (data.address) {
        const parts = [];
        if (data.address.road) parts.push(data.address.road);
        if (data.address.suburb || data.address.neighbourhood) parts.push(data.address.suburb || data.address.neighbourhood);
        if (data.address.city || data.address.town) parts.push(data.address.city || data.address.town);
        if (data.address.state) parts.push(data.address.state);
        address = parts.join(', ');
      }
      
      if (!address) {
        address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }

      setFormData(prev => ({
        ...prev,
        location: address,
        latitude: lat.toString(),
        longitude: lng.toString()
      }));
    } catch (error) {
      console.warn('Reverse geocoding failed:', error);
      setFormData(prev => ({
        ...prev,
        location: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        latitude: lat.toString(),
        longitude: lng.toString()
      }));
    }
  }, []);

  const initializeMap = useCallback(() => {
    if (!mapContainerRef.current || typeof window === 'undefined' || !window.L) {
      console.warn('⚠️ JobCardFormPublic: Cannot initialize map - missing container or Leaflet');
      if (!mapContainerRef.current) console.warn('  - Map container ref is null');
      if (!window.L) console.warn('  - Leaflet (window.L) is not loaded');
      return;
    }

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const L = window.L;
    const defaultLat = formData.latitude ? parseFloat(formData.latitude) : -25.7479; // South Africa default
    const defaultLng = formData.longitude ? parseFloat(formData.longitude) : 28.2293;


    // Ensure container is visible
    if (mapContainerRef.current) {
      mapContainerRef.current.style.display = 'block';
      mapContainerRef.current.style.visibility = 'visible';
      mapContainerRef.current.style.opacity = '1';
      mapContainerRef.current.style.width = '100%';
      mapContainerRef.current.style.height = '100%';
      mapContainerRef.current.style.minHeight = '400px';
    }

    // Create map
    const map = L.map(mapContainerRef.current, {
      center: [defaultLat, defaultLng],
      zoom: formData.latitude && formData.longitude ? 15 : 6,
      zoomControl: true
    });


    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    // Add marker if coordinates exist
    if (formData.latitude && formData.longitude) {
      const marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);
      mapMarkerRef.current = marker;
      
      marker.on('dragend', (e) => {
        const lat = e.target.getLatLng().lat;
        const lng = e.target.getLatLng().lng;
        reverseGeocode(lat, lng);
      });
    }

    // Handle map clicks
    map.on('click', (e) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      // Remove existing marker
      if (mapMarkerRef.current) {
        map.removeLayer(mapMarkerRef.current);
      }

      // Add new marker
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      mapMarkerRef.current = marker;
      
      marker.on('dragend', (e) => {
        const newLat = e.target.getLatLng().lat;
        const newLng = e.target.getLatLng().lng;
        reverseGeocode(newLat, newLng);
      });

      reverseGeocode(lat, lng);
    });

    // Try to get user's current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          map.setView([lat, lng], 15);
        },
        () => {
          // Geolocation failed, use default
        }
      );
    }
  }, [formData.latitude, formData.longitude, reverseGeocode]);

  const handleOpenMap = useCallback(() => {
    setShowMapModal(true);
    setTimeout(() => {
      initializeMap();
    }, 100);
  }, [initializeMap]);

  const handleCloseMap = useCallback(() => {
    setShowMapModal(false);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
    mapMarkerRef.current = null;
  }, []);

  const progressPercent = Math.min(100, Math.round(((currentStep + 1) / STEP_IDS.length) * 100));

  useEffect(() => {
    // Only load while viewing the list. A separate fetch on `landing` (no `q`) could finish after a
    // filtered `prior_list` request and overwrite results — that made search appear broken.
    if (wizardFlow !== 'prior_list') return;

    const controller = new AbortController();
    let cancelled = false;
    const token = getJobCardAuthToken();

    (async () => {
      if (!cancelled) setServerPriorLoading(true);
      if (token) {
        try {
          const params = new URLSearchParams({
            page: '1',
            // Server caps list size; smaller batches keep the prior-card picker fast on phones.
            pageSize: '120',
            sortField: 'updatedAt',
            sortDirection: 'desc'
          });
          if (priorSearchDebounced) params.set('q', priorSearchDebounced);
          if (priorClientId) params.set('clientId', priorClientId);

          const r = await fetch(`/api/jobcards?${params.toString()}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          });
          if (!r.ok) {
            if (!cancelled) setServerPriorList([]);
            return;
          }
          const raw = await r.json();
          const list = raw?.data?.jobCards ?? raw?.jobCards ?? [];
          if (!cancelled) setServerPriorList(Array.isArray(list) ? list : []);
        } catch (e) {
          if (e?.name === 'AbortError') return;
          if (!cancelled) setServerPriorList([]);
        } finally {
          if (!cancelled) setServerPriorLoading(false);
        }
        return;
      }

      const ids = readPublicPriorJobCardIds();
      if (ids.length === 0) {
        if (!cancelled) {
          setServerPriorList([]);
          setServerPriorLoading(false);
        }
        return;
      }
      try {
        const q = encodeURIComponent(ids.join(','));
        const r = await fetch(`/api/public/jobcards?ids=${q}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        if (!r.ok) {
          if (!cancelled) {
            setServerPriorList([]);
            setServerPriorLoading(false);
          }
          return;
        }
        const raw = await r.json();
        const list = raw?.data?.jobCards ?? raw?.jobCards ?? [];
        if (!cancelled) setServerPriorList(Array.isArray(list) ? list : []);
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (!cancelled) setServerPriorList([]);
      } finally {
        if (!cancelled) setServerPriorLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [wizardFlow, priorSearchDebounced, priorClientId, priorListRefreshTick]);

  const mergedPriorJobCards = useMemo(() => {
    if (wizardFlow !== 'prior_list') return [];
    const rows = buildMergedWizardJobCardRows(serverPriorList);
    if (!priorSearchDebounced && !priorClientId) return rows;

    const q = priorSearchDebounced.toLowerCase();
    return rows.filter(jc => {
      if (priorClientId && String(jc.clientId || '') !== priorClientId) return false;
      if (!priorSearchDebounced) return true;
      return priorListLocalSearchHay(jc).includes(q);
    });
  }, [wizardFlow, serverPriorList, localDraftsTick, priorSearchDebounced, priorClientId]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const loadClients = async () => {
      try {
        
        // Always load from cache first
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_clients') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('clients') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        const activeClients = Array.isArray(cached) ? cached.filter(c => {
          const status = (c.status || '').toLowerCase();
          const type = (c.type || 'client').toLowerCase();
          return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
        }) : [];
        
        
        if (activeClients.length > 0) {
          setClients(activeClients);
        }
        
        setIsLoading(false); // Always set loading to false after checking cache

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/clients', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const clients = data?.data?.clients || data?.clients || [];
              
              if (clients.length > 0) {
                setClients(clients);
                try {
                  localStorage.setItem('manufacturing_clients', JSON.stringify(clients));
                  localStorage.setItem('clients', JSON.stringify(clients));
                } catch (e) {
                  if (e.name === 'QuotaExceededError') {
                    const slim = clients.map(c => ({ id: c.id, name: c.name || c.companyName, status: c.status, type: c.type }));
                    try {
                      localStorage.setItem('manufacturing_clients', JSON.stringify(slim));
                      localStorage.setItem('clients', JSON.stringify(slim));
                    } catch (_) {
                      console.warn('JobCardFormPublic: Client cache skipped (storage full)');
                    }
                  }
                }
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public API returned error:', response.status);
              // Try authenticated API as fallback
              if (window.DatabaseAPI?.getClients) {
                try {
                  const response = await window.DatabaseAPI.getClients();
                  if (response?.data?.clients || Array.isArray(response?.data)) {
                    const allClients = response.data.clients || response.data || [];
                    const active = Array.isArray(allClients) ? allClients.filter(c => {
                      const status = (c.status || '').toLowerCase();
                      const type = (c.type || 'client').toLowerCase();
                      return (status === 'active' || status === '' || !c.status) && (type === 'client' || !c.type);
                    }) : [];
                    if (active.length > 0) {
                      setClients(active);
                      try {
                        localStorage.setItem('manufacturing_clients', JSON.stringify(active));
                        localStorage.setItem('clients', JSON.stringify(active));
                      } catch (e) {
                        if (e.name === 'QuotaExceededError') {
                          const slim = active.map(c => ({ id: c.id, name: c.name || c.companyName, status: c.status, type: c.type }));
                          try {
                            localStorage.setItem('manufacturing_clients', JSON.stringify(slim));
                            localStorage.setItem('clients', JSON.stringify(slim));
                          } catch (_) {
                            console.warn('JobCardFormPublic: Client cache skipped (storage full)');
                          }
                        }
                      }
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load clients from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading clients:', error);
        setIsLoading(false);
      }
    };
    loadClients();
  }, [isOnline]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        
        // Always load from cache first
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_users') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('users') || '[]');
        const cached = cached1.length > 0 ? cached1 : cached2;
        
        
        if (cached.length > 0) {
          setUsers(cached);
        }

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/users', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const usersData = data?.data?.users || data?.users || [];
              
              if (usersData.length > 0) {
                setUsers(usersData);
                localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                localStorage.setItem('users', JSON.stringify(usersData));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public API returned error:', response.status);
              // Try authenticated API as fallback
              if (window.DatabaseAPI?.getUsers) {
                try {
                  const response = await window.DatabaseAPI.getUsers();
                  if (response?.data?.users || Array.isArray(response?.data)) {
                    const usersData = response.data.users || response.data || [];
                    if (usersData.length > 0) {
                      setUsers(usersData);
                      localStorage.setItem('manufacturing_users', JSON.stringify(usersData));
                      localStorage.setItem('users', JSON.stringify(usersData));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load users from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading users:', error);
      }
    };
    loadUsers();
  }, [isOnline]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const cached1 = JSON.parse(localStorage.getItem('manufacturing_projects') || '[]');
        const cached2 = JSON.parse(localStorage.getItem('projects') || '[]');
        const cached = Array.isArray(cached1) && cached1.length > 0 ? cached1 : cached2;
        if (Array.isArray(cached) && cached.length > 0) {
          setProjects(cached);
        }

        if (!isOnline) return;
        const token = getJobCardAuthToken();
        if (!token) return;

        try {
          const response = await fetch('/api/projects?limit=500', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            }
          });

          if (response.ok) {
            const data = await response.json();
            const projectRows = data?.data?.projects || data?.projects || [];
            if (Array.isArray(projectRows) && projectRows.length > 0) {
              setProjects(projectRows);
              localStorage.setItem('manufacturing_projects', JSON.stringify(projectRows));
              localStorage.setItem('projects', JSON.stringify(projectRows));
            }
          } else if (window.DatabaseAPI?.getProjects) {
            const dbResp = await window.DatabaseAPI.getProjects({
              limit: 500,
              page: 1,
              includeTaskCount: false
            });
            const projectRows = dbResp?.data?.projects || dbResp?.projects || dbResp?.data || [];
            if (Array.isArray(projectRows) && projectRows.length > 0) {
              setProjects(projectRows);
              localStorage.setItem('manufacturing_projects', JSON.stringify(projectRows));
              localStorage.setItem('projects', JSON.stringify(projectRows));
            }
          }
        } catch (error) {
          console.warn('⚠️ JobCardFormPublic: Failed to load projects:', error.message);
        }
      } catch (error) {
        console.warn('⚠️ JobCardFormPublic: Project cache load failed:', error.message);
      }
    };
    loadProjects();
  }, [isOnline]);

  useEffect(() => {
    const loadStockData = async () => {
      try {
        
        // Always load from cache first
        const cachedInventory = JSON.parse(localStorage.getItem('manufacturing_inventory') || '[]');
        
        if (cachedInventory.length > 0) {
          setInventory(cachedInventory);
        }

        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/inventory', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const inventoryItems = data?.data?.inventory || data?.inventory || [];
              
              if (inventoryItems.length > 0) {
                setInventory(inventoryItems);
                try {
                  localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
                } catch (e) {
                  if (e?.name === 'QuotaExceededError' || e?.code === 22) {
                    console.warn('⚠️ localStorage quota exceeded, skipping manufacturing_inventory cache');
                  } else {
                    throw e;
                  }
                }
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public inventory API returned error:', response.status);
              // Try authenticated API as fallback
              const token = getJobCardAuthToken();
              if (token && window.DatabaseAPI?.getInventory) {
                try {
                  const response = await window.DatabaseAPI.getInventory();
                  if (response?.data?.inventory || Array.isArray(response?.data)) {
                    const inventoryItems = response.data.inventory || response.data || [];
                    if (inventoryItems.length > 0) {
                      setInventory(inventoryItems);
                      try {
                        localStorage.setItem('manufacturing_inventory', JSON.stringify(inventoryItems));
                      } catch (e) {
                        if (e?.name === 'QuotaExceededError' || e?.code === 22) {
                          console.warn('⚠️ localStorage quota exceeded, skipping manufacturing_inventory cache');
                        } else {
                          throw e;
                        }
                      }
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated inventory API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load inventory from public API:', error.message);
          }
        }
        
        
        // Always load from cache first
        const cachedLocations1 = JSON.parse(localStorage.getItem('stock_locations') || '[]');
        const cachedLocations2 = JSON.parse(localStorage.getItem('manufacturing_locations') || '[]');
        const cachedLocations = cachedLocations1.length > 0 ? cachedLocations1 : cachedLocations2;
        
        
        if (cachedLocations.length > 0) {
          setStockLocations(sortJobCardStockLocations(cachedLocations));
        } else {
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse', status: 'active' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle', status: 'active' }
          ];
          const ordered = sortJobCardStockLocations(defaultLocations);
          setStockLocations(ordered);
          localStorage.setItem('stock_locations', JSON.stringify(ordered));
        }
        
        // Try to load from public API endpoint (no auth required)
        if (isOnline) {
          try {
            const response = await fetch('/api/public/locations', {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const locations = data?.data?.locations || data?.locations || [];
              
              if (locations.length > 0) {
                const ordered = sortJobCardStockLocations(locations);
                setStockLocations(ordered);
                localStorage.setItem('stock_locations', JSON.stringify(ordered));
                localStorage.setItem('manufacturing_locations', JSON.stringify(ordered));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public locations API returned error:', response.status);
              // Try authenticated API as fallback
              const token = getJobCardAuthToken();
              if (token && window.DatabaseAPI?.getStockLocations) {
                try {
                  const response = await window.DatabaseAPI.getStockLocations();
                  if (response?.data?.locations || Array.isArray(response?.data)) {
                    const locations = response.data.locations || response.data || [];
                    if (locations.length > 0) {
                      const ordered = sortJobCardStockLocations(locations);
                      setStockLocations(ordered);
                      localStorage.setItem('stock_locations', JSON.stringify(ordered));
                      localStorage.setItem('manufacturing_locations', JSON.stringify(ordered));
                    }
                  }
                } catch (authError) {
                  console.warn('⚠️ JobCardFormPublic: Authenticated locations API also failed:', authError.message);
                }
              }
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load locations from public API:', error.message);
          }
        }
      } catch (error) {
        console.error('❌ JobCardFormPublic: Error loading stock data:', error);
      }
    };
    loadStockData();
  }, [isOnline]);

  useEffect(() => {
    const loadSitesForClient = async () => {
      // When "No Client" is selected, clear sites and rely on manual entry
      if (formData.clientId === NO_CLIENT_ID) {
        setAvailableSites([]);
        setFormData(prev => ({ ...prev, siteId: '', siteName: prev.siteName || '' }));
        return;
      }

      if (formData.clientId && clients.length > 0) {
        const client = clients.find(c => c.id === formData.clientId);

        if (!client) {
          // Client id not found in list – clear available sites
          setAvailableSites([]);
          setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
          return;
        }

        
        // First, try to get sites from client object
        let sites = typeof client.sites === 'string' ? JSON.parse(client.sites || '[]') : (client.sites || []);
        
        
        // Also try to load from API if online
        if (isOnline && sites.length === 0) {
          try {
            const response = await fetch(`/api/public/sites/client/${encodeURIComponent(formData.clientId)}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const apiSites = data?.data?.sites || data?.sites || [];
              if (Array.isArray(apiSites) && apiSites.length > 0) {
                sites = apiSites;
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Sites API returned error:', response.status);
            }
          } catch (error) {
            console.warn('⚠️ JobCardFormPublic: Failed to load sites from API:', error.message);
          }
        }
        
        setAvailableSites(sites);
        setFormData(prev => ({ ...prev, clientName: client.name || '' }));
      } else {
        setAvailableSites([]);
        setFormData(prev => ({ ...prev, siteId: '', siteName: '' }));
      }
    };
    
    loadSitesForClient();
  }, [formData.clientId, clients, isOnline]);

  useEffect(() => {
    resizeSignatureCanvas();

    const handleResize = () => resizeSignatureCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [resizeSignatureCanvas]);

  useEffect(() => {
    if (wizardFlow !== 'form') return;
    if (currentStep !== STEP_IDS.length - 1) return;
    const sig = formData.customerSignature;
    if (typeof sig !== 'string' || !sig.startsWith('data:image')) return;

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      const canvas = signatureCanvasRef.current;
      if (!canvas) return;
      if (lastSignatureRestoreRef.current === sig) return;

      const img = new Image();
      img.onload = () => {
        if (cancelled || lastSignatureRestoreRef.current === sig) return;
        resizeSignatureCanvas();
        const ctx = canvas.getContext('2d');
        const ratio = window.devicePixelRatio || 1;
        const w = canvas.width / ratio;
        const h = canvas.height / ratio;
        ctx.drawImage(img, 0, 0, w, h);
        setHasSignature(true);
        lastSignatureRestoreRef.current = sig;
      };
      img.onerror = () => {};
      img.src = sig;
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [wizardFlow, currentStep, formData.customerSignature, resizeSignatureCanvas]);

  const handleChange = (event) => {
    const { name, value } = event.target;

    if (name === 'projectId') {
      const selectedProject = (projects || []).find(p => String(p.id) === String(value));
      setFormData(prev => ({
        ...prev,
        projectId: value || '',
        projectName:
          selectedProject?.name ||
          selectedProject?.projectName ||
          selectedProject?.title ||
          prev.projectName ||
          ''
      }));
      return;
    }

    // When the client selection changes, clear site selection and handle "No Client"
    if (name === 'clientId') {
      if (value === NO_CLIENT_ID) {
        setFormData(prev => ({
          ...prev,
          clientId: value,
          clientName: prev.clientName || '',
          siteId: '',
          siteName: prev.siteName || ''
        }));
        setAvailableSites([]);
        return;
      }

      setFormData(prev => ({
        ...prev,
        clientId: value,
        siteId: '',
        siteName: ''
      }));
      return;
    }

    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddTechnician = () => {
    const techName = technicianInput.trim();
    if (techName && !formData.otherTechnicians.includes(techName)) {
      setFormData(prev => ({
        ...prev,
        otherTechnicians: [...prev.otherTechnicians, techName]
      }));
      setTechnicianInput('');
    }
  };

  const handleRemoveTechnician = (technician) => {
    setFormData(prev => ({
      ...prev,
      otherTechnicians: prev.otherTechnicians.filter(t => t !== technician)
    }));
  };

  const handlePhotoUpload = (event) => {
    const files = Array.from(event.target.files || []);
    const input = event.target;
    if (files.length === 0) return;

    files.forEach(file => {
      if (!jobCardFileLooksImageOrVideo(file)) {
        alert('Please choose an image or video file.');
        return;
      }
      const isVid = jobCardFileIsVideo(file);
      const maxBytes = isVid ? JOB_CARD_VIDEO_MAX_BYTES : JOB_CARD_IMAGE_MAX_BYTES;
      if (file.size > maxBytes) {
        alert(
          isVid
            ? `Each video must be ${JOB_CARD_VIDEO_MAX_BYTES / 1024 / 1024}MB or smaller.`
            : `Each image must be ${JOB_CARD_IMAGE_MAX_BYTES / 1024 / 1024}MB or smaller.`
        );
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        pushWizardActivity('wizard_media_added', { kind: 'photo' });
        setSelectedPhotos(prev => [...prev, { name: file.name, url: dataUrl, size: file.size }]);
        setFormData(prev => ({ ...prev, photos: [...prev.photos, dataUrl] }));
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  };

  const handleRemovePhoto = (index) => {
    const newPhotos = selectedPhotos.filter((_, idx) => idx !== index);
    setSelectedPhotos(newPhotos);
    setFormData(prev => ({ ...prev, photos: newPhotos.map(photo => typeof photo === 'string' ? photo : photo.url) }));
  };

  const handleSectionWorkMediaUpload = (section, event) => {
    const files = Array.from(event.target.files || []);
    const input = event.target;
    if (files.length === 0) return;

    files.forEach(file => {
      if (!jobCardFileLooksImageOrVideo(file)) {
        alert('Please choose an image or video file.');
        return;
      }
      const isVid = jobCardFileIsVideo(file);
      const maxBytes = isVid ? JOB_CARD_VIDEO_MAX_BYTES : JOB_CARD_IMAGE_MAX_BYTES;
      if (file.size > maxBytes) {
        alert(
          isVid
            ? `Each video must be ${JOB_CARD_VIDEO_MAX_BYTES / 1024 / 1024}MB or smaller.`
            : `Each image must be ${JOB_CARD_IMAGE_MAX_BYTES / 1024 / 1024}MB or smaller.`
        );
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        pushWizardActivity('wizard_media_added', { kind: 'sectionMedia', section });
        setSectionWorkMedia(prev => ({
          ...prev,
          [section]: [...(prev[section] || []), { name: file.name, url: dataUrl, size: file.size }]
        }));
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  };

  const handleRemoveSectionWorkMedia = (section, index) => {
    setSectionWorkMedia(prev => ({
      ...prev,
      [section]: (prev[section] || []).filter((_, i) => i !== index)
    }));
  };

  const handleAddStockItem = () => {
    const selectedLocationId = String(newStockItem.locationId || '');
    const enforcedLocationId = lockedStockLocationId || selectedLocationId;
    if (!enforcedLocationId) {
      alert('Please select the stock location first.');
      return;
    }
    if (
      lockedStockLocationId &&
      selectedLocationId &&
      selectedLocationId !== lockedStockLocationId
    ) {
      alert('You can only use stock from one location per job card.');
      return;
    }
    if (!newStockItem.sku || newStockItem.quantity <= 0) {
      alert('Please select a component with stock at that location, and enter a quantity greater than zero.');
      return;
    }

    const inventoryItem =
      stockRowsAtLocation.find(
        (item) => item.sku === newStockItem.sku || item.id === newStockItem.sku
      ) || inventory.find((item) => item.sku === newStockItem.sku || item.id === newStockItem.sku);
    if (!inventoryItem) {
      alert('Selected component could not be found for this location.');
      return;
    }

    const stockItem = {
      id: Date.now().toString(),
      sku: inventoryItem.sku || inventoryItem.id,
      itemName: inventoryItem.name || '',
      quantity: parseFloat(newStockItem.quantity),
      locationId: enforcedLocationId,
      locationName: stockLocations.find(loc => String(loc.id) === enforcedLocationId)?.name || '',
      unitCost: inventoryItem.unitCost || 0
    };

    setFormData(prev => ({
      ...prev,
      stockUsed: [...prev.stockUsed, stockItem]
    }));
    pushWizardActivity('stock_line_added', { sku: stockItem.sku });
    setNewStockItem((prev) => ({ sku: '', quantity: 0, locationId: enforcedLocationId }));
  };

  const handleRemoveStockItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      stockUsed: prev.stockUsed.filter(item => item.id !== itemId)
    }));
  };

  const handleAddMaterialItem = () => {
    if (!newMaterialItem.itemName || newMaterialItem.cost <= 0) {
      alert('Please provide an item name and a cost greater than zero.');
      return;
    }

    const materialItem = {
      id: Date.now().toString(),
      itemName: newMaterialItem.itemName,
      description: newMaterialItem.description || '',
      reason: newMaterialItem.reason || '',
      cost: parseFloat(newMaterialItem.cost)
    };

    setFormData(prev => ({
      ...prev,
      materialsBought: [...prev.materialsBought, materialItem]
    }));
    pushWizardActivity('material_line_added', {
      itemName: String(materialItem.itemName || '').slice(0, 120)
    });
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
  };

  const handleRemoveMaterialItem = (itemId) => {
    setFormData(prev => ({
      ...prev,
      materialsBought: prev.materialsBought.filter(item => item.id !== itemId)
    }));
  };

  // --- Service form templates loading ----------------------------------------

  useEffect(() => {
    let cancelled = false;

    const loadTemplates = async () => {
      if (!isOnline) {
        // Try to load from cache if offline
        const cached = JSON.parse(localStorage.getItem('service_form_templates') || '[]');
        if (cached.length > 0) {
          setFormTemplates(cached);
        }
        return;
      }

      try {
        setLoadingTemplates(true);
        const response = await fetch('/api/public/service-forms', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.warn('⚠️ JobCardFormPublic: Failed to load form templates', {
            status: response.status,
            statusText: response.statusText
          });
          // Try cache as fallback
          const cached = JSON.parse(localStorage.getItem('service_form_templates') || '[]');
          if (cached.length > 0 && !cancelled) {
            setFormTemplates(cached);
          }
          return;
        }

        const data = await response.json();
        
        // The API wraps responses in { data: ... }, so templates are at data.data.templates
        const templates = Array.isArray(data.data?.templates) 
          ? data.data.templates 
          : Array.isArray(data.templates) 
            ? data.templates 
            : [];
        
        
        if (!cancelled) {
          setFormTemplates(templates);
          // Cache for offline use
          localStorage.setItem('service_form_templates', JSON.stringify(templates));
        }
      } catch (error) {
        console.warn('⚠️ JobCardFormPublic: Error loading form templates:', error);
        // Try cache as fallback
        const cached = JSON.parse(localStorage.getItem('service_form_templates') || '[]');
        if (cached.length > 0 && !cancelled) {
          setFormTemplates(cached);
        }
      } finally {
        if (!cancelled) {
          setLoadingTemplates(false);
        }
      }
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  // --- Service form instance handlers ----------------------------------------

  const ensureServiceFormsArray = (prev) => Array.isArray(prev.serviceForms) ? prev.serviceForms : [];

  const handleAddForm = (templateId) => {
    const template = formTemplates.find(t => t.id === templateId);
    if (!template) return;

    const formId = `form_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setFormData(prev => {
      const existing = ensureServiceFormsArray(prev);
      // Check if this template is already added
      if (existing.some(f => f.templateId === templateId)) {
        alert('This form is already added to the job card.');
        return prev;
      }
      return {
        ...prev,
        serviceForms: [
          ...existing,
          {
            id: formId,
            templateId: template.id,
            templateName: template.name,
            templateVersion: template.version || 1,
            answers: {}
          }
        ]
      };
    });
    pushWizardActivity('service_form_attached_local', {
      templateId: template.id,
      templateName: template.name,
      localFormId: formId
    });
    setShowTemplateModal(false);
  };

  const handleRemoveForm = (formId) => {
    const existing = ensureServiceFormsArray(formData);
    const removed = existing.find(f => f.id === formId);
    if (removed) {
      pushWizardActivity('service_form_removed', {
        formId,
        templateId: removed.templateId,
        templateName: removed.templateName
      });
    }
    setFormData(prev => ({
      ...prev,
      serviceForms: ensureServiceFormsArray(prev).filter(f => f.id !== formId)
    }));
  };

  const handleFormAnswerChange = (formId, fieldId, value) => {
    setFormData(prev => {
      const existing = ensureServiceFormsArray(prev);
      return {
        ...prev,
        serviceForms: existing.map(f => {
          if (f.id !== formId) return f;
          return {
            ...f,
            answers: {
              ...(f.answers || {}),
              [fieldId]: value
            }
          };
        })
      };
    });
  };


  const persistStockMovement = async (movementData) => {
            const cachedMovements = JSON.parse(localStorage.getItem('manufacturing_movements') || '[]');
            cachedMovements.push({
              ...movementData,
              id: `MOV${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              synced: false
            });
            try {
              localStorage.setItem('manufacturing_movements', JSON.stringify(cachedMovements));
            } catch (e) {
              if (e?.name === 'QuotaExceededError' || e?.code === 22) {
                console.warn('⚠️ localStorage quota exceeded, skipping manufacturing_movements cache');
              } else {
                throw e;
              }
            }
            
            if (isOnline && window.DatabaseAPI?.createStockMovement) {
              window.DatabaseAPI.createStockMovement(movementData).catch(err => {
                console.warn('Failed to sync stock movement:', err);
              });
            }
  };

  const syncClientContact = async (jobCardData) => {
    if (!formData.clientId || !window.DatabaseAPI?.updateClient) return;
              const client = clients.find(c => c.id === formData.clientId);
    if (!client) return;

                const activityLog = Array.isArray(client.activityLog) ? client.activityLog : [];
                const newActivityEntry = {
                  id: Date.now(),
                  type: 'Job Card Created',
                  description: `Job card created for ${client.name}${formData.siteName ? ` at ${formData.siteName}` : ''}${formData.location ? ` - ${formData.location}` : ''}`,
                  timestamp: new Date().toISOString(),
                  user: formData.agentName || 'Technician'
                };
                
                const updatedClient = {
                  ...client,
                  lastContact: new Date().toISOString(),
                  activityLog: [...activityLog, newActivityEntry]
                };
                
                await window.DatabaseAPI.updateClient(formData.clientId, {
                  lastContact: updatedClient.lastContact,
                  activityLog: updatedClient.activityLog
                });
                
    const updatedClients = clients.map(clientEntry =>
      clientEntry.id === formData.clientId ? updatedClient : clientEntry
                );
                setClients(updatedClients);
                try {
                  localStorage.setItem('manufacturing_clients', JSON.stringify(updatedClients));
                  localStorage.setItem('clients', JSON.stringify(updatedClients));
                } catch (e) {
                  if (e.name === 'QuotaExceededError') {
                    const slim = updatedClients.map(c => ({ id: c.id, name: c.name || c.companyName, status: c.status, type: c.type }));
                    try {
                      localStorage.setItem('manufacturing_clients', JSON.stringify(slim));
                      localStorage.setItem('clients', JSON.stringify(slim));
                    } catch (_) {}
                  }
                }
  };

  const resetForm = () => {
      setFormData({
        agentName: '',
        otherTechnicians: [],
        projectId: '',
        projectName: '',
        clientId: '',
        clientName: '',
        siteId: '',
        siteName: '',
        location: '',
        latitude: '',
        longitude: '',
        timeOfDeparture: '',
        timeOfArrival: '',
        vehicleUsed: '',
        kmReadingBefore: '',
        kmReadingAfter: '',
        reasonForVisit: '',
        diagnosis: '',
        futureWorkRequired: '',
        futureWorkScheduledAt: '',
        actionsTaken: '',
        otherComments: '',
        stockUsed: [],
        materialsBought: [],
        photos: [],
        // Reset service forms
        serviceForms: [],
        status: 'draft',
        customerName: '',
        customerTitle: '',
        customerFeedback: '',
        customerSignDate: '',
        customerSignature: ''
      });
      setSelectedPhotos([]);
      setSectionWorkMedia(emptySectionWorkMedia());
      setTechnicianInput('');
      setNewStockItem({ sku: '', quantity: 0, locationId: '' });
      setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setVoiceAttachments([]);
    setCurrentStep(0);
    lastSignatureRestoreRef.current = null;
    sessionActivityQueueRef.current = [];
    clearSignature();
  };

  const exitToMenu = () => {
    setEditingMeta(null);
    sessionActivityQueueRef.current = [];
    setPriorLoadedActivities([]);
    setPriorActivityLoading(false);
    resetForm();
    setWizardFlow('landing');
  };

  const startNewJobCard = () => {
    setEditingMeta(null);
    sessionActivityQueueRef.current = [];
    setPriorLoadedActivities([]);
    setPriorActivityLoading(false);
    resetForm();
    setWizardFlow('form');
  };

  const openPriorList = () => {
    setWizardFlow('prior_list');
  };

  const handleSelectPriorCard = async card => {
    const openId = getPriorCardOpenId(card);
    if (!openId) {
      console.warn('JobCardFormPublic: prior card missing id', card);
      try {
        alert('This job card could not be opened (missing reference). Refresh the page or sign in again.');
      } catch {
        /* ignore */
      }
      return;
    }
    lastSignatureRestoreRef.current = null;
    clearSignature();
    sessionActivityQueueRef.current = [];
    setOpeningJobCard(true);

    try {
    let full = card;
    const token = getJobCardAuthToken();
    if (token) {
      setPriorLoadedActivities([]);
      setPriorActivityLoading(true);
      try {
        const headers = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        };
        const [r, actR] = await Promise.all([
          fetch(`/api/jobcards/${encodeURIComponent(openId)}?omitPhotos=1`, { headers }),
          fetch(`/api/jobcards/${encodeURIComponent(openId)}/activity?order=asc`, { headers })
        ]);
        if (actR.ok) {
          try {
            const aj = await actR.json();
            const acts = aj?.data?.activities ?? aj?.activities;
            setPriorLoadedActivities(
              sortJobCardActivitiesChronological(Array.isArray(acts) ? acts : [])
            );
          } catch {
            setPriorLoadedActivities([]);
          }
        } else {
          setPriorLoadedActivities([]);
        }
        if (r.ok) {
          const data = await r.json();
          const apiCard = data?.data?.jobCard ?? data?.jobCard;
          if (apiCard && apiCard.id) {
            full = apiCard;
            if (apiCard.attachmentsPending === true) {
              try {
                const pr = await fetch(`/api/jobcards/${encodeURIComponent(openId)}/photos`, {
                  headers
                });
                if (pr.ok) {
                  const pd = await pr.json();
                  const photos = pd?.data?.photos ?? pd?.photos;
                  full = {
                    ...apiCard,
                    photos: Array.isArray(photos) ? photos : [],
                    attachmentsPending: false
                  };
                } else {
                  full = { ...apiCard, photos: [], attachmentsPending: false };
                }
              } catch {
                full = { ...apiCard, photos: [], attachmentsPending: false };
              }
            }
          }
        }
      } catch (e) {
        console.warn('JobCardFormPublic: could not load full job card from server', e);
        setPriorLoadedActivities([]);
      } finally {
        setPriorActivityLoading(false);
      }
    } else {
      setPriorLoadedActivities([]);
      setPriorActivityLoading(false);
      try {
        const r = await fetch(`/api/public/jobcards/${encodeURIComponent(openId)}`, {
          headers: { 'Content-Type': 'application/json' }
        });
        if (r.ok) {
          const data = await r.json();
          const apiCard = data?.data?.jobCard ?? data?.jobCard;
          if (apiCard && apiCard.id) {
            full = apiCard;
          }
        }
      } catch (e) {
        console.warn('JobCardFormPublic: could not load job card (public GET)', e);
      }
    }

    const localId = String(full.id != null ? full.id : openId);
    const serverJobCardId =
      full.serverJobCardId ||
      (isLikelyServerJobCardId(full.id != null ? full.id : openId)
        ? String(full.id != null ? full.id : openId)
        : null) ||
      null;
    const createdAt = full.createdAt || new Date().toISOString();
    const synced =
      full.source === 'local' || full.synced === false
        ? false
        : Boolean(full.synced) || Boolean(serverJobCardId);
    const jobCardNumber = full.jobCardNumber || '';

    setEditingMeta({
      localId,
      serverJobCardId,
      createdAt,
      synced,
      jobCardNumber
    });

    const photosRaw = parseStoredJsonArray(full.photos, []);
    const voiceEntries = photosRaw.filter(
      p => p && typeof p === 'object' && p.kind === 'voice'
    );
    const sectionMediaEntries = photosRaw.filter(
      p => p && typeof p === 'object' && p.kind === 'sectionMedia'
    );
    const imageUrls = photosRaw
      .filter(p => {
        if (typeof p === 'string') return true;
        if (!p || typeof p !== 'object') return false;
        if (p.kind === 'voice' || p.kind === 'sectionMedia') return false;
        return true;
      })
      .map(p => (typeof p === 'string' ? p : p && p.url))
      .filter(Boolean);

    const restoredSectionMedia = emptySectionWorkMedia();
    sectionMediaEntries.forEach(item => {
      const sec = item.section;
      if (restoredSectionMedia[sec] != null) {
        restoredSectionMedia[sec].push({
          name: item.name || `Attachment ${restoredSectionMedia[sec].length + 1}`,
          url: item.url
        });
      }
    });
    setSectionWorkMedia(restoredSectionMedia);

    setVoiceAttachments(
      voiceEntries.map((v, i) => ({
        id: `vn_restore_${i}_${Date.now()}`,
        section: v.section || 'otherComments',
        dataUrl: v.url || v.dataUrl || '',
        mimeType: v.mimeType || 'audio/webm',
        noteNumber: i + 1
      }))
    );
    setSelectedPhotos(imageUrls.map((url, i) => ({ name: `Photo ${i + 1}`, url })));

    const parsedProject = parseProjectAssociationFromComments(full.otherComments || '');

    setFormData(prev => ({
      ...prev,
      agentName: full.agentName || '',
      otherTechnicians: parseStoredJsonArray(full.otherTechnicians, []),
      projectId: full.projectId || parsedProject.projectId || '',
      projectName: full.projectName || parsedProject.projectName || '',
      clientId: full.clientId || '',
      clientName: full.clientName || '',
      siteId: full.siteId || '',
      siteName: full.siteName || '',
      location: full.location || '',
      latitude:
        full.latitude != null && full.latitude !== ''
          ? String(full.latitude)
          : full.locationLatitude != null && full.locationLatitude !== ''
            ? String(full.locationLatitude)
            : '',
      longitude:
        full.longitude != null && full.longitude !== ''
          ? String(full.longitude)
          : full.locationLongitude != null && full.locationLongitude !== ''
            ? String(full.locationLongitude)
            : '',
      timeOfDeparture: toDatetimeLocalInput(full.timeOfDeparture),
      timeOfArrival: toDatetimeLocalInput(full.timeOfArrival),
      vehicleUsed: full.vehicleUsed || '',
      kmReadingBefore: full.kmReadingBefore != null ? String(full.kmReadingBefore) : '',
      kmReadingAfter: full.kmReadingAfter != null ? String(full.kmReadingAfter) : '',
      reasonForVisit: full.reasonForVisit || '',
      diagnosis: full.diagnosis || '',
      futureWorkRequired: full.futureWorkRequired || '',
      futureWorkScheduledAt: toDatetimeLocalInput(full.futureWorkScheduledAt),
      actionsTaken: full.actionsTaken || '',
      otherComments: full.otherComments || '',
      stockUsed: parseStoredJsonArray(full.stockUsed, []),
      materialsBought: parseStoredJsonArray(full.materialsBought, []),
      photos: imageUrls,
      serviceForms: parseStoredJsonArray(full.serviceForms, []),
      status: full.status || 'draft',
      customerName: full.customerName || '',
      customerTitle: full.customerTitle || full.customerPosition || '',
      customerFeedback: full.customerFeedback || '',
      customerSignDate: full.customerSignDate
        ? String(full.customerSignDate).slice(0, 10)
        : '',
      customerSignature: full.customerSignature || ''
    }));

    setTechnicianInput('');
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setCurrentStep(0);
    setStepError('');
    setWizardFlow('form');
    } catch (err) {
      console.error('JobCardFormPublic: failed to open prior job card', err);
      try {
        alert('Could not open this job card. Try again, or refresh the page.');
      } catch {
        /* ignore */
      }
    } finally {
      setOpeningJobCard(false);
    }
  };

  const handleSave = async () => {
    if (!formData.clientId) {
      setStepError('Please select a client or choose "No Client" before submitting.');
      setCurrentStep(0);
      return;
    }
    if (!formData.agentName) {
      setStepError('Please select the attending technician.');
      setCurrentStep(0);
      return;
    }

    const normalizedStatus = ['draft', 'submitted', 'completed'].includes(formData.status)
      ? formData.status
      : 'draft';
    const signatureForSave =
      exportSignature() ||
      (typeof formData.customerSignature === 'string' ? formData.customerSignature.trim() : '');
    if (normalizedStatus === 'completed' && !signatureForSave) {
      setStepError('A customer signature is required when the job status is Completed.');
      setCurrentStep(STEP_IDS.length - 1);
      return;
    }

    setIsSubmitting(true);
    setStepError('');
    try {
      const nowIso = new Date().toISOString();
      const jobCardData = {
        ...formData,
        customerSignature: signatureForSave,
        customerPosition: formData.customerTitle || '',
        id: editingMeta?.localId ?? Date.now().toString(),
        createdAt: editingMeta?.createdAt ?? nowIso,
        updatedAt: nowIso,
        synced: editingMeta?.synced ?? false,
        jobCardNumber: editingMeta?.jobCardNumber || '',
        serverJobCardId: editingMeta?.serverJobCardId || null
      };

      if (!jobCardData.projectName && jobCardData.projectId) {
        const selectedProject = (projects || []).find(
          p => String(p.id) === String(jobCardData.projectId)
        );
        jobCardData.projectName =
          selectedProject?.name || selectedProject?.projectName || selectedProject?.title || '';
      }

      {
        const existingLines = String(jobCardData.otherComments || '')
          .split('\n')
          .filter(line => line && !line.startsWith(PROJECT_ASSOCIATION_PREFIX));
        if (jobCardData.projectName) {
          const projectAssociationLine = `${PROJECT_ASSOCIATION_PREFIX} ${jobCardData.projectName}${
            jobCardData.projectId ? ` (${jobCardData.projectId})` : ''
          }`;
          jobCardData.otherComments = [projectAssociationLine, ...existingLines]
            .filter(Boolean)
            .join('\n');
        } else {
          jobCardData.otherComments = existingLines.join('\n');
        }
      }

      const kmBefore = parseFloat(formData.kmReadingBefore) || 0;
      const kmAfter = parseFloat(formData.kmReadingAfter) || 0;
      jobCardData.travelKilometers = Math.max(0, kmAfter - kmBefore);
      jobCardData.totalMaterialsCost = totalMaterialCost;

      const voicePhotoEntries = voiceAttachments.map(v => ({
        kind: 'voice',
        section: v.section,
        url: v.dataUrl,
        mimeType: v.mimeType || 'audio/webm'
      }));
      const sectionPhotoEntries = SECTION_WORK_MEDIA_KEYS.flatMap(sec =>
        (sectionWorkMedia[sec] || []).map(item => ({
          kind: 'sectionMedia',
          section: sec,
          url: item.url,
          name: item.name || ''
        }))
      );
      jobCardData.photos = [...(formData.photos || []), ...sectionPhotoEntries, ...voicePhotoEntries];

      jobCardData.status = normalizedStatus;
      if (normalizedStatus === 'draft') {
        jobCardData.submittedAt = null;
        jobCardData.completedAt = null;
      } else if (normalizedStatus === 'submitted') {
        jobCardData.submittedAt = nowIso;
        jobCardData.completedAt = null;
      } else {
        jobCardData.submittedAt = nowIso;
        jobCardData.completedAt = nowIso;
      }
      if (jobCardData.clientId === NO_CLIENT_ID) {
        jobCardData.clientId = null;
      }

      const prevPending = readLocalPendingJobCards().find(
        c => c && String(c.id) === String(jobCardData.id)
      );
      jobCardData.activityQueue = Array.isArray(prevPending?.activityQueue)
        ? [...prevPending.activityQueue]
        : [];

      if (formData.stockUsed && formData.stockUsed.length > 0) {
        const jobCardReference = `Job Card ${jobCardData.id}`;
        for (const stockItem of formData.stockUsed) {
          if (!stockItem.locationId || !stockItem.sku || stockItem.quantity <= 0) {
            console.warn('Skipping invalid stock item:', stockItem);
            continue;
          }

          const movementData = {
            type: 'consumption',
            sku: stockItem.sku,
            itemName: stockItem.itemName || '',
            quantity: parseFloat(stockItem.quantity),
            unitCost: stockItem.unitCost ? parseFloat(stockItem.unitCost) : undefined,
            fromLocation: stockItem.locationId,
            toLocation: '',
            reference: jobCardReference,
            notes: `Stock used in job card: ${jobCardReference}${formData.location ? ` - Location: ${formData.location}` : ''}`,
            date: new Date().toISOString()
          };

          await persistStockMovement(movementData);
        }
      }

      const serverJobCardId =
        editingMeta?.serverJobCardId ||
        (editingMeta?.localId && isLikelyServerJobCardId(editingMeta.localId)
          ? String(editingMeta.localId)
          : null);

      let serverReachOk = false;
      let lastSyncError = '';
      let resolvedServerId = null;

      const parseSyncFailureMessage = (status, text) => {
        if (status === 413) {
          return 'Payload too large for the server (try fewer or smaller photos/videos).';
        }
        if (!text) return `HTTP ${status}`;
        try {
          const j = JSON.parse(text);
          return (
            j?.error?.message ||
            j?.message ||
            j?.data?.message ||
            (typeof text === 'string' ? text.slice(0, 280) : String(text))
          );
        } catch {
          return typeof text === 'string' ? text.slice(0, 280) : String(text);
        }
      };

      const attemptPostCreate = async () => {
        const createPayload = { ...jobCardData };
        delete createPayload.id;
        delete createPayload.serverJobCardId;
        delete createPayload.activityQueue;
        const token = getJobCardAuthToken();
        if (!token) {
          lastSyncError = 'Sign in is required to save the job card to the server.';
          return { ok: false, serverId: null };
        }
        try {
          const response = await fetch('/api/jobcards', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(createPayload)
          });
          const text = await response.text().catch(() => '');
          if (!response.ok) {
            lastSyncError = parseSyncFailureMessage(response.status, text);
            console.warn('⚠️ JobCardFormPublic: POST /api/jobcards error', response.status, text);
            return { ok: false, serverId: null };
          }
          let result = {};
          try {
            result = text ? JSON.parse(text) : {};
          } catch {
            result = {};
          }
          const jc = result?.data?.jobCard ?? result?.jobCard;
          const sid = jc?.id ? String(jc.id) : null;
          if (sid) {
            rememberPublicPriorJobCardId(sid);
          }
          return { ok: true, serverId: sid };
        } catch (error) {
          lastSyncError = error.message || 'Network error';
          console.warn('⚠️ JobCardFormPublic: POST /api/jobcards failed:', error.message);
          return { ok: false, serverId: null };
        }
      };

      if (serverJobCardId) {
        resolvedServerId = serverJobCardId;
        const payloadObj = { ...jobCardData };
        delete payloadObj.activityQueue;
        const payloadJson = JSON.stringify(payloadObj);
        const token = getJobCardAuthToken();
        let patchStatus = 0;
        if (token) {
          try {
            const authRes = await fetch(`/api/jobcards/${encodeURIComponent(serverJobCardId)}`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: payloadJson
            });
            patchStatus = authRes.status;
            if (authRes.ok) {
              serverReachOk = true;
              const authData = await authRes.json().catch(() => ({}));
              const ac = authData.data?.jobCard || authData.jobCard;
              if (ac?.id) {
                rememberPublicPriorJobCardId(String(ac.id));
                resolvedServerId = String(ac.id);
              }
            } else {
              const text = await authRes.text().catch(() => '');
              lastSyncError = parseSyncFailureMessage(authRes.status, text);
            }
          } catch (e) {
            console.warn('JobCardFormPublic: authenticated PATCH failed', e);
            lastSyncError = e.message || 'Network error';
          }
        } else {
          lastSyncError = 'Sign in is required to update this job card on the server.';
        }
        if (!serverReachOk && patchStatus === 404) {
          const postResult = await attemptPostCreate();
          serverReachOk = postResult.ok;
          if (postResult.serverId) {
            resolvedServerId = postResult.serverId;
          }
        }
      } else {
        const postResult = await attemptPostCreate();
        serverReachOk = postResult.ok;
        resolvedServerId = postResult.serverId;
      }

      if (serverReachOk && resolvedServerId && jobCardData.activityQueue?.length) {
        await flushJobCardActivityQueue(resolvedServerId, jobCardData.activityQueue);
      }

      if (serverReachOk) {
        sessionActivityQueueRef.current = [];
        removeLocalPendingJobCard(jobCardData.id);
        try {
          alert('Job card saved.');
        } catch {
          /* ignore */
        }
      } else {
        const q = [...(jobCardData.activityQueue || [])];
        q.push({
          action: normalizedStatus === 'draft' ? 'draft_saved_local' : 'saved_local_pending_sync',
          metadata: { status: normalizedStatus },
          source: 'mobile'
        });
        upsertLocalPendingJobCard({ ...jobCardData, activityQueue: q });
        setLocalDraftsTick(t => t + 1);
        const hint = lastSyncError ? `\n\nDetails: ${lastSyncError}` : '';
        alert(
          `⚠️ Saved on this device only (not synced).${hint}\n\nCheck your connection or try again with smaller photos. Open “View or Edit Existing Job Card” to resubmit.`
        );
      }
      setEditingMeta(null);
      resetForm();
      setWizardFlow('landing');
    } catch (error) {
      console.error('Error saving job card:', error);
      alert(`Failed to save job card: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const validateStep = (stepIndex) => {
    switch (STEP_IDS[stepIndex]) {
      case 'assignment':
        if (!formData.agentName) return 'Select the attending technician to continue.';
        if (!formData.clientId) return 'Select a client or choose "No Client" to continue.';
        return '';
      default:
        return '';
    }
  };

  const goToStep = (stepIndex) => {
    if (stepIndex === currentStep) return;
    // Already-submitted cards: allow moving between steps to review (saved data may not re-pass assignment checks).
    if (stepIndex > currentStep && !editingMeta?.synced) {
      const validationError = validateStep(currentStep);
      if (validationError) {
        setStepError(validationError);
        return;
      }
    }
    setStepError('');
    pushWizardActivity('wizard_step_entered', { stepId: STEP_IDS[stepIndex] });
    setCurrentStep(stepIndex);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = () => {
    if (!editingMeta?.synced) {
      const errorMessage = validateStep(currentStep);
      if (errorMessage) {
        setStepError(errorMessage);
        return;
      }
    }
    setStepError('');
    const nextIdx = Math.min(currentStep + 1, STEP_IDS.length - 1);
    if (nextIdx !== currentStep) {
      pushWizardActivity('wizard_step_entered', { stepId: STEP_IDS[nextIdx] });
    }
    setCurrentStep(prev => Math.min(prev + 1, STEP_IDS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevious = () => {
    setStepError('');
    const prevIdx = Math.max(currentStep - 1, 0);
    if (prevIdx !== currentStep) {
      pushWizardActivity('wizard_step_entered', { stepId: STEP_IDS[prevIdx] });
    }
    setCurrentStep(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderAssignmentStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Lead Technician</h2>
          <p className="text-sm text-gray-500 mt-1">Assign the primary technician responsible for this job card.</p>
        </header>
        <div>
          <label htmlFor="lead-technician" className="block text-sm font-medium text-gray-700 mb-2">
            Technician <span className="text-red-500">*</span>
          </label>
          <SearchableSelect
            id="lead-technician"
            name="agentName"
            aria-label="Lead technician"
            value={formData.agentName}
            onChange={v => handleChange({ target: { name: 'agentName', value: v } })}
            options={leadTechnicianOptions}
            placeholder="Tap to choose or search…"
            required
          />
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Team Members</h2>
          <p className="text-sm text-gray-500 mt-1">Add additional technicians assisting on-site.</p>
        </header>
            <div className="flex flex-col sm:flex-row gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  id="team-technician"
                  aria-label="Technician"
                  value={technicianInput}
                  onChange={v => setTechnicianInput(v)}
                  options={teamTechnicianOptions}
                  placeholder="Search…"
                />
              </div>
              <button
                type="button"
                onClick={handleAddTechnician}
                disabled={!technicianInput}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add
              </button>
            </div>
            {formData.otherTechnicians.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
                {formData.otherTechnicians.map((technician, idx) => (
                  <span key={idx} className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-sm">
                    {technician}
                    <button
                      type="button"
                      onClick={() => handleRemoveTechnician(technician)}
                      className="hover:text-blue-950 ml-1"
                      title="Remove"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Client & Site</h2>
          <p className="text-sm text-gray-500 mt-1">Link this visit to a client and optional customer site.</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Client *
            </label>
            <SearchableSelect
              id="jobcard-client"
              name="clientId"
              aria-label="Client"
              value={formData.clientId}
              onChange={v => handleChange({ target: { name: 'clientId', value: v } })}
              options={clientSelectOptions}
              placeholder="Search clients…"
              required
            />
          </div>
          {formData.clientId === NO_CLIENT_ID ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Client Name (manual)
                </label>
                <input
                  type="text"
                  name="clientName"
                  value={formData.clientName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Enter client name"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site (manual)
                </label>
                <input
                  type="text"
                  name="siteName"
                  value={formData.siteName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Enter site / location"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Site
              </label>
              <SearchableSelect
                id="jobcard-site"
                name="siteId"
                aria-label="Site"
                value={formData.siteId}
                onChange={v => handleChange({ target: { name: 'siteId', value: v } })}
                options={siteSelectOptions}
                placeholder={
                  availableSites.length === 0 && formData.clientId && formData.clientId !== NO_CLIENT_ID
                    ? 'No sites for this client'
                    : 'Search sites…'
                }
                disabled={!formData.clientId || formData.clientId === NO_CLIENT_ID || availableSites.length === 0}
              />
            </div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Project Association</h2>
          <p className="text-sm text-gray-500 mt-1">Link this visit to a project (optional).</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project
            </label>
            <SearchableSelect
              id="jobcard-project"
              name="projectId"
              aria-label="Project"
              value={formData.projectId}
              onChange={v => handleChange({ target: { name: 'projectId', value: v } })}
              options={projectSelectOptions}
              placeholder={
                projectSelectOptions.length === 0
                  ? formData.clientId && formData.clientId !== NO_CLIENT_ID
                    ? 'No projects linked to selected client'
                    : 'No projects available'
                  : 'Search projects…'
              }
              disabled={projectSelectOptions.length === 0}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Project Name (manual)
            </label>
            <input
              type="text"
              name="projectName"
              value={formData.projectName}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              placeholder="Enter project name if not listed"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </section>
      {renderNavigationButtons()}
    </div>
  );

  const renderVisitStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Visit Details</h2>
          <p className="text-sm text-gray-500 mt-1">Capture the customer location and call-out reason.</p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Location
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="flex-1 px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Facility, area or coordinates"
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleOpenMap}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 touch-manipulation"
                title="Select location on map"
              >
                <i className="fas fa-map-marker-alt"></i>
              </button>
            </div>
            {formData.latitude && formData.longitude && (
              <p className="text-xs text-gray-500 mt-1">
                Coordinates: {formData.latitude}, {formData.longitude}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for Call Out / Visit
            </label>
            <VoiceNoteTextarea
              sectionId="reasonForVisit"
              name="reasonForVisit"
              value={formData.reasonForVisit}
              onChange={handleChange}
              rows={3}
              placeholder="Why was the technician requested to attend?"
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'reasonForVisit')}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Travel & Timing</h2>
          <p className="text-sm text-gray-500 mt-1">Record departure, arrival, vehicle and kilometer readings.</p>
        </header>
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time of Departure
                </label>
                <input
                  type="datetime-local"
                  name="timeOfDeparture"
                  value={formData.timeOfDeparture}
                  onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time of Arrival
                </label>
                <input
                  type="datetime-local"
                  name="timeOfArrival"
                  value={formData.timeOfArrival}
                  onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
                />
            </div>
          </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Vehicle Used
                </label>
                <input
                  type="text"
                  name="vehicleUsed"
                  value={formData.vehicleUsed}
                  onChange={handleChange}
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., AB12 CD GP"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KM Reading Before
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  name="kmReadingBefore"
                  value={formData.kmReadingBefore}
                  onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  KM Reading After
                </label>
                <input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  name="kmReadingAfter"
                  value={formData.kmReadingAfter}
                  onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.0"
                style={{ fontSize: '16px' }}
                />
            </div>
          </div>

          {travelKm > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <i className="fas fa-road text-blue-600"></i>
              <p className="text-sm font-medium text-blue-950">
                Travel Distance: {travelKm.toFixed(1)} km
              </p>
            </div>
          )}
        </div>
      </section>
      {renderNavigationButtons()}
    </div>
  );

  const renderWorkStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Diagnosis</h2>
          <p className="text-sm text-gray-500 mt-1">Summarise the fault, findings or observations.</p>
        </header>
        <label className="mb-2 block text-sm font-medium text-gray-700">Diagnosis Notes</label>
            <VoiceNoteTextarea
              sectionId="diagnosis"
              name="diagnosis"
              value={formData.diagnosis}
              onChange={handleChange}
              rows={4}
              placeholder="e.g., Pump not priming due to airlock in suction line..."
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'diagnosis')}
            />
            <WorkSectionMediaAttachments
              sectionKey="diagnosis"
              items={sectionWorkMedia.diagnosis}
              onUpload={handleSectionWorkMediaUpload}
              onRemove={handleRemoveSectionWorkMedia}
            />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Actions Taken</h2>
            <p className="text-sm text-gray-500 mt-1">
              Detail the corrective actions and resolution steps.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => setShowTemplateModal(true)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500"
            >
              <i className="fa-solid fa-list-check text-xs" />
              <span>Add a Checklist</span>
            </button>
            <p className="text-[11px] text-gray-400 max-w-xs text-right">
              Select a form template created by your admin to complete as part of this job.
            </p>
          </div>
        </header>
        <label className="mb-2 block text-sm font-medium text-gray-700">Actions Completed</label>
            <VoiceNoteTextarea
              sectionId="actionsTaken"
              name="actionsTaken"
              value={formData.actionsTaken}
              onChange={handleChange}
              rows={4}
              placeholder="Steps taken, parts replaced, calibrations performed..."
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'actionsTaken')}
            />
            <WorkSectionMediaAttachments
              sectionKey="actionsTaken"
              items={sectionWorkMedia.actionsTaken}
              onUpload={handleSectionWorkMediaUpload}
              onRemove={handleRemoveSectionWorkMedia}
            />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Future Work</h2>
          <p className="text-sm text-gray-500 mt-1">
            Capture additional work required and schedule the next visit date/time.
          </p>
        </header>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Future Work Required
            </label>
            <VoiceNoteTextarea
              sectionId="futureWorkRequired"
              name="futureWorkRequired"
              value={formData.futureWorkRequired}
              onChange={handleChange}
              rows={3}
              placeholder="Describe remaining tasks, parts to source, or follow-up work needed..."
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'futureWorkRequired')}
            />
            <WorkSectionMediaAttachments
              sectionKey="futureWorkRequired"
              items={sectionWorkMedia.futureWorkRequired}
              onUpload={handleSectionWorkMediaUpload}
              onRemove={handleRemoveSectionWorkMedia}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Scheduled Follow-up Date & Time
            </label>
            <input
              type="datetime-local"
              name="futureWorkScheduledAt"
              value={formData.futureWorkScheduledAt}
              onChange={handleChange}
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Additional Notes</h2>
          <p className="text-sm text-gray-500 mt-1">Capture handover notes, risks or recommended next actions.</p>
        </header>
        <label className="mb-2 block text-sm font-medium text-gray-700">General Notes</label>
        <VoiceNoteTextarea
          sectionId="otherComments"
          name="otherComments"
          value={formData.otherComments}
          onChange={handleChange}
          rows={3}
          placeholder="Outstanding concerns, customer requests, safety notes..."
          onVoiceSaved={addVoiceClip}
          onVoiceClipUpdate={updateVoiceClip}
          voiceClips={voiceAttachments.filter(c => c.section === 'otherComments')}
        />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Photos & video</h2>
            <p className="text-sm text-gray-500 mt-1">Add photos or short videos of the site, fault, or work completed (optional).</p>
          </div>
          {totalPhotoVideoCount > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {totalPhotoVideoCount} attachment{totalPhotoVideoCount === 1 ? '' : 's'}
            </span>
          )}
        </header>
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
          <input
            type="file"
            id="photoUploadWork"
            onChange={handlePhotoUpload}
            className="hidden"
            accept="image/*,video/*"
            multiple
          />
          <label
            htmlFor="photoUploadWork"
            className="cursor-pointer block"
          >
            <span className="inline-flex items-center justify-center gap-3 text-gray-400 mb-2">
              <i className="fas fa-camera text-3xl sm:text-4xl" />
              <i className="fas fa-video text-2xl sm:text-3xl" />
            </span>
            <p className="text-sm sm:text-base text-gray-600">
              Tap to add photos or videos
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Mobile camera or gallery • Images up to 10MB • Videos up to 50MB each
            </p>
          </label>
        </div>
        {selectedPhotos.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {selectedPhotos.map((photo, idx) => (
              <JobCardWizardAttachmentPreview
                key={idx}
                url={typeof photo === 'string' ? photo : photo.url}
                index={idx}
                onRemove={handleRemovePhoto}
              />
            ))}
          </div>
        )}
      </section>

      {/* Service forms attached to this job card */}
      {Array.isArray(formData.serviceForms) && formData.serviceForms.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
          <header className="mb-4">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <i className="fa-solid fa-list-check text-xs" />
              </span>
              Job Checklists & Forms
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Complete these forms as part of your work documentation.
            </p>
          </header>

          <div className="space-y-4">
            {formData.serviceForms.map((form) => {
              const template = formTemplates.find(t => t.id === form.templateId);
              const fields = Array.isArray(template?.fields) ? template.fields : [];
              const answers = form.answers || {};

              return (
                <div
                  key={form.id}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900">
                        {form.templateName || template?.name || 'Form'}
                      </h4>
                      {template?.description && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveForm(form.id)}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-full border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200"
                      aria-label="Remove form"
                    >
                      <i className="fa-solid fa-trash text-xs" />
                    </button>
                  </div>

                  {fields.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      This form has no fields configured.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {fields.map((field, idx) => {
                        const fieldId = field.id || `field_${idx}`;
                        const value = answers[fieldId] ?? '';

                        // Handle conditional visibility
                        if (field.visibilityCondition && field.visibilityCondition.fieldId) {
                          const refValue = String(answers[field.visibilityCondition.fieldId] || '').toLowerCase();
                          const expected = String(field.visibilityCondition.equals || '').toLowerCase();
                          if (!expected || refValue !== expected) {
                            return null;
                          }
                        }

                        const controlId = `${form.id}_${fieldId}`;
                        const selectOptionsFromField = Array.isArray(field.options)
                          ? field.options.filter(Boolean).map(opt => ({ value: opt, label: opt }))
                          : [];

                        return (
                          <div key={fieldId} className="space-y-1">
                            <label
                              htmlFor={controlId}
                              className="flex items-center justify-between gap-2 text-xs font-medium text-gray-700"
                            >
                              <span>{field.label || 'Field'}</span>
                              {field.required && (
                                <span className="text-[10px] font-semibold text-red-600">
                                  Required
                                </span>
                              )}
                            </label>
                            {field.type === 'textarea' ? (
                              <VoiceNoteTextarea
                                sectionId={`form_${form.id}_${fieldId}`}
                                name={fieldId}
                                value={value}
                                onChange={e => handleFormAnswerChange(form.id, fieldId, e.target.value)}
                                rows={3}
                                onVoiceSaved={addVoiceClip}
                                onVoiceClipUpdate={updateVoiceClip}
                                voiceClips={voiceAttachments.filter(
                                  c => c.section === `form_${form.id}_${fieldId}`
                                )}
                              />
                            ) : field.type === 'number' ? (
                              <input
                                type="number"
                                id={controlId}
                                value={value}
                                onChange={e => handleFormAnswerChange(form.id, fieldId, e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            ) : field.type === 'checkbox' ? (
                              <SearchableSelect
                                id={controlId}
                                value={value}
                                onChange={v => handleFormAnswerChange(form.id, fieldId, v)}
                                options={[
                                  { value: 'yes', label: 'Yes' },
                                  { value: 'no', label: 'No' }
                                ]}
                                placeholder="Yes or No…"
                              />
                            ) : field.type === 'select' ? (
                              <SearchableSelect
                                id={controlId}
                                value={value}
                                onChange={v => handleFormAnswerChange(form.id, fieldId, v)}
                                options={selectOptionsFromField}
                                placeholder="Search…"
                              />
                            ) : (
                              <input
                                type="text"
                                id={controlId}
                                value={value}
                                onChange={e => handleFormAnswerChange(form.id, fieldId, e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            )}
                            {field.helpText && (
                              <p className="text-[10px] text-gray-500">
                                {field.helpText}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Template selection modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Select a Form</h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="p-4">
              {loadingTemplates ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Loading forms...</p>
                </div>
              ) : formTemplates.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">
                    No form templates available. Ask your admin to create forms in the form builder.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {formTemplates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleAddForm(template.id)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition"
                    >
                      <div className="font-medium text-sm text-gray-900">{template.name}</div>
                      {template.description && (
                        <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        {Array.isArray(template.fields) ? template.fields.length : 0} field{template.fields?.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {renderNavigationButtons()}
    </div>
  );

  const renderStockStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <WizardStepPageHeader stepIndex={STEP_IDS.indexOf('stock')} stepId="stock" />
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Stock Used</h2>
            <p className="text-sm text-gray-500 mt-1">Record components issued from inventory for this job.</p>
          </div>
          {formData.stockUsed.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {formData.stockUsed.length} item{formData.stockUsed.length === 1 ? '' : 's'}
            </span>
          )}
        </header>
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Select the <strong>stock location</strong> first. The component list only includes items with <strong>quantity on hand</strong> at that warehouse.
            </p>
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 mb-3">
              <div className="sm:col-span-4">
                <SearchableSelect
                  id="stock-location"
                  aria-label="Stock location"
                  value={lockedStockLocationId || newStockItem.locationId}
                  onChange={(v) => {
                    if (lockedStockLocationId) return;
                    setNewStockItem((prev) => ({ ...prev, locationId: v, sku: '' }));
                  }}
                  options={stockLocationOptions}
                  placeholder="Select stock location first…"
                  disabled={Boolean(lockedStockLocationId)}
                  required
                />
              </div>
              <div className="sm:col-span-4">
                <SearchableSelect
                  id="stock-sku"
                  aria-label="Stock component"
                  value={newStockItem.sku}
                  onChange={(v) => setNewStockItem((prev) => ({ ...prev, sku: v }))}
                  options={stockSkuOptions}
                  placeholder={
                    newStockItem.locationId
                      ? 'Search component…'
                      : 'Choose location first…'
                  }
                  disabled={!newStockItem.locationId}
                />
              </div>
              <div className="sm:col-span-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={newStockItem.quantity || ''}
                  onChange={(e) => setNewStockItem({ ...newStockItem, quantity: parseFloat(e.target.value) || 0 })}
                  placeholder="Qty"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={handleAddStockItem}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
                >
                  <i className="fas fa-plus mr-1"></i>Add
                </button>
              </div>
            </div>
            {newStockItem.locationId && stockSkuOptions.length === 0 && (
              <p className="text-xs text-gray-500 mb-3">
                No on-hand stock at this location{!isOnline ? ' (offline — connect to refresh, or stock may be empty).' : '.'}
              </p>
            )}
            {lockedStockLocationId && (
              <p className="text-xs text-gray-500 mb-3">
                Stock location is locked for this job card after the first stock line is added.
              </p>
            )}
            {formData.stockUsed.length > 0 && (
              <div className="space-y-2">
                {formData.stockUsed.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {item.locationName || 'Location N/A'} • Qty: {item.quantity} • SKU: {item.sku}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStockItem(item.id)}
                  className="ml-3 text-red-600 hover:text-red-800"
                      title="Remove"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
        {formData.stockUsed.length === 0 && (
          <p className="text-sm text-gray-400">No stock usage recorded yet.</p>
        )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Materials Bought</h2>
            <p className="text-sm text-gray-500 mt-1">Capture purchases not taken from stock (cash, card, etc.).</p>
          </div>
          {totalMaterialCost > 0 && (
            <span className="text-sm font-semibold text-blue-600">
              R {totalMaterialCost.toFixed(2)}
            </span>
          )}
        </header>
            <div className="space-y-3 mb-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={newMaterialItem.itemName}
                  onChange={e => setNewMaterialItem({ ...newMaterialItem, itemName: e.target.value })}
                  placeholder="Item Name *"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                  style={{ fontSize: '16px' }}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={newMaterialItem.cost || ''}
                  onChange={(e) => setNewMaterialItem({ ...newMaterialItem, cost: parseFloat(e.target.value) || 0 })}
                  placeholder="Cost (R) *"
              className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
              style={{ fontSize: '16px' }}
                />
              </div>
              <input
                type="text"
                value={newMaterialItem.description}
                onChange={e => setNewMaterialItem({ ...newMaterialItem, description: e.target.value })}
                placeholder="Description"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                style={{ fontSize: '16px' }}
              />
              <input
                type="text"
                value={newMaterialItem.reason}
                onChange={e => setNewMaterialItem({ ...newMaterialItem, reason: e.target.value })}
                placeholder="Reason for purchase"
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg"
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={handleAddMaterialItem}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-medium touch-manipulation"
              >
                <i className="fas fa-plus mr-1"></i>Add Material
              </button>
            </div>
        {formData.materialsBought.length > 0 ? (
              <div className="space-y-2">
                {formData.materialsBought.map(item => (
                  <div key={item.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{item.itemName}</p>
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1">{item.description}</p>
                        )}
                        {item.reason && (
                          <p className="text-xs text-gray-500 mt-1">Reason: {item.reason}</p>
                        )}
                        <p className="text-sm font-semibold text-gray-900 mt-2">R {item.cost.toFixed(2)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterialItem(item.id)}
                    className="text-red-600 hover:text-red-800"
                        title="Remove"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  </div>
                ))}
            <div className="border-t border-gray-200 pt-3 mt-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-gray-900">Total Cost</span>
              <span className="text-lg font-bold text-blue-600">R {totalMaterialCost.toFixed(2)}</span>
                  </div>
                </div>
        ) : (
          <p className="text-sm text-gray-400">No ad-hoc purchases recorded yet.</p>
            )}
      </section>
      {renderNavigationButtons()}
    </div>
  );

  const renderSignoffStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <WizardStepPageHeader stepIndex={STEP_IDS.indexOf('signoff')} stepId="signoff" />
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
            <p className="text-sm text-gray-500 mt-1">Capture supporting photos or videos from site.</p>
          </div>
          {totalPhotoVideoCount > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {totalPhotoVideoCount} attachment{totalPhotoVideoCount === 1 ? '' : 's'}
            </span>
          )}
        </header>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 sm:p-6 text-center">
              <input
                type="file"
                id="photoUpload"
                onChange={handlePhotoUpload}
                className="hidden"
                accept="image/*,video/*"
                multiple
              />
              <label
                htmlFor="photoUpload"
                className="cursor-pointer block"
              >
                <span className="inline-flex items-center justify-center gap-3 text-gray-400 mb-2">
                  <i className="fas fa-camera text-3xl sm:text-4xl" />
                  <i className="fas fa-video text-2xl sm:text-3xl" />
                </span>
                <p className="text-sm sm:text-base text-gray-600">
                  Tap to add photos or videos
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Mobile camera or gallery • Images up to 10MB • Videos up to 50MB each
                </p>
              </label>
            </div>
            {selectedPhotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {selectedPhotos.map((photo, idx) => (
                  <JobCardWizardAttachmentPreview
                    key={idx}
                    url={typeof photo === 'string' ? photo : photo.url}
                    index={idx}
                    onRemove={handleRemovePhoto}
                  />
                ))}
              </div>
            )}
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Customer Acknowledgement</h2>
          <p className="text-sm text-gray-500 mt-1">
            Capture customer details; a signature is required when you set the job status to Completed (choose status below).
          </p>
        </header>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Name
              </label>
              <input
                type="text"
                name="customerName"
                value={formData.customerName}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Full name"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position / Title
              </label>
              <input
                type="text"
                name="customerTitle"
                value={formData.customerTitle}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Role at site"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Feedback
            </label>
            <VoiceNoteTextarea
              sectionId="customerFeedback"
              name="customerFeedback"
              value={formData.customerFeedback}
              onChange={handleChange}
              rows={3}
              placeholder="Optional comments from customer"
              onVoiceSaved={addVoiceClip}
              onVoiceClipUpdate={updateVoiceClip}
              voiceClips={voiceAttachments.filter(c => c.section === 'customerFeedback')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sign-off Date
              </label>
              <input
                type="date"
                name="customerSignDate"
                value={formData.customerSignDate}
                onChange={handleChange}
                className="w-full px-4 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Status
            </label>
            <SearchableSelect
              id="jobcard-status"
              name="status"
              aria-label="Job status"
              value={formData.status}
              onChange={v => handleChange({ target: { name: 'status', value: v } })}
              options={jobStatusOptions}
              placeholder="Search status…"
            />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Customer Signature
              {formData.status === 'completed' ? (
                <span className="text-red-500"> *</span>
              ) : (
                <span className="text-gray-400 font-normal"> (optional unless Completed)</span>
              )}
            </label>
            <div
              ref={signatureWrapperRef}
              className={[
                'signature-wrapper border-2 rounded-lg overflow-hidden relative bg-white',
                hasSignature ? 'border-blue-500' : 'border-gray-300'
              ].join(' ')}
            >
              <canvas
                ref={signatureCanvasRef}
                className="signature-canvas w-full h-48 touch-none"
                style={{ touchAction: 'none', display: 'block' }}
                onPointerDown={startSignature}
                onPointerMove={drawSignature}
                onPointerUp={endSignature}
                onPointerLeave={endSignature}
                onMouseDown={startSignature}
                onMouseMove={drawSignature}
                onMouseUp={endSignature}
                onMouseLeave={endSignature}
                onTouchStart={startSignature}
                onTouchMove={drawSignature}
                onTouchEnd={endSignature}
                onTouchCancel={endSignature}
              />
              {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <p className="text-xs sm:text-sm text-gray-400 text-center px-4">
                    Sign here with finger or stylus
            </p>
          </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">
                Signatures are stored securely with the job card record.
              </span>
              <button
                type="button"
                onClick={clearSignature}
                className="text-sm font-medium text-blue-600 hover:text-blue-900"
              >
                Clear signature
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Submission Summary</h2>
          <p className="text-sm text-gray-500 mt-1">Quick review before submitting this job card.</p>
        </header>
        <div className="space-y-3">
          <SummaryRow label="Technician" value={formData.agentName} />
          <SummaryRow
            label="Recorded as (ERP account)"
            value={getJobCardRecorderDisplayName() || '—'}
          />
          <SummaryRow
            label="Project"
            value={
              formData.projectName ||
              projects.find(p => String(p.id) === String(formData.projectId))?.name
            }
          />
          <SummaryRow label="Client" value={formData.clientName || clients.find(c => c.id === formData.clientId)?.name} />
          <SummaryRow label="Site" value={formData.siteName} />
          <SummaryRow label="Travel Distance" value={travelKm > 0 ? `${travelKm.toFixed(1)} km` : ''} />
          <SummaryRow label="Stock Lines" value={formData.stockUsed.length > 0 ? `${formData.stockUsed.length}` : ''} />
          <SummaryRow label="Materials Cost" value={totalMaterialCost > 0 ? `R ${totalMaterialCost.toFixed(2)}` : ''} />
          <SummaryRow label="Future Work" value={formData.futureWorkRequired || ''} />
          <SummaryRow label="Follow-up Schedule" value={formData.futureWorkScheduledAt ? new Date(formData.futureWorkScheduledAt).toLocaleString() : ''} />
          <SummaryRow label="Photos / video" value={totalPhotoVideoCount > 0 ? `${totalPhotoVideoCount}` : ''} />
          <SummaryRow
            label="Job status"
            value={jobStatusOptions.find(o => o.value === formData.status)?.label || formData.status}
          />
          <SummaryRow label="Customer Signature" value={hasSignature ? 'Captured' : 'Pending'} />
        </div>
        <div className="mt-5 pt-5 border-t border-gray-200 space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Stock used</h3>
            {formData.stockUsed.length > 0 ? (
              <ul className="space-y-2">
                {formData.stockUsed.map((item) => (
                  <li
                    key={item.id}
                    className="text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div className="font-medium">{item.itemName || item.sku || 'Item'}</div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      Qty {item.quantity}
                      {item.sku ? ` • SKU ${item.sku}` : ''}
                      {item.locationName ? ` • ${item.locationName}` : ''}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">None recorded.</p>
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Purchases</h3>
            {formData.materialsBought.length > 0 ? (
              <ul className="space-y-2">
                {formData.materialsBought.map((item) => (
                  <li
                    key={item.id}
                    className="text-sm text-gray-900 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2"
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium">{item.itemName || 'Purchase'}</span>
                      <span className="font-semibold text-gray-900 shrink-0">
                        R {(Number(item.cost) || 0).toFixed(2)}
                      </span>
                    </div>
                    {item.description ? (
                      <div className="text-xs text-gray-600 mt-1">{item.description}</div>
                    ) : null}
                    {item.reason ? (
                      <div className="text-xs text-gray-500 mt-0.5">Reason: {item.reason}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">None recorded.</p>
            )}
          </div>
        </div>
      </section>
      {renderNavigationButtons()}
    </div>
  );

  const renderNavigationButtons = () => (
    <div className="mt-6 pt-6 border-t border-slate-200/90 bg-white rounded-2xl p-4 sm:p-6 shadow-sm shadow-slate-200/30 ring-1 ring-slate-100">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="text-xs text-slate-500 text-center sm:text-left font-medium">
          Step {currentStep + 1} of {STEP_IDS.length}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStep === 0 || isSubmitting}
            className="min-h-[48px] px-5 py-3 border border-slate-300 text-slate-800 rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold touch-manipulation"
          >
            Back
          </button>

          {currentStep < STEP_IDS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="min-h-[48px] px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold shadow-md shadow-blue-900/10 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              onClick={(event) => { event.preventDefault(); handleSave(); }}
              disabled={isSubmitting}
              className="min-h-[48px] px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold shadow-md shadow-blue-900/10 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting
                ? 'Saving...'
                : formData.status === 'draft'
                  ? 'Save as draft'
                  : formData.status === 'completed'
                    ? 'Save completed job card'
                    : 'Submit job card'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (STEP_IDS[currentStep]) {
      case 'assignment':
        return renderAssignmentStep();
      case 'visit':
        return renderVisitStep();
      case 'work':
        return renderWorkStep();
      case 'stock':
        return renderStockStep();
      case 'signoff':
        return renderSignoffStep();
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 px-6">
        <div className="text-center rounded-3xl border border-white/10 bg-white/5 px-8 py-10 backdrop-blur-sm max-w-sm w-full">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-white/20 border-t-blue-400 mx-auto mb-5" />
          <p className="text-white font-semibold">Loading Job Card</p>
          <p className="text-slate-400 text-sm mt-2">Preparing your form…</p>
        </div>
      </div>
    );
  }

  if (wizardFlow === 'landing') {
    return (
      <div className="job-card-landing-root min-h-[100dvh] flex flex-col items-center justify-start overflow-y-auto bg-gradient-to-b from-slate-50 via-blue-50/35 to-slate-200/90 text-slate-900 px-4 sm:px-6">
        <div className="w-full max-w-md space-y-8 pb-8">
          {!networkOnline && !getJobCardAuthToken() && (
            <div className="rounded-2xl border border-amber-300/90 bg-amber-50 px-4 py-3.5 text-sm text-amber-950 shadow-sm">
              You are offline and there is no saved sign-in on this device. Connect to the internet and open this page
              once to log in; after that you can keep working offline with your cached account.
            </div>
          )}
          <div className="text-center space-y-4 pt-2">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-900/25 ring-4 ring-white/80">
              <i className="fa-solid fa-clipboard-check text-2xl" aria-hidden />
            </div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-blue-600/90 font-semibold">
              Field service
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-slate-900 tracking-tight">
              Job cards
            </h1>
            <p className="text-base text-slate-600 max-w-sm mx-auto leading-relaxed">
              Capture visits, stock, and sign-off in one guided flow. Works offline; sync when you are back online.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={startNewJobCard}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <i className="fa-solid fa-plus text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">Create new job card</span>
                  <span className="block text-sm text-slate-600 mt-0.5">
                    Start the guided wizard for a new visit.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-blue-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={openPriorList}
              className="w-full rounded-2xl bg-white text-slate-900 px-5 py-5 text-left shadow-md hover:bg-slate-50 transition touch-manipulation border border-slate-200/90"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <i className="fa-solid fa-clock-rotate-left text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">View or Edit Existing Job Card</span>
                  <span className="block text-sm text-slate-600 mt-0.5 leading-snug">
                    Search and filter when signed in; includes drafts not synced on this device.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-blue-300 flex-shrink-0" aria-hidden />
              </span>
            </button>
          </div>

          {!getJobCardAuthToken() ? (
            <section className="rounded-2xl border border-amber-200/90 bg-amber-50/90 p-4 shadow-sm space-y-2">
              <p className="text-sm font-semibold text-amber-950">See all job cards on this phone</p>
              <p className="text-xs text-amber-900/90 leading-snug">
                The public link only remembers cards submitted in this browser until you sign in. Use your ERP login to
                load the full history everywhere, including search and filter by client.
              </p>
              <button
                type="button"
                onClick={goToSignInForJobCardHistory}
                className="w-full mt-1 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100/80 touch-manipulation"
              >
                <i className="fa-solid fa-right-to-bracket" aria-hidden />
                Sign in for full history
              </button>
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up calendar</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-snug">
                Subscribe to an ICS feed for scheduled future-work job card events.
              </p>
              {!getJobCardAuthToken() && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Sign in first to generate a personal calendar URL.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSubscribeCalendar}
                disabled={!getJobCardAuthToken()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-regular fa-calendar-plus" aria-hidden />
                Subscribe calendar
              </button>
              <button
                type="button"
                onClick={handleCopyCalendarLink}
                disabled={!getJobCardAuthToken()}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <i className="fa-regular fa-copy" aria-hidden />
                {calendarStatus}
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (wizardFlow === 'prior_list') {
    return (
      <div className="job-card-prior-list min-h-[100dvh] flex flex-col bg-gradient-to-b from-slate-100 via-white to-blue-50/30 relative">
        <header className="flex-shrink-0 bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-md px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setWizardFlow('landing')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white mb-3 touch-manipulation"
          >
            <i className="fa-solid fa-arrow-left" aria-hidden />
            Back
          </button>
          <h1 className="text-xl font-bold">Prior job cards</h1>
          <p className="text-sm text-white/80 mt-1">
            {getJobCardAuthToken()
              ? 'Search and filter below, newest first — tap a card to open. Local drafts not yet synced are included.'
              : 'Sign in to load the full server list on any device. Without signing in, only cards submitted from this browser are listed, plus offline drafts on this device.'}
          </p>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 pb-8">
          {!getJobCardAuthToken() ? (
            <div className="max-w-2xl mx-auto mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm">
              <p className="text-sm font-semibold">No server history on this device yet?</p>
              <p className="text-xs mt-1 text-amber-900/90 leading-snug">
                Sign in once with your ERP account to load every submitted job card and use search and client filter.
              </p>
              <button
                type="button"
                onClick={goToSignInForJobCardHistory}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-100 border border-amber-300 px-3 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-200/80 touch-manipulation"
              >
                <i className="fa-solid fa-right-to-bracket" aria-hidden />
                Sign in for full history
              </button>
            </div>
          ) : null}
          {getJobCardAuthToken() ? (
            <div className="max-w-2xl mx-auto mb-4 space-y-3">
              <div>
                <label htmlFor="jobcard-prior-search" className="block text-xs font-semibold text-gray-600 mb-1">
                  Search
                </label>
                <input
                  id="jobcard-prior-search"
                  type="search"
                  autoComplete="off"
                  placeholder="Search everything: client, site, notes, stock, materials, vehicle…"
                  value={priorSearchInput}
                  onChange={e => setPriorSearchInput(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                />
              </div>
              <div>
                <label htmlFor="jobcard-prior-client" className="block text-xs font-semibold text-gray-600 mb-1">
                  Client
                </label>
                <select
                  id="jobcard-prior-client"
                  value={priorClientId}
                  onChange={e => setPriorClientId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 touch-manipulation"
                >
                  <option value="">All clients</option>
                  {priorClientSelectOptions.map(c => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {c.name || c.companyName || c.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          {mergedPriorJobCards.length === 0 && !serverPriorLoading ? (
            <div className="max-w-lg mx-auto mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
              <i className="fa-regular fa-folder-open text-3xl text-gray-400 mb-3" aria-hidden />
              <p className="font-medium text-gray-800">No job cards to show</p>
              <p className="text-sm mt-2">
                Sign in to load job cards from the server, submit one from this browser, or save a card while offline
                — not synced drafts appear here from this device.
              </p>
              <button
                type="button"
                onClick={startNewJobCard}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 touch-manipulation"
              >
                Create new job card
              </button>
            </div>
          ) : mergedPriorJobCards.length === 0 && serverPriorLoading ? (
            <div className="max-w-lg mx-auto mt-12 flex flex-col items-center text-gray-500">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl mb-3 text-blue-500" aria-hidden />
              <p className="text-sm font-medium">Loading job cards…</p>
            </div>
          ) : (
            <ul className="max-w-2xl mx-auto space-y-3">
              {mergedPriorJobCards.map(jc => {
                const when = jc.updatedAt || jc.createdAt;
                const whenLabel = when
                  ? new Date(when).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })
                  : '';
                const num = jc.jobCardNumber || (jc.clientName ? 'Job card' : 'Job card draft');
                const clientLine = (jc.clientName && String(jc.clientName).trim()) || '—';
                const siteLine = (jc.siteName && String(jc.siteName).trim()) || '—';
                const isLocalPending = jc.source === 'local' || jc.synced === false;
                return (
                  <li key={`${jc.source || 'local'}-${getPriorCardOpenId(jc) || String(jc.id ?? 'row')}`}>
                    <button
                      type="button"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleSelectPriorCard(jc);
                      }}
                      className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition touch-manipulation cursor-pointer relative z-[1]"
                      style={{ touchAction: 'manipulation' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">{num}</p>
                          <p className="text-sm text-gray-700 mt-1.5 leading-snug">
                            <span className="text-gray-500">Client</span>{' '}
                            <span className="text-gray-900">{clientLine}</span>
                          </p>
                          <p className="text-sm text-gray-700 mt-0.5 leading-snug">
                            <span className="text-gray-500">Site</span>{' '}
                            <span className="text-gray-900">{siteLine}</span>
                          </p>
                          <p className="text-sm text-gray-600 mt-1.5 truncate">
                            {jc.agentName ? (
                              <span>{jc.agentName}</span>
                            ) : (
                              <span className="text-gray-400">Technician not set</span>
                            )}
                          </p>
                          {whenLabel && (
                            <p className="text-xs text-gray-500 mt-2">{whenLabel}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {isLocalPending ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                              Not synced
                            </span>
                          ) : jc.synced ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              Server
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                              Draft
                            </span>
                          )}
                          <i className="fa-solid fa-chevron-right text-gray-400 mt-1" aria-hidden />
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {openingJobCard ? (
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/45 px-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="rounded-2xl bg-white px-8 py-7 shadow-2xl flex flex-col items-center gap-4 max-w-sm text-center">
              <i className="fa-solid fa-circle-notch fa-spin text-3xl text-blue-600" aria-hidden />
              <div>
                <p className="font-semibold text-gray-900">Opening job card…</p>
                <p className="text-sm text-gray-600 mt-1">Loading details and attachments</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="job-card-public-wrapper fixed inset-0 flex flex-col xl:flex-row bg-gradient-to-br from-slate-100 via-white to-blue-50/30 overflow-hidden">
      {/* Desktop Sidebar - Vertical Steps */}
      <aside className="hidden xl:flex xl:flex-col xl:w-56 flex-shrink-0 bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-xl z-10 overflow-y-auto overflow-x-hidden">
        <div className="p-4 pb-2 border-b border-white/20">
          <p className="text-[10px] uppercase tracking-wide text-white/75 font-semibold mb-1">
            Field service
          </p>
          <h1
            className="jobcard-app-title text-lg font-bold leading-tight text-white !text-white"
            style={{ color: '#ffffff', WebkitTextFillColor: '#ffffff' }}
          >
            Job cards
          </h1>
          {editingMeta && (
            <p className="text-xs text-amber-100 mt-1.5 font-medium">
              Editing {editingMeta.jobCardNumber || 'saved draft'}
              {editingMeta.synced ? ' (already submitted)' : ''}
            </p>
          )}
          {getJobCardRecorderDisplayName() ? (
            <p className="text-[11px] text-white/95 mt-2 rounded-lg bg-black/15 px-2 py-1.5 border border-white/10">
              <span className="font-semibold text-white/80">You are signed in as</span>{' '}
              {getJobCardRecorderDisplayName()}
              <span className="block text-[10px] text-white/70 mt-0.5 font-normal">
                This is who will appear as &quot;Recorded by&quot; on the job card in the ERP.
              </span>
            </p>
          ) : null}
          <p className="text-xs text-white/85 mt-2 leading-relaxed">
            Guided steps for visits, stock, and sign-off — works offline, syncs when online.
          </p>
          <button
            type="button"
            onClick={exitToMenu}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25 transition touch-manipulation"
          >
            <i className="fa-solid fa-house text-[11px]" aria-hidden />
            Back to menu
          </button>
        </div>
        <div className="flex-1 p-4 space-y-2">
          {STEP_IDS.map((stepId, idx) => (
            <StepBadge
              key={`desktop-${stepId}`}
              index={idx}
              stepId={stepId}
              active={idx === currentStep}
              complete={idx < currentStep}
              onClick={() => goToStep(idx)}
              className="w-full"
            />
          ))}
        </div>
        <div className="p-4 pt-2 border-t border-white/20 space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-white/70">
            <span>Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white transition-all duration-500 ease-out"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span
              className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold ${
                isOnline ? 'bg-white/15 text-white' : 'bg-amber-200/90 text-amber-900'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                }`}
              ></span>
              {isOnline ? 'Online' : 'Offline'}
            </span>
            <button
              type="button"
              onClick={handleShareLink}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold hover:bg-white/25 transition"
            >
              <i className="fa-regular fa-share-from-square text-xs"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Header — defaults collapsed; expand for full step strip */}
      <header className="xl:hidden flex-shrink-0 relative z-10 overflow-hidden bg-gradient-to-br from-blue-700 via-blue-600 to-blue-900 text-white shadow-sm border-b border-blue-900/20">
        {mobileHeaderCollapsed ? (
          <div className="job-card-header-collapsed relative flex items-center gap-1.5 border-b border-white/10 px-2 py-1">
            <button
              type="button"
              onClick={() => setMobileHeaderCollapsed(false)}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25 touch-manipulation"
              aria-expanded={false}
              aria-label="Show wizard header and steps"
            >
              <i className="fa-solid fa-chevron-down text-[11px]" aria-hidden />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold leading-tight text-white">
                {(STEP_META[STEP_IDS[currentStep]] || {}).title || STEP_IDS[currentStep]} · Step {currentStep + 1}/{STEP_IDS.length}
              </p>
              {editingMeta?.jobCardNumber && (
                <p className="truncate text-[10px] text-amber-100/90">{editingMeta.jobCardNumber}</p>
              )}
            </div>
            <div className="min-w-0 max-w-[4.5rem] sm:max-w-[6rem]">
              <div className="h-0.5 w-full rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-white transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            <span className="flex-shrink-0 text-[10px] tabular-nums text-white/90 w-7 text-right">{progressPercent}%</span>
            <div className="job-card-header-toolbar flex flex-shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={handleShareLink}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 touch-manipulation"
                aria-label="Share job card link"
              >
                <i className="fa-regular fa-share-from-square text-[11px]" aria-hidden />
              </button>
              <button
                type="button"
                onClick={exitToMenu}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 touch-manipulation"
                aria-label="Back to menu"
              >
                <i className="fa-solid fa-house text-[11px]" aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <div className="relative px-2 py-1.5">
            <div className="max-w-4xl mx-auto space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h1 className="jobcard-app-title text-sm font-bold leading-none text-white truncate">
                    Job cards
                    {editingMeta?.jobCardNumber ? (
                      <span className="font-normal text-amber-100/95"> · {editingMeta.jobCardNumber}</span>
                    ) : null}
                  </h1>
                </div>
                <div className="job-card-header-toolbar relative z-10 inline-flex flex-nowrap items-center gap-0.5 shrink-0">
                  <span
                    className={`job-card-online-badge inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none whitespace-nowrap ${
                      isOnline ? 'bg-white/15 text-white' : 'bg-amber-200/90 text-amber-900'
                    }`}
                  >
                    <span
                      className={`h-1 w-1 flex-shrink-0 rounded-full ${
                        isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    {isOnline ? 'On' : 'Off'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileHeaderCollapsed(true)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/20 text-white hover:bg-black/30 touch-manipulation"
                    aria-expanded={true}
                    aria-label="Collapse header"
                  >
                    <i className="fa-solid fa-chevron-up text-[11px]" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={exitToMenu}
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition touch-manipulation"
                    aria-label="Back to menu"
                  >
                    <i className="fa-solid fa-house text-[11px]" aria-hidden />
                  </button>
                </div>
              </div>
              {getJobCardRecorderDisplayName() ? (
                <p
                  className="text-[10px] text-white/80 truncate"
                  title={`Recorded in ERP as ${getJobCardRecorderDisplayName()}`}
                >
                  {getJobCardRecorderDisplayName()}
                </p>
              ) : null}
              <div
                className="mobile-step-scroll flex flex-nowrap gap-1 overflow-x-auto overflow-y-hidden pb-0.5 -mx-0.5 px-0.5 snap-x snap-mandatory scrollbar-hide touch-pan-x"
                aria-label="Wizard steps — swipe sideways to choose a step"
              >
                {STEP_IDS.map((stepId, idx) => (
                  <StepBadge
                    key={`mobile-${stepId}`}
                    variant="carousel"
                    index={idx}
                    stepId={stepId}
                    active={idx === currentStep}
                    complete={idx < currentStep}
                    onClick={() => goToStep(idx)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <div className="flex-1 h-0.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-medium tabular-nums text-white/80 shrink-0">{progressPercent}%</span>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Scrollable Content Area - min-h-0 allows flex item to shrink and enable scroll */}
        <div className="job-card-scrollable-content flex-1 min-h-0 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {stepError && (
              <div className="bg-red-50 border border-red-200/90 text-red-800 rounded-2xl px-4 py-3 flex items-start gap-3 text-sm shadow-sm">
                <i className="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i>
                <div className="leading-relaxed">{stepError}</div>
              </div>
            )}

            {editingMeta && getJobCardAuthToken() ? (
              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPriorActivityOpen(o => !o)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 touch-manipulation"
                >
                  <span className="flex items-center gap-2">
                    <i className="fa-regular fa-clock text-slate-500" aria-hidden />
                    Activity trail
                    {priorActivityLoading ? (
                      <span className="text-xs font-normal text-slate-500">(loading…)</span>
                    ) : (
                      <span className="text-xs font-normal text-slate-500">
                        ({priorLoadedActivities.length})
                      </span>
                    )}
                  </span>
                  <i className={`fa-solid fa-chevron-${priorActivityOpen ? 'up' : 'down'} text-slate-400 text-xs`} />
                </button>
                {priorActivityOpen ? (
                  <div className="px-4 pb-4 border-t border-slate-100">
                    {priorActivityLoading && priorLoadedActivities.length === 0 ? (
                      <p className="text-sm text-slate-500 pt-3">Loading activity…</p>
                    ) : priorLoadedActivities.length === 0 ? (
                      <p className="text-sm text-slate-500 pt-3">
                        No activity events yet, or this card has not been synced to the server.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2 text-sm text-slate-800 max-h-64 overflow-y-auto">
                        {priorLoadedActivities.map(a => (
                          <li
                            key={a.id}
                            className="border-b border-slate-100 pb-2 last:border-0"
                          >
                            <span className="text-slate-500 text-xs">
                              {a.createdAt
                                ? (() => {
                                    const d = new Date(a.createdAt);
                                    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
                                  })()
                                : '—'}
                            </span>
                            {' · '}
                            <span className="font-medium text-slate-900">
                              {formatJobCardActivityAction(a.action)}
                            </span>
                            {a.actorName ? ` — ${a.actorName}` : ''}
                            {a.source ? (
                              <span className="text-slate-500 text-xs"> ({a.source})</span>
                            ) : null}
                            {formatJobCardActivityDetail(a.action, a.metadata) ? (
                              <div className="text-slate-500 text-xs mt-0.5">
                                {formatJobCardActivityDetail(a.action, a.metadata)}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            <form onSubmit={(event) => { event.preventDefault(); handleSave(); }} className="space-y-4 sm:space-y-5">
              {renderStepContent()}
            </form>
          </div>
        </div>

        {/* Footer removed - navigation buttons are now inline at end of each step */}
      </div>

      {/* Map Selection Modal */}
      {showMapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Select Location on Map</h3>
              <button
                type="button"
                onClick={handleCloseMap}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <i className="fas fa-times text-xl"></i>
              </button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <div
                ref={mapContainerRef}
                className="w-full h-full map-container"
                style={{ minHeight: '400px', height: '100%' }}
              ></div>
            </div>
            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-1">Selected Location:</p>
                  <p className="text-sm font-medium text-gray-900">{formData.location || 'Click on the map to select a location'}</p>
                  {formData.latitude && formData.longitude && (
                    <p className="text-xs text-gray-500 mt-1">
                      Coordinates: {formData.latitude}, {formData.longitude}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCloseMap}
                  className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 font-semibold touch-manipulation"
                >
                  Use This Location
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

try {
  window.JobCardFormPublic = JobCardFormPublic;
  try {
    window.dispatchEvent(new Event('jobCardFormPublicReady'));
  } catch {
    /* ignore */
  }
  if (window.debug && !window.debug.performanceMode) {
  }
} catch (error) {
  console.error('❌ JobCardFormPublic.jsx: Error registering component:', error);
}


