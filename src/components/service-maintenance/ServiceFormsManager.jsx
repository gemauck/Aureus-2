// Lightweight Service Forms & Checklists manager for admins
const ReactGlobal =
  (typeof window !== 'undefined' && window.React) ||
  (typeof React !== 'undefined' && React) ||
  {};

const { useState, useEffect } = ReactGlobal;

const EMPTY_FIELD = () => ({
  id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  label: '',
  type: 'text', // text | textarea | number | checkbox | select
  required: false,
  options: [],
  helpText: '',
  order: 0,
});

const ServiceFormsManager = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState({
    id: null,
    name: '',
    description: '',
    category: 'General',
    isActive: true,
    fields: [],
  });

  const user = window.storage?.getUser?.();
  const isAdmin = user?.role?.toLowerCase?.() === 'admin';
  const [featureUnavailable, setFeatureUnavailable] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (!isAdmin) return;

    let cancelled = false;

    const loadTemplates = async () => {
      try {
        setLoading(true);
        const token = window.storage?.getToken?.();
        if (!token) {
          console.warn('ServiceFormsManager: No token found, cannot load templates');
          return;
        }
        const res = await fetch('/api/service-forms', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!res.ok) {
          const text = await res.text();
          console.error('ServiceFormsManager: Failed to load templates', res.status, text);
          // If the backend tells us the feature is unavailable (tables missing), switch
          // into a read-only "feature disabled" mode instead of just failing silently.
          try {
            const parsed = JSON.parse(text);
            const details = parsed?.error?.details || parsed?.details;
            if (details === 'SERVICE_FORMS_TABLE_MISSING') {
              setFeatureUnavailable(true);
              setTemplates([]);
              return;
            }
          } catch {
            // Ignore JSON parse errors and fall back to generic handling
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setTemplates(Array.isArray(data.templates) ? data.templates : []);
        }
      } catch (error) {
        console.error('ServiceFormsManager: Error loading templates', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTemplates();

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAdmin]);

  if (!isOpen || !isAdmin) {
    return null;
  }

  const resetEditor = () => {
    setSelected(null);
    setEditor({
      id: null,
      name: '',
      description: '',
      category: 'General',
      isActive: true,
      fields: [],
    });
  };

  const handleEditTemplate = (tpl) => {
    setSelected(tpl);
    setEditor({
      id: tpl.id,
      name: tpl.name || '',
      description: tpl.description || '',
      category: tpl.category || 'General',
      isActive: tpl.isActive !== false,
      fields: Array.isArray(tpl.fields)
        ? tpl.fields.map((f, idx) => ({
            ...f,
            order: typeof f.order === 'number' ? f.order : idx,
            options: Array.isArray(f.options) ? f.options : [],
          }))
        : [],
    });
  };

  const handleAddField = () => {
    setEditor((prev) => {
      const nextOrder =
        prev.fields.length === 0
          ? 0
          : Math.max(...prev.fields.map((f) => f.order || 0)) + 1;
      const field = { ...EMPTY_FIELD(), order: nextOrder };
      return { ...prev, fields: [...prev.fields, field] };
    });
  };

  const handleFieldChange = (fieldId, changes) => {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.map((f) =>
        f.id === fieldId ? { ...f, ...changes } : f
      ),
    }));
  };

  const handleRemoveField = (fieldId) => {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.filter((f) => f.id !== fieldId),
    }));
  };

  const handleSave = async () => {
    const token = window.storage?.getToken?.();
    if (!token) {
      alert('You must be logged in as an admin to save forms.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        name: editor.name || 'Untitled form',
        description: editor.description || '',
        category: editor.category || 'General',
        isActive: !!editor.isActive,
        fields: (editor.fields || []).map((f, idx) => ({
          id: f.id || `field_${idx}`,
          label: f.label || '',
          type: f.type || 'text',
          required: !!f.required,
          helpText: f.helpText || '',
          order: typeof f.order === 'number' ? f.order : idx,
          options: Array.isArray(f.options)
            ? f.options
            : typeof f.options === 'string'
            ? f.options
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean)
            : [],
        })),
      };

      const method = editor.id ? 'PATCH' : 'POST';
      const url = editor.id
        ? `/api/service-forms/${encodeURIComponent(editor.id)}`
        : '/api/service-forms';

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('ServiceFormsManager: Failed to save template', res.status, text);
        alert('Failed to save form. Please try again.');
        return;
      }

      const data = await res.json();
      const saved = data.template;

      setTemplates((prev) => {
        const list = Array.isArray(prev) ? [...prev] : [];
        const idx = list.findIndex((t) => t.id === saved.id);
        if (idx >= 0) {
          list[idx] = saved;
        } else {
          list.unshift(saved);
        }
        return list;
      });

      handleEditTemplate(saved);
    } catch (error) {
      console.error('ServiceFormsManager: Error saving template', error);
      alert(error.message || 'Failed to save form.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editor.id) return;
    if (!window.confirm('Delete this form? Existing jobcards that use it will keep their copies.')) {
      return;
    }
    const token = window.storage?.getToken?.();
    if (!token) {
      alert('You must be logged in as an admin to delete forms.');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`/api/service-forms/${encodeURIComponent(editor.id)}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('ServiceFormsManager: Failed to delete template', res.status, text);
        alert('Failed to delete form. Please try again.');
        return;
      }
      setTemplates((prev) =>
        Array.isArray(prev) ? prev.filter((t) => t.id !== editor.id) : []
      );
      resetEditor();
    } catch (error) {
      console.error('ServiceFormsManager: Error deleting template', error);
      alert(error.message || 'Failed to delete form.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      <div className="relative flex w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        {/* Left: list of templates */}
        <div className="w-64 border-r border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Service forms
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Reusable checklists for jobcards
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <i className="fa-solid fa-xmark text-sm" />
            </button>
          </div>

          {featureUnavailable && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-triangle-exclamation mt-0.5 text-[10px]" />
                <div>
                  <div className="font-semibold">Service forms not enabled</div>
                  <div className="mt-0.5">
                    The database for this environment does not yet include the tables required
                    for service forms and checklists. You can continue using job cards as normal,
                    but form templates will only be available after the migration is applied.
                  </div>
                </div>
              </div>
            </div>
          )}

          {!featureUnavailable && (
            <button
              type="button"
              onClick={resetEditor}
              className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-primary-700"
            >
              <i className="fa-solid fa-plus text-[11px]" />
              New form
            </button>
          )}

          <div className="space-y-1 overflow-y-auto text-xs">
            {loading && (
              <div className="py-4 text-center text-slate-500 dark:text-slate-400">
                Loading forms…
              </div>
            )}
            {!loading &&
              (templates || []).map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleEditTemplate(tpl)}
                  className={`flex w-full flex-col rounded-lg px-2 py-1.5 text-left transition ${
                    editor.id === tpl.id
                      ? 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-100'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <span className="text-[11px] font-semibold">{tpl.name}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {tpl.category || 'General'}
                  </span>
                </button>
              ))}
            {!loading && (!templates || templates.length === 0) && (
              <div className="py-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
                No forms yet. Create your first checklist.
              </div>
            )}
          </div>
        </div>

        {/* Right: editor */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {editor.id ? 'Edit form' : 'New form'}
                </h2>
                {editor.isActive ? (
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Inactive
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Configure questions once, then attach this form to any jobcard.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {editor.id && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                >
                  <i className="fa-regular fa-trash-can text-[10px]" />
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <span className="h-3 w-3 animate-spin rounded-full border-b-2 border-white" />
                )}
                <span>{editor.id ? 'Save changes' : 'Create form'}</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  Form name
                </label>
                <input
                  type="text"
                  value={editor.name}
                  onChange={(e) =>
                    setEditor((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Pre-service inspection"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    Category
                  </label>
                  <input
                    type="text"
                    value={editor.category}
                    onChange={(e) =>
                      setEditor((prev) => ({ ...prev, category: e.target.value }))
                    }
                    placeholder="e.g. Safety, Commissioning"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={editor.isActive}
                      onChange={(e) =>
                        setEditor((prev) => ({
                          ...prev,
                          isActive: e.target.checked,
                        }))
                      }
                      className="h-3 w-3 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                    />
                    Active
                  </label>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                Description / instructions
              </label>
              <textarea
                rows={2}
                value={editor.description}
                onChange={(e) =>
                  setEditor((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Short description visible to technicians when they open the form."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="mt-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Fields & checklist items
              </div>
              <button
                type="button"
                onClick={handleAddField}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <i className="fa-solid fa-plus text-[9px]" />
                Add question
              </button>
            </div>

            <div className="space-y-3">
              {(editor.fields || []).map((field) => (
                <div
                  key={field.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) =>
                        handleFieldChange(field.id, { label: e.target.value })
                      }
                      placeholder="Question or checklist item"
                      className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <select
                      value={field.type || 'text'}
                      onChange={(e) =>
                        handleFieldChange(field.id, { type: e.target.value })
                      }
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="text">Short text</option>
                      <option value="textarea">Long text</option>
                      <option value="number">Number</option>
                      <option value="checkbox">Yes / No</option>
                      <option value="select">Dropdown</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemoveField(field.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      <i className="fa-solid fa-trash text-[10px]" />
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto]">
                    <textarea
                      rows={2}
                      value={field.helpText || ''}
                      onChange={(e) =>
                        handleFieldChange(field.id, { helpText: e.target.value })
                      }
                      placeholder="Helper text or instructions for this field"
                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                        Options (for dropdown)
                      </label>
                      <input
                        type="text"
                        value={
                          Array.isArray(field.options)
                            ? field.options.join(', ')
                            : field.options || ''
                        }
                        onChange={(e) =>
                          handleFieldChange(field.id, {
                            options: e.target.value,
                          })
                        }
                        placeholder="Option 1, Option 2, Option 3"
                        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex items-end justify-end">
                      <label className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={!!field.required}
                          onChange={(e) =>
                            handleFieldChange(field.id, {
                              required: e.target.checked,
                            })
                          }
                          className="h-3 w-3 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600"
                        />
                        Required
                      </label>
                    </div>
                  </div>
                </div>
              ))}

              {(editor.fields || []).length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                  No questions added yet. Start by adding checklist items or form
                  fields.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

try {
  if (typeof window !== 'undefined') {
    window.ServiceFormsManager = ServiceFormsManager;
    console.log('✅ ServiceFormsManager registered on window');
  }
} catch (error) {
  console.error('❌ ServiceFormsManager: Error registering global component', error);
}

export default ServiceFormsManager;


