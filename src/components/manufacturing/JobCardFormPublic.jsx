// Public Job Card Form - Accessible without login
// Standalone form for technicians to submit job cards offline with a mobile-first experience
const { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } = React;

const STEP_IDS = ['assignment', 'visit', 'work', 'stock', 'signoff'];

/** Base64 payloads: keep video cap lower than express.json (100mb) to leave room for the rest of the payload */
const JOB_CARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const JOB_CARD_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

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

const StepBadge = ({ index, stepId, active, complete, onClick, className = '' }) => {
  const meta = STEP_META[stepId] || {};
  const baseClasses = 'group flex items-center lg:flex-col lg:items-start lg:justify-start sm:flex-col sm:items-center justify-between sm:justify-center gap-3 sm:gap-2 lg:gap-3 rounded-xl px-3 py-3 sm:px-4 sm:py-4 lg:px-3 lg:py-3 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white/70 focus-visible:ring-offset-blue-600 min-w-[160px] sm:min-w-0 lg:min-w-0 snap-start w-full lg:w-full';
  const stateClass = active
    ? 'bg-white/95 text-blue-700 shadow-lg shadow-blue-500/25'
    : complete
      ? 'bg-white/30 text-white'
      : 'bg-white/10 text-white/80 hover:bg-white/20';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${stateClass} ${className}`}
      aria-current={active ? 'step' : undefined}
    >
      <div
        className={[
          'flex h-11 w-11 items-center justify-center rounded-full border-2 transition',
          active
            ? 'bg-white text-blue-600 border-white shadow'
            : complete
              ? 'bg-white/90 text-blue-600 border-transparent'
              : 'bg-white/20 text-white border-white/30 group-hover:border-white/50'
        ].join(' ')}
      >
        <i className={`fa-solid ${meta.icon || 'fa-circle-dot'} text-base`}></i>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left sm:items-center sm:text-center lg:items-start lg:text-left">
        <span
          className={`text-[11px] uppercase tracking-wide font-semibold ${active ? '!text-blue-600' : 'text-white/80'} sm:text-center lg:text-left`}
        >
          Step {index + 1}
        </span>
        <span
          className={`text-sm font-semibold leading-snug ${active ? '!text-blue-800' : 'text-white'} sm:text-center lg:text-left`}
        >
          {meta.title || stepId}
        </span>
        {meta.subtitle && (
          <span
            className={`text-[11px] sm:text-xs ${active ? '!text-blue-600/90' : 'text-white/75'} sm:text-center lg:text-left`}
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

    const menuShellClass = 'rounded-lg border border-gray-200 bg-white shadow-lg';

    if (listOptions.length === 0) {
      return (
        <div
          ref={menuRef}
          className={`${menuShellClass} fixed z-[10050] px-3 py-2 text-sm text-gray-500`}
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
          className={`${menuShellClass} fixed z-[10050] px-3 py-2 text-sm text-gray-500`}
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
          {filtered.map(opt => (
            <li
              key={String(opt.value) + String(opt.label)}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className="cursor-pointer px-3 py-2.5 text-sm text-gray-900 hover:bg-blue-50 active:bg-blue-100 touch-manipulation"
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(opt.value);
                setFilter(opt.label);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
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
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          autoComplete="off"
          value={open ? filter : (selected ? selected.label : '')}
          onChange={e => {
            setFilter(e.target.value);
            setOpen(true);
            if (!e.target.value) onChange('');
          }}
          onFocus={() => {
            setOpen(true);
            setFilter(selected ? selected.label : '');
          }}
          placeholder={placeholder}
          className="w-full pl-4 pr-11 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white disabled:bg-gray-100 disabled:cursor-not-allowed touch-manipulation"
          style={{ fontSize: '16px' }}
        />
        <span
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
          aria-hidden
        >
          <i className="fas fa-chevron-down text-sm" />
        </span>
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
              className="absolute z-[60] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {filtered.map(opt => (
                <li
                  key={String(opt.value) + String(opt.label)}
                  role="option"
                  aria-selected={String(opt.value) === String(value)}
                  className="cursor-pointer px-3 py-2.5 text-sm text-gray-900 hover:bg-blue-50 active:bg-blue-100 touch-manipulation"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    onChange(opt.value);
                    setFilter(opt.label);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </li>
              ))}
            </ul>
          )}
          {open && !disabled && listOptions.length === 0 && (
            <div
              ref={menuRef}
              className="absolute z-[60] mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg"
            >
              No options available
            </div>
          )}
          {open && !disabled && listOptions.length > 0 && filtered.length === 0 && (
            <div
              ref={menuRef}
              className="absolute z-[60] mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 shadow-lg"
            >
              No matches
            </div>
          )}
        </>
      )}
    </div>
  );
};

const isIOSOrSafari =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent));

/** Best MIME type for MediaRecorder (omit on iOS — let the browser default; avoids empty blobs) */
const pickAudioRecorderMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
    return '';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg;codecs=opus'
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
};

/** Create MediaRecorder with fallbacks (iOS: default constructor is most reliable) */
const createMediaRecorder = stream => {
  if (isIOSOrSafari) {
    try {
      return new MediaRecorder(stream);
    } catch (e) {
      console.warn('MediaRecorder (Safari default) failed:', e);
    }
  }
  try {
    const mime = pickAudioRecorderMimeType();
    if (mime) return new MediaRecorder(stream, { mimeType: mime });
    return new MediaRecorder(stream);
  } catch (e) {
    console.warn('MediaRecorder (typed) failed, using default:', e);
    return new MediaRecorder(stream);
  }
};

/** Below this, recording is treated as failed (headers-only / silence). Keep low but not zero. */
const MIN_AUDIO_BLOB_BYTES = 80;

/** Timeslice (ms) so browsers reliably emit chunks; avoids empty blobs when start() has no slice (esp. some mobile WebKit). */
const VOICE_RECORD_TIMESLICE_MS = 500;

/** Wrapped transcript for each voice note so multiple clips stay visually distinct in the field */
const formatVoiceNoteTranscriptBlock = (noteNumber, text) => {
  const n = Math.max(1, Number(noteNumber) || 1);
  const body = String(text || '').trim();
  return `----- Voice note ${n} · start -----\n${body}\n----- Voice note ${n} · end -----\n`;
};

/**
 * One mic: record multiple clips per field. Each clip can be transcribed via server (Whisper) into the textarea
 * with clear start/end markers. No parallel Web Speech during recording (keeps audio playable).
 */
const VoiceNoteTextarea = ({
  sectionId,
  name,
  value,
  onChange,
  rows = 3,
  className = '',
  placeholder = '',
  onVoiceSaved,
  onVoiceClipUpdate,
  voiceClips = []
}) => {
  /** idle → requesting (getUserMedia) → recording; avoids double-start while mic prompt is open */
  const [micState, setMicState] = useState('idle');
  const [recordHint, setRecordHint] = useState('');
  const [transcribingClipId, setTranscribingClipId] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const micAbortRef = useRef(null);
  const valueRef = useRef(value);
  const mountedRef = useRef(true);
  const onVoiceSavedRef = useRef(onVoiceSaved);
  const sectionIdRef = useRef(sectionId);
  const pendingNoteNumberRef = useRef(1);
  const voiceClipsCountRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onVoiceSavedRef.current = onVoiceSaved;
    sectionIdRef.current = sectionId;
  }, [onVoiceSaved, sectionId]);
  useEffect(() => {
    voiceClipsCountRef.current = voiceClips.length;
  }, [voiceClips.length]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopAudioRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') {
      try {
        mr.stop();
      } catch (_) {}
    }
    if (mountedRef.current) {
      setMicState('idle');
    }
  }, []);

  const startAudioRecording = useCallback(async () => {
    setRecordHint('');
    if (typeof MediaRecorder === 'undefined') {
      alert('Recording is not supported in this browser. Try Chrome, Edge, or Safari on iOS 14.3+.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Microphone access is not available. Use HTTPS or check browser permissions.');
      return;
    }
    if (mediaRecorderRef.current) {
      return;
    }

    const ac = new AbortController();
    micAbortRef.current = ac;
    if (mountedRef.current) {
      setMicState('requesting');
    }

    let stream;
    try {
      // Plain `audio: true` — advanced constraints can fail or yield silent tracks on some mobile browsers.
      // `signal` cancels the prompt where supported; older engines fall back without it.
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          signal: ac.signal
        });
      } catch (inner) {
        if (inner?.name === 'TypeError') {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw inner;
        }
      }
    } catch (err) {
      micAbortRef.current = null;
      if (err?.name === 'AbortError') {
        if (mountedRef.current) {
          setMicState('idle');
        }
        return;
      }
      console.warn('getUserMedia:', err);
      if (mountedRef.current) {
        setMicState('idle');
      }
      alert('Microphone permission was denied or unavailable.');
      return;
    }

    micAbortRef.current = null;
    if (ac.signal.aborted) {
      stream.getTracks().forEach(t => t.stop());
      if (mountedRef.current) {
        setMicState('idle');
      }
      return;
    }

    streamRef.current = stream;
    const mr = createMediaRecorder(stream);
    const appliedMime =
      mr.mimeType || pickAudioRecorderMimeType() || 'audio/webm';
    chunksRef.current = [];
    pendingNoteNumberRef.current = voiceClipsCountRef.current + 1;
    mr.ondataavailable = e => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onerror = ev => {
      console.warn('MediaRecorder error:', ev.error);
      if (mountedRef.current) {
        setRecordHint('Recording error — try again.');
        setMicState('idle');
      }
    };
    mr.onstop = () => {
      mediaRecorderRef.current = null;
      const s = streamRef.current;
      if (s) {
        s.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      const blobType = (mr.mimeType && mr.mimeType.length > 0 ? mr.mimeType : appliedMime) || 'audio/webm';

      const tryPersist = isDeferred => {
        const blob = new Blob(chunksRef.current, { type: blobType });
        if (!blob.size || blob.size < MIN_AUDIO_BLOB_BYTES) {
          if (!isDeferred) {
            queueMicrotask(() => tryPersist(true));
          } else {
            console.warn('JobCard voice: empty or tiny blob', blob.size, 'type', blobType);
            if (mountedRef.current) {
              setRecordHint(
                'No audio captured — hold mic, speak 2–3 seconds, tap stop. Try another browser or check microphone permission (HTTPS required).'
              );
            }
          }
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          if (!mountedRef.current) {
            return;
          }
          const dataUrl = reader.result;
          const save = onVoiceSavedRef.current;
          if (dataUrl && typeof dataUrl === 'string' && save) {
            save({
              section: sectionIdRef.current,
              dataUrl,
              mimeType: blob.type || blobType,
              noteNumber: pendingNoteNumberRef.current
            });
            setRecordHint('');
          } else if (!save) {
            console.warn('JobCard voice: onVoiceSaved missing; clip not stored');
          }
        };
        reader.onerror = () => {
          if (mountedRef.current) {
            setRecordHint('Could not read recording — try again.');
          }
        };
        reader.readAsDataURL(blob);
      };

      tryPersist(false);
    };

    try {
      mr.start(VOICE_RECORD_TIMESLICE_MS);
    } catch (startErr) {
      console.warn('MediaRecorder.start failed:', startErr);
      stream.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      if (mountedRef.current) {
        setMicState('idle');
      }
      alert('Could not start audio recording. Try another browser or update this one.');
      return;
    }

    mediaRecorderRef.current = mr;
    if (mountedRef.current) {
      setMicState('recording');
    }
  }, []);

  const transcribeClip = async clip => {
    if (!clip?.dataUrl || transcribingClipId) return;
    setRecordHint('');
    setTranscribingClipId(clip.id);
    try {
      const comma = clip.dataUrl.indexOf(',');
      const b64 = comma >= 0 ? clip.dataUrl.slice(comma + 1) : clip.dataUrl;
      const res = await fetch('/api/public/transcribe-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: b64,
          mimeType: clip.mimeType || 'audio/webm'
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 503 && data.code === 'NO_OPENAI') {
          setRecordHint(
            'Transcription is not configured on the server. Your admin can enable it with OPENAI_API_KEY, or type the text manually.'
          );
        } else {
          const apiMsg =
            typeof data.error === 'string'
              ? data.error
              : data.error && typeof data.error.message === 'string'
                ? data.error.message
                : null;
          setRecordHint(apiMsg || 'Transcription failed. Try again or type manually.');
        }
        return;
      }
      const text = typeof data.text === 'string' ? data.text : '';
      const n = clip.noteNumber != null ? clip.noteNumber : 1;
      const block = formatVoiceNoteTranscriptBlock(n, text);
      const prev = typeof valueRef.current === 'string' ? valueRef.current : '';
      const join = prev.trim() ? '\n\n' : '';
      const next = `${prev}${join}${block}`;
      valueRef.current = next;
      onChange({ target: { name, value: next } });
      onVoiceClipUpdate?.(clip.id, { transcribed: true });
    } catch (e) {
      console.warn('transcribe:', e);
      setRecordHint('Could not reach the transcription service. Check your connection.');
    } finally {
      setTranscribingClipId(null);
    }
  };

  const toggleMic = () => {
    if (micState === 'recording') {
      stopAudioRecording();
      return;
    }
    if (micState === 'requesting') {
      micAbortRef.current?.abort();
      return;
    }
    startAudioRecording().catch(err => {
      console.warn('Voice note:', err);
      if (mountedRef.current) {
        setMicState('idle');
      }
      alert(`Could not use the microphone: ${err.message || err}`);
    });
  };

  useEffect(() => {
    return () => {
      micAbortRef.current?.abort();
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        try {
          mr.stop();
        } catch (_) {}
      }
      const st = streamRef.current;
      if (st) {
        st.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      mediaRecorderRef.current = null;
    };
  }, []);

  return (
    <div className="relative">
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        rows={rows}
        placeholder={placeholder}
        className={`w-full pl-4 pr-14 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y ${className}`}
        style={{ fontSize: '16px' }}
      />
      <div className="absolute top-2 right-2 z-10 flex flex-row items-start gap-1.5">
        <button
          type="button"
          onClick={toggleMic}
          title={
            micState === 'recording'
              ? 'Stop and save this voice note'
              : micState === 'requesting'
                ? 'Cancel microphone request'
                : 'Record a voice note (you can add several per field)'
          }
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border text-sm shadow-sm touch-manipulation ${
            micState === 'recording'
              ? 'border-red-300 bg-red-50 text-red-600 animate-pulse'
              : micState === 'requesting'
                ? 'border-amber-300 bg-amber-50 text-amber-700 animate-pulse'
                : 'border-gray-200 bg-white text-blue-600 hover:bg-blue-50'
          }`}
        >
          <i
            className={`fas ${
              micState === 'recording' || micState === 'requesting' ? 'fa-stop' : 'fa-microphone'
            }`}
          />
        </button>
      </div>
      {micState === 'requesting' && (
        <p className="mt-1 text-[11px] font-medium text-amber-700">
          Requesting microphone… allow access, or tap stop to cancel.
        </p>
      )}
      {micState === 'recording' && (
        <p className="mt-1 text-[11px] font-medium text-red-600">
          Recording… speak, then tap the mic again to save this note.
        </p>
      )}
      {recordHint && (
        <p className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {recordHint}
        </p>
      )}
      {micState === 'idle' && (
        <p className="mt-1 text-[10px] text-gray-500">
          Record multiple notes if needed. Use &quot;Transcribe&quot; on each clip to insert text between the marked
          start/end lines.
        </p>
      )}
      {voiceClips.length > 0 && (
        <div className="mt-2 space-y-2" aria-label="Saved voice recordings for this field">
          <p className="text-[10px] font-medium text-gray-500">
            <i className="fas fa-headphones mr-1 text-blue-500" aria-hidden />
            Voice notes for this field ({voiceClips.length})
          </p>
          {voiceClips.map(clip => (
            <div
              key={clip.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 sm:flex-row sm:items-center"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">
                  #{clip.noteNumber != null ? clip.noteNumber : '—'}
                </span>
                <audio
                  controls
                  className="h-8 w-full min-w-0"
                  preload="metadata"
                  src={clip.dataUrl}
                >
                  <source src={clip.dataUrl} type={clip.mimeType || 'audio/webm'} />
                </audio>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {clip.transcribed && (
                  <span className="text-[10px] font-medium text-emerald-700">Transcribed</span>
                )}
                <button
                  type="button"
                  disabled={Boolean(transcribingClipId) || clip.transcribed}
                  onClick={() => transcribeClip(clip)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                >
                  {transcribingClipId === clip.id ? 'Working…' : clip.transcribed ? 'Done' : 'Transcribe'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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

const JobCardFormPublic = () => {
  const [formData, setFormData] = useState({
    agentName: '',
    otherTechnicians: [],
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
  const [availableSites, setAvailableSites] = useState([]);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [inventory, setInventory] = useState([]);
  const [stockLocations, setStockLocations] = useState([]);
  const [newStockItem, setNewStockItem] = useState({ sku: '', quantity: 0, locationId: '' });
  const [newMaterialItem, setNewMaterialItem] = useState({ itemName: '', description: '', reason: '', cost: 0 });
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepError, setStepError] = useState('');
  const [hasSignature, setHasSignature] = useState(false);
  const [shareStatus, setShareStatus] = useState('Copy share link');
  /** Voice clips recorded from text fields: saved with the job card and keyed by section */
  const [voiceAttachments, setVoiceAttachments] = useState([]);
  // Service form templates and selection state
  const [formTemplates, setFormTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  /** landing → pick create vs edit; prior_list → choose a saved card; form → wizard */
  const [wizardFlow, setWizardFlow] = useState('landing');
  /** When editing, keep stable id / createdAt / sync flags for save + localStorage replace */
  const [editingMeta, setEditingMeta] = useState(null);
  const lastSignatureRestoreRef = useRef(null);

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

  const availableTechnicians = useMemo(
    () => users.filter(u => u.status !== 'inactive' && u.status !== 'suspended'),
    [users]
  );

  const addVoiceClip = useCallback(clip => {
    setVoiceAttachments(prev => [
      ...prev,
      {
        ...clip,
        id: `vn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      }
    ]);
  }, []);

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

  const stockSkuOptions = useMemo(
    () =>
      inventory.map(item => ({
        value: item.sku || item.id,
        label: `${item.name} (${item.sku || item.id})`
      })),
    [inventory]
  );

  const stockLocationOptions = useMemo(
    () =>
      stockLocations.map(loc => ({
        value: loc.id,
        label: `${loc.name} (${loc.code})`
      })),
    [stockLocations]
  );

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

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '/job-card';
    }
    return `${window.location.origin}/job-card`;
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

  const priorJobCardsSorted = useMemo(() => {
    if (wizardFlow !== 'prior_list') return [];
    try {
      const raw = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      if (!Array.isArray(raw)) return [];
      return [...raw]
        .filter(jc => jc && typeof jc === 'object')
        .sort((a, b) => {
          const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
          const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
          return tb - ta;
        });
    } catch {
      return [];
    }
  }, [wizardFlow]);

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
              const token = window.storage?.getToken?.();
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
          setStockLocations(cachedLocations);
        } else {
          const defaultLocations = [
            { id: 'LOC001', code: 'WH-MAIN', name: 'Main Warehouse', type: 'warehouse', status: 'active' },
            { id: 'LOC002', code: 'LDV-001', name: 'Service LDV 1', type: 'vehicle', status: 'active' }
          ];
          setStockLocations(defaultLocations);
          localStorage.setItem('stock_locations', JSON.stringify(defaultLocations));
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
                setStockLocations(locations);
                localStorage.setItem('stock_locations', JSON.stringify(locations));
                localStorage.setItem('manufacturing_locations', JSON.stringify(locations));
              }
            } else {
              console.warn('⚠️ JobCardFormPublic: Public locations API returned error:', response.status);
              // Try authenticated API as fallback
              const token = window.storage?.getToken?.();
              if (token && window.DatabaseAPI?.getStockLocations) {
                try {
                  const response = await window.DatabaseAPI.getStockLocations();
                  if (response?.data?.locations || Array.isArray(response?.data)) {
                    const locations = response.data.locations || response.data || [];
                    if (locations.length > 0) {
                      setStockLocations(locations);
                      localStorage.setItem('stock_locations', JSON.stringify(locations));
                      localStorage.setItem('manufacturing_locations', JSON.stringify(locations));
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
            const response = await fetch(`/api/sites/client/${formData.clientId}`, {
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

  const handleAddStockItem = () => {
    if (!newStockItem.sku || !newStockItem.locationId || newStockItem.quantity <= 0) {
      alert('Please select a component, location, and quantity greater than zero.');
      return;
    }
    
    const inventoryItem = inventory.find(item => item.sku === newStockItem.sku || item.id === newStockItem.sku);
    if (!inventoryItem) {
      alert('Selected component could not be found in inventory.');
      return;
    }

    const stockItem = {
      id: Date.now().toString(),
      sku: inventoryItem.sku || inventoryItem.id,
      itemName: inventoryItem.name || '',
      quantity: parseFloat(newStockItem.quantity),
      locationId: newStockItem.locationId,
      locationName: stockLocations.find(loc => loc.id === newStockItem.locationId)?.name || '',
      unitCost: inventoryItem.unitCost || 0
    };

    setFormData(prev => ({
      ...prev,
      stockUsed: [...prev.stockUsed, stockItem]
    }));
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
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
    setShowTemplateModal(false);
  };

  const handleRemoveForm = (formId) => {
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
      setTechnicianInput('');
      setNewStockItem({ sku: '', quantity: 0, locationId: '' });
      setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setVoiceAttachments([]);
    setCurrentStep(0);
    lastSignatureRestoreRef.current = null;
    clearSignature();
  };

  const exitToMenu = () => {
    setEditingMeta(null);
    resetForm();
    setWizardFlow('landing');
  };

  const startNewJobCard = () => {
    setEditingMeta(null);
    resetForm();
    setWizardFlow('form');
  };

  const openPriorList = () => {
    setWizardFlow('prior_list');
  };

  const handleSelectPriorCard = card => {
    if (!card || card.id == null) return;
    lastSignatureRestoreRef.current = null;
    clearSignature();
    const localId = String(card.id);
    const createdAt = card.createdAt || new Date().toISOString();
    const synced = Boolean(card.synced);
    const jobCardNumber = card.jobCardNumber || '';

    setEditingMeta({
      localId,
      createdAt,
      synced,
      jobCardNumber
    });

    setFormData(prev => ({
      ...prev,
      agentName: card.agentName || '',
      otherTechnicians: parseStoredJsonArray(card.otherTechnicians, []),
      clientId: card.clientId || '',
      clientName: card.clientName || '',
      siteId: card.siteId || '',
      siteName: card.siteName || '',
      location: card.location || '',
      latitude: card.latitude != null && card.latitude !== '' ? String(card.latitude) : '',
      longitude: card.longitude != null && card.longitude !== '' ? String(card.longitude) : '',
      timeOfDeparture: toDatetimeLocalInput(card.timeOfDeparture),
      timeOfArrival: toDatetimeLocalInput(card.timeOfArrival),
      vehicleUsed: card.vehicleUsed || '',
      kmReadingBefore: card.kmReadingBefore != null ? String(card.kmReadingBefore) : '',
      kmReadingAfter: card.kmReadingAfter != null ? String(card.kmReadingAfter) : '',
      reasonForVisit: card.reasonForVisit || '',
      diagnosis: card.diagnosis || '',
      actionsTaken: card.actionsTaken || '',
      otherComments: card.otherComments || '',
      stockUsed: parseStoredJsonArray(card.stockUsed, []),
      materialsBought: parseStoredJsonArray(card.materialsBought, []),
      photos: [],
      serviceForms: parseStoredJsonArray(card.serviceForms, []),
      status: card.status || 'draft',
      customerName: card.customerName || '',
      customerTitle: card.customerTitle || card.customerPosition || '',
      customerFeedback: card.customerFeedback || '',
      customerSignDate: card.customerSignDate
        ? String(card.customerSignDate).slice(0, 10)
        : '',
      customerSignature: card.customerSignature || ''
    }));

    setSelectedPhotos([]);
    setVoiceAttachments([]);
    setTechnicianInput('');
    setNewStockItem({ sku: '', quantity: 0, locationId: '' });
    setNewMaterialItem({ itemName: '', description: '', reason: '', cost: 0 });
    setCurrentStep(0);
    setStepError('');
    setWizardFlow('form');
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

    setIsSubmitting(true);
    setStepError('');
    try {
      const nowIso = new Date().toISOString();
      const jobCardData = {
        ...formData,
        customerSignature: exportSignature(),
        id: editingMeta?.localId ?? Date.now().toString(),
        createdAt: editingMeta?.createdAt ?? nowIso,
        updatedAt: nowIso,
        synced: editingMeta?.synced ?? false,
        jobCardNumber: editingMeta?.jobCardNumber || ''
      };

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
      jobCardData.photos = [...(formData.photos || []), ...voicePhotoEntries];

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

      // Always keep a local offline copy for safety (strip base64 photos to avoid quota)
      const forStorage = (card) => ({
        ...card,
        photos: [],
        photoCount: Array.isArray(card.photos) ? card.photos.length : 0
      });
      const existingJobCards = JSON.parse(localStorage.getItem('manufacturing_jobcards') || '[]');
      const storedSlice = forStorage(jobCardData);
      let updatedJobCards;
      if (editingMeta?.localId) {
        const idx = existingJobCards.findIndex(jc => String(jc.id) === String(editingMeta.localId));
        if (idx >= 0) {
          updatedJobCards = [...existingJobCards];
          updatedJobCards[idx] = {
            ...storedSlice,
            jobCardNumber: storedSlice.jobCardNumber || existingJobCards[idx].jobCardNumber
          };
        } else {
          updatedJobCards = [...existingJobCards, storedSlice];
        }
      } else {
        updatedJobCards = [...existingJobCards, storedSlice];
      }
      try {
        localStorage.setItem('manufacturing_jobcards', JSON.stringify(updatedJobCards));
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          const trimmed = existingJobCards.slice(-20).map(jc => ({
            ...jc,
            photos: [],
            photoCount: Array.isArray(jc.photos) ? jc.photos.length : 0
          }));
          try {
            localStorage.setItem(
              'manufacturing_jobcards',
              JSON.stringify([...trimmed, forStorage(jobCardData)])
            );
          } catch (_) {
            console.warn('Job card local cache skipped (storage full)');
          }
        } else throw e;
      }

      const skipPublicPost = Boolean(editingMeta?.synced);

      // Primary persistence: public API (skip when this device copy is already linked to a server record)
      if (!skipPublicPost) {
        try {
          const response = await fetch('/api/public/jobcards', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(jobCardData)
          });

          if (!response.ok) {
            const text = await response.text();
            console.warn('⚠️ JobCardFormPublic: Public API returned error status', response.status, text);
            throw new Error('Job card saved locally but could not reach server.');
          }

          const result = await response.json().catch(() => ({}));
          const saved = result?.jobCard || result?.data?.jobCard || null;

          if (saved && saved.id) {
            const syncedCards = updatedJobCards.map(jc =>
              String(jc.id) === String(jobCardData.id)
                ? {
                    ...jc,
                    id: saved.id,
                    jobCardNumber: saved.jobCardNumber || jc.jobCardNumber,
                    synced: true
                  }
                : jc
            );
            updatedJobCards = syncedCards;
            try {
              localStorage.setItem(
                'manufacturing_jobcards',
                JSON.stringify(
                  syncedCards.map(jc => ({
                    ...jc,
                    photos: [],
                    photoCount: Array.isArray(jc.photos) ? jc.photos.length : jc.photoCount || 0
                  }))
                )
              );
            } catch (_) {
              console.warn('Job card sync cache update skipped (storage full)');
            }
          } else {
            console.warn('⚠️ JobCardFormPublic: Public API response did not include jobCard payload', result);
          }
        } catch (error) {
          console.warn(
            '⚠️ JobCardFormPublic: Failed to submit job card to public API, kept offline only:',
            error.message
          );
        }
      }

      if (skipPublicPost) {
        alert(
          '✅ Job card updated on this device. This card was already submitted to the server; open Service & Maintenance while signed in to change the office record.'
        );
      } else {
        alert(
          '✅ Job card saved successfully! It will appear under Service & Maintenance once the server has processed it.'
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
    setCurrentStep(prev => Math.min(prev + 1, STEP_IDS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handlePrevious = () => {
    setStepError('');
    setCurrentStep(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const renderAssignmentStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
                      className="hover:text-blue-900 ml-1"
                      title="Remove"
                    >
                      <i className="fas fa-times text-xs"></i>
                    </button>
                  </span>
                ))}
              </div>
            )}
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
      {renderNavigationButtons()}
    </div>
  );

  const renderVisitStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
              <p className="text-sm font-medium text-blue-900">
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
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Diagnosis</h2>
          <p className="text-sm text-gray-500 mt-1">Summarise the fault, findings or observations.</p>
        </header>
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
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Additional Notes</h2>
          <p className="text-sm text-gray-500 mt-1">Capture handover notes, risks or recommended next actions.</p>
        </header>
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

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Photos & video</h2>
            <p className="text-sm text-gray-500 mt-1">Add photos or short videos of the site, fault, or work completed (optional).</p>
          </div>
          {selectedPhotos.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {selectedPhotos.length} attachment{selectedPhotos.length === 1 ? '' : 's'}
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
        <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2" />
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
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
            <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-12 sm:gap-2 mb-3">
              <div className="sm:col-span-4">
                <SearchableSelect
                  id="stock-sku"
                  aria-label="Stock component"
                  value={newStockItem.sku}
                  onChange={v => setNewStockItem({ ...newStockItem, sku: v })}
                  options={stockSkuOptions}
                  placeholder="Search component…"
                />
              </div>
              <div className="sm:col-span-4">
                <SearchableSelect
                  id="stock-location"
                  aria-label="Stock location"
                  value={newStockItem.locationId}
                  onChange={v => setNewStockItem({ ...newStockItem, locationId: v })}
                  options={stockLocationOptions}
                  placeholder="Search location…"
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

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
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
      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Attachments</h2>
            <p className="text-sm text-gray-500 mt-1">Capture supporting photos or videos from site.</p>
          </div>
          {selectedPhotos.length > 0 && (
            <span className="text-sm font-medium text-blue-600">
              {selectedPhotos.length} attachment{selectedPhotos.length === 1 ? '' : 's'}
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

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Customer Acknowledgement</h2>
          <p className="text-sm text-gray-500 mt-1">
            Capture customer details and signature confirming completed work.
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
              Customer Signature *
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
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Clear signature
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-6">
        <header className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Submission Summary</h2>
          <p className="text-sm text-gray-500 mt-1">Quick review before submitting this job card.</p>
        </header>
        <div className="space-y-3">
          <SummaryRow label="Technician" value={formData.agentName} />
          <SummaryRow label="Client" value={formData.clientName || clients.find(c => c.id === formData.clientId)?.name} />
          <SummaryRow label="Site" value={formData.siteName} />
          <SummaryRow label="Travel Distance" value={travelKm > 0 ? `${travelKm.toFixed(1)} km` : ''} />
          <SummaryRow label="Stock Lines" value={formData.stockUsed.length > 0 ? `${formData.stockUsed.length}` : ''} />
          <SummaryRow label="Materials Cost" value={totalMaterialCost > 0 ? `R ${totalMaterialCost.toFixed(2)}` : ''} />
          <SummaryRow label="Photos / video" value={selectedPhotos.length > 0 ? `${selectedPhotos.length}` : ''} />
          <SummaryRow label="Customer Signature" value={hasSignature ? 'Captured' : 'Pending'} />
        </div>
      </section>
      {renderNavigationButtons()}
    </div>
  );

  const renderNavigationButtons = () => (
    <div className="mt-6 pt-6 border-t border-gray-200 bg-white rounded-lg p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="text-[10px] sm:text-xs text-gray-500 text-center sm:text-left">
          Step {currentStep + 1} of {STEP_IDS.length}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentStep === 0 || isSubmitting}
            className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold touch-manipulation"
          >
            Back
          </button>

          {currentStep < STEP_IDS.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold shadow-sm touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          ) : (
            <button
              type="submit"
              onClick={(event) => { event.preventDefault(); handleSave(); }}
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 text-sm font-semibold shadow-sm touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Submit Job Card'}
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading job card form...</p>
        </div>
      </div>
    );
  }

  if (wizardFlow === 'landing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-700 via-blue-600 to-indigo-900 text-white px-4 py-10">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center space-y-2">
            <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">
              Mobile Job Card
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-white">
              Job Card App
            </h1>
            <p className="text-sm text-white/80">
              Continue a draft on this device or start a new job card.
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={startNewJobCard}
              className="w-full rounded-2xl bg-blue-500/30 backdrop-blur-sm text-white px-5 py-5 text-left shadow-lg hover:bg-blue-500/40 transition touch-manipulation border border-white/25"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-white">
                  <i className="fa-solid fa-plus text-xl" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-base sm:text-lg">Create new job card</span>
                  <span className="block text-sm text-white/80 mt-0.5">
                    Start the guided wizard for a new visit.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-white/50 flex-shrink-0" aria-hidden />
              </span>
            </button>
            <button
              type="button"
              onClick={openPriorList}
              className="w-full rounded-xl bg-white/95 text-blue-900 px-4 py-3 text-left shadow-md hover:bg-white transition touch-manipulation border border-white/40"
            >
              <span className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                  <i className="fa-solid fa-clock-rotate-left text-base" aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm">Edit prior job card</span>
                  <span className="block text-xs text-blue-800/80 mt-0.5 leading-snug">
                    Open drafts saved on this phone or tablet, newest first.
                  </span>
                </span>
                <i className="fa-solid fa-chevron-right text-blue-400 text-sm flex-shrink-0" aria-hidden />
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (wizardFlow === 'prior_list') {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-gray-100 to-gray-50">
        <header className="flex-shrink-0 bg-gradient-to-br from-blue-600 via-blue-500 to-blue-500 text-white shadow-md px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => setWizardFlow('landing')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-white/90 hover:text-white mb-3 touch-manipulation"
          >
            <i className="fa-solid fa-arrow-left" aria-hidden />
            Back
          </button>
          <h1 className="text-xl font-bold">Prior job cards</h1>
          <p className="text-sm text-white/80 mt-1">Newest first — tap a card to continue editing.</p>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 pb-8">
          {priorJobCardsSorted.length === 0 ? (
            <div className="max-w-lg mx-auto mt-8 rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-600 shadow-sm">
              <i className="fa-regular fa-folder-open text-3xl text-gray-400 mb-3" aria-hidden />
              <p className="font-medium text-gray-800">No saved job cards yet</p>
              <p className="text-sm mt-2">
                Submit a job card once, or save offline — drafts will appear here on this device.
              </p>
              <button
                type="button"
                onClick={startNewJobCard}
                className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 touch-manipulation"
              >
                Create new job card
              </button>
            </div>
          ) : (
            <ul className="max-w-2xl mx-auto space-y-3">
              {priorJobCardsSorted.map(jc => {
                const when = jc.updatedAt || jc.createdAt;
                const whenLabel = when
                  ? new Date(when).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    })
                  : '';
                const title =
                  jc.jobCardNumber ||
                  (jc.clientName ? `${jc.clientName}` : 'Job card draft');
                return (
                  <li key={String(jc.id)}>
                    <button
                      type="button"
                      onClick={() => handleSelectPriorCard(jc)}
                      className="w-full text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition touch-manipulation"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">{title}</p>
                          <p className="text-sm text-gray-600 mt-1 truncate">
                            {[jc.agentName, jc.siteName].filter(Boolean).join(' · ') || 'No site'}
                          </p>
                          {whenLabel && (
                            <p className="text-xs text-gray-500 mt-2">{whenLabel}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {jc.synced ? (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                              Submitted
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
      </div>
    );
  }

  return (
    <div className="job-card-public-wrapper fixed inset-0 flex flex-col xl:flex-row bg-gradient-to-b from-gray-100 to-gray-50 overflow-hidden">
      {/* Desktop Sidebar - Vertical Steps */}
      <aside className="hidden xl:flex xl:flex-col xl:w-56 flex-shrink-0 bg-gradient-to-br from-blue-600 via-blue-500 to-blue-500 text-white shadow-xl z-10 overflow-y-auto overflow-x-hidden">
        <div className="p-4 pb-2 border-b border-white/20">
          <p className="text-[10px] uppercase tracking-wide text-white/70 font-semibold mb-1">
            Mobile Job Card
          </p>
          <h1 className="text-lg font-bold leading-tight text-white">
            Job Card App Wizard
          </h1>
          {editingMeta && (
            <p className="text-xs text-amber-100 mt-1.5 font-medium">
              Editing {editingMeta.jobCardNumber || 'saved draft'}
              {editingMeta.synced ? ' (already submitted)' : ''}
            </p>
          )}
          <p className="text-xs text-white/80 mt-2">
            Capture job cards in minutes with a guided, offline-friendly flow.
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

      {/* Mobile Header */}
      <header className="xl:hidden flex-shrink-0 relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-blue-500 text-white shadow-lg z-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-20 h-44 w-44 rounded-full bg-white/15 blur-3xl"></div>
          <div className="absolute -bottom-24 right-0 h-56 w-56 rounded-full bg-white/10 blur-3xl"></div>
        </div>
        <div className="relative p-3 sm:p-5">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] sm:text-[11px] uppercase tracking-wide text-white/70 font-semibold">
                  Mobile Job Card
                </p>
                <h1 className="text-lg sm:text-2xl font-bold leading-tight mt-1 text-white">
                  Job Card App Wizard
                </h1>
                {editingMeta && (
                  <p className="text-[11px] sm:text-xs text-amber-100 font-medium mt-1">
                    Editing {editingMeta.jobCardNumber || 'draft'}
                    {editingMeta.synced ? ' · submitted' : ''}
                  </p>
                )}
                <p className="text-xs sm:text-sm text-white/80 mt-2 hidden sm:block">
                  Capture job cards in minutes with a guided, offline-friendly flow.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 sm:mt-0">
                <span
                  className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-[10px] sm:text-xs font-semibold justify-center ${
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
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] sm:text-xs font-semibold hover:bg-white/25 transition"
                >
                  <i className="fa-regular fa-share-from-square text-xs"></i>
                  <span className="hidden sm:inline">Share</span>
                </button>
                <button
                  type="button"
                  onClick={exitToMenu}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] sm:text-xs font-semibold hover:bg-white/25 transition touch-manipulation"
                >
                  <i className="fa-solid fa-house text-xs" aria-hidden />
                  <span className="hidden sm:inline">Menu</span>
                </button>
              </div>
            </div>
            <div className="mt-3 sm:mt-4">
              <div
                className="mobile-step-scroll flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 snap-x snap-mandatory scrollbar-hide"
                aria-label="Wizard steps"
              >
                {STEP_IDS.map((stepId, idx) => (
                  <StepBadge
                    key={`mobile-${stepId}`}
                    index={idx}
                    stepId={stepId}
                    active={idx === currentStep}
                    complete={idx < currentStep}
                    onClick={() => goToStep(idx)}
                    className="flex-shrink-0"
                  />
                ))}
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] sm:text-xs font-medium text-white/70">
                <span>Progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Scrollable Content Area - min-h-0 allows flex item to shrink and enable scroll */}
        <div className="job-card-scrollable-content flex-1 min-h-0 overflow-y-auto overflow-x-hidden -webkit-overflow-scrolling-touch">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {stepError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 flex items-start gap-2 text-sm">
                <i className="fas fa-exclamation-circle mt-0.5 flex-shrink-0"></i>
                <div className="leading-relaxed">{stepError}</div>
              </div>
            )}

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
  if (window.debug && !window.debug.performanceMode) {
  }
} catch (error) {
  console.error('❌ JobCardFormPublic.jsx: Error registering component:', error);
}


