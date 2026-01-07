// Use React from window (fallback to global React if needed)
const ReactGlobal = (typeof window !== 'undefined' && window.React) || (typeof React !== 'undefined' && React) || {};
const { useState, useEffect } = ReactGlobal;

const PermissionGate =
  (typeof window !== 'undefined' && window.PermissionGate) ||
  (({ children }) => children);

const ServiceAndMaintenance = () => {
  const { user } = window.useAuth();
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [jobCardsReady, setJobCardsReady] = useState(!!window.JobCards);
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [copyStatus, setCopyStatus] = useState('Copy share link');
  const [selectedJobCard, setSelectedJobCard] = useState(null);
  const [showJobCardDetail, setShowJobCardDetail] = useState(false);
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

  // Read job card ID from URL and load the job card
  useEffect(() => {
    let isCancelled = false;
    
    const loadJobCardFromUrl = async () => {
      if (isCancelled) return;
      
      try {
        // Get job card ID from route
        let jobCardId = null;
        
        if (window.RouteState) {
          const route = window.RouteState.getRoute();
          if (route.page === 'service-maintenance' && route.segments && route.segments.length > 0) {
            jobCardId = route.segments[0];
          }
        } else {
          // Fallback: parse from URL pathname
          const pathname = window.location.pathname || '';
          const hash = window.location.hash || '';
          const segments = pathname.split('/').filter(Boolean);
          const serviceIndex = segments.indexOf('service-maintenance');
          if (serviceIndex >= 0 && segments[serviceIndex + 1]) {
            jobCardId = segments[serviceIndex + 1];
          } else {
            // Also check hash
            const hashSegments = hash.replace('#', '').split('/').filter(Boolean);
            const hashServiceIndex = hashSegments.indexOf('service-maintenance');
            if (hashServiceIndex >= 0 && hashSegments[hashServiceIndex + 1]) {
              jobCardId = hashSegments[hashServiceIndex + 1];
            }
          }
        }

        if (jobCardId) {
          // Check if we already have this job card loaded
          if (selectedJobCard && selectedJobCard.id === jobCardId) {
            // Already showing the correct job card
            if (!showJobCardDetail) {
              setShowJobCardDetail(true);
            }
            return;
          }

          // Load the job card from API (always use database ID for fast lookup)
          const token = window.storage?.getToken?.();
          if (!token) {
            return;
          }

          try {
            const response = await fetch(`/api/jobcards/${encodeURIComponent(jobCardId)}`, {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            if (isCancelled) return;

            if (response.ok) {
              const data = await response.json();
              const jobCard = data.jobCard || data.data?.jobCard || data.data || data;
              if (jobCard && jobCard.id) {
                setSelectedJobCard(jobCard);
                setShowJobCardDetail(true);
              }
            } else if (response.status === 404) {
              // Clear the detail view if job card not found
              setShowJobCardDetail(false);
              setSelectedJobCard(null);
            }
          } catch (error) {
            if (!isCancelled) {
              console.error('Error loading job card from URL:', error);
            }
          }
        } else {
          // No job card ID in URL - close detail view if open
          if (showJobCardDetail) {
            setShowJobCardDetail(false);
            setSelectedJobCard(null);
          }
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Error reading job card ID from URL:', error);
        }
      }
    };

    loadJobCardFromUrl();

    // Listen for route changes (debounced to avoid excessive calls)
    let routeChangeTimeout;
    const handleRouteChange = () => {
      clearTimeout(routeChangeTimeout);
      routeChangeTimeout = setTimeout(() => {
        if (!isCancelled) {
          loadJobCardFromUrl();
        }
      }, 100); // Small delay to batch rapid route changes
    };

    let unsubscribe;
    if (window.RouteState && window.RouteState.subscribe) {
      unsubscribe = window.RouteState.subscribe(handleRouteChange);
    } else {
      // Fallback: listen to popstate events
      window.addEventListener('popstate', handleRouteChange);
    }

    return () => {
      isCancelled = true;
      clearTimeout(routeChangeTimeout);
      if (unsubscribe) {
        unsubscribe();
      } else {
        window.removeEventListener('popstate', handleRouteChange);
      }
    };
  }, [showJobCardDetail, selectedJobCard]);

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

  const handleOpenJobCardDetail = (jobCard) => {
    setSelectedJobCard(jobCard);
    setShowJobCardDetail(true);
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
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-300">
            <i className="fa-solid fa-list-check text-sm" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Forms &amp; checklists
            </div>
            <div className="text-sm text-slate-100">
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
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-200">
                <i className="fa-solid fa-triangle-exclamation text-[10px]" />
                Forms disabled
              </span>
            ) : (
              <>
                <select
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
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
                  className="inline-flex items-center gap-1 rounded-full bg-primary-500 px-3 py-1 text-[11px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-400" />
          <span>Loading forms for this job card…</span>
        </div>
      )}

      {!loadingForms && !featureUnavailable && forms.length === 0 && (
        <p className="text-xs text-slate-300">
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
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/40'
              : status === 'in_progress'
              ? 'bg-sky-500/10 text-sky-300 border-sky-400/40'
              : 'bg-slate-700/60 text-slate-100 border-slate-600';

          return (
            <div
              key={form.id}
              className="rounded-xl border border-slate-700 bg-slate-950/40 p-3 text-xs text-slate-100"
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
                    <div className="mt-0.5 text-[11px] text-slate-300">
                      {tpl.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSaveForm(form, false)}
                    disabled={savingFormId === form.id}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingFormId === form.id && (
                      <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-white" />
                    )}
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveForm(form, true)}
                    disabled={savingFormId === form.id}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <i className="fa-solid fa-check text-[9px]" />
                    <span>Mark complete</span>
                  </button>
                </div>
              </div>

              {fields.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700 px-3 py-2 text-[11px] text-slate-300">
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
                        'w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500',
                    };

                    return (
                      <div key={fieldId} className="space-y-1">
                        <label
                          htmlFor={commonProps.id}
                          className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-200"
                        >
                          <span>{field.label || 'Field'}</span>
                          {field.required && (
                            <span className="text-[10px] font-semibold text-rose-300">
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
                          <p className="text-[10px] text-slate-400">
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
    <div className="relative p-4 min-h-[calc(100vh-56px)]">
      <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Service & Maintenance
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Choose between classic scheduling and the mobile-first capture flow. Both work offline and will sync when connectivity returns.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
              isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Classic View
                  </p>
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1">
                    Job Card Manager
                  </h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
                    Full dashboard view with scheduling, timelines, history, and advanced filters. Use when you need the high-level overview.
                  </p>
                </div>
                <div className="hidden sm:flex items-center justify-center h-12 w-12 rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-200">
                  <i className="fa-regular fa-clipboard-list text-lg" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                  <i className="fa-solid fa-laptop text-[11px]" />
                  Desktop optimised
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300">
                  <i className="fa-solid fa-cloud-arrow-up text-[11px]" />
                  Auto-sync offline data
                </span>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleOpenClassic}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 active:bg-primary-800 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 transition-all"
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
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-primary-600 bg-primary-50 hover:bg-primary-100 active:bg-primary-200 dark:bg-primary-900/30 dark:hover:bg-primary-900/40 dark:text-primary-200 transition-all"
                >
                  <i className="fa-solid fa-plus text-xs" />
                  New job card
                </button>
                {!jobCardsReady || !window.JobCards ? (
                  <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">
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
                    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                            <i className="fa-solid fa-list-check text-[11px]" />
                          </span>
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide">
                              Forms &amp; checklists
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400">
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
                          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-primary-700 shadow-sm ring-1 ring-primary-100 hover:bg-primary-50 dark:bg-primary-900/40 dark:text-primary-100 dark:ring-primary-800/60 dark:hover:bg-primary-900/60"
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

          <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-primary-600 via-primary-500 to-blue-500 text-white shadow-lg">
            <div className="absolute -top-20 -right-20 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
            <div className="relative p-5 sm:p-6">
              <p className="text-xs uppercase tracking-wide text-white/80">
                Mobile View
              </p>
              <h2 className="text-xl font-semibold mt-1">
                Field Tech Form
              </h2>
              <p className="text-sm text-white/80 mt-2">
                Tap-friendly wizard with photo uploads, smart checklists, customer sign-off, and offline save. Perfect for technicians on site.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-white/80">
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15">
                  <i className="fa-solid fa-mobile-screen text-[11px]" />
                  Optimised for touch
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15">
                  <i className="fa-solid fa-pen-nib text-[11px]" />
                  Signature capture
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/15">
                  <i className="fa-solid fa-wifi-slash text-[11px]" />
                  Works offline
                </span>
              </div>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <a
                  href="/job-card"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-primary-600 bg-white hover:bg-white/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-400 focus-visible:ring-offset-primary-600 transition-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fa-solid fa-arrow-up-right-from-square text-xs" />
                  Open mobile form
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 transition-all"
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
            <div className="text-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500 mx-auto mb-3" />
              <p>Job cards module is still loading. You can continue to use the mobile form in the meantime.</p>
            </div>
          </div>
        )}
      </div>

      {/* Full-area job card detail overlay (within main content, not over sidebar) */}
      {showJobCardDetail && selectedJobCard && (
        <div className="absolute inset-0 z-40 flex flex-col bg-slate-950/80 backdrop-blur-sm">
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 shadow-lg">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCloseJobCardDetail}
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
                if (window.JobCards?.openEditJobCardModal) {
                  window.JobCards.openEditJobCardModal(selectedJobCard);
                } else if (window.JobCardModal) {
                  // Fallback: dispatch event for JobCards to handle
                  window.dispatchEvent(
                    new CustomEvent('jobcards:edit', { detail: { jobCard: selectedJobCard } })
                  );
                }
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
                          <span className="ml-1 text-slate-400">• {selectedJobCard.siteName}</span>
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

                {/* Narrative */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 space-y-4">
                  <header className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-300">
                      <i className="fa-solid fa-clipboard-list text-sm" />
                    </span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Visit summary
                      </div>
                      <div className="text-sm text-slate-100">
                        {selectedJobCard.reasonForVisit || 'No visit reason captured.'}
                      </div>
                    </div>
                  </header>

                  <div className="grid gap-4 md:grid-cols-2 text-sm text-slate-100">
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Diagnosis
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.diagnosis || 'No diagnosis captured.'}
                      </p>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500">
                        Actions taken
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {selectedJobCard.actionsTaken || 'No actions recorded.'}
                      </p>
                    </div>
                  </div>

                  {selectedJobCard.otherComments ? (
                    <div>
                      <div className="text-[11px] font-semibold uppercase text-slate-500 mb-1">
                        Customer feedback &amp; notes
                      </div>
                      <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
                        {selectedJobCard.otherComments}
                      </div>
                    </div>
                  ) : null}
                </section>

                {/* Travel */}
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

                {/* Forms & checklists attached to this job card */}
                <JobCardFormsSection jobCard={selectedJobCard} />
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

                {/* Photos */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
                  <header className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink-500/10 text-pink-300">
                        <i className="fa-regular fa-image text-sm" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Photos
                        </div>
                        <div className="text-sm text-slate-100">
                          {Array.isArray(selectedJobCard.photos)
                            ? selectedJobCard.photos.length
                            : 0}{' '}
                          photo
                          {Array.isArray(selectedJobCard.photos) &&
                          selectedJobCard.photos.length === 1
                            ? ''
                            : 's'}
                        </div>
                      </div>
                    </div>
                  </header>
                  {Array.isArray(selectedJobCard.photos) && selectedJobCard.photos.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {selectedJobCard.photos.map((photo, idx) => (
                        <figure
                          key={idx}
                          className="group relative overflow-hidden rounded-xl bg-slate-800"
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
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/70 bg-slate-950/40 px-4 py-8 text-center">
                      <i className="fa-regular fa-image text-slate-500 text-xl mb-2" />
                      <p className="text-sm text-slate-300">
                        No photos have been attached to this job card.
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Encourage technicians to capture photos for better traceability.
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
            <div className="rounded-xl bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-lg">
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

