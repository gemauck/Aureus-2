const { useEffect, useMemo, useState, useCallback } = React;
const storage = window.storage;

const STATUS_OPTIONS = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

const normalizeStatus = (value) => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'inprogress' || v === 'in progress') return 'in-progress';
  if (v === 'done' || v === 'complete' || v === 'finished') return 'completed';
  if (v === 'canceled') return 'cancelled';
  if (STATUS_OPTIONS.some((s) => s.id === v)) return v;
  return 'todo';
};

const statusLabel = (status) => STATUS_OPTIONS.find((s) => s.id === status)?.label || 'To do';

const TaskManagement = () => {
  const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
  const [tasks, setTasks] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('kanban');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterListId, setFilterListId] = useState('all');

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    dueDate: '',
    listId: ''
  });

  const [showListModal, setShowListModal] = useState(false);
  const [listForm, setListForm] = useState({ name: '', color: '#3B82F6', status: 'todo' });
  const [saving, setSaving] = useState(false);

  const token = storage?.getToken?.();

  const loadLists = useCallback(async () => {
    if (!token) return [];
    const response = await fetch('/api/user-task-lists', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Failed to load lists (${response.status})`);
    const payload = await response.json();
    return Array.isArray(payload?.data?.lists) ? payload.data.lists : [];
  }, [token]);

  const loadTasks = useCallback(async () => {
    if (!token) return [];
    const params = new URLSearchParams({
      includeTags: 'false',
      includeCategories: 'false',
      includeStats: 'false',
      limit: '500'
    });
    const response = await fetch(`/api/user-tasks?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Failed to load tasks (${response.status})`);
    const payload = await response.json();
    const fromApi = Array.isArray(payload?.data?.tasks) ? payload.data.tasks : [];
    return fromApi.map((t) => ({ ...t, status: normalizeStatus(t.status) }));
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextLists, nextTasks] = await Promise.all([loadLists(), loadTasks()]);
      setLists([...(nextLists || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setTasks(nextTasks || []);
    } catch (e) {
      console.error('TaskManagement refresh failed:', e);
      setError(e?.message || 'Failed to load task data.');
    } finally {
      setLoading(false);
    }
  }, [loadLists, loadTasks]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterStatus !== 'all' && normalizeStatus(t.status) !== filterStatus) return false;
      if (filterListId !== 'all' && String(t.listId || '') !== String(filterListId)) return false;
      if (!q) return true;
      return (
        String(t.title || '').toLowerCase().includes(q) ||
        String(t.description || '').toLowerCase().includes(q)
      );
    });
  }, [tasks, search, filterStatus, filterListId]);

  const kanbanColumns = useMemo(() => {
    return lists.map((list) => ({
      list,
      items: filteredTasks.filter((t) => String(t.listId || '') === String(list.id))
    }));
  }, [lists, filteredTasks]);

  const saveTask = useCallback(async () => {
    if (!token) return;
    const title = String(taskForm.title || '').trim();
    if (!title) {
      window.alert('Task title is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        description: String(taskForm.description || ''),
        status: normalizeStatus(taskForm.status),
        priority: taskForm.priority || 'medium',
        dueDate: taskForm.dueDate || null,
        listId: taskForm.listId || null
      };
      const isEditing = Boolean(editingTaskId);
      const response = await fetch(isEditing ? `/api/user-tasks/${editingTaskId}` : '/api/user-tasks', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`Failed to save task (${response.status})`);
      setShowTaskModal(false);
      setEditingTaskId(null);
      setTaskForm({ title: '', description: '', status: 'todo', priority: 'medium', dueDate: '', listId: '' });
      await refresh();
    } catch (e) {
      console.error('saveTask failed:', e);
      window.alert(e?.message || 'Could not save task.');
    } finally {
      setSaving(false);
    }
  }, [token, taskForm, editingTaskId, refresh]);

  const saveList = useCallback(async () => {
    if (!token) return;
    const name = String(listForm.name || '').trim();
    if (!name) {
      window.alert('List name is required.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/user-task-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name,
          color: listForm.color || '#3B82F6',
          status: normalizeStatus(listForm.status)
        })
      });
      if (!response.ok) throw new Error(`Failed to create list (${response.status})`);
      setShowListModal(false);
      setListForm({ name: '', color: '#3B82F6', status: 'todo' });
      await refresh();
    } catch (e) {
      console.error('saveList failed:', e);
      window.alert(e?.message || 'Could not create list.');
    } finally {
      setSaving(false);
    }
  }, [token, listForm, refresh]);

  const deleteTask = useCallback(async (id) => {
    if (!token || !window.confirm('Delete this task?')) return;
    try {
      const response = await fetch(`/api/user-tasks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Failed to delete task (${response.status})`);
      await refresh();
    } catch (e) {
      console.error('deleteTask failed:', e);
      window.alert(e?.message || 'Could not delete task.');
    }
  }, [token, refresh]);

  const deleteList = useCallback(async (id) => {
    if (!token || !window.confirm('Delete this list? Tasks will move to another list where possible.')) return;
    try {
      const response = await fetch(`/api/user-task-lists/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok && response.status !== 404) throw new Error(`Failed to delete list (${response.status})`);
      await refresh();
    } catch (e) {
      console.error('deleteList failed:', e);
      window.alert(e?.message || 'Could not delete list.');
    }
  }, [token, refresh]);

  const deleteAllLists = useCallback(async () => {
    if (!token || !window.confirm('Delete ALL lists?')) return;
    try {
      const response = await fetch('/api/user-task-lists?all=true', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Failed to delete all lists (${response.status})`);
      await refresh();
    } catch (e) {
      console.error('deleteAllLists failed:', e);
      window.alert(e?.message || 'Could not delete all lists.');
    }
  }, [token, refresh]);

  const moveTask = useCallback(async (task, nextList) => {
    if (!token || !task?.id || !nextList?.id) return;
    const optimistic = tasks.map((t) => (t.id === task.id ? { ...t, listId: nextList.id, status: normalizeStatus(nextList.status) } : t));
    setTasks(optimistic);
    try {
      const response = await fetch(`/api/user-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listId: nextList.id, status: normalizeStatus(nextList.status) })
      });
      if (!response.ok) throw new Error(`Move failed (${response.status})`);
    } catch (e) {
      console.error('moveTask failed:', e);
      await refresh();
      window.alert('Could not move task.');
    }
  }, [token, tasks, refresh]);

  const openCreateTask = () => {
    setEditingTaskId(null);
    setTaskForm({
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: '',
      listId: lists[0]?.id || ''
    });
    setShowTaskModal(true);
  };

  const openEditTask = (task) => {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title || '',
      description: task.description || '',
      status: normalizeStatus(task.status),
      priority: task.priority || 'medium',
      dueDate: task.dueDate ? String(task.dueDate).slice(0, 16) : '',
      listId: task.listId || ''
    });
    setShowTaskModal(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>My Tasks</h2>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Personal task manager with custom lists.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowListModal(true)} className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            <i className="fas fa-columns mr-2" />Add list
          </button>
          <button type="button" onClick={openCreateTask} className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <i className="fas fa-plus mr-2" />New task
          </button>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`px-3 py-2 rounded border md:col-span-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={filterListId} onChange={(e) => setFilterListId(e.target.value)} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
            <option value="all">All lists</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="flex rounded border overflow-hidden">
            <button type="button" onClick={() => setViewMode('kanban')} className={`flex-1 px-2 py-2 text-sm ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700')}`}>Kanban</button>
            <button type="button" onClick={() => setViewMode('list')} className={`flex-1 px-2 py-2 text-sm ${viewMode === 'list' ? 'bg-blue-600 text-white' : (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700')}`}>List</button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div> : null}

      {loading ? (
        <div className={`rounded-lg border p-8 text-center ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>Loading tasks...</div>
      ) : viewMode === 'kanban' ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4" style={lists.length > 0 ? { gridTemplateColumns: `repeat(${lists.length}, minmax(220px, 1fr))` } : undefined}>
          {kanbanColumns.map(({ list, items }) => (
            <div
              key={list.id}
              className={`${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-lg border p-3`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const taskId = e.dataTransfer.getData('taskId');
                const task = tasks.find((t) => String(t.id) === String(taskId));
                if (task) moveTask(task, list);
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <h3 className={`font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{list.name || 'Unnamed'}</h3>
                  <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{statusLabel(normalizeStatus(list.status))}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-xs px-2 py-1 rounded ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>{items.length}</span>
                  <button type="button" onClick={() => deleteList(list.id)} className="text-red-500 hover:text-red-700" title="Delete list">
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>
              <div className="space-y-2 min-h-[120px]">
                {items.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('taskId', String(task.id))}
                    className={`rounded border p-3 cursor-move ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{task.title}</p>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{statusLabel(normalizeStatus(task.status))}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => openEditTask(task)} className="text-blue-500 hover:text-blue-700"><i className="fas fa-edit" /></button>
                        <button type="button" onClick={() => deleteTask(task.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {items.length === 0 ? <p className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>Drop tasks here.</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-lg border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <table className="w-full text-sm">
            <thead className={isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-50 text-gray-700'}>
              <tr>
                <th className="text-left px-3 py-2">Task</th>
                <th className="text-left px-3 py-2">List</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Priority</th>
                <th className="text-right px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((task) => {
                const list = lists.find((l) => String(l.id) === String(task.listId));
                return (
                  <tr key={task.id} className={isDark ? 'border-t border-gray-700' : 'border-t border-gray-200'}>
                    <td className="px-3 py-2">{task.title}</td>
                    <td className="px-3 py-2">{list?.name || '-'}</td>
                    <td className="px-3 py-2">{statusLabel(normalizeStatus(task.status))}</td>
                    <td className="px-3 py-2 capitalize">{task.priority || 'medium'}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => openEditTask(task)} className="text-blue-500 hover:text-blue-700 mr-3"><i className="fas fa-edit" /></button>
                      <button type="button" onClick={() => deleteTask(task.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash" /></button>
                    </td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`px-3 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No tasks found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={deleteAllLists} className="text-sm text-red-600 hover:text-red-700">Delete all lists</button>
      </div>

      {showTaskModal ? (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
          <div className={`w-full max-w-xl rounded-lg border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>{editingTaskId ? 'Edit task' : 'Create task'}</h3>
            <div className="space-y-3">
              <input type="text" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} rows={4} placeholder="Description" className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
                <select value={taskForm.listId} onChange={(e) => setTaskForm((p) => ({ ...p, listId: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  <option value="">No list</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input type="datetime-local" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className={`px-3 py-2 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}>Cancel</button>
                <button type="button" disabled={saving} onClick={saveTask} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save task'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showListModal ? (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-lg border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>Create list</h3>
            <div className="space-y-3">
              <input type="text" value={listForm.name} onChange={(e) => setListForm((p) => ({ ...p, name: e.target.value }))} placeholder="List name" className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              <div className="grid grid-cols-2 gap-2">
                <input type="color" value={listForm.color} onChange={(e) => setListForm((p) => ({ ...p, color: e.target.value }))} className="w-full h-10 rounded border" />
                <select value={listForm.status} onChange={(e) => setListForm((p) => ({ ...p, status: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowListModal(false)} className={`px-3 py-2 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}>Cancel</button>
                <button type="button" disabled={saving} onClick={saveList} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save list'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

window.TaskManagement = TaskManagement;
window.dispatchEvent(new CustomEvent('taskManagementComponentReady'));

