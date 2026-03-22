// Shared voice note textarea for job card wizard and classic modal (global React bundle)
const { useState, useEffect, useRef, useCallback } = React;
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

/** Decode data URL to ArrayBuffer without fetch() (avoids connect-src / CSP issues). */
const dataUrlToArrayBuffer = dataUrl => {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid audio data')
  }
  const comma = dataUrl.indexOf(',')
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
  const bin = atob(b64.replace(/\s/g, ''))
  const len = bin.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** Build a Blob from a data URL (used for <audio> playback; CSP allows blob: in media-src). */
const dataUrlToBlob = dataUrl => {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid audio data')
  }
  const comma = dataUrl.indexOf(',')
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const mimeMatch = /^data:([^;,]+)/i.exec(meta)
  const mime = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream'
  const ab = dataUrlToArrayBuffer(dataUrl)
  return new Blob([ab], { type: mime })
}

const VOICE_CLIP_PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2]

const formatVoiceClipClock = sec => {
  if (!Number.isFinite(sec) || sec < 0) {
    return '0:00'
  }
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Play voice clips with HTMLMediaElement + blob URL — not Web Audio.
 * On iOS Safari, AudioContext output is often silent until the mic is active (play-and-record session);
 * using <audio> matches native playback and works without recording first.
 */
const VoiceClipWebPlayer = ({ dataUrl }) => {
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)
  const scrubbingRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [hint, setHint] = useState('')
  const [loadPhase, setLoadPhase] = useState('loading')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [speedIdx, setSpeedIdx] = useState(1)

  useEffect(() => {
    setHint('')
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setSpeedIdx(1)
    scrubbingRef.current = false
    const prevUrl = objectUrlRef.current
    if (prevUrl) {
      URL.revokeObjectURL(prevUrl)
      objectUrlRef.current = null
    }
    if (!dataUrl || typeof dataUrl !== 'string') {
      setLoadPhase('error')
      return undefined
    }
    setLoadPhase('loading')
    let cancelled = false
    try {
      const blob = dataUrlToBlob(dataUrl)
      const url = URL.createObjectURL(blob)
      const el = audioRef.current
      if (!el) {
        URL.revokeObjectURL(url)
        if (!cancelled) setLoadPhase('error')
        return undefined
      }
      objectUrlRef.current = url
      el.src = url
      el.load()
      el.playbackRate = VOICE_CLIP_PLAYBACK_SPEEDS[1]
      if (!cancelled) setLoadPhase('ready')
    } catch (e) {
      if (!cancelled) {
        setLoadPhase('error')
        console.warn('Voice clip blob failed:', e)
      }
    }
    return () => {
      cancelled = true
      const u = objectUrlRef.current
      if (u) {
        URL.revokeObjectURL(u)
        objectUrlRef.current = null
      }
      const el = audioRef.current
      if (el) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
    }
  }, [dataUrl])

  useEffect(() => {
    const el = audioRef.current
    if (el && loadPhase === 'ready') {
      el.playbackRate = VOICE_CLIP_PLAYBACK_SPEEDS[speedIdx] ?? 1
    }
  }, [speedIdx, loadPhase])

  const onPlayClick = useCallback(() => {
    setHint('')
    const el = audioRef.current
    if (!el || loadPhase !== 'ready') {
      setHint(loadPhase === 'loading' ? 'Loading audio…' : 'Could not load this recording.')
      return
    }
    if (playing) {
      try {
        el.pause()
        el.currentTime = 0
      } catch (_) {
        /* */
      }
      setPlaying(false)
      setCurrentTime(0)
      return
    }
    el.play()
      .then(() => setPlaying(true))
      .catch(err => {
        console.warn('Voice clip <audio>.play failed:', err)
        setHint('Could not play — check volume and silent mode, or tap Play again.')
        setPlaying(false)
      })
  }, [playing, loadPhase])

  const cycleSpeed = useCallback(() => {
    setSpeedIdx(i => (i + 1) % VOICE_CLIP_PLAYBACK_SPEEDS.length)
  }, [])

  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const speedLabel =
    VOICE_CLIP_PLAYBACK_SPEEDS[speedIdx] === 1
      ? '1×'
      : `${String(VOICE_CLIP_PLAYBACK_SPEEDS[speedIdx]).replace(/\.0+$/, '')}×`

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        className="sr-only"
        aria-hidden
        onEnded={() => {
          setPlaying(false)
          setCurrentTime(0)
        }}
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration
          setDuration(Number.isFinite(d) ? d : 0)
        }}
        onDurationChange={e => {
          const d = e.currentTarget.duration
          if (Number.isFinite(d) && d > 0) {
            setDuration(d)
          }
        }}
        onTimeUpdate={e => {
          if (scrubbingRef.current) {
            return
          }
          setCurrentTime(e.currentTarget.currentTime)
        }}
      />
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onPlayClick}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-gray-300 bg-white text-xs text-blue-600 shadow-sm hover:bg-blue-50 touch-manipulation disabled:opacity-50"
            title={playing ? 'Stop' : loadPhase === 'loading' ? 'Loading…' : 'Play'}
            aria-label={playing ? 'Stop playback' : 'Play recording'}
            disabled={loadPhase === 'loading' && !playing}
          >
            <i
              className={`fas ${playing ? 'fa-stop' : loadPhase === 'loading' ? 'fa-spinner fa-spin' : 'fa-play'}`}
            />
          </button>
          <span
            className="text-[10px] tabular-nums text-gray-600"
            aria-label="Playback position and duration"
          >
            {formatVoiceClipClock(currentTime)} /{' '}
            {safeDuration > 0 ? formatVoiceClipClock(safeDuration) : loadPhase === 'loading' ? '…' : '0:00'}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            type="range"
            min={0}
            max={safeDuration > 0 ? safeDuration : 0}
            step={0.01}
            value={safeDuration > 0 ? Math.min(currentTime, safeDuration) : 0}
            disabled={loadPhase !== 'ready' || safeDuration <= 0}
            onMouseDown={() => {
              scrubbingRef.current = true
            }}
            onMouseUp={() => {
              scrubbingRef.current = false
            }}
            onTouchStart={() => {
              scrubbingRef.current = true
            }}
            onTouchEnd={() => {
              scrubbingRef.current = false
            }}
            onTouchCancel={() => {
              scrubbingRef.current = false
            }}
            onChange={e => {
              const el = audioRef.current
              const next = parseFloat(e.target.value)
              if (!el || Number.isNaN(next)) {
                return
              }
              el.currentTime = next
              setCurrentTime(next)
            }}
            className="h-1.5 min-w-[72px] flex-1 cursor-pointer accent-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Playback position"
          />
          <button
            type="button"
            onClick={cycleSpeed}
            title="Playback speed"
            className="flex-shrink-0 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-gray-700 hover:bg-gray-50 touch-manipulation"
          >
            {speedLabel}
          </button>
        </div>
      </div>
      {hint && (
        <span className="text-[10px] text-amber-800" role="status">
          {hint}
        </span>
      )}
    </div>
  )
}

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
        if (typeof mr.requestData === 'function') {
          mr.requestData();
        }
      } catch (_) {
        /* optional final chunk flush */
      }
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
    /**
     * After stop(), `onstop` runs async; until then the ref still points at the old recorder.
     * Starting again immediately would no-op — clear an already-inactive recorder and continue.
     */
    const existingMr = mediaRecorderRef.current;
    if (existingMr) {
      if (existingMr.state === 'recording' || existingMr.state === 'paused') {
        return;
      }
      mediaRecorderRef.current = null;
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

    const recordingStream = stream;
    streamRef.current = recordingStream;
    const sessionChunks = [];
    const mr = createMediaRecorder(recordingStream);
    const appliedMime =
      mr.mimeType || pickAudioRecorderMimeType() || 'audio/webm';
    pendingNoteNumberRef.current = voiceClipsCountRef.current + 1;
    mr.ondataavailable = e => {
      if (e.data && e.data.size > 0) sessionChunks.push(e.data);
    };
    mr.onerror = ev => {
      console.warn('MediaRecorder error:', ev.error);
      if (mediaRecorderRef.current === mr) {
        mediaRecorderRef.current = null;
      }
      sessionChunks.length = 0;
      try {
        recordingStream.getTracks().forEach(t => t.stop());
      } catch (_) {}
      if (streamRef.current === recordingStream) {
        streamRef.current = null;
      }
      if (mountedRef.current) {
        setRecordHint('Recording error — try again.');
        setMicState('idle');
      }
    };
    mr.onstop = () => {
      if (mediaRecorderRef.current === mr) {
        mediaRecorderRef.current = null;
      }
      try {
        recordingStream.getTracks().forEach(t => t.stop());
      } catch (_) {}
      if (streamRef.current === recordingStream) {
        streamRef.current = null;
      }
      const blobType = (mr.mimeType && mr.mimeType.length > 0 ? mr.mimeType : appliedMime) || 'audio/webm';

      /** 0 = immediate, 1 = microtask, 2 = short timeout — some WebKit builds deliver the last slice late */
      const tryPersist = deferLevel => {
        const blob = new Blob(sessionChunks, { type: blobType });
        if (!blob.size || blob.size < MIN_AUDIO_BLOB_BYTES) {
          if (deferLevel === 0) {
            queueMicrotask(() => tryPersist(1));
          } else if (deferLevel === 1) {
            window.setTimeout(() => tryPersist(2), 96);
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

      tryPersist(0);
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
        const err = data.error && typeof data.error === 'object' ? data.error : null;
        const errCode =
          (err && typeof err.code === 'string' && err.code) ||
          (typeof data.code === 'string' ? data.code : null);
        const errMsg =
          err && typeof err.message === 'string'
            ? err.message
            : typeof data.error === 'string'
              ? data.error
              : null;
        const errDetails = err && typeof err.details === 'string' ? err.details : null;

        if (
          res.status === 503 &&
          (errCode === 'NO_OPENAI' || (errCode && errCode.startsWith('OPENAI_')))
        ) {
          setRecordHint(
            errMsg ||
              'Transcription is not configured on the server. Your admin can enable it with OPENAI_API_KEY, or type the text manually.'
          );
        } else if (res.status === 502 || res.status === 504) {
          setRecordHint(
            'Gateway timeout (502/504): the server proxy closed before Whisper finished. Try a shorter clip or retry. Admin: raise nginx proxy_read_timeout for /api/ to 300s (see scripts/nginx-bump-proxy-timeouts-300s.sh).'
          );
        } else {
          setRecordHint(
            errDetails ||
              errMsg ||
              'Transcription failed. Try again or type manually.'
          );
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
        className={`w-full pl-4 pr-12 py-3 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-y ${className}`}
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
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-xs shadow-sm touch-manipulation ${
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
                <VoiceClipWebPlayer dataUrl={clip.dataUrl} />
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
try {
  if (typeof window !== 'undefined') {
    window.JobCardVoiceNoteTextarea = VoiceNoteTextarea;
  }
} catch (e) {
  console.error('JobCardVoiceNoteTextarea:', e);
}
