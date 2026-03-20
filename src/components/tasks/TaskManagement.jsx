const { useEffect, useMemo, useState, useCallback } = React;
const storage = window.storage;

const STATUS_OPTIONS = [
  { id: 'todo', label: 'To do' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' }
];

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'urgent'];

const normalizeStatus = (value) => {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'inprogress' || v === 'in progress') return 'in-progress';
  if (v === 'done' || v === 'complete' || v === 'finished') return 'completed';
  if (v === 'canceled') return 'cancelled';
  if (STATUS_OPTIONS.some((s) => s.id === v)) return v;
  return 'todo';
};

const statusLabel = (status) => STATUS_OPTIONS.find((s) => s.id === status)?.label || 'To do';

const emptyTaskForm = {
  title: '',
  description: '',
  status: 'todo',
  priority: 'medium',
  dueDate: '',
  listId: '',
  tagIds: [],
  checklist: [],
  newChecklistItem: ''
};

const TaskManagement = () => {
  const { isDark } = window.useTheme ? window.useTheme() : { isDark: false };
  const token = storage?.getToken?.();

  const [tasks, setTasks] = useState([]);
  const [lists, setLists] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewMode, setViewMode] = useState('kanban');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterListId, setFilterListId] = useState('all');
  const [filterTagId, setFilterTagId] = useState('all');

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({ ...emptyTaskForm });

  const [showListModal, setShowListModal] = useState(false);
  const [editingListId, setEditingListId] = useState(null);
  const [listForm, setListForm] = useState({ name: '', color: '#3B82F6', status: 'todo' });

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');

  const loadLists = useCallback(async () => {
    if (!token) return [];
    const response = await fetch('/api/user-task-lists', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Failed to load lists (${response.status})`);
    const payload = await response.json();
    const data = Array.isArray(payload?.data?.lists) ? payload.data.lists : [];
    return [...data].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [token]);

  const loadTasks = useCallback(async () => {
    if (!token) return [];
    const params = new URLSearchParams({
      includeTags: 'true',
      includeCategories: 'false',
      includeStats: 'false',
      limit: '500'
    });
    const response = await fetch(`/api/user-tasks?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Failed to load tasks (${response.status})`);
    const payload = await response.json();
    const data = Array.isArray(payload?.data?.tasks) ? payload.data.tasks : [];
    return data.map((task) => ({
      ...task,
      status: normalizeStatus(task.status),
      tags: Array.isArray(task.tags) ? task.tags : [],
      checklist: Array.isArray(task.checklist) ? task.checklist : []
    }));
  }, [token]);

  const loadTags = useCallback(async () => {
    if (!token) return [];
    const response = await fetch('/api/user-task-tags', { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload?.data?.tags) ? payload.data.tags : [];
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextLists, nextTasks, nextTags] = await Promise.all([loadLists(), loadTasks(), loadTags()]);
      setLists(nextLists);
      setTasks(nextTasks);
      setTags(nextTags);
    } catch (e) {
      console.error('TaskManagement refresh failed:', e);
      setError(e?.message || 'Failed to load task data.');
    } finally {
      setLoading(false);
    }
  }, [loadLists, loadTasks, loadTags]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    return tasks.reduce(
      (acc, task) => {
        const status = normalizeStatus(task.status);
        acc.total += 1;
        if (status === 'todo') acc.todo += 1;
        if (status === 'in-progress') acc.inProgress += 1;
        if (status === 'completed') acc.completed += 1;
        if (status === 'cancelled') acc.cancelled += 1;
        return acc;
      },
      { total: 0, todo: 0, inProgress: 0, completed: 0, cancelled: 0 }
    );
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (filterStatus !== 'all' && normalizeStatus(task.status) !== filterStatus) return false;
      if (filterPriority !== 'all' && String(task.priority || '').toLowerCase() !== filterPriority) return false;
      if (filterListId !== 'all' && String(task.listId || '') !== String(filterListId)) return false;
      if (filterTagId !== 'all' && !task.tags.some((tag) => String(tag.id) === String(filterTagId))) return false;
      if (!q) return true;
      return (
        String(task.title || '').toLowerCase().includes(q) ||
        String(task.description || '').toLowerCase().includes(q)
      );
    });
  }, [tasks, search, filterStatus, filterPriority, filterListId, filterTagId]);

  const kanbanColumns = useMemo(() => {
    return lists.map((list) => ({
      list,
      items: filteredTasks.filter((task) => String(task.listId || '') === String(list.id))
    }));
  }, [lists, filteredTasks]);

  const updateList = useCallback(async (listId, updates) => {
    if (!token) return;
    const response = await fetch(`/api/user-task-lists/${listId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error(`Failed to update list (${response.status})`);
  }, [token]);

  const reorderList = useCallback(async (listId, direction) => {
    const currentIndex = lists.findIndex((l) => String(l.id) === String(listId));
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= lists.length) return;
    const reordered = [...lists];
    const temp = reordered[currentIndex];
    reordered[currentIndex] = reordered[targetIndex];
    reordered[targetIndex] = temp;
    setLists(reordered.map((l, i) => ({ ...l, order: i })));
    try {
      await Promise.all(
        reordered.map((list, index) =>
          updateList(list.id, { order: index })
        )
      );
    } catch (e) {
      console.error('reorderList failed:', e);
      await refresh();
      window.alert('Could not reorder lists.');
    }
  }, [lists, updateList, refresh]);

  const saveList = useCallback(async () => {
    if (!token) return;
    const name = String(listForm.name || '').trim();
    if (!name) {
      window.alert('List name is required.');
      return;
    }
    setSaving(true);
    try {
      if (editingListId) {
        await updateList(editingListId, {
          name,
          color: listForm.color || '#3B82F6',
          status: normalizeStatus(listForm.status)
        });
      } else {
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
      }
      setShowListModal(false);
      setEditingListId(null);
      setListForm({ name: '', color: '#3B82F6', status: 'todo' });
      await refresh();
    } catch (e) {
      console.error('saveList failed:', e);
      window.alert(e?.message || 'Could not save list.');
    } finally {
      setSaving(false);
    }
  }, [token, listForm, editingListId, refresh, updateList]);

  const openCreateTask = () => {
    setEditingTaskId(null);
    setTaskForm({ ...emptyTaskForm, listId: lists[0]?.id || '' });
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
      listId: task.listId || '',
      tagIds: task.tags.map((tag) => tag.id),
      checklist: Array.isArray(task.checklist) ? task.checklist : [],
      newChecklistItem: ''
    });
    setShowTaskModal(true);
  };

  const toggleTag = (tagId, checked) => {
    setTaskForm((prev) => {
      const next = new Set(prev.tagIds);
      if (checked) next.add(tagId);
      else next.delete(tagId);
      return { ...prev, tagIds: Array.from(next) };
    });
  };

  const addChecklistItem = () => {
    const text = String(taskForm.newChecklistItem || '').trim();
    if (!text) return;
    setTaskForm((prev) => ({
      ...prev,
      checklist: [...prev.checklist, { id: `cl_${Date.now()}`, text, completed: false }],
      newChecklistItem: ''
    }));
  };

  const toggleChecklistItem = (itemId) => {
    setTaskForm((prev) => ({
      ...prev,
      checklist: prev.checklist.map((item) => (item.id === itemId ? { ...item, completed: !item.completed } : item))
    }));
  };

  const removeChecklistItem = (itemId) => {
    setTaskForm((prev) => ({ ...prev, checklist: prev.checklist.filter((item) => item.id !== itemId) }));
  };

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
        priority: String(taskForm.priority || 'medium'),
        dueDate: taskForm.dueDate || null,
        listId: taskForm.listId || null,
        tagIds: taskForm.tagIds || [],
        checklist: taskForm.checklist || []
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
      setTaskForm({ ...emptyTaskForm });
      await refresh();
    } catch (e) {
      console.error('saveTask failed:', e);
      window.alert(e?.message || 'Could not save task.');
    } finally {
      setSaving(false);
    }
  }, [token, taskForm, editingTaskId, refresh]);

  const deleteTask = useCallback(async (taskId) => {
    if (!token || !window.confirm('Delete this task?')) return;
    try {
      const response = await fetch(`/api/user-tasks/${taskId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error(`Failed to delete task (${response.status})`);
      await refresh();
    } catch (e) {
      console.error('deleteTask failed:', e);
      window.alert(e?.message || 'Could not delete task.');
    }
  }, [token, refresh]);

  const deleteList = useCallback(async (listId) => {
    if (!token || !window.confirm('Delete this list?')) return;
    try {
      const response = await fetch(`/api/user-task-lists/${listId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
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

  const moveTask = useCallback(async (task, list) => {
    if (!token || !task?.id || !list?.id) return;
    const optimistic = tasks.map((t) =>
      t.id === task.id ? { ...t, listId: list.id, status: normalizeStatus(list.status) } : t
    );
    setTasks(optimistic);
    try {
      const response = await fetch(`/api/user-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listId: list.id, status: normalizeStatus(list.status) })
      });
      if (!response.ok) throw new Error(`Move failed (${response.status})`);
    } catch (e) {
      console.error('moveTask failed:', e);
      await refresh();
      window.alert('Could not move task.');
    }
  }, [token, tasks, refresh]);

  const toggleTaskCompletion = useCallback(async (task) => {
    if (!token) return;
    const nextStatus = normalizeStatus(task.status) === 'completed' ? 'todo' : 'completed';
    const optimistic = tasks.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t));
    setTasks(optimistic);
    try {
      const response = await fetch(`/api/user-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: nextStatus, completedDate: nextStatus === 'completed' ? new Date().toISOString() : null })
      });
      if (!response.ok) throw new Error(`Failed to toggle completion (${response.status})`);
    } catch (e) {
      console.error('toggleTaskCompletion failed:', e);
      await refresh();
    }
  }, [token, tasks, refresh]);

  const createTag = useCallback(async () => {
    if (!token) return;
    const name = String(newTagName || '').trim();
    if (!name) return;
    try {
      const response = await fetch('/api/user-task-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, color: newTagColor || '#3B82F6' })
      });
      if (!response.ok) throw new Error(`Failed to create tag (${response.status})`);
      const nextTags = await loadTags();
      setTags(nextTags);
      setNewTagName('');
      setNewTagColor('#3B82F6');
    } catch (e) {
      console.error('createTag failed:', e);
      window.alert(e?.message || 'Could not create tag.');
    }
  }, [token, newTagName, newTagColor, loadTags]);

  const openCreateList = () => {
    setEditingListId(null);
    setListForm({ name: '', color: '#3B82F6', status: 'todo' });
    setShowListModal(true);
  };

  const openEditList = (list) => {
    setEditingListId(list.id);
    setListForm({ name: list.name || '', color: list.color || '#3B82F6', status: normalizeStatus(list.status) });
    setShowListModal(true);
  };

  const clearFilters = () => {
    setSearch('');
    setFilterStatus('all');
    setFilterPriority('all');
    setFilterListId('all');
    setFilterTagId('all');
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>My Tasks</h2>
          <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            User task manager with comprehensive multi-list workflows.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openCreateList} className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            <i className="fas fa-columns mr-2" />Add list
          </button>
          <button type="button" onClick={openCreateTask} className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
            <i className="fas fa-plus mr-2" />New task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Total</p>
          <p className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{stats.total}</p>
        </div>
        <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>To do</p>
          <p className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{stats.todo}</p>
        </div>
        <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>In progress</p>
          <p className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{stats.inProgress}</p>
        </div>
        <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Completed</p>
          <p className={`text-xl font-semibold ${isDark ? 'text-green-400' : 'text-green-700'}`}>{stats.completed}</p>
        </div>
        <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Cancelled</p>
          <p className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{stats.cancelled}</p>
        </div>
      </div>

      <div className={`rounded-lg border p-3 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          <input
            type="text"
            placeholder="Search title/description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`px-3 py-2 rounded border md:col-span-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
            <option value="all">All statuses</option>
            {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
            <option value="all">All priorities</option>
            {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filterListId} onChange={(e) => setFilterListId(e.target.value)} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
            <option value="all">All lists</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={filterTagId} onChange={(e) => setFilterTagId(e.target.value)} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
            <option value="all">All tags</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex rounded border overflow-hidden">
            <button type="button" onClick={() => setViewMode('kanban')} className={`flex-1 px-2 py-2 text-sm ${viewMode === 'kanban' ? 'bg-blue-600 text-white' : (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700')}`}>Kanban</button>
            <button type="button" onClick={() => setViewMode('list')} className={`flex-1 px-2 py-2 text-sm ${viewMode === 'list' ? 'bg-blue-600 text-white' : (isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700')}`}>List</button>
          </div>
        </div>
        <div className="pt-2 flex justify-end">
          <button type="button" onClick={clearFilters} className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'} underline`}>
            Clear filters
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{error}</div> : null}

      {loading ? (
        <div className={`rounded-lg border p-8 text-center ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}>
          Loading tasks...
        </div>
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
                  <button type="button" onClick={() => reorderList(list.id, -1)} className="text-gray-500 hover:text-gray-700" title="Move list left"><i className="fas fa-arrow-left" /></button>
                  <button type="button" onClick={() => reorderList(list.id, 1)} className="text-gray-500 hover:text-gray-700" title="Move list right"><i className="fas fa-arrow-right" /></button>
                  <button type="button" onClick={() => openEditList(list)} className="text-blue-500 hover:text-blue-700" title="Edit list"><i className="fas fa-edit" /></button>
                  <button type="button" onClick={() => deleteList(list.id)} className="text-red-500 hover:text-red-700" title="Delete list"><i className="fas fa-trash" /></button>
                </div>
              </div>
              <div className="space-y-2 min-h-[130px]">
                {items.map((task) => (
                  <div key={task.id} draggable onDragStart={(e) => e.dataTransfer.setData('taskId', String(task.id))} className={`rounded border p-3 ${isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className={`font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{task.title}</p>
                        <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{statusLabel(normalizeStatus(task.status))} - {task.priority || 'medium'}</p>
                        {task.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {task.tags.slice(0, 3).map((tag) => (
                              <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: tag.color || '#3B82F6' }}>
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => toggleTaskCompletion(task)} className={normalizeStatus(task.status) === 'completed' ? 'text-green-500' : 'text-gray-400 hover:text-green-500'} title="Toggle complete"><i className="fas fa-check-circle" /></button>
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
                <th className="text-left px-3 py-2">Tags</th>
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
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {task.tags.slice(0, 2).map((tag) => (
                          <span key={tag.id} className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: tag.color || '#3B82F6' }}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => toggleTaskCompletion(task)} className={normalizeStatus(task.status) === 'completed' ? 'text-green-500 mr-3' : 'text-gray-400 hover:text-green-500 mr-3'}>
                        <i className="fas fa-check-circle" />
                      </button>
                      <button type="button" onClick={() => openEditTask(task)} className="text-blue-500 hover:text-blue-700 mr-3"><i className="fas fa-edit" /></button>
                      <button type="button" onClick={() => deleteTask(task.id)} className="text-red-500 hover:text-red-700"><i className="fas fa-trash" /></button>
                    </td>
                  </tr>
                );
              })}
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`px-3 py-8 text-center ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>No tasks found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={deleteAllLists} className="text-sm text-red-600 hover:text-red-700">
          Delete all lists
        </button>
      </div>

      {showTaskModal ? (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-lg border p-4 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>{editingTaskId ? 'Edit task' : 'Create task'}</h3>
            <div className="space-y-3">
              <input type="text" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              <textarea value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} rows={4} placeholder="Description" className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />

              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <select value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
                <select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={taskForm.listId} onChange={(e) => setTaskForm((p) => ({ ...p, listId: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  <option value="">No list</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <input type="datetime-local" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              </div>

              <div className={`rounded border p-3 ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Tags</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map((tag) => (
                    <label key={tag.id} className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={taskForm.tagIds.includes(tag.id)} onChange={(e) => toggleTag(tag.id, e.target.checked)} />
                      <span className="px-2 py-0.5 rounded text-white" style={{ backgroundColor: tag.color || '#3B82F6' }}>{tag.name}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newTagName} onChange={(e) => setNewTagName(e.target.value)} placeholder="New tag name" className={`flex-1 px-2 py-1 rounded border ${isDark ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300'}`} />
                  <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} className="w-12 h-9 rounded border" />
                  <button type="button" onClick={createTag} className="px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">Add tag</button>
                </div>
              </div>

              <div className={`rounded border p-3 ${isDark ? 'border-gray-600 bg-gray-700' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`text-sm font-medium mb-2 ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>Checklist</p>
                <div className="space-y-2 mb-2">
                  {taskForm.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <input type="checkbox" checked={Boolean(item.completed)} onChange={() => toggleChecklistItem(item.id)} />
                      <span className={`text-sm ${item.completed ? 'line-through opacity-70' : ''}`}>{item.text}</span>
                      <button type="button" onClick={() => removeChecklistItem(item.id)} className="text-red-500 ml-auto"><i className="fas fa-trash" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={taskForm.newChecklistItem}
                    onChange={(e) => setTaskForm((prev) => ({ ...prev, newChecklistItem: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                    placeholder="Add checklist item"
                    className={`flex-1 px-2 py-1 rounded border ${isDark ? 'bg-gray-600 border-gray-500 text-white' : 'bg-white border-gray-300'}`}
                  />
                  <button type="button" onClick={addChecklistItem} className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Add</button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className={`px-3 py-2 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}>Cancel</button>
                <button type="button" disabled={saving} onClick={saveTask} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showListModal ? (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-4">
          <div className={`w-full max-w-md rounded-lg border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-gray-900'}`}>{editingListId ? 'Edit list' : 'Create list'}</h3>
            <div className="space-y-3">
              <input type="text" value={listForm.name} onChange={(e) => setListForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="List name" className={`w-full px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`} />
              <div className="grid grid-cols-2 gap-2">
                <input type="color" value={listForm.color} onChange={(e) => setListForm((prev) => ({ ...prev, color: e.target.value }))} className="w-full h-10 rounded border" />
                <select value={listForm.status} onChange={(e) => setListForm((prev) => ({ ...prev, status: e.target.value }))} className={`px-3 py-2 rounded border ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}>
                  {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowListModal(false)} className={`px-3 py-2 rounded ${isDark ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-700'}`}>Cancel</button>
                <button type="button" disabled={saving} onClick={saveList} className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save list'}
                </button>
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

