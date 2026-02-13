// Customer Engagement Mandate detail modal with proposal workflow
// Used under Teams > Business Development
const { useState, useEffect } = React;

const SERVICE_OPTIONS = [
  'Fuel Management Services',
  'Asset Tracking',
  'Diesel Refund Services',
  'Historical Audit Services'
];

const DEFAULT_STAGES = [
  { name: 'Create Site Inspection Document', department: 'Business Development', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Conduct site visit / input to Site Inspection', department: 'Technical', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Comments on work loading requirements', department: 'Data', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Comments on time allocations', department: 'Support', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Relevant comments / compliance', department: 'Compliance', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Creates proposal from template', department: 'Business Development', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Reviews proposal against Site Inspection', department: 'Operations Manager', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Price proposal', department: 'Commercial', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' },
  { name: 'Final Approval', department: 'CEO', assignee: '', assigneeId: '', assigneeEmail: '', status: 'pending', comments: [], rejectedBy: null, rejectedAt: null, rejectedReason: '' }
];

const EngagementMandateDetailModal = ({ mandate: initialMandate, onClose, onSave }) => {
  const [mandate, setMandate] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [expandedStage, setExpandedStage] = useState(null);
  const [stageCommentInput, setStageCommentInput] = useState({});

  let isDark = false;
  try {
    if (window.useTheme && typeof window.useTheme === 'function') {
      const theme = window.useTheme();
      isDark = theme?.isDark || false;
    } else {
      isDark = localStorage.getItem('abcotronics_theme') === 'dark';
    }
  } catch (e) {
    isDark = false;
  }

  useEffect(() => {
    if (initialMandate) {
      setMandate({
        ...initialMandate,
        workflowStages: Array.isArray(initialMandate.workflowStages) ? initialMandate.workflowStages : (typeof initialMandate.workflowStages === 'string' && initialMandate.workflowStages ? (() => { try { return JSON.parse(initialMandate.workflowStages); } catch (_) { return DEFAULT_STAGES; } })() : DEFAULT_STAGES),
        servicesRequired: Array.isArray(initialMandate.servicesRequired) ? initialMandate.servicesRequired : (typeof initialMandate.servicesRequired === 'string' && initialMandate.servicesRequired ? (() => { try { return JSON.parse(initialMandate.servicesRequired); } catch (_) { return []; } })() : [])
      });
    } else {
      setMandate({
        clientName: '',
        siteName: '',
        dateOfVisit: '',
        typeOfOperation: '',
        siteLocation: '',
        servicesRequired: [],
        status: 'draft',
        clientId: null,
        opportunityId: null,
        workflowStages: DEFAULT_STAGES.map(s => ({ ...s }))
      });
    }
  }, [initialMandate]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const token = window.storage?.getToken?.();
        if (!token) return;
        const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setAllUsers(data.data?.users || data.users || []);
        }
      } catch (err) {
        console.warn('EngagementMandateDetailModal: failed to load users', err);
      }
    };
    loadUsers();
  }, []);

  const update = (updates) => {
    if (!mandate) return;
    setMandate({ ...mandate, ...updates });
  };

  const updateStage = (index, stageUpdates) => {
    if (!mandate || !mandate.workflowStages) return;
    const stages = [...mandate.workflowStages];
    if (stages[index]) stages[index] = { ...stages[index], ...stageUpdates };
    setMandate({ ...mandate, workflowStages: stages });
  };

  const toggleService = (service) => {
    if (!mandate) return;
    const list = Array.isArray(mandate.servicesRequired) ? [...mandate.servicesRequired] : [];
    const idx = list.indexOf(service);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(service);
    setMandate({ ...mandate, servicesRequired: list });
  };

  const addStageComment = (stageIndex) => {
    const text = (stageCommentInput[stageIndex] || '').trim();
    if (!text) return;
    const user = window.storage?.getUserInfo?.() || window.storage?.getUser?.() || {};
    const comment = {
      text,
      author: user.name || user.email || 'User',
      authorId: user.id || '',
      createdAt: new Date().toISOString()
    };
    const stages = [...(mandate.workflowStages || [])];
    if (stages[stageIndex]) {
      stages[stageIndex] = {
        ...stages[stageIndex],
        comments: [...(stages[stageIndex].comments || []), comment]
      };
      setMandate({ ...mandate, workflowStages: stages });
      setStageCommentInput({ ...stageCommentInput, [stageIndex]: '' });
    }
  };

  const setStageStatus = (stageIndex, status) => {
    updateStage(stageIndex, { status });
  };

  const setStageAssignee = (stageIndex, user) => {
    updateStage(stageIndex, {
      assignee: user?.name || '',
      assigneeId: user?.id || '',
      assigneeEmail: user?.email || ''
    });
  };

  const handleSave = async () => {
    if (!mandate) return;
    if (!(mandate.clientName || '').trim()) {
      alert('Client name is required.');
      return;
    }
    setSaving(true);
    try {
      await onSave(mandate);
      onClose();
    } catch (err) {
      console.error('Save mandate error:', err);
      alert(err?.message || 'Failed to save mandate.');
    } finally {
      setSaving(false);
    }
  };

  if (!mandate) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 overflow-y-auto">
      <div className={`${isDark ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8`}>
        <div className={`sticky top-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-6 py-4 flex justify-between items-center z-10`}>
          <h2 className={`text-xl font-bold ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
            {mandate.id ? 'Edit engagement mandate' : 'New engagement mandate'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} text-2xl`}
            aria-label="Close"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Header fields */}
          <section>
            <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>General information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Client name *</label>
                <input
                  type="text"
                  value={mandate.clientName || ''}
                  onChange={(e) => update({ clientName: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                  placeholder="e.g. African Rainbow Minerals - Bokoni Platinum"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Site name</label>
                <input
                  type="text"
                  value={mandate.siteName || ''}
                  onChange={(e) => update({ siteName: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                  placeholder="e.g. Bokoni Platinum (PTY) Ltd"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Date of visit</label>
                <input
                  type="text"
                  value={mandate.dateOfVisit || ''}
                  onChange={(e) => update({ dateOfVisit: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                  placeholder="DD/MM/YYYY or TBC"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Type of operation</label>
                <input
                  type="text"
                  value={mandate.typeOfOperation || ''}
                  onChange={(e) => update({ typeOfOperation: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                  placeholder="e.g. Underground Platinum Group Metals"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Site location</label>
                <input
                  type="text"
                  value={mandate.siteLocation || ''}
                  onChange={(e) => update({ siteLocation: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                  placeholder="Address or coordinates"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Services required</label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_OPTIONS.map((s) => (
                    <label key={s} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer ${(mandate.servicesRequired || []).includes(s) ? (isDark ? 'bg-primary-900/40 border-primary-600 text-primary-200' : 'bg-primary-50 border-primary-500 text-primary-700') : (isDark ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-600')}`}>
                      <input
                        type="checkbox"
                        checked={(mandate.servicesRequired || []).includes(s)}
                        onChange={() => toggleService(s)}
                        className="rounded"
                      />
                      <span className="text-sm">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Status</label>
                <select
                  value={mandate.status || 'draft'}
                  onChange={(e) => update({ status: e.target.value })}
                  className={`w-full px-3 py-2 border rounded-lg ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                >
                  <option value="draft">Draft</option>
                  <option value="in_progress">In progress</option>
                  <option value="won">Won</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
            </div>
          </section>

          {/* Proposal workflow */}
          <section>
            <h3 className={`text-sm font-semibold mb-3 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>Proposal workflow</h3>
            <div className="space-y-2">
              {(mandate.workflowStages || []).map((stage, idx) => (
                <div
                  key={idx}
                  className={`border rounded-xl overflow-hidden ${isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                >
                  <div
                    className="flex flex-wrap items-center gap-2 p-3 cursor-pointer"
                    onClick={() => setExpandedStage(expandedStage === idx ? null : idx)}
                  >
                    <span className={`font-medium text-sm ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>{stage.name}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'}`}>{stage.department}</span>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      stage.status === 'reviewed' ? (isDark ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800') :
                      stage.status === 'rejected' ? (isDark ? 'bg-red-900/50 text-red-300' : 'bg-red-100 text-red-800') :
                      stage.status === 'in_progress' ? (isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-800') :
                      (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-600')
                    }`}>
                      {stage.status === 'in_progress' ? 'In progress' : (stage.status || 'pending')}
                    </span>
                    {stage.assignee ? <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{stage.assignee}</span> : null}
                    <i className={`fas fa-chevron-${expandedStage === idx ? 'up' : 'down'} ml-auto text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
                  </div>
                  {expandedStage === idx && (
                    <div className={`px-3 pb-3 pt-0 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Assignee</label>
                          <select
                            value={stage.assigneeId || ''}
                            onChange={(e) => {
                              const id = e.target.value;
                              const u = allUsers.find((x) => x.id === id);
                              setStageAssignee(idx, u || {});
                            }}
                            className={`w-full px-2 py-1.5 text-sm border rounded ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">— Select —</option>
                            {allUsers.map((u) => (
                              <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Status</label>
                          <select
                            value={stage.status || 'pending'}
                            onChange={(e) => setStageStatus(idx, e.target.value)}
                            className={`w-full px-2 py-1.5 text-sm border rounded ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="pending">Pending</option>
                            <option value="in_progress">In progress</option>
                            <option value="reviewed">Reviewed</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <label className={`block text-xs font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Comments</label>
                        {(stage.comments || []).map((c, i) => (
                          <div key={i} className={`text-xs mb-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                            <strong>{c.author}</strong>: {c.text}
                          </div>
                        ))}
                        <div className="flex gap-2 mt-2">
                          <input
                            type="text"
                            value={stageCommentInput[idx] || ''}
                            onChange={(e) => setStageCommentInput({ ...stageCommentInput, [idx]: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && addStageComment(idx)}
                            placeholder="Add a comment..."
                            className={`flex-1 px-2 py-1.5 text-sm border rounded ${isDark ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); addStageComment(idx); }}
                            className="px-3 py-1.5 text-sm rounded bg-primary-600 text-white hover:bg-primary-700"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className={`sticky bottom-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-t px-6 py-4 flex justify-end gap-2`}>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-lg ${isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-100'}`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

window.EngagementMandateDetailModal = EngagementMandateDetailModal;
