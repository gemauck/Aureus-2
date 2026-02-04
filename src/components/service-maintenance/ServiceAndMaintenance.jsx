// Use React from window (fallback to global React if needed)
const ReactGlobal = (typeof window !== 'undefined' && window.React) || (typeof React !== 'undefined' && React) || {};
const { useState, useEffect } = ReactGlobal;

const PermissionGate =
  (typeof window !== 'undefined' && window.PermissionGate) ||
  (({ children }) => children);

const ServiceAndMaintenance = () => {
  const { user } = window.useAuth();
  const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobCardsReady, setJobCardsReady] = useState(!!window.JobCards);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [copyStatus, setCopyStatus] = useState('Copy share link');
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [showJobCardDetail, setShowJobCardDetail] = useState(false);
  const [loadingJobCard, setLoadingJobCard] = useState(false);
  const [showFormsManager, setShowFormsManager] = useState(false);
  const [formsManagerReady, setFormsManagerReady] = useState(
    typeof window !== 'undefined' && !!window.ServiceFormsManager
  );

  // Load clients and users for JobCards
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load clients
        if (window.DatabaseAPI && window.DatabaseAPI.getClients) {
          const response = await window.DatabaseAPI.getClients();
          const clientsData = response?.data?.clients || response?.data || [];
          setClients(Array.isArray(clientsData) ? clientsData : []);
        }

        // Load users
        if (window.DatabaseAPI && window.DatabaseAPI.getUsers) {
          const response = await window.DatabaseAPI.getUsers();
          const usersData = response?.data?.users || response?.data || [];
          setUsers(Array.isArray(usersData) ? usersData : []);
        }
      } catch (error) {
        console.error('Error loading data for Service and Maintenance:', error);
      }
    };

    loadData();
  }, []);

  // Poll for JobCards component registration to avoid permanent loading state
  useEffect(() => {
    if (jobCardsReady) {
      return;
    }

    let cancelled = false;
    const checkJobCards = () => {
      if (!cancelled && window.JobCards) {
        setJobCardsReady(true);
      }
    };

    // Initial check in case it became available between render and effect
    checkJobCards();

    if (!jobCardsReady) {
      const interval = setInterval(checkJobCards, 150);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return undefined;
  }, [jobCardsReady]);

  // Poll for ServiceFormsManager registration so the "Open form builder"
  // button never appears to do nothing if the script loads slightly later.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (formsManagerReady) {
      return;
    }

    let cancelled = false;
    const checkFormsManager = () => {
      if (!cancelled && window.ServiceFormsManager) {
        setFormsManagerReady(true);
      }
    };

    // Initial check in case it became available between render and effect
    checkFormsManager();

    if (!formsManagerReady) {
      const interval = setInterval(checkFormsManager, 200);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }

    return undefined;
  }, [formsManagerReady]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Read job card ID from URL and load the job card - optimized for speed
  useEffect(() => {
    let isCancelled = false;
    let currentJobCardId = null;
    
    // Fast route reading function
    const getJobCardIdFromRoute = () => {
      if (window.RouteState) {
        const route = window.RouteState.getRoute();
        if (route.page === 'service-maintenance' && route.segments?.[0]) {
          return route.segments[0];
        }
      }
      // Fast fallback: check hash first (most common)
      const hash = window.location.hash || '';
      if (hash.includes('service-maintenance')) {
        const hashSegments = hash.replace('#', '').split('/').filter(Boolean);
        const idx = hashSegments.indexOf('service-maintenance');
        if (idx >= 0 && hashSegments[idx + 1]) {
          return hashSegments[idx + 1];
        }
      }
      // Check pathname
      const pathname = window.location.pathname || '';
      const segments = pathname.split('/').filter(Boolean);
      const idx = segments.indexOf('service-maintenance');
      if (idx >= 0 && segments[idx + 1]) {
        return segments[idx + 1];
      }
      return null;
    };
    
    const loadJobCardFromUrl = async () => {
      if (isCancelled) return;
      
      const jobCardId = getJobCardIdFromRoute();
      
      // No job card ID in URL
      if (!jobCardId) {
        if (showJobCardDetail) {
          setShowJobCardDetail(false);
          setSelectedJobCard(null);
        }
        setLoadingJobCard(false);
        return;
      }

      // Already loading or showing this job card
      if (currentJobCardId === jobCardId) {
        if (selectedJobCard && selectedJobCard.id === jobCardId && !showJobCardDetail) {
          setShowJobCardDetail(true);
        }
        return;
      }

      // Check if we already have this job card loaded
      if (selectedJobCard && selectedJobCard.id === jobCardId) {
        if (!showJobCardDetail) {
          setShowJobCardDetail(true);
        }
        setLoadingJobCard(false);
        return;
      }

      // Start loading
      currentJobCardId = jobCardId;
      setLoadingJobCard(true);

      const token = window.storage?.getToken?.();
      if (!token) {
        setLoadingJobCard(false);
        return;
      }

      try {
        const response = await fetch(`/api/jobcards/${encodeURIComponent(jobCardId)}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (isCancelled) {
          setLoadingJobCard(false);
          return;
        }

        if (response.ok) {
          const data = await response.json();
          const jobCard = data.jobCard || data.data?.jobCard || data.data || data;
          if (jobCard && jobCard.id) {
            setSelectedJobCard(jobCard);
            setShowJobCardDetail(true);
          }
        } else if (response.status === 404) {
          setShowJobCardDetail(false);
          setSelectedJobCard(null);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error loading job card:', error);
        }
      } finally {
        if (!isCancelled) {
          setLoadingJobCard(false);
        }
      }
    };

    // Load immediately
    loadJobCardFromUrl();

    // Listen for route changes (optimized - only on actual route changes)
    let routeChangeTimeout;
    const handleRouteChange = () => {
      clearTimeout(routeChangeTimeout);
      routeChangeTimeout = setTimeout(() => {
        if (!isCancelled) {
          const newJobCardId = getJobCardIdFromRoute();
          if (newJobCardId !== currentJobCardId) {
            currentJobCardId = null; // Reset to allow reload
            loadJobCardFromUrl();
          }
        }
      }, 50); // Reduced delay
    };

    let unsubscribe;
    if (window.RouteState && window.RouteState.subscribe) {
      unsubscribe = window.RouteState.subscribe(handleRouteChange);
    } else {
      window.addEventListener('popstate', handleRouteChange);
      // Also listen to hashchange for hash-based routing
      window.addEventListener('hashchange', handleRouteChange);
    }

    return () => {
      isCancelled = true;
      clearTimeout(routeChangeTimeout);
      if (unsubscribe) {
        unsubscribe();
      } else {
        window.removeEventListener('popstate', handleRouteChange);
        window.removeEventListener('hashchange', handleRouteChange);
      }
    };
  }, []); // Empty deps - only run on mount and route changes

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}/job-card`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyStatus('Link copied!');
      setTimeout(() => setCopyStatus('Copy share link'), 2000);
    } catch (error) {
      console.error('Failed to copy mobile link:', error);
      setCopyStatus('Copy failed');
      setTimeout(() => setCopyStatus('Copy share link'), 2500);
    }
  };

  const handleOpenJobCardDetail = async (jobCard) => {
    if (!jobCard?.id) {
      setSelectedJobCard(jobCard);
      setShowJobCardDetail(true);
      return;
    }
    setSelectedJobCard(jobCard);
    setShowJobCardDetail(true);
    setLoadingJobCard(true);
    try {
      const token = window.storage?.getToken?.();
      const response = await fetch(`/api/jobcards/${encodeURIComponent(jobCard.id)}`, {
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
      });
      if (response.ok) {
        const data = await response.json();
        const full = data?.jobCard || data?.data?.jobCard || data?.data || data;
        if (full && full.id) setSelectedJobCard(full);
      }
    } catch (e) {
      console.warn('Failed to load full job card details (photos etc.), showing list data', e);
    } finally {
      setLoadingJobCard(false);
    }
  };

  const handleCloseJobCardDetail = () => {
    setShowJobCardDetail(false);
    setSelectedJobCard(null);
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

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

// Job card forms & checklists section (attached dynamic forms)
const JobCardFormsSection = ({ jobCard }) => {
  if (!useState || !useEffect || !jobCard || !jobCard.id) {
    return null;
  }

  const [forms, setForms] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingFormId, setSavingFormId] = useState(null);
  const [attachTemplateId, setAttachTemplateId] = useState('');
  const [answersByForm, setAnswersByForm] = useState({});
  const [featureUnavailable, setFeatureUnavailable] = useState(false);

  const user = window.storage?.getUser?.();
  const isAdmin = user?.role?.toLowerCase?.() === 'admin';

  const token = window.storage?.getToken?.();
  const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };

  const syncAnswersState = (instances) => {
    const next = {};
    (instances || []).forEach((inst) => {
      const answersArray = Array.isArray(inst.answers) ? inst.answers : [];
      const map = {};
      answersArray.forEach((a) => {
        if (a && a.fieldId != null) {
          map[a.fieldId] = a.value;
        }
      });
      next[inst.id] = map;
    });
    setAnswersByForm(next);
  };

  useEffect(() => {
    if (!token || !jobCard.id) return;
    let cancelled = false;

    const loadForms = async () => {
      try {
        setLoadingForms(true);
        const res = await fetch(`/api/jobcards/${encodeURIComponent(jobCard.id)}/forms`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const text = await res.text();
          console.error('JobCardFormsSection: Failed to load forms', res.status, text);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          const instances = Array.isArray(data.forms) ? data.forms : [];
          setForms(instances);
          syncAnswersState(instances);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('JobCardFormsSection: Error loading forms', error);
        }
      } finally {
        if (!cancelled) {
          setLoadingForms(false);
        }
      }
    };

    loadForms();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCard.id, token]);

  useEffect(() => {
    if (!token) return;
    if (!isAdmin) return;
    let cancelled = false;

    const loadTemplates = async () => {
      try {
        setLoadingTemplates(true);
        const res = await fetch('/api/service-forms', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const text = await res.text();
          console.error('JobCardFormsSection: Failed to load templates', res.status, text);
          // If the backend has service forms disabled (tables missing), switch into a
          // featureUnavailable state so we can show a clear message instead of a
          // silent failure.
          try {
            const parsed = JSON.parse(text);
            const details = parsed?.error?.details || parsed?.details;
            if (details === 'SERVICE_FORMS_TABLE_MISSING') {
              setFeatureUnavailable(true);
              setTemplates([]);
              return;
            }
          } catch {
            // Ignore parse errors and fall back to generic logging
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setTemplates(Array.isArray(data.templates) ? data.templates : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('JobCardFormsSection: Error loading templates', error);
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
  }, [token, isAdmin]);

  const handleAttachTemplate = async () => {
    if (!attachTemplateId || !token || featureUnavailable) return;
    try {
      const res = await fetch(
        `/api/jobcards/${encodeURIComponent(jobCard.id)}/forms`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ templateId: attachTemplateId }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error('JobCardFormsSection: Failed to attach form', res.status, text);
        alert('Failed to attach form. Please try again.');
        return;
      }
      const data = await res.json();
      const created = data.form;
      const nextForms = [...forms, created];
      setForms(nextForms);
      syncAnswersState(nextForms);
      setAttachTemplateId('');
    } catch (error) {
      console.error('JobCardFormsSection: Error attaching form', error);
      alert(error.message || 'Failed to attach form.');
    }
  };

  const handleAnswerChange = (formId, fieldId, value) => {
    setAnswersByForm((prev) => {
      const existing = prev[formId] || {};
      return {
        ...prev,
        [formId]: {
          ...existing,
          [fieldId]: value,
        },
      };
    });
  };

  const handleSaveForm = async (form, markComplete) => {
    if (!token) return;
    const tpl = templates.find((t) => t.id === form.templateId);
    const fields = Array.isArray(tpl?.fields) ? tpl.fields : [];
    const current = answersByForm[form.id] || {};
    const answers = fields.map((f, idx) => ({
      fieldId: f.id || `field_${idx}`,
      value: current[f.id] ?? '',
    }));

    try {
      setSavingFormId(form.id);
      const res = await fetch(
        `/api/jobcards/${encodeURIComponent(jobCard.id)}/forms/${encodeURIComponent(form.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            answers,
            status: markComplete ? 'completed' : 'in_progress',
            completedAt: markComplete ? new Date().toISOString() : null,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error('JobCardFormsSection: Failed to save form', res.status, text);
        alert('Failed to save form. Please try again.');
        return;
      }
      const data = await res.json();
      const updated = data.form;
      const nextForms = forms.map((f) => (f.id === updated.id ? updated : f));
      setForms(nextForms);
      syncAnswersState(nextForms);
    } catch (error) {
      console.error('JobCardFormsSection: Error saving form', error);
      alert(error.message || 'Failed to save form.');
    } finally {
      setSavingFormId(null);
    }
  };

  const overallCount = forms.length;
  const completedCount = forms.filter(
    (f) => (f.status || '').toString().toLowerCase() === 'completed'
  ).length;

  return (
    <section className={`${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'} rounded-xl border p-5 space-y-4 shadow-sm`}>
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
            <i className="fa-solid fa-list-check text-sm" />
          </span>
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Forms &amp; checklists
            </div>
            <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              {featureUnavailable
                ? 'Forms feature not enabled in this environment'
                : overallCount === 0
                ? 'No forms attached'
                : `${completedCount}/${overallCount} forms completed`}
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 text-[11px]">
            {featureUnavailable ? (
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ${isDark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-100 text-amber-700'}`}>
                <i className="fa-solid fa-triangle-exclamation text-[10px]" />
                Forms disabled
              </span>
            ) : (
              <>
                <select
                  className={`rounded-lg border px-2 py-1 text-[11px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDark ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-200 bg-gray-50 text-gray-900'}`}
                  value={attachTemplateId}
                  disabled={loadingTemplates}
                  onChange={(e) => setAttachTemplateId(e.target.value)}
                >
                  <option value="">
                    {loadingTemplates ? 'Loading templates…' : 'Attach form'}
                  </option>
                  {(templates || []).map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAttachTemplate}
                  disabled={!attachTemplateId}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <i className="fa-solid fa-plus text-[9px]" />
                  Add
                </button>
              </>
            )}
          </div>
        )}
      </header>

      {loadingForms && (
        <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
          <span className={`h-4 w-4 animate-spin rounded-full border-b-2 ${isDark ? 'border-blue-400' : 'border-blue-500'}`} />
          <span>Loading forms for this job card…</span>
        </div>
      )}

      {!loadingForms && !featureUnavailable && forms.length === 0 && (
        <p className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
          No forms have been attached to this job card yet.
        </p>
      )}

      <div className="space-y-3">
        {!featureUnavailable &&
          forms.map((form) => {
          const tpl = templates.find((t) => t.id === form.templateId) || {};
          const fields = Array.isArray(tpl.fields) ? tpl.fields : [];
          const answers = answersByForm[form.id] || {};
          const status = (form.status || 'not_started').toString().toLowerCase();

          const statusClasses =
            status === 'completed'
              ? (isDark ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
              : status === 'in_progress'
              ? (isDark ? 'bg-sky-500/10 text-sky-300 border-sky-400/40' : 'bg-sky-50 text-sky-700 border-sky-200')
              : (isDark ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-gray-100 text-gray-700 border-gray-200');

          return (
            <div
              key={form.id}
              className={`${isDark ? 'border-gray-800 bg-gray-950 text-gray-100' : 'border-gray-100 bg-white text-gray-900'} rounded-xl border p-3 text-xs`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">
                      {form.templateName || tpl.name || 'Form'}
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusClasses}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {status === 'completed'
                        ? 'Completed'
                        : status === 'in_progress'
                        ? 'In progress'
                        : 'Not started'}
                    </span>
                  </div>
                  {(tpl.description || '').trim() && (
                    <div className={`mt-0.5 text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {tpl.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSaveForm(form, false)}
                    disabled={savingFormId === form.id}
                    className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-60 ${isDark ? 'border-gray-700 text-gray-100 hover:bg-gray-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    {savingFormId === form.id && (
                      <span className={`h-3 w-3 animate-spin rounded-full border-b-2 ${isDark ? 'border-white' : 'border-gray-600'}`} />
                    )}
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveForm(form, true)}
                    disabled={savingFormId === form.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <i className="fa-solid fa-check text-[9px]" />
                    <span>Mark complete</span>
                  </button>
                </div>
              </div>

              {fields.length === 0 ? (
                <div className={`rounded-lg border border-dashed px-3 py-2 text-[11px] ${isDark ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
                  This form has no visible fields configured yet.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field, idx) => {
                    const fieldId = field.id || `field_${idx}`;
                    const value = answers[fieldId] ?? '';

                    // Simple conditional visibility: if a field defines a
                    // visibilityCondition, only render it when the referenced
                    // field's answer matches the expected value.
                    if (field.visibilityCondition && field.visibilityCondition.fieldId) {
                      const raw = answers[field.visibilityCondition.fieldId];
                      const normalised =
                        raw == null
                          ? ''
                          : typeof raw === 'string'
                          ? raw.toLowerCase()
                          : String(raw).toLowerCase();
                      const expected = String(
                        field.visibilityCondition.equals ?? ''
                      ).toLowerCase();
                      if (!expected || normalised !== expected) {
                        return null;
                      }
                    }

                    const commonProps = {
                      id: `${form.id}_${fieldId}`,
                      value,
                      onChange: (e) =>
                        handleAnswerChange(form.id, fieldId, e.target.value),
                      className:
                        `w-full rounded-lg border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDark ? 'border-gray-700 bg-gray-800 text-gray-100 placeholder-gray-400 focus:border-blue-500' : 'border-gray-200 bg-gray-50 text-gray-900 placeholder-gray-500 focus:border-blue-500'}`,
                    };

                    return (
                      <div key={fieldId} className="space-y-1">
                        <label
                          htmlFor={commonProps.id}
                          className={`flex items-center justify-between gap-2 text-[11px] font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}
                        >
                          <span>{field.label || 'Field'}</span>
                          {field.required && (
                            <span className={`text-[10px] font-semibold ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>
                              Required
                            </span>
                          )}
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            {...commonProps}
                          />
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            {...commonProps}
                          />
                        ) : field.type === 'checkbox' ? (
                          <select
                            {...commonProps}
                          >
                            <option value="">Select…</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        ) : field.type === 'select' ? (
                          <select
                            {...commonProps}
                          >
                            <option value="">Select…</option>
                            {Array.isArray(field.options)
                              ? field.options
                                  .filter(Boolean)
                                  .map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))
                              : null}
                          </select>
                        ) : (
                          <input
                            type="text"
                            {...commonProps}
                          />
                        )}
                        {field.helpText && (
                          <p className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
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
  );
};

  const handleOpenClassic = () => {
    try {
      // If the JobCards manager is available, ask it to open the classic manager UI
      if (window.JobCards && typeof window.JobCards.openNewJobCardModal === 'function') {
        window.JobCards.openNewJobCardModal();
        return;
      }

      // Fallback: scroll to the classic Job Cards manager section on this page
      const classicSection = document.querySelector('[data-section="jobcards-classic-manager"]');
      if (classicSection) {
        classicSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    } catch (error) {
      console.warn('ServiceAndMaintenance: Failed to scroll to classic manager section', error);
    }

    // Fallback: keep legacy behaviour of navigating to the Service & Maintenance page
    const mainNav = document.querySelector('[data-navigation-target="service-maintenance"]');
    if (mainNav) {
      mainNav.click();
    } else {
      window.history.pushState({}, '', '/service-maintenance');
    }
  };

  return (
    <div className="relative p-6 min-h-[calc(100vh-56px)]">
      <div className="flex flex-col gap-6 mb-6">
        <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} rounded-xl border p-5 shadow-sm`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                <i className={`fa-solid fa-screwdriver-wrench ${isDark ? 'text-gray-300' : 'text-gray-600'}`}></i>
              </div>
              <div>
                <h1 className={`text-xl sm:text-2xl font-semibold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  Service &amp; Maintenance
                </h1>
                <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Choose between classic scheduling and the mobile-first capture flow. Both work offline and sync when connectivity returns.
                </p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                isOnline
                  ? isDark ? 'bg-emerald-500/10 text-emerald-200' : 'bg-emerald-100 text-emerald-700'
                  : isDark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  isOnline ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`}
              />
              {isOnline ? 'Online' : 'Offline mode'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className={`${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} border rounded-xl shadow-sm overflow-hidden`}>
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Classic View
                  </p>
                  <h2 className={`text-xl font-semibold mt-1 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    Job Card Manager
                  </h2>
                  <p className={`text-sm mt-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Full dashboard view with scheduling, timelines, history, and advanced filters. Use when you need the high-level overview.
                  </p>
                </div>
                <div className={`hidden sm:flex items-center justify-center h-12 w-12 rounded-full ${isDark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-50 text-blue-600'}`}>
                  <i className="fa-regular fa-clipboard-list text-lg" />
                </div>
              </div>

              <div className={`mt-4 flex flex-wrap items-center gap-2 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  <i className="fa-solid fa-laptop text-[11px]" />
                  Desktop optimised
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${isDark ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                  <i className="fa-solid fa-cloud-arrow-up text-[11px]" />
                  Auto-sync offline data
                </span>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleOpenClassic}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 active:bg-blue-700 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-all ${isDark ? 'focus-visible:ring-offset-gray-900' : 'focus-visible:ring-offset-white'}`}
                >
                  <i className="fa-solid fa-table-columns text-xs" />
                  Open Classic Manager
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.JobCards?.openNewJobCardModal) {
                      window.JobCards.openNewJobCardModal();
                    } else {
                      window.dispatchEvent(new Event('jobcards:open'));
                    }
                  }}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${isDark ? 'text-blue-200 bg-blue-500/10 hover:bg-blue-500/20' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`}
                >
                  <i className="fa-solid fa-plus text-xs" />
                  New job card
                </button>
                {!jobCardsReady || !window.JobCards ? (
                  <span className={`mt-1 text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Loading job cards module&hellip;
                  </span>
                ) : null}
              </div>

              {/* Admin-only: Service forms & checklists builder */}
              <PermissionGate
                permission={window.PERMISSIONS?.ACCESS_SERVICE_MAINTENANCE}
              >
                {(() => {
                  const user = window.storage?.getUser?.();
                  const isAdmin = user?.role?.toLowerCase?.() === 'admin';
                  if (!isAdmin) return null;
                  return (
                    <div className={`mt-4 rounded-xl border border-dashed px-3 py-3 text-xs ${isDark ? 'border-gray-800 bg-gray-900/60 text-gray-200' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isDark ? 'bg-blue-500/20 text-blue-200' : 'bg-blue-100 text-blue-700'}`}>
                            <i className="fa-solid fa-list-check text-[11px]" />
                          </span>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide">
                              Forms &amp; checklists
                            </div>
                            <div className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              Design reusable service forms and attach them to job cards.
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const hasManager = !!window.ServiceFormsManager;

                              // If the manager script has not been registered yet, try to load it
                              if (!hasManager) {
                                const isProduction =
                                  typeof window.USE_PRODUCTION_BUILD !== 'undefined'
                                    ? window.USE_PRODUCTION_BUILD === true
                                    : true;
                                const baseDir = isProduction ? '/dist/src/' : '/src/';
                                const path = 'components/service-maintenance/ServiceFormsManager.jsx';
                                const finalPath = isProduction
                                  ? `${baseDir}${path}`.replace('.jsx', '.js')
                                  : `${baseDir}${path}`;

                                const existingScript = document.querySelector(
                                  'script[data-component-path="components/service-maintenance/ServiceFormsManager.jsx"]'
                                );
                                if (!existingScript) {
                                  const script = document.createElement('script');
                                  if (isProduction) {
                                    script.src = finalPath;
                                    script.defer = true;
                                  } else {
                                    script.type = 'text/babel';
                                    script.src = finalPath;
                                  }
                                  script.dataset.componentPath =
                                    'components/service-maintenance/ServiceFormsManager.jsx';
                                  script.onerror = () => {
                                    console.error(
                                      '❌ ServiceAndMaintenance: Failed to load ServiceFormsManager script',
                                      finalPath
                                    );
                                  };
                                  document.body.appendChild(script);
                                } else {
                                }

                                // Give the loader a moment to register the component
                                setTimeout(() => {
                                  if (window.ServiceFormsManager) {
                                    setFormsManagerReady(true);
                                  } else {
                                    console.warn(
                                      '⚠️ ServiceAndMaintenance: ServiceFormsManager still not available after script injection'
                                    );
                                  }
                                }, 500);
                              } else {
                                setFormsManagerReady(true);
                              }

                              setShowFormsManager(true);
                            } catch (error) {
                              console.error(
                                '❌ ServiceAndMaintenance: Error handling Open form builder click',
                                error
                              );
                              alert(
                                'Unable to open the form builder right now. Please check the console for details or try again.'
                              );
                            }
                          }}
                          className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold shadow-sm ring-1 transition-all ${isDark ? 'bg-blue-500/10 text-blue-200 ring-blue-900/60 hover:bg-blue-500/20' : 'bg-white text-blue-700 ring-blue-100 hover:bg-blue-50'}`}
                        >
                          <i className="fa-solid fa-pen-to-square text-[10px]" />
                          Open form builder
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </PermissionGate>
            </div>
          </div>

          <div className={`relative overflow-hidden rounded-xl border shadow-sm ${isDark ? 'border-gray-800 bg-gradient-to-br from-primary-600 via-primary-500 to-blue-500 text-white' : 'border-primary-200 bg-gradient-to-br from-primary-50 via-white to-blue-50/80 text-gray-900'}`}>
            {isDark ? (
              <>
                <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
                <div className="absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
              </>
            ) : null}
            <div className="relative p-5 sm:p-6">
              <p className={`text-xs uppercase tracking-wide ${isDark ? 'text-white/80' : 'text-primary-600'}`}>
                Mobile View
              </p>
              <h2 className={`text-xl font-semibold mt-1 ${isDark ? '' : 'text-gray-900'}`}>
                Field Tech Form
              </h2>
              <p className={`text-sm mt-2 ${isDark ? 'text-white/80' : 'text-gray-600'}`}>
                Tap-friendly wizard with photo uploads, smart checklists, customer sign-off, and offline save. Perfect for technicians on site.
              </p>

              <div className={`mt-4 flex flex-wrap items-center gap-2 text-xs ${isDark ? 'text-white/80' : 'text-gray-600'}`}>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${isDark ? 'bg-white/15' : 'bg-primary-100/80 text-primary-700'}`}>
                  <i className="fa-solid fa-mobile-screen text-[11px]" />
                  Optimised for touch
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${isDark ? 'bg-white/15' : 'bg-primary-100/80 text-primary-700'}`}>
                  <i className="fa-solid fa-pen-nib text-[11px]" />
                  Signature capture
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg ${isDark ? 'bg-white/15' : 'bg-primary-100/80 text-primary-700'}`}>
                  <i className="fa-solid fa-wifi-slash text-[11px]" />
                  Works offline
                </span>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <a
                  href="/job-card"
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all ${isDark ? 'text-primary-600 bg-white hover:bg-white/90 focus-visible:ring-primary-400 focus-visible:ring-offset-primary-600' : 'text-white bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-400 focus-visible:ring-offset-white'}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                  Open mobile form
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition-all ${isDark ? 'bg-white/10 hover:bg-white/20 focus-visible:ring-white/60' : 'bg-primary-100 text-primary-700 hover:bg-primary-200 focus-visible:ring-primary-300'}`}
                >
                  <i className="fa-regular fa-copy text-xs" />
                  {copyStatus}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6" data-section="jobcards-classic-manager">
        {jobCardsReady && window.JobCards ? (
          <window.JobCards
            clients={clients}
            users={users}
            onOpenDetail={handleOpenJobCardDetail}
          />
        ) : (
          <div className="flex items-center justify-center">
            <div className={`text-center text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <div className={`animate-spin rounded-full h-6 w-6 border-b-2 mx-auto mb-3 ${isDark ? 'border-blue-400' : 'border-blue-500'}`} />
              <p>Job cards module is still loading. You can continue to use the mobile form in the meantime.</p>
            </div>
          </div>
        )}
      </div>

      {/* Full-area job card detail overlay (within main content, not over sidebar) */}
      {loadingJobCard && !selectedJobCard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className={`${isDark ? 'bg-gray-900 border-gray-800 text-gray-100' : 'bg-white border-gray-100 text-gray-700'} rounded-xl border p-8 text-center`}>
            <div className={`animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4 ${isDark ? 'border-blue-400' : 'border-blue-500'}`}></div>
            <p>Loading job card...</p>
          </div>
        </div>
      )}
      {showJobCardDetail && selectedJobCard && (
        <div className={`absolute inset-0 z-40 flex flex-col ${isDark ? 'bg-gray-950/80' : 'bg-white/95'} backdrop-blur-sm`}>
          {/* Top bar */}
          <div className={`flex items-center justify-between px-6 py-4 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} border-b shadow-sm`}>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCloseJobCardDetail}
                className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-gray-800 text-gray-100 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                aria-label="Back to job cards"
              >
                <i className="fa-solid fa-arrow-left" />
              </button>
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  Job Card
                </div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {selectedJobCard.jobCardNumber || 'New job card'}
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      (selectedJobCard.status || 'draft').toString().toLowerCase() === 'completed'
                        ? (isDark ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/40' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                        : (selectedJobCard.status || 'draft').toString().toLowerCase() === 'open'
                        ? (isDark ? 'bg-sky-500/10 text-sky-300 border-sky-400/40' : 'bg-sky-50 text-sky-700 border-sky-200')
                        : (selectedJobCard.status || 'draft').toString().toLowerCase() === 'cancelled'
                        ? (isDark ? 'bg-rose-500/10 text-rose-300 border-rose-400/40' : 'bg-rose-50 text-rose-700 border-rose-200')
                        : (isDark ? 'bg-gray-800 text-gray-100 border-gray-700' : 'bg-gray-100 text-gray-700 border-gray-200')
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {(selectedJobCard.status || 'draft').toString().toUpperCase()}
                  </span>
                </div>
                <p className={`mt-1 text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                  {selectedJobCard.clientName || 'Unknown client'} •{' '}
                  {selectedJobCard.agentName || 'Unknown technician'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (window.JobCards?.openEditJobCardModal) {
                  window.JobCards.openEditJobCardModal(selectedJobCard);
                } else if (window.JobCardModal) {
                  // Fallback: dispatch event for JobCards to handle
                  window.dispatchEvent(
                    new CustomEvent('jobcards:edit', { detail: { jobCard: selectedJobCard } })
                  );
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-600"
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
                <section className={`${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'} rounded-xl border p-5 shadow-sm`}>
                  <div className={`grid gap-4 md:grid-cols-3 text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Client
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.clientName || '–'}
                        {selectedJobCard.siteName && (
                          <span className={`ml-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>• {selectedJobCard.siteName}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Technician
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.agentName || 'Unknown technician'}
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Created
                      </div>
                      <div className="mt-1">{formatDate(selectedJobCard.createdAt)}</div>
                    </div>
                  </div>

                  <div className={`mt-4 grid gap-4 sm:grid-cols-3 text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Location
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.location || selectedJobCard.siteName || 'Not recorded'}
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Departure
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.timeOfDeparture
                          ? formatDate(selectedJobCard.timeOfDeparture)
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
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

                {/* Narrative */}
                <section className={`${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'} rounded-xl border p-5 space-y-4`}>
                  <header className="flex items-center gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                      <i className="fa-solid fa-clipboard-list text-sm" />
                    </span>
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Visit summary
                      </div>
                      <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {selectedJobCard.reasonForVisit || 'No visit reason captured.'}
                      </div>
                    </div>
                  </header>

                  <div className={`grid gap-4 md:grid-cols-2 text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Diagnosis
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.diagnosis || 'No diagnosis captured.'}
                      </p>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Actions taken
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.actionsTaken || 'No actions recorded.'}
                      </p>
                    </div>
                  </div>

                  {selectedJobCard.otherComments ? (
                    <div>
                      <div className={`text-[11px] font-semibold uppercase mb-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Customer feedback &amp; notes
                      </div>
                      <div className={`rounded-xl border border-dashed p-3 text-sm leading-relaxed whitespace-pre-wrap ${isDark ? 'border-gray-800 bg-gray-950 text-gray-100' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                        {selectedJobCard.otherComments}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* Travel */}
                <section className={`${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'} rounded-xl border p-5 space-y-4`}>
                  <header className="flex items-center gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-50 text-emerald-600'}`}>
                      <i className="fa-solid fa-car-side text-sm" />
                    </span>
                    <div>
                      <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        Travel &amp; usage
                      </div>
                      <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                        {typeof selectedJobCard.travelKilometers === 'number'
                          ? `${selectedJobCard.travelKilometers.toFixed(1)} km travelled`
                          : 'Travel distance not recorded'}
                      </div>
                    </div>
                  </header>

                  <div className={`grid gap-4 sm:grid-cols-3 text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Vehicle
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.vehicleUsed || 'Not specified'}
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        KM before
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.kmReadingBefore ?? '—'}
                      </div>
                    </div>
                    <div>
                      <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        KM after
                      </div>
                      <div className="mt-1">
                        {selectedJobCard.kmReadingAfter ?? '—'}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Forms & checklists attached to this job card */}
                <JobCardFormsSection jobCard={selectedJobCard} />
              </div>

              {/* Right column: map + photos */}
              <div className="space-y-6">
                {/* Map */}
                <section className={`${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'} rounded-xl border p-5 shadow-sm`}>
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                        <i className="fa-solid fa-location-dot text-sm" />
                      </span>
                      <div>
                        <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Job location
                        </div>
                        <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                          {selectedJobCard.location ||
                            selectedJobCard.siteName ||
                            selectedJobCard.clientName ||
                            'Not specified'}
                        </div>
                      </div>
                    </div>
                  </header>
                  <div className={`mt-3 h-64 rounded-xl overflow-hidden border ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
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
                            <div className={`relative h-full w-full ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}>
                              <iframe
                                title="Job location preview"
                                src={embedUrl}
                                className="h-full w-full border-0"
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                              />
                              <div className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t ${isDark ? 'from-gray-900/90' : 'from-white/90'} to-transparent px-4 py-3`}>
                                <div className={`flex items-center justify-between gap-3 text-xs ${isDark ? 'text-gray-100' : 'text-gray-700'}`}>
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${isDark ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-600'}`}>
                                      <i className="fa-solid fa-location-dot text-sm" />
                                    </span>
                                    <div>
                                      <p className="font-semibold">
                                        Open this location in OpenStreetMap
                                      </p>
                                      <p className={`text-[11px] ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                                        {latFixed}, {lngFixed}
                                      </p>
                                    </div>
                                  </div>
                                  <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${isDark ? 'bg-gray-800 text-gray-200 group-hover:bg-gray-700' : 'bg-white/80 text-gray-600 group-hover:bg-white'}`}>
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
                      <div className={`flex h-full items-center justify-center ${isDark ? 'bg-gray-950/60' : 'bg-gray-50'}`}>
                        <div className="text-center">
                          <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full mb-2 ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
                            <i className={`fa-regular fa-map ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                          </div>
                          <p className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                            No GPS data recorded
                          </p>
                          <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            Ask the technician to enable location services for future visits.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                {/* Photos */}
                <section className={`${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-100 bg-white'} rounded-xl border p-5 shadow-sm`}>
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${isDark ? 'bg-pink-500/20 text-pink-300' : 'bg-pink-50 text-pink-600'}`}>
                        <i className="fa-regular fa-image text-sm" />
                      </span>
                      <div>
                        <div className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          Photos
                        </div>
                        <div className={`text-sm ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                          {loadingJobCard && !Array.isArray(selectedJobCard.photos) ? (
                            <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Loading…</span>
                          ) : (
                            <>
                              {Array.isArray(selectedJobCard.photos)
                                ? selectedJobCard.photos.length
                                : 0}{' '}
                              photo
                              {Array.isArray(selectedJobCard.photos) &&
                              selectedJobCard.photos.length === 1
                                ? ''
                                : 's'}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </header>
                  {loadingJobCard && !Array.isArray(selectedJobCard.photos) ? (
                    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center ${isDark ? 'border-gray-800 bg-gray-950 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                      <i className="fa-solid fa-spinner fa-spin text-xl mb-2" />
                      <p className="text-sm">Loading photos…</p>
                    </div>
                  ) : Array.isArray(selectedJobCard.photos) && selectedJobCard.photos.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedJobCard.photos.map((photo, idx) => (
                        <figure
                          key={idx}
                          className={`group relative overflow-hidden rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}
                        >
                          <img
                            src={typeof photo === 'string' ? photo : photo.url}
                            alt={`Job card photo ${idx + 1}`}
                            className="h-32 w-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                        </figure>
                      ))}
                    </div>
                  ) : (
                    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-8 text-center ${isDark ? 'border-gray-800 bg-gray-950 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                      <i className={`fa-regular fa-image text-xl mb-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                      <p className="text-sm">
                        No photos have been attached to this job card.
                      </p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
                        Encourage technicians to capture photos for better traceability.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </div>

            <div className={`mt-4 flex items-center justify-between border-t pt-4 text-xs ${isDark ? 'border-gray-800 text-gray-400' : 'border-gray-100 text-gray-500'}`}>
              <div className="flex items-center gap-2">
                <i className="fa-regular fa-clock" />
                <span>
                  Last updated{' '}
                  {formatDate(selectedJobCard.updatedAt || selectedJobCard.createdAt)}
                </span>
              </div>
              <button
                type="button"
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${isDark ? 'border-gray-700 text-gray-200 hover:bg-gray-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                onClick={handleCloseJobCardDetail}
              >
                <i className="fa-solid fa-xmark" />
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showFormsManager ? (
        formsManagerReady && window.ServiceFormsManager ? (
          <window.ServiceFormsManager
            isOpen={showFormsManager}
            onClose={() => setShowFormsManager(false)}
          />
        ) : (
          <div className={`fixed inset-0 z-50 flex items-center justify-center ${isDark ? 'bg-gray-950/70' : 'bg-white/70'} backdrop-blur-sm`}>
            <div className={`${isDark ? 'bg-gray-900 text-gray-100 border-gray-800' : 'bg-white text-gray-700 border-gray-100'} rounded-xl border px-4 py-3 text-sm shadow-lg`}>
              Loading form builder&hellip;
            </div>
          </div>
        )
      ) : null}
    </div>
  );
};

// Make available globally
try {
  window.ServiceAndMaintenance = ServiceAndMaintenance;
  window.dispatchEvent(new Event('serviceMaintenanceComponentReady'));
} catch (error) {
  console.error('❌ ServiceAndMaintenance.jsx: Error:', error);
}

